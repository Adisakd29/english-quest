/*
  TOEIC-style Reading Part 7 — Reading Comprehension (ส่วนหัว/ตัวช่วยเหมือน toeic-part5.test.js)
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
const V7 = require('../services/toeic/part7Validator');
const P7 = require('../services/toeic/part7');
const bank = require('../services/toeic/bank');
const { PART7 } = require('../config/toeic');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part7', 'bank.json'), 'utf8')).sets;
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
async function makeUser(prefix = 't7') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
/** เฉลยฝั่งเซิร์ฟเวอร์ของข้อ (ชุดทดสอบเท่านั้น) */
async function keyOf(sid, id) {
  const { pid, k } = P7._internal.parseQ(id);
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [sid]);
  const it = rows[0].items.find((x) => x.qid === pid);
  return P7._internal.correctLetter(byId.get(pid).questions[k - 1], it.vs[k - 1]);
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
const ans = (u, sid, id, selected) => req('POST', `/api/toeic/p7/sessions/${sid}/answer`, { token: u.token, body: { id, selected } });

test('คลังข้อ Part 7: ผ่าน validator · เอกสารเดี่ยว/2/3 ฉบับ · หลักฐานยกจากเอกสารตรงตัว · ข้อแทรกประโยคไม่สลับตัวเลือก', async () => {
  assert.ok(BANK.length >= 40);
  assert.deepStrictEqual(V7.validateBank(BANK), []);
  const fm = {}; BANK.forEach((p) => { fm[p.format] = (fm[p.format] || 0) + 1; });
  Object.entries(PART7.mockPlan).forEach(([f, n]) => assert.ok((fm[f] || 0) >= n * 3, `${f} ${fm[f]}`));
  const pos = [0, 0, 0, 0]; let n = 0; BANK.forEach((p) => p.questions.forEach((q) => { pos[q.answer] += 1; n += 1; }));
  pos.forEach((x) => assert.ok(x >= n * 0.2, `ตำแหน่งคำตอบ ${pos}`));
  assert.strictEqual((await bank.pool7()).length, BANK.length);
  const bad = JSON.parse(JSON.stringify(BANK.find((p) => p.format === 'double')));
  bad.questions.forEach((q) => { if (q.type === 'crossReference') q.type = 'detail'; }); bad.questions[0].evidence = ['this phrase is not in the text at all'];
  const r = V7.validateSet(bad);
  assert.strictEqual(r.status, 'reviewNeeded'); assert.ok(r.errors.length >= 2);
});

