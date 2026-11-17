/*
  v1.20.0 วาดทายศัพท์ (Draw & Guess) — ห้อง 2–8 คน ผลัดกันวาด ทายเป็นภาษาอังกฤษ
  - ห้อง/ภาพวาดอยู่ในหน่วยความจำ (เซิร์ฟเวอร์เดียว เหมือนห้องแข่งเดิม rooms.js / Ranked ทีม) · จบเกมเก็บแค่สรุปคะแนน (draw_games)
  - เซิร์ฟเวอร์เป็นผู้ตัดสินทั้งหมด: คำที่วาด ส่งให้ "คนวาด" คนเดียว · คนอื่นเห็นแค่ _ _ _ + ตัวใบ้ที่เปิดตามเวลา · ตรวจคำทายที่เซิร์ฟเวอร์
  - คำทายที่ถูก = ไม่แสดงให้คนอื่นเห็น (กันลอก) · คำทายอื่นผ่าน utils/chatFilter (ข้อมูลติดต่อ/ลิงก์ = ไม่ส่ง · คำหยาบ = ปิด *)
  - ความปลอดภัย: บล็อกกัน = อยู่ห้องเดียวกันไม่ได้ · ถูกปิดแชท = ทายได้แต่ข้อความไม่ถูกส่งต่อ · เจ้าของห้องเตะได้ (เข้าซ้ำไม่ได้)
    รายงานภาพวาด = เก็บเส้นที่วาดขณะนั้นเป็นหลักฐาน (draw_report_evidence) ให้ผู้ดูแลตรวจ · ภาพวาดอื่นไม่ถูกเก็บ
  - EXP: ทายถูก / คนวาดได้ตามจำนวนคนที่ทายถูก / จบเกม · เพดานรวม DAILY_CAP ต่อวัน (reason = 'draw') กันเพื่อนกันปั๊ม
  - คำศัพท์: data/draw/words.json (อ้างอิง senseId ของคลังคำศัพท์ data/oxford/senses.json · ระดับ CEFR ตามคลัง ไม่เดา)
*/
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pool = require('../../config/db');
const realtime = require('../../realtime');
const chatFilter = require('../../utils/chatFilter');
const { isBlockedEither, blockedSet } = require('../../utils/blocks');
const { getLevelInfo } = require('../../utils/leveling');
const { grantExp } = require('../../utils/exp');
const mod = require('../moderation/chat');

class DrawError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }

const CFG = {
  minPlayers: 2,
  maxPlayers: 8,
  rounds: [1, 2, 3],
  defaultRounds: 2,
  drawSecs: [60, 80, 100],
  defaultDrawSecs: 80,
  chooseMs: 12000,
  revealMs: 6000,
  hintAt: [0.45, 0.7, 0.85],        // สัดส่วนเวลาที่ผ่านไป -> เปิดตัวใบ้ 1 ตัว (ไม่เกินครึ่งคำ)
  drawerGraceMs: 12000,             // คนวาดหลุด: รอได้เท่านี้ก่อนข้ามตา
  playerGraceMs: 60000,             // ผู้เล่นหลุดนานเกินนี้ = ออกจากห้อง
  idleRoomMs: 30 * 60 * 1000,
  endedKeepMs: 10 * 60 * 1000,
  maxSegPoints: 64,                 // จุดต่อชิ้นเส้นที่ส่งมา
  maxTurnPoints: 24000,             // จุดรวมต่อตา (กันข้อมูลท่วม)
  strokeRate: { limit: 60, windowMs: 1000 },
  guessRate: { minMs: 600, limit: 12, windowMs: 15000 },
  guessMaxLen: 60,
  inviteEveryMs: 60000,             // ชวนในแชทโลกได้ทุก 60 วินาทีต่อห้อง
  friendInviteEveryMs: 20000,
  levels: ['A1', 'A2', 'B1', 'B2', 'mix'],
};
const EXP = { guess: 8, firstGuess: 2, drawerPer: 3, drawerMax: 12, finish: 10, DAILY_CAP: 200 };
const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#a16207'];
const SIZES = [4, 9, 18];
const LEVEL_TH = { A1: 'A1 เริ่มต้น', A2: 'A2 พื้นฐาน', B1: 'B1 กลาง', B2: 'B2 กลางสูง', mix: 'คละ A1–B2' };

/* ---------------- คำศัพท์ ---------------- */
let WORDS = null;
function words() {
  if (WORDS) return WORDS;
  const file = path.join(__dirname, '..', '..', 'data', 'draw', 'words.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = (d.words || []).filter((w) => /^[a-z]{3,12}$/.test(w.word) && ['A1', 'A2', 'B1', 'B2'].includes(w.level));
  WORDS = { list, byWord: new Map(list.map((w) => [w.word, w])) };
  return WORDS;
}
function poolFor(level) { return words().list.filter((w) => level === 'mix' || w.level === level); }

/* ---------------- สถานะ ---------------- */
const rooms = new Map();      // code -> room
const userRoom = new Map();   // userId -> code
const lastFriendInvite = new Map();   // `${from}:${to}` -> time

const now = () => Date.now();
const send = (uid, type, payload) => realtime.sendToUser(uid, type, payload);
const logErr = (err) => console.error('[draw]', err && err.message);

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let t = 0; t < 50; t++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += chars[crypto.randomInt(chars.length)];
    if (!rooms.has(c)) return c;
  }
  throw new DrawError('BUSY', 'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง', 503);
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

