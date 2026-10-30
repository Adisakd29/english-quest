/*
  TOEIC — วิเคราะห์จุดอ่อน (รวม Part 1–7) + ชุดฝึกเฉพาะกลุ่มทักษะ
  - ผู้ใช้ใหม่: ทุกกลุ่ม "ยังไม่เคยฝึก" · ไม่มีแผน · มีปุ่มฝึกทุกกลุ่มที่มีข้อในคลัง
  - ตอบผิดในกลุ่มหนึ่ง → กลุ่มนั้นเป็น weak และขึ้นเป็นอันดับแรกของแผน · นับข้อที่ยังผิดอยู่
  - ชุดฝึก (drill) ของทุก Part ได้เฉพาะข้อ/ชุดที่มีกลุ่มทักษะนั้น · group ที่ไม่รู้จักถูกละเลย · Mock ไม่รับ group
  - ข้อมูลของคนอื่นไม่ปน · ต้องล็อกอิน
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const bank = require('../services/toeic/bank');
const P5 = require('../services/toeic/part5');
const W = require('../services/toeic/weakness');
const { PART1, PART34 } = require('../config/toeic');

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
async function makeUser(prefix = 'tw') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const itemsOf = async (sid) => (await pool.query('SELECT items, config FROM toeic_sessions WHERE id = $1', [sid])).rows[0];

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('คะแนนจุดอ่อน: ปรับด้วย prior · ตอบน้อยข้อ = ข้อมูลน้อย · เกณฑ์ weak/fair/strong', () => {
  const { smooth, statusOf } = W._internal;
  assert.ok(Math.abs(smooth(0, 0) - 0.7) < 1e-9);
  assert.strictEqual(statusOf(2, smooth(0, 2)), 'few');
  assert.strictEqual(statusOf(3, smooth(0, 3)), 'weak');
  assert.strictEqual(statusOf(10, smooth(6, 10)), 'fair');
  assert.strictEqual(statusOf(10, smooth(10, 10)), 'strong');
  assert.ok(smooth(0, 10) < smooth(0, 3), 'ผิดมากข้อ = อ่อนชัดกว่า');
  // ทุกกลุ่มมีเคล็ดลับ
  for (const [part, d] of Object.entries(W._internal.DEF)) d.groups.forEach((g) => assert.ok(W._internal.tipOf(Number(part), g), `tip ${part}/${g}`));
});

test('ต้องล็อกอิน · ผู้ใช้ใหม่ยังไม่มีแผน และทุกกลุ่มเป็น "ยังไม่เคยฝึก"', async () => {
  assert.strictEqual((await req('GET', '/api/toeic/weakness')).status, 401);
  const u = await makeUser();
  const r = (await req('GET', '/api/toeic/weakness', { token: u.token })).body;
  assert.strictEqual(r.answered, 0); assert.strictEqual(r.parts.length, 7); assert.deepStrictEqual(r.plan, []);
  assert.ok(r.parts.every((p) => p.groups.every((g) => g.status === 'untried')));
  assert.ok(r.untriedTotal > 20 && r.untried.length <= 6);
  assert.ok(r.parts.every((p) => p.groups.some((g) => g.drill)), 'ทุก Part มีชุดฝึกอย่างน้อย 1 กลุ่ม');
  assert.strictEqual(r.mistakesTotal, 0);
});

test('ตอบผิดในกลุ่ม "บุพบท" Part 5 → weak · อยู่อันดับแรกของแผน · นับข้อผิด · คนอื่นไม่เห็น', async () => {
  const u = await makeUser(); const other = await makeUser();
  const s = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'practice', size: 10, group: 'prepositions', drill: true } })).body;
  assert.strictEqual(s.config.group, 'prepositions'); assert.strictEqual(s.config.drill, true); assert.strictEqual(s.config.focus, 'prepositions');
  const c = await bank.ready();
  const { items } = await itemsOf(s.id);
  assert.ok(items.length >= 5);
  for (const it of items) {
    const q = c.byId.get(it.qid);
    assert.ok(['preposition'].includes(q.skill), `ข้อ ${it.qid} อยู่นอกกลุ่ม (${q.skill})`);
    const key = P5._internal.correctLetter(q, it.variant);
    const wrong = ['A', 'B', 'C', 'D'].find((x) => x !== key);
    const a = await req('POST', `/api/toeic/p5/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: wrong } });
    assert.strictEqual(a.status, 200);
  }
  const r = (await req('GET', '/api/toeic/weakness', { token: u.token })).body;
  const g = r.parts[4].groups.find((x) => x.id === 'prepositions');
  assert.strictEqual(g.answered, items.length); assert.strictEqual(g.accuracy, 0); assert.strictEqual(g.status, 'weak');
  assert.strictEqual(r.plan[0].part, 5); assert.strictEqual(r.plan[0].id, 'prepositions');
  assert.deepStrictEqual(r.plan[0].drill.body, { size: 10, group: 'prepositions', drill: true });
  assert.strictEqual(r.parts[4].mistakes, items.length); assert.strictEqual(r.mistakesTotal, items.length);
  assert.strictEqual(r.sections.R.answered, items.length); assert.strictEqual(r.sections.L.answered, 0);
  const o = (await req('GET', '/api/toeic/weakness', { token: other.token })).body;
  assert.strictEqual(o.answered, 0, 'ข้อมูลไม่ปนกัน');
  // ช่วง 30 วันยังเห็นข้อเดิม
  assert.strictEqual((await req('GET', '/api/toeic/weakness?range=30', { token: u.token })).body.answered, items.length);
});

test('ชุดฝึกเฉพาะกลุ่มทุก Part: ได้เฉพาะข้อ/ชุดที่มีกลุ่มนั้น · group ไม่รู้จักถูกละเลย · Mock ไม่รับ group', async () => {
  const u = await makeUser();
  const c = await bank.ready();
  const start = async (part, body) => (await req('POST', `/api/toeic/p${part}/sessions`, { token: u.token, body: { mode: 'practice', drill: true, ...body } }));
  // Part 1: Passive
  let s = (await start(1, { size: 10, group: 'passive' })).body;
  assert.strictEqual(s.config.group, 'passive');
  for (const it of (await itemsOf(s.id)).items) assert.ok(c.byId.get(it.qid).skills.some((k) => PART1.skillGroups.passive.includes(k)));
  // Part 2: Tag question
  s = (await start(2, { size: 10, group: 'tag' })).body;
  for (const it of (await itemsOf(s.id)).items) assert.strictEqual(c.byId.get(it.qid).category, 'tag');
  // Part 3/4: กราฟิก
  for (const part of [3, 4]) {
    s = (await start(part, { size: 3, group: 'graphic' })).body;
    assert.strictEqual(s.config.group, 'graphic');
    for (const it of (await itemsOf(s.id)).items) assert.ok(c.byId.get(it.qid).questions.some((q) => PART34.groupOf[q.type] === 'graphic'), `P${part} ${it.qid}`);
  }
  // Part 6: เติมประโยค
  s = (await start(6, { size: 2, group: 'sentence' })).body;
  for (const it of (await itemsOf(s.id)).items) assert.ok(c.byId.get(it.qid).questions.some((q) => q.skill === 'sentenceInsertion'));
  // Part 7: เชื่อมหลายเอกสาร
  s = (await start(7, { size: 3, group: 'cross' })).body;
  for (const it of (await itemsOf(s.id)).items) assert.ok(c.byId.get(it.qid).questions.some((q) => q.type === 'crossReference'));
  // group ที่ไม่รู้จัก → ฝึกปกติ (ไม่ error)
  s = (await start(5, { size: 10, group: '<script>' })).body;
  assert.strictEqual(s.config.group, undefined); assert.strictEqual(s.config.drill, undefined); assert.strictEqual(s.config.focus, 'mixed');
  for (const part of [1, 2, 3, 5, 6, 7]) {
    s = (await start(part, { group: 'constructor' })).body;
    assert.strictEqual(s.config.group, undefined, `P${part} ไม่รับ group จาก prototype`);
  }
  // Mock ไม่รับ group
  const m = (await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock', group: 'prepositions' } })).body;
  assert.strictEqual(m.config.group, undefined); assert.strictEqual(m.total, 30);
});

test('กลุ่มที่ยังไม่เคยฝึกเรียงสลับ Part (6 อันดับแรกมาจาก 6 Part ต่างกัน)', async () => {
  const u = await makeUser();
  const r = (await req('GET', '/api/toeic/weakness', { token: u.token })).body;
  assert.strictEqual(new Set(r.untried.map((g) => g.part)).size, 6);
});
