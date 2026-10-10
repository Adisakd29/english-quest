/*
  Ranked Quest API — /api/ranked
  ทุก endpoint อ่าน userId จาก JWT เท่านั้น (ส่ง user_id มาเองไม่มีผล) · คะแนน/QR/ผลแพ้ชนะคำนวณฝั่งเซิร์ฟเวอร์
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const rewards = require('../config/rankedRewards');
const seasons = require('../services/ranked/seasons');
const { createLimiter } = require('../utils/rateLimit');
const leagues = require('../config/leagues');
const NPCS = require('../config/rankedNpcs');
const svc = require('../services/ranked/matchService');
const battleConfig = require('../config/battle');
const pool = require('../config/db');

const router = express.Router();
router.use(authRequired);

const actionLimiter = createLimiter({ limit: 90, windowMs: 60 * 1000 });   // กันยิง request รัว ๆ
const startLimiter = createLimiter({ limit: 12, windowMs: 60 * 1000 });

function fail(res, err, where) {
  if (err instanceof svc.RankedError) return res.status(err.status).json({ error: err.message, code: err.code, retryAfter: err.retryAfter });
  console.error(`[ranked/${where}]`, err);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาดใน Ranked Quest ลองใหม่อีกครั้ง' });
}
const limited = (limiter) => (req, res, next) => (limiter.check(`u:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());

router.get('/config', (_req, res) => {
  res.json({
    ...leagues.publicConfig(),
    battle: battleConfig.publicConfig(),
    // เสียงในทีม (WebRTC): ค่าเริ่มต้นใช้ STUN สาธารณะ · ตั้ง TURN ของตัวเองได้ด้วย env RTC_ICE_SERVERS (JSON) ให้ต่อผ่านเครือข่ายที่เข้มงวดได้
    rtc: { iceServers: (() => { try { return JSON.parse(process.env.RTC_ICE_SERVERS); } catch (_) { return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]; } })() },
    npcs: [...NPCS.NPCS, ...NPCS.GUARDIANS].map(NPCS.publicNpc),
  });
});

router.get('/me', async (req, res) => {
  try {
    const mode = leagues.modeOf(req.query.mode);
    const { season, row } = await svc.getOrCreateProfile(req.userId, mode);
    // สรุปแรงค์ของทุกโหมด (ใช้แสดงบนตัวสลับโหมดและการ์ดหน้าเล่น)
    const modes = {};
    for (const m of leagues.MODE_IDS) {
      const r = m === mode ? row : (await svc.getOrCreateProfile(req.userId, m)).row;
      modes[m] = { league: r.league, label: leagues.labelOf(r.league, r.division_index), questRating: r.quest_rating };
    }
    const activeId = await svc.activeMatchId(req.userId);
    res.json({
      season: { id: season.id, name: season.name, theme: season.theme, endsAt: season.ends_at },
      mode, modes,
      profile: svc.profileView(row),
      cefr: await svc.getUserCefr(req.userId),
      activeMatchId: activeId,
      cooldownUntil: await cooldownOf(req.userId),
      pendingReview: await svc.pendingReview(req.userId),
      cosmetics: await equipped(req.userId),
      auroraRank: row.league === 'aurora-lion' ? Number((await pool.query(
        "SELECT COUNT(*)::int + 1 AS n FROM ranked_profiles WHERE season_id = $1 AND mode = $3 AND league = 'aurora-lion' AND quest_rating > $2",
        [season.id, row.quest_rating, mode])).rows[0].n) : null,
    });
  } catch (err) { fail(res, err, 'me'); }
});

async function cooldownOf(userId) {
  const { rows } = await pool.query('SELECT ranked_cooldown_until FROM users WHERE id = $1', [userId]);
  const t = rows[0] && rows[0].ranked_cooldown_until;
  return t && new Date(t) > new Date() ? t : null;
}

/* ---------------- ค่าเสียง (Master / Music / SFX / Mute) — จำข้ามอุปกรณ์ ---------------- */
const AUDIO_DEFAULT = { master: 70, music: 55, sfx: 80, muted: false, appMusic: true };
function cleanAudio(body) {
  const out = { ...AUDIO_DEFAULT };
  for (const k of ['master', 'music', 'sfx']) {
    const v = Number(body && body[k]);
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  out.muted = Boolean(body && body.muted === true);
  out.appMusic = !(body && body.appMusic === false);   // เพลงในแอป (นอก Ranked) — ค่าเริ่มต้นเปิด
  return out;
}
router.get('/audio-settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT audio_settings FROM users WHERE id = $1', [req.userId]);
    res.json({ settings: rows[0] && rows[0].audio_settings ? cleanAudio(rows[0].audio_settings) : null, defaults: AUDIO_DEFAULT });
  } catch (err) { fail(res, err, 'audio'); }
});
router.put('/audio-settings', async (req, res) => {
  try {
    const settings = cleanAudio(req.body || {});
    await pool.query('UPDATE users SET audio_settings = $1 WHERE id = $2', [JSON.stringify(settings), req.userId]);
    res.json({ settings });
  } catch (err) { fail(res, err, 'audio'); }
});

