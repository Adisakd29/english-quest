/*
  สร้าง public/assets/icons/icons.svg (SVG sprite) จาก Lucide (ISC License)
    node scripts/build-icons.js
  ใช้ในหน้าเว็บ: <svg class="icon" aria-hidden="true"><use href="/assets/icons/icons.svg#house"></use></svg>
  ระบบไอคอนเดียวทั้งเว็บ — เพิ่มไอคอนใหม่ให้เพิ่มชื่อใน ICONS แล้วรันใหม่
*/
const fs = require('fs');
const path = require('path');

const ICONS = [
  // เมนูหลัก / ทั่วไป
  'house', 'book-open', 'rotate-ccw', 'gamepad-2', 'user-round', 'log-out', 'log-in', 'trophy', 'users', 'users-round',
  'swords', 'search', 'target', 'flame', 'chevron-right', 'chevron-left', 'arrow-left', 'arrow-up-right', 'play', 'settings',
  'shield-check', 'languages', 'headphones', 'sparkles', 'sliders-horizontal', 'x', 'plus', 'copy', 'camera', 'send',
  // สถานะ / feedback
  'check', 'circle-check', 'circle-x', 'circle-alert', 'triangle-alert', 'info', 'lock', 'lock-open', 'hourglass',
  'loader-circle', 'wifi-off', 'refresh-cw', 'flag', 'ban', 'user-plus', 'user-check', 'user-x', 'mail', 'mail-check',
  'volume-2', 'lightbulb', 'clock', 'timer', 'list-checks', 'eye', 'pencil-line', 'file-pen-line', 'wrench', 'library',
  'compass', 'crown', 'award', 'medal', 'star', 'circle-help', 'message-circle', 'message-square-text',
  // หมวดคำศัพท์ (topic)
  'utensils', 'building-2', 'map', 'heart-pulse', 'zap', 'palette', 'smile', 'leaf', 'briefcase', 'brain', 'package', 'book',
  // บทแกรมม่า
  'box', 'type', 'gauge', 'link', 'hand-helping', 'scale', 'arrow-left-right', 'git-branch', 'map-pin', 'combine', 'chart-column',
  // โหมดข้อสอบแกรมม่า
  'sprout', 'trees', 'mountain', 'graduation-cap',
  // Ranked Battle: เสียง / ออกจากเกม / การเชื่อมต่อ
  'volume-x', 'volume-1', 'music', 'door-open', 'shield', 'wifi',
  // ลิงก์สนับสนุนผู้พัฒนา
  'coffee', 'mic', 'mic-off', 'message-circle-more', 'external-link',
];
const SRC = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const OUT = path.join(__dirname, '..', 'public', 'assets', 'icons', 'icons.svg');

const symbols = ICONS.map((name) => {
  const svg = fs.readFileSync(path.join(SRC, `${name}.svg`), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<symbol id="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`;
});
const header = '<!-- Lucide icons (ISC License, https://lucide.dev) — สร้างโดย scripts/build-icons.js -->';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `<svg xmlns="http://www.w3.org/2000/svg">${header}\n${symbols.join('\n')}\n</svg>\n`);
console.log(`สร้าง ${path.relative(process.cwd(), OUT)}: ${ICONS.length} ไอคอน, ${fs.statSync(OUT).size} bytes`);
