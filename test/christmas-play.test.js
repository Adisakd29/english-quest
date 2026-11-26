/*
  v1.25.1 Christmas P1 — Advent Calendar · Boss · Story · การอนุมัติเนื้อหา AI โดยผู้ดูแล
  ตรวจ: เฉลยไม่ถูกส่งไปหน้าเว็บ · ผ่านเกณฑ์จริงจึงได้รางวัล · รางวัลครั้งเดียว (พร้อมกันก็ครั้งเดียว) · ตอบเร็วเกินคน/หมดเวลาไม่นับ
       · ประตูยังไม่ถึงวันเปิดไม่ได้ · Story มองไม่เห็นจนกว่าผู้ดูแลอนุมัติครบ · แก้เนื้อหาแล้วการอนุมัติเดิมใช้ไม่ได้
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
const pool = require('../config/db');
const { createApp } = require('../app');
const xm = require('../services/christmas');
const play = require('../services/christmasPlay');
const X = require('../config/christmas');
const SEASON = require('../config/season');

let T = Date.parse('2026-12-10T10:00:00+07:00');
const at = (t) => { T = t; xm._setNow(() => T); SEASON._setNow(() => T); };
const tick = (ms = 2000) => at(T + ms);
let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'xp') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
/** เฉลยของข้อปัจจุบัน (อ่านจาก DB เหมือนเซิร์ฟเวอร์ — หน้าเว็บไม่มีทางรู้) */
const answerOf = async (uid, kind) => (await pool.query("SELECT q FROM xmas_runs WHERE user_id = $1 AND kind = $2 AND status = 'playing'", [uid, kind])).rows[0].q.answer;
const bal = async (uid) => (await pool.query('SELECT balance FROM event_token_balances WHERE user_id = $1', [uid])).rows[0]?.balance ?? 0;

test.before(async () => {
  server = http.createServer(createApp()); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  await pool.query("DELETE FROM season_settings WHERE season_key = 'christmas'"); await pool.query('DELETE FROM content_reviews'); xm._clearCache();
  at(T);
});
test.after(async () => { xm._setNow(null); SEASON._setNow(null); await new Promise((r) => server.close(r)); await pool.end(); });

test('Advent: ประตูยังไม่ถึงวันเปิดไม่ได้ · ไม่มีเฉลยในข้อ · ถูก ≥ 3/4 ได้รางวัล · ประตูเดิมรับซ้ำไม่ได้ · วันที่พลาดย้อนเปิดได้ · ตก = ลองใหม่', async () => {
  at(Date.parse('2026-12-10T10:00:00+07:00'));
  const u = await makeUser();
  let r = await req('POST', '/api/christmas/advent/11/start', { token: u.token });
  assert.strictEqual(r.body.code, 'NOT_YET');
  r = await req('POST', '/api/christmas/advent/3/start', { token: u.token });   // วันที่ 3 ผ่านมาแล้ว → ย้อนเปิดได้
  assert.strictEqual(r.status, 200);
  assert.ok(!('answer' in r.body.q) && r.body.q.options.length === 4, 'หน้าเว็บไม่ได้เฉลย');
  // ตอบผิดครบ 2 ข้อ → ตก
  let q = r.body.q;
  for (let i = 0; i < 4; i += 1) {
    tick(); const a = await answerOf(u.id, 'advent');
    const res = await req('POST', '/api/christmas/advent/answer', { token: u.token, body: { key: q.key, choice: i < 2 ? (a + 1) % 4 : a } });
    q = res.body.next; if (i === 3) { assert.strictEqual(res.body.status, 'lost'); assert.strictEqual(res.body.reward, null); }
  }
  assert.strictEqual(await bal(u.id), 0);
  // ลองใหม่ ตอบถูกหมด → ได้ 15 Token
  r = await req('POST', '/api/christmas/advent/3/start', { token: u.token }); q = r.body.q;
  let last;
  for (let i = 0; i < 4; i += 1) { tick(); last = await req('POST', '/api/christmas/advent/answer', { token: u.token, body: { key: q.key, choice: await answerOf(u.id, 'advent') } }); q = last.body.next; }
  assert.strictEqual(last.body.status, 'won'); assert.strictEqual(last.body.reward.tokens, 15);
  assert.strictEqual(await bal(u.id), 15);
  r = await req('POST', '/api/christmas/advent/3/start', { token: u.token });
  assert.strictEqual(r.body.code, 'ALREADY');
  // ตอบเร็วเกินคนอ่านทัน (บอท) = ไม่นับ
  r = await req('POST', '/api/christmas/advent/7/start', { token: u.token });
  const fast = await req('POST', '/api/christmas/advent/answer', { token: u.token, body: { key: r.body.q.key, choice: await answerOf(u.id, 'advent') } });
  assert.strictEqual(fast.body.correct, false); assert.strictEqual(fast.body.tooFast, true);
  // คำตอบข้อเดิมส่งซ้ำไม่ได้
  const again = await req('POST', '/api/christmas/advent/answer', { token: u.token, body: { key: r.body.q.key, choice: 0 } });
  assert.strictEqual(again.body.code, 'STALE');
  const st = (await req('GET', '/api/christmas/play', { token: u.token })).body;
  assert.strictEqual(st.advent.opened, 1); assert.strictEqual(st.advent.doors[2].opened, true); assert.strictEqual(st.advent.doors[10].canOpen, false);
});

