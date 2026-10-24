/*
  ทดสอบห้องแข่ง (Battle) ด้วยผู้เล่นจริงหลายคนผ่าน WebSocket
  เปิดเซิร์ฟเวอร์แบบเดียวกับ production (HTTP + realtime + rooms) บนฐานข้อมูลทดสอบ
    TEST_DATABASE_URL=... node --test test/battle.test.js
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

let server;
let port;

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  rooms.init();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

test.after(async () => {
  rooms._rooms.clear();
  await new Promise((r) => server.close(r));
  await pool.end();
  setTimeout(() => process.exit(0), 100).unref();
});

let seq = 0;
async function makeUser() {
  seq += 1;
  const name = `bt${Date.now() % 1e7}${seq}`;
  const { rows } = await pool.query(
    "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, 'x') RETURNING id, token_version", [name, `${name}@gmail.com`]
  );
  return { id: rows[0].id, name, token: jwt.sign({ userId: rows[0].id, tv: rows[0].token_version || 0 }, process.env.JWT_SECRET) };
}

// ผู้เล่นหนึ่งคน = WebSocket หนึ่งเส้น + กล่องข้อความที่รอได้
function connect(user) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${user.token}`);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) { const [w] = waiters.splice(i, 1); w.resolve(msg); } else inbox.push(msg);
    });
    const c = {
      ws,
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      wait: (type, pred = () => true, ms = 8000) => new Promise((res, rej) => {
        const match = (m) => m.type === type && pred(m);
        const j = inbox.findIndex(match);
        if (j >= 0) { res(inbox.splice(j, 1)[0]); return; }
        const t = setTimeout(() => rej(new Error(`รอ ${type} ไม่ทัน`)), ms);
        waiters.push({ match, resolve: (m) => { clearTimeout(t); res(m); } });
      }),
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', async () => { await c.wait('connected'); resolve(c); });
    ws.once('error', reject);
  });
}

async function makeRoom(host, guest) {
  host.send('room:create', { level: 'A1', questionCount: 5 });
  const created = await host.wait('room:joined');
  guest.send('room:join', { code: created.code });
  await guest.wait('room:joined');
  return created.code;
}

test('battle: เริ่มเกมไม่ได้จนกว่าทุกคนจะกด "พร้อม"', async () => {
  const [hu, gu] = [await makeUser(), await makeUser()];
  const [h, g] = [await connect(hu), await connect(gu)];
  const code = await makeRoom(h, g);
  h.send('room:start');
  const err = await h.wait('room:error');
  assert.match(err.message, /พร้อม/);
  g.send('room:ready', { ready: true });
  await h.wait('room:state', (m) => m.players.find((p) => p.id === gu.id)?.ready === true);
  h.send('room:start');
  await h.wait('room:countdown');
  assert.ok(['countdown', 'preparing', 'playing'].includes(rooms._rooms.get(code).status));
  await Promise.all([h.close(), g.close()]);
});

test('battle: รีเฟรชในห้องรอ -> ยังอยู่ในห้อง และกลับเข้าห้องเดิมอัตโนมัติ (ไม่ต้องจำรหัส)', async () => {
  const [hu, gu] = [await makeUser(), await makeUser()];
  const [h, g] = [await connect(hu), await connect(gu)];
  const code = await makeRoom(h, g);
  await g.close();
  const seen = await h.wait('room:state', (m) => m.players.find((p) => p.id === gu.id)?.connected === false);
  assert.ok(seen.players.some((p) => p.id === gu.id), 'หลุดแล้วยังอยู่ในห้อง (เดิมโดนเตะทันที)');
  const g2 = await connect(gu); // เชื่อมต่อใหม่ = เหมือนรีเฟรชหน้า
  const resume = await g2.wait('room:resume');
  assert.strictEqual(resume.room.code, code);
  await h.wait('room:state', (m) => m.players.find((p) => p.id === gu.id)?.connected === true);
  await Promise.all([h.close(), g2.close()]);
});

test('battle: ปิดแท็บหนึ่งแต่ยังเปิดอีกแท็บ = ไม่ถือว่าหลุด', async () => {
  const [hu, gu] = [await makeUser(), await makeUser()];
  const [h, g] = [await connect(hu), await connect(gu)];
  const code = await makeRoom(h, g);
  const gTab2 = await connect(gu);
  await gTab2.close();
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(rooms._rooms.get(code).players.get(gu.id).connected, true);
  await Promise.all([h.close(), g.close()]);
});

test('battle: หลุดกลางเกมแล้วกลับมา ได้คำถามปัจจุบัน + เวลาที่เหลือ และคะแนนไม่หาย', async () => {
  const [hu, gu] = [await makeUser(), await makeUser()];
  const [h, g] = [await connect(hu), await connect(gu)];
  const code = await makeRoom(h, g);
  g.send('room:ready', { ready: true });
  await h.wait('room:state', (m) => m.players.find((p) => p.id === gu.id)?.ready === true);
  h.send('room:start');
  const q = await g.wait('room:question', () => true, 15000);
  const room = rooms._rooms.get(code);
  const correct = room.questions[q.index].correctIndex;
  g.send('room:answer', { index: correct }); // index = ตัวเลือกที่ตอบ
  await new Promise((r) => setTimeout(r, 300));
  const scoreBefore = room.players.get(gu.id).score;
  assert.ok(scoreBefore > 0);
  await g.close();
  const g2 = await connect(gu);
  const resume = await g2.wait('room:resume');
  assert.strictEqual(room.players.get(gu.id).score, scoreBefore, 'คะแนนต้องไม่หาย');
  if (resume.question) {
    assert.ok(resume.question.remainingMs <= resume.question.durationMs);
    assert.strictEqual(resume.question.correctIndex, undefined, 'ห้ามส่งเฉลยมากับคำถาม');
  }
  await Promise.all([h.close(), g2.close()]);
});

test('battle: host หลุดนาน -> โอนสิทธิ์ให้ผู้เล่นที่ยังเชื่อมต่อ', async () => {
  const [hu, gu] = [await makeUser(), await makeUser()];
  const [h, g] = [await connect(hu), await connect(gu)];
  const code = await makeRoom(h, g);
  const room = rooms._rooms.get(code);
  // จำลอง: host หลุดแล้วจบเกม (endGame เรียก ensureConnectedHost)
  await h.close();
  await g.wait('room:state', (m) => m.players.find((p) => p.id === hu.id)?.connected === false);
  room.questions = [{ correctIndex: 0 }];
  await rooms._endGame(room);
  assert.strictEqual(room.hostId, gu.id);
  await g.wait('room:host');
  await g.close();
});

test('battle: คะแนนเท่ากัน = อันดับเท่ากัน + EXP เท่ากัน (ผลเสมอ)', async () => {
  const [au, bu] = [await makeUser(), await makeUser()];
  const [a, b] = [await connect(au), await connect(bu)];
  const code = await makeRoom(a, b);
  const room = rooms._rooms.get(code);
  room.questions = [{ correctIndex: 0 }];
  room.players.forEach((p) => { p.score = 500; p.correctCount = 1; });
  const [ea, eb] = [a.wait('room:ended'), b.wait('room:ended')];
  await rooms._endGame(room);
  const [ra, rb] = await Promise.all([ea, eb]);
  assert.strictEqual(ra.draw, true);
  assert.deepStrictEqual(ra.ranking.map((r) => r.rank), [1, 1], 'เดิมได้ 1 กับ 2 ตามลำดับการเข้าห้อง');
  assert.strictEqual(ra.gainedExp, rb.gainedExp, 'EXP ต้องเท่ากัน');
  // หลังจบ = กลับห้องรอ (เล่นอีกรอบได้) และต้องกดพร้อมใหม่
  assert.strictEqual(room.status, 'lobby');
  assert.ok([...room.players.values()].every((p) => p.ready === false));
  await Promise.all([a.close(), b.close()]);
});

test('battle: เชิญได้เฉพาะเพื่อน และผู้ที่ถูกบล็อกเข้าห้องไม่ได้', async () => {
  const [hu, su] = [await makeUser(), await makeUser()];
  const [h, s] = [await connect(hu), await connect(su)];
  h.send('room:create', { level: 'A1', questionCount: 5 });
  const created = await h.wait('room:joined');
  // คนแปลกหน้า (ไม่ใช่เพื่อน) -> เชิญไม่ได้
  h.send('room:invite', { userId: su.id });
  const err = await h.wait('room:error');
  assert.match(err.message, /เพื่อน/);
  // บล็อกแล้ว -> เข้าห้องด้วยรหัสก็ไม่ได้
  await pool.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [hu.id, su.id]);
  s.send('room:join', { code: created.code });
  const denied = await s.wait('room:error');
  assert.match(denied.message, /ไม่สามารถเข้าห้อง/);
  assert.ok(!rooms._rooms.get(created.code).players.has(su.id));
  await Promise.all([h.close(), s.close()]);
});
