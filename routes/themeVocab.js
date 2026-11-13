/*
  หมวดคำศัพท์ตามเทศกาล — /api/theme-vocab (v1.12.0) · userId จาก token เท่านั้น
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const T = require('../services/themeVocab');

const router = express.Router();
router.use(authRequired, require('../middleware/rankedLock').blockDuringRanked);   // v1.18.4 ปิดระหว่างแข่ง Ranked
const limiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`tv:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof T.ThemeVocabError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[theme-vocab/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
router.get('/', wrap('hub', (req) => T.hub(req.userId)));
router.get('/categories/:id', wrap('category', (req) => T.category(req.userId, req.params.id)));
router.post('/categories/:id/quiz', limited, wrap('quiz', (req) => T.startQuiz(req.userId, req.params.id)));
router.get('/quiz/:sid', wrap('quiz-get', (req) => T.getQuiz(req.userId, req.params.sid)));
router.post('/quiz/:sid/answer', limited, wrap('answer', (req) => T.answer(req.userId, req.params.sid, req.body || {})));
router.post('/quiz/:sid/finish', limited, wrap('finish', (req) => T.finish(req.userId, req.params.sid)));

module.exports = router;
