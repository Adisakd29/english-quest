/*
  v1.18.4 สภาพแวดล้อม (production หรือไม่) — ใช้ที่เดียวทั้งระบบ
  เดิมหลายจุดเช็ก NODE_ENV === 'production' อย่างเดียว ถ้าบนเซิร์ฟเวอร์จริงไม่ได้ตั้ง (หรือคัดลอก .env.example ที่เป็น development)
  ระบบป้องกันบางอย่างจะ "เปิด" อยู่ในเว็บจริง -> ถือว่าเป็น production อัตโนมัติเมื่อรันบน Railway
  (ตั้ง EQ_ALLOW_DEV_ON_RAILWAY=on ได้เฉพาะสภาพแวดล้อมทดสอบบน Railway ที่ตั้งใจให้เป็น dev)
*/
function onRailway() {
  return Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_PROJECT_ID);
}
function isProd() {
  if (process.env.NODE_ENV === 'production') return true;
  return onRailway() && process.env.EQ_ALLOW_DEV_ON_RAILWAY !== 'on';
}
/** คำเตือนตอนเปิดเซิร์ฟเวอร์ (ไม่หยุดเซิร์ฟเวอร์) */
function startupWarnings() {
  const out = [];
  if (onRailway() && process.env.NODE_ENV !== 'production') {
    out.push(`NODE_ENV="${process.env.NODE_ENV || ''}" บน Railway — ระบบถือเป็น production ให้อัตโนมัติแล้ว แต่ควรตั้ง NODE_ENV=production ใน Variables`);
  }
  const secret = String(process.env.JWT_SECRET || '');
  if (isProd() && (secret.length < 32 || /change|secret|example|devsecret/i.test(secret))) {
    out.push('JWT_SECRET สั้นหรือดูเหมือนค่าตัวอย่าง — ตั้งค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร');
  }
  if (isProd() && !process.env.SMTP_HOST) out.push('ยังไม่ได้ตั้ง SMTP — ส่งอีเมลยืนยัน/รีเซ็ตรหัสผ่านไม่ได้ (ระบบจะไม่พิมพ์ลิงก์ลง log ใน production)');
  return out;
}
module.exports = { isProd, onRailway, startupWarnings };
