/*
  Grammar Learning Engine — ระบบเรียนแกรมม่า A1–C1
  - Session แบบฝึก (บทเรียน / ทบทวน / Daily) · ตรวจคำตอบฝั่งเซิร์ฟเวอร์ · ให้ feedback ทันที (ทำไมถูก · ทำไมข้ออื่นผิด)
  - Mastery รายหัวข้อ: ความแม่นยำถ่วงน้ำหนัก (ใหม่ > เก่า · ยาก > ง่าย · ทบทวนได้น้ำหนักเพิ่ม) + ผลล่าสุด + ความมั่นใจตามจำนวนครั้ง + เสื่อมเมื่อไม่ได้ฝึก
  - Error Notebook · Spaced Repetition (1/3/7/14/30 วัน) · Placement แบบ Adaptive · Daily Challenge · Badge · Analytics · คำแนะนำ
  ระดับแกรมม่า (CEFR) แยกจาก Account Level (EXP) และ Rank (เกม) — ไม่ใช้สองอย่างนั้นคำนวณระดับ
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const GC = require('../../data/grammar-curriculum');
const { checkAnswer } = require('./check');
const { grantExp, grantOnce, mergeGrants } = require('../../utils/exp');

class GrammarError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
let nowFn = () => Date.now();
const now = () => nowFn();
function _setNow(fn) { nowFn = fn || (() => Date.now()); }
const DAY = 86400000;
const LEVELS = GC.LEVEL_IDS;
/** วันที่ตามเวลาประเทศไทย (YYYY-MM-DD) */
const bkkDay = (t = now()) => new Date(t + 7 * 3600000).toISOString().slice(0, 10);

/* =====================================================================
   ข้อมูลข้อสอบที่ส่งให้ผู้เล่น (ไม่มีเฉลย)
   ===================================================================== */
