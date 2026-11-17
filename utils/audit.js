/* บันทึกการกระทำสำคัญลง audit_logs — ห้ามทำให้งานหลักล้มเพราะบันทึกไม่สำเร็จ */
const pool = require('../config/db');
async function audit({ actorId = null, action, targetUser = null, targetRef = null, details = {} }, client = pool) {
  try {
    await client.query('INSERT INTO audit_logs (actor_id, action, target_user, target_ref, details) VALUES ($1, $2, $3, $4, $5)',
      [actorId, String(action).slice(0, 40), targetUser, targetRef == null ? null : String(targetRef).slice(0, 40), JSON.stringify(details || {})]);
  } catch (err) { console.error('[audit]', err.message); }
}
module.exports = { audit };
