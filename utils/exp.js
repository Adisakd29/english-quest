/*
  EXP กลางของบัญชี (ระบบเดียว) — ทุกกิจกรรม (คำศัพท์ · แกรมม่า · Ranked · กิจกรรม) เพิ่มเข้า users.exp + บันทึก exp_log
  Account Level คำนวณจาก users.exp ตัวเดียวกันเสมอ (utils/leveling.js)
  - grantExp    : เพิ่ม EXP ตามเหตุผล (reason) · มีเพดานต่อวันได้ (ตามเวลาไทย)
  - grantOnce   : เพิ่ม EXP "ครั้งเดียวต่อคีย์" (exp_awards) — กัน refresh / เปิดขั้นเดิมซ้ำ / ส่งซ้ำพร้อมกัน
  ทั้งสองคืน { gained, levelInfo, leveledUp } ให้หน้าเว็บอัปเดต HUD ทันที
*/
const pool = require('../config/db');
const { getLevelInfo } = require('./leveling');

/** EXP ที่ได้วันนี้ (เวลาไทย) ของเหตุผลที่กำหนด */
async function earnedToday(db, userId, reasons) {
  const list = [].concat(reasons);
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS n FROM exp_log
      WHERE user_id = $1 AND reason = ANY($2::text[])
        AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, list]);
  return rows[0].n;
}

async function apply(db, userId, amount, reason) {
  const before = (await db.query('SELECT exp FROM users WHERE id = $1', [userId])).rows[0];
  if (!before) return { gained: 0, levelInfo: null, leveledUp: false };
  if (amount <= 0) return { gained: 0, levelInfo: getLevelInfo(before.exp), leveledUp: false };
  const after = (await db.query('UPDATE users SET exp = exp + $1 WHERE id = $2 RETURNING exp', [amount, userId])).rows[0].exp;
  await db.query('INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)', [userId, amount, reason]);
  const b = getLevelInfo(after - amount); const a = getLevelInfo(after);
  return { gained: amount, levelInfo: a, leveledUp: a.level > b.level };
}

/**
 * @param {object} opts { reason, dailyCap?, capReasons? (เหตุผลที่นับรวมเพดานเดียวกัน), db? }
 */
async function grantExp(userId, amount, { reason, dailyCap = null, capReasons = null, db = pool } = {}) {
  let n = Math.max(0, Math.round(Number(amount) || 0));
  if (n > 0 && dailyCap !== null) n = Math.max(0, Math.min(n, dailyCap - await earnedToday(db, userId, capReasons || reason)));
  return apply(db, userId, n, reason);
}

/** ให้ EXP ครั้งเดียวต่อ key (เช่น "gls:a1-present-simple:3") · ได้ซ้ำไม่ได้แม้ส่งพร้อมกันหลายคำขอ */
async function grantOnce(userId, key, amount, { reason, dailyCap = null, capReasons = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO exp_awards (user_id, award_key, amount, reason) VALUES ($1, $2, 0, $3)
       ON CONFLICT (user_id, award_key) DO NOTHING RETURNING award_key`, [userId, String(key).slice(0, 96), reason]);
    if (!ins.rows[0]) { await client.query('ROLLBACK'); return { gained: 0, levelInfo: null, leveledUp: false, already: true }; }
    const r = await grantExp(userId, amount, { reason, dailyCap, capReasons, db: client });
    await client.query('UPDATE exp_awards SET amount = $3 WHERE user_id = $1 AND award_key = $2', [userId, String(key).slice(0, 96), r.gained]);
    await client.query('COMMIT');
    return { ...r, already: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/** รวมผลหลายรางวัล -> ผลเดียวสำหรับหน้าเว็บ */
function mergeGrants(list) {
  const valid = list.filter(Boolean);
  const gained = valid.reduce((a, r) => a + (r.gained || 0), 0);
  const last = [...valid].reverse().find((r) => r.levelInfo);
  return { gained, levelInfo: last ? last.levelInfo : null, leveledUp: valid.some((r) => r.leveledUp) };
}

module.exports = { grantExp, grantOnce, mergeGrants, earnedToday };
