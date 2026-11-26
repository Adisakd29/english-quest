/*
  Christmas 2026 — "A Magical Christmas" (event christmas-2026) · ค่ากลางที่เดียว (ราคา/รางวัล/เควสต์ อ่านจากไฟล์นี้ฝั่งเซิร์ฟเวอร์เท่านั้น)
  เวลา: Asia/Bangkok · เปิด 25 พ.ย. 2569 00:00 → จบ 31 ธ.ค. 2569 23:59 · รับรางวัล/ใช้ Token ในร้านได้ถึง 7 ม.ค. 2570 23:59
  ผู้ดูแลแก้วันเวลา / เปิด-ปิด Feature Flag / ค่า Token ได้จากหน้าแอดมิน (ตาราง season_settings) โดยไม่ต้อง deploy ใหม่
  — ค่าในไฟล์นี้คือ "ค่าเริ่มต้น" เมื่อยังไม่มีแถวในฐานข้อมูล

  หลักการ (ตามคำขอเจ้าของโปรเจกต์ ข้อ 3): ทุกกิจกรรมผูกกับการเรียนจริง
    - เช็กอินรายวัน: ต้องตอบถูกอย่างน้อย CHECKIN_MIN_CORRECT ข้อในวันนั้น (นับจาก answer_events ฝั่งเซิร์ฟเวอร์) ก่อนจึงเปิดกล่องของขวัญได้
    - เควสต์รายวัน: นับจากข้อมูลการเรียนจริงของวันนั้น (คำศัพท์ · แกรมม่า · การฟัง · การอ่าน · ความแม่นยำ · พูด)
    - ไม่มีปุ่ม "กดรับฟรี" ใด ๆ นอกจากของขวัญต้อนรับครั้งเดียว (ซึ่งเป็นของจริงที่บันทึกในบัญชี)
  ไม่บังคับต่อเนื่อง (no forced streak): ขาดวันได้ ไม่รีเซ็ต · Token สะสมไม่หาย (จนจบช่วงใช้ร้าน)
*/
const EVENT_ID = 'christmas-2026';

const DEFAULTS = {
  startsAt: '2026-11-25T00:00:00+07:00',
  endsAt: '2027-01-01T00:00:00+07:00',          // จบ 31 ธ.ค. 23:59:59
  claimUntil: '2027-01-08T00:00:00+07:00',      // รับรางวัล/ใช้ร้านได้ถึง 7 ม.ค. 23:59:59
  // P0 เปิด · P1/P2 ปิดไว้จนกว่าจะทำเสร็จและทดสอบแล้ว (ไม่มีปุ่มหลอก)
  flags: {
    christmas_theme: true, christmas_snow: true, christmas_music: true, christmas_quests: true, christmas_checkin: true,
    christmas_rewards: true, christmas_shop: true, christmas_avatar_items: true,
    christmas_advent: true, christmas_boss: true, christmas_photobooth: true,
    christmas_story: false,   // เนื้อเรื่องร่างโดย AI → เปิดได้หลังผู้ดูแลอนุมัติครบทุกตอนเท่านั้น (services/christmasPlay.js storyApproved)
  },
  tokens: { checkin: 10, starter: 30 },
};
const FLAG_KEYS = Object.keys(DEFAULTS.flags);
const P1_FLAGS = [];   // v1.25.1 ทำครบแล้ว (Advent · Boss · Photo booth · Story) — Story มีด่านตรวจเนื้อหาแยก (REVIEW_GATED)
const REVIEW_GATED = ['christmas_story'];

/* ---------------- v1.25.1 กิจกรรม P1 (ผูกกับการเรียนทั้งหมด · โจทย์จากคลังคำศัพท์ที่ตรวจแล้ว data/oxford — ไม่มีเนื้อหาใหม่ที่ยังไม่ตรวจ) ---------------- */
// Advent Calendar: ประตูวันที่ 1–25 ธ.ค. เปิดได้ตั้งแต่วันนั้น (ย้อนเปิดวันที่พลาดได้ถึงวันสุดท้ายของกิจกรรม — ไม่บังคับต่อเนื่อง)
// เปิดประตู = ตอบคำศัพท์ 4 ข้อ ถูก ≥ 3 · ไม่ผ่านลองใหม่ได้ (ข้อใหม่)
const ADVENT = { days: 25, questions: 4, pass: 3, tokens: 15, exp: 10, bonusDays: { 7: 25, 14: 25, 21: 25, 25: 50 } };
// Boss "Frost Giant": วันละครั้งที่ได้รางวัล · พลัง 100 · ตอบถูก = โจมตี 10 (+2 ต่อคอมโบ สูงสุด +6) · ผิด/หมดเวลา = เสียหัวใจ (3 ดวง)
const BOSS = { hp: 100, hearts: 3, hit: 10, comboStep: 2, comboMax: 6, answerSecs: 20, graceSecs: 4, minHumanMs: 600, tokens: 30, exp: 25, maxQuestions: 20 };
// Story: 5 ตอน · ตอนที่ n เปิดตั้งแต่ 25 พ.ย. + 5(n-1) วัน และต้องผ่านตอนก่อนหน้า · ตอบ 3 ข้อ ถูก ≥ 2 = ผ่าน
const STORY = { pass: 2, tokens: 20, exp: 20, unlockEveryDays: 5 };

const CHECKIN_MIN_CORRECT = 5;
const CHECKIN_EXP = 15;

