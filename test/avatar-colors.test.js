/*
  เปลี่ยนสีเครื่องแต่งกาย (Material Color Variants)
  - แคตตาล็อก: Material Region (primary/secondary/accent) ไม่รวมโลหะ/ซิป/กระดุม/ผิวหนัง · ชิ้นที่ลายเป็นเอกลักษณ์/ของ Achievement เปลี่ยนสีไม่ได้
  - ตั้งสี: เฉพาะของที่เป็นเจ้าของ · ตรวจรหัสสี/Region/เนื้อผ้า · ฟรี (Coin ไม่เปลี่ยน) · Reload แล้วสียังอยู่ · Reset
  - Outfit Preset เก็บสี → ใส่ Preset แล้วได้สีเดิม · หน้าตาผู้เล่น (looks) ส่งสีของชิ้นที่สวม
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const AV = require('../services/avatar');
const CAT = require('../services/avatar/catalog');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser() {
  const name = `col${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await CAT.syncCatalog(pool);
  CAT.invalidate();
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('แคตตาล็อก: Material Region ต่อชิ้น · ไม่รวมโลหะ/ซิป/กระดุม · ชนิดเสื้อผ้า · ชิ้นพิเศษเปลี่ยนสีไม่ได้', async () => {
  const { byId } = await CAT.getCatalog();
  const tee = byId.top_tee_blue.color;
  assert.ok(tee.colorable && tee.regions.primary && /^#[0-9a-f]{6}$/.test(tee.regions.primary.default), 'เสื้อยืดเปลี่ยนสีได้');
  assert.strictEqual(tee.garment, 'tshirt');
  assert.deepStrictEqual(tee.variants, ['cotton', 'polyester']);
  assert.strictEqual(byId.top_polo_green.color.garment, 'polo');
  assert.strictEqual(byId.top_hoodie_gray.color.garment, 'hoodie');
  assert.strictEqual(byId.outer_bomber.color.garment, 'jacket');
  const denim = byId.outer_denim_jacket.color;
  const mats = Object.values(denim.regions).map((r) => r.material).join(' ');
  assert.ok(!/Metal|Button|Zip|Rivet|Stitch|Skin/i.test(mats), `ไม่ย้อมโลหะ/กระดุม/ด้าย (${mats})`);
  assert.strictEqual(byId.top_hoodie_galaxy.color.colorable, false, 'ลายกาแล็กซีเป็นเอกลักษณ์');
  const ach = Object.values(byId).find((x) => x.achievementId && ['top', 'outerwear', 'hat', 'glasses', 'headphones', 'back', 'accessory'].includes(x.slot));
  assert.ok(ach && !ach.color.colorable, `ของจาก Achievement เปลี่ยนสีไม่ได้ (${ach && ach.id})`);
  const cat = await req('GET', '/api/avatar/catalog', { token: (await makeUser()).token });
  const t = cat.body.items.find((x) => x.id === 'top_tee_blue');
  assert.ok(t.color && t.color.regions.primary, 'แคตตาล็อกสาธารณะส่งข้อมูลสี');
});

test('ตั้งสี: เป็นเจ้าของเท่านั้น · ตรวจค่า · ฟรี · reload แล้วสียังอยู่ · reset · Preset เก็บสี', async () => {
  const u = await makeUser();
  const me0 = await req('GET', '/api/avatar/me', { token: u.token });
  const bal0 = me0.body.wallet.balance;
  const ok = await req('PUT', '/api/avatar/colors/top_tee_blue', { token: u.token, body: { primary: '#D94848', variant: 'polyester' } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.deepStrictEqual(ok.body.color, { primary: '#d94848', secondary: null, accent: null, variant: 'polyester' });
  for (const [body, code] of [[{ primary: 'red' }, 'BAD_COLOR'], [{ primary: '#12345g' }, 'BAD_COLOR'], [{ variant: 'leather' }, 'BAD_VARIANT'], [{ primary: '<script>' }, 'BAD_COLOR']]) {
    const r = await req('PUT', '/api/avatar/colors/top_tee_blue', { token: u.token, body });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, code);
  }
  const notOwned = await req('PUT', '/api/avatar/colors/outer_bomber', { token: u.token, body: { primary: '#2d3a74' } });
  assert.strictEqual(notOwned.status, 403, 'ของที่ยังไม่มี เปลี่ยนสีไม่ได้');
  const galaxy = await req('PUT', '/api/avatar/colors/top_hoodie_galaxy', { token: u.token, body: { primary: '#2d3a74' } });
  assert.strictEqual(galaxy.status, 400);
  // reload
  const me1 = await req('GET', '/api/avatar/me', { token: u.token });
  assert.deepStrictEqual(me1.body.colors.top_tee_blue, { primary: '#d94848', secondary: null, accent: null, variant: 'polyester' });
  assert.strictEqual(me1.body.wallet.balance, bal0, 'เปลี่ยนสีฟรี');
  // สวมเสื้อยืด + บันทึก Preset (สีปัจจุบันติดไปด้วย)
  const outfit = { ...me1.body.outfit, top: 'top_tee_blue' };
  assert.strictEqual((await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit } })).status, 200);
  const pr = await req('PUT', '/api/avatar/presets/1', { token: u.token, body: { name: 'แดง', outfit } });
  assert.strictEqual(pr.status, 200);
  assert.strictEqual(pr.body.preset.colors.top_tee_blue.primary, '#d94848');
  // เปลี่ยนสีอื่น แล้วใส่ Preset → กลับเป็นสีใน Preset
  await req('PUT', '/api/avatar/colors/top_tee_blue', { token: u.token, body: { primary: '#3fb4c9' } });
  assert.strictEqual((await req('POST', '/api/avatar/presets/1/apply', { token: u.token })).status, 200);
  const me2 = await req('GET', '/api/avatar/me', { token: u.token });
  assert.strictEqual(me2.body.colors.top_tee_blue.primary, '#d94848', 'Preset คืนสีเดิม');
  // หน้าตาที่คนอื่นเห็น (เมื่อเลือกใช้ Avatar) มีสีของชิ้นที่สวม
  await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: true } });
  AV.invalidateLook(u.id);
  const looks = await AV.looks([u.id]);
  assert.strictEqual(looks[u.id].colors.top_tee_blue.primary, '#d94848');
  // reset → กลับเป็นสีเดิมของชิ้น (ลบแถว)
  const rs = await req('PUT', '/api/avatar/colors/top_tee_blue', { token: u.token, body: { primary: null, variant: null } });
  assert.strictEqual(rs.status, 200);
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM user_item_colors WHERE user_id = $1', [u.id]);
  assert.strictEqual(n.rows[0].n, 0);
  // ของเดิม/Coin/ชุดเดิมไม่หาย
  const me3 = await req('GET', '/api/avatar/me', { token: u.token });
  assert.strictEqual(me3.body.inventory.length, me1.body.inventory.length);
  assert.strictEqual(me3.body.outfit.top, 'top_tee_blue');
});