test('Boss: ชนะ = โจมตีจนพลังหมด → 30 Token + EXP วันละครั้ง · แพ้เมื่อหมดหัวใจ · หมดเวลาไม่นับ · ชนะซ้ำวันเดียวกันไม่ได้รางวัลเพิ่ม', async () => {
  at(Date.parse('2026-12-12T10:00:00+07:00'));
  const u = await makeUser();
  let r = await req('POST', '/api/christmas/boss/start', { token: u.token });
  assert.strictEqual(r.body.hp, 100); let q = r.body.q;
  // หมดเวลา (เกิน 24 วินาที) แม้เลือกถูกก็ไม่นับ
  tick(30000);
  let res = await req('POST', '/api/christmas/boss/answer', { token: u.token, body: { key: q.key, choice: await answerOf(u.id, 'boss') } });
  assert.strictEqual(res.body.correct, false); assert.strictEqual(res.body.hearts, 2);
  q = res.body.next;
  for (let i = 0; i < 20 && res.body.status === 'playing'; i += 1) {
    tick(); res = await req('POST', '/api/christmas/boss/answer', { token: u.token, body: { key: q.key, choice: await answerOf(u.id, 'boss') } }); q = res.body.next;
  }
  assert.strictEqual(res.body.status, 'won'); assert.strictEqual(res.body.hp, 0);
  assert.strictEqual(res.body.reward.tokens, X.BOSS.tokens);
  assert.ok(res.body.answered <= 10, `คอมโบทำให้ชนะเร็วขึ้น (${res.body.answered} ข้อ)`);
  // วันเดียวกันชนะอีก → ไม่ได้ Token เพิ่ม
  r = await req('POST', '/api/christmas/boss/start', { token: u.token }); q = r.body.q; res = r;
  for (let i = 0; i < 20 && (i === 0 || res.body.status === 'playing'); i += 1) {
    tick(); res = await req('POST', '/api/christmas/boss/answer', { token: u.token, body: { key: q.key, choice: await answerOf(u.id, 'boss') } }); q = res.body.next;
  }
  assert.strictEqual(res.body.reward.already, true); assert.strictEqual(await bal(u.id), X.BOSS.tokens);
  // แพ้: ตอบผิด 3 ครั้ง
  r = await req('POST', '/api/christmas/boss/start', { token: u.token }); q = r.body.q;
  for (let i = 0; i < 3; i += 1) { tick(); res = await req('POST', '/api/christmas/boss/answer', { token: u.token, body: { key: q.key, choice: ((await answerOf(u.id, 'boss')) + 1) % 4 } }); q = res.body.next; }
  assert.strictEqual(res.body.status, 'lost'); assert.strictEqual(res.body.reward, null);
  // เริ่มเกมพร้อมกันหลายคำขอ → มีเกมเล่นอยู่ได้เกมเดียว
  await Promise.all(Array.from({ length: 4 }, () => req('POST', '/api/christmas/boss/start', { token: u.token })));
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM xmas_runs WHERE user_id = $1 AND kind = 'boss' AND status = 'playing'", [u.id])).rows[0].n, 1);
});

