const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo, calcReviewExp } = require('../utils/leveling');
const wordStore = require('../utils/wordStore');
const srs = require('../utils/srs');

const router = express.Router();

// ทวนคำเดิม: ได้ EXP (น้อยกว่าครั้งแรก) ได้อีกเมื่อผ่านไปอย่างน้อยกี่ชั่วโมงนับจากครั้งล่าสุดที่คำนี้ให้ EXP
const REVIEW_EXP_COOLDOWN_HOURS = 20;
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const CONTENT_CATEGORIES = wordStore.CONTENT_CATEGORIES;

// ใช้ word store กลาง (อ่าน DB + fallback JSON, cache ใน memory)
const findWord = (level, wordId) => wordStore.findWord(level, wordId);


router.post('/review', authRequired, async (req, res) => {
  let client;
  try {
    await wordStore.ready(); // ให้แน่ใจว่าคลังคำพร้อม (โหลดครั้งแรกจาก DB)
    // รับ "คำที่ผู้เล่นเลือก" (chosenWordId) แทนการเชื่อ known จาก client
    // เซิร์ฟเวอร์ตัดสินเองว่าถูกหรือผิด โดยเทียบกับ wordId ที่เป็นโจทย์
    // ยังรองรับ payload แบบเก่า (known) ไว้ชั่วคราวเพื่อความเข้ากันได้ระหว่าง deploy
    const { wordId, level, chosenWordId, known: legacyKnown, mode, rating } = req.body || {};
    const lvl = (level || '').toUpperCase();
    // โหมดฝึก: 'read' (ค่าเริ่มต้น เห็นคำ) | 'listening' (ได้ยินเสียง) — ใช้แยกบันทึกทักษะใน Mastery
    // กติกา EXP เหมือนกันทุกโหมด แต่ความคืบหน้า/EXP นับแยกกัน (ฟังคำที่อ่านรู้แล้ว = เรียนทักษะใหม่)
    const VALID_MODES = { read: 'vocab', listening: 'listening' };
    if (mode !== undefined && !VALID_MODES[mode]) {
      return res.status(400).json({ error: 'โหมดฝึกไม่ถูกต้อง' });
    }
    const skill = VALID_MODES[mode || 'read'];

    if (!wordId || !VALID_LEVELS.has(lvl)) {
      return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
    }
    if (!findWord(lvl, wordId)) {
      return res.status(404).json({ error: 'ไม่พบคำศัพท์นี้' });
    }

    // ตัดสินความถูกต้องฝั่งเซิร์ฟเวอร์
    let known;
    if (chosenWordId !== undefined) {
      // ตอบถูก = เลือกการ์ดของคำเดียวกับโจทย์ (ความหมายตรงกับคำที่ถาม)
      if (chosenWordId !== null && !findWord(lvl, chosenWordId)) {
        return res.status(400).json({ error: 'ตัวเลือกไม่ถูกต้อง' });
      }
      known = chosenWordId === wordId;
    } else if (typeof legacyKnown === 'boolean') {
      // payload เก่า — ยอมรับได้ชั่วคราว (จะเลิกรองรับใน release ถัดไป)
      known = legacyKnown;
    } else {
      return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // ความคืบหน้าแยกตามโหมด: อ่าน = word_progress (มีตารางทบทวน SRS) · ฟัง = listening_progress
    const isListening = skill === 'listening';
    const TABLE = isListening ? 'listening_progress' : 'word_progress';
    const existingResult = await client.query(
      `SELECT * FROM ${TABLE} WHERE user_id = $1 AND word_id = $2`,
      [req.userId, wordId]
    );
    const existing = existingResult.rows[0];
    // ใช้ ever_known (ติดถาวร) แทนสถานะปัจจุบัน เพื่อกันการกดตอบผิด-ถูกสลับ
    // ไปมาเพื่อรับโบนัส "รู้เป็นครั้งแรก" ซ้ำได้เรื่อย ๆ (นับแยกตามโหมด)
    const isFirstTimeKnown = known && !(existing && existing.ever_known);
    // ตอบถูก = รู้แล้ว (ในโหมดนั้น) · ตอบผิด = learning
    const newStatus = known ? 'known' : 'learning';

    let next = null;
    let early = false;
    if (!isListening) {
      // ตารางทบทวน (SRS) ผูกกับโหมดอ่านเท่านั้น — หน้า "ทบทวน" ใช้ตารางนี้
      const prevSrs = existing ? {
        reps: existing.srs_reps, ease: existing.srs_ease,
        interval: existing.srs_interval, lapses: existing.srs_lapses,
      } : null;
      const askedRating = srs.RATINGS.includes(rating) ? rating : 'good';
      // ตอบถูก "ก่อนถึงกำหนด" (เจอคำเดิมซ้ำในวันเดียว) -> ไม่ขยายระยะทบทวน
      early = Boolean(existing && known && askedRating !== 'again' && !srs.isDue(existing.srs_due_at));
      next = early
        ? { ...prevSrs, dueAt: existing.srs_due_at, status: existing.status, rating: askedRating }
        : srs.schedule(prevSrs, known, new Date(), { rating: askedRating });
      if (existing) {
        await client.query(
          `UPDATE word_progress
           SET status = $1, times_seen = times_seen + 1,
               times_correct = times_correct + $2, last_reviewed = NOW(),
               ever_known = ever_known OR $4,
               srs_interval = $5, srs_ease = $6, srs_reps = $7,
               srs_lapses = $8, srs_due_at = $9
           WHERE id = $3`,
          [newStatus, known ? 1 : 0, existing.id, known,
           next.interval, next.ease, next.reps, next.lapses, next.dueAt]
        );
      } else {
        await client.query(
          `INSERT INTO word_progress
             (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known,
              srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at)
           VALUES ($1, $2, $3, $4, 1, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
          [req.userId, wordId, lvl, newStatus, known ? 1 : 0, known,
           next.interval, next.ease, next.reps, next.lapses, next.dueAt]
        );
      }
    } else {
      await client.query(
        `INSERT INTO listening_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known)
         VALUES ($1, $2, $3, $4, 1, $5, NOW(), $6)
         ON CONFLICT (user_id, word_id) DO UPDATE
           SET status = EXCLUDED.status, times_seen = listening_progress.times_seen + 1,
               times_correct = listening_progress.times_correct + EXCLUDED.times_correct,
               last_reviewed = NOW(), ever_known = listening_progress.ever_known OR EXCLUDED.ever_known`,
        [req.userId, wordId, lvl, newStatus, known ? 1 : 0, known]
      );
    }

    // บันทึกคำตอบลง answer_events (ฐานของ My Mistakes/Mastery/Analytics)
    await client.query(
      'INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, skill, wordId, lvl, known]
    );

    const userResult = await client.query('SELECT exp FROM users WHERE id = $1', [req.userId]);
    const beforeExp = userResult.rows[0].exp;

    // ระดับนี้รู้ครบ 100% แล้วหรือยัง (ในโหมดนี้) — นับ "ก่อนตอบข้อนี้" ส่งให้หน้าเว็บแจ้งผู้เรียน
    const knownRowsResult = await client.query(
      `SELECT word_id FROM ${TABLE} WHERE user_id = $1 AND level = $2 AND status = 'known'`,
      [req.userId, lvl]
    );
    const knownContentCount = knownRowsResult.rows.filter((r) => wordStore.isPlayable(r.word_id)).length;
    const playable = wordStore.isPlayable(wordId);
    const wasKnown = Boolean(existing && existing.status === 'known');
    const knownBefore = knownContentCount
      - (playable && known && !wasKnown ? 1 : 0)
      + (playable && wasKnown && !known ? 1 : 0);
    const levelAlreadyComplete = knownBefore >= (wordStore.getPlayableCount(lvl) || Infinity);

    // กติกา EXP การ์ดคำศัพท์ (ไม่มีเพดานรายวัน · นับแยกโหมดอ่าน/ฟัง):
    //  - ตอบถูกคำที่ยังไม่เคยรู้ (ในโหมดนี้)      = 15
    //  - ทวนคำที่รู้แล้ว ตอบถูก                   = 5  (น้อยกว่าครั้งแรก)
    //  - ตอบผิดครั้งแรกที่เจอคำนี้                 = 3  (กำลังใจ)
    //  - คำเดิมที่เพิ่งได้ EXP ภายใน 20 ชั่วโมง     = 0  (กันตอบคำเดิมซ้ำรัว ๆ เพื่อเก็บ EXP)
    const onCooldown = Boolean(existing && existing.last_exp_at
      && Date.now() - new Date(existing.last_exp_at).getTime() < REVIEW_EXP_COOLDOWN_HOURS * 3600 * 1000);
    const alreadyRewarded = Boolean(existing && existing.last_exp_at);
    const gained = calcReviewExp({ known, isFirstTimeKnown, alreadyRewarded, onCooldown });
    const noExpReason = gained > 0 ? null : (onCooldown ? 'cooldown' : 'repeat');

    const afterExp = beforeExp + gained;
    if (gained > 0) {
      await client.query(`UPDATE ${TABLE} SET last_exp_at = NOW() WHERE user_id = $1 AND word_id = $2`, [req.userId, wordId]);
    }

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
      correct: known, // เซิร์ฟเวอร์เป็นคนตัดสิน ไม่ใช่ client
      gainedExp: gained,
      noExpReason,
      expKind: gained === 0 ? null : (isFirstTimeKnown ? 'new' : known ? 'review' : 'attempt'),
      expRules: { cooldownHours: REVIEW_EXP_COOLDOWN_HOURS },
      isFirstTimeKnown,
      mode: isListening ? 'listening' : 'read',
      status: newStatus,
      // ผลการนัดทบทวน (เฉพาะโหมดอ่าน) — ให้หน้าเว็บบอกผู้เรียนได้ว่าจะเจอคำนี้อีกเมื่อไร
      schedule: next ? { rating: next.rating, early, nextReviewAt: next.dueAt, intervalDays: next.interval } : null,
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
    await wordStore.ready();
    const result = await pool.query(
      'SELECT word_id, level, status FROM word_progress WHERE user_id = $1',
      [req.userId]
    );

    const summary = {};
    for (const lvl of VALID_LEVELS) {
      summary[lvl] = { known: 0, learning: 0, total: wordStore.getPlayableCount(lvl) };  // นับเฉพาะคำที่ฝึกได้จริง
    }

    for (const row of result.rows) {
      if (!summary[row.level]) continue;
      // ข้ามแถวเก่าที่เป็นคำไวยากรณ์ (det/pron/prep ฯลฯ) ที่ผู้เล่นอาจตอบไว้
      // ก่อนหน้านี้ตั้งแต่ตอนที่ระบบยังไม่ตัดคำกลุ่มนี้ออกจากโหมดเกม —
      // ไม่งั้นยอด known จะเกินกว่า total ใหม่ที่นับเฉพาะคำที่เล่นได้จริง
      const wordEntry = findWord(row.level, row.word_id);
      if (!wordEntry || !CONTENT_CATEGORIES.has(wordEntry.category)) continue;
      if (!wordStore.isPlayable(row.word_id)) continue; // คำที่คำแปลรอตรวจ ไม่นับ (total ก็ไม่นับ)
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
        AND status = 'known'
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
const DAILY_GOAL = 20;
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
