/*
  v1.27.0 World Raid — ฉาก 3D (ES module · โหลดเฉพาะเมื่อเปิดหน้า Raid)
  - three.js ชุดเฉพาะ Raid (/vendor/eq-three-raid.min.js) · GLB บีบอัด meshopt (บอส ~200–270KB · ฉาก 30–90KB)
  - Renderer ตัวเดียวตลอดอายุหน้า (ไม่สร้าง WebGL context ซ้ำ) · เปลี่ยนบอส = dispose geometry/material/texture ของตัวเก่า
  - Animation ตามสถานะจริงจากเซิร์ฟเวอร์: spawn → idle (Phase 1) / enrage (Phase 3) · stun ตอนโล่แตก · hit เมื่อมีดาเมจ
    · prepare → attack / special เป็นจังหวะ (ฉาก) · phase ตอนเปลี่ยน Phase · death เมื่อบอสถูกล้ม
  - เอฟเฟกต์: ละอองตามฉาก (หิ่งห้อย/ประกายไฟ/หิมะ) · ออร่า · โล่พลังงาน · ลูกพลังโจมตีตามชนิดคำถาม · แรงกระแทก · สั่นจอเบา ๆ
  - คุณภาพ: high / medium / low (ลด particle · pixel ratio · เงา) · reduced motion = ไม่สั่นจอ ไม่มี particle เคลื่อนที่เร็ว
  - หยุดวาดเมื่อแท็บถูกซ่อน / หน้าไม่แสดง / canvas อยู่นอกจอ
  แยก Visual ออกจาก Combat: โมดูลนี้ไม่รู้เรื่องดาเมจจริง — รับแค่เหตุการณ์ (hit/phase/stun/defeat) จาก raid.js
*/
const V = '0.169.0-raid1';
let T = null;
async function three() {
  if (!T) T = await import(`/vendor/eq-three-raid.min.js?v=${V}`);
  return T;
}

