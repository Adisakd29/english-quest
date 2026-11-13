#!/usr/bin/env node
/*
  v1.21.0 สร้างภาพกรอบจาก config/cosmetics.js (ออกแบบเองทั้งหมด — ไม่ใช้ภาพจากเกมอื่น)
    - public/assets/frames/frames.svg      : <symbol id="pf_*"> กรอบโปรไฟล์ (viewBox 100×100)
      รูปโปรไฟล์ถูกย่อเหลือวงกลมรัศมี 39 ตรงกลาง (CSS .has-pf) → กรอบใช้พื้นที่รอบรูปทั้งสี่เหลี่ยม: วงโลหะ + อัญมณี ช่อใบไม้ ปีก มงกุฎ ริบบิ้น
    - public/css/cosmetics-frames.css      : สีของกรอบแชทแต่ละแบบ (+ ลายมุมเป็น SVG data URI)
  รัน: node scripts/build-frames.js
  แบบที่ 2 (13 พ.ย. 2569): ออกแบบใหม่ให้ละเอียดขึ้นตามคำขอ — โลหะเงาไล่แสง · อัญมณีเจียระไนในตัวเรือน · ช่อใบไม้ · ปีก · มงกุฎ · ริบบิ้นเลขเลเวล
*/
const fs = require('fs');
const path = require('path');
const { PROFILE_FRAMES, CHAT_FRAMES } = require('../config/cosmetics');

const r2 = (n) => Math.round(n * 100) / 100;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const dark = (h, t = 0.45) => mix(h, '#000000', t);
const light = (h, t = 0.5) => mix(h, '#ffffff', t);
const C = 50;
const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [r2(C + Math.cos(a) * r), r2(C + Math.sin(a) * r)]; };   // 0° = ขวา · 90° = ล่าง
function star(R, r, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < n * 2; i += 1) { const a = ((rot + (180 / n) * i) * Math.PI) / 180; const rr = i % 2 ? r : R; p.push(`${r2(Math.cos(a) * rr)},${r2(Math.sin(a) * rr)}`); }
  return `M${p.join('L')}Z`;
}

/* ---------------- โลหะ/สี ---------------- */
const METAL = {
  gold: ['#FFF8D6', '#F8D45C', '#C8901E', '#FFE68A', '#9A6212'],
  silver: ['#FFFFFF', '#E2E8F0', '#94A3B8', '#F1F5F9', '#64748B'],
  bronze: ['#FFE6CC', '#E8A46F', '#A0592A', '#F6C090', '#6E3616'],
  obsidian: ['#64748B', '#1E293B', '#020617', '#334155', '#0F172A'],
};
const BAND = {
  mint: ['#E6FFFA', '#5EEAD4', '#0F9F8F', '#99F6E4', '#0B5F57'],
  sunset: ['#FFF1E0', '#FDBA74', '#F0628A', '#FED7AA', '#B4235A'],
  ocean: ['#E0F7FF', '#38BDF8', '#1D4ED8', '#7DD3FC', '#172F7A'],
  sakura: ['#FFF1F7', '#F9A8D4', '#DB2777', '#FBCFE8', '#8F1650'],
  night: ['#E0E7FF', '#818CF8', '#312E81', '#A5B4FC', '#1E1B4B'],
  jade: ['#ECFDF5', '#6EE7B7', '#047857', '#A7F3D0', '#053F30'],
  galaxy: ['#FAE8FF', '#C084FC', '#6D28D9', '#22D3EE', '#3B0764'],
  emerald: ['#D1FAE5', '#34D399', '#047857', '#6EE7B7', '#064E3B'],
  sapphire: ['#DBEAFE', '#60A5FA', '#1E40AF', '#93C5FD', '#172554'],
  ruby: ['#FFE4E6', '#FB7185', '#BE123C', '#FDA4AF', '#6F0A22'],
  amethyst: ['#F5F3FF', '#C4B5FD', '#7C3AED', '#DDD6FE', '#3B0F7A'],
  diamond: ['#FFFFFF', '#CFFAFE', '#67E8F9', '#F0FDFF', '#0E7490'],
  rainbow: ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD', '#C4B5FD', '#F9A8D4'],
  ...METAL,
};
const GEM = { ruby: '#E11D48', emerald: '#10B981', sapphire: '#2563EB', amethyst: '#9333EA', diamond: '#BAF2FF', topaz: '#F59E0B', jade: '#22C55E', pearl: '#F8FAFC', aqua: '#22D3EE', pink: '#EC4899' };

