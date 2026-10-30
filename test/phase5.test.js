/*
  v1.10.0 Phase 5 — กระดานอันดับ (อันดับไม่ซ้ำ · ไม่นับ 0 EXP · ซ่อนบัญชีทดสอบ) + Graded Reading & Listening
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let j = null; try { j = buf ? JSON.parse(buf) : null; } catch (_) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'p5') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function giveExp(userId, amount, at) {
  await pool.query('INSERT INTO exp_log (user_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)', [userId, amount, 'test', at]);
  await pool.query('UPDATE users SET exp = exp + $2 WHERE id = $1', [userId, amount]);
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('กระดานอันดับ: คะแนนเท่ากันไม่ได้อันดับซ้ำ (ถึงก่อนอยู่สูงกว่า) · ตลอดกาลไม่นับ 0 EXP · บัญชีทดสอบไม่ขึ้นกระดานแต่เจ้าของยังเห็นตัวเอง', async () => {
  // ล้างคะแนนเดิมในฐานทดสอบ เพื่อให้ผลแน่นอน
  await pool.query("UPDATE users SET exp = 0"); await pool.query('DELETE FROM exp_log');
  const a = await makeUser('lba'); const b = await makeUser('lbb'); const c = await makeUser('lbc'); const zero = await makeUser('lbz');
  const t0 = new Date(); const early = new Date(t0.getTime() - 60 * 60 * 1000);
  await giveExp(b.id, 500, early);          // b ถึง 500 ก่อน
  await giveExp(a.id, 500, t0);             // a ถึง 500 ทีหลัง
  await giveExp(c.id, 900, t0);
  const all = (await req('GET', '/api/leaderboard?period=all', { token: a.token })).body;
  const order = all.top.map((e) => e.username || e.name);
  assert.deepStrictEqual(all.top.map((e) => e.rank), [1, 2, 3], 'อันดับไม่ซ้ำ');
  assert.deepStrictEqual(order.slice(0, 3), [c.name, b.name, a.name], `คะแนนเท่ากัน: ถึงก่อนอยู่สูงกว่า (${order})`);
  assert.ok(!order.includes(zero.name), 'ผู้ใช้ 0 EXP ไม่อยู่ในกระดานตลอดกาล');
  const zme = (await req('GET', '/api/leaderboard?period=all', { token: zero.token })).body.me;
  assert.ok(!zme || zme.rank === null, 'ผู้ใช้ 0 EXP เห็นตัวเองแบบยังไม่มีอันดับ');
  // ผู้ดูแลตั้ง c เป็นบัญชีทดสอบ
  const admin = await makeUser('lbad'); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${c.id}/test-flag`, { token: a.token, body: { isTest: true } })).status, 403);
  assert.strictEqual((await req('POST', `/api/admin/membership/members/${c.id}/test-flag`, { token: admin.token, body: { isTest: 'yes' } })).status, 400);
  const f = await req('POST', `/api/admin/membership/members/${c.id}/test-flag`, { token: admin.token, body: { isTest: true } });
  assert.strictEqual(f.status, 200); assert.strictEqual(f.body.isTest, true);
  const week = (await req('GET', '/api/leaderboard?period=week', { token: a.token })).body;
  assert.ok(!week.top.some((e) => (e.username || e.name) === c.name), 'บัญชีทดสอบไม่ขึ้นกระดาน');
  assert.strictEqual(week.top[0].rank, 1);
  const cSelf = (await req('GET', '/api/leaderboard?period=week', { token: c.token })).body;
  assert.ok(cSelf.me && cSelf.me.rank >= 1, 'เจ้าของบัญชีทดสอบยังเห็นอันดับตัวเอง');
  const logs = (await pool.query("SELECT action FROM audit_logs WHERE target_user = $1 AND action = 'test_flag_on'", [c.id])).rows;
  assert.strictEqual(logs.length, 1, 'บันทึก audit');
  const m = (await req('GET', `/api/admin/membership/members?q=${c.name}`, { token: admin.token })).body.members[0];
  assert.strictEqual(m.isTest, true);
});

test('Graded Reading & Listening: 25 เรื่อง A1–B2 · โหมดฟังไม่ส่งเนื้อเรื่องก่อนตอบ · ไม่ส่งเฉลย · ตรวจที่เซิร์ฟเวอร์ · EXP ครั้งเดียว ≥ 60%', async () => {
  const u = await makeUser('gr');
  const list = (await req('GET', '/api/graded', { token: u.token })).body;
  assert.deepStrictEqual(list.levels.map((l) => [l.level, l.texts.length]), [['A1', 6], ['A2', 7], ['B1', 6], ['B2', 6]]);
  const id = list.levels[1].texts[0].id;
  const rd = (await req('GET', `/api/graded/${id}?mode=reading`, { token: u.token })).body;
  assert.ok(rd.paragraphs.length >= 3 && rd.glossary.length >= 5 && rd.audio.url && rd.audio.segments.length === rd.paragraphs.length);
  assert.ok(rd.questions.every((q) => q.answer === undefined && q.evidence === undefined));
  const ls = (await req('GET', `/api/graded/${id}?mode=listening`, { token: u.token })).body;
  assert.ok(!ls.paragraphs && !ls.translationTH && !ls.tipTH && !ls.glossary && ls.audio.url, 'โหมดฟังไม่ส่งเนื้อเรื่อง/เคล็ดลับที่อ้างเนื้อเรื่อง');
  assert.strictEqual((await req('GET', `/api/graded/${id}?mode=x`, { token: u.token })).status, 400);
  assert.strictEqual((await req('GET', '/api/graded/Z9-99?mode=reading', { token: u.token })).status, 404);
  assert.strictEqual((await req('POST', `/api/graded/${id}/submit`, { token: u.token, body: { mode: 'reading', answers: [0] } })).status, 400);
  const key = require('../data/graded/texts.json').texts.find((t) => t.id === id).questions.map((q) => q.answer);
  const wrong = key.map((a) => (a + 1) % 4);
  const r1 = (await req('POST', `/api/graded/${id}/submit`, { token: u.token, body: { mode: 'listening', answers: wrong } })).body;
  assert.strictEqual(r1.score, 0); assert.strictEqual(r1.exp, 0); assert.ok(r1.paragraphs && r1.results[0].evidence && r1.tipTH, 'หลังส่งได้บทถอดความ + หลักฐาน + เคล็ดลับ');
  const r2 = (await req('POST', `/api/graded/${id}/submit`, { token: u.token, body: { mode: 'listening', answers: key } })).body;
  assert.strictEqual(r2.score, key.length); assert.strictEqual(r2.exp, 10);
  const r3 = (await req('POST', `/api/graded/${id}/submit`, { token: u.token, body: { mode: 'listening', answers: key } })).body;
  assert.strictEqual(r3.exp, 0, 'EXP ครั้งเดียวต่อเรื่องต่อโหมด');
  const after = (await req('GET', '/api/graded', { token: u.token })).body;
  const t = after.levels[1].texts[0];
  assert.deepStrictEqual([t.listening.best, t.listening.passed, t.reading], [key.length, true, null]);
  const ev = (await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND source = 'graded' AND skill = 'listening'", [u.id])).rows[0].n;
  assert.strictEqual(ev, key.length * 3);
  // เนื้อหาทั้งชุดผ่าน validator + ไฟล์เสียงมีอยู่จริง
  const { validateAll } = require('../services/graded/validator');
  const all = require('../data/graded/texts.json').texts;
  assert.deepStrictEqual(validateAll(all), []);
  const fs = require('fs'); const path = require('path');
  assert.ok(all.every((x) => fs.existsSync(path.join(__dirname, '../public', x.audio.url))), 'มีไฟล์เสียงครบ');
});

test('Ranked Leaderboard: แต้มเท่ากันไม่ได้อันดับซ้ำ (ถึงก่อนอยู่สูงกว่า) · ทุก scope', async () => {
  const season = (await pool.query("SELECT id FROM ranked_seasons ORDER BY id DESC LIMIT 1")).rows[0];
  if (!season) return;   // ฐานทดสอบยังไม่มีซีซัน (สร้างเมื่อเรียก Ranked ครั้งแรก)
  const a = await makeUser('rka'); const b = await makeUser('rkb'); const c = await makeUser('rkc');
  const ins = (u, qr, ago) => pool.query(`INSERT INTO ranked_profiles (user_id, season_id, mode, quest_rating, season_highest_qr, wins, updated_at)
    VALUES ($1, $2, 'vocab', $3, $3, 1, NOW() - ($4 || ' minutes')::interval) ON CONFLICT (user_id, season_id, mode) DO UPDATE SET quest_rating = $3, season_highest_qr = $3, wins = 1, updated_at = NOW() - ($4 || ' minutes')::interval`, [u.id, season.id, qr, String(ago)]);
  await ins(a, 99999, 5); await ins(b, 99999, 60); await ins(c, 99999, 30);   // b ถึงก่อน → c → a
  for (const scope of ['season', 'global']) {
    const r = (await req('GET', `/api/ranked/leaderboard?scope=${scope}&mode=vocab`, { token: a.token })).body;
    const pos = r.top.map((x) => x.position);
    assert.strictEqual(new Set(pos).size, pos.length, `${scope}: อันดับไม่ซ้ำ`);
    if (scope === 'season') assert.deepStrictEqual(r.top.slice(0, 3).map((x) => x.name), [b.name, c.name, a.name], 'ถึงก่อนอยู่สูงกว่า');
  }
});
