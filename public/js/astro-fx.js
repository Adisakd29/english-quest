/* =====================================================================
   ธีมดาราศาสตร์ — ชั้นตกแต่งและเอฟเฟกต์ (ทำงานเมื่อ <html data-skin="astronomy">)
   - ชั้นตกแต่งอยู่ "ใต้" เนื้อหา (z-index ติดลบ + pointer-events: none) จึงไม่บังคำถามหรือปุ่ม
   - แอนิเมชัน transform/opacity เท่านั้น · หยุดเมื่อแท็บไม่แสดง · โหมดเบา (data-fx="lite") ตัดดาวตก/ประกาย
   - ลดการเคลื่อนไหว (prefers-reduced-motion) = ภาพนิ่ง
   ===================================================================== */
(function () {
  const root = document.documentElement;
  const SKIN = 'astronomy';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layer = null; let tapBound = false; let bursts = 0;

  // ดาวกระพริบสุ่มแบบคงที่ (seed) — ไม่เปลี่ยนทุกครั้งที่เปิด
  function starsSvg() {
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const dots = Array.from({ length: 34 }, (_, i) => {
      const x = (rnd() * 1000).toFixed(0); const y = (rnd() * 700).toFixed(0); const r = (0.8 + rnd() * 1.6).toFixed(1);
      const cls = ['as-tw', 'as-tw as-tw2', 'as-tw as-tw3'][i % 3];
      const fill = i % 7 === 0 ? '#FFE1A8' : i % 5 === 0 ? '#CFE2FF' : '#FFFFFF';
      return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    }).join('');
    return `<svg class="asfx-stars" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${dots}</svg>`;
  }
  const planet = `<svg class="asfx-planet" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="as-pl" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#C9B8FF"/><stop offset=".45" stop-color="#6D6CFF"/><stop offset="1" stop-color="#22206E"/></radialGradient>
        <linearGradient id="as-ring" x1="0" x2="1"><stop offset="0" stop-color="#FFD27A" stop-opacity=".1"/><stop offset=".5" stop-color="#FFE7B3" stop-opacity=".9"/><stop offset="1" stop-color="#FFD27A" stop-opacity=".15"/></linearGradient>
        <clipPath id="as-back"><rect x="0" y="0" width="200" height="100"/></clipPath>
      </defs>
      <g transform="rotate(-16 100 100)">
        <ellipse cx="100" cy="100" rx="92" ry="22" fill="none" stroke="url(#as-ring)" stroke-width="7" clip-path="url(#as-back)"/>
        <circle cx="100" cy="100" r="54" fill="url(#as-pl)"/>
        <path d="M52 86 Q100 74 148 88" stroke="#8EC5FF" stroke-width="6" fill="none" opacity=".45"/>
        <path d="M48 106 Q100 98 152 110" stroke="#C3A8FF" stroke-width="5" fill="none" opacity=".4"/>
        <path d="M58 124 Q100 120 140 128" stroke="#8EC5FF" stroke-width="3" fill="none" opacity=".35"/>
        <path d="M8 100 A92 22 0 0 0 192 100" fill="none" stroke="url(#as-ring)" stroke-width="7"/>
      </g>
      <g class="as-moonlet"><circle cx="186" cy="62" r="6" fill="#E6ECFF"/><circle cx="184" cy="60" r="2" fill="#B9C4EE"/></g>
    </svg>`;
  const moon = `<svg class="asfx-moon" viewBox="0 0 60 60" aria-hidden="true">
      <defs><radialGradient id="as-mn" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFF6E0"/><stop offset="1" stop-color="#E9D7A8"/></radialGradient></defs>
      <circle cx="30" cy="30" r="22" fill="url(#as-mn)"/><circle cx="22" cy="24" r="4" fill="#D9C38C" opacity=".6"/><circle cx="36" cy="36" r="5" fill="#D9C38C" opacity=".5"/><circle cx="35" cy="20" r="2.4" fill="#D9C38C" opacity=".5"/>
    </svg>`;
  // กลุ่มดาว (โครงร่างทั่วไป ไม่อ้างอิงแผนที่ดาวจริง)
  const constellation = (cls, pts) => `<svg class="asfx-const ${cls}" viewBox="0 0 220 140" aria-hidden="true">
      <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="rgba(181,216,255,.35)" stroke-width="1" stroke-dasharray="3 4"/>
      ${pts.map(([x, y], i) => `<circle class="as-star" cx="${x}" cy="${y}" r="${i % 3 === 0 ? 2.6 : 1.8}" fill="${i % 3 === 0 ? '#FFE7B3' : '#E6ECFF'}"/>`).join('')}
    </svg>`;

  function layerHtml() {
    return `${starsSvg()}${constellation('', [[14, 30], [52, 18], [90, 40], [128, 28], [168, 54], [150, 96], [196, 112]])}
      ${constellation('asfx-const2', [[20, 100], [60, 70], [104, 82], [140, 40], [190, 30]])}
      ${moon}${planet}<span class="asfx-comet"></span>`;
  }
  function mount() {
    if (layer) return;
    layer = document.createElement('div');
    layer.id = 'as-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = layerHtml();
    document.body.prepend(layer);
    bindTap();
  }
  function unmount() { if (layer) { layer.remove(); layer = null; } }
  function sync() { if (root.dataset.skin === SKIN) mount(); else unmount(); }

  /* ---------- ประกายดาวเมื่อแตะปุ่ม ---------- */
  const TAP_SEL = '.btn, .mini-btn, .vd-seg-btn, .play-card, .home-link, .mode-card, #bottom-nav button, #bottom-nav a, .quiz-choice, .rk-choice, .gl-choice';
  function bindTap() {
    if (tapBound) return;
    tapBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (root.dataset.skin !== SKIN || root.dataset.fx === 'lite' || reduced()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target.closest && e.target.closest(TAP_SEL);
      if (!t || t.disabled || bursts > 3) return;
      bursts += 1;
      const el = document.createElement('div');
      el.className = 'asfx-burst';
      el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px`;
      el.innerHTML = Array.from({ length: 7 }, (_, k) => {
        const ang = (k / 7) * Math.PI * 2 + Math.random() * 0.5; const d = 22 + Math.random() * 16;
        return `<i style="--dx:${(Math.cos(ang) * d).toFixed(0)}px;--dy:${(Math.sin(ang) * d).toFixed(0)}px"></i>`;
      }).join('');
      document.body.appendChild(el);
      setTimeout(() => { el.remove(); bursts -= 1; }, 650);
    }, { passive: true });
  }

  /* ---------- แอนิเมชันต้อนรับ (เปิดใช้ธีม / ได้รับธีมจาก Ranked) ---------- */
  function celebrate() {
    const el = document.createElement('div');
    el.className = 'asfx-intro';
    el.setAttribute('aria-hidden', 'true');
    const sparks = Array.from({ length: 12 }, (_, k) => {
      const ang = (k / 12) * Math.PI * 2;
      return `<span class="asfx-is" style="--dx:${(Math.cos(ang) * 55).toFixed(0)}vw;--dy:${(Math.sin(ang) * 50).toFixed(0)}vh;--d:${(k % 3) * 80}ms"></span>`;
    }).join('');
    el.innerHTML = `<div class="asfx-ring"></div>${sparks}${planet.replace('class="asfx-planet"', 'class="asfx-ic"').replace(/id="as-/g, 'id="asi-').replace(/url\(#as-/g, 'url(#asi-')}`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
    setTimeout(() => el.remove(), reduced() ? 1000 : 2200);
  }

  /* ---------- หน้าโหลดตอนเปิดแอป ---------- */
  function endBoot() {
    if (!root.classList.contains('as-booting')) return;
    root.classList.add('as-boot-done');
    setTimeout(() => root.classList.remove('as-booting', 'as-boot-done'), 450);
  }
  window.addEventListener('eq:ready', endBoot);
  setTimeout(endBoot, 6000);   // กันค้าง

  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-skin'] });
  document.addEventListener('visibilitychange', () => root.classList.toggle('as-paused', document.hidden));
  sync();

  window.EQAstroFx = { celebrate, sync };
})();
