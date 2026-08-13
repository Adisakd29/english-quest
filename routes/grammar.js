const express = require('express');
const pool = require('../config/db');
const { GRAMMAR_CHAPTERS } = require('../data/grammar');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');

const router = express.Router();

// โหมดข้อสอบ 6 แบบ เรียงจากง่ายไปยาก + สายสอบมาตรฐาน
const VALID_MODES = ['basic', 'intermediate', 'advanced', 'expert', 'toeic', 'toefl'];

// EXP ต่อการตอบถูก 1 ข้อ (ต่างกันตามระดับยาก)
const EXP_PER_CORRECT = {
  basic: 6, intermediate: 10, advanced: 15, expert: 22, toeic: 18, toefl: 20,
};
const EXP_PERFECT_BONUS = {
  basic: 15, intermediate: 25, advanced: 40, expert: 60, toeic: 50, toefl: 55,
};

function getQuizForMode(chapter, mode) {
  if (!chapter.quiz) return null;
  if (Array.isArray(chapter.quiz)) {
    return mode === 'basic' ? chapter.quiz : null;
  }
  return chapter.quiz[mode] || null;
}

function getAvailableModes(chapter) {
  if (!chapter.quiz) return [];
  if (Array.isArray(chapter.quiz)) return ['basic'];
  return VALID_MODES.filter((m) => Array.isArray(chapter.quiz[m]) && chapter.quiz[m].length > 0);
}

router.get('/', authRequired, async (req, res) => {
  try {
    const progressResult = await pool.query(
      'SELECT chapter_id, mode, quiz_completed, quiz_score, quiz_total FROM grammar_progress WHERE user_id = $1',
      [req.userId]
    );
    const progressByChapter = {};
    for (const row of progressResult.rows) {
      if (!progressByChapter[row.chapter_id]) progressByChapter[row.chapter_id] = {};
      progressByChapter[row.chapter_id][row.mode] = {
        completed: row.quiz_completed,
        score: row.quiz_score,
        total: row.quiz_total,
      };
    }

    const chapters = GRAMMAR_CHAPTERS.map((c) => {
      const modes = getAvailableModes(c);
      const chapterProgress = progressByChapter[c.id] || {};
      let perfectCount = 0;
      let anyCompleted = false;
      modes.forEach((m) => {
        const p = chapterProgress[m];
        if (p && p.completed) {
          anyCompleted = true;
          if (p.score === p.total && p.total > 0) perfectCount += 1;
        }
      });
      return {
        id: c.id, num: c.num, title: c.title, icon: c.icon, color: c.color,
        intro: c.intro,
        sectionCount: c.sections.length,
        modes, modeCount: modes.length,
        perfectCount, anyCompleted,
      };
    });
    res.json({ chapters });
  } catch (err) {
    console.error('[grammar/list]', err);
    res.status(500).json({ error: 'โหลดรายการบทเรียนไม่สำเร็จ' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });

  try {
    const progressResult = await pool.query(
      'SELECT mode, quiz_completed, quiz_score, quiz_total FROM grammar_progress WHERE user_id = $1 AND chapter_id = $2',
      [req.userId, chapter.id]
    );
    const progressByMode = {};
    for (const row of progressResult.rows) {
      progressByMode[row.mode] = {
        completed: row.quiz_completed,
        score: row.quiz_score,
        total: row.quiz_total,
      };
    }

    const modes = getAvailableModes(chapter).map((mode) => {
      const questions = getQuizForMode(chapter, mode);
      return { mode, count: questions.length, progress: progressByMode[mode] || null };
    });

    res.json({
      chapter: {
        id: chapter.id, num: chapter.num, title: chapter.title,
        icon: chapter.icon, color: chapter.color, intro: chapter.intro,
        sections: chapter.sections,
      },
      modes,
    });
  } catch (err) {
    console.error('[grammar/detail]', err);
    res.status(500).json({ error: 'โหลดบทเรียนไม่สำเร็จ' });
  }
});

router.get('/:id/quiz', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });

  const mode = req.query.mode || 'basic';
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: 'โหมดข้อสอบไม่ถูกต้อง' });
  }

  const questions = getQuizForMode(chapter, mode);
  if (!questions || questions.length === 0) {
    return res.status(404).json({ error: 'บทนี้ยังไม่มีข้อสอบโหมดนี้' });
  }

  const quiz = questions.map((q, i) => ({
    index: i,
    question: q.question,
    choices: q.choices,
    passage: q.passage || null,
    passageTitle: q.passageTitle || null,
    groupId: q.groupId || null,
  }));
  res.json({ chapterId: chapter.id, title: chapter.title, mode, quiz });
});

router.post('/:id/submit', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });

  const { mode = 'basic', answers } = req.body || {};
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: 'โหมดข้อสอบไม่ถูกต้อง' });
  }
  const questions = getQuizForMode(chapter, mode);
  if (!questions || questions.length === 0) {
    return res.status(404).json({ error: 'บทนี้ยังไม่มีข้อสอบโหมดนี้' });
  }
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return res.status(400).json({ error: 'คำตอบไม่ครบทุกข้อ' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const results = questions.map((q, i) => ({
      index: i,
      question: q.question,
      passage: q.passage || null,
      choices: q.choices,
      correctIndex: q.correctIndex,
      chosenIndex: answers[i],
      correct: answers[i] === q.correctIndex,
      explain: q.explain,
    }));
    const score = results.filter((r) => r.correct).length;
    const total = questions.length;
    const perfect = score === total;

    const existingRes = await client.query(
      'SELECT quiz_completed, quiz_score FROM grammar_progress WHERE user_id = $1 AND chapter_id = $2 AND mode = $3',
      [req.userId, chapter.id, mode]
    );
    const existing = existingRes.rows[0];
    const previousBest = existing ? existing.quiz_score : 0;

    let gainedExp = 0;
    const expPerCorrect = EXP_PER_CORRECT[mode] || EXP_PER_CORRECT.basic;
    const perfectBonus = EXP_PERFECT_BONUS[mode] || EXP_PERFECT_BONUS.basic;

    if (!existing || score > previousBest) {
      const scoreImprovement = existing ? score - previousBest : score;
      gainedExp = scoreImprovement * expPerCorrect;
      if (perfect && (!existing || existing.quiz_score < total)) {
        gainedExp += perfectBonus;
      }
    }

    if (existing) {
      await client.query(
        `UPDATE grammar_progress
         SET quiz_completed = TRUE,
             quiz_score = GREATEST(quiz_score, $1),
             quiz_total = $2,
             last_attempted = NOW()
         WHERE user_id = $3 AND chapter_id = $4 AND mode = $5`,
        [score, total, req.userId, chapter.id, mode]
      );
    } else {
      await client.query(
        `INSERT INTO grammar_progress (user_id, chapter_id, mode, quiz_completed, quiz_score, quiz_total, last_attempted)
         VALUES ($1, $2, $3, TRUE, $4, $5, NOW())`,
        [req.userId, chapter.id, mode, score, total]
      );
    }

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
        [req.userId, gainedExp, `grammar_quiz_${mode}`]
      );
      levelInfo = afterLevel;
      leveledUp = afterLevel.level > beforeLevel.level;
    } else {
      const userRes = await client.query('SELECT exp FROM users WHERE id = $1', [req.userId]);
      levelInfo = getLevelInfo(userRes.rows[0].exp);
    }

    await client.query('COMMIT');
    res.json({
      score, total, perfect, mode, results, gainedExp, previousBest,
      levelInfo, leveledUp,
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
