/*
  v1.18.3 ความยุติธรรมของ Ranked — ตรวจการตอบเร็วเกินมนุษย์ (บอท/สคริปต์ที่อ่านโจทย์แล้วค้นคำตอบเอง)

  ตอนจบเกม (applyOutcome เรียก matchStats):
    - ผู้เล่นที่ตอบถูกเร็วกว่า INTEGRITY.minHumanMs ตั้งแต่ INTEGRITY.flagFastCorrect ข้อ = ผิดปกติ
        ชนะ/เสมอ -> ไม่ได้แต้มแรงค์ ไม่นับสถิติ ไม่ได้ EXP (voided) · แพ้ -> เสียแต้มตามปกติ
    - คู่แข่งที่เป็นผู้เล่นจริง (PvP/ทีม) ที่แพ้ผู้เล่นที่ถูกตรวจพบ -> ไม่เสียแต้ม
  ย้อนหลัง (scripts/ranked/reclaim-cheat.js): planReclaim -> applyReclaim (ริบแต้มที่ได้จากเกมผิดปกติ + คืนแต้มคู่แข่ง) · revertReclaim คืนค่าได้
  ข้อมูลเดิมไม่ถูกลบ: ประวัติแมตช์คงเดิม · ทุกการปรับเก็บค่าก่อน-หลังใน ranked_qr_reclaims
*/
const crypto = require('node:crypto');
const { INTEGRITY, LEAGUES, LEAGUE_BY_ID, stepForQr, nextLeague } = require('../../config/leagues');

const isOpponent = (a, b) => (a.team !== null && b.team !== null ? a.team !== b.team : a.slot !== b.slot);

/** สถิติความเร็วต่อผู้เล่น (เฉพาะผู้เล่นจริง) ในแมตช์หนึ่ง -> Map<userId, {...}> */
async function matchStats(db, matchId, opts = INTEGRITY) {
  const { rows } = await db.query(
    `SELECT p.user_id, p.slot, p.team,
            COUNT(a.question_index)::int AS answered,
            COUNT(*) FILTER (WHERE a.correct AND a.response_ms IS NOT NULL AND a.response_ms < $2)::int AS fast_correct,
            MIN(a.response_ms)::int AS min_ms, ROUND(AVG(a.response_ms))::int AS avg_ms
       FROM ranked_match_players p
       LEFT JOIN ranked_answers a ON a.match_id = p.match_id AND a.slot = p.slot
      WHERE p.match_id = $1 AND p.user_id IS NOT NULL
      GROUP BY p.user_id, p.slot, p.team`, [matchId, opts.minHumanMs]);
  return new Map(rows.map((r) => [r.user_id, {
    userId: r.user_id, slot: r.slot, team: r.team, answered: r.answered, fastCorrect: r.fast_correct,
    minMs: r.min_ms, avgMs: r.avg_ms, flagged: r.fast_correct >= opts.flagFastCorrect,
  }]));
}

/** ผลการตรวจของผู้เล่นคนนี้ในแมตช์: { me, flagged, opponentFlagged } */
async function judge(db, matchId, userId) {
  const stats = await matchStats(db, matchId);
  const me = stats.get(userId) || null;
  const opponentFlagged = Boolean(me) && [...stats.values()].some((o) => o.userId !== userId && o.flagged && isOpponent(me, o));
  return { me, flagged: Boolean(me && me.flagged), opponentFlagged };
}

async function recordFlag(db, { matchId, userId, seasonId, mode, me, outcome, source = 'live', action, qrWithheld = 0 }) {
  await db.query(
    `INSERT INTO ranked_integrity_flags (match_id, user_id, season_id, mode, fast_correct, answered, min_ms, avg_ms, outcome, source, action, qr_withheld)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (match_id, user_id) DO NOTHING`,
    [matchId, userId, seasonId, mode, me.fastCorrect, me.answered, me.minMs, me.avgMs, outcome, source, action, qrWithheld]);
}

