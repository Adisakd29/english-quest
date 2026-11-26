/*
  v1.25.2 เซสชันแบบ httpOnly cookie (JavaScript ในหน้าเว็บอ่าน token ไม่ได้ — ลดความเสียหายถ้ามี XSS)
  - ชื่อ eq_session · HttpOnly · SameSite=Strict · Secure (production/https) · Path=/api · อายุเท่า JWT (30 วัน)
  - กัน CSRF 2 ชั้น: SameSite=Strict (เว็บอื่นส่ง cookie มาไม่ได้) + ทุกคำขอที่ยืนยันตัวด้วย cookie ต้องมี header X-EQ-CSRF: 1
    (เว็บอื่นตั้ง header เองไม่ได้โดยไม่ผ่าน CORS preflight ซึ่งเซิร์ฟเวอร์นี้ไม่อนุญาต)
  - Authorization: Bearer ยังใช้ได้เหมือนเดิม (แอป/สคริปต์/ชุดทดสอบ) — ไม่ต้องใช้ header CSRF
*/
const NAME = 'eq_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const secure = (req) => process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
function setSession(req, res, token) {
  res.cookie(NAME, token, { httpOnly: true, sameSite: 'strict', secure: secure(req), path: '/api', maxAge: MAX_AGE_MS });
}
function clearSession(req, res) {
  res.clearCookie(NAME, { httpOnly: true, sameSite: 'strict', secure: secure(req), path: '/api' });
}
/** token จากคำขอ: Bearer ก่อน · ไม่มี → cookie (ต้องมี X-EQ-CSRF) · คืน { token, via } หรือ { error } */
function tokenOf(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return { token: h.slice(7), via: 'bearer' };
  const c = req.cookies && req.cookies[NAME];
  if (!c) return { token: null };
  if (req.headers['x-eq-csrf'] !== '1') return { error: 'CSRF' };
  return { token: c, via: 'cookie' };
}
/** ใส่ใน router /api/auth: คำตอบที่สำเร็จและมี token (สมัคร/เข้าสู่ระบบ/Google/ยืนยันอีเมล/รีเซ็ตรหัส/ออกทุกเครื่อง) → ตั้ง cookie ให้อัตโนมัติ */
function autoSet(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400 && body && typeof body.token === 'string' && body.token.length > 20) setSession(req, res, body.token);
    return json(body);
  };
  next();
}
module.exports = { NAME, setSession, clearSession, tokenOf, autoSet };
