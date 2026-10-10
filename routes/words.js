const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const wordStore = require('../utils/wordStore');
const { getContent, WORD_ID_RE } = require('../utils/vocabContent');

const router = express.Router();
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);

// optional auth: ถ้ามี token แนบมาก็จะ merge สถานะคำศัพท์ของผู้ใช้ ถ้าไม่มีก็ส่งแค่รายการคำ
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.userId;
    } catch (_err) {
      // token invalid/expired -> treat as logged out
    }
  }
  next();
}

/*
  GET /words/content?ids=A1-0001,A1-0002 — เนื้อหาเสริมของคำ (IPA, ความหมาย, ตัวอย่าง, คำพ้อง)
  ดึงเฉพาะคำที่ต้องใช้ในรอบเล่น แทนการแนบไปกับ /words/:level ทั้งระดับ
  (กัน payload บวม — audit พบว่า /words/:level ใหญ่อยู่แล้ว)
  ⚠️ ต้องประกาศก่อน '/:level' ไม่งั้น Express จะจับ "content" เป็นชื่อระดับ
*/
const MAX_CONTENT_IDS = 60;
router.get('/content', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => WORD_ID_RE.test(s)) // รับเฉพาะรูปแบบ id ที่ถูกต้อง (ชุดใหม่ A1-S0001 / ชุดเดิม A1-0001)
      .slice(0, MAX_CONTENT_IDS);

    if (ids.length === 0) return res.json({ content: {} });

    const map = await getContent(ids);
    const content = {};
    map.forEach((c, id) => {
      content[id] = {
        ipa: c.ipa, definition: c.definition, example: c.example,
        synonyms: c.synonyms, reviewed: c.reviewed,
      };
    });
    res.json({ content });
  } catch (err) {
    // ตาราง/คอลัมน์ยังไม่พร้อม (เช่น migration ยังไม่รัน) → คืนว่าง ไม่ทำให้หน้าเล่นพัง
    console.error('[words/content]', err.message);
    res.json({ content: {} });
  }
});

router.get('/levels', async (_req, res) => {
  await wordStore.ready();
  const counts = {};
  for (const lvl of VALID_LEVELS) counts[lvl] = wordStore.getLevelWords(lvl).length;
  res.json({ counts });
});

router.get('/:level', optionalAuth, async (req, res) => {
  try {
    const level = (req.params.level || '').toUpperCase();
    if (!VALID_LEVELS.has(level)) {
      return res.status(400).json({ error: 'ระดับต้องเป็น A1, A2, B1, B2 หรือ C1' });
    }

    await wordStore.ready();
    const words = wordStore.getLevelWords(level);

    if (!req.userId) {
      return res.json({ level, total: words.length, words, progress: null });
    }

    // ?mode=listening -> สถานะจากความคืบหน้าโหมดฟัง (แยกจากโหมดอ่าน)
    const table = req.query.mode === 'listening' ? 'listening_progress' : 'word_progress';
    const progressResult = await pool.query(
      `SELECT word_id, status, times_seen, times_correct FROM ${table} WHERE user_id = $1 AND level = $2`,
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
