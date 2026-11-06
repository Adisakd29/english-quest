/*
  บทเรียนคำศัพท์ v2 (v1.10.0 Phase 2)
  - เซิร์ฟเวอร์เลือกคำ สร้างโจทย์ และเก็บเฉลยไว้ใน vocab_lesson_sessions — client ได้แค่ "รหัสตัวเลือก" แบบสุ่ม
    (เดิม client รู้เฉลยและส่ง chosenWordId มาเอง จึงส่งคำตอบถูกได้โดยไม่ต้องรู้คำ)
  - แบบฝึก 5 แบบ:
      meaning  เห็นคำอังกฤษ → เลือกความหมายไทย (คำใหม่เริ่มที่แบบนี้เสมอ)
      reverse  เห็นความหมายไทย → เลือกคำอังกฤษ
      context  ประโยคตัวอย่างเว้นช่อง → เลือกคำที่เติม (ใช้เฉพาะประโยคที่ผ่านการตรวจว่ามีคำตอบเดียว: learner.gapOk)
      spell    ความหมายไทย + ประโยคเว้นช่อง → พิมพ์คำ (ทบทวนคำที่เคยผ่านแล้วเท่านั้น)
      listen   ฟังเสียง → เลือกคำที่ได้ยิน (โหมดฟัง)
  - ตอบแล้วบันทึกด้วย recordCardAnswer (กติกา SRS/EXP เดียวกับเดิมทุกข้อ) · ตอบแต่ละข้อได้ครั้งเดียว
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const wordStore = require('../../utils/wordStore');
const { getContent } = require('../../utils/vocabContent');
const { recordCardAnswer } = require('./record');

const SESSION_SIZE = 12;
const CHOICES_TH = 5;          // meaning: 1 ถูก + 4 ตัวลวง (เหมือนเดิม)
const CHOICES_EN = 4;          // reverse/context/listen
const SESSION_TTL_HOURS = 3;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const MODES = ['learn', 'review', 'due', 'listen'];

class LessonError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const rnd = (n) => crypto.randomInt(0, n);
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rnd(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }
const key = () => crypto.randomBytes(6).toString('base64url');
const headOf = (w) => String(w.word || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
const norm = (s) => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

// คำแปลใกล้กันเกินไป (ซ้ำ/ซ้อนกัน/ตัวอักษรคู่เดียวกันเกินครึ่ง) — ห้ามอยู่ข้อเดียวกัน (เหมือนฝั่งหน้าเว็บเดิม)
function thaiBigrams(s) { const t = String(s || '').replace(/[\s/(),.·;:-]/g, ''); const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; }
function tooClose(a, b) {
  const x = String(a || '').trim().toLowerCase(); const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)))) return true;
  const A = thaiBigrams(x); const B = thaiBigrams(y);
  if (!A.size || !B.size) return false;
  let n = 0; A.forEach((g) => { if (B.has(g)) n += 1; });
  return n / Math.min(A.size, B.size) >= 0.5;
}

/** ตัวลวง n ตัว: ชนิดคำเดียวกันก่อน · ไม่ซ้ำคำ · ความหมายไทยไม่ใกล้เฉลย/กันเอง (เดาจากชนิดคำ/ความหมายซ้อนไม่ได้) */
function pickDecoys(target, pool, n, { useThai = true } = {}) {
  const head = headOf(target).toLowerCase();
  const ok = pool.filter((p) => p.id !== target.id && headOf(p).toLowerCase() !== head && (!useThai || (p.thai && !tooClose(p.thai, target.thai))));
  const same = shuffle(ok.filter((p) => p.category === target.category));
  const other = shuffle(ok.filter((p) => p.category !== target.category));
  const out = [];
  for (const d of [...same, ...other]) {
    if (out.length >= n) break;
    if (out.some((o) => headOf(o).toLowerCase() === headOf(d).toLowerCase() || (useThai && tooClose(o.thai, d.thai)))) continue;
    out.push(d);
  }
  return out;
}

