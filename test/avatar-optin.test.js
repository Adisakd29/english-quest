/*
  v1.8.0 — รูปโปรไฟล์ กับ Avatar เป็นคนละระบบ (Avatar = opt-in)
  - migration ไม่แตะรูปโปรไฟล์เดิม (users.avatar · users.avatar_image · รูปจาก Google ใน user_identities) และ avatarEnabled = false
  - opt-in / opt-out / สลับกลับรูปเดิม · บันทึก Avatar ไม่เปลี่ยนรูปโปรไฟล์ · ไม่มี side effect ข้าม API
  - แก้ Avatar/รูป/ตู้เสื้อผ้าของคนอื่นไม่ได้ (userId จาก token เท่านั้น)
  - avatarThumbnail: ตรวจไฟล์ · ต้องตรงกับชุดปัจจุบัน · ใช้ใน looks เมื่อเจ้าของเปิดใช้ Avatar เท่านั้น
  - 3D asset manifest + ไฟล์ GLB มีจริง ขนาดอยู่ในงบ
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
/** แถวรูปโปรไฟล์ทั้งหมดของผู้ใช้ (users + identities) — ใช้เทียบก่อน/หลัง */
async function photoState(id) {
  const u = (await pool.query('SELECT avatar, avatar_image FROM users WHERE id = $1', [id])).rows[0];
  const g = (await pool.query("SELECT avatar_url, display_name FROM user_identities WHERE user_id = $1 ORDER BY id", [id])).rows;
  return JSON.stringify({ u, g });
}
const enabled = async (id) => (await pool.query('SELECT avatar_enabled FROM user_avatar WHERE user_id = $1', [id])).rows[0].avatar_enabled;

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ผู้ใช้เดิมมีรูปโปรไฟล์ -> รัน migration -> รูปเดิมไม่เปลี่ยน · avatarEnabled = false · login แล้วยังเป็นรูปเดิม', async () => {
  const u = await makeUser();
  // รูปที่อัปโหลดเอง (API เดิม) + รูปจาก Google + อวตารสัตว์
  assert.strictEqual((await req('PATCH', '/api/auth/avatar-image', { token: u.token, body: { image: PHOTO } })).status, 200);
  await req('PATCH', '/api/auth/avatar', { token: u.token, body: { avatar: 'owl' } });
  await pool.query(`INSERT INTO user_identities (user_id, provider, provider_user_id, email, display_name, avatar_url)
    VALUES ($1, 'google', $2, $3, 'G User', 'https://lh3.googleusercontent.com/a/photo123')`, [u.id, `g-${u.id}`, `${u.name}@gmail.com`]);
  // จำลองสถานะของรุ่นก่อนหน้า (ตัวละครเปิดเป็นค่าเริ่มต้น)
  await AV.ensureUser(u.id);
  await pool.query("UPDATE user_avatar SET display_mode = 'character', avatar_enabled = TRUE, display_pref_at = NULL WHERE user_id = $1", [u.id]);
  const before = await photoState(u.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await require('../migrations/047_avatar_backfill').run(client);
    await require('../migrations/048_avatar_optin_3d').run(client);
    await require('../migrations/048_avatar_optin_3d').run(client);   // รันซ้ำได้
    await client.query('COMMIT');
  } finally { client.release(); }
  assert.strictEqual(await photoState(u.id), before, 'รูปโปรไฟล์ (users + Google) ไม่เปลี่ยนแม้แต่ byte เดียว');
  assert.strictEqual(await enabled(u.id), false, 'avatarEnabled = false');
  const me = await req('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(me.body.user.avatarImage, PHOTO);
  assert.strictEqual(me.body.user.avatar, 'owl');
  const l = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token });
  assert.strictEqual(l.body.looks[u.id].enabled, false, 'คนอื่นเห็นรูปเดิม');
});

