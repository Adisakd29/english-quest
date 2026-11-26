/*
  v1.17.0 แชทโลกบน Game Lobby — ต่อยอดระบบแชทโลกเดิม
  Quick Chat ผ่านระบบส่งเดียวกัน · Quick Chat เท่านั้น (ตั้งเอง/ผู้ดูแลจำกัดการพิมพ์) · cid กันส่งซ้ำ · ?after= ข้อความที่พลาด
  การตั้งค่าแชทบันทึกต่อบัญชี · LISTEN/NOTIFY ส่งต่อข้ามเครื่องเซิร์ฟเวอร์ · ข้อมูลที่ส่งออกจำกัดเฉพาะที่จำเป็น
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

const mod = require('../services/moderation/chat');
const fresh = () => C._rate.clear();

test('Quick Chat: ส่งผ่าน POST เดียวกับข้อความพิมพ์ · ได้ข้อความสำเร็จรูปตรงตัว · รายการมาจากเซิร์ฟเวอร์', async () => {
  fresh();
  const a = await makeUser('qa');
  const h = (await req('GET', '/api/world-chat', { token: a.token })).body;
  assert.ok(h.quick.length >= 6 && h.quick.some((q) => q.text === "Let's learn English!"));
  assert.deepStrictEqual(Object.keys(h.prefs).sort(), ['enabled', 'mini', 'notify', 'quickOnly', 'sound']);
  assert.deepStrictEqual(h.prefs, { enabled: true, mini: true, sound: false, notify: true, quickOnly: false }, 'ค่าเริ่มต้นแบบปลอดภัย');
  const r = await req('POST', '/api/world-chat', { token: a.token, body: { quick: 'learn', cid: 'cidquick0001' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.message.body, "Let's learn English!"); assert.strictEqual(r.body.message.quick, 'learn');
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { quick: 'not-a-phrase' } })).status, 400);
});

test('Quick Chat เท่านั้น (ตั้งเอง): พิมพ์เองไม่ได้ แต่ Quick Chat ได้ · บันทึกการตั้งค่าต่อบัญชี', async () => {
  fresh();
  const a = await makeUser('qo');
  const s = await req('PUT', '/api/world-chat/settings', { token: a.token, body: { quickOnly: true, sound: true, mini: false } });
  assert.strictEqual(s.status, 200);
  assert.deepStrictEqual(s.body, { enabled: true, mini: false, sound: true, notify: true, quickOnly: true });
  const h = (await req('GET', '/api/world-chat', { token: a.token })).body;
  assert.strictEqual(h.me.quickOnly, true); assert.strictEqual(h.prefs.mini, false);
  const t = await req('POST', '/api/world-chat', { token: a.token, body: { body: 'hello everyone' } });
  assert.strictEqual(t.status, 403); assert.strictEqual(t.body.code, 'QUICK_ONLY');
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { quick: 'hello' } })).status, 200);
  assert.strictEqual((await req('PUT', '/api/world-chat/settings', { token: a.token, body: { nothing: 1 } })).status, 400);
  assert.strictEqual((await req('PUT', '/api/world-chat/settings', { token: a.token, body: { enabled: false } })).body.enabled, false, 'API เดิม { enabled } ยังใช้ได้');
});

test('ผู้ดูแลจำกัดการพิมพ์ (text) = ส่งได้เฉพาะ Quick Chat · ปิดแชท (chat) = ส่งไม่ได้เลย', async () => {
  fresh();
  const a = await makeUser('qr'); const b = await makeUser('qs');
  await mod.restrict(a.id, 'text', 30, 'ทดสอบ');
  let h = (await req('GET', '/api/world-chat', { token: a.token })).body;
  assert.strictEqual(h.me.canPost, true); assert.strictEqual(h.me.quickOnly, true); assert.strictEqual(h.me.quickForced, true);
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { body: 'free text' } })).body.code, 'QUICK_ONLY');
  assert.strictEqual((await req('POST', '/api/world-chat', { token: a.token, body: { quick: 'gg' } })).status, 200);
  await mod.restrict(b.id, 'chat', 30, 'ทดสอบ');
  h = (await req('GET', '/api/world-chat', { token: b.token })).body;
  assert.strictEqual(h.me.canPost, false);
  assert.strictEqual((await req('POST', '/api/world-chat', { token: b.token, body: { quick: 'hello' } })).body.code, 'RESTRICTED');
});

test('cid: ส่งซ้ำ (เน็ตหลุดแล้วลองใหม่) ได้ข้อความเดิม ไม่เกิดข้อความซ้ำ — แม้ส่งพร้อมกัน', async () => {
  fresh();
  const a = await makeUser('qc');
  const body = { body: `retry test ${Date.now() % 1e5}`, cid: `cid${Date.now()}x` };
  const rs = await Promise.all([1, 2, 3].map(() => req('POST', '/api/world-chat', { token: a.token, body })));
  const okIds = rs.filter((r) => r.status === 200).map((r) => r.body.message.id);
  assert.ok(okIds.length >= 1);
  assert.strictEqual(new Set(okIds).size, 1, 'ทุกคำขอที่สำเร็จได้รหัสข้อความเดียวกัน');
  fresh();
  const again = await req('POST', '/api/world-chat', { token: a.token, body });
  assert.strictEqual(again.status, 200); assert.strictEqual(again.body.duplicate, true); assert.strictEqual(again.body.message.id, okIds[0]);
  const n = (await pool.query('SELECT COUNT(*)::int AS n FROM world_chat_messages WHERE user_id = $1 AND client_id = $2', [a.id, body.cid])).rows[0].n;
  assert.strictEqual(n, 1);
});

test('?after= คืนเฉพาะข้อความที่ใหม่กว่า (เรียงเก่า→ใหม่) · ซ่อนคนที่บล็อก/ปิดเสียง', async () => {
  fresh();
  const a = await makeUser('qx'); const b = await makeUser('qy'); const c = await makeUser('qz');
  const m0 = (await req('POST', '/api/world-chat', { token: a.token, body: { body: `before gap ${Date.now() % 1e5}` } })).body.message.id;
  fresh(); const m1 = (await req('POST', '/api/world-chat', { token: b.token, body: { body: `missed one ${Date.now() % 1e5}` } })).body.message.id;
  fresh(); const m2 = (await req('POST', '/api/world-chat', { token: c.token, body: { body: `missed two ${Date.now() % 1e5}` } })).body.message.id;
  await req('POST', `/api/friends/block/${c.id}`, { token: a.token, body: {} });
  const r = (await req('GET', `/api/world-chat?after=${m0}`, { token: a.token })).body;
  const got = r.messages.map((m) => m.id);
  assert.ok(got.includes(m1) && !got.includes(m0) && !got.includes(m2), 'ได้ข้อความที่พลาด ไม่รวมของคนที่บล็อก');
  assert.deepStrictEqual(got, [...got].sort((x, y) => x - y));
});

test('Real-time: B เห็นข้อความของ A ทันที (WebSocket) · บล็อกแล้วไม่ได้รับ · payload ไม่มีข้อมูลส่วนตัว', async () => {
  fresh();
  const a = await makeUser('ra'); const b = await makeUser('rb'); const c = await makeUser('rc');
  const wb = await connect(b); const wc = await connect(c);
  await req('POST', `/api/friends/block/${a.id}`, { token: c.token, body: {} });
  const text = `realtime hi ${Date.now() % 1e5}`;
  await req('POST', '/api/world-chat', { token: a.token, body: { body: text } });
  const got = await wb.next('gchat:msg');
  assert.strictEqual(got.body, text);
  assert.deepStrictEqual(Object.keys(got.user).sort(), ['avatar', 'avatarImage', 'id', 'level', 'username']);
  assert.ok(!JSON.stringify(got).includes('@gmail.com'));
  await assert.rejects(wc.next('gchat:msg', 800), /timeout/, 'คนที่บล็อกผู้ส่งไม่ได้รับ');
  await wb.close(); await wc.close();
});

test('ข้ามเครื่องเซิร์ฟเวอร์: ข้อความจากเครื่องอื่น (pg NOTIFY) ส่งถึงผู้ใช้ในเครื่องนี้ · ข้อความของเครื่องนี้ถูกประกาศออกไป', async () => {
  fresh();
  await C.initBus();
  for (let i = 0; i < 20 && !C._bus.ready; i++) await sleep(100);
  assert.ok(C._bus.ready, 'ฟังช่อง eq_gchat แล้ว');
  const a = await makeUser('ma'); const b = await makeUser('mb');
  const wb = await connect(b);
  const payload = { o: 'other-instance', t: 'gchat:msg', s: a.id, p: { id: 987654321, user: { id: a.id, username: a.name, avatar: 'fox', avatarImage: null, level: 1 }, body: 'from another server', at: new Date().toISOString() } };
  await pool.query('SELECT pg_notify($1, $2)', ['eq_gchat', JSON.stringify(payload)]);
  const got = await wb.next('gchat:msg');
  assert.strictEqual(got.body, 'from another server');
  // ข้อความที่ส่งจากเครื่องนี้ → ประกาศให้เครื่องอื่น (ตรวจด้วยตัวฟังแยก)
  const lis = await pool.connect(); const heard = [];
  lis.on('notification', (n) => heard.push(JSON.parse(n.payload)));
  await lis.query('LISTEN eq_gchat');
  fresh(); await req('POST', '/api/world-chat', { token: a.token, body: { body: 'broadcast me' } });
  for (let i = 0; i < 20 && !heard.some((x) => x.p && x.p.body === 'broadcast me'); i++) await sleep(100);
  assert.ok(heard.some((x) => x.t === 'gchat:msg' && x.p.body === 'broadcast me' && x.o !== 'other-instance'));
  await lis.query('UNLISTEN eq_gchat'); lis.release();
  C.stopBus();
  await wb.close();
});

test('หน้าเว็บ: ไม่มีหน้าแชทโลกแยก/การ์ดในหน้าเล่น · แชทย่ออยู่ในหน้าแรก · ข้อความผ่าน esc', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(!html.includes('play-gchat-entry') && !html.includes('id="screen-gchat"'), 'เอาเมนูแชทโลกในหน้าเล่นออกแล้ว');
  const g = html.indexOf('id="gcm"');
  assert.ok(g > html.indexOf('id="home-lobby"') && g < html.indexOf('id="screen-path"'), 'แชทย่ออยู่ใน Lobby หน้าแรก');
  const js = fs.readFileSync(path.join(ROOT, 'public/js/worldchat.js'), 'utf8');
  assert.ok(/esc\(m\.body\)/.test(js) && /esc\(m\.user\.username\)/.test(js));
  assert.ok(!/innerHTML\s*=\s*m\.body/.test(js));
  const mig = fs.readFileSync(path.join(ROOT, 'migrations/073_global_chat_lobby.sql'), 'utf8').replace(/--.*$/gm, '');
  assert.ok(!/\bDROP\b|DELETE FROM|TRUNCATE/i.test(mig));
});
