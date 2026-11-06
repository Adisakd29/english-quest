/*
  EnglishQuest Avatar — งานศิลป์ 2D: Halloween Costume Festival 2026 + ทรงผม 3 แบบที่วาดใหม่ (มวยคู่ · เปียข้าง · ผมชี้)
  สเปกเดียวกับ art.js (canvas 240×320 · เส้นขอบ #2b2440) — ใช้คู่กับโมเดล 3D จริงของชิ้นเดียวกัน
*/
const OL = '#2b2440';
const SW = 2.5;
const limb = (x1, y1, x2, y2, w, color) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${OL}" stroke-width="${w + SW * 2}" stroke-linecap="round"/>`
  + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`;
const L = (d, color = OL, w = 2.5, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const mirror = (s) => `<g transform="translate(240,0) scale(-1,1)">${s}</g>`;
const both = (s) => s + mirror(s);
const C = (x, y, r, fill, sw = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${sw}"/>`;
const star = (x, y, r, fill, n = 5, inner = 0.45, stroke = OL) => {
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / n; const rr = i % 2 ? r * inner : r; pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>`;
};
const shine = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="4" stroke-linecap="round"/>`;
const TORSO_LONG = (y) => `M80 166 Q120 152 160 166 Q168 ${200 + (y - 242) / 2} 162 ${y} Q120 ${y + 10} 78 ${y} Q72 ${200 + (y - 242) / 2} 80 166 Z`;
const LONG_SLEEVES = (c) => limb(87, 174, 71, 234, 27, c) + limb(153, 174, 169, 234, 27, c);
const CUFFS = (c) => limb(72, 230, 70, 236, 27, c) + limb(168, 230, 170, 236, 27, c);
const pantsLegs = (c, to = 294, w = 28) => limb(107, 248, 106, to, w, c) + limb(133, 248, 134, to, w, c);
const footPair = (shape) => shape + `<g transform="translate(36,0)">${shape}</g>`;
const straps = (c) => limb(97, 164, 94, 226, 9, c) + limb(143, 164, 146, 226, 9, c);
// เส้นช่อผม (ไหลตามทิศผม) — ให้ภาพ 2D ไม่เป็นก้อนเรขาคณิต
const strands = (paths, color) => paths.map((d) => L(d, color, 1.6, 'stroke-opacity=".55"')).join('');
const pumpkinFace = (cx, cy, s, fill = '#3b1d0e') => `${P(`M${cx - 10 * s} ${cy - 2 * s} L${cx - 4 * s} ${cy - 2 * s} L${cx - 7 * s} ${cy - 9 * s} Z`, fill)}${P(`M${cx + 4 * s} ${cy - 2 * s} L${cx + 10 * s} ${cy - 2 * s} L${cx + 7 * s} ${cy - 9 * s} Z`, fill)}
  ${P(`M${cx - 12 * s} ${cy + 3 * s} Q${cx} ${cy + 13 * s} ${cx + 12 * s} ${cy + 3 * s} L${cx + 8 * s} ${cy + 5 * s} L${cx + 5 * s} ${cy + 3 * s} L${cx + 2 * s} ${cy + 6 * s} L${cx - 2 * s} ${cy + 3 * s} L${cx - 5 * s} ${cy + 6 * s} L${cx - 8 * s} ${cy + 3 * s} Z`, fill)}`;

module.exports = function extend(A) {
  /* ---------- ทรงผมที่วาดใหม่: ช่อผมไหลเข้าหามวย/เปีย · ผมชี้เป็นช่อโค้งเรียว ---------- */
  Object.assign(A.HAIR, {
    twin_buns: {
      color: '#1f1b24',
      front: (c) => `${P('M66 46 C60 26 78 12 92 18 C104 10 110 28 104 40 C100 52 76 58 66 46 Z', c)}${L('M74 30 Q84 22 96 26 M72 40 Q86 30 100 36', '#4a4458', 1.8)}
        ${P('M174 46 C180 26 162 12 148 18 C136 10 130 28 136 40 C140 52 164 58 174 46 Z', c)}${L('M166 30 Q156 22 144 26 M168 40 Q154 30 140 36', '#4a4458', 1.8)}
        ${L('M70 50 Q84 56 98 48', '#ffcf3f', 3.2)}${L('M170 50 Q156 56 142 48', '#ffcf3f', 3.2)}
        ${P('M63 108 C56 54 88 34 120 34 C152 34 184 54 177 108 C172 88 164 76 152 70 C134 84 104 86 84 78 C74 86 67 96 63 108 Z', c)}
        ${strands(['M78 92 Q86 64 92 48', 'M98 76 Q100 56 98 44', 'M162 92 Q154 64 148 48', 'M142 76 Q140 56 142 44', 'M120 72 Q118 54 106 44', 'M120 72 Q122 54 134 44'], '#4a4458')}${shine('M98 46 Q116 38 136 44')}`,
    },
    side_braid: {
      color: '#b36b2c',
      front: (c) => {
        const seg = [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const y = 116 + i * 14; const x = 66 - i * 0.6; const s = 1 - i * 0.05;
          return `${P(`M${x - 11 * s} ${y} Q${x - 2 * s} ${y - 6} ${x + 2 * s} ${y + 8} Q${x - 6 * s} ${y + 12} ${x - 11 * s} ${y} Z`, c)}${P(`M${x + 11 * s} ${y + 6} Q${x + 2 * s} ${y + 2} ${x - 2 * s} ${y + 14} Q${x + 6 * s} ${y + 18} ${x + 11 * s} ${y + 6} Z`, c)}`;
        }).join('');
        return `${P('M63 110 C55 54 90 30 120 30 C152 30 186 54 177 110 C172 90 164 78 150 72 C126 84 100 90 78 96 C72 100 66 104 63 110 Z', c)}
        ${P('M150 72 Q118 86 76 100 Q100 70 150 72 Z', c)}${strands(['M150 46 Q120 60 84 94', 'M130 40 Q104 56 78 90', 'M166 70 Q150 78 120 84'], '#7a4416')}
        ${seg}${P('M57 216 L67 216 L65 222 L59 222 Z', '#3fa36b')}${P('M58 222 Q62 238 66 222 Z', c)}${shine('M98 44 Q116 36 136 42')}`;
      },
    },
    spiky: {
      color: '#3f8bff',
      front: (c) => `${P('M62 108 Q54 84 64 70 Q60 52 78 46 Q76 26 98 28 Q104 10 124 18 Q140 6 150 24 Q170 20 170 42 Q186 50 178 70 Q188 86 178 108 C170 90 160 80 150 76 C132 84 106 84 90 78 C78 84 68 94 62 108 Z', c)}
        ${P('M84 82 Q90 62 104 58 Q100 72 104 84 Z', c)}${P('M116 80 Q122 58 138 56 Q130 70 134 82 Z', c)}${P('M150 80 Q160 62 172 62 Q162 74 164 88 Z', c)}
        ${strands(['M78 50 Q92 60 96 76', 'M100 30 Q110 46 112 70', 'M126 20 Q132 40 130 66', 'M150 26 Q150 46 146 70', 'M168 44 Q160 58 160 76'], '#2a5fb8')}${shine('M104 36 Q118 28 132 32')}`,
    },
  });

  /* ---------- Halloween Costume Festival 2026 ---------- */
  A.HATS.hw26_pumpkin = () => `${P('M62 90 C58 44 88 26 120 26 C152 26 182 44 178 90 Q120 100 62 90 Z', '#f2892a')}
    ${L('M90 32 Q82 60 86 92', '#d9701c', 2.5)}${L('M120 26 L120 96', '#d9701c', 2.5)}${L('M150 32 Q158 60 154 92', '#d9701c', 2.5)}${L('M76 44 Q68 66 70 90', '#d9701c', 2)}${L('M164 44 Q172 66 170 90', '#d9701c', 2)}
    ${pumpkinFace(120, 64, 1.25)}${P('M60 86 Q120 98 180 86 L182 98 Q120 110 58 98 Z', '#d9701c')}${[72, 88, 104, 120, 136, 152, 168].map((x) => L(`M${x} 90 L${x} 104`, '#b85a12', 1.6)).join('')}
    ${P('M114 28 Q110 12 122 4 L127 8 Q119 14 123 27 Z', '#5e7d2f')}${P('M126 16 Q144 6 150 20 Q138 24 128 20 Z', '#6f9a3a')}${L('M110 22 Q100 18 104 10 Q110 8 108 14', '#5e7d2f', 2)}`;
  A.HATS.hw26_witch = () => `${P('M74 84 Q92 50 104 24 Q112 4 142 -2 Q132 10 134 26 Q146 54 166 84 Z', '#3b2466')}${P('M74 84 Q120 92 166 84 L164 72 Q120 80 76 72 Z', '#ff8a3d')}
    <rect x="113" y="73" width="14" height="12" rx="2" fill="none" stroke="#e3b64a" stroke-width="3"/>${P('M38 92 Q60 76 92 80 Q120 84 148 80 Q180 76 202 92 Q176 104 120 100 Q64 104 38 92 Z', '#3b2466')}
    ${P('M118 40 L132 38 L134 52 L120 54 Z', '#6f4fb0')}${L('M116 44 L120 44 M116 49 L120 49', '#ffcf7a', 1.4)}${L('M142 -2 Q150 6 148 14', '#e3b64a', 1.4)}${star(148, 18, 6, '#ffd54a')}`;
  A.GLASSES.hw26_bat = () => `${both(P('M84 104 L90 94 L96 100 L102 92 L108 100 L114 96 L114 108 Q108 118 99 118 Q88 116 84 104 Z', '#b388ff', 'fill-opacity=".85"'))}
    ${L('M114 102 L126 102', '#2b1b4f', 3)}${L('M84 102 L70 99', '#2b1b4f', 2.5)}${L('M156 102 L170 99', '#2b1b4f', 2.5)}`;
  A.TOPS.hw26_ghost_hoodie = () => `${LONG_SLEEVES('#f6f3ff')}${CUFFS('#c9b8ff')}
    ${P('M80 166 Q120 152 160 166 Q168 202 164 244 Q156 254 148 246 Q140 256 132 246 Q124 256 116 246 Q108 256 100 246 Q92 256 84 246 Q74 252 76 244 Q72 202 80 166 Z', '#f6f3ff')}
    ${P('M96 160 Q120 150 144 160 Q140 172 120 174 Q100 172 96 160 Z', '#e9e3ff')}${L('M110 170 L108 196', '#9c86e8', 2.2)}${L('M130 170 L132 196', '#9c86e8', 2.2)}
    <ellipse cx="110" cy="204" rx="4" ry="6" fill="${OL}"/><ellipse cx="130" cy="204" rx="4" ry="6" fill="${OL}"/><ellipse cx="120" cy="216" rx="3.5" ry="4.5" fill="${OL}"/>
    <ellipse cx="101" cy="214" rx="5" ry="3" fill="#ffb3c7"/><ellipse cx="139" cy="214" rx="5" ry="3" fill="#ffb3c7"/>`;
  A.SHOES.hw26_boots = () => footPair(`${P('M92 268 L118 268 L119 306 L85 306 Q84 296 92 292 Z', '#4b2b7a')}${P('M88 262 Q105 256 122 262 L121 274 Q105 268 89 274 Z', '#f2892a')}
    ${L('M96 262 L95 274 M104 260 L104 272 M113 260 L114 272', '#d9701c', 1.6)}${L('M86 306 L119 306', '#ff7a1a', 4)}${L('M100 282 L112 280 M100 290 L112 288', '#ff9f43', 2)}`);
  A.BACKS.hw26_batwings = {
    back: () => `${both(P('M112 176 Q90 150 46 136 Q52 150 44 160 Q58 164 54 178 Q68 176 70 192 Q84 184 96 196 Q102 186 112 190 Z', '#3a2156'))}
      ${both(L('M112 178 L50 140 M90 162 L56 176 M100 172 L74 190', '#1d1030', 1.8))}${C(120, 184, 7, '#3a2156', 2)}${P('M116 182 Q120 178 124 182 Q120 190 116 182 Z', '#ff8a3d')}`,
    front: () => '',
  };
  A.BACKS.hw26_pumpkin_pack = {
    back: () => `${P('M150 186 C150 168 176 160 196 166 C214 172 218 194 212 212 C206 232 182 238 166 230 C150 222 148 204 150 186 Z', '#f08a24')}
      ${L('M170 166 Q164 196 170 232', '#c96a10', 2)}${L('M196 166 Q204 198 196 232', '#c96a10', 2)}${pumpkinFace(184, 196, 0.9, '#2b1608')}
      ${P('M180 166 Q176 152 186 146 L190 150 Q184 156 186 166 Z', '#5e7d2f')}`,
    front: () => straps('#4b2b7a'),
  };
  A.OUTER.hw26_midnight = () => `${LONG_SLEEVES('#1c2350')}${CUFFS('#6b3fb8')}
    ${both(P('M80 166 Q98 156 110 158 L108 282 L78 278 Q72 204 80 166 Z', '#1c2350'))}${both(P('M96 158 L112 160 L104 188 L92 170 Z', '#6b3fb8'))}
    ${P('M78 160 Q120 140 162 160 Q166 182 150 184 Q140 176 130 186 Q120 178 110 186 Q100 176 90 184 Q74 182 78 160 Z', '#232c63')}
    ${[200, 222, 244, 266].map((y) => star(104, y, 4.5, '#ffd54a')).join('')}`;
  A.BOTTOMS.hw26_midnight = () => `${P('M84 232 L156 232 L157 258 L83 258 Z', '#1c2350')}${pantsLegs('#1c2350', 296, 30)}${L('M95 250 L94 294 M145 250 L146 294', '#e3b64a', 2)}
    ${[[104, 262], [112, 280], [132, 270], [138, 288], [124, 252]].map(([x, y]) => star(x, y, 3.2, '#ffe27a')).join('')}`;
  A.ACCESSORIES.hw26_moon = () => `${L('M100 156 Q120 196 140 156', '#2b1b4f', 2)}${P('M126 190 A12 12 0 1 1 118 172 A9 9 0 1 0 126 190 Z', '#e3b64a')}${star(129, 198, 3.5, '#b388ff')}`;
  A.ACCESSORIES.hw26_candy = () => `${L('M98 156 Q120 198 142 156', '#6b3fb8', 2)}${[[104, 172], [112, 184], [120, 190], [128, 184], [136, 172]].map(([x, y]) => `${P(`M${x - 4} ${y} L${x + 4} ${y} L${x} ${y + 11} Z`, '#ffd54a')}<path d="M${x - 2.6} ${y + 4} L${x + 2.6} ${y + 4} L${x} ${y + 11} Z" fill="#ff8a2a"/><path d="M${x - 1.2} ${y + 8} L${x + 1.2} ${y + 8} L${x} ${y + 11} Z" fill="#fff7ea"/>`).join('')}`;
  A.BACKGROUNDS.bg_hw26_moonlit = () => `<defs><linearGradient id="hwsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1440"/><stop offset=".6" stop-color="#3b2466"/><stop offset="1" stop-color="#6b3fb8"/></linearGradient>
      <radialGradient id="hwmoon" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#fff3c4"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient></defs>
    <rect width="240" height="320" fill="url(#hwsky)"/><circle cx="178" cy="58" r="44" fill="url(#hwmoon)" opacity=".55"/><circle cx="178" cy="58" r="26" fill="#fff3c4"/><circle cx="168" cy="52" r="5" fill="#f2dd9a"/><circle cx="186" cy="66" r="3.5" fill="#f2dd9a"/>
    ${[[28, 40, 2], [62, 22, 1.5], [96, 52, 1.8], [128, 18, 1.4], [212, 120, 1.6], [24, 112, 1.4], [140, 96, 1.2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".85"/>`).join('')}
    ${[[52, 84, 1], [98, 70, 0.7], [204, 104, 0.8]].map(([x, y, s]) => `<path d="M${x} ${y} q${-6 * s} ${-6 * s} ${-14 * s} ${-2 * s} q${4 * s} ${2 * s} ${3 * s} ${6 * s} q${5 * s} ${-3 * s} ${11 * s} ${-1 * s} q${6 * s} ${-2 * s} ${11 * s} ${1 * s} q${-1 * s} ${-4 * s} ${3 * s} ${-6 * s} q${-8 * s} ${-4 * s} ${-14 * s} ${2 * s} Z" fill="#1d1030"/>`).join('')}
    <path d="M0 262 Q60 240 120 256 Q180 270 240 248 L240 320 L0 320 Z" fill="#2a1a4a"/><path d="M0 290 Q80 272 160 286 Q200 292 240 280 L240 320 L0 320 Z" fill="#1d1236"/>
    ${[[34, 270, 1], [196, 262, 0.85], [82, 296, 0.7]].map(([x, y, s]) => `<ellipse cx="${x}" cy="${y}" rx="${18 * s}" ry="${13 * s}" fill="#f08a24" stroke="${OL}" stroke-width="2"/><path d="M${x} ${y - 13 * s} q-2 -6 3 -9" stroke="#5e7d2f" stroke-width="3" fill="none"/>${L(`M${x - 6 * s} ${y - 12 * s} Q${x - 9 * s} ${y} ${x - 6 * s} ${y + 12 * s} M${x + 6 * s} ${y - 12 * s} Q${x + 9 * s} ${y} ${x + 6 * s} ${y + 12 * s}`, '#c96a10', 1.6)}`).join('')}
    <g opacity=".9"><path d="M142 236 Q140 214 156 212 Q172 214 170 236 L170 248 Q166 244 163 248 Q159 244 156 248 Q152 244 149 248 Q145 244 142 248 Z" fill="#f6f3ff" stroke="${OL}" stroke-width="2"/><circle cx="151" cy="226" r="2" fill="${OL}"/><circle cx="161" cy="226" r="2" fill="${OL}"/></g>`;
};
