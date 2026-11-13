/*
  v1.10.0 Phase 3 — เครื่องมือเรียนแบบไม่ใช้ AI: Writing Studio + ผู้ช่วยค้นคำตอบ
  - ตรวจงานเขียนด้วยกฎ + ระดับคำศัพท์ CEFR + คำเชื่อม/คำซ้ำ/คำพื้นฐาน · ไม่เก็บข้อความ (เก็บสถิติ)
  - ค้นคำตอบจาก FAQ · หัวข้อไวยากรณ์ · คำศัพท์ (อังกฤษ↔ไทย) · ไม่เรียกบริการภายนอก
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const wordStore = require('../utils/wordStore');
const WS = require('../services/writingStudio');

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
  const name = `st${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await wordStore.reload(); WS.resetLexicon();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('Writing Studio: จับข้อผิดที่พบบ่อย (กริยาอดีต · a/an · I ตัวเล็ก) · ระดับคำศัพท์ · คำพื้นฐานซ้ำ · คำเป้าหมาย', () => {
  const t = 'Last weekend i go to Chiang Mai with my family. The food was very good and the hotel was very good too. '
    + 'We visited a old temple. It was a very good trip. However, the journey was long, although the scenery was remarkable.';
  const r = WS.analyze(t, { targets: ['journey', 'delicious'] });
  const types = r.grammar.issues.map((i) => i.type);
  assert.ok(types.includes('tense') && types.includes('article') && types.includes('capital_i'), types.join());
  assert.ok(r.grammar.issues.find((i) => i.type === 'tense').msgTh.includes('Last weekend'));
  assert.strictEqual(r.stats.sentences, 5);
  assert.ok(r.vocab.known > 5 && r.vocab.profile.A1 > 0);
  assert.ok(['B1', 'B2', 'C1'].includes(r.vocab.estimate), r.vocab.estimate);
  assert.ok(!r.vocab.unknownSample.includes('chiang'), 'ชื่อเฉพาะไม่นับเป็นคำนอกคลัง');
  assert.ok(r.basic.some((b) => b.word === 'good' && b.alternatives.length >= 3));
  assert.ok(r.linkers.some((l) => l.text === 'however' && l.level === 'B1'));
  assert.deepStrictEqual(r.targets.missing, ['delicious']);
  assert.ok(r.tips.length >= 2 && r.tips[0].includes('ไวยากรณ์'));
  // ประโยคถูกต้อง → ไม่มีข้อผิด tense/agreement
  const ok = WS.analyze('Yesterday I went to the market. My sister usually goes there every Sunday.');
  assert.strictEqual(ok.grammar.errors, 0, JSON.stringify(ok.grammar.issues));
  // lookup ผันรูป
  assert.strictEqual(WS.lookup('went').head, 'go');
  assert.strictEqual(WS.lookup('studies').head, 'study');
  assert.strictEqual(WS.lookup('bigger').head, 'big');
});

test('Writing Studio API: ต้องเข้าสู่ระบบ · ตรวจค่า · ไม่เก็บข้อความ (เก็บแค่สถิติ) · ประวัติของฉัน', async () => {
  assert.strictEqual((await req('POST', '/api/studio/writing/check', { body: { text: 'Hi.' } })).status, 401);
  const u = await makeUser();
  assert.strictEqual((await req('POST', '/api/studio/writing/check', { token: u.token, body: { text: '   ' } })).status, 400);
  assert.strictEqual((await req('POST', '/api/studio/writing/check', { token: u.token, body: { text: 'a'.repeat(3001) } })).status, 400);
  const secret = 'My secret password is zebra123 and I live near the river.';
  const r = await req('POST', '/api/studio/writing/check', { token: u.token, body: { text: secret, promptId: 'a2-weekend', targets: ['river'] } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.tips.some((t) => t.includes('อย่างน้อย 60 คำ')), 'บอกความยาวตามโจทย์');
  const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'writing_studio_logs'")).rows.map((x) => x.column_name);
  assert.ok(!cols.some((c) => /text|content|body/.test(c)), `ไม่มีคอลัมน์เก็บข้อความ (${cols})`);
  const row = (await pool.query('SELECT * FROM writing_studio_logs WHERE user_id = $1', [u.id])).rows[0];
  assert.ok(row && row.words >= 10 && !JSON.stringify(row).includes('zebra'));
  const h = await req('GET', '/api/studio/writing', { token: u.token });
  assert.strictEqual(h.body.stats.checks, 1);
  assert.ok(h.body.prompts.A1.length >= 3 && h.body.prompts.C1.length >= 2);
});

test('ผู้ช่วยค้นคำตอบ: FAQ · หัวข้อไวยากรณ์ · คำศัพท์อังกฤษ→ไทย และไทย→อังกฤษ · ไม่พบ = ตัวอย่างคำถาม', async () => {
  const u = await makeUser();
  const q = async (s) => (await req('GET', `/api/studio/help?q=${encodeURIComponent(s)}`, { token: u.token })).body;
  const a = await q('since กับ for ต่างกันยังไง');
  assert.strictEqual(a.faq[0].id, 'since-for'); assert.ok(a.faq[0].topic && a.faq[0].examples.length);
  assert.strictEqual((await q('ใช้ a หรือ an')).faq[0].id, 'a-an');
  const pp = await q('present perfect');
  assert.strictEqual(pp.grammar[0].id, 'a2-present-perfect-intro');
  const w = await q('delicious');
  assert.ok(w.words.length && w.words[0].thai && w.words[0].example);
  const th = await q('ขอบคุณ');
  assert.ok(th.words.some((x) => /thank/.test(x.word)));
  const none = await q('qwertyzx');
  assert.ok(!none.faq.length && !none.grammar.length && !none.words.length && none.examples.length);
  assert.strictEqual((await req('GET', '/api/studio/help?q=x')).status, 401);
  // FAQ อ้างหัวข้อที่มีอยู่จริงทุกข้อ
  const GC = require('../data/grammar-curriculum');
  const { FAQ } = require('../config/helpFaq');
  assert.ok(FAQ.every((f) => !f.topic || GC.TOPIC_BY_ID[f.topic]), 'FAQ ชี้หัวข้อที่มีจริง');
});