const PARTICLES = {
  forest: { color: '#C8FF7A', count: 90, speed: 0.15, size: 0.09, rise: 0.12, kind: 'firefly' },
  volcano: { color: '#FF8A2A', count: 140, speed: 0.4, size: 0.07, rise: 0.9, kind: 'ember' },
  frost: { color: '#E8F8FF', count: 220, speed: 0.5, size: 0.06, rise: -0.7, kind: 'snow' },
  'frost-xmas': { color: '#FFFFFF', count: 280, speed: 0.6, size: 0.065, rise: -0.8, kind: 'snow' },
  'shadow-tower': { color: '#C4A5FF', count: 120, speed: 0.22, size: 0.08, rise: 0.35, kind: 'firefly' },   // v1.27.1 ละอองเวทม่วงลอยขึ้นช้า ๆ
  // v1.27.1 ฉากของบอสชุดที่ 2
  celestial: { color: '#FFE9A8', count: 110, speed: 0.18, size: 0.08, rise: 0.25, kind: 'firefly' },
  ruins: { color: '#E5CB98', count: 120, speed: 0.35, size: 0.05, rise: 0.05, kind: 'ember' },
  abyss: { color: '#9FF3FF', count: 150, speed: 0.2, size: 0.07, rise: 0.45, kind: 'firefly' },
  'flame-palace': { color: '#FFB347', count: 160, speed: 0.45, size: 0.07, rise: 1.0, kind: 'ember' },
  'void-throne': { color: '#A5B4FC', count: 140, speed: 0.15, size: 0.06, rise: -0.2, kind: 'firefly' },
  ascension: { color: '#FCE7F3', count: 130, speed: 0.25, size: 0.08, rise: 0.4, kind: 'firefly' },
};
const SKY = {
  forest: { bg: '#0E1F1A', fog: '#16302A', hemi: ['#BFEFD0', '#20301C'], key: '#FFF0D2', rim: '#9CFF7A', exposure: 1.05 },
  volcano: { bg: '#1A0B07', fog: '#2A1009', hemi: ['#FFB08A', '#1A0A06'], key: '#FFC48A', rim: '#FF6A1A', exposure: 1.1 },
  frost: { bg: '#0C1A2E', fog: '#1B3350', hemi: ['#D8F0FF', '#22364A'], key: '#E6F4FF', rim: '#7FD8FF', exposure: 1.0 },
  'frost-xmas': { bg: '#0A1328', fog: '#15284A', hemi: ['#D8E8FF', '#1A2440'], key: '#FFE8C0', rim: '#7FD8FF', exposure: 0.95 },
  'shadow-tower': { bg: '#0D0A1A', fog: '#1B1433', hemi: ['#DCD0FF', '#140F24'], key: '#EDE4FF', rim: '#A78BFA', exposure: 1.1 },
  celestial: { bg: '#2A2440', fog: '#4A3F66', hemi: ['#FFF3D6', '#3A2F55'], key: '#FFF0D2', rim: '#FFD978', exposure: 1.05 },
  ruins: { bg: '#2B2015', fog: '#4A3826', hemi: ['#FFE6C0', '#2A1E12'], key: '#FFE2B0', rim: '#7FFFE4', exposure: 1.05 },
  abyss: { bg: '#041824', fog: '#0B3346', hemi: ['#B8F2FF', '#05141E'], key: '#CFF6FF', rim: '#38BDF8', exposure: 1.1 },
  'flame-palace': { bg: '#1E0806', fog: '#3A110A', hemi: ['#FFC9A0', '#200805'], key: '#FFD8A8', rim: '#FB923C', exposure: 1.1 },
  'void-throne': { bg: '#05040C', fog: '#110F26', hemi: ['#C7CCFF', '#07060F'], key: '#E0E7FF', rim: '#818CF8', exposure: 1.15 },
  ascension: { bg: '#2B1F38', fog: '#4E3A63', hemi: ['#FFF0FB', '#2A1F33'], key: '#FFF5FD', rim: '#F0ABFC', exposure: 1.0 },
};
const ELEMENT_FX = { vocab: '#7CE3FF', context: '#9BFFB0', grammar: '#C9A2FF', error: '#FFB36B', reading: '#FFE07A', listening: '#FF9EC7' };