async function userInfo(uid) {
  const r = (await pool.query('SELECT id, username, avatar, avatar_image, exp FROM users WHERE id = $1', [uid])).rows[0];
  if (!r) throw new DrawError('NO_USER', 'ไม่พบบัญชี', 404);
  // เฉพาะข้อมูลสาธารณะ (เหมือนแชทโลก) — ไม่มีอีเมล/เบอร์/ตำแหน่ง
  return { id: r.id, username: r.username, avatar: r.avatar || 'fox', avatarImage: r.avatar_image || null, level: getLevelInfo(r.exp || 0).level };
}

function mask(word, shown) { return word.split('').map((ch, i) => (shown.has(i) ? ch : '_')).join(''); }

function roomOf(uid) { const c = userRoom.get(uid); return c ? rooms.get(c) : null; }
function members(room) { return [...room.players.values()]; }
function connected(room) { return members(room).filter((p) => p.connected); }

/* ---------------- มุมมองข้อมูลที่ส่งออก ---------------- */
function publicPlayer(room, p) {
  return { id: p.id, username: p.username, avatar: p.avatar, avatarImage: p.avatarImage, level: p.level, score: p.score,
    connected: p.connected, host: room.hostId === p.id, drawing: room.turn && room.turn.drawerId === p.id,
    guessed: Boolean(room.turn && room.turn.guessed.has(p.id)) };
}
function settingsView(room) {
  return { level: room.level, levelTh: LEVEL_TH[room.level], rounds: room.rounds, drawSecs: room.drawSecs, maxPlayers: CFG.maxPlayers, isPublic: room.isPublic !== false };
}
function turnView(room, uid) {
  const t = room.turn;
  if (!t) return null;
  const isDrawer = t.drawerId === uid;
  const out = { phase: room.phase, drawerId: t.drawerId, round: room.round, rounds: room.rounds, turnNo: room.turnNo,
    endsAt: t.endsAt, serverNow: now(), length: t.word ? t.word.word.length : null };
  if (room.phase === 'choosing') { if (isDrawer) out.choices = t.choices.map((w) => ({ word: w.word, level: w.level, th: w.th })); }
  if (room.phase === 'drawing') {
    out.mask = t.word ? mask(t.word.word, isDrawer || t.guessed.has(uid) ? new Set(t.word.word.split('').map((_, i) => i)) : t.shown) : null;
    if (isDrawer || t.guessed.has(uid)) out.word = t.word.word;
    if (isDrawer && t.word) out.th = t.word.th;
  }
  if (room.phase === 'reveal' || room.phase === 'ended') out.reveal = t.revealed || null;
  return out;
}
function snapshot(room, uid) {
  return {
    code: room.code, phase: room.phase, hostId: room.hostId, me: uid, settings: settingsView(room),
    players: members(room).map((p) => publicPlayer(room, p)), order: room.order.slice(),
    turn: turnView(room, uid), strokes: room.phase === 'drawing' ? room.turn.strokes : [],
    palette: { colors: COLORS, sizes: SIZES }, result: room.result || null, wordsSeen: room.wordsSeen.slice(-30),
    expCap: EXP.DAILY_CAP,
  };
}
function broadcast(room, type, payload, except = null) {
  for (const p of room.players.values()) if (p.id !== except) send(p.id, type, payload);
}
function pushPlayers(room) { broadcast(room, 'draw:players', { code: room.code, hostId: room.hostId, players: members(room).map((p) => publicPlayer(room, p)) }); }
function pushState(room) { for (const p of room.players.values()) send(p.id, 'draw:state', snapshot(room, p.id)); }
function sys(room, text, except = null) { broadcast(room, 'draw:chat', { code: room.code, sys: true, text }, except); }

/* ---------------- สร้าง / เข้า / ออก ---------------- */
function readSettings(body = {}, base = {}) {
  const level = CFG.levels.includes(body.level) ? body.level : (base.level || 'A1');
  const rounds = CFG.rounds.includes(Number(body.rounds)) ? Number(body.rounds) : (base.rounds || CFG.defaultRounds);
  const drawSecs = CFG.drawSecs.includes(Number(body.drawSecs)) ? Number(body.drawSecs) : (base.drawSecs || CFG.defaultDrawSecs);
  // v1.21.0 ห้องสาธารณะ (แสดงในรายการห้อง ให้คนอื่นกดเข้าได้เลย) — ค่าเริ่มต้น = สาธารณะ
  const isPublic = typeof body.public === 'boolean' ? body.public : (typeof base.isPublic === 'boolean' ? base.isPublic : true);
  return { level, rounds, drawSecs, isPublic };
}

async function create(uid, body = {}) {
  if (!words().list.length) throw new DrawError('NO_WORDS', 'ยังไม่มีคลังคำศัพท์สำหรับโหมดนี้', 503);
  const old = roomOf(uid);
  if (old) leave(uid, 'switch');
  const info = await userInfo(uid);
  const s = readSettings(body);
  const room = {
    code: makeCode(), hostId: uid, createdAt: now(), lastActive: now(), ...s,
    players: new Map(), order: [], kicked: new Set(), phase: 'lobby', round: 0, turnNo: 0, turn: null, cursor: -1,
    used: new Set(), wordsSeen: [], result: null, startedAt: null, lastWorldInvite: 0, timers: new Set(), stats: new Map(),
  };
  rooms.set(room.code, room);
  addPlayer(room, info);
  return snapshot(room, uid);
}

function addPlayer(room, info) {
  room.players.set(info.id, { ...info, score: 0, connected: realtime.isOnline(info.id), joinedAt: now(), leftTimer: null, guessTimes: [], strokeTimes: [] });
  room.order.push(info.id);
  room.stats.set(info.id, room.stats.get(info.id) || { guessed: 0, drew: 0, exp: 0, words: new Set() });
  userRoom.set(info.id, room.code);
  room.lastActive = now();
}

