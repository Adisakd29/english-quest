/*
  การตั้งค่า AI — v1.10.0: ตัดสินใจ "ไม่ใช้ AI ที่คิดค่าโทเค็น" ในแอป (ปิดไว้ ไม่มีค่าใช้จ่าย)
  Phase 3 จึงทำแบบไม่ใช้ AI: Writing Studio (กฎภาษา + คลังคำ) · ผู้ช่วยค้นคำตอบ (ค้นเนื้อหาในแอป) · ฝึกพูด (Web Speech API ของเบราว์เซอร์)
  ไฟล์นี้คงไว้เผื่ออนาคต — ถ้าไม่ตั้ง AI_PROVIDER + AI_API_KEY จะไม่มีการเรียก AI ใด ๆ
  - ยังไม่ได้เลือกผู้ให้บริการ: ตั้ง AI_PROVIDER + AI_API_KEY ใน Railway เมื่อพร้อม (ไม่ตั้ง = ปิดฟีเจอร์ AI ทั้งหมด)
  - โควตาต่อวัน (เวลาไทย) ตามสิทธิ์ — คุมต้นทุน · ผู้ใช้ Free ไม่มีโควตา AI
  - ข้อความ/เสียงที่ส่งให้ AI: ส่งเฉพาะที่จำเป็นต่อการตรวจ ไม่ส่งอีเมล/ชื่อจริง (ดู docs/PREMIUM_PHASE1.md)
*/
const PROVIDERS = ['anthropic', 'openai', 'google'];
const provider = () => (PROVIDERS.includes(String(process.env.AI_PROVIDER || '').toLowerCase()) ? String(process.env.AI_PROVIDER).toLowerCase() : null);
const configured = () => Boolean(provider() && process.env.AI_API_KEY);

const FEATURES = ['speaking', 'writing', 'tutor'];
const DAILY_LIMITS = {
  free:    { speaking: 0, writing: 0, tutor: 0 },
  trial:   { speaking: 3, writing: 3, tutor: 5 },
  premium: { speaking: 20, writing: 10, tutor: 30 },
};

module.exports = { PROVIDERS, FEATURES, DAILY_LIMITS, provider, configured };
