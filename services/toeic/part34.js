/*
  TOEIC-style Listening Part 3 (Conversations) / Part 4 (Talks) — Practice / Mock Test (โค้ดชุดเดียว ใช้ part = 3 | 4)
  1 ชุด = เสียง 1 ไฟล์ + 3 คำถาม (คำถาม/ตัวเลือก/กราฟิกแสดงบนจอเหมือนข้อสอบจริง) · คำตอบรายข้อเก็บใน toeic_answers ("<P3-xxxx>-<k>")

  ความปลอดภัย:
    - ก่อนตอบหน้าเว็บได้ URL เสียง + คำถาม + ตัวเลือก (สลับลำดับ) + กราฟิก · ไม่มีบทพูด/เฉลย/หลักฐาน
    - ตรวจที่เซิร์ฟเวอร์ · EXP/Coin ผ่าน utils/exp.js (คีย์ t3?/t4? — Coin ใช้กฎ TOEIC เดิม เพดานร่วม)
  Practice : ฟังซ้ำได้ · ตอบทีละข้อเห็นเฉลย · ครบ 3 ข้อเห็นบทพูด + คำแปลรายช่วง + ไฮไลต์หลักฐาน + ไฮไลต์ช่วงที่กำลังเล่น
  Mock     : Part 3 = 6 ชุด · Part 4 = 5 ชุด · อ่านคำถามก่อน → เสียงเล่นครั้งเดียว → มีเวลา 8 วินาที/ข้อ แล้วไปชุดถัดไปเอง
             ชุดที่ผ่านไปแล้วย้อนกลับมาตอบไม่ได้ (เซิร์ฟเวอร์บันทึก passed) · ในชุดปัจจุบันเปลี่ยนคำตอบได้
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART34, ACCENTS, AUDIO, DISCLAIMER_TH } = require('../../config/toeic');
const { ToeicError } = require('./part1');
const { LETTERS } = require('./part34Validator');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const GROUPS = Object.keys(PART34.groupTh);
const groupOf = (type) => PART34.groupOf[type] || 'detail';
const SPEAKER_TH = { M: 'ผู้ชาย', W: 'ผู้หญิง', M2: 'ผู้ชาย 2', W2: 'ผู้หญิง 2' };
const SPEAKER_EN = { M: 'Man', W: 'Woman', M2: 'Man 2', W2: 'Woman 2' };
const PERMS = (() => {
  const out = [];
  const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], [...rest.slice(0, i), ...rest.slice(i + 1)])); };
  rec([], [0, 1, 2, 3]);
  return out;
})();
const permOf = (v) => PERMS[Number.isInteger(v) && v >= 0 && v < 24 ? v : 0];
const correctLetter = (q, v) => LETTERS[permOf(v).indexOf(q.answer)];
const qId = (pid, k) => `${pid}-${k}`;
const parseQ = (part, id) => { const m = new RegExp(`^(P${part}-\\d{4})-([1-3])$`).exec(String(id || '')); return m ? { pid: m[1], k: Number(m[2]) } : null; };
const P = (part) => { if (![3, 4].includes(Number(part))) throw new ToeicError('BAD_PART', 'Part ไม่ถูกต้อง', 404); return Number(part); };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick(items, weight, n, used = new Set()) {
  const left = items.filter((q) => !q.group || !used.has(q.group)).map((x) => ({ x, w: Math.max(0.001, weight(x)) }));
  const out = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total; let i = 0;
    for (; i < left.length - 1; i += 1) { r -= left[i].w; if (r <= 0) break; }
    const { x } = left.splice(i, 1)[0];
    out.push(x);
    if (x.group) { used.add(x.group); for (let j = left.length - 1; j >= 0; j -= 1) if (left[j].x.group === x.group) left.splice(j, 1); }
  }
  return out;
}

async function history(part, userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = $2 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC`, [userId, part]);
  const byP = new Map();
  rows.forEach((r) => { const b = parseQ(part, r.question_id); if (!b) return; const h = byP.get(b.pid) || { seen: 0, wrong: 0 }; h.seen += 1; if (!r.is_correct) h.wrong += 1; byP.set(b.pid, h); });
  return byP;
}
const weightFor = (h) => (p) => { const x = h.get(p.id); return !x ? 2.2 : x.wrong ? 1.6 : 0.3; };

async function pickPractice(part, userId, cfg) {
  const all = await bank.poolOf(part);
  const h = await history(part, userId);
  if (cfg.source === 'mistakes') {
    const c = all.filter((p) => h.get(p.id) && h.get(p.id).wrong);
    if (!c.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีชุดที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return weightedPick(shuffle(c), () => 1, cfg.size);
  }
  let c = all;
  if (cfg.focus === 'graphic') c = all.filter((p) => p.graphic);
  else if (cfg.focus === 'three') c = all.filter((p) => p.speakers.length === 3);
  else if (part === 4 && PART34.talkTypeTh[cfg.focus]) c = all.filter((p) => p.talkType === cfg.focus);
  if (!c.length) c = all;
  if (cfg.group) { const g = all.filter((p) => p.questions.some((q) => groupOf(q.type) === cfg.group)); if (g.length) c = g; }
  if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) { const f = c.filter((p) => p.difficulty === cfg.difficulty); if (f.length >= cfg.size) c = f; }
  return weightedPick(c, weightFor(h), cfg.size);
}
/** Mock: Part 3 มีบทสนทนา 3 คน 1 ชุด + กราฟิก 1 ชุด · Part 4 มีกราฟิก 1 ชุด + ประเภทการพูดไม่ซ้ำ */
async function pickMock(part, userId) {
  const all = await bank.poolOf(part);
  const w = weightFor(await history(part, userId));
  const n = PART34.mockSets[part];
  const used = new Set(); const out = [];
  const take = (cands, k) => { const got = weightedPick(cands.filter((p) => !out.includes(p)), w, k, used); out.push(...got); };
  take(all.filter((p) => p.graphic), 1);
  if (part === 3) take(all.filter((p) => p.speakers.length === 3 && !p.graphic), 1);
  if (part === 4) {
    const types = new Set(out.map((p) => p.talkType));
    while (out.length < n) {
      const c = all.filter((p) => !out.includes(p) && !p.graphic && !types.has(p.talkType));
      const before = out.length; take(c.length ? c : all.filter((p) => !out.includes(p) && !p.graphic), 1);
      if (out.length === before) break;
      types.add(out[out.length - 1].talkType);
    }
  }
  take(all.filter((p) => !p.graphic && p.speakers.length !== 3), n - out.length);
  if (out.length < n) take(all, n - out.length);
  return shuffle(out);
}

