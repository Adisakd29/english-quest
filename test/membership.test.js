/*
  สมาชิก Premium (รายเดือน/รายปี) — PromptPay QR + สลิป + ผู้ดูแลอนุมัติ
  - QR: CRC16 มาตรฐาน · payload มียอดเงิน · ยอดเฉพาะไม่ซ้ำกัน · ไม่เปิดรับชำระ (ไม่ตั้ง PROMPTPAY_ID) = 503
  - สลิป: ชนิด/ขนาด/magic bytes · สลิปเดียวใช้ซ้ำไม่ได้ · คำสั่งซื้อหมดอายุแนบไม่ได้ · คนอื่นเข้าถึงไม่ได้
  - ผู้ดูแล: ผู้ใช้ทั่วไปเข้าไม่ได้ · ดูสลิป (no-store) · อนุมัติ = เปิดสิทธิ์ · อนุมัติซ้ำไม่ได้ · ต่ออายุต่อจากวันเดิม · ปฏิเสธต้องมีเหตุผล
  - ไม่แตะ EXP / Coin · ป้ายใน /me และกระดานอันดับ · ตัวช่วยรักษา Streak เฉพาะ Premium
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.PROMPTPAY_ID = '0812345678';
process.env.PROMPTPAY_NAME = 'บัญชีทดสอบ';

const pool = require('../config/db');
const { createApp } = require('../app');
const PP = require('../utils/promptpay');
const D = require('../services/toeic/daily');

let server; let base;
function req(method, p, { token, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null; if (!raw) { try { json = buf.length ? JSON.parse(buf.toString()) : null; } catch (_) { json = null; } }
        resolve({ status: res.statusCode, body: json, buf, headers: res.headers });
      });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'pm') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function makeAdmin() {
  const u = await makeUser('pa');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);   // role อ่านจากฐานข้อมูลทุกคำขอ
  return u;
}
const jpeg = (n = 3000) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n)]).toString('base64')}`;
const order = (u, plan = 'monthly') => req('POST', '/api/membership/orders', { token: u.token, body: { plan } });
const slip = (u, id, dataUrl = jpeg()) => req('POST', `/api/membership/orders/${id}/slip`, { token: u.token, body: { dataUrl, paidAt: '14:05 <b>' } });

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('PromptPay payload: CRC16-CCITT มาตรฐาน · โครงสร้าง EMVCo · ยอดเงิน · เบอร์/เลขบัตร/อื่น ๆ', () => {
  assert.strictEqual(PP.crc16('123456789'), '29B1');
  const p = PP.payload('081-234-5678', 59.37);
  assert.ok(p.startsWith('000201010212'));
  assert.ok(p.includes('29370016A00000067701011101130066812345678'));
  assert.ok(p.includes('5303764') && p.includes('540559.37') && p.includes('5802TH'));
  assert.strictEqual(p.slice(-4), PP.crc16(p.slice(0, -4)));
  assert.ok(PP.payload('1234567890123').includes('02131234567890123'));
  assert.ok(PP.payload('0812345678').startsWith('000201010211') && !PP.payload('0812345678').includes('5405'));
  assert.strictEqual(PP.valid('12345'), false);
  assert.throws(() => PP.payload('0812345678', -1));
});

test('คำสั่งซื้อ: ยอดเฉพาะ (มีเศษสตางค์ ไม่ซ้ำ) · QR · สร้างใหม่ยกเลิกอันเดิม · แผนผิด · คนอื่นเข้าไม่ได้ · ต้องล็อกอิน', async () => {
  assert.strictEqual((await req('GET', '/api/membership')).status, 401);
  const u = await makeUser(); const v = await makeUser(); const w = await makeUser();
  const ov = (await req('GET', '/api/membership', { token: u.token })).body;
  assert.deepStrictEqual(ov.plans.map((p) => [p.id, p.price, p.days]), [['monthly', 39, 30], ['yearly', 299, 365]]);
  assert.strictEqual(ov.payment.ready, true); assert.strictEqual(ov.membership.active, false);
  assert.strictEqual((await order(u, 'lifetime')).status, 400);
  assert.strictEqual((await order(u, 'constructor')).status, 400);
  const a = (await order(u)).body;
  assert.match(a.amount, /^39\.\d\d$/); assert.notStrictEqual(a.amount, '39.00');
  assert.strictEqual(a.status, 'pending'); assert.strictEqual(a.payeeName, 'บัญชีทดสอบ');
  assert.ok(a.qr.svg.startsWith('<svg') && a.qr.payload.includes(`54${String(a.amount.length).padStart(2, '0')}${a.amount}`));
  const amounts = [a.amount, (await order(v)).body.amount, (await order(w)).body.amount];
  assert.strictEqual(new Set(amounts).size, 3, 'ยอดไม่ซ้ำกันระหว่างคำสั่งซื้อที่ค้าง');
  const b = (await order(u, 'yearly')).body;
  assert.match(b.amount, /^299\.\d\d$/);
  assert.strictEqual((await req('GET', `/api/membership/orders/${a.id}`, { token: u.token })).body.status, 'cancelled', 'สร้างใหม่ = ยกเลิกอันเดิม');
  assert.strictEqual((await req('GET', `/api/membership/orders/${b.id}`, { token: v.token })).status, 404);
  assert.strictEqual((await slip(v, b.id)).status, 404);
  assert.strictEqual((await req('GET', '/api/membership/orders/abc', { token: u.token })).status, 404);
});

test('สลิป: ชนิด/ขนาด/magic bytes · ใช้ซ้ำไม่ได้ · หมดอายุแนบไม่ได้ · ยกเลิก · รอตรวจได้ไม่เกิน 2', async () => {
  const u = await makeUser();
  let o = (await order(u)).body;
  assert.strictEqual((await slip(u, o.id, 'data:image/gif;base64,R0lGODlh')).status, 400);
  assert.strictEqual((await slip(u, o.id, 'javascript:alert(1)')).status, 400);
  assert.strictEqual((await slip(u, o.id, `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...crypto.randomBytes(2000)]).toString('base64')}`)).status, 400, 'ชนิดไม่ตรงกับเนื้อไฟล์');
  assert.strictEqual((await slip(u, o.id, `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff]).toString('base64')}`)).status, 400);
  assert.strictEqual((await slip(u, o.id, jpeg(1050000))).status, 413);
  const s1 = jpeg();
  const r = await slip(u, o.id, s1);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'submitted');
  const note = (await pool.query('SELECT paid_at_note FROM membership_orders WHERE id = $1', [o.id])).rows[0].paid_at_note;
  assert.ok(!note.includes('<'), 'ตัด < > ออก');
  assert.strictEqual((await slip(u, o.id)).status, 409, 'แนบซ้ำในคำสั่งซื้อเดิมไม่ได้');
  o = (await order(u)).body;
  const dup = await slip(u, o.id, s1);
  assert.strictEqual(dup.status, 409); assert.strictEqual(dup.body.code, 'SLIP_USED');
  await pool.query("UPDATE membership_orders SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [o.id]);
  const ex = await slip(u, o.id);
  assert.strictEqual(ex.status, 409); assert.strictEqual(ex.body.code, 'ORDER_EXPIRED');
  o = (await order(u)).body;
  assert.strictEqual((await req('POST', `/api/membership/orders/${o.id}/cancel`, { token: u.token })).body.ok, true);
  assert.strictEqual((await req('POST', `/api/membership/orders/${o.id}/cancel`, { token: u.token })).status, 409);
  o = (await order(u)).body; await slip(u, o.id);
  const third = await order(u);
  assert.strictEqual(third.status, 409); assert.strictEqual(third.body.code, 'WAITING');
  const ov = (await req('GET', '/api/membership', { token: u.token })).body;
  assert.ok(ov.orders.every((x) => !('slip_image' in x) && !('slipImage' in x)), 'ไม่ส่งรูปสลิปกลับให้หน้าเว็บ');
});

test('ผู้ดูแล: สิทธิ์ · ดูสลิป · อนุมัติเปิด Premium (ไม่แตะ EXP/Coin) · อนุมัติซ้ำไม่ได้ · ต่ออายุต่อจากวันเดิม · ปฏิเสธต้องมีเหตุผล · ป้าย', async () => {
  const u = await makeUser(); const admin = await makeAdmin();
  const o = (await order(u)).body; const s = jpeg(5000); await slip(u, o.id, s);
  assert.strictEqual((await req('GET', '/api/admin/membership/orders', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o.id}/approve`, { token: u.token })).status, 403);
  assert.strictEqual((await req('GET', `/api/admin/membership/orders/${o.id}/slip`, { token: u.token, raw: true })).status, 403);
  const list = (await req('GET', '/api/admin/membership/orders?status=submitted', { token: admin.token })).body;
  const row = list.orders.find((x) => x.id === o.id);
  assert.ok(row && row.username === u.name && row.amount === o.amount && row.slipAvailable);
  const img = await req('GET', `/api/admin/membership/orders/${o.id}/slip`, { token: admin.token, raw: true });
  assert.strictEqual(img.status, 200); assert.strictEqual(img.headers['content-type'], 'image/jpeg');
  assert.match(img.headers['cache-control'], /no-store/);
  assert.ok(img.buf.equals(Buffer.from(s.split(',')[1], 'base64')));
  const before = (await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp;
  const coins0 = (await pool.query('SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1', [u.id])).rows[0].n;
  const ap = await req('POST', `/api/admin/membership/orders/${o.id}/approve`, { token: admin.token, body: {} });
  assert.strictEqual(ap.status, 200);
  const me = (await req('GET', '/api/auth/me', { token: u.token })).body.user;
  assert.strictEqual(me.premium.active, true);
  const st = (await req('GET', '/api/membership', { token: u.token })).body.membership;
  assert.strictEqual(st.active, true); assert.strictEqual(st.plan, 'monthly'); assert.ok(st.daysLeft >= 29 && st.daysLeft <= 30);
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp, before, 'EXP ไม่เปลี่ยน');
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1', [u.id])).rows[0].n, coins0, 'Coin ไม่เปลี่ยน');
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o.id}/approve`, { token: admin.token, body: {} })).status, 409);
  // ต่ออายุรายปี → ต่อจากวันหมดอายุเดิม
  const o2 = (await order(u, 'yearly')).body; await slip(u, o2.id);
  await req('POST', `/api/admin/membership/orders/${o2.id}/approve`, { token: admin.token, body: {} });
  const st2 = (await req('GET', '/api/membership', { token: u.token })).body.membership;
  assert.ok(st2.daysLeft >= 394 && st2.daysLeft <= 395, `ต่อจากเดิม ${st2.daysLeft}`); assert.strictEqual(st2.plan, 'yearly');
  // ปฏิเสธ
  const o3 = (await order(u)).body; await slip(u, o3.id);
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o3.id}/reject`, { token: admin.token, body: { note: '  ' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o3.id}/reject`, { token: admin.token, body: { note: 'ยอดไม่ตรง <script>' } })).status, 200);
  const h = (await req('GET', '/api/membership', { token: u.token })).body.orders.find((x) => x.id === o3.id);
  assert.strictEqual(h.status, 'rejected'); assert.strictEqual(h.adminNote, 'ยอดไม่ตรง script');
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o3.id}/approve`, { token: admin.token, body: {} })).status, 409);
  // ป้ายในกระดานอันดับ (ต้องมีคะแนนก่อน)
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 5, 'test') ", [u.id]).catch(() => {});
  await pool.query('UPDATE users SET exp = exp + 5 WHERE id = $1', [u.id]);
  const lb = (await req('GET', '/api/leaderboard?period=all', { token: u.token })).body;
  assert.strictEqual(lb.me.premium, true);
});

test('ไม่เปิดรับชำระ (ไม่ตั้ง PROMPTPAY_ID) → 503 · หน้า overview บอกสถานะ', async () => {
  const u = await makeUser();
  const keep = process.env.PROMPTPAY_ID; delete process.env.PROMPTPAY_ID;
  try {
    assert.strictEqual((await order(u)).status, 503);
    assert.strictEqual((await req('GET', '/api/membership', { token: u.token })).body.payment.ready, false);
  } finally { process.env.PROMPTPAY_ID = keep; }
});

test('ตัวช่วยรักษา Streak: Premium พลาด 1 วันไม่ขาด (เดือนละ 2) · ผู้ใช้ทั่วไปขาด', async () => {
  const today = D._internal.bkkDay(); const day = (n) => D._internal.addDays(today, n);
  const seed = async (uid, ns) => { for (const n of ns) await pool.query(`INSERT INTO toeic_daily_plans (user_id, day, tasks, completed_at) VALUES ($1, $2, '[]', NOW())`, [uid, day(n)]); };
  const free = await makeUser(); const prem = await makeUser();
  await seed(free.id, [0, -1, -3]); await seed(prem.id, [0, -1, -3]);
  await pool.query(`INSERT INTO memberships (user_id, plan, expires_at) VALUES ($1, 'monthly', NOW() + INTERVAL '10 days')`, [prem.id]);
  assert.strictEqual((await D._internal.streakOf(free.id, today)).current, 2);
  const p = await D._internal.streakOf(prem.id, today);
  assert.strictEqual(p.current, 3); assert.strictEqual(p.week[4].frozen, true); assert.strictEqual(p.week[4].done, false);
  assert.ok(p.freeze && p.freeze.perMonth === 2);
  // พลาด 2 วันติด → ขาด
  const prem2 = await makeUser();
  await seed(prem2.id, [0, -3]);
  await pool.query(`INSERT INTO memberships (user_id, plan, expires_at) VALUES ($1, 'monthly', NOW() + INTERVAL '10 days')`, [prem2.id]);
  assert.strictEqual((await D._internal.streakOf(prem2.id, today)).current, 1);
});
