/*
  หมวดคำศัพท์ตามเทศกาล (v1.12.0) — วันฮาโลวีน · วันลอยกระทง (หมวดละ 40 คำ)
  - v1.12.2: เทศกาลละ 2 ระดับ — พื้นฐาน (halloween · loykrathong) และยาก B2–C2 (halloween-hard · loykrathong-hard) หมวดละ 40 คำ
  - เนื้อหา: data/theme-vocab/<category>.json เขียนขึ้นใหม่สำหรับ EnglishQuest · ผ่าน validator ก่อนใช้
  - เปิดได้ตลอดปี (ไม่ผูกกับช่วงกิจกรรม) · แยกจากเส้นทางการเรียน Oxford — ไม่แตะ word_progress / Unit / การปลดล็อกระดับ
  - แบบฝึก 10 ข้อ/ชุด: ทายความหมาย (อังกฤษ→ไทย) 5 ตัวเลือก เหมือนบทเรียนคำศัพท์ Oxford (v1.12.1 · เดิมผสม 3 แบบ)
    ชุดฝึกเก่าที่ค้างอยู่ (แบบเดิม 4 ตัวเลือก) ยังตอบต่อได้ — ตรวจตามตัวเลือกที่บันทึกไว้ในชุดนั้น
    สลับตัวเลือกทุกชุด · ตัวลวงไม่มาจากกลุ่มความหมายเดียวกัน (กันข้อที่ตอบได้หลายคำ) · ตรวจที่เซิร์ฟเวอร์ · ไม่ส่งเฉลยก่อนตอบ
  - ไม่ให้ EXP / Coin (เหมือนอังกฤษเพื่อการทำงาน) · ความคืบหน้า: ตอบถูกติดกัน 2 ครั้ง = จำได้แล้ว
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../config/db');
const { CATEGORIES, validateFile, wordRegex } = require('./validator');

const DIR = path.join(__dirname, '..', '..', 'data', 'theme-vocab');
const QUIZ_SIZE = 10;
const MASTER_STREAK = 2;
const CHOICES = 5;   // v1.12.1: ทายความหมาย 5 ตัวเลือก (1 ถูก + 4 ตัวลวง) เหมือนบทเรียนคำศัพท์ Oxford
const TYPES = ['meaning'];

class ThemeVocabError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

let bank = null;   // { cats: Map(id -> { ...cat, items[] }), items: Map(itemId -> item) }
function load() {
  if (bank) return bank;
  const cats = new Map(); const items = new Map();
  for (const c of CATEGORIES) {
    let json = null;
    try { json = JSON.parse(fs.readFileSync(path.join(DIR, `${c.id}.json`), 'utf8')); } catch (err) { console.warn(`[theme-vocab] โหลด ${c.id} ไม่ได้: ${err.message}`); }
    const r = json ? validateFile(json, c.id) : { errors: ['ไม่มีไฟล์'], items: [] };
    if (r.errors.length) console.warn(`[theme-vocab] ${c.id}: ${r.errors.length} error — ใช้ได้ ${r.items.length} คำ`);
    cats.set(c.id, { ...c, items: r.items });
    r.items.forEach((it) => items.set(it.id, { ...it, category: c.id }));
  }
  bank = { cats, items };
  return bank;
}
function reset() { bank = null; }

const catOf = (id) => {
  const c = load().cats.get(String(id || '').slice(0, 20));
  if (!c || !c.items.length) throw new ThemeVocabError('NOT_FOUND', 'ไม่พบหมวดคำศัพท์นี้', 404);
  return c;
};
const studyView = (it) => ({ id: it.id, word: it.word, pos: it.pos, th: it.th, level: it.level || null, example: it.example, exampleTH: it.exampleTH });

async function progressOf(userId, ids = null) {
  const { rows } = await pool.query(
    `SELECT item_id, correct, wrong, streak, last_at FROM theme_vocab_progress WHERE user_id = $1 ${ids ? 'AND item_id = ANY($2)' : ''}`, ids ? [userId, ids] : [userId]);
  return new Map(rows.map((r) => [r.item_id, r]));
}
const summary = (c, prog) => {
  const ps = c.items.map((it) => prog.get(it.id)).filter(Boolean);
  const right = ps.reduce((a, p) => a + p.correct, 0); const all = ps.reduce((a, p) => a + p.correct + p.wrong, 0);
  const sib = [...load().cats.values()].filter((x) => x.festival === c.festival && x.items.length).map((x) => ({ id: x.id, level: x.level, levelTH: x.levelTH, cefr: x.cefr }));
  return { id: c.id, festival: c.festival, level: c.level, levelTH: c.levelTH, cefr: c.cefr, levels: sib,
    th: c.th, en: c.en, icon: c.icon, dateTH: c.dateTH, introTH: c.introTH, total: c.items.length,
    practiced: ps.length, mastered: ps.filter((p) => p.streak >= MASTER_STREAK).length, accuracy: all ? Math.round((right / all) * 100) : null };
};

async function hub(userId) {
  const prog = await progressOf(userId);
  return { categories: [...load().cats.values()].filter((c) => c.items.length).map((c) => summary(c, prog)), quizSize: QUIZ_SIZE };
}

async function category(userId, id) {
  const c = catOf(id);
  const prog = await progressOf(userId, c.items.map((it) => it.id));
  return { ...summary(c, prog), items: c.items.map((it) => {
    const p = prog.get(it.id);
    return { ...studyView(it), progress: p ? { correct: p.correct, wrong: p.wrong, mastered: p.streak >= MASTER_STREAK } : null };
  }) };
}

const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** ตัวลวง CHOICES-1 คำ: ไม่ใช่กลุ่มความหมายเดียวกัน · ชนิดคำเดียวกันก่อน (ข้อไม่ง่ายเกินไป) · เติมคำ: ไม่เอาคำที่อยู่ในประโยคแล้ว */
function distractors(c, it, type) {
  const pool2 = shuffle(c.items.filter((o) => o.id !== it.id && (!it.group || o.group !== it.group)
    && !(type === 'cloze' && wordRegex(o.word).test(it.example))));
  pool2.sort((a, b) => Number(b.pos === it.pos) - Number(a.pos === it.pos));
  return pool2.slice(0, CHOICES - 1);
}
function blank(it) { return it.example.replace(wordRegex(it.word), '___'); }