/** แต้มต่อข้อของ "ผู้เล่นจริง": ตอบถูกเร็วกว่าเกณฑ์มนุษย์ = ได้แค่คะแนนข้อถูก ไม่มีโบนัสความเร็ว */
function playerPoints(pointsFor, correct, elapsedMs, RULES) {
  if (!correct) return 0;
  if (elapsedMs !== null && elapsedMs !== undefined && elapsedMs < INTEGRITY.minHumanMs) return RULES.pointsCorrect;
  return pointsFor(correct, elapsedMs);
}

/* ======================= ตรวจย้อนหลัง ======================= */

/** แมตช์ที่จบแล้วในฤดูกาล (ที่ยังไม่เคยถูกจัดการ) ซึ่งมีผู้เล่นตอบเร็วผิดปกติ */
async function findFlagged(db, seasonId, opts = INTEGRITY) {
  const { rows } = await db.query(
    `SELECT p.match_id, p.user_id, p.slot, p.team, p.qr_before, p.qr_after, p.outcome, m.mode, m.match_type, m.opponent_kind,
            COUNT(a.question_index)::int AS answered,
            COUNT(*) FILTER (WHERE a.correct AND a.response_ms IS NOT NULL AND a.response_ms < $2)::int AS fast_correct,
            MIN(a.response_ms)::int AS min_ms, ROUND(AVG(a.response_ms))::int AS avg_ms
       FROM ranked_matches m
       JOIN ranked_match_players p ON p.match_id = m.id AND p.user_id IS NOT NULL
       LEFT JOIN ranked_answers a ON a.match_id = p.match_id AND a.slot = p.slot
      WHERE m.season_id = $1 AND m.status = 'finished'
        AND NOT EXISTS (SELECT 1 FROM ranked_integrity_flags f WHERE f.match_id = m.id AND f.user_id = p.user_id)
      GROUP BY p.match_id, p.user_id, p.slot, p.team, p.qr_before, p.qr_after, p.outcome, m.mode, m.match_type, m.opponent_kind
     HAVING COUNT(*) FILTER (WHERE a.correct AND a.response_ms IS NOT NULL AND a.response_ms < $2) >= $3
      ORDER BY p.match_id`, [seasonId, opts.minHumanMs, opts.flagFastCorrect]);
  return rows;
}

/** ตำแหน่งแรงค์จาก QR (ไม่สูงกว่าตำแหน่งเดิม) */
function placeDown(prof, qr) {
  const s = stepForQr(qr);
  const cur = LEAGUE_BY_ID[prof.league].order * 10 + prof.division_index;
  const nxt = LEAGUE_BY_ID[s.league].order * 10 + s.divisionIndex;
  return nxt <= cur ? { league: s.league, divisionIndex: s.divisionIndex } : { league: prof.league, divisionIndex: prof.division_index };
}
/** คืนแต้มภายใน League เดิม (การขึ้น League ต้องผ่านแมตช์เลื่อนขั้นเหมือนเดิม) */
function placeRefund(prof, qr) {
  const lg = LEAGUE_BY_ID[prof.league];
  const next = nextLeague(prof.league);
  const capped = next ? Math.min(qr, next.minQr[0] - 1) : qr;
  let idx = prof.division_index;
  while (idx + 1 < lg.minQr.length && capped >= lg.minQr[idx + 1]) idx += 1;
  const promo = next && capped >= next.minQr[0] - 1 && prof.promotion_status === 'none' ? 'pending' : prof.promotion_status;
  return { league: prof.league, divisionIndex: idx, qr: capped, promotionStatus: promo };
}
const snap = (p) => ({ league: p.league, divisionIndex: p.division_index, qr: p.quest_rating, promotionStatus: p.promotion_status,
  promotionRetryAfter: p.promotion_retry_after, seasonHighestLeague: p.season_highest_league, seasonHighestQr: p.season_highest_qr, wins: p.wins });

