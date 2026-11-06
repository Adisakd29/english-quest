/*
  ผู้ดูแล: รายชื่อผู้ใช้ · ธง "บัญชีทดสอบ" (ไม่แสดงในกระดานอันดับ) · ประวัติการกระทำของผู้ดูแล (audit_logs)
  v1.11.0: แยกออกจากระบบสมาชิก Premium เดิม (ยกเลิกแล้ว) — ตาราง memberships/membership_* ยังอยู่ในฐานข้อมูล ไม่ถูกลบ
*/
const pool = require('../config/db');
const { audit } = require('../utils/audit');
const { escapeLike } = require('../utils/security');

class AdminUserError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

/** ค้นหาผู้ใช้ตามชื่อ (ไม่ระบุ = บัญชีทดสอบ + ผู้ใช้ล่าสุด) — ไม่ส่งอีเมล/ข้อมูลส่วนตัวอื่น */
async function list(qIn = '') {
  const q = String(qIn || '').trim().slice(0, 40);
  const { rows } = await pool.query(
    `SELECT id, username, is_test, created_at FROM users
      ${q ? "WHERE username ILIKE $1 ESCAPE '\\'" : ''}
      ORDER BY ${q ? 'id DESC' : 'is_test DESC, id DESC'} LIMIT 50`, q ? [`%${escapeLike(q)}%`] : []);
  return { users: rows.map((r) => ({ userId: r.id, username: r.username, isTest: Boolean(r.is_test), createdAt: r.created_at })) };
}

/** ทำเครื่องหมาย/ยกเลิก "บัญชีทดสอบ" — ไม่แสดงในกระดานอันดับ (ข้อมูลอื่นไม่เปลี่ยน) · บันทึก audit */
async function setTestFlag(adminId, userIdIn, isTestIn) {
  const userId = Number(userIdIn);
  if (!Number.isInteger(userId) || userId <= 0) throw new AdminUserError('BAD_USER', 'รหัสผู้ใช้ไม่ถูกต้อง');
  if (typeof isTestIn !== 'boolean') throw new AdminUserError('BAD_FLAG', 'ต้องระบุ isTest เป็น true/false');
  const { rows } = await pool.query('UPDATE users SET is_test = $2 WHERE id = $1 RETURNING id, username, is_test', [userId, isTestIn]);
  if (!rows[0]) throw new AdminUserError('NOT_FOUND', 'ไม่พบผู้ใช้นี้', 404);
  await audit({ actorId: adminId, action: isTestIn ? 'test_flag_on' : 'test_flag_off', targetUser: userId, details: {} });
  return { userId, isTest: rows[0].is_test };
}

async function auditList(limitIn = 50) {
  const limit = Math.min(200, Math.max(1, Number(limitIn) || 50));
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.target_ref, a.details, a.created_at, au.username AS actor, tu.username AS target
       FROM audit_logs a LEFT JOIN users au ON au.id = a.actor_id LEFT JOIN users tu ON tu.id = a.target_user
      ORDER BY a.created_at DESC LIMIT $1`, [limit]);
  return { logs: rows.map((r) => ({ id: Number(r.id), action: r.action, ref: r.target_ref, details: r.details, at: r.created_at, actor: r.actor || 'ระบบอัตโนมัติ', target: r.target })) };
}

module.exports = { AdminUserError, list, setTestFlag, auditList };
