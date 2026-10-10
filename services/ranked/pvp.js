/*
  Ranked Quest — PvP (Phase 2): Matchmaking + เกมเรียลไทม์ที่เซิร์ฟเวอร์ควบคุม
  - ไม่มี Host: เซิร์ฟเวอร์เปิดข้อพร้อมกันทั้งสองฝั่ง · เฉลยหลังทั้งคู่ตอบหรือหมดเวลา · ทั้งสองคนเท่าเทียมกัน
  - คำตอบ/คะแนน/QR คำนวณฝั่งเซิร์ฟเวอร์ · ไคลเอนต์ส่งได้แค่ { matchId, questionIndex, choiceIndex }
  - Battle HP (config/battle.js): เซิร์ฟเวอร์คิด Damage ตอนเฉลยแต่ละข้อ · HP 0 = จบเกมทันที
  - หลุด: grace period 30 วิ (คู่แข่งเห็นนับถอยหลัง) แล้ว resume ได้ · ไม่กลับมาในเวลา = Defeat by Disconnect + penalty
  - กดออก (ยืนยันแล้ว) = Surrender ทันที · อีกฝ่ายได้ Victory by Forfeit
  - เซิร์ฟเวอร์รีสตาร์ทระหว่างเกม: เกม PvP ที่ค้างถูกยกเลิก (abandoned) — ไม่มีใครเสีย QR
  - คิวอยู่ในหน่วยความจำ (เซิร์ฟเวอร์เครื่องเดียว) — ถ้าขยายหลายเครื่องต้องย้ายคิวไปที่ส่วนกลาง
  - ไม่เคยเอา NPC มาแทนผู้เล่นโดยไม่บอก: หลังรอนาน "เสนอ" ทางเลือกให้ผู้เล่นตัดสินใจเอง
*/
const pool = require('../../config/db');
const events = require('../events');
const realtime = require('../../realtime');
const { isBlockedEither } = require('../../utils/blocks');
const { LEAGUE_BY_ID, RULES, labelOf, modeOf, isHighRank, leagueGapAllowed, MATCHMAKING } = require('../../config/leagues');
const { buildMatchQuestions, publicQuestion } = require('./questionBank');
const { newSeed } = require('./rng');
const svc = require('./matchService');
const seasons = require('./seasons');
const { describe } = require('../../config/rankedRewards');
const { BATTLE } = require('../../config/battle');
const battle = require('./battle');

const T = {
  introMs: Number(process.env.RANKED_INTRO_MS || 3500),
  revealMs: Number(process.env.RANKED_REVEAL_MS || 3500),
  graceMs: Number(process.env.RANKED_GRACE_MS || BATTLE.reconnectGraceSeconds * 1000),
  offerAfterMs: Number(process.env.RANKED_OFFER_AFTER_MS || 30000),
  tickMs: 1000,
};
const CEFR_N = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
const N_CEFR = ['A1', 'A1', 'A2', 'B1', 'B2', 'C1'];

const queue = new Map();      // userId -> entry
const live = new Map();       // matchId -> live match
const userLive = new Map();   // userId -> matchId
const lastOpponent = new Map(); // userId -> { id, at } (ไม่จับคู่คนเดิมซ้ำทันที)

const send = (userId, type, payload) => realtime.sendToUser(userId, type, payload);

/* ---------------- Matchmaking ---------------- */
/** ระยะ QR ที่ยอมรับตามเวลารอ (ข้อ 29): 0–10 วิ ±100 · 10–20 วิ ±200 · หลังจากนั้น ±350 */
function qrWindow(waitMs, league) {
  const [a, b, c] = league.matchmakingRange;
  return waitMs < 10000 ? a : waitMs < 20000 ? b : c;
}
/** CEFR ห่างกันได้ 1 ระดับ (2 ระดับเมื่อรอเกิน 30 วิ) — ไม่มีทาง A1 เจอ C1 */
const cefrGap = (waitMs) => (waitMs < 30000 ? 1 : 2);

