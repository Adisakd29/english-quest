const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo, calcReviewExp } = require('../utils/leveling');
const wordsData = require('../data/words.json');

const router = express.Router();
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);

// จำนวนคำที่ "เล่นได้จริง" ในโหมดเลือกความหมาย (ไม่รวมคำไวยากรณ์อย่าง
// det/pron/prep ที่ไม่มีความหมายยืนเดี่ยว ๆ ชัดเจน) ใช้เป็นตัวหารเพื่อให้
// % ความก้าวหน้าไปถึง 100% ได้จริงเมื่อรู้ครบทุกคำที่เล่นได้
const CONTENT_COUNTS = {};
for (const lvl of VALID_LEVELS) {
  CONTENT_COUNTS[lvl] = (wordsData.levels[lvl] || []).filter((w) => CONTENT_CATEGORIES.has(w.category)).length;
}

function findWord(level, wordId) {
  const list = wordsData.levels[level] || [];
  return list.find((w) => w.id === wordId);
}

router.post('/review', authRequired, async (req, res) => {
  let client;
  try {
    const { wordId, level, known } = req.body || {};
    const lvl = (level || '').toUpperCase();

    if (!wordId || !VALID_LEVELS.has(lvl) || typeof known !== 'boolean') {
      return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
    }
    if (!findWord(lvl, wordId)) {
      return res.status(404).json({ error: 'ไม่พบคำศัพท์นี้' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT * FROM word_progress WHERE user_id = $1 AND word_id = $2',
      [req.userId, wordId]
    );
    const existing = existingResult.rows[0];
    // ใช้ ever_known (ติดถาวร) แทนสถานะปัจจุบัน เพื่อกันการกดตอบผิด-ถูกสลับ
    // ไปมาเพื่อรับโบนัส "รู้เป็นครั้งแรก" ซ้ำได้เรื่อย ๆ
    const isFirstTimeKnown = known && !(existing && existing.ever_known);
    const newStatus = known ? 'known' : 'learning';

    if (existing) {
      await client.query(
        `UPDATE word_progress
         SET status = $1, times_seen = times_seen + 1,
             times_correct = times_correct + $2, last_reviewed = NOW(),
             ever_known = ever_known OR $4
         WHERE id = $3`,
        [newStatus, known ? 1 : 0, existing.id, known]
      );
    } else {
      await client.query(
        `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known)
         VALUES ($1, $2, $3, $4, 1, $5, NOW(), $6)`,
        [req.userId, wordId, lvl, newStatus, known ? 1 : 0, known]
      );
    }

    const userResult = await client.query('SELECT exp FROM users WHERE id = $1', [req.userId]);
    const beforeExp = userResult.rows[0].exp;

    // ถ้าด่านนี้ "รู้แล้ว 100%" อยู่แล้ว (ทบทวนคำที่รู้หมดแล้วซ้ำ ๆ) จะไม่ได้
    // EXP เพิ่มอีก เพราะไม่มีอะไรใหม่ให้เรียนแล้ว กันการฟาร์ม EXP จากด่านที่
    // เรียนครบแล้ว
    const knownRowsResult = await client.query(
      'SELECT word_id FROM word_progress WHERE user_id = $1 AND level = $2 AND status = $3',
      [req.userId, lvl, 'known']
    );
    const knownContentCount = knownRowsResult.rows.filter((r) => {
      const w = findWord(lvl, r.word_id);
      return w && CONTENT_CATEGORIES.has(w.category);
    }).length;
    const levelAlreadyComplete = knownContentCount >= (CONTENT_COUNTS[lvl] || Infinity);

    const gained = levelAlreadyComplete ? 0 : calcReviewExp({ known, isFirstTimeKnown });
    const afterExp = beforeExp + gained;

    await client.query('UPDATE users SET exp = $1 WHERE id = $2', [afterExp, req.userId]);
    if (gained > 0) {
      await client.query(
        'INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)',
        [req.userId, gained, known ? 'card_known' : 'card_review']
      );
    }

    await client.query('COMMIT');

    const beforeLevel = getLevelInfo(beforeExp);
    const afterLevel = getLevelInfo(afterExp);

    res.json({
      gainedExp: gained,
      isFirstTimeKnown,
      status: newStatus,
      levelComplete: levelAlreadyComplete,
      leveledUp: afterLevel.level > beforeLevel.level,
      levelInfo: afterLevel,
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_rollbackErr) { /* ignore */ }
    }
    console.error('[progress/review]', err);
    res.status(500).json({ error: 'บันทึกผลไม่สำเร็จ ลองใหม่อีกครั้ง' });
  } finally {
    if (client) client.release();
  }
});

router.get('/summary', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT word_id, level, status FROM word_progress WHERE user_id = $1',
      [req.userId]
    );

    const summary = {};
    for (const lvl of VALID_LEVELS) {
      summary[lvl] = { known: 0, learning: 0, total: CONTENT_COUNTS[lvl] };
    }

    for (const row of result.rows) {
      if (!summary[row.level]) continue;
      // ข้ามแถวเก่าที่เป็นคำไวยากรณ์ (det/pron/prep ฯลฯ) ที่ผู้เล่นอาจตอบไว้
      // ก่อนหน้านี้ตั้งแต่ตอนที่ระบบยังไม่ตัดคำกลุ่มนี้ออกจากโหมดเกม —
      // ไม่งั้นยอด known จะเกินกว่า total ใหม่ที่นับเฉพาะคำที่เล่นได้จริง
      const wordEntry = findWord(row.level, row.word_id);
      if (!wordEntry || !CONTENT_CATEGORIES.has(wordEntry.category)) continue;
      if (row.status === 'known' || row.status === 'learning') {
        summary[row.level][row.status] += 1;
      }
    }

    for (const lvl of VALID_LEVELS) {
      const s = summary[lvl];
      s.newCount = Math.max(0, s.total - s.known - s.learning);
    }

    res.json({ summary });
  } catch (err) {
    console.error('[progress/summary]', err);
    res.status(500).json({ error: 'โหลดสรุปความก้าวหน้าไม่สำเร็จ' });
  }
});

module.exports = router;
