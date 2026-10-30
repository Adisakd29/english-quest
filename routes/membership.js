/*
  สมาชิก Premium — ผู้ใช้: /api/membership · ผู้ดูแล: /api/admin/membership
  userId จาก token เท่านั้น · ผู้ดูแลตรวจสิทธิ์ทั้ง router (requireAdmin)
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const M = require('../services/membership');

const limiter = createLimiter({ limit: 30, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`member:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof M.MembershipError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[membership/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

const user = express.Router();
user.use(authRequired);
user.get('/', wrap('overview', (req) => M.overview(req.userId)));
// แดชบอร์ดการเรียน: สมาชิก (trial/active) ได้ครบ · ผู้ใช้ทั่วไปได้คะแนน 6 ทักษะ
user.get('/dashboard', wrap('dashboard', async (req) => require('../services/analytics').dashboard(req.userId, req.userRole === 'admin' || await M.isPremium(req.userId))));
user.post('/trial', limited, wrap('trial', (req) => M.startTrial(req.userId)));
user.post('/orders', limited, wrap('create', (req) => M.createOrder(req.userId, String((req.body || {}).plan || ''))));
user.get('/orders/:id', wrap('order', (req) => M.getOrder(req.userId, req.params.id)));
user.post('/orders/:id/slip', limited, wrap('slip', (req) => M.submitSlip(req.userId, req.params.id, req.body || {})));
user.post('/orders/:id/cancel', limited, wrap('cancel', (req) => M.cancel(req.userId, req.params.id)));

const admin = express.Router();
admin.use(authRequired, requireAdmin);
admin.get('/orders', wrap('admin-list', (req) => M.adminList(String(req.query.status || 'submitted'))));
admin.get('/orders/:id/slip', async (req, res) => {
  try {
    const s = await M.adminSlip(req.params.id);
    res.set({ 'Content-Type': s.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.send(s.buf);
  } catch (err) {
    if (err instanceof M.MembershipError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[membership/admin-slip]', err);
    return res.status(500).json({ error: 'โหลดสลิปไม่สำเร็จ' });
  }
});
admin.post('/orders/:id/approve', wrap('approve', (req) => M.approve(req.userId, req.params.id, (req.body || {}).note)));
admin.post('/orders/:id/reverify', wrap('reverify', (req) => M.reverify(req.params.id, req.userId)));
admin.get('/members', wrap('members', (req) => M.adminMembers(String(req.query.q || ''))));
admin.post('/members/:id/grant', wrap('grant', (req) => M.grant(req.userId, req.params.id, (req.body || {}).days, (req.body || {}).note)));
admin.post('/members/:id/test-flag', wrap('test-flag', (req) => M.setTestFlag(req.userId, req.params.id, (req.body || {}).isTest)));
admin.post('/members/:id/revoke', wrap('revoke', (req) => M.revoke(req.userId, req.params.id, (req.body || {}).note)));
admin.get('/audit', wrap('audit', (req) => M.auditList(req.query.limit)));
admin.post('/orders/:id/reject', wrap('reject', (req) => M.reject(req.userId, req.params.id, (req.body || {}).note)));

module.exports = { user, admin };
