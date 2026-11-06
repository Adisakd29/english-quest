/*
  TOEIC-style Reading Part 6 — Text Completion (ส่วนหัว/ตัวช่วยเหมือน toeic-part5.test.js)
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
const V6 = require('../services/toeic/part6Validator');
const P6 = require('../services/toeic/part6');
const bank = require('../services/toeic/bank');
const { PART6 } = require('../config/toeic');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part6', 'bank.json'), 'utf8')).passages;
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
async function makeUser(prefix = 't6') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
/** เฉลยฝั่งเซิร์ฟเวอร์ของช่อง (ชุดทดสอบเท่านั้น) */
async function keyOf(sid, id) {
  const { pid, k } = P6._internal.parseBlank(id);
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [sid]);
  const it = rows[0].items.find((x) => x.qid === pid);
  return P6._internal.correctLetter(byId.get(pid).questions[k - 1], it.vs[k - 1]);
}
const wrongOf = (l) => ['A', 'B', 'C', 'D'].find((x) => x !== l);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });
const ans = (u, sid, id, selected) => req('POST', `/api/toeic/p6/sessions/${sid}/answer`, { token: u.token, body: { id, selected } });

test('คลังข้อ Part 6: ผ่าน validator · 4 ช่องต่อบทความ · มีข้อเติมประโยค 1 ช่อง · คำตอบกระจาย · เข้า pool', async () => {
  assert.ok(BANK.length >= 30, `มี ${BANK.length} บทความ`);
  assert.deepStrictEqual(V6.validateBank(BANK), []);
  const pos = [0, 0, 0, 0]; BANK.forEach((p) => p.questions.forEach((q) => { pos[q.answer] += 1; }));
  pos.forEach((n) => assert.ok(n >= BANK.length * 4 * 0.2, `ตำแหน่งคำตอบ ${pos}`));
  assert.ok(BANK.every((p) => p.questions.some((q) => q.skill === 'context' || q.skill === 'transition')), 'ทุกบทความมีช่องที่ต้องใช้บริบท');
  assert.strictEqual((await bank.pool6()).length, BANK.length);
  const bad = JSON.parse(JSON.stringify(BANK[0])); bad.text = bad.text.replace('[[3]]', ''); bad.questions[0].kind = 'sentence';
  const r = V6.validatePassage(bad);
  assert.strictEqual(r.status, 'reviewNeeded'); assert.ok(r.errors.length >= 2);
  const full = P6._internal.fillText(BANK[0]);
  assert.ok(!/\[\[\d\]\]/.test(full));
});