function seededShuffle(arr, seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function publicItem(it, seed = '') {
  const t = GC.TOPIC_BY_ID[it.topic] || {};
  const out = { id: it.id, type: it.type, typeTh: GC.TYPE_TH[it.type], topic: it.topic, topicTitle: t.title, topicTitleTh: t.titleTh, cefr: it.cefr, difficulty: it.difficulty, prompt: it.prompt || null };
  switch (it.type) {
    case 'mc': case 'choose': return { ...out, question: it.question, choices: it.choices };
    case 'dialogue': return { ...out, context: it.context, choices: it.choices, question: it.question || null };
    case 'context': return { ...out, context: it.context, question: it.question, choices: it.choices };
    case 'fill': return { ...out, question: it.question, hint: it.hint || null };
    case 'order': {
      let tokens = seededShuffle(it.tokens, `${seed}:${it.id}`);
      if (tokens.join(' ') === it.tokens.join(' ')) tokens = [...tokens.slice(1), tokens[0]];   // อย่าให้เรียงถูกอยู่แล้ว
      return { ...out, tokens };
    }
    case 'error': return { ...out, sentence: it.sentence };
    case 'transform': return { ...out, source: it.source, instruction: it.instruction };
    case 'match': {
      const order = seededShuffle(it.pairs.map((_, i) => i), `${seed}:${it.id}`);
      return { ...out, left: it.pairs.map((p) => p[0]), right: order.map((i) => ({ key: i, text: it.pairs[i][1] })) };
    }
    case 'write': return { ...out, task: it.task, minSentences: it.minSentences || 1, expectTense: it.expectTense || null };
    default: return out;
  }
}
/** feedback หลังตอบ: ทำไมถูก · โครงสร้าง · ตัวอย่าง · ทำไมข้ออื่นผิด · คำตอบของเราผิดเพราะอะไร */
function feedbackFor(it, r) {
  const fb = {
    correct: r.correct, near: Boolean(r.near), unchanged: Boolean(r.unchanged), expected: r.expected, yours: r.yours,
    accepted: Array.isArray(it.accepted) ? it.accepted.slice(0, 4) : null,
    explainTh: it.explainTh, explainEn: it.explainEn || null, structure: it.structure || null, example: it.example || null,
    commonMistake: it.commonMistake || null,
  };
  if (it.whyNot && ['mc', 'choose', 'dialogue', 'context'].includes(it.type)) {
    fb.answerIndex = it.answer;
    fb.whyNot = Object.entries(it.whyNot).map(([k, v]) => ({ index: Number(k), choice: it.choices[Number(k)], why: v }));
    if (!r.correct && Number.isInteger(r.chosen) && it.whyNot[String(r.chosen)]) fb.yourMistake = it.whyNot[String(r.chosen)];
  }
  if (it.type === 'error') fb.errorPart = it.errorPart;
  if (it.type === 'match') { fb.partial = r.partial; fb.pairs = it.pairs; }
  if (it.type === 'write') { fb.writing = r.detail; fb.sample = it.sample; }
  return fb;
}

/* =====================================================================
   Session (บทเรียน / ทบทวน / daily) — เก็บในหน่วยความจำ 3 ชม. (หมดอายุ = เริ่มใหม่ได้)
   ===================================================================== */
const SESSION_TTL = 3 * 3600000;
const sessions = new Map();
function newSession(userId, kind, items, meta = {}) {
  const t = now();
  for (const [k, v] of sessions) if (t - v.createdAt > SESSION_TTL) sessions.delete(k);
  while (sessions.size > 20000) sessions.delete(sessions.keys().next().value);
  const id = crypto.randomBytes(12).toString('hex');
  sessions.set(id, { id, userId, kind, itemIds: items.map((i) => i.id), answered: {}, createdAt: t, meta });
  return { sessionId: id, kind, items: items.map((i) => publicItem(i, id)), meta };
}
function getSession(id, userId) {
  const s = sessions.get(String(id || ''));
  if (!s || s.userId !== userId || now() - s.createdAt > SESSION_TTL) throw new GrammarError('SESSION_EXPIRED', 'แบบฝึกชุดนี้หมดเวลาแล้ว เริ่มใหม่ได้เลย', 410);
  return s;
}

/* เลือกข้อสำหรับฝึกหัวข้อ: ไล่ระดับความยาก · หลากหลายรูปแบบ · มีข้อบริบท + ข้อที่สร้างภาษาเอง · ข้อที่เคยถูกแล้วไว้ท้าย */
function pickPractice(topic, solved, n = 10) {
  const items = topic.practice.map((p) => ({ ...p, topic: topic.id, cefr: topic.cefr }));
  const fresh = items.filter((i) => !solved.has(i.id));
  const pool = fresh.length >= n ? fresh : [...fresh, ...items.filter((i) => solved.has(i.id))];
  const picked = []; const types = new Set();
  const take = (pred) => { const x = pool.find((i) => pred(i) && !picked.includes(i)); if (x) { picked.push(x); types.add(x.type); } };
  take((i) => ['dialogue', 'context'].includes(i.type));
  take((i) => ['fill', 'transform', 'error', 'order'].includes(i.type));
  for (const i of pool) { if (picked.length >= n - 1) break; if (!picked.includes(i) && i.type !== 'write' && !types.has(i.type)) { picked.push(i); types.add(i.type); } }
  for (const i of pool) { if (picked.length >= n - 1) break; if (!picked.includes(i) && i.type !== 'write') picked.push(i); }
  const w = items.find((i) => i.type === 'write');
  if (w && picked.length < n && !picked.includes(w)) picked.push(w);
  return picked.sort((a, b) => a.difficulty - b.difficulty || (a.type === 'write') - (b.type === 'write'));
}
async function startPractice(userId, topicId, { all = false } = {}) {
  const topic = GC.getTopic(topicId);
  if (!topic) throw new GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  const { rows } = await pool.query('SELECT DISTINCT item_id FROM grammar_attempts WHERE user_id = $1 AND topic_id = $2 AND correct', [userId, topicId]);
  const items = all ? topic.practice.map((p) => ({ ...p, topic: topic.id, cefr: topic.cefr })) : pickPractice(topic, new Set(rows.map((r) => r.item_id)));
  return newSession(userId, 'practice', items, { topicId });
}

/* =====================================================================
   ตอบ 1 ข้อ: ตรวจ · บันทึก · อัปเดตการทบทวน · ส่ง feedback
   ===================================================================== */
const SOURCE_OF = { practice: 'practice', review: 'review', daily: 'daily', writing: 'writing' };
async function answer(userId, sessionId, itemId, ans, ms) {
  const s = getSession(sessionId, userId);
  if (!s.itemIds.includes(itemId)) throw new GrammarError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดแบบฝึก', 400);
  const it = GC.getItem(itemId);
  if (!it) throw new GrammarError('NO_ITEM', 'ไม่พบข้อนี้', 404);
  const r = checkAnswer(it, ans);
  const fb = feedbackFor(it, r);
  if (s.answered[itemId] === undefined) {          // นับเฉพาะคำตอบแรกของแต่ละข้อในชุด (ลองใหม่ได้ แต่ไม่นับซ้ำ)
    s.answered[itemId] = r.correct;
    await recordAttempt(userId, it, r.correct, ans, SOURCE_OF[s.kind] || 'practice', s.id, ms);
    fb.counted = true;
  } else fb.counted = false;
  fb.progress = { answered: Object.keys(s.answered).length, total: s.itemIds.length };
  return fb;
}
async function recordAttempt(userId, it, correct, ans, source, sessionId = null, ms = null) {
  await pool.query(
    `INSERT INTO grammar_attempts (user_id, item_id, topic_id, cefr, qtype, difficulty, correct, answer, source, session_id, response_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12 / 1000.0))`,
    [userId, it.id, it.topic, it.cefr, it.type, it.difficulty || 2, correct, JSON.stringify(ans === undefined ? null : ans), source, sessionId,
      Number.isFinite(Number(ms)) ? Math.max(0, Math.min(3600000, Math.round(Number(ms)))) : null, now()]);
  if (source !== 'placement') await updateReview(userId, it, correct, source);
}
/* ---------------- Spaced Repetition ----------------
   ตอบผิด -> เข้าคิวทบทวน (พรุ่งนี้) · ทบทวนถูก -> ขยับ 1/3/7/14/30 วัน (ข้อง่ายถูกเร็วขยับ 2 ขั้น) · ถูกครบรอบ 30 วัน = เชี่ยวชาญ
   ทบทวนผิด -> ถอยกลับ 2 ขั้น (ไม่ต่ำกว่า 0) และกลับมาพรุ่งนี้ */
const INTERVALS = [1, 3, 7, 14, 30];
async function updateReview(userId, it, correct, source) {
  const t = now();
  const cur = (await pool.query('SELECT * FROM grammar_reviews WHERE user_id = $1 AND item_id = $2', [userId, it.id])).rows[0];
  if (!correct) {
    const stage = cur ? Math.max(0, cur.stage - 2) : 0;
    await pool.query(
      `INSERT INTO grammar_reviews (user_id, item_id, topic_id, stage, due_at, lapses, streak, last_result, updated_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), 1, 0, FALSE, NOW())
       ON CONFLICT (user_id, item_id) DO UPDATE SET stage = $4, due_at = to_timestamp($5 / 1000.0), lapses = grammar_reviews.lapses + 1,
         streak = 0, mastered_at = NULL, last_result = FALSE, updated_at = NOW()`,
      [userId, it.id, it.topic, stage, t + DAY]);
    return;
  }
  if (!cur || cur.mastered_at) return;
  // ถูกนอกรอบทบทวน (เช่น ฝึกบทเรียนซ้ำ) ก่อนถึงกำหนด -> ไม่เลื่อนขั้น (กันจำคำตอบระยะสั้น)
  if (source !== 'review' && new Date(cur.due_at).getTime() > t) return;
  const jump = (it.difficulty || 2) === 1 && cur.streak >= 1 ? 2 : 1;
  const stage = cur.stage + jump;
  const mastered = stage >= INTERVALS.length;
  await pool.query(
    `UPDATE grammar_reviews SET stage = $3, due_at = to_timestamp($4 / 1000.0), streak = streak + 1, last_result = TRUE,
       mastered_at = CASE WHEN $5 THEN NOW() ELSE NULL END, updated_at = NOW() WHERE user_id = $1 AND item_id = $2`,
    [userId, it.id, Math.min(stage, INTERVALS.length - 1), t + INTERVALS[Math.min(stage, INTERVALS.length - 1)] * DAY, mastered]);
}

/* =====================================================================
   Mastery รายหัวข้อ (0–100)
   ===================================================================== */
const DIFF_W = { 1: 0.8, 2: 1, 3: 1.25 };
function masteryOf(atts, t = now()) {
  if (!atts.length) return null;
  let sw = 0; let sc = 0;
  for (const a of atts) {
    const age = (t - a.t) / DAY;
    const w = 0.5 ** (age / 21) * (DIFF_W[a.d] || 1) * (a.src === 'review' ? 1.2 : 1);
    sw += w; sc += w * (a.c ? 1 : 0);
  }
  const weighted = sc / sw;
  const recent = atts.slice(-5); const recentAcc = recent.filter((a) => a.c).length / recent.length;
  const n = atts.length;
  const confidence = Math.min(1, Math.sqrt(n / 10));               // 10 ครั้งขึ้นไป = มั่นใจเต็ม
  const last = atts[atts.length - 1].t;
  const idle = (t - last) / DAY;
  const staleness = idle > 21 ? Math.max(0.6, 1 - (idle - 21) / 120) : 1;   // ไม่ได้ฝึกนาน -> ลดลงช้า ๆ (ต่ำสุด 60% ของเดิม)
  return Math.round(100 * (0.65 * weighted + 0.35 * recentAcc) * confidence * staleness);
}
function statusOf(m, n) {
  if (m === null) return 'new';
  if (m >= 80 && n >= 8) return 'mastered';
  if (m < 45 && n >= 4) return 'weak';
  return 'learning';
}
async function topicStats(userId, { until = null } = {}) {
  const { rows } = await pool.query(
    `SELECT topic_id, correct, difficulty, source, created_at FROM grammar_attempts
      WHERE user_id = $1 AND source <> 'placement' ${until ? 'AND created_at < $2' : ''} ORDER BY created_at, id`,
    until ? [userId, new Date(until)] : [userId]);
  const by = {};
  rows.forEach((r) => { (by[r.topic_id] = by[r.topic_id] || []).push({ c: r.correct, d: r.difficulty, src: r.source, t: new Date(r.created_at).getTime() }); });
  const t = until || now();
  const out = {};
  for (const [id, atts] of Object.entries(by)) {
    const m = masteryOf(atts, t);
    out[id] = { mastery: m, attempts: atts.length, correct: atts.filter((a) => a.c).length, status: statusOf(m, atts.length), last: atts[atts.length - 1].t };
  }
  return out;
}

/* =====================================================================
   ระดับแกรมม่า (CEFR) ของผู้เรียน — จาก Placement แกรมม่า > ผลวัดระดับเดิม (ส่วนแกรมม่า) > A1
   ===================================================================== */
async function grammarLevel(userId) {
  const p = (await pool.query('SELECT cefr, cefr_source FROM grammar_profiles WHERE user_id = $1', [userId])).rows[0];
  if (p && p.cefr) return { cefr: p.cefr, source: p.cefr_source || 'placement' };
  const legacy = (await pool.query(
    `SELECT result->>'grammar' AS g FROM placement_attempts WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`, [userId])).rows[0];
  if (legacy && LEVELS.includes(legacy.g)) return { cefr: legacy.g, source: 'placement-legacy' };
  return { cefr: null, source: 'none' };
}
async function setLevel(userId, cefr, source) {
  await pool.query(
    `INSERT INTO grammar_profiles (user_id, cefr, cefr_source, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET cefr = EXCLUDED.cefr, cefr_source = EXCLUDED.cefr_source, updated_at = NOW()`, [userId, cefr, source]);
}
/** ระดับจากความคืบหน้าจริง: ผ่าน (mastery ≥ 60) อย่างน้อย 70% ของหัวข้อในระดับนั้น -> ถือว่าอยู่เหนือระดับนั้น */
function levelFromMastery(stats, base) {
  let lvl = base && LEVELS.includes(base) ? LEVELS.indexOf(base) : 0;
  for (let i = lvl; i < LEVELS.length - 1; i++) {
    const ts = GC.TOPICS.filter((t) => t.cefr === LEVELS[i]);
    const done = ts.filter((t) => stats[t.id] && stats[t.id].mastery >= 60).length;
    if (done / ts.length >= 0.7) lvl = i + 1; else break;
  }
  return LEVELS[lvl];
}

/* =====================================================================
   Placement แบบ Adaptive
   เริ่ม A2 · ชุดละ 4 ข้อ (ต่างหัวข้อ) · ถูก ≥3 ขึ้นระดับ · ถูก ≤1 ลดระดับ · 2 = อยู่ระดับเดิมอีกชุด
   จบเมื่อ: ผ่าน C1 · ตก A1 · วนซ้ำระดับเดิมครบ 2 ชุด · หรือครบ 7 ชุด (สูงสุด 28 ข้อ)
   ===================================================================== */
const P_BLOCK = 4; const P_MAX_BLOCKS = 7;
const P_TYPES = new Set(['mc', 'choose', 'fill', 'dialogue', 'context', 'error']);
function placementPool(level, usedTopics, usedItems, seed) {
  const items = GC.allItems().filter((i) => i.cefr === level && P_TYPES.has(i.type) && i.difficulty >= 2 && !usedItems.has(i.id));
  const byTopic = {};
  items.forEach((i) => { (byTopic[i.topic] = byTopic[i.topic] || []).push(i); });
  const topics = seededShuffle(Object.keys(byTopic), `${seed}:${level}:${usedTopics.size}`);
  const fresh = topics.filter((t) => !usedTopics.has(t));
  const order = [...fresh, ...topics.filter((t) => usedTopics.has(t))];
  return order.slice(0, P_BLOCK).map((t) => seededShuffle(byTopic[t], `${seed}:${t}`)[0]);
}
async function placementStart(userId) {
  const seed = crypto.randomBytes(6).toString('hex');
  const block = placementPool('A2', new Set(), new Set(), seed);
  const state = { seed, level: 'A2', blocks: [{ level: 'A2', items: block.map((i) => i.id), answers: {} }], history: [] };
  const { rows } = await pool.query("INSERT INTO grammar_placements (user_id, state) VALUES ($1, $2) RETURNING id", [userId, JSON.stringify(state)]);
  return { id: Number(rows[0].id), item: publicItem(block[0], seed), progress: { index: 1, block: 1, maxQuestions: P_BLOCK * P_MAX_BLOCKS } };
}
async function placementAnswer(userId, id, itemId, ans) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM grammar_placements WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])).rows[0];
    if (!row) throw new GrammarError('NOT_FOUND', 'ไม่พบแบบทดสอบนี้', 404);
    if (row.status !== 'in_progress') throw new GrammarError('DONE', 'ทำแบบทดสอบนี้เสร็จแล้ว', 409);
    const st = row.state;
    const blk = st.blocks[st.blocks.length - 1];
    const nextId = blk.items.find((x) => blk.answers[x] === undefined);
    if (nextId !== itemId) throw new GrammarError('ORDER', 'ตอบข้อปัจจุบันก่อน', 409);
    const it = GC.getItem(itemId);
    const r = checkAnswer(it, ans);
    blk.answers[itemId] = r.correct;
    await client.query(
      `INSERT INTO grammar_attempts (user_id, item_id, topic_id, cefr, qtype, difficulty, correct, answer, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'placement')`,
      [userId, it.id, it.topic, it.cefr, it.type, it.difficulty, r.correct, JSON.stringify(ans === undefined ? null : ans)]);
    let out;
    const remaining = blk.items.filter((x) => blk.answers[x] === undefined);
    if (remaining.length) {
      out = { done: false, item: publicItem(GC.getItem(remaining[0]), st.seed) };
    } else {
      const right = Object.values(blk.answers).filter(Boolean).length;
      const li = LEVELS.indexOf(blk.level);
      st.history.push({ level: blk.level, right, total: blk.items.length });
      const sameLevelCount = st.history.filter((h) => h.level === blk.level).length;
      let next = li; let finish = false;
      if (right >= 3) { if (li === LEVELS.length - 1) finish = true; else next = li + 1; }
      else if (right <= 1) { if (li === 0) finish = true; else next = li - 1; }
      else if (sameLevelCount >= 2) finish = true;
      // ขึ้นไปแล้วตกกลับมาระดับที่เคยผ่าน = ได้คำตอบแล้ว
      if (!finish && st.history.some((h) => h.level === LEVELS[next] && h.right >= 3) && right <= 1) finish = true;
      if (!finish && st.history.filter((h) => h.level === LEVELS[next]).length >= 2) finish = true;
      if (st.blocks.length >= P_MAX_BLOCKS) finish = true;
      if (finish) {
        const result = placementResult(st);
        await client.query("UPDATE grammar_placements SET status = 'completed', state = $1, result = $2, completed_at = NOW() WHERE id = $3",
          [JSON.stringify(st), JSON.stringify(result), id]);
        await client.query(
          `INSERT INTO grammar_profiles (user_id, cefr, cefr_source, updated_at) VALUES ($1, $2, 'placement', NOW())
           ON CONFLICT (user_id) DO UPDATE SET cefr = EXCLUDED.cefr, cefr_source = 'placement', updated_at = NOW()`, [userId, result.level]);
        await client.query('COMMIT');
        return { done: true, result };
      }
      const used = new Set(st.blocks.flatMap((b) => b.items));
      const usedTopics = new Set([...used].map((x) => GC.getItem(x).topic));
      const items = placementPool(LEVELS[next], usedTopics, used, st.seed);
      st.blocks.push({ level: LEVELS[next], items: items.map((i) => i.id), answers: {} });
      out = { done: false, item: publicItem(items[0], st.seed) };
    }
    const index = st.blocks.reduce((a, b) => a + Object.keys(b.answers).length, 0) + 1;
    out.progress = { index, block: st.blocks.length, maxQuestions: P_BLOCK * P_MAX_BLOCKS };
    await client.query('UPDATE grammar_placements SET state = $1 WHERE id = $2', [JSON.stringify(st), id]);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}
