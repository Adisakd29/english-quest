/*
  v1.15.0 แชทโลก — ทุกคนพิมพ์คุยกันได้ (REST + WebSocket gchat:*)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.RANKED_INTRO_MS = '40';
process.env.RANKED_REVEAL_MS = '40';
process.env.RANKED_OFFER_AFTER_MS = '60000';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const C = require('../services/worldChat');
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
function connect(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws?token=${u.token}`);
    const inbox = []; const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const w = waiters.findIndex((x) => x.type === msg.type);
      if (w >= 0) { const [x] = waiters.splice(w, 1); clearTimeout(x.t); x.resolve(msg); } else inbox.push(msg);
    });
    const c = {
      ws,
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      next: (type, ms = 4000) => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const w = { type, resolve: res };
          w.t = setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1); rej(new Error(`timeout waiting ${type}`)); }, ms);
          waiters.push(w);
        });
      },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', () => c.next('connected').then(() => resolve(c)));
    ws.once('error', reject);
  });
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
const fresh = () => C._rate.clear();   // ล้างตัวนับอัตราส่ง (ทดสอบหลายกรณีติดกัน)

test('Migration 071: ตารางข้อความแชทโลก + ตั้งค่าเปิด/ปิด (เพิ่มอย่างเดียว)', async () => {
  const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'world_chat_messages'");
  assert.strictEqual(t.rowCount, 1);
  const c = await pool.query("SELECT column_default FROM information_schema.columns WHERE table_name = 'user_world_settings' AND column_name = 'global_chat'");
  assert.strictEqual(c.rows[0].column_default, 'true');
});

test('ทุกคนพิมพ์คุยกันได้: ส่งแล้วคนอื่นที่ออนไลน์ได้ทันที (WebSocket) · ประวัติโหลดได้ · ข้อมูลส่วนตัวไม่หลุด', async () => {
  fresh();
  const a = await makeUser(); const b = await makeUser(); const c = await makeUser();
  const wb = await connect(b); const wc = await connect(c);
  const r = await req('POST', '/api/world-chat', { token: a.token, body: { body: '  Hello   everyone! สวัสดีทุกคน  ' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.message.body, 'Hello everyone! สวัสดีทุกคน');
  assert.ok(r.body.delivered >= 2);
  const got = await wb.next('gchat:msg'); await wc.next('gchat:msg');
  assert.strictEqual(got.id, r.body.message.id);
  assert.strictEqual(got.user.id, a.id); assert.strictEqual(got.user.username, a.name);
  // payload มีเฉพาะฟิลด์สาธารณะ — ไม่มีอีเมล/เบอร์/ตำแหน่ง/token
  assert.deepStrictEqual(Object.keys(got).sort(), ['at', 'body', 'id', 'quick', 'type', 'user']);   // v1.17.0 quick = รหัส Quick Chat (null = พิมพ์เอง)
  assert.deepStrictEqual(Object.keys(got.user).sort(), ['avatar', 'avatarImage', 'id', 'level', 'username']);
  assert.ok(!JSON.stringify(got).includes('@gmail.com'));
  const h = (await req('GET', '/api/world-chat', { token: c.token })).body;
  const m = h.messages.find((x) => x.id === r.body.message.id);
  assert.ok(m && !m.mine);
  assert.ok(!JSON.stringify(h).includes('@gmail.com') && !/email|password|phone/i.test(JSON.stringify(h.messages)));
  assert.ok(h.me.canPost && h.me.enabled);
  assert.ok((await req('GET', '/api/world-chat', { token: a.token })).body.messages.find((x) => x.id === r.body.message.id).mine);
  assert.strictEqual((await req('GET', '/api/world-chat')).status, 401);
  await wb.close(); await wc.close();
});

test('ตัวกรอง: ข้อมูลติดต่อ/ลิงก์ไม่ถูกส่ง · คำหยาบถูกปิด * · ยาวเกิน/ว่าง/ไม่ใช่ข้อความ = ปฏิเสธ · HTML เก็บเป็นตัวอักษร', async () => {
  fresh();
  for (const bad of ['add my line id: abc123', 'call me 0812345678', 'mail me at a.b@gmail.com', 'visit https://evil.example']) {
    const u = await makeUser();   // คนละคน (3 ครั้งในคนเดียว = ถูกปิดแชทอัตโนมัติ — ทดสอบแยกด้านล่าง)
    const r = await req('POST', '/api/world-chat', { token: u.token, body: { body: bad } });
    assert.strictEqual(r.status, 400, bad); assert.strictEqual(r.body.code, 'FILTERED');
    const n = (await pool.query('SELECT count(*)::int AS n FROM world_chat_messages WHERE user_id = $1', [u.id])).rows[0].n;
    assert.strictEqual(n, 0, 'ข้อความที่มีข้อมูลติดต่อไม่ถูกบันทึกเป็นข้อความสาธารณะ');
    fresh();
  }
  const a = await makeUser();
  const p = await req('POST', '/api/world-chat', { token: a.token, body: { body: 'this is shit' } });
  assert.strictEqual(p.status, 200); assert.strictEqual(p.body.message.body, 'this is ****'); assert.ok(p.body.masked);
  fresh();
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: 'x'.repeat(201) } })).body.code, 'TOO_LONG');
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: '   ' } })).body.code, 'EMPTY');
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: { x: 1 } } })).status, 400);
  const x = await req('POST', '/api/world-chat', { token: a.token, body: { body: '<img src=x onerror=alert(1)>' } });
  assert.strictEqual(x.body.message.body, '<img src=x onerror=alert(1)>', 'เก็บเป็นข้อความ (หน้าเว็บ escape ทุกครั้ง)');
});

test('กันสแปม: ส่งถี่เกิน/ซ้ำเดิม = ไม่ได้ · ตัวกรองจับซ้ำ 3 ครั้ง → ปิดแชทชั่วคราว · ถูกห้ามแชทแล้วส่งไม่ได้', async () => {
  fresh();
  const a = await makeUser();
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: 'hi 1' } })).status, 200);
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: 'hi 2' } })).body.code, 'RATE');
  C._rate.get(a.id).last = 0;
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: 'hi 1' } })).body.code, 'DUPLICATE');
  const b = await makeUser();
  for (let i = 0; i < 3; i += 1) { fresh(); await req('POST', '/api/world-chat', { token: b.token, body: { body: `my ig: spam_acc${i}` } }); }
  fresh();
  const r = await req('POST', '/api/world-chat', { token: b.token, body: { body: 'hello' } });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.code, 'RESTRICTED');
  const h = (await req('GET', '/api/world-chat', { token: b.token })).body;
  assert.strictEqual(h.me.canPost, false); assert.ok(h.me.until);
});

test('Block / ปิดเสียง / ปิดแชทโลก: ไม่เห็นข้อความกัน (ทั้งประวัติและเรียลไทม์)', async () => {
  fresh();
  const a = await makeUser(); const b = await makeUser(); const c = await makeUser();
  await req('POST', `/api/friends/block/${a.id}`, { token: b.token, body: {} });   // b บล็อก a
  await req('PUT', `/api/world-chat/mute/${a.id}`, { token: c.token });           // c ปิดเสียง a
  const wb = await connect(b); const wc = await connect(c);
  const r = await req('POST', '/api/world-chat', { token: a.token, body: { body: 'can you see me?' } });
  await assert.rejects(wb.next('gchat:msg', 600)); await assert.rejects(wc.next('gchat:msg', 600));
  for (const u of [b, c]) assert.ok(!(await req('GET', '/api/world-chat', { token: u.token })).body.messages.some((m) => m.id === r.body.message.id));
  // ผู้ถูกบล็อกก็ไม่เห็นข้อความของคนที่บล็อกตน
  fresh();
  const rb = await req('POST', '/api/world-chat', { token: b.token, body: { body: 'from b' } });
  assert.strictEqual((await wc.next('gchat:msg')).body, 'from b', 'c ไม่ได้บล็อก b จึงได้รับปกติ');
  assert.ok(!(await req('GET', '/api/world-chat', { token: a.token })).body.messages.some((m) => m.id === rb.body.message.id));
  // ปิดแชทโลก → ไม่ได้รับ + ส่งไม่ได้ · เปิดกลับได้
  await req('DELETE', `/api/world-chat/mute/${a.id}`, { token: c.token });
  await req('PUT', '/api/world-chat/settings', { token: c.token, body: { enabled: false } });
  fresh();
  await req('POST', '/api/world-chat', { token: a.token, body: { body: 'still there?' } });
  await assert.rejects(wc.next('gchat:msg', 600));
  assert.strictEqual((await req('POST', '/api/world-chat', { token: c.token, body: { body: 'hi' } })).body.code, 'DISABLED');
  await req('PUT', '/api/world-chat/settings', { token: c.token, body: { enabled: true } });
  fresh();
  await req('POST', '/api/world-chat', { token: a.token, body: { body: 'back again' } });
  assert.strictEqual((await wc.next('gchat:msg')).body, 'back again');
  await wb.close(); await wc.close();
});

test('ลบ/ซ่อน: เจ้าของลบเองได้ · คนอื่นลบไม่ได้ · ผู้ดูแลซ่อนได้ · ทุกคนได้ gchat:remove', async () => {
  fresh();
  const a = await makeUser(); const b = await makeUser(); const admin = await makeUser();
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  const adminTok = (await req('POST', '/api/auth/login', { body: { identifier: `${admin.name}@gmail.com`, password: 'password123' } })).body.token || admin.token;
  const m1 = (await req('POST', '/api/world-chat', { token: a.token, body: { body: 'oops' } })).body.message;
  assert.strictEqual((await req('DELETE', `/api/world-chat/${m1.id}`, { token: b.token })).status, 404);
  const wb = await connect(b);
  assert.strictEqual((await req('DELETE', `/api/world-chat/${m1.id}`, { token: a.token })).status, 200);
  assert.strictEqual((await wb.next('gchat:remove')).id, m1.id);
  fresh();
  const m2 = (await req('POST', '/api/world-chat', { token: a.token, body: { body: 'rude stuff' } })).body.message;
  assert.strictEqual((await req('DELETE', `/api/world-chat/${m2.id}`, { token: adminTok })).status, 200);
  assert.ok(!(await req('GET', '/api/world-chat', { token: b.token })).body.messages.some((m) => m.id === m2.id));
  await wb.close();
});

test('รายงานข้อความ: เข้า user_reports (source = world) พร้อมรหัสข้อความ · เหตุผลผิด/รายงานตัวเอง = ไม่ได้', async () => {
  fresh();
  const a = await makeUser(); const b = await makeUser();
  const m = (await req('POST', '/api/world-chat', { token: a.token, body: { body: 'annoying msg' } })).body.message;
  assert.strictEqual((await req('POST', `/api/world-chat/${m.id}/report`, { token: b.token, body: { reason: 'xx' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/world-chat/${m.id}/report`, { token: a.token, body: { reason: 'spam' } })).status, 400);
  const r = await req('POST', `/api/world-chat/${m.id}/report`, { token: b.token, body: { reason: 'harassment' } });
  assert.strictEqual(r.status, 200);
  const rep = (await pool.query('SELECT source, details, context FROM user_reports WHERE id = $1', [r.body.reportId])).rows[0];
  assert.strictEqual(rep.source, 'world');
  assert.ok(rep.details.includes(`#${m.id}`));
});

test('ประวัติ: แบ่งหน้า (before) · ไม่เกิน 50 ต่อหน้า · ข้อความเก่ากว่า 30 วันถูกลบโดย purge', async () => {
  const a = await makeUser();
  const ids = [];
  for (let i = 0; i < 55; i += 1) ids.push((await pool.query('INSERT INTO world_chat_messages (user_id, body) VALUES ($1, $2) RETURNING id', [a.id, `bulk ${i}`])).rows[0].id);
  const p1 = (await req('GET', '/api/world-chat', { token: a.token })).body;
  assert.strictEqual(p1.messages.length, 50); assert.ok(p1.more);
  const p2 = (await req('GET', `/api/world-chat?before=${p1.messages[0].id}`, { token: a.token })).body;
  assert.ok(p2.messages.every((m) => m.id < p1.messages[0].id));
  const old = (await pool.query("INSERT INTO world_chat_messages (user_id, body, created_at) VALUES ($1, 'old', NOW() - INTERVAL '31 days') RETURNING id", [a.id])).rows[0].id;
  await C.purge();
  assert.strictEqual((await pool.query('SELECT 1 FROM world_chat_messages WHERE id = $1', [old])).rowCount, 0);
  assert.strictEqual((await pool.query('SELECT 1 FROM world_chat_messages WHERE id = $1', [ids[0]])).rowCount, 1);
});
