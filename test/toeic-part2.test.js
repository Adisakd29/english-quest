/*
  TOEIC-style Listening Part 2 — Question–Response (ส่วนหัว/ตัวช่วยเหมือน toeic-part5.test.js)
  - คลังข้อ: ทุกข้อผ่าน validator · ไม่มีประโยคซ้ำ · ตำแหน่งคำตอบกระจาย · production pool = verified
  - ความปลอดภัย: ไม่มีเฉลย/คำอธิบายก่อนตอบ · ลำดับตัวเลือกสลับ (permutation) · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ (Practice) · ชุดคนอื่นเข้าไม่ได้
  - Mock: 30 ข้อ · เปลี่ยนคำตอบได้ก่อนส่ง · ไม่มีเฉลยระหว่างทำ · ส่งก่อนครบ = ข้อที่ไม่ได้ตอบนับผิด · หมดเวลา = ตอบไม่ได้ + ปิดชุดเอง
  - EXP ครั้งเดียว · Coin ผ่านกฎ TOEIC เดิม · Error Notebook · Summary · ไม่กระทบ Part 1
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const V2 = require('../services/toeic/part2Validator');
const P2 = require('../services/toeic/part2');
const bank = require('../services/toeic/bank');
const { PART2 } = require('../config/toeic');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part2', 'bank.json'), 'utf8')).questions;
const byId = new Map(BANK.map((q) => [q.id, q]));

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
async function makeUser(prefix = 't2') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
/** เฉลยฝั่งเซิร์ฟเวอร์ (ชุดทดสอบเท่านั้น) */
async function keyOf(sid, qid) {
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [sid]);
  const it = rows[0].items.find((x) => x.qid === qid);
  return byId.get(qid).variants.find((v) => v.v === it.variant).correctOption;
}
const wrongOf = (l) => ['A', 'B', 'C'].find((x) => x !== l);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });
const PUBLIC = path.join(__dirname, '..', 'public');
const ans = (u, sid, qid, selected, extra = {}) => req('POST', `/api/toeic/p2/sessions/${sid}/answer`, { token: u.token, body: { qid, selected, ...extra } });

test('คลังข้อ Part 2: validator + ไฟล์เสียงครบ · 2 variant ต่อข้อ (ตำแหน่งคำตอบต่างกัน) · segments Q/A/B/C เรียงเวลา · ผู้ถาม/ผู้ตอบคนละเสียง', async () => {
  assert.ok(BANK.length >= 120, `มี ${BANK.length} ข้อ`);
  assert.deepStrictEqual(V2.validateBank(BANK, { publicDir: PUBLIC, checkFiles: true }), []);
  BANK.forEach((q) => {
    assert.strictEqual(q.variants.length, 2);
    const [a, b] = q.variants;
    assert.notStrictEqual(a.correctOption, b.correctOption, `${q.id}: variant ต้องเปลี่ยนตำแหน่งคำตอบ`);
    q.variants.forEach((v) => {
      const correctIdx = q.responses.findIndex((r) => r.isCorrect);
      assert.strictEqual(v.correctOption, ['A', 'B', 'C'][v.order.indexOf(correctIdx)]);
      assert.deepStrictEqual(v.audio.segments.map((sg) => sg.letter), ['Q', 'A', 'B', 'C']);
      v.audio.segments.forEach((sg, i) => { assert.ok(sg.end > sg.start); if (i) assert.ok(sg.start >= v.audio.segments[i - 1].end); });
      assert.ok(v.audio.duration >= v.audio.segments[3].end && v.audio.duration < 40);
      assert.notStrictEqual(v.speakers.prompt.voice, v.speakers.response.voice);
      assert.ok(fs.statSync(path.join(PUBLIC, v.audio.url)).size > 20000);
    });
  });
  const pos = [0, 0, 0]; BANK.forEach((q) => { pos[q.responses.findIndex((r) => r.isCorrect)] += 1; });
  pos.forEach((n) => assert.ok(n >= BANK.length * 0.25, `ตำแหน่งคำตอบ ${pos}`));
  assert.strictEqual((await bank.pool2()).length, BANK.length);
  const bad = JSON.parse(JSON.stringify(BANK[0])); bad.responses.forEach((r) => { r.isCorrect = true; }); bad.variants[0].audio.url = '/assets/toeic/p2/audio/none.mp3';
  const r = V2.validateQuestion(bad, { publicDir: PUBLIC, checkFiles: true });
  assert.strictEqual(r.status, 'reviewNeeded'); assert.ok(r.errors.length >= 2);
});

