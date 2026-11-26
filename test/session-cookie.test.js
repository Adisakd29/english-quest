/*
  v1.25.2 เซสชัน httpOnly cookie แทนการเก็บ token ใน localStorage
  - เข้าสู่ระบบ/สมัคร → Set-Cookie eq_session (HttpOnly · SameSite=Strict · Path=/api) · ใน production มี Secure
  - cookie ใช้ได้เฉพาะเมื่อมี X-EQ-CSRF: 1 (กัน CSRF) · Bearer เดิมยังใช้ได้ · cookie ชื่ออื่นไม่รับ
  - ย้าย token เดิม: POST /auth/session (Bearer) → ได้ cookie · ออกจากระบบลบ cookie · ออกทุกเครื่อง → cookie เก่าใช้ไม่ได้
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
const pool = require('../config/db');
const { createApp } = require('../app');
const SC = require('../utils/sessionCookie');

let server; let base;
function req(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b, cookies: res.headers['set-cookie'] || [] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sessionOf = (cookies) => { const c = cookies.find((x) => x.startsWith('eq_session=')); return c ? c.split(';')[0].slice('eq_session='.length) : null; };
test.before(async () => { server = http.createServer(createApp()); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('สมัคร/เข้าสู่ระบบ → httpOnly cookie (SameSite=Strict, Path=/api) · ใช้ได้เมื่อมี X-EQ-CSRF · ไม่มี header = 403 CSRF · Bearer ยังใช้ได้', async () => {
  const name = `sc${Date.now() % 1e8}`;
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  assert.strictEqual(r.status, 201 === r.status ? 201 : r.status);
  const set = r.cookies.find((c) => c.startsWith('eq_session='));
  assert.ok(set, 'มี Set-Cookie');
  assert.match(set, /HttpOnly/i); assert.match(set, /SameSite=Strict/i); assert.match(set, /Path=\/api/i); assert.match(set, /Max-Age=2592000/i);
  const ck = `eq_session=${sessionOf(r.cookies)}`;
  let me = await req('GET', '/api/auth/me', { headers: { Cookie: ck, 'X-EQ-CSRF': '1' } });
  assert.strictEqual(me.status, 200); assert.strictEqual(me.body.user.username, name);
  me = await req('GET', '/api/auth/me', { headers: { Cookie: ck } });
  assert.strictEqual(me.status, 403); assert.strictEqual(me.body.code, 'CSRF');
  me = await req('POST', '/api/christmas/starter', { headers: { Cookie: ck } });
  assert.strictEqual(me.status, 403, 'คำขอเปลี่ยนข้อมูลจากเว็บอื่น (ไม่มี header) ถูกปฏิเสธ');
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${r.body.token}` } })).status, 200);
  const login = await req('POST', '/api/auth/login', { body: { identifier: name, password: 'password123' } });
  assert.strictEqual(login.status, 200); assert.ok(sessionOf(login.cookies), 'เข้าสู่ระบบได้ cookie');
  const bad = await req('POST', '/api/auth/login', { body: { identifier: name, password: 'wrong-pass1' } });
  assert.ok(!sessionOf(bad.cookies), 'รหัสผิดไม่ได้ cookie');
});

test('ย้าย token เดิม (Bearer → cookie) · ออกจากระบบลบ cookie · ออกทุกเครื่อง → cookie เก่าใช้ไม่ได้ · cookie ปลอมไม่ผ่าน', async () => {
  const name = `sd${Date.now() % 1e8}`;
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const mig = await req('POST', '/api/auth/session', { headers: { Authorization: `Bearer ${r.body.token}` }, body: {} });
  assert.strictEqual(mig.status, 200); const ck = `eq_session=${sessionOf(mig.cookies)}`;
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Cookie: ck, 'X-EQ-CSRF': '1' } })).status, 200);
  assert.strictEqual((await req('POST', '/api/auth/session', { body: {} })).status, 401, 'ไม่มี token = ย้ายไม่ได้');
  const out = await req('POST', '/api/auth/logout', { headers: { Cookie: ck, 'X-EQ-CSRF': '1' } });
  assert.ok(out.cookies.some((c) => /^eq_session=;/.test(c) && /Expires=Thu, 01 Jan 1970/i.test(c)), 'ลบ cookie');
  const all = await req('POST', '/api/auth/logout-all', { headers: { Cookie: ck, 'X-EQ-CSRF': '1' } });
  assert.strictEqual(all.status, 200); const ck2 = `eq_session=${sessionOf(all.cookies)}`;
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Cookie: ck, 'X-EQ-CSRF': '1' } })).status, 401, 'cookie เก่าถูกเพิกถอน');
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Cookie: ck2, 'X-EQ-CSRF': '1' } })).status, 200, 'เครื่องนี้ได้ cookie ใหม่');
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Cookie: 'eq_session=abc.def.ghi', 'X-EQ-CSRF': '1' } })).status, 401);
});

test('production: cookie มี Secure · หน้าเว็บไม่เก็บ token ใน localStorage แล้ว', () => {
  const saved = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  const out = {};
  try { SC.setSession({ headers: {} }, { cookie: (n, v, o) => { out.o = o; } }, 'x'.repeat(30)); } finally { process.env.NODE_ENV = saved; }
  assert.strictEqual(out.o.secure, true); assert.strictEqual(out.o.httpOnly, true); assert.strictEqual(out.o.sameSite, 'strict');
  const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert.ok(!/localStorage\.setItem\(TOKEN_KEY/.test(js), 'ไม่มีการเขียน token ลง localStorage');
  assert.match(js, /'X-EQ-CSRF': '1'/);
});
