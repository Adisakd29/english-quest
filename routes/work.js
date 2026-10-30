/*
  ภาษาอังกฤษเพื่อการทำงาน (เฉพาะสมาชิก Premium) — /api/work
  สิทธิ์ตรวจที่ services/work ทุกคำขอ (userId/role จาก token เท่านั้น)
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const W = require('../services/work');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`work:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof W.WorkError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[work/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const topicId = (req) => String(req.params.id || '').slice(0, 20);
router.get('/', wrap('hub', (req) => W.hub(req.userId, req.userRole)));
router.get('/topics/:id', wrap('topic', (req) => W.topic(req.userId, req.userRole, topicId(req))));
router.post('/topics/:id/quiz', limited, wrap('quiz', (req) => W.startQuiz(req.userId, req.userRole, topicId(req))));
router.get('/quiz/:sid', wrap('quiz-get', (req) => W.getQuiz(req.userId, req.userRole, req.params.sid)));
router.post('/quiz/:sid/answer', limited, wrap('answer', (req) => W.answer(req.userId, req.userRole, req.params.sid, req.body || {})));
router.post('/quiz/:sid/finish', limited, wrap('finish', (req) => W.finish(req.userId, req.userRole, req.params.sid)));

module.exports = router;
