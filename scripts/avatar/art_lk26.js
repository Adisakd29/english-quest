/*
  EnglishQuest Avatar — งานศิลป์ 2D: Loy Krathong Festival 2026 (เทศกาลลอยกระทง 2569)
  สเปกเดียวกับ art.js (canvas 240×320 · เส้นขอบ #2b2440) — ใช้คู่กับโมเดล 3D จริงของชิ้นเดียวกัน (items_loykrathong.py)
  ทิศ: ภาพ 2D หันหน้าเข้าหาผู้ชม → ด้านซ้ายของภาพ = ด้านขวาของตัวละคร (ดอกลีลาวดีทัดหูขวา · ร่มอยู่หลังไหล่ขวา · ผ้าขาวม้าพาดบ่าซ้าย)
*/
const OL = '#2b2440';
const SW = 2.5;
const limb = (x1, y1, x2, y2, w, color) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${OL}" stroke-width="${w + SW * 2}" stroke-linecap="round"/>`
  + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`;
const L = (d, color = OL, w = 2.5, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const C = (x, y, r, fill, sw = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${sw}"/>`;
const mirror = (s) => `<g transform="translate(240,0) scale(-1,1)">${s}</g>`;
const both = (s) => s + mirror(s);
const f1 = (n) => n.toFixed(1);
const TORSO = 'M80 166 Q120 152 160 166 Q166 202 158 242 Q120 252 82 242 Q74 202 80 166 Z';
const LONG_SLEEVES = (c) => limb(87, 174, 71, 234, 27, c) + limb(153, 174, 169, 234, 27, c);
const CUFFS = (c) => limb(72, 230, 70, 236, 27, c) + limb(168, 230, 170, 236, 27, c);
const footPair = (shape) => shape + `<g transform="translate(36,0)">${shape}</g>`;

// ดอกลีลาวดี: 5 กลีบรูปไข่กลับ ซ้อนแบบกังหัน · กลางดอกเหลือง
const frangipani = (cx, cy, r, rot = 0) => {
  const petals = [0, 1, 2, 3, 4].map((k) => {
    const a = rot + (k * 72);
    return `<ellipse cx="${f1(cx)}" cy="${f1(cy - r * 0.52)}" rx="${f1(r * 0.42)}" ry="${f1(r * 0.6)}" fill="#fffaf0" stroke="${OL}" stroke-width="1.6" transform="rotate(${a + 12} ${f1(cx)} ${f1(cy)})"/>`;
  }).join('');
  return `${petals}<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.42)}" fill="#ffc93c" opacity=".95"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.16)}" fill="#f2a516"/>`;
};
// ดอกตูมมะลิ (วงรีเล็ก)
const bud = (x, y, a, s = 1) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(2.6 * s)}" ry="${f1(3.6 * s)}" fill="#fffdf6" stroke="${OL}" stroke-width="1" transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})"/>`;
// กระทงใบตอง: ฐานหยวก + กลีบบัวพับ + ดาวเรือง + เทียน
const krathong = (x, y, s, id) => {
  const petals = [-3, -2, -1, 0, 1, 2, 3].map((k) => {
    const px = x + k * 6.2 * s; const top = y - (16 - Math.abs(k) * 2.2) * s;
    return `<path d="M${f1(px - 4.6 * s)} ${f1(y - 3 * s)} L${f1(px)} ${f1(top)} L${f1(px + 4.6 * s)} ${f1(y - 3 * s)} Z" fill="${k % 2 ? '#3f8f3a' : '#4fa847'}" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/>${L(`M${f1(px)} ${f1(top + 1)} L${f1(px)} ${f1(y - 4 * s)}`, '#2d6e2a', 1)}`;
  }).join('');
  return `<g><ellipse cx="${x}" cy="${f1(y + 4 * s)}" rx="${f1(34 * s)}" ry="${f1(7 * s)}" fill="none" stroke="#bfe6ff" stroke-width="1.6" opacity=".8"/>
    <ellipse cx="${x}" cy="${f1(y + 4 * s)}" rx="${f1(26 * s)}" ry="${f1(5 * s)}" fill="none" stroke="#dff3ff" stroke-width="1.4" opacity=".85"/>
    <radialGradient id="${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
    <circle cx="${f1(x - 3 * s)}" cy="${f1(y - 22 * s)}" r="${f1(12 * s)}" fill="url(#${id})"/>
    <path d="M${f1(x - 22 * s)} ${f1(y - 2 * s)} L${f1(x + 22 * s)} ${f1(y - 2 * s)} L${f1(x + 19 * s)} ${f1(y + 4 * s)} Q${x} ${f1(y + 7 * s)} ${f1(x - 19 * s)} ${f1(y + 4 * s)} Z" fill="#e4e8bd" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>
    ${petals}${C(f1(x + 3 * s), f1(y - 8 * s), f1(4.6 * s), '#ff9a1a', 1.3)}
    <rect x="${f1(x - 5 * s)}" y="${f1(y - 21 * s)}" width="${f1(3.2 * s)}" height="${f1(12 * s)}" rx="1" fill="#fff3d6" stroke="${OL}" stroke-width="1"/>
    <path d="M${f1(x - 3.4 * s)} ${f1(y - 29 * s)} Q${f1(x - 0.6 * s)} ${f1(y - 24 * s)} ${f1(x - 3.4 * s)} ${f1(y - 21.5 * s)} Q${f1(x - 6.2 * s)} ${f1(y - 24 * s)} ${f1(x - 3.4 * s)} ${f1(y - 29 * s)} Z" fill="#ffd257" stroke="#ff9a1a" stroke-width=".8"/></g>`;
};

