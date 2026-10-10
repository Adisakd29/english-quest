/*
  สร้างข้อสอบ Unit Test และ Boss Challenge — ตรรกะล้วน ไม่แตะ DB (ทดสอบได้)

  ชนิดคำถามคำศัพท์:
    - 'thai'       : คำภาษาอังกฤษ → เลือกคำแปลไทย (ตรงกับที่ผู้เรียนฝึกใน flashcard)
    - 'definition' : ความหมายภาษาอังกฤษ → เลือกคำ (ใช้เมื่อคำนั้นยังไม่มีคำแปลไทย)
*/
const { definitionGivesAway } = require('./placement');

const UNIT_TEST_SIZE = 10;
const UNIT_PASS = 0.8;
const BOSS_VOCAB = 14;
const BOSS_GRAMMAR = 6;
const BOSS_PASS = 0.7;
const MIN_QUESTIONS = 6; // น้อยกว่านี้ถือว่าสร้างข้อสอบไม่ได้

// โหมดแกรมม่าที่ใช้กับ Boss ของแต่ละระดับ (ประมาณการ เหมือน Placement)
const BOSS_GRAMMAR_MODE = { A1: 'basic', A2: 'basic', B1: 'intermediate', B2: 'advanced', C1: 'expert' };

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

/*
  สร้างคำถามคำศัพท์จากชุดคำเป้าหมาย
  targets      : [{ id, word, level, category, definition, synonyms, senseCount }]
  decoyPool    : คำอื่นในระดับเดียวกัน (ใช้เป็นตัวลวง) รูปแบบเดียวกัน
  thaiMap      : Map(id -> คำแปลไทย) ของทั้ง targets และ decoyPool
  count        : จำนวนข้อที่ต้องการ
*/
function buildVocabQuestions(targets, decoyPool, thaiMap, count, rng) {
  const questions = [];
  const allThai = [...new Set([...thaiMap.values()])];

  for (const t of shuffle(targets, rng)) {
    if (questions.length >= count) break;
    const thai = thaiMap.get(t.id);

    // 1) คำ → คำแปลไทย (เลือกก่อน เพราะตรงกับที่ฝึกมา)
    if (thai) {
      const decoys = shuffle(allThai.filter((x) => x !== thai), rng).slice(0, 3);
      if (decoys.length === 3) {
        const choices = shuffle([thai, ...decoys], rng);
        questions.push({
          skill: 'vocab', kind: 'thai', wordId: t.id, level: t.level,
          prompt: clean(t.word), choices, correctIndex: choices.indexOf(thai),
        });
        continue;
      }
    }

    // 2) ความหมาย → คำ (ใช้เมื่อไม่มีคำแปลไทย) — ข้ามคำที่ความหมายเฉลยตัวเอง
    const lemma = clean(t.word);
    if (t.definition && !definitionGivesAway(lemma, t.definition)) {
      const synonyms = new Set((t.synonyms || []).map((x) => x.toLowerCase()));
      const decoys = shuffle(decoyPool.filter((d) => {
        const dl = clean(d.word).toLowerCase();
        return d.id !== t.id && d.category === t.category
          && dl !== lemma.toLowerCase() && !synonyms.has(dl);
      }), rng).slice(0, 3);
      if (decoys.length === 3) {
        const options = shuffle([t, ...decoys], rng);
        questions.push({
          skill: 'vocab', kind: 'definition', wordId: t.id, level: t.level,
          prompt: t.definition,
          choices: options.map((o) => clean(o.word)),
          correctIndex: options.findIndex((o) => o.id === t.id),
        });
      }
    }
  }
  return questions;
}

// ให้คะแนน: คำตอบที่ไม่ใช่เลขในช่วงตัวเลือก ถือว่าผิด
function scoreAssessment(questions, answers, passRatio) {
  const perQuestion = questions.map((q, i) => {
    const a = answers[i];
    const chosen = Number.isInteger(a) && a >= 0 && a < q.choices.length ? a : null;
    return { chosen, correct: chosen === q.correctIndex };
  });
  const correct = perQuestion.filter((x) => x.correct).length;
  const total = questions.length;
  return {
    correct,
    total,
    percent: total ? Math.round((correct / total) * 100) : 0,
    passed: total > 0 && correct / total >= passRatio,
    perQuestion,
  };
}

module.exports = {
  buildVocabQuestions,
  scoreAssessment,
  shuffle,
  UNIT_TEST_SIZE, UNIT_PASS, BOSS_VOCAB, BOSS_GRAMMAR, BOSS_PASS, MIN_QUESTIONS, BOSS_GRAMMAR_MODE,
};
