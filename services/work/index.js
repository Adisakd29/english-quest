/*
  ภาษาอังกฤษเพื่อการทำงาน (English for Work) — หมวดเนื้อหาเฉพาะสมาชิก Premium
  - เนื้อหา: data/premium/work/<topic>.json (6 หัวข้อ × 12 วลี) ผ่าน validator ก่อนใช้
  - สิทธิ์ตรวจที่เซิร์ฟเวอร์ทุกคำขอ (สมาชิก Premium ที่ยังไม่หมดอายุ หรือผู้ดูแล) · ผู้ที่ยังไม่เป็นสมาชิกเห็นตัวอย่าง 2 วลีต่อหัวข้อ
  - แบบฝึก 10 ข้อ/ชุด: สถานการณ์ (เลือกประโยค) + เติมคำ · สลับตำแหน่งตัวเลือกทุกชุด · ตรวจคำตอบที่เซิร์ฟเวอร์ · ไม่ส่งเฉลยก่อนตอบ
  - ไม่ให้ EXP / Coin (กันผู้ที่จ่ายเงินได้เปรียบในกระดานอันดับ) · เก็บความคืบหน้า (ตอบถูกติดกัน 2 ครั้ง = ชำนาญ)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../config/db');
const { TOPICS, validateFile } = require('./validator');

const DIR = path.join(__dirname, '..', '..', 'data', 'premium', 'work');
const QUIZ_SIZE = 10;
const PREVIEW = 2;
const MASTER_STREAK = 2;

class WorkError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

let bank = null;   // { topics: Map(id -> { ...topic, items[] }), items: Map(itemId -> item) }
function load() {
  if (bank) return bank;
  const topics = new Map(); const items = new Map();
  for (const t of TOPICS) {
    let json = null;
    try { json = JSON.parse(fs.readFileSync(path.join(DIR, `${t.id}.json`), 'utf8')); } catch (err) { console.warn(`[work] โหลด ${t.id} ไม่ได้: ${err.message}`); }
    const r = json ? validateFile(json, t.id) : { errors: ['ไม่มีไฟล์'], items: [] };
    if (r.errors.length) console.warn(`[work] ${t.id}: ${r.errors.length} error — ใช้ได้ ${r.items.length} รายการ`);
    topics.set(t.id, { ...t, items: r.items });
    r.items.forEach((it) => items.set(it.id, { ...it, topic: t.id }));
  }
  bank = { topics, items };
  return bank;
}
function reset() { bank = null; }

async function canAccess(userId, role) {
  if (role === 'admin') return true;
  return require('../membership').isPremium(userId).catch(() => false);
}
const studyView = (it) => ({ id: it.id, phrase: it.phrase, th: it.th, noteTH: it.noteTH, level: it.level, register: it.register, example: it.example, exampleTH: it.exampleTH });

async function progressOf(userId, ids = null) {
  const { rows } = await pool.query(
    `SELECT item_id, correct, wrong, streak, last_at FROM work_progress WHERE user_id = $1 ${ids ? 'AND item_id = ANY($2)' : ''}`, ids ? [userId, ids] : [userId]);
  return new Map(rows.map((r) => [r.item_id, r]));
}

async function hub(userId, role) {
  const b = load();
  const access = await canAccess(userId, role);
  const prog = await progressOf(userId);
  const topics = [...b.topics.values()].map((t) => {
    const ps = t.items.map((it) => prog.get(it.id)).filter(Boolean);
    const right = ps.reduce((a, p) => a + p.correct, 0); const all = ps.reduce((a, p) => a + p.correct + p.wrong, 0);
    return { id: t.id, th: t.th, en: t.en, icon: t.icon, total: t.items.length,
      practiced: ps.length, mastered: ps.filter((p) => p.streak >= MASTER_STREAK).length, accuracy: all ? Math.round((right / all) * 100) : null,
      preview: access ? null : t.items.slice(0, PREVIEW).map((it) => ({ phrase: it.phrase, th: it.th })) };
  });
  return { access, topics, totalItems: b.items.size, quizSize: QUIZ_SIZE };
}

async function topic(userId, role, id) {
  const t = load().topics.get(String(id));
  if (!t) throw new WorkError('NOT_FOUND', 'ไม่พบหัวข้อนี้', 404);
  const access = await canAccess(userId, role);
  const base = { id: t.id, th: t.th, en: t.en, icon: t.icon, total: t.items.length };
  if (!access) return { ...base, locked: true, items: t.items.slice(0, PREVIEW).map(studyView) };
  const prog = await progressOf(userId, t.items.map((it) => it.id));
  return { ...base, locked: false, items: t.items.map((it) => {
    const p = prog.get(it.id);
    return { ...studyView(it), progress: p ? { correct: p.correct, wrong: p.wrong, mastered: p.streak >= MASTER_STREAK } : null };
  }) };
}

const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const qOf = (it, type) => (type === 'cloze' ? it.cloze : it.situation);
function publicQ(s, k) {
  const q = s.items[k]; const it = load().items.get(q.itemId); const src = qOf(it, q.type);
  return { k, type: q.type, prompt: q.type === 'cloze' ? src.sentence : src.promptTH, options: q.perm.map((i) => src.options[i]),
    selected: q.selected, ...(q.selected != null ? feedback(q, it) : {}) };
}
function feedback(q, it) {
  const src = qOf(it, q.type);
  return { correct: q.correct, correctChoice: q.perm.indexOf(src.answer), whyTH: src.whyTH, phrase: it.phrase, example: it.example, exampleTH: it.exampleTH };
}
const sessionView = (s) => ({ id: Number(s.id), topic: s.topic, status: s.status, total: s.total, score: s.score,
  answered: s.items.filter((q) => q.selected != null).length, questions: s.items.map((_, k) => publicQ(s, k)) });

async function requireAccess(userId, role) {
  if (!(await canAccess(userId, role))) throw new WorkError('PREMIUM_REQUIRED', 'เนื้อหานี้สำหรับสมาชิก Premium', 403);
}

/** สร้างแบบฝึก 10 ข้อ: ข้อที่ยังไม่ชำนาญ/นานแล้วก่อน · ผสมสถานการณ์กับเติมคำ */
async function startQuiz(userId, role, topicId) {
  await requireAccess(userId, role);
  const t = load().topics.get(String(topicId));
  if (!t || !t.items.length) throw new WorkError('NOT_FOUND', 'ไม่พบหัวข้อนี้', 404);
  const prog = await progressOf(userId, t.items.map((it) => it.id));
  const ranked = shuffle(t.items).sort((a, b) => {
    const pa = prog.get(a.id); const pb = prog.get(b.id);
    const sa = pa ? (pa.streak >= MASTER_STREAK ? 2 : 1) : 0; const sb = pb ? (pb.streak >= MASTER_STREAK ? 2 : 1) : 0;
    return sa - sb || (pa && pb ? Date.parse(pa.last_at) - Date.parse(pb.last_at) : 0);
  }).slice(0, Math.min(QUIZ_SIZE, t.items.length));
  const types = shuffle(ranked.map((_, i) => (i % 2 ? 'cloze' : 'situation')));
  const items = shuffle(ranked).map((it, i) => ({ itemId: it.id, type: types[i], perm: shuffle([0, 1, 2, 3]), selected: null, correct: null }));
  await pool.query(`UPDATE work_sessions SET status = 'finished', finished_at = NOW() WHERE user_id = $1 AND status = 'active'`, [userId]);
  const { rows } = await pool.query('INSERT INTO work_sessions (user_id, topic, items, total) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, t.id, JSON.stringify(items), items.length]);
  return sessionView(rows[0]);
}

async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new WorkError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM work_sessions WHERE id = $1 AND user_id = $2', [sid, userId]);
  if (!rows[0]) throw new WorkError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
  return rows[0];
}
async function getQuiz(userId, role, sid) { await requireAccess(userId, role); return sessionView(await loadSession(userId, sid)); }