/** ใครเข้าห้องได้: ห้องต้องยังไม่เต็ม/ไม่จบ · ไม่ถูกเตะ · ไม่บล็อกกับใครในห้อง */
async function join(uid, codeRaw) {
  const code = normCode(codeRaw);
  const room = rooms.get(code);
  if (!room || room.phase === 'ended') throw new DrawError('NO_ROOM', 'ไม่พบห้องนี้ หรือห้องปิดไปแล้ว', 404);
  if (room.players.has(uid)) { room.players.get(uid).connected = realtime.isOnline(uid); userRoom.set(uid, code); return snapshot(room, uid); }
  if (room.kicked.has(uid)) throw new DrawError('KICKED', 'คุณถูกเชิญออกจากห้องนี้แล้ว', 403);
  if (room.players.size >= CFG.maxPlayers) throw new DrawError('FULL', 'ห้องเต็มแล้ว', 409);
  for (const p of room.players.values()) {
    // eslint-disable-next-line no-await-in-loop
    if (await isBlockedEither(uid, p.id)) throw new DrawError('BLOCKED', 'เข้าห้องนี้ไม่ได้', 403);   // ไม่บอกว่าใครบล็อก
  }
  const info = await userInfo(uid);
  if (room.players.size >= CFG.maxPlayers) throw new DrawError('FULL', 'ห้องเต็มแล้ว', 409);
  const old = roomOf(uid);
  if (old && old.code !== code) leave(uid, 'switch');
  addPlayer(room, info);
  sys(room, `${info.username} เข้าห้องแล้ว`, uid);
  pushPlayers(room);
  broadcastInviteState(room);
  return snapshot(room, uid);
}

function leave(uid, why = 'leave') {
  const room = roomOf(uid);
  if (!room) return { ok: true };
  const p = room.players.get(uid);
  userRoom.delete(uid);
  if (!p) return { ok: true };
  clearTimeout(p.leftTimer);
  room.players.delete(uid);
  room.order = room.order.filter((x) => x !== uid);
  if (room.players.size === 0) { closeRoom(room, 'empty'); return { ok: true }; }
  if (room.hostId === uid) {
    const next = connected(room)[0] || members(room)[0];
    room.hostId = next.id;
    sys(room, `${next.username} เป็นเจ้าของห้องแทน`);
  }
  if (why !== 'switch') sys(room, why === 'kick' ? `${p.username} ถูกเชิญออกจากห้อง` : `${p.username} ออกจากห้องแล้ว`);
  if (room.phase !== 'lobby' && room.phase !== 'ended') {
    if (room.turn && room.turn.drawerId === uid && (room.phase === 'drawing' || room.phase === 'choosing')) endTurn(room, 'drawer_left');
    else if (room.phase === 'drawing') maybeAllGuessed(room);
    if (room.players.size < CFG.minPlayers) finishGame(room, 'not_enough');
  }
  pushPlayers(room);
  broadcastInviteState(room);
  return { ok: true };
}

function closeRoom(room, why) {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
  for (const p of room.players.values()) { clearTimeout(p.leftTimer); if (userRoom.get(p.id) === room.code) userRoom.delete(p.id); send(p.id, 'draw:closed', { code: room.code, why }); }
  rooms.delete(room.code);
  broadcastInviteState(room, true);
}

function later(room, ms, fn) {
  const t = setTimeout(() => { room.timers.delete(t); try { fn(); } catch (err) { logErr(err); } }, ms);
  if (t.unref) t.unref();
  room.timers.add(t);
  return t;
}

/* ---------------- ตั้งค่า / เริ่มเกม ---------------- */
function settings(uid, body) {
  const room = roomOf(uid);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  if (room.hostId !== uid) throw new DrawError('NOT_HOST', 'เฉพาะเจ้าของห้อง', 403);
  if (room.phase !== 'lobby' && room.phase !== 'ended') throw new DrawError('PLAYING', 'เปลี่ยนการตั้งค่าระหว่างเกมไม่ได้', 409);
  Object.assign(room, readSettings(body, room));
  pushState(room);
  broadcastInviteState(room);
  return snapshot(room, uid);
}

function start(uid) {
  const room = roomOf(uid);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  if (room.hostId !== uid) throw new DrawError('NOT_HOST', 'เฉพาะเจ้าของห้องเริ่มเกมได้', 403);
  if (room.phase !== 'lobby' && room.phase !== 'ended') throw new DrawError('PLAYING', 'เกมเริ่มไปแล้ว', 409);
  if (connected(room).length < CFG.minPlayers) throw new DrawError('NOT_ENOUGH', `ต้องมีผู้เล่นออนไลน์อย่างน้อย ${CFG.minPlayers} คน`, 409);
  for (const p of room.players.values()) { p.score = 0; room.stats.set(p.id, { guessed: 0, drew: 0, exp: 0, words: new Set() }); }
  Object.assign(room, { phase: 'starting', round: 1, turnNo: 0, cursor: -1, result: null, used: new Set(), wordsSeen: [], startedAt: now() });
  sys(room, `เริ่มเกม! ${room.rounds} รอบ · ${LEVEL_TH[room.level]} · วาดตาละ ${room.drawSecs} วินาที`);
  broadcastInviteState(room);
  nextTurn(room);
  return { ok: true };
}