router.post('/tutorial-done', async (req, res) => {
  try {
    const { season } = await svc.getOrCreateProfile(req.userId);
    await pool.query('UPDATE ranked_profiles SET tutorial_done = TRUE WHERE user_id = $1 AND season_id = $2', [req.userId, season.id]); // ทุกโหมด
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'tutorial'); }
});

router.post('/matches', limited(startLimiter), async (req, res) => {
  try {
    const { type, npcId, npcFallback, mode } = req.body || {};
    res.json(await svc.startMatch(req.userId, { type, npcId: typeof npcId === 'string' ? npcId : null, npcFallback: npcFallback === true, mode }));
  } catch (err) { fail(res, err, 'start'); }
});

router.get('/matches/:id', async (req, res) => {
  try { res.json(await svc.getState(req.params.id, req.userId)); } catch (err) { fail(res, err, 'state'); }
});

router.post('/matches/:id/answer', limited(actionLimiter), async (req, res) => {
  try {
    const { questionIndex, choiceIndex } = req.body || {};
    res.json(await svc.submitAnswer(req.params.id, req.userId, {
      questionIndex, choiceIndex: choiceIndex === null || choiceIndex === undefined ? null : choiceIndex,
    }));
  } catch (err) { fail(res, err, 'answer'); }
});

router.post('/matches/:id/next', limited(actionLimiter), async (req, res) => {
  try { res.json(await svc.nextQuestion(req.params.id, req.userId)); } catch (err) { fail(res, err, 'next'); }
});

// ระหว่างเกม NPC หน้าเว็บส่ง ping เป็นระยะ — เงียบเกินกำหนด = เริ่มนับ grace 30 วินาที
router.post('/matches/:id/ping', async (req, res) => {
  try { res.json(await svc.ping(req.params.id, req.userId)); } catch (err) { fail(res, err, 'ping'); }
});

router.post('/matches/:id/forfeit', async (req, res) => {
  try { res.json(await svc.forfeit(req.params.id, req.userId)); } catch (err) { fail(res, err, 'forfeit'); }
});

router.post('/matches/:id/review', async (req, res) => {
  try { res.json(await svc.addMissedToReview(req.params.id, req.userId)); } catch (err) { fail(res, err, 'review'); }
});

router.get('/history', async (req, res) => {
  // ประวัติเก็บครบในฐานข้อมูลเสมอ — หน้า Ranked ขอแค่ 3 รายการล่าสุด · หน้า "ประวัติทั้งหมด" โหลดทีละหน้า
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const offset = Math.max(0, Math.min(100000, Number(req.query.offset) || 0));
    const rows = await svc.history(req.userId, limit + 1, req.query.mode || null, offset);
    res.json({ matches: rows.slice(0, limit), more: rows.length > limit, offset });
  } catch (err) { fail(res, err, 'history'); }
});


/* ---------------- เพื่อนบนแผนที่ "เส้นทางสู่แรงค์สูงสุด" ----------------
   เฉพาะเพื่อนที่ตอบรับแล้ว · ไม่ได้บล็อกกัน · ไม่ได้ตั้งซ่อนตำแหน่งแรงค์ — ส่งเท่าที่จำเป็น (ชื่อในเกม อวตาร แรงค์) */