/** สรุปผล: ระดับสูงสุดที่ทำได้ ≥ 60% (และระดับต่ำกว่าที่ทดสอบไม่ตก) · จุดแข็ง/ควรฝึกตามหัวข้อ */
function placementResult(st) {
  const per = {};
  st.blocks.forEach((b) => Object.entries(b.answers).forEach(([iid, ok]) => {
    const l = b.level; (per[l] = per[l] || { right: 0, total: 0 }); per[l].total += 1; if (ok) per[l].right += 1;
  }));
  let level = null;
  for (let i = 0; i < LEVELS.length; i++) {
    const p = per[LEVELS[i]];
    if (!p) continue;
    if (p.right / p.total >= 0.6) level = LEVELS[i];
    else if (level !== null || i === 0) break;
  }
  if (!level) level = 'A1';
  // ไม่เคยทดสอบระดับต่ำกว่า (เริ่มที่ A2 แล้วผ่าน) -> ถือว่าผ่านระดับต่ำกว่า
  const topicRes = {};
  st.blocks.forEach((b) => Object.entries(b.answers).forEach(([iid, ok]) => {
    const it = GC.getItem(iid); const t = GC.TOPIC_BY_ID[it.topic];
    const k = t.id; (topicRes[k] = topicRes[k] || { id: k, title: t.title, titleTh: t.titleTh, cefr: t.cefr, right: 0, total: 0 });
    topicRes[k].total += 1; if (ok) topicRes[k].right += 1;
  }));
  const list = Object.values(topicRes);
  return {
    level,
    perLevel: LEVELS.filter((l) => per[l]).map((l) => ({ level: l, ...per[l] })),
    strong: list.filter((x) => x.right === x.total).slice(0, 6),
    needsPractice: list.filter((x) => x.right < x.total).sort((a, b) => LEVELS.indexOf(a.cefr) - LEVELS.indexOf(b.cefr)).slice(0, 6),
    questions: list.reduce((a, b) => a + b.total, 0),
    note: 'ระดับแกรมม่า (CEFR) วัดจากคำตอบจริง แยกจากเลเวลบัญชี (EXP) และแรงค์ในเกม',
  };
}

