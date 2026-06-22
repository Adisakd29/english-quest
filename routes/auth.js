const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const { AVATAR_IDS } = require('../utils/avatars');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_ก-๙]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
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
      'SELECT * FROM users WHERE username = $1 OR email = $1',
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
