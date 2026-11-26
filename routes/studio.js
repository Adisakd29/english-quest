/*
  v1.10.0 Phase 3 — เครื่องมือเรียนแบบไม่ใช้ AI (ฟรีทุกคน · ไม่มีค่าโทเค็น)
    GET  /api/studio/writing            โจทย์ + สถิติของฉัน
    POST /api/studio/writing/check      { text, promptId?, targets? }  → ผลวิเคราะห์ (ไม่เก็บข้อความ)
    GET  /api/studio/help?q=...         ค้นคำตอบ: FAQ · หัวข้อไวยากรณ์ · คำศัพท์ (ไม่เก็บคำถาม)
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const WS = require('../services/writingStudio');
const H = require('../services/helper');

const router = express.Router();
router.use(authRequired);
const checkLimit = createLimiter({ limit: 20, windowMs: 60 * 1000 });
const helpLimit = createLimiter({ limit: 60, windowMs: 60 * 1000 });
const limited = (lim) => (req, res, next) => (lim.check(`u:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่แล้วลองใหม่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof WS.StudioError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[studio/${where}]`, err.message);   // ไม่ log ข้อความ/คำถามของผู้ใช้
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

router.get('/writing', wrap('writing', (req) => WS.home(req.userId)));
router.post('/writing/check', limited(checkLimit), wrap('check', (req) => WS.check(req.userId, req.body || {})));
router.get('/help', limited(helpLimit), wrap('help', (req) => H.search(req.query.q)));

module.exports = router;
