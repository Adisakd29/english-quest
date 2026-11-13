/*
  v1.16.0 นำ EnglishQuest World ออก + หน้าแรกแบบ Game Lobby
  - API World เดิมตอบ 410 (ไม่ใช่ 404 เงียบ / ไม่มีโค้ด World เหลือให้ทำงาน)
  - ตาราง/ข้อมูลเดิมยังอยู่ครบ (ไม่ DROP) · การกลั่นกรองแชทโลกย้ายมาที่ /api/moderation
  - GET /api/lobby: Level/EXP · Coin · แรงค์ · เควสต์ประจำวันจากกิจกรรมจริง · เพื่อนออนไลน์ · แชทโลกล่าสุด
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

test('World ถูกนำออก: ไฟล์ฝั่งเซิร์ฟเวอร์/หน้าเว็บ/แผนที่ไม่มีแล้ว · API เดิมตอบ 410 พร้อมข้อความ', async () => {
  for (const f of ['routes/world.js', 'services/world', 'config/world.js', 'public/js/world.js', 'public/js/world-physics.js', 'public/css/world.css', 'public/assets/world']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `ต้องไม่มี ${f}`);
  }
  const u = await makeUser('wr');
  for (const p of ['/api/world/config', '/api/world/rooms', '/api/admin/world/reports']) {
    const r = await req('GET', p, { token: u.token });
    assert.strictEqual(r.status, 410, p);
    assert.strictEqual(r.body.code, 'WORLD_REMOVED');
  }
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(!/world\.js|world-physics|world\.css|screen-world|data-nav-to="world"|EnglishQuest World/.test(html), 'หน้าเว็บไม่มีลิงก์/สคริปต์ World');
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  assert.ok(!/\/js\/world\.js|\/assets\/world/.test(sw), 'Service Worker ไม่แคชไฟล์ World');
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  assert.ok(!/EQWorld\b|'world:'/.test(app), 'ไม่มีการเรียกโมดูล World / ข้อความ world:');
});

test('แถบเมนูล่าง 6 เมนู: หน้าหลัก เรียน แกรมม่า แรงค์ เล่น โปรไฟล์ (ไม่มี World)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const nav = html.slice(html.indexOf('<nav id="bottom-nav"'), html.indexOf('</nav>', html.indexOf('<nav id="bottom-nav"')));
  assert.deepStrictEqual([...nav.matchAll(/data-nav="([^"]+)"/g)].map((m) => m[1]), ['home', 'learn', 'grammar', 'ranked', 'play', 'profile']);
  // Learn เข้าถึง Vocabulary/Grammar/TOEIC/Word Atlas ได้
  const learn = html.slice(html.indexOf('id="screen-path"'), html.indexOf('id="screen-path"') + 6000);
  for (const t of ['data-nav-to="grammar"', 'data-nav-to="toeic"', 'data-nav-to="atlas"', 'path-open-vocab']) assert.ok(learn.includes(t), t);
});

test('ตาราง World เดิมไม่ถูก DROP (ข้อมูลกลั่นกรอง/ตั้งค่ายังอยู่)', async () => {
  for (const t of ['world_restrictions', 'world_chat_log', 'world_mutes', 'user_world_settings', 'world_chat_messages']) {
    const r = await pool.query('SELECT 1 FROM information_schema.tables WHERE table_name = $1', [t]);
    assert.strictEqual(r.rowCount, 1, t);
  }
});

test('การกลั่นกรองแชท: ผู้ใช้เห็นการถูกจำกัดของตัวเอง + อุทธรณ์ได้ · หน้าผู้ดูแลต้องเป็น admin', async () => {
  const u = await makeUser('md'); const adm = await makeUser('ad');
  assert.strictEqual((await req('GET', '/api/admin/moderation/restrictions', { token: u.token })).status, 403);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  const r = await req('POST', '/api/admin/moderation/restrict', { token: adm.token, body: { userId: u.id, kind: 'chat', minutes: 30, reason: 'ทดสอบ' } });
  assert.strictEqual(r.status, 200);
  const mine = await req('GET', '/api/moderation/me/restrictions', { token: u.token });
  assert.strictEqual(mine.status, 200);
  const it = mine.body.restrictions.find((x) => x.kind === 'chat');
  assert.ok(it, 'เห็นรายการของตัวเอง');
  // ถูกจำกัด → ส่งแชทโลกไม่ได้
  C._rate.clear();
  const sent = await req('POST', '/api/world-chat', { token: u.token, body: { body: 'hello everyone' } });
  assert.notStrictEqual(sent.status, 200);
  const ap = await req('POST', `/api/moderation/restrictions/${it.id}/appeal`, { token: u.token, body: { text: 'ขออุทธรณ์ครับ ผมไม่ได้ตั้งใจ' } });
  assert.strictEqual(ap.status, 200);
  const pend = await req('GET', '/api/admin/moderation/restrictions?status=pending', { token: adm.token });
  assert.ok(pend.body.restrictions.some((x) => x.id === it.id));
  const rv = await req('POST', `/api/moderation/restrictions/${it.id}/appeal`, { token: adm.token, body: { text: 'ของคนอื่น' } });
  assert.strictEqual(rv.status, 400, 'อุทธรณ์ของคนอื่นไม่ได้ (userId จาก token)');
  assert.strictEqual((await req('POST', `/api/admin/moderation/restrictions/${it.id}/review`, { token: adm.token, body: { decision: 'lifted', note: 'ok' } })).status, 200);
});

test('GET /api/lobby: ต้องล็อกอิน · ค่าเริ่มต้นตรงกับข้อมูลจริง', async () => {
  assert.strictEqual((await req('GET', '/api/lobby')).status, 401);
  const u = await makeUser('lb');
  const r = await req('GET', '/api/lobby', { token: u.token });
  assert.strictEqual(r.status, 200);
  const d = r.body;
  assert.strictEqual(d.account.username, u.name);
  assert.strictEqual(d.account.level, 1);
  const w = (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0];
  assert.strictEqual(d.account.coins, w ? w.balance : 0, 'Coin ตรงกับกระเป๋าจริง');
  assert.ok(d.rank.vocab && d.rank.grammar, 'มีแรงค์ทั้งสองโหมด');
  assert.match(d.rank.vocab.badge, /^\/assets\/ranks\/[a-z-]+\/badge-96\.webp$/);
  assert.ok(fs.existsSync(path.join(ROOT, 'public', d.rank.vocab.badge)), 'ไฟล์ตราแรงค์มีจริง');
  assert.deepStrictEqual(d.quests.map((q) => q.id), ['answers', 'grammar', 'ranked']);
  assert.ok(d.quests.every((q) => q.progress === 0 && !q.done && !('reward' in q)), 'ไม่มีรางวัลแอบอ้าง');
  assert.deepStrictEqual(d.friends, { total: 0, online: 0 });
  assert.ok(d.chat && d.chat.enabled === true && Array.isArray(d.chat.recent));
  assert.ok(Array.isArray(d.events) && d.events.every((e) => !e.retired && ['active', 'upcoming'].includes(e.status)));
  assert.ok(!JSON.stringify(d).includes('@gmail.com'), 'ไม่มีอีเมลใน payload');
});

test('GET /api/lobby: เควสต์นับจากกิจกรรมจริงของวันนี้ · EXP/เลเวลจาก users.exp · เพื่อนออนไลน์จากการเชื่อมต่อจริง', async () => {
  const u = await makeUser('lq'); const f = await makeUser('lf');
  await pool.query('UPDATE users SET exp = 500 WHERE id = $1', [u.id]);
  for (let i = 0; i < 25; i++) {
    await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, $2, $3, true)", [u.id, i < 6 ? 'grammar' : 'vocab', `t${i}`]);
  }
  // ของเมื่อวาน (เวลาไทย) ไม่นับ
  await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct, created_at) VALUES ($1, 'grammar', 'old', true, NOW() - INTERVAL '2 days')", [u.id]);
  await pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [u.id, f.id]);
  const ws = new WebSocket(`${wsBase}/ws?token=${f.token}`);
  await new Promise((r) => ws.once('message', r));
  const d = (await req('GET', '/api/lobby', { token: u.token })).body;
  const q = Object.fromEntries(d.quests.map((x) => [x.id, x]));
  assert.strictEqual(q.answers.progress, 20); assert.ok(q.answers.done);
  assert.strictEqual(q.grammar.progress, 5); assert.ok(q.grammar.done);
  assert.strictEqual(q.ranked.progress, 0); assert.ok(!q.ranked.done);
  const { getLevelInfo } = require('../utils/leveling');
  assert.strictEqual(d.account.level, getLevelInfo(500).level);
  assert.strictEqual(d.account.exp, 500);
  assert.deepStrictEqual(d.friends, { total: 1, online: 1 });
  ws.close();
  // EXP/คะแนนไม่ถูกแก้โดยการเปิด Lobby
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp, 500);
});

test('GET /api/lobby: แชทโลกล่าสุด 3 ข้อความ (escape ฝั่งหน้าเว็บ · ซ่อนเมื่อปิดแชท)', async () => {
  C._rate.clear();
  const a = await makeUser('lc'); const b = await makeUser('ld');
  for (const t of ['one msg', 'two msg', 'three msg', '<b>four</b> msg']) { C._rate.clear(); await req('POST', '/api/world-chat', { token: a.token, body: { body: t } }); }
  const d = (await req('GET', '/api/lobby', { token: b.token })).body;
  assert.strictEqual(d.chat.recent.length, 3);
  assert.strictEqual(d.chat.recent[2].body, '<b>four</b> msg', 'ส่งข้อความดิบ (หน้าเว็บ escape เอง)');
  assert.ok(d.chat.recent.every((m) => Object.keys(m).sort().join() === 'at,body,id,mine,username'), 'เฉพาะข้อมูลที่จำเป็น');
  await req('PUT', '/api/world-chat/settings', { token: b.token, body: { enabled: false } });
  const off = (await req('GET', '/api/lobby', { token: b.token })).body;
  assert.strictEqual(off.chat.enabled, false); assert.strictEqual(off.chat.recent.length, 0);
});

test('หน้า Lobby (ไฟล์หน้าเว็บ): escape ข้อความผู้ใช้ · ไม่มีการเดิน/ตำแหน่ง', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/lobby.js'), 'utf8');
  // v1.17.0: แชทโลกย้ายไปอยู่ worldchat.js (แชทย่อ + แผงเต็ม) — ข้อความ/ชื่อผู้ใช้ต้องผ่าน esc() ทุกจุด
  const chat = fs.readFileSync(path.join(ROOT, 'public/js/worldchat.js'), 'utf8');
  assert.ok(/esc\(m\.body\)/.test(chat) && /esc\(m\.user\.username\)/.test(chat));
  assert.ok(!/gchat|m\.body/.test(js), 'lobby.js ไม่ render ข้อความแชทเองแล้ว');
  assert.ok(!/position|joystick|world:move|rt\.send/i.test(js.replace(/setProperty|--p/g, '')), 'ไม่มีการซิงก์ตำแหน่ง');
});