/** หาคนวาดคนถัดไปตามลำดับเข้าห้อง (ข้ามคนที่หลุด) · ครบทุกคน = รอบถัดไป */
function nextTurn(room) {
  if (!rooms.has(room.code) || room.phase === 'ended') return;
  if (connected(room).length < CFG.minPlayers) { finishGame(room, 'not_enough'); return; }
  let tries = 0;
  for (;;) {
    room.cursor += 1;
    if (room.cursor >= room.order.length) {
      room.cursor = 0; room.round += 1;
      if (room.round > room.rounds) { finishGame(room, 'done'); return; }
      sys(room, `รอบที่ ${room.round}`);
    }
    const p = room.players.get(room.order[room.cursor]);
    if (p && p.connected) break;
    tries += 1;
    if (tries > room.order.length * 2) { finishGame(room, 'not_enough'); return; }
  }
  const drawerId = room.order[room.cursor];
  const pool0 = poolFor(room.level).filter((w) => !room.used.has(w.word));
  const src = pool0.length >= 3 ? pool0 : poolFor(room.level);
  const choices = [];
  const pick = src.slice();
  while (choices.length < 3 && pick.length) choices.push(pick.splice(crypto.randomInt(pick.length), 1)[0]);
  room.turnNo += 1;
  room.turn = { drawerId, choices, word: null, startedAt: 0, endsAt: now() + CFG.chooseMs, guessed: new Map(), shown: new Set(),
    strokes: [], points: 0, revealed: null, hintTimers: [] };
  room.phase = 'choosing';
  room.lastActive = now();
  pushState(room);
  room.turn.timer = later(room, CFG.chooseMs, () => { if (room.phase === 'choosing' && room.turn.drawerId === drawerId) choose(drawerId, crypto.randomInt(choices.length), true); });
}

function choose(uid, index, auto = false) {
  const room = roomOf(uid);
  if (!room || room.phase !== 'choosing' || !room.turn || room.turn.drawerId !== uid) throw new DrawError('NOT_YOUR_TURN', 'ยังไม่ถึงตาคุณเลือกคำ', 409);
  const i = Number(index);
  const w = room.turn.choices[Number.isInteger(i) && i >= 0 && i < room.turn.choices.length ? i : 0];
  const t = room.turn;
  clearTimeout(t.timer);
  t.word = w; room.used.add(w.word);
  t.startedAt = now(); t.endsAt = t.startedAt + room.drawSecs * 1000;
  room.phase = 'drawing';
  const st = room.stats.get(uid); if (st) st.drew += 1;
  pushState(room);
  if (auto) send(uid, 'draw:chat', { code: room.code, sys: true, text: `หมดเวลาเลือก — ระบบเลือกคำ "${w.word}" ให้` });
  const total = room.drawSecs * 1000;
  const maxHints = Math.floor(w.word.length / 2);
  CFG.hintAt.forEach((f, k) => {
    if (k >= maxHints || (k === 2 && w.word.length < 5)) return;
    t.hintTimers.push(later(room, Math.round(total * f), () => revealHint(room, t)));
  });
  t.timer = later(room, total, () => { if (room.turn === t && room.phase === 'drawing') endTurn(room, 'time'); });
  return { ok: true };
}

function revealHint(room, t) {
  if (room.turn !== t || room.phase !== 'drawing') return;
  const hidden = t.word.word.split('').map((_, i) => i).filter((i) => !t.shown.has(i));
  if (hidden.length <= 1) return;
  t.shown.add(hidden[crypto.randomInt(hidden.length)]);
  const m = mask(t.word.word, t.shown);
  for (const p of room.players.values()) if (p.id !== t.drawerId && !t.guessed.has(p.id)) send(p.id, 'draw:hint', { code: room.code, mask: m });
}

/* ---------------- เส้นวาด (คนวาดเท่านั้น) ---------------- */
function rateOk(times, limit, windowMs) {
  const T = now();
  while (times.length && T - times[0] > windowMs) times.shift();
  if (times.length >= limit) return false;
  times.push(T); return true;
}
function stroke(uid, msg) {
  const room = roomOf(uid);
  if (!room || room.phase !== 'drawing' || room.turn.drawerId !== uid) return;
  const p = room.players.get(uid);
  if (!rateOk(p.strokeTimes, CFG.strokeRate.limit, CFG.strokeRate.windowMs)) return;
  const s = msg && msg.s;
  if (!s || !Array.isArray(s.p) || !s.p.length || s.p.length > CFG.maxSegPoints) return;
  const sid = Number(s.id);
  if (!Number.isInteger(sid) || sid < 0 || sid > 1e6) return;
  const c = Number(s.c); const w = Number(s.w);
  const pts = [];
  for (const pt of s.p) {
    if (!Array.isArray(pt) || pt.length !== 2) return;
    const x = Math.round(Number(pt[0])); const y = Math.round(Number(pt[1]));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 750) return;   // พิกัดมาตรฐาน 1000×750
    pts.push([x, y]);
  }
  const t = room.turn;
  if (t.points + pts.length > CFG.maxTurnPoints) return;
  t.points += pts.length;
  const seg = { id: sid, c: Number.isInteger(c) && c >= 0 && c < COLORS.length ? c : 0, w: Number.isInteger(w) && w >= 0 && w < SIZES.length ? w : 1, e: Boolean(s.e), p: pts };
  t.strokes.push(seg);
  room.lastActive = now();
  broadcast(room, 'draw:stroke', { code: room.code, s: seg }, uid);
}
function undo(uid) {
  const room = roomOf(uid);
  if (!room || room.phase !== 'drawing' || room.turn.drawerId !== uid) return;
  const t = room.turn;
  if (!t.strokes.length) return;
  const last = t.strokes[t.strokes.length - 1].id;
  t.strokes = t.strokes.filter((x) => x.id !== last);
  broadcast(room, 'draw:undo', { code: room.code, id: last }, uid);
}
function clearBoard(uid) {
  const room = roomOf(uid);
  if (!room || room.phase !== 'drawing' || room.turn.drawerId !== uid) return;
  room.turn.strokes = [];
  broadcast(room, 'draw:clear', { code: room.code }, uid);
}

/* ---------------- คำทาย ---------------- */
const normGuess = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function isCorrect(g, word) { return g === word || g === `${word}s` || g === `${word}es` || g === `a ${word}` || g === `an ${word}` || g === `the ${word}`; }

