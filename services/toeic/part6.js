/*
  TOEIC-style Reading Part 6 — Text Completion (Practice / Mock Test)
  1 บทความ = 4 ช่องว่าง (คำ/วลี 3 · เติมทั้งประโยค 1) · คำตอบรายช่องเก็บใน toeic_answers (question_id = "<P6-xxxx>-<1..4>")

  ความปลอดภัย:
    - ก่อนตอบหน้าเว็บได้แค่บทความ + ตัวเลือก (ลำดับสลับต่อช่อง) · ไม่มีเฉลย/คำแปล/คำอธิบาย
    - ตรวจคำตอบที่เซิร์ฟเวอร์ · EXP/Coin ผ่าน utils/exp.js (t6q/t6c/t6m — Coin ใช้กฎ TOEIC เดิม เพดานร่วมกับ Part 1/5)
  Practice : 1/2/4 บทความ · ตอบแต่ละช่องแล้วเห็นเฉลยของช่องนั้นทันที · ครบ 4 ช่องเห็นคำแปลทั้งเรื่อง/Tip/คำศัพท์
  Mock     : 4 บทความ (16 ข้อ) · 10 นาที · เปลี่ยนคำตอบได้จนกว่าจะส่ง · ไม่มีเฉลยระหว่างทำ · ไม่ได้ตอบ = ผิด
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART5, PART6, DISCLAIMER_TH } = require('../../config/toeic');
const { ToeicError } = require('./part1');
const { LETTERS, MARK } = require('./part6Validator');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const GROUPS = Object.keys(PART6.groupTh);
const groupOf = (skill) => (skill === 'sentenceInsertion' ? 'sentence' : skill === 'context' ? 'context'
  : ['vocabulary', 'collocation'].includes(skill) ? 'vocabulary' : 'grammar');
const PERMS = (() => {
  const out = [];
  const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], [...rest.slice(0, i), ...rest.slice(i + 1)])); };
  rec([], [0, 1, 2, 3]);
  return out;
})();
const permOf = (v) => PERMS[Number.isInteger(v) && v >= 0 && v < 24 ? v : 0];
const correctLetter = (q, v) => LETTERS[permOf(v).indexOf(q.answer)];
const blankId = (pid, k) => `${pid}-${k}`;
const parseBlank = (id) => { const m = /^(P6-\d{4})-([1-4])$/.exec(String(id || '')); return m ? { pid: m[1], k: Number(m[2]) } : null; };
const fillText = (p) => p.text.replace(MARK, (_, d) => { const q = p.questions[Number(d) - 1]; return q.options[q.answer]; });

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

/** ประวัติต่อบทความ: ทำแล้วกี่ช่อง/ผิดกี่ช่อง (ล่าสุด) */
async function history(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 6 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC`, [userId]);
  const byP = new Map();
  rows.forEach((r) => { const b = parseBlank(r.question_id); if (!b) return; const h = byP.get(b.pid) || { seen: 0, wrong: 0 }; h.seen += 1; if (!r.is_correct) h.wrong += 1; byP.set(b.pid, h); });
  return byP;
}
const weightFor = (h) => (p) => { const x = h.get(p.id); return !x ? 2.2 : x.wrong ? 1.6 : 0.3; };

async function pickPractice(userId, cfg) {
  const all = await bank.pool6();
  const h = await history(userId);
  if (cfg.source === 'mistakes') {
    const c = all.filter((p) => h.get(p.id) && h.get(p.id).wrong);
    if (!c.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีบทความที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return shuffle(c).slice(0, cfg.size);
  }
  let c = all;
  if (cfg.group) { const g = all.filter((p) => p.questions.some((q) => groupOf(q.skill) === cfg.group)); if (g.length) c = g; }
  if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) { const f = c.filter((p) => p.difficulty === cfg.difficulty); if (f.length >= cfg.size) c = f; }
  return weightedPick(c, weightFor(h), cfg.size);
}
/** Mock: 4 บทความ ประเภทเอกสารไม่ซ้ำกัน · ความยากผสม (ง่าย 1 · กลาง 2 · ยาก 1 เมื่อมี) */
async function pickMock(userId) {
  const all = await bank.pool6();
  const w = weightFor(await history(userId));
  const out = []; const types = new Set();
  for (const d of shuffle(['easy', 'medium', 'medium', 'hard'])) {
    let c = all.filter((p) => !out.includes(p) && p.difficulty === d && !types.has(p.docType));
    if (!c.length) c = all.filter((p) => !out.includes(p) && !types.has(p.docType));
    if (!c.length) c = all.filter((p) => !out.includes(p));
    const [p] = weightedPick(c, w, 1);
    if (p) { out.push(p); types.add(p.docType); }
  }
  return out;
}

/* ---------------- ส่งให้หน้าเว็บ ---------------- */
function publicItem(p, vs, n) {
  return { n, pid: p.id, docType: p.docType, docTypeTh: PART6.docTypeTh[p.docType] || p.docType, title: p.title, text: p.text,
    blanks: p.questions.map((q, i) => ({ k: i + 1, id: blankId(p.id, i + 1), kind: q.kind, options: permOf(vs[i]).map((j) => q.options[j]) })) };
}
function blankFeedback(p, k, v, selected = null) {
  const q = p.questions[k - 1];
  const correct = correctLetter(q, v);
  return {
    id: blankId(p.id, k), k, kind: q.kind, selected, correctOption: correct, isCorrect: selected ? selected === correct : null, answerText: q.options[q.answer],
    options: permOf(v).map((j, i) => ({ letter: LETTERS[i], text: q.options[j], isCorrect: j === q.answer, noteTH: q.optionNotesTH[j] })),
    why: q.explanationTH,
    skill: { id: q.skill, th: q.skill === 'context' ? 'อ่านจากบริบท' : q.skill === 'sentenceInsertion' ? 'เติมประโยค' : (PART5.skillTh[q.skill] || q.skill), group: groupOf(q.skill), groupTh: PART6.groupTh[groupOf(q.skill)] },
  };
}
function passageFeedback(p) {
  return { pid: p.id, completed: fillText(p), translationTH: p.translationTH, tip: p.tipTH, vocabulary: p.vocabulary || [], difficulty: p.difficulty };
}

/* ---------------- Session ---------------- */
function normConfig(mode, body = {}) {
  if (mode === 'mock') return { size: PART6.mockPassages, minutes: PART6.mockMinutes };
  return { size: PART6.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 2,
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed',
    source: body.source === 'mistakes' ? 'mistakes' : 'bank',
    ...(GROUPS.includes(body.group) ? { group: body.group, drill: body.drill === true } : {}) };
}
async function startSession(userId, mode, body = {}) {
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND part = 6 AND mode = $2 AND status = 'active'`, [userId, mode]);
  const cfg = normConfig(mode, body);
  const ps = mode === 'mock' ? await pickMock(userId) : await pickPractice(userId, cfg);
  if (!ps.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีบทความที่พร้อมใช้งาน', 503);
  const items = ps.map((p) => ({ qid: p.id, vs: p.questions.map(() => Math.floor(Math.random() * 24)) }));
  const config = { ...cfg };
  if (mode === 'mock') config.deadline = new Date(Date.now() + PART6.mockMinutes * 60 * 1000).toISOString();
  const { rows } = await pool.query('INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, 6, $2, $3, $4, $5) RETURNING id',
    [userId, mode, JSON.stringify(config), JSON.stringify(items), items.length * 4]);
  return getSession(userId, rows[0].id);
}
async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2 AND part = 6', [sid, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}
const expired = (s) => s.mode === 'mock' && s.config.deadline && Date.now() > Date.parse(s.config.deadline) + PART6.graceSec * 1000;

