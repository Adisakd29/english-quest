const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const wordsData = require('../data/words.json');

const router = express.Router();
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

// optional auth: ถ้ามี token แนบมาก็จะ merge สถานะคำศัพท์ของผู้ใช้ ถ้าไม่มีก็ส่งแค่รายการคำ
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.userId;
    } catch (_err) {
      // token invalid/expired -> just treat as logged out
    }
  }
  next();
}

router.get('/levels', (_req, res) => {
  res.json({ counts: wordsData.counts });
});

router.get('/:level', optionalAuth, async (req, res) => {
  try {
    const level = (req.params.level || '').toUpperCase();
    if (!VALID_LEVELS.has(level)) {
      return res.status(400).json({ error: 'ระดับต้องเป็น A1, A2, B1 หรือ B2' });
    }

    const words = wordsData.levels[level];

    if (!req.userId) {
      return res.json({ level, total: words.length, words, progress: null });
    }

    const progressResult = await pool.query(
      'SELECT word_id, status, times_seen, times_correct FROM word_progress WHERE user_id = $1 AND level = $2',
      [req.userId, level]
    );
    const progressMap = {};
    for (const row of progressResult.rows) {
      progressMap[row.word_id] = row;
    }

    const merged = words.map((w) => ({
      ...w,
      status: progressMap[w.id] ? progressMap[w.id].status : 'new',
      timesSeen: progressMap[w.id] ? progressMap[w.id].times_seen : 0,
    }));

    const known = merged.filter((w) => w.status === 'known').length;
    const learning = merged.filter((w) => w.status === 'learning').length;

    res.json({
      level,
      total: words.length,
      words: merged,
      progress: { known, learning, newCount: words.length - known - learning },
    });
  } catch (err) {
    console.error('[words/:level]', err);
    res.status(500).json({ error: 'โหลดคำศัพท์ไม่สำเร็จ' });
  }
});

module.exports = router;
