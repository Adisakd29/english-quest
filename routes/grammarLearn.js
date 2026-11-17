/*
  Grammar Learning API — /api/gl  (หลักสูตร A1–C1 · แยกจากบทเรียนแกรมม่าเดิม /api/grammar ซึ่งยังใช้งานได้ตามเดิม)
  ทุกการตรวจคำตอบเกิดฝั่งเซิร์ฟเวอร์ · ข้อมูลที่ส่งให้หน้าเว็บไม่มีเฉลยจนกว่าจะตอบ
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const G = require('../services/grammar/engine');
const GC = require('../data/grammar-curriculum');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`gl:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof G.GrammarError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[gl/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const str = (v, max = 64) => String(v == null ? '' : v).slice(0, max);

router.get('/hub', wrap('hub', (req) => G.hub(req.userId)));
router.get('/topics/:id', wrap('topic', (req) => G.topicView(req.userId, str(req.params.id))));
router.post('/topics/:id/step', limited, wrap('step', (req) => G.markStep(req.userId, str(req.params.id), (req.body || {}).step)));
router.post('/topics/:id/practice', limited, wrap('practice', (req) => G.startPractice(req.userId, str(req.params.id), { all: Boolean((req.body || {}).all) })));
router.post('/sessions/:sid/answer', limited, wrap('answer', (req) => {
  const b = req.body || {};
  return G.answer(req.userId, str(req.params.sid), str(b.itemId), b.answer, b.ms);
}));
router.post('/sessions/:sid/finish', limited, wrap('finish', (req) => G.finishSession(req.userId, str(req.params.sid))));

router.get('/review', wrap('review', async (req) => {
  const due = await G.reviewDue(req.userId);
  return { due: due.length, topics: [...new Set(due.map((d) => d.topic_id))].map((id) => ({ id, title: GC.TOPIC_BY_ID[id].title, titleTh: GC.TOPIC_BY_ID[id].titleTh, count: due.filter((d) => d.topic_id === id).length })) };
}));
router.post('/review/start', limited, wrap('review-start', (req) => {
  const b = req.body || {};
  const itemIds = Array.isArray(b.itemIds) ? b.itemIds.slice(0, 15).map((x) => str(x)) : null;
  return G.startReview(req.userId, { itemIds, topicId: b.topicId ? str(b.topicId) : null });
}));

router.post('/placement/start', limited, wrap('placement-start', (req) => G.placementStart(req.userId)));
router.post('/placement/:id/answer', limited, wrap('placement-answer', (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new G.GrammarError('BAD_ID', 'รหัสแบบทดสอบไม่ถูกต้อง');
  return G.placementAnswer(req.userId, id, str((req.body || {}).itemId), (req.body || {}).answer);
}));
router.get('/placement/latest', wrap('placement-latest', async (req) => {
  const pool = require('../config/db');
  const r = (await pool.query("SELECT id, result, completed_at FROM grammar_placements WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1", [req.userId])).rows[0];
  return { placement: r ? { id: Number(r.id), result: r.result, completedAt: r.completed_at } : null };
}));

router.get('/daily', wrap('daily', (req) => G.dailyGet(req.userId)));
router.post('/daily/finish', limited, wrap('daily-finish', (req) => G.dailyFinish(req.userId, str((req.body || {}).sessionId))));

router.get('/mistakes', wrap('mistakes', (req) => {
  const q = req.query || {};
  return G.mistakes(req.userId, {
    cefr: GC.LEVEL_IDS.includes(q.cefr) ? q.cefr : null, topic: q.topic && GC.TOPIC_BY_ID[q.topic] ? q.topic : null,
    status: ['open', 'mastered'].includes(q.status) ? q.status : null,
    from: q.from && !Number.isNaN(Date.parse(q.from)) ? q.from : null, to: q.to && !Number.isNaN(Date.parse(q.to)) ? q.to : null,
    limit: Math.min(100, Math.max(1, Number(q.limit) || 40)), offset: Math.max(0, Number(q.offset) || 0),
  });
}));
router.get('/progress', wrap('progress', (req) => G.progress(req.userId, ['7', '30', 'all'].includes(req.query.range) ? req.query.range : '7')));
router.get('/badges', wrap('badges', async (req) => ({ badges: await G.badgesOf(req.userId) })));
/* บทเรียนทีละขั้น (Step-by-Step) — ความคืบหน้าเก็บที่เซิร์ฟเวอร์ เรียนต่อได้ทุกอุปกรณ์ */
const LS = require('../services/grammar/lesson');
const stepNo = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 40) throw new G.GrammarError('BAD_STEP', 'ไม่พบขั้นนี้', 404); return n; };
router.get('/lessons/:id', wrap('lesson', (req) => LS.overview(req.userId, str(req.params.id))));
router.get('/lessons/:id/steps/:k', wrap('lesson-step', (req) => LS.getStep(req.userId, str(req.params.id), stepNo(req.params.k))));
router.post('/lessons/:id/steps/:k/answer', limited, wrap('lesson-answer', (req) => {
  const b = req.body || {};
  return LS.answerStep(req.userId, str(req.params.id), stepNo(req.params.k), str(b.itemId), b.answer, b.ms);
}));
router.post('/lessons/:id/steps/:k/complete', limited, wrap('lesson-complete', (req) => LS.completeStep(req.userId, str(req.params.id), stepNo(req.params.k))));
router.post('/lessons/:id/restart', limited, wrap('lesson-restart', (req) => LS.restart(req.userId, str(req.params.id))));
router.get('/continue', wrap('continue', async (req) => ({ lesson: await LS.continueLesson(req.userId) })));
router.get('/summary', wrap('summary', (req) => LS.summary(req.userId)));

/* Writing Practice */
const W = require('../services/grammar/writingPractice');
router.get('/writing', wrap('writing', (req) => W.prompts(req.userId)));
router.get('/writing/history', wrap('writing-history', (req) => W.history(req.userId)));
router.post('/writing/check', limited, wrap('writing-check', (req) => {
  const b = req.body || {};
  return W.check(req.userId, str(b.promptId), String(b.text == null ? '' : b.text).slice(0, W.MAX_LEN + 1));
}));
/** ศัพท์แกรมม่า EN + TH รวมทุกหัวข้อ */
router.get('/terms', wrap('terms', () => {
  const seen = new Map();
  for (const t of GC.TOPICS) {
    const c = GC.getTopic(t.id);
    (c && c.terms ? c.terms : []).forEach((x) => { const k = x.en.toLowerCase(); if (!seen.has(k)) seen.set(k, { ...x, topicId: t.id, cefr: t.cefr }); });
  }
  return { terms: [...seen.values()].sort((a, b) => a.en.localeCompare(b.en)) };
}));

module.exports = router;
