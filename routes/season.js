/*
  ธีมตามฤดูกาล (v1.18.0) — ไม่ต้องล็อกอิน (โลโก้แสดงตั้งแต่หน้าเข้าสู่ระบบ)
  GET /api/season            { season: { id, key, nameTh, homeMusic, endsAt } | null }
  GET /brand/<ไฟล์>           ไอคอน/โลโก้ของฤดูกาลที่กำลังเป็นอยู่ (หมดช่วง → ไฟล์ปกติใน public/img/) · cache 30 นาที
  GET /manifest.webmanifest  ไอคอนแอป (ติดตั้งบนมือถือ) ตามฤดูกาล
*/
const express = require('express');
const fs = require('fs');
const path = require('path');
const SEASON = require('../config/season');

const IMG = path.join(__dirname, '..', 'public', 'img');
const MANIFEST = path.join(__dirname, '..', 'public', 'manifest.webmanifest');

function apiRouter() {
  const r = express.Router();
  r.get('/', (_req, res) => {
    const s = SEASON.active();
    res.set('Cache-Control', 'public, max-age=120');   // v1.25.0 สั้นลง: ผู้ดูแลปิด/เปิดธีมแล้วเห็นผลเร็ว
    res.json({ season: s ? { id: s.id, key: s.key, nameTh: s.nameTh, homeMusic: s.homeMusic, endsAt: s.endsAt, flags: s.flags || null } : null });
  });
  return r;
}

function mount(app) {
  app.get('/brand/:file', (req, res, next) => {
    const f = req.params.file;
    if (!SEASON.BRAND_FILES.includes(f)) return next();   // ชื่อไฟล์จากรายการที่กำหนดเท่านั้น (กัน path traversal)
    const s = SEASON.active();
    const seasonal = s && path.join(IMG, s.icons, f);
    const file = seasonal && fs.existsSync(seasonal) ? seasonal : path.join(IMG, f);
    res.set({ 'Cache-Control': 'public, max-age=1800', Vary: 'Accept-Encoding' });
    res.sendFile(file);
  });
  app.get('/manifest.webmanifest', (_req, res) => {
    const s = SEASON.active();
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const v = s ? s.id : 'base';
    m.icons = m.icons.map((i) => ({ ...i, src: `/brand/${path.basename(i.src.split('?')[0])}?v=${v}` }));
    // v1.24.0 ให้ Chrome ตรวจได้ว่าติดตั้งเว็บแอปนี้แล้ว (navigator.getInstalledRelatedApps) — ต้องเป็น URL เต็มของ manifest เอง
    const host = String(_req.get('host') || '').replace(/[^a-z0-9.:-]/gi, '');
    if (host) m.related_applications = [{ platform: 'webapp', url: `${_req.protocol}://${host}/manifest.webmanifest` }];
    res.set({ 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' });
    res.send(JSON.stringify(m, null, 2));
  });
}

module.exports = { apiRouter, mount };
