const express = require('express');
const events = require('../services/events');
const crypto = require('crypto');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const wordStore = require('../utils/wordStore');
const { getContent } = require('../utils/vocabContent');
const { getKnownThai } = require('../utils/thai');
const { GRAMMAR_CHAPTERS } = require('../data/grammar');
const placement = require('../utils/placement');
const A = require('../utils/assessment');
const { getUserPathState, unitTitle } = require('./path');
const { getLevelInfo } = require('../utils/leveling');

const router = express.Router();
router.use(authRequired);

const ATTEMPT_TTL_MIN = 60;               // ต้องส่งภายใน 60 นาทีหลังเริ่ม
const EXP_FIRST_PASS = { unit: 30, boss: 100 }; // ให้ EXP เฉพาะครั้งแรกที่ผ่าน (กันปั๊ม)
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

const rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

function publicQuestions(questions) {
  return questions.map((q, i) => ({ index: i, skill: q.skill, kind: q.kind, prompt: q.prompt, choices: q.choices }));
}

// ข้อมูลคำ + เนื้อหาพจนานุกรม สำหรับสร้างข้อสอบ
async function loadWordData(ids) {
  await wordStore.ready();
  const content = await getContent(ids); // ฐาน Oxford หรือชุดเดิม ตามแหล่งที่ใช้อยู่
  return ids.map((id) => {
    const w = wordStore.findWord(id.slice(0, 2), id);
    if (!w) return null;
    const c = content.get(id) || {};
    return {
      id: w.id, word: w.word, level: w.level, category: w.category,
      definition: c.definition || null, synonyms: c.synonyms || [], senseCount: c.senseCount,
    };
  }).filter(Boolean);
}

// ถ้ามีการสอบชุดเดิมค้างอยู่และยังไม่หมดเวลา คืนชุดเดิม (กันสุ่มใหม่หาข้อง่าย)
async function findInProgress(userId, kind, ref) {
  const { rows } = await pool.query(
    `SELECT id, questions FROM assessments
      WHERE user_id = $1 AND kind = $2 AND ref = $3 AND status = 'in_progress'
        AND created_at > NOW() - make_interval(mins => $4::int)
      ORDER BY created_at DESC LIMIT 1`,
    [userId, kind, ref, ATTEMPT_TTL_MIN]
  );
  return rows[0] || null;
}

async function createAttempt(userId, kind, ref, questions) {
  const { rows } = await pool.query(
    'INSERT INTO assessments (user_id, kind, ref, questions) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, kind, ref, JSON.stringify(questions)]
  );
  return String(rows[0].id);
}

/* ==========================================================
   POST /assessments/unit/:unitId/start — เริ่ม Unit Test
   ========================================================== */