module.exports = function extend(A) {
  /* ---------- Day 1 — ดอกลีลาวดีทัดหู (ไม่ครอบศีรษะ · ไม่ซ่อนผม) ---------- */
  A.HATS.lk26_frangipani = () => `${P('M74 70 Q56 52 44 50 Q54 62 70 76 Z', '#3d7a36')}${P('M70 84 Q50 88 40 98 Q56 98 70 90 Z', '#3d7a36')}
    ${L('M72 72 Q58 60 48 54 M70 86 Q56 92 46 96', '#2a5a26', 1.2)}${frangipani(76, 70, 13, 8)}${frangipani(84, 90, 11, 40)}${frangipani(66, 90, 10, 20)}`;

  /* ---------- Day 2 — รองเท้าแตะสาน ---------- */
  A.SHOES.lk26_sandals = () => footPair(`<ellipse cx="102" cy="303" rx="16" ry="7" fill="#e8b48c" stroke="${OL}" stroke-width="2.2"/>
    <rect x="85" y="304" width="34" height="5" rx="2.5" fill="#d8b06a" stroke="${OL}" stroke-width="2"/><path d="M86 308 L118 308" stroke="#3a2a20" stroke-width="2.4"/>
    ${P('M88 304 Q88 291 102 290 Q116 291 116 304 Z', '#d8b06a')}
    ${[[92, 294], [100, 293], [108, 294], [96, 299], [104, 299], [112, 299]].map(([x, y], i) => `<rect x="${x - 3}" y="${y - 2.2}" width="6" height="4.4" fill="${i % 2 ? '#7a4a24' : '#e9c98a'}" opacity=".9"/>`).join('')}
    ${L('M89 302 Q89 292 102 291 Q115 292 115 302', '#5a3418', 1.6)}`);

  /* ---------- Day 3 — เสื้อคอจีนผ้าฝ้ายย้อมคราม ---------- */
  A.TOPS.lk26_indigo = () => `${LONG_SLEEVES('#2e4f86')}${CUFFS('#284677')}${P(TORSO, '#2e4f86')}
    <g opacity=".22">${[[98, 190, 9], [140, 214, 11], [108, 228, 7], [146, 182, 6], [92, 214, 6]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="#6f8fc4"/>`).join('')}</g>
    ${P('M104 160 Q120 154 136 160 L135 168 Q120 163 105 168 Z', '#2e4f86')}${L('M118 164 L118 246', '#9fb3d8', 1.2)}${L('M123 164 L123 246', '#9fb3d8', 1.2)}
    ${[176, 192, 208, 224].map((y) => `${L(`M110 ${y} Q117 ${y - 3} 123 ${y}`, '#1d355f', 2.4)}${L(`M110 ${y} Q117 ${y + 3} 123 ${y}`, '#1d355f', 2.4)}<circle cx="125" cy="${y}" r="2.6" fill="#1d355f" stroke="${OL}" stroke-width="1"/>`).join('')}
    ${P('M90 222 L106 222 L106 238 L90 238 Z', '#2e4f86')}${P('M134 222 L150 222 L150 238 L134 238 Z', '#2e4f86')}${L('M92 226 L104 226 M136 226 L148 226', '#9fb3d8', 1)}`;

  /* ---------- Day 4 — ร่มบ่อสร้าง (กางพิงหลัง หลังคาร่มอยู่หลังไหล่ขวา) ---------- */
  A.BACKS.lk26_umbrella = {
    back: () => {
      const cx = 58; const cy = 122; const rx = 54; const ry = 46;
      const ribs = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `M${cx} ${cy} L${f1(cx + Math.cos(a) * rx)} ${f1(cy + Math.sin(a) * ry)}`; }).join(' ');
      const scal = Array.from({ length: 16 }, (_, i) => { const a0 = (i / 16) * Math.PI * 2; const a1 = ((i + 1) / 16) * Math.PI * 2; const am = (a0 + a1) / 2;
        return `${i ? 'Q' : `M${f1(cx + Math.cos(a0) * rx)} ${f1(cy + Math.sin(a0) * ry)} Q`}${f1(cx + Math.cos(am) * rx * 0.94)} ${f1(cy + Math.sin(am) * ry * 0.94)} ${f1(cx + Math.cos(a1) * rx)} ${f1(cy + Math.sin(a1) * ry)}`; }).join(' ');
      const blossom = (x, y, r, c) => [0, 1, 2, 3, 4].map((k) => `<circle cx="${f1(x + Math.cos(k * 1.2566 - 1.57) * r * 0.55)}" cy="${f1(y + Math.sin(k * 1.2566 - 1.57) * r * 0.55)}" r="${f1(r * 0.48)}" fill="${c}"/>`).join('') + `<circle cx="${x}" cy="${y}" r="${f1(r * 0.3)}" fill="#ffd23f"/>`;
      return `${L('M108 246 L64 128', '#c9a064', 3.4)}${L('M106 240 L102 230', '#7a4a26', 5)}
        <path d="${scal} Z" fill="#d9442e" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"/>${L(ribs, '#b8331f', 1, 'opacity=".55"')}
        <ellipse cx="${cx}" cy="${cy}" rx="11" ry="9.5" fill="none" stroke="#2fa36b" stroke-width="2.4"/><ellipse cx="${cx}" cy="${cy}" rx="15" ry="13" fill="none" stroke="#f2c230" stroke-width="2"/>
        ${L('M24 112 Q40 100 58 104 M76 150 Q90 140 98 128', '#4a2a18', 1.8)}${blossom(30, 108, 9, '#fff4f2')}${blossom(46, 101, 7, '#ffb3c1')}${blossom(86, 142, 8, '#fff4f2')}${blossom(96, 128, 6, '#ffb3c1')}${blossom(36, 140, 7, '#fff4f2')}
        <circle cx="${cx}" cy="${cy}" r="3.2" fill="#7a4a26" stroke="${OL}" stroke-width="1.2"/>`;
    },
    front: () => `${L('M146 164 Q128 200 88 238', '#8a5a2b', 3.6)}${L('M146 164 Q128 200 88 238', '#b07a44', 1.4, 'stroke-dasharray="2 3"')}`,
  };

  /* ---------- Day 5 — ผ้าขาวม้าพาดบ่า (บ่าซ้ายของตัวละคร → สะโพกขวา ผูกปม) ---------- */
  A.OUTER.lk26_pakama = () => `<defs><pattern id="lkpk" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
      <rect width="12" height="12" fill="#6e2a3a"/><rect width="6" height="6" fill="#c9343c"/><rect x="6" y="6" width="5" height="5" fill="#2f6b4f"/>
      <rect x="11" width="1.2" height="12" fill="#f1ead6"/><rect y="11" width="12" height="1.2" fill="#f1ead6"/></pattern></defs>
    ${P('M140 160 L156 166 L100 240 L84 232 Z', 'url(#lkpk)')}${L('M141 162 L86 234', '#c9343c', 1.4)}
    ${P('M84 226 Q78 232 84 240 Q92 244 96 236 Q98 228 90 226 Z', 'url(#lkpk)')}
    ${P('M84 238 L78 262 L88 263 L92 240 Z', 'url(#lkpk)')}${P('M90 239 L96 258 L104 255 L96 236 Z', 'url(#lkpk)')}
    ${L('M79 263 L78 268 M82 263 L81 268 M85 263 L85 268 M97 258 L98 263 M100 257 L101 262 M103 256 L104 261', '#c9343c', 1.4)}`;

  /* ---------- Day 6 — พวงมาลัยข้อมือดอกมะลิ (ข้อมือเดียวกับ acc_bead_bracelet · ดอกตูมร้อยรอบ · กุหลาบแดง · อุบะ + ริบบิ้นห้อย) ---------- */
  A.ACCESSORIES.lk26_jasmine = () => {
    const cx = 70; const cy = 231;
    const ring = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2; const x = cx + Math.cos(a) * 12.5; const y = cy + Math.sin(a) * 4.6;
      return { y, s: bud(x, y, (a * 180) / Math.PI + 90, 0.95) };
    });
    const back = ring.filter((r) => r.y < cy).map((r) => r.s).join('');
    const front = ring.filter((r) => r.y >= cy).map((r) => r.s).join('');
    return `<g transform="rotate(14 ${cx} ${cy})">${back}<ellipse cx="${cx}" cy="${cy}" rx="12.5" ry="4.6" fill="none" stroke="#f2e6c8" stroke-width="1.4"/>${front}</g>
      ${L('M58 238 L56 256', '#f2e6c8', 0.8)}${L('M62 239 L62 258', '#f2e6c8', 0.8)}${[0, 1, 2].map((k) => bud(56.5 - k * 0.3, 243 + k * 5, 4, 0.75) + bud(62, 244 + k * 5, -4, 0.75)).join('')}
      ${C(56, 259, 2.2, '#d1203f', 1)}${C(62, 260, 2.2, '#fffdf6', 1)}<path d="M58.6 238 L58 262 L59.6 259.5 L61.2 262 L61.2 238 Z" fill="#ff6fa8" stroke="${OL}" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M60 231.5 Q65 231.5 65 236 Q64.5 240 60 240 Q55.5 240 55 236 Q55 231.5 60 231.5 Z" fill="#d1203f" stroke="${OL}" stroke-width="1.1"/>${L('M57.5 234.5 Q60 233 62.5 234.5 M57 237 Q60 235.5 63 237', '#8f1229', 0.9)}
      <ellipse cx="53" cy="238" rx="3.2" ry="1.6" fill="#3f8a3a" transform="rotate(-35 53 238)"/>`;
  };

  /* ---------- Day 7 — ชุดคืนเพ็ญเดือนสิบสอง ---------- */
  A.TOPS.lk26_silk = () => `<defs><pattern id="lksilk" width="12" height="14" patternUnits="userSpaceOnUse"><path d="M6 2 L10 7 L6 12 L2 7 Z" fill="#c89a3c" opacity=".55"/><path d="M6 5.5 L7.5 7 L6 8.5 L4.5 7 Z" fill="#a87822" opacity=".6"/></pattern></defs>
    ${LONG_SLEEVES('#e2bf78')}${CUFFS('#a87822')}${P(TORSO, '#e2bf78')}<path d="${TORSO}" fill="url(#lksilk)"/>
    ${L('M82 232 Q120 242 158 232', '#a87822', 3)}${Array.from({ length: 11 }, (_, i) => { const x = 86 + i * 6.8; return `<path d="M${f1(x - 3)} 243 L${f1(x)} 236 L${f1(x + 3)} 243 Z" fill="#c89a3c"/>`; }).join('')}
    ${L('M104 160 Q120 168 136 160', '#a87822', 2.6)}${L('M120 166 L120 206', '#a87822', 1.4)}${[172, 182, 192, 202].map((y) => `<circle cx="120" cy="${y}" r="2.4" fill="#d6a032" stroke="${OL}" stroke-width="1"/>`).join('')}
    <path d="M90 176 Q96 172 100 182" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>`;
  A.BOTTOMS.lk26_chongkraben = () => `${P('M84 232 L156 232 L158 250 L162 280 Q146 286 126 282 L120 262 L114 282 Q94 286 78 280 L82 250 Z', '#4a2c7c')}
    ${P('M78 276 Q94 282 114 278 L114 286 Q94 290 77 284 Z', '#d2a646')}${P('M126 278 Q146 282 162 276 L163 284 Q146 290 126 286 Z', '#d2a646')}
    ${L('M80 280 Q95 285 113 282 M127 282 Q145 285 161 280', '#b0263d', 1.2)}${L('M116 234 Q118 250 120 262 M124 234 Q122 250 120 262 M120 236 L120 262', '#3a2063', 1.6)}
    ${L('M90 246 Q100 262 112 270 M150 246 Q140 262 128 270', '#3a2063', 1.4, 'opacity=".7"')}<rect x="84" y="229" width="72" height="7" rx="3" fill="#d2a646" stroke="${OL}" stroke-width="2"/>`;
  A.EFFECTS.lk26_krathong = {
    back: () => `${krathong(66, 266, 0.62, 'lkkb1')}${krathong(178, 262, 0.55, 'lkkb2')}`,
    front: () => `${krathong(40, 298, 0.85, 'lkkf1')}${krathong(204, 292, 0.75, 'lkkf2')}`,
  };

  /* ---------- เควสต์ — เข็มกลัดดอกบัว · พื้นหลังสายน้ำคืนเพ็ญ ---------- */
  A.ACCESSORIES.lk26_lotus = () => `<ellipse cx="140" cy="194" rx="11" ry="6" fill="#d9ab3e" stroke="${OL}" stroke-width="1.6"/>
    ${P('M140 196 Q128 194 128 184 Q136 186 140 196 Z', '#ff9fbf')}${P('M140 196 Q152 194 152 184 Q144 186 140 196 Z', '#ff9fbf')}
    ${P('M140 196 Q132 190 134 178 Q140 184 140 196 Z', '#ffc2d4')}${P('M140 196 Q148 190 146 178 Q140 184 140 196 Z', '#ffc2d4')}
    ${P('M140 196 Q136 186 140 174 Q144 186 140 196 Z', '#ffd6e2')}<ellipse cx="140" cy="186" rx="3" ry="1.6" fill="#e8c43a"/>
    ${L('M131 183 L133 187 M149 183 L147 187', '#e8507d', 1.2)}`;
  A.BACKGROUNDS.bg_lk26_river = () => `<defs>
      <linearGradient id="lkrsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1438"/><stop offset=".55" stop-color="#1d2a66"/><stop offset="1" stop-color="#2f3f86"/></linearGradient>
      <linearGradient id="lkrwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2a5e"/><stop offset="1" stop-color="#0c1430"/></linearGradient>
      <radialGradient id="lkrmoon" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#fff6d6"/><stop offset="1" stop-color="#fff6d6" stop-opacity="0"/></radialGradient>
      <radialGradient id="lkrglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <rect width="240" height="320" fill="url(#lkrsky)"/>
    ${[[24, 30, 1.6], [70, 18, 1.2], [104, 48, 1.4], [150, 22, 1.1], [214, 120, 1.3], [18, 96, 1.2], [128, 92, 1], [200, 160, 1], [56, 140, 1.1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".85"/>`).join('')}
    <circle cx="176" cy="66" r="52" fill="url(#lkrmoon)" opacity=".5"/><circle cx="176" cy="66" r="30" fill="#fff6d6"/><circle cx="166" cy="58" r="5" fill="#f1e2b0" opacity=".8"/><circle cx="186" cy="76" r="3.6" fill="#f1e2b0" opacity=".8"/><circle cx="182" cy="56" r="2.4" fill="#f1e2b0" opacity=".7"/>
    <path d="M0 190 Q20 172 40 182 Q58 160 80 178 Q96 168 112 184 L112 196 L0 196 Z" fill="#101a3e"/><path d="M150 188 Q170 168 190 180 Q208 164 240 176 L240 196 L150 196 Z" fill="#101a3e"/>
    <rect y="194" width="240" height="126" fill="url(#lkrwater)"/>
    ${[[176, 206, 26], [176, 220, 20], [176, 236, 16], [176, 254, 12], [176, 272, 8]].map(([x, y, w]) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="3" rx="1.5" fill="#fff6d6" opacity=".55"/>`).join('')}
    ${[[30, 214, 40], [90, 232, 56], [150, 290, 48], [40, 300, 30], [210, 248, 36]].map(([x, y, w]) => `<path d="M${x - w / 2} ${y} Q${x} ${y - 3} ${x + w / 2} ${y}" fill="none" stroke="#5f78c4" stroke-width="1.4" opacity=".6"/>`).join('')}
    ${[[52, 250, 0.7, 'a'], [122, 272, 0.85, 'b'], [204, 300, 0.6, 'c']].map(([x, y, s, k]) => `<circle cx="${x - 3 * s}" cy="${y - 20 * s}" r="${18 * s}" fill="url(#lkrglow)"/><ellipse cx="${x - 3 * s}" cy="${y + 10 * s}" rx="${5 * s}" ry="${12 * s}" fill="#ffd27a" opacity=".25"/>${krathong(x, y, s, `lkrk${k}`)}`).join('')}`;
  return A;
};
