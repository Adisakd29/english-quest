/*
  แชทระหว่างเพื่อน — /api/chat
  ความปลอดภัย (ผู้ใช้ส่วนใหญ่เป็นนักเรียน):
    - ส่งได้เฉพาะเพื่อนที่ตอบรับแล้ว และไม่ได้บล็อกกัน (บล็อกแล้วข้อความเก่าไม่แสดงต่อ)
    - ข้อความตัวอักษรล้วน ≤ 500 ตัว (หน้าเว็บ escape ทุกครั้ง ไม่แปลงเป็น HTML/ลิงก์) · จำกัด 30 ข้อความ/นาที
    - รายงานผู้ใช้จากหน้าแชทได้ (ใช้ระบบรายงานเดิม) · เก็บข้อความ 180 วัน
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const realtime = require('../realtime');
const { createLimiter } = require('../utils/rateLimit');
const { isBlockedEither, blockedSet } = require('../utils/blocks');

const router = express.Router();
router.use(authRequired);
const sendLimiter = createLimiter({ limit: 30, windowMs: 60 * 1000 });
const MAX_LEN = 500;
const PAGE = 30;
const RETENTION_DAYS = 180;

async function areFriends(a, b) {
  const { rows } = await pool.query(
    `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`, [a, b]);
  return Boolean(rows[0]);
}
/** ทำความสะอาดข้อความ: ตัดอักขระควบคุม (ยกเว้นขึ้นบรรทัด) · ขึ้นบรรทัดติดกันไม่เกิน 2 · ตัดช่องว่างหัวท้าย */
function cleanBody(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const view = (r, me) => ({ id: Number(r.id), from: r.sender_id, to: r.recipient_id, mine: r.sender_id === me, body: r.body, at: r.created_at, readAt: r.read_at });

async function guard(req, res) {
  const other = Number(req.params.userId);
  if (!Number.isInteger(other) || other <= 0 || other === req.userId) { res.status(400).json({ error: 'ผู้ใช้ไม่ถูกต้อง' }); return null; }
  if (await isBlockedEither(req.userId, other)) { res.status(403).json({ error: 'ไม่สามารถคุยกับผู้ใช้นี้ได้', code: 'BLOCKED' }); return null; }
  if (!(await areFriends(req.userId, other))) { res.status(403).json({ error: 'แชทได้เฉพาะเพื่อน', code: 'NOT_FRIEND' }); return null; }
  return other;
}

/** รายการบทสนทนา: เพื่อนทุกคน + ข้อความล่าสุด + จำนวนที่ยังไม่อ่าน (คนที่มีข้อความล่าสุดขึ้นก่อน) */
router.get('/conversations', async (req, res) => {
  try {
    const me = req.userId;
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.avatar_image,
              lm.body AS last_body, lm.created_at AS last_at, lm.sender_id AS last_from,
              (SELECT COUNT(*)::int FROM direct_messages d WHERE d.sender_id = u.id AND d.recipient_id = $1 AND d.read_at IS NULL) AS unread
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         LEFT JOIN LATERAL (
           SELECT body, created_at, sender_id FROM direct_messages d
            WHERE LEAST(d.sender_id, d.recipient_id) = LEAST($1, u.id) AND GREATEST(d.sender_id, d.recipient_id) = GREATEST($1, u.id)
            ORDER BY d.id DESC LIMIT 1) lm ON TRUE
        WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)`, [me]);
    const blocked = await blockedSet(me);
    const list = rows.filter((r) => !blocked.has(r.id)).map((r) => ({
      userId: r.id, username: r.username, avatar: r.avatar || 'fox', avatarImage: r.avatar_image || null,
      online: realtime.isOnline(r.id), unread: r.unread,
      last: r.last_at ? { body: r.last_body.slice(0, 80), at: r.last_at, mine: r.last_from === me } : null,
    })).sort((a, b) => (b.last ? new Date(b.last.at) : 0) - (a.last ? new Date(a.last.at) : 0) || (b.online - a.online));
    res.json({ conversations: list, unreadTotal: list.reduce((s, c) => s + c.unread, 0) });
  } catch (err) {
    console.error('[chat/conversations]', err);
    res.status(500).json({ error: 'โหลดรายการแชทไม่สำเร็จ' });
  }
});

/** จำนวนข้อความที่ยังไม่อ่านทั้งหมด (ป้ายบนปุ่มแชท) */
router.get('/unread', async (req, res) => {
  try {
    const blocked = [...(await blockedSet(req.userId))];
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL AND NOT (sender_id = ANY($2::int[]))`,
      [req.userId, blocked]);
    res.json({ unread: rows[0].n });
  } catch (err) { console.error('[chat/unread]', err); res.status(500).json({ error: 'error' }); }
});

