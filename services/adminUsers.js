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
    `SELECT id, username, is_test, created_at, role, suspended_until, suspended_reason FROM users
      ${q ? "WHERE username ILIKE $1 ESCAPE '\\'" : ''}
      ORDER BY ${q ? 'id DESC' : 'is_test DESC, id DESC'} LIMIT 50`, q ? [`%${escapeLike(q)}%`] : []);
  return { users: rows.map((r) => ({ userId: r.id, username: r.username, isTest: Boolean(r.is_test), createdAt: r.created_at, isAdmin: r.role === 'admin',
    suspendedUntil: r.suspended_until && new Date(r.suspended_until) > new Date() ? r.suspended_until : null, suspendedReason: r.suspended_reason || null })) };
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

/**
 * v1.18.4 ระงับบัญชีชั่วคราว (hours > 0) / ยกเลิก (hours = 0) — ไม่ลบบัญชีหรือข้อมูลใด ๆ
 * ระงับแล้ว: เข้าสู่ระบบ/เรียก API/เชื่อมต่อสดไม่ได้จนหมดเวลา · ตัดการเชื่อมต่อที่เปิดอยู่ทันที · บันทึก audit
 */
const SUSPEND_HOURS = [24, 72, 168, 720];
async function suspend(adminId, userIdIn, hoursIn, reasonIn) {
  const userId = Number(userIdIn);
  const hours = Number(hoursIn);
  if (!Number.isInteger(userId) || userId <= 0) throw new AdminUserError('BAD_USER', 'รหัสผู้ใช้ไม่ถูกต้อง');
  if (userId === Number(adminId)) throw new AdminUserError('SELF', 'ระงับบัญชีตัวเองไม่ได้');
  if (hours !== 0 && !SUSPEND_HOURS.includes(hours)) throw new AdminUserError('BAD_HOURS', 'ระยะเวลาไม่ถูกต้อง');
  const reason = String(reasonIn || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 200) || null;
  const t = (await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0];
  if (!t) throw new AdminUserError('NOT_FOUND', 'ไม่พบผู้ใช้นี้', 404);
  if (t.role === 'admin' && hours > 0) throw new AdminUserError('ADMIN', 'ระงับบัญชีผู้ดูแลไม่ได้ (เอาออกจาก ADMIN_EMAILS ก่อน)');
  const { rows } = await pool.query(
    `UPDATE users SET suspended_until = CASE WHEN $2::int > 0 THEN NOW() + make_interval(hours => $2::int) ELSE NULL END,
        suspended_reason = CASE WHEN $2::int > 0 THEN $3 ELSE NULL END WHERE id = $1 RETURNING suspended_until`, [userId, hours, reason]);
  await audit({ actorId: adminId, action: hours > 0 ? 'suspend' : 'unsuspend', targetUser: userId, details: hours > 0 ? { hours, note: reason } : {} });
  if (hours > 0) { try { require('../realtime').disconnectUser(userId, 'suspended'); } catch (_e) { /* ไม่มี realtime */ } }
  return { userId, suspendedUntil: rows[0].suspended_until };
}

module.exports = { AdminUserError, list, setTestFlag, auditList, suspend, SUSPEND_HOURS };
