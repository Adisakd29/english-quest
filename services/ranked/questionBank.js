/*
  Ranked Quest — คลังคำถาม: รวม 4 ชนิดให้อยู่ในรูปแบบเดียว
    { id, type, cefr, prompt, passage?, passageTitle?, choices[4], correctIndex, explain, ref, difficultyAdj }
  แหล่งข้อมูลเดิมของระบบเรียน (ไม่สร้างเนื้อหาแยก):
    vocabulary : คลังคำศัพท์ Oxford + คำแปลไทยที่ใช้ได้ (คำที่รอตรวจไม่ใช้)
    context    : เติมคำในประโยคตัวอย่างของคำศัพท์ (ใหม่)
    grammar    : data/grammar-curriculum (A1–C1, Grammar Battle) · data/grammar.js เป็นสำรอง
    reading    : ข้อแกรมม่าที่มีบทอ่าน
  ทั้งสองฝั่งของเกมได้ชุดคำถามเดียวกันเสมอ · ระดับคำถามอิงจาก CEFR ไม่ใช่แรงค์ (Rank ≠ CEFR)
*/
const pool = require('../../config/db');
const wordStore = require('../../utils/wordStore');
const { getKnownThai } = require('../../utils/thai');
const { getContent } = require('../../utils/vocabContent');
const { GRAMMAR_CHAPTERS } = require('../../data/grammar');
const { QUESTION_MIX, RULES, rankDifficulty } = require('../../config/leagues');
const { mulberry32, shuffle } = require('./rng');
const { curriculumQuestions } = require('./grammarBank');

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GRAMMAR_MODE = { A1: 'basic', A2: 'basic', B1: 'intermediate', B2: 'advanced', C1: 'expert' };
const READING_MODES = { A1: ['basic'], A2: ['basic', 'intermediate'], B1: ['intermediate', 'toeic'], B2: ['toeic', 'advanced'], C1: ['toefl', 'expert', 'toeic'] };

const LETTER_REF = /(ทั้ง\s*(ข้อ\s*)?[A-D]\b|ข้อ\s*[A-D]\b|both [A-D]\b)/i;
// คำไวยากรณ์ (article/pronoun/aux/preposition…) ไม่ใช้เป็นโจทย์เติมคำแบบสุ่ม — ตัวลวงมักถูกได้ด้วย หรือประโยคผิดหลังเติม
const FUNCTION_WORDS = new Set(('a an the this that these those some any each every all both either neither no not and but or nor so yet for because '
  + 'if when while although though since until unless than then as of in on at to from by with about into onto over under up down out off '
  + 'i you he she it we they me him her us them my your his its our their mine yours hers ours theirs who whom whose which what where why how '
  + 'be am is are was were been being do does did done have has had can could may might must shall should will would ought there here very too also just only').split(' '));
