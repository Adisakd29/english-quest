/*
  v1.22.0 ติวสอบ ก.พ. ภาค ก ภาษาอังกฤษ (exam: kp)
  - 4 ชุดต้นฉบับ ผ่านตัวตรวจ + ไม่ซ้ำข้ามชุด + ผ่าน blind review
  - โครงสร้าง 25 ข้อ: Conversation 5 · Structure 5 · Vocabulary 5 · Reading 10 (2 บทความ) · 50 นาที
  - คะแนนเต็ม 50 (ข้อละ 2) · เกณฑ์ผ่าน 25 · คะแนนร้อยละยังเก็บเหมือนเดิม (ไม่กระทบ TCAS)
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

const DIR = path.join(__dirname, '..', 'data', 'tcas', 'kp');
const sets = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
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
  const name = `kp${Date.now() % 1e7}${n}`.slice(0, 20);
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

test('ชุด ก.พ. 4 ชุด: ผ่านตัวตรวจ · โครงสร้าง 5/5/5/10 · ต้นฉบับ · ไม่ซ้ำข้ามชุด · ผ่าน blind review ครบทุกข้อ', () => {
  assert.deepStrictEqual(sets.map((s) => s.setId).sort(), ['KP-S1', 'KP-S2', 'KP-S3', 'KP-S4']);
  assert.deepStrictEqual(Object.fromEntries(sets.map((s) => [s.setId, s.level])), { 'KP-S1': 1, 'KP-S2': 1, 'KP-S3': 2, 'KP-S4': 2 });
  for (const s of sets) {
    assert.strictEqual(s.exam, 'kp');
    assert.deepStrictEqual(validateSet(s), [], s.setId);
    assert.strictEqual(s.original, true);
    assert.deepStrictEqual(s.sections.map((x) => [x.id, x.groups.reduce((a, g) => a + g.items.length, 0)]),
      [['conversation', 5], ['structure', 5], ['vocabulary', 5], ['reading', 10]]);
    assert.ok(s.review && s.review.passed === true && s.review.agree === s.review.total && s.review.total === 25, `${s.setId} ต้องผ่าน blind review ครบ`);
  }
  assert.deepStrictEqual(crossCheck(sets), []);
  const loaded = T._reload();
  assert.strictEqual([...loaded.sets.values()].filter((x) => x.exam === 'kp').length, 4);
});

test('ตัวตรวจจับรูปแบบผิดของ ก.พ.: Structure ไม่มีช่องว่าง / มี text / จำนวนข้อผิด', () => {
  const bad = JSON.parse(JSON.stringify(sets[0]));
  const st = bad.sections.find((x) => x.id === 'structure').groups[0];
  st.items[0].stem = st.items[0].stem.replace(/_{4,}/, 'xxxx');
  st.text = 'should not be here';
  const errs = validateSet(bad).join('\n');
  assert.match(errs, /ช่องว่าง ____/);
  assert.match(errs, /ไม่มี text\/dialogue/);
  const bad2 = JSON.parse(JSON.stringify(sets[0]));
  bad2.sections.find((x) => x.id === 'reading').groups[0].items.pop();
  assert.ok(validateSet(bad2).length > 0);
});

test('หน้ารวม: มี ก.พ. 50 นาที · เต็ม 50 · เกณฑ์ 25 · ส่วน 10/10/10/20 · ไม่มีเฉลยในข้อมูล', async () => {
  const u = await makeUser();
  const r = await req('GET', '/api/tcas', { token: u.token });
  assert.strictEqual(r.status, 200);
  const kp = r.body.exams.find((e) => e.id === 'kp');
  assert.ok(kp);
  assert.strictEqual(kp.minutes, 50); assert.strictEqual(kp.scale, 50); assert.strictEqual(kp.passScore, 25);
  assert.deepStrictEqual(kp.sections.map((x) => [x.id, x.points]), [['conversation', 10], ['structure', 10], ['vocabulary', 10], ['reading', 20]]);
  assert.deepStrictEqual(kp.sets.map((x) => [x.setId, x.level, x.total]), [['KP-S1', 1, 25], ['KP-S2', 1, 25], ['KP-S3', 2, 25], ['KP-S4', 2, 25]]);
  assert.match(kp.note, /ไม่ใช่ข้อสอบจริง/);
  assert.strictEqual(r.body.exams.find((e) => e.id === 'tgat1').scale, 100);
  assert.ok(!/"answer"|explanationTh/.test(r.raw));
});

test('สอบจำลอง ก.พ.: ถูกหมด = 50/50 ผ่าน · ถูกเฉพาะ Reading = 20/50 ไม่ผ่าน · ถูก 13 ข้อ = 26 ผ่าน · ไม่มีเฉลยระหว่างสอบ', async () => {
  const key = keyOf('KP-S1');
  const run = async (pick) => {
    const u = await makeUser();
    const s = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: 'KP-S1', mode: 'mock', instant: false } })).body;
    assert.strictEqual(s.total, 25); assert.strictEqual(s.scale, 50); assert.strictEqual(s.passScore, 25);
    assert.ok(!/"answer"|explanationTh/.test(JSON.stringify(s.groups)));
    const all = s.groups.flatMap((g) => g.items.map((it) => ({ id: it.id, section: g.section })));
    for (const [i, x] of all.entries()) {
      const r = await req('POST', `/api/tcas/sessions/${s.id}/answer`, { token: u.token, body: { itemId: x.id, choice: pick(x, i) ? key[x.id] : (key[x.id] + 1) % 4 } });
      assert.strictEqual(r.status, 200, r.raw);
      assert.ok(!/explanationTh/.test(r.raw), 'สอบแบบเฉลยตอนส่ง ต้องไม่มีเฉลยระหว่างสอบ');
    }
    return (await req('POST', `/api/tcas/sessions/${s.id}/finish`, { token: u.token })).body.result;
  };
  const full = await run(() => true);
  assert.strictEqual(full.score, 100);
  assert.deepStrictEqual(full.scaled, { scale: 50, points: 50, passScore: 25, pass: true });
  assert.deepStrictEqual(full.sections.map((x) => [x.id, x.points, x.total, x.score]),
    [['conversation', 10, 5, 10], ['structure', 10, 5, 10], ['vocabulary', 10, 5, 10], ['reading', 20, 10, 20]]);
  const rd = await run((x) => x.section === 'reading');
  assert.deepStrictEqual(rd.scaled, { scale: 50, points: 20, passScore: 25, pass: false });
  assert.strictEqual(rd.score, 40);
  const half = await run((x, i) => i < 13);
  assert.deepStrictEqual([half.scaled.points, half.scaled.pass], [26, true]);
  const low = await run((x, i) => i < 12);
  assert.deepStrictEqual([low.scaled.points, low.scaled.pass], [24, false]);
});

test('ฝึกทีละส่วน ก.พ.: ทุกส่วนทุกชุดตอบได้ · ได้เฉลยภาษาไทยหลังตอบ · EXP ระดับ 1 ข้อละ 10', async () => {
  const u = await makeUser();
  for (const s of sets) {
    for (const sec of s.sections) {
      const p = (await req('POST', '/api/tcas/sessions', { token: u.token, body: { setId: s.setId, mode: 'practice', section: sec.id } })).body;
      assert.strictEqual(p.total, sec.id === 'reading' ? 10 : 5, `${s.setId} ${sec.id}`);
      for (const g of p.groups) for (const it of g.items) {
        await pace(u.id);
        const r = await req('POST', `/api/tcas/sessions/${p.id}/answer`, { token: u.token, body: { itemId: it.id, choice: keyOf(s.setId)[it.id] } });
        assert.strictEqual(r.status, 200, `${it.id} ${r.raw}`);
        const fb = r.body.feedback || (r.body.session && r.body.session.feedback && r.body.session.feedback[it.id]) || r.body;
        assert.match(JSON.stringify(fb), /[฀-๿]/, `${it.id} ต้องมีคำอธิบายภาษาไทย`);
      }
      assert.strictEqual((await req('POST', `/api/tcas/sessions/${p.id}/finish`, { token: u.token })).status, 200);
    }
  }
  const ev = await pool.query("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS ok FROM answer_events WHERE user_id = $1 AND skill = 'tcas'", [u.id]);
  assert.deepStrictEqual(ev.rows[0], { n: 100, ok: 100 });
});