/** ประโยคเว้นช่องได้ไหม: ตรวจแล้วว่ามีคำตอบเดียว · รูปคำในประโยค = ตัวคำ (ไม่ผันรูป ตัวเลือกจึงไม่เฉลยด้วยรูปคำ) */
function gapEligible(w, content) {
  const L = w.learner;
  if (!L || !L.gapOk || !content || !content.example || !content.learner) return false;
  return norm(L.form) === norm(headOf(w)) && /^[A-Za-z][A-Za-z' -]*$/.test(L.form);
}
function blankOut(sentence, form) {
  const esc = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(sentence).replace(new RegExp(`(^|[^A-Za-z'’-])${esc}(?=$|[^A-Za-z'’-])`), '$1_____');
}

function chooseType({ mode, seen, passed, gap, idx }) {
  if (mode === 'listen') return 'listen';
  if (!seen) return 'meaning';                                    // คำใหม่: รู้จักความหมายก่อน
  if (mode === 'learn' && !passed) return gap ? ['reverse', 'context'][idx % 2] : ['reverse', 'meaning'][idx % 2];
  const pool = gap ? ['context', 'spell', 'reverse'] : ['reverse', 'meaning'];   // ทบทวน: ดึงคำออกมาจากความจำ
  return pool[idx % pool.length];
}

function buildQuestion(w, type, { pool, content }) {
  const c = content.get(w.id) || {};
  const base = { wordId: w.id, type };
  if (type === 'meaning') {
    const opts = shuffle([w, ...pickDecoys(w, pool, CHOICES_TH - 1)]).map((o) => ({ key: key(), wordId: o.id, text: o.thai }));
    return { ...base, options: opts, answerKey: opts.find((o) => o.wordId === w.id).key,
      pub: { word: w.word, pos: w.pos || '', ipa: c.ipa || null, speak: headOf(w) } };
  }
  if (type === 'spell') {
    const form = w.learner.form;
    return { ...base, answer: form,
      pub: { promptTH: w.thai, pos: w.pos || '', sentence: blankOut(c.example, form), hint: { first: form[0], length: form.length } } };
  }
  // ตัวเลือกภาษาอังกฤษ: reverse / context / listen
  const useThai = type !== 'listen';
  const decoys = pickDecoys(w, pool, CHOICES_EN - 1, { useThai });
  const opts = shuffle([w, ...decoys]).map((o) => ({ key: key(), wordId: o.id, text: headOf(o) }));
  const q = { ...base, options: opts, answerKey: opts.find((o) => o.wordId === w.id).key };
  if (type === 'reverse') q.pub = { promptTH: w.thai, pos: w.pos || '' };
  else if (type === 'context') q.pub = { sentence: blankOut(c.example, w.learner.form), pos: w.pos || '' };
  else q.pub = { speak: headOf(w), ipa: null };
  return q;
}

/** คำถามแบบที่ส่งให้ client (ไม่มี wordId / เฉลย) */
function publicQuestion(q, i) {
  const out = { i, type: q.type, ...q.pub };
  if (q.options) out.options = q.options.map((o) => ({ key: o.key, text: o.text }));
  return out;
}

async function loadUnit(userId, level, unitId, explore, listen) {
  const { getUserPathState, unitTitle } = require('../../routes/path');
  const { units, levels } = await getUserPathState(userId, listen ? 'listening' : 'read');
  const unit = (units[level] || []).find((u) => u.id === unitId);
  if (!unit) throw new LessonError(404, 'ไม่พบ Unit นี้');
  const st = levels.find((l) => l.level === level).units.find((u) => u.id === unitId);
  if (st.status === 'locked' && !explore) throw new LessonError(403, 'Unit นี้ยังล็อกอยู่ ผ่าน Unit ก่อนหน้าก่อน หรือเปิดโหมดสำรวจอิสระ', 'UNIT_LOCKED');
  return { id: unit.id, wordIds: new Set(unit.wordIds), title: unitTitle(unit) };
}

/**
 * เริ่มรอบฝึก
 * @param {{level:string, unitId?:string, explore?:boolean, mode?:string}} o
 */
async function start(userId, o = {}) {
  const level = String(o.level || '').toUpperCase();
  const mode = MODES.includes(o.mode) ? o.mode : 'learn';
  if (!LEVELS.includes(level)) throw new LessonError(400, 'ระดับไม่ถูกต้อง');
  if (o.unitId != null && !/^[A-C][12]-[a-z]+-\d+$/.test(String(o.unitId))) throw new LessonError(400, 'รหัส Unit ไม่ถูกต้อง');
  await wordStore.ready();
  const listen = mode === 'listen';
  const all = wordStore.getLevelWords(level).filter((w) => wordStore.CONTENT_CATEGORIES.has(w.category) && (listen || w.thai));
  const unit = o.unitId ? await loadUnit(userId, level, String(o.unitId), Boolean(o.explore), listen) : null;
  const words = unit ? all.filter((w) => unit.wordIds.has(w.id)) : all;
  if (!words.length) throw new LessonError(409, unit ? 'Unit นี้ยังไม่มีคำที่พร้อมฝึก (คำแปลรอตรวจ) ลอง Unit ถัดไปได้เลย' : 'ระดับนี้ยังไม่มีคำที่พร้อมฝึก', 'NO_WORDS');

  const table = listen ? 'listening_progress' : 'word_progress';
  const { rows } = await pool.query(
    `SELECT word_id, status, ever_known, times_seen, ${listen ? 'NULL::timestamptz AS srs_due_at' : 'srs_due_at'}
       FROM ${table} WHERE user_id = $1 AND word_id = ANY($2)`, [userId, words.map((w) => w.id)]);
  const prog = new Map(rows.map((r) => [r.word_id, r]));
  const now = Date.now();
  const passedOf = (w) => { const p = prog.get(w.id); return Boolean(p && (p.status === 'known' || p.ever_known)); };
  const dueOf = (w) => { const p = prog.get(w.id); return Boolean(!listen && passedOf(w) && p.srs_due_at && new Date(p.srs_due_at).getTime() <= now); };

  const notPassed = words.filter((w) => !passedOf(w));
  const passed = words.filter(passedOf);
  let picked; let reviewing = mode !== 'learn' && mode !== 'listen';
  if (mode === 'due') {
    picked = shuffle(passed.filter(dueOf));
    if (!picked.length) throw new LessonError(409, 'ยังไม่มีคำที่ถึงกำหนดทบทวนในระดับนี้', 'NOTHING_DUE');
  } else if (mode === 'review') {
    picked = [...shuffle(passed.filter(dueOf)), ...shuffle(passed.filter((w) => !dueOf(w)))];
  } else if (notPassed.length) {
    picked = shuffle(notPassed);
  } else {
    reviewing = true;  // รู้ครบแล้ว → รอบนี้เป็นการทบทวน (คำถึงกำหนดก่อน)
    picked = [...shuffle(passed.filter(dueOf)), ...shuffle(passed.filter((w) => !dueOf(w)))];
  }
  picked = picked.slice(0, SESSION_SIZE);
  if (!picked.length) throw new LessonError(409, 'ยังไม่มีคำให้ทบทวนในระดับนี้ — เรียนคำใหม่ก่อนได้เลย', 'NO_WORDS');

  // ตัวลวง: โหมด Unit ใช้คำนอก Unit ด้วย (Unit มี 8–27 คำ ตัวลวงอาจไม่พอ) · คลังคำใหญ่พอจะเลือกตัวลวงที่ไม่ใกล้เฉลย
  const decoyPool = all;
  const content = await getContent(picked.map((w) => w.id)).catch(() => new Map());
  const questions = picked.map((w, idx) => {
    const p = prog.get(w.id);
    const type = chooseType({ mode: listen ? 'listen' : (reviewing ? 'review' : 'learn'), seen: Boolean(p && p.times_seen > 0), passed: passedOf(w), gap: gapEligible(w, content.get(w.id)), idx });
    return buildQuestion(w, type, { pool: decoyPool, content });
  }).filter((q) => !q.options || q.options.length >= 3);   // ตัวเลือกไม่พอ (คลังเล็กมาก) → ข้ามข้อนั้น
  if (!questions.length) throw new LessonError(503, 'ยังสร้างตัวเลือกไม่ได้ ลองใหม่อีกครั้ง');

  const id = crypto.randomUUID();
  await pool.query('DELETE FROM vocab_lesson_sessions WHERE user_id = $1 AND created_at < NOW() - INTERVAL \'2 days\'', [userId]);
  await pool.query(
    `INSERT INTO vocab_lesson_sessions (id, user_id, level, unit_id, mode, questions, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(hours => $7::int))`,
    [id, userId, level, unit ? unit.id : null, listen ? 'listen' : (reviewing ? (mode === 'due' ? 'due' : 'review') : 'learn'), JSON.stringify(questions), SESSION_TTL_HOURS]);
  return {
    sessionId: id, level, mode: listen ? 'listen' : (reviewing ? (mode === 'due' ? 'due' : 'review') : 'learn'),
    reviewAll: reviewing && mode === 'learn',
    unit: unit ? { id: unit.id, ...unit.title } : null,
    total: questions.length,
    questions: questions.map(publicQuestion),
  };
}

/** ตอบ 1 ข้อ: { i, key } (ตัวเลือก) หรือ { i, text } (สะกดคำ) */
async function answer(userId, sessionId, body = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(sessionId))) throw new LessonError(400, 'รหัสรอบฝึกไม่ถูกต้อง');
  const i = Number(body.i);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const s = (await client.query('SELECT * FROM vocab_lesson_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [sessionId, userId])).rows[0];
    if (!s) throw new LessonError(404, 'ไม่พบรอบฝึกนี้');
    if (new Date(s.expires_at).getTime() < Date.now()) throw new LessonError(410, 'รอบฝึกนี้หมดเวลาแล้ว เริ่มรอบใหม่ได้เลย', 'EXPIRED');
    const q = Number.isInteger(i) ? s.questions[i] : null;
    if (!q) throw new LessonError(400, 'ไม่พบข้อนี้');
    if (s.answers[String(i)]) throw new LessonError(409, 'ตอบข้อนี้ไปแล้ว', 'ANSWERED');

    let correct;
    if (q.type === 'spell') {
      if (typeof body.text !== 'string' || body.text.length > 60) throw new LessonError(400, 'คำตอบไม่ถูกต้อง');
      correct = norm(body.text) === norm(q.answer);
    } else {
      if (typeof body.key !== 'string' || !q.options.some((o) => o.key === body.key)) throw new LessonError(400, 'ตัวเลือกไม่ถูกต้อง');
      correct = body.key === q.answerKey;
    }
    const result = await recordCardAnswer(client, {
      userId, wordId: q.wordId, level: s.level, known: correct,
      skill: s.mode === 'listen' ? 'listening' : 'vocab', rating: correct ? 'good' : 'again',
    });
    await client.query(`UPDATE vocab_lesson_sessions SET answers = answers || jsonb_build_object($2::text, jsonb_build_object('correct', $3::boolean, 'at', NOW())) WHERE id = $1`,
      [sessionId, String(i), correct]);
    await client.query('COMMIT');

    const w = wordStore.findWord(s.level, q.wordId) || {};
    const c = (await getContent([q.wordId]).catch(() => new Map())).get(q.wordId) || {};
    const full = (await pool.query('SELECT thai_meaning FROM vocab_senses WHERE public_id = $1', [q.wordId]).catch(() => ({ rows: [] }))).rows[0];
    return {
      ...result,
      type: q.type,
      correctKey: q.answerKey || null,
      correctText: q.type === 'spell' ? q.answer : (q.options.find((o) => o.key === q.answerKey) || {}).text,
      word: {
        id: q.wordId, word: w.word, head: headOf(w), pos: w.pos || '', thai: (full && full.thai_meaning) || w.thai || null,
        ipa: c.ipa || null, definition: c.definition || null, example: c.example || null, exampleTH: c.exampleTH || null,
        noteTH: c.noteTH || null, collocations: c.collocations || [], synonyms: c.synonyms || [],
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { start, answer, LessonError, SESSION_SIZE, _internal: { chooseType, gapEligible, blankOut, tooClose, pickDecoys, headOf, norm } };
