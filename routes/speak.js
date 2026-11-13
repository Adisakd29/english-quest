/*
  Speaking API — /api/speak (ฝึกพูด · ออกเสียง · ฟังแล้วพิมพ์)
  userId จาก token เท่านั้น · ไม่รับไฟล์เสียง · เก็บเฉพาะคะแนน
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const SP = require('../services/speak');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`speak:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof SP.SpeakError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[speak/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
router.get('/meta', wrap('meta', () => SP.meta()));
router.get('/summary', wrap('summary', (req) => SP.summary(req.userId)));
router.get('/sets', wrap('sets', (req) => SP.listSets(req.userId, String(req.query.level || 'A1').toUpperCase().slice(0, 2), String(req.query.kind || 'sentences').slice(0, 12))));
router.get('/sets/:id', wrap('set', (req) => SP.getSet(req.userId, String(req.params.id || '').slice(0, 64))));
router.post('/attempt', limited, wrap('attempt', (req) => SP.attempt(req.userId, req.body || {})));
router.post('/dictation', limited, wrap('dictation', (req) => SP.dictation(req.userId, req.body || {})));

module.exports = router;
