/*
  Grammar Battle ← คลังแกรมม่า A1–C1 (data/grammar-curriculum) — ชุดเดียวกับที่ใช้เรียน ตรวจ QA แล้ว
  - เลือกข้อตามระดับแกรมม่าของผู้เล่น (Grammar CEFR ≠ Rank ≠ Account Level) + ปรับตามผลงานล่าสุด
  - ใช้เฉพาะข้อเลือกตอบ (mc / choose / dialogue / context) เพราะเกมแข่งต้องตอบเร็วและตรวจได้ทันที
  - หลังตอบ: บันทึกกลับ grammar_attempts (source='ranked') -> Mastery / My Mistakes / Review ใช้ข้อมูลเดียวกัน
*/
const GC = require('../../data/grammar-curriculum');
const { shuffle } = require('./rng');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const CHOICE_TYPES = new Set(['mc', 'choose', 'dialogue', 'context']);
const PASSAGE_TYPES = new Set(['dialogue', 'context']);
let cache = null; let leaked = 0;
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function leaks(it) {
  const passage = passageOf(it) || '';
  const has = (c) => new RegExp(`(^|[^A-Za-z])${escapeRe(String(c).trim())}([^A-Za-z]|$)`, 'i').test(passage);
  const ans = String(it.choices[it.answer] || '').trim();
  return ans.length >= 3 && has(ans) && !it.choices.some((c, k) => k !== it.answer && String(c).trim().length > 2 && has(c));
}
function byLevel() {
  if (cache) return cache;
  cache = Object.fromEntries(LEVELS.map((l) => [l, { plain: [], passage: [] }]));
  for (const it of GC.allItems()) {
    if (!CHOICE_TYPES.has(it.type) || !cache[it.cefr] || !Array.isArray(it.choices) || it.choices.length < 2) continue;
    // ข้อมีบริบท: ตัดข้อที่เนื้อหา "บอกคำตอบเอง" (คำตอบปรากฏตรงตัวในบริบท แต่ตัวลวงไม่ปรากฏ) — ในเกมแข่งเร็ว จะกลายเป็นข้อจับคำ
    if (PASSAGE_TYPES.has(it.type) && leaks(it)) { leaked += 1; continue; }
    cache[it.cefr][PASSAGE_TYPES.has(it.type) ? 'passage' : 'plain'].push(it);
  }
  return cache;
}

const passageOf = (it) => (it.context && Array.isArray(it.context.lines)
  ? it.context.lines.map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join('\n') : null);
const strip = (s) => String(s || '').replace(/\[\[(.+?)\]\]/g, '$1');

function toQuestion(it, rng) {
  const order = shuffle(it.choices.map((_, k) => k), rng);
  const topic = GC.TOPIC_BY_ID[it.topic];
  const hasPassage = PASSAGE_TYPES.has(it.type);
  return {
    id: `gc:${it.id}`, type: hasPassage ? 'reading' : 'grammar', cefr: it.cefr,
    prompt: strip(it.question || (it.type === 'dialogue' ? 'เลือกคำตอบที่เหมาะกับบทสนทนา' : '')),
    instruction: it.type === 'choose' ? 'เลือกประโยคที่ถูกต้อง' : hasPassage ? 'อ่านแล้วตอบ' : 'เลือกคำตอบที่ถูกต้อง',
    passage: hasPassage ? passageOf(it) : null, passageTitle: hasPassage && it.context ? (it.context.title || null) : null,
    choices: order.map((k) => it.choices[k]), correctIndex: order.indexOf(it.answer),
    explain: it.explainTh || '',
    ref: { glItem: it.id, topicId: it.topic, topicTitle: topic ? topic.title : it.topic, topicTitleTh: topic ? topic.titleTh : '', order },
    difficultyAdj: ((it.difficulty || 2) - 2) * 0.15,
  };
}

/**
 * ชุดคำถาม Grammar Battle
 * level   : ระดับแกรมม่าที่ใช้ (ดู effectiveLevel)
 * tier    : beginner | intermediate | advanced (จาก League) -> สัดส่วนข้อยากขึ้น
 * passage : จำนวนข้อแบบมีบริบท (บทสนทนา / อีเมล / ข้อความ)
 */
