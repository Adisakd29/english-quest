/* =====================================================================
   EnglishQuest World — Multiplayer 3D Social Learning Lobby (window.EQWorld)
   - ฉาก: แผนที่ Fantasy Campus (GLB จาก Blender · สี+AO ใน vertex color · ไม่มี texture) โหลดเฉพาะตอนเข้า Lobby
   - ตัวละคร: EQAvatar3D.createCharacter — ระบบเดียวกับ Wardrobe (Base + ชุดที่สวมจริง · Shared Skeleton · ท่าเดียวกัน)
   - เครือข่าย: WebSocket เดิมของแอป (EQApp.rtSend) · ส่งตำแหน่ง ≤ 10 ครั้ง/วินาที เมื่อเปลี่ยน · ผู้เล่นอื่น interpolate ย้อน 120 ms
     เซิร์ฟเวอร์ตรวจความเร็ว/กำแพง (collision ชุดเดียวกัน: world-physics.js) แล้วแก้ตำแหน่งกลับถ้าเพี้ยน
   - ประหยัดเครื่อง: Avatar ไกล > 30 m ไม่วาด · 14–30 m อัปเดตท่าทุก 3 เฟรม · โหลด Avatar เฉพาะคนที่เข้าใกล้ · ลด pixel ratio อัตโนมัติ
   - ความปลอดภัย: อ้างผู้เล่นอื่นด้วย pid เท่านั้น · ทุกเมนูตรวจสิทธิ์ที่เซิร์ฟเวอร์ · แชทเริ่มต้น = ประโยคสำเร็จรูป
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const ST = ['idle', 'walk', 'run', 'sit'];
  const EMOTE_UI = [['wave', 'hand-helping', 'โบกมือ'], ['celebrate', 'sparkles', 'ดีใจ'], ['cheer', 'star', 'เชียร์'], ['shrug', 'smile', 'ยักไหล่']];
  const EMOTE_CLIP = { wave: 'wave', celebrate: 'celebrate', cheer: 'victory', shrug: 'defeat' };
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const RESUME_KEY = 'eq_world_resume';
  const INTERP_MS = 120;
  const FAR = 30; const MID = 14; const LOAD_R = 34;
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const sess = { get() { try { return JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null'); } catch (_) { return null; } },
    set(v) { try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } } };

  let W = null;   // สถานะของเซสชัน Lobby ปัจจุบัน (null = ปิด)

  // ---------------------------------------------------------------------------------------------
  // เปิด / ปิด
  // ---------------------------------------------------------------------------------------------
  function measureNav() {
    const nav = document.getElementById('bottom-nav');
    const r = nav && !nav.classList.contains('hidden') ? nav.getBoundingClientRect() : null;
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    document.documentElement.style.setProperty('--wd-nav-h', `${r && !wide ? Math.round(r.height) : 0}px`);
    document.documentElement.style.setProperty('--wd-side-w', `${r && wide ? Math.round(r.width) : 0}px`);
    document.documentElement.style.setProperty('--wd-safe-b', r && !wide ? '0px' : 'env(safe-area-inset-bottom, 0px)');
  }
  async function open() {
    App().showScreen('screen-world');
    measureNav();
    if (W) { W.root.focus && W.root.focus(); return; }
    const root = document.getElementById('wd-root');
    W = { root, chars: new Map(), others: new Map(), keys: new Set(), joy: { x: 0, z: 0, id: null }, cam: { yaw: Math.PI, pitch: 0.36, dist: 4.4 },
      me: null, sentAt: 0, lastSent: null, ready: false, closed: false, chat: [], mode: 'local', pending: new Map(), seen: new Set(), quality: 'auto', pr: 1, frameMs: [], invites: new Map() };
    root.classList.toggle('wd-touch', isTouch());
    root.innerHTML = statusHtml('loading');
    const tier = window.EQAvatar3D ? window.EQAvatar3D.tier() : 'none';
    if (tier === 'none') { root.innerHTML = statusHtml('no3d'); bindStatus(); return; }
    try {
      const [cfg] = await Promise.all([App().api('/world/config'), window.EQAvatar.loadCatalog()]);
      if (!W) return;
      W.cfg = cfg; W.phys = window.EQWorldPhysics.create(cfg.map);
      W.byId = new Proxy({}, { get: (_t, id) => window.EQAvatar.itemInfo(id) });
      progress(0.2);
      W.T = await window.EQAvatar3D.lib();
      progress(0.35);
      await buildScene();
      if (!W) return;
      progress(0.8);
      buildUI();
      W.ready = true;
      join();
    } catch (err) {
      console.warn('[world]', err);
      if (W) { root.innerHTML = statusHtml('error'); bindStatus(); }
    }
  }
  /** ออกจาก Lobby: แจ้งเซิร์ฟเวอร์ · คืนหน่วยความจำ GPU · หยุด loop */
  function close({ silent = false } = {}) {
    if (!W) return;
    const w = W; W = null;
    w.closed = true;
    if (!silent && App().rtConnected) App().rtSend('world:leave');
    if (w.raf) cancelAnimationFrame(w.raf);
    window.removeEventListener('keydown', w.onKey); window.removeEventListener('keyup', w.onKeyUp);
    if (w.onVV && window.visualViewport) { window.visualViewport.removeEventListener('resize', w.onVV); window.visualViewport.removeEventListener('scroll', w.onVV); }
    window.removeEventListener('resize', w.onResize); window.removeEventListener('eq:rt', w.onRt); window.removeEventListener('blur', w.onBlur);
    document.removeEventListener('visibilitychange', w.onVis);
    clearInterval(w.mmTimer); clearInterval(w.pingTimer);
    for (const c of w.chars.values()) if (c.char) c.char.dispose();
    if (w.renderer) {
      w.scene.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); [].concat(n.material).forEach((x) => x.dispose()); } });
      if (w.scene.environment) w.scene.environment.dispose();
      w.renderer.dispose(); w.renderer.forceContextLoss();
    }
    w.root.innerHTML = '';
  }
  function exit() {
    close();
    App().navigateTo('play');
  }

  // ---------------------------------------------------------------------------------------------
  // ฉาก
  // ---------------------------------------------------------------------------------------------
  async function buildScene() {
    const T = W.T;
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;   // ตัดผมใต้หมวก (เหมือน Wardrobe)
    W.pr = Math.min(window.devicePixelRatio || 1, isTouch() ? 1.5 : 2);
    renderer.setPixelRatio(W.pr);
    const scene = new T.Scene();
    scene.background = new T.Color('#bfe3ff');
    scene.fog = new T.Fog('#cfe9ff', 32, 75);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xf0f8ff, 0x9fd38a, 0.75));
    const sun = new T.DirectionalLight(0xfff3df, 1.25); sun.position.set(-12, 22, 14); scene.add(sun);
    const camera = new T.PerspectiveCamera(50, 1, 0.1, 160);
    Object.assign(W, { renderer, scene, camera });
    // ฟ้า: โดมไล่สี
    const sky = new T.Mesh(new T.SphereGeometry(120, 24, 12), new T.MeshBasicMaterial({ color: '#a9d8ff', side: T.BackSide, fog: false }));
    scene.add(sky);
    // แผนที่ (ไฟล์ชื่อมี hash — cache ถาวร)
    const loader = new T.GLTFLoader(); loader.setMeshoptDecoder(T.MeshoptDecoder);
    const buf = await fetch(W.cfg.map.glbUrl, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error(`map ${r.status}`); return r.arrayBuffer(); });
    progress(0.6);
    const gltf = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
    gltf.scene.traverse((n) => {
      if (!n.isMesh) return;
      [].concat(n.material).forEach((m) => { m.envMapIntensity = 0.6; if (/Water/.test(m.name)) { m.transparent = true; m.opacity = 0.82; W.water = m; } });
      n.matrixAutoUpdate = false; n.updateMatrix();
    });
    scene.add(gltf.scene);
    W.map = gltf.scene;
    // จุดโต้ตอบ: วงแหวนเรืองแสงที่พื้น
    const ringGeo = new T.RingGeometry(0.85, 1.0, 40);
    W.rings = W.cfg.map.interact.map((it) => {
      const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: zoneColor(it), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.set(it.x, 0.06, it.z); m.scale.setScalar(it.r * 0.8);
      scene.add(m); return m;
    });
    W.shadowGeo = new T.CircleGeometry(0.3, 24);
    W.shadowMat = new T.MeshBasicMaterial({ color: 0x1b2340, transparent: true, opacity: 0.2, depthWrite: false });
  }
  const zoneColor = (it) => { const z = W.cfg.map.zones.find((q) => it.id.startsWith(q.id.split('_')[0]) || (it.event && q.event)) || {}; return z.color || '#3d68c4'; };

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  function statusHtml(kind, extra = {}) {
    const box = (title, text, actions = '') => `<div class="wd-status"><div class="wd-status-box">${title}${text}${actions}</div></div>`;
    if (kind === 'loading') return box('<div class="wd-spin" aria-hidden="true"></div><h2>กำลังเข้าสู่ EnglishQuest World…</h2>', '<p>โหลดแผนที่และตัวละคร (ครั้งแรกอาจใช้เวลาสักครู่)</p><div class="wd-progress"><span id="wd-prog"></span></div>');
    if (kind === 'no3d') return box(`<h2>อุปกรณ์นี้แสดงโลก 3D ไม่ได้</h2>`, '<p>ยังเรียน รับรางวัลเทศกาล และแต่งตัวได้ตามปกติ — Lobby เป็นกิจกรรมเสริมเท่านั้น</p>',
      `<div class="wd-status-actions"><button class="wd-act-btn is-primary" data-go="festival">${ICON('gift')} รับรางวัล Halloween</button><button class="wd-act-btn" data-go="learn">${ICON('book-open')} ไปเรียน</button><button class="wd-act-btn" data-go="play">กลับ</button></div>`);
    if (kind === 'error') return box('<h2>เข้า Lobby ไม่สำเร็จ</h2>', '<p>ตรวจอินเทอร์เน็ตแล้วลองใหม่ หรือกลับไปเรียนต่อได้เลย</p>',
      `<div class="wd-status-actions"><button class="wd-act-btn is-primary" data-retry="1">${ICON('refresh-cw')} ลองใหม่</button><button class="wd-act-btn" data-go="play">กลับ</button></div>`);
    if (kind === 'kicked') return box(`<h2>${esc(extra.title || 'ออกจาก Lobby แล้ว')}</h2>`, `<p>${esc(extra.message || '')}</p>`,
      `<div class="wd-status-actions">${extra.noRejoin ? '' : `<button class="wd-act-btn is-primary" data-rejoin="1">${ICON('refresh-cw')} เข้าใหม่</button>`}${extra.appeal ? `<button class="wd-act-btn" data-appeal="${extra.appeal}">${ICON('message-square-text')} อุทธรณ์</button>` : ''}<button class="wd-act-btn" data-go="play">กลับ</button></div>`);
    return '';
  }
  function bindStatus() {
    W && W.root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { const to = b.dataset.go; close({ silent: true }); App().navigateTo(to); }));
    W && W.root.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', () => { close({ silent: true }); open(); }));
  }
  function progress(f) { const el = document.getElementById('wd-prog'); if (el) el.style.width = `${Math.round(f * 100)}%`; }

  function buildUI() {
    const r = W.root;
    r.innerHTML = `
      <div class="wd-overlay">
        <div class="wd-labels" id="wd-labels" aria-hidden="true"></div>
        <div class="wd-top">
          <button class="wd-room" id="wd-room" type="button" aria-label="ห้องและผู้เล่นออนไลน์"><span class="wd-dot" aria-hidden="true"></span><span class="wd-room-text"><b id="wd-room-name">…</b><span class="wd-count" id="wd-count"></span></span></button>
          <div class="wd-actions" role="toolbar" aria-label="เมนู Lobby">
            <button class="wd-btn" type="button" data-ui="chat" aria-label="แชท">${ICON('message-circle')}<span class="wd-btn-label">แชท</span></button>
            <button class="wd-btn" type="button" data-ui="friends" aria-label="เพื่อน">${ICON('users')}<span class="wd-btn-label">เพื่อน</span><span class="wd-badge" id="wd-fbadge" hidden></span></button>
            <button class="wd-btn" type="button" data-ui="map" aria-label="แผนที่">${ICON('map')}<span class="wd-btn-label">แผนที่</span></button>
            <button class="wd-btn" type="button" data-ui="settings" aria-label="ตั้งค่า Lobby">${ICON('settings')}<span class="wd-btn-label">ตั้งค่า</span></button>
            <button class="wd-btn wd-exit" type="button" data-ui="exit" aria-label="ออกจาก Lobby">${ICON('door-open')}<span class="wd-btn-label">ออก</span></button>
          </div>
        </div>
        <div class="wd-chatlog" id="wd-chatlog" aria-live="polite" aria-label="ข้อความในห้อง"></div>
        <form class="wd-compose" id="wd-compose" hidden autocomplete="off" aria-label="พิมพ์ข้อความ"></form>
        <button class="wd-minimap" id="wd-minimap" type="button" aria-label="แผนที่ย่อ — แตะเพื่อขยาย"><canvas width="264" height="264"></canvas></button>
        <div class="wd-joy" id="wd-joy" role="application" aria-label="จอยสติ๊กเดิน (ดันสุดเพื่อวิ่ง)"><div class="wd-joy-knob"></div></div>
        <div class="wd-act">
          <div class="wd-emotes" role="group" aria-label="ท่าทาง">${EMOTE_UI.map(([e, ic, th]) => `<button class="wd-btn" type="button" data-emote="${e}" aria-label="${th}" title="${th}">${ICON(ic)}</button>`).join('')}</div>
          <button class="wd-interact" id="wd-interact" type="button" hidden><span id="wd-interact-text"></span><kbd>E</kbd></button>
        </div>
        <div class="wd-hint" id="wd-hint">WASD / ลูกศร = เดิน · Shift = วิ่ง · ลากเมาส์ = หมุนกล้อง · คลิกผู้เล่น = เมนู · Enter = พิมพ์แชท · Esc = ปิด</div>
      </div>`;
    const c = W.renderer.domElement;
    c.className = 'wd-canvas'; c.tabIndex = 0; c.setAttribute('aria-label', 'โลก 3D EnglishQuest World');
    r.prepend(c);
    W.labels = r.querySelector('#wd-labels');
    W.mm = r.querySelector('#wd-minimap canvas');
    if (isTouch() && window.innerWidth < 600) r.querySelector('#wd-minimap').classList.add('hidden');
    bindInput();
    r.querySelector('.wd-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ui]'); if (!b) return;
      ({ chat: openChat, friends: openFriends, map: toggleMap, settings: openSettings, exit })[b.dataset.ui]();
    });
    r.querySelector('#wd-room').addEventListener('click', openFriends);
    r.querySelector('#wd-minimap').addEventListener('click', () => r.querySelector('#wd-minimap').classList.toggle('is-big'));
    r.querySelector('.wd-emotes').addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if (b) doEmote(b.dataset.emote); });
    r.querySelector('#wd-interact').addEventListener('click', interact);
    bindCompose();
    r.querySelector('#wd-chatlog').addEventListener('click', (e) => { const m = e.target.closest('.wd-msg'); if (m) m.classList.toggle('show-th'); const th = m && m.querySelector('.wd-th'); if (th) th.hidden = !th.hidden; });
    W.onResize = () => { measureNav(); resize(); };
    window.addEventListener('resize', W.onResize);
    W.onRt = (e) => onRt(e.detail);
    window.addEventListener('eq:rt', W.onRt);
    W.onVis = () => { if (document.hidden) { W.keys.clear(); } };
    document.addEventListener('visibilitychange', W.onVis);
    W.onBlur = () => W && W.keys.clear();
    window.addEventListener('blur', W.onBlur);
    W.mmTimer = setInterval(drawMinimap, 250);
    W.pingTimer = setInterval(() => { if (W && W.me && App().rtConnected) App().rtSend('world:ping', { t: performance.now() }); }, 5000);
    resize();
    W.last = performance.now();
    W.raf = requestAnimationFrame(frame);
  }
  function resize() {
    if (!W || !W.renderer) return;
    const w = W.root.clientWidth; const h = W.root.clientHeight;
    W.renderer.setSize(w, h, false);
    W.camera.aspect = w / Math.max(1, h); W.camera.updateProjectionMatrix();
  }
  function toast(text, ms = 2600) {
    if (!W) return;
    const t = document.createElement('div'); t.className = 'wd-toast'; t.setAttribute('role', 'status'); t.textContent = text;
    W.root.querySelectorAll('.wd-toast').forEach((x) => x.remove());
    W.root.appendChild(t); setTimeout(() => t.remove(), ms);
  }

  // ---------------------------------------------------------------------------------------------
  // เครือข่าย
  // ---------------------------------------------------------------------------------------------
  function join(extra = {}) {
    if (!W) return;
    const prev = sess.get();
    const fresh = prev && Date.now() - prev.at < 10 * 60 * 1000;
    const payload = { ...extra };
    if (!extra.roomId && !extra.friend && fresh) { payload.roomId = prev.roomId; payload.resume = { roomId: prev.roomId, x: prev.x, z: prev.z, ry: prev.ry }; }
    if (!App().rtConnected) { veil('กำลังเชื่อมต่อ…'); return; }
    App().rtSend('world:join', payload);
  }
  function onRt(d) {
    if (!W || !W.ready) return;
    if (!d.connected) {
      veil('อินเทอร์เน็ตหลุด — กำลังเชื่อมต่อใหม่…');
      for (const [pid, c] of W.chars) if (!W.me || pid !== W.me.pid) removeChar(pid);   // ไม่ค้างผู้เล่นเก่า (ghost) ระหว่างหลุด
    } else join();
  }
  function veil(text) {
    if (!W) return;
    let v = W.root.querySelector('.wd-status.is-veil');
    if (!v) { v = document.createElement('div'); v.className = 'wd-status is-veil'; W.root.appendChild(v); }
    v.innerHTML = `<div class="wd-status-box"><div class="wd-spin" aria-hidden="true"></div><h2>${esc(text)}</h2><p>ตัวละครของคุณจะกลับไปที่เดิม</p></div>`;
  }
  function unveil() { if (W) W.root.querySelectorAll('.wd-status.is-veil').forEach((v) => v.remove()); }

  function onMessage(msg) {
    if (!W || !W.ready) return;
    switch (msg.type) {
      case 'world:joined': onJoined(msg); break;
      case 'world:add': addChar(msg.player); updateCount(); break;
      case 'world:remove': removeChar(msg.pid); updateCount(); break;
      case 'world:snap': onSnap(msg); break;
      case 'world:correct': if (W.me) { W.me.x = msg.x; W.me.z = msg.z; if (msg.ry !== undefined) W.me.ry = msg.ry; if (msg.st) W.me.st = msg.st; } break;
      case 'world:outfit': { const c = W.chars.get(msg.pid); if (c) { c.data.outfit = msg.outfit; c.data.colors = msg.colors || {}; if (c.char) c.char.setOutfit(msg.outfit, c.data.colors); } break; }
      case 'world:emote': { const c = W.chars.get(msg.pid); if (c && c.char) c.char.emote(EMOTE_CLIP[msg.e] || 'wave'); if (msg.to && W.me && msg.to === W.me.pid && c) bubble(msg.pid, null, 'โบกมือให้คุณ'); break; }
      case 'world:waved': toast(`${msg.name} โบกมือให้คุณ`); break;
      case 'world:chat': onChat(msg); break;
      case 'world:chat_history': (msg.items || []).forEach((m) => onChat(m, { history: true })); break;
      case 'world:chat_ack': if (msg.cid) W.pending.delete(msg.cid); break;
      case 'world:chat_error': if (msg.cid) W.pending.delete(msg.cid); toast(msg.message); if (msg.code === 'CHAT_RESTRICTED' || msg.code === 'CHAT_OFF') { renderChatSheet(); renderCompose(); } break;
      case 'world:invite': onInvite(msg); break;
      case 'world:invite_sent': toast(msg.kind === 'ranked' ? 'ส่งคำชวนตั้งทีม Ranked แล้ว (ดูใน Ranked)' : 'ส่งคำชวนแล้ว รอคำตอบ…'); break;
      case 'world:invite_result': if (!msg.accepted) toast(`${msg.name} ปฏิเสธคำชวน`); else toast(`กำลังไปห้องแข่งกับ ${msg.name}…`); break;
      case 'world:friend': { const c = W.chars.get(msg.pid); if (c) { c.data.friend = msg.friend; if (c.label) c.label.classList.toggle('is-friend', msg.friend); } updateCount(); break; }
      case 'world:settings': W.settings = msg.settings; W.chatAllowed = msg.chatAllowed; if (msg.restrictions) W.restrictions = msg.restrictions; renderChatSheet(); renderCompose(); break;
      case 'world:restricted': W.restrictions = [...(W.restrictions || []), msg.restriction]; if (W.chatAllowed) W.chatAllowed.phrases = false; toast('ถูกปิดแชทชั่วคราว — ดูรายละเอียด/อุทธรณ์ได้ในตั้งค่า', 4000); break;
      case 'world:rejoin': join(); break;
      case 'world:kicked': onKicked(msg); break;
      case 'world:left': break;
      case 'world:pong': W.rtt = Math.round(performance.now() - msg.t); break;
      case 'world:error': onError(msg); break;
      default: break;
    }
  }
  function onError(msg) {
    if (['ROOM_FULL', 'ROOM_UNAVAILABLE', 'BAD_ROOM', 'FRIEND_UNAVAILABLE', 'FRIEND_PRIVATE', 'NOT_FRIEND', 'ALL_FULL'].includes(msg.code) && !W.me) {
      // เข้าห้องที่ขอไม่ได้ → ให้เซิร์ฟเวอร์เลือกห้องที่เหมาะสมแทน (ไม่ค้างหน้าโหลด)
      sess.set(null); toast(msg.message, 3500);
      if (msg.code !== 'ALL_FULL') { App().rtSend('world:join', {}); return; }
    }
    if (msg.code === 'LOBBY_RESTRICTED') { onKicked({ reason: 'restricted', message: `${msg.message} ถึง ${new Date(msg.until).toLocaleString('th-TH')}`, restrictionId: msg.restrictionId, appealState: msg.appeal }); return; }
    if (msg.code === 'NOT_IN_WORLD') { join(); return; }
    toast(msg.message);
  }
  function onKicked(msg) {
    unveil();
    const reasons = { afk: 'ออกจาก Lobby อัตโนมัติ', other_session: 'เปิด Lobby จากอีกหน้าต่าง', restricted: 'เข้า Lobby ไม่ได้ชั่วคราว' };
    for (const pid of [...W.chars.keys()]) removeChar(pid);
    W.me = null;
    const div = document.createElement('div');
    div.innerHTML = statusHtml('kicked', { title: reasons[msg.reason] || 'ออกจาก Lobby แล้ว', message: msg.message || '', noRejoin: msg.reason === 'restricted', appeal: msg.reason === 'restricted' && msg.restrictionId && msg.appealState === 'none' ? msg.restrictionId : null });
    const el = div.firstElementChild; W.root.appendChild(el);
    el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { close({ silent: true }); App().navigateTo(b.dataset.go); }));
    el.querySelectorAll('[data-rejoin]').forEach((b) => b.addEventListener('click', () => { el.remove(); join(); }));
    el.querySelectorAll('[data-appeal]').forEach((b) => b.addEventListener('click', () => appealDialog(Number(b.dataset.appeal))));
  }
  function onJoined(msg) {
    unveil();
    W.root.querySelectorAll('.wd-status').forEach((x) => x.remove());
    W.room = msg.room; W.settings = msg.settings; W.chatAllowed = msg.chatAllowed; W.restrictions = msg.restrictions || [];
    // รีเซ็ตผู้เล่นอื่น (ห้องใหม่/เชื่อมต่อใหม่) — ตัวเราเก็บไว้ถ้าเป็น pid เดิม
    for (const pid of [...W.chars.keys()]) if (pid !== msg.you.pid) removeChar(pid);
    if (W.me && W.me.pid !== msg.you.pid) removeChar(W.me.pid);
    const keep = W.chars.get(msg.you.pid);
    W.me = { pid: msg.you.pid, x: msg.you.x, z: msg.you.z, ry: msg.you.ry, st: 'idle', seat: null, name: msg.you.name };
    if (!keep) addChar({ ...msg.you, st: 'idle', me: true });
    else { keep.data.outfit = msg.you.outfit; keep.data.colors = msg.you.colors || {}; if (keep.char) keep.char.setOutfit(msg.you.outfit, keep.data.colors); }
    W.cam.yaw = W.me.ry + Math.PI;
    msg.players.forEach((p) => addChar(p));
    updateCount();
    sess.set({ roomId: msg.room.id, x: W.me.x, z: W.me.z, ry: W.me.ry, at: Date.now() });
    // ข้อความที่ส่งก่อนหลุดแต่ยังไม่ได้รับการยืนยัน → ส่งซ้ำด้วย cid เดิม (เซิร์ฟเวอร์ไม่กระจายซ้ำถ้าเคยส่งแล้ว)
    for (const [cid, m] of W.pending) { if (Date.now() - m.at < 60000) App().rtSend('world:chat', { ...m.body, cid }); else W.pending.delete(cid); }
    renderCompose();
    sysMsg(msg.room.private ? 'คุณอยู่ในห้องส่วนตัว (ปิด "ให้คนอื่นเห็นฉัน" ไว้) — เปิดได้ในตั้งค่า' : `ยินดีต้อนรับสู่ ${msg.room.name}! ทักทายด้วยประโยคภาษาอังกฤษได้ที่ปุ่มแชท`);
  }
  function updateCount() {
    if (!W || !W.room) return;
    const n = [...W.chars.values()].length;
    const fr = [...W.chars.values()].filter((c) => c.data.friend).length;
    const nameEl = W.root.querySelector('#wd-room-name'); const cEl = W.root.querySelector('#wd-count');
    if (nameEl) nameEl.textContent = W.room.name;
    if (cEl) cEl.innerHTML = `${ICON('users', 'icon icon-sm')} ${n}/${W.room.cap}${fr ? ` <span class="wd-friends-on">· เพื่อน ${fr}</span>` : ''}`;
    const b = W.root.querySelector('#wd-fbadge'); if (b) { b.hidden = !fr; b.textContent = fr; }
  }

  // ---------------------------------------------------------------------------------------------
  // ตัวละคร
  // ---------------------------------------------------------------------------------------------
  function addChar(p) {
    if (!W || W.chars.has(p.pid)) return;
    const c = { pid: p.pid, data: { ...p }, buf: [{ at: performance.now(), x: p.x, z: p.z, ry: p.ry, st: p.st || 'idle' }], x: p.x, z: p.z, ry: p.ry, st: p.st || 'idle', afk: p.afk, me: Boolean(p.me), loading: false, char: null, frame: 0 };
    const label = document.createElement('div');
    label.className = `wd-name${c.me ? ' is-me' : ''}${p.friend ? ' is-friend' : ''}`;
    label.innerHTML = `${p.friend ? ICON('user-check') : ''}${esc(p.name)}${c.me ? ' (คุณ)' : ''}<span class="wd-afk" hidden>· AFK</span>`;
    W.labels.appendChild(label);
    c.label = label;
    W.chars.set(p.pid, c);
  }
  async function loadChar(c) {
    if (c.loading || c.char || !W) return;
    c.loading = true;
    try {
      const ch = await window.EQAvatar3D.createCharacter({ T: W.T, api: App().api, byId: W.byId, outfit: c.data.outfit || {}, colors: c.data.colors || {} });
      if (!W || !W.chars.has(c.pid)) { ch.dispose(); return; }
      c.char = ch;
      const sh = new W.T.Mesh(W.shadowGeo, W.shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; ch.group.add(sh);
      ch.group.position.set(c.x, 0, c.z); ch.group.rotation.y = c.ry;
      W.scene.add(ch.group);
      ch.setState(c.st);
    } catch (e) { console.warn('[world/char]', e); } finally { c.loading = false; }
  }
  function removeChar(pid) {
    const c = W && W.chars.get(pid); if (!c) return;
    if (c.char) c.char.dispose();
    if (c.label) c.label.remove(); if (c.bubble) c.bubble.remove();
    W.chars.delete(pid);
  }
  function onSnap(msg) {
    const t = performance.now();
    for (const [pid, x, z, ry, st, afk] of msg.p) {
      const c = W.chars.get(pid);
      if (!c || c.me) continue;
      c.buf.push({ at: t, x: x / 100, z: z / 100, ry: ry / 100, st: ST[st] || 'idle' });
      if (c.buf.length > 20) c.buf.shift();
      if (Boolean(afk) !== Boolean(c.afk)) { c.afk = Boolean(afk); const s = c.label && c.label.querySelector('.wd-afk'); if (s) s.hidden = !c.afk; }
    }
  }
  const lerpAng = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
  function interp(c, now) {
    const rt = now - INTERP_MS; const b = c.buf;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > rt) i -= 1;
    const p1 = b[i]; const p0 = b[i - 1];
    if (!p0 || p1.at <= rt) { c.x = p1.x; c.z = p1.z; c.ry = lerpAng(c.ry, p1.ry, 0.3); c.st = p1.st; return; }
    const k = Math.max(0, Math.min(1, (rt - p0.at) / Math.max(1, p1.at - p0.at)));
    c.x = p0.x + (p1.x - p0.x) * k; c.z = p0.z + (p1.z - p0.z) * k; c.ry = lerpAng(p0.ry, p1.ry, k); c.st = k < 0.5 ? p0.st : p1.st;
  }

  // ---------------------------------------------------------------------------------------------
  // อินพุต (คีย์บอร์ด · เมาส์ · จอยสติ๊ก · สัมผัส)
  // ---------------------------------------------------------------------------------------------
  function bindInput() {
    const c = W.renderer.domElement;
    const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
    W.onKey = (e) => {
      if (!W || !W.me || typing(e)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { W.keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
      else if (k === 'e') { e.preventDefault(); interact(); } else if (k === 'enter') { e.preventDefault(); openCompose(); } else if (k === 'escape') { closeCompose(); closeSheet(); }
      else if (['1', '2', '3', '4'].includes(k)) doEmote(EMOTE_UI[Number(k) - 1][0]);
    };
    W.onKeyUp = (e) => { if (W) W.keys.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', W.onKey); window.addEventListener('keyup', W.onKeyUp);
    // กล้อง: ลาก (เมาส์/นิ้ว) · pinch/ล้อ = ซูม · แตะไม่ลาก = เลือกผู้เล่น
    const ptrs = new Map(); let pinch0 = 0; let down = null;
    c.addEventListener('pointerdown', (e) => { try { c.setPointerCapture(e.pointerId); } catch (_) { /* pointer จำลอง */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; c.classList.add('is-drag'); c.focus({ preventScroll: true }); });
    c.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x; const dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) W.cam.dist = Math.max(2.4, Math.min(8, W.cam.dist * (pinch0 / d))); pinch0 = d; return;
      }
      W.cam.yaw -= dx * 0.006; W.cam.pitch = Math.max(0.08, Math.min(1.1, W.cam.pitch + dy * 0.004));
    });
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (!ptrs.size) c.classList.remove('is-drag');
      if (down && down.moved < 8 && performance.now() - down.t < 500 && e.type === 'pointerup') pick(e.clientX, e.clientY);
      if (!ptrs.size) down = null;
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); W.cam.dist = Math.max(2.4, Math.min(8, W.cam.dist + Math.sign(e.deltaY) * 0.4)); }, { passive: false });
    // จอยสติ๊ก (มือถือ/แท็บเล็ต) — pointer แยกจากกล้อง จึงเดิน+หมุนกล้องพร้อมกันได้
    const joy = W.root.querySelector('#wd-joy'); const knob = joy.querySelector('.wd-joy-knob');
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect(); const R = r.width / 2;
      let dx = e.clientX - (r.left + R); let dy = e.clientY - (r.top + R);
      const L = Math.hypot(dx, dy); const max = R - 14;
      if (L > max) { dx *= max / L; dy *= max / L; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      W.joy.x = dx / max; W.joy.z = dy / max;
      joy.classList.toggle('is-run', Math.hypot(W.joy.x, W.joy.z) > 0.85);
    };
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); try { joy.setPointerCapture(e.pointerId); } catch (_) { /* pointer จำลอง */ } W.joy.id = e.pointerId; setJoy(e); });
    joy.addEventListener('pointermove', (e) => { if (W.joy.id === e.pointerId) setJoy(e); });
    const joyUp = (e) => { if (W.joy.id !== e.pointerId) return; W.joy = { x: 0, z: 0, id: null }; knob.style.transform = ''; joy.classList.remove('is-run'); };
    joy.addEventListener('pointerup', joyUp); joy.addEventListener('pointercancel', joyUp);
  }
  /** เลือกผู้เล่นจากตำแหน่งที่แตะ (ฉายตำแหน่งตัวละครลงจอ — ไม่ต้องยิง ray ใส่ mesh ที่ skin) */
  function pick(cx, cy) {
    const T = W.T; const rect = W.renderer.domElement.getBoundingClientRect();
    let best = null; let bestD = 1e9;
    const v = new T.Vector3();
    for (const c of W.chars.values()) {
      if (!c.char || !c.char.group.visible) continue;
      for (const h of [0.35, 0.75]) {
        v.set(c.x, h, c.z).project(W.camera);
        if (v.z > 1) continue;
        const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width; const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
        const dist = Math.hypot(sx - cx, sy - cy);
        const camD = Math.hypot(c.x - W.camera.position.x, c.z - W.camera.position.z);
        const tol = Math.max(26, 260 / Math.max(1, camD));
        if (dist < tol && dist < bestD) { bestD = dist; best = c; }
      }
    }
    if (best) { if (best.me) openSelfMenu(); else openPlayerMenu(best.pid); }
  }

  // ---------------------------------------------------------------------------------------------
  // ลูปหลัก
  // ---------------------------------------------------------------------------------------------
  function frame(now) {
    if (!W || W.closed) return;
    W.raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.1, (now - W.last) / 1000);
    const mdt = Math.min(0.5, (now - W.last) / 1000); W.last = now;   // เดินตามเวลาจริงแม้เครื่องช้า (collision ก้าวย่อยในตัว)
    if (W.me) stepMe(mdt, now);
    const T = W.T; const cam = W.camera;
    // ผู้เล่นอื่น: interpolate · โหลดเฉพาะคนที่อยู่ใกล้ · ไกลมากไม่วาด · วาดพร้อมกันไม่เกิน MAX_VIS คนที่ใกล้ที่สุด (มือถือ/โหมดประหยัด 10 · อื่น ๆ 18)
    let vis = 0;
    const maxVis = isTouch() || W.quality !== 'auto' ? 10 : 18;
    if (W.me && (W.visTick = (W.visTick || 0) + 1) % 15 === 1) {
      const order = [...W.chars.values()].filter((c) => !c.me).map((c) => [c, Math.hypot(c.x - W.me.x, c.z - W.me.z)]).sort((a, b) => a[1] - b[1]);
      order.forEach(([c], i) => { c.inBudget = i < maxVis; });
    }
    for (const c of W.chars.values()) {
      if (!c.me) interp(c, now);
      const d = (W.me ? Math.hypot(c.x - W.me.x, c.z - W.me.z) : 0) + (c.me || c.inBudget !== false ? 0 : 1e6);
      if (!c.char) { if (d < LOAD_R || c.me) loadChar(c); }
      if (c.char) {
        const g = c.char.group;
        g.visible = c.me || d < FAR;
        if (g.visible) {
          vis += 1;
          g.position.set(c.x, 0, c.z); g.rotation.y = c.ry;
          const speed = c.st === 'run' ? 1.25 : 1.1;
          c.char.setState(c.st, speed);
          c.frame += 1;
          if (c.me || d < MID || c.frame % 3 === 0) c.char.update(c.me || d < MID ? dt : dt * 3);
        }
      }
    }
    W.visible = vis;
    // กล้องบุคคลที่สาม (ตามตัวเรา) · ไม่ทะลุอาคาร (หดเข้าหาตัวถ้ามี collider ขวาง)
    if (W.me) {
      const tx = W.me.x; const tz = W.me.z; const ty = 0.75;
      let dist = W.cam.dist;
      for (let k = 1; k <= 8; k += 1) {
        const f = (k / 8) * dist;
        const px = tx + Math.sin(W.cam.yaw) * Math.cos(W.cam.pitch) * f; const pz = tz + Math.cos(W.cam.yaw) * Math.cos(W.cam.pitch) * f;
        if (W.phys.blocked(px, pz) && ty + Math.sin(W.cam.pitch) * f < 4) { dist = Math.max(1.6, f - 0.4); break; }
      }
      W.camDist = (W.camDist || dist) + (dist - (W.camDist || dist)) * Math.min(1, dt * 8);
      const D = W.camDist;
      cam.position.set(tx + Math.sin(W.cam.yaw) * Math.cos(W.cam.pitch) * D, ty + Math.sin(W.cam.pitch) * D, tz + Math.cos(W.cam.yaw) * Math.cos(W.cam.pitch) * D);
      cam.lookAt(tx, ty, tz);
      // กล้องไม่ทะลุหัว/เสื้อผ้าของผู้เล่นอื่น: ใครยืนชิดกล้องเกินไป (< 0.6 m) → ซ่อนชั่วคราว (เหมือนเกม 3rd-person ทั่วไป)
      for (const c of W.chars.values()) {
        if (c.me || !c.char || !c.char.group.visible) continue;
        if (Math.hypot(cam.position.x - c.x, cam.position.z - c.z) < 0.6 && cam.position.y < 1.35) c.char.group.visible = false;
      }
    }
    if (W.water) W.water.emissiveIntensity = 0.85 + Math.sin(now / 600) * 0.15;
    if ((W.navCheck = (W.navCheck || 0) + 1) % 45 === 0) {   // เมนูล่างเดิมเปลี่ยนขนาด/แสดงทีหลัง (หมุนจอ · โหลดแอปครั้งแรก) → จัดพื้นที่ใหม่
      const before = document.documentElement.style.getPropertyValue('--wd-nav-h') + document.documentElement.style.getPropertyValue('--wd-side-w');
      measureNav();
      if (before !== document.documentElement.style.getPropertyValue('--wd-nav-h') + document.documentElement.style.getPropertyValue('--wd-side-w')) resize();
    }
    if (W.rings) W.rings.forEach((m, i) => { m.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now / 500 + i)); });
    const t0 = performance.now();
    W.renderer.render(W.scene, cam);
    placeLabels();
    adapt(performance.now() - t0, dt);
  }
  /** ปรับคุณภาพตามเวลาเฟรมจริง: ช้า → ลด pixel ratio (ไม่ต่ำกว่า 1) */
  function adapt(renderMs, dt) {
    W.frameMs.push(dt * 1000); if (W.frameMs.length > 90) W.frameMs.shift();
    if (W.frameMs.length < 90 || W.quality === 'locked') return;
    const avg = W.frameMs.reduce((a, b) => a + b, 0) / W.frameMs.length;
    W.avgFrameMs = avg;
    if (avg > 28 && W.pr > 1) { W.pr = Math.max(1, W.pr - 0.25); W.renderer.setPixelRatio(W.pr); resize(); W.frameMs = []; W.quality = 'reduced'; }
  }
  function stepMe(dt, now) {
    const me = W.me;
    if (me.seat) { syncMeChar(); maybeSend(now); return; }
    let ix = 0; let iz = 0;
    const k = W.keys;
    if (k.has('w') || k.has('arrowup')) iz -= 1; if (k.has('s') || k.has('arrowdown')) iz += 1;
    if (k.has('a') || k.has('arrowleft')) ix -= 1; if (k.has('d') || k.has('arrowright')) ix += 1;
    let mag = Math.hypot(ix, iz); let run = k.has('shift');
    if (W.joy.id !== null) { ix = W.joy.x; iz = W.joy.z; mag = Math.min(1, Math.hypot(ix, iz)); run = mag > 0.85; }
    if (mag > 0.08) {
      const nx = ix / Math.max(1, Math.hypot(ix, iz)); const nz = iz / Math.max(1, Math.hypot(ix, iz));
      // ทิศเทียบกล้อง: หน้า = ทิศที่กล้องมอง
      const fx = -Math.sin(W.cam.yaw); const fz = -Math.cos(W.cam.yaw);
      const rx = Math.cos(W.cam.yaw); const rz = -Math.sin(W.cam.yaw);
      const dx = rx * nx - fx * nz; const dz = rz * nx - fz * nz;
      const sp = run ? W.cfg.runSpeed : W.cfg.walkSpeed * (W.joy.id !== null ? Math.max(0.45, Math.min(1, mag / 0.85)) : 1);
      const [x, z] = W.phys.step(me.x, me.z, dx * sp * dt, dz * sp * dt);
      me.x = x; me.z = z;
      me.ry = lerpAng(me.ry, Math.atan2(dx, dz), Math.min(1, dt * 12));
      me.st = run ? 'run' : 'walk';
    } else if (!W.autoWalk) me.st = 'idle';
    syncMeChar();
    maybeSend(now);
    nearby();
  }
  function syncMeChar() { const c = W.chars.get(W.me.pid); if (c) { c.x = W.me.x; c.z = W.me.z; c.ry = W.me.ry; c.st = W.me.st; } }
  function maybeSend(now) {
    const me = W.me; const L = W.lastSent;
    const changed = !L || Math.abs(L.x - me.x) > 0.01 || Math.abs(L.z - me.z) > 0.01 || Math.abs(L.ry - me.ry) > 0.03 || L.st !== me.st;
    const minGap = 1000 / (W.cfg.sendHz || 10);
    if ((changed && now - W.sentAt >= minGap) || now - W.sentAt > 4000) {
      if (!App().rtConnected) return;
      App().rtSend('world:move', { x: +me.x.toFixed(3), z: +me.z.toFixed(3), ry: +me.ry.toFixed(3), st: me.st });
      W.sentAt = now; W.lastSent = { x: me.x, z: me.z, ry: me.ry, st: me.st };
      sess.set({ roomId: W.room && W.room.id, x: me.x, z: me.z, ry: me.ry, at: Date.now() });
    }
  }
  /** สิ่งที่อยู่ใกล้ตัว: จุดโต้ตอบของอาคาร · ม้านั่ง → ปุ่มโต้ตอบ */
  function nearby() {
    const me = W.me;
    let target = null;
    for (const it of W.cfg.map.interact) { const d = Math.hypot(it.x - me.x, it.z - me.z); if (d <= it.r && (!target || d < target.d)) target = { kind: 'zone', it, d }; }
    if (!target) for (const s of W.cfg.map.seats) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d <= W.cfg.seatRange && (!target || d < target.d)) target = { kind: 'seat', it: s, d }; }
    W.target = target;
    const btn = W.root.querySelector('#wd-interact');
    const txt = target ? (target.kind === 'seat' ? 'นั่ง' : target.it.label) : (me.seat ? 'ลุกขึ้น' : null);
    btn.hidden = !txt;
    if (txt) W.root.querySelector('#wd-interact-text').textContent = txt;
  }
  function interact() {
    if (!W || !W.me) return;
    if (W.me.seat) { App().rtSend('world:stand'); W.me.seat = null; W.me.st = 'idle'; nearby(); return; }
    const t = W.target; if (!t) return;
    if (t.kind === 'seat') { App().rtSend('world:sit', { seat: t.it.id }); W.me.seat = t.it.id; W.me.x = t.it.x; W.me.z = t.it.z; W.me.ry = t.it.ry; W.me.st = 'sit'; nearby(); return; }
    openZone(t.it);
  }
  function doEmote(e) {
    if (!W || !W.me) return;
    App().rtSend('world:emote', { e });
  }

  // ---------------------------------------------------------------------------------------------
  // ป้ายชื่อ / ฟองแชท / แผนที่ย่อ
  // ---------------------------------------------------------------------------------------------
  function placeLabels() {
    const T = W.T; const v = new T.Vector3(); const w = W.root.clientWidth; const h = W.root.clientHeight;
    const bubbles = [];
    for (const c of W.chars.values()) {
      const d = W.me ? Math.hypot(c.x - W.me.x, c.z - W.me.z) : 0;
      const show = c.char && c.char.group.visible && d < 22;
      v.set(c.x, c.st === 'sit' ? 1.0 : 1.12, c.z).project(W.camera);
      const on = show && v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      const sx = (v.x * 0.5 + 0.5) * w; const sy = (-v.y * 0.5 + 0.5) * h;
      if (c.label) { c.label.style.display = on ? '' : 'none'; if (on) c.label.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`; }
      if (c.bubble) {
        if (performance.now() > c.bubbleUntil) { c.bubble.remove(); c.bubble = null; } else {
          const bon = on && d <= BUBBLE_RANGE();   // ไกลเกิน = ซ่อนฟอง (ยังอ่านได้ในกล่องแชท)
          c.bubble.style.display = bon ? '' : 'none';
          if (bon) { if (!c.bubbleH) { c.bubbleH = c.bubble.offsetHeight || 40; c.bubbleW = c.bubble.offsetWidth || 120; } bubbles.push({ c, x: sx, y: sy - 24, d }); }
        }
      }
    }
    // กันฟองทับกัน: เรียงจากใกล้กล้อง → ฟองที่ซ้อนกับฟองที่วางแล้วถูกยกขึ้นจนพ้น
    bubbles.sort((a, b) => a.d - b.d);
    const placed = [];
    for (const b of bubbles) {
      let y = b.y;
      for (let k = 0; k < 6; k += 1) {
        const hit = placed.find((q) => Math.abs(q.x - b.x) < (q.w + b.c.bubbleW) / 2 && Math.abs(q.y - y) < (q.h + b.c.bubbleH) / 2 + 2);
        if (!hit) break;
        y = hit.y - (hit.h + b.c.bubbleH) / 2 - 4;
      }
      placed.push({ x: b.x, y, w: b.c.bubbleW, h: b.c.bubbleH });
      b.c.bubble.style.transform = `translate(-50%, -100%) translate(${b.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    if (!W.zoneLabels) {
      W.zoneLabels = W.cfg.map.zones.filter((z) => z.id !== 'central_plaza').map((z) => {
        const el = document.createElement('div'); el.className = 'wd-zone-label'; el.style.setProperty('--zc', z.color); el.textContent = z.name; W.labels.appendChild(el);
        return { z, el };
      });
    }
    for (const { z, el } of W.zoneLabels) {
      v.set(z.x, 3.4, z.z).project(W.camera);
      const d = W.me ? Math.hypot(z.x - W.me.x, z.z - W.me.z) : 0;
      const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && d < 26 && d > 3;
      el.style.display = on ? '' : 'none';
      if (on) el.style.transform = `translate(-50%, -100%) translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
  }
  function bubble(pid, text, th) {
    const c = W.chars.get(pid); if (!c) return;
    if (!c.bubble) { c.bubble = document.createElement('div'); c.bubble.className = 'wd-bubble'; W.labels.appendChild(c.bubble); }
    c.bubble.innerHTML = `${esc(text || '')}${th ? `<small>${esc(th)}</small>` : ''}`;
    c.bubbleUntil = performance.now() + 6000;
  }
  function drawMinimap() {
    if (!W || !W.mm || !W.cfg) return;
    const cv = W.mm; const g = cv.getContext('2d'); const S = cv.width; const [x0, z0, x1, z1] = W.cfg.map.bounds;
    const sc = S / (x1 - x0 + 2); const X = (x) => (x - x0 + 1) * sc; const Z = (z) => (z - z0 + 1) * sc;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#9fdb7a'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, S, S, 24) : g.rect(0, 0, S, S); g.fill();
    g.fillStyle = '#f2e6cf'; g.beginPath(); g.arc(X(0), Z(0), 9.4 * sc, 0, Math.PI * 2); g.fill();
    g.fillRect(X(-1.5), Z(-16.4), 3 * sc, 7 * sc); g.fillRect(X(-1.5), Z(9.4), 3 * sc, 5 * sc); g.fillRect(X(-14.4), Z(-1.5), 5 * sc, 3 * sc); g.fillRect(X(9.4), Z(-1.5), 7 * sc, 3 * sc);
    for (const c of W.cfg.map.colliders) {
      if (c.t === 'b' && c.hw > 1.5) { g.fillStyle = '#6f7aa8'; g.save(); g.translate(X(c.x), Z(c.z)); g.rotate(-(c.ry || 0)); g.fillRect(-c.hw * sc, -c.hd * sc, c.hw * 2 * sc, c.hd * 2 * sc); g.restore(); }
      if (c.t === 'c' && c.r > 2) { g.fillStyle = c.tag === 'fountain' ? '#6fcfff' : '#6f7aa8'; g.beginPath(); g.arc(X(c.x), Z(c.z), c.r * sc, 0, Math.PI * 2); g.fill(); }
    }
    for (const z of W.cfg.map.zones) { g.fillStyle = z.color; g.globalAlpha = 0.85; g.beginPath(); g.arc(X(z.x), Z(z.z), 3.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    for (const c of W.chars.values()) {
      if (c.me) continue;
      g.fillStyle = c.data.friend ? '#2fbf71' : '#ffffff'; g.strokeStyle = '#1f2340'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(c.x), Z(c.z), 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (W.me) {
      g.save(); g.translate(X(W.me.x), Z(W.me.z)); g.rotate(-W.me.ry + Math.PI);
      g.fillStyle = '#ffd84d'; g.strokeStyle = '#1f2340'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 6); g.lineTo(0, 2.5); g.lineTo(-6.5, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  function toggleMap() { const m = W.root.querySelector('#wd-minimap'); if (m.classList.contains('hidden')) { m.classList.remove('hidden'); m.classList.add('is-big'); } else m.classList.toggle('is-big'); }

  // ---------------------------------------------------------------------------------------------
  // แชท
  // ---------------------------------------------------------------------------------------------
  function phraseOf(id) { return (W.cfg.phrases || []).find((p) => p.id === id); }
  const BUBBLE_MAX = () => (W.cfg && W.cfg.bubbleMaxChars) || 90;
  const BUBBLE_RANGE = () => (W.cfg && W.cfg.bubbleRange) || 14;
  /** ข้อความเข้า: กันซ้ำด้วย id (ส่งซ้ำหลังเชื่อมต่อใหม่/ประวัติ) · เรียงตาม seq ของห้อง · ข้อความถูกกรอง/คนที่บล็อก ไม่ถูกส่งมาจากเซิร์ฟเวอร์เลย */
  function onChat(m, o = {}) {
    if (m.id && W.seen.has(m.id)) return;
    if (m.id) { W.seen.add(m.id); if (W.seen.size > 400) W.seen.delete(W.seen.values().next().value); }
    const ph = m.phrase ? phraseOf(m.phrase) : null;
    const text = ph ? ph.en : String(m.text || '');
    pushLog({ name: m.name, text, th: ph ? ph.th : null, room: m.mode === 'room', seq: m.seq, mine: W.me && m.from === W.me.pid });
    if (!o.history) bubble(m.from, text, ph ? ph.th : null);
  }
  function pushLog({ name, text, th, room, sys, seq, mine }) {
    const log = W.root.querySelector('#wd-chatlog'); if (!log) return;
    const el = document.createElement('button'); el.type = 'button';
    el.className = `wd-msg${room ? ' is-room' : ''}${sys ? ' is-sys' : ''}${mine ? ' is-mine' : ''}`;
    // ทุกค่าที่มาจากผู้ใช้ผ่าน esc() (กัน XSS) — ไม่ใช้ innerHTML กับข้อความดิบ
    el.innerHTML = `${name ? `<b>${esc(name)}</b>` : ''}${esc(text)}${th ? `<span class="wd-th" hidden>${esc(th)}</span>` : ''}`;
    if (th) el.setAttribute('aria-label', `${name || ''} ${text} — แตะเพื่อดูคำแปล`);
    if (seq) {
      el.dataset.seq = seq;
      const after = [...log.children].find((x) => x.dataset.seq && Number(x.dataset.seq) > seq);
      if (after) log.insertBefore(el, after); else log.appendChild(el);
    } else log.appendChild(el);
    while (log.children.length > 6) log.firstElementChild.remove();
    setTimeout(() => el.classList.add('is-old'), 20000);
  }
  function sysMsg(text) { pushLog({ text, sys: true }); }
  /** ฟองแชทเหนือหัว: ตัดยาวเกิน (…) · 2 บรรทัด (CSS) · เวลาแสดงตามความยาว · ซ่อนเมื่อไกล · หลายฟองไม่ทับกัน (placeLabels) */
  function bubble(pid, text, th) {
    const c = W.chars.get(pid); if (!c) return;
    if (!c.bubble) { c.bubble = document.createElement('div'); c.bubble.className = 'wd-bubble'; W.labels.appendChild(c.bubble); }
    let t = String(text || '');
    if (t.length > BUBBLE_MAX()) t = `${t.slice(0, BUBBLE_MAX() - 1).trimEnd()}…`;
    c.bubble.innerHTML = `<span class="wd-bubble-text">${esc(t)}</span>${th ? `<small>${esc(th)}</small>` : ''}`;
    c.bubbleUntil = performance.now() + Math.min(9000, 4000 + t.length * 60);
    c.bubbleH = 0;
  }

  // ---------- ช่องพิมพ์แชท (Desktop: Enter เปิด/ส่ง · Esc ปิด · Mobile: ปุ่มแชท + คีย์บอร์ดเสมือน) ----------
  const newCid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  function sendChat(body) {
    const cid = newCid();
    W.pending.set(cid, { body, at: Date.now() });   // รอ ack — หลุดก่อน ack → ส่งซ้ำด้วย cid เดิมตอนเชื่อมต่อใหม่ (ไม่ซ้ำ)
    if (App().rtConnected) App().rtSend('world:chat', { ...body, cid });
    else toast('ยังไม่ได้เชื่อมต่อ — จะส่งให้เมื่อกลับมาออนไลน์');
  }
  function renderCompose() {
    const f = W && W.root && W.root.querySelector('#wd-compose'); if (!f || f.hidden) return;
    const ca = W.chatAllowed || { phrases: false, text: false };
    const keep = f.querySelector('input'); const val = keep ? keep.value : '';
    const hadFocus = keep && document.activeElement === keep;
    const quick = (W.cfg.phrases || []).filter((p) => ['greet', 'learn', 'polite'].includes(p.cat)).slice(0, 8);
    const modeBtn = `<button type="button" class="wd-cmp-mode" data-cmode aria-label="ส่งถึง: ${W.mode === 'room' ? 'ทั้งห้อง' : 'คนใกล้ตัว'} (แตะเพื่อสลับ)">${ICON(W.mode === 'room' ? 'users' : 'map-pin', 'icon icon-xs')}<span>${W.mode === 'room' ? 'ทั้งห้อง' : 'ใกล้ตัว'}</span></button>`;
    if (!ca.phrases) {
      f.innerHTML = `<div class="wd-cmp-row"><span class="wd-cmp-note">${ca.restrictedUntil ? `ถูกปิดแชทชั่วคราวถึง ${esc(new Date(ca.restrictedUntil).toLocaleString('th-TH'))}` : 'แชทปิดอยู่ — เปิดได้ในตั้งค่า Lobby'}</span>
        <button type="button" class="wd-cmp-x" data-cclose aria-label="ปิดช่องแชท">${ICON('x', 'icon icon-sm')}</button></div>`;
      return;
    }
    const why = ca.textBlockedReason === 'account_age' ? 'พิมพ์เองได้เมื่อบัญชีอายุครบ 3 วัน' : ca.textBlockedReason === 'restricted' ? 'ผู้ดูแลปิดการพิมพ์เองชั่วคราว' : 'โหมดปลอดภัย: เลือกประโยคด้านบน (เปิด "พิมพ์เอง" ได้ในตั้งค่า)';
    f.innerHTML = `<div class="wd-cmp-phr" role="group" aria-label="ประโยคสำเร็จรูป">${quick.map((p) => `<button type="button" class="wd-chip is-sm" data-qphrase="${p.id}" title="${esc(p.th)}">${esc(p.en)}</button>`).join('')}
        <button type="button" class="wd-chip is-sm is-more" data-allphr>${ICON('list-checks', 'icon icon-xs')} ทั้งหมด</button></div>
      <div class="wd-cmp-row">${modeBtn}
        ${ca.text ? `<input id="wd-cmp-input" type="text" enterkeyhint="send" maxlength="${W.cfg.chatMaxLen}" placeholder="${isTouch() ? 'พิมพ์ภาษาอังกฤษ…' : 'พิมพ์ภาษาอังกฤษ… (Enter ส่ง · Esc ปิด)'}" aria-label="พิมพ์ข้อความ" autocomplete="off" autocapitalize="sentences" spellcheck="true" value="${esc(val)}">
          <button type="submit" class="wd-act-btn is-primary wd-cmp-send" aria-label="ส่งข้อความ">${ICON('send', 'icon icon-sm')}</button>` : `<span class="wd-cmp-note">${why}</span>`}
        <button type="button" class="wd-cmp-x" data-cclose aria-label="ปิดช่องแชท">${ICON('x', 'icon icon-sm')}</button></div>`;
    if (hadFocus) { const i = f.querySelector('input'); if (i) i.focus({ preventScroll: true }); }
  }
  function openCompose() {
    if (!W || !W.me) return;
    closeSheet(false);
    const f = W.root.querySelector('#wd-compose');
    f.hidden = false; W.root.classList.add('is-composing'); W.keys.clear();
    renderCompose();
    const i = f.querySelector('input');
    (i || f.querySelector('[data-qphrase]') || f.querySelector('[data-cclose]')).focus({ preventScroll: true });
    fitKeyboard();
  }
  function closeCompose(refocus = true) {
    if (!W || !W.root) return;
    const f = W.root.querySelector('#wd-compose'); if (!f || f.hidden) return;
    f.hidden = true; W.root.classList.remove('is-composing'); W.root.style.removeProperty('--wd-kb');
    if (refocus && W.renderer) W.renderer.domElement.focus({ preventScroll: true });
  }
  /** คีย์บอร์ดเสมือนบนมือถือ: วางช่องพิมพ์เหนือคีย์บอร์ดพอดี (visualViewport) · ซ่อนจอยสติ๊ก/ปุ่มท่าทางระหว่างพิมพ์ (CSS .is-composing) */
  function fitKeyboard() {
    if (!W || !W.root) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const r = W.root.getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    W.root.style.setProperty('--wd-kb', `${Math.max(0, Math.round(r.bottom - visibleBottom))}px`);
  }
  function bindCompose() {
    const f = W.root.querySelector('#wd-compose');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const i = f.querySelector('input'); if (!i) return;
      const t = i.value.replace(/\s+/g, ' ').trim();
      if (!t) { closeCompose(); return; }
      sendChat({ mode: W.mode, text: t.slice(0, W.cfg.chatMaxLen) });
      i.value = '';
      closeCompose();
    });
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCompose(); }
      e.stopPropagation();   // พิมพ์ตัว w/a/s/d ในช่องแชท ไม่ทำให้ตัวละครเดิน
    });
    f.addEventListener('click', (e) => {
      const q = e.target.closest('[data-qphrase]'); const all = e.target.closest('[data-allphr]');
      const md = e.target.closest('[data-cmode]'); const x = e.target.closest('[data-cclose]');
      if (q) { sendChat({ mode: W.mode, phrase: q.dataset.qphrase }); closeCompose(); }
      else if (all) { closeCompose(false); openPhraseSheet(); }
      else if (md) { W.mode = W.mode === 'room' ? 'local' : 'room'; renderCompose(); const b = f.querySelector('[data-cmode]'); if (b) b.focus(); }
      else if (x) closeCompose();
    });
    W.onVV = () => { if (W && W.root && W.root.classList.contains('is-composing')) fitKeyboard(); };
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', W.onVV); window.visualViewport.addEventListener('scroll', W.onVV); }
  }

  // ---------------------------------------------------------------------------------------------
  // ชีต
  // ---------------------------------------------------------------------------------------------
  function sheet(html, { label, onMount, key } = {}) {
    closeSheet();
    const el = document.createElement('section');
    el.className = 'wd-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', label || 'เมนู'); el.dataset.key = key || '';
    el.innerHTML = `<div class="wd-sheet-head"><h2>${esc(label || '')}</h2><button class="wd-close" type="button" aria-label="ปิด">${ICON('x')}</button></div>${html}`;
    el.querySelector('.wd-close').addEventListener('click', closeSheet);
    W.root.querySelector('.wd-overlay').appendChild(el);
    if (onMount) onMount(el);
    const f = el.querySelector('button:not(.wd-close), input, select'); (f || el.querySelector('.wd-close')).focus({ preventScroll: true });
    W.sheet = el;
    return el;
  }
  function closeSheet() { if (W && W.sheet) { W.sheet.remove(); W.sheet = null; W.renderer.domElement.focus({ preventScroll: true }); } }

  function openChat() { openCompose(); }
  function openPhraseSheet() {
    if (!W || !W.me) return;
    const el = sheet('<div id="wd-chat-body"></div>', { label: 'แชท · ประโยคภาษาอังกฤษ', key: 'chat' });
    renderChatSheet(el);
  }
  function renderChatSheet(el) {
    el = el || (W && W.sheet && W.sheet.dataset.key === 'chat' ? W.sheet : null);
    if (!el) return;
    const body = el.querySelector('#wd-chat-body');
    const ca = W.chatAllowed || { phrases: false, text: false, mode: 'off' };
    const cats = { greet: 'ทักทาย', learn: 'ชวนเรียน', play: 'เล่นด้วยกัน', polite: 'มารยาท', event: 'เทศกาล' };
    const groups = {};
    (W.cfg.phrases || []).forEach((p) => { (groups[p.cat] = groups[p.cat] || []).push(p); });
    if (!ca.phrases) {
      body.innerHTML = `<div class="wd-note">${ca.restrictedUntil ? `ถูกปิดแชทชั่วคราวถึง ${esc(new Date(ca.restrictedUntil).toLocaleString('th-TH'))} — ดูรายละเอียด/อุทธรณ์ได้ใน "ตั้งค่า"` : 'แชทปิดอยู่ — เปิด "ประโยคสำเร็จรูป" ได้ในตั้งค่า Lobby'}</div>`;
      return;
    }
    body.innerHTML = `<div class="wd-tabs" role="tablist"><button class="wd-tab" role="tab" type="button" data-mode="local" aria-selected="${W.mode === 'local'}">ใกล้ตัว (${W.cfg.localChatRange} m)</button><button class="wd-tab" role="tab" type="button" data-mode="room" aria-selected="${W.mode === 'room'}">ทั้งห้อง</button></div>
      <div class="wd-phrases">${Object.entries(groups).map(([c, ps]) => `<div class="wd-cat">${esc(cats[c] || c)}</div>${ps.map((p) => `<button class="wd-chip" type="button" data-phrase="${p.id}"><span>${esc(p.en)}</span><small>${esc(p.th)}</small></button>`).join('')}`).join('')}</div>
      ${(ca.text ? `<form class="wd-text-row" id="wd-text"><input type="text" maxlength="${W.cfg.chatMaxLen}" placeholder="พิมพ์ภาษาอังกฤษ (ห้ามข้อมูลติดต่อ)" aria-label="ข้อความ" autocomplete="off" /><button class="wd-act-btn is-primary" type="submit" aria-label="ส่ง">${ICON('send')}</button></form>`
    : `<div class="wd-note">${ca.textBlockedReason === 'account_age' ? 'พิมพ์ข้อความเองได้เมื่อบัญชีอายุครบ 3 วัน' : 'โหมดปลอดภัย: ใช้ประโยคสำเร็จรูป (เปิด "พิมพ์เอง" ได้ในตั้งค่า — อีกฝ่ายต้องเปิดด้วยจึงจะเห็น)'}</div>`)}`;
    body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { W.mode = b.dataset.mode; renderChatSheet(el); }));
    body.querySelector('.wd-phrases').addEventListener('click', (e) => {
      const b = e.target.closest('[data-phrase]'); if (!b) return;
      sendChat({ mode: W.mode, phrase: b.dataset.phrase });
      if (isTouch()) closeSheet();
    });
    const f = body.querySelector('#wd-text');
    if (f) f.addEventListener('submit', (e) => { e.preventDefault(); const i = f.querySelector('input'); const t = i.value.trim(); if (!t) return; sendChat({ mode: W.mode, text: t }); i.value = ''; });
  }

  function openSelfMenu() {
    sheet(`<div class="wd-grid">${EMOTE_UI.map(([e, ic, th]) => `<button class="wd-act-btn" type="button" data-emote="${e}">${ICON(ic)} ${th}</button>`).join('')}
      <button class="wd-act-btn" type="button" data-go="wardrobe">${ICON('shirt')} แต่งตัว</button><button class="wd-act-btn" type="button" data-ui="settings">${ICON('settings')} ตั้งค่า</button></div>`,
    { label: 'ตัวฉัน', onMount: (el) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.emote) { doEmote(b.dataset.emote); closeSheet(); } else if (b.dataset.go) leaveTo(b.dataset.go); else if (b.dataset.ui) openSettings();
      });
    } });
  }
  function leaveTo(path) { close(); App().navigateTo(path); }

  async function openPlayerMenu(pid) {
    const c = W.chars.get(pid); if (!c) return;
    const muted = c.data.muted;
    const el = sheet(`<div class="wd-prof"><div class="wd-prof-pic" id="wd-pp"></div><div><b>${esc(c.data.name)}</b><div>${c.data.friend ? `<span class="wd-tag">${ICON('user-check', 'icon icon-sm')} เพื่อน</span>` : ''} ${muted ? '<span class="wd-tag is-muted">ปิดเสียงอยู่</span>' : ''}</div></div></div>
      <div class="wd-grid">
        <button class="wd-act-btn" type="button" data-a="profile">${ICON('user-round')} ดูโปรไฟล์</button>
        ${c.data.friend ? '' : `<button class="wd-act-btn" type="button" data-a="friend">${ICON('user-plus')} เพิ่มเพื่อน</button>`}
        <button class="wd-act-btn" type="button" data-a="wave">${ICON('hand-helping')} โบกมือ</button>
        <button class="wd-act-btn" type="button" data-a="practice">${ICON('book-open')} <span>ชวนฝึกคำศัพท์<small>Friendly · ไม่กระทบอันดับ</small></span></button>
        <button class="wd-act-btn" type="button" data-a="battle">${ICON('swords')} <span>ชวนแข่ง<small>Friendly Match${c.data.friend ? ' / Ranked ทีม' : ''}</small></span></button>
        <button class="wd-act-btn" type="button" data-a="mute">${ICON(muted ? 'volume-2' : 'volume-x')} ${muted ? 'เลิกปิดเสียง' : 'ปิดเสียง'}</button>
        <button class="wd-act-btn is-danger" type="button" data-a="block">${ICON('ban')} บล็อก</button>
        <button class="wd-act-btn is-danger" type="button" data-a="report">${ICON('flag')} รายงาน</button>
      </div><div id="wd-pm-extra"></div>`, { label: 'ผู้เล่น', key: 'player' });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) playerAction(pid, b.dataset.a, el); });
  }
  async function playerAction(pid, a, el) {
    const c = W.chars.get(pid); if (!c) { closeSheet(); return; }
    const extra = el.querySelector('#wd-pm-extra');
    const call = async (path, body) => App().api(`/world/players/${encodeURIComponent(pid)}/${path}`, body ? { method: 'POST', body } : {});
    try {
      if (a === 'profile') {
        const { profile: p } = await call('profile');
        const f = p.fields || {};
        extra.innerHTML = `<div class="wd-note">${p.private ? 'ผู้เล่นนี้ตั้งโปรไฟล์เป็นส่วนตัว — เห็นเฉพาะชื่อ' : [f.level ? `Level ${f.level.level}` : '', f.rank && f.rank.length ? `Rank: ${esc(f.rank.map((r) => r.label).join(' · '))}` : '', f.achievements ? `Achievements ${f.achievements.unlocked.length}/${f.achievements.total}` : '', f.vocab ? `รู้คำศัพท์ ${f.vocab.knownWords} คำ` : ''].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลที่เปิดเผย'}</div>`;
        const pic = el.querySelector('#wd-pp'); if (pic && p.picture && p.picture.useAvatar && p.picture.look && window.EQAvatar) pic.innerHTML = window.EQAvatar.render(p.picture.look.outfit || {}, 'head');
      } else if (a === 'friend') {
        const r = await call('friend', {});
        toast(r.message || 'ส่งคำขอเป็นเพื่อนแล้ว');
      } else if (a === 'wave') { App().rtSend('world:wave', { pid }); closeSheet(); }
      else if (a === 'practice' || a === 'battle') {
        extra.innerHTML = `<div class="wd-note"><b>เลือกระดับ</b> (ห้องแข่งคำศัพท์เดิม · คะแนน/EXP ตามกติกาเดิม)</div><div class="wd-grid" style="margin-top:8px">${LEVELS.map((l) => `<button class="wd-act-btn" type="button" data-level="${l}">${l}</button>`).join('')}${a === 'battle' && c.data.friend ? `<button class="wd-act-btn is-primary" type="button" data-ranked="1">${ICON('swords')} ตั้งทีม Ranked</button>` : ''}</div>`;
        extra.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { App().rtSend('world:invite', { pid, kind: a, level: b.dataset.level }); closeSheet(); }));
        const rk = extra.querySelector('[data-ranked]'); if (rk) rk.addEventListener('click', () => { App().rtSend('world:invite', { pid, kind: 'ranked' }); closeSheet(); });
      } else if (a === 'mute') {
        const on = !c.data.muted;
        await call('mute', { on }); c.data.muted = on; toast(on ? `ปิดเสียง ${c.data.name} แล้ว (อีกฝ่ายไม่รู้)` : 'เลิกปิดเสียงแล้ว'); closeSheet();
      } else if (a === 'block') {
        extra.innerHTML = `<div class="wd-note">บล็อกแล้วจะมองไม่เห็นกันใน Lobby ส่งข้อความ/คำชวนหากันไม่ได้ และเลิกเป็นเพื่อน (ปลดบล็อกได้ที่หน้าเพื่อน)</div><div class="wd-grid" style="margin-top:8px"><button class="wd-act-btn is-danger" type="button" data-ok="1">${ICON('ban')} ยืนยันบล็อก</button><button class="wd-act-btn" type="button" data-no="1">ยกเลิก</button></div>`;
        extra.querySelector('[data-ok]').addEventListener('click', async () => { await call('block', {}); toast(`บล็อก ${c.data.name} แล้ว`); removeChar(pid); updateCount(); closeSheet(); });
        extra.querySelector('[data-no]').addEventListener('click', () => { extra.innerHTML = ''; });
      } else if (a === 'report') {
        extra.innerHTML = `<form id="wd-rep"><div class="wd-row"><label for="wd-rr">เหตุผล</label><select id="wd-rr"><option value="harassment">ก่อกวน/พูดไม่ดี</option><option value="spam">สแปม</option><option value="inappropriate_name">ชื่อไม่เหมาะสม</option><option value="other">อื่น ๆ</option></select></div>
          <div class="wd-text-row"><input id="wd-rd" maxlength="300" placeholder="รายละเอียด (ไม่บังคับ)" aria-label="รายละเอียด" /></div>
          <div class="wd-note">ผู้ดูแลจะเห็นข้อความล่าสุดของผู้เล่นนี้ในห้องเป็นหลักฐาน · แนะนำให้กดบล็อกหรือปิดเสียงด้วย</div>
          <div class="wd-grid" style="margin-top:8px"><button class="wd-act-btn is-danger" type="submit">${ICON('flag')} ส่งรายงาน</button></div></form>`;
        extra.querySelector('#wd-rep').addEventListener('submit', async (e) => { e.preventDefault(); const r = await call('report', { reason: extra.querySelector('#wd-rr').value, details: extra.querySelector('#wd-rd').value }); toast(r.message || 'ส่งรายงานแล้ว', 3500); closeSheet(); });
      }
    } catch (err) { toast(err.message || 'ทำรายการไม่สำเร็จ'); }
  }

  function onInvite(msg) {
    const kinds = { practice: 'ฝึกคำศัพท์ด้วยกัน', battle: 'แข่งคำศัพท์ (Friendly Match)' };
    W.root.querySelectorAll('.wd-invite').forEach((x) => x.remove());
    const el = document.createElement('div'); el.className = 'wd-invite'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'คำชวน');
    el.innerHTML = `<b>${esc(msg.from.name)}</b> ชวนคุณ${esc(kinds[msg.kind] || '')} ระดับ ${esc(msg.level)}<div class="wd-note">ตอบรับแล้วจะออกจาก Lobby ไปห้องแข่ง (กลับมาได้ทุกเมื่อ) · ไม่บังคับ</div>
      <div class="wd-status-actions"><button class="wd-act-btn" type="button" data-r="0">ไม่เป็นไร</button><button class="wd-act-btn is-primary" type="button" data-r="1">ตอบรับ</button></div><div class="wd-invite-bar"></div>`;
    W.root.querySelector('.wd-overlay').appendChild(el);
    const bar = el.querySelector('.wd-invite-bar'); const t0 = performance.now(); const ttl = msg.ttl || 45000;
    const tick = () => { if (!el.isConnected) return; const k = 1 - (performance.now() - t0) / ttl; if (k <= 0) { el.remove(); return; } bar.style.transform = `scaleX(${k})`; requestAnimationFrame(tick); };
    tick();
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; App().rtSend('world:invite_reply', { id: msg.id, accept: b.dataset.r === '1' }); el.remove(); });
  }

  // ---------------------------------------------------------------------------------------------
  // อาคาร / Event Plaza (เชื่อมระบบเดิมทั้งหมด — ไม่สร้างระบบเรียน/ร้านซ้ำ)
  // ---------------------------------------------------------------------------------------------
  function openZone(it) {
    const go = (path, label, sub, icon, primary) => `<button class="wd-act-btn${primary ? ' is-primary' : ''}" type="button" data-go="${path}">${ICON(icon)} <span>${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
    if (it.kind === 'learning') {
      sheet(`<p>เข้าเรียนในระบบเดิม (ความคืบหน้า/EXP ตามปกติ) · กลับมา Lobby ได้จากเมนู "เล่น"</p><div class="wd-grid">${go('learn', 'คำศัพท์', 'เส้นทางการเรียน', 'book-open', true)}${go('grammar', 'แกรมม่า', 'A1–C1', 'languages')}${go('toeic', 'TOEIC', 'Listening Part 1', 'headphones')}${go('c2', 'คำศัพท์ C2', '', 'graduation-cap')}</div>`,
        { label: 'Learning Hall', onMount: bindGo });
    } else if (it.kind === 'battle') {
      sheet(`<p>ชวนคนที่อยู่ใกล้ ๆ: แตะที่ตัวผู้เล่น → "ชวนแข่ง" · หรือเข้าระบบแข่งเดิม</p><div class="wd-grid">${go('battle', 'ห้องแข่งคำศัพท์', 'สร้างห้อง/ใส่รหัส', 'swords', true)}${go('ranked', 'Ranked Quest', 'จับคู่ตามระดับ', 'trophy')}</div>`, { label: 'Battle Arena', onMount: bindGo });
    } else if (it.kind === 'boutique') {
      sheet(`<p>ร้านและตู้เสื้อผ้าเดิม — ชุดที่เปลี่ยนจะแสดงในโลกทันทีเมื่อกลับมา</p><div class="wd-grid">${go('shop', 'ร้านค้า', 'ซื้อด้วย Coin จากการเรียน', 'store', true)}${go('wardrobe', 'ตู้เสื้อผ้า', 'สวมของที่มี', 'shirt')}</div>`, { label: 'Avatar Boutique', onMount: bindGo });
    } else if (it.kind === 'event_claim') openEventClaim(it);
    else if (it.kind === 'event_costume') openCostumes(it);
  }
  function bindGo(el) { el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => leaveTo(b.dataset.go))); }

  async function openEventClaim(it) {
    const el = sheet('<div id="wd-ev"><div class="wd-spin" aria-hidden="true"></div></div>', { label: 'Halloween — รางวัลเข้าระบบรายวัน' });
    const box = el.querySelector('#wd-ev');
    try {
      const st = await App().api(`/events/${it.event}`);
      const L = st.login || {};
      if (!st.active && st.status !== 'active') { box.innerHTML = `<p>${st.status === 'ended' ? 'กิจกรรมจบแล้ว — ของที่ได้รับยังอยู่ในตู้เสื้อผ้า' : 'กิจกรรมยังไม่เริ่ม'}</p>`; return; }
      box.innerHTML = `<p>รับแล้ว ${L.claimedDays || 0}/${(L.days || []).length || 7} วัน · รับได้วันละครั้ง (ไม่จำเป็นต้องเข้า Lobby — รับจากหน้าเทศกาลได้เหมือนกัน)</p>
        <div class="wd-grid">${L.claimedToday ? `<button class="wd-act-btn" type="button" disabled>${ICON('circle-check')} วันนี้รับแล้ว</button>` : `<button class="wd-act-btn is-primary" type="button" data-claim="1">${ICON('gift')} รับรางวัลวันนี้</button>`}
        <button class="wd-act-btn" type="button" data-go="festival">${ICON('calendar')} ดูปฏิทินเทศกาล</button></div><div id="wd-ev-res"></div>`;
      bindGo(box);
      const cb = box.querySelector('[data-claim]');
      if (cb) cb.addEventListener('click', async () => {
        cb.disabled = true;
        try {
          const r = await App().api(`/events/${it.event}/login-claim`, { method: 'POST' });
          const items = r.items || (r.reward && r.reward.items) || [];
          box.querySelector('#wd-ev-res').innerHTML = `<div class="wd-note">ได้รับ Day ${esc(r.day || r.dayNo || '')}: ${items.map((x) => esc((window.EQAvatar.itemInfo(x) || {}).name || x)).join(', ')} — เข้าตู้เสื้อผ้าแล้ว (ของถาวร)</div>
            <div class="wd-grid" style="margin-top:8px"><button class="wd-act-btn is-primary" type="button" data-wear="1">${ICON('shirt')} สวมเลย</button></div>`;
          App().rtSend('world:emote', { e: 'celebrate' });
          box.querySelector('[data-wear]').addEventListener('click', async () => { await window.EQAvatar.equipItems(items); toast('สวมแล้ว! ทุกคนในห้องเห็นชุดใหม่ของคุณ'); closeSheet(); });
        } catch (err) { toast(err.message || 'รับรางวัลไม่สำเร็จ'); cb.disabled = false; }
      });
    } catch (err) { box.innerHTML = `<p>${esc(err.message || 'โหลดข้อมูลกิจกรรมไม่สำเร็จ')}</p>`; }
  }
  async function openCostumes() {
    const cat = await window.EQAvatar.loadCatalog();
    const me = await App().api('/avatar/me');
    const owned = new Set((me.inventory || []).map((x) => x.itemId));
    const items = cat.filter((x) => x.collection === 'halloween26' && x.slot !== 'background');
    const mine = W.chars.get(W.me.pid);
    const base = { ...me.outfit };
    let trial = { ...base };
    const el = sheet(`<p>แตะเพื่อลองบนตัวละครในโลก (ยังไม่บันทึก) · ของที่ล็อก = รับจากปฏิทิน/เควสต์เทศกาล</p><div class="wd-costumes">${items.map((x) => `<button class="wd-costume${owned.has(x.id) ? '' : ' is-locked'}" type="button" data-id="${x.id}" aria-pressed="false"><img src="${esc(window.EQAvatar.itemThumb(x.id) || '')}" alt="" loading="lazy" />${esc(x.name)}${owned.has(x.id) ? '' : ` ${ICON('lock', 'icon icon-sm')}`}</button>`).join('')}</div>
      <div class="wd-grid" style="margin-top:10px"><button class="wd-act-btn is-primary" type="button" data-save="1">${ICON('save')} ใช้ชุดนี้ (เฉพาะของที่มี)</button><button class="wd-act-btn" type="button" data-reset="1">${ICON('undo-2')} กลับชุดเดิม</button></div>`,
    { label: 'ลองชุด Halloween', key: 'costume' });
    const apply = () => { if (mine && mine.char) mine.char.setOutfit(trial); };
    el.querySelector('.wd-costumes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      const it = window.EQAvatar.itemInfo(b.dataset.id);
      const on = trial[it.slot] !== it.id;
      trial = { ...trial, [it.slot]: on ? it.id : base[it.slot] || null };
      el.querySelectorAll('.wd-costume').forEach((x) => { const xi = window.EQAvatar.itemInfo(x.dataset.id); const sel = trial[xi.slot] === xi.id; x.classList.toggle('is-on', sel); x.setAttribute('aria-pressed', String(sel)); });
      apply();
    });
    el.querySelector('[data-reset]').addEventListener('click', () => { trial = { ...base }; apply(); el.querySelectorAll('.wd-costume').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); }); });
    el.querySelector('[data-save]').addEventListener('click', async () => {
      const ids = Object.entries(trial).filter(([s, id]) => id && id !== base[s] && owned.has(id)).map(([, id]) => id);
      if (!ids.length) { toast('ยังไม่ได้เลือกของที่มีอยู่'); return; }
      await window.EQAvatar.equipItems(ids); toast('บันทึกชุดแล้ว'); closeSheet();
    });
    const restore = new MutationObserver(() => { if (!el.isConnected) { restore.disconnect(); if (W && mine && mine.char) mine.char.setOutfit(mine.data.outfit || base); } });
    restore.observe(el.parentNode, { childList: true });
  }

  // ---------------------------------------------------------------------------------------------
  // เพื่อน / ห้อง
  // ---------------------------------------------------------------------------------------------
  async function openFriends() {
    const el = sheet('<div id="wd-fr"><div class="wd-spin" aria-hidden="true"></div></div>', { label: 'เพื่อนและห้อง' });
    const box = el.querySelector('#wd-fr');
    try {
      const [{ friends }, { rooms, capacity }] = await Promise.all([App().api('/world/friends'), App().api('/world/rooms')]);
      box.innerHTML = `<div class="wd-cat">เพื่อนที่อยู่ใน Lobby</div><div class="wd-list">${friends.length ? friends.map((f) => `<div class="wd-item"><div class="wd-item-main"><b>${esc(f.name)}</b><small>${esc(f.roomName)}</small></div>${W.room && f.roomId === W.room.id ? '<span class="wd-tag">ห้องเดียวกัน</span>' : `<button class="wd-act-btn" type="button" data-friend="${f.userId}" ${f.canJoin ? '' : 'disabled'}>${f.canJoin ? 'ไปหา' : 'ตามไม่ได้'}</button>`}</div>`).join('') : '<p>ยังไม่มีเพื่อนใน Lobby ตอนนี้</p>'}</div>
        <div class="wd-cat" style="margin-top:12px">ห้อง (สูงสุด ${capacity} คน/ห้อง)</div><div class="wd-list">${rooms.map((r) => `<div class="wd-item"><div class="wd-item-main"><b>${esc(r.name)}</b><small>${r.count}/${r.cap} คน${r.friends ? ` · เพื่อน ${r.friends}` : ''}</small></div>${r.current ? '<span class="wd-tag">อยู่ที่นี่</span>' : `<button class="wd-act-btn" type="button" data-room="${r.id}" ${r.occupancy >= r.cap ? 'disabled' : ''}>${r.occupancy >= r.cap ? 'เต็ม' : 'ย้ายไป'}</button>`}</div>`).join('')}</div>
        <div class="wd-grid" style="margin-top:10px"><button class="wd-act-btn" type="button" data-go="friends">${ICON('users')} หน้าเพื่อน</button></div>`;
      box.querySelectorAll('[data-friend]').forEach((b) => b.addEventListener('click', () => { closeSheet(); sess.set(null); App().rtSend('world:join', { friend: Number(b.dataset.friend) }); }));
      box.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => { closeSheet(); sess.set(null); App().rtSend('world:join', { roomId: b.dataset.room }); }));
      bindGo(box);
    } catch (err) { box.innerHTML = `<p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p>`; }
  }

  // ---------------------------------------------------------------------------------------------
  // ตั้งค่า (Privacy ของ Lobby + คุณภาพภาพ + การจำกัดสิทธิ์/อุทธรณ์)
  // ---------------------------------------------------------------------------------------------
  async function openSettings() {
    const el = sheet('<div id="wd-st"><div class="wd-spin" aria-hidden="true"></div></div>', { label: 'ตั้งค่า Lobby' });
    const box = el.querySelector('#wd-st');
    try {
      const [{ settings: s }, { restrictions }] = await Promise.all([App().api('/world/settings'), App().api('/world/me/restrictions')]);
      const meta = W.cfg.settingsMeta;
      const opt = { nobody: 'ไม่มีใคร', friends: 'เพื่อนเท่านั้น', everyone: 'ทุกคนที่อยู่ใกล้', off: 'ปิดแชท', phrases: 'ประโยคสำเร็จรูป', text: 'ประโยคสำเร็จรูป + พิมพ์เอง', private: 'ฉันเท่านั้น', public: 'ทุกคน' };
      const row = (k, m) => (m.type === 'bool'
        ? `<div class="wd-row"><span class="wd-row-text">${esc(m.th)}${m.hint ? `<small>${esc(m.hint)}</small>` : ''}</span><button class="wd-switch" type="button" role="switch" aria-checked="${Boolean(s[k])}" data-k="${k}" aria-label="${esc(m.th)}"></button></div>`
        : `<div class="wd-row"><label for="wd-s-${k}">${esc(m.th)}${m.hint ? `<small>${esc(m.hint)}</small>` : ''}</label><select id="wd-s-${k}" data-k="${k}">${m.type.map((v) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${opt[v] || v}</option>`).join('')}</select></div>`);
      const active = restrictions.filter((r) => !r.lifted_at && new Date(r.ends_at) > new Date());
      box.innerHTML = `${Object.entries(meta).map(([k, m]) => row(k, m)).join('')}
        ${row('profileView', { th: 'ใครดูโปรไฟล์ของฉันได้', hint: 'ค่าเดียวกับ Privacy Settings', type: ['private', 'friends', 'public'] })}
        <div class="wd-row"><label for="wd-q">คุณภาพภาพ<small>ประหยัด = ลดความละเอียด/ระยะมองเห็นผู้เล่น</small></label><select id="wd-q"><option value="auto">อัตโนมัติ</option><option value="saver" ${W.quality === 'locked' ? 'selected' : ''}>ประหยัดแบต</option></select></div>
        ${active.length ? `<div class="wd-cat">การจำกัดสิทธิ์</div>${active.map((r) => `<div class="wd-note">${r.kind === 'chat' ? 'ปิดแชท' : 'ห้ามเข้า Lobby'} ถึง ${esc(new Date(r.ends_at).toLocaleString('th-TH'))} — ${esc(r.reason)}${r.appeal_status === 'none' ? ` <button class="wd-act-btn" type="button" data-appeal="${r.id}">อุทธรณ์</button>` : ` (อุทธรณ์: ${esc(r.appeal_status)})`}</div>`).join('')}` : ''}
        <div class="wd-note">Lobby ไม่แสดงอีเมล เบอร์โทร หรือที่อยู่ของใคร · ผู้เล่นอื่นเห็นแค่ชื่อผู้ใช้ ชุดที่สวม และสิ่งที่คุณเปิดให้ดู · การอยู่ใน Lobby ไม่ได้ Coin/EXP — รางวัลมาจากการเรียนเท่านั้น</div>`;
      const save = async (k, v) => { try { const r = await App().api('/world/settings', { method: 'PUT', body: { [k]: v } }); W.settings = r.settings; toast('บันทึกแล้ว'); } catch (err) { toast(err.message); } };
      box.querySelectorAll('.wd-switch').forEach((b) => b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); save(b.dataset.k, v); }));
      box.querySelectorAll('select[data-k]').forEach((sel) => sel.addEventListener('change', () => save(sel.dataset.k, sel.value)));
      box.querySelector('#wd-q').addEventListener('change', (e) => { if (e.target.value === 'saver') { W.quality = 'locked'; W.pr = 1; W.renderer.setPixelRatio(1); resize(); } else { W.quality = 'auto'; } });
      box.querySelectorAll('[data-appeal]').forEach((b) => b.addEventListener('click', () => appealDialog(Number(b.dataset.appeal))));
    } catch (err) { box.innerHTML = `<p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p>`; }
  }
  function appealDialog(id) {
    const el = sheet(`<form id="wd-ap"><p>อธิบายสั้น ๆ ว่าทำไมควรยกเลิก ผู้ดูแลจะอ่านแล้วตัดสิน (อุทธรณ์ได้ 1 ครั้ง)</p><div class="wd-text-row"><input maxlength="500" placeholder="เหตุผล" aria-label="เหตุผลการอุทธรณ์" required minlength="5" /></div><div class="wd-grid" style="margin-top:8px"><button class="wd-act-btn is-primary" type="submit">ส่งอุทธรณ์</button></div></form>`, { label: 'อุทธรณ์' });
    el.querySelector('#wd-ap').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App().api(`/world/restrictions/${id}/appeal`, { method: 'POST', body: { text: el.querySelector('input').value } }); toast('ส่งอุทธรณ์แล้ว'); closeSheet(); } catch (err) { toast(err.message); }
    });
  }

  // ออกจากหน้า Lobby (ไปหน้าอื่นด้วยเมนู/ปุ่ม/ห้องแข่งจากคำชวน) = ออกจากห้อง + คืนทรัพยากร
  window.addEventListener('eq:screen', (e) => { if (W && e.detail && e.detail.id !== 'screen-world') close(); });

  window.EQWorld = { open, close, onMessage, get isOpen() { return Boolean(W); },
    _state: () => (W ? { me: W.me && { ...W.me }, room: W.room, players: [...W.chars.values()].map((c) => ({ pid: c.pid, name: c.data.name, x: +c.x.toFixed(2), z: +c.z.toFixed(2), st: c.st, me: c.me, loaded: Boolean(c.char), visible: Boolean(c.char && c.char.group.visible), friend: Boolean(c.data.friend), outfit: c.char ? c.char.outfit : null })),
      chatAllowed: W.chatAllowed, target: W.target && { kind: W.target.kind, id: W.target.it.id }, quality: W.quality, pr: W.pr, avgFrameMs: W.avgFrameMs, rtt: W.rtt, visible: W.visible,
      calls: W.renderer && W.renderer.info.render.calls, triangles: W.renderer && W.renderer.info.render.triangles, cam: { ...W.cam } } : null),
    _teleport: (x, z) => { if (W && W.me) { W.me.x = x; W.me.z = z; } }, _openPlayer: (pid) => openPlayerMenu(pid), _setYaw: (y) => { if (W) W.cam.yaw = y; }, _buf: (pid) => { const c = W && W.chars.get(pid); return c ? c.buf.slice(-3).map((b) => ({ ago: Math.round(performance.now() - b.at), x: b.x, z: b.z })) : null; }, _sent: () => (W ? { sentAgo: Math.round(performance.now() - W.sentAt), last: W.lastSent } : null), _input: () => (W ? { keys: [...W.keys], joy: { ...W.joy }, autoWalk: Boolean(W.autoWalk), seat: Boolean(W.me && W.me.seat) } : null),
    /** (ทดสอบ) เดินไปยังจุด ด้วยความเร็วเดินจริง + collision เดียวกับเกม — เซิร์ฟเวอร์ตรวจเหมือนผู้เล่นกดเดินเอง */
    _walkTo: (x, z, speed) => new Promise((resolve) => {
      if (!W || !W.me) { resolve(false); return; }
      const sp = speed || W.cfg.walkSpeed; let last = performance.now(); let stuck = 0;
      const step = () => {
        if (!W || !W.me) { resolve(false); return; }
        const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
        const dx = x - W.me.x; const dz = z - W.me.z; const L = Math.hypot(dx, dz);
        if (L < 0.15) { W.me.st = 'idle'; resolve(true); return; }
        const k = Math.min(L, sp * dt) / L;
        const [nx, nz] = W.phys.step(W.me.x, W.me.z, dx * k, dz * k);
        stuck = Math.hypot(nx - W.me.x, nz - W.me.z) < 1e-4 ? stuck + 1 : 0;
        if (stuck > 30) { W.me.st = 'idle'; resolve(false); return; }
        W.me.x = nx; W.me.z = nz; W.me.ry = Math.atan2(dx, dz); W.me.st = sp > W.cfg.walkSpeed ? 'run' : 'walk';
        W.walkTimer = setTimeout(step, 16);
      };
      W.keys.clear(); W.autoWalk = true;
      const done = resolve; resolve = (v) => { if (W) W.autoWalk = false; done(v); };
      step();
    }) };
}());
