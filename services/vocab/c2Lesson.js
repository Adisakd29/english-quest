/*
  บทเรียนคำศัพท์ C2 แบบทีละขั้น (12 ขั้น) — ต่อยอดระบบคำศัพท์เดิม ไม่ใช่ engine ใหม่
    - Unit มาจาก Learning Path เดิม (utils/curriculum → C2 units) · ล็อก/ปลดล็อกตามกฎเดิม
    - ความคืบหน้าต่อ sense อยู่ใน word_progress เดิม (word_id = public_id C2-S####, level 'C2') + SRS เดิม
    - คำตอบทุกข้อบันทึก answer_events (skill 'vocab', facet = ประเภทจุดอ่อน) → My Mistakes / จุดอ่อน
    - EXP เข้าบัญชีเดียว (utils/exp) · ได้ครั้งเดียวต่อคีย์ (กัน refresh / ทำซ้ำ / ส่งพร้อมกัน) · ไม่มีเพดานรายวัน

  ขั้นเรียน: New Words → Meanings → In Context → Quick Check → Collocations → Practice → Synonym Nuance →
            Practice → Idioms & Phrases → Context Challenge → Review → Mastery Check
*/
const pool = require('../../config/db');
const S = require('./c2Store');
const I = require('./c2Items');
const srs = require('../../utils/srs');
const { grantOnce, mergeGrants } = require('../../utils/exp');

class C2Error extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const PASS_PCT = 80;
const EXP = { step: 5, firstCorrect: 12, complete: 40, perfect: 20 };
const DAILY_CAP = null; // ไม่มีเพดานรายวัน (ตามนโยบายเดียวกับแกรมม่า) — กันปั๊มด้วยคีย์ครั้งเดียว
const UNIT_RE = /^C2-[a-z]+-\d+$/;

const STEP_META = {
  words: { title: 'New Words', th: 'คำ/วลีใหม่', icon: 'sparkles' },
  meanings: { title: 'Meanings', th: 'ความหมายและการใช้', icon: 'book-open' },
  usage: { title: 'In Context', th: 'เห็นในประโยคจริง', icon: 'message-circle' },
  quick: { title: 'Quick Check', th: 'เช็กความหมาย', icon: 'target' },
  colloc: { title: 'Collocations', th: 'คำที่ใช้คู่กัน', icon: 'link' },
  practice1: { title: 'Practice', th: 'ฝึก collocation และเลือกคำ', icon: 'pencil-line' },
  nuance: { title: 'Synonym Nuance', th: 'ความต่างของคำใกล้เคียง', icon: 'scale' },
  practice2: { title: 'Practice', th: 'ความแม่นยำ · น้ำเสียง · ระดับภาษา', icon: 'target' },
  phrases: { title: 'Idioms & Phrases', th: 'สำนวน วลี และรูปคำ', icon: 'message-circle' },
  ctx: { title: 'Context Challenge', th: 'เดาความหมายจากบริบท', icon: 'search' },
  review: { title: 'Review', th: 'สรุปและจุดที่มักผิด', icon: 'list-checks' },
  mastery: { title: 'Mastery Check', th: 'วัดผลท้ายบท', icon: 'award' },
};
const ORDER = ['words', 'meanings', 'usage', 'quick', 'colloc', 'practice1', 'nuance', 'practice2', 'phrases', 'ctx', 'review', 'mastery'];
const CHECK = {
  quick: { cap: 6, prefer: [['meaning']] },
  practice1: { cap: 6, prefer: [['colloc', 'reverse']] },
  practice2: { cap: 6, prefer: [['nearsyn', 'register', 'connot']] },
  ctx: { cap: 6, prefer: [['context']] },
  // Mastery: หมุนชนิดข้อให้หลากหลาย
  mastery: { cap: 8, prefer: [['formtype', 'idiom', 'mistake'], ['mistake', 'form', 'reverse'], ['idiom', 'register', 'connot'], ['reverse', 'meaning']] },
};

const seedOf = (userId, unitId, run) => `c2:${userId}:${unitId}:${run}`;

