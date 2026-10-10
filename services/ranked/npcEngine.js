/*
  NPC Engine — ตัดสินว่า NPC ตอบอะไร เมื่อไร (ตรรกะล้วน · สุ่มแบบกำหนด seed · ทดสอบได้)

  ไม่ใช่ Math.random() < accuracy อย่างเดียว: โอกาสตอบถูกคิดจาก
    ทักษะของ NPC ในชนิดคำถามนั้น  ×  ความยากของข้อ (CEFR + ชนิด + ความยากเฉพาะข้อ)  ×  จุดอ่อน/ความถนัด
      logit(p) = logit(skill[type]) − SLOPE · (difficulty − reference) + bias
  reference = ระดับของเกม -> NPC ทำได้ตามค่า skill เมื่อเจอข้อที่ยากเท่าระดับเกม เจอข้อยากกว่าก็พลาดมากขึ้นจริง
  ผลชนะ/แพ้ไม่ถูกกำหนดล่วงหน้า: อัตราชนะเป้าหมายได้จากการปรับ skill ของ NPC เท่านั้น
*/
const { mulberry32 } = require('./rng');
const { RULES } = require('../../config/leagues');

const CEFR_N = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
const TYPE_OFFSET = { vocabulary: 0, grammar: 0.2, context: 0.4, reading: 0.6 };
const SLOPE = 0.9;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** ความยากของข้อ (ตัวเลขต่อเนื่อง) */
function itemDifficulty(q) {
  return (CEFR_N[q.cefr] || 1) + (TYPE_OFFSET[q.type] || 0) + (q.difficultyAdj || 0);
}

/** โอกาสที่ NPC ตอบข้อนี้ถูก */
function correctProbability(npc, q, matchCefr) {
  const skill = clamp(npc.skills[q.type] ?? npc.skills.vocabulary, 0.05, 0.98);
  const reference = (CEFR_N[matchCefr] || CEFR_N[q.cefr] || 1) + (TYPE_OFFSET[q.type] || 0);
  let bias = 0;
  if (npc.preferred === q.type) bias += 0.15;   // ถนัด
  if (npc.weakness === q.type) bias -= 0.15;    // จุดอ่อน
  return clamp(sigmoid(logit(skill) - SLOPE * (itemDifficulty(q) - reference) + bias), 0.03, 0.99);
}

/** เวลาตอบ: กระจายแบบสามเหลี่ยมในช่วงของ NPC + ข้อยากใช้เวลามากขึ้น + มีบางข้อลังเล */
function responseTime(npc, q, matchCefr, rng) {
  const [lo, hi] = npc.responseMs;
  let t = lo + (hi - lo) * ((rng() + rng()) / 2);
  const reference = (CEFR_N[matchCefr] || 1) + (TYPE_OFFSET[q.type] || 0);
  t *= 1 + 0.12 * Math.max(0, itemDifficulty(q) - reference);
  if (q.type === 'reading') t *= 1.25;           // อ่านบทความใช้เวลานานกว่า
  if (rng() < 0.08) t *= 1.35;                    // ลังเลบางข้อ
  return Math.round(clamp(t, lo * 0.85, RULES.questionMs - 600));
}

/** ความคล้ายของสองข้อความ (ใช้เลือกตัวลวงที่ "ใกล้เคียง" เวลาพลาด) */
function similarity(a, b) {
  const x = String(a).toLowerCase(); const y = String(b).toLowerCase();
  let prefix = 0;
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix += 1;
  return prefix * 2 - Math.abs(x.length - y.length);
}

function chooseWrong(npc, q, rng) {
  const wrong = q.choices.map((c, i) => i).filter((i) => i !== q.correctIndex);
  if (npc.mistakePattern === 'first') return wrong[0];
  if (npc.mistakePattern === 'near') {
    const correct = q.choices[q.correctIndex];
    const ranked = [...wrong].sort((a, b) => similarity(q.choices[b], correct) - similarity(q.choices[a], correct));
    return rng() < 0.6 ? ranked[0] : ranked[Math.floor(rng() * ranked.length)];
  }
  return wrong[Math.floor(rng() * wrong.length)];
}

/** แผนคำตอบของ NPC ทั้งเกม (สร้างตอนเริ่มเกม เก็บฝั่งเซิร์ฟเวอร์เท่านั้น) */
function planAnswers(npc, questions, matchCefr, seed) {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  // "ฟอร์มวันนี้": คู่แข่งคนเดิมไม่ได้เล่นเหมือนกันทุกเกม (เฉลี่ยแล้วเท่าเดิม — แค่แกว่งขึ้นลงเล็กน้อยตามสไตล์)
  const formRng = mulberry32(seed ^ 0x2c1b3c6d);
  const amp = npc.form ?? 0;
  const form = amp ? (formRng() - 0.5) * 2 * amp : 0;
  const pace = amp ? 1 + (formRng() - 0.5) * 0.3 : 1;
  return questions.map((q) => {
    const p = clamp(correctProbability(npc, q, matchCefr) + form, 0.03, 0.99);
    const correct = rng() < p;
    return {
      choiceIndex: correct ? q.correctIndex : chooseWrong(npc, q, rng),
      correct,
      responseMs: Math.round(clamp(responseTime(npc, q, matchCefr, rng) * pace, npc.responseMs[0] * 0.75, RULES.questionMs - 600)),
    };
  });
}

module.exports = { planAnswers, correctProbability, responseTime, itemDifficulty, CEFR_N, TYPE_OFFSET };
