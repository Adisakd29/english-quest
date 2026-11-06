/*
  Achievement + รางวัล Coin ที่คำนวณจากข้อมูลการเรียนในฐานข้อมูล (ตรวจฝั่งเซิร์ฟเวอร์ · ได้ครั้งเดียวต่อ key)
  evaluate(userId) เรียกได้บ่อย (throttle) — หลังได้ Coin, ตอนเปิดโปรไฟล์/ร้าน, หลังจบกิจกรรม
  รางวัลย้อนหลัง: Achievement ปลดล็อกจากความก้าวหน้าเดิมได้ (เป็นรางวัลความสำเร็จ)
    แต่ Coin รายกิจกรรม (Mastery / Assessment) นับเฉพาะที่ทำหลังเปิดระบบ Coin (หลัง coin_wallets.created_at) — ไม่แจก Coin ย้อนหลังจำนวนมาก
*/
const pool = require('../../config/db');
const ACH = require('../../config/achievements');
const { LEAGUE_BY_ID } = require('../../config/leagues');
const { getLevelInfo } = require('../../utils/leveling');
const coins = require('../coins');
const { DAILY_GOAL_ANSWERS } = require('../../config/coinRewards');

const BY_ID = Object.fromEntries(ACH.map((a) => [a.id, a]));

async function metrics(userId) {
  const q = (sql, p = [userId]) => pool.query(sql, p).then((r) => r.rows[0]);
  const [goal, presets, user, known, gm, toeic, c2, league] = await Promise.all([
    q("SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = 'DAILY_GOAL'"),
    q('SELECT COUNT(*)::int AS n FROM outfit_presets WHERE user_id = $1'),
    q('SELECT exp FROM users WHERE id = $1'),
    q("SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1 AND status = 'known'"),
    q('SELECT COUNT(*)::int AS n FROM grammar_lessons WHERE user_id = $1 AND mastered_at IS NOT NULL'),
    q('SELECT COUNT(*)::int AS n FROM toeic_answers WHERE user_id = $1 AND is_correct'),
    q("SELECT COUNT(*)::int AS n FROM exp_awards WHERE user_id = $1 AND award_key LIKE 'c2c:%'"),
    pool.query('SELECT league, season_highest_league FROM ranked_profiles WHERE user_id = $1', [userId]).then((r) => r.rows),
  ]);
  const order = (id) => (LEAGUE_BY_ID[id] ? LEAGUE_BY_ID[id].order : 0);
  return {
    goal_days: goal.n, presets: presets.n, level: user ? getLevelInfo(user.exp).level : 1, known_words: known.n,
    grammar_mastered: gm.n, toeic_correct: toeic.n, c2_units: c2.n,
    league_order: league.reduce((a, r) => Math.max(a, order(r.league), order(r.season_highest_league)), 0),
  };
}

/** รางวัล Coin รายกิจกรรมที่ดูจากข้อมูล (Mastery · Assessment · เลื่อนแรงค์) */
async function reconcileActivityCoins(userId) {
  const w = (await pool.query('SELECT created_at FROM coin_wallets WHERE user_id = $1', [userId])).rows[0];
  if (!w) return;
  const since = w.created_at;
  // เป้าหมายรายวัน / รายสัปดาห์ (นับคำตอบวันนี้จาก answer_events ฝั่งเซิร์ฟเวอร์)
  const today = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1
       AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId])).rows[0].n;
  await coins.checkGoals(userId, today, DAILY_GOAL_ANSWERS);
  const mastered = await pool.query(
    'SELECT topic_id FROM grammar_lessons WHERE user_id = $1 AND mastered_at IS NOT NULL AND mastered_at >= $2', [userId, since]);
  for (const r of mastered.rows) await coins.grant(userId, { type: 'GRAMMAR_MASTERY', key: `gm:${r.topic_id}`, sourceId: r.topic_id });
  // ผ่าน Unit Test / Boss ครั้งแรก (ครั้งแรกที่ผ่านต้องเกิดหลังเปิดระบบ Coin)
  const passed = await pool.query(
    `SELECT kind, ref FROM assessments WHERE user_id = $1 AND passed GROUP BY kind, ref HAVING MIN(completed_at) >= $2`, [userId, since]);
  for (const r of passed.rows) {
    await coins.grant(userId, { type: r.kind === 'boss' ? 'VOCAB_MASTERY' : 'VOCAB_UNIT', key: `as:${r.kind}:${r.ref}`, sourceId: `${r.kind}:${r.ref}` });
  }
  // เลื่อนแรงค์: ตำแหน่งปัจจุบัน (League + Division) ที่สูงกว่าจุดเริ่ม ได้ครั้งเดียวต่อซีซัน/โหมด/ตำแหน่ง
  const rp = await pool.query('SELECT season_id, mode, league, division_index, updated_at FROM ranked_profiles WHERE user_id = $1', [userId]);
  for (const r of rp.rows) {
    const L = LEAGUE_BY_ID[r.league];
    if (!L || (L.order === 1 && r.division_index === 0) || new Date(r.updated_at) < new Date(since)) continue;
    const div = L.divisions[r.division_index] || '';
    await coins.grant(userId, {
      type: 'RANK_PROMOTION', key: `rank:${r.season_id}:${r.mode}:${r.league}:${r.division_index}`,
      sourceId: `${r.league}:${r.division_index}`, description: `เลื่อนแรงค์ ${L.nameEn} ${div}`.trim(),
    });
  }
}

const lastRun = new Map();
/** ตรวจและมอบ Achievement + รางวัล (idempotent) · คืนรายการที่เพิ่งปลดล็อก */
async function evaluate(userId, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastRun.get(userId) || 0) < 4000) return [];
  lastRun.set(userId, now);
  if (lastRun.size > 20000) lastRun.clear();
  await reconcileActivityCoins(userId);
  const m = await metrics(userId);
  const have = new Set((await pool.query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId])).rows.map((r) => r.achievement_id));
  const unlocked = [];
  for (const a of ACH) {
    if (have.has(a.id) || (m[a.metric] || 0) < a.target) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING achievement_id', [userId, a.id]);
      if (!ins.rows[0]) { await client.query('ROLLBACK'); continue; }
      if (a.item) {
        await client.query(
          "INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ($1, $2, 'achievement') ON CONFLICT DO NOTHING", [userId, a.item]);
      }
      if (a.coins > 0) {
        await coins.grant(userId, { type: 'ACHIEVEMENT', key: `ach:${a.id}`, amount: a.coins, sourceId: a.id, description: `Achievement: ${a.name}` }, { db: client });
      }
      await client.query('COMMIT');
      unlocked.push(a.id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  }
  return unlocked;
}

async function list(userId) {
  const m = await metrics(userId);
  const rows = (await pool.query('SELECT achievement_id, unlocked_at, seen FROM user_achievements WHERE user_id = $1', [userId])).rows;
  const got = Object.fromEntries(rows.map((r) => [r.achievement_id, r]));
  return ACH.map((a) => ({
    id: a.id, name: a.name, nameTh: a.nameTh, desc: a.desc, icon: a.icon, target: a.target,
    progress: Math.min(a.target, m[a.metric] || 0), unlocked: Boolean(got[a.id]), unlockedAt: got[a.id] ? got[a.id].unlocked_at : null,
    seen: got[a.id] ? got[a.id].seen : false, reward: { coins: a.coins, item: a.item || null },
  }));
}

async function markSeen(userId) {
  await pool.query('UPDATE user_achievements SET seen = TRUE WHERE user_id = $1 AND NOT seen', [userId]);
}

module.exports = { evaluate, list, markSeen, metrics, BY_ID };
