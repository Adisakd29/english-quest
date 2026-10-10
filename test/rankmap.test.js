/*
  แผนที่ "เส้นทางสู่แรงค์สูงสุด" + ชื่อแรงค์ภาษาไทย + การนำโหมดทบทวนออก (ตรวจแบบไม่ต้องเปิดเบราว์เซอร์)
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const leagues = require('../config/leagues');

function loadMap() {
  const listeners = {};
  const ctx = {
    window: {}, document: { addEventListener: (t, f) => { listeners[t] = f; } },
    performance: { now: () => 0 }, requestAnimationFrame: () => 0, setTimeout, clearTimeout, Math, JSON, Number, String, Array, Object,
  };
  ctx.window.EQG = { esc: (s) => String(s), icon: () => '', avatar: () => '', mascot: () => '', mark: () => '', AVATAR_IDS: ['fox'] };
  ctx.window.matchMedia = () => ({ matches: false });
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/rankmap.js'), 'utf8'), ctx);
  return ctx.window.EQRankMap;
}

test('ชื่อแรงค์ภาษาไทยมาจากข้อมูลกลาง · id เดิมไม่เปลี่ยน · ลำดับ/คะแนนเดิม', () => {
  const cfg = leagues.publicConfig();
  assert.deepStrictEqual(cfg.leagues.map((l) => l.id), ['trail-finch', 'swift-hare', 'river-otter', 'crest-lynx', 'moon-wolf',
    'shadow-panther', 'storm-falcon', 'crown-eagle', 'aurora-lion']);
  assert.ok(cfg.leagues.every((l) => /[฀-๿]/.test(l.name)), 'ชื่อหลักเป็นภาษาไทย');
  assert.ok(cfg.leagues.every((l) => l.region && l.motto && l.theme && l.nameEn));
  assert.strictEqual(leagues.labelOf('moon-wolf', 1), 'หมาป่าจันทรา III');
  assert.strictEqual(leagues.labelOf('aurora-lion', 0), 'ราชสีห์แสงเหนือ');
  assert.deepStrictEqual(cfg.leagues[0].minQr, [0, 100, 200], 'คะแนนเดิม');
  assert.strictEqual(new Set(cfg.leagues.map((l) => l.theme)).size, 9, 'ทุกดินแดนมีธีมไม่ซ้ำกัน');
});

test('แผนที่: 9 ดินแดน · Checkpoint ตาม Division · จุดบอสทุกแรงค์ (Guardian 8 + Apex 1) · เส้นทางไต่จากล่างขึ้นบน', () => {
  const map = loadMap();
  const cfg = leagues.publicConfig();
  const { regions, wps, total } = map._layout(cfg.leagues);
  assert.strictEqual(regions.length, 9);
  assert.strictEqual(wps.filter((w) => w.kind === 'emblem').length, 9);
  assert.strictEqual(wps.filter((w) => w.kind === 'check').length, cfg.leagues.reduce((n, l) => n + l.divisions.length, 0));
  const bosses = wps.filter((w) => w.kind === 'boss');
  assert.strictEqual(bosses.length, 9);
  assert.strictEqual(bosses.filter((b) => b.apex).length, 1, 'แรงค์สูงสุดเป็น Apex Challenge');
  for (let i = 1; i < wps.length; i += 1) assert.ok(wps[i].y < wps[i - 1].y, 'ทุกจุดสูงขึ้นเรื่อย ๆ');
  assert.ok(wps.every((w) => w.x >= 0 && w.x <= 400 && w.y > 0 && w.y < total), 'ทุกจุดอยู่ในแผนที่');
  // แต่ละแรงค์: ตรา -> checkpoint -> บอส อยู่ในดินแดนของตัวเอง
  regions.forEach((r) => {
    [r.emblem, ...r.checks, r.boss].forEach((w) => assert.ok(w.y <= r.y1 && w.y >= r.y0, r.league.id));
  });
});

test('แผนที่: สถานะผ่านแล้ว / กำลังแข่งขัน / พร้อมเลื่อนแรงค์ / ล็อก มาจากโปรไฟล์จริงเท่านั้น', () => {
  const map = loadMap();
  const cfg = leagues.publicConfig();
  const st = map._stateOf(cfg, { profile: { league: 'moon-wolf', divisionIndex: 1, promotionStatus: 'none', questRating: 2350, progress: { pct: 25 } } });
  assert.strictEqual(st.curOrder, 5);
  assert.strictEqual(st.pending, false);
  const pend = map._stateOf(cfg, { profile: { league: 'trail-finch', divisionIndex: 2, promotionStatus: 'pending', questRating: 300 } });
  assert.strictEqual(pend.pending, true);
  const top = map._stateOf(cfg, { profile: { league: 'aurora-lion', divisionIndex: 0, promotionStatus: 'pending', questRating: 6000 } });
  assert.strictEqual(top.pending, false, 'แรงค์สูงสุดไม่มีด่านเลื่อนแรงค์');
});

test('โหมดทบทวนถูกนำออกจากหน้าเว็บ (ไม่มีเมนู/การ์ด/หน้า/ลิงก์ค้าง) · ข้อมูลฝั่งเซิร์ฟเวอร์ยังอยู่', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  const ranked = fs.readFileSync(path.join(__dirname, '../public/js/ranked.js'), 'utf8');
  for (const id of ['screen-review', 'dash-review', 'path-open-review', 'nav-review-badge', 'review-body']) {
    assert.ok(!html.includes(`id="${id}"`), `ไม่มี #${id}`);
  }
  assert.ok(!/data-nav="review"/.test(html));
  assert.ok(!/navigateTo\('review'\)/.test(app + ranked), 'ไม่มีปุ่มพาไปหน้าทบทวน');
  assert.ok(!/openReview/.test(app + ranked));
  assert.ok(/case 'review': openPath\(\)/.test(app), 'ลิงก์เก่า #/review พาไปหน้าเรียน (ไม่ใช่หน้าว่าง)');
  const progress = fs.readFileSync(path.join(__dirname, '../routes/progress.js'), 'utf8');
  assert.ok(progress.includes("router.get('/due'"), 'API และข้อมูลเดิมไม่ถูกลบ');
});