/* =====================================================================
   ทบทวน (Review Today) — ข้อที่ถึงกำหนด + ข้อจากหัวข้อที่ยังอ่อน
   ===================================================================== */
async function reviewDue(userId) {
  const { rows } = await pool.query(
    `SELECT item_id, topic_id, stage, due_at FROM grammar_reviews WHERE user_id = $1 AND mastered_at IS NULL AND due_at <= to_timestamp($2 / 1000.0)
      ORDER BY due_at LIMIT 200`, [userId, now()]);
  return rows.filter((r) => GC.getItem(r.item_id));
}
async function startReview(userId, { itemIds = null, topicId = null } = {}) {
  let items = [];
  if (itemIds && itemIds.length) {
    items = itemIds.map((id) => GC.getItem(id)).filter(Boolean).slice(0, 15);
  } else if (topicId) {
    const { rows } = await pool.query(
      'SELECT item_id FROM grammar_reviews WHERE user_id = $1 AND topic_id = $2 AND mastered_at IS NULL ORDER BY due_at LIMIT 15', [userId, topicId]);
    items = rows.map((r) => GC.getItem(r.item_id)).filter(Boolean);
  } else {
    const due = await reviewDue(userId);
    items = due.slice(0, 12).map((r) => GC.getItem(r.item_id));
    if (items.length < 5) {   // เติมจากหัวข้อที่อ่อน (ข้อที่ยังไม่เคยตอบถูก)
      const stats = await topicStats(userId);
      const weak = Object.entries(stats).filter(([, s]) => s.status === 'weak' || (s.mastery !== null && s.mastery < 55)).sort((a, b) => a[1].mastery - b[1].mastery).map(([id]) => id);
      const solved = new Set((await pool.query('SELECT DISTINCT item_id FROM grammar_attempts WHERE user_id = $1 AND correct', [userId])).rows.map((r) => r.item_id));
      for (const tid of weak) {
        const t = GC.getTopic(tid);
        for (const p of t.practice) {
          if (items.length >= 8) break;
          if (p.type !== 'write' && !solved.has(p.id) && !items.some((x) => x.id === p.id)) items.push(GC.getItem(p.id));
        }
      }
    }
  }
  if (!items.length) throw new GrammarError('NOTHING_DUE', 'วันนี้ไม่มีข้อที่ต้องทบทวน เก่งมาก!', 404);
  return newSession(userId, 'review', items, {});
}

/* =====================================================================
   จบชุดแบบฝึก: สรุปผล · EXP · ความคืบหน้าบทเรียน · Badge · ภารกิจกิจกรรม
   ===================================================================== */