function publicQ(s, k) {
  const q = s.items[k]; const b = load(); const it = b.items.get(q.itemId);
  const opts = q.opts.map((id) => b.items.get(id));
  const prompt = q.type === 'meaning' ? it.word : q.type === 'reverse' ? it.th : blank(it);
  return { k, type: q.type, prompt, ...(q.type === 'meaning' ? { pos: it.pos, level: it.level || null } : {}),
    options: opts.map((o) => (q.type === 'meaning' ? o.th : o.word)), selected: q.selected, ...(q.selected != null ? feedback(q, it) : {}) };
}
function feedback(q, it) {
  return { correct: q.correct, correctChoice: q.opts.indexOf(it.id), word: it.word, th: it.th, pos: it.pos, example: it.example, exampleTH: it.exampleTH };
}
const sessionView = (s) => ({ id: Number(s.id), category: s.category, status: s.status, total: s.total, score: s.score,
  answered: s.items.filter((q) => q.selected != null).length, questions: s.items.map((_, k) => publicQ(s, k)) });

/** แบบฝึก 10 ข้อ: คำที่ยังไม่เคยฝึก/ยังจำไม่ได้/ฝึกนานแล้วก่อน · ผสม 3 แบบ */
async function startQuiz(userId, id) {
  const c = catOf(id);
  const prog = await progressOf(userId, c.items.map((it) => it.id));
  const rank = (p) => (p ? (p.streak >= MASTER_STREAK ? 2 : 1) : 0);
  const picked = shuffle(c.items).sort((a, b) => {
    const pa = prog.get(a.id); const pb = prog.get(b.id);
    return rank(pa) - rank(pb) || (pa && pb ? Date.parse(pa.last_at) - Date.parse(pb.last_at) : 0);
  }).slice(0, Math.min(QUIZ_SIZE, c.items.length));
  const types = shuffle(picked.map((_, i) => TYPES[i % TYPES.length]));
  const items = shuffle(picked).map((it, i) => ({ itemId: it.id, type: types[i],
    opts: shuffle([it, ...distractors(c, it, types[i])]).map((o) => o.id), selected: null, correct: null }));
  await pool.query(`UPDATE theme_vocab_sessions SET status = 'finished', finished_at = NOW() WHERE user_id = $1 AND status = 'active'`, [userId]);
  const { rows } = await pool.query('INSERT INTO theme_vocab_sessions (user_id, category, items, total) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, c.id, JSON.stringify(items), items.length]);
  return sessionView(rows[0]);
}

async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ThemeVocabError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM theme_vocab_sessions WHERE id = $1 AND user_id = $2', [sid, userId]);
  if (!rows[0]) throw new ThemeVocabError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
  return rows[0];
}
async function getQuiz(userId, sid) { return sessionView(await loadSession(userId, sid)); }

