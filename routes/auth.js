const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dns = require('dns').promises;
const pool = require('../config/db');
const { sendResetEmail, sendVerifyEmail, isMailEnabled, appUrl } = require('../utils/mailer');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const { AVATAR_IDS } = require('../utils/avatars');
const { createLimiter } = require('../utils/rateLimit');
const { clientIp } = require('../utils/security');
const google = require('../utils/googleAuth');
const { roleForEmail } = require('../utils/adminSync');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_ก-๙]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

// จำกัดการพยายามเข้าสู่ระบบ: ต่อบัญชี 8 ครั้ง/15 นาที, ต่อ IP 50 ครั้ง/15 นาที
// (เพดาน IP สูงเพื่อไม่บล็อกผิดคนในเน็ตโรงเรียน/ออฟฟิศที่ใช้ IP ร่วมกัน)
const loginAccountLimiter = createLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
const loginIpLimiter = createLimiter({ limit: 50, windowMs: 15 * 60 * 1000 });

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

function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, tv: tokenVersion }, process.env.JWT_SECRET, { expiresIn: '30d' });
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
    emailVerified: Boolean(row.email_verified),
    role: row.role || 'user', // ใช้แค่ซ่อน/แสดงเมนูในหน้าเว็บ — สิทธิ์จริงตรวจฝั่งเซิร์ฟเวอร์ทุกครั้ง
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
    if (String(password).length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LEN} ตัวอักษร` });
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
      `INSERT INTO users (username, email, password_hash, role, verification_required)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, exp, avatar, avatar_image, role, created_at, email_verified`,
      [username, email.toLowerCase(), passwordHash, roleForEmail(email), requireVerification()]
    );

    const user = result.rows[0];
    let mailed = false;
    try {
      mailed = (await issueVerification(user, req)).sent;
    } catch (mailErr) {
      console.error('[auth/register] ส่งอีเมลยืนยันไม่สำเร็จ:', mailErr.message);
    }
    if (requireVerification()) {
      // ต้องยืนยันอีเมลก่อน — ไม่ออก token (ใช้อีเมลปลอมสมัครแล้วใช้งานทันทีไม่ได้)
      return res.status(201).json({ requiresVerification: true, email: user.email, mailed });
    }
    const token = signToken(user.id, 0);
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

    // กันเดารหัสผ่าน: เช็คทั้งต่อ IP และต่อบัญชีที่พยายามเข้า
    const ip = clientIp(req);
    const idKey = String(identifier).toLowerCase();
    if (loginIpLimiter.check(`ip:${ip}`) || loginAccountLimiter.check(`id:${idKey}`)) {
      const wait = Math.max(
        loginIpLimiter.retryAfter(`ip:${ip}`),
        loginAccountLimiter.retryAfter(`id:${idKey}`)
      );
      return res.status(429).json({
        error: `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารออีก ${Math.ceil(wait / 60)} นาที`,
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR email = $1',
      [idKey]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // บัญชีที่สมัครด้วย Google อย่างเดียวไม่มีรหัสผ่าน — bcrypt.compare(…, null) จะโยน error (500)
    if (!user.password_hash) {
      return res.status(400).json({
        error: 'บัญชีนี้สมัครด้วย Google — กรุณากด "เข้าสู่ระบบด้วย Google" หรือตั้งรหัสผ่านผ่าน "ลืมรหัสผ่าน"',
        code: 'USE_GOOGLE',
      });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (match && user.verification_required && !user.email_verified) {
      return res.status(403).json({
        error: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ — ตรวจสอบกล่องจดหมายของคุณ (รวมถึงโฟลเดอร์สแปม)',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    if (!match) {
      return res.status(401).json({ error: 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // เข้าสู่ระบบสำเร็จ — ล้างตัวนับของบัญชีนี้ (IP ยังนับต่อเพื่อกันสเปรย์)
    loginAccountLimiter.reset(`id:${idKey}`);

    const token = signToken(user.id, user.token_version || 0);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});


/* ==========================================================
   GOOGLE SIGN-IN (Google Identity Services + google-auth-library)
   กติกาความปลอดภัย:
   - ระบุตัวตนด้วย Google "sub" ไม่ใช่อีเมล (อีเมลเปลี่ยนได้ sub ไม่เปลี่ยน)
   - รับเฉพาะอีเมลที่ Google ยืนยันแล้ว
   - "ไม่เชื่อมบัญชีอัตโนมัติ" เมื่ออีเมลตรงกับบัญชีเดิม — อีเมลในระบบเดิมไม่เคยยืนยัน
     ถ้าเชื่อมอัตโนมัติ ใครก็สมัครด้วยอีเมลคนอื่นไว้ก่อนแล้วรอยึดบัญชีได้
     -> ให้ผู้ใช้เข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วกด "เชื่อม Google" เอง
   ========================================================== */
const googleLimiter = createLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });

// ค่าสาธารณะสำหรับหน้าเว็บ (Client ID ไม่ใช่ความลับ) — ไม่ตั้ง = ซ่อนปุ่ม Google
router.get('/config', (_req, res) => {
  // minPasswordLength: หน้าเว็บอ่านจากที่นี่ที่เดียว (เดิมหน้าเว็บเขียน 6 แต่เซิร์ฟเวอร์บังคับ 8)
  res.json({ googleClientId: google.getClientId(), minPasswordLength: MIN_PASSWORD_LEN });
});

function googleError(res, err) {
  if (err.code === 'NOT_CONFIGURED') {
    return res.status(503).json({ error: 'ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google', code: 'NOT_CONFIGURED' });
  }
  if (err.code === 'INVALID_TOKEN') {
    return res.status(401).json({ error: 'ยืนยันตัวตนกับ Google ไม่สำเร็จ กรุณาลองใหม่', code: 'AUTH_FAILED' });
  }
  console.error('[auth/google]', err);
  return res.status(502).json({ error: 'ติดต่อ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', code: 'PROVIDER_ERROR' });
}

// สร้างชื่อผู้ใช้จากอีเมล ให้ผ่านกติกาเดียวกับการสมัครปกติ (ไม่ใช้ชื่อจาก Google ตรง ๆ)
async function uniqueUsernameFromEmail(client, email) {
  let base = (email.split('@')[0] || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15);
  if (base.length < 3) base = `user${base}`;
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 15)}${crypto.randomInt(1000, 9999)}`;
    const { rows } = await client.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [candidate]);
    if (rows.length === 0 && USERNAME_RE.test(candidate)) return candidate;
  }
  return `user${crypto.randomInt(100000, 999999)}`;
}

