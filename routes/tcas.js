/*
  v1.19.0 ติวสอบ TCAS API — /api/tcas  (TGAT1 การสื่อสารภาษาอังกฤษ / A-Level ภาษาอังกฤษ)
  ตรวจคำตอบ/คะแนน/EXP ฝั่งเซิร์ฟเวอร์ทั้งหมด · ไม่ส่งเฉลยก่อนตอบ (ฝึก) หรือก่อนส่ง (สอบจำลอง)
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const T = require('../services/tcas');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: Number(process.env.TCAS_RATE_PER_MIN) || 150, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`tcas:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof T.TcasError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[tcas/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const sid = (req) => String(req.params.id || '').slice(0, 16);
const b = (req) => req.body || {};

router.get('/', wrap('hub', (req) => T.hub(req.userId)));
router.get('/history', wrap('history', (req) => T.history(req.userId)));
router.post('/sessions', limited, wrap('start', (req) => T.start(req.userId, {
  setId: String(b(req).setId || '').slice(0, 16), mode: String(b(req).mode || ''), section: b(req).section ? String(b(req).section).slice(0, 24) : null,
  instant: b(req).instant !== false })));
router.get('/sessions/:id', wrap('session', (req) => T.getSession(req.userId, sid(req))));
router.post('/sessions/:id/answer', limited, wrap('answer', (req) => T.answer(req.userId, sid(req), {
  itemId: String(b(req).itemId || '').slice(0, 20), choice: b(req).choice === null ? null : b(req).choice })));
router.post('/sessions/:id/finish', limited, wrap('finish', (req) => T.finish(req.userId, sid(req))));
router.post('/report', limited, wrap('report', (req) => T.report(req.userId, {
  itemId: String(b(req).itemId || '').slice(0, 20), reason: String(b(req).reason || '').slice(0, 24), note: b(req).note })));

// ผู้ดูแล: รายการที่ถูกแจ้ง / ซ่อน–เปิดข้อ
router.get('/admin/reports', requireAdmin, wrap('admin-reports', () => T.adminReports()));
router.post('/admin/items/hide', requireAdmin, wrap('admin-hide', (req) => T.adminSetHidden(req.userId, {
  itemId: String(b(req).itemId || '').slice(0, 20), hidden: Boolean(b(req).hidden), note: b(req).note })));

module.exports = router;
