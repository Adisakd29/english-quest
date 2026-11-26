/*
  v1.25.0 Christmas 2026 — Seasonal Theme Engine · Snowflake Token ledger · เช็กอิน/เควสต์ผูกการเรียน · ร้าน · ผู้ดูแล
  ทดสอบการโกง/ความถูกต้องตามสเปก: รับซ้ำ · กดพร้อมกัน · Token ไม่พอ · กิจกรรมหมดเวลา · ยอดไม่ติดลบ · ราคาจากเซิร์ฟเวอร์เท่านั้น
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
const pool = require('../config/db');
const { createApp } = require('../app');
const xm = require('../services/christmas');
const X = require('../config/christmas');
const SEASON = require('../config/season');

const DAY = 86400e3;
const T0 = Date.parse('2026-12-10T10:00:00+07:00');   // กลางกิจกรรม
const at = (t) => { xm._setNow(() => t); SEASON._setNow(() => t); };

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
async function makeUser(prefix = 'xm') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
/** การเรียนจริง "วันนี้" (เวลาของ answer_events = เวลาที่ตั้งไว้ในการทดสอบ) */
async function answers(uid, n, { skill = 'vocab', correct = true, t = T0 } = {}) {
  for (let i = 0; i < n; i += 1) {
    await pool.query('INSERT INTO answer_events (user_id, skill, item_id, level, correct, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [uid, skill, `xmt${i}`, 'A1', correct, new Date(t - 1000 * (i + 1))]);
  }
}
const bal = async (uid) => (await pool.query('SELECT balance FROM event_token_balances WHERE user_id = $1 AND event_id = $2', [uid, X.EVENT_ID])).rows[0]?.balance ?? 0;
const ledger = async (uid) => (await pool.query('SELECT delta, reason, idem_key, balance_after FROM event_token_ledger WHERE user_id = $1 AND event_id = $2 ORDER BY id', [uid, X.EVENT_ID])).rows;
const expOf = async (uid) => (await pool.query('SELECT exp FROM users WHERE id = $1', [uid])).rows[0].exp;

test.before(async () => {
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  await pool.query("DELETE FROM season_settings WHERE season_key = 'christmas'");
  xm._clearCache();
  at(T0);
});
test.after(async () => { at(null); xm._setNow(null); SEASON._setNow(null); await new Promise((r) => server.close(r)); await pool.end(); });

test('Season engine: คริสต์มาส (priority 20) ชนะลอยกระทง (10) เมื่อช่วงซ้อนกัน · ก่อนเริ่ม/หลังจบไม่แสดง · /api/season ส่ง flags', async () => {
  at(Date.parse('2026-11-25T08:00:00+07:00'));   // ลอยกระทงยังไม่จบ (ถึง 26 พ.ย.) แต่คริสต์มาสเริ่มแล้ว
  assert.strictEqual(SEASON.active().key, 'christmas');
  at(Date.parse('2026-11-24T08:00:00+07:00'));
  assert.strictEqual(SEASON.active().key, 'loykrathong');
  at(Date.parse('2027-01-02T08:00:00+07:00'));
  assert.strictEqual(SEASON.active(), null);
  at(T0);
  const r = await req('GET', '/api/season');
  assert.strictEqual(r.body.season.key, 'christmas');
  assert.deepStrictEqual(r.body.season.flags, { snow: true, music: true });
});

test('เช็กอิน: ต้องเรียนก่อน (ตอบถูก ≥ 5 ข้อวันนี้) · ได้ 10 Token + EXP · วันละครั้ง · กดพร้อมกัน 6 คำขอได้ครั้งเดียว · ไม่บังคับต่อเนื่อง', async () => {
  at(T0);
  const u = await makeUser();
  let r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.status, 409); assert.strictEqual(r.body.code, 'LEARN_FIRST');
  await answers(u.id, 4); await answers(u.id, 3, { correct: false });
  r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.body.code, 'LEARN_FIRST', 'ตอบผิดไม่นับ');
  await answers(u.id, 1);
  const exp0 = await expOf(u.id);
  const many = await Promise.all(Array.from({ length: 6 }, () => req('POST', '/api/christmas/checkin', { token: u.token })));
  assert.strictEqual(many.filter((x) => x.status === 200).length, 1, 'ได้ครั้งเดียว');
  assert.ok(many.filter((x) => x.status !== 200).every((x) => x.body.code === 'ALREADY'));
  assert.strictEqual(await bal(u.id), 10);
  assert.strictEqual(await expOf(u.id) - exp0, X.CHECKIN_EXP);
  assert.strictEqual((await ledger(u.id)).length, 1);
  // ข้ามไป 3 วัน (ขาด 2 วัน) → เช็กอินได้อีกโดยไม่รีเซ็ต (ต้องเรียนของวันนั้นก่อน)
  at(T0 + 3 * DAY);
  r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.body.code, 'LEARN_FIRST', 'การเรียนเมื่อวานไม่นับเป็นของวันนี้');
  await answers(u.id, 5, { t: T0 + 3 * DAY });
  r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.balance, 20);
  const st = (await req('GET', '/api/christmas', { token: u.token })).body;
  assert.strictEqual(st.checkin.days, 2); assert.strictEqual(st.checkin.claimedToday, true);
  at(T0);
});

