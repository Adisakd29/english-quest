/* =====================================================================
   3D Avatar Renderer — window.EQAvatar3D  (v1.8.0)
   - three.js r169 (tree-shaken · /vendor/eq-three.min.js) โหลดแบบ lazy เฉพาะหน้าที่มี 3D viewer
   - Modular: Base (CHR_Base_01 + animation) + item GLB ทีละชิ้น (รวมใบหน้า) -> rebind เข้ากับ Skeleton เดียว (ARM_Main) ตามชื่อ bone
     เปลี่ยนชิ้นไหนโหลด/ถอดเฉพาะ slot นั้น · กันโหลดซ้อนด้วยเลขรุ่นของแต่ละ slot (เลือกเร็ว ๆ ชุดเก่าไม่ทับชุดใหม่)
   - ความคมชัด: pixel ratio = devicePixelRatio (เพดาน 2 · จำกัดจำนวน pixel รวม) + MSAA · ลดเองทีละขั้นถ้าเครื่องทำเฟรมไม่ทัน
   - แสง: PBR (MeshStandardMaterial) + RoomEnvironment (แสงนุ่มรอบทิศ) + key/rim light + Neutral tone mapping (สีไม่หม่น)
   - ควบคุม: ลาก (เมาส์/นิ้ว) หมุน 360° · เมาส์ลากแนวตั้ง = มุมก้ม/เงย (จำกัด) · wheel / pinch / ปุ่ม = ซูม (จำกัด) · ดับเบิลคลิก/ปุ่ม = รีเซ็ต
     · คีย์บอร์ด ← → + − 0 · บนมือถือ canvas ใช้ touch-action: pan-y (ปัดขึ้นลงยังเลื่อนหน้าได้)
   - ประหยัดแบต: render เฉพาะตอนมองเห็น · reduced-motion = ไม่มี idle loop · ออกจากหน้า = dispose
   - WebGL context lost -> แสดงสถานะ แล้วสร้างใหม่เมื่อ restored · โหลดไม่ได้ / ไม่มี WebGL -> 2D + ปุ่มลองใหม่
   ===================================================================== */