/* ---------------- ส่งให้หน้าเว็บ ---------------- */
function publicItem(p, vs, n) {
  return {
    n, pid: p.id, part: p.part, speakers: p.speakers.length,
    talkType: p.talkType || null, talkTypeTh: p.talkType ? PART34.talkTypeTh[p.talkType] : null,
    graphic: p.graphic ? { title: p.graphic.title, table: p.graphic.table } : null,
    audio: { url: p.audio.url, duration: p.audio.duration },
    questions: p.questions.map((q, i) => ({ k: i + 1, id: qId(p.id, i + 1), type: q.type, stem: q.stem, options: permOf(vs[i]).map((j) => q.options[j]) })),
  };
}
function qFeedback(p, k, v, selected = null) {
  const q = p.questions[k - 1];
  const correct = correctLetter(q, v);
  return {
    id: qId(p.id, k), k, type: q.type, stem: q.stem, selected, correctOption: correct, isCorrect: selected ? selected === correct : null,
    answerText: q.options[q.answer], why: q.explanationTH, evidence: [].concat(q.evidence || []),
    options: permOf(v).map((j, i) => ({ letter: LETTERS[i], text: q.options[j], isCorrect: j === q.answer, noteTH: q.optionNotesTH[j] })),
    skill: { id: q.type, th: PART34.typeTh[q.type] || q.type, group: groupOf(q.type), groupTh: PART34.groupTh[groupOf(q.type)] },
  };
}
function setFeedback(p) {
  const voices = p.audio.voices || {};
  return {
    pid: p.id, tip: p.tipTH, vocabulary: p.vocabulary || [], difficulty: p.difficulty,
    transcript: p.turns.map((t, i) => ({ k: i, speaker: t.speaker, label: p.part === 3 ? SPEAKER_EN[t.speaker] : null, labelTh: SPEAKER_TH[t.speaker],
      text: t.text, th: p.translationTH[i], start: p.audio.segments[i].start, end: p.audio.segments[i].end })),
    accents: Object.fromEntries(Object.entries(voices).map(([sid, x]) => [sid, ACCENTS[x.accent]])),
  };
}

