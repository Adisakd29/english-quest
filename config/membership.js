/*
  สมาชิก Premium — แก้ราคา/จำนวนวัน/สิทธิ์ได้ที่ไฟล์นี้ไฟล์เดียว
  - ชำระผ่าน PromptPay (ตั้งค่า PROMPTPAY_ID และ PROMPTPAY_NAME ใน .env) · ไม่ต่ออายุอัตโนมัติ (PromptPay ตัดเงินซ้ำไม่ได้)
  - สิทธิ์ทั้งหมดต้องไม่ใช่ pay-to-win: ห้ามเพิ่ม EXP / Coin / เพดานรายวัน / ความได้เปรียบใน Ranked
  - เนื้อหาเฉพาะสมาชิกต้องเป็นของใหม่ (ห้ามย้ายบทเรียนฟรีเดิมมาล็อก) และไม่ให้ EXP / Coin
*/
const PLANS = {
  monthly: { id: 'monthly', th: 'รายเดือน', priceBaht: 39, days: 30, note: 'ใช้ได้ 30 วัน' },
  yearly: { id: 'yearly', th: 'รายปี', priceBaht: 299, days: 365, note: 'ใช้ได้ 365 วัน · ประหยัดกว่ารายเดือน ~36%' },
};

const BENEFITS = [
  { icon: 'briefcase', th: 'หมวดเรียนเฉพาะสมาชิก: ภาษาอังกฤษเพื่อการทำงาน — 6 หัวข้อ 72 วลี (อีเมล ประชุม สัมภาษณ์งาน โทรศัพท์ นำเสนองาน คุยกับลูกค้า) พร้อมแบบฝึก' },
  { icon: 'crown', th: 'ป้าย Premium ข้างชื่อ (โปรไฟล์ · กระดานอันดับ)' },
  { icon: 'flame', th: 'ตัวช่วยรักษา Streak แผนฝึก TOEIC 2 วันต่อเดือน (พลาด 1 วันไม่ขาด)' },
  { icon: 'hand-helping', th: 'สนับสนุนให้ EnglishQuest พัฒนาเนื้อหาใหม่ต่อเนื่อง' },
];
const NOT_INCLUDED_TH = 'ไม่มี EXP / Coin เพิ่ม และไม่มีความได้เปรียบในการแข่ง — บทเรียนเดิมทั้งหมดยังใช้ฟรีเหมือนเดิม (หมวดเฉพาะสมาชิกเป็นเนื้อหาใหม่ และไม่ให้ EXP เพื่อความยุติธรรม)';

/*
  ตารางเปรียบเทียบ Free / Premium — ต้องตรงกับของที่ "มีให้ใช้จริงตอนนี้" เท่านั้น
  free/premium: true = มี · 'preview' = ดูตัวอย่างได้ · false = ไม่มี
  ROADMAP = กำลังพัฒนา (แสดงแยกชัดเจนว่า "ยังไม่รวมในสิทธิ์ตอนนี้")
*/
const COMPARE = [
  { th: 'บทเรียนคำศัพท์ A1–C2 (แบบฝึก 5 แบบ) + ทบทวนแบบเว้นช่วง', free: true, premium: true },
  { th: 'ไวยากรณ์ A1–C1 74 บท + ฝึกเขียนประโยค', free: true, premium: true },
  { th: 'TOEIC Practice ครบ 7 Part · Full Mock · วิเคราะห์จุดอ่อน · แผนฝึกรายวัน', free: true, premium: true },
  { th: 'ฝึกพูด (ให้คะแนนรายคำ) / ฟังแล้วพิมพ์', free: true, premium: true },
  { th: 'Writing Studio + ผู้ช่วยค้นคำตอบ (ตรวจด้วยกฎภาษาและคลังคำ ไม่ใช้ AI)', free: true, premium: true },
  { th: 'Ranked · EnglishQuest World · กิจกรรม (ไม่มีความได้เปรียบสำหรับ Premium)', free: true, premium: true },
  { th: 'คะแนน 6 ทักษะ', free: true, premium: true },
  { th: 'Learning Analytics ละเอียด: แนวโน้ม 14 วัน · คิวทบทวน · คำแนะนำ · ระดับ CEFR โดยประมาณ', free: false, premium: true },
  { th: 'ภาษาอังกฤษเพื่อการทำงาน 72 วลี + แบบฝึก', free: 'preview', premium: true },
  { th: 'ตัวช่วยรักษา Streak แผนฝึก TOEIC 2 วัน/เดือน', free: false, premium: true },
  { th: 'ป้าย Premium ข้างชื่อ', free: false, premium: true },
];
const ROADMAP = [
  { th: 'ฝึกพูดตามสถานการณ์ — บทสนทนาโต้ตอบแบบเลือกเส้นทาง (ไม่ใช้ AI)', icon: 'mic' },
  { th: 'คำศัพท์ B2–C1 เนื้อหาใหม่ (ความหมาย/ตัวอย่าง/คำแปล) แบบเดียวกับ A1–B1', icon: 'book-open' },
  { th: 'Premium Learning Path B1–B2 — Unit ครบ 5 กิจกรรม + Boss Mission', icon: 'map' },
  { th: 'Listening Lab — ปรับความเร็ว · Transcript · Shadowing', icon: 'headphones' },
  { th: 'TOEIC Exam Mode เต็มรูปแบบ 200 ข้อ', icon: 'graduation-cap' },
];

const ORDER_TTL_HOURS = 24;           // คำสั่งซื้อที่ยังไม่แนบสลิปหมดอายุใน 24 ชม.
const SLIP_MAX_BYTES = 1000000;       // ~1 MB หลังย่อรูปในเบราว์เซอร์
const SLIP_RETENTION_DAYS = 90;       // ลบรูปสลิปหลังตรวจแล้ว 90 วัน (เก็บแค่ค่า hash กันใช้ซ้ำ)
const MAX_ORDERS_PER_HOUR = 5;
const MAX_WAITING_REVIEW = 2;         // ส่งสลิปรอตรวจพร้อมกันได้ไม่เกิน 2 รายการ
const STREAK_FREEZE_PER_MONTH = 2;
const TRIAL_DAYS = Number(process.env.PREMIUM_TRIAL_DAYS ?? 7);   // ทดลองใช้ฟรีครั้งเดียวต่อบัญชี (0 = ปิด)
const GRACE_DAYS = 3;                 // หมดอายุไม่เกิน 3 วัน = past_due (เตือนต่ออายุ)

module.exports = { PLANS, BENEFITS, NOT_INCLUDED_TH, ORDER_TTL_HOURS, SLIP_MAX_BYTES, SLIP_RETENTION_DAYS, MAX_ORDERS_PER_HOUR, MAX_WAITING_REVIEW, STREAK_FREEZE_PER_MONTH, TRIAL_DAYS, GRACE_DAYS, COMPARE, ROADMAP };
