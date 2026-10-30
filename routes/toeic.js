/*
  TOEIC-style Practice API — /api/toeic  (Listening Part 1–4 · Reading Part 5–7 · โครงสร้าง /p1, /p2 ... รองรับ Part อื่นภายหลัง)
  ตรวจคำตอบ/คะแนน/EXP ฝั่งเซิร์ฟเวอร์ทั้งหมด · ข้อความ statement/เฉลยไม่ถูกส่งก่อนตอบ
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const P1 = require('../services/toeic/part1');
const P2 = require('../services/toeic/part2');
const P34 = require('../services/toeic/part34');
const P5 = require('../services/toeic/part5');
const WEAK = require('../services/toeic/weakness');
const DAILY = require('../services/toeic/daily');
const FULL = require('../services/toeic/full');
const P6 = require('../services/toeic/part6');
const P7 = require('../services/toeic/part7');

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
/** เริ่ม Mock ของ Part ใดก็ตาม — ถ้ามี fullTestId ให้ผูกเข้ากับ Full Mock Test (ตรวจเจ้าของ/สถานะก่อนเริ่ม) */
const startWith = (part, fn) => async (req) => {
  const body = req.body || {};
  const full = body.fullTestId != null && String(body.mode) === 'mock' ? String(body.fullTestId).slice(0, 16) : null;
  if (full) await FULL.precheck(req.userId, full, part);
  // งานในแผนฝึกรายวัน: ใช้ body ของงานที่เก็บไว้ที่เซิร์ฟเวอร์ (ไม่เชื่อขนาด/กลุ่มจากหน้าเว็บ)
  const daily = !full && body.dailyTask != null && String(body.mode) === 'practice' ? await DAILY.precheck(req.userId, part, body.dailyTask) : null;
  if (daily) req.body = { ...daily.task.body, mode: 'practice' };
  const s = await fn(req);
  if (full) { s.config = { ...s.config, fullTestId: await FULL.attach(req.userId, full, part, s.id) }; }
  if (daily) { s.config = { ...s.config, dailyTask: await DAILY.attach(req.userId, s.id, daily.day, daily.task.k) }; }
  return s;
};

