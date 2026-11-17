/* =====================================================================
   ธีมตามฤดูกาล — v1.18.0 — window.EQSeason
   เซิร์ฟเวอร์เป็นผู้บอกว่าตอนนี้อยู่ในช่วงเทศกาลไหน (GET /api/season · config/season.js) → เปลี่ยนให้ผู้ใช้ทุกคนอัตโนมัติ
   - <html data-season="loykrathong"> · เพลงหน้าแรก (audio.js อ่าน EQSeason.homeMusic)
   - โลโก้ในแอป / favicon: โหลดจาก /brand/<ไฟล์> (เซิร์ฟเวอร์เลือกไฟล์ตามฤดูกาล) + เติม &s=<ฤดูกาล> ให้เบราว์เซอร์โหลดใหม่ทันทีเมื่อเปลี่ยนช่วง
   ===================================================================== */
(function () {
  const S = { key: null, id: null, homeMusic: null, nameTh: null };
  window.EQSeason = S;
  function swapBrand(tag) {
    const bust = (u) => { const base = u.replace(/[?&]s=[^&\s]*/g, ''); return `${base}${base.includes('?') ? '&' : '?'}s=${tag}`; };
    document.querySelectorAll('img.brand-mark').forEach((img) => {
      img.src = bust(img.getAttribute('src'));
      const ss = img.getAttribute('srcset');
      if (ss) img.setAttribute('srcset', ss.split(',').map((p) => { const [u, d] = p.trim().split(/\s+/); return `${bust(u)} ${d || ''}`.trim(); }).join(', '));
    });
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => { l.href = bust(l.getAttribute('href')); });
  }
  async function load() {
    let s = null;
    try { const r = await fetch('/api/season', { credentials: 'same-origin' }); if (r.ok) s = (await r.json()).season; } catch (_) { /* ออฟไลน์: ใช้ไฟล์ที่โหลดไว้ */ }
    Object.assign(S, s ? { key: s.key, id: s.id, homeMusic: s.homeMusic || null, nameTh: s.nameTh } : { key: null, id: null, homeMusic: null, nameTh: null });
    if (s) document.documentElement.dataset.season = s.key; else delete document.documentElement.dataset.season;
    swapBrand(S.id || 'base');   // URL เดิมถ้าฤดูกาลไม่เปลี่ยน → เบราว์เซอร์ไม่โหลดซ้ำ
    window.dispatchEvent(new CustomEvent('eq:season', { detail: { ...S } }));
  }
  load();
  setInterval(load, 30 * 60 * 1000);   // แอปเปิดค้างข้ามช่วงเทศกาล → เปลี่ยนเอง
}());