/** สร้าง context ของกรอบหนึ่งแบบ: เก็บ defs (ไล่สี) ไม่ซ้ำ id */
function ctx(id) {
  const defs = []; let n = 0;
  const lin = (stops, x2 = 1, y2 = 1) => { const gid = `${id}-g${n += 1}`; defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${r2(i / (stops.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`); return `url(#${gid})`; };
  const rad = (stops, cx = 0.35, cy = 0.3, r = 0.85) => { const gid = `${id}-g${n += 1}`; defs.push(`<radialGradient id="${gid}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`); return `url(#${gid})`; };
  return { defs, lin, rad };
}

/* ---------------- ชิ้นส่วน ---------------- */
/** วงหลัก: เงาตกกระทบ · แถบไล่แสงแบบโลหะ · ขอบนูนนอก/ใน · เส้นสะท้อนแสง */
function ring(X, stops, { w = 5.2, r = 41.6, dots = 0, dotColor = '#fff' } = {}) {
  const g = X.lin(stops);
  const edge = dark(stops[stops.length - 1], 0.35);
  let s = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="${w + 1.6}" transform="translate(0 1.3)"/>`;
  s += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${g}" stroke-width="${w}"/>`;
  s += `<circle cx="50" cy="50" r="${r2(r + w / 2 - 0.25)}" fill="none" stroke="${edge}" stroke-opacity=".75" stroke-width=".7"/>`;
  s += `<circle cx="50" cy="50" r="${r2(r - w / 2 + 0.25)}" fill="none" stroke="${edge}" stroke-opacity=".8" stroke-width=".7"/>`;
  s += `<circle cx="50" cy="50" r="${r2(r - w / 2 + 1.05)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".45"/>`;
  s += `<circle cx="50" cy="50" r="${r2(r + w / 2 - 1.05)}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".45"/>`;
  // เส้นสะท้อนแสงมุมซ้ายบน
  const [ax, ay] = pt(198, r); const [bx, by] = pt(252, r);
  s += `<path d="M${ax},${ay}A${r},${r} 0 0 1 ${bx},${by}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round"/>`;
  const [cx1, cy1] = pt(262, r); const [cx2, cy2] = pt(272, r);
  s += `<path d="M${cx1},${cy1}A${r},${r} 0 0 1 ${cx2},${cy2}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round"/>`;
  for (let i = 0; i < dots; i += 1) { const [x, y] = pt((360 / dots) * i + 7, r); s += `<circle cx="${x}" cy="${y}" r=".55" fill="${dotColor}" opacity=".85"/>`; }
  return s;
}
/** อัญมณีเจียระไนในตัวเรือนโลหะ */
function gem(X, x, y, size, color, metal = 'gold') {
  const bezel = X.lin(METAL[metal]);
  const body = X.rad([[0, '#ffffff', 0.95], [0.28, light(color, 0.45)], [0.62, color], [1, dark(color, 0.5)]]);
  const f = r2(size * 0.62);
  return `<g transform="translate(${r2(x)} ${r2(y)})"><circle r="${r2(size + 1.35)}" fill="${bezel}" stroke="${dark(METAL[metal][4], 0.3)}" stroke-width=".45"/>`
    + `<circle r="${size}" fill="${body}" stroke="${dark(color, 0.55)}" stroke-width=".35"/>`
    + `<path d="M0,${-f}L${f},0L0,${f}L${-f},0Z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".35"/>`
    + `<path d="M${-size},0H${size}M0,${-size}V${size}" stroke="${dark(color, 0.4)}" stroke-opacity=".3" stroke-width=".3"/>`
    + `<ellipse cx="${r2(-size * 0.33)}" cy="${r2(-size * 0.38)}" rx="${r2(size * 0.36)}" ry="${r2(size * 0.2)}" transform="rotate(-35 ${r2(-size * 0.33)} ${r2(-size * 0.38)})" fill="#fff" opacity=".9"/></g>`;
}
function pearl(X, x, y, r, tint = '#F1F5F9') {
  const g = X.rad([[0, '#ffffff'], [0.45, tint], [1, dark(tint, 0.35)]], 0.35, 0.3, 0.9);
  return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${g}" stroke="${dark(tint, 0.45)}" stroke-width=".3"/><circle cx="${r2(x - r * 0.35)}" cy="${r2(y - r * 0.38)}" r="${r2(r * 0.28)}" fill="#fff" opacity=".9"/>`;
}
function pearls(X, n, tint, r = 1.55, off = 0) { let s = ''; for (let i = 0; i < n; i += 1) { const [x, y] = pt((360 / n) * i + off, 41.6); s += pearl(X, x, y, r, tint); } return s; }
function rivets(X, n, metal) { const g = X.rad([[0, '#fff'], [0.4, METAL[metal][1]], [1, METAL[metal][4]]]); let s = ''; for (let i = 0; i < n; i += 1) { const [x, y] = pt((360 / n) * i + 22.5, 41.6); s += `<circle cx="${x}" cy="${y}" r="1.25" fill="${g}" stroke="${dark(METAL[metal][4], 0.3)}" stroke-width=".35"/>`; } return s; }
function twinkle(x, y, s, color = '#FFFFFF', glow = true) {
  return `<g transform="translate(${r2(x)} ${r2(y)})">${glow ? `<circle r="${r2(s * 0.9)}" fill="${color}" opacity=".22"/>` : ''}<path d="${star(s, s * 0.22, 4, 0)}" fill="${color}"/><path d="${star(s * 0.55, s * 0.14, 4, 45)}" fill="${color}" opacity=".8"/></g>`;
}
/** ช่อใบไม้สองข้าง (ล่างขึ้นไปข้าง ๆ) */
function laurel(X, leafStops, stem, { a0 = 100, a1 = 212, step = 13, r = 46 } = {}) {
  const leafG = X.lin(leafStops, 1, 0);
  const one = () => {
    let s = '';
    const [sx, sy] = pt(a0, r); const [ex, ey] = pt(a1, r);
    s += `<path d="M${sx},${sy}A${r},${r} 0 0 1 ${ex},${ey}" fill="none" stroke="${stem}" stroke-width=".9" stroke-linecap="round"/>`;
    let k = 0;
    for (let a = a0 + 6; a <= a1; a += step) {
      k += 1;
      for (const side of [-1, 1]) {
        const [x, y] = pt(a, r);
        const rot = a + 90 + side * 32;   // ตามแนววง เอียงออก/เข้า
        s += `<g transform="translate(${x} ${y}) rotate(${r2(rot)})"><path d="M0,0C2.6,-2.1 6.2,-2.3 8.6,0C6.2,2.3 2.6,2.1 0,0Z" fill="${leafG}" stroke="${dark(leafStops[leafStops.length - 1], 0.35)}" stroke-width=".35"/><path d="M.6,0H7.4" stroke="${dark(leafStops[leafStops.length - 1], 0.25)}" stroke-width=".3" opacity=".7"/></g>`;
      }
    }
    return s + (k ? '' : '');
  };
  const left = one();
  return `<g>${left}</g><g transform="translate(100 0) scale(-1 1)">${left}</g>`;
}
/** ปีก (หลังวง) ซ้าย+ขวา — ขนนกซ้อน 2 ชั้น */
function wings(X, stops, { big = false } = {}) {
  const g = X.lin(stops, 1, 0);
  const g2 = X.lin(stops.slice().reverse(), 0, 1);
  const edge = dark(stops[stops.length - 1], 0.3);
  const anchor = [19, 40];
  const tips = big ? [[7, 1.5], [1.6, 9.5], [0, 19], [0, 29], [0.6, 39], [2.6, 48.5], [6.5, 57]] : [[6, 7], [1.5, 15.5], [0.2, 25], [0.6, 35], [3, 44.5], [7.5, 52.5]];
  const covert = big ? [[13, 8], [8, 15], [5.5, 23.5], [5.5, 32], [8, 41]] : [[12, 13], [7.5, 21], [6.5, 30], [9, 39]];
  const feather = (tip, w, fill) => {
    const [ax, ay] = anchor; const [tx, ty] = tip;
    const dx = tx - ax; const dy = ty - ay; const L = Math.hypot(dx, dy); const nx = -dy / L; const ny = dx / L;
    const m1 = [ax + dx * 0.55 + nx * w, ay + dy * 0.55 + ny * w]; const m2 = [ax + dx * 0.55 - nx * w * 0.7, ay + dy * 0.55 - ny * w * 0.7];
    return `<path d="M${ax},${ay}Q${r2(m1[0])},${r2(m1[1])} ${tx},${ty}Q${r2(m2[0])},${r2(m2[1])} ${ax},${ay}Z" fill="${fill}" stroke="${edge}" stroke-width=".4"/>`
      + `<path d="M${ax},${ay}L${r2(ax + dx * 0.92)},${r2(ay + dy * 0.92)}" stroke="#fff" stroke-opacity=".45" stroke-width=".3"/>`;
  };
  const one = tips.map((t) => feather(t, big ? 5 : 4.4, g)).join('') + covert.map((t) => feather(t, big ? 3.8 : 3.4, g2)).join('');
  return `<g>${one}</g><g transform="translate(100 0) scale(-1 1)">${one}</g>`;
}
/** มงกุฎด้านบน (ทับวง) */
function crown(X, metal, gems = [], { big = false } = {}) {
  const g = X.lin(METAL[metal], 0, 1);
  const edge = dark(METAL[metal][4], 0.3);
  const w = big ? 17 : 13; const top = big ? 0.6 : 2.6; const base = 12.6;
  let s = `<path d="M${50 - w},${base}L${50 - w - 1.6},${top + 3.2}L${50 - w * 0.5},${top + 7}L50,${top}L${50 + w * 0.5},${top + 7}L${50 + w + 1.6},${top + 3.2}L${50 + w},${base}Z" fill="${g}" stroke="${edge}" stroke-width=".55" stroke-linejoin="round"/>`;
  s += `<rect x="${50 - w - 0.6}" y="${base - 1.2}" width="${2 * w + 1.2}" height="3.4" rx="1.2" fill="${g}" stroke="${edge}" stroke-width=".55"/>`;
  s += `<path d="M${50 - w + 1.5},${base - 2.6}L${50 - w * 0.5},${top + 8.2}L50,${top + 2.2}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".5"/>`;
  for (const [x, y] of [[50 - w - 1.6, top + 3.2], [50, top], [50 + w + 1.6, top + 3.2]]) s += pearl(X, x, y, big ? 1.5 : 1.2, '#FFF7D6');
  const gx = gems.length ? [50, 50 - w * 0.55, 50 + w * 0.55].slice(0, gems.length) : [];
  gx.forEach((x, i) => { s += gem(X, x, base + 0.5, i === 0 ? (big ? 1.9 : 1.5) : (big ? 1.3 : 1.1), GEM[gems[i]] || gems[i], metal); });
  return s;
}
/** ริบบิ้นเลขเลเวล (ทับวงด้านล่าง) */
function ribbon(X, text, stops) {
  const g = X.lin(stops, 0, 1);
  const tail = dark(stops[Math.floor(stops.length / 2)], 0.35);
  const edge = dark(stops[stops.length - 1], 0.4);
  const w = text.length >= 3 ? 19 : 16;
  const y0 = 84.6; const y1 = 96.4;
  let s = `<path d="M${50 - w - 1},${y0 + 2}L${50 - w - 8},${y0 + 3}L${50 - w - 5},${(y0 + y1) / 2 + 1.5}L${50 - w - 8},${y1 + 0.5}L${50 - w - 1},${y1 - 0.5}Z" fill="${tail}" stroke="${edge}" stroke-width=".45" stroke-linejoin="round"/>`;
  s += `<path d="M${50 + w + 1},${y0 + 2}L${50 + w + 8},${y0 + 3}L${50 + w + 5},${(y0 + y1) / 2 + 1.5}L${50 + w + 8},${y1 + 0.5}L${50 + w + 1},${y1 - 0.5}Z" fill="${tail}" stroke="${edge}" stroke-width=".45" stroke-linejoin="round"/>`;
  s += `<path d="M${50 - w},${y0}Q50,${y0 - 2.2} ${50 + w},${y0}L${50 + w + 0.6},${y1 - 1}Q50,${y1 - 3.2} ${50 - w - 0.6},${y1 - 1}Z" fill="${g}" stroke="${edge}" stroke-width=".55" stroke-linejoin="round"/>`;
  s += `<path d="M${50 - w + 1.5},${y0 + 1.1}Q50,${y0 - 0.9} ${50 + w - 1.5},${y0 + 1.1}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".55"/>`;
  s += `<text x="50" y="${y1 - 3.6}" text-anchor="middle" font-size="${text.length >= 3 ? 8 : 8.6}" font-weight="800" letter-spacing=".2" font-family="Plus Jakarta Sans, system-ui, sans-serif" fill="#fff" stroke="${edge}" stroke-width="1.5" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
  return s;
}
/** รัศมีแสงด้านหลัง (ยื่นถึงมุม) */
function sunburst(X, stops, n = 16, { long = 70, short = 54, opacity = 1 } = {}) {
  const g = X.rad([[0, stops[0]], [0.55, stops[1]], [1, stops[2], 0.25]], 0.5, 0.5, 0.7);
  let s = `<g opacity="${opacity}">`;
  for (let i = 0; i < n; i += 1) {
    const a = (360 / n) * i - 90; const L = i % 2 ? short : long; const hw = i % 2 ? 4.2 : 5.5;
    const [x1, y1] = pt(a - hw, 40); const [x2, y2] = pt(a, L); const [x3, y3] = pt(a + hw, 40);
    s += `<path d="M${x1},${y1}L${x2},${y2}L${x3},${y3}Z" fill="${g}" stroke="${dark(stops[1], 0.3)}" stroke-opacity=".35" stroke-width=".3"/>`;
  }
  return `${s}</g>`;
}
/** คลื่นทะเลครึ่งล่าง */
function waves(X) {
  const g = X.lin(['#FFFFFF', '#BAE6FD', '#38BDF8'], 0, 1);
  let s = '';
  for (let a = 28; a <= 152; a += 15.5) {
    const [x, y] = pt(a, 46.2);
    s += `<g transform="translate(${x} ${y}) rotate(${r2(a - 90)})"><path d="M-4.6,0A4.6,4.6 0 0 1 4.6,0Q2.2,-1.2 0,.9Q-2.2,-1.2 -4.6,0Z" fill="${g}" stroke="#0369A1" stroke-width=".4"/><path d="M-3.2,-.9A3.3,3.3 0 0 1 1.5,-2.6" fill="none" stroke="#fff" stroke-width=".55" stroke-linecap="round"/></g>`;
  }
  for (const [x, y, r] of [[83, 17, 2.1], [88.5, 24, 1.4], [79, 9.5, 1.2], [14, 13, 1.5]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#E0F2FE" fill-opacity=".35" stroke="#7DD3FC" stroke-width=".45"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r2(r * 0.3)}" fill="#fff"/>`;
  return s;
}
function flower(X, x, y, s, petal = '#F9A8D4') {
  const g = X.rad([[0, '#ffffff'], [0.55, light(petal, 0.3)], [1, petal]], 0.5, 0.15, 0.9);
  let o = `<g transform="translate(${r2(x)} ${r2(y)})">`;
  for (let i = 0; i < 5; i += 1) o += `<path d="M0,0C${r2(-s * 0.55)},${r2(-s * 0.45)} ${r2(-s * 0.5)},${r2(-s * 1.05)} ${r2(-s * 0.12)},${r2(-s * 1.05)}L0,${r2(-s * 0.88)}L${r2(s * 0.12)},${r2(-s * 1.05)}C${r2(s * 0.5)},${r2(-s * 1.05)} ${r2(s * 0.55)},${r2(-s * 0.45)} 0,0Z" transform="rotate(${i * 72})" fill="${g}" stroke="${dark(petal, 0.25)}" stroke-width=".3"/>`;
  o += `<circle r="${r2(s * 0.28)}" fill="#FDE68A" stroke="#D97706" stroke-width=".3"/>`;
  for (let i = 0; i < 5; i += 1) { const a = (i * 72 + 36) * Math.PI / 180; o += `<circle cx="${r2(Math.cos(a) * s * 0.38)}" cy="${r2(Math.sin(a) * s * 0.38)}" r=".35" fill="#B45309"/>`; }
  return `${o}</g>`;
}
function sakuraBranch(X) {
  const [ax, ay] = pt(108, 47); const [mx, my] = pt(160, 51); const [bx, by] = pt(214, 46.5);
  let s = `<path d="M${ax},${ay}Q${mx},${my} ${bx},${by}" fill="none" stroke="#7C2D12" stroke-width="1.7" stroke-linecap="round"/><path d="M${ax},${ay}Q${mx},${my} ${bx},${by}" fill="none" stroke="#C2410C" stroke-width=".5" stroke-linecap="round" opacity=".7"/>`;
  const [tx, ty] = pt(150, 49);
  s += `<path d="M${tx},${ty}L${r2(tx - 5)},${r2(ty + 2.5)}" stroke="#7C2D12" stroke-width="1" stroke-linecap="round"/>`;
  for (const [a, rr, sz] of [[112, 47.2, 4.4], [146, 50.2, 4.8], [182, 49.5, 4.2], [212, 46.6, 3.6]]) { const [x, y] = pt(a, rr); s += flower(X, x, y, sz); }
  s += flower(X, r2(tx - 5.6), r2(ty + 2.9), 2.6, '#FBCFE8');
  for (const [x, y, r] of [[78, 9, 25], [87, 15, -20], [70, 4.5, 60], [92, 25, 10]]) s += `<path d="M0,0C-1.6,-1.2 -1.6,-3 0,-3.6C1.6,-3 1.6,-1.2 0,0Z" transform="translate(${x} ${y}) rotate(${r})" fill="#F9A8D4" stroke="#DB2777" stroke-width=".3"/>`;
  return s;
}
function moon(X, x, y, r) {
  const g = X.lin(['#FFF8D6', '#FDE68A', '#F59E0B'], 1, 1);
  return `<g transform="translate(${x} ${y}) rotate(-25)"><circle r="${r + 1.5}" fill="#FDE68A" opacity=".18"/><path d="M0,${-r}A${r},${r} 0 1 0 0,${r}A${r2(r * 0.72)},${r2(r * 0.82)} 0 1 1 0,${-r}Z" fill="${g}" stroke="#B45309" stroke-width=".45"/></g>`;
}
/** วงโคจรเอียง: ครึ่งหลังวาดก่อนวง ครึ่งหน้าวาดหลังวง */
function orbit(X, front) {
  const rx = 50; const ry = 13.5; const rot = -24;
  const g = X.lin(['#22D3EE', '#E879F9', '#FDE68A'], 1, 0);
  if (!front) return `<path d="M${C - rx},50A${rx},${ry} 0 0 1 ${C + rx},50" transform="rotate(${rot} 50 50)" fill="none" stroke="${g}" stroke-width="1.5" opacity=".55"/>`;
  const t = 0.62 * Math.PI; const px = C + rx * Math.cos(t); const py = 50 + ry * Math.sin(t);
  const a = (rot * Math.PI) / 180; const qx = C + (px - C) * Math.cos(a) - (py - 50) * Math.sin(a); const qy = 50 + (px - C) * Math.sin(a) + (py - 50) * Math.cos(a);
  const pg = X.rad([[0, '#FFFFFF'], [0.4, '#FBCFE8'], [1, '#A21CAF']]);
  return `<path d="M${C + rx},50A${rx},${ry} 0 0 1 ${C - rx},50" transform="rotate(${rot} 50 50)" fill="none" stroke="${g}" stroke-width="1.8"/>`
    + `<circle cx="${r2(qx)}" cy="${r2(qy)}" r="3.4" fill="${pg}" stroke="#701A75" stroke-width=".4"/><ellipse cx="${r2(qx)}" cy="${r2(qy)}" rx="5.6" ry="1.3" transform="rotate(-20 ${r2(qx)} ${r2(qy)})" fill="none" stroke="#FDE68A" stroke-width=".6"/>`;
}
function sunEmblem(X) {
  const g = X.rad([[0, '#FFFFFF'], [0.35, '#FDE68A'], [1, '#F97316']]);
  let s = '';
  for (let i = 0; i < 12; i += 1) { const a = i * 30; s += `<path d="M-1,-6.2L0,-9.6L1,-6.2Z" transform="translate(50 7.5) rotate(${a})" fill="#FB923C"/>`; }
  return `${s}<circle cx="50" cy="7.5" r="5.6" fill="${g}" stroke="#C2410C" stroke-width=".5"/>`;
}
function crystals(X, color) {
  const g = X.lin([light(color, 0.75), light(color, 0.2), color, dark(color, 0.35)], 1, 0);
  let s = '';
  for (const [x, h, w, r] of [[50, 13, 3.6, 0], [43, 9.5, 2.8, -18], [57, 9.5, 2.8, 18]]) {
    s += `<g transform="translate(${x} 12) rotate(${r})"><path d="M0,${-h}L${w},${-h + 3}L${w * 0.75},0L${-w * 0.75},0L${-w},${-h + 3}Z" fill="${g}" stroke="${dark(color, 0.45)}" stroke-width=".45" stroke-linejoin="round"/><path d="M0,${-h}L0,-.4" stroke="#fff" stroke-opacity=".6" stroke-width=".4"/></g>`;
  }
  return s;
}
function bow(X, color) {
  const g = X.lin([light(color, 0.4), color, dark(color, 0.3)], 0, 1);
  return `<g transform="translate(50 92)"><path d="M0,0C-3,-3.4 -8,-3.6 -8,0C-8,3.6 -3,3.4 0,0ZM0,0C3,-3.4 8,-3.6 8,0C8,3.6 3,3.4 0,0Z" fill="${g}" stroke="${dark(color, 0.45)}" stroke-width=".45"/><path d="M-1.2,.6L-4,6.4L-1.6,5.4L0,7L.2,1ZM1.2,.6L4,6.4L1.6,5.4L0,7L-.2,1Z" fill="${g}" stroke="${dark(color, 0.45)}" stroke-width=".4"/><circle r="1.9" fill="${g}" stroke="${dark(color, 0.45)}" stroke-width=".45"/></g>`;
}

/* ---------------- แบบของแต่ละกรอบ (ยิ่งเลเวลสูง ยิ่งมีชิ้นส่วนมาก) ---------------- */
const DESIGNS = {
  // ร้านค้า
  pf_mint: (X) => ring(X, BAND.mint) + pearls(X, 12, '#E6FFFA', 1.45) + twinkle(84, 14, 3.2) + twinkle(16, 86, 2.4),
  pf_sunset: (X) => ring(X, BAND.sunset, { dots: 0 }) + pearls(X, 8, '#FFE4E6', 1.3, 22.5) + sunEmblem(X) + twinkle(15, 18, 2.6, '#FFF1E0') + twinkle(86, 82, 2.6, '#FFF1E0'),
  pf_ocean: (X) => ring(X, BAND.ocean) + waves(X) + gem(X, 50, 8.4, 2.4, GEM.pearl, 'silver'),
  pf_sakura: (X) => ring(X, BAND.sakura, { dots: 16, dotColor: '#FFF1F7' }) + sakuraBranch(X),
  pf_starlight: (X) => ring(X, BAND.night, { dots: 20, dotColor: '#FDE68A' }) + moon(X, 17, 17, 7.5) + twinkle(83, 14, 3.6, '#FDE68A') + twinkle(90, 70, 2.6, '#FDE68A') + twinkle(12, 78, 2.2, '#C7D2FE') + twinkle(66, 4.5, 1.9, '#FFFFFF'),
  pf_jade: (X) => laurel(X, ['#BBF7D0', '#22C55E', '#14532D'], '#854D0E') + ring(X, BAND.jade) + gem(X, 50, 8.4, 2.6, GEM.jade) + bow(X, '#EAB308'),
  pf_galaxy: (X) => orbit(X, false) + ring(X, BAND.galaxy, { dots: 24, dotColor: '#F5D0FE' }) + orbit(X, true) + twinkle(84, 15, 3.4, '#FDE68A') + twinkle(15, 84, 2.6, '#A5F3FC') + twinkle(12, 22, 1.8),
  pf_sun: (X) => sunburst(X, ['#FFF7CC', '#FBBF24', '#F59E0B']) + ring(X, METAL.gold) + gem(X, 50, 8.4, 2.6, GEM.ruby) + gem(X, 8.4, 50, 2.1, GEM.ruby) + gem(X, 91.6, 50, 2.1, GEM.ruby) + gem(X, 50, 91.6, 2.1, GEM.ruby) + twinkle(83, 16, 3) + twinkle(17, 84, 2.4),
  // รางวัลเลเวล
  pf_lv10: (X) => ring(X, METAL.bronze) + rivets(X, 8, 'bronze') + ribbon(X, '10', ['#F6C090', '#C2763F', '#8A4A1F']),
  pf_lv20: (X) => wings(X, ['#FFFFFF', '#E2E8F0', '#94A3B8']) + ring(X, METAL.silver) + gem(X, 50, 8.4, 2.3, GEM.sapphire, 'silver') + ribbon(X, '20', ['#F1F5F9', '#94A3B8', '#475569']),
  pf_lv30: (X) => laurel(X, ['#FEF3C7', '#FACC15', '#A16207'], '#A16207') + ring(X, METAL.gold) + gem(X, 50, 8.4, 2.4, GEM.topaz) + ribbon(X, '30', ['#FDE68A', '#EAB308', '#A16207']),
  pf_lv40: (X) => laurel(X, ['#D1FAE5', '#10B981', '#065F46'], '#A16207') + ring(X, BAND.emerald) + gem(X, 50, 8.4, 2.7, GEM.emerald) + gem(X, 8.4, 50, 2, GEM.emerald) + gem(X, 91.6, 50, 2, GEM.emerald) + ribbon(X, '40', ['#6EE7B7', '#059669', '#064E3B']),
  pf_lv50: (X) => wings(X, ['#EFF6FF', '#93C5FD', '#1D4ED8']) + ring(X, BAND.sapphire) + rivets(X, 8, 'silver') + gem(X, 50, 8.4, 2.8, GEM.sapphire, 'silver') + twinkle(50, 2, 2.4) + ribbon(X, '50', ['#93C5FD', '#2563EB', '#1E3A8A']),
  pf_lv60: (X) => laurel(X, ['#FFE4E6', '#FB7185', '#9F1239'], '#A16207', { a0: 104, a1: 196 }) + ring(X, BAND.ruby) + crown(X, 'gold', ['ruby', 'ruby', 'ruby']) + gem(X, 8.4, 50, 2, GEM.ruby) + gem(X, 91.6, 50, 2, GEM.ruby) + ribbon(X, '60', ['#FDA4AF', '#E11D48', '#881337']),
  pf_lv70: (X) => wings(X, ['#FAF5FF', '#C4B5FD', '#6D28D9']) + ring(X, BAND.amethyst) + crystals(X, '#A855F7') + gem(X, 8.4, 50, 2, GEM.amethyst, 'silver') + gem(X, 91.6, 50, 2, GEM.amethyst, 'silver') + twinkle(85, 82, 2.4) + ribbon(X, '70', ['#DDD6FE', '#8B5CF6', '#4C1D95']),
  pf_lv80: (X) => wings(X, ['#FFFFFF', '#CFFAFE', '#22D3EE'], { big: true }) + ring(X, BAND.diamond) + crown(X, 'silver', ['diamond', 'aqua', 'aqua']) + gem(X, 8.4, 50, 2.1, GEM.diamond, 'silver') + gem(X, 91.6, 50, 2.1, GEM.diamond, 'silver') + twinkle(86, 20, 2.8) + twinkle(14, 80, 2.4) + ribbon(X, '80', ['#CFFAFE', '#22D3EE', '#0E7490']),
  pf_lv90: (X) => sunburst(X, ['#FEF3C7', '#F59E0B', '#78350F'], 20, { long: 66, short: 52 }) + wings(X, ['#FDE68A', '#B45309', '#1C1917'], { big: true }) + ring(X, METAL.obsidian) + rivets(X, 12, 'gold') + crown(X, 'gold', ['ruby', 'emerald', 'sapphire']) + ribbon(X, '90', ['#FDE68A', '#D97706', '#1C1917']),
  pf_lv100: (X) => sunburst(X, ['#FFFFFF', '#F0ABFC', '#60A5FA'], 24, { long: 70, short: 56 }) + wings(X, ['#FFF7ED', '#FDE68A', '#F472B6', '#818CF8'], { big: true }) + ring(X, BAND.rainbow, { w: 5.6 }) + pearls(X, 16, '#FFFFFF', 1.05, 11.25) + crown(X, 'gold', ['diamond', 'ruby', 'sapphire'], { big: true }) + gem(X, 8.4, 50, 2.2, GEM.emerald) + gem(X, 91.6, 50, 2.2, GEM.amethyst) + twinkle(88, 30, 2.6) + twinkle(12, 30, 2.6) + ribbon(X, '100', ['#FDE68A', '#F59E0B', '#7C2D12']),
};


/* ---------------- v1.21.0 คอลเลกชันน่ารัก: สไตล์สติกเกอร์ — วงพาสเทลหนา ขอบนุ่ม เส้นขอบสีโกโก้ ---------------- */
const INK = '#6B4652';
function cuteRing(X, stops, { w = 6.4, r = 41.4, stripes = null } = {}) {
  const g = X.lin(stops);
  let s = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${INK}" stroke-width="${w + 2.2}"/>`;
  s += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${g}" stroke-width="${w}"/>`;
  if (stripes) s += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${stripes}" stroke-width="${w}" stroke-dasharray="4.2 4.2" transform="rotate(12 50 50)"/>`;
  s += `<circle cx="50" cy="50" r="${r2(r - w / 2 + 1.3)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".9"/>`;
  const [ax, ay] = pt(200, r + 0.8); const [bx, by] = pt(240, r + 0.8);
  s += `<path d="M${ax},${ay}A${r + 0.8},${r + 0.8} 0 0 1 ${bx},${by}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/>`;
  return s;
}
const cheek = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.4" fill="#FB7185" opacity=".55"/>`;
function heart(x, y, sz, fill, rot = 0) {
  return `<path d="M0,${r2(sz * 0.9)}C${r2(-sz * 1.3)},${r2(sz * 0.05)} ${r2(-sz * 1.05)},${r2(-sz * 1.05)} 0,${r2(-sz * 0.45)}C${r2(sz * 1.05)},${r2(-sz * 1.05)} ${r2(sz * 1.3)},${r2(sz * 0.05)} 0,${r2(sz * 0.9)}Z" transform="translate(${r2(x)} ${r2(y)}) rotate(${rot})" fill="${fill}" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>`
    + `<ellipse cx="${r2(x - sz * 0.42)}" cy="${r2(y - sz * 0.32)}" rx="${r2(sz * 0.22)}" ry="${r2(sz * 0.13)}" transform="rotate(-35 ${r2(x - sz * 0.42)} ${r2(y - sz * 0.32)})" fill="#fff" opacity=".85"/>`;
}
function cuteStar(x, y, sz, fill) { return `<path d="${star(sz, sz * 0.48)}" transform="translate(${x} ${y})" fill="${fill}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>`; }
function catEars(X, fur, inner) {
  const g = X.lin([light(fur, 0.35), fur], 0, 1);
  const one = (a) => {
    const [b1x, b1y] = pt(a - 15, 42); const [b2x, b2y] = pt(a + 15, 42); const [tx, ty] = pt(a, 59);
    const [i1x, i1y] = pt(a - 8.5, 45); const [i2x, i2y] = pt(a + 8.5, 45); const [itx, ity] = pt(a, 55);
    return `<path d="M${b1x},${b1y}Q${r2((b1x + tx) / 2 - 1)},${r2((b1y + ty) / 2 - 1)} ${tx},${ty}Q${r2((b2x + tx) / 2 + 1)},${r2((b2y + ty) / 2 - 1)} ${b2x},${b2y}Z" fill="${g}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`
      + `<path d="M${i1x},${i1y}L${itx},${ity}L${i2x},${i2y}Z" fill="${inner}" stroke="${INK}" stroke-width=".5" stroke-linejoin="round" opacity=".9"/>`;
  };
  return one(-128) + one(-52);
}
function whiskers(side) {
  const x = side < 0 ? 4.5 : 95.5; const d = side < 0 ? 1 : -1;
  return [46, 52, 58].map((y, i) => `<path d="M${x},${y}Q${x + d * 3},${y - 0.6 + i * 0.6} ${x + d * 6},${y + (i - 1) * 1.2}" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/>`).join('');
}
function bunnyEars(X) {
  const g = X.lin(['#FFFFFF', '#F1F5F9'], 0, 1);
  const one = (a) => {
    const [cx, cy] = pt(a, 50);
    return `<g transform="translate(${cx} ${cy}) rotate(${a + 90})"><ellipse rx="6.4" ry="11.6" fill="${g}" stroke="${INK}" stroke-width="1"/><ellipse rx="3.4" ry="8.4" cy=".9" fill="#FBCFE8" stroke="${INK}" stroke-width=".45"/></g>`;
  };
  return one(-128) + one(-52);
}
function bearEars(X) {
  const g = X.rad([[0, '#E7C3A0'], [1, '#B07D52']], 0.4, 0.35, 0.8);
  return [-132, -48].map((a) => { const [x, y] = pt(a, 46.5); return `<circle cx="${x}" cy="${y}" r="9.6" fill="${g}" stroke="${INK}" stroke-width="1"/><circle cx="${x}" cy="${y}" r="5.2" fill="#F9C9B5" stroke="${INK}" stroke-width=".5"/>`; }).join('');
}
function paw(x, y, sz, fill, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sz})"><ellipse cy="1.3" rx="2.3" ry="1.9" fill="${fill}" stroke="${INK}" stroke-width=".45"/>${[[-2.2, -1.3], [-.8, -2.6], [.8, -2.6], [2.2, -1.3]].map(([px, py]) => `<circle cx="${px}" cy="${py}" r=".85" fill="${fill}" stroke="${INK}" stroke-width=".4"/>`).join('')}</g>`;
}
function lollipop(x, y, rot, c1, c2) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-.75" y="2.5" width="1.5" height="9" rx=".7" fill="#FFF7ED" stroke="${INK}" stroke-width=".5"/><circle r="5.2" fill="${c1}" stroke="${INK}" stroke-width=".8"/><path d="M0,0C1.6,-.4 1.9,-2.2 .6,-3.2C-1.6,-4.4 -4.4,-2.2 -3.9,.6C-3.4,3.6 .4,5 3,3.6C5.2,2.2 4.6,-1.6 3.3,-2.9" fill="none" stroke="${c2}" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="-2" cy="-2.6" rx="1.3" ry=".7" fill="#fff" opacity=".8"/></g>`;
}
function sprinkles(list) { return list.map(([x, y, r, c]) => `<rect x="-1.6" y="-.55" width="3.2" height="1.1" rx=".55" transform="translate(${x} ${y}) rotate(${r})" fill="${c}" stroke="${INK}" stroke-width=".3"/>`).join(''); }
function cloudPuffs() {
  let s = '';
  for (let a = 22; a <= 158; a += 17) { const [x, y] = pt(a, 45.5); const rr = a % 2 ? 6.2 : 5.4; s += `<circle cx="${x}" cy="${y}" r="${rr}" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1"/>`; }
  for (let a = 22; a <= 158; a += 17) { const [x, y] = pt(a, 45.5); s += `<circle cx="${x}" cy="${y}" r="${(a % 2 ? 6.2 : 5.4) - 1.1}" fill="#FFFFFF"/>`; }
  return s;
}
function rainbowArc() {
  return ['#FCA5A5', '#FDE68A', '#86EFAC', '#93C5FD'].map((c, i) => { const r = 49.4 - i * 2.2; const [ax, ay] = pt(-158, r); const [bx, by] = pt(-22, r); return `<path d="M${ax},${ay}A${r},${r} 0 0 1 ${bx},${by}" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round"/>`; }).join('');
}
function strawberry(x, y, sz, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sz})"><path d="M0,5.2C-4.4,3 -4.6,-2.2 -2.2,-3.2C-1,-3.7 1,-3.7 2.2,-3.2C4.6,-2.2 4.4,3 0,5.2Z" fill="#F43F5E" stroke="${INK}" stroke-width=".6"/>${[[-1.4, -1], [1.3, -.8], [0, .8], [-1.6, 1.9], [1.5, 2]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx=".3" ry=".45" fill="#FEF08A"/>`).join('')}<path d="M-2.6,-3.3L-1,-2.6L0,-4.4L1,-2.6L2.6,-3.3L1.4,-1.9L-1.4,-1.9Z" fill="#4ADE80" stroke="${INK}" stroke-width=".45" stroke-linejoin="round"/></g>`;
}
function berrySeeds() { let s = ''; for (let i = 0; i < 22; i += 1) { const [x, y] = pt(i * (360 / 22) + 4, 41.4 + (i % 2 ? 1.3 : -1.3)); s += `<ellipse cx="${x}" cy="${y}" rx=".55" ry=".85" transform="rotate(${r2(i * (360 / 22) + 94)} ${x} ${y})" fill="#FEF08A" stroke="#CA8A04" stroke-width=".25"/>`; } return s; }
function leafCrown() {
  let s = '';
  for (const [a, len] of [[-90, 11], [-108, 9.5], [-72, 9.5], [-124, 7.5], [-56, 7.5]]) {
    const [x, y] = pt(a, 43);
    s += `<g transform="translate(${x} ${y}) rotate(${a + 90})"><path d="M0,0C-3.4,${-len * 0.45} -2.4,${-len} 0,${-len}C2.4,${-len} 3.4,${-len * 0.45} 0,0Z" fill="#4ADE80" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/><path d="M0,-.5V${r2(-len * 0.8)}" stroke="#15803D" stroke-width=".45"/></g>`;
  }
  return s;
}
function bigBow(X, color) {
  const g = X.lin([light(color, 0.45), color, dark(color, 0.15)], 0, 1);
  return `<g transform="translate(50 9.5)"><path d="M0,0C-4,-6 -14,-6.5 -13.5,0C-13,6.5 -4,6 0,0ZM0,0C4,-6 14,-6.5 13.5,0C13,6.5 4,6 0,0Z" fill="${g}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`
    + `<path d="M-1.6,1.4L-6.5,10L-3,8.8L-1.2,11.6L.3,2.4ZM1.6,1.4L6.5,10L3,8.8L1.2,11.6L-.3,2.4Z" fill="${g}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>`
    + `<rect x="-3.2" y="-3.3" width="6.4" height="6.6" rx="2.6" fill="${g}" stroke="${INK}" stroke-width=".9"/>`
    + `<path d="M-10.6,-2.6Q-6.4,-4.8 -2.6,-1.4M10.6,-2.6Q6.4,-4.8 2.6,-1.4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".7" stroke-linecap="round"/></g>`;
}
function chick(X) {
  const body = X.rad([[0, '#FFF9C4'], [0.6, '#FDE047'], [1, '#EAB308']], 0.4, 0.35, 0.8);
  return `<g transform="translate(50 86)">`
    + `<path d="M-9.5,-3.5L-7,1L-4.4,-2.6L-1.6,1.6L1.4,-2.8L4.4,1.4L7,-2.4L9.5,1.6L10,8C5,13 -5,13 -10,8Z" fill="#FFFBEB" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`
    + `<circle cy="-6" r="9.6" fill="${body}" stroke="${INK}" stroke-width="1"/>`
    + `<path d="M-1.5,-15.6C-1,-18.4 1.2,-18.6 1.4,-16.4C2.6,-18 4.4,-17 3,-15" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/>`
    + `<circle cx="-3.4" cy="-7" r="1.25" fill="${INK}"/><circle cx="3.4" cy="-7" r="1.25" fill="${INK}"/><circle cx="-3" cy="-7.4" r=".4" fill="#fff"/><circle cx="3.8" cy="-7.4" r=".4" fill="#fff"/>`
    + `<path d="M-1.6,-4.6L0,-3L1.6,-4.6Q0,-5.6 -1.6,-4.6Z" fill="#FB923C" stroke="${INK}" stroke-width=".5" stroke-linejoin="round"/>`
    + `${cheek(-6, -4.2)}${cheek(6, -4.2)}`
    + `<path d="M-9.2,-4.5Q-12.6,-3.2 -10.4,0.2" fill="#FDE047" stroke="${INK}" stroke-width=".8"/><path d="M9.2,-4.5Q12.6,-3.2 10.4,0.2" fill="#FDE047" stroke="${INK}" stroke-width=".8"/></g>`;
}
const CUTE = {
  pf_cute_cat: (X) => catEars(X, '#FDBA74', '#FBCFE8') + cuteRing(X, ['#FFEDD5', '#FDBA74', '#FB923C']) + whiskers(-1) + whiskers(1) + paw(84, 88, 1.15, '#FFEDD5', 20) + heart(15, 87, 2.6, '#FDA4AF', -15),
  pf_cute_bunny: (X) => bunnyEars(X) + cuteRing(X, ['#FFFFFF', '#FBCFE8', '#F9A8D4']) + strawberry(85, 85, 0.9, 15) + heart(14, 86, 2.5, '#FDA4AF', -15) + cuteStar(50, 95.2, 2.6, '#FDE68A'),
  pf_cute_bear: (X) => bearEars(X) + cuteRing(X, ['#F5E1CC', '#D6A77A', '#A86F45']) + paw(13.5, 84, 1.2, '#F9C9B5', -25) + paw(86.5, 84, 1.2, '#F9C9B5', 25) + paw(50, 95.5, 0.9, '#F9C9B5', 0) + heart(50, 6.5, 2.6, '#FB7185'),
  pf_cute_candy: (X) => cuteRing(X, ['#FFFFFF', '#FFFFFF'], { stripes: '#F472B6' }) + lollipop(12, 82, -25, '#FBCFE8', '#EC4899') + lollipop(88, 82, 25, '#BAE6FD', '#38BDF8')
    + sprinkles([[16, 14, 30, '#FDE047'], [84, 13, -25, '#86EFAC'], [9, 40, 70, '#93C5FD'], [92, 38, -60, '#F9A8D4'], [24, 6, -10, '#C4B5FD'], [77, 6, 15, '#FDBA74']]) + heart(50, 6, 2.8, '#F472B6'),
  pf_cute_cloud: (X) => rainbowArc() + cuteRing(X, ['#E0F2FE', '#BAE6FD', '#C4B5FD']) + cloudPuffs() + cuteStar(12, 18, 2.8, '#FDE68A') + cuteStar(88, 18, 2.8, '#FDE68A') + twinkle(20, 6, 1.8, '#FDE68A'),
  pf_cute_berry: (X) => cuteRing(X, ['#FDA4AF', '#F43F5E', '#E11D48']) + berrySeeds() + leafCrown() + strawberry(13, 84, 1.25, -20) + strawberry(87, 84, 1.25, 20) + heart(50, 95.6, 2.2, '#FFF1F2'),
  pf_cute_heart: (X) => { let s = cuteRing(X, ['#FFF1F2', '#FBCFE8', '#F472B6']); for (const [a, sz, c] of [[-160, 3.2, '#FB7185'], [-20, 3.2, '#FB7185'], [150, 3.6, '#F472B6'], [30, 3.6, '#F472B6'], [180, 2.4, '#FDA4AF'], [0, 2.4, '#FDA4AF'], [110, 2.6, '#FBCFE8'], [70, 2.6, '#FBCFE8'], [90, 3.4, '#E11D48']]) { const [x, y] = pt(a, 47); s += heart(x, y, sz, c, a > 90 && a < 270 ? -12 : 12); } return s + bigBow(X, '#F472B6') + twinkle(12, 14, 2.2) + twinkle(88, 14, 2.2); },
  pf_cute_chick: (X) => cuteRing(X, ['#FEF9C3', '#FDE047', '#FACC15']) + chick(X) + [[-150, '#FDE68A'], [-30, '#FDE68A'], [-90, '#FBCFE8']].map(([a, c]) => { const [x, y] = pt(a, 47.5); return cuteStar(x, y, 2.6, c); }).join('') + heart(9, 60, 2.2, '#FDA4AF', -20) + heart(91, 60, 2.2, '#FDA4AF', 20),
};
Object.assign(DESIGNS, CUTE);

