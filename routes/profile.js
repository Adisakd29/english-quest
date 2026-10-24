/*
  Profile & Privacy API (v1.8.0)
    GET /api/profile/me        Get Own Profile (ทุก field + การตั้งค่า)
    GET /api/profile/:userId   Get Public Profile (เฉพาะ field ที่เจ้าของอนุญาตให้ผู้ชมคนนี้ — ตรวจที่เซิร์ฟเวอร์)
    GET /api/privacy           การตั้งค่าของฉัน
    PUT /api/privacy           Update Privacy Settings (ของตัวเองเท่านั้น · userId จาก token)
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const PV = require('../services/privacy');

const viewLimiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });   // กันไล่ดูโปรไฟล์ทีละ id
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof PV.PrivacyError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[profile/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

const profile = express.Router();
profile.use(authRequired);
profile.get('/me', wrap('me', (req) => PV.getProfile(req.userId, req.userId)));
profile.get('/:userId', (req, res, next) => (viewLimiter.check(`pv:${req.userId}`)
  ? res.status(429).json({ error: 'เปิดโปรไฟล์บ่อยเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next()),
wrap('view', (req) => PV.getProfile(req.userId, req.params.userId)));

const privacy = express.Router();
privacy.use(authRequired);
const meta = () => ({
  levels: PV.LEVELS,
  fields: Object.entries(PV.FIELDS).map(([k, f]) => ({ key: k, th: f.th, hint: f.hint || null, default: f.def })),
  flags: Object.entries(PV.FLAGS).map(([k, f]) => ({ key: k, th: f.th, default: f.def })),
});
privacy.get('/', wrap('get', async (req) => ({ settings: await PV.getSettings(req.userId), ...meta() })));
privacy.put('/', wrap('put', async (req) => ({ settings: await PV.updateSettings(req.userId, req.body || {}), ...meta() })));

module.exports = { profile, privacy };
