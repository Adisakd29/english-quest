/*
  Loy Krathong Festival 2569 (18–25 พ.ย. 2569) — ต่อยอดระบบเทศกาลเดิม (kind 'festival')
  ทดสอบ: ปฏิทินรับรางวัล 7 วัน (ชุดไทย 3D) · ด่านคำศัพท์ใช้คำธีมลอยกระทง · เควสต์อ่าน/ฟังเรื่อง A2-07 นับเฉพาะที่ "ผ่าน" ในช่วงกิจกรรม
  · เควสต์ฟังปลดล็อกธีมแอป · Champion ได้ป้าย · รับซ้ำไม่ได้ · ไม่กระทบเทศกาลฮาโลวีน
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
// เลื่อนช่วงกิจกรรมมาครอบเวลาจริง (เรื่องอ่าน/ฟังบันทึกเวลาด้วยนาฬิกา DB) — ตรรกะเดียวกับวันจริง 18–25 พ.ย. 2569
{
  const d0 = new Date(Date.now() - 86400e3); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d0);
  process.env.EVENT_LK_2026_START = `${day}T00:00:00+07:00`;
  process.env.EVENT_LK_2026_END = new Date(Date.parse(`${day}T00:00:00+07:00`) + 8 * 86400e3).toISOString();
}
const pool = require('../config/db');
const { createApp } = require('../app');
const ev = require('../services/events');
const cfg = require('../config/events');

const EID = 'loykrathong-2026';
const E = cfg.EVENT_BY_ID[EID];
const START = new Date(E.startsAt).getTime();
const END = new Date(E.endsAt).getTime();
const DAY = 86400e3;
const at = (t) => ev._setNow(() => t);
const dayAt = (n, h = 10) => START + (n - 1) * DAY + h * 3600e3;

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
async function makeUser(prefix = 'lk') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const inv = async (uid) => (await pool.query('SELECT item_id, acquisition_type FROM user_inventory WHERE user_id = $1', [uid])).rows;
const claim = (u) => req('POST', `/api/events/${EID}/login-claim`, { token: u.token });
const state = (u) => req('GET', `/api/events/${EID}`, { token: u.token });
const KEY = require('../data/graded/texts.json').texts.find((t) => t.id === 'A2-07').questions.map((q) => q.answer);

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await require('../services/avatar/catalog').syncCatalog(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(() => ev._setNow(null));
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ตั้งค่า: วันจริง 18–25 พ.ย. 2569 (ค่าเริ่มต้น) · 7 รางวัล · ของทุกชิ้นมีโมเดล 3D · ซื้อไม่ได้ · ธีม/ป้ายลงทะเบียนแล้ว', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config', 'events.js'), 'utf8');
  assert.ok(src.includes("'2026-11-18T00:00:00+07:00'") && src.includes("'2026-11-26T00:00:00+07:00'"), 'ค่าเริ่มต้น = 18 พ.ย. 00:00 ถึง 25 พ.ย. 23:59:59 (เวลาไทย)');
  assert.strictEqual(new Date('2026-11-24T12:00:00+07:00').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Bangkok' }), 'Tuesday', 'วันลอยกระทง 24 พ.ย. 2569 = วันอังคาร');
  assert.strictEqual(E.login.length, 7);
  const ids = E.login.flatMap((d) => d.items).concat(E.quests.flatMap((q) => q.reward.items || []));
  assert.strictEqual(new Set(ids).size, ids.length, 'ไม่มีของซ้ำ');
  const u = await makeUser();
  const items = (await req('GET', '/api/avatar/catalog', { token: u.token })).body.items;
  for (const id of ids) {
    const it = items.find((x) => x.id === id);
    assert.ok(it, `มีในแคตตาล็อก: ${id}`);
    assert.strictEqual(it.purchasable, false, `${id} ซื้อไม่ได้`);
    if (it.slot !== 'background') {
      assert.ok(it.model && it.model.glbUrl && fs.existsSync(path.join(__dirname, '..', 'public', it.model.glbUrl)), `${id} มีโมเดล 3D จริง`);
    }
  }
  assert.ok(cfg.PREMIUM_THEMES['loykrathong-2026']);
  assert.ok(require('../config/achievements').find((a) => a.id === 'loykrathong_festival_2026'));
  assert.strictEqual(cfg.LOYKRATHONG_WORDS.length, 40);
});

test('Login 7 วัน: Day 1 ดอกลีลาวดี → สวมได้ · รับซ้ำวันเดียวกันไม่ได้ (รวมกดพร้อมกัน) · ขาดวันรับต่อได้ · Day 7 ชุด 3 ชิ้น · หลังจบของยังอยู่', async () => {
  const u = await makeUser();
  const photo0 = (await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0];
  at(START - 3600e3);
  assert.strictEqual((await claim(u)).body.code, 'EVENT_NOT_STARTED');
  at(dayAt(1));
  const s0 = (await state(u)).body;
  assert.strictEqual(s0.status, 'active');
  assert.strictEqual(s0.kind, 'festival');
  const r1 = await claim(u);
  assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
  assert.deepStrictEqual(r1.body.items, ['hat_lk26_frangipani']);
  const eq = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: 'hat_lk26_frangipani' } });
  assert.strictEqual(eq.status, 200, JSON.stringify(eq.body));
  at(dayAt(1, 23.9));
  assert.strictEqual((await claim(u)).body.code, 'ALREADY_CLAIMED_TODAY');
  at(dayAt(2, 0.02));
  const burst = await Promise.all(Array.from({ length: 5 }, () => claim(u)));
  assert.strictEqual(burst.filter((r) => r.status === 200).length, 1);
  assert.deepStrictEqual(burst.find((r) => r.status === 200).body.items, ['shoes_lk26_sandals']);
  // ขาดวันที่ 3 → วันที่ 4–8 รับต่อจนครบ 7
  for (let d = 4; d <= 8; d++) { at(dayAt(d)); assert.strictEqual((await claim(u)).status, 200, `day ${d}`); }
  const last = (await pool.query('SELECT items FROM event_login_claims WHERE event_id = $1 AND user_id = $2 AND day_no = 7', [EID, u.id])).rows[0].items;
  assert.deepStrictEqual(last, ['top_lk26_silk', 'bottom_lk26_chongkraben', 'fx_lk26_krathong']);
  const set = (await inv(u.id)).filter((x) => /_lk26_/.test(x.item_id));
  assert.strictEqual(set.length, 9);
  assert.ok(set.every((x) => x.acquisition_type === 'event_login'));
  at(END + 3600e3);
  assert.strictEqual((await claim(u)).body.code, 'EVENT_ENDED');
  assert.strictEqual((await inv(u.id)).filter((x) => /_lk26_/.test(x.item_id)).length, 9, 'หลังจบของยังอยู่');
  assert.deepStrictEqual((await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0], photo0, 'ไม่แตะรูปโปรไฟล์/EXP');
});

test('เควสต์: ด่านคำศัพท์ใช้คำธีมลอยกระทง · อ่าน/ฟัง A2-07 นับเฉพาะที่ผ่านในช่วงกิจกรรม · ฟังปลดล็อกธีม · Champion ได้ป้าย · รับซ้ำไม่ได้', async () => {
  const u = await makeUser();
  const coin0 = (await req('GET', '/api/coins/wallet', { token: u.token })).body.balance;
  at(dayAt(2));
  let q = (await state(u)).body.quests;
  assert.deepStrictEqual(q.map((x) => [x.id, x.done]), [['vocab', false], ['reading', false], ['listening', false], ['champion', false]]);
  assert.deepStrictEqual(q.find((x) => x.id === 'reading').graded, { text: 'A2-07', mode: 'reading' });

  // ด่าน lv: โจทย์ 10 ข้อ ไม่ส่งเฉลย · มีคำศัพท์ธีมลอยกระทง
  const s1 = await req('POST', `/api/events/${EID}/stages/lv/start`, { token: u.token });
  assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
  assert.strictEqual(s1.body.questions.length, 10);
  assert.ok(s1.body.questions.every((x) => !('correctIndex' in x) && !('answer' in x)));
  const row = (await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s1.body.attemptId])).rows[0];
  const themeQs = row.questions.filter((x) => x.kind === 'theme');
  assert.ok(themeQs.length >= 4, `คำถามธีม ${themeQs.length}`);
  const words = new Set(cfg.LOYKRATHONG_WORDS.flat());
  assert.ok(themeQs.every((x) => JSON.stringify(x).split('"').some((t) => words.has(t))), 'คำถามธีมมาจากคำศัพท์ลอยกระทง');
  at(dayAt(2) + 60e3);
  const sub = await req('POST', `/api/events/${EID}/attempts/${s1.body.attemptId}/submit`, { token: u.token,
    body: { answers: row.questions.map((x) => (x.kind === 'spell' ? x.answer : x.correctIndex)) } });
  assert.strictEqual(sub.body.passed, true, JSON.stringify(sub.body));
  const c1 = await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token });
  assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
  assert.deepStrictEqual(c1.body.added, ['acc_lk26_lotus']);
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token })).status, 409);

  // อ่าน: ผ่านก่อนเริ่มกิจกรรม ไม่นับ
  await pool.query(`INSERT INTO graded_progress (user_id, text_id, mode, best_score, total, attempts, updated_at) VALUES ($1, 'A2-07', 'reading', 4, 4, 1, $2)`, [u.id, new Date(START - DAY)]);
  q = (await state(u)).body.quests;
  assert.strictEqual(q.find((x) => x.id === 'reading').done, false, 'ผ่านก่อนกิจกรรมไม่นับ');
  // ส่งคำตอบผิดในช่วงกิจกรรม → ยังไม่นับ (ครั้งที่ไม่ผ่านไม่ขยับเวลา แม้คะแนนดีสุดเดิมจะผ่าน)
  await req('POST', '/api/graded/A2-07/submit', { token: u.token, body: { mode: 'reading', answers: KEY.map((a) => (a + 1) % 4) } });
  q = (await state(u)).body.quests;
  assert.strictEqual(q.find((x) => x.id === 'reading').done, false, 'ตอบไม่ผ่านในช่วงกิจกรรมไม่นับ');
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/reading/claim`, { token: u.token })).status, 403);
  // ตอบผ่านในช่วงกิจกรรม → นับ
  const okR = await req('POST', '/api/graded/A2-07/submit', { token: u.token, body: { mode: 'reading', answers: KEY } });
  assert.strictEqual(okR.body.passed, true);
  const c2 = await req('POST', `/api/events/${EID}/quests/reading/claim`, { token: u.token });
  assert.strictEqual(c2.status, 200, JSON.stringify(c2.body));
  assert.deepStrictEqual(c2.body.added, ['bg_lk26_river']);

  // ฟัง: ผ่าน → ปลดล็อกธีมแอป (ถาวร) → ใช้ธีมได้
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'loykrathong-2026' } })).status >= 400, true, 'ยังไม่ปลดล็อก → ใช้ไม่ได้');
  await req('POST', '/api/graded/A2-07/submit', { token: u.token, body: { mode: 'listening', answers: KEY } });
  const c3 = await req('POST', `/api/events/${EID}/quests/listening/claim`, { token: u.token });
  assert.strictEqual(c3.status, 200, JSON.stringify(c3.body));
  assert.strictEqual(c3.body.theme, 'loykrathong-2026');
  const th = (await req('GET', '/api/themes', { token: u.token })).body;
  assert.ok(th.premium.find((t) => t.id === 'loykrathong-2026').owned);
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'loykrathong-2026' } })).status, 200);

  // Champion
  const ch = await req('POST', `/api/events/${EID}/quests/champion/claim`, { token: u.token });
  assert.strictEqual(ch.status, 200, JSON.stringify(ch.body));
  assert.strictEqual(ch.body.badge, 'loykrathong_festival_2026');
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/champion/claim`, { token: u.token })).status, 409);
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM user_achievements WHERE user_id = $1 AND achievement_id = 'loykrathong_festival_2026'", [u.id])).rows[0].n, 1);
  assert.strictEqual((await req('GET', '/api/coins/wallet', { token: u.token })).body.balance, coin0 + 40 + 40 + 40 + 60);
  const qi = (await inv(u.id)).filter((x) => /_lk26_/.test(x.item_id));
  assert.deepStrictEqual(qi.map((x) => x.item_id).sort(), ['acc_lk26_lotus', 'bg_lk26_river']);
  assert.ok(qi.every((x) => x.acquisition_type === 'event_quest'));
});

test('หลายเทศกาล: /api/events แสดงทั้งฮาโลวีนและลอยกระทง · เควสต์ที่ไม่มีอยู่ 404 · ต้องล็อกอิน', async () => {
  assert.strictEqual((await req('POST', `/api/events/${EID}/login-claim`)).status, 401);
  const u = await makeUser();
  const list = (await req('GET', '/api/events', { token: u.token })).body.events;
  assert.ok(list.find((e) => e.id === EID && e.kind === 'festival'));
  assert.ok(list.find((e) => e.id === 'halloween-costume-2026'));
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/nope/claim`, { token: u.token })).status, 404);
});
