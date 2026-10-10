/*
  Ranked Quest — Match Service (เซิร์ฟเวอร์เป็นผู้ตัดสินทุกอย่าง)
  - ไม่มี Host: เกมถูกควบคุมด้วยเซิร์ฟเวอร์ · ผู้เล่นส่งได้แค่ { questionIndex, choiceIndex }
  - เวลา: ใช้เวลาเซิร์ฟเวอร์ (question_opened_at) ตัดสินว่าตอบทันหรือไม่ · เปิดข้อถัดไปเมื่อผู้เล่นพร้อม
    (โจทย์ไม่ถูกส่งก่อนเปิด จึงไม่มีใครได้เปรียบจากการหน่วง)
  - ส่งซ้ำ / ส่งผิดข้อ / ส่งหลังจบเกม / เกมของคนอื่น -> ปฏิเสธ (และมี PK ใน ranked_answers กันชั้นสุดท้าย)
  - Phase 1 = แข่งกับ NPC · Phase 2 เพิ่ม PvP ด้วย engine ชุดเดียวกัน (ส่งผ่าน WebSocket)
  - Battle HP (config/battle.js): ตอบถูก = คู่แข่งเสีย HP · ตอบผิด/หมดเวลา = ตัวเองเสีย HP · HP 0 = แพ้ทันที
  - การเชื่อมต่อ (เกม NPC เป็น REST): หน้าเว็บส่ง ping เป็นระยะ · เงียบเกินกำหนดหรือ WebSocket หลุด = เริ่มนับ grace 30 วิ
    กลับมาทัน = เล่นต่อไม่เสียอะไร · ไม่กลับมา = แพ้ (Defeat by Disconnect) + penalty · กดออกเอง = Surrender ทันที
*/
const pool = require('../../config/db');
const events = require('../events');
const { LEAGUE_BY_ID, LEAGUES, RULES, labelOf, nextLeague, modeOf, isHighRank } = require('../../config/leagues');
const NPCS = require('../../config/rankedNpcs');
const { calculateQuestRating } = require('./rating');
const { planAnswers } = require('./npcEngine');
const { buildMatchQuestions, publicQuestion } = require('./questionBank');
const { mulberry32, pick, newSeed } = require('./rng');
const { BATTLE, RANKED_EXP, difficultyOf } = require('../../config/battle');
const { getLevelInfo } = require('../../utils/leveling');
const battle = require('./battle');
const realtime = require('../../realtime');

const ANSWER_GRACE_MS = 1500;   // เผื่อเวลาเครือข่าย
const RECENT_MATCHES_FOR_EXCLUDE = 5;
const SKILL_FOR_TYPE = { vocabulary: 'vocab', context: 'vocab', grammar: 'grammar', reading: 'grammar' };

class RankedError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

/** เกมที่ยังเล่นไม่จบของผู้เล่น (ฝั่งไหนก็ได้) */
async function activeMatchId(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT id FROM ranked_matches WHERE (user_id = $1 OR player2_id = $1 OR $1 = ANY(team_member_ids)) AND status = 'active' LIMIT 1", [userId]);
  return rows[0] ? Number(rows[0].id) : null;
}

/* ---------------- Season / Profile ---------------- */
async function getActiveSeason(db = pool) {
  const { rows } = await db.query('SELECT * FROM ranked_seasons WHERE is_active LIMIT 1');
  if (!rows[0]) throw new RankedError('NO_SEASON', 'ยังไม่มีซีซัน Ranked ที่เปิดอยู่', 503);
  return rows[0];
}

