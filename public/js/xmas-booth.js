/* v1.25.3 — ตัวประกอบภาพ Christmas Photo Booth (ทำงานในเครื่องผู้ใช้ทั้งหมด · ไม่อัปโหลดรูป)
   ชั้นภาพแยกกัน ควบคุมได้ทีละชั้น (ล่าง → บน):
     village   ฉากหลังหมู่บ้านคริสต์มาส (เรนเดอร์ 3D ด้วย Blender · ระยะชัดตื้น)
     stars     ดาวระยิบบนฟ้า
     glow      แสงบรรยากาศสีทองหลังตัวละคร + แสงจากพื้น
     shadows   เงาต้นไม้/ของขวัญ (เรนเดอร์จริง) + เงาสัมผัสพื้นใต้ตัวละคร
     reflect   แสงสะท้อนบนพื้นหิมะ/น้ำแข็ง (ต้นไม้ + ตัวละคร)
     trees     ต้นสน 3D สองต้น (ซ้าย/ขวา) — ขนาดและระยะคำนวณจากกรอบตัวละครจริง ไม่บังตัวละคร
     lights    แสงหลอดไฟกะพริบ + ดาวเรืองแสงบนยอดต้นไม้
     avatar    ตัวละคร 3D ของผู้เล่น (ภาพ PNG ความละเอียดสูงจากตัวแสดงผล 3D · หน้าตา/สีผิว/รูปร่างเดิม)
     gifts     กองกล่องของขวัญด้านหน้า (มุมล่าง ไม่ทับตัวละคร)
     snow      หิมะตกแบบกำหนดผล (seeded) — ภาพตัวอย่างเคลื่อนไหว · ภาพที่บันทึก = เฟรมเดียวกันกับที่แสดงอยู่
     frame     กรอบทอง + ใบฮอลลี่ + ข้อความ
   ภาพตัวอย่างกับภาพที่บันทึกคือ canvas เดียวกันขนาดเต็ม (1080×1350 / 1080×1920) วาดด้วยฟังก์ชันเดียวกัน → ตรงกันทุกพิกเซล */
