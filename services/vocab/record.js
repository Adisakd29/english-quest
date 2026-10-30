/*
  บันทึกผลการตอบการ์ดคำศัพท์ 1 ข้อ — กติกาเดียวกันทุกช่องทาง (บทเรียน v2 / API เดิม)
  SRS (โหมดอ่าน) · listening_progress (โหมดฟัง) · answer_events · EXP (+cooldown 20 ชม. +เพดานรายวัน)
  ผู้เรียก: ต้อง BEGIN แล้วส่ง client เข้ามา และ COMMIT/ROLLBACK เอง · ตัดสินถูก/ผิด (known) มาแล้วจากฝั่งเซิร์ฟเวอร์
*/
const { getLevelInfo, calcReviewExp } = require('../../utils/leveling');
const wordStore = require('../../utils/wordStore');
const srs = require('../../utils/srs');

// ทวนคำเดิม: ได้ EXP อีกเมื่อผ่านไปอย่างน้อยกี่ชั่วโมงนับจากครั้งล่าสุดที่คำนี้ให้ EXP
const REVIEW_EXP_COOLDOWN_HOURS = 20;
// เพดาน EXP จากการ์ดคำศัพท์ต่อวัน (เวลาไทย) — กันสคริปต์ปั๊ม EXP/กระดานอันดับ
const CARD_EXP_DAILY_CAP = () => Number(process.env.CARD_EXP_DAILY_CAP) || 600;
// โหมดฟัง: "ชำนาญ" เมื่อฟังถูกอีกครั้งหลังจากครั้งก่อนอย่างน้อยกี่ชั่วโมง
const LISTEN_MASTER_GAP_HOURS = 20;

/**
 * @param client  pg client ที่อยู่ใน transaction
 * @param {{userId:number, wordId:string, level:string, known:boolean, skill:'vocab'|'listening', rating?:string, exerciseType?:string}} a
 */
