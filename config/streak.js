/*
  Learning Streak (v1.18.0) — ค่ากลางที่เดียว
  - นับ 1 วัน = ทำเป้าหมายรายวันครบ (ตอบครบ DAILY_GOAL_ANSWERS ข้อในวันนั้น ตามเวลาไทย) — เกณฑ์เดียวกับ Coin เป้าหมายรายวันเดิม
  - Streak Freeze: ซื้อด้วย Coin · ถือได้สูงสุด MAX_FREEZES · ระบบใช้ให้อัตโนมัติเมื่อขาด 1 วัน (ขาดกี่วันใช้เท่านั้น ถ้ามีพอ)
    ใช้ได้เฉพาะวันที่ขาด "หลังจาก" ซื้อแล้ว (ซื้อย้อนหลังมาซ่อม streak ที่ขาดไปแล้วไม่ได้)
  - Milestone: ได้ครั้งเดียวต่อระดับตลอดไป (Coin + EXP + ตราบนโปรไฟล์) — ไม่มีผลต่อ Rank/คะแนน
*/
const { DAILY_GOAL_ANSWERS } = require('./coinRewards');

const FREEZE_PRICE = 50;
const MAX_FREEZES = 2;

// tier = สีของตรา (public/assets/badges/streak.svg)
const MILESTONES = [
  { days: 3,   coins: 15,   exp: 30,   tier: 'ember',   name: 'Spark',        nameTh: 'ประกายไฟ' },
  { days: 7,   coins: 40,   exp: 70,   tier: 'bronze',  name: 'One Week',     nameTh: 'ครบหนึ่งสัปดาห์' },
  { days: 14,  coins: 70,   exp: 120,  tier: 'silver',  name: 'Steady Flame', nameTh: 'เปลวไฟมั่นคง' },
  { days: 30,  coins: 150,  exp: 250,  tier: 'gold',    name: 'Month Master', nameTh: 'เรียนครบเดือน' },
  { days: 60,  coins: 250,  exp: 400,  tier: 'sapphire', name: 'Blue Flame',  nameTh: 'เปลวไฟสีคราม' },
  { days: 100, coins: 400,  exp: 600,  tier: 'amethyst', name: 'Century',     nameTh: 'ร้อยวันไม่หยุด' },
  { days: 365, coins: 1000, exp: 1500, tier: 'legend',  name: 'Year of Fire', nameTh: 'ตำนานหนึ่งปี' },
];

module.exports = { GOAL: DAILY_GOAL_ANSWERS, FREEZE_PRICE, MAX_FREEZES, MILESTONES, CALENDAR_DAYS: 28 };