/* ---------------- Unit ---------------- */
async function unitInfo(userId, unitId, { explore = false } = {}) {
  if (!UNIT_RE.test(String(unitId))) throw new C2Error('BAD_UNIT', 'รหัส Unit ไม่ถูกต้อง');
  const P = require('../../routes/path');
  const { units, levels } = await P.getUserPathState(userId);
  const unit = (units.C2 || []).find((u) => u.id === unitId);
  if (!unit) throw new C2Error('NO_UNIT', 'ไม่พบ Unit นี้', 404);
  const lv = levels.find((l) => l.level === 'C2');
  const state = lv.units.find((u) => u.id === unitId);
  if (state.status === 'locked' && !explore) throw new C2Error('UNIT_LOCKED', 'Unit นี้ยังล็อกอยู่ ผ่าน C1 ก่อน หรือเปิดโหมดสำรวจอิสระ', 403);
  await S.ready();
  const senses = unit.wordIds.map((id) => S.get(id)).filter(Boolean);
  if (!senses.length) throw new C2Error('EMPTY_UNIT', 'Unit นี้ยังไม่มีเนื้อหาที่ผ่านการตรวจ', 404);
  return { unit, state, senses, title: P.unitTitle(unit) };
}

/* ---------------- แผนบทเรียน ---------------- */
function buildPlan(senses, seed) {
  const order = I.seededShuffle(senses, `${seed}:order`);
  const n = order.length;
  const used = new Set();
  const items = {};
  ORDER.filter((k) => CHECK[k]).forEach((k, j) => {
    const cfg = CHECK[k]; const cap = Math.min(cfg.cap, n); const out = [];
    for (let i = 0; i < n && out.length < cap; i++) {
      const s = order[(j * 3 + i) % n];
      const prefs = cfg.prefer[out.length % cfg.prefer.length];
      const all = [...prefs, ...cfg.prefer.flat()];
      for (const t of all) {
        const id = `${s.id}~${t}`;
        if (used.has(id)) continue;
        const it = I.build(s, t, seed);
        if (it) { used.add(id); out.push(id); break; }
      }
    }
    items[k] = out;
  });
  return ORDER.map((kind, k) => {
    const meta = STEP_META[kind];
    const step = { k, kind, title: meta.title, th: meta.th, icon: meta.icon };
    if (CHECK[kind]) { step.check = true; step.items = items[kind]; }
    return step;
  }).filter((s) => !s.check || s.items.length);
}

/* ---------------- เนื้อหาขั้นเรียน (ไม่มีเฉลยแบบฝึก) ---------------- */
const card = (s) => ({
  id: s.id, form: s.form, pos: s.pos, kind: s.kind, ipa: s.ipaUK || s.ipa, ipaUS: s.ipaUS && s.ipaUS !== s.ipaUK ? s.ipaUS : null,
  short: s.short, register: s.register, connotation: s.connotation, tier: s.tier, variant: s.variant,
});
function stepContent(step, senses) {
  switch (step.kind) {
    case 'words': return { cards: senses.map(card) };
    case 'meanings': return { cards: senses.map((s) => ({ ...card(s), meaningEN: s.meaningEN, meaningTH: s.meaningTH, usageNoteTH: s.usageNoteTH,
      base: s.kind === 'sense' ? { lemma: s.baseLemma, meaningTH: s.baseMeaningTH } : null })) };
    case 'usage': return { cards: senses.map((s) => ({ id: s.id, form: s.form, example: s.example, exampleTH: s.exampleTH, register: s.register })) };
    case 'colloc': return { cards: senses.map((s) => ({ id: s.id, form: s.form, collocations: s.collocations.slice(0, 5), mistake: s.commonMistakes[0] || null })) };
    case 'nuance': return { cards: senses.map((s) => ({ id: s.id, form: s.form, register: s.register, connotation: s.connotation,
      synonyms: s.synonyms.slice(0, 4), nearSynonyms: s.nearSynonyms.slice(0, 3), antonyms: s.antonyms.slice(0, 3) })) };
    case 'phrases': return { cards: senses.map((s) => ({ id: s.id, form: s.form, kind: s.kind, literalTH: s.literalTH || null, naturalTH: s.naturalTH || null,
      unnaturalTH: s.unnaturalTH || null, separable: typeof s.separable === 'boolean' ? s.separable : null, wordFamily: s.wordFamily.slice(0, 4),
      confusedWith: s.confusedWith.slice(0, 3) })) };
    case 'review': {
      // True/False จาก common mistakes — ครึ่งหนึ่งเป็นประโยคที่ถูก
      const ms = senses.filter((s) => s.commonMistakes[0]).slice(0, 6);
      return {
        rows: senses.map((s) => ({ id: s.id, form: s.form, short: s.short, register: s.register, tier: s.tier })),
        cards: ms.map((s, i) => { const m = s.commonMistakes[0]; const showRight = i % 2 === 1;
          return { form: s.form, sentence: showRight ? m.right : m.wrong, isCorrect: showRight, wrong: m.wrong, right: m.right, whyTh: m.whyTH }; }),
      };
    }
    default: return {};
  }
}

