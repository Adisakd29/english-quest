(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'wq_token';
  const SESSION_SIZE = 12;

  const LEVEL_META = {
    A1: { name: 'หมู่บ้านเริ่มต้น', sub: 'คำศัพท์พื้นฐานที่สุด', color: '#047857' },
    A2: { name: 'ทุ่งหญ้ากว้าง', sub: 'คำศัพท์ใช้ในชีวิตประจำวัน', color: '#0369A1' },
    B1: { name: 'เทือกเขาสูง', sub: 'คำศัพท์ระดับกลาง', color: '#6D28D9' },
    B2: { name: 'ยอดเขาเมฆหมอก', sub: 'คำศัพท์ระดับสูง', color: '#C2410C' },
    C1: { name: 'แดนเหนือเมฆ', sub: 'คำศัพท์ระดับสูงมาก (Oxford 5000)', color: '#BE185D' },
  };

  // ภาพประจำระดับใช้ตรา CEFR จากระบบกราฟิกกลาง (G.emblem) แทนฉากวาดแยกสไตล์แบบเดิม

  const CATEGORY_TH = {
    noun: 'คำนาม (noun)',
    verb: 'คำกริยา (verb)',
    adj: 'คำคุณศัพท์ (adjective)',
    adv: 'คำกริยาวิเศษณ์ (adverb)',
    prep: 'คำบุพบท (preposition)',
    pron: 'คำสรรพนาม (pronoun)',
    det: 'คำกำหนด (determiner)',
    conj: 'คำสันธาน (conjunction)',
    number: 'ตัวเลข (number)',
    exclam: 'คำอุทาน (exclamation)',
    modal: 'กริยาช่วย (modal verb)',
    aux: 'กริยาช่วย (auxiliary verb)',
    other: 'คำศัพท์',
  };

  // ระบบกราฟิกกลาง (public/js/graphics.js) — ไอคอน/ภาพประกอบ/อวตาร/ตรา ใช้จากที่เดียว ไม่มี emoji ใน UI
  const G = window.EQG;
  const ic = G.icon;
  const AVATARS = G.AVATAR_IDS.map((id) => ({ id, name: G.AVATAR_NAMES[id] }));

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: null,
    summary: null,
    session: null, // { level, queue: [words], index, results: [], expGained: 0 }
  };

  // ---------------------------------------------------------------
  // API helper
  // ---------------------------------------------------------------
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      const e = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      e.network = true; // ให้ Ranked แยก "เน็ตหลุด" ออกจาก error ของเซิร์ฟเวอร์ได้
      throw e;
    }

    let data = {};
    try { data = await res.json(); } catch (_e) { /* no body */ }

    if (!res.ok) {
      const e = new Error(data.error || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      e.code = data.code || null; // ให้หน้าเว็บแยกกรณีได้ เช่น ACCOUNT_EXISTS
      e.status = res.status;
      if (data.retryAfter) e.retryAfter = data.retryAfter;
      throw e;
    }
    return data;
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    // ข้อผิดพลาด: role="alert" ให้ screen reader อ่านทันที
    if (type === 'error') el.setAttribute('role', 'alert');
    // ระยะเวลาแสดงตามความยาวข้อความ (เดิม 3.2 วินาทีเสมอ — ข้อความยาวอ่านไม่ทัน)
    const ms = Math.min(8000, Math.max(3200, String(message).length * 70));
    setTimeout(() => el.remove(), ms);
  }

  // ---------------------------------------------------------------
  // Screen routing
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // ROUTER — ผูก URL hash กับหน้าจอ เพื่อให้ปุ่ม Back/แชร์ลิงก์ใช้ได้
  // ---------------------------------------------------------------
  // แมพ path <-> screen id และบอกว่าปุ่ม nav ล่างตัวไหน active
  const ROUTES = {
    // เมนูหลัก 5 กลุ่ม: home / learn / ranked / play / profile (โหมดทบทวนถูกนำออกแล้ว — ลิงก์เก่า #/review พาไปหน้าเรียน)
    home:         { screen: 'screen-home',          nav: 'home' },
    learn:        { screen: 'screen-path',          nav: 'learn' },
    vocab:        { screen: 'screen-map',           nav: 'learn' },
    path:         { screen: 'screen-path',          nav: 'learn' },
    words:        { screen: 'screen-vocab',         nav: 'learn' },
    grammar:      { screen: 'screen-grammar-list',  nav: 'learn' },
    placement:    { screen: 'screen-placement',     nav: 'learn' },
    play:         { screen: 'screen-play',          nav: 'play' },
    battle:       { screen: 'screen-battle-home',   nav: 'play' },
    friends:      { screen: 'screen-friends',       nav: 'play' },
    leaderboard:  { screen: 'screen-leaderboard',   nav: 'play' },
    chat:         { screen: 'screen-chat',          nav: 'play' },
    ranked:       { screen: 'screen-ranked',        nav: 'ranked' },
    'ranked-journey': { screen: 'screen-ranked-journey', nav: 'ranked' },
    'ranked-leaderboard': { screen: 'screen-ranked-leaderboard', nav: 'ranked' },
    'ranked-history': { screen: 'screen-ranked-history', nav: 'ranked' },
    event:        { screen: 'screen-event',         nav: 'play' },
    profile:      { screen: 'screen-profile',       nav: 'profile' },
    admin:        { screen: 'screen-admin',         nav: 'profile' },
  };
  // หา path จาก screen id (ย้อนกลับ)
  const SCREEN_TO_PATH = {};
  Object.entries(ROUTES).forEach(([path, v]) => { SCREEN_TO_PATH[v.screen] = path; });

  // หน้าจอที่ "ไม่ควรโชว์ nav ล่าง" (กำลังทำกิจกรรมเต็มจอ)
  const NAV_HIDDEN_SCREENS = new Set([
    'screen-game', 'screen-summary',
    'screen-grammar-lesson', 'screen-grammar-quiz', 'screen-grammar-result',
    'screen-battle-lobby', 'screen-battle-play', 'screen-battle-result',
    'screen-placement', 'screen-assessment', 'screen-ranked-match',
  ]);

  let suppressHashSync = false; // กัน loop ตอนอัปเดต hash เอง

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');

    updateNavUI(id);
    window.dispatchEvent(new CustomEvent('eq:screen', { detail: { id } })); // ระบบเสียงกลางใช้หยุดเพลงเมื่อออกจาก Ranked

    // อัปเดต URL hash ให้ตรงกับหน้า (ถ้ามี path) โดยไม่ยิง event ซ้ำ
    const path = SCREEN_TO_PATH[id];
    if (path && !suppressHashSync) {
      const target = `#/${path}`;
      if (window.location.hash !== target) {
        suppressHashSync = true;
        window.location.hash = target;
        suppressHashSync = false;
      }
    }
  }

  function updateNavUI(screenId) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    // ซ่อน nav ตอนทำกิจกรรมเต็มจอ หรือตอนยังไม่ล็อกอิน
    const hide = NAV_HIDDEN_SCREENS.has(screenId) || !state.token;
    nav.classList.toggle('hidden', hide);

    const activeNav = (ROUTES[SCREEN_TO_PATH[screenId]] || {}).nav || null;
    nav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === activeNav);
    });
  }

  // ผูก event แบบปลอดภัย: ถ้าไม่มี element (ถูกย้าย/ลบจากหน้า) ข้ามไป — ไม่ทำให้ทั้งแอปพังตอนโหลด
  function on(id, evt, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
    return el;
  }

  // ไปยัง path (ใช้โดยปุ่ม nav) — เรียกฟังก์ชันเปิดหน้าที่เหมาะสม
  // เพื่อให้หน้าที่ต้องโหลดข้อมูล (vocab/friends/leaderboard) ทำงานครบ
  // ตัวกั้นการออกจากหน้าเกม (เช่น Ranked Match ที่ยังเล่นอยู่) — คืน true = หยุดการนำทาง (ตัวกั้นแสดงกล่องยืนยันเอง)
  let leaveGuard = null;
  function navigateTo(path) {
    if (leaveGuard && leaveGuard(path)) return;
    switch (path) {
      case 'home': openHome(); break;
      case 'learn': openPath(); break;
      case 'review': openPath(); break;   // ลิงก์เก่า (โหมดทบทวนถูกนำออก) -> หน้าเรียน ไม่ใช่หน้าว่าง
      case 'play': openPlay(); break;
      case 'profile': openProfile(); break;
      case 'vocab': openPath(); break; // ปุ่มคำศัพท์ไปเส้นทางการเรียน (แผนที่ระดับเดิมยังเข้าได้จากในนั้น)
      case 'path': openPath(); break;
      case 'words': openVocab(); break;
      case 'battle':
        document.getElementById('battle-error').textContent = '';
        showScreen('screen-battle-home');
        break;
      case 'friends': openFriends(); break;
      case 'chat': openChat(); break;
      case 'leaderboard':
        showScreen('screen-leaderboard');
        loadLeaderboard();
        break;
      case 'grammar': openGrammarList(); break;
      case 'admin': openAdmin(); break;
      case 'placement': openPlacement(); break;
      case 'ranked': if (window.EQRanked) window.EQRanked.openLobby(); break;
      case 'ranked-journey': if (window.EQRanked) window.EQRanked.openJourney(); break;
      case 'ranked-leaderboard': if (window.EQRanked) window.EQRanked.openLeaderboard(); break;
      case 'ranked-history': if (window.EQRanked) window.EQRanked.openHistory(); break;
      case 'event': if (window.EQEvent) window.EQEvent.open(); break;
      default: openHome();
    }
  }

  // ตอบสนองเมื่อ hash เปลี่ยน (ปุ่ม Back/Forward หรือเปิดลิงก์ตรง)
  function handleHashChange() {
    if (suppressHashSync) return;
    if (!state.token) return; // ยังไม่ล็อกอิน ไม่ต้อง route
    const raw = window.location.hash.replace(/^#\/?/, '');
    const path = raw.split('/')[0] === 'review' ? 'learn' : raw.split('/')[0];
    if (ROUTES[path]) {
      if (leaveGuard && leaveGuard(path)) return; // ปุ่ม Back ระหว่างเกม -> ถามยืนยันก่อน
      suppressHashSync = true;
      navigateTo(path);
      suppressHashSync = false;
    }
  }
  window.addEventListener('hashchange', handleHashChange);

  // ผูกปุ่ม nav ล่าง
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    navigateTo(btn.dataset.nav);
  });

  function showAuth() {
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('screen-auth').classList.remove('hidden');
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.classList.add('hidden');
  }

  function showApp() {
    document.getElementById('screen-auth').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
  }

  // ---------------------------------------------------------------
  // Auth tabs
  // ---------------------------------------------------------------
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formForgot = document.getElementById('form-forgot');
  const formReset = document.getElementById('form-reset');
  const authTabs = document.querySelector('#screen-auth .tabs');

  // สลับแผงในการ์ดล็อกอิน: 'login' | 'register' | 'forgot' | 'reset'
  function showAuthPanel(which) {
    [formLogin, formRegister, formForgot, formReset].forEach((f) => f.classList.add('hidden'));
    // แท็บโชว์เฉพาะตอนล็อกอิน/สมัคร
    authTabs.classList.toggle('hidden', which === 'forgot' || which === 'reset');
    if (which === 'login') {
      formLogin.classList.remove('hidden');
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
    } else if (which === 'register') {
      formRegister.classList.remove('hidden');
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
    } else if (which === 'forgot') {
      formForgot.classList.remove('hidden');
    } else if (which === 'reset') {
      formReset.classList.remove('hidden');
    }
    // ปุ่ม Google: แท็บสมัคร = "สมัครด้วย Google" · แท็บเข้าสู่ระบบ = "ลงชื่อเข้าใช้ด้วย Google" (ระบบเดียวกัน — บัญชีใหม่ถูกสร้างให้อัตโนมัติ)
    if ((which === 'login' || which === 'register') && googleState.clientId && googleState.ready) {
      renderGoogleButton(document.getElementById('google-btn'), onGoogleCredential, which === 'register' ? 'signup_with' : 'signin_with').catch(() => {});
      document.getElementById('google-divider-text').textContent = which === 'register' ? 'หรือสมัครด้วยอีเมล' : 'หรือใช้อีเมล';
    }
  }

  tabLogin.addEventListener('click', () => showAuthPanel('login'));
  tabRegister.addEventListener('click', () => showAuthPanel('register'));
  document.getElementById('btn-forgot').addEventListener('click', () => {
    document.getElementById('forgot-error').textContent = '';
    document.getElementById('forgot-success').classList.add('hidden');
    // เติมอีเมลให้อัตโนมัติถ้าผู้ใช้พิมพ์อีเมลไว้ในช่องล็อกอินแล้ว
    const typed = document.getElementById('login-identifier').value.trim();
    if (typed.includes('@')) document.getElementById('forgot-email').value = typed;
    showAuthPanel('forgot');
  });
  document.getElementById('btn-back-login').addEventListener('click', () => showAuthPanel('login'));
  document.getElementById('btn-reset-cancel').addEventListener('click', () => {
    clearResetParam();
    showAuthPanel('login');
  });

  // ---- ขอลิงก์ตั้งรหัสผ่านใหม่ ----
  formForgot.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const errEl = document.getElementById('forgot-error');
    const okEl = document.getElementById('forgot-success');
    const btn = document.getElementById('forgot-submit');
    errEl.textContent = '';
    okEl.classList.add('hidden');
    btn.disabled = true;
    try {
      const res = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      okEl.textContent = res.message;
      okEl.classList.remove('hidden');
      if (res.mailEnabled === false) {
        okEl.textContent += ' (หมายเหตุ: ผู้ดูแลระบบยังไม่ได้ตั้งค่าอีเมล ลิงก์จะอยู่ใน log ของเซิร์ฟเวอร์)';
      }
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---- ตั้งรหัสผ่านใหม่ ----
  let resetToken = null;

  function clearResetParam() {
    resetToken = null;
    // ลบ ?reset=... ออกจาก URL เพื่อไม่ให้โทเคนค้างอยู่ในช่องที่อยู่เว็บ
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  formReset.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('reset-password').value;
    const p2 = document.getElementById('reset-password2').value;
    const errEl = document.getElementById('reset-error');
    const btn = document.getElementById('reset-submit');
    errEl.textContent = '';
    if (p1 !== p2) {
      errEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
      return;
    }
    if (p1.length < authConfig.minPasswordLength) {
      errEl.textContent = `รหัสผ่านต้องมีอย่างน้อย ${authConfig.minPasswordLength} ตัวอักษร`;
      return;
    }
    btn.disabled = true;
    try {
      const { token, user } = await api('/auth/reset-password', {
        method: 'POST',
        body: { token: resetToken, password: p1 },
      });
      clearResetParam();
      toast('ตั้งรหัสผ่านใหม่เรียบร้อย ยินดีต้อนรับกลับ!', 'success');
      onAuthSuccess(token, user);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ถ้าเปิดเว็บมาพร้อม ?reset=<token> ให้เช็คลิงก์แล้วโชว์ฟอร์มตั้งรหัสใหม่

  // ---------- ยืนยันอีเมล ----------
  let verifyIdentifier = null;
  function showVerifyPanel(email, identifier) {
    verifyIdentifier = identifier;
    [formLogin, formRegister, formForgot, formReset].forEach((f) => f.classList.add('hidden'));
    authTabs.classList.add('hidden');
    document.getElementById('google-auth').classList.add('hidden');
    document.getElementById('verify-email-to').textContent = email;
    document.getElementById('verify-msg').textContent = '';
    document.getElementById('auth-verify-panel').classList.remove('hidden');
  }
  async function resendVerification(identifier, msgEl, btn) {
    btn.disabled = true;
    try {
      const r = await api('/auth/resend-verification', { method: 'POST', body: identifier ? { identifier } : {} });
      msgEl.textContent = r.message;
      msgEl.classList.add('form-ok');
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.classList.remove('form-ok');
    } finally {
      setTimeout(() => { btn.disabled = false; }, 4000); // กันกดรัว
    }
  }
  document.getElementById('verify-resend').addEventListener('click', (e) => {
    resendVerification(verifyIdentifier, document.getElementById('verify-msg'), e.currentTarget);
  });
  document.getElementById('verify-back').addEventListener('click', () => {
    document.getElementById('auth-verify-panel').classList.add('hidden');
    if (googleState.clientId) document.getElementById('google-auth').classList.remove('hidden');
    showAuthPanel('login');
  });
  document.getElementById('login-resend').addEventListener('click', (e) => {
    const id = document.getElementById('login-identifier')?.value.trim();
    resendVerification(id, document.getElementById('login-error'), e.currentTarget);
  });
  // ลิงก์ในอีเมล: /?verify=<token> -> ยืนยันแล้วเข้าสู่ระบบทันที
  async function checkVerifyLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verify');
    if (!token) return false;
    history.replaceState(null, '', window.location.pathname + window.location.hash); // ไม่ทิ้ง token ใน URL
    try {
      const r = await api('/auth/verify-email', { method: 'POST', body: { token } });
      onAuthSuccess(r.token, r.user);
      toast('ยืนยันอีเมลเรียบร้อย — ยินดีต้อนรับ!', 'success');
    } catch (err) {
      showAuth();
      showAuthPanel('login');
      document.getElementById('login-error').textContent = err.message;
    }
    return true;
  }
  // แถบชวนยืนยันอีเมล (บัญชีที่ยังไม่ยืนยันแต่ไม่ถูกบังคับ เช่น ผู้ใช้เดิม)
  function renderVerifyBanner() {
    const b = document.getElementById('verify-banner');
    if (!b) return;
    b.classList.toggle('hidden', !state.user || state.user.emailVerified !== false);
  }
  on('verify-banner-send', 'click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await api('/auth/resend-verification', { method: 'POST', body: {} });
      toast(r.message, 'success');
    } catch (err) { toast(err.message, 'error'); }
    setTimeout(() => { btn.disabled = false; }, 4000);
  });
  async function checkResetLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (!token) return false;
    showAuth();
    try {
      const res = await api(`/auth/reset-password/${encodeURIComponent(token)}`);
      resetToken = token;
      document.getElementById('reset-greeting').textContent =
        `สวัสดีคุณ ${res.username} — ตั้งรหัสผ่านใหม่ได้เลย`;
      showAuthPanel('reset');
    } catch (err) {
      clearResetParam();
      showAuthPanel('login');
      document.getElementById('login-error').textContent = err.message;
    }
    return true;
  }

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');
    errEl.textContent = '';
    btn.disabled = true;
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { identifier, password } });
      onAuthSuccess(token, user);
    } catch (err) {
      errEl.textContent = err.message;
      document.getElementById('login-resend').classList.toggle('hidden', err.code !== 'EMAIL_NOT_VERIFIED');
    } finally {
      btn.disabled = false;
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('register-error');
    const btn = document.getElementById('register-submit');
    errEl.textContent = '';
    btn.disabled = true;
    try {
      const res = await api('/auth/register', { method: 'POST', body: { username, email, password } });
      if (res.requiresVerification) {
        showVerifyPanel(res.email, username);
        return;
      }
      onAuthSuccess(res.token, res.user);
      toast('สร้างบัญชีสำเร็จ! ยินดีต้อนรับ', 'success');
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function onAuthSuccess(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    renderHud();
    showApp();
    openHome();
    rtConnect();      // เริ่มเชื่อมต่อ realtime หลังล็อกอินสำเร็จ
    syncThemes();
    if (window.EQEvent) window.EQEvent.refresh();
    loadFriendData(); // ดึงข้อมูลเพื่อนไว้โชว์ badge บนหน้าหลัก
  }

  document.getElementById('btn-logout').addEventListener('click', () => {
    rtDisconnect();   // ตัดการเชื่อมต่อ realtime ก่อนออกจากระบบ
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    showAuth();
  });

  // ---------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------
  function renderHud() {
    const u = state.user;
    if (!u) return;
    const hudAvatar = document.getElementById('hud-avatar');
    if (u.avatarImage) {
      hudAvatar.textContent = '';
      hudAvatar.style.backgroundImage = `url("${u.avatarImage}")`;
      hudAvatar.classList.add('has-image');
    } else {
      hudAvatar.style.backgroundImage = '';
      hudAvatar.classList.remove('has-image');
      hudAvatar.innerHTML = G.avatar(u.avatar);
    }
    document.getElementById('hud-username').textContent = u.username;
    document.getElementById('hud-level-tag').textContent = `LV.${u.level}`;
    document.getElementById('hud-exp-fill').style.width = `${u.progressPercent}%`;
    document.getElementById('hud-exp-label').textContent = `${u.expIntoLevel} / ${u.expForNextLevel} EXP`;
  }

  document.getElementById('hud-avatar').addEventListener('click', () => navigateTo('profile'));
  document.getElementById('hud-username').addEventListener('click', () => navigateTo('profile'));

  // ---------------------------------------------------------------
  // DIALOG / BOTTOM SHEET — component กลางของ popup ทุกชนิด
  // อัปเกรด overlay (.modal-overlay > .modal-card) ให้:
  //  - เลื่อนดูเนื้อหาได้เสมอ (เดิมเนื้อหายาวกว่าจอถูกตัดบน-ล่างและเลื่อนไม่ได้)
  //  - ปิดด้วย Esc / แตะพื้นหลัง · กัก focus ด้วย Tab · คืน focus เดิมเมื่อปิด
  //  - ล็อกการเลื่อนหน้าข้างหลัง · role="dialog" + aria-modal สำหรับ screen reader
  //  - variant 'sheet' = Bottom Sheet บนจอ < 768px (จอกว้างแสดงเป็น dialog กลางจอ)
  // ---------------------------------------------------------------
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let openDialogs = 0;
  // กด Tab วนอยู่ในกล่อง (ไม่หลุดไปปุ่มข้างหลัง dialog)
  function trapTab(e, card) {
    if (e.key !== 'Tab') return;
    const items = Array.from(card.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function makeDialog(overlay, { label, variant = 'center', onClose, closeButton = true } = {}) {
    const card = overlay.querySelector('.modal-card');
    if (closeButton && !card.querySelector('.sheet-close')) {
      // ปุ่มปิดมุมขวาบนแบบเดียวกันทุก dialog (ติดอยู่ด้านบนขณะเลื่อนเนื้อหา)
      card.insertAdjacentHTML('afterbegin', '<button class="sheet-close" type="button" aria-label="ปิด"><svg class="icon" aria-hidden="true"><use href="/assets/icons/icons.svg#x"></use></svg></button>');
      card.querySelector('.sheet-close').addEventListener('click', () => overlay.remove());
    }
    const opener = document.activeElement;
    overlay.classList.add('ui-overlay', variant === 'sheet' ? 'is-sheet' : 'is-center');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (label) card.setAttribute('aria-label', label);
    card.tabIndex = -1;
    openDialogs += 1;
    document.body.classList.add('dialog-open');

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); overlay.remove(); return; }
      trapTab(e, card);
    };
    overlay.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // ปิดผ่าน overlay.remove() ได้จากทุกที่ในโค้ดเดิม — ทำความสะอาดครบในจุดเดียว
    const nativeRemove = overlay.remove.bind(overlay);
    let closed = false;
    overlay.remove = () => {
      if (closed) return;
      closed = true;
      nativeRemove();
      openDialogs = Math.max(0, openDialogs - 1);
      if (openDialogs === 0) document.body.classList.remove('dialog-open');
      if (onClose) onClose();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    requestAnimationFrame(() => {
      const first = card.querySelector('[data-autofocus]') || card.querySelector(FOCUSABLE) || card;
      first.focus({ preventScroll: true });
    });
    return overlay;
  }


  function showProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const optionsHtml = AVATARS.map((a) => {
      const selected = state.user && state.user.avatar === a.id ? ' selected' : '';
      return `<button class="avatar-option${selected}" data-avatar-id="${a.id}" type="button" aria-label="อวตาร${a.name}" aria-pressed="${selected ? 'true' : 'false'}">${G.avatar(a.id)}</button>`;
    }).join('');

    const hasCustomImage = !!(state.user && state.user.avatarImage);
    const previewContent = hasCustomImage
      ? `<img src="${escapeHtml(state.user.avatarImage)}" alt="รูปโปรไฟล์" />`
      : G.avatar(state.user.avatar);

    overlay.innerHTML = `
      <div class="modal-card">
        <h2>โปรไฟล์ของฉัน</h2>

        <p class="profile-section-label" style="margin-top:8px;">รูปโปรไฟล์</p>
        <div class="profile-pic-section">
          <div class="profile-pic-preview ${hasCustomImage ? 'has-image' : ''}" id="profile-pic-preview">
            ${previewContent}
          </div>
          <div class="profile-pic-controls">
            <input type="file" id="profile-pic-input" accept="image/png,image/jpeg,image/webp" style="display:none;" />
            <button class="btn btn-primary btn-sm" id="profile-pic-upload">${ic('camera', 'icon-sm')} อัปโหลดรูป</button>
            <button class="btn btn-secondary btn-sm ${hasCustomImage ? '' : 'hidden'}" id="profile-pic-remove">ลบรูป</button>
            <div class="profile-pic-hint">รองรับ PNG / JPG / WebP</div>
          </div>
        </div>
        <div class="form-error" id="profile-pic-error"></div>

        <p class="profile-section-label">ชื่อผู้ใช้</p>
        <div class="profile-username-row">
          <input type="text" id="profile-username-input" value="${escapeHtml(state.user.username)}" maxlength="20" />
          <button class="btn btn-primary" id="profile-username-save">บันทึก</button>
        </div>
        <div class="form-error" id="profile-username-error"></div>

        <p class="profile-section-label">หรือเลือกอวตารสำเร็จรูป</p>
        <div class="avatar-grid">${optionsHtml}</div>

        <p class="profile-section-label">บัญชี Google</p>
        <div class="profile-google" id="profile-google"><div class="loading-spinner"></div></div>

        <p class="profile-section-label">ความปลอดภัย</p>
        <button class="btn btn-secondary btn-block" id="profile-logout-all">ออกจากระบบทุกอุปกรณ์</button>
        <div class="profile-pic-hint" style="margin-top:6px;">ใช้เมื่อสงสัยว่ามีคนอื่นเข้าถึงบัญชี — อุปกรณ์อื่นจะหลุดทั้งหมด</div>

        <button class="btn btn-secondary btn-block" style="margin-top:18px;" id="profile-close">ปิด</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#profile-logout-all').addEventListener('click', () => logoutAllDevices(overlay));
    renderProfileGoogle(overlay);

    overlay.querySelectorAll('.avatar-option').forEach((btn) => {
      btn.addEventListener('click', () => selectAvatar(btn.dataset.avatarId, overlay));
    });
    overlay.querySelector('#profile-username-save').addEventListener('click', () => saveUsername(overlay));
    overlay.querySelector('#profile-username-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveUsername(overlay);
    });
    makeDialog(overlay, { label: 'แก้ไขโปรไฟล์และบัญชี', variant: 'sheet' });
    overlay.querySelector('#profile-close').addEventListener('click', () => overlay.remove());

    // Profile picture upload wiring
    const picInput = overlay.querySelector('#profile-pic-input');
    overlay.querySelector('#profile-pic-upload').addEventListener('click', () => picInput.click());
    picInput.addEventListener('change', (e) => handleAvatarUpload(e, overlay));
    overlay.querySelector('#profile-pic-remove').addEventListener('click', () => removeAvatarImage(overlay));
  }


  // ---------------------------------------------------------------
  // GOOGLE SIGN-IN (Google Identity Services — ป๊อปอัป ไม่ redirect)
  // ---------------------------------------------------------------
  const googleState = { clientId: null, loaded: null };
  // กติการหัสผ่านจากเซิร์ฟเวอร์ (ค่าเริ่มต้นตรงกับ MIN_PASSWORD_LEN ฝั่งเซิร์ฟเวอร์)
  const authConfig = { minPasswordLength: 8 };
  function applyPasswordRule(n) {
    if (!Number.isInteger(n) || n < 1) return;
    authConfig.minPasswordLength = n;
    document.querySelectorAll('[data-min-pw]').forEach((el) => { el.textContent = String(n); });
    document.querySelectorAll('[data-min-pw-input]').forEach((el) => { el.minLength = n; });
  }
  const GOOGLE_ERRORS = {
    AUTH_FAILED: 'ยืนยันตัวตนกับ Google ไม่สำเร็จ กรุณาลองใหม่',
    EMAIL_UNVERIFIED: 'อีเมลของบัญชี Google นี้ยังไม่ได้รับการยืนยัน',
    PROVIDER_ERROR: 'ติดต่อ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    NOT_CONFIGURED: 'ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google',
    IDENTITY_IN_USE: 'บัญชี Google นี้เชื่อมกับผู้ใช้อื่นอยู่แล้ว',
  };

  function loadGoogleScript() {
    if (googleState.loaded) return googleState.loaded;
    googleState.loaded = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true; sc.defer = true;
      sc.onload = () => resolve(window.google);
      sc.onerror = () => { googleState.loaded = null; reject(new Error('โหลดปุ่ม Google ไม่สำเร็จ')); };
      document.head.appendChild(sc);
    });
    return googleState.loaded;
  }

  // ปุ่ม Google ใช้ callback เดียวต่อหน้า — ตั้งใหม่ทุกครั้งก่อนวาดปุ่ม (หน้าเข้าสู่ระบบ / หน้าโปรไฟล์)
  const isDarkTheme = () => {
    const t = document.documentElement.dataset.theme;   // ธีมพิเศษ (data-skin) ใช้ฐานมืด
    return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  async function renderGoogleButton(container, callback, text = 'continue_with') {
    googleState.last = { container, callback, text };   // จำไว้วาดใหม่เมื่อเปลี่ยนธีม
    const g = await loadGoogleScript();
    g.accounts.id.initialize({
      client_id: googleState.clientId, callback, ux_mode: 'popup',
      auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true,
    });
    container.innerHTML = '';
    g.accounts.id.renderButton(container, {
      // ธีมมืด = ปุ่มสีเข้มของ Google (ไม่เป็นแถบขาวโดดบนพื้นมืด)
      theme: isDarkTheme() ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text, logo_alignment: 'left',
      width: Math.min(Math.max(container.clientWidth || 300, 200), 400), locale: 'th',
    });
  }

  async function initGoogleAuth() {
    try {
      const cfg = await api('/auth/config');
      googleState.clientId = cfg.googleClientId;
      applyPasswordRule(cfg.minPasswordLength);
    } catch (_) { googleState.clientId = null; }
    const box = document.getElementById('google-auth');
    if (!googleState.clientId) { box.classList.add('hidden'); return; } // ไม่ตั้งค่า = ระบบเดิมทำงานปกติ
    box.classList.remove('hidden');
    try {
      const onRegister = document.getElementById('tab-register').classList.contains('active');
      await renderGoogleButton(document.getElementById('google-btn'), onGoogleCredential, onRegister ? 'signup_with' : 'signin_with');
      googleState.ready = true;
    } catch (err) {
      document.getElementById('google-error').textContent = err.message;
    }
  }

  async function onGoogleCredential(resp) {
    const errEl = document.getElementById('google-error');
    const loading = document.getElementById('google-loading');
    errEl.textContent = '';
    loading.classList.remove('hidden');
    try {
      const { token, user, created } = await api('/auth/google', { method: 'POST', body: { credential: resp.credential } });
      onAuthSuccess(token, user);
      if (created) toast(`สร้างบัญชีใหม่แล้ว — ชื่อผู้ใช้ของคุณคือ ${user.username} (เปลี่ยนได้ในหน้าโปรไฟล์)`, 'success');
    } catch (err) {
      if (err.code === 'ACCOUNT_EXISTS') {
        // มีบัญชีอีเมลนี้อยู่แล้ว -> พาไปแท็บเข้าสู่ระบบ พร้อมบอกขั้นตอนเชื่อมบัญชี
        document.getElementById('tab-login').click();
        document.getElementById('login-error').textContent = err.message;
      } else {
        errEl.textContent = GOOGLE_ERRORS[err.code] || err.message;
      }
    } finally {
      loading.classList.add('hidden');
    }
  }

  async function renderProfileGoogle(overlay) {
    const box = overlay.querySelector('#profile-google');
    if (!googleState.clientId) {
      box.innerHTML = '<div class="profile-pic-hint">การเข้าสู่ระบบด้วย Google ยังไม่เปิดใช้</div>';
      return;
    }
    try {
      const { user } = await api('/auth/me');
      if (user.googleLinked) {
        box.innerHTML = `<div class="profile-google-linked">${ic('circle-check', 'icon-sm')} เชื่อมกับ Google แล้ว${user.googleEmail ? ` (${escapeHtml(user.googleEmail)})` : ''}</div>
          ${user.hasPassword ? '<button class="btn btn-secondary btn-block" id="profile-google-unlink">ยกเลิกการเชื่อม Google</button>'
            : '<div class="profile-pic-hint">บัญชีนี้เข้าสู่ระบบด้วย Google เท่านั้น — ตั้งรหัสผ่านผ่าน "ลืมรหัสผ่าน" ก่อนจึงจะยกเลิกการเชื่อมได้</div>'}
          <div class="form-error" id="profile-google-error" role="alert"></div>`;
        const un = box.querySelector('#profile-google-unlink');
        if (un) un.addEventListener('click', async () => {
          un.disabled = true;
          try { await api('/auth/google/link', { method: 'DELETE' }); toast('ยกเลิกการเชื่อม Google แล้ว', 'success'); renderProfileGoogle(overlay); }
          catch (err) { box.querySelector('#profile-google-error').textContent = err.message; un.disabled = false; }
        });
        return;
      }
      box.innerHTML = `<div class="profile-pic-hint">เชื่อมแล้วเข้าสู่ระบบด้วย Google ได้ — ความก้าวหน้าและ EXP อยู่ในบัญชีเดิม</div>
        <div class="google-btn-wrap" id="profile-google-btn"></div>
        <div class="form-error" id="profile-google-error" role="alert"></div>`;
      await renderGoogleButton(box.querySelector('#profile-google-btn'), async (resp) => {
        try {
          await api('/auth/google/link', { method: 'POST', body: { credential: resp.credential } });
          toast('เชื่อมบัญชี Google แล้ว', 'success');
          renderProfileGoogle(overlay);
        } catch (err) {
          box.querySelector('#profile-google-error').textContent = GOOGLE_ERRORS[err.code] || err.message;
        }
      });
    } catch (err) {
      box.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function logoutAllDevices(overlay) {
    const btn = overlay.querySelector('#profile-logout-all');
    btn.disabled = true;
    try {
      // เซิร์ฟเวอร์จะออก token ใหม่ให้เครื่องนี้ แล้วเพิกถอน token เก่าทั้งหมด
      const res = await api('/auth/logout-all', { method: 'POST' });
      if (res.token) {
        state.token = res.token;
        localStorage.setItem(TOKEN_KEY, res.token);
      }
      overlay.remove();
      toast('ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว', 'success');
    } catch (err) {
      toast(err.message || 'ทำรายการไม่สำเร็จ', 'error');
      btn.disabled = false;
    }
  }

  // ย่อรูปให้เป็น 256x256 (คง aspect ratio, crop กลาง) แล้วเข้ารหัส JPEG คุณภาพ 0.82
  // เพื่อไม่ให้ไฟล์บวมเกินไป (ปกติจะได้ ~30-70KB)
  function processAvatarImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.match(/^image\/(png|jpe?g|webp)$/)) {
        reject(new Error('รองรับเฉพาะไฟล์ PNG / JPG / WebP'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('รูปเสียหรือรูปแบบไม่ถูกต้อง'));
        img.onload = () => {
          const SIZE = 256;
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          // Crop กลางแบบ square
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          // ลองย่อคุณภาพลงเรื่อย ๆ ถ้ายังใหญ่เกินขีดจำกัด
          let quality = 0.82;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 140 * 1024 && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          if (dataUrl.length > 140 * 1024) {
            reject(new Error('รูปใหญ่เกินไปแม้ย่อแล้ว ลองใช้รูปอื่น'));
            return;
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarUpload(event, overlay) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const errEl = overlay.querySelector('#profile-pic-error');
    const uploadBtn = overlay.querySelector('#profile-pic-upload');
    errEl.textContent = '';
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'กำลังอัปโหลด...';
    try {
      const dataUrl = await processAvatarImage(file);
      const { user } = await api('/auth/avatar-image', {
        method: 'PATCH',
        body: { image: dataUrl },
      });
      state.user.avatarImage = user.avatarImage;
      renderHud();
      // อัพเดตการแสดงผลใน modal
      const preview = overlay.querySelector('#profile-pic-preview');
      preview.innerHTML = `<img src="${dataUrl}" alt="profile" />`;
      preview.classList.add('has-image');
      overlay.querySelector('#profile-pic-remove').classList.remove('hidden');
      toast('อัปโหลดรูปโปรไฟล์แล้ว!', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'อัปโหลดไม่สำเร็จ';
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = `${ic('camera', 'icon-sm')} อัปโหลดรูป`;
      event.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
    }
  }

  async function removeAvatarImage(overlay) {
    try {
      const { user } = await api('/auth/avatar-image', { method: 'DELETE' });
      state.user.avatarImage = user.avatarImage;
      renderHud();
      const preview = overlay.querySelector('#profile-pic-preview');
      preview.innerHTML = G.avatar(state.user.avatar);
      preview.classList.remove('has-image');
      overlay.querySelector('#profile-pic-remove').classList.add('hidden');
      toast('ลบรูปโปรไฟล์แล้ว', 'success');
    } catch (err) {
      toast(err.message || 'ลบไม่สำเร็จ', 'error');
    }
  }

  async function saveUsername(overlay) {
    const input = overlay.querySelector('#profile-username-input');
    const errEl = overlay.querySelector('#profile-username-error');
    const newUsername = input.value.trim();
    errEl.textContent = '';

    if (newUsername === state.user.username) return;

    try {
      const { user } = await api('/auth/username', { method: 'PATCH', body: { username: newUsername } });
      state.user.username = user.username;
      renderHud();
      toast('เปลี่ยนชื่อผู้ใช้แล้ว!', 'success');
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  async function selectAvatar(avatarId, overlay) {
    try {
      const { user } = await api('/auth/avatar', { method: 'PATCH', body: { avatar: avatarId } });
      state.user.avatar = user.avatar;
      renderHud();
      overlay.querySelectorAll('.avatar-option').forEach((b) => {
        b.classList.toggle('selected', b.dataset.avatarId === avatarId);
        b.setAttribute('aria-pressed', b.dataset.avatarId === avatarId ? 'true' : 'false');
      });
      toast('เปลี่ยนอวตารแล้ว!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function popExp(amount) {
    const hud = document.getElementById('hud-exp-wrap');
    const rect = hud.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'exp-pop';
    el.textContent = `+${amount} EXP`;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top}px`;
    el.style.fontSize = '0.85rem';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function showLevelUp(levelInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const colors = ['#ff6f3c', '#ffd166', '#4f9d69', '#4d6fa8', '#7c5cbf'];
    let confetti = '';
    for (let i = 0; i < 18; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.4;
      const color = colors[i % colors.length];
      confetti += `<div class="confetti-dash" style="left:${left}%;background:${color};animation-delay:${delay}s;"></div>`;
    }
    overlay.innerHTML = `
      <div class="modal-card">
        ${confetti}
        <div class="levelup-art">${G.mascot('celebration', 'mascot-lg')}<span class="levelup-num" aria-hidden="true">${levelInfo.level}</span></div>
        <h2>เลเวลอัป!</h2>
        <p>ยินดีด้วย ตอนนี้คุณคือเลเวล <strong>${levelInfo.level}</strong> แล้ว</p>
        <button class="btn btn-primary btn-block" style="margin-top:20px;" id="levelup-ok">เยี่ยมมาก ไปต่อ!</button>
      </div>`;
    document.body.appendChild(overlay);
    makeDialog(overlay, { label: `เลเวลอัป! เลเวล ${levelInfo.level}`, closeButton: false });
    overlay.querySelector('#levelup-ok').addEventListener('click', () => overlay.remove());
  }

  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // HOME screen — เมนูหลัก 2 อย่าง (เรียนแกรมม่า / เรียนคำศัพท์)
  // ---------------------------------------------------------------
  const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  // สีระดับชุดเดียวกับ LEVEL_META (เดิมมีสองชุดที่ไม่ตรงกัน) — เฉดเข้ม ตัวอักษรขาวผ่าน contrast 4.5:1
  const LEVEL_COLORS = Object.fromEntries(Object.entries(LEVEL_META).map(([k, v]) => [k, v.color]));
  let dashSummaryCache = null;

  /* ---------- คำทักทายหน้าหลัก: ตามช่วงเวลา / วันในสัปดาห์ / สุ่มจากชุดใหญ่ (ไม่ซ้ำกับครั้งก่อน) ----------
     มีทั้งไทยและอังกฤษ — ประโยคอังกฤษเป็นสำนวนทักทายจริงที่ผู้เรียนใช้ได้ (มีคำแปลในบรรทัดรอง) */
  const GREETINGS = {
    morning: [
      ['อรุณสวัสดิ์, {n}', 'เช้านี้เก็บศัพท์ใหม่สัก 10 คำไหม?'],
      ['Good morning, {n}!', 'อรุณสวัสดิ์ — สมองสดใสตอนเช้า จำศัพท์ได้ดีเป็นพิเศษ'],
      ['Rise and shine, {n}!', 'ตื่นมาลุยกัน — เริ่มวันด้วยบทเรียนสั้น ๆ'],
      ['เช้าวันใหม่ พร้อมเลเวลอัปไหม {n}', 'ทำต่อจากที่ค้างไว้ได้เลย'],
    ],
    afternoon: [
      ['สวัสดียามบ่าย, {n}', 'พักเบรกมาฝึกสักรอบ 5 นาทีก็พอ'],
      ['Good afternoon, {n}!', 'สวัสดีตอนบ่าย — มาต่อจากที่ค้างไว้กัน'],
      ['How\'s your day going, {n}?', 'วันนี้เป็นยังไงบ้าง — เติมพลังด้วยศัพท์ใหม่สักหน่อย'],
      ['บ่ายนี้ขอสักบทนะ {n}', 'เป้าหมายวันนี้ใกล้แล้ว'],
    ],
    evening: [
      ['สวัสดีตอนเย็น, {n}', 'ฝึกตอนเย็นช่วยให้จำได้นานขึ้น'],
      ['Good evening, {n}!', 'สวัสดีตอนเย็น — ปิดท้ายวันด้วยบทเรียนสั้น ๆ'],
      ['Welcome home, {n}!', 'กลับมาแล้ว — มาฝึกสักรอบก่อนพักผ่อน'],
      ['เย็นนี้ลุยแรงค์สักตาไหม {n}', 'หรือเรียนต่ออีกสักหน่วยก่อนก็ได้'],
    ],
    night: [
      ['ดึกแล้วนะ {n}', 'ฝึกสั้น ๆ แล้วพักผ่อน — การนอนช่วยให้สมองจำศัพท์'],
      ['Night owl mode, {n}?', 'โหมดนกฮูก — ฝึกเบา ๆ ก่อนนอนก็พอ'],
      ['Sweet dreams soon, {n}', 'อีกนิดก่อนนอน แล้วฝันดีนะ'],
    ],
    any: [
      ['ยินดีต้อนรับกลับมา, {n}', 'พร้อมสำหรับบทเรียนวันนี้หรือยัง?'],
      ['Welcome back, {n}!', 'ยินดีต้อนรับกลับมา — คิดถึงนะ'],
      ['Hey {n}, ready to learn?', 'พร้อมเรียนหรือยัง? มาเริ่มกันเลย'],
      ['{n} มาแล้ว! วันนี้ลุยอะไรดี', 'คำศัพท์ แกรมม่า หรือแรงค์ — เลือกได้เลย'],
      ['Let\'s level up, {n}!', 'มาอัปเลเวลกัน — ทีละนิดก็ไปได้ไกล'],
      ['Nice to see you, {n}!', 'ดีใจที่ได้เจอกันอีก'],
      ['Keep it up, {n}!', 'ทำต่อไปนะ — ความสม่ำเสมอชนะทุกอย่าง'],
      ['Every word counts, {n}', 'ทุกคำที่จำได้ คือก้าวที่เดินหน้า'],
      ['Practice makes progress, {n}', 'ฝึกบ่อย ๆ แล้วจะเก่งขึ้นเรื่อย ๆ'],
      ['พร้อมเก็บ EXP หรือยัง {n}', 'ตอบถูกคำใหม่ได้ EXP เต็ม'],
      ['Small steps, big wins, {n}!', 'ก้าวเล็ก ๆ ทุกวัน = ชัยชนะใหญ่'],
      ['You\'ve got this, {n}!', 'คุณทำได้ — เริ่มจากบทสั้น ๆ ก่อน'],
    ],
    monday: [['Happy Monday, {n}!', 'เริ่มสัปดาห์ใหม่ด้วยศัพท์ใหม่สักชุด']],
    friday: [['Happy Friday, {n}!', 'ศุกร์แล้ว! ปิดสัปดาห์ด้วยแรงค์สักตาไหม']],
    weekend: [['Happy weekend, {n}!', 'สุดสัปดาห์ชิล ๆ — เรียนสบาย ๆ ตามจังหวะตัวเอง'], ['วันหยุดก็ไม่หยุดเก่งนะ {n}', 'ทบทวนสั้น ๆ ให้ความจำยังสดใหม่']],
  };
  function pickGreeting(name) {
    const now = new Date();
    const h = now.getHours(); const day = now.getDay();
    const part = h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
    const pool = [...GREETINGS[part], ...GREETINGS[part], ...GREETINGS.any];   // ช่วงเวลามีน้ำหนักมากกว่า
    if (day === 1) pool.push(...GREETINGS.monday);
    if (day === 5) pool.push(...GREETINGS.friday);
    if (day === 0 || day === 6) pool.push(...GREETINGS.weekend);
    let last = null;
    try { last = sessionStorage.getItem('eq_greet'); } catch (_) { /* - */ }
    // เปิดหน้าหลักซ้ำในรอบเดียวกัน = คำทักทายเดิม (ไม่กระพริบเปลี่ยนทุกครั้งที่กดกลับหน้าหลัก)
    if (last) { const [t, sub] = last.split('\u0001'); if (t && pool.some(([x]) => x === t)) return { title: t.replace('{n}', name), sub }; }
    const [t, sub] = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem('eq_greet', `${t}\u0001${sub}`); } catch (_) { /* - */ }
    return { title: t.replace('{n}', name), sub };
  }

  function openHome() {
    showScreen('screen-home');
    const greetEl = document.getElementById('home-greeting');
    if (greetEl && state.user) {
      const g = pickGreeting(state.user.username);
      greetEl.textContent = g.title;
      const sub = document.querySelector('#screen-home .home-hero-sub');
      if (sub) sub.textContent = g.sub;
      renderVerifyBanner();
    }
    renderDashboard();
  }

  function renderDashboard() {
    if (!state.user) return;

    // วงแหวนเลเวล + EXP
    const lv = state.user.level || 1;
    const into = state.user.expIntoLevel || 0;
    const need = state.user.expForNextLevel || 1;
    const pct = Math.max(0, Math.min(100, state.user.progressPercent || 0));

    const numEl = document.getElementById('dash-lv-num');
    if (numEl) numEl.textContent = lv;
    const expEl = document.getElementById('dash-hero-exp');
    if (expEl) expEl.textContent = `${into} / ${need} EXP`;
    const nextEl = document.getElementById('dash-hero-next');
    if (nextEl) nextEl.textContent = `อีก ${Math.max(0, need - into)} EXP ถึงเลเวลถัดไป`;

    const ring = document.getElementById('dash-ring-fill');
    if (ring) {
      const circ = 2 * Math.PI * 31; // r=31
      ring.style.strokeDasharray = `${circ}`;
      ring.style.strokeDashoffset = `${circ * (1 - pct / 100)}`;
    }

    // เพื่อน
    const friendsStat = document.getElementById('dash-stat-friends');
    if (friendsStat) friendsStat.innerHTML = `${ic('users', 'icon-sm')} ${friendState.friends.length} เพื่อน`;

    // โหลดสรุปความก้าวหน้าคำศัพท์ แล้วค่อยหา Unit ถัดไป
    // (ต้องต่อกันตามลำดับ — ทั้งคู่ตั้งเป้าหมายปุ่ม "เรียนต่อ" ถ้าเสร็จสลับกัน Unit จะถูกทับ)
    loadDashProgress().then(loadDashNextUnit);
    // เป้าหมายวันนี้ + ความแม่นยำ + คำที่ถึงกำหนด (คำขอเดียว)
    loadHomeSummary();
    // โหลดความแม่นยำ (mastery) + จุดที่ต้องแก้
    loadDashMistakes();

    // ผลแบบทดสอบวัดระดับล่าสุด
    loadDashPlacement();

    // การ์ดผู้ดูแล — แสดงเฉพาะ admin (ซ่อนแค่ในหน้าเว็บ สิทธิ์จริงตรวจที่เซิร์ฟเวอร์)
    const adminCard = document.getElementById('dash-admin');
    adminCard.classList.toggle('hidden', !isAdmin());
    if (isAdmin()) loadAdminStats();
  }

  let mistakesTarget = null;
  async function loadDashMistakes() {
    const card = document.getElementById('dash-mistakes');
    try {
      const { count, suggestedLevel } = await api('/mistakes/practice-session');
      if (!count || count === 0) {
        card.classList.add('hidden');
        mistakesTarget = null;
        return;
      }
      mistakesTarget = suggestedLevel;
      document.getElementById('dash-mistakes-count').textContent = `${count} คำ`;
      card.classList.remove('hidden');
    } catch (_err) {
      card.classList.add('hidden');
    }
  }

  document.getElementById('dash-mistakes').addEventListener('click', () => {
    if (mistakesTarget) startSession(mistakesTarget);
  });

  // ---------- Home: เป้าหมายวันนี้ + ความแม่นยำ (Mastery แยกจาก EXP) ----------
  let homeSummaryCache = null;
  async function loadHomeSummary() {
    const box = document.getElementById('home-mastery');
    try {
      const d = await api('/progress/home');
      homeSummaryCache = d;
      const done = d.today.answers;
      const goal = d.today.goal;
      document.getElementById('goal-done').textContent = String(done);
      document.getElementById('goal-target').textContent = String(goal);
      document.getElementById('goal-bar').style.width = `${Math.min(100, Math.round((done / goal) * 100))}%`;
      const wrap = document.getElementById('goal-bar-wrap');
      wrap.setAttribute('aria-valuemax', String(goal)); wrap.setAttribute('aria-valuenow', String(Math.min(done, goal)));
      document.getElementById('goal-sub').textContent = done >= goal
        ? `ครบเป้าหมายแล้ว! ตอบถูก ${d.today.correct} จาก ${done} ข้อ`
        : `อีก ${goal - done} ข้อถึงเป้าหมาย — นับทั้งคำศัพท์และแกรมม่า`;
      document.getElementById('home-words-known').textContent = String(d.words.known);
      const rows = [['คำศัพท์', d.mastery.vocab], ['แกรมม่า', d.mastery.grammar], ['การฟัง', d.mastery.listening], ['รวมทุกทักษะ', d.mastery.overall]];
      box.innerHTML = rows.map(([label, m]) => `
        <div class="mastery-row">
          <span class="mastery-label">${label}</span>
          ${m.accuracy === null
            ? `<span class="mastery-na">ยังไม่พอประเมิน · ตอบอีก ${m.needed} ข้อ</span>`
            : `<span class="home-progress" aria-hidden="true"><span style="width:${m.accuracy}%"></span></span><b class="mastery-pct">${m.accuracy}%</b>`}
        </div>`).join('');
      renderMascot(d);
    } catch (err) {
      box.innerHTML = `<div class="state-error">โหลดไม่สำเร็จ <button class="mini-btn ghost" type="button" id="home-mastery-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('home-mastery-retry').addEventListener('click', loadHomeSummary);
    }
  }


  // ---------- Mascot: ข้อความเดียวที่มีประโยชน์ที่สุดตอนนี้ (Supporting character — ไม่แย่งความสนใจจากเนื้อหา) ----------
  // ข้อความเชิงข้อมูล (ความแม่นยำดีขึ้น / คำที่ผิดบ่อย) แสดงได้วันละครั้งต่อแบบ — ไม่รบกวน
  const MASCOT_SEEN_KEY = 'eq_mascot_seen';
  function mascotSeenToday(kind) {
    try { return (JSON.parse(localStorage.getItem(MASCOT_SEEN_KEY) || '{}')[kind]) === new Date().toDateString(); } catch (_) { return false; }
  }
  function markMascotSeen(kind) {
    try {
      const m = JSON.parse(localStorage.getItem(MASCOT_SEEN_KEY) || '{}');
      m[kind] = new Date().toDateString();
      localStorage.setItem(MASCOT_SEEN_KEY, JSON.stringify(m));
    } catch (_) { /* ignore */ }
  }
  function renderMascot(d) {
    const el = document.getElementById('home-mascot');
    if (!el) return;
    const acc = (d.insights && d.insights.accuracy) || {};
    const miss = d.insights && d.insights.topMistake;
    const candidates = [
      // 1) ความแม่นยำดีขึ้นอย่างน้อย 3 จุด (เทียบ 7 วันก่อนหน้า) — ฉลองความก้าวหน้า
      acc.recent !== null && acc.previous !== null && acc.recent - acc.previous >= 3 && {
        kind: 'accuracy', mood: 'celebration', text: `ความแม่นยำเพิ่มจาก ${acc.previous}% เป็น ${acc.recent}% ในสัปดาห์นี้ เก่งมาก!` },
      // 3) คำที่ตอบผิดบ่อย
      miss && { kind: 'mistake', mood: 'thinking', text: `คำว่า “${miss.word}” ยังตอบผิดบ่อย ลองทบทวนอีกครั้งไหม?`, action: { label: 'ดูคำนี้', id: miss.wordId } },
      d.today.answers >= d.today.goal && { kind: 'goal', mood: 'success', repeat: true, text: 'ครบเป้าหมายวันนี้แล้ว เก่งมาก!' },
      d.today.answers === 0 && d.words.known === 0 && { kind: 'start', mood: 'welcome', repeat: true, text: 'เริ่มจากหน่วยแรกได้เลย — วันละนิดก็พอ' },
    ].filter(Boolean);
    const pick = candidates.find((c) => c.repeat || !mascotSeenToday(c.kind));
    const wrap = document.getElementById('home-mascot-wrap');
    if (!pick) { el.textContent = ''; if (wrap) wrap.classList.add('hidden'); return; }
    if (!pick.repeat) markMascotSeen(pick.kind);
    if (wrap) wrap.classList.remove('hidden');
    const fox = document.getElementById('home-mascot-fox');
    if (fox) fox.innerHTML = G.mascot(pick.mood || 'normal');
    el.innerHTML = `${escapeHtml(pick.text)}${pick.action
      ? ` <button class="link-btn mascot-action" type="button" data-mascot-word="${escapeHtml(pick.action.id)}">${escapeHtml(pick.action.label)}</button>` : ''}`;
  }
  document.getElementById('home-mascot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mascot-word]');
    if (b) openVocabCard(b.dataset.mascotWord);
  });

  // ---------- หน้า "เล่น" (Battle / เพื่อน / อันดับ) ----------
  function openPlay() {
    showScreen('screen-play');
    if (window.EQRanked) window.EQRanked.playCard();
    if (rt.onlineCount !== null && rt.onlineCount !== undefined) setOnlineCount(rt.onlineCount);
  }

  // ---------- หน้า "โปรไฟล์" (EXP/เลเวล + บัญชี + ออกจากระบบ) ----------
  function openProfile() {
    showScreen('screen-profile');
    const u = state.user;
    if (!u) return;
    document.getElementById('profile-name').textContent = u.username;
    document.getElementById('profile-level').textContent = `เลเวล ${u.level || 1}`;
    const av = document.getElementById('profile-avatar-lg');
    // ใช้ตัวแปลงเดียวกับ header — u.avatar เป็นรหัส (เช่น 'tiger') ไม่ใช่ emoji
    av.innerHTML = G.avatar(u.avatar, u.avatarImage || null);
    const into = u.expIntoLevel || 0; const need = u.expForNextLevel || 1;
    document.getElementById('profile-exp').textContent = `${into} / ${need}`;
    document.getElementById('profile-exp-bar').style.width = `${Math.max(0, Math.min(100, u.progressPercent || 0))}%`;
    document.getElementById('profile-admin').classList.toggle('hidden', !isAdmin());
  }
  on('profile-edit', 'click', () => showProfileModal());

  // ---------- ธีม: ตามระบบ / สว่าง / มืด / พาสเทล + ธีมพิเศษที่ได้จากกิจกรรม (จำค่าไว้ + บันทึกในบัญชี) ----------
  // ธีมพิเศษ = ธีมมืดเป็นฐาน (data-theme="dark") + ชั้นสีของธีม (data-skin) — สิทธิ์ใช้ตรวจที่เซิร์ฟเวอร์ (/api/themes)
  const FREE_THEMES = ['system', 'light', 'dark', 'cute'];
  const PREMIUM_SKINS = { 'halloween-2026': { skin: 'halloween', meta: '#140F24' } };
  const themeState = { owned: [], premium: [], loaded: false };
  function currentThemeChoice() {
    try {
      const t = localStorage.getItem('eq_theme');
      return FREE_THEMES.includes(t) || PREMIUM_SKINS[t] ? t : 'system';
    } catch (_) { return 'system'; }
  }
  function applyTheme(choice, { save = false, celebrate = false } = {}) {
    if (!FREE_THEMES.includes(choice) && !PREMIUM_SKINS[choice]) choice = 'system';
    const prem = PREMIUM_SKINS[choice];
    const root = document.documentElement;
    if (prem) { root.dataset.theme = 'dark'; root.dataset.skin = prem.skin; } else {
      delete root.dataset.skin;
      if (choice === 'system') delete root.dataset.theme; else root.dataset.theme = choice;
    }
    try { if (choice === 'system') localStorage.removeItem('eq_theme'); else localStorage.setItem('eq_theme', choice); } catch (_) { /* ignore */ }
    const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]').setAttribute('content',
      prem ? prem.meta : dark ? '#12141F' : choice === 'cute' ? '#FFF4F8' : '#F6F7FB');
    // ปุ่ม Google วาดใน iframe ของ Google -> ต้องวาดใหม่ให้ตรงธีม
    if (googleState.ready && googleState.last && document.contains(googleState.last.container)) {
      const { container, callback, text } = googleState.last;
      renderGoogleButton(container, callback, text).catch(() => {});
    }
    document.querySelectorAll('[data-theme-choice]').forEach((b) => {
      const on = b.dataset.themeChoice === choice;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
    });
    renderPremiumThemes();
    // เปิดธีมพิเศษเอง -> แอนิเมชันต้อนรับ (ธีมจัดการตกแต่ง/เอฟเฟกต์ใน public/js/halloween-fx.js)
    if (celebrate && prem && window.EQHalloweenFx) window.EQHalloweenFx.celebrate();
    if (save && state.token) {
      api('/themes/current', { method: 'PUT', body: { theme: choice } }).catch((err) => {
        if (err && err.code === 'THEME_LOCKED') { applyTheme('system'); toast('ยังไม่ได้ปลดล็อกธีมนี้', 'error'); }
      });
    }
  }
  /** ดึงคลังธีมของบัญชี: ธีมที่บันทึกไว้ในบัญชีมาก่อน (ใช้ได้ทุกเครื่องหลังล็อกอินใหม่) · ธีมพิเศษที่ไม่ได้เป็นเจ้าของ -> กลับเป็นตามระบบ */
  async function syncThemes() {
    if (!state.token) return;
    try {
      const r = await api('/themes');
      themeState.owned = r.owned || []; themeState.premium = r.premium || []; themeState.loaded = true;
      const local = currentThemeChoice();
      if (r.current && r.current !== local) applyTheme(r.current);
      else if (PREMIUM_SKINS[local] && !themeState.owned.includes(local)) applyTheme('system');
      else renderPremiumThemes();
    } catch (_) { /* ออฟไลน์: ใช้ค่าที่จำไว้ในเครื่อง */ }
  }
  function renderPremiumThemes() {
    const box = document.getElementById('theme-premium');
    if (!box) return;
    if (!themeState.loaded || !themeState.premium.length) { box.innerHTML = ''; return; }
    const cur = currentThemeChoice();
    box.innerHTML = `<p class="theme-premium-title">ธีมพิเศษ</p>` + themeState.premium.map((t) => {
      const owned = themeState.owned.includes(t.id);
      const on = cur === t.id;
      const action = on
        ? '<span class="theme-prem-state"><svg class="icon icon-sm" aria-hidden="true"><use href="/assets/icons/icons.svg#check"></use></svg> กำลังใช้</span>'
        : owned
          ? `<button class="mini-btn" type="button" data-theme-use="${escapeHtml(t.id)}">ใช้ธีมนี้</button>`
          : `<button class="mini-btn ghost" type="button" data-theme-locked="${escapeHtml(t.id)}"><svg class="icon icon-sm" aria-hidden="true"><use href="/assets/icons/icons.svg#lock"></use></svg> วิธีปลดล็อก</button>`;
      return `<div class="theme-prem ${owned ? '' : 'locked'} ${on ? 'on' : ''}">
        <span class="theme-prem-swatch skin-${escapeHtml(t.css)}" aria-hidden="true"></span>
        <span class="theme-prem-text"><b>${escapeHtml(t.name)}</b><small>${owned ? 'ธีมถาวรในคลังของคุณ' : 'รางวัลจากกิจกรรม'}</small></span>
        ${action}</div>`;
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const use = e.target.closest('[data-theme-use]');
    if (use) { applyTheme(use.dataset.themeUse, { save: true, celebrate: true }); toast('เปลี่ยนธีมแล้ว', 'success'); return; }
    const lk = e.target.closest('[data-theme-locked]');
    if (lk && window.EQEvent) window.EQEvent.explainLocked(lk.dataset.themeLocked);
  });
  document.querySelector('.theme-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-choice]');
    if (b) applyTheme(b.dataset.themeChoice, { save: true });
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(currentThemeChoice()));
  applyTheme(currentThemeChoice());
  on('profile-admin', 'click', () => navigateTo('admin'));


  async function loadDashProgress() {
    const wrap = document.getElementById('dash-progress');
    try {
      const { summary } = await api('/progress/summary');
      dashSummaryCache = summary;

      let totalKnown = 0;
      let firstIncomplete = null;
      const rows = CEFR_LEVELS.map((lvl) => {
        const s = summary[lvl] || { known: 0, learning: 0, total: 0 };
        totalKnown += s.known;
        const total = s.total || 0;
        const pct = total ? Math.round((s.known / total) * 100) : 0;
        if (!firstIncomplete && pct < 100) firstIncomplete = lvl;
        return { lvl, known: s.known, total, pct };
      });

      // สถิติคำที่รู้แล้วรวม
      const wordsStat = document.getElementById('dash-stat-words');
      if (wordsStat) wordsStat.innerHTML = `${ic('book', 'icon-sm')} ${totalKnown} คำ`;

      // ปุ่มเรียนต่อ: ชี้ไประดับแรกที่ยังไม่ครบ
      const contDetail = document.getElementById('dash-continue-detail');
      const target = firstIncomplete || 'C1';
      if (contDetail) {
        contDetail.textContent = firstIncomplete
          ? `เรียนคำศัพท์ ${target} ต่อ`
          : 'ทบทวนคำศัพท์ หรือลองแกรมม่า';
      }
      dashContinueTarget = firstIncomplete ? { type: 'vocab', level: target } : { type: 'grammar' };

      wrap.innerHTML = rows.map((r) => `
        <div class="dash-level-row" data-level="${r.lvl}">
          ${G.emblem(r.lvl, { size: 'xs' })}
          <div class="dash-level-bar">
            <div class="dash-level-fill" style="width:${r.pct}%;background:${LEVEL_COLORS[r.lvl]}"></div>
          </div>
          <div class="dash-level-count">${r.known}/${r.total}</div>
        </div>
      `).join('');
    } catch (_err) {
      wrap.innerHTML = '<div class="dash-progress-loading">โหลดความคืบหน้าไม่สำเร็จ</div>';
    }
  }

  let dashContinueTarget = { type: 'vocab', level: 'A1' };

  // Unit ถัดไปจาก Learning Path (ถ้ามี) — ใช้แทนเป้าหมายแบบระดับ
  async function loadDashNextUnit() {
    try {
      const { next, levels } = await api('/path');
      if (!next) return;
      // next ไม่มีจำนวนคำ — หา Unit ตัวเดียวกันในรายการระดับ (มี known/total)
      const unit = (levels || []).flatMap((l) => l.units || []).find((u) => u.id === next.id) || {};
      next.known = unit.known; next.total = unit.total;
      dashContinueTarget = { type: 'unit', unitId: next.id, level: next.level };
      document.getElementById('dash-continue-detail').innerHTML = `<span class="cont-meta">${G.emblem(next.level, { size: 'xs' })}<span>${escapeHtml(next.level)} · ${ic(G.iconName(next.icon), 'icon-sm')}</span></span><span class="cont-title">${escapeHtml(next.title)}</span>`;
      const total = next.total || 0;
      const pct = total ? Math.round(((next.known || 0) / total) * 100) : 0;
      document.getElementById('dash-continue-bar').style.width = `${pct}%`;
      document.getElementById('dash-continue-pct').textContent = total ? `ความคืบหน้า ${pct}% · รู้แล้ว ${next.known || 0}/${total} คำ` : '';
    } catch (_err) { /* ใช้เป้าหมายแบบเดิม */ }
  }

  // ปุ่มเรียนต่อ
  document.getElementById('dash-continue').addEventListener('click', () => {
    if (dashContinueTarget.type === 'unit') {
      startUnit(dashContinueTarget.unitId);
      return;
    }
    if (dashContinueTarget.type === 'grammar') {
      openGrammarList();
    } else {
      showScreen('screen-map');
      loadMap();
    }
  });

  // คลิกแถวระดับ -> ไปหน้าคำศัพท์
  document.getElementById('dash-progress').addEventListener('click', (e) => {
    const row = e.target.closest('.dash-level-row');
    if (!row) return;
    showScreen('screen-map');
    loadMap();
  });

  document.getElementById('home-btn-grammar').addEventListener('click', () => {
    openGrammarList();
  });
  on('home-btn-words', 'click', () => navigateTo('words'));
  document.getElementById('btn-map-back').addEventListener('click', openHome);
  on('home-btn-friends', 'click', openFriends);

  // ---------------------------------------------------------------
  // REALTIME — เชื่อมต่อ WebSocket เพื่อดูว่าใครออนไลน์
  // ---------------------------------------------------------------
  const rt = {
    socket: null,
    onlineCount: 0,
    onlineIds: new Set(),
    retryDelay: 1000,   // เริ่มลองใหม่หลัง 1 วินาที แล้วค่อย ๆ ถ่างออก
    retryTimer: null,
    manuallyClosed: false,
    failures: 0,        // ล้มเหลวติดกันกี่ครั้ง (ยังไม่เคยเปิดได้)
    giveUp: false,      // token ใช้ไม่ได้ -> หยุดลองใหม่
    slowTimer: null,
  };
  const RT_OFFLINE_AFTER = 2;     // ล้มเหลวติดกันเท่านี้ = แสดงสถานะออฟไลน์ (ไม่ใช่ "กำลังเชื่อมต่อ" ตลอดไป)
  const RT_SLOW_MS = 8000;        // เชื่อมครั้งแรกเกินเท่านี้ = แสดงออฟไลน์พร้อมปุ่มลองใหม่
  function rtConnect() {
    if (!state.token) return;
    if (rt.socket && (rt.socket.readyState === WebSocket.OPEN
      || rt.socket.readyState === WebSocket.CONNECTING)) return;
    rt.manuallyClosed = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(state.token)}`;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (_err) {
      scheduleReconnect();
      return;
    }
    rt.socket = socket;
    clearTimeout(rt.slowTimer);
    rt.slowTimer = setTimeout(() => { if (!rt.socket || rt.socket.readyState !== WebSocket.OPEN) renderRealtimeOffline(); }, RT_SLOW_MS);
    let opened = false;
    // ระหว่าง Ranked Match: ต่อไม่ติดใน 4 วินาที (เช่นเน็ตเพิ่งกลับมา socket ค้าง CONNECTING) -> ปิดแล้วลองใหม่ทันที
    if (rt.fast) setTimeout(() => { if (!opened && rt.socket === socket) { try { socket.close(); } catch (_e) { /* - */ } } }, 4000);
    socket.onopen = () => {
      opened = true;
      rt.retryDelay = 1000; // เชื่อมได้แล้ว รีเซ็ตเวลารอ
      rt.failures = 0;
      clearTimeout(rt.slowTimer);
      socket.send(JSON.stringify({ type: 'presence:who' }));
      window.dispatchEvent(new CustomEvent('eq:rt', { detail: { connected: true } }));
    };
    socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_e) { return; }
      handleRealtimeMessage(msg);
    };
    socket.onclose = () => {
      rt.socket = null;
      if (!opened) rt.failures += 1;
      if (rt.manuallyClosed) return;
      if (opened) window.dispatchEvent(new CustomEvent('eq:rt', { detail: { connected: false } }));
      if (rt.failures >= RT_OFFLINE_AFTER) {
        renderRealtimeOffline();
        // ล้มเหลวซ้ำ: ตรวจว่า token ยังใช้ได้ไหม (เซิร์ฟเวอร์ปฏิเสธ WebSocket ด้วย 401 ตอน handshake
        // ซึ่งเบราว์เซอร์แยกไม่ออกจากเน็ตหลุด) — ถ้าหมดอายุ หยุดลองใหม่แทนการยิงทุก 30 วินาทีไปตลอด
        if (rt.failures === RT_OFFLINE_AFTER) {
          api('/auth/me').catch((err) => { if (err.status === 401) { rt.giveUp = true; renderRealtimeOffline(); } });
        }
      } else {
        setOnlineCount(null); // หลุดครั้งแรก — กำลังเชื่อมต่อใหม่
      }
      if (!rt.giveUp) scheduleReconnect();
    };
    socket.onerror = () => {
      try { socket.close(); } catch (_e) { /* ปิดไปแล้ว */ }
    };
  }
  function scheduleReconnect() {
    if (rt.retryTimer) return;
    rt.retryTimer = setTimeout(() => {
      rt.retryTimer = null;
      rtConnect();
    }, rt.retryDelay);
    // ถ่างเวลารอออกไปเรื่อย ๆ สูงสุด 30 วินาที กันยิงถี่ตอนเซิร์ฟเวอร์ล่ม
    // ระหว่าง Ranked Match: ลองใหม่ทุก ≤ 2 วินาที (ต้องกลับเข้าเกมให้ทันช่วง grace 30 วินาที)
    rt.retryDelay = Math.min(rt.retryDelay * 1.8, rt.fast ? 2000 : 30000);
  }
  function rtSetFast(on) {
    rt.fast = Boolean(on);
    if (on) rt.retryDelay = Math.min(rt.retryDelay, 1000);
    if (on && !rt.socket && rt.retryTimer && !rt.giveUp) { clearTimeout(rt.retryTimer); rt.retryTimer = null; rtConnect(); }
  }
  // เน็ตกลับมา -> ต่อ WebSocket ใหม่ทันที (ไม่ต้องรอรอบถัดไป)
  window.addEventListener('online', () => {
    if (!state.token || rt.giveUp) return;
    if (rt.socket && rt.socket.readyState === 1) return;
    if (rt.socket) { const old = rt.socket; rt.socket = null; old.onclose = null; try { old.close(); } catch (_e) { /* - */ } }
    clearTimeout(rt.retryTimer); rt.retryTimer = null; rt.retryDelay = 1000; rtConnect();
  });
  // สถานะออฟไลน์ที่ชัดเจน + ให้ผู้ใช้กดลองใหม่เองได้ (ห้ามค้าง "กำลังเชื่อมต่อ…" ตลอดเวลา)
  function renderRealtimeOffline() {
    const textEl = document.getElementById('online-count-text');
    const badgeEl = document.getElementById('online-badge');
    if (!badgeEl || !textEl) return;
    badgeEl.classList.add('offline');
    badgeEl.setAttribute('role', 'button');
    badgeEl.setAttribute('tabindex', '0');
    textEl.textContent = rt.giveUp ? 'ไม่ได้เชื่อมต่อ' : 'ไม่สามารถเชื่อมต่อได้ · แตะเพื่อลองใหม่';
  }
  function rtRetryNow() {
    if (rt.giveUp || (rt.socket && rt.socket.readyState === WebSocket.OPEN)) return;
    if (rt.retryTimer) { clearTimeout(rt.retryTimer); rt.retryTimer = null; }
    rt.retryDelay = 1000;
    setOnlineCount(null);
    rtConnect();
  }
  document.getElementById('online-badge').addEventListener('click', rtRetryNow);
  document.getElementById('online-badge').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rtRetryNow(); }
  });
  function rtDisconnect() {
    rt.manuallyClosed = true;
    clearTimeout(rt.slowTimer);
    rt.failures = 0;
    rt.giveUp = false;
    if (rt.retryTimer) { clearTimeout(rt.retryTimer); rt.retryTimer = null; }
    if (rt.socket) { try { rt.socket.close(); } catch (_e) { /* ปิดไปแล้ว */ } }
    rt.socket = null;
    rt.onlineIds.clear();
  }
  function handleRealtimeMessage(msg) {
    // Ranked Quest (PvP) — โมดูล public/js/ranked.js
    if (typeof msg.type === 'string' && msg.type.startsWith('ranked:')) {
      if (window.EQRanked) window.EQRanked.onMessage(msg);
      return;
    }
    // ข้อความของระบบห้องแข่งให้โมดูลนั้นจัดการก่อน
    if (typeof msg.type === 'string' && msg.type.startsWith('room:')) {
      if (handleRoomMessage(msg)) return;
    }
    switch (msg.type) {
      case 'connected':
        setOnlineCount(msg.onlineCount);
        break;

      case 'presence:count':
        setOnlineCount(msg.count);
        break;

      case 'presence:list':
        rt.onlineIds = new Set(msg.userIds || []);
        setOnlineCount(msg.count);
        if (currentScreenIs('screen-friends')) renderFriendsScreen();
        if (chatState.peer) renderPeer();
        break;

      case 'friend:presence':
        if (msg.online) rt.onlineIds.add(msg.userId);
        else rt.onlineIds.delete(msg.userId);
        if (currentScreenIs('screen-friends')) renderFriendsScreen();
        if (chatState.peer && chatState.peer.id === msg.userId) renderPeer();
        break;

      case 'friend:request':
        toast('มีคำขอเป็นเพื่อนใหม่!', 'success');
        loadFriendData();
        break;

      case 'friend:accepted':
        toast('มีคนตอบรับคำขอเป็นเพื่อนของคุณแล้ว', 'success');
        loadFriendData();
        break;

      case 'friend:removed':
        loadFriendData();
        break;

      case 'chat:message':
        onChatMessage(msg);
        break;

      case 'chat:read':
        onChatRead(msg);
        break;

      default:
        break;
    }
  }

  function currentScreenIs(id) {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  }

  function setOnlineCount(count) {
    rt.onlineCount = count;
    const textEl = document.getElementById('online-count-text');
    const badgeEl = document.getElementById('online-badge');
    const friendsBadge = document.getElementById('friends-online-badge');

    if (count === null || count === undefined) {
      if (textEl) textEl.textContent = 'กำลังเชื่อมต่อ…';
      if (badgeEl) badgeEl.classList.add('offline');
      return;
    }
    if (badgeEl) {
      badgeEl.classList.remove('offline');
      badgeEl.removeAttribute('role');
      badgeEl.removeAttribute('tabindex');
    }
    if (textEl) {
      textEl.textContent = count === 1
        ? 'มีคุณคนเดียวที่ออนไลน์อยู่'
        : `กำลังใช้งานอยู่ ${count} คน`;
    }
    if (friendsBadge) friendsBadge.textContent = `ออนไลน์ ${count} คน`;
  }


  // ---------------------------------------------------------------
  // BATTLE ROOM — ห้องแข่งคำศัพท์
  // ---------------------------------------------------------------
  const battle = {
    room: null,
    level: 'A1',
    count: 10,
    myScore: 0,
    answered: false,
    timerRAF: null,
    questionEndsAt: 0,
  };

  function rtSend(type, payload = {}) {
    if (!rt.socket || rt.socket.readyState !== WebSocket.OPEN) {
      toast('ยังไม่ได้เชื่อมต่อ กำลังลองใหม่…', 'error');
      rtConnect();
      return false;
    }
    rt.socket.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  document.getElementById('home-btn-battle').addEventListener('click', () => {
    document.getElementById('battle-error').textContent = '';
    showScreen('screen-battle-home');
  });
  document.getElementById('btn-battle-back').addEventListener('click', openHome);

  document.getElementById('battle-level-picker').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-level]');
    if (!chip) return;
    document.querySelectorAll('#battle-level-picker .level-chip')
      .forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    battle.level = chip.dataset.level;
  });
  document.getElementById('battle-count-picker').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-count]');
    if (!chip) return;
    document.querySelectorAll('#battle-count-picker .level-chip')
      .forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    battle.count = Number(chip.dataset.count);
  });

  document.getElementById('btn-create-room').addEventListener('click', () => {
    rtSend('room:create', { level: battle.level, questionCount: battle.count });
  });

  document.getElementById('btn-join-room').addEventListener('click', joinByCode);
  document.getElementById('join-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); joinByCode(); }
  });

  function joinByCode() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    const errEl = document.getElementById('battle-error');
    errEl.textContent = '';
    if (code.length !== 6) {
      errEl.textContent = 'รหัสห้องต้องมี 6 ตัวอักษร';
      return;
    }
    rtSend('room:join', { code });
  }

  document.getElementById('btn-lobby-leave').addEventListener('click', () => {
    rtSend('room:leave');
    battle.room = null;
    openHome();
  });

  document.getElementById('btn-ready').addEventListener('click', () => {
    const me = battle.room && battle.room.players.find((p) => state.user && p.id === state.user.id);
    rtSend('room:ready', { ready: !(me && me.ready) });
  });
  document.getElementById('btn-start-battle').addEventListener('click', () => {
    rtSend('room:start');
  });

  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    const code = battle.room ? battle.room.code : '';
    try {
      await navigator.clipboard.writeText(code);
      toast('คัดลอกรหัสแล้ว', 'success');
    } catch (_err) {
      toast(`รหัสห้อง: ${code}`);
    }
  });

  document.getElementById('btn-battle-again').addEventListener('click', () => {
    if (battle.room) {
      showScreen('screen-battle-lobby');
      renderLobby();
    } else {
      openHome();
    }
  });
  document.getElementById('btn-battle-exit').addEventListener('click', () => {
    rtSend('room:leave');
    battle.room = null;
    openHome();
  });

  document.getElementById('lobby-invite-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-invite]');
    if (!btn) return;
    rtSend('room:invite', { userId: Number(btn.dataset.invite) });
    btn.disabled = true;
    btn.textContent = 'ชวนแล้ว';
  });

  function renderLobby() {
    const room = battle.room;
    if (!room) return;

    document.getElementById('room-code').textContent = room.code;
    document.getElementById('lobby-level').textContent =
      `${room.level} · ${room.questionCount} ข้อ`;
    document.getElementById('lobby-player-count').textContent = room.players.length;

    document.getElementById('lobby-players').innerHTML = room.players.map((p) => {
      const tags = [];
      if (p.isHost) tags.push('<span class="relation-tag">เจ้าของห้อง</span>');
      if (!p.connected) tags.push(`<span class="relation-tag tag-off">${ic('wifi-off', 'icon-sm')} หลุด · รอกลับมา</span>`);
      else if (!p.isHost) tags.push(p.ready ? `<span class="relation-tag tag-ready">${ic('check', 'icon-sm')} พร้อม</span>` : '<span class="relation-tag tag-wait">รอ…</span>');
      return `
        <div class="friend-row">
          <div class="friend-avatar-wrap">
            ${friendAvatarHtml(p)}
            <span class="status-dot ${p.connected ? 'online' : 'offline'}"></span>
          </div>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(p.username)}</div>
          </div>
          <div class="friend-actions">${tags.join('')}</div>
        </div>`;
    }).join('');

    const isHost = state.user && room.hostId === state.user.id;
    const startBtn = document.getElementById('btn-start-battle');
    const hint = document.getElementById('lobby-hint');
    const readyBtn = document.getElementById('btn-ready');
    const others = room.players.filter((p) => !p.isHost && p.connected);
    const readyN = others.filter((p) => p.ready).length;
    const me = room.players.find((p) => state.user && p.id === state.user.id);
    startBtn.classList.toggle('hidden', !isHost);
    hint.classList.toggle('hidden', isHost);
    readyBtn.classList.toggle('hidden', isHost || !me);
    if (me && !isHost) {
      readyBtn.innerHTML = me.ready ? `${ic('check', 'icon-sm')} พร้อมแล้ว (แตะเพื่อยกเลิก)` : 'ฉันพร้อมแล้ว';
      readyBtn.setAttribute('aria-pressed', String(Boolean(me.ready)));
      readyBtn.classList.toggle('btn-primary', !me.ready);
      readyBtn.classList.toggle('btn-secondary', Boolean(me.ready));
    }
    document.getElementById('lobby-ready-count').textContent = others.length ? `พร้อมแล้ว ${readyN}/${others.length} คน` : '';
    if (isHost) {
      const allReady = readyN === others.length;
      startBtn.disabled = !allReady;
      startBtn.textContent = room.players.length < 2 ? 'เริ่มแข่ง (เล่นคนเดียวไม่ได้ EXP)'
        : allReady ? 'เริ่มแข่ง' : `รอให้ทุกคนพร้อม (${readyN}/${others.length})`;
    }

    const inRoom = new Set(room.players.map((p) => p.id));
    const invitable = friendState.friends.filter((f) => isUserOnline(f.id) && !inRoom.has(f.id));
    const section = document.getElementById('lobby-invite-section');
    section.classList.toggle('hidden', invitable.length === 0);
    document.getElementById('lobby-invite-list').innerHTML = invitable.map((f) =>
      friendRowHtml(f, `<button class="mini-btn accept" data-invite="${f.id}">ชวน</button>`)
    ).join('');
  }

  function renderScoreboard(players) {
    const el = document.getElementById('battle-scoreboard');
    if (!el || !players) return;
    el.innerHTML = players.slice(0, 6).map((p, i) => `
      <div class="sb-item ${state.user && p.id === state.user.id ? 'me' : ''}">
        <span class="sb-rank">${i + 1}</span>
        <span class="sb-name">${escapeHtml(p.username)}</span>
        <span class="sb-score">${p.score}</span>
        ${p.answered ? `<span class="sb-check" aria-label="ตอบแล้ว">${ic('check', 'icon-sm')}</span>` : ''}
      </div>
    `).join('');
  }

  function startQuestionTimer(durationMs) {
    cancelAnimationFrame(battle.timerRAF);
    battle.questionEndsAt = Date.now() + durationMs;
    const fill = document.getElementById('battle-timer-fill');

    function tick() {
      const remain = Math.max(0, battle.questionEndsAt - Date.now());
      const pct = (remain / durationMs) * 100;
      fill.style.width = `${pct}%`;
      fill.classList.toggle('warning', pct < 33);
      if (remain > 0) battle.timerRAF = requestAnimationFrame(tick);
    }
    tick();
  }

  function renderBattleQuestion(msg) {
    battle.answered = false;
    showScreen('screen-battle-play');

    document.getElementById('battle-q-count').textContent =
      `ข้อ ${msg.index + 1} / ${msg.total}`;
    document.getElementById('battle-my-score').textContent = battle.myScore;
    document.getElementById('battle-q-kind').innerHTML =
      msg.kind === 'spelling' ? `${ic('pencil-line', 'icon-sm')} เลือกคำที่สะกดถูก` : `${ic('book-open', 'icon-sm')} คำนี้แปลว่าอะไร`;
    document.getElementById('battle-q-prompt').textContent = msg.prompt;
    document.getElementById('battle-progress').textContent = '';

    const wrap = document.getElementById('battle-choices');
    wrap.innerHTML = '';
    msg.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = choice;
      btn.dataset.index = i;
      btn.addEventListener('click', () => {
        if (battle.answered) return;
        battle.answered = true;
        btn.classList.add('chosen');
        wrap.querySelectorAll('.quiz-choice').forEach((b) => { b.disabled = true; });
        rtSend('room:answer', { index: i });
      });
      wrap.appendChild(btn);
    });

    startQuestionTimer(msg.durationMs || 12000);
  }

  function showBattleReveal(msg) {
    cancelAnimationFrame(battle.timerRAF);
    const wrap = document.getElementById('battle-choices');
    wrap.querySelectorAll('.quiz-choice').forEach((btn, i) => {
      btn.disabled = true;
      if (i === msg.correctIndex) btn.classList.add('correct');
      else if (btn.classList.contains('chosen')) btn.classList.add('wrong');
    });
    renderScoreboard(msg.players);
  }

  function showBattleResult(msg) {
    showScreen('screen-battle-result');
    const me = msg.ranking.find((r) => state.user && r.id === state.user.id);
    // อันดับ 1–3 = เหรียญ (รูปทรงต่างกัน) · อันดับอื่น = Mascot ให้กำลังใจ
    const resultTier = me && { 1: 'gold', 2: 'silver', 3: 'bronze' }[me.rank];
    document.getElementById('battle-result-icon').innerHTML = resultTier
      ? G.tierBadge(resultTier, String(me.rank), 'tier-xl tier-unlock', `อันดับ ${me.rank}`)
      : G.mascot(me ? 'encouragement' : 'normal', 'mascot-lg');
    document.getElementById('battle-result-title').textContent =
      me && me.rank === 1 ? (msg.draw ? 'เสมอ!' : 'ชนะแล้ว!') : 'จบเกม!';
    document.getElementById('battle-result-rank').textContent =
      me ? `อันดับ ${me.rank}${me.tied ? ' (เท่ากัน)' : ''} · ${me.score} คะแนน · ตอบถูก ${me.correctCount}/${me.total}` : '';

    const expEl = document.getElementById('battle-result-exp');
    if (msg.noExpReason) expEl.textContent = msg.noExpReason;
    else expEl.textContent = msg.gainedExp > 0
      ? `ได้รับ ${msg.gainedExp} EXP`
      : 'ไม่ได้ EXP รอบนี้';

    document.getElementById('battle-ranking').innerHTML = msg.ranking.map((r) => `
      <div class="friend-row ${state.user && r.id === state.user.id ? 'me-row' : ''}">
        <div class="rank-num">${G.rankBadge(r.rank)}${r.tied ? '<small>=</small>' : ''}</div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(r.username)}</div>
          <div class="friend-meta">ตอบถูก ${r.correctCount}/${r.total}</div>
        </div>
        <div class="rank-score">${r.score}</div>
      </div>
    `).join('');

    if (msg.levelInfo && state.user) {
      const before = state.user.level;
      Object.assign(state.user, {
        exp: msg.levelInfo.exp,
        level: msg.levelInfo.level,
        expIntoLevel: msg.levelInfo.expIntoLevel,
        expForNextLevel: msg.levelInfo.expForNextLevel,
        progressPercent: msg.levelInfo.progressPercent,
      });
      renderHud();
      if (msg.levelInfo.level > before) showLevelUp(msg.levelInfo);
    }
  }

  function showInvite(msg) {
    const ok = window.confirm(
      `${msg.from} ชวนคุณเข้าห้องแข่งคำศัพท์ (ระดับ ${msg.level})\nเข้าร่วมเลยไหม?`
    );
    if (ok) rtSend('room:join', { code: msg.code });
  }

  function handleRoomMessage(msg) {
    switch (msg.type) {
      case 'room:joined':
        battle.room = msg;
        battle.myScore = 0;
        showScreen('screen-battle-lobby');
        renderLobby();
        return true;

      case 'room:state':
        battle.room = msg;
        if (currentScreenIs('screen-battle-lobby')) renderLobby();
        if (msg.status === 'lobby' && currentScreenIs('screen-battle-play')) {
          showScreen('screen-battle-lobby');
          renderLobby();
        }
        return true;

      case 'room:left':
        battle.room = null;
        return true;

      // เชื่อมต่อใหม่หลังรีเฟรช/เน็ตหลุด: กลับเข้าห้องเดิมอัตโนมัติ (ไม่ต้องจำรหัส)
      case 'room:resume': {
        battle.room = msg.room;
        toast('กลับเข้าห้องแข่งเดิมแล้ว', 'success');
        if (msg.question) {
          renderBattleQuestion({ ...msg.question, durationMs: msg.question.remainingMs });
          if (msg.answered) document.querySelectorAll('#battle-choices button').forEach((b) => { b.disabled = true; });
        } else if (msg.room.status === 'lobby') {
          showScreen('screen-battle-lobby');
          renderLobby();
        } else {
          showScreen('screen-battle-play');
          document.getElementById('battle-q-kind').textContent = 'กำลังกลับเข้าเกม…';
        }
        return true;
      }

      case 'room:host':
        toast(msg.message, 'info');
        return true;

      case 'room:countdown':
        showScreen('screen-battle-play');
        document.getElementById('battle-q-kind').textContent = 'เตรียมตัว…';
        document.getElementById('battle-q-prompt').textContent = msg.seconds;
        document.getElementById('battle-choices').innerHTML = '';
        document.getElementById('battle-progress').textContent = '';
        return true;

      case 'room:question':
        renderBattleQuestion(msg);
        return true;

      case 'room:answered':
        battle.myScore = msg.score;
        document.getElementById('battle-my-score').textContent = msg.score;
        if (msg.gained > 0) toast(`+${msg.gained} คะแนน`, 'success');
        return true;

      case 'room:progress':
        document.getElementById('battle-progress').textContent =
          `ตอบแล้ว ${msg.answered} / ${msg.total} คน`;
        return true;

      case 'room:reveal':
        showBattleReveal(msg);
        return true;

      case 'room:ended':
        showBattleResult(msg);
        return true;

      case 'room:invited':
        showInvite(msg);
        return true;

      case 'room:inviteSent':
        toast('ส่งคำเชิญแล้ว', 'success');
        return true;

      case 'room:error': {
        toast(msg.message || 'เกิดข้อผิดพลาด', 'error');
        const errEl = document.getElementById('battle-error');
        if (errEl && currentScreenIs('screen-battle-home')) errEl.textContent = msg.message;
        return true;
      }

      default:
        return false;
    }
  }

  // ---------------------------------------------------------------
  // ADMIN — จัดการเนื้อหาคำศัพท์ (แสดงเฉพาะ admin; สิทธิ์จริงตรวจที่เซิร์ฟเวอร์)
  // ---------------------------------------------------------------
  const adminState = { page: 1, total: 0, pageSize: 30, words: [], editing: null, topics: [] };

  function isAdmin() {
    return Boolean(state.user && state.user.role === 'admin');
  }

  async function openAdmin() {
    if (!isAdmin()) { openHome(); return; }
    showScreen('screen-admin');
    adminState.page = 1;
    await Promise.all([loadAdminStats(), loadAdminWords(), loadAdminReports()]);
  }

  // ---------- รายงานผู้ใช้ (Social Safety) ----------
  const REASON_TH = { spam: 'สแปม', harassment: 'คุกคาม', inappropriate_name: 'ชื่อ/รูปไม่เหมาะสม', cheating: 'โกง', other: 'อื่น ๆ' };
  async function loadAdminReports() {
    const box = document.getElementById('admin-reports-list');
    try {
      const { reports, openCount } = await api('/admin/reports?status=open');
      const badge = document.getElementById('admin-reports-count');
      badge.textContent = String(openCount); badge.classList.toggle('hidden', openCount === 0);
      box.innerHTML = reports.length ? reports.map((r) => `
        <div class="admin-report">
          <div><b>${escapeHtml(r.reported)}</b> · ${escapeHtml(REASON_TH[r.reason] || r.reason)}
            <span class="admin-tag">${r.total_reports} รายงานทั้งหมด</span></div>
          <div class="admin-row-src">โดย ${escapeHtml(r.reporter)} · ${new Date(r.created_at).toLocaleString('th-TH')}</div>
          ${r.details ? `<p class="admin-report-details">${escapeHtml(r.details)}</p>` : ''}
          <div class="admin-report-actions">
            <button class="mini-btn" type="button" data-report="${r.id}" data-status="reviewed">ตรวจแล้ว</button>
            <button class="mini-btn ghost" type="button" data-report="${r.id}" data-status="dismissed">ไม่ผิด / ยกเลิก</button>
          </div>
        </div>`).join('') : G.emptyState({ art: 'empty-review', title: 'ไม่มีรายงานที่รอตรวจ', text: 'รายงานใหม่จากผู้ใช้จะแสดงที่นี่', compact: true });
    } catch (err) {
      box.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }
  document.getElementById('admin-reports-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-report]');
    if (!b) return;
    b.disabled = true;
    try { await api(`/admin/reports/${b.dataset.report}`, { method: 'POST', body: { status: b.dataset.status } }); loadAdminReports(); }
    catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });

  async function loadAdminStats() {
    const el = document.getElementById('admin-stats');
    try {
      const s = await api('/admin/stats');
      adminState.topics = s.topics || [];
      const pct = s.total ? Math.round((s.reviewed / s.total) * 100) : 0;
      el.innerHTML = `
        <div class="admin-stat"><b>${s.reviewed}</b><span>ตรวจแล้ว (${pct}%)</span></div>
        <div class="admin-stat"><b>${s.auto}</b><span>ยังไม่ตรวจ</span></div>
        <div class="admin-stat warn"><b>${s.risky}</b><span>เสี่ยงผิด</span></div>
        <div class="admin-stat"><b>${s.with_thai}</b><span>มีคำแปลไทยที่ตรวจ</span></div>`;
      const badge = document.getElementById('dash-admin-badge');
      if (badge) badge.textContent = s.risky > 0 ? `${s.risky} คำเสี่ยง` : '';
    } catch (err) {
      el.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadAdminWords() {
    const list = document.getElementById('admin-word-list');
    list.innerHTML = G.skeleton('list', 5);
    const params = new URLSearchParams({
      status: document.getElementById('admin-filter-status').value,
      level: document.getElementById('admin-filter-level').value,
      sort: document.getElementById('admin-filter-sort').value,
      q: document.getElementById('admin-filter-q').value.trim(),
      page: String(adminState.page),
    });
    try {
      const data = await api(`/admin/words?${params.toString()}`);
      adminState.words = data.words;
      adminState.total = data.total;
      adminState.pageSize = data.pageSize;

      if (data.words.length === 0) {
        list.innerHTML = G.emptyState({ art: 'empty-search', title: 'ไม่พบคำตามเงื่อนไขนี้', text: 'ลองเปลี่ยนคำค้นหรือตัวกรอง', compact: true });
      } else {
        list.innerHTML = data.words.map((w) => `
          <div class="admin-row">
            <div class="admin-row-main">
              <div class="admin-row-word">
                ${escapeHtml(w.word)}
                <span class="admin-tag">${escapeHtml(w.level)}</span>
                <span class="admin-tag">${escapeHtml(w.category || '')}</span>
                ${w.flagNote ? `<span class="admin-tag warn">${ic('triangle-alert', 'icon-sm')} ต้องตรวจ</span>` : ''}
                ${w.status === 'reviewed' ? '<span class="admin-tag ok">ตรวจแล้ว</span>' : ''}
              </div>
              <div class="admin-row-ipa">${w.ipa ? `/${escapeHtml(w.ipa)}/` : ''} ${w.thai ? `· ${escapeHtml(w.thai)}` : ''}</div>
              <div class="admin-row-def">${escapeHtml(w.definition || '(ไม่มีความหมายภาษาอังกฤษ)')}</div>
              ${w.flagNote ? `<div class="admin-row-flag">${ic('triangle-alert', 'icon-sm')} ${escapeHtml(w.flagNote)}</div>` : ''}
              ${w.sourceRawEntry ? `<div class="admin-row-src">ต้นฉบับ Oxford: <code>${escapeHtml(w.sourceRawEntry)}</code></div>` : ''}
            </div>
            <div class="admin-row-actions">
              <button class="mini-btn accept" data-edit="${escapeHtml(w.id)}">แก้ไข</button>
              ${w.status === 'auto' ? `<button class="mini-btn ghost" data-approve="${escapeHtml(w.id)}">ถูกแล้ว</button>` : ''}
            </div>
          </div>`).join('');
      }

      const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
      document.getElementById('admin-page-info').textContent = `หน้า ${data.page} / ${pages} · ${data.total} คำ`;
      document.getElementById('admin-prev').disabled = data.page <= 1;
      document.getElementById('admin-next').disabled = data.page >= pages;
    } catch (err) {
      list.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function openAdminEdit(id) {
    const w = adminState.words.find((x) => x.id === id);
    if (!w) return;
    adminState.editing = w;
    document.getElementById('admin-edit-title').textContent = w.word;
    document.getElementById('admin-edit-meta').textContent =
      `${w.id} · ${w.level} · ${w.category || ''}${w.senseCount ? ` · WordNet มี ${w.senseCount} ความหมาย` : ''}`;
    const topicSel = document.getElementById('admin-edit-topic');
    topicSel.innerHTML = adminState.topics
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.th)}</option>`).join('');
    topicSel.value = w.topic || '';
    document.getElementById('admin-edit-thai').value = w.thai || '';
    document.getElementById('admin-edit-ipa').value = w.ipa || '';
    document.getElementById('admin-edit-def').value = w.definition || '';
    document.getElementById('admin-edit-ex').value = w.example || '';
    document.getElementById('admin-edit-error').textContent = '';
    adminState.opener = document.activeElement;
    document.getElementById('admin-modal').classList.remove('hidden');
    document.body.classList.add('dialog-open');
    document.getElementById('admin-edit-thai').focus();
  }

  function closeAdminEdit() {
    document.getElementById('admin-modal').classList.add('hidden');
    document.body.classList.remove('dialog-open');
    adminState.editing = null;
    if (adminState.opener && document.contains(adminState.opener)) adminState.opener.focus({ preventScroll: true });
  }
  document.getElementById('admin-modal').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeAdminEdit(); return; }
    trapTab(e, document.querySelector('#admin-modal .admin-modal-card'));
  });

  async function saveAdminEdit() {
    const w = adminState.editing;
    if (!w) return;
    const btn = document.getElementById('admin-edit-save');
    btn.disabled = true;
    try {
      await api(`/admin/words/${encodeURIComponent(w.id)}`, {
        method: 'PATCH',
        body: (() => {
          const b = {
            thai: document.getElementById('admin-edit-thai').value,
            ipa: document.getElementById('admin-edit-ipa').value,
            definition: document.getElementById('admin-edit-def').value,
            example: document.getElementById('admin-edit-ex').value,
          };
          // ส่งหัวข้อเฉพาะเมื่อเปลี่ยนจริง (กันเปลี่ยนสถานะหัวข้อเป็น manual โดยไม่ตั้งใจ)
          const topic = document.getElementById('admin-edit-topic').value;
          if (topic && topic !== w.topic) b.topic = topic;
          return b;
        })(),
      });
      closeAdminEdit();
      toast(`บันทึก "${w.word}" แล้ว`, 'success');
      await Promise.all([loadAdminStats(), loadAdminWords()]);
    } catch (err) {
      document.getElementById('admin-edit-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('dash-admin').addEventListener('click', openAdmin);
  document.getElementById('btn-admin-back').addEventListener('click', openHome);
  document.getElementById('admin-edit-cancel').addEventListener('click', closeAdminEdit);
  document.getElementById('admin-edit-save').addEventListener('click', saveAdminEdit);
  document.getElementById('admin-modal').addEventListener('click', (e) => {
    if (e.target.id === 'admin-modal') closeAdminEdit(); // กดพื้นหลังเพื่อปิด
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && adminState.editing) closeAdminEdit();
  });

  ['admin-filter-status', 'admin-filter-level', 'admin-filter-sort'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => { adminState.page = 1; loadAdminWords(); });
  });
  let adminSearchTimer = null;
  document.getElementById('admin-filter-q').addEventListener('input', () => {
    clearTimeout(adminSearchTimer);
    adminSearchTimer = setTimeout(() => { adminState.page = 1; loadAdminWords(); }, 350);
  });
  document.getElementById('admin-prev').addEventListener('click', () => {
    if (adminState.page > 1) { adminState.page -= 1; loadAdminWords(); }
  });
  document.getElementById('admin-next').addEventListener('click', () => {
    adminState.page += 1; loadAdminWords();
  });

  document.getElementById('admin-word-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) { openAdminEdit(editBtn.dataset.edit); return; }
    const approveBtn = e.target.closest('[data-approve]');
    if (approveBtn) {
      approveBtn.disabled = true;
      try {
        await api(`/admin/words/${encodeURIComponent(approveBtn.dataset.approve)}/approve`, { method: 'POST' });
        toast('ยืนยันว่าถูกต้องแล้ว', 'success');
        await Promise.all([loadAdminStats(), loadAdminWords()]);
      } catch (err) {
        toast(err.message, 'error');
        approveBtn.disabled = false;
      }
    }
  });

  // ---------------------------------------------------------------
  // PLACEMENT TEST — แบบทดสอบวัดระดับ (เซิร์ฟเวอร์เก็บเฉลยและให้คะแนนเอง)
  // ---------------------------------------------------------------
  const plState = { attemptId: null, questions: [], answers: [], index: 0, result: null, review: null };

  const LEVEL_LABEL = {
    'Pre-A1': 'เริ่มต้น (ต่ำกว่า A1)', A1: 'A1 ระดับเริ่มต้น', A2: 'A2 ระดับพื้นฐาน',
    B1: 'B1 ระดับกลาง', B2: 'B2 ระดับกลางค่อนสูง', C1: 'C1 ระดับสูง',
  };

  function showPlPanel(which) {
    ['pl-intro', 'pl-quiz', 'pl-result'].forEach((id) => {
      document.getElementById(id).classList.toggle('hidden', id !== which);
    });
  }

  // ---------- ทำต่อได้: เก็บคำตอบไว้ในเครื่อง (ข้อสอบไม่มีเฉลยฝั่งหน้าเว็บ) · เซิร์ฟเวอร์คืนชุดเดิมภายใน 2 ชม. ----------
  const PL_SAVE_KEY = 'eq_placement_progress';
  const PL_SAVE_HOURS = 2;
  function plSave() {
    try { localStorage.setItem(PL_SAVE_KEY, JSON.stringify({ attemptId: plState.attemptId, answers: plState.answers, index: plState.index, at: Date.now() })); } catch (_) { /* ignore */ }
  }
  function plSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(PL_SAVE_KEY) || 'null');
      return v && Date.now() - v.at < PL_SAVE_HOURS * 3600000 ? v : null;
    } catch (_) { return null; }
  }
  function plClear() { try { localStorage.removeItem(PL_SAVE_KEY); } catch (_) { /* ignore */ } }

  function openPlacement() {
    showScreen('screen-placement');
    document.getElementById('pl-error').textContent = '';
    const saved = plSaved();
    document.getElementById('pl-start').textContent = saved && saved.index > 0
      ? `ทำต่อจากข้อ ${saved.index + 1}` : 'เริ่มทำแบบทดสอบ';
    showPlPanel('pl-intro');
  }

  async function startPlacement() {
    const btn = document.getElementById('pl-start');
    btn.disabled = true;
    document.getElementById('pl-error').textContent = '';
    try {
      const data = await api('/placement/start', { method: 'POST' });
      plState.attemptId = data.attemptId;
      plState.questions = data.questions;
      plState.answers = new Array(data.questions.length).fill(undefined);
      plState.index = 0;
      const saved = plSaved();
      if (data.resumed && saved && saved.attemptId === data.attemptId) {
        plState.answers = saved.answers.slice(0, data.questions.length);
        plState.index = Math.min(saved.index, data.questions.length - 1);
        toast(`ทำต่อจากข้อ ${plState.index + 1}`, 'success');
      }
      plSave();
      showPlPanel('pl-quiz');
      renderPlQuestion();
    } catch (err) {
      document.getElementById('pl-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function renderPlQuestion() {
    const q = plState.questions[plState.index];
    const total = plState.questions.length;
    document.getElementById('pl-counter').textContent = `ข้อ ${plState.index + 1} / ${total}`;
    document.getElementById('pl-skill-tag').textContent = q.skill === 'vocab' ? 'คำศัพท์' : 'แกรมม่า';
    document.getElementById('pl-progress-fill').style.width = `${(plState.index / total) * 100}%`;
    document.getElementById('pl-question-label').textContent =
      q.skill === 'vocab' ? 'คำไหนตรงกับความหมายนี้?' : 'เลือกคำตอบที่ถูกต้อง';
    // ใช้ textContent — เนื้อหามาจากพจนานุกรม/ข้อมูลภายนอก
    document.getElementById('pl-question').textContent = q.prompt;

    const wrap = document.getElementById('pl-choices');
    wrap.innerHTML = '';
    q.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      if (plState.answers[plState.index] === i) btn.classList.add('chosen');
      btn.textContent = choice;
      btn.addEventListener('click', () => answerPl(i));
      wrap.appendChild(btn);
    });
    document.getElementById('pl-prev').disabled = plState.index === 0;
  }

  function answerPl(choiceIndex) {
    plState.answers[plState.index] = choiceIndex; // null = ข้าม
    if (plState.index < plState.questions.length - 1) {
      plState.index += 1;
      plSave();
      renderPlQuestion();
    } else {
      submitPlacement();
    }
  }

  async function submitPlacement() {
    // ข้อที่ยังไม่ได้ตอบ (undefined) ส่งเป็น null = ไม่รู้
    const answers = plState.answers.map((a) => (Number.isInteger(a) ? a : null));
    document.getElementById('pl-question').textContent = 'กำลังประเมินผล…';
    document.getElementById('pl-choices').innerHTML = '';
    try {
      const data = await api(`/placement/${encodeURIComponent(plState.attemptId)}/submit`, {
        method: 'POST', body: { answers },
      });
      plState.result = data.result;
      plState.review = data.review;
      plClear();
      renderPlResult();
    } catch (err) {
      toast(err.message, 'error');
      showPlPanel('pl-intro');
      document.getElementById('pl-error').textContent = err.message;
    }
  }

  function renderPlResult() {
    const r = plState.result;
    showPlPanel('pl-result');
    // ระดับที่ได้ = ตรา CEFR ขนาดใหญ่ (รูปทรงประจำระดับ + ตัวอักษร) + Mascot ฉลองแบบเล็ก
    document.getElementById('pl-result-overall').innerHTML = G.LEVELS[r.overall]
      ? `${G.emblem(r.overall, { size: 'xl' })}<span class="pl-result-name">${escapeHtml(r.overall)} ${G.LEVELS[r.overall].name}</span>` : escapeHtml(r.overall);
    const plArt = document.getElementById('pl-result-art');
    if (plArt) plArt.innerHTML = G.mascot('celebration', 'mascot-md');
    document.getElementById('pl-result-vocab').textContent = r.vocab;
    document.getElementById('pl-result-grammar').textContent = r.grammar;
    document.getElementById('pl-result-score').textContent = `${r.correct}/${r.total}`;
    const li = (arr, emptyText) => (arr && arr.length ? arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('') : `<li class="pl-empty">${emptyText}</li>`);
    document.getElementById('pl-strengths').innerHTML = li(r.strengths, 'ยังไม่มีส่วนที่ตอบได้ถึง 80% — เริ่มจากพื้นฐานได้เลย');
    document.getElementById('pl-practice').innerHTML = li(r.practice, 'ทำได้ดีทุกส่วนที่ทดสอบ');
    const u = r.recommendedUnit;
    document.getElementById('pl-recommend').innerHTML = `<span class="pl-rec-label">จุดเริ่มต้นที่แนะนำ</span>
      <b>${u ? `${G.emblem(u.level, { size: 'xs' })} ${escapeHtml(u.level)} · ${ic(G.iconName(u.icon), 'icon-sm')} ${escapeHtml(u.title)}` : `คำศัพท์ระดับ ${escapeHtml(r.recommendedStart)}`}</b>
      <span>${escapeHtml(LEVEL_LABEL[r.overall] || r.overall)}</span>`;
    document.getElementById('pl-review').classList.add('hidden');
    document.getElementById('pl-go-learn').textContent = u ? 'เริ่มเรียนจุดที่แนะนำ' : `เริ่มเรียนระดับ ${r.recommendedStart}`;
  }

  function renderPlReview() {
    const el = document.getElementById('pl-review');
    el.innerHTML = (plState.review || []).map((q, i) => {
      const chosen = q.chosen === null || q.chosen === undefined ? 'ข้าม' : q.choices[q.chosen];
      // ใช้ทั้งสัญลักษณ์และข้อความ ไม่บอกถูก/ผิดด้วยสีอย่างเดียว (accessibility)
      return `
        <div class="pl-review-row ${q.correct ? 'ok' : 'bad'}">
          <div class="pl-review-q">${i + 1}. ${escapeHtml(q.prompt)} <span class="admin-tag">${escapeHtml(q.level)}</span></div>
          <div class="pl-review-a">${G.mark(q.correct ? 'ok' : 'bad', q.correct ? 'ถูก' : 'ผิด')} · คุณตอบ: ${escapeHtml(chosen)}${q.correct ? '' : ` · เฉลย: <b>${escapeHtml(q.choices[q.correctIndex])}</b>`}</div>
        </div>`;
    }).join('');
    el.classList.toggle('hidden');
  }

  async function loadDashPlacement() {
    try {
      const { result } = await api('/placement/latest');
      if (!result) return;
      document.getElementById('dash-placement-title').textContent =
        `ระดับของคุณ: ${result.overall} (โดยประมาณ)`;
      document.getElementById('dash-placement-sub').textContent =
        `คำศัพท์ ${result.vocab} · แกรมม่า ${result.grammar} · แตะเพื่อทำแบบทดสอบอีกครั้ง`;
    } catch (_err) { /* ไม่มีผลก็แสดงข้อความเชิญชวนตามเดิม */ }
  }

  document.getElementById('dash-placement').addEventListener('click', openPlacement);
  document.getElementById('btn-placement-back').addEventListener('click', openHome);
  document.getElementById('pl-start').addEventListener('click', startPlacement);
  document.getElementById('pl-skip').addEventListener('click', () => answerPl(null));
  document.getElementById('pl-prev').addEventListener('click', () => {
    if (plState.index > 0) { plState.index -= 1; renderPlQuestion(); }
  });
  document.getElementById('pl-show-review').addEventListener('click', renderPlReview);
  document.getElementById('pl-go-learn').addEventListener('click', () => {
    const r = plState.result;
    if (!r) return;
    if (r.recommendedUnit) {
      // Unit ที่แนะนำอาจยังล็อกตามลำดับ -> เปิดในโหมดสำรวจ (ผู้เรียนพิสูจน์ระดับแล้ว)
      startUnit(r.recommendedUnit.id, { explore: r.recommendedUnit.locked });
    } else {
      startSession(r.recommendedStart);
    }
  });

  // ---------------------------------------------------------------
  // LEARNING PATH — เส้นทางการเรียน A1–C1 แบ่งเป็น Units ตามหัวข้อ
  // ---------------------------------------------------------------
  const pathState = { data: null, openLevel: null, mode: 'read' };
  try { if (localStorage.getItem('eq_path_mode') === 'listening') pathState.mode = 'listening'; } catch (_) { /* ignore */ }
  // ซิงก์ปุ่มอ่าน/ฟังกับโหมดที่จำไว้ (เรียกตอนเปิดหน้าเส้นทาง — tts พร้อมแล้ว)
  function syncPathModeUi() {
    if (pathState.mode === 'listening' && !tts.supported) pathState.mode = 'read';
    document.querySelectorAll('.path-mode-btn').forEach((b) => {
      const on = b.dataset.mode === pathState.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const note = document.getElementById('path-mode-note');
    note.innerHTML = pathState.mode === 'listening'
      ? `${ic('headphones', 'icon-sm')} โหมดฟัง: ได้ยินเสียงแล้วเลือกคำที่ได้ยิน — ความคืบหน้านับแยกจากโหมดอ่าน · เปิดเสียงด้วยนะ` : '';
    note.classList.toggle('hidden', pathState.mode !== 'listening');
  }

  // สลับโหมดฝึก อ่าน/ฟัง
  document.querySelector('.path-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    const note = document.getElementById('path-mode-note');
    if (btn.dataset.mode === 'listening' && !tts.supported) {
      note.textContent = 'เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน — ลองใช้ Chrome หรือ Safari';
      note.classList.remove('hidden');
      return;
    }
    if (btn.dataset.mode === pathState.mode) return;
    pathState.mode = btn.dataset.mode;
    // ความคืบหน้าแยกตามโหมด -> โหลดเส้นทางของโหมดที่เลือกใหม่
    try { localStorage.setItem('eq_path_mode', pathState.mode); } catch (_) { /* ignore */ }
    openPath();
  });

  // ---------- เส้นทางแนะนำ / สำรวจอิสระ ----------
  const PATH_VIEW_KEY = 'eq_path_view';
  try { pathState.view = localStorage.getItem(PATH_VIEW_KEY) === 'explore' ? 'explore' : 'recommended'; } catch (_) { pathState.view = 'recommended'; }
  const LEVEL_IDX = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };
  function syncPathViewUi() {
    document.querySelectorAll('.path-view-btn').forEach((b) => {
      const on = b.dataset.view === pathState.view;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
    });
    document.getElementById('path-view-sub').textContent = pathState.view === 'explore'
      ? 'เปิดเรียนได้ทุก Unit ทุกระดับ · Unit ที่สูงกว่าระดับแนะนำมีป้ายบอก · สอบ Unit และ Boss ยังต้องผ่านตามลำดับ'
      : 'เรียนตามลำดับ · รู้ 80% ของคำใน Unit = ผ่าน · ผ่าน 60% ของระดับ = ปลดล็อกระดับถัดไป';
  }
  document.querySelector('.path-view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    pathState.view = b.dataset.view;
    try { localStorage.setItem(PATH_VIEW_KEY, pathState.view); } catch (_) { /* โหมดส่วนตัว */ }
    syncPathViewUi();
    if (pathState.data) renderPath();
  });

  async function openPath() {
    syncPathViewUi();
    syncPathModeUi();
    showScreen('screen-path');
    const wrap = document.getElementById('path-levels');
    wrap.innerHTML = G.skeleton('list', 5);
    try {
      pathState.data = await api(`/path?mode=${pathState.mode}`);
      // เปิดระดับที่มี Unit ถัดไปไว้ก่อน ที่เหลือพับไว้ (ลดความรก 267 Units)
      if (!pathState.openLevel) {
        pathState.openLevel = (pathState.data.next && pathState.data.next.level) || 'A1';
      }
      renderPath();
    } catch (err) {
      wrap.innerHTML = `<div class="state-error-card"><p>โหลดเส้นทางการเรียนไม่สำเร็จ</p><button class="btn btn-secondary" type="button" id="path-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('path-retry').addEventListener('click', openPath);
    }
  }

  function renderPath() {
    const { levels } = pathState.data;
    const explore = pathState.view === 'explore';
    const current = pathState.data.next || null;           // Unit ที่แนะนำให้เรียนต่อ = ตำแหน่งปัจจุบัน
    const recIdx = current ? LEVEL_IDX[current.level] : 0;
    const wrap = document.getElementById('path-levels');
    wrap.innerHTML = levels.map((lv) => {
      const pct = lv.totalUnits ? Math.round((lv.completedUnits / lv.totalUnits) * 100) : 0;
      const open = pathState.openLevel === lv.level;
      const units = open ? lv.units.map((u) => {
        const upct = u.total ? Math.round((u.known / u.total) * 100) : 0;
        // บอกสถานะด้วยไอคอน+ข้อความ ไม่ใช้สีอย่างเดียว (accessibility)
        const isCurrent = current && current.id === u.id;
        const above = LEVEL_IDX[lv.level] > recIdx;
        const canOpen = u.status !== 'locked' || explore;
        const badgeText = u.status === 'completed' ? 'ผ่าน'
          : u.status === 'locked' ? (explore ? (above ? 'สูงกว่าที่แนะนำ' : 'สำรวจ') : 'ล็อก') : `${upct}%`;
        const badge = u.status === 'completed' ? G.mark('ok', badgeText)
          : u.status === 'locked' ? G.mark(explore ? (above ? 'up' : 'open') : 'lock', badgeText) : `<span class="path-pct">${badgeText}</span>`;
        // Node บนเส้นทาง: ผ่าน = Check · ปัจจุบัน = วงแหวนเน้น · ล็อก = Lock · กำลังเรียน = วงความคืบหน้า + ไอคอนหมวด
        const nodeState = u.status === 'completed' ? 'done' : isCurrent ? 'current' : u.status === 'locked' ? 'locked' : 'active';
        const nodeIcon = nodeState === 'done' ? 'check' : nodeState === 'locked' ? 'lock' : G.iconName(u.icon);
        // ปุ่มฝึกกับปุ่มสอบแยกกัน (ห้ามซ้อนปุ่มในปุ่ม — HTML ผิดมาตรฐาน ใช้คีย์บอร์ด/screen reader ไม่ได้)
        return `
          <div class="path-unit-row node-${nodeState}${isCurrent ? ' is-current' : ''}">
            <span class="path-node" style="--p:${upct}" aria-hidden="true">${ic(nodeIcon)}</span>
            <div class="path-unit-body">
              ${isCurrent ? '<span class="path-here">คุณอยู่ตรงนี้</span>' : ''}
              <div class="path-unit-line">
                <button class="path-unit ${u.status}${explore && u.status === 'locked' ? ' explorable' : ''}" data-unit="${escapeHtml(u.id)}"
                        data-locked="${u.status === 'locked'}"
                        ${canOpen ? '' : 'disabled aria-disabled="true"'} ${isCurrent ? 'aria-current="step"' : ''}
                        aria-label="ฝึก ${escapeHtml(u.title)} ${badgeText}${isCurrent ? ' (ตำแหน่งปัจจุบัน)' : ''}">
                  <span class="path-unit-text">
                    <span class="path-unit-title">${escapeHtml(u.title)}${u.testPassed ? G.tierBadge('bronze', '', 'tier-inline', 'สอบผ่านแล้ว') : ''}</span>
                    <span class="path-unit-meta">${u.known}/${u.total} คำ</span>
                    <span class="path-unit-bar"><span style="width:${upct}%"></span></span>
                  </span>
                  <span class="path-unit-badge">${badge}</span>
                </button>
                ${u.status !== 'locked' ? `<button class="path-test-btn" data-test-unit="${escapeHtml(u.id)}"
                    aria-label="สอบ Unit ${escapeHtml(u.title)}">${ic('file-pen-line')}<span>สอบ</span></button>` : ''}
              </div>
            </div>
          </div>`;
      }).join('') : '';

      // การ์ด Boss ท้ายระดับ
      const bossHtml = !open ? '' : lv.boss === 'cleared'
        ? `<div class="path-boss cleared">${G.tierBadge('gold', '', 'tier-md', 'เคลียร์ Boss แล้ว')}<span>เคลียร์ Boss ${lv.level} แล้ว</span> <button class="link-btn" data-boss="${lv.level}">ท้าทายอีกครั้ง</button></div>`
        : lv.boss === 'available'
          ? `<button class="path-boss available" data-boss="${lv.level}"><span class="path-boss-icon">${ic('crown', 'icon-lg')}</span><b>Boss Challenge ${lv.level}</b><small>20 ข้อ · ผ่าน 70% เพื่อเคลียร์ระดับ</small></button>`
          : (lv.unlocked ? `<div class="path-boss locked">${ic('lock')} Boss ${lv.level} — ผ่าน 60% ของ Unit เพื่อเรียก Boss</div>` : '');

      return `
        <div class="path-level ${lv.unlocked ? '' : 'locked'}">
          <button class="path-level-head" data-level="${lv.level}" aria-expanded="${open}">
            ${G.emblem(lv.level, { size: 'md' })}
            <span class="path-level-name">
              <b>${lv.level} ${G.LEVELS[lv.level].name} <span class="path-level-world">· ${escapeHtml(lv.world.name)}</span></b>
              <small>${lv.unlocked ? `${lv.completedUnits}/${lv.totalUnits} Units · ${pct}%`
                : (explore ? `${ic('arrow-up-right', 'icon-sm')} สูงกว่าระดับแนะนำ — เปิดเรียนได้` : `${ic('lock', 'icon-sm')} ผ่าน 60% ของระดับก่อนเพื่อปลดล็อก`)}</small>
            </span>
            <span class="path-level-chev${open ? ' open' : ''}" aria-hidden="true">${ic('chevron-right')}</span>
          </button>
          ${open ? `
            <div class="path-units path-journey" style="--lv:${LEVEL_COLORS[lv.level]}">${units}</div>
            ${bossHtml}
            ${lv.unlocked || explore ? `<button class="link-btn" data-whole-level="${lv.level}">ฝึกคำทั้งระดับ ${lv.level}</button>` : ''}
          ` : ''}
        </div>`;
    }).join('');
  }

  async function startUnit(unitId, opts = {}) {
    try {
      const qs = (opts.explore || pathState.view === 'explore') ? '?explore=1' : '';
      const unit = await api(`/path/units/${encodeURIComponent(unitId)}${qs}${qs ? '&' : '?'}mode=${pathState.mode}`);
      if (unit.explored) toast('โหมดสำรวจ: Unit นี้สูงกว่าเส้นทางแนะนำ — เรียนได้ตามสบาย', 'info');
      startSession(unit.level, { id: unit.id, title: unit.title, wordIds: unit.wordIds },
        { listening: pathState.mode === 'listening' });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('path-levels').addEventListener('click', (e) => {
    const head = e.target.closest('[data-level]');
    if (head) {
      pathState.openLevel = pathState.openLevel === head.dataset.level ? null : head.dataset.level;
      renderPath();
      return;
    }
    const testBtn = e.target.closest('[data-test-unit]');
    if (testBtn) { startAssessment('unit', testBtn.dataset.testUnit); return; }
    const bossBtn = e.target.closest('[data-boss]');
    if (bossBtn) { startAssessment('boss', bossBtn.dataset.boss); return; }
    const unitBtn = e.target.closest('[data-unit]');
    if (unitBtn && !unitBtn.disabled) { startUnit(unitBtn.dataset.unit); return; }
    const whole = e.target.closest('[data-whole-level]');
    if (whole) startSession(whole.dataset.wholeLevel, null, { listening: pathState.mode === 'listening' });
  });

  // ---------------------------------------------------------------
  // ASSESSMENT — Unit Test และ Boss Challenge (เซิร์ฟเวอร์เก็บเฉลยและให้คะแนน)
  // ---------------------------------------------------------------
  const asState = { attemptId: null, kind: null, title: '', questions: [], answers: [], index: 0, review: null };

  async function startAssessment(kind, ref) {
    const url = kind === 'boss'
      ? `/assessments/boss/${encodeURIComponent(ref)}/start`
      : `/assessments/unit/${encodeURIComponent(ref)}/start`;
    try {
      const data = await api(url, { method: 'POST' });
      Object.assign(asState, {
        attemptId: data.attemptId, kind, title: data.title || '',
        questions: data.questions, answers: new Array(data.questions.length).fill(undefined), index: 0, review: null,
      });
      showScreen('screen-assessment');
      document.getElementById('as-badge').innerHTML = kind === 'boss' ? `${ic('crown', 'icon-sm')} Boss Challenge` : `${ic('file-pen-line', 'icon-sm')} Unit Test`;
      document.getElementById('as-quiz').classList.remove('hidden');
      document.getElementById('as-result').classList.add('hidden');
      if (data.resumed) toast('ทำข้อสอบชุดเดิมต่อ', 'success');
      renderAsQuestion();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderAsQuestion() {
    const q = asState.questions[asState.index];
    const total = asState.questions.length;
    document.getElementById('as-counter').textContent = `ข้อ ${asState.index + 1} / ${total}`;
    document.getElementById('as-title').textContent = asState.title;
    document.getElementById('as-progress-fill').style.width = `${(asState.index / total) * 100}%`;
    const label = q.skill === 'grammar' ? 'เลือกคำตอบที่ถูกต้อง'
      : q.kind === 'thai' ? 'คำนี้แปลว่าอะไร?' : 'คำไหนตรงกับความหมายนี้?';
    document.getElementById('as-question-label').textContent = label;
    document.getElementById('as-question').textContent = q.prompt; // textContent: เนื้อหาจากภายนอก

    const wrap = document.getElementById('as-choices');
    wrap.innerHTML = '';
    q.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      if (asState.answers[asState.index] === i) btn.classList.add('chosen');
      btn.textContent = choice;
      btn.addEventListener('click', () => answerAs(i));
      wrap.appendChild(btn);
    });
    document.getElementById('as-prev').disabled = asState.index === 0;
  }

  function answerAs(i) {
    asState.answers[asState.index] = i;
    if (asState.index < asState.questions.length - 1) {
      asState.index += 1;
      renderAsQuestion();
    } else {
      submitAssessment();
    }
  }

  async function submitAssessment() {
    const answers = asState.answers.map((a) => (Number.isInteger(a) ? a : null));
    document.getElementById('as-question').textContent = 'กำลังตรวจคำตอบ…';
    document.getElementById('as-choices').innerHTML = '';
    try {
      const data = await api(`/assessments/${encodeURIComponent(asState.attemptId)}/submit`, {
        method: 'POST', body: { answers },
      });
      asState.review = data.review;
      renderAsResult(data);
    } catch (err) {
      toast(err.message, 'error');
      openPath();
    }
  }

  function renderAsResult(data) {
    const r = data.result;
    document.getElementById('as-quiz').classList.add('hidden');
    document.getElementById('as-result').classList.remove('hidden');
    const isBoss = data.kind === 'boss';
    const need = isBoss ? 70 : 80;
    document.getElementById('as-result-label').textContent = r.passed ? (isBoss ? 'เคลียร์ Boss แล้ว!' : 'ผ่าน Unit แล้ว!') : 'ยังไม่ผ่าน';
    // Achievement: Unit = Bronze · Boss = Gold (รูปทรงต่างกัน) · ไม่ผ่าน = Mascot ให้กำลังใจ
    document.getElementById('as-result-art').innerHTML = r.passed
      ? G.tierBadge(isBoss ? 'gold' : 'bronze', '', 'tier-xl tier-unlock', isBoss ? 'เหรียญทอง เคลียร์ Boss' : 'เหรียญทองแดง ผ่าน Unit')
      : G.mascot('encouragement', 'mascot-md');
    document.getElementById('as-result-big').textContent = `${r.percent}%`;
    document.getElementById('as-result-msg').textContent = r.passed
      ? `ตอบถูก ${r.correct}/${r.total} ข้อ${isBoss ? ` — ปลดล็อกระดับถัดไปแล้ว` : ''}`
      : `ตอบถูก ${r.correct}/${r.total} ข้อ — ต้องได้อย่างน้อย ${need}% ลองฝึกคำที่ผิดแล้วสอบใหม่ได้เลย`;
    document.getElementById('as-result-exp').textContent = r.gainedExp > 0
      ? `ได้รับ ${r.gainedExp} EXP` : (r.passed ? 'เคยผ่านแล้ว (EXP ให้เฉพาะครั้งแรก)' : '');
    document.getElementById('as-review').classList.add('hidden');

    if (data.levelInfo && state.user) {
      const before = state.user.level;
      Object.assign(state.user, {
        exp: data.levelInfo.exp, level: data.levelInfo.level,
        expIntoLevel: data.levelInfo.expIntoLevel, expForNextLevel: data.levelInfo.expForNextLevel,
        progressPercent: data.levelInfo.progressPercent,
      });
      renderHud();
      if (data.levelInfo.level > before) showLevelUp(data.levelInfo);
    }
  }

  function renderAsReview() {
    const el = document.getElementById('as-review');
    el.innerHTML = (asState.review || []).map((q, i) => {
      const chosen = q.chosen === null || q.chosen === undefined ? 'ข้าม' : q.choices[q.chosen];
      return `
        <div class="pl-review-row ${q.correct ? 'ok' : 'bad'}">
          <div class="pl-review-q">${i + 1}. ${escapeHtml(q.prompt)}</div>
          <div class="pl-review-a">${G.mark(q.correct ? 'ok' : 'bad', q.correct ? 'ถูก' : 'ผิด')} · คุณตอบ: ${escapeHtml(chosen)}${q.correct ? '' : ` · เฉลย: <b>${escapeHtml(q.choices[q.correctIndex])}</b>`}</div>
        </div>`;
    }).join('');
    el.classList.toggle('hidden');
  }

  document.getElementById('btn-as-back').addEventListener('click', openPath);
  document.getElementById('as-continue').addEventListener('click', openPath);
  document.getElementById('as-show-review').addEventListener('click', renderAsReview);
  document.getElementById('as-skip').addEventListener('click', () => answerAs(null));
  document.getElementById('as-prev').addEventListener('click', () => {
    if (asState.index > 0) { asState.index -= 1; renderAsQuestion(); }
  });

  // ---------------------------------------------------------------
  // VOCABULARY BROWSER + CARD — ค้นหา/ดูคำศัพท์ Oxford
  // ---------------------------------------------------------------
  const vbState = { level: '', page: 1, total: 0, pageSize: 30, words: [], timer: null };
  const VB_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const POS_TH = {
    noun: 'คำนาม', verb: 'คำกริยา', adjective: 'คำคุณศัพท์', adverb: 'คำกริยาวิเศษณ์', pronoun: 'คำสรรพนาม',
    preposition: 'คำบุพบท', conjunction: 'คำเชื่อม', determiner: 'คำนำหน้านาม', exclamation: 'คำอุทาน',
    number: 'ตัวเลข', 'modal verb': 'กริยาช่วย', 'auxiliary verb': 'กริยาช่วย',
    'indefinite article': 'คำนำหน้านาม', 'definite article': 'คำนำหน้านาม', 'infinitive marker': 'คำนำหน้ากริยา',
  };
  const STATUS_TH = { new: 'ยังไม่เคยเรียน', learning: 'กำลังเรียน', reviewing: 'กำลังทบทวน', mastered: 'จำได้แม่นแล้ว' };
  // สถานะการจำ = วงความคืบหน้า (CSS) 0% / 40% / 75% / 100% + ข้อความ (ไม่พึ่งสัญลักษณ์ตัวอักษร)
  const STATUS_ICON = Object.fromEntries(['new', 'learning', 'reviewing', 'mastered'].map((k) => [k, `<span class="mem-ring mem-${k}" aria-hidden="true"></span>`]));

  function vbWord(w) {
    return `${w.headword}${w.homograph ? `<sup>${w.homograph}</sup>` : ''}`;
  }

  function openVocab() {
    showScreen('screen-vocab');
    vbState.page = 1;
    loadVocab();
  }

  async function loadVocab() {
    const list = document.getElementById('vb-list');
    list.innerHTML = G.skeleton('list', 6);
    const params = new URLSearchParams({
      q: document.getElementById('vb-q').value.trim(),
      level: vbState.level,
      pos: document.getElementById('vb-pos').value,
      status: document.getElementById('vb-status').value,
      source: document.getElementById('vb-source').value,
      page: String(vbState.page),
    });
    try {
      const d = await api(`/vocab/search?${params.toString()}`);
      Object.assign(vbState, { total: d.total, pageSize: d.pageSize, words: d.words });
      // ชิประดับ: แสดงจำนวนคำตามตัวกรองอื่น
      document.getElementById('vb-levels').innerHTML = [['', 'ทุกระดับ', Object.values(d.countsByLevel).reduce((a, b) => a + b, 0)],
        ...VB_LEVELS.map((l) => [l, l, d.countsByLevel[l]])].map(([v, label, n]) => `
        <button class="vb-chip ${vbState.level === v ? 'active' : ''}" data-vb-level="${v}" aria-pressed="${vbState.level === v}"
                style="${v ? `--chip:${LEVEL_COLORS[v]}` : ''}">${label} <span>${n}</span></button>`).join('');
      document.getElementById('vb-count').textContent = `พบ ${d.total.toLocaleString()} ความหมาย`;
      vbUpdateFilterBtn();
      list.innerHTML = d.words.length ? d.words.map((w) => `
        <button class="vb-row" data-vb-id="${escapeHtml(w.id)}">
          <span class="vb-row-main">
            <span class="vb-row-word">${vbWord(w)}${w.senseLabel ? ` <i>(${escapeHtml(w.senseLabel)})</i>` : ''}</span>
            <span class="vb-row-thai">${escapeHtml(w.thai || '—')}${w.thaiPending ? ' <span class="vb-pending">รอตรวจ</span>' : ''}</span>
          </span>
          <span class="vb-row-meta">
            <span class="vb-badge" style="--chip:${LEVEL_COLORS[w.cefr]}">${w.cefr}</span>
            <span class="vb-pos">${escapeHtml(POS_TH[w.pos] || w.pos || '')}</span>
            <span class="vb-status" title="${STATUS_TH[w.status]}">${STATUS_ICON[w.status]} ${STATUS_TH[w.status]}</span>
          </span>
        </button>`).join('') : G.emptyState({ art: 'empty-search', title: 'ไม่พบคำที่ตรงกับเงื่อนไข', text: 'ลองพิมพ์คำอื่น หรือค้นเป็นภาษาไทย เช่น “ธนาคาร” แล้วล้างตัวกรองระดับ', compact: true });
      const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
      document.getElementById('vb-page').textContent = `หน้า ${d.page} / ${pages}`;
      document.getElementById('vb-prev').disabled = d.page <= 1;
      document.getElementById('vb-next').disabled = d.page >= pages;
    } catch (err) {
      list.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  // ---------- หน้ารายละเอียดคำศัพท์: รวมทุกความหมายของคำในหน้าเดียว ----------
  // เรียงตามลำดับในต้นฉบับ Oxford · ความหมายที่เปิดมาถูกเน้นและขยายไว้ · ประเมินความจำได้ทีละความหมาย
  const CEFR_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
  let vdState = { senses: [], selectedId: null };

  function senseLine(o) {
    return `${escapeHtml(POS_TH[o.pos] || o.pos || 'ไม่ระบุชนิดคำ')}${o.senseLabel ? ` · ${escapeHtml(o.senseLabel)}` : ''}`;
  }

  function renderPronunciation(word) {
    if (!tts.supported) return '<p class="vd-note">อุปกรณ์นี้ไม่รองรับเสียงอ่าน</p>';
    const both = tts.voices.US && tts.voices.GB;
    const seg = (name, items, current) => `<div class="vd-seg" role="group" aria-label="${name}">${items.map(([v, label]) =>
      `<button type="button" class="vd-seg-btn${String(current) === String(v) ? ' active' : ''}" aria-pressed="${String(current) === String(v)}" data-${name === 'สำเนียง' ? 'accent' : 'speed'}="${v}">${label}</button>`).join('')}</div>`;
    return `<div class="vd-sound">
        <button class="btn btn-primary vd-speak" id="vd-speak" type="button" aria-label="ฟังเสียง ${escapeHtml(word)}">
          <svg class="icon" aria-hidden="true"><use href="/assets/icons/icons.svg#headphones"></use></svg> ฟังเสียง</button>
        ${both ? seg('สำเนียง', [['GB', 'UK'], ['US', 'US']], tts.accent) : ''}
        ${seg('ความเร็ว', [['1', '1x'], ['0.75', '0.75x']], tts.speed)}
      </div>
      ${both ? '' : `<p class="vd-note">${tts.voices.GB || tts.voices.US
        ? `อุปกรณ์นี้มีเสียงสำเนียง ${tts.voices.GB ? 'UK' : 'US'} เท่านั้น`
        : 'ใช้เสียงภาษาอังกฤษเริ่มต้นของอุปกรณ์'}</p>`}`;
  }

  function renderVocabDetail() {
    const el = document.getElementById('vc-card');
    const list = vdState.senses;
    const sel = list.find((x) => x.id === vdState.selectedId) || list[0];
    const head = list[0];
    const ipa = (list.find((x) => x.ipa && !x.homograph) || {}).ipa;
    const homographs = new Set(list.map((x) => x.homograph || 0)).size > 1;
    let lastHomo = null;
    const items = list.map((o, i) => {
      const homoHead = homographs && o.homograph !== lastHomo
        ? `<li class="vd-homo" aria-hidden="true">${escapeHtml(o.headword)}<sup>${o.homograph || ''}</sup>${o.ipa ? ` /${escapeHtml(o.ipa)}/` : ''}</li>` : '';
      lastHomo = o.homograph;
      const isSel = o.id === sel.id;
      return `${homoHead}<li class="vd-sense${isSel ? ' is-selected' : ''}" ${isSel ? 'aria-current="true"' : ''}>
        <details ${isSel ? 'open' : ''}>
          <summary data-vd-select="${escapeHtml(o.id)}">
            <span class="vd-num">${i + 1}</span>
            <span class="vd-sense-main">
              <span class="vd-thai">${escapeHtml(o.thai || 'ยังไม่มีคำแปล')}${o.thaiPending ? ' <span class="vb-pending">รอตรวจ</span>' : ''}</span>
              <span class="vd-meta"><span class="vb-badge" style="--chip:${LEVEL_COLORS[o.cefr]}">${o.cefr}</span> ${senseLine(o)}</span>
              <span class="vd-status">${STATUS_ICON[o.status]} ${STATUS_TH[o.status]}</span>
            </span>
          </summary>
          <div class="vd-sense-body">
            ${o.definition ? `<p class="vd-def"><span class="vd-label">Definition</span>${escapeHtml(o.definition)}</p>` : ''}
            ${o.example ? `<p class="vd-ex"><span class="vd-label">Example</span>“${escapeHtml(o.example)}”
              <button class="mini-btn ghost" type="button" data-vd-say="${escapeHtml(o.example)}" aria-label="ฟังประโยคตัวอย่าง">${ic('volume-2', 'icon-sm')}</button></p>` : ''}
            ${!o.definition && !o.example ? '<p class="vd-note">ยังไม่มีความหมายภาษาอังกฤษและตัวอย่างสำหรับความหมายนี้</p>' : ''}
          </div>
        </details>
      </li>`;
    }).join('');
    const listName = sel.sourceList === 'OXFORD_3000' ? 'Oxford 3000' : 'Oxford 5000 (เพิ่มเติม)';
    el.innerHTML = `
      <header class="vd-head">
        <h1 class="vc-word">${escapeHtml(head.headword)}</h1>
        ${ipa ? `<div class="vc-ipa">/${escapeHtml(ipa)}/</div>` : ''}
        ${renderPronunciation(head.headword)}
      </header>
      <section aria-labelledby="vd-senses-title">
        <h2 class="vd-section-title" id="vd-senses-title">ความหมาย (${list.length})</h2>
        <ol class="vd-senses">${items}</ol>
      </section>
      <section class="vc-rate">
        <div class="vc-section-label">คุณรู้จักความหมาย “${escapeHtml(sel.thai || sel.headword)}” แค่ไหน?</div>
        <div class="vc-rate-btns">
          <button class="vc-rate-btn" data-rate="dont_know" type="button">${ic('circle-x', 'icon-sm')} ไม่รู้</button>
          <button class="vc-rate-btn" data-rate="unsure" type="button">${ic('circle-help', 'icon-sm')} ไม่แน่ใจ</button>
          <button class="vc-rate-btn" data-rate="know" type="button">${ic('circle-check', 'icon-sm')} รู้</button>
        </div>
        <div class="vc-note">บันทึกว่าคุณรู้จักคำนี้แค่ไหน (ไม่ได้ EXP — EXP มาจากแบบฝึกที่ตรวจคำตอบ)</div>
        <div class="vc-rate-result" id="vc-rate-result" aria-live="polite"></div>
      </section>
      <footer class="vc-source">แหล่งข้อมูล: ${listName} · CEFR ${sel.cefr}<br>
        <span>ต้นฉบับ: <code>${escapeHtml(sel.sourceRawEntry || '')}</code> · คำแปลไทยไม่ได้มาจาก Oxford</span></footer>`;
  }

  async function openVocabCard(id) {
    showScreen('screen-vocab-card');
    const el = document.getElementById('vc-card');
    el.innerHTML = '<div class="skeleton skeleton-card"></div>';
    try {
      const w = await api(`/vocab/${encodeURIComponent(id)}`);
      const all = [w, ...w.otherSenses].sort((x, y) => (x.homograph || 0) - (y.homograph || 0)
        || (CEFR_ORDER[x.cefr] - CEFR_ORDER[y.cefr]) || ((x.order || 0) - (y.order || 0)));
      vdState = { senses: all, selectedId: w.id, raw: w };
      // ข้อมูลต้นฉบับของความหมายอื่น (สำหรับส่วนแหล่งข้อมูล) — ความหมายหลักมีมาแล้ว
      renderVocabDetail();
    } catch (err) {
      el.innerHTML = `<div class="state-error-card"><p>${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary" type="button" id="vc-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('vc-retry').addEventListener('click', () => openVocabCard(id));
    }
  }

  // event ของหน้ารายละเอียด (ผูกครั้งเดียวที่กล่องหลัก)
  document.getElementById('vc-card').addEventListener('click', async (e) => {
    const t = e.target;
    const sayBtn = t.closest('[data-vd-say]');
    if (sayBtn) { speak(sayBtn.dataset.vdSay, 0.85); return; }
    if (t.closest('#vd-speak')) { speak(speakableWord(vdState.senses[0].headword)); return; }
    const acc = t.closest('[data-accent]');
    if (acc) { setTtsAccent(acc.dataset.accent); renderVocabDetail(); speak(speakableWord(vdState.senses[0].headword)); return; }
    const sp = t.closest('[data-speed]');
    if (sp) { setTtsSpeed(Number(sp.dataset.speed)); renderVocabDetail(); speak(speakableWord(vdState.senses[0].headword)); return; }
    const pick = t.closest('[data-vd-select]');
    if (pick && pick.dataset.vdSelect !== vdState.selectedId) {
      // เลือกความหมายอื่น (เพื่อประเมินความจำ) — ให้ <details> เปิด/ปิดตามปกติ แล้วค่อยวาดใหม่
      e.preventDefault();
      vdState.selectedId = pick.dataset.vdSelect;
      renderVocabDetail();
      return;
    }
    const rate = t.closest('[data-rate]');
    if (rate) {
      try {
        const r = await api(`/vocab/${encodeURIComponent(vdState.selectedId)}/rate`, { method: 'POST', body: { rating: rate.dataset.rate } });
        const msg = { dont_know: 'ลองฝึกคำนี้ในบทเรียนอีกครั้งนะ', unsure: 'ฝึกอีกนิดก็จำได้แม่น', know: 'เยี่ยม — จำคำนี้ได้แล้ว' };
        document.getElementById('vc-rate-result').textContent = `บันทึกแล้ว — ${msg[r.rating]}`;
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  // ---------- ตัวกรองบนมือถือ: ปุ่ม + Bottom Sheet (จอกว้างแสดงตัวกรองในหน้าตามเดิม) ----------
  const VB_FILTER_IDS = ['vb-pos', 'vb-status', 'vb-source'];
  function vbActiveFilters() { return VB_FILTER_IDS.filter((id) => document.getElementById(id).value).length; }
  function vbUpdateFilterBtn() {
    const n = vbActiveFilters();
    const badge = document.getElementById('vb-filter-count');
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
    document.getElementById('vb-filter-btn').setAttribute('aria-label', n ? `ตัวกรอง (ใช้อยู่ ${n} รายการ)` : 'ตัวกรอง');
    const apply = document.getElementById('vb-sheet-apply');
    if (apply) apply.textContent = `ดูผลลัพธ์ (${vbState.total.toLocaleString()})`;
  }
  function openVocabFilterSheet() {
    const fields = document.getElementById('vb-filter-fields');
    const home = fields.parentNode;
    const anchor = fields.nextSibling;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card vb-sheet">
        <h2 class="vb-sheet-title">ตัวกรอง</h2>
        <div class="vb-sheet-body"></div>
        <div class="vb-sheet-actions">
          <button class="btn btn-secondary" id="vb-sheet-clear" type="button">ล้างตัวกรอง</button>
          <button class="btn btn-primary" id="vb-sheet-apply" type="button" data-autofocus>ดูผลลัพธ์</button>
        </div>
      </div>`;
    overlay.querySelector('.vb-sheet-body').appendChild(fields); // ย้ายช่องชุดเดิม ไม่สร้างซ้ำ
    document.body.appendChild(overlay);
    makeDialog(overlay, {
      label: 'ตัวกรองคำศัพท์', variant: 'sheet',
      onClose: () => { home.insertBefore(fields, anchor); vbUpdateFilterBtn(); },
    });
    overlay.querySelector('#vb-sheet-apply').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#vb-sheet-clear').addEventListener('click', () => {
      VB_FILTER_IDS.forEach((id) => { document.getElementById(id).value = ''; });
      vbState.page = 1; loadVocab();
    });
    vbUpdateFilterBtn();
  }
  document.getElementById('vb-filter-btn').addEventListener('click', openVocabFilterSheet);

  document.getElementById('vb-q').addEventListener('input', () => {
    clearTimeout(vbState.timer);
    vbState.timer = setTimeout(() => { vbState.page = 1; loadVocab(); }, 300);
  });
  ['vb-pos', 'vb-status', 'vb-source'].forEach((id) => document.getElementById(id)
    .addEventListener('change', () => { vbState.page = 1; loadVocab(); }));
  document.getElementById('vb-levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vb-level]');
    if (!b) return;
    vbState.level = b.dataset.vbLevel; vbState.page = 1; loadVocab();
  });
  document.getElementById('vb-prev').addEventListener('click', () => { if (vbState.page > 1) { vbState.page -= 1; loadVocab(); } });
  document.getElementById('vb-next').addEventListener('click', () => { vbState.page += 1; loadVocab(); });
  document.getElementById('vb-list').addEventListener('click', (e) => {
    const r = e.target.closest('[data-vb-id]');
    if (r) openVocabCard(r.dataset.vbId);
  });

  document.getElementById('vc-back').addEventListener('click', () => { showScreen('screen-vocab'); });
  document.getElementById('path-open-vocab').addEventListener('click', () => navigateTo('words'));

  // ---------------------------------------------------------------
  // FRIENDS — ระบบเพื่อน
  // ---------------------------------------------------------------
  const friendState = { friends: [], incoming: [], outgoing: [], searchResults: [] };

  document.getElementById('btn-friends-back').addEventListener('click', openHome);
  document.getElementById('friend-search-btn').addEventListener('click', doFriendSearch);
  document.getElementById('friend-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doFriendSearch(); }
  });

  async function openFriends() {
    showScreen('screen-friends');
    await loadFriendData();
    loadBlockedList();
    // ขอรายชื่อคนออนไลน์ล่าสุดอีกครั้ง เผื่อข้อมูลเก่า
    if (rt.socket && rt.socket.readyState === WebSocket.OPEN) {
      rt.socket.send(JSON.stringify({ type: 'presence:who' }));
    }
  }

  async function loadFriendData() {
    try {
      const [fr, rq] = await Promise.all([
        api('/friends'),
        api('/friends/requests'),
      ]);
      friendState.friends = fr.friends || [];
      friendState.incoming = rq.incoming || [];
      friendState.outgoing = rq.outgoing || [];
      // รายชื่อเพื่อนเปลี่ยน (เช่น เพิ่งตอบรับกัน) -> ขอสถานะออนไลน์ใหม่ ให้จุดเขียว/แชทแสดงถูก
      if (rt.socket && rt.socket.readyState === WebSocket.OPEN) rt.socket.send(JSON.stringify({ type: 'presence:who' }));
      renderFriendsScreen();
      updateFriendBadges();
    } catch (err) {
      const list = document.getElementById('friends-list');
      if (list) list.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function updateFriendBadges() {
    const n = friendState.incoming.length;
    const badge = document.getElementById('friend-request-badge');
    if (badge) {
      badge.textContent = n;
      badge.classList.toggle('hidden', n === 0);
    }
    // ป้ายเดียวกันบน bottom nav
    const navBadge = document.getElementById('nav-friend-badge');
    if (navBadge) {
      navBadge.textContent = n;
      navBadge.classList.toggle('hidden', n === 0);
    }
    const sub = document.getElementById('home-friends-sub');
    if (sub) {
      const onlineFriends = friendState.friends.filter((f) => isUserOnline(f.id)).length;
      sub.textContent = friendState.friends.length === 0
        ? 'ยังไม่มีเพื่อน — ค้นหาเพื่อนได้เลย'
        : `เพื่อน ${friendState.friends.length} คน · ออนไลน์ ${onlineFriends} คน`;
    }
  }

  // ใช้ข้อมูลสด ๆ จาก WebSocket ถ้ามี ไม่งั้นใช้ค่าที่ API ส่งมา
  function isUserOnline(userId) {
    if (rt.onlineIds.size > 0) return rt.onlineIds.has(userId);
    const f = friendState.friends.find((x) => x.id === userId);
    return f ? f.online : false;
  }

  function friendAvatarHtml(u) {
    if (u.avatarImage) {
      return `<div class="friend-avatar has-image">
                <img src="${u.avatarImage}" alt="">
              </div>`;
    }
    return `<div class="friend-avatar">${G.avatar(u.avatar)}</div>`;
  }

  function friendRowHtml(u, actionsHtml, { showStatus = true, menu = true } = {}) {
    const known = showStatus && u.online !== null;      // คนที่ไม่ใช่เพื่อน: เซิร์ฟเวอร์ไม่บอกสถานะ (ความเป็นส่วนตัว)
    const online = known && isUserOnline(u.id);
    return `
      <div class="friend-row">
        <div class="friend-avatar-wrap">
          ${friendAvatarHtml(u)}
          ${known ? `<span class="status-dot ${online ? 'online' : 'offline'}"></span>` : ''}
        </div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(u.username)}</div>
          <div class="friend-meta">
            LV.${u.level}${known ? ` · ${online ? '<span class="online-text">ออนไลน์</span>' : 'ออฟไลน์'}` : ''}
          </div>
        </div>
        <div class="friend-actions">${actionsHtml}${menu ? `<button class="mini-btn ghost friend-more" type="button" data-user-menu="${u.id}" data-user-name="${escapeHtml(u.username)}" aria-label="ตัวเลือกสำหรับ ${escapeHtml(u.username)}">⋯</button>` : ''}</div>
      </div>
    `;
  }

  function renderFriendsScreen() {
    // --- คำขอที่เข้ามา ---
    const reqSection = document.getElementById('friend-requests-section');
    const reqList = document.getElementById('friend-requests-list');
    reqSection.classList.toggle('hidden', friendState.incoming.length === 0);
    document.getElementById('requests-count').textContent = friendState.incoming.length;
    reqList.innerHTML = friendState.incoming.map((u) => friendRowHtml(u, `
      <button class="mini-btn accept" data-accept="${u.friendshipId}">ตอบรับ</button>
      <button class="mini-btn ghost" data-decline="${u.friendshipId}">ปฏิเสธ</button>
    `)).join('');

    // --- คำขอที่ส่งไป ---
    const outSection = document.getElementById('friend-outgoing-section');
    const outList = document.getElementById('friend-outgoing-list');
    outSection.classList.toggle('hidden', friendState.outgoing.length === 0);
    outList.innerHTML = friendState.outgoing.map((u) => friendRowHtml(u, `
      <button class="mini-btn ghost" data-cancel="${u.friendshipId}">ยกเลิก</button>
    `)).join('');

    // --- รายชื่อเพื่อน ---
    const list = document.getElementById('friends-list');
    document.getElementById('friends-count').textContent = friendState.friends.length;
    if (friendState.friends.length === 0) {
      list.innerHTML = G.emptyState({ art: 'empty-friends', title: 'ยังไม่มีเพื่อน', text: 'ค้นหาชื่อผู้ใช้เพื่อเพิ่มเพื่อน แล้วชวนมาแข่งคำศัพท์ด้วยกัน', cta: { label: 'ค้นหาเพื่อน', icon: 'user-plus', secondary: true, attrs: 'data-focus-friend-search' }, compact: true });
    } else {
      // เรียงใหม่ทุกครั้ง เพราะสถานะออนไลน์เปลี่ยนได้ตลอด
      const sorted = [...friendState.friends].sort((a, b) => {
        const ao = isUserOnline(a.id), bo = isUserOnline(b.id);
        if (ao !== bo) return ao ? -1 : 1;
        return b.exp - a.exp;
      });
      list.innerHTML = sorted.map((u) => friendRowHtml(u, `
        <button class="mini-btn accept" type="button" data-chat-open="${u.id}" aria-label="แชทกับ ${escapeHtml(u.username)}"><svg class="icon icon-sm" aria-hidden="true"><use href="/assets/icons/icons.svg#message-circle"></use></svg> แชท</button>
        <button class="mini-btn ghost" data-remove="${u.friendshipId}">ลบ</button>
      `)).join('');
    }

    updateFriendBadges();
  }

  // ---------- Social Safety: บล็อก / รายงาน ----------
  const REPORT_REASONS_TH = [
    ['spam', 'สแปม / ส่งคำขอหรือคำเชิญรบกวน'], ['harassment', 'คุกคาม / พฤติกรรมไม่เหมาะสม'],
    ['inappropriate_name', 'ชื่อหรือรูปไม่เหมาะสม'], ['cheating', 'โกงในการแข่ง'], ['other', 'อื่น ๆ'],
  ];
  function openUserMenu(userId, name) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card user-menu">
        <h2 class="vb-sheet-title">${escapeHtml(name)}</h2>
        <button class="home-link" type="button" data-act="report">รายงานผู้ใช้นี้</button>
        <button class="home-link home-link-danger" type="button" data-act="block">บล็อก</button>
        <p class="vd-note">บล็อกแล้ว: เลิกเป็นเพื่อน · ส่งคำขอ/เชิญเข้าห้อง/ค้นหาชื่อกันไม่ได้ · ปลดบล็อกได้ในหน้าเพื่อน</p>
      </div>`;
    document.body.appendChild(overlay);
    makeDialog(overlay, { label: `ตัวเลือกสำหรับ ${name}`, variant: 'sheet' });
    overlay.querySelector('[data-act="report"]').addEventListener('click', () => { overlay.remove(); openReportDialog(userId, name); });
    overlay.querySelector('[data-act="block"]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await api(`/friends/block/${userId}`, { method: 'POST' });
        overlay.remove();
        toast(`บล็อก ${name} แล้ว`, 'success');
        loadFriendData(); loadBlockedList();
      } catch (err) { toast(err.message, 'error'); e.currentTarget.disabled = false; }
    });
  }
  function openReportDialog(userId, name) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<form class="modal-card report-form" novalidate>
        <h2 class="vb-sheet-title">รายงาน ${escapeHtml(name)}</h2>
        <fieldset class="report-reasons"><legend>เหตุผล</legend>
          ${REPORT_REASONS_TH.map(([v, t], i) => `<label class="report-reason"><input type="radio" name="reason" value="${v}" ${i === 0 ? 'data-autofocus' : ''}> ${t}</label>`).join('')}
        </fieldset>
        <label class="report-label" for="report-details">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label>
        <textarea id="report-details" maxlength="500" rows="3"></textarea>
        <div class="form-error" role="alert" id="report-error"></div>
        <button class="btn btn-primary btn-block" type="submit">ส่งรายงาน</button>
      </form>`;
    document.body.appendChild(overlay);
    makeDialog(overlay, { label: `รายงาน ${name}`, variant: 'sheet' });
    overlay.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = (overlay.querySelector('input[name="reason"]:checked') || {}).value;
      if (!reason) { overlay.querySelector('#report-error').textContent = 'กรุณาเลือกเหตุผล'; return; }
      try {
        const r = await api('/friends/report', { method: 'POST', body: { userId, reason, details: overlay.querySelector('#report-details').value } });
        overlay.remove();
        toast(r.message, 'success');
      } catch (err) { overlay.querySelector('#report-error').textContent = err.message; }
    });
  }
  async function loadBlockedList() {
    const box = document.getElementById('blocked-list');
    try {
      const { blocked } = await api('/friends/blocked');
      document.getElementById('blocked-section').classList.toggle('hidden', blocked.length === 0);
      box.innerHTML = blocked.map((u) => friendRowHtml(u, `<button class="mini-btn ghost" type="button" data-unblock="${u.id}">ปลดบล็อก</button>`, { showStatus: false, menu: false })).join('');
    } catch (_) { /* ไม่ critical */ }
  }
  document.getElementById('screen-friends').addEventListener('click', async (e) => {
    const m = e.target.closest('[data-user-menu]');
    if (m) { openUserMenu(Number(m.dataset.userMenu), m.dataset.userName); return; }
    const ub = e.target.closest('[data-unblock]');
    if (ub) {
      ub.disabled = true;
      try { await api(`/friends/block/${ub.dataset.unblock}`, { method: 'DELETE' }); toast('ปลดบล็อกแล้ว', 'success'); loadBlockedList(); }
      catch (err) { toast(err.message, 'error'); ub.disabled = false; }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-focus-friend-search]')) {
      const inp = document.getElementById('friend-search-input');
      if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus({ preventScroll: true }); }
    }
  });

  async function doFriendSearch() {
    const input = document.getElementById('friend-search-input');
    const box = document.getElementById('friend-search-results');
    const q = input.value.trim();
    if (q.length < 2) {
      box.innerHTML = '<div class="friend-empty">พิมพ์อย่างน้อย 2 ตัวอักษร</div>';
      return;
    }
    box.innerHTML = G.skeleton('list', 2);
    try {
      const { results } = await api(`/friends/search?q=${encodeURIComponent(q)}`);
      friendState.searchResults = results;
      if (results.length === 0) {
        box.innerHTML = G.emptyState({ art: 'empty-search', title: 'ไม่พบผู้ใช้ที่ตรงกับคำค้นหา', text: 'ตรวจตัวสะกดชื่อผู้ใช้ แล้วลองใหม่อีกครั้ง', compact: true });
        return;
      }
      box.innerHTML = results.map((u) => {
        let action;
        if (u.relation === 'friend') action = '<span class="relation-tag">เป็นเพื่อนแล้ว</span>';
        else if (u.relation === 'requested') action = '<span class="relation-tag">รอตอบรับ</span>';
        else if (u.relation === 'incoming') {
          action = `<button class="mini-btn accept" data-accept="${u.friendshipId}">ตอบรับ</button>`;
        } else {
          action = `<button class="mini-btn accept" data-add="${u.id}">+ เพิ่มเพื่อน</button>`;
        }
        return friendRowHtml(u, action, { showStatus: u.relation === 'friend' });
      }).join('');
    } catch (err) {
      box.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  // ใช้ event delegation ตัวเดียวคุมปุ่มทั้งหน้า (ปุ่มถูกสร้างใหม่บ่อย)
  document.getElementById('screen-friends').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-add], button[data-accept], button[data-decline], button[data-cancel], button[data-remove]');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.add) {
        const res = await api('/friends/request', {
          method: 'POST', body: { userId: Number(btn.dataset.add) },
        });
        toast(res.message || 'ส่งคำขอแล้ว', 'success');
        await doFriendSearch();
      } else if (btn.dataset.accept) {
        await api(`/friends/${btn.dataset.accept}/accept`, { method: 'POST' });
        toast('เป็นเพื่อนกันแล้ว!', 'success');
        document.getElementById('friend-search-results').innerHTML = '';
      } else if (btn.dataset.decline) {
        await api(`/friends/${btn.dataset.decline}/decline`, { method: 'POST' });
        toast('ปฏิเสธคำขอแล้ว');
      } else if (btn.dataset.cancel) {
        await api(`/friends/${btn.dataset.cancel}`, { method: 'DELETE' });
        toast('ยกเลิกคำขอแล้ว');
      } else if (btn.dataset.remove) {
        await api(`/friends/${btn.dataset.remove}`, { method: 'DELETE' });
        toast('ลบเพื่อนแล้ว');
      }
      await loadFriendData();
    } catch (err) {
      toast(err.message || 'ทำรายการไม่สำเร็จ', 'error');
      btn.disabled = false;
    }
  });


  // ---------------------------------------------------------------
  // ปุ่ม "เพิ่มเพื่อน" บนกระดานอันดับ (EXP และ Ranked)
  //   แถวที่มี data-uid + ช่อง .lb-friend -> ถามสถานะความสัมพันธ์ทีเดียวทั้งหน้า แล้วใส่ปุ่มตามสถานะ
  // ---------------------------------------------------------------
  const ICON = (n) => `<svg class="icon icon-sm" aria-hidden="true"><use href="/assets/icons/icons.svg#${n}"></use></svg>`;
  function friendButtonHtml(uid, rel, name) {
    const nm = escapeHtml(name || '');
    switch (rel) {
      case 'none': return `<button class="lb-fr-btn" type="button" data-fr-add="${uid}" aria-label="เพิ่ม ${nm} เป็นเพื่อน" title="เพิ่มเพื่อน">${ICON('user-plus')}</button>`;
      case 'pending_in': return `<button class="lb-fr-btn is-accept" type="button" data-fr-add="${uid}" aria-label="ตอบรับคำขอจาก ${nm}" title="ตอบรับคำขอ">${ICON('user-check')}</button>`;
      case 'pending_out': return `<span class="lb-fr-chip" title="ส่งคำขอแล้ว">${ICON('hourglass')}<span class="sr-only">ส่งคำขอแล้ว</span></span>`;
      case 'friend': return `<button class="lb-fr-btn is-friend" type="button" data-chat-open="${uid}" aria-label="แชทกับ ${nm}" title="แชท">${ICON('message-circle')}</button>`;
      default: return '';
    }
  }
  async function attachFriendButtons(container) {
    if (!container) return;
    const rows = [...container.querySelectorAll('[data-uid]')];
    const ids = [...new Set(rows.map((r) => Number(r.dataset.uid)).filter((x) => x > 0))];
    if (!ids.length) return;
    try {
      const { relations } = await api(`/friends/relations?ids=${ids.join(',')}`);
      rows.forEach((r) => {
        const slot = r.querySelector('.lb-friend');
        if (!slot) return;
        const name = (r.querySelector('.leaderboard-username, .rk-lb-main b') || {}).textContent || '';
        slot.innerHTML = friendButtonHtml(Number(r.dataset.uid), relations[r.dataset.uid], name.replace(/ \(คุณ\)$/, ''));
      });
    } catch (_) { /* ไม่มีปุ่มก็ยังดูอันดับได้ */ }
  }
  document.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-fr-add]');
    if (add) {
      e.preventDefault();
      add.disabled = true;
      try {
        const r = await api('/friends/request', { method: 'POST', body: { userId: Number(add.dataset.frAdd) } });
        toast(r.message || 'ส่งคำขอเป็นเพื่อนแล้ว', 'success');
        const accepted = r.status === 'accepted';
        add.outerHTML = friendButtonHtml(Number(add.dataset.frAdd), accepted ? 'friend' : 'pending_out', '');
        loadFriendData();
      } catch (err) { toast(err.message, 'error'); add.disabled = false; }
      return;
    }
    const ch = e.target.closest('[data-chat-open]');
    if (ch) { e.preventDefault(); openChat(Number(ch.dataset.chatOpen)); return; }
    const nv = e.target.closest('[data-nav-to]');
    if (nv) navigateTo(nv.dataset.navTo);
  });

  // ---------------------------------------------------------------
  // แชทกับเพื่อน (DM) — ข้อความตัวอักษรล้วน · escape ทุกครั้ง · ส่งผ่าน REST รับแบบ realtime
  // ---------------------------------------------------------------
  const chatState = { peer: null, messages: [], more: false, loading: false, unread: 0, convos: [] };

  function setChatUnread(n) {
    chatState.unread = Math.max(0, n | 0);
    const b = document.getElementById('hud-chat-badge');
    if (b) { b.textContent = chatState.unread > 99 ? '99+' : chatState.unread; b.classList.toggle('hidden', chatState.unread === 0); }
  }
  async function refreshChatUnread() {
    try { const { unread } = await api('/chat/unread'); setChatUnread(unread); } catch (_) { /* ไม่ critical */ }
  }
  on('hud-chat', 'click', () => navigateTo('chat'));
  on('chat-back-home', 'click', () => navigateTo('play'));
  on('chat-thread-back', 'click', () => { closeThread(); loadConversations(); });

  function chatTime(at) {
    const d = new Date(at);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  function chatAvatar(u) {
    return u.avatarImage ? `<div class="friend-avatar has-image"><img src="${escapeHtml(u.avatarImage)}" alt=""></div>`
      : `<div class="friend-avatar">${G.avatar(u.avatar)}</div>`;
  }

  async function openChat(userId) {
    showScreen('screen-chat');
    window.scrollTo(0, 0);
    // เพื่อนใหม่ที่เพิ่งตอบรับ: ขอสถานะออนไลน์ล่าสุด
    if (rt.socket && rt.socket.readyState === WebSocket.OPEN) rt.socket.send(JSON.stringify({ type: 'presence:who' }));
    if (userId) { await openThread(userId); return; }
    closeThread();
    loadConversations();
  }

  async function loadConversations() {
    const box = document.getElementById('chat-convos');
    box.innerHTML = G.skeleton('list', 3);
    try {
      const { conversations, unreadTotal } = await api('/chat/conversations');
      chatState.convos = conversations;
      setChatUnread(unreadTotal);
      if (!conversations.length) {
        box.innerHTML = G.emptyState({ art: 'empty-friends', title: 'ยังไม่มีเพื่อนให้คุยด้วย', text: 'เพิ่มเพื่อนจากหน้าเพื่อนหรือจากกระดานอันดับ แล้วกลับมาคุยกันที่นี่', cta: { label: 'ไปหน้าเพื่อน', icon: 'user-plus', secondary: true, attrs: 'data-nav-to="friends"' }, compact: true });
        return;
      }
      box.innerHTML = conversations.map((c) => `
        <button class="chat-convo${c.unread ? ' has-unread' : ''}" type="button" data-chat-open="${c.userId}">
          <span class="friend-avatar-wrap">${chatAvatar(c)}<span class="status-dot ${isUserOnline(c.userId) || c.online ? 'online' : 'offline'}"></span></span>
          <span class="chat-convo-main">
            <b>${escapeHtml(c.username)}</b>
            <small>${c.last ? `${c.last.mine ? 'คุณ: ' : ''}${escapeHtml(c.last.body)}` : 'ยังไม่มีข้อความ — ทักทายกันเลย'}</small>
          </span>
          <span class="chat-convo-meta">${c.last ? `<small>${chatTime(c.last.at)}</small>` : ''}${c.unread ? `<span class="nav-badge">${c.unread}</span>` : ''}</span>
        </button>`).join('');
    } catch (err) {
      box.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function closeThread() {
    chatState.peer = null;
    chatState.messages = [];
    document.getElementById('chat-thread-view').classList.add('hidden');
    document.getElementById('chat-list-view').classList.remove('hidden');
  }

  async function openThread(userId) {
    const friend = friendState.friends.find((f) => f.id === userId) || chatState.convos.find((c) => c.userId === userId);
    chatState.peer = {
      id: userId,
      username: friend ? friend.username : 'เพื่อน',
      avatar: friend ? friend.avatar : 'fox',
      avatarImage: friend ? (friend.avatarImage || null) : null,
    };
    chatState.messages = [];
    document.getElementById('chat-list-view').classList.add('hidden');
    document.getElementById('chat-thread-view').classList.remove('hidden');
    renderPeer();
    const box = document.getElementById('chat-messages');
    box.innerHTML = G.skeleton('list', 2);
    try {
      const { messages, more } = await api(`/chat/${userId}/messages`);
      if (!chatState.peer || chatState.peer.id !== userId) return;
      chatState.messages = messages;
      chatState.more = more;
      renderMessages(true);
      markRead(userId);
    } catch (err) {
      box.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
      document.getElementById('chat-compose').classList.toggle('hidden', true);
      return;
    }
    document.getElementById('chat-compose').classList.remove('hidden');
    const inp = document.getElementById('chat-input');
    if (window.matchMedia('(pointer: fine)').matches) inp.focus();
  }

  function renderPeer() {
    const p = chatState.peer;
    const online = isUserOnline(p.id);
    document.getElementById('chat-peer').innerHTML = `
      <span class="friend-avatar-wrap">${chatAvatar(p)}<span class="status-dot ${online ? 'online' : 'offline'}"></span></span>
      <span><b>${escapeHtml(p.username)}</b><small>${online ? 'ออนไลน์' : 'ออฟไลน์'}</small></span>`;
  }

  function bubbleHtml(m, prev) {
    const day = new Date(m.at).toDateString();
    const sep = !prev || new Date(prev.at).toDateString() !== day
      ? `<div class="chat-day">${new Date(m.at).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</div>` : '';
    return `${sep}<div class="chat-bubble ${m.mine ? 'mine' : 'theirs'}${m.pending ? ' pending' : ''}" data-mid="${m.id}">
      <span class="chat-text">${escapeHtml(m.body)}</span>
      <small class="chat-meta">${new Date(m.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}${m.mine && m.readAt ? ' · อ่านแล้ว' : ''}</small>
    </div>`;
  }

  function renderMessages(scrollBottom) {
    const box = document.getElementById('chat-messages');
    const msgs = chatState.messages;
    const head = chatState.more ? '<button class="mini-btn ghost chat-older" type="button" id="chat-older">โหลดข้อความก่อนหน้า</button>' : '';
    const body = msgs.length ? msgs.map((m, i) => bubbleHtml(m, msgs[i - 1])).join('')
      : `<div class="chat-empty">เริ่มคุยกับ ${escapeHtml(chatState.peer.username)} ได้เลย — สุภาพกันนะ</div>`;
    const prevH = box.scrollHeight, prevTop = box.scrollTop;
    box.innerHTML = head + body;
    if (scrollBottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = box.scrollHeight - prevH + prevTop;   // โหลดข้อความเก่า: คงตำแหน่งที่อ่านอยู่
    const older = document.getElementById('chat-older');
    if (older) older.addEventListener('click', loadOlder);
  }

  async function loadOlder() {
    if (chatState.loading || !chatState.messages.length) return;
    chatState.loading = true;
    try {
      const peer = chatState.peer.id;
      const { messages, more } = await api(`/chat/${peer}/messages?before=${chatState.messages[0].id}`);
      if (!chatState.peer || chatState.peer.id !== peer) return;
      chatState.messages = messages.concat(chatState.messages);
      chatState.more = more;
      renderMessages(false);
    } catch (err) { toast(err.message, 'error'); }
    finally { chatState.loading = false; }
  }

  async function markRead(userId) {
    try { await api(`/chat/${userId}/read`, { method: 'POST' }); refreshChatUnread(); } catch (_) { /* ไม่ critical */ }
  }

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(120, chatInput.scrollHeight)}px`;
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('chat-compose').requestSubmit(); }
    });
  }
  on('chat-compose', 'submit', async (e) => {
    e.preventDefault();
    const peer = chatState.peer;
    const body = chatInput.value.trim();
    if (!peer || !body) return;
    if (body.length > 500) { toast('ข้อความยาวได้ไม่เกิน 500 ตัวอักษร', 'error'); return; }
    const tmp = { id: `tmp-${Date.now()}`, mine: true, body, at: new Date().toISOString(), pending: true };
    chatState.messages.push(tmp);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    renderMessages(true);
    try {
      const { message } = await api(`/chat/${peer.id}/messages`, { method: 'POST', body: { body } });
      const i = chatState.messages.indexOf(tmp);
      if (i >= 0) {
        if (chatState.messages.some((m) => m.id === message.id)) chatState.messages.splice(i, 1);   // echo มาก่อนแล้ว
        else chatState.messages[i] = message;
      }
      renderMessages(true);
    } catch (err) {
      chatState.messages = chatState.messages.filter((m) => m !== tmp);
      renderMessages(true);
      chatInput.value = body;
      toast(err.message, 'error');
    }
  });
  on('chat-peer-menu', 'click', () => { if (chatState.peer) openUserMenu(chatState.peer.id, chatState.peer.username); });

  function chatThreadOpenWith(userId) {
    return chatState.peer && chatState.peer.id === userId && currentScreenIs('screen-chat')
      && !document.getElementById('chat-thread-view').classList.contains('hidden');
  }

  function onChatMessage(msg) {
    const m = msg.message;
    if (!m) return;
    const other = m.mine ? m.to : m.from;
    if (chatThreadOpenWith(other)) {
      if (!chatState.messages.some((x) => x.id === m.id)) {
        // ข้อความของเราจากแท็บนี้เองจะมาแทน tmp ตอน REST ตอบ — echo จากแท็บอื่นค่อยเพิ่ม
        if (!(m.mine && chatState.messages.some((x) => x.pending && x.body === m.body))) {
          chatState.messages.push(m);
          renderMessages(true);
        }
      }
      if (!m.mine) markRead(other);
      return;
    }
    if (msg.echo || m.mine) return;
    setChatUnread(chatState.unread + 1);
    if (currentScreenIs('screen-chat')) loadConversations();
    // ระหว่างแข่ง Ranked ไม่เด้งแจ้งเตือน (ไม่รบกวนสมาธิ) — มีป้ายบนปุ่มแชทพอ
    if (!currentScreenIs('screen-ranked-match') && msg.from) {
      toast(`${msg.from.username}: ${m.body.length > 40 ? `${m.body.slice(0, 40)}…` : m.body}`, 'info');
    }
  }

  function onChatRead(msg) {
    if (!chatThreadOpenWith(msg.by)) return;
    const now = new Date().toISOString();
    chatState.messages.forEach((m) => { if (m.mine && !m.readAt && !m.pending) m.readAt = now; });
    renderMessages(true);
  }

  // ---------------------------------------------------------------
  // MAP screen
  // ---------------------------------------------------------------
  async function loadMap() {
    const track = document.getElementById('trail-track');
    track.innerHTML = G.skeleton('grid', 3);
    try {
      const { summary } = await api('/progress/summary');
      state.summary = summary;
      renderMap();
    } catch (err) {
      track.innerHTML = `<div class="form-error" style="text-align:center;">${err.message}</div>`;
    }
  }

  function renderMap() {
    const track = document.getElementById('trail-track');
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
    track.innerHTML = '';

    levels.forEach((lvl, idx) => {
      const meta = LEVEL_META[lvl];
      const s = state.summary[lvl];
      const pct = s.total ? (s.known >= s.total ? 100 : Math.floor((s.known / s.total) * 100)) : 0;

      const row = document.createElement('div');
      row.className = 'trail-node-row';
      row.innerHTML = `
        <button class="trail-node node-${lvl.toLowerCase()}" data-level="${lvl}">
          <div class="node-scene">${G.emblem(lvl, { size: 'lg' })}</div>
          <div class="node-info">
            <div class="node-title">${lvl} ${G.LEVELS[lvl].name} <span class="node-world">· ${meta.name}</span></div>
            <div class="node-sub">${meta.sub} · ${s.total} คำ</div>
            <div class="node-progress-bar-bg"><div class="node-progress-bar-fill" style="width:${pct}%;"></div></div>
          </div>
          <div class="node-cta">${pct}%<br>รู้แล้ว</div>
        </button>`;
      track.appendChild(row);

      if (idx < levels.length - 1) {
        const rail = document.createElement('div');
        rail.className = 'rail';
        track.appendChild(rail);
      }
    });

    track.querySelectorAll('.trail-node').forEach((btn) => {
      btn.addEventListener('click', () => startSession(btn.dataset.level));
    });
  }

  // ---------------------------------------------------------------
  // LEADERBOARD screen
  // ---------------------------------------------------------------
  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    showScreen('screen-leaderboard');
    loadLeaderboard();
  });
  document.getElementById('btn-leaderboard-back').addEventListener('click', () => navigateTo('play'));

  // แท็บ: สัปดาห์นี้ (ค่าเริ่มต้น — ผู้ใช้ใหม่แข่งได้) / เดือนนี้ / ตลอดกาล / เพื่อน (สัปดาห์นี้)
  const LB_TABS = {
    week: { q: 'period=week', sub: 'EXP ที่ได้ตั้งแต่วันจันทร์ — ทุกคนเริ่มนับใหม่ทุกสัปดาห์', unit: 'EXP สัปดาห์นี้', empty: 'ยังไม่มีใครได้ EXP สัปดาห์นี้ — เริ่มเรียนเพื่อขึ้นเป็นอันดับแรก!' },
    month: { q: 'period=month', sub: 'EXP ที่ได้ตั้งแต่วันที่ 1 ของเดือนนี้', unit: 'EXP เดือนนี้', empty: 'ยังไม่มีใครได้ EXP เดือนนี้' },
    all: { q: 'period=all', sub: 'EXP สะสมทั้งหมดตั้งแต่เริ่มเล่น', unit: 'EXP', empty: 'ยังไม่มีข้อมูลผู้เล่น' },
    friends: { q: 'period=week&scope=friends', sub: 'เทียบ EXP สัปดาห์นี้กับเพื่อนของคุณ', unit: 'EXP สัปดาห์นี้', empty: 'ยังไม่มีเพื่อนที่ได้ EXP สัปดาห์นี้ — ชวนเพื่อนมาเรียนด้วยกันได้ที่เมนูเพื่อน' },
  };
  let lbTab = 'week';
  async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    const tab = LB_TABS[lbTab];
    // เฉพาะแท็บของกระดาน EXP (หน้า Ranked มีแท็บชุดของตัวเอง — ห้ามแตะ)
    document.querySelectorAll('#lb-tabs .lb-tab').forEach((b) => {
      const on = b.dataset.lb === lbTab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    document.getElementById('lb-sub').textContent = tab.sub;
    list.innerHTML = '<div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>';
    try {
      const { top, me } = await api(`/leaderboard?${tab.q}`);
      renderLeaderboard(top, me, tab);
    } catch (err) {
      list.innerHTML = `<div class="state-error-card"><p>${escapeHtml(err.message)}</p><button class="btn btn-secondary" type="button" id="lb-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('lb-retry').addEventListener('click', loadLeaderboard);
    }
  }
  document.getElementById('lb-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (!b || b.dataset.lb === lbTab) return;
    lbTab = b.dataset.lb;
    loadLeaderboard();
  });

  function leaderboardRowHtml(entry, unit = 'EXP') {
    const rankClass = entry.rank && entry.rank <= 3 ? ` rank-${entry.rank}` : '';
    const meClass = entry.isMe ? ' is-me' : '';
    const medal = G.rankBadge(entry.rank);
    const avatarContent = G.avatar(entry.avatar, entry.avatarImage || null);
    const avatarClass = entry.avatarImage ? 'leaderboard-avatar has-image' : 'leaderboard-avatar';
    return `
      <div class="leaderboard-row${rankClass}${meClass}"${entry.userId ? ` data-uid="${Number(entry.userId)}"` : ''}>
        <div class="leaderboard-rank">${medal}</div>
        <div class="${avatarClass}">${avatarContent}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-username">${escapeHtml(entry.username)}${entry.isMe ? ' (คุณ)' : ''}</div>
          <div class="leaderboard-level">LV.${entry.level}</div>
        </div>
        <div class="leaderboard-exp"><b>${(entry.score ?? entry.exp).toLocaleString()}</b> <small>${unit}</small></div>
        <span class="lb-friend"></span>
      </div>`;
  }

  function renderLeaderboard(top, me, tab = LB_TABS.all) {
    const list = document.getElementById('leaderboard-list');
    const row = (e) => leaderboardRowHtml(e, tab.unit);
    if (!top || top.length === 0) {
      list.innerHTML = `${G.emptyState({ art: 'leaderboard', title: 'ยังไม่มีอันดับในช่วงนี้', text: tab.empty, cta: { label: 'ไปเรียนเก็บ EXP', id: 'lb-empty-learn', icon: 'play' } })}${me ? row(me) : ''}`;
      const go = document.getElementById('lb-empty-learn');
      if (go) go.addEventListener('click', () => navigateTo('learn'));
      return;
    }
    let html = top.map(row).join('');
    // อันดับของตัวเองแสดงเสมอ แม้ไม่ติด Top (หรือยังไม่มีคะแนนในช่วงนี้)
    if (me && !top.some((r) => r.isMe)) {
      html += `<div class="leaderboard-divider" aria-hidden="true">⋯</div>${row(me)}`;
    }
    list.innerHTML = html;
    attachFriendButtons(list);
  }

  document.getElementById('btn-exit-game').addEventListener('click', () => {
    if (state.session && state.session.index > 0) {
      const ok = confirm('ออกจากด่านนี้ตอนนี้เลยไหม? ความก้าวหน้าที่ทำไปแล้วจะถูกบันทึกไว้');
      if (!ok) return;
    }
    state.session = null;
    showScreen('screen-map');
    loadMap();
  });

  // ---------------------------------------------------------------
  // GAME screen
  // ---------------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------------------------------------------------------
  // เสียงอ่าน (Text-to-Speech) — ใช้ Web Speech API ของเบราว์เซอร์ (ฟรี ไม่ต้องมีไฟล์เสียง)
  // คุณภาพเสียงขึ้นกับเครื่อง/เบราว์เซอร์ของผู้ใช้
  // ---------------------------------------------------------------
  // ---------- เสียงอ่าน (Web Speech API) + การตั้งค่าสำเนียง/ความเร็ว (จำค่าไว้) ----------
  const TTS_PREF_KEY = 'eq_tts_pref';
  const tts = {
    supported: typeof window !== 'undefined' && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance === 'function',
    voice: null,
    voices: { US: null, GB: null },
    accent: 'US',   // 'US' | 'GB'
    speed: 1,       // 1 | 0.75
  };
  try {
    const p = JSON.parse(localStorage.getItem(TTS_PREF_KEY) || '{}');
    if (p.accent === 'GB' || p.accent === 'US') tts.accent = p.accent;
    if (p.speed === 0.75 || p.speed === 1) tts.speed = p.speed;
  } catch (_) { /* ไม่มีค่าที่บันทึก */ }
  function saveTtsPref() {
    try { localStorage.setItem(TTS_PREF_KEY, JSON.stringify({ accent: tts.accent, speed: tts.speed })); } catch (_) { /* โหมดส่วนตัว */ }
  }
  // เลือกเสียงภาษาอังกฤษ — บนมือถือที่ตั้งภาษาไทย เสียงเริ่มต้นอาจเป็นเสียงไทยซึ่งอ่านอังกฤษเพี้ยน
  function pickEnglishVoice() {
    if (!tts.supported) return;
    const voices = window.speechSynthesis.getVoices() || [];
    tts.voices.US = voices.find((v) => /^en[-_]US/i.test(v.lang)) || null;
    tts.voices.GB = voices.find((v) => /^en[-_]GB/i.test(v.lang)) || null;
    tts.voice = tts.voices[tts.accent] || tts.voices.US || tts.voices.GB
      || voices.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (tts.supported) {
    pickEnglishVoice();
    // บางเบราว์เซอร์ (Chrome) โหลดรายชื่อเสียงทีหลัง
    window.speechSynthesis.onvoiceschanged = pickEnglishVoice;
  }
  function setTtsAccent(accent) { tts.accent = accent; pickEnglishVoice(); saveTtsPref(); }
  function setTtsSpeed(speed) { tts.speed = speed; saveTtsPref(); }
  function speak(text, rate = 0.9) {
    if (!tts.supported || !text) return false;
    window.speechSynthesis.cancel(); // หยุดเสียงเดิมก่อน กันเสียงซ้อน
    const u = new SpeechSynthesisUtterance(text);
    u.lang = (tts.voice && tts.voice.lang) || (tts.accent === 'GB' ? 'en-GB' : 'en-US');
    if (tts.voice) u.voice = tts.voice;
    u.rate = rate * tts.speed;
    // หรี่เพลงประกอบระหว่างอ่านออกเสียง ให้ได้ยินคำศัพท์ชัด แล้วค่อยกลับมาเท่าเดิม
    if (window.EQAudio) {
      window.EQAudio.duck(true);
      const restore = () => window.EQAudio.duck(false);
      u.onend = restore; u.onerror = restore;
      setTimeout(restore, 8000);   // กันกรณีเบราว์เซอร์ไม่ส่ง onend
    }
    window.speechSynthesis.speak(u);
    return true;
  }
  // ตัดวงเล็บอธิบายออกก่อนอ่าน เช่น "bank (money)" -> "bank"
  function speakableWord(word) {
    return String(word || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  }

  // เนื้อหาพจนานุกรมของคำในรอบเล่นปัจจุบัน { wordId: {ipa, definition, example, synonyms} }
  let wordDict = {};
  let currentSpeakWord = '';
  let currentSpeakExample = '';

  // โหมดฟัง: หลังตอบแล้วแสดงคำและคำอ่านให้เห็น
  function revealListeningWord(q) {
    document.getElementById('card-word-front').textContent = q.word;
    const d = wordDict[q.id] || {};
    const ipaEl = document.getElementById('card-ipa');
    if (d.ipa) { ipaEl.textContent = `/${d.ipa}/`; ipaEl.classList.remove('hidden'); }
  }

  document.getElementById('card-speak').addEventListener('click', () => speak(currentSpeakWord));
  document.getElementById('word-dict-ex-speak').addEventListener('click', () => speak(currentSpeakExample, 0.85));

  // แสดงข้อมูลเสริมจากพจนานุกรมหลังตอบ
  // ใช้ textContent ทั้งหมด (ไม่ใช้ innerHTML) เพราะข้อมูลมาจากแหล่งภายนอก
  function showWordDict(wordId) {
    const d = wordDict[wordId];
    const panel = document.getElementById('word-dict');
    if (!d || !d.definition) {
      panel.classList.add('hidden');
      return;
    }
    document.getElementById('word-dict-def').textContent = d.definition;

    const exEl = document.getElementById('word-dict-ex');
    const exSpeak = document.getElementById('word-dict-ex-speak');
    if (d.example) {
      exEl.textContent = `“${d.example}”`;
      exEl.classList.remove('hidden');
      currentSpeakExample = d.example;
      exSpeak.classList.toggle('hidden', !tts.supported);
    } else {
      exEl.classList.add('hidden');
      exSpeak.classList.add('hidden');
    }

    const synEl = document.getElementById('word-dict-syn');
    if (d.synonyms && d.synonyms.length) {
      synEl.textContent = `คำพ้อง: ${d.synonyms.join(', ')}`;
      synEl.classList.remove('hidden');
    } else {
      synEl.classList.add('hidden');
    }
    panel.classList.remove('hidden');
  }

  // unit (ไม่บังคับ): { id, title, wordIds } — ถ้าส่งมา ฝึกเฉพาะคำใน Unit นั้น
  // ถ้าไม่ส่ง ทำงานแบบเดิมทุกอย่าง (ฝึกทั้งระดับ)
  // opts.listening: โหมดฟัง — ได้ยินเสียงแล้วเลือกคำที่ได้ยิน (ไม่ต้องใช้คำแปลไทย)
  async function startSession(level, unit = null, opts = {}) {
    const listening = Boolean(opts.listening);
    if (listening && !tts.supported) {
      toast('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน ลองใช้ Chrome หรือ Safari', 'error');
      return;
    }
    showScreen('screen-game');
    document.getElementById('game-level-chip').textContent =
      `${unit ? `${level} · ${unit.title}` : level}${listening ? ' · โหมดฟัง' : ''}`;
    document.getElementById('game-level-chip').style.background = LEVEL_META[level].color;
    document.getElementById('footprints').innerHTML = '<div class="skeleton skel-line" style="width:60%;margin:0 auto"></div>';
    document.getElementById('quiz-choices').innerHTML = '';
    document.getElementById('btn-quiz-next').classList.add('hidden');
    document.getElementById('card-word-front').textContent = '...';
    setQuizLoading(true);

    try {
      const data = await api(`/words/${level}${listening ? '?mode=listening' : ''}`);
      // คำไวยากรณ์ (det/pron/prep/conj/modal/aux/exclam/number) ไม่มีความหมาย
      // ที่ยืนเดี่ยว ๆ แปลได้ชัดเจนแบบคำนาม/กริยา/คุณศัพท์ทั่วไป (เช่น "its",
      // "the", "can") บริการแปลฟรีมักแปลผิดความหมายสำหรับคำกลุ่มนี้ จึงตัด
      // ออกจากโหมดเลือกความหมายไปเลย เหลือไว้เฉพาะคำที่มีความหมายชัดเจน
      const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);
      const unitIds = unit ? new Set(unit.wordIds) : null;
      const words = data.words.filter((w) => CONTENT_CATEGORIES.has(w.category)
        && (!unitIds || unitIds.has(w.id)));
      const notKnown = words.filter((w) => w.status !== 'known');
      const known = words.filter((w) => w.status === 'known');

      // ฝึกเฉพาะคำที่ยังไม่รู้ — คำที่ตอบถูกแล้วไม่ถูกดึงมาเติมให้ครบรอบอีก (เดิมวนกลับมาตลอด)
      // ถ้ารู้ครบทุกคำแล้ว รอบนี้จึงเป็นการทบทวนคำที่รู้แล้วแทน
      const allKnown = notKnown.length === 0 || Boolean(opts.reviewOnly);
      const candidatePool = allKnown ? shuffle(known) : shuffle(notKnown);
      if (notKnown.length === 0 && known.length) toast(unit ? 'Unit นี้รู้ครบแล้ว — รอบนี้เป็นการทบทวน' : 'ระดับนี้รู้ครบแล้ว — รอบนี้เป็นการทบทวน', 'success');
      const sessionCandidates = candidatePool.slice(0, SESSION_SIZE);
      // ตัวลวง: โหมดปกติใช้คำที่เหลือในระดับ / โหมด Unit ใช้คำ "นอก Unit" ในระดับเดียวกัน
      // เพราะ Unit มีแค่ 8–27 คำ ถ้าใช้ตัวลวงจาก Unit อย่างเดียวอาจไม่พอสร้าง 4 ตัวเลือก
      const decoySource = unitIds
        ? shuffle(data.words.filter((w) => CONTENT_CATEGORIES.has(w.category) && !unitIds.has(w.id)))
        : shuffle(words.filter((w) => !sessionCandidates.includes(w))); // ตัวลวงจากคำอื่นในระดับ (รวมคำที่รู้แล้ว)
      const backupCandidates = decoySource.slice(0, 20);
      const allCandidates = [...sessionCandidates, ...backupCandidates];

      // ดึงคำแปลกับเนื้อหาพจนานุกรมพร้อมกัน (ไม่ต้องรอทีละอย่าง)
      // เนื้อหาพจนานุกรมเป็นข้อมูลเสริม — ถ้าดึงไม่สำเร็จก็เล่นต่อได้ตามปกติ
      const ids = allCandidates.map((w) => w.id);
      const [{ translations }, dictRes] = await Promise.all([
        // โหมดฟังไม่ต้องใช้คำแปล — ไม่เรียกบริการแปล (ประหยัดโควตา และใช้ได้แม้ยังไม่มีคำแปล)
        listening
          ? Promise.resolve({ translations: {} })
          : api('/translate', { method: 'POST', body: { wordIds: ids } }),
        api(`/words/content?ids=${encodeURIComponent(ids.join(','))}`).catch(() => ({ content: {} })),
      ]);
      wordDict = dictRes.content || {};

      // ข้อความบนตัวเลือก: โหมดปกติ = คำแปลไทย / โหมดฟัง = ตัวคำภาษาอังกฤษ
      const displayOf = (w) => (listening ? speakableWord(w.word) : translations[w.id]);
      const translatedPool = allCandidates
        .filter((w) => displayOf(w))
        .map((w) => ({ ...w, th: displayOf(w) }));

      // กันคำซ้ำความหมาย (เช่น big / large แปลไทยเหมือนกัน) ไว้แค่ตัวแรกที่เจอ
      // เพราะ sessionCandidates เรียงมาก่อน backupCandidates ในลิสต์เสมอ
      // คำที่ผู้เล่นต้องตอบจะถูกเก็บไว้ก่อนคำสำรองที่ใช้เป็นตัวลวงเท่านั้น
      const seenText = new Set();
      const dedupedPool = [];
      const seenSound = new Set();
      for (const item of translatedPool) {
        const key = item.th.trim().toLowerCase();
        if (seenText.has(key)) continue;
        // โหมดฟัง: คำที่ออกเสียงเหมือนกัน (see/sea, right/write) ห้ามอยู่ในรอบเดียวกัน
        // ไม่งั้นผู้เรียนแยกไม่ได้ว่าได้ยินคำไหน — ข้อสอบกำกวม
        const ipa = listening && wordDict[item.id] && wordDict[item.id].ipa;
        const soundKey = ipa ? ipa.replace(/[ˈˌ]/g, '') : null;
        if (soundKey && seenSound.has(soundKey)) continue;
        seenText.add(key);
        if (soundKey) seenSound.add(soundKey);
        dedupedPool.push(item);
      }

      // ต้องมีคำแปลที่ใช้ได้พอสมควรก่อนเริ่มด่าน ไม่งั้นตัวเลือกจะเหลือ
      // น้อยเกินไป (เช่น 2 ตัวเลือกแทน 4) ดูเหมือนเกมพังและกดต่อไม่ได้
      // ดีกว่าแจ้งเตือนให้ลองใหม่ตั้งแต่แรกเลย
      const MIN_POOL_FOR_SESSION = 8;
      if (dedupedPool.length < MIN_POOL_FOR_SESSION) {
        toast(listening
          ? 'คำในชุดนี้ไม่พอสำหรับโหมดฟัง ลองเลือก Unit อื่น'
          : 'ระบบแปลคำศัพท์ขัดข้องชั่วคราว ลองใหม่อีกครั้งภายหลัง', 'error');
        if (unit) openPath(); else showScreen('screen-map'); // กลับไปหน้าที่ผู้เรียนมา
        return;
      }

      const sessionIds = new Set(sessionCandidates.map((w) => w.id));
      let queue = dedupedPool.filter((item) => sessionIds.has(item.id));
      // โหมด Unit: ถามเฉพาะคำใน Unit — ไม่เติมคำนอก Unit เป็นโจทย์ (รอบอาจสั้นกว่า 12 ข้อ)
      if (unit && queue.length === 0) {
        // คำที่เหลือยังไม่มีคำแปลที่ใช้ได้ (เช่น รอตรวจ) -> ไม่ปล่อยให้ติด: ทบทวนคำที่รู้แล้วใน Unit แทน
        if (!opts.reviewOnly && known.length) {
          toast('คำที่เหลือใน Unit นี้ยังรอตรวจคำแปล — รอบนี้ทบทวนคำที่รู้แล้วแทน', 'info');
          startSession(level, unit, { ...opts, reviewOnly: true });
          return;
        }
        toast('Unit นี้ยังไม่มีคำที่พร้อมฝึก (คำแปลรอตรวจ) ลอง Unit ถัดไปได้เลย', 'info');
        openPath();
        return;
      }
      // ไม่เติมคำอื่น (เช่นคำที่รู้แล้ว) เป็นโจทย์ให้ครบ 12 ข้อ — เหลือคำที่ยังไม่รู้น้อย รอบก็สั้นลงตามจริง
      queue = queue.slice(0, SESSION_SIZE);

      const questions = queue.map((item) => {
        const decoyCandidates = dedupedPool.filter((p) => p.id !== item.id);
        const decoys = shuffle(decoyCandidates).slice(0, Math.min(3, decoyCandidates.length));
        const options = shuffle([item, ...decoys]);
        return { ...item, options, level };
      });

      state.session = {
        level, queue: questions, index: 0, knownCount: 0, learningCount: 0, expGained: 0,
        mode: listening ? 'listening' : 'read',
      };
      renderFootprints();
      renderQuizCard();
    } catch (err) {
      toast(err.message, 'error');
      showScreen('screen-map');
    } finally {
      setQuizLoading(false);
    }
  }

  function setQuizLoading(isLoading) {
    document.getElementById('quiz-loading').classList.toggle('hidden', !isLoading);
  }

  function renderFootprints() {
    const wrap = document.getElementById('footprints');
    const { queue, index } = state.session;
    wrap.innerHTML = '';
    queue.forEach((_, i) => {
      const fp = document.createElement('div');
      fp.className = 'footprint';
      if (i < index) fp.classList.add('done');
      if (i === index) fp.classList.add('current');
      wrap.appendChild(fp);
    });
  }

  function renderQuizCard() {
    const { queue, index, level } = state.session;
    const q = queue[index];
    const meta = LEVEL_META[level];

    document.getElementById('card-level-tag-front').textContent = level;
    document.getElementById('card-level-tag-front').style.background = meta.color;
    document.getElementById('card-pos-chip-front').textContent = q.pos || '';
    document.getElementById('card-word-front').textContent = q.word;

    const dict = wordDict[q.id] || {};
    const ipaEl = document.getElementById('card-ipa');
    const listeningMode = state.session && state.session.mode === 'listening';
    currentSpeakWord = speakableWord(q.word);
    document.getElementById('card-speak').classList.toggle('hidden', !tts.supported);

    if (listeningMode) {
      // โหมดฟัง: ซ่อนตัวคำและ IPA ก่อนตอบ — IPA เฉลยคำได้ทันที (อ่าน /kæt/ ออกก็รู้ว่า cat)
      document.getElementById('card-word-front').innerHTML = `<span class="listen-glyph">${ic('headphones', 'icon-xl', 'ฟังเสียง')}</span>`;
      document.getElementById('card-question').textContent = 'ฟังแล้วเลือกคำที่ได้ยิน (กดปุ่มลำโพงเพื่อฟังซ้ำได้)';
      ipaEl.classList.add('hidden');
      setTimeout(() => speak(currentSpeakWord), 250); // เล่นเสียงอัตโนมัติ
    } else {
      document.getElementById('card-question').textContent = 'เลือกความหมายที่ถูกต้อง';
      // คำอ่าน (IPA) แสดงได้ตั้งแต่ก่อนตอบ เพราะไม่ได้เฉลยความหมาย
      if (dict.ipa) {
        ipaEl.textContent = `/${dict.ipa}/`;
        ipaEl.classList.remove('hidden');
      } else {
        ipaEl.classList.add('hidden');
      }
    }
    // ซ่อนข้อมูลพจนานุกรมของข้อก่อน (แสดงอีกทีหลังตอบ)
    document.getElementById('word-dict').classList.add('hidden');

    const choicesWrap = document.getElementById('quiz-choices');
    choicesWrap.innerHTML = '';
    q.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = opt.th;
      // เก็บ id ของคำที่ตัวเลือกนี้แทน เพื่อส่งให้เซิร์ฟเวอร์ตัดสินเอง
      btn.dataset.wordId = opt.id;
      btn.dataset.correct = opt.id === q.id ? 'true' : 'false'; // ใช้แค่ไฮไลต์เฉลยหลังเซิร์ฟเวอร์ตอบ
      btn.addEventListener('click', () => answerQuiz(btn, q));
      choicesWrap.appendChild(btn);
    });

    document.getElementById('btn-quiz-next').classList.add('hidden');
    document.getElementById('quiz-feedback').innerHTML = '';
    document.getElementById('srs-next-info').textContent = '';
  }

  // ---------- ตอบคำถาม ----------
  // ตอบแล้วส่งทันที ไม่มีแผงให้ประเมินความจำ (ลืม/ยาก/จำได้/ง่าย) — ลดขั้นตอน ไม่ต้องกดเพิ่มทุกข้อ
  // เซิร์ฟเวอร์ตรวจคำตอบจาก chosenWordId เอง · ตอบถูกใช้ระยะทบทวนแบบปกติ (good) · ตอบผิด = again
  function answerQuiz(clickedBtn, question) {
    const choicesWrap = document.getElementById('quiz-choices');
    choicesWrap.querySelectorAll('.quiz-choice').forEach((b) => { b.disabled = true; });
    const correct = clickedBtn.dataset.correct === 'true';
    if (correct) clickedBtn.classList.add('correct');
    submitAnswer(clickedBtn, question, correct ? 'good' : 'again');
  }
  // โหมดทบทวนถูกนำออกแล้ว — ไม่บอกนัดทบทวนบนการ์ด (ข้อมูลตาราง SRS ยังบันทึกไว้เหมือนเดิม)
  function describeNextReview() { return ''; }
  async function submitAnswer(clickedBtn, question, rating) {
    const session = state.session;
    const choicesWrap = document.getElementById('quiz-choices');
    const buttons = Array.from(choicesWrap.querySelectorAll('.quiz-choice'));
    try {
      const result = await api('/progress/review', {
        method: 'POST',
        body: {
          wordId: question.id,
          level: session.level,
          chosenWordId: clickedBtn.dataset.wordId,
          mode: session.mode || 'read',
          rating,
        },
      });
      document.getElementById('srs-next-info').textContent = describeNextReview(result.schedule, result.correct);

      // เซิร์ฟเวอร์เป็นคนบอกว่าถูกหรือผิด แล้วค่อยไฮไลต์
      const isCorrect = result.correct;
      buttons.forEach((b) => {
        if (b.dataset.correct === 'true') b.classList.add('correct');
      });
      if (!isCorrect) clickedBtn.classList.add('wrong');
      // แผงผลตอบ: ถูก = CircleCheck · ผิด = CircleX + คำตอบที่ถูก
      const rightBtn = buttons.find((b) => b.dataset.correct === 'true');
      document.getElementById('quiz-feedback').innerHTML = isCorrect
        ? G.feedback(true, 'ถูกต้อง', `<b>${escapeHtml(question.word)}</b> = ${escapeHtml(rightBtn ? rightBtn.textContent : '')}`)
        : G.feedback(false, 'ยังไม่ถูก', `คำตอบที่ถูก: <b>${escapeHtml(rightBtn ? rightBtn.textContent : '')}</b>`);
      if (session.mode === 'listening') revealListeningWord(question);
      showWordDict(question.id);

      // บอก EXP ในแผงผลตอบเสมอ: ได้เท่าไร หรือทำไมไม่ได้
      const fbText = document.querySelector('#quiz-feedback .feedback-text');
      const kindLabel = { new: ' (คำใหม่)', review: ' (ทวนคำเดิม)', attempt: ' (กำลังใจ)' }[result.expKind] || '';
      const hrs = (result.expRules && result.expRules.cooldownHours) || 20;
      const expNote = result.gainedExp > 0 ? `+${result.gainedExp} EXP${kindLabel}`
        : result.noExpReason === 'cooldown' ? `ไม่ได้ EXP — คำนี้ได้ EXP ไปแล้วภายใน ${hrs} ชั่วโมง (ทวนอีกครั้งพรุ่งนี้ได้ EXP)`
        : result.noExpReason === 'repeat' ? 'ไม่ได้ EXP — ตอบผิดคำนี้ซ้ำ' : '';
      if (fbText && expNote) {
        fbText.insertAdjacentHTML('beforeend', `<span class="feedback-exp ${result.gainedExp > 0 ? 'is-gain' : 'is-none'}">${ic(result.gainedExp > 0 ? 'sparkles' : 'info', 'icon-sm')} ${escapeHtml(expNote)}</span>`);
      }
      if (result.gainedExp > 0) popExp(result.gainedExp);
      session.expGained += result.gainedExp;
      if (isCorrect) session.knownCount += 1; else session.learningCount += 1;

      state.user.exp = result.levelInfo.exp;
      state.user.level = result.levelInfo.level;
      state.user.expIntoLevel = result.levelInfo.expIntoLevel;
      state.user.expForNextLevel = result.levelInfo.expForNextLevel;
      state.user.progressPercent = result.levelInfo.progressPercent;
      renderHud();

      if (result.leveledUp) {
        showLevelUp(result.levelInfo);
      }
    } catch (err) {
      toast(err.message, 'error');
    }

    showNextButton();
  }

  /*
    ปุ่ม "ถัดไป" ลอยติดขอบล่างจอเสมอ (ไม่ต้องเลื่อนลงไปหา) · ไม่ข้ามข้อเอง — ผู้เรียนกดเองเมื่อพร้อม · Enter / Space = ถัดไป
  */
  function showNextButton() {
    document.getElementById('btn-quiz-next').classList.remove('hidden');
  }
  document.getElementById('btn-quiz-next').addEventListener('click', () => nextCard());
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !currentScreenIs('screen-game')) return;
    const btn = document.getElementById('btn-quiz-next');
    if (btn.classList.contains('hidden') || document.body.classList.contains('dialog-open')) return;
    if (e.target.closest && e.target.closest('button:not(.quiz-choice), input, textarea, select, a') && e.target !== btn) return;
    e.preventDefault(); nextCard();
  });

  function nextCard() {
    const session = state.session;
    if (!session) return;
    session.index += 1;
    if (session.index >= session.queue.length) {
      finishSession();
      return;
    }
    renderFootprints();
    renderQuizCard();
  }

  function finishSession() {
    const session = state.session;
    document.getElementById('summary-known').textContent = session.knownCount;
    document.getElementById('summary-learning').textContent = session.learningCount;
    document.getElementById('summary-exp').textContent = session.expGained;
    const total = session.knownCount + session.learningCount;
    const good = total && session.knownCount / total >= 0.7;
    document.getElementById('session-result-art').innerHTML = G.mascot(good ? 'success' : 'encouragement', 'mascot-lg');
    document.getElementById('summary-sub').textContent = good ? 'เก่งมาก ไปต่อกันเลย' : 'ฝึก Unit นี้อีกรอบเพื่อจำให้แม่นขึ้นได้เลย';
    showScreen('screen-summary');
    loadMap();
  }

  document.getElementById('btn-summary-map').addEventListener('click', () => {
    state.session = null;
    showScreen('screen-map');
  });
  document.getElementById('btn-summary-again').addEventListener('click', () => {
    const lvl = state.session ? state.session.level : 'A1';
    startSession(lvl);
  });

  // ---------------------------------------------------------------
  // GRAMMAR — บทเรียน + ข้อสอบท้ายบท (หลายโหมด: basic → expert + TOEIC/TOEFL)
  // ---------------------------------------------------------------
  // โหมดข้อสอบแกรมม่า — icon = ชื่อไอคอน Lucide · color = สีจาก design tokens (เข้มพอให้ไอคอนขาวผ่าน contrast)
  const MODE_META = {
    basic:        { icon: 'sprout',         name: 'พื้นฐาน',  color: 'var(--a1-strong)', tier: 1 },
    intermediate: { icon: 'leaf',           name: 'ปานกลาง',  color: 'var(--a2-strong)', tier: 2 },
    advanced:     { icon: 'trees',          name: 'ยาก',      color: 'var(--b1-strong)', tier: 3 },
    expert:       { icon: 'mountain',       name: 'ยากมาก',   color: 'var(--b2-strong)', tier: 4 },
    toeic:        { icon: 'briefcase',      name: 'TOEIC',    color: 'var(--c1-strong)', tier: 5 },
    toefl:        { icon: 'graduation-cap', name: 'TOEFL',    color: 'var(--color-primary)', tier: 6 },
  };
  const chapterIcon = (c) => G.iconName(c.icon, G.CHAPTER_ICON[c.id || c.chapterId] || 'book');

  const grammarState = {
    chapters: [],
    currentChapter: null,
    currentModes: [],   // modes summary from GET /grammar/:id
    quiz: null,         // { chapterId, mode, title, questions[], answers[], index }
  };

  document.getElementById('btn-grammar-back').addEventListener('click', () => {
    openHome();
  });
  document.getElementById('btn-lesson-back').addEventListener('click', openGrammarList);
  document.getElementById('btn-quiz-back').addEventListener('click', () => {
    if (grammarState.currentChapter) {
      openLesson(grammarState.currentChapter.id);
    } else {
      openGrammarList();
    }
  });
  document.getElementById('btn-gr-lesson').addEventListener('click', () => {
    if (grammarState.currentChapter) openLesson(grammarState.currentChapter.id);
    else openGrammarList();
  });
  document.getElementById('btn-gr-retry').addEventListener('click', () => {
    if (grammarState.quiz && grammarState.currentChapter) {
      startQuiz(grammarState.currentChapter.id, grammarState.quiz.mode);
    }
  });

  // ---------- Grammar Learning Path ----------
  async function openGrammarList() {
    showScreen('screen-grammar-list');
    const wrap = document.getElementById('grammar-chapters');
    wrap.innerHTML = '<div class="skeleton skeleton-card"></div>';
    try {
      grammarState.path = await api('/grammar/path');
      if (!grammarState.openStage) grammarState.openStage = grammarState.path.recommendedMode;
      renderGrammarList();
    } catch (err) {
      wrap.innerHTML = `<div class="state-error-card"><p>โหลดเส้นทางแกรมม่าไม่สำเร็จ</p><button class="btn btn-secondary" type="button" id="gp-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('gp-retry').addEventListener('click', openGrammarList);
    }
  }

  function renderGrammarList() {
    const d = grammarState.path;
    const next = document.getElementById('gp-next');
    if (d.next) {
      next.classList.remove('hidden');
      next.innerHTML = `<span class="gp-next-label">${d.placementBased ? 'แนะนำจากผลวัดระดับ' : 'บทถัดไปที่แนะนำ'}</span>
        <b>${ic(chapterIcon(d.next))} ${escapeHtml(d.next.title)}</b><span>${G.emblem(d.next.level, { size: 'xs' })} ${escapeHtml(d.next.level)}</span>
        <button class="btn btn-primary" type="button" data-gp-open="${escapeHtml(d.next.chapterId)}" data-gp-mode="${escapeHtml(d.next.mode)}">เรียนต่อ</button>`;
    } else next.classList.add('hidden');
    document.getElementById('grammar-chapters').innerHTML = d.stages.map((st) => {
      const open = grammarState.openStage === st.mode;
      const rec = d.recommendedMode === st.mode;
      const chapters = !open ? '' : `<ol class="gp-chapters">${st.chapters.map((c) => `
        <li><button class="gp-ch${c.passed ? ' passed' : ''}" type="button" data-gp-open="${escapeHtml(c.id)}" data-gp-mode="${st.mode}">
          <span class="gp-ch-icon" aria-hidden="true">${ic(c.passed ? 'check' : chapterIcon(c))}</span>
          <span class="gp-ch-main">
            <span class="gp-ch-title">${escapeHtml(c.title)}</span>
            <span class="gp-ch-meta">${ic('clock', 'icon-sm')} ~${c.minutes} นาที · ${c.questions} ข้อ${c.mastery !== null ? ` · ความแม่นยำ ${c.mastery}%` : ''}</span>
            <span class="home-progress" aria-hidden="true"><span style="width:${c.percent}%"></span></span>
          </span>
          <span class="gp-ch-status">${c.passed ? G.mark('ok', 'ผ่าน') : c.attempted ? `${c.percent}%` : 'เริ่ม'}</span>
        </button></li>`).join('')}</ol>`;
      return `<section class="gp-stage${open ? ' open' : ''}">
        <button class="gp-stage-head" type="button" data-gp-stage="${st.mode}" aria-expanded="${open}">
          ${G.LEVELS[st.level] ? G.emblem(st.level, { size: 'sm' }) : `<span class="gp-level">${escapeHtml(st.level)}</span>`}
          <span class="gp-stage-name"><b>${escapeHtml(st.title)}</b><small>${st.passed}/${st.total} บท${rec ? ' · แนะนำ' : ''}</small></span>
          <span class="path-level-chev${open ? ' open' : ''}" aria-hidden="true">${ic('chevron-right')}</span>
        </button>${chapters}</section>`;
    }).join('');
  }
  document.getElementById('screen-grammar-list').addEventListener('click', (e) => {
    const st = e.target.closest('[data-gp-stage]');
    if (st) { grammarState.openStage = grammarState.openStage === st.dataset.gpStage ? null : st.dataset.gpStage; renderGrammarList(); return; }
    const op = e.target.closest('[data-gp-open]');
    if (op) { grammarState.preferMode = op.dataset.gpMode; openLesson(op.dataset.gpOpen); }
  });

  async function openLesson(chapterId) {
    showScreen('screen-grammar-lesson');
    const head = document.getElementById('lesson-head');
    const body = document.getElementById('lesson-body');
    head.innerHTML = G.skeleton('card');
    body.innerHTML = '';
    const actionsWrap = document.querySelector('.grammar-lesson-actions');
    if (actionsWrap) actionsWrap.innerHTML = '';
    try {
      const { chapter, modes } = await api(`/grammar/${chapterId}`);
      grammarState.currentChapter = chapter;
      grammarState.currentModes = modes || [];
      document.getElementById('lesson-badge').textContent = `บทที่ ${chapter.num}`;
      head.style.background = `linear-gradient(135deg, ${chapter.color}22, var(--bg-night-2))`;
      head.innerHTML = `
        <div class="lesson-icon">${ic(chapterIcon(chapter), 'icon-xl')}</div>
        <div class="lesson-title">${chapter.title}</div>
        <div class="lesson-intro">${chapter.intro}</div>
      `;
      body.innerHTML = chapter.sections.map((s) => renderSectionCard(s)).join('');
      // เนื้อหาบทเรียนมีเครื่องหมาย ✅ ❌ ⚠️ 💡 จำนวนมาก -> แปลงเป็นไอคอนชุดเดียวกับทั้งเว็บตอนแสดงผล
      G.iconize(head);
      G.iconize(body);
      renderModeSelector();
    } catch (err) {
      head.innerHTML = `<div class="form-error">${err.message}</div>`;
    }
  }

  function renderModeSelector() {
    const actionsWrap = document.querySelector('.grammar-lesson-actions');
    if (!actionsWrap) return;
    const modes = grammarState.currentModes || [];
    if (!modes.length) {
      actionsWrap.innerHTML = '<div class="mode-selector-empty">บทนี้ยังไม่มีข้อสอบ</div>';
      return;
    }
    // แยกกลุ่ม: tier (basic-expert) กับ exam (toeic/toefl)
    const tierModes = modes.filter((m) => ['basic','intermediate','advanced','expert'].includes(m.mode));
    const examModes = modes.filter((m) => ['toeic','toefl'].includes(m.mode));

    let html = `<div class="mode-selector-title">${ic('list-checks')} เลือกโหมดข้อสอบ</div>`;
    if (tierModes.length) {
      html += '<div class="mode-selector-sub">ระดับความยาก</div>';
      html += '<div class="mode-selector-grid">';
      tierModes.forEach((m) => { html += renderModeCard(m); });
      html += '</div>';
    }
    if (examModes.length) {
      html += '<div class="mode-selector-sub">แนวข้อสอบมาตรฐาน</div>';
      html += '<div class="mode-selector-grid">';
      examModes.forEach((m) => { html += renderModeCard(m); });
      html += '</div>';
    }
    actionsWrap.innerHTML = html;
    actionsWrap.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        startQuiz(grammarState.currentChapter.id, btn.dataset.mode);
      });
    });
  }

  function renderModeCard(m) {
    const meta = MODE_META[m.mode] || { icon: 'file-pen-line', name: m.mode, color: 'var(--color-text-muted)', tier: 0 };
    const p = m.progress;
    const scoreLine = p
      ? `<div class="mode-card-score">${p.score === p.total ? ic('award', 'icon-sm', 'คะแนนเต็ม') : ''} ${p.score}/${p.total}</div>`
      : `<div class="mode-card-score not-done">ยังไม่ทำ</div>`;
    const perfectClass = p && p.score === p.total && p.total > 0 ? ' perfect' : '';
    return `
      <button class="mode-card${perfectClass}${grammarState.preferMode === m.mode ? ' recommended' : ''}" data-mode="${m.mode}" style="border-color: ${meta.color};">
        ${grammarState.preferMode === m.mode ? '<span class="mode-card-rec">ขั้นที่เลือกจากเส้นทาง</span>' : ''}
        <div class="mode-card-icon" style="background: ${meta.color};">${ic(meta.icon, 'icon-lg')}</div>
        <div class="mode-card-body">
          <div class="mode-card-name">${meta.name}</div>
          <div class="mode-card-count">${m.count} ข้อ</div>
        </div>
        ${scoreLine}
      </button>
    `;
  }

  function renderSectionCard(section) {
    const examples = (section.examples || []).map((ex) => `
      <div class="example-item">
        <div class="example-en">${ex.en}</div>
        <div class="example-th">${escapeHtml(ex.th)}</div>
      </div>
    `).join('');
    const practiceHtml = (section.practice || []).map((p, pi) => {
      const choices = p.choices.map((c, ci) =>
        `<button class="practice-choice" data-correct="${ci === p.correctIndex ? '1' : '0'}" data-explain="${escapeHtml(p.explain)}">${escapeHtml(c)}</button>`
      ).join('');
      return `
        <div class="practice-block" data-idx="${pi}">
          <div class="practice-label">${ic('lightbulb', 'icon-sm')} ลองทำดู</div>
          <div class="practice-prompt">${escapeHtml(p.prompt)}</div>
          <div class="practice-choices">${choices}</div>
          <div class="practice-feedback hidden"></div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-card">
        <div class="section-heading">${escapeHtml(section.heading)}</div>
        <div class="section-content">${section.content}</div>
        ${examples ? `<div class="examples-list">${examples}</div>` : ''}
        ${practiceHtml ? `<div class="practice-wrap">${practiceHtml}</div>` : ''}
      </div>
    `;
  }

  // Event delegation for practice choices — bound once, works for all sections
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.practice-choice');
    if (!btn) return;
    const block = btn.closest('.practice-block');
    if (!block || block.dataset.answered === '1') return;
    block.dataset.answered = '1';

    const isCorrect = btn.dataset.correct === '1';
    const explain = btn.dataset.explain;
    block.querySelectorAll('.practice-choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.correct === '1') b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
    const fb = block.querySelector('.practice-feedback');
    fb.classList.remove('hidden');
    fb.className = `practice-feedback ${isCorrect ? 'correct' : 'wrong'}`;
    fb.innerHTML = G.feedback(isCorrect, isCorrect ? 'ถูกต้อง' : 'ยังไม่ถูก', `<span class="practice-explain">${explain}</span>`);
    G.iconize(fb);
  });

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function startQuiz(chapterId, mode = 'basic') {
    showScreen('screen-grammar-quiz');
    const choicesEl = document.getElementById('grammar-quiz-choices');
    choicesEl.innerHTML = '<div class="loading-spinner"></div>';
    // ซ่อน passage ระหว่าง loading
    const passageEl = document.getElementById('grammar-quiz-passage');
    if (passageEl) passageEl.classList.add('hidden');
    try {
      const data = await api(`/grammar/${chapterId}/quiz?mode=${encodeURIComponent(mode)}`);
      grammarState.quiz = {
        chapterId: data.chapterId,
        mode: data.mode,
        title: data.title,
        questions: data.quiz,
        answers: new Array(data.quiz.length).fill(null),
        index: 0,
        attemptId: data.attemptId,
        typing: false,
      };
      const meta = MODE_META[data.mode] || { icon: 'file-pen-line', name: data.mode };
      document.getElementById('quiz-badge').innerHTML = `${ic(G.iconName(meta.icon, 'file-pen-line'), 'icon-sm')} ${escapeHtml(meta.name)}`;
      renderQuizQuestion();
    } catch (err) {
      choicesEl.innerHTML = `<div class="form-error">${err.message}</div>`;
    }
  }

  function renderQuizQuestion() {
    const q = grammarState.quiz;
    const question = q.questions[q.index];
    const pct = ((q.index) / q.questions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${pct}%`;
    document.getElementById('quiz-count').textContent = `ข้อ ${q.index + 1} / ${q.questions.length}`;
    document.getElementById('grammar-quiz-question').textContent = question.question;

    // Passage display (สำหรับ TOEIC/TOEFL)
    const passageEl = document.getElementById('grammar-quiz-passage');
    if (passageEl) {
      if (question.passage) {
        // แสดง passage แบบยุบ/ขยายได้ ถ้าข้อก่อนหน้ามี passage เดียวกันจะแสดงย่ออยู่แล้ว
        const prevQuestion = q.index > 0 ? q.questions[q.index - 1] : null;
        const sameGroup = prevQuestion && prevQuestion.groupId === question.groupId && question.groupId;
        passageEl.classList.remove('hidden');
        passageEl.classList.toggle('collapsed', !!sameGroup);
        passageEl.innerHTML = `
          <div class="passage-header">
            <span class="passage-title">${ic('book-open', 'icon-sm')} ${escapeHtml(question.passageTitle || 'บทอ่าน')}</span>
            <button class="passage-toggle" type="button">${sameGroup ? 'แสดงบทอ่าน' : 'ซ่อน'}</button>
          </div>
          <div class="passage-body">${escapeHtml(question.passage).replace(/\n/g, '<br>')}</div>
        `;
        passageEl.querySelector('.passage-toggle').addEventListener('click', () => {
          passageEl.classList.toggle('collapsed');
          passageEl.querySelector('.passage-toggle').textContent =
            passageEl.classList.contains('collapsed') ? 'แสดงบทอ่าน' : 'ซ่อน';
        });
      } else {
        passageEl.classList.add('hidden');
        passageEl.innerHTML = '';
      }
    }

    const choicesWrap = document.getElementById('grammar-quiz-choices');
    choicesWrap.innerHTML = '';
    question.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = choice;
      btn.addEventListener('click', () => chooseAnswer(i));
      choicesWrap.appendChild(btn);
    });
    document.getElementById('gq-feedback').classList.add('hidden');
    document.getElementById('gq-next').classList.add('hidden');
    const canType = Boolean(question.typeable);
    document.getElementById('gq-type-toggle').classList.toggle('hidden', !canType);
    setTypingMode(canType && q.typing);
  }
  function setTypingMode(on) {
    const q = grammarState.quiz;
    q.typing = on;
    document.getElementById('gq-type').classList.toggle('hidden', !on);
    document.getElementById('grammar-quiz-choices').classList.toggle('hidden', on);
    document.getElementById('gq-type-toggle').textContent = on ? 'เลือกจากตัวเลือกแทน' : 'พิมพ์คำตอบเอง (ยากขึ้น)';
    const input = document.getElementById('gq-type-input');
    input.value = ''; input.disabled = false;
    document.getElementById('gq-type-submit').disabled = false;
    if (on) input.focus({ preventScroll: true });
  }
  document.getElementById('gq-type-toggle').addEventListener('click', () => setTypingMode(!grammarState.quiz.typing));
  document.getElementById('gq-type-submit').addEventListener('click', () => {
    const v = document.getElementById('gq-type-input').value.trim();
    if (v) checkGrammar({ text: v });
  });
  document.getElementById('gq-type-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('gq-type-submit').click(); }
  });

  function chooseAnswer(choiceIndex) { checkGrammar({ choice: choiceIndex }); }

  // ตรวจทีละข้อ -> แสดงผล + คำอธิบายทันที (รูปแบบ: ผิด -> คำตอบที่ถูก -> เหตุผล)
  async function checkGrammar(answer) {
    const q = grammarState.quiz;
    const question = q.questions[q.index];
    const btns = Array.from(document.querySelectorAll('#grammar-quiz-choices .quiz-choice'));
    btns.forEach((b) => { b.disabled = true; });
    document.getElementById('gq-type-input').disabled = true;
    document.getElementById('gq-type-submit').disabled = true;
    try {
      const r = await api(`/grammar/${q.chapterId}/check`, {
        method: 'POST', body: { attemptId: q.attemptId, index: q.index, ...answer },
      });
      q.answers[q.index] = r.chosenIndex;
      document.getElementById('gq-type-toggle').classList.add('hidden'); // ตอบแล้ว = ล็อก สลับวิธีตอบไม่ได้
      btns.forEach((b, i) => {
        if (i === r.correctIndex) b.classList.add('correct');
        else if (i === r.chosenIndex) b.classList.add('wrong');
      });
      const filled = (word) => escapeHtml(question.question).replace(/_{2,}/, `<u><b>${escapeHtml(word)}</b></u>`);
      const fb = document.getElementById('gq-feedback');
      fb.className = `gq-feedback ${r.correct ? 'ok' : 'bad'}`;
      fb.innerHTML = r.correct
        ? `<div class="gq-verdict">${ic('circle-check', 'icon-lg')} ถูกต้อง</div>
           ${/_{2,}/.test(question.question) ? `<p class="gq-sentence">${filled(r.correctAnswer)}</p>` : ''}
           <p class="gq-explain"><b>คำอธิบาย:</b> ${escapeHtml(r.explain)}</p>`
        : `<div class="gq-verdict">${ic('circle-x', 'icon-lg')} ยังไม่ถูก${answer.text !== undefined ? ` — คุณพิมพ์ “${escapeHtml(answer.text)}”` : ''}</div>
           <p class="gq-correct"><b>คำตอบที่ถูก:</b> ${/_{2,}/.test(question.question) ? filled(r.correctAnswer) : escapeHtml(r.correctAnswer)}</p>
           <p class="gq-explain"><b>คำอธิบาย:</b> ${escapeHtml(r.explain)}</p>`;
      G.iconize(fb);
      const nextBtn = document.getElementById('gq-next');
      nextBtn.innerHTML = q.index < q.questions.length - 1 ? `ข้อถัดไป ${ic('chevron-right', 'icon-sm')}` : 'ดูผลคะแนน';
      nextBtn.classList.remove('hidden');
      fb.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      nextBtn.focus({ preventScroll: true });
    } catch (err) {
      if (err.code === 'ATTEMPT_EXPIRED') { toast(err.message, 'error'); startQuiz(q.chapterId, q.mode); return; }
      toast(err.message, 'error');
      btns.forEach((b) => { b.disabled = false; });
      document.getElementById('gq-type-input').disabled = false;
      document.getElementById('gq-type-submit').disabled = false;
    }
  }
  document.getElementById('gq-next').addEventListener('click', () => {
    const q = grammarState.quiz;
    if (q.index < q.questions.length - 1) { q.index += 1; renderQuizQuestion(); } else { submitQuizAnswers(); }
  });

  async function submitQuizAnswers() {
    const q = grammarState.quiz;
    try {
      // เซิร์ฟเวอร์ให้คะแนนจากคำตอบที่ตรวจ/ล็อกไว้ใน attempt
      const result = await api(`/grammar/${q.chapterId}/submit`, {
        method: 'POST',
        body: { attemptId: q.attemptId },
      });
      showQuizResult(result);
    } catch (err) {
      toast(err.message || 'ส่งคำตอบไม่สำเร็จ', 'error');
    }
  }

  function showQuizResult(result) {
    showScreen('screen-grammar-result');
    const wrongCount = result.total - result.score;
    const pct = result.score / result.total;
    // คะแนนเต็ม = Platinum · ผ่าน 70% = Silver · ต่ำกว่านั้น = Mascot (คิด/ให้กำลังใจ) — ไม่มีหน้าตาตลก
    const art = result.perfect ? G.tierBadge('platinum', '', 'tier-xl tier-unlock', 'เหรียญแพลทินัม คะแนนเต็ม')
      : pct >= 0.7 ? G.tierBadge('silver', '', 'tier-xl tier-unlock', 'เหรียญเงิน ผ่านเกณฑ์')
      : G.mascot(pct >= 0.4 ? 'thinking' : 'encouragement', 'mascot-lg');
    const title = result.perfect ? 'สุดยอด! ตอบถูกหมดเลย' : pct >= 0.7 ? 'เก่งมาก!' : pct >= 0.4 ? 'พอใช้ได้' : 'ลองใหม่นะ';
    const modeMeta = MODE_META[result.mode] || { icon: 'file-pen-line', name: result.mode };
    document.getElementById('gr-icon').innerHTML = art;
    document.getElementById('gr-title').textContent = title;
    document.getElementById('gr-score').textContent = `${result.score} / ${result.total}`;
    document.getElementById('gr-correct-num').textContent = result.score;
    document.getElementById('gr-wrong-num').textContent = wrongCount;
    document.getElementById('gr-exp-num').textContent = result.gainedExp;
    let msg = `โหมด: ${modeMeta.name}`;
    if (result.gainedExp > 0) msg += ` · ได้ EXP เพิ่ม ${result.gainedExp} คะแนน!`;
    else if (result.previousBest > 0) msg += ' · ต้องทำได้ดีกว่าสถิติเดิมจึงจะได้ EXP เพิ่ม';
    document.getElementById('gr-message').textContent = msg;

    const reviewWrap = document.getElementById('gr-review');
    reviewWrap.innerHTML = result.results.map((r) => {
      const yourAnswer = r.chosenIndex != null ? r.choices[r.chosenIndex] : '(ไม่ตอบ)';
      const correctAnswer = r.choices[r.correctIndex];
      return `
        <div class="gr-review-item ${r.correct ? 'correct' : 'wrong'}">
          <div class="gr-review-q">${G.mark(r.correct ? 'ok' : 'bad')} ${escapeHtml(r.question)}</div>
          <div class="gr-review-a">
            คำตอบของคุณ: <b>${escapeHtml(yourAnswer)}</b>${r.correct ? '' : `<br>คำตอบที่ถูก: <b>${escapeHtml(correctAnswer)}</b>`}
            <br>${escapeHtml(r.explain)}
          </div>
        </div>
      `;
    }).join('');
    G.iconize(reviewWrap);

    if (result.levelInfo) {
      state.user.exp = result.levelInfo.exp;
      state.user.level = result.levelInfo.level;
      state.user.expIntoLevel = result.levelInfo.expIntoLevel;
      state.user.expForNextLevel = result.levelInfo.expForNextLevel;
      state.user.progressPercent = result.levelInfo.progressPercent;
      renderHud();
      if (result.leveledUp) showLevelUp(result.levelInfo);
    }
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  // สะพานให้โมดูลแยก (public/js/ranked.js) ใช้ตัวช่วยกลางของแอป — ไม่ต้องรวมโค้ดทั้งหมดไว้ในไฟล์นี้
  function applyLevelInfo(info, leveledUp) {
    if (!info || !state.user || info.exp < (state.user.exp || 0)) return;   // ข้อมูลเก่ากว่าที่มีอยู่ -> ไม่ย้อน
    Object.assign(state.user, { exp: info.exp, level: info.level, expIntoLevel: info.expIntoLevel,
      expForNextLevel: info.expForNextLevel, progressPercent: info.progressPercent });
    renderHud();
    if (leveledUp) setTimeout(() => showLevelUp(info), 1600);   // ให้เห็นผลการแข่งก่อน
  }
  window.EQApp = {
    applyLevelInfo,
    api, showScreen, navigateTo, toast, escapeHtml, makeDialog, renderHud, openPlacement, openGrammarList,
    rtSend, get rtConnected() { return Boolean(rt.socket && rt.socket.readyState === 1); },
    rtSetFast, setLeaveGuard: (fn) => { leaveGuard = fn; }, attachFriendButtons, openChat,
    get user() { return state.user; },
    applyTheme, syncThemes, get themeChoice() { return currentThemeChoice(); }, themeState,
  };

  async function boot() {
    versionReady = loadVersion();
    initGoogleAuth(); // ไม่ await — ปุ่ม Google ไม่ควรทำให้หน้าเข้าสู่ระบบช้า
    // มาจากลิงก์ยืนยันอีเมล -> ยืนยันแล้วเข้าสู่ระบบ
    if (await checkVerifyLink()) return;
    // มาจากลิงก์รีเซ็ตรหัสผ่านในอีเมล → แสดงฟอร์มตั้งรหัสใหม่ก่อนเสมอ
    if (await checkResetLink()) return;
    if (!state.token) {
      showAuth();
      return;
    }
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      renderHud();
      showApp();
      // ถ้าเปิดมาพร้อมลิงก์เฉพาะหน้า (เช่น #/friends) ให้ไปหน้านั้น ไม่งั้นไปหน้าหลัก
      let initialPath = window.location.hash.replace(/^#\/?/, '').split('/')[0];
      if (initialPath === 'review') initialPath = 'learn';   // ลิงก์เก่าของโหมดทบทวน
      if (ROUTES[initialPath]) navigateTo(initialPath);
      else openHome();
      rtConnect();
      loadFriendData();
      refreshChatUnread();
      syncThemes();
      if (window.EQEvent) window.EQEvent.refresh();
    } catch (_err) {
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
      showAuth();
    }
  }

  let versionReady = null;
  let loadedVersion = null;   // เวอร์ชันเกมของหน้าที่เปิดอยู่ (ใช้แยก "อัปเดตเวอร์ชันใหม่" กับ "ปรับปรุงไฟล์ในเวอร์ชันเดิม")
  async function loadVersion() {
    try {
      const res = await fetch(API + '/health');
      const data = await res.json();
      if (data.version) {
        loadedVersion = data.version;
        document.getElementById('version-tag').textContent = `EnglishQuest v${data.version}`;
      }
    } catch (_err) {
      // ไม่ต้องทำอะไรถ้าดึงเวอร์ชันไม่ได้ ไม่ใช่ส่วนสำคัญของแอป
    }
  }

  // ลงทะเบียน Service Worker — ทำให้ติดตั้งเป็นแอปบนหน้าจอโทรศัพท์ได้
  // และเปิดใช้งานได้บ้างตอนออฟไลน์ (ใช้กลยุทธ์ network-first จึงไม่ค้างเวอร์ชันเก่า)
  // + แจ้งเวอร์ชันใหม่: sw.js ถูกประทับ hash ทุก deploy -> เบราว์เซอร์ติดตั้ง SW ใหม่ไว้รอ -> ผู้ใช้กด "อัปเดต"
  // ไฟล์หน้าเว็บเปลี่ยนแต่เลขเวอร์ชันเกมเท่าเดิม (ปรับปรุงภายในแพตช์เดิม) -> ใช้ไฟล์ใหม่เงียบ ๆ ไม่แสดงแถบ "เวอร์ชันใหม่"
  //   (SW เป็น network-first อยู่แล้ว หน้าถัดไปที่เปิดจึงได้ไฟล์ล่าสุดเอง ไม่ต้องรีโหลดกลางเกม)
  let silentSwap = false;
  async function onUpdateReady(worker) {
    if (versionReady) await versionReady.catch(() => {});
    let latest = null;
    try { latest = (await (await fetch(API + '/health', { cache: 'no-store' })).json()).version || null; } catch (_) { /* ออฟไลน์ */ }
    if (latest && loadedVersion && latest === loadedVersion) {
      silentSwap = true;
      worker.postMessage('SKIP_WAITING');
      return;
    }
    showUpdateBar(worker);
  }
  function showUpdateBar(worker) {
    const bar = document.getElementById('update-bar');
    bar.classList.remove('hidden');
    document.getElementById('update-apply').onclick = () => { worker.postMessage('SKIP_WAITING'); };
    document.getElementById('update-later').onclick = () => bar.classList.add('hidden');
  }
  if ('serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (silentSwap) { silentSwap = false; return; }   // อัปเดตไฟล์ในเวอร์ชันเดิม: ไม่รีโหลด ไม่ขัดจังหวะผู้เล่น
      if (reloading) return;
      reloading = true;
      window.location.reload(); // SW ใหม่เริ่มทำงานแล้ว -> โหลดไฟล์ชุดใหม่ทั้งหมดพร้อมกัน
    });
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            // มี SW เดิมคุมหน้าอยู่ = นี่คือ "อัปเดต" (ไม่ใช่การติดตั้งครั้งแรก)
            if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(w);
          });
        });
        // แอปที่เปิดค้างไว้นาน: ตรวจเวอร์ชันใหม่ทุก 30 นาที และเมื่อกลับมาที่แท็บ
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      } catch (_) { /* ลงทะเบียนไม่ได้ก็ไม่เป็นไร แอปยังใช้งานได้ปกติ */ }
    });
  }
  // แถบออฟไลน์: บอกผู้ใช้ตรง ๆ แทนการที่ปุ่มต่าง ๆ ล้มเหลวเงียบ ๆ
  function syncOnline() { document.getElementById('offline-bar').classList.toggle('hidden', navigator.onLine); }
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  // แจ้งว่าแอปพร้อมแล้ว (ปิดหน้าโหลดของธีมพิเศษ ฯลฯ)
  boot().finally(() => window.dispatchEvent(new Event('eq:ready')));
})();
