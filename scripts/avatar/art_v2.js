/*
  EnglishQuest Avatar — งานศิลป์ 2D ของคอลเลกชันใหม่ (v1.8.0 · 12 ธีม) — สไตล์/สเปกเดียวกับ art.js
  (canvas 240×320 · เส้นขอบ #2b2440 หนา 2.5 · ตำแหน่งร่างกายตาม ASSET SPECIFICATION ใน art.js)
  ใช้เป็นภาพ 2D (เครื่องที่ไม่มี WebGL / Preview 2D / ภาพย่อ) คู่กับโมเดล 3D จริงของชิ้นเดียวกัน
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
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`;
};
const flower = (x, y, r, fill, center = '#ffe066') => [0, 72, 144, 216, 288].map((a) => {
  const rad = (a * Math.PI) / 180;
  return `<circle cx="${(x + Math.cos(rad) * r * 0.6).toFixed(1)}" cy="${(y + Math.sin(rad) * r * 0.6).toFixed(1)}" r="${(r * 0.5).toFixed(1)}" fill="${fill}"/>`;
}).join('') + `<circle cx="${x}" cy="${y}" r="${(r * 0.35).toFixed(1)}" fill="${center}"/>`;
const leaf = (x, y, s, fill, rot = 0) => `<path d="M${x} ${y - 8 * s} Q${x + 6 * s} ${y} ${x} ${y + 8 * s} Q${x - 6 * s} ${y} ${x} ${y - 8 * s} Z" fill="${fill}" transform="rotate(${rot} ${x} ${y})"/>`;

const TORSO = 'M80 166 Q120 152 160 166 Q166 202 158 242 Q120 252 82 242 Q74 202 80 166 Z';
const TORSO_LONG = (y) => `M80 166 Q120 152 160 166 Q168 ${200 + (y - 242) / 2} 162 ${y} Q120 ${y + 10} 78 ${y} Q72 ${200 + (y - 242) / 2} 80 166 Z`;
const SHORT_SLEEVES = (c) => limb(87, 174, 80, 200, 27, c) + limb(153, 174, 160, 200, 27, c);
const ELBOW_SLEEVES = (c) => limb(87, 174, 78, 210, 30, c) + limb(153, 174, 162, 210, 30, c);
const LONG_SLEEVES = (c) => limb(87, 174, 71, 234, 27, c) + limb(153, 174, 169, 234, 27, c);
const CUFFS = (c) => limb(72, 230, 70, 236, 27, c) + limb(168, 230, 170, 236, 27, c);
const HIPS = 'M84 232 L156 232 L157 258 L83 258 Z';
const crew = (c2) => L('M104 158 Q120 170 136 158', c2, 3);
const vneck = (c2, depth = 186) => P(`M102 156 L120 ${depth} L138 156 L132 156 L120 ${depth - 12} L108 156 Z`, c2);
const placket = (c, btn, y0 = 168, y1 = 238, n = 5) => `${L(`M120 ${y0} L120 ${y1}`, c, 7)}${L(`M120 ${y0} L120 ${y1}`, OL, 1)}${Array.from({ length: n }, (_, i) => C(124, y0 + 6 + (i * (y1 - y0 - 12)) / (n - 1), 2.2, btn, 1.2)).join('')}`;
const collar = (c) => `${P('M102 154 L120 168 L110 180 L96 160 Z', c)}${P('M138 154 L120 168 L130 180 L144 160 Z', c)}`;
const pantsLegs = (c, to = 294, w = 28) => limb(107, 248, 106, to, w, c) + limb(133, 248, 134, to, w, c);
const footPair = (shape) => shape + `<g transform="translate(36,0)">${shape}</g>`;
const SNEAKER = 'M86 306 Q84 292 98 290 L110 290 Q120 293 119 306 Z';
const shine = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="4" stroke-linecap="round"/>`;

module.exports = function extend(A) {
  /* ---------- HAIR ---------- */
  Object.assign(A.HAIR, {
    curly: {
      color: '#3a2418',
      front: (c) => `${P('M62 112 C52 50 88 26 120 26 C152 26 188 50 178 112 C170 92 160 80 148 76 C132 86 108 86 92 76 C80 82 68 96 62 112 Z', c)}
        ${[[74, 64], [90, 44], [112, 34], [134, 34], [154, 44], [168, 64], [64, 88], [176, 88], [100, 70], [140, 70]].map(([x, y]) => C(x, y, 12, c, 2.2)).join('')}`,
    },
    wavy_long: {
      color: '#6b3e26',
      front: (c) => P('M58 206 C40 82 80 28 120 28 C160 28 200 82 182 206 Q176 196 170 206 Q166 190 168 150 C168 110 164 96 156 86 C138 96 118 92 116 80 C112 94 96 98 82 90 C74 104 72 150 74 190 Q70 200 64 194 Z', c) + shine('M92 46 Q108 36 124 38'),
      back: (c) => P('M56 120 C56 58 88 26 120 26 C152 26 184 58 184 120 Q196 160 186 196 Q194 214 182 226 Q120 236 58 226 Q46 214 54 196 Q44 160 56 120 Z', c),
    },
    twin_buns: {
      color: '#1f1b24',
      front: (c) => `${C(82, 34, 20, c, 2.5)}${C(158, 34, 20, c, 2.5)}${L('M70 44 Q82 52 94 44', '#ffcf3f', 3)}${L('M146 44 Q158 52 170 44', '#ffcf3f', 3)}
        ${P('M63 108 C56 52 90 28 120 28 C152 28 184 54 177 108 C172 86 164 74 152 68 C134 84 100 86 80 78 C72 86 66 96 63 108 Z', c)}${shine('M98 42 Q116 34 136 40')}`,
    },
    side_braid: {
      color: '#b36b2c',
      front: (c) => `${P('M63 110 C55 52 90 28 120 28 C152 28 186 52 177 110 C172 90 164 76 150 70 C132 84 102 86 82 78 C72 90 66 100 63 110 Z', c)}
        ${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${64 - (i % 2) * 4}" cy="${118 + i * 16}" rx="11" ry="9" fill="${c}" stroke="${OL}" stroke-width="2.2"/>`).join('')}
        ${C(62, 214, 5, '#3fa36b', 2)}${P('M58 218 L66 218 L64 232 L60 232 Z', c)}${shine('M98 42 Q116 34 136 40')}`,
    },
    spiky: {
      color: '#3f8bff',
      front: (c) => `${P('M62 108 L60 74 L74 82 L72 46 L92 62 L98 26 L114 52 L124 16 L134 50 L152 26 L154 60 L172 46 L168 82 L182 74 L178 108 C170 88 160 78 150 74 C132 84 106 84 90 76 C78 82 68 94 62 108 Z', c)}
        ${shine('M100 46 L112 40')}`,
    },
  });

  /* ---------- TOPS ---------- */
  Object.assign(A.TOPS, {
    oversize_graphic: () => `${ELBOW_SLEEVES('#f1ece2')}${P(TORSO_LONG(256), '#f1ece2')}${crew('#d9d2c4')}
      <rect x="98" y="186" width="44" height="30" rx="4" fill="#1f2a44"/>${P('M116 190 L128 190 L120 202 L130 202 L112 222 L118 206 L108 206 Z', '#ff5a36')}`,
    oxford_shirt: () => `${LONG_SLEEVES('#cfe0f5')}${CUFFS('#cfe0f5')}${P(TORSO, '#cfe0f5')}${collar('#e2edfa')}${placket('#b9cfe9', '#ffffff')}
      <rect x="132" y="188" width="16" height="14" rx="2" fill="none" stroke="#a9c2e3" stroke-width="2"/>`,
    sport_jersey: () => `${SHORT_SLEEVES('#ffffff')}${P(TORSO, '#1f6feb')}${vneck('#ffffff')}
      <text x="120" y="226" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" fill="#ffd54a" stroke="${OL}" stroke-width="1.6">17</text>
      ${L('M82 196 L80 238', '#ffffff', 5)}${L('M158 196 L160 238', '#ffffff', 5)}`,
    turtleneck: () => `${LONG_SLEEVES('#2b2b33')}${CUFFS('#3a3a44')}${P(TORSO, '#2b2b33')}${P('M104 140 L136 140 L138 166 Q120 172 102 166 Z', '#3a3a44')}
      ${[108, 114, 120, 126, 132].map((x) => L(`M${x} 144 L${x} 164`, '#4a4a56', 1.5)).join('')}`,
    ringer_tee: () => `${SHORT_SLEEVES('#f3e6c8')}${limb(81, 196, 80, 200, 27, '#b5452f')}${limb(159, 196, 160, 200, 27, '#b5452f')}${P(TORSO, '#f3e6c8')}
      ${L('M104 158 Q120 170 136 158', '#b5452f', 5)}${C(120, 202, 15, '#b5452f', 2)}${star(120, 202, 8, '#f3e6c8', 5, 0.45, 'none')}`,
    adventurer_tunic: () => `${LONG_SLEEVES('#4f7a3a')}${CUFFS('#c79a52')}${P(TORSO_LONG(266), '#4f7a3a')}${vneck('#c79a52', 194)}
      ${L('M112 172 L128 176 M110 182 L130 186', '#c79a52', 2)}<rect x="78" y="226" width="84" height="10" rx="3" fill="#6b4224" stroke="${OL}" stroke-width="2.2"/>
      <rect x="113" y="224" width="14" height="14" rx="2" fill="#d9b45a" stroke="${OL}" stroke-width="2"/>${P('M148 236 L162 236 L160 252 L150 252 Z', '#6b4224')}`,
    tech_zip: () => `${LONG_SLEEVES('#20232e')}${CUFFS('#353a4a')}${P(TORSO, '#20232e')}${P('M106 138 L134 138 L136 166 Q120 170 104 166 Z', '#353a4a')}
      ${L('M120 140 L120 244', '#9aa3b5', 3)}<rect x="116" y="150" width="8" height="12" rx="2" fill="#36e2ff" stroke="${OL}" stroke-width="1.6"/>
      ${L('M96 176 L94 238', '#36e2ff', 2.5)}${L('M144 176 L146 238', '#36e2ff', 2.5)}`,
    tank_summer: () => `${P('M90 162 L98 160 Q120 186 142 160 L150 162 Q164 202 158 242 Q120 252 82 242 Q76 202 90 162 Z', '#ffb347')}
      ${L('M98 160 Q120 186 142 160', '#f0f0ea', 3)}${C(120, 208, 11, '#fff2b0', 2)}${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return L(`M${(120 + Math.cos(r) * 14).toFixed(1)} ${(208 + Math.sin(r) * 14).toFixed(1)} L${(120 + Math.cos(r) * 18).toFixed(1)} ${(208 + Math.sin(r) * 18).toFixed(1)}`, '#fff2b0', 2); }).join('')}`,
    hawaiian_shirt: () => `${SHORT_SLEEVES('#1aa59a')}${P(TORSO, '#1aa59a')}
      ${[[94, 186], [146, 192], [104, 224], [140, 228], [90, 210]].map(([x, y], i) => (i % 2 ? leaf(x, y, 1.2, '#0d6b5f', 30 * i) : flower(x, y, 9, '#ffcf5a', '#ff7a59'))).join('')}
      ${collar('#18938a')}${placket('#18938a', '#f6efe0', 176, 238, 4)}`,
    holiday_sweater: () => `${LONG_SLEEVES('#c8323f')}${CUFFS('#8f1f2a')}${P(TORSO, '#c8323f')}
      <rect x="78" y="176" width="84" height="10" fill="#1f7a4a"/><rect x="78" y="226" width="84" height="10" fill="#1f7a4a"/>
      ${[96, 120, 144].map((x) => star(x, 205, 8, '#ffffff', 6, 0.3, 'none')).join('')}${P(TORSO, 'none')}${crew('#8f1f2a')}`,
    songkran_shirt: () => `${SHORT_SLEEVES('#4fb3f6')}${P(TORSO, '#4fb3f6')}
      ${[[92, 186, '#ff6fa8'], [148, 190, '#ffe066'], [100, 222, '#ffe066'], [142, 228, '#ff6fa8'], [134, 206, '#ff6fa8']].map(([x, y, c]) => flower(x, y, 8, c, '#ffffff')).join('')}
      ${leaf(108, 200, 1, '#2e9e57', 40)}${leaf(156, 214, 1, '#2e9e57', -30)}${collar('#3fa2e6')}${placket('#3fa2e6', '#ffffff', 176, 238, 4)}`,
  });

  /* ---------- OUTERWEAR ---------- */
  const panel = (len = 0) => `M80 166 Q98 156 110 158 L108 ${246 + len} L80 ${244 + len} Q72 204 80 166 Z`;
  const jacket = (c, trim, sleeve = c, len = 0) => `${LONG_SLEEVES(sleeve)}${CUFFS(trim)}${both(P(panel(len), c))}`;
  Object.assign(A.OUTER, {
    blazer: () => `${jacket('#2f3a56', '#2f3a56', '#2f3a56', 14)}${both(P('M96 158 L112 160 L110 206 L98 176 L90 172 Z', '#3a4668'))}
      ${C(106, 214, 3, '#1b2235')}${C(106, 228, 3, '#1b2235')}${both(L('M84 236 L102 236', '#1b2235', 2.5))}${P('M88 184 L100 184 L98 178 L94 182 L90 178 Z', '#e9c46a')}`,
    bomber: () => `${LONG_SLEEVES('#4a5a3a')}${CUFFS('#d9772b')}${both(P(panel(), '#4a5a3a'))}<rect x="80" y="238" width="80" height="12" rx="5" fill="#d9772b" stroke="${OL}" stroke-width="2.2"/>
      ${P('M98 152 Q120 164 142 152 L142 162 Q120 172 98 162 Z', '#d9772b')}${L('M110 164 L110 238', '#c7ccd8', 2.5)}${L('M150 196 L156 196', '#2b2440', 2)}`,
    varsity: () => `${LONG_SLEEVES('#f2ead8')}${CUFFS('#7a1f2b')}${both(P(panel(), '#7a1f2b'))}<rect x="80" y="238" width="80" height="12" rx="5" fill="#7a1f2b" stroke="${OL}" stroke-width="2.2"/>
      ${L('M82 242 L158 242', '#f2ead8', 2)}${L('M82 246 L158 246', '#f2ead8', 2)}${P('M98 152 Q120 164 142 152 L142 162 Q120 172 98 162 Z', '#7a1f2b')}
      <text x="94" y="206" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="22" fill="#f2c14e" stroke="${OL}" stroke-width="1.4">E</text>
      ${[176, 196, 216, 232].map((y) => C(112, y, 2.2, '#e3c47a', 1.2)).join('')}`,
    cardigan: () => `${LONG_SLEEVES('#c9a46a')}${CUFFS('#a8864d')}${both(P(panel(), '#c9a46a'))}${both(L('M110 158 L108 244', '#a8864d', 5))}
      ${[186, 204, 222].map((y) => C(112, y, 2.6, '#5a3b22', 1.4)).join('')}${both(P('M86 214 L102 214 L102 232 L86 232 Z', '#c9a46a'))}${both(L('M86 216 L102 216', '#a8864d', 3))}`,
    tech_shell: () => `${LONG_SLEEVES('#2a2f3d')}${CUFFS('#11141c')}${both(P(panel(), '#2a2f3d'))}${P('M86 150 Q120 132 154 150 L150 162 Q120 150 90 162 Z', '#11141c')}
      ${L('M114 160 L112 244', '#7d8699', 2.5)}${L('M86 172 L154 214', '#11141c', 6)}${L('M74 206 L84 206', '#c2ff3d', 3)}${L('M156 206 L166 206', '#c2ff3d', 3)}`,
    puffer: () => `${LONG_SLEEVES('#3b6ff5')}${CUFFS('#22336b')}${P(TORSO, '#3b6ff5')}${[184, 204, 224].map((y) => L(`M80 ${y} Q120 ${y + 6} 160 ${y}`, '#2a55c8', 2.5)).join('')}
      ${limb(77, 196, 75, 200, 32, '#3b6ff5')}${limb(163, 196, 165, 200, 32, '#3b6ff5')}${P('M100 136 L140 136 L144 164 Q120 172 96 164 Z', '#3b6ff5')}${L('M120 140 L120 244', '#d8dde8', 2.5)}`,
  });

  /* ---------- BOTTOMS ---------- */
  Object.assign(A.BOTTOMS, {
    chinos: () => `${pantsLegs('#c7b28a', 290, 26)}${limb(107, 286, 106, 292, 30, '#b8a27a')}${limb(133, 286, 134, 292, 30, '#b8a27a')}${P(HIPS, '#c7b28a')}${L('M120 236 L120 256', '#a8936a', 2)}
      ${L('M104 250 L104 284', '#b8a27a', 1.6)}${L('M136 250 L136 284', '#b8a27a', 1.6)}`,
    track_pants: () => `${pantsLegs('#1d2b4f')}${limb(107, 288, 106, 294, 24, '#141e38')}${limb(133, 288, 134, 294, 24, '#141e38')}${P(HIPS, '#1d2b4f')}
      ${L('M94 248 L94 290', '#ffffff', 2.5)}${L('M98 248 L98 290', '#ffffff', 2.5)}${L('M142 248 L142 290', '#ffffff', 2.5)}${L('M146 248 L146 290', '#ffffff', 2.5)}`,
    wide_trousers: () => `${P('M84 236 L118 236 L116 296 L82 296 Z', '#e8e2d6')}${P('M122 236 L156 236 L158 296 L124 296 Z', '#e8e2d6')}${P(HIPS, '#e8e2d6')}${L('M120 236 L120 254', '#c9c1b0', 2)}${L('M100 240 L100 292', '#d6cebf', 1.6)}${L('M140 240 L140 292', '#d6cebf', 1.6)}`,
    corduroy: () => `${pantsLegs('#8a4b2a')}${P(HIPS, '#8a4b2a')}${[98, 104, 110, 116].map((x) => L(`M${x} 252 L${x - 1} 290`, '#6e3a1f', 1.4)).join('')}${[124, 130, 136, 142].map((x) => L(`M${x} 252 L${x + 1} 290`, '#6e3a1f', 1.4)).join('')}${L('M120 236 L120 256', '#5a2e17', 2)}`,
    ranger_pants: () => `${pantsLegs('#5d4b3a')}${P(HIPS, '#5d4b3a')}${[276, 282, 288].map((y) => L(`M94 ${y} L120 ${y + 2} M120 ${y + 2} L146 ${y}`, '#c9b38a', 3)).join('')}
      <rect x="84" y="232" width="72" height="7" fill="#3a2615" stroke="${OL}" stroke-width="2"/>${P('M142 252 L154 252 L154 266 L142 266 Z', '#3a2615')}`,
    tech_joggers: () => `${pantsLegs('#1b1e27', 290)}${limb(107, 286, 106, 292, 22, '#3a4152')}${limb(133, 286, 134, 292, 22, '#3a4152')}${P(HIPS, '#1b1e27')}
      ${P('M88 258 L102 258 L102 274 L88 274 Z', '#3a4152')}${P('M138 258 L152 258 L152 274 L138 274 Z', '#3a4152')}${L('M90 262 L90 270', '#36e2ff', 2)}${L('M150 262 L150 270', '#36e2ff', 2)}`,
    snow_pants: () => `${pantsLegs('#2f3e66', 294, 32)}${P(HIPS, '#2f3e66')}${[256, 270, 284].map((y) => L(`M92 ${y} L120 ${y + 1} L148 ${y}`, '#22305a', 2)).join('')}
      <rect x="98" y="266" width="14" height="14" rx="3" fill="#22305a" stroke="${OL}" stroke-width="2"/><rect x="128" y="266" width="14" height="14" rx="3" fill="#22305a" stroke="${OL}" stroke-width="2"/>${L('M98 232 L94 220 M142 232 L146 220', '#e8455d', 4)}`,
    thai_fisherman: () => `${P('M84 236 L118 236 L120 292 L80 296 Z', '#3a5ab8')}${P('M122 236 L156 236 L160 296 L120 292 Z', '#3a5ab8')}${P(HIPS, '#3a5ab8')}<rect x="84" y="230" width="72" height="9" rx="3" fill="#2a4290" stroke="${OL}" stroke-width="2.2"/>${P('M126 236 L134 238 L130 256 Z', '#2a4290')}`,
    board_shorts: () => `${limb(107, 248, 106, 270, 32, '#ff7a59')}${limb(133, 248, 134, 270, 32, '#ff7a59')}${P(HIPS, '#ff7a59')}${leaf(98, 258, 1, '#ffd6a5', 20)}${leaf(142, 262, 1, '#ffd6a5', -20)}
      ${L('M116 238 L114 250 M124 238 L126 250', '#ffffff', 2)}`,
  });

  /* ---------- SHOES ---------- */
  Object.assign(A.SHOES, {
    chunky_street: () => footPair(`${P('M84 306 Q82 290 98 288 L110 288 Q122 292 121 306 Z', '#eceff4')}<rect x="82" y="302" width="40" height="8" rx="4" fill="#f6f1e7" stroke="${OL}" stroke-width="2.2"/>${L('M92 296 L110 294', '#ff5a36', 3)}${L('M88 300 L116 300', '#9aa6bf', 2)}`),
    loafers: () => footPair(`${P('M86 306 Q86 296 98 294 L110 294 Q120 296 119 306 Z', '#5a3220')}${L('M86 306 L119 306', '#2b1a10', 3)}${L('M96 298 L110 298', '#3e2416', 2.5)}`),
    runners: () => footPair(`${P(SNEAKER, '#ff4f5e')}<rect x="84" y="302" width="37" height="7" rx="3.5" fill="#ffffff" stroke="${OL}" stroke-width="2"/>${L('M94 298 Q102 292 112 296', '#1d2440', 2.5)}`),
    slipon_white: () => footPair(`${P('M86 306 Q86 296 98 294 L110 294 Q120 296 119 306 Z', '#f4f4f0')}${L('M87 306 L118 306', '#e8e4da', 3)}${L('M96 296 L98 300 M108 296 L106 300', '#cfc8b8', 1.6)}`),
    retro_court: () => footPair(`${P(SNEAKER, '#fffaf0')}${L('M87 305 L118 305', '#e9dcc0', 3.5)}${L('M100 302 L106 292 M104 302 L110 292 M108 302 L114 292', '#2e7d4f', 2)}`),
    tech_boots: () => footPair(`${P('M92 270 L118 270 L119 306 L85 306 Q84 296 92 292 Z', '#1c1f29')}${L('M92 278 L118 278 M92 288 L118 288', '#3a4152', 3)}${L('M86 306 L119 306', '#36e2ff', 3)}`),
    snow_boots: () => footPair(`${P('M92 272 L118 272 L119 306 L85 306 Q84 296 92 292 Z', '#7a4a2a')}<rect x="88" y="264" width="34" height="12" rx="6" fill="#f3ecdf" stroke="${OL}" stroke-width="2.2"/>${L('M86 306 L119 306', '#2b1a10', 4)}${L('M98 284 L112 284 M98 292 L112 292', '#e8455d', 2)}`),
    adventure_boots: () => footPair(`${P('M90 262 L120 262 L119 306 L85 306 Q84 296 92 292 Z', '#6b4224')}<rect x="88" y="260" width="34" height="10" rx="3" fill="#8a5a33" stroke="${OL}" stroke-width="2.2"/>${L('M92 284 L118 284', '#8a5a33', 3)}<rect x="114" y="280" width="6" height="8" fill="#d9b45a" stroke="${OL}" stroke-width="1.4"/>${L('M86 306 L119 306', '#3a2615', 3.5)}`),
    holiday_booties: () => footPair(`${P('M92 274 L118 274 L119 306 L85 306 Q84 296 92 292 Z', '#c8323f')}<rect x="88" y="266" width="34" height="11" rx="5.5" fill="#fbf7ee" stroke="${OL}" stroke-width="2.2"/><circle cx="122" cy="272" r="5" fill="#fbf7ee" stroke="${OL}" stroke-width="2"/>${L('M86 306 L119 306', '#5a1f22', 3.5)}`),
    sandals: () => footPair(`<ellipse cx="102" cy="303" rx="16" ry="7" fill="#e8b48c" stroke="${OL}" stroke-width="2.2"/><rect x="85" y="304" width="34" height="5" rx="2.5" fill="#c99a5b" stroke="${OL}" stroke-width="2"/>${L('M92 300 L112 300', '#6b4224', 3.5)}${L('M96 296 L108 296', '#6b4224', 3)}`),
  });

  /* ---------- HATS ---------- */
  Object.assign(A.HATS, {
    snapback: () => `${P('M66 86 C64 42 92 26 120 26 C148 26 176 42 174 86 Q120 74 66 86 Z', '#1f2a44')}${star(120, 58, 11, '#ff5a36')}
      ${P('M58 86 Q120 74 182 86 L184 94 Q120 84 56 94 Z', '#1f2a44')}${L('M60 92 Q120 82 180 92', '#ff5a36', 2)}`,
    sun_hat: () => `${P('M74 80 C74 44 96 32 120 32 C144 32 166 44 166 80 Z', '#e8d29a')}${P('M34 92 Q60 72 82 76 L158 76 Q180 72 206 92 Q120 108 34 92 Z', '#e8d29a')}
      ${L('M74 74 Q120 82 166 74', '#ff7a59', 6)}${P('M156 72 L170 64 L168 80 Z', '#ff7a59')}${[60, 80, 100, 140, 160, 180].map((x) => L(`M${x} 86 L${x + 2} 94`, '#c9b27a', 1.4)).join('')}`,
    beret: () => `${P('M64 74 C60 40 104 26 132 30 C170 34 186 54 176 76 Q120 86 64 74 Z', '#8f1f2a')}${L('M68 74 Q120 84 174 74', '#6e1520', 3)}<path d="M128 30 L132 22" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`,
    sport_headband: () => `<path d="M62 84 Q120 66 178 84 L178 98 Q120 80 62 98 Z" fill="#1f6feb" stroke="${OL}" stroke-width="${SW}"/>${star(120, 82, 6, '#ffffff', 5, 0.45, 'none')}`,
  });

  /* ---------- GLASSES ---------- */
  Object.assign(A.GLASSES, {
    aviator: () => `${L('M84 102 L70 99', '#d9b45a', 2.5)}${L('M156 102 L170 99', '#d9b45a', 2.5)}${both(P('M86 98 Q100 94 114 98 Q114 114 102 118 Q88 116 86 98 Z', '#5a4a2a', 'fill-opacity=".85"'))}
      ${L('M114 99 L126 99', '#d9b45a', 2.5)}${L('M112 95 Q120 92 128 95', '#d9b45a', 2)}`,
  });

  /* ---------- HEADPHONES ---------- */
  A.HEADPHONES.phones_earmuffs = () => `${L('M66 100 C60 26 180 26 174 100', OL, 9)}${L('M66 100 C60 26 180 26 174 100', '#c2185b', 5)}
    ${C(64, 104, 17, '#f6c1d0', 2.5)}${C(176, 104, 17, '#f6c1d0', 2.5)}<circle cx="60" cy="98" r="5" fill="#fff" opacity=".45"/><circle cx="172" cy="98" r="5" fill="#fff" opacity=".45"/>`;

  /* ---------- BACK ---------- */
  const straps = (c) => limb(97, 164, 94, 226, 9, c) + limb(143, 164, 146, 226, 9, c);
  Object.assign(A.BACKS, {
    skateboard: {
      back: () => `<g transform="rotate(-24 120 210)"><rect x="96" y="120" width="48" height="190" rx="24" fill="#ff5a36" stroke="${OL}" stroke-width="${SW}"/>${C(108, 140, 6, '#f6e7a1')}${C(132, 140, 6, '#f6e7a1')}${C(108, 290, 6, '#f6e7a1')}${C(132, 290, 6, '#f6e7a1')}</g>`,
      front: () => straps('#2b2440'),
    },
    tote_canvas: {
      back: () => `${P('M150 200 L196 196 L200 262 L154 266 Z', '#efe6d2')}${star(176, 232, 10, '#1f2a44')}`,
      front: () => `${limb(100, 158, 150, 220, 6, '#c9b38a')}`,
    },
    quiver: {
      back: () => `<g transform="rotate(22 120 200)"><rect x="104" y="130" width="34" height="130" rx="12" fill="#7a4a2a" stroke="${OL}" stroke-width="${SW}"/>
        ${[110, 120, 130].map((x, i) => `${L(`M${x} 132 L${x} ${108 - i * 4}`, '#c79a52', 3)}${P(`M${x - 5} ${108 - i * 4} L${x + 5} ${108 - i * 4} L${x} ${96 - i * 4} Z`, '#e8455d')}`).join('')}</g>`,
      front: () => limb(92, 160, 150, 236, 7, '#7a4a2a'),
    },
    sling_tech: {
      back: () => `<g transform="rotate(-22 120 180)"><rect x="70" y="160" width="76" height="34" rx="12" fill="#1b1e27" stroke="${OL}" stroke-width="${SW}"/>${L('M80 170 L136 170', '#c2ff3d', 2.5)}</g>`,
      front: () => `${limb(148, 160, 96, 222, 8, '#3a4152')}<rect x="112" y="196" width="14" height="10" rx="2" fill="#9aa3b5" stroke="${OL}" stroke-width="1.8" transform="rotate(-40 119 201)"/>`,
    },
  });

  /* ---------- ACCESSORIES ---------- */
  const necklace = (c, w = 3, drop = 186) => L(`M102 156 Q104 ${drop} 120 ${drop + 4} Q136 ${drop} 138 156`, c, w);
  Object.assign(A.ACCESSORIES, {
    chain_necklace: () => `${necklace(OL, 5.5, 182)}${necklace('#e8c35a', 3.5, 182)}`,
    bowtie: () => `${P('M120 160 L104 152 L104 170 Z', '#8f1f2a')}${P('M120 160 L136 152 L136 170 Z', '#8f1f2a')}${C(120, 161, 4, '#6e1520', 2)}`,
    sweatband: () => `<rect x="60" y="222" width="20" height="14" rx="5" fill="#ffffff" stroke="${OL}" stroke-width="2" transform="rotate(14 70 229)"/>${L('M62 228 L78 232', '#1f6feb', 2)}`,
    id_lanyard: () => `${necklace('#1f6feb', 3, 196)}<rect x="110" y="198" width="20" height="26" rx="3" fill="#ffffff" stroke="${OL}" stroke-width="2"/><rect x="114" y="203" width="8" height="9" fill="#9fc5ff"/>${L('M114 216 L126 216 M114 220 L124 220', '#1f6feb', 1.4)}`,
    amulet: () => `${necklace('#3a2615', 2.5, 192)}${C(120, 200, 9, '#d9b45a', 2.2)}<ellipse cx="120" cy="200" rx="5" ry="6.5" fill="#36e2ff" stroke="${OL}" stroke-width="1.4"/>`,
    smartband: () => `<rect x="62" y="226" width="16" height="11" rx="3" fill="#20232e" stroke="${OL}" stroke-width="2" transform="rotate(14 70 232)"/><rect x="65" y="229" width="10" height="5" rx="1.5" fill="#36e2ff" transform="rotate(14 70 232)"/>`,
    mittens: () => both(`${P('M56 236 Q54 222 66 222 Q80 222 80 238 Q80 256 66 256 Q54 256 56 236 Z', '#d93a48')}${P('M78 236 Q86 232 86 240 Q84 246 78 244 Z', '#d93a48')}<rect x="58" y="218" width="22" height="8" rx="3" fill="#f4f1ea" stroke="${OL}" stroke-width="2"/>`),
    bead_bracelet: () => ['#ff7a59', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ff7a59'].map((c, i) => C(60 + i * 4, 228 + (i % 2) * 2 + i * 1.2, 3.2, c, 1.4)).join(''),
    minimal_pendant: () => `${necklace('#d8dde8', 1.8, 190)}<rect x="118" y="192" width="4" height="14" rx="1.5" fill="#d8dde8" stroke="${OL}" stroke-width="1.4"/>`,
    neckerchief: () => `${L('M102 158 Q120 168 138 158', '#b5452f', 6)}${P('M106 160 L134 160 L120 184 Z', '#b5452f')}${C(116, 166, 1.6, '#f3e6c8', 0)}${C(124, 166, 1.6, '#f3e6c8', 0)}${C(120, 174, 1.6, '#f3e6c8', 0)}${C(138, 160, 5, '#b5452f', 2)}`,
    flower_garland: () => `${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => { const t = i / 10; const x = 100 + t * 40; const y = 158 + Math.sin(t * Math.PI) * 44; return C(x.toFixed(1), y.toFixed(1), i % 4 === 2 ? 5 : 4, i % 4 === 2 ? '#ffb020' : '#fffdf5', 1.6); }).join('')}
      ${C(120, 208, 6, '#e8455d', 1.8)}${L('M117 212 L114 230 M123 212 L126 230', '#e8455d', 2.5)}`,
  });

  /* ---------- EFFECTS ---------- */
  Object.assign(A.EFFECTS, {
    snowfall: { front: () => [[32, 60, 8], [210, 84, 7], [40, 190, 6], [206, 210, 8], [196, 30, 5], [26, 128, 5], [214, 150, 6], [52, 260, 5]].map(([x, y, r]) => star(x, y, r, '#ffffff', 6, 0.28, '#9fc5ff')).join('') },
    lanterns: {
      front: () => [[34, 70, 1], [208, 110, 0.85], [40, 210, 0.7]].map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-13" y="-16" width="26" height="30" rx="11" fill="#ffb347" stroke="${OL}" stroke-width="2.2"/><rect x="-9" y="-20" width="18" height="5" rx="2" fill="#c8323f" stroke="${OL}" stroke-width="1.6"/><circle cx="0" cy="18" r="4" fill="#ffe066"/></g>`).join(''),
    },
  });
  return A;
};
