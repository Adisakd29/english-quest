const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');

/*
  Leaderboard
    GET /leaderboard?period=week|month|all&scope=global|friends
    - week (ค่าเริ่มต้น): EXP ที่ได้ตั้งแต่วันจันทร์ 00:00 เวลาไทย — ผู้ใช้ใหม่ยังแข่งได้
    - month: ตั้งแต่วันที่ 1 ของเดือน 00:00 เวลาไทย
    - all:   EXP สะสมทั้งหมด (แบบเดิม)
    - scope=friends: เฉพาะเพื่อน (ที่ยอมรับแล้ว) + ตัวเอง
  ข้อมูลที่เปิดเผย: id ผู้ใช้ (ใช้ส่งคำขอเป็นเพื่อนจากกระดาน) / ชื่อผู้ใช้ / อวตาร / คะแนน / เลเวล — ไม่มีอีเมล
*/
const router = express.Router();
const TOP_LIMIT = 50;
const PERIODS = new Set(['week', 'month', 'all']);
const TZ = 'Asia/Bangkok';

function toEntry(row, userId) {
  return {
    rank: row.rank === null ? null : Number(row.rank),
    userId: row.id,
    username: row.username,
    avatar: row.avatar,
    avatarImage: row.avatar_image || null,
    score: Number(row.score),
    exp: Number(row.score), // ชื่อเดิม (หน้าเว็บเก่ายังอ่านได้)
    level: getLevelInfo(row.total_exp).level,
    isMe: row.id === userId,
  };
}

router.get('/', authRequired, async (req, res) => {
  try {
    const period = PERIODS.has(req.query.period) ? req.query.period : 'week';
    const friends = req.query.scope === 'friends';
    const params = [req.userId];
    // กลุ่มผู้เล่นที่นำมาจัดอันดับ
    const circle = friends
      ? `(SELECT $1::int AS uid UNION
          SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
            FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1))`
      : null;
    let scoresSql;
    let since = null;
    if (period === 'all') {
      scoresSql = `SELECT id AS user_id, exp AS score FROM users
                    ${circle ? `WHERE id IN (SELECT uid FROM ${circle} c)` : ''}`;
    } else {
      const unit = period === 'week' ? 'week' : 'month';
      const sinceRes = await pool.query(
        `SELECT (date_trunc('${unit}', NOW() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}') AS since`
      );
      since = sinceRes.rows[0].since;
      params.push(since);
      scoresSql = `SELECT user_id, SUM(amount)::int AS score FROM exp_log
                    WHERE created_at >= $2 ${circle ? `AND user_id IN (SELECT uid FROM ${circle} c)` : ''}
                    GROUP BY user_id HAVING SUM(amount) > 0`;
    }
    const ranked = `
      WITH s AS (${scoresSql}),
      r AS (SELECT u.id, u.username, u.avatar, u.avatar_image, u.exp AS total_exp, s.score,
                   RANK() OVER (ORDER BY s.score DESC) AS rank
              FROM s JOIN users u ON u.id = s.user_id
             -- อ้างถึง $1 เสมอ (โหมดทั้งหมดไม่ได้ใช้ $1 ในเงื่อนไข -> PostgreSQL เดาชนิดไม่ได้)
             WHERE $1::int IS NOT NULL)`;
    const top = await pool.query(`${ranked} SELECT * FROM r ORDER BY rank, id LIMIT ${TOP_LIMIT}`, params);
    const entries = top.rows.map((r) => toEntry(r, req.userId));
    let me = entries.find((e) => e.isMe) || null;
    if (!me) {
      const mine = await pool.query(`${ranked} SELECT * FROM r WHERE id = $1`, params);
      if (mine.rows[0]) {
        me = toEntry(mine.rows[0], req.userId);
      } else {
        // ยังไม่มีคะแนนในช่วงนี้ — แสดงตัวเองพร้อมคะแนน 0 (ไม่มีอันดับ)
        const u = await pool.query('SELECT id, username, avatar, avatar_image, exp AS total_exp FROM users WHERE id = $1', [req.userId]);
        if (u.rows[0]) me = toEntry({ ...u.rows[0], score: 0, rank: null }, req.userId);
      }
    }
    res.json({ period, scope: friends ? 'friends' : 'global', since, top: entries, me });
  } catch (err) {
    console.error('[leaderboard]', err);
    res.status(500).json({ error: 'โหลดอันดับไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