test('บัญชีใหม่: Avatar ปิดการแสดงเป็นค่าเริ่มต้น', async () => {
  const u = await makeUser();
  const me = await req('GET', '/api/avatar/me', { token: u.token });
  assert.strictEqual(me.body.avatarEnabled, false);
  assert.strictEqual(me.body.displayPrefChosen, false);
  assert.ok(me.body.outfit.body, 'มี Avatar เริ่มต้นให้แต่ง (แต่ยังไม่แสดงแทนรูปโปรไฟล์)');
});

test('สร้าง/บันทึก Avatar -> รูปโปรไฟล์ยังอยู่ · เปิดใช้ Avatar -> สลับกลับรูปเดิมได้ทันที', async () => {
  const u = await makeUser();
  await req('PATCH', '/api/auth/avatar-image', { token: u.token, body: { image: PHOTO } });
  const p0 = await photoState(u.id);
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  // ส่งค่าแปลก ๆ ปนมา: ห้ามมี side effect กับรูปโปรไฟล์/การตั้งค่าการแสดงผล
  const s = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...me.outfit, hair: 'hair_bob' }, displayMode: 'character', useAvatar: true, avatar_image: null, avatarImage: null } });
  assert.strictEqual(s.status, 200);
  assert.strictEqual(await photoState(u.id), p0, 'บันทึก Avatar ไม่แตะรูปโปรไฟล์');
  assert.strictEqual(await enabled(u.id), false, 'บันทึก Avatar ไม่เปิดใช้ Avatar เอง');
  // opt-in
  assert.strictEqual((await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: true } })).status, 200);
  let l = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token });
  assert.strictEqual(l.body.looks[u.id].enabled, true);
  assert.strictEqual(l.body.looks[u.id].outfit.hair, 'hair_bob');
  assert.strictEqual(await photoState(u.id), p0, 'เปิดใช้ Avatar ไม่ลบ/เขียนทับรูปเดิม');
  // opt-out -> รูปเดิมกลับมา (ข้อมูลยังอยู่ครบ)
  assert.strictEqual((await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: false } })).status, 200);
  l = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token });
  assert.strictEqual(l.body.looks[u.id].enabled, false);
  const au = await req('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(au.body.user.avatarImage, PHOTO);
  // ค่าไม่ใช่ boolean -> ปฏิเสธ
  assert.strictEqual((await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: 'true' } })).status, 400);
  // เปลี่ยนรูปโปรไฟล์ (API เดิม) ไม่เปลี่ยน Avatar
  const outfit0 = (await req('GET', '/api/avatar/me', { token: u.token })).body.outfit;
  await req('DELETE', '/api/auth/avatar-image', { token: u.token });
  assert.deepStrictEqual((await req('GET', '/api/avatar/me', { token: u.token })).body.outfit, outfit0);
});

test('equipAvatarItem: สวม/ถอดทีละช่อง · หมวดขัดกันถอดให้ · ต้องเป็นเจ้าของ · คงอยู่หลังล็อกอินใหม่', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  await pool.query('UPDATE coin_wallets SET balance = 5000 WHERE user_id = $1', [u.id]);
  await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'phones_basic' } });
  await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'hat_cap_red' } });
  let r = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'headphones', itemId: 'phones_basic' } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.outfit.headphones, 'phones_basic');
  r = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: 'hat_cap_red' } });
  assert.strictEqual(r.body.outfit.hat, 'hat_cap_red'); assert.strictEqual(r.body.outfit.headphones, null);
  assert.deepStrictEqual(r.body.removed, ['phones_basic']);
  const no = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: 'hat_wizard' } });
  assert.strictEqual(no.status, 403);
  r = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: null } });
  assert.strictEqual(r.body.outfit.hat, null);
  await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'top', itemId: 'top_polo_green' } });
  // ล็อกอินใหม่ (token ใหม่) -> ชุดเดิมยังอยู่
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' } });
  const me = await req('GET', '/api/avatar/me', { token: login.body.token });
  assert.strictEqual(me.body.outfit.top, 'top_polo_green');
});