function profileFrame(f) {
  const design = DESIGNS[f.id];
  if (!design) throw new Error(`ไม่มีแบบของกรอบ ${f.id}`);
  const X = ctx(f.id);
  const body = design(X);
  return `<symbol id="${f.id}" viewBox="0 0 100 100"><title>${f.nameTh}</title><defs>${X.defs.join('')}</defs>${body}</symbol>`;
}

/* ---------------- กรอบแชท: ลายมุม (SVG 24×24 มีไล่สี) ---------------- */
function chatOrn(t, c1, c2) {
  const s = dark(c2, 0.35);
  const grad = `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(c1, 0.55)}"/><stop offset=".5" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><radialGradient id="b" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${light(c2, 0.35)}"/><stop offset="1" stop-color="${dark(c2, 0.25)}"/></radialGradient></defs>`;
  const shapes = {
    dot: `<circle cx="12" cy="12" r="6.5" fill="url(#b)" stroke="${s}" stroke-width="1"/><circle cx="9.8" cy="9.6" r="1.8" fill="#fff"/>`,
    sun: `${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => `<path d="M11,1.6L12,5.2L13,1.6Z" fill="${c2}" transform="rotate(${a} 12 12)"/>`).join('')}<circle cx="12" cy="12" r="5.6" fill="url(#b)" stroke="${s}" stroke-width=".9"/>`,
    wave: `<path d="M2,15.5A6,6 0 0 1 14,15.5Q11,13.8 8,16.2Q5,13.8 2,15.5Z" fill="url(#a)" stroke="${s}" stroke-width=".8"/><path d="M10,12A6,6 0 0 1 22,12Q19,10.3 16,12.7Q13,10.3 10,12Z" fill="url(#a)" stroke="${s}" stroke-width=".8"/><circle cx="19" cy="5" r="1.6" fill="none" stroke="${c2}" stroke-width=".8"/>`,
    petal: `${[0, 72, 144, 216, 288].map((a) => `<path d="M12,12C9.5,9.6 9.6,5.4 11.4,4.4L12,5.6L12.6,4.4C14.4,5.4 14.5,9.6 12,12Z" fill="url(#a)" stroke="${s}" stroke-width=".55" transform="rotate(${a} 12 12)"/>`).join('')}<circle cx="12" cy="12" r="1.9" fill="#FDE68A" stroke="#D97706" stroke-width=".5"/>`,
    star: `<circle cx="12" cy="12.5" r="9" fill="${c1}" opacity=".2"/><path d="${star(9.4, 4.1)}" transform="translate(12 12.8)" fill="url(#a)" stroke="${s}" stroke-width=".9" stroke-linejoin="round"/><circle cx="10" cy="10" r="1.2" fill="#fff" opacity=".9"/>`,
    crown: `<path d="M3,18L2,7.5L7.5,11.5L12,4L16.5,11.5L22,7.5L21,18Z" fill="url(#a)" stroke="${s}" stroke-width="1" stroke-linejoin="round"/><rect x="3" y="17" width="18" height="3" rx="1" fill="url(#a)" stroke="${s}" stroke-width=".8"/><circle cx="12" cy="13.6" r="1.9" fill="#F43F5E" stroke="${s}" stroke-width=".5"/><circle cx="12" cy="4" r="1.3" fill="#fff" stroke="${s}" stroke-width=".4"/>`,
    gem: `<path d="M5,9L9,4H15L19,9L12,21Z" fill="url(#a)" stroke="${s}" stroke-width="1" stroke-linejoin="round"/><path d="M5,9H19M9,4L10.5,9L12,21L13.5,9L15,4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".6"/>`,
    leaf: `<path d="M4,20C4,10 10,4 20,4C20,14 14,20 4,20Z" fill="url(#a)" stroke="${s}" stroke-width="1"/><path d="M5.5,18.5L16,8M9,15L8.6,11M12,12L15.6,12.4" stroke="${s}" stroke-width=".7" stroke-linecap="round"/>`,
    heart: `<path d="M12,21C4,15.5 2.2,10.4 4.6,7C7,3.8 10.6,4.8 12,7.6C13.4,4.8 17,3.8 19.4,7C21.8,10.4 20,15.5 12,21Z" fill="url(#a)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="8.4" cy="9" rx="1.7" ry="1" transform="rotate(-35 8.4 9)" fill="#fff" opacity=".9"/>`,
    cloud: `<path d="M6,18.5C2.6,18.5 1.6,14 4.8,12.8C4.4,9 8.6,7.4 10.6,9.6C11.8,5.8 17.4,6 18,10.4C21.6,10.4 22.6,15.4 19.4,17.4C18.8,18.2 18,18.5 17,18.5Z" fill="#fff" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.4,14.2Q7.4,12.2 9.4,13" fill="none" stroke="${c2}" stroke-width=".9" stroke-linecap="round"/><circle cx="20.5" cy="4.5" r="2" fill="#FDE68A" stroke="${INK}" stroke-width=".6"/>`,
    scoop: `<path d="M7.4,12.6L12,22.4L16.6,12.6Z" fill="#FCD34D" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><path d="M8.6,15L15.4,15M9.8,17.6L14.2,17.6" stroke="#B45309" stroke-width=".6"/><circle cx="12" cy="9.6" r="5.6" fill="url(#a)" stroke="${INK}" stroke-width="1"/><circle cx="10" cy="8.4" r=".9" fill="#7C4A2D"/><circle cx="13.8" cy="10.6" r=".8" fill="#7C4A2D"/><circle cx="12.6" cy="6.8" r=".7" fill="#7C4A2D"/>`,
    berry: `<path d="M12,22C5.4,18.6 5,10.4 8.4,8.8C10,8 14,8 15.6,8.8C19,10.4 18.6,18.6 12,22Z" fill="#F43F5E" stroke="${INK}" stroke-width="1"/>${[[9.6, 12], [14.2, 12.2], [12, 15], [9.4, 16.4], [14.6, 16.6], [12, 19]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".45" ry=".7" fill="#FEF08A"/>`).join('')}<path d="M7.6,8.6L10.4,9.4L12,6.2L13.6,9.4L16.4,8.6L14.6,11L9.4,11Z" fill="#4ADE80" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/><ellipse cx="9.6" cy="11.6" rx="1" ry=".6" fill="#fff" opacity=".8"/>`,
    paw: `<ellipse cx="12" cy="15.4" rx="5" ry="4.2" fill="url(#a)" stroke="${INK}" stroke-width="1"/>${[[6.4, 10.2], [9.6, 6.6], [14.4, 6.6], [17.6, 10.2]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="2.3" fill="url(#a)" stroke="${INK}" stroke-width=".8"/>`).join('')}`,
    spark: `<circle cx="12" cy="12" r="8.5" fill="${c1}" opacity=".22"/><path d="${star(10.5, 2.4, 4, 0)}" transform="translate(12 12)" fill="url(#a)" stroke="${s}" stroke-width=".8" stroke-linejoin="round"/><path d="${star(5.5, 1.4, 4, 45)}" transform="translate(12 12)" fill="#fff" opacity=".85"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${grad}${shapes[t] || shapes.dot}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')}")`;
}

const outSvg = path.join(__dirname, '..', 'public', 'assets', 'frames', 'frames.svg');
fs.mkdirSync(path.dirname(outSvg), { recursive: true });
fs.writeFileSync(outSvg, `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">\n<!-- สร้างโดย scripts/build-frames.js จาก config/cosmetics.js — อย่าแก้ด้วยมือ -->\n${PROFILE_FRAMES.map(profileFrame).join('\n')}\n</svg>\n`);

const css = CHAT_FRAMES.map((f) => {
  const grad = f.ringCss || `linear-gradient(135deg, ${f.ring.map((c, i) => `${c} ${Math.round((i / (f.ring.length - 1)) * 100)}%`).join(', ')})`;
  return `[data-cf="${f.id}"] { --cf-ring: ${grad}; --cf-tint: ${f.tint}; --cf-glow: ${f.ring[0]}; --cf-orn: ${chatOrn(f.orn, f.ring[0], f.ring[f.ring.length - 1])}; }`;
}).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'css', 'cosmetics-frames.css'),
  `/* สร้างโดย scripts/build-frames.js จาก config/cosmetics.js — อย่าแก้ด้วยมือ */\n${css}\n`);
console.log(`frames.svg: ${PROFILE_FRAMES.length} กรอบโปรไฟล์ · cosmetics-frames.css: ${CHAT_FRAMES.length} กรอบแชท`);
