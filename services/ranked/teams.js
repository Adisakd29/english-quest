/*
  Ranked Quest — โหมดทีม 2 คน (2v2)
  - ปาร์ตี้: ชวนเพื่อน (ต้องเป็นเพื่อน + ออนไลน์ + ไม่ได้บล็อกกัน) · หัวหน้าทีมเป็นคนกดหาเกม
  - คิวทีม: จับทีมที่ QR เฉลี่ยใกล้กัน (ช่วงขยายตามเวลารอเหมือน 1v1) · CEFR ของทั้ง 4 คนห่างกันไม่เกิน 1 -> 2 ระดับ
    League ที่ยังแข่งกับ NPC (Trail Finch – River Otter) เจอทีม NPC ของ League นั้น
  - เกม: เซิร์ฟเวอร์ควบคุม ไม่มี Host · ทุกคนได้ข้อเดียวกันพร้อมกัน · คะแนนทีม = คะแนนรวมของสมาชิก
  - QR: นับเป็นเกม Ranked ของแต่ละคน คิดจาก QR เฉลี่ยของทีมตรงข้าม (กติกาคุ้มครอง/เลื่อนขั้นเหมือนเดิม)
  - หลุดเกิน grace: คนนั้นนับเป็นแพ้ ข้อที่เหลือได้ 0 แต่เกมของคนอื่นเล่นต่อจนจบ
  - Battle HP: HP รวมของทีม 100 · แต่ละคนทำ/รับ Damage ตาม teamDamageScale · คนที่ออกแล้วไม่ทำ/ไม่รับ Damage
    ทั้งทีมออกหมด = ทีมนั้นแพ้ทันที (อีกทีม Victory by Forfeit)
*/
const pool = require('../../config/db');
const events = require('../events');
const realtime = require('../../realtime');
const { isBlockedEither } = require('../../utils/blocks');
const { LEAGUE_BY_ID, LEAGUES, RULES, modeOf, isHighRank, groupGapAllowed, MATCHMAKING } = require('../../config/leagues');
const NPCS = require('../../config/rankedNpcs');
const { buildMatchQuestions, publicQuestion } = require('./questionBank');
const { planAnswers } = require('./npcEngine');
const { newSeed, mulberry32, shuffle } = require('./rng');
const svc = require('./matchService');
const pvp = require('./pvp');
const { BATTLE } = require('../../config/battle');
const battle = require('./battle');

const T = pvp.T;
const send = (uid, type, payload) => realtime.sendToUser(uid, type, payload);
const logErr = (err) => console.error('[ranked/team]', err.message);

const parties = new Map();     // partyId -> { id, leader, members: [uid, uid] }
const userParty = new Map();   // uid -> partyId
const invites = new Map();     // inviteeUid -> { from, partyId, at }
const queue = new Map();       // partyId -> entry
const live = new Map();        // matchId -> live team match
const userLive = new Map();    // uid -> matchId
let partySeq = 1;

