/*
  v1.11.0 — ยกเลิกสมาชิก Premium (ฟีเจอร์เดิมของ Premium เปิดให้ทุกคน) + การแก้ไขจาก Audit (ย้ายมาจาก premium-phase1.test.js เดิม)
  - endpoint สมัคร/ทดลองใช้/จ่ายเงิน/สลิป/ผู้ดูแลตรวจสลิป ไม่มีแล้ว (404) · /auth/me ไม่มีสถานะสมาชิก · กระดานอันดับไม่มีป้าย
  - แดชบอร์ดการเรียน (/api/dashboard) ทุกคนได้ครบ · ตัวช่วยรักษา Streak ทุกคน · โควตา AI = 0 ทุกคน (ไม่ใช้ AI ที่คิดค่าโทเค็น)
  - ผู้ดูแล: รายชื่อผู้ใช้ + ธงบัญชีทดสอบ + ประวัติ อยู่ที่ /api/admin/users · ตาราง/ข้อมูลสมาชิกเดิมในฐานข้อมูลไม่ถูกลบ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const Q = require('../services/aiQuota');
const D = require('../services/toeic/daily');
const wordStore = require('../utils/wordStore');

let server; let base;
function req(method, p, { token, body, headers: extra } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let j = null; try { j = buf ? JSON.parse(buf) : null; } catch (_) { j = null; } resolve({ status: res.statusCode, body: j, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'np') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function makeAdmin() { const u = await makeUser('na'); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]); return u; }

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await wordStore.ready();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('ยกเลิกสมาชิก: endpoint สมัคร/ทดลอง/จ่าย/สลิป/ตรวจสลิปไม่มีแล้ว · /me ไม่มีสถานะสมาชิก · กระดานไม่มีป้าย · ข้อมูลเดิมในฐานข้อมูลไม่ถูกลบ', async () => {
  const u = await makeUser(); const admin = await makeAdmin();
  for (const [m, p] of [['GET', '/api/membership'], ['POST', '/api/membership/trial'], ['POST', '/api/membership/orders'], ['POST', '/api/membership/orders/1/slip'],
    ['GET', '/api/membership/dashboard']]) {
    assert.strictEqual((await req(m, p, { token: u.token, body: m === 'POST' ? {} : undefined })).status, 404, `${m} ${p}`);
  }
  for (const [m, p] of [['GET', '/api/admin/membership/orders'], ['POST', '/api/admin/membership/orders/1/approve'], ['POST', '/api/admin/membership/members/1/grant']]) {
    assert.strictEqual((await req(m, p, { token: admin.token, body: m === 'POST' ? {} : undefined })).status, 404, `${m} ${p}`);
  }
  const me = (await req('GET', '/api/auth/me', { token: u.token })).body.user;
  assert.ok(!('premium' in me), '/me ไม่มีสถานะสมาชิก');
  const lb = (await req('GET', '/api/leaderboard?period=week', { token: u.token })).body;
  assert.ok([...(lb.top || lb.entries || []), ...(lb.me ? [lb.me] : [])].every((e) => !('premium' in e)), 'กระดานอันดับไม่มีป้าย Premium');
  // ตารางเดิมยังอยู่ (ไม่ reset/ไม่ลบข้อมูล)
  const t = (await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name IN ('memberships', 'membership_orders', 'membership_trials')")).rows[0].n;
  assert.strictEqual(t, 3);
  await pool.query(`INSERT INTO memberships (user_id, plan, status, expires_at) VALUES ($1, 'monthly', 'active', NOW() + INTERVAL '5 days')`, [u.id]);
  assert.ok(!('premium' in (await req('GET', '/api/auth/me', { token: u.token })).body.user), 'แถวสมาชิกเก่าไม่มีผลกับแอปแล้ว');
});

test('โควตา AI: ระดับเดียวสำหรับทุกคน · 0 ครั้ง (ไม่ใช้ AI ที่คิดค่าโทเค็น) · ชนิดที่ไม่มีอยู่ถูกปฏิเสธ', async () => {
  const u = await makeUser();
  await pool.query(`INSERT INTO memberships (user_id, plan, status, expires_at) VALUES ($1, 'monthly', 'active', NOW() + INTERVAL '5 days') ON CONFLICT DO NOTHING`, [u.id]);
  assert.strictEqual(await Q.tierOf(u.id), 'free');
  assert.strictEqual((await Q.consume(u.id, 'speaking')).reason, 'NOT_ALLOWED');
  assert.strictEqual((await Q.consume(u.id, 'hack')).reason, 'BAD_FEATURE');
  const usage = await Q.usage(u.id);
  assert.strictEqual(usage.configured, false); assert.strictEqual(usage.features.writing.limit, 0);
});

test('แดชบอร์ดการเรียน: ทุกคนได้ครบ (ไม่ต้องเป็นสมาชิก) · EXP/คะแนน/CEFR แยกกัน · คิวทบทวน · คำแนะนำ', async () => {
  assert.strictEqual((await req('GET', '/api/dashboard')).status, 401);
  const u = await makeUser();
  for (let i = 0; i < 20; i += 1) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, 'vocab', 'x', 'A1', $2)", [u.id, i < 15]);
  for (let i = 0; i < 10; i += 1) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct, source) VALUES ($1, 'listening', 'y', 'A1', $2, 'toeic')", [u.id, i < 3]);
  const w = wordStore.getLevelWords('A1').find((x) => wordStore.isPlayable(x.id));
  await pool.query(`INSERT INTO word_progress (user_id, word_id, level, status, ever_known, srs_reps, srs_due_at) VALUES ($1, $2, 'A1', 'learning', TRUE, 1, NOW() - INTERVAL '1 hour')`, [u.id, w.id]);
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at) VALUES ($1, '[]', 'completed', '{"overall":"B1","vocab":"B1","grammar":"A2"}', NOW())`, [u.id]);
  const d = (await req('GET', '/api/dashboard', { token: u.token })).body;
  assert.strictEqual(d.locked, false);
  const sk = Object.fromEntries(d.skills.map((s) => [s.id, s]));
  assert.strictEqual(sk.vocab.answered, 20); assert.strictEqual(sk.vocab.score, Math.round(((15 + 6) / 30) * 100), 'ปรับด้วยค่าตั้งต้น');
  assert.strictEqual(sk.listening.status, 'weak'); assert.strictEqual(sk.reading.score, null); assert.strictEqual(sk.reading.status, 'few');
  assert.strictEqual(sk.vocab.detail.due, 1);
  assert.strictEqual(d.cefr[0].overall, 'B1', 'CEFR มาจากแบบวัดระดับ');
  assert.strictEqual(d.weekly.days.length, 14); assert.strictEqual(d.weekly.thisWeek.answered, 30);
  assert.ok(d.queue.some((q) => q.action === 'due-review'));
  assert.strictEqual(d.recommendations[0].action, 'due-review');
  assert.ok(typeof d.exp.total === 'number' && !('cefr' in d.exp), 'EXP แยกจาก CEFR');
});

test('ตัวช่วยรักษา Streak ทุกคน: พลาด 1 วันไม่ขาด (เดือนละ 2) · พลาด 2 วันติดขาด', async () => {
  const today = D._internal.bkkDay(); const day = (n) => D._internal.addDays(today, n);
  const seed = async (uid, ns) => { for (const n of ns) await pool.query(`INSERT INTO toeic_daily_plans (user_id, day, tasks, completed_at) VALUES ($1, $2, '[]', NOW())`, [uid, day(n)]); };
  const a = await makeUser();
  await seed(a.id, [0, -1, -3]);
  const p = await D._internal.streakOf(a.id, today);
  assert.strictEqual(p.current, 3); assert.strictEqual(p.week[4].frozen, true); assert.strictEqual(p.week[4].done, false);
  assert.ok(p.freeze && p.freeze.perMonth === 2);
  const b = await makeUser();
  await seed(b.id, [0, -3]);
  assert.strictEqual((await D._internal.streakOf(b.id, today)).current, 1);
});

test('ผู้ดูแล /api/admin/users: ต้องเป็นผู้ดูแล · ค้นหาผู้ใช้ (ไม่ส่งอีเมล) · ธงบัญชีทดสอบ · ประวัติ', async () => {
  const u = await makeUser(); const admin = await makeAdmin();
  assert.strictEqual((await req('GET', '/api/admin/users', { token: u.token })).status, 403);
  const l = (await req('GET', `/api/admin/users?q=${u.name}`, { token: admin.token })).body.users;
  assert.strictEqual(l.length, 1); assert.deepStrictEqual(Object.keys(l[0]).sort(), ['createdAt', 'isTest', 'userId', 'username']);
  assert.strictEqual((await req('POST', `/api/admin/users/${u.id}/test-flag`, { token: admin.token, body: { isTest: true } })).body.isTest, true);
  const a = (await req('GET', '/api/admin/users/audit?limit=5', { token: admin.token })).body.logs;
  assert.ok(a.some((x) => x.action === 'test_flag_on' && x.target === u.name));
  assert.strictEqual((await req('GET', '/api/admin/users?q=%25%27%3B--', { token: admin.token })).status, 200, 'อักขระพิเศษในคำค้นไม่ทำให้พัง');
});

test('Audit fixes: ไม่เชื่อ X-Forwarded-For · เลิกรับ known:true · เพดาน EXP การ์ดต่อวัน · คำถึงกำหนดทบทวน · CSP report-only · จำกัดการสมัครต่อ IP', async () => {
  const { clientIp } = require('../utils/security');
  assert.strictEqual(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4' }, ip: '5.6.7.8' }), '5.6.7.8');
  const u = await makeUser();
  const words = wordStore.getLevelWords('A1').filter((x) => wordStore.isPlayable(x.id));
  assert.strictEqual((await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[0].id, level: 'A1', known: true } })).status, 400, 'payload เก่า known:true ใช้ไม่ได้แล้ว');
  // ชำนาญต้องเว้นช่วง
  const r1 = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[1].id, level: 'A1', chosenWordId: words[1].id } })).body;
  assert.strictEqual(r1.status, 'learning'); assert.strictEqual(r1.gainedExp, 15);
  const path = (await req('GET', '/api/path', { token: u.token })).body;
  const unit = path.levels[0].units.find((x) => x.wordIds ? x.wordIds.includes(words[1].id) : false) || path.levels[0].units.find((x) => x.known > 0);
  assert.ok(unit && unit.known >= 1 && unit.mastered === 0, 'Unit นับ "ผ่าน" แล้วแต่ยังไม่ชำนาญ');
  // ถึงกำหนดทบทวน → words มี due · ตอบถูก = known
  await pool.query("UPDATE word_progress SET srs_due_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1 AND word_id = $2", [u.id, words[1].id]);
  const ws = (await req('GET', '/api/words/A1', { token: u.token })).body.words.find((x) => x.id === words[1].id);
  assert.deepStrictEqual([ws.passed, ws.due], [true, true]);
  assert.strictEqual((await req('GET', '/api/progress/due', { token: u.token })).body.total, 1);
  const r2 = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[1].id, level: 'A1', chosenWordId: words[1].id } })).body;
  assert.strictEqual(r2.status, 'known');
  // v1.13.0: การ์ดคำศัพท์ไม่มีเพดาน EXP รายวันโดยค่าเริ่มต้น (แม้วันนี้ได้ไปแล้ว 600)
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 600, 'card_known')", [u.id]);
  const free = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[2].id, level: 'A1', chosenWordId: words[2].id } })).body;
  assert.strictEqual(free.gainedExp, 15); assert.strictEqual(free.noExpReason, null);
  // เปิดเพดานกลับได้ด้วย env CARD_EXP_DAILY_CAP
  process.env.CARD_EXP_DAILY_CAP = '600';
  try {
    const capped = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[3].id, level: 'A1', chosenWordId: words[3].id } })).body;
    assert.strictEqual(capped.gainedExp, 0); assert.strictEqual(capped.noExpReason, 'daily_cap'); assert.strictEqual(capped.status, 'learning', 'ความคืบหน้ายังนับ');
  } finally { delete process.env.CARD_EXP_DAILY_CAP; }
  // CSP
  const h = await req('GET', '/api/health');
  // v1.10.0 Phase 5: ค่าเริ่มต้นเป็น enforce (ยังรายงานการละเมิด) · CSP_MODE=report ยังใช้ได้
  assert.match(h.headers['content-security-policy'], /default-src 'self'.*report-uri \/api\/csp-report/);
  assert.ok(!h.headers['content-security-policy-report-only']);
  // hash ของสคริปต์ตั้งธีมก่อนวาดหน้า (inline ตัวเดียวใน index.html) ตรงกับไฟล์จริงเสมอ — เพิ่มธีมใหม่แล้วไม่ถูกบล็อก
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const inl = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(inl.length, 1, 'มี inline script ตัวเดียว');
  assert.ok(h.headers['content-security-policy'].includes(`'sha256-${require('crypto').createHash('sha256').update(inl[0][1]).digest('base64')}'`), 'CSP มี hash ของสคริปต์ตั้งธีม');
  process.env.CSP_MODE = 'report';
  try { assert.match((await req('GET', '/api/health')).headers['content-security-policy-report-only'], /default-src 'self'/); } finally { delete process.env.CSP_MODE; }
  assert.strictEqual((await req('POST', '/api/csp-report', { body: { 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.example' } } })).status, 204);
  // จำกัดการสมัครต่อ IP (middleware โดยตรง — loopback ได้รับการยกเว้น)
  const { ipLimit } = require('../utils/rateLimit');
  const mw = ipLimit({ limit: 3, windowMs: 60000 });
  const codes = [];
  for (let i = 0; i < 5; i += 1) await new Promise((done) => mw({ ip: '203.0.113.9' }, { status: (c) => ({ json: () => { codes.push(c); done(); } }) }, () => { codes.push(200); done(); }));
  assert.deepStrictEqual(codes, [200, 200, 200, 429, 429]);
  let passed = 0; for (let i = 0; i < 5; i += 1) mw({ ip: '127.0.0.1' }, {}, () => { passed += 1; });
  assert.strictEqual(passed, 5);
  void crypto;
});