/** โปรไฟล์ Ranked ของโหมดนั้น (vocab / grammar แยกแรงค์กัน) */
async function getOrCreateProfile(userId, mode = 'vocab', db = pool) {
  const m = modeOf(mode);
  const season = await getActiveSeason(db);
  await db.query('INSERT INTO ranked_profiles (user_id, season_id, mode) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, season.id, m]);
  const { rows } = await db.query('SELECT * FROM ranked_profiles WHERE user_id = $1 AND season_id = $2 AND mode = $3', [userId, season.id, m]);
  return { season, row: rows[0] };
}

/** CEFR จาก Placement ล่าสุด (Rank ≠ CEFR — ใช้แค่เลือกระดับคำถาม) */
async function getUserCefr(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT result->>'overall' AS overall FROM placement_attempts
      WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`, [userId]);
  const v = rows[0] && rows[0].overall;
  return ['A1', 'A2', 'B1', 'B2', 'C1'].includes(v) ? { cefr: v, fromPlacement: true } : { cefr: 'A1', fromPlacement: false };
}

function profileView(row) {
  const league = LEAGUE_BY_ID[row.league];
  const d = row.division_index;
  const nextMin = d + 1 < league.minQr.length ? league.minQr[d + 1] : (nextLeague(row.league) ? nextLeague(row.league).minQr[0] : null);
  const played = row.wins + row.losses + row.draws;
  return {
    league: row.league, leagueName: league.name, divisionIndex: d, division: league.divisions[d] || '',
    label: labelOf(row.league, d), questRating: row.quest_rating,
    progress: nextMin === null ? null : {
      from: league.minQr[d], to: nextMin,
      pct: Math.max(0, Math.min(100, Math.round(((row.quest_rating - league.minQr[d]) / (nextMin - league.minQr[d])) * 100))),
    },
    promotionStatus: row.promotion_status, promotionRetryAfter: row.promotion_retry_after,
    protectionMatches: row.protection_matches, guardian: NPCS.publicNpc(NPCS.BY_ID[league.guardian]) || null,
    stats: { wins: row.wins, losses: row.losses, draws: row.draws, played, winRate: played ? Math.round((row.wins / played) * 100) : 0,
      currentStreak: row.current_streak, bestStreak: row.best_streak },
    seasonHighest: { league: row.season_highest_league, qr: row.season_highest_qr },
    tutorialDone: row.tutorial_done,
  };
}

/* ---------------- เลือกคู่แข่ง ---------------- */
// Phase 1: ทุก League ใช้ NPC (บอกผู้เล่นชัดเจนเสมอ) · League ที่ออกแบบให้เป็น PvP แจ้งว่า PvP จะเปิดใน Phase 2
function chooseOpponent(profileRow, type, rng, requestedNpcId) {
  const league = LEAGUE_BY_ID[profileRow.league];
  if (type === 'apex') return { npc: NPCS.BY_ID[league.apexChallenge] };
  if (type === 'promotion') {
    const g = NPCS.BY_ID[league.guardian];
    if (!g) throw new RankedError('NO_GUARDIAN', 'League นี้ไม่มีด่านเลื่อนขั้น');
    return { npc: g, pvpPending: false };
  }
  // NPC ของ League นี้ หรือของ League ล่าสุดที่มี NPC (League บนสุดยังไม่มี NPC ประจำ)
  let source = league;
  while (source && source.npcs.length === 0) source = LEAGUES.find((l) => l.order === source.order - 1);
  const candidates = source.npcs.map((id) => NPCS.BY_ID[id]);
  const npc = requestedNpcId && type === 'practice'
    ? candidates.find((n) => n.id === requestedNpcId) || pick(candidates, rng) : pick(candidates, rng);
  return { npc };
}

/* ---------------- พักเกม Ranked (ทิ้งเกมบ่อย) ---------------- */
async function assertNoCooldown(userId, db = pool) {
  const { rows } = await db.query('SELECT ranked_cooldown_until FROM users WHERE id = $1', [userId]);
  const until = rows[0] && rows[0].ranked_cooldown_until;
  if (until && new Date(until) > new Date()) {
    const sec = Math.ceil((new Date(until) - Date.now()) / 1000);
    const err = new RankedError('RANKED_COOLDOWN',
      `ออกจากเกม Ranked บ่อยเกินไป — พักก่อน ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} นาที แล้วกลับมาเล่นใหม่ได้`, 429);
    err.retryAfter = sec;
    throw err;
  }
}

/* ---------------- เริ่มเกม ---------------- */
async function startMatch(userId, { type = 'ranked', npcId = null, npcFallback = false, mode = 'vocab' } = {}) {
  mode = modeOf(mode);
  // ไม่มีโหมดซ้อมกับบอท — มีแต่เกม Ranked / ด่านเลื่อนขั้น / Apex
  if (!['ranked', 'promotion', 'apex'].includes(type)) throw new RankedError('BAD_TYPE', 'ชนิดเกมไม่ถูกต้อง');
  const active = await activeMatchId(userId);
  if (active) return getState(active, userId); // มีเกมค้าง -> เล่นต่อ (ห้ามเปิดเกมใหม่ทับ)
  await assertNoCooldown(userId);

  const { season, row } = await getOrCreateProfile(userId, mode);
  if (type === 'apex' && row.league !== 'aurora-lion') {
    throw new RankedError('APEX_LOCKED', 'Apex Challenge เปิดให้ผู้เล่น Aurora Lion เท่านั้น', 403);
  }
  if (type === 'promotion' && row.promotion_status !== 'pending') {
    throw new RankedError('PROMOTION_LOCKED', row.promotion_status === 'retry'
      ? `เล่นเกมปกติอีก ${row.promotion_retry_after} เกมก่อนลองด่านเลื่อนขั้นใหม่` : 'ยังไม่ถึงด่านเลื่อนขั้น', 403);
  }
  // แรงค์สูง (config: MATCHMAKING.highRankFromOrder): Ranked และแมตช์เลื่อนแรงค์ = ผู้เล่นจริงเท่านั้น -> เข้าคิวเสมอ
  // ไม่มีทางได้คู่แข่ง NPC จาก endpoint นี้ ไม่ว่าหน้าเว็บจะส่งค่าอะไรมา (npcFallback / npcId ถูกเพิกเฉย)
  if ((type === 'ranked' || type === 'promotion') && isHighRank(row.league)) {
    return { queue: true, mode, league: row.league, label: labelOf(row.league, row.division_index), promotion: type === 'promotion' };
  }
  // League ที่มีผู้เล่นจริง: สุ่มตามสัดส่วน NPC ของ Division (เช่น Crest Lynx IV = NPC 60%)
  // ถ้าได้ PvP -> ให้หน้าเว็บเข้าคิวผ่าน WebSocket · ผู้เล่นขอ NPC เองได้เฉพาะ League ที่อนุญาต (npcFallback = 'offer')
  let npcReason = null;
  if (type === 'ranked') {
    const lg = LEAGUE_BY_ID[row.league];
    const share = lg.npcShare[row.division_index];
    if (share < 1) {
      const allowFallback = npcFallback && lg.npcFallback === 'offer';
      if (!allowFallback && !(share > 0 && Math.random() < share)) {
        return { queue: true, mode, league: row.league, label: labelOf(row.league, row.division_index) };
      }
      npcReason = allowFallback ? 'คุณเลือกแข่งกับ League NPC ระหว่างรอผู้เล่น'
        : `${labelOf(row.league, row.division_index)} จัดเกมกับ League NPC ${Math.round(share * 100)}% ของเกม — เกมนี้เป็นเกม NPC`;
    }
  }
  const seed = newSeed();
  const rng = mulberry32(seed);
  const { npc } = chooseOpponent(row, type, rng, npcId);
  const { cefr } = await getUserCefr(userId);
  const league = LEAGUE_BY_ID[row.league];

  // ลดข้อซ้ำ: ไม่เอาข้อที่เจอใน 5 เกมล่าสุด
  const recent = await pool.query(
    'SELECT questions FROM ranked_matches WHERE user_id = $1 AND mode = $3 ORDER BY created_at DESC LIMIT $2', [userId, RECENT_MATCHES_FOR_EXCLUDE, mode]);
  const exclude = new Set(recent.rows.flatMap((r) => r.questions.map((q) => q.id)));
  const questions = await buildMatchQuestions({ cefr, tier: league.questionTier, seed, exclude, mode });
  const plan = planAnswers(npc, questions, cefr, seed);
  const hp0 = battle.newHpState(2);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ranked_matches (season_id, user_id, match_type, opponent_kind, npc_id, league_at_start, division_at_start,
                                   cefr, seed, questions, npc_plan, current_index, question_opened_at,
                                   start_hp, hp, hp_min, combo, last_seen_at, mode)
       VALUES ($1, $2, $3, 'npc', $4, $5, $6, $7, $8, $9, $10, 0, NOW(), $11, $12, $12, '{}', NOW(), $13) RETURNING id`,
      [season.id, userId, type, npc.id, row.league, row.division_index, cefr, seed, JSON.stringify(questions), JSON.stringify(plan),
        BATTLE.initialHp, JSON.stringify(hp0.hp), mode]);
    const matchId = ins.rows[0].id;
    await client.query('INSERT INTO ranked_match_players (match_id, slot, user_id, qr_before) VALUES ($1, 0, $2, $3)',
      [matchId, userId, row.quest_rating]);
    await client.query('INSERT INTO ranked_match_players (match_id, slot, npc_id, qr_before) VALUES ($1, 1, $2, $3)',
      [matchId, npc.id, npc.rating]);
    await client.query('COMMIT');
    const state = await getState(matchId, userId);
    return { ...state, npcReason };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new RankedError('MATCH_IN_PROGRESS', 'มีเกมที่ยังเล่นไม่จบ', 409); // กดเริ่มซ้อนกัน
    throw err;
  } finally {
    client.release();
  }
}