router.get('/meta', wrap('meta', () => P1.meta()));
router.get('/p1/summary', wrap('summary', (req) => P1.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p1/sessions', limited, wrap('start', startWith(1, (req) => P1.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {}))));
router.get('/p1/sessions/:id', wrap('session', (req) => P1.getSession(req.userId, sid(req))));
router.post('/p1/sessions/:id/answer', limited, wrap('answer', (req) => P1.answer(req.userId, sid(req), req.body || {})));
router.post('/p1/sessions/:id/finish', limited, wrap('finish', (req) => P1.finish(req.userId, sid(req))));
router.post('/p1/sessions/:id/asset-error', limited, wrap('asset', (req) => P1.assetError(req.userId, sid(req))));
router.get('/p1/mistakes', wrap('mistakes', (req) => P1.mistakes(req.userId)));
router.get('/p1/vocab', wrap('vocab', (req) => P1.essentialVocab(req.userId)));
router.post('/p1/vocab/review', limited, wrap('vocab-review', (req) => P1.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));

// Listening Part 2 — Question–Response
router.get('/p2/meta', wrap('p2-meta', () => P2.meta()));
router.get('/p2/summary', wrap('p2-summary', (req) => P2.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p2/sessions', limited, wrap('p2-start', startWith(2, (req) => P2.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {}))));
router.get('/p2/sessions/:id', wrap('p2-session', (req) => P2.getSession(req.userId, sid(req))));
router.post('/p2/sessions/:id/answer', limited, wrap('p2-answer', (req) => P2.answer(req.userId, sid(req), req.body || {})));
router.post('/p2/sessions/:id/advance', limited, wrap('p2-advance', (req) => P2.advance(req.userId, sid(req), req.body || {})));
router.post('/p2/sessions/:id/finish', limited, wrap('p2-finish', (req) => P2.finish(req.userId, sid(req))));
router.get('/p2/mistakes', wrap('p2-mistakes', (req) => P2.mistakes(req.userId)));
router.post('/p2/vocab/review', limited, wrap('p2-vocab-review', (req) => P2.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));

// Listening Part 3 (Conversations) / Part 4 (Talks) — โค้ดชุดเดียว
for (const part of [3, 4]) {
  const b = `/p${part}`;
  router.get(`${b}/meta`, wrap(`p${part}-meta`, () => P34.meta(part)));
  router.get(`${b}/summary`, wrap(`p${part}-summary`, (req) => P34.summary(part, req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
  router.post(`${b}/sessions`, limited, wrap(`p${part}-start`, startWith(part, (req) => P34.startSession(part, req.userId, String((req.body || {}).mode || ''), req.body || {}))));
  router.get(`${b}/sessions/:id`, wrap(`p${part}-session`, (req) => P34.getSession(part, req.userId, sid(req))));
  router.post(`${b}/sessions/:id/answer`, limited, wrap(`p${part}-answer`, (req) => P34.answer(part, req.userId, sid(req), req.body || {})));
  router.post(`${b}/sessions/:id/advance`, limited, wrap(`p${part}-advance`, (req) => P34.advance(part, req.userId, sid(req), req.body || {})));
  router.post(`${b}/sessions/:id/finish`, limited, wrap(`p${part}-finish`, (req) => P34.finish(part, req.userId, sid(req))));
  router.get(`${b}/mistakes`, wrap(`p${part}-mistakes`, (req) => P34.mistakes(part, req.userId)));
  router.post(`${b}/vocab/review`, limited, wrap(`p${part}-vocab-review`, (req) => P34.addToReview(part, req.userId, String((req.body || {}).wordId || '').slice(0, 16))));
}

// Reading Part 5 — Incomplete Sentences
router.get('/p5/meta', wrap('p5-meta', () => P5.meta()));
router.get('/p5/summary', wrap('p5-summary', (req) => P5.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p5/sessions', limited, wrap('p5-start', startWith(5, (req) => P5.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {}))));
router.get('/p5/sessions/:id', wrap('p5-session', (req) => P5.getSession(req.userId, sid(req))));
router.post('/p5/sessions/:id/answer', limited, wrap('p5-answer', (req) => P5.answer(req.userId, sid(req), req.body || {})));
router.post('/p5/sessions/:id/finish', limited, wrap('p5-finish', (req) => P5.finish(req.userId, sid(req))));
router.get('/p5/mistakes', wrap('p5-mistakes', (req) => P5.mistakes(req.userId)));
router.post('/p5/vocab/review', limited, wrap('p5-vocab-review', (req) => P5.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));
// Reading Part 6 — Text Completion
router.get('/p6/meta', wrap('p6-meta', () => P6.meta()));
router.get('/p6/summary', wrap('p6-summary', (req) => P6.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p6/sessions', limited, wrap('p6-start', startWith(6, (req) => P6.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {}))));
router.get('/p6/sessions/:id', wrap('p6-session', (req) => P6.getSession(req.userId, sid(req))));
router.post('/p6/sessions/:id/answer', limited, wrap('p6-answer', (req) => P6.answer(req.userId, sid(req), req.body || {})));
router.post('/p6/sessions/:id/finish', limited, wrap('p6-finish', (req) => P6.finish(req.userId, sid(req))));
router.get('/p6/mistakes', wrap('p6-mistakes', (req) => P6.mistakes(req.userId)));
router.post('/p6/vocab/review', limited, wrap('p6-vocab-review', (req) => P6.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));
// Reading Part 7 — Reading Comprehension
router.get('/p7/meta', wrap('p7-meta', () => P7.meta()));
router.get('/p7/summary', wrap('p7-summary', (req) => P7.summary(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : 'all')));
router.post('/p7/sessions', limited, wrap('p7-start', startWith(7, (req) => P7.startSession(req.userId, String((req.body || {}).mode || ''), req.body || {}))));
router.get('/p7/sessions/:id', wrap('p7-session', (req) => P7.getSession(req.userId, sid(req))));
router.post('/p7/sessions/:id/answer', limited, wrap('p7-answer', (req) => P7.answer(req.userId, sid(req), req.body || {})));
router.post('/p7/sessions/:id/finish', limited, wrap('p7-finish', (req) => P7.finish(req.userId, sid(req))));
router.get('/p7/mistakes', wrap('p7-mistakes', (req) => P7.mistakes(req.userId)));
router.post('/p7/vocab/review', limited, wrap('p7-vocab-review', (req) => P7.addToReview(req.userId, String((req.body || {}).wordId || '').slice(0, 16))));
// Full Mock Test (Part 1–7)
router.get('/daily', wrap('daily', (req) => DAILY.get(req.userId)));
// v1.10.0 Phase 4: TOEIC Academy (บทเรียนกลยุทธ์ 7 Part)
router.get('/academy', wrap('academy', (req) => require('../services/toeic/academy').list(req.userId)));
router.get('/academy/:part', wrap('academy-lesson', (req) => require('../services/toeic/academy').get(req.userId, req.params.part)));
router.post('/academy/:part/check', limited, wrap('academy-check', (req) => require('../services/toeic/academy').check(req.userId, req.params.part, req.body || {})));
router.get('/predict', wrap('predict', (req) => require('../services/toeic/predict').predict(req.userId)));   // v1.10.0 Phase 4: คะแนนคาดการณ์จากการฝึก
router.get('/weakness', wrap('weakness', (req) => WEAK.analyze(req.userId, req.query.range === '30' ? '30' : 'all')));

router.get('/full', wrap('full', (req) => FULL.current(req.userId)));
router.post('/full', limited, wrap('full-start', (req) => FULL.start(req.userId)));
router.get('/full/:id', wrap('full-get', (req) => FULL.get(req.userId, sid(req))));
router.post('/full/:id/finish', limited, wrap('full-finish', (req) => FULL.finish(req.userId, sid(req))));
router.post('/full/:id/abandon', limited, wrap('full-abandon', (req) => FULL.abandon(req.userId, sid(req))));

module.exports = router;
