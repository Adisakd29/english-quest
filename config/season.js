/*
  ธีมตามฤดูกาล (v1.18.0) — เปลี่ยนให้ผู้ใช้ทุกคนอัตโนมัติตามเวลาเซิร์ฟเวอร์ ไม่ต้องตั้งค่าเอง และกลับเป็นแบบปกติเองเมื่อหมดช่วง
  ช่วงเวลาอ้างอิงกิจกรรมจริงใน config/events.js (ลอยกระทง: เริ่มวันแรกของกิจกรรมผจญภัย → วันสุดท้ายของเทศกาล)
  - icons: โฟลเดอร์ใน public/img/ ที่มีไอคอนแอป/โลโก้ชื่อเดียวกับไอคอนปกติ (scripts/season-icons/build.py)
  - homeMusic: เพลงหน้าแรก (Lobby) ในช่วงนี้ (public/js/audio.js THEMES)
*/
const { LOYKRATHONG, LK_ADVENTURE } = require('./events');

const t = (s) => Date.parse(s);
// v1.23.0 เปิด/ปิด/ขยายช่วงธีมเทศกาลด้วยตัวแปรแวดล้อม (ไม่ต้องแก้โค้ด):
//   SEASON_DISABLE=loykrathong        ปิดธีมฤดูกาลนี้ทันที (คั่นหลายค่าด้วย ,)
//   SEASON_LOYKRATHONG_START / _END   ISO เวลา เช่น 2026-11-30T00:00:00+07:00 (ค่าเริ่ม = ช่วงกิจกรรมใน config/events.js)
const envT = (k, def) => { const v = process.env[k]; return v && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : def; };
const disabled = () => String(process.env.SEASON_DISABLE || '').split(',').map((x) => x.trim()).filter(Boolean);
// v1.25.0 Seasonal Theme Engine: หลายฤดูกาลซ้อนช่วงกันได้ → เลือกตาม priority (มาก = ชนะ) · คริสต์มาสอ่านวันเวลา/สวิตช์จากหน้าแอดมิน
//   (season_settings ผ่าน services/christmas.js — แก้ได้โดยไม่ต้อง deploy) · ปิดด้วยตัวแปรแวดล้อม SEASON_DISABLE=christmas ได้เช่นกัน
const xmas = () => require('../services/christmas').settingsSync();
const SEASONS = [
  {
    id: 'christmas-2026', key: 'christmas', nameTh: 'คริสต์มาส 2569', priority: 20,
    get startsAt() { return xmas().startsAt; },
    get endsAt() { return xmas().endsAt; },
    get enabled() { const s = xmas(); return s.enabled && s.flags.christmas_theme; },
    get flags() { const f = xmas().flags; return { snow: !!f.christmas_snow, music: !!f.christmas_music }; },
    icons: 'season/christmas', homeMusic: 'xmas_eve',
  },
  {
    id: 'loykrathong-2026', key: 'loykrathong', nameTh: 'ลอยกระทง 2569',
    startsAt: envT('SEASON_LOYKRATHONG_START', new Date(Math.min(t(LK_ADVENTURE.startsAt), t(LOYKRATHONG.startsAt))).toISOString()),
    endsAt: envT('SEASON_LOYKRATHONG_END', new Date(Math.max(t(LK_ADVENTURE.endsAt), t(LOYKRATHONG.endsAt))).toISOString()),
    icons: 'season/loykrathong', homeMusic: 'loykrathong_night', priority: 10,
  },
];

// ไฟล์ที่สลับตามฤดูกาลได้ (ชื่อเดียวกันทั้งแบบปกติใน public/img/ และในโฟลเดอร์ของฤดูกาล)
const BRAND_FILES = ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'icon-192-maskable.png', 'icon-512-maskable.png', 'logo-fox-96.png', 'logo-fox-192.png'];

let nowFn = () => Date.now();
function active(now = nowFn()) {
  const off = disabled();
  return SEASONS.filter((s) => !off.includes(s.key) && s.enabled !== false && now >= t(s.startsAt) && now < t(s.endsAt))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || null;
}
module.exports = { SEASONS, BRAND_FILES, active, _setNow: (fn) => { nowFn = fn || (() => Date.now()); } };
