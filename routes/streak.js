/*
  Learning Streak API (v1.18.0) — userId จาก JWT เท่านั้น
  GET  /api/streak             สถานะเต็ม (sync จากคำตอบจริง + มอบรางวัล Milestone ที่ถึงแล้ว)
  POST /api/streak/freeze      ซื้อ Streak Freeze (ราคา/เพดานจากเซิร์ฟเวอร์)
  POST /api/streak/seen        ปิดการฉลอง Milestone ที่แสดงแล้ว
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const streak = require('../services/streak');
const { createLimiter } = require('../utils/rateLimit');

const router = express.Router();
router.use(authRequired);
const buyLimit = createLimiter({ limit: 6, windowMs: 60 * 1000 });

const fail = (res, err, where) => {
  if (err instanceof streak.StreakError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(`[streak/${where}]`, err);
  return res.status(500).json({ error: 'ระบบ Streak ขัดข้องชั่วคราว ลองใหม่อีกครั้ง' });
};

router.get('/', async (req, res) => {
  try { res.json(await streak.status(req.userId)); } catch (err) { fail(res, err, 'status'); }
});

router.post('/freeze', async (req, res) => {
  if (buyLimit.check(`frz:${req.userId}`)) return res.status(429).json({ error: 'ทำรายการถี่เกินไป รอสักครู่' });
  try { res.json(await streak.buyFreeze(req.userId)); } catch (err) { fail(res, err, 'freeze'); }
});

router.post('/seen', async (req, res) => {
  try { await streak.markSeen(req.userId); res.json({ ok: true }); } catch (err) { fail(res, err, 'seen'); }
});

module.exports = router;
