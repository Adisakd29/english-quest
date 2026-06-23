const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dns = require('dns').promises;
const pool = require('../config/db');
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
       RETURNING id, username, email, exp, avatar, created_at`,
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
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, exp, avatar, created_at',
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
      'UPDATE users SET avatar = $1 WHERE id = $2 RETURNING id, username, email, exp, avatar, created_at',
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

module.exports = router;
