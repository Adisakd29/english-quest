/*
  สร้างภาพแบนเนอร์ Event Carousel (v1.17.0) → public/assets/events/banners/<art>-{1280,640}.webp
  องค์ประกอบ: ฉากหลังแสงแฟนตาซี (SVG ที่วาดเองทั้งหมด) + ตัวละคร 3D ของ EnglishQuest (เรนเดอร์จริงจากระบบ Avatar)
              + สัญลักษณ์การเรียน/ของรางวัลของประเภทนั้น · ไม่มีข้อความสำคัญในภาพ (ชื่อ/รายละเอียดเป็น HTML)
  ใช้: node scripts/event-banners/render.js [art ...]   (ต้องมีเซิร์ฟเวอร์ที่ EQ_URL — ค่าเริ่มต้น http://localhost:3100)
  ไม่คัดลอกภาพ/UI ของเกมอื่น · ไม่ใช้อิโมจิเป็นภาพหลัก
*/
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const URL = process.env.EQ_URL || 'http://localhost:3100';
const OUT = path.join(__dirname, '..', '..', 'public', 'assets', 'events', 'banners');
const W = 1280; const H = 720;

/* ---------------- ตัวละครต่อภาพ (ไอเท็ม 3D จริงในแคตตาล็อก) ---------------- */
const BASE = { body: 'body_warm', face: 'face_happy', faceshape: null, hair: 'hair_crop', top: 'top_tee_blue', bottom: 'bottom_jeans', outerwear: null,
  shoes: 'shoes_sneaker_white', hat: null, glasses: null, headphones: null, back: null, accessory: null, effect: null, background: null };
const HEROES = {
  adventure:   { body: 'body_tan', hair: 'hair_spiky', top: 'top_adventurer_tunic', bottom: 'bottom_ranger_pants', shoes: 'shoes_adventure_boots', back: 'back_backpack_explorer', anim: 'wave' },
  loykrathong: { body: 'body_warm', hair: 'hair_bob', top: 'top_lk26_lotus', outerwear: 'outer_lk26_sabai', bottom: 'bottom_lk26_chongkraben', shoes: 'shoes_lk26_sandals', hat: 'hat_lk26_ngob', face: 'face_smile' },
  festival:    { body: 'body_light', hair: 'hair_twin_buns', top: 'top_lk26_indigo', bottom: 'bottom_thai_fisherman', shoes: 'shoes_sandals', accessory: 'acc_flower_garland', anim: 'wave' },
  ranked:      { body: 'body_deep', hair: 'hair_spiky', top: 'top_tee_star', outerwear: 'outer_rank_jacket', bottom: 'bottom_cargo', shoes: 'shoes_glow_sneaker', accessory: 'acc_medal', face: 'face_cool', anim: 'botharmsup' },
  daily:       { body: 'body_light', hair: 'hair_ponytail', top: 'top_hoodie_gray', bottom: 'bottom_jeans', shoes: 'shoes_sneaker_white', back: 'back_backpack_school', anim: 'wave' },
  vocab:       { body: 'body_tan', hair: 'hair_curly', top: 'top_sweater_knit', bottom: 'bottom_chinos', shoes: 'shoes_loafers', hat: 'hat_crown_vocab', effect: 'fx_books_float' },
  grammar:     { body: 'body_warm', hair: 'hair_sidepart', top: 'top_oxford_shirt', outerwear: 'outer_blazer', bottom: 'bottom_wide_trousers', shoes: 'shoes_loafers', glasses: 'glasses_grammar', face: 'face_focused' },
  toeic:       { body: 'body_deep', hair: 'hair_bob', top: 'top_tech_zip', bottom: 'bottom_tech_joggers', shoes: 'shoes_runners', headphones: 'phones_toeic', face: 'face_focused' },
  streak:      { body: 'body_tan', hair: 'hair_crop', top: 'top_sport_jersey', bottom: 'bottom_track_pants', shoes: 'shoes_runners', hat: 'hat_sport_headband', accessory: 'acc_sweatband', anim: 'celebrate' },
  achievement: { body: 'body_light', hair: 'hair_long', top: 'top_tee_blue', outerwear: 'outer_varsity', bottom: 'bottom_chinos', shoes: 'shoes_retro_court', hat: 'hat_grad_cap', accessory: 'acc_medal', anim: 'botharmsup' },
  halloween:   { body: 'body_warm', hair: 'hair_wavy_long', top: 'top_hw26_ghost_hoodie', bottom: 'bottom_hw26_midnight', shoes: 'shoes_hw26_boots', hat: 'hat_hw26_witch', back: 'back_hw26_batwings' },
  christmas:   { body: 'body_light', hair: 'hair_side_braid', top: 'top_holiday_sweater', bottom: 'bottom_snow_pants', shoes: 'shoes_holiday_booties', hat: 'hat_beanie_teal', accessory: 'acc_scarf_red', anim: 'wave' },
  newyear:     { body: 'body_deep', hair: 'hair_sidepart', top: 'top_turtleneck', outerwear: 'outer_blazer', bottom: 'bottom_wide_trousers', shoes: 'shoes_loafers', glasses: 'glasses_sunglasses', anim: 'celebrate' },
  valentine:   { body: 'body_warm', hair: 'hair_wavy_long', top: 'top_tee_stripe', outerwear: 'outer_cardigan', bottom: 'bottom_skirt_pleated', shoes: 'shoes_slipon_white', glasses: 'glasses_heart_shades', anim: 'wave' },
  school:      { body: 'body_tan', hair: 'hair_ponytail', top: 'top_school_shirt', bottom: 'bottom_skirt_plaid', shoes: 'shoes_canvas_black', back: 'back_backpack_school', anim: 'wave' },
};

