/*
  TOEIC-style Listening Part 1 — Practice / Mock
  - Validator: 4 statements · คำตอบถูก 1 ข้อ · A–D mapping · เสียงตรง transcript (contentHash) · ไฟล์ภาพ/เสียงมีจริง · กันกำกวม
  - คลังข้อ: ทุกข้อในคลังผ่าน validator · production pool = verified เท่านั้น · variant สลับตำแหน่งคำตอบ + สำเนียง
  - ความปลอดภัย: ไม่มีข้อความ/เฉลยก่อนตอบ · ตรวจคำตอบที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · Mock ตอบตามลำดับ
  - คะแนน · EXP (บัญชีเดิม) · กัน EXP ซ้ำ · Error Notebook · ความคืบหน้าถาวร · โหลดไฟล์ไม่ได้ไม่หักคะแนน
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
const V = require('../services/toeic/part1Validator');
const bank = require('../services/toeic/bank');
const { PART1 } = require('../config/toeic');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part1', 'bank.json'), 'utf8')).questions;
const PUBLIC = path.join(__dirname, '..', 'public');
const byId = new Map(BANK.map((q) => [q.id, q]));
const clone = (o) => JSON.parse(JSON.stringify(o));

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
async function makeUser(prefix = 'tq') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
const logSum = async (id) => (await pool.query('SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1', [id])).rows[0].n;
/** เฉลยจากฝั่งเซิร์ฟเวอร์ (ชุดทดสอบเท่านั้น): อ่าน variant ที่สุ่มให้จาก DB */
async function keyOf(sid, qid) {
  const { rows } = await pool.query('SELECT items FROM toeic_sessions WHERE id = $1', [sid]);
  const it = rows[0].items.find((x) => x.qid === qid);
  return byId.get(qid).variants.find((v) => v.v === it.variant).correctOption;
}
const wrongOf = (letter) => ['A', 'B', 'C', 'D'].find((l) => l !== letter);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

/* ---------------- Validator ---------------- */
test('Validator: ต้องมี 4 statements พอดี และคำตอบถูก 1 ข้อพอดี', () => {
  const q = clone(BANK[0]);
  assert.deepStrictEqual(V.validateQuestion(q, { publicDir: PUBLIC, checkFiles: true }).errors, []);
  const three = clone(q); three.statements.pop();
  assert.ok(V.validateQuestion(three).errors.some((e) => /4 statements/.test(e)));
  const two = clone(q); two.statements.forEach((s) => { s.isCorrect = true; s.distractorType = null; });
  assert.ok(V.validateQuestion(two).errors.some((e) => /คำตอบถูก 1 ข้อ/.test(e)));
  const none = clone(q); none.statements.forEach((s) => { s.isCorrect = false; s.distractorType = s.distractorType || 'wrongAction'; });
  assert.ok(V.validateQuestion(none).errors.some((e) => /คำตอบถูก 1 ข้อ/.test(e)));
});

test('Validator: A–D mapping และเสียงต้องตรงกับ transcript (แก้ข้อความ = ต้องสร้างเสียงใหม่)', () => {
  const q = clone(BANK[1]);
  const badMap = clone(q); badMap.variants[0].correctOption = badMap.variants[0].correctOption === 'A' ? 'B' : 'A';
  assert.ok(V.validateQuestion(badMap).errors.some((e) => /correctOption/.test(e)));
  const edited = clone(q); edited.statements[0].text = 'A woman is reading a magazine.';
  assert.ok(V.validateQuestion(edited).errors.some((e) => /contentHash/.test(e)), 'ข้อความเปลี่ยนแต่เสียงเดิม -> ไม่ผ่าน');
  const seg = clone(q); seg.variants[0].audio.segments = seg.variants[0].audio.segments.slice(0, 3);
  assert.ok(V.validateQuestion(seg).errors.some((e) => /segments/.test(e)));
  const order = clone(q); order.variants[1].order = [0, 0, 1, 2];
  assert.ok(V.validateQuestion(order).errors.some((e) => /permutation/.test(e)));
});

