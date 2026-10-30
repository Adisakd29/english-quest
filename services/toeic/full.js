/*
  TOEIC-style Full Mock Test — รวม Mock ทั้ง 7 Part เป็นชุดเดียว แล้วประมาณคะแนน Listening / Reading (5–495 ต่อด้าน)
  - แต่ละ Part ใช้ Mock เดิมของ Part นั้น (ตรวจคำตอบ/เวลา/EXP เหมือนเดิม) · session ผูกด้วย toeic_sessions.config.fullTestId
  - ทำทีละ Part ได้ (พักระหว่าง Part ได้) · Mock ของ Part ที่ถูกยกเลิก/เริ่มใหม่ = เริ่ม Part นั้นใหม่ได้
  - คะแนนประมาณการ: สัดส่วนข้อที่ถูก → 5–495 (เชิงเส้น ปัดทีละ 5) พร้อมช่วงความคลาดเคลื่อน (±1.96·SE จากจำนวนข้อ)
    ไม่ใช่ตารางแปลงคะแนนของ ETS (ซึ่งต่างกันในแต่ละชุดข้อสอบ) → แสดงเป็น "ประมาณการ" เสมอ
*/
const pool = require('../../config/db');
const { grantOnce } = require('../../utils/exp');
const { ToeicError } = require('./part1');

const PARTS = [
  { part: 1, section: 'listening', title: 'Part 1 — Photographs', th: 'ภาพถ่าย', nav: 'toeic-p1' },
  { part: 2, section: 'listening', title: 'Part 2 — Question–Response', th: 'คำถาม–คำตอบ', nav: 'toeic-p2' },
  { part: 3, section: 'listening', title: 'Part 3 — Conversations', th: 'บทสนทนา', nav: 'toeic-p3' },
  { part: 4, section: 'listening', title: 'Part 4 — Talks', th: 'การพูดสั้น ๆ', nav: 'toeic-p4' },
  { part: 5, section: 'reading', title: 'Part 5 — Incomplete Sentences', th: 'เติมประโยค', nav: 'toeic-p5' },
  { part: 6, section: 'reading', title: 'Part 6 — Text Completion', th: 'เติมข้อความ', nav: 'toeic-p6' },
  { part: 7, section: 'reading', title: 'Part 7 — Reading Comprehension', th: 'อ่านจับใจความ', nav: 'toeic-p7' },
];
const BONUS_EXP = 40;     // จบครบ 7 Part (วันละครั้ง)
// CEFR โดยประมาณจากคะแนน TOEIC L&R (ค่าขั้นต่ำตามตารางเทียบที่ ETS เผยแพร่) — ใช้กับคะแนนประมาณการเท่านั้น
const CEFR = { listening: [[490, 'C1'], [400, 'B2'], [275, 'B1'], [110, 'A2'], [60, 'A1']], reading: [[455, 'C1'], [385, 'B2'], [275, 'B1'], [115, 'A2'], [60, 'A1']] };

const round5 = (x) => Math.round(x / 5) * 5;
function estimate(correct, total, section) {
  if (!total) return null;
  const p = correct / total;
  const score = Math.max(5, Math.min(495, round5(5 + 490 * p)));
  const se = Math.sqrt(Math.max(p * (1 - p), 0.04) / total);   // อย่างน้อย ±(0.2/√n) กันช่วงแคบเกินจริงตอน 0% / 100%
  const margin = Math.max(15, round5(1.96 * se * 490));
  const cefr = (CEFR[section].find(([min]) => score >= min) || [0, 'ต่ำกว่า A1'])[1];
  return { score, low: Math.max(5, score - margin), high: Math.min(495, score + margin), margin, correct, total, accuracy: Math.round(p * 100), cefr };
}