/**
  แผนการริบ/คืนแต้มของฤดูกาลปัจจุบัน (ยังไม่แก้อะไร)
  ผู้โกง: ริบแต้มที่ "ได้" จากแมตช์ผิดปกติ (qr_after − qr_before > 0) · แมตช์ที่แพ้ไม่ต้องคืนอะไร
  คู่แข่งผู้เล่นจริงที่แพ้ผู้โกงในแมตช์เหล่านั้น: คืนแต้มที่เสียไป
*/
async function planReclaim(db, { seasonId = null } = {}) {
  if (!seasonId) {
    const s = (await db.query('SELECT id FROM ranked_seasons WHERE is_active LIMIT 1')).rows[0];
    if (!s) return { seasonId: null, cheaters: [], refunds: [], flagged: [] };
    seasonId = s.id;
  }
  const flagged = await findFlagged(db, seasonId);
  const cheat = new Map();   // key user|mode -> { gain, matches }
  const refund = new Map();
  const flaggedKey = new Set(flagged.map((f) => `${f.match_id}|${f.user_id}`));
  for (const f of flagged) {
    const k = `${f.user_id}|${f.mode}`;
    const c = cheat.get(k) || { userId: f.user_id, mode: f.mode, gain: 0, matches: [], details: [] };
    const gain = f.match_type === 'apex' ? 0 : Math.max(0, (f.qr_after ?? f.qr_before) - f.qr_before);
    c.gain += gain; c.matches.push(Number(f.match_id));
    c.details.push({ matchId: Number(f.match_id), outcome: f.outcome, gain, fastCorrect: f.fast_correct, answered: f.answered, minMs: f.min_ms, avgMs: f.avg_ms });
    cheat.set(k, c);
    if (f.opponent_kind === 'player' || f.team !== null) {
      const others = (await db.query(
        `SELECT user_id, slot, team, qr_before, qr_after, outcome FROM ranked_match_players WHERE match_id = $1 AND user_id IS NOT NULL AND user_id <> $2`,
        [f.match_id, f.user_id])).rows;
      for (const o of others) {
        if (!isOpponent({ slot: f.slot, team: f.team }, o) || flaggedKey.has(`${f.match_id}|${o.user_id}`)) continue;
        const lost = Math.max(0, o.qr_before - (o.qr_after ?? o.qr_before));
        if (!lost) continue;
        const rk = `${o.user_id}|${f.mode}`;
        const r = refund.get(rk) || { userId: o.user_id, mode: f.mode, amount: 0, matches: [] };
        if (!r.matches.includes(Number(f.match_id))) { r.amount += lost; r.matches.push(Number(f.match_id)); }
        refund.set(rk, r);
      }
    }
  }
  // แสดง/ทำเฉพาะที่มีผลกับแต้มจริง (แมตช์ที่ผู้โกงแพ้ = ไม่ได้แต้มอยู่แล้ว ไม่ต้องริบ)
  const cheaters = [...cheat.values()].filter((c) => c.gain > 0);
  const refunds = [...refund.values()];
  const touched = new Set([...cheaters.flatMap((c) => c.details.filter((d) => d.gain > 0).map((d) => d.matchId)), ...refunds.flatMap((r) => r.matches)]);
  return { seasonId, flagged: flagged.filter((f) => touched.has(Number(f.match_id))), allFlagged: flagged.length, cheaters, refunds };
}

/* ======================= EXP ย้อนหลัง ======================= */
// แหล่ง EXP "รายข้อ" ในหมวดเรียน: การ์ด/บทเรียนคำศัพท์ (exp_log card_*) + grantOnce รายข้อ (c2q/glq/c2x/glx/tNq)
// ข้อที่ได้ EXP ห่างจากข้อก่อนหน้า (คนละคำขอ) น้อยกว่า minHumanMs = เร็วเกินมนุษย์ · ริบเฉพาะ EXP ของข้อเหล่านั้น
// และเฉพาะผู้ใช้ที่มีข้อแบบนี้ตั้งแต่ EXP_FLAG_MIN ข้อ (กันบังเอิญ เช่น เปิด 2 แท็บ)
const EXP_FLAG_MIN = Number(process.env.EXP_FLAG_MIN || 10);
const PACED_SQL = "^(c2q|glq|c2x|glx|t[0-9]+q|spk|spkd|tcq):";