const EXP_PER_CORRECT = 8; const EXP_SESSION_PERFECT = 15;
async function finishSession(userId, sessionId) {
  const s = getSession(sessionId, userId);
  if (s.finished) return s.finished;
  const answered = Object.values(s.answered);
  const correct = answered.filter(Boolean).length;
  const total = s.itemIds.length;
  // EXP บัญชีเดียวกับคำศัพท์/Ranked · ไม่มีเพดานรายวัน
  // กันปั๊ม: ข้อเดียวกันได้ EXP วันละครั้ง (ทำชุดเดิมซ้ำทั้งวันไม่ได้เพิ่ม) · โบนัสถูกครบได้วันละครั้งต่อหัวข้อ
  const day = bkkDay();
  const grants = [];
  for (const [itemId, ok] of Object.entries(s.answered)) {
    if (ok) grants.push(await grantOnce(userId, `glx:${itemId}:${day}`, EXP_PER_CORRECT, { reason: 'grammar_learn' }));
  }
  if (answered.length === total && correct === total && total >= 8) {
    grants.push(await grantOnce(userId, `glxp:${s.meta.topicId || s.kind}:${day}`, EXP_SESSION_PERFECT, { reason: 'grammar_learn' }));
  }
  const g = mergeGrants(grants);
  const exp = g.gained;
  if (s.kind === 'practice' && s.meta.topicId) {
    await pool.query(
      `INSERT INTO grammar_lessons (user_id, topic_id, best_score, best_total, completed_at, updated_at) VALUES ($1, $2, $3::int, $4::int, CASE WHEN $3::float / GREATEST($4::float, 1) >= 0.7 THEN NOW() END, NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         best_score = GREATEST(COALESCE(grammar_lessons.best_score, 0), EXCLUDED.best_score), best_total = EXCLUDED.best_total,
         completed_at = COALESCE(grammar_lessons.completed_at, EXCLUDED.completed_at), updated_at = NOW()`,
      [userId, s.meta.topicId, correct, total]);
  }
  if (answered.length >= 5) {
    try { require('../events').recordRound(userId, `gl:${s.id}`, { correct, total: answered.length }); } catch (_) { /* ไม่มีระบบกิจกรรม */ }
  }
  const stats = await topicStats(userId);
  const badges = await awardBadges(userId, { stats, perfectSession: total >= 10 && correct === total && answered.length === total });
  const topics = [...new Set(s.itemIds.map((id) => GC.getItem(id).topic))].map((id) => ({ id, title: GC.TOPIC_BY_ID[id].title, titleTh: GC.TOPIC_BY_ID[id].titleTh, ...(stats[id] || {}) }));
  const result = { kind: s.kind, correct, answered: answered.length, total, exp, levelInfo: g.levelInfo, leveledUp: g.leveledUp, topics, newBadges: badges };
  s.finished = result;
  return result;
}

/* =====================================================================
   Daily Grammar Challenge (วันละครั้ง · 7 ข้อ เน้นหัวข้อที่อ่อน)
   ===================================================================== */
