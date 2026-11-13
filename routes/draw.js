/*
  v1.20.0 วาดทายศัพท์ — REST (สร้าง/เข้า/ออกห้อง · คำเชิญ · รายงาน) · ระหว่างเกม (เส้นวาด/คำทาย) ใช้ WebSocket ประเภท draw:*
  userId จาก token เท่านั้น
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const D = require('../services/draw');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: Number(process.env.DRAW_RATE_PER_MIN) || 90, windowMs: 60 * 1000 });
router.use((req, res, next) => (limiter.check(`draw:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next()));

const b = (req) => req.body || {};
const wrap = (tag, fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    // DrawError ของเกม หรือ ChatError ของแชทโลก (คำเชิญ: ถูกปิดแชท/ส่งถี่)
    if (err instanceof D.DrawError || (err && err.constructor && err.constructor.name === 'ChatError')) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
    console.error(`[draw/${tag}]`, err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

router.get('/', wrap('hub', async (req) => {
  const room = D.roomOf(req.userId);
  return { current: room ? D.peek(room.code, req.userId) : null, levels: Object.entries(D.LEVEL_TH).map(([id, th]) => ({ id, th })),
    rounds: D.CFG.rounds, drawSecs: D.CFG.drawSecs, maxPlayers: D.CFG.maxPlayers, words: D.words().list.length, expCap: D.EXP.DAILY_CAP,
    reportReasons: D.REPORT_REASONS };
}));
router.post('/rooms', wrap('create', (req) => D.create(req.userId, b(req))));
router.get('/rooms', wrap('rooms', (req) => D.listRooms(req.userId)));   // v1.21.0 รายการห้องที่เปิดอยู่ (กดเข้าได้เลย)
router.get('/rooms/:code/peek', wrap('peek', async (req) => D.peek(req.params.code, req.userId)));
router.post('/rooms/:code/join', wrap('join', (req) => D.join(req.userId, req.params.code)));
router.post('/leave', wrap('leave', async (req) => D.leave(req.userId)));
router.post('/invite/world', wrap('invite-world', (req) => D.inviteWorld(req.userId)));
router.post('/invite/friend', wrap('invite-friend', (req) => D.inviteFriend(req.userId, b(req).userId)));
router.post('/report', wrap('report', (req) => D.report(req.userId, { userId: b(req).userId, reason: String(b(req).reason || ''), note: b(req).note })));
// เก็บคำที่เจอในเกมเข้าคิวทบทวน (เฉพาะคำของห้องที่ตัวเองอยู่ · ไม่ให้ EXP)
router.post('/save-words', wrap('save-words', (req) => D.saveWords(req.userId)));
router.get('/admin/evidence/:reportId', requireAdmin, wrap('evidence', (req) => D.evidence(req.params.reportId)));

module.exports = router;
