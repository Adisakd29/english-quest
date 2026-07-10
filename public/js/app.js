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

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });
  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

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
    loadMap();
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
    document.getElementById('hud-avatar').textContent = AVATAR_EMOJI[u.avatar] || '🦊';
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

    overlay.innerHTML = `
      <div class="modal-card">
        <h2>โปรไฟล์ของฉัน</h2>
        <p class="profile-section-label" style="margin-top:8px;">ชื่อผู้ใช้</p>
        <div class="profile-username-row">
          <input type="text" id="profile-username-input" value="${state.user.username}" maxlength="20" />
          <button class="btn btn-primary" id="profile-username-save">บันทึก</button>
        </div>
        <div class="form-error" id="profile-username-error"></div>
        <p class="profile-section-label">เลือกอวตาร</p>
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
  // MAP screen
  // ---------------------------------------------------------------
  const state_map = { mode: 'flashcard' }; // 'flashcard' | 'battle'

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state_map.mode = tab.dataset.mode;
    });
  });

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
      btn.addEventListener('click', () => {
        if (state_map.mode === 'battle') {
          openQuestSelect(btn.dataset.level);
        } else {
          startSession(btn.dataset.level);
        }
      });
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
    showScreen('screen-map');
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
    return `
      <div class="leaderboard-row${rankClass}${meClass}">
        <div class="leaderboard-rank">${medal}</div>
        <div class="leaderboard-avatar">${AVATAR_EMOJI[entry.avatar] || '🦊'}</div>
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
  // BATTLE MODE — Dragon Quest style dungeon crawl
  // เดินด่าน เจอศัตรู 3 ตัว แล้วบอสท้ายด่าน มี timer ต่อคำ
  // ---------------------------------------------------------------

  const PLAYER_MAX_HP = 100;
  const WORD_TIME_MS = 10000;     // เวลาต่อคำ (10 วินาที)
  const TIMEOUT_DAMAGE = 20;      // เสีย HP เมื่อหมดเวลา
  const WRONG_DAMAGE = 15;        // เสีย HP เมื่อตอบผิด
  const HINT_AT_MS = 6000;        // แสดงคำใบ้เมื่อเหลือเวลาเท่านี้

  // ---------------------------------------------------------------
  // QUEST SYSTEM — แต่ละระดับมี 5 ด่าน (ด่าน 5 คือบอส)
  // ---------------------------------------------------------------
  const QUEST_ZONES = {
    A1: { title: 'ที่ราบมือใหม่', sub: 'เดินทางผ่าน 5 ด่าน โค่นราชาสไลม์', icon: '🌿' },
    A2: { title: 'ป่ากอบลิน', sub: 'บุกป่าลึก โค่นจอมกอบลิน', icon: '🌲' },
    B1: { title: 'หุบเขาน้ำแข็ง', sub: 'ฝ่าความหนาว โค่นหมาป่าราชันย์', icon: '🏔️' },
    B2: { title: 'หอคอยเวทมนตร์', sub: 'ปีนหอคอย โค่นจอมเวทย์ดำ', icon: '🗼' },
    C1: { title: 'รังมังกรทอง', sub: 'ด่านสุดท้าย โค่นมังกรทองโบราณ', icon: '🌋' },
  };

  // ด่านทั้ง 5 ของแต่ละโซน: ศัตรูในด่าน (ด่านหลังยิ่งยาก ด่าน 5 = บอส)
  const QUEST_STAGES = {
    A1: [
      { name: 'ชายทุ่งหญ้า', enemies: ['slime'] },
      { name: 'บึงสไลม์', enemies: ['slime', 'slime'] },
      { name: 'ถ้ำค้างคาว', enemies: ['bat', 'slime'] },
      { name: 'ป่าเห็ดพิษ', enemies: ['mushroom', 'bat', 'slime'] },
      { name: 'บัลลังก์ราชาสไลม์', enemies: ['slime', 'kingslime'], boss: true },
    ],
    A2: [
      { name: 'ชายป่า', enemies: ['slime', 'bat'] },
      { name: 'ค่ายกอบลิน', enemies: ['goblin', 'goblin'] },
      { name: 'ป่าลึก', enemies: ['bat', 'goblin', 'mushroom'] },
      { name: 'หน้าผาอันตราย', enemies: ['goblin', 'goblin', 'bat'] },
      { name: 'ถ้ำจอมกอบลิน', enemies: ['goblin', 'goblinlord'], boss: true },
    ],
    B1: [
      { name: 'เชิงเขาน้ำแข็ง', enemies: ['wolf', 'bat'] },
      { name: 'ทุ่งหิมะ', enemies: ['wolf', 'goblin'] },
      { name: 'ธารน้ำแข็ง', enemies: ['wolf', 'wolf', 'mushroom'] },
      { name: 'ยอดเขาหนาวเหน็บ', enemies: ['wolf', 'wolf', 'goblin'] },
      { name: 'รังหมาป่าราชันย์', enemies: ['wolf', 'frostwolf'], boss: true },
    ],
    B2: [
      { name: 'ประตูหอคอย', enemies: ['wizard', 'goblin'] },
      { name: 'ห้องสมุดต้องมนตร์', enemies: ['wizard', 'bat', 'bat'] },
      { name: 'บันไดวนลึกลับ', enemies: ['wizard', 'wolf', 'wizard'] },
      { name: 'ห้องทดลองมืด', enemies: ['wizard', 'wizard', 'wolf'] },
      { name: 'ยอดหอจอมเวทย์', enemies: ['wizard', 'darkwizard'], boss: true },
    ],
    C1: [
      { name: 'เชิงภูเขาไฟ', enemies: ['wolf', 'wizard', 'goblin'] },
      { name: 'ทางลาวาเดือด', enemies: ['wizard', 'wizard', 'wolf'] },
      { name: 'ถ้ำสมบัติมังกร', enemies: ['wizard', 'wolf', 'wizard'] },
      { name: 'ปากปล่องไฟนรก', enemies: ['wizard', 'wizard', 'wizard'] },
      { name: 'รังมังกรทองโบราณ', enemies: ['darkwizard', 'dragon'], boss: true },
    ],
  };

  // ความคืบหน้าด่าน (เก็บใน localStorage แยกตามผู้ใช้)
  function questProgressKey() {
    return `wq_quest_${state.user ? state.user.id : 'guest'}`;
  }
  function getQuestProgress() {
    try {
      return JSON.parse(localStorage.getItem(questProgressKey())) || {};
    } catch (_e) { return {}; }
  }
  function getClearedStage(level) {
    const p = getQuestProgress();
    return p[level] || 0; // จำนวนด่านที่ผ่านแล้วในโซนนี้ (0 = ยังไม่ผ่านเลย)
  }
  function markStageCleared(level, stageIndex) {
    const p = getQuestProgress();
    p[level] = Math.max(p[level] || 0, stageIndex + 1);
    localStorage.setItem(questProgressKey(), JSON.stringify(p));
  }

  let questState = null; // { level }

  function openQuestSelect(level) {
    questState = { level };
    showScreen('screen-quest-select');
    const zone = QUEST_ZONES[level];
    document.getElementById('quest-level-chip').textContent = level;
    document.getElementById('quest-level-chip').style.background = LEVEL_META[level].color;
    document.getElementById('quest-zone-title').textContent = `${zone.icon} ${zone.title}`;
    document.getElementById('quest-zone-sub').textContent = zone.sub;
    renderQuestStages();
  }

  function renderQuestStages() {
    const level = questState.level;
    const stages = QUEST_STAGES[level];
    const cleared = getClearedStage(level);
    const list = document.getElementById('quest-stage-list');
    list.innerHTML = '';

    stages.forEach((stage, i) => {
      const isCleared = i < cleared;
      const isLocked = i > cleared;
      const isBoss = !!stage.boss;
      const enemyIcons = stage.enemies.map((k) => (ENEMY_DEFS[k].boss ? '👑' : '👾')).join('');

      const row = document.createElement('div');
      row.className = 'quest-stage-row';
      row.innerHTML = `
        <button class="quest-stage${isLocked ? ' locked' : ''}${isCleared ? ' cleared' : ''}${isBoss ? ' boss' : ''}" data-stage="${i}" ${isLocked ? 'disabled' : ''}>
          <div class="quest-stage-icon">${isBoss ? '👑' : isCleared ? '✅' : isLocked ? '🔒' : '⚔️'}</div>
          <div class="quest-stage-info">
            <div class="quest-stage-name">ด่าน ${i + 1}: ${stage.name}</div>
            <div class="quest-stage-sub">ศัตรู ${stage.enemies.length} ตัว ${enemyIcons}</div>
          </div>
          <div class="quest-stage-status">${isCleared ? '⭐' : ''}</div>
        </button>`;
      list.appendChild(row);

      if (i < stages.length - 1) {
        const conn = document.createElement('div');
        conn.className = 'quest-stage-connector';
        list.appendChild(conn);
      }
    });

    list.querySelectorAll('.quest-stage:not(.locked)').forEach((btn) => {
      btn.addEventListener('click', () => {
        startBattle(level, parseInt(btn.dataset.stage, 10));
      });
    });
  }

  document.getElementById('btn-quest-back').addEventListener('click', () => {
    questState = null;
    showScreen('screen-map');
    loadMap();
  });

  // นิยามศัตรูแต่ละชนิด: ชื่อ, HP, สี, SVG (การ์ตูนน่ารักสีสันสดใส)
  const ENEMY_DEFS = {
    slime: { name: 'สไลม์', hp: 3, boss: false, svg: `
      <ellipse class="e-body" cx="80" cy="98" rx="52" ry="46" fill="#6ee06e"/>
      <ellipse cx="80" cy="90" rx="46" ry="46" fill="#8bef8b"/>
      <ellipse cx="66" cy="70" rx="10" ry="14" fill="#fff" opacity="0.5"/>
      <circle cx="62" cy="86" r="9" fill="#1a1a2e"/><circle cx="98" cy="86" r="9" fill="#1a1a2e"/>
      <circle cx="65" cy="83" r="3" fill="#fff"/><circle cx="101" cy="83" r="3" fill="#fff"/>
      <path d="M68 104 Q80 116 92 104" stroke="#1a1a2e" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    bat: { name: 'ค้างคาว', hp: 3, boss: false, svg: `
      <path class="e-wing-l" d="M60 78 Q20 50 12 82 Q30 78 34 96 Q46 82 60 88 Z" fill="#8e6bd6"/>
      <path class="e-wing-r" d="M100 78 Q140 50 148 82 Q130 78 126 96 Q114 82 100 88 Z" fill="#8e6bd6"/>
      <ellipse cx="80" cy="86" rx="26" ry="24" fill="#a986e8"/>
      <path d="M64 64 L58 50 L74 62 Z" fill="#a986e8"/><path d="M96 64 L102 50 L86 62 Z" fill="#a986e8"/>
      <circle cx="72" cy="84" r="6" fill="#1a1a2e"/><circle cx="88" cy="84" r="6" fill="#1a1a2e"/>
      <circle cx="74" cy="82" r="2" fill="#fff"/><circle cx="90" cy="82" r="2" fill="#fff"/>
      <path d="M74 96 L78 100 L82 96 L86 100" stroke="#fff" stroke-width="2" fill="none"/>` },
    mushroom: { name: 'เห็ดพิษ', hp: 3, boss: false, svg: `
      <rect x="66" y="96" width="28" height="34" rx="10" fill="#f5e6c8"/>
      <circle cx="74" cy="112" r="4" fill="#1a1a2e"/><circle cx="86" cy="112" r="4" fill="#1a1a2e"/>
      <path d="M72 122 Q80 128 88 122" stroke="#1a1a2e" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="e-body" d="M32 96 Q32 50 80 48 Q128 50 128 96 Z" fill="#e0554e"/>
      <circle cx="58" cy="72" r="9" fill="#fff"/><circle cx="98" cy="68" r="11" fill="#fff"/><circle cx="80" cy="88" r="7" fill="#fff"/>` },
    goblin: { name: 'กอบลิน', hp: 4, boss: false, svg: `
      <ellipse cx="80" cy="130" rx="30" ry="8" fill="#000" opacity="0.15"/>
      <rect x="60" y="98" width="40" height="34" rx="8" fill="#8bc34a"/>
      <ellipse cx="80" cy="78" rx="34" ry="32" fill="#9ccc65"/>
      <path class="e-ear-l" d="M50 66 L34 54 L52 76 Z" fill="#8bc34a"/>
      <path class="e-ear-r" d="M110 66 L126 54 L108 76 Z" fill="#8bc34a"/>
      <circle cx="70" cy="78" r="7" fill="#1a1a2e"/><circle cx="90" cy="78" r="7" fill="#1a1a2e"/>
      <circle cx="72" cy="76" r="2" fill="#fff"/><circle cx="92" cy="76" r="2" fill="#fff"/>
      <path d="M70 92 L78 96 L74 100 Z" fill="#5a8a2a"/>
      <path d="M72 94 Q80 100 88 94" stroke="#1a1a2e" stroke-width="2" fill="none"/>` },
    wolf: { name: 'หมาป่าน้ำแข็ง', hp: 4, boss: false, svg: `
      <ellipse cx="80" cy="132" rx="34" ry="8" fill="#000" opacity="0.15"/>
      <rect x="54" y="100" width="52" height="32" rx="12" fill="#78909c"/>
      <ellipse cx="80" cy="80" rx="38" ry="34" fill="#90a4ae"/>
      <path class="e-ear-l" d="M54 56 L46 34 L68 56 Z" fill="#78909c"/>
      <path class="e-ear-r" d="M106 56 L114 34 L92 56 Z" fill="#78909c"/>
      <circle cx="68" cy="80" r="8" fill="#4fc3f7"/><circle cx="92" cy="80" r="8" fill="#4fc3f7"/>
      <circle cx="68" cy="80" r="3" fill="#1a1a2e"/><circle cx="92" cy="80" r="3" fill="#1a1a2e"/>
      <ellipse cx="80" cy="96" rx="10" ry="7" fill="#546e7a"/>
      <path d="M70 100 L74 106 L80 101 L86 106 L90 100" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>` },
    wizard: { name: 'พ่อมดมืด', hp: 5, boss: false, svg: `
      <ellipse cx="80" cy="134" rx="30" ry="8" fill="#000" opacity="0.15"/>
      <path d="M56 132 L80 96 L104 132 Z" fill="#5e35b1"/>
      <ellipse cx="80" cy="82" rx="30" ry="28" fill="#7e57c2"/>
      <path class="e-hat" d="M50 70 L80 20 L110 70 Z" fill="#4527a0"/>
      <circle cx="80" cy="30" r="5" fill="#ffd54f"/>
      <circle cx="70" cy="84" r="7" fill="#ce93d8"/><circle cx="90" cy="84" r="7" fill="#ce93d8"/>
      <circle cx="70" cy="84" r="3" fill="#311b92"/><circle cx="90" cy="84" r="3" fill="#311b92"/>
      <path d="M72 98 Q80 104 88 98" stroke="#ce93d8" stroke-width="2" fill="none"/>` },
    // BOSSES — ใหญ่กว่า HP เยอะกว่า
    kingslime: { name: '👑 ราชาสไลม์', hp: 7, boss: true, svg: `
      <ellipse cx="80" cy="128" rx="62" ry="14" fill="#000" opacity="0.18"/>
      <ellipse class="e-body" cx="80" cy="94" rx="60" ry="52" fill="#43c443"/>
      <ellipse cx="80" cy="84" rx="54" ry="52" fill="#6ee06e"/>
      <path d="M48 44 L56 20 L64 44 M72 42 L80 14 L88 42 M96 44 L104 20 L112 44 Z" fill="#ffd54f" stroke="#f9a825" stroke-width="1"/>
      <rect x="46" y="40" width="68" height="8" rx="3" fill="#ffd54f"/>
      <circle cx="60" cy="86" r="11" fill="#1a1a2e"/><circle cx="100" cy="86" r="11" fill="#1a1a2e"/>
      <circle cx="64" cy="82" r="4" fill="#fff"/><circle cx="104" cy="82" r="4" fill="#fff"/>
      <path d="M64 106 Q80 122 96 106" stroke="#1a1a2e" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    goblinlord: { name: '👑 จอมกอบลิน', hp: 8, boss: true, svg: `
      <ellipse cx="80" cy="132" rx="40" ry="10" fill="#000" opacity="0.18"/>
      <rect x="52" y="94" width="56" height="40" rx="10" fill="#689f38"/>
      <ellipse cx="80" cy="74" rx="42" ry="38" fill="#8bc34a"/>
      <path class="e-ear-l" d="M44 60 L24 44 L48 72 Z" fill="#689f38"/>
      <path class="e-ear-r" d="M116 60 L136 44 L112 72 Z" fill="#689f38"/>
      <path d="M52 46 L60 28 L68 46 M74 44 L80 24 L86 44 M92 46 L100 28 L108 46 Z" fill="#ffd54f" stroke="#f9a825" stroke-width="1"/>
      <rect x="50" y="42" width="60" height="8" rx="3" fill="#ffd54f"/>
      <circle cx="68" cy="76" r="9" fill="#c62828"/><circle cx="92" cy="76" r="9" fill="#c62828"/>
      <circle cx="68" cy="76" r="3" fill="#1a1a2e"/><circle cx="92" cy="76" r="3" fill="#1a1a2e"/>
      <path d="M64 92 L72 98 L68 102 Z M96 92 L88 98 L92 102 Z" fill="#fff"/>` },
    frostwolf: { name: '👑 หมาป่าราชันย์', hp: 9, boss: true, svg: `
      <ellipse cx="80" cy="134" rx="44" ry="10" fill="#000" opacity="0.18"/>
      <rect x="46" y="98" width="68" height="36" rx="14" fill="#607d8b"/>
      <ellipse cx="80" cy="76" rx="46" ry="40" fill="#90a4ae"/>
      <path class="e-ear-l" d="M46 50 L36 24 L66 52 Z" fill="#607d8b"/>
      <path class="e-ear-r" d="M114 50 L124 24 L94 52 Z" fill="#607d8b"/>
      <path d="M60 34 L66 18 L72 34 M74 32 L80 14 L86 32 M88 34 L94 18 L100 34 Z" fill="#b3e5fc" stroke="#4fc3f7" stroke-width="1"/>
      <circle cx="66" cy="78" r="10" fill="#4fc3f7"/><circle cx="94" cy="78" r="10" fill="#4fc3f7"/>
      <circle cx="66" cy="78" r="4" fill="#1a1a2e"/><circle cx="94" cy="78" r="4" fill="#1a1a2e"/>
      <ellipse cx="80" cy="98" rx="12" ry="8" fill="#455a64"/>
      <path d="M68 102 L74 110 L80 103 L86 110 L92 102" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>` },
    darkwizard: { name: '👑 จอมเวทย์ดำ', hp: 10, boss: true, svg: `
      <ellipse cx="80" cy="136" rx="40" ry="10" fill="#000" opacity="0.2"/>
      <path d="M48 134 L80 90 L112 134 Z" fill="#4527a0"/>
      <ellipse cx="80" cy="80" rx="36" ry="32" fill="#673ab7"/>
      <path class="e-hat" d="M44 66 L80 8 L116 66 Z" fill="#311b92"/>
      <circle cx="80" cy="18" r="7" fill="#ffd54f"/>
      <path d="M60 66 L54 50 M100 66 L106 50" stroke="#e040fb" stroke-width="3" stroke-linecap="round"/>
      <circle cx="68" cy="82" r="8" fill="#e040fb"/><circle cx="92" cy="82" r="8" fill="#e040fb"/>
      <circle cx="68" cy="82" r="3" fill="#1a0033"/><circle cx="92" cy="82" r="3" fill="#1a0033"/>
      <path d="M70 98 Q80 92 90 98" stroke="#e040fb" stroke-width="2.5" fill="none"/>
      <circle class="e-orb" cx="40" cy="100" r="8" fill="#e040fb" opacity="0.8"/>
      <circle class="e-orb" cx="120" cy="100" r="8" fill="#e040fb" opacity="0.8"/>` },
    dragon: { name: '🐲 มังกรทองโบราณ', hp: 12, boss: true, svg: `
      <ellipse cx="80" cy="138" rx="54" ry="10" fill="#000" opacity="0.2"/>
      <path class="e-wing-l" d="M40 88 Q10 60 24 44 Q40 64 56 72 Z" fill="#e65100"/>
      <path class="e-wing-r" d="M120 88 Q150 60 136 44 Q120 64 104 72 Z" fill="#e65100"/>
      <ellipse cx="80" cy="98" rx="50" ry="44" fill="#ffa726"/>
      <ellipse cx="80" cy="90" rx="42" ry="42" fill="#ffb74d"/>
      <path d="M52 54 L60 30 L68 54 M74 50 L80 24 L86 50 M92 54 L100 30 L108 54 Z" fill="#f57f17"/>
      <ellipse cx="80" cy="76" rx="40" ry="30" fill="#ffcc80"/>
      <circle cx="66" cy="72" r="10" fill="#1a1a2e"/><circle cx="94" cy="72" r="10" fill="#1a1a2e"/>
      <circle cx="63" cy="68" r="4" fill="#ffd54f"/><circle cx="91" cy="68" r="4" fill="#ffd54f"/>
      <ellipse cx="80" cy="90" rx="14" ry="8" fill="#e65100"/>
      <path d="M68 94 L72 102 L80 95 L88 102 L92 94" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="80" cy="58" r="5" fill="#ffd54f"/>` },
  };

  let battle = null;

  function enemySvgWrap(inner) {
    return `<svg viewBox="0 0 160 150" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  async function startBattle(level, stageIndex = 0) {
    showScreen('screen-battle');
    document.getElementById('battle-scene').className = `battle-scene zone-${level}`;
    const stage = (QUEST_STAGES[level] || QUEST_STAGES.A1)[stageIndex] || QUEST_STAGES.A1[0];
    battle = {
      level,
      stageIndex,
      playerHp: PLAYER_MAX_HP,
      enemyKeys: [...stage.enemies],
      enemyIndex: 0,
      words: [],
      wordIndex: 0,
      correct: 0,
      wrong: 0,
      expGained: 0,
      timerId: null,
      timerStart: 0,
      hintShown: false,
      busy: false,
    };
    renderStageDots();
    updatePlayerHp();
    document.getElementById('battle-feedback').classList.add('hidden');
    document.getElementById('battle-input').value = '';
    await loadBattleWords(level);
  }

  function renderStageDots() {
    const wrap = document.getElementById('battle-stage-dots');
    wrap.innerHTML = '';
    battle.enemyKeys.forEach((key, i) => {
      const def = ENEMY_DEFS[key];
      const dot = document.createElement('div');
      dot.className = 'stage-dot';
      if (def.boss) dot.classList.add('boss');
      if (i < battle.enemyIndex) dot.classList.add('done');
      if (i === battle.enemyIndex) dot.classList.add('current');
      dot.textContent = def.boss ? '👑' : '';
      wrap.appendChild(dot);
    });
  }

  async function loadBattleWords(level) {
    const meaningEl = document.getElementById('battle-meaning');
    meaningEl.textContent = 'กำลังเตรียมด่าน...';
    try {
      const data = await api(`/words/${level}`);
      const CONTENT = new Set(['noun', 'verb', 'adj', 'adv']);
      const words = data.words.filter((w) => CONTENT.has(w.category));
      const notKnown = words.filter((w) => w.status !== 'known');
      const known = words.filter((w) => w.status === 'known');

      // ต้องการคำมากพอสำหรับศัตรูทุกตัว (รวม HP ทุกตัว)
      const totalNeeded = battle.enemyKeys.reduce((sum, k) => sum + ENEMY_DEFS[k].hp, 0);
      const pool = shuffle(notKnown.length >= totalNeeded
        ? notKnown
        : [...notKnown, ...shuffle(known)]
      ).slice(0, totalNeeded + 12);

      const { translations } = await api('/translate', {
        method: 'POST',
        body: { wordIds: pool.map((w) => w.id) },
      });

      const usable = pool
        .filter((w) => translations[w.id])
        .map((w) => ({ ...w, th: translations[w.id] }));

      if (usable.length < totalNeeded) {
        toast('หาคำแปลไม่พอสำหรับด่านนี้ ลองใหม่อีกครั้ง', 'error');
        showScreen('screen-map');
        return;
      }

      battle.words = usable;
      battle.wordIndex = 0;
      spawnEnemy();
    } catch (err) {
      toast(err.message, 'error');
      showScreen('screen-map');
    }
  }

  function spawnEnemy() {
    const key = battle.enemyKeys[battle.enemyIndex];
    const def = ENEMY_DEFS[key];
    battle.enemyHpMax = def.hp;
    battle.enemyHp = def.hp;

    document.getElementById('enemy-name').textContent = def.name;
    const sprite = document.getElementById('enemy-sprite');
    sprite.innerHTML = enemySvgWrap(def.svg);
    sprite.className = 'enemy-sprite spawn' + (def.boss ? ' boss' : '');
    // remove spawn class after animation to allow idle
    setTimeout(() => { sprite.className = 'enemy-sprite idle' + (def.boss ? ' boss' : ''); }, 600);
    updateEnemyHp();
    renderStageDots();
    nextWord();
  }

  function updateEnemyHp() {
    const pct = Math.max(0, (battle.enemyHp / battle.enemyHpMax) * 100);
    document.getElementById('enemy-hp-fill').style.width = `${pct}%`;
  }
  function updatePlayerHp() {
    const pct = Math.max(0, (battle.playerHp / PLAYER_MAX_HP) * 100);
    const fill = document.getElementById('player-hp-fill');
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', battle.playerHp <= 30);
    document.getElementById('player-hp-num').textContent = Math.max(0, battle.playerHp);
  }

  function nextWord() {
    if (!battle) return;
    const word = battle.words[battle.wordIndex % battle.words.length];
    battle.currentWord = word;
    battle.wordIndex += 1;
    battle.hintShown = false;
    battle.busy = false;

    document.getElementById('battle-meaning').textContent = word.th;
    document.getElementById('battle-pos').textContent = word.pos || '';
    const hintEl = document.getElementById('battle-hint');
    hintEl.classList.add('hidden');
    hintEl.textContent = '';
    const input = document.getElementById('battle-input');
    input.value = '';
    input.className = 'battle-input';
    input.disabled = false;
    input.focus();
    document.getElementById('battle-feedback').classList.add('hidden');

    startWordTimer();
  }

  function startWordTimer() {
    stopWordTimer();
    battle.timerStart = Date.now();
    const fill = document.getElementById('battle-timer-fill');
    fill.classList.remove('danger');

    battle.timerId = setInterval(() => {
      const elapsed = Date.now() - battle.timerStart;
      const remaining = Math.max(0, WORD_TIME_MS - elapsed);
      const pct = (remaining / WORD_TIME_MS) * 100;
      fill.style.width = `${pct}%`;
      if (remaining <= 3500) fill.classList.add('danger');

      if (!battle.hintShown && remaining <= WORD_TIME_MS - HINT_AT_MS) {
        showWordHint();
      }
      if (remaining <= 0) {
        handleTimeout();
      }
    }, 100);
  }
  function stopWordTimer() {
    if (battle && battle.timerId) { clearInterval(battle.timerId); battle.timerId = null; }
  }

  function showWordHint() {
    battle.hintShown = true;
    const w = battle.currentWord.word;
    const hint = w[0] + ' ' + '_ '.repeat(Math.max(0, w.length - 1)).trim();
    const hintEl = document.getElementById('battle-hint');
    hintEl.textContent = `💡 ${hint}   (${w.length} ตัวอักษร)`;
    hintEl.classList.remove('hidden');
  }

  function handleTimeout() {
    if (battle.busy) return;
    battle.busy = true;
    stopWordTimer();
    const input = document.getElementById('battle-input');
    input.disabled = true;
    input.className = 'battle-input wrong';
    heroHurt();
    battle.playerHp -= TIMEOUT_DAMAGE;
    battle.wrong += 1;
    updatePlayerHp();
    flashScreen();
    const fb = document.getElementById('battle-feedback');
    fb.className = 'battle-feedback wrong';
    fb.textContent = `⏰ หมดเวลา! คำที่ถูกคือ "${battle.currentWord.word}"`;
    recordReview(battle.currentWord, false);
    afterAnswer(false);
  }

  async function submitBattleAnswer() {
    if (!battle || battle.busy) return;
    const input = document.getElementById('battle-input');
    const answer = input.value.trim().toLowerCase();
    if (!answer) return;
    battle.busy = true;
    stopWordTimer();
    input.disabled = true;

    const word = battle.currentWord;
    const correct = answer === word.word.toLowerCase();
    const fb = document.getElementById('battle-feedback');

    if (correct) {
      input.className = 'battle-input correct';
      battle.correct += 1;
      battle.enemyHp -= 1;
      updateEnemyHp();
      enemyHurt();
      heroAttack();
      floatText('⚔️ -1', 'dmg');
      fb.className = 'battle-feedback correct';
      fb.textContent = `✅ ถูกต้อง! "${word.word}"`;
      recordReview(word, true);
    } else {
      input.className = 'battle-input wrong';
      battle.wrong += 1;
      battle.playerHp -= WRONG_DAMAGE;
      updatePlayerHp();
      heroHurt();
      flashScreen();
      fb.className = 'battle-feedback wrong';
      fb.textContent = `❌ ผิด! คำที่ถูกคือ "${word.word}"`;
      recordReview(word, false);
    }
    afterAnswer(correct);
  }

  function afterAnswer(wasCorrect) {
    const enemyDead = battle.enemyHp <= 0;
    const playerDead = battle.playerHp <= 0;

    setTimeout(() => {
      if (playerDead) { finishBattle(false); return; }
      if (enemyDead) {
        enemyDefeated();
        return;
      }
      nextWord();
    }, wasCorrect ? 850 : 1250);
  }

  function enemyDefeated() {
    const sprite = document.getElementById('enemy-sprite');
    sprite.className = 'enemy-sprite defeated';
    setTimeout(() => {
      battle.enemyIndex += 1;
      if (battle.enemyIndex >= battle.enemyKeys.length) {
        finishBattle(true);
      } else {
        spawnEnemy();
      }
    }, 700);
  }

  async function recordReview(word, known) {
    try {
      const result = await api('/progress/review', {
        method: 'POST',
        body: { wordId: word.id, level: battle.level, known },
      });
      battle.expGained += result.gainedExp;
      if (known && result.gainedExp > 0) popExp(result.gainedExp);
      state.user.exp = result.levelInfo.exp;
      state.user.level = result.levelInfo.level;
      state.user.expIntoLevel = result.levelInfo.expIntoLevel;
      state.user.expForNextLevel = result.levelInfo.expForNextLevel;
      state.user.progressPercent = result.levelInfo.progressPercent;
      renderHud();
      if (result.leveledUp) showLevelUp(result.levelInfo);
    } catch (_e) { /* keep playing even if save fails */ }
  }

  // --- animations ---
  function enemyHurt() {
    const s = document.getElementById('enemy-sprite');
    s.classList.remove('idle');
    s.classList.add('hurt');
    setTimeout(() => { s.classList.remove('hurt'); s.classList.add('idle'); }, 400);
  }
  function heroAttack() {
    const h = document.getElementById('hero-sprite');
    h.classList.add('attack');
    setTimeout(() => h.classList.remove('attack'), 400);
  }
  function heroHurt() {
    const h = document.getElementById('hero-sprite');
    h.classList.add('hurt');
    setTimeout(() => h.classList.remove('hurt'), 400);
  }
  function flashScreen() {
    const f = document.getElementById('battle-flash');
    f.classList.add('active');
    setTimeout(() => f.classList.remove('active'), 250);
  }
  function floatText(text, cls) {
    const el = document.getElementById('enemy-float');
    el.textContent = text;
    el.className = 'floating-text ' + (cls || '');
    // force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('go');
    setTimeout(() => { el.className = 'floating-text hidden'; }, 900);
  }

  function finishBattle(won) {
    stopWordTimer();
    if (won) {
      markStageCleared(battle.level, battle.stageIndex);
    }
    const stages = QUEST_STAGES[battle.level];
    const isLastStage = battle.stageIndex >= stages.length - 1;
    const hasNext = won && !isLastStage;

    const icon = won ? (isLastStage ? '👑' : '🏆') : '💀';
    document.getElementById('battle-result-icon').textContent = icon;
    document.getElementById('battle-result-title').textContent = won
      ? (isLastStage ? 'พิชิตโซนสำเร็จ!' : 'ผ่านด่านแล้ว!')
      : 'พ่ายแพ้...';
    document.getElementById('battle-result-sub').textContent = won
      ? (isLastStage
          ? `สุดยอด! คุณพิชิต${QUEST_ZONES[battle.level].title}ครบทุกด่านแล้ว`
          : `ผ่านด่าน ${battle.stageIndex + 1} เรียบร้อย เดินหน้าสู่ด่านต่อไป!`)
      : 'HP หมดก่อน ลองสู้ใหม่อีกครั้ง!';
    document.getElementById('br-correct').textContent = battle.correct;
    document.getElementById('br-wrong').textContent = battle.wrong;
    document.getElementById('br-exp').textContent = battle.expGained;

    // ปุ่มขวา: ถ้าชนะและมีด่านถัดไป → "ด่านถัดไป", ถ้าแพ้ → "ลองใหม่", ถ้าจบโซน → "เลือกด่าน"
    const againBtn = document.getElementById('btn-br-again');
    againBtn.textContent = hasNext ? '➡️ ด่านถัดไป' : (won ? '🗺️ เลือกด่าน' : '🔄 ลองใหม่');
    battle.resultAction = hasNext ? 'next' : (won ? 'select' : 'retry');

    showScreen('screen-battle-result');
  }

  // --- event listeners ---
  document.getElementById('btn-battle-submit').addEventListener('click', submitBattleAnswer);
  document.getElementById('battle-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBattleAnswer();
  });
  document.getElementById('btn-exit-battle').addEventListener('click', () => {
    stopWordTimer();
    const level = battle ? battle.level : null;
    battle = null;
    if (level) {
      openQuestSelect(level);
    } else {
      showScreen('screen-map');
      loadMap();
    }
  });
  document.getElementById('btn-br-map').addEventListener('click', () => {
    const level = battle ? battle.level : null;
    battle = null;
    if (level) {
      openQuestSelect(level);
    } else {
      showScreen('screen-map');
      loadMap();
    }
  });
  document.getElementById('btn-br-again').addEventListener('click', () => {
    if (!battle) { showScreen('screen-map'); loadMap(); return; }
    const { level, stageIndex, resultAction } = battle;
    if (resultAction === 'next') {
      startBattle(level, stageIndex + 1);
    } else if (resultAction === 'select') {
      openQuestSelect(level);
    } else {
      startBattle(level, stageIndex);
    }
  });

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
    loadVersion();
    if (!state.token) {
      showAuth();
      return;
    }
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      renderHud();
      showApp();
      loadMap();
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

  boot();
})();