async function load(userId, id) {
  if (!/^\d{1,15}$/.test(String(id))) throw new ToeicError('NOT_FOUND', 'ไม่พบ Full Mock Test นี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_full_tests WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบ Full Mock Test นี้', 404);
  return rows[0];
}
/** session ล่าสุดของแต่ละ Part ที่ผูกกับชุดนี้ */
async function sessionsOf(userId, id) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (part) id, part, status, score, total, started_at, finished_at,
            (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
       FROM toeic_sessions s WHERE user_id = $1 AND mode = 'mock' AND config->>'fullTestId' = $2::text
      ORDER BY part, started_at DESC`, [userId, String(id)]);
  return new Map(rows.map((r) => [r.part, r]));
}
async function view(userId, t) {
  const ss = await sessionsOf(userId, t.id);
  const parts = PARTS.map((p) => {
    const s = ss.get(p.part);
    const state = !s ? 'todo' : s.status === 'finished' ? 'done' : s.status === 'active' ? 'active' : 'todo';
    return { ...p, state, sessionId: s && s.status !== 'abandoned' ? Number(s.id) : null,
      correct: s && s.status === 'finished' ? s.score : null, total: s ? s.total : null, answered: s ? s.answered : 0 };
  });
  const next = parts.find((p) => p.state !== 'done');
  return { id: Number(t.id), status: t.status, startedAt: t.started_at, finishedAt: t.finished_at, parts,
    done: parts.filter((p) => p.state === 'done').length, nextPart: next ? next.part : null, result: t.result || null };
}

async function current(userId) {
  const { rows } = await pool.query(`SELECT * FROM toeic_full_tests WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`, [userId]);
  const hist = await pool.query(`SELECT id, result, finished_at FROM toeic_full_tests WHERE user_id = $1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 10`, [userId]);
  return { active: rows[0] ? await view(userId, rows[0]) : null,
    history: hist.rows.map((r) => ({ id: Number(r.id), finishedAt: r.finished_at, total: r.result.total, listening: r.result.listening.score, reading: r.result.reading.score })),
    parts: PARTS };
}
async function start(userId) {
  await pool.query(`UPDATE toeic_full_tests SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND status = 'active'`, [userId]);
  const { rows } = await pool.query('INSERT INTO toeic_full_tests (user_id) VALUES ($1) RETURNING *', [userId]);
  return view(userId, rows[0]);
}
async function get(userId, id) { return view(userId, await load(userId, id)); }

/** ตรวจก่อนเริ่ม Mock (ไม่สร้าง session ทิ้งไว้ถ้าผูกไม่ได้) */
async function precheck(userId, fullTestId, part) {
  const t = await load(userId, fullTestId);
  if (t.status !== 'active') throw new ToeicError('FULL_CLOSED', 'Full Mock Test นี้จบหรือถูกยกเลิกแล้ว', 409);
  const prev = (await sessionsOf(userId, t.id)).get(part);
  if (prev && prev.status === 'finished') throw new ToeicError('PART_DONE', `ทำ Part ${part} ของชุดนี้ไปแล้ว`, 409);
  return t;
}
/** ผูก Mock session ที่เพิ่งเริ่มเข้ากับ Full Mock Test (เรียกจาก route ตอนเริ่ม Mock ของแต่ละ Part) */
async function attach(userId, fullTestId, part, sid) {
  const t = await precheck(userId, fullTestId, part);
  await pool.query(`UPDATE toeic_sessions SET config = config || jsonb_build_object('fullTestId', $3::bigint) WHERE id = $1 AND user_id = $2 AND mode = 'mock'`, [sid, userId, t.id]);
  return Number(t.id);
}

async function finish(userId, id) {
  const t = await load(userId, id);
  if (t.status === 'finished') return { ...(await view(userId, t)), exp: 0, already: true };
  if (t.status !== 'active') throw new ToeicError('FULL_CLOSED', 'Full Mock Test นี้ถูกยกเลิกแล้ว', 409);
  const v = await view(userId, t);
  const missing = v.parts.filter((p) => p.state !== 'done');
  if (missing.length) throw new ToeicError('UNFINISHED', `ยังไม่ได้ทำ ${missing.map((p) => `Part ${p.part}`).join(', ')}`, 409);
  const sum = (sec) => v.parts.filter((p) => p.section === sec).reduce((a, p) => ({ c: a.c + p.correct, n: a.n + p.total }), { c: 0, n: 0 });
  const L = sum('listening'); const R = sum('reading');
  const listening = estimate(L.c, L.n, 'listening'); const reading = estimate(R.c, R.n, 'reading');
  const parts = v.parts.map((p) => ({ part: p.part, section: p.section, th: p.th, correct: p.correct, total: p.total, accuracy: Math.round((p.correct / p.total) * 100) }));
  const weakest = [...parts].sort((a, b) => a.accuracy - b.accuracy)[0];
  const result = { listening, reading, total: listening.score + reading.score, totalLow: listening.low + reading.low, totalHigh: listening.high + reading.high,
    parts, weakest, questions: L.n + R.n,
    note: 'คะแนนประมาณการจากสัดส่วนข้อที่ตอบถูกในข้อสอบฝึกของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ และไม่ได้ใช้ตารางแปลงคะแนนของ ETS' };
  const upd = await pool.query(`UPDATE toeic_full_tests SET status = 'finished', finished_at = NOW(), result = $3 WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
    [id, userId, JSON.stringify(result)]);
  if (!upd.rows[0]) return finish(userId, id);
  const g = await grantOnce(userId, `tfull:${id}`, BONUS_EXP, { reason: 'toeic_full_mock', dailyCap: BONUS_EXP });
  return { ...(await view(userId, upd.rows[0])), exp: g.gained || 0, levelInfo: g.levelInfo || null, leveledUp: Boolean(g.leveledUp) };
}
async function abandon(userId, id) {
  await load(userId, id);
  await pool.query(`UPDATE toeic_full_tests SET status = 'abandoned', finished_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'active'`, [id, userId]);
  return { ok: true };
}

module.exports = { current, start, get, precheck, attach, finish, abandon, estimate, PARTS, BONUS_EXP };
