/*
  v1.10.0 Phase 1 — Premium Foundation + การแก้ไขจาก Audit
  - สถานะสมาชิก: free · trial (7 วัน ครั้งเดียว) · active · past_due · expired · canceled
  - ผู้ดูแล: ให้/ยกเลิกสิทธิ์ (ต้องมีเหตุผล) · Audit Log ทุกการกระทำ · ผู้ใช้ทั่วไปเรียกไม่ได้
  - โควตา AI ต่อวันตามสิทธิ์ (atomic) · แดชบอร์ด 6 ทักษะ (Free ได้คะแนน · Premium ได้ครบ) · EXP/คะแนน/CEFR แยกกัน
  - Audit fixes: ไม่เชื่อ X-Forwarded-For · เลิกรับ known:true · ชำนาญต้องทบทวนแบบเว้นช่วง · เพดาน EXP การ์ดต่อวัน · CSP report-only · จำกัดการสมัครต่อ IP
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.PROMPTPAY_ID = '0812345678';

const pool = require('../config/db');
const { createApp } = require('../app');
const M = require('../services/membership');
const Q = require('../services/aiQuota');
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
async function makeUser(prefix = 'p1') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function makeAdmin() { const u = await makeUser('pa'); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]); return u; }

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await wordStore.ready();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('สถานะ: free → ทดลองใช้ 7 วัน (ครั้งเดียว) · ป้าย/กระดานไม่นับ trial · หมวดเฉพาะสมาชิกเข้าได้ · past_due/expired', async () => {
  const u = await makeUser();
  let s = (await req('GET', '/api/membership', { token: u.token })).body.membership;
  assert.strictEqual(s.state, 'free'); assert.strictEqual(s.trialAvailable, true); assert.strictEqual(s.access, false);
  const t = await req('POST', '/api/membership/trial', { token: u.token, body: {} });
  assert.strictEqual(t.status, 200); assert.strictEqual(t.body.state, 'trial'); assert.ok(t.body.daysLeft >= 6 && t.body.daysLeft <= 7);
  assert.strictEqual((await req('POST', '/api/membership/trial', { token: u.token, body: {} })).status, 409, 'ทดลองได้ครั้งเดียว');
  const me = (await req('GET', '/api/auth/me', { token: u.token })).body.user.premium;
  assert.deepStrictEqual([me.active, me.trial, me.state], [true, true, 'trial']);
  assert.strictEqual((await req('GET', '/api/work', { token: u.token })).body.access, true, 'trial เข้าหมวดเฉพาะสมาชิกได้');
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 5, 'test')", [u.id]);
  const lb = (await req('GET', '/api/leaderboard?period=all', { token: u.token })).body;
  assert.strictEqual(lb.me.premium, false, 'ช่วงทดลองไม่ได้ป้าย Premium');
  await pool.query("UPDATE memberships SET expires_at = NOW() - INTERVAL '1 day' WHERE user_id = $1", [u.id]);
  s = await M.status(u.id); assert.strictEqual(s.state, 'past_due'); assert.strictEqual(s.access, false); assert.strictEqual(s.trialAvailable, false);
  await pool.query("UPDATE memberships SET expires_at = NOW() - INTERVAL '5 days' WHERE user_id = $1", [u.id]);
  assert.strictEqual((await M.status(u.id)).state, 'expired');
  assert.strictEqual((await req('POST', '/api/membership/trial', { token: u.token, body: {} })).status, 409, 'หมดแล้วก็ทดลองซ้ำไม่ได้');
});

test('ซื้อระหว่างทดลอง: สถานะ active + วันที่เหลือของ trial ไม่หาย · ผู้ดูแลให้/ยกเลิกสิทธิ์ (ต้องมีเหตุผล) · Audit Log', async () => {
  const u = await makeUser(); const admin = await makeAdmin();
  await req('POST', '/api/membership/trial', { token: u.token, body: {} });
  const o = (await req('POST', '/api/membership/orders', { token: u.token, body: { plan: 'monthly' } })).body;
  await req('POST', `/api/admin/membership/orders/${o.id}/approve`, { token: admin.token, body: {} });
  let s = await M.status(u.id);
  assert.strictEqual(s.state, 'active'); assert.ok(s.daysLeft >= 36 && s.daysLeft <= 37, `trial 7 + 30 = ${s.daysLeft}`);
  // สิทธิ์ผู้ดูแล
  assert.strictEqual((await req('GET', '/api/admin/membership/members', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${u.id}/revoke`, { token: u.token, body: { note: 'x' } })).status, 403);
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${u.id}/revoke`, { token: admin.token, body: { note: ' ' } })).status, 400);
  const rv = await req('POST', `/api/admin/membership/members/${u.id}/revoke`, { token: admin.token, body: { note: 'คืนเงินแล้ว' } });
  assert.strictEqual(rv.status, 200); assert.strictEqual(rv.body.state, 'canceled'); assert.strictEqual(rv.body.access, false);
  assert.strictEqual((await req('GET', '/api/work', { token: u.token })).body.access, false, 'ยกเลิกแล้วเข้าหมวดสมาชิกไม่ได้');
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${u.id}/revoke`, { token: admin.token, body: { note: 'ซ้ำ' } })).status, 409);
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${u.id}/grant`, { token: admin.token, body: { days: 0, note: 'x' } })).status, 400);
  const gr = await req('POST', `/api/admin/membership/members/${u.id}/grant`, { token: admin.token, body: { days: 10, note: 'ชดเชยระบบล่ม' } });
  assert.strictEqual(gr.body.state, 'active'); assert.ok(gr.body.daysLeft >= 9 && gr.body.daysLeft <= 10, 'ให้สิทธิ์หลังยกเลิก = นับจากวันนี้');
  const members = (await req('GET', `/api/admin/membership/members?q=${u.name}`, { token: admin.token })).body.members;
  assert.strictEqual(members[0].username, u.name); assert.strictEqual(members[0].trialUsed, true);
  const logs = (await req('GET', '/api/admin/membership/audit?limit=200', { token: admin.token })).body.logs.filter((l) => l.target === u.name);
  const acts = logs.map((l) => l.action);
  for (const a of ['trial_start', 'order_approve', 'membership_revoke', 'membership_grant']) assert.ok(acts.includes(a), `audit มี ${a}`);
  assert.ok(logs.find((l) => l.action === 'membership_revoke').details.note === 'คืนเงินแล้ว');
});

test('โควตา AI: Free ใช้ไม่ได้ · trial 3 ครั้ง/วัน · นับแบบ atomic เมื่อยิงพร้อมกัน', async () => {
  const f = await makeUser(); const t = await makeUser(); const p = await makeUser();
  assert.strictEqual((await Q.consume(f.id, 'speaking')).reason, 'NOT_ALLOWED');
  await req('POST', '/api/membership/trial', { token: t.token, body: {} });
  const r = []; for (let i = 0; i < 4; i += 1) r.push(await Q.consume(t.id, 'speaking'));
  assert.deepStrictEqual(r.map((x) => x.ok), [true, true, true, false]); assert.strictEqual(r[3].reason, 'QUOTA_EXCEEDED');
  await pool.query(`INSERT INTO memberships (user_id, plan, status, expires_at) VALUES ($1, 'monthly', 'active', NOW() + INTERVAL '5 days')`, [p.id]);
  const par = await Promise.all(Array.from({ length: 15 }, () => Q.consume(p.id, 'writing')));
  assert.strictEqual(par.filter((x) => x.ok).length, 10, 'เพดาน writing ของ Premium = 10 แม้ยิงพร้อมกัน');
  assert.strictEqual((await Q.consume(p.id, 'hack')).reason, 'BAD_FEATURE');
  const u = (await req('GET', '/api/membership', { token: p.token })).body.ai;
  assert.strictEqual(u.tier, 'premium'); assert.strictEqual(u.features.writing.remaining, 0); assert.strictEqual(u.configured, false);
});

test('แดชบอร์ด: Free ได้คะแนน 6 ทักษะ (ล็อกส่วนละเอียด) · Premium ได้ครบ · EXP/คะแนน/CEFR แยกกัน · คิวทบทวน + คำแนะนำ', async () => {
  const u = await makeUser();
  const free = (await req('GET', '/api/membership/dashboard', { token: u.token })).body;
  assert.strictEqual(free.locked, true); assert.strictEqual(free.skills.length, 6);
  assert.ok(!('weekly' in free) && !('recommendations' in free) && !('cefr' in free));
  // ข้อมูลจริง: คำศัพท์ 20 ข้อ (ถูก 15) · ฟัง 10 ข้อ · คำถึงกำหนดทบทวน 1 คำ · ผลวัดระดับ
  for (let i = 0; i < 20; i += 1) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, 'vocab', 'x', 'A1', $2)", [u.id, i < 15]);
  for (let i = 0; i < 10; i += 1) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct, source) VALUES ($1, 'listening', 'y', 'A1', $2, 'toeic')", [u.id, i < 3]);
  const w = wordStore.getLevelWords('A1').find((x) => wordStore.isPlayable(x.id));
  await pool.query(`INSERT INTO word_progress (user_id, word_id, level, status, ever_known, srs_reps, srs_due_at) VALUES ($1, $2, 'A1', 'learning', TRUE, 1, NOW() - INTERVAL '1 hour')`, [u.id, w.id]);
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at) VALUES ($1, '[]', 'completed', '{"overall":"B1","vocab":"B1","grammar":"A2"}', NOW())`, [u.id]);
  await pool.query(`INSERT INTO memberships (user_id, plan, status, expires_at) VALUES ($1, 'monthly', 'active', NOW() + INTERVAL '5 days')`, [u.id]);
  const d = (await req('GET', '/api/membership/dashboard', { token: u.token })).body;
  assert.strictEqual(d.locked, false);
  const sk = Object.fromEntries(d.skills.map((s) => [s.id, s]));
  assert.strictEqual(sk.vocab.answered, 20); assert.strictEqual(sk.vocab.score, Math.round(((15 + 6) / 30) * 100), 'ปรับด้วยค่าตั้งต้น');
  assert.strictEqual(sk.listening.status, 'weak'); assert.strictEqual(sk.reading.score, null); assert.strictEqual(sk.reading.status, 'few');
  assert.strictEqual(sk.vocab.detail.due, 1);
  assert.strictEqual(d.cefr[0].overall, 'B1', 'CEFR มาจากแบบวัดระดับ');
  assert.strictEqual(d.weekly.days.length, 14); assert.strictEqual(d.weekly.thisWeek.answered, 30);
  assert.ok(d.queue.some((q) => q.action === 'due-review'));
  assert.strictEqual(d.recommendations[0].action, 'due-review');
  assert.ok(d.recommendations.some((r) => /การฟัง/.test(r.th)), 'แนะนำทักษะที่อ่อนที่สุด');
  assert.ok(typeof d.exp.total === 'number' && !('cefr' in d.exp), 'EXP แยกจาก CEFR');
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
  // เพดาน EXP การ์ดต่อวัน
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 600, 'card_known')", [u.id]);
  const capped = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: words[2].id, level: 'A1', chosenWordId: words[2].id } })).body;
  assert.strictEqual(capped.gainedExp, 0); assert.strictEqual(capped.noExpReason, 'daily_cap'); assert.strictEqual(capped.status, 'learning', 'ความคืบหน้ายังนับ');
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