const DAILY_N = 7; const DAILY_EXP = 25; const DAILY_PERFECT = 15;
const DAILY_TYPES = new Set(['mc', 'choose', 'fill', 'error', 'dialogue', 'context', 'transform', 'order']);
async function dailyGet(userId) {
  const day = bkkDay();
  let row = (await pool.query('SELECT * FROM grammar_daily WHERE user_id = $1 AND day = $2', [userId, day])).rows[0];
  if (!row) {
    const stats = await topicStats(userId);
    const lvl = (await grammarLevel(userId)).cefr || 'A1';
    const li = LEVELS.indexOf(lvl);
    const weak = Object.entries(stats).filter(([, s]) => s.mastery !== null).sort((a, b) => a[1].mastery - b[1].mastery).slice(0, 3).map(([id]) => id);
    const near = GC.TOPICS.filter((t) => Math.abs(LEVELS.indexOf(t.cefr) - li) <= 0 || (LEVELS.indexOf(t.cefr) === li - 1)).map((t) => t.id);
    const topics = [...new Set([...weak, ...seededShuffle(near, `${userId}:${day}`)])];
    const picked = [];
    for (const tid of topics) {
      const t = GC.getTopic(tid);
      if (!t) continue;
      const cand = seededShuffle(t.practice.filter((p) => DAILY_TYPES.has(p.type)), `${userId}:${day}:${tid}`);
      if (cand[0]) picked.push(cand[0].id);
      if (weak.includes(tid) && cand[1] && picked.length < DAILY_N) picked.push(cand[1].id);
      if (picked.length >= DAILY_N) break;
    }
    await pool.query('INSERT INTO grammar_daily (user_id, day, items, total) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [userId, day, JSON.stringify(picked.slice(0, DAILY_N)), Math.min(DAILY_N, picked.length)]);
    row = (await pool.query('SELECT * FROM grammar_daily WHERE user_id = $1 AND day = $2', [userId, day])).rows[0];
  }
  const items = row.items.map((id) => GC.getItem(id)).filter(Boolean);
  const streak = await dailyStreak(userId);
  if (row.completed_at) return { day, completed: true, score: row.score, total: row.total, exp: row.exp, streak, topics: [...new Set(items.map((i) => i.topic))].map((t) => GC.TOPIC_BY_ID[t].title) };
  const sess = newSession(userId, 'daily', items, { day });
  return { day, completed: false, total: items.length, streak, ...sess };
}
async function dailyFinish(userId, sessionId) {
  const s = getSession(sessionId, userId);
  if (s.kind !== 'daily') throw new GrammarError('BAD_SESSION', 'ไม่ใช่ชุด Daily Challenge', 400);
  if (s.meta.day !== bkkDay()) throw new GrammarError('DAY_OVER', 'ชาเลนจ์ของวันนั้นปิดแล้ว ลองชาเลนจ์ของวันนี้ได้เลย', 410);
  const answered = Object.values(s.answered);
  if (answered.length < s.itemIds.length) throw new GrammarError('INCOMPLETE', 'ตอบให้ครบทุกข้อก่อน', 400);
  const correct = answered.filter(Boolean).length;
  const perfect = correct === s.itemIds.length;
  const exp = DAILY_EXP + (perfect ? DAILY_PERFECT : 0);
  const upd = await pool.query(
    `UPDATE grammar_daily SET score = $3, exp = $4, completed_at = NOW(), answers = $5 WHERE user_id = $1 AND day = $2 AND completed_at IS NULL RETURNING day`,
    [userId, s.meta.day, correct, exp, JSON.stringify(s.answered)]);
  if (!upd.rows.length) throw new GrammarError('ALREADY_DONE', 'ทำชาเลนจ์ของวันนี้ไปแล้ว', 409);
  const g = await grantExp(userId, exp, { reason: 'grammar_daily' });
  try { require('../events').recordRound(userId, `gld:${s.meta.day}`, { correct, total: s.itemIds.length }); } catch (_) { /* ignore */ }
  const stats = await topicStats(userId);
  const newBadges = await awardBadges(userId, { stats, perfectDaily: perfect });
  s.finished = { correct, total: s.itemIds.length, exp, levelInfo: g.levelInfo, leveledUp: g.leveledUp, perfect, streak: await dailyStreak(userId), newBadges };
  return s.finished;
}
async function dailyStreak(userId) {
  const { rows } = await pool.query('SELECT day FROM grammar_daily WHERE user_id = $1 AND completed_at IS NOT NULL ORDER BY day DESC LIMIT 60', [userId]);
  const days = new Set(rows.map((r) => (r.day instanceof Date ? r.day.toISOString() : String(r.day)).slice(0, 10)));
  let n = 0; let t = now();
  if (!days.has(bkkDay(t))) t -= DAY;               // ยังไม่ทำวันนี้ -> นับต่อจากเมื่อวาน
  while (days.has(bkkDay(t))) { n += 1; t -= DAY; }
  return n;
}
/** วันที่ศึกษาแกรมม่าต่อเนื่อง (ตอบ ≥ 5 ข้อต่อวัน) */
async function studyStreak(userId) {
  const { rows } = await pool.query(
    `SELECT to_char((created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM grammar_attempts
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days' GROUP BY 1`, [userId]);
  const days = new Set(rows.filter((r) => r.n >= 5).map((r) => r.d));
  let n = 0; let t = now();
  if (!days.has(bkkDay(t))) t -= DAY;
  while (days.has(bkkDay(t))) { n += 1; t -= DAY; }
  return n;
}

/* =====================================================================
   Badge — ได้จาก mastery/ผลจริงเท่านั้น (ไม่ใช่การกดเข้าเรียน)
   ===================================================================== */
const BADGES = [
  { id: 'article-apprentice', title: 'Article Apprentice', titleTh: 'นักฝึกหัด Article', icon: 'type', descTh: 'Mastery หัวข้อ Articles ≥ 70% (ตอบอย่างน้อย 8 ครั้ง)',
    test: (st) => (st['a1-articles'] || {}).mastery >= 70 && (st['a1-articles'] || {}).attempts >= 8 },
  { id: 'tense-explorer', title: 'Tense Explorer', titleTh: 'นักสำรวจ Tense', icon: 'compass', descTh: 'Mastery ≥ 60% ในหัวข้อ Tense อย่างน้อย 5 หัวข้อ',
    test: (st) => GC.TOPICS.filter((t) => t.group === 'tenses' && (st[t.id] || {}).mastery >= 60).length >= 5 },
  { id: 'present-perfect-master', title: 'Present Perfect Master', titleTh: 'เซียน Present Perfect', icon: 'crown', descTh: 'Mastery ≥ 85% ทั้ง 3 หัวข้อ Present Perfect',
    test: (st) => ['a2-present-perfect-intro', 'b1-pp-vs-past', 'b1-pp-continuous'].every((id) => (st[id] || {}).mastery >= 85 && (st[id] || {}).attempts >= 8) },
  { id: 'conditional-champion', title: 'Conditional Champion', titleTh: 'แชมป์ Conditional', icon: 'trophy', descTh: 'Mastery ≥ 80% ในเงื่อนไขแบบที่ 1, 2, 3 และแบบผสม',
    test: (st) => ['a2-first-conditional', 'b1-second-conditional', 'b2-third-conditional', 'b2-mixed-conditionals'].every((id) => (st[id] || {}).mastery >= 80 && (st[id] || {}).attempts >= 8) },
  { id: 'grammar-guardian', title: 'Grammar Guardian', titleTh: 'ผู้พิทักษ์แกรมม่า', icon: 'shield-check', descTh: 'เชี่ยวชาญ (Mastered) 20 หัวข้อ',
    test: (st) => Object.values(st).filter((s) => s.status === 'mastered').length >= 20 },
  { id: 'perfect-10', title: 'Perfect 10', titleTh: 'ถูกครบ 10', icon: 'star', descTh: 'ตอบถูกครั้งแรกทุกข้อในชุดแบบฝึก 10 ข้อขึ้นไป', test: (st, ctx) => ctx.perfectSession },
  { id: 'no-mistakes', title: 'No Mistakes', titleTh: 'ไม่พลาดเลย', icon: 'circle-check', descTh: 'Daily Grammar Challenge ถูกทุกข้อ', test: (st, ctx) => ctx.perfectDaily },
  { id: 'streak-7', title: '7-Day Grammar Streak', titleTh: 'ฝึกแกรมม่าต่อเนื่อง 7 วัน', icon: 'flame', descTh: 'ฝึกแกรมม่าวันละอย่างน้อย 5 ข้อ ติดต่อกัน 7 วัน', test: (st, ctx) => ctx.streak >= 7 },
];
async function awardBadges(userId, ctx = {}) {
  const stats = ctx.stats || await topicStats(userId);
  const streak = ctx.streak !== undefined ? ctx.streak : await studyStreak(userId);
  const have = new Set((await pool.query('SELECT badge_id FROM grammar_badges WHERE user_id = $1', [userId])).rows.map((r) => r.badge_id));
  const earned = [];
  for (const b of BADGES) {
    if (have.has(b.id)) continue;
    if (b.test(stats, { ...ctx, streak })) {
      const r = await pool.query('INSERT INTO grammar_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING badge_id', [userId, b.id]);
      if (r.rows.length) earned.push({ id: b.id, title: b.title, titleTh: b.titleTh, icon: b.icon, descTh: b.descTh });
    }
  }
  return earned;
}
async function badgesOf(userId) {
  const rows = (await pool.query('SELECT badge_id, earned_at FROM grammar_badges WHERE user_id = $1', [userId])).rows;
  const by = Object.fromEntries(rows.map((r) => [r.badge_id, r.earned_at]));
  return BADGES.map(({ test, ...b }) => ({ ...b, earned: Boolean(by[b.id]), earnedAt: by[b.id] || null }));
}

/* =====================================================================
   Error Notebook (My Grammar Mistakes)
   ===================================================================== */
function questionText(it) {
  switch (it.type) {
    case 'mc': case 'choose': case 'fill': return it.question;
    case 'dialogue': return (it.context.lines.find((l) => /_{2,}/.test(l.text)) || it.context.lines[0]).text;
    case 'context': return it.question;
    case 'order': return `เรียงคำ: ${it.tokens.join(' / ')}`;
    case 'error': return it.sentence;
    case 'transform': return `${it.source} — ${it.instruction}`;
    case 'match': return it.prompt || 'จับคู่';
    case 'write': return it.task;
    default: return '';
  }
}
function answerText(it, ans) {
  if (ans === null || ans === undefined) return '';
  if (['mc', 'choose', 'dialogue', 'context'].includes(it.type)) return Number.isInteger(ans) && it.choices[ans] !== undefined ? it.choices[ans] : '';
  if (it.type === 'order') return Array.isArray(ans) ? ans.join(' ') : String(ans);
  if (it.type === 'match') return Array.isArray(ans) ? it.pairs.map((p, i) => `${p[0]} → ${(it.pairs[Number(ans[i])] || [])[1] || '—'}`).join(' · ') : '';
  return String(ans).slice(0, 300);
}
function correctText(it) {
  if (['mc', 'choose', 'dialogue', 'context'].includes(it.type)) return it.choices[it.answer];
  if (it.type === 'match') return it.pairs.map((p) => `${p[0]} → ${p[1]}`).join(' · ');
  if (it.type === 'write') return it.sample;
  return (it.accepted || [])[0];
}
async function mistakes(userId, { cefr = null, topic = null, status = null, from = null, to = null, limit = 60, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT a.item_id, a.topic_id, a.cefr, COUNT(*)::int AS wrong, MAX(a.created_at) AS last_wrong,
            (ARRAY_AGG(a.answer ORDER BY a.created_at DESC))[1] AS last_answer
       FROM grammar_attempts a WHERE a.user_id = $1 AND NOT a.correct AND a.source <> 'placement'
       GROUP BY a.item_id, a.topic_id, a.cefr ORDER BY MAX(a.created_at) DESC`, [userId]);
  const rev = Object.fromEntries((await pool.query('SELECT item_id, mastered_at, stage, due_at FROM grammar_reviews WHERE user_id = $1', [userId])).rows.map((r) => [r.item_id, r]));
  const lastOk = Object.fromEntries((await pool.query(
    `SELECT item_id, MAX(created_at) AS t FROM grammar_attempts WHERE user_id = $1 AND correct GROUP BY item_id`, [userId])).rows.map((r) => [r.item_id, r.t]));
  let list = rows.map((r) => {
    const it = GC.getItem(r.item_id);
    if (!it) return null;
    const rv = rev[r.item_id];
    const fixedAfter = lastOk[r.item_id] && new Date(lastOk[r.item_id]) > new Date(r.last_wrong);
    const mastered = Boolean(rv && rv.mastered_at) || (rv ? rv.stage >= 3 && fixedAfter : fixedAfter);
    const t = GC.TOPIC_BY_ID[r.topic_id];
    return {
      itemId: r.item_id, topicId: r.topic_id, topicTitle: t.title, topicTitleTh: t.titleTh, cefr: r.cefr, type: it.type, typeTh: GC.TYPE_TH[it.type],
      question: questionText(it), context: it.context || null, yours: answerText(it, r.last_answer), correct: correctText(it),
      explainTh: it.explainTh, structure: it.structure || null, whyNot: it.whyNot && Number.isInteger(r.last_answer) ? (it.whyNot[String(r.last_answer)] || null) : null,
      wrongCount: r.wrong, lastWrong: r.last_wrong, mastered, nextReview: rv && !rv.mastered_at ? rv.due_at : null,
    };
  }).filter(Boolean);
  if (cefr) list = list.filter((x) => x.cefr === cefr);
  if (topic) list = list.filter((x) => x.topicId === topic);
  if (status === 'mastered') list = list.filter((x) => x.mastered); else if (status === 'open') list = list.filter((x) => !x.mastered);
  if (from) list = list.filter((x) => new Date(x.lastWrong) >= new Date(from));
  if (to) list = list.filter((x) => new Date(x.lastWrong) <= new Date(to));
  const byTopic = {};
  list.forEach((x) => { const k = x.topicId; (byTopic[k] = byTopic[k] || { topicId: k, title: x.topicTitle, titleTh: x.topicTitleTh, cefr: x.cefr, mistakes: 0, open: 0 }); byTopic[k].mistakes += x.wrongCount; if (!x.mastered) byTopic[k].open += 1; });
  return { total: list.length, topics: Object.values(byTopic).sort((a, b) => b.mistakes - a.mistakes), items: list.slice(offset, offset + limit), more: offset + limit < list.length };
}

/* =====================================================================
   หน้า Grammar (Learning Map) · Progress · คำแนะนำ
   ===================================================================== */
async function hub(userId) {
  const [stats, level, lessons, due, badges] = await Promise.all([
    topicStats(userId), grammarLevel(userId),
    pool.query('SELECT topic_id, steps_seen, best_score, best_total, completed_at FROM grammar_lessons WHERE user_id = $1', [userId]),
    reviewDue(userId), badgesOf(userId)]);
  const les = Object.fromEntries(lessons.rows.map((r) => [r.topic_id, r]));
  const content = GC.loadAll();
  const L = require('./lesson');   // โหลดตอนใช้ (lesson.js ใช้ engine)
  const ls = await L.lessonStates(userId, stats, level.cefr);
  const levels = GC.LEVELS.map((Lv) => {
    const topics = GC.TOPICS.filter((t) => t.cefr === Lv.id).map((t) => {
      const s = stats[t.id] || null; const l = les[t.id] || null;
      return { id: t.id, title: t.title, titleTh: t.titleTh, group: t.group, available: Boolean(content[t.id]), summaryTh: content[t.id] ? content[t.id].summaryTh : null,
        mastery: s ? s.mastery : null, status: s ? s.status : (l ? 'learning' : 'new'), attempts: s ? s.attempts : 0,
        stepsSeen: l ? (l.steps_seen || []).length : 0, completed: ['completed', 'mastered'].includes(ls[t.id].state),
        lesson: ls[t.id] };
    });
    const mastered = topics.filter((t) => t.lesson.state === 'mastered').length;
    const completed = topics.filter((t) => t.completed).length;
    const started = topics.filter((t) => t.status !== 'new').length;
    return { ...Lv, topics, mastered, completed, started, total: topics.length };
  });
  const estimated = levelFromMastery(stats, level.cefr);
  const daily = (await pool.query('SELECT completed_at, score, total FROM grammar_daily WHERE user_id = $1 AND day = $2', [userId, bkkDay()])).rows[0] || null;
  return {
    level: level.cefr, levelSource: level.source, estimatedLevel: estimated,
    placementTaken: level.source === 'placement',
    levels, reviewDue: due.length,
    daily: { done: Boolean(daily && daily.completed_at), score: daily ? daily.score : null, total: daily ? daily.total : DAILY_N, streak: await dailyStreak(userId) },
    recommendations: await recommend(userId, stats, level, due.length, ls),
    continue: await L.continueLesson(userId),
    badges: badges.filter((b) => b.earned).length, badgesTotal: badges.length,
  };
}
async function recommend(userId, stats, level, dueCount, ls = null) {
  const recs = [];
  if (!level.cefr || level.source !== 'placement') recs.push({ kind: 'placement', titleTh: 'วัดระดับแกรมม่าก่อนเริ่ม', textTh: 'ประมาณ 10 นาที ระบบจะปรับความยากตามคำตอบ แล้วแนะนำหัวข้อที่ควรเรียน', action: { to: 'placement' } });
  if (dueCount > 0) recs.push({ kind: 'review', titleTh: `ทบทวนวันนี้ ${dueCount} ข้อ`, textTh: 'ข้อที่เคยพลาดถึงรอบทบทวนแล้ว — ทบทวนตอนนี้จำได้นานขึ้น', action: { to: 'review' } });
  // หัวข้อที่พลาดบ่อย (14 วันล่าสุด)
  const { rows } = await pool.query(
    `SELECT topic_id, COUNT(*) FILTER (WHERE NOT correct)::int AS wrong, COUNT(*)::int AS n FROM grammar_attempts
      WHERE user_id = $1 AND created_at > to_timestamp($2 / 1000.0) - INTERVAL '14 days' AND source <> 'placement'
      GROUP BY topic_id HAVING COUNT(*) FILTER (WHERE NOT correct) >= 3 ORDER BY 2 DESC LIMIT 1`, [userId, now()]);
  if (rows[0]) {
    const t = GC.TOPIC_BY_ID[rows[0].topic_id];
    const cmp = GC.TOPICS.find((x) => x.compareWith.includes(t.id) && LEVELS.indexOf(x.cefr) >= LEVELS.indexOf(t.cefr)) || null;
    const target = cmp || t;
    recs.push({ kind: 'mistakes', titleTh: `คุณพลาดบ่อยในหัวข้อ ${t.title}`, textTh: `พลาด ${rows[0].wrong} ครั้งใน 2 สัปดาห์ — แนะนำ: ${target.title}`, action: { to: 'topic', topicId: target.id } });
  }
  // mastery ลดลง (เทียบ 7 วันก่อน)
  const before = await topicStats(userId, { until: now() - 7 * DAY });
  const drops = Object.entries(stats).map(([id, s]) => ({ id, now: s.mastery, before: (before[id] || {}).mastery })).filter((x) => x.before !== undefined && x.before !== null && x.now !== null && x.before - x.now >= 10)
    .sort((a, b) => (b.before - b.now) - (a.before - a.now));
  if (drops[0]) { const t = GC.TOPIC_BY_ID[drops[0].id]; recs.push({ kind: 'drop', titleTh: `Mastery ${t.title} ลดลงเหลือ ${drops[0].now}%`, textTh: 'ทบทวนหัวข้อนี้สักรอบเพื่อดึงกลับขึ้นมา', action: { to: 'topic', topicId: t.id } }); }
  // หัวข้อถัดไปในระดับปัจจุบัน
  const lvl = level.cefr || 'A1';
  // บทถัดไป: บทที่ปลดล็อกแล้วแต่ยังไม่ผ่าน (ตามลำดับแผนที่)
  const open = (t) => !ls || (ls[t.id].unlocked && !['completed', 'mastered'].includes(ls[t.id].state));
  const next = GC.TOPICS.find((t) => t.cefr === lvl && !stats[t.id] && open(t)) || GC.TOPICS.find((t) => LEVELS.indexOf(t.cefr) >= LEVELS.indexOf(lvl) && !stats[t.id] && open(t))
    || GC.TOPICS.find((t) => open(t));
  if (next) recs.push({ kind: 'next', titleTh: `เรียนต่อ: ${next.title}`, textTh: `${next.titleTh} · ระดับ ${next.cefr}`, action: { to: 'topic', topicId: next.id } });
  return recs.slice(0, 4);
}
async function progress(userId, range = '7') {
  const [stats, level, due, streak, badges] = await Promise.all([topicStats(userId), grammarLevel(userId), reviewDue(userId), studyStreak(userId), badgesOf(userId)]);
  const days = range === '30' ? 30 : range === 'all' ? null : 7;
  const { rows } = await pool.query(
    `SELECT to_char((created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS c
       FROM grammar_attempts WHERE user_id = $1 AND source <> 'placement' ${days ? `AND created_at > to_timestamp($2 / 1000.0) - INTERVAL '${days} days'` : ''}
      GROUP BY 1 ORDER BY 1`, days ? [userId, now()] : [userId]);
  let series;
  if (days) {
    const map = Object.fromEntries(rows.map((r) => [r.d, r]));
    series = Array.from({ length: days }, (_, i) => { const d = bkkDay(now() - (days - 1 - i) * DAY); const r = map[d]; return { label: d.slice(5), answered: r ? r.n : 0, accuracy: r && r.n ? Math.round((r.c / r.n) * 100) : null }; });
  } else {
    const wk = {};
    rows.forEach((r) => { const dt = new Date(`${r.d}T00:00:00Z`); const monday = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); (wk[monday] = wk[monday] || { n: 0, c: 0 }); wk[monday].n += r.n; wk[monday].c += r.c; });
    series = Object.entries(wk).sort().map(([d, v]) => ({ label: d.slice(5), answered: v.n, accuracy: v.n ? Math.round((v.c / v.n) * 100) : null }));
  }
  const all = (await pool.query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS c FROM grammar_attempts WHERE user_id = $1 AND source <> 'placement'`, [userId])).rows[0];
  const list = Object.entries(stats).map(([id, s]) => ({ id, title: GC.TOPIC_BY_ID[id].title, titleTh: GC.TOPIC_BY_ID[id].titleTh, cefr: GC.TOPIC_BY_ID[id].cefr, ...s }));
  const overall = list.length ? Math.round(list.reduce((a, b) => a + b.mastery, 0) / list.length) : 0;
  return {
    level: level.cefr, levelSource: level.source, estimatedLevel: levelFromMastery(stats, level.cefr),
    overallMastery: overall, accuracy: all.n ? Math.round((all.c / all.n) * 100) : null, answered: all.n, streak,
    mastered: list.filter((x) => x.status === 'mastered').sort((a, b) => b.mastery - a.mastery),
    improve: list.filter((x) => x.status !== 'mastered').sort((a, b) => a.mastery - b.mastery).slice(0, 8),
    reviewDue: due.length, range: days ? String(days) : 'all', series, badges,
  };
}
async function markStep(userId, topicId, step) {
  if (!GC.TOPIC_BY_ID[topicId]) throw new GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  const s = Math.max(1, Math.min(6, Number(step) || 0));
  await pool.query(
    `INSERT INTO grammar_lessons (user_id, topic_id, steps_seen, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, topic_id) DO UPDATE SET steps_seen = (
       SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(grammar_lessons.steps_seen || $3::jsonb) x), updated_at = NOW()`,
    [userId, topicId, JSON.stringify([s])]);
  return { ok: true };
}
async function topicView(userId, topicId) {
  const t = GC.getTopic(topicId);
  if (!t) throw new GrammarError('NO_TOPIC', 'ไม่พบหัวข้อนี้', 404);
  const stats = await topicStats(userId);
  const l = (await pool.query('SELECT steps_seen, best_score, best_total, completed_at FROM grammar_lessons WHERE user_id = $1 AND topic_id = $2', [userId, topicId])).rows[0];
  const withIds = t.compare ? [].concat(t.compare.with || []) : [];
  const compare = t.compare ? { ...t.compare, with: withIds.filter((id) => GC.TOPIC_BY_ID[id]).map((id) => ({ id, title: GC.TOPIC_BY_ID[id].title, titleTh: GC.TOPIC_BY_ID[id].titleTh })) } : null;
  const { practice, ...lesson } = t;
  const idx = GC.TOPICS.findIndex((x) => x.id === topicId);
  return {
    ...lesson, compare, practiceCount: practice.length, practiceTypes: [...new Set(practice.map((p) => p.type))].map((x) => ({ type: x, th: GC.TYPE_TH[x] })),
    stats: stats[topicId] || null, lesson: l ? { stepsSeen: l.steps_seen || [], best: l.best_score, total: l.best_total, completed: Boolean(l.completed_at) } : null,
    prev: idx > 0 ? { id: GC.TOPICS[idx - 1].id, title: GC.TOPICS[idx - 1].title } : null,
    next: idx < GC.TOPICS.length - 1 ? { id: GC.TOPICS[idx + 1].id, title: GC.TOPICS[idx + 1].title } : null,
  };
}

module.exports = {
  GrammarError, _setNow, bkkDay, publicItem, feedbackFor, masteryOf, statusOf, topicStats, grammarLevel, setLevel, levelFromMastery,
  startPractice, answer, finishSession, recordAttempt, startReview, reviewDue,
  placementStart, placementAnswer, placementResult, dailyGet, dailyFinish, dailyStreak, studyStreak,
  awardBadges, badgesOf, BADGES, mistakes, hub, progress, markStep, topicView, INTERVALS, _seededShuffle: seededShuffle,
};
