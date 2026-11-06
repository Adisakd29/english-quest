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
const grammarLearnRoutes = require('./routes/grammarLearn');
const friendsRoutes = require('./routes/friends');
const mistakesRoutes = require('./routes/mistakes');
const adminRoutes = require('./routes/admin');
const placementRoutes = require('./routes/placement');
const pathRoutes = require('./routes/path');
const assessmentRoutes = require('./routes/assessments');
const vocabRoutes = require('./routes/vocab');
const c2Routes = require('./routes/c2');
const toeicRoutes = require('./routes/toeic');
const speakRoutes = require('./routes/speak');   // ฝึกพูด / ออกเสียง (Speaking)
const avatarRoutes = require('./routes/avatar');
const profileRoutes = require('./routes/profile');   // v1.8.0 Public Profile + Privacy   // v1.8.0 Avatar / Coin / Achievement
const rankedRoutes = require('./routes/ranked');
const moderationRoutes = require('./routes/moderation');   // v1.16.0 การกลั่นกรองแชท (แยกจาก EnglishQuest World ที่ถูกนำออก)
const lobbyRoutes = require('./routes/lobby');             // v1.16.0 หน้าหลักแบบ Game Lobby
const flashcardRoutes = require('./routes/flashcards');
const adminEventCarouselRoutes = require('./routes/adminEventCarousel');   // v1.17.0 Event Carousel (ผู้ดูแล)   // v1.17.0 Flashcard ดาวน์โหลด
const adminUsersRoutes = require('./routes/adminUsers');   // v1.11.0 ผู้ดูแลผู้ใช้ (บัญชีทดสอบ · ประวัติ) + แดชบอร์ดการเรียน (เดิมอยู่ในสมาชิก Premium ที่ยกเลิกแล้ว)
const workRoutes = require('./routes/work');               // v1.10.0 ภาษาอังกฤษเพื่อการทำงาน (v1.11.0 เปิดให้ทุกคน)
const themeVocabRoutes = require('./routes/themeVocab');   // v1.12.0 หมวดคำศัพท์ตามเทศกาล (ฮาโลวีน · ลอยกระทง)
const wordAtlasRoutes = require('./routes/wordAtlas');     // v1.14.0 Word Atlas — คลังคำศัพท์ A–Z
const worldChatRoutes = require('./routes/worldChat');     // v1.15.0 แชทโลก — ทุกคนพิมพ์คุยกันได้
const streakRoutes = require('./routes/streak');           // v1.18.0 Learning Streak