/** ข้อความในบทสนทนา (ใหม่สุด 30 ข้อความ · ?before=<id> โหลดก่อนหน้า) */
router.get('/:userId/messages', async (req, res) => {
  try {
    const other = await guard(req, res);
    if (!other) return;
    const before = Number(req.query.before) || null;
    const { rows } = await pool.query(
      `SELECT * FROM direct_messages
        WHERE LEAST(sender_id, recipient_id) = LEAST($1::int, $2::int) AND GREATEST(sender_id, recipient_id) = GREATEST($1::int, $2::int)
          AND ($3::bigint IS NULL OR id < $3)
        ORDER BY id DESC LIMIT $4`, [req.userId, other, before, PAGE + 1]);
    const more = rows.length > PAGE;
    res.json({ messages: rows.slice(0, PAGE).reverse().map((r) => view(r, req.userId)), more });
  } catch (err) {
    console.error('[chat/messages]', err);
    res.status(500).json({ error: 'โหลดข้อความไม่สำเร็จ' });
  }
});

/** ส่งข้อความ */
router.post('/:userId/messages', async (req, res) => {
  try {
    const other = await guard(req, res);
    if (!other) return;
    const body = cleanBody((req.body || {}).body);
    if (!body) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
    if (body.length > MAX_LEN) return res.status(400).json({ error: `ข้อความยาวได้ไม่เกิน ${MAX_LEN} ตัวอักษร`, code: 'TOO_LONG' });
    if (sendLimiter.check(`u:${req.userId}`)) return res.status(429).json({ error: 'ส่งข้อความเร็วเกินไป รอสักครู่', code: 'RATE_LIMITED' });
    const { rows } = await pool.query(
      'INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING *', [req.userId, other, body]);
    const msg = rows[0];
    const sender = (await pool.query('SELECT username, avatar, avatar_image FROM users WHERE id = $1', [req.userId])).rows[0];
    // ผู้รับ (ทุกแท็บ) + ผู้ส่งแท็บอื่น ได้ข้อความทันที
    realtime.sendToUser(other, 'chat:message', { message: view(msg, other), from: { id: req.userId, username: sender.username, avatar: sender.avatar, avatarImage: sender.avatar_image || null } });
    realtime.sendToUser(req.userId, 'chat:message', { message: view(msg, req.userId), echo: true });
    res.json({ message: view(msg, req.userId) });
  } catch (err) {
    console.error('[chat/send]', err);
    res.status(500).json({ error: 'ส่งข้อความไม่สำเร็จ' });
  }
});

/** อ่านแล้ว (ทุกข้อความจากคนนี้) */
router.post('/:userId/read', async (req, res) => {
  try {
    const other = Number(req.params.userId);
    if (!Number.isInteger(other) || other <= 0) return res.status(400).json({ error: 'ผู้ใช้ไม่ถูกต้อง' });
    const { rowCount } = await pool.query(
      'UPDATE direct_messages SET read_at = NOW() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [other, req.userId]);
    if (rowCount) realtime.sendToUser(other, 'chat:read', { by: req.userId });
    res.json({ ok: true, marked: rowCount });
  } catch (err) {
    console.error('[chat/read]', err);
    res.status(500).json({ error: 'error' });
  }
});

/** ลบข้อความเก่ากว่า 180 วัน (เรียกตอนเริ่มเซิร์ฟเวอร์และทุกวัน) */
async function purgeOld() {
  await pool.query(`DELETE FROM direct_messages WHERE created_at < NOW() - make_interval(days => $1)`, [RETENTION_DAYS]);
}

module.exports = router;
module.exports.purgeOld = purgeOld;
module.exports.cleanBody = cleanBody;
