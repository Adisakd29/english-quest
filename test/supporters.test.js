/*
  v1.28.0 บอร์ดผู้สนับสนุน
  - อ่านรูปแบบวันเวลาจากหน้า ezdn (09 พ.ย. 09:28:15 · 2026-11-09 09:28 · 09/11/2569) เป็นเวลาไทย
  - ผู้ใช้ทั่วไปใช้ API ผู้ดูแลไม่ได้ (403) · ต้องใส่เหตุผล · บันทึก Audit Log
  - ตรวจก่อนนำเข้า (dry run) ไม่บันทึก · บรรทัดผิดแจ้งเลขบรรทัด · นำเข้าซ้ำข้ามให้เอง
  - บอร์ดรวมยอดชื่อเดียวกัน · เรียงยอดมาก→น้อย · ซ่อนแล้วไม่แสดง · ปิดแสดงยอดเงินได้ · ไม่มีข้อมูลอื่นนอกจากชื่อ/ยอด/ระดับ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const S = require('../services/supporters');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + p, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null, raw: buf }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
let n = 0;
async function makeUser(admin) {
  n += 1;
  const name = `sp${Date.now() % 1e7}${n}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  if (admin) await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [r.body.user.id]);
  return { token: r.body.token, id: r.body.user.id };
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await pool.query('DELETE FROM supporter_donations'); await pool.query("DELETE FROM app_settings WHERE key = 'supporters'");
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('อ่านวันเวลาแบบหน้า ezdn เป็นเวลาไทย · ไม่มีปี = ปีล่าสุดที่ไม่เกินวันนี้', () => {
  const now = new Date('2026-11-26T14:00:00Z');
  assert.strictEqual(S.parseDate('09 พ.ย. 09:28:15', now).toISOString(), '2026-11-09T02:28:15.000Z');
  assert.strictEqual(S.parseDate('18 ต.ค. 10:24:54', now).toISOString(), '2026-10-18T03:24:54.000Z');
  assert.strictEqual(S.parseDate('20 ธ.ค. 10:00', now).toISOString(), '2025-12-20T03:00:00.000Z', 'ธ.ค. ยังไม่ถึง → ปีที่แล้ว');
  assert.strictEqual(S.parseDate('2026-11-09 09:28', now).toISOString(), '2026-11-09T02:28:00.000Z');
  assert.strictEqual(S.parseDate('09/11/2569 09:28', now).toISOString(), '2026-11-09T02:28:00.000Z', 'ปี พ.ศ.');
  assert.strictEqual(S.parseDate('เมื่อวาน', now), null);
  assert.strictEqual(S.parseDate('32 พ.ย. 10:00', now), null);
  const p = S.parseImport('Mango | 100 บาท | 09 พ.ย. 09:28:15 | พร้อมเพย์\n\nแมวส้ม\t50.01\t07 พ.ย. 11:31:30\tทรูมันนี่\nไม่มียอด | | 07 พ.ย. 11:31\nX | 10 | พรุ่งนี้', now);
  assert.deepStrictEqual(p.rows.map((r) => [r.name, r.satang, r.channel]), [['Mango', 10000, 'พร้อมเพย์'], ['แมวส้ม', 5001, 'ทรูมันนี่']]);
  assert.deepStrictEqual(p.errors.map((e) => e.line), [3, 4]);
  assert.deepStrictEqual(['bronze', 'silver', 'gold'], [S.tierOf(20).id, S.tierOf(100).id, S.tierOf(500).id]);
});

const SAMPLE = [
  'Mango | 100 | 09 พ.ย. 09:28:15 | พร้อมเพย์',
  'แมวส้ม | 50.01 | 07 พ.ย. 11:31:30 | ทรูมันนี่',
  'Lumi | 60.01 | 07 พ.ย. 00:11:35 | ทรูมันนี่',
  'Tester4 | 20.01 | 18 ต.ค. 10:24:54 | ทรูมันนี่',
  'Tester5 | 20 | 17 ต.ค. 12:08:08 | พร้อมเพย์',
  'ผู้ทดสอบ6 | 20 | 17 ต.ค. 01:23:40 | พร้อมเพย์',
  'lumi | 50 | 01 พ.ย. 10:00 | พร้อมเพย์',
].join('\n');

test('สิทธิ์: ผู้ใช้ทั่วไปใช้ API ผู้ดูแลไม่ได้ · ไม่เข้าสู่ระบบดูบอร์ดไม่ได้ · ต้องใส่เหตุผล', async () => {
  const u = await makeUser(false); const a = await makeUser(true);
  assert.strictEqual((await req('GET', '/api/admin/supporters', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', '/api/admin/supporters/import', { token: u.token, body: { text: SAMPLE, reason: 'test' } })).status, 403);
  assert.strictEqual((await req('GET', '/api/supporters')).status, 401);
  const r = await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: SAMPLE } });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, 'REASON');
});

test('นำเข้า: ตรวจก่อนไม่บันทึก · นำเข้าจริง · ซ้ำข้ามให้เอง · Audit Log · บอร์ดรวมชื่อเดียวกันและเรียงยอด', async () => {
  const a = await makeUser(true); const u = await makeUser(false);
  const dry = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: SAMPLE, reason: 'ตรวจ', dryRun: true } })).body;
  assert.strictEqual(dry.dryRun, true); assert.strictEqual(dry.ok, 7);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM supporter_donations')).rows[0].n, 0, 'dry run ไม่บันทึก');
  const bad = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: `${SAMPLE}\nเสีย | abc | 1 พ.ย.`, reason: 'นำเข้า' } })).body;
  assert.strictEqual(bad.dryRun, true); assert.strictEqual(bad.errors[0].line, 8);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM supporter_donations')).rows[0].n, 0, 'มีบรรทัดผิด = ไม่นำเข้าเลย');
  const ok = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: SAMPLE, reason: 'อัปเดตจากหน้า ezdn' } })).body;
  assert.deepStrictEqual(ok, { added: 7, duplicates: 0 });
  const again = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: SAMPLE, reason: 'ซ้ำ' } })).body;
  assert.deepStrictEqual(again, { added: 0, duplicates: 7 });
  const logs = await pool.query("SELECT action, reason FROM supporter_admin_logs WHERE admin_id = $1 ORDER BY id", [a.id]);
  assert.deepStrictEqual(logs.rows.map((x) => x.action), ['import', 'import']);
  const b = await req('GET', '/api/supporters', { token: u.token });
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.body.supporters, 6);
  assert.deepStrictEqual(b.body.top.slice(0, 3).map((x) => [x.rank, x.name, x.total, x.tier]), [[1, 'Lumi', 110.01, 'silver'], [2, 'Mango', 100, 'silver'], [3, 'แมวส้ม', 50.01, 'bronze']]);
  assert.strictEqual(b.body.top[0].times, 2, 'Lumi/lumi รวมเป็นคนเดียว');
  assert.ok(!/channel|พร้อมเพย์|ทรูมันนี่|donated|@/.test(b.raw), 'บอร์ดไม่เปิดเผยช่องทาง/เวลา');
});

test('ซ่อน/แสดง และปิดแสดงยอดเงิน (ต้องใส่เหตุผล) · ชื่อที่มีแท็ก HTML ถูกตัด', async () => {
  const a = await makeUser(true); const u = await makeUser(false);
  const list = (await req('GET', '/api/admin/supporters', { token: a.token })).body;
  const godji = list.donations.find((x) => x.name === 'Mango');
  assert.strictEqual((await req('POST', `/api/admin/supporters/${godji.id}/hidden`, { token: a.token, body: { hidden: true } })).status, 400);
  assert.strictEqual((await req('POST', `/api/admin/supporters/${godji.id}/hidden`, { token: a.token, body: { hidden: true, reason: 'เจ้าตัวขอซ่อนชื่อ' } })).status, 200);
  let b = (await req('GET', '/api/supporters', { token: u.token })).body;
  assert.ok(!b.top.some((x) => x.name === 'Mango'));
  await req('POST', `/api/admin/supporters/${godji.id}/hidden`, { token: a.token, body: { hidden: false, reason: 'แสดงกลับ' } });
  assert.strictEqual((await req('POST', '/api/admin/supporters/settings', { token: a.token, body: { showAmounts: false, reason: 'ซ่อนยอด' } })).status, 200);
  b = (await req('GET', '/api/supporters', { token: u.token })).body;
  assert.strictEqual(b.showAmounts, false); assert.ok(b.top.every((x) => !('total' in x)));
  assert.strictEqual(b.top[0].name, 'Lumi', 'ยังเรียงตามยอด');
  await req('POST', '/api/admin/supporters/settings', { token: a.token, body: { showAmounts: true, reason: 'เปิดยอด' } });
  await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: '<img src=x onerror=alert(1)> | 5 | 01 พ.ย. 10:00', reason: 'xss test' } });
  const names = (await pool.query('SELECT display_name FROM supporter_donations')).rows.map((r) => r.display_name);
  assert.ok(names.every((x) => !/[<>]/.test(x)));
});

test('ใส่แค่ "ชื่อ ยอด" ได้ · ไม่มีวันเวลา = เวลาที่นำเข้า · ตรวจก่อนเตือนถ้าชื่อ+ยอดมีอยู่แล้ว', async () => {
  const a = await makeUser(true); const u = await makeUser(false);
  const p = S.parseImport('Mango 100\nแมวส้ม 50.01 บาท\nชื่อ มี ช่องว่าง 1,200\nไม่มียอด');
  assert.deepStrictEqual(p.rows.map((r) => [r.name, r.satang]), [['Mango', 10000], ['แมวส้ม', 5001], ['ชื่อ มี ช่องว่าง', 120000]]);
  assert.deepStrictEqual(p.errors.map((e) => e.line), [4]);
  const dry = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: 'Mango 100\nNewbie 30', reason: 'ตรวจ', dryRun: true } })).body;
  assert.deepStrictEqual(dry.maybeDup, [{ name: 'Mango', amount: 100 }], 'Mango 100 มีอยู่แล้วจากเคสก่อน → เตือน');
  assert.strictEqual(dry.preview[1].at, null);
  const before = Date.now();
  const r = (await req('POST', '/api/admin/supporters/import', { token: a.token, body: { text: 'Newbie 30\nNewbie 30', reason: 'ชื่อกับยอดอย่างเดียว' } })).body;
  assert.deepStrictEqual(r, { added: 2, duplicates: 0 }, 'สองบรรทัดเหมือนกันในชุดเดียว = โดเนท 2 ครั้ง');
  const at = (await pool.query("SELECT donated_at FROM supporter_donations WHERE display_name = 'Newbie'")).rows.map((x) => +x.donated_at);
  assert.ok(at.every((t) => t >= before - 5000 && t <= Date.now() + 5000));
  const b = (await req('GET', '/api/supporters', { token: u.token })).body;
  const nb = b.top.find((x) => x.name === 'Newbie');
  assert.deepStrictEqual([nb.total, nb.times], [60, 2]);
});
