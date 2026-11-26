/*
  v1.28.0 บอร์ดผู้สนับสนุน
  GET  /api/supporters                    อันดับผู้สนับสนุน (ต้องเข้าสู่ระบบ)
  ผู้ดูแล (authRequired + requireAdmin ฝั่งเซิร์ฟเวอร์ · ทุกการแก้ไขต้องใส่เหตุผล · Audit Log):
  GET  /api/admin/supporters               รายการทั้งหมด + ค่าตั้ง + ประวัติผู้ดูแล
  POST /api/admin/supporters/import        { text, reason, dryRun } นำเข้า "ชื่อ | ยอด | วันเวลา | ช่องทาง"
  POST /api/admin/supporters/:id/hidden    { hidden, reason }
  POST /api/admin/supporters/settings      { showAmounts, reason }
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const svc = require('../services/supporters');

const fail = (res, err, where) => {
  if (err instanceof svc.SupporterError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(`[supporters/${where}]`, err); return res.status(500).json({ error: 'ทำรายการไม่สำเร็จ' });
};

const pub = express.Router();
pub.get('/', authRequired, async (req, res) => {
  try { res.set('Cache-Control', 'private, max-age=60'); res.json(await svc.board({ limit: req.query.limit })); } catch (err) { fail(res, err, 'board'); }
});

const admin = express.Router();
admin.use(authRequired, requireAdmin);
admin.get('/', async (_req, res) => { try { res.json(await svc.adminList()); } catch (err) { fail(res, err, 'list'); } });
admin.post('/import', async (req, res) => { try { res.json(await svc.adminImport(req.userId, req.body || {})); } catch (err) { fail(res, err, 'import'); } });
admin.post('/settings', async (req, res) => { try { res.json(await svc.adminSettings(req.userId, req.body || {})); } catch (err) { fail(res, err, 'settings'); } });
admin.post('/:id/hidden', async (req, res) => { try { res.json(await svc.adminSetHidden(req.userId, req.params.id, req.body || {})); } catch (err) { fail(res, err, 'hidden'); } });

module.exports = { pub, admin };