test('เควสต์รายวัน: 3 ข้อ (หมุนตามวัน คงที่ทั้งวัน) · ความคืบหน้าจากการเรียนจริง · รับซ้ำ/พร้อมกันไม่ได้ · ข้อที่ไม่ใช่ของวันนี้รับไม่ได้ · โบนัสต้องครบ', async () => {
  at(T0);
  const day = xm.bkkDay(T0);
  const qs = xm.questsFor(day);
  assert.strictEqual(qs.length, 3); assert.strictEqual(new Set(qs.map((q) => q.id)).size, 3);
  assert.deepStrictEqual(xm.questsFor(day).map((q) => q.id), qs.map((q) => q.id), 'คงที่ทั้งวัน');
  const days = Array.from({ length: 10 }, (_, i) => xm.questsFor(xm.bkkDay(T0 + i * DAY)).map((q) => q.id).join());
  assert.ok(new Set(days).size >= 4, 'หมุนเปลี่ยนตามวัน');
  const u = await makeUser();
  const notToday = X.QUEST_POOL.find((q) => !qs.some((x) => x.id === q.id));
  let r = await req('POST', `/api/christmas/quests/${notToday.id}/claim`, { token: u.token });
  assert.strictEqual(r.body.code, 'NOT_TODAY');
  r = await req('POST', `/api/christmas/quests/${qs[0].id}/claim`, { token: u.token });
  assert.strictEqual(r.body.code, 'NOT_DONE');
  r = await req('POST', `/api/christmas/quests/${X.BONUS.id}/claim`, { token: u.token });
  assert.strictEqual(r.body.code, 'NOT_DONE');
  // ทำการเรียนให้ครบทุกเควสต์ของวันนี้ (ตามชนิดข้อมูลจริง)
  for (const q of qs) {
    if (q.metric === 'correct') await answers(u.id, q.target, { skill: q.skills[0] });
    if (q.metric === 'answered') await answers(u.id, q.target, { skill: 'grammar' });
    if (q.metric === 'accuracy') await answers(u.id, q.min, { skill: 'reading' });
    if (q.metric === 'exp') await pool.query("INSERT INTO exp_log (user_id, amount, reason, created_at) VALUES ($1, 5, 'speaking', $2)", [u.id, new Date(T0 - 60000)]);
  }
  const st = (await req('GET', '/api/christmas', { token: u.token })).body;
  assert.ok(st.quests.every((q) => q.done && q.canClaim), JSON.stringify(st.quests.map((q) => [q.id, q.progress, q.target])));
  const exp0 = await expOf(u.id);
  const burst = await Promise.all(Array.from({ length: 5 }, () => req('POST', `/api/christmas/quests/${qs[0].id}/claim`, { token: u.token })));
  assert.strictEqual(burst.filter((x) => x.status === 200).length, 1);
  for (const q of qs.slice(1)) assert.strictEqual((await req('POST', `/api/christmas/quests/${q.id}/claim`, { token: u.token })).status, 200);
  r = await req('POST', `/api/christmas/quests/${X.BONUS.id}/claim`, { token: u.token });
  assert.strictEqual(r.status, 200);
  const want = qs.reduce((a, q) => a + q.tokens, 0) + X.BONUS.tokens;
  assert.strictEqual(await bal(u.id), want);
  assert.strictEqual(await expOf(u.id) - exp0, qs.reduce((a, q) => a + q.exp, 0) + X.BONUS.exp);
  assert.strictEqual((await req('POST', `/api/christmas/quests/${X.BONUS.id}/claim`, { token: u.token })).body.code, 'ALREADY');
});

