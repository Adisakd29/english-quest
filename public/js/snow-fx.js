/* =====================================================================
   Global Snow Overlay · หิมะตกแบบธรรมชาติ — window.EQSnowFx (เครื่องยนต์หิมะตัวเดียวของทั้งแอป)
   v1.26.0: ทำงานทุกธีม (ปกติ/สว่าง/มืด/พาสเทล/คริสต์มาส/ฮาโลวีน/ลอยกระทง/ธีมในอนาคต) ระดับ Application Shell
     - ไม่ผูกกับธีม: เปลี่ยนธีม/เปลี่ยนหน้า → ปรับระดับและสีเกล็ดเท่านั้น (canvas เดิม ไม่สร้างซ้ำ ไม่เริ่มลูปซ้อน)
     - ตั้งค่าผู้ใช้ (ในเครื่อง): หิมะ เปิด/ปิด (eq_snow) · ความหนาแน่น ต่ำ/กลาง/สูง (eq_snow_density) · ค่าเริ่มต้น เปิด + กลาง
     - หน้าที่ต้องอ่าน/ทำแบบฝึก/Quiz = ระดับต่ำเสมอ (ไม่ปิด) · prefers-reduced-motion / ปิดเอฟเฟกต์เคลื่อนไหว = ภาพนิ่ง
     - ธีมสว่าง: เกล็ดสีฟ้าเทาอ่อน (มองเห็นบนพื้นขาว) · ธีมมืด: เกล็ดขาว
     - ผู้ดูแลปิดหิมะช่วงคริสต์มาส (christmas_snow = false) → ปิดเฉพาะตอนใช้ธีมคริสต์มาส
   (v1.25.0 เดิม: เฉพาะธีมคริสต์มาส)

   ทำไมดูเป็นหิมะ ไม่ใช่ "ฝนสีขาว":
     - 3 ระยะความลึก (ไกล/กลาง/ใกล้) + ชั้นหน้าสุดแบบโฟกัสเบลอ (bokeh) เฉพาะหน้าที่ใช้ระดับเต็ม
       ไกล = เล็ก จาง ตกช้า · ใกล้ = ใหญ่ ชัด ตกเร็วขึ้น — ความเร็วต่างกันทำให้เห็นมิติ
     - ไม่มีเส้นตรงดิ่ง: เกล็ดแกว่งแบบลูกตุ้ม (sin ของเวลา เฟสต่างกันทุกเกล็ด) + ลมที่ "พัดเป็นระลอก"
       (ผลรวมคลื่นช้า 3 ความถี่ = ลมแรง-เบาไม่ซ้ำรูปแบบ) และลมต่างกันตามความสูงจอ
     - เกล็ดใกล้เป็นผลึก 6 แฉกหมุนช้า ๆ · ไกล/กลางเป็นจุดนุ่มไล่แสง (ไม่มีขอบแข็ง)
     - ค่อย ๆ ปรากฏ (fade-in) ตอนเกิด · ไม่มีการเกิดพร้อมกันเป็นแถว
   ประสิทธิภาพ:
     - Canvas เดียวใต้เนื้อหา (#xm-snow · z-index -1 · ไม่รับการแตะ) + Canvas ชั้นหน้า (#xm-snow-fg) เฉพาะระดับเต็ม เกล็ดน้อยมาก
     - สไปรต์วาดครั้งเดียว (drawImage เท่านั้น ไม่มี shadowBlur / filter ต่อเฟรม) · พูลขนาดคงที่ (ไม่สร้างอ็อบเจกต์ใหม่ระหว่างเล่น)
     - requestAnimationFrame อย่างเดียว · หยุดเมื่อแท็บถูกซ่อน · 60 fps ทุกอุปกรณ์ (v1.26.3) · DPR จำกัด · เฟรมตก → โหมดประหยัด 30 fps
     - หน้าที่ต้องใช้สมาธิ (แบบฝึก/การฟัง/Ranked) = ปิด · ลดการเคลื่อนไหว/ปิดเอฟเฟกต์ = ภาพนิ่ง 1 ภาพ
   ===================================================================== */
