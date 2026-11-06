/*
  v1.17.0 Event Carousel — กิจกรรมจริงจากตาราง events (ระบบเดิม + Ranked Season + ภารกิจประจำวัน + กิจกรรมที่ผู้ดูแลสร้าง)
  สถานะตามเวลาเซิร์ฟเวอร์ · ลำดับ Featured/Ongoing/Upcoming/Daily + priority · รับรางวัลตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ ครั้งเดียว · ผู้ดูแลจัดการได้
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

const CAR = require('../services/eventCarousel');
const T = (iso) => () => new Date(iso).getTime();
async function makeAdmin() { const a = await makeUser('ea'); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.id]); return a; }
const ids = (list) => list.map((e) => e.id);
test.afterEach(() => CAR._setNow(null));

test('carousel: ต้องล็อกอิน · /api/lobby มี carousel · ข้อมูลครบทุกช่องที่สไลด์ใช้', async () => {
  assert.strictEqual((await req('GET', '/api/lobby/events')).status, 401);
  const u = await makeUser('ec');
  const r = await req('GET', '/api/lobby/events', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.timezone, 'Asia/Bangkok');
  const daily = r.body.events.find((e) => e.id === 'daily-quest');
  assert.ok(daily, 'มีภารกิจประจำวัน (ข้อมูลจริงจากเป้าหมายรายวัน)');
  for (const e of r.body.events) {
    for (const k of ['id', 'title', 'typeLabel', 'status', 'startsAt', 'endsAt', 'banner', 'rewards', 'cta']) assert.ok(e[k] !== undefined, `${e.id}.${k}`);
    assert.ok(['upcoming', 'ongoing', 'completed'].includes(e.status), `${e.id} ไม่แสดงสถานะ expired`);
    assert.match(e.banner.desktop, /^\/(assets\/events\/banners\/[a-z-]+-1280\.webp|api\/avatar\/asset\/)/);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', e.banner.fallback)), 'ภาพสำรองมีอยู่จริง');
  }
  const lobby = await req('GET', '/api/lobby', { token: u.token });
  assert.deepStrictEqual(ids(lobby.body.carousel), ids(r.body.events));
});

test('carousel: สถานะคิดจากเวลาเซิร์ฟเวอร์ · หมดเวลาไม่แสดง · Halloween ที่จบแล้ว/เลิกแสดงไม่ขึ้นเป็น Ongoing', async () => {
  const u = await makeUser('es');
  CAR._setNow(T('2026-11-10T12:00:00+07:00'));
  let l = (await req('GET', '/api/lobby/events', { token: u.token })).body.events;
  const by = Object.fromEntries(l.map((e) => [e.id, e]));
  assert.strictEqual(by['loykrathong-adventure-2026'].status, 'ongoing');
  assert.strictEqual(by['loykrathong-2026'].status, 'upcoming');
  assert.strictEqual(by['loykrathong-2026'].cta.kind, 'details', 'Upcoming → ดูรายละเอียด');
  assert.strictEqual(by['loykrathong-adventure-2026'].cta.nav, 'event', 'กิจกรรมผจญภัยไปหน้า event');
  assert.ok(!l.some((e) => /halloween/.test(e.id)), 'Halloween จบแล้ว ไม่แสดง');
  CAR._setNow(T('2026-10-28T12:00:00+07:00'));
  l = (await req('GET', '/api/lobby/events', { token: u.token })).body.events;
  assert.ok(!l.some((e) => /halloween/.test(e.id)), 'กิจกรรมที่ตั้ง retired ไม่แสดงแม้อยู่ในช่วงเวลา');
  CAR._setNow(T('2026-11-26T00:00:01+07:00'));
  l = (await req('GET', '/api/lobby/events', { token: u.token })).body.events;
  assert.ok(!l.some((e) => /loykrathong/.test(e.id)), 'ลอยกระทงหมดเวลาแล้ว ไม่แสดง');
  assert.strictEqual(CAR.statusAt(10, 20, 20), 'expired', 'เวลาสิ้นสุดเป็น exclusive');
  assert.strictEqual(CAR.statusAt(10, 20, 10), 'ongoing');
});

test('carousel ผู้ดูแล: ต้องเป็น admin (ตรวจฝั่งเซิร์ฟเวอร์) · ตรวจค่าที่ส่งมา · กิจกรรมระบบแก้ได้เฉพาะการแสดงผล', async () => {
  const u = await makeUser('en'); const a = await makeAdmin();
  assert.strictEqual((await req('GET', '/api/admin/event-carousel', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', '/api/admin/event-carousel', { token: u.token, body: { title: 'x' } })).status, 403);
  const list = await req('GET', '/api/admin/event-carousel', { token: a.token });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.events.some((e) => /halloween/.test(e.id) && e.status === 'expired'), 'ผู้ดูแลเห็นกิจกรรมที่หมดเวลา');
  const now = Date.now();
  const good = { title: 'Vocabulary Sprint', type: 'vocab', route: 'learn', startsAt: new Date(now - 3600e3).toISOString(), endsAt: new Date(now + 86400e3).toISOString() };
  for (const [bad, code] of [[{ ...good, route: 'https://evil.example' }, 'BAD_ROUTE'], [{ ...good, type: 'adventure' }, 'BAD_TYPE'], [{ ...good, endsAt: good.startsAt }, 'BAD_DATES'],
    [{ ...good, reward: { coins: 99999 } }, 'BAD_REWARD'], [{ ...good, reward: { items: ['no_such_item'] } }, 'BAD_REWARD'], [{ ...good, bannerDesktop: 'https://cdn.example/x.webp' }, 'BAD_BANNER'],
    [{ ...good, eligibility: { type: 'correct_answers', target: 0 } }, 'BAD_RULE'], [{ ...good, title: '   ' }, 'BAD_TITLE']]) {
    const r = await req('POST', '/api/admin/event-carousel', { token: a.token, body: bad });
    assert.strictEqual(r.status, 400, code); assert.strictEqual(r.body.code, code);
  }
  const sys = await req('PUT', '/api/admin/event-carousel/loykrathong-2026', { token: a.token, body: { endsAt: new Date().toISOString() } });
  assert.strictEqual(sys.status, 400); assert.strictEqual(sys.body.code, 'SYSTEM_FIELDS');
  const ok = await req('PUT', '/api/admin/event-carousel/loykrathong-2026', { token: a.token, body: { priority: 5, description: 'ทดสอบ <b>คำอธิบาย</b>' } });
  assert.strictEqual(ok.status, 200);
  assert.ok(!/[<>]/.test(ok.body.event.description), 'ตัด < > ออกจากข้อความ');
  await req('PUT', '/api/admin/event-carousel/loykrathong-2026', { token: a.token, body: { priority: 0, description: '' } });
});

test('carousel: ลำดับ Featured → Ongoing → Upcoming → Daily · ผู้ดูแลเปลี่ยน priority แล้วลำดับเปลี่ยนจริง · ซ่อนแล้วไม่แสดง', async () => {
  const a = await makeAdmin(); const u = await makeUser('eo');
  const now = Date.now();
  const mk = async (title, extra = {}) => (await req('POST', '/api/admin/event-carousel', { token: a.token, body: { title, type: 'grammar', route: 'grammar', visibility: 'published',
    startsAt: new Date(now - 3600e3).toISOString(), endsAt: new Date(now + 5 * 86400e3).toISOString(), ...extra } })).body.event.id;
  const e1 = await mk('Order A', { priority: 1 }); const e2 = await mk('Order B', { priority: 2 });
  const up = await mk('Order Upcoming', { startsAt: new Date(now + 86400e3).toISOString(), endsAt: new Date(now + 3 * 86400e3).toISOString(), priority: 999 });
  const pos = async () => { const l = ids((await req('GET', '/api/lobby/events', { token: u.token })).body.events); return (x) => l.indexOf(x); };
  let p = await pos();
  assert.ok(p(e2) < p(e1), 'priority สูงกว่าขึ้นก่อน');
  assert.ok(p(e1) < p(up), 'Ongoing ก่อน Upcoming แม้ Upcoming priority สูงกว่า');
  assert.ok(p(up) < p('daily-quest'), 'Upcoming ก่อน Daily');
  await req('PUT', `/api/admin/event-carousel/${e1}`, { token: a.token, body: { priority: 50 } });
  p = await pos(); assert.ok(p(e1) < p(e2), 'แก้ priority แล้วลำดับเปลี่ยน');
  await req('PUT', `/api/admin/event-carousel/${up}`, { token: a.token, body: { featured: true } });
  p = await pos(); assert.strictEqual(p(up), 0, 'Featured ขึ้นแรกสุด');
  const again = ids((await req('GET', '/api/lobby/events', { token: u.token })).body.events);
  assert.deepStrictEqual(again, ids((await req('GET', '/api/lobby/events', { token: u.token })).body.events), 'ลำดับคงที่ทุกครั้ง (ไม่สุ่ม)');
  for (const id of [e1, e2, up]) await req('PUT', `/api/admin/event-carousel/${id}`, { token: a.token, body: { visibility: 'hidden', featured: false } });
  p = await pos(); assert.strictEqual(p(e1), -1, 'ซ่อนแล้วไม่แสดง');
});

test('carousel รับรางวัล: ตรวจเงื่อนไขจากข้อมูลจริง · ครั้งเดียว · Coin/EXP/ของ บันทึกถูกต้อง · หมดเวลา/ยังไม่เริ่ม รับไม่ได้ · ล็อกแก้รางวัลหลังมีคนรับ', async () => {
  const a = await makeAdmin(); const u = await makeUser('er');
  const now = Date.now();
  const item = (await pool.query("SELECT id FROM avatar_items WHERE is_active AND category = 'hat' ORDER BY id LIMIT 1")).rows[0].id;
  const r = await req('POST', '/api/admin/event-carousel', { token: a.token, body: { title: 'Grammar Challenge', type: 'grammar', route: 'grammar', visibility: 'published',
    startsAt: new Date(now - 3600e3).toISOString(), endsAt: new Date(now + 86400e3).toISOString(),
    eligibility: { type: 'correct_answers', skill: 'grammar', target: 3 }, reward: { coins: 25, exp: 15, items: [item] } } });
  assert.strictEqual(r.status, 200);
  const id = r.body.event.id;
  let slide = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === id);
  assert.strictEqual(slide.cta.kind, 'nav'); assert.strictEqual(slide.rewards.coins, 25); assert.strictEqual(slide.rewards.items[0].id, item);
  assert.strictEqual((await req('POST', `/api/lobby/events/${id}/claim`, { token: u.token })).body.code, 'NOT_ELIGIBLE');
  await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct, created_at) VALUES ($1, 'grammar', 'g1', true, NOW() - INTERVAL '2 hours')", [u.id]);   // ก่อนเริ่มกิจกรรม → ไม่นับ
  for (let i = 0; i < 3; i++) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, $2, $3, $4)", [u.id, i ? 'grammar' : 'vocab', `x${i}`, true]);
  await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, 'grammar', 'w', false)", [u.id]);
  slide = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === id);
  assert.strictEqual(slide.progress.value, 2, 'นับเฉพาะตอบถูก ทักษะที่กำหนด ในช่วงกิจกรรม');
  await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, 'grammar', 'x9', true)", [u.id]);
  slide = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === id);
  assert.strictEqual(slide.cta.kind, 'claim'); assert.strictEqual(slide.canClaim, true);
  const exp0 = (await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp;
  const bal0 = (await req('GET', '/api/avatar/me', { token: u.token })).body.wallet.balance;   // สร้างกระเป๋า (ของขวัญต้อนรับ) ก่อน
  const results = await Promise.all([1, 2, 3].map(() => req('POST', `/api/lobby/events/${id}/claim`, { token: u.token })));
  assert.strictEqual(results.filter((x) => x.status === 200).length, 1, 'ส่งพร้อมกันหลายครั้ง รับได้ครั้งเดียว');
  assert.ok(results.filter((x) => x.status !== 200).every((x) => x.status === 409));
  assert.strictEqual((await req('POST', `/api/lobby/events/${id}/claim`, { token: u.token })).status, 409);
  assert.strictEqual((await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0].balance, bal0 + 25);
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp, exp0 + 15);
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND source_key = $2", [u.id, `evr:${id}`])).rows[0].n, 1, 'มีรายการ Coin บันทึก 1 รายการ');
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM exp_log WHERE user_id = $1 AND reason = $2", [u.id, `event:${id}`.slice(0, 40)])).rows[0].n, 1, 'มีบันทึก EXP');
  assert.ok((await pool.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [u.id, item])).rows[0], 'ได้ของ');
  slide = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === id);
  assert.strictEqual(slide.status, 'completed'); assert.strictEqual(slide.claimed, true);
  const lock = await req('PUT', `/api/admin/event-carousel/${id}`, { token: a.token, body: { reward: { coins: 500 } } });
  assert.strictEqual(lock.status, 409); assert.strictEqual(lock.body.code, 'LOCKED');
  // หมดเวลา: รับเพิ่มไม่ได้ · ของที่ได้ไปแล้วยังอยู่
  const u2 = await makeUser('er2');
  for (let i = 0; i < 3; i++) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, 'grammar', $2, true)", [u2.id, `y${i}`]);
  CAR._setNow(() => now + 2 * 86400e3);
  const late = await req('POST', `/api/lobby/events/${id}/claim`, { token: u2.token });
  assert.strictEqual(late.status, 403); assert.strictEqual(late.body.code, 'EVENT_ENDED');
  assert.ok((await pool.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [u.id, item])).rows[0], 'รางวัลที่เคยได้ไม่หายหลังกิจกรรมจบ');
  CAR._setNow(() => now - 2 * 86400e3);
  assert.strictEqual((await req('POST', `/api/lobby/events/${id}/claim`, { token: u2.token })).body.code, 'EVENT_NOT_STARTED');
  CAR._setNow(null);
  assert.strictEqual((await req('POST', '/api/lobby/events/loykrathong-2026/claim', { token: u.token })).status, 404, 'กิจกรรมระบบรับรางวัลในหน้ากิจกรรมเดิม');
  await req('PUT', `/api/admin/event-carousel/${id}`, { token: a.token, body: { visibility: 'hidden' } });
});

test('carousel ภารกิจประจำวัน: completed เมื่อได้ Coin เป้าหมายรายวันของวันนี้ (ข้อมูลจริง)', async () => {
  const u = await makeUser('ed');
  let d = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === 'daily-quest');
  assert.strictEqual(d.status, 'ongoing'); assert.strictEqual(d.cta.nav, 'learn'); assert.ok(d.rewards.coins > 0);
  const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const coins = require('../services/coins');
  await coins.grant(u.id, { type: 'DAILY_GOAL', key: `goal:${day}`, sourceId: day });
  d = (await req('GET', '/api/lobby/events', { token: u.token })).body.events.find((e) => e.id === 'daily-quest');
  assert.strictEqual(d.status, 'completed');
});

test('carousel อัปโหลดแบนเนอร์: เฉพาะผู้ดูแล · PNG/WebP จริงเท่านั้น', async () => {
  const a = await makeAdmin(); const u = await makeUser('eu');
  const png = fs.readFileSync(path.join(ROOT, 'public/assets/events/banners/daily-640.webp'));
  const dataUrl = `data:image/webp;base64,${png.toString('base64')}`;
  assert.strictEqual((await req('POST', '/api/admin/event-carousel/upload', { token: u.token, body: { dataUrl } })).status, 403);
  const ok = await req('POST', '/api/admin/event-carousel/upload', { token: a.token, body: { dataUrl } });
  assert.strictEqual(ok.status, 200); assert.match(ok.body.url, /^\/api\/avatar\/asset\/u[0-9a-f]{20}\.webp$/);
  const fake = await req('POST', '/api/admin/event-carousel/upload', { token: a.token, body: { dataUrl: `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}` } });
  assert.strictEqual(fake.status, 400);
});

test('carousel หน้าเว็บ: ปุ่ม/จุด/หยุด-เล่น/คำอธิบายเป็น HTML · ข้อความผ่าน esc · ไม่มี World', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/eventcarousel.js'), 'utf8');
  for (const k of ['evc-prev', 'evc-next', 'evc-pdot', 'evc-play', 'aria-roledescription="slide"', 'prefers-reduced-motion', 'visibilitychange', 'esc(s.title)', 'esc(s.description)']) assert.ok(js.includes(k), k);
  const mig = fs.readFileSync(path.join(ROOT, 'migrations/072_event_carousel.sql'), 'utf8').replace(/--.*$/gm, '');
  assert.ok(!/\bDROP\b|DELETE FROM|TRUNCATE/i.test(mig), 'migration เพิ่มอย่างเดียว');
});
