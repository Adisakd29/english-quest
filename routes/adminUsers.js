/*
  v1.11.0 (ยกเลิกสมาชิก Premium):
  - ผู้ดูแล: /api/admin/users — รายชื่อผู้ใช้ · ธงบัญชีทดสอบ · ประวัติการกระทำ (ตรวจสิทธิ์ทั้ง router)
  - ผู้ใช้: /api/dashboard — แดชบอร์ดการเรียน (เดิมเฉพาะ Premium) เปิดให้ทุกคนเท่ากัน · userId จาก token เท่านั้น
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const U = require('../services/adminUsers');

const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof U.AdminUserError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

const admin = express.Router();
admin.use(authRequired, requireAdmin);
admin.get('/', wrap('admin-users', (req) => U.list(String(req.query.q || ''))));
admin.post('/:id/test-flag', wrap('admin-test-flag', (req) => U.setTestFlag(req.userId, req.params.id, (req.body || {}).isTest)));
admin.get('/audit', wrap('admin-audit', (req) => U.auditList(req.query.limit)));
admin.post('/:id/suspend', wrap('admin-suspend', (req) => U.suspend(req.userId, req.params.id, (req.body || {}).hours, (req.body || {}).reason)));   // v1.18.4

const dashboard = express.Router();
dashboard.use(authRequired);
dashboard.get('/', wrap('dashboard', (req) => require('../services/analytics').dashboard(req.userId, true)));

module.exports = { admin, dashboard };
