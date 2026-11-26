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
  // ช่วงของลอยกระทงเอง (ปิดคริสต์มาสไว้เพื่อดูเฉพาะลอยกระทง)
  process.env.SEASON_DISABLE = 'christmas';
  try {
    assert.strictEqual(SEASON.active(Date.parse('2026-11-01T23:59:59+07:00')), null);
    assert.strictEqual(SEASON.active(Date.parse('2026-11-02T00:00:00+07:00')).key, 'loykrathong');
    assert.strictEqual(SEASON.active(Date.parse('2026-11-25T23:59:59+07:00')).key, 'loykrathong');
    assert.strictEqual(SEASON.active(Date.parse('2026-11-26T00:00:00+07:00')), null);
  } finally { delete process.env.SEASON_DISABLE; }
  // v1.25.0 คริสต์มาสเริ่ม 25 พ.ย. 00:00 (priority สูงกว่า) → วันที่ 25 ที่ซ้อนกันเป็นคริสต์มาส · จบ 1 ม.ค. 2570 00:00
  assert.strictEqual(SEASON.active(Date.parse('2026-11-24T23:59:59+07:00')).key, 'loykrathong');
  assert.strictEqual(SEASON.active(Date.parse('2026-11-25T00:00:00+07:00')).key, 'christmas');
  assert.strictEqual(SEASON.active(Date.parse('2026-12-31T23:59:59+07:00')).key, 'christmas');
  assert.strictEqual(SEASON.active(Date.parse('2027-01-01T00:00:00+07:00')), null);
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

  // v1.25.0 ช่วงคริสต์มาส: โลโก้/ไอคอนคริสต์มาส (จิ้งจอกหมวกซานต้า) · เพลงหน้าแรก xmas_eve
  SEASON._setNow(at('2026-12-01T12:00:00+07:00'));
  const xs = JSON.parse((await get('/api/season')).body).season;
  assert.deepStrictEqual([xs.key, xs.homeMusic], ['christmas', 'xmas_eve']);
  const xmLogo = fs.readFileSync(path.join(ROOT, 'public/img/season/christmas/logo-fox-96.png'));
  assert.ok((await get('/brand/logo-fox-96.png')).body.equals(xmLogo), 'ช่วงคริสต์มาส = โลโก้คริสต์มาส');
  assert.ok(JSON.parse((await get('/manifest.webmanifest')).body).icons.every((i) => i.src.includes('v=christmas-2026')));

  SEASON._setNow(at('2027-01-02T12:00:00+07:00'));
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

test('v1.23.0 ช่วงธีมเทศกาลตั้งค่าได้ด้วยตัวแปรแวดล้อม (ปิดทันที / ขยายช่วง) โดยไม่แก้โค้ด', () => {
  const { execFileSync } = require('child_process');
  const run = (env, at) => execFileSync(process.execPath, ['-e', `const S=require('./config/season');const a=S.active(Date.parse('${at}'));process.stdout.write(a?a.key:'none')`],
    { cwd: ROOT, env: { ...process.env, ...env } }).toString();
  const NX = { SEASON_DISABLE: 'christmas' };   // ดูเฉพาะลอยกระทง (v1.25.0 คริสต์มาสเริ่ม 25 พ.ย. และ priority สูงกว่า)
  assert.strictEqual(run({}, '2026-11-23T12:00:00+07:00'), 'loykrathong');
  assert.strictEqual(run(NX, '2026-11-27T12:00:00+07:00'), 'none', 'ค่าเริ่ม: หมดช่วงหลัง 25 พ.ย. → กลับธีมปกติ');
  assert.strictEqual(run({}, '2026-11-27T12:00:00+07:00'), 'christmas', 'v1.25.0 หลังลอยกระทง = คริสต์มาส');
  assert.strictEqual(run({ SEASON_DISABLE: 'loykrathong' }, '2026-11-23T12:00:00+07:00'), 'none');
  assert.strictEqual(run({ ...NX, SEASON_LOYKRATHONG_END: '2026-11-30T00:00:00+07:00' }, '2026-11-27T12:00:00+07:00'), 'loykrathong');
  assert.strictEqual(run({ ...NX, SEASON_LOYKRATHONG_END: 'not-a-date' }, '2026-11-27T12:00:00+07:00'), 'none', 'ค่าผิดรูปแบบ → ใช้ค่าเริ่ม');
  assert.strictEqual(run({ SEASON_DISABLE: 'christmas,loykrathong' }, '2026-12-10T12:00:00+07:00'), 'none', 'ปิดคริสต์มาสด้วยตัวแปรแวดล้อมได้');
});

test('v1.23.0 ชั้นเอฟเฟกต์โคมลอย: canvas เดียวใต้เนื้อหา ไม่รับการแตะ · ไม่มี setInterval/DOM สะสม · ปิดเมื่อทำข้อสอบ · เคารพ reduced-motion', () => {
  const fx = fs.readFileSync(path.join(ROOT, 'public/js/lantern-fx.js'), 'utf8');
  const code = fx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/setInterval|setTimeout/.test(code), 'ใช้ requestAnimationFrame อย่างเดียว');
  assert.ok(/document\.body\.prepend\(canvas\)/.test(fx) && /if \(!canvas\) create\(\)/.test(fx), 'สร้าง canvas ครั้งเดียว');
  assert.ok(/prefers-reduced-motion: reduce/.test(fx) && /eq_fest_fx/.test(fx) && /document\.hidden/.test(fx));
  const css = fs.readFileSync(path.join(ROOT, 'public/css/theme-loykrathong.css'), 'utf8');
  assert.ok(/#lk-fx \{[^}]*z-index: -1;[^}]*pointer-events: none;/.test(css));
  assert.ok(!/(?<!none !important; )backdrop-filter: blur/.test(css.split('v1.23.0 Enchanted')[1]), 'ไม่ใช้ backdrop blur ทับฉากที่เคลื่อนไหว');
  // ระดับตามหน้า: หน้าทำข้อสอบ/เกมต้องปิด
  const levelFor = eval(`(${fx.match(/function levelFor\(screenId\) \{[\s\S]*?\n  \}/)[0].replace('function levelFor', 'function')})`.replace('FULL_SCREENS', 'FULL').replace('OFF_RE', 'OFF'));
  global.FULL = new Set(['screen-auth', 'screen-home', 'screen-festival', 'screen-event', 'screen-play']);
  global.OFF = eval(fx.match(/const OFF_RE = (\/.*\/);/)[1]);
  for (const id of ['screen-game', 'screen-ranked-match', 'screen-grammar-quiz', 'screen-tcas', 'screen-toeic5-play', 'screen-endless', 'screen-graded', 'screen-placement', 'screen-vocab-card'])
    assert.strictEqual(levelFor(id), 'off', id);
  for (const id of ['screen-home', 'screen-auth', 'screen-festival']) assert.strictEqual(levelFor(id), 'full', id);
  assert.strictEqual(levelFor('screen-path'), 'light');
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(/id="fest-theme-toggle"/.test(html) && /id="fest-fx-toggle"/.test(html), 'มีสวิตช์ปิดธีม/ปิดเอฟเฟกต์');
  assert.ok(/eq_season_key[\s\S]{0,120}eq_fest_theme/.test(html), 'ตั้งธีมตั้งแต่ <head> (ไม่กระพริบ)');
});
