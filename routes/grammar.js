const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { GRAMMAR_CHAPTERS } = require('../data/grammar');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const events = require('../services/events');

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

/*
  การทำแบบฝึกแต่ละครั้ง (attempt) เก็บฝั่งเซิร์ฟเวอร์:
  - ตรวจทีละข้อเพื่ออธิบายทันที (POST /:id/check) และ "ล็อกคำตอบแรก" ของแต่ละข้อ
  - ส่งผล (POST /:id/submit) ให้คะแนนจากคำตอบที่ล็อกไว้ — ไม่เชื่อคำตอบที่หน้าเว็บส่งมา
    (ไม่งั้นดูเฉลยทีละข้อแล้วส่งคำตอบใหม่ทั้งชุด = ได้คะแนนเต็ม/EXP ทุกครั้ง)
  เก็บในหน่วยความจำ (หมดอายุ 2 ชม.) — เซิร์ฟเวอร์รีสตาร์ต = เริ่มแบบฝึกใหม่
*/
const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5000;
const quizAttempts = new Map();
function createAttempt(userId, chapterId, mode, count) {
  const now = Date.now();
  for (const [k, v] of quizAttempts) { if (now - v.createdAt > ATTEMPT_TTL_MS) quizAttempts.delete(k); }
  while (quizAttempts.size >= MAX_ATTEMPTS) quizAttempts.delete(quizAttempts.keys().next().value);
  const id = crypto.randomBytes(16).toString('hex');
  quizAttempts.set(id, { userId, chapterId, mode, answers: new Array(count).fill(undefined), createdAt: now });
  return id;
}
function getAttempt(id, userId, chapterId) {
  const a = quizAttempts.get(String(id || ''));
  if (!a || a.userId !== userId || a.chapterId !== chapterId || Date.now() - a.createdAt > ATTEMPT_TTL_MS) return null;
  return a;
}
// เทียบคำที่พิมพ์ (Fill in the blank) กับตัวเลือก: ไม่สนตัวพิมพ์/ช่องว่าง/เครื่องหมายท้าย
const norm = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[.!?,]+$/g, '').replace(/\s+/g, ' ').trim();

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


/* ==========================================================
   GET /grammar/path — Grammar Learning Path
   จัด 16 บทเป็นขั้นตามระดับ โดยใช้ระดับความยากของข้อสอบที่มีอยู่แล้ว
   (การจับคู่ความยาก -> CEFR เดียวกับแบบทดสอบวัดระดับ: basic=A2, intermediate=B1, advanced=B2, expert=C1)
   ต่อบทในแต่ละขั้น: จำนวนข้อ · เวลาโดยประมาณ · คะแนนดีที่สุด · ผ่าน (>= 80%) · Mastery (ความแม่นยำจริงของบทนั้น)
   ========================================================== */
const GRAMMAR_STAGES = [
  { mode: 'basic', level: 'A1–A2', title: 'พื้นฐาน', en: 'Fundamentals' },
  { mode: 'intermediate', level: 'B1', title: 'ระดับกลาง', en: 'Intermediate' },
  { mode: 'advanced', level: 'B2', title: 'ระดับกลางค่อนสูง', en: 'Upper-intermediate' },
  { mode: 'expert', level: 'C1', title: 'ระดับสูง', en: 'Advanced' },
  { mode: 'toeic', level: 'TOEIC', title: 'เตรียมสอบ TOEIC', en: 'Exam practice' },
  { mode: 'toefl', level: 'TOEFL', title: 'เตรียมสอบ TOEFL', en: 'Exam practice' },
];
const PLACEMENT_TO_STAGE = { 'Pre-A1': 'basic', A1: 'basic', A2: 'basic', B1: 'intermediate', B2: 'advanced', C1: 'expert' };
const PASS_RATE = 0.8;
const MASTERY_MIN = 5;

