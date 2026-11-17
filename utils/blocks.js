/*
  ตรวจการบล็อก (ใช้ร่วมกัน: เพื่อน / ค้นหา / ห้องแข่ง / สถานะออนไลน์)
  isBlockedEither(a, b): ฝ่ายใดฝ่ายหนึ่งบล็อกอีกฝ่าย
*/
const pool = require('../config/db');

async function isBlockedEither(a, b) {
  if (!a || !b || a === b) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b]
  );
  return rows.length > 0;
}

// ผู้ใช้ที่มีความสัมพันธ์บล็อกกับ userId (ทั้งสองทิศทาง) — Set ของ id
async function blockedSet(userId) {
  const { rows } = await pool.query(
    `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
     UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = $1`, [userId]
  );
  return new Set(rows.map((r) => r.id));
}

module.exports = { isBlockedEither, blockedSet };
