/*
  Graded Reading & Listening — /api/graded (ต้องเข้าสู่ระบบ · userId จาก token เท่านั้น)
    GET  /                  รายการเรื่องตามระดับ + ความคืบหน้า
    GET  /:id?mode=reading|listening
    POST /:id/submit        { mode, answers: [0-3,...] }
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const G = require('../services/graded');

const router = express.Router();
router.use(authRequired);
const lim = createLimiter({ limit: 30, windowMs: 60 * 1000 });
const limited = (req, res, next) => (lim.check(`u:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่แล้วลองใหม่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof G.GradedError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[graded/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const idOf = (req) => String(req.params.id || '').slice(0, 8);

router.get('/', wrap('list', (req) => G.list(req.userId)));
router.get('/:id', wrap('get', (req) => G.get(req.userId, idOf(req), String(req.query.mode || 'reading'))));
router.post('/:id/submit', limited, wrap('submit', (req) => G.submit(req.userId, idOf(req), req.body || {})));

module.exports = router;