// POST /auth/google { credential } — เข้าสู่ระบบ / สมัครด้วย Google
router.post('/google', async (req, res) => {
  const ip = clientIp(req);
  if (googleLimiter.check(`gip:${ip}`)) {
    return res.status(429).json({ error: 'พยายามบ่อยเกินไป กรุณารอสักครู่', code: 'RATE_LIMITED' });
  }
  let g;
  try {
    g = await google.verifyGoogleCredential(String((req.body || {}).credential || ''));
  } catch (err) { return googleError(res, err); }
  if (!g.emailVerified || !g.email) {
    return res.status(403).json({ error: 'อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน', code: 'EMAIL_UNVERIFIED' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) เคยเชื่อมแล้ว -> เข้าสู่ระบบ
    const linked = await client.query(
      `SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id
        WHERE i.provider = 'google' AND i.provider_user_id = $1`, [g.sub]
    );
    if (linked.rows.length) {
      await client.query(
        `UPDATE user_identities SET last_login_at = NOW(), email = $2, display_name = $3, avatar_url = $4
          WHERE provider = 'google' AND provider_user_id = $1`, [g.sub, g.email, g.name.slice(0, 255), g.picture]
      );
      await client.query('COMMIT');
      const user = linked.rows[0];
      return res.json({ token: signToken(user.id, user.token_version || 0), user: publicUser(user), created: false });
    }
    // 2) อีเมลตรงกับบัญชีเดิม -> ไม่เชื่อมอัตโนมัติ
    const sameEmail = await client.query('SELECT id FROM users WHERE email = $1', [g.email]);
    if (sameEmail.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'มีบัญชีที่ใช้อีเมลนี้อยู่แล้ว — กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านก่อน แล้วกด "เชื่อมบัญชี Google" ในหน้าโปรไฟล์',
        code: 'ACCOUNT_EXISTS',
      });
    }
    // 3) ผู้ใช้ใหม่ -> สร้างบัญชี (ไม่มีรหัสผ่าน) + บันทึกตัวตน Google
    const username = await uniqueUsernameFromEmail(client, g.email);
    const created = await client.query(
      `INSERT INTO users (username, email, password_hash, role, email_verified, email_verified_at)
       VALUES ($1, $2, NULL, $3, TRUE, NOW())
       RETURNING id, username, email, exp, avatar, avatar_image, role, token_version, created_at, email_verified`,
      [username, g.email, roleForEmail(g.email)]
    );
    const user = created.rows[0];
    await client.query(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url, last_login_at)
       VALUES ($1, 'google', $2, $3, TRUE, $4, $5, NOW())`,
      [user.id, g.sub, g.email, g.name.slice(0, 255), g.picture]
    );
    await client.query('COMMIT');
    return res.status(201).json({ token: signToken(user.id, 0), user: publicUser(user), created: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { // สองคำขอพร้อมกัน — ให้ผู้ใช้ลองใหม่ (ครั้งถัดไปจะเจอบัญชีที่สร้างแล้ว)
      return res.status(409).json({ error: 'กรุณาลองใหม่อีกครั้ง', code: 'RETRY' });
    }
    console.error('[auth/google]', err);
    return res.status(500).json({ error: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ', code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// POST /auth/google/link { credential } — เชื่อม Google กับบัญชีที่เข้าสู่ระบบอยู่ (ผู้ใช้กดเอง)
router.post('/google/link', authRequired, async (req, res) => {
  let g;
  try {
    g = await google.verifyGoogleCredential(String((req.body || {}).credential || ''));
  } catch (err) { return googleError(res, err); }
  if (!g.emailVerified) {
    return res.status(403).json({ error: 'อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน', code: 'EMAIL_UNVERIFIED' });
  }
  try {
    const used = await pool.query(
      "SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_user_id = $1", [g.sub]
    );
    if (used.rows.length && used.rows[0].user_id !== req.userId) {
      return res.status(409).json({ error: 'บัญชี Google นี้เชื่อมกับผู้ใช้อื่นอยู่แล้ว', code: 'IDENTITY_IN_USE' });
    }
    if (used.rows.length) return res.json({ ok: true, linked: true });
    await pool.query(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url)
       VALUES ($1, 'google', $2, $3, TRUE, $4, $5)`,
      [req.userId, g.sub, g.email, g.name.slice(0, 255), g.picture]
    );
    // Google ยืนยันอีเมลนี้แล้ว — ถ้าตรงกับอีเมลของบัญชี ถือว่ายืนยันอีเมลของบัญชีแล้วด้วย
    await pool.query(
      `UPDATE users SET email_verified = TRUE, email_verified_at = NOW()
        WHERE id = $1 AND LOWER(email) = LOWER($2) AND NOT email_verified`, [req.userId, g.email]
    );
    res.json({ ok: true, linked: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'บัญชีนี้เชื่อมกับ Google บัญชีอื่นอยู่แล้ว', code: 'ALREADY_LINKED' });
    }
    console.error('[auth/google/link]', err);
    res.status(500).json({ error: 'เชื่อมบัญชีไม่สำเร็จ' });
  }
});

