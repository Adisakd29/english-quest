/*
  v1.18.0 Learning Streak — นับจากคำตอบจริง (≥ 20 ข้อ/วัน เวลาไทย) · Streak Freeze ซื้อด้วย Coin (ใช้อัตโนมัติ, ซ่อมย้อนหลังไม่ได้)
  Milestone ได้ Coin + EXP + ตรา ครั้งเดียวต่อระดับ · userId จาก token เท่านั้น
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const S = require('../services/streak');
const CFG = require('../config/streak');

let server; let base;
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
async function makeUser(prefix = 'sk') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const TODAY = '2026-11-20';
/** n คำตอบในวัน d (เที่ยงเวลาไทย) */
async function answers(userId, d, n) {
  await pool.query(
    `INSERT INTO answer_events (user_id, skill, item_id, level, correct, created_at)
     SELECT $1, 'vocab', 'w' || g, 'A1', TRUE, ($2::date + TIME '12:00') AT TIME ZONE 'Asia/Bangkok' FROM generate_series(1, $3) g`, [userId, d, n]);
}
const setBal = (uid, n) => pool.query('INSERT INTO coin_wallets (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET balance = $2', [uid, n]);
const coinsOf = async (uid, type) => (await pool.query('SELECT COALESCE(SUM(amount),0)::int AS s, COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = $2', [uid, type])).rows[0];

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  S._setNow(() => Date.parse(`${TODAY}T10:00:00Z`));   // 17:00 เวลาไทย
});
test.after(async () => { S._setNow(null); server.close(); await pool.end(); });

test('นับวันจากคำตอบจริง: ≥ 20 ข้อ = 1 วัน · 19 ข้อไม่นับ · ยังไม่ทำวันนี้ = เสี่ยงขาดแต่ยังไม่ขาด', async () => {
  const u = await makeUser();
  for (let i = 5; i >= 1; i -= 1) await answers(u.id, add(TODAY, -i), 20);
  await answers(u.id, add(TODAY, -6), 19);
  const s = await S.status(u.id);
  assert.strictEqual(s.current, 5);
  assert.strictEqual(s.doneToday, false);
  assert.strictEqual(s.atRisk, true);
  assert.strictEqual(s.calendar.length, CFG.CALENDAR_DAYS);
  assert.strictEqual(s.calendar.find((c) => c.day === add(TODAY, -6)).kind, null, '19 ข้อไม่นับ');
  await answers(u.id, TODAY, 20);
  const s2 = await S.status(u.id);
  assert.strictEqual(s2.current, 6); assert.strictEqual(s2.doneToday, true); assert.strictEqual(s2.atRisk, false);
  assert.strictEqual(s2.best, 6);
});

