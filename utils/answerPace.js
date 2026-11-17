/*
  v1.18.3 จังหวะการตอบของผู้ใช้ (กันบอท/สคริปต์เก็บ EXP ในหมวดเรียน)
  ทุกคำขอ "ตอบข้อ" ที่ให้ EXP ประทับเวลาไว้ที่ users.last_answer_at (ฐานข้อมูล — ใช้ได้แม้มีหลายเซิร์ฟเวอร์)
  ตอบห่างจากข้อก่อนหน้าน้อยกว่า INTEGRITY.minHumanMs (0.6 วิ) = เร็วเกินคนอ่านโจทย์ทัน -> ข้อนั้นไม่ได้ EXP
  (ความคืบหน้าการเรียนยังบันทึกตามปกติ · คำขอเดียวที่บันทึกหลายคำ เช่น จับคู่ ใช้ผลประทับเวลาเดียวกัน)
*/
const pool = require('../config/db');
const { INTEGRITY } = require('../config/leagues');

/** คีย์ EXP "รายข้อ" ของ grantOnce ที่ต้องผ่านการตรวจจังหวะ */
const PACED_KEY = /^(c2q|glq|c2x|glx|t[0-9]+q|spk|spkd|tcq):/;   // v1.18.4 + โหมดพูด/เขียนตามคำบอก

async function stamp(userId, db = pool) {
  const { rows } = await db.query(
    `WITH o AS (SELECT last_answer_at AS prev FROM users WHERE id = $1 FOR UPDATE)
     UPDATE users u SET last_answer_at = clock_timestamp() FROM o WHERE u.id = $1
     RETURNING (EXTRACT(EPOCH FROM (u.last_answer_at - o.prev)) * 1000)::float AS gap`, [userId]);
  const gap = rows[0] && rows[0].gap !== null ? Number(rows[0].gap) : null;
  return { gapMs: gap, tooFast: gap !== null && gap < INTEGRITY.learnMinHumanMs };
}

module.exports = { stamp, PACED_KEY };
