/* =====================================================================
   v1.26.3 หิมะตกในพื้นหลังแผงแชทโลก — window.EQChatSnow.mount(panelEl) → stop()
   - ใช้ค่าเดียวกับหิมะทั้งแอป: ปิดหิมะ (eq_snow) = ไม่มี · ความหนาแน่น น้อย/กลาง/มาก · สีเกล็ดตามธีม (data-snow-tone)
   - เกล็ดอยู่หลังข้อความ (canvas ชั้นล่างสุดของแผง · pointer-events: none) → อ่าน/กด/พิมพ์ได้ปกติ
   - จำนวนน้อย (แชทต้องอ่าน): 14 / 24 / 36 เกล็ด · 60 fps · โหมดประหยัดของหิมะหลัก → 30 fps และครึ่งความละเอียด
   - prefers-reduced-motion / ปิดเอฟเฟกต์เคลื่อนไหว → วาดภาพนิ่งครั้งเดียว · แท็บถูกซ่อน → หยุดลูป
   - ปิดแผง → หยุดลูปและลบ canvas (ไม่ค้างในหน่วยความจำ)
   ===================================================================== */
(function () {
  'use strict';
  const COUNT = { low: 14, medium: 24, high: 36 };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

  function mount(panel) {
    const fx = window.EQSnowFx;
    const prefs = fx && fx.prefs ? fx.prefs() : { on: lsGet('eq_snow') !== 'off', density: 'medium' };
    if (!panel || !prefs.on || document.documentElement.dataset.snow === 'off') return () => {};
    const st = fx && fx.stats ? fx.stats() : {};
    const low = !!st.lowPower;
    const still = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || lsGet('eq_fest_fx') === 'off';
    const cv = document.createElement('canvas');
    cv.className = 'gcp-snow'; cv.setAttribute('aria-hidden', 'true');
    panel.prepend(cv);
    const ctx = cv.getContext('2d');
    if (!ctx) { cv.remove(); return () => {}; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (low ? 0.5 : 1);
    let W = 0, H = 0;
    const resize = () => {
      const r = panel.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const n = COUNT[prefs.density] || COUNT.medium;
    const flakes = Array.from({ length: n }, () => {
      const z = Math.random();   // 0 ไกล … 1 ใกล้
      return { x: Math.random() * W, y: Math.random() * H, r: 1.6 + z * 3, vy: 16 + z * 34, a: 0.5 + z * 0.45, ph: Math.random() * 6.28, sw: 6 + z * 12, f: 0.4 + Math.random() * 0.6 };
    });
    const color = () => (document.documentElement.dataset.snowTone === 'light' ? '150,170,200' : '255,255,255');
    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      const c = color();
      for (const p of flakes) {
        const x = p.x + Math.sin(t * p.f + p.ph) * p.sw;
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 1.6);   // ขอบนุ่มแบบเกล็ดหิมะ ไม่ใช่จุดแข็ง
        g.addColorStop(0, `rgba(${c},${p.a})`); g.addColorStop(0.55, `rgba(${c},${p.a * 0.75})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.beginPath(); ctx.fillStyle = g; ctx.arc(x, p.y, p.r * 1.6, 0, 6.2832); ctx.fill();
      }
    };
    let raf = 0, last = 0, acc = 0, stopped = false;
    const step = low ? 1000 / 30 : 1000 / 60;
    const frame = (now) => {
      raf = 0;
      if (stopped || !cv.isConnected) return stop();
      if (!document.hidden) {
        const dt = last ? Math.min(100, now - last) : 16; last = now; acc += dt;
        if (acc >= step - 1) {
          const s = acc / 1000; acc = 0;
          for (const p of flakes) { p.y += p.vy * s; if (p.y - p.r > H) { p.y = -4; p.x = Math.random() * W; } }
          draw(now / 1000);
        }
      } else last = 0;
      raf = requestAnimationFrame(frame);
    };
    const ro = window.ResizeObserver ? new ResizeObserver(() => { resize(); if (still) draw(0); }) : null;
    if (ro) ro.observe(panel);
    function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf); raf = 0;
      if (ro) ro.disconnect();
      cv.remove();
    }
    if (still) draw(0); else raf = requestAnimationFrame(frame);
    mount._last = { flakes: n, low, still };
    return stop;
  }
  window.EQChatSnow = { mount, _info: () => mount._last || null };
}());
