/* =====================================================================
   Loy Krathong · Enchanted Moonlight Festival — ชั้นเอฟเฟกต์ (v1.23.0) — window.EQLanternFx
   ทำงานเมื่อ <html data-skin="loykrathong"> (ธีมเทศกาลอัตโนมัติ หรือธีมพิเศษที่ปลดล็อกแล้ว)

   - Canvas เดียวทั้งแอป (#lk-fx) อยู่ "ใต้" เนื้อหา: position fixed · z-index -1 · pointer-events none
     → ไม่บังปุ่ม/ฟอร์ม/แชท/ตัวละคร 3D/หน้าต่าง Modal เห็นเฉพาะช่องว่างของฉาก
   - โคมลอย 3 ระยะ (ไกล/กลาง/ใกล้): ขนาด ความเร็ว ความสว่าง ต่างกัน · โยกตามลม · เปลวไฟกระพริบ · Fade เข้า/ออก
     ใช้ "พูล" ขนาดคงที่ — โคมที่พ้นฉากถูกนำกลับมาเกิดใหม่ (ไม่มีการสร้าง DOM/อ็อบเจกต์ใหม่ระหว่างเล่น)
   - ดาวระยิบ · หิ่งห้อย/ฝุ่นทอง · แม่น้ำ: ระลอกคลื่น แสงจันทร์สะท้อน กระทงใบตองลอยตามน้ำ (เฉพาะหน้าที่มีฉากเต็ม)
   - Timer เดียว: requestAnimationFrame (หยุดเองเมื่อแท็บถูกซ่อน) · ไม่มี setInterval / setTimeout สะสม
   - ระดับตามหน้า: full (เข้าสู่ระบบ/หน้าแรก/เทศกาล) · light (เส้นทางการเรียน ฯลฯ โคมไกลไม่กี่ดวง) · off (ทำข้อสอบ/Ranked/แบบฝึก)
   - ลดการเคลื่อนไหว (prefers-reduced-motion) หรือผู้ใช้ปิดเอฟเฟกต์ → วาดภาพนิ่ง 1 ครั้ง (ฉากยังสวย ไม่มีแอนิเมชัน)
   - ปรับจำนวนตามจอ/เครื่อง: คอม 12 · แท็บเล็ต 8 · มือถือ 5 (เครื่องอ่อน/เฟรมตก → ลดเองอัตโนมัติ)
   ===================================================================== */