async function joinQueue(userId, mode = 'vocab') {
  mode = modeOf(mode);
  if (queue.has(userId)) {          // กดซ้ำ / แท็บที่สอง -> ใช้ที่ในคิวเดิม (ไม่สร้างคิวซ้ำ)
    const e = queue.get(userId);
    return send(userId, 'ranked:queue', { status: 'searching', since: e.joinedAt, mode: e.mode });
  }
  if (teamQueued && teamQueued(userId)) return send(userId, 'ranked:error', { code: 'IN_TEAM_QUEUE', message: 'กำลังหาเกมแบบทีมอยู่' });
  if (userLive.has(userId) || await svc.activeMatchId(userId)) {
    return send(userId, 'ranked:error', { code: 'MATCH_IN_PROGRESS', message: 'มีเกมที่ยังเล่นไม่จบ' });
  }
  try { await svc.assertNoCooldown(userId); } catch (err) {
    return send(userId, 'ranked:error', { code: err.code || 'SERVER', message: err.message, retryAfter: err.retryAfter });
  }
  const { row } = await svc.getOrCreateProfile(userId, mode);
  const league = LEAGUE_BY_ID[row.league];
  if (league.npcShare[row.division_index] >= 1) {
    return send(userId, 'ranked:error', { code: 'NPC_LEAGUE', message: `${league.name} ยังไม่เปิดคิวจับคู่ — กด FIND MATCH เพื่อเริ่มเกม` });
  }
  const { cefr } = await svc.getUserCefr(userId);
  const entry = { userId, mode, qr: row.quest_rating, cefr, league: row.league, division: row.division_index, joinedAt: Date.now(), offered: false,
    offline: false, offlineTimer: null };
  queue.set(userId, entry);
  send(userId, 'ranked:queue', { status: 'searching', since: entry.joinedAt, window: qrWindow(0, league), mode });
  tick().catch((err) => console.error('[ranked/pvp tick]', err.message));
}

function leaveQueue(userId, notify = true) {
  const e = queue.get(userId);
  if (e && e.offlineTimer) clearTimeout(e.offlineTimer);   // ไม่ทิ้ง timer ค้าง (กัน memory leak)
  if (queue.delete(userId) && notify) send(userId, 'ranked:queue', { status: 'left' });
}
let teamQueued = null;   // teams.js ลงทะเบียนตัวตรวจ "อยู่ในคิวทีมไหม" (กันอยู่สองคิวพร้อมกัน)
function setTeamQueueCheck(fn) { teamQueued = fn; }
/** ตรวจซ้ำทุกครั้งก่อนจับคู่ (เซิร์ฟเวอร์เท่านั้น): คนละคน · โหมดเดียวกัน · แรงค์ห่างไม่เกินเพดาน · ออนไลน์อยู่ */
function canPair(a, b) {
  return a.userId !== b.userId && a.mode === b.mode && !a.offline && !b.offline && leagueGapAllowed(a.league, b.league);
}

