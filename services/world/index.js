/*
  EnglishQuest World — Multiplayer 3D Lobby (server-authoritative state)

  สถาปัตยกรรม: ใช้ WebSocket เดิมของแอป (realtime.js · /ws · JWT + token_version) — ไม่เปิด port/protocol ใหม่
    · ข้อความ world:* ผ่าน registerMessageHandler เหมือนห้องแข่ง/Ranked
    · ตัวตน = socket.userId จาก token เท่านั้น (ไม่รับ userId จาก client) · ผู้เล่นอื่นเห็นแค่ pid (สุ่มต่อการเข้าห้อง) ไม่ใช่ user id
    · ตำแหน่ง: client ส่ง "สิ่งที่อยากไป" ≤ 10 ครั้ง/วินาที → เซิร์ฟเวอร์ตรวจความเร็ว + เส้นทาง (collision เดียวกับ client) แล้วเก็บค่าที่ถูก
      ถ้าเพี้ยนเกิน 0.6 m ส่งตำแหน่งที่ถูกกลับ (world:correct)
    · ส่ง snapshot 10 Hz เฉพาะผู้เล่นที่เปลี่ยน · ไกลเกิน 18 m อัปเดตทุก 4 tick (Distance-based Updates)
    · ห้อง (instance) อยู่ในหน่วยความจำ: campus-1 … campus-N เติมห้องที่มีคนก่อน (ไม่เกินความจุ) · ห้องส่วนตัว p-<user> เมื่อปิด "ให้คนอื่นเห็นฉัน"
    · หลุด: Avatar ออกจากห้องทันที (ไม่มี ghost) · กลับมาใน 30 วินาที = ห้อง/ตำแหน่ง/pid เดิม · เซิร์ฟเวอร์รีสตาร์ต: client ขอห้องเดิม (resume) → ตรวจแล้วสร้างห้องคืน
    · บล็อก (user_blocks เดิม): สองฝ่ายมองไม่เห็นกัน แชท/คำชวน/ท่าทางไม่ถึงกัน · Mute: ผู้ที่ mute ไม่เห็นแชท/ท่าทักของอีกฝ่าย
    · ไม่มี Coin/EXP จากการอยู่ใน Lobby — รางวัลมาจากกิจกรรมการเรียนในระบบเดิมเท่านั้น
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const realtime = require('../../realtime');
const { WORLD, PHRASE_BY_ID, EMOTES, STATES } = require('../../config/world');
const settingsSvc = require('./settings');
const mod = require('./moderation');
const chatFilter = require('../../utils/chatFilter');
const physicsLib = require('../../public/js/world-physics');
const mapData = require('./map');

const rooms = new Map();      // roomId -> room
const byUser = new Map();     // userId -> player (เซสชันเดียวต่อบัญชี)
const grace = new Map();      // userId -> { roomId, pid, x, z, ry, until }
const invites = new Map();    // inviteId -> { from, to, kind, level, at }
let tickN = 0;
const metrics = { ticks: 0, tickMsAvg: 0, tickMsMax: 0, bytesOut: 0, msgsOut: 0, movesIn: 0, corrections: 0, since: Date.now() };

const ST_CODE = Object.fromEntries(STATES.map((s, i) => [s, i]));
const now = () => Date.now();
const r2 = (v) => Math.round(v * 100) / 100;
const pidOf = () => crypto.randomBytes(5).toString('hex');

/* ---------------- ห้อง ---------------- */
const PUBLIC_RE = /^campus-([1-9]\d?)$/;
function roomName(id) { const m = PUBLIC_RE.exec(id); return m ? `Campus ${m[1]}` : 'ห้องส่วนตัว'; }
function getRoom(id, create = true) {
  let r = rooms.get(id);
  if (!r && create) {
    r = { id, name: roomName(id), private: !PUBLIC_RE.test(id), players: new Map(), reserved: new Map(), emptySince: now(), created: now() };
    rooms.set(id, r);
  }
  return r;
}
const cap = (room) => (room.private ? 1 : WORLD.capacity);
function occupancy(room) {
  const t = now();
  for (const [uid, until] of room.reserved) if (until < t) room.reserved.delete(uid);
  return room.players.size + room.reserved.size;
}
function validPublicId(id) { const m = PUBLIC_RE.exec(String(id || '')); return Boolean(m && Number(m[1]) <= WORLD.maxRooms); }

/* ---------------- การส่งข้อความ ---------------- */
function sendP(p, type, payload = {}) {
  if (!p.socket || p.socket.readyState !== 1) return;
  const s = JSON.stringify({ type, ...payload });
  metrics.bytesOut += s.length; metrics.msgsOut += 1;
  try { p.socket.send(s); } catch (_e) { /* ปิดไปแล้ว */ }
}
const sees = (a, b) => a !== b && !a.blocks.has(b.userId) && !b.blocks.has(a.userId);
function pub(p, viewer) {
  return { pid: p.pid, name: p.name, outfit: p.outfit, colors: p.colors || {}, x: r2(p.x), z: r2(p.z), ry: r2(p.ry), st: p.st, afk: p.afk, seat: p.seat ? p.seat.id : null,
    friend: viewer ? viewer.friends.has(p.userId) : false };
}
function roomInfo(room) { return { id: room.id, name: room.name, private: room.private, count: room.players.size, cap: cap(room) }; }
function toRoom(room, type, payloadFor, filter = () => true) {
  for (const v of room.players.values()) { if (filter(v)) { const pl = payloadFor(v); if (pl) sendP(v, type, pl); } }
}

