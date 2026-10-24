/*
  TOEIC-style Practice API — /api/toeic  (ตอนนี้ Listening Part 1 · โครงสร้าง /p1, /p2 ... รองรับ Part อื่นภายหลัง)
  ตรวจคำตอบ/คะแนน/EXP ฝั่งเซิร์ฟเวอร์ทั้งหมด · ข้อความ statement/เฉลยไม่ถูกส่งก่อนตอบ
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const P1 = require('../services/toeic/part1');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 150, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`toeic:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof P1.ToeicError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[toeic/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const sid = (req) => String(req.params.id || '').slice(0, 16);

router.get('/meta', wrap('meta', () => P1.meta()));
router.get('/p1/summary', wrap('summary', (req) => P1.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p1/sessions', limited, wrap('start', (req) => P1.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {})));
router.get('/p1/sessions/:id', wrap('session', (req) => P1.getSession(req.userId, sid(req))));
router.post('/p1/sessions/:id/answer', limited, wrap('answer', (req) => P1.answer(req.userId, sid(req), req.body || {})));
router.post('/p1/sessions/:id/finish', limited, wrap('finish', (req) => P1.finish(req.userId, sid(req))));
router.post('/p1/sessions/:id/asset-error', limited, wrap('asset', (req) => P1.assetError(req.userId, sid(req))));
router.get('/p1/mistakes', wrap('mistakes', (req) => P1.mistakes(req.userId)));
router.get('/p1/vocab', wrap('vocab', (req) => P1.essentialVocab(req.userId)));
router.post('/p1/vocab/review', limited, wrap('vocab-review', (req) => P1.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));

module.exports = router;