async function guess(uid, raw) {
  const room = roomOf(uid);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  const p = room.players.get(uid);
  const text0 = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, CFG.guessMaxLen);
  if (!text0) return { ok: false };
  const T = now();
  if (p.lastGuessAt && T - p.lastGuessAt < CFG.guessRate.minMs) throw new DrawError('RATE', 'พิมพ์เร็วเกินไป', 429);
  if (!rateOk(p.guessTimes, CFG.guessRate.limit, CFG.guessRate.windowMs)) throw new DrawError('RATE', 'ส่งถี่เกินไป พักสักครู่', 429);
  p.lastGuessAt = T;
  room.lastActive = T;
  const t = room.turn;
  const drawing = room.phase === 'drawing' && t && t.word;
  const isDrawer = drawing && t.drawerId === uid;
  const already = drawing && t.guessed.has(uid);
  const g = normGuess(text0);
  if (drawing && !isDrawer && !already && g) {
    if (isCorrect(g, t.word.word)) { await correct(room, p, t); return { ok: true, correct: true }; }
    if (t.word.word.length >= 4 && lev(g, t.word.word) === 1) send(uid, 'draw:close', { code: room.code, text: `"${text0}" ใกล้แล้ว!` });
  }
  // คนวาด/คนที่ทายถูกแล้ว พิมพ์คำตอบลงแชท = ไม่ส่ง (กันบอกใบ้)
  if (drawing && (isDrawer || already) && g && (g.includes(t.word.word) || lev(g, t.word.word) <= 1)) {
    send(uid, 'draw:chat', { code: room.code, sys: true, text: 'พิมพ์คำตอบในแชทไม่ได้' });
    return { ok: false };
  }
  // ข้อความทั่วไป: ตัวกรองเดิมของแชทโลก · ถูกปิดแชท = ไม่ส่งต่อ (ยังทายได้)
  const restr = (await mod.activeRestrictions(uid)).find((x) => x.kind === 'chat' || x.kind === 'text');
  if (restr) { send(uid, 'draw:chat', { code: room.code, sys: true, text: 'คุณถูกจำกัดการแชทชั่วคราว — ยังทายคำได้ แต่ข้อความจะไม่แสดงให้คนอื่นเห็น' }); return { ok: false }; }
  const f = chatFilter.filter(text0);
  if (f.block) {
    await mod.logChat({ roomId: `draw:${room.code}`, userId: uid, mode: 'draw', kind: 'text', content: text0, flagged: f.flags[0] || 'blocked' }).catch(() => {});
    send(uid, 'draw:chat', { code: room.code, sys: true, text: 'ส่งไม่ได้: ห้ามแชร์ลิงก์ เบอร์โทร หรือช่องทางติดต่อส่วนตัว' });
    await mod.maybeAutoMute(uid).catch(() => {});
    return { ok: false };
  }
  const flagged = f.flags.find((x) => x === 'profanity' || x === 'spam') || null;
  await mod.logChat({ roomId: `draw:${room.code}`, userId: uid, mode: 'draw', kind: 'text', content: f.text, flagged }).catch(() => {});
  const line = { code: room.code, from: { id: p.id, username: p.username }, text: f.text, guessedChannel: Boolean(isDrawer || already) };
  // ช่องคนที่ทายถูกแล้ว: เห็นกันเฉพาะคนวาด + คนที่ทายถูกแล้ว
  for (const q of room.players.values()) {
    if (line.guessedChannel && !(q.id === t.drawerId || t.guessed.has(q.id))) continue;
    send(q.id, 'draw:chat', line);
  }
  return { ok: true };
}

async function correct(room, p, t) {
  const left = Math.max(0, t.endsAt - now());
  const total = room.drawSecs * 1000;
  const first = t.guessed.size === 0;
  const pts = Math.round(100 + 200 * (left / total)) + (first ? 50 : 0);
  t.guessed.set(p.id, { pts, at: now() });
  p.score += pts;
  const drawer = room.players.get(t.drawerId);
  if (drawer) drawer.score += 60;
  const st = room.stats.get(p.id); if (st) { st.guessed += 1; st.words.add(t.word.word); }
  broadcast(room, 'draw:guessed', { code: room.code, userId: p.id, username: p.username, pts, first });
  send(p.id, 'draw:word', { code: room.code, word: t.word.word, th: t.word.th });
  pushPlayers(room);
  // EXP (เพดานต่อวัน) — ไม่รอให้เสร็จเพื่อไม่ทำให้เกมหน่วง
  award(room, p.id, EXP.guess + (first ? EXP.firstGuess : 0));
  maybeAllGuessed(room);
}

function maybeAllGuessed(room) {
  const t = room.turn;
  if (!t || room.phase !== 'drawing') return;
  const guessers = connected(room).filter((p) => p.id !== t.drawerId);
  if (guessers.length && guessers.every((p) => t.guessed.has(p.id))) endTurn(room, 'all_guessed');
}

function award(room, uid, amount) {
  grantExp(uid, amount, { reason: 'draw', dailyCap: EXP.DAILY_CAP }).then((g) => {
    if (!g || !g.gained) { if (g && amount > 0) send(uid, 'draw:exp', { code: room.code, gained: 0, capped: true }); return; }
    const st = room.stats.get(uid); if (st) st.exp += g.gained;
    send(uid, 'draw:exp', { code: room.code, gained: g.gained, levelInfo: g.levelInfo, leveledUp: g.leveledUp });
  }).catch(logErr);
}

