/*
  Halloween Costume Festival 2026 — Daily Login Reward + Learning Event Quests
  ทดสอบตามสเปก (ข้อ 20 Event Testing + ข้อ 18 Claim Security + ข้อ 21 Regression):
   1 ล็อกอินในช่วงกิจกรรม · 2 รับ Day 1 · 3 ของเข้า Inventory (event_login) · 4 เปิดตู้เสื้อผ้าเห็นของ · 5 สวม Pumpkin Hat
   6 ตัวละครใส่ Pumpkin Hat จริง (outfit + โมเดล 3D ของชิ้นนั้นมีจริง) · 7–8 Logout/Login ของยังอยู่ · 9 รับซ้ำวันเดียวกันไม่ได้ (รวมกดพร้อมกัน)
   10 วันถัดไปรับ Day 2 · 11 ขาดหนึ่งวันแล้วรับต่อได้ (ไม่รีเซ็ต) · 12 หลังจบกิจกรรมของยังอยู่ (รับเพิ่มไม่ได้)
   + เควสต์: ผ่านด่าน (โจทย์/เฉลยฝั่งเซิร์ฟเวอร์) → รับของ + Coin + ป้าย ครั้งเดียว · Listening นับจาก TOEIC ในช่วงกิจกรรม
   + ไม่กระทบ EXP / รูปโปรไฟล์ / Coin เดิม (นอกจากรางวัลเควสต์ที่บันทึกในประวัติ)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
// ค่าเริ่มต้น = 24 ต.ค. – 1 พ.ย. 2569 (Asia/Bangkok) · ถ้ารันหลังจากนั้น เลื่อนช่วงมาครอบเวลาปัจจุบัน (ตรรกะเดียวกัน)
const DEFAULT_END = Date.parse('2026-11-01T00:00:00+07:00');
if (Date.now() > DEFAULT_END - 2 * 3600e3 || Date.now() < Date.parse('2026-10-24T00:00:00+07:00')) {
  const d0 = new Date(Date.now() - 86400e3); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d0);
  process.env.EVENT_HCF_2026_START = `${day}T00:00:00+07:00`;
  process.env.EVENT_HCF_2026_END = new Date(Date.parse(`${day}T00:00:00+07:00`) + 8 * 86400e3).toISOString();
}
const pool = require('../config/db');
const { createApp } = require('../app');
const ev = require('../services/events');
const { EVENT_BY_ID } = require('../config/events');

const EID = 'halloween-costume-2026';
const E = EVENT_BY_ID[EID];
const START = new Date(E.startsAt).getTime();
const END = new Date(E.endsAt).getTime();
const DAY = 86400e3;
const at = (t) => ev._setNow(() => t);
const dayAt = (n, h = 10) => START + (n - 1) * DAY + h * 3600e3;   // วันที่ n ของกิจกรรม เวลา h:00 (เวลาไทย)

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
async function makeUser(prefix = 'hf') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const inv = async (uid) => (await pool.query('SELECT item_id, acquisition_type FROM user_inventory WHERE user_id = $1', [uid])).rows;
const claim = (u) => req('POST', `/api/events/${EID}/login-claim`, { token: u.token });
const state = (u) => req('GET', `/api/events/${EID}`, { token: u.token });

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

test('ข้อ 1–8: ล็อกอินช่วงกิจกรรม → รับ Day 1 → เข้า Inventory → ตู้เสื้อผ้า → สวม Pumpkin Hat (3D จริง) → Logout/Login ของยังอยู่', async () => {
  const u = await makeUser();
  const photo0 = (await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0];
  at(dayAt(1));
  const s0 = (await state(u)).body;
  assert.strictEqual(s0.status, 'active');
  assert.strictEqual(s0.login.canClaim, true);
  assert.deepStrictEqual(s0.login.days.map((d) => d.status), ['available', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  const r = await claim(u);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.day, 1);
  assert.deepStrictEqual(r.body.items, ['hat_hw26_pumpkin']);
  assert.deepStrictEqual((await inv(u.id)).filter((x) => x.item_id === 'hat_hw26_pumpkin'), [{ item_id: 'hat_hw26_pumpkin', acquisition_type: 'event_login' }]);
  // ตู้เสื้อผ้า (ข้อมูลเดียวกับหน้า Wardrobe)
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  assert.ok(me.inventory.some((x) => x.itemId === 'hat_hw26_pumpkin' && x.acquisition === 'event_login'));
  // สวม
  const eq = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: 'hat_hw26_pumpkin' } });
  assert.strictEqual(eq.status, 200, JSON.stringify(eq.body));
  assert.strictEqual(eq.body.outfit.hat, 'hat_hw26_pumpkin');
  // ตัวละครแสดงหมวกจริง: outfit ที่บันทึก + ชิ้นนี้มีโมเดล 3D (GLB) ในแคตตาล็อก
  const cat = (await req('GET', '/api/avatar/catalog', { token: u.token })).body.items;
  const hat = cat.find((x) => x.id === 'hat_hw26_pumpkin');
  assert.ok(hat && hat.model && hat.model.glbUrl, 'Pumpkin Hat ต้องมีโมเดล 3D');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', hat.model.glbUrl)));
  assert.ok(hat.model.clip, 'หมวกครอบศีรษะ: มีระนาบตัดผมใต้หมวก');
  assert.strictEqual(hat.purchasable, false, 'ของกิจกรรมซื้อไม่ได้');
  // Logout/Login
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' } });
  const me2 = (await req('GET', '/api/avatar/me', { token: login.body.token })).body;
  assert.strictEqual(me2.outfit.hat, 'hat_hw26_pumpkin');
  assert.ok(me2.inventory.some((x) => x.itemId === 'hat_hw26_pumpkin'));
  // รูปโปรไฟล์ / EXP ไม่ถูกแตะ
  assert.deepStrictEqual((await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0], photo0);
});

test('ข้อ 9–12: รับซ้ำวันเดียวกันไม่ได้ (รวมกดพร้อมกัน) · วันถัดไป Day 2 · ขาดวันแล้วรับต่อ · หลังจบของยังอยู่', async () => {
  const u = await makeUser();
  at(dayAt(1, 0.05));   // 00:03 น. ของวันแรก
  assert.strictEqual((await claim(u)).status, 200);
  at(dayAt(1, 23.9));   // 23:54 น. วันเดียวกัน (เวลาไทย)
  const again = await claim(u);
  assert.strictEqual(again.status, 409);
  assert.strictEqual(again.body.code, 'ALREADY_CLAIMED_TODAY');
  // วันถัดไป: กด 6 ครั้งพร้อมกัน → ได้ครั้งเดียว (ทรานแซกชัน + UNIQUE)
  at(dayAt(2, 0.02));
  const burst = await Promise.all(Array.from({ length: 6 }, () => claim(u)));
  assert.strictEqual(burst.filter((r) => r.status === 200).length, 1, burst.map((r) => r.status).join(','));
  assert.ok(burst.filter((r) => r.status !== 200).every((r) => r.status === 409));
  const ok = burst.find((r) => r.status === 200).body;
  assert.strictEqual(ok.day, 2);
  assert.deepStrictEqual(ok.items, ['back_hw26_batwings']);
  let s = (await state(u)).body.login;
  assert.strictEqual(s.claimedDays, 2);
  assert.strictEqual(s.claimedToday, true);
  assert.ok(s.nextClaimAt && Date.parse(s.nextClaimAt) === START + 2 * DAY, s.nextClaimAt);
  assert.strictEqual(s.days[2].status, 'tomorrow');
  // ขาดวันที่ 3 → วันที่ 4 กลับมารับ Day 3 ต่อ (ไม่รีเซ็ต)
  at(dayAt(4));
  const r3 = await claim(u);
  assert.strictEqual(r3.status, 200);
  assert.strictEqual(r3.body.day, 3);
  assert.deepStrictEqual(r3.body.items, ['top_hw26_ghost_hoodie']);
  // DB: วันละแถว · Day ไม่ซ้ำ
  const rows = (await pool.query('SELECT day_no, claim_date::text AS d FROM event_login_claims WHERE event_id = $1 AND user_id = $2 ORDER BY day_no', [EID, u.id])).rows;
  assert.deepStrictEqual(rows.map((x) => x.day_no), [1, 2, 3]);
  assert.strictEqual(new Set(rows.map((x) => x.d)).size, 3);
  // หลังจบกิจกรรม: รับเพิ่มไม่ได้ · ของเดิมยังอยู่ · ปฏิทินบอก "หมดเวลา"
  at(END + 3600e3);
  const late = await claim(u);
  assert.strictEqual(late.status, 403);
  assert.strictEqual(late.body.code, 'EVENT_ENDED');
  const owned = (await inv(u.id)).map((x) => x.item_id);
  for (const id of ['hat_hw26_pumpkin', 'back_hw26_batwings', 'top_hw26_ghost_hoodie']) assert.ok(owned.includes(id), id);
  s = (await state(u)).body;
  assert.strictEqual(s.status, 'ended');
  assert.deepStrictEqual(s.login.days.map((d) => d.status), ['claimed', 'claimed', 'claimed', 'expired', 'expired', 'expired', 'expired']);
  // ยังสวมได้หลังจบกิจกรรม
  at(END + 2 * 3600e3);
  assert.strictEqual((await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'back', itemId: 'back_hw26_batwings' } })).status, 200);
});

test('ครบ 7 วัน: Day 7 = Midnight Costume Set (3 ชิ้น) · วันที่ 8 รับเพิ่มไม่ได้ · ก่อนเริ่มรับไม่ได้', async () => {
  const u = await makeUser();
  at(START - 3600e3);
  const early = await claim(u);
  assert.strictEqual(early.status, 403);
  assert.strictEqual(early.body.code, 'EVENT_NOT_STARTED');
  for (let d = 1; d <= 7; d++) { at(dayAt(d)); assert.strictEqual((await claim(u)).status, 200, `day ${d}`); }
  const last = (await pool.query('SELECT items FROM event_login_claims WHERE event_id = $1 AND user_id = $2 AND day_no = 7', [EID, u.id])).rows[0].items;
  assert.deepStrictEqual(last, ['outer_hw26_midnight', 'bottom_hw26_midnight', 'acc_hw26_moon']);
  at(dayAt(8));
  const more = await claim(u);
  assert.strictEqual(more.status, 409);
  assert.strictEqual(more.body.code, 'ALL_CLAIMED');
  const set = (await inv(u.id)).filter((x) => /_hw26_/.test(x.item_id));
  assert.strictEqual(set.length, 9);
  assert.ok(set.every((x) => x.acquisition_type === 'event_login'));
});

test('เควสต์: ด่านคำศัพท์ (CEFR ของผู้เล่น · เฉลยฝั่งเซิร์ฟเวอร์) → รับของ + Coin + ครั้งเดียว · Listening นับจาก TOEIC · Champion ให้ป้าย', async () => {
  const u = await makeUser();
  at(dayAt(2));
  const coin0 = (await req('GET', '/api/coins/wallet', { token: u.token })).body.balance;
  let q = (await state(u)).body.quests;
  assert.deepStrictEqual(q.map((x) => [x.id, x.done, x.canClaim]), [['vocab', false, false], ['grammar', false, false], ['listening', false, false], ['champion', false, false]]);
  // รับก่อนทำเสร็จไม่ได้
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token })).status, 403);
  // เล่นด่าน hv: ตอบถูกทุกข้อ (อ่านเฉลยจาก DB เหมือนผู้เล่นที่ตอบถูก)
  const s1 = await req('POST', `/api/events/${EID}/stages/hv/start`, { token: u.token });
  assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
  assert.strictEqual(s1.body.questions.length, 10);
  assert.ok(s1.body.questions.every((x) => !('correctIndex' in x) && !('answer' in x)), 'ไม่ส่งเฉลยไปหน้าเว็บ');
  const row = (await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s1.body.attemptId])).rows[0];
  const answers = row.questions.map((x) => (x.kind === 'spell' ? x.answer : x.correctIndex));
  at(dayAt(2) + 60e3);
  const sub = await req('POST', `/api/events/${EID}/attempts/${s1.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(sub.status, 200, JSON.stringify(sub.body));
  assert.strictEqual(sub.body.passed, true);
  assert.ok(sub.body.quests.find((x) => x.id === 'vocab').canClaim);
  const c1 = await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token });
  assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
  assert.strictEqual(c1.body.coins, 40);
  assert.deepStrictEqual(c1.body.added, ['acc_hw26_candy']);
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token })).status, 409);
  assert.strictEqual((await req('GET', '/api/coins/wallet', { token: u.token })).body.balance, coin0 + 40);
  // Listening: TOEIC Part 1 ตอบถูก 6 ข้อในช่วงกิจกรรม (ก่อนเริ่มกิจกรรมไม่นับ)
  const sess = (await pool.query("INSERT INTO toeic_sessions (user_id, part, mode, items, total) VALUES ($1, 1, 'practice', '[]', 6) RETURNING id", [u.id])).rows[0].id;
  for (let i = 0; i < 7; i++) {
    const t = new Date(i === 0 ? START - DAY : dayAt(2) - 3600e3);
    await pool.query(`INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct, skill, created_at)
      VALUES ($1, $2, $3, 1, 'practice', 1, 'A', 'A', TRUE, 'action', $4)`, [sess, u.id, `hfq${i}`, t]);
  }
  q = (await state(u)).body.quests;
  assert.strictEqual(q.find((x) => x.id === 'listening').progress, 6);
  assert.strictEqual(q.find((x) => x.id === 'listening').canClaim, true);
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/listening/claim`, { token: u.token })).body.added[0], 'bg_hw26_moonlit');
  // Champion ยังไม่ครบ (แกรมม่ายังไม่ผ่าน)
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/champion/claim`, { token: u.token })).status, 403);
  // ผ่านแกรมม่า → Champion: Coin + ป้าย Achievement
  const s2 = await req('POST', `/api/events/${EID}/stages/hg/start`, { token: u.token });
  const row2 = (await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s2.body.attemptId])).rows[0];
  await req('POST', `/api/events/${EID}/attempts/${s2.body.attemptId}/submit`, { token: u.token, body: { answers: row2.questions.map((x) => (x.kind === 'spell' ? x.answer : x.correctIndex)) } });
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/grammar/claim`, { token: u.token })).status, 200);
  const ch = await req('POST', `/api/events/${EID}/quests/champion/claim`, { token: u.token });
  assert.strictEqual(ch.status, 200, JSON.stringify(ch.body));
  assert.strictEqual(ch.body.badge, 'halloween_festival_2026');
  assert.ok((await pool.query("SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = 'halloween_festival_2026'", [u.id])).rows[0]);
  const qi = (await inv(u.id)).filter((x) => ['acc_hw26_candy', 'glasses_hw26_bat', 'bg_hw26_moonlit'].includes(x.item_id));
  assert.strictEqual(qi.length, 3);
  assert.ok(qi.every((x) => x.acquisition_type === 'event_quest'));
  assert.strictEqual((await req('GET', '/api/coins/wallet', { token: u.token })).body.balance, coin0 + 40 + 40 + 40 + 60);
  // หลังจบกิจกรรม: ของเควสต์ยังอยู่ · รับรางวัลเควสต์ไม่ได้แล้ว
  at(END + 60e3);
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/vocab/claim`, { token: u.token })).status, 403);
  assert.strictEqual((await inv(u.id)).filter((x) => /_hw26_/.test(x.item_id)).length, 3);
});

test('ความปลอดภัย: ต้องล็อกอิน · กิจกรรม/เควสต์ที่ไม่มีอยู่ · ไม่มีช่องให้หน้าเว็บส่งวัน/เวลาเอง · ไม่มี Inventory แยก', async () => {
  assert.strictEqual((await req('POST', `/api/events/${EID}/login-claim`)).status, 401);
  const u = await makeUser();
  at(dayAt(3));
  assert.strictEqual((await req('POST', '/api/events/nope/login-claim', { token: u.token })).status, 404);
  assert.strictEqual((await req('POST', `/api/events/${EID}/quests/nope/claim`, { token: u.token })).status, 404);
  // ส่งวันที่/เวลามาเองไม่มีผล (เซิร์ฟเวอร์ใช้นาฬิกาตัวเอง)
  const r = await req('POST', `/api/events/${EID}/login-claim`, { token: u.token, body: { date: '2026-10-25', day: 7, now: Date.now() + 9 * DAY } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.day, 1);
  // ตาราง Inventory เดียว (ร้านค้า + Achievement + กิจกรรม)
  const t = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%inventory%'")).rows.map((x) => x.table_name);
  assert.deepStrictEqual(t, ['user_inventory']);
  // ของกิจกรรมไม่อยู่ในร้าน (ซื้อไม่ได้)
  const shop = (await req('GET', '/api/avatar/shop?section=hats&size=48', { token: u.token })).body.items.map((x) => x.id);
  assert.ok(!shop.includes('hat_hw26_pumpkin') && !shop.includes('hat_hw26_witch'));
  assert.strictEqual((await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'hat_hw26_witch' } })).status >= 400, true);
});