async function answer(userId, role, sid, body = {}) {
  await requireAccess(userId, role);
  const k = Number(body.k); const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new WorkError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM work_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [String(sid).slice(0, 15), userId]);
    const s = rows[0];
    if (!s) throw new WorkError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
    if (s.status !== 'active') throw new WorkError('CLOSED', 'แบบฝึกนี้จบแล้ว', 409);
    if (!Number.isInteger(k) || k < 0 || k >= s.items.length) throw new WorkError('BAD_INDEX', 'ไม่พบข้อนี้');
    const q = s.items[k];
    if (q.selected != null) throw new WorkError('ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
    const it = load().items.get(q.itemId);
    q.selected = choice; q.correct = q.perm[choice] === qOf(it, q.type).answer;
    await client.query('UPDATE work_sessions SET items = $2 WHERE id = $1', [s.id, JSON.stringify(s.items)]);
    await client.query(
      `INSERT INTO work_progress (user_id, item_id, correct, wrong, streak, last_at) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, item_id) DO UPDATE SET correct = work_progress.correct + EXCLUDED.correct, wrong = work_progress.wrong + EXCLUDED.wrong,
         streak = CASE WHEN EXCLUDED.correct = 1 THEN work_progress.streak + 1 ELSE 0 END, last_at = NOW()`,
      [userId, q.itemId, q.correct ? 1 : 0, q.correct ? 0 : 1, q.correct ? 1 : 0]);
    await client.query('COMMIT');
    return { k, answered: s.items.filter((x) => x.selected != null).length, total: s.total, ...feedback(q, it) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

async function finish(userId, role, sid) {
  await requireAccess(userId, role);
  const s = await loadSession(userId, sid);
  if (s.status === 'active') {
    const score = s.items.filter((q) => q.correct).length;
    await pool.query(`UPDATE work_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active'`, [s.id, userId, score]);
  }
  const done = await loadSession(userId, sid);
  const prog = await progressOf(userId, load().topics.get(done.topic).items.map((it) => it.id));
  return { ...sessionView(done), mastered: [...prog.values()].filter((p) => p.streak >= MASTER_STREAK).length, topicTotal: load().topics.get(done.topic).items.length };
}

module.exports = { WorkError, hub, topic, startQuiz, getQuiz, answer, finish, canAccess, reset, _internal: { load, QUIZ_SIZE, PREVIEW } };
