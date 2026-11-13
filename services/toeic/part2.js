/*
  TOEIC-style Listening Part 2 — Question–Response (Practice / Mock Test)

  ความปลอดภัย:
    - ก่อนตอบหน้าเว็บได้แค่ไฟล์เสียง + เวลาเริ่มของคำถาม/A–C (ไม่มีข้อความ/เฉลย)
    - ตรวจคำตอบที่เซิร์ฟเวอร์จาก variant (ลำดับคำตอบในไฟล์เสียง) ที่เซิร์ฟเวอร์สุ่มให้ · ตอบซ้ำไม่ได้
    - EXP ผ่าน utils/exp.js (t2q/t2c/t2m) · Coin ใช้กฎ TOEIC เดิม (เพดานร่วมกับ Part อื่น)
  Practice : ฟังซ้ำได้ · 0.9x/1.0x · หลังตอบเห็น transcript · คำแปล · ประเภทกับดัก · คำอธิบาย
  Mock     : 25 ข้อ · เสียงเล่นครั้งเดียว · หลังเสียงจบมีเวลาเลือก 5 วินาทีแล้วไปข้อถัดไปเอง (บังคับฝั่งหน้าเว็บ) · ไม่ตอบ = ผิด
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART2, ACCENTS, AUDIO, DISCLAIMER_TH } = require('../../config/toeic');
const { ToeicError } = require('./part1');
const { LETTERS } = require('./part2Validator');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const CATS = Object.keys(PART2.categoryTh);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** สุ่มถ่วงน้ำหนัก · ข้อในกลุ่มเดียวกัน (โจทย์คล้ายกัน) ไม่อยู่ชุดเดียวกัน */
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
async function history(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.question_id) a.question_id, a.variant, a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 2 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC`, [userId]);
  return new Map(rows.map((r) => [r.question_id, r]));
}
const weightFor = (h) => (q) => { const x = h.get(q.id); return !x ? 2.2 : x.is_correct ? 0.35 : 1.6; };
function chooseVariant(q, prev) {
  const vs = q.variants.filter((v) => v.audio);
  const other = prev ? vs.filter((v) => v.v !== prev.variant) : vs;
  const c = other.length ? other : vs;
  return c[Math.floor(Math.random() * c.length)];
}

async function pickPractice(userId, cfg) {
  const all = await bank.pool2();
  const h = await history(userId);
  if (cfg.source === 'mistakes') {
    const c = all.filter((q) => h.get(q.id) && !h.get(q.id).is_correct);
    if (!c.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีข้อที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return { items: weightedPick(shuffle(c), () => 1, cfg.size), h };
  }
  let c = all.filter((q) => cfg.focus === 'mixed' || q.category === cfg.focus);
  if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) { const f = c.filter((q) => q.difficulty === cfg.difficulty); if (f.length >= Math.min(cfg.size, 5)) c = f; }
  return { items: weightedPick(c, weightFor(h), cfg.size), h };
}
/** Mock 25 ข้อ: สัดส่วนประเภทคำถามใกล้ข้อสอบจริง (Wh- ~ครึ่งหนึ่ง) · ข้อใหม่ก่อน */
async function pickMock(userId) {
  const all = await bank.pool2();
  const h = await history(userId);
  const w = weightFor(h);
  const plan = { wh: 12, yesNo: 3, choice: 2, tag: 2, negative: 2, statement: 2, request: 2 };
  const used = new Set(); const out = [];
  for (const [cat, n] of Object.entries(plan)) out.push(...weightedPick(all.filter((q) => q.category === cat), w, n, used));
  if (out.length < PART2.mockSize) out.push(...weightedPick(all.filter((q) => !out.includes(q)), w, PART2.mockSize - out.length, used));
  return { items: shuffle(out), h };
}

/* ---------------- ส่งให้หน้าเว็บ ---------------- */
function publicItem(q, v, n) {
  return { n, qid: q.id, audio: { url: v.audio.url, duration: v.audio.duration, segments: v.audio.segments.map((s) => ({ letter: s.letter, start: s.start, end: s.end })) } };
}
function feedback(q, vno, selected = null) {
  const v = q.variants.find((x) => x.v === vno) || q.variants[0];
  return {
    qid: q.id, selected, correctOption: v.correctOption, isCorrect: selected ? selected === v.correctOption : null,
    prompt: q.prompt, promptTH: q.promptTH,
    responses: v.order.map((i, k) => { const r = q.responses[i]; return { letter: LETTERS[k], text: r.text, translationTH: r.translationTH, isCorrect: r.isCorrect,
      distractorType: r.isCorrect ? null : r.distractorType, distractorTH: r.isCorrect ? 'ถูกต้อง' : (PART2.distractorTh[r.distractorType] || r.distractorType), explanationTH: r.explanationTH }; }),
    why: q.explanationTH, tip: q.tipTH, vocabulary: q.vocabulary || [], difficulty: q.difficulty,
    category: { id: q.category, th: PART2.categoryTh[q.category], wh: q.whWord || null },
    speakers: { prompt: ACCENTS[v.speakers.prompt.accent], response: ACCENTS[v.speakers.response.accent] },
    audio: { url: v.audio.url, duration: v.audio.duration, segments: v.audio.segments },
  };
}

/* ---------------- Session ---------------- */
const GROUPS2 = Object.keys(PART2.categoryTh);
function normConfig(mode, body = {}) {
  if (mode === 'mock') return { size: PART2.mockSize, answerGapSec: PART2.answerGapSec };
  return { size: PART2.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 10,
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed',
    focus: GROUPS2.includes(body.group) ? body.group : PART2.topics.includes(body.focus) ? body.focus : 'mixed',
    source: body.source === 'mistakes' ? 'mistakes' : 'bank',
    ...(GROUPS2.includes(body.group) ? { group: body.group, drill: body.drill === true } : {}) };
}
async function startSession(userId, mode, body = {}) {
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND part = 2 AND mode = $2 AND status = 'active'`, [userId, mode]);
  const cfg = normConfig(mode, body);
  const picked = mode === 'mock' ? await pickMock(userId) : await pickPractice(userId, cfg);
  if (!picked.items.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีข้อที่พร้อมใช้งาน', 503);
  const items = picked.items.map((q) => ({ qid: q.id, variant: chooseVariant(q, picked.h.get(q.id)).v }));
  const { rows } = await pool.query('INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, 2, $2, $3, $4, $5) RETURNING id',
    [userId, mode, JSON.stringify(cfg), JSON.stringify(items), items.length]);
  return getSession(userId, rows[0].id);
}
async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2 AND part = 2', [sid, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}
async function getSession(userId, sid) {
  const { s, answers } = await loadSession(userId, sid);
  const c = await bank.ready();
  const items = s.items.map((it, i) => {
    const q = c.byId.get(it.qid);
    if (!q) return null;
    const v = q.variants.find((x) => x.v === it.variant);
    const pub = publicItem(q, v, i + 1);
    const a = answers.find((x) => x.question_id === it.qid);
    if (a) { pub.answered = true; if (s.mode === 'practice' || s.status === 'finished') pub.feedback = feedback(q, it.variant, a.selected); }
    return pub;
  }).filter(Boolean);
  // Mock: ข้อที่ "ผ่านไปแล้ว" (เล่นเสียงแล้ว) — ถ้ารีโหลดหน้าจะไม่ได้ฟังซ้ำ
  const passed = Number((s.config && s.config.passed) || 0);
  return { id: Number(s.id), mode: s.mode, part: 2, status: s.status, total: s.total, answered: answers.length, passed,
    config: s.config, items, result: s.status === 'finished' ? await buildResult(s, answers) : null };
}

