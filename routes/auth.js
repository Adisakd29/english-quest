const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dns = require('dns').promises;
const pool = require('../config/db');
const { sendResetEmail, isMailEnabled, appUrl } = require('../utils/mailer');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const { AVATAR_IDS } = require('../utils/avatars');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_ก-๙]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// เช็คว่าโดเมนของอีเมล "มีอยู่จริงและรับอีเมลได้" ไหม (เช็ค MX record,
// ถ้าไม่มีค่อย fallback ไปเช็ค A/AAAA record ตามมาตรฐาน SMTP)
// หมายเหตุ: เช็คได้แค่ระดับโดเมน ไม่ได้การันตีว่า mailbox นั้นมีอยู่จริง
// ถ้า DNS เช็คไม่ได้เพราะปัญหาชั่วคราว (timeout ฯลฯ) จะ "ปล่อยผ่าน" ไว้ก่อน
// เพื่อไม่ให้ผู้ใช้จริงสมัครไม่ได้เพราะปัญหาเครือข่ายที่ไม่เกี่ยวกับเขา
async function domainCanReceiveEmail(domain) {
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 4000)),
    ]);

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx === 'TIMEOUT') return true; // เช็คไม่ทันเวลา ปล่อยผ่าน
    if (mx && mx.length > 0) return true;
  } catch (err) {
    if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') return true; // ปัญหาชั่วคราว ปล่อยผ่าน
  }

  // ไม่มี MX record -> เช็ค A/AAAA record ตาม fallback ของ SMTP
  for (const method of ['resolve4', 'resolve6']) {
    try {
      const result = await withTimeout(dns[method](domain));
      if (result === 'TIMEOUT') return true;
      if (result && result.length > 0) return true;
    } catch (err) {
      if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') return true;
    }
  }

  return false; // โดเมนนี้ไม่มี MX และไม่มี A/AAAA record เลย แทบไม่มีทางรับอีเมลได้จริง
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(row) {
  const levelInfo = getLevelInfo(row.exp);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    avatarImage: row.avatar_image || null,
    exp: row.exp,
    ...levelInfo,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้ อีเมล และรหัสผ่านให้ครบ' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 3-20 ตัวอักษร (a-z, 0-9, _ หรือภาษาไทย)' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    const domain = email.split('@')[1];
    const domainOk = await domainCanReceiveEmail(domain);
    if (!domainOk) {
      return res.status(400).json({ error: 'อีเมลนี้ดูเหมือนจะไม่มีอยู่จริง กรุณาใช้อีเมลที่ใช้งานได้' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR email = $2',
      [username, email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้หรืออีเมลนี้มีคนใช้แล้ว' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, exp, avatar, avatar_image, created_at`,
      [username, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'สมัครสมาชิกไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR email = $1',
      [identifier.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = signToken(user.id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ' });
  }
});

router.patch('/username', authRequired, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 3-20 ตัวอักษร (a-z, 0-9, _ หรือภาษาไทย)' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
      [username, req.userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
    }

    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, exp, avatar, avatar_image, created_at',
      [username, req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/username]', err);
    res.status(500).json({ error: 'เปลี่ยนชื่อผู้ใช้ไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

router.patch('/avatar', authRequired, async (req, res) => {
  try {
    const { avatar } = req.body || {};
    if (!AVATAR_IDS.includes(avatar)) {
      return res.status(400).json({ error: 'อวตารนี้ไม่ถูกต้อง' });
    }

    const result = await pool.query(
      'UPDATE users SET avatar = $1 WHERE id = $2 RETURNING id, username, email, exp, avatar, avatar_image, created_at',
      [avatar, req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/avatar]', err);
    res.status(500).json({ error: 'เปลี่ยนอวตารไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

// อัปโหลดรูปโปรไฟล์ที่ผู้ใช้ถ่ายเอง — รับ data URL ที่ย่อรูปแล้วจากฝั่ง client
// จำกัดขนาดที่ ~150KB base64 (~110KB ไฟล์จริง) เพื่อไม่ให้ database บวมเกินไป
const MAX_AVATAR_BYTES = 150 * 1024;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

router.patch('/avatar-image', authRequired, async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'ไม่ได้รับรูปภาพ' });
    }
    if (image.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: 'รูปใหญ่เกินไป (จำกัด ~110KB หลังย่อ)' });
    }
    if (!AVATAR_DATA_URL_RE.test(image)) {
      return res.status(400).json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง (รองรับ PNG/JPG/WebP)' });
    }
    const result = await pool.query(
      'UPDATE users SET avatar_image = $1 WHERE id = $2 RETURNING id, username, email, exp, avatar, avatar_image, created_at',
      [image, req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/avatar-image]', err);
    res.status(500).json({ error: 'อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

// ลบรูปโปรไฟล์ที่อัปโหลด — กลับไปใช้ emoji avatar
router.delete('/avatar-image', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET avatar_image = NULL WHERE id = $1 RETURNING id, username, email, exp, avatar, avatar_image, created_at',
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/avatar-image-delete]', err);
    res.status(500).json({ error: 'ลบรูปไม่สำเร็จ' });
  }
});

/* ==========================================================
   ลืมรหัสผ่าน
   ========================================================== */

// เก็บเป็นแฮชในฐานข้อมูล ไม่เก็บโทเคนตัวจริง
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// กันยิงถี่: จำกัดคำขอต่ออีเมล/ต่อ IP
const resetAttempts = new Map(); // key -> { count, resetAt }
function tooManyAttempts(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const rec = resetAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    resetAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > limit;
}
// ล้างของเก่าเป็นระยะ กันหน่วยความจำบวม
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of resetAttempts) if (now > v.resetAt) resetAttempts.delete(k);
}, 10 * 60 * 1000).unref();

// POST /api/auth/forgot-password — ขอลิงก์ตั้งรหัสผ่านใหม่
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
    }

    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    if (tooManyAttempts(`ip:${ip}`, 10) || tooManyAttempts(`em:${email.toLowerCase()}`, 5)) {
      return res.status(429).json({
        error: 'ขอลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      });
    }

    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // ตอบข้อความเดียวกันเสมอ ไม่ว่าอีเมลจะมีในระบบหรือไม่
    // เพื่อไม่ให้คนภายนอกใช้หน้านี้ไล่เดาว่าอีเมลไหนสมัครไว้แล้ว
    const genericOk = {
      ok: true,
      message: 'ถ้าอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจสอบกล่องจดหมาย (รวมถึงเมลขยะ)',
      mailEnabled: isMailEnabled(),
    };

    if (result.rows.length === 0) return res.json(genericOk);

    const user = result.rows[0];

    // ยกเลิกโทเคนเก่าที่ยังไม่ถูกใช้ ให้เหลือใบล่าสุดใบเดียว
    await pool.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, hashToken(token)]
    );

    const link = `${appUrl(req)}/?reset=${token}`;
    try {
      await sendResetEmail({ to: user.email, username: user.username, link });
    } catch (mailErr) {
      console.error('[auth/forgot-password] ส่งอีเมลไม่สำเร็จ:', mailErr.message);
      return res.status(500).json({
        error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อผู้ดูแลระบบ',
      });
    }

    res.json(genericOk);
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'ขอลิงก์ตั้งรหัสผ่านใหม่ไม่สำเร็จ' });
  }
});

// GET /api/auth/reset-password/:token — เช็คว่าลิงก์ยังใช้ได้ไหม (ก่อนโชว์ฟอร์ม)
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query(
      `SELECT pr.id, u.username
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1
          AND pr.used_at IS NULL
          AND pr.expires_at > NOW()`,
      [hashToken(token || '')]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่' });
    }
    res.json({ ok: true, username: result.rows[0].username });
  } catch (err) {
    console.error('[auth/verify-reset]', err);
    res.status(500).json({ error: 'ตรวจสอบลิงก์ไม่สำเร็จ' });
  }
});

// POST /api/auth/reset-password — ตั้งรหัสผ่านใหม่
router.post('/reset-password', async (req, res) => {
  // ตรวจข้อมูลให้ผ่านก่อน แล้วค่อยจอง connection จากพูล
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT pr.id, pr.user_id
         FROM password_resets pr
        WHERE pr.token_hash = $1
          AND pr.used_at IS NULL
          AND pr.expires_at > NOW()
        FOR UPDATE`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่' });
    }

    const { id: resetId, user_id: userId } = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]);
    await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1',
      [resetId]);
    // เผื่อมีใบอื่นค้างอยู่ ปิดให้หมด
    await client.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );

    const userRes = await client.query(
      'SELECT id, username, email, exp, avatar, avatar_image FROM users WHERE id = $1',
      [userId]
    );

    await client.query('COMMIT');

    // ล็อกอินให้เลยหลังตั้งรหัสใหม่สำเร็จ จะได้ไม่ต้องพิมพ์ซ้ำ
    const user = userRes.rows[0];
    const authToken = signToken(user.id);
    res.json({ ok: true, token: authToken, user: publicUser(user) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

module.exports = router;