router.get('/path', authRequired, async (req, res) => {
  try {
    const [prog, mastery, placementRes] = await Promise.all([
      pool.query('SELECT chapter_id, mode, quiz_score, quiz_total FROM grammar_progress WHERE user_id = $1', [req.userId]),
      pool.query(
        `SELECT split_part(item_id, ':', 1) AS chapter_id, COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE correct)::int AS correct
           FROM answer_events WHERE user_id = $1 AND skill = 'grammar' GROUP BY 1`, [req.userId]
      ),
      pool.query(
        `SELECT result->>'grammar' AS grammar FROM placement_attempts
          WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`, [req.userId]
      ),
    ]);
    const best = {};
    prog.rows.forEach((r) => { best[`${r.chapter_id}|${r.mode}`] = r; });
    const masteryBy = Object.fromEntries(mastery.rows.map((r) => [r.chapter_id, r]));

    const stages = GRAMMAR_STAGES.map((st) => {
      const chapters = GRAMMAR_CHAPTERS.filter((c) => (c.quiz[st.mode] || []).length > 0).map((c) => {
        const questions = c.quiz[st.mode].length;
        const b = best[`${c.id}|${st.mode}`];
        const score = b ? b.quiz_score : 0;
        const total = b ? b.quiz_total : questions;
        const m = masteryBy[c.id];
        return {
          id: c.id, num: c.num, title: c.title, icon: c.icon,
          questions,
          // เวลาโดยประมาณ: ขั้นพื้นฐานรวมอ่านบทเรียน (~45 วิ/หัวข้อ) · ทุกขั้น ~30 วิ/ข้อ
          minutes: Math.max(3, Math.ceil((st.mode === 'basic' ? c.sections.length * 0.75 : 1) + questions * 0.5)),
          bestScore: score, total,
          percent: total ? Math.round((score / total) * 100) : 0,
          attempted: Boolean(b),
          passed: Boolean(b) && total > 0 && score / total >= PASS_RATE,
          mastery: m && m.attempts >= MASTERY_MIN ? Math.round((m.correct / m.attempts) * 100) : null,
        };
      });
      const passed = chapters.filter((c) => c.passed).length;
      return { ...st, chapters, passed, total: chapters.length };
    });

    // ขั้นที่แนะนำ: จากผลวัดระดับแกรมม่า (ถ้ามี) ไม่งั้นขั้นแรกที่ยังผ่านไม่ครบ
    const placed = placementRes.rows[0] && PLACEMENT_TO_STAGE[placementRes.rows[0].grammar];
    const firstOpen = stages.find((st) => st.passed < st.total && !['toeic', 'toefl'].includes(st.mode));
    const recommendedMode = (placed && stages.find((st) => st.mode === placed && st.passed < st.total) ? placed : null)
      || (firstOpen ? firstOpen.mode : 'basic');
    const rec = stages.find((st) => st.mode === recommendedMode);
    const nextChapter = rec.chapters.find((c) => !c.passed) || null;
    res.json({
      stages, recommendedMode,
      next: nextChapter ? { chapterId: nextChapter.id, title: nextChapter.title, icon: nextChapter.icon, mode: recommendedMode, level: rec.level } : null,
      placementBased: Boolean(placed),
    });
  } catch (err) {
    console.error('[grammar/path]', err);
    res.status(500).json({ error: 'โหลดเส้นทางแกรมม่าไม่สำเร็จ' });
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
  const attemptId = createAttempt(req.userId, chapter.id, mode, questions.length);
  // พิมพ์คำตอบเองได้ (Fill in the blank) เมื่อข้อมีช่องว่างและทุกตัวเลือกเป็นคำเดียว
  quiz.forEach((x, i) => {
    const q = questions[i];
    x.typeable = /_{2,}/.test(q.question) && q.choices.every((c) => !/\s/.test(String(c).trim()));
  });
  res.json({ chapterId: chapter.id, title: chapter.title, mode, quiz, attemptId });
});


/* ==========================================================
   POST /grammar/:id/check { attemptId, index, choice | text }
   ตรวจทีละข้อ + คำอธิบายทันที · คำตอบแรกของแต่ละข้อถูกล็อก (เปลี่ยนไม่ได้)
   ========================================================== */
router.post('/:id/check', authRequired, (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });
  const { attemptId, index, choice, text } = req.body || {};
  const a = getAttempt(attemptId, req.userId, chapter.id);
  if (!a) return res.status(410).json({ error: 'แบบฝึกนี้หมดเวลาแล้ว กรุณาเริ่มใหม่', code: 'ATTEMPT_EXPIRED' });
  const questions = getQuizForMode(chapter, a.mode);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= questions.length) return res.status(400).json({ error: 'ข้อไม่ถูกต้อง' });
  const q = questions[i];
  let typedMatched = null;
  if (a.answers[i] === undefined) {
    if (typeof text === 'string') {
      const t = norm(text).slice(0, 60);
      const hit = q.choices.findIndex((c) => norm(c) === t);
      a.answers[i] = hit >= 0 ? hit : -1;         // -1 = พิมพ์มาไม่ตรงตัวเลือกใด (ผิด)
      typedMatched = hit >= 0;
    } else if (choice === null || (Number.isInteger(choice) && choice >= 0 && choice < q.choices.length)) {
      a.answers[i] = choice;                      // null = ข้าม
    } else {
      return res.status(400).json({ error: 'คำตอบไม่ถูกต้อง' });
    }
  }
  const chosen = a.answers[i];
  res.json({
    index: i, correct: chosen === q.correctIndex, chosenIndex: chosen === -1 ? null : chosen,
    correctIndex: q.correctIndex, correctAnswer: q.choices[q.correctIndex], explain: q.explain, typedMatched,
  });
});

router.post('/:id/submit', authRequired, async (req, res) => {
  const chapter = GRAMMAR_CHAPTERS.find((c) => c.id === req.params.id);
  if (!chapter) return res.status(404).json({ error: 'ไม่พบบทเรียนนี้' });

  // ให้คะแนนจากคำตอบที่ล็อกไว้ใน attempt เท่านั้น (ข้อที่ไม่ได้ตอบ = ไม่ได้คะแนน)
  const attempt = getAttempt((req.body || {}).attemptId, req.userId, chapter.id);
  if (!attempt) {
    return res.status(410).json({ error: 'แบบฝึกนี้หมดเวลาแล้ว กรุณาเริ่มใหม่', code: 'ATTEMPT_EXPIRED' });
  }
  const { mode } = attempt;
  const questions = getQuizForMode(chapter, mode);
  if (!questions || questions.length === 0) {
    return res.status(404).json({ error: 'บทนี้ยังไม่มีข้อสอบโหมดนี้' });
  }
  const answers = attempt.answers.map((v) => (v === undefined || v === -1 ? null : v));
  quizAttempts.delete((req.body || {}).attemptId); // ส่งได้ครั้งเดียว

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

    // บันทึกทุกคำตอบลง answer_events (ฐานของ My Mistakes/Mastery)
    // item_id = chapterId:questionIndex เพื่ออ้างกลับไปข้อเดิมได้
    for (const r of results) {
      await client.query(
        'INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, $2, $3, $4, $5)',
        [req.userId, 'grammar', `${chapter.id}:${r.index}`, null, r.correct]
      );
    }

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
    events.recordRound(req.userId, `grammar:${(req.body || {}).attemptId}`, { correct: score, total });
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
