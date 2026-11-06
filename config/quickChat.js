/*
  Quick Chat (แชทโลก) — ข้อความสำเร็จรูป ส่งผ่านระบบเดียวกับข้อความพิมพ์เอง (services/worldChat.post)
  ผู้ใช้ที่ตั้ง "Quick Chat เท่านั้น" หรือถูกผู้ดูแลจำกัดการพิมพ์ (restriction kind = text) ส่งได้เฉพาะรายการนี้
*/
const QUICK = [
  { id: 'hello', text: 'Hello!' },
  { id: 'nice', text: 'Nice to meet you!' },
  { id: 'learn', text: "Let's learn English!" },
  { id: 'luck', text: 'Good luck!' },
  { id: 'gg', text: 'Good game!' },
  { id: 'practice', text: 'Would you like to practice English?' },
  { id: 'thanks', text: 'Thank you!' },
  { id: 'bye', text: 'See you later!' },
];
const QUICK_BY_ID = Object.fromEntries(QUICK.map((q) => [q.id, q]));
module.exports = { QUICK, QUICK_BY_ID };