async function planExpReclaim(db, opts = INTEGRITY) {
  // Ranked: EXP จากแมตช์ที่ตอบเร็วผิดปกติ (ทุกฤดูกาล)
  const ranked = (await db.query(
    `WITH f AS (
       SELECT p.match_id, p.user_id
         FROM ranked_matches m
         JOIN ranked_match_players p ON p.match_id = m.id AND p.user_id IS NOT NULL
         JOIN ranked_answers a ON a.match_id = p.match_id AND a.slot = p.slot
        WHERE m.status = 'finished'
        GROUP BY p.match_id, p.user_id
       HAVING COUNT(*) FILTER (WHERE a.correct AND a.response_ms IS NOT NULL AND a.response_ms < $1) >= $2)
     SELECT f.user_id, f.match_id, m.finished_at AS ts,
            COALESCE((CASE WHEN m.user_id = f.user_id THEN m.result WHEN m.player2_id = f.user_id THEN m.result_p2 ELSE p.result END)->'exp'->>'gained', '0')::int AS amount
       FROM f JOIN ranked_matches m ON m.id = f.match_id
       JOIN ranked_match_players p ON p.match_id = f.match_id AND p.user_id = f.user_id
      WHERE NOT EXISTS (SELECT 1 FROM exp_reclaim_refs r WHERE r.ref = 'ranked:' || f.match_id || ':' || f.user_id)`,
    [opts.minHumanMs, opts.flagFastCorrect])).rows.filter((r) => r.amount > 0);
  // หมวดเรียน
  const learn = (await db.query(
    `WITH ev AS (
       SELECT user_id, created_at AS ts, amount, 'log:' || id AS ref, reason AS src FROM exp_log
        WHERE reason IN ('card_known', 'card_review') AND amount > 0
       UNION ALL
       SELECT user_id, created_at, amount, 'award:' || user_id || ':' || award_key, split_part(award_key, ':', 1) FROM exp_awards
        WHERE award_key ~ $2 AND amount > 0),
     t AS (SELECT DISTINCT user_id, ts FROM ev),
     g AS (SELECT user_id, ts, EXTRACT(EPOCH FROM ts - LAG(ts) OVER (PARTITION BY user_id ORDER BY ts)) * 1000 AS gap FROM t)
     SELECT ev.user_id, ev.ts, ev.amount, ev.ref, ev.src, g.gap::float AS gap
       FROM ev JOIN g ON g.user_id = ev.user_id AND g.ts = ev.ts
      WHERE g.gap < $1
        AND NOT EXISTS (SELECT 1 FROM exp_reclaim_refs r WHERE r.ref = ev.ref)`, [opts.learnMinHumanMs || 600, PACED_SQL])).rows;
  const by = new Map();
  const get = (uid) => { if (!by.has(uid)) by.set(uid, { userId: uid, ranked: { amount: 0, items: [] }, learning: { amount: 0, items: [] } }); return by.get(uid); };
  for (const r of ranked) { const u = get(r.user_id); u.ranked.amount += r.amount; u.ranked.items.push({ ref: `ranked:${r.match_id}:${r.user_id}`, amount: r.amount, ts: r.ts }); }
  const learnBy = new Map();
  for (const r of learn) { const l = learnBy.get(r.user_id) || []; l.push(r); learnBy.set(r.user_id, l); }
  for (const [uid, rows] of learnBy) {
    if (rows.length < EXP_FLAG_MIN) continue;
    const u = get(uid);
    rows.forEach((r) => { u.learning.amount += r.amount; u.learning.items.push({ ref: r.ref, amount: r.amount, ts: r.ts, src: r.src }); });
    u.learning.fastAnswers = rows.length;
    u.learning.minGapMs = Math.round(Math.min(...rows.map((r) => r.gap)));
  }
  const users = [...by.values()].map((u) => ({ ...u, total: u.ranked.amount + u.learning.amount })).filter((u) => u.total > 0);
  return { expFlagMin: EXP_FLAG_MIN, users };
}

