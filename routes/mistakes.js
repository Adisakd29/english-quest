const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const wordStore = require('../utils/wordStore');

const router = express.Router();

/* ==========================================================
   GET /mistakes/mastery — % ความแม่นยำแยก skill + level
   คำนวณจาก answer_events (แยกจาก EXP ที่เป็น gamification)
   ========================================================== */
router.get('/mastery', authRequired, async (req, res) => {
  try {
    // รวมผลตอบของ vocab แยกตามระดับ + grammar รวม
    const { rows } = await pool.query(
      `SELECT skill, level,
              COUNT(*)::int AS attempts,
              SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS correct
         FROM answer_events
        WHERE user_id = $1
        GROUP BY skill, level`,
      [req.userId]
    );

    // จัดรูปแบบ: vocab แยกตามระดับ, grammar รวมเป็นก้อนเดียว
    const vocab = {};
    let grammarAttempts = 0;
    let grammarCorrect = 0;
    let listenAttempts = 0;
    let listenCorrect = 0;

    for (const r of rows) {
      if (r.skill === 'vocab' && r.level) {
        vocab[r.level] = {
          attempts: r.attempts,
          correct: r.correct,
          accuracy: Math.round((r.correct / r.attempts) * 100),
        };
      } else if (r.skill === 'grammar') {
        grammarAttempts += r.attempts;
        grammarCorrect += r.correct;
      } else if (r.skill === 'listening') {
        listenAttempts += r.attempts;
        listenCorrect += r.correct;
      }
    }

    const grammar = grammarAttempts > 0
      ? { attempts: grammarAttempts, correct: grammarCorrect,
          accuracy: Math.round((grammarCorrect / grammarAttempts) * 100) }
      : null;

    const listening = listenAttempts > 0
      ? { attempts: listenAttempts, correct: listenCorrect,
          accuracy: Math.round((listenCorrect / listenAttempts) * 100) }
      : null;

    res.json({ vocab, grammar, listening });
  } catch (err) {
    console.error('[mistakes/mastery]', err);
    res.status(500).json({ error: 'โหลดความแม่นยำไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /mistakes — คำศัพท์ที่ตอบผิดบ่อย (ผิดมากกว่าถูก)
   นับเฉพาะ skill=vocab เพราะโยงกับคำที่ทบทวนได้
   ========================================================== */
router.get('/', authRequired, async (req, res) => {
  try {
    await wordStore.ready();
    // นับถูก/ผิดต่อคำ แล้วเอาเฉพาะคำที่ "ผิด >= ถูก" และเคยผิดอย่างน้อย 1
    const { rows } = await pool.query(
      `SELECT item_id, level,
              SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS correct,
              SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END)::int AS wrong,
              MAX(created_at) AS last_seen
         FROM answer_events
        WHERE user_id = $1 AND skill = 'vocab'
        GROUP BY item_id, level
        HAVING SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) > 0
           AND SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) >= SUM(CASE WHEN correct THEN 1 ELSE 0 END)
        ORDER BY wrong DESC, last_seen DESC
        LIMIT 50`,
      [req.userId]
    );

    const items = rows.map((r) => {
      const w = wordStore.findWord(null, r.item_id) // ค้นด้วย ID — ระดับในประวัติอาจเป็นระดับเก่าที่ถูกแก้ตามต้นฉบับแล้ว;
      return w ? {
        id: w.id, word: w.word, pos: w.pos, category: w.category, level: w.level,
        wrong: r.wrong, correct: r.correct,
      } : null;
    }).filter(Boolean);

    res.json({ count: items.length, words: items });
  } catch (err) {
    console.error('[mistakes/list]', err);
    res.status(500).json({ error: 'โหลดคำที่ต้องแก้ไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /mistakes/practice-session — ชุดทบทวนจากคำที่ผิดบ่อย
   คืน word ids (content words) ให้ frontend เอาไปสร้าง quiz
   ========================================================== */
router.get('/practice-session', authRequired, async (req, res) => {
  try {
    await wordStore.ready();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 30);

    const { rows } = await pool.query(
      `SELECT item_id, level,
              SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END)::int AS wrong
         FROM answer_events
        WHERE user_id = $1 AND skill = 'vocab'
        GROUP BY item_id, level
        HAVING SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) > 0
        ORDER BY wrong DESC, MAX(created_at) DESC
        LIMIT $2`,
      [req.userId, limit]
    );

    const words = rows
      .filter((r) => wordStore.isContentWord(r.item_id))
      .map((r) => {
        const w = wordStore.findWord(null, r.item_id) // ค้นด้วย ID — ระดับในประวัติอาจเป็นระดับเก่าที่ถูกแก้ตามต้นฉบับแล้ว;
        return w ? { id: w.id, word: w.word, pos: w.pos, category: w.category, level: w.level } : null;
      })
      .filter(Boolean);

    // เลือกระดับที่มีคำผิดเยอะสุด เพื่อให้ frontend เปิด session ระดับนั้น
    const levelCount = {};
    words.forEach((w) => { levelCount[w.level] = (levelCount[w.level] || 0) + 1; });
    const topLevel = Object.entries(levelCount).sort((a, b) => b[1] - a[1])[0];

    res.json({
      count: words.length,
      words,
      suggestedLevel: topLevel ? topLevel[0] : null,
    });
  } catch (err) {
    console.error('[mistakes/practice-session]', err);
    res.status(500).json({ error: 'สร้างชุดทบทวนไม่สำเร็จ' });
  }
});

module.exports = router;