test('Practice: ก่อนตอบไม่มีเฉลย · ตอบรายช่องได้เฉลยทันที · ครบ 4 ช่องได้คำแปลทั้งเรื่อง · ตอบซ้ำไม่ได้ · EXP · ชุดคนอื่นเข้าไม่ได้', async () => {
  const u = await makeUser(); const other = await makeUser();
  assert.strictEqual((await req('POST', '/api/toeic/p6/sessions', { body: { mode: 'practice' } })).status, 401);
  const s = (await req('POST', '/api/toeic/p6/sessions', { token: u.token, body: { mode: 'practice', size: 2 } })).body;
  assert.strictEqual(s.items.length, 2); assert.strictEqual(s.total, 8);
  s.items.forEach((it) => {
    assert.deepStrictEqual(Object.keys(it).sort(), ['blanks', 'docType', 'docTypeTh', 'n', 'pid', 'text', 'title']);
    it.blanks.forEach((b) => assert.deepStrictEqual(Object.keys(b).sort(), ['id', 'k', 'kind', 'options']));
    const p = byId.get(it.pid);
    assert.ok(!JSON.stringify(s).includes(p.translationTH.slice(0, 30)));
  });
  const it = s.items[0];
  const [b1, b2, b3, b4] = it.blanks;
  assert.strictEqual((await ans(u, s.id, b1.id, 'E')).status, 400);
  assert.strictEqual((await ans(u, s.id, 'P6-9999-1', 'A')).status, 400);
  assert.strictEqual((await ans(other, s.id, b1.id, 'A')).status, 404);
  const before = await userExp(u.id);
  const r1 = (await ans(u, s.id, b1.id, await keyOf(s.id, b1.id))).body;
  assert.strictEqual(r1.feedback.isCorrect, true); assert.strictEqual(r1.exp, PART6.exp.practiceCorrect); assert.ok(!r1.passage);
  assert.ok(r1.feedback.why && r1.feedback.options.every((o) => o.noteTH));
  assert.strictEqual(await userExp(u.id), before + PART6.exp.practiceCorrect);
  assert.strictEqual((await ans(u, s.id, b1.id, 'A')).status, 409);
  const r2 = (await ans(u, s.id, b2.id, wrongOf(await keyOf(s.id, b2.id)))).body;
  assert.strictEqual(r2.feedback.isCorrect, false); assert.strictEqual(r2.exp, 0);
  await ans(u, s.id, b3.id, await keyOf(s.id, b3.id));
  const r4 = (await ans(u, s.id, b4.id, await keyOf(s.id, b4.id))).body;
  assert.ok(r4.passage && r4.passage.translationTH && r4.passage.completed && !/\[\[/.test(r4.passage.completed), 'ครบ 4 ช่องได้คำแปลทั้งเรื่อง');
  const again = (await req('GET', `/api/toeic/p6/sessions/${s.id}`, { token: u.token })).body;
  assert.ok(again.items[0].feedback && again.items[0].blanks.every((b) => b.feedback) && !again.items[1].feedback);
  const m = (await req('GET', '/api/toeic/p6/mistakes', { token: u.token })).body;
  assert.strictEqual(m.items.length, 1); assert.strictEqual(m.items[0].wrongCount, 1);
  assert.ok(m.items[0].blanks.find((b) => b.id === b2.id).wrong);
  const fin = (await req('POST', `/api/toeic/p6/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, 3); assert.strictEqual(fin.result.total, 4);
  assert.strictEqual(fin.exp, PART6.exp.practiceComplete, 'ครบ 1 บทความ = โบนัสจบชุด');
  const coin = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key LIKE '%t6c:%'", [u.id])).rows[0].n;
  assert.strictEqual(coin, 10);
  const sum = (await req('GET', '/api/toeic/p6/summary', { token: u.token })).body;
  assert.strictEqual(sum.answered, 4); assert.strictEqual(sum.accuracy, 75); assert.strictEqual(sum.passagesPracticed, 1); assert.strictEqual(sum.mistakes, 1);
  // Part 5 / Part 1 ไม่ถูกนับรวม
  assert.strictEqual((await req('GET', '/api/toeic/p5/summary', { token: u.token })).body.answered, 0);
});

test('Mock: 4 บทความ 16 ข้อ · ประเภทเอกสารไม่ซ้ำ · เปลี่ยนคำตอบได้ · ไม่มีเฉลยก่อนส่ง · ไม่ตอบ = ผิด · หมดเวลา', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p6/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  assert.strictEqual(s.items.length, PART6.mockPassages); assert.strictEqual(s.total, 16);
  assert.strictEqual(new Set(s.items.map((it) => it.docType)).size, 4);
  assert.ok(Math.abs(Date.parse(s.deadline) - Date.parse(s.serverNow) - PART6.mockMinutes * 60000) < 5000);
  const b = s.items[0].blanks[0];
  const k = await keyOf(s.id, b.id);
  const r1 = (await ans(u, s.id, b.id, wrongOf(k))).body;
  assert.ok(!('feedback' in r1));
  assert.strictEqual((await ans(u, s.id, b.id, k)).body.changed, true);
  const mid = (await req('GET', `/api/toeic/p6/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(mid.items[0].blanks[0].selected, k); assert.ok(!mid.items[0].blanks[0].feedback);
  const fin = (await req('POST', `/api/toeic/p6/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.total, 16); assert.strictEqual(fin.result.correct, 1); assert.strictEqual(fin.result.unanswered, 15);
  assert.strictEqual(fin.exp, 0); assert.strictEqual(fin.result.review.length, 4);
  assert.ok(fin.result.review[0].feedback.translationTH);

  const t = (await req('POST', '/api/toeic/p6/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  for (const it of t.items.slice(0, 2)) for (const bl of it.blanks) await ans(u, t.id, bl.id, await keyOf(t.id, bl.id));
  await pool.query(`UPDATE toeic_sessions SET config = jsonb_set(config, '{deadline}', to_jsonb(to_char((NOW() - INTERVAL '1 minute') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) WHERE id = $1`, [t.id]);
  const late = await ans(u, t.id, t.items[3].blanks[0].id, 'A');
  assert.strictEqual(late.status, 409); assert.strictEqual(late.body.code, 'TIME_UP');
  const before = await userExp(u.id);
  const closed = (await req('GET', `/api/toeic/p6/sessions/${t.id}`, { token: u.token })).body;
  assert.strictEqual(closed.status, 'finished'); assert.strictEqual(closed.result.correct, 8);
  assert.strictEqual(await userExp(u.id) - before, PART6.exp.mockComplete);
});
