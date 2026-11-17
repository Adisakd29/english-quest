/*
  v1.18.3 ค่าตั้งต้นของชุดทดสอบ: เทสต์ส่วนใหญ่ "ตอบทันที" แบบสคริปต์เพื่อทดสอบกติกาอื่น (EXP / SRS / Ranked ฯลฯ)
  จึงปิดการตรวจ "ตอบเร็วเกินมนุษย์" ไว้ — เว้นแต่ไฟล์เทสต์ตั้งค่าเอง (test/ranked-integrity.test.js เปิดไว้ที่ 600 ms)
*/
if (process.env.LEARN_MIN_HUMAN_MS === undefined) process.env.LEARN_MIN_HUMAN_MS = '0';
if (process.env.RANKED_MIN_HUMAN_MS === undefined) process.env.RANKED_MIN_HUMAN_MS = '0';
// v1.18.4 ช่องทางฝึกการ์ดแบบเก่า (/api/progress/review) ปิดเป็นค่าเริ่มต้น — ชุดทดสอบยังใช้ตรวจกติกา SRS/EXP
if (process.env.LEGACY_CARD_REVIEW === undefined) process.env.LEGACY_CARD_REVIEW = 'on';
