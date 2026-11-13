/*
  v1.18.0 ธีมตามฤดูกาล (ลอยกระทง) — เปลี่ยนให้ผู้ใช้อัตโนมัติตามเวลาเซิร์ฟเวอร์ · หมดช่วงกลับเป็นแบบปกติเอง
  + แท่นรางวัลกระดานอันดับ (ไฟล์หน้าเว็บ)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const SEASON = require('../config/season');
const ROOT = path.join(__dirname, '..');

let server; let base;
function get(p) {
  return new Promise((resolve, reject) => {
    http.get(base + p, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const at = (iso) => () => Date.parse(iso);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { SEASON._setNow(null); server.close(); await pool.end(); });

test('ช่วงลอยกระทงอ้างอิงกิจกรรมจริง: 2 พ.ย. – 25 พ.ย. 2569 (เวลาไทย) · นอกช่วง = ไม่มีฤดูกาล', () => {
  const lk = SEASON.SEASONS.find((s) => s.key === 'loykrathong');
  assert.strictEqual(lk.startsAt, new Date('2026-11-02T00:00:00+07:00').toISOString());
  assert.strictEqual(lk.endsAt, new Date('2026-11-26T00:00:00+07:00').toISOString());
  assert.strictEqual(SEASON.active(Date.parse('2026-11-01T23:59:59+07:00')), null);
  assert.strictEqual(SEASON.active(Date.parse('2026-11-02T00:00:00+07:00')).key, 'loykrathong');
  assert.strictEqual(SEASON.active(Date.parse('2026-11-25T23:59:59+07:00')).key, 'loykrathong');
  assert.strictEqual(SEASON.active(Date.parse('2026-11-26T00:00:00+07:00')), null);
});

test('GET /api/season (ไม่ต้องล็อกอิน) + /brand สลับไฟล์ตามฤดูกาลอัตโนมัติ', async () => {
  const lkLogo = fs.readFileSync(path.join(ROOT, 'public/img/season/loykrathong/logo-fox-96.png'));
  const baseLogo = fs.readFileSync(path.join(ROOT, 'public/img/logo-fox-96.png'));
  assert.ok(!lkLogo.equals(baseLogo));

  SEASON._setNow(at('2026-11-10T12:00:00+07:00'));
  let r = await get('/api/season');
  assert.strictEqual(r.status, 200);
  const s = JSON.parse(r.body).season;
  assert.deepStrictEqual([s.key, s.homeMusic], ['loykrathong', 'loykrathong_night']);
  r = await get('/brand/logo-fox-96.png');
  assert.strictEqual(r.status, 200); assert.ok(r.body.equals(lkLogo), 'ช่วงเทศกาล = โลโก้ลอยกระทง');
  assert.match(r.headers['cache-control'], /max-age=1800/);
  const m = JSON.parse((await get('/manifest.webmanifest')).body);
  assert.ok(m.icons.length === 4 && m.icons.every((i) => i.src.startsWith('/brand/') && i.src.includes('v=loykrathong-2026')));

  SEASON._setNow(at('2026-12-01T12:00:00+07:00'));
  assert.strictEqual(JSON.parse((await get('/api/season')).body).season, null);
  assert.ok((await get('/brand/logo-fox-96.png')).body.equals(baseLogo), 'หมดช่วง = โลโก้ปกติ');
  assert.ok(JSON.parse((await get('/manifest.webmanifest')).body).icons.every((i) => i.src.includes('v=base')));
});

test('/brand เสิร์ฟเฉพาะไฟล์ในรายการ (กัน path traversal) · ไอคอนฤดูกาลครบทุกไฟล์', async () => {
  for (const f of SEASON.BRAND_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public/img', f)), `ปกติ ${f}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/img/season/loykrathong', f)), `ลอยกระทง ${f}`);
  }
  for (const bad of ['/brand/..%2Fpackage.json', '/brand/icon-source-512.png', '/brand/x.js']) {
    const r = await get(bad);
    assert.ok(!r.body.toString().includes('"dependencies"'), bad);
    assert.ok(/text\/html/.test(r.headers['content-type'] || ''), `${bad} ไม่ได้ไฟล์จริง`);
  }
});

test('หน้าเว็บ: favicon/โลโก้ใช้ /brand · เพลงหน้าแรกตามฤดูกาล · แท่นรางวัลกระดานอันดับ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(!/\/img\/(favicon|logo-fox|apple-touch)/.test(html));
  assert.ok(/<script src="js\/season\.js"><\/script>\s*<script src="js\/audio\.js">/.test(html), 'season.js โหลดก่อน audio.js');
  const audio = fs.readFileSync(path.join(ROOT, 'public/js/audio.js'), 'utf8');
  assert.ok(/id === 'screen-home' && window\.EQSeason && window\.EQSeason\.homeMusic/.test(audio));
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  assert.ok(/EQPodium\.html\(podium\.map/.test(app) && /EQPodium\.hydrate\(list\)/.test(app));
  const rk = fs.readFileSync(path.join(ROOT, 'public/js/ranked.js'), 'utf8');
  assert.ok(/P\.html\(pod\.map/.test(rk));
  const pod = fs.readFileSync(path.join(ROOT, 'public/js/podium.js'), 'utf8');
  assert.ok(/esc\(e\.name\)/.test(pod) && /fullBody/.test(pod));
  const av = fs.readFileSync(path.join(ROOT, 'public/js/avatar.js'), 'utf8');
  assert.ok(/if \(!look \|\| !look\.enabled \|\| !look\.outfit\) return \{ kind: 'photo' \}/.test(av), 'ไม่ได้เลือกใช้ Avatar → รูปโปรไฟล์เดิม');
});