test('แก้ Avatar / ตู้เสื้อผ้า / การตั้งค่า / thumbnail ของผู้ใช้อื่นไม่ได้ (userId จาก token เท่านั้น)', async () => {
  const a = await makeUser('opa');
  const b = await makeUser('opb');
  await AV.ensureUser(a.id); await AV.ensureUser(b.id);
  const bBefore = (await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [b.id])).rows[0];
  const bPhoto = await photoState(b.id);
  const meA = (await req('GET', '/api/avatar/me', { token: a.token })).body;
  await req('PUT', '/api/avatar/outfit', { token: a.token, body: { userId: b.id, user_id: b.id, outfit: { ...meA.outfit, hair: 'hair_sidepart' } } });
  await req('PUT', '/api/avatar/display', { token: a.token, body: { userId: b.id, useAvatar: true } });
  await req('POST', '/api/avatar/equip', { token: a.token, body: { userId: b.id, slot: 'hair', itemId: 'hair_crop' } });
  await req('PUT', `/api/avatar/presets/1?userId=${b.id}`, { token: a.token, body: { userId: b.id, outfit: meA.outfit } });
  const bAfter = (await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [b.id])).rows[0];
  assert.deepStrictEqual({ ...bAfter, updated_at: null }, { ...bBefore, updated_at: null }, 'Avatar ของ B ไม่เปลี่ยน');
  assert.strictEqual(await photoState(b.id), bPhoto);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM outfit_presets WHERE user_id = $1', [b.id])).rows[0].n, 0);
  assert.strictEqual(await enabled(a.id), true, 'คำขอมีผลกับเจ้าของ token เท่านั้น');
  // ไม่ล็อกอิน = แก้อะไรไม่ได้
  for (const [m, p, body] of [['PUT', '/api/avatar/outfit', { outfit: meA.outfit }], ['PUT', '/api/avatar/display', { useAvatar: true }],
    ['POST', '/api/avatar/equip', { slot: 'hat', itemId: null }], ['POST', '/api/avatar/thumbnail', { image: WEBP }]]) {
    assert.strictEqual((await req(m, p, { body })).status, 401, `${m} ${p}`);
  }
});

test('avatarThumbnail: ตรวจไฟล์ · ต้องตรงกับชุด · ใช้ใน list เฉพาะเมื่อเจ้าของเปิดใช้ Avatar · ชุดเปลี่ยน -> กลับไปใช้ภาพ 2D', async () => {
  const u = await makeUser();
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const bad = await req('POST', '/api/avatar/thumbnail', { token: u.token, body: { image: `data:image/webp;base64,${Buffer.from('<svg/>').toString('base64')}`, outfitHash: me.outfitHash } });
  assert.strictEqual(bad.status, 400);
  const stale = await req('POST', '/api/avatar/thumbnail', { token: u.token, body: { image: WEBP, outfitHash: 'nope' } });
  assert.strictEqual(stale.status, 409);
  const ok = await req('POST', '/api/avatar/thumbnail', { token: u.token, body: { image: WEBP, outfitHash: me.outfitHash } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.strictEqual((await req('GET', ok.body.url)).status, 404, 'ยังไม่เปิดใช้ Avatar -> เดา URL ภาพย่อไม่ได้');
  let l = (await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token })).body.looks[u.id];
  assert.strictEqual(l.enabled, false, 'มี thumbnail แล้วก็ยังไม่แสดงแทนรูปโปรไฟล์จนกว่าจะเปิดเอง');
  await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: true } });
  const img = await req('GET', ok.body.url);
  assert.strictEqual(img.status, 200); assert.strictEqual(img.headers['content-type'], 'image/webp');
  l = (await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token })).body.looks[u.id];
  assert.ok(l.thumb && l.thumb.startsWith(`/api/avatar/thumb/${u.id}?v=`));
  await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'accessory', itemId: 'acc_watch' } });
  l = (await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token })).body.looks[u.id];
  assert.strictEqual(l.thumb, null, 'thumbnail ไม่ตรงชุดแล้ว -> ใช้ภาพ 2D');
  const big = await req('POST', '/api/avatar/thumbnail', { token: u.token, body: { image: `data:image/webp;base64,${Buffer.alloc(90 * 1024, 1).toString('base64')}`, outfitHash: 'x' } });
  assert.ok([400, 413].includes(big.status));
});

