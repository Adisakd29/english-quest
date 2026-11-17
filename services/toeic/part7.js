/*
  TOEIC-style Reading Part 7 — Reading Comprehension (Practice / Mock Test)
  1 ชุด = เอกสาร 1–3 ฉบับ + 2–5 คำถาม · คำตอบรายข้อเก็บใน toeic_answers (question_id = "<P7-xxxx>-<k>")

  ความปลอดภัย:
    - ก่อนตอบหน้าเว็บได้เอกสาร + คำถาม + ตัวเลือก (สลับลำดับ ยกเว้นข้อแทรกประโยค [1]–[4]) · ไม่มีเฉลย/หลักฐาน/คำแปล
    - ตรวจที่เซิร์ฟเวอร์ · EXP/Coin ผ่าน utils/exp.js (t7q/t7c/t7m — Coin ใช้กฎ TOEIC เดิม เพดานร่วม)
  Practice : 1/3/5 ชุด · เลือกเอกสารเดี่ยว/หลายฉบับ · เฉลยรายข้อทันที + ไฮไลต์หลักฐานในเอกสาร · ครบชุดเห็นคำแปลเอกสาร
  Mock     : เอกสารเดี่ยว 4 ชุด + 2 ฉบับ 1 + 3 ฉบับ 1 (~22 ข้อ) · 1 นาที/ข้อ · เปลี่ยนคำตอบได้จนกว่าจะส่ง
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART7, DISCLAIMER_TH } = require('../../config/toeic');
const { ToeicError } = require('./part1');
const { LETTERS } = require('./part7Validator');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const GROUPS = Object.keys(PART7.groupTh);
const GROUP_OF = { mainIdea: 'detail', detail: 'detail', inference: 'inference', intent: 'inference', vocabulary: 'vocabulary', notTrue: 'notTrue', insertion: 'insertion', crossReference: 'cross' };
const groupOf = (type) => GROUP_OF[type] || 'detail';
const PERMS = (() => {
  const out = [];
  const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], [...rest.slice(0, i), ...rest.slice(i + 1)])); };
  rec([], [0, 1, 2, 3]);
  return out;
})();
const permOf = (v) => PERMS[Number.isInteger(v) && v >= 0 && v < 24 ? v : 0];     // PERMS[0] = [0,1,2,3]
const correctLetter = (q, v) => LETTERS[permOf(v).indexOf(q.answer)];
const qId = (pid, k) => `${pid}-${k}`;
const parseQ = (id) => { const m = /^(P7-\d{4})-([1-5])$/.exec(String(id || '')); return m ? { pid: m[1], k: Number(m[2]) } : null; };
const isMulti = (p) => p.format !== 'single';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick(items, weight, n) {
  const left = items.map((x) => ({ x, w: Math.max(0.001, weight(x)) }));
  const out = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total; let i = 0;
    for (; i < left.length - 1; i += 1) { r -= left[i].w; if (r <= 0) break; }
    out.push(left.splice(i, 1)[0].x);
  }
  return out;
}

async function history(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 7 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC`, [userId]);
  const byP = new Map();
  rows.forEach((r) => { const b = parseQ(r.question_id); if (!b) return; const h = byP.get(b.pid) || { seen: 0, wrong: 0 }; h.seen += 1; if (!r.is_correct) h.wrong += 1; byP.set(b.pid, h); });
  return byP;
}
const weightFor = (h) => (p) => { const x = h.get(p.id); return !x ? 2.2 : x.wrong ? 1.6 : 0.3; };

async function pickPractice(userId, cfg) {
  const all = await bank.pool7();
  const h = await history(userId);
  if (cfg.source === 'mistakes') {
    const c = all.filter((p) => h.get(p.id) && h.get(p.id).wrong);
    if (!c.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีชุดที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return shuffle(c).slice(0, cfg.size);
  }
  let c = all.filter((p) => cfg.format === 'mixed' || (cfg.format === 'multi' ? isMulti(p) : !isMulti(p)));
  if (cfg.group) { const g = all.filter((p) => p.questions.some((q) => groupOf(q.type) === cfg.group)); if (g.length) c = g; }
  if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) { const f = c.filter((p) => p.difficulty === cfg.difficulty); if (f.length >= cfg.size) c = f; }
  // เอกสารเดี่ยวก่อน แล้วค่อยหลายฉบับ (ลำดับเดียวกับข้อสอบจริง)
  return weightedPick(c, weightFor(h), cfg.size).sort((a, b) => a.docs.length - b.docs.length);
}
async function pickMock(userId) {
  const all = await bank.pool7();
  const w = weightFor(await history(userId));
  const out = [];
  for (const [fmt, n] of Object.entries(PART7.mockPlan)) {
    let c = all.filter((p) => p.format === fmt);
    if (fmt === 'single') {
      // เอกสารเดี่ยว: ประเภทไม่ซ้ำ และมีแชทอย่างน้อย 1 ชุดเมื่อมีในคลัง
      const picked = []; const types = new Set();
      const chat = weightedPick(c.filter((p) => p.docs[0].docType === 'chat'), w, 1);
      chat.forEach((p) => { picked.push(p); types.add('chat'); });
      while (picked.length < n) {
        const cand = c.filter((p) => !picked.includes(p) && !types.has(p.docs[0].docType));
        const [p] = weightedPick(cand.length ? cand : c.filter((x) => !picked.includes(x)), w, 1);
        if (!p) break;
        picked.push(p); types.add(p.docs[0].docType);
      }
      out.push(...shuffle(picked));
    } else out.push(...weightedPick(c, w, n));
  }
  return out;
}

/* ---------------- ส่งให้หน้าเว็บ ---------------- */
const docPub = (d) => ({ docType: d.docType, docTypeTh: PART7.docTypeTh[d.docType] || d.docType, title: d.title, text: d.text });
function publicItem(p, vs, n) {
  return { n, pid: p.id, format: p.format, formatTh: PART7.formatTh[p.format], docs: p.docs.map(docPub),
    questions: p.questions.map((q, i) => ({ k: i + 1, id: qId(p.id, i + 1), type: q.type, stem: q.stem, sentence: q.sentence || null,
      options: permOf(vs[i]).map((j) => q.options[j]) })) };
}
function qFeedback(p, k, v, selected = null) {
  const q = p.questions[k - 1];
  const correct = correctLetter(q, v);
  return {
    id: qId(p.id, k), k, type: q.type, stem: q.stem, sentence: q.sentence || null, selected, correctOption: correct,
    isCorrect: selected ? selected === correct : null, answerText: q.options[q.answer],
    options: permOf(v).map((j, i) => ({ letter: LETTERS[i], text: q.options[j], isCorrect: j === q.answer, noteTH: q.optionNotesTH[j] })),
    why: q.explanationTH, evidence: [].concat(q.evidence || []),
    skill: { id: q.type, th: PART7.typeTh[q.type] || q.type, group: groupOf(q.type), groupTh: PART7.groupTh[groupOf(q.type)] },
  };
}
function setFeedback(p) {
  return { pid: p.id, translationTH: p.translationTH, tip: p.tipTH, vocabulary: p.vocabulary || [], difficulty: p.difficulty,
    // ข้อแทรกประโยค: เอกสารที่ใส่ประโยคแล้ว (หลังตอบ)
    insertion: (() => {
      const q = p.questions.find((x) => x.type === 'insertion');
      if (!q) return null;
      const di = p.docs.findIndex((d) => /\[[1-4]\]/.test(d.text));
      return { doc: di, at: q.answer + 1, sentence: q.sentence };
    })() };
}