test('Validator: ไฟล์ภาพ/เสียงต้องมีจริง · ภาพซ้ำ · ไวยากรณ์ · กันคำตอบกำกวม · ภาพไม่มีคนห้ามตอบด้วย is being', () => {
  const q = clone(BANK[2]);
  const missing = clone(q); missing.imageAsset.url = '/assets/toeic/p1/NOPE.webp'; missing.variants[0].audio.url = '/assets/toeic/p1/audio/nope.mp3';
  const e = V.validateQuestion(missing, { publicDir: PUBLIC, checkFiles: true }).errors;
  assert.ok(e.some((x) => /ไม่พบไฟล์ภาพ/.test(x)) && e.some((x) => /ไม่พบไฟล์เสียง/.test(x)));
  const dup = V.validateBank([clone(BANK[3]), { ...clone(BANK[3]), id: 'P1-9999' }], { publicDir: PUBLIC, checkFiles: true });
  assert.ok(dup[1].errors.some((x) => /ภาพซ้ำ/.test(x)));
  assert.ok(V.grammarIssues('some chairs are stacked').length, 'ต้องขึ้นต้นตัวใหญ่');
  assert.ok(V.grammarIssues('He is opening a box').some((x) => /จุด/.test(x)));
  assert.ok(V.grammarIssues('Some boxes is stacked on a pallet.').length, 'ประธานพหูพจน์ + is');
  assert.deepStrictEqual(V.grammarIssues('Some food is being cooked.'), []);
  const amb = clone(q);
  const c = amb.statements.find((s) => s.isCorrect);
  amb.statements.find((s) => !s.isCorrect).text = c.text.replace('.', ' now.');
  assert.ok(V.validateQuestion(amb).errors.some((x) => /ใกล้เคียงคำตอบเกินไป/.test(x)));
  const np = clone(BANK.find((x) => x.category === 'no-person'));
  np.statements.find((s) => s.isCorrect).text = 'Some chairs are being folded.';
  assert.ok(V.validateQuestion(np).errors.some((x) => /is\/are being/.test(x)));
});

test('คลังข้อ: ทุกข้อผ่าน validator (ไฟล์จริง) · ทุกข้อมี 2 variants ต่างสำเนียงและตำแหน่งคำตอบต่างกัน · หมวดภาพสมดุล', () => {
  const res = V.validateBank(BANK, { publicDir: PUBLIC, checkFiles: true });
  const bad = res.filter((r) => r.errors.length);
  assert.deepStrictEqual(bad.map((r) => `${r.id}: ${r.errors[0]}`), []);
  assert.ok(BANK.length >= 30, 'pilot 30–50 ข้อ');
  for (const q of BANK) {
    assert.strictEqual(q.variants.length, 2);
    assert.notStrictEqual(q.variants[0].correctOption, q.variants[1].correctOption, `${q.id}: variant ต้องย้ายตำแหน่งคำตอบ`);
    assert.notStrictEqual(q.variants[0].speakerAccent, q.variants[1].speakerAccent);
    for (const v of q.variants) {
      const ci = q.statements.findIndex((s) => s.isCorrect);
      assert.strictEqual(['A', 'B', 'C', 'D'][v.order.indexOf(ci)], v.correctOption, `${q.id} v${v.v} mapping`);
      assert.ok(v.audio && v.audio.duration > 8, `${q.id} v${v.v} audio`);
    }
  }
  const cats = (c) => BANK.filter((q) => q.category === c).length;
  assert.ok(cats('one-person') >= 10 && cats('multi-person') >= 8 && cats('no-person') >= 10, 'มีทั้งภาพคนเดียว หลายคน และไม่มีคน');
  const letters = BANK.map((q) => q.variants[0].correctOption);
  ['A', 'B', 'C', 'D'].forEach((l) => assert.ok(letters.filter((x) => x === l).length >= 6, `คำตอบ ${l} กระจายพอ`));
});

