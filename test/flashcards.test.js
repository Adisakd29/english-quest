/*
  v1.17.0 Flashcard ดาวน์โหลด — GET /api/flashcards/options · /deck
  - ต้องล็อกอิน · ตรวจพารามิเตอร์ · จำกัดจำนวนการ์ด · กรองตามระดับ/หัวข้อจริง
  - ไม่รวมคำที่คำแปลถูก flag รอตรวจ / แหล่งที่มารอตรวจ / คำเสริม (เหมือนหน้าค้นหาคำศัพท์)
  - สุ่มแบบ seed ได้ชุดเดิมซ้ำได้ · หน้าเว็บมีตัวสร้าง PDF/ZIP ในเครื่อง (ไม่มีไลบรารีภายนอก)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const C = require('../services/worldChat');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server; let base; let wsBase;
function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + path, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'gc') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = `ws://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

const FCR = require('../routes/flashcards');

test('flashcards: ต้องล็อกอิน', async () => {
  assert.strictEqual((await req('GET', '/api/flashcards/options')).status, 401);
  assert.strictEqual((await req('GET', '/api/flashcards/deck?level=A1')).status, 401);
});

test('flashcards/options: ระดับ A1–C2 + หัวข้อที่มีคำพอ (≥ 6) พร้อมชื่อไทย', async () => {
  const u = await makeUser('fo'); FCR._resetCache();
  const r = await req('GET', '/api/flashcards/options', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.levels.map((l) => l.id), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.ok(r.body.levels.every((l) => l.count > 0));
  for (const [lv, list] of Object.entries(r.body.topics)) {
    assert.ok(list.every((t) => t.count >= 6 && t.th && t.en), lv);
  }
  assert.ok(r.body.topics.A1.some((t) => t.id === 'food'));
  assert.deepStrictEqual(r.body.counts, [20, 40, 60]);
});

test('flashcards/deck: ตรวจพารามิเตอร์ · จำกัดสูงสุด 60 ใบ', async () => {
  const u = await makeUser('fd');
  assert.strictEqual((await req('GET', '/api/flashcards/deck?level=Z9', { token: u.token })).status, 400);
  assert.strictEqual((await req('GET', '/api/flashcards/deck?level=A1&topic=%3Cscript%3E', { token: u.token })).status, 400);
  const big = await req('GET', '/api/flashcards/deck?level=B2&count=500', { token: u.token });
  assert.strictEqual(big.status, 200); assert.strictEqual(big.body.cards.length, 60);
  const def = await req('GET', '/api/flashcards/deck?level=B1', { token: u.token });
  assert.strictEqual(def.body.cards.length, 40, 'ค่าเริ่มต้น 40 ใบ');
});

test('flashcards/deck: กรองระดับ/หัวข้อ · มีครบทุกช่องที่การ์ดใช้ · ไม่มีคำแปลรอตรวจ', async () => {
  const u = await makeUser('ff');
  const r = await req('GET', '/api/flashcards/deck?level=A1&topic=food&count=60', { token: u.token });
  assert.strictEqual(r.status, 200);
  const d = r.body;
  assert.strictEqual(d.topicTh, 'อาหาร');
  assert.ok(d.cards.length > 0 && d.cards.length <= d.total);
  assert.ok(d.cards.every((c) => c.level === 'A1' && c.topic === 'food' && c.word && c.thai && c.example));
  const ids = d.cards.map((c) => c.id);
  const bad = await pool.query(`SELECT public_id FROM vocab_senses WHERE public_id = ANY($1)
    AND (translation_note IS NOT NULL OR source_needs_review OR is_supplemental)`, [ids]);
  assert.strictEqual(bad.rowCount, 0, 'ไม่มีคำที่ถูก flag');
});

test('flashcards/deck: คำที่ถูก flag รอตรวจคำแปลไม่ถูกส่งออก', async () => {
  const u = await makeUser('fx');
  const pick = (await pool.query("SELECT public_id, translation_note FROM vocab_senses WHERE cefr = 'A2' AND translation_note IS NULL AND NOT is_supplemental AND public_id IS NOT NULL ORDER BY display_order LIMIT 1")).rows[0];
  await pool.query("UPDATE vocab_senses SET translation_note = 'test-flag' WHERE public_id = $1", [pick.public_id]);
  try {
    const d = (await req('GET', '/api/flashcards/deck?level=A2&count=60', { token: u.token })).body;
    assert.ok(!d.cards.some((c) => c.id === pick.public_id));
  } finally {
    await pool.query('UPDATE vocab_senses SET translation_note = NULL WHERE public_id = $1', [pick.public_id]);
  }
});

test('flashcards/deck: สุ่มด้วย seed เดิมได้ชุดเดิม · seed ต่างได้ลำดับต่าง · core เรียงคงที่', async () => {
  const u = await makeUser('fs');
  const get = async (q) => (await req('GET', `/api/flashcards/deck?level=B1&count=20&${q}`, { token: u.token })).body.cards.map((c) => c.id).join();
  assert.strictEqual(await get('order=shuffle&seed=42'), await get('order=shuffle&seed=42'));
  assert.notStrictEqual(await get('order=shuffle&seed=42'), await get('order=shuffle&seed=43'));
  assert.strictEqual(await get('order=core'), await get('order=core'));
});

test('flashcards: หน้าเว็บสร้างไฟล์ในเครื่อง ไม่โหลดไลบรารีภายนอก · ข้อความถูก escape', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/flashcards.js'), 'utf8');
  assert.ok(!/https?:\/\//.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/https:\/\/[^'"`\s]*w3\.org[^'"`\s]*/g, '')), 'ไม่มี URL ภายนอก');
  assert.ok(/esc\(c\.word\)/.test(js) && /esc\(c\.thai\)/.test(js), 'escape คำ/คำแปลใน alt');
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(html.includes('id="path-open-flashcards"') && html.includes('js/flashcards.js'));
});