const clean = (w) => String(w || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** คำเนื้อหาที่ฝึกได้ในระดับนี้ (ไม่มีคำแปลรอตรวจ) */
async function levelWords(cefr) {
  await wordStore.ready();
  const list = wordStore.getLevelWords(cefr).filter((w) => wordStore.isPlayable(w.id));
  const thai = await getKnownThai(pool, list);
  return { list: list.filter((w) => thai.has(w.id)), thai };
}

function vocabQuestions({ list, thai }, cefr, count, rng, exclude) {
  const pool4 = shuffle(list.filter((w) => !exclude.has(`v:${w.id}`)), rng);
  const out = [];
  for (const w of pool4) {
    if (out.length >= count) break;
    const answer = thai.get(w.id);
    const seen = new Set([answer]);
    const decoys = [];
    for (const d of shuffle(list, rng)) {
      const t = thai.get(d.id);
      if (d.id !== w.id && !seen.has(t)) { seen.add(t); decoys.push(t); }
      if (decoys.length === 3) break;
    }
    if (decoys.length < 3) continue;
    const choices = shuffle([answer, ...decoys], rng);
    out.push({
      id: `v:${w.id}`, type: 'vocabulary', cefr, prompt: clean(w.word), instruction: 'คำนี้แปลว่าอะไร',
      choices, correctIndex: choices.indexOf(answer), explain: `${clean(w.word)} = ${answer}`,
      ref: { wordId: w.id }, difficultyAdj: 0,
    });
  }
  return out;
}

async function contextQuestions({ list, thai }, cefr, count, rng, exclude) {
  if (count <= 0) return [];
  const candidates = shuffle(list.filter((w) => !exclude.has(`c:${w.id}`)), rng).slice(0, count * 8);
  const content = await getContent(candidates.map((w) => w.id));
  const out = [];
  for (const w of candidates) {
    if (out.length >= count) break;
    const head = clean(w.word);
    const ex = content.get(w.id) && content.get(w.id).example;
    if (!ex || head.length < 3 || head.includes(' ') || FUNCTION_WORDS.has(head.toLowerCase())) continue;
    // บริบทสั้นเกินไป (เช่น "a _____ choice") ตัวลวงหมวดเดียวกันเติมได้หลายคำ -> คำตอบไม่ชัด
    if (ex.trim().split(/\s+/).length < 5) continue;
    const re = new RegExp(`\\b${escapeRe(head)}\\b`, 'i');
    if (!re.test(ex)) continue; // ต้องมีคำนี้ตรงตัวในประโยค (ไม่เดารูปผัน)
    const sentence = ex.replace(re, '_____');
    const decoys = shuffle(list.filter((d) => d.id !== w.id && d.category === w.category
      && clean(d.word).toLowerCase() !== head.toLowerCase() && !clean(d.word).includes(' ')), rng)
      .slice(0, 3).map((d) => clean(d.word));
    if (decoys.length < 3) continue;
    const choices = shuffle([head, ...decoys], rng);
    out.push({
      id: `c:${w.id}`, type: 'context', cefr, prompt: sentence, instruction: 'เลือกคำที่เหมาะกับประโยค',
      choices, correctIndex: choices.indexOf(head), explain: `${head} = ${thai.get(w.id) || ''}`.trim(),
      ref: { wordId: w.id }, difficultyAdj: 0,
    });
  }
  return out;
}

function leaksAnswer(q) {
  const ans = String(q.choices[q.correctIndex] || '').trim();
  if (ans.length < 3) return false;
  const has = (c) => new RegExp(`(^|[^A-Za-z])${escapeRe(String(c).trim())}([^A-Za-z]|$)`, 'i').test(q.passage);
  return has(ans) && !q.choices.some((c, k) => k !== q.correctIndex && String(c).trim().length > 2 && has(c));
}

function grammarItems(cefr, withPassage) {
  const modes = withPassage ? READING_MODES[cefr] : [GRAMMAR_MODE[cefr]];
  const items = [];
  for (const ch of GRAMMAR_CHAPTERS) {
    for (const mode of modes) {
      (ch.quiz[mode] || []).forEach((q, i) => {
        const hasPassage = Boolean(q.passage);
        if (hasPassage !== withPassage || !Array.isArray(q.choices) || q.choices.length < 2) return;
        // ตัดข้อที่บทอ่าน "บอกคำตอบเอง" (เช่น หัวเรื่อง MEMO TO ALL EMPLOYEES กับช่องว่าง all ___) — เฉลยหลุด
        if (hasPassage && leaksAnswer(q)) return;
        items.push({ ch, mode, q, i });
      });
    }
  }
  return items;
}

function grammarQuestions(cefr, count, rng, exclude, withPassage) {
  const type = withPassage ? 'reading' : 'grammar';
  const prefix = withPassage ? 'r' : 'g';
  const picked = shuffle(grammarItems(cefr, withPassage), rng)
    .filter(({ ch, mode, i }) => !exclude.has(`${prefix}:${ch.id}:${mode}:${i}`)).slice(0, count);
  return picked.map(({ ch, mode, q, i }) => {
    // สลับตำแหน่งตัวเลือก (คำตอบไม่อยู่ที่เดิมทุกครั้ง) — ยกเว้นข้อที่ตัวเลือกอ้างตัวอักษร (เช่น "ถูกทั้ง A และ C") ต้องคงลำดับเดิม
    const order = LETTER_REF.test(q.choices.join('|')) ? q.choices.map((_, k) => k) : shuffle(q.choices.map((_, k) => k), rng);
    return {
      id: `${prefix}:${ch.id}:${mode}:${i}`, type, cefr,
      prompt: q.question, instruction: withPassage ? 'อ่านแล้วตอบคำถาม' : 'เลือกคำตอบที่ถูกต้อง',
      passage: q.passage || null, passageTitle: q.passageTitle || null,
      choices: order.map((k) => q.choices[k]), correctIndex: order.indexOf(q.correctIndex),
      explain: q.explain || '', ref: { chapterId: ch.id, chapterTitle: ch.title, mode },
      difficultyAdj: ['toeic', 'toefl'].includes(mode) ? 0.3 : 0,
    };
  });
}

/*
  สร้างชุดคำถามของเกม
  cefr    : ระดับภาษาที่ใช้ตั้งคำถาม (จาก Placement ของผู้เล่น)
  tier    : beginner | intermediate | advanced (จาก League) -> สัดส่วนชนิดคำถาม
  exclude : Set ของ id ที่ผู้เล่นเพิ่งเจอ (ลดการเจอข้อซ้ำ)
*/
async function buildMatchQuestions({ cefr, tier, seed, exclude = new Set(), mode = 'vocab', league = null }) {
  const rng = mulberry32(seed);
  const N = RULES.questionsPerMatch;
  const mixes = QUESTION_MIX[mode] || QUESTION_MIX.vocab;
  const mix = mixes[tier] || mixes.beginner;
  // ความยากตามแรงค์ (config/leagues.js · RANK_DIFFICULTY): ระดับขั้นต่ำของแรงค์ + ข้อท้าทายระดับสูงกว่า
  // ไม่ส่ง league (เช่นกิจกรรม/เทสต์เดิม) = ความยากตามระดับผู้เล่นอย่างเดียวแบบเดิม
  const plan = league ? rankDifficulty(league, cefr, mode) : null;
  const level = plan ? plan.level : (CEFR.includes(cefr) ? cefr : 'A1');

  if (mode === 'grammar') {
    // Grammar Battle: คลังแกรมม่า A1–C1 ชุดเดียวกับหน้าเรียน (ตรวจ QA แล้ว) ตามระดับแกรมม่าของผู้เล่น
    // ข้อแบบมีบริบท (บทสนทนา / อีเมล / ข้อความ) แทนบทอ่านเดิม · คลังเดิม (data/grammar.js) เป็นสำรองเมื่อข้อไม่พอเท่านั้น
    const gLevel = level === 'C2' ? 'C1' : level;
    const cur = curriculumQuestions({ level: gLevel, tier, count: N, passage: mix.reading || 0, rng, exclude,
      stretch: plan ? plan.stretch : null, hardBias: plan ? plan.hard : null });
    if (cur.length >= N) return cur.slice(0, N);
    const reading = grammarQuestions(gLevel, mix.reading || 0, rng, exclude, true);
    let grammar = grammarQuestions(gLevel, N - reading.length, rng, exclude, false);
    if (grammar.length < N - reading.length) grammar = grammarQuestions(gLevel, N - reading.length, rng, new Set(), false);
    const all = shuffle([...grammar, ...reading], rng).slice(0, N);
    if (all.length < N) throw new Error('not_enough_questions');
    return all;
  }

  // โหมดคำศัพท์: ข้อท้าทาย (ระดับสูงกว่า) ตามสัดส่วนของแรงค์ + ที่เหลือระดับหลัก
  const nUp = plan && plan.upLevel ? Math.round(N * plan.stretch) : 0;
  const used = new Set();
  const up = nUp ? await vocabSet(plan.upLevel, mix, nUp, rng, exclude, used) : [];
  up.forEach((q) => { q.challenge = true; q.difficultyAdj = (q.difficultyAdj || 0) + 0.2; });
  const main = await vocabSet(level, mix, N - up.length, rng, exclude, used);
  const all = shuffle([...main, ...up], rng).slice(0, N);
  if (all.length < N) throw new Error('not_enough_questions');
  return all;
}

/** ชุดคำถามคำศัพท์ count ข้อ ระดับ level (สัดส่วนตาม mix — ตอนนี้ Ranked ใช้ทายความหมายอย่างเดียว) · used = wordId ที่ใช้แล้วในเกมนี้ (กันคำซ้ำ) */
async function vocabSet(level, mix, count, rng, exclude, used) {
  if (count <= 0) return [];
  // C2: ใช้ตัวสร้างโจทย์ C2 ชุดเดียวกับบทเรียน (ผ่าน validator + กันตัวลวงที่ถูกได้หลายข้อ) · ไม่พอค่อยเติมด้วย C1
  if (level === 'C2') {
    const c2 = (await c2Questions(count, rng, exclude)).filter((q) => !used.has(q.ref.wordId));
    c2.forEach((q) => used.add(q.ref.wordId));
    if (c2.length >= count) return c2.slice(0, count);
    return [...c2, ...await vocabSet('C1', mix, count - c2.length, rng, exclude, used)];
  }
  const words = await levelWords(level);
  const pool = { list: words.list.filter((w) => !used.has(w.id)), thai: words.thai };
  const total = (mix.vocabulary || 0) + (mix.context || 0) || 1;
  const nCtx = Math.round(count * ((mix.context || 0) / total));
  const context = await contextQuestions(pool, level, nCtx, rng, exclude);
  // คำเดียวกันต้องไม่ออกทั้งแบบคำศัพท์และแบบบริบทในเกมเดียว (ข้อหนึ่งจะบอกคำตอบของอีกข้อ)
  context.forEach((q) => used.add(q.ref.wordId));
  const vocabExclude = new Set([...exclude, ...[...used].map((id) => `v:${id}`)]);
  const vocabNeeded = count - context.length;
  let vocab = vocabQuestions(pool, level, vocabNeeded, rng, vocabExclude);
  if (vocab.length < vocabNeeded) {   // ข้อซ้ำจากเกมก่อนดีกว่าเกมไม่ครบ — แต่ยังห้ามซ้ำคำในเกมเดียวกัน
    vocab = vocabQuestions(pool, level, vocabNeeded, rng, new Set([...used].map((id) => `v:${id}`)));
  }
  vocab.forEach((q) => used.add(q.ref.wordId));
  return [...context, ...vocab];
}

/** คำถาม C2 สำหรับ Ranked — ทายความหมายคำ/วลีอย่างเดียว (ไม่มีประโยค อ่านทันเวลาแข่ง)
    ใช้ Core เท่านั้น · ไม่ใช้ "ความหมายขั้นสูงของคำคุ้นเคย" (kind=sense) เพราะไม่มีประโยคแล้วตอบได้หลายความหมาย */
async function c2Questions(count, rng, exclude) {
  const S = require('../vocab/c2Store');
  const I = require('../vocab/c2Items');
  await S.ready();
  const seed = `rk:${Math.floor(rng() * 1e9)}`;
  const out = [];
  for (const s of shuffle(S.all().filter((x) => x.tier === 'core' && x.kind !== 'sense'), rng)) {
    if (out.length >= count) break;
    const it = I.build(s, 'meaning', seed);
    if (!it || exclude.has(`x:${it.id}`)) continue;
    // 4 ตัวเลือกเท่ากับข้ออื่นในเกม (ตัดตัวลวงส่วนเกินออก ไม่แตะคำตอบ)
    const answer = it.choices[it.answer];
    const choices = it.choices.filter((c, i) => i === it.answer || it.choices.slice(0, i + 1).filter((x, j) => j !== it.answer).length <= 3).slice(0, 4);
    out.push({
      id: `x:${it.id}`, type: 'vocabulary', cefr: 'C2',
      prompt: s.form, instruction: 'คำนี้แปลว่าอะไร', passage: null, passageTitle: null,
      choices, correctIndex: choices.indexOf(answer), explain: `${s.form} = ${s.meaningTH || answer}`,
      ref: { wordId: s.id, c2Type: 'meaning' }, difficultyAdj: 0,
    });
  }
  return out;
}

/** ส่วนที่ส่งให้ผู้เล่นได้ (ไม่มีเฉลย / คำอธิบาย) */
function publicQuestion(q, index) {
  return {
    index, type: q.type, cefr: q.cefr, prompt: q.prompt, instruction: q.instruction,
    passage: q.passage || null, passageTitle: q.passageTitle || null, choices: q.choices,
    challenge: Boolean(q.challenge),   // ข้อท้าทาย (ระดับสูงกว่า) ตามความยากของแรงค์
  };
}

module.exports = {
  buildMatchQuestions, publicQuestion, GRAMMAR_MODE,
  // ใช้ซ้ำในด่านกิจกรรม (services/events.js) — แหล่งคำถามเดียวกับระบบเรียน
  levelWords, vocabQuestions, contextQuestions, grammarQuestions, clean, CEFR, c2Questions,
};