async function recordCardAnswer(client, { userId, wordId, level, known, skill = 'vocab', rating }) {
  const isListening = skill === 'listening';
  const TABLE = isListening ? 'listening_progress' : 'word_progress';
  const existing = (await client.query(`SELECT * FROM ${TABLE} WHERE user_id = $1 AND word_id = $2`, [userId, wordId])).rows[0];
  // ever_known (ติดถาวร) กันการตอบผิด-ถูกสลับเพื่อรับโบนัส "รู้เป็นครั้งแรก" ซ้ำ
  const isFirstTimeKnown = known && !(existing && existing.ever_known);
  // "known (ชำนาญ)" ต้องตอบถูกแบบเว้นช่วง (SRS) — ตอบถูกครั้งแรก = learning + ever_known (= "ผ่าน")
  let newStatus = 'learning';
  let next = null;
  let early = false;
  if (!isListening) {
    const prevSrs = existing ? { reps: existing.srs_reps, ease: existing.srs_ease, interval: existing.srs_interval, lapses: existing.srs_lapses } : null;
    const askedRating = srs.RATINGS.includes(rating) ? rating : 'good';
    // ตอบถูก "ก่อนถึงกำหนด" (เจอคำเดิมซ้ำในวันเดียว) -> ไม่ขยายระยะทบทวน
    early = Boolean(existing && known && askedRating !== 'again' && !srs.isDue(existing.srs_due_at));
    next = early
      ? { ...prevSrs, dueAt: existing.srs_due_at, status: existing.status, rating: askedRating }
      : srs.schedule(prevSrs, known, new Date(), { rating: askedRating });
    // ตอบถูก: ไม่ลดสถานะคำที่ "รู้แล้ว" อยู่เดิม · คำอื่นใช้ผล SRS
    newStatus = known ? (existing && existing.status === 'known' ? 'known' : (next.status || 'learning')) : 'learning';
    if (existing) {
      await client.query(
        `UPDATE word_progress SET status = $1, times_seen = times_seen + 1, times_correct = times_correct + $2, last_reviewed = NOW(),
                ever_known = ever_known OR $4, srs_interval = $5, srs_ease = $6, srs_reps = $7, srs_lapses = $8, srs_due_at = $9
          WHERE id = $3`,
        [newStatus, known ? 1 : 0, existing.id, known, next.interval, next.ease, next.reps, next.lapses, next.dueAt]);
    } else {
      await client.query(
        `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known,
                                    srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at)
         VALUES ($1, $2, $3, $4, 1, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
        [userId, wordId, level, newStatus, known ? 1 : 0, known, next.interval, next.ease, next.reps, next.lapses, next.dueAt]);
    }
  } else {
    const gapOk = Boolean(existing && existing.ever_known && existing.last_reviewed
      && Date.now() - new Date(existing.last_reviewed).getTime() >= LISTEN_MASTER_GAP_HOURS * 3600 * 1000);
    newStatus = known && (gapOk || (existing && existing.status === 'known')) ? 'known' : 'learning';
    await client.query(
      `INSERT INTO listening_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known)
       VALUES ($1, $2, $3, $4, 1, $5, NOW(), $6)
       ON CONFLICT (user_id, word_id) DO UPDATE
         SET status = EXCLUDED.status, times_seen = listening_progress.times_seen + 1,
             times_correct = listening_progress.times_correct + EXCLUDED.times_correct,
             last_reviewed = NOW(), ever_known = listening_progress.ever_known OR EXCLUDED.ever_known`,
      [userId, wordId, level, newStatus, known ? 1 : 0, known]);
  }

  // answer_events = ฐานของ My Mistakes / Mastery / Analytics
  await client.query('INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, $2, $3, $4, $5)',
    [userId, skill, wordId, level, known]);

  // ล็อกแถวผู้ใช้ก่อนคำนวณ EXP (กันคำขอซ้อนเขียนทับกัน)
  const beforeExp = (await client.query('SELECT exp FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0].exp;

  // ระดับนี้รู้ครบ 100% แล้วหรือยัง (ในโหมดนี้) — นับ "ก่อนตอบข้อนี้"
  const knownRows = (await client.query(`SELECT word_id FROM ${TABLE} WHERE user_id = $1 AND level = $2 AND status = 'known'`, [userId, level])).rows;
  const knownContentCount = knownRows.filter((r) => wordStore.isPlayable(r.word_id)).length;
  const playable = wordStore.isPlayable(wordId);
  const wasKnown = Boolean(existing && existing.status === 'known');
  const knownBefore = knownContentCount - (playable && known && !wasKnown ? 1 : 0) + (playable && wasKnown && !known ? 1 : 0);
  const levelAlreadyComplete = knownBefore >= (wordStore.getPlayableCount(level) || Infinity);

  // EXP: ถูกคำใหม่ 15 · ทวนถูก 5 · ผิดครั้งแรก 3 · คำเดิมภายใน 20 ชม. = 0 · เพดานรายวัน
  const onCooldown = Boolean(existing && existing.last_exp_at
    && Date.now() - new Date(existing.last_exp_at).getTime() < REVIEW_EXP_COOLDOWN_HOURS * 3600 * 1000);
  const alreadyRewarded = Boolean(existing && existing.last_exp_at);
  let gained = calcReviewExp({ known, isFirstTimeKnown, alreadyRewarded, onCooldown });
  let capped = false;
  if (gained > 0) {
    const today = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS n FROM exp_log WHERE user_id = $1 AND reason IN ('card_known', 'card_review')
         AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId]);
    const left = Math.max(0, CARD_EXP_DAILY_CAP() - today.rows[0].n);
    if (gained > left) { gained = left; capped = true; }
  }
  const noExpReason = gained > 0 ? null : (capped ? 'daily_cap' : onCooldown ? 'cooldown' : 'repeat');
  const afterExp = beforeExp + gained;
  if (gained > 0) {
    await client.query(`UPDATE ${TABLE} SET last_exp_at = NOW() WHERE user_id = $1 AND word_id = $2`, [userId, wordId]);
    await client.query('UPDATE users SET exp = exp + $1 WHERE id = $2', [gained, userId]);
    await client.query('INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)', [userId, gained, known ? 'card_known' : 'card_review']);
  }

  const beforeLevel = getLevelInfo(beforeExp);
  const afterLevel = getLevelInfo(afterExp);
  return {
    correct: known,
    gainedExp: gained,
    noExpReason,
    expKind: gained === 0 ? null : (isFirstTimeKnown ? 'new' : known ? 'review' : 'attempt'),
    expRules: { cooldownHours: REVIEW_EXP_COOLDOWN_HOURS },
    isFirstTimeKnown,
    mode: isListening ? 'listening' : 'read',
    status: newStatus,
    schedule: next ? { rating: next.rating, early, nextReviewAt: next.dueAt, intervalDays: next.interval } : null,
    levelComplete: levelAlreadyComplete,
    leveledUp: afterLevel.level > beforeLevel.level,
    levelInfo: afterLevel,
  };
}

module.exports = { recordCardAnswer, REVIEW_EXP_COOLDOWN_HOURS, LISTEN_MASTER_GAP_HOURS };
