/*
  ธีมตามฤดูกาล (v1.18.0) — เปลี่ยนให้ผู้ใช้ทุกคนอัตโนมัติตามเวลาเซิร์ฟเวอร์ ไม่ต้องตั้งค่าเอง และกลับเป็นแบบปกติเองเมื่อหมดช่วง
  ช่วงเวลาอ้างอิงกิจกรรมจริงใน config/events.js (ลอยกระทง: เริ่มวันแรกของกิจกรรมผจญภัย → วันสุดท้ายของเทศกาล)
  - icons: โฟลเดอร์ใน public/img/ ที่มีไอคอนแอป/โลโก้ชื่อเดียวกับไอคอนปกติ (scripts/season-icons/build.py)
  - homeMusic: เพลงหน้าแรก (Lobby) ในช่วงนี้ (public/js/audio.js THEMES)
*/
const { LOYKRATHONG, LK_ADVENTURE } = require('./events');

const t = (s) => Date.parse(s);
const SEASONS = [
  {
    id: 'loykrathong-2026', key: 'loykrathong', nameTh: 'ลอยกระทง 2569',
    startsAt: new Date(Math.min(t(LK_ADVENTURE.startsAt), t(LOYKRATHONG.startsAt))).toISOString(),
    endsAt: new Date(Math.max(t(LK_ADVENTURE.endsAt), t(LOYKRATHONG.endsAt))).toISOString(),
    icons: 'season/loykrathong', homeMusic: 'loykrathong_night',
  },
];

// ไฟล์ที่สลับตามฤดูกาลได้ (ชื่อเดียวกันทั้งแบบปกติใน public/img/ และในโฟลเดอร์ของฤดูกาล)
const BRAND_FILES = ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'icon-192-maskable.png', 'icon-512-maskable.png', 'logo-fox-96.png', 'logo-fox-192.png'];

let nowFn = () => Date.now();
function active(now = nowFn()) {
  return SEASONS.find((s) => now >= t(s.startsAt) && now < t(s.endsAt)) || null;
}
module.exports = { SEASONS, BRAND_FILES, active, _setNow: (fn) => { nowFn = fn || (() => Date.now()); } };