test('Production pool = verified เท่านั้น (draft/reviewNeeded ไม่ถูกสุ่มให้ผู้เรียน)', async () => {
  const qid = BANK[0].id;
  await pool.query("UPDATE toeic_questions SET quality_status = 'reviewNeeded' WHERE id = $1", [qid]);
  bank.invalidate();
  const p = await bank.pool1();
  assert.ok(!p.some((q) => q.id === qid));
  await pool.query("UPDATE toeic_questions SET quality_status = 'verified' WHERE id = $1", [qid]);
  bank.invalidate();
  assert.ok((await bank.pool1()).some((q) => q.id === qid));
});

/* ---------------- Practice ---------------- */
test('Practice: ก่อนตอบไม่มีข้อความ/เฉลย/alt · หลังตอบได้ feedback ครบ (transcript · คำแปล · ตัวลวง · photo analysis · vocab)', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5 } })).body;
  assert.strictEqual(s.items.length, 5);
  const raw = JSON.stringify(s.items);
  for (const it of s.items) {
    const q = byId.get(it.qid);
    q.statements.forEach((st) => assert.ok(!raw.includes(st.text), 'statement รั่วก่อนตอบ'));
    assert.ok(!raw.includes(q.imageAlt), 'alt รั่วก่อนตอบ');
    assert.ok(it.audio.url.startsWith('/assets/toeic/p1/audio/') && it.audio.segments.length === 4);
  }
  assert.ok(!/correctOption|isCorrect|explanation/.test(raw));
  const it = s.items[0];
  const key = await keyOf(s.id, it.qid);
  const r = (await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrongOf(key), responseMs: 4200 } })).body;
  const fb = r.feedback;
  assert.strictEqual(fb.isCorrect, false); assert.strictEqual(fb.correctOption, key);
  assert.strictEqual(fb.statements.length, 4);
  assert.strictEqual(fb.statements.find((x) => x.letter === key).isCorrect, true);
  fb.statements.forEach((x) => { assert.ok(x.text && x.translationTH && x.explanationTH && x.distractorTH); });
  assert.ok(fb.why && fb.tip && fb.photo.people && fb.vocabulary.length && fb.clues.length && fb.imageAlt);
});

test('Practice: คะแนนคิดที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · ตัวเลือกปลอม/ข้อนอกชุดถูกปฏิเสธ · ผล (accuracy, เวลา, ทักษะ)', async () => {
  const u = await makeUser();
  const other = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5, difficulty: 'mixed' } })).body;
  const q0 = s.items[0].qid;
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: q0, selected: 'E' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: 'P1-9999', selected: 'A' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: other.token, body: { qid: q0, selected: 'A' } })).status, 404, 'ชุดของคนอื่น');
  let expected = 0;
  for (const [i, it] of s.items.entries()) {
    const key = await keyOf(s.id, it.qid);
    const pick = i < 3 ? key : wrongOf(key);
    if (i < 3) expected += 1;
    const r = await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: pick, responseMs: 3000 + i * 1000 } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.feedback.isCorrect, i < 3);
  }
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: q0, selected: 'A' } })).status, 409, 'ตอบซ้ำไม่ได้');
  const fin = (await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, expected); assert.strictEqual(fin.result.incorrect, 2);
  assert.strictEqual(fin.result.accuracy, 60); assert.strictEqual(fin.result.avgResponseMs, 5000);
  assert.ok(fin.result.skills.length && fin.result.strongest && fin.result.review.length === 5);
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: q0, selected: 'A' } })).status, 409, 'ชุดจบแล้ว');
});

