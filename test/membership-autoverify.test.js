/*
  สมาชิก Premium — ตรวจสลิปอัตโนมัติ (จำลองผู้ให้บริการ SlipOK ด้วย transport ทดสอบ ไม่เรียก API จริง)
  - ผ่านทุกข้อ (ธนาคารยืนยัน · ยอดตรงทุกสตางค์ · เวลาหลังสร้างคำสั่งซื้อ · ผู้รับตรง · เลขอ้างอิงไม่ซ้ำ) → อนุมัติทันที
  - ไม่ผ่านข้อใดข้อหนึ่ง / ระบบขัดข้อง → อยู่ในคิวผู้ดูแลพร้อมเหตุผล (ไม่ปฏิเสธเอง) · ผู้ดูแลกดตรวจซ้ำได้
  - เทียบผู้รับ: เลขท้ายพร้อมเพย์/บัญชีที่ถูกปิดบาง · ชื่อไทย/อังกฤษแบบย่อ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.PROMPTPAY_ID = '0812345678';
process.env.PROMPTPAY_NAME = 'สมชาย ใจดี';
process.env.PROMPTPAY_NAME_EN = 'SOMCHAI JAIDEE';

const pool = require('../config/db');
const { createApp } = require('../app');
const SV = require('../services/slipVerify');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'av') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const jpeg = () => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(3000)]).toString('base64')}`;
/** สร้างคำตอบจำลองของ SlipOK จากยอดที่ระบบส่งไป */
const okResp = (over = {}) => ({ amount }) => ({ status: 200, body: { success: true, data: {
  success: true, message: 'ok', transRef: `T${crypto.randomBytes(6).toString('hex')}`, transTimestamp: new Date().toISOString(),
  amount: Number(amount), receiver: { displayName: 'นาย สมชาย ใ', name: 'SOMCHAI J', proxy: { type: 'MSISDN', value: 'xxx-xxx-5678' }, account: { type: 'BANKAC', value: 'xxx-x-x1234-x' } },
  sender: { displayName: 'ผู้โอน' }, ...over } } });
const buyAndSlip = async (u, plan = 'monthly') => {
  const o = (await req('POST', '/api/membership/orders', { token: u.token, body: { plan } })).body;
  const r = await req('POST', `/api/membership/orders/${o.id}/slip`, { token: u.token, body: { dataUrl: jpeg() } });
  return { o, r };
};
const premium = async (u) => (await req('GET', '/api/membership', { token: u.token })).body.membership.active;

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { SV._internal.setTransport(null); server.close(); await pool.end(); });

test('เทียบผู้รับ: เลขท้ายพร้อมเพย์ · เลขท้ายบัญชี · ชื่อไทย/อังกฤษแบบย่อ · ไม่ตรง', () => {
  const m = SV._internal.receiverMatches;
  const payee = { id: '0812345678', name: 'สมชาย ใจดี', nameEn: 'SOMCHAI JAIDEE', accountSuffix: '' };
  assert.strictEqual(m({ proxy: { value: 'xxx-xxx-5678' } }, payee), true);
  assert.strictEqual(m({ proxy: { value: '066-xxx-x5678' } }, payee), true);
  assert.strictEqual(m({ proxy: { value: 'xxx-xxx-9999' } }, payee), false);
  assert.strictEqual(m({ account: { value: 'xxx-x-x4321-x' } }, payee), false, 'ไม่มีเลขบัญชีให้เทียบ');
  assert.strictEqual(m({ account: { value: 'xxx-x-x4321' } }, { ...payee, accountSuffix: '4321' }), true);
  assert.strictEqual(m({ displayName: 'นาย สมชาย ใ' }, payee), true);
  assert.strictEqual(m({ name: 'MR. SOMCHAI J' }, payee), true);
  assert.strictEqual(m({ displayName: 'นาย สมศักดิ์ ใ' }, payee), false);
  assert.strictEqual(m({ displayName: 'นาย สมชาย ก' }, payee), false, 'นามสกุลขึ้นต้นไม่ตรง');
  assert.strictEqual(m(null, payee), false);
  assert.strictEqual(SV._internal.visibleTail('xxx-xxx-8064'), '8064');
});

test('ผ่านทุกข้อ → อนุมัติทันที (ไม่ต้องรอผู้ดูแล) · บันทึกเลขอ้างอิง · ระบบส่งยอดที่ต้องโอนไปตรวจ', async () => {
  let sent = null;
  SV._internal.setTransport((x) => { sent = x; return okResp()(x); });
  const u = await makeUser();
  const { o, r } = await buyAndSlip(u, 'yearly');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'approved'); assert.strictEqual(r.body.auto.status, 'passed'); assert.strictEqual(r.body.autoApproved, true);
  assert.strictEqual(sent.amount, o.amount); assert.strictEqual(sent.mime, 'image/jpeg');
  assert.strictEqual(await premium(u), true);
  const row = (await pool.query('SELECT verify_status, verify_provider, trans_ref, reviewed_by FROM membership_orders WHERE id = $1', [o.id])).rows[0];
  assert.strictEqual(row.verify_status, 'passed'); assert.strictEqual(row.verify_provider, 'slipok'); assert.ok(row.trans_ref); assert.strictEqual(row.reviewed_by, null);
  assert.strictEqual((await req('GET', '/api/membership', { token: u.token })).body.payment.autoVerify, true);
});