function endTurn(room, why) {
  const t = room.turn;
  if (!t || (room.phase !== 'drawing' && room.phase !== 'choosing')) return;
  clearTimeout(t.timer); t.hintTimers.forEach((x) => clearTimeout(x));
  const w = t.word || t.choices[0];
  if (!t.word) room.used.add(w.word);
  t.revealed = { word: w.word, th: w.th, level: w.level, pos: w.pos || '', example: w.example || '', exampleTh: w.exampleTh || '', why,
    drawerId: t.drawerId, guessed: [...t.guessed.entries()].map(([id, g]) => ({ id, pts: g.pts })) };
  room.wordsSeen.push({ word: w.word, th: w.th, level: w.level, senseId: w.senseId || null });
  for (const p of room.players.values()) { const st = room.stats.get(p.id); if (st) st.words.add(w.word); }
  if (t.word && t.guessed.size) award(room, t.drawerId, Math.min(EXP.drawerMax, EXP.drawerPer * t.guessed.size));
  room.phase = 'reveal';
  t.endsAt = now() + CFG.revealMs;
  pushState(room);
  later(room, CFG.revealMs, () => { if (room.turn === t && room.phase === 'reveal') nextTurn(room); });
}

async function finishGame(room, why) {
  if (room.phase === 'ended' || !rooms.has(room.code)) return;
  for (const x of room.timers) clearTimeout(x);
  room.timers.clear();
  if (room.turn) { room.turn.hintTimers.forEach((x) => clearTimeout(x)); }
  const ranking = members(room).slice().sort((a, b) => b.score - a.score);
  let place = 0; let prev = null;
  const rows = ranking.map((p, i) => { if (p.score !== prev) { place = i + 1; prev = p.score; } return { id: p.id, username: p.username, avatar: p.avatar, avatarImage: p.avatarImage, score: p.score, place }; });
  const turns = room.turnNo;
  room.phase = 'ended';
  room.result = { why, players: rows, words: room.wordsSeen.slice(), turns };
  const played = why === 'done' || turns >= 2;
  if (played) for (const p of connected(room)) award(room, p.id, EXP.finish);
  pushState(room);
  broadcastInviteState(room);
  later(room, CFG.endedKeepMs, () => { if (room.phase === 'ended') closeRoom(room, 'ended'); });
  if (turns > 0) {
    try {
      const g = await pool.query('INSERT INTO draw_games (room_code, level, players, turns, started_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [room.code, room.level, rows.length, turns, new Date(room.startedAt || now())]);
      for (const r of rows) {
        const st = room.stats.get(r.id) || { guessed: 0, drew: 0, exp: 0, words: new Set() };
        // eslint-disable-next-line no-await-in-loop
        await pool.query('INSERT INTO draw_game_players (game_id, user_id, score, place, guessed, drew, exp, words) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
          [g.rows[0].id, r.id, r.score, r.place, st.guessed, st.drew, st.exp, [...st.words].slice(0, 60)]);
      }
    } catch (err) { logErr(err); }
  }
}

/** เล่นอีกรอบ (เจ้าของห้อง) */
function rematch(uid) {
  const room = roomOf(uid);
  if (!room || room.phase !== 'ended') throw new DrawError('NOT_ENDED', 'เกมยังไม่จบ', 409);
  if (room.hostId !== uid) throw new DrawError('NOT_HOST', 'เฉพาะเจ้าของห้อง', 403);
  for (const x of room.timers) clearTimeout(x);
  room.timers.clear();
  Object.assign(room, { phase: 'lobby', turn: null, result: null, round: 0, turnNo: 0 });
  for (const p of room.players.values()) p.score = 0;
  pushState(room);
  broadcastInviteState(room);
  return { ok: true };
}

/* ---------------- เจ้าของห้อง: เตะ ---------------- */
function kick(uid, targetId) {
  const room = roomOf(uid);
  const tid = Number(targetId);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  if (room.hostId !== uid) throw new DrawError('NOT_HOST', 'เฉพาะเจ้าของห้อง', 403);
  if (tid === uid || !room.players.has(tid)) throw new DrawError('BAD_TARGET', 'ไม่พบผู้เล่นนี้', 400);
  room.kicked.add(tid);
  send(tid, 'draw:kicked', { code: room.code });
  leave(tid, 'kick');
  return { ok: true };
}

/* ---------------- รายงาน (เก็บหลักฐานภาพวาด) ---------------- */
const REPORT_REASONS = { drawing: 'ภาพวาดไม่เหมาะสม', letters: 'เขียนตัวอักษร/บอกคำตอบ', chat: 'ข้อความไม่เหมาะสม', other: 'อื่น ๆ' };
async function report(uid, { userId, reason, note } = {}) {
  const room = roomOf(uid);
  const tid = Number(userId);
  if (!room || !room.players.has(tid) || tid === uid) throw new DrawError('BAD_TARGET', 'ไม่พบผู้เล่นนี้ในห้อง', 400);
  const r = REPORT_REASONS[reason] ? reason : 'other';
  const recent = await pool.query("SELECT 1 FROM user_reports WHERE reporter_id = $1 AND reported_id = $2 AND created_at > NOW() - INTERVAL '10 minutes' AND details LIKE '[วาดทายศัพท์]%'", [uid, tid]);
  if (recent.rows[0]) return { ok: true, duplicate: true };
  const t = room.turn;
  const isDrawer = t && t.drawerId === tid && (room.phase === 'drawing' || room.phase === 'reveal');
  const details = `[วาดทายศัพท์] ห้อง ${room.code} · ${REPORT_REASONS[r]}${isDrawer && t.word ? ` · คำ: ${t.word.word}` : ''}${note ? ` · ${String(note).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`;
  const ins = await pool.query('INSERT INTO user_reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4) RETURNING id',
    [uid, tid, r === 'letters' ? 'cheating' : (r === 'chat' ? 'harassment' : 'other'), details.slice(0, 500)]);
  if (isDrawer) {
    await pool.query('INSERT INTO draw_report_evidence (report_id, room_code, word, strokes) VALUES ($1, $2, $3, $4)',
      [ins.rows[0].id, room.code, t.word ? t.word.word : null, JSON.stringify(t.strokes.slice(0, 4000))]);
  }
  return { ok: true, evidence: Boolean(isDrawer) };
}
async function evidence(reportId) {
  const r = (await pool.query('SELECT report_id, room_code, word, strokes, created_at FROM draw_report_evidence WHERE report_id = $1', [Number(reportId)])).rows[0];
  if (!r) throw new DrawError('NOT_FOUND', 'ไม่มีหลักฐานภาพวาดของรายงานนี้', 404);
  return { reportId: r.report_id, room: r.room_code, word: r.word, strokes: r.strokes, at: r.created_at, palette: { colors: COLORS, sizes: SIZES } };
}

/* ---------------- เก็บคำเข้าคิวทบทวน ---------------- */
/** คำที่เจอในห้องนี้ (senseId ของคลังคำศัพท์) -> word_progress ถึงกำหนดทบทวนทันที · ไม่ให้ EXP · ไม่แตะสถานะคำที่เรียนแล้ว */
async function saveWords(uid) {
  const room = roomOf(uid);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  const ids = [...new Set(room.wordsSeen.map((w) => w.senseId).filter(Boolean))].slice(0, 60);
  if (!ids.length) return { ok: true, saved: 0 };
  const { rows } = await pool.query('SELECT id, public_id, cefr FROM vocab_senses WHERE id = ANY($1::text[]) AND public_id IS NOT NULL', [ids]);
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at)
       VALUES ($1, $2, $3, 'learning', 0, NOW())
       ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW())`,
      [uid, r.public_id, r.cefr]);
  }
  return { ok: true, saved: rows.length };
}

