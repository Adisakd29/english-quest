/*
  v1.24.0 PWA: manifest · ไอคอน · Service Worker (ไม่แคชข้อมูลส่วนตัว) · บังคับ HTTPS · ป๊อปอัปติดตั้ง (โครงสร้าง)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const { httpsOnly } = require('../utils/security');
const ROOT = path.join(__dirname, '..');

let server; let base;
function get(p, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(base + p, { headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
test.before(async () => {
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('manifest: ชื่อ English Quest · standalone · start_url/scope/id · สี · ไอคอน 192/512 ทั้ง any และ maskable (ไฟล์จริงขนาดถูก)', async () => {
  const r = await get('/manifest.webmanifest', { host: 'english-quest.up.railway.app' });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /application\/manifest\+json/);
  const m = JSON.parse(r.body);
  assert.strictEqual(m.name, 'English Quest');
  assert.strictEqual(m.short_name, 'EnglishQuest');
  assert.strictEqual(m.display, 'standalone');
  assert.strictEqual(m.start_url, '/'); assert.strictEqual(m.scope, '/'); assert.strictEqual(m.id, '/');
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/i); assert.match(m.background_color, /^#[0-9A-F]{6}$/i);
  assert.strictEqual(m.prefer_related_applications, false);
  assert.deepStrictEqual(m.related_applications, [{ platform: 'webapp', url: 'http://english-quest.up.railway.app/manifest.webmanifest' }]);
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
    const ic = m.icons.find((i) => i.sizes === size && i.purpose === purpose);
    assert.ok(ic, `${size} ${purpose}`);
    const img = await get(ic.src);
    assert.strictEqual(img.status, 200, ic.src);
    assert.match(img.headers['content-type'], /image\/png/);
    // ขนาดจริงจาก header PNG (IHDR)
    const w = img.body.readUInt32BE(16); const h = img.body.readUInt32BE(20);
    assert.strictEqual(`${w}x${h}`, size, `${ic.src} ขนาดจริง ${w}x${h}`);
  }
});

test('manifest: host แปลก ๆ ถูกกรอง (ไม่ฉีดตัวอักษรอันตรายลง related_applications)', async () => {
  const r = await get('/manifest.webmanifest', { host: 'evil.com"><script>' });
  const m = JSON.parse(r.body);
  for (const a of m.related_applications || []) assert.match(a.url, /^https?:\/\/[a-z0-9.:-]*\/manifest\.webmanifest$/i, a.url);
});

test('Service Worker: ไม่แคช /api · ไม่แคชคำขอที่มี token · ไม่เก็บ no-store/private · มีไฟล์ติดตั้งใน app shell', async () => {
  const r = await get('/sw.js');
  assert.strictEqual(r.status, 200);
  const sw = r.body.toString();
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)[^\n]*return;/);
  assert.match(sw, /req\.headers\.has\('authorization'\)\) return;/);
  assert.match(sw, /function cacheable\(res\)[\s\S]*no-store\|private/);
  assert.ok((sw.match(/cacheable\(fresh\)/g) || []).length >= 2, 'ทุกที่ที่ใส่แคชต้องผ่าน cacheable');
  for (const f of ['/js/install.js', '/css/install.css', '/manifest.webmanifest', '/offline.html']) assert.ok(sw.includes(`'${f}'`), f);
  // ไฟล์ใน app shell ต้องมีอยู่จริงทุกไฟล์ (ไม่งั้น cache.addAll ล้มทั้งชุด)
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) if (f !== '/' && f !== '/manifest.webmanifest') assert.ok(fs.existsSync(path.join(ROOT, 'public', f)), `ไฟล์ใน SHELL หาย: ${f}`);
});

test('บังคับ HTTPS (production): GET → 301 https · POST → 403 · health/คำขอภายในผ่าน · ปิดได้ด้วย FORCE_HTTPS=off', () => {
  const run = (env, req) => {
    const saved = {}; for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    const out = { next: false };
    const res = { redirect: (code, url) => { out.code = code; out.url = url; }, status: (c) => { out.code = c; return { json: (j) => { out.json = j; } }; } };
    try { httpsOnly({ method: 'GET', path: '/', originalUrl: '/', headers: {}, ...req }, res, () => { out.next = true; }); }
    finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
    return out;
  };
  const PROD = { NODE_ENV: 'production', FORCE_HTTPS: undefined };
  const h = { host: 'english-quest.up.railway.app', 'x-forwarded-proto': 'http' };
  let o = run(PROD, { headers: h, originalUrl: '/#x?a=1', path: '/' });
  assert.deepStrictEqual([o.code, o.url], [301, 'https://english-quest.up.railway.app/#x?a=1']);
  o = run(PROD, { method: 'POST', headers: h, path: '/api/auth/login', originalUrl: '/api/auth/login' });
  assert.strictEqual(o.code, 403); assert.strictEqual(o.json.code, 'HTTPS_REQUIRED');
  assert.ok(run(PROD, { headers: h, path: '/api/health', originalUrl: '/api/health' }).next, 'health check ผ่าน');
  assert.ok(run(PROD, { headers: { host: 'x', 'x-forwarded-proto': 'https' } }).next, 'https ผ่าน');
  assert.ok(run(PROD, { headers: { host: 'x' } }).next, 'ไม่มี x-forwarded-proto (เรียกภายใน) ผ่าน');
  assert.ok(run({ NODE_ENV: 'test' }, { headers: h }).next, 'เครื่องพัฒนาไม่บังคับ');
  assert.ok(run({ ...PROD, FORCE_HTTPS: 'off' }, { headers: h }).next, 'FORCE_HTTPS=off');
});

test('ป๊อปอัปติดตั้ง: ไม่มีปุ่มติดตั้งปลอม · บอกสำเร็จเฉพาะหลัง appinstalled · เลื่อน 7 วัน · เมนูหน้าเข้าสู่ระบบ/ตั้งค่า', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/js/install.js'), 'utf8');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(code, /addEventListener\('beforeinstallprompt'[\s\S]*?e\.preventDefault\(\);\s*deferred = e;/);
  assert.match(code, /addEventListener\('appinstalled'/);
  assert.match(code, /const SNOOZE_DAYS = 7;/);
  // ปุ่ม data-pi="install" สร้างเฉพาะเมื่อมี prompt จริง
  assert.match(code, /if \(m === 'prompt'\) return `<button[^`]*data-pi="install"/);
  assert.strictEqual((code.match(/data-pi="install"/g) || []).length, 1);
  // ข้อความสำเร็จอยู่ใน done() ซึ่งเรียกหลัง appinstalled เท่านั้น
  assert.match(code, /if \(installedNow\) \{ done\(\); return; \}/);
  assert.match(code, /waitingInstall = \{ resolve \}/);
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /id="pwa-login-entry"[^>]*data-pi-open="login"/);
  assert.match(html, /id="pwa-settings-card"/);
  assert.match(html, /<script src="js\/install\.js"><\/script>/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  // ปุ่มติดตั้งในหน้าเข้าสู่ระบบอยู่หลังฟอร์ม (ไม่บังการกรอก)
  assert.ok(html.indexOf('id="pwa-login-entry"') > html.indexOf('id="form-register"'));
});
