const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { recordCardAnswer } = require('../services/vocab/record');
const wordStore = require('../utils/wordStore');

const router = express.Router();

// กติกา SRS/EXP ของการ์ดคำศัพท์อยู่ที่ services/vocab/record.js (ใช้ร่วมกับบทเรียน v2)
const VALID_LEVELS = new Set(wordStore.VALID_LEVELS); // A1–C2

// ใช้ word store กลาง (อ่าน DB + fallback JSON, cache ใน memory)
const findWord = (level, wordId) => wordStore.findWord(level, wordId);


/*
  POST /progress/review — ช่องทางเดิม (client ส่ง chosenWordId) · v1.10.0 Phase 2: หน้าเว็บย้ายไปใช้บทเรียน v2
  (/api/lesson — เซิร์ฟเวอร์สร้างโจทย์และเก็บเฉลยเอง) แล้ว · ช่องทางนี้ client รู้เฉลยอยู่แล้ว จึงปิดใน production
  (เปิดได้ชั่วคราวด้วย LEGACY_CARD_REVIEW=on ระหว่างผู้ใช้ยังเปิดหน้าเว็บเวอร์ชันเก่า) · ชุดทดสอบยังใช้ตรวจกติกา SRS/EXP
*/
const legacyReviewEnabled = () => process.env.LEGACY_CARD_REVIEW === 'on'
  || (process.env.NODE_ENV !== 'production' && process.env.LEGACY_CARD_REVIEW !== 'off');

router.post('/review', authRequired, async (req, res) => {
  if (!legacyReviewEnabled()) {
    return res.status(410).json({ error: 'แอปมีเวอร์ชันใหม่ — รีเฟรชหน้าเว็บเพื่อฝึกต่อ', code: 'USE_LESSON_V2' });
  }
  let client;
  try {
    await wordStore.ready();
    const { wordId, level, chosenWordId, mode, rating } = req.body || {};
    const lvl = (level || '').toUpperCase();
    const VALID_MODES = { read: 'vocab', listening: 'listening' };
    if (mode !== undefined && !VALID_MODES[mode]) return res.status(400).json({ error: 'โหมดฝึกไม่ถูกต้อง' });
    const skill = VALID_MODES[mode || 'read'];
    if (!wordId || !VALID_LEVELS.has(lvl)) return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
    if (!findWord(lvl, wordId)) return res.status(404).json({ error: 'ไม่พบคำศัพท์นี้' });
    // v1.10.0: ไม่รับ payload แบบเก่า (known: true) — ต้องส่งคำที่เลือกมาให้เซิร์ฟเวอร์ตรวจ
    if (chosenWordId === undefined) return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
    if (chosenWordId !== null && !findWord(lvl, chosenWordId)) return res.status(400).json({ error: 'ตัวเลือกไม่ถูกต้อง' });
    const known = chosenWordId === wordId;

    client = await pool.connect();
    await client.query('BEGIN');
    const result = await recordCardAnswer(client, { userId: req.userId, wordId, level: lvl, known, skill, rating });
    await client.query('COMMIT');
    res.json(result);
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_e) { /* ignore */ } }
    console.error('[progress/review]', err);
    res.status(500).json({ error: 'บันทึกผลไม่สำเร็จ ลองใหม่อีกครั้ง' });
  } finally {
    if (client) client.release();
  }
});

