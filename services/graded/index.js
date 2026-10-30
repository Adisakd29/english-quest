/*
  Graded Reading & Listening (v1.10.0 Phase 5) — เรื่องสั้นตามระดับ A1–B2 (data/graded/texts.json · เขียนขึ้นเองสำหรับ EnglishQuest)
  - โหมดอ่าน: เห็นเนื้อเรื่อง + คำศัพท์ (แตะดูคำแปล) + ฟังเสียงอ่านตามได้ · โหมดฟัง: ไม่ส่งเนื้อเรื่องจนกว่าจะส่งคำตอบ
  - ตรวจคำตอบที่เซิร์ฟเวอร์ · เฉลย + หลักฐานในเนื้อเรื่อง + คำแปล หลังส่ง
  - EXP ครั้งแรกที่ได้ ≥ 60% ต่อเรื่อง/โหมด (10 EXP · เพดาน 60 EXP/วัน) · ไม่มี Coin · answer_events (skill reading/listening)
*/
const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { grantOnce } = require('../../utils/exp');

const FILE = path.join(__dirname, '../../data/graded/texts.json');
const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const MODES = ['reading', 'listening'];
const EXP_PER_TEXT = 10;
const DAILY_CAP = 60;
const PASS = 0.6;

class GradedError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

let DATA = null;
function texts() {
  if (!DATA) {
    const raw = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).texts : [];
    DATA = { list: raw, byId: new Map(raw.map((t) => [t.id, t])) };
  }
  return DATA;
}
function reset() { DATA = null; }
function textOf(id) {
  const t = texts().byId.get(String(id || ''));
  if (!t) throw new GradedError(404, 'ไม่พบเรื่องนี้', 'NOT_FOUND');
  return t;
}
const modeOf = (m) => { if (!MODES.includes(m)) throw new GradedError(400, 'โหมดไม่ถูกต้อง', 'BAD_MODE'); return m; };

async function list(userId) {
  const { rows } = await pool.query('SELECT text_id, mode, best_score, total FROM graded_progress WHERE user_id = $1', [userId]);
  const prog = new Map(rows.map((r) => [`${r.text_id}:${r.mode}`, r]));
  const view = (t) => {
    const p = (m) => { const r = prog.get(`${t.id}:${m}`); return r ? { best: r.best_score, total: r.total, passed: r.best_score / r.total >= PASS } : null; };
    return { id: t.id, level: t.level, kind: t.kind, title: t.title, titleTh: t.titleTh, topic: t.topic, words: t.words,
      minutes: Math.max(1, Math.round(t.audio.duration / 60)), questions: t.questions.length, reading: p('reading'), listening: p('listening') };
  };
  const all = texts().list.map(view);
  return {
    levels: LEVELS.map((l) => ({ level: l, texts: all.filter((t) => t.level === l) })),
    done: { reading: rows.filter((r) => r.mode === 'reading' && r.best_score / r.total >= PASS).length,
      listening: rows.filter((r) => r.mode === 'listening' && r.best_score / r.total >= PASS).length, total: all.length },
    exp: { perText: EXP_PER_TEXT, dailyCap: DAILY_CAP, passPercent: PASS * 100 },
  };
}

/** เปิดเรื่อง — โหมดฟังไม่ส่งเนื้อเรื่อง/คำแปลก่อนตอบ · ไม่ส่งเฉลยทุกโหมด */
async function get(userId, id, mode) {
  const t = textOf(id); modeOf(mode);
  const base = { id: t.id, level: t.level, kind: t.kind, title: t.title, titleTh: t.titleTh, topic: t.topic, words: t.words, mode,
    audio: { url: t.audio.url, duration: t.audio.duration, speed: t.audio.speed, segments: t.audio.segments },
    questions: t.questions.map((q, i) => ({ i, type: q.type, stem: q.stem, options: q.options })) };
  // tipTH อ้างประโยคในเรื่อง → โหมดฟังส่งหลังตอบเท่านั้น
  if (mode === 'reading') Object.assign(base, { paragraphs: t.paragraphs, translationTH: t.translationTH, glossary: t.glossary, tipTH: t.tipTH });
  const r = (await pool.query('SELECT best_score, total FROM graded_progress WHERE user_id = $1 AND text_id = $2 AND mode = $3', [userId, t.id, mode])).rows[0];
  base.best = r ? { best: r.best_score, total: r.total } : null;
  return base;
}

async function submit(userId, id, body = {}) {
  const t = textOf(id); const mode = modeOf(body.mode);
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers || answers.length !== t.questions.length) throw new GradedError(400, `ต้องตอบให้ครบ ${t.questions.length} ข้อ`, 'BAD_ANSWERS');
  const results = t.questions.map((q, i) => {
    const chosen = Number.isInteger(answers[i]) && answers[i] >= 0 && answers[i] < 4 ? answers[i] : null;
    return { i, chosen, answer: q.answer, correct: chosen === q.answer, evidence: q.evidence, explanationTH: q.explanationTH };
  });
  const score = results.filter((r) => r.correct).length;
  await pool.query(
    `INSERT INTO graded_progress (user_id, text_id, mode, best_score, total) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, text_id, mode) DO UPDATE SET best_score = GREATEST(graded_progress.best_score, EXCLUDED.best_score),
       attempts = graded_progress.attempts + 1,
       -- updated_at = เวลาที่ "ผ่าน" ล่าสุด (ใช้นับเควสต์กิจกรรมในช่วงเวลา) · ครั้งที่ไม่ผ่านไม่ขยับเวลา
       updated_at = CASE WHEN EXCLUDED.best_score::float / NULLIF(EXCLUDED.total, 0) >= $6 THEN NOW() ELSE graded_progress.updated_at END`, [userId, t.id, mode, score, results.length, PASS]);
  const skill = mode === 'reading' ? 'reading' : 'listening';
  await pool.query(
    `INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
     SELECT $1, $2, x.item, $3, x.ok, 'graded', $4 FROM UNNEST($5::text[], $6::boolean[]) AS x(item, ok)`,
    [userId, skill, t.level, mode, results.map((r) => `${t.id}:${r.i}`), results.map((r) => r.correct)]).catch(() => {});
  let exp = { gained: 0 };
  if (score / results.length >= PASS) exp = await grantOnce(userId, `gr:${mode}:${t.id}`, EXP_PER_TEXT, { reason: 'graded', dailyCap: DAILY_CAP });
  return {
    score, total: results.length, passed: score / results.length >= PASS, results,
    // หลังส่งแล้วเปิดเนื้อเรื่อง + คำแปล + คำศัพท์ (โหมดฟังใช้ทบทวนสิ่งที่ได้ยิน)
    paragraphs: t.paragraphs, translationTH: t.translationTH, glossary: t.glossary, tipTH: t.tipTH,
    exp: exp.gained || 0, capped: Boolean(score / results.length >= PASS && !exp.already && !exp.gained), levelInfo: exp.levelInfo || null, leveledUp: Boolean(exp.leveledUp),
  };
}

module.exports = { list, get, submit, reset, GradedError, EXP_PER_TEXT, DAILY_CAP, PASS };
