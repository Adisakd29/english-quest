/* =====================================================================
   HALLOWEEN ADVENTURE 2026 — หน้ากิจกรรมแบบแผนที่ผจญภัย 4 Chapter + ปราสาทราชาฟักทอง
   - เวลา/ภารกิจ/ปลดล็อก/ตรวจคำตอบ/สิทธิ์รับรางวัล ตัดสินที่เซิร์ฟเวอร์ทั้งหมด
     (ฝั่งนี้ใช้เวลาเซิร์ฟเวอร์ + ส่วนต่างนาฬิกา แค่แสดงนับถอยหลัง/เวลาด่าน)
   - ภาพประกอบเป็น SVG ล้วน (public/js/hwart.js) · ไม่ใช้อีโมจิ
   - แอนิเมชันใช้ transform/opacity · หยุดเมื่ออยู่นอกจอ · ปิดเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว"
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const A = () => window.EQHalloweenArt;
  const esc = (s) => App().escapeHtml(String(s == null ? '' : s));
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const MAIN_EVENT = 'halloween-2026';
  const LEVEL_TH = { medium: 'ปานกลาง', hard: 'ยาก', precision: 'ความแม่นยำ', special: 'พิเศษ · ยาก', combo: 'ผสมทักษะ', final: 'Final' };
  const KIND_TH = { halloween: 'คำศัพท์ฮาโลวีน', vocab: 'แปลคำศัพท์', vocabRev: 'ไทย → อังกฤษ', context: 'เติมคำในประโยค', grammar: 'แกรมม่า', spell: 'สะกดคำ' };
  const WIDE = () => window.matchMedia('(min-width: 980px)').matches;
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { list: null, state: null, offset: 0, timer: null, selected: null, io: null, open: null };
  const serverNow = () => Date.now() + S.offset;
  const setOffset = (iso) => { if (iso) S.offset = new Date(iso).getTime() - Date.now(); };

  /* =====================================================================
     แผนที่ผจญภัย (viewBox 400 × 1790)
     ===================================================================== */
  const MAP_H = 1790;
  const REGIONS = [
    { id: 'c1', art: 'village', y0: 0, y1: 330, sky: ['#3A1D55', '#5B2A4C'] },
    { id: 'c2', art: 'forest', y0: 330, y1: 680, sky: ['#1C2445', '#143430'] },
    { id: 'c3', art: 'mansion', y0: 680, y1: 1030, sky: ['#1F1A46', '#2C2163'] },
    { id: 'c4', art: 'graveyard', y0: 1030, y1: 1400, sky: ['#0F2A3B', '#17384C'] },
    { id: 'final', art: 'castle', y0: 1400, y1: MAP_H, sky: ['#2A0F2E', '#4C1522'] },
  ];
  // ลำดับจุดบนเส้นทาง (เหรียญ Chapter = med · ด่าน = stage)
  const NODES = [
    { id: 'start', x: 40, y: 60, type: 'start' },
    { id: 'c1', x: 120, y: 175, type: 'med' },
    { id: 'c2', x: 285, y: 405, type: 'med' },
    { id: 'c2-1', x: 205, y: 485, type: 'stage' }, { id: 'c2-2', x: 115, y: 548, type: 'stage' }, { id: 'c2-3', x: 175, y: 628, type: 'stage' },
    { id: 'c3', x: 110, y: 745, type: 'med' },
    { id: 'c3-1', x: 200, y: 812, type: 'stage' }, { id: 'c3-2', x: 292, y: 868, type: 'stage' }, { id: 'c3-3', x: 255, y: 945, type: 'stage' },
    { id: 'c3-p', x: 160, y: 990, type: 'stage' },
    { id: 'c4', x: 290, y: 1088, type: 'med' },
    { id: 'c4-1', x: 200, y: 1152, type: 'stage' }, { id: 'c4-2', x: 108, y: 1210, type: 'stage' }, { id: 'c4-3', x: 150, y: 1290, type: 'stage' },
    { id: 'c4-4', x: 250, y: 1330, type: 'stage' }, { id: 'c4-m', x: 322, y: 1380, type: 'stage' },
    { id: 'f-1', x: 92, y: 1468, type: 'stage' }, { id: 'f-2', x: 318, y: 1530, type: 'stage' }, { id: 'f-3', x: 110, y: 1612, type: 'stage' },
    { id: 'final', x: 200, y: 1700, type: 'med' },
  ];

  /** Catmull-Rom -> เส้นโค้ง Bezier ต่อเนื่อง · upto = จำนวนช่วงที่วาด */
  function splinePath(pts, upto = pts.length - 1) {
    if (pts.length < 2 || upto < 1) return '';
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < Math.min(upto, pts.length - 1); i++) {
      const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
    }
    return d;
  }

  /* ---------- ภาพประกอบแต่ละพื้นที่ ---------- */
  function cottage(x, y, s, roof = '#4A1F3A') {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-30" y="-6" width="60" height="44" fill="#2B1636"/>
      <path d="M-38 -4 L0 -40 L38 -4z" fill="${roof}"/><rect x="14" y="-36" width="9" height="18" fill="#2B1636"/>
      <rect x="-22" y="6" width="13" height="13" rx="2" fill="#FFC46B" class="hw-win"/><rect x="9" y="6" width="13" height="13" rx="2" fill="#FFC46B"/>
      <path d="M-22 12.5 h13 M-15.5 6 v13 M9 12.5 h13 M15.5 6 v13" stroke="#2B1636" stroke-width="1.6"/>
      <path d="M-6 38 v-14 a6 6 0 0 1 12 0 v14z" fill="#6A3A1E"/>
    </g>`;
  }
  function tree(x, y, s, flip = false) {
    return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" fill="#0B1620">
      <path d="M-8 0 C-6 -40 -12 -70 -2 -110 C2 -80 6 -40 8 0z"/>
      <path d="M-4 -60 C-20 -70 -34 -66 -46 -82 C-30 -76 -18 -80 -6 -72z"/>
      <path d="M-2 -86 C10 -100 26 -98 36 -116 C26 -100 14 -92 2 -78z"/>
      <path d="M0 -40 C14 -46 26 -40 40 -52 C30 -38 16 -36 2 -32z"/>
      <path d="M-46 -82 q-6 -6 -4 -14 M36 -116 q8 -2 8 -10" stroke="#0B1620" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>`;
  }
  function mushroom(x, y, s, c = '#8CF5E4') {
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="-6" rx="16" ry="8" fill="url(#hwMagic)" class="hw-glow"/>
      <rect x="-2" y="-8" width="4" height="10" fill="#D9D2F2"/><path d="M-9 -7 a9 7 0 0 1 18 0z" fill="${c}"/>
      <circle cx="-3" cy="-10" r="1.4" fill="#fff" opacity=".8"/><circle cx="3" cy="-9" r="1" fill="#fff" opacity=".8"/></g>`;
  }
  function tomb(x, y, s, cross = false) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${cross ? '<path d="M-3 -34 h6 v10 h10 v6 h-10 v20 h-6 v-20 h-10 v-6 h10z" fill="#3C4A63"/>'
    : '<path d="M-12 0 V-22 a12 12 0 0 1 24 0 V0z" fill="#3C4A63"/><path d="M-6 -20 h12 M-6 -14 h12" stroke="#2A3449" stroke-width="2"/>'}
      <ellipse cy="1" rx="16" ry="3" fill="#0A1A24" opacity=".7"/></g>`;
  }
  function crystal(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="-8" rx="22" ry="12" fill="url(#hwMagic)" class="hw-glow"/>
      <path d="M0 -30 L8 -10 L0 0 L-8 -10z" fill="#7FF5E1"/><path d="M0 -30 L8 -10 L0 0z" fill="#3FC7B4"/>
      <path d="M-12 -14 L-6 -4 L-12 2 L-18 -4z" fill="#A98BFF"/><path d="M12 -16 L17 -6 L12 1 L7 -6z" fill="#7FF5E1" opacity=".85"/></g>`;
  }
  function mansion(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <g fill="#140F2E">
        <rect x="0" y="40" width="150" height="110"/><path d="M-6 42 L40 0 L86 42z"/><path d="M70 42 L112 6 L156 42z"/>
        <rect x="118" y="-10" width="28" height="60"/><path d="M114 -8 L132 -48 L150 -8z"/>
        <rect x="56" y="120" width="38" height="30"/><path d="M50 122 L75 104 L100 122z"/>
      </g>
      <g fill="#FFC46B" class="hw-win">
        <rect x="16" y="58" width="12" height="18" rx="6"/><rect x="44" y="58" width="12" height="18" rx="6"/>
        <rect x="96" y="58" width="12" height="18" rx="6"/><rect x="124" y="8" width="10" height="16" rx="5"/>
      </g>
      <g fill="#7A5CC9" opacity=".85"><rect x="16" y="96" width="12" height="18" rx="2"/><rect x="122" y="96" width="12" height="18" rx="2"/></g>
      <rect x="68" y="128" width="14" height="22" rx="7" fill="#3A2210"/>
      <circle cx="40" cy="22" r="7" fill="#FFC46B" class="hw-win"/>
    </g>`;
  }
  function kingCastle(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="120" rx="150" ry="40" fill="url(#hwEmber)" class="hw-glow"/>
      <g fill="#1A0A1E">
        <rect x="-110" y="20" width="36" height="120"/><path d="M-116 22 L-92 -26 L-68 22z"/>
        <rect x="74" y="20" width="36" height="120"/><path d="M68 22 L92 -26 L116 22z"/>
        <rect x="-74" y="50" width="148" height="90"/>
        <path d="M-74 50 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h6 v-10 h4 v10z"/>
      </g>
      <g transform="translate(0 6)">
        <ellipse cx="-26" cy="0" rx="26" ry="34" fill="#C24F0A"/><ellipse cx="26" cy="0" rx="26" ry="34" fill="#C24F0A"/>
        <ellipse cx="0" cy="0" rx="30" ry="38" fill="#FF7B1C"/>
        <g fill="#FFE08A" class="hw-pkface"><path d="M-20 -6 l9 -12 l9 12z"/><path d="M2 -6 l9 -12 l9 12z"/>
          <path d="M-22 10 l7 7 l7 -5 l7 5 l7 -5 l7 5 l7 -7 q-21 20 -42 0z"/></g>
        <path d="M-22 -36 l7 -16 l8 10 l7 -16 l7 16 l8 -10 l7 16z" fill="#FFD166" stroke="#C99A2E" stroke-width="1.5"/>
        <circle cx="0" cy="-48" r="3" fill="#FF6A8A"/>
      </g>
      <g fill="#FFB547" class="hw-win"><rect x="-98" y="40" width="10" height="16" rx="5"/><rect x="88" y="40" width="10" height="16" rx="5"/>
        <rect x="-60" y="80" width="10" height="14" rx="5"/><rect x="50" y="80" width="10" height="14" rx="5"/></g>
      <path d="M-18 140 v-30 a18 18 0 0 1 36 0 v30z" fill="#3A1408"/>
    </g>`;
  }
  function regionArt(r) {
    const a = A(); const y0 = r.y0;
    const sky = `<rect x="0" y="${y0}" width="400" height="${r.y1 - y0 + 2}" fill="url(#evSky-${r.id})"/>`;
    if (r.art === 'village') {
      return `${sky}<g fill="#FFF6D8" class="hw-tw">${a.stars(11, 18, 400, 140)}</g>${a.moon(335, 58, 22)}
        <path d="M0 260 Q90 222 200 244 T400 236 V330 H0z" fill="#2A1438"/>
        ${cottage(250, 205, 1)}${cottage(345, 232, 0.78, '#3D2050')}${cottage(38, 268, 0.6, '#3D2050')}
        <path d="M196 150 Q290 186 392 158" stroke="#2B1636" stroke-width="1.4" fill="none"/>
        <g class="hw-glow">${[220, 252, 286, 320, 356].map((lx, i) => `<circle cx="${lx}" cy="${163 + (i % 2) * 5}" r="4.5" fill="${i % 2 ? '#FFB547' : '#FF7B1C'}"/>`).join('')}</g>
        <g fill="#2B1636">${Array.from({ length: 12 }, (_, i) => `<rect x="${8 + i * 16}" y="306" width="5" height="22" rx="2"/>`).join('')}<rect x="6" y="312" width="190" height="4"/></g>
        ${a.pumpkin(70, 300, 0.62)}${a.pumpkin(200, 312, 0.45, { glow: false })}${a.pumpkin(372, 304, 0.55)}`;
    }
    if (r.art === 'forest') {
      return `${sky}<g transform="translate(0 ${y0})"><g fill="#E9F3C8" class="hw-tw hw-tw2">${a.stars(37, 10, 400, 60)}</g></g>
        ${tree(30, 690, 1.2)}${tree(392, 520, 1, true)}${tree(372, 690, 0.8, true)}${tree(-6, 470, 0.8)}
        <path d="M300 590 C330 600 352 640 380 640 M60 452 C40 470 50 500 24 510" stroke="#3E6B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${a.pumpkin(330, 572, 1.15)}${a.pumpkin(64, 430, 0.8)}${a.pumpkin(260, 664, 0.5, { glow: false })}
        ${mushroom(40, 610, 1)}${mushroom(250, 560, 0.8, '#C3A4FF')}${mushroom(360, 470, 0.9)}${mushroom(150, 680, 0.7, '#C3A4FF')}
        <g class="hw-tw" fill="#F8F28C">${[[80, 380], [150, 470], [240, 420], [330, 380], [60, 520], [300, 640], [220, 600]].map(([fx, fy]) => `<circle cx="${fx}" cy="${fy}" r="2.2"/>`).join('')}</g>`;
    }
    if (r.art === 'mansion') {
      return `${sky}<g transform="translate(0 ${y0})"><g fill="#FFF6D8" class="hw-tw">${a.stars(53, 12, 400, 80)}</g></g>
        <path d="M0 980 Q120 940 220 960 T400 950 V1030 H0z" fill="#16102F"/>
        ${mansion(238, 700, 1)}
        ${tree(30, 1028, 0.9)}
        ${a.ghost(58, 845, 1.1, 'hw-float')}${a.ghost(360, 975, 0.85, 'hw-float hw-float2')}
        ${a.bat(300, 712, 0.55, 'hw-fly')}${a.bat(200, 730, 0.45, 'hw-fly hw-fly2')}`;
    }
    if (r.art === 'graveyard') {
      return `${sky}<g transform="translate(0 ${y0})"><g fill="#D8F7FF" class="hw-tw hw-tw2">${a.stars(71, 12, 400, 70)}</g></g>
        <g stroke="#2A3C55" stroke-width="3">${Array.from({ length: 14 }, (_, i) => `<path d="M${10 + i * 28} 1060 v-26 l3 -6 l3 6"/>`).join('')}<path d="M6 1046 H394"/></g>
        ${tomb(56, 1110, 1)}${tomb(368, 1182, 0.9, true)}${tomb(40, 1340, 1.1, true)}${tomb(362, 1290, 0.85)}${tomb(96, 1392, 0.8)}${tomb(214, 1240, 0.7)}
        ${crystal(52, 1262, 1)}${crystal(354, 1236, 0.85)}${crystal(250, 1400, 0.6)}
        <g class="hw-spin" style="transform-origin:322px 1380px"><ellipse cx="322" cy="1380" rx="44" ry="16" fill="none" stroke="#7FF5E1" stroke-width="1.6" stroke-dasharray="4 6" opacity=".7"/></g>
        <g class="hw-float hw-float3" fill="#9FF7EA">${[[150, 1100], [300, 1220], [70, 1180], [240, 1300]].map(([wx, wy]) => `<circle cx="${wx}" cy="${wy}" r="3.4" opacity=".8"/><circle cx="${wx}" cy="${wy}" r="8" fill="url(#hwMagic)"/>`).join('')}</g>`;
    }
    return `${sky}<g transform="translate(0 ${y0})"><g fill="#FFD8C8" class="hw-tw">${a.stars(97, 14, 400, 90)}</g></g>
      ${kingCastle(200, 1470, 0.95)}
      ${a.bat(120, 1430, 0.7, 'hw-fly')}${a.bat(290, 1418, 0.55, 'hw-fly hw-fly2')}${a.bat(340, 1460, 0.45, 'hw-fly hw-fly3')}
      ${a.pumpkin(40, 1762, 0.7)}${a.pumpkin(362, 1758, 0.75)}
      <g class="hw-tw" fill="#FFB547">${[[60, 1560], [340, 1600], [250, 1650], [150, 1700]].map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="2"/>`).join('')}</g>`;
  }

  /* ---------- สถานะของจุดบนแผนที่ ---------- */
  function nodeState(st, n) {
    if (n.type === 'start') return 'done';
    if (n.type === 'med') {
      const ch = st.chapters.find((c) => c.id === n.id);
      if (!ch.unlocked) return 'locked';
      return ch.complete ? 'done' : 'current';
    }
    const s = st.stages[n.id];
    if (!s) return 'locked';
    if (s.passed) return 'done';
    return s.available ? 'ready' : 'locked';
  }
  function stageNo(sid) {
    if (sid.endsWith('-p')) return 'timer';
    if (sid.endsWith('-m')) return 'combine';
    return null;
  }
  function medallion(st, n, state) {
    const ch = st.chapters.find((c) => c.id === n.id);
    const done = ch.missions.filter((m) => m.done).length;
    const frac = ch.missions.length ? done / ch.missions.length : 0;
    const C = 2 * Math.PI * 27;
    const label = ch.final ? 'Final Challenge' : `Chapter ${ch.no}`;
    const inner = state === 'locked' ? `<use href="/assets/icons/icons.svg#lock" x="-11" y="-11" width="22" height="22" class="ev-med-ico"/>`
      : ch.final ? `<use href="/assets/icons/icons.svg#crown" x="-13" y="-13" width="26" height="26" class="ev-med-ico"/>`
        : `<text class="ev-med-num" y="9">${ch.no}</text>`;
    const px = Math.max(84, Math.min(316, n.x));
    return `<g class="ev-node ev-med is-${state}" data-ch="${ch.id}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button"
        aria-label="${esc(`${label} ${ch.title} — ${ch.place} · ${state === 'locked' ? 'ยังไม่ปลดล็อก' : `ภารกิจ ${done}/${ch.missions.length}`}`)}">
        ${state === 'current' ? '<circle r="40" class="ev-med-pulse"/>' : ''}
        <circle r="34" class="ev-hit"/>
        <circle r="30" class="ev-med-base"/>
        <circle r="27" class="ev-med-track"/>
        <circle r="27" class="ev-med-ring" transform="rotate(-90)" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>
        ${inner}
      </g>
      <g class="ev-plaque is-${state}" transform="translate(${px} ${n.y + 50})" aria-hidden="true">
        <rect x="-78" y="-15" width="156" height="36" rx="10"/>
        <text class="ev-pl-1" y="-1">${esc(label)}</text>
        <text class="ev-pl-2" y="14">${esc(ch.place)}${state === 'locked' ? '' : ` · ${done}/${ch.missions.length}`}</text>
      </g>`;
  }
  function stageNode(st, n, state) {
    const s = st.stages[n.id];
    const icon = state === 'done' ? 'check' : state === 'locked' ? 'lock' : stageNo(n.id);
    const idx = n.id.split('-')[1];
    const inner = icon ? `<use href="/assets/icons/icons.svg#${icon}" x="-9" y="-9" width="18" height="18" class="ev-st-ico"/>`
      : `<text class="ev-st-num" y="5">${esc(n.id.startsWith('f') ? `F${idx}` : idx)}</text>`;
    return `<g class="ev-node ev-st is-${state}" data-stage="${n.id}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button"
        aria-label="${esc(`ด่าน ${s ? s.name : n.id} — ${state === 'done' ? 'ผ่านแล้ว' : state === 'ready' ? 'เล่นได้' : 'ยังไม่ปลดล็อก'}`)}">
        ${state === 'ready' ? '<circle r="24" class="ev-st-pulse"/>' : ''}
        <circle r="24" class="ev-hit"/>
        <circle r="17" class="ev-st-base"/>
        ${inner}
      </g>`;
  }
  function mapSvg(st) {
    const states = NODES.map((n) => nodeState(st, n));
    let lastDone = 0;
    for (let i = 0; i < NODES.length; i++) { if (states[i] === 'done') lastDone = i; else break; }
    const meIdx = Math.min(NODES.length - 1, states.findIndex((s, i) => i > 0 && s !== 'done'));
    const me = NODES[meIdx < 0 ? NODES.length - 1 : meIdx];
    const grads = REGIONS.map((r) => `<linearGradient id="evSky-${r.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.sky[0]}"/><stop offset="1" stop-color="${r.sky[1]}"/></linearGradient>`).join('');
    const regions = REGIONS.map((r) => {
      const ch = st.chapters.find((c) => c.id === r.id);
      const locked = !ch.unlocked;
      return `<g class="ev-region ${locked ? 'is-locked' : ''}" data-region="${r.id}">${regionArt(r)}
        ${locked ? `<rect x="0" y="${r.y0}" width="400" height="${r.y1 - r.y0}" class="ev-fog-lock"/>` : ''}</g>`;
    }).join('');
    const seams = REGIONS.slice(1).map((r) => `<rect x="-20" y="${r.y0 - 22}" width="440" height="44" fill="url(#hwFog)" opacity=".9"/>`).join('');
    const full = splinePath(NODES);
    const done = splinePath(NODES, lastDone);
    const nodes = NODES.map((n, i) => (n.type === 'med' ? medallion(st, n, states[i]) : n.type === 'stage' ? stageNode(st, n, states[i]) : '')).join('');
    const start = `<g transform="translate(${NODES[0].x} ${NODES[0].y})" aria-hidden="true"><circle r="9" fill="#FFD166"/><circle r="15" fill="none" stroke="#FFD166" stroke-opacity=".4" stroke-width="2"/></g>`;
    const meMark = st.status === 'active' && !st.complete ? `<g class="ev-me" transform="translate(${me.x} ${me.y - (me.type === 'med' ? 44 : 30)})" aria-hidden="true">
        <g class="ev-me-bob"><path d="M0 14 L-8 2 h16z" fill="#FFD166"/><circle r="12" fill="#FFD166"/>${A().pumpkin(0, -2, 0.36, { glow: false })}</g></g>` : '';
    return `<svg class="ev-map-svg" viewBox="0 0 400 ${MAP_H}" role="group" aria-label="แผนที่การผจญภัย 4 Chapter และปราสาทราชาฟักทอง">
      <defs>${grads}</defs>
      ${regions}${seams}
      <path d="${full}" class="ev-path-under"/>
      <path d="${full}" class="ev-path"/>
      ${done ? `<path d="${done}" class="ev-path-done"/>` : ''}
      ${start}${nodes}${meMark}
    </svg>`;
  }

  /* ---------- ตัวจับการแสดงผลนอกจอ: แอนิเมชันหยุดเมื่อพื้นที่นั้นไม่อยู่บนจอ ---------- */
  function watchRegions(root) {
    if (S.io) S.io.disconnect();
    if (!('IntersectionObserver' in window)) return;
    S.io = new IntersectionObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle('ev-off', !en.isIntersecting));
    }, { rootMargin: '120px 0px' });
    root.querySelectorAll('.ev-region').forEach((g) => S.io.observe(g));
  }

  /* =====================================================================
     นับถอยหลัง
     ===================================================================== */
  function parts(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
  }
  const pad = (n) => String(n).padStart(2, '0');
  function countdownHtml(st) {
    const target = st.status === 'upcoming' ? st.startsAt : st.endsAt;
    const label = st.status === 'upcoming' ? 'เริ่มกิจกรรมใน' : st.status === 'active' ? 'เหลือเวลาอีก' : 'กิจกรรมสิ้นสุดแล้ว';
    if (st.status === 'ended') return `<div class="ev-count ended"><span class="ev-count-label">${ICON('hourglass', 'icon icon-sm')} ${label}</span></div>`;
    const p = parts(new Date(target).getTime() - serverNow());
    const box = (v, u, k) => `<span class="ev-cbox"><b data-cd="${k}">${v}</b><small>${u}</small></span>`;
    return `<div class="ev-count" data-target="${esc(target)}" role="timer" aria-label="${label}">
      <span class="ev-count-label">${ICON('clock', 'icon icon-sm')} ${label}</span>
      <div class="ev-cboxes">${box(p.d, 'วัน', 'd')}${box(pad(p.h), 'ชั่วโมง', 'h')}${box(pad(p.m), 'นาที', 'm')}${box(pad(p.s), 'วินาที', 's')}</div>
    </div>`;
  }
  function startTicker() {
    stopTicker();
    S.timer = setInterval(() => {
      const scr = document.getElementById('screen-event');
      if (!scr || scr.classList.contains('hidden')) { stopTicker(); return; }
      const el = document.querySelector('#ev-root .ev-count[data-target]');
      if (!el) return;
      const left = new Date(el.dataset.target).getTime() - serverNow();
      if (left <= 0) { stopTicker(); setTimeout(() => open(), 1200); return; }   // ถึงเวลาเปิด/ปิด -> ถามเซิร์ฟเวอร์ใหม่
      const p = parts(left);
      const set = (k, v) => { const b = el.querySelector(`[data-cd="${k}"]`); if (b && b.textContent !== String(v)) b.textContent = v; };
      set('d', p.d); set('h', pad(p.h)); set('m', pad(p.m)); set('s', pad(p.s));
    }, 1000);
  }
  function stopTicker() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  /* =====================================================================
     รายละเอียด Chapter (แผงด้านข้างบนจอกว้าง / แผ่นเลื่อนขึ้นบนมือถือ)
     ===================================================================== */
  const MISSION_GO = { rounds: { label: 'ไปเล่น', to: 'learn' }, correct: { label: 'ไปตอบคำถาม', to: 'learn' }, goodRounds: { label: 'ไปเล่น', to: 'learn' } };
  function stageRow(st, sid) {
    const s = st.stages[sid];
    const tag = s.passed ? `<span class="ev-done">${ICON('circle-check', 'icon icon-sm')} ผ่านแล้ว</span>`
      : s.available ? `<button class="btn btn-primary ev-st-btn" type="button" data-ev-stage="${sid}">${ICON('play', 'icon icon-sm')} เล่น</button>`
        : `<span class="ev-lock-tag">${ICON('lock', 'icon icon-sm')}</span>`;
    const replay = s.passed && st.status === 'active' ? `<button class="mini-btn ghost ev-replay" type="button" data-ev-stage="${sid}">เล่นซ้ำ</button>` : '';
    return `<li class="ev-stage-row ${s.passed ? 'done' : s.available ? 'ready' : 'locked'}">
      <button class="ev-stage-info" type="button" data-ev-stage-info="${sid}">
        <b>${esc(s.name)}</b>
        <small>${esc(LEVEL_TH[s.level] || s.level)} · ${s.questions} ข้อ · ผ่าน ${s.pass}/${s.questions} · ${Math.round(s.timeLimitSec / 60 * 10) / 10} นาที${s.best ? ` · ดีที่สุด ${s.best}` : ''}</small>
        ${!s.available && !s.passed && s.lockedReason ? `<small class="ev-why">${esc(s.lockedReason)}</small>` : ''}
      </button>
      <span class="ev-stage-act">${tag}${replay}</span>
    </li>`;
  }
  function missionHtml(st, m, ch) {
    const pct = Math.round((m.progress / m.target) * 100);
    let side = '';
    if (m.done) side = `<span class="ev-done">${ICON('circle-check', 'icon icon-sm')} สำเร็จ</span>`;
    else if (st.status === 'active' && ch.unlocked && MISSION_GO[m.kind]) side = `<button class="btn btn-secondary ev-m-btn" type="button" data-ev-go="${MISSION_GO[m.kind].to}">${MISSION_GO[m.kind].label}</button>`;
    return `<li class="ev-m ${m.done ? 'done' : ''} ${ch.unlocked ? '' : 'locked'}">
      <span class="ev-m-icon">${ICON(m.done ? 'check' : (m.icon || 'star'))}</span>
      <div class="ev-m-body">
        <h4>${esc(m.title)}</h4>${m.desc ? `<p>${esc(m.desc)}</p>` : ''}
        <div class="ev-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.target}" aria-valuenow="${m.progress}" aria-label="${esc(m.title)}">
          <span style="transform:scaleX(${pct / 100})"></span></div>
        ${m.kind === 'stages' ? `<ol class="ev-stage-list">${m.stages.map((sid) => stageRow(st, sid)).join('')}</ol>` : ''}
      </div>
      <div class="ev-m-side"><b class="ev-m-count">${m.progress}/${m.target}</b>${side}</div>
    </li>`;
  }
  function chapterHtml(st, chId) {
    const ch = st.chapters.find((c) => c.id === chId) || st.chapters[0];
    const prev = st.chapters[st.chapters.indexOf(ch) - 1];
    const status = ch.complete ? `<span class="ev-chip ok">${ICON('circle-check', 'icon icon-sm')} สำเร็จ</span>`
      : ch.unlocked ? `<span class="ev-chip cur">${ICON('flame', 'icon icon-sm')} กำลังผจญภัย</span>`
        : `<span class="ev-chip lock">${ICON('lock', 'icon icon-sm')} ยังไม่ปลดล็อก</span>`;
    const lockNote = !ch.unlocked && prev ? `<p class="ev-note">${ICON('lock', 'icon icon-sm')} ทำภารกิจของ ${esc(prev.final ? 'Final' : `Chapter ${prev.no}`)} ให้ครบเพื่อปลดล็อก</p>` : '';
    const countNote = ch.unlocked && !ch.final && ch.no > 1 ? '<p class="ev-note">รอบเกมและคำตอบที่ถูก นับตั้งแต่ Chapter นี้ปลดล็อก</p>' : '';
    return `<div class="ev-ch ev-art-${ch.art}">
      <div class="ev-ch-head">
        <span class="ev-ch-badge">${ch.final ? ICON('crown') : `<b>${ch.no}</b>`}</span>
        <div class="ev-ch-title"><small>${esc(ch.final ? 'Final Challenge' : `Chapter ${ch.no}`)} · ${esc(ch.place)}</small><h3 id="ev-ch-title">${esc(ch.title)}</h3></div>
        ${status}
      </div>
      ${lockNote}${countNote}
      <ol class="ev-missions">${ch.missions.map((m) => missionHtml(st, m, ch)).join('')}</ol>
      ${ch.final && st.complete ? '<p class="ev-note ev-note-gold">ผ่านการผจญภัยครบแล้ว รับ Halloween Theme 2026 ได้ที่ด้านล่าง</p>' : ''}
    </div>`;
  }
  function selectChapter(chId, { fromTap = false } = {}) {
    S.selected = chId;
    const st = S.state;
    if (!st) return;
    document.querySelectorAll('#ev-root .ev-med').forEach((g) => g.classList.toggle('is-selected', g.dataset.ch === chId));
    if (WIDE()) {
      const panel = document.getElementById('ev-panel');
      if (panel) panel.innerHTML = chapterHtml(st, chId);
      return;
    }
    if (!fromTap) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay ev-modal';
    ov.innerHTML = `<div class="modal-card ev-sheet" aria-labelledby="ev-ch-title">${chapterHtml(st, chId)}</div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { variant: 'sheet' });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-ev-stage],[data-ev-go],[data-ev-stage-info]')) setTimeout(() => ov.remove(), 0); });
  }

  /* =====================================================================
     หน้ากิจกรรม
     ===================================================================== */
  function themePreview() {
    return `<div class="ev-tp" aria-hidden="true">
      <svg class="ev-tp-web" viewBox="0 0 60 60">${A().web(60, 'tr', 'rgba(230,222,255,.45)')}</svg>
      <div class="ev-tp-hud"><span class="ev-tp-dot"></span><span class="ev-tp-line w40"></span><span class="ev-tp-pill">Lv 12</span></div>
      <div class="ev-tp-card"><span class="ev-tp-line w60 strong"></span><span class="ev-tp-line w80"></span>
        <span class="ev-tp-bar"><span></span></span><span class="ev-tp-btn">เรียนต่อ</span></div>
      <svg class="ev-tp-art" viewBox="-60 -40 120 80">${A().ghost(-26, -6, 1, 'hw-float')}${A().pumpkin(22, 4, 0.9)}</svg>
      <div class="ev-tp-nav"><span class="on"></span><span></span><span></span><span></span></div>
    </div>`;
  }
  function rewardHtml(st) {
    const using = App().themeChoice === st.reward.themeId;
    let action; let note = '';
    if (st.reward.owned) {
      action = using
        ? `<button class="btn btn-secondary btn-block" type="button" data-nav-to="profile">${ICON('check', 'icon icon-sm')} กำลังใช้ธีมนี้ — เปลี่ยนได้ที่โปรไฟล์</button>`
        : `<button class="btn btn-primary btn-block ev-glow" type="button" data-ev="use">${ICON('palette', 'icon icon-sm')} ใช้ธีม Halloween</button>`;
      note = 'อยู่ในคลังธีมของคุณแล้ว ใช้ได้ถาวรแม้กิจกรรมจบ';
    } else if (st.canClaim) {
      action = `<button class="btn btn-primary btn-block ev-glow" type="button" data-ev="claim">${ICON('gift', 'icon icon-sm')} เปิดของขวัญ</button>`;
      note = 'ผ่านการผจญภัยครบแล้ว!';
    } else if (st.status === 'active') {
      action = `<button class="btn btn-secondary btn-block" type="button" disabled>${ICON('lock', 'icon icon-sm')} ผ่าน 4 Chapter และ Final Challenge เพื่อรับ</button>`;
      note = 'ทยอยทำได้ทุกวันจนถึงวันสุดท้ายของกิจกรรม ความคืบหน้าบันทึกอัตโนมัติ';
    } else if (st.status === 'upcoming') {
      action = `<button class="btn btn-secondary btn-block" type="button" disabled>${ICON('hourglass', 'icon icon-sm')} รอเริ่มกิจกรรม</button>`;
    } else {
      action = `<button class="btn btn-secondary btn-block" type="button" disabled>${ICON('hourglass', 'icon icon-sm')} หมดเวลารับรางวัลแล้ว</button>`;
      note = 'รางวัลนี้รับได้เฉพาะช่วงกิจกรรม';
    }
    return `<section class="ev-sec ev-reward" aria-labelledby="ev-rw-title">
      <h2 class="ev-h2" id="ev-rw-title">${ICON('gift', 'icon icon-sm')} รางวัลเมื่อผ่านปราสาทราชาฟักทอง</h2>
      <div class="ev-rw">
        ${themePreview()}
        <div class="ev-rw-text">
          <span class="ev-rw-tag">ธีมถาวร · ตกแต่งเท่านั้น</span>
          <h3>Halloween Theme 2026</h3>
          <p>เปลี่ยนทั้งแอปเป็นโลกคืนฮาโลวีน ผีน้อย ฟักทองเรืองแสง ค้างคาว ใยแมงมุม และประกายเวทมนตร์</p>
        </div>
      </div>
      ${action}
      ${note ? `<p class="ev-note">${esc(note)}</p>` : ''}
    </section>`;
  }
  /** ภาพหัวหน้ากิจกรรม (viewBox กว้าง 800 — มือถือเห็นช่วงกลาง 200–600 ที่มีองค์ประกอบหลักครบ จอกว้างเห็นทั้งฉาก) */
  function heroSvg() {
    const a = A();
    return `<svg class="ev-svg" viewBox="0 0 800 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs><linearGradient id="evHeroSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0720"/><stop offset=".6" stop-color="#26144D"/><stop offset="1" stop-color="#3D1D5E"/></linearGradient></defs>
      <rect width="800" height="200" fill="url(#evHeroSky)"/>
      <g fill="#FFF6D8" class="hw-tw">${a.stars(7, 30, 800, 110)}</g><g fill="#E8DEFF" class="hw-tw hw-tw2">${a.stars(91, 24, 800, 100)}</g>
      ${a.moon(560, 52, 28)}
      <path d="M0 150 Q80 118 170 134 T340 128 T520 130 T680 120 T800 128 V200 H0z" fill="#1F1142"/>
      ${a.castleSilhouette(60, 92, 0.5, '#170C36', '#FFB547')}
      ${a.castleSilhouette(330, 48, 0.92)}
      ${tree(780, 176, 0.6, true)}
      <g class="hw-fog"><rect x="-120" y="140" width="700" height="24" rx="12" fill="url(#hwFog)"/></g>
      <path d="M0 170 Q120 150 260 162 T520 158 T800 160 V200 H0z" fill="#0D0722"/>
      <g class="hw-fog hw-fog2"><rect x="300" y="160" width="700" height="28" rx="14" fill="url(#hwFog)"/></g>
      ${a.pumpkin(250, 172, 0.75)}${a.pumpkin(540, 176, 0.6)}${a.pumpkin(110, 178, 0.55, { glow: false })}${a.pumpkin(700, 174, 0.7)}
      ${a.ghost(612, 108, 0.75, 'hw-float')}${a.ghost(160, 70, 0.55, 'hw-float hw-float2')}
      ${a.bat(440, 46, 0.8, 'hw-fly')}${a.bat(480, 80, 0.55, 'hw-fly hw-fly2')}${a.bat(700, 60, 0.5, 'hw-fly hw-fly3')}
    </svg>`;
  }
  function render(st) {
    const root = document.getElementById('ev-root');
    if (!root) return;
    const sum = st.summary;
    const cur = st.chapters.find((c) => c.id === st.currentChapter);
    const curText = st.complete ? 'ผ่านการผจญภัยครบแล้ว' : cur ? `${cur.final ? 'Final Challenge' : `Chapter ${cur.no}`} · ${cur.place}` : '';
    if (!S.selected || !st.chapters.some((c) => c.id === S.selected)) S.selected = cur ? cur.id : st.chapters[st.chapters.length - 1].id;
    root.innerHTML = `
      <header class="ev-hero ${st.status}">
        <div class="ev-scene">${heroSvg()}</div>
        <div class="ev-hero-text">
          <p class="ev-kicker">${ICON('moon', 'icon icon-sm')} ${st.status === 'ended' ? 'กิจกรรมที่ผ่านมา' : 'กิจกรรมพิเศษ'}</p>
          <h1 class="ev-title" id="ev-title">${esc(st.name)}</h1>
          <p class="ev-sub">${esc(st.nameTh)}</p>
        </div>
      </header>
      <div class="ev-top">
        ${countdownHtml(st)}
        <div class="ev-overall">
          <div class="ev-overall-row"><span>${ICON('map', 'icon icon-sm')} ${esc(curText)}</span><b>${sum.missionsDone}/${sum.missions} ภารกิจ</b></div>
          <div class="ev-bar ev-bar-lg" role="progressbar" aria-valuemin="0" aria-valuemax="${sum.missions}" aria-valuenow="${sum.missionsDone}" aria-label="ความคืบหน้าการผจญภัย">
            <span style="transform:scaleX(${sum.missions ? sum.missionsDone / sum.missions : 0})"></span></div>
        </div>
      </div>
      <p class="ev-ends">${ICON('calendar', 'icon icon-sm')} สิ้นสุด ${esc(st.endsLabel)} (เวลาประเทศไทย) · ทยอยทำได้ ไม่ต้องเล่นทุกวัน ไม่ต้องชนะ Ranked</p>
      <div class="ev-resume hidden" id="ev-resume"></div>
      <div class="ev-layout">
        <div class="ev-map">${mapSvg(st)}</div>
        <aside class="ev-panel" id="ev-panel" aria-live="polite"></aside>
      </div>
      ${rewardHtml(st)}`;
    watchRegions(root);
    if (WIDE()) document.getElementById('ev-panel').innerHTML = chapterHtml(st, S.selected);
    document.querySelectorAll('#ev-root .ev-med').forEach((g) => g.classList.toggle('is-selected', g.dataset.ch === S.selected));
    if (st.status !== 'ended') startTicker();
    checkResume();
  }
  /** เลื่อนแผนที่ไปยังจุดที่กำลังผจญภัย */
  function scrollToCurrent() {
    const me = document.querySelector('#ev-root .ev-me') || document.querySelector('#ev-root .ev-med.is-current');
    if (!me) return;
    const r = me.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.75 || r.top < 0) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.4, behavior: REDUCED() ? 'auto' : 'smooth' });
  }

  async function loadList() {
    if (!App() || !App().user) return [];
    try {
      const r = await App().api('/events');
      S.list = r.events || [];
      if (S.list[0]) setOffset(S.list[0].serverNow);
    } catch (_) { S.list = S.list || []; }
    return S.list;
  }
  async function loadState() {
    const st = await App().api(`/events/${MAIN_EVENT}`);
    setOffset(st.serverNow);
    S.state = st;
    return st;
  }
  async function open({ scroll = true } = {}) {
    App().showScreen('screen-event');
    const root = document.getElementById('ev-root');
    if (!S.state) root.innerHTML = '<div class="ev-skel"><div class="skeleton" style="height:200px;border-radius:20px"></div><div class="skeleton skeleton-row"></div><div class="skeleton" style="height:420px;border-radius:20px"></div></div>';
    else render(S.state);
    try {
      render(await loadState());
      if (scroll) setTimeout(scrollToCurrent, 250);
    } catch (err) {
      root.innerHTML = `<div class="ev-error"><p>${esc(err.message || 'โหลดกิจกรรมไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-ev="reload">ลองใหม่</button></div>`;
    }
  }
  async function reloadState() {
    try { render(await loadState()); } catch (_) { /* แสดงข้อมูลเดิม */ }
  }

  /* =====================================================================
     เล่นด่าน (Stage) — โจทย์/เฉลย/เวลา อยู่ที่เซิร์ฟเวอร์ · คำตอบที่เลือกจำไว้ในเครื่องเพื่อเล่นต่อได้
     ===================================================================== */
  const ansKey = (id) => `eq_ev_ans_${id}`;
  const loadAns = (id, n) => {
    try { const a = JSON.parse(localStorage.getItem(ansKey(id)) || 'null'); if (Array.isArray(a) && a.length === n) return a; } catch (_) { /* ignore */ }
    return new Array(n).fill(null);
  };
  const saveAns = (id, a) => { try { localStorage.setItem(ansKey(id), JSON.stringify(a)); } catch (_) { /* ignore */ } };
  const dropAns = (id) => { try { localStorage.removeItem(ansKey(id)); } catch (_) { /* ignore */ } };

  async function checkResume() {
    const box = document.getElementById('ev-resume');
    if (!box || !S.state || S.state.status !== 'active') return;
    try {
      const { attempt } = await App().api(`/events/${MAIN_EVENT}/attempts/current`);
      if (!attempt || S.open) { box.classList.add('hidden'); return; }
      box.innerHTML = `${ICON('hourglass', 'icon icon-sm')}<span>ด่าน <b>${esc(attempt.stage.name)}</b> ยังเล่นค้างอยู่ — เหลือเวลา ${Math.ceil(attempt.remainingMs / 1000)} วินาที</span>
        <button class="btn btn-primary" type="button" data-ev-resume="1">เล่นต่อ</button>`;
      box.classList.remove('hidden');
      box.querySelector('[data-ev-resume]').onclick = () => { box.classList.add('hidden'); playAttempt(attempt); };
    } catch (_) { box.classList.add('hidden'); }
  }

  function stageInfo(sid) {
    const st = S.state; const s = st && st.stages[sid];
    if (!s) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay ev-modal';
    const kinds = s.kinds.map((k) => `<span class="ev-kind">${esc(KIND_TH[k] || k)}</span>`).join('');
    ov.innerHTML = `<div class="modal-card ev-info" aria-labelledby="ev-info-title">
      <p class="ev-kicker">${ICON('sparkles', 'icon icon-sm')} ด่าน${esc(LEVEL_TH[s.level] || '')}</p>
      <h2 id="ev-info-title">${esc(s.name)}</h2>
      <div class="ev-kinds">${kinds}</div>
      <ul class="ev-rules">
        <li>${ICON('list-checks', 'icon icon-sm')} ${s.questions} ข้อ · ต้องถูกอย่างน้อย ${s.pass} ข้อ</li>
        <li>${ICON('timer', 'icon icon-sm')} เวลาทั้งด่าน ${Math.floor(s.timeLimitSec / 60)} นาที${s.timeLimitSec % 60 ? ` ${s.timeLimitSec % 60} วินาที` : ''}</li>
        ${s.rule ? `<li>${ICON('target', 'icon icon-sm')} ${esc(s.rule)}</li>` : ''}
        <li>${ICON('refresh-cw', 'icon icon-sm')} ไม่ผ่านลองใหม่ได้ โจทย์สุ่มใหม่ทุกครั้ง${s.best ? ` · ดีที่สุด ${s.best}/${s.questions}` : ''}</li>
      </ul>
      ${s.available ? `<button class="btn btn-primary btn-block ev-glow" type="button" data-autofocus data-go-stage="${sid}">${ICON('play', 'icon icon-sm')} ${s.passed ? 'เล่นซ้ำ' : 'เริ่มด่าน'}</button>`
    : s.passed ? `<p class="ev-note">${ICON('circle-check', 'icon icon-sm')} ผ่านด่านนี้แล้ว</p>` : `<p class="ev-note">${ICON('lock', 'icon icon-sm')} ${esc(s.lockedReason || 'ยังไม่ปลดล็อก')}</p>`}
    </div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, {});
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-go-stage]'); if (b) { ov.remove(); startStage(sid); } });
  }

  async function startStage(sid, btn) {
    if (S.open) return;
    if (btn) btn.disabled = true;
    try {
      const at = await App().api(`/events/${MAIN_EVENT}/stages/${encodeURIComponent(sid)}/start`, { method: 'POST' });
      playAttempt(at);
    } catch (err) {
      App().toast(err.message, 'error');
      reloadState();
    } finally { if (btn) btn.disabled = false; }
  }

  function playAttempt(at) {
    setOffset(at.serverNow);
    const qs = at.questions; const n = qs.length;
    const answers = loadAns(at.attemptId, n);
    const deadline = Date.now() + at.remainingMs;   // นาฬิกาเครื่องใช้แค่แสดงเวลา (เซิร์ฟเวอร์ตรวจเวลาจริงตอนส่ง)
    const total = at.stage.timeLimitSec * 1000;
    let i = Math.max(0, answers.findIndex((a) => a === null || a === ''));
    if (i < 0) i = n - 1;
    let sending = false; let timer = null; let finished = false;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay ev-modal ev-play-ov';
    ov.innerHTML = `<div class="modal-card ev-play" aria-labelledby="ev-play-title">
      <div class="ev-play-top">
        <div><p class="ev-kicker">${ICON('sparkles', 'icon icon-sm')} ${esc(LEVEL_TH[at.stage.level] || '')}</p><h2 id="ev-play-title">${esc(at.stage.name)}</h2></div>
        <div class="ev-clock" role="timer" aria-live="off"><b data-clock>--:--</b></div>
      </div>
      <div class="ev-tbar" aria-hidden="true"><span data-tbar></span></div>
      <div class="ev-play-body" data-body></div>
    </div>`;
    document.body.appendChild(ov);
    S.open = at.attemptId;
    App().makeDialog(ov, { label: at.stage.name, onClose: () => { S.open = null; clearInterval(timer); if (!finished) { App().toast('ด่านยังเล่นค้างอยู่ กลับมาเล่นต่อได้ก่อนหมดเวลา', 'info'); } reloadState(); } });
    const body = ov.querySelector('[data-body]');
    const clock = ov.querySelector('[data-clock]'); const tbar = ov.querySelector('[data-tbar]');
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const s = Math.ceil(left / 1000);
      const txt = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      if (clock.textContent !== txt) clock.textContent = txt;
      tbar.style.transform = `scaleX(${(left / total).toFixed(4)})`;
      ov.querySelector('.ev-clock').classList.toggle('low', left < 20000);
      if (left <= 0 && !finished && !sending) submit(true);
    };
    const draw = () => {
      const q = qs[i];
      const last = i === n - 1;
      const answered = answers[i] !== null && answers[i] !== '';
      const dots = qs.map((_, k) => `<span class="${answers[k] !== null && answers[k] !== '' ? 'ans' : ''} ${k === i ? 'now' : ''}"></span>`).join('');
      let input;
      if (q.kind === 'spell') {
        const h = q.hint || {};
        input = `<div class="ev-spell">
          <p class="ev-spell-hint">${ICON('lightbulb', 'icon icon-sm')} ขึ้นต้นด้วย <b lang="en">${esc(h.first || '')}</b> · ${h.length || '?'} ตัวอักษร${h.pos ? ` · ${esc(h.pos)}` : ''}</p>
          <div class="ev-spell-slots" aria-hidden="true">${Array.from({ length: h.length || 0 }, (_, k) => `<span>${esc((answers[i] || '')[k] || '')}</span>`).join('')}</div>
          <input class="input ev-spell-in" type="text" lang="en" inputmode="latin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
            maxlength="20" aria-label="พิมพ์คำตอบภาษาอังกฤษ" value="${esc(answers[i] || '')}" data-autofocus>
        </div>`;
      } else {
        input = `<div class="ev-ch-choices" role="radiogroup" aria-label="ตัวเลือก">
          ${q.choices.map((c, k) => `<button type="button" role="radio" class="ev-ch-choice ${answers[i] === k ? 'sel' : ''}" aria-checked="${answers[i] === k}" data-k="${k}" lang="${q.choicesLang === 'th' ? 'th' : 'en'}">${esc(c)}</button>`).join('')}
        </div>`;
      }
      const unanswered = answers.filter((a) => a === null || a === '').length;
      body.innerHTML = `
        <div class="ev-ch-dots">${dots}</div>
        <p class="ev-ch-kind"><span class="ev-sec-chip">${esc(q.sectionTh || '')}</span> ข้อ ${i + 1}/${n} · ${esc(q.instruction)}</p>
        ${q.passage ? `<div class="ev-passage" lang="en">${esc(q.passage)}</div>` : ''}
        <h3 class="ev-ch-word" lang="${q.promptLang === 'th' ? 'th' : 'en'}">${esc(q.prompt)}</h3>
        ${input}
        <div class="ev-ch-nav">
          ${i > 0 ? '<button class="btn btn-secondary" type="button" data-ch="prev">ย้อนกลับ</button>' : '<span></span>'}
          <button class="btn btn-primary" type="button" data-ch="${last ? 'submit' : 'next'}">${last ? 'ส่งคำตอบ' : answered ? 'ข้อต่อไป' : 'ข้าม'}</button>
        </div>
        ${last && unanswered ? `<p class="ev-note ev-warn">ยังไม่ได้ตอบ ${unanswered} ข้อ — กด "ส่งคำตอบ" ได้เลยหรือย้อนกลับไปตอบ</p>` : ''}`;
      const inp = body.querySelector('.ev-spell-in');
      if (inp) {
        inp.addEventListener('input', () => {
          answers[i] = inp.value; saveAns(at.attemptId, answers);
          body.querySelectorAll('.ev-spell-slots span').forEach((sp, k) => { sp.textContent = inp.value[k] || ''; });
          const nb = body.querySelector('[data-ch="next"]'); if (nb) nb.textContent = inp.value ? 'ข้อต่อไป' : 'ข้าม';
        });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.querySelector('[data-ch="next"],[data-ch="submit"]').click(); } });
        if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => inp.focus({ preventScroll: true }), 30);
      }
    };
    const submit = async (auto = false) => {
      if (sending || finished) return;
      sending = true;
      body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const payload = answers.map((a, k) => (qs[k].kind === 'spell' ? (a || '') : (Number.isInteger(a) ? a : null)));
        const r = await App().api(`/events/${MAIN_EVENT}/attempts/${at.attemptId}/submit`, { method: 'POST', body: { answers: payload } });
        finished = true; clearInterval(timer); dropAns(at.attemptId);
        showResult(r, auto);
      } catch (err) {
        sending = false;
        App().toast(err.message, 'error');
        if (err.code === 'ALREADY_SUBMITTED' || err.code === 'EXPIRED' || err.code === 'NOT_FOUND') { finished = true; dropAns(at.attemptId); ov.remove(); return; }
        draw();
      }
    };
    const showResult = (r, auto) => {
      ov.querySelector('.ev-tbar').classList.add('hidden'); ov.querySelector('.ev-clock').classList.add('hidden');
      const reasonTh = { time_up: 'หมดเวลา', score: `ต้องถูกอย่างน้อย ${r.stage.pass} ข้อ`, section: `ต้องได้อย่างน้อย ${r.stage.sectionMin} ข้อในทุกหมวด` };
      const st = S.state;
      const nextSid = (() => {
        if (!r.passed || !st) return null;
        for (const ch of st.chapters) for (const m of ch.missions) {
          if (m.kind !== 'stages') continue;
          const k = m.stages.indexOf(r.stage.id);
          if (k >= 0 && m.stages[k + 1]) return m.stages[k + 1];
        }
        return null;
      })();
      const secs = Object.values(r.bySection).map((s) => `<li><span>${esc(s.label)}</span><span class="ev-bar"><span style="transform:scaleX(${s.total ? s.correct / s.total : 0})"></span></span><b>${s.correct}/${s.total}</b></li>`).join('');
      body.innerHTML = `
        <div class="ev-res ${r.passed ? 'pass' : 'fail'}">
          <svg class="ev-res-art" viewBox="-60 -44 120 84" aria-hidden="true">${r.passed ? `${A().pumpkin(0, 0, 1.1)}${A().sparkle(-40, -24, 1.2, '#FFD166', 'hw-tw')}${A().sparkle(42, -18, 0.9, '#FFE9A8', 'hw-tw hw-tw2')}` : A().ghost(0, -4, 1.3, 'hw-float')}</svg>
          <h3>${r.passed ? `ผ่านด่าน ${esc(r.stage.name)}!` : auto ? 'หมดเวลาแล้ว' : 'ยังไม่ผ่าน ลองอีกครั้งนะ'}</h3>
          <p>ถูก <b>${r.score}/${r.total}</b> ข้อ · ใช้เวลา ${Math.round(r.timeMs / 1000)} วินาที${!r.passed && r.reason ? ` · ${esc(reasonTh[r.reason] || '')}` : ''}</p>
          <ul class="ev-res-secs">${secs}</ul>
          <details class="ev-review"><summary>ดูเฉลยทุกข้อ</summary>
            <ul>${r.results.map((x) => `<li class="${x.correct ? 'ok' : 'bad'}">${ICON(x.correct ? 'circle-check' : 'circle-x', 'icon icon-sm')}
              <span>${esc(x.prompt)}</span><b>${esc(x.answer)}</b>${!x.correct && x.yours ? `<small>คุณตอบ: ${esc(x.yours)}</small>` : ''}</li>`).join('')}</ul>
          </details>
          <div class="ev-ch-nav">
            ${r.passed ? (nextSid ? `<button class="btn btn-secondary" type="button" data-res="map">กลับแผนที่</button><button class="btn btn-primary" type="button" data-res="next">ด่านถัดไป</button>`
    : '<span></span><button class="btn btn-primary" type="button" data-res="map">กลับแผนที่</button>')
    : '<button class="btn btn-secondary" type="button" data-res="map">กลับแผนที่</button><button class="btn btn-primary" type="button" data-res="retry">ลองใหม่</button>'}
          </div>
        </div>`;
      if (window.EQAudio) window.EQAudio.sfx(r.passed ? 'rank_progress' : 'incorrect');
      body.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.res;
        ov.remove();
        if (act === 'retry') setTimeout(() => startStage(r.stage.id), 60);
        else if (act === 'next') setTimeout(() => startStage(nextSid), 60);
      }));
      if (r.canClaim) setTimeout(() => { ov.remove(); claim(); }, 1600);
    };
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-k]');
      if (c) { answers[i] = Number(c.dataset.k); saveAns(at.attemptId, answers); draw(); if (window.EQAudio) window.EQAudio.sfx('click'); return; }   // เลือกแล้วยังไม่ไปข้อต่อไปเอง
      const b = e.target.closest('[data-ch]');
      if (!b) return;
      if (b.dataset.ch === 'prev') { i -= 1; draw(); } else if (b.dataset.ch === 'next') { i += 1; draw(); } else if (b.dataset.ch === 'submit') submit(false);
    });
    draw();
    tick();
    timer = setInterval(tick, 250);
  }

  /* =====================================================================
     รับรางวัล + เปิดของขวัญ
     ===================================================================== */
  async function claim(btn) {
    if (btn) btn.disabled = true;
    try {
      await App().api(`/events/${MAIN_EVENT}/claim`, { method: 'POST' });
      await App().syncThemes();
      giftModal();
      reloadState();
      refresh();
    } catch (err) {
      App().toast(err.message, 'error');
      if (btn) btn.disabled = false;
      reloadState();
    }
  }
  function giftModal() {
    const a = A();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay ev-modal';
    const burst = Array.from({ length: 14 }, (_, k) => {
      const ang = (k / 14) * Math.PI * 2;
      return `<span class="ev-gift-spark" style="--dx:${(Math.cos(ang) * 120).toFixed(0)}px;--dy:${(Math.sin(ang) * 100 - 30).toFixed(0)}px;--d:${(k % 4) * 60}ms"></span>`;
    }).join('');
    ov.innerHTML = `<div class="modal-card ev-gift" aria-labelledby="ev-gift-title">
      <div class="ev-gift-stage" aria-hidden="true">
        ${burst}
        <svg class="ev-gift-box" viewBox="0 0 120 110">
          <g class="ev-gift-lid"><rect x="14" y="30" width="92" height="20" rx="4" fill="#FF8A3D"/><rect x="54" y="30" width="12" height="20" fill="#FFD166"/>
            <path d="M60 30 C44 10 30 22 42 30z M60 30 C76 10 90 22 78 30z" fill="#FFD166"/></g>
          <rect x="20" y="50" width="80" height="54" rx="4" fill="#E2600F"/><rect x="54" y="50" width="12" height="54" fill="#FFD166"/>
          <path d="M28 62 l8 6 M90 62 l-8 6" stroke="#FFB547" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="ev-gift-reveal">${themePreview()}</div>
        <svg class="ev-gift-ghost" viewBox="-30 -30 60 60">${a.ghost(0, 0, 1, 'hw-float')}</svg>
      </div>
      <p class="ev-kicker">${ICON('crown', 'icon icon-sm')} พิชิตปราสาทราชาฟักทองสำเร็จ</p>
      <h2 id="ev-gift-title">ได้รับ Halloween Theme 2026</h2>
      <p class="ev-note">รางวัลพิเศษถาวร บันทึกในบัญชีของคุณแล้ว เปลี่ยนกลับเป็นธีมอื่นได้ทุกเมื่อที่หน้าโปรไฟล์</p>
      <button class="btn btn-primary btn-block ev-glow" type="button" data-autofocus data-gift="use">${ICON('palette', 'icon icon-sm')} ใช้ธีม Halloween</button>
      <button class="btn btn-secondary btn-block" type="button" data-gift="keep">${ICON('library', 'icon icon-sm')} เก็บไว้ในคลังธีม</button>
    </div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ได้รับรางวัล Halloween Theme 2026', onClose: () => { if (S.state) render(S.state); } });
    if (window.EQAudio) { window.EQAudio.sfx('promotion'); setTimeout(() => window.EQAudio.sfx('badge_unlock'), 700); }
    requestAnimationFrame(() => requestAnimationFrame(() => ov.querySelector('.ev-gift').classList.add('opened')));
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gift]');
      if (!b) return;
      if (b.dataset.gift === 'use') useTheme();
      else App().toast('เก็บ Halloween Theme 2026 ไว้ในคลังธีมแล้ว เลือกใช้ได้ที่ โปรไฟล์ → การแสดงผล', 'success');
      ov.remove();
    });
  }
  function useTheme() {
    App().applyTheme(MAIN_EVENT, { save: true, celebrate: true });
    App().toast('เปลี่ยนเป็นธีม Halloween แล้ว', 'success');
    if (S.state && !document.getElementById('screen-event').classList.contains('hidden')) render(S.state);
  }

  /* =====================================================================
     จุดเข้า: แบนเนอร์หน้าแรก / เมนูเล่น / กิจกรรมที่ผ่านมา
     ===================================================================== */
  async function refresh() {
    const list = await loadList();
    const ev = list.find((e) => e.id === MAIN_EVENT);
    const banner = document.getElementById('event-banner');
    const slot = document.getElementById('play-event-slot');
    if (!ev) { if (banner) banner.classList.add('hidden'); if (slot) slot.innerHTML = ''; return; }
    const left = new Date(ev.endsAt).getTime() - serverNow();
    const days = Math.ceil(left / 86400000);
    const leftText = left <= 0 ? '' : days > 1 ? `เหลือ ${days} วัน` : 'วันสุดท้าย';
    const a = A();
    const mini = `<svg class="ev-mini" viewBox="0 0 96 64" aria-hidden="true">
      <rect width="96" height="64" fill="#24134A"/><circle cx="72" cy="17" r="10" fill="#FFE9A8"/>
      <path d="M0 50 Q30 40 60 46 T96 44 V64 H0z" fill="#120A2B"/>${a.pumpkin(28, 46, 0.5, { glow: false })}${a.ghost(66, 40, 0.5)}</svg>`;
    if (banner) {
      if (ev.status === 'active') {
        banner.innerHTML = `${mini}<span class="ev-banner-text"><b>${esc(ev.name)}</b><span>${esc(ev.nameTh)} · ${leftText}</span></span>${ICON('chevron-right')}`;
        banner.classList.remove('hidden');
      } else banner.classList.add('hidden');
    }
    if (slot) {
      if (ev.status === 'active') {
        slot.innerHTML = `<button class="ev-banner ev-banner-play" type="button" data-nav-to="event">${mini}<span class="ev-banner-text"><b>${esc(ev.nameTh)}</b><span>ผจญภัย 4 Chapter สู่ปราสาทราชาฟักทอง รับธีมถาวร · ${leftText}</span></span>${ICON('chevron-right')}</button>`;
      } else if (ev.status === 'ended') {
        slot.innerHTML = `<section class="ev-past" aria-labelledby="ev-past-title"><h2 class="ev-h2" id="ev-past-title">${ICON('calendar', 'icon icon-sm')} กิจกรรมที่ผ่านมา</h2>
          <button class="home-link" type="button" data-nav-to="event">${ICON('moon')}<span>${esc(ev.name)} · ${esc(ev.nameTh)}</span>${ICON('chevron-right')}</button></section>`;
      } else slot.innerHTML = '';
    }
  }

  /** ปุ่ม "วิธีปลดล็อก" ในคลังธีม */
  function explainLocked() {
    const ev = (S.list || []).find((e) => e.id === MAIN_EVENT);
    if (ev && ev.status === 'active') { App().navigateTo('event'); return; }
    App().toast(ev && ev.status === 'upcoming' ? 'ธีมนี้เป็นรางวัลจากกิจกรรมฮาโลวีนที่กำลังจะเริ่ม' : 'ธีมนี้เป็นรางวัลจากกิจกรรมฮาโลวีน 2026 ซึ่งจบไปแล้ว', 'info');
  }

  /* ---------- การกด ---------- */
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-ev-go]');
    if (go) { App().navigateTo(go.dataset.evGo); return; }
    const sb = e.target.closest('[data-ev-stage]');
    if (sb) { startStage(sb.dataset.evStage, sb); return; }
    const si = e.target.closest('[data-ev-stage-info]');
    if (si) { stageInfo(si.dataset.evStageInfo); return; }
    const node = e.target.closest('#ev-root .ev-node');
    if (node) {
      if (node.dataset.ch) selectChapter(node.dataset.ch, { fromTap: true });
      else if (node.dataset.stage) stageInfo(node.dataset.stage);
      return;
    }
    const b = e.target.closest('[data-ev]');
    if (!b) return;
    const act = b.dataset.ev;
    if (act === 'claim') claim(b);
    else if (act === 'use') useTheme();
    else if (act === 'reload') open();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = e.target.closest && e.target.closest('#ev-root .ev-node');
    if (node) { e.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  window.matchMedia('(min-width: 980px)').addEventListener?.('change', () => { if (S.state && !document.getElementById('screen-event').classList.contains('hidden')) render(S.state); });
  const back = document.getElementById('ev-back');
  if (back) back.addEventListener('click', () => { if (history.length > 1) history.back(); else App().navigateTo('home'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App() && App().user) refresh(); });

  window.EQEvent = { open, refresh, explainLocked, _render: render };
  if (App() && App().user) refresh();
})();
