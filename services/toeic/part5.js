/*
  TOEIC-style Reading Part 5 — Incomplete Sentences (Practice / Mock Test)

  ความปลอดภัย / ความถูกต้อง:
    - หน้าเว็บได้ประโยค + ตัวเลือก A–D (ลำดับสลับต่อชุด) เท่านั้น — ไม่มีเฉลย/คำอธิบายก่อนตอบ
    - ตรวจคำตอบที่เซิร์ฟเวอร์จากลำดับตัวเลือกที่เซิร์ฟเวอร์สุ่มให้ (variant = ดัชนี permutation 0–23)
    - EXP ผ่าน utils/exp.js (grantOnce + เพดานต่อวัน) · Coin ใช้กฎเดิมของ TOEIC (t5c/t5m) ผ่าน hook ของ grantOnce
  Practice : ตอบข้อละครั้ง · เห็นเฉลย คำแปล คำอธิบายทุกตัวเลือก และคำศัพท์ทันที
  Mock     : 30 ข้อ · จับเวลา 12 นาที (เซิร์ฟเวอร์เป็นผู้ตัดสินเวลา) · เปลี่ยนคำตอบได้จนกว่าจะส่ง/หมดเวลา · ไม่มีเฉลยระหว่างทำ
             ส่งก่อนครบได้ — ข้อที่ไม่ได้ตอบนับว่าผิด
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART5, DISCLAIMER_TH } = require('../../config/toeic');
const { ToeicError } = require('./part1');
const { LETTERS, BLANK } = require('./part5Validator');

const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const G = PART5.skillGroups;
const GROUP_KEYS = Object.keys(G);
const groupOf = (skill) => GROUP_KEYS.find((g) => G[g].includes(skill)) || 'vocabulary';

// 24 permutations ของ [0,1,2,3] — variant = ดัชนี (เก็บใน toeic_answers.variant SMALLINT เดิม)
const PERMS = (() => {
  const out = [];
  const rec = (a, rest) => { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec([...a, x], [...rest.slice(0, i), ...rest.slice(i + 1)])); };
  rec([], [0, 1, 2, 3]);
  return out;
})();
const permOf = (v) => PERMS[Number.isInteger(v) && v >= 0 && v < 24 ? v : 0];
const correctLetter = (q, v) => LETTERS[permOf(v).indexOf(q.answer)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick(items, weight, n, taken = new Set()) {
  const left = items.filter((q) => !taken.has(answerKey(q))).map((x) => ({ x, w: Math.max(0.001, weight(x)) }));
  const out = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total; let i = 0;
    for (; i < left.length - 1; i += 1) { r -= left[i].w; if (r <= 0) break; }
    const { x } = left.splice(i, 1)[0];
    // ข้อที่คำตอบเป็นคำเดียวกัน (เช่น comply ×2) ไม่อยู่ในชุดเดียวกัน — กันข้อหนึ่งเฉลยอีกข้อ
    const k = answerKey(x);
    if (taken.has(k)) continue;
    taken.add(k); out.push(x);
    for (let j = left.length - 1; j >= 0; j -= 1) if (answerKey(left[j].x) === k) left.splice(j, 1);
  }
  return out;
}
const answerKey = (q) => String(q.options[q.answer]).toLowerCase();

/** ประวัติ: คำตอบล่าสุดต่อข้อ + ความแม่นยำต่อกลุ่ม */
async function history(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (question_id) question_id, variant, is_correct FROM toeic_answers
      WHERE user_id = $1 AND part = 5 ORDER BY question_id, created_at DESC`, [userId]);
  const last = new Map(rows.map((r) => [r.question_id, r]));
  const agg = await pool.query(`SELECT skill, is_correct FROM toeic_answers WHERE user_id = $1 AND part = 5 ORDER BY created_at DESC LIMIT 300`, [userId]);
  const groups = {};
  agg.rows.forEach((r) => { const g = groupOf(r.skill); groups[g] = groups[g] || { n: 0, ok: 0 }; groups[g].n += 1; if (r.is_correct) groups[g].ok += 1; });
  const total = agg.rows.length;
  return { last, groups, total, acc: total ? agg.rows.filter((r) => r.is_correct).length / total : null };
}
function chooseVariant(prev) {
  let v = Math.floor(Math.random() * 24);
  // สลับลำดับไม่ให้ตำแหน่งคำตอบเหมือนครั้งก่อน (ลดการจำว่า "ข้อนี้ตอบ C")
  if (prev) for (let k = 0; k < 6 && v === prev.variant; k += 1) v = Math.floor(Math.random() * 24);
  return v;
}
function focusMatch(q, focus) {
  if (!focus || focus === 'mixed') return true;
  if (focus === 'grammar') return q.category === 'grammar';
  if (focus === 'vocabulary') return q.category === 'vocabulary';
  return groupOf(q.skill) === focus;
}

async function pickPractice(userId, cfg) {
  const all = await bank.pool5();
  const h = await history(userId);
  if (cfg.source === 'mistakes') {
    const c = all.filter((q) => h.last.has(q.id) && !h.last.get(q.id).is_correct);
    if (!c.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีข้อที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return { items: weightedPick(shuffle(c), () => 1, cfg.size), h, adaptive: null };
  }
  let cands = all.filter((q) => focusMatch(q, cfg.focus));
  let adaptive = null;
  if (cfg.difficulty === 'adaptive') {
    if (h.total >= PART5.adaptiveMinAnswers) {
      const weak = Object.entries(h.groups).filter(([, s]) => s.n >= 3 && s.ok / s.n < 0.7).map(([g]) => g);
      adaptive = { weak, target: h.acc >= 0.85 ? 'hard' : h.acc >= 0.6 ? 'medium' : 'easy', accuracy: Math.round(h.acc * 100) };
    } else adaptive = { weak: [], target: null, warmingUp: true, need: PART5.adaptiveMinAnswers - h.total };
  } else if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) {
    const f = cands.filter((q) => q.difficulty === cfg.difficulty);
    if (f.length >= Math.min(cfg.size, 5)) cands = f;
  }
  const DIFF = ['easy', 'medium', 'hard'];
  const weight = (q) => {
    const seen = h.last.get(q.id);
    let w = seen ? (seen.is_correct ? 0.3 : 1.6) : 2.2;
    if (adaptive && adaptive.target) {
      w *= [2.2, 1, 0.45][Math.abs(DIFF.indexOf(q.difficulty) - DIFF.indexOf(adaptive.target))];
      if (adaptive.weak.includes(groupOf(q.skill))) w *= 2.5;
    }
    return w;
  };
  return { items: weightedPick(cands, weight, cfg.size), h, adaptive };
}

/** Mock 30 ข้อตามแผนสัดส่วน · ข้อใหม่ก่อน · ความยากผสม · ลำดับสุ่ม */
async function pickMock(userId) {
  const all = await bank.pool5();
  const h = await history(userId);
  const fresh = (q) => (h.last.has(q.id) ? 0.4 : 2);
  const taken = new Set(); const items = [];
  for (const [g, n] of Object.entries(PART5.mockPlan)) {
    items.push(...weightedPick(all.filter((q) => groupOf(q.skill) === g), fresh, n, taken));
  }
  if (items.length < PART5.mockSize) {
    const used = new Set(items.map((q) => q.id));
    items.push(...weightedPick(all.filter((q) => !used.has(q.id)), fresh, PART5.mockSize - items.length, taken));
  }
  return { items: shuffle(items), h };
}

/* ---------------- ส่งให้หน้าเว็บ ---------------- */
function publicItem(q, variant, n) {
  return { n, qid: q.id, sentence: q.sentence, options: permOf(variant).map((i) => q.options[i]) };
}
function feedback(q, variant, selected = null) {
  const perm = permOf(variant);
  const correct = correctLetter(q, variant);
  return {
    qid: q.id, selected, correctOption: correct, isCorrect: selected ? selected === correct : null,
    sentence: q.sentence, completed: q.sentence.replace(BLANK, q.options[q.answer]), answerText: q.options[q.answer],
    options: perm.map((i, k) => ({ letter: LETTERS[k], text: q.options[i], isCorrect: i === q.answer, noteTH: q.optionNotesTH[i] })),
    translationTH: q.translationTH, why: q.explanationTH, tip: q.tipTH, vocabulary: q.vocabulary || [],
    skill: { id: q.skill, th: PART5.skillTh[q.skill] || q.skill, group: groupOf(q.skill), groupTh: PART5.skillGroupTh[groupOf(q.skill)] },
    difficulty: q.difficulty, category: q.category,
  };
}

/* ---------------- Session ---------------- */
function normConfig(mode, body = {}) {
  if (mode === 'mock') return { size: PART5.mockSize, minutes: PART5.mockMinutes };
  const size = PART5.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 10;
  const difficulty = ['easy', 'medium', 'hard', 'adaptive', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed';
  const group = Object.keys(PART5.skillGroups).includes(body.group) ? body.group : null;
  const focus = group || (PART5.focuses.includes(body.focus) ? body.focus : 'mixed');
  const source = body.source === 'mistakes' ? 'mistakes' : 'bank';
  return { size, difficulty, focus, source, ...(group ? { group, drill: body.drill === true } : {}) };
}

async function startSession(userId, mode, body = {}) {
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW()
                     WHERE user_id = $1 AND part = 5 AND mode = $2 AND status = 'active'`, [userId, mode]);
  const cfg = normConfig(mode, body);
  const picked = mode === 'mock' ? await pickMock(userId) : await pickPractice(userId, cfg);
  if (!picked.items.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีข้อที่พร้อมใช้งาน', 503);
  const items = picked.items.map((q) => ({ qid: q.id, variant: chooseVariant(picked.h.last.get(q.id)) }));
  const config = { ...cfg, adaptive: picked.adaptive || null };
  if (mode === 'mock') config.deadline = new Date(Date.now() + PART5.mockMinutes * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    'INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, 5, $2, $3, $4, $5) RETURNING id',
    [userId, mode, JSON.stringify(config), JSON.stringify(items), items.length]);
  return getSession(userId, rows[0].id);
}

