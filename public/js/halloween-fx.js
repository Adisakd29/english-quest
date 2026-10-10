/* =====================================================================
   ธีม Halloween 2026 — ชั้นตกแต่งและเอฟเฟกต์ (ทำงานเมื่อ <html data-skin="halloween">)
   - ชั้นตกแต่งอยู่ "ใต้" เนื้อหา (z-index ติดลบ + pointer-events: none) จึงไม่บังคำถามหรือปุ่ม
   - แอนิเมชัน transform/opacity เท่านั้น · หยุดเมื่อแท็บไม่แสดง · ลดเอฟเฟกต์อัตโนมัติบนเครื่องสเปกต่ำ (data-fx="lite")
   - รองรับ "ลดการเคลื่อนไหว" (prefers-reduced-motion) — ไม่มีการเคลื่อนไหวเลย แต่ภาพตกแต่งยังอยู่
   ===================================================================== */
(function () {
  const root = document.documentElement;
  const A = () => window.EQHalloweenArt;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layer = null; let tapBound = false; let bursts = 0;

  /** เครื่องสเปกต่ำ / ประหยัดเน็ต -> โหมดเบา (ตัดค้างคาวบิน หมอกเคลื่อนไหว ประกายตอนแตะ) */
  const forced = (() => { try { return localStorage.getItem('eq_fx'); } catch (_) { return null; } })();   // dev: 'full' | 'lite'
  function detectLite() {
    if (forced) return forced === 'lite';
    const nav = navigator;
    const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2;
    const lowMem = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2;
    const saveData = nav.connection && nav.connection.saveData;
    return Boolean(lowCpu || lowMem || saveData);
  }
  /** วัดจริงช่วงสั้น ๆ: ถ้าเฟรมช้ามาก (เครื่องอ่อน) ก็สลับเป็นโหมดเบา — ไม่แสดงตัวเลขใด ๆ */
  function probeFrames() {
    if (forced || root.dataset.fx === 'lite' || reduced()) return;
    let n = 0; let slow = 0; let last = performance.now();
    const step = (t) => {
      const dt = t - last; last = t; n += 1;
      if (dt > 40) slow += 1;
      if (n < 90) requestAnimationFrame(step);
      else if (slow > 25) root.dataset.fx = 'lite';
    };
    requestAnimationFrame(step);
  }

  function layerHtml() {
    const a = A();
    return `
      <svg class="hwfx-moon" viewBox="0 0 160 160" aria-hidden="true">${a.moon(80, 80, 34)}${a.sparkle(30, 34, 0.8, '#FFF6D8', 'hw-tw')}${a.sparkle(136, 122, 0.6, '#FFE9A8', 'hw-tw hw-tw2')}</svg>
      <svg class="hwfx-web hwfx-web-l" viewBox="0 0 150 150" aria-hidden="true">${a.web(150, 'tl')}</svg>
      <svg class="hwfx-web hwfx-web-r" viewBox="0 0 150 150" aria-hidden="true">${a.web(150, 'tr')}</svg>
      <svg class="hwfx-castle" viewBox="-10 -40 150 170" aria-hidden="true">${a.castleSilhouette(0, 0, 1, 'rgba(18,10,43,.9)', '#FFB547')}</svg>
      <div class="hwfx-fog"><span></span><span></span></div>
      <svg class="hwfx-pk hwfx-pk-l" viewBox="-40 -30 80 64" aria-hidden="true">${a.pumpkin(0, 0, 1)}</svg>
      <svg class="hwfx-pk hwfx-pk-r" viewBox="-70 -30 130 64" aria-hidden="true">${a.pumpkin(-24, 4, 0.75)}${a.pumpkin(18, 0, 1)}</svg>
      <svg class="hwfx-ghost hwfx-ghost-l" viewBox="-24 -24 48 56" aria-hidden="true">${a.ghost(0, 0, 1)}</svg>
      <svg class="hwfx-ghost hwfx-ghost-r" viewBox="-24 -24 48 56" aria-hidden="true">${a.ghost(0, 0, 1)}</svg>
      <div class="hwfx-bats" aria-hidden="true"><svg viewBox="-60 -30 120 60">${a.bat(-30, 0, 0.9)}${a.bat(12, -14, 0.65)}${a.bat(36, 8, 0.5)}</svg></div>
      <svg class="hwfx-sparkles" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
        ${a.sparkle(40, 120, 0.7, '#FFD166', 'hw-tw')}${a.sparkle(360, 80, 0.6, '#E8DEFF', 'hw-tw hw-tw2')}${a.sparkle(320, 250, 0.5, '#FFD166', 'hw-tw')}${a.sparkle(70, 260, 0.5, '#E8DEFF', 'hw-tw hw-tw2')}
      </svg>`;
  }
  function mount() {
    if (layer || !A()) return;
    layer = document.createElement('div');
    layer.id = 'hw-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = layerHtml();
    document.body.prepend(layer);
    bindTap();
  }
  function unmount() {
    if (layer) { layer.remove(); layer = null; }
  }
  function sync() {
    if (root.dataset.skin === 'halloween') mount(); else unmount();
  }

  /* ---------- ประกายเวทมนตร์เมื่อแตะ/คลิกปุ่ม ---------- */
  const TAP_SEL = '.btn, .mini-btn, .vd-seg-btn, .play-card, .home-link, .mode-card, #bottom-nav button, #bottom-nav a, .ev-ch-choice, .quiz-choice, .rk-choice';
  function bindTap() {
    if (tapBound) return;
    tapBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (root.dataset.skin !== 'halloween' || root.dataset.fx === 'lite' || reduced()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target.closest && e.target.closest(TAP_SEL);
      if (!t || t.disabled || bursts > 3) return;
      burst(e.clientX, e.clientY);
    }, { passive: true });
  }
  function burst(x, y) {
    bursts += 1;
    const el = document.createElement('div');
    el.className = 'hwfx-burst';
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.innerHTML = Array.from({ length: 7 }, (_, k) => {
      const ang = (k / 7) * Math.PI * 2 + Math.random() * 0.5;
      const d = 22 + Math.random() * 16;
      return `<i style="--dx:${(Math.cos(ang) * d).toFixed(0)}px;--dy:${(Math.sin(ang) * d).toFixed(0)}px"></i>`;
    }).join('');
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); bursts -= 1; }, 650);
  }

  /* ---------- แอนิเมชันต้อนรับเมื่อเปิดธีม ---------- */
  function celebrate() {
    if (!A()) return;
    const a = A();
    const el = document.createElement('div');
    el.className = 'hwfx-intro';
    el.setAttribute('aria-hidden', 'true');
    const bats = Array.from({ length: 9 }, (_, k) => {
      const ang = (k / 9) * Math.PI * 2;
      return `<span class="hwfx-ib" style="--dx:${(Math.cos(ang) * 60).toFixed(0)}vw;--dy:${(Math.sin(ang) * 55).toFixed(0)}vh;--d:${(k % 3) * 90}ms">
        <svg viewBox="-30 -15 60 30">${a.bat(0, 0, 1)}</svg></span>`;
    }).join('');
    el.innerHTML = `<div class="hwfx-ring"></div>${bats}
      <svg class="hwfx-ic" viewBox="-60 -50 120 100">${a.pumpkin(0, 6, 1.6)}${a.ghost(-44, -24, 0.8, 'hw-float')}${a.sparkle(44, -30, 1.4, '#FFD166', 'hw-tw')}</svg>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
    setTimeout(() => el.remove(), reduced() ? 900 : 2100);
  }

  /* ---------- หน้าโหลดตอนเปิดแอป (ผีน้อยลอย) ---------- */
  function endBoot() {
    if (!root.classList.contains('hw-booting')) return;
    root.classList.add('hw-boot-done');
    setTimeout(() => root.classList.remove('hw-booting', 'hw-boot-done'), 450);
  }
  window.addEventListener('eq:ready', endBoot);
  setTimeout(endBoot, 6000);   // กันค้าง

  if (detectLite()) root.dataset.fx = 'lite';
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-skin'] });
  document.addEventListener('visibilitychange', () => root.classList.toggle('hw-paused', document.hidden));
  sync();
  if (root.dataset.skin === 'halloween') setTimeout(probeFrames, 1500);
  else new MutationObserver((_, obs) => { if (root.dataset.skin === 'halloween') { obs.disconnect(); setTimeout(probeFrames, 1500); } })
    .observe(root, { attributes: true, attributeFilter: ['data-skin'] });

  window.EQHalloweenFx = { celebrate, sync };
})();
