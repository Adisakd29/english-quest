/*
  TOEIC-style Listening Part 3 (Conversations) / Part 4 (Talks) (ส่วนหัว/ตัวช่วยเหมือน toeic-part5.test.js)
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
const V34 = require('../services/toeic/part34Validator');
const P34 = require('../services/toeic/part34');
const bank = require('../services/toeic/bank');
const { PART34 } = require('../config/toeic');

const load = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', `part${n}`, 'bank.json'), 'utf8')).sets;
const BANKS = { 3: load(3), 4: load(4) };
const BANK = [...BANKS[3], ...BANKS[4]];
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
async function makeUser(prefix = 't34') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
/** เฉลยฝั่งเซิร์ฟเวอร์ของข้อ (ชุดทดสอบเท่านั้น) */
async function keyOf(part, sid, id) {
  const { pid, k } = P34._internal.parseQ(part, id);
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [sid]);
  const it = rows[0].items.find((x) => x.qid === pid);
  return P34._internal.correctLetter(byId.get(pid).questions[k - 1], it.vs[k - 1]);
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
const PUBLIC = path.join(__dirname, '..', 'public');
const ans = (u, part, sid, id, selected) => req('POST', `/api/toeic/p${part}/sessions/${sid}/answer`, { token: u.token, body: { id, selected } });

test('คลังข้อ Part 3/4: validator + ไฟล์เสียง · segments ครบทุกช่วงพูด เรียงเวลา · ผู้พูดคนละเสียง · กราฟิก/บทสนทนา 3 คนพอสำหรับ Mock', async () => {
  for (const part of [3, 4]) {
    const B = BANKS[part];
    assert.ok(B.length >= 25, `Part ${part}: ${B.length} ชุด`);
    assert.deepStrictEqual(V34.validateBank(B, { publicDir: PUBLIC, checkAudio: true }), []);
    B.forEach((p) => {
      assert.strictEqual(p.audio.segments.length, p.turns.length);
      p.audio.segments.forEach((sg, i) => { assert.ok(sg.end > sg.start); if (i) assert.ok(sg.start >= p.audio.segments[i - 1].end); });
      assert.ok(p.audio.duration >= p.audio.segments[p.audio.segments.length - 1].end && p.audio.duration < 120);
      assert.ok(fs.statSync(path.join(PUBLIC, p.audio.url)).size > 100000);
      const vs = Object.values(p.audio.voices).map((x) => x.voice);
      assert.strictEqual(new Set(vs).size, p.speakers.length, `${p.id}: ผู้พูดแต่ละคนต้องคนละเสียง`);
    });
    assert.ok(B.filter((p) => p.graphic).length >= 3);
    if (part === 3) assert.ok(B.filter((p) => p.speakers.length === 3).length >= 3);
    assert.strictEqual((await bank.poolOf(part)).length, B.length);
  }
  const pos = [0, 0, 0, 0]; let n = 0; BANK.forEach((p) => p.questions.forEach((q) => { pos[q.answer] += 1; n += 1; }));
  pos.forEach((x) => assert.ok(x >= n * 0.2, `ตำแหน่งคำตอบ ${pos}`));
  const bad = JSON.parse(JSON.stringify(BANKS[3][0])); bad.turns[1].speaker = bad.turns[0].speaker; bad.questions[0].evidence = ['words that never appear'];
  assert.strictEqual(V34.validateSet(bad).status, 'reviewNeeded');
});

