/*
  C2 Vocabulary API — /api/c2  (ต่อยอดระบบคำศัพท์เดิม: Unit จาก Learning Path, progress ใน word_progress)
  ตรวจคำตอบฝั่งเซิร์ฟเวอร์ทั้งหมด · ข้อมูลที่ส่งให้หน้าเว็บไม่มีเฉลยจนกว่าจะตอบ
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const L = require('../services/vocab/c2Lesson');
const P = require('../services/vocab/c2Practice');
const G = require('../services/vocab/c2Progress');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`c2:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof L.C2Error) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[c2/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const str = (v, max = 64) => String(v == null ? '' : v).slice(0, max);
const stepNo = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 40) throw new L.C2Error('BAD_STEP', 'ไม่พบขั้นนี้', 404); return n; };
const opts = (req) => ({ explore: req.query.explore === '1' || (req.body && req.body.explore === true) });

router.get('/summary', wrap('summary', (req) => G.summary(req.userId)));

router.get('/lessons/:unit', wrap('lesson', (req) => L.overview(req.userId, str(req.params.unit), opts(req))));
router.get('/lessons/:unit/steps/:k', wrap('lesson-step', (req) => L.getStep(req.userId, str(req.params.unit), stepNo(req.params.k), opts(req))));
router.post('/lessons/:unit/steps/:k/answer', limited, wrap('lesson-answer', (req) => {
  const b = req.body || {};
  return L.answerStep(req.userId, str(req.params.unit), stepNo(req.params.k), str(b.itemId), b.answer, opts(req));
}));
router.post('/lessons/:unit/steps/:k/complete', limited, wrap('lesson-complete', (req) => L.completeStep(req.userId, str(req.params.unit), stepNo(req.params.k), opts(req))));
router.post('/lessons/:unit/restart', limited, wrap('lesson-restart', (req) => L.restart(req.userId, str(req.params.unit), opts(req))));

router.post('/practice/start', limited, wrap('practice-start', (req) => P.start(req.userId, str((req.body || {}).mode || 'mixed', 16))));
router.post('/practice/:sid/answer', limited, wrap('practice-answer', (req) => {
  const b = req.body || {};
  return P.answer(req.userId, req.params.sid, str(b.itemId), b.answer);
}));
router.post('/practice/:sid/finish', limited, wrap('practice-finish', (req) => P.finish(req.userId, req.params.sid)));

module.exports = router;
