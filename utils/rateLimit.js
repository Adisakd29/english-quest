/*
  Rate limiter แบบเก็บในหน่วยความจำ ใช้ร่วมกันทั้งแอป
  (พอสำหรับ instance เดียวบน Railway ถ้าขยายหลายเครื่องในอนาคตค่อยเปลี่ยนไป Redis)

  ออกแบบให้สร้างหลาย "ถัง" แยกกันได้ เช่น ถังของ login, ถังของ translate
  แต่ละถังมี limit และ window ของตัวเอง
*/

function createLimiter({ limit, windowMs }) {
  const hits = new Map(); // key -> { count, resetAt }

  // เก็บกวาด key ที่หมดอายุทุก ๆ window เพื่อไม่ให้หน่วยความจำบวม
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k);
    }
  }, Math.max(windowMs, 60000));
  timer.unref();

  // คืน true ถ้า "เกินโควตาแล้ว" (ควรบล็อก)
  function check(key) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now > rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    rec.count += 1;
    return rec.count > limit;
  }

  // ล้างโควตาของ key (เรียกเมื่อผู้ใช้ทำสำเร็จ เช่น ล็อกอินถูก)
  function reset(key) {
    hits.delete(key);
  }

  // เหลือกี่วินาทีจนกว่าจะรีเซ็ต (ใช้บอกผู้ใช้)
  function retryAfter(key) {
    const rec = hits.get(key);
    if (!rec) return 0;
    return Math.max(0, Math.ceil((rec.resetAt - Date.now()) / 1000));
  }

  return { check, reset, retryAfter };
}

module.exports = { createLimiter };