test('Practice: ก่อนตอบได้แค่เสียง (ไม่มีข้อความ/เฉลย) · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · EXP · Error Notebook · Coin', async () => {
  const u = await makeUser(); const other = await makeUser();
  assert.strictEqual((await req('POST', '/api/toeic/p2/sessions', { body: { mode: 'practice' } })).status, 401);
  const s = (await req('POST', '/api/toeic/p2/sessions', { token: u.token, body: { mode: 'practice', size: 10 } })).body;
  assert.strictEqual(s.items.length, 10);
  s.items.forEach((it) => {
    assert.deepStrictEqual(Object.keys(it).sort(), ['audio', 'n', 'qid']);
    const q = byId.get(it.qid);
    assert.ok(!JSON.stringify(it).includes(q.prompt) && !JSON.stringify(it).includes(q.responses[0].text));
  });
  const groups = s.items.map((it) => byId.get(it.qid).group).filter(Boolean);
  assert.strictEqual(new Set(groups).size, groups.length, 'โจทย์คล้ายกันไม่อยู่ชุดเดียวกัน');
  const [i0, i1] = s.items;
  assert.strictEqual((await ans(u, s.id, i0.qid, 'D')).status, 400);
  assert.strictEqual((await ans(other, s.id, i0.qid, 'A')).status, 404);
  const before = await userExp(u.id);
  const r = (await ans(u, s.id, i0.qid, await keyOf(s.id, i0.qid), { responseMs: 3000 })).body;
  assert.strictEqual(r.feedback.isCorrect, true); assert.strictEqual(r.exp, PART2.exp.practiceCorrect);
  assert.strictEqual(r.feedback.responses.length, 3); assert.ok(r.feedback.prompt && r.feedback.promptTH && r.feedback.why);
  assert.strictEqual(r.feedback.responses.find((x) => x.letter === r.feedback.correctOption).isCorrect, true);
  assert.strictEqual(await userExp(u.id), before + PART2.exp.practiceCorrect);
  assert.strictEqual((await ans(u, s.id, i0.qid, 'A')).status, 409);
  const w = (await ans(u, s.id, i1.qid, wrongOf(await keyOf(s.id, i1.qid)))).body;
  assert.strictEqual(w.feedback.isCorrect, false); assert.strictEqual(w.exp, 0);
  const m = (await req('GET', '/api/toeic/p2/mistakes', { token: u.token })).body;
  assert.deepStrictEqual(m.items.map((x) => x.qid), [i1.qid]); assert.ok(m.items[0].distractorSelectedTH);
  for (const it of s.items.slice(2, 5)) await ans(u, s.id, it.qid, await keyOf(s.id, it.qid));
  const fin = (await req('POST', `/api/toeic/p2/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, 4); assert.strictEqual(fin.result.total, 5);
  assert.strictEqual(fin.exp, PART2.exp.practiceComplete);
  assert.strictEqual(fin.result.traps.length, 1);
  const coin = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key LIKE '%t2c:%'", [u.id])).rows[0].n;
  assert.strictEqual(coin, 10);
  const sum = (await req('GET', '/api/toeic/p2/summary', { token: u.token })).body;
  assert.strictEqual(sum.answered, 5); assert.strictEqual(sum.accuracy, 80); assert.strictEqual(sum.mistakes, 1);
  assert.strictEqual((await req('GET', '/api/toeic/p1/summary', { token: u.token })).body.answered, 0, 'Part 1 ไม่ถูกนับรวม');
});

test('Mock: 25 ข้อ · สัดส่วนประเภทคำถาม · ไม่บอกถูกผิดระหว่างทำ · ข้อที่ผ่านไปแล้วย้อนกลับมาตอบไม่ได้ · ไม่ตอบ = ผิด', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p2/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  assert.strictEqual(s.items.length, PART2.mockSize); assert.strictEqual(s.passed, 0);
  const cats = {}; s.items.forEach((it) => { const c = byId.get(it.qid).category; cats[c] = (cats[c] || 0) + 1; });
  assert.strictEqual(cats.wh, 12);
  const [a, b, c] = s.items;
  const r1 = (await ans(u, s.id, a.qid, await keyOf(s.id, a.qid))).body;
  assert.ok(!('feedback' in r1));
  await req('POST', `/api/toeic/p2/sessions/${s.id}/advance`, { token: u.token, body: { passed: 2 } });
  const late = await ans(u, s.id, b.qid, 'A');
  assert.strictEqual(late.status, 409); assert.strictEqual(late.body.code, 'PASSED');
  await req('POST', `/api/toeic/p2/sessions/${s.id}/advance`, { token: u.token, body: { passed: 1 } });   // ถอยกลับไม่ได้
  const again = (await req('GET', `/api/toeic/p2/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(again.passed, 2); assert.ok(!again.items[0].feedback);
  await ans(u, s.id, c.qid, wrongOf(await keyOf(s.id, c.qid)));
  const fin = (await req('POST', `/api/toeic/p2/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.total, 25); assert.strictEqual(fin.result.correct, 1); assert.strictEqual(fin.result.unanswered, 23); assert.strictEqual(fin.result.incorrect, 1);
  assert.strictEqual(fin.exp, 0); assert.strictEqual(fin.result.review.length, 25);
  assert.strictEqual((await req('POST', `/api/toeic/p2/sessions/${s.id}/advance`, { token: u.token, body: { passed: 3 } })).status, 409);
  // ตอบ ≥ ครึ่งชุด → EXP Mock
  const t = (await req('POST', '/api/toeic/p2/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  for (const it of t.items.slice(0, 13)) await ans(u, t.id, it.qid, await keyOf(t.id, it.qid));
  const f2 = (await req('POST', `/api/toeic/p2/sessions/${t.id}/finish`, { token: u.token })).body;
  assert.strictEqual(f2.exp, PART2.exp.mockComplete); assert.strictEqual(f2.result.correct, 13);
});