// DELETE /auth/google/link — ยกเลิกการเชื่อม (ต้องมีรหัสผ่าน ไม่งั้นจะเข้าบัญชีไม่ได้อีก)
router.delete('/google/link', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (!rows[0].password_hash) {
      return res.status(400).json({ error: 'ตั้งรหัสผ่านก่อน จึงจะยกเลิกการเชื่อม Google ได้ (ไม่งั้นจะเข้าสู่ระบบไม่ได้)', code: 'NEED_PASSWORD' });
    }
    await pool.query("DELETE FROM user_identities WHERE user_id = $1 AND provider = 'google'", [req.userId]);
    res.json({ ok: true, linked: false });
  } catch (err) {
    console.error('[auth/google/unlink]', err);
    res.status(500).json({ error: 'ยกเลิกการเชื่อมไม่สำเร็จ' });
  }
});


/* ==========================================================
   ยืนยันอีเมล
   REQUIRE_EMAIL_VERIFICATION=true -> บัญชีใหม่ต้องยืนยันก่อนเข้าสู่ระบบ
   (ปิดไว้เป็นค่าเริ่มต้น: ถ้า SMTP ยังใช้ไม่ได้ การบังคับจะทำให้ไม่มีใครสมัครได้)
   ========================================================== */
const VERIFY_HOURS = 24;
const resendLimiter = createLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
function requireVerification() { return process.env.REQUIRE_EMAIL_VERIFICATION === 'true'; }

async function issueVerification(user, req) {
  await pool.query('UPDATE email_verifications SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(hours => $3))`, [user.id, hashToken(token), VERIFY_HOURS]
  );
  const link = `${appUrl(req)}/?verify=${token}`;
  return sendVerifyEmail({ to: user.email, username: user.username, link });
}

