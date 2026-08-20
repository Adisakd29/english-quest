const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const realtime = require('../realtime');

const router = express.Router();

// แปลงข้อมูลผู้ใช้ให้อยู่ในรูปที่ปลอดภัยสำหรับส่งออก (ไม่มีอีเมล/รหัสผ่าน)
function publicProfile(row) {
  const level = getLevelInfo(row.exp || 0);
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar || 'fox',
    avatarImage: row.avatar_image || null,
    exp: row.exp || 0,
    level: level.level,
    online: realtime.isOnline(row.id),
    lastSeen: row.last_seen || null,
  };
}

/* ==========================================================
   GET /api/friends — รายชื่อเพื่อนทั้งหมด (เรียงคนออนไลน์ขึ้นก่อน)
   ========================================================== */
router.get('/', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.avatar_image, u.exp, u.last_seen,
              f.id AS friendship_id
         FROM friendships f
         JOIN users u
           ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.status = 'accepted'
          AND (f.requester_id = $1 OR f.addressee_id = $1)`,
      [req.userId]
    );

    const friends = rows
      .map((r) => ({ ...publicProfile(r), friendshipId: r.friendship_id }))
      .sort((a, b) => {
        // ออนไลน์ก่อน แล้วค่อยเรียงตามเลเวล
        if (a.online !== b.online) return a.online ? -1 : 1;
        return b.exp - a.exp;
      });

    res.json({ friends, onlineCount: realtime.getOnlineCount() });
  } catch (err) {
    console.error('[friends/list]', err);
    res.status(500).json({ error: 'โหลดรายชื่อเพื่อนไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /api/friends/requests — คำขอเป็นเพื่อน (เข้า + ที่ส่งไป)
   ========================================================== */
router.get('/requests', authRequired, async (req, res) => {
  try {
    const incoming = await pool.query(
      `SELECT f.id AS friendship_id, f.created_at,
              u.id, u.username, u.avatar, u.avatar_image, u.exp, u.last_seen
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC`,
      [req.userId]
    );

    const outgoing = await pool.query(
      `SELECT f.id AS friendship_id, f.created_at,
              u.id, u.username, u.avatar, u.avatar_image, u.exp, u.last_seen
         FROM friendships f
         JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC`,
      [req.userId]
    );

    res.json({
      incoming: incoming.rows.map((r) => ({ ...publicProfile(r), friendshipId: r.friendship_id })),
      outgoing: outgoing.rows.map((r) => ({ ...publicProfile(r), friendshipId: r.friendship_id })),
    });
  } catch (err) {
    console.error('[friends/requests]', err);
    res.status(500).json({ error: 'โหลดคำขอเป็นเพื่อนไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /api/friends/search?q= — ค้นหาผู้ใช้จากชื่อ
   ========================================================== */
router.get('/search', authRequired, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'พิมพ์อย่างน้อย 2 ตัวอักษร' });
    }

    // ดึงผู้ใช้ที่ชื่อตรงบางส่วน พร้อมสถานะความสัมพันธ์กับเราในครั้งเดียว
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.avatar_image, u.exp, u.last_seen,
              f.id     AS friendship_id,
              f.status AS friendship_status,
              f.requester_id
         FROM users u
         LEFT JOIN friendships f
           ON (f.requester_id = $2 AND f.addressee_id = u.id)
           OR (f.addressee_id = $2 AND f.requester_id = u.id)
        WHERE u.id <> $2
          AND u.username ILIKE $1
        ORDER BY u.username
        LIMIT 20`,
      [`%${q}%`, req.userId]
    );

    const results = rows.map((r) => {
      let relation = 'none';
      if (r.friendship_status === 'accepted') relation = 'friend';
      else if (r.friendship_status === 'pending') {
        relation = r.requester_id === req.userId ? 'requested' : 'incoming';
      }
      return { ...publicProfile(r), relation, friendshipId: r.friendship_id || null };
    });

    res.json({ results });
  } catch (err) {
    console.error('[friends/search]', err);
    res.status(500).json({ error: 'ค้นหาไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /api/friends/request — ส่งคำขอเป็นเพื่อน
   ========================================================== */
router.post('/request', authRequired, async (req, res) => {
  try {
    const { username, userId } = req.body || {};
    if (!username && !userId) {
      return res.status(400).json({ error: 'ระบุชื่อผู้ใช้ที่ต้องการเพิ่ม' });
    }

    const target = await pool.query(
      username
        ? 'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)'
        : 'SELECT id, username FROM users WHERE id = $1',
      [username || userId]
    );

    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้คนนี้' });
    }

    const friend = target.rows[0];
    if (friend.id === req.userId) {
      return res.status(400).json({ error: 'เพิ่มตัวเองเป็นเพื่อนไม่ได้นะ' });
    }

    // เช็คว่ามีความสัมพันธ์อยู่แล้วหรือยัง (ตรวจทั้งสองทิศทาง)
    const existing = await pool.query(
      `SELECT id, status, requester_id FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)`,
      [req.userId, friend.id]
    );

    if (existing.rows.length > 0) {
      const rel = existing.rows[0];
      if (rel.status === 'accepted') {
        return res.status(409).json({ error: 'เป็นเพื่อนกันอยู่แล้ว' });
      }
      // ถ้าอีกฝ่ายเคยส่งคำขอมาหาเรา → ถือว่าตอบรับเลย จะได้ไม่ต้องรอซ้ำซ้อน
      if (rel.requester_id === friend.id) {
        await pool.query(
          `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
          [rel.id]
        );
        realtime.sendToUser(friend.id, 'friend:accepted', { userId: req.userId });
        return res.json({ ok: true, status: 'accepted', message: 'เป็นเพื่อนกันแล้ว!' });
      }
      return res.status(409).json({ error: 'ส่งคำขอไปแล้ว รอการตอบรับอยู่' });
    }

    const inserted = await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [req.userId, friend.id]
    );

    // แจ้งเตือนอีกฝ่ายทันทีถ้าเขาออนไลน์อยู่
    realtime.sendToUser(friend.id, 'friend:request', {
      friendshipId: inserted.rows[0].id,
      from: { id: req.userId },
    });

    res.json({ ok: true, status: 'pending', message: 'ส่งคำขอเป็นเพื่อนแล้ว' });
  } catch (err) {
    console.error('[friends/request]', err);
    res.status(500).json({ error: 'ส่งคำขอไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /api/friends/:id/accept — ตอบรับคำขอ
   ========================================================== */
router.post('/:id/accept', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE friendships
          SET status = 'accepted', responded_at = NOW()
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING requester_id`,
      [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบคำขอนี้ หรือถูกตอบไปแล้ว' });
    }

    realtime.sendToUser(rows[0].requester_id, 'friend:accepted', { userId: req.userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[friends/accept]', err);
    res.status(500).json({ error: 'ตอบรับไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /api/friends/:id/decline — ปฏิเสธคำขอ
   ========================================================== */
router.post('/:id/decline', authRequired, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM friendships
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [req.params.id, req.userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'ไม่พบคำขอนี้' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[friends/decline]', err);
    res.status(500).json({ error: 'ปฏิเสธไม่สำเร็จ' });
  }
});

/* ==========================================================
   DELETE /api/friends/:id — ลบเพื่อน / ยกเลิกคำขอที่ส่งไป
   ========================================================== */
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM friendships
        WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)
        RETURNING requester_id, addressee_id`,
      [req.params.id, req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    }
    const other = rows[0].requester_id === req.userId
      ? rows[0].addressee_id
      : rows[0].requester_id;
    realtime.sendToUser(other, 'friend:removed', { userId: req.userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[friends/remove]', err);
    res.status(500).json({ error: 'ลบไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /api/friends/online — จำนวนคนที่กำลังใช้งานเว็บ
   (ไม่ต้องล็อกอินก็ดูได้ ใช้โชว์หน้าแรก)
   ========================================================== */
router.get('/stats/online', (_req, res) => {
  res.json({ count: realtime.getOnlineCount() });
});

module.exports = router;