async function applyExpReclaim(client, batchId, expPlan) {
  const out = [];
  for (const u of expPlan.users) {
    const items = [...u.ranked.items, ...u.learning.items];
    // กันริบซ้ำ (เช่น สั่งพร้อมกัน 2 ครั้ง): จองทุก ref ก่อน ถ้ามีอยู่แล้วข้ามก้อนนั้น
    const fresh = [];
    for (const it of items) {
      const ins = await client.query('INSERT INTO exp_reclaim_refs (ref, batch_id, user_id, amount) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING ref',
        [it.ref, batchId, u.userId, it.amount]);
      if (ins.rowCount) fresh.push(it);
    }
    const want = fresh.reduce((a, it) => a + it.amount, 0);
    if (!want) continue;
    const before = (await client.query('SELECT exp FROM users WHERE id = $1 FOR UPDATE', [u.userId])).rows[0];
    if (!before) continue;
    const take = Math.min(want, before.exp);
    const after = (await client.query('UPDATE users SET exp = exp - $2 WHERE id = $1 RETURNING exp', [u.userId, take])).rows[0].exp;
    // แถวติดลบลงวันที่เดิมของ EXP แต่ละก้อน -> กระดานอันดับรายสัปดาห์/รายเดือนย้อนหลังถูกต้อง (ไม่ไปลบคะแนนสัปดาห์นี้)
    let left = take; const logIds = [];
    for (const it of fresh) {
      if (left <= 0) break;
      const n = Math.min(it.amount, left); left -= n;
      logIds.push((await client.query("INSERT INTO exp_log (user_id, amount, reason, created_at) VALUES ($1, $2, 'integrity_reclaim', $3) RETURNING id",
        [u.userId, -n, it.ts])).rows[0].id);
    }
    await client.query(
      'INSERT INTO exp_reclaims (batch_id, user_id, amount, detail, exp_before, exp_after) VALUES ($1, $2, $3, $4, $5, $6)',
      [batchId, u.userId, take, JSON.stringify({ ranked: u.ranked.amount, learning: u.learning.amount, fastAnswers: u.learning.fastAnswers || 0, items: fresh.length, logIds }), before.exp, after]);
    out.push({ userId: u.userId, amount: take, expBefore: before.exp, expAfter: after });
  }
  return out;
}