let ticking = false;
async function tick() {
  if (ticking || queue.size === 0) return;
  ticking = true;
  try {
    const now = Date.now();
    const entries = [...queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const taken = new Set();
    for (const a of entries) {
      if (taken.has(a.userId)) continue;
      const waitA = now - a.joinedAt;
      if (a.offline) continue;
      // รอนาน -> เสนอทางเลือกเฉพาะแรงค์ที่อนุญาต (ไม่เอา NPC มาแทนเองโดยไม่บอก) · แรงค์สูงค้นหาต่อเนื่องเท่านั้น
      if (!a.offered && waitA >= T.offerAfterMs && LEAGUE_BY_ID[a.league].npcFallback === 'offer' && !isHighRank(a.league)) {
        a.offered = true;
        send(a.userId, 'ranked:queue_offer', { kind: 'offer' });
      }
      let best = null;
      for (const b of entries) {
        if (b === a || taken.has(b.userId) || !canPair(a, b)) continue;   // โหมดเดียวกัน · แรงค์ห่างไม่เกินเพดาน (ไม่ขยายตามเวลารอ)
        const wait = Math.max(waitA, now - b.joinedAt);
        const win = Math.max(qrWindow(wait, LEAGUE_BY_ID[a.league]), qrWindow(wait, LEAGUE_BY_ID[b.league]));
        if (Math.abs(a.qr - b.qr) > win) continue;
        if (Math.abs(CEFR_N[a.cefr] - CEFR_N[b.cefr]) > cefrGap(wait)) continue;
        const lo = lastOpponent.get(a.userId);
        if (lo && lo.id === b.userId && now - lo.at < 10 * 60 * 1000 && entries.length > 2) continue;
        if (!best || Math.abs(a.qr - b.qr) < Math.abs(a.qr - best.qr)) best = b;
      }
      if (!best) continue;
      if (await isBlockedEither(a.userId, best.userId)) continue; // คนที่บล็อกกันไม่ถูกจับคู่
      if (!queue.has(a.userId) || !queue.has(best.userId) || userLive.has(a.userId) || userLive.has(best.userId)) continue;   // ออกจากคิว/เข้าเกมไปแล้วระหว่าง await
      taken.add(a.userId); taken.add(best.userId);
      leaveQueue(a.userId, false); leaveQueue(best.userId, false);
      createMatch(a, best).catch((err) => {
        console.error('[ranked/pvp create]', err.message);
        [a, best].forEach((e) => send(e.userId, 'ranked:error', { code: 'MATCH_FAILED', message: 'สร้างเกมไม่สำเร็จ ลองหาเกมใหม่อีกครั้ง' }));
      });
    }
  } finally {
    ticking = false;
  }
}

/* ---------------- สร้างเกม ---------------- */
async function publicPlayer(userId, mode = 'vocab') {
  const { rows } = await pool.query('SELECT id, username, avatar, avatar_image, ranked_title, ranked_frame FROM users WHERE id = $1', [userId]);
  const { row } = await svc.getOrCreateProfile(userId, mode);
  const u = rows[0];
  return {
    id: u.id, name: u.username, avatar: u.avatar, avatarImage: u.avatar_image || null, isNpc: false, label: 'PLAYER',
    league: row.league, rankLabel: labelOf(row.league, row.division_index), questRating: row.quest_rating,
    title: u.ranked_title ? describe(u.ranked_title).name : null, frame: u.ranked_frame || null,   // ของตกแต่ง — ไม่มีผลกับเกม
  };
}

async function createMatch(a, b) {
  const season = await svc.getActiveSeason();
  const seed = newSeed();
  // ระดับคำถาม: ค่าเฉลี่ย CEFR ของทั้งคู่ (ห่างกันไม่เกิน 1–2 ระดับอยู่แล้ว) · สัดส่วนชนิดคำถามตาม League ของผู้ที่ QR ต่ำกว่า
  const cefr = N_CEFR[Math.floor((CEFR_N[a.cefr] + CEFR_N[b.cefr]) / 2)];
  const lower = a.qr <= b.qr ? a : b;
  const { mode } = a;
  const questions = await buildMatchQuestions({ cefr, tier: LEAGUE_BY_ID[lower.league].questionTier, seed, mode });
  const client = await pool.connect();
  let matchId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ranked_matches (season_id, user_id, player2_id, match_type, opponent_kind, league_at_start, division_at_start,
                                   cefr, seed, questions, current_index, queue_ms, mode)
       VALUES ($1, $2, $3, 'ranked', 'player', $4, $5, $6, $7, $8, 0, $9, $10) RETURNING id`,
      [season.id, a.userId, b.userId, a.league, a.division, cefr, seed, JSON.stringify(questions),
        Math.round((Date.now() - a.joinedAt + Date.now() - b.joinedAt) / 2), mode]);
    matchId = Number(ins.rows[0].id);
    await client.query('INSERT INTO ranked_match_players (match_id, slot, user_id, qr_before) VALUES ($1, 0, $2, $3), ($1, 1, $4, $5)',
      [matchId, a.userId, a.qr, b.userId, b.qr]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const players = [await publicPlayer(a.userId, mode), await publicPlayer(b.userId, mode)];
  const m = {
    matchId, mode, players: [a.userId, b.userId], info: players, questions, cefr, index: -1, phase: 'intro',
    openedAt: null, answered: new Set(), timer: null, disconnected: new Map(), finished: false,
    hpState: battle.newHpState(2), lastReveal: null,
  };
  live.set(matchId, m);
  userLive.set(a.userId, matchId); userLive.set(b.userId, matchId);
  [0, 1].forEach((slot) => send(m.players[slot], 'ranked:matched', {
    matchId, mode, total: questions.length, yourSlot: slot, you: players[slot], opponent: players[1 - slot], cefr, startsInMs: T.introMs,
    hp: hpFor(m, slot),
  }));
  m.timer = setTimeout(() => openQuestion(m, 0).catch(logErr), T.introMs);
}

const logErr = (err) => console.error('[ranked/pvp]', err.message);

/* ---------------- วงจรของแต่ละข้อ ---------------- */
const hpFor = (m, slot) => (battle.hpOn() ? { you: m.hpState.hp[slot], opponent: m.hpState.hp[1 - slot], max: BATTLE.initialHp } : null);
function questionPayload(m, slot = 0) {
  return {
    matchId: m.matchId, index: m.index, total: m.questions.length, question: svc.questionView(m.questions[m.index], m.index),
    openedAt: new Date(m.openedAt).toISOString(), serverNow: new Date().toISOString(), questionMs: RULES.questionMs,
    hp: hpFor(m, slot),
  };
}

async function openQuestion(m, i) {
  if (m.finished) return;
  m.index = i; m.phase = 'question'; m.openedAt = Date.now(); m.answered = new Set();
  await pool.query('UPDATE ranked_matches SET current_index = $1, question_opened_at = to_timestamp($2 / 1000.0) WHERE id = $3',
    [i, m.openedAt, m.matchId]);
  m.players.forEach((uid, slot) => send(uid, 'ranked:question', questionPayload(m, slot)));
  clearTimeout(m.timer);
  m.timer = setTimeout(() => reveal(m).catch(logErr), RULES.questionMs + svc.ANSWER_GRACE_MS);
}

async function answer(userId, { matchId, questionIndex, choiceIndex }) {
  const m = live.get(Number(matchId));
  // เกมของคนอื่น / เกมที่จบแล้ว / match id ปลอม -> ปฏิเสธ
  if (!m || m.finished || !m.players.includes(userId)) return send(userId, 'ranked:error', { code: 'NOT_FOUND', message: 'ไม่พบเกมนี้' });
  const slot = m.players.indexOf(userId);
  if (m.phase !== 'question' || questionIndex !== m.index) return send(userId, 'ranked:error', { code: 'WRONG_QUESTION', message: 'ไม่ใช่ข้อปัจจุบัน' });
  if (m.answered.has(slot)) return send(userId, 'ranked:error', { code: 'DUPLICATE_ANSWER', message: 'ตอบข้อนี้ไปแล้ว' });
  const q = m.questions[m.index];
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choices.length) {
    return send(userId, 'ranked:error', { code: 'BAD_CHOICE', message: 'ตัวเลือกไม่ถูกต้อง' });
  }
  m.answered.add(slot); // กันส่งซ้อนก่อน DB ตอบ
  const elapsed = Date.now() - m.openedAt;
  const late = elapsed > RULES.questionMs + svc.ANSWER_GRACE_MS;
  const correct = !late && choiceIndex === q.correctIndex;
  try {
    await recordAnswer(m, slot, late ? null : choiceIndex, correct, svc.pointsFor(correct, elapsed), late ? null : elapsed);
  } catch (err) {
    if (err.code === '23505') return send(userId, 'ranked:error', { code: 'DUPLICATE_ANSWER', message: 'ตอบข้อนี้ไปแล้ว' });
    throw err;
  }
  send(userId, 'ranked:answer_ack', { matchId: m.matchId, index: m.index });
  send(m.players[1 - slot], 'ranked:opponent_answered', { matchId: m.matchId, index: m.index }); // ไม่บอกถูก/ผิด
  if (m.answered.size === 2) await reveal(m);
}

/** บันทึกคำตอบ + จำ promise ที่ยังเขียนไม่เสร็จ (reveal รอให้ครบ — กัน race เมื่อสองคนตอบเกือบพร้อมกัน) */
function recordAnswer(m, ...args) {
  const p = recordAnswerNow(m, ...args);
  m.pending = m.pending || new Set();
  m.pending.add(p);
  p.finally(() => m.pending.delete(p)).catch(() => {});
  return p;
}

async function recordAnswerNow(m, slot, choice, correct, points, responseMs) {
  await pool.query(
    `INSERT INTO ranked_answers (match_id, slot, question_index, choice_index, correct, points, response_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [m.matchId, slot, m.index, choice, correct, points, responseMs]);
  await pool.query('UPDATE ranked_match_players SET score = score + $1, correct_count = correct_count + $2 WHERE match_id = $3 AND slot = $4',
    [points, correct ? 1 : 0, m.matchId, slot]);
  const q = m.questions[m.index];
  const itemId = (q.ref.wordId || `${q.ref.chapterId}:${q.ref.mode}`).slice(0, 32);
  await pool.query('INSERT INTO answer_events (user_id, skill, item_id, level, correct, source) VALUES ($1, $2, $3, $4, $5, $6)',
    [m.players[slot], svc.SKILL_FOR_TYPE[q.type], itemId, q.ref.wordId ? q.cefr : null, correct, 'ranked']);
}

async function reveal(m) {
  if (m.finished || m.phase !== 'question') return;
  m.phase = 'reveal';
  clearTimeout(m.timer);
  if (m.pending && m.pending.size) await Promise.allSettled([...m.pending]);
  for (const slot of [0, 1]) {
    if (!m.answered.has(slot)) {
      m.answered.add(slot);
      await recordAnswer(m, slot, null, false, 0, null).catch((err) => { if (err.code !== '23505') throw err; });
    }
  }
  const q = m.questions[m.index];
  const rows = (await pool.query('SELECT slot, choice_index, correct, points, response_ms FROM ranked_answers WHERE match_id = $1 AND question_index = $2 ORDER BY slot',
    [m.matchId, m.index])).rows;
  // HP: เซิร์ฟเวอร์คิดจากความถูกต้องเท่านั้น (ทั้งสองคำตอบมีผลพร้อมกัน)
  const res = battle.resolveQuestion(m.hpState, q, rows.map((r) => ({ slot: r.slot, side: r.slot, correct: r.correct })));
  m.hpState = res.state;
  for (const h of res.hits) {
    await pool.query('UPDATE ranked_answers SET damage = $1, damage_target = $2 WHERE match_id = $3 AND slot = $4 AND question_index = $5',
      [h.damage, h.target, m.matchId, h.slot, m.index]);
  }
  await pool.query('UPDATE ranked_matches SET hp = $1, hp_min = $2, combo = $3 WHERE id = $4',
    [JSON.stringify(res.state.hp), JSON.stringify(res.state.min), JSON.stringify(res.state.streak), m.matchId]);
  const scores = (await pool.query('SELECT slot, score FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.matchId])).rows.map((r) => r.score);
  m.scores = scores;
  const isLast = res.ko || m.index === m.questions.length - 1;
  const hitFor = (slot, h) => ({ damage: h.damage, target: h.target === slot ? 'you' : 'opponent' });
  m.lastReveal = (slot) => ({
    matchId: m.matchId, index: m.index, correctIndex: q.correctIndex, explain: q.explain, isLast, ko: res.ko, nextInMs: T.revealMs,
    you: rows[slot], opponent: rows[1 - slot], scores: { you: scores[slot], opponent: scores[1 - slot] },
    hp: hpFor(m, slot), hits: { you: hitFor(slot, res.hits[slot]), opponent: hitFor(slot, res.hits[1 - slot]) },
    taken: { you: res.taken[slot], opponent: res.taken[1 - slot] },
  });
  [0, 1].forEach((slot) => send(m.players[slot], 'ranked:reveal', m.lastReveal(slot)));
  m.timer = setTimeout(() => (isLast ? finish(m).catch(logErr) : openQuestion(m, m.index + 1).catch(logErr)), T.revealMs);
}

/* ---------------- จบเกม ---------------- */
async function finish(m, { forfeitSlot = null, reason = 'surrender' } = {}) {
  if (m.finished) return;
  m.finished = true;
  clearTimeout(m.timer);
  m.disconnected.forEach((d) => clearTimeout(d.timer));
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    const mrow = (await client.query('SELECT * FROM ranked_matches WHERE id = $1 FOR UPDATE', [m.matchId])).rows[0];
    if (mrow.status !== 'active') { await client.query('ROLLBACK'); return; }
    const players = (await client.query('SELECT * FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.matchId])).rows;
    const season = { id: mrow.season_id };   // ผลนับในซีซันที่เกมเริ่ม
    const hp = m.hpState.hp;
    const all = (await client.query('SELECT * FROM ranked_answers WHERE match_id = $1 ORDER BY question_index', [m.matchId])).rows;
    let outcomes; let resultReason; let decidedBy = null;
    if (forfeitSlot !== null) {
      outcomes = forfeitSlot === 0 ? ['loss', 'win'] : ['win', 'loss'];
      resultReason = reason;
    } else {
      const d = battle.decide([0, 1].map((slot) => svc.sideStats(hp[slot], all.filter((a) => a.slot === slot))));
      outcomes = d.winner === null ? ['draw', 'draw'] : d.winner === 0 ? ['win', 'loss'] : ['loss', 'win'];
      resultReason = d.reason; decidedBy = d.decidedBy;
    }
    for (const slot of [0, 1]) {
      const opp = players[1 - slot];
      const quitter = forfeitSlot === slot;
      const { r, before, penalty } = await svc.applyOutcome(client, {
        pvp: true,
        userId: m.players[slot], seasonId: season.id, matchId: m.matchId, matchType: 'ranked', outcome: outcomes[slot], opponentRating: opp.qr_before,
        forfeit: quitter ? { reason, likelyTechnical: reason === 'disconnect' && battle.isLeading(hp[slot], hp[1 - slot], players[slot].score, opp.score) } : null,
        mode: m.mode,
      });
      const answers = all.filter((a) => a.slot === slot);
      await client.query(
        `UPDATE ranked_match_players SET qr_after = $1, outcome = $2, final_hp = $3, forfeit_reason = $4, counted_abandon = $5, qr_penalty = $6
          WHERE match_id = $7 AND slot = $8`,
        [r.qr, outcomes[slot], hp[slot], quitter ? reason : null, Boolean(penalty && penalty.counted), penalty ? penalty.amount : 0, m.matchId, slot]);
      results[slot] = svc.buildResult({ m: mrow, answers, you: players[slot], opp, r, before, outcome: outcomes[slot],
        forfeited: quitter, opponent: m.info[1 - slot], hp: hpFor(m, slot), resultReason, forfeitReason: quitter ? reason : null,
        opponentForfeited: forfeitSlot !== null && !quitter, penalty, decidedBy });
      await svc.awardMatchExp(client, m.players[slot], results[slot]);
    }
    await client.query(
      `UPDATE ranked_matches SET status = 'finished', finished_at = NOW(), result = $1, result_p2 = $2, end_reason = $3, result_reason = $4,
              forfeit_reason = $5, final_hp_p1 = $6, final_hp_p2 = $7, reconnect_deadline = NULL WHERE id = $8`,
      [JSON.stringify(results[0]), JSON.stringify(results[1]), forfeitSlot === null ? 'completed' : (reason === 'surrender' ? 'forfeit' : 'disconnect'),
        resultReason, forfeitSlot === null ? null : reason, hp[0], hp[1], m.matchId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    live.delete(m.matchId);
    m.players.forEach((uid) => { if (userLive.get(uid) === m.matchId) userLive.delete(uid); });
  }
  const now = Date.now();
  lastOpponent.set(m.players[0], { id: m.players[1], at: now });
  lastOpponent.set(m.players[1], { id: m.players[0], at: now });
  [0, 1].forEach((slot) => send(m.players[slot], 'ranked:ended', { matchId: m.matchId, result: results[slot] }));
  [0, 1].forEach((slot) => { if (forfeitSlot !== slot && results[slot]) events.recordRound(m.players[slot], `ranked:${m.matchId}`, { correct: results[slot].correct, total: results[slot].total }); });
}

/* ---------------- หลุด / กลับมา ---------------- */
function onDisconnect(userId, _socket, { stillOnline } = {}) {
  if (stillOnline) return;
  // อยู่ในคิว: เก็บที่ไว้ให้กลับมาต่อได้ (ระหว่างหลุดไม่ถูกจับคู่) · ไม่กลับมาในเวลา = ออกจากคิว
  const qe = queue.get(userId);
  if (qe && !qe.offline) {
    qe.offline = true;
    qe.offlineTimer = setTimeout(() => { if (queue.get(userId) === qe && qe.offline) leaveQueue(userId, false); }, MATCHMAKING.queueReconnectGraceMs);
    if (qe.offlineTimer.unref) qe.offlineTimer.unref();
  }
  const m = live.get(userLive.get(userId));
  if (!m || m.finished) return;
  const slot = m.players.indexOf(userId);
  if (m.disconnected.has(slot)) return;
  const until = Date.now() + T.graceMs;
  const timer = setTimeout(() => { if (m.disconnected.has(slot)) finish(m, { forfeitSlot: slot, reason: 'disconnect' }).catch(logErr); }, T.graceMs);
  m.disconnected.set(slot, { until, timer });
  pool.query(`UPDATE ranked_matches SET disconnect_started_at = NOW(), reconnect_deadline = to_timestamp($1 / 1000.0), disconnects = disconnects + 1
               WHERE id = $2`, [until, m.matchId]).catch(logErr);
  send(m.players[1 - slot], 'ranked:opponent_status', { matchId: m.matchId, connected: false, graceMs: T.graceMs, deadline: new Date(until).toISOString() });
}

function onConnect(userId, socket) {
  const qe = queue.get(userId);
  if (qe) {                         // กลับมาทันเวลา -> คิวเดิมต่อ (เวลาที่รอนับต่อจากเดิม)
    if (qe.offlineTimer) clearTimeout(qe.offlineTimer);
    qe.offline = false; qe.offlineTimer = null;
    realtime.send(socket, 'ranked:queue', { status: 'searching', since: qe.joinedAt, mode: qe.mode, resumed: true });
    tick().catch(logErr);
  }
  const m = live.get(userLive.get(userId));
  if (!m || m.finished) return;
  const slot = m.players.indexOf(userId);
  const d = m.disconnected.get(slot);
  if (d) {
    clearTimeout(d.timer); m.disconnected.delete(slot);
    pool.query('UPDATE ranked_matches SET disconnect_started_at = NULL, reconnect_deadline = NULL, reconnects = reconnects + 1 WHERE id = $1', [m.matchId]).catch(logErr);
    send(m.players[1 - slot], 'ranked:opponent_status', { matchId: m.matchId, connected: true });
  }
  realtime.send(socket, 'ranked:resume', resumePayload(m, slot));
}

/** Snapshot ล่าสุดของเกม (คำถามปัจจุบัน · HP · คะแนน · เวลาที่เหลือ · สถานะคู่แข่ง) — กลับเข้าเกมเดิม ไม่สร้างเกมใหม่ */
function resumePayload(m, slot) {
  const od = m.disconnected.get(1 - slot);
  return {
    matchId: m.matchId, mode: m.mode, yourSlot: slot, you: m.info[slot], opponent: m.info[1 - slot], total: m.questions.length,
    phase: m.phase, answered: m.answered.has(slot), hp: hpFor(m, slot),
    scores: m.scores ? { you: m.scores[slot], opponent: m.scores[1 - slot] } : { you: 0, opponent: 0 },
    opponentDisconnected: od ? { deadline: new Date(od.until).toISOString() } : null,
    reveal: m.phase === 'reveal' && m.lastReveal ? m.lastReveal(slot) : null,
    ...(m.index >= 0 ? questionPayload(m, slot) : {}),
  };
}

/* ---------------- เริ่มระบบ ---------------- */
function handleMessage(socket, msg) {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('ranked:')) return false;
  const uid = socket.userId;
  const run = (p) => p.catch((err) => { logErr(err); send(uid, 'ranked:error', { code: 'SERVER', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }); });
  switch (msg.type) {
    case 'ranked:queue_join': run(joinQueue(uid, msg.mode)); break;
    case 'ranked:queue_leave': leaveQueue(uid); break;
    case 'ranked:resume_request': onConnect(uid, socket); break;   // เปิดหน้าเกมที่ค้างอยู่ขณะยังเชื่อมต่อ
    case 'ranked:answer': run(answer(uid, msg)); break;
    case 'ranked:forfeit': {      // กด Leave Match แล้วยืนยัน = Surrender ทันที
      const m = live.get(userLive.get(uid));
      if (m && !m.finished) run(finish(m, { forfeitSlot: m.players.indexOf(uid), reason: 'surrender' }));
      break;
    }
    default: return false;
  }
  return true;
}

let interval = null;
let sweeper = null;
async function init() {
  // เกม PvP ที่ค้างจากการรีสตาร์ท: ยกเลิก ไม่มีใครเสีย QR (สถานะอยู่ในหน่วยความจำ กู้ต่อไม่ได้)
  await pool.query("UPDATE ranked_matches SET status = 'abandoned', finished_at = NOW(), end_reason = 'restart' WHERE status = 'active' AND opponent_kind IN ('player', 'team')")
    .catch((err) => console.error('[ranked/pvp init]', err.message));
  realtime.registerMessageHandler(handleMessage);
  realtime.registerDisconnectHandler(onDisconnect);
  realtime.registerConnectHandler(onConnect);
  // เกม NPC (REST): WebSocket หลุด/กลับมา = สัญญาณเร็วของการเชื่อมต่อ (นอกจาก ping)
  realtime.registerDisconnectHandler((uid, _s, { stillOnline } = {}) => { if (!stillOnline) svc.markNpcDisconnected(uid).catch(logErr); });
  realtime.registerConnectHandler((uid) => { svc.markNpcReconnected(uid).catch(logErr); });
  await svc.resetPresenceOnBoot().catch(logErr);
  clearInterval(interval);
  interval = setInterval(() => tick().catch(logErr), T.tickMs);
  if (interval.unref) interval.unref();
  clearInterval(sweeper);
  sweeper = setInterval(() => svc.sweep().catch(logErr), BATTLE.sweepMs);
  if (sweeper.unref) sweeper.unref();
  // ซีซันหมดเวลา -> Soft reset อัตโนมัติ (ตรวจตอนเริ่มและทุกชั่วโมง)
  await seasons.checkRollover().catch((err) => console.error('[ranked/season]', err.message));
  const hourly = setInterval(() => seasons.checkRollover().catch(logErr), 60 * 60 * 1000);
  if (hourly.unref) hourly.unref();
}

module.exports = { init, _state: { queue, live, userLive }, qrWindow, cefrGap, leaveQueue, publicPlayer, CEFR_N, N_CEFR, T, hpFor, canPair, setTeamQueueCheck, onDisconnect, onConnect };
