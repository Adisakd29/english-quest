const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const wordStore = require('../utils/wordStore');
const { getAllWithDefinition } = require('../utils/vocabContent');
const { GRAMMAR_CHAPTERS } = require('../data/grammar');
const placement = require('../utils/placement');

const CHAPTER_TITLES = Object.fromEntries(GRAMMAR_CHAPTERS.map((c) => [c.id, c.title]));

// Unit ที่แนะนำให้เริ่ม: Unit แรกที่ยังไม่ผ่านในระดับที่แนะนำ (ใช้สถานะเส้นทางจริงของผู้ใช้)
async function recommendedUnit(userId, level) {
  // require ตอนใช้ (path.js require โมดูลอื่นจำนวนมาก — เลี่ยงวงจร require ตอนโหลด)
  const { getUserPathState, unitTitle } = require('./path');
  const { levels } = await getUserPathState(userId);
  const lv = levels.find((l) => l.level === level);
  const unit = lv && lv.units.find((u) => u.status !== 'completed');
  if (!unit) return null;
  return { id: unit.id, level: unit.level, ...unitTitle(unit), locked: unit.status === 'locked' };
}

const router = express.Router();
router.use(authRequired);

const ATTEMPT_TTL_HOURS = 2; // ข้อสอบที่เริ่มแล้วต้องส่งภายใน 2 ชั่วโมง

// สุ่มด้วย crypto เพื่อไม่ให้เดาลำดับข้อสอบ/ตัวเลือกล่วงหน้าได้
function cryptoRng() {
  return crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}

// ส่งเฉพาะข้อมูลที่ผู้เล่นต้องเห็น — ตัด correctIndex ทิ้งเสมอ
function publicQuestions(questions) {
  return questions.map((q, i) => ({
    index: i, skill: q.skill, prompt: q.prompt, choices: q.choices,
  }));
}

/* ==========================================================
   POST /placement/start — เริ่มทำแบบทดสอบ
   ถ้ามีข้อสอบที่ยังทำไม่เสร็จและยังไม่หมดอายุ คืนชุดเดิม (กันสุ่มใหม่เพื่อหาข้อง่าย)
   ========================================================== */
router.post('/start', async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id, questions FROM placement_attempts
        WHERE user_id = $1 AND status = 'in_progress'
          AND created_at > NOW() - make_interval(hours => $2::int)
        ORDER BY created_at DESC LIMIT 1`,
      [req.userId, ATTEMPT_TTL_HOURS]
    );
    if (existing.rows.length > 0) {
      const a = existing.rows[0];
      return res.json({ attemptId: String(a.id), resumed: true, questions: publicQuestions(a.questions) });
    }

    await wordStore.ready();
    const contentRows = await getAllWithDefinition(); // ฐาน Oxford หรือชุดเดิม
    const candidates = contentRows.map((r) => {
      const w = wordStore.findWord(r.id.slice(0, 2), r.id);
      return w ? {
        id: w.id, word: w.word, category: w.category, level: w.level,
        definition: r.definition, synonyms: r.synonyms || [],
        senseCount: r.sense_count, reviewed: Boolean(r.reviewed),
      } : null;
    }).filter(Boolean);

    const rng = cryptoRng;
    const questions = [
      ...placement.buildVocabQuestions(candidates, rng),
      ...placement.buildGrammarQuestions(GRAMMAR_CHAPTERS, rng),
    ];
    if (questions.length < 20) {
      return res.status(503).json({ error: 'ยังสร้างแบบทดสอบไม่ได้ (เนื้อหาคำศัพท์ไม่พอ)' });
    }

    const ins = await pool.query(
      'INSERT INTO placement_attempts (user_id, questions) VALUES ($1, $2) RETURNING id',
      [req.userId, JSON.stringify(questions)]
    );
    res.json({ attemptId: String(ins.rows[0].id), resumed: false, questions: publicQuestions(questions) });
  } catch (err) {
    console.error('[placement/start]', err);
    res.status(500).json({ error: 'เริ่มแบบทดสอบไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /placement/:id/submit — ส่งคำตอบ { answers: [index,...] }
   เซิร์ฟเวอร์ให้คะแนนเองจากเฉลยที่เก็บไว้ ส่งได้ครั้งเดียว
   ========================================================== */
router.post('/:id/submit', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'รหัสแบบทดสอบไม่ถูกต้อง' });

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!answers) return res.status(400).json({ error: 'ไม่พบคำตอบ' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE กันส่งซ้อนพร้อมกันสองครั้ง
    const { rows } = await client.query(
      `SELECT questions, status, created_at FROM placement_attempts
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, req.userId]
    );
    // ไม่บอกว่ามีอยู่จริงแต่เป็นของคนอื่น — ตอบเหมือนไม่พบ
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบแบบทดสอบนี้' });
    }
    const attempt = rows[0];
    if (attempt.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'ส่งแบบทดสอบนี้ไปแล้ว' });
    }
    const ageHours = (Date.now() - new Date(attempt.created_at).getTime()) / 3600000;
    if (ageHours > ATTEMPT_TTL_HOURS) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'แบบทดสอบหมดเวลาแล้ว กรุณาเริ่มใหม่' });
    }

    const questions = attempt.questions;
    if (answers.length !== questions.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ต้องตอบให้ครบ ${questions.length} ข้อ` });
    }
    // คำตอบต้องเป็นเลขในช่วงตัวเลือก หรือ null (ข้าม/ไม่รู้) — ค่าอื่นถือว่าผิด
    const cleaned = answers.map((a, i) => (
      Number.isInteger(a) && a >= 0 && a < questions[i].choices.length ? a : null
    ));

    const result = placement.scorePlacement(questions, cleaned);
    // จุดแข็ง / ควรฝึก จากคำตอบจริง — เก็บไว้กับผลเพื่อเปิดดูภายหลังได้
    Object.assign(result, placement.analyzePlacement(questions, cleaned, result, CHAPTER_TITLES));
    await client.query(
      `UPDATE placement_attempts SET status = 'completed', result = $1, completed_at = NOW()
        WHERE id = $2`,
      [JSON.stringify(result), id]
    );
    await client.query('COMMIT');

    // หลังส่งแล้วเปิดเฉลยให้ทบทวนได้
    const review = questions.map((q, i) => ({
      prompt: q.prompt, choices: q.choices, skill: q.skill, level: q.level,
      correctIndex: q.correctIndex, chosen: cleaned[i], correct: cleaned[i] === q.correctIndex,
    }));
    result.recommendedUnit = await recommendedUnit(req.userId, result.recommendedStart).catch(() => null);
    res.json({ result, review });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[placement/submit]', err);
    res.status(500).json({ error: 'ส่งแบบทดสอบไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

/* ==========================================================
   GET /placement/latest — ผลล่าสุด (ใช้แสดงบน dashboard)
   ========================================================== */
router.get('/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT result, completed_at FROM placement_attempts
        WHERE user_id = $1 AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 1`,
      [req.userId]
    );
    if (rows.length === 0) return res.json({ result: null });
    const result = rows[0].result;
    // Unit แนะนำคำนวณสดทุกครั้ง (ความก้าวหน้าเปลี่ยนได้หลังสอบ)
    result.recommendedUnit = await recommendedUnit(req.userId, result.recommendedStart).catch(() => null);
    res.json({ result, completedAt: rows[0].completed_at });
  } catch (err) {
    console.error('[placement/latest]', err);
    res.status(500).json({ error: 'โหลดผลแบบทดสอบไม่สำเร็จ' });
  }
});

module.exports = router;