/* ---------------- สถานะเกม ---------------- */
async function loadMatch(matchId, userId, db = pool, forUpdate = false) {
  if (!/^\d{1,18}$/.test(String(matchId))) throw new RankedError('NOT_FOUND', 'ไม่พบเกมนี้', 404);
  const { rows } = await db.query(`SELECT * FROM ranked_matches WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [matchId]);
  const m = rows[0];
  // เกมของคนอื่น = ตอบเหมือนไม่มีเกมนี้ (ไม่บอกว่ามีอยู่จริง)
  const inTeam = Array.isArray(m && m.team_member_ids) && m.team_member_ids.includes(userId);
  if (!m || (m.user_id !== userId && m.player2_id !== userId && !inTeam)) throw new RankedError('NOT_FOUND', 'ไม่พบเกมนี้', 404);
  if (m.opponent_kind === 'team') {
    const r = await db.query('SELECT slot, result FROM ranked_match_players WHERE match_id = $1 AND user_id = $2', [m.id, userId]);
    m.slot = r.rows[0].slot; m.teamResult = r.rows[0].result;
  } else {
    m.slot = m.user_id === userId ? 0 : 1;
  }
  return m;
}

async function answersOf(matchId, db = pool) {
  const { rows } = await db.query('SELECT * FROM ranked_answers WHERE match_id = $1 ORDER BY question_index, slot', [matchId]);
  return rows;
}

const resultFor = (m) => (m.opponent_kind === 'team' ? m.teamResult : m.slot === 1 ? m.result_p2 : m.result);
const hpView = (hp, mine = 0) => (battle.hpOn() ? { you: hp[mine], opponent: hp[1 - mine], max: BATTLE.initialHp } : null);
const deadlinePassed = (m) => Boolean(m.reconnect_deadline) && new Date(m.reconnect_deadline) <= new Date();

/** คำถามที่ส่งให้หน้าเว็บ + ระดับความยาก (ใช้แสดง Damage ที่เป็นไปได้ — ไม่เปิดเผยเฉลย) */
const questionView = (q, i) => ({ ...publicQuestion(q, i), difficulty: difficultyOf(q) });

async function getState(matchId, userId) {
  let m = await loadMatch(matchId, userId);
  if (m.status === 'active' && m.opponent_kind === 'npc') {
    // ทุกการเรียกจากผู้เล่น = ยังเชื่อมต่ออยู่ (ถ้าเลย deadline ไปแล้ว เกมจบเป็นแพ้)
    const alive = await touch(m);
    if (!alive) m = await loadMatch(matchId, userId);
  }
  if (m.status !== 'active') return { matchId: Number(m.id), status: m.status, result: resultFor(m) };
  // เกม PvP ขับเคลื่อนด้วย WebSocket (ข้อความ ranked:resume) — REST บอกแค่ว่ามีเกมค้าง
  if (m.opponent_kind === 'player' || m.opponent_kind === 'team') return { matchId: Number(m.id), status: 'active', pvp: true, team: m.opponent_kind === 'team' };
  const answers = await answersOf(m.id);
  const players = (await pool.query('SELECT slot, score, correct_count FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.id])).rows;
  const answeredCurrent = answers.some((a) => a.slot === 0 && a.question_index === m.current_index);
  const npc = NPCS.BY_ID[m.npc_id];
  const q = m.questions[m.current_index];
  const plan = m.npc_plan[m.current_index];
  const ko = m.hp.some((x) => x === 0);
  return {
    matchId: Number(m.id), status: 'active', type: m.match_type, cefr: m.cefr, mode: m.mode,
    league: m.league_at_start, leagueLabel: labelOf(m.league_at_start, m.division_at_start),
    total: m.questions.length, index: m.current_index,
    phase: answeredCurrent ? 'revealed' : 'question', isLast: ko || m.current_index === m.questions.length - 1,
    question: questionView(q, m.current_index),
    openedAt: m.question_opened_at, serverNow: new Date().toISOString(), questionMs: RULES.questionMs,
    scores: { you: players[0].score, opponent: players[1].score },
    hp: hpView(m.hp),
    connection: { graceSeconds: BATTLE.reconnectGraceSeconds, pingMs: BATTLE.npcPingMs },
    opponent: { ...NPCS.publicNpc(npc), plannedResponseMs: plan.responseMs }, // เวลาตอบไว้แสดง "คู่แข่งตอบแล้ว" — ไม่บอกถูกผิด
  };
}

/* ---------------- การเชื่อมต่อของเกม NPC ---------------- */
/** ผู้เล่นยังอยู่: บันทึกเวลาล่าสุด + ล้างสถานะหลุด (ถ้ายังไม่เลย deadline) · คืน false ถ้าเลย deadline แล้ว (เกมถูกตัดสินแพ้) */
async function touch(m) {
  const { rows } = await pool.query(
    `UPDATE ranked_matches SET last_seen_at = NOW(),
            reconnects = reconnects + (CASE WHEN reconnect_deadline IS NOT NULL THEN 1 ELSE 0 END),
            disconnect_started_at = NULL, reconnect_deadline = NULL
      WHERE id = $1 AND status = 'active' AND (reconnect_deadline IS NULL OR reconnect_deadline > NOW()) RETURNING id`, [m.id]);
  if (rows[0]) return true;
  await expireMatch(m.id).catch(() => {});
  return false;
}

/** ping จากหน้าเว็บ (ทุก ~10 วิ ระหว่างเกม NPC) */
async function ping(matchId, userId) {
  const m = await loadMatch(matchId, userId);
  if (m.status === 'active' && m.opponent_kind === 'npc') {
    const alive = await touch(m);
    if (alive) return { matchId: Number(m.id), status: 'active', serverNow: new Date().toISOString() };
  }
  const after = await loadMatch(matchId, userId);
  return after.status === 'active'
    ? { matchId: Number(after.id), status: 'active', pvp: after.opponent_kind !== 'npc' }
    : { matchId: Number(after.id), status: after.status, result: resultFor(after) };
}

/** WebSocket ของผู้เล่นหลุดทุกแท็บ -> เริ่มนับ grace ของเกม NPC ทันที (ไม่ต้องรอ ping เงียบ) */
async function markNpcDisconnected(userId) {
  await pool.query(
    `UPDATE ranked_matches SET disconnect_started_at = NOW(), reconnect_deadline = NOW() + make_interval(secs => $2),
            disconnects = disconnects + 1
      WHERE user_id = $1 AND status = 'active' AND opponent_kind = 'npc' AND reconnect_deadline IS NULL`,
    [userId, BATTLE.reconnectGraceSeconds]);
}
/** WebSocket กลับมา (ยังไม่เลย deadline) -> เล่นต่อได้ ไม่เสียอะไร */
async function markNpcReconnected(userId) {
  await pool.query(
    `UPDATE ranked_matches SET disconnect_started_at = NULL, reconnect_deadline = NULL, reconnects = reconnects + 1, last_seen_at = NOW()
      WHERE user_id = $1 AND status = 'active' AND opponent_kind = 'npc' AND reconnect_deadline > NOW()`, [userId]);
}

/** เกมที่เลย deadline: ถ้าผลตัดสินแล้ว (HP 0) จบตามปกติ · ไม่งั้นแพ้เพราะหลุด */
async function expireMatch(matchId, reason = 'disconnect') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query("SELECT * FROM ranked_matches WHERE id = $1 AND status = 'active' FOR UPDATE", [matchId]);
    const m = rows[0];
    if (!m || m.opponent_kind !== 'npc') { await client.query('ROLLBACK'); return null; }
    m.slot = 0;
    const ko = m.hp.some((x) => x === 0);
    const result = ko ? await finalize(client, m, m.user_id) : await finalize(client, m, m.user_id, { forfeitReason: reason });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** ตรวจเป็นระยะ (ทุก ~3 วิ): เกม NPC ที่เงียบ -> เริ่ม grace · เลย deadline -> แพ้ · ค้างนานโดยไม่เล่น -> timeout */
async function sweep() {
  // ping เงียบ แต่ WebSocket ยังต่ออยู่ (เช่นแอปอยู่เบื้องหลัง เบราว์เซอร์หน่วง timer) = ยังไม่ถือว่าหลุด
  const silent = await pool.query(
    `SELECT id, user_id FROM ranked_matches WHERE status = 'active' AND opponent_kind = 'npc' AND reconnect_deadline IS NULL
        AND last_seen_at < NOW() - make_interval(secs => $1) LIMIT 200`, [BATTLE.npcSilenceMs / 1000]);
  const lost = silent.rows.filter((r) => !realtime.isOnline(r.user_id)).map((r) => r.id);
  if (lost.length) {
    await pool.query(
      `UPDATE ranked_matches SET disconnect_started_at = NOW(), reconnect_deadline = NOW() + make_interval(secs => $1), disconnects = disconnects + 1
        WHERE id = ANY($2::bigint[]) AND status = 'active' AND reconnect_deadline IS NULL`, [BATTLE.reconnectGraceSeconds, lost]);
  }
  const expired = await pool.query(
    "SELECT id FROM ranked_matches WHERE status = 'active' AND opponent_kind = 'npc' AND reconnect_deadline <= NOW() LIMIT 50");
  for (const r of expired.rows) await expireMatch(r.id, 'disconnect').catch((err) => console.error('[ranked/sweep]', err.message));
  const idle = await pool.query(
    `SELECT m.id FROM ranked_matches m
      WHERE m.status = 'active' AND m.opponent_kind = 'npc' AND m.question_opened_at < NOW() - make_interval(mins => $1)
        AND NOT EXISTS (SELECT 1 FROM ranked_answers a WHERE a.match_id = m.id AND a.answered_at > NOW() - make_interval(mins => $1))
      LIMIT 50`, [BATTLE.matchIdleMinutes]);
  for (const r of idle.rows) await expireMatch(r.id, 'timeout').catch((err) => console.error('[ranked/sweep]', err.message));
}

/** เซิร์ฟเวอร์เพิ่งเริ่ม: ให้เกม NPC ที่ค้างอยู่ได้ grace ใหม่ (ไม่ลงโทษผู้เล่นเพราะเซิร์ฟเวอร์ deploy) */
async function resetPresenceOnBoot() {
  await pool.query(
    `UPDATE ranked_matches SET last_seen_at = NOW(), disconnect_started_at = NULL, reconnect_deadline = NULL
      WHERE status = 'active' AND opponent_kind = 'npc'`);
}

/* ---------------- ส่งคำตอบ ---------------- */
function pointsFor(correct, elapsedMs) {
  if (!correct) return 0;
  const speed = Math.max(0, 1 - elapsedMs / RULES.questionMs);
  return RULES.pointsCorrect + Math.round(RULES.pointsSpeedMax * speed);
}

/** เกมเลย deadline ระหว่างที่ผู้เล่นส่งคำขอเข้ามา -> ตัดสินแพ้แล้วแจ้งว่าเกมจบ */
async function rejectExpired(client, m) {
  await client.query('ROLLBACK').catch(() => {});
  await expireMatch(m.id).catch(() => {});
  throw new RankedError('MATCH_OVER', 'หลุดการเชื่อมต่อเกินเวลา — เกมนี้จบแล้ว', 409);
}

async function submitAnswer(matchId, userId, { questionIndex, choiceIndex }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await loadMatch(matchId, userId, client, true);
    if (m.opponent_kind !== 'npc') throw new RankedError('PVP_MATCH', 'เกม PvP ส่งผ่านการเชื่อมต่อแบบเรียลไทม์', 409);
    if (m.status !== 'active') throw new RankedError('MATCH_OVER', 'เกมนี้จบแล้ว', 409);
    if (deadlinePassed(m)) await rejectExpired(client, m);
    if (m.hp.some((x) => x === 0)) throw new RankedError('MATCH_OVER', 'เกมนี้ตัดสินแล้ว', 409);
    if (!Number.isInteger(questionIndex) || questionIndex !== m.current_index) {
      throw new RankedError('WRONG_QUESTION', 'ไม่ใช่ข้อปัจจุบัน', 409);
    }
    const q = m.questions[questionIndex];
    const timeoutSubmission = choiceIndex === null;
    if (!timeoutSubmission && (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choices.length)) {
      throw new RankedError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
    }
    const elapsed = Date.now() - new Date(m.question_opened_at).getTime();
    const timedOut = timeoutSubmission || elapsed > RULES.questionMs + ANSWER_GRACE_MS;
    const choice = timedOut ? null : choiceIndex;
    const correct = choice !== null && choice === q.correctIndex;
    const points = pointsFor(correct, elapsed);
    const plan = m.npc_plan[questionIndex];
    const npcPoints = pointsFor(plan.correct, plan.responseMs);

    // HP: ทั้งสองคำตอบมีผลพร้อมกัน (เซิร์ฟเวอร์คำนวณเองทั้งหมด)
    const res = battle.resolveQuestion({ hp: m.hp, min: m.hp_min, streak: m.combo || {} }, q,
      [{ slot: 0, side: 0, correct }, { slot: 1, side: 1, correct: plan.correct }]);
    const [mine, theirs] = res.hits;

    try {
      await client.query(
        `INSERT INTO ranked_answers (match_id, slot, question_index, choice_index, correct, points, response_ms, damage, damage_target)
         VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8)`,
        [m.id, questionIndex, choice, correct, points, timedOut ? null : elapsed, mine.damage, mine.target]);
    } catch (err) {
      if (err.code === '23505') throw new RankedError('DUPLICATE_ANSWER', 'ตอบข้อนี้ไปแล้ว', 409);
      throw err;
    }
    // คำตอบของ NPC ข้อนี้ (วางแผนไว้ตั้งแต่เริ่มเกม)
    await client.query(
      `INSERT INTO ranked_answers (match_id, slot, question_index, choice_index, correct, points, response_ms, damage, damage_target)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [m.id, questionIndex, plan.choiceIndex, plan.correct, npcPoints, plan.responseMs, theirs.damage, theirs.target]);
    await client.query(
      'UPDATE ranked_match_players SET score = score + $1, correct_count = correct_count + $2 WHERE match_id = $3 AND slot = 0',
      [points, correct ? 1 : 0, m.id]);
    await client.query(
      'UPDATE ranked_match_players SET score = score + $1, correct_count = correct_count + $2 WHERE match_id = $3 AND slot = 1',
      [npcPoints, plan.correct ? 1 : 0, m.id]);
    await client.query('UPDATE ranked_matches SET hp = $1, hp_min = $2, combo = $3, last_seen_at = NOW() WHERE id = $4',
      [JSON.stringify(res.state.hp), JSON.stringify(res.state.min), JSON.stringify(res.state.streak), m.id]);

    // ส่งกลับระบบเรียน (Mastery / My Mistakes / คำแนะนำหน้า Home)
    const itemId = q.ref.wordId || `${q.ref.chapterId}:${q.ref.mode}`;
    await client.query(
      'INSERT INTO answer_events (user_id, skill, item_id, level, correct, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, SKILL_FOR_TYPE[q.type], itemId.slice(0, 32), q.ref.wordId ? q.cefr : null, correct, 'ranked']);

    const scores = (await client.query('SELECT slot, score FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.id])).rows;
    await client.query('COMMIT');
    return {
      questionIndex, timedOut, correct, correctIndex: q.correctIndex, explain: q.explain, points,
      opponent: { choiceIndex: plan.choiceIndex, correct: plan.correct, points: npcPoints, responseMs: plan.responseMs },
      scores: { you: scores[0].score, opponent: scores[1].score },
      hp: hpView(res.state.hp),
      hits: { you: { damage: mine.damage, target: mine.target === 0 ? 'you' : 'opponent' },
        opponent: { damage: theirs.damage, target: theirs.target === 0 ? 'you' : 'opponent' } },
      taken: { you: res.taken[0], opponent: res.taken[1] },
      ko: res.ko,
      isLast: res.ko || questionIndex === m.questions.length - 1,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ---------------- ข้อถัดไป / จบเกม ---------------- */
async function nextQuestion(matchId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await loadMatch(matchId, userId, client, true);
    if (m.opponent_kind !== 'npc') throw new RankedError('PVP_MATCH', 'เกม PvP ส่งผ่านการเชื่อมต่อแบบเรียลไทม์', 409);
    if (m.status !== 'active') { await client.query('ROLLBACK'); return { matchId: Number(m.id), status: m.status, result: resultFor(m) }; }
    const ko = m.hp.some((x) => x === 0);
    if (deadlinePassed(m) && !ko) await rejectExpired(client, m);
    const answered = await client.query(
      'SELECT 1 FROM ranked_answers WHERE match_id = $1 AND slot = 0 AND question_index = $2', [m.id, m.current_index]);
    if (!answered.rows[0]) throw new RankedError('NOT_ANSWERED', 'ยังไม่ได้ตอบข้อนี้', 409);
    if (!ko && m.current_index < m.questions.length - 1) {
      await client.query('UPDATE ranked_matches SET current_index = current_index + 1, question_opened_at = NOW(), last_seen_at = NOW() WHERE id = $1', [m.id]);
      await client.query('COMMIT');
      return getState(m.id, userId);
    }
    const result = await finalize(client, m, userId);
    await client.query('COMMIT');
    return { matchId: Number(m.id), status: 'finished', result };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** กดออกจากเกม (ยืนยันแล้ว) = Surrender ทันที — ไม่มีทางเลี่ยงการแพ้ด้วยการออก */
async function forfeit(matchId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await loadMatch(matchId, userId, client, true);
    if (m.opponent_kind !== 'npc') throw new RankedError('PVP_MATCH', 'เกม PvP ส่งผ่านการเชื่อมต่อแบบเรียลไทม์', 409);
    if (m.status !== 'active') throw new RankedError('MATCH_OVER', 'เกมนี้จบแล้ว', 409);
    // HP 0 แล้ว (ผลตัดสินแล้ว) -> ปิดเกมตามผลจริง ไม่นับเป็นการยอมแพ้
    const ko = m.hp.some((x) => x === 0);
    const result = ko ? await finalize(client, m, userId) : await finalize(client, m, userId, { forfeitReason: 'surrender' });
    await client.query('COMMIT');
    return { matchId: Number(m.id), status: 'finished', result };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
  อัปเดตแรงค์ของผู้เล่นหนึ่งคนหลังจบเกม (ใช้ทั้งเกม NPC / PvP / ทีม)
  forfeit: { reason: 'surrender'|'disconnect'|'timeout', likelyTechnical } เมื่อผู้เล่นคนนี้ออกกลางเกม
    - Repeated Disconnect: นับเฉพาะการออกที่น่าจะตั้งใจ (Surrender / หลุดตอนกำลังตามหลัง)
      หลุดตอนนำอยู่ = น่าจะเป็นปัญหาเน็ต ไม่นับ (ยังแพ้ตามกติกา แต่ไม่เพิ่มบทลงโทษซ้ำ) · timeout ไม่นับ
*/
async function applyOutcome(client, { userId, seasonId, matchId, matchType, outcome, opponentRating, forfeit: fo = null, mode = 'vocab', pvp = false }) {
  mode = modeOf(mode);
  await client.query('INSERT INTO ranked_profiles (user_id, season_id, mode) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, seasonId, mode]);
  const prof = (await client.query('SELECT * FROM ranked_profiles WHERE user_id = $1 AND season_id = $2 AND mode = $3 FOR UPDATE', [userId, seasonId, mode])).rows[0];
  const before = { league: prof.league, divisionIndex: prof.division_index, qr: prof.quest_rating };
  // แรงค์สูง: แมตช์เลื่อนแรงค์คือเกม Ranked กับผู้เล่นจริงเกมถัดไปหลังเก็บแต้มครบ (ไม่มีบอส NPC)
  if (pvp && matchType === 'ranked' && prof.promotion_status === 'pending' && isHighRank(prof.league)) matchType = 'promotion';
  let penalty = null; let fx = null;
  if (fo && outcome === 'loss' && matchType !== 'practice') {
    const R = BATTLE.repeat;
    const counted = fo.reason === 'surrender' || (fo.reason === 'disconnect' && !fo.likelyTechnical);
    let nth = 0;
    if (counted) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM ranked_match_players mp JOIN ranked_matches m ON m.id = mp.match_id
          WHERE mp.user_id = $1 AND mp.counted_abandon AND m.finished_at > NOW() - make_interval(hours => $2)`, [userId, R.windowHours]);
      nth = rows[0].n + 1;
    }
    const multiplier = counted && nth >= R.escalateFrom ? R.multiplier : 1;
    let cooldownUntil = null;
    if (counted && nth >= R.cooldownFrom) {
      const { rows } = await client.query(
        "UPDATE users SET ranked_cooldown_until = NOW() + make_interval(mins => $2) WHERE id = $1 RETURNING ranked_cooldown_until",
        [userId, R.cooldownMinutes]);
      cooldownUntil = rows[0] ? rows[0].ranked_cooldown_until : null;
    }
    fx = { reason: fo.reason, multiplier };
    penalty = { reason: fo.reason, counted, nth, multiplier, cooldownUntil, amount: 0 };
  }
  const r = calculateQuestRating({
    league: prof.league, divisionIndex: prof.division_index, qr: prof.quest_rating,
    promotionStatus: prof.promotion_status, promotionRetryAfter: prof.promotion_retry_after,
    protectionMatches: prof.protection_matches, wins: prof.wins, losses: prof.losses, draws: prof.draws,
  }, { type: matchType, outcome, opponentRating, forfeit: fx });
  if (penalty) {
    const ev = r.events.find((e) => e.type === 'forfeit_penalty');
    penalty.amount = ev ? ev.amount : 0;
  }
  if (matchType !== 'practice') {
    const streak = outcome === 'win' ? Math.max(1, prof.current_streak + 1) : outcome === 'loss' ? Math.min(-1, prof.current_streak - 1) : 0;
    const highestOrder = Math.max(LEAGUE_BY_ID[prof.season_highest_league].order, LEAGUE_BY_ID[r.league].order);
    await client.query(
      `UPDATE ranked_profiles SET league = $1, division_index = $2, quest_rating = $3, promotion_status = $4,
              promotion_retry_after = $5, protection_matches = $6,
              wins = wins + $7, losses = losses + $8, draws = draws + $9,
              current_streak = $10, best_streak = GREATEST(best_streak, $10),
              season_highest_league = $11, season_highest_qr = GREATEST(season_highest_qr, $3), updated_at = NOW()
        WHERE user_id = $12 AND season_id = $13 AND mode = $14`,
      [r.league, r.divisionIndex, r.qr, r.promotionStatus, r.promotionRetryAfter, r.protectionMatches,
        outcome === 'win' ? 1 : 0, outcome === 'loss' ? 1 : 0, outcome === 'draw' ? 1 : 0, streak,
        LEAGUES.find((l) => l.order === highestOrder).id, userId, seasonId, mode]);
    // Title ประจำ League (ของตกแต่ง) — ได้ครั้งแรกที่ไปถึง League นั้น
    await client.query('INSERT INTO user_ranked_rewards (user_id, reward_id, season_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [userId, `title:${r.league}`, seasonId]);
    for (const ev of r.events) {
      if (ev.type === 'protected' || ev.type === 'forfeit_penalty') continue;
      await client.query(
        `INSERT INTO rank_history (user_id, season_id, match_id, event, from_league, from_division, to_league, to_division, qr_after, mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, seasonId, matchId, ev.type, before.league, before.divisionIndex, r.league, r.divisionIndex, r.qr, mode]);
    }
  }
  // แรงค์/ขั้นเปลี่ยน -> บอกเพื่อนที่ออนไลน์ให้แผนที่อัปเดตตำแหน่ง (ส่งแค่สัญญาณ หน้าเว็บดึงข้อมูลใหม่ผ่าน API ที่เคารพการตั้งค่าซ่อนแรงค์)
  if (matchType !== 'practice' && (r.league !== before.league || r.divisionIndex !== before.divisionIndex)) {
    const t = setTimeout(() => { Promise.resolve(realtime.sendToFriendsOf(userId, 'ranked:friend_rank', { mode })).catch(() => {}); }, 800);
    if (t.unref) t.unref();
  }
  return { r, before, penalty };
}

/**
  EXP จากเกม Ranked (เรียกในทรานแซกชันเดียวกับการบันทึกผล) — ใส่ผลลงใน result.exp ด้วย (หน้าผล/ประวัติแสดงได้)
  ผู้เล่นที่ออกกลางเกมเองไม่ได้ EXP · มีเพดานรายวัน
*/
async function awardMatchExp(client, userId, result) {
  const E = RANKED_EXP;
  let earned = result.forfeited ? 0 : (E.base[result.outcome] || 0) + E.perCorrect * (result.correct || 0);
  let capped = false;
  if (earned > 0) {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS n FROM exp_log
        WHERE user_id = $1 AND reason = 'ranked_match' AND created_at >= (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2)`,
      [userId, E.timezone]);
    const left = Math.max(0, E.dailyCap - rows[0].n);
    if (earned > left) { earned = left; capped = true; }
  }
  const u = (await client.query('SELECT exp FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
  const before = u ? u.exp : 0;
  const after = before + earned;
  if (earned > 0) {
    await client.query('UPDATE users SET exp = $1 WHERE id = $2', [after, userId]);
    await client.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, 'ranked_match')", [userId, earned]);
  }
  const lb = getLevelInfo(before); const la = getLevelInfo(after);
  result.exp = { gained: earned, capped, reason: result.forfeited ? 'forfeit' : null, levelInfo: la, leveledUp: la.level > lb.level };
  return result.exp;
}

/** ป้ายผลการแข่ง (ใช้ทั้งหน้าผลและประวัติ) */
function resultLabel({ outcome, forfeitReason, opponentForfeited }) {
  if (outcome === 'win') return opponentForfeited ? 'victory_forfeit' : 'victory';
  if (outcome === 'draw') return 'draw';
  if (forfeitReason === 'surrender') return 'surrender';
  if (forfeitReason === 'disconnect' || forfeitReason === 'timeout') return 'defeat_disconnect';
  return 'defeat';
}

/** ผลการแข่งจากมุมมองของผู้เล่นหนึ่งคน (สถิติแยกทักษะ + ข้อที่ผิดสำหรับส่งกลับระบบเรียน) */
function buildResult({ m, answers, you, opp, r, before, outcome, forfeited, opponent, hp = null, resultReason = null,
  forfeitReason = null, opponentForfeited = false, penalty = null, decidedBy = null }) {
  const byType = {};
  const missed = [];
  answers.forEach((a) => {
    const q = m.questions[a.question_index];
    byType[q.type] = byType[q.type] || { correct: 0, total: 0 };
    byType[q.type].total += 1;
    if (a.correct) byType[q.type].correct += 1;
    else missed.push({ index: a.question_index, type: q.type, prompt: q.prompt, answer: q.choices[q.correctIndex], explain: q.explain, ref: q.ref });
  });
  const timed = answers.filter((a) => a.response_ms !== null);
  const practice = m.match_type === 'practice' || m.match_type === 'apex';
  const answered = answers.length;
  return {
    outcome, forfeited, type: m.match_type, mode: m.mode || 'vocab', pvp: m.opponent_kind === 'player',
    label: resultLabel({ outcome, forfeitReason: forfeited ? forfeitReason : null, opponentForfeited }),
    resultReason, forfeitReason: forfeited ? forfeitReason : null, opponentForfeited, decidedBy,
    hp: hp || null,
    scores: { you: you.score, opponent: opp.score },
    correct: you.correct_count, answered, total: m.questions.length,
    accuracy: answered ? Math.round((you.correct_count / answered) * 100) : 0,
    avgResponseMs: timed.length ? Math.round(timed.reduce((sum, a) => sum + a.response_ms, 0) / timed.length) : null,
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { ...v, pct: Math.round((v.correct / v.total) * 100) }])),
    qr: { before: before.qr, after: practice ? before.qr : r.qr, delta: practice ? 0 : r.delta },
    rank: { before: { ...before, label: labelOf(before.league, before.divisionIndex) },
      after: { league: r.league, divisionIndex: r.divisionIndex, label: labelOf(r.league, r.divisionIndex) } },
    events: r.events.map((e) => e.type), promotionStatus: r.promotionStatus,
    penalty: penalty && !practice ? penalty : null,
    opponent, missed, reviewed: false,
  };
}

/** สถิติของแต่ละฝั่งสำหรับตัดสินผล (HP -> ความแม่นยำ -> คะแนน -> เวลาเฉลี่ย) */
function sideStats(hp, rows) {
  const timed = rows.filter((a) => a.response_ms !== null);
  return {
    hp, correct: rows.filter((a) => a.correct).length, answered: rows.length,
    score: rows.reduce((s, a) => s + a.points, 0),
    avgMs: timed.length ? timed.reduce((s, a) => s + a.response_ms, 0) / timed.length : null,
  };
}

async function finalize(client, m, userId, { forfeitReason = null } = {}) {
  const players = (await client.query('SELECT * FROM ranked_match_players WHERE match_id = $1 ORDER BY slot', [m.id])).rows;
  const all = (await client.query('SELECT * FROM ranked_answers WHERE match_id = $1 ORDER BY question_index', [m.id])).rows;
  const answers = all.filter((a) => a.slot === 0);
  const you = players[0]; const opp = players[1];
  const hp = m.hp;
  let outcome; let resultReason; let decidedBy = null;
  if (forfeitReason) {
    outcome = 'loss'; resultReason = forfeitReason;
  } else {
    const d = battle.decide([sideStats(hp[0], answers), sideStats(hp[1], all.filter((a) => a.slot === 1))]);
    outcome = d.winner === null ? 'draw' : d.winner === 0 ? 'win' : 'loss';
    resultReason = d.reason; decidedBy = d.decidedBy;
  }
  const npc = NPCS.BY_ID[m.npc_id];
  // Apex Challenge = ด่านเกียรติยศ ไม่กระทบ QR/แรงค์ (ไม่ใช่ตัวแทนการจัดอันดับ PvP)
  const ratingType = m.match_type === 'apex' ? 'practice' : m.match_type;
  const forfeitInfo = forfeitReason
    ? { reason: forfeitReason, likelyTechnical: forfeitReason === 'disconnect' && battle.isLeading(hp[0], hp[1], you.score, opp.score) } : null;
  const { r, before, penalty } = await applyOutcome(client, {
    userId, seasonId: m.season_id, matchId: m.id, matchType: ratingType, outcome, opponentRating: npc.rating, forfeit: forfeitInfo, mode: m.mode });
  if (m.match_type === 'apex' && outcome === 'win') {
    await client.query("INSERT INTO user_ranked_rewards (user_id, reward_id, season_id) VALUES ($1, 'apex:solari', $2) ON CONFLICT DO NOTHING", [userId, m.season_id]);
  }
  await client.query(
    `UPDATE ranked_match_players SET qr_after = $1, outcome = $2, final_hp = $3, forfeit_reason = $4, counted_abandon = $5, qr_penalty = $6
      WHERE match_id = $7 AND slot = 0`,
    [ratingType === 'practice' ? you.qr_before : r.qr, outcome, hp[0], forfeitReason, Boolean(penalty && penalty.counted),
      penalty ? penalty.amount : 0, m.id]);
  await client.query('UPDATE ranked_match_players SET outcome = $1, final_hp = $2 WHERE match_id = $3 AND slot = 1',
    [outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw', hp[1], m.id]);
  const result = buildResult({ m, answers, you, opp, r, before, outcome, forfeited: Boolean(forfeitReason), opponent: NPCS.publicNpc(npc),
    hp: hpView(hp), resultReason, forfeitReason, penalty, decidedBy });
  await awardMatchExp(client, userId, result);
  if (!forfeitReason) events.recordRound(userId, `ranked:${m.id}`, { correct: result.correct, total: result.total });   // ภารกิจกิจกรรม: เล่นจบ 1 รอบ (ไม่ขึ้นกับแพ้/ชนะ)
  await client.query(
    `UPDATE ranked_matches SET status = 'finished', finished_at = NOW(), result = $1, end_reason = $2, result_reason = $3,
            forfeit_reason = $4, final_hp_p1 = $5, final_hp_p2 = $6, reconnect_deadline = NULL WHERE id = $7`,
    [JSON.stringify(result), forfeitReason ? (forfeitReason === 'surrender' ? 'forfeit' : 'disconnect') : 'completed', resultReason,
      forfeitReason, hp[0], hp[1], m.id]);
  return result;
}

/* ---------------- Learning integration ---------------- */
/** เพิ่มคำที่ตอบผิดในเกมเข้าคิวทบทวน (ถึงกำหนดทันที) · แกรมม่าที่ผิด -> คืนรายการบทที่แนะนำ */
async function addMissedToReview(matchId, userId) {
  const m = await loadMatch(matchId, userId);
  if (m.status !== 'finished') throw new RankedError('MATCH_ACTIVE', 'เกมยังไม่จบ', 409);
  const res = resultFor(m);
  const missed = (res && res.missed) || [];
  const words = [...new Set(missed.filter((x) => x.ref && x.ref.wordId).map((x) => x.ref.wordId))];
  for (const wordId of words) {
    await pool.query(
      `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at)
       VALUES ($1, $2, $3, 'learning', 0, NOW())
       ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = NOW()`,
      [userId, wordId, wordId.slice(0, 2)]);
  }
  const chapters = [...new Map(missed.filter((x) => x.ref && x.ref.chapterId)
    .map((x) => [x.ref.chapterId, { chapterId: x.ref.chapterId, title: x.ref.chapterTitle, mode: x.ref.mode }])).values()];
  if (m.opponent_kind === 'team') {
    await pool.query("UPDATE ranked_match_players SET result = jsonb_set(result, '{reviewed}', 'true') WHERE match_id = $1 AND slot = $2", [m.id, m.slot]);
  } else {
    const col = m.slot === 1 ? 'result_p2' : 'result';
    await pool.query(`UPDATE ranked_matches SET ${col} = jsonb_set(${col}, '{reviewed}', 'true') WHERE id = $1`, [m.id]);
  }
  return { wordsAdded: words.length, grammarChapters: chapters };
}

async function history(userId, limit = 20, mode = null, offset = 0) {
  const { rows } = await pool.query(
    `SELECT m.id, m.match_type, m.mode, m.npc_id, m.opponent_kind, CASE WHEN m.opponent_kind = 'team' THEN (SELECT mp.result FROM ranked_match_players mp WHERE mp.match_id = m.id AND mp.user_id = $1)
                 WHEN m.user_id = $1 THEN m.result ELSE m.result_p2 END AS result, m.finished_at
       FROM ranked_matches m
      WHERE (m.user_id = $1 OR m.player2_id = $1 OR $1 = ANY(m.team_member_ids)) AND m.status = 'finished'
        AND ($3::text IS NULL OR m.mode = $3)
      ORDER BY m.finished_at DESC, m.id DESC LIMIT $2 OFFSET $4`, [userId, limit, mode ? modeOf(mode) : null, Math.max(0, offset | 0)]);
  return rows.map((r) => ({
    matchId: Number(r.id), type: r.match_type, mode: r.mode, finishedAt: r.finished_at, pvp: r.opponent_kind !== 'npc', team: r.opponent_kind === 'team',
    opponent: r.result.opponent, outcome: r.result.outcome,
    // ป้ายผลแบบละเอียด: Victory / Defeat / Draw / Victory by Forfeit / Defeat by Disconnect / Surrender
    label: r.result.label || resultLabel({ outcome: r.result.outcome, forfeitReason: r.result.forfeited ? 'surrender' : null, opponentForfeited: r.result.opponentForfeited }),
    hp: r.result.hp || null,
    scores: r.result.scores, qrDelta: r.result.qr.delta, accuracy: r.result.accuracy,
  }));
}

/** คำที่ตอบผิดในเกมล่าสุดที่ยังไม่ได้เพิ่มเข้าทบทวน (ให้หน้า Home แนะนำ) */
async function pendingReview(userId) {
  const { rows } = await pool.query(
    `SELECT m.id, CASE WHEN m.opponent_kind = 'team' THEN (SELECT mp.result FROM ranked_match_players mp WHERE mp.match_id = m.id AND mp.user_id = $1)
                 WHEN m.user_id = $1 THEN m.result ELSE m.result_p2 END AS result FROM ranked_matches m
      WHERE (m.user_id = $1 OR m.player2_id = $1 OR $1 = ANY(m.team_member_ids)) AND m.status = 'finished'
      ORDER BY m.finished_at DESC LIMIT 1`, [userId]);
  const r = rows[0];
  if (!r || !r.result || r.result.reviewed) return null;
  const words = new Set(r.result.missed.filter((x) => x.ref && x.ref.wordId).map((x) => x.ref.wordId)).size; // นับคำไม่ซ้ำ
  return words ? { matchId: Number(r.id), words } : null;
}

module.exports = {
  RankedError, activeMatchId, applyOutcome, awardMatchExp, buildResult, resultLabel, sideStats, questionView, SKILL_FOR_TYPE, ANSWER_GRACE_MS,
  getActiveSeason, getOrCreateProfile, getUserCefr, profileView, assertNoCooldown,
  startMatch, getState, submitAnswer, nextQuestion, forfeit, ping, sweep, expireMatch, resetPresenceOnBoot,
  markNpcDisconnected, markNpcReconnected, addMissedToReview, history, pendingReview, pointsFor,
};