(function () {
  'use strict';
  const root = document.documentElement;
  const TAU = Math.PI * 2;
  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pref = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

  // ---------- ระดับตามหน้า (ตามสเปก: Full / Light / Off) ----------
  const FULL_SCREENS = new Set(['screen-auth', 'screen-home', 'screen-christmas', 'screen-shop', 'screen-play', 'screen-festival', 'screen-event']);
  const OFF_RE = /(ranked|quiz|match|battle-(play|lobby|result)|lesson|placement|assessment|tcas|endless|draw|speak|toeic|listen|grammar-(lesson|quiz|result)|c2-|graded|flash|review|write|exam|game|test|study|practice|dictation|reader|vocab-card|gl-(writing|topic|mistakes|practice|placement)|work)/;
  // v1.26.0: หน้าที่ต้องใช้สมาธิ = 'low' (หิมะบางมาก ช้า อยู่หลังเนื้อหา) แทนการปิด ตามสเปก Global Snow
  function levelFor(id) {
    if (!id) return 'light';
    if (FULL_SCREENS.has(id)) return 'full';
    if (OFF_RE.test(id)) return 'low';
    return 'light';
  }
  const DENSITY = { low: 0.45, medium: 0.75, high: 1.1 };
  const densityKey = () => { const v = pref('eq_snow_density'); return DENSITY[v] ? v : 'medium'; };
  const snowOn = () => pref('eq_snow') !== 'off';
  function lightTheme() {
    if (root.dataset.skin) return false;
    const t = root.dataset.theme;
    if (t === 'dark') return false;
    if (t === 'light' || t === 'cute') return true;
    return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------- สไปรต์ ----------
  const SPR = { soft: [], crystal: [], bokeh: null, tone: null };
  // สีเกล็ดตามธีม: มืด = ขาวนวล · สว่าง = ฟ้าเทา (ขาวล้วนจะมองไม่เห็นบนพื้นสว่าง)
  let INK = { core: '255,255,255', mid: '247,249,252', edge: '207,232,247', line: '255,255,255' };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  function softDot(r, core) {
    const s = Math.ceil(r * 2 + 4); const c = mk(s, s); const g = c.getContext('2d');
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
    rg.addColorStop(0, `rgba(${INK.core},${core})`); rg.addColorStop(0.45, `rgba(${INK.mid},0.75)`); rg.addColorStop(1, `rgba(${INK.edge},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(s / 2, s / 2, r, 0, TAU); g.fill();
    return c;
  }
  /** ผลึก 6 แฉก: แกนหลัก + กิ่งรอง 2 คู่ต่อแฉก (ต่างกัน 3 แบบ) วาดที่ 2x */
  function crystal(r, variant) {
    const s = Math.ceil(r * 2 + 6); const c = mk(s, s); const g = c.getContext('2d');
    g.translate(s / 2, s / 2); g.lineCap = 'round';
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, r);
    halo.addColorStop(0, `rgba(${INK.core},0.35)`); halo.addColorStop(1, `rgba(${INK.edge},0)`);
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = `rgba(${INK.line},0.95)`;
    for (let k = 0; k < 6; k += 1) {
      g.save(); g.rotate((k * TAU) / 6);
      g.lineWidth = Math.max(1, r * 0.11); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.92); g.stroke();
      g.lineWidth = Math.max(0.8, r * 0.07);
      const br = variant === 0 ? [[0.45, 0.28], [0.7, 0.18]] : variant === 1 ? [[0.35, 0.22], [0.58, 0.26], [0.78, 0.14]] : [[0.55, 0.32]];
      for (const [p, l] of br) {
        g.beginPath(); g.moveTo(0, -r * p); g.lineTo(-r * l, -r * (p + l * 0.9)); g.moveTo(0, -r * p); g.lineTo(r * l, -r * (p + l * 0.9)); g.stroke();
      }
      g.restore();
    }
    g.fillStyle = `rgba(${INK.line},0.95)`; g.beginPath(); g.arc(0, 0, r * 0.13, 0, TAU); g.fill();
    return c;
  }
  function bokeh(r) {
    const s = Math.ceil(r * 2 + 2); const c = mk(s, s); const g = c.getContext('2d');
    const rg = g.createRadialGradient(s / 2, s / 2, r * 0.2, s / 2, s / 2, r);
    rg.addColorStop(0, `rgba(${INK.core},0.55)`); rg.addColorStop(0.6, `rgba(${INK.mid},0.28)`); rg.addColorStop(1, `rgba(${INK.edge},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(s / 2, s / 2, r, 0, TAU); g.fill();
    return c;
  }
  function buildSprites() {
    const tone = lightTheme() ? 'light' : 'dark';
    if (SPR.tone === tone) return;
    SPR.tone = tone;
    INK = tone === 'light'
      ? { core: '150,178,214', mid: '170,196,228', edge: '190,212,238', line: '138,168,208' }
      : { core: '255,255,255', mid: '247,249,252', edge: '207,232,247', line: '255,255,255' };
    SPR.soft = [softDot(3, 0.85), softDot(5, 0.95), softDot(8, 1)];
    SPR.crystal = [crystal(18, 0), crystal(18, 1), crystal(18, 2)];
    SPR.bokeh = bokeh(40);
  }

  // ---------- พูล (ขนาดคงที่) ----------
  // ชั้น: 0 ไกล · 1 กลาง · 2 ใกล้ (ผลึก) · 3 หน้าสุด (bokeh, canvas แยก)
  const LAYERS = [
    { n: 103, size: [1.1, 1.9], vy: [16, 26], sway: [6, 12], alpha: [0.35, 0.6], wind: 0.45, spr: 'soft0' },
    { n: 68, size: [2.0, 3.4], vy: [28, 42], sway: [10, 20], alpha: [0.55, 0.85], wind: 0.75, spr: 'soft1' },
    { n: 24, size: [5.5, 9], vy: [42, 62], sway: [16, 30], alpha: [0.7, 0.95], wind: 1.0, spr: 'crystal' },
    { n: 10, size: [14, 26], vy: [60, 90], sway: [20, 40], alpha: [0.16, 0.3], wind: 1.25, spr: 'bokeh' },
  ];
  const P = LAYERS.map((L) => Array.from({ length: L.n }, () => ({ x: 0, y: 0, s: 1, vy: 20, sw: 10, ph: 0, fr: 1, a: 0.5, rot: 0, vr: 0, v: 0, age: 0 })));
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- สถานะ ----------
  let bg = null; let bgx = null; let fg = null; let fgx = null;
  let W = 0; let H = 0; let DPR = 1;
  let raf = 0; let running = false; let lastT = 0; let acc = 0; let T = 0;
  let level = 'off'; let screenId = null;
  let stepMs = 1000 / 60; let quality = 1; let slowFrames = 0; let sampleFrames = 0; let density = 1;
  let lowPower = false; let lastInteract = 0; let badWindows = 0;
  // บังคับโหมด (ชุดทดสอบ/ผู้ดูแล): localStorage eq_snow_power = 'full' | 'low' — ไม่ตั้ง = ตรวจอัตโนมัติ
  const forcedPower = pref('eq_snow_power'); const stats0 = {};
  // v1.26.3 เครื่องที่วาดภาพด้วย CPU (ไม่มี GPU / GPU ถูกปิด: SwiftShader · llvmpipe · Software) → เริ่มที่โหมดประหยัดทันที
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const ren = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '') : 'none';
    if (!gl || /swiftshader|llvmpipe|software|basic render/i.test(ren)) lowPower = true;
    stats0.renderer = ren.slice(0, 60);
    const lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  } catch (_) { /* ตรวจไม่ได้ → ใช้การวัดเฟรมตามเดิม */ }
  if (forcedPower === 'full') lowPower = false; else if (forcedPower === 'low') lowPower = true;
  const autoPower = forcedPower !== 'full' && forcedPower !== 'low';
  ['pointermove', 'scroll', 'touchmove', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { lastInteract = performance.now(); }, { passive: true, capture: true }));   // v1.26.2 เครื่องช้า (ไม่มี GPU/CPU ต่ำ): canvas ครึ่งความละเอียด + ไม่ใช้ชั้นหน้า + 30 fps — งานต่อเฟรมลดลง ~4 เท่า
  const stats = { frames: 0, mode: 'off', drawn: 0, quality: 1, dpr: 1, wind: 0, startedAt: 0, lowPower, ...stats0 };

  function activeCount(li) {
    const L = LAYERS[li];
    let n = L.n * density * quality;
    if (level === 'light') n *= li === 2 ? 0.35 : 0.45;
    if (level === 'low') n *= li === 2 ? 0.12 : li === 1 ? 0.22 : 0.3;   // หน้าอ่าน/แบบฝึก: บางมาก
    n *= DENSITY[densityKey()] / 1.1;   // พูลรองรับระดับ "มาก" · "กลาง" = เท่าค่าเดิม v1.25
    if (li === 3 && (level !== 'full' || W < 600)) n = W < 600 && level === 'full' ? 3 * DENSITY[densityKey()] / 0.75 : 0;
    return Math.max(0, Math.min(L.n, Math.round(n)));
  }
  function spawn(p, li, initial) {
    const L = LAYERS[li];
    p.s = rnd(L.size[0], L.size[1]); p.vy = rnd(L.vy[0], L.vy[1]); p.sw = rnd(L.sway[0], L.sway[1]);
    p.ph = Math.random() * TAU; p.fr = rnd(0.35, 0.9); p.a = rnd(L.alpha[0], L.alpha[1]);
    p.rot = Math.random() * TAU; p.vr = rnd(-0.6, 0.6); p.v = (Math.random() * 3) | 0;
    p.x = rnd(-40, W + 40) - wind * 0.4;   // ลมพัดไปทางไหน เกิดเผื่อทางต้นลม
    p.y = initial ? rnd(-20, H) : rnd(-60, -10);
    p.age = initial ? 5 : 0;
  }
  function seed() { for (let li = 0; li < LAYERS.length; li += 1) for (const p of P[li]) spawn(p, li, true); }

  // ลมเป็นระลอก: ผลรวมคลื่นช้า 3 ความถี่ (ไม่ซ้ำรูปแบบเร็ว) → px/s
  let wind = 0;
  const windAt = (t) => 14 * Math.sin(t * 0.071) + 9 * Math.sin(t * 0.193 + 1.7) + 5 * Math.sin(t * 0.47 + 0.4) + 6;

  function drawLayer(g, li, dt) {
    const n = activeCount(li); const L = LAYERS[li];
    let drawn = 0;
    for (let i = 0; i < n; i += 1) {
      const p = P[li][i];
      if (dt) {
        const gustY = 1 + 0.25 * Math.sin(p.y * 0.006 + T * 0.3);   // ลมต่างกันตามความสูง
        p.y += p.vy * dt;
        p.x += (wind * L.wind * gustY) * dt + Math.cos(T * p.fr + p.ph) * p.sw * dt;
        p.rot += p.vr * dt; p.age += dt;
        if (p.y > H + 30 || p.x < -80 || p.x > W + 80) spawn(p, li, false);
      }
      const fade = Math.min(1, p.age / 1.2);
      const sx = p.x + Math.sin(T * p.fr * 1.3 + p.ph) * p.sw * 0.35;   // แกว่งแบบลูกตุ้ม (ไม่ตกเป็นเส้นตรง)
      g.globalAlpha = p.a * fade;
      if (L.spr === 'crystal') {
        const img = SPR.crystal[p.v]; const d = p.s * 2;
        g.setTransform(DPR * Math.cos(p.rot), DPR * Math.sin(p.rot), -DPR * Math.sin(p.rot), DPR * Math.cos(p.rot), sx * DPR, p.y * DPR);
        g.drawImage(img, -d / 2, -d / 2, d, d);
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
      } else if (L.spr === 'bokeh') {
        const d = p.s * 2; g.drawImage(SPR.bokeh, sx - p.s, p.y - p.s, d, d);
      } else {
        const img = li === 0 ? SPR.soft[0] : SPR.soft[p.s > 2.8 ? 2 : 1]; const d = p.s * 2.4;
        g.drawImage(img, sx - d / 2, p.y - d / 2, d, d);
      }
      drawn += 1;
    }
    g.globalAlpha = 1;
    return drawn;
  }
  function frame(dt) {
    wind = windAt(T); stats.wind = Math.round(wind);
    bgx.setTransform(DPR, 0, 0, DPR, 0, 0); bgx.clearRect(0, 0, W, H);
    let d = 0;
    for (let li = 0; li < 3; li += 1) d += drawLayer(bgx, li, dt);
    if (fgx) {
      fgx.setTransform(DPR, 0, 0, DPR, 0, 0); fgx.clearRect(0, 0, W, H);
      d += drawLayer(fgx, 3, dt);
    }
    stats.drawn = d; stats.frames += 1;
  }
  // v1.26.3 วัด "ต้นทุนการวาดหิมะจริง" ต่อเฟรม (ไม่ใช่ความถี่เฟรมรวมของหน้า ซึ่งแกว่งตามงานอื่น)
  //   เครื่องทั่วไปวาด ~0.3–1.5 ms · ถ้ามัธยฐานของ 12 เฟรมแรก > 4 ms = เครื่องช้า → โหมดประหยัดทันที (~0.3 วินาที)
  const drawCost = [];
  function timedFrame(dt) {
    const t0 = performance.now();
    frame(dt);
    if (lowPower || drawCost.length >= 12) return;
    drawCost.push(performance.now() - t0);
    if (drawCost.length === 12) {
      const sorted = drawCost.slice().sort((a, b) => a - b); const med = sorted[6];
      stats.drawMs = Math.round(med * 100) / 100;
      if (med > 4 && autoPower) { lowPower = true; stats.lowPower = true; resize(); apply(); }
    }
  }

  // ---------- ลูป ----------
  function loop(now) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!lastT) { lastT = now; return; }
    let d = now - lastT; lastT = now;
    if (d > 250) d = stepMs;
    acc += d;
    if (acc < stepMs - 1) return;
    // v1.26.2 โหมดประหยัด: ระหว่างผู้ใช้เลื่อน/ลาก/ขยับเมาส์ หยุดวาดหิมะชั่วครู่ ให้การโต้ตอบลื่นก่อน (เกล็ดค้างอยู่กับที่ ไม่หายไป)
    if (lowPower && now - lastInteract < 250) { acc = 0; return; }
    const dt = Math.min(0.1, acc / 1000); acc = 0;
    T += dt;
    if (Date.now() - stats.startedAt > 1500) { sampleFrames += 1; if (d > stepMs * 1.9) slowFrames += 1; }   // ไม่นับช่วงโหลดหน้า (กระตุกชั่วคราว)
    if (sampleFrames >= (lowPower ? 60 : 24)) {   // ตรวจครั้งแรกเร็ว (~0.5–1 วินาที)   // v1.26.2 ตอบสนองเร็วขึ้น (เดิม 120 เฟรม) — เครื่องช้าลดจำนวนเกล็ดภายใน ~1–2 วินาที
      const r = slowFrames / sampleFrames;
      badWindows = r > 0.3 ? badWindows + 1 : 0;
      // เครื่องช้าจริง (ช้าติดกัน 2 ช่วง ไม่ใช่กระตุกชั่วคราวตอนโหลดตัวละคร 3D): สลับโหมดประหยัดครั้งเดียว ไม่สลับกลับไปมา
      if (badWindows >= 2 && !lowPower && autoPower) { lowPower = true; stats.lowPower = true; resize(); apply(); }
      if (r > 0.3 && quality > 0.35) quality = Math.max(0.35, quality - 0.2);
      else if (r < 0.05 && quality < 1) quality = Math.min(1, quality + 0.05);
      stats.quality = quality; sampleFrames = 0; slowFrames = 0;
    }
    timedFrame(dt);
  }
  function start() { if (running || !bg) return; running = true; lastT = 0; acc = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function resize() {
    if (!bg) return;
    const w = window.innerWidth; const h = window.innerHeight; const mobile = w < 768;
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    if (w * h > 1600 * 900) DPR = Math.min(DPR, 1);
    if (lowPower) DPR *= 0.5;   // เกล็ดหิมะนุ่มอยู่แล้ว ย่อความละเอียดแล้วยังดูเหมือนเดิม
    stepMs = lowPower ? 1000 / 30 : 1000 / 60;   // v1.26.3 มือถือ 60 fps (เดิม 30) · โหมดประหยัด 30 fps (เดิม 20) — เครื่องช้ายังลดเองอัตโนมัติ
    density = w < 600 ? 0.5 : w < 1024 ? 0.72 : w > 1700 ? 1.15 : 1;
    const changed = Math.abs(w - W) > 2 || Math.abs(h - H) > 120;
    W = w; H = h;
    for (const c of [bg, fg]) { if (!c) continue; c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); c.style.width = `${w}px`; c.style.height = `${h}px`; }
    stats.dpr = DPR;
    if (changed) seed();
    if (!running) still();
  }
  function still() {
    if (!bgx) return;
    if (level === 'off') { bgx.setTransform(1, 0, 0, 1, 0, 0); bgx.clearRect(0, 0, bg.width, bg.height); if (fgx) { fgx.setTransform(1, 0, 0, 1, 0, 0); fgx.clearRect(0, 0, fg.width, fg.height); } stats.drawn = 0; return; }
    for (const arr of P) for (const p of arr) p.age = 5;
    frame(0);
  }

  // ---------- เปิด/ปิด ----------
  const snowFlag = () => !(root.dataset.skin === 'christmas' && window.EQSeason && window.EQSeason.flags && window.EQSeason.flags.snow === false);
  const animOk = () => !reducedMq.matches && pref('eq_fest_fx') !== 'off';
  function apply() {
    const want = snowOn() && snowFlag();
    root.dataset.snow = want ? 'on' : 'off';   // ใช้กับสันหิมะเกาะเมนู (snow-caps.css)
    root.dataset.snowTone = lightTheme() ? 'light' : 'dark';
    if (!want) { destroy(); return; }
    buildSprites();   // สร้างใหม่เฉพาะเมื่อโทนธีมเปลี่ยน (มืด ↔ สว่าง)
    if (!bg) create();
    const lv = levelFor(screenId);
    level = lv;
    stats.mode = animOk() ? lv : `${lv}-still`;
    root.dataset.xmfx = lv;
    bg.classList.toggle('is-off', lv === 'off');
    const needFg = lv === 'full' && !lowPower;
    if (needFg && !fg) { fg = document.createElement('canvas'); fg.id = 'xm-snow-fg'; fg.setAttribute('aria-hidden', 'true'); fgx = fg.getContext('2d'); document.body.appendChild(fg); resize(); }
    if (!needFg && fg) { fg.remove(); fg = null; fgx = null; }
    if (lv === 'off' || !animOk() || document.hidden) { stop(); still(); } else start();
  }
  function create() {
    buildSprites();
    bg = document.createElement('canvas'); bg.id = 'xm-snow'; bg.setAttribute('aria-hidden', 'true');
    bgx = bg.getContext('2d', { alpha: true });
    document.body.prepend(bg);
    W = 0; H = 0; stats.startedAt = Date.now();
    window.addEventListener('resize', resize, { passive: true });
    resize();
  }
  function destroy() {
    stop();
    window.removeEventListener('resize', resize);
    if (bg) { bg.remove(); bg = null; bgx = null; }
    if (fg) { fg.remove(); fg = null; fgx = null; }
    level = 'off'; stats.mode = 'off'; stats.drawn = 0;
    delete root.dataset.xmfx;
  }

  window.addEventListener('eq:screen', (e) => { screenId = e.detail && e.detail.id; apply(); });
  window.addEventListener('eq:season', () => apply());
  document.addEventListener('visibilitychange', () => { if (!bg) return; if (document.hidden) stop(); else apply(); });
  reducedMq.addEventListener?.('change', () => apply());
  new MutationObserver(() => apply()).observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-theme'] });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => apply());
  /** ตั้งค่าผู้ใช้ (เก็บในเครื่อง) → มีผลทันที ไม่ต้องรีโหลด */
  function setPrefs(o = {}) {
    try {
      if (o.on !== undefined) { if (o.on) localStorage.removeItem('eq_snow'); else localStorage.setItem('eq_snow', 'off'); }
      if (o.density && DENSITY[o.density]) { if (o.density === 'medium') localStorage.removeItem('eq_snow_density'); else localStorage.setItem('eq_snow_density', o.density); }
    } catch (_) { /* โหมดส่วนตัว */ }
    apply();
  }
  const vis = () => { const s = [...document.querySelectorAll('.screen')].find((x) => !x.classList.contains('hidden')); return s ? s.id : null; };
  const boot = () => { screenId = vis(); apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  // ---------- การ์ดตั้งค่าในหน้าโปรไฟล์ ----------
  function syncSettings() {
    const t = document.getElementById('snow-toggle'); if (!t) return;
    t.checked = snowOn();
    document.querySelectorAll('[data-snow-density]').forEach((b) => { const on = b.dataset.snowDensity === densityKey(); b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); b.disabled = !snowOn(); });
    const n = document.getElementById('snow-rm-note'); if (n) n.hidden = !reducedMq.matches;
  }
  window.addEventListener('eq:screen', (e) => { if (e.detail && e.detail.id === 'screen-profile') syncSettings(); });
  document.addEventListener('change', (e) => { if (e.target.id === 'snow-toggle') { setPrefs({ on: e.target.checked }); syncSettings(); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-snow-density]'); if (b) { setPrefs({ density: b.dataset.snowDensity }); syncSettings(); } });

  window.EQSnowFx = {
    refresh: apply,
    setPrefs,
    prefs: () => ({ on: snowOn(), density: densityKey() }),
    stats: () => ({ ...stats, running, level, canvases: document.querySelectorAll('#xm-snow, #xm-snow-fg').length,
      active: LAYERS.map((_, i) => activeCount(i)) }),
    _levelFor: levelFor,
  };
}());
