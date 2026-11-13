/*
  v1.18.0 — ไฟล์หน้าเว็บ: เหรียญใหม่ใช้ทั้งแอป · ตรา/เปลวไฟ Streak ครบ · เพลงกิจกรรมลอยกระทงไม่ใช่เพลง Halloween · แบนเนอร์มือถือกะทัดรัด
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { MILESTONES } = require('../config/streak');

test('เหรียญใหม่: ไฟล์ SVG มีจริง และไม่เหลือเหรียญแบบเดิม (วงกลม + เครื่องหมายบวก) ในหน้าเว็บ', () => {
  for (const f of ['coin/coin.svg', 'coin/coin-sm.svg']) {
    const svg = read(`public/assets/${f}`);
    assert.ok(svg.startsWith('<svg') && svg.includes('viewBox="0 0 64 64"'), f);
    assert.ok(!/<script|href=["']http/i.test(svg), `${f} ไม่มีสคริปต์/ลิงก์ภายนอก`);
  }
  for (const f of ['public/index.html', 'public/js/avatar.js', 'public/js/eventcarousel.js', 'public/js/event.js', 'public/js/festival.js']) {
    const s = read(f);
    assert.ok(!/#FFC93C|#C98A0B" stroke-width="2"/.test(s), `${f} ยังมีเหรียญแบบเดิม`);
  }
  assert.ok(/\/assets\/coin\/\$\{big \? 'coin' : 'coin-sm'\}\.svg/.test(read('public/js/avatar.js')));
});

test('ตรา Streak ครบทุกระดับ + เปลวไฟ 2 สถานะ', () => {
  for (const m of MILESTONES) {
    const svg = read(`public/assets/streak/badge-${m.days}.svg`);
    assert.ok(svg.includes(`>${m.days}<`), `ตรา ${m.days} แสดงจำนวนวัน`);
  }
  assert.ok(read('public/assets/streak/flame.svg').startsWith('<svg'));
  assert.ok(read('public/assets/streak/flame-off.svg').startsWith('<svg'));
});

test('เพลง: หน้ากิจกรรมลอยกระทงเลือกเพลงลอยกระทง (ไม่ใช่ halloween_night เสมอแบบเดิม) + มีใน manifest', () => {
  const js = read('public/js/audio.js');
  assert.ok(/loykrathong_night:\s*\{/.test(js));
  assert.ok(/classList\.contains\('ev-skin-lk'\) \? 'loykrathong_night' : 'halloween_night'/.test(js));
  assert.ok(/classList\.contains\('hf-skin-lk'\)\) return 'loykrathong_night'/.test(js));
  assert.ok(!/if \(id === 'screen-event'\) return 'halloween_night'/.test(js), 'ไม่บังคับเพลง Halloween ที่หน้ากิจกรรมแล้ว');
  const man = JSON.parse(read('public/assets/audio/manifest.json'));
  const t = man.tracks.find((x) => x.id === 'loykrathong_night');
  assert.ok(t && /Original/.test(t.source) && t.file === null);
});

test('แบนเนอร์กิจกรรมบนมือถือ (< 700px) ภาพ 2:1 + คำอธิบายไม่เกิน 2 บรรทัด · ปุ่มยังสูง ≥ 44px', () => {
  const css = read('public/css/eventcarousel.css');
  const block = css.slice(css.indexOf('@media (max-width: 699px)'));
  assert.ok(/\.evc-media \{ aspect-ratio: 2 \/ 1; \}/.test(block));
  assert.ok(/-webkit-line-clamp: 2/.test(block));
  assert.ok(/\.evc-cta \{ min-height: 44px/.test(block));
});
