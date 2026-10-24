/*
  EnglishQuest Avatar — งานศิลป์แบบ Layer (SVG ต้นฉบับของโปรเจกต์ · ไม่ใช้ AI สร้างภาพตอนผู้ใช้เปลี่ยนชุด)

  ASSET SPECIFICATION (ทุกชิ้นต้องตามนี้ — อย่าขยับตำแหน่งด้วย CSS รายหน้า)
    canvas    : viewBox 0 0 240 320 (ทุกไฟล์เท่ากัน) · anchor กลาง x = 120
    ศีรษะ     : ศูนย์กลาง (120, 96) · กว้าง 108 · บนสุด y 36 · คาง y 156 · ตา (100,106) และ (140,106) · ปาก y 128 · หู x 66 / 174
    ลำตัว     : ไหล่ y 166 (x 80–160) · เอว/สะโพก y 236–256 · แขนจากไหล่ (86,176)/(154,176) ถึงข้อมือ (70,238)/(170,238) · มือ (68,246)/(172,246)
    ขา/เท้า   : ขาจาก (107,244)/(133,244) ถึง (106,296)/(134,296) · เท้า (102,302)/(138,302)
    เส้นขอบ   : #2b2440 หนา 2.5 · มุมมน — ทุกชิ้นใช้สไตล์เดียวกัน (Friendly · Modern · Game-like)
    ชิ้นส่วน   : front (หน้าลำตัว) · back (หลังลำตัว เช่น ผมยาว เป้ ผ้าคลุม ออร่า) — z ของแต่ละส่วนกำหนดใน LAYER_Z
*/
const OL = '#2b2440';
const SW = 2.5;

// ลำดับชั้น (มาก = อยู่บน) — renderer เรียงตามนี้เสมอ
const LAYER_Z = {
  background: 0, effectBack: 2, back: 5, hairBack: 7, body: 10, bottom: 20, shoes: 22, top: 30, backFront: 33, outerwear: 35,
  face: 40, glasses: 45, hair: 50, headphones: 60, hat: 65, accessory: 70, effect: 90,
};

/* ---------------- ตัวช่วยวาด ---------------- */
const limb = (x1, y1, x2, y2, w, color) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${OL}" stroke-width="${w + SW * 2}" stroke-linecap="round"/>`
  + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`;
const L = (d, color = OL, w = 2.5, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const mirror = (s) => `<g transform="translate(240,0) scale(-1,1)">${s}</g>`;
const both = (s) => s + mirror(s);
const star4 = (x, y, r, fill) => `<path d="M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z" fill="${fill}"/>`;
const star5 = (x, y, r, fill, stroke = OL) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/>`;
};

// รูปทรงมาตรฐาน (ใช้ร่วมกันทุกชิ้น เพื่อให้ตรงตำแหน่งกันเสมอ)
const HEAD = 'M66 98 C66 54 90 36 120 36 C150 36 174 54 174 98 C174 134 152 156 120 156 C88 156 66 134 66 98 Z';
const TORSO = 'M80 166 Q120 152 160 166 Q166 202 158 242 Q120 252 82 242 Q74 202 80 166 Z';
const SHORT_SLEEVES = (c) => limb(87, 174, 80, 200, 27, c) + limb(153, 174, 160, 200, 27, c);
const LONG_SLEEVES = (c) => limb(87, 174, 71, 234, 27, c) + limb(153, 174, 169, 234, 27, c);
const CUFFS = (c) => limb(72, 230, 70, 236, 27, c) + limb(168, 230, 170, 236, 27, c);
const HIPS = 'M84 232 L156 232 L157 258 L83 258 Z';