(function () {
  'use strict';
  const root = document.documentElement;
  const TAU = Math.PI * 2;
  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pref = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

  // ---------- ระดับตามหน้า ----------
  const FULL_SCREENS = new Set(['screen-auth', 'screen-home', 'screen-festival', 'screen-event', 'screen-play']);
  // หน้าที่ต้องใช้สมาธิ (คำถาม/เกม/แบบฝึก) → ปิดแอนิเมชัน
  const OFF_RE = /(quiz|match|battle-(play|lobby|result)|lesson|placement|assessment|tcas|endless|draw|speak|toeic|grammar-(lesson|quiz|result)|c2-|graded|flash|review|write|exam|game|test|study|practice|dictation|reader|vocab-card|gl-(writing|topic|mistakes)|work)/;
  function levelFor(screenId) {
    if (!screenId) return 'light';
    if (FULL_SCREENS.has(screenId)) return 'full';
    if (OFF_RE.test(screenId)) return 'off';
    return 'light';
  }

  // ---------- สถานะ ----------
  let canvas = null; let ctx = null;
  let W = 0; let H = 0; let DPR = 1;
  let raf = 0; let running = false; let lastT = 0; let acc = 0;
  let level = 'off'; let screenId = null;
  let lastScroll = 0;
  let riverGrad = null; let riverGradKey = '';
  let stepMs = 1000 / 60;                 // มือถือ 30 fps
  let quality = 1;                        // 1 → ลดลงเมื่อเฟรมตก
  let slowAcc = 0; let slowFrames = 0; let sampleFrames = 0;
  const stats = { frames: 0, spawned: 0, mode: 'off', active: 0, pool: 0, startedAt: 0, quality: 1, dpr: 1 };

  // ---------- สไปรต์ (วาดครั้งเดียว) ----------
  const SPR = { lanterns: [], glow: null, twinkle: null, ember: null, krathong: [], candleGlow: null };
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

  /** โคมลอยกระดาษสา: ทรงกระบอกโค้ง ปากล่างเปิด เปลวไฟด้านใน — 6 แบบ (สัดส่วน/โทนสีต่างกัน) */
  const LANTERN_VARIANTS = [
    { w: 1.00, h: 1.32, top: 0.30, tone: ['#FFF1CF', '#FFC771', '#E8873A', '#9C4A22'] },   // ทองอำพัน
    { w: 0.92, h: 1.42, top: 0.22, tone: ['#FFF4DB', '#F4CC82', '#D99447', '#8C5126'] },   // ครีมทอง
    { w: 1.08, h: 1.22, top: 0.38, tone: ['#FFE9D2', '#FFAC4D', '#E06A2E', '#8E3A1C'] },   // ส้มแสงเทียน
    { w: 0.96, h: 1.36, top: 0.26, tone: ['#FFEDE8', '#F2B7A0', '#D9806E', '#7E3C3A'] },   // ชมพูอมส้ม (บัว)
    { w: 1.04, h: 1.28, top: 0.34, tone: ['#FFF6E0', '#FFD58A', '#EE9C3E', '#94511F'] },   // เหลืองนวล
    { w: 0.88, h: 1.48, top: 0.20, tone: ['#FFF0D8', '#FFB866', '#E37B35', '#86401C'] },   // ทรงสูง
  ];
  function drawLanternSprite(v) {
    const S = 64;                                   // หน่วยฐาน (วาดที่ 2x แล้วย่อ)
    const bw = S * v.w; const bh = S * v.h;
    const c = mk(bw + 8, bh + 14); const g = c.getContext('2d');
    const cx = c.width / 2; const top = 4; const bot = top + bh;
    const tw = bw * 0.5; const bwid = bw * 0.36;     // ครึ่งความกว้างบน/ล่าง
    g.beginPath();
    g.moveTo(cx - bwid, bot);
    g.bezierCurveTo(cx - tw * 1.06, bot - bh * 0.42, cx - tw * 1.02, top + bh * v.top, cx - tw * 0.72, top + bh * 0.06);
    g.quadraticCurveTo(cx, top - bh * 0.05, cx + tw * 0.72, top + bh * 0.06);
    g.bezierCurveTo(cx + tw * 1.02, top + bh * v.top, cx + tw * 1.06, bot - bh * 0.42, cx + bwid, bot);
    g.closePath();
    // แสงจากเปลวไฟด้านใน: สว่างที่ล่างกลาง → เข้มที่ขอบบน
    const rg = g.createRadialGradient(cx, bot - bh * 0.12, 2, cx, bot - bh * 0.35, bh * 0.95);
    rg.addColorStop(0, v.tone[0]); rg.addColorStop(0.32, v.tone[1]); rg.addColorStop(0.72, v.tone[2]); rg.addColorStop(1, v.tone[3]);
    g.fillStyle = rg; g.fill();
    // ขอบ/เงาด้านข้าง ให้ดูเป็นทรงกลม
    g.save(); g.clip();
    const side = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
    side.addColorStop(0, 'rgba(70,20,10,0.38)'); side.addColorStop(0.22, 'rgba(70,20,10,0)'); side.addColorStop(0.78, 'rgba(70,20,10,0)'); side.addColorStop(1, 'rgba(70,20,10,0.42)');
    g.fillStyle = side; g.fillRect(0, 0, c.width, c.height);
    // โครงไม้ไผ่บาง ๆ (ซี่ตั้ง) — ไม่เหมือนกันทุกดวงเพราะสัดส่วนต่างกัน
    g.strokeStyle = 'rgba(120,50,20,0.22)'; g.lineWidth = 1;
    for (let i = -2; i <= 2; i += 1) {
      g.beginPath(); g.moveTo(cx + i * tw * 0.34, top + 2); g.quadraticCurveTo(cx + i * tw * 0.44, top + bh * 0.5, cx + i * bwid * 0.42, bot); g.stroke();
    }
    g.restore();
    // ปากโคม (ห่วงไม้ไผ่) + เปลวไฟ
    g.fillStyle = 'rgba(90,40,16,0.85)';
    g.beginPath(); g.ellipse(cx, bot, bwid, 2.4, 0, 0, TAU); g.fill();
    const fg = g.createRadialGradient(cx, bot + 3, 0, cx, bot + 3, 7);
    fg.addColorStop(0, 'rgba(255,255,240,1)'); fg.addColorStop(0.35, 'rgba(255,214,120,0.95)'); fg.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = fg; g.beginPath(); g.ellipse(cx, bot + 3, 5, 7, 0, 0, TAU); g.fill();
    return { c, ax: cx, ay: bot - bh * 0.3, w: c.width, h: c.height };
  }
  function drawGlow(size, rgb, a0) {
    const c = mk(size, size); const g = c.getContext('2d'); const r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(0.35, `rgba(${rgb},${a0 * 0.42})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
  }
  /** กระทงใบตอง: ฐานใบตองพับจีบ + กลีบบัว + เทียน (มองด้านข้าง) — 3 แบบ */
  function drawKrathong(kind) {
    const c = mk(120, 84); const g = c.getContext('2d'); const cx = 60; const base = 66;
    // ฐานใบตอง
    g.fillStyle = '#2F6B3C'; g.beginPath(); g.moveTo(10, base - 6); g.quadraticCurveTo(cx, base + 16, 110, base - 6); g.lineTo(102, base + 2); g.quadraticCurveTo(cx, base + 18, 18, base + 2); g.closePath(); g.fill();
    g.fillStyle = '#3F8A4C';
    for (let i = 0; i < 9; i += 1) {   // จีบใบตองรอบฐาน
      const x = 16 + i * 11; g.beginPath(); g.moveTo(x - 5, base - 2); g.lineTo(x, base - 13 - (i % 2) * 3); g.lineTo(x + 5, base - 2); g.closePath(); g.fill();
    }
    // กลีบบัว
    const petal = kind === 1 ? ['#F7D9E7', '#E7A0C7', '#C56C9C'] : kind === 2 ? ['#FFF4DB', '#F4CC82', '#C99A4C'] : ['#FBE3EE', '#EFB2D0', '#CF7EA8'];
    for (let i = -3; i <= 3; i += 1) {
      const x = cx + i * 8; const ht = 22 - Math.abs(i) * 3;
      const pg = g.createLinearGradient(0, base - 12 - ht, 0, base - 6);
      pg.addColorStop(0, petal[0]); pg.addColorStop(0.6, petal[1]); pg.addColorStop(1, petal[2]);
      g.fillStyle = pg; g.beginPath(); g.moveTo(x - 6, base - 6); g.quadraticCurveTo(x - 6, base - 12 - ht * 0.6, x, base - 12 - ht); g.quadraticCurveTo(x + 6, base - 12 - ht * 0.6, x + 6, base - 6); g.closePath(); g.fill();
    }
    // ดอกดาวเรืองกลาง + เทียน + ธูป 2 ก้าน (ไม่มีควัน)
    g.fillStyle = '#F2A23A'; g.beginPath(); g.arc(cx, base - 22, 6, 0, TAU); g.fill();
    g.fillStyle = '#FFF4DB'; g.fillRect(cx - 2, base - 44, 4, 20);
    g.fillStyle = '#B8865A'; g.fillRect(cx - 9, base - 40, 1.4, 16); g.fillRect(cx + 8, base - 40, 1.4, 16);
    return { c, flameX: cx, flameY: base - 47 };
  }
  function buildSprites() {
    SPR.lanterns = LANTERN_VARIANTS.map(drawLanternSprite);
    SPR.glow = drawGlow(128, '255,172,77', 0.55);
    SPR.twinkle = drawGlow(24, '255,244,219', 0.95);
    SPR.ember = drawGlow(20, '244,204,130', 0.9);
    SPR.candleGlow = drawGlow(64, '255,196,110', 0.75);
    SPR.krathong = [0, 1, 2].map(drawKrathong);
  }

  // ---------- พูลอนุภาค (ขนาดคงที่) ----------
  const MAX_LANTERNS = 16; const MAX_TWINKLE = 36; const MAX_EMBER = 16; const MAX_KT = 4;
  const L = []; const TW = []; const EM = []; const KT = [];
  for (let i = 0; i < MAX_LANTERNS; i += 1) L.push({ on: false, wait: 0, x: 0, y: 0, bx: 0, z: 0, s: 1, vy: 0, vx: 0, amp: 0, fr: 0, ph: 0, fl: 0, v: 0, age: 0 });
  for (let i = 0; i < MAX_TWINKLE; i += 1) TW.push({ x: 0, y: 0, s: 1, fr: 1, ph: 0 });
  for (let i = 0; i < MAX_EMBER; i += 1) EM.push({ x: 0, y: 0, vx: 0, vy: 0, ph: 0, fr: 1, s: 1 });
  for (let i = 0; i < MAX_KT; i += 1) KT.push({ x: 0, lane: 0, v: 0, k: 0, ph: 0, s: 1 });
  const rnd = (a, b) => a + Math.random() * (b - a);

  function targetCount() {
    if (level === 'off') return 0;
    let n = W >= 1200 ? 12 : W >= 768 ? 8 : 5;
    const nav = navigator;
    if ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4)) n = Math.max(3, Math.round(n * 0.75));
    if (level === 'light') { if (W < 1024) return 0; n = Math.max(2, Math.round(n * 0.35)); }   // หน้าเรียน: มือถือ/แท็บเล็ตมีแค่ดาว (เนื้อหาเต็มจอ)
    return Math.max(level === 'light' ? 2 : 3, Math.min(MAX_LANTERNS, Math.round(n * quality)));
  }
  const riverH = () => (level === 'full' ? Math.round(Math.min(170, Math.max(96, H * 0.17))) : 0);

  /** โคม: ระยะ (z) สุ่มแบบมีน้ำหนัก — ไกลมากสุด ใกล้น้อยสุด · light = ไกลเท่านั้น */
  function spawnLantern(p, initial) {
    const r = Math.random();
    p.z = level === 'light' ? rnd(0, 0.3) : r < 0.45 ? rnd(0, 0.33) : r < 0.82 ? rnd(0.34, 0.66) : rnd(0.67, 1);
    const unit = Math.max(0.72, Math.min(1.25, Math.min(W, H) / 760));
    p.s = (0.26 + p.z * 0.52) * unit * rnd(0.88, 1.12);                       // ขนาดสไปรต์ (ไกลเล็ก)
    p.vy = (8 + p.z * 26) * (H / 900) * rnd(0.82, 1.2);                       // px/s (ไกลช้า)
    p.vx = rnd(-2, 6) * (0.5 + p.z);                                          // ลมพัดค่อนไปขวาเล็กน้อย
    p.amp = rnd(4, 14) * (0.4 + p.z); p.fr = rnd(0.18, 0.42); p.ph = rnd(0, TAU); p.fl = rnd(0, TAU);
    p.v = (Math.random() * SPR.lanterns.length) | 0;
    // หน้าเรียน (light): เกิดเฉพาะขอบซ้าย/ขวานอกคอลัมน์เนื้อหา — ไม่ลอยผ่านหลังตัวหนังสือ
    if (level === 'light') { const side = Math.min(0.24, Math.max(0.1, (W - 900) / 2 / W)); p.bx = (Math.random() < 0.5 ? rnd(0.01, side) : rnd(1 - side, 0.99)) * W; p.vx = rnd(-1.5, 1.5); p.amp = Math.min(p.amp, 6); }
    else p.bx = rnd(-0.04, 1.04) * W;
    const bottom = H - riverH() * 0.55;
    p.y = initial ? rnd(H * 0.08, bottom) : bottom + rnd(10, 60);             // เริ่มต้น: กระจายทั้งฉาก · ต่อไป: เกิดจากขอบล่าง/ผิวน้ำ
    p.age = initial ? rnd(1, 6) : 0;
    p.wait = initial ? rnd(0, 3) : rnd(0.4, 5.5);                              // จังหวะเกิดไม่พร้อมกัน
    p.on = true; stats.spawned += 1;
  }
  function seedStatic() {
    for (let i = 0; i < MAX_TWINKLE; i += 1) {
      const t = TW[i]; t.x = Math.random() * W; t.y = Math.random() * H * 0.62; t.s = rnd(0.35, 1); t.fr = rnd(0.4, 1.4); t.ph = rnd(0, TAU);
    }
    for (let i = 0; i < MAX_EMBER; i += 1) {
      const e = EM[i]; e.x = Math.random() * W; e.y = rnd(H * 0.35, H); e.vx = rnd(-6, 6); e.vy = rnd(-8, -2); e.ph = rnd(0, TAU); e.fr = rnd(0.6, 1.6); e.s = rnd(0.5, 1.1);
    }
    for (let i = 0; i < MAX_KT; i += 1) {
      const k = KT[i]; k.x = rnd(-0.1, 1) * W; k.lane = i % 3; k.v = rnd(5, 11) * (k.lane === 2 ? 1.25 : k.lane === 1 ? 1 : 0.8); k.k = i % 3; k.ph = rnd(0, TAU); k.s = 0.42 + k.lane * 0.14;
    }
    const n = targetCount();
    for (let i = 0; i < MAX_LANTERNS; i += 1) { if (i < n) spawnLantern(L[i], true); else L[i].on = false; }
  }

  // ---------- วาด ----------
  function drawLanterns(t, dt) {
    const n = targetCount(); let active = 0;
    const fadeTop = H * 0.16;
    for (let i = 0; i < MAX_LANTERNS; i += 1) {
      const p = L[i];
      if (i >= n) { p.on = false; continue; }                     // ลดจำนวน (คุณภาพ/ระดับหน้า) → ปิดช่องท้าย
      if (!p.on) spawnLantern(p, false);
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.age += dt;
      p.y -= p.vy * dt; p.bx += p.vx * dt;
      const sp = SPR.lanterns[p.v]; const sc = p.s;
      const hh = sp.h * sc;
      if (p.y < -hh - 20 || p.bx < -W * 0.1 || p.bx > W * 1.1) { spawnLantern(p, false); continue; }   // พ้นฉาก → เกิดใหม่
      const sway = Math.sin(t * p.fr * TAU * 0.5 + p.ph);
      const x = p.bx + sway * p.amp;
      const rot = sway * 0.06 + Math.sin(t * 0.9 + p.ph) * 0.015;
      let a = (0.35 + p.z * 0.65) * (level === 'light' ? 0.7 : 1);   // ไกล = จางกว่า · หน้าเรียนจางลงอีก
      a *= Math.min(1, p.age / 2.4);                               // ค่อย ๆ ปรากฏ
      if (p.y < fadeTop) a *= Math.max(0, p.y / fadeTop);          // จางเมื่อลอยสูงพ้นฉาก
      const ex = Math.min(x, W - x); if (ex < 40) a *= Math.max(0, ex / 40 + 0.2);   // จางที่ขอบซ้าย/ขวา
      if (a <= 0.01) continue;
      active += 1;
      const flick = 0.82 + 0.12 * Math.sin(t * 6.3 + p.fl) + 0.06 * Math.sin(t * 13.7 + p.fl * 2);
      // แสงเรือง (additive)
      const gs = hh * (1.7 + p.z * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * flick * (0.45 + p.z * 0.4);
      ctx.drawImage(SPR.glow, x - gs / 2, p.y + hh * 0.18 - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
      // ตัวโคม
      ctx.globalAlpha = a * (0.9 + 0.1 * flick);
      ctx.save(); ctx.translate(x, p.y); ctx.rotate(rot);
      ctx.drawImage(sp.c, -sp.w * sc / 2, -hh / 2, sp.w * sc, hh);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return active;
  }
  function drawTwinkles(t) {
    const n = level === 'full' ? MAX_TWINKLE : 18;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 1) {
      const s = TW[i]; const k = 0.5 + 0.5 * Math.sin(t * s.fr + s.ph);
      const size = 5 + s.s * 9 * (0.6 + 0.4 * k);
      ctx.globalAlpha = 0.15 + 0.65 * k * s.s;
      ctx.drawImage(SPR.twinkle, s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawEmbers(t, dt) {
    const n = level === 'full' ? Math.round(MAX_EMBER * Math.max(0.5, quality) * (W < 768 ? 0.6 : 1)) : 5;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 1) {
      const e = EM[i];
      e.x += (e.vx + Math.sin(t * 0.7 + e.ph) * 6) * dt; e.y += (e.vy + Math.cos(t * 0.5 + e.ph) * 4) * dt;
      if (e.y < H * 0.25 || e.x < -10 || e.x > W + 10) { e.x = Math.random() * W; e.y = H - riverH() * 0.4 - rnd(0, H * 0.25); }
      const k = 0.5 + 0.5 * Math.sin(t * e.fr * 2 + e.ph);
      const size = 4 + e.s * 6;
      ctx.globalAlpha = 0.12 + 0.55 * k;
      ctx.drawImage(SPR.ember, e.x - size / 2, e.y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  /** แม่น้ำ: ผิวน้ำไล่สี + ทางแสงจันทร์ + ระลอกคลื่น + กระทงพร้อมเงาสะท้อน */
  function drawRiver(t, dt) {
    const rh = riverH(); if (!rh) return;
    const top = H - rh;
    if (!riverGrad || riverGradKey !== `${H}:${rh}`) {   // สร้างใหม่เฉพาะตอนขนาดเปลี่ยน (ไม่สร้างทุกเฟรม)
      riverGrad = ctx.createLinearGradient(0, top, 0, H); riverGradKey = `${H}:${rh}`;
      riverGrad.addColorStop(0, 'rgba(22,28,74,0.0)'); riverGrad.addColorStop(0.18, 'rgba(18,24,66,0.78)'); riverGrad.addColorStop(1, 'rgba(8,12,38,0.95)');
    }
    ctx.fillStyle = riverGrad; ctx.fillRect(0, top, W, rh);
    // ทางแสงจันทร์ (จันทร์อยู่ขวาบน ~82%)
    const mx = W * 0.82;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i += 1) {
      const yy = top + rh * (0.2 + i * 0.085);
      const len = (24 + i * 9) * (0.75 + 0.25 * Math.sin(t * 1.3 + i * 1.7));
      ctx.globalAlpha = 0.22 - i * 0.017;
      ctx.fillStyle = '#FFF4DB';
      ctx.fillRect(mx - len / 2 + Math.sin(t * 0.8 + i) * 6, yy, len, 1.6);
    }
    // ระลอกคลื่น (เส้นบางเลื่อนช้า)
    ctx.globalAlpha = 0.18; ctx.strokeStyle = '#9FB4FF'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const yy = top + rh * (0.3 + i * 0.14);
      const off = (t * (8 + i * 3)) % 140;
      ctx.beginPath();
      for (let x = -140 + off; x < W + 140; x += 140) { ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + 35, yy - 2.5, x + 70, yy); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // กระทง (ช้า ไม่หนาแน่น): มือถือ 2 · แท็บเล็ต 3 · คอม 4
    const nk = W < 768 ? 2 : W < 1200 ? 3 : 4;
    for (let i = 0; i < nk; i += 1) {
      const k = KT[i]; const sp = SPR.krathong[k.k];
      k.x += k.v * dt; if (k.x > W + 80) { k.x = -90 - Math.random() * 120; k.v = rnd(5, 11) * (k.lane === 2 ? 1.25 : k.lane === 1 ? 1 : 0.8); }
      const s = k.s * Math.max(0.8, Math.min(1.15, W / 1200));
      const wy = top + rh * (0.36 + k.lane * 0.2);
      const bob = Math.sin(t * 1.1 + k.ph) * 1.6; const tilt = Math.sin(t * 0.9 + k.ph) * 0.03;
      const w = sp.c.width * s; const h = sp.c.height * s;
      // เงาสะท้อน
      ctx.save(); ctx.globalAlpha = 0.22; ctx.translate(k.x, wy + bob + h * 0.1); ctx.scale(1, -0.55); ctx.drawImage(sp.c, -w / 2, -h * 0.82, w, h); ctx.restore();
      // ตัวกระทง
      ctx.save(); ctx.translate(k.x, wy + bob); ctx.rotate(tilt); ctx.drawImage(sp.c, -w / 2, -h * 0.82, w, h); ctx.restore();
      // เปลวเทียน
      const fl = 0.75 + 0.15 * Math.sin(t * 9 + k.ph) + 0.1 * Math.sin(t * 15.3 + k.ph);
      const fx = k.x + (sp.flameX - sp.c.width / 2) * s; const fy = wy + bob + (sp.flameY - sp.c.height * 0.82) * s;
      ctx.globalCompositeOperation = 'lighter';
      const gs = 44 * s * 1.6;
      ctx.globalAlpha = 0.85 * fl; ctx.drawImage(SPR.candleGlow, fx - gs / 2, fy - gs / 2, gs, gs);
      ctx.globalAlpha = 0.3 * fl; ctx.drawImage(SPR.candleGlow, fx - gs / 2, wy + rh * 0.08 - gs / 4, gs, gs / 2);   // แสงเทียนบนผิวน้ำ
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  const DBG = {};
  function frame(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (DBG.none) { stats.frames += 1; return; }
    if (!DBG.noTw) drawTwinkles(t);
    const active = DBG.noL ? 0 : drawLanterns(t, dt);
    if (!DBG.noR) drawRiver(t, dt);
    if (!DBG.noE) drawEmbers(t, dt);
    stats.active = active; stats.frames += 1;
  }

  // ---------- ลูป ----------
  function loop(now) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!lastT) { lastT = now; return; }
    let d = now - lastT; lastT = now;
    if (d > 250) d = stepMs;                          // กลับมาจากแท็บซ่อน/สะดุด → ไม่กระโดด
    acc += d;
    if (acc < stepMs - 1) return;                     // มือถือ 30 fps
    const dt = Math.min(0.25, acc / 1000); acc = 0;   // เครื่องช้าเฟรมห่าง: ยังเคลื่อนที่ตามเวลาจริง
    // ปรับคุณภาพตามเฟรมจริง (ทุก ~4 วินาที)
    sampleFrames += 1; slowAcc += d;
    if (d > stepMs * 1.9) slowFrames += 1;
    if (sampleFrames >= 120) {
      const ratio = slowFrames / sampleFrames;
      if (ratio > 0.35 && quality > 0.45) quality = Math.max(0.45, quality - 0.15);
      else if (ratio < 0.05 && quality < 1) quality = Math.min(1, quality + 0.05);
      stats.quality = quality; sampleFrames = 0; slowFrames = 0; slowAcc = 0;
    }
    frame(now / 1000, dt);
  }
  function start() {
    if (running || !canvas) return;
    running = true; lastT = 0; acc = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // ---------- ขนาด / เลื่อนหน้า ----------
  function resize() {
    if (!canvas) return;
    const w = window.innerWidth; const h = window.innerHeight;
    const mobile = w < 768;
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    if (w * h > 1600 * 900) DPR = Math.min(DPR, 0.8);   // จอใหญ่: วาดที่ความละเอียดต่ำลงแล้วขยาย (โคมเป็นแสงนุ่มอยู่แล้ว) — ลดงานวาดเกือบครึ่ง
    stepMs = mobile ? 1000 / 30 : 1000 / 60;
    const changed = Math.abs(w - W) > 2 || Math.abs(h - H) > 120;   // มือถือ: แถบที่อยู่หด/ขยาย → ไม่ต้องเริ่มใหม่
    W = w; H = h;
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    stats.dpr = DPR;
    if (changed) seedStatic();
    if (!running) drawStill();
  }
  function onScroll() {
    const y = window.scrollY || 0; const d = y - lastScroll; lastScroll = y;
    if (!d || level === 'off') return;
    // Parallax: ไกลเลื่อนน้อย ใกล้เลื่อนมาก (ฉากอยู่ fixed เนื้อหาเลื่อนผ่าน)
    for (let i = 0; i < MAX_LANTERNS; i += 1) { const p = L[i]; if (p.on) p.y -= d * (0.04 + p.z * 0.2); }
    for (let i = 0; i < MAX_TWINKLE; i += 1) { const s = TW[i]; s.y -= d * 0.015; if (s.y < 0) s.y += H * 0.62; else if (s.y > H * 0.62) s.y -= H * 0.62; }
    if (!running) drawStill();
  }
  /** ภาพนิ่ง (ลดการเคลื่อนไหว / ปิดเอฟเฟกต์): วาด 1 ครั้งจากตำแหน่งที่สุ่มไว้ */
  function drawStill() {
    if (!ctx) return;
    if (level === 'off') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); stats.active = 0; return; }
    for (let i = 0; i < MAX_LANTERNS; i += 1) { const p = L[i]; p.wait = 0; p.age = 10; }
    frame(12.3, 0);
  }

  // ---------- เปิด/ปิด ----------
  const animOk = () => !reducedMq.matches && pref('eq_fest_fx') !== 'off';
  function apply() {
    const want = root.dataset.skin === 'loykrathong';
    if (!want) { destroy(); return; }
    if (!canvas) create();
    const lv = levelFor(screenId);
    const prevLevel = level; level = lv;
    stats.mode = animOk() ? lv : `${lv}-still`;
    canvas.classList.toggle('is-off', lv === 'off');
    root.dataset.lkfx = lv;
    if (prevLevel !== lv && (prevLevel === 'off' || lv === 'off' || prevLevel === 'light' || lv === 'light')) seedStatic();
    if (lv === 'off' || !animOk() || document.hidden) { stop(); drawStill(); } else start();
  }
  function create() {
    canvas = document.createElement('canvas');
    canvas.id = 'lk-fx'; canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d', { alpha: true });
    if (!SPR.glow) buildSprites();
    document.body.prepend(canvas);
    W = 0; H = 0; lastScroll = window.scrollY || 0; stats.startedAt = Date.now();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    resize();
  }
  function destroy() {
    stop();
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    if (canvas) { canvas.remove(); canvas = null; ctx = null; riverGrad = null; }
    level = 'off'; stats.mode = 'off'; stats.active = 0;
    delete root.dataset.lkfx;
  }

  // ---------- เหตุการณ์ ----------
  window.addEventListener('eq:screen', (e) => { screenId = e.detail && e.detail.id; if (canvas || root.dataset.skin === 'loykrathong') apply(); });
  document.addEventListener('visibilitychange', () => { if (!canvas) return; if (document.hidden) stop(); else apply(); });
  reducedMq.addEventListener?.('change', () => apply());
  new MutationObserver(() => apply()).observe(root, { attributes: true, attributeFilter: ['data-skin'] });
  // หน้าแรกที่แสดงตอนโหลด (ก่อน eq:screen แรก)
  const vis = () => { const s = [...document.querySelectorAll('.screen')].find((x) => !x.classList.contains('hidden')); return s ? s.id : null; };
  const boot = () => { screenId = vis(); apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.EQLanternFx = {
    refresh: apply,
    stats: () => ({ ...stats, running, level, lanterns: L.filter((p) => p.on && p.wait <= 0).length, pool: MAX_LANTERNS, canvases: document.querySelectorAll('#lk-fx').length }),
    _levelFor: levelFor, _dbg: DBG,
  };
}());