async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2 AND part = 5', [sid, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}
const expired = (s, graceSec = PART5.graceSec) => s.mode === 'mock' && s.config.deadline && Date.now() > Date.parse(s.config.deadline) + graceSec * 1000;

async function getSession(userId, sid) {
  let { s, answers } = await loadSession(userId, sid);
  if (s.status === 'active' && expired(s)) {           // หมดเวลาแล้วแต่หน้าเว็บไม่ได้ส่ง (ปิดแอป/เน็ตหลุด) → ปิดชุดให้
    await finish(userId, sid);
    ({ s, answers } = await loadSession(userId, sid));
  }
  const c = await bank.ready();
  const items = s.items.map((it, i) => {
    const q = c.byId.get(it.qid);
    if (!q) return null;
    const pub = publicItem(q, it.variant, i + 1);
    const a = answers.find((x) => x.question_id === it.qid);
    if (a) {
      pub.answered = true;
      if (s.mode === 'mock') pub.selected = a.selected;                       // คำตอบของตัวเอง (ยังไม่บอกถูก/ผิด)
      if (s.mode === 'practice' || s.status === 'finished') pub.feedback = feedback(q, it.variant, a.selected);
    }
    return pub;
  }).filter(Boolean);
  return {
    id: Number(s.id), mode: s.mode, part: 5, status: s.status, total: s.total, answered: answers.length,
    config: s.config, items, deadline: s.config.deadline || null, serverNow: new Date().toISOString(),
    result: s.status === 'finished' ? await buildResult(s, answers) : null,
  };
}