/* ---------------- ข้อมูลผู้ใช้ ---------------- */
async function loadUser(userId) {
  const AV = require('../avatar');
  const [u, fr, bl, mu, st, looks, restr] = await Promise.all([
    pool.query('SELECT id, username, created_at, role FROM users WHERE id = $1', [userId]),
    pool.query(`SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id FROM friendships
                 WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`, [userId]),
    pool.query('SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1 UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = $1', [userId]),
    pool.query('SELECT muted_id AS id FROM world_mutes WHERE user_id = $1', [userId]),
    settingsSvc.get(userId),
    pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [userId]),
    mod.activeRestrictions(userId),
  ]);
  if (!u.rows[0]) return null;
  // ชุดที่สวมจริงจาก Wardrobe เดิม (ไม่มีแถว = ชุดเริ่มต้นของระบบ Avatar) — ไม่แตะรูปโปรไฟล์ของผู้ใช้
  const row = looks.rows[0];
  const outfit = row ? Object.fromEntries(AV.SLOTS.map((s) => [s, row[`${s}_item_id`]]).filter(([, v]) => v)) : AV.defaultOutfit(userId);
  const colors = row ? await AV.colorsOf(userId, Object.values(outfit)) : {};   // สีที่ผู้ใช้เปลี่ยนเอง (เฉพาะชิ้นที่สวม)
  return {
    id: userId, username: u.rows[0].username, createdAt: new Date(u.rows[0].created_at).getTime(), role: u.rows[0].role,
    friends: new Set(fr.rows.map((r) => r.id)), blocks: new Set(bl.rows.map((r) => r.id)), mutes: new Set(mu.rows.map((r) => r.id)),
    settings: st, outfit, colors, restrictions: restr,
  };
}

/* ---------------- เข้า/ออกห้อง ---------------- */
function pickRoom(u) {
  if (!u.settings.showInLobby) return getRoom(`p-${u.id}`);
  let best = null;
  for (const r of rooms.values()) {
    if (r.private || occupancy(r) >= cap(r)) continue;
    if ([...r.players.values()].some((q) => u.blocks.has(q.userId))) continue;   // ไม่จัดเข้าห้องเดียวกับคนที่บล็อกกัน
    if (!best || r.players.size > best.players.size || (r.players.size === best.players.size && r.id < best.id)) best = r;
  }
  if (best) return best;
  for (let i = 1; i <= WORLD.maxRooms; i += 1) {
    const r = getRoom(`campus-${i}`);
    if (occupancy(r) < cap(r) && ![...r.players.values()].some((q) => u.blocks.has(q.userId))) return r;
  }
  return null;
}
function spawnPoint(room) {
  const sp = mapData.map.spawns;
  for (let k = 0; k < sp.length; k += 1) {
    const s = sp[Math.floor(Math.random() * sp.length)];
    const free = [...room.players.values()].every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 0.8);
    if (free) return { x: s.x, z: s.z };
  }
  const s = sp[0]; return { x: s.x + (Math.random() - 0.5), z: s.z + (Math.random() - 0.5) };
}
const phys = () => mapData.phys;

function removePlayer(p, reason, { keepGrace = false } = {}) {
  const room = p.room;
  if (!room) return;
  room.players.delete(p.pid);
  if (byUser.get(p.userId) === p) byUser.delete(p.userId);
  if (keepGrace) {
    grace.set(p.userId, { roomId: room.id, pid: p.pid, x: p.x, z: p.z, ry: p.ry, until: now() + WORLD.reconnectGraceMs });
    room.reserved.set(p.userId, now() + WORLD.reconnectGraceMs);
  }
  toRoom(room, 'world:remove', () => ({ pid: p.pid, reason }), (v) => sees(v, p));
  if (!room.players.size) room.emptySince = now();
  for (const [id, inv] of invites) if (inv.from === p || inv.to === p) invites.delete(id);
  p.room = null;
}