router.get('/summary', authRequired, async (req, res) => {
  try {
    await wordStore.ready();
    const result = await pool.query(
      'SELECT word_id, level, status, ever_known, srs_reps FROM word_progress WHERE user_id = $1',
      [req.userId]
    );

    const summary = {};
    for (const lvl of VALID_LEVELS) {
      // known = ผ่านแล้ว (เคยตอบถูก และยังไม่ลืม) · mastered = ชำนาญ (SRS: ถูกแบบเว้นช่วง) — นับเฉพาะคำที่ฝึกได้จริง
      summary[lvl] = { known: 0, learning: 0, mastered: 0, total: wordStore.getPlayableCount(lvl) };
    }

    for (const row of result.rows) {
      if (!summary[row.level]) continue;
      // ข้ามแถวเก่าที่เป็นคำไวยากรณ์ (det/pron/prep ฯลฯ) ที่ผู้เล่นอาจตอบไว้
      // ก่อนหน้านี้ตั้งแต่ตอนที่ระบบยังไม่ตัดคำกลุ่มนี้ออกจากโหมดเกม —
      // ไม่งั้นยอด known จะเกินกว่า total ใหม่ที่นับเฉพาะคำที่เล่นได้จริง
      const wordEntry = findWord(row.level, row.word_id);
      if (!wordEntry || !wordStore.isContentEntry(wordEntry)) continue;
      if (!wordStore.isPlayable(row.word_id)) continue; // คำที่คำแปลรอตรวจ ไม่นับ (total ก็ไม่นับ)
      const passed = row.status === 'known' || (row.ever_known && Number(row.srs_reps) > 0);
      summary[row.level][passed ? 'known' : 'learning'] += 1;
      if (row.status === 'known') summary[row.level].mastered += 1;
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

/* ==========================================================
   GET /progress/due — นับคำที่ถึงกำหนดทบทวนวันนี้ (รวม + แยกระดับ)
   ========================================================== */
router.get('/due', authRequired, async (req, res) => {
  try {
    await wordStore.ready();
    // คำที่ถึงกำหนด = เคยเรียนแล้ว (มีแถว) และ srs_due_at <= ตอนนี้ (หรือ NULL = คำเก่า)
    const { rows } = await client_due(req.userId);
    // นับเฉพาะคำที่เป็น content word และยังไม่ "มาสเตอร์ถาวร" (ยังอยู่ในวงจรทบทวน)
    const byLevel = {};
    let total = 0;
    for (const r of rows) {
      if (!wordStore.isContentWord(r.word_id)) continue;
      byLevel[r.level] = (byLevel[r.level] || 0) + 1;
      total += 1;
    }
    res.json({ total, byLevel });
  } catch (err) {
    console.error('[progress/due]', err);
    res.status(500).json({ error: 'โหลดคำที่ต้องทบทวนไม่สำเร็จ' });
  }
});

// query แยกออกมาเพื่อให้อ่านง่าย: คำที่ถึงกำหนดทบทวน (เคยตอบถูกอย่างน้อยจนมีสถานะ)
async function client_due(userId) {
  return pool.query(
    `SELECT word_id, level FROM word_progress
      WHERE user_id = $1
        AND (status = 'known' OR ever_known)
        AND (srs_due_at IS NULL OR srs_due_at <= NOW())`,
    [userId]
  );
}

/* ==========================================================
   GET /progress/review-session?level=A1 — ดึง word_id ที่ควรทบทวน
   (ถ้าไม่ระบุ level = รวมทุกระดับ) จำกัดจำนวนต่อรอบ
   ========================================================== */
router.get('/review-session', authRequired, async (req, res) => {
  try {
    await wordStore.ready();
    const level = (req.query.level || '').toUpperCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    const params = [req.userId];
    let sql = `SELECT word_id, level FROM word_progress
                WHERE user_id = $1 AND status = 'known'
                  AND (srs_due_at IS NULL OR srs_due_at <= NOW())`;
    if (VALID_LEVELS.has(level)) {
      params.push(level);
      sql += ` AND level = $${params.length}`;
    }
    sql += ' ORDER BY srs_due_at NULLS FIRST';

    const { rows } = await pool.query(sql, params);
    // เอาเฉพาะ content word แล้วแนบข้อมูลคำจาก store
    const items = rows
      .filter((r) => wordStore.isContentWord(r.word_id))
      .slice(0, limit)
      .map((r) => {
        const w = wordStore.findWord(r.level, r.word_id);
        return w ? { id: w.id, word: w.word, pos: w.pos, category: w.category, level: w.level } : null;
      })
      .filter(Boolean);

    res.json({ level: level || 'all', count: items.length, words: items });
  } catch (err) {
    console.error('[progress/review-session]', err);
    res.status(500).json({ error: 'โหลดรอบทบทวนไม่สำเร็จ' });
  }
});


/* ==========================================================
   GET /progress/home — ข้อมูลหน้า Home ในคำขอเดียว (เดิมหน้า Home เรียก API แยก 6 ครั้ง)
   - today:   ตอบไปกี่ข้อวันนี้ (นับตามวันเวลาไทย) เทียบเป้าหมายรายวัน
   - mastery: ความแม่นยำ 30 วันล่าสุดแยกทักษะ — ต่ำกว่า MIN_SAMPLE ข้อ = ยังไม่พอประเมิน
              (Mastery = ความสามารถจริง แยกจาก EXP ที่วัดปริมาณกิจกรรม)
   - words:   จำนวนคำที่จำได้แล้ว (known)
   - dueCount: คำที่ถึงกำหนดทบทวน
   ========================================================== */
const DAILY_GOAL = require('../config/coinRewards').DAILY_GOAL_ANSWERS;   // v1.8.0: ค่าเดียวกับรางวัล Coin เป้าหมายรายวัน
const MASTERY_DAYS = 30;
const MIN_SAMPLE = 10;
router.get('/home', authRequired, async (req, res) => {
  try {
    const [today, skills, words, due, trend, missed] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS answers, COUNT(*) FILTER (WHERE correct)::int AS correct
           FROM answer_events
          WHERE user_id = $1
            AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`,
        [req.userId]
      ),
      pool.query(
        `SELECT skill, COUNT(*)::int AS attempts, COUNT(*) FILTER (WHERE correct)::int AS correct
           FROM answer_events
          WHERE user_id = $1 AND created_at >= NOW() - make_interval(days => $2)
          GROUP BY skill`,
        [req.userId, MASTERY_DAYS]
      ),
      pool.query("SELECT COUNT(*)::int AS known FROM word_progress WHERE user_id = $1 AND status = 'known'", [req.userId]),
      // ใช้ฟังก์ชันเดียวกับ GET /progress/due (รวมการกรองคำเนื้อหา) — ตัวเลขต้องตรงกับหน้าทบทวน
      wordStore.ready().then(() => client_due(req.userId)),
      // แนวโน้มความแม่นยำ: 7 วันล่าสุด เทียบ 7 วันก่อนหน้า (Mascot)
      pool.query(
        `SELECT (created_at >= NOW() - INTERVAL '7 days') AS recent, COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE correct)::int AS correct
           FROM answer_events WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
          GROUP BY 1`, [req.userId]
      ),
      // คำที่ตอบผิดบ่อยที่สุดใน 30 วันที่ยังไม่รู้ (ผิด >= 2 ครั้ง)
      pool.query(
        `SELECT ae.item_id, COUNT(*)::int AS wrong FROM answer_events ae
          WHERE ae.user_id = $1 AND ae.skill = 'vocab' AND NOT ae.correct AND ae.created_at >= NOW() - INTERVAL '30 days'
            AND NOT EXISTS (SELECT 1 FROM word_progress wp WHERE wp.user_id = $1 AND wp.word_id = ae.item_id AND wp.status = 'known')
          GROUP BY ae.item_id HAVING COUNT(*) >= 2 ORDER BY wrong DESC LIMIT 1`, [req.userId]
      ),
    ]);
    const tr = Object.fromEntries(trend.rows.map((r) => [r.recent ? 'recent' : 'previous', r]));
    const pct = (r) => (r && r.attempts >= MIN_SAMPLE ? Math.round((r.correct / r.attempts) * 100) : null);
    const top = missed.rows[0];
    const topWord = top && wordStore.findWord(null, top.item_id);
    const bySkill = Object.fromEntries(skills.rows.map((r) => [r.skill, r]));
    const score = (rows) => {
      const attempts = rows.reduce((a, r) => a + (r ? r.attempts : 0), 0);
      const correct = rows.reduce((a, r) => a + (r ? r.correct : 0), 0);
      return attempts >= MIN_SAMPLE
        ? { accuracy: Math.round((correct / attempts) * 100), attempts }
        : { accuracy: null, attempts, needed: MIN_SAMPLE - attempts };
    };
    res.json({
      today: { ...today.rows[0], goal: DAILY_GOAL },
      mastery: {
        windowDays: MASTERY_DAYS,
        vocab: score([bySkill.vocab]),
        grammar: score([bySkill.grammar]),
        listening: score([bySkill.listening]),
        overall: score(Object.values(bySkill)),
      },
      words: { known: words.rows[0].known },
      dueCount: due.rows.filter((r) => wordStore.isContentWord(r.word_id)).length,
      // ข้อมูลสำหรับ Mascot (คำนวณจากคำตอบจริง — ไม่มีข้อมูลพอ = null)
      insights: {
        accuracy: { recent: pct(tr.recent), previous: pct(tr.previous) },
        topMistake: topWord ? { wordId: top.item_id, word: topWord.word, wrong: top.wrong } : null,
      },
    });
  } catch (err) {
    console.error('[progress/home]', err);
    res.status(500).json({ error: 'โหลดข้อมูลหน้าหลักไม่สำเร็จ' });
  }
});

module.exports = router;
