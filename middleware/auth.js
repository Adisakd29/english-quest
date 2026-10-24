const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authRequiredImpl(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies && req.cookies.token);

  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  // ตรวจ token_version: ถ้าผู้ใช้ "ออกจากระบบทุกอุปกรณ์" หรือรีเซ็ตรหัสผ่าน
  // ค่า token_version ในฐานข้อมูลจะเพิ่มขึ้น token เก่าที่มี tv ไม่ตรงจะใช้ไม่ได้
  // token รุ่นเก่าที่ยังไม่มี field tv ถือว่า tv = 0 (เข้ากันได้กับของเดิม)
  // ประกาศไว้นอก try เพื่อใช้ต่อหลังตรวจเสร็จ
  // (บั๊กเดิม: ประกาศใน try แล้วอ้างถึงข้างนอก → ReferenceError → request ค้างทั้งแอป)
  let role = 'user';
  try {
    const { rows } = await pool.query('SELECT token_version, role FROM users WHERE id = $1', [payload.userId]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    }
    const currentTv = rows[0].token_version || 0;
    const tokenTv = payload.tv || 0;
    if (tokenTv !== currentTv) {
      return res.status(401).json({ error: 'เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบใหม่' });
    }
    // role มาจากฐานข้อมูลเสมอ ไม่เชื่อค่าใน token — กันปลอม role ผ่าน JWT
    role = rows[0].role || 'user';
  } catch (err) {
    console.error('[auth/token_version]', err.message);
    return res.status(500).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' });
  }

  req.userId = payload.userId;
  req.userRole = role;
  next();
}

// ต้องใช้หลัง authRequired — อนุญาตเฉพาะผู้ดูแลระบบ
function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
}

/*
  ตาข่ายนิรภัย: Express 4 ไม่ดักจับ error ที่หลุดออกมาจาก async function
  ถ้าไม่ห่อแบบนี้ error ใด ๆ ใน middleware ที่ทุก endpoint ใช้ จะทำให้ request ค้างตลอดไป
  ห่อแล้ว error จะถูกส่งต่อให้ตัวจัดการ error กลางใน app.js ซึ่งตอบ 500 แบบปลอดภัย
*/
function authRequired(req, res, next) {
  authRequiredImpl(req, res, next).catch(next);
}

module.exports = { authRequired, requireAdmin };
