/*
  EnglishQuest Avatar — งานศิลป์ 2D: Christmas 2026 (ชุดคริสต์มาส · event christmas-2026)
  สเปกเดียวกับ art.js (canvas 240×320 · เส้นขอบ #2b2440) — ใช้คู่กับโมเดล 3D จริงชิ้นเดียวกัน (scripts/avatar3d/blender/items_christmas.py)
  ออกแบบเองทั้งหมด (ไม่อ้างอิงตัวละคร/แบรนด์ใด)
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
const FUR = '#fbf7ee';
/** เกล็ดหิมะ 6 แฉก (เส้น) */
const flake = (x, y, r, c = '#ffffff', w = 1.6) => Array.from({ length: 3 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  return L(`M${f1(x - Math.cos(a) * r)} ${f1(y - Math.sin(a) * r)} L${f1(x + Math.cos(a) * r)} ${f1(y + Math.sin(a) * r)}`, c, w);
}).join('');
/** ขอบขนนุ่ม (เส้นหนาสีขาวมีขอบ) */
const fur = (d, w = 9) => L(d, OL, w + 4) + L(d, FUR, w);
/** โค้ตยาว (ตัว + ชาย) — สีหลัก c */
const longCoat = (c, hem = 282) => both(P(`M80 166 Q98 156 112 158 L110 ${hem} L78 ${hem - 4} Q72 204 80 166 Z`, c));

