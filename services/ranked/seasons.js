/*
  Ranked Quest — Season (8–12 สัปดาห์ · ตั้งค่าจาก DB/config) + Soft Reset + รางวัลปลายซีซัน (Cosmetic only)
  Soft reset: ไม่รีเซ็ตทุกคนไป Trail Finch — ใช้ reset_rules ของซีซัน (เช่น Aurora Lion -> Shadow Panther)
  League ที่ไม่มีในกฎ (Trail Finch / Swift Hare / River Otter) อยู่ League เดิม แต่เริ่มที่ Division ต่ำสุดของ League
*/
const pool = require('../../config/db');
const { LEAGUE_BY_ID } = require('../../config/leagues');
const { SEASON_PLAN } = require('../../config/rankedRewards');

async function grant(client, userId, rewardId, seasonId = null) {
  await client.query('INSERT INTO user_ranked_rewards (user_id, reward_id, season_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [userId, rewardId, seasonId]);
}

/** ปิดซีซันปัจจุบัน แจกรางวัล แล้วเปิดซีซันใหม่ด้วย Soft Reset (ทำใน transaction เดียว) */
async function rollover({ weeks = SEASON_PLAN.weeks } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = (await client.query('SELECT * FROM ranked_seasons WHERE is_active FOR UPDATE')).rows[0];
    if (!old) throw new Error('no active season');
    const n = Number((await client.query('SELECT COUNT(*)::int AS n FROM ranked_seasons')).rows[0].n) + 1;
    const profiles = (await client.query('SELECT * FROM ranked_profiles WHERE season_id = $1', [old.id])).rows;

    // ---- รางวัลปลายซีซัน (ของตกแต่งเท่านั้น) ----
    const frameFrom = LEAGUE_BY_ID[SEASON_PLAN.frameFrom].order;
    let granted = 0;
    for (const p of profiles) {
      if (p.wins + p.losses + p.draws === 0) continue;
      const hi = LEAGUE_BY_ID[p.season_highest_league];
      await grant(client, p.user_id, `season-badge:${old.slug}:${hi.id}`, old.id); granted += 1;
      if (hi.order >= frameFrom) { await grant(client, p.user_id, `frame:${hi.id}`, old.id); granted += 1; }
    }
    const { topN, minQr } = SEASON_PLAN.auroraNameplate;
    // Top Aurora Lion แยกตามโหมด (Vocab / Grammar มีอันดับของตัวเอง)
    const auroraTop = ['vocab', 'grammar'].flatMap((mode) => profiles.filter((p) => (p.mode || 'vocab') === mode && p.league === 'aurora-lion' && p.quest_rating >= minQr)
      .sort((a, b) => b.quest_rating - a.quest_rating).slice(0, topN));
    for (const p of auroraTop) { await grant(client, p.user_id, `nameplate:aurora:${old.slug}`, old.id); granted += 1; }

    // ---- เปิดซีซันใหม่ ----
    await client.query('UPDATE ranked_seasons SET is_active = FALSE, ends_at = LEAST(COALESCE(ends_at, NOW()), NOW()) WHERE id = $1', [old.id]);
    const theme = SEASON_PLAN.themes[n - 1] || SEASON_PLAN.fallbackTheme;
    const next = (await client.query(
      `INSERT INTO ranked_seasons (slug, name, theme, starts_at, ends_at, is_active, reset_rules)
       VALUES ($1, $2, $3, NOW(), NOW() + make_interval(weeks => $4::int), TRUE, $5) RETURNING *`,
      [`s${n}`, `Season ${n}`, theme, weeks, JSON.stringify(old.reset_rules || {})])).rows[0];

    // ---- Soft reset ----
    const rules = old.reset_rules || {};
    for (const p of profiles) {
      const target = LEAGUE_BY_ID[rules[p.league]] && LEAGUE_BY_ID[rules[p.league]].order < LEAGUE_BY_ID[p.league].order
        ? LEAGUE_BY_ID[rules[p.league]] : LEAGUE_BY_ID[p.league];
      await client.query(
        `INSERT INTO ranked_profiles (user_id, season_id, mode, league, division_index, quest_rating, season_highest_league, season_highest_qr, tutorial_done)
         VALUES ($1, $2, $6, $3, 0, $4, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [p.user_id, next.id, target.id, target.minQr[0], p.tutorial_done, p.mode || 'vocab']);
      await client.query(
        `INSERT INTO rank_history (user_id, season_id, event, from_league, from_division, to_league, to_division, qr_after, mode)
         VALUES ($1, $2, 'season_reset', $3, $4, $5, 0, $6, $7)`, [p.user_id, next.id, p.league, p.division_index, target.id, target.minQr[0], p.mode || 'vocab']);
    }
    await client.query('COMMIT');
    return { closed: old.slug, opened: next.slug, theme, players: profiles.length, rewardsGranted: granted };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** ตรวจว่าซีซันหมดเวลาหรือยัง (เรียกตอนเริ่มเซิร์ฟเวอร์และทุกชั่วโมง) */
async function checkRollover() {
  const { rows } = await pool.query('SELECT id FROM ranked_seasons WHERE is_active AND ends_at IS NOT NULL AND ends_at < NOW()');
  if (!rows[0]) return null;
  const r = await rollover();
  console.log(`[ranked/season] ปิด ${r.closed} -> เปิด ${r.opened} (${r.theme}) · ผู้เล่น ${r.players} · รางวัล ${r.rewardsGranted}`);
  return r;
}

module.exports = { rollover, checkRollover, grant };
