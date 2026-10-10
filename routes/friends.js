const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const { escapeLike } = require('../utils/security');
const realtime = require('../realtime');
const { createLimiter } = require('../utils/rateLimit');
const { isBlockedEither, blockedSet } = require('../utils/blocks');

// กันสแปม: คำขอเป็นเพื่อน 20 ครั้ง/ชม. · รายงาน 5 ครั้ง/ชม. ต่อผู้ใช้
const requestLimiter = createLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
const reportLimiter = createLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const router = express.Router();

// แปลงข้อมูลผู้ใช้ให้อยู่ในรูปที่ปลอดภัยสำหรับส่งออก (ไม่มีอีเมล/รหัสผ่าน)
// ความเป็นส่วนตัว: สถานะออนไลน์ / เวลาออนไลน์ล่าสุด แสดงเฉพาะเพื่อน (isFriend)
// (เดิมใครค้นชื่อก็เห็นว่าออนไลน์อยู่ไหมและออนไลน์ล่าสุดเมื่อไร)
function publicProfile(row, { isFriend = true } = {}) {
  const level = getLevelInfo(row.exp || 0);
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar || 'fox',
    avatarImage: row.avatar_image || null,
    exp: row.exp || 0,
    level: level.level,
    online: isFriend ? realtime.isOnline(row.id) : null,
    lastSeen: isFriend ? (row.last_seen || null) : null,
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
   GET /api/friends/relations?ids=1,2,3 — สถานะความสัมพันธ์กับผู้ใช้หลายคน (ใช้แสดงปุ่ม "เพิ่มเพื่อน" บนกระดานอันดับ)
   คืน { relations: { [id]: 'self' | 'friend' | 'pending_out' | 'pending_in' | 'blocked' | 'none' } }
   ========================================================== */
router.get('/relations', authRequired, async (req, res) => {
  try {
    const ids = [...new Set(String(req.query.ids || '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 200);
    const out = {};
    if (!ids.length) return res.json({ relations: out });
    ids.forEach((id) => { out[id] = id === req.userId ? 'self' : 'none'; });
    const { rows } = await pool.query(
      `SELECT requester_id, addressee_id, status FROM friendships
        WHERE (requester_id = $1 AND addressee_id = ANY($2::int[])) OR (addressee_id = $1 AND requester_id = ANY($2::int[]))`,
      [req.userId, ids]);
    for (const r of rows) {
      const other = r.requester_id === req.userId ? r.addressee_id : r.requester_id;
      if (r.status === 'accepted') out[other] = 'friend';
      else if (r.status === 'pending') out[other] = r.requester_id === req.userId ? 'pending_out' : 'pending_in';
    }
    const blocked = await blockedSet(req.userId);
    ids.forEach((id) => { if (blocked.has(id)) out[id] = 'blocked'; });
    res.json({ relations: out });
  } catch (err) {
    console.error('[friends/relations]', err);
    res.status(500).json({ error: 'โหลดสถานะเพื่อนไม่สำเร็จ' });
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
          AND NOT EXISTS (SELECT 1 FROM user_blocks b
                           WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2))
        ORDER BY u.username
        LIMIT 20`,
      [`%${escapeLike(q)}%`, req.userId]
    );

    const results = rows.map((r) => {
      let relation = 'none';
      if (r.friendship_status === 'accepted') relation = 'friend';
      else if (r.friendship_status === 'pending') {
        relation = r.requester_id === req.userId ? 'requested' : 'incoming';
      }
      return { ...publicProfile(r, { isFriend: relation === 'friend' }), relation, friendshipId: r.friendship_id || null };
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
    if (requestLimiter.check(`u:${req.userId}`)) {
      return res.status(429).json({ error: 'ส่งคำขอเป็นเพื่อนบ่อยเกินไป ลองใหม่ภายหลัง', code: 'RATE_LIMITED' });
    }
    if (await isBlockedEither(req.userId, friend.id)) {
      return res.status(403).json({ error: 'ไม่สามารถส่งคำขอเป็นเพื่อนถึงผู้ใช้นี้ได้', code: 'NOT_ALLOWED' });
    }
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

/* ==========================================================
   Social Safety — บล็อก / รายงาน
   ========================================================== */
const REPORT_REASONS = new Set(['spam', 'harassment', 'inappropriate_name', 'cheating', 'other']);

// POST /friends/block/:userId — บล็อก (ลบความเป็นเพื่อน/คำขอที่ค้างระหว่างกันด้วย)
router.post('/block/:userId', authRequired, async (req, res) => {
  const target = Number(req.params.userId);
  if (!Number.isInteger(target) || target <= 0) return res.status(400).json({ error: 'ผู้ใช้ไม่ถูกต้อง' });
  if (target === req.userId) return res.status(400).json({ error: 'บล็อกตัวเองไม่ได้' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM users WHERE id = $1', [target]);
    if (!exists.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบผู้ใช้' }); }
    await client.query(
      'INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, target]
    );
    await client.query(
      `DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [req.userId, target]
    );
    await client.query('COMMIT');
    res.json({ ok: true, blocked: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[friends/block]', err);
    res.status(500).json({ error: 'บล็อกไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

// DELETE /friends/block/:userId — ปลดบล็อก
router.delete('/block/:userId', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.userId, Number(req.params.userId) || 0]);
    res.json({ ok: true, blocked: false });
  } catch (err) {
    console.error('[friends/unblock]', err);
    res.status(500).json({ error: 'ปลดบล็อกไม่สำเร็จ' });
  }
});

// GET /friends/blocked — รายชื่อที่เราบล็อก
router.get('/blocked', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.avatar_image, u.exp FROM user_blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`, [req.userId]
    );
    res.json({ blocked: rows.map((r) => publicProfile(r, { isFriend: false })) });
  } catch (err) {
    console.error('[friends/blocked]', err);
    res.status(500).json({ error: 'โหลดรายชื่อที่บล็อกไม่สำเร็จ' });
  }
});

// POST /friends/report { userId, reason, details } — รายงานผู้ใช้ให้ผู้ดูแลตรวจ
router.post('/report', authRequired, async (req, res) => {
  try {
    const { userId, reason, details } = req.body || {};
    const target = Number(userId);
    if (!Number.isInteger(target) || target <= 0 || target === req.userId) return res.status(400).json({ error: 'ผู้ใช้ไม่ถูกต้อง' });
    if (!REPORT_REASONS.has(reason)) return res.status(400).json({ error: 'กรุณาเลือกเหตุผล' });
    if (reportLimiter.check(`u:${req.userId}`)) {
      return res.status(429).json({ error: 'รายงานบ่อยเกินไป ลองใหม่ภายหลัง', code: 'RATE_LIMITED' });
    }
    const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [target]);
    if (!exists.rows.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    // รายงานซ้ำคนเดิมที่ยังไม่ถูกตรวจ = ไม่สร้างใหม่
    const dup = await pool.query(
      "SELECT id FROM user_reports WHERE reporter_id = $1 AND reported_id = $2 AND status = 'open'", [req.userId, target]
    );
    if (!dup.rows.length) {
      await pool.query(
        'INSERT INTO user_reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4)',
        [req.userId, target, reason, details ? String(details).trim().slice(0, 500) : null]
      );
    }
    res.json({ ok: true, message: 'ขอบคุณที่แจ้ง — ผู้ดูแลจะตรวจสอบ' });
  } catch (err) {
    console.error('[friends/report]', err);
    res.status(500).json({ error: 'ส่งรายงานไม่สำเร็จ' });
  }
});

router.get('/stats/online', (_req, res) => {
  res.json({ count: realtime.getOnlineCount() });
});

module.exports = router;