async function join(socket, msg) {
  const userId = socket.userId;
  if (!userId) return;
  const u = await loadUser(userId);
  if (!u) return realtime.send(socket, 'world:error', { code: 'NO_USER', message: 'ไม่พบบัญชี' });
  const ban = u.restrictions.find((r) => r.kind === 'lobby');
  if (ban) return realtime.send(socket, 'world:error', { code: 'LOBBY_RESTRICTED', message: 'บัญชีนี้ถูกจำกัดการเข้า Lobby ชั่วคราว', until: ban.ends_at, restrictionId: ban.id, appeal: ban.appeal_status });
  // เซสชันเดิมของบัญชีนี้ (อีกแท็บ/อุปกรณ์) → ปิดก่อน — ไม่มีตัวละครซ้ำ
  const old = byUser.get(userId);
  if (old) {
    if (old.socket !== socket) sendP(old, 'world:kicked', { reason: 'other_session', message: 'เปิด Lobby จากอีกหน้าต่างแล้ว' });
    removePlayer(old, 'left');
  }
  let room = null; let pos = null; let pid = null;
  const g = grace.get(userId);
  const want = msg && typeof msg.roomId === 'string' ? msg.roomId : null;
  if (!u.settings.showInLobby) room = getRoom(`p-${userId}`);
  else if (msg && msg.friend) {
    const fr = await joinFriendRoom(u, Number(msg.friend));
    if (fr.error) return realtime.send(socket, 'world:error', fr.error);
    room = fr.room;
  } else if (want && (validPublicId(want) || want === `p-${userId}`)) {
    const r = getRoom(want);
    const reservedForMe = r.reserved.has(userId);
    if (!reservedForMe && occupancy(r) >= cap(r)) {
      if (!msg.resume) return realtime.send(socket, 'world:error', { code: 'ROOM_FULL', message: `${r.name} เต็มแล้ว (${cap(r)} คน) — เลือกห้องอื่น` });
    } else if ([...r.players.values()].some((q) => u.blocks.has(q.userId))) {
      if (!msg.resume) return realtime.send(socket, 'world:error', { code: 'ROOM_UNAVAILABLE', message: 'เข้าห้องนี้ไม่ได้ — ลองห้องอื่น' });
    } else room = r;
  } else if (want) return realtime.send(socket, 'world:error', { code: 'BAD_ROOM', message: 'ไม่พบห้องนี้' });
  if (!room) room = pickRoom(u);
  if (!room) return realtime.send(socket, 'world:error', { code: 'ALL_FULL', message: 'ทุกห้องเต็มแล้ว ลองใหม่อีกครั้งภายหลัง' });
  // ตำแหน่ง: กลับมาในช่วง grace = ที่เดิม (ค่าในเซิร์ฟเวอร์) · หลังรีสตาร์ต = ค่าที่ client ขอ (ตรวจว่าอยู่ในที่เดินได้) · ไม่งั้นจุดเกิด
  if (g && g.until > now() && g.roomId === room.id) { pos = { x: g.x, z: g.z, ry: g.ry }; pid = g.pid; }
  else if (msg && msg.resume && Number.isFinite(msg.resume.x) && Number.isFinite(msg.resume.z) && msg.resume.roomId === room.id) {
    const [x, z] = phys().resolve(Number(msg.resume.x), Number(msg.resume.z));
    if (Math.hypot(x - msg.resume.x, z - msg.resume.z) < 0.05) pos = { x, z, ry: Number(msg.resume.ry) || 0 };
  }
  grace.delete(userId); room.reserved.delete(userId);
  if (!pos) pos = { ...spawnPoint(room), ry: Math.PI };
  const p = {
    pid: pid || pidOf(), userId, socket, room, name: u.username, outfit: u.outfit, colors: u.colors, settings: u.settings, createdAt: u.createdAt,
    friends: u.friends, blocks: u.blocks, mutes: u.mutes, restrictions: u.restrictions,
    x: pos.x, z: pos.z, ry: pos.ry, st: 'idle', seat: null, afk: false, ver: 1, lastMoveAt: now(), lastInputAt: now(), joinedAt: now(),
    chat: { last: 0, times: [], lastText: '', lastTextAt: 0, cids: cidsOf(userId) }, lastEmoteAt: 0, lastInviteAt: 0, sent: new Map(),
  };
  room.players.set(p.pid, p); byUser.set(userId, p); room.emptySince = null;
  const others = [...room.players.values()].filter((q) => sees(p, q));
  others.forEach((q) => p.sent.set(q.pid, q.ver));
  sendP(p, 'world:joined', { room: roomInfo(room), you: { pid: p.pid, x: r2(p.x), z: r2(p.z), ry: r2(p.ry), name: p.name, outfit: p.outfit, colors: p.colors || {} },
    players: others.map((q) => pub(q, p)), settings: p.settings, chatAllowed: chatAllowed(p), restrictions: p.restrictions.map(restrView), serverTime: now(),
    mapVersion: mapData.map.version });
  others.forEach((q) => { q.sent.set(p.pid, p.ver); sendP(q, 'world:add', { player: pub(p, q) }); });
  sendHistory(p);
  return p;
}
async function joinFriendRoom(u, friendId) {
  if (!u.friends.has(friendId)) return { error: { code: 'NOT_FRIEND', message: 'ตามได้เฉพาะเพื่อน' } };
  const f = byUser.get(friendId);
  if (!f || !f.room || f.room.private || f.blocks.has(u.id) || u.blocks.has(friendId)) return { error: { code: 'FRIEND_UNAVAILABLE', message: 'เพื่อนไม่ได้อยู่ใน Lobby ที่ตามไปได้' } };
  if (!f.settings.showInLobby || f.settings.joinMyRoom !== 'friends') return { error: { code: 'FRIEND_PRIVATE', message: 'เพื่อนปิดการให้ตามเข้าห้อง' } };
  if (occupancy(f.room) >= cap(f.room)) return { error: { code: 'ROOM_FULL', message: `${f.room.name} เต็มแล้ว` } };
  if ([...f.room.players.values()].some((q) => u.blocks.has(q.userId))) return { error: { code: 'ROOM_UNAVAILABLE', message: 'เข้าห้องนี้ไม่ได้' } };
  return { room: f.room };
}
function leave(p, reason = 'left') { removePlayer(p, reason); sendP(p, 'world:left', { reason }); }