/* ---------------- BODY (สีผิว) — มีเสื้อชั้นในสีขาวและกางเกงขาสั้นพื้นฐาน: ถอดเสื้อผ้าแล้วยังเหมาะสมเสมอ ---------------- */
function body(skin, shade) {
  return `<g stroke-linecap="round" stroke-linejoin="round">
    ${limb(107, 244, 106, 296, 24, skin)}${limb(133, 244, 134, 296, 24, skin)}
    <ellipse cx="102" cy="302" rx="15" ry="8" fill="#f2f2f5" stroke="${OL}" stroke-width="${SW}"/>
    <ellipse cx="138" cy="302" rx="15" ry="8" fill="#f2f2f5" stroke="${OL}" stroke-width="${SW}"/>
    ${limb(86, 176, 70, 238, 22, skin)}${limb(154, 176, 170, 238, 22, skin)}
    <circle cx="68" cy="246" r="11" fill="${skin}" stroke="${OL}" stroke-width="${SW}"/>
    <circle cx="172" cy="246" r="11" fill="${skin}" stroke="${OL}" stroke-width="${SW}"/>
    ${P('M86 230 L154 230 L156 262 L125 262 L120 250 L115 262 L84 262 Z', '#6b7286')}
    ${P(TORSO, '#f4f1ea')}
    ${P('M109 138 L131 138 L133 164 Q120 172 107 164 Z', skin)}
    <path d="M110 160 Q120 166 130 160" fill="none" stroke="${shade}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="66" cy="104" rx="10" ry="14" fill="${skin}" stroke="${OL}" stroke-width="${SW}"/>
    <ellipse cx="174" cy="104" rx="10" ry="14" fill="${skin}" stroke="${OL}" stroke-width="${SW}"/>
    <path d="M66 98 Q62 104 67 111" fill="none" stroke="${shade}" stroke-width="2.5"/><path d="M174 98 Q178 104 173 111" fill="none" stroke="${shade}" stroke-width="2.5"/>
    ${P(HEAD, skin)}
    <path d="M118 112 Q121 118 117 121" fill="none" stroke="${shade}" stroke-width="2.5" stroke-linecap="round"/>
  </g>`;
}

/* ---------------- FACE ---------------- */
const blush = '<ellipse cx="88" cy="123" rx="8" ry="4.5" fill="#ff8fa3" opacity=".38"/><ellipse cx="152" cy="123" rx="8" ry="4.5" fill="#ff8fa3" opacity=".38"/>';
const eyesOpen = both(`<ellipse cx="100" cy="106" rx="6.2" ry="7.6" fill="${OL}"/><circle cx="102.4" cy="103" r="2.2" fill="#fff"/>`);
const FACES = {
  smile: `${blush}${eyesOpen}${both(L('M90 90 Q100 85 109 89', OL, 3))}${L('M110 128 Q120 136 130 128', OL, 3)}`,
  happy: `${blush}${both(L('M92 108 Q100 98 108 108', OL, 3.5))}${both(L('M90 89 Q100 84 109 88', OL, 3))}
    <path d="M108 125 Q120 142 132 125 Z" fill="#c2435a" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M113 132 Q120 137 127 132" fill="none" stroke="#ff9db0" stroke-width="3" stroke-linecap="round"/>`,
  cool: `${blush}${both(`<ellipse cx="100" cy="107" rx="6.2" ry="6.6" fill="${OL}"/><circle cx="102.2" cy="105" r="1.8" fill="#fff"/>`)}
    ${both(L('M92 100 L109 101', OL, 3))}${both(L('M90 90 L109 91', OL, 3))}${L('M111 130 Q122 134 131 126', OL, 3)}`,
  focused: `${blush}${eyesOpen}${both(L('M89 87 L109 93', OL, 3.4))}${L('M112 130 L128 130', OL, 3)}`,
};

