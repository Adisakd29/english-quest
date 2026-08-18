(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'wq_token';
  const SESSION_SIZE = 12;

  const LEVEL_META = {
    A1: { name: 'หมู่บ้านเริ่มต้น', sub: 'คำศัพท์พื้นฐานที่สุด', color: '#4f9d69' },
    A2: { name: 'ทุ่งหญ้ากว้าง', sub: 'คำศัพท์ใช้ในชีวิตประจำวัน', color: '#e0a458' },
    B1: { name: 'เทือกเขาสูง', sub: 'คำศัพท์ระดับกลาง', color: '#4d6fa8' },
    B2: { name: 'ยอดเขาเมฆหมอก', sub: 'คำศัพท์ระดับสูง', color: '#7c5cbf' },
    C1: { name: 'แดนเหนือเมฆ', sub: 'คำศัพท์ระดับสูงมาก (Oxford 5000)', color: '#e0b341' },
  };

  // ภาพประกอบฉากของแต่ละด่าน วาดง่าย ๆ แบบ flat-icon ให้เข้าธีมเว็บ
  const LEVEL_SCENES = {
    A1: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 110 Q60 90 110 105 T220 100 V140 H0 Z" fill="#3a8a55"/>
      <g>
        <rect x="28" y="78" width="34" height="28" rx="2" fill="#fff8ec"/>
        <path d="M22 80 L45 58 L68 80 Z" fill="#e0552a"/>
        <rect x="40" y="90" width="10" height="16" fill="#37548a"/>
      </g>
      <g>
        <rect x="92" y="64" width="42" height="36" rx="2" fill="#fff8ec"/>
        <path d="M85 66 L113 38 L141 66 Z" fill="#c2823a"/>
        <rect x="105" y="80" width="12" height="20" fill="#37548a"/>
        <rect x="124" y="78" width="8" height="8" fill="#7c5cbf"/>
      </g>
      <g>
        <rect x="156" y="84" width="30" height="24" rx="2" fill="#fff8ec"/>
        <path d="M150 86 L171 66 L192 86 Z" fill="#e0552a"/>
      </g>
      <circle cx="195" cy="30" r="14" fill="#ffd166" opacity="0.85"/>
    </svg>`,
    A2: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
      <circle cx="188" cy="26" r="16" fill="#ffd166" opacity="0.9"/>
      <path d="M0 95 Q40 75 90 92 T220 85 V140 H0 Z" fill="#c2823a"/>
      <path d="M0 112 Q50 96 120 110 T220 105 V140 H0 Z" fill="#a8702e"/>
      <g stroke="#fff8ec" stroke-width="3" stroke-linecap="round" opacity="0.7">
        <path d="M30 100 L30 88"/>
        <path d="M42 104 L42 90"/>
        <path d="M54 100 L54 86"/>
        <path d="M150 110 L150 96"/>
        <path d="M162 113 L162 98"/>
        <path d="M174 110 L174 94"/>
      </g>
      <g>
        <rect x="92" y="76" width="6" height="30" fill="#6a4423"/>
        <circle cx="95" cy="64" r="22" fill="#387a4d"/>
      </g>
    </svg>`,
    B1: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
      <path d="M-10 115 L40 55 L75 85 L115 35 L160 90 L190 60 L230 115 Z" fill="#37548a"/>
      <path d="M40 55 L55 75 L25 75 Z" fill="#fff8ec" opacity="0.85"/>
      <path d="M115 35 L132 58 L98 58 Z" fill="#fff8ec" opacity="0.9"/>
      <path d="M190 60 L202 76 L178 76 Z" fill="#fff8ec" opacity="0.85"/>
      <path d="M-10 125 L50 95 L100 122 L150 92 L230 125 V140 H-10 Z" fill="#2c4170"/>
    </svg>`,
    B2: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="40" rx="26" ry="12" fill="#fff8ec" opacity="0.35"/>
      <ellipse cx="180" cy="55" rx="22" ry="10" fill="#fff8ec" opacity="0.3"/>
      <path d="M-10 125 L70 25 L110 70 L150 15 L230 125 Z" fill="#5e3f9c"/>
      <path d="M150 15 L168 42 L132 42 Z" fill="#fff8ec"/>
      <path d="M70 25 L84 46 L56 46 Z" fill="#fff8ec"/>
      <path d="M150 15 L150 -2" stroke="#fff8ec" stroke-width="3"/>
      <path d="M150 -2 L168 4 L150 10 Z" fill="#ff6f3c"/>
      <path d="M-10 132 L60 108 L120 130 L180 105 L230 130 V140 H-10 Z" fill="#4a2f7c"/>
    </svg>`,
    C1: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="28" r="2" fill="#fff8ec" opacity="0.8"/>
      <circle cx="70" cy="16" r="1.5" fill="#fff8ec" opacity="0.7"/>
      <circle cx="170" cy="20" r="2" fill="#fff8ec" opacity="0.8"/>
      <circle cx="190" cy="40" r="1.5" fill="#fff8ec" opacity="0.6"/>
      <path d="M95 90 L100 20 L105 90 Z" fill="#c2823a"/>
      <path d="M88 95 L100 0 L112 95 Z" fill="#e0b341"/>
      <circle cx="100" cy="6" r="9" fill="#fff8ec" opacity="0.9"/>
      <rect x="94" y="60" width="12" height="14" fill="#a8702e"/>
      <ellipse cx="40" cy="105" rx="38" ry="16" fill="#fff8ec" opacity="0.9"/>
      <ellipse cx="75" cy="115" rx="30" ry="14" fill="#fff8ec" opacity="0.95"/>
      <ellipse cx="150" cy="108" rx="34" ry="15" fill="#fff8ec" opacity="0.9"/>
      <ellipse cx="185" cy="118" rx="28" ry="13" fill="#fff8ec" opacity="0.95"/>
      <ellipse cx="110" cy="122" rx="40" ry="18" fill="#fff8ec"/>
    </svg>`,
  };

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

  const AVATARS = [
    { id: 'fox', emoji: '🦊' },
    { id: 'owl', emoji: '🦉' },
    { id: 'cat', emoji: '🐱' },
    { id: 'dog', emoji: '🐶' },
    { id: 'rabbit', emoji: '🐰' },
    { id: 'bear', emoji: '🐻' },
    { id: 'panda', emoji: '🐼' },
    { id: 'lion', emoji: '🦁' },
    { id: 'tiger', emoji: '🐯' },
    { id: 'koala', emoji: '🐨' },
    { id: 'penguin', emoji: '🐧' },
    { id: 'dragon', emoji: '🐲' },
  ];
  const AVATAR_EMOJI = Object.fromEntries(AVATARS.map((a) => [a.id, a.emoji]));

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
      throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    }

    let data = {};
    try { data = await res.json(); } catch (_e) { /* no body */ }

    if (!res.ok) {
      throw new Error(data.error || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
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
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------------
  // Screen routing
  // ---------------------------------------------------------------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  function showAuth() {
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('screen-auth').classList.remove('hidden');
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
    if (p1.length < 6) {
      errEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
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
      const { token, user } = await api('/auth/register', { method: 'POST', body: { username, email, password } });
      onAuthSuccess(token, user);
      toast('สร้างบัญชีสำเร็จ! ยินดีต้อนรับนักผจญภัย 🎉', 'success');
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
  }

  document.getElementById('btn-logout').addEventListener('click', () => {
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
      hudAvatar.textContent = AVATAR_EMOJI[u.avatar] || '🦊';
    }
    document.getElementById('hud-username').textContent = u.username;
    document.getElementById('hud-level-tag').textContent = `LV.${u.level}`;
    document.getElementById('hud-exp-fill').style.width = `${u.progressPercent}%`;
    document.getElementById('hud-exp-label').textContent = `${u.expIntoLevel} / ${u.expForNextLevel} EXP`;
  }

  document.getElementById('hud-avatar').addEventListener('click', showProfileModal);
  document.getElementById('hud-username').addEventListener('click', showProfileModal);

  function showProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const optionsHtml = AVATARS.map((a) => {
      const selected = state.user && state.user.avatar === a.id ? ' selected' : '';
      return `<button class="avatar-option${selected}" data-avatar-id="${a.id}">${a.emoji}</button>`;
    }).join('');

    const hasCustomImage = !!(state.user && state.user.avatarImage);
    const previewContent = hasCustomImage
      ? `<img src="${state.user.avatarImage}" alt="profile" />`
      : `<span>${AVATAR_EMOJI[state.user.avatar] || '🦊'}</span>`;

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
            <button class="btn btn-primary btn-sm" id="profile-pic-upload">📷 อัปโหลดรูป</button>
            <button class="btn btn-secondary btn-sm ${hasCustomImage ? '' : 'hidden'}" id="profile-pic-remove">ลบรูป</button>
            <div class="profile-pic-hint">รองรับ PNG / JPG / WebP</div>
          </div>
        </div>
        <div class="form-error" id="profile-pic-error"></div>

        <p class="profile-section-label">ชื่อผู้ใช้</p>
        <div class="profile-username-row">
          <input type="text" id="profile-username-input" value="${state.user.username}" maxlength="20" />
          <button class="btn btn-primary" id="profile-username-save">บันทึก</button>
        </div>
        <div class="form-error" id="profile-username-error"></div>

        <p class="profile-section-label">หรือเลือกอวตารสำเร็จรูป</p>
        <div class="avatar-grid">${optionsHtml}</div>
        <button class="btn btn-secondary btn-block" style="margin-top:18px;" id="profile-close">ปิด</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.avatar-option').forEach((btn) => {
      btn.addEventListener('click', () => selectAvatar(btn.dataset.avatarId, overlay));
    });
    overlay.querySelector('#profile-username-save').addEventListener('click', () => saveUsername(overlay));
    overlay.querySelector('#profile-username-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveUsername(overlay);
    });
    overlay.querySelector('#profile-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Profile picture upload wiring
    const picInput = overlay.querySelector('#profile-pic-input');
    overlay.querySelector('#profile-pic-upload').addEventListener('click', () => picInput.click());
    picInput.addEventListener('change', (e) => handleAvatarUpload(e, overlay));
    overlay.querySelector('#profile-pic-remove').addEventListener('click', () => removeAvatarImage(overlay));
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
      uploadBtn.textContent = '📷 อัปโหลดรูป';
      event.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
    }
  }

  async function removeAvatarImage(overlay) {
    try {
      const { user } = await api('/auth/avatar-image', { method: 'DELETE' });
      state.user.avatarImage = user.avatarImage;
      renderHud();
      const preview = overlay.querySelector('#profile-pic-preview');
      preview.innerHTML = `<span>${AVATAR_EMOJI[state.user.avatar] || '🦊'}</span>`;
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
        <div style="font-size:3rem;">🎉</div>
        <h2>เลเวลอัป!</h2>
        <p>ยินดีด้วย ตอนนี้คุณคือเลเวล <strong>${levelInfo.level}</strong> แล้ว</p>
        <button class="btn btn-primary btn-block" style="margin-top:20px;" id="levelup-ok">เยี่ยมมาก ไปต่อ!</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#levelup-ok').addEventListener('click', () => overlay.remove());
  }

  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // HOME screen — เมนูหลัก 2 อย่าง (เรียนแกรมม่า / เรียนคำศัพท์)
  // ---------------------------------------------------------------
  function openHome() {
    showScreen('screen-home');
    const greetEl = document.getElementById('home-greeting');
    if (greetEl && state.user) {
      greetEl.textContent = `สวัสดี, ${state.user.username}!`;
    }
  }

  document.getElementById('home-btn-grammar').addEventListener('click', () => {
    openGrammarList();
  });
  document.getElementById('home-btn-vocab').addEventListener('click', () => {
    showScreen('screen-map');
    loadMap();
  });
  document.getElementById('btn-home').addEventListener('click', openHome);
  document.getElementById('btn-map-back').addEventListener('click', openHome);

  // ---------------------------------------------------------------
  // MAP screen
  // ---------------------------------------------------------------
  async function loadMap() {
    const track = document.getElementById('trail-track');
    track.innerHTML = '<div class="loading-spinner"></div>';
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
          <div class="node-scene">${LEVEL_SCENES[lvl]}</div>
          <div class="stamp">
            <span class="stamp-label">${lvl}</span>
          </div>
          <div class="node-info">
            <div class="node-title">${meta.name}</div>
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
  document.getElementById('btn-leaderboard-back').addEventListener('click', () => {
    openHome();
  });

  async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const { top, me } = await api('/leaderboard');
      renderLeaderboard(top, me);
    } catch (err) {
      list.innerHTML = `<div class="form-error" style="text-align:center;">${err.message}</div>`;
    }
  }

  function leaderboardRowHtml(entry) {
    const rankClass = entry.rank <= 3 ? ` rank-${entry.rank}` : '';
    const meClass = entry.isMe ? ' is-me' : '';
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
    const avatarContent = entry.avatarImage
      ? `<img src="${entry.avatarImage}" alt="" />`
      : (AVATAR_EMOJI[entry.avatar] || '🦊');
    const avatarClass = entry.avatarImage ? 'leaderboard-avatar has-image' : 'leaderboard-avatar';
    return `
      <div class="leaderboard-row${rankClass}${meClass}">
        <div class="leaderboard-rank">${medal}</div>
        <div class="${avatarClass}">${avatarContent}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-username">${entry.isMe ? `${entry.username} (คุณ)` : entry.username}</div>
          <div class="leaderboard-level">LV.${entry.level}</div>
        </div>
        <div class="leaderboard-exp">${entry.exp} EXP</div>
      </div>`;
  }

  function renderLeaderboard(top, me) {
    const list = document.getElementById('leaderboard-list');
    if (!top || top.length === 0) {
      list.innerHTML = '<div class="form-error" style="text-align:center;">ยังไม่มีข้อมูลผู้เล่น</div>';
      return;
    }

    let html = top.map(leaderboardRowHtml).join('');
    if (me && !top.some((r) => r.isMe)) {
      html += `<div class="leaderboard-divider">⋯</div>${leaderboardRowHtml(me)}`;
    }
    list.innerHTML = html;
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

  async function startSession(level) {
    showScreen('screen-game');
    document.getElementById('game-level-chip').textContent = level;
    document.getElementById('game-level-chip').style.background = LEVEL_META[level].color;
    document.getElementById('footprints').innerHTML = '<div class="loading-spinner"></div>';
    document.getElementById('quiz-choices').innerHTML = '';
    document.getElementById('btn-quiz-next').classList.add('hidden');
    document.getElementById('card-word-front').textContent = '...';
    setQuizLoading(true);

    try {
      const data = await api(`/words/${level}`);
      // คำไวยากรณ์ (det/pron/prep/conj/modal/aux/exclam/number) ไม่มีความหมาย
      // ที่ยืนเดี่ยว ๆ แปลได้ชัดเจนแบบคำนาม/กริยา/คุณศัพท์ทั่วไป (เช่น "its",
      // "the", "can") บริการแปลฟรีมักแปลผิดความหมายสำหรับคำกลุ่มนี้ จึงตัด
      // ออกจากโหมดเลือกความหมายไปเลย เหลือไว้เฉพาะคำที่มีความหมายชัดเจน
      const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);
      const words = data.words.filter((w) => CONTENT_CATEGORIES.has(w.category));
      const notKnown = words.filter((w) => w.status !== 'known');
      const known = words.filter((w) => w.status === 'known');

      let candidatePool;
      if (notKnown.length >= SESSION_SIZE) {
        candidatePool = shuffle(notKnown);
      } else {
        candidatePool = shuffle([...notKnown, ...shuffle(known)]);
      }
      const sessionCandidates = candidatePool.slice(0, SESSION_SIZE);
      const backupCandidates = candidatePool.slice(SESSION_SIZE, SESSION_SIZE + 20);
      const allCandidates = [...sessionCandidates, ...backupCandidates];

      const { translations } = await api('/translate', {
        method: 'POST',
        body: { wordIds: allCandidates.map((w) => w.id) },
      });

      const translatedPool = allCandidates
        .filter((w) => translations[w.id])
        .map((w) => ({ ...w, th: translations[w.id] }));

      // กันคำซ้ำความหมาย (เช่น big / large แปลไทยเหมือนกัน) ไว้แค่ตัวแรกที่เจอ
      // เพราะ sessionCandidates เรียงมาก่อน backupCandidates ในลิสต์เสมอ
      // คำที่ผู้เล่นต้องตอบจะถูกเก็บไว้ก่อนคำสำรองที่ใช้เป็นตัวลวงเท่านั้น
      const seenText = new Set();
      const dedupedPool = [];
      for (const item of translatedPool) {
        const key = item.th.trim().toLowerCase();
        if (seenText.has(key)) continue;
        seenText.add(key);
        dedupedPool.push(item);
      }

      // ต้องมีคำแปลที่ใช้ได้พอสมควรก่อนเริ่มด่าน ไม่งั้นตัวเลือกจะเหลือ
      // น้อยเกินไป (เช่น 2 ตัวเลือกแทน 4) ดูเหมือนเกมพังและกดต่อไม่ได้
      // ดีกว่าแจ้งเตือนให้ลองใหม่ตั้งแต่แรกเลย
      const MIN_POOL_FOR_SESSION = 8;
      if (dedupedPool.length < MIN_POOL_FOR_SESSION) {
        toast('ระบบแปลคำศัพท์ขัดข้องชั่วคราว ลองใหม่อีกครั้งภายหลัง', 'error');
        showScreen('screen-map');
        return;
      }

      const sessionIds = new Set(sessionCandidates.map((w) => w.id));
      let queue = dedupedPool.filter((item) => sessionIds.has(item.id));
      if (queue.length < SESSION_SIZE) {
        const extra = dedupedPool.filter((item) => !sessionIds.has(item.id));
        queue = [...queue, ...extra].slice(0, SESSION_SIZE);
      } else {
        queue = queue.slice(0, SESSION_SIZE);
      }

      const questions = queue.map((item) => {
        const decoyCandidates = dedupedPool.filter((p) => p.id !== item.id);
        const decoys = shuffle(decoyCandidates).slice(0, Math.min(3, decoyCandidates.length));
        const options = shuffle([item, ...decoys]);
        return { ...item, options, level };
      });

      state.session = { level, queue: questions, index: 0, knownCount: 0, learningCount: 0, expGained: 0 };
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

    const choicesWrap = document.getElementById('quiz-choices');
    choicesWrap.innerHTML = '';
    q.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = opt.th;
      btn.dataset.correct = opt.id === q.id ? 'true' : 'false';
      btn.addEventListener('click', () => answerQuiz(btn, q));
      choicesWrap.appendChild(btn);
    });

    document.getElementById('btn-quiz-next').classList.add('hidden');
  }

  async function answerQuiz(clickedBtn, question) {
    const session = state.session;
    const choicesWrap = document.getElementById('quiz-choices');
    const buttons = Array.from(choicesWrap.querySelectorAll('.quiz-choice'));
    const isCorrect = clickedBtn.dataset.correct === 'true';

    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.correct === 'true') b.classList.add('correct');
    });
    if (!isCorrect) clickedBtn.classList.add('wrong');

    try {
      const result = await api('/progress/review', {
        method: 'POST',
        body: { wordId: question.id, level: session.level, known: isCorrect },
      });

      if (result.gainedExp > 0) {
        popExp(result.gainedExp);
      } else if (result.levelComplete && !session.completeNoticeShown) {
        session.completeNoticeShown = true;
        toast('ด่านนี้รู้ครบ 100% แล้ว ทบทวนได้แต่ไม่ได้ EXP เพิ่ม', 'success');
      }
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

    document.getElementById('btn-quiz-next').classList.remove('hidden');
  }

  document.getElementById('btn-quiz-next').addEventListener('click', nextCard);

  function nextCard() {
    const session = state.session;
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
  const MODE_META = {
    basic:        { icon: '🌱', name: 'พื้นฐาน',  color: '#4caf50', tier: 1 },
    intermediate: { icon: '🌿', name: 'ปานกลาง',  color: '#8bc34a', tier: 2 },
    advanced:     { icon: '🌳', name: 'ยาก',      color: '#e0a848', tier: 3 },
    expert:       { icon: '🔥', name: 'ยากมาก',   color: '#c14a4a', tier: 4 },
    toeic:        { icon: '💼', name: 'TOEIC',    color: '#4a7cc1', tier: 5 },
    toefl:        { icon: '🎓', name: 'TOEFL',    color: '#8e6bd6', tier: 6 },
  };

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

  async function openGrammarList() {
    showScreen('screen-grammar-list');
    const wrap = document.getElementById('grammar-chapters');
    wrap.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const { chapters } = await api('/grammar');
      grammarState.chapters = chapters;
      renderGrammarList();
    } catch (err) {
      wrap.innerHTML = `<div class="form-error" style="text-align:center;">${err.message}</div>`;
    }
  }

  function renderGrammarList() {
    const wrap = document.getElementById('grammar-chapters');
    wrap.innerHTML = '';
    grammarState.chapters.forEach((c) => {
      const modeBadge = c.modeCount > 1
        ? `<div class="chapter-badge multi">🎯 ${c.modeCount} โหมด</div>`
        : '';
      const scoreBadge = c.perfectCount > 0
        ? `<div class="chapter-score done"><span class="star">⭐</span> ${c.perfectCount}/${c.modeCount}</div>`
        : (c.anyCompleted
            ? `<div class="chapter-score">${c.modeCount} โหมด</div>`
            : `<div class="chapter-score">${c.modeCount} โหมด</div>`);
      const btn = document.createElement('button');
      btn.className = 'chapter-card' + (c.perfectCount === c.modeCount && c.perfectCount > 0 ? ' completed' : '');
      btn.innerHTML = `
        <div class="chapter-icon-wrap" style="background:${c.color};">${c.icon}</div>
        <div class="chapter-info">
          <div class="chapter-num">บทที่ ${c.num}</div>
          <div class="chapter-title-text">${c.title}</div>
          <div class="chapter-sub">${c.intro}</div>
          ${modeBadge}
        </div>
        ${scoreBadge}
      `;
      btn.addEventListener('click', () => openLesson(c.id));
      wrap.appendChild(btn);
    });
  }

  async function openLesson(chapterId) {
    showScreen('screen-grammar-lesson');
    const head = document.getElementById('lesson-head');
    const body = document.getElementById('lesson-body');
    head.innerHTML = '<div class="loading-spinner"></div>';
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
        <div class="lesson-icon">${chapter.icon}</div>
        <div class="lesson-title">${chapter.title}</div>
        <div class="lesson-intro">${chapter.intro}</div>
      `;
      body.innerHTML = chapter.sections.map((s) => renderSectionCard(s)).join('');
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

    let html = '<div class="mode-selector-title">📝 เลือกโหมดข้อสอบ</div>';
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
    const meta = MODE_META[m.mode] || { icon: '📝', name: m.mode, color: '#888', tier: 0 };
    const p = m.progress;
    const scoreLine = p
      ? `<div class="mode-card-score">${p.score === p.total ? '⭐' : ''} ${p.score}/${p.total}</div>`
      : `<div class="mode-card-score not-done">ยังไม่ทำ</div>`;
    const perfectClass = p && p.score === p.total && p.total > 0 ? ' perfect' : '';
    return `
      <button class="mode-card${perfectClass}" data-mode="${m.mode}" style="border-color: ${meta.color};">
        <div class="mode-card-icon" style="background: ${meta.color};">${meta.icon}</div>
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
          <div class="practice-label">💡 ลองทำดู</div>
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
    fb.innerHTML = `${isCorrect ? '✅ ถูกต้อง!' : '❌ ผิด'} <span class="practice-explain">${explain}</span>`;
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
      };
      const meta = MODE_META[data.mode] || { icon: '📝', name: data.mode };
      document.getElementById('quiz-badge').textContent = `${meta.icon} ${meta.name}`;
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
            <span class="passage-title">📖 ${escapeHtml(question.passageTitle || 'บทอ่าน')}</span>
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
  }

  function chooseAnswer(choiceIndex) {
    const q = grammarState.quiz;
    q.answers[q.index] = choiceIndex;
    document.querySelectorAll('#grammar-quiz-choices .quiz-choice').forEach((btn, i) => {
      btn.disabled = true;
      if (i === choiceIndex) btn.classList.add('chosen');
    });
    setTimeout(() => {
      if (q.index < q.questions.length - 1) {
        q.index += 1;
        renderQuizQuestion();
      } else {
        submitQuizAnswers();
      }
    }, 350);
  }

  async function submitQuizAnswers() {
    const q = grammarState.quiz;
    try {
      const result = await api(`/grammar/${q.chapterId}/submit`, {
        method: 'POST',
        body: { mode: q.mode, answers: q.answers },
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
    const icon = result.perfect ? '🏆' : pct >= 0.7 ? '🎉' : pct >= 0.4 ? '👍' : '💪';
    const title = result.perfect ? 'สุดยอด! ตอบถูกหมดเลย' : pct >= 0.7 ? 'เก่งมาก!' : pct >= 0.4 ? 'พอใช้ได้' : 'ลองใหม่นะ';
    const modeMeta = MODE_META[result.mode] || { icon: '📝', name: result.mode };
    document.getElementById('gr-icon').textContent = icon;
    document.getElementById('gr-title').textContent = title;
    document.getElementById('gr-score').textContent = `${result.score} / ${result.total}`;
    document.getElementById('gr-correct-num').textContent = result.score;
    document.getElementById('gr-wrong-num').textContent = wrongCount;
    document.getElementById('gr-exp-num').textContent = result.gainedExp;
    let msg = `โหมด: ${modeMeta.icon} ${modeMeta.name}`;
    if (result.gainedExp > 0) msg += ` · ได้ EXP เพิ่ม ${result.gainedExp} คะแนน!`;
    else if (result.previousBest > 0) msg += ' · ต้องทำได้ดีกว่าสถิติเดิมจึงจะได้ EXP เพิ่ม';
    document.getElementById('gr-message').textContent = msg;

    const reviewWrap = document.getElementById('gr-review');
    reviewWrap.innerHTML = result.results.map((r) => {
      const yourAnswer = r.chosenIndex != null ? r.choices[r.chosenIndex] : '(ไม่ตอบ)';
      const correctAnswer = r.choices[r.correctIndex];
      return `
        <div class="gr-review-item ${r.correct ? 'correct' : 'wrong'}">
          <div class="gr-review-q">${r.correct ? '✅' : '❌'} ${escapeHtml(r.question)}</div>
          <div class="gr-review-a">
            คำตอบของคุณ: <b>${escapeHtml(yourAnswer)}</b>${r.correct ? '' : `<br>คำตอบที่ถูก: <b>${escapeHtml(correctAnswer)}</b>`}
            <br>${escapeHtml(r.explain)}
          </div>
        </div>
      `;
    }).join('');

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
  async function boot() {
    loadVersion();
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
      openHome();
    } catch (_err) {
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
      showAuth();
    }
  }

  async function loadVersion() {
    try {
      const res = await fetch(API + '/health');
      const data = await res.json();
      if (data.version) {
        document.getElementById('version-tag').textContent = `WordQuest v${data.version}`;
      }
    } catch (_err) {
      // ไม่ต้องทำอะไรถ้าดึงเวอร์ชันไม่ได้ ไม่ใช่ส่วนสำคัญของแอป
    }
  }

  // ลงทะเบียน Service Worker — ทำให้ติดตั้งเป็นแอปบนหน้าจอโทรศัพท์ได้
  // และเปิดใช้งานได้บ้างตอนออฟไลน์ (ใช้กลยุทธ์ network-first จึงไม่ค้างเวอร์ชันเก่า)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ถ้าลงทะเบียนไม่สำเร็จก็ไม่เป็นไร แอปยังใช้งานได้ปกติ
      });
    });
  }

  boot();
})();
