/*
  โควตาการใช้ AI ต่อวัน (เวลาไทย) ตามสิทธิ์ — คุมต้นทุน (Phase 3 จะเรียก consume() ก่อนเรียก AI ทุกครั้ง)
  ตรวจที่เซิร์ฟเวอร์ · นับแบบ atomic (ไม่เกินโควตาแม้ยิงคำขอพร้อมกัน)
*/
const pool = require('../config/db');
const AI = require('../config/ai');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
async function tierOf(userId) {
  const s = await require('./membership').status(userId);
  return s.state === 'trial' ? 'trial' : s.access ? 'premium' : 'free';
}
async function usage(userId) {
  const tier = await tierOf(userId);
  const { rows } = await pool.query('SELECT feature, used FROM ai_usage WHERE user_id = $1 AND day = $2', [userId, bkkDay()]);
  const used = Object.fromEntries(rows.map((r) => [r.feature, r.used]));
  return { tier, configured: AI.configured(), features: Object.fromEntries(AI.FEATURES.map((f) => {
    const limit = AI.DAILY_LIMITS[tier][f];
    return [f, { limit, used: used[f] || 0, remaining: Math.max(0, limit - (used[f] || 0)) }];
  })) };
}
/** ใช้โควตา 1 ครั้ง — คืน { ok, remaining } · เกิน/ไม่มีสิทธิ์ = ok:false */
async function consume(userId, feature) {
  if (!AI.FEATURES.includes(feature)) return { ok: false, reason: 'BAD_FEATURE', remaining: 0 };
  const tier = await tierOf(userId);
  const limit = AI.DAILY_LIMITS[tier][feature];
  if (!(limit > 0)) return { ok: false, reason: 'NOT_ALLOWED', remaining: 0 };
  const { rows } = await pool.query(
    `INSERT INTO ai_usage (user_id, day, feature, used) VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, day, feature) DO UPDATE SET used = ai_usage.used + 1 WHERE ai_usage.used < $4
     RETURNING used`, [userId, bkkDay(), feature, limit]);
  if (!rows[0]) return { ok: false, reason: 'QUOTA_EXCEEDED', remaining: 0 };
  return { ok: true, remaining: limit - rows[0].used };
}
module.exports = { usage, consume, tierOf };