test('3D asset manifest: base + pilot items มีไฟล์จริง · meshopt · งบ polygon · item ตรงกับแคตตาล็อก/ราคาเดิม', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'avatar', 'models.json'), 'utf8'));
  const pub = path.join(__dirname, '..', 'public');
  assert.ok(m.base && fs.existsSync(path.join(pub, m.base.glbUrl)));
  assert.ok(m.base.triangles >= 5000 && m.base.triangles <= 25000, `base ${m.base.triangles}`);
  assert.ok(m.base.animations.includes('ANIM_Idle'));
  const by = (s) => m.models.filter((x) => x.slot === s).length;
  assert.ok(by('hair') >= 5 && by('top') >= 5 && by('bottom') >= 3 && by('shoes') >= 3 && by('glasses') >= 2 && by('headphones') >= 2 && by('back') >= 1, 'Phase 1 pilot ครบ');
  // ทุกชิ้นในแคตตาล็อกรองรับ 3D: GLB จริง (ใส่บนตัว) · สีผิว = ย้อม material · พื้นหลัง = ฉากหลัง viewer
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'avatar', 'catalog.json'), 'utf8')).items;
  assert.deepStrictEqual(cat.map((c) => c.id).filter((id) => !m.models.some((x) => x.itemId === id)), [], 'ทุกชิ้นมีข้อมูล 3D');
  for (const x of m.models.filter((y) => y.kind)) assert.ok(['skin', 'backdrop'].includes(x.kind) && ['body', 'background'].includes(x.slot));
  for (const x of m.models.filter((y) => !y.kind)) {
    const f = path.join(pub, x.glbUrl);
    assert.ok(fs.existsSync(f), x.glbUrl);
    assert.strictEqual(fs.statSync(f).size, x.fileSize);
    const head = fs.readFileSync(f).subarray(0, 4).toString('latin1');
    assert.strictEqual(head, 'glTF');
    assert.ok(fs.readFileSync(f).includes('EXT_meshopt_compression'), `${x.asset} meshopt`);
    assert.ok(x.triangles <= 12000, `${x.asset} ${x.triangles} tris`);   // v2: รายละเอียดผ้า (ตะเข็บ/ปก/ซิป/edge loop ข้อพับ) — งบต่อชิ้น 12k
    assert.ok(fs.readFileSync(f).includes('COLOR_0'), `${x.asset} มี AO (vertex color)`);
    assert.ok(fs.existsSync(path.join(pub, x.thumbnailUrl.split('?')[0])), x.thumbnailUrl);
    assert.strictEqual(x.compatibleBaseVersion, m.base.version);
  }
  // งบทั้งชุด: ชิ้นที่หนักที่สุดของทุกช่องรวมกัน + base (กรณีแย่สุด) ≤ 90k tris
  const worst = {};
  for (const x of m.models.filter((y) => !y.kind)) worst[x.slot] = Math.max(worst[x.slot] || 0, x.triangles);
  // หมวกกับหูฟังใส่พร้อมกันไม่ได้ (กติกา validateOutfit) → นับช่องที่หนักกว่าช่องเดียว
  const hh = Math.max(worst.hat || 0, worst.headphones || 0); delete worst.hat; delete worst.headphones;
  const total = Object.values(worst).reduce((a, b) => a + b, 0) + hh + m.base.triangles;
  assert.ok(total <= 90000, `ชุดแย่สุด ${total} tris`);
  const u = await makeUser();
  const c = await req('GET', '/api/avatar/catalog', { token: u.token });
  const withModel = c.body.items.filter((i) => i.model);
  assert.strictEqual(withModel.length, m.models.length);
  for (const i of withModel.filter((x) => x.model.glbUrl)) {
    const mm = m.models.find((x) => x.itemId === i.id);
    assert.strictEqual(i.price, (await pool.query('SELECT price FROM avatar_items WHERE id = $1', [i.id])).rows[0].price, 'ราคาจาก DB เดิม');
    assert.strictEqual(i.model.glbUrl, mm.glbUrl);
  }
  const md = await req('GET', '/api/avatar/models', { token: u.token });
  assert.strictEqual(md.body.base.glbUrl, m.base.glbUrl);
  assert.ok(!('models' in md.body), 'ไม่ส่งรายการทั้งร้านมากับ base (lazy)');
});