async function getSession(userId, sid) {
  let { s, answers } = await loadSession(userId, sid);
  if (s.status === 'active' && expired(s)) { await finish(userId, sid); ({ s, answers } = await loadSession(userId, sid)); }
  const c = await bank.ready();
  const reveal = s.mode === 'practice' || s.status === 'finished';
  const items = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const pub = publicItem(p, it.vs, i + 1);
    let done = 0;
    pub.blanks.forEach((b) => {
      const a = answers.find((x) => x.question_id === b.id);
      if (!a) return;
      done += 1; b.selected = a.selected;
      if (reveal) b.feedback = blankFeedback(p, b.k, it.vs[b.k - 1], a.selected);
    });
    if (reveal && done === 4) pub.feedback = passageFeedback(p);
    return pub;
  }).filter(Boolean);
  return { id: Number(s.id), mode: s.mode, part: 6, status: s.status, total: s.total, answered: answers.length, config: s.config, items,
    deadline: s.config.deadline || null, serverNow: new Date().toISOString(), result: s.status === 'finished' ? await buildResult(s, answers) : null };
}

async function answer(userId, sid, body = {}) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  if (expired(s)) throw new ToeicError('TIME_UP', 'หมดเวลาแล้ว', 409);
  const b = parseBlank(body.id);
  const it = b && s.items.find((x) => x.qid === b.pid);
  if (!it) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B, C หรือ D', 400);
  const id = blankId(b.pid, b.k);
  const prev = answers.find((a) => a.question_id === id);
  if (prev && s.mode === 'practice') throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  const p = await bank.get(b.pid);
  const q = p.questions[b.k - 1];
  const v = it.vs[b.k - 1];
  const correct = correctLetter(q, v);
  const isCorrect = selected === correct;
  if (prev) {
    await pool.query('UPDATE toeic_answers SET selected = $2, is_correct = $3, created_at = NOW() WHERE id = $1', [prev.id, selected, isCorrect]);
    return { id, answered: answers.length, total: s.total, changed: true };
  }
  const responseMs = Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, 6, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, NULL, $13)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, id, s.mode, v, selected, correct, isCorrect, q.skill, [q.skill], q.kind, p.difficulty, responseMs]);
  if (!ins.rows[0]) { if (s.mode === 'mock') return answer(userId, sid, body); throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409); }
  const out = { id, answered: answers.length + 1, total: s.total };
  if (s.mode === 'practice') {
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'reading', $2, 'P6', $3, 'toeic', $4)`,
      [userId, id, isCorrect, groupOf(q.skill)]).catch(() => {});
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t6q:${id}:${bkkDay()}`, PART6.exp.practiceCorrect, { reason: 'toeic_p6_practice' });
    Object.assign(out, { feedback: blankFeedback(p, b.k, v, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
    const doneHere = answers.filter((a) => parseBlank(a.question_id).pid === b.pid).length + 1;
    if (doneHere === 4) out.passage = passageFeedback(p);
  }
  return out;
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(rows) {
  const g = {};
  rows.forEach((r) => { const k = groupOf(r.skill); g[k] = g[k] || { group: k, th: PART6.groupTh[k], total: 0, correct: 0 }; g[k].total += 1; if (r.is_correct) g[k].correct += 1; });
  return Object.values(g).map((x) => ({ ...x, accuracy: Math.round((x.correct / x.total) * 100) })).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}
async function buildResult(s, answers) {
  const c = await bank.ready();
  const byId = new Map(answers.map((a) => [a.question_id, a]));
  const rows = [];
  const review = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const blanks = p.questions.map((q, k) => {
      const a = byId.get(blankId(p.id, k + 1));
      if (s.mode === 'mock' || a) rows.push({ skill: q.skill, is_correct: Boolean(a && a.is_correct) });
      return blankFeedback(p, k + 1, it.vs[k], a ? a.selected : null);
    });
    return { n: i + 1, ...publicItem(p, it.vs, i + 1), blanks, feedback: passageFeedback(p) };
  }).filter(Boolean);
  const correct = rows.filter((r) => r.is_correct).length; const total = rows.length;
  const skills = breakdown(rows);
  const ranked = [...skills].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const unanswered = s.mode === 'mock' ? s.total - answers.length : 0;
  const usedMs = s.finished_at ? Math.max(0, Date.parse(s.finished_at) - Date.parse(s.started_at)) : null;
  return {
    mode: s.mode, correct, incorrect: total - correct - unanswered, unanswered, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    timeUsedMs: s.mode === 'mock' && usedMs != null ? Math.min(usedMs, PART6.mockMinutes * 60000) : null,
    timeLimitMs: s.mode === 'mock' ? PART6.mockMinutes * 60000 : null,
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    expAwarded: s.exp_awarded, label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 85 ? 'สูง — อ่านจับบริบทได้ดี' : pct >= 60 ? 'ปานกลาง — ฝึกข้อเติมประโยคและคำเชื่อมเพิ่ม' : 'ควรฝึกอ่านทั้งย่อหน้าก่อนเลือกคำตอบ') : null,
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
  const E = PART6.exp; const grants = [];
  if (s.mode === 'practice') {
    if (answers.length >= 4) {
      grants.push(await grantOnce(userId, `t6c:${sid}`, E.practiceComplete, { reason: 'toeic_p6_done', dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length === s.total) grants.push(await grantOnce(userId, `t6p:${sid}`, E.practicePerfect, { reason: 'toeic_p6_perfect', dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    if (answers.length) {
      await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
        SELECT $1, 'reading', question_id, 'P6', is_correct, 'toeic', NULL FROM toeic_answers WHERE session_id = $2`, [userId, sid]).catch(() => {});
    }
    if (answers.length >= Math.ceil(s.total / 2)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 6 AND mode = 'mock' AND status = 'finished' AND id <> $2
            AND exp_awarded > 0 AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid]);
      if (rows[0].n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t6m:${sid}`, rows[0].n === 0 ? E.mockComplete : E.mockRepeat, { reason: 'toeic_p6_mock' }));
      if (correct === s.total) grants.push(await grantOnce(userId, `t6mp:${sid}`, E.mockPerfect, { reason: 'toeic_p6_mock_perf', dailyCap: E.mockPerfect }));
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
    `SELECT a.question_id, a.is_correct, a.skill, a.response_ms FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 6 AND a.created_at >= ${since} AND (a.mode = 'practice' OR s.status = 'finished')`, [userId]);
  const c = await bank.ready();
  const total = rows.length; const correct = rows.filter((r) => r.is_correct).length;
  const skills = breakdown(rows);
  const best = await pool.query(`SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = 6 AND status = 'finished' GROUP BY mode`, [userId]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const active = await pool.query(`SELECT id, mode, total, config, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = 6 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId]);
  const times = rows.map((r) => r.response_ms).filter((x) => x > 0);
  return {
    range, answered: total, correct, accuracy: total ? Math.round((correct / total) * 100) : null,
    passagesPracticed: new Set(rows.map((r) => parseBlank(r.question_id).pid)).size,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'), skills,
    weakSkill: skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null,
    mistakes: (await mistakeRows(userId)).length,
    activeSessions: active.rows.filter((r) => !(r.mode === 'mock' && r.config.deadline && Date.now() > Date.parse(r.config.deadline)))
      .map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: c.part6.length, bankQuestions: c.part6.length * 4,
  };
}
async function mistakeRows(userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at FROM (
       SELECT DISTINCT ON (a.question_id) a.* FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.part = 6 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}
/** ช่องที่ยังผิด จัดกลุ่มตามบทความ (แสดงทั้งบทความ + เฉลยทุกช่อง · ไฮไลต์ช่องที่ผิด) */
async function mistakes(userId) {
  const c = await bank.ready();
  const by = new Map();
  (await mistakeRows(userId)).forEach((r) => { const b = parseBlank(r.question_id); if (!b) return; if (!by.has(b.pid)) by.set(b.pid, []); by.get(b.pid).push({ ...r, k: b.k }); });
  return { items: [...by.entries()].map(([pid, rs]) => {
    const p = c.byId.get(pid);
    if (!p) return null;
    const blanks = p.questions.map((q, k) => {
      const r = rs.find((x) => x.k === k + 1);
      return { ...blankFeedback(p, k + 1, r ? r.variant : 0, r ? r.selected : null), wrong: Boolean(r) };
    });
    return { ...publicItem(p, [0, 0, 0, 0], 0), blanks, feedback: passageFeedback(p), wrongCount: rs.length };
  }).filter(Boolean) };
}
async function addToReview(userId, wordId) {
  const c = await bank.ready();
  if (!c.part6.some((p) => (p.vocabulary || []).some((v) => v.wordId === wordId))) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW()) RETURNING (xmax = 0) AS inserted`, [userId, wordId, wordId.slice(0, 2)]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}
async function meta() {
  return { disclaimer: DISCLAIMER_TH, sizes: PART6.practiceSizes, mockPassages: PART6.mockPassages, mockQuestions: PART6.mockPassages * 4,
    mockMinutes: PART6.mockMinutes, groupTh: PART6.groupTh, exp: PART6.exp, bankSize: (await bank.pool6()).length };
}

module.exports = { startSession, getSession, answer, finish, summary, mistakes, addToReview, meta,
  _internal: { PERMS, permOf, correctLetter, blankFeedback, publicItem, pickMock, groupOf, parseBlank, fillText } };
