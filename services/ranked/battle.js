/*
  Battle HP — ตรรกะล้วน (ไม่แตะ DB · ทดสอบได้ครบ) ใช้ร่วมกันทั้งเกม NPC / 1v1 / ทีม 2v2
    - ตอบถูก  -> ฝั่งตรงข้ามเสีย HP (Damage ตามความยากของข้อ + Combo เล็กน้อย)
    - ตอบผิด / หมดเวลา -> ฝั่งตัวเองเสีย HP (Damage พื้นฐาน ไม่มี Combo)
    - ทุกคำตอบในข้อเดียวกันมีผลพร้อมกัน · ต่อข้อแต่ละฝั่งเสียไม่เกินหนึ่งครั้ง (ค่าที่มากกว่า) · clamp ที่ 0 (ไม่มี HP ติดลบ)
    - ความเร็วไม่มีผลกับ Damage เลย
  "side" = ฝั่งที่มี HP ร่วมกัน (1v1: side = slot · ทีม: side = team)
  ปิดระบบ HP ได้ที่ config/battle.js (hpEnabled = false): ไม่มี Damage ไม่มี KO เล่นครบทุกข้อ
  แล้วตัดสินด้วย ความแม่นยำ -> Battle Score -> เวลาเฉลี่ย -> เสมอ
*/
const { BATTLE, difficultyOf } = require('../../config/battle');

function newHpState(sides = 2) {
  return { hp: Array(sides).fill(BATTLE.initialHp), min: Array(sides).fill(BATTLE.initialHp), streak: {} };
}

/** Damage ของคำตอบหนึ่งคำตอบ (streakAfter = จำนวนข้อที่ถูกติดกันรวมข้อนี้) */
function damageFor(q, correct, streakAfter = 0, scale = 1) {
  const base = BATTLE.damage[difficultyOf(q)];
  const bonus = correct ? Math.min(BATTLE.comboBonusMax, Math.max(0, streakAfter - 1) * BATTLE.comboBonusPerStreak) : 0;
  return Math.max(1, Math.round((base + bonus) * scale));
}

/**
  คิดผลของหนึ่งข้อ
  state   : { hp: [..], min: [..], streak: { [slot]: n } }
  answers : [{ slot, side, correct, neutral }]  neutral = ผู้เล่นที่ออกจากเกมไปแล้ว (ไม่ทำ/ไม่รับ Damage)
  คืน      : { state, hits: [{ slot, side, correct, damage, target }], taken: [HP ที่เสียจริงต่อฝั่ง], ko }
*/
const hpOn = () => BATTLE.hpEnabled !== false;

function resolveQuestion(state, q, answers, { scale = 1 } = {}) {
  if (!hpOn()) {            // ระบบ HP ปิดอยู่ -> ไม่มีผลกับเกม
    return { state, hits: answers.map((a) => ({ slot: a.slot, side: a.side, correct: Boolean(a.correct) && !a.neutral, damage: 0, target: null })),
      taken: state.hp.map(() => 0), ko: false };
  }
  const hp = [...state.hp];
  const min = [...(state.min || state.hp)];
  const streak = { ...state.streak };
  const sides = hp.length;
  const hits = [];
  for (const a of answers) {
    if (a.neutral) { hits.push({ slot: a.slot, side: a.side, correct: false, damage: 0, target: null }); continue; }
    const key = String(a.slot);
    streak[key] = a.correct ? (streak[key] || 0) + 1 : 0;
    const damage = damageFor(q, a.correct, streak[key], scale);
    const target = a.correct ? (a.side + 1) % sides : a.side;   // 2 ฝั่งเสมอ
    hits.push({ slot: a.slot, side: a.side, correct: Boolean(a.correct), damage, target });
  }
  // แต่ละฝั่งเสีย HP ได้ไม่เกิน "หนึ่งข้อ" ต่อข้อ: max(Damage จากคำตอบถูกของคู่แข่ง, Damage จากคำตอบผิดของตัวเอง)
  // เช่น A ถูก + B ผิด -> B เสีย 12 (ไม่ใช่ 24) ตามตัวอย่างในสเปก · ทั้งคู่ผิด = เสียทั้งคู่ · ทั้งคู่ถูก = เสียทั้งคู่
  const taken = Array(sides).fill(0);
  for (let i = 0; i < sides; i += 1) {
    const fromOpp = hits.filter((h) => h.target === i && h.side !== i).reduce((x, h) => x + h.damage, 0);
    const fromSelf = hits.filter((h) => h.target === i && h.side === i).reduce((x, h) => x + h.damage, 0);
    taken[i] = Math.min(hp[i], Math.max(fromOpp, fromSelf));
    hp[i] -= taken[i];
    min[i] = Math.min(min[i], hp[i]);
  }
  return { state: { hp, min, streak }, hits, taken, ko: hp.some((x) => x === 0) };
}

/**
  ตัดสินผลเมื่อเกมจบ (HP เป็น 0 หรือครบทุกข้อ)
  sides: [{ hp, correct, answered, score, avgMs }]  (2 ฝั่ง)
  ลำดับ: HP ที่เหลือ -> ความแม่นยำ -> Battle Score -> เวลาตอบเฉลี่ย (น้อยกว่าดีกว่า) -> เสมอ
  คืน { winner: 0 | 1 | null, reason: 'hp_zero' | 'questions_complete' | 'draw', decidedBy }
*/
function decide(sides) {
  const [a, b] = sides;
  const acc = (s) => (s.answered ? s.correct / s.answered : 0);
  const ms = (s) => (s.avgMs === null || s.avgMs === undefined ? Infinity : s.avgMs);
  const ko = a.hp === 0 || b.hp === 0;
  const checks = [
    ['hp', a.hp - b.hp],
    ['accuracy', acc(a) - acc(b)],
    ['score', a.score - b.score],
    ['speed', ms(b) - ms(a)],
  ];
  for (const [by, diff] of checks) {
    if (Number.isFinite(diff) && diff !== 0) return { winner: diff > 0 ? 0 : 1, reason: ko ? 'hp_zero' : 'questions_complete', decidedBy: by };
    if (!Number.isFinite(diff) && !Number.isNaN(diff)) return { winner: diff > 0 ? 0 : 1, reason: ko ? 'hp_zero' : 'questions_complete', decidedBy: by };
  }
  return { winner: null, reason: 'draw', decidedBy: null };
}

/** ฝั่งนี้นำอยู่ไหม (ใช้แยก "หลุดเพราะเน็ต" ออกจาก "หนีตอนกำลังแพ้") — ใช้ HP ถ้าเปิดระบบ HP ไม่งั้นใช้คะแนน */
const isLeading = (hpMine, hpOpp, scoreMine, scoreOpp) => (hpOn() ? hpMine > hpOpp : scoreMine > scoreOpp);

const isCritical = (hp) => hp > 0 && hp < BATTLE.initialHp * BATTLE.criticalHpRatio;

module.exports = { newHpState, damageFor, resolveQuestion, decide, isCritical, isLeading, hpOn };