/** ทำตามแผนในทรานแซกชันเดียว · คืน batchId (ใช้ revert ได้) */
async function applyReclaim(pool, plan, expPlan = null) {
  plan = plan && plan.seasonId ? plan : { seasonId: null, cheaters: [], refunds: [] };
  const batchId = `rc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const client = await pool.connect();
  const out = { batchId, cheaters: [], refunds: [], exp: [] };
  try {
    await client.query('BEGIN');
    const prof = async (userId, mode) => (await client.query(
      'SELECT * FROM ranked_profiles WHERE user_id = $1 AND season_id = $2 AND mode = $3 FOR UPDATE', [userId, plan.seasonId, mode])).rows[0];
    for (const c of plan.cheaters) {
      const p = await prof(c.userId, c.mode);
      if (!p) continue;
      const qr = Math.max(0, p.quest_rating - c.gain);
      const pos = placeDown(p, qr);
      // จุดสูงสุดของฤดูกาล: คิดใหม่จากแมตช์ที่ไม่ผิดปกติ
      const hi = (await client.query(
        `SELECT MAX(mp.qr_after)::int AS q FROM ranked_match_players mp JOIN ranked_matches m ON m.id = mp.match_id
          WHERE mp.user_id = $1 AND m.season_id = $2 AND m.mode = $3 AND m.status = 'finished' AND NOT (m.id = ANY($4::bigint[]))
            AND NOT EXISTS (SELECT 1 FROM ranked_integrity_flags f WHERE f.match_id = m.id AND f.user_id = mp.user_id)`,
        [c.userId, plan.seasonId, c.mode, c.matches])).rows[0].q;
      const hiQr = Math.max(qr, Math.min(hi === null ? qr : hi, p.season_highest_qr));
      const hiStep = stepForQr(hiQr);
      const hiLeague = LEAGUE_BY_ID[hiStep.league].order >= LEAGUE_BY_ID[pos.league].order ? hiStep.league : pos.league;
      const leagueChanged = pos.league !== p.league || pos.divisionIndex !== p.division_index;
      const wonVoided = c.details.filter((d) => d.outcome === 'win').length;
      await client.query(
        `UPDATE ranked_profiles SET quest_rating = $1, league = $2, division_index = $3,
            promotion_status = CASE WHEN $4 THEN 'none' ELSE promotion_status END,
            promotion_retry_after = CASE WHEN $4 THEN 0 ELSE promotion_retry_after END,
            season_highest_qr = $5, season_highest_league = $6, wins = GREATEST(0, wins - $7), updated_at = NOW()
          WHERE user_id = $8 AND season_id = $9 AND mode = $10`,
        [qr, pos.league, pos.divisionIndex, leagueChanged || c.gain > 0, hiQr, hiLeague, wonVoided, c.userId, plan.seasonId, c.mode]);
      const after = await prof(c.userId, c.mode);
      await client.query(
        `INSERT INTO ranked_qr_reclaims (batch_id, user_id, season_id, mode, kind, amount, match_ids, before, after)
         VALUES ($1, $2, $3, $4, 'cheater', $5, $6, $7, $8)`,
        [batchId, c.userId, plan.seasonId, c.mode, -(p.quest_rating - qr), c.matches, JSON.stringify(snap(p)), JSON.stringify(snap(after))]);
      for (const d of c.details) {
        await client.query(
          `INSERT INTO ranked_integrity_flags (match_id, user_id, season_id, mode, fast_correct, answered, min_ms, avg_ms, outcome, source, action, qr_withheld)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reclaim', 'reclaimed', $10) ON CONFLICT (match_id, user_id) DO NOTHING`,
          [d.matchId, c.userId, plan.seasonId, c.mode, d.fastCorrect, d.answered, d.minMs, d.avgMs, d.outcome, d.gain]);
      }
      if (leagueChanged) {
        await client.query(
          `INSERT INTO rank_history (user_id, season_id, match_id, event, from_league, from_division, to_league, to_division, qr_after, mode)
           VALUES ($1, $2, NULL, 'integrity_reclaim', $3, $4, $5, $6, $7, $8)`,
          [c.userId, plan.seasonId, p.league, p.division_index, pos.league, pos.divisionIndex, qr, c.mode]);
      }
      out.cheaters.push({ userId: c.userId, mode: c.mode, from: snap(p), to: snap(after), matches: c.matches.length });
    }
    for (const r of plan.refunds) {
      const p = await prof(r.userId, r.mode);
      if (!p) continue;
      const pos = placeRefund(p, p.quest_rating + r.amount);
      await client.query(
        `UPDATE ranked_profiles SET quest_rating = $1, division_index = $2, promotion_status = $3,
            season_highest_qr = GREATEST(season_highest_qr, $1), updated_at = NOW()
          WHERE user_id = $4 AND season_id = $5 AND mode = $6`,
        [pos.qr, pos.divisionIndex, pos.promotionStatus, r.userId, plan.seasonId, r.mode]);
      const after = await prof(r.userId, r.mode);
      await client.query(
        `INSERT INTO ranked_qr_reclaims (batch_id, user_id, season_id, mode, kind, amount, match_ids, before, after)
         VALUES ($1, $2, $3, $4, 'refund', $5, $6, $7, $8)`,
        [batchId, r.userId, plan.seasonId, r.mode, pos.qr - p.quest_rating, r.matches, JSON.stringify(snap(p)), JSON.stringify(snap(after))]);
      out.refunds.push({ userId: r.userId, mode: r.mode, from: snap(p), to: snap(after) });
    }
    if (expPlan) out.exp = await applyExpReclaim(client, batchId, expPlan);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** คืนค่าทั้ง batch ตามที่บันทึกไว้ (เฉพาะแถวที่ยังไม่ถูก revert) */
