// รายชื่ออวตารที่เลือกได้ทั้งหมด — ฝั่งเซิร์ฟเวอร์ใช้ list นี้ตรวจสอบว่า
// ค่าที่ผู้ใช้ส่งมาถูกต้องหรือไม่ (กันไม่ให้ใส่ค่าอะไรก็ได้เข้ามาในฐานข้อมูล)
const AVATARS = [
  { id: 'fox', emoji: '🦊' },
  { id: 'owl', emoji: '🦉' },
  { id: 'cat', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
  { id: 'rabbit', emoji: '🐰' },
  { id: 'bear', emoji: '🐻' },
  { id: 'panda', emoji: '🐼' },
  { id: 'lion', emoji: '🦁' },
  { id: 'tiger', emoji: '🐯' },
  { id: 'koala', emoji: '🐨' },
  { id: 'penguin', emoji: '🐧' },
  { id: 'dragon', emoji: '🐲' },
];

const AVATAR_IDS = AVATARS.map((a) => a.id);

module.exports = { AVATARS, AVATAR_IDS };