test('Milestone 3 วัน: Coin + EXP + ตรา ครั้งเดียว (เรียกซ้ำ/พร้อมกันไม่ได้ซ้ำ)', async () => {
  const u = await makeUser();
  for (let i = 2; i >= 0; i -= 1) await answers(u.id, add(TODAY, -i), 20);
  const exp0 = (await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp;
  const [a, b] = await Promise.all([S.status(u.id), S.status(u.id)]);
  await S.status(u.id);
  const c = await coinsOf(u.id, 'STREAK_MILESTONE');
  assert.deepStrictEqual([c.n, c.s], [1, 15]);
  const exp1 = (await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp;
  assert.strictEqual(exp1 - exp0, 30);
  const last = await S.status(u.id);
  assert.strictEqual(last.badge.days, 3);
  assert.ok(last.milestones.find((m) => m.days === 3).reached && !last.milestones.find((m) => m.days === 7).reached);
  assert.strictEqual(last.next.days, 7); assert.strictEqual(last.next.remaining, 4);
  assert.deepStrictEqual(last.celebrate.map((m) => m.days), [3]);
  await S.markSeen(u.id);
  assert.deepStrictEqual((await S.status(u.id)).celebrate, []);
  assert.ok(a.current === 3 && b.current === 3);
});

test('Streak Freeze: ขาด 1 วันแต่มี Freeze ที่ซื้อไว้ก่อน → ไม่ขาด (วันนั้นไม่บวกจำนวน) และใช้ Freeze ไป 1', async () => {
  const u = await makeUser();
  await setBal(u.id, 500);
  await answers(u.id, add(TODAY, -4), 20); await answers(u.id, add(TODAY, -3), 20);
  const buy = await req('POST', '/api/streak/freeze', { token: u.token, body: { price: 0 } });
  assert.strictEqual(buy.status, 200); assert.strictEqual(buy.body.balance, 450, 'ราคาจากเซิร์ฟเวอร์ ไม่ใช่จาก body');
  await pool.query("UPDATE streak_freezes SET acquired_at = ($2::date + TIME '09:00') AT TIME ZONE 'Asia/Bangkok' WHERE user_id = $1", [u.id, add(TODAY, -4)]);
  // ขาด -2 · ทำ -1
  await answers(u.id, add(TODAY, -1), 25);
  const s = await S.status(u.id);
  assert.strictEqual(s.current, 3, '3 วันที่ทำจริง (วัน Freeze เชื่อมไว้)');
  assert.strictEqual(s.calendar.find((c) => c.day === add(TODAY, -2)).kind, 'freeze');
  assert.strictEqual(s.freezes.held, 0);
});

test('Freeze ที่ซื้อหลังวันที่ขาด ซ่อมย้อนหลังไม่ได้ · ขาดเกินจำนวน Freeze = ขาด และ Freeze ยังอยู่', async () => {
  const u = await makeUser();
  await answers(u.id, add(TODAY, -5), 20); await answers(u.id, add(TODAY, -4), 20);
  await req('GET', '/api/streak', { token: u.token });
  // (เดิม sync ไปแล้ว → วันนี้ไม่ใช่วันขาด) ขาด -3..-1 = 3 วัน
  await setBal(u.id, 500);
  assert.strictEqual((await req('POST', '/api/streak/freeze', { token: u.token })).status, 200);
  assert.strictEqual((await req('POST', '/api/streak/freeze', { token: u.token })).status, 200);
  const third = await req('POST', '/api/streak/freeze', { token: u.token });
  assert.strictEqual(third.status, 409); assert.strictEqual(third.body.code, 'MAX_FREEZES');
  const s = await S.status(u.id);
  assert.strictEqual(s.current, 0, 'ขาด 3 วัน มี Freeze 2 → ขาด');
  assert.strictEqual(s.freezes.held, 2, 'Freeze ไม่ถูกใช้ทิ้ง');
  assert.strictEqual(s.best, 2);
  // ผู้ใช้อีกคน: ขาดเมื่อวาน แล้วเพิ่งซื้อวันนี้ → ใช้ไม่ได้
  const v = await makeUser();
  await answers(v.id, add(TODAY, -3), 20); await answers(v.id, add(TODAY, -2), 20);
  await setBal(v.id, 300);
  assert.strictEqual((await req('POST', '/api/streak/freeze', { token: v.token })).status, 200);
  const sv = await S.status(v.id);
  assert.strictEqual(sv.current, 0); assert.strictEqual(sv.freezes.held, 1);
});

test('ซื้อ Freeze: Coin ไม่พอ = 402 ไม่หักเงิน · บันทึกธุรกรรม · ต้องล็อกอิน', async () => {
  const u = await makeUser();
  await req('GET', '/api/streak', { token: u.token });
  await setBal(u.id, 49);
  const r = await req('POST', '/api/streak/freeze', { token: u.token });
  assert.strictEqual(r.status, 402); assert.strictEqual(r.body.code, 'INSUFFICIENT');
  assert.strictEqual((await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0].balance, 49);
  await setBal(u.id, 60);
  const [x, y] = await Promise.all([req('POST', '/api/streak/freeze', { token: u.token }), req('POST', '/api/streak/freeze', { token: u.token })]);
  assert.deepStrictEqual([x.status, y.status].sort(), [200, 402], 'ซื้อพร้อมกัน ยอดไม่ติดลบ');
  const t = await coinsOf(u.id, 'STREAK_FREEZE');
  assert.deepStrictEqual([t.n, t.s], [1, -50]);
  assert.strictEqual((await req('GET', '/api/streak')).status, 401);
  assert.strictEqual((await req('POST', '/api/streak/freeze')).status, 401);
});

test('Milestone ใหญ่จาก streak ที่ยังต่อเนื่อง (ข้อมูลย้อนหลัง) · ไม่แจกจาก streak เก่าที่ขาดแล้ว', async () => {
  const u = await makeUser();
  // streak เก่า 10 วันที่ขาดไปแล้ว
  for (let i = 40; i >= 31; i -= 1) await pool.query("INSERT INTO streak_days (user_id, day) VALUES ($1, $2)", [u.id, add(TODAY, -i)]);
  // streak ปัจจุบัน 7 วัน (ถึงเมื่อวาน)
  for (let i = 7; i >= 1; i -= 1) await pool.query("INSERT INTO streak_days (user_id, day) VALUES ($1, $2)", [u.id, add(TODAY, -i)]);
  await pool.query('INSERT INTO user_streaks (user_id, best) VALUES ($1, 10)', [u.id]);
  const s = await S.status(u.id);
  assert.strictEqual(s.current, 7); assert.strictEqual(s.best, 10);
  assert.deepStrictEqual(s.milestones.filter((m) => m.reached).map((m) => m.days), [3, 7]);
  const c = await coinsOf(u.id, 'STREAK_MILESTONE');
  assert.strictEqual(c.s, 15 + 40);
  const b = await S.badgeOf(u.id);
  assert.strictEqual(b.badge.days, 7); assert.strictEqual(b.current, 7);
});

test('หน้าเว็บ: ข้อความผ่าน esc() · ไม่มีการคำนวณ streak ฝั่ง client', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/streak.js'), 'utf8');
  assert.ok(/api\(['"`]\/streak/.test(js));
  assert.ok(!/answer_events|localStorage\.setItem\(['"`]eq:streak/.test(js));
});
