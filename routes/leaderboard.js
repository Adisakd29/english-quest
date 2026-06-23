const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');

const router = express.Router();
const TOP_LIMIT = 50;

function toEntry(row) {
  return {
    rank: Number(row.rank),
    username: row.username,
    avatar: row.avatar,
    exp: row.exp,
    level: getLevelInfo(row.exp).level,
  };
}

router.get('/', authRequired, async (req, res) => {
  try {
    const topResult = await pool.query(
      `SELECT id, username, avatar, exp, RANK() OVER (ORDER BY exp DESC) AS rank
       FROM users
       ORDER BY exp DESC
       LIMIT $1`,
      [TOP_LIMIT]
    );

    const top = topResult.rows.map((row) => ({ ...toEntry(row), isMe: row.id === req.userId }));
    let me = top.find((r) => r.isMe) || null;

    if (!me) {
      const meResult = await pool.query(
        `SELECT username, avatar, exp, rank FROM (
           SELECT id, username, avatar, exp, RANK() OVER (ORDER BY exp DESC) AS rank
           FROM users
         ) ranked WHERE id = $1`,
        [req.userId]
      );
      if (meResult.rows[0]) {
        me = { ...toEntry(meResult.rows[0]), isMe: true };
      }
    }

    res.json({ top, me });
  } catch (err) {
    console.error('[leaderboard]', err);
    res.status(500).json({ error: 'โหลดอันดับไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