/* ---------------- v1.21.0 รายการห้องที่เปิดอยู่ ---------------- */
/** ห้องสาธารณะที่ผู้ใช้นี้เข้าได้ตอนนี้ — ไม่เต็ม · ยังไม่จบ · มีคนออนไลน์ · ไม่ถูกเตะ · ไม่มีใครในห้องบล็อกกับผู้ใช้ (ทั้งสองทาง)
 *  ส่งเฉพาะข้อมูลสาธารณะ: รหัสห้อง · ชื่อ/รูป/เลเวลเจ้าของห้อง · จำนวนคน · ระดับคำ · สถานะ */
async function listRooms(uid) {
  const blocked = await blockedSet(uid);
  const out = [];
  for (const room of rooms.values()) {
    if (room.isPublic === false || room.phase === 'ended' || room.players.size >= CFG.maxPlayers || room.kicked.has(uid)) continue;
    if (!connected(room).length) continue;
    if ([...room.players.keys()].some((id) => blocked.has(id))) continue;
    const host = room.players.get(room.hostId);
    out.push({
      code: room.code, players: room.players.size, max: CFG.maxPlayers, level: room.level, levelTh: LEVEL_TH[room.level],
      rounds: room.rounds, drawSecs: room.drawSecs, status: room.phase === 'lobby' ? 'waiting' : 'playing', mine: room.players.has(uid),
      host: host ? { id: host.id, username: host.username, level: host.level, avatar: host.avatar || null, avatarImage: host.avatarImage || null } : null,
      createdAt: room.createdAt,
    });
  }
  // รอผู้เล่นก่อน → คนเยอะก่อน → ห้องใหม่ก่อน
  out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'waiting' ? -1 : 1) || b.players - a.players || b.createdAt - a.createdAt);
  return { rooms: out.slice(0, 30).map(({ createdAt, ...r }) => r), total: out.length };
}

/* ---------------- คำเชิญ ---------------- */
/** ข้อมูลห้องสำหรับการ์ดคำเชิญ (เฉพาะข้อมูลสาธารณะ) */
function peek(codeRaw, uid = null) {
  const room = rooms.get(normCode(codeRaw));
  if (!room) return { code: normCode(codeRaw), open: false, status: 'closed' };
  const host = room.players.get(room.hostId);
  const full = room.players.size >= CFG.maxPlayers;
  const status = room.phase === 'ended' ? 'ended' : full ? 'full' : room.phase === 'lobby' ? 'waiting' : 'playing';
  return { code: room.code, open: !full && room.phase !== 'ended' && !(uid && room.kicked.has(uid)), status, players: room.players.size, max: CFG.maxPlayers,
    level: room.level, levelTh: LEVEL_TH[room.level], host: host ? { username: host.username, level: host.level } : null, mine: Boolean(uid && room.players.has(uid)) };
}
function broadcastInviteState(room, closed = false) {
  if (!room.lastWorldInvite) return;
  realtime.getOnlineUserIds().forEach((u) => send(u, 'draw:invite_state', closed ? { code: room.code, open: false, status: 'closed' } : peek(room.code)));
}

async function inviteWorld(uid) {
  const room = roomOf(uid);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  if (room.phase === 'ended') throw new DrawError('ENDED', 'เกมจบแล้ว', 409);
  if (room.players.size >= CFG.maxPlayers) throw new DrawError('FULL', 'ห้องเต็มแล้ว', 409);
  if (now() - room.lastWorldInvite < CFG.inviteEveryMs) {
    throw new DrawError('RATE', `ชวนในแชทโลกได้อีกครั้งใน ${Math.ceil((CFG.inviteEveryMs - (now() - room.lastWorldInvite)) / 1000)} วินาที`, 429);
  }
  const worldChat = require('../worldChat');
  // ข้อความคำเชิญเป็นแบบฟอร์มคงที่ — ไม่มีข้อความพิมพ์เอง/ข้อมูลส่วนตัว (รหัสห้อง + ระดับคำ + จำนวนที่นั่ง)
  const text = `ชวนเล่น "วาดทายศัพท์" · ${LEVEL_TH[room.level]} · ${room.players.size}/${CFG.maxPlayers} คน · ห้อง ${room.code}`;
  const out = await worldChat.postInvite(uid, { kind: 'draw', ref: room.code, text });
  room.lastWorldInvite = now();
  return { ok: true, message: out.message };
}

