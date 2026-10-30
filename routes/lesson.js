/*
  บทเรียนคำศัพท์ v2 — /api/lesson (ต้องเข้าสู่ระบบ · userId มาจาก token เท่านั้น)
    POST /start                 { level, unitId?, explore?, mode? learn|review|due|listen }
    POST /:sessionId/answer     { i, key } | { i, text }
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const L = require('../services/vocab/lesson');

const router = express.Router();
router.use(authRequired);
const startLimit = createLimiter({ limit: 30, windowMs: 60 * 1000 });
const answerLimit = createLimiter({ limit: 120, windowMs: 60 * 1000 });

const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof L.LessonError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[lesson/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const limited = (lim) => (req, res, next) => (lim.check(`u:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่แล้วลองใหม่', code: 'RATE_LIMIT' }) : next());

router.post('/start', limited(startLimit), wrap('start', (req) => {
  const b = req.body || {};
  return L.start(req.userId, { level: b.level, unitId: b.unitId || null, explore: b.explore === true, mode: b.mode });
}));
router.post('/:sid/answer', limited(answerLimit), wrap('answer', (req) => {
  const b = req.body || {};
  return L.answer(req.userId, String(req.params.sid), { i: b.i, key: b.key, text: b.text });
}));

module.exports = router;
