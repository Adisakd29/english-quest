/*
  คะแนน TOEIC คาดการณ์จากการฝึกทั้งหมด (v1.10.0 Phase 4)
  - ใช้ "ครั้งแรกที่ทำแต่ละข้อ" (ไม่นับทำซ้ำ/รอบทบทวนข้อผิด ซึ่งทำให้คะแนนสูงเกินจริง) · 120 วันล่าสุด · ล่าสุดไม่เกิน 80 ข้อต่อ Part
  - ถ่วงน้ำหนักตามจำนวนข้อจริงของแต่ละ Part ในข้อสอบ (Listening: P1 6 · P2 25 · P3 39 · P4 30 · Reading: P5 30 · P6 16 · P7 54)
    Part ที่ยังไม่เคยทำ → ใช้ความแม่นยำเฉลี่ยของ Part อื่นในด้านเดียวกัน แต่ความไม่แน่นอนเพิ่มขึ้น
  - คะแนน = 5 + 490 × ความแม่นยำถ่วงน้ำหนัก (ปัดทีละ 5) · ช่วงความคลาดเคลื่อน ±1.96·SE (+ ส่วนที่เดา Part ที่ยังไม่ทำ)
  - ไม่ใช่ตารางแปลงคะแนนของ ETS → แสดงเป็น "ประมาณการ" เสมอ พร้อมบอกว่าต้องฝึกเพิ่มอะไรให้แม่นขึ้น
*/
const pool = require('../../config/db');
const { estimate } = require('./full');

const WEIGHTS = {
  listening: { 1: 6, 2: 25, 3: 39, 4: 30 },
  reading: { 5: 30, 6: 16, 7: 54 },
};
const MIN_SECTION = 20;      // อย่างน้อยกี่ข้อต่อด้านจึงประเมิน
const PER_PART_CAP = 80;
const DAYS = 120;
const round5 = (x) => Math.round(x / 5) * 5;

async function firstAttempts(userId) {
  const { rows } = await pool.query(
    `WITH first AS (
       SELECT DISTINCT ON (a.question_id) a.part, a.is_correct, a.created_at
         FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.created_at >= NOW() - make_interval(days => $2::int)
          AND COALESCE(s.config->>'source', 'bank') <> 'mistakes'
        ORDER BY a.question_id, a.created_at)
     SELECT part, is_correct FROM (
       SELECT part, is_correct, ROW_NUMBER() OVER (PARTITION BY part ORDER BY created_at DESC) AS rn FROM first) x
      WHERE rn <= $3`, [userId, DAYS, PER_PART_CAP]);
  const per = {};
  for (const r of rows) { const p = (per[r.part] = per[r.part] || { n: 0, c: 0 }); p.n += 1; if (r.is_correct) p.c += 1; }
  return per;
}

function section(name, per) {
  const W = WEIGHTS[name];
  const parts = Object.keys(W).map(Number);
  const done = parts.filter((p) => per[p] && per[p].n > 0);
  const total = done.reduce((a, p) => a + per[p].n, 0);
  const breakdown = parts.map((p) => ({ part: p, weight: W[p], answered: per[p] ? per[p].n : 0,
    accuracy: per[p] && per[p].n ? Math.round((per[p].c / per[p].n) * 100) : null }));
  if (total < MIN_SECTION || !done.length) {
    return { ready: false, answered: total, need: Math.max(0, MIN_SECTION - total), breakdown, missingParts: parts.filter((p) => !done.includes(p)) };
  }
  // ค่าเฉลี่ยของ Part ที่ทำแล้ว (ถ่วงตามจำนวนข้อที่ทำ) → ใช้แทน Part ที่ยังไม่ทำ
  const pooled = done.reduce((a, p) => a + per[p].c, 0) / total;
  let acc = 0; let variance = 0; let guessed = 0;
  const wsum = parts.reduce((a, p) => a + W[p], 0);
  for (const p of parts) {
    const w = W[p] / wsum;
    if (per[p] && per[p].n) {
      const q = per[p].c / per[p].n;
      acc += w * q;
      variance += w * w * Math.max(q * (1 - q), 0.04) / per[p].n;
    } else {
      acc += w * pooled; guessed += w;
      variance += w * w * 0.0625;   // ไม่รู้ผล Part นี้ — สมมติส่วนเบี่ยงเบน ±25 จุดเปอร์เซ็นต์
    }
  }
  const score = Math.max(5, Math.min(495, round5(5 + 490 * acc)));
  const margin = Math.max(15, round5(1.96 * Math.sqrt(variance) * 490));
  const cefr = estimate(Math.round(acc * 100), 100, name).cefr;
  return { ready: true, score, low: Math.max(5, score - margin), high: Math.min(495, score + margin), margin, answered: total,
    accuracy: Math.round(acc * 100), cefr, guessedShare: Math.round(guessed * 100), breakdown, missingParts: parts.filter((p) => !done.includes(p)) };
}

async function predict(userId) {
  const per = await firstAttempts(userId);
  const L = section('listening', per); const R = section('reading', per);
  const latestMock = (await pool.query(
    `SELECT result, finished_at FROM toeic_full_tests WHERE user_id = $1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 1`, [userId]).catch(() => ({ rows: [] }))).rows[0];
  const tips = [];
  for (const [name, s, th] of [['listening', L, 'Listening'], ['reading', R, 'Reading']]) {
    if (!s.ready) tips.push(`${th}: ทำเพิ่มอีก ${s.need} ข้อ (ข้อใหม่) เพื่อเริ่มประเมิน`);
    else if (s.missingParts.length) tips.push(`${th}: ยังไม่เคยทำ Part ${s.missingParts.join(', ')} — ลองทำ ช่วงคะแนนจะแคบลง`);
    else if (s.margin > 40) tips.push(`${th}: ทำข้อใหม่เพิ่มเพื่อให้ช่วงคะแนนแคบลง (ตอนนี้ ±${s.margin})`);
    const weakest = s.breakdown.filter((b) => b.accuracy != null).sort((a, b) => (a.accuracy - b.accuracy) || (b.weight - a.weight))[0];
    if (s.ready && weakest && weakest.accuracy < 70) tips.push(`${th}: Part ${weakest.part} แม่นยำ ${weakest.accuracy}% — เพิ่มคะแนนได้มากที่สุด (${weakest.weight} ข้อในข้อสอบจริง)`);
    void name;
  }
  return {
    listening: L, reading: R,
    total: L.ready && R.ready ? { score: L.score + R.score, low: L.low + R.low, high: L.high + R.high } : null,
    latestMock: latestMock ? { at: latestMock.finished_at, listening: latestMock.result && latestMock.result.listening ? latestMock.result.listening.score : null,
      reading: latestMock.result && latestMock.result.reading ? latestMock.result.reading.score : null } : null,
    tips,
    note: 'ประมาณการจากคำตอบครั้งแรกของแต่ละข้อใน 120 วันล่าสุด ถ่วงตามจำนวนข้อจริงของแต่ละ Part — ไม่ใช่คะแนนทางการของ ETS และข้อฝึกอาจง่าย/ยากต่างจากข้อสอบจริง',
  };
}

module.exports = { predict, section, WEIGHTS, MIN_SECTION };
