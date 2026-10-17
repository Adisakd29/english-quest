/*
  บทเรียนแกรมม่าแบบทีละขั้น (Micro-learning) — Learn → Quick Check → Learn → Practice → … → Challenge → Review → Mastery Check
  - แผนบทเรียน 12 ขั้น สร้างจากเนื้อหาหลักสูตร (data/grammar-curriculum) อัตโนมัติ ไม่ต้องเขียนเนื้อหาซ้ำ
  - ชุดข้อของแต่ละรอบกำหนดด้วย seed (ผู้ใช้ + หัวข้อ + รอบ) -> refresh / เปลี่ยนเครื่อง ได้ชุดเดิม เรียนต่อได้ทันที
  - ความคืบหน้าเก็บที่เซิร์ฟเวอร์ (grammar_lessons) ไม่ใช่ localStorage
  - ผ่านบท = ความแม่นของข้อในรอบนั้น >= 80% (คำตอบแรกของแต่ละข้อ) · เปิดอ่านเฉย ๆ ไม่นับว่าผ่าน
  - EXP เข้าบัญชีเดียวกับคำศัพท์/Ranked (utils/exp.js) · รางวัลจบขั้น/จบบท/Perfect/ตอบถูกครั้งแรก ได้ครั้งเดียวต่อคีย์
*/
const pool = require('../../config/db');
const GC = require('../../data/grammar-curriculum');
const E = require('./engine');
const { checkAnswer } = require('./check');
const { grantOnce, mergeGrants } = require('../../utils/exp');

const PASS_PCT = 80;                 // ผ่านบท
const MASTER_PCT = 85;               // เชี่ยวชาญ (ร่วมกับทบทวนผ่าน)
const EXP = { step: 5, check: { A1: 8, A2: 8, B1: 10, B2: 10, C1: 12 }, complete: 30, perfect: 15 };
const checkExp = (cefr) => EXP.check[cefr] || 8;
const DAILY_CAP = null;              // ไม่มีเพดานรายวัน — กันปั๊มด้วย "ครั้งเดียวต่อคีย์" แทน
const CHOICE = new Set(['mc', 'choose', 'dialogue', 'context']);

const STEP_META = {
  concept: { title: 'Concept', th: 'ใช้เมื่อไร', icon: 'lightbulb' },
  discover: { title: 'Discover', th: 'ค้นหารูปแบบเอง', icon: 'search' },
  structure: { title: 'Structure', th: 'โครงสร้าง', icon: 'box' },
  examples: { title: 'Examples', th: 'ตัวอย่างเพิ่ม', icon: 'book-open' },
  context: { title: 'Real Life', th: 'ในชีวิตจริง', icon: 'message-circle' },
  mistakes: { title: 'Common Mistakes', th: 'จุดที่มักผิด', icon: 'circle-alert' },
  review: { title: 'Lesson Review', th: 'สรุปบทเรียน', icon: 'list-checks' },
  quick: { title: 'Quick Check', th: 'เช็กความเข้าใจ', icon: 'target' },
  practice: { title: 'Mini Practice', th: 'ฝึกสั้น ๆ', icon: 'pencil-line' },
  challenge: { title: 'Practice Challenge', th: 'ท้าทายรวมรูปแบบ', icon: 'zap' },
  mastery: { title: 'Mastery Check', th: 'วัดผลท้ายบท', icon: 'award' },
};
const CHECK_ROLES = new Set(['quick', 'practice', 'challenge', 'mastery']);