/* ---------------- สถานะ ---------------- */
async function rowOf(userId, unitId, db = pool) {
  return (await db.query('SELECT * FROM vocab_lessons WHERE user_id = $1 AND unit_id = $2', [userId, unitId])).rows[0] || null;
}
async function ensureRow(userId, unitId) {
  await pool.query(`INSERT INTO vocab_lessons (user_id, unit_id, last_study_at) VALUES ($1, $2, NOW())
    ON CONFLICT (user_id, unit_id) DO UPDATE SET last_study_at = NOW()`, [userId, unitId]);
  return rowOf(userId, unitId);
}
function runScore(plan, answers) {
  const ids = plan.filter((s) => s.check).flatMap((s) => s.items);
  const answered = ids.filter((id) => answers[id] !== undefined);
  const correct = answered.filter((id) => answers[id] === true).length;
  return { answered: answered.length, correct, total: ids.length, accuracy: answered.length ? Math.round((correct / answered.length) * 100) : null };
}
const stepMeta = (s, r) => ({ k: s.k, kind: s.kind, check: Boolean(s.check), title: s.title, th: s.th, icon: s.icon,
  items: s.items ? s.items.length : 0, done: new Set((r && r.run_steps) || []).has(s.k) });

/* ---------------- ความคืบหน้าต่อ sense (word_progress + SRS เดิม) ---------------- */
/*
  ใช้กติกาเดียวกับ /progress/review:
    ตอบถูก = known · ตอบผิด = learning · ever_known ติดถาวร
    SRS: ตอบถูกก่อนถึงกำหนด (เจอซ้ำวันเดียวกัน) ไม่ขยายช่วง · ตอบผิด = again
  เพิ่ม: ภายในรอบบทเรียนเดียวกัน ถ้า sense นี้เคยตอบผิดแล้ว การตอบถูกข้อถัดไปยังไม่นับเป็น known
         (ต้องเข้าใจทุกแง่มุม — ความหมาย/collocation/บริบท — ก่อนนับว่ารู้)
*/
async function recordSense(client, userId, senseId, correct, { blockKnown = false, facet = null, source = 'c2lesson' } = {}) {
  const ex = (await client.query('SELECT * FROM word_progress WHERE user_id = $1 AND word_id = $2 FOR UPDATE', [userId, senseId])).rows[0];
  const known = correct && !blockKnown;
  const prev = ex ? { reps: ex.srs_reps, ease: ex.srs_ease, interval: ex.srs_interval, lapses: ex.srs_lapses } : null;
  const early = Boolean(ex && correct && !srs.isDue(ex.srs_due_at));
  const next = early ? { ...prev, dueAt: ex.srs_due_at } : srs.schedule(prev, correct, new Date());
  const status = known ? 'known' : (correct && ex ? ex.status : 'learning');
  const firstKnown = known && !(ex && ex.ever_known);
  if (ex) {
    await client.query(
      `UPDATE word_progress SET status = $3, times_seen = times_seen + 1, times_correct = times_correct + $4, last_reviewed = NOW(),
          ever_known = ever_known OR $5, srs_interval = $6, srs_ease = $7, srs_reps = $8, srs_lapses = $9, srs_due_at = $10
        WHERE user_id = $1 AND word_id = $2`,
      [userId, senseId, status, correct ? 1 : 0, known, next.interval, next.ease, next.reps, next.lapses, next.dueAt]);
  } else {
    await client.query(
      `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known,
          srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at)
       VALUES ($1, $2, 'C2', $3, 1, $4, NOW(), $5, $6, $7, $8, $9, $10) ON CONFLICT (user_id, word_id) DO NOTHING`,
      [userId, senseId, status, correct ? 1 : 0, known, next.interval, next.ease, next.reps, next.lapses, next.dueAt]);
  }
  await client.query('INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [userId, 'vocab', senseId, 'C2', correct, source, facet]);
  return { status, firstKnown };
}
async function withClient(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; } catch (err) {
    await client.query('ROLLBACK').catch(() => {}); throw err;
  } finally { client.release(); }
}

