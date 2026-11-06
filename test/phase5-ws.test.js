/*
  v1.10.0 Phase 5 — ตั๋ว WebSocket: JWT ไม่อยู่ใน URL
  ตั๋วใช้ได้ครั้งเดียว · หมดอายุ 30 วิ · ต้องเข้าสู่ระบบ · ออกจากระบบทุกอุปกรณ์แล้วตั๋วที่ออกไว้ใช้ไม่ได้ · ?token= ปิดได้ (ค่าเริ่มต้นใน production)
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

let server; let port;
test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
  setTimeout(() => process.exit(0), 100).unref();
});

let seq = 0;
async function makeUser() {
  seq += 1;
  const name = `wst${Date.now() % 1e7}${seq}`;
  const { rows } = await pool.query("INSERT INTO users (username, email, password_hash) VALUES ($1, $2, 'x') RETURNING id, token_version", [name, `${name}@gmail.com`]);
  return { id: rows[0].id, name, token: jwt.sign({ userId: rows[0].id, tv: rows[0].token_version || 0 }, process.env.JWT_SECRET) };
}
function post(path, token) {
  return new Promise((resolve, reject) => {
    const r = http.request(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null, headers: res.headers }));
    });
    r.on('error', reject); r.end('{}');
  });
}
/** ต่อ WebSocket → 'open' หรือรหัส HTTP ที่ถูกปฏิเสธ */
function tryWs(query) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`);
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
}

test('ตั๋ว WebSocket: ต้องเข้าสู่ระบบ · ใช้ได้ครั้งเดียว · ตั๋วปลอม/หมดอายุใช้ไม่ได้ · ไม่ cache', async () => {
  const u = await makeUser();
  assert.strictEqual((await post('/api/realtime/ticket')).status, 401);
  const r = await post('/api/realtime/ticket', u.token);
  assert.strictEqual(r.status, 200);
  assert.ok(/^[A-Za-z0-9_-]{40,}$/.test(r.body.ticket) && r.body.expiresIn === 30);
  assert.ok(!r.body.ticket.includes(u.token.split('.')[0]), 'ตั๋วไม่ใช่ JWT');
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(await tryWs(`ticket=${r.body.ticket}`), 'open');
  assert.strictEqual(await tryWs(`ticket=${r.body.ticket}`), 401, 'ใช้ซ้ำไม่ได้');
  assert.strictEqual(await tryWs('ticket=forged-ticket-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), 401);
  assert.strictEqual(await tryWs(''), 401);
  // หมดอายุ
  const old = Date.now; const t2 = (await post('/api/realtime/ticket', u.token)).body.ticket;
  Date.now = () => old() + 31 * 1000;
  try { assert.strictEqual(await tryWs(`ticket=${t2}`), 401, 'หมดอายุ'); } finally { Date.now = old; }
});

test('ตั๋วที่ออกก่อน "ออกจากระบบทุกอุปกรณ์" ใช้ไม่ได้ · ปิด ?token= ได้ (ค่าเริ่มต้นใน production)', async () => {
  const u = await makeUser();
  const t = (await post('/api/realtime/ticket', u.token)).body.ticket;
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [u.id]);
  assert.strictEqual(await tryWs(`ticket=${t}`), 401);
  const v = await makeUser();
  assert.strictEqual(await tryWs(`token=${v.token}`), 'open', 'นอก production ยังใช้ ?token= ได้ (ชุดทดสอบ/โหลดเทสต์)');
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.strictEqual(await tryWs(`token=${v.token}`), 401, 'production: JWT ใน URL ถูกปฏิเสธ');
    process.env.WS_QUERY_TOKEN = 'on';
    assert.strictEqual(await tryWs(`token=${v.token}`), 'open', 'เปิดชั่วคราวได้ด้วย WS_QUERY_TOKEN=on');
  } finally { process.env.NODE_ENV = prevEnv; delete process.env.WS_QUERY_TOKEN; }
});