async function revertReclaim(pool, batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = (await client.query('SELECT * FROM ranked_qr_reclaims WHERE batch_id = $1 AND reverted_at IS NULL ORDER BY id DESC FOR UPDATE', [batchId])).rows;
    for (const r of rows) {
      const b = r.before;
      const cur = (await client.query('SELECT * FROM ranked_profiles WHERE user_id = $1 AND season_id = $2 AND mode = $3 FOR UPDATE',
        [r.user_id, r.season_id, r.mode])).rows[0];
      if (!cur) continue;
      const untouched = cur.quest_rating === r.after.qr && cur.league === r.after.league && cur.division_index === r.after.divisionIndex;
      if (!untouched) {
        // ผู้เล่นแข่งต่อไปแล้วหลังปรับ -> คืนเฉพาะส่วนต่างของแต้ม (ไม่ทับผลงานใหม่) · ตำแหน่งคิดใหม่จาก QR
        const qr = Math.max(0, cur.quest_rating - r.amount);
        const pos = r.amount < 0 ? stepForQr(qr) : { league: cur.league, divisionIndex: cur.division_index };
        await client.query(
          `UPDATE ranked_profiles SET quest_rating = $1, league = $2, division_index = $3,
              season_highest_qr = GREATEST(season_highest_qr, $4), wins = wins + $5, updated_at = NOW()
            WHERE user_id = $6 AND season_id = $7 AND mode = $8`,
          [qr, pos.league, pos.divisionIndex, b.seasonHighestQr, Math.max(0, b.wins - r.after.wins), r.user_id, r.season_id, r.mode]);
      } else await client.query(
        `UPDATE ranked_profiles SET quest_rating = $1, league = $2, division_index = $3, promotion_status = $4, promotion_retry_after = $5,
            season_highest_league = $6, season_highest_qr = $7, wins = $8, updated_at = NOW()
          WHERE user_id = $9 AND season_id = $10 AND mode = $11`,
        [b.qr, b.league, b.divisionIndex, b.promotionStatus, b.promotionRetryAfter, b.seasonHighestLeague, b.seasonHighestQr, b.wins, r.user_id, r.season_id, r.mode]);
      if (r.kind === 'cheater') {
        await client.query("DELETE FROM ranked_integrity_flags WHERE user_id = $1 AND source = 'reclaim' AND match_id = ANY($2::bigint[])", [r.user_id, r.match_ids]);
      }
      await client.query('UPDATE ranked_qr_reclaims SET reverted_at = NOW() WHERE id = $1', [r.id]);
    }
    // EXP: คืนตามที่ริบ · ลบแถวติดลบที่ระบบใส่เอง (ข้อมูลของการริบ ไม่ใช่ข้อมูลผู้ใช้) · ปลด ref ให้ตรวจใหม่ได้
    const ex = (await client.query('SELECT * FROM exp_reclaims WHERE batch_id = $1 AND reverted_at IS NULL FOR UPDATE', [batchId])).rows;
    for (const e of ex) {
      await client.query('UPDATE users SET exp = exp + $2 WHERE id = $1', [e.user_id, e.amount]);
      await client.query("DELETE FROM exp_log WHERE user_id = $1 AND reason = 'integrity_reclaim' AND id = ANY($2::int[])", [e.user_id, e.detail.logIds || []]);
      await client.query('DELETE FROM exp_reclaim_refs WHERE batch_id = $1 AND user_id = $2', [batchId, e.user_id]);
      await client.query('UPDATE exp_reclaims SET reverted_at = NOW() WHERE id = $1', [e.id]);
    }
    await client.query('COMMIT');
    return { batchId, reverted: rows.length, expReverted: ex.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { INTEGRITY, EXP_FLAG_MIN, planExpReclaim, applyExpReclaim, matchStats, judge, recordFlag, playerPoints, findFlagged, planReclaim, applyReclaim, revertReclaim, isOpponent, LEAGUES };