test('Practice Part 3: ก่อนตอบไม่มีบทพูด/เฉลย · เฉลยรายข้อ · ครบ 3 ข้อได้บทพูด+คำแปล+เวลาแต่ละช่วง · EXP · Coin · แยกจาก Part 4', async () => {
  const u = await makeUser(); const other = await makeUser();
  assert.strictEqual((await req('POST', '/api/toeic/p3/sessions', { body: { mode: 'practice' } })).status, 401);
  const s = (await req('POST', '/api/toeic/p3/sessions', { token: u.token, body: { mode: 'practice', size: 3, focus: 'graphic' } })).body;
  assert.strictEqual(s.items.length, 3); assert.ok(s.items.every((it) => it.graphic));
  s.items.forEach((it) => {
    assert.deepStrictEqual(Object.keys(it).sort(), ['audio', 'graphic', 'n', 'part', 'pid', 'questions', 'speakers', 'start', 'talkType', 'talkTypeTh']);
    const p = byId.get(it.pid);
    const raw = JSON.stringify(it);
    p.turns.forEach((t) => assert.ok(!raw.includes(t.text)));
    it.questions.forEach((q) => assert.deepStrictEqual(Object.keys(q).sort(), ['id', 'k', 'options', 'stem', 'type']));
  });
  const it = s.items[0]; const [q1, q2, q3] = it.questions;
  assert.strictEqual((await ans(u, 3, s.id, q1.id, 'E')).status, 400);
  assert.strictEqual((await ans(other, 3, s.id, q1.id, 'A')).status, 404);
  assert.strictEqual((await req('POST', `/api/toeic/p4/sessions/${s.id}/answer`, { token: u.token, body: { id: q1.id, selected: 'A' } })).status, 404, 'ชุด Part 3 ใช้กับ API Part 4 ไม่ได้');
  const before = await userExp(u.id);
  const r1 = (await ans(u, 3, s.id, q1.id, await keyOf(3, s.id, q1.id))).body;
  assert.strictEqual(r1.feedback.isCorrect, true); assert.strictEqual(r1.exp, PART34.exp.practiceCorrect); assert.ok(!r1.set);
  assert.ok(r1.feedback.evidence.length && r1.feedback.why);
  assert.strictEqual(await userExp(u.id), before + PART34.exp.practiceCorrect);
  assert.strictEqual((await ans(u, 3, s.id, q1.id, 'A')).status, 409);
  const r2 = (await ans(u, 3, s.id, q2.id, wrongOf(await keyOf(3, s.id, q2.id)))).body;
  assert.strictEqual(r2.feedback.isCorrect, false);
  const r3 = (await ans(u, 3, s.id, q3.id, await keyOf(3, s.id, q3.id))).body;
  const p = byId.get(it.pid);
  assert.ok(r3.set && r3.set.transcript.length === p.turns.length && r3.set.transcript.every((t) => t.th && t.end > t.start && t.label));
  const m = (await req('GET', '/api/toeic/p3/mistakes', { token: u.token })).body;
  assert.strictEqual(m.items.length, 1); assert.strictEqual(m.items[0].wrongCount, 1);
  const fin = (await req('POST', `/api/toeic/p3/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, 2); assert.strictEqual(fin.result.total, 3); assert.strictEqual(fin.exp, PART34.exp.practiceComplete);
  const coin = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key LIKE '%t3c:%'", [u.id])).rows[0].n;
  assert.strictEqual(coin, 10);
  const sum = (await req('GET', '/api/toeic/p3/summary', { token: u.token })).body;
  assert.strictEqual(sum.answered, 3); assert.strictEqual(sum.mistakes, 1); assert.strictEqual(sum.setsPracticed, 1);
  assert.strictEqual((await req('GET', '/api/toeic/p4/summary', { token: u.token })).body.answered, 0);
  assert.strictEqual((await req('GET', '/api/toeic/p9/summary', { token: u.token })).status, 404);
});

test('Mock Part 3 / Part 4: จำนวนชุด · มีกราฟิก (+ บทสนทนา 3 คน) · ไม่มีเฉลยก่อนส่ง · เปลี่ยนคำตอบในชุดปัจจุบันได้ · ชุดที่ผ่านแล้วตอบไม่ได้', async () => {
  const u = await makeUser();
  for (const part of [3, 4]) {
    const s = (await req('POST', `/api/toeic/p${part}/sessions`, { token: u.token, body: { mode: 'mock' } })).body;
    assert.strictEqual(s.items.length, PART34.mockSets[part]); assert.strictEqual(s.total, PART34.mockSets[part] * 3);
    assert.strictEqual(s.items.filter((it) => it.graphic).length >= 1, true);
    if (part === 3) assert.ok(s.items.some((it) => it.speakers === 3));
    if (part === 4) assert.ok(new Set(s.items.map((it) => it.talkType)).size >= 4);
    const groups = s.items.map((it) => byId.get(it.pid).group).filter(Boolean);
    assert.strictEqual(new Set(groups).size, groups.length);
    const q = s.items[0].questions[0]; const k = await keyOf(part, s.id, q.id);
    const r1 = (await ans(u, part, s.id, q.id, wrongOf(k))).body; assert.ok(!('feedback' in r1));
    assert.strictEqual((await ans(u, part, s.id, q.id, k)).body.changed, true);
    await req('POST', `/api/toeic/p${part}/sessions/${s.id}/advance`, { token: u.token, body: { passed: 1 } });
    const late = await ans(u, part, s.id, s.items[0].questions[1].id, 'A');
    assert.strictEqual(late.status, 409); assert.strictEqual(late.body.code, 'PASSED');
    const mid = (await req('GET', `/api/toeic/p${part}/sessions/${s.id}`, { token: u.token })).body;
    assert.strictEqual(mid.passed, 1); assert.ok(!mid.items[0].questions[0].feedback);
    const fin = (await req('POST', `/api/toeic/p${part}/sessions/${s.id}/finish`, { token: u.token })).body;
    assert.strictEqual(fin.result.correct, 1); assert.strictEqual(fin.result.unanswered, s.total - 1); assert.strictEqual(fin.exp, 0);
    assert.ok(fin.result.review[0].feedback.transcript.length >= 1);
  }
});