test('ร้าน: Token ไม่พอ = 409 ยอดไม่เปลี่ยน · ซื้อสำเร็จเข้า Inventory (event) · ซื้อซ้ำไม่ได้ · ซื้อพร้อมกันได้ชิ้นเดียว · ยอดไม่ติดลบ · ใส่ชุดได้และบันทึกในบัญชี', async () => {
  at(T0);
  const u = await makeUser();
  const cheap = X.SHOP.find((s) => s.id === 'hat_xm26_snowclip');
  let r = await req('POST', `/api/christmas/shop/${cheap.id}/buy`, { token: u.token });
  assert.strictEqual(r.status, 409); assert.strictEqual(r.body.code, 'INSUFFICIENT_TOKENS');
  assert.strictEqual(await bal(u.id), 0);
  assert.strictEqual((await pool.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [u.id, cheap.id])).rowCount, 0);
  // ได้ Token จากการเรียน (เควสต์/เช็กอินจริงทดสอบแล้วข้างบน) — ใช้ ledger โดยตรงเพื่อเตรียมยอด
  const c = await pool.connect();
  try { await c.query('BEGIN'); await xm.moveTokens(c, u.id, 100, 'test', null, 'test:seed'); await c.query('COMMIT'); } finally { c.release(); }
  // ซื้อพร้อมกัน 2 ชิ้นที่รวมแล้วเกินยอด (60 + 80 > 100) → ได้ชิ้นเดียว
  const gloves = X.SHOP.find((s) => s.id === 'acc_xm26_gloves');
  const both = await Promise.all([req('POST', `/api/christmas/shop/${cheap.id}/buy`, { token: u.token }), req('POST', `/api/christmas/shop/${gloves.id}/buy`, { token: u.token })]);
  assert.strictEqual(both.filter((x) => x.status === 200).length, 1);
  assert.ok((await bal(u.id)) >= 0);
  const bought = both.find((x) => x.status === 200).body.itemId;
  r = await req('POST', `/api/christmas/shop/${bought}/buy`, { token: u.token });
  assert.strictEqual(r.body.code, 'OWNED');
  const row = (await pool.query('SELECT acquisition_type, price_paid FROM user_inventory WHERE user_id = $1 AND item_id = $2', [u.id, bought])).rows[0];
  assert.deepStrictEqual(row, { acquisition_type: 'event', price_paid: 0 });
  assert.ok((await ledger(u.id)).every((l) => l.balance_after >= 0));
  // ราคาเป็นของเซิร์ฟเวอร์: ส่งราคามาเองไม่มีผล
  r = await req('POST', '/api/christmas/shop/outer_xm26_noel/buy', { token: u.token, body: { price: 1 } });
  assert.strictEqual(r.body.code, 'INSUFFICIENT_TOKENS');
  r = await req('POST', '/api/christmas/shop/hat_cap_red/buy', { token: u.token });
  assert.strictEqual(r.status, 404, 'ของนอกร้านคริสต์มาสแลกไม่ได้');
  // ใส่ชุด → บันทึกในบัญชี (โหลดใหม่ยังอยู่) · ของคริสต์มาสซื้อด้วย Coin ไม่ได้
  const slot = bought === cheap.id ? 'hat' : 'accessory';
  r = await req('POST', '/api/avatar/equip', { token: u.token, body: { slot, itemId: bought } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  assert.strictEqual((me.outfit || me.avatar?.outfit || {})[slot], bought);
  r = await req('POST', '/api/avatar/buy', { token: u.token, body: { itemId: 'outer_xm26_santa' } });
  assert.notStrictEqual(r.status, 200, 'ซื้อด้วย Coin ไม่ได้');
});

test('ของขวัญต้อนรับ: ครั้งเดียว (พร้อมกันก็ครั้งเดียว) · Token + กรอบโปรไฟล์จริงในบัญชี · กรอบกิจกรรมซื้อด้วย Coin ไม่ได้', async () => {
  at(T0);
  const u = await makeUser();
  const rs = await Promise.all(Array.from({ length: 4 }, () => req('POST', '/api/christmas/starter', { token: u.token })));
  assert.strictEqual(rs.filter((x) => x.status === 200).length, 1);
  assert.strictEqual(await bal(u.id), X.STARTER.tokens);
  assert.strictEqual((await pool.query("SELECT via FROM user_cosmetics WHERE user_id = $1 AND item_id = 'pf_xm26_holly'", [u.id])).rows[0].via, 'event');
  const cos = await req('POST', '/api/cosmetics/buy', { token: u.token, body: { id: 'pf_xm26_wreath' } });
  assert.notStrictEqual(cos.status, 200);
});

test('หมดเวลา: หลังจบเช็กอิน/เควสต์ไม่ได้ แต่ใช้ร้านได้ถึง 7 ม.ค. · หลังจากนั้นทุกอย่างปิด · ก่อนเริ่มยังไม่เปิด', async () => {
  const u = await makeUser();
  at(Date.parse('2027-01-03T10:00:00+07:00'));
  await answers(u.id, 6, { t: Date.parse('2027-01-03T10:00:00+07:00') });
  let r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.body.code, 'EVENT_ENDED');
  r = await req('GET', '/api/christmas', { token: u.token });
  assert.strictEqual(r.body.status, 'claim_only');
  r = await req('POST', '/api/christmas/shop/hat_xm26_snowclip/buy', { token: u.token });
  assert.strictEqual(r.body.code, 'INSUFFICIENT_TOKENS', 'ร้านยังเปิด (แค่ Token ไม่พอ)');
  at(Date.parse('2027-01-09T10:00:00+07:00'));
  r = await req('POST', '/api/christmas/shop/hat_xm26_snowclip/buy', { token: u.token });
  assert.strictEqual(r.body.code, 'EVENT_ENDED');
  at(Date.parse('2026-11-20T10:00:00+07:00'));
  r = await req('POST', '/api/christmas/starter', { token: u.token });
  assert.strictEqual(r.body.code, 'EVENT_NOT_STARTED');
  at(T0);
});