/*
  เควสต์รายวัน — ทุกข้อวัดจากการเรียนจริงของ "วันนี้" (เวลาไทย)
  metric: correct (ตอบถูก) · answered (ตอบทั้งหมด) · accuracy (ตอบ ≥ min ข้อ และถูก ≥ pct%) · exp (EXP จากเหตุผลที่กำหนด)
  สุ่มวันละ 3 ข้อ (คงที่ทั้งวันจากวันที่ — ทุกคนเห็นชุดเดียวกัน) + โบนัส "ทำครบทั้ง 3 ข้อ"
*/
const QUEST_POOL = [
  { id: 'vocab10', titleTh: 'ทบทวนคำศัพท์ให้ถูก 10 คำ', titleEn: 'Get 10 vocabulary answers right', metric: 'correct', skills: ['vocab'], target: 10, tokens: 15, exp: 20, go: '#/vocab', icon: 'book-open' },
  { id: 'grammar6', titleTh: 'ตอบแกรมม่าถูก 6 ข้อ', titleEn: 'Answer 6 grammar questions correctly', metric: 'correct', skills: ['grammar'], target: 6, tokens: 15, exp: 20, go: '#/grammar', icon: 'languages' },
  { id: 'listen5', titleTh: 'ฝึกฟังให้ถูก 5 ข้อ (TOEIC / Graded Listening)', titleEn: 'Get 5 listening answers right', metric: 'correct', skills: ['listening'], target: 5, tokens: 20, exp: 25, go: '#/toeic', icon: 'headphones' },
  { id: 'read5', titleTh: 'อ่านแล้วตอบถูก 5 ข้อ (TOEIC / Graded Reading)', titleEn: 'Get 5 reading answers right', metric: 'correct', skills: ['reading'], target: 5, tokens: 20, exp: 25, go: '#/graded', icon: 'book' },
  { id: 'answer20', titleTh: 'ฝึกครบ 20 ข้อ (ทุกบทเรียน)', titleEn: 'Practise 20 questions in any lesson', metric: 'answered', skills: null, target: 20, tokens: 15, exp: 20, go: '#/home', icon: 'target' },
  { id: 'accuracy80', titleTh: 'ตอบ 15 ข้อขึ้นไป แม่นยำ 80% ขึ้นไป', titleEn: 'Answer 15+ questions with 80%+ accuracy', metric: 'accuracy', skills: null, min: 15, pct: 80, target: 1, tokens: 25, exp: 30, go: '#/home', icon: 'award' },
  { id: 'speak1', titleTh: 'ฝึกพูด/ออกเสียงให้ได้ EXP วันนี้', titleEn: 'Earn EXP from a speaking practice', metric: 'exp', reasons: ['speaking'], target: 1, tokens: 20, exp: 20, go: '#/speak', icon: 'mic' },
  { id: 'tcas5', titleTh: 'ทำข้อสอบติว (TCAS / ก.พ.) ให้ถูก 5 ข้อ', titleEn: 'Get 5 exam-prep answers right', metric: 'correct', skills: ['tcas'], target: 5, tokens: 20, exp: 25, go: '#/tcas', icon: 'graduation-cap' },
];
const DAILY_QUESTS = 3;
const BONUS = { id: 'allclear', titleTh: 'ทำเควสต์วันนี้ครบทั้ง 3 ข้อ', titleEn: 'Clear all of today\'s quests', tokens: 15, exp: 20, icon: 'gift' };

/*
  ร้าน Snowflake Token — ของตกแต่งล้วน (ไม่มีผลต่อคะแนน/แรงค์) · ได้แล้วเป็นของถาวร
  ราคาเทียบรายได้: ผู้เรียนสม่ำเสมอได้ราว 40–95 Token/วัน (เช็กอิน 10 + เควสต์ 3 ข้อ 45–65 + โบนัส 15)
    → ชิ้นทั่วไป 1–2 วัน · หายาก ~3 วัน · มหากาพย์ ~1 สัปดาห์ · ตำนาน ~2 สัปดาห์ · ทั้งชุดต้องเรียนต่อเนื่องราว 4–5 สัปดาห์ (ไม่ได้ครบในวันเดียว)
*/
const SHOP = [
  { id: 'hat_xm26_snowclip', price: 60 },
  { id: 'acc_xm26_gloves', price: 80 },
  { id: 'acc_xm26_scarf', price: 90 },
  { id: 'hat_xm26_antlers', price: 120 },
  { id: 'hat_xm26_santa', price: 150 },
  { id: 'shoes_xm26_boots', price: 150 },
  { id: 'bottom_xm26_tartan', price: 140 },
  { id: 'top_xm26_scholar', price: 180 },
  { id: 'top_xm26_reindeer', price: 180 },
  { id: 'top_xm26_elf', price: 200 },
  { id: 'back_xm26_candycane', price: 220 },
  { id: 'outer_xm26_traveler', price: 320 },
  { id: 'outer_xm26_santa', price: 380 },
  { id: 'outer_xm26_prince', price: 450 },
  { id: 'outer_xm26_princess', price: 450 },
  { id: 'outer_xm26_noel', price: 900 },
  { id: 'pf_xm26_wreath', price: 250, kind: 'pframe' },
  { id: 'cf_xm26_cocoa', price: 160, kind: 'cframe' },
];
// ของขวัญต้อนรับ (ครั้งเดียวต่อบัญชี) — ของจริงบันทึกลงบัญชี: Token 30 + กรอบโปรไฟล์ Holly Wreath
const STARTER = { tokens: DEFAULTS.tokens.starter, frame: 'pf_xm26_holly' };

module.exports = { EVENT_ID, DEFAULTS, FLAG_KEYS, P1_FLAGS, REVIEW_GATED, ADVENT, BOSS, STORY, CHECKIN_MIN_CORRECT, CHECKIN_EXP, QUEST_POOL, DAILY_QUESTS, BONUS, SHOP, STARTER };