router.get('/friends', async (req, res) => {
  try {
    const mode = leagues.modeOf(req.query.mode);
    const season = await svc.getActiveSeason();
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.avatar_image, p.league, p.division_index
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         JOIN ranked_profiles p ON p.user_id = u.id AND p.season_id = $2 AND p.mode = $3
        WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
          AND NOT u.rank_hidden_from_friends
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
        ORDER BY u.username LIMIT 300`, [req.userId, season.id, mode]);
    res.json({
      mode,
      friends: rows.filter((r) => leagues.LEAGUE_BY_ID[r.league]).map((r) => ({
        id: r.id, name: r.username, avatar: r.avatar || 'fox', avatarImage: r.avatar_image || null,
        league: r.league, divisionIndex: r.division_index, label: leagues.labelOf(r.league, r.division_index),
      })),
    });
  } catch (err) { fail(res, err, 'friends'); }
});

router.get('/privacy', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT rank_hidden_from_friends FROM users WHERE id = $1', [req.userId]);
    res.json({ hideFromFriends: Boolean(rows[0] && rows[0].rank_hidden_from_friends) });
  } catch (err) { fail(res, err, 'privacy'); }
});
router.put('/privacy', async (req, res) => {
  try {
    const hide = Boolean(req.body && req.body.hideFromFriends === true);
    await pool.query('UPDATE users SET rank_hidden_from_friends = $1 WHERE id = $2', [hide, req.userId]);
    res.json({ hideFromFriends: hide });
  } catch (err) { fail(res, err, 'privacy'); }
});

/* ---------------- รางวัล (Cosmetic only) ---------------- */
async function equipped(userId) {
  const { rows } = await pool.query('SELECT ranked_title, ranked_frame FROM users WHERE id = $1', [userId]);
  const u = rows[0] || {};
  return { title: u.ranked_title ? rewards.describe(u.ranked_title) : null, frame: u.ranked_frame ? rewards.describe(u.ranked_frame) : null };
}

router.get('/rewards', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT reward_id, granted_at FROM user_ranked_rewards WHERE user_id = $1 ORDER BY granted_at', [req.userId]);
    const owned = new Set(rows.map((r) => r.reward_id));
    // แคตตาล็อก: Title ทุก League + Frame (Moon Wolf ขึ้นไป) — แสดงทั้งที่ได้แล้วและยังล็อก
    const frameFrom = leagues.LEAGUE_BY_ID[rewards.SEASON_PLAN.frameFrom].order;
    const catalog = [
      ...leagues.LEAGUES.map((l) => `title:${l.id}`),
      ...leagues.LEAGUES.filter((l) => l.order >= frameFrom).map((l) => `frame:${l.id}`),
      'apex:solari',
    ].map((id) => ({ ...rewards.describe(id), owned: owned.has(id) }));
    const extras = rows.filter((r) => !catalog.some((c) => c.id === r.reward_id))
      .map((r) => ({ ...rewards.describe(r.reward_id), owned: true, grantedAt: r.granted_at }));
    res.json({ catalog, extras, equipped: await equipped(req.userId), note: 'รางวัลเป็นของตกแต่งเท่านั้น ไม่มีผลกับคะแนนหรือความยากของเกม' });
  } catch (err) { fail(res, err, 'rewards'); }
});

router.post('/rewards/equip', async (req, res) => {
  try {
    const { slot, rewardId } = req.body || {};
    if (!['title', 'frame'].includes(slot)) return res.status(400).json({ error: 'ตำแหน่งไม่ถูกต้อง', code: 'BAD_SLOT' });
    if (rewardId !== null) {
      if (typeof rewardId !== 'string') return res.status(400).json({ error: 'รางวัลไม่ถูกต้อง', code: 'BAD_REWARD' });
      // ต้องเป็นของที่ได้รับแล้ว และใส่ได้ในตำแหน่งนั้นจริง (ตรวจฝั่งเซิร์ฟเวอร์ — แก้จาก DevTools ไม่ได้)
      const own = await pool.query('SELECT 1 FROM user_ranked_rewards WHERE user_id = $1 AND reward_id = $2', [req.userId, rewardId]);
      if (!own.rows[0]) return res.status(403).json({ error: 'ยังไม่ได้รับรางวัลนี้', code: 'NOT_OWNED' });
      if (rewards.describe(rewardId).equip !== slot) return res.status(400).json({ error: 'ใส่รางวัลนี้ในตำแหน่งนี้ไม่ได้', code: 'WRONG_SLOT' });
    }
    await pool.query(`UPDATE users SET ${slot === 'title' ? 'ranked_title' : 'ranked_frame'} = $1 WHERE id = $2`, [rewardId, req.userId]);
    res.json({ equipped: await equipped(req.userId) });
  } catch (err) { fail(res, err, 'equip'); }
});

/* ---------------- Admin: Analytics (ข้อมูลสำหรับปรับสมดุล) + จัดการซีซัน ---------------- */
router.get('/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const season = await svc.getActiveSeason();
    const q = (sql, params = [season.id]) => pool.query(sql, params).then((r) => r.rows);
    const [overview, byNpc, byType, distribution, promotions, queue, endReasons, battleRows, resultReasons, conduct] = await Promise.all([
      q(`SELECT COUNT(*) FILTER (WHERE status = 'finished')::int AS finished,
                COUNT(*) FILTER (WHERE status = 'abandoned')::int AS abandoned,
                COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                COUNT(*) FILTER (WHERE opponent_kind = 'player' AND status = 'finished')::int AS pvp_finished
           FROM ranked_matches WHERE season_id = $1`),
      // อัตราชนะของผู้เล่นเมื่อเจอ NPC แต่ละตัว (ใช้ตรวจเป้าหมายข้อ 56)
      q(`SELECT m.npc_id, m.match_type, COUNT(*)::int AS games,
                ROUND(100.0 * AVG(CASE WHEN p.outcome = 'win' THEN 1 ELSE 0 END))::int AS player_win_pct
           FROM ranked_matches m JOIN ranked_match_players p ON p.match_id = m.id AND p.slot = 0
          WHERE m.season_id = $1 AND m.status = 'finished' AND m.npc_id IS NOT NULL
          GROUP BY m.npc_id, m.match_type ORDER BY games DESC`),
      q(`SELECT q->>'type' AS type, COUNT(*)::int AS answers, ROUND(100.0 * AVG(CASE WHEN a.correct THEN 1 ELSE 0 END))::int AS accuracy_pct,
                ROUND(AVG(a.response_ms))::int AS avg_response_ms
           FROM ranked_answers a JOIN ranked_matches m ON m.id = a.match_id
           CROSS JOIN LATERAL (SELECT m.questions -> a.question_index AS q) x
          WHERE m.season_id = $1 AND (a.slot = 0 OR m.opponent_kind = 'player') GROUP BY 1 ORDER BY 1`),
      q(`SELECT league, COUNT(*)::int AS players FROM ranked_profiles WHERE season_id = $1 AND (wins + losses + draws) > 0 GROUP BY league`),
      q(`SELECT m.npc_id AS guardian, COUNT(*)::int AS trials,
                ROUND(100.0 * AVG(CASE WHEN p.outcome = 'win' THEN 1 ELSE 0 END))::int AS success_pct
           FROM ranked_matches m JOIN ranked_match_players p ON p.match_id = m.id AND p.slot = 0
          WHERE m.season_id = $1 AND m.status = 'finished' AND m.match_type = 'promotion' GROUP BY 1`),
      q(`SELECT COUNT(*)::int AS matches, ROUND(AVG(queue_ms))::int AS avg_queue_ms,
                PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY queue_ms)::int AS p90_queue_ms
           FROM ranked_matches WHERE season_id = $1 AND queue_ms IS NOT NULL`),
      q(`SELECT COALESCE(end_reason, 'unknown') AS reason, COUNT(*)::int AS matches FROM ranked_matches
          WHERE season_id = $1 AND status IN ('finished', 'abandoned') GROUP BY 1`),
      // Battle HP: HP ที่เหลือเฉลี่ย · ระยะเวลาเกม · comeback (ฝั่งที่เคย HP ต่ำกว่า 25% แล้วชนะ)
      q(`SELECT COUNT(*)::int AS matches,
                ROUND(AVG((final_hp_p1 + final_hp_p2) / 2.0))::int AS avg_hp_remaining,
                ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - created_at))))::int AS avg_duration_sec,
                SUM(disconnects)::int AS disconnects, SUM(reconnects)::int AS reconnects,
                COUNT(*) FILTER (WHERE (hp_min->>0)::int < $2 AND (
                   (opponent_kind <> 'team' AND EXISTS (SELECT 1 FROM ranked_match_players p WHERE p.match_id = m.id AND p.slot = 0 AND p.outcome = 'win'))
                OR (opponent_kind = 'team' AND EXISTS (SELECT 1 FROM ranked_match_players p WHERE p.match_id = m.id AND p.team = 0 AND p.outcome = 'win'))))::int
                + COUNT(*) FILTER (WHERE (hp_min->>1)::int < $2 AND (
                   (opponent_kind <> 'team' AND EXISTS (SELECT 1 FROM ranked_match_players p WHERE p.match_id = m.id AND p.slot = 1 AND p.outcome = 'win'))
                OR (opponent_kind = 'team' AND EXISTS (SELECT 1 FROM ranked_match_players p WHERE p.match_id = m.id AND p.team = 1 AND p.outcome = 'win'))))::int AS comebacks,
                COUNT(*) FILTER (WHERE (hp_min->>0)::int < $2)::int + COUNT(*) FILTER (WHERE (hp_min->>1)::int < $2)::int AS critical_sides
           FROM ranked_matches m WHERE season_id = $1 AND status = 'finished' AND final_hp_p1 IS NOT NULL`,
      [season.id, Math.ceil(battleConfig.BATTLE.initialHp * battleConfig.BATTLE.criticalHpRatio)]),
      q(`SELECT COALESCE(result_reason, 'unknown') AS reason, COUNT(*)::int AS matches FROM ranked_matches
          WHERE season_id = $1 AND status = 'finished' GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT COUNT(*) FILTER (WHERE p.forfeit_reason IS NOT NULL)::int AS forfeits,
                COUNT(*) FILTER (WHERE p.forfeit_reason = 'surrender')::int AS surrenders,
                COUNT(*) FILTER (WHERE p.forfeit_reason IN ('disconnect', 'timeout'))::int AS disconnect_losses,
                COUNT(*) FILTER (WHERE p.qr_penalty > 0)::int AS penalties,
                COUNT(*) FILTER (WHERE p.user_id IS NOT NULL)::int AS player_games
           FROM ranked_match_players p JOIN ranked_matches m ON m.id = p.match_id
          WHERE m.season_id = $1 AND m.status = 'finished'`),
    ]);
    const b = battleRows[0] || {};
    const c = conduct[0] || {};
    const pct = (a, n) => (n ? Math.round((100 * a) / n) : null);
    const ov = overview[0];
    const totalEnded = endReasons.reduce((s, r) => s + r.matches, 0);
    const disc = endReasons.filter((r) => ['disconnect', 'restart'].includes(r.reason)).reduce((s, r) => s + r.matches, 0);
    res.json({
      season: { name: season.name, theme: season.theme, endsAt: season.ends_at },
      overview: { ...ov, completionPct: ov.finished + ov.abandoned ? Math.round((100 * ov.finished) / (ov.finished + ov.abandoned)) : null,
        disconnectPct: totalEnded ? Math.round((100 * disc) / totalEnded) : null },
      npcWinRates: byNpc, questionTypes: byType,
      leagueDistribution: leagues.LEAGUES.map((l) => ({ league: l.id, name: l.name, players: (distribution.find((d) => d.league === l.id) || {}).players || 0 })),
      promotions, queue: queue[0], endReasons, resultReasons,
      battle: {
        matches: b.matches || 0, avgHpRemaining: b.avg_hp_remaining ?? null, avgDurationSec: b.avg_duration_sec ?? null,
        hpZeroPct: pct((resultReasons.find((r) => r.reason === 'hp_zero') || {}).matches || 0, ov.finished),
        questionLimitPct: pct((resultReasons.find((r) => r.reason === 'questions_complete') || {}).matches || 0, ov.finished),
        disconnectRatePct: pct(c.disconnect_losses || 0, c.player_games),
        reconnectSuccessPct: pct(b.reconnects || 0, b.disconnects || 0),
        surrenderRatePct: pct(c.surrenders || 0, c.player_games),
        penaltyCount: c.penalties || 0,
        criticalComebackPct: pct(b.comebacks || 0, b.critical_sides || 0),
      },
    });
  } catch (err) { fail(res, err, 'analytics'); }
});

router.post('/admin/season/rollover', requireAdmin, async (req, res) => {
  try { res.json(await seasons.rollover()); } catch (err) { fail(res, err, 'rollover'); }
});

/*
  Ranked Leaderboard — scope: season (ค่าเริ่มต้น) | friends | weekly | global
  แสดงเฉพาะข้อมูลสาธารณะ: ชื่อผู้ใช้ อวตาร League QR Win rate — ไม่มีอีเมล/ชื่อจริง
  Aurora Lion แสดงอันดับในกลุ่ม Aurora Lion ด้วย (เช่น Aurora Lion #27)
*/
router.get('/leaderboard', async (req, res) => {
  try {
    const scope = ['season', 'friends', 'weekly', 'global'].includes(req.query.scope) ? req.query.scope : 'season';
    const mode = leagues.modeOf(req.query.mode);   // กระดานอันดับแยกตามโหมด Vocab / Grammar
    const season = await svc.getActiveSeason();
    const friendsOnly = scope === 'friends'
      ? `AND p.user_id IN (SELECT $2::int UNION
           SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END FROM friendships
            WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2))` : '';
    let sql;
    if (scope === 'weekly') {
      // QR ที่ได้สุทธิในสัปดาห์นี้ (เกม Ranked ที่จบแล้ว)
      sql = `SELECT mp.user_id, SUM(mp.qr_after - mp.qr_before)::int AS score
               FROM ranked_match_players mp JOIN ranked_matches m ON m.id = mp.match_id
              WHERE mp.user_id IS NOT NULL AND m.status = 'finished' AND m.match_type <> 'practice'
                AND m.season_id = $1 AND m.mode = $3 AND m.finished_at >= date_trunc('week', NOW()) AND $2::int IS NOT NULL
              GROUP BY mp.user_id`;
    } else if (scope === 'global') {
      sql = `SELECT user_id, MAX(season_highest_qr)::int AS score FROM ranked_profiles
              WHERE mode = $3 AND $1::int IS NOT NULL AND $2::int IS NOT NULL GROUP BY user_id`;
    } else {
      sql = `SELECT p.user_id, p.quest_rating AS score FROM ranked_profiles p
              WHERE p.season_id = $1 AND p.mode = $3 AND $2::int IS NOT NULL AND (p.wins + p.losses + p.draws) > 0 ${friendsOnly}`;
    }
    const { rows } = await pool.query(
      `WITH s AS (${sql}),
            ranked AS (SELECT s.user_id, s.score, RANK() OVER (ORDER BY s.score DESC) AS position FROM s)
       SELECT r.position::int, r.score, u.id, u.username, u.avatar, u.avatar_image, u.ranked_title, u.ranked_frame,
              p.league, p.division_index, p.quest_rating, p.wins, p.losses, p.draws,
              CASE WHEN p.league = 'aurora-lion'
                   THEN RANK() OVER (PARTITION BY (p.league = 'aurora-lion') ORDER BY p.quest_rating DESC) END AS aurora_rank
         FROM ranked r JOIN users u ON u.id = r.user_id
         LEFT JOIN ranked_profiles p ON p.user_id = r.user_id AND p.season_id = $1 AND p.mode = $3
        ORDER BY r.position, u.username LIMIT 200`, [season.id, req.userId, mode]);
    const view = (r) => {
      const played = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
      return {
        position: r.position, userId: r.id, name: r.username, avatar: r.avatar, avatarImage: r.avatar_image || null,
        league: r.league || 'trail-finch', divisionIndex: r.division_index || 0, label: leagues.labelOf(r.league || 'trail-finch', r.division_index || 0),
        questRating: r.quest_rating || 0, score: r.score, winRate: played ? Math.round((r.wins / played) * 100) : 0, played,
        auroraRank: r.aurora_rank ? Number(r.aurora_rank) : null, isMe: r.id === req.userId,
        title: r.ranked_title ? rewards.describe(r.ranked_title).name : null, frame: r.ranked_frame || null,
      };
    };
    const all = rows.map(view);
    res.json({ scope, mode, season: { name: season.name, theme: season.theme }, top: all.slice(0, 100), me: all.find((x) => x.isMe) || null });
  } catch (err) { fail(res, err, 'leaderboard'); }
});

module.exports = router;
