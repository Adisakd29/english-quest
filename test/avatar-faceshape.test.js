/*
  v1.13.0 — ปรับรูปทรงใบหน้า (ช่อง faceshape: กลม/รูปไข่/หัวใจ/เหลี่ยม/ยาว)
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
const AV = require('../services/avatar');

const PHOTO = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='}`;
const WEBP = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA';
let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); let b = null; try { b = buf.length ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'op') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

const SHAPES = ['faceshape_round', 'faceshape_oval', 'faceshape_heart', 'faceshape_square', 'faceshape_long'];

test('migration 069: มีคอลัมน์ faceshape_item_id · ช่อง faceshape อยู่ใน SLOTS (ไม่ใช่ช่องบังคับ)', async () => {
  const c = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'user_avatar' AND column_name = 'faceshape_item_id'");
  assert.strictEqual(c.rowCount, 1);
  const CAT = require('../services/avatar/catalog');
  assert.ok(CAT.SLOTS.includes('faceshape'));
  assert.ok(!CAT.REQUIRED_SLOTS.includes('faceshape'), 'ผู้ใช้เดิมที่ไม่มีค่า = หน้ากลม (ไม่บังคับ)');
});

test('แคตตาล็อก: รูปหน้า 5 ทรง ฟรี เป็นของเริ่มต้น · มีภาพ 2D ทุกสีผิว', async () => {
  const CAT = require('../services/avatar/catalog');
  const cat = await CAT.getCatalog(); const all = cat.list;
  const items = all.filter((x) => x.slot === 'faceshape');
  assert.deepStrictEqual(items.map((x) => x.id).sort(), [...SHAPES].sort());
  for (const it of items) {
    assert.strictEqual(it.price || 0, 0, it.id);
    assert.ok(it.starter, `${it.id} ต้องเป็นของเริ่มต้น`);
  }
  const dir = path.join(__dirname, '..', 'public', 'assets', 'avatar');
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  for (const sh of SHAPES.filter((s) => s !== 'faceshape_round')) {
    assert.ok(files.some((f) => f.includes(`--${sh.replace('faceshape_', '')}.svg`)), `ภาพ body สำหรับ ${sh}`);
  }
});

test('สวม/บันทึกรูปหน้าผ่าน API: ผู้ใช้ใหม่มีครบ 5 ทรง · บันทึกแล้วอ่านกลับได้ · ค่าแปลกถูกปฏิเสธ · ไม่กระทบช่องอื่น', async () => {
  const u = await makeUser('fs');
  const me0 = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const inv = (await pool.query("SELECT item_id FROM user_inventory WHERE user_id = $1 AND item_id LIKE 'faceshape_%'", [u.id])).rows.map((r) => r.item_id).sort();
  assert.deepStrictEqual(inv, [...SHAPES].sort());
  const eq = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'faceshape', itemId: 'faceshape_heart' } });
  assert.strictEqual(eq.status, 200, JSON.stringify(eq.body));
  const me1 = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  assert.strictEqual(me1.outfit.faceshape, 'faceshape_heart');
  for (const s of Object.keys(me0.outfit)) if (s !== 'faceshape') assert.strictEqual(me1.outfit[s], me0.outfit[s], `ช่อง ${s} ต้องไม่เปลี่ยน`);
  const put = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...me1.outfit, faceshape: 'faceshape_square' } } });
  assert.strictEqual(put.status, 200, JSON.stringify(put.body));
  assert.strictEqual((await req('GET', '/api/avatar/me', { token: u.token })).body.outfit.faceshape, 'faceshape_square');
  // ใส่ของช่องอื่นในช่องรูปหน้า / ไอดีที่ไม่มี → ปฏิเสธ
  const bad = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'faceshape', itemId: me1.outfit.hair } });
  assert.ok(bad.status >= 400);
  const bad2 = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...me1.outfit, faceshape: 'faceshape_xx' } } });
  assert.ok(bad2.status >= 400);
  assert.strictEqual((await req('GET', '/api/avatar/me', { token: u.token })).body.outfit.faceshape, 'faceshape_square');
});

test('ผู้ใช้เดิม (ไม่มีค่า faceshape) ยังบันทึกชุดได้ตามเดิม', async () => {
  const u = await makeUser('fo');
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const { faceshape, ...rest } = me.outfit;
  const put = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: rest } });
  assert.strictEqual(put.status, 200, JSON.stringify(put.body));
});