test('Regression: A ใช้รูปแมว · B ใช้รูปตัวเอง -> แต่ง/ซื้อ/บันทึก/เปิด-ปิด Avatar/ดูโปรไฟล์กันและกัน -> รูปของทั้งคู่ไม่เปลี่ยน', async () => {
  const A = await makeUser('ca'); const B = await makeUser('cb');
  await req('PATCH', '/api/auth/avatar', { token: A.token, body: { avatar: 'cat' } });
  await req('PATCH', '/api/auth/avatar-image', { token: B.token, body: { image: PHOTO } });
  const a0 = await photoState(A.id); const b0 = await photoState(B.id);
  // A แต่ง Avatar + เปิดใช้ + ซื้อของ · B แค่แต่ง (ไม่เปิดใช้)
  const meA = (await req('GET', '/api/avatar/me', { token: A.token })).body;
  await req('PUT', '/api/avatar/outfit', { token: A.token, body: { outfit: { ...meA.outfit, hair: 'hair_bob' } } });
  await req('PUT', '/api/avatar/display', { token: A.token, body: { useAvatar: true } });
  const buy = await req('POST', '/api/avatar/purchase', { token: A.token, body: { itemId: 'hat_cap_red' } });
  assert.strictEqual(buy.status, 200, JSON.stringify(buy.body));
  const meB = (await req('GET', '/api/avatar/me', { token: B.token })).body;
  await req('PUT', '/api/avatar/outfit', { token: B.token, body: { outfit: { ...meB.outfit, top: 'top_tee_blue' } } });
  // ต่างคนต่างเปิดโปรไฟล์กัน (ให้ public) และ looks
  await req('PUT', '/api/privacy', { token: A.token, body: { profile: 'public' } });
  await req('PUT', '/api/privacy', { token: B.token, body: { profile: 'public' } });
  const pa = await req('GET', `/api/profile/${A.id}`, { token: B.token });
  const pb = await req('GET', `/api/profile/${B.id}`, { token: A.token });
  assert.strictEqual(pa.body.picture.avatar, 'cat'); assert.strictEqual(pa.body.picture.useAvatar, true, 'A เลือกใช้ Avatar เอง');
  assert.strictEqual(pb.body.picture.avatarImage, PHOTO); assert.strictEqual(pb.body.picture.useAvatar, false, 'B ยังเห็นเป็นรูปตัวเอง');
  const l = await req('GET', `/api/avatar/looks?ids=${A.id},${B.id}`, { token: A.token });
  assert.strictEqual(l.body.looks[B.id].enabled, false); assert.strictEqual(l.body.looks[B.id].outfit, null, 'ไม่ส่งชุดของ B ที่ยังไม่เปิดใช้');
  // A ปิด Avatar -> กลับเป็นรูปแมว
  await req('PUT', '/api/avatar/display', { token: A.token, body: { useAvatar: false } });
  assert.strictEqual((await req('GET', `/api/profile/${A.id}`, { token: B.token })).body.picture.useAvatar, false);
  assert.strictEqual(await photoState(A.id), a0, 'รูปแมวของ A ไม่เปลี่ยน');
  assert.strictEqual(await photoState(B.id), b0, 'รูปของ B ไม่เปลี่ยน');
  assert.strictEqual((await req('GET', '/api/auth/me', { token: A.token })).body.user.avatar, 'cat');
  assert.strictEqual((await req('GET', '/api/auth/me', { token: B.token })).body.user.avatarImage, PHOTO);
});