/* ---------------- ฉากหลัง ---------------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const P = {
  adventure:   { a: '#0b3b3a', b: '#0f6b5c', c: '#06201f', glow: '#ffd27a', ray: '#fff1c9', bokeh: ['#9ff3d6', '#ffe08a', '#ffffff'] },
  loykrathong: { a: '#0a1238', b: '#1c2a6e', c: '#070c26', glow: '#ffe7a6', ray: '#fff6d8', bokeh: ['#ffe7a6', '#9fb4ff', '#ffffff'] },
  festival:    { a: '#4a1546', b: '#c2410c', c: '#2a0b2a', glow: '#ffcf6b', ray: '#ffe9c2', bokeh: ['#ffcf6b', '#ff8fb1', '#ffffff'] },
  ranked:      { a: '#2a0a12', b: '#7f1d1d', c: '#0b1028', glow: '#ff9a3d', ray: '#ffd6a6', bokeh: ['#ffb86b', '#ff5d5d', '#ffffff'] },
  daily:       { a: '#1e3a8a', b: '#3b82f6', c: '#0f1d4a', glow: '#ffe28a', ray: '#ffffff', bokeh: ['#bfdbfe', '#fde68a', '#ffffff'] },
  vocab:       { a: '#2e1065', b: '#6d28d9', c: '#150630', glow: '#f0abfc', ray: '#f5e8ff', bokeh: ['#e9d5ff', '#a5b4fc', '#ffffff'] },
  grammar:     { a: '#083344', b: '#0e7490', c: '#041a24', glow: '#67e8f9', ray: '#e0fbff', bokeh: ['#a5f3fc', '#99f6e4', '#ffffff'] },
  toeic:       { a: '#0c1a3d', b: '#1d4ed8', c: '#050b1f', glow: '#7dd3fc', ray: '#e0f2fe', bokeh: ['#93c5fd', '#67e8f9', '#ffffff'] },
  streak:      { a: '#431407', b: '#c2410c', c: '#1c0802', glow: '#fdba74', ray: '#ffedd5', bokeh: ['#fdba74', '#fde047', '#ffffff'] },
  achievement: { a: '#2b1257', b: '#7c3aed', c: '#13072b', glow: '#fcd34d', ray: '#fff7d6', bokeh: ['#fde68a', '#c4b5fd', '#ffffff'] },
  halloween:   { a: '#1e0b3a', b: '#5b21b6', c: '#0b0518', glow: '#fb923c', ray: '#ffe1c2', bokeh: ['#fdba74', '#c084fc', '#ffffff'] },
  christmas:   { a: '#052e16', b: '#166534', c: '#021a0c', glow: '#fde68a', ray: '#ffffff', bokeh: ['#fecaca', '#fde68a', '#ffffff'] },
  newyear:     { a: '#0b1028', b: '#312e81', c: '#04061a', glow: '#fcd34d', ray: '#fff7d6', bokeh: ['#fcd34d', '#f9a8d4', '#ffffff'] },
  valentine:   { a: '#500724', b: '#be185d', c: '#2a0313', glow: '#fda4af', ray: '#ffe4ea', bokeh: ['#fda4af', '#fbcfe8', '#ffffff'] },
  school:      { a: '#134e4a', b: '#0f766e', c: '#06231f', glow: '#fde047', ray: '#fefce8', bokeh: ['#fde68a', '#99f6e4', '#ffffff'] },
};
const HX = 760; const FEET = 668;   // ตำแหน่งตัวละคร (กลางค่อนขวา)

const tile = (x, y, s, rot, ch, fg, bg) => `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#soft)">
  <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${bg}" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
  <rect x="${-s / 2 + 4}" y="${-s / 2 + 4}" width="${s - 8}" height="${s * 0.42}" rx="${s * 0.18}" fill="rgba(255,255,255,.18)"/>
  <text x="0" y="${s * 0.17}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="${s * 0.52}" fill="${fg}">${ch}</text></g>`;
const coin = (x, y, r) => `<g transform="translate(${x} ${y})" filter="url(#soft)"><ellipse cx="0" cy="${r * 0.18}" rx="${r}" ry="${r * 0.98}" fill="#b7791f"/>
  <circle r="${r}" fill="#fbbf24"/><circle r="${r * 0.72}" fill="none" stroke="#f59e0b" stroke-width="${r * 0.12}"/>
  <path d="M0 ${-r * 0.4}v${r * 0.8}M${-r * 0.28} ${-r * 0.1}h${r * 0.56}" stroke="#92400e" stroke-width="${r * 0.13}" stroke-linecap="round"/>
  <ellipse cx="${-r * 0.35}" cy="${-r * 0.42}" rx="${r * 0.28}" ry="${r * 0.14}" fill="rgba(255,255,255,.6)" transform="rotate(-30)"/></g>`;
const book = (x, y, s, rot, c1, c2) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#soft)">
  <path d="M-60 -38 Q-30 -50 0 -38 Q30 -50 60 -38 V40 Q30 28 0 40 Q-30 28 -60 40Z" fill="${c1}"/>
  <path d="M-54 -32 Q-27 -42 -2 -32 V34 Q-27 24 -54 34Z" fill="#fffaf0"/><path d="M2 -32 Q27 -42 54 -32 V34 Q27 24 2 34Z" fill="#fff"/>
  <path d="M-46 -18h34M-46 -6h30M-46 6h34M10 -18h34M10 -6h28M10 6h34" stroke="${c2}" stroke-width="3" stroke-linecap="round" opacity=".55"/></g>`;
const star4 = (x, y, r, c, o = 1) => `<path transform="translate(${x} ${y})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r}Z" fill="${c}" opacity="${o}"/>`;
const heart = (x, y, s, rot, c) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#soft)" d="M0 30 C-40 0 -40 -30 -18 -34 C-6 -36 0 -26 0 -20 C0 -26 6 -36 18 -34 C40 -30 40 0 0 30Z" fill="${c}" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
const flame = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glowS)"><path d="M0 -70 C30 -30 40 -10 30 15 C22 38 -22 38 -30 15 C-40 -10 -20 -30 0 -70Z" fill="${c1}"/>
  <path d="M0 -30 C14 -10 18 0 13 14 C8 26 -8 26 -13 14 C-18 0 -12 -12 0 -30Z" fill="${c2}"/></g>`;
const pumpkin = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft)"><ellipse cx="-22" cy="0" rx="26" ry="30" fill="#ea580c"/><ellipse cx="22" cy="0" rx="26" ry="30" fill="#ea580c"/>
  <ellipse cx="0" cy="0" rx="26" ry="32" fill="#f97316"/><path d="M-3 -30 q2 -14 12 -18" stroke="#3f6212" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M-20 -6l8 -8 8 8zM4 -6l8 -8 8 8zM-18 10 q18 14 36 0 l-6 4 -6 -4 -6 4 -6 -4 -6 4z" fill="#fde68a"/></g>`;
const bat = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 C-10 -12 -30 -14 -46 -4 C-36 -2 -34 6 -40 12 C-28 6 -18 10 -12 16 C-8 8 -4 6 0 8 C4 6 8 8 12 16 C18 10 28 6 40 12 C34 6 36 -2 46 -4 C30 -14 10 -12 0 0Z" fill="#140a26"/>`;
const tree = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft)"><path d="M0 -120 L50 -40 H25 L65 20 H35 L80 80 H-80 L-35 20 H-65 L-25 -40 H-50Z" fill="#15803d"/>
  <rect x="-10" y="80" width="20" height="24" fill="#78350f"/>${[[-30, 50, '#ef4444'], [28, 30, '#fde047'], [-10, -10, '#60a5fa'], [20, 70, '#f472b6'], [-40, 10, '#fde047']].map(([a, b, c]) => `<circle cx="${a}" cy="${b}" r="7" fill="${c}"/>`).join('')}
  ${star4(0, -128, 18, '#fde047')}</g>`;
const gift = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft)"><rect x="-40" y="-30" width="80" height="60" rx="6" fill="${c1}"/><rect x="-46" y="-44" width="92" height="18" rx="5" fill="${c1}"/>
  <rect x="-7" y="-44" width="14" height="74" fill="${c2}"/><path d="M0 -44 C-20 -70 -40 -50 -10 -44 M0 -44 C20 -70 40 -50 10 -44" stroke="${c2}" stroke-width="7" fill="none"/></g>`;
const trophy = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glowS)"><path d="M-40 -60 H40 V-20 C40 10 18 26 0 28 C-18 26 -40 10 -40 -20Z" fill="#fbbf24"/>
  <path d="M-40 -48 C-70 -48 -70 -8 -36 -6 M40 -48 C70 -48 70 -8 36 -6" stroke="#f59e0b" stroke-width="8" fill="none"/><rect x="-8" y="26" width="16" height="22" fill="#d97706"/>
  <rect x="-34" y="46" width="68" height="16" rx="4" fill="#92400e"/><path d="M-26 -52 V-22 C-26 -6 -16 4 -8 8" stroke="rgba(255,255,255,.6)" stroke-width="7" fill="none" stroke-linecap="round"/>${star4(0, -30, 13, '#fff7d6')}</g>`;
const headphones = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft)"><path d="M-50 10 C-50 -60 50 -60 50 10" stroke="#e0f2fe" stroke-width="12" fill="none" stroke-linecap="round"/>
  <rect x="-66" y="0" width="32" height="54" rx="14" fill="#38bdf8"/><rect x="34" y="0" width="32" height="54" rx="14" fill="#38bdf8"/></g>`;
const wave = (x, y, n, c) => `<g transform="translate(${x} ${y})" filter="url(#glowS)">${Array.from({ length: n }, (_, i) => `<rect x="${i * 16}" y="${-[18, 34, 52, 30, 44, 22, 38, 16, 28][i % 9] / 2}" width="8" height="${[18, 34, 52, 30, 44, 22, 38, 16, 28][i % 9]}" rx="4" fill="${c}"/>`).join('')}</g>`;
const puzzle = (x, y, s, rot, c, ch) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#soft)"><path d="M-40 -40 H-10 C-10 -58 10 -58 10 -40 H40 V-10 C58 -10 58 10 40 10 V40 H-40Z" fill="${c}" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
  <text x="0" y="14" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="40" fill="#fff">${ch}</text></g>`;
const swords = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glowS)"><g transform="rotate(35)"><rect x="-6" y="-90" width="12" height="120" rx="3" fill="#e5e7eb"/><rect x="-24" y="28" width="48" height="10" rx="4" fill="#f59e0b"/><rect x="-5" y="38" width="10" height="30" rx="4" fill="#78350f"/></g>
  <g transform="rotate(-35)"><rect x="-6" y="-90" width="12" height="120" rx="3" fill="#e5e7eb"/><rect x="-24" y="28" width="48" height="10" rx="4" fill="#f59e0b"/><rect x="-5" y="38" width="10" height="30" rx="4" fill="#78350f"/></g></g>`;
const calendar = (x, y, s, rot, num, c) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#soft)"><rect x="-50" y="-50" width="100" height="100" rx="14" fill="#fff"/><rect x="-50" y="-50" width="100" height="30" rx="14" fill="${c}"/><rect x="-50" y="-34" width="100" height="14" fill="${c}"/>
  <text x="0" y="36" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="48" fill="#1c2033">${num}</text></g>`;
const check = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glowS)"><circle r="26" fill="${c}"/><path d="M-12 0 l8 9 l16 -18" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const snow = (r, n) => Array.from({ length: n }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(1.5 + r() * 3.5).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`).join('');
const confetti = (r, n, cs) => Array.from({ length: n }, () => `<rect x="${(r() * W).toFixed(0)}" y="${(r() * H * 0.8).toFixed(0)}" width="${(6 + r() * 8).toFixed(0)}" height="${(10 + r() * 10).toFixed(0)}" rx="2" fill="${cs[Math.floor(r() * cs.length)]}" transform="rotate(${(r() * 180).toFixed(0)} ${(r() * W).toFixed(0)} ${(r() * H).toFixed(0)})" opacity=".9"/>`).join('');
const pencil = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#soft)"><rect x="-70" y="-10" width="110" height="20" fill="#facc15"/><rect x="-80" y="-10" width="14" height="20" rx="3" fill="#f472b6"/><rect x="-68" y="-10" width="6" height="20" fill="#d4d4d8"/>
  <path d="M40 -10 L70 0 L40 10Z" fill="#fde7c2"/><path d="M60 -3.5 L70 0 L60 3.5Z" fill="#1c2033"/></g>`;
const compass = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft)"><circle r="46" fill="#fef3c7" stroke="#b45309" stroke-width="7"/><path d="M0 -34 L10 0 L0 34 L-10 0Z" fill="#dc2626"/><path d="M0 0 L10 0 L0 34 L-10 0Z" fill="#334155"/><circle r="5" fill="#fff"/></g>`;
const garland = (r, c) => { let s = ''; for (let i = 0; i < 14; i++) { const x = 40 + i * 92; const y = 40 + Math.sin(i * 0.9) * 10 + 24; s += `<circle cx="${x}" cy="${y}" r="13" fill="${c[i % c.length]}" opacity=".95"/><circle cx="${x}" cy="${y}" r="5" fill="#fff7d6"/>`; } return `<path d="M0 50 Q320 110 640 60 T1280 60" stroke="#fde68a" stroke-width="3" fill="none" opacity=".6"/>${s}`; };
const lotus = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glowS)">${[-60, -30, 0, 30, 60].map((a) => `<ellipse cx="0" cy="-22" rx="13" ry="30" fill="#f9a8d4" transform="rotate(${a})"/>`).join('')}<ellipse cx="0" cy="4" rx="40" ry="10" fill="#4ade80"/></g>`;

function symbols(art, r, p) {
  switch (art) {
    case 'adventure': return `${compass(250, 420, 1.25)}${tile(420, 210, 84, -10, 'A', '#0b3b3a', '#fde68a')}${tile(1120, 250, 76, 12, 'Z', '#fff', '#14b8a6')}${book(1110, 520, 1.1, 8, '#b45309', '#0f766e')}${coin(330, 590, 34)}${coin(1010, 640, 26)}`;
    case 'loykrathong': return `${lotus(300, 620, 1.3)}${lotus(1150, 640, 1.1)}${coin(1050, 560, 28)}`;
    case 'festival': return `${garland(r, ['#f472b6', '#fde047', '#fb923c', '#a3e635'])}${lotus(260, 600, 1.2)}${gift(1110, 560, 1.1, '#ec4899', '#fde047')}${coin(380, 520, 30)}`;
    case 'ranked': return `${swords(300, 360, 1.6)}<image href="/assets/ranks/aurora-lion/badge-384.webp" x="1000" y="150" width="230" height="230" filter="url(#glowS)"/>
      <image href="/assets/ranks/storm-falcon/badge-192.webp" x="120" y="470" width="150" height="150" opacity=".95"/>${coin(1120, 560, 32)}${coin(1060, 610, 26)}`;
    case 'daily': return `${calendar(300, 300, 1.25, -8, '1', '#3b82f6')}${check(450, 470, 1.3, '#22c55e')}${check(1100, 250, 1.1, '#22c55e')}${coin(1080, 540, 38)}${coin(1150, 600, 30)}${coin(1020, 615, 26)}${book(240, 560, 0.9, -12, '#1d4ed8', '#1e3a8a')}`;
    case 'vocab': return `${tile(260, 250, 110, -12, 'A', '#4c1d95', '#fde68a')}${tile(410, 420, 92, 8, 'b', '#fff', '#8b5cf6')}${tile(1100, 230, 100, 10, 'C', '#4c1d95', '#f5d0fe')}${tile(1170, 470, 80, -6, 'w', '#fff', '#6366f1')}${book(230, 560, 1.1, -8, '#7c3aed', '#4c1d95')}`;
    case 'grammar': return `${puzzle(280, 280, 1.4, -10, '#06b6d4', 'S')}${puzzle(430, 470, 1.15, 12, '#14b8a6', 'V')}${puzzle(1110, 290, 1.25, 8, '#0ea5e9', 'O')}${book(1120, 560, 1, 8, '#0e7490', '#155e75')}`;
    case 'toeic': return `${headphones(280, 300, 1.7)}${wave(180, 520, 9, '#7dd3fc')}${wave(1020, 250, 8, '#67e8f9')}${tile(1120, 500, 90, 8, '990', '#0c1a3d', '#e0f2fe').replace('font-size="46.800000000000004"', 'font-size="30"')}`;
    case 'streak': return `${flame(290, 360, 1.9, '#f97316', '#fde047')}${flame(1110, 300, 1.4, '#fb923c', '#fef08a')}${calendar(420, 520, 1, 10, '7', '#ea580c')}${coin(1080, 590, 32)}`;
    case 'achievement': return `${trophy(300, 330, 2.1)}${star4(470, 200, 26, '#fde68a')}${star4(1080, 220, 32, '#fde68a')}${coin(1100, 520, 36)}${coin(1170, 590, 28)}${coin(250, 590, 30)}`;
    case 'halloween': return `<circle cx="1080" cy="150" r="80" fill="#fef3c7" filter="url(#glowS)"/>${pumpkin(260, 600, 1.6)}${pumpkin(1130, 620, 1.2)}${bat(300, 200, 1.2)}${bat(980, 260, 0.9)}${bat(440, 120, 0.7)}${coin(420, 560, 26)}`;
    case 'christmas': return `${tree(240, 520, 1.5)}${gift(1080, 600, 1.1, '#dc2626', '#fde047')}${gift(1190, 620, 0.85, '#16a34a', '#fecaca')}${snow(r, 90)}${star4(1100, 200, 26, '#fde68a')}`;
    case 'newyear': return `${confetti(r, 70, ['#fcd34d', '#f9a8d4', '#93c5fd', '#a7f3d0'])}${star4(300, 220, 40, '#fde68a')}${star4(1120, 190, 30, '#fde68a')}${coin(280, 560, 36)}${coin(1110, 560, 34)}${gift(1170, 630, 0.8, '#4f46e5', '#fcd34d')}`;
    case 'valentine': return `${heart(280, 300, 2.2, -12, '#fb7185')}${heart(430, 500, 1.4, 10, '#f472b6')}${heart(1100, 260, 1.8, 14, '#fda4af')}${heart(1160, 520, 1.2, -8, '#e11d48')}${coin(320, 600, 28)}`;
    case 'school': return `<rect x="150" y="170" width="300" height="190" rx="14" fill="#14532d" stroke="#a16207" stroke-width="12" filter="url(#soft)"/><text x="300" y="285" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="64" fill="#f0fdf4" opacity=".9">ABC</text>
      ${pencil(320, 470, 1.4, -20)}${book(1110, 300, 1.1, 10, '#f59e0b', '#92400e')}${book(1120, 520, 1, -6, '#0ea5e9', '#0c4a6e')}${coin(260, 600, 28)}`;
    default: return '';
  }
}

function background(art, extraSvg = '') {
  const p = P[art]; const r = rng(art.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const bokeh = Array.from({ length: 26 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.85).toFixed(0)}" r="${(8 + r() * 34).toFixed(0)}" fill="${p.bokeh[Math.floor(r() * p.bokeh.length)]}" opacity="${(0.08 + r() * 0.22).toFixed(2)}"/>`).join('');
  const sparks = Array.from({ length: 16 }, () => star4((r() * W).toFixed(0), (r() * H * 0.8).toFixed(0), (5 + r() * 11).toFixed(1), '#fff', (0.4 + r() * 0.55).toFixed(2))).join('');
  const rays = Array.from({ length: 9 }, (_, i) => `<path d="M${HX} -80 L${HX - 260 + i * 65 - 40} ${H} L${HX - 260 + i * 65 + 10} ${H}Z" fill="${p.ray}" opacity="${(0.05 + (i % 3) * 0.03).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".55" stop-color="${p.b}"/><stop offset="1" stop-color="${p.c}"/></linearGradient>
    <radialGradient id="halo" cx="${HX / W}" cy=".52" r=".42"><stop offset="0" stop-color="${p.glow}" stop-opacity=".65"/><stop offset=".45" stop-color="${p.glow}" stop-opacity=".18"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <radialGradient id="plat" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.glow}" stop-opacity=".85"/><stop offset=".6" stop-color="${p.glow}" stop-opacity=".25"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".35"/></filter>
    <filter id="glowS" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${extraSvg}
  <g filter="url(#blur18)">${rays}</g>
  <g filter="url(#blur6)">${bokeh}</g>
  <rect width="${W}" height="${H}" fill="url(#halo)"/>
  <ellipse cx="${HX}" cy="${FEET + 6}" rx="250" ry="52" fill="url(#plat)"/>
  <ellipse cx="${HX}" cy="${FEET + 4}" rx="190" ry="36" fill="none" stroke="${p.glow}" stroke-opacity=".55" stroke-width="3" stroke-dasharray="14 10"/>
  <ellipse cx="${HX}" cy="${FEET + 4}" rx="140" ry="24" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
  ${symbols(art, r, p)}
  ${sparks}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;
}

(async () => {
  const only = process.argv.slice(2);
  const arts = only.length ? only : Object.keys(HEROES);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  await pg.goto(URL); await pg.waitForTimeout(500);
  const n = `banner${Date.now() % 1e7}`;
  const tok = (await pg.evaluate(async (u) => (await (await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, email: `${u}@example.com`, password: 'password123' }) })).json()).token, n));
  await pg.evaluate((t) => localStorage.setItem('wq_token', t), tok); await pg.reload(); await pg.waitForTimeout(3000);
  // ออกจากหน้าแรก (ไม่ให้ฉาก 3D ของ Lobby แย่ง WebGL context)
  await pg.evaluate(() => EQApp.navigateTo('learn')); await pg.waitForTimeout(1500);
  for (const art of arts) {
    const hero = { ...BASE, ...HEROES[art] }; const anim = hero.anim; delete hero.anim;
    // 1) ตัวละคร 3D จริง → PNG โปร่งใส
    const avatar = await pg.evaluate(async ({ outfit, anim: a }) => {
      await EQAvatar.loadCatalog();
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:720px;z-index:99999;background:transparent';
      document.body.appendChild(box);
      const st = EQAvatar.mountStage(box, outfit, { controls: false, label: 'banner' });
      for (let i = 0; i < 300 && !(st.v && st.v.isReady && st.v.isReady()); i++) await new Promise((r) => setTimeout(r, 100));
      if (!st.v || !st.v.isReady()) throw new Error('3D ไม่พร้อม');
      const v = st.v;
      if (a) { v.play(a); await new Promise((r) => setTimeout(r, a === 'wave' ? 700 : 900)); } else await new Promise((r) => setTimeout(r, 400));
      const url = v.snapshot(1024, 'full', 0.32);
      const missing = v.missing ? v.missing() : [];
      st.dispose(); box.remove();
      return { url, missing };
    }, { outfit: hero, anim });
    if (avatar.missing && avatar.missing.length) console.warn(art, 'missing parts', avatar.missing);
    // 2) ประกอบภาพ
    let extra = '';
    if (art === 'loykrathong') extra = await pg.evaluate(() => { const s = EQFestival.bannerArt('loykrathong-2026'); return s.replace(/<svg[^>]*>/, '<svg x="0" y="0" width="1280" height="720" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">'); });
    const svg = background(art, extra ? `<g opacity=".92">${extra}</g>` : '');
    await pg.evaluate(({ svg: s, url }) => {
      const d = document.createElement('div'); d.id = 'bn-compose';
      d.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:100000;overflow:hidden';
      d.innerHTML = `${s}<img src="${url}" style="position:absolute;left:${760 - 310}px;top:${Math.round(668 - 0.94 * 620)}px;width:620px;height:620px">`;
      document.body.appendChild(d);
    }, { svg, url: avatar.url });
    await pg.waitForTimeout(600);
    const png = await pg.locator('#bn-compose').screenshot({ type: 'png' });
    await pg.evaluate(() => document.getElementById('bn-compose').remove());
    await sharp(png).webp({ quality: 82 }).toFile(path.join(OUT, `${art}-1280.webp`));
    await sharp(png).resize(640, 360).webp({ quality: 80 }).toFile(path.join(OUT, `${art}-640.webp`));
    console.log('ok', art, fs.statSync(path.join(OUT, `${art}-1280.webp`)).size, fs.statSync(path.join(OUT, `${art}-640.webp`)).size);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