export async function createScene(host, opts = {}) {
  const t = await three();
  const reduced = Boolean(opts.reducedMotion);
  const quality = opts.quality || 'auto';
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const Q = quality === 'auto' ? (isMobile ? 'medium' : 'high') : quality;
  const qMul = Q === 'high' ? 1 : Q === 'medium' ? 0.6 : 0.3;

  let renderer;
  try {
    renderer = new t.WebGLRenderer({ antialias: Q !== 'low', alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('webgl_unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q === 'high' ? 1.75 : Q === 'medium' ? 1.35 : 1));
  renderer.outputColorSpace = t.SRGBColorSpace;
  renderer.toneMapping = t.ACESFilmicToneMapping;
  renderer.domElement.className = 'rd-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new t.Scene();
  const camera = new t.PerspectiveCamera(38, 1, 0.1, 120);
  const pm = new t.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new t.RoomEnvironment(), 0.04).texture;
  scene.environment = envTex; scene.environmentIntensity = 0.28;
  const hemi = new t.HemisphereLight('#ffffff', '#202020', 0.75); scene.add(hemi);
  const key = new t.DirectionalLight('#ffffff', 2.0); key.position.set(-5, 8, 7); scene.add(key);
  const rim = new t.DirectionalLight('#ffffff', 1.8); rim.position.set(6, 4, -6); scene.add(rim);
  const aura = new t.PointLight('#ffffff', 0, 9, 1.6); aura.position.set(0, 1.6, 0.8); scene.add(aura);

  const loader = new t.GLTFLoader(); loader.setMeshoptDecoder(t.MeshoptDecoder);
  const glowTex = makeGlowTexture(t);
  const ringTex = makeRingTexture(t);

  const S = {
    boss: null, arena: null, mixer: null, actions: {}, current: null, bossKey: null, arenaKey: null, chest: null, head: null,
    particles: null, partCfg: null, shield: null, auraSprite: null, groundRing: null, fx: [], shake: 0, running: true, visible: true,
    lastFrame: 0, clock: new t.Clock(), phase: 1, stunned: false, defeated: false, nextAttackAt: 0, size: { w: 1, h: 1 }, onFrame: null,
    camBase: new t.Vector3(0, 2.6, 9.5), lookAt: new t.Vector3(0, 1.7, 0), dispose: null,
  };

  function glowPatch(m, glow) {
    if (!m || m.userData.rdPatched) return;
    m.userData.rdPatched = true;
    if (m.emissive && m.emissive.getHex() === 0 && glow) { m.emissive = new t.Color(glow); m.emissiveIntensity = 2.6; }
    else if (m.emissive) m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, 1.6);
    if (m.vertexColors) {
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_COLOR_ALPHA\n totalEmissiveRadiance *= vColor.a;\n#else\n totalEmissiveRadiance *= 0.0;\n#endif');
      };
    }
  }

  function disposeObj(o) {
    if (!o) return;
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
      for (const m of mats) { for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); }
    });
    if (o.parent) o.parent.remove(o);
  }

  function load(url) { return new Promise((ok, no) => loader.load(url, ok, undefined, no)); }

  function applySky(arenaKey) {
    const k = SKY[arenaKey] || SKY.forest;
    scene.background = new t.Color(k.bg);
    scene.fog = new t.FogExp2(k.fog, 0.045);
    hemi.color.set(k.hemi[0]); hemi.groundColor.set(k.hemi[1]);
    key.color.set(k.key); rim.color.set(k.rim);
    renderer.toneMappingExposure = k.exposure;
  }

  function buildParticles(arenaKey) {
    if (S.particles) { S.particles.geometry.dispose(); S.particles.material.dispose(); scene.remove(S.particles); S.particles = null; }
    const cfg = PARTICLES[arenaKey] || PARTICLES.forest;
    const n = Math.round(cfg.count * qMul * (reduced ? 0.4 : 1));
    if (n < 4) return;
    const g = new t.BufferGeometry();
    const pos = new Float32Array(n * 3); const seed = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2; const r = 1.5 + Math.random() * 9;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = Math.sin(a) * r - 1;
      seed[i] = Math.random() * 100;
    }
    g.setAttribute('position', new t.BufferAttribute(pos, 3));
    const m = new t.PointsMaterial({ color: cfg.color, size: cfg.size * (Q === 'low' ? 1.4 : 1), map: glowTex, transparent: true, depthWrite: false, blending: t.AdditiveBlending, sizeAttenuation: true, fog: true });
    S.particles = new t.Points(g, m); S.particles.userData.seed = seed; S.particles.frustumCulled = false;
    S.partCfg = cfg;
    scene.add(S.particles);
  }

  function frame() {
    const box = new t.Box3().setFromObject(S.boss);
    const size = box.getSize(new t.Vector3()); const c = box.getCenter(new t.Vector3());
    const h = Math.max(size.y, size.x * 0.75, 2.5);
    const aspect = S.size.w / Math.max(1, S.size.h);
    const dist = h * (aspect < 0.9 ? 2.35 : 1.75) + 2.2;
    S.lookAt.set(0, c.y * 0.95, 0);
    S.camBase.set(0, c.y + h * 0.18, dist);
    camera.position.copy(S.camBase); camera.lookAt(S.lookAt);
    aura.position.set(0, c.y, 1.2);
    if (S.auraSprite) { S.auraSprite.position.set(0, c.y * 0.9, -0.4); S.auraSprite.scale.setScalar(h * 1.6); }
    if (S.shield) { S.shield.position.set(0, c.y, 0); S.shield.scale.setScalar(h * 0.62); }
  }

  /** โหลดบอส (+ฉาก) · เรียกซ้ำด้วยบอสเดิม = ไม่โหลดใหม่ */
  async function setBoss(b) {
    if (!b || !b.assets || !b.assets.boss) throw new Error('no_model');
    const arenaKey = b.arena;
    if (S.arenaKey !== arenaKey && b.assets.arena) {
      const ga = await load(b.assets.arena);
      disposeObj(S.arena); S.arena = ga.scene; S.arenaKey = arenaKey;
      S.arena.traverse((o) => { if (o.isMesh) { glowPatch(o.material, null); o.matrixAutoUpdate = false; o.updateMatrix(); } });
      scene.add(S.arena);
      applySky(arenaKey);
      buildParticles(arenaKey);
    }
    const bossKey = b.assets.boss;
    if (S.bossKey === bossKey) return;
    const g = await load(bossKey);
    if (S.mixer) S.mixer.stopAllAction();
    disposeObj(S.boss);
    S.boss = g.scene; S.bossKey = bossKey; S.actions = {}; S.current = null;
    S.boss.traverse((o) => {
      if (o.isMesh) { o.frustumCulled = false; glowPatch(o.material, b.glow); }
      if (o.isBone && /chest/i.test(o.name)) S.chest = o;
      if (o.isBone && /^head$/i.test(o.name)) S.head = o;
    });
    scene.add(S.boss);
    S.mixer = new t.AnimationMixer(S.boss);
    for (const clip of g.animations) {
      const a = S.mixer.clipAction(clip);
      const once = !['idle', 'enrage', 'stun'].includes(clip.name);
      a.setLoop(once ? t.LoopOnce : t.LoopRepeat, once ? 1 : Infinity);
      a.clampWhenFinished = once;
      S.actions[clip.name] = a;
    }
    S.mixer.addEventListener('finished', (e) => { if (e.action === S.actions.death) return; if (e.action === S.current) settle(); });
    aura.color.set(b.glow || '#ffffff');
    if (!S.auraSprite) {
      S.auraSprite = new t.Sprite(new t.SpriteMaterial({ map: glowTex, color: b.glow || '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, blending: t.AdditiveBlending, fog: false }));
      scene.add(S.auraSprite);
    } else S.auraSprite.material.color.set(b.glow || '#ffffff');
    if (!S.groundRing) {
      S.groundRing = new t.Mesh(new t.PlaneGeometry(1, 1), new t.MeshBasicMaterial({ map: ringTex, color: b.glow || '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: t.AdditiveBlending }));
      S.groundRing.rotation.x = -Math.PI / 2; S.groundRing.position.y = 0.03; S.groundRing.scale.setScalar(6.5);
      scene.add(S.groundRing);
    } else S.groundRing.material.color.set(b.glow || '#ffffff');
    if (!S.shield) {
      S.shield = new t.Mesh(new t.IcosahedronGeometry(1, 2), new t.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.0, wireframe: true, depthWrite: false, blending: t.AdditiveBlending }));
      scene.add(S.shield);
    }
    resize();
    frame();
  }

  function play(name, { fade = 0.25, force = false } = {}) {
    const a = S.actions[name];
    if (!a || (S.current === a && !force)) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(name === 'enrage' ? 1.25 : 1);
    if (S.current && S.current !== a) S.current.crossFadeTo(a, reduced ? 0.05 : fade, false);
    a.play();
    S.current = a;
  }
  /** กลับท่าพื้นฐานตามสถานะ */
  function settle() {
    if (S.defeated) return;
    play(S.stunned ? 'stun' : S.phase >= 3 ? 'enrage' : 'idle', { fade: 0.35 });
  }

  function setState(st) {
    if (!st) return;
    const prevPhase = S.phase;
    S.phase = st.phase || 1;
    const stunned = Boolean(st.stunUntil && new Date(st.stunUntil).getTime() > Date.now());
    const shieldUp = Boolean(st.shield && st.shield.up);
    if (S.shield) S.shield.userData.target = shieldUp ? 0.28 : 0;
    const dead = st.status === 'defeated' || st.status === 'settled';
    if (dead && !S.defeated) { S.defeated = true; play('death', { fade: 0.2 }); victory(st.glow); return; }
    if (!dead && S.defeated) { S.defeated = false; }
    if (st.status === 'preparing') { play('spawn', { force: !S.current }); return; }
    if (stunned !== S.stunned) { S.stunned = stunned; if (stunned) play('stun', { fade: 0.15 }); else settle(); }
    if (S.phase > prevPhase && S.current) { play('phase', { force: true, fade: 0.15 }); bump(0.6); }
    if (!S.current) play(st.status === 'active' ? (S.phase >= 3 ? 'enrage' : 'idle') : 'idle');
  }

  /** ฉากโจมตีของบอส (เป็นจังหวะ · ไม่หักอะไรผู้เล่น) */
  function bossMove(kind) {
    if (S.defeated || S.stunned || !S.actions.prepare) return;
    play('prepare', { force: true, fade: 0.2 });
    setTimeout(() => { if (!S.defeated && !S.stunned) { play(kind, { force: true, fade: 0.1 }); setTimeout(() => bump(kind === 'special' ? 0.55 : 0.3), 280); } }, reduced ? 200 : 800);
  }

  function chestWorld() {
    const v = new t.Vector3();
    if (S.chest) S.chest.getWorldPosition(v); else v.set(0, 1.8, 0);
    return v;
  }

  /** ผู้เล่น (เรา/คนอื่น) โจมตีโดน: ลูกพลังจากกล้อง → แรงกระแทกที่บอส */
  function hit({ amount = 0, kind = 'normal', qtype = 'vocab', mine = false } = {}) {
    if (!S.boss) return;
    const col = kind === 'critical' ? '#FFD54A' : kind === 'shield' || kind === 'break' ? '#9FE6FF' : kind === 'team' ? '#FF8AE2' : (ELEMENT_FX[qtype] || '#FFFFFF');
    const target = chestWorld().add(new t.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.3) * 0.8, 0.6));
    const done = () => {
      burst(target, col, kind === 'critical' ? 2.2 : kind === 'break' ? 2.6 : 1.2);
      if (!S.defeated && !S.stunned && S.current !== S.actions.phase && S.current !== S.actions.attack && S.current !== S.actions.special && (mine || Math.random() < 0.35)) play('hit', { force: true, fade: 0.08 });
      if (mine) bump(kind === 'critical' ? 0.35 : 0.15);
      if (kind === 'break' && S.shield) S.shield.userData.shatter = 1;
    };
    if (mine && !reduced) projectile(col, target, done); else done();
  }

  function projectile(col, target, done) {
    const sp = new t.Sprite(new t.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: t.AdditiveBlending, fog: false }));
    sp.scale.setScalar(0.9);
    const from = camera.position.clone().add(new t.Vector3(0.6, -1.2, -1.2));
    sp.position.copy(from); scene.add(sp);
    S.fx.push({ kind: 'proj', obj: sp, from, to: target, t: 0, dur: 0.32, done });
  }
  function burst(at, col, scale) {
    const sp = new t.Sprite(new t.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: t.AdditiveBlending, fog: false }));
    sp.position.copy(at); sp.scale.setScalar(0.2); scene.add(sp);
    S.fx.push({ kind: 'burst', obj: sp, t: 0, dur: 0.45, max: scale });
    const ring = new t.Sprite(new t.SpriteMaterial({ map: ringTex, color: col, transparent: true, depthWrite: false, blending: t.AdditiveBlending, fog: false }));
    ring.position.copy(at); ring.scale.setScalar(0.3); scene.add(ring);
    S.fx.push({ kind: 'burst', obj: ring, t: 0, dur: 0.5, max: scale * 1.6 });
  }
  function victory(col) {
    if (reduced) return;
    for (let i = 0; i < 26; i += 1) {
      const sp = new t.Sprite(new t.SpriteMaterial({ map: glowTex, color: i % 3 ? (col || '#FFF6C8') : '#FFFFFF', transparent: true, depthWrite: false, blending: t.AdditiveBlending, fog: false }));
      const a = Math.random() * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.4, 1.6, Math.sin(a) * 0.4); sp.scale.setScalar(0.25 + Math.random() * 0.3); scene.add(sp);
      S.fx.push({ kind: 'spark', obj: sp, t: 0, dur: 2.2 + Math.random(), v: new t.Vector3(Math.cos(a) * (1 + Math.random() * 2), 2 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2)) });
    }
  }
  function bump(n) { if (!reduced) S.shake = Math.min(1, S.shake + n); }

  function stepFx(dt) {
    for (let i = S.fx.length - 1; i >= 0; i -= 1) {
      const f = S.fx[i]; f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'proj') { f.obj.position.lerpVectors(f.from, f.to, k * k); if (k >= 1) { f.done(); } }
      else if (f.kind === 'burst') { f.obj.scale.setScalar(0.2 + f.max * Math.sqrt(k)); f.obj.material.opacity = 1 - k; }
      else if (f.kind === 'spark') { f.v.y -= dt * 2.2; f.obj.position.addScaledVector(f.v, dt); f.obj.material.opacity = 1 - k; }
      if (k >= 1) { f.obj.material.dispose(); scene.remove(f.obj); S.fx.splice(i, 1); }
    }
  }
  function stepParticles(dt, time) {
    const p = S.particles; if (!p) return;
    const a = p.geometry.attributes.position; const seed = p.userData.seed; const cfg = S.partCfg;
    const sp = reduced ? 0.25 : 1;
    for (let i = 0; i < seed.length; i += 1) {
      let y = a.array[i * 3 + 1] + cfg.rise * dt * sp;
      if (cfg.kind === 'firefly') { a.array[i * 3] += Math.sin(time * 0.7 + seed[i]) * 0.004 * sp; a.array[i * 3 + 2] += Math.cos(time * 0.5 + seed[i]) * 0.004 * sp; }
      else a.array[i * 3] += Math.sin(time * 0.6 + seed[i]) * cfg.speed * 0.01 * sp;
      if (y > 7.5) y = 0.1; if (y < 0) y = 7.4;
      a.array[i * 3 + 1] = y;
    }
    a.needsUpdate = true;
    if (cfg.kind === 'firefly') p.material.opacity = 0.65 + 0.35 * Math.sin(time * 2.2);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)); const h = Math.max(1, Math.round(r.height));
    if (w === S.size.w && h === S.size.h) return;
    S.size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (S.boss) frame();
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host);
  const io = window.IntersectionObserver ? new IntersectionObserver((es) => { S.visible = es.some((e) => e.isIntersecting); }, { threshold: 0.01 }) : null;
  if (io) io.observe(host);

  const minStep = Q === 'low' ? 1000 / 30 : 0;
  let raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!S.running || document.hidden || !S.visible) { S.clock.getDelta(); return; }
    if (minStep && now - S.lastFrame < minStep - 1) return;
    S.lastFrame = now;
    const dt = Math.min(0.05, S.clock.getDelta());
    const time = now / 1000;
    if (S.mixer) S.mixer.update(dt);
    stepParticles(dt, time);
    stepFx(dt);
    if (S.shield) {
      const tgt = S.shield.userData.target || 0;
      const m = S.shield.material;
      if (S.shield.userData.shatter) { S.shield.userData.shatter = Math.max(0, S.shield.userData.shatter - dt * 1.5); S.shield.scale.multiplyScalar(1 + dt * 0.8); m.opacity = S.shield.userData.shatter * 0.6; if (!S.shield.userData.shatter) frame(); }
      else m.opacity += (tgt + (tgt ? Math.sin(time * 3) * 0.06 : 0) - m.opacity) * Math.min(1, dt * 4);
      S.shield.rotation.y += dt * 0.3; S.shield.visible = m.opacity > 0.01;
    }
    const pulse = S.phase >= 3 ? 1.0 : S.phase === 2 ? 0.6 : 0.35;
    aura.intensity = S.defeated ? 0 : (2 + Math.sin(time * (S.phase >= 3 ? 5 : 2)) * 0.8) * pulse * 3;
    if (S.auraSprite) S.auraSprite.material.opacity = S.defeated ? 0 : 0.12 + 0.1 * pulse + 0.04 * Math.sin(time * 2);
    if (S.groundRing) { S.groundRing.rotation.z += dt * 0.25; S.groundRing.material.opacity = S.defeated ? 0.1 : 0.3 + 0.25 * pulse; }
    // กล้อง: ลอยช้า ๆ + สั่นเบา ๆ ตอนโดน
    const sway = reduced ? 0 : Math.sin(time * 0.25) * 0.35;
    camera.position.set(S.camBase.x + sway, S.camBase.y + (reduced ? 0 : Math.sin(time * 0.33) * 0.08), S.camBase.z);
    if (S.shake > 0) { const k = S.shake * 0.12; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; S.shake = Math.max(0, S.shake - dt * 2.5); }
    camera.lookAt(S.lookAt);
    // จังหวะท่าโจมตีของบอส (ฉาก)
    if (!S.defeated && S.boss && now > S.nextAttackAt && S.current && [S.actions.idle, S.actions.enrage].includes(S.current)) {
      S.nextAttackAt = now + (S.phase >= 3 ? 6500 : S.phase === 2 ? 9000 : 12000) + Math.random() * 4000;
      if (S.nextAttackAt && S.lastFrame > 4000) bossMove(S.phase >= 2 && Math.random() < 0.45 ? 'special' : 'attack');
    }
    renderer.render(scene, camera);
    if (S.onFrame) S.onFrame();
  }
  raf = requestAnimationFrame(loop);
  S.nextAttackAt = performance.now() + 7000;

  /** ตำแหน่งบนจอของอกบอส (ให้ตัวเลขดาเมจลอยตรงตัวบอส) */
  function screenPoint() {
    const v = chestWorld().project(camera);
    return { x: (v.x * 0.5 + 0.5) * S.size.w, y: (-v.y * 0.5 + 0.5) * S.size.h };
  }

  function destroy() {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect(); if (io) io.disconnect();
    if (S.mixer) S.mixer.stopAllAction();
    disposeObj(S.boss); disposeObj(S.arena);
    if (S.particles) { S.particles.geometry.dispose(); S.particles.material.dispose(); }
    for (const f of S.fx) f.obj.material.dispose();
    [S.auraSprite, S.groundRing, S.shield].forEach((o) => { if (o) { if (o.geometry) o.geometry.dispose(); o.material.dispose(); } });
    glowTex.dispose(); ringTex.dispose(); envTex.dispose(); pm.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (_) { /* - */ }
    renderer.domElement.remove();
  }

  return {
    setBoss, setState, hit, bossMove, screenPoint, resize, destroy,
    pause() { S.running = false; }, resume() { S.running = true; S.clock.getDelta(); },
    get quality() { return Q; },
    stats() { return { quality: Q, fx: S.fx.length, particles: S.particles ? S.particles.geometry.attributes.position.count : 0, clip: S.current ? S.current.getClip().name : null, info: renderer.info.render, mem: renderer.info.memory }; },
    set onFrame(fn) { S.onFrame = fn; },
  };
}

function makeGlowTexture(t) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new t.CanvasTexture(c); tex.colorSpace = t.SRGBColorSpace; return tex;
}
function makeRingTexture(t) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.setLineDash([6, 8]); g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new t.CanvasTexture(c); tex.colorSpace = t.SRGBColorSpace; return tex;
}
