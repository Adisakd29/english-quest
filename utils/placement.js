/*
  แบบทดสอบวัดระดับ (Placement Test) — ส่วนตรรกะล้วน ไม่แตะ DB
  แยกออกมาเพื่อให้ทดสอบได้ง่าย (ส่ง rng เข้ามาเองได้ ผลจึงคาดเดาได้ตอนทดสอบ)

  ผลลัพธ์เป็น "Estimated CEFR Level" เท่านั้น ไม่ใช่การรับรอง CEFR อย่างเป็นทางการ
*/

const VOCAB_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const VOCAB_PER_LEVEL = 3;
const VOCAB_PASS = 2; // ต้องถูก ≥ 2 จาก 3

// แมปโหมดแกรมม่าเดิมเป็นระดับโดยประมาณ (บทเรียนเดิมไม่ได้แบ่งตาม CEFR)
// basic ใช้แทน A2 — แยก A1/A2 ด้านแกรมม่าไม่ได้ ถ้าไม่ผ่าน basic จะประเมินเป็น A1
const GRAMMAR_BANDS = [
  { level: 'A2', mode: 'basic' },
  { level: 'B1', mode: 'intermediate' },
  { level: 'B2', mode: 'advanced' },
  { level: 'C1', mode: 'expert' },
];
const GRAMMAR_PER_BAND = 4;
const GRAMMAR_PASS = 3; // ต้องถูก ≥ 3 จาก 4

const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clean(word) {
  return String(word).replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
}

// ความหมายมีตัวคำอยู่ข้างใน = เฉลยตัวเอง (เช่น worship / "the activity of worshipping")
function definitionGivesAway(lemma, definition) {
  const l = lemma.toLowerCase();
  const stem = l.length > 4 ? l.slice(0, l.length - 2) : l;
  return String(definition).toLowerCase().split(/[^a-z]+/).some((t) => t === l || (stem.length >= 4 && t.startsWith(stem)));
}

/*
  สร้างข้อสอบคำศัพท์
  candidates: [{ id, word, category, level, definition, synonyms, senseCount }]
  เลือกเฉพาะคำที่ "ความหมายน้อย" (senseCount ≤ 3) หรือตรวจแล้ว เพื่อให้ความหมายตรงความหมายหลัก
*/
function buildVocabQuestions(candidates, rng) {
  const questions = [];
  for (const level of VOCAB_LEVELS) {
    const pool = candidates.filter((w) => w.level === level
      && w.definition
      && /^[a-zA-Z]+$/.test(clean(w.word))               // คำเดียว ไม่มีช่องว่าง/ขีด
      && (w.reviewed || (w.senseCount && w.senseCount <= 3))
      && !definitionGivesAway(clean(w.word), w.definition));

    const targets = shuffle(pool, rng).slice(0, VOCAB_PER_LEVEL);
    for (const t of targets) {
      const tLemma = clean(t.word).toLowerCase();
      const synonyms = new Set((t.synonyms || []).map((s) => s.toLowerCase()));
      // ตัวลวง: ระดับเดียวกัน ชนิดคำเดียวกัน ไม่ใช่คำพ้องความหมายของเฉลย
      const decoys = shuffle(pool.filter((d) => {
        const dl = clean(d.word).toLowerCase();
        return d.id !== t.id && d.category === t.category && dl !== tLemma && !synonyms.has(dl);
      }), rng).slice(0, 3);
      if (decoys.length < 3) continue;

      const options = shuffle([t, ...decoys], rng);
      questions.push({
        skill: 'vocab',
        level,
        prompt: t.definition,
        choices: options.map((o) => clean(o.word)),
        correctIndex: options.findIndex((o) => o.id === t.id),
      });
    }
  }
  return questions;
}

/*
  สร้างข้อสอบแกรมม่าจาก grammar.js
  ไม่สลับลำดับตัวเลือก เพราะบางข้อมีตัวเลือกที่อ้างถึงตัวเลือกอื่น (เช่น "ถูกทุกข้อ")
*/
function buildGrammarQuestions(chapters, rng, { modes = null, perBand = GRAMMAR_PER_BAND } = {}) {
  const questions = [];
  const bands = modes ? GRAMMAR_BANDS.filter((b) => modes.includes(b.mode)) : GRAMMAR_BANDS;
  for (const band of bands) {
    const pool = chapters.flatMap((c) => (c.quiz[band.mode] || [])
      .filter((q) => !q.passage && Array.isArray(q.choices) && q.choices.length >= 2)
      .map((q) => ({ ...q, chapterId: c.id })));
    // กระจายข้ามบท: สุ่มแล้วเลือกไม่ให้ซ้ำบทเดียวกันก่อน
    const picked = [];
    const usedChapters = new Set();
    for (const q of shuffle(pool, rng)) {
      if (picked.length >= perBand) break;
      if (usedChapters.has(q.chapterId)) continue;
      picked.push(q);
      usedChapters.add(q.chapterId);
    }
    for (const q of picked) {
      questions.push({
        skill: 'grammar',
        level: band.level,
        chapterId: q.chapterId, // ใช้บันทึกลง answer_events (Mastery แกรมม่า)
        prompt: q.question,
        choices: q.choices,
        correctIndex: q.correctIndex,
      });
    }
  }
  return questions;
}

