/*
  Word Atlas — /api/word-atlas (v1.14.0) · userId จาก token เท่านั้น · รายการคำทุกจุดแบ่งหน้าฝั่งเซิร์ฟเวอร์ (ไม่ส่งคลังทั้งหมดให้ browser)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const A = require('../services/wordAtlas');
const { auditDb } = require('../services/wordAtlas/validator');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 180, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`wa:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof A.AtlasError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[word-atlas/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

router.get('/', wrap('hub', (req) => A.hub(req.userId)));
router.get('/stats', wrap('stats', () => A.stats()));
router.get('/topics', wrap('topics', () => A.topics()));
router.get('/words', limited, require('../middleware/rankedLock').blockDuringRanked, wrap('browse', (req) => A.browse(req.userId, req.query || {})));
router.get('/words/:id', require('../middleware/rankedLock').blockDuringRanked, wrap('detail', (req) => A.detail(req.userId, req.params.id)));
router.get('/letters/:letter/units', wrap('units', (req) => A.letterUnits(req.userId, String(req.params.letter).toLowerCase())));
router.get('/units/:id', wrap('unit', (req) => A.unit(req.userId, req.params.id)));
router.put('/units/:id/step', limited, wrap('step', (req) => A.saveStep(req.userId, req.params.id, (req.body || {}).step)));
router.post('/units/:id/complete', limited, wrap('complete', (req) => A.completeUnit(req.userId, req.params.id)));
router.post('/sessions', limited, wrap('session', (req) => A.startSession(req.userId, req.body || {})));
router.post('/sessions/:id/answer', limited, wrap('answer', (req) => A.answer(req.userId, req.params.id, req.body || {})));
router.get('/review', wrap('review', async (req) => ({ count: await A.reviewCount(req.userId), items: await A.reviewList(req.userId) })));
router.post('/review/:senseId', limited, wrap('review-add', (req) => A.addToReview(req.userId, req.params.senseId)));
router.get('/collection', wrap('collection', (req) => A.collection(req.userId)));
router.put('/collection/:lemmaId', limited, wrap('save', (req) => A.setCollection(req.userId, req.params.lemmaId, true)));
router.delete('/collection/:lemmaId', limited, wrap('unsave', (req) => A.setCollection(req.userId, req.params.lemmaId, false)));
router.get('/recommended', wrap('recommended', async (req) => ({ words: await A.recommended(req.userId, await A.userLevel(req.userId), 20) })));
// ผู้ดูแล: ผลตรวจคุณภาพทั้งคลัง (Validator)
router.get('/admin/quality', requireAdmin, wrap('quality', () => auditDb(pool)));

module.exports = router;
