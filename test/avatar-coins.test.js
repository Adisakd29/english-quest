/*
  v1.8.0 Avatar + Coin + Wardrobe + Shop
  - Coin: รางวัล · ยอด · transaction (balance_after) · กันรางวัลซ้ำ · เพดานรายวัน · Coin ไม่แตะ EXP
  - ร้าน: ซื้อ · Coin ไม่พอ · ซื้อซ้ำ (รวมพร้อมกัน) · ราคาจากฝั่ง client ไม่ถูกใช้ · ของ Achievement ซื้อไม่ได้ · rollback
  - ตู้เสื้อผ้า: เป็นเจ้าของเท่านั้น · สวม/ถอด · ช่องจำเป็น · หมวก+หูฟัง · บันทึกถาวร · presets · หน้าตาของผู้เล่นอื่น
  - Achievement: ปลดล็อกจากข้อมูลจริง → Coin + ของ (ครั้งเดียว) · migration รันซ้ำไม่เพิ่ม Coin
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const coins = require('../services/coins');
const AV = require('../services/avatar');
const ACH = require('../services/avatar/achievements');
const { grantOnce } = require('../utils/exp');
const { WELCOME_COINS, RULES } = require('../config/coinRewards');

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
async function makeUser(prefix = 'av') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const balance = async (id) => (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [id])).rows[0].balance;
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
const setBalance = (id, n) => pool.query('UPDATE coin_wallets SET balance = $2 WHERE user_id = $1', [id, n]);
const owns = async (id, item) => (await pool.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [id, item])).rowCount === 1;

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  const app = createApp();
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('บัญชีใหม่: กระเป๋า + Coin ต้อนรับ + ของเริ่มต้น + ชุดเริ่มต้น (ครั้งเดียว)', async () => {
  const u = await makeUser();
  const me = await req('GET', '/api/avatar/me', { token: u.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.wallet.balance, WELCOME_COINS);
  for (const s of ['body', 'face', 'hair', 'top', 'bottom', 'shoes']) assert.ok(me.body.outfit[s], `starter ${s}`);
  const inv = me.body.inventory.map((x) => x.itemId);
  const count = (pre) => inv.filter((i) => i.startsWith(pre)).length;
  assert.ok(count('hair_') >= 3 && count('top_') >= 3 && count('bottom_') >= 2 && count('shoes_') >= 2 && count('acc_') >= 1, 'starter inventory 3/3/2/2/1');
  await AV.ensureUser(u.id); await AV.ensureUser(u.id);
  assert.strictEqual(await balance(u.id), WELCOME_COINS, 'ensure ซ้ำไม่เพิ่ม Coin');
  const t = await pool.query("SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = 'WELCOME'", [u.id]);
  assert.strictEqual(t.rows[0].n, 1);
});

test('รางวัล Coin: ยอด + transaction (balance_after) + กันรางวัลซ้ำ (รวมส่งพร้อมกัน)', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const r = await Promise.all(Array.from({ length: 6 }, () => coins.grant(u.id, { type: 'GRAMMAR_LESSON', key: 'x:glc:test-topic' })));
  assert.strictEqual(r.filter((x) => x.granted).length, 1, 'ได้ครั้งเดียว');
  assert.strictEqual(await balance(u.id), WELCOME_COINS + RULES.GRAMMAR_LESSON.amount);
  const h = await req('GET', '/api/coins/history', { token: u.token });
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.body.items[0].amount, 10);
  assert.strictEqual(h.body.items[0].balanceAfter, WELCOME_COINS + 10);
  assert.ok(h.body.items.every((x) => x.id && x.type && x.at && x.description));
  const w = await req('GET', '/api/coins/wallet', { token: u.token });
  assert.strictEqual(w.body.balance, WELCOME_COINS + 10);
});

test('Hook จาก grantOnce: บทเรียนครั้งแรกได้ EXP + Coin · ซ้ำไม่ได้ทั้งคู่ · Coin ไม่ไปเพิ่ม EXP', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const exp0 = await userExp(u.id);
  const g1 = await grantOnce(u.id, 'glc:hook-topic', 30, { reason: 'grammar_lesson' });
  assert.strictEqual(g1.gained, 30);
  assert.strictEqual(g1.coins, 10);
  assert.strictEqual(await userExp(u.id), exp0 + 30, 'EXP เท่ากับรางวัล EXP เดิมเท่านั้น');
  const g2 = await grantOnce(u.id, 'glc:hook-topic', 30, { reason: 'grammar_lesson' });
  assert.strictEqual(g2.already, true);
  assert.strictEqual(await balance(u.id), WELCOME_COINS + 10);
  // key ที่ไม่มีรางวัล Coin (เช่นตอบรายข้อ) -> ไม่ได้ Coin
  const g3 = await grantOnce(u.id, 'glq:hook-topic:1', 2, { reason: 'grammar_question' });
  assert.strictEqual(g3.coins, 0);
});

test('รางวัลทบทวน: มีเพดานรายวัน', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const lim = RULES.REVIEW_SESSION.dailyLimit;
  const out = [];
  for (let i = 0; i < lim + 3; i++) out.push(await coins.grant(u.id, { type: 'REVIEW_SESSION', key: `x:glxp:r${i}` }));
  assert.strictEqual(out.filter((x) => x.granted).length, lim);
  assert.strictEqual(out[lim].reason, 'daily_limit');
});

test('ซื้อของ: Coin ลด · อยู่ในตู้ · ราคาที่ client ส่งมาไม่ถูกใช้ · Coin ไม่แตะ EXP', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const exp0 = await userExp(u.id);
  const price = (await pool.query("SELECT price FROM avatar_items WHERE id = 'hat_cap_red'")).rows[0].price;
  const r = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'hat_cap_red', price: 1 } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.price, price);
  assert.strictEqual(r.body.balance, WELCOME_COINS - price);
  assert.strictEqual(await balance(u.id), WELCOME_COINS - price);
  assert.ok(await owns(u.id, 'hat_cap_red'));
  const t = (await pool.query("SELECT amount, balance_after, type FROM coin_transactions WHERE user_id = $1 AND source_key = 'buy:hat_cap_red'", [u.id])).rows[0];
  assert.deepStrictEqual([t.amount, t.balance_after, t.type], [-price, WELCOME_COINS - price, 'ITEM_PURCHASE']);
  assert.strictEqual(await userExp(u.id), exp0, 'EXP ไม่เปลี่ยน');
  const shop = await req('GET', '/api/avatar/shop?section=hats', { token: u.token });
  assert.ok(shop.body.items.find((i) => i.id === 'hat_cap_red').owned);
});

test('Coin ไม่พอ: ซื้อไม่ได้ · ยอดและของไม่เปลี่ยน', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const r = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'back_jetpack' } });
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.code, 'INSUFFICIENT');
  assert.strictEqual(await balance(u.id), WELCOME_COINS);
  assert.ok(!(await owns(u.id, 'back_jetpack')));
});

test('ซื้อซ้ำไม่ได้ (รวมส่งพร้อมกัน) · หักเงินครั้งเดียว', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  await setBalance(u.id, 1000);
  const rs = await Promise.all(Array.from({ length: 5 }, () => req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'glasses_round' } })));
  assert.strictEqual(rs.filter((r) => r.status === 200).length, 1);
  assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.body.code === 'ALREADY_OWNED'));
  const price = (await pool.query("SELECT price FROM avatar_items WHERE id = 'glasses_round'")).rows[0].price;
  assert.strictEqual(await balance(u.id), 1000 - price);
  const again = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'glasses_round' } });
  assert.strictEqual(again.status, 409);
});

test('ของ Achievement / ของเริ่มต้น / ไอดีปลอม ซื้อไม่ได้ · ไม่ล็อกอินซื้อไม่ได้', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  await setBalance(u.id, 99999);
  const a = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'hat_crown_vocab' } });
  assert.strictEqual(a.status, 403); assert.strictEqual(a.body.code, 'ACHIEVEMENT_ONLY');
  const s = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'body_tan' } });
  assert.strictEqual(s.status, 403);
  const f = await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: "x'; drop table users;--" } });
  assert.strictEqual(f.status, 404);
  const n = await req('POST', '/api/avatar/purchase', { body: { itemId: 'hat_cap_red' } });
  assert.strictEqual(n.status, 401);
  assert.strictEqual(await balance(u.id), 99999);
});

test('Purchase rollback: พังหลังหัก Coin -> ยอด/transaction/ของ ย้อนทั้งหมด', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const tx0 = (await pool.query('SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1', [u.id])).rows[0].n;
  AV._setFailAfterDebit(true);
  try { await assert.rejects(AV.purchase(u.id, 'hat_beanie_teal')); } finally { AV._setFailAfterDebit(false); }
  assert.strictEqual(await balance(u.id), WELCOME_COINS);
  assert.ok(!(await owns(u.id, 'hat_beanie_teal')));
  const tx1 = (await pool.query('SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1', [u.id])).rows[0].n;
  assert.strictEqual(tx1, tx0);
  const ok = await AV.purchase(u.id, 'hat_beanie_teal');   // หลังแก้แล้วซื้อได้ปกติ
  assert.ok(ok.balance >= 0 && await owns(u.id, 'hat_beanie_teal'));
});

test('สวม / ถอด / บันทึกถาวร · ต้องเป็นเจ้าของ · ช่องจำเป็น · หมวก+หูฟัง · ช่องผิด', async () => {
  const u = await makeUser();
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const base0 = me.outfit;
  // ของที่ไม่มี
  const no = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...base0, hat: 'hat_wizard' } } });
  assert.strictEqual(no.status, 403); assert.strictEqual(no.body.code, 'NOT_OWNED');
  // ซื้อแล้วสวม
  await setBalance(u.id, 5000);
  await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'hat_wizard' } });
  await req('POST', '/api/avatar/purchase', { token: u.token, body: { itemId: 'phones_basic' } });
  const eq = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...base0, hat: 'hat_wizard', top: null } } });
  assert.strictEqual(eq.status, 200, JSON.stringify(eq.body));
  let after = (await req('GET', '/api/avatar/me', { token: u.token })).body.outfit;
  assert.strictEqual(after.hat, 'hat_wizard'); assert.strictEqual(after.top, null, 'ถอดเสื้อได้ (มีเสื้อชั้นในพื้นฐาน)');
  const lastEq = (await pool.query("SELECT last_equipped_at FROM user_inventory WHERE user_id = $1 AND item_id = 'hat_wizard'", [u.id])).rows[0];
  assert.ok(lastEq.last_equipped_at);
  // ถอดหมวก
  await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...after, hat: null } } });
  after = (await req('GET', '/api/avatar/me', { token: u.token })).body.outfit;
  assert.strictEqual(after.hat, null);
  // กติกา
  const both = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...after, hat: 'hat_wizard', headphones: 'phones_basic' } } });
  assert.strictEqual(both.body.code, 'CONFLICT');
  const req1 = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...after, hair: null } } });
  assert.strictEqual(req1.body.code, 'REQUIRED_SLOT');
  const wrong = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...after, glasses: 'hat_wizard' } } });
  assert.strictEqual(wrong.body.code, 'WRONG_SLOT');
  const extra = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...after, hat2: 'hat_wizard' } } });
  assert.strictEqual(extra.body.code, 'BAD_SLOT');
});

test('Presets 3 ช่อง · ใช้ชุดที่บันทึก · หน้าตาของผู้เล่นอื่น (looks)', async () => {
  const u = await makeUser();
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const p = await req('PUT', '/api/avatar/presets/2', { token: u.token, body: { name: 'School <b>', outfit: { ...me.outfit, accessory: 'acc_watch' } } });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.body.preset.name, 'School b');
  assert.strictEqual((await req('PUT', '/api/avatar/presets/4', { token: u.token, body: { outfit: me.outfit } })).status, 400);
  const ap = await req('POST', '/api/avatar/presets/2/apply', { token: u.token });
  assert.strictEqual(ap.status, 200);
  const o = await req('GET', '/api/avatar/me', { token: u.token });
  assert.strictEqual(o.body.outfit.accessory, 'acc_watch');
  const other = await makeUser();
  const l = await req('GET', `/api/avatar/looks?ids=${u.id},${other.id},abc`, { token: other.token });
  assert.strictEqual(l.status, 200);
  // ยังไม่ได้เลือกใช้ Avatar เป็นรูปโปรไฟล์ -> ไม่ส่งชุดให้คนอื่น (Privacy)
  assert.strictEqual(l.body.looks[u.id].enabled, false); assert.strictEqual(l.body.looks[u.id].outfit, null);
  assert.strictEqual(l.body.looks[other.id].outfit, null);
  await req('PUT', '/api/avatar/display', { token: u.token, body: { useAvatar: true } });
  const l2 = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: other.token });
  assert.strictEqual(l2.body.looks[u.id].outfit.accessory, 'acc_watch');
});

test('Achievement: ปลดล็อกจากข้อมูลจริง -> Coin + ของ (ครั้งเดียว · ซื้อไม่ได้)', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  for (const t of ['t1', 't2', 't3', 't4', 't5']) {
    await pool.query('INSERT INTO grammar_lessons (user_id, topic_id, mastered_at) VALUES ($1, $2, NOW())', [u.id, `ach-${t}`]);
  }
  const b0 = await balance(u.id);
  const un = await ACH.evaluate(u.id, { force: true });
  assert.ok(un.includes('grammar_master'));
  assert.ok(await owns(u.id, 'glasses_grammar'));
  const acq = (await pool.query("SELECT acquisition_type FROM user_inventory WHERE user_id = $1 AND item_id = 'glasses_grammar'", [u.id])).rows[0];
  assert.strictEqual(acq.acquisition_type, 'achievement');
  const b1 = await balance(u.id);
  assert.ok(b1 >= b0 + 100, 'Coin จาก Achievement (+ Mastery)');
  const again = await ACH.evaluate(u.id, { force: true });
  assert.ok(!again.includes('grammar_master'));
  assert.strictEqual(await balance(u.id), b1, 'ประเมินซ้ำไม่ได้ซ้ำ');
  const list = await req('GET', '/api/achievements', { token: u.token });
  const gm = list.body.achievements.find((a) => a.id === 'grammar_master');
  assert.ok(gm.unlocked); assert.strictEqual(gm.progress, 5);
  // สวมของ Achievement ได้
  const me = (await req('GET', '/api/avatar/me', { token: u.token })).body;
  const eq = await req('PUT', '/api/avatar/outfit', { token: u.token, body: { outfit: { ...me.outfit, glasses: 'glasses_grammar' } } });
  assert.strictEqual(eq.status, 200);
});

test('Mastery coin นับเฉพาะหลังเปิดระบบ (ไม่แจกย้อนหลัง) · เป้าหมายรายวันจาก answer_events', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  await pool.query("INSERT INTO grammar_lessons (user_id, topic_id, mastered_at) VALUES ($1, 'old-topic', NOW() - INTERVAL '30 days')", [u.id]);
  await pool.query("INSERT INTO grammar_lessons (user_id, topic_id, mastered_at) VALUES ($1, 'new-topic', NOW() + INTERVAL '1 second')", [u.id]);
  for (let i = 0; i < 20; i++) await pool.query("INSERT INTO answer_events (user_id, skill, item_id, correct) VALUES ($1, 'vocab', $2, TRUE)", [u.id, `w${i}`]);
  await ACH.evaluate(u.id, { force: true });
  const keys = (await pool.query('SELECT source_key FROM coin_transactions WHERE user_id = $1', [u.id])).rows.map((r) => r.source_key);
  assert.ok(keys.includes('gm:new-topic'));
  assert.ok(!keys.includes('gm:old-topic'));
  assert.ok(keys.some((k) => k.startsWith('goal:')), 'เป้าหมายรายวัน');
  assert.ok(keys.includes('ach:first_steps'));
  const s = await req('GET', '/api/coins/since?after=0', { token: u.token });
  assert.ok(s.body.items.length >= 3 && s.body.balance === await balance(u.id));
});

test('Migration รันซ้ำ: ไม่เพิ่ม Coin ต้อนรับ / ของซ้ำ', async () => {
  const u = await makeUser();
  await AV.ensureUser(u.id);
  const inv0 = (await pool.query('SELECT COUNT(*)::int AS n FROM user_inventory WHERE user_id = $1', [u.id])).rows[0].n;
  const mig = require('../migrations/047_avatar_backfill');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await mig.run(client); await mig.run(client); await client.query('COMMIT'); } finally { client.release(); }
  assert.strictEqual(await balance(u.id), WELCOME_COINS);
  const inv1 = (await pool.query('SELECT COUNT(*)::int AS n FROM user_inventory WHERE user_id = $1', [u.id])).rows[0].n;
  assert.strictEqual(inv1, inv0);
  const exists = (await pool.query("SELECT COUNT(*)::int AS n FROM coin_transactions WHERE source_key = 'welcome' GROUP BY user_id HAVING COUNT(*) > 1")).rowCount;
  assert.strictEqual(exists, 0);
});

test('Admin: แก้ราคา/ปิดขาย มีผลทันที · ผู้ใช้ทั่วไปเข้าไม่ได้', async () => {
  const admin = await makeUser('adm');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  const user = await makeUser();
  assert.strictEqual((await req('GET', '/api/admin/avatar', { token: user.token })).status, 403);
  const l = await req('GET', '/api/admin/avatar', { token: admin.token });
  assert.strictEqual(l.status, 200); assert.ok(l.body.items.length >= 40);
  const up = await req('PUT', '/api/admin/avatar/bg_library', { token: admin.token, body: { price: 77 } });
  assert.strictEqual(up.status, 200);
  const r = await req('POST', '/api/avatar/purchase', { token: user.token, body: { itemId: 'bg_library' } });
  assert.strictEqual(r.body.price, 77);
  await req('PUT', '/api/admin/avatar/bg_sunset', { token: admin.token, body: { active: false } });
  const off = await req('POST', '/api/avatar/purchase', { token: user.token, body: { itemId: 'bg_sunset' } });
  assert.strictEqual(off.status, 404);
  const bad = await req('POST', '/api/admin/avatar/upload', { token: admin.token, body: { dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')}` } });
  assert.strictEqual(bad.status, 400);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const ok = await req('POST', '/api/admin/avatar/upload', { token: admin.token, body: { dataUrl: `data:image/png;base64,${png}` } });
  assert.strictEqual(ok.status, 200);
  const asset = await new Promise((res) => http.get(base + ok.body.url, (x) => { x.resume(); res(x); }));
  assert.strictEqual(asset.statusCode, 200);
  const c = await req('POST', '/api/admin/avatar', { token: admin.token, body: { id: 'hat_test_upload', slot: 'hat', name: 'Test Hat', price: 120, rarity: 'common', assetUrl: ok.body.url, active: true } });
  assert.strictEqual(c.status, 200, JSON.stringify(c.body));
  const shop = await req('GET', '/api/avatar/shop?section=hats&size=48', { token: user.token });
  assert.ok(shop.body.items.some((i) => i.id === 'hat_test_upload'));
});