async function answer(userId, sid, body = {}) {
  const k = Number(body.k); const choice = Number(body.choice);
  if (!/^\d{1,15}$/.test(String(sid))) throw new ThemeVocabError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
  if (!Number.isInteger(choice) || choice < 0 || choice >= CHOICES) throw new ThemeVocabError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM theme_vocab_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [sid, userId]);
    const s = rows[0];
    if (!s) throw new ThemeVocabError('NOT_FOUND', 'ไม่พบแบบฝึกนี้', 404);
    if (s.status !== 'active') throw new ThemeVocabError('CLOSED', 'แบบฝึกนี้จบแล้ว', 409);
    if (!Number.isInteger(k) || k < 0 || k >= s.items.length) throw new ThemeVocabError('BAD_INDEX', 'ไม่พบข้อนี้');
    const q = s.items[k];
    if (q.selected != null) throw new ThemeVocabError('ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
    if (choice >= q.opts.length) throw new ThemeVocabError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
    const it = load().items.get(q.itemId);
    q.selected = choice; q.correct = q.opts[choice] === q.itemId;
    await client.query('UPDATE theme_vocab_sessions SET items = $2 WHERE id = $1', [s.id, JSON.stringify(s.items)]);
    await client.query(
      `INSERT INTO theme_vocab_progress (user_id, item_id, correct, wrong, streak, last_at) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, item_id) DO UPDATE SET correct = theme_vocab_progress.correct + EXCLUDED.correct, wrong = theme_vocab_progress.wrong + EXCLUDED.wrong,
         streak = CASE WHEN EXCLUDED.correct = 1 THEN theme_vocab_progress.streak + 1 ELSE 0 END, last_at = NOW()`,
      [userId, q.itemId, q.correct ? 1 : 0, q.correct ? 0 : 1, q.correct ? 1 : 0]);
    await client.query('COMMIT');
    return { k, answered: s.items.filter((x) => x.selected != null).length, total: s.total, ...feedback(q, it) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

async function finish(userId, sid) {
  const s = await loadSession(userId, sid);
  if (s.status === 'active') {
    const score = s.items.filter((q) => q.correct).length;
    await pool.query(`UPDATE theme_vocab_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active'`, [s.id, userId, score]);
  }
  const done = await loadSession(userId, sid);
  const c = catOf(done.category);
  const prog = await progressOf(userId, c.items.map((it) => it.id));
  return { ...sessionView(done), mastered: [...prog.values()].filter((p) => p.streak >= MASTER_STREAK).length, categoryTotal: c.items.length };
}

module.exports = { ThemeVocabError, hub, category, startQuiz, getQuiz, answer, finish, reset, _internal: { load, blank, QUIZ_SIZE, MASTER_STREAK, CHOICES } };
