/* =====================================================================
   หน้าเข้าสู่ระบบ — Interactive Parallax Background
   - ชั้นตกแต่งล้วน (aria-hidden, pointer-events: none) → ฟอร์ม/ปุ่ม Google ใช้งานได้ปกติ
   - คอมพิวเตอร์ (เมาส์) : ตามเคอร์เซอร์ ชั้นไกล 2–4px · กลาง 5–8px · ใกล้ 10–16px
                           ใช้ transform: translate3d() ใน requestAnimationFrame · หยุดลูปเมื่อหยุดขยับ
   - จอสัมผัส (มือถือ/แท็บเล็ต) : ไม่รันลูป JS และไม่ขยับชั้นพื้นหลัง — มีแค่ชิ้นเล็ก ๆ ลอยช้า ๆ ด้วย CSS
                           (เลเยอร์ที่ขยับตลอดใต้ iframe ทำให้แตะปุ่ม Google ไม่ติดบนเบราว์เซอร์มือถือบางตัว)
   - reduced motion / ประหยัดดาต้า : ภาพนิ่ง
   - หยุดเมื่อออกจากหน้านี้ / แท็บถูกซ่อน
   ===================================================================== */
(function () {
  const root = document.getElementById('auth-bg');
  if (!root) return;
  const screen = document.getElementById('screen-auth');
  const layers = [...root.querySelectorAll('.ab-layer')].map((el) => ({ el, depth: Number(el.dataset.depth) || 4 }));
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;

  function tier() {
    if (mq('(prefers-reduced-motion: reduce)')) return 'static';
    const conn = navigator.connection || {};
    if (conn.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 1)) return 'static';
    return mq('(hover: hover) and (pointer: fine)') ? 'full' : 'touch';
  }

  let q = tier();
  const target = { x: 0, y: 0 }; const cur = { x: 0, y: 0 };
  let raf = 0; let active = false;

  function apply() {
    for (const L of layers) L.el.style.transform = `translate3d(${(cur.x * L.depth).toFixed(2)}px, ${(cur.y * L.depth).toFixed(2)}px, 0)`;
  }
  function frame() {
    raf = 0;
    if (!active) return;
    cur.x += (target.x - cur.x) * 0.08; cur.y += (target.y - cur.y) * 0.08;
    apply();
    if (Math.abs(target.x - cur.x) > 0.002 || Math.abs(target.y - cur.y) > 0.002) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (active && !raf) raf = requestAnimationFrame(frame); };
  function onPointer(e) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;   // ไม่จำลองเมาส์บนจอสัมผัส
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
    kick();
  }
  function onLeave() { target.x = 0; target.y = 0; kick(); }

  function start() {
    if (active) return;
    q = tier();
    root.dataset.quality = q;
    if (q !== 'full') { for (const L of layers) L.el.style.transform = ''; return; }
    active = true;
    root.classList.add('is-live');
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    kick();
  }
  function stop() {
    active = false;
    root.classList.remove('is-live');
    if (raf) cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('pointerleave', onLeave);
  }
  const visible = () => screen && !screen.classList.contains('hidden') && !document.hidden;
  const sync = () => (visible() ? start() : stop());

  window.addEventListener('eq:auth', sync);
  document.addEventListener('visibilitychange', sync);
  ['(prefers-reduced-motion: reduce)', '(pointer: fine)'].forEach((x) => { const m = window.matchMedia && window.matchMedia(x); if (m && m.addEventListener) m.addEventListener('change', () => { stop(); sync(); }); });
  sync();
  window.EQAuthBg = { get quality() { return q; }, get active() { return active; } };
})();
