/*
  หมวดคำศัพท์ตามเทศกาล (v1.12.0) — วันฮาโลวีน · วันลอยกระทง
  - เนื้อหา: 2 เทศกาล × 2 ระดับ (พื้นฐาน · ยาก B2–C2) × 40 คำ ผ่าน validator · ประโยคตัวอย่างมีคำศัพท์จริง · ไม่มีคำซ้ำในหมวด
  - แบบฝึก 10 ข้อ (ความหมาย · คำจากคำแปล · เติมคำ): ไม่มีเฉลยก่อนตอบ · ตัวลวงไม่ซ้ำกลุ่มความหมาย · ตรวจที่เซิร์ฟเวอร์ · ตอบซ้ำไม่ได้ · ของคนอื่นเข้าไม่ได้
  - ไม่ให้ EXP / Coin · ไม่แตะ word_progress (เส้นทางการเรียนเดิม) · ตอบถูกติดกัน 2 ครั้ง = จำได้แล้ว
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
const T = require('../services/themeVocab');
const { wordRegex } = require('../services/themeVocab/validator');

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
async function makeUser(prefix = 'tv') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const bank = () => T._internal.load();
/** หาคำในคลังจากข้อที่แสดง แล้วคืนตำแหน่งตัวเลือกที่ถูก */
function solve(cat, q) {
  const items = bank().cats.get(cat).items;
  const it = items.find((x) => (q.type === 'meaning' ? x.word === q.prompt : q.type === 'reverse' ? x.th === q.prompt : T._internal.blank(x) === q.prompt));
  assert.ok(it, `ไม่พบข้อ ${q.type}: ${q.prompt}`);
  return { it, idx: q.options.indexOf(q.type === 'meaning' ? it.th : it.word) };
}
const stats = async (uid) => (await pool.query(
  'SELECT u.exp, (SELECT COUNT(*)::int FROM coin_transactions c WHERE c.user_id = u.id) AS coin_tx FROM users u WHERE u.id = $1', [uid])).rows[0];

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('เนื้อหา: 4 หมวด (2 เทศกาล × 2 ระดับ) × 40 คำผ่าน validator · ประโยคมีคำศัพท์ · ตัวลวงพอทุกคำ', () => {
  const out = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'theme-vocab', 'validate.js')], { encoding: 'utf8' });
  assert.match(out, /halloween: 40 คำ · 0 error/);
  assert.match(out, /loykrathong: 40 คำ · 0 error/);
  assert.match(out, /halloween-hard: 40 คำ · 0 error/);
  assert.match(out, /loykrathong-hard: 40 คำ · 0 error/);
  // ระดับยาก: ทุกคำมีระดับ CEFR B2 ขึ้นไป · ไม่ซ้ำกับคำในระดับพื้นฐานของเทศกาลเดียวกัน
  for (const f of ['halloween', 'loykrathong']) {
    const basic = new Set(bank().cats.get(f).items.map((x) => x.word));
    for (const it of bank().cats.get(`${f}-hard`).items) {
      assert.ok(['B2', 'C1', 'C2'].includes(it.level), `${it.id} level ${it.level}`);
      assert.ok(!basic.has(it.word), `${it.word} ซ้ำกับระดับพื้นฐาน`);
    }
  }
  for (const c of bank().cats.values()) {
    for (const it of c.items) {
      assert.ok(wordRegex(it.word).test(it.example), it.id);
      assert.ok(!T._internal.blank(it).match(wordRegex(it.word)), `${it.id}: เติมคำต้องไม่เหลือคำเฉลยในประโยค`);
    }
  }
  // ลอยกระทง: ไม่มีพลุ/โคมลอย/แอลกอฮอล์ (ตกลงไว้ตั้งแต่ v1.10.0)
  const lk = ['loykrathong', 'loykrathong-hard'].flatMap((c) => bank().cats.get(c).items).map((x) => `${x.word} ${x.example}`).join(' ').toLowerCase();
  for (const bad of ['firework', 'sky lantern', 'beer', 'alcohol', 'whisky', 'wine']) assert.ok(!lk.includes(bad), bad);
});

test('validator: ตัดรายการผิด (ประโยคไม่มีคำ · id/คำซ้ำ · ชนิดคำผิด)', () => {
  const { validateFile } = require('../services/themeVocab/validator');
  const ok = { id: 'hw-01', word: 'ghost', pos: 'noun', th: 'ผี', example: 'A ghost!', exampleTH: 'ผี!' };
  const r = validateFile({ id: 'halloween', items: [ok,
    { ...ok, id: 'hw-02', word: 'bat', th: 'ค้างคาว', example: 'Bats fly.' },          // "bat" ไม่มีแบบคำเดี่ยวในประโยค
    { ...ok, id: 'hw-01', word: 'owl', th: 'นกฮูก', example: 'An owl.' },              // id ซ้ำ
    { ...ok, id: 'hw-03', word: 'moon', th: 'ดวงจันทร์', pos: 'pronoun', example: 'The moon.' },
  ] }, 'halloween');
  assert.deepStrictEqual(r.items.map((x) => x.id), ['hw-01']);
  assert.ok(r.errors.some((e) => e.includes('ประโยคตัวอย่างไม่มีคำศัพท์นี้')));
  assert.ok(r.errors.some((e) => e.includes('id ซ้ำ')));
  assert.ok(r.errors.some((e) => e.includes('ชนิดคำ')));
});