test('EXP: บัญชีเดิม (users.exp = exp_log) · ข้อถูกได้ครั้งเดียวต่อวัน · จบชุด + perfect bonus · finish ซ้ำไม่ได้ EXP ซ้ำ', async () => {
  const u = await makeUser();
  const before = await userExp(u.id);
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5 } })).body;
  let perQ = 0;
  for (const it of s.items) {
    const r = (await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: await keyOf(s.id, it.qid) } })).body;
    assert.strictEqual(r.exp, PART1.exp.practiceCorrect); perQ += r.exp;
  }
  const fin = (await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.exp, PART1.exp.practiceComplete + PART1.exp.practicePerfect);
  assert.strictEqual(await userExp(u.id), before + perQ + fin.exp);
  assert.strictEqual(await logSum(u.id), await userExp(u.id), 'EXP เดียวกับ exp_log');
  const again = (await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(again.exp, 0); assert.strictEqual(again.already, true);
  // ชุดใหม่ วันเดียวกัน ข้อเดิมตอบถูก -> ไม่ได้ EXP รายข้อซ้ำ
  const qids = new Set(s.items.map((x) => x.qid));
  let repeated = false;
  for (let k = 0; k < 30 && !repeated; k += 1) {   // ตัวเลือกข้อเลี่ยงข้อที่เคยตอบถูก (น้ำหนัก 0.3) → ลองหลายชุดจนเจอข้อซ้ำ
    const s2 = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 20 } })).body;
    const hit = s2.items.find((x) => qids.has(x.qid));
    if (hit) {
      const r = (await req('POST', `/api/toeic/p1/sessions/${s2.id}/answer`, { token: u.token, body: { qid: hit.qid, selected: await keyOf(s2.id, hit.qid) } })).body;
      assert.strictEqual(r.exp, 0, 'ข้อเดิมวันเดียวกันไม่ได้ EXP ซ้ำ');
      repeated = true;
    }
  }
  assert.ok(repeated);
});

test('EXP กันฟาร์มการจบชุด: Practice ได้ completion สูงสุด 5 ชุด/วัน', async () => {
  const u = await makeUser();
  const gains = [];
  for (let k = 0; k < 7; k += 1) {
    const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5 } })).body;
    for (const it of s.items) await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrongOf(await keyOf(s.id, it.qid)) } });
    gains.push((await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body.exp);
  }
  assert.deepStrictEqual(gains, [10, 10, 10, 10, 10, 0, 0]);
});

/* ---------------- Mock ---------------- */
test('Mock: 6 ข้อ ผสมภาพคนเดียว/หลายคน/ไม่มีคน · ไม่มี feedback ระหว่างข้อ · ตอบตามลำดับ · จบก่อนครบไม่ได้ · ผล + Review', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  assert.strictEqual(s.mode, 'mock'); assert.strictEqual(s.items.length, 6);
  const cats = new Set(s.items.map((it) => byId.get(it.qid).category));
  assert.strictEqual(cats.size, 3);
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: s.items[1].qid, selected: 'A' } })).status, 409, 'ข้ามข้อไม่ได้');
  assert.strictEqual((await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).status, 409, 'ยังไม่ครบ');
  const keys = [];
  for (const [i, it] of s.items.entries()) {
    const key = await keyOf(s.id, it.qid); keys.push(key);
    const r = (await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: i === 5 ? wrongOf(key) : key } })).body;
    assert.strictEqual(r.feedback, undefined, 'Mock ไม่มี feedback ระหว่างข้อ');
    assert.ok(!('isCorrect' in r) && !('exp' in r));
    const mid = (await req('GET', `/api/toeic/p1/sessions/${s.id}`, { token: u.token })).body;
    assert.ok(mid.items.every((x) => !x.feedback), 'ระหว่างทำ GET ก็ไม่เห็นเฉลย');
  }
  const fin = (await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.result.correct, 5); assert.strictEqual(fin.result.total, 6); assert.strictEqual(fin.result.accuracy, 83);
  assert.strictEqual(fin.result.label, 'Practice Score');
  assert.ok(/ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ/.test(fin.result.disclaimer));
  assert.strictEqual(fin.result.review.length, 6);
  assert.strictEqual(fin.result.review.filter((x) => !x.isCorrect).length, 1);
  assert.ok(fin.result.review.every((x) => x.statements.length === 4 && x.audio && x.audio.url));
  assert.strictEqual(fin.exp, PART1.exp.mockComplete, 'Mock แรกของวัน = EXP เต็ม');
});

