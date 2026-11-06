/*
  TOEIC-style Reading Part 5 — Incomplete Sentences
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
const V5 = require('../services/toeic/part5Validator');
const P5 = require('../services/toeic/part5');
const bank = require('../services/toeic/bank');
const { PART5 } = require('../config/toeic');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part5', 'bank.json'), 'utf8')).questions;
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
async function makeUser(prefix = 't5') {
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
  return P5._internal.correctLetter(byId.get(qid), it.variant);
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

test('คลังข้อ Part 5: ผ่าน validator ทุกข้อ · ไม่ซ้ำ · คำตอบกระจาย A–D · ครอบคลุมทุกกลุ่มทักษะ · เข้า pool (verified)', async () => {
  assert.ok(BANK.length >= 150, `มี ${BANK.length} ข้อ`);
  assert.deepStrictEqual(V5.validateBank(BANK), []);
  const pos = [0, 0, 0, 0]; BANK.forEach((q) => { pos[q.answer] += 1; });
  pos.forEach((n) => assert.ok(n >= BANK.length * 0.2, `ตำแหน่งคำตอบ ${pos}`));
  const groups = new Set(BANK.map((q) => P5._internal.groupOf(q.skill)));
  Object.keys(PART5.skillGroups).forEach((g) => assert.ok(groups.has(g), `ไม่มีข้อกลุ่ม ${g}`));
  Object.entries(PART5.mockPlan).forEach(([g, n]) => assert.ok(BANK.filter((q) => P5._internal.groupOf(q.skill) === g).length >= n * 2, `กลุ่ม ${g} มีข้อน้อยเกินไปสำหรับ Mock`));
  assert.strictEqual((await bank.pool5()).length, BANK.length);
  // validator จับข้อเสีย
  const bad = { ...BANK[0], sentence: 'No blank here at all in this sentence okay.', options: ['a', 'a', 'b'], answer: 5 };
  const r = V5.validateQuestion(bad);
  assert.strictEqual(r.status, 'reviewNeeded'); assert.ok(r.errors.length >= 3);
  // permutation: 24 แบบไม่ซ้ำ · เฉลยตามลำดับที่สลับ
  assert.strictEqual(new Set(P5._internal.PERMS.map((p) => p.join(''))).size, 24);
  const q = BANK[0];
  for (let v = 0; v < 24; v += 1) {
    const pub = P5._internal.publicItem(q, v, 1);
    assert.strictEqual(pub.options[['A', 'B', 'C', 'D'].indexOf(P5._internal.correctLetter(q, v))], q.options[q.answer]);
  }
});

test('Practice: ก่อนตอบไม่มีเฉลย · หลังตอบได้คำอธิบายครบ · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · EXP ครั้งเดียวต่อข้อต่อวัน', async () => {
  const u = await makeUser(); const other = await makeUser();
  assert.strictEqual((await req('POST', '/api/toeic/p5/sessions', { body: { mode: 'practice' } })).status, 401);
  const s = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'practice', size: 10 } })).body;
  assert.strictEqual(s.items.length, 10); assert.strictEqual(s.part, 5);
  // ก่อนตอบ: แต่ละข้อมีแค่ n · qid · ประโยค · ตัวเลือก (ไม่มีเฉลย/คำแปล/คำอธิบาย)
  s.items.forEach((it) => assert.deepStrictEqual(Object.keys(it).sort(), ['n', 'options', 'qid', 'sentence']));
  const raw = JSON.stringify(s);
  s.items.forEach((it) => { const q = byId.get(it.qid); assert.ok(!raw.includes(q.translationTH) && !raw.includes(q.explanationTH)); });
  s.items.forEach((it) => { assert.strictEqual(it.options.length, 4); assert.ok(it.sentence.includes('-------')); });
  // ข้อในชุดเดียวกันไม่มีคำตอบซ้ำกัน
  const ans = s.items.map((it) => { const q = byId.get(it.qid); return q.options[q.answer].toLowerCase(); });
  assert.strictEqual(new Set(ans).size, ans.length);
  const [i0, i1] = s.items;
  const k0 = await keyOf(s.id, i0.qid);
  assert.strictEqual((await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: i0.qid, selected: 'E' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: 'P5-9999', selected: 'A' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: other.token, body: { qid: i0.qid, selected: 'A' } })).status, 404, 'ชุดของคนอื่น');
  const before = await userExp(u.id);
  const r = (await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: i0.qid, selected: k0, responseMs: 9000 } })).body;
  assert.strictEqual(r.feedback.isCorrect, true); assert.strictEqual(r.feedback.correctOption, k0);
  assert.strictEqual(r.exp, PART5.exp.practiceCorrect);
  assert.strictEqual(r.feedback.options.length, 4); assert.ok(r.feedback.options.every((o) => o.noteTH));
  assert.ok(r.feedback.translationTH && r.feedback.why && r.feedback.tip && !r.feedback.completed.includes('-------'));
  assert.strictEqual(r.feedback.options.find((o) => o.letter === k0).isCorrect, true);
  assert.strictEqual(await userExp(u.id), before + PART5.exp.practiceCorrect);
  assert.strictEqual((await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: i0.qid, selected: k0 } })).status, 409, 'ตอบซ้ำไม่ได้');
  const w = (await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: i1.qid, selected: wrongOf(await keyOf(s.id, i1.qid)) } })).body;
  assert.strictEqual(w.feedback.isCorrect, false); assert.strictEqual(w.exp, 0);
  // กลับมาเปิดชุดเดิม: เห็น feedback ข้อที่ตอบแล้ว
  const again = (await req('GET', `/api/toeic/p5/sessions/${s.id}`, { token: u.token })).body;
  assert.ok(again.items[0].feedback && again.items[1].feedback && !again.items[2].feedback);
  // Error Notebook + summary
  const m = (await req('GET', '/api/toeic/p5/mistakes', { token: u.token })).body;
  assert.deepStrictEqual(m.items.map((x) => x.qid), [i1.qid]);
  const fin = (await req('POST', `/api/toeic/p5/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, 1); assert.strictEqual(fin.result.total, 2);
  assert.strictEqual(fin.exp, 0, 'ตอบไม่ถึง 5 ข้อไม่ได้โบนัสจบชุด');
  const sum = (await req('GET', '/api/toeic/p5/summary', { token: u.token })).body;
  assert.strictEqual(sum.answered, 2); assert.strictEqual(sum.accuracy, 50); assert.strictEqual(sum.mistakes, 1);
  assert.strictEqual(sum.bankSize, BANK.length);
  // ชุดใหม่ในวันเดียวกัน: ข้อเดิมที่ตอบถูกไม่ได้ EXP ซ้ำ
  await pool.query("UPDATE toeic_sessions SET status='abandoned' WHERE user_id=$1", [u.id]);
  const s2 = (await P5.startSession(u.id, 'practice', { size: 10 }));
  await pool.query('UPDATE toeic_sessions SET items = $2 WHERE id = $1', [s2.id, JSON.stringify([{ qid: i0.qid, variant: 3 }])]);
  const r2 = (await req('POST', `/api/toeic/p5/sessions/${s2.id}/answer`, { token: u.token, body: { qid: i0.qid, selected: await keyOf(s2.id, i0.qid) } })).body;
  assert.strictEqual(r2.feedback.isCorrect, true); assert.strictEqual(r2.exp, 0, 'EXP ข้อละครั้งต่อวัน');
  // Part 1 ไม่ได้รับผลกระทบ
  const p1 = (await req('GET', '/api/toeic/p1/summary', { token: u.token })).body;
  assert.strictEqual(p1.answered, 0);
});

test('Practice ครบชุด: โบนัสจบชุด + เต็มร้อย · Coin ผ่านกฎ TOEIC · ทำข้อที่เคยผิด (mistakes)', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'practice', size: 10, focus: 'vocabulary' } })).body;
  assert.ok(s.items.every((it) => byId.get(it.qid).category === 'vocabulary'), 'focus vocabulary');
  for (const it of s.items) await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: await keyOf(s.id, it.qid) } });
  const fin = (await req('POST', `/api/toeic/p5/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.accuracy, 100);
  assert.strictEqual(fin.exp, PART5.exp.practiceComplete + PART5.exp.practicePerfect);
  const coin = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key LIKE '%t5c:%'", [u.id])).rows[0].n;
  assert.strictEqual(coin, 10, 'Coin ตามกฎ TOEIC_PRACTICE');
  const again = (await req('POST', `/api/toeic/p5/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(again.exp, 0); assert.strictEqual(again.already, true);
  const noMist = await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'practice', source: 'mistakes' } });
  assert.strictEqual(noMist.status, 404);
});

test('Mock: 30 ข้อ · เปลี่ยนคำตอบได้ · ไม่บอกถูกผิดระหว่างทำ · ส่งก่อนครบ (ไม่ตอบ = ผิด) · หมดเวลา = ปิดชุด', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  assert.strictEqual(s.items.length, PART5.mockSize); assert.ok(s.deadline);
  const left = Date.parse(s.deadline) - Date.parse(s.serverNow);
  assert.ok(Math.abs(left - PART5.mockMinutes * 60000) < 5000);
  const groups = {}; s.items.forEach((it) => { const g = P5._internal.groupOf(byId.get(it.qid).skill); groups[g] = (groups[g] || 0) + 1; });
  assert.deepStrictEqual(groups, PART5.mockPlan, 'สัดส่วนตามแผน');
  const ans = s.items.map((it) => { const q = byId.get(it.qid); return q.options[q.answer].toLowerCase(); });
  assert.strictEqual(new Set(ans).size, ans.length, 'ไม่มีข้อที่คำตอบซ้ำกันในชุด');
  const [a, b] = s.items;
  const ka = await keyOf(s.id, a.qid);
  const r1 = (await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: a.qid, selected: wrongOf(ka) } })).body;
  assert.ok(!('feedback' in r1) && !JSON.stringify(r1).includes('correct'));
  const r2 = (await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: a.qid, selected: ka } })).body;
  assert.strictEqual(r2.changed, true);
  await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: b.qid, selected: wrongOf(await keyOf(s.id, b.qid)) } });
  const mid = (await req('GET', `/api/toeic/p5/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(mid.items[0].selected, ka); assert.ok(!mid.items[0].feedback, 'Mock ไม่มีเฉลยก่อนส่ง');
  assert.strictEqual((await req('GET', '/api/toeic/p5/mistakes', { token: u.token })).body.items.length, 0, 'Mock ที่ยังไม่ส่งไม่เข้า Error Notebook');
  const fin = (await req('POST', `/api/toeic/p5/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.total, 30); assert.strictEqual(fin.result.correct, 1);
  assert.strictEqual(fin.result.unanswered, 28); assert.strictEqual(fin.result.incorrect, 1);
  assert.strictEqual(fin.exp, 0, 'ตอบไม่ถึงครึ่งชุดไม่ได้ EXP');
  assert.strictEqual(fin.result.review.length, 30); assert.ok(fin.result.review[0].why);
  assert.strictEqual((await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: b.qid, selected: 'A' } })).status, 409);
  assert.strictEqual((await req('GET', '/api/toeic/p5/mistakes', { token: u.token })).body.items.length, 1);

  // หมดเวลา: ตอบไม่ได้ · เปิดชุดอีกครั้ง = ปิดให้อัตโนมัติ
  const t = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  for (const it of t.items.slice(0, 16)) await req('POST', `/api/toeic/p5/sessions/${t.id}/answer`, { token: u.token, body: { qid: it.qid, selected: await keyOf(t.id, it.qid) } });
  await pool.query(`UPDATE toeic_sessions SET config = jsonb_set(config, '{deadline}', to_jsonb(to_char((NOW() - INTERVAL '1 minute') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) WHERE id = $1`, [t.id]);
  const late = await req('POST', `/api/toeic/p5/sessions/${t.id}/answer`, { token: u.token, body: { qid: t.items[20].qid, selected: 'A' } });
  assert.strictEqual(late.status, 409); assert.strictEqual(late.body.code, 'TIME_UP');
  const before = await userExp(u.id);
  const closed = (await req('GET', `/api/toeic/p5/sessions/${t.id}`, { token: u.token })).body;
  assert.strictEqual(closed.status, 'finished'); assert.strictEqual(closed.result.correct, 16);
  assert.strictEqual(await userExp(u.id) - before, PART5.exp.mockComplete, 'ตอบเกินครึ่ง = ได้ EXP Mock ครั้งแรกของวัน');
});