(function () {
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** ปุ่มดูชุดขณะขยับ — ท่าเดียวกับที่ใช้ตรวจ asset ทุกชิ้นใน Blender (แขนยก/โบก/หมุน/เดิน) */
  const ANIM_BTNS = [['wave', 'โบกมือ'], ['botharmsup', 'ยกแขน'], ['turn', 'หมุนตัว'], ['walk', 'เดิน'], ['celebrate', 'ดีใจ']];
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const WEAR = ['face', 'hair', 'top', 'bottom', 'outerwear', 'shoes', 'hat', 'glasses', 'headphones', 'back', 'accessory', 'effect'];

  // ---------- ความสามารถของเครื่อง: มี WebGL ไหม (คุณภาพปรับเองตามเฟรมจริง ไม่เดาจากจำนวน core) ----------
  let tierCache = null;
  function tier() {
    if (tierCache) return tierCache;
    let gl = null;
    try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (_) { gl = null; }
    if (!gl || window.__EQ_FORCE_NO_WEBGL) return (tierCache = 'none');
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    const save = navigator.connection && navigator.connection.saveData;
    tierCache = save ? 'saver' : 'full';
    return tierCache;
  }
  /** pixel ratio เริ่มต้น: ใช้ความละเอียดจอจริง (Retina/High-DPI) เพดาน 2 และจำกัด pixel รวม ~2.2 ล้าน */
  function startRatio(w, h) {
    const dpr = window.devicePixelRatio || 1;
    let pr = Math.min(dpr, tier() === 'saver' ? 1.5 : 2);
    const maxPx = 2.2e6;
    if (w * h * pr * pr > maxPx) pr = Math.max(1, Math.sqrt(maxPx / (w * h)));
    return pr;
  }

  // ---------- โหลด three.js + GLB (cache) ----------
  let libP = null;
  function lib() {
    if (!libP) libP = import('/vendor/eq-three.min.js?v=0.169.0-5').catch((e) => { libP = null; throw e; });
    return libP;
  }
  const bufs = new Map();   // url -> Promise<ArrayBuffer>
  function fetchBuf(url) {
    if (!bufs.has(url)) {
      const p = fetch(url, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); });
      p.catch(() => bufs.delete(url));
      bufs.set(url, p);
    }
    return bufs.get(url);
  }
  /** cache เฉพาะ base + ไฟล์ที่ยังใช้อยู่ (ไม่เก็บทั้งร้าน) */
  function trimCache(keep) {
    if (bufs.size <= 24) return;
    for (const k of bufs.keys()) { if (!keep.has(k)) { bufs.delete(k); if (bufs.size <= 18) break; } }
  }
  let manifestP = null;
  function manifest(api) {
    if (!manifestP) manifestP = api('/avatar/models').catch((e) => { manifestP = null; throw e; });
    return manifestP;
  }
  async function parse(T, url) {
    const buf = await fetchBuf(url);
    const loader = new T.GLTFLoader();
    loader.setMeshoptDecoder(T.MeshoptDecoder);
    return new Promise((res, rej) => loader.parse(buf.slice(0), '', res, rej));
  }
  /** วัสดุ PBR จาก GLB (สี/roughness/AO ที่ bake ไว้ใน vertex color) — ปรับให้นุ่ม ไม่มันวาว */
  // ---------- ลายผ้า (normal map แบบ procedural) — สูตรเดียวกับ scripts/avatar3d/blender/eqdetail.py (fabric_height) ----------
  // ใช้ร่วมทุกชิ้น · สร้างครั้งเดียวต่อลาย (128×128) · ไม่ต้องดาวน์โหลด texture ต่อชิ้น
  const FAB = {};
  function hash32(i, j, seed) {
    let h = (Math.imul(i >>> 0, 374761393) + Math.imul(j >>> 0, 668265263) + seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function vnoise(u, v, period, seed = 1) {
    const x = u * period; const y = v * period;
    const i = Math.floor(x); const j = Math.floor(y);
    const fx = x - i; const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
    const m = (a) => ((a % period) + period) % period;
    const a = hash32(m(i), m(j), seed); const b = hash32(m(i + 1), m(j), seed);
    const c = hash32(m(i), m(j + 1), seed); const d = hash32(m(i + 1), m(j + 1), seed);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }
  const fr = (x) => x - Math.floor(x);
  const S = Math.sin; const PI = Math.PI;
  const FABRIC_H = {
    weave: (u, v) => { const N = 16; const a = S(PI * fr(N * u)); const b = S(PI * fr(N * v)); const c = (Math.floor(N * u) + Math.floor(N * v)) % 2; return (c ? 0.8 * a + 0.2 * b : 0.8 * b + 0.2 * a) + 0.12 * vnoise(u, v, 32); },
    canvas: (u, v) => { const N = 24; return 0.5 * S(PI * fr(N * u)) + 0.5 * S(PI * fr(N * v)) + 0.15 * vnoise(u, v, 32); },
    twill: (u, v) => { const N = 16; return 0.6 * S(PI * fr(N * (u + v))) + 0.25 * S(PI * fr(2 * N * u)) + 0.18 * vnoise(u, v, 64, 3); },
    knit: (u, v) => { const N = 12; const x = fr(N * u); const y = fr(N * 1.5 * v + Math.abs(x - 0.5) * 0.9); return 0.55 * S(PI * x) + 0.45 * S(PI * y); },
    rib: (u) => Math.abs(S(PI * fr(18 * u))) ** 0.7,
    corduroy: (u, v) => Math.abs(S(PI * fr(14 * u))) ** 0.5 + 0.05 * vnoise(u, v, 16),
    leather: (u, v) => 1 - vnoise(u, v, 12, 5) ** 2 + 0.35 * vnoise(u, v, 32, 7),
    fleece: (u, v) => 0.6 * vnoise(u, v, 16, 9) + 0.4 * vnoise(u, v, 48, 11),
    tread: (u, v) => 0.5 + 0.5 * Math.cos(2 * PI * 10 * v),
    mesh: (u, v) => { const dx = fr(14 * u) - 0.5; const dy = fr(14 * v) - 0.5; return Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 0.22) / 0.14)); },
    straw: (u, v) => { const N = 10; const c = (Math.floor(N * u) + Math.floor(N * v * 2)) % 2; return (c ? S(PI * fr(N * u)) : S(PI * fr(N * v))) + 0.2 * vnoise(u, v, 40, 13); },
    quilt: (u, v) => S(PI * fr(3 * v)) ** 0.6,
    hair: (u, v) => 0.55 * Math.abs(S(PI * fr(12 * u + 0.35 * vnoise(u, v, 8, 17)))) ** 0.5 + 0.3 * vnoise(u, 0, 32, 19) + 0.15 * Math.abs(S(PI * fr(3 * u))),
  };
  function fabricTexture(T, name) {
    if (FAB[name] !== undefined) return FAB[name];
    const fn = FABRIC_H[name];
    if (!fn) { FAB[name] = null; return null; }
    const N = 128; const h = new Float32Array(N * N);
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) h[y * N + x] = fn((x + 0.5) / N, (y + 0.5) / N);
    const px = new Uint8Array(N * N * 4);
    const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * (N / 16); const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * (N / 16);
        const l = Math.hypot(dx, dy, 1); const i = (y * N + x) * 4;
        px[i] = ((-dx / l) * 0.5 + 0.5) * 255; px[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255; px[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; px[i + 3] = 255;
      }
    }
    const t = new T.DataTexture(px, N, N);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(64, 64);   // UV ใน GLB ถูกย่อ ÷64 (+0.5) ให้อยู่ใน 0..1 เพื่อ quantize เป็น 16 บิต — คูณกลับตรงนี้ (ต้องตรงกับ UV_SCALE ใน eqdetail.py)
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    FAB[name] = t;
    return t;
  }
  let lowDetail = false;   // เครื่องช้ามาก (adaptive quality ลดถึงขั้นต่ำ) -> ปิด normal map ลายผ้า
  function tuneMaterial(m, T) {
    if (m.isMeshStandardMaterial) {
      m.envMapIntensity = 0.9;
      if (m.roughness < 0.35 && !m.metalness) m.roughness = 0.35;
      const f = m.userData && m.userData.eq_fabric;
      if (f && T && !lowDetail && !m.normalMap) {
        const tex = fabricTexture(T, f);
        if (tex) { const k = Number(m.userData.eq_nstr) || 0.5; m.normalMap = tex; m.normalScale.set(k, -k); m.needsUpdate = true; }
      }
    }
    return m;
  }

  let liveViewers = 0;
  /**
   * สร้าง 3D viewer ใน container
   * @param {HTMLElement} el
   * @param {{api:Function, outfit:object, byId:object, label:string, fallbackHtml:string, controls?:boolean, onState?:Function, anim?:string, backdrop?:string}} o
   */
  function mount(el, o) {
    const state = { disposed: false, closed: false, ready: false, outfit: null, slots: {}, gen: {}, missing: [], frames: 0, frameMs: [], quality: null };
    const t = tier();
    el.classList.add('a3-host');
    el.innerHTML = `<div class="a3-stage"><div class="a3-loading" aria-live="polite"><span class="a3-skel" aria-hidden="true"></span><span class="a3-load-text">กำลังโหลด 3D…</span></div></div>
      ${o.controls !== false ? `<div class="a3-tools" role="group" aria-label="ควบคุมมุมมอง 3 มิติ">
        <button type="button" class="a3-btn" data-a3="left" aria-label="หมุนไปทางซ้าย" title="หมุนไปทางซ้าย">${ICON('rotate-ccw')}</button>
        <button type="button" class="a3-btn" data-a3="right" aria-label="หมุนไปทางขวา" title="หมุนไปทางขวา">${ICON('rotate-cw')}</button>
        <button type="button" class="a3-btn" data-a3="in" aria-label="ซูมเข้า" title="ซูมเข้า">${ICON('zoom-in')}</button>
        <button type="button" class="a3-btn" data-a3="out" aria-label="ซูมออก" title="ซูมออก">${ICON('zoom-out')}</button>
        <button type="button" class="a3-btn" data-a3="reset" aria-label="รีเซ็ตมุมกล้อง (ไม่เปลี่ยนชุด)" title="รีเซ็ตมุมกล้อง (ไม่เปลี่ยนชุด)">${ICON('locate-fixed')}</button>
      </div>
      <div class="a3-anims" role="group" aria-label="ดูชุดขณะขยับ (Animation Preview)">${ANIM_BTNS.map(([k, th]) => `<button type="button" class="a3-anim" data-a3-anim="${k}">${th}</button>`).join('')}</div>` : ''}`;
    const stage = el.querySelector('.a3-stage');
    const report = (s, extra) => { el.dataset.a3State = s; if (o.onState) o.onState(s, extra); };

    function fail(err, why) {
      if (state.closed) return;   // ผู้เรียกปิด viewer ไปแล้ว (ออกจากหน้า)
      report('fallback', err);
      const msg = why || (t === 'none' ? 'อุปกรณ์/เบราว์เซอร์นี้แสดง 3D ไม่ได้ — แสดง Avatar แบบ 2D แทน' : 'โหลด 3D ไม่สำเร็จ — แสดง Avatar แบบ 2D แทน');
      stage.innerHTML = `<div class="a3-fallback">${o.fallbackHtml || ''}
        <p class="a3-fail-msg" role="status">${ICON('info', 'icon icon-xs')} ${esc(msg)}</p>
        ${t === 'none' ? '' : `<button type="button" class="btn btn-secondary btn-sm a3-retry">${ICON('refresh-cw', 'icon icon-xs')} ลองโหลด 3D อีกครั้ง</button>`}</div>`;
      const tools = el.querySelector('.a3-tools'); if (tools) tools.hidden = true;
      const r = stage.querySelector('.a3-retry');
      if (r) r.addEventListener('click', () => { const v = mount(el, { ...o, outfit: state.outfit || o.outfit }); Object.assign(api, v); });
    }

    let T; let renderer; let scene; let camera; let root; let charGroup; let baseMesh; const bones = {}; let mixer = null; let clips = {}; const bodyRegions = {}; const clip = { local: null, plane: null, m: null, rest: null };
    let raf = 0; let visible = true; let dirty = true; let last = 0; let man; let idleAction = null; let ratio = 1;
    // กล้อง: หมุนตัวละครรอบแกน Y (แสงด้านหน้าคงที่) · มุมก้มเงยจำกัด · ระยะจำกัด (ไม่เข้าไปในโมเดล/ไม่หลุดฉาก)
    const HOME = { yaw: 0.32, pitch: 0.08, dist: 2.7 };
    const LIM = { pitch: [-0.12, 0.42], dist: [1.45, 3.6] };
    let view = { ...HOME };
    const TARGET = { y: 0.5 };
    let fpsCap = 60;
    const anim = () => !reduced();

    function placeCam() {
      const d = view.dist;
      camera.position.set(0, TARGET.y + Math.sin(view.pitch) * d, Math.cos(view.pitch) * d);
      // ซูมเข้ามาก ๆ -> เล็งสูงขึ้นไปทางใบหน้า
      const zoomT = Math.max(0, Math.min(1, (HOME.dist - d) / Math.max(0.01, HOME.dist - LIM.dist[0])));
      camera.lookAt(0, TARGET.y + zoomT * 0.28, 0);
      charGroup.rotation.y = view.yaw;
      dirty = true;
    }
    function fitDistance() {
      // ให้เห็นเต็มตัว (สูง ~1.12 m พร้อมขอบ) ตามสัดส่วนจอและมุมกล้อง
      const vfov = (camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const needH = 1.24 / 2 / Math.tan(vfov / 2);
      const needW = 0.78 / 2 / Math.tan(hfov / 2);
      HOME.dist = Math.min(LIM.dist[1], Math.max(2.1, needH, needW));
    }
    function resize() {
      if (!renderer) return;
      const w = Math.max(1, stage.clientWidth); const h = Math.max(1, stage.clientHeight);
      if (!state.quality) ratio = startRatio(w, h);
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);   // ขนาด drawing buffer = ขนาด CSS × pixel ratio (คมบน Retina)
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const wasHome = view.dist === HOME.dist;
      fitDistance();
      if (wasHome || !state.ready) view.dist = HOME.dist;
      placeCam();
    }
    // ปรับคุณภาพตามเวลาเฟรมจริง: ช้า -> ลด pixel ratio ทีละ 0.25 (ไม่ต่ำกว่า 1) แล้วค่อยลด fps เป็น 30
    function adapt(ms) {
      state.frameMs.push(ms);
      // ประเมินทุก 45 เฟรม หรือเร็วกว่านั้นถ้าเครื่องช้ามาก (≥ 8 เฟรมและใช้เวลารวม > 2 วินาที) — ไม่ต้องรอนานบนเครื่องที่ได้ไม่กี่ fps
      if (!state.adaptT0) state.adaptT0 = performance.now();
      if (state.frameMs.length < 45 && !(state.frameMs.length >= 8 && performance.now() - state.adaptT0 > 2000)) return;
      state.adaptT0 = performance.now();
      const avg = state.frameMs.reduce((a, b) => a + b, 0) / state.frameMs.length;
      state.frameMs = [];
      state.avgFrameMs = avg;
      if (avg > 22) {
        if (ratio > 1) { ratio = Math.max(1, ratio - 0.25); state.quality = 'reduced'; renderer.setPixelRatio(ratio); resize(); }
        else if (fpsCap > 30) {
          fpsCap = 30; state.quality = 'low';
          // ขั้นต่ำสุด: ปิด normal map ลายผ้าด้วย (ประหยัด GPU บนเครื่องช้า)
          lowDetail = true;
          scene.traverse((n) => { if (n.isMesh) [].concat(n.material).forEach((x) => { if (x.normalMap) { x.normalMap = null; x.needsUpdate = true; } }); });
        }
      }
    }
    function frame(now) {
      raf = 0;
      if (state.disposed || !visible || document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      if (now - last >= 1000 / fpsCap - 2) {
        last = now;
        if (mixer && anim() && !state.frozen) { mixer.update(dt); dirty = true; }
        if (dirty) {
          const t0 = performance.now();
          draw();
          dirty = false; state.frames += 1;
          if (anim()) adapt(performance.now() - t0 + (dt > 0.05 ? 25 : 0));
        }
      }
      if (anim() || dirty) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !state.disposed && !state.lost) raf = requestAnimationFrame(frame); };

    // ---------- การควบคุม (pointer events บน canvas · capture ที่ canvas เอง) ----------
    const pointers = new Map(); let pinch0 = 0; let dist0 = view.dist; let lastX = 0; let lastY = 0;
    const setDist = (d) => { const n = Math.max(LIM.dist[0], Math.min(LIM.dist[1], d)); const ch = n !== view.dist; view.dist = n; placeCam(); kick(); return ch; };
    function onDown(e) {
      const c = renderer.domElement;
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* - */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      lastX = e.clientX; lastY = e.clientY;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = view.dist; }
      c.classList.add('is-drag');
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (pointers.size === 2 && pinch0) {
        const [a, b] = [...pointers.values()];
        setDist(dist0 * (pinch0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); return;
      }
      const w = Math.max(200, stage.clientWidth);
      view.yaw += ((e.clientX - lastX) / w) * Math.PI * 1.6;   // ลากเต็มความกว้าง ≈ 290°
      if (e.pointerType === 'mouse') view.pitch = Math.max(LIM.pitch[0], Math.min(LIM.pitch[1], view.pitch + ((e.clientY - lastY) / w) * 1.2));
      lastX = e.clientX; lastY = e.clientY;
      placeCam(); kick();
    }
    function onUp(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (!pointers.size) renderer.domElement.classList.remove('is-drag'); }
    function onWheel(e) {
      // ซูมด้วย scroll เฉพาะตอนชี้อยู่บนตัวละคร · ถึงขอบแล้วปล่อยให้หน้าเลื่อนต่อ
      if (setDist(view.dist + Math.sign(e.deltaY) * 0.18)) e.preventDefault();
    }
    function reset() { view = { ...HOME }; placeCam(); kick(); }
    function onKey(e) {
      const k = e.key;
      if (k === 'ArrowLeft') view.yaw -= Math.PI / 8; else if (k === 'ArrowRight') view.yaw += Math.PI / 8;
      else if (k === '+' || k === '=') view.dist = Math.max(LIM.dist[0], view.dist - 0.3); else if (k === '-') view.dist = Math.min(LIM.dist[1], view.dist + 0.3);
      else if (k === '0' || k === 'Home') { reset(); e.preventDefault(); return; } else return;
      e.preventDefault(); placeCam(); kick();
    }
    function tool(e) {
      const an = e.target.closest('[data-a3-anim]');
      if (an) { play(an.dataset.a3Anim); return; }
      const b = e.target.closest('[data-a3]'); if (!b || !renderer) return;
      const k = b.dataset.a3;
      if (k === 'left') view.yaw -= Math.PI / 4; else if (k === 'right') view.yaw += Math.PI / 4;
      else if (k === 'in') view.dist = Math.max(LIM.dist[0], view.dist - 0.35); else if (k === 'out') view.dist = Math.min(LIM.dist[1], view.dist + 0.35);
      else { reset(); return; }
      placeCam(); kick();
    }
    el.addEventListener('click', tool);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) { dirty = true; kick(); } }) : null;
    const onVis = () => { if (!document.hidden) { dirty = true; kick(); } };
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { resize(); kick(); }) : null;

    // ---------- ประกอบตัวละคร ----------
    function skinTone(bodyId) {
      const hex = (man.base.skinTones || {})[bodyId] || '#e8b48c';
      charGroup.traverse((n) => { if (n.isMesh && n.material && !Array.isArray(n.material) && n.material.name.startsWith('MAT_Skin')) n.material.color.set(hex); });
    }
    function removeSlot(slot) {
      (state.slots[slot] || []).forEach((m) => { m.removeFromParent(); m.geometry.dispose(); [].concat(m.material).forEach((x) => x.dispose()); if (m.skeleton) m.skeleton.dispose(); });   // skeleton.dispose = คืน bone texture (ไม่งั้นรั่วทุกครั้งที่เปลี่ยนชุด)
      delete state.slots[slot];
    }
    async function loadSlot(slot, itemId, gen) {
      const it = o.byId[itemId];
      const g = await parse(T, it.model.glbUrl);
      // เลือกชิ้นอื่นไปแล้วระหว่างโหลด -> ทิ้งผลนี้ (กันชุดเก่ากลับมาทับชุดใหม่)
      if (state.disposed || state.gen[slot] !== gen) { g.scene.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach((x) => x.dispose()); if (n.skeleton) n.skeleton.dispose(); } }); return; }
      const meshes = [];
      g.scene.traverse((n) => { if (n.isSkinnedMesh) meshes.push(n); });
      if (!meshes.length) throw new Error(`ไม่มี mesh ใน ${it.id}`);
      removeSlot(slot);
      meshes.forEach((m) => {
        const sk = m.skeleton;
        const nb = sk.bones.map((b) => bones[b.name]);
        if (nb.some((b) => !b)) throw new Error(`bone ไม่ตรง ${it.id}`);
        m.removeFromParent();
        [].concat(m.material).forEach((x) => tuneMaterial(x, T));
        m.frustumCulled = false;
        m.userData.itemId = itemId;
        baseMesh.parent.add(m);
        m.bind(new T.Skeleton(nb, sk.boneInverses), baseMesh.bindMatrix);
      });
      state.slots[slot] = meshes;
      if (slot === 'face' || slot === 'hair') skinTone(state.outfit.body);
      dirty = true; kick();
    }
    /** หมวกที่ครอบศีรษะมี "ระนาบขอบหมวก" (model.clip = [a,b,c] จาก Blender: z = a + b·x + c·y) → ตัดผม/ก้านหูฟังส่วนที่อยู่เหนือระนาบ
     *  (ส่วนนั้นอยู่ในหมวก มองไม่เห็นอยู่แล้ว) — ผมฟู/สูงจึงไม่ทะลุหมวก · ระนาบเคลื่อนตามกระดูก Head ทุกเฟรม (ก้ม/หัน/เต้นได้) */
    function applyHatClip() {
      const hat = state.slots.hat && state.slots.hat[0] && o.byId[state.slots.hat[0].userData.itemId];
      const c = hat && hat.model && hat.model.clip;
      clip.local = c ? new T.Plane(new T.Vector3(c[1], -1, -c[2]), c[0]).normalize() : null;
      ['hair', 'headphones'].forEach((sl) => (state.slots[sl] || []).forEach((m) => [].concat(m.material).forEach((x) => {
        const want = clip.local ? [clip.plane] : null;
        if ((x.clippingPlanes || null) !== want) { x.clippingPlanes = want; x.needsUpdate = true; }
      })));
      state.hatClip = Boolean(clip.local);
    }
    function syncClip() {
      if (!clip.local || !clip.rest) return;
      const h = bones.Head;
      h.updateWorldMatrix(true, false);
      clip.m.multiplyMatrices(h.matrixWorld, clip.rest);   // = ท่าปัจจุบันของหัว (world) × ท่าพักของหัว^-1 (ในพิกัดตัวละคร)
      clip.plane.copy(clip.local).applyMatrix4(clip.m);
    }
    function draw() { syncClip(); renderer.render(scene, camera); }
    /** ซ่อนส่วนร่างกายที่ชิ้นที่ "โหลดเสร็จแล้ว" ปิดมิด (ข้อมูล masks มาจากการตรวจใน Blender) · ถอดชิ้นออก = แสดงกลับ */
    function applyMasks() {
      const hide = new Set();
      for (const [slot, ms] of Object.entries(state.slots)) {
        const it = ms && ms[0] && o.byId[ms[0].userData.itemId];
        if (it && it.model && it.model.masks && ms.every((m) => m.visible)) it.model.masks.forEach((r) => hide.add(r));
      }
      for (const [r, ms] of Object.entries(bodyRegions)) ms.forEach((m) => { m.visible = !hide.has(r) || state.debugNoMask; });
      state.masked = [...hide];
      dirty = true;
    }
    function setBackdrop(outfit) {
      const it = o.byId[outfit.background];
      const part = it && it.parts && it.parts[0];
      stage.style.backgroundImage = part ? `url("${part.url}")` : '';
      stage.classList.toggle('has-bg', Boolean(part));
    }
    /** สลับชุด: ถอด/ใส่เฉพาะ slot ที่เปลี่ยน · คืน { missing: ชื่อชิ้นที่ไม่มี 3D } */
    async function setOutfit(outfit) {
      if (!renderer) { state.pending = { ...outfit }; return { missing: [] }; }
      const prev = state.outfit || {};
      state.outfit = { ...outfit };
      skinTone(outfit.body);
      setBackdrop(outfit);
      const missing = [];
      const jobs = [];
      WEAR.forEach((slot) => {
        const id = outfit[slot] || null;
        const it = id && o.byId[id];
        if (it && !it.model) missing.push(it.name);
        if (prev[slot] === id && (state.slots[slot] || !id)) return;
        state.gen[slot] = (state.gen[slot] || 0) + 1;
        if (!id || !it || !it.model) { removeSlot(slot); return; }
        jobs.push(loadSlot(slot, id, state.gen[slot]));
      });
      state.missing = missing;
      report('loading-items');
      await Promise.all(jobs);
      applyMasks();
      applyHatClip();
      trimCache(new Set([man.base.glbUrl, ...Object.values(state.outfit).map((id) => o.byId[id] && o.byId[id].model && o.byId[id].model.glbUrl).filter(Boolean)]));
      dirty = true; kick();
      if (state.ready) report('ready', { missing });
      return { missing };
    }
    function play(name) {
      if (!mixer || !clips[name] || !anim()) return;
      const a = mixer.clipAction(clips[name]);
      a.reset(); a.setLoop(name === 'walk' ? T.LoopRepeat : T.LoopOnce, name === 'walk' ? 3 : 1); a.clampWhenFinished = false; a.fadeIn(0.2).play();
      if (idleAction) idleAction.fadeOut(0.2);
      const done = (ev) => { if (ev.action !== a) return; mixer.removeEventListener('finished', done); a.fadeOut(0.25); if (idleAction) idleAction.reset().fadeIn(0.25).play(); };
      mixer.addEventListener('finished', done);
      kick();
    }
    /** portrait (หัว/ไหล่) สำหรับ avatarThumbnail — 256×256 WebP (Safari: PNG) */
    /** ภาพนิ่ง: 'head' = รูปโปรไฟล์ (ครึ่งบน) · 'full' = เต็มตัว (ภาพตัวอย่างชุดที่บันทึกไว้) — ไม่ขึ้นกับมุมที่ผู้ใช้หมุนอยู่ */
    function snapshot(size = 256, framing = 'head', yaw = 0.28) {
      if (!renderer) return null;
      const keep = { w: stage.clientWidth, h: stage.clientHeight, pr: renderer.getPixelRatio(), view: { ...view }, aspect: camera.aspect };
      renderer.setPixelRatio(1); renderer.setSize(size, size, false);
      camera.aspect = 1; camera.updateProjectionMatrix();
      charGroup.rotation.y = yaw;
      if (framing === 'full') {
        const d = 1.18 / 2 / Math.tan((camera.fov * Math.PI) / 360);
        camera.position.set(0, 0.56, d); camera.lookAt(0, 0.52, 0);
      } else if (framing === 'feet') { camera.position.set(0, 0.2, 0.95); camera.lookAt(0, 0.08, 0); }   // QA: รองเท้า/ข้อเท้า
      else { camera.position.set(0, 0.84, 1.78); camera.lookAt(0, 0.74, 0); }   // style v3: หัวใหญ่ขึ้น (ศูนย์หัว ≈ 0.76)
      draw();
      let url = renderer.domElement.toDataURL('image/webp', 0.86);
      if (!url.startsWith('data:image/webp')) {
        // Safari รุ่นที่ยังเข้ารหัส WebP ไม่ได้ -> PNG · ถ้าใหญ่เกินที่เซิร์ฟเวอร์รับ (80 KB) ย่อลงแล้วเรนเดอร์ใหม่
        url = renderer.domElement.toDataURL('image/png');
        if (url.length * 0.75 > 78 * 1024) {
          const s2 = Math.round(size * 0.7); renderer.setSize(s2, s2, false); draw();
          url = renderer.domElement.toDataURL('image/png');
        }
      }
      renderer.setPixelRatio(keep.pr); renderer.setSize(keep.w, keep.h, false);
      camera.aspect = keep.aspect; camera.updateProjectionMatrix(); view = keep.view; placeCam();
      draw();
      return url;
    }
    function dispose() { state.closed = true; teardown(); }
    function teardown() {
      if (state.disposed) return;
      state.disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (io) io.disconnect(); if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('click', tool);
      if (renderer) {
        scene.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach((x) => x.dispose()); if (n.skeleton) n.skeleton.dispose(); } });
        if (scene.environment) scene.environment.dispose();
        renderer.dispose(); if (!state.lost) renderer.forceContextLoss(); liveViewers = Math.max(0, liveViewers - 1);
      }
    }

    // ฟังก์ชันล้วน: ปุ่ม "ลองใหม่"/context restore แทนที่ได้ทั้งชุด
    const api = { setOutfit, play, snapshot, dispose, missing: () => state.missing, isReady: () => state.ready, tier: t,
      view: () => ({ ...view }), slots: () => Object.fromEntries(Object.entries(state.slots).map(([k, v]) => [k, v[0] && v[0].userData.itemId])),
      stats: () => (renderer ? { frames: state.frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio(),
        devicePixelRatio: window.devicePixelRatio || 1, buffer: [renderer.domElement.width, renderer.domElement.height],
        css: [stage.clientWidth, stage.clientHeight], fpsCap, quality: state.quality || 'full', avgFrameMs: state.avgFrameMs || null } : null),
      // ตรวจ asset (ใช้ใน test): กล่องขอบเขตของแต่ละ slot หลัง skinning ในพิกัดตัวละคร (หันหน้าตรง) — ยืนยันว่าชิ้นผูกกับ rig ถูกตำแหน่ง
      clipNames: () => Object.keys(clips),
      masked: () => state.masked || [],
      _noMask: (on) => { state.debugNoMask = Boolean(on); applyMasks(); kick(); },
      _setVisible: (which, on) => { const ms = which === 'base' ? (() => { const a = []; root.traverse((n) => { if (n.isSkinnedMesh && !n.userData.itemId) a.push(n); }); return a; })() : (state.slots[which] || []); ms.forEach((m) => { m.visible = on; }); dirty = true; kick(); },
      // ตรึงท่า: clip ที่เวลา t วินาที (ใช้ใน Animation Regression Test และ QA) · name = null -> กลับไปท่า Idle ตามปกติ
      _pose: (name, t = 0) => {
        if (!mixer) return false;
        mixer.stopAllAction();
        if (name && clips[name]) { const a = mixer.clipAction(clips[name]); a.reset(); a.play(); a.paused = true; a.time = t; mixer.update(0); state.frozen = true; }
        else { state.frozen = false; if (idleAction) { idleAction.reset().play(); mixer.update(0); } }
        root.updateMatrixWorld(true); dirty = true; kick(); return true;
      },
      _clip: () => ({ local: clip.local && [clip.local.normal.toArray(), clip.local.constant], plane: clip.plane && [clip.plane.normal.toArray(), clip.plane.constant], head: bones.Head && bones.Head.getWorldPosition(new T.Vector3()).toArray() }),
      _slotBoxes: () => {
        if (!charGroup) return {};
        const yaw = charGroup.rotation.y; charGroup.rotation.y = 0; charGroup.updateMatrixWorld(true);
        const out = {};
        for (const [slot, ms] of Object.entries(state.slots)) {
          let b = null;
          ms.forEach((m) => { m.computeBoundingBox(); const x = m.boundingBox.clone().applyMatrix4(m.matrixWorld); b = b ? b.union(x) : x; });
          if (b) out[slot] = { min: [b.min.x, b.min.y, b.min.z].map((v) => +v.toFixed(3)), max: [b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(3)), meshes: ms.length, visible: ms.every((m) => m.visible && m.parent) };
        }
        charGroup.rotation.y = yaw; charGroup.updateMatrixWorld(true);
        return out;
      },
      _loseContext: () => { const x = renderer && renderer.getContext().getExtension('WEBGL_lose_context'); if (x) { x.loseContext(); setTimeout(() => x.restoreContext(), 300); } } };

    // ---------- เริ่ม ----------
    if (t === 'none') { fail(new Error('no webgl')); return api; }
    const timeout = setTimeout(() => { if (!state.ready) { teardown(); fail(new Error('timeout')); } }, 25000);
    (async () => {
      try {
        report('loading');
        [T, man] = await Promise.all([lib(), manifest(o.api)]);
        if (!man.base) throw new Error('no base');
        const g = await parse(T, man.base.glbUrl);
        if (state.disposed) return;
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
        liveViewers += 1;
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.localClippingEnabled = true;
        clip.plane = new T.Plane(); clip.m = new T.Matrix4();
        renderer.toneMapping = T.NeutralToneMapping;
        renderer.toneMappingExposure = 1.05;
        scene = new T.Scene();
        const pm = new T.PMREMGenerator(renderer);
        scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;   // แสงนุ่มรอบทิศ (สร้างครั้งเดียว ไม่โหลดไฟล์)
        pm.dispose();
        camera = new T.PerspectiveCamera(28, 1, 0.05, 20);
        scene.add(new T.HemisphereLight(0xffffff, 0xc7d2ea, 0.55));
        const key = new T.DirectionalLight(0xfff6ec, 1.25); key.position.set(-1.4, 2.4, 2.6); scene.add(key);
        const rim = new T.DirectionalLight(0xdfe8ff, 0.8); rim.position.set(1.6, 1.8, -2.2); scene.add(rim);
        const shadow = new T.Mesh(new T.CircleGeometry(0.28, 40), new T.MeshBasicMaterial({ color: 0x1b2340, transparent: true, opacity: 0.16, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
        charGroup = new T.Group(); scene.add(charGroup);
        root = g.scene; charGroup.add(root);
        root.traverse((n) => {
          if (n.isBone) bones[n.name] = n;
          if (n.isSkinnedMesh) {
            baseMesh = n; n.frustumCulled = false; [].concat(n.material).forEach((x) => tuneMaterial(x, T));
            // ส่วนร่างกาย (BODY_<region>) — ซ่อนได้เมื่อเสื้อผ้าที่สวมปิดมิด (Body Mask: กันผิวโผล่ทะลุผ้าตอนขยับ)
            for (let p = n; p; p = p.parent) { const m = /^BODY_([a-z]+)/.exec(p.name || ''); if (m) { (bodyRegions[m[1]] = bodyRegions[m[1]] || []).push(n); break; } }
          }
        });
        if (!baseMesh) throw new Error('no base mesh');
        // ท่าพักของหัว (ก่อนเล่น animation) — ใช้ย้ายระนาบขอบหมวกตามหัว
        if (bones.Head) { root.updateWorldMatrix(true, true); clip.rest = bones.Head.matrixWorld.clone().premultiply(charGroup.matrixWorld.clone().invert()).invert(); }
        clips = Object.fromEntries(g.animations.map((c) => [c.name.replace('ANIM_', '').toLowerCase(), c]));
        mixer = new T.AnimationMixer(root);
        if (clips.idle) { idleAction = mixer.clipAction(clips.idle); idleAction.setLoop(T.LoopRepeat, Infinity); idleAction.play(); mixer.update(0); }
        const c = renderer.domElement;
        c.className = 'a3-canvas';
        c.tabIndex = 0;
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', `${o.label || 'อวตาร 3 มิติ'} — ลากหรือใช้ปุ่มลูกศรเพื่อหมุน, + − เพื่อซูม, 0 เพื่อรีเซ็ต`);
        stage.innerHTML = '';
        stage.appendChild(c);
        c.addEventListener('pointerdown', onDown);
        c.addEventListener('pointermove', onMove);
        c.addEventListener('pointerup', onUp);
        c.addEventListener('pointercancel', onUp);
        c.addEventListener('lostpointercapture', onUp);
        c.addEventListener('wheel', onWheel, { passive: false });
        c.addEventListener('dblclick', reset);
        c.addEventListener('keydown', onKey);
        c.addEventListener('webglcontextlost', (e) => {
          e.preventDefault(); state.lost = true; if (raf) cancelAnimationFrame(raf); raf = 0;
          report('context-lost');
        });
        c.addEventListener('webglcontextrestored', () => {
          // สร้าง viewer ใหม่ทั้งชุด (ทรัพยากร GPU เดิมหายหมดแล้ว) — ชุดเดิม/มุมกล้องเดิม
          const keepView = { ...view };
          teardown();
          const v = mount(el, { ...o, outfit: state.outfit || o.outfit, onState: (s, x) => { if (s === 'ready' && v.setView) v.setView(keepView); if (o.onState) o.onState(s, x); } });
          Object.assign(api, v);
        });
        if (io) io.observe(stage);
        if (ro) ro.observe(stage);
        document.addEventListener('visibilitychange', onVis);
        resize();
        view = { ...HOME };
        placeCam();
        await setOutfit(state.pending || o.outfit);
        clearTimeout(timeout);
        state.ready = true;
        report('ready', { missing: state.missing });
        if (o.anim) play(o.anim);
        kick();
      } catch (err) {
        clearTimeout(timeout);
        console.warn('[avatar3d]', err && err.message);
        teardown();
        fail(err);
      }
    })();
    api.setView = (v) => { if (renderer) { view = { ...view, ...v }; placeCam(); kick(); } };
    return api;
  }

  /**
   * ตัวละครสำหรับฉากที่มีหลายคน (EnglishQuest World) — ใช้ระบบเดียวกับ Wardrobe ทุกอย่าง:
   * Base + ชิ้น GLB ต่อ slot → rebind เข้า Skeleton เดียว · ซ่อนส่วนร่างกายตาม mask · ตัดผมใต้หมวก · ลายผ้า · สีผิว
   * ไม่สร้าง renderer เอง (ฉากของผู้เรียกเป็นผู้วาด) · คืน { group, setOutfit, setState, emote, update, dispose }
   * @param {{T:object, api:Function, byId:object, outfit:object}} o
   */
  async function createCharacter(o) {
    const T = o.T;
    const man = await manifest(o.api);
    const g = await parse(T, man.base.glbUrl);
    const group = new T.Group();
    const root = g.scene; group.add(root);
    const bones = {}; let baseMesh = null; const bodyRegions = {}; const slots = {}; const gen = {};
    root.traverse((n) => {
      if (n.isBone) bones[n.name] = n;
      if (n.isSkinnedMesh) {
        baseMesh = n; n.frustumCulled = false; [].concat(n.material).forEach((x) => tuneMaterial(x, T));
        for (let p = n; p; p = p.parent) { const m = /^BODY_([a-z]+)/.exec(p.name || ''); if (m) { (bodyRegions[m[1]] = bodyRegions[m[1]] || []).push(n); break; } }
      }
    });
    const clip = { plane: new T.Plane(), m: new T.Matrix4(), local: null, rest: null };
    if (bones.Head) { root.updateWorldMatrix(true, true); clip.rest = bones.Head.matrixWorld.clone().invert(); }
    const clips = Object.fromEntries(g.animations.map((c) => [c.name.replace('ANIM_', '').toLowerCase(), c]));
    const mixer = new T.AnimationMixer(root);
    const actions = {};
    const act = (name) => { if (!clips[name]) return null; if (!actions[name]) actions[name] = mixer.clipAction(clips[name]); return actions[name]; };
    let state = null; let stateAction = null; let oneShot = null;
    let outfit = {};
    function skinTone(bodyId) {
      const hex = (man.base.skinTones || {})[bodyId] || '#e8b48c';
      group.traverse((n) => { if (n.isMesh && n.material && !Array.isArray(n.material) && n.material.name.startsWith('MAT_Skin')) n.material.color.set(hex); });
    }
    function removeSlot(slot) {
      (slots[slot] || []).forEach((m) => { m.removeFromParent(); m.geometry.dispose(); [].concat(m.material).forEach((x) => x.dispose()); if (m.skeleton) m.skeleton.dispose(); });
      delete slots[slot];
    }
    async function loadSlot(slot, itemId, gn) {
      const it = o.byId[itemId];
      const gg = await parse(T, it.model.glbUrl);
      if (gen[slot] !== gn || disposed) { gg.scene.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach((x) => x.dispose()); } }); return; }
      const meshes = [];
      gg.scene.traverse((n) => { if (n.isSkinnedMesh) meshes.push(n); });
      removeSlot(slot);
      meshes.forEach((m) => {
        const nb = m.skeleton.bones.map((b) => bones[b.name]);
        if (nb.some((b) => !b)) return;
        m.removeFromParent();
        [].concat(m.material).forEach((x) => tuneMaterial(x, T));
        m.frustumCulled = false; m.userData.itemId = itemId;
        baseMesh.parent.add(m);
        m.bind(new T.Skeleton(nb, m.skeleton.boneInverses), baseMesh.bindMatrix);
      });
      slots[slot] = meshes;
    }
    function applyMasks() {
      const hide = new Set();
      for (const ms of Object.values(slots)) {
        const it = ms && ms[0] && o.byId[ms[0].userData.itemId];
        if (it && it.model && it.model.masks) it.model.masks.forEach((r) => hide.add(r));
      }
      for (const [r, ms] of Object.entries(bodyRegions)) ms.forEach((m) => { m.visible = !hide.has(r); });
    }
    function applyHatClip() {
      const hat = slots.hat && slots.hat[0] && o.byId[slots.hat[0].userData.itemId];
      const c = hat && hat.model && hat.model.clip;
      clip.local = c ? new T.Plane(new T.Vector3(c[1], -1, -c[2]), c[0]).normalize() : null;
      ['hair', 'headphones'].forEach((sl) => (slots[sl] || []).forEach((m) => [].concat(m.material).forEach((x) => {
        const want = clip.local ? [clip.plane] : null;
        if ((x.clippingPlanes || null) !== want) { x.clippingPlanes = want; x.needsUpdate = true; }
      })));
    }
    let disposed = false;
    async function setOutfit(next) {
      const prev = outfit; outfit = { ...next };
      skinTone(outfit.body);
      const jobs = [];
      WEAR.forEach((slot) => {
        if (slot === 'effect') return;   // เอฟเฟกต์ลอยรอบตัวไม่แสดงในฉากรวม (ประหยัด draw call · ไม่บังผู้เล่นอื่น)
        const id = outfit[slot] || null; const it = id && o.byId[id];
        if (prev[slot] === id && (slots[slot] || !id)) return;
        gen[slot] = (gen[slot] || 0) + 1;
        if (!id || !it || !it.model) { removeSlot(slot); return; }
        jobs.push(loadSlot(slot, id, gen[slot]).catch(() => {}));
      });
      await Promise.all(jobs);
      if (disposed) return;
      applyMasks(); applyHatClip(); skinTone(outfit.body);
    }
    /** สถานะต่อเนื่อง: idle / walk / run / sit (crossfade) */
    function setState(s, speed = 1) {
      const name = s === 'run' ? 'run' : s === 'walk' ? 'walk' : s === 'sit' ? 'sit' : 'idle';
      if (state === name && stateAction) { stateAction.timeScale = speed; return; }
      const a = act(name) || act('idle');
      if (!a) return;
      a.reset(); a.setLoop(T.LoopRepeat, Infinity); a.timeScale = speed; a.enabled = true;
      if (oneShot && name !== 'idle') { oneShot.fadeOut(0.15); oneShot = null; }
      if (stateAction && stateAction !== a) { a.crossFadeFrom(stateAction, 0.22, false); }
      a.play();
      stateAction = a; state = name;
    }
    /** ท่าทางครั้งเดียว (โบกมือ ดีใจ …) ทับบนท่ายืน แล้วกลับท่าเดิม */
    function emote(name) {
      const a = act(name);
      if (!a || state === 'sit') return;
      if (oneShot) oneShot.stop();
      a.reset(); a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = false; a.fadeIn(0.15).play();
      if (stateAction) stateAction.fadeOut(0.15);
      oneShot = a;
      const done = (ev) => { if (ev.action !== a) return; mixer.removeEventListener('finished', done); a.fadeOut(0.2); if (stateAction) stateAction.reset().fadeIn(0.2).play(); if (oneShot === a) oneShot = null; };
      mixer.addEventListener('finished', done);
    }
    function update(dt) {
      mixer.update(dt);
      if (clip.local && clip.rest && bones.Head) {
        bones.Head.updateWorldMatrix(true, false);
        clip.m.multiplyMatrices(bones.Head.matrixWorld, clip.rest);   // ท่าหัวตอนนี้ (โลก รวมตำแหน่ง/ทิศของตัวละคร) × ท่าพักของหัว^-1
        clip.plane.copy(clip.local).applyMatrix4(clip.m);
      }
    }
    function dispose() {
      disposed = true;
      group.removeFromParent();
      group.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach((x) => x.dispose()); if (n.skeleton) n.skeleton.dispose(); } });
      mixer.stopAllAction();
    }
    await setOutfit(o.outfit || {});
    setState('idle');
    mixer.update(Math.random() * 2);   // ไม่ให้ทุกคนหายใจพร้อมกัน
    return { group, setOutfit, setState, emote, update, dispose, bones, clipNames: () => Object.keys(clips), get outfit() { return outfit; } };
  }

  window.EQAvatar3D = { mount, createCharacter, tier, lib, startRatio, tuneMaterial: (m, T) => tuneMaterial(m, T), get live() { return liveViewers; }, _cacheSize: () => bufs.size };
}());
