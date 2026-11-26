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
const BOSS_GRAMMAR_MODE = { A1: 'basic', A2: 'basic', B1: 'intermediate', B2: 'advanced', C1: 'expert', C2: 'expert' };

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
const CHOICES = 5; // ตัวเลือกต่อข้อ (1 ถูก + 4 ตัวลวง) — ลดโอกาสเดาถูกจาก 25% เหลือ 20%

// คำแปลไทย "ใกล้กันเกินไป" (ซ้ำ/ซ้อนกัน/ใช้ตัวอักษรคู่เดียวกันเกินครึ่ง) — ห้ามเป็นตัวลวงของกันและกัน กันข้อที่ถูกได้สองตัว
function thaiBigrams(s) { const t = String(s || '').replace(/[\s/(),.·;:-]/g, ''); const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; }
function thaiTooClose(a, b) {
  const x = String(a || '').trim(); const y = String(b || '').trim();
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)))) return true;
  const A = thaiBigrams(x); const B = thaiBigrams(y);
  if (!A.size || !B.size) return false;
  let n = 0; for (const g of A) if (B.has(g)) n += 1;
  return n / Math.min(A.size, B.size) >= 0.5;
}

/*
  เลือกตัวลวง: ชนิดคำเดียวกันก่อน (เดาจากชนิดคำไม่ได้) แล้วค่อยขยาย
  กรอง: คำเดียวกัน (sense อื่นของคำเดิม) · คำพ้องความหมาย · คำแปลใกล้เคียงกับเฉลยหรือกับตัวลวงตัวอื่น
*/
function pickDecoys(t, candidates, n, rng, textOf) {
  const lemma = clean(t.word).toLowerCase();
  const synonyms = new Set((t.synonyms || []).map((x) => String(x).toLowerCase()));
  const answer = textOf(t);
  const ok = candidates.filter((d) => {
    const dl = clean(d.word).toLowerCase();
    return d.id !== t.id && dl !== lemma && !synonyms.has(dl) && textOf(d) && !thaiTooClose(textOf(d), answer);
  });
  const same = shuffle(ok.filter((d) => d.category === t.category), rng);
  const other = shuffle(ok.filter((d) => d.category !== t.category), rng);
  const out = [];
  for (const d of [...same, ...other]) {
    if (out.length >= n) break;
    if (out.some((o) => thaiTooClose(textOf(o), textOf(d)) || clean(o.word).toLowerCase() === clean(d.word).toLowerCase())) continue;
    out.push(d);
  }
  return out;
}

function buildVocabQuestions(targets, decoyPool, thaiMap, count, rng) {
  const questions = [];
  const everyone = [...targets, ...decoyPool];
  const thaiOf = (w) => thaiMap.get(w.id);

  for (const t of shuffle(targets, rng)) {
    if (questions.length >= count) break;
    const thai = thaiMap.get(t.id);

    // 1) คำ → คำแปลไทย (เลือกก่อน เพราะตรงกับที่ฝึกมา)
    if (thai) {
      const decoys = pickDecoys(t, everyone, CHOICES - 1, rng, thaiOf).map(thaiOf);
      if (decoys.length >= 3) {          // คลังเล็กมาก (เช่น Unit สั้น) ยอมเหลือ 4 ตัวเลือก ดีกว่าใส่ตัวลวงที่ถูกได้
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
      const decoys = pickDecoys(t, decoyPool.filter((d) => d.category === t.category), CHOICES - 1, rng, (w) => clean(w.word));
      if (decoys.length >= 3) {
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
  CHOICES, thaiTooClose, pickDecoys,
  buildVocabQuestions,
  scoreAssessment,
  shuffle,
  UNIT_TEST_SIZE, UNIT_PASS, BOSS_VOCAB, BOSS_GRAMMAR, BOSS_PASS, MIN_QUESTIONS, BOSS_GRAMMAR_MODE,
};
