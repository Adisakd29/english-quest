/*
  ภาษาอังกฤษเพื่อการทำงาน (เฉพาะสมาชิก Premium)
  - เนื้อหา: 6 หัวข้อ × 12 วลี ผ่าน validator · ไม่มีวลีซ้ำข้ามหัวข้อ
  - ยังไม่เป็นสมาชิก / หมดอายุ: เห็นตัวอย่าง 2 วลีต่อหัวข้อ · เริ่ม/ตอบแบบฝึกไม่ได้ (403) · ผู้ดูแลเข้าได้
  - แบบฝึก 10 ข้อ: ไม่มีเฉลยก่อนตอบ · สลับตัวเลือก · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · ของคนอื่นเข้าไม่ได้
  - ไม่ให้ EXP / Coin · ความคืบหน้า: ตอบถูกติดกัน 2 ครั้ง = ชำนาญ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const W = require('../services/work');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'wk') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const makePremium = async (u, days = 10) => pool.query(
  `INSERT INTO memberships (user_id, plan, expires_at) VALUES ($1, 'monthly', NOW() + ($2 || ' days')::interval)
   ON CONFLICT (user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`, [u.id, String(days)]);
const bank = () => W._internal.load();
/** ตำแหน่งที่ถูกของข้อที่แสดง: เทียบตัวเลือกที่แสดงกับคลัง */
function correctIndex(q) {
  for (const it of bank().items.values()) {
    const src = q.type === 'cloze' ? it.cloze : it.situation;
    const prompt = q.type === 'cloze' ? src.sentence : src.promptTH;
    if (prompt === q.prompt && [...q.options].sort().join('|') === [...src.options].sort().join('|')) return q.options.indexOf(src.options[src.answer]);
  }
  throw new Error('ไม่พบข้อในคลัง');
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('เนื้อหา: 6 หัวข้อ × 12 วลีผ่าน validator · ไม่มีวลีซ้ำข้ามหัวข้อ', () => {
  const out = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'work', 'validate.js')], { encoding: 'utf8' });
  assert.strictEqual((out.match(/✓/g) || []).length, 6, out);
  assert.strictEqual(bank().items.size, 72);
  for (const t of bank().topics.values()) assert.strictEqual(t.items.length, 12, t.id);
});

test('ยังไม่เป็นสมาชิก: ตัวอย่าง 2 วลี/หัวข้อ · ไม่มีเฉลย · เริ่ม/ตอบแบบฝึกไม่ได้ · หมดอายุ = เหมือนไม่เป็นสมาชิก · ต้องล็อกอิน', async () => {
  assert.strictEqual((await req('GET', '/api/work')).status, 401);
  const u = await makeUser();
  const h = (await req('GET', '/api/work', { token: u.token })).body;
  assert.strictEqual(h.access, false); assert.strictEqual(h.topics.length, 6);
  assert.ok(h.topics.every((t) => t.preview.length === 2 && t.total === 12));
  const t = (await req('GET', '/api/work/topics/emails', { token: u.token })).body;
  assert.strictEqual(t.locked, true); assert.strictEqual(t.items.length, 2);
  assert.ok(t.items.every((it) => !('situation' in it) && !('cloze' in it)), 'ไม่มีแบบฝึก/เฉลยในตัวอย่าง');
  const q = await req('POST', '/api/work/topics/emails/quiz', { token: u.token, body: {} });
  assert.strictEqual(q.status, 403); assert.strictEqual(q.body.code, 'PREMIUM_REQUIRED');
  assert.strictEqual((await req('GET', '/api/work/topics/nope', { token: u.token })).status, 404);
  assert.strictEqual((await req('GET', '/api/work/topics/constructor', { token: u.token })).status, 404);
  await makePremium(u, -1);   // หมดอายุแล้ว
  assert.strictEqual((await req('GET', '/api/work', { token: u.token })).body.access, false);
  assert.strictEqual((await req('POST', '/api/work/topics/emails/quiz', { token: u.token, body: {} })).status, 403);
});

