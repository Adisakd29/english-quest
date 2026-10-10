/*
  กิจกรรมพิเศษ — /api/events  ·  คลังธีม — /api/themes
  ทุกการตัดสินเกิดฝั่งเซิร์ฟเวอร์ (เวลา · ภารกิจ · สิทธิ์รับรางวัล · สิทธิ์ใช้ธีม)
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const ev = require('../services/events');

const events = express.Router();
const themes = express.Router();
events.use(authRequired);
themes.use(authRequired);
const limiter = createLimiter({ limit: 40, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`u:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());

function fail(res, err, where) {
  if (err instanceof ev.EventError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(`[events/${where}]`, err);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
}

events.get('/', (_req, res) => res.json({ events: ev.listEvents() }));
events.get('/:id', async (req, res) => { try { res.json(await ev.eventState(req.params.id, req.userId)); } catch (err) { fail(res, err, 'state'); } });
events.post('/:id/claim', limited, async (req, res) => {
  try {
    const r = await ev.claimReward(req.params.id, req.userId);
    res.json({ ...r, themes: await ev.themesOf(req.userId) });
  } catch (err) { fail(res, err, 'claim'); }
});
// ด่านของการผจญภัย (Stage): เริ่ม / เล่นต่อ / ส่งคำตอบ — โจทย์ เฉลย เวลา ตรวจที่เซิร์ฟเวอร์ทั้งหมด
events.post('/:id/stages/:stageId/start', limited, async (req, res) => {
  try { res.json(await ev.startStage(req.params.id, req.userId, String(req.params.stageId))); } catch (err) { fail(res, err, 'stage-start'); }
});
events.get('/:id/attempts/current', async (req, res) => { try { res.json(await ev.currentAttempt(req.params.id, req.userId)); } catch (err) { fail(res, err, 'attempt'); } });
events.post('/:id/attempts/:attemptId/submit', limited, async (req, res) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ error: 'รอบไม่ถูกต้อง' });
    res.json(await ev.submitStage(req.params.id, req.userId, attemptId, (req.body || {}).answers));
  } catch (err) { fail(res, err, 'stage-submit'); }
});
// ผู้ดูแลแจกรางวัลย้อนหลัง (กรณีพิเศษเท่านั้น)
events.post('/:id/admin-grant', requireAdmin, async (req, res) => {
  try { res.json(await ev.adminGrant(req.params.id, Number((req.body || {}).userId), req.userId)); } catch (err) { fail(res, err, 'admin-grant'); }
});

themes.get('/', async (req, res) => { try { res.json(await ev.themesOf(req.userId)); } catch (err) { fail(res, err, 'themes'); } });
themes.put('/current', limited, async (req, res) => { try { res.json(await ev.setTheme(req.userId, (req.body || {}).theme)); } catch (err) { fail(res, err, 'set-theme'); } });

module.exports = { events, themes };