/* ---------------- Session ---------------- */
function normConfig(mode, body = {}) {
  if (mode === 'mock') return { plan: PART7.mockPlan };
  return { size: PART7.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 3,
    format: PART7.formats.includes(body.format) ? body.format : 'mixed',
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed',
    source: body.source === 'mistakes' ? 'mistakes' : 'bank',
    ...(GROUPS.includes(body.group) ? { group: body.group, drill: body.drill === true } : {}) };
}
async function startSession(userId, mode, body = {}) {
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND part = 7 AND mode = $2 AND status = 'active'`, [userId, mode]);
  const cfg = normConfig(mode, body);
  const ps = mode === 'mock' ? await pickMock(userId) : await pickPractice(userId, cfg);
  if (!ps.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีชุดข้อที่พร้อมใช้งาน', 503);
  const items = ps.map((p) => ({ qid: p.id, vs: p.questions.map((q) => (q.type === 'insertion' ? 0 : Math.floor(Math.random() * 24))) }));
  const total = ps.reduce((a, p) => a + p.questions.length, 0);
  const config = { ...cfg };
  if (mode === 'mock') { config.minutes = Math.round((total * PART7.secondsPerQuestion) / 60); config.deadline = new Date(Date.now() + config.minutes * 60000).toISOString(); }
  const { rows } = await pool.query('INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, 7, $2, $3, $4, $5) RETURNING id',
    [userId, mode, JSON.stringify(config), JSON.stringify(items), total]);
  return getSession(userId, rows[0].id);
}
async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2 AND part = 7', [sid, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}
const expired = (s) => s.mode === 'mock' && s.config.deadline && Date.now() > Date.parse(s.config.deadline) + PART7.graceSec * 1000;

async function getSession(userId, sid) {
  let { s, answers } = await loadSession(userId, sid);
  if (s.status === 'active' && expired(s)) { await finish(userId, sid); ({ s, answers } = await loadSession(userId, sid)); }
  const c = await bank.ready();
  const reveal = s.mode === 'practice' || s.status === 'finished';
  let start = 0;
  const items = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const pub = { ...publicItem(p, it.vs, i + 1), start: start + 1 };
    start += p.questions.length;
    let done = 0;
    pub.questions.forEach((q) => {
      const a = answers.find((x) => x.question_id === q.id);
      if (!a) return;
      done += 1; q.selected = a.selected;
      if (reveal) q.feedback = qFeedback(p, q.k, it.vs[q.k - 1], a.selected);
    });
    if (reveal && done === p.questions.length) pub.feedback = setFeedback(p);
    return pub;
  }).filter(Boolean);
  return { id: Number(s.id), mode: s.mode, part: 7, status: s.status, total: s.total, answered: answers.length, config: s.config, items,
    deadline: s.config.deadline || null, serverNow: new Date().toISOString(), result: s.status === 'finished' ? await buildResult(s, answers) : null };
}

async function answer(userId, sid, body = {}) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  if (expired(s)) throw new ToeicError('TIME_UP', 'หมดเวลาแล้ว', 409);
  const b = parseQ(body.id);
  const it = b && s.items.find((x) => x.qid === b.pid);
  const p = it && await bank.get(b.pid);
  if (!it || !p || !p.questions[b.k - 1]) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B, C หรือ D', 400);
  const id = qId(b.pid, b.k);
  const prev = answers.find((a) => a.question_id === id);
  if (prev && s.mode === 'practice') throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  const q = p.questions[b.k - 1];
  const v = it.vs[b.k - 1];
  const correct = correctLetter(q, v);
  const isCorrect = selected === correct;
  if (prev) {
    await pool.query('UPDATE toeic_answers SET selected = $2, is_correct = $3, created_at = NOW() WHERE id = $1', [prev.id, selected, isCorrect]);
    return { id, answered: answers.length, total: s.total, changed: true };
  }
  const responseMs = Math.max(0, Math.min(15 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, 7, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, NULL, $13)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, id, s.mode, v, selected, correct, isCorrect, q.type, [q.type], p.format, p.difficulty, responseMs]);
  if (!ins.rows[0]) { if (s.mode === 'mock') return answer(userId, sid, body); throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409); }
  const out = { id, answered: answers.length + 1, total: s.total };
  if (s.mode === 'practice') {
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'reading', $2, 'P7', $3, 'toeic', $4)`,
      [userId, id, isCorrect, groupOf(q.type)]).catch(() => {});
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t7q:${id}:${bkkDay()}`, PART7.exp.practiceCorrect, { reason: 'toeic_p7_practice' });
    Object.assign(out, { feedback: qFeedback(p, b.k, v, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
    const doneHere = answers.filter((a) => parseQ(a.question_id).pid === b.pid).length + 1;
    if (doneHere === p.questions.length) out.set = setFeedback(p);
  }
  return out;
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(rows) {
  const g = {};
  rows.forEach((r) => { const k = groupOf(r.skill); g[k] = g[k] || { group: k, th: PART7.groupTh[k], total: 0, correct: 0 }; g[k].total += 1; if (r.is_correct) g[k].correct += 1; });
  return Object.values(g).map((x) => ({ ...x, accuracy: Math.round((x.correct / x.total) * 100) })).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}
async function buildResult(s, answers) {
  const c = await bank.ready();
  const byId = new Map(answers.map((a) => [a.question_id, a]));
  const rows = []; const fmt = {};
  let start = 0;
  const review = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const qs = p.questions.map((q, k) => {
      const a = byId.get(qId(p.id, k + 1));
      if (s.mode === 'mock' || a) {
        rows.push({ skill: q.type, is_correct: Boolean(a && a.is_correct) });
        const f = isMulti(p) ? 'multi' : 'single'; fmt[f] = fmt[f] || { total: 0, correct: 0 }; fmt[f].total += 1; if (a && a.is_correct) fmt[f].correct += 1;
      }
      return qFeedback(p, k + 1, it.vs[k], a ? a.selected : null);
    });
    const out = { ...publicItem(p, it.vs, i + 1), start: start + 1, questions: qs, feedback: setFeedback(p) };
    start += p.questions.length;
    return out;
  }).filter(Boolean);
  const correct = rows.filter((r) => r.is_correct).length; const total = rows.length;
  const skills = breakdown(rows);
  const ranked = [...skills].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const unanswered = s.mode === 'mock' ? s.total - answers.length : 0;
  const usedMs = s.finished_at ? Math.max(0, Date.parse(s.finished_at) - Date.parse(s.started_at)) : null;
  const limit = s.mode === 'mock' ? (s.config.minutes || 0) * 60000 : null;
  const acc = (x) => (x ? { ...x, accuracy: Math.round((x.correct / x.total) * 100) } : null);
  return {
    mode: s.mode, correct, incorrect: total - correct - unanswered, unanswered, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    timeUsedMs: s.mode === 'mock' && usedMs != null ? Math.min(usedMs, limit) : null, timeLimitMs: limit,
    formats: { single: acc(fmt.single), multi: acc(fmt.multi) },
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    expAwarded: s.exp_awarded, label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 85 ? 'สูง — อ่านจับใจความและเชื่อมข้อมูลได้ดี' : pct >= 60 ? 'ปานกลาง — ฝึกข้ออนุมานและเอกสารหลายฉบับเพิ่ม' : 'ควรฝึกหาหลักฐานในเอกสารก่อนเลือกคำตอบ') : null,
    disclaimer: 'Practice Score / Estimated performance ของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ',
    review,
  };
}

async function finish(userId, sid) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status === 'finished') return { result: await buildResult(s, answers), exp: 0, levelInfo: null, leveledUp: false, already: true };
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้ถูกยกเลิกแล้ว', 409);
  if (s.mode === 'practice' && !answers.length) throw new ToeicError('EMPTY', 'ยังไม่ได้ตอบข้อใดเลย', 409);
  const correct = answers.filter((a) => a.is_correct).length;
  const upd = await pool.query(`UPDATE toeic_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`, [sid, userId, correct]);
  if (!upd.rows[0]) return finish(userId, sid);
  const E = PART7.exp; const grants = [];
  if (s.mode === 'practice') {
    if (answers.length >= Math.min(3, s.total)) {
      grants.push(await grantOnce(userId, `t7c:${sid}`, E.practiceComplete, { reason: 'toeic_p7_done', dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length === s.total && s.total >= 5) grants.push(await grantOnce(userId, `t7p:${sid}`, E.practicePerfect, { reason: 'toeic_p7_perfect', dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    if (answers.length) {
      await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
        SELECT $1, 'reading', question_id, 'P7', is_correct, 'toeic', NULL FROM toeic_answers WHERE session_id = $2`, [userId, sid]).catch(() => {});
    }
    if (answers.length >= Math.ceil(s.total / 2)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 7 AND mode = 'mock' AND status = 'finished' AND id <> $2
            AND exp_awarded > 0 AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid]);
      if (rows[0].n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t7m:${sid}`, rows[0].n === 0 ? E.mockComplete : E.mockRepeat, { reason: 'toeic_p7_mock' }));
      if (correct === s.total) grants.push(await grantOnce(userId, `t7mp:${sid}`, E.mockPerfect, { reason: 'toeic_p7_mock_perf', dailyCap: E.mockPerfect }));
    }
  }
  const g = grants.length ? mergeGrants(grants) : { gained: 0, levelInfo: null, leveledUp: false };
  await pool.query('UPDATE toeic_sessions SET exp_awarded = $2 WHERE id = $1', [sid, g.gained]);
  return { result: await buildResult({ ...upd.rows[0], exp_awarded: g.gained }, answers), exp: g.gained, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
}

/* ---------------- Landing / Analytics / Error Notebook ---------------- */
const RANGE = { '7': "NOW() - INTERVAL '7 days'", '30': "NOW() - INTERVAL '30 days'", all: "'-infinity'::timestamptz" };
async function summary(userId, range = 'all') {
  const since = RANGE[range] || RANGE.all;
  const { rows } = await pool.query(
    `SELECT a.question_id, a.is_correct, a.skill, a.category, a.response_ms FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 7 AND a.created_at >= ${since} AND (a.mode = 'practice' OR s.status = 'finished')`, [userId]);
  const c = await bank.ready();
  const total = rows.length; const correct = rows.filter((r) => r.is_correct).length;
  const cat = (pred) => { const xs = rows.filter(pred); return xs.length ? { total: xs.length, accuracy: Math.round((xs.filter((r) => r.is_correct).length / xs.length) * 100) } : null; };
  const skills = breakdown(rows);
  const best = await pool.query(`SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = 7 AND status = 'finished' GROUP BY mode`, [userId]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const active = await pool.query(`SELECT id, mode, total, config, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = 7 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId]);
  const times = rows.map((r) => r.response_ms).filter((x) => x > 0);
  return {
    range, answered: total, correct, accuracy: total ? Math.round((correct / total) * 100) : null,
    setsPracticed: new Set(rows.map((r) => parseQ(r.question_id).pid)).size,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'), skills,
    formats: { single: cat((r) => r.category === 'single'), multi: cat((r) => r.category === 'double' || r.category === 'triple') },
    weakSkill: skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null,
    mistakes: (await mistakeRows(userId)).length,
    activeSessions: active.rows.filter((r) => !(r.mode === 'mock' && r.config.deadline && Date.now() > Date.parse(r.config.deadline)))
      .map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: c.part7.length, bankQuestions: c.part7.reduce((a, p) => a + p.questions.length, 0),
  };
}
async function mistakeRows(userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at FROM (
       SELECT DISTINCT ON (a.question_id) a.* FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.part = 7 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}
async function mistakes(userId) {
  const c = await bank.ready();
  const by = new Map();
  (await mistakeRows(userId)).forEach((r) => { const b = parseQ(r.question_id); if (!b) return; if (!by.has(b.pid)) by.set(b.pid, []); by.get(b.pid).push({ ...r, k: b.k }); });
  return { items: [...by.entries()].map(([pid, rs]) => {
    const p = c.byId.get(pid);
    if (!p) return null;
    const questions = p.questions.map((q, k) => {
      const r = rs.find((x) => x.k === k + 1);
      return { ...qFeedback(p, k + 1, r ? r.variant : 0, r ? r.selected : null), wrong: Boolean(r) };
    });
    return { ...publicItem(p, p.questions.map(() => 0), 0), start: 1, questions, feedback: setFeedback(p), wrongCount: rs.length };
  }).filter(Boolean) };
}
async function addToReview(userId, wordId) {
  const c = await bank.ready();
  if (!c.part7.some((p) => (p.vocabulary || []).some((v) => v.wordId === wordId))) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW()) RETURNING (xmax = 0) AS inserted`, [userId, wordId, wordId.slice(0, 2)]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}
async function meta() {
  const all = await bank.pool7();
  return { disclaimer: DISCLAIMER_TH, sizes: PART7.practiceSizes, formats: PART7.formats, mockPlan: PART7.mockPlan,
    secondsPerQuestion: PART7.secondsPerQuestion, groupTh: PART7.groupTh, exp: PART7.exp,
    bankSize: all.length, bankQuestions: all.reduce((a, p) => a + p.questions.length, 0) };
}

module.exports = { startSession, getSession, answer, finish, summary, mistakes, addToReview, meta,
  _internal: { PERMS, permOf, correctLetter, qFeedback, publicItem, pickMock, groupOf, parseQ } };
