const express = require('express');
const pool = require('../config/db');
const { GRAMMAR_CHAPTERS } = require('../data/grammar');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');

const router = express.Router();

// EXP ที่ได้จากการทำข้อสอบ (ตามจำนวนข้อที่ถูก)
const EXP_PER_CORRECT = 8;
const EXP_PERFECT_BONUS = 20; // โบนัสถ้าตอบถูกหมด

// GET /api/grammar → รายการบท (สรุป ไม่รวมเนื้อหาละเอียด)
router.get('/', authRequired, async (req, res) => {
  try {
    const progressResult = await pool.query(
      'SELECT chapter_id, quiz_completed, quiz_score, quiz_total FROM grammar_progress WHERE user_id = $1',
      [req.userId]
    );
    const progressByChapter = {};
    for (const row of progressResult.rows) {
      progressByChapter[row.chapter_id] = {
        completed: row.quiz_completed,
        score: row.quiz_score,
        total: row.quiz_total,
      };
    }
    const chapters = GRAMMAR_CHAPTERS.map((c) => ({
      id: c.id,
      num: c.num,
      title: c.title,
      icon: c.icon,
      color: c.color,
      intro: c.intro,
      sectionCount: c.sections.length,
      quizCount: c.quiz.length,
      progress: progressByChapter[c.id] || { completed: false, score: 0, total: c.quiz.length },
    }));
    res.json({ chapters });
  } catch (err) {
    console.error('[grammar/list]', err);
    res.status(500).json({ error: 'โหลดรายการบทเรียนไม่สำเร็จ' });
  }
});

// GET /api/grammar/:id → เนื้อหาละเอียดของบทเดียว
router.get('/:id', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) {
    return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });
  }
  try {
    const progressResult = await pool.query(
      'SELECT quiz_completed, quiz_score, quiz_total FROM grammar_progress WHERE user_id = $1 AND chapter_id = $2',
      [req.userId, chapter.id]
    );
    const progress = progressResult.rows[0] || null;
    res.json({
      chapter: {
        id: chapter.id,
        num: chapter.num,
        title: chapter.title,
        icon: chapter.icon,
        color: chapter.color,
        intro: chapter.intro,
        sections: chapter.sections,
        quizCount: chapter.quiz.length,
      },
      progress,
    });
  } catch (err) {
    console.error('[grammar/detail]', err);
    res.status(500).json({ error: 'โหลดบทเรียนไม่สำเร็จ' });
  }
});

// GET /api/grammar/:id/quiz → คำถามในข้อสอบท้ายบท
router.get('/:id/quiz', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) {
    return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });
  }
  // ส่งข้อสอบไปโดยไม่ใส่ correctIndex กันโกง
  const quiz = chapter.quiz.map((q, i) => ({
    index: i,
    question: q.question,
    choices: q.choices,
  }));
  res.json({ chapterId: chapter.id, title: chapter.title, quiz });
});

// POST /api/grammar/:id/submit → ส่งคำตอบข้อสอบ, ตรวจ, ให้ EXP
router.post('/:id/submit', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) {
    return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });
  }
  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== chapter.quiz.length) {
    return res.status(400).json({ error: 'คำตอบไม่ครบทุกข้อ' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ตรวจคำตอบ
    const results = chapter.quiz.map((q, i) => ({
      index: i,
      question: q.question,
      choices: q.choices,
      correctIndex: q.correctIndex,
      chosenIndex: answers[i],
      correct: answers[i] === q.correctIndex,
      explain: q.explain,
    }));
    const score = results.filter((r) => r.correct).length;
    const total = chapter.quiz.length;
    const perfect = score === total;

    // ตรวจว่าเคยทำข้อสอบบทนี้แล้วหรือยัง
    const existingRes = await client.query(
      'SELECT quiz_completed, quiz_score FROM grammar_progress WHERE user_id = $1 AND chapter_id = $2',
      [req.userId, chapter.id]
    );
    const existing = existingRes.rows[0];
    const previousBest = existing ? existing.quiz_score : 0;

    // ให้ EXP เฉพาะถ้าทำได้ดีกว่าเดิม (กันฟาร์ม EXP)
    let gainedExp = 0;
    if (!existing || score > previousBest) {
      const scoreImprovement = existing ? score - previousBest : score;
      gainedExp = scoreImprovement * EXP_PER_CORRECT;
      // โบนัสสำหรับตอบครบครั้งแรก
      if (perfect && (!existing || existing.quiz_score < total)) {
        gainedExp += EXP_PERFECT_BONUS;
      }
    }

    // บันทึกความคืบหน้า
    if (existing) {
      await client.query(
        `UPDATE grammar_progress
         SET quiz_completed = TRUE,
             quiz_score = GREATEST(quiz_score, $1),
             quiz_total = $2,
             last_attempted = NOW()
         WHERE user_id = $3 AND chapter_id = $4`,
        [score, total, req.userId, chapter.id]
      );
    } else {
      await client.query(
        `INSERT INTO grammar_progress (user_id, chapter_id, quiz_completed, quiz_score, quiz_total, last_attempted)
         VALUES ($1, $2, TRUE, $3, $4, NOW())`,
        [req.userId, chapter.id, score, total]
      );
    }

    // ให้ EXP
    let levelInfo = null;
    let leveledUp = false;
    if (gainedExp > 0) {
      const userRes = await client.query('SELECT exp FROM users WHERE id = $1', [req.userId]);
      const beforeExp = userRes.rows[0].exp;
      const beforeLevel = getLevelInfo(beforeExp);
      const afterExp = beforeExp + gainedExp;
      const afterLevel = getLevelInfo(afterExp);
      await client.query('UPDATE users SET exp = $1 WHERE id = $2', [afterExp, req.userId]);
      await client.query(
        'INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)',
        [req.userId, gainedExp, 'grammar_quiz']
      );
      levelInfo = afterLevel;
      leveledUp = afterLevel.level > beforeLevel.level;
    } else {
      const userRes = await client.query('SELECT exp FROM users WHERE id = $1', [req.userId]);
      levelInfo = getLevelInfo(userRes.rows[0].exp);
    }

    await client.query('COMMIT');
    res.json({
      score,
      total,
      perfect,
      results,
      gainedExp,
      previousBest,
      levelInfo,
      leveledUp,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[grammar/submit]', err);
    res.status(500).json({ error: 'ส่งคำตอบไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

module.exports = router;