test('ไม่ผ่าน → รอผู้ดูแลพร้อมเหตุผล: ยอดไม่ตรง · ผู้รับไม่ตรง · โอนก่อนสร้างคำสั่งซื้อ · เลขอ้างอิงซ้ำ · ธนาคารไม่ยืนยัน', async () => {
  const cases = [
    [({ amount }) => okResp({ amount: Number(amount) - 0.01 })({ amount }), /ยอดในสลิป/],
    [okResp({ receiver: { displayName: 'นาย ใครก็ได้ ก', proxy: { value: 'xxx-xxx-1111' } } }), /ผู้รับเงิน/],
    [okResp({ transTimestamp: new Date(Date.now() - 3600 * 1000).toISOString() }), /ก่อนสร้างคำสั่งซื้อ/],
    [() => ({ status: 400, body: { success: false, code: 1012, message: 'สลิปไม่ถูกต้อง (ทดสอบ)' } }), /สลิปไม่ถูกต้อง/],
  ];
  for (const [fn, re] of cases) {
    SV._internal.setTransport(fn);
    const u = await makeUser();
    const { r } = await buyAndSlip(u);
    assert.strictEqual(r.body.status, 'submitted', String(re)); assert.strictEqual(r.body.auto.status, 'failed');
    assert.match(r.body.auto.note, re);
    assert.strictEqual(await premium(u), false);
    const ov = (await req('GET', '/api/membership', { token: u.token })).body;
    assert.match(ov.orders[0].verifyNote, re, 'ผู้ใช้เห็นเหตุผล');
  }
  // เลขอ้างอิงเดียวกันใช้กับคำสั่งซื้อที่ 2 ไม่ได้
  const ref = `DUP${Date.now()}`;
  SV._internal.setTransport(okResp({ transRef: ref }));
  const a = await makeUser(); const b = await makeUser();
  assert.strictEqual((await buyAndSlip(a)).r.body.status, 'approved');
  const second = (await buyAndSlip(b)).r.body;
  assert.strictEqual(second.status, 'submitted'); assert.match(second.auto.note, /เคยใช้/);
  assert.strictEqual(await premium(b), false);
});

test('ระบบผู้ให้บริการขัดข้อง → รอผู้ดูแล (status error) · ผู้ดูแลกด "ตรวจอีกครั้ง" เมื่อระบบกลับมา → อนุมัติ · ผู้ใช้ทั่วไปเรียกไม่ได้', async () => {
  SV._internal.setTransport(() => { throw new Error('network down'); });
  const u = await makeUser(); const admin = await makeUser('ad');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  const { o, r } = await buyAndSlip(u);
  assert.strictEqual(r.body.status, 'submitted'); assert.strictEqual(r.body.auto.status, 'error');
  const list = (await req('GET', '/api/admin/membership/orders?status=submitted', { token: admin.token })).body;
  const row = list.orders.find((x) => x.id === o.id);
  assert.strictEqual(row.verifyStatus, 'error'); assert.ok(row.verifyNote); assert.strictEqual(list.autoVerify, true);
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o.id}/reverify`, { token: u.token })).status, 403);
  SV._internal.setTransport(okResp());
  const again = (await req('POST', `/api/admin/membership/orders/${o.id}/reverify`, { token: admin.token })).body;
  assert.strictEqual(again.status, 'approved');
  assert.strictEqual(await premium(u), true);
  assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o.id}/reverify`, { token: admin.token })).status, 409, 'อนุมัติแล้วตรวจซ้ำไม่ได้');
  const ap = (await req('GET', '/api/admin/membership/orders?status=approved', { token: admin.token })).body.orders.find((x) => x.id === o.id);
  assert.strictEqual(ap.reviewer, 'ระบบอัตโนมัติ');
});

test('ไม่ได้เปิดตรวจอัตโนมัติ → ทำงานแบบเดิม (รอผู้ดูแล) · ตรวจซ้ำไม่ได้', async () => {
  SV._internal.setTransport(null);
  const keep = [process.env.SLIPOK_API_KEY, process.env.SLIPOK_BRANCH_ID];
  delete process.env.SLIPOK_API_KEY; delete process.env.SLIPOK_BRANCH_ID;
  try {
    const u = await makeUser(); const admin = await makeUser('ad');
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const { o, r } = await buyAndSlip(u);
    assert.strictEqual(r.body.status, 'submitted'); assert.strictEqual(r.body.auto.status, 'skipped');
    assert.strictEqual((await req('POST', `/api/admin/membership/orders/${o.id}/reverify`, { token: admin.token })).status, 409);
  } finally { if (keep[0]) process.env.SLIPOK_API_KEY = keep[0]; if (keep[1]) process.env.SLIPOK_BRANCH_ID = keep[1]; }
});