test('Preset 1–3: บันทึกพร้อมภาพตัวอย่าง (ตรวจชนิดไฟล์) · คงอยู่ข้าม login · ไฟล์ปลอม/ใหญ่เกิน = ไม่เก็บ', async () => {
  const u = await makeUser('ps');
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const ok = await req('PUT', '/api/avatar/presets/1', { token: u.token, body: { name: 'ชุดเรียน', outfit: me.outfit, thumb: PHOTO } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.preset.thumb, PHOTO);
  const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
  const r2 = await req('PUT', '/api/avatar/presets/2', { token: u.token, body: { name: 'ชุดสอง', outfit: me.outfit, thumb: fake } });
  assert.strictEqual(r2.status, 200); assert.strictEqual(r2.body.preset.thumb, null, 'ไฟล์ไม่ใช่ PNG จริง -> ไม่เก็บ');
  const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(90 * 1024)]).toString('base64');
  assert.strictEqual((await req('PUT', '/api/avatar/presets/3', { token: u.token, body: { name: 'ชุดสาม', outfit: me.outfit, thumb: big } })).body.preset.thumb, null);
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' } });
  const list = (await req('GET', '/api/avatar/presets', { token: login.body.token })).body.presets;
  assert.deepStrictEqual(list.map((p) => [p.slot, p.name, Boolean(p.thumb)]), [[1, 'ชุดเรียน', true], [2, 'ชุดสอง', false], [3, 'ชุดสาม', false]]);
  assert.strictEqual((await req('PUT', '/api/avatar/presets/4', { token: u.token, body: { name: 'x', outfit: me.outfit } })).status, 400);
});

