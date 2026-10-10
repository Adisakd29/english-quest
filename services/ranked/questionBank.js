/*
  Ranked Quest — คลังคำถาม: รวม 4 ชนิดให้อยู่ในรูปแบบเดียว
    { id, type, cefr, prompt, passage?, passageTitle?, choices[4], correctIndex, explain, ref, difficultyAdj }
  แหล่งข้อมูลเดิมของระบบเรียน (ไม่สร้างเนื้อหาแยก):
    vocabulary : คลังคำศัพท์ Oxford + คำแปลไทยที่ใช้ได้ (คำที่รอตรวจไม่ใช้)
    context    : เติมคำในประโยคตัวอย่างของคำศัพท์ (ใหม่)
    grammar    : data/grammar.js (โหมดตาม CEFR)
    reading    : ข้อแกรมม่าที่มีบทอ่าน
  ทั้งสองฝั่งของเกมได้ชุดคำถามเดียวกันเสมอ · ระดับคำถามอิงจาก CEFR ไม่ใช่แรงค์ (Rank ≠ CEFR)
*/
const pool = require('../../config/db');
const wordStore = require('../../utils/wordStore');
const { getKnownThai } = require('../../utils/thai');
const { getContent } = require('../../utils/vocabContent');
const { GRAMMAR_CHAPTERS } = require('../../data/grammar');
const { QUESTION_MIX, RULES } = require('../../config/leagues');
const { mulberry32, shuffle } = require('./rng');

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1'];
const GRAMMAR_MODE = { A1: 'basic', A2: 'basic', B1: 'intermediate', B2: 'advanced', C1: 'expert' };
const READING_MODES = { A1: ['basic'], A2: ['basic', 'intermediate'], B1: ['intermediate', 'toeic'], B2: ['toeic', 'advanced'], C1: ['toefl', 'expert', 'toeic'] };

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
    if (!ex || head.length < 3 || head.includes(' ')) continue;
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
    // สลับตำแหน่งตัวเลือก (คำตอบไม่อยู่ที่เดิมทุกครั้ง)
    const order = shuffle(q.choices.map((_, k) => k), rng);
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
async function buildMatchQuestions({ cefr, tier, seed, exclude = new Set(), mode = 'vocab' }) {
  const level = CEFR.includes(cefr) ? cefr : 'A1';
  const rng = mulberry32(seed);
  const N = RULES.questionsPerMatch;
  const mixes = QUESTION_MIX[mode] || QUESTION_MIX.vocab;
  const mix = mixes[tier] || mixes.beginner;

  if (mode === 'grammar') {
    // โหมดแกรมม่า: ข้อแกรมม่า + บทอ่าน (ระดับ CEFR ของผู้เล่น) — บทอ่านไม่พอ เติมด้วยแกรมม่า
    const reading = grammarQuestions(level, mix.reading || 0, rng, exclude, true);
    let grammar = grammarQuestions(level, N - reading.length, rng, exclude, false);
    if (grammar.length < N - reading.length) grammar = grammarQuestions(level, N - reading.length, rng, new Set(), false);
    const all = shuffle([...grammar, ...reading], rng).slice(0, N);
    if (all.length < N) throw new Error('not_enough_questions');
    return all;
  }

  // โหมดคำศัพท์: คำแปล + เติมคำในบริบท
  const words = await levelWords(level);
  const context = await contextQuestions(words, level, mix.context || 0, rng, exclude);
  // คำเดียวกันต้องไม่ออกทั้งแบบคำศัพท์และแบบบริบทในเกมเดียว (ข้อหนึ่งจะบอกคำตอบของอีกข้อ)
  const usedWords = new Set(context.map((q) => q.ref.wordId));
  const vocabExclude = new Set([...exclude, ...[...usedWords].map((id) => `v:${id}`)]);
  const vocabNeeded = N - context.length;
  let vocab = vocabQuestions(words, level, vocabNeeded, rng, vocabExclude);
  if (vocab.length < vocabNeeded) {   // ข้อซ้ำจากเกมก่อนดีกว่าเกมไม่ครบ — แต่ยังห้ามซ้ำคำในเกมเดียวกัน
    vocab = vocabQuestions(words, level, vocabNeeded, rng, new Set([...usedWords].map((id) => `v:${id}`)));
  }
  const all = shuffle([...vocab, ...context], rng).slice(0, N);
  if (all.length < N) throw new Error('not_enough_questions');
  return all;
}

/** ส่วนที่ส่งให้ผู้เล่นได้ (ไม่มีเฉลย / คำอธิบาย) */
function publicQuestion(q, index) {
  return {
    index, type: q.type, cefr: q.cefr, prompt: q.prompt, instruction: q.instruction,
    passage: q.passage || null, passageTitle: q.passageTitle || null, choices: q.choices,
  };
}

module.exports = {
  buildMatchQuestions, publicQuestion, GRAMMAR_MODE,
  // ใช้ซ้ำในด่านกิจกรรม (services/events.js) — แหล่งคำถามเดียวกับระบบเรียน
  levelWords, vocabQuestions, contextQuestions, grammarQuestions, clean, CEFR,
};