test('Mock EXP: ครั้งแรกของวันเต็ม · ครั้งถัดไปลดลง · เกิน 3 ครั้ง/วันไม่ได้ EXP', async () => {
  const u = await makeUser();
  const gains = [];
  for (let k = 0; k < 4; k += 1) {
    const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'mock' } })).body;
    for (const it of s.items) await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrongOf(await keyOf(s.id, it.qid)) } });
    gains.push((await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token })).body.exp);
  }
  assert.deepStrictEqual(gains, [PART1.exp.mockComplete, PART1.exp.mockRepeat, PART1.exp.mockRepeat, 0]);
});

/* ---------------- Error Notebook / Progress / Network ---------------- */
test('Error Notebook: ข้อที่ผิดเก็บ skill · ตัวลวงที่เลือก · เฉลย · เวลา · สำเนียง · ระดับ — ตอบถูกภายหลังแล้วหลุดจากรายการ', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5 } })).body;
  const it = s.items[0];
  const key = await keyOf(s.id, it.qid);
  await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrongOf(key), responseMs: 6100 } });
  const row = (await pool.query('SELECT * FROM toeic_answers WHERE user_id = $1', [u.id])).rows[0];
  assert.strictEqual(row.question_id, it.qid); assert.strictEqual(row.correct_option, key);
  assert.ok(row.skill && row.distractor_type && row.accent && row.difficulty && row.response_ms === 6100 && row.created_at);
  const m = (await req('GET', '/api/toeic/p1/mistakes', { token: u.token })).body.items;
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].qid, it.qid); assert.ok(m[0].distractorSelectedTH);
  // Custom Review: ชุดฝึกจากข้อที่ผิด -> ตอบถูก -> หลุดจาก Error Notebook
  const cr = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5, source: 'mistakes' } })).body;
  assert.deepStrictEqual(cr.items.map((x) => x.qid), [it.qid]);
  await req('POST', `/api/toeic/p1/sessions/${cr.id}/answer`, { token: u.token, body: { qid: it.qid, selected: await keyOf(cr.id, it.qid) } });
  assert.strictEqual((await req('GET', '/api/toeic/p1/mistakes', { token: u.token })).body.items.length, 0);
  assert.strictEqual((await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', source: 'mistakes' } })).status, 404);
  // answer_events (สถิติรวมเดิม) ได้รับ listening ด้วย
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND skill = 'listening'", [u.id])).rows[0].n, 2);
});

test('ความคืบหน้าถาวร: summary (accuracy · practiced · best · weak skill · ช่วงเวลา) · กลับมาทำชุดค้างต่อได้', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'practice', size: 5 } })).body;
  for (const it of s.items.slice(0, 2)) await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: await keyOf(s.id, it.qid) } });
  const resume = (await req('GET', `/api/toeic/p1/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(resume.answered, 2); assert.strictEqual(resume.index, 2);
  assert.ok(resume.items[0].feedback && !resume.items[2].feedback);
  const sum = (await req('GET', '/api/toeic/p1/summary?range=7', { token: u.token })).body;
  assert.strictEqual(sum.answered, 2); assert.strictEqual(sum.accuracy, 100); assert.strictEqual(sum.practiced, 2);
  assert.strictEqual(sum.activeSessions[0].id, s.id);
  for (const it of s.items.slice(2)) await req('POST', `/api/toeic/p1/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrongOf(await keyOf(s.id, it.qid)) } });
  await req('POST', `/api/toeic/p1/sessions/${s.id}/finish`, { token: u.token });
  const after = (await req('GET', '/api/toeic/p1/summary', { token: u.token })).body;
  assert.strictEqual(after.bestPractice.percent, 40); assert.strictEqual(after.answered, 5);
  assert.ok(after.skills.length && after.photos && after.accents);
  assert.strictEqual(after.activeSessions.length, 0);
});

