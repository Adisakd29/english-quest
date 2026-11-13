/*
  การแจ้งเตือนบนโทรศัพท์ — /api/notifications
    GET  /config       ค่าที่หน้าเว็บต้องใช้ (public key + การตั้งค่าของผู้ใช้)
    POST /subscribe    บันทึกเครื่องที่อนุญาตแจ้งเตือน { subscription, timezone }
    POST /unsubscribe  ยกเลิกเครื่องนี้ { endpoint }
    PUT  /prefs        { reminderEnabled, reminderTime: 'HH:MM' (06:00–21:30) }
    POST /test         ส่งแจ้งเตือนทดสอบถึงตัวเอง
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const push = require('../services/push');

const router = express.Router();
router.use(authRequired);
const testLimiter = createLimiter({ limit: 3, windowMs: 10 * 60 * 1000 });
const subLimiter = createLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

const hhmm = (t) => String(t || '19:00').slice(0, 5);
function validTime(v) {
  if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(':').map(Number);
  const mins = h * 60 + m;
  return m < 60 && mins >= 6 * 60 && mins <= 21 * 60 + 30;
}
async function validTimezone(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  const { rows } = await pool.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [tz]);
  return Boolean(rows[0]);
}

router.get('/config', async (req, res) => {
  try {
    const { publicKey } = await push.getKeys();
    const u = (await pool.query('SELECT reminder_enabled, reminder_time, timezone FROM users WHERE id = $1', [req.userId])).rows[0];
    const n = (await pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.userId])).rows[0].n;
    res.json({ publicKey, devices: n, reminderEnabled: u.reminder_enabled, reminderTime: hhmm(u.reminder_time), timezone: u.timezone });
  } catch (err) {
    console.error('[notifications/config]', err);
    res.status(500).json({ error: 'โหลดการตั้งค่าแจ้งเตือนไม่สำเร็จ' });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    if (subLimiter.check(`u:${req.userId}`)) return res.status(429).json({ error: 'ลองใหม่ภายหลัง' });
    const sub = (req.body || {}).subscription || {};
    const endpoint = String(sub.endpoint || '');
    const p256dh = String((sub.keys || {}).p256dh || '');
    const auth = String((sub.keys || {}).auth || '');
    const b64 = /^[A-Za-z0-9_\-=]+$/;
    if (endpoint.length > 1000 || !push.allowedEndpoint(endpoint) || !b64.test(p256dh) || p256dh.length > 200 || !b64.test(auth) || auth.length > 100) {
      return res.status(400).json({ error: 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง', code: 'BAD_SUBSCRIPTION' });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent, fail_count = 0`,
      [req.userId, endpoint, p256dh, auth, String(req.get('user-agent') || '').slice(0, 200)]);
    const tz = (req.body || {}).timezone;
    if (await validTimezone(tz)) await pool.query('UPDATE users SET timezone = $1, reminder_enabled = TRUE WHERE id = $2', [tz, req.userId]);
    else await pool.query('UPDATE users SET reminder_enabled = TRUE WHERE id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/subscribe]', err);
    res.status(500).json({ error: 'เปิดการแจ้งเตือนไม่สำเร็จ' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint = String((req.body || {}).endpoint || '');
    const { rowCount } = await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.userId, endpoint]);
    res.json({ ok: true, removed: rowCount });
  } catch (err) {
    console.error('[notifications/unsubscribe]', err);
    res.status(500).json({ error: 'ยกเลิกไม่สำเร็จ' });
  }
});

router.put('/prefs', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = []; const vals = [];
    if (b.reminderEnabled !== undefined) { vals.push(Boolean(b.reminderEnabled)); sets.push(`reminder_enabled = $${vals.length}`); }
    if (b.reminderTime !== undefined) {
      if (!validTime(b.reminderTime)) return res.status(400).json({ error: 'เลือกเวลาได้ระหว่าง 06:00–21:30', code: 'BAD_TIME' });
      vals.push(b.reminderTime); sets.push(`reminder_time = $${vals.length}`);
    }
    if (b.timezone !== undefined && await validTimezone(b.timezone)) { vals.push(b.timezone); sets.push(`timezone = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'ไม่มีค่าที่จะบันทึก' });
    vals.push(req.userId);
    const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING reminder_enabled, reminder_time, timezone`, vals);
    res.json({ reminderEnabled: rows[0].reminder_enabled, reminderTime: hhmm(rows[0].reminder_time), timezone: rows[0].timezone });
  } catch (err) {
    console.error('[notifications/prefs]', err);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

router.post('/test', async (req, res) => {
  try {
    if (testLimiter.check(`u:${req.userId}`)) return res.status(429).json({ error: 'ทดสอบบ่อยเกินไป รอสักครู่', code: 'RATE_LIMITED' });
    const n = await push.sendToUser(req.userId, { title: 'EnglishQuest', body: 'แจ้งเตือนใช้งานได้แล้ว — เจอกันทุกวันนะ', url: '/#/home', tag: 'eq-test' }, { ttl: 600 });
    if (!n) return res.status(404).json({ error: 'ยังไม่มีเครื่องที่เปิดแจ้งเตือน', code: 'NO_DEVICE' });
    res.json({ ok: true, sent: n });
  } catch (err) {
    console.error('[notifications/test]', err);
    res.status(500).json({ error: 'ส่งแจ้งเตือนทดสอบไม่สำเร็จ' });
  }
});

module.exports = router;
module.exports.validTime = validTime;