/* ---------------- API ---------------- */
async function overview(userId, unitId, opts = {}) {
  const { unit, state, senses, title } = await unitInfo(userId, unitId, opts);
  const r = await rowOf(userId, unitId);
  const run = r ? r.run_no : 1;
  const plan = buildPlan(senses, seedOf(userId, unitId, run));
  const score = runScore(plan, (r && r.run_answers) || {});
  const known = (await pool.query("SELECT count(*)::int AS n FROM word_progress WHERE user_id = $1 AND status = 'known' AND word_id = ANY($2)",
    [userId, unit.wordIds])).rows[0].n;
  return {
    unitId, level: 'C2', ...title, status: state.status, explored: state.status === 'locked',
    senses: senses.map(card), known, totalSenses: unit.wordIds.length,
    steps: plan.map((s) => stepMeta(s, r)), current: r ? Math.min(r.current_step, plan.length) : 0, total: plan.length,
    runNo: run, runFinished: Boolean(r && r.current_step >= plan.length), score, passPct: PASS_PCT,
    bestAccuracy: r ? r.best_accuracy : null, lastAccuracy: r ? r.lesson_accuracy : null, completed: Boolean(r && r.lesson_completed_at),
  };
}

async function getStep(userId, unitId, k, opts = {}) {
  const { senses } = await unitInfo(userId, unitId, opts);
  const r = await ensureRow(userId, unitId);
  const seed = seedOf(userId, unitId, r.run_no);
  const plan = buildPlan(senses, seed);
  const i = Number(k);
  if (!Number.isInteger(i) || i < 0 || i >= plan.length) throw new C2Error('BAD_STEP', 'ไม่พบขั้นนี้', 404);
  if (i > r.current_step) throw new C2Error('STEP_LOCKED', 'เรียนขั้นก่อนหน้าให้จบก่อน', 403);
  const s = plan[i];
  const answers = r.run_answers || {};
  const content = s.check
    ? { items: s.items.map((id) => { const p = I.parseItemId(id); return I.publicView(I.build(p.senseId, p.type, seed)); }) }
    : stepContent(s, senses);
  return {
    unitId, step: stepMeta(s, r), total: plan.length, current: Math.min(r.current_step, plan.length), content,
    answered: s.check ? Object.fromEntries(s.items.filter((x) => answers[x] !== undefined).map((x) => [x, answers[x]])) : {},
  };
}

async function answerStep(userId, unitId, k, itemId, ans, opts = {}) {
  const { senses } = await unitInfo(userId, unitId, opts);
  const r = await rowOf(userId, unitId);
  if (!r) throw new C2Error('NOT_STARTED', 'ยังไม่ได้เริ่มบทเรียนนี้');
  const seed = seedOf(userId, unitId, r.run_no);
  const plan = buildPlan(senses, seed);
  const s = plan[Number(k)];
  if (!s || !s.check || Number(k) > r.current_step) throw new C2Error('BAD_STEP', 'ขั้นนี้ไม่มีแบบฝึก');
  if (!s.items.includes(itemId)) throw new C2Error('NOT_IN_STEP', 'ข้อนี้ไม่อยู่ในขั้นนี้');
  const p = I.parseItemId(itemId);
  const it = I.build(p.senseId, p.type, seed);
  const fb = I.check(it, ans);
  // นับเฉพาะคำตอบแรกของข้อในรอบนี้ (atomic)
  const first = (await pool.query(
    `UPDATE vocab_lessons SET run_answers = run_answers || jsonb_build_object($3::text, $4::boolean), last_study_at = NOW()
      WHERE user_id = $1 AND unit_id = $2 AND run_no = $5 AND NOT (run_answers ? $3) RETURNING run_answers`,
    [userId, unitId, itemId, fb.correct, r.run_no])).rows[0];
  fb.counted = Boolean(first);
  let exp = { gained: 0, levelInfo: null, leveledUp: false };
  if (first) {
    // sense นี้เคยตอบผิดในรอบนี้แล้ว → ยังไม่นับ known
    const wrongBefore = Object.entries(first.run_answers).some(([id, v]) => v === false && id !== itemId && id.startsWith(`${p.senseId}~`));
    const prog = await withClient((c) => recordSense(c, userId, p.senseId, fb.correct, { blockKnown: wrongBefore, facet: fb.facet }));
    fb.senseStatus = prog.status;
    if (fb.correct) exp = await grantOnce(userId, `c2q:${itemId}`, EXP.firstCorrect, { reason: 'c2_lesson', dailyCap: DAILY_CAP });
  }
  fb.exp = exp.gained; fb.levelInfo = exp.levelInfo; fb.leveledUp = exp.leveledUp;
  return fb;
}