test('Practice: ก่อนตอบไม่มีเฉลย/หลักฐาน/คำแปล · เฉลยรายข้อพร้อมหลักฐาน · ครบชุดได้คำแปล · ข้อแทรกประโยค · EXP · Coin', async () => {
  const u = await makeUser(); const other = await makeUser();
  assert.strictEqual((await req('POST', '/api/toeic/p7/sessions', { body: { mode: 'practice' } })).status, 401);
  const s = (await req('POST', '/api/toeic/p7/sessions', { token: u.token, body: { mode: 'practice', size: 3, format: 'single' } })).body;
  assert.strictEqual(s.items.length, 3); assert.ok(s.items.every((it) => it.format === 'single'));
  s.items.forEach((it) => {
    assert.deepStrictEqual(Object.keys(it).sort(), ['docs', 'format', 'formatTh', 'n', 'pid', 'questions', 'start']);
    it.questions.forEach((q) => assert.deepStrictEqual(Object.keys(q).sort(), ['id', 'k', 'options', 'sentence', 'stem', 'type']));
    const p = byId.get(it.pid);
    assert.ok(!JSON.stringify(s).includes(p.translationTH[0]) && !JSON.stringify(s).includes(p.tipTH));
  });
  const it = s.items[0]; const qs = it.questions;
  assert.strictEqual((await ans(u, s.id, qs[0].id, 'E')).status, 400);
  assert.strictEqual((await ans(u, s.id, 'P7-9999-1', 'A')).status, 400);
  assert.strictEqual((await ans(other, s.id, qs[0].id, 'A')).status, 404);
  const before = await userExp(u.id);
  const r1 = (await ans(u, s.id, qs[0].id, await keyOf(s.id, qs[0].id))).body;
  assert.strictEqual(r1.feedback.isCorrect, true); assert.strictEqual(r1.exp, PART7.exp.practiceCorrect);
  assert.ok(r1.feedback.why && r1.feedback.options.every((o) => o.noteTH));
  if (r1.feedback.type !== 'insertion') assert.ok(r1.feedback.evidence.length >= 1);
  assert.strictEqual(await userExp(u.id), before + PART7.exp.practiceCorrect);
  assert.strictEqual((await ans(u, s.id, qs[0].id, 'A')).status, 409);
  const r2 = (await ans(u, s.id, qs[1].id, wrongOf(await keyOf(s.id, qs[1].id)))).body;
  assert.strictEqual(r2.feedback.isCorrect, false); assert.strictEqual(r2.exp, 0);
  let last = r2;
  for (const q of qs.slice(2)) last = (await ans(u, s.id, q.id, await keyOf(s.id, q.id))).body;
  assert.ok(last.set && last.set.translationTH.length === 1 && last.set.tip, 'ครบชุดได้คำแปลเอกสาร');
  const m = (await req('GET', '/api/toeic/p7/mistakes', { token: u.token })).body;
  assert.strictEqual(m.items.length, 1); assert.strictEqual(m.items[0].wrongCount, 1);
  const fin = (await req('POST', `/api/toeic/p7/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.total, qs.length); assert.strictEqual(fin.result.correct, qs.length - 1);
  assert.strictEqual(fin.exp, PART7.exp.practiceComplete);
  const coin = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key LIKE '%t7c:%'", [u.id])).rows[0].n;
  assert.strictEqual(coin, 10);
  const sum = (await req('GET', '/api/toeic/p7/summary', { token: u.token })).body;
  assert.strictEqual(sum.answered, qs.length); assert.strictEqual(sum.setsPracticed, 1); assert.strictEqual(sum.mistakes, 1);

  // ข้อแทรกประโยค: ตัวเลือกเป็น [1]–[4] ตามลำดับเสมอ
  const insSet = BANK.find((p) => p.questions.some((q) => q.type === 'insertion'));
  const pub = P7._internal.publicItem(insSet, insSet.questions.map((q) => (q.type === 'insertion' ? 0 : 5)), 1);
  assert.deepStrictEqual(pub.questions.find((q) => q.type === 'insertion').options, ['[1]', '[2]', '[3]', '[4]']);
  const s2 = await P7.startSession(u.id, 'practice', { size: 5 });
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [s2.id]);
  rows[0].items.forEach((x) => byId.get(x.qid).questions.forEach((q, k) => { if (q.type === 'insertion') assert.strictEqual(x.vs[k], 0); }));
});

test('Mock: เอกสารเดี่ยว 4 + 2 ฉบับ 1 + 3 ฉบับ 1 · 1 นาที/ข้อ · เปลี่ยนคำตอบได้ · ไม่ตอบ = ผิด · หมดเวลา', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p7/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  assert.deepStrictEqual(s.items.map((it) => it.format), ['single', 'single', 'single', 'single', 'double', 'triple']);
  assert.ok(s.items.some((it) => it.docs[0].docType === 'chat'), 'มีแชทอย่างน้อย 1 ชุด');
  assert.strictEqual(new Set(s.items.slice(0, 4).map((it) => it.docs[0].docType)).size, 4);
  assert.strictEqual(s.total, s.items.reduce((a, it) => a + it.questions.length, 0));
  assert.ok(Math.abs(Date.parse(s.deadline) - Date.parse(s.serverNow) - s.config.minutes * 60000) < 5000);
  assert.strictEqual(s.config.minutes, Math.round(s.total * PART7.secondsPerQuestion / 60));
  assert.deepStrictEqual(s.items.map((it) => it.start), s.items.reduce((acc, it, i) => [...acc, i ? acc[i - 1] + s.items[i - 1].questions.length : 1], []));
  const q = s.items[0].questions[0];
  const k = await keyOf(s.id, q.id);
  const r1 = (await ans(u, s.id, q.id, wrongOf(k))).body;
  assert.ok(!('feedback' in r1));
  assert.strictEqual((await ans(u, s.id, q.id, k)).body.changed, true);
  const fin = (await req('POST', `/api/toeic/p7/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.total, s.total); assert.strictEqual(fin.result.correct, 1); assert.strictEqual(fin.result.unanswered, s.total - 1);
  assert.strictEqual(fin.exp, 0); assert.strictEqual(fin.result.review.length, 6);
  assert.ok(fin.result.formats.single && fin.result.formats.multi);

  const t = (await req('POST', '/api/toeic/p7/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  let done = 0;
  for (const it of t.items) for (const x of it.questions) { if (done * 2 >= t.total + 1) break; await ans(u, t.id, x.id, await keyOf(t.id, x.id)); done += 1; }
  await pool.query(`UPDATE toeic_sessions SET config = jsonb_set(config, '{deadline}', to_jsonb(to_char((NOW() - INTERVAL '1 minute') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) WHERE id = $1`, [t.id]);
  const late = await ans(u, t.id, t.items[5].questions[4].id, 'A');
  assert.strictEqual(late.status, 409); assert.strictEqual(late.body.code, 'TIME_UP');
  const before = await userExp(u.id);
  const closed = (await req('GET', `/api/toeic/p7/sessions/${t.id}`, { token: u.token })).body;
  assert.strictEqual(closed.status, 'finished'); assert.strictEqual(closed.result.correct, done);
  assert.strictEqual(await userExp(u.id) - before, PART7.exp.mockComplete);
});