/* ---------------- การเคลื่อนที่ (ตรวจฝั่งเซิร์ฟเวอร์) ---------------- */
function move(p, msg) {
  metrics.movesIn += 1;
  const x = Number(msg.x); const z = Number(msg.z); const ry = Number(msg.ry);
  if (![x, z, ry].every(Number.isFinite)) return;
  let st = STATES.includes(msg.st) ? msg.st : 'idle';
  const t = now();
  // งบระยะทาง (token bucket): สะสมตามเวลาจริง สูงสุดเท่าวิ่ง 1 วินาที — ข้อความที่มาติดกัน (เครื่องกระตุก/เน็ตกระตุก) ไม่ถูกดึงกลับผิด ๆ
  // แต่ความเร็วเฉลี่ยยังถูกจำกัดที่ runSpeed × speedSlack เสมอ (โกงวาร์ปไม่ได้)
  const cap = WORLD.runSpeed * WORLD.speedSlack + 0.12;
  const dt = Math.max(0, (t - p.lastMoveAt) / 1000);
  p.moveBudget = Math.min(cap, (p.moveBudget === undefined ? 0.12 : p.moveBudget) + WORLD.runSpeed * WORLD.speedSlack * dt);
  p.lastMoveAt = t;
  if (st === 'sit' && !p.seat) st = 'idle';
  if (p.seat && st !== 'sit') p.seat = null;
  if (p.seat) { p.st = 'sit'; return; }   // นั่งอยู่: ตำแหน่งถูกล็อกที่ม้านั่ง
  const maxD = p.moveBudget;   // ไม่มีค่าขั้นต่ำต่อข้อความ — ส่งถี่ ๆ ก็ไม่ได้ระยะเพิ่ม
  let dx = x - p.x; let dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > maxD) { dx *= maxD / d; dz *= maxD / d; }
  p.moveBudget = Math.max(0, p.moveBudget - Math.min(d, maxD));
  const [fx, fz] = phys().step(p.x, p.z, dx, dz);
  const changed = Math.hypot(fx - p.x, fz - p.z) > 0.005 || st !== p.st || Math.abs(ry - p.ry) > 0.02;
  p.x = fx; p.z = fz; p.ry = ((ry % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); p.st = st;
  if (Math.hypot(fx - x, fz - z) > WORLD.correctAfter) { metrics.corrections += 1; sendP(p, 'world:correct', { x: r2(fx), z: r2(fz) }); }
  if (changed) { p.ver += 1; touch(p); }
}
function touch(p) { p.lastInputAt = now(); if (p.afk) { p.afk = false; p.ver += 1; } }

function sit(p, msg) {
  const seat = (mapData.map.seats || []).find((s) => s.id === msg.seat);
  if (!seat) return sendP(p, 'world:error', { code: 'BAD_SEAT', message: 'ไม่พบที่นั่ง' });
  if (Math.hypot(seat.x - p.x, seat.z - p.z) > WORLD.seatRange) return sendP(p, 'world:error', { code: 'TOO_FAR', message: 'เดินเข้าไปใกล้ม้านั่งก่อน' });
  if ([...p.room.players.values()].some((q) => q !== p && q.seat && q.seat.id === seat.id)) return sendP(p, 'world:error', { code: 'SEAT_TAKEN', message: 'มีคนนั่งที่นี่แล้ว' });
  p.seat = seat; p.x = seat.x; p.z = seat.z; p.ry = seat.ry; p.st = 'sit'; p.ver += 1; touch(p);
  sendP(p, 'world:correct', { x: seat.x, z: seat.z, ry: seat.ry, st: 'sit' });
}
function stand(p) { if (p.seat) { p.seat = null; p.st = 'idle'; p.ver += 1; touch(p); } }

