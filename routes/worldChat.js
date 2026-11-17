/*
  แชทโลก — /api/world-chat (v1.15.0) · userId จาก token เท่านั้น · ข้อความแบบเรียลไทม์ส่งทาง WebSocket (gchat:msg / gchat:remove)
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const C = require('../services/worldChat');
const { REPORT_REASONS } = require('./friends');

const router = express.Router();
router.use(authRequired);
const sendLimiter = createLimiter({ limit: 20, windowMs: 60 * 1000 });
const actLimiter = createLimiter({ limit: 60, windowMs: 60 * 1000 });
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof C.ChatError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    console.error(`[world-chat/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const limit = (lim, key) => (req, res, next) => (lim.check(`${key}:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE' }) : next());

router.get('/', wrap('history', (req) => C.history(req.userId, { before: req.query.before, after: req.query.after })));
router.post('/', limit(sendLimiter, 'gc'), wrap('post', (req) => C.post(req.userId, (req.body || {}).body, { cid: typeof (req.body || {}).cid === 'string' ? req.body.cid.slice(0, 40) : null, quick: (req.body || {}).quick ? String(req.body.quick).slice(0, 24) : null })));
router.delete('/:id', limit(actLimiter, 'gca'), wrap('remove', (req) => C.remove(req.userId, req.userRole, req.params.id)));
router.post('/:id/report', limit(actLimiter, 'gca'), wrap('report', (req) => {
  const { reason, details } = req.body || {};
  if (!REPORT_REASONS.has(reason)) throw new C.ChatError(400, 'กรุณาเลือกเหตุผล');
  return C.report(req.userId, req.params.id, reason, details ? String(details).slice(0, 300) : '');
}));
// v1.17.0: { enabled?, mini?, sound?, notify?, quickOnly? } — ส่งเฉพาะข้อที่เปลี่ยน (เดิมส่ง { enabled } อย่างเดียว ยังใช้ได้)
router.put('/settings', limit(actLimiter, 'gca'), wrap('settings', (req) => C.setSettings(req.userId, req.body || {})));
router.put('/mute/:userId', limit(actLimiter, 'gca'), wrap('mute', (req) => C.setMute(req.userId, req.params.userId, true)));
router.delete('/mute/:userId', limit(actLimiter, 'gca'), wrap('unmute', (req) => C.setMute(req.userId, req.params.userId, false)));

module.exports = router;
