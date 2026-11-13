/*
  v1.19.0 ติวสอบ TCAS (TGAT1 / A-Level ภาษาอังกฤษ)
  - ชุดข้อสอบที่ส่งมากับแอป: ผ่านตัวตรวจโครงสร้าง + ไม่ซ้ำข้ามชุด + ผ่านการตรวจแบบไม่เห็นเฉลย (review.passed)
  - ไม่ส่งเฉลยก่อนตอบ/ก่อนส่ง · คะแนนตามน้ำหนักแต่ละส่วน · EXP ครั้งเดียว · หมดเวลาส่งอัตโนมัติ · ซ่อนข้อ · แจ้งข้อผิด · ผู้อื่นเปิดไม่ได้
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
const files = ['tgat1', 'alevel'].flatMap((e) => fs.readdirSync(path.join(DATA, e)).filter((f) => f.endsWith('.json')).map((f) => path.join(DATA, e, f)));
const sets = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const keyOf = (setId) => {
  const s = sets.find((x) => x.setId === setId);
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
  const name = `tc${Date.now() % 1e7}${n}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  return { token: r.body.token, id: r.body.user.id };
}
const pace = (uid) => pool.query("UPDATE users SET last_answer_at = NOW() - INTERVAL '3 seconds' WHERE id = $1", [uid]);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ชุดข้อสอบที่ส่งมากับแอป: TGAT1 2 ชุด + A-Level 2 ชุด · ผ่านตัวตรวจ · ไม่ซ้ำข้ามชุด · ผ่านการตรวจแบบไม่เห็นเฉลย', () => {
  assert.deepStrictEqual(sets.map((s) => s.setId).sort(), ['AL-S1', 'AL-S2', 'AL-S3', 'AL-S4', 'TG1-S1', 'TG1-S2', 'TG1-S3', 'TG1-S4']);
  assert.deepStrictEqual(Object.fromEntries(sets.map((s) => [s.setId, s.level])), { 'TG1-S1': 1, 'TG1-S2': 1, 'TG1-S3': 2, 'TG1-S4': 3, 'AL-S1': 1, 'AL-S2': 1, 'AL-S3': 2, 'AL-S4': 3 });
  for (const s of sets) {
    assert.deepStrictEqual(validateSet(s), [], s.setId);
    assert.strictEqual(s.original, true);
    assert.ok(s.review && s.review.passed === true && s.review.agree === s.review.total, `${s.setId} ต้องผ่าน blind review ครบทุกข้อ`);
  }
  assert.deepStrictEqual(crossCheck(sets), []);
  const loaded = T._reload();
  assert.strictEqual(loaded.sets.size, 8);
  assert.strictEqual(loaded.items.size, 60 * 4 + 80 * 4);
});

test('หน้ารวม: 2 ข้อสอบ · ไม่มีเฉลยในข้อมูล', async () => {
  const u = await makeUser();
  const r = await req('GET', '/api/tcas', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.exams.map((e) => [e.id, e.minutes, e.sets.length]), [['tgat1', 60, 4], ['alevel', 90, 4]]);
  assert.ok(!/"answer"|explanationTh/.test(r.raw));
  assert.strictEqual((await req('GET', '/api/tcas')).status, 401);
});

test('ฝึกทีละส่วน: ไม่มีเฉลยก่อนตอบ · ตอบแล้วได้เฉลย+คำอธิบาย · EXP ครั้งเดียวต่อข้อ · ตอบซ้ำไม่ได้', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'practice', section: 'speaking' } })).body;
  assert.strictEqual(s.total, 30);
  assert.ok(!/"answer"|explanationTh/.test(JSON.stringify(s.groups)));
  assert.deepStrictEqual(s.feedback, {});
  const key = keyOf('TG1-S1');
  const id = s.groups[0].items[0].id;
  await pace(u.id);
  const a = (await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } })).body;
  assert.strictEqual(a.correct, true); assert.strictEqual(a.answer, key[id]); assert.match(a.explanationTh, /[ก-๙]/);
  assert.strictEqual(a.gainedExp, 10, 'v1.19.2 ระดับ 1 ข้อละ 10 EXP');
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: 0 } })).status, 409);
  // ข้อที่ไม่อยู่ในส่วนนี้
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: 'TG1-S1-060', choice: 0 } })).status, 400);
  // เปิดซ้ำ = ชุดเดิม (ไม่เปิดซ้อน) และเห็นเฉลยของข้อที่ตอบแล้ว
  const again = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'practice', section: 'speaking' } })).body;
  assert.strictEqual(again.id, s.id); assert.ok(again.feedback[id]);
  const ev = await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND skill = 'tcas'", [u.id]);
  assert.strictEqual(ev.rows[0].n, 1);
  // ฝึกใหม่อีกรอบหลังจบ: ข้อเดิมไม่ได้ EXP ซ้ำ
  await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token });
  const s2 = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'practice', section: 'speaking' } })).body;
  assert.notStrictEqual(s2.id, s.id);
  await pace(u.id);
  const a2 = (await req('POST', `/api/tcas/sessions/${s2.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } })).body;
  assert.strictEqual(a2.gainedExp, 0);
});

test('สอบจำลอง TGAT1: ไม่มีเฉลยระหว่างสอบ · เปลี่ยน/ล้างคำตอบได้ · คะแนนตามน้ำหนัก (Speaking ถูกหมด = 50) · ส่งแล้วตอบต่อไม่ได้', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S2', mode: 'mock', instant: false } })).body;
  assert.strictEqual(s.total, 60); assert.ok(s.deadlineAt);
  const left = new Date(s.deadlineAt) - new Date(s.serverNow);
  assert.ok(left > 59 * 60000 && left <= 60 * 60000);
  const key = keyOf('TG1-S2');
  const speaking = s.groups.filter((g) => g.section === 'speaking').flatMap((g) => g.items.map((it) => it.id));
  assert.strictEqual(speaking.length, 30);
  for (const id of speaking) {
    const r = (await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: (key[id] + 1) % 4 } })).body;
    assert.ok(!('answer' in r) && !('correct' in r), 'ไม่มีเฉลยระหว่างสอบ');
    await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } });
  }
  const readingId = s.groups.find((g) => g.section === 'reading').items[0].id;
  await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: readingId, choice: (key[readingId] + 1) % 4 } });
  await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: readingId, choice: null } });
  const mid = (await req('GET', `/api/tcas/sessions/${s.id}`, { token: u.token })).body;
  assert.deepStrictEqual(mid.feedback, {}); assert.strictEqual(Object.keys(mid.answers).length, 30);
  const done = (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(done.finished, true, JSON.stringify(done).slice(0, 300));
  assert.strictEqual(done.result.score, 50);
  assert.deepStrictEqual(done.result.sections.map((x) => [x.id, x.correct, x.total, x.score]), [['speaking', 30, 30, 50], ['reading', 0, 30, 0]]);
  assert.strictEqual(Object.keys(done.feedback).length, 60, 'ส่งแล้วเห็นเฉลยทุกข้อ');
  assert.strictEqual(done.result.gainedExp, 60, 'ตอบครบครึ่งชุด -> EXP สอบจำลองครั้งแรก (ระดับ 1 = 60 · คะแนน 50 ยังไม่ได้โบนัส)');
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: readingId, choice: 0 } })).status, 409);
  // สอบชุดเดิมอีกครั้ง: ไม่ได้ EXP ครั้งแรกซ้ำ
  const s2 = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S2', mode: 'mock', instant: false } })).body;
  for (const id of speaking) await req('POST', `/api/tcas/sessions/${s2.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } });
  assert.ok(!(await req('POST', `/api/tcas/sessions/${s2.id}/finish`, { token: u.token })).body.result.gainedExp);
  const hub = (await req('GET', '/api/tcas', { token: u.token })).body;
  assert.strictEqual(hub.exams[0].sets.find((x) => x.setId === 'TG1-S2').mock.best, 50);
});

test('v1.19.2 สอบจำลองเฉลยทันที (ค่าเริ่มต้น): ตอบแล้วเห็นถูก/ผิด+คำอธิบาย · ตอบซ้ำ/ล้างไม่ได้ · ข้อที่ยังไม่ตอบไม่มีเฉลย · คะแนน/EXP ตอนส่งเหมือนเดิม', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'mock' } })).body;
  assert.strictEqual(s.instant, true, 'ไม่ส่ง instant = เฉลยทันที');
  const key = keyOf('TG1-S1');
  const [i1, i2] = s.groups.flatMap((g) => g.items.map((it) => it.id));
  const w = (await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: i1, choice: (key[i1] + 1) % 4 } })).body;
  assert.strictEqual(w.correct, false); assert.strictEqual(w.answer, key[i1]); assert.match(w.explanationTh, /[ก-๙]/);
  assert.ok(!('gainedExp' in w), 'สอบจำลองไม่ให้ EXP รายข้อ');
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: i1, choice: key[i1] } })).status, 409, 'ตอบแล้วเปลี่ยนไม่ได้');
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: i1, choice: null } })).status, 409, 'ล้างคำตอบไม่ได้');
  await pace(u.id);
  const ok2 = (await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: i2, choice: key[i2] } })).body;
  assert.strictEqual(ok2.correct, true);
  assert.strictEqual(ok2.gainedExp, 10, 'เฉลยทันที: ตอบถูกได้ EXP รายข้อ (คีย์เดียวกับโหมดฝึก)');
  const g = (await req('GET', `/api/tcas/sessions/${s.id}`, { token: u.token })).body;
  assert.deepStrictEqual(Object.keys(g.feedback).sort(), [i1, i2].sort(), 'เห็นเฉลยเฉพาะข้อที่ตอบแล้ว');
  assert.ok(!/"answer"/.test(JSON.stringify(g.groups)));
  const done = (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.strictEqual(done.result.correct, 1); assert.strictEqual(done.result.answered, 2);
  assert.ok(!done.result.gainedExp, 'ตอบไม่ถึงครึ่ง ไม่ได้ EXP');
  const ev = await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND skill = 'tcas'", [u.id]);
  assert.strictEqual(ev.rows[0].n, 2, 'บันทึกคำตอบตอนส่ง (ไม่ซ้ำ)');
  // เลือกเฉลยตอนส่ง
  const d = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S2', mode: 'mock', instant: false } })).body;
  assert.strictEqual(d.instant, false);
  const r = (await req('POST', `/api/tcas/sessions/${d.id}/answer`, { token: u.token, body: { itemId: d.groups[0].items[0].id, choice: 0 } })).body;
  assert.ok(!('answer' in r) && !('correct' in r));
  // ฝึกทีละส่วนไม่มี instant
  const p = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'practice', section: 'reading', instant: false } })).body;
  assert.strictEqual(p.instant, false);
});

test('v1.19.2 EXP ใหม่: ระดับ 2 ข้อละ 14 · จบส่วน +30 · ถูกทั้งส่วน +15 · สอบจำลองระดับ 2 = 90 + โบนัสคะแนน 60+/80+ · ครั้งเดียว', async () => {
  const u = await makeUser();
  const exp = async () => (await pool.query('SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1', [u.id])).rows[0].n;
  const key = keyOf('TG1-S3');
  const p = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S3', mode: 'practice', section: 'reading' } })).body;
  const ids = p.groups.flatMap((g) => g.items.map((it) => it.id));
  const e0 = await exp();
  let last;
  for (const id of ids) { await pace(u.id); last = (await req('POST', `/api/tcas/sessions/${p.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } })).body; }
  assert.strictEqual(last.sectionDone, true);
  assert.strictEqual(last.gainedExp, 14 + 30 + 15, 'ข้อสุดท้าย + จบส่วน + ถูกทั้งส่วน');
  assert.strictEqual((await exp()) - e0, ids.length * 14 + 30 + 15);
  // ฝึกส่วนเดิมซ้ำ: ไม่ได้อะไรเพิ่ม
  await req('POST', `/api/tcas/sessions/${p.id}/finish`, { token: u.token });
  const p2 = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S3', mode: 'practice', section: 'reading' } })).body;
  const e1 = await exp();
  for (const id of ids) { await pace(u.id); await req('POST', `/api/tcas/sessions/${p2.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } }); }
  assert.strictEqual(await exp(), e1, 'ทำซ้ำไม่ได้ EXP ซ้ำ');
  // สอบจำลองระดับ 2 แบบเฉลยตอนส่ง ได้ 100 -> 90 + 30 + 50
  const m = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S3', mode: 'mock', instant: false } })).body;
  for (const g of m.groups) for (const it of g.items) {
    const r = (await req('POST', `/api/tcas/sessions/${m.id}/answer`, { token: u.token, body: { itemId: it.id, choice: key[it.id] } })).body;
    assert.ok(!('gainedExp' in r), 'เฉลยตอนส่ง: ไม่มี EXP ระหว่างสอบ (ไม่บอกใบ้)');
  }
  const done = (await req('POST', `/api/tcas/sessions/${m.id}/finish`, { token: u.token })).body;
  assert.strictEqual(done.result.score, 100);
  assert.strictEqual(done.result.gainedExp, 90 + 30 + 50);
  assert.ok(done.levelUp && done.levelUp.levelInfo, 'ส่งแล้วได้ข้อมูลเลเวลไปอัปเดตหน้าจอ');
  const again = (await req('GET', `/api/tcas/sessions/${m.id}`, { token: u.token })).body;
  assert.ok(!again.levelUp, 'เปิดดูภายหลังไม่มี levelUp (ไม่เด้งซ้ำ)');
  const hub = (await req('GET', '/api/tcas', { token: u.token })).body;
  const s3 = hub.exams[0].sets.find((x) => x.setId === 'TG1-S3');
  assert.deepStrictEqual(s3.exp, { item: 14, section: 30, mock: 90, bonus80: 80 });
});

test('สอบจำลอง A-Level: น้ำหนัก 25/50/25 · Writing ถูกหมด = 25 · ส่งว่างไม่ได้ EXP', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'AL-S1', mode: 'mock' } })).body;
  assert.strictEqual(s.total, 80);
  const key = keyOf('AL-S1');
  for (const id of s.groups.filter((g) => g.section === 'writing').flatMap((g) => g.items.map((it) => it.id))) {
    await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } });
  }
  const done = (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body;
  assert.deepStrictEqual(done.result.sections.map((x) => [x.id, x.points, x.total]), [['listening_speaking', 25, 20], ['reading', 50, 40], ['writing', 25, 20]]);
  assert.strictEqual(done.result.score, 25);
  assert.ok(!done.result.gainedExp, 'ตอบไม่ถึงครึ่งชุด ไม่ได้ EXP');
});

test('หมดเวลาสอบจำลอง: ส่งให้อัตโนมัติ · ตอบไม่ได้แล้ว', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'mock' } })).body;
  await pool.query("UPDATE tcas_sessions SET deadline_at = NOW() - INTERVAL '5 minutes' WHERE id = $1", [s.id]);
  const id = s.groups[0].items[0].id;
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: id, choice: 0 } })).body.code, 'TIME_UP');
  const g = (await req('GET', `/api/tcas/sessions/${s.id}`, { token: u.token })).body;
  assert.strictEqual(g.finished, true); assert.strictEqual(g.result.auto, true);
});

test('ผู้ใช้อื่นเปิด/ตอบชุดของคนอื่นไม่ได้ · ข้อมูลไม่ถูกต้องถูกปฏิเสธ', async () => {
  const a = await makeUser(); const b = await makeUser();
  const s = (await req('POST', '/api/tcas/sessions', { token: a.token, body: { setId: 'TG1-S1', mode: 'mock' } })).body;
  assert.strictEqual((await req('GET', `/api/tcas/sessions/${s.id}`, { token: b.token })).status, 404);
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: b.token, body: { itemId: s.groups[0].items[0].id, choice: 0 } })).status, 404);
  assert.strictEqual((await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: a.token, body: { itemId: s.groups[0].items[0].id, choice: 7 } })).status, 400);
  assert.strictEqual((await req('POST', '/api/tcas/sessions', { token: a.token, body: { setId: 'NOPE', mode: 'mock' } })).status, 404);
  assert.strictEqual((await req('POST', '/api/tcas/sessions', { token: a.token, body: { setId: 'TG1-S1', mode: 'practice', section: 'writing' } })).status, 400);
});

test('แจ้งข้อสอบผิด (เฉพาะข้อที่ทำแล้ว) · ผู้ดูแลเห็นรายการ + ซ่อนข้อ -> ชุดใหม่ไม่มีข้อนั้น · ผู้ใช้ทั่วไปใช้หน้าผู้ดูแลไม่ได้', async () => {
  const u = await makeUser(); const adm = await makeUser();
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  assert.strictEqual((await req('POST', '/api/tcas/report', { token: u.token, body: { itemId: 'AL-S2-001', reason: 'typo' } })).status, 403);
  const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'AL-S2', mode: 'practice', section: 'listening_speaking' } })).body;
  const id = s.groups[0].items[0].id;
  assert.strictEqual((await req('POST', '/api/tcas/report', { token: u.token, body: { itemId: id, reason: 'ambiguous', note: '<b>B กับ C ถูกทั้งคู่</b>' } })).status, 200);
  assert.strictEqual((await req('GET', '/api/tcas/admin/reports', { token: u.token })).status, 403);
  const rep = (await req('GET', '/api/tcas/admin/reports', { token: adm.token })).body;
  const row = rep.reports.find((x) => x.itemId === id);
  assert.ok(row && row.reports === 1 && row.answer !== undefined);
  assert.strictEqual((await req('POST', '/api/tcas/admin/items/hide', { token: adm.token, body: { itemId: id, hidden: true, note: 'ตรวจแล้วกำกวม' } })).status, 200);
  const fresh = (await req('POST', '/api/tcas/sessions', { token: adm.token, body: { setId: 'AL-S2', mode: 'practice', section: 'listening_speaking' } })).body;
  assert.ok(!fresh.groups.flatMap((g) => g.items).some((it) => it.id === id));
  assert.strictEqual(fresh.total, 19);
  await req('POST', '/api/tcas/admin/items/hide', { token: adm.token, body: { itemId: id, hidden: false } });
});

test('ทุกข้อในทุกชุดบันทึกคำตอบได้จริง (ฝึกทุกส่วน + สอบจำลองทุกชุด ส่งได้)', async () => {
  const u = await makeUser();
  for (const s of sets) {
    const m = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: s.setId, mode: 'mock' } })).body;
    for (const g of m.groups) for (const it of g.items) {
      const r = await req('POST', `/api/tcas/sessions/${m.id}/answer`, { token: u.token, body: { itemId: it.id, choice: 0 } });
      assert.strictEqual(r.status, 200, `${it.id} ${r.raw}`);
    }
    const done = await req('POST', `/api/tcas/sessions/${m.id}/finish`, { token: u.token });
    assert.strictEqual(done.status, 200, `${s.setId} finish ${done.raw.slice(0, 200)}`);
    assert.strictEqual(done.body.result.answered, m.total);
    for (const sec of s.sections) {
      const p = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: s.setId, mode: 'practice', section: sec.id } })).body;
      for (const g of p.groups) for (const it of g.items) {
        await pace(u.id);
        const r = await req('POST', `/api/tcas/sessions/${p.id}/answer`, { token: u.token, body: { itemId: it.id, choice: 1 } });
        assert.strictEqual(r.status, 200, `${it.id} ${r.raw}`);
      }
      assert.strictEqual((await req('POST', `/api/tcas/sessions/${p.id}/finish`, { token: u.token })).status, 200);
    }
  }
  const ev = await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND skill = 'tcas'", [u.id]);
  assert.strictEqual(ev.rows[0].n, 560 * 2);
});

test('v1.19.2 ระดับความยาก: เรียงจากง่ายไปยาก · ระดับ 2 แนะนำหลังสอบจำลองระดับ 1 ได้ 60+ (ไม่ล็อก)', async () => {
  const u = await makeUser();
  const hub = async () => (await req('GET', '/api/tcas', { token: u.token })).body;
  let h = await hub();
  assert.strictEqual(h.levelReadyScore, 60);
  for (const e of h.exams) {
    assert.deepStrictEqual(e.sets.map((x) => x.level), [1, 1, 2, 3]);
    assert.match(e.sets[2].levelTh, /ท้าทาย/); assert.match(e.sets[0].levelTh, /มาตรฐาน/); assert.match(e.sets[3].levelTh, /เข้มข้น/);
    assert.strictEqual(e.sets[2].ready, false); assert.strictEqual(e.sets[3].ready, false);
    assert.deepStrictEqual(e.sets.map((x) => x.exp.item), [10, 10, 14, 18]);
    assert.ok(!('ready' in e.sets[0]));
  }
  // ระดับ 2 เปิดทำได้ทันที (ไม่ล็อก)
  const l2 = await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S3', mode: 'practice', section: 'speaking' } });
  assert.strictEqual(l2.status, 200);
  // สอบจำลอง TG1-S1 ได้ 60+ -> TGAT ระดับ 2 "พร้อมแล้ว" (A-Level ยังไม่)
  const key = keyOf('TG1-S1');
  const m = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'TG1-S1', mode: 'mock', instant: false } })).body;
  const ids = m.groups.flatMap((g) => g.items.map((it) => it.id));
  for (const id of ids.slice(0, 40)) await req('POST', `/api/tcas/sessions/${m.id}/answer`, { token: u.token, body: { itemId: id, choice: key[id] } });
  const done = (await req('POST', `/api/tcas/sessions/${m.id}/finish`, { token: u.token })).body;
  assert.ok(done.result.score >= 60, `score ${done.result.score}`);
  h = await hub();
  assert.strictEqual(h.exams.find((e) => e.id === 'tgat1').sets[2].ready, true);
  assert.strictEqual(h.exams.find((e) => e.id === 'tgat1').sets[3].ready, false, 'ระดับ 3 ต้องผ่านระดับ 2 ก่อน (แนะนำ)');
  assert.strictEqual(h.exams.find((e) => e.id === 'alevel').sets[2].ready, false);
});

test('EXP รายข้ออยู่ในการตรวจจังหวะตอบ (tcq:)', () => {
  assert.ok(require('../utils/answerPace').PACED_KEY.test('tcq:TG1-S1-001'));
});