async function completeStep(userId, unitId, k, opts = {}) {
  const { senses } = await unitInfo(userId, unitId, opts);
  const r = await rowOf(userId, unitId);
  if (!r) throw new C2Error('NOT_STARTED', 'ยังไม่ได้เริ่มบทเรียนนี้');
  const plan = buildPlan(senses, seedOf(userId, unitId, r.run_no));
  const i = Number(k);
  const s = plan[i];
  if (!s) throw new C2Error('BAD_STEP', 'ไม่พบขั้นนี้', 404);
  if (i > r.current_step) throw new C2Error('STEP_LOCKED', 'เรียนขั้นก่อนหน้าให้จบก่อน', 403);
  const answers = r.run_answers || {};
  if (s.check && s.items.some((x) => answers[x] === undefined)) throw new C2Error('INCOMPLETE', 'ตอบให้ครบทุกข้อในขั้นนี้ก่อน');
  const last = i === plan.length - 1;
  const upd = (await pool.query(
    `UPDATE vocab_lessons SET
        run_steps = CASE WHEN run_steps @> $3::jsonb THEN run_steps ELSE run_steps || $3::jsonb END,
        completed_steps = CASE WHEN completed_steps @> $3::jsonb THEN completed_steps ELSE completed_steps || $3::jsonb END,
        current_step = GREATEST(current_step, $4::int), last_study_at = NOW()
      WHERE user_id = $1 AND unit_id = $2 AND run_no = $5 RETURNING current_step`,
    [userId, unitId, JSON.stringify([i]), i + 1, r.run_no])).rows[0];
  const grants = [await grantOnce(userId, `c2s:${unitId}:${i}`, EXP.step, { reason: 'c2_lesson', dailyCap: DAILY_CAP })];
  let result = null;
  if (last && upd) {
    const score = runScore(plan, answers);
    const acc = score.accuracy === null ? 0 : score.accuracy;
    const passed = score.answered === score.total && acc >= PASS_PCT;
    await pool.query(
      `UPDATE vocab_lessons SET lesson_accuracy = $3, best_accuracy = GREATEST(COALESCE(best_accuracy, 0), $3), lesson_runs = lesson_runs + 1,
          lesson_completed_at = CASE WHEN $4 THEN COALESCE(lesson_completed_at, NOW()) ELSE lesson_completed_at END
        WHERE user_id = $1 AND unit_id = $2`, [userId, unitId, acc, passed]);
    if (passed) {
      grants.push(await grantOnce(userId, `c2c:${unitId}`, EXP.complete, { reason: 'c2_lesson', dailyCap: DAILY_CAP }));
      if (acc === 100) grants.push(await grantOnce(userId, `c2p:${unitId}`, EXP.perfect, { reason: 'c2_lesson', dailyCap: DAILY_CAP }));
    }
    // sense ที่ยังอ่อน (ตอบผิดในรอบนี้) → ส่งเข้าคิวทบทวน
    const weak = [...new Set(Object.entries(answers).filter(([, v]) => v === false).map(([id]) => id.split('~')[0]))];
    result = { passed, accuracy: acc, correct: score.correct, total: score.total, passPct: PASS_PCT,
      weak: weak.map((id) => { const x = S.get(id); return x ? { id, form: x.form, short: x.short } : null; }).filter(Boolean) };
  }
  const exp = mergeGrants(grants);
  return { ok: true, current: upd ? upd.current_step : r.current_step, total: plan.length, exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp, result };
}

async function restart(userId, unitId, opts = {}) {
  await unitInfo(userId, unitId, opts);
  await ensureRow(userId, unitId);
  await pool.query(`UPDATE vocab_lessons SET run_no = run_no + 1, current_step = 0, run_steps = '[]'::jsonb, run_answers = '{}'::jsonb, last_study_at = NOW()
    WHERE user_id = $1 AND unit_id = $2`, [userId, unitId]);
  return overview(userId, unitId, opts);
}

module.exports = {
  overview, getStep, answerStep, completeStep, restart, buildPlan, recordSense, withClient, unitInfo,
  C2Error, EXP, PASS_PCT, DAILY_CAP, STEP_META, _seedOf: seedOf,
};