async function answer(userId, sid, body = {}) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  const qid = String(body.qid || '').slice(0, 16);
  const idx = s.items.findIndex((x) => x.qid === qid);
  const it = s.items[idx];
  if (!it) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B หรือ C', 400);
  if (answers.some((a) => a.question_id === qid)) throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  // Mock: ข้อที่ผ่านไปแล้วย้อนกลับมาตอบไม่ได้
  if (s.mode === 'mock' && idx < Number((s.config && s.config.passed) || 0)) throw new ToeicError('PASSED', 'ข้อนี้ผ่านไปแล้ว', 409);
  const q = await bank.get(qid);
  const v = q.variants.find((x) => x.v === it.variant);
  const isCorrect = selected === v.correctOption;
  const chosen = q.responses[v.order[LETTERS.indexOf(selected)]];
  const responseMs = Math.max(0, Math.min(5 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, qid, s.mode, it.variant, selected, v.correctOption, isCorrect, isCorrect ? null : chosen.distractorType,
      q.category, [q.category, q.whWord].filter(Boolean), q.category, q.difficulty, v.speakers.response.accent, responseMs]);
  if (!ins.rows[0]) throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  const out = { qid, answered: answers.length + 1, total: s.total };
  if (s.mode === 'practice') {
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'listening', $2, 'P2', $3, 'toeic', $4)`,
      [userId, qid, isCorrect, q.category]).catch(() => {});
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t2q:${qid}:${bkkDay()}`, PART2.exp.practiceCorrect, { reason: 'toeic_p2_practice' });
    Object.assign(out, { feedback: feedback(q, it.variant, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
  }
  return out;
}
/** Mock: บันทึกว่าผ่านข้อไหนไปแล้ว (เสียงเล่นจบ + หมดเวลาเลือก) — ใช้กันย้อนกลับไปฟัง/ตอบ */
async function advance(userId, sid, body = {}) {
  const { s } = await loadSession(userId, sid);
  if (s.status !== 'active' || s.mode !== 'mock') throw new ToeicError('SESSION_CLOSED', 'ใช้ได้เฉพาะ Mock ที่กำลังทำ', 409);
  const to = Math.max(0, Math.min(s.total, Math.round(Number(body.passed) || 0)));
  await pool.query(`UPDATE toeic_sessions SET config = jsonb_set(config, '{passed}', to_jsonb(GREATEST(COALESCE((config->>'passed')::int, 0), $3::int))) WHERE id = $1 AND user_id = $2`, [sid, userId, to]);
  return { ok: true, passed: to };
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(rows) {
  const g = {};
  rows.forEach((r) => { const k = r.category; g[k] = g[k] || { group: k, th: PART2.categoryTh[k] || k, total: 0, correct: 0 }; g[k].total += 1; if (r.is_correct) g[k].correct += 1; });
  return Object.values(g).map((x) => ({ ...x, accuracy: Math.round((x.correct / x.total) * 100) })).sort((a, b) => CATS.indexOf(a.group) - CATS.indexOf(b.group));
}
async function buildResult(s, answers) {
  const c = await bank.ready();
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const rows = s.mode === 'mock'
    ? s.items.map((it) => { const q = c.byId.get(it.qid); const a = byQ.get(it.qid); return q ? { category: q.category, is_correct: Boolean(a && a.is_correct) } : null; }).filter(Boolean)
    : answers.map((a) => ({ category: a.category, is_correct: a.is_correct }));
  const correct = rows.filter((r) => r.is_correct).length; const total = rows.length;
  const skills = breakdown(rows);
  const ranked = [...skills].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const traps = {};
  answers.filter((a) => !a.is_correct && a.distractor_type).forEach((a) => { traps[a.distractor_type] = (traps[a.distractor_type] || 0) + 1; });
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const unanswered = s.mode === 'mock' ? s.total - answers.length : 0;
  return {
    mode: s.mode, correct, incorrect: total - correct - unanswered, unanswered, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    traps: Object.entries(traps).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, n]) => ({ type, th: PART2.distractorTh[type], n })),
    expAwarded: s.exp_awarded, label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 84 ? 'สูง — ฟังจับเจตนาคำถามได้ดี' : pct >= 56 ? 'ปานกลาง — ระวังกับดักคำซ้ำ/เสียงคล้าย' : 'ควรฝึกฟังคำแรกของคำถาม (Wh-) ให้แม่น') : null,
    disclaimer: 'Practice Score / Estimated performance ของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ',
    review: s.items.map((it, i) => { const q = c.byId.get(it.qid); const a = byQ.get(it.qid); return q ? { n: i + 1, ...feedback(q, it.variant, a ? a.selected : null) } : null; }).filter(Boolean),
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
  const E = PART2.exp; const grants = [];
  if (s.mode === 'practice') {
    if (answers.length >= Math.min(5, s.total)) {
      grants.push(await grantOnce(userId, `t2c:${sid}`, E.practiceComplete, { reason: 'toeic_p2_done', dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length >= 5) grants.push(await grantOnce(userId, `t2p:${sid}`, E.practicePerfect, { reason: 'toeic_p2_perfect', dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    if (answers.length) {
      await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
        SELECT $1, 'listening', question_id, 'P2', is_correct, 'toeic', category FROM toeic_answers WHERE session_id = $2`, [userId, sid]).catch(() => {});
    }
    if (answers.length >= Math.ceil(s.total / 2)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 2 AND mode = 'mock' AND status = 'finished' AND id <> $2
            AND exp_awarded > 0 AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid]);
      if (rows[0].n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t2m:${sid}`, rows[0].n === 0 ? E.mockComplete : E.mockRepeat, { reason: 'toeic_p2_mock' }));
      if (correct === s.total) grants.push(await grantOnce(userId, `t2mp:${sid}`, E.mockPerfect, { reason: 'toeic_p2_mock_perf', dailyCap: E.mockPerfect }));
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
    `SELECT a.question_id, a.is_correct, a.category, a.accent, a.distractor_type, a.response_ms FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 2 AND a.created_at >= ${since} AND (a.mode = 'practice' OR s.status = 'finished')`, [userId]);
  const c = await bank.ready();
  const total = rows.length; const correct = rows.filter((r) => r.is_correct).length;
  const cat = (pred) => { const xs = rows.filter(pred); return xs.length ? { total: xs.length, accuracy: Math.round((xs.filter((r) => r.is_correct).length / xs.length) * 100) } : null; };
  const traps = {};
  rows.filter((r) => !r.is_correct && r.distractor_type).forEach((r) => { traps[r.distractor_type] = (traps[r.distractor_type] || 0) + 1; });
  const best = await pool.query(`SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = 2 AND status = 'finished' AND total >= 5 GROUP BY mode`, [userId]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const active = await pool.query(`SELECT id, mode, total, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = 2 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId]);
  const skills = breakdown(rows);
  const times = rows.map((r) => r.response_ms).filter((x) => x > 0);
  return {
    range, answered: total, correct, accuracy: total ? Math.round((correct / total) * 100) : null,
    practiced: new Set(rows.map((r) => r.question_id)).size,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'), skills,
    weakSkill: skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null,
    accents: { us: cat((r) => r.accent === 'us'), uk: cat((r) => r.accent === 'uk') },
    traps: Object.entries(traps).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, n]) => ({ type, th: PART2.distractorTh[type], n })),
    mistakes: (await mistakeRows(userId)).length,
    activeSessions: active.rows.map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: c.part2.length,
  };
}
async function mistakeRows(userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at, distractor_type FROM (
       SELECT DISTINCT ON (a.question_id) a.* FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.part = 2 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}
async function mistakes(userId) {
  const c = await bank.ready();
  return { items: (await mistakeRows(userId)).map((r) => {
    const q = c.byId.get(r.question_id);
    return q ? { ...feedback(q, r.variant, r.selected), answeredAt: r.created_at, distractorSelectedTH: PART2.distractorTh[r.distractor_type] || null } : null;
  }).filter(Boolean) };
}
async function addToReview(userId, wordId) {
  const c = await bank.ready();
  if (!c.part2.some((q) => (q.vocabulary || []).some((v) => v.wordId === wordId))) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW()) RETURNING (xmax = 0) AS inserted`, [userId, wordId, wordId.slice(0, 2)]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}
async function meta() {
  return { disclaimer: DISCLAIMER_TH, sizes: PART2.practiceSizes, mockSize: PART2.mockSize, answerGapSec: PART2.answerGapSec,
    focuses: PART2.topics, categoryTh: PART2.categoryTh, exp: PART2.exp, audioCheckUrl: AUDIO.checkUrl, bankSize: (await bank.pool2()).length };
}

module.exports = { startSession, getSession, answer, advance, finish, summary, mistakes, addToReview, meta,
  _internal: { feedback, publicItem, pickMock, pickPractice, chooseVariant } };