/*
  หาระดับที่ "ผ่านต่อเนื่องจากล่างขึ้นบน"
  levelResults: { A1: {correct, total}, ... } ตามลำดับ levels
  คืนระดับสูงสุดที่ผ่านติดกันจากระดับแรก หรือ null ถ้าไม่ผ่านระดับแรก
*/
function highestConsecutive(levels, levelResults, passMark) {
  let reached = null;
  for (const lvl of levels) {
    const r = levelResults[lvl];
    if (!r || r.total === 0 || r.correct < passMark) break;
    reached = lvl;
  }
  return reached;
}

/*
  ให้คะแนนและประเมินระดับ
  questions: ข้อสอบพร้อม correctIndex (จากฝั่งเซิร์ฟเวอร์), answers: index ที่ผู้ใช้เลือก
*/
function scorePlacement(questions, answers) {
  const tally = { vocab: {}, grammar: {} };
  let correctTotal = 0;
  questions.forEach((q, i) => {
    const bucket = tally[q.skill];
    bucket[q.level] = bucket[q.level] || { correct: 0, total: 0 };
    bucket[q.level].total += 1;
    if (answers[i] === q.correctIndex) {
      bucket[q.level].correct += 1;
      correctTotal += 1;
    }
  });

  const vocabLevel = highestConsecutive(VOCAB_LEVELS, tally.vocab, VOCAB_PASS);
  const grammarBand = highestConsecutive(GRAMMAR_BANDS.map((b) => b.level), tally.grammar, GRAMMAR_PASS);

  // ไม่ผ่านระดับแรกเลย: คำศัพท์ = ต่ำกว่า A1, แกรมม่า = A1 (เพราะแถบแรกคือ A2)
  const vocab = vocabLevel || 'Pre-A1';
  const grammar = grammarBand || 'A1';

  // Overall: เฉลี่ยลำดับระดับแล้วปัดลง (ประเมินแบบระมัดระวัง ไม่ให้สูงเกินจริง)
  const idx = (l) => (l === 'Pre-A1' ? -1 : ORDER.indexOf(l));
  const avg = Math.floor((idx(vocab) + idx(grammar)) / 2);
  const overall = avg < 0 ? 'Pre-A1' : ORDER[avg];
  const recommendedStart = overall === 'Pre-A1' ? 'A1' : overall;

  return {
    overall,
    vocab,
    grammar,
    recommendedStart,
    correct: correctTotal,
    total: questions.length,
    breakdown: tally,
  };
}

/*
  วิเคราะห์จุดแข็ง / จุดที่ควรฝึก จากคำตอบจริงเท่านั้น
  - จุดแข็ง: ระดับที่ตอบถูก >= 80% (เรียงจากระดับสูง)
  - ควรฝึก: ระดับคำศัพท์ถัดจากระดับที่ผ่าน + บทแกรมม่าที่ตอบผิด/ข้าม
  chapterTitles: { chapterId: 'ชื่อบท' }
*/
const STRENGTH_RATE = 0.8;
function analyzePlacement(questions, answers, result, chapterTitles = {}) {
  const SKILL_TH = { vocab: 'คำศัพท์', grammar: 'แกรมม่า' };
  const strengths = [];
  for (const skill of ['vocab', 'grammar']) {
    Object.entries(result.breakdown[skill] || {})
      .filter(([, t]) => t.total > 0 && t.correct / t.total >= STRENGTH_RATE)
      .sort((a, b) => ORDER.indexOf(b[0]) - ORDER.indexOf(a[0]))
      .slice(0, 2)
      .forEach(([lvl, t]) => strengths.push(`${SKILL_TH[skill]}ระดับ ${lvl} (ถูก ${t.correct}/${t.total})`));
  }
  const practice = [];
  // คำศัพท์: ระดับถัดไปที่ยังไม่ผ่าน
  const vIdx = result.vocab === 'Pre-A1' ? -1 : VOCAB_LEVELS.indexOf(result.vocab);
  const nextV = VOCAB_LEVELS[vIdx + 1];
  const nextT = nextV && result.breakdown.vocab[nextV];
  if (nextT) practice.push(`คำศัพท์ระดับ ${nextV} (ถูก ${nextT.correct}/${nextT.total})`);
  // แกรมม่า: บทที่ตอบผิดหรือข้าม (ไม่ซ้ำ)
  const missed = new Set();
  questions.forEach((q, i) => {
    if (q.skill === 'grammar' && answers[i] !== q.correctIndex && q.chapterId && chapterTitles[q.chapterId]) {
      missed.add(chapterTitles[q.chapterId]);
    }
  });
  [...missed].slice(0, 3).forEach((t) => practice.push(`แกรมม่า: ${t}`));
  return { strengths, practice };
}

module.exports = {
  analyzePlacement,
  buildVocabQuestions,
  buildGrammarQuestions,
  scorePlacement,
  highestConsecutive,
  definitionGivesAway,
  VOCAB_LEVELS,
  GRAMMAR_BANDS,
};