(function () {
  'use strict';
  const BASE = '/img/christmas/booth/';
  const FILES = ['village', 'tree_a', 'tree_a_shadow', 'tree_b', 'tree_b_shadow', 'gifts_l', 'gifts_l_shadow', 'gifts_r', 'gifts_r_shadow'];
  const FORMATS = {
    post: { W: 1080, H: 1350, floor: 0.865, avatarH: 0.6, treeH: 0.68, title: 0.105, sub: 0.152, foot: 0.957 },
    story: { W: 1080, H: 1920, floor: 0.835, avatarH: 0.44, treeH: 0.5, title: 0.115, sub: 0.152, foot: 0.93 },
  };
  const LAYERS = ['village', 'stars', 'glow', 'shadows', 'reflect', 'trees', 'lights', 'avatar', 'gifts', 'snow', 'frame'];
  let assets = null; let loading = null;

  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
  }
  /** โหลดชุดภาพครั้งเดียว (ไฟล์ WebP ~1 MB รวม · โหลดเมื่อเปิด Photo booth เท่านั้น) */
  function load() {
    if (assets) return Promise.resolve(assets);
    if (loading) return loading;
    loading = (async () => {
      const meta = await fetch(`${BASE}booth.json`, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('meta'); return r.json(); });
      const imgs = await Promise.all(FILES.map((f) => loadImg(`${BASE}${f}.webp?v=${meta.v || 1}`)));
      assets = { meta, img: Object.fromEntries(FILES.map((f, i) => [f, imgs[i]])) };
      return assets;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // ---------- ตัวสุ่มแบบกำหนดผล ----------
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** กรอบทึบของตัวละครในภาพ (สัดส่วน 0..1) — ใช้วางต้นไม้/ของขวัญไม่ให้ทับ */
  function alphaBox(img) {
    const n = 220; const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    let x0 = n; let y0 = n; let x1 = -1; let y1 = -1;
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (d[(y * n + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    return { x: x0 / n, y: y0 / n, w: (x1 - x0 + 1) / n, h: (y1 - y0 + 1) / n };
  }

  // ---------- จัดองค์ประกอบ ----------
  function layout(fmt, st) {
    const F = FORMATS[fmt]; const { W, H } = F; const M = assets.meta;
    const floorY = F.floor * H;
    const L = { W, H, floorY, F };
    // ตัวละคร: ความสูงที่มองเห็นตามสัดส่วนภาพ · เท้าแตะพื้น · กึ่งกลางตามกรอบทึบจริง
    const box = st.avatarBox || { x: 0.3, y: 0.06, w: 0.4, h: 0.9 };
    const aH = F.avatarH * H; const s = aH / (box.h * (st.avatar ? st.avatar.height : 1000));
    const iw = (st.avatar ? st.avatar.width : 1000) * s; const ih = (st.avatar ? st.avatar.height : 1000) * s;
    const ax = W / 2 - (box.x + box.w / 2) * iw; const ay = floorY + H * 0.004 - (box.y + box.h) * ih;
    L.avatar = { x: ax, y: ay, w: iw, h: ih, left: ax + box.x * iw, right: ax + (box.x + box.w) * iw, top: ay + box.y * ih, bottom: floorY };
    // ต้นไม้: ฐานอยู่หลังตัวละครเล็กน้อย (สูงกว่าพื้นด้านหน้า) · ขอบด้านในห่างจากตัวละคร ≥ 2% ของความกว้าง
    const gap = W * 0.02;
    L.trees = ['tree_a', 'tree_b'].map((k, i) => {
      const m = M[k]; const img = assets.img[k];
      const hPx = (m.base[1] - m.top[1]) * img.height;
      let sc = (F.treeH * H) / hPx;
      const half = () => m.halfWidth * img.width * sc * 1.12;
      const side = i === 0 ? -1 : 1;
      // ระยะที่ต้องเว้นจากขอบตัวละคร
      const edge = side < 0 ? L.avatar.left - gap : W - (L.avatar.right + gap);
      // ยอมให้ต้นไม้ล้นขอบภาพได้ไม่เกิน 38% ของความกว้างต้น · ถ้ายังทับ → ย่อต้นไม้ (ไม่ต่ำกว่า 72%)
      for (let k2 = 0; k2 < 12 && half() * 2 * (1 - 0.38) > edge; k2 += 1) sc *= 0.97;
      const hw = half();
      const cxEdge = side < 0 ? Math.min(W * 0.2, L.avatar.left - gap - hw) : Math.max(W * 0.8, L.avatar.right + gap + hw);
      const cx = cxEdge;
      const baseY = floorY - H * 0.022;
      const w = img.width * sc; const h = img.height * sc;
      const x = cx - m.base[0] * w; const y = baseY - m.base[1] * h;
      return { key: k, img, shadow: assets.img[`${k}_shadow`], m, x, y, w, h, baseY, sc };
    });
    // ของขวัญ: มุมล่างด้านหน้า ไม่ทับกรอบตัวละคร
    L.gifts = ['gifts_l', 'gifts_r'].map((k, i) => {
      const m = M[k]; const img = assets.img[k];
      let w = W * (fmt === 'story' ? 0.36 : 0.32);
      const side = i === 0 ? -1 : 1;
      const room = side < 0 ? L.avatar.left - W * 0.012 : W - L.avatar.right - W * 0.012;
      // ยอมล้นขอบภาพ 12% ของความกว้างกอง
      w = Math.min(w, room / 0.88);
      const h = w * img.height / img.width;
      const baseY = floorY + H * (fmt === 'story' ? 0.07 : 0.06);
      const x = side < 0 ? -w * 0.12 : W - w * 0.88;
      return { key: k, img, shadow: assets.img[`${k}_shadow`], m, x, y: baseY - m.base[1] * h, w, h, baseY };
    });
    return L;
  }

  // ---------- ชั้นภาพ ----------
  function drawVillage(g, L) {
    const img = assets.img.village;
    const s = Math.max(L.W / img.width, L.H / img.height);
    const w = img.width * s; const h = img.height * s;
    // ให้เส้นขอบฟ้าของฉาก (กลางภาพเรนเดอร์) อยู่ระดับอกตัวละคร
    const horizon = (L.avatar.top + L.floorY) / 2 + (L.floorY - L.avatar.top) * 0.08;
    let y = horizon - h * 0.5; y = Math.min(0, Math.max(L.H - h, y));
    g.drawImage(img, (L.W - w) / 2, y, w, h);
    // ไล่สีด้านบน/ล่างให้กลมกลืนกับกรอบและข้อความ
    const top = g.createLinearGradient(0, 0, 0, L.H * 0.3); top.addColorStop(0, 'rgba(3,6,20,.7)'); top.addColorStop(1, 'rgba(3,6,20,0)');
    g.fillStyle = top; g.fillRect(0, 0, L.W, L.H * 0.3);
    // พื้นหิมะด้านหน้าโทนน้ำเงินเย็น (ให้ตัวละครและแสงอุ่นเด่น ไม่ขาวจ้า)
    const fl = g.createLinearGradient(0, L.floorY - L.H * 0.08, 0, L.H);
    fl.addColorStop(0, 'rgba(14,26,62,0)'); fl.addColorStop(0.35, 'rgba(14,26,62,.28)'); fl.addColorStop(1, 'rgba(8,14,38,.55)');
    g.fillStyle = fl; g.fillRect(0, L.floorY - L.H * 0.08, L.W, L.H);
    const vg = g.createRadialGradient(L.W / 2, L.H * 0.55, L.H * 0.3, L.W / 2, L.H * 0.55, L.H * 0.78);
    vg.addColorStop(0, 'rgba(2,4,14,0)'); vg.addColorStop(1, 'rgba(2,4,14,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, L.W, L.H);
  }
  function drawGlow(g, L) {
    const a = L.avatar; const cx = L.W / 2; const cy = (a.top + L.floorY) / 2;
    g.save(); g.globalCompositeOperation = 'screen';
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, L.W * 0.62);
    gl.addColorStop(0, 'rgba(255,196,120,.34)'); gl.addColorStop(0.45, 'rgba(255,160,80,.12)'); gl.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = gl; g.fillRect(0, 0, L.W, L.H);
    // แสงตกกระทบพื้นหิมะ (แสงอุ่นเป็นวงรีบนพื้น)
    g.translate(cx, L.floorY); g.scale(1, 0.22);
    const fl = g.createRadialGradient(0, 0, 0, 0, 0, L.W * 0.6);
    fl.addColorStop(0, 'rgba(255,205,140,.42)'); fl.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = fl; g.beginPath(); g.arc(0, 0, L.W * 0.6, 0, 6.283); g.fill();
    g.restore();
  }
  function drawShadows(g, L, st) {
    g.save();
    if (st.layers.trees) L.trees.forEach((tr) => { g.globalAlpha = 0.85; g.drawImage(tr.shadow, tr.x, tr.y, tr.w, tr.h); });
    if (st.avatar && st.layers.avatar) {
      const a = L.avatar; const w = (a.right - a.left) * 0.62;
      g.globalAlpha = 1; g.translate((a.left + a.right) / 2, L.floorY - L.H * 0.002); g.scale(1, 0.16);
      const sh = g.createRadialGradient(0, 0, 0, 0, 0, w);
      sh.addColorStop(0, 'rgba(6,10,28,.62)'); sh.addColorStop(0.55, 'rgba(6,10,28,.28)'); sh.addColorStop(1, 'rgba(6,10,28,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, w, 0, 6.283); g.fill();
    }
    g.restore();
  }
  function drawReflect(g, L, st) {
    // วาดภาพกลับหัวรอบเส้นพื้นลงบนชั้นแยก → ไล่จางด้วย mask → ซ้อนแบบโปร่งแสง (พื้นหิมะอัดแน่น/น้ำแข็ง)
    const c = document.createElement('canvas'); c.width = L.W; c.height = L.H; const r = c.getContext('2d');
    const flip = (img, x, y, w, h, base) => { r.save(); r.translate(0, base * 2); r.scale(1, -1); r.drawImage(img, x, y, w, h); r.restore(); };
    if (st.layers.trees) L.trees.forEach((tr) => flip(tr.img, tr.x, tr.y, tr.w, tr.h, tr.baseY));
    if (st.avatar && st.layers.avatar) flip(st.avatar, L.avatar.x, L.avatar.y, L.avatar.w, L.avatar.h, L.floorY);
    r.globalCompositeOperation = 'destination-in';
    const m = r.createLinearGradient(0, L.floorY - L.H * 0.03, 0, L.floorY + L.H * 0.13);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.2, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = m; r.fillRect(0, 0, L.W, L.H);
    g.save(); g.globalAlpha = 0.2; g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); g.restore();
  }
  function drawTrees(g, L) { L.trees.forEach((tr) => g.drawImage(tr.img, tr.x, tr.y, tr.w, tr.h)); }
  function drawLights(g, L, t) {
    g.save(); g.globalCompositeOperation = 'lighter';
    L.trees.forEach((tr, ti) => {
      const r = rng(31 + ti * 7);
      tr.m.lights.forEach((p, i) => {
        const ph = r() * 6.28; const sp = 1.2 + r() * 2.2;
        if (!tr.m.front[i]) return;
        const x = tr.x + p[0] * tr.w; const y = tr.y + p[1] * tr.h;
        const k = 0.55 + 0.45 * Math.sin(t * sp + ph);
        const rad = tr.w * 0.016 * (0.8 + 0.5 * k);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(255,226,160,${(0.65 * k).toFixed(3)})`); gr.addColorStop(0.35, `rgba(255,170,70,${(0.28 * k).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,150,60,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
      // ดาวบนยอด: แสงเรือง + ประกายสี่แฉกหมุนช้า
      const sx = tr.x + tr.m.star[0] * tr.w; const sy = tr.y + tr.m.star[1] * tr.h; const R = tr.w * 0.16;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.3 + ti);
      const gs = g.createRadialGradient(sx, sy, 0, sx, sy, R);
      gs.addColorStop(0, `rgba(255,236,170,${(0.75 * pulse).toFixed(3)})`); gs.addColorStop(0.25, `rgba(255,196,90,${(0.32 * pulse).toFixed(3)})`); gs.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = gs; g.fillRect(sx - R, sy - R, R * 2, R * 2);
      g.save(); g.translate(sx, sy); g.rotate(t * 0.15 + ti);
      for (let q = 0; q < 4; q += 1) {
        g.rotate(Math.PI / 2);
        const ray = g.createLinearGradient(0, 0, R * 0.9, 0); ray.addColorStop(0, `rgba(255,240,200,${(0.55 * pulse).toFixed(3)})`); ray.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = ray; g.beginPath(); g.moveTo(0, -R * 0.025); g.lineTo(R * 0.9, 0); g.lineTo(0, R * 0.025); g.fill();
      }
      g.restore();
    });
    g.restore();
  }
  function drawAvatar(g, L, st) { if (st.avatar) g.drawImage(st.avatar, L.avatar.x, L.avatar.y, L.avatar.w, L.avatar.h); }
  function drawGifts(g, L, st) {
    L.gifts.forEach((gf) => {
      if (st.layers.shadows) { g.save(); g.globalAlpha = 0.9; g.drawImage(gf.shadow, gf.x, gf.y, gf.w, gf.h); g.restore(); }
      g.drawImage(gf.img, gf.x, gf.y, gf.w, gf.h);
    });
  }
  // หิมะ: สไปรต์เกล็ดนุ่ม 3 ระยะ (ไกล/กลาง/ใกล้) · ตำแหน่ง = f(t) จึงวาดซ้ำได้ตรงกัน
  const sprites = {};
  function flake(rad, soft) {
    const k = `${rad}|${soft}`; if (sprites[k]) return sprites[k];
    const c = document.createElement('canvas'); const n = Math.ceil(rad * 2 + 2); c.width = n; c.height = n; const g = c.getContext('2d');
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, rad);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft, 'rgba(240,246,255,.85)'); gr.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n); sprites[k] = c; return c;
  }
  function drawSnow(g, L, t) {
    const r = rng(2026); const n = Math.round(L.W * L.H / 7000);
    for (let i = 0; i < n; i += 1) {
      const d = r(); const depth = d < 0.55 ? 0 : d < 0.92 ? 1 : 2;
      const x0 = r() * L.W; const y0 = r() * L.H; const ph = r() * 6.28; const sw = 0.4 + r() * 0.8;
      const size = [1.6 + r() * 1.4, 3 + r() * 2.2, 7 + r() * 5][depth];
      const speed = [26, 48, 95][depth] * (0.8 + r() * 0.4);
      const span = L.H + size * 4;
      const y = ((y0 + speed * t) % span) - size * 2;
      const x = x0 + Math.sin(t * sw + ph) * (8 + depth * 10) + t * 6 * (depth + 1) % L.W;
      const xx = ((x % L.W) + L.W) % L.W;
      g.globalAlpha = [0.55, 0.8, 0.55][depth];
      const sp = flake(Math.round(size), depth === 2 ? 0.25 : 0.45);
      g.drawImage(sp, xx - sp.width / 2, y - sp.height / 2);
    }
    g.globalAlpha = 1;
  }
  function holly(g, x, y, s, rot) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    const leaf = (a) => {
      g.save(); g.rotate(a);
      const lg = g.createLinearGradient(0, -10, 0, 60); lg.addColorStop(0, '#2f7a4c'); lg.addColorStop(1, '#0f3d26');
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(14, 8, 8, 16, 18, 22); g.bezierCurveTo(10, 26, 14, 34, 20, 42); g.bezierCurveTo(10, 42, 8, 50, 2, 60);
      g.bezierCurveTo(-4, 50, -10, 44, -18, 44); g.bezierCurveTo(-12, 36, -10, 28, -18, 24); g.bezierCurveTo(-8, 18, -12, 8, 0, 0); g.fill();
      g.strokeStyle = 'rgba(190,230,190,.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 2); g.quadraticCurveTo(2, 30, 2, 56); g.stroke();
      g.restore();
    };
    leaf(-0.5); leaf(0.55); leaf(-1.6);
    [[-6, -4], [6, -6], [0, 6]].forEach(([bx, by]) => {
      const bg = g.createRadialGradient(bx - 2.5, by - 2.5, 1, bx, by, 9); bg.addColorStop(0, '#ff8a8a'); bg.addColorStop(0.4, '#d42a35'); bg.addColorStop(1, '#7a0d18');
      g.fillStyle = bg; g.beginPath(); g.arc(bx, by, 8, 0, 6.283); g.fill();
    });
    g.restore();
  }
  function drawFrame(g, L, st) {
    const { W, H, F } = L; const m = W * 0.026;
    const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, '#fbe7a8'); gold.addColorStop(0.35, '#d4a24c'); gold.addColorStop(0.6, '#f6dc94'); gold.addColorStop(1, '#b07a2c');
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 10;
    g.strokeStyle = gold; g.lineWidth = 7; rr(m, m, W - m * 2, H - m * 2, 28); g.stroke();
    g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = 'rgba(251,231,168,.8)'; rr(m + 14, m + 14, W - m * 2 - 28, H - m * 2 - 28, 18); g.stroke();
    g.restore();
    const hs = W / 1080;
    holly(g, m + 40 * hs, m + 40 * hs, 1.25 * hs, -0.3); holly(g, W - m - 40 * hs, m + 40 * hs, 1.25 * hs, 0.3 + Math.PI / 2);
    holly(g, m + 40 * hs, H - m - 40 * hs, 1.25 * hs, -Math.PI / 2 - 0.3); holly(g, W - m - 40 * hs, H - m - 40 * hs, 1.25 * hs, Math.PI + 0.3);
    // หัวเรื่อง
    g.save(); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const fs = Math.round(W * 0.09);
    g.font = `italic 700 ${fs}px "Playfair Display", Georgia, "Times New Roman", serif`;
    const tg = g.createLinearGradient(0, F.title * H - fs, 0, F.title * H + 6); tg.addColorStop(0, '#fff6d8'); tg.addColorStop(0.55, '#f2cf7a'); tg.addColorStop(1, '#c08a35');
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 18; g.shadowOffsetY = 4;
    g.fillStyle = tg; g.fillText('Merry Christmas', W / 2, F.title * H);
    g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.font = `700 ${Math.round(W * 0.026)}px "Plus Jakarta Sans", "Noto Sans Thai", sans-serif`;
    g.fillStyle = '#E8F1FF';
    const sub = 'ENGLISHQUEST  ·  CHRISTMAS 2026';
    if ('letterSpacing' in g) g.letterSpacing = `${Math.round(W * 0.006)}px`;
    g.fillText(sub, W / 2, F.sub * H);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    // ป้ายชื่อ (เลือกใส่เอง · ค่าเริ่มต้นไม่ใส่)
    if (st.showName && st.username) {
      const name = String(st.username).slice(0, 24);
      g.font = `800 ${Math.round(W * 0.034)}px "Plus Jakarta Sans", "Noto Sans Thai", sans-serif`;
      const tw = g.measureText(name).width; const ph = W * 0.064; const pw = tw + W * 0.08; const py = F.foot * H - ph * 0.72;
      g.shadowBlur = 14; g.shadowOffsetY = 3; g.fillStyle = 'rgba(12,20,44,.78)';
      rr(W / 2 - pw / 2, py, pw, ph, ph / 2); g.fill();
      g.shadowBlur = 0; g.shadowOffsetY = 0; g.lineWidth = 2.5; g.strokeStyle = gold; g.stroke();
      g.fillStyle = '#FFF6D8'; g.textBaseline = 'middle'; g.fillText(name, W / 2, py + ph / 2 + 1);
    }
    g.restore();
  }

  /* ชั้นนิ่งถูกแคชเป็น 3 แผ่น (หลัง / ตัวละคร+ของขวัญ / กรอบ) — สร้างใหม่เมื่อ st.rev หรือรูปแบบเปลี่ยน
     ต่อเฟรมวาดเฉพาะดาว ไฟกะพริบ และหิมะ → ภาพตัวอย่างลื่นบนมือถือ · ภาพที่บันทึกใช้ฟังก์ชันเดียวกันทุกประการ */
  let cache = null;
  function sheet(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  function build(fmt, st) {
    const L = layout(fmt, st); const on = st.layers;
    const back = sheet(L.W, L.H); const b = back.getContext('2d');
    b.fillStyle = '#0b1430'; b.fillRect(0, 0, L.W, L.H);
    if (on.village) drawVillage(b, L);
    if (on.glow) drawGlow(b, L);
    if (on.shadows) drawShadows(b, L, st);
    if (on.reflect) drawReflect(b, L, st);
    if (on.trees) drawTrees(b, L);
    const front = sheet(L.W, L.H); const f = front.getContext('2d');
    if (on.avatar) drawAvatar(f, L, st);
    if (on.gifts) drawGifts(f, L, st);
    const frame = sheet(L.W, L.H);
    if (on.frame) drawFrame(frame.getContext('2d'), L, st);
    return { key: `${fmt}|${st.rev}`, L, back, front, frame };
  }
  // ดาวบนฟ้าไม่วาดทับต้นไม้ (ตรวจด้วยรูปสามเหลี่ยมคร่าว ๆ ของทรงต้น)
  function inTree(L, x, y) {
    return L.trees.some((tr) => {
      const sx = tr.x + tr.m.star[0] * tr.w; const sy = tr.y + tr.m.star[1] * tr.h - tr.h * 0.05;
      if (y < sy || y > tr.baseY) return false;
      const hw = tr.m.halfWidth * tr.w * 1.25 * (y - sy) / (tr.baseY - sy) + tr.w * 0.06;
      return Math.abs(x - sx) < hw;
    });
  }
  function drawStarsMasked(g, L, t) {
    const r = rng(77); const n = 70;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 1) {
      const x = r() * L.W; const y = r() * L.avatar.top * 0.95; const s = 0.8 + r() * 1.8; const ph = r() * 6.28; const sp = 0.6 + r() * 1.6;
      const a = (0.35 + 0.35 * Math.sin(t * sp + ph)) * (1 - y / (L.avatar.top * 1.1));
      if (a <= 0.02 || inTree(L, x, y)) continue;
      g.fillStyle = `rgba(235,240,255,${a.toFixed(3)})`; g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill();
    }
    g.restore();
  }
  /** วาดทั้งภาพที่เวลา t (วินาที) — ใช้ทั้งภาพตัวอย่างและภาพที่บันทึก */
  function render(g, fmt, st, t) {
    if (!cache || cache.key !== `${fmt}|${st.rev}`) cache = build(fmt, st);
    const { L, back, front, frame } = cache; const on = st.layers;
    g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(back, 0, 0);
    if (on.stars && on.village) drawStarsMasked(g, L, t);
    if (on.trees && on.lights) drawLights(g, L, t);
    g.drawImage(front, 0, 0);
    if (on.snow) drawSnow(g, L, t);
    g.drawImage(frame, 0, 0);
    g.restore();
    return L;
  }
  function invalidate() { cache = null; }

  window.EQXmasBooth = { load, render, invalidate, layout, alphaBox, FORMATS, LAYERS, _assets: () => assets };
}());