test('ต้องเข้าสู่ระบบ · หน้ารวม 4 หมวด (2 ระดับ) · หมวดที่ไม่มีอยู่ = 404', async () => {
  assert.strictEqual((await req('GET', '/api/theme-vocab')).status, 401);
  const u = await makeUser();
  const h = await req('GET', '/api/theme-vocab', { token: u.token });
  assert.strictEqual(h.status, 200);
  assert.deepStrictEqual(h.body.categories.map((c) => c.id), ['halloween', 'halloween-hard', 'loykrathong', 'loykrathong-hard']);
  assert.deepStrictEqual(h.body.categories.map((c) => c.level), ['basic', 'hard', 'basic', 'hard']);
  const hard = await req('GET', '/api/theme-vocab/categories/halloween-hard', { token: u.token });
  assert.strictEqual(hard.body.items.length, 40);
  assert.ok(hard.body.items.every((it) => ['B2', 'C1', 'C2'].includes(it.level)));
  assert.deepStrictEqual(hard.body.levels.map((l) => l.id), ['halloween', 'halloween-hard']);
  assert.ok(h.body.categories.every((c) => c.total === 40 && c.mastered === 0 && c.accuracy === null));
  const c = await req('GET', '/api/theme-vocab/categories/loykrathong', { token: u.token });
  assert.strictEqual(c.status, 200);
  assert.strictEqual(c.body.items.length, 40);
  assert.ok(c.body.items.every((it) => it.word && it.th && it.example && it.exampleTH && it.progress === null));
  assert.strictEqual((await req('GET', '/api/theme-vocab/categories/xmas', { token: u.token })).status, 404);
  assert.strictEqual((await req('POST', '/api/theme-vocab/categories/../quiz', { token: u.token, body: {} })).status, 404);
});

test('แบบฝึก: 10 ข้อ ทายความหมาย 5 ตัวเลือก · ไม่มีเฉลยก่อนตอบ · ตัวลวงไม่ซ้ำกลุ่ม · ตรวจที่เซิร์ฟเวอร์ · ไม่ให้ EXP/Coin', async () => {
  const u = await makeUser();
  const before = await stats(u.id);
  const wp0 = (await pool.query('SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1', [u.id])).rows[0].n;
  const s = await req('POST', '/api/theme-vocab/categories/halloween/quiz', { token: u.token, body: {} });
  assert.strictEqual(s.status, 200);
  const qs = s.body.questions;
  assert.strictEqual(qs.length, 10);
  assert.deepStrictEqual([...new Set(qs.map((q) => q.type))], ['meaning']);   // v1.12.1: ทายความหมายทุกข้อ
  const raw = JSON.stringify(s.body);
  assert.ok(!/correctChoice|"correct":true|"answer"/.test(raw), 'ไม่ส่งเฉลยก่อนตอบ');
  const items = bank().cats.get('halloween').items;
  for (const q of qs) {
    assert.strictEqual(q.options.length, 5);   // 5 ตัวเลือก เหมือนบทเรียน Oxford
    assert.strictEqual(new Set(q.options).size, 5);
    const { it } = solve('halloween', q);
    if (it.group) {
      const others = q.options.map((o) => items.find((x) => (q.type === 'meaning' ? x.th : x.word) === o)).filter((x) => x.id !== it.id);
      assert.ok(others.every((x) => x.group !== it.group), `${it.id}: ตัวลวงกลุ่มเดียวกัน`);
    }
  }
  let score = 0;
  for (const [n, q] of qs.entries()) {
    const { idx } = solve('halloween', q);
    const choice = n < 7 ? idx : (idx + 1) % 5;   // ถูก 7 ผิด 3
    const a = await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: u.token, body: { k: q.k, choice } });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.body.correct, n < 7);
    assert.strictEqual(a.body.correctChoice, idx);
    assert.ok(a.body.word && a.body.example && a.body.exampleTH);
    if (n < 7) score += 1;
  }
  const again = await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: u.token, body: { k: 0, choice: 0 } });
  assert.strictEqual(again.status, 409);
  const f = await req('POST', `/api/theme-vocab/quiz/${s.body.id}/finish`, { token: u.token, body: {} });
  assert.strictEqual(f.body.score, score);
  assert.strictEqual(f.body.status, 'finished');
  assert.strictEqual(f.body.mastered, 0);                         // ถูกครั้งเดียวยังไม่นับ "จำได้แล้ว"
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: u.token, body: { k: 0, choice: 0 } })).status, 409);
  const after = await stats(u.id);
  assert.deepStrictEqual(after, before, 'ไม่ให้ EXP/Coin');
  const wp1 = (await pool.query('SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1', [u.id])).rows[0].n;
  assert.strictEqual(wp1, wp0, 'ไม่แตะ word_progress');
  const h = await req('GET', '/api/theme-vocab', { token: u.token });
  const hw = h.body.categories.find((c) => c.id === 'halloween');
  assert.strictEqual(hw.practiced, 10);
  assert.strictEqual(hw.accuracy, 70);
});

