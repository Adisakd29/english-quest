/*
  EnglishQuest World (Multiplayer 3D Lobby) — ผู้เล่นจริงหลายคนผ่าน WebSocket บนเซิร์ฟเวอร์แบบเดียวกับ production
    TEST_DATABASE_URL=... node --test test/world.test.js
  ครอบคลุม: เข้าห้องเดียวกัน · เห็นการเดินของกัน · ตรวจตำแหน่ง (ความเร็ว/กำแพง) · แชทตามสิทธิ์ · บล็อก · ปิดเสียง ·
  หลุดแล้วหาย/กลับมาไม่ซ้ำ · ห้องเต็ม · คำชวน · Privacy · AFK · รายงาน/จำกัดสิทธิ์/อุทธรณ์ · กู้หลังรีสตาร์ต · ปลอมตัวตน
*/
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const rooms = require('../rooms');
const W = require('../services/world');
const { WORLD } = require('../config/world');

let server; let port;
test.before(async () => {
  WORLD.chatMinIntervalMs = 150;   // ย่อเวลารอในเทสต์ (กติกาจริง 1.5 วินาที — ทดสอบ RATE ด้วยการส่งรัว)
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  rooms.init();
  W.init();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
  setTimeout(() => process.exit(0), 100).unref();
});
test.afterEach(() => {
  // ห้อง/เซสชันเป็นสถานะในหน่วยความจำ — ล้างระหว่างเทสต์
  W._state.rooms.clear(); W._state.byUser.clear(); W._state.grace.clear(); W._state.invites.clear();
});