/* ---------------- tick: snapshot ---------------- */
function tick() {
  const t0 = process.hrtime.bigint();
  tickN += 1;
  const T = now();
  for (const room of rooms.values()) {
    if (!room.players.size) {
      if (room.id !== 'campus-1' && room.emptySince && T - room.emptySince > WORLD.emptyRoomTtlMs && !room.reserved.size) rooms.delete(room.id);
      continue;
    }
    const list = [...room.players.values()];
    for (const v of list) {
      const out = [];
      for (const q of list) {
        if (!sees(v, q)) continue;
        if (v.sent.get(q.pid) === q.ver) continue;
        const near = Math.hypot(q.x - v.x, q.z - v.z) <= WORLD.nearRadius;
        if (!near && tickN % WORLD.farEveryTicks !== 0) continue;
        out.push([q.pid, Math.round(q.x * 100), Math.round(q.z * 100), Math.round(q.ry * 100), ST_CODE[q.st], q.afk ? 1 : 0]);
        v.sent.set(q.pid, q.ver);
      }
      if (out.length) sendP(v, 'world:snap', { t: T, p: out });
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  metrics.ticks += 1; metrics.tickMsAvg = metrics.tickMsAvg * 0.98 + ms * 0.02; metrics.tickMsMax = Math.max(metrics.tickMsMax, ms);
}
function housekeeping() {
  const T = now();
  for (const [uid, g] of grace) if (g.until < T) grace.delete(uid);
  for (const [id, inv] of invites) if (T - inv.at > WORLD.inviteTtlMs) invites.delete(id);
  for (const room of rooms.values()) {
    for (const p of [...room.players.values()]) {
      const idle = T - p.lastInputAt;
      if (idle > WORLD.afkKickMs) { sendP(p, 'world:kicked', { reason: 'afk', message: 'ออกจาก Lobby อัตโนมัติ เพราะไม่ได้ขยับนาน 15 นาที' }); removePlayer(p, 'afk'); } else if (idle > WORLD.afkWarnMs && !p.afk) { p.afk = true; p.ver += 1; }
    }
  }
}

/* ---------------- แชท ---------------- */
function restrView(r) { return { id: r.id, kind: r.kind, reason: r.reason, until: r.ends_at, appeal: r.appeal_status, auto: r.auto }; }
function chatAllowed(p) {
  const T = now();
  const restricted = p.restrictions.find((r) => r.kind === 'chat' && new Date(r.ends_at).getTime() > T);
  const textRestricted = p.restrictions.find((r) => r.kind === 'text' && new Date(r.ends_at).getTime() > T);
  const ageOk = T - p.createdAt >= WORLD.textMinAccountAgeH * 3600 * 1000;
  const text = p.settings.chatMode === 'text' && ageOk && !restricted && !textRestricted;
  return { mode: p.settings.chatMode, phrases: p.settings.chatMode !== 'off' && !restricted, text, roomText: text,
    textBlockedReason: p.settings.chatMode !== 'text' ? 'setting' : !ageOk ? 'account_age' : (restricted || textRestricted) ? 'restricted' : null,
    restrictedUntil: restricted ? restricted.ends_at : null, textRestrictedUntil: textRestricted ? textRestricted.ends_at : null };
}
/** คนนี้ควรเห็นข้อความนี้ไหม (บล็อก/ปิดเสียง/ปิดแชท/ไม่ได้เปิดพิมพ์เอง = ไม่ส่ง) */
function canReceive(v, p, kind) {
  return v === p || (sees(v, p) && !v.mutes.has(p.userId) && v.settings.chatMode !== 'off' && (kind === 'phrase' || v.settings.chatMode === 'text'));
}
const CID = /^[a-z0-9-]{4,24}$/;
// cid ของข้อความที่ส่งแล้ว (ต่อบัญชี · อยู่ข้ามการหลุด/กลับเข้าใหม่) → ส่งซ้ำหลังเน็ตกลับมา = ไม่กระจายซ้ำ
const sentCids = new Map();
function cidsOf(userId) {
  let m = sentCids.get(userId);
  if (!m) { m = new Map(); sentCids.set(userId, m); if (sentCids.size > 5000) sentCids.delete(sentCids.keys().next().value); }
  return m;
}
async function chat(p, msg) {
  const mode = msg.mode === 'room' ? 'room' : 'local';
  const cid = CID.test(String(msg.cid || '')) ? String(msg.cid) : null;
  const allow = chatAllowed(p);
  const err = (code, message, extra = {}) => sendP(p, 'world:chat_error', { code, message, cid, ...extra });
  // ส่งซ้ำหลังเน็ตหลุด (client ส่ง cid เดิม) → ตอบรับซ้ำ ไม่กระจายข้อความซ้ำ
  if (cid && p.chat.cids.has(cid)) { const d = p.chat.cids.get(cid); return sendP(p, 'world:chat_ack', { cid, id: d.id, seq: d.seq, dup: true }); }
  if (!allow.phrases) return err(allow.restrictedUntil ? 'CHAT_RESTRICTED' : 'CHAT_OFF', allow.restrictedUntil ? 'ถูกจำกัดการแชทชั่วคราว' : 'ปิดแชทอยู่ — เปิดได้ในการตั้งค่า Lobby', { until: allow.restrictedUntil });
  const T = now();
  if (T - p.chat.last < WORLD.chatMinIntervalMs) return err('RATE', 'ส่งเร็วเกินไป รอสักครู่');
  p.chat.times = p.chat.times.filter((x) => T - x < WORLD.chatBurst.windowMs);
  if (p.chat.times.length >= WORLD.chatBurst.limit) return err('RATE', 'ส่งข้อความถี่เกินไป พักสักครู่นะ');
  let kind; let content; let phraseId = null;
  if (msg.phrase) {
    const ph = PHRASE_BY_ID[msg.phrase];
    if (!ph) return err('BAD_PHRASE', 'ไม่พบประโยคนี้');
    kind = 'phrase'; content = ph.en; phraseId = ph.id;
  } else {
    if (!allow.text) {
      return err('TEXT_NOT_ALLOWED', allow.textBlockedReason === 'account_age' ? 'พิมพ์ข้อความเองได้เมื่อบัญชีอายุครบ 3 วัน — ใช้ประโยคสำเร็จรูปได้เลย'
        : allow.textBlockedReason === 'restricted' ? 'ผู้ดูแลปิดการพิมพ์ข้อความเองชั่วคราว — ยังใช้ประโยคสำเร็จรูปได้' : 'เปิด "พิมพ์ข้อความเอง" ในการตั้งค่า Lobby ก่อน');
    }
    if (typeof msg.text !== 'string') return err('BAD_TEXT', 'ข้อความไม่ถูกต้อง');
    const raw = msg.text;
    if (raw.length > WORLD.chatMaxLen * 2) return err('TOO_LONG', `ยาวได้ไม่เกิน ${WORLD.chatMaxLen} ตัวอักษร`);
    const f = chatFilter.filter(raw.slice(0, WORLD.chatMaxLen));
    const flaggedKind = f.flags.includes('contact') ? 'contact' : f.flags.includes('profanity') ? 'profanity' : null;
    if (flaggedKind) {
      // ข้อความที่ถูกกรอง "ไม่ถูกส่งต่อเลย" (ไม่แสดงเป็นดอกจันให้คนอื่นเห็น) · บันทึกให้ผู้ดูแล · นับเพื่อปิดแชทอัตโนมัติ
      await mod.logChat({ roomId: p.room.id, userId: p.userId, mode, kind: 'text', content: raw.slice(0, 240), flagged: flaggedKind, delivered: 0 });
      const auto = await mod.maybeAutoMute(p.userId);
      if (auto) { p.restrictions.push({ ...auto, appeal_status: 'none', auto: true }); sendP(p, 'world:restricted', { restriction: restrView({ ...auto, appeal_status: 'none', auto: true }) }); }
      p.chat.last = T; p.chat.times.push(T);
      return flaggedKind === 'contact'
        ? err('CONTACT_BLOCKED', 'เพื่อความปลอดภัย ห้ามส่งลิงก์ เบอร์โทร ไอดีโซเชียล หรือข้อมูลติดต่อใน Lobby')
        : err('FILTERED', 'ข้อความมีคำไม่เหมาะสม — ไม่ได้ส่ง');
    }
    if (f.block) return err('EMPTY', 'ข้อความว่าง');
    if (f.text === p.chat.lastText && T - p.chat.lastTextAt < WORLD.duplicateWindowMs) return err('DUPLICATE', 'ส่งข้อความซ้ำเดิม');
    kind = 'text'; content = f.text;
    p.chat.lastText = f.text; p.chat.lastTextAt = T;
  }
  p.chat.last = T; p.chat.times.push(T); touch(p);
  const recips = [...p.room.players.values()].filter((v) => canReceive(v, p, kind) && (mode === 'room' || Math.hypot(v.x - p.x, v.z - p.z) <= WORLD.localChatRange));
  const id = await mod.logChat({ roomId: p.room.id, userId: p.userId, mode, kind, content, flagged: null, delivered: recips.length - 1 });
  if (!p.room) return;   // ออกจากห้องระหว่างบันทึก
  p.room.chatSeq = (p.room.chatSeq || 0) + 1;
  const seq = p.room.chatSeq;
  const payload = { id, seq, from: p.pid, name: p.name, mode, kind, phrase: phraseId, text: kind === 'text' ? content : null, ts: T };
  recips.forEach((v) => sendP(v, 'world:chat', payload));
  if (cid) {
    p.chat.cids.set(cid, { id, seq });
    if (p.chat.cids.size > 60) p.chat.cids.delete(p.chat.cids.keys().next().value);
    sendP(p, 'world:chat_ack', { cid, id, seq });
  }
  // ประวัติแชทห้อง (เฉพาะที่จำเป็น: แชททั้งห้อง 10 นาทีล่าสุด สูงสุด 30 ข้อความ · ในหน่วยความจำเท่านั้น) — ให้คนที่เพิ่งเข้า/กลับมาเห็นบริบท
  if (mode === 'room') {
    p.room.chatLog = (p.room.chatLog || []).concat([{ payload, sender: p.userId, kind, at: T }]).slice(-WORLD.chatHistoryMax);
  }
}
/** ส่งประวัติแชทห้องให้ผู้เล่น (กรองตามบล็อก/ปิดเสียง/การตั้งค่าของผู้รับ) */
function sendHistory(p) {
  const T = now();
  const items = (p.room.chatLog || []).filter((e) => T - e.at < WORLD.chatHistoryMs).filter((e) => {
    const sender = byUser.get(e.sender);
    if (e.sender === p.userId) return true;
    if (p.blocks.has(e.sender) || p.mutes.has(e.sender) || p.settings.chatMode === 'off') return false;
    if (sender && sender.blocks.has(p.userId)) return false;
    return e.kind === 'phrase' || p.settings.chatMode === 'text';
  }).map((e) => e.payload);
  if (items.length) sendP(p, 'world:chat_history', { items });
}

/* ---------------- ท่าทาง / โต้ตอบ / คำชวน ---------------- */
function emote(p, msg) {
  if (!EMOTES[msg.e]) return;
  const T = now();
  if (T - p.lastEmoteAt < 1200) return;
  p.lastEmoteAt = T; touch(p);
  toRoom(p.room, 'world:emote', () => ({ pid: p.pid, e: msg.e }), (v) => v === p || (sees(v, p) && !v.mutes.has(p.userId)));
}
function target(p, pid) {
  const q = p.room && p.room.players.get(String(pid || ''));
  return q && sees(p, q) ? q : null;
}
function wave(p, msg) {
  const q = target(p, msg.pid);
  if (!q) return sendP(p, 'world:error', { code: 'NO_PLAYER', message: 'ไม่พบผู้เล่นนี้ในห้อง' });
  if (Math.hypot(q.x - p.x, q.z - p.z) > WORLD.interactRange * 2) return sendP(p, 'world:error', { code: 'TOO_FAR', message: 'เดินเข้าไปใกล้อีกนิด' });
  const T = now();
  if (T - p.lastEmoteAt < 1200) return;
  p.lastEmoteAt = T; touch(p);
  toRoom(p.room, 'world:emote', () => ({ pid: p.pid, e: 'wave', to: q.pid }), (v) => v === p || (sees(v, p) && !v.mutes.has(p.userId)));
  if (!q.mutes.has(p.userId)) sendP(q, 'world:waved', { from: p.pid, name: p.name });
}
function canInvite(p, q) {
  const friends = p.friends.has(q.userId);
  const s = q.settings;
  if (s.practiceInvites === 'nobody') return { code: 'INVITES_OFF', message: 'ผู้เล่นนี้ปิดรับคำชวน' };
  if (s.practiceInvites === 'friends' && !friends) return { code: 'FRIENDS_ONLY', message: 'ผู้เล่นนี้รับคำชวนจากเพื่อนเท่านั้น' };
  if (friends && !s.allowFriendInvites) return { code: 'INVITES_OFF', message: 'ผู้เล่นนี้ปิดรับคำชวน' };
  if (!friends && Math.hypot(q.x - p.x, q.z - p.z) > WORLD.interactRange) return { code: 'TOO_FAR', message: 'ชวนคนที่ยังไม่ใช่เพื่อนได้เมื่ออยู่ใกล้กัน — เดินเข้าไปใกล้อีกนิด' };
  return null;
}
async function invite(p, msg) {
  const q = target(p, msg.pid);
  if (!q) return sendP(p, 'world:error', { code: 'NO_PLAYER', message: 'ไม่พบผู้เล่นนี้ในห้อง' });
  const kind = ['practice', 'battle', 'ranked'].includes(msg.kind) ? msg.kind : null;
  if (!kind) return;
  const T = now();
  if (T - p.lastInviteAt < 8000) return sendP(p, 'world:error', { code: 'RATE', message: 'ชวนถี่เกินไป รอสักครู่' });
  const no = canInvite(p, q);
  if (no) return sendP(p, 'world:error', no);
  if (kind === 'ranked') {
    // Ranked ทีม 2 คน ใช้ระบบปาร์ตี้เดิม (เพื่อนเท่านั้น · ตรวจบล็อก/ออนไลน์/ไม่อยู่ในเกม) — คำชวนไปโผล่ใน Ranked ตามปกติ
    if (!p.friends.has(q.userId)) return sendP(p, 'world:error', { code: 'FRIENDS_ONLY', message: 'ชวนตั้งทีม Ranked ได้เฉพาะเพื่อน' });
    p.lastInviteAt = T;
    await require('../ranked/teams').invite(p.userId, q.userId);
    return sendP(p, 'world:invite_sent', { to: q.pid, kind });
  }
  if ([...invites.values()].filter((i) => i.from === p).length >= 3) return sendP(p, 'world:error', { code: 'RATE', message: 'มีคำชวนรอคำตอบอยู่หลายรายการแล้ว' });
  p.lastInviteAt = T;
  const level = ['A1', 'A2', 'B1', 'B2', 'C1'].includes(msg.level) ? msg.level : 'A1';
  const id = crypto.randomBytes(6).toString('hex');
  invites.set(id, { from: p, to: q, kind, level, at: T });
  sendP(q, 'world:invite', { id, from: { pid: p.pid, name: p.name }, kind, level, ttl: WORLD.inviteTtlMs });
  sendP(p, 'world:invite_sent', { to: q.pid, kind, id });
}
async function inviteReply(p, msg) {
  const inv = invites.get(String(msg.id || ''));
  if (!inv || inv.to !== p) return sendP(p, 'world:error', { code: 'INVITE_EXPIRED', message: 'คำชวนหมดอายุแล้ว' });
  invites.delete(msg.id);
  const from = inv.from;
  if (!msg.accept) return sendP(from, 'world:invite_result', { id: msg.id, accepted: false, name: p.name });
  if (!from.room || byUser.get(from.userId) !== from || from.blocks.has(p.userId) || p.blocks.has(from.userId)) return sendP(p, 'world:error', { code: 'INVITE_EXPIRED', message: 'ผู้ชวนออกจาก Lobby แล้ว' });
  // Vocabulary practice / Friendly Match = ห้องแข่งคำศัพท์เดิม (rooms.js) — ไม่สร้างระบบเรียนซ้ำ · คะแนน/EXP ตามกติกาเดิม
  const code = await require('../../rooms').createFriendlyRoom(from.userId, p.userId, { level: inv.level, questionCount: inv.kind === 'battle' ? 15 : 10 });
  if (!code) return sendP(p, 'world:error', { code: 'FAILED', message: 'สร้างห้องไม่สำเร็จ' });
  sendP(from, 'world:invite_result', { id: msg.id, accepted: true, name: p.name, code });
  sendP(p, 'world:invite_result', { id: msg.id, accepted: true, name: from.name, code });
}

/* ---------------- อัปเดตจาก REST (บล็อก/ปิดเสียง/ชุด/การตั้งค่า/การจำกัดสิทธิ์) ---------------- */
function onBlock(a, b) {
  const pa = byUser.get(a); const pb = byUser.get(b);
  if (pa) pa.blocks.add(b);
  if (pb) pb.blocks.add(a);
  if (pa && pb && pa.room === pb.room) { sendP(pa, 'world:remove', { pid: pb.pid, reason: 'hidden' }); sendP(pb, 'world:remove', { pid: pa.pid, reason: 'hidden' }); }
  for (const [id, inv] of invites) if ((inv.from.userId === a && inv.to.userId === b) || (inv.from.userId === b && inv.to.userId === a)) invites.delete(id);
}
function onUnblock(a, b) { const pa = byUser.get(a); const pb = byUser.get(b); if (pa) pa.blocks.delete(b); if (pb) pb.blocks.delete(a); }
function onMute(a, b, on) { const pa = byUser.get(a); if (pa) { if (on) pa.mutes.add(b); else pa.mutes.delete(b); } }
function onFriends(a, b, on) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const px = byUser.get(x); if (!px) continue;
    if (on) px.friends.add(y); else px.friends.delete(y);
    const py = byUser.get(y);
    if (py && px.room === py.room) sendP(px, 'world:friend', { pid: py.pid, friend: on });
  }
}
async function onOutfit(userId) {
  const p = byUser.get(userId);
  if (!p) return;
  const u = await loadUser(userId);
  if (!u) return;
  p.outfit = u.outfit; p.colors = u.colors;
  toRoom(p.room, 'world:outfit', () => ({ pid: p.pid, outfit: p.outfit, colors: p.colors }), (v) => v === p || sees(v, p));
}
async function onSettings(userId) {
  const p = byUser.get(userId);
  if (!p) return;
  const before = p.settings.showInLobby;
  p.settings = await settingsSvc.get(userId);
  if (before !== p.settings.showInLobby) sendP(p, 'world:rejoin', { reason: 'visibility' });   // ห้องสาธารณะ ↔ ห้องส่วนตัว
  else sendP(p, 'world:settings', { settings: p.settings, chatAllowed: chatAllowed(p) });
}
async function onRestriction(userId) {
  const p = byUser.get(userId);
  if (!p) return;
  p.restrictions = await mod.activeRestrictions(userId);
  const ban = p.restrictions.find((r) => r.kind === 'lobby');
  if (ban) { sendP(p, 'world:kicked', { reason: 'restricted', message: 'บัญชีนี้ถูกจำกัดการเข้า Lobby ชั่วคราว', until: ban.ends_at }); removePlayer(p, 'left'); return; }
  sendP(p, 'world:settings', { settings: p.settings, chatAllowed: chatAllowed(p), restrictions: p.restrictions.map(restrView) });
}

