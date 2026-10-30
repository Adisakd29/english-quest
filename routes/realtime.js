/*
  v1.10.0 Phase 5 — ตั๋วเชื่อมต่อ WebSocket
    POST /api/realtime/ticket → { ticket, expiresIn }
  เบราว์เซอร์ขอตั๋วด้วย Authorization header แล้วต่อ /ws?ticket=… — JWT ไม่ปรากฏใน URL อีก
  ตั๋วสุ่ม ใช้ได้ครั้งเดียว อายุ 30 วินาที · userId มาจาก token เท่านั้น
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const realtime = require('../realtime');

const router = express.Router();
router.use(authRequired);
const lim = createLimiter({ limit: 60, windowMs: 60 * 1000 });

router.post('/ticket', async (req, res) => {
  if (lim.check(`u:${req.userId}`)) return res.status(429).json({ error: 'ขอเชื่อมต่อถี่เกินไป รอสักครู่', code: 'RATE_LIMIT' });
  try {
    const { rows } = await pool.query('SELECT username, token_version FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    res.set('Cache-Control', 'no-store');
    return res.json(realtime.issueTicket(req.userId, rows[0].username, rows[0].token_version || 0));
  } catch (err) {
    console.error('[realtime/ticket]', err);
    return res.status(500).json({ error: 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
