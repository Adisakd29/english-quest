/*
  สร้างและตั้งค่า Express app (แยกออกจากการเปิดพอร์ต)
  เพื่อให้ไฟล์ทดสอบ require แอปมาทดสอบได้โดยไม่ต้องเปิดเซิร์ฟเวอร์จริง
  ส่วนการ listen และ WebSocket อยู่ใน server.js
*/
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const pkg = require('./package.json');
const { securityHeaders } = require('./utils/security');

const authRoutes = require('./routes/auth');
const wordsRoutes = require('./routes/words');
const progressRoutes = require('./routes/progress');
const translateRoutes = require('./routes/translate');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications');
const changelogRoutes = require('./routes/changelog');
const eventRoutes = require('./routes/events');
const grammarRoutes = require('./routes/grammar');
const friendsRoutes = require('./routes/friends');
const mistakesRoutes = require('./routes/mistakes');
const adminRoutes = require('./routes/admin');
const placementRoutes = require('./routes/placement');
const pathRoutes = require('./routes/path');
const assessmentRoutes = require('./routes/assessments');
const vocabRoutes = require('./routes/vocab');
const rankedRoutes = require('./routes/ranked');

function createApp() {
  const app = express();

  // บน Railway คำขอผ่าน reverse proxy 1 ชั้น — เชื่อ proxy ชั้นเดียว
  // เพื่อให้ req.ip และ rate limit อ่าน IP ผู้ใช้จริงได้ถูกต้อง
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(cors());
  app.use(express.json({ limit: '250kb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes);
  app.use('/api/words', wordsRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/translate', translateRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/grammar', grammarRoutes);
  app.use('/api/friends', friendsRoutes);
  app.use('/api/mistakes', mistakesRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/placement', placementRoutes);
  app.use('/api/path', pathRoutes);
  app.use('/api/assessments', assessmentRoutes);
  app.use('/api/vocab', vocabRoutes);
  app.use('/api/ranked', rankedRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/changelog', changelogRoutes);
  app.use('/api/events', eventRoutes.events);
  app.use('/api/themes', eventRoutes.themes);

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: pkg.version }));

  // เสิร์ฟหน้าเว็บ (frontend) แบบ static จากโฟลเดอร์ public
  // บีบอัด gzip/brotli ทุกคำตอบที่เป็นข้อความ (JS 164KB / CSS 116KB เดิมส่งแบบไม่บีบอัดไปมือถือ)
  app.use(compression());

  // Service Worker ประทับเวอร์ชัน (hash ของไฟล์หน้าเว็บ) -> deploy ใหม่ = sw.js เปลี่ยน = เบราว์เซอร์รู้ว่ามีอัปเดต
  const swSource = fs.readFileSync(path.join(__dirname, 'public', 'sw.js'), 'utf8');
  const buildHash = crypto.createHash('sha256');
  ['index.html', 'js/app.js', 'js/graphics.js', 'css/style.css', 'css/theme-auto.css', 'css/theme.css', 'css/theme-dark.css', 'css/visual.css', 'css/ranked.css', 'js/ranked.js', 'js/audio.js', 'assets/audio/manifest.json', 'assets/npcs/npcs.svg', 'assets/guardians/guardians.svg',
    'assets/icons/icons.svg', 'assets/illustrations/illustrations.svg', 'assets/mascot/mascot.svg', 'assets/avatars/avatars.svg', 'assets/badges/badges.svg'].forEach((f) => {
    try { buildHash.update(fs.readFileSync(path.join(__dirname, 'public', f))); } catch (_) { /* ไม่มีไฟล์ */ }
  });
  // แทนที่ตรงค่าคงที่ 'BUILD' (ไม่ใช่ตำแหน่งแรกของคำ — คอมเมนต์ในไฟล์ก็มีคำนี้)
  const swBody = swSource.replace("const BUILD = '__BUILD__';", `const BUILD = '${buildHash.digest('hex').slice(0, 12)}';`);
  if (swBody === swSource) console.error('[sw] ประทับเวอร์ชัน Service Worker ไม่สำเร็จ');
  app.get('/sw.js', (_req, res) => {
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    res.send(swBody);
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // 404 handler สำหรับ API ที่ไม่มีจริง
  app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ endpoint นี้' }));

  // ตัวจัดการ error รวม — ต้องอยู่ท้ายสุดเสมอ
  // ป้องกันไม่ให้ stack trace (ซึ่งเปิดเผย path ของเซิร์ฟเวอร์) หลุดออกไปหาผู้ใช้
  app.use((err, req, res, _next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'ข้อมูลมีขนาดใหญ่เกินไป' });
    }
    console.error('[server/error]', err && err.stack ? err.stack : err);
    if (req.path && req.path.startsWith('/api')) {
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
    }
    res.status(500).send('เกิดข้อผิดพลาดในระบบ');
  });

  return app;
}

module.exports = { createApp };
