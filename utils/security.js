/*
  ตัวช่วยด้านความปลอดภัยที่ใช้ร่วมกันทั้งแอป
  เขียนเองทั้งหมด ไม่เพิ่ม dependency (เลี่ยง helmet เพื่อคุมให้เบาและเข้าใจง่าย)
*/

// header ความปลอดภัยพื้นฐาน ใส่ให้ทุก response
function securityHeaders(_req, res, next) {
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
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// escape อักขระพิเศษของ SQL LIKE/ILIKE (% _ \) เพื่อให้ค้นหาตามตัวอักษรตรง ๆ
// ไม่ถูกตีความเป็น wildcard
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (c) => `\\${c}`);
}

module.exports = { securityHeaders, clientIp, escapeLike };
