/*
  Coin Economy — ค่ากลางที่เดียว (อย่า hard-code จำนวน Coin ที่อื่น)
  Coin = สกุลเงินในเกม (soft currency) ใช้ซื้อของตกแต่ง Avatar เท่านั้น
    - ได้จากการเรียน/กิจกรรมที่เซิร์ฟเวอร์ตรวจได้เท่านั้น · ไม่มีเงินจริง · ไม่มีกล่องสุ่ม/gacha
    - ห้ามใช้เพิ่ม EXP / Mastery / Rank / คะแนน / ช่วยตอบ / ข้ามบทเรียน / พลังใน Ranked (ไม่มี endpoint ใดทำได้)
    - Coin ≠ EXP: บันทึกแยกกัน (coin_wallets / coin_transactions) · logic EXP เดิมไม่เปลี่ยน

  ประเภทรางวัล (category) — กันฟาร์ม:
    firstCompletion : ได้ครั้งเดียวต่อสิ่งนั้นตลอดไป (key ไม่ซ้ำ)
    mastery         : ได้ครั้งเดียวเมื่อเชี่ยวชาญ
    daily           : ได้ครั้งเดียวต่อวัน (เวลาไทย)
    review          : รางวัลเล็กสำหรับทำซ้ำ/ทบทวน มีเพดานจำนวนครั้งต่อวัน
    weekly          : ครั้งเดียวต่อสัปดาห์
    achievement     : ครั้งเดียวต่อ Achievement
    event           : ของกิจกรรม (ภายหลัง)

  ประมาณการรายได้ (ผู้เรียนสม่ำเสมอ ~20–30 นาที/วัน): บทเรียนใหม่ 1–2 บท (10–30) + เป้าหมายรายวัน 10 + Daily Challenge 15
    + TOEIC/ทบทวน 10–20 ≈ 45–75 Coins/วัน · + Weekly 30 + Achievement เป็นครั้งคราว => ราว 300–450 Coins/สัปดาห์
    ราคาของ (scripts/avatar/catalog.js) ตั้งให้ Common ≈ 1–2 วัน · Rare ≈ 1 สัปดาห์ · Legendary ≈ 1 เดือน — ไม่ต้อง grind หนัก
*/
const WELCOME_COINS = 150;   // ทุกบัญชี (ใหม่และเดิม) ได้ครั้งเดียว — ซื้อของชิ้นแรกได้ทันที

const RULES = {
  WELCOME:          { amount: WELCOME_COINS, category: 'event', th: 'ของขวัญต้อนรับระบบ Avatar' },
  GRAMMAR_LESSON:   { amount: 10, category: 'firstCompletion', th: 'จบบทเรียนแกรมม่าครั้งแรก' },
  C2_LESSON:        { amount: 10, category: 'firstCompletion', th: 'จบบทเรียนคำศัพท์ C2 ครั้งแรก' },
  VOCAB_UNIT:       { amount: 10, category: 'firstCompletion', th: 'ผ่าน Unit Test ครั้งแรก' },
  PERFECT_LESSON:   { amount: 5, category: 'firstCompletion', th: 'บทเรียนเต็มร้อย' },
  WRITING:          { amount: 5, category: 'firstCompletion', th: 'ผ่านแบบฝึกเขียนครั้งแรก' },
  GRAMMAR_MASTERY:  { amount: 20, category: 'mastery', th: 'เชี่ยวชาญบทเรียนแกรมม่า' },
  VOCAB_MASTERY:    { amount: 20, category: 'mastery', th: 'ผ่าน Boss Challenge ครั้งแรก' },
  DAILY_CHALLENGE:  { amount: 15, category: 'daily', th: 'Daily Challenge' },
  DAILY_GOAL:       { amount: 10, category: 'daily', th: 'ทำเป้าหมายรายวันสำเร็จ' },
  WEEKLY_GOAL:      { amount: 30, category: 'weekly', th: 'เป้าหมายรายสัปดาห์ (ทำเป้าหมายรายวันครบ 5 วัน)' },
  TOEIC_PRACTICE:   { amount: 10, category: 'review', dailyLimit: 3, th: 'จบชุดฝึก TOEIC Part 1' },
  TOEIC_MOCK:       { amount: 15, category: 'review', dailyLimit: 1, th: 'จบ TOEIC Mock Test' },
  REVIEW_SESSION:   { amount: 3, category: 'review', dailyLimit: 5, th: 'ทบทวนเต็มร้อย' },
  RANK_PROMOTION:   { amount: 50, category: 'firstCompletion', th: 'เลื่อนแรงค์' },
  ACHIEVEMENT:      { amount: 0, category: 'achievement', th: 'Achievement' },   // จำนวนตาม Achievement
  EVENT_QUEST:      { amount: 0, category: 'event', th: 'เควสต์กิจกรรม' },          // จำนวนตามเควสต์ (config/events.js) · key ไม่ซ้ำต่อเควสต์
  ITEM_PURCHASE:    { amount: 0, category: 'spend', th: 'ซื้อของตกแต่ง' },
  ADMIN_ADJUST:     { amount: 0, category: 'admin', th: 'ผู้ดูแลปรับยอด' },
};

// เชื่อมกับรางวัล EXP เดิมแบบ "ครั้งเดียวต่อ key" (utils/exp.js grantOnce) — EXP logic ไม่เปลี่ยน แค่ได้ Coin เพิ่มเมื่อ key นั้นถูกให้ครั้งแรก
// key ของ Coin = 'x:' + key ของ EXP (ไม่มีวันได้ซ้ำ) · ประเภท review/daily ยังมีเพดานรายวันซ้อนอีกชั้น
const EXP_KEY_RULES = [
  { prefix: 'glc:', rule: 'GRAMMAR_LESSON' },
  { prefix: 'glp:', rule: 'PERFECT_LESSON' },
  { prefix: 'glw:', rule: 'WRITING' },
  { prefix: 'c2c:', rule: 'C2_LESSON' },
  { prefix: 'c2p:', rule: 'PERFECT_LESSON' },
  { prefix: 't1c:', rule: 'TOEIC_PRACTICE' },
  { prefix: 't1m:', rule: 'TOEIC_MOCK' },
  { prefix: 'glxp:', rule: 'REVIEW_SESSION' },
  { prefix: 'c2xp:mixed:', rule: 'REVIEW_SESSION' },
  { prefix: 'c2xp:context:', rule: 'REVIEW_SESSION' },
  { prefix: 'c2xp:daily:', rule: 'DAILY_CHALLENGE', key: (k) => `daily:${k.split(':').pop()}` },   // Daily Challenge: วันละครั้งรวมทุกโหมด
];

// เป้าหมายรายสัปดาห์: ทำเป้าหมายรายวันครบกี่วันใน 1 สัปดาห์ (จันทร์–อาทิตย์ เวลาไทย)
const WEEKLY_GOAL_DAYS = 5;
// เป้าหมายรายวัน = ตอบครบกี่ข้อ (ต้องตรงกับ DAILY_GOAL ใน routes/progress.js)
const DAILY_GOAL_ANSWERS = 20;

module.exports = { WELCOME_COINS, RULES, EXP_KEY_RULES, WEEKLY_GOAL_DAYS, DAILY_GOAL_ANSWERS };