async function inviteFriend(uid, friendId) {
  const room = roomOf(uid);
  const fid = Number(friendId);
  if (!room) throw new DrawError('NO_ROOM', 'ไม่ได้อยู่ในห้อง', 404);
  if (!Number.isInteger(fid) || fid === uid) throw new DrawError('BAD_TARGET', 'ไม่พบเพื่อน', 400);
  const f = await pool.query(`SELECT 1 FROM friendships WHERE status = 'accepted'
     AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [uid, fid]);
  if (!f.rows[0]) throw new DrawError('NOT_FRIEND', 'ชวนได้เฉพาะเพื่อน', 403);
  if (await isBlockedEither(uid, fid)) throw new DrawError('BLOCKED', 'ชวนไม่ได้', 403);
  if (!realtime.isOnline(fid)) throw new DrawError('OFFLINE', 'เพื่อนไม่ได้ออนไลน์อยู่', 409);
  const k = `${uid}:${fid}`;
  if (now() - (lastFriendInvite.get(k) || 0) < CFG.friendInviteEveryMs) throw new DrawError('RATE', 'เพิ่งชวนไปแล้ว รอสักครู่', 429);
  lastFriendInvite.set(k, now());
  const me = room.players.get(uid);
  send(fid, 'draw:invited', { code: room.code, from: { id: uid, username: me.username }, levelTh: LEVEL_TH[room.level] });
  return { ok: true };
}

/* ---------------- หลุด / กลับมา ---------------- */
function onConnect(uid) {
  const room = roomOf(uid);
  if (!room) return;
  const p = room.players.get(uid);
  if (!p) return;
  clearTimeout(p.leftTimer); p.leftTimer = null;
  if (!p.connected) { p.connected = true; pushPlayers(room); }
  send(uid, 'draw:state', snapshot(room, uid));
}
function onDisconnect(uid, _socket, { stillOnline } = {}) {
  if (stillOnline) return;
  const room = roomOf(uid);
  if (!room) return;
  const p = room.players.get(uid);
  if (!p) return;
  p.connected = false;
  pushPlayers(room);
  const t = room.turn;
  if (t && t.drawerId === uid && (room.phase === 'drawing' || room.phase === 'choosing')) {
    later(room, CFG.drawerGraceMs, () => { const q = room.players.get(uid); if (room.turn === t && q && !q.connected) { sys(room, `${q.username} หลุดการเชื่อมต่อ — ข้ามตานี้`); endTurn(room, 'drawer_left'); } });
  } else if (room.phase === 'drawing') maybeAllGuessed(room);
  p.leftTimer = setTimeout(() => { const q = room.players.get(uid); if (q && !q.connected && rooms.has(room.code)) leave(uid, 'timeout'); }, CFG.playerGraceMs);
  if (p.leftTimer.unref) p.leftTimer.unref();
}

/* ---------------- WebSocket ---------------- */
function handleMessage(socket, msg) {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('draw:')) return false;
  const uid = socket.userId;
  const fail = (err) => send(uid, 'draw:error', { code: err.code || 'SERVER', message: err instanceof DrawError ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  const run = (fn) => { try { const r = fn(); if (r && r.catch) r.catch((err) => { if (!(err instanceof DrawError)) logErr(err); fail(err); }); } catch (err) { if (!(err instanceof DrawError)) logErr(err); fail(err); } };
  switch (msg.type) {
    case 'draw:sync': { const room = roomOf(uid); if (room) send(uid, 'draw:state', snapshot(room, uid)); else send(uid, 'draw:closed', { code: normCode(msg.code), why: 'not_in_room' }); break; }
    case 'draw:stroke': stroke(uid, msg); break;
    case 'draw:undo': undo(uid); break;
    case 'draw:clear': clearBoard(uid); break;
    case 'draw:choose': run(() => choose(uid, msg.index)); break;
    case 'draw:guess': run(() => guess(uid, msg.text)); break;
    case 'draw:start': run(() => start(uid)); break;
    case 'draw:settings': run(() => settings(uid, msg)); break;
    case 'draw:kick': run(() => kick(uid, msg.userId)); break;
    case 'draw:leave': run(() => leave(uid)); break;
    case 'draw:rematch': run(() => rematch(uid)); break;
    default: return false;
  }
  return true;
}

let sweeper = null;
function init() {
  realtime.registerMessageHandler(handleMessage);
  realtime.registerDisconnectHandler(onDisconnect);
  realtime.registerConnectHandler(onConnect);
  clearInterval(sweeper);
  sweeper = setInterval(() => {
    const T = now();
    for (const room of rooms.values()) if (T - room.lastActive > CFG.idleRoomMs) closeRoom(room, 'idle');
  }, 60 * 1000);
  if (sweeper.unref) sweeper.unref();
}

module.exports = {
  DrawError, CFG, EXP, LEVEL_TH, REPORT_REASONS, init, create, join, leave, settings, start, choose, guess, kick, report, evidence,
  peek, inviteWorld, inviteFriend, rematch, saveWords, roomOf, snapshot, words, normGuess, isCorrect, listRooms,
  _reset: () => { for (const r of rooms.values()) closeRoom(r, 'reset'); WORDS = null; }, _rooms: rooms, _handle: handleMessage,
};
