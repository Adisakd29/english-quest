/*
  v1.10.0 Phase 4 — TOEIC Academy · คะแนนคาดการณ์จากการฝึก · คลังข้อสอบ Part 3/7 ที่เพิ่มขึ้น
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

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let j = null; try { j = buf ? JSON.parse(buf) : null; } catch (_) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser() {
  const name = `t4${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
/** ใส่คำตอบจำลอง: part, จำนวน, ถูกกี่ข้อ, source ของรอบ */
async function seedAnswers(userId, part, n, correct, { source = 'bank', prefix = 'Q' } = {}) {
  const s = (await pool.query(`INSERT INTO toeic_sessions (user_id, part, mode, config, items, total, status) VALUES ($1, $2, 'practice', $3, '[]', $4, 'finished') RETURNING id`,
    [userId, part, JSON.stringify({ source }), n])).rows[0].id;
  for (let i = 0; i < n; i += 1) {
    await pool.query(`INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct, skill)
      VALUES ($1, $2, $3, $4, 'practice', 0, 'A', $5, $6, 'detail')`, [s, userId, `${prefix}${part}-${i}`, part, i < correct ? 'A' : 'B', i < correct]);
  }
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('TOEIC Academy: 7 บท ตามรูปแบบข้อสอบจริง · ไม่ส่งเฉลยคำถามเช็กก่อนตอบ · ตรวจที่เซิร์ฟเวอร์ · เก็บคะแนนดีที่สุด', async () => {
  const u = await makeUser();
  const list = (await req('GET', '/api/toeic/academy', { token: u.token })).body;
  assert.deepStrictEqual(list.lessons.map((l) => l.format.questions), [6, 25, 39, 30, 30, 16, 54], 'จำนวนข้อตามข้อสอบจริง (รวม 200)');
  assert.strictEqual(list.doneCount, 0);
  const l = (await req('GET', '/api/toeic/academy/3', { token: u.token })).body;
  assert.ok(l.types.length >= 3 && l.traps.length >= 3 && l.steps.length >= 4 && l.phrases.length >= 6);
  assert.ok(l.check.length === 3 && l.check.every((c) => c.answer === undefined && c.whyTh === undefined), 'ไม่ส่งเฉลย');
  assert.strictEqual(l.nav, 'toeic-p3'); assert.strictEqual(l.next, 4);
  const key = require('../data/toeic/academy/lessons.json')[2].check.map((c) => c.answer);
  const wrong = key.map((a) => (a + 1) % 3);
  const r1 = (await req('POST', '/api/toeic/academy/3/check', { token: u.token, body: { answers: [key[0], wrong[1], wrong[2]] } })).body;
  assert.strictEqual(r1.score, 1); assert.ok(r1.results[1].whyTh && r1.results[1].correct === false);
  assert.strictEqual((await req('POST', '/api/toeic/academy/3/check', { token: u.token, body: { answers: key } })).body.score, 3);
  await req('POST', '/api/toeic/academy/3/check', { token: u.token, body: { answers: wrong } });
  const after = (await req('GET', '/api/toeic/academy', { token: u.token })).body;
  assert.strictEqual(after.doneCount, 1); assert.strictEqual(after.lessons[2].checkScore, 3, 'เก็บคะแนนดีที่สุด');
  assert.strictEqual((await req('POST', '/api/toeic/academy/3/check', { token: u.token, body: { answers: [0] } })).status, 400);
  assert.strictEqual((await req('GET', '/api/toeic/academy/9', { token: u.token })).status, 404);
  assert.strictEqual((await req('GET', '/api/toeic/academy')).status, 401);
});

test('คะแนนคาดการณ์: ยังไม่พอ = บอกจำนวนที่ต้องทำ · นับเฉพาะครั้งแรก · ไม่นับรอบทบทวนข้อผิด · ถ่วงตาม Part · ช่วงคะแนน', async () => {
  const u = await makeUser();
  let p = (await req('GET', '/api/toeic/predict', { token: u.token })).body;
  assert.strictEqual(p.listening.ready, false); assert.strictEqual(p.listening.need, 20); assert.strictEqual(p.total, null);
  await seedAnswers(u.id, 2, 30, 24);           // Part 2: 80%
  await seedAnswers(u.id, 3, 30, 18);           // Part 3: 60%
  await seedAnswers(u.id, 3, 30, 30, { source: 'mistakes', prefix: 'M' });   // รอบทบทวนข้อผิด — ต้องไม่นับ
  // ทำซ้ำข้อเดิมแล้วถูก — นับเฉพาะครั้งแรก (ผิด)
  await seedAnswers(u.id, 3, 10, 10, { prefix: 'Q' });
  p = (await req('GET', '/api/toeic/predict', { token: u.token })).body;
  const L = p.listening;
  assert.strictEqual(L.ready, true);
  assert.strictEqual(L.answered, 60, 'ไม่นับรอบทบทวน/ข้อซ้ำ');
  assert.strictEqual(L.breakdown.find((b) => b.part === 3).accuracy, 60);
  assert.deepStrictEqual(L.missingParts, [1, 4]);
  assert.ok(L.score > 250 && L.score < 400, `คะแนน ${L.score}`);
  assert.ok(L.low < L.score && L.high > L.score && L.margin >= 15);
  assert.ok(p.tips.some((t) => t.includes('Part 1, 4')), p.tips.join(' | '));
  assert.strictEqual(p.reading.ready, false);
  // ครบทุก Part ของ Reading ที่ 100% → ใกล้ 495
  for (const part of [5, 6, 7]) await seedAnswers(u.id, part, 40, 40);
  const R = (await req('GET', '/api/toeic/predict', { token: u.token })).body.reading;
  assert.ok(R.ready && R.score >= 480 && R.missingParts.length === 0 && R.cefr === 'C1');
});

test('คลังข้อสอบ: Part 3 60 ชุด (180 ข้อ) มีไฟล์เสียงครบ · Part 7 70 ชุด (262 ข้อ) · ผ่าน validator · ID เดิมไม่เปลี่ยน', () => {
  const { validateBank: v34 } = require('../services/toeic/part34Validator');
  const p3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/toeic/part3/bank.json'), 'utf8')).sets;
  assert.strictEqual(p3.length, 60);
  assert.strictEqual(p3.reduce((a, s) => a + s.questions.length, 0), 180);
  assert.strictEqual(p3[35].id, 'P3-0036'); assert.strictEqual(p3[35].draftId, 'C4-09', 'ชุดเดิมคง ID เดิม');
  const r3 = v34(p3, { publicDir: path.join(__dirname, '../public'), checkAudio: true });
  assert.deepStrictEqual(r3, [], 'ทุกชุดผ่าน validator + มีไฟล์เสียง');
  const p7 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/toeic/part7/bank.json'), 'utf8')).sets;
  assert.strictEqual(p7.length, 70);
  assert.strictEqual(p7.reduce((a, s) => a + s.questions.length, 0), 262);
  assert.strictEqual(p7[45].id, 'P7-0046');
});