test('สมาชิก: ครบ 12 วลี · แบบฝึก 10 ข้อไม่มีเฉลยก่อนตอบ · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · คนอื่นเข้าไม่ได้ · ไม่ให้ EXP/Coin', async () => {
  const u = await makeUser(); const other = await makeUser();
  await makePremium(u); await makePremium(other);
  assert.strictEqual((await req('GET', '/api/work', { token: u.token })).body.access, true);
  const t = (await req('GET', '/api/work/topics/meetings', { token: u.token })).body;
  assert.strictEqual(t.locked, false); assert.strictEqual(t.items.length, 12);
  assert.ok(t.items.every((it) => it.phrase && it.th && it.example && !('situation' in it) && !('cloze' in it)));
  const exp0 = (await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp;
  const s = (await req('POST', '/api/work/topics/meetings/quiz', { token: u.token, body: {} })).body;
  assert.strictEqual(s.total, 10); assert.strictEqual(s.questions.length, 10);
  assert.ok(s.questions.some((q) => q.type === 'cloze') && s.questions.some((q) => q.type === 'situation'));
  const raw = JSON.stringify(s.questions);
  assert.ok(!/whyTH|correctChoice|"answer"/.test(raw), 'ไม่มีเฉลยก่อนตอบ');
  const ids = new Set(); let right = 0;
  for (const q of s.questions) {
    const c = correctIndex(q);
    const pick = q.k % 2 ? c : (c + 1) % 4;   // ตอบถูกครึ่งหนึ่ง
    const r = (await req('POST', `/api/work/quiz/${s.id}/answer`, { token: u.token, body: { k: q.k, choice: pick } })).body;
    assert.strictEqual(r.correct, pick === c); assert.strictEqual(r.correctChoice, c); assert.ok(r.whyTH && r.example);
    if (r.correct) right += 1;
    ids.add(q.prompt);
  }
  assert.strictEqual(ids.size, 10, 'ไม่มีข้อซ้ำในชุด');
  assert.strictEqual((await req('POST', `/api/work/quiz/${s.id}/answer`, { token: u.token, body: { k: 0, choice: 0 } })).status, 409, 'ตอบซ้ำไม่ได้');
  assert.strictEqual((await req('POST', `/api/work/quiz/${s.id}/answer`, { token: u.token, body: { k: 99, choice: 0 } })).status, 400);
  assert.strictEqual((await req('POST', `/api/work/quiz/${s.id}/answer`, { token: other.token, body: { k: 0, choice: 0 } })).status, 404, 'ของคนอื่นเข้าไม่ได้');
  assert.strictEqual((await req('GET', `/api/work/quiz/${s.id}`, { token: other.token })).status, 404);
  const f = (await req('POST', `/api/work/quiz/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(f.score, right); assert.strictEqual(f.status, 'finished'); assert.strictEqual(f.topicTotal, 12);
  assert.strictEqual((await req('POST', `/api/work/quiz/${s.id}/answer`, { token: u.token, body: { k: 1, choice: 0 } })).status, 409);
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp, exp0, 'ไม่ให้ EXP');
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1', [u.id])).rows[0].n, 0, 'ไม่ให้ Coin');
  const h = (await req('GET', '/api/work', { token: u.token })).body.topics.find((x) => x.id === 'meetings');
  assert.strictEqual(h.practiced, 10); assert.strictEqual(h.accuracy, Math.round((right / 10) * 100));
});

test('ชำนาญ = ตอบถูกติดกัน 2 ครั้ง · ข้อที่ยังไม่ชำนาญถูกเลือกก่อน · ผู้ดูแลเข้าได้โดยไม่ต้องเป็นสมาชิก', async () => {
  const u = await makeUser(); await makePremium(u);
  for (let round = 0; round < 2; round += 1) {
    const s = (await req('POST', '/api/work/topics/calls/quiz', { token: u.token, body: {} })).body;
    for (const q of s.questions) await req('POST', `/api/work/quiz/${s.id}/answer`, { token: u.token, body: { k: q.k, choice: correctIndex(q) } });
    await req('POST', `/api/work/quiz/${s.id}/finish`, { token: u.token });
  }
  const h = (await req('GET', '/api/work', { token: u.token })).body.topics.find((x) => x.id === 'calls');
  assert.strictEqual(h.practiced, 12, 'รอบสองหยิบ 2 ข้อที่ยังไม่เคยทำมาก่อน');
  assert.ok(h.mastered >= 8 && h.mastered <= 10, `ชำนาญ ${h.mastered}`);
  const t = (await req('GET', '/api/work/topics/calls', { token: u.token })).body;
  assert.strictEqual(t.items.filter((it) => it.progress && it.progress.mastered).length, h.mastered);
  const admin = await makeUser('wa');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  assert.strictEqual((await req('GET', '/api/work', { token: admin.token })).body.access, true);
});