test('ถูกติดกัน 2 ครั้ง = จำได้แล้ว · ชุดใหม่เลือกคำที่ยังไม่เคยฝึกก่อน · ผิดแล้วรีเซ็ต', async () => {
  const u = await makeUser();
  const s1 = await req('POST', '/api/theme-vocab/categories/loykrathong/quiz', { token: u.token, body: {} });
  const ids1 = new Set();
  for (const q of s1.body.questions) {
    const { it, idx } = solve('loykrathong', q); ids1.add(it.id);
    await req('POST', `/api/theme-vocab/quiz/${s1.body.id}/answer`, { token: u.token, body: { k: q.k, choice: idx } });
  }
  const s2 = await req('POST', '/api/theme-vocab/categories/loykrathong/quiz', { token: u.token, body: {} });
  const ids2 = s2.body.questions.map((q) => solve('loykrathong', q).it.id);
  assert.ok(ids2.every((id) => !ids1.has(id)), 'ชุดที่ 2 เป็นคำที่ยังไม่เคยฝึก');
  // ชุดเก่าถูกปิดเมื่อเริ่มชุดใหม่
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s1.body.id}/answer`, { token: u.token, body: { k: 0, choice: 0 } })).status, 409);
  // ตอบคำเดิมถูกอีกครั้ง → จำได้แล้ว
  const target = [...ids1][0];
  await pool.query('UPDATE theme_vocab_progress SET last_at = NOW() - INTERVAL \'1 day\' WHERE user_id = $1 AND item_id = $2', [u.id, target]);
  await pool.query(`UPDATE theme_vocab_progress SET streak = 1 WHERE user_id = $1`, [u.id]);
  const c = await req('GET', '/api/theme-vocab/categories/loykrathong', { token: u.token });
  assert.strictEqual(c.body.mastered, 0);
  await pool.query(`UPDATE theme_vocab_progress SET streak = 2 WHERE user_id = $1 AND item_id = $2`, [u.id, target]);
  const c2 = await req('GET', '/api/theme-vocab/categories/loykrathong', { token: u.token });
  assert.strictEqual(c2.body.mastered, 1);
  assert.strictEqual(c2.body.items.find((x) => x.id === target).progress.mastered, true);
  // ผิด → streak = 0
  const q = s2.body.questions[0]; const { it, idx } = solve('loykrathong', q);
  await req('POST', `/api/theme-vocab/quiz/${s2.body.id}/answer`, { token: u.token, body: { k: q.k, choice: (idx + 1) % 5 } });
  const p = (await pool.query('SELECT streak, wrong FROM theme_vocab_progress WHERE user_id = $1 AND item_id = $2', [u.id, it.id])).rows[0];
  assert.deepStrictEqual(p, { streak: 0, wrong: 1 });
});

test('ความปลอดภัย: ของคนอื่นเข้าไม่ได้ · ตัวเลือก/ข้อ/รหัสผิดถูกปฏิเสธ', async () => {
  const a = await makeUser('tva'); const b = await makeUser('tvb');
  const s = await req('POST', '/api/theme-vocab/categories/halloween/quiz', { token: a.token, body: {} });
  assert.strictEqual((await req('GET', `/api/theme-vocab/quiz/${s.body.id}`, { token: b.token })).status, 404);
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: b.token, body: { k: 0, choice: 0 } })).status, 404);
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s.body.id}/finish`, { token: b.token, body: {} })).status, 404);
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: a.token, body: { k: 0, choice: 5 } })).status, 400);
  assert.strictEqual((await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: a.token, body: { k: 99, choice: 0 } })).status, 400);
  assert.strictEqual((await req('POST', '/api/theme-vocab/quiz/abc/answer', { token: a.token, body: { k: 0, choice: 0 } })).status, 404);
  assert.strictEqual((await req('GET', `/api/theme-vocab/quiz/${s.body.id}`, { token: a.token })).status, 200);
});

test('ระดับยาก: ฝึก 10 ข้อ ทายความหมาย 5 ตัวเลือก · มีระดับ CEFR · ตรวจคำตอบได้', async () => {
  const u = await makeUser('tvh');
  for (const cat of ['halloween-hard', 'loykrathong-hard']) {
    const s = await req('POST', `/api/theme-vocab/categories/${cat}/quiz`, { token: u.token, body: {} });
    assert.strictEqual(s.status, 200);
    assert.strictEqual(s.body.questions.length, 10);
    for (const q of s.body.questions) {
      assert.strictEqual(q.type, 'meaning'); assert.strictEqual(q.options.length, 5); assert.ok(q.level);
    }
    const q = s.body.questions[0]; const { idx } = solve(cat, q);
    const a = await req('POST', `/api/theme-vocab/quiz/${s.body.id}/answer`, { token: u.token, body: { k: q.k, choice: idx } });
    assert.strictEqual(a.body.correct, true);
  }
});