// POST /auth/verify-email { token } -> ยืนยันแล้วเข้าสู่ระบบทันที
router.post('/verify-email', async (req, res) => {
  const token = String((req.body || {}).token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'ลิงก์ยืนยันไม่ถูกต้อง', code: 'INVALID_LINK' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT v.id, v.user_id, v.expires_at, v.used_at FROM email_verifications v
        WHERE v.token_hash = $1 FOR UPDATE`, [hashToken(token)]
    );
    const v = rows[0];
    if (!v || v.used_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ลิงก์นี้ถูกใช้ไปแล้วหรือไม่ถูกต้อง — ขอลิงก์ใหม่ได้จากหน้าเข้าสู่ระบบ', code: 'INVALID_LINK' });
    }
    if (new Date(v.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่ได้จากหน้าเข้าสู่ระบบ', code: 'EXPIRED_LINK' });
    }
    await client.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [v.id]);
    const u = await client.query(
      `UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW())
        WHERE id = $1 RETURNING *`, [v.user_id]
    );
    await client.query('COMMIT');
    const user = u.rows[0];
    res.json({ ok: true, token: signToken(user.id, user.token_version || 0), user: publicUser(user) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[auth/verify-email]', err);
    res.status(500).json({ error: 'ยืนยันอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง' });
  } finally {
    client.release();
  }
});

// POST /auth/resend-verification { identifier } — ตอบเหมือนกันเสมอ (ไม่บอกว่ามีบัญชีนี้หรือไม่)
// หรือส่งพร้อม token (ผู้ใช้ที่เข้าสู่ระบบอยู่) เพื่อส่งให้บัญชีตัวเอง
router.post('/resend-verification', async (req, res) => {
  const genericOk = { ok: true, message: 'ถ้ามีบัญชีที่ยังไม่ยืนยันด้วยข้อมูลนี้ เราได้ส่งลิงก์ยืนยันไปที่อีเมลแล้ว' };
  try {
    const ip = clientIp(req);
    let user = null;
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      try {
        const p = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        user = (await pool.query('SELECT * FROM users WHERE id = $1', [p.userId])).rows[0] || null;
        if (user && (p.tv || 0) !== (user.token_version || 0)) user = null; // token ถูกเพิกถอนแล้ว
      } catch (_) { user = null; }
    }
    if (!user) {
      const id = String((req.body || {}).identifier || '').trim().toLowerCase().slice(0, 255);
      if (!id) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล' });
      user = (await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1', [id])).rows[0] || null;
    }
    const key = user ? `u:${user.id}` : `ip:${ip}`;
    if (resendLimiter.check(key) || resendLimiter.check(`rip:${ip}`)) {
      return res.status(429).json({ error: 'ขอส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', code: 'RATE_LIMITED' });
    }
    if (!user || user.email_verified || !user.email) return res.json(genericOk);
    await issueVerification(user, req);
    res.json(genericOk);
  } catch (err) {
    console.error('[auth/resend-verification]', err);
    res.status(500).json({ error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const gid = await pool.query(
      "SELECT email FROM user_identities WHERE user_id = $1 AND provider = 'google'", [user.id]
    ).catch(() => ({ rows: [] })); // ตารางยังไม่พร้อม (ก่อน migration 023) ก็ไม่พัง
    res.json({ user: { ...publicUser(user), hasPassword: Boolean(user.password_hash),
      googleLinked: gid.rows.length > 0, googleEmail: gid.rows[0] ? gid.rows[0].email : null } });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ' });
  }
});

// ออกจากระบบทุกอุปกรณ์ — เพิ่ม token_version ทำให้ token เดิมทั้งหมดใช้ไม่ได้
router.post('/logout-all', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
      [req.userId]
    );
    // ออก token ใหม่ให้เครื่องปัจจุบันใช้ต่อได้ (เครื่องอื่นจะหลุด)
    const token = signToken(req.userId, rows[0].token_version);
    res.json({ ok: true, token });
  } catch (err) {
    console.error('[auth/logout-all]', err);
    res.status(500).json({ error: 'ออกจากระบบทุกอุปกรณ์ไม่สำเร็จ' });
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
  if (String(password).length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LEN} ตัวอักษร` });
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

    // เพิ่ม token_version เพื่อเพิกถอน session เดิมทั้งหมด (เผื่อบัญชีถูกยึด)
    await client.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
      [passwordHash, userId]);
    await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1',
      [resetId]);
    // เผื่อมีใบอื่นค้างอยู่ ปิดให้หมด
    await client.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );

    const userRes = await client.query(
      'SELECT id, username, email, exp, avatar, avatar_image, token_version FROM users WHERE id = $1',
      [userId]
    );

    await client.query('COMMIT');

    // ล็อกอินให้เลยหลังตั้งรหัสใหม่สำเร็จ จะได้ไม่ต้องพิมพ์ซ้ำ
    const user = userRes.rows[0];
    const authToken = signToken(user.id, user.token_version || 0);
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