async function answer(userId, sid, body = {}) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  if (expired(s)) throw new ToeicError('TIME_UP', 'หมดเวลาแล้ว', 409);
  const qid = String(body.qid || '').slice(0, 16);
  const it = s.items.find((x) => x.qid === qid);
  if (!it) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B, C หรือ D', 400);
  const prev = answers.find((a) => a.question_id === qid);
  if (prev && s.mode === 'practice') throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  const q = await bank.get(qid);
  const correct = correctLetter(q, it.variant);
  const isCorrect = selected === correct;
  const responseMs = Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  if (prev) {
    // Mock: เปลี่ยนคำตอบได้ก่อนส่ง (เวลาตอบ = ครั้งแรก)
    await pool.query('UPDATE toeic_answers SET selected = $2, is_correct = $3, created_at = NOW() WHERE id = $1', [prev.id, selected, isCorrect]);
    return { qid, answered: answers.length, total: s.total, changed: true };
  }
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, 5, $4, $5, $6, $7, $8, NULL, $9, $10, $11, $12, NULL, $13)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, qid, s.mode, it.variant, selected, correct, isCorrect, q.skill, [q.skill], q.category, q.difficulty, responseMs]);
  if (!ins.rows[0]) {
    if (s.mode === 'mock') return answer(userId, sid, body);              // ส่งซ้อนกัน 2 คำขอ → ทำเป็นการเปลี่ยนคำตอบ
    throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  }
  const out = { qid, answered: answers.length + 1, total: s.total };
  if (s.mode === 'practice') {
    // สถิติรวมของบัญชี (answer_events) — ทักษะ reading · Mock บันทึกตอนส่ง (คำตอบยังเปลี่ยนได้)
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'reading', $2, 'P5', $3, 'toeic', $4)`,
      [userId, qid, isCorrect, groupOf(q.skill)]).catch(() => {});
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t5q:${qid}:${bkkDay()}`, PART5.exp.practiceCorrect, { reason: 'toeic_p5_practice' });
    Object.assign(out, { feedback: feedback(q, it.variant, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
  }
  return out;
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(rows) {
  const groups = {};
  rows.forEach((a) => {
    const g = groupOf(a.skill);
    groups[g] = groups[g] || { group: g, th: PART5.skillGroupTh[g], total: 0, correct: 0 };
    groups[g].total += 1; if (a.is_correct) groups[g].correct += 1;
  });
  return Object.values(groups).map((g) => ({ ...g, accuracy: Math.round((g.correct / g.total) * 100) }))
    .sort((a, b) => GROUP_KEYS.indexOf(a.group) - GROUP_KEYS.indexOf(b.group));
}

async function buildResult(s, answers) {
  const c = await bank.ready();
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  // Mock: ทุกข้อในชุดนับ (ข้อที่ไม่ได้ตอบ = ผิด) · Practice: เฉพาะข้อที่ตอบ
  const rows = s.mode === 'mock'
    ? s.items.map((it) => { const q = c.byId.get(it.qid); const a = byQ.get(it.qid); return q ? { skill: q.skill, is_correct: Boolean(a && a.is_correct) } : null; }).filter(Boolean)
    : answers.map((a) => ({ skill: a.skill, is_correct: a.is_correct }));
  const correct = rows.filter((r) => r.is_correct).length;
  const total = rows.length;
  const skills = breakdown(rows);
  const ranked = [...skills].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const usedMs = s.finished_at ? Math.max(0, Date.parse(s.finished_at) - Date.parse(s.started_at)) : null;
  return {
    mode: s.mode, correct, incorrect: total - correct - (s.mode === 'mock' ? s.items.length - answers.length : 0),
    unanswered: s.mode === 'mock' ? s.items.length - answers.length : 0, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    timeUsedMs: s.mode === 'mock' && usedMs != null ? Math.min(usedMs, PART5.mockMinutes * 60 * 1000) : null,
    timeLimitMs: s.mode === 'mock' ? PART5.mockMinutes * 60 * 1000 : null,
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    expAwarded: s.exp_awarded, label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 85 ? 'สูง — แม่นยำพอสำหรับข้อระดับยาก' : pct >= 60 ? 'ปานกลาง — ฝึกกลุ่มทักษะที่อ่อนเพิ่ม' : 'ควรทบทวนไวยากรณ์พื้นฐานและคำศัพท์ธุรกิจ') : null,
    disclaimer: 'Practice Score / Estimated performance ของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ',
    review: s.items.map((it, i) => {
      const q = c.byId.get(it.qid); const a = byQ.get(it.qid);
      return q ? { n: i + 1, ...feedback(q, it.variant, a ? a.selected : null), responseMs: a ? a.response_ms : null } : null;
    }).filter(Boolean),
  };
}

async function finish(userId, sid) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status === 'finished') return { result: await buildResult(s, answers), exp: 0, levelInfo: null, leveledUp: false, already: true };
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้ถูกยกเลิกแล้ว', 409);
  if (s.mode === 'practice' && !answers.length) throw new ToeicError('EMPTY', 'ยังไม่ได้ตอบข้อใดเลย', 409);
  const correct = answers.filter((a) => a.is_correct).length;
  const upd = await pool.query(
    `UPDATE toeic_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
    [sid, userId, correct]);
  if (!upd.rows[0]) return finish(userId, sid);
  const E = PART5.exp; const grants = [];
  if (s.mode === 'practice') {
    if (answers.length >= Math.min(5, s.total)) {
      grants.push(await grantOnce(userId, `t5c:${sid}`, E.practiceComplete, { reason: 'toeic_p5_done', dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length >= 5) grants.push(await grantOnce(userId, `t5p:${sid}`, E.practicePerfect, { reason: 'toeic_p5_perfect', dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    if (answers.length) {
      await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet)
        SELECT $1, 'reading', question_id, 'P5', is_correct, 'toeic', NULL FROM toeic_answers WHERE session_id = $2`, [userId, sid]).catch(() => {});
    }
    // ต้องตอบอย่างน้อยครึ่งชุดจึงได้ EXP (กดส่งเปล่า ๆ ไม่ได้รางวัล) · ครั้งแรกของวันเต็ม ครั้งต่อไปลดลง · เกิน 3 ครั้ง/วันไม่ได้
    if (answers.length >= Math.ceil(s.total / 2)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 5 AND mode = 'mock' AND status = 'finished' AND id <> $2
            AND exp_awarded > 0 AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid]);
      const n = rows[0].n;
      if (n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t5m:${sid}`, n === 0 ? E.mockComplete : E.mockRepeat, { reason: 'toeic_p5_mock' }));
      if (correct === s.total) grants.push(await grantOnce(userId, `t5mp:${sid}`, E.mockPerfect, { reason: 'toeic_p5_mock_perf', dailyCap: E.mockPerfect }));
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
    `SELECT a.question_id, a.is_correct, a.skill, a.category, a.difficulty, a.response_ms FROM toeic_answers a
       JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.part = 5 AND a.created_at >= ${since} AND (a.mode = 'practice' OR s.status = 'finished')`, [userId]);
  const c = await bank.ready();
  const total = rows.length; const correct = rows.filter((r) => r.is_correct).length;
  const cat = (pred) => { const xs = rows.filter(pred); return xs.length ? { total: xs.length, accuracy: Math.round((xs.filter((r) => r.is_correct).length / xs.length) * 100) } : null; };
  const skills = breakdown(rows);
  const best = await pool.query(
    `SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = 5 AND status = 'finished' AND total >= 5 GROUP BY mode`, [userId]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const active = await pool.query(`SELECT id, mode, total, config, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = 5 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId]);
  const times = rows.map((r) => r.response_ms).filter((x) => x > 0);
  return {
    range, answered: total, practiced: new Set(rows.map((r) => r.question_id)).size, correct,
    accuracy: total ? Math.round((correct / total) * 100) : null,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'),
    weakSkill: skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null, skills,
    categories: { grammar: cat((r) => r.category === 'grammar'), vocabulary: cat((r) => r.category === 'vocabulary') },
    difficulty: { easy: cat((r) => r.difficulty === 'easy'), medium: cat((r) => r.difficulty === 'medium'), hard: cat((r) => r.difficulty === 'hard') },
    mistakes: (await mistakeRows(userId)).length,
    activeSessions: active.rows.filter((r) => !(r.mode === 'mock' && r.config.deadline && Date.now() > Date.parse(r.config.deadline)))
      .map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: c.part5.length,
  };
}