let seq = 0;
async function makeUser({ ageDays = 10 } = {}) {
  seq += 1;
  const name = `wd${Date.now() % 1e7}${seq}`;
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash, created_at) VALUES ($1, $2, 'x', NOW() - ($3 || ' days')::interval) RETURNING id, token_version`,
    [name, `${name}@gmail.com`, String(ageDays)]);
  return { id: rows[0].id, name, token: jwt.sign({ userId: rows[0].id, tv: rows[0].token_version || 0 }, process.env.JWT_SECRET) };
}
function connect(user) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${user.token}`);
    const inbox = []; const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) { const [w] = waiters.splice(i, 1); w.resolve(msg); } else inbox.push(msg);
    });
    const c = {
      ws, user, inbox,
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      wait: (type, pred = () => true, ms = 6000) => new Promise((res, rej) => {
        const match = (m) => m.type === type && pred(m);
        const j = inbox.findIndex(match);
        if (j >= 0) { res(inbox.splice(j, 1)[0]); return; }
        const t = setTimeout(() => rej(new Error(`รอ ${type} ไม่ทัน (${user.name})`)), ms);
        waiters.push({ match, resolve: (m) => { clearTimeout(t); res(m); } });
      }),
      none: async (type, pred = () => true, ms = 600) => { await new Promise((r) => setTimeout(r, ms)); return !inbox.some((m) => m.type === type && pred(m)); },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', async () => { await c.wait('connected'); resolve(c); });
    ws.once('error', reject);
    ws.once('unexpected-response', (_q, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}
async function api(method, path, user, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function enter(user, extra = {}) {
  const c = await connect(user);
  c.send('world:join', extra);
  c.joined = await c.wait('world:joined');
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('world: 2 ผู้ใช้เข้าห้องเดียวกัน เห็นกัน (Avatar + ชุดจริงจาก Wardrobe) · payload ไม่มี user id/อีเมล', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  await pool.query("INSERT INTO user_avatar (user_id, hair_item_id) VALUES ($1, 'hair_spiky') ON CONFLICT (user_id) DO UPDATE SET hair_item_id = 'hair_spiky'", [ua.id]).catch(() => {});
  const a = await enter(ua);
  const b = await enter(ub);
  assert.strictEqual(a.joined.room.id, b.joined.room.id, 'เข้าห้องเดียวกันอัตโนมัติ (เติมห้องที่มีคนก่อน)');
  const add = await a.wait('world:add');
  assert.strictEqual(add.player.name, ub.name);
  assert.ok(b.joined.players.find((p) => p.name === ua.name), 'คนที่เข้าทีหลังเห็นคนที่อยู่ก่อน');
  const raw = JSON.stringify([a.joined, b.joined, add]);
  assert.ok(!raw.includes(`"userId"`) && !raw.includes('@gmail.com') && !raw.includes('"id":' + ua.id), 'ไม่ส่ง user id / อีเมลของคนอื่น');
  const pa = b.joined.players.find((p) => p.name === ua.name);
  assert.ok(pa.outfit && typeof pa.outfit === 'object' && pa.pid.length >= 8);
  await Promise.all([a.close(), b.close()]);
});

test('world: เห็นการเดินของกัน · เซิร์ฟเวอร์ตรวจความเร็ว (วาร์ปไม่ได้) และกำแพง (เดินทะลุน้ำพุไม่ได้)', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  const a = await enter(ua); const b = await enter(ub);
  const me = a.joined.you;
  await sleep(120);
  a.send('world:move', { x: me.x + 0.15, z: me.z, ry: 1.0, st: 'walk' });
  const snap = await b.wait('world:snap', (m) => m.p.some((r) => r[0] === me.pid && Math.abs(r[1] / 100 - (me.x + 0.15)) < 0.02));
  const row = snap.p.find((r) => r[0] === me.pid);
  assert.strictEqual(row[4], 1, 'สถานะ walk ถูกซิงก์');
  // วาร์ป 20 เมตร → ถูกจำกัดตามความเร็ววิ่ง + ส่งตำแหน่งที่ถูกกลับ
  await sleep(150);
  a.send('world:move', { x: me.x + 20, z: me.z, ry: 0, st: 'run' });
  const cor = await a.wait('world:correct');
  const cap = WORLD.runSpeed * WORLD.speedSlack + 0.12;   // งบสะสมสูงสุด = วิ่ง 1 วินาที
  assert.ok(cor.x - me.x - 0.15 <= cap + 0.01, `ตำแหน่งถูกจำกัด (${cor.x})`);
  // ส่งรัว ๆ 60 ข้อความในทีเดียว (ก้าวละ 0.5 m) → ได้ไม่เกินงบที่สะสมตามเวลาจริง (ส่งถี่ไม่ได้เร็วขึ้น)
  const p0 = W._state.byUser.get(ua.id); const sx = p0.x; const sz = p0.z;
  for (let i = 1; i <= 60; i += 1) a.send('world:move', { x: sx, z: sz + (sz > 0 ? 0.5 : -0.5) * i, ry: 0, st: 'run' });
  await sleep(200);
  const p1 = W._state.byUser.get(ua.id);
  assert.ok(Math.hypot(p1.x - sx, p1.z - sz) <= WORLD.runSpeed * WORLD.speedSlack * 0.5 + 0.2, `ส่งรัวไม่ได้ระยะเพิ่ม (${Math.hypot(p1.x - sx, p1.z - sz).toFixed(2)} m)`);
  // เครื่องกระตุก 1 วินาทีแล้วส่ง 2 ก้าวติดกัน (ก้าวละ 1.15 m ตามความเร็วเดินจริง) → ไม่ถูกดึงกลับ
  await sleep(1100);
  const c0 = W._state.byUser.get(ua.id); let corrected = false;
  c0.x = 0.5; c0.z = -8;   // ทางเดินโล่งไป Learning Hall (ไม่มีสิ่งกีดขวาง)
  const onCor = (raw) => { if (String(raw).includes('world:correct')) corrected = true; };
  a.ws.on('message', onCor);
  const dir = -1;
  a.send('world:move', { x: c0.x, z: c0.z + dir * 1.15, ry: 0, st: 'walk' });
  a.send('world:move', { x: c0.x, z: c0.z + dir * 2.3, ry: 0, st: 'walk' });
  await sleep(300); a.ws.off('message', onCor);
  const pz = W._state.byUser.get(ua.id); assert.ok(!corrected && Math.abs(pz.z - (-8 - 2.3)) < 0.05, `ข้อความที่มาติดกันหลังกระตุกไม่ถูกดึงกลับ (${corrected} ${pz.x},${pz.z} budget ${pz.moveBudget})`);
  // พยายามเดินเข้าใจกลางน้ำพุ (collider r 2.75) — ทีละก้าวที่ถูกกติกา
  let x = cor.x; let z = cor.z;
  for (let i = 0; i < 40; i += 1) {
    await sleep(110);
    const d = Math.hypot(x, z) || 1; x -= (x / d) * 0.4; z -= (z / d) * 0.4;
    a.send('world:move', { x, z, ry: 0, st: 'walk' });
  }
  await sleep(300);
  const p = W._state.byUser.get(ua.id);
  assert.ok(Math.hypot(p.x, p.z) >= 2.75 + 0.2, `ไม่ทะลุน้ำพุ (ระยะจากศูนย์กลาง ${Math.hypot(p.x, p.z).toFixed(2)})`);
  await Promise.all([a.close(), b.close()]);
});

test('world: แชท — ค่าเริ่มต้นประโยคสำเร็จรูป · พิมพ์เองต้องเปิดเองทั้งสองฝ่าย + บัญชีอายุ ≥ 3 วัน · กรองคำหยาบ/ข้อมูลติดต่อ · แชทใกล้ตัวตามระยะ', async () => {
  const [ua, ub, un] = [await makeUser(), await makeUser(), await makeUser({ ageDays: 0 })];
  const a = await enter(ua); const b = await enter(ub);
  a.send('world:chat', { mode: 'local', phrase: 'nice_meet' });
  const got = await b.wait('world:chat');
  assert.strictEqual(got.text, null); assert.strictEqual(got.phrase, 'nice_meet');
  await sleep(200);
  a.send('world:chat', { mode: 'local', text: 'hello there' });
  assert.strictEqual((await a.wait('world:chat_error')).code, 'TEXT_NOT_ALLOWED', 'ปิดพิมพ์เองเป็นค่าเริ่มต้น');
  assert.strictEqual((await api('PUT', '/world/settings', ua, { chatMode: 'text' })).status, 200);
  await sleep(200);
  a.send('world:chat', { mode: 'local', text: 'hello there' });
  assert.ok(await b.none('world:chat', (m) => m.kind === 'text'), 'ผู้รับที่ยังเป็นโหมดประโยคสำเร็จรูป ไม่ได้รับข้อความพิมพ์เอง');
  await api('PUT', '/world/settings', ub, { chatMode: 'text' });
  await sleep(200);
  a.send('world:chat', { mode: 'local', text: 'you are so stupid' });
  assert.strictEqual((await a.wait('world:chat_error')).code, 'FILTERED', 'ข้อความคำหยาบถูกกรอง → ไม่ส่งต่อ');
  assert.ok(await b.none('world:chat', (m) => m.kind === 'text'), 'ข้อความที่ถูกกรองไม่ถึงผู้รับ (ไม่แสดงเป็นดอกจัน)');
  await sleep(200);
  a.send('world:chat', { mode: 'local', text: 'add my line id: abc123' });
  assert.strictEqual((await a.wait('world:chat_error')).code, 'CONTACT_BLOCKED');
  await sleep(200);
  W._state.byUser.get(ua.id).chat.times = [];   // ข้อความที่ถูกกรองนับในโควตาอัตรา — ล้างเพื่อทดสอบหัวข้อถัดไป
  a.send('world:chat', { mode: 'room', text: 'room text' });
  const rm = await b.wait('world:chat', (m) => m.kind === 'text' && m.mode === 'room');
  assert.strictEqual(rm.text, 'room text', 'Room Chat แบบพิมพ์เอง (ทั้งสองฝ่ายเปิดสิทธิ์)');
  // บัญชีใหม่ (< 3 วัน) พิมพ์เองไม่ได้แม้เปิดตั้งค่า
  const n = await enter(un);
  await api('PUT', '/world/settings', un, { chatMode: 'text' });
  n.send('world:chat', { mode: 'local', text: 'hi' });
  assert.strictEqual((await n.wait('world:chat_error')).code, 'TEXT_NOT_ALLOWED');
  // อัตรา: ส่งรัว
  await sleep(200);
  n.send('world:chat', { mode: 'room', phrase: 'hello' }); n.send('world:chat', { mode: 'room', phrase: 'hello' });
  assert.strictEqual((await n.wait('world:chat_error')).code, 'RATE');
  // แชทใกล้ตัว: ย้ายไกลเกิน 12 m แล้วส่ง → ไม่ถึง
  const pb = W._state.byUser.get(ub.id); pb.x = 20; pb.z = 0;
  await sleep(200);
  a.send('world:chat', { mode: 'local', phrase: 'see_you' });
  assert.ok(await b.none('world:chat', (m) => m.phrase === 'see_you'), 'ไกลเกินระยะแชทใกล้ตัว');
  a.send('world:chat', { mode: 'room', phrase: 'good_luck' });
  await sleep(200);
  a.send('world:chat', { mode: 'room', phrase: 'good_luck' });
  await b.wait('world:chat', (m) => m.phrase === 'good_luck' && m.mode === 'room');
  const log = await pool.query('SELECT kind, flagged FROM world_chat_log WHERE user_id = $1 ORDER BY id', [ua.id]);
  assert.ok(log.rows.some((r) => r.flagged === 'profanity') && log.rows.some((r) => r.flagged === 'contact'), 'บันทึกหลักฐานให้ผู้ดูแล');
  await Promise.all([a.close(), b.close(), n.close()]);
});

test('world: บล็อกแล้วมองไม่เห็นกัน ส่งข้อความ/ชวน/โบกมือไม่ได้ · ปิดเสียงไม่เห็นแชทอีกฝ่าย', async () => {
  const [ua, ub, uc] = [await makeUser(), await makeUser(), await makeUser()];
  const a = await enter(ua); const b = await enter(ub); const c = await enter(uc);
  const pidB = W._state.byUser.get(ub.id).pid; const pidA = W._state.byUser.get(ua.id).pid; const pidC = W._state.byUser.get(uc.id).pid;
  // Mute: A ปิดเสียง C
  assert.strictEqual((await api('POST', `/world/players/${pidC}/mute`, ua, { on: true })).status, 200);
  c.send('world:chat', { mode: 'room', phrase: 'hello' });
  await b.wait('world:chat', (m) => m.from === pidC);
  assert.ok(await a.none('world:chat', (m) => m.from === pidC), 'ผู้ที่ปิดเสียงไม่ได้รับ');
  // Block: A บล็อก B
  const r = await api('POST', `/world/players/${pidB}/block`, ua);
  assert.strictEqual(r.status, 200);
  await a.wait('world:remove', (m) => m.pid === pidB);
  await b.wait('world:remove', (m) => m.pid === pidA);
  b.send('world:chat', { mode: 'room', phrase: 'hello' });
  assert.ok(await a.none('world:chat', (m) => m.from === pidB), 'บล็อกแล้วข้อความไม่ถึง');
  b.send('world:wave', { pid: pidA });
  assert.strictEqual((await b.wait('world:error')).code, 'NO_PLAYER');
  b.send('world:invite', { pid: pidA, kind: 'practice' });
  assert.strictEqual((await b.wait('world:error', (m) => m.code === 'NO_PLAYER')).code, 'NO_PLAYER', 'บล็อกแล้วชวนไม่ได้');
  assert.strictEqual((await api('GET', `/world/players/${pidA}/profile`, ub)).status, 404, 'ดูโปรไฟล์คนที่บล็อกกันไม่ได้');
  // snapshot ไม่มีอีกฝ่าย
  W._state.byUser.get(ub.id).ver += 5;
  await sleep(250);
  assert.ok(!a.inbox.some((m) => m.type === 'world:snap' && m.p.some((row) => row[0] === pidB)), 'ไม่ส่งตำแหน่งของคนที่บล็อก');
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('world: หลุดแล้ว Avatar หายจากห้องทันที · กลับมาใน 30 วิ = ที่เดิม pid เดิม ไม่ซ้ำ · เปิดอีกแท็บ = ปิดเซสชันเก่า', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  const a = await enter(ua); const b = await enter(ub);
  const pidA = a.joined.you.pid;
  const room = a.joined.room.id;
  W._state.byUser.get(ua.id).x = 3.3; W._state.byUser.get(ua.id).z = -4.1;
  await a.close();
  await b.wait('world:remove', (m) => m.pid === pidA && m.reason === 'disconnected');
  const a2 = await enter(ua, { roomId: room, resume: { roomId: room, x: 0, z: 0 } });
  assert.strictEqual(a2.joined.you.pid, pidA, 'pid เดิม');
  assert.ok(Math.abs(a2.joined.you.x - 3.3) < 0.01 && Math.abs(a2.joined.you.z + 4.1) < 0.01, 'ตำแหน่งเดิมจากเซิร์ฟเวอร์ (ไม่เชื่อ client)');
  await b.wait('world:add', (m) => m.player.pid === pidA);
  const r = W._state.rooms.get(room);
  assert.strictEqual([...r.players.values()].filter((p) => p.userId === ua.id).length, 1, 'ไม่มีตัวละครซ้ำ');
  // อีกแท็บ
  const a3 = await enter(ua);
  await a2.wait('world:kicked', (m) => m.reason === 'other_session');
  assert.strictEqual([...W._state.rooms.values()].reduce((n, x) => n + [...x.players.values()].filter((p) => p.userId === ua.id).length, 0), 1);
  await Promise.all([a2.close(), a3.close(), b.close()]);
});

test('world: ห้องเต็ม → จัดห้องใหม่อัตโนมัติ · เลือกห้องที่เต็มเอง = ROOM_FULL · รายการห้อง', async () => {
  const keep = WORLD.capacity; WORLD.capacity = 2;
  try {
    const us = [await makeUser(), await makeUser(), await makeUser()];
    const a = await enter(us[0]); const b = await enter(us[1]);
    assert.strictEqual(a.joined.room.id, b.joined.room.id);
    const c = await enter(us[2]);
    assert.notStrictEqual(c.joined.room.id, a.joined.room.id, 'ห้องเต็ม → ห้องถัดไป');
    c.send('world:join', { roomId: a.joined.room.id });
    assert.strictEqual((await c.wait('world:error')).code, 'ROOM_FULL');
    const list = (await api('GET', '/world/rooms', us[2])).body.rooms;
    assert.ok(list.find((r) => r.id === a.joined.room.id && r.count === 2 && r.cap === 2));
    await Promise.all([a.close(), b.close(), c.close()]);
  } finally { WORLD.capacity = keep; }
});

test('world: คำชวน — ค่าเริ่มต้นรับเฉพาะเพื่อน · ตอบรับแล้วเข้าห้องแข่งคำศัพท์เดิมทั้งคู่ · ตามเพื่อนเข้าห้อง', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  const a = await enter(ua); const b = await enter(ub);
  const pidB = W._state.byUser.get(ub.id).pid;
  const pa = W._state.byUser.get(ua.id); const pb = W._state.byUser.get(ub.id);
  pb.x = pa.x + 1; pb.z = pa.z;
  a.send('world:invite', { pid: pidB, kind: 'practice', level: 'A2' });
  assert.strictEqual((await a.wait('world:error')).code, 'FRIENDS_ONLY');
  await api('PUT', '/world/settings', ub, { practiceInvites: 'everyone' });
  pa.lastInviteAt = 0;   // (กติกา: ชวนได้ทุก 8 วินาที)
  a.send('world:invite', { pid: pidB, kind: 'practice', level: 'A2' });
  const inv = await b.wait('world:invite');
  assert.strictEqual(inv.from.name, ua.name); assert.strictEqual(inv.level, 'A2');
  b.send('world:invite_reply', { id: inv.id, accept: true });
  const [ja, jb] = await Promise.all([a.wait('room:joined'), b.wait('room:joined')]);
  assert.strictEqual(ja.code, jb.code); assert.strictEqual(ja.level, 'A2');
  assert.strictEqual(ja.players.length, 2);
  // ตามเพื่อน: เป็นเพื่อนกันแล้ว → C ตามเข้าห้องของ A ได้
  const uc = await makeUser();
  await pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [ua.id, uc.id]);
  const c = await connect(uc);
  c.send('world:join', { friend: ua.id });
  const jc = await c.wait('world:joined');
  assert.strictEqual(jc.room.id, a.joined.room.id);
  const fl = (await api('GET', '/world/friends', uc)).body.friends;
  assert.ok(fl.find((f) => f.userId === ua.id && f.roomId === a.joined.room.id));
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('world: Privacy — ปิด "ให้คนอื่นเห็นฉัน" = ห้องส่วนตัว · ดูโปรไฟล์ตาม Privacy เดิม · เพิ่มเพื่อนจากในโลก', async () => {
  const [ua, ub, uc] = [await makeUser(), await makeUser(), await makeUser()];
  await api('PUT', '/world/settings', uc, { showInLobby: false });
  const c = await enter(uc);
  assert.ok(c.joined.room.private && c.joined.players.length === 0, 'อยู่ห้องส่วนตัวคนเดียว');
  const a = await enter(ua); const b = await enter(ub);
  assert.ok(!b.joined.players.some((p) => p.name === uc.name));
  const pidA = W._state.byUser.get(ua.id).pid;
  const prof = (await api('GET', `/world/players/${pidA}/profile`, ub)).body.profile;
  assert.strictEqual(prof.private, true, 'โปรไฟล์ค่าเริ่มต้น = เพื่อนเท่านั้น → คนแปลกหน้าเห็นแบบซ่อน');
  assert.ok(!JSON.stringify(prof).includes('@gmail.com'));
  const fr = await api('POST', `/world/players/${pidA}/friend`, ub);
  assert.strictEqual(fr.body.status, 'pending');
  assert.strictEqual((await api('GET', '/world/players/nope/profile', ub)).status, 404);
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('world: AFK → สถานะ AFK แล้วออกจากห้องอัตโนมัติ (ไม่ได้ Coin/EXP จากการยืนเฉย)', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  const a = await enter(ua); const b = await enter(ub);
  const exp0 = (await pool.query('SELECT exp FROM users WHERE id = $1', [ua.id])).rows[0].exp;
  const p = W._state.byUser.get(ua.id);
  p.lastInputAt = Date.now() - WORLD.afkWarnMs - 1000;
  W._housekeeping();
  await b.wait('world:snap', (m) => m.p.some((r) => r[0] === p.pid && r[5] === 1));
  p.lastInputAt = Date.now() - WORLD.afkKickMs - 1000;
  W._housekeeping();
  await a.wait('world:kicked', (m) => m.reason === 'afk');
  await b.wait('world:remove', (m) => m.pid === p.pid && m.reason === 'afk');
  const exp1 = (await pool.query('SELECT exp FROM users WHERE id = $1', [ua.id])).rows[0].exp;
  assert.strictEqual(exp1, exp0);
  await Promise.all([a.close(), b.close()]);
});

test('world: รายงาน → user_reports (source world + หลักฐานแชท) · รายงานหลายคน = ปิดแชทชั่วคราว · ผู้ดูแลจำกัดสิทธิ์ → เข้า Lobby ไม่ได้ · อุทธรณ์', async () => {
  const bad = await makeUser(); const rs = [await makeUser(), await makeUser(), await makeUser()];
  const x = await enter(bad); const cs = [];
  for (const u of rs) cs.push(await enter(u));
  x.send('world:chat', { mode: 'room', phrase: 'hello' });
  await cs[0].wait('world:chat');
  const pid = W._state.byUser.get(bad.id).pid;
  for (const u of rs) assert.strictEqual((await api('POST', `/world/players/${pid}/report`, u, { reason: 'harassment', details: 'test' })).status, 200);
  const rep = await pool.query("SELECT source, context FROM user_reports WHERE reported_id = $1", [bad.id]);
  assert.ok(rep.rows.length === 3 && rep.rows.every((r) => r.source === 'world' && r.context.chatIds.length >= 1));
  const restr = await pool.query("SELECT id, kind FROM world_restrictions WHERE user_id = $1", [bad.id]);
  assert.ok(restr.rows.some((r) => r.kind === 'chat'), 'ปิดแชทชั่วคราวอัตโนมัติ');
  await sleep(200);
  x.send('world:chat', { mode: 'room', phrase: 'hello' });
  assert.strictEqual((await x.wait('world:chat_error', (m) => m.code === 'CHAT_RESTRICTED')).code, 'CHAT_RESTRICTED');
  // ผู้ดูแลห้ามเข้า Lobby
  const admin = await makeUser();
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  const rr = await api('POST', '/admin/world/restrict', admin, { userId: bad.id, kind: 'lobby', minutes: 60, reason: 'ก่อกวน' });
  assert.strictEqual(rr.status, 200);
  await x.wait('world:kicked', (m) => m.reason === 'restricted');
  x.send('world:join', {});
  assert.strictEqual((await x.wait('world:error')).code, 'LOBBY_RESTRICTED');
  const ap = await api('POST', `/world/restrictions/${rr.body.restriction.id}/appeal`, bad, { text: 'ขอโทษครับ จะไม่ทำอีก' });
  assert.strictEqual(ap.status, 200);
  assert.strictEqual((await api('POST', `/world/restrictions/${rr.body.restriction.id}/appeal`, bad, { text: 'อีกครั้ง' })).status, 400, 'อุทธรณ์ได้ครั้งเดียว');
  const pend = (await api('GET', '/admin/world/restrictions?status=pending', admin)).body.restrictions;
  assert.ok(pend.find((r) => r.id === rr.body.restriction.id));
  assert.strictEqual((await api('POST', `/admin/world/restrictions/${rr.body.restriction.id}/review`, admin, { decision: 'lifted', note: 'ok' })).status, 200);
  x.send('world:join', {});
  await x.wait('world:joined');
  assert.strictEqual((await api('GET', '/admin/world/metrics', rs[0])).status, 403, 'เครื่องมือผู้ดูแลเฉพาะ admin');
  const wr = (await api('GET', '/admin/world/reports', admin)).body.reports;
  assert.ok(wr.some((r) => r.reported_id === bad.id && r.evidence.length >= 1));
  await Promise.all([x.close(), ...cs.map((c) => c.close())]);
});

test('world: เซิร์ฟเวอร์รีสตาร์ต → ขอห้อง/ตำแหน่งเดิมได้ (ตรวจว่าเดินได้จริง) · ปลอม userId ไม่มีผล · token ที่ถูกยกเลิกต่อ WebSocket ไม่ได้', async () => {
  const [ua, ub] = [await makeUser(), await makeUser()];
  const a = await enter(ua, { roomId: 'campus-3', resume: { roomId: 'campus-3', x: 5.5, z: 5.5, ry: 1 } });
  assert.strictEqual(a.joined.room.id, 'campus-3');
  assert.ok(Math.abs(a.joined.you.x - 5.5) < 0.01);
  const b = await enter(ub, { roomId: 'campus-3', resume: { roomId: 'campus-3', x: 0, z: 0 } });
  assert.ok(Math.hypot(b.joined.you.x, b.joined.you.z) > 2.75, 'ตำแหน่งในน้ำพุ = ไม่รับ → จุดเกิด');
  // ปลอมตัวตน: ส่ง userId ของคนอื่นมาด้วย — เซิร์ฟเวอร์ใช้ตัวตนจาก token เท่านั้น
  b.send('world:chat', { mode: 'room', phrase: 'hello', userId: ua.id, from: a.joined.you.pid, name: ua.name });
  const m = await a.wait('world:chat');
  assert.strictEqual(m.name, ub.name); assert.strictEqual(m.from, b.joined.you.pid);
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [ua.id]);
  await assert.rejects(connect(ua), /401/);
  await Promise.all([a.close(), b.close()]);
});


test('world: Free Text Chat — สองคนพิมพ์คุยกัน · ack/cid ส่งซ้ำหลังหลุดไม่ซ้ำ · ลำดับ seq · ประวัติห้อง · ผู้ดูแลปิดพิมพ์เอง (Quick Chat ยังใช้ได้) · XSS ส่งเป็นข้อความล้วน', async () => {
  const [ua, ub, uc] = [await makeUser(), await makeUser(), await makeUser()];
  for (const u of [ua, ub, uc]) await api('PUT', '/world/settings', u, { chatMode: 'text' });
  const a = await enter(ua); const b = await enter(ub);
  await sleep(160);
  a.send('world:chat', { mode: 'local', text: 'Hi! Do you want to practice?', cid: 'c-test-0001' });
  const ack = await a.wait('world:chat_ack', (m) => m.cid === 'c-test-0001');
  const got = await b.wait('world:chat', (m) => m.kind === 'text');
  assert.strictEqual(got.text, 'Hi! Do you want to practice?');
  assert.ok(got.seq > 0 && got.id === ack.id, 'มี id + seq ของห้อง');
  assert.ok(!('userId' in got) && !JSON.stringify(got).includes('@'), 'payload ไม่มี user id/อีเมล');
  // B ตอบ
  await sleep(160);
  b.send('world:chat', { mode: 'local', text: 'Sure, let us go!', cid: 'c-test-0002' });
  const back = await a.wait('world:chat', (m) => m.kind === 'text' && m.from !== got.from);
  assert.strictEqual(back.text, 'Sure, let us go!');
  assert.ok(back.seq > got.seq, 'ลำดับข้อความเพิ่มขึ้น');
  // หลุดแล้วกลับมา ส่งซ้ำด้วย cid เดิม → ได้ ack (dup) แต่ไม่มีใครได้รับซ้ำ
  await a.close();
  const a2 = await enter(ua);
  await sleep(160);
  a2.send('world:chat', { mode: 'local', text: 'Hi! Do you want to practice?', cid: 'c-test-0001' });
  const dup = await a2.wait('world:chat_ack', (m) => m.cid === 'c-test-0001');
  assert.ok(dup.dup && dup.id === ack.id, 'cid เดิม = ข้อความเดิม');
  assert.ok(await b.none('world:chat', (m) => m.id === ack.id), 'ไม่ส่งซ้ำ');
  // XSS: ส่งเป็นข้อความล้วน (หน้าเว็บ escape ก่อนแสดงผล) — เซิร์ฟเวอร์ไม่แปลงเป็น HTML
  await sleep(1600);
  a2.send('world:chat', { mode: 'room', text: '<img src=x onerror=alert(1)> hello', cid: 'c-test-0003' });
  const x = await b.wait('world:chat', (m) => m.kind === 'text' && m.mode === 'room');
  assert.strictEqual(x.text, '<img src=x onerror=alert(1)> hello');
  // ประวัติห้อง: C เพิ่งเข้า → เห็นแชททั้งห้องล่าสุด (ไม่ใช่แชทใกล้ตัว)
  const c = await enter(uc);
  const h = await c.wait('world:chat_history');
  assert.ok(h.items.some((m) => m.id === x.id) && !h.items.some((m) => m.mode === 'local'), 'ประวัติเฉพาะแชททั้งห้อง');
  // ผู้ดูแลปิด "พิมพ์เอง" ของ A (kind text) → พิมพ์ไม่ได้ แต่ Quick Chat ยังได้
  const mod = require('../services/world/moderation');
  await mod.restrict(ua.id, 'text', 60, 'ทดสอบ');
  await W.onRestriction(ua.id);
  await sleep(1600);
  a2.send('world:chat', { mode: 'local', text: 'hello again', cid: 'c-test-0004' });
  const e = await a2.wait('world:chat_error', (m) => m.cid === 'c-test-0004');
  assert.strictEqual(e.code, 'TEXT_NOT_ALLOWED');
  await sleep(1600);
  a2.send('world:chat', { mode: 'room', phrase: 'hello', cid: 'c-test-0005' });
  await b.wait('world:chat', (m) => m.phrase === 'hello');
  await Promise.all([a2.close(), b.close(), c.close()]);
});
