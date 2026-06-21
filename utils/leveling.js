// ระบบ EXP / Level ของ WordQuest
// แต่ละเลเวลใช้ EXP มากขึ้นเรื่อย ๆ (เริ่ม 80 แล้วเพิ่มทีละ 20 ต่อเลเวล)
// เลเวล 1 -> 2 ใช้ 80 EXP, เลเวล 2 -> 3 ใช้ 100 EXP, เลเวล 3 -> 4 ใช้ 120 EXP, ...

const BASE_EXP = 80;
const STEP_EXP = 20;

function expRequiredForLevel(level) {
  // EXP ที่ต้องใช้เพื่อ "ผ่าน" เลเวลนี้ไปเลเวลถัดไป
  return BASE_EXP + (level - 1) * STEP_EXP;
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
function calcReviewExp({ known, isFirstTimeKnown }) {
  if (known) {
    return isFirstTimeKnown ? 15 : 10; // โบนัสครั้งแรกที่จำคำนี้ได้
  }
  return 3; // ให้ EXP เล็กน้อยสำหรับความพยายาม แม้ยังไม่รู้
}

module.exports = { getLevelInfo, calcReviewExp, expRequiredForLevel };