test('v2 กติกาความเข้ากันได้ (data-driven) + ระนาบตัดผมใต้หมวก + คอลเลกชันในร้าน', async () => {
  // 1) conflictsWith: กติกาเดิม (หมวก↔หูฟัง) + กติกาจากการตรวจเรขาคณิต (model.compat) — สองทาง พร้อมเหตุผล
  const byId = {
    hat_x: { id: 'hat_x', slot: 'hat', name: 'X', model: { compat: [{ with: 'hair_y', reason: 'ผมทะลุหมวก' }] } },
    hair_y: { id: 'hair_y', slot: 'hair', name: 'Y', model: { compat: [{ with: 'hat_x', reason: 'ผมทะลุหมวก' }] } },
    phones_z: { id: 'phones_z', slot: 'headphones', name: 'Z', model: null },
  };
  assert.deepStrictEqual(AV.conflictsWith({ hair: 'hair_y' }, byId.hat_x, byId), [{ slot: 'hair', id: 'hair_y', reason: 'ผมทะลุหมวก' }]);
  assert.deepStrictEqual(AV.conflictsWith({ hat: 'hat_x' }, byId.phones_z, byId).map((c) => c.slot), ['hat']);
  assert.deepStrictEqual(AV.conflictsWith({ hair: 'hair_crop' }, byId.hat_x, byId), []);
  // 2) หมวกที่ครอบศีรษะทุกใบมีระนาบขอบหมวก (runtime ตัดผม/ก้านหูฟังส่วนในหมวก) · ที่คาดผม/มงกุฎไม่มี
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'avatar', 'models.json'), 'utf8')).models;
  const hats = m.filter((x) => x.slot === 'hat');
  for (const h of hats) {
    if (['hat_sport_headband', 'hat_crown_vocab', 'hat_lk26_frangipani'].includes(h.itemId)) assert.ok(!h.clip, h.itemId);   // ที่คาดผม / มงกุฎ / ดอกไม้ทัดหู ไม่ครอบศีรษะ
    else { assert.ok(Array.isArray(h.clip) && h.clip.length === 3 && h.clip[0] > 0.72 && h.clip[0] < 0.95, `${h.itemId} clip` /* style v3: หัวใหญ่ขึ้น ขอบหมวก z ≈ 0.76–0.87 */); }
  }
  // 3) ทุกชิ้นที่เปิดขายผ่าน validation (ไม่มีชิ้น active ที่ไม่ผ่าน)
  for (const x of m.filter((y) => !y.kind)) assert.ok(x.active === false || (x.validation && x.validation.pass), `${x.asset} active แต่ไม่ผ่าน`);
  // 4) API: catalog ส่ง clip + collection · ร้านกรองตามคอลเลกชันได้ (ทุกธีมมีเสื้อ/กางเกง/รองเท้า/เครื่องประดับ)
  const u = await makeUser('cv');
  const c = (await req('GET', '/api/avatar/catalog', { token: u.token })).body.items;
  assert.ok(c.find((i) => i.id === 'hat_cap_red').model.clip);
  assert.ok(c.filter((i) => i.collection).length >= 100);
  const s = (await req('GET', '/api/avatar/shop?collection=winter&size=48', { token: u.token })).body;
  assert.strictEqual(s.collection, 'winter');
  assert.ok(s.collections.length >= 12);
  assert.ok(s.items.length > 0 && s.items.every((i) => i.collection === 'winter'));
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'avatar', 'catalog.json'), 'utf8'));
  for (const col of cat.collections) {
    const slots = new Set(cat.items.filter((i) => i.collection === col.id).map((i) => i.slot));
    for (const need of ['top', 'bottom', 'shoes']) assert.ok(slots.has(need), `${col.id} ขาด ${need}`);
    assert.ok(['accessory', 'hat', 'glasses', 'back', 'headphones'].some((x) => slots.has(x)), `${col.id} ขาดเครื่องประดับ`);
  }
  const bad = (await req('GET', '/api/avatar/shop?collection=nope', { token: u.token })).body;
  assert.strictEqual(bad.collection, null);
});

test('v2 Migration safety: ID ของเดิมยังอยู่ (ตัวอย่างทุกหมวด) · ราคาเดิมไม่เปลี่ยน · ของในตู้/coin ไม่ถูกแตะตอน sync', async () => {
  const OLD = ['hair_crop', 'hair_sidepart', 'hair_bob', 'hair_ponytail', 'hair_long', 'top_tee_blue', 'top_polo_green', 'top_hoodie_gray', 'top_tee_stripe',
    'bottom_jeans', 'bottom_skirt_pleated', 'bottom_shorts_khaki', 'shoes_sneaker_white', 'shoes_canvas_black', 'shoes_boots_brown',
    'hat_cap_red', 'hat_beanie_teal', 'hat_bucket_tan', 'hat_grad_cap', 'hat_wizard', 'hat_pumpkin', 'hat_crown_vocab', 'outer_denim_jacket', 'outer_lab_coat', 'outer_rank_jacket'];
  const ids = new Set((await pool.query('SELECT id FROM avatar_items')).rows.map((r) => r.id));
  for (const id of OLD) assert.ok(ids.has(id), `${id} หาย`);
  const u = await makeUser('mg');
  await pool.query("INSERT INTO user_inventory (user_id, item_id, acquisition_type, price_paid) VALUES ($1, 'hat_wizard', 'purchase', 0) ON CONFLICT DO NOTHING", [u.id]);
  const inv0 = (await pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1 ORDER BY item_id', [u.id])).rows;
  const CAT = require('../services/avatar/catalog');
  await CAT.syncCatalog(pool);   // sync ซ้ำ (เหมือนตอน deploy) — ต้องไม่แตะตู้เสื้อผ้า
  const inv1 = (await pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1 ORDER BY item_id', [u.id])).rows;
  assert.deepStrictEqual(inv1, inv0);
});