test('ผู้ดูแล: ผู้ใช้ทั่วไปเข้าไม่ได้ (403) · แก้วันเวลา/สวิตช์/ค่า Token ได้โดยไม่ deploy · เปิดเนื้อเรื่องที่ยังไม่ตรวจไม่ได้ · ปิดกิจกรรม = ทุกอย่างหยุดทันที · มีบันทึกการแก้', async () => {
  at(T0);
  const u = await makeUser(); const adm = await makeUser('xa');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  assert.strictEqual((await req('GET', '/api/admin/christmas', { token: u.token })).status, 403);
  assert.strictEqual((await req('PUT', '/api/admin/christmas', { token: u.token, body: { enabled: false } })).status, 403);
  await pool.query('DELETE FROM content_reviews');
  let r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { flags: { christmas_story: true } } });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, 'NOT_REVIEWED', 'เนื้อเรื่อง AI ยังไม่ผ่านการตรวจ → เปิดไม่ได้');
  r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { startsAt: '2026-12-31T00:00:00+07:00', endsAt: '2026-12-01T00:00:00+07:00' } });
  assert.strictEqual(r.body.code, 'BAD_RANGE');
  r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { tokens: { checkin: 25 }, flags: { christmas_snow: false } } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.settings.tokens.checkin, 25); assert.strictEqual(r.body.settings.flags.christmas_snow, false);
  assert.deepStrictEqual((await req('GET', '/api/season')).body.season.flags, { snow: false, music: true });
  await answers(u.id, 5);
  r = await req('POST', '/api/christmas/checkin', { token: u.token });
  assert.strictEqual(r.body.tokens, 25, 'ค่า Token ใหม่มีผลทันที');
  r = await req('PUT', '/api/admin/christmas', { token: adm.token, body: { enabled: false } });
  assert.strictEqual(r.body.status, 'disabled');
  assert.strictEqual((await req('POST', '/api/christmas/starter', { token: u.token })).body.code, 'EVENT_DISABLED');
  assert.notStrictEqual(SEASON.active() && SEASON.active().key, 'christmas', 'ปิดธีมด้วย');
  assert.ok((await pool.query("SELECT COUNT(*)::int AS n FROM season_settings_log WHERE season_key = 'christmas'")).rows[0].n >= 2);
  await pool.query("DELETE FROM season_settings WHERE season_key = 'christmas'"); xm._clearCache();
});

test('ไม่ลบ/ไม่แตะข้อมูลเดิม: Coin เดิมไม่เปลี่ยนจากกิจกรรม · ไม่ส่งข้อมูลส่วนตัวใน state', async () => {
  at(T0);
  const u = await makeUser();
  const coins0 = (await req('GET', '/api/coins', { token: u.token })).body;
  await answers(u.id, 5);
  await req('POST', '/api/christmas/checkin', { token: u.token });
  await req('POST', '/api/christmas/starter', { token: u.token });
  const coins1 = (await req('GET', '/api/coins', { token: u.token })).body;
  assert.strictEqual(coins1.balance, coins0.balance);
  const st = JSON.stringify((await req('GET', '/api/christmas', { token: u.token })).body);
  assert.ok(!/@|email|password/i.test(st));
});
