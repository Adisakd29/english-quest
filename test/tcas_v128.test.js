/*
  v1.28.0 คลังข้อสอบเพิ่ม + เลือกสนามสอบจาก Dropdown
  - TGAT1 / A-Level / ก.พ. ชุดละ 8 (+4) · สนามใหม่ O-NET ม.6 (5 ตัวเลือก) · CU-TEP · TU-GET ชุดละ 4
  - ทุกชุดผ่านตัวตรวจ + ไม่ซ้ำข้ามชุด + ผ่าน blind review (ตรงเฉลยทุกข้อ หรือ ≥ 98% เมื่อผู้ประสานงานตรวจซ้ำและบันทึกหมายเหตุ)
  - หน้ารวมมีกลุ่มสนามสอบ + ทางไป TOEIC · ไม่มีเฉลยในข้อมูล
  - O-NET รับตัวเลือก 0–4 · ข้ออื่นรับ 0–3 (เกินช่วง = 400)
  - ฟัง (CU-TEP) มีธง audio · หาจุดผิดมีธง errorId และตัวเลือกตรงกับส่วนที่ขีดเส้นใต้
  - คะแนนเต็มเฉพาะ CU-TEP 120 / TU-GET 1000 · ไม่มีเกณฑ์ผ่านกลาง
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.TCAS_RATE_PER_MIN = '100000';

const pool = require('../config/db');
const { createApp } = require('../app');
const T = require('../services/tcas');
const { validateSet, crossCheck } = require('../scripts/tcas/validate');

const DATA = path.join(__dirname, '..', 'data', 'tcas');
const EXAMS = { tgat1: 8, alevel: 8, kp: 8, onet6: 4, cutep: 4, tuget: 4 };
const byExam = Object.fromEntries(Object.keys(EXAMS).map((e) => [e, fs.readdirSync(path.join(DATA, e)).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATA, e, f), 'utf8')))]));
const all = Object.values(byExam).flat();
const keyOf = (setId) => {
  const s = all.find((x) => x.setId === setId);
  return Object.fromEntries(s.sections.flatMap((sec) => sec.groups.flatMap((g) => g.items.map((it) => [it.id, it.answer]))));
};

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + p, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null, raw: buf }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
let n = 0;
async function makeUser() {
  n += 1;
  const name = `v128${Date.now() % 1e7}${n}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  return { token: r.body.token, id: r.body.user.id };
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('คลังข้อสอบ v1.28.0: จำนวนชุดต่อสนาม · ผ่านตัวตรวจ · ไม่ซ้ำข้ามชุด · ผ่าน blind review · โหลดครบเมื่อปิดชุดที่ยังไม่ตรวจ', () => {
  for (const [e, cnt] of Object.entries(EXAMS)) {
    assert.strictEqual(byExam[e].length, cnt, e);
    for (const s of byExam[e]) {
      assert.strictEqual(s.exam, e);
      assert.deepStrictEqual(validateSet(s), [], s.setId);
      assert.strictEqual(s.original, true, s.setId);
      const r = s.review || {};
      assert.strictEqual(r.passed, true, `${s.setId} ต้องผ่าน blind review`);
      const km = r.keyMatch ?? r.agree;
      // ผู้ตรวจตอบตรงเฉลยทุกข้อ · ยกเว้นข้อที่ผู้ประสานงานตรวจซ้ำแล้วและบันทึกหมายเหตุไว้ (≤ 2%)
      assert.ok(km === r.total || (r.note && km / r.total >= 0.98), `${s.setId} ตรงเฉลย ${km}/${r.total}`);
      assert.ok(r.agree === r.total || r.note, `${s.setId} ข้อที่ผู้ตรวจไม่แน่ใจต้องมีหมายเหตุ`);
      if (r.date === '2026-11-26') assert.match(r.method, /ยังไม่ได้ตรวจโดยครู/, 'ชุดใหม่ต้องบอกตรง ๆ ว่ายังไม่ได้ตรวจโดยครู');
    }
    assert.deepStrictEqual(crossCheck(byExam[e]), [], e);
  }
  const loaded = T._reload();
  for (const [e, cnt] of Object.entries(EXAMS)) assert.strictEqual([...loaded.sets.values()].filter((x) => x.exam === e).length, cnt, e);
});

test('โครงสร้างสนามใหม่: O-NET 80 ข้อ 5 ตัวเลือก · CU-TEP 30/60/30 · TU-GET 25+25+50', () => {
  for (const s of byExam.onet6) {
    const items = s.sections.flatMap((x) => x.groups.flatMap((g) => g.items));
    assert.strictEqual(items.length, 80); assert.ok(items.every((it) => it.options.length === 5));
  }
  for (const s of byExam.cutep) {
    assert.deepStrictEqual(s.sections.map((x) => x.groups.reduce((a, g) => a + g.items.length, 0)), [30, 60, 30], s.setId);
    for (const g of s.sections.flatMap((x) => x.groups).filter((g) => g.type === 'cu_error')) {
      for (const it of g.items) {
        const segs = [...it.stem.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
        assert.deepStrictEqual(segs, it.options, `${it.id} ตัวเลือกต้องตรงกับส่วนที่ขีดเส้นใต้`);
      }
    }
  }
  for (const s of byExam.tuget) assert.strictEqual(s.sections.flatMap((x) => x.groups.flatMap((g) => g.items)).length, 100);
});

test('หน้ารวม: 6 สนาม + กลุ่ม + TOEIC · ไม่มีเฉลยในข้อมูล', async () => {
  const u = await makeUser();
  const r = await req('GET', '/api/tcas', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.exams.map((e) => [e.id, e.group, e.options, e.sets.length]),
    [['tgat1', 'tcas', 4, 8], ['alevel', 'tcas', 4, 8], ['onet6', 'school', 5, 4], ['cutep', 'uni', 4, 4], ['tuget', 'uni', 4, 4], ['kp', 'gov', 4, 8]]
      .sort((a, b) => r.body.exams.findIndex((e) => e.id === a[0]) - r.body.exams.findIndex((e) => e.id === b[0])));
  assert.deepStrictEqual(Object.keys(r.body.groups).sort(), ['gov', 'school', 'tcas', 'uni']);
  assert.strictEqual(r.body.toeic.route, 'toeic');
  const cu = r.body.exams.find((e) => e.id === 'cutep'); const tu = r.body.exams.find((e) => e.id === 'tuget'); const on = r.body.exams.find((e) => e.id === 'onet6');
  assert.deepStrictEqual([cu.scale, cu.passScore, cu.minutes], [120, null, 130]);
  assert.deepStrictEqual([tu.scale, tu.passScore, tu.minutes], [1000, null, 180]);
  assert.strictEqual(on.minutes, 90);
  for (const e of [cu, tu, on]) assert.match(e.note, /ไม่ใช่ข้อสอบจริง|ต้นฉบับ/);
  assert.ok(!/"answer"|explanationTh/.test(r.raw));
});

test('O-NET: รับตัวเลือก E (4) · ตัวเลือกเกินช่วงถูกปฏิเสธ · ข้อ 4 ตัวเลือกรับ 4 ไม่ได้', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'ON6-S1', mode: 'mock', instant: false } })).body;
  assert.strictEqual(s.total, 80);
  const id = s.groups[0].items[0].id;
  assert.strictEqual(s.groups[0].items[0].options.length, 5);
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: 4 } })).status, 200);
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: 5 } })).status, 400);
  const t = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S5', mode: 'mock', instant: false } })).body;
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${t.id}/answer`, { token: u.token, body: { itemId: t.groups[0].items[0].id, choice: 4 } })).status, 400);
});

test('CU-TEP: กลุ่มฟังมีธง audio · หาจุดผิดมีธง errorId · ถูกหมด = 120/120 ไม่มีเกณฑ์ผ่าน · ไม่มีเฉลยระหว่างสอบ', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'CU-S1', mode: 'mock', instant: false } })).body;
  assert.strictEqual(s.total, 120);
  assert.ok(!/"answer"|explanationTh/.test(JSON.stringify(s.groups)));
  const audio = s.groups.filter((g) => g.audio); const err = s.groups.filter((g) => g.errorId);
  assert.strictEqual(audio.reduce((a, g) => a + g.items.length, 0), 30);
  assert.ok(audio.every((g) => g.section === 'listening'));
  assert.strictEqual(err.reduce((a, g) => a + g.items.length, 0), 30);
  const key = keyOf('CU-S1');
  for (const g of s.groups) for (const it of g.items) {
    const r = await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: it.id, choice: key[it.id] } });
    assert.strictEqual(r.status, 200, r.raw);
  }
  const done = (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.deepStrictEqual(done.result.scaled, { scale: 120, points: 120, passScore: null, pass: null });
  assert.deepStrictEqual(done.result.sections.map((x) => [x.id, x.points, x.total]), [['listening', 30, 30], ['reading', 60, 60], ['writing', 30, 30]]);
});

test('TU-GET: ถูกเฉพาะ Reading = 500/1000 · ส่วน 250/250/500', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TU-S1', mode: 'mock', instant: false } })).body;
  assert.strictEqual(s.total, 100);
  const key = keyOf('TU-S1');
  for (const g of s.groups) for (const it of g.items) {
    const c = g.section === 'reading' ? key[it.id] : (key[it.id] + 1) % 4;
    assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: it.id, choice: c } })).status, 200);
  }
  const done = (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.deepStrictEqual(done.result.scaled, { scale: 1000, points: 500, passScore: null, pass: null });
  assert.deepStrictEqual(done.result.sections.map((x) => x.points), [250, 250, 500]);
});

test('สนามใหม่ทุกชุด: ฝึกทีละส่วนตอบได้ทุกข้อ · ได้คำอธิบายภาษาไทยหลังตอบ', async () => {
  const u = await makeUser();
  for (const s of [...byExam.onet6, ...byExam.cutep, ...byExam.tuget]) {
    const key = keyOf(s.setId);
    for (const sec of s.sections) {
      const p = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: s.setId, mode: 'practice', section: sec.id } })).body;
      for (const g of p.groups) for (const it of g.items) {
        await pool.query("UPDATE users SET last_answer_at = NOW() - INTERVAL '3 seconds' WHERE id = $1", [u.id]);
        const r = await req('POST', `/api/tcas/sessions/${p.id}/answer`, { token: u.token, body: { itemId: it.id, choice: key[it.id] } });
        assert.strictEqual(r.status, 200, `${it.id} ${r.raw}`);
        assert.strictEqual(r.body.correct, true, it.id);
        assert.match(r.body.explanationTh, /[ก-๙]/, it.id);
      }
      assert.strictEqual((await req('POST', `/api/tcas/sessions/${p.id}/finish`, { token: u.token })).status, 200);
    }
  }
});