/* ---------------- แผนบทเรียน ---------------- */
function chunkRows(rows) {
  const n = rows.length;
  if (n <= 2) return [rows];
  const size = n <= 4 ? 2 : Math.ceil(n / 3);
  const out = [];
  for (let i = 0; i < n && out.length < 3; i += size) out.push(rows.slice(i, i + size));
  return out;
}
const norm = (w) => String(w).toLowerCase().replace(/[^a-z']/g, '');
function detectable(it) {
  if (it.type !== 'error' || !it.errorPart || !it.sentence) return false;
  const toks = new Set(it.sentence.split(/\s+/).map(norm));
  return it.errorPart.split(/\s+/).map(norm).filter(Boolean).every((w) => toks.has(w));
}
const shortChoices = (it) => it.type === 'mc' && /_{2,}/.test(it.question || '') && it.choices.every((c) => String(c).split(/\s+/).length <= 3);

/** แบ่งข้อให้แต่ละขั้น: ง่าย -> ยาก · หลากหลายรูปแบบ · ไม่ใช้ข้อเขียนยาว (อยู่ใน Writing Practice) */
function allocate(topic, seed) {
  const pool = E._seededShuffle(topic.practice.filter((p) => p.type !== 'write'), seed)
    .sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
  const left = [...pool];
  const take = (n, prefer = [], { fromEnd = false, distinct = false } = {}) => {
    const out = []; const types = new Set();
    const order = fromEnd ? [...left].reverse() : [...left];
    const pick = (it) => { out.push(it); types.add(it.type); left.splice(left.indexOf(it), 1); };
    for (const t of prefer) { if (out.length >= n) break; const it = order.find((x) => x.type === t && !out.includes(x) && (!distinct || !types.has(x.type))); if (it) pick(it); }
    for (const it of order) { if (out.length >= n) break; if (!out.includes(it) && left.includes(it) && (!distinct || !types.has(it.type))) pick(it); }
    for (const it of order) { if (out.length >= n) break; if (!out.includes(it) && left.includes(it)) pick(it); }
    return out;
  };
  const budget = pool.length >= 15 ? [2, 2, 3, 4, 4] : pool.length >= 10 ? [2, 2, 2, 2, 2] : [1, 1, 1, 1, 1];
  const quick = take(budget[0], ['mc', 'choose', 'fill']);
  const p1 = take(budget[1], ['fill', 'order', 'error', 'match']);
  const p2 = take(budget[2], ['transform', 'dialogue', 'error', 'order']);
  const mastery = take(budget[4], ['transform', 'context', 'error', 'fill'], { fromEnd: true });
  const challenge = take(budget[3], ['error', 'order', 'match', 'context', 'choose', 'dialogue'], { distinct: true });
  // รูปแบบเสริม: "ลากคำลงช่องว่าง" (ข้อเลือกคำสั้น ๆ ใน Quick Check) · "หาคำที่ผิด" (ข้อแก้ผิดหนึ่งข้อ — ขั้นท้าทายก่อน)
  const drag = [...quick, ...p1, ...p2].find(shortChoices);
  const detect = [...challenge, ...p2, ...p1, ...mastery].find(detectable);
  const ref = (it) => ({ id: it.id, mode: it === drag ? 'drag' : it === detect ? 'detect' : null });
  return { quick: quick.map(ref), practice1: p1.map(ref), practice2: p2.map(ref), challenge: challenge.map(ref), mastery: mastery.map(ref) };
}

function buildPlan(topicId, seed) {
  const t = GC.getTopic(topicId);
  if (!t) return null;
  const chunks = chunkRows(t.structure.rows || []);
  const items = allocate({ ...t, practice: t.practice.map((p) => ({ ...p, topic: t.id, cefr: t.cefr })) }, seed);
  const learn5 = chunks[1] ? { kind: 'structure', chunk: 1 } : { kind: 'examples' };
  const learn7 = chunks[2] ? { kind: 'structure', chunk: 2 } : (learn5.kind === 'examples' ? { kind: 'context' } : { kind: (t.examples || []).length > 3 ? 'examples' : 'context' });
  const steps = [
    { kind: 'concept' }, { kind: 'discover' }, { kind: 'structure', chunk: 0 },
    { kind: 'check', role: 'quick', items: items.quick },
    learn5, { kind: 'check', role: 'practice', items: items.practice1 },
    learn7, { kind: 'check', role: 'practice', items: items.practice2 },
    { kind: 'mistakes' }, { kind: 'check', role: 'challenge', items: items.challenge },
    { kind: 'review' }, { kind: 'check', role: 'mastery', items: items.mastery },
  ].filter((s) => s.kind !== 'check' || s.items.length);
  return steps.map((s, k) => {
    const meta = STEP_META[s.kind === 'check' ? s.role : s.kind];
    let title = meta.title; let th = meta.th;
    if (s.kind === 'structure') { const r = chunks[s.chunk] || []; th = r.map((x) => x.label).join(' · ') || th; if (s.chunk > 0) title = 'Structure'; }
    return { k, ...s, title, th, icon: meta.icon };
  });
}
const seedOf = (userId, topicId, run) => `${userId}:${topicId}:${run}`;

/* ---------------- เนื้อหาของแต่ละขั้น ---------------- */
function formulaChoices(t, seed) {
  const own = t.structure.formula;
  const others = [];
  for (const id of [].concat((t.compare && t.compare.with) || [], t.compareWith || [])) {
    const o = GC.getTopic(id);
    if (o && o.structure && o.structure.formula && o.structure.formula !== own && !others.includes(o.structure.formula)) others.push(o.structure.formula);
  }
  for (const o of GC.TOPICS.filter((x) => x.cefr === t.cefr && x.id !== t.id)) {
    if (others.length >= 2) break;
    const c = GC.getTopic(o.id);
    if (c && c.structure.formula !== own && !others.includes(c.structure.formula)) others.push(c.structure.formula);
  }
  const choices = E._seededShuffle([own, ...others.slice(0, 2)], `${seed}:discover`);
  return { choices, answer: choices.indexOf(own) };
}
function stepContent(t, step, seed) {
  const chunks = chunkRows(t.structure.rows || []);
  switch (step.kind) {
    case 'concept': return {
      question: `เราใช้ ${t.title} เมื่อไร?`, what: t.concept.what, when: [].concat(t.concept.when).slice(0, 3), why: t.concept.why,
      terms: (t.terms || []).slice(0, 4),
    };
    case 'discover': {
      const { choices, answer } = formulaChoices(t, seed);
      return {
        intro: 'ดูประโยคตัวอย่าง สังเกตส่วนที่ไฮไลต์ แล้วลองหารูปแบบเอง',
        examples: (t.examples || []).slice(0, 3),
        prompt: 'ส่วนที่ไฮไลต์ในทุกประโยค ตรงกับรูปแบบไหน?', choices, answer,
        reveal: { formula: t.structure.formula, tip: (t.structure.notes || [])[0] || null },
      };
    }
    case 'structure': {
      const rows = chunks[step.chunk] || [];
      const notes = t.structure.notes || [];
      const per = Math.ceil(notes.length / Math.max(1, chunks.length));
      return { formula: step.chunk === 0 ? t.structure.formula : null, rows, notes: notes.slice(step.chunk * per, step.chunk * per + per).slice(0, 3) };
    }
    case 'examples': return { examples: (t.examples || []).slice(3, 9) };
    case 'context': return { contexts: (t.contexts || []).slice(0, 1), examples: (t.examples || []).slice(3, 6) };
    case 'mistakes': {
      const list = (t.mistakes || []).slice(0, 4);
      const flips = E._seededShuffle(list.map((_, i) => i), `${seed}:tf`);
      const showRight = new Set(flips.slice(0, Math.floor(list.length / 2)));   // ครึ่งหนึ่งเป็นประโยคที่ถูก (True/False จริง)
      return { cards: list.map((m, i) => ({ sentence: showRight.has(i) ? m.right : m.wrong, isCorrect: showRight.has(i), wrong: m.wrong, right: m.right, whyTh: m.whyTh })) };
    }
    case 'review': return {
      formula: t.structure.formula, rows: (t.structure.rows || []).map((r) => ({ label: r.label, formula: r.formula })),
      notes: (t.structure.notes || []).slice(0, 2), compare: t.compare && t.compare.rows && t.compare.rows.length ? { title: t.compare.title, rows: t.compare.rows, tipTh: t.compare.tipTh || null } : null,
      mistake: (t.mistakes || [])[0] || null, summaryTh: t.summaryTh,
    };
    case 'check': return { items: step.items.map((ref) => lessonItem(ref, seed)) };
    default: return {};
  }
}
const TYPE_TH_MODE = { drag: 'ลากคำลงช่องว่าง', detect: 'หาคำที่ผิด' };
function lessonItem(ref, seed) {
  const it = GC.getItem(ref.id);
  const pub = E.publicItem(it, seed);
  if (ref.mode === 'detect') return { ...pub, mode: 'detect', typeTh: TYPE_TH_MODE.detect, tokens: it.sentence.split(/\s+/) };
  if (ref.mode === 'drag') return { ...pub, mode: 'drag', typeTh: TYPE_TH_MODE.drag };
  return pub;
}
function checkLessonItem(it, mode, ans) {
  if (mode === 'detect') {
    const toks = it.sentence.split(/\s+/);
    const i = Number(ans);
    const yours = Number.isInteger(i) && i >= 0 && i < toks.length ? toks[i] : '';
    const err = new Set(it.errorPart.split(/\s+/).map(norm).filter(Boolean));
    return { correct: Boolean(yours) && err.has(norm(yours)), expected: it.errorPart, yours };
  }
  return checkAnswer(it, ans);
}

/* ---------------- สถานะ ---------------- */
async function rowOf(userId, topicId, db = pool) {
  return (await db.query('SELECT * FROM grammar_lessons WHERE user_id = $1 AND topic_id = $2', [userId, topicId])).rows[0] || null;
}
async function ensureRow(userId, topicId) {
  await pool.query(`INSERT INTO grammar_lessons (user_id, topic_id, last_study_at, updated_at) VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (user_id, topic_id) DO UPDATE SET last_study_at = NOW()`, [userId, topicId]);
  return rowOf(userId, topicId);
}
const passedLesson = (r) => Boolean(r && (r.lesson_completed_at || (r.completed_at && r.best_total && r.best_score / r.best_total >= PASS_PCT / 100)));
/** ทบทวนผ่าน: เคยตอบถูกในรอบทบทวน/Daily หลังผ่านบทเรียน */
async function reviewPassed(userId, topicId, since) {
  if (!since) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM grammar_attempts WHERE user_id = $1 AND topic_id = $2 AND correct AND source IN ('review', 'daily') AND created_at > $3 LIMIT 1`, [userId, topicId, since]);
  return rows.length > 0;
}
/** สถานะบทเรียนบนแผนที่: locked · available · in_progress · completed · mastered */
function lessonState(r, stat, unlocked, reviewOk) {
  if (passedLesson(r)) return stat && stat.mastery >= MASTER_PCT && reviewOk ? 'mastered' : 'completed';
  if ((r && (r.current_step > 0 || (r.run_steps || []).length)) || (stat && stat.attempts > 0)) return 'in_progress';
  return unlocked ? 'available' : 'locked';
}

/** ปลดล็อก: ระดับ <= ระดับแกรมม่าของผู้เรียน = เปิดทั้งหมด · นอกนั้นเปิดทีละบท (บทก่อนหน้าผ่าน) · บทแรกของระดับถัดไปเปิดเมื่อระดับก่อนผ่าน >= 60% */
function unlockMap(levelCefr, passedSet, startedSet) {
  const li = levelCefr ? GC.LEVEL_IDS.indexOf(levelCefr) : -1;
  const out = {};
  GC.LEVEL_IDS.forEach((L, i) => {
    const topics = GC.TOPICS.filter((t) => t.cefr === L);
    const prevTopics = i > 0 ? GC.TOPICS.filter((t) => t.cefr === GC.LEVEL_IDS[i - 1]) : [];
    const prevDone = prevTopics.length ? prevTopics.filter((t) => passedSet.has(t.id)).length / prevTopics.length : 1;
    topics.forEach((t, j) => {
      out[t.id] = i <= li || startedSet.has(t.id) || passedSet.has(t.id)
        || (j === 0 ? (i === 0 || prevDone >= 0.6) : passedSet.has(topics[j - 1].id));
    });
  });
  return out;
}

async function lessonStates(userId, stats, levelCefr) {
  const rows = (await pool.query('SELECT * FROM grammar_lessons WHERE user_id = $1', [userId])).rows;
  const by = Object.fromEntries(rows.map((r) => [r.topic_id, r]));
  const passed = new Set(rows.filter(passedLesson).map((r) => r.topic_id));
  const started = new Set([...rows.filter((r) => r.current_step > 0 || (r.run_steps || []).length).map((r) => r.topic_id), ...Object.keys(stats)]);
  const unlocked = unlockMap(levelCefr, passed, started);
  const reviewed = new Set((await pool.query(
    `SELECT DISTINCT a.topic_id FROM grammar_attempts a JOIN grammar_lessons l ON l.user_id = a.user_id AND l.topic_id = a.topic_id
      WHERE a.user_id = $1 AND a.correct AND a.source IN ('review', 'daily') AND a.created_at > COALESCE(l.lesson_completed_at, l.completed_at)`, [userId])).rows.map((r) => r.topic_id));
  const out = {};
  for (const t of GC.TOPICS) {
    const r = by[t.id] || null;
    const state = lessonState(r, stats[t.id], unlocked[t.id], reviewed.has(t.id));
    const total = r ? (buildPlan(t.id, seedOf(userId, t.id, r.run_no)) || []).length : 12;
    const finished = r && r.current_step >= total;
    out[t.id] = { state, unlocked: unlocked[t.id], step: r ? Math.min(r.current_step, total) : 0, total, runFinished: Boolean(finished),
      percent: r ? Math.round((Math.min(r.current_step, total) / total) * 100) : 0, accuracy: r ? r.lesson_accuracy : null, lastStudyAt: r ? r.last_study_at : null };
  }
  // บันทึกเวลาที่เชี่ยวชาญครั้งแรก
  const newly = Object.entries(out).filter(([id, v]) => v.state === 'mastered' && by[id] && !by[id].mastered_at).map(([id]) => id);
  if (newly.length) await pool.query('UPDATE grammar_lessons SET mastered_at = NOW() WHERE user_id = $1 AND topic_id = ANY($2::text[]) AND mastered_at IS NULL', [userId, newly]);
  return out;
}

/** เรียนต่อ: บทล่าสุดที่ยังเรียนไม่จบรอบ */
async function continueLesson(userId) {
  const r = (await pool.query(
    `SELECT topic_id, current_step, run_no, last_study_at FROM grammar_lessons
      WHERE user_id = $1 AND last_study_at IS NOT NULL ORDER BY last_study_at DESC LIMIT 5`, [userId])).rows;
  for (const x of r) {
    const t = GC.TOPIC_BY_ID[x.topic_id]; if (!t) continue;
    const total = buildPlan(x.topic_id, seedOf(userId, x.topic_id, x.run_no)).length;
    if (x.current_step >= total) continue;
    return { topicId: t.id, title: t.title, titleTh: t.titleTh, cefr: t.cefr, step: x.current_step + 1, total, percent: Math.round((x.current_step / total) * 100) };
  }
  return null;
}

/* ---------------- API ---------------- */
function stepMeta(s, r) {
  const done = new Set((r && r.run_steps) || []);
  return { k: s.k, kind: s.kind, role: s.role || null, title: s.title, th: s.th, icon: s.icon, items: s.items ? s.items.length : 0, done: done.has(s.k) };
}
function runScore(plan, answers) {
  const ids = plan.filter((s) => s.kind === 'check').flatMap((s) => s.items.map((i) => i.id));
  const answered = ids.filter((id) => answers[id] !== undefined);
  const correct = answered.filter((id) => answers[id] === true).length;
  return { answered: answered.length, correct, total: ids.length, accuracy: answered.length ? Math.round((correct / answered.length) * 100) : null };
}
async function overview(userId, topicId) {
  const t = GC.getTopic(topicId);
  if (!t) throw new E.GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  const r = await rowOf(userId, topicId);
  const run = r ? r.run_no : 1;
  const plan = buildPlan(topicId, seedOf(userId, topicId, run));
  const stats = await E.topicStats(userId);
  const st = (await lessonStates(userId, stats, (await E.grammarLevel(userId)).cefr))[topicId];
  const score = runScore(plan, (r && r.run_answers) || {});
  return {
    topicId, title: t.title, titleTh: t.titleTh, cefr: t.cefr, summaryTh: t.summaryTh,
    steps: plan.map((s) => stepMeta(s, r)), current: r ? Math.min(r.current_step, plan.length) : 0, total: plan.length,
    runNo: run, runFinished: Boolean(r && r.current_step >= plan.length), score, passPct: PASS_PCT,
    state: st.state, unlocked: st.unlocked, bestAccuracy: r ? r.best_accuracy : null, lastAccuracy: r ? r.lesson_accuracy : null,
    mastery: stats[topicId] ? stats[topicId].mastery : null,
  };
}
async function getStep(userId, topicId, k) {
  const t = GC.getTopic(topicId);
  if (!t) throw new E.GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  const r = await ensureRow(userId, topicId);
  const seed = seedOf(userId, topicId, r.run_no);
  const plan = buildPlan(topicId, seed);
  const i = Number(k);
  if (!Number.isInteger(i) || i < 0 || i >= plan.length) throw new E.GrammarError('BAD_STEP', 'ไม่พบขั้นนี้', 404);
  if (i > r.current_step) throw new E.GrammarError('STEP_LOCKED', 'เรียนขั้นก่อนหน้าให้จบก่อน', 403);
  const s = plan[i];
  const answers = r.run_answers || {};
  return {
    topicId, title: t.title, cefr: t.cefr, step: stepMeta(s, r), total: plan.length, current: Math.min(r.current_step, plan.length),
    content: stepContent(t, s, seed),
    answered: s.items ? Object.fromEntries(s.items.filter((x) => answers[x.id] !== undefined).map((x) => [x.id, answers[x.id]])) : {},
  };
}
async function answerStep(userId, topicId, k, itemId, ans, ms) {
  const r = await rowOf(userId, topicId);
  if (!r) throw new E.GrammarError('NOT_STARTED', 'ยังไม่ได้เริ่มบทเรียนนี้', 400);
  const seed = seedOf(userId, topicId, r.run_no);
  const plan = buildPlan(topicId, seed);
  const s = plan[Number(k)];
  if (!s || s.kind !== 'check' || Number(k) > r.current_step) throw new E.GrammarError('BAD_STEP', 'ขั้นนี้ไม่มีแบบฝึก', 400);
  const ref = s.items.find((x) => x.id === itemId);
  if (!ref) throw new E.GrammarError('NOT_IN_STEP', 'ข้อนี้ไม่อยู่ในขั้นนี้', 400);
  const it = GC.getItem(itemId);
  const res = checkLessonItem(it, ref.mode, ans);
  const fb = E.feedbackFor(it, res);
  if (ref.mode === 'detect') { fb.mode = 'detect'; fb.expected = it.errorPart; fb.corrected = it.accepted[0]; }
  // นับเฉพาะคำตอบแรกของข้อในรอบนี้ (atomic — ส่งซ้ำพร้อมกันก็นับครั้งเดียว)
  const first = (await pool.query(
    `UPDATE grammar_lessons SET run_answers = run_answers || jsonb_build_object($3::text, $4::boolean), last_study_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND topic_id = $2 AND run_no = $5 AND NOT (run_answers ? $3) RETURNING 1`, [userId, topicId, itemId, res.correct, r.run_no])).rowCount === 1;
  fb.counted = first;
  let exp = { gained: 0, levelInfo: null, leveledUp: false };
  if (first) {
    await E.recordAttempt(userId, it, res.correct, ans === undefined ? null : ans, 'lesson', null, ms);
    if (res.correct) exp = await grantOnce(userId, `glq:${itemId}`, checkExp(it.cefr), { reason: 'grammar_lesson', dailyCap: DAILY_CAP });
  }
  fb.exp = exp.gained; fb.levelInfo = exp.levelInfo; fb.leveledUp = exp.leveledUp;
  return fb;
}
async function completeStep(userId, topicId, k) {
  const r = await rowOf(userId, topicId);
  if (!r) throw new E.GrammarError('NOT_STARTED', 'ยังไม่ได้เริ่มบทเรียนนี้', 400);
  const plan = buildPlan(topicId, seedOf(userId, topicId, r.run_no));
  const i = Number(k);
  const s = plan[i];
  if (!s) throw new E.GrammarError('BAD_STEP', 'ไม่พบขั้นนี้', 404);
  if (i > r.current_step) throw new E.GrammarError('STEP_LOCKED', 'เรียนขั้นก่อนหน้าให้จบก่อน', 403);
  const answers = r.run_answers || {};
  if (s.kind === 'check' && s.items.some((x) => answers[x.id] === undefined)) throw new E.GrammarError('INCOMPLETE', 'ตอบให้ครบทุกข้อในขั้นนี้ก่อน', 400);
  const last = i === plan.length - 1;
  const upd = (await pool.query(
    `UPDATE grammar_lessons SET
        run_steps = CASE WHEN run_steps @> $3::jsonb THEN run_steps ELSE run_steps || $3::jsonb END,
        completed_steps = CASE WHEN completed_steps @> $3::jsonb THEN completed_steps ELSE completed_steps || $3::jsonb END,
        current_step = GREATEST(current_step, $4::int), last_study_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND topic_id = $2 AND run_no = $5 RETURNING current_step`,
    [userId, topicId, JSON.stringify([i]), i + 1, r.run_no])).rows[0];
  const grants = [await grantOnce(userId, `gls:${topicId}:${i}`, EXP.step, { reason: 'grammar_lesson', dailyCap: DAILY_CAP })];
  let result = null;
  if (last && upd) {
    const score = runScore(plan, answers);
    const acc = score.accuracy === null ? 0 : score.accuracy;
    const passed = score.answered === score.total && acc >= PASS_PCT;
    await pool.query(
      `UPDATE grammar_lessons SET lesson_accuracy = $3, best_accuracy = GREATEST(COALESCE(best_accuracy, 0), $3), lesson_runs = lesson_runs + 1,
          lesson_completed_at = CASE WHEN $4 THEN COALESCE(lesson_completed_at, NOW()) ELSE lesson_completed_at END,
          completed_at = CASE WHEN $4 THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
          best_score = GREATEST(COALESCE(best_score, 0), $5), best_total = $6
        WHERE user_id = $1 AND topic_id = $2`, [userId, topicId, acc, passed, score.correct, score.total]);
    if (passed) {
      grants.push(await grantOnce(userId, `glc:${topicId}`, EXP.complete, { reason: 'grammar_lesson', dailyCap: DAILY_CAP }));
      if (acc === 100) grants.push(await grantOnce(userId, `glp:${topicId}`, EXP.perfect, { reason: 'grammar_lesson', dailyCap: DAILY_CAP }));
    }
    const stats = await E.topicStats(userId);
    const badges = await E.awardBadges(userId, { stats });
    result = { passed, accuracy: acc, correct: score.correct, total: score.total, passPct: PASS_PCT, mastery: stats[topicId] ? stats[topicId].mastery : null, newBadges: badges };
  }
  const exp = mergeGrants(grants);
  return { ok: true, current: upd ? upd.current_step : r.current_step, total: plan.length, exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp, result };
}
/** เริ่มรอบใหม่ (ชุดข้อใหม่) — EXP ที่เคยได้ไม่ได้ซ้ำ แต่ความแม่นรอบใหม่นับผ่าน/เชี่ยวชาญได้ */
async function restart(userId, topicId) {
  if (!GC.getTopic(topicId)) throw new E.GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  await ensureRow(userId, topicId);
  await pool.query(`UPDATE grammar_lessons SET run_no = run_no + 1, current_step = 0, run_steps = '[]'::jsonb, run_answers = '{}'::jsonb, last_study_at = NOW(), updated_at = NOW()
    WHERE user_id = $1 AND topic_id = $2`, [userId, topicId]);
  return overview(userId, topicId);
}

/** สรุปสั้นสำหรับหน้า Home: บทที่ผ่าน / ทั้งหมด · เรียนต่อ · บทถัดไปที่ปลดล็อก */
async function summary(userId) {
  const stats = await E.topicStats(userId);
  const level = await E.grammarLevel(userId);
  const ls = await lessonStates(userId, stats, level.cefr);
  const done = Object.values(ls).filter((x) => x.state === 'completed' || x.state === 'mastered').length;
  const nextT = GC.TOPICS.find((t) => ls[t.id].unlocked && !['completed', 'mastered'].includes(ls[t.id].state) && (!level.cefr || GC.LEVEL_IDS.indexOf(t.cefr) >= GC.LEVEL_IDS.indexOf(level.cefr)))
    || GC.TOPICS.find((t) => ls[t.id].unlocked && !['completed', 'mastered'].includes(ls[t.id].state));
  return {
    completed: done, mastered: Object.values(ls).filter((x) => x.state === 'mastered').length, total: GC.TOPICS.length,
    percent: Math.round((done / GC.TOPICS.length) * 100), level: level.cefr,
    continue: await continueLesson(userId),
    next: nextT ? { topicId: nextT.id, title: nextT.title, titleTh: nextT.titleTh, cefr: nextT.cefr } : null,
  };
}

module.exports = {
  summary,
  buildPlan, overview, getStep, answerStep, completeStep, restart, lessonStates, continueLesson, passedLesson, unlockMap,
  PASS_PCT, MASTER_PCT, EXP, DAILY_CAP, _seedOf: seedOf, _allocate: allocate,
};