/* ---------------- Session ---------------- */
function normConfig(part, mode, body = {}) {
  if (mode === 'mock') return { sets: PART34.mockSets[part], previewSec: PART34.previewSec, answerSecPerQuestion: PART34.answerSecPerQuestion };
  const focuses = ['mixed', 'graphic', ...(part === 3 ? ['three'] : Object.keys(PART34.talkTypeTh))];
  return { size: PART34.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 3,
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed',
    focus: focuses.includes(body.focus) ? body.focus : 'mixed',
    source: body.source === 'mistakes' ? 'mistakes' : 'bank',
    ...(GROUPS.includes(body.group) ? { group: body.group, drill: body.drill === true } : {}) };
}
async function startSession(partIn, userId, mode, body = {}) {
  const part = P(partIn);
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND part = $2 AND mode = $3 AND status = 'active'`, [userId, part, mode]);
  const cfg = normConfig(part, mode, body);
  const ps = mode === 'mock' ? await pickMock(part, userId) : await pickPractice(part, userId, cfg);
  if (!ps.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีชุดข้อที่พร้อมใช้งาน', 503);
  const items = ps.map((p) => ({ qid: p.id, vs: p.questions.map(() => Math.floor(Math.random() * 24)) }));
  const { rows } = await pool.query('INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [userId, part, mode, JSON.stringify(cfg), JSON.stringify(items), items.length * 3]);
  return getSession(part, userId, rows[0].id);
}
async function loadSession(part, userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2 AND part = $3', [sid, userId, part]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}
async function getSession(partIn, userId, sid) {
  const part = P(partIn);
  const { s, answers } = await loadSession(part, userId, sid);
  const c = await bank.ready();
  const reveal = s.mode === 'practice' || s.status === 'finished';
  const items = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const pub = { ...publicItem(p, it.vs, i + 1), start: i * 3 + 1 };
    let done = 0;
    pub.questions.forEach((q) => {
      const a = answers.find((x) => x.question_id === q.id);
      if (!a) return;
      done += 1; q.selected = a.selected;
      if (reveal) q.feedback = qFeedback(p, q.k, it.vs[q.k - 1], a.selected);
    });
    if (reveal && done === 3) pub.feedback = setFeedback(p);
    return pub;
  }).filter(Boolean);
  return { id: Number(s.id), mode: s.mode, part, status: s.status, total: s.total, answered: answers.length, passed: Number(s.config.passed || 0),
    config: s.config, items, result: s.status === 'finished' ? await buildResult(part, s, answers) : null };
}

async function answer(partIn, userId, sid, body = {}) {
  const part = P(partIn);
  const { s, answers } = await loadSession(part, userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  const b = parseQ(part, body.id);
  const idx = b ? s.items.findIndex((x) => x.qid === b.pid) : -1;
  const it = s.items[idx];
  const p = it && await bank.get(b.pid);
  if (!it || !p) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B, C หรือ D', 400);
  if (s.mode === 'mock' && idx < Number(s.config.passed || 0)) throw new ToeicError('PASSED', 'ชุดนี้ผ่านไปแล้ว', 409);
  const id = qId(b.pid, b.k);
  const prev = answers.find((a) => a.question_id === id);
  if (prev && s.mode === 'practice') throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  const q = p.questions[b.k - 1]; const v = it.vs[b.k - 1];
  const correct = correctLetter(q, v);
  const isCorrect = selected === correct;
  if (prev) {
    await pool.query('UPDATE toeic_answers SET selected = $2, is_correct = $3, created_at = NOW() WHERE id = $1', [prev.id, selected, isCorrect]);
    return { id, answered: answers.length, total: s.total, changed: true };
  }
  const responseMs = Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  const accent = p.audio.voices && Object.values(p.audio.voices)[0] ? Object.values(p.audio.voices)[0].accent : null;
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, id, part, s.mode, v, selected, correct, isCorrect, q.type, [q.type], p.category, p.difficulty, accent, responseMs]);
  if (!ins.rows[0]) { if (s.mode === 'mock') return answer(part, userId, sid, body); throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409); }
  const out = { id, answered: answers.length + 1, total: s.total };
  if (s.mode === 'practice') {
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'listening', $2, $3, $4, 'toeic', $5)`,
      [userId, id, `P${part}`, isCorrect, groupOf(q.type)]).catch(() => {});
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t${part}q:${id}:${bkkDay()}`, PART34.exp.practiceCorrect, { reason: `toeic_p${part}_practice` });
    Object.assign(out, { feedback: qFeedback(p, b.k, v, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
    const doneHere = answers.filter((a) => parseQ(part, a.question_id).pid === b.pid).length + 1;
    if (doneHere === 3) out.set = setFeedback(p);
  }
  return out;
}
async function advance(partIn, userId, sid, body = {}) {
  const part = P(partIn);
  const { s } = await loadSession(part, userId, sid);
  if (s.status !== 'active' || s.mode !== 'mock') throw new ToeicError('SESSION_CLOSED', 'ใช้ได้เฉพาะ Mock ที่กำลังทำ', 409);
  const to = Math.max(0, Math.min(s.items.length, Math.round(Number(body.passed) || 0)));
  await pool.query(`UPDATE toeic_sessions SET config = jsonb_set(config, '{passed}', to_jsonb(GREATEST(COALESCE((config->>'passed')::int, 0), $3::int))) WHERE id = $1 AND user_id = $2`, [sid, userId, to]);
  return { ok: true, passed: to };
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(rows) {
  const g = {};
  rows.forEach((r) => { const k = groupOf(r.skill); g[k] = g[k] || { group: k, th: PART34.groupTh[k], total: 0, correct: 0 }; g[k].total += 1; if (r.is_correct) g[k].correct += 1; });
  return Object.values(g).map((x) => ({ ...x, accuracy: Math.round((x.correct / x.total) * 100) })).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}
async function buildResult(part, s, answers) {
  const c = await bank.ready();
  const byId = new Map(answers.map((a) => [a.question_id, a]));
  const rows = [];
  const review = s.items.map((it, i) => {
    const p = c.byId.get(it.qid);
    if (!p) return null;
    const qs = p.questions.map((q, k) => {
      const a = byId.get(qId(p.id, k + 1));
      if (s.mode === 'mock' || a) rows.push({ skill: q.type, is_correct: Boolean(a && a.is_correct) });
      return qFeedback(p, k + 1, it.vs[k], a ? a.selected : null);
    });
    return { ...publicItem(p, it.vs, i + 1), start: i * 3 + 1, questions: qs, feedback: setFeedback(p) };
  }).filter(Boolean);
  const correct = rows.filter((r) => r.is_correct).length; const total = rows.length;
  const skills = breakdown(rows);
  const ranked = [...skills].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const unanswered = s.mode === 'mock' ? s.total - answers.length : 0;
  return {
    mode: s.mode, part, correct, incorrect: total - correct - unanswered, unanswered, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    expAwarded: s.exp_awarded, label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 85 ? 'สูง — จับใจความและรายละเอียดได้ดี' : pct >= 60 ? 'ปานกลาง — ฝึกอ่านคำถามล่วงหน้าแล้วฟังหาคำตอบ' : 'ควรฝึกฟังภาพรวม (ใคร ที่ไหน เรื่องอะไร) ให้แม่นก่อน') : null,
    disclaimer: 'Practice Score / Estimated performance ของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ',
    review,
  };
}
async function finish(partIn, userId, sid) {
  const part = P(partIn);
  const { s, answers } = await loadSession(part, userId, sid);
  if (s.status === 'finished') return { result: await buildResult(part, s, answers), exp: 0, levelInfo: null, leveledUp: false, already: true };
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้ถูกยกเลิกแล้ว', 409);
  if (s.mode === 'practice' && !answers.length) throw new ToeicError('EMPTY', 'ยังไม่ได้ตอบข้อใดเลย', 409);
  const correct = answers.filter((a) => a.is_correct).length;
  const upd = await pool.query(`UPDATE toeic_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`, [sid, userId, correct]);
  if (!upd.rows[0]) return finish(part, userId, sid);
  const E = PART34.exp; const grants = [];
  if (s.mode === 'practice') {
    if (answers.length >= 3) {
      grants.push(await grantOnce(userId, `t${part}c:${sid}`, E.practiceComplete, { reason: `toeic_p${part}_done`, dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length === s.total && s.total >= 6) grants.push(await grantOnce(userId, `t${part}p:${sid}`, E.practicePerfect, { reason: `toeic_p${part}_perfect`, dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    if (answers.length) {
      await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
        SELECT $1, 'listening', question_id, $3, is_correct, 'toeic', NULL FROM toeic_answers WHERE session_id = $2`, [userId, sid, `P${part}`]).catch(() => {});
    }
    if (answers.length >= Math.ceil(s.total / 2)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = $3 AND mode = 'mock' AND status = 'finished' AND id <> $2
            AND exp_awarded > 0 AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid, part]);
      if (rows[0].n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t${part}m:${sid}`, rows[0].n === 0 ? E.mockComplete : E.mockRepeat, { reason: `toeic_p${part}_mock` }));
      if (correct === s.total) grants.push(await grantOnce(userId, `t${part}mp:${sid}`, E.mockPerfect, { reason: `toeic_p${part}_mock_perf`, dailyCap: E.mockPerfect }));
    }
  }
  const g = grants.length ? mergeGrants(grants) : { gained: 0, levelInfo: null, leveledUp: false };
  await pool.query('UPDATE toeic_sessions SET exp_awarded = $2 WHERE id = $1', [sid, g.gained]);
  return { result: await buildResult(part, { ...upd.rows[0], exp_awarded: g.gained }, answers), exp: g.gained, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
}

/* ---------------- Landing / Analytics / Error Notebook ---------------- */
const RANGE = { '7': "NOW() - INTERVAL '7 days'", '30': "NOW() - INTERVAL '30 days'", all: "'-infinity'::timestamptz" };
async function summary(partIn, userId, range = 'all') {
  const part = P(partIn);
  const since = RANGE[range] || RANGE.all;
  const { rows } = await pool.query(
    `SELECT a.question_id, a.is_correct, a.skill, a.accent, a.response_ms FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = $2 AND a.created_at >= ${since} AND (a.mode = 'practice' OR s.status = 'finished')`, [userId, part]);
  const all = await bank.poolOf(part);
  const total = rows.length; const correct = rows.filter((r) => r.is_correct).length;
  const cat = (pred) => { const xs = rows.filter(pred); return xs.length ? { total: xs.length, accuracy: Math.round((xs.filter((r) => r.is_correct).length / xs.length) * 100) } : null; };
  const best = await pool.query(`SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = $2 AND status = 'finished' GROUP BY mode`, [userId, part]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const active = await pool.query(`SELECT id, mode, total, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = $2 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId, part]);
  const skills = breakdown(rows);
  const times = rows.map((r) => r.response_ms).filter((x) => x > 0);
  return {
    part, range, answered: total, correct, accuracy: total ? Math.round((correct / total) * 100) : null,
    setsPracticed: new Set(rows.map((r) => parseQ(part, r.question_id).pid)).size,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'), skills,
    weakSkill: skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null,
    accents: { us: cat((r) => r.accent === 'us'), uk: cat((r) => r.accent === 'uk') },
    mistakes: (await mistakeRows(part, userId)).length,
    activeSessions: active.rows.map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: all.length, bankQuestions: all.length * 3,
  };
}
async function mistakeRows(part, userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at FROM (
       SELECT DISTINCT ON (a.question_id) a.* FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.part = $2 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId, part]);
  return rows;
}
async function mistakes(partIn, userId) {
  const part = P(partIn);
  const c = await bank.ready();
  const by = new Map();
  (await mistakeRows(part, userId)).forEach((r) => { const b = parseQ(part, r.question_id); if (!b) return; if (!by.has(b.pid)) by.set(b.pid, []); by.get(b.pid).push({ ...r, k: b.k }); });
  return { items: [...by.entries()].map(([pid, rs]) => {
    const p = c.byId.get(pid);
    if (!p) return null;
    const questions = p.questions.map((q, k) => { const r = rs.find((x) => x.k === k + 1); return { ...qFeedback(p, k + 1, r ? r.variant : 0, r ? r.selected : null), wrong: Boolean(r) }; });
    return { ...publicItem(p, [0, 0, 0], 0), start: 1, questions, feedback: setFeedback(p), wrongCount: rs.length };
  }).filter(Boolean) };
}
async function addToReview(partIn, userId, wordId) {
  const part = P(partIn);
  const all = await bank.poolOf(part);
  if (!all.some((p) => (p.vocabulary || []).some((v) => v.wordId === wordId))) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW()) RETURNING (xmax = 0) AS inserted`, [userId, wordId, wordId.slice(0, 2)]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}
async function meta(partIn) {
  const part = P(partIn);
  const all = await bank.poolOf(part);
  return { part, disclaimer: DISCLAIMER_TH, sizes: PART34.practiceSizes, mockSets: PART34.mockSets[part], previewSec: PART34.previewSec,
    answerSecPerQuestion: PART34.answerSecPerQuestion, groupTh: PART34.groupTh, talkTypeTh: part === 4 ? PART34.talkTypeTh : null,
    audioCheckUrl: AUDIO.checkUrl, exp: PART34.exp, bankSize: all.length, graphicSets: all.filter((p) => p.graphic).length,
    threeSpeakerSets: all.filter((p) => p.speakers.length === 3).length };
}

module.exports = { startSession, getSession, answer, advance, finish, summary, mistakes, addToReview, meta,
  _internal: { PERMS, permOf, correctLetter, publicItem, pickMock, parseQ, groupOf } };