/* ---------------- ปาร์ตี้ ---------------- */
async function areFriends(a, b) {
  const { rows } = await pool.query(
    `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [a, b]);
  return Boolean(rows[0]);
}
async function partyView(party) {
  const members = [];
  for (const uid of party.members) members.push(await pvp.publicPlayer(uid));
  return { partyId: party.id, leader: party.leader, members };
}
async function broadcastParty(party) {
  const view = await partyView(party);
  party.members.forEach((uid) => send(uid, 'ranked:party', view));
}
const busy = (uid) => userLive.has(uid) || pvp._state.userLive.has(uid);

async function invite(from, toUserId) {
  const to = Number(toUserId);
  const err = (code, message) => send(from, 'ranked:error', { code, message });
  if (!to || to === from) return err('BAD_INVITE', 'ชวนผู้เล่นนี้ไม่ได้');
  if (!(await areFriends(from, to))) return err('NOT_FRIEND', 'ชวนได้เฉพาะเพื่อน');
  if (await isBlockedEither(from, to)) return err('BLOCKED', 'ชวนผู้เล่นนี้ไม่ได้');
  if (!realtime.isOnline(to)) return err('OFFLINE', 'เพื่อนยังไม่ออนไลน์');
  if (userParty.has(to) || busy(to) || await svc.activeMatchId(to)) return err('BUSY', 'เพื่อนอยู่ในทีมหรือในเกมอื่นอยู่');
  let party = parties.get(userParty.get(from));
  if (party && party.members.length >= 2) return err('PARTY_FULL', 'ทีมครบ 2 คนแล้ว');
  if (!party) {
    party = { id: `p${partySeq++}`, leader: from, members: [from] };
    parties.set(party.id, party); userParty.set(from, party.id);
  }
  invites.set(to, { from, partyId: party.id, at: Date.now() });
  const fromInfo = await pvp.publicPlayer(from);
  send(to, 'ranked:party_invited', { partyId: party.id, from: fromInfo });
  send(from, 'ranked:party_invite_sent', { to });
  await broadcastParty(party);
}

async function respond(uid, { partyId, accept }) {
  const inv = invites.get(uid);
  invites.delete(uid);
  const party = inv && parties.get(inv.partyId);
  if (!inv || inv.partyId !== partyId || !party) return send(uid, 'ranked:error', { code: 'INVITE_EXPIRED', message: 'คำชวนหมดอายุแล้ว' });
  if (!accept) return send(inv.from, 'ranked:party_declined', { userId: uid });
  if (party.members.length >= 2 || userParty.has(uid)) return send(uid, 'ranked:error', { code: 'PARTY_FULL', message: 'ทีมนี้ครบแล้ว' });
  party.members.push(uid); userParty.set(uid, party.id);
  await broadcastParty(party);
}

function leaveParty(uid, notify = true) {
  const party = parties.get(userParty.get(uid));
  userParty.delete(uid);
  if (!party) return;
  dropEntry(party.id);
  party.members = party.members.filter((m) => m !== uid);
  if (party.members.length === 0) { parties.delete(party.id); return; }
  party.leader = party.members[0];
  if (notify) {
    party.members.forEach((m) => send(m, 'ranked:party_left', { userId: uid }));
    broadcastParty(party).catch(logErr);
  }
  if (party.members.length === 1) { parties.delete(party.id); userParty.delete(party.members[0]); }
  if (notify) send(uid, 'ranked:party', null);
}

/* ---------------- คิวทีม ---------------- */
async function memberInfo(uid, mode = 'vocab') {
  const { row } = await svc.getOrCreateProfile(uid, mode);
  const { cefr } = await svc.getUserCefr(uid);
  return { uid, qr: row.quest_rating, league: row.league, division: row.division_index, cefr };
}
const npcOnly = (m) => LEAGUE_BY_ID[m.league].npcShare[m.division] >= 1;

async function joinQueue(uid, mode = 'vocab') {
  mode = modeOf(mode);
  const party = parties.get(userParty.get(uid));
  const err = (code, message) => send(uid, 'ranked:error', { code, message });
  if (!party || party.members.length !== 2) return err('NO_PARTY', 'ต้องมีเพื่อนร่วมทีม 2 คนก่อน');
  if (party.leader !== uid) return err('NOT_LEADER', 'หัวหน้าทีมเป็นคนกดหาเกม');
  for (const m of party.members) {
    if (!realtime.isOnline(m)) return err('OFFLINE', 'เพื่อนร่วมทีมหลุดการเชื่อมต่อ');
    if (busy(m) || await svc.activeMatchId(m)) return err('MATCH_IN_PROGRESS', 'มีสมาชิกที่ยังเล่นเกมอื่นไม่จบ');
    try { await svc.assertNoCooldown(m); } catch (e) {
      return err('RANKED_COOLDOWN', m === uid ? e.message : 'เพื่อนร่วมทีมยังอยู่ในช่วงพัก Ranked (ออกจากเกมบ่อยเกินไป)');
    }
    pvp.leaveQueue(m, false);
  }
  const members = await Promise.all(party.members.map((m) => memberInfo(m, mode)));
  // แรงค์ของสมาชิกในทีมต้องห่างกันไม่เกินเพดาน (กันพาคนแรงค์ต่ำมากเข้าทีมแรงค์สูงเพื่อเลี่ยงระบบจับคู่)
  if (!groupGapAllowed(members.map((m) => m.league))) {
    return err('RANK_GAP', `สมาชิกทีมมีแรงค์ห่างกันเกินไป — ลงทีมด้วยกันได้เมื่อแรงค์ต่างกันไม่เกิน ${MATCHMAKING.maxLeagueGap} ระดับ`);
  }
  const high = members.some((m) => isHighRank(m.league));
  const entry = { partyId: party.id, mode, members, avgQr: members.reduce((a, m) => a + m.qr, 0) / 2, joinedAt: Date.now(), offered: false,
    // ทีมที่มีสมาชิกแรงค์สูง: ห้ามเจอทีม NPC เด็ดขาด (ตรวจฝั่งเซิร์ฟเวอร์อีกครั้งตอนหัวหน้าทีมกด)
    canNpc: !high && members.some((m) => npcOnly(m) || LEAGUE_BY_ID[m.league].npcFallback === 'offer'), offline: false, offlineTimer: null };
  // ทั้งทีมยังอยู่ League ที่แข่งกับ NPC -> เจอทีม NPC ทันที
  if (!high && members.every(npcOnly)) return createMatch(entry, null).catch(logErr);
  queue.set(party.id, entry);
  party.members.forEach((m) => send(m, 'ranked:team_queue', { status: 'searching', since: entry.joinedAt, mode }));
  tick().catch(logErr);
}

function dropEntry(partyId) {
  const e = queue.get(partyId);
  if (e && e.offlineTimer) clearTimeout(e.offlineTimer);
  return queue.delete(partyId);
}
function leaveQueue(uid) {
  const party = parties.get(userParty.get(uid));
  if (party && dropEntry(party.id)) party.members.forEach((m) => send(m, 'ranked:team_queue', { status: 'left' }));
}
pvp.setTeamQueueCheck((uid) => { const p = userParty.get(uid); return Boolean(p && queue.has(p)); });

let ticking = false;
async function tick() {
  if (ticking || queue.size === 0) return;
  ticking = true;
  try {
    const now = Date.now();
    const entries = [...queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const taken = new Set();
    for (const a of entries) {
      if (taken.has(a.partyId) || a.offline) continue;
      const waitA = now - a.joinedAt;
      if (!a.offered && waitA >= T.offerAfterMs && a.canNpc) {
        a.offered = true;
        // แรงค์ระดับต้นที่อนุญาตให้เลือกได้ -> เสนอให้หัวหน้าทีมเลือกเอง · แรงค์สูงค้นหาต่อเนื่องเท่านั้น
        a.members.forEach((m) => send(m.uid, 'ranked:team_queue_offer', { kind: 'offer' }));
      }
      for (const b of entries) {
        if (b === a || taken.has(b.partyId) || b.mode !== a.mode || b.offline) continue;   // จับคู่เฉพาะโหมดเดียวกัน
        const wait = Math.max(waitA, now - b.joinedAt);
        const all = [...a.members, ...b.members];
        if (new Set(all.map((m) => m.uid)).size !== all.length) continue;            // ไม่มีผู้เล่นคนเดียวกันสองฝั่ง
        if (!groupGapAllowed(all.map((m) => m.league))) continue;                    // ผู้เล่นทั้ง 4 คนแรงค์ห่างไม่เกินเพดาน (ไม่ขยายตามเวลา)
        const win = Math.max(...all.map((m) => pvp.qrWindow(wait, LEAGUE_BY_ID[m.league])));
        if (Math.abs(a.avgQr - b.avgQr) > win) continue;
        const cefrs = all.map((m) => pvp.CEFR_N[m.cefr]);
        if (Math.max(...cefrs) - Math.min(...cefrs) > pvp.cefrGap(wait)) continue;
        let blocked = false;
        for (const x of a.members) for (const y of b.members) if (await isBlockedEither(x.uid, y.uid)) blocked = true;
        if (blocked) continue;
        if (!queue.has(a.partyId) || !queue.has(b.partyId)) continue;
        taken.add(a.partyId); taken.add(b.partyId);
        dropEntry(a.partyId); dropEntry(b.partyId);
        createMatch(a, b).catch(logErr);
        break;
      }
    }
  } finally {
    ticking = false;
  }
}

/* ---------------- สร้างเกมทีม ---------------- */
function npcTeam(entry, seed) {
  // ทีม NPC จาก League ของสมาชิกที่อยู่สูงกว่า (League บนสุดที่ไม่มี NPC ใช้ของ League ก่อนหน้า)
  const top = entry.members.reduce((x, m) => (LEAGUE_BY_ID[m.league].order > LEAGUE_BY_ID[x.league].order ? m : x));
  let lg = LEAGUE_BY_ID[top.league];
  while (lg && lg.npcs.length < 2) lg = LEAGUES.find((l) => l.order === lg.order - 1);
  return shuffle(lg.npcs, mulberry32(seed)).slice(0, 2).map((id) => NPCS.BY_ID[id]);
}

async function createMatch(a, b) {
  const season = await svc.getActiveSeason();
  const seed = newSeed();
  const humans = [...a.members, ...(b ? b.members : [])];
  const cefr = pvp.N_CEFR[Math.floor(humans.reduce((s, m) => s + pvp.CEFR_N[m.cefr], 0) / humans.length)];
  const lowest = humans.reduce((x, m) => (LEAGUE_BY_ID[m.league].order < LEAGUE_BY_ID[x.league].order ? m : x));
  const { mode } = a;
  const questions = await buildMatchQuestions({ cefr, tier: LEAGUE_BY_ID[lowest.league].questionTier, seed, mode });
  const npcs = b ? [] : npcTeam(a, seed);
  // slot 0,1 = ทีม 0 · slot 2,3 = ทีม 1
  const slots = [
    ...a.members.map((m, i) => ({ slot: i, team: 0, userId: m.uid, qr: m.qr })),
    ...(b ? b.members.map((m, i) => ({ slot: 2 + i, team: 1, userId: m.uid, qr: m.qr }))
      : npcs.map((n, i) => ({ slot: 2 + i, team: 1, npc: n, qr: n.rating }))),
  ];
  const plans = {};
  slots.filter((s) => s.npc).forEach((s) => { plans[s.slot] = planAnswers(s.npc, questions, cefr, seed + s.slot); });
  const client = await pool.connect();
  let matchId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ranked_matches (season_id, user_id, match_type, opponent_kind, league_at_start, division_at_start,
                                   cefr, seed, questions, npc_plan, current_index, team_member_ids, queue_ms, mode)
       VALUES ($1, $2, 'ranked', 'team', $3, $4, $5, $6, $7, $8, 0, $9, $10, $11) RETURNING id`,
      [season.id, a.members[0].uid, a.members[0].league, a.members[0].division, cefr, seed, JSON.stringify(questions),
        JSON.stringify(plans), humans.map((m) => m.uid), b ? Math.round(Date.now() - Math.min(a.joinedAt, b.joinedAt)) : 0, mode]);
    matchId = Number(ins.rows[0].id);
    for (const s of slots) {
      await client.query('INSERT INTO ranked_match_players (match_id, slot, team, user_id, npc_id, qr_before) VALUES ($1, $2, $3, $4, $5, $6)',
        [matchId, s.slot, s.team, s.userId || null, s.npc ? s.npc.id : null, s.qr]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    humans.forEach((m) => send(m.uid, 'ranked:error', { code: 'MATCH_FAILED', message: 'สร้างเกมทีมไม่สำเร็จ ลองใหม่อีกครั้ง' }));
    throw err;
  } finally {
    client.release();
  }
  for (const s of slots) s.info = s.npc ? NPCS.publicNpc(s.npc) : await pvp.publicPlayer(s.userId, mode);
  const m = {
    matchId, mode, slots, questions, cefr, plans, index: -1, phase: 'intro', openedAt: null,
    answered: new Set(), timer: null, npcTimers: [], finished: false, hpState: battle.newHpState(2), lastReveal: null,
  };
  live.set(matchId, m);
  humans.forEach((h) => userLive.set(h.uid, matchId));
  slots.filter((s) => s.userId).forEach((s) => send(s.userId, 'ranked:team_matched', {
    matchId, mode, total: questions.length, yourSlot: s.slot, yourTeam: s.team, cefr, startsInMs: T.introMs,
    players: slots.map((x) => ({ slot: x.slot, team: x.team, ...x.info })), teamHp: battle.hpOn() ? m.hpState.hp : null, hpMax: BATTLE.initialHp,
  }));
  m.timer = setTimeout(() => openQuestion(m, 0).catch(logErr), T.introMs);
}

/* ---------------- วงจรของแต่ละข้อ ---------------- */
const humansOf = (m) => m.slots.filter((s) => s.userId);
const broadcast = (m, type, payload) => humansOf(m).forEach((s) => send(s.userId, type, payload));
const questionPayload = (m) => ({
  matchId: m.matchId, index: m.index, total: m.questions.length, question: svc.questionView(m.questions[m.index], m.index),
  openedAt: new Date(m.openedAt).toISOString(), serverNow: new Date().toISOString(), questionMs: RULES.questionMs,
  teamHp: battle.hpOn() ? m.hpState.hp : null, hpMax: BATTLE.initialHp,
});
/** ทุกคนที่ต้องตอบตอบครบแล้วหรือยัง (คนที่ออกจากเกมไปแล้วไม่ต้องรอ) */
const allAnswered = (m) => m.slots.every((s) => m.answered.has(s.slot) || s.gone);

async function openQuestion(m, i) {
  if (m.finished) return;
  m.index = i; m.phase = 'question'; m.openedAt = Date.now(); m.answered = new Set();
  await pool.query('UPDATE ranked_matches SET current_index = $1, question_opened_at = to_timestamp($2 / 1000.0) WHERE id = $3', [i, m.openedAt, m.matchId]);
  broadcast(m, 'ranked:team_question', questionPayload(m));
  m.npcTimers.forEach(clearTimeout);
  m.npcTimers = m.slots.filter((s) => s.npc).map((s) => setTimeout(() => {
    const plan = m.plans[s.slot][i];
    if (m.finished || m.index !== i || m.phase !== 'question') return;
    m.answered.add(s.slot);
    record(m, s.slot, plan.choiceIndex, plan.correct, svc.pointsFor(plan.correct, plan.responseMs), plan.responseMs, false)
      .then(() => { broadcast(m, 'ranked:team_answered', { matchId: m.matchId, index: i, slot: s.slot }); if (allAnswered(m)) return reveal(m); return null; })
      .catch(logErr);
  }, m.plans[s.slot][i].responseMs));
  clearTimeout(m.timer);
  m.timer = setTimeout(() => reveal(m).catch(logErr), RULES.questionMs + svc.ANSWER_GRACE_MS);
}

/** บันทึกคำตอบ + จำ promise ที่ยังเขียนไม่เสร็จ (reveal ต้องรอให้ครบก่อน — กัน race ระหว่างคำตอบ NPC กับผู้เล่น) */
function record(m, ...args) {
  const p = recordNow(m, ...args);
  m.pending = m.pending || new Set();
  m.pending.add(p);
  p.finally(() => m.pending.delete(p)).catch(() => {});
  return p;
}

async function recordNow(m, slot, choice, correct, points, responseMs, learning = true) {
  await pool.query(
    `INSERT INTO ranked_answers (match_id, slot, question_index, choice_index, correct, points, response_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [m.matchId, slot, m.index, choice, correct, points, responseMs]);
  await pool.query('UPDATE ranked_match_players SET score = score + $1, correct_count = correct_count + $2 WHERE match_id = $3 AND slot = $4',
    [points, correct ? 1 : 0, m.matchId, slot]);
  const s = m.slots[slot];
  if (learning && s.userId) {
    const q = m.questions[m.index];
    await pool.query('INSERT INTO answer_events (user_id, skill, item_id, level, correct, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [s.userId, svc.SKILL_FOR_TYPE[q.type], (q.ref.wordId || `${q.ref.chapterId}:${q.ref.mode}`).slice(0, 32), q.ref.wordId ? q.cefr : null, correct, 'ranked']);
  }
}

async function answer(uid, { matchId, questionIndex, choiceIndex }) {
  const m = live.get(Number(matchId));
  const s = m && m.slots.find((x) => x.userId === uid);
  if (!m || m.finished || !s) return send(uid, 'ranked:error', { code: 'NOT_FOUND', message: 'ไม่พบเกมนี้' });
  if (m.phase !== 'question' || questionIndex !== m.index) return send(uid, 'ranked:error', { code: 'WRONG_QUESTION', message: 'ไม่ใช่ข้อปัจจุบัน' });
  if (m.answered.has(s.slot)) return send(uid, 'ranked:error', { code: 'DUPLICATE_ANSWER', message: 'ตอบข้อนี้ไปแล้ว' });
  const q = m.questions[m.index];
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choices.length) {
    return send(uid, 'ranked:error', { code: 'BAD_CHOICE', message: 'ตัวเลือกไม่ถูกต้อง' });
  }
  m.answered.add(s.slot);
  const elapsed = Date.now() - m.openedAt;
  const late = elapsed > RULES.questionMs + svc.ANSWER_GRACE_MS;
  const correct = !late && choiceIndex === q.correctIndex;
  try {
    await record(m, s.slot, late ? null : choiceIndex, correct, svc.pointsFor(correct, elapsed), late ? null : elapsed);
  } catch (err) {
    if (err.code === '23505') return send(uid, 'ranked:error', { code: 'DUPLICATE_ANSWER', message: 'ตอบข้อนี้ไปแล้ว' });
    throw err;
  }
  broadcast(m, 'ranked:team_answered', { matchId: m.matchId, index: m.index, slot: s.slot }); // ไม่บอกถูก/ผิดจนกว่าจะเฉลย
  if (allAnswered(m)) await reveal(m);
}

async function reveal(m) {
  if (m.finished || m.phase !== 'question') return;
  m.phase = 'reveal';
  clearTimeout(m.timer); m.npcTimers.forEach(clearTimeout);
  if (m.pending && m.pending.size) await Promise.allSettled([...m.pending]);   // รอคำตอบที่กำลังบันทึกให้เสร็จก่อน
  for (const s of m.slots) {
    if (!m.answered.has(s.slot)) {
      m.answered.add(s.slot);
      await record(m, s.slot, null, false, 0, null).catch((err) => { if (err.code !== '23505') throw err; });
    }
  }
  const q = m.questions[m.index];
  const answers = (await pool.query('SELECT slot, choice_index, correct, points, response_ms FROM ranked_answers WHERE match_id = $1 AND question_index = $2 ORDER BY slot',
    [m.matchId, m.index])).rows;
  // HP รวมของทีม: คนที่ออกจากเกมแล้วไม่ทำ/ไม่รับ Damage
  const res = battle.resolveQuestion(m.hpState, q,
    answers.map((a) => ({ slot: a.slot, side: m.slots[a.slot].team, correct: a.correct, neutral: Boolean(m.slots[a.slot].gone) })),
    { scale: BATTLE.teamDamageScale });
  m.hpState = res.state;
  for (const h of res.hits) {
    await pool.query('UPDATE ranked_answers SET damage = $1, damage_target = $2 WHERE match_id = $3 AND slot = $4 AND question_index = $5',
      [h.damage, h.target, m.matchId, h.slot, m.index]);
  }
  await pool.query('UPDATE ranked_matches SET hp = $1, hp_min = $2, combo = $3 WHERE id = $4',
    [JSON.stringify(res.state.hp), JSON.stringify(res.state.min), JSON.stringify(res.state.streak), m.matchId]);
  const scores = (await pool.query('SELECT slot, team, score FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.matchId])).rows;
  const teamScores = [0, 1].map((t) => scores.filter((r) => r.team === t).reduce((a, r) => a + r.score, 0));
  m.teamScores = teamScores;
  const isLast = res.ko || m.index === m.questions.length - 1;
  m.lastReveal = {
    matchId: m.matchId, index: m.index, correctIndex: q.correctIndex, explain: q.explain, isLast, ko: res.ko, nextInMs: T.revealMs,
    answers, playerScores: scores.map((r) => r.score), teamScores, teamHp: battle.hpOn() ? res.state.hp : null, hpMax: BATTLE.initialHp,
    hits: res.hits.map((h) => ({ slot: h.slot, damage: h.damage, target: h.target })),
    teamTaken: res.taken,
  };
  broadcast(m, 'ranked:team_reveal', m.lastReveal);
  m.timer = setTimeout(() => (isLast ? finish(m).catch(logErr) : openQuestion(m, m.index + 1).catch(logErr)), T.revealMs);
}

/* ---------------- จบเกม ---------------- */
async function finish(m, { forfeitTeam = null } = {}) {
  if (m.finished) return;
  m.finished = true;
  clearTimeout(m.timer); m.npcTimers.forEach(clearTimeout);
  m.slots.forEach((s) => s.graceTimer && clearTimeout(s.graceTimer));
  const client = await pool.connect();
  const results = {};
  try {
    await client.query('BEGIN');
    const mrow = (await client.query('SELECT * FROM ranked_matches WHERE id = $1 FOR UPDATE', [m.matchId])).rows[0];
    if (mrow.status !== 'active') { await client.query('ROLLBACK'); return; }
    const players = (await client.query('SELECT * FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.matchId])).rows;
    const teamScore = [0, 1].map((t) => players.filter((p) => p.team === t).reduce((a, p) => a + p.score, 0));
    const teamRating = [0, 1].map((t) => { const ps = players.filter((p) => p.team === t); return ps.reduce((a, p) => a + p.qr_before, 0) / ps.length; });
    const hp = m.hpState.hp;
    const all = (await client.query('SELECT * FROM ranked_answers WHERE match_id = $1 ORDER BY question_index', [m.matchId])).rows;
    let teamOutcome; let resultReason; let decidedBy = null;
    if (forfeitTeam !== null) {
      teamOutcome = forfeitTeam === 0 ? ['loss', 'win'] : ['win', 'loss'];
      const reasons = m.slots.filter((x) => x.team === forfeitTeam && x.userId).map((x) => x.goneReason);
      resultReason = reasons.includes('surrender') ? 'surrender' : 'disconnect';
    } else {
      const d = battle.decide([0, 1].map((t) => svc.sideStats(hp[t], all.filter((a) => m.slots[a.slot].team === t))));
      teamOutcome = d.winner === null ? ['draw', 'draw'] : d.winner === 0 ? ['win', 'loss'] : ['loss', 'win'];
      resultReason = d.reason; decidedBy = d.decidedBy;
    }
    for (const p of players) {
      const s = m.slots[p.slot];
      // คนที่ออกจากเกม/หลุดเกินเวลา นับเป็นแพ้ + penalty (เพื่อนร่วมทีมยังได้ผลตามผลของทีม)
      const outcome = s.gone ? 'loss' : teamOutcome[p.team];
      if (!p.user_id) {
        await client.query('UPDATE ranked_match_players SET outcome = $1, final_hp = $2 WHERE match_id = $3 AND slot = $4', [teamOutcome[p.team], hp[p.team], m.matchId, p.slot]);
        continue;
      }
      const { r, before, penalty } = await svc.applyOutcome(client, {
        pvp: !m.slots.some((x) => x.npc),   // เจอทีมผู้เล่นจริง -> นับเป็นแมตช์เลื่อนแรงค์ได้ (แรงค์สูง)
        userId: p.user_id, seasonId: mrow.season_id, matchId: m.matchId, matchType: 'ranked', outcome, opponentRating: teamRating[1 - p.team],
        forfeit: s.gone ? { reason: s.goneReason || 'disconnect', likelyTechnical: s.goneReason === 'disconnect' && s.goneHpLead } : null,
        mode: m.mode,
      });
      const answers = all.filter((a) => a.slot === p.slot);
      const mate = m.slots.find((x) => x.team === p.team && x.slot !== p.slot);
      const result = svc.buildResult({
        m: mrow, answers, you: { ...p, score: teamScore[p.team] }, opp: { score: teamScore[1 - p.team] }, r, before, outcome,
        hp: battle.hpOn() ? { you: hp[p.team], opponent: hp[1 - p.team], max: BATTLE.initialHp } : null, resultReason, decidedBy, penalty,
        forfeitReason: s.gone ? (s.goneReason || 'disconnect') : null,
        opponentForfeited: forfeitTeam !== null && forfeitTeam !== p.team,
        forfeited: Boolean(s.gone), opponent: (() => {
          const opp = m.slots.filter((x) => x.team !== p.team);
          const allNpc = opp.every((x) => x.npc);
          return { name: opp.map((x) => x.info.name).join(' & '), isNpc: allNpc, label: allNpc ? opp[0].info.label : 'TEAM' };
        })(),
      });
      result.team = {
        yourScore: p.score, teammate: { name: mate.info.name, score: players[mate.slot].score },
        members: m.slots.map((x) => ({ slot: x.slot, team: x.team, name: x.info.name, score: players[x.slot].score, isNpc: Boolean(x.npc), label: x.info.label || 'PLAYER' })),
      };
      await svc.awardMatchExp(client, p.user_id, result);
      results[p.slot] = result;
      await client.query(
        `UPDATE ranked_match_players SET qr_after = $1, outcome = $2, result = $3, final_hp = $4, forfeit_reason = $5, counted_abandon = $6, qr_penalty = $7
          WHERE match_id = $8 AND slot = $9`,
        [r.qr, outcome, JSON.stringify(result), hp[p.team], s.gone ? (s.goneReason || 'disconnect') : null,
          Boolean(penalty && penalty.counted), penalty ? penalty.amount : 0, m.matchId, p.slot]);
    }
    await client.query(
      `UPDATE ranked_matches SET status = 'finished', finished_at = NOW(), result = $1, end_reason = $2, result_reason = $3,
              forfeit_reason = $4, final_hp_p1 = $5, final_hp_p2 = $6, reconnect_deadline = NULL WHERE id = $7`,
      [JSON.stringify(results[0] || {}), m.slots.some((x) => x.gone) ? 'disconnect' : 'completed', resultReason,
        forfeitTeam !== null ? resultReason : null, hp[0], hp[1], m.matchId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    live.delete(m.matchId);
    humansOf(m).forEach((s) => { if (userLive.get(s.userId) === m.matchId) userLive.delete(s.userId); });
  }
  humansOf(m).forEach((s) => send(s.userId, 'ranked:team_ended', { matchId: m.matchId, result: results[s.slot] }));
  humansOf(m).forEach((s) => { if (!s.gone && results[s.slot]) events.recordRound(s.userId, `ranked:${m.matchId}`, { correct: results[s.slot].correct, total: results[s.slot].total }); });
}

/** ผู้เล่นออกจากเกม (surrender = กดออกเอง · disconnect = หลุดเกิน grace): ข้อที่เหลือไม่ทำ/ไม่รับ Damage
    ทั้งทีมออกหมด -> ทีมนั้นแพ้ทันที */
function markGone(m, slot, reason = 'disconnect') {
  const s = m.slots[slot];
  if (s.gone || m.finished) return null;
  s.gone = true; s.goneReason = reason;
  const ts = m.teamScores || [0, 0];
  s.goneHpLead = battle.isLeading(m.hpState.hp[s.team], m.hpState.hp[1 - s.team], ts[s.team], ts[1 - s.team]);
  broadcast(m, 'ranked:team_status', { matchId: m.matchId, slot, connected: false, gone: true, reason });
  const teamGone = [0, 1].find((t) => { const hs = humansOf(m).filter((h) => h.team === t); return hs.length > 0 && hs.every((h) => h.gone); });
  if (teamGone !== undefined) return finish(m, { forfeitTeam: teamGone }).catch(logErr);
  if (m.phase === 'question' && allAnswered(m)) return reveal(m).catch(logErr);
  return null;
}

/* ---------------- หลุด / กลับมา ---------------- */
function onDisconnect(uid, _socket, { stillOnline } = {}) {
  if (stillOnline) return;
  invites.delete(uid);
  const m = live.get(userLive.get(uid));
  if (!m || m.finished) {
    // ทีมกำลังรอในคิว: พักการค้นหาไว้ให้กลับมาต่อได้ (ระหว่างนี้ไม่ถูกจับคู่) · ไม่กลับมาในเวลา = ออกจากทีมตามเดิม
    const pid = userParty.get(uid);
    const qe = pid && queue.get(pid);
    if (qe) {
      qe.offline = true;
      clearTimeout(qe.offlineTimer);
      qe.offlineTimer = setTimeout(() => { if (queue.get(pid) === qe && qe.offline) { dropEntry(pid); leaveParty(uid); } }, MATCHMAKING.queueReconnectGraceMs);
      if (qe.offlineTimer.unref) qe.offlineTimer.unref();
      return;
    }
    leaveParty(uid); return;
  }
  const s = m.slots.find((x) => x.userId === uid);
  if (!s || s.gone) return;
  if (s.graceTimer) return;
  const until = Date.now() + T.graceMs;
  s.graceUntil = until;
  s.graceTimer = setTimeout(() => { s.graceTimer = null; markGone(m, s.slot, 'disconnect'); }, T.graceMs);
  pool.query('UPDATE ranked_matches SET disconnects = disconnects + 1 WHERE id = $1', [m.matchId]).catch(logErr);
  broadcast(m, 'ranked:team_status', { matchId: m.matchId, slot: s.slot, connected: false, graceMs: T.graceMs, deadline: new Date(until).toISOString() });
}

function resumePayload(m, s) {
  return {
    matchId: m.matchId, yourSlot: s.slot, yourTeam: s.team, total: m.questions.length, phase: m.phase, answered: m.answered.has(s.slot),
    players: m.slots.map((x) => ({ slot: x.slot, team: x.team, gone: Boolean(x.gone), voice: x.team === s.team && Boolean(x.voice), ...x.info })),
    disconnected: m.slots.filter((x) => x.graceTimer && x.slot !== s.slot).map((x) => ({ slot: x.slot, deadline: new Date(x.graceUntil).toISOString() })),
    reveal: m.phase === 'reveal' ? m.lastReveal : null, teamHp: battle.hpOn() ? m.hpState.hp : null, hpMax: BATTLE.initialHp,
    teamScores: m.teamScores || [0, 0],
    ...(m.index >= 0 ? questionPayload(m) : {}),
  };
}
function onConnect(uid, socket) {
  const pid = userParty.get(uid);
  const qe = pid && queue.get(pid);
  if (qe && qe.offline && qe.members.every((x) => x.uid === uid || realtime.isOnline(x.uid))) {
    clearTimeout(qe.offlineTimer); qe.offline = false; qe.offlineTimer = null;
    const party = parties.get(pid);
    if (party) { broadcastParty(party).catch(logErr); party.members.forEach((m) => send(m, 'ranked:team_queue', { status: 'searching', since: qe.joinedAt, mode: qe.mode, resumed: true })); }
    tick().catch(logErr);
  }
  const m = live.get(userLive.get(uid));
  if (!m || m.finished) return;
  const s = m.slots.find((x) => x.userId === uid);
  if (!s || s.gone) return;
  if (s.graceTimer) {
    clearTimeout(s.graceTimer); s.graceTimer = null;
    pool.query('UPDATE ranked_matches SET reconnects = reconnects + 1 WHERE id = $1', [m.matchId]).catch(logErr);
    broadcast(m, 'ranked:team_status', { matchId: m.matchId, slot: s.slot, connected: true });
  }
  realtime.send(socket, 'ranked:team_resume', resumePayload(m, s));
}

/* ---------------- คุยกับเพื่อนร่วมทีม: พิมพ์ (ข้อความสั้น) + เสียง (WebRTC ตรงระหว่างสองเครื่อง) ----------------
   - ส่งถึงเพื่อนร่วมทีมเท่านั้น (ทีมตรงข้ามไม่เห็น/ไม่ได้ยิน) · สมาชิกทีมเป็นเพื่อนกันอยู่แล้ว (ชวนเข้าทีมได้เฉพาะเพื่อน)
   - ข้อความไม่บันทึกลงฐานข้อมูล · ≤ 120 ตัว · จำกัด 8 ข้อความ / 10 วินาที
   - เสียง: เซิร์ฟเวอร์แค่ส่งต่อสัญญาณเชื่อมต่อ (SDP/ICE) ไม่ได้รับ/บันทึกเสียง · เปิดไมค์เมื่อผู้ใช้กดเองเท่านั้น */
const chatRate = new Map();   // uid -> [timestamps]
function teamOf(uid, matchId) {
  const m = live.get(Number(matchId)) || live.get(userLive.get(uid));
  const s = m && m.slots.find((x) => x.userId === uid);
  if (!m || m.finished || !s || s.gone) return null;
  const mates = m.slots.filter((x) => x.team === s.team && x.userId && x.userId !== uid && !x.gone);
  return { m, s, mates };
}
function teamChat(uid, { matchId, text }) {
  const t = teamOf(uid, matchId);
  if (!t) return;
  const clean = String(text == null ? '' : text).replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g, '').trim().slice(0, 120);
  if (!clean) return;
  const now = Date.now();
  const hist = (chatRate.get(uid) || []).filter((x) => now - x < 10000);
  if (hist.length >= 8) { send(uid, 'ranked:error', { code: 'CHAT_RATE', message: 'พิมพ์เร็วเกินไป รอสักครู่' }); return; }
  hist.push(now); chatRate.set(uid, hist);
  const payload = { matchId: t.m.matchId, slot: t.s.slot, name: t.s.info.name, text: clean, at: new Date(now).toISOString() };
  [t.s, ...t.mates].forEach((x) => send(x.userId, 'ranked:team_chat', payload));
}
function voiceState(uid, { matchId, on }) {
  const t = teamOf(uid, matchId);
  if (!t) return;
  t.s.voice = Boolean(on);
  t.mates.forEach((x) => send(x.userId, 'ranked:voice_peer', { matchId: t.m.matchId, slot: t.s.slot, on: t.s.voice }));
  // เพื่อนเปิดไมค์ไว้ก่อนแล้ว -> บอกคนที่เพิ่งเปิดด้วย (เพื่อเริ่มเชื่อมต่อ)
  if (t.s.voice) t.mates.filter((x) => x.voice).forEach((x) => send(uid, 'ranked:voice_peer', { matchId: t.m.matchId, slot: x.slot, on: true }));
}
function voiceSignal(uid, { matchId, toSlot, data }) {
  const t = teamOf(uid, matchId);
  if (!t || !data) return;
  if (JSON.stringify(data).length > 20000) return;              // SDP/ICE เท่านั้น — กันข้อมูลก้อนใหญ่
  const target = t.mates.find((x) => x.slot === Number(toSlot));
  if (!target || !t.s.voice) return;
  send(target.userId, 'ranked:voice_signal', { matchId: t.m.matchId, fromSlot: t.s.slot, data });
}

/* ---------------- เริ่มระบบ ---------------- */
function handleMessage(socket, msg) {
  if (!msg || typeof msg.type !== 'string') return false;
  const uid = socket.userId;
  const run = (p) => p.catch((err) => { logErr(err); send(uid, 'ranked:error', { code: 'SERVER', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }); });
  switch (msg.type) {
    case 'ranked:party_invite': run(invite(uid, msg.userId)); break;
    case 'ranked:party_respond': run(respond(uid, msg)); break;
    case 'ranked:party_leave': leaveParty(uid); break;
    case 'ranked:party_state': { const p = parties.get(userParty.get(uid)); if (p) run(broadcastParty(p)); else send(uid, 'ranked:party', null); break; }
    case 'ranked:team_queue_join': run(joinQueue(uid, msg.mode)); break;
    case 'ranked:team_queue_leave': leaveQueue(uid); break;
    case 'ranked:team_queue_npc': {           // หัวหน้าทีมเลือกแข่งกับทีม NPC หลังรอนาน
      const p = parties.get(userParty.get(uid));
      const e = p && queue.get(p.id);
      // ตรวจซ้ำฝั่งเซิร์ฟเวอร์: ต้องได้รับข้อเสนอจริง และไม่มีสมาชิกแรงค์สูง (ไม่เชื่อข้อมูลจากหน้าเว็บ)
      if (e && p.leader === uid && e.offered && e.canNpc && !e.members.some((m) => isHighRank(m.league))) { dropEntry(p.id); run(createMatch(e, null)); }
      break;
    }
    case 'ranked:team_answer': run(answer(uid, msg)); break;
    case 'ranked:team_chat': teamChat(uid, msg); break;
    case 'ranked:voice': voiceState(uid, msg); break;
    case 'ranked:voice_signal': voiceSignal(uid, msg); break;
    case 'ranked:team_forfeit': {
      const m = live.get(userLive.get(uid));
      const s = m && m.slots.find((x) => x.userId === uid);
      if (s && !s.gone) { clearTimeout(s.graceTimer); s.graceTimer = null; markGone(m, s.slot, 'surrender'); send(uid, 'ranked:team_left_match', { matchId: m.matchId }); }
      break;
    }
    case 'ranked:team_resume_request': {
      const m = live.get(userLive.get(uid));
      const s = m && m.slots.find((x) => x.userId === uid);
      if (m && s && !s.gone) realtime.send(socket, 'ranked:team_resume', resumePayload(m, s));
      break;
    }
    default: return false;
  }
  return true;
}

let interval = null;
function init() {
  realtime.registerMessageHandler(handleMessage);
  realtime.registerDisconnectHandler(onDisconnect);
  realtime.registerConnectHandler(onConnect);
  clearInterval(interval);
  interval = setInterval(() => tick().catch(logErr), 1000);
  if (interval.unref) interval.unref();
}

module.exports = { init, _state: { parties, queue, live } };
