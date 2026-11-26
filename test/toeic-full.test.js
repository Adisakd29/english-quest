/*
  TOEIC-style Full Mock Test (Part 1–7) — ผูก Mock ของแต่ละ Part · คะแนนประมาณการ · สิทธิ์ · EXP โบนัสครั้งเดียว
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
const FULL = require('../services/toeic/full');
const bank = require('../services/toeic/bank');


const P1BANK = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part1', 'bank.json'), 'utf8')).questions.map((q) => [q.id, q]));
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
async function makeUser(prefix = 'tf') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('คะแนนประมาณการ: 0% → 5 · 100% → 495 · ปัดทีละ 5 · มีช่วงคลาดเคลื่อน · CEFR', () => {
  assert.strictEqual(FULL.estimate(0, 60, 'listening').score, 5);
  assert.strictEqual(FULL.estimate(60, 60, 'listening').score, 495);
  const h = FULL.estimate(30, 60, 'reading');
  assert.strictEqual(h.score, 250); assert.ok(h.low < 250 && h.high > 250 && h.score % 5 === 0);
  assert.ok(FULL.estimate(30, 60, 'reading').margin > FULL.estimate(300, 600, 'reading').margin, 'ข้อมากขึ้น ช่วงแคบลง');
  assert.strictEqual(FULL.estimate(60, 60, 'listening').cefr, 'C1');
  assert.strictEqual(FULL.estimate(48, 60, 'reading').cefr, 'B2');   // 397
});

test('Full Mock: ผูก Mock ทั้ง 7 Part · ยังไม่ครบดูผลไม่ได้ · ของคนอื่นใช้ไม่ได้ · เริ่ม Mock แยกแล้ว Part นั้นกลับเป็นยังไม่ทำ · จบแล้วได้คะแนน + EXP ครั้งเดียว', async () => {
  const u = await makeUser(); const other = await makeUser();
  const t = (await req('POST', '/api/toeic/full', { token: u.token, body: {} })).body;
  assert.strictEqual(t.status, 'active'); assert.strictEqual(t.parts.length, 7); assert.strictEqual(t.nextPart, 1);
  assert.strictEqual((await req('POST', '/api/toeic/p5/sessions', { token: other.token, body: { mode: 'mock', fullTestId: t.id } })).status, 404, 'ใช้ Full Mock ของคนอื่นไม่ได้');
  assert.strictEqual((await req('POST', `/api/toeic/full/${t.id}/finish`, { token: u.token })).status, 409);
  const startPart = async (part) => (await req('POST', `/api/toeic/p${part}/sessions`, { token: u.token, body: { mode: 'mock', fullTestId: t.id } })).body;
  // Part 1: ต้องตอบครบก่อนจบ — ตอบถูกทุกข้อ
  const s1 = await startPart(1);
  assert.strictEqual(s1.config.fullTestId, t.id);
  const it1 = (await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [s1.id])).rows[0].items;
  for (const it of it1) {
    const key = P1BANK.get(it.qid).variants.find((v) => v.v === it.variant).correctOption;
    await req('POST', `/api/toeic/p1/sessions/${s1.id}/answer`, { token: u.token, body: { qid: it.qid, selected: key } });
  }
  await req('POST', `/api/toeic/p1/sessions/${s1.id}/finish`, { token: u.token });
  // Part 2–7: ส่งเปล่า (ไม่ได้ตอบ = ผิด)
  const sess = {};
  for (const part of [2, 3, 4, 5, 6, 7]) {
    sess[part] = await startPart(part);
    await req('POST', `/api/toeic/p${part}/sessions/${sess[part].id}/finish`, { token: u.token });
  }
  let v = (await req('GET', `/api/toeic/full/${t.id}`, { token: u.token })).body;
  assert.strictEqual(v.done, 7);
  assert.strictEqual((await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock', fullTestId: t.id } })).status, 409, 'Part ที่ทำแล้วเริ่มซ้ำในชุดเดียวกันไม่ได้');
  // เริ่ม Mock Part 6 แยก (ไม่ผูก) ไม่กระทบ Part ที่จบแล้ว
  await req('POST', '/api/toeic/p6/sessions', { token: u.token, body: { mode: 'mock' } });
  v = (await req('GET', `/api/toeic/full/${t.id}`, { token: u.token })).body;
  assert.strictEqual(v.done, 7);
  const before = await userExp(u.id);
  const f = (await req('POST', `/api/toeic/full/${t.id}/finish`, { token: u.token })).body;
  assert.strictEqual(f.status, 'finished'); assert.strictEqual(f.exp, FULL.BONUS_EXP);
  assert.strictEqual(await userExp(u.id), before + FULL.BONUS_EXP);
  const r = f.result;
  const ltotal = r.parts.filter((p) => p.section === 'listening').reduce((a, p) => a + p.total, 0);
  assert.strictEqual(r.listening.total, ltotal); assert.strictEqual(r.listening.correct, it1.length);
  assert.strictEqual(r.listening.score, FULL.estimate(it1.length, ltotal, 'listening').score);
  assert.strictEqual(r.reading.correct, 0); assert.strictEqual(r.reading.score, 5);
  assert.strictEqual(r.total, r.listening.score + r.reading.score);
  assert.strictEqual(r.weakest.accuracy, 0);
  const again = (await req('POST', `/api/toeic/full/${t.id}/finish`, { token: u.token })).body;
  assert.strictEqual(again.exp, 0); assert.strictEqual(again.already, true);
  const cur = (await req('GET', '/api/toeic/full', { token: u.token })).body;
  assert.strictEqual(cur.active, null); assert.strictEqual(cur.history[0].total, r.total);
  assert.strictEqual((await req('GET', `/api/toeic/full/${t.id}`, { token: other.token })).status, 404);

  // ชุดใหม่: Part ที่กำลังทำถูกยกเลิกเพราะเริ่ม Mock แยก → กลับเป็น "ยังไม่ทำ" และเริ่มใหม่ได้
  const t2 = (await req('POST', '/api/toeic/full', { token: u.token, body: {} })).body;
  await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock', fullTestId: t2.id } });
  let v2 = (await req('GET', `/api/toeic/full/${t2.id}`, { token: u.token })).body;
  assert.strictEqual(v2.parts[4].state, 'active');
  await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock' } });
  v2 = (await req('GET', `/api/toeic/full/${t2.id}`, { token: u.token })).body;
  assert.strictEqual(v2.parts[4].state, 'todo');
  assert.strictEqual((await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock', fullTestId: t2.id } })).status, 200);
  // ยกเลิกชุด → ผูกต่อไม่ได้
  await req('POST', `/api/toeic/full/${t2.id}/abandon`, { token: u.token });
  const n0 = (await pool.query("SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 6 AND status = 'active'", [u.id])).rows[0].n;
  assert.strictEqual((await req('POST', '/api/toeic/p6/sessions', { token: u.token, body: { mode: 'mock', fullTestId: t2.id } })).status, 409);
  const n1 = (await pool.query("SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 6 AND status = 'active'", [u.id])).rows[0].n;
  assert.strictEqual(n1, n0, 'ผูกไม่ได้ → ไม่สร้าง session ทิ้งไว้');
});
