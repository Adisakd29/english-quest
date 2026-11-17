/*
  v1.8.0 — Public Profile + Privacy (ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทีละ field) + Block + regression รูปโปรไฟล์ของผู้ใช้อื่น
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b, raw: buf }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'pv') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name, email: `${name}@gmail.com` };
}
async function befriend(a, b) {
  await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  const f = (await pool.query('SELECT id FROM friendships WHERE requester_id = $1 AND addressee_id = $2', [a.id, b.id])).rows[0];
  await req('POST', `/api/friends/${f.id}/accept`, { token: b.token });
}
const setPv = (u, patch) => req('PUT', '/api/privacy', { token: u.token, body: patch });

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ค่าเริ่มต้น Privacy-by-Default: คนที่ไม่ใช่เพื่อนเห็นแค่ชื่อ + รูป · ไม่มี email/coin/ข้อมูลการเรียน', async () => {
  const a = await makeUser(); const b = await makeUser();
  const d = (await req('GET', '/api/privacy', { token: a.token })).body;
  assert.strictEqual(d.settings.profile, 'friends');
  for (const k of ['stats', 'vocab', 'grammar', 'toeic', 'coins', 'inventory', 'friends']) assert.strictEqual(d.settings[k], 'private', k);
  const v = await req('GET', `/api/profile/${a.id}`, { token: b.token });
  assert.strictEqual(v.status, 200);
  assert.strictEqual(v.body.private, true);
  assert.strictEqual(d.settings.avatar, 'public', 'Avatar ค่าเริ่มต้น = ทุกคน');
  assert.deepStrictEqual(Object.keys(v.body.fields), ['avatar'], 'คนที่ไม่ใช่เพื่อนเห็น Avatar Showcase (จากกระดานอันดับ) แต่ข้อมูลอื่นซ่อน');
  assert.ok(v.body.fields.avatar.outfit.body && !('inventory' in v.body.fields.avatar));
  assert.strictEqual(v.body.username, a.name);
  assert.ok(!v.raw.includes(a.email) && !v.raw.includes('"balance"') && !v.raw.includes('"exp"'));
  assert.strictEqual((await req('GET', `/api/profile/${a.id}`)).status, 401);
  assert.strictEqual((await req('GET', '/api/profile/abc', { token: b.token })).status, 404);
  assert.strictEqual((await req('GET', '/api/profile/99999999', { token: b.token })).status, 404);
});

test('ตรวจทีละ field: Public/Friends/Private ตามตัวอย่างในสเปก (ผู้ชมไม่ใช่เพื่อน vs เพื่อน)', async () => {
  const a = await makeUser(); const b = await makeUser(); const c = await makeUser();
  assert.strictEqual((await setPv(a, { profile: 'public', avatar: 'public', rank: 'public', stats: 'friends', coins: 'private', inventory: 'private', level: 'public' })).status, 200);
  const other = (await req('GET', `/api/profile/${a.id}`, { token: b.token })).body;
  assert.strictEqual(other.private, false);
  assert.ok(other.fields.avatar && other.fields.avatar.outfit.body, 'เห็น Avatar');
  assert.ok('rank' in other.fields, 'เห็น Rank');
  assert.ok(other.fields.level, 'เห็น Level');
  for (const k of ['stats', 'coins', 'inventory', 'vocab', 'grammar', 'toeic', 'friends']) {
    assert.ok(!(k in other.fields), `ไม่เห็น ${k}`);
    assert.ok(other.hidden.includes(k));
  }
  await befriend(a, c);
  const friend = (await req('GET', `/api/profile/${a.id}`, { token: c.token })).body;
  assert.strictEqual(friend.relation, 'friend');
  assert.ok(friend.fields.stats, 'เพื่อนเห็น Learning Stats');
  assert.ok(!('coins' in friend.fields) && !('inventory' in friend.fields), 'เพื่อนก็ไม่เห็น Coin / Inventory (Private)');
  // เจ้าของเห็นทุกอย่าง + การตั้งค่า
  const me = (await req('GET', '/api/profile/me', { token: a.token })).body;
  for (const k of ['avatar', 'level', 'rank', 'achievements', 'stats', 'vocab', 'grammar', 'toeic', 'coins', 'inventory', 'friends']) assert.ok(k in me.fields, k);
  assert.strictEqual(me.fields.coins.balance, 150);
  assert.ok(me.settings);
  assert.ok(!('settings' in other), 'ผู้อื่นไม่เห็นการตั้งค่า');
});

test('Private Profile: แม้เป็นเพื่อนก็เห็นแค่ข้อความส่วนตัว', async () => {
  const a = await makeUser(); const b = await makeUser();
  await befriend(a, b);
  await setPv(a, { profile: 'private', avatar: 'private' });
  const v = (await req('GET', `/api/profile/${a.id}`, { token: b.token })).body;
  assert.strictEqual(v.private, true); assert.deepStrictEqual(v.fields, {}, 'เจ้าของซ่อน Avatar ด้วย → ไม่เห็นอะไรเลย');
  await setPv(a, { avatar: 'public' });
  const v2 = (await req('GET', `/api/profile/${a.id}`, { token: b.token })).body;
  assert.deepStrictEqual(Object.keys(v2.fields), ['avatar'], 'โปรไฟล์ส่วนตัว แต่ Avatar เปิด → เห็นเฉพาะ Avatar');
  assert.ok(v.actions.removeFriend, 'ยังจัดการความเป็นเพื่อนได้');
});

test('Update Privacy: ตรวจค่า · แก้ของคนอื่นไม่ได้ (userId จาก token)', async () => {
  const a = await makeUser(); const b = await makeUser();
  assert.strictEqual((await setPv(a, { profile: 'everyone' })).status, 400);
  assert.strictEqual((await setPv(a, { coins: true })).status, 400);
  assert.strictEqual((await setPv(a, { discoverable: 'no' })).status, 400);
  assert.strictEqual((await setPv(a, { userId: b.id, profile: 'public' })).status, 400, 'field ที่ไม่รู้จัก (userId) ถูกปฏิเสธ');
  assert.strictEqual((await req('PUT', '/api/privacy', { body: { profile: 'public' } })).status, 401);
  const bs = (await req('GET', '/api/privacy', { token: b.token })).body.settings;
  assert.strictEqual(bs.profile, 'friends', 'ของ B ไม่เปลี่ยน');
});

test('Block / Unblock: ถูกบล็อก -> ดูโปรไฟล์/ส่งคำขอ/ค้นหาไม่ได้ · ปลดบล็อกแล้วกลับมาตามสิทธิ์', async () => {
  const a = await makeUser('blka'); const b = await makeUser('blkb');
  await setPv(a, { profile: 'public' });
  await befriend(a, b);
  assert.strictEqual((await req('POST', `/api/friends/block/${b.id}`, { token: a.token })).status, 200);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)', [a.id, b.id])).rows[0].n, 0, 'เลิกเป็นเพื่อนอัตโนมัติ');
  const v = await req('GET', `/api/profile/${a.id}`, { token: b.token });
  assert.strictEqual(v.status, 404, 'ผู้ถูกบล็อกเห็นเหมือนไม่มีผู้ใช้นี้');
  const r = await req('POST', '/api/friends/request', { token: b.token, body: { userId: a.id } });
  assert.strictEqual(r.status, 403);
  const s = await req('GET', `/api/friends/search?q=${encodeURIComponent(a.name)}`, { token: b.token });
  assert.ok(!s.body.results.some((x) => x.id === a.id));
  const mine = (await req('GET', `/api/profile/${b.id}`, { token: a.token })).body;
  assert.strictEqual(mine.blocked, true); assert.ok(mine.actions.unblock);
  await req('DELETE', `/api/friends/block/${b.id}`, { token: a.token });
  const after = await req('GET', `/api/profile/${a.id}`, { token: b.token });
  assert.strictEqual(after.status, 200); assert.strictEqual(after.body.private, false);
});

test('ไม่รับคำขอเป็นเพื่อน / ไม่ให้ค้นหาเจอ (ตรวจที่เซิร์ฟเวอร์)', async () => {
  const a = await makeUser('dsca'); const c = await makeUser('dscc');
  await setPv(a, { allowFriendRequests: false, discoverable: false });
  const s = await req('GET', `/api/friends/search?q=${encodeURIComponent(a.name)}`, { token: c.token });
  assert.ok(!s.body.results.some((x) => x.id === a.id), 'ค้นหาไม่เจอ');
  assert.strictEqual((await req('POST', '/api/friends/request', { token: c.token, body: { username: a.name } })).status, 404);
  const r = await req('POST', '/api/friends/request', { token: c.token, body: { userId: a.id } });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, 'REQUESTS_CLOSED');
  const v = (await req('GET', `/api/profile/${a.id}`, { token: c.token })).body;
  assert.strictEqual(v.actions.addFriend, false); assert.strictEqual(v.actions.friendRequestsClosed, true);
  await setPv(a, { allowFriendRequests: true, discoverable: true });
  assert.strictEqual((await req('POST', '/api/friends/request', { token: c.token, body: { username: a.name } })).status, 200);
});

test('Regression: User A (รูปแมว) แต่ง/เปิดใช้ Avatar -> รูปของ User B ไม่เปลี่ยน · A ปิดกลับได้รูปแมว', async () => {
  const a = await makeUser('cata'); const b = await makeUser('phob');
  await req('PATCH', '/api/auth/avatar', { token: a.token, body: { avatar: 'cat' } });
  await req('PATCH', '/api/auth/avatar-image', { token: b.token, body: { image: PHOTO } });
  const snap = async () => JSON.stringify((await pool.query('SELECT id, avatar, avatar_image FROM users WHERE id = ANY($1::int[]) ORDER BY id', [[a.id, b.id]])).rows);
  const before = await snap();
  const me = (await req('GET', '/api/avatar/me', { token: a.token })).body;
  await req('PUT', '/api/avatar/outfit', { token: a.token, body: { outfit: { ...me.outfit, hair: 'hair_bob' } } });
  await req('PUT', '/api/avatar/display', { token: a.token, body: { useAvatar: true } });
  assert.strictEqual(await snap(), before, 'รูปโปรไฟล์ทั้ง A และ B ใน DB ไม่เปลี่ยน');
  const l = (await req('GET', `/api/avatar/looks?ids=${a.id},${b.id}`, { token: b.token })).body.looks;
  assert.strictEqual(l[a.id].enabled, true, 'A เลือกเอง');
  assert.strictEqual(l[b.id].enabled, false, 'B ยังเป็นรูปเดิม');
  const pb = (await req('GET', `/api/profile/${b.id}`, { token: a.token })).body;
  assert.strictEqual(pb.picture.avatarImage, PHOTO); assert.strictEqual(pb.picture.useAvatar, false);
  await req('PUT', '/api/avatar/display', { token: a.token, body: { useAvatar: false } });
  const pa = (await req('GET', `/api/profile/${a.id}`, { token: b.token })).body;
  assert.strictEqual(pa.picture.avatar, 'cat'); assert.strictEqual(pa.picture.useAvatar, false);
});

test('Endpoint เก่าที่เปิดข้อมูลโดยไม่ตรวจสิทธิ์ถูกปิดแล้ว', async () => {
  const a = await makeUser(); const b = await makeUser();
  assert.strictEqual((await req('GET', `/api/avatar/player/${a.id}`, { token: b.token })).status, 404);
  assert.strictEqual((await req('GET', `/api/achievements/user/${a.id}`, { token: b.token })).status, 404);
});

test('IDOR: ส่ง userId ของคนอื่นใน body/query/URL -> ทุก API ทำกับบัญชีของ token เท่านั้น · ข้อมูลของเจ้าของไม่เปลี่ยน', async () => {
  const a = await makeUser('ia'); const b = await makeUser('ib');
  await req('PATCH', '/api/auth/avatar-image', { token: a.token, body: { image: PHOTO } });
  const snap = async (u) => JSON.stringify({
    users: (await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0],
    av: (await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [u.id])).rows[0] || null,
    inv: (await pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1 ORDER BY item_id', [u.id])).rows,
    wallet: (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0] || null,
    presets: (await pool.query('SELECT slot, name FROM outfit_presets WHERE user_id = $1', [u.id])).rows,
    pv: (await pool.query('SELECT * FROM user_privacy_settings WHERE user_id = $1', [u.id])).rows[0] || null,
  });
  await req('GET', '/api/avatar/me', { token: a.token });
  const a0 = await snap(a);
  const meB = (await req('GET', '/api/avatar/me', { token: b.token })).body;
  const inject = { userId: a.id, user_id: a.id, ownerId: a.id, id: a.id };
  await req('PUT', `/api/avatar/outfit?userId=${a.id}`, { token: b.token, body: { ...inject, outfit: { ...meB.outfit, hair: 'hair_bob' } } });
  await req('POST', `/api/avatar/equip?userId=${a.id}`, { token: b.token, body: { ...inject, itemId: 'hair_crop' } });
  await req('PUT', '/api/avatar/display', { token: b.token, body: { ...inject, useAvatar: true } });
  await req('PUT', `/api/avatar/presets/1?userId=${a.id}`, { token: b.token, body: { ...inject, name: 'x', outfit: meB.outfit } });
  await req('POST', '/api/avatar/purchase', { token: b.token, body: { ...inject, itemId: 'hat_cap_red' } });
  await req('PUT', `/api/privacy?userId=${a.id}`, { token: b.token, body: { coins: 'public' } });
  assert.strictEqual(await snap(a), a0, 'ข้อมูลของ A ไม่เปลี่ยนเลย');
  // อ่าน: query userId ไม่มีผล — ได้ของตัวเองเสมอ
  const w = await req('GET', `/api/coins/wallet?userId=${a.id}`, { token: b.token });
  const wB = (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [b.id])).rows[0].balance;
  assert.strictEqual(w.body.balance, wB);
  const pr = await req('GET', `/api/avatar/presets?userId=${a.id}`, { token: b.token });
  assert.ok(pr.body.presets.every((p) => p.name === 'x'), 'presets ที่ได้เป็นของ B');
  const h = await req('GET', `/api/coins/history?userId=${a.id}`, { token: b.token });
  assert.ok(!JSON.stringify(h.body).includes(`"userId":${a.id}`));
  // โปรไฟล์ของ A ผ่าน URL: ได้เฉพาะ field ที่ A อนุญาต (ค่าเริ่มต้น: ไม่ใช่เพื่อน = ส่วนตัว) · ไม่มี coin/inventory/email
  const p = await req('GET', `/api/profile/${a.id}`, { token: b.token });
  assert.strictEqual(p.status, 200); assert.strictEqual(p.body.private, true);
  assert.ok(!p.raw.includes(a.email) && !p.raw.includes('"balance"'), 'ไม่มีอีเมล/ยอด Coin');
  assert.deepStrictEqual(Object.keys(p.body.fields), ['avatar'], 'มีแค่ Avatar Showcase (ค่าเริ่มต้นทุกคนดูได้) — field อื่นมีแค่ชื่อที่ถูกซ่อน');
  for (const bad of ['0', '-1', 'abc', `${a.id}x`, '1e3', '99999999']) assert.strictEqual((await req('GET', `/api/profile/${bad}`, { token: b.token })).status, 404, bad);
  // Thumbnail ของ Avatar คนอื่น: ได้เฉพาะเมื่อเจ้าของเลือกแสดง Avatar
  assert.strictEqual((await req('GET', `/api/avatar/thumb/${a.id}`, { token: b.token })).status, 404);
});