test('Story: มองไม่เห็น/เปิดไม่ได้จนกว่าผู้ดูแลอนุมัติครบ · ผู้ดูแลเปิดสวิตช์ก่อนอนุมัติไม่ได้ · เรียงตอน · ไม่มีเฉลยก่อนส่ง · ผ่าน ≥ 2/3 ได้รางวัลครั้งเดียว · แก้เนื้อหา = ต้องอนุมัติใหม่', async () => {
  at(Date.parse('2026-12-20T10:00:00+07:00'));
  const u = await makeUser(); const adm = await makeUser('xpa');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  let st = (await req('GET', '/api/christmas/play', { token: u.token })).body;
  assert.ok(!st.story, 'ยังไม่อนุมัติ = ไม่แสดง');
  assert.strictEqual((await req('GET', '/api/christmas/story/c1', { token: u.token })).status, 403);
  let r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { flags: { christmas_story: true } } });
  assert.strictEqual(r.body.code, 'NOT_REVIEWED');
  assert.strictEqual((await req('POST', '/api/admin/christmas/story/c1/review', { token: u.token, body: {} })).status, 403, 'ผู้ใช้ทั่วไปอนุมัติไม่ได้');
  for (const c of play.STORY.chapters.slice(0, 4)) await req('POST', `/api/admin/christmas/story/${c.id}/review`, { token: adm.token, body: {} });
  r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { flags: { christmas_story: true } } });
  assert.strictEqual(r.body.code, 'NOT_REVIEWED', 'ยังขาด 1 ตอน');
  r = await req('POST', '/api/admin/christmas/story/c5/review', { token: adm.token, body: {} });
  assert.strictEqual(r.body.all, true);
  r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { flags: { christmas_story: true } } });
  assert.strictEqual(r.status, 200);
  st = (await req('GET', '/api/christmas/play', { token: u.token })).body;
  assert.strictEqual(st.story.chapters.length, 5);
  assert.strictEqual(st.story.chapters[1].canRead, false, 'ต้องผ่านตอน 1 ก่อน');
  assert.strictEqual((await req('GET', '/api/christmas/story/c2', { token: u.token })).body.code, 'NEED_PREV');
  const ch = (await req('GET', '/api/christmas/story/c1', { token: u.token })).body;
  assert.ok(ch.text.length > 200 && ch.questions.every((q) => !('answer' in q) && !('why' in q)), 'ไม่มีเฉลยก่อนส่ง');
  const key = play.STORY.chapters[0].questions.map((q) => q.answer);
  r = await req('POST', '/api/christmas/story/c1/submit', { token: u.token, body: { answers: key.map((a) => (a + 1) % 4) } });
  assert.strictEqual(r.body.passed, false); assert.strictEqual(r.body.reward, null);
  const burst = await Promise.all(Array.from({ length: 3 }, () => req('POST', '/api/christmas/story/c1/submit', { token: u.token, body: { answers: key } })));
  assert.strictEqual(burst.filter((x) => x.body.reward && x.body.reward.tokens === X.STORY.tokens).length, 1, 'รางวัลครั้งเดียว');
  assert.strictEqual(await bal(u.id), X.STORY.tokens);
  assert.strictEqual((await req('GET', '/api/christmas/story/c2', { token: u.token })).status, 200);
  // แก้เนื้อหา (hash เปลี่ยน) → การอนุมัติเดิมใช้ไม่ได้ → ซ่อนอีกครั้ง
  const c1 = play.STORY.chapters[0]; const old = c1.text; c1.text = `${old} (edited)`;
  try {
    assert.strictEqual((await play.storyApproved()).all, false);
    assert.strictEqual((await req('GET', '/api/christmas/story/c1', { token: u.token })).status, 403);
  } finally { c1.text = old; }
  await pool.query("DELETE FROM season_settings WHERE season_key = 'christmas'"); await pool.query('DELETE FROM content_reviews'); xm._clearCache();
});

test('โจทย์คำศัพท์มาจากคลังที่ตรวจแล้วเท่านั้น (ไม่มีความหมายที่ติดธง) · ตัวเลือกไม่ซ้ำ · ตัวถูกอยู่ในตัวเลือก', () => {
  const E = require('../services/endless');
  const ids = new Set(E.bank().list.map((w) => w.id));
  for (let i = 0; i < 60; i += 1) {
    const q = play.vocabQuestion(['A1', 'A2', 'B1'][i % 3], []);
    assert.ok(ids.has(q.senseId));
    assert.strictEqual(new Set(q.options).size, q.options.length);
    assert.strictEqual(q.options[q.answer], q.th);
  }
});
