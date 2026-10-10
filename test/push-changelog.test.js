/*
  แจ้งเตือนบนโทรศัพท์ (Web Push) · ป๊อปอัปแพตช์ล่าสุด · EXP จาก Ranked
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.PUSH_REMINDERS = 'off';

const pool = require('../config/db');
const { createApp } = require('../app');
const push = require('../services/push');
const { LATEST_ID } = require('../config/changelog');
const { RANKED_EXP } = require('../config/battle');

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
async function makeUser(prefix = 'pu') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const fcm = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${n}-${Math.random().toString(36).slice(2)}`,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });

const sent = [];
test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  push._setSender(async (sub, body) => { sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); });
});
test.after(async () => { push._setSender(null); await new Promise((r) => server.close(r)); await pool.end(); });

test('แจ้งเตือน: config มี public key (สร้างอัตโนมัติ คงที่) · สมัครได้เฉพาะบริการ push จริง', async () => {
  const u = await makeUser();
  const c1 = await req('GET', '/api/notifications/config', { token: u.token });
  assert.strictEqual(c1.status, 200);
  assert.ok(c1.body.publicKey.length > 60);
  assert.strictEqual(c1.body.reminderTime, '19:00');
  const c2 = await req('GET', '/api/notifications/config', { token: u.token });
  assert.strictEqual(c2.body.publicKey, c1.body.publicKey, 'key ต้องคงที่');

  for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.example.com/push', 'https://fcm.googleapis.com.evil.com/x']) {
    const r = await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: { ...fcm(1), endpoint: bad } } });
    assert.strictEqual(r.status, 400, bad);
  }
  const ok = await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: fcm(1), timezone: 'Asia/Tokyo' } });
  assert.strictEqual(ok.status, 200);
  const c3 = await req('GET', '/api/notifications/config', { token: u.token });
  assert.strictEqual(c3.body.devices, 1);
  assert.strictEqual(c3.body.timezone, 'Asia/Tokyo');
  const badTz = await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: fcm(2), timezone: "x'; DROP TABLE users;--" } });
  assert.strictEqual(badTz.status, 200, 'timezone แปลก ๆ ถูกเพิกเฉย ไม่ error');
  assert.strictEqual((await req('GET', '/api/notifications/config', { token: u.token })).body.timezone, 'Asia/Tokyo');
});

test('แจ้งเตือน: ตั้งเวลาได้เฉพาะ 06:00–21:30 · ปิดได้ · ทดสอบส่งถึงตัวเอง', async () => {
  const u = await makeUser();
  for (const t of ['05:30', '22:00', '7:00', 'abc', '12:75']) {
    assert.strictEqual((await req('PUT', '/api/notifications/prefs', { token: u.token, body: { reminderTime: t } })).status, 400, t);
  }
  const p = await req('PUT', '/api/notifications/prefs', { token: u.token, body: { reminderTime: '20:30', reminderEnabled: false } });
  assert.deepStrictEqual([p.body.reminderTime, p.body.reminderEnabled], ['20:30', false]);
  assert.strictEqual((await req('POST', '/api/notifications/test', { token: u.token })).status, 404, 'ยังไม่มีเครื่อง');
  const sub = fcm(3);
  await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: sub } });
  sent.length = 0;
  assert.strictEqual((await req('POST', '/api/notifications/test', { token: u.token })).status, 200);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].endpoint, sub.endpoint);
  await req('POST', '/api/notifications/unsubscribe', { token: u.token, body: { endpoint: sub.endpoint } });
  assert.strictEqual((await req('GET', '/api/notifications/config', { token: u.token })).body.devices, 0);
});

test('แจ้งเตือนรายวัน: ถึงเวลา + วันนี้ยังไม่เข้าแอป = ส่ง 1 ครั้ง · ไม่ซ้ำ · เข้าแอปแล้วไม่ส่ง · ปิดไว้ไม่ส่ง', async () => {
  const a = await makeUser('ra'); const b = await makeUser('rb'); const c = await makeUser('rc');
  // เลือกเขตเวลาที่ตอนนี้เป็นช่วงกลางวัน (ทดสอบได้ทุกเวลาที่รัน)
  let zone = 'UTC'; let t = '12:00';
  for (const z of ['UTC', 'Asia/Bangkok', 'America/New_York', 'Pacific/Auckland', 'Europe/London', 'America/Los_Angeles']) {
    const h = (await pool.query("SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE $1)::int AS h, EXTRACT(MINUTE FROM NOW() AT TIME ZONE $1)::int AS m", [z])).rows[0];
    if (h.h >= 7 && h.h <= 20) { zone = z; t = `${String(h.h).padStart(2, '0')}:${h.m < 30 ? '00' : '30'}`; break; }
  }
  for (const u of [a, b, c]) await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: fcm(u.id), timezone: zone } });
  await pool.query("UPDATE users SET reminder_time = $1, last_seen = NOW() - INTERVAL '3 days', last_reminded_on = NULL WHERE id = ANY($2::int[])", [t, [a.id, b.id, c.id]]);
  await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [b.id]);             // b เข้าแอปวันนี้แล้ว
  await pool.query('UPDATE users SET reminder_enabled = FALSE WHERE id = $1', [c.id]);      // c ปิดการเตือน
  await pool.query("INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, 'A1-test-1', 'A1', 'learning', 1, NOW() - INTERVAL '1 hour') ON CONFLICT DO NOTHING", [a.id]).catch(() => {});
  sent.length = 0;
  await push.runReminders();
  const mine = (u) => sent.filter((s) => s.endpoint.includes(`test-${u.id}-`));
  assert.strictEqual(mine(a).length, 1, 'a ได้รับ');
  assert.ok(mine(a)[0].body.title && mine(a)[0].body.body && mine(a)[0].body.url.startsWith('/#/'));
  assert.strictEqual(mine(b).length, 0, 'เข้าแอปแล้ววันนี้ ไม่เตือน');
  assert.strictEqual(mine(c).length, 0, 'ปิดไว้ ไม่เตือน');
  await push.runReminders();
  assert.strictEqual(mine(a).length, 1, 'วันละครั้งเท่านั้น');
});

test('แจ้งเตือน: เครื่องที่ยกเลิกแล้ว (410) ถูกลบออกเอง', async () => {
  const u = await makeUser();
  await req('POST', '/api/notifications/subscribe', { token: u.token, body: { subscription: fcm(9) } });
  push._setSender(async () => { const e = new Error('gone'); e.statusCode = 410; throw e; });
  try {
    assert.strictEqual(await push.sendToUser(u.id, { title: 'x' }), 0);
  } finally { push._setSender(async (sub, body) => { sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); }); }
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [u.id])).rows[0].n, 0);
});

test('แพตช์โน้ต: ผู้ใช้ใหม่ไม่เด้ง · ผู้ใช้เดิมเด้งครั้งเดียวจนกดเห็นแล้ว', async () => {
  const fresh = await makeUser('cn');
  const f = await req('GET', '/api/changelog', { token: fresh.token });
  assert.strictEqual(f.status, 200);
  assert.strictEqual(f.body.unseen, false);
  assert.strictEqual(f.body.latestId, LATEST_ID);
  assert.ok(f.body.entries[0].items.length > 0);

  const old = await makeUser('co');
  await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days', changelog_seen = 'old' WHERE id = $1", [old.id]);
  assert.strictEqual((await req('GET', '/api/changelog', { token: old.token })).body.unseen, true);
  assert.strictEqual((await req('GET', '/api/changelog', { token: old.token })).body.unseen, true, 'ยังไม่กดเห็น = ยังเด้ง');
  await req('POST', '/api/changelog/seen', { token: old.token });
  assert.strictEqual((await req('GET', '/api/changelog', { token: old.token })).body.unseen, false);
});

async function playNpc(u, answer) {
  let s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  assert.ok(s.matchId, JSON.stringify(s));
  while (s.status === 'active') {
    if (s.phase === 'question') {
      const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [s.matchId]);
      const ci = rows[0].questions[s.index].correctIndex;
      await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: s.index, choiceIndex: answer === 'right' ? ci : (ci + 1) % 4 } });
    }
    s = (await req('POST', `/api/ranked/matches/${s.matchId}/next`, { token: u.token })).body;
  }
  return s;
}

test('Ranked ได้ EXP: เล่นจบได้ EXP ตามผล + ข้อที่ถูก · ลงบันทึก exp_log · ออกกลางเกมไม่ได้', async () => {
  const u = await makeUser('ex');
  const exp0 = (await req('GET', '/api/auth/me', { token: u.token })).body.user.exp;
  const s = await playNpc(u, 'right');
  const r = s.result;
  assert.ok(r.exp, 'ผลมี exp');
  const expected = RANKED_EXP.base[r.outcome] + RANKED_EXP.perCorrect * r.correct;
  assert.strictEqual(r.exp.gained, expected);
  assert.ok(r.exp.levelInfo && r.exp.levelInfo.exp === exp0 + expected);
  const me = (await req('GET', '/api/auth/me', { token: u.token })).body.user;
  assert.strictEqual(me.exp, exp0 + expected);
  const log = (await pool.query("SELECT SUM(amount)::int AS n FROM exp_log WHERE user_id = $1 AND reason = 'ranked_match'", [u.id])).rows[0].n;
  assert.strictEqual(log, expected);

  // ออกกลางเกม = 0 EXP
  const st = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  const f = await req('POST', `/api/ranked/matches/${st.matchId}/forfeit`, { token: u.token });
  assert.strictEqual(f.status, 200, JSON.stringify(f.body));
  const fr = f.body.result || (await req('GET', `/api/ranked/matches/${st.matchId}`, { token: u.token })).body.result;
  assert.strictEqual(fr.exp.gained, 0);
  assert.strictEqual(fr.exp.reason, 'forfeit');
  assert.strictEqual((await req('GET', '/api/auth/me', { token: u.token })).body.user.exp, exp0 + expected);
});

test('Ranked EXP: มีเพดานรายวัน', async () => {
  const u = await makeUser('cap');
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, 'ranked_match')", [u.id, RANKED_EXP.dailyCap - 5]);
  await pool.query('UPDATE users SET ranked_cooldown_until = NULL WHERE id = $1', [u.id]);
  const s = await playNpc(u, 'right');
  assert.strictEqual(s.result.exp.gained, 5);
  assert.strictEqual(s.result.exp.capped, true);
});
