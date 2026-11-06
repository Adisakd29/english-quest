/*
  ผู้ดูแล: Event Carousel (v1.17.0) — /api/admin/event-carousel  (authRequired + requireAdmin ฝั่งเซิร์ฟเวอร์)
  GET  /            ทุกกิจกรรม (รวมที่ซ่อน/หมดเวลา) + ตัวเลือก
  POST /            สร้างกิจกรรมใหม่ (source = admin)
  PUT  /:id         แก้ไข — กิจกรรมระบบแก้ได้เฉพาะการแสดงผล · กิจกรรมแอดมินแก้ได้ทั้งหมด (รางวัล/เงื่อนไขล็อกเมื่อมีคนรับแล้ว)
  POST /upload      อัปโหลดแบนเนอร์ { dataUrl } PNG/WebP ≤ 700KB → { url }
  ไม่มีการลบ (ใช้ "ซ่อน" แทน — ประวัติการรับรางวัลยังอ้างถึงกิจกรรมได้)
*/
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const svc = require('../services/eventCarousel');
const C = require('../config/eventCarousel');

const router = express.Router();
router.use(authRequired, requireAdmin);
const fail = (res, err, where) => {
  if (err instanceof svc.CarouselError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(`[admin/event-carousel/${where}]`, err); return res.status(500).json({ error: 'ทำรายการไม่สำเร็จ' });
};

router.get('/', async (_req, res) => {
  try {
    res.json({ events: await svc.adminList(), options: { types: C.TYPES, arts: C.ARTS, routes: C.ROUTES, eligibility: C.ELIGIBILITY, limits: C.LIMITS, timezone: C.TIMEZONE } });
  } catch (err) { fail(res, err, 'list'); }
});
router.post('/', async (req, res) => { try { res.json({ event: await svc.adminCreate(req.body, req.userId) }); } catch (err) { fail(res, err, 'create'); } });
router.put('/:id', async (req, res) => { try { res.json({ event: await svc.adminUpdate(req.params.id, req.body) }); } catch (err) { fail(res, err, 'update'); } });

const MAX = 700 * 1024;
router.post('/upload', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const m = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).dataUrl || ''));
    if (!m) return res.status(400).json({ error: 'รองรับเฉพาะ PNG / WebP' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX) return res.status(400).json({ error: 'ไฟล์ใหญ่เกิน 700KB — ย่อภาพหรือบันทึกเป็น WebP' });
    const sig = m[1] === 'image/png' ? buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    if (!sig) return res.status(400).json({ error: 'ไฟล์ไม่ใช่ภาพที่ถูกต้อง' });
    const id = `u${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20)}`;
    await pool.query('INSERT INTO avatar_assets (id, mime, data, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [id, m[1], buf, req.userId]);
    res.json({ url: `/api/avatar/asset/${id}.${m[1] === 'image/png' ? 'png' : 'webp'}` });
  } catch (err) { fail(res, err, 'upload'); }
});

module.exports = router;