/** หาผู้เล่นจาก pid ที่ผู้ขอ "มองเห็นได้" ในห้องเดียวกัน (REST ใช้ — ไม่รับ user id จาก client) */
function resolvePid(viewerId, pid) {
  const v = byUser.get(viewerId);
  if (!v || !v.room) return null;
  const q = v.room.players.get(String(pid || ''));
  if (!q || !sees(v, q)) return null;
  return { viewer: v, target: q, distance: Math.hypot(q.x - v.x, q.z - v.z) };
}
function roomsList(userId) {
  const me = byUser.get(userId);
  const out = [];
  for (let i = 1; i <= WORLD.maxRooms; i += 1) {
    const r = rooms.get(`campus-${i}`);
    if (!r && i > 1) continue;
    const room = r || getRoom('campus-1');
    out.push({ ...roomInfo(room), occupancy: occupancy(room), friends: me ? [...room.players.values()].filter((q) => me.friends.has(q.userId) && q.settings.showInLobby).length : 0, current: Boolean(me && me.room === room) });
  }
  const next = Array.from({ length: WORLD.maxRooms }, (_, k) => `campus-${k + 1}`).find((id) => !rooms.has(id));
  if (next) out.push({ id: next, name: roomName(next), private: false, count: 0, cap: WORLD.capacity, occupancy: 0, friends: 0, current: false, fresh: true });
  return out;
}
function friendsInLobby(userId, friendIds) {
  const out = [];
  for (const fid of friendIds) {
    const f = byUser.get(fid);
    if (!f || !f.room || f.room.private || !f.settings.showInLobby || f.blocks.has(userId)) continue;
    out.push({ userId: fid, name: f.name, roomId: f.room.id, roomName: f.room.name, canJoin: f.settings.joinMyRoom === 'friends' && occupancy(f.room) < cap(f.room) });
  }
  return out;
}

