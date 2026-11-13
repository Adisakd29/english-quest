/*
  v1.21.0 ทายศัพท์ไม่รู้จบ — /api/endless · userId จาก token เท่านั้น
  คำตอบที่ถูกอยู่ฝั่งเซิร์ฟเวอร์ · ส่งกลับหลังตอบแล้วเท่านั้น
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const E = require('../services/endless');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: Number(process.env.ENDLESS_RATE_PER_MIN) || 90, windowMs: 60 * 1000 });
router.use((req, res, next) => (limiter.check(`endless:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next()));
const wrap = (tag, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof E.EndlessError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[endless/${tag}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const b = (req) => req.body || {};

router.get('/', wrap('stats', (req) => E.stats(req.userId)));
router.post('/start', wrap('start', (req) => E.start(req.userId, { resume: b(req).resume === true })));
router.post('/answer', wrap('answer', (req) => E.answer(req.userId, { key: b(req).key, choice: b(req).choice })));
router.post('/quit', wrap('quit', (req) => E.quit(req.userId)));
router.post('/runs/:id/save-missed', wrap('save', (req) => E.saveMissed(req.userId, req.params.id)));

module.exports = router;
