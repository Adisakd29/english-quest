// รายชื่ออวตารที่เลือกได้ทั้งหมด (ภาพเป็น SVG ที่ public/assets/avatars/avatars.svg — ไม่ใช้ emoji) — ฝั่งเซิร์ฟเวอร์ใช้ list นี้ตรวจสอบว่า
// ค่าที่ผู้ใช้ส่งมาถูกต้องหรือไม่ (กันไม่ให้ใส่ค่าอะไรก็ได้เข้ามาในฐานข้อมูล)
const AVATARS = [
  { id: 'fox' },
  { id: 'owl' },
  { id: 'cat' },
  { id: 'dog' },
  { id: 'rabbit' },
  { id: 'bear' },
  { id: 'panda' },
  { id: 'lion' },
  { id: 'tiger' },
  { id: 'koala' },
  { id: 'penguin' },
  { id: 'dragon' },
];

const AVATAR_IDS = AVATARS.map((a) => a.id);

module.exports = { AVATARS, AVATAR_IDS };