/* ---------------- ติดตั้ง ---------------- */
function handle(socket, msg) {
  const t = msg.type;
  if (t === 'world:join') { join(socket, msg).catch((e) => { console.error('[world/join]', e); realtime.send(socket, 'world:error', { code: 'FAILED', message: 'เข้า Lobby ไม่สำเร็จ' }); }); return true; }
  const p = byUser.get(socket.userId);
  if (!p || p.socket !== socket || !p.room) { if (t !== 'world:leave' && t !== 'world:move') realtime.send(socket, 'world:error', { code: 'NOT_IN_WORLD', message: 'ยังไม่ได้อยู่ใน Lobby' }); return true; }
  const run = (pr) => Promise.resolve(pr).catch((e) => { console.error('[world]', t, e); sendP(p, 'world:error', { code: 'FAILED', message: 'ทำรายการไม่สำเร็จ' }); });
  switch (t) {
    case 'world:leave': leave(p); break;
    case 'world:move': move(p, msg); break;
    case 'world:sit': sit(p, msg); break;
    case 'world:stand': stand(p); break;
    case 'world:emote': emote(p, msg); break;
    case 'world:wave': wave(p, msg); break;
    case 'world:chat': run(chat(p, msg)); break;
    case 'world:invite': run(invite(p, msg)); break;
    case 'world:invite_reply': run(inviteReply(p, msg)); break;
    case 'world:ping': sendP(p, 'world:pong', { t: msg.t, s: now() }); break;
    default: break;
  }
  return true;
}
let timers = [];
function init() {
  mapData.load();
  realtime.registerMessageHandler((socket, msg) => (typeof msg.type === 'string' && msg.type.startsWith('world:') ? handle(socket, msg) : false));
  realtime.registerDisconnectHandler((userId, socket) => {
    const p = byUser.get(userId);
    if (p && p.socket === socket) removePlayer(p, 'disconnected', { keepGrace: true });
  });
  timers = [setInterval(tick, 1000 / WORLD.tickHz), setInterval(housekeeping, 1000),
    setInterval(() => mod.purge().catch((e) => console.error('[world/purge]', e.message)), 24 * 3600 * 1000)];
  timers.forEach((x) => x.unref());
  mod.purge().catch(() => {});
}
function stats() {
  let players = 0;
  for (const r of rooms.values()) players += r.players.size;
  const secs = (now() - metrics.since) / 1000;
  return { rooms: [...rooms.values()].map(roomInfo), players, capacity: WORLD.capacity, tickHz: WORLD.tickHz, tickMsAvg: +metrics.tickMsAvg.toFixed(3), tickMsMax: +metrics.tickMsMax.toFixed(3),
    bytesOutPerSec: Math.round(metrics.bytesOut / Math.max(1, secs)), msgsOutPerSec: Math.round(metrics.msgsOut / Math.max(1, secs)), movesInPerSec: Math.round(metrics.movesIn / Math.max(1, secs)),
    corrections: metrics.corrections, memoryMB: +(process.memoryUsage().rss / 1048576).toFixed(1), cpu: process.cpuUsage(), uptimeS: Math.round(secs) };
}
function resetMetrics() { Object.assign(metrics, { ticks: 0, tickMsAvg: 0, tickMsMax: 0, bytesOut: 0, msgsOut: 0, movesIn: 0, corrections: 0, since: now() }); }

module.exports = { init, stats, resetMetrics, resolvePid, roomsList, friendsInLobby, onBlock, onUnblock, onMute, onFriends, onOutfit, onSettings, onRestriction,
  _state: { rooms, byUser, grace, invites }, _tick: tick, _housekeeping: housekeeping };