function createApp() {
  const app = express();

  // บน Railway คำขอผ่าน reverse proxy 1 ชั้น — เชื่อ proxy ชั้นเดียว
  // เพื่อให้ req.ip และ rate limit อ่าน IP ผู้ใช้จริงได้ถูกต้อง
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(cors());
  // แนบสลิป: รูปหลังย่อในเบราว์เซอร์ ≤ 1 MB (base64 ~1.4 MB) — เพิ่มเพดานเฉพาะ endpoint นี้
  // v1.17.0: อัปโหลดแบนเนอร์กิจกรรม (ผู้ดูแล) ใช้ตัวอ่าน JSON ของตัวเอง (≤ 1MB) — เส้นทางอื่นจำกัด 250kb เหมือนเดิม
  const jsonBody = express.json({ limit: '250kb' });
  app.use((req, res, next) => (req.path === '/api/admin/event-carousel/upload' ? next() : jsonBody(req, res, next)));
  app.use(cookieParser());

  // v1.10.0: จำกัดคำขอต่อ IP สำหรับ API ที่เดิมไม่มีเพดาน (คำนวณหนัก/ให้ EXP) — 240 ครั้ง/นาที
  app.use(['/api/progress', '/api/grammar', '/api/leaderboard', '/api/vocab', '/api/assessments'],
    require('./utils/rateLimit').ipLimit({ limit: 240, windowMs: 60 * 1000 }));
  app.use('/api/auth', authRoutes);
  app.use('/api/words', wordsRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/translate', translateRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/grammar', grammarRoutes);
  app.use('/api/gl', grammarLearnRoutes);   // ระบบเรียนแกรมม่า A1–C1
  app.use('/api/lesson', require('./routes/lesson'));   // v1.10.0 Phase 2: บทเรียนคำศัพท์ v2 (เซิร์ฟเวอร์เก็บเฉลย)
  app.use('/api/studio', require('./routes/studio'));   // v1.10.0 Phase 3: Writing Studio + ผู้ช่วยค้นคำตอบ (ไม่ใช้ AI)
  app.use('/api/graded', require('./routes/graded'));   // v1.10.0 Phase 5: Graded Reading & Listening
  app.use('/api/realtime', require('./routes/realtime')); // v1.10.0 Phase 5: ตั๋ว WebSocket (JWT ไม่อยู่ใน URL)
  app.use('/api/friends', friendsRoutes);
  app.use('/api/mistakes', mistakesRoutes);
  app.use('/api/admin/event-carousel', adminEventCarouselRoutes);   // v1.17.0 ก่อน /api/admin
  app.use('/api/admin/world', (_req, res) => res.status(410).json({ error: 'EnglishQuest World ปิดให้บริการแล้ว', code: 'WORLD_REMOVED' }));   // v1.16.0 ก่อน /api/admin (ด่านสิทธิ์ผู้ดูแล)
  app.use('/api/admin/users', adminUsersRoutes.admin);   // ก่อน /api/admin
  app.use('/api/admin/moderation', moderationRoutes.admin);   // ก่อน /api/admin (router ผู้ดูแลคำศัพท์มีด่านโหมด Oxford)
  app.use('/api/admin', adminRoutes);
  app.use('/api/moderation', moderationRoutes.me);
  app.use('/api/lobby', lobbyRoutes);
  app.use('/api/flashcards', flashcardRoutes);   // v1.17.0 Flashcard ดาวน์โหลด
  // v1.16.0: EnglishQuest World ถูกนำออก — ลิงก์/แอปเวอร์ชันเก่าที่เรียก API เดิมได้ 410 พร้อมข้อความ (ไม่ใช่ 404 เงียบ)
  const worldGone = (_req, res) => res.status(410).json({ error: 'EnglishQuest World ปิดให้บริการแล้ว', code: 'WORLD_REMOVED' });
  app.use('/api/world', worldGone);
  app.use('/api/placement', placementRoutes);
  app.use('/api/path', pathRoutes);
  app.use('/api/assessments', assessmentRoutes);
  app.use('/api/vocab', vocabRoutes);
  app.use('/api/dashboard', adminUsersRoutes.dashboard);   // แดชบอร์ดการเรียน — ทุกคน (v1.11.0)
  app.use('/api/work', workRoutes);
  app.use('/api/theme-vocab', themeVocabRoutes);
  app.use('/api/word-atlas', wordAtlasRoutes);
  app.use('/api/world-chat', worldChatRoutes);
  app.use('/api/streak', streakRoutes);
  app.use('/api/toeic', toeicRoutes);     // TOEIC-style Practice (Listening Part 1 · Practice / Mock)
  app.use('/api/speak', speakRoutes);     // Speaking: ฝึกพูด/ออกเสียง · ฟังแล้วพิมพ์
  app.use('/api/c2', c2Routes);           // คำศัพท์ C2 (บทเรียน 12 ขั้น · Challenge · ความคืบหน้า)
  app.use('/api/avatar', avatarRoutes.avatar);
  app.use('/api/coins', avatarRoutes.coins);
  app.use('/api/achievements', avatarRoutes.achievements);
  app.use('/api/profile', profileRoutes.profile);
  app.use('/api/privacy', profileRoutes.privacy);
  app.use('/api/ranked', rankedRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/changelog', changelogRoutes);
  app.use('/api/events', eventRoutes.events);
  app.use('/api/themes', eventRoutes.themes);

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: pkg.version }));
  // รับรายงานการละเมิด CSP (โหมด report) — บันทึก log สั้น ๆ ไว้ตรวจก่อนเปิด enforce · ไม่เก็บข้อมูลส่วนตัว
  app.post('/api/csp-report',
    require('./utils/rateLimit').ipLimit({ limit: 60, windowMs: 60 * 1000 }),
    express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'], limit: '20kb' }),
    (req, res) => {
      const r = (req.body && (req.body['csp-report'] || (Array.isArray(req.body) && req.body[0] && req.body[0].body))) || {};
      const d = String(r['violated-directive'] || r.effectiveDirective || r['effective-directive'] || '').slice(0, 60);
      const u = String(r['blocked-uri'] || r.blockedURL || '').slice(0, 160);
      if (d) console.warn(`[csp] ${d} ${u}`);
      res.status(204).end();
    });

  // เสิร์ฟหน้าเว็บ (frontend) แบบ static จากโฟลเดอร์ public
  // บีบอัด gzip/brotli ทุกคำตอบที่เป็นข้อความ (JS 164KB / CSS 116KB เดิมส่งแบบไม่บีบอัดไปมือถือ)
  app.use(compression());

  // Service Worker ประทับเวอร์ชัน (hash ของไฟล์หน้าเว็บ) -> deploy ใหม่ = sw.js เปลี่ยน = เบราว์เซอร์รู้ว่ามีอัปเดต
  const swSource = fs.readFileSync(path.join(__dirname, 'public', 'sw.js'), 'utf8');
  const buildHash = crypto.createHash('sha256');
  ['index.html', 'js/app.js', 'js/graphics.js', 'css/style.css', 'css/theme-auto.css', 'css/theme.css', 'css/theme-dark.css', 'css/visual.css', 'css/ranked.css', 'js/ranked.js', 'js/audio.js', 'assets/audio/manifest.json', 'assets/npcs/npcs.svg', 'assets/guardians/guardians.svg',
    'assets/icons/icons.svg', 'assets/illustrations/illustrations.svg', 'assets/mascot/mascot.svg', 'assets/avatars/avatars.svg', 'assets/badges/badges.svg', 'js/c2.js', 'css/c2.css', 'css/theme-astronomy.css', 'js/astro-fx.js', 'js/toeic.js', 'css/toeic.css', 'js/toeic2.js', 'css/toeic2.css', 'js/toeic34.js', 'css/toeic34.css', 'js/toeic5.js', 'css/toeic5.css', 'js/toeicfull.js', 'css/toeicfull.css', 'js/toeic6.js', 'css/toeic6.css', 'js/toeic7.js', 'css/toeic7.css', 'js/speak.js', 'js/speak-score.js', 'css/speak.css', 'js/avatar.js', 'css/avatar.css', 'js/avatar3d.js'].forEach((f) => {
    try { buildHash.update(fs.readFileSync(path.join(__dirname, 'public', f))); } catch (_) { /* ไม่มีไฟล์ */ }
  });
  // แทนที่ตรงค่าคงที่ 'BUILD' (ไม่ใช่ตำแหน่งแรกของคำ — คอมเมนต์ในไฟล์ก็มีคำนี้)
  const swBody = swSource.replace("const BUILD = '__BUILD__';", `const BUILD = '${buildHash.digest('hex').slice(0, 12)}';`);
  if (swBody === swSource) console.error('[sw] ประทับเวอร์ชัน Service Worker ไม่สำเร็จ');
  app.get('/sw.js', (_req, res) => {
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    res.send(swBody);
  });
  // ภาพ/เสียงข้อสอบ TOEIC-style: ชื่อไฟล์เสียงมี contentHash (เปลี่ยนข้อความ = ไฟล์ใหม่) -> cache นานได้
  app.use('/assets/toeic', express.static(path.join(__dirname, 'public', 'assets', 'toeic'), { maxAge: '7d' }));
  // 3D Avatar: GLB ชื่อไฟล์มี hash -> cache ได้ยาว · three.js เรียกด้วย ?v=<เวอร์ชัน>
  app.use('/assets/avatar3d', express.static(path.join(__dirname, 'public', 'assets', 'avatar3d'), { maxAge: '30d', immutable: true }));
  app.use('/vendor', express.static(path.join(__dirname, 'public', 'vendor'), { maxAge: '30d', immutable: true }));
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
