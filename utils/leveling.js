// ระบบ EXP / Level ของ EnglishQuest
// แต่ละเลเวลใช้ EXP มากขึ้นแบบเร่งขึ้นเรื่อย ๆ (โตแบบ quadratic ไม่ใช่
// เพิ่มทีละเท่าเดิมแบบเส้นตรงเหมือนเดิม) ยิ่งเลเวลสูง ยิ่งต้องใช้ EXP มากขึ้น
// เร็วกว่าตอนเลเวลต้น ๆ มาก เช่น เลเวล 1->2 ใช้ ~78 EXP แต่เลเวล 35->36
// ใช้เกือบ 4,500 EXP

const BASE_EXP = 60;
const LINEAR_FACTOR = 15;
const QUAD_FACTOR = 3;

function expRequiredForLevel(level) {
  // EXP ที่ต้องใช้เพื่อ "ผ่าน" เลเวลนี้ไปเลเวลถัดไป
  return Math.round(BASE_EXP + LINEAR_FACTOR * level + QUAD_FACTOR * level * level);
}

function getLevelInfo(totalExp) {
  let level = 1;
  let remaining = Math.max(0, totalExp || 0);
  let needed = expRequiredForLevel(level);

  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = expRequiredForLevel(level);
    if (level > 999) break; // safety valve
  }

  return {
    level,
    exp: totalExp,
    expIntoLevel: remaining,
    expForNextLevel: needed,
    progressPercent: Math.round((remaining / needed) * 100),
  };
}

// คำนวณ EXP ที่จะได้รับจากการตอบการ์ดคำศัพท์ 1 ใบ
// EXP จากการ์ดคำศัพท์ (ต่อโหมดอ่าน/ฟัง)
//  ครั้งแรกที่รู้คำนี้ 15 · ทวนคำที่รู้แล้ว 5 · ตอบผิดครั้งแรกที่เจอ 3 · คำที่เพิ่งได้ EXP (cooldown) 0
const EXP_NEW = 15;
const EXP_REVIEW = 5;
const EXP_ATTEMPT = 3;
function calcReviewExp({ known, isFirstTimeKnown, alreadyRewarded = false, onCooldown = false }) {
  if (known && isFirstTimeKnown) return EXP_NEW;   // โบนัสคำใหม่ — ไม่ติด cooldown (เช่น ตอบผิดแล้วแก้ถูกในรอบเดียวกัน)
  if (onCooldown) return 0;
  if (known) return EXP_REVIEW;
  return alreadyRewarded ? 0 : EXP_ATTEMPT;
}

module.exports = { getLevelInfo, calcReviewExp, expRequiredForLevel, EXP_NEW, EXP_REVIEW, EXP_ATTEMPT };
