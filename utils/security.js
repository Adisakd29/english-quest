/*
  ตัวช่วยด้านความปลอดภัยที่ใช้ร่วมกันทั้งแอป
  เขียนเองทั้งหมด ไม่เพิ่ม dependency (เลี่ยง helmet เพื่อคุมให้เบาและเข้าใจง่าย)
*/

/*
  Content-Security-Policy (v1.10.0) — กัน XSS โหลดสคริปต์แปลกปลอม (token อยู่ใน localStorage จึงสำคัญมาก)
  CSP_MODE: enforce (ค่าเริ่มต้นตั้งแต่ v1.10.0 Phase 5 — บล็อกจริง + รายงานไปที่ /api/csp-report) | report (รายงานอย่างเดียว) | off
  เปลี่ยนเป็น enforce หลังไล่ทุกหน้า/การกระทำหลักแล้วไม่พบการละเมิด (test/e2e/csp_e2e.py) · ถ้าพบปัญหาบน production ตั้ง CSP_MODE=report ชั่วคราวได้
  inline script ที่มีตัวเดียว (ตั้งธีมก่อนวาดหน้า) อนุญาตด้วย hash ที่คำนวณจาก index.html ตอนเริ่มเซิร์ฟเวอร์
*/
// คำนวณจาก public/index.html ตอนเริ่มเซิร์ฟเวอร์ (แก้สคริปต์ตั้งธีม เช่นเพิ่มธีมใหม่ แล้ว hash ตามเองเสมอ — ไม่ต้องแก้มือ)
function inlineScriptHashes(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${require('crypto').createHash('sha256').update(m[1]).digest('base64')}'`);
}
let INLINE_THEME_HASH;
try { INLINE_THEME_HASH = inlineScriptHashes(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8')).join(' '); } catch (_) { INLINE_THEME_HASH = ''; }
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${INLINE_THEME_HASH} https://accounts.google.com/gsi/client 'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// header ความปลอดภัยพื้นฐาน ใส่ให้ทุก response
function securityHeaders(req, res, next) {
  const mode = String(process.env.CSP_MODE || 'enforce').toLowerCase();
  if (mode === 'enforce') res.setHeader('Content-Security-Policy', `${CSP}; report-uri /api/csp-report`);
  else if (mode !== 'off') res.setHeader('Content-Security-Policy-Report-Only', `${CSP}; report-uri /api/csp-report`);
  // HTTPS เท่านั้น (เฉพาะ production — บนเครื่องพัฒนาใช้ http)
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // กันไม่ให้เว็บถูกฝังใน iframe ของเว็บอื่น (clickjacking)
  res.setHeader('X-Frame-Options', 'DENY');
  // กันเบราว์เซอร์เดาชนิดไฟล์เอง (MIME sniffing)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // ส่ง referrer เท่าที่จำเป็น
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // ปิดการเข้าถึงอุปกรณ์ที่แอปไม่ได้ใช้ · ไมค์ใช้ได้เฉพาะหน้าเว็บของเราเอง (คุยเสียงในเกมทีม — ขอสิทธิ์เมื่อผู้ใช้กดเท่านั้น)
  res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=(), camera=(), microphone=(self)');
  next();
}

/*
  หา IP จริงของผู้ใช้สำหรับ rate limit
  บน Railway คำขอผ่าน reverse proxy จึงต้องอ่าน x-forwarded-for
  แต่ค่านี้ "ปลอมได้" ถ้าเชื่อตรง ๆ — เราจึงเอาเฉพาะ IP ตัวแรก (ที่ proxy
  ของ Railway เติมให้) และใช้คู่กับ app.set('trust proxy', ...) ใน server.js
  ถ้าไม่มี header ก็ใช้ req.ip ตามปกติ
*/
function clientIp(req) {
  // v1.10.0: ใช้ req.ip (Express คำนวณจาก trust proxy = 1 ชั้นของ Railway) — ไม่เชื่อค่าแรกของ
  // X-Forwarded-For ที่ผู้ใช้ปลอมเองได้ (เดิมใช้เลี่ยงการจำกัดจำนวนครั้งต่อ IP ได้)
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// escape อักขระพิเศษของ SQL LIKE/ILIKE (% _ \) เพื่อให้ค้นหาตามตัวอักษรตรง ๆ
// ไม่ถูกตีความเป็น wildcard
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`);
}

module.exports = { securityHeaders, clientIp, escapeLike };