module.exports = function extend(A) {
  /* ---------- 1) Santa Coat ---------- */
  A.OUTER.xm26_santa = () => `${LONG_SLEEVES('#c63d3d')}${longCoat('#c63d3d', 278)}
    ${fur('M110 162 L110 274')}${fur('M130 162 L130 274')}${fur('M80 274 Q120 284 160 274', 8)}
    ${limb(72, 232, 70, 236, 30, FUR)}${limb(168, 232, 170, 236, 30, FUR)}
    ${P('M84 222 L156 222 L156 234 L84 234 Z', '#2a1a14')}${P('M110 219 L130 219 L130 237 L110 237 Z', '#e6c26a')}<rect x="115" y="224" width="10" height="8" fill="#2a1a14"/>
    ${P('M96 158 Q120 168 144 158 Q140 172 120 174 Q100 172 96 158 Z', FUR)}`;

  /* ---------- 2) Winter Scholar ---------- */
  A.TOPS.xm26_scholar = () => `${LONG_SLEEVES('#ece2cc')}${CUFFS('#1f6a4c')}${P(TORSO, '#ece2cc')}
    ${P('M104 162 L120 198 L136 162 Z', '#fbfaf6')}${P('M104 162 L114 172 L106 178 Z', '#fbfaf6')}${P('M136 162 L126 172 L134 178 Z', '#fbfaf6')}
    ${L('M102 164 L120 202 L138 164', '#1f6a4c', 4)}
    ${[100, 140].map((x) => L(`M${x} 186 Q${x + 5} 196 ${x} 206 Q${x - 5} 216 ${x} 226 Q${x + 5} 234 ${x} 240`, '#d8cbb0', 3)).join('')}
    ${P('M82 238 Q120 250 158 238 L158 246 Q120 256 82 246 Z', '#1f6a4c')}${L('M84 241 Q120 252 156 241', '#c63d3d', 1.6)}
    ${P('M138 176 L152 176 L152 188 L145 194 L138 188 Z', '#10213a')}${flake(145, 184, 4.5, '#e6c26a', 1.4)}`;

  /* ---------- 3) Elf Helper Tunic ---------- */
  A.TOPS.xm26_elf = () => `${LONG_SLEEVES('#2f8a5b')}${CUFFS('#c63d3d')}
    ${P('M80 166 Q120 152 160 166 Q166 210 162 256 L150 248 L140 258 L130 248 L120 258 L110 248 L100 258 L90 248 L78 256 Q74 210 80 166 Z', '#2f8a5b')}
    ${[92, 104, 116, 128, 140].map((x, i) => `${P(`M${x} 160 L${x + 12} 160 L${x + 6} ${172 + (i % 2) * 2} Z`, '#c63d3d')}`).join('')}
    ${[110, 122, 134].map((x) => C(x - 4, 176, 3, '#e6c26a', 1.2)).join('')}
    ${P('M82 222 L158 222 L158 232 L82 232 Z', '#3a2418')}${P('M112 219 L128 219 L128 235 L112 235 Z', '#e6c26a')}`;

  /* ---------- 4) Snow Prince Coat ---------- */
  A.OUTER.xm26_prince = () => `${LONG_SLEEVES('#9ccbe8')}${CUFFS('#2c4f7c')}${longCoat('#9ccbe8', 280)}
    ${L('M110 160 L110 276 M130 160 L130 276', '#2c4f7c', 3)}
    ${[184, 202, 220, 238].map((y) => `${L(`M96 ${y} Q110 ${y - 4} 118 ${y}`, '#e6c26a', 2.4)}${L(`M122 ${y} Q130 ${y - 4} 144 ${y}`, '#e6c26a', 2.4)}${C(120, y, 2.6, '#e6c26a', 1)}`).join('')}
    ${limb(70, 228, 70, 230, 28, '#e6c26a')}${limb(170, 228, 170, 230, 28, '#e6c26a')}${limb(71, 232, 70, 236, 27, '#2c4f7c')}${limb(169, 232, 170, 236, 27, '#2c4f7c')}
    ${P('M96 158 Q120 168 144 158 Q140 172 120 174 Q100 172 96 158 Z', FUR)}${flake(100, 196, 5, '#e8f6ff', 1.8)}`;

  /* ---------- 5) Snow Princess Coat (ทรง A) ---------- */
  A.OUTER.xm26_princess = () => `${LONG_SLEEVES('#d3e9f7')}${limb(72, 232, 70, 236, 30, FUR)}${limb(168, 232, 170, 236, 30, FUR)}
    ${P('M80 166 Q120 152 160 166 Q164 196 158 222 Q176 252 180 280 Q120 292 60 280 Q64 252 82 222 Q76 196 80 166 Z', '#d3e9f7')}
    ${fur('M62 279 Q120 292 178 279', 8)}${P('M82 220 Q120 230 158 220 L158 228 Q120 238 82 228 Z', '#4f8fc8')}
    ${P('M90 156 Q120 176 150 156 Q156 170 140 180 Q120 186 100 180 Q84 170 90 156 Z', FUR)}
    ${P('M120 182 L108 176 L108 190 Z', '#4f8fc8')}${P('M120 182 L132 176 L132 190 Z', '#4f8fc8')}${C(120, 183, 3, '#4f8fc8', 1.4)}
    ${[[84, 262], [104, 268], [120, 270], [136, 268], [156, 262]].map(([x, y]) => flake(x, y, 4.5, '#ffffff', 1.6)).join('')}
    ${[198, 210].map((y) => C(120, y, 2.4, '#fffaf0', 1)).join('')}`;

  /* ---------- 6) Cozy Traveler Duffle (มีฮู้ด) ---------- */
  A.OUTER.xm26_traveler = () => `${LONG_SLEEVES('#b0763f')}${CUFFS('#91612f')}${longCoat('#b0763f', 270)}
    ${P('M82 160 Q120 138 158 160 Q152 176 140 172 Q120 164 100 172 Q88 176 82 160 Z', '#a8333a')}${L('M90 160 Q120 146 150 160', '#7d1f26', 1.6)}${L('M94 166 L146 166', '#e6c26a', 1, 'opacity=".7"')}
    ${[192, 212, 232].map((y) => `${L(`M100 ${y} L140 ${y}`, '#efe4cc', 2)}${P(`M127 ${y - 7} L133 ${y - 7} L133 ${y + 7} L127 ${y + 7} Z`, '#5a3a22')}`).join('')}
    ${P('M86 240 L106 240 L106 260 L86 260 Z', '#9d6835')}${P('M134 240 L154 240 L154 260 L134 260 Z', '#9d6835')}`;

  /* ---------- 7) Reindeer Hoodie ---------- */
  A.TOPS.xm26_reindeer = () => `${LONG_SLEEVES('#7a4f33')}${CUFFS('#5e3a24')}${P(TORSO, '#7a4f33')}
    ${P('M92 160 Q120 146 148 160 Q142 170 120 168 Q98 170 92 160 Z', '#5e3a24')}${L('M112 166 L110 184 M128 166 L130 184', '#f3e6cf', 2)}
    ${P('M82 186 Q120 196 158 186 L158 196 Q120 206 82 196 Z', '#f3e6cf')}${[90, 102, 114, 126, 138, 150].map((x) => C(x, 192, 1.8, '#d8343c', 0.8)).join('')}
    <ellipse cx="120" cy="216" rx="12" ry="14" fill="#f3e6cf" stroke="${OL}" stroke-width="1.8"/>${C(120, 224, 4, '#d8343c', 1.2)}
    <circle cx="115" cy="212" r="1.6" fill="${OL}"/><circle cx="125" cy="212" r="1.6" fill="${OL}"/>
    ${L('M112 204 Q106 196 104 188 M108 198 L102 196 M128 204 Q134 196 136 188 M132 198 L138 196', '#f3e6cf', 2.4)}
    ${P('M98 232 L142 232 L146 248 L94 248 Z', '#6d4630')}`;

  /* ---------- 8) Noel Guardian (Legendary) ---------- */
  A.OUTER.xm26_noel = () => `<path d="M76 168 Q60 230 70 286 L170 286 Q180 230 164 168 Z" fill="#1f6a4c" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"/>
    ${LONG_SLEEVES('#f6f3ea')}${CUFFS('#e6c26a')}${longCoat('#f6f3ea', 276)}
    ${L('M110 160 L110 272 M130 160 L130 272', '#e6c26a', 3.4)}${L('M80 272 Q120 282 160 272', '#e6c26a', 3)}
    ${P('M98 154 Q120 146 142 154 L140 166 Q120 160 100 166 Z', '#e6c26a')}
    ${L('M150 170 Q120 200 86 238', '#1f6a4c', 8)}${L('M150 170 Q120 200 86 238', '#2f8a5b', 4)}
    ${C(100, 192, 9, '#e6c26a', 1.6)}<path d="M100 184 L102 190 L108 192 L102 194 L100 200 L98 194 L92 192 L98 190 Z" fill="#fff4c8" stroke="${OL}" stroke-width="1"/>`;

  /* ---------- 9) Tartan Wool Trousers ---------- */
  A.BOTTOMS.xm26_tartan = () => {
    const leg = (x) => `<path d="M${x - 15} 232 L${x + 15} 232 L${x + 14} 296 L${x - 14} 296 Z" fill="#a8333a" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    const plaid = [240, 256, 272, 288].map((y) => `<rect x="84" y="${y}" width="72" height="6" fill="#1f5a40" opacity=".85"/><rect x="84" y="${y + 9}" width="72" height="1.4" fill="#e6c26a"/>`).join('')
      + [92, 108, 132, 148].map((x) => `<rect x="${x}" y="232" width="5" height="64" fill="#1f5a40" opacity=".55"/>`).join('');
    return `<defs><clipPath id="xmtl"><path d="M86 232 L154 232 L155 296 L85 296 Z"/></clipPath></defs>${leg(102)}${leg(138)}<g clip-path="url(#xmtl)" opacity=".9">${plaid}</g>
      ${leg(102).replace('fill="#a8333a"', 'fill="none"')}${leg(138).replace('fill="#a8333a"', 'fill="none"')}${P('M84 226 L156 226 L156 236 L84 236 Z', '#3a2418')}`;
  };

  /* ---------- ของประกอบ ---------- */
  A.HATS.xm26_santa = () => `${P('M66 82 C64 40 96 24 124 26 C150 28 166 36 178 60 Q188 84 192 104 L176 100 Q170 80 160 64 Q170 80 174 84 Z', '#c63d3d')}
    ${L('M124 28 Q160 34 182 76', '#a12f32', 2)}${C(190, 108, 11, FUR, 2.2)}${fur('M62 84 Q120 70 178 84', 14)}`;
  A.HATS.xm26_antlers = () => `${L('M70 92 Q72 34 120 30 Q168 34 170 92', '#8e2430', 6)}
    ${both(`${L('M92 38 Q84 22 88 4 M88 22 Q78 16 74 6 M88 12 Q96 6 100 -2', '#8a5a35', 5)}<ellipse cx="72" cy="50" rx="12" ry="6" fill="#a8754d" stroke="${OL}" stroke-width="1.8" transform="rotate(-30 72 50)"/><ellipse cx="72" cy="50" rx="7" ry="3" fill="#f2c9b5" transform="rotate(-30 72 50)"/>`)}
    ${C(136, 34, 4.5, '#e6c26a', 1.4)}`;
  A.HATS.xm26_snowclip = () => `${flake(160, 52, 11, '#9fd4f5', 3.2)}${flake(160, 52, 11, '#ffffff', 1.2)}${C(160, 52, 3.2, '#dfe6ef', 1.2)}`;
  A.ACCESSORIES.xm26_scarf = () => `${P('M92 156 Q120 170 148 156 L150 168 Q120 182 90 168 Z', '#1f6a4c')}
    ${P('M126 168 L142 168 L144 222 L128 224 Z', '#1f6a4c')}${L('M128 206 L143 205 M128 211 L143 210', '#c63d3d', 2)}
    <path d="M135 182 L130 194 L140 194 Z M135 188 L131 198 L139 198 Z" fill="#f3ead6"/>${[129, 133, 137, 141].map((x) => L(`M${x} 224 L${x} 230`, '#f3ead6', 2)).join('')}`;
  A.ACCESSORIES.xm26_gloves = () => both(`${C(70, 242, 11, '#c63d3d', 2.2)}<ellipse cx="62" cy="236" rx="4.5" ry="6" fill="#c63d3d" stroke="${OL}" stroke-width="1.8"/>${fur('M60 228 L80 228', 7)}<path d="M70 238 L66 246 L74 246 Z" fill="#1f6a4c"/>`);
  A.SHOES.xm26_boots = () => footPair(`${P('M88 270 L114 270 L116 300 Q118 308 108 308 L88 308 Q82 306 84 296 Z', '#4a2a1f')}<rect x="84" y="304" width="34" height="5" rx="2.5" fill="#24140e"/>
    ${fur('M86 270 L116 270', 8)}${L('M87 286 L115 286', '#2a1810', 3)}<rect x="104" y="283" width="7" height="6" fill="#e6c26a" stroke="${OL}" stroke-width="1"/>`);
  A.BACKS.xm26_candycane = {
    back: () => {
      const segs = Array.from({ length: 9 }, (_, i) => { const t0 = i / 9; const t1 = (i + 1) / 9; const x0 = 70 + 100 * t0; const y0 = 268 - 140 * t0; const x1 = 70 + 100 * t1; const y1 = 268 - 140 * t1;
        return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${i % 2 ? '#fffdf7' : '#c63d3d'}" stroke-width="9"/>`; }).join('');
      return `<line x1="70" y1="268" x2="170" y2="128" stroke="${OL}" stroke-width="14" stroke-linecap="round"/>${segs}
        ${L('M170 128 Q182 106 198 116 Q208 124 200 136', OL, 14)}${L('M170 128 Q182 106 198 116 Q208 124 200 136', '#c63d3d', 9)}`;
    },
    front: () => L('M86 166 Q120 200 156 238', '#6b3f22', 4),
  };
};