/** ข้อที่คำตอบล่าสุด (ที่นับแล้ว) ยังผิด */
async function mistakeRows(userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at, response_ms FROM (
       SELECT DISTINCT ON (a.question_id) a.* FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND a.part = 5 AND (a.mode = 'practice' OR s.status = 'finished')
        ORDER BY a.question_id, a.created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}
async function mistakes(userId) {
  const c = await bank.ready();
  return { items: (await mistakeRows(userId)).map((r) => {
    const q = c.byId.get(r.question_id);
    return q ? { ...feedback(q, r.variant, r.selected), answeredAt: r.created_at, responseMs: r.response_ms } : null;
  }).filter(Boolean) };
}

/** เพิ่มคำจากข้อ Part 5 เข้ารายการทบทวน (word_progress / SRS เดิม) */
async function addToReview(userId, wordId) {
  const c = await bank.ready();
  if (!c.part5.some((q) => (q.vocabulary || []).some((v) => v.wordId === wordId))) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW())
     RETURNING (xmax = 0) AS inserted`, [userId, wordId, wordId.slice(0, 2)]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}

async function meta() {
  return {
    disclaimer: DISCLAIMER_TH, sizes: PART5.practiceSizes, mockSize: PART5.mockSize, mockMinutes: PART5.mockMinutes,
    focuses: PART5.focuses, groupTh: PART5.skillGroupTh, exp: PART5.exp, bankSize: (await bank.pool5()).length,
  };
}

module.exports = {
  startSession, getSession, answer, finish, summary, mistakes, addToReview, meta,
  _internal: { PERMS, permOf, correctLetter, feedback, publicItem, pickMock, pickPractice, groupOf, normConfig },
};