router.post('/unit/:unitId/start', async (req, res) => {
  try {
    const unitId = String(req.params.unitId || '');
    if (!/^[A-C][12]-[a-z]+-\d+$/.test(unitId)) return res.status(400).json({ error: 'รหัส Unit ไม่ถูกต้อง' });

    const { units, levels } = await getUserPathState(req.userId);
    const level = unitId.slice(0, 2);
    const unit = (units[level] || []).find((u) => u.id === unitId);
    if (!unit) return res.status(404).json({ error: 'ไม่พบ Unit นี้' });
    const state = levels.find((l) => l.level === level).units.find((u) => u.id === unitId);
    if (state.status === 'locked') return res.status(403).json({ error: 'Unit นี้ยังล็อกอยู่' });

    const existing = await findInProgress(req.userId, 'unit', unitId);
    if (existing) {
      return res.json({ attemptId: String(existing.id), resumed: true, ...unitTitle(unit), questions: publicQuestions(existing.questions) });
    }

    // ตัวลวง: คำอื่นในระดับเดียวกัน (สุ่มมาจำนวนหนึ่ง)
    const otherIds = A.shuffle(units[level].flatMap((u) => u.wordIds).filter((id) => !unit.wordIds.includes(id)), rng).slice(0, 60);
    const [targets, decoys] = await Promise.all([loadWordData(unit.wordIds), loadWordData(otherIds)]);
    const thai = await getKnownThai(pool, [...targets, ...decoys]);
    const questions = A.buildVocabQuestions(targets, decoys, thai, A.UNIT_TEST_SIZE, rng);

    if (questions.length < A.MIN_QUESTIONS) {
      return res.status(409).json({ error: 'ยังสร้างข้อสอบ Unit นี้ไม่ได้ ลองฝึกคำใน Unit สักรอบก่อนนะ' });
    }
    const attemptId = await createAttempt(req.userId, 'unit', unitId, questions);
    res.json({ attemptId, resumed: false, ...unitTitle(unit), questions: publicQuestions(questions) });
  } catch (err) {
    console.error('[assessments/unit/start]', err);
    res.status(500).json({ error: 'เริ่มสอบไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /assessments/boss/:level/start — เริ่ม Boss Challenge
   ========================================================== */
router.post('/boss/:level/start', async (req, res) => {
  try {
    const level = String(req.params.level || '').toUpperCase();
    if (!LEVELS.includes(level)) return res.status(400).json({ error: 'ระดับไม่ถูกต้อง' });

    const { units, levels } = await getUserPathState(req.userId);
    const lv = levels.find((l) => l.level === level);
    if (lv.boss === 'locked') {
      return res.status(403).json({ error: 'ผ่าน Unit ในระดับนี้ให้ได้ 60% ก่อน แล้ว Boss จะปรากฏ' });
    }

    const existing = await findInProgress(req.userId, 'boss', level);
    if (existing) {
      return res.json({ attemptId: String(existing.id), resumed: true, title: `Boss ${level}`, questions: publicQuestions(existing.questions) });
    }

    const allIds = units[level].flatMap((u) => u.wordIds);
    const pick = A.shuffle(allIds, rng);
    const [targets, decoys] = await Promise.all([loadWordData(pick.slice(0, 40)), loadWordData(pick.slice(40, 100))]);
    const thai = await getKnownThai(pool, [...targets, ...decoys]);
    const vocab = A.buildVocabQuestions(targets, decoys, thai, A.BOSS_VOCAB, rng);
    const grammar = placement.buildGrammarQuestions(GRAMMAR_CHAPTERS, rng, {
      modes: [A.BOSS_GRAMMAR_MODE[level]], perBand: A.BOSS_GRAMMAR,
    });
    const questions = A.shuffle([...vocab, ...grammar], rng);

    if (questions.length < A.MIN_QUESTIONS) {
      return res.status(409).json({ error: 'ยังสร้าง Boss Challenge ไม่ได้ ลองใหม่ภายหลัง' });
    }
    const attemptId = await createAttempt(req.userId, 'boss', level, questions);
    res.json({ attemptId, resumed: false, title: `Boss ${level}`, questions: publicQuestions(questions) });
  } catch (err) {
    console.error('[assessments/boss/start]', err);
    res.status(500).json({ error: 'เริ่ม Boss Challenge ไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /assessments/:id/submit — ส่งคำตอบ { answers: [...] }
   เซิร์ฟเวอร์ให้คะแนนเอง · ส่งได้ครั้งเดียว · EXP เฉพาะครั้งแรกที่ผ่าน
   ========================================================== */
router.post('/:id/submit', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'รหัสการสอบไม่ถูกต้อง' });
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!answers) return res.status(400).json({ error: 'ไม่พบคำตอบ' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT kind, ref, questions, status, created_at FROM assessments
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, req.userId]
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบการสอบนี้' }); }
    const at = rows[0];
    if (at.status !== 'in_progress') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'ส่งการสอบนี้ไปแล้ว' }); }
    if ((Date.now() - new Date(at.created_at).getTime()) / 60000 > ATTEMPT_TTL_MIN) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'หมดเวลาสอบแล้ว กรุณาเริ่มใหม่' });
    }
    if (answers.length !== at.questions.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ต้องตอบให้ครบ ${at.questions.length} ข้อ` });
    }

    const passRatio = at.kind === 'boss' ? A.BOSS_PASS : A.UNIT_PASS;
    const score = A.scoreAssessment(at.questions, answers, passRatio);

    // เคยผ่านมาก่อนไหม (EXP ให้เฉพาะครั้งแรก)
    const prev = await client.query(
      'SELECT 1 FROM assessments WHERE user_id = $1 AND kind = $2 AND ref = $3 AND passed = TRUE LIMIT 1',
      [req.userId, at.kind, at.ref]
    );
    const firstPass = score.passed && prev.rows.length === 0;
    const gainedExp = firstPass ? EXP_FIRST_PASS[at.kind] : 0;

    const result = { correct: score.correct, total: score.total, percent: score.percent, passed: score.passed, firstPass, gainedExp };
    await client.query(
      `UPDATE assessments SET status = 'completed', passed = $1, result = $2, completed_at = NOW() WHERE id = $3`,
      [score.passed, JSON.stringify(result), id]
    );

    // บันทึกทุกคำตอบลง answer_events → ป้อน Mastery และ My Mistakes
    for (let i = 0; i < at.questions.length; i++) {
      const q = at.questions[i];
      const itemId = q.skill === 'vocab' ? q.wordId : `${q.chapterId || 'grammar'}:${at.kind}`;
      await client.query(
        'INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, $2, $3, $4, $5)',
        [req.userId, q.skill, itemId, q.skill === 'vocab' ? q.level : null, score.perQuestion[i].correct]
      );
    }

    let levelInfo = null;
    if (gainedExp > 0) {
      const u = await client.query('UPDATE users SET exp = exp + $1 WHERE id = $2 RETURNING exp', [gainedExp, req.userId]);
      await client.query('INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)',
        [req.userId, gainedExp, at.kind === 'boss' ? 'boss_challenge' : 'unit_test']);
      levelInfo = getLevelInfo(u.rows[0].exp);
    }
    await client.query('COMMIT');
    events.recordRound(req.userId, `assessment:${id}`, { correct: score.correct, total: score.total });

    const review = at.questions.map((q, i) => ({
      prompt: q.prompt, choices: q.choices, kind: q.kind, skill: q.skill,
      correctIndex: q.correctIndex, chosen: score.perQuestion[i].chosen, correct: score.perQuestion[i].correct,
    }));
    res.json({ kind: at.kind, ref: at.ref, result, levelInfo, review });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[assessments/submit]', err);
    res.status(500).json({ error: 'ส่งคำตอบไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

module.exports = router;