/* ---------------- HAIR (front + back) ---------------- */
const shine = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="4" stroke-linecap="round"/>`;
const HAIR = {
  crop: { color: '#3b2a24', front: (c) => P('M63 108 C56 52 90 28 120 28 C150 28 184 52 177 108 C173 88 166 78 156 74 C144 84 118 86 98 78 C86 82 70 92 63 108 Z', c) + shine('M96 44 Q112 36 132 40') },
  sidepart: { color: '#1f1b24', front: (c) => P('M63 110 C55 50 92 26 122 26 C158 26 186 54 177 110 C172 88 162 74 150 66 C130 88 98 90 74 82 C68 90 65 100 63 110 Z', c) + shine('M104 40 Q124 32 146 40') },
  bob: {
    color: '#8a4b2a',
    front: (c) => P('M60 150 C50 70 84 28 120 28 C156 28 190 70 180 150 L163 150 C166 122 165 98 157 84 C136 94 104 94 83 84 C75 98 74 122 77 150 Z', c) + shine('M92 44 Q112 34 136 40'),
    back: (c) => P('M58 152 C50 70 84 26 120 26 C156 26 190 70 182 152 Q120 166 58 152 Z', c),
  },
  ponytail: {
    color: '#d9a441',
    front: (c) => P('M63 108 C56 52 90 28 120 28 C152 28 184 54 177 108 C172 86 164 74 152 68 C134 84 100 86 80 78 C72 86 66 96 63 108 Z', c) + shine('M98 42 Q116 34 136 40')
      + `<circle cx="160" cy="52" r="7" fill="#e85d75" stroke="${OL}" stroke-width="${SW}"/>`,
    back: (c) => P('M156 50 C204 60 206 132 186 184 C182 156 176 118 158 94 Z', c),
  },
  long: {
    color: '#2a1c2e',
    front: (c) => P('M58 200 C44 82 80 28 120 28 C160 28 196 82 182 200 L166 200 C170 152 167 110 159 88 C142 98 120 92 120 80 C120 92 98 98 81 88 C73 110 70 152 74 200 Z', c) + shine('M92 46 Q108 36 124 38'),
    back: (c) => P('M56 120 C56 58 88 26 120 26 C152 26 184 58 184 120 L190 218 Q120 230 50 218 Z', c),
  },
};

/* ---------------- TOPS ---------------- */
let clipN = 0;
const clipTorso = (inner, withSleeves = false) => {
  clipN += 1;
  const id = `ct${clipN}`;
  return `<clipPath id="${id}"><path d="${TORSO}"/></clipPath><g clip-path="url(#${id})">${inner}</g>${withSleeves ? '' : ''}`;
};
const crew = (c2) => L('M104 158 Q120 170 136 158', c2, 3);
const TOPS = {
  tee_blue: () => `${SHORT_SLEEVES('#4f7fe0')}${P(TORSO, '#4f7fe0')}${crew('#2f5cb8')}${L('M84 236 Q120 246 156 236', '#2f5cb8', 2.5)}`,
  polo_green: () => `${SHORT_SLEEVES('#3fa36b')}${P(TORSO, '#3fa36b')}
    ${P('M104 156 L120 170 L112 178 L98 162 Z', '#e9f7ef')}${P('M136 156 L120 170 L128 178 L142 162 Z', '#e9f7ef')}
    ${L('M120 170 L120 198', '#2c7a4f', 2.5)}<circle cx="120" cy="182" r="2.2" fill="#e9f7ef"/><circle cx="120" cy="192" r="2.2" fill="#e9f7ef"/>`,
  hoodie_gray: () => `${LONG_SLEEVES('#8d96a8')}${CUFFS('#77809a')}${P(TORSO, '#8d96a8')}
    ${P('M88 162 Q120 192 152 162 Q146 150 120 150 Q94 150 88 162 Z', '#77809a')}
    ${L('M112 170 L110 196', '#f4f1ea', 2.5)}${L('M128 170 L130 196', '#f4f1ea', 2.5)}
    ${P('M98 212 L142 212 L146 236 L94 236 Z', '#7d869a')}`,
  tee_stripe: () => `${SHORT_SLEEVES('#f7f5f0')}${limb(84, 194, 81, 198, 27, '#2d3a66')}${limb(156, 194, 159, 198, 27, '#2d3a66')}
    ${P(TORSO, '#f7f5f0')}${clipTorso([170, 186, 202, 218, 234].map((y) => `<rect x="70" y="${y}" width="100" height="8" fill="#2d3a66"/>`).join(''))}
    ${P(TORSO, 'none')}${crew('#2d3a66')}`,
  sweater_knit: () => `${LONG_SLEEVES('#e0a33a')}${CUFFS('#c98a24')}${P(TORSO, '#e0a33a')}
    ${clipTorso(L('M76 196 L86 186 L96 196 L106 186 L116 196 L126 186 L136 196 L146 186 L156 196 L166 186', '#fff3d6', 3) + '<rect x="70" y="232" width="100" height="16" fill="#c98a24"/>')}
    ${P(TORSO, 'none')}${crew('#b57818')}`,
  school_shirt: () => `${SHORT_SLEEVES('#f8fafc')}${P(TORSO, '#f8fafc')}
    ${P('M102 154 L120 168 L110 180 L96 160 Z', '#ffffff')}${P('M138 154 L120 168 L130 180 L144 160 Z', '#ffffff')}
    ${P('M115 168 L125 168 L123 176 L117 176 Z', '#c8323f')}${P('M117 176 L123 176 L128 222 L120 232 L112 222 Z', '#c8323f')}
    ${L('M120 182 L120 228', '#a32631', 1.5)}<rect x="132" y="190" width="16" height="14" rx="2" fill="none" stroke="#cfd6e4" stroke-width="2"/>`,
  tee_star: () => `${SHORT_SLEEVES('#23233a')}${P(TORSO, '#23233a')}${star5(120, 200, 22, '#ffd54a', '#c99a10')}${crew('#3d3d5c')}`,
  hoodie_galaxy: () => `<defs><linearGradient id="gx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2b8f"/><stop offset=".55" stop-color="#7b3fbf"/><stop offset="1" stop-color="#d0559b"/></linearGradient></defs>
    ${LONG_SLEEVES('#5a33a6')}${CUFFS('#3b2b8f')}${P(TORSO, 'url(#gx)')}
    ${clipTorso([[94, 190, 1.6], [140, 182, 2], [128, 218, 1.4], [104, 226, 2.2], [150, 210, 1.3], [112, 202, 1.1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('') + star4(132, 196, 6, '#fff7c2'))}
    ${P(TORSO, 'none')}${P('M88 162 Q120 192 152 162 Q146 150 120 150 Q94 150 88 162 Z', '#3b2b8f')}`,
};

/* ---------------- BOTTOMS ---------------- */
const pantsLegs = (c, to = 294) => limb(107, 248, 106, to, 28, c) + limb(133, 248, 134, to, 28, c);
const BOTTOMS = {
  jeans: () => `${pantsLegs('#3b5b8f')}${P(HIPS, '#3b5b8f')}${L('M120 236 L120 256', '#2a4470', 2)}${L('M94 288 L118 288', '#6f8fc2', 2)}${L('M122 288 L146 288', '#6f8fc2', 2)}
    ${L('M88 238 Q96 244 104 238', '#6f8fc2', 1.8)}${L('M136 238 Q144 244 152 238', '#6f8fc2', 1.8)}`,
  skirt_pleated: () => `${P('M84 230 L156 230 L170 280 L70 280 Z', '#2f3e66')}${['M102 236 L94 278', 'M120 236 L120 278', 'M138 236 L146 278'].map((d) => L(d, '#465a8f', 2)).join('')}<rect x="84" y="228" width="72" height="8" rx="3" fill="#24304f" stroke="${OL}" stroke-width="${SW}"/>`,
  shorts_khaki: () => `${limb(107, 248, 106, 266, 30, '#c9a46a')}${limb(133, 248, 134, 266, 30, '#c9a46a')}${P(HIPS, '#c9a46a')}${L('M120 236 L120 254', '#a8864d', 2)}`,
  cargo: () => `${pantsLegs('#6b7449')}${P(HIPS, '#6b7449')}${P('M90 262 L104 262 L104 278 L90 278 Z', '#5a6239')}${P('M136 262 L150 262 L150 278 L136 278 Z', '#5a6239')}${L('M120 236 L120 256', '#4e5530', 2)}`,
  skirt_plaid: () => {
    clipN += 1; const id = `pl${clipN}`; const sk = 'M84 230 L156 230 L170 280 L70 280 Z';
    return `<clipPath id="${id}"><path d="${sk}"/></clipPath>${P(sk, '#b8323b')}<g clip-path="url(#${id})">
      ${[78, 96, 114, 132, 150].map((x) => `<rect x="${x}" y="226" width="6" height="60" fill="#7a1f27" opacity=".7"/>`).join('')}
      ${[240, 256, 270].map((y) => `<rect x="66" y="${y}" width="110" height="4" fill="#f6d36b" opacity=".85"/>`).join('')}</g>${P(sk, 'none')}
      <rect x="84" y="228" width="72" height="8" rx="3" fill="#7a1f27" stroke="${OL}" stroke-width="${SW}"/>`;
  },
};

/* ---------------- SHOES ---------------- */
const footPair = (shape) => shape + `<g transform="translate(36,0)">${shape}</g>`;
const SHOES = {
  sneaker_white: () => footPair(`${P('M86 306 Q84 292 98 290 L110 290 Q120 293 119 306 Z', '#fbfbfd')}${L('M86 306 L119 306', '#c3c8d6', 3)}${L('M96 296 L108 296', '#7aa7ff', 2.5)}`),
  canvas_black: () => footPair(`${P('M86 306 Q84 292 98 290 L110 290 Q120 293 119 306 Z', '#2c2c3a')}${L('M87 306 L118 306', '#f4f1ea', 3.5)}${P('M92 292 Q102 287 112 292 L111 296 L93 296 Z', '#f4f1ea')}`),
  boots_brown: () => footPair(`${P('M92 270 L118 270 L119 306 L85 306 Q84 296 92 292 Z', '#8a5a33')}${L('M92 278 L118 278', '#6b4224', 2.5)}${L('M86 306 L119 306', '#4a2d17', 3.5)}`),
  hightop_red: () => footPair(`${P('M92 276 L118 276 L119 306 L85 306 Q84 294 92 290 Z', '#d93a48')}<circle cx="111" cy="286" r="5" fill="#fff" stroke="${OL}" stroke-width="1.8"/>${L('M86 306 L119 306', '#f4f1ea', 3.5)}${L('M96 282 L108 282', '#fff', 1.8)}${L('M96 290 L106 290', '#fff', 1.8)}`),
  glow_sneaker: () => `<defs><filter id="gl" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <ellipse cx="102" cy="308" rx="20" ry="5" fill="#36e2ff" opacity=".55" filter="url(#gl)"/><ellipse cx="138" cy="308" rx="20" ry="5" fill="#36e2ff" opacity=".55" filter="url(#gl)"/>
    ${footPair(`${P('M86 306 Q84 292 98 290 L110 290 Q120 293 119 306 Z', '#1d2440')}${L('M87 305 L118 305', '#36e2ff', 3.5)}${L('M94 296 L110 296', '#ff5ccf', 2.5)}`)}`,
};

/* ---------------- HATS ---------------- */
const HATS = {
  cap_red: () => `${P('M66 86 C64 42 92 26 120 26 C148 26 176 42 174 86 Q120 74 66 86 Z', '#d93a48')}${L('M120 28 L120 78', '#b02a37', 2)}<circle cx="120" cy="28" r="4" fill="#b02a37" stroke="${OL}" stroke-width="1.8"/>
    ${P('M62 86 Q120 70 178 86 Q188 92 176 96 Q120 86 64 96 Q52 92 62 86 Z', '#b02a37')}`,
  beanie_teal: () => `${P('M64 92 C60 42 92 22 120 22 C148 22 180 42 176 92 Z', '#2bb0a6')}${[84, 100, 120, 140, 156].map((x) => L(`M${x} 34 L${x} 76`, '#1f8f86', 2)).join('')}
    <rect x="60" y="72" width="120" height="22" rx="10" fill="#1f8f86" stroke="${OL}" stroke-width="${SW}"/><circle cx="120" cy="18" r="10" fill="#f4f1ea" stroke="${OL}" stroke-width="${SW}"/>`,
  bucket_tan: () => `${P('M70 82 C70 40 94 26 120 26 C146 26 170 40 170 82 Z', '#d8b98a')}${P('M52 92 Q58 76 74 78 L166 78 Q182 76 188 92 Q120 104 52 92 Z', '#c4a170')}${L('M72 80 Q120 88 168 80', '#8f6f43', 2.5)}`,
  grad_cap: () => `${P('M76 78 C76 56 96 46 120 46 C144 46 164 56 164 78 Z', '#23233a')}${P('M120 24 L188 46 L120 66 L52 46 Z', '#2f2f4a')}<circle cx="120" cy="45" r="4" fill="#ffd54a" stroke="${OL}" stroke-width="1.8"/>
    ${L('M120 45 L176 52 L178 84', '#ffd54a', 2.5)}${P('M172 84 L184 84 L186 100 L170 100 Z', '#ffd54a')}`,
  wizard: () => `${P('M70 82 Q96 36 132 2 Q140 40 172 82 Z', '#5a3fb8')}${star5(122, 46, 8, '#ffd54a')}${star4(104, 66, 5, '#fff7c2')}${star4(146, 66, 4, '#fff7c2')}
    ${P('M50 86 Q120 66 190 86 Q120 100 50 86 Z', '#4a32a0')}`,
  pumpkin: () => `${P('M64 86 C60 46 88 30 120 30 C152 30 180 46 176 86 Q120 98 64 86 Z', '#f08a24')}${L('M92 36 Q86 60 90 88', '#c96a10', 2.5)}${L('M120 30 L120 92', '#c96a10', 2.5)}${L('M148 36 Q154 60 150 88', '#c96a10', 2.5)}
    ${P('M114 30 Q112 14 124 8 L128 12 Q120 18 124 30 Z', '#4a8f3a')}${P('M126 18 Q142 10 146 22 Q136 24 128 22 Z', '#5fae4b')}`,
  crown_vocab: () => `${P('M70 72 L76 30 L98 52 L120 20 L142 52 L164 30 L170 72 Q120 82 70 72 Z', '#ffcf3f')}${L('M72 64 Q120 74 168 64', '#d9a20f', 3)}
    <circle cx="120" cy="20" r="5" fill="#e8455a" stroke="${OL}" stroke-width="1.8"/><circle cx="76" cy="30" r="4" fill="#3fb8ff" stroke="${OL}" stroke-width="1.8"/><circle cx="164" cy="30" r="4" fill="#3fb8ff" stroke="${OL}" stroke-width="1.8"/>
    <rect x="110" y="54" width="20" height="13" rx="2" fill="#fff" stroke="${OL}" stroke-width="1.8"/>${L('M120 55 L120 66', '#d9a20f', 1.6)}`,
};

/* ---------------- GLASSES ---------------- */
const temples = L('M84 104 L70 100', OL, 2.5) + L('M156 104 L170 100', OL, 2.5);
const GLASSES = {
  round: () => `${temples}${both(`<circle cx="100" cy="106" r="14" fill="#e8f3ff" fill-opacity=".25" stroke="${OL}" stroke-width="3"/>`)}${L('M114 104 Q120 100 126 104', OL, 3)}`,
  sunglasses: () => `${temples}${both(P('M84 98 Q100 94 114 98 L112 112 Q100 120 88 112 Z', '#1d1d2b'))}${L('M114 100 L126 100', OL, 3)}${both('<path d="M90 101 L96 101" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-linecap="round"/>')}`,
  heart_shades: () => `${temples}${both(P('M100 120 C88 112 82 104 86 98 C90 92 98 94 100 99 C102 94 110 92 114 98 C118 104 112 112 100 120 Z', '#ff5c8a'))}${L('M114 101 L126 101', OL, 3)}`,
  visor: () => `${P('M78 96 Q120 88 162 96 L160 114 Q120 120 80 114 Z', '#36e2ff', 'fill-opacity=".55"')}${L('M84 104 L156 104', '#ffffff', 2, 'stroke-opacity=".6"')}${L('M78 100 L68 98', OL, 3)}${L('M162 100 L172 98', OL, 3)}`,
  grammar: () => `${temples}${both(`<rect x="85" y="94" width="30" height="24" rx="5" fill="#2bb0a6" fill-opacity=".25" stroke="#c99a10" stroke-width="3.5"/>`)}${L('M115 102 Q120 98 125 102', '#c99a10', 3)}${star4(120, 92, 5, '#ffd54a')}`,
};

/* ---------------- HEADPHONES (สวมพร้อมหมวกไม่ได้) ---------------- */
const phones = (band, cup, extra = '') => `${L('M64 104 C58 26 182 26 176 104', OL, 13)}${L('M64 104 C58 26 182 26 176 104', band, 8)}
  <rect x="52" y="86" width="22" height="38" rx="9" fill="${cup}" stroke="${OL}" stroke-width="${SW}"/><rect x="166" y="86" width="22" height="38" rx="9" fill="${cup}" stroke="${OL}" stroke-width="${SW}"/>${extra}`;
const HEADPHONES = {
  phones_basic: () => phones('#3a3f52', '#4d546b'),
  phones_neon: () => phones('#ff5ccf', '#36e2ff', `${L('M57 96 L57 114', '#fff', 2.5, 'stroke-opacity=".7"')}${L('M183 96 L183 114', '#fff', 2.5, 'stroke-opacity=".7"')}`),
  phones_cat: () => phones('#ffb3cf', '#ff8fb8', `${P('M74 54 L80 30 L96 44 Z', '#ffb3cf')}${P('M166 54 L160 30 L144 44 Z', '#ffb3cf')}${P('M80 44 L82 36 L88 42 Z', '#ff6f9f')}${P('M160 44 L158 36 L152 42 Z', '#ff6f9f')}`),
  phones_toeic: () => phones('#24305e', '#2f3f7a', `<rect x="56" y="94" width="14" height="22" rx="6" fill="#ffcf3f" stroke="${OL}" stroke-width="1.8"/><rect x="170" y="94" width="14" height="22" rx="6" fill="#ffcf3f" stroke="${OL}" stroke-width="1.8"/>
    ${L('M62 122 Q66 140 92 138', OL, 5)}${L('M62 122 Q66 140 92 138', '#24305e', 3)}<circle cx="94" cy="138" r="4.5" fill="#ffcf3f" stroke="${OL}" stroke-width="1.8"/>`),
};

/* ---------------- BACK ITEMS (เป้ / ผ้าคลุม) ---------------- */
const BAG = 'M72 160 Q120 144 168 160 L172 252 Q120 262 68 252 Z';
const straps = (c) => limb(97, 164, 94, 226, 9, c) + limb(143, 164, 146, 226, 9, c);
const BACKS = {
  backpack_school: { back: () => `${P(BAG, '#d93a48')}${P('M98 150 Q120 138 142 150 L142 160 L98 160 Z', '#b02a37')}`, front: () => straps('#b02a37') },
  backpack_explorer: { back: () => `${P(BAG, '#4f8f4a')}${P('M70 150 Q120 132 170 150 Q172 162 120 160 Q68 162 70 150 Z', '#c4a170')}`, front: () => `${straps('#3c6f38')}${L('M90 206 L100 206', '#c4a170', 4)}${L('M140 206 L150 206', '#c4a170', 4)}` },
  jetpack: {
    back: () => `<defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".6" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff3d6e" stop-opacity="0"/></linearGradient></defs>
      <path d="M50 262 Q66 312 82 262 Z" fill="url(#fl)"/><path d="M158 262 Q174 312 190 262 Z" fill="url(#fl)"/>
      ${P('M46 170 Q46 156 60 156 L72 156 Q86 156 86 170 L86 262 L46 262 Z', '#aab3c5')}${P('M154 170 Q154 156 168 156 L180 156 Q194 156 194 170 L194 262 L154 262 Z', '#aab3c5')}
      <rect x="50" y="200" width="32" height="10" fill="#36e2ff" stroke="${OL}" stroke-width="2"/><rect x="158" y="200" width="32" height="10" fill="#36e2ff" stroke="${OL}" stroke-width="2"/>`,
    front: () => straps('#5d6680'),
  },
  cape_c2: {
    back: () => `<defs><linearGradient id="cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b2a9a"/><stop offset="1" stop-color="#2a175f"/></linearGradient></defs>
      ${P('M78 160 Q120 148 162 160 L198 298 Q160 312 120 306 Q80 312 42 298 Z', 'url(#cp)')}${L('M44 296 Q80 308 120 302 Q160 308 196 296', '#ffcf3f', 3.5)}`,
    front: () => `${P('M100 158 L120 172 L140 158 L136 166 L120 180 L104 166 Z', '#4b2a9a')}<circle cx="120" cy="172" r="7" fill="#ffcf3f" stroke="${OL}" stroke-width="2"/><path d="M117 172 L120 168 L123 172 L120 176 Z" fill="#4b2a9a"/>`,
  },
};

/* ---------------- OUTERWEAR (สวมทับเสื้อ) ---------------- */
const panel = 'M80 166 Q98 156 110 158 L108 246 L84 244 Q74 204 80 166 Z';
const jacket = (c, trim, sleeve = c, len = 0) => {
  const p = len ? `M80 166 Q98 156 110 158 L108 ${246 + len} L80 ${244 + len} Q72 204 80 166 Z` : panel;
  return `${LONG_SLEEVES(sleeve)}${CUFFS(trim)}${both(P(p, c))}`;
};
const OUTER = {
  denim_jacket: () => `${jacket('#5f86c4', '#456aa6')}${both(P('M96 158 L112 160 L104 178 L92 168 Z', '#456aa6'))}${both(`<circle cx="104" cy="200" r="2.5" fill="#d9e4f7"/><circle cx="104" cy="222" r="2.5" fill="#d9e4f7"/>`)}${both(L('M86 210 L100 210', '#456aa6', 2))}`,
  lab_coat: () => `${jacket('#fbfbfd', '#dfe3ec', '#fbfbfd', 34)}${both(P('M96 158 L112 160 L106 184 L92 170 Z', '#eef1f6'))}${both(L('M88 238 L102 238', '#cfd6e4', 2))}<rect x="88" y="196" width="12" height="16" rx="2" fill="none" stroke="#cfd6e4" stroke-width="2"/>${L('M92 196 L92 190', '#4f7fe0', 2.5)}`,
  rank_jacket: () => `${jacket('#5a33a6', '#ffcf3f', '#f4f1ea')}${both(L('M110 160 L108 244', '#ffcf3f', 3.5))}${both(P('M96 158 L112 160 L104 176 L92 168 Z', '#ffcf3f'))}
    ${star5(94, 200, 9, '#ffcf3f')}${both(L('M84 240 L106 242', '#ffcf3f', 3))}`,
};

/* ---------------- ACCESSORIES ---------------- */
const ACCESSORIES = {
  watch: () => `<rect x="62" y="226" width="16" height="12" rx="3" fill="#3a3f52" stroke="${OL}" stroke-width="2" transform="rotate(14 70 232)"/><circle cx="70" cy="232" r="4.2" fill="#e8f3ff" stroke="${OL}" stroke-width="1.6"/>`,
  scarf_red: () => `${P('M98 156 Q120 172 142 156 L146 170 Q120 188 94 170 Z', '#d93a48')}${P('M128 176 L140 176 L144 214 L130 216 Z', '#d93a48')}${[184, 196, 208].map((y) => L(`M131 ${y} L142 ${y}`, '#b02a37', 2)).join('')}`,
  medal: () => `${P('M106 158 L116 196 L124 196 L134 158 L126 158 L120 184 L114 158 Z', '#3f7fe0')}<circle cx="120" cy="204" r="11" fill="#ffcf3f" stroke="${OL}" stroke-width="2.5"/>${star5(120, 204, 6, '#fff3b0', '#c99a10')}`,
};

/* ---------------- EFFECTS ---------------- */
const EFFECTS = {
  sparkles: { front: () => [[36, 70, 9], [206, 96, 11], [40, 200, 7], [204, 220, 9], [190, 40, 6], [52, 132, 5]].map(([x, y, r]) => star4(x, y, r, '#ffd54a')).join('') },
  books_float: {
    front: () => {
      const book = (x, y, c, rot) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 14}" y="${y - 10}" width="28" height="20" rx="2" fill="${c}" stroke="${OL}" stroke-width="2.2"/><rect x="${x - 11}" y="${y - 7}" width="22" height="14" fill="#fffaf0" stroke="${OL}" stroke-width="1.2"/><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 7}" stroke="${OL}" stroke-width="1.2"/></g>`;
      return book(34, 76, '#4f7fe0', -14) + book(206, 64, '#d93a48', 12) + book(212, 170, '#3fa36b', -8) + star4(28, 120, 5, '#ffd54a') + star4(214, 120, 4, '#ffd54a');
    },
  },
  aurora: {
    back: () => `<defs><radialGradient id="au" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7fffd4" stop-opacity=".75"/><stop offset=".55" stop-color="#68a9ff" stop-opacity=".35"/><stop offset="1" stop-color="#a781ff" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="120" cy="170" rx="118" ry="150" fill="url(#au)"/>`,
    front: () => star4(40, 60, 6, '#e0fff6') + star4(200, 80, 7, '#e0fff6') + star4(206, 250, 5, '#e0fff6'),
  },
  star_orbit: {
    back: () => `<ellipse cx="120" cy="200" rx="104" ry="26" fill="none" stroke="#ffd54a" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" transform="rotate(-12 120 200)" opacity=".8"/>`,
    front: () => `<path d="M18 218 A104 26 -12 0 0 222 176" fill="none" stroke="#ffd54a" stroke-width="3" stroke-linecap="round" transform="rotate(0)" opacity=".9"/>
      ${star5(28, 222, 9, '#ffd54a')}${star5(214, 172, 8, '#ffe999')}${star5(120, 234, 7, '#ffd54a')}`,
  },
};