test('โหลดไฟล์ไม่ได้: บันทึก asset error โดยไม่นับเป็นคำตอบ/ไม่หักคะแนน · ไฟล์ภาพ/เสียงของทุกข้อเปิดได้จริง', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/toeic/p1/sessions', { token: u.token, body: { mode: 'mock' } })).body;
  await req('POST', `/api/toeic/p1/sessions/${s.id}/asset-error`, { token: u.token });
  await req('POST', `/api/toeic/p1/sessions/${s.id}/asset-error`, { token: u.token });
  const row = (await pool.query('SELECT asset_errors FROM toeic_sessions WHERE id = $1', [s.id])).rows[0];
  assert.strictEqual(row.asset_errors, 2);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM toeic_answers WHERE session_id = $1', [s.id])).rows[0].n, 0);
  const st = (await req('GET', `/api/toeic/p1/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(st.status, 'active'); assert.strictEqual(st.answered, 0);
  for (const it of s.items) {
    for (const url of [it.audio.url, it.image.url, it.image.small]) {
      const r = await new Promise((res) => http.get(base + url, (x) => { x.resume(); res(x); }));
      assert.strictEqual(r.statusCode, 200, url);
    }
  }
});

test('คำศัพท์ Part 1: ผูกกับคลังเดิม (ไม่สร้างคำซ้ำ) · เพิ่มเข้ารายการทบทวน (word_progress) · คำนอกคลังถูกปฏิเสธ', async () => {
  const u = await makeUser();
  const v = (await req('GET', '/api/toeic/p1/vocab', { token: u.token })).body;
  assert.strictEqual(v.tag, 'toeicListeningPart1');
  assert.ok(v.groups.length >= 6);
  const words = v.groups.flatMap((g) => g.words);
  assert.ok(words.every((w) => w.word && w.th && w.ipa && w.pos && w.example));
  const linked = words.filter((w) => w.wordId);
  if (linked.length) {
    const w = linked[0];
    const before = (await pool.query('SELECT COUNT(*)::int AS n FROM vocab_senses')).rows[0].n;
    const r = (await req('POST', '/api/toeic/p1/vocab/review', { token: u.token, body: { wordId: w.wordId } })).body;
    assert.strictEqual(r.added, true);
    assert.strictEqual((await req('POST', '/api/toeic/p1/vocab/review', { token: u.token, body: { wordId: w.wordId } })).body.added, false);
    assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, w.wordId])).rows[0].n, 1);
    assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM vocab_senses')).rows[0].n, before, 'ไม่สร้างคำใหม่ในคลังคำศัพท์');
    const v2 = (await req('GET', '/api/toeic/p1/vocab', { token: u.token })).body;
    assert.ok(v2.groups.flatMap((g) => g.words).find((x) => x.wordId === w.wordId).inReview);
  }
  assert.strictEqual((await req('POST', '/api/toeic/p1/vocab/review', { token: u.token, body: { wordId: 'A1-S0001x' } })).status, 404);
});

test('ไม่ล็อกอินเข้าถึงไม่ได้ · meta มี Part 1–7 (เปิดเฉพาะ Part 1) และข้อความ disclaimer', async () => {
  assert.strictEqual((await req('GET', '/api/toeic/meta')).status, 401);
  const u = await makeUser();
  const m = (await req('GET', '/api/toeic/meta', { token: u.token })).body;
  assert.deepStrictEqual(m.parts.map((p) => p.part), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual(m.parts.filter((p) => p.ready).map((p) => p.part), [1, 2, 3, 4, 5, 6, 7]);   // v1.10.0: ครบทุก Part
  assert.ok(/ไม่ได้รับการรับรอง/.test(m.disclaimer) && /ETS/.test(m.disclaimer));
  assert.strictEqual(m.mockSize, 6);
});