function curriculumQuestions({ level, tier = 'beginner', count, passage = 0, rng, exclude = new Set() }) {
  const L = LEVELS.includes(level) ? level : 'A1';
  const li = LEVELS.indexOf(L);
  const bank = byLevel();
  // 80% ระดับของผู้เล่น · 20% ระดับรอบข้าง (ต่ำกว่า 1 ระดับ; League สูงได้ระดับสูงกว่า 1 ระดับแทน)
  const sideLevel = tier === 'advanced' && li < LEVELS.length - 1 ? LEVELS[li + 1] : (li > 0 ? LEVELS[li - 1] : LEVELS[li + 1]);
  const hardBias = tier === 'advanced' ? 1 : tier === 'intermediate' ? 0.5 : 0;
  const pick = (kind, n) => {
    const fresh = (arr) => arr.filter((it) => !exclude.has(`gc:${it.id}`));
    // League สูง -> ข้อยาก (difficulty >= 3) มีโอกาสถูกเลือกมากขึ้น (กำหนดด้วย rng จาก seed = ทั้งสองฝั่งได้ชุดเดียวกัน)
    const ordered = (arr) => {
      const hard = shuffle(arr.filter((it) => (it.difficulty || 2) >= 3), rng); const easy = shuffle(arr.filter((it) => (it.difficulty || 2) < 3), rng);
      const out = [];
      while (hard.length || easy.length) out.push(((rng() < 0.25 + 0.35 * hardBias && hard.length) || !easy.length ? hard : easy).shift());
      return out;
    };
    const main = ordered(fresh(bank[L][kind])); const side = ordered(fresh(bank[sideLevel][kind]));
    const nSide = Math.min(side.length, Math.round(n * 0.2));
    let out = [...main.slice(0, n - nSide), ...side.slice(0, nSide)];
    if (out.length < n) out = out.concat(shuffle(bank[L][kind].filter((it) => !out.includes(it)), rng).slice(0, n - out.length));   // ข้อซ้ำจากเกมก่อน ดีกว่าเกมไม่ครบ
    return shuffle(out.slice(0, n), rng);
  };
  // หัวข้อเดียวกันไม่เกิน 2 ข้อต่อเกม (ให้ครอบคลุมหลายหัวข้อ)
  const capTopics = (items, n) => {
    const per = {}; const out = []; const rest = [];
    items.forEach((it) => { per[it.topic] = (per[it.topic] || 0) + 1; (per[it.topic] <= 2 ? out : rest).push(it); });
    return out.concat(rest).slice(0, n);
  };
  const p = pick('passage', passage);
  const g = capTopics(pick('plain', (count - p.length) * 2), count - p.length);
  return shuffle([...g, ...p], rng).slice(0, count).map((it) => toQuestion(it, rng));
}

/** ระดับที่ใช้ตั้งคำถาม: Grammar CEFR (วัดระดับแกรมม่า) -> ผลวัดระดับรวมเดิม -> A1 · ปรับ ±1 ตามผลงาน 30 ข้อล่าสุด */
async function effectiveLevel(userId, db) {
  const prof = (await db.query('SELECT cefr FROM grammar_profiles WHERE user_id = $1', [userId])).rows[0];
  let base = prof && LEVELS.includes(prof.cefr) ? prof.cefr : null;
  if (!base) {
    const legacy = (await db.query(`SELECT result->>'grammar' AS g, result->>'overall' AS o FROM placement_attempts WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`, [userId])).rows[0];
    base = legacy && LEVELS.includes(legacy.g) ? legacy.g : legacy && LEVELS.includes(legacy.o) ? legacy.o : null;
  }
  const from = base ? 'grammar' : 'default';
  base = base || 'A1';
  const recent = (await db.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(CASE WHEN correct THEN 1 ELSE 0 END), 0)::int AS c FROM (
       SELECT correct FROM grammar_attempts WHERE user_id = $1 AND cefr = $2 AND source <> 'placement' ORDER BY created_at DESC LIMIT 30) t`, [userId, base])).rows[0];
  let li = LEVELS.indexOf(base); let adjust = 0;
  if (recent.n >= 20) {
    const acc = recent.c / recent.n;
    if (acc >= 0.85 && li < LEVELS.length - 1) adjust = 1;
    else if (acc <= 0.4 && li > 0) adjust = -1;
  }
  li += adjust;
  return { cefr: LEVELS[li], base, adjust, from, recentAccuracy: recent.n ? Math.round((recent.c / recent.n) * 100) : null };
}

/** บันทึกคำตอบในเกมกลับเข้าระบบเรียน (ไม่ทำให้เกมล้มถ้าบันทึกไม่สำเร็จ) */
function recordRankedAnswer(userId, q, choiceIndex, correct) {
  if (!userId || !q || !q.ref || !q.ref.glItem) return Promise.resolve();
  const it = GC.getItem(q.ref.glItem);
  if (!it) return Promise.resolve();
  const orig = Number.isInteger(choiceIndex) && choiceIndex >= 0 && q.ref.order ? q.ref.order[choiceIndex] : null;
  // eslint-disable-next-line global-require
  return require('../grammar/engine').recordAttempt(userId, it, Boolean(correct), orig === undefined ? null : orig, 'ranked')
    .catch((err) => console.error('[ranked→grammar] record', err.message));
}

/** หัวข้อในเกม (หน้าก่อนเริ่ม + หน้าผลลัพธ์) */
function topicsOf(questions) {
  const m = new Map();
  (questions || []).forEach((q) => { if (q.ref && q.ref.topicId && !m.has(q.ref.topicId)) m.set(q.ref.topicId, { id: q.ref.topicId, title: q.ref.topicTitle, titleTh: q.ref.topicTitleTh, cefr: q.cefr }); });
  return [...m.values()];
}

module.exports = { curriculumQuestions, effectiveLevel, recordRankedAnswer, topicsOf, _byLevel: byLevel, _leaked: () => leaked };
