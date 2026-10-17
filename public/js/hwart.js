/* =====================================================================
   ภาพประกอบฮาโลวีน (SVG ล้วน ไม่ใช้อีโมจิ) — ใช้ร่วมกันระหว่างหน้ากิจกรรมและธีม Halloween
   ทุกฟังก์ชันคืนสตริง SVG (ส่วนของ <g>) · แอนิเมชันใช้ class + CSS (transform/opacity เท่านั้น)
   ===================================================================== */
(function () {
  const f = (n) => Math.round(n * 10) / 10;

  /** ฟักทองแกะสลัก (face=false = ฟักทองธรรมดา) · glow = แสงเรืองใต้ลูก */
  function pumpkin(x, y, s = 1, { face = true, glow = true, cls = '' } = {}) {
    return `<g class="hw-pk ${cls}" transform="translate(${f(x)} ${f(y)}) scale(${s})">
      ${glow ? '<ellipse cx="0" cy="24" rx="34" ry="8" fill="url(#hwPkGlow)"/>' : ''}
      <ellipse cx="-14" cy="6" rx="14" ry="18" fill="#D9590C"/>
      <ellipse cx="14" cy="6" rx="14" ry="18" fill="#D9590C"/>
      <ellipse cx="0" cy="6" rx="16" ry="20" fill="#FF7B1C"/>
      <path d="M-7 -10 Q-10 6 -6 24 M7 -10 Q10 6 6 24" fill="none" stroke="#C24F0A" stroke-width="1.4" opacity=".55"/>
      <path d="M-1.5 -13 q1 -7 6 -9" stroke="#4E7A2B" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M3 -18 q8 -4 10 2" stroke="#6E9E3A" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${face ? `<g fill="#FFD36B" class="hw-pkface">
        <path d="M-11 1 l5 -7 l5 7z"/><path d="M1 1 l5 -7 l5 7z"/>
        <path d="M-12 9 l4 4 l4 -3 l4 3 l4 -3 l4 3 l4 -4 q-12 12 -24 0z"/></g>` : ''}
    </g>`;
  }

  /** ค้างคาวการ์ตูน (ปีกกระพือด้วย class hw-wing) */
  function bat(x, y, s = 1, cls = '') {
    return `<g class="hw-bat ${cls}"><g transform="translate(${f(x)} ${f(y)}) scale(${s})">
      <g class="hw-wing hw-wing-l"><path d="M-3 0 C-10 -10 -20 -10 -26 -4 C-21 -3 -19 1 -18 4 C-14 1 -11 2 -9 5 C-7 1 -5 1 -3 2z" fill="#1A1033" stroke="#6B52B0" stroke-width=".8"/></g>
      <g class="hw-wing hw-wing-r"><path d="M3 0 C10 -10 20 -10 26 -4 C21 -3 19 1 18 4 C14 1 11 2 9 5 C7 1 5 1 3 2z" fill="#1A1033" stroke="#6B52B0" stroke-width=".8"/></g>
      <ellipse cx="0" cy="1" rx="5" ry="6" fill="#241544"/>
      <path d="M-4 -4 l-1 -4 l3 2z M4 -4 l1 -4 l-3 2z" fill="#241544"/>
      <circle cx="-1.8" cy="0" r="1.2" fill="#FFE9A8"/><circle cx="1.8" cy="0" r="1.2" fill="#FFE9A8"/>
    </g></g>`;
  }

  /** ผีการ์ตูนน่ารัก (ลอยด้วย class hw-float) */
  function ghost(x, y, s = 1, cls = '') {
    return `<g class="hw-ghost ${cls}"><g transform="translate(${f(x)} ${f(y)}) scale(${s})">
      <ellipse cx="0" cy="30" rx="13" ry="3" fill="#000" opacity=".18"/>
      <path d="M-15 12 V-3 a15 15 0 0 1 30 0 V12 l-5 -4 l-5 4 l-5 -4 l-5 4 l-5 -4 z" fill="#F6F2FF"/>
      <path d="M-15 12 V-3 a15 15 0 0 1 6 -12 a15 15 0 0 0 -2 12 V10z" fill="#DCD3FA" opacity=".8"/>
      <ellipse cx="-5" cy="-2" rx="2.2" ry="3" fill="#2A1F4A"/><ellipse cx="5" cy="-2" rx="2.2" ry="3" fill="#2A1F4A"/>
      <circle cx="-4.3" cy="-3" r=".8" fill="#fff"/><circle cx="5.7" cy="-3" r=".8" fill="#fff"/>
      <ellipse cx="-9" cy="3" rx="2.6" ry="1.5" fill="#FFB3C7" opacity=".8"/><ellipse cx="9" cy="3" rx="2.6" ry="1.5" fill="#FFB3C7" opacity=".8"/>
      <path d="M-2.5 4 q2.5 2.4 5 0" stroke="#2A1F4A" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </g></g>`;
  }

  /** ใยแมงมุมมุมจอ (corner: tl / tr / bl / br) */
  function web(size = 120, corner = 'tl', color = 'rgba(230,222,255,.38)') {
    const flip = { tl: '', tr: `translate(${size} 0) scale(-1 1)`, bl: `translate(0 ${size}) scale(1 -1)`, br: `translate(${size} ${size}) scale(-1 -1)` }[corner];
    const r = size;
    const spokes = [0, 18, 36, 54, 72, 90].map((a) => {
      const rad = (a * Math.PI) / 180;
      return `M0 0 L${f(Math.cos(rad) * r)} ${f(Math.sin(rad) * r)}`;
    }).join(' ');
    const rings = [0.28, 0.5, 0.72, 0.93].map((k) => {
      const pts = [0, 18, 36, 54, 72, 90].map((a) => { const rad = (a * Math.PI) / 180; return [Math.cos(rad) * r * k, Math.sin(rad) * r * k]; });
      let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i - 1][0] + pts[i][0]) / 2 * 0.86; const my = (pts[i - 1][1] + pts[i][1]) / 2 * 0.86;
        d += ` Q${f(mx)} ${f(my)} ${f(pts[i][0])} ${f(pts[i][1])}`;
      }
      return d;
    }).join(' ');
    return `<g transform="${flip}"><path d="${spokes} ${rings}" fill="none" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
      <g class="hw-spider"><path d="M${f(r * 0.6)} 0 V${f(r * 0.52)}" stroke="${color}" stroke-width=".8"/>
      <g transform="translate(${f(r * 0.6)} ${f(r * 0.56)})"><ellipse rx="4.5" ry="5.5" fill="#1D1436"/><circle cy="-6" r="3.4" fill="#1D1436"/>
      <circle cx="-1.2" cy="-6.6" r=".9" fill="#FFD166"/><circle cx="1.2" cy="-6.6" r=".9" fill="#FFD166"/>
      <path d="M-4 -2 l-6 -4 M-4 1 l-7 0 M-4 4 l-6 4 M4 -2 l6 -4 M4 1 l7 0 M4 4 l6 4" stroke="#1D1436" stroke-width="1.3" stroke-linecap="round"/></g></g>
    </g>`;
  }

  /** ดวงจันทร์เต็มดวงพร้อมแสงเรือง */
  function moon(x, y, r = 30) {
    return `<g class="hw-moon"><circle cx="${x}" cy="${y}" r="${f(r * 2.1)}" fill="url(#hwMoonGlow)"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="#FFE9A8"/>
      <circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.2)}" fill="#F2D27E" opacity=".7"/>
      <circle cx="${f(x + r * 0.33)}" cy="${f(y + r * 0.33)}" r="${f(r * 0.15)}" fill="#F2D27E" opacity=".7"/>
      <circle cx="${f(x + r * 0.2)}" cy="${f(y - r * 0.45)}" r="${f(r * 0.1)}" fill="#F2D27E" opacity=".6"/></g>`;
  }

  /** ปราสาทเงาดำ (สำหรับพื้นหลังธีม) */
  function castleSilhouette(x, y, s = 1, fill = '#120A2B', lit = '#FFB547') {
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><g fill="${fill}">
      <rect x="0" y="40" width="22" height="80"/><path d="M-4 42 L11 12 L26 42z"/>
      <rect x="22" y="58" width="80" height="62"/>
      <path d="M22 58 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h6 v-8 h4 v8z"/>
      <rect x="50" y="20" width="26" height="100"/><path d="M46 22 L63 -18 L80 22z"/><path d="M63 -18 v-10 l10 4 l-10 4"/>
      <rect x="102" y="48" width="20" height="72"/><path d="M98 50 L112 22 L126 50z"/>
    </g><g fill="${lit}" class="hw-win">
      <rect x="8" y="56" width="6" height="9" rx="3"/><rect x="59" y="36" width="8" height="12" rx="4"/>
      <rect x="108" y="64" width="6" height="8" rx="3"/><rect x="36" y="76" width="6" height="8" rx="3"/><rect x="84" y="76" width="6" height="8" rx="3"/>
    </g></g>`;
  }

  /** ประกายเวทมนตร์ (ดาว 4 แฉก) */
  function sparkle(x, y, s = 1, color = '#FFD166', cls = '') {
    return `<path class="hw-sparkle ${cls}" transform="translate(${f(x)} ${f(y)}) scale(${s})" d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8z" fill="${color}"/>`;
  }

  /** ดาวกระจาย (seed เดิมได้ตำแหน่งเดิม) */
  function stars(seed, n, w, h, rMin = 0.6, rMax = 1.8) {
    let out = ''; let r = seed;
    const next = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < n; i++) {
      out += `<circle cx="${f(next() * w)}" cy="${f(next() * h)}" r="${f(rMin + next() * (rMax - rMin))}"/>`;
    }
    return out;
  }

  /** defs ที่ภาพประกอบใช้ร่วมกัน (ใส่ครั้งเดียวต่อ SVG) */
  function defs() {
    return `<defs>
      <radialGradient id="hwMoonGlow"><stop offset="0" stop-color="#FFE7A3" stop-opacity=".5"/><stop offset="1" stop-color="#FFE7A3" stop-opacity="0"/></radialGradient>
      <radialGradient id="hwPkGlow"><stop offset="0" stop-color="#FF9A3C" stop-opacity=".6"/><stop offset="1" stop-color="#FF9A3C" stop-opacity="0"/></radialGradient>
      <radialGradient id="hwMagic"><stop offset="0" stop-color="#7FF5E1" stop-opacity=".75"/><stop offset="1" stop-color="#7FF5E1" stop-opacity="0"/></radialGradient>
      <radialGradient id="hwEmber"><stop offset="0" stop-color="#FFB547" stop-opacity=".7"/><stop offset="1" stop-color="#FF6A1A" stop-opacity="0"/></radialGradient>
      <linearGradient id="hwFog" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#CFC4FF" stop-opacity="0"/><stop offset=".5" stop-color="#CFC4FF" stop-opacity=".22"/><stop offset="1" stop-color="#CFC4FF" stop-opacity="0"/>
      </linearGradient>
    </defs>`;
  }

  // defs ส่วนกลาง 1 ชุดต่อหน้า (ไม่ใส่ใน SVG ที่อาจถูกซ่อนด้วย display:none — gradient จะหายใน Chrome)
  function injectDefs() {
    if (document.getElementById('hw-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="hw-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">${defs()}</svg>`;
    document.body.appendChild(holder.firstChild);
  }
  if (document.body) injectDefs(); else document.addEventListener('DOMContentLoaded', injectDefs);

  window.EQHalloweenArt = { pumpkin, bat, ghost, web, moon, castleSilhouette, sparkle, stars, defs };
})();