/* ---------------- BACKGROUNDS ---------------- */
const BACKGROUNDS = {
  bg_sky: () => `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd4ff"/><stop offset="1" stop-color="#eaf6ff"/></linearGradient></defs>
    <rect width="240" height="320" fill="url(#sk)"/><g fill="#fff" opacity=".9"><ellipse cx="44" cy="58" rx="26" ry="11"/><ellipse cx="60" cy="50" rx="16" ry="11"/><ellipse cx="196" cy="34" rx="22" ry="9"/></g><rect y="292" width="240" height="28" fill="#bfe8c2"/>`,
  bg_library: () => `<rect width="240" height="320" fill="#f3e6cf"/>${[40, 112, 184].map((y) => `<rect x="0" y="${y}" width="240" height="8" fill="#a5784d"/>`).join('')}
    ${[[6, 0], [30, 0], [60, 0], [176, 0], [200, 0], [12, 72], [194, 72], [210, 144], [8, 144], [34, 144]].map(([x, r], i) => `<rect x="${x}" y="${[12, 84, 156][i % 3]}" width="${14 + (i % 3) * 3}" height="${28 - (i % 2) * 6}" fill="${['#d26b5a', '#5b8bd0', '#6aa86b', '#d9a441'][i % 4]}" opacity=".85"/>`).join('')}<rect y="292" width="240" height="28" fill="#c9a77d"/>`,
  bg_sunset: () => `<defs><linearGradient id="ss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset=".55" stop-color="#ffc48a"/><stop offset="1" stop-color="#ffe7b8"/></linearGradient></defs>
    <rect width="240" height="320" fill="url(#ss)"/><circle cx="182" cy="96" r="30" fill="#fff1c1" opacity=".9"/><path d="M0 250 Q60 226 120 246 Q180 266 240 240 L240 320 L0 320 Z" fill="#e88f6e" opacity=".55"/>`,
  bg_space: () => `<rect width="240" height="320" fill="#1b1838"/>${[[20, 30], [60, 80], [200, 40], [220, 140], [30, 180], [180, 260], [90, 20], [140, 300], [14, 280], [226, 220]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity=".9"/>`).join('')}
    <circle cx="198" cy="72" r="18" fill="#a781ff"/><ellipse cx="198" cy="72" rx="30" ry="7" fill="none" stroke="#ffd54a" stroke-width="2.5" transform="rotate(-18 198 72)"/>`,
};

const SKINS = {
  body_light: ['#f6d3b3', '#e2ad86'], body_warm: ['#e8b48c', '#cc8f63'], body_tan: ['#c98e62', '#a8703f'], body_deep: ['#8d5a3b', '#6d4126'],
};

module.exports = {
  LAYER_Z, OL, body, FACES, HAIR, TOPS, BOTTOMS, SHOES, HATS, GLASSES, HEADPHONES, BACKS, OUTER, ACCESSORIES, EFFECTS, BACKGROUNDS, SKINS,
};
