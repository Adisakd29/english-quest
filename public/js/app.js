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
          startBattle(btn.dataset.level);
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
  // BATTLE MODE
  // ---------------------------------------------------------------

  // ศัตรู: SVG + ชื่อ + HP สำหรับแต่ละระดับ
  const ENEMIES = {
    A1: {
      name: 'สไลม์มือใหม่', hp: 12,
      svg: `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="100" rx="58" ry="44" fill="#5dc85d"/>
        <ellipse cx="80" cy="90" rx="52" ry="52" fill="#6ee06e"/>
        <circle cx="60" cy="82" r="10" fill="#1a1a1a"/>
        <circle cx="100" cy="82" r="10" fill="#1a1a1a"/>
        <circle cx="63" cy="79" r="3" fill="#fff"/>
        <circle cx="103" cy="79" r="3" fill="#fff"/>
        <path d="M66 100 Q80 112 94 100" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <ellipse cx="80" cy="140" rx="40" ry="8" fill="#000" opacity="0.2"/>
      </svg>`,
    },
    A2: {
      name: 'กอบลิน', hp: 14,
      svg: `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="135" rx="32" ry="10" fill="#000" opacity="0.2"/>
        <rect x="55" y="95" width="50" height="45" rx="8" fill="#8bc34a"/>
        <ellipse cx="80" cy="72" rx="38" ry="36" fill="#9ccc65"/>
        <ellipse cx="62" cy="58" rx="8" ry="14" fill="#8bc34a" transform="rotate(-15 62 58)"/>
        <ellipse cx="98" cy="58" rx="8" ry="14" fill="#8bc34a" transform="rotate(15 98 58)"/>
        <circle cx="68" cy="74" r="8" fill="#1a1a1a"/>
        <circle cx="92" cy="74" r="8" fill="#1a1a1a"/>
        <circle cx="70" cy="72" r="2.5" fill="#fff"/>
        <circle cx="94" cy="72" r="2.5" fill="#fff"/>
        <ellipse cx="80" cy="86" rx="10" ry="6" fill="#8bc34a"/>
        <path d="M68 90 Q80 100 92 90" stroke="#1a1a1a" stroke-width="2.5" fill="none"/>
        <rect x="40" y="105" width="14" height="30" rx="5" fill="#8bc34a" transform="rotate(-10 40 105)"/>
        <rect x="106" y="105" width="14" height="30" rx="5" fill="#8bc34a" transform="rotate(10 106 105)"/>
        <rect x="42" y="130" width="16" height="18" rx="4" fill="#6d4c41"/>
        <rect x="102" y="130" width="16" height="18" rx="4" fill="#6d4c41"/>
        <rect x="45" y="97" width="18" height="8" rx="3" fill="#ff8f00"/>
      </svg>`,
    },
    B1: {
      name: 'หมาป่าน้ำแข็ง', hp: 16,
      svg: `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="140" rx="40" ry="10" fill="#000" opacity="0.18"/>
        <rect x="45" y="100" width="70" height="48" rx="12" fill="#607d8b"/>
        <rect x="52" y="115" width="18" height="34" rx="6" fill="#546e7a"/>
        <rect x="90" y="115" width="18" height="34" rx="6" fill="#546e7a"/>
        <ellipse cx="80" cy="76" rx="42" ry="38" fill="#78909c"/>
        <ellipse cx="58" cy="50" rx="10" ry="18" fill="#607d8b" transform="rotate(-20 58 50)"/>
        <ellipse cx="102" cy="50" rx="10" ry="18" fill="#607d8b" transform="rotate(20 102 50)"/>
        <circle cx="66" cy="78" r="9" fill="#111"/>
        <circle cx="94" cy="78" r="9" fill="#111"/>
        <circle cx="68" cy="76" r="3" fill="#adf"/>
        <circle cx="96" cy="76" r="3" fill="#adf"/>
        <ellipse cx="80" cy="92" rx="12" ry="6" fill="#607d8b"/>
        <path d="M68 96 L72 104 L80 98 L88 104 L92 96" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
        <ellipse cx="80" cy="60" rx="8" ry="5" fill="#90a4ae"/>
        <path d="M40 105 Q30 120 35 135" stroke="#546e7a" stroke-width="10" stroke-linecap="round" fill="none"/>
        <path d="M120 105 Q130 120 125 135" stroke="#546e7a" stroke-width="10" stroke-linecap="round" fill="none"/>
      </svg>`,
    },
    B2: {
      name: 'พ่อมดมืด', hp: 18,
      svg: `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="148" rx="36" ry="8" fill="#000" opacity="0.2"/>
        <rect x="55" y="98" width="50" height="52" rx="6" fill="#4a148c"/>
        <rect x="48" y="112" width="14" height="36" rx="4" fill="#4a148c"/>
        <rect x="98" y="112" width="14" height="36" rx="4" fill="#4a148c"/>
        <rect x="42" y="138" width="18" height="12" rx="3" fill="#311b92"/>
        <rect x="100" y="138" width="18" height="12" rx="3" fill="#311b92"/>
        <ellipse cx="80" cy="76" rx="36" ry="34" fill="#6a1b9a"/>
        <path d="M44 68 L80 15 L116 68 Z" fill="#4a148c"/>
        <circle cx="67" cy="78" r="8" fill="#ce93d8"/>
        <circle cx="93" cy="78" r="8" fill="#ce93d8"/>
        <circle cx="67" cy="78" r="4" fill="#4a0072"/>
        <circle cx="93" cy="78" r="4" fill="#4a0072"/>
        <path d="M68 92 Q80 100 92 92" stroke="#ce93d8" stroke-width="2.5" fill="none"/>
        <circle cx="52" cy="112" r="6" fill="#ce93d8" opacity="0.8"/>
        <path d="M46 112 L30 90 L40 112 Z" fill="#e040fb" opacity="0.7"/>
        <circle cx="108" cy="112" r="6" fill="#ce93d8" opacity="0.8"/>
        <path d="M114 112 L130 90 L120 112 Z" fill="#e040fb" opacity="0.7"/>
      </svg>`,
    },
    C1: {
      name: 'มังกรทอง', hp: 22,
      svg: `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="148" rx="45" ry="8" fill="#000" opacity="0.2"/>
        <path d="M30 90 Q20 70 35 55 Q50 40 65 60" fill="#e65100" stroke="#bf360c" stroke-width="1"/>
        <path d="M130 90 Q140 70 125 55 Q110 40 95 60" fill="#e65100" stroke="#bf360c" stroke-width="1"/>
        <ellipse cx="80" cy="100" rx="48" ry="42" fill="#f57f17"/>
        <ellipse cx="80" cy="100" rx="36" ry="34" fill="#ff8f00"/>
        <path d="M50 62 L60 40 L70 62 Z" fill="#e65100"/>
        <path d="M75 58 L80 38 L85 58 Z" fill="#e65100"/>
        <path d="M90 62 L100 40 L110 62 Z" fill="#e65100"/>
        <ellipse cx="80" cy="72" rx="38" ry="28" fill="#ffa000"/>
        <circle cx="68" cy="68" r="10" fill="#1a1a1a"/>
        <circle cx="92" cy="68" r="10" fill="#1a1a1a"/>
        <circle cx="65" cy="66" r="3.5" fill="#ffd54f"/>
        <circle cx="89" cy="66" r="3.5" fill="#ffd54f"/>
        <ellipse cx="80" cy="84" rx="14" ry="7" fill="#e65100"/>
        <path d="M67 88 L70 96 L80 90 L90 96 L93 88" stroke="#ffd54f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M120 92 Q138 80 145 100 Q138 118 120 108" fill="#f57f17" stroke="#e65100" stroke-width="1"/>
        <path d="M40 92 Q22 80 15 100 Q22 118 40 108" fill="#f57f17" stroke="#e65100" stroke-width="1"/>
        <circle cx="80" cy="56" r="6" fill="#ffd54f"/>
      </svg>`,
    },
  };

  const PLAYER_MAX_HP = 100;
  const PLAYER_DAMAGE = 25;   // HP ที่เสียต่อครั้งที่ตอบผิด
  const BATTLE_SIZE = 10;     // จำนวนคำต่อ 1 การสู้

  let battleState = null;

  function startBattle(level) {
    showScreen('screen-battle');
    document.getElementById('battle-level-chip').textContent = level;
    document.getElementById('battle-level-chip').style.background = LEVEL_META[level].color;
    document.getElementById('battle-input').value = '';
    document.getElementById('battle-feedback').classList.add('hidden');

    const enemy = ENEMIES[level] || ENEMIES.A1;
    document.getElementById('enemy-name').textContent = enemy.name;
    document.getElementById('enemy-sprite').innerHTML = enemy.svg;
    document.getElementById('enemy-sprite').className = 'enemy-sprite idle';

    battleState = {
      level,
      queue: [],
      index: 0,
      playerHp: PLAYER_MAX_HP,
      enemyMaxHp: enemy.hp,
      enemyHp: enemy.hp,
      correct: 0,
      wrong: 0,
      expGained: 0,
      showingHint: false,
      hintTimer: null,
    };

    updateBattleHP();
    loadBattleWords(level);
  }

  async function loadBattleWords(level) {
    try {
      const data = await api(`/words/${level}`);
      const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);
      const words = data.words.filter((w) => CONTENT_CATEGORIES.has(w.category));

      // เน้นคำที่ยังไม่รู้ก่อน เอาคำที่รู้แล้วเติมถ้าไม่พอ
      const notKnown = words.filter((w) => w.status !== 'known');
      const known = words.filter((w) => w.status === 'known');
      const pool = shuffle(notKnown.length >= BATTLE_SIZE
        ? notKnown
        : [...notKnown, ...shuffle(known)]
      ).slice(0, BATTLE_SIZE + 10); // เผื่อหาคำแปลไม่ได้บางคำ

      // ดึงคำแปลสำหรับทุกคำ
      const { translations } = await api('/translate', {
        method: 'POST',
        body: { wordIds: pool.map((w) => w.id) },
      });

      const queue = pool
        .filter((w) => translations[w.id])
        .map((w) => ({ ...w, th: translations[w.id] }))
        .slice(0, BATTLE_SIZE);

      if (queue.length < 3) {
        toast('หาคำแปลไม่พอสำหรับโหมดนี้ ลองใหม่อีกครั้ง', 'error');
        showScreen('screen-map');
        return;
      }

      battleState.queue = queue;
      battleState.enemyMaxHp = queue.length;
      battleState.enemyHp = queue.length;
      document.getElementById('enemy-hp-num').textContent = queue.length;
      updateBattleHP();
      renderBattleWord();
      document.getElementById('battle-input').focus();
    } catch (err) {
      toast(err.message, 'error');
      showScreen('screen-map');
    }
  }

  function renderBattleWord() {
    if (!battleState || battleState.index >= battleState.queue.length) return;
    const word = battleState.queue[battleState.index];
    document.getElementById('battle-meaning').textContent = word.th;
    document.getElementById('battle-pos').textContent = word.pos || '';
    document.getElementById('battle-hint').classList.add('hidden');
    document.getElementById('battle-hint').textContent = '';
    document.getElementById('battle-input').value = '';
    document.getElementById('battle-input').className = 'battle-input';
    document.getElementById('battle-feedback').classList.add('hidden');
    battleState.showingHint = false;
    if (battleState.hintTimer) clearTimeout(battleState.hintTimer);
    // แสดงคำใบ้หลังจาก 6 วินาที ถ้ายังไม่ตอบ
    battleState.hintTimer = setTimeout(showBattleHint, 6000);
  }

  function showBattleHint() {
    if (!battleState) return;
    const word = battleState.queue[battleState.index];
    // แสดงตัวอักษรตัวแรก + _ สำหรับตัวที่เหลือ
    const hint = word.word[0] + '_'.repeat(Math.max(0, word.word.length - 1));
    const hintEl = document.getElementById('battle-hint');
    hintEl.textContent = hint;
    hintEl.classList.remove('hidden');
    battleState.showingHint = true;
  }

  function updateBattleHP() {
    const playerPct = Math.max(0, (battleState.playerHp / PLAYER_MAX_HP) * 100);
    const enemyPct = Math.max(0, (battleState.enemyHp / battleState.enemyMaxHp) * 100);
    document.getElementById('player-hp-fill').style.width = `${playerPct}%`;
    document.getElementById('player-hp-num').textContent = Math.max(0, battleState.playerHp);
    document.getElementById('enemy-hp-fill').style.width = `${enemyPct}%`;
    document.getElementById('enemy-hp-num').textContent = Math.max(0, battleState.enemyHp);
  }

  function showBattleDamagePop(text, isCorrect) {
    const el = document.getElementById('battle-damage-pop');
    el.textContent = text;
    el.className = 'battle-damage-pop' + (isCorrect ? ' correct' : '');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 900);
  }

  async function submitBattleAnswer() {
    if (!battleState || battleState.index >= battleState.queue.length) return;
    const input = document.getElementById('battle-input');
    const answer = input.value.trim().toLowerCase();
    if (!answer) return;

    const word = battleState.queue[battleState.index];
    const correct = answer === word.word.toLowerCase();

    if (battleState.hintTimer) clearTimeout(battleState.hintTimer);

    const feedbackEl = document.getElementById('battle-feedback');
    feedbackEl.classList.remove('hidden', 'correct', 'wrong');
    input.className = 'battle-input ' + (correct ? 'correct' : 'wrong');

    if (correct) {
      // โจมตีศัตรู
      battleState.correct += 1;
      battleState.enemyHp -= 1;
      const spriteEl = document.getElementById('enemy-sprite');
      spriteEl.className = 'enemy-sprite hurt';
      setTimeout(() => { spriteEl.className = 'enemy-sprite idle'; }, 400);
      showBattleDamagePop('⚔️ -1', true);
      feedbackEl.classList.add('correct');
      feedbackEl.textContent = `✅ ถูกต้อง! "${word.word}"`;

      // บันทึก EXP
      try {
        const result = await api('/progress/review', {
          method: 'POST',
          body: { wordId: word.id, level: battleState.level, known: true },
        });
        battleState.expGained += result.gainedExp;
        if (result.gainedExp > 0) popExp(result.gainedExp);
        state.user.exp = result.levelInfo.exp;
        state.user.level = result.levelInfo.level;
        state.user.expIntoLevel = result.levelInfo.expIntoLevel;
        state.user.expForNextLevel = result.levelInfo.expForNextLevel;
        state.user.progressPercent = result.levelInfo.progressPercent;
        renderHud();
        if (result.leveledUp) showLevelUp(result.levelInfo);
      } catch (_e) { /* ไม่หยุดเกม ถ้า EXP บันทึกไม่ได้ */ }
    } else {
      // ผู้เล่นเสียเลือด
      battleState.wrong += 1;
      battleState.playerHp -= PLAYER_DAMAGE;
      showBattleDamagePop(`💥 -${PLAYER_DAMAGE}`, false);
      feedbackEl.classList.add('wrong');
      feedbackEl.textContent = `❌ ผิด! คำที่ถูกคือ "${word.word}"`;

      // บันทึกว่าตอบผิด
      try {
        await api('/progress/review', {
          method: 'POST',
          body: { wordId: word.id, level: battleState.level, known: false },
        });
      } catch (_e) { /* ignore */ }
    }

    updateBattleHP();

    // เช็คเงื่อนไขสิ้นสุดการต่อสู้
    const playerDead = battleState.playerHp <= 0;
    const enemyDead = battleState.enemyHp <= 0;

    if (playerDead || enemyDead || battleState.index >= battleState.queue.length - 1) {
      setTimeout(() => finishBattle(enemyDead && !playerDead), 1200);
    } else {
      battleState.index += 1;
      setTimeout(renderBattleWord, 1100);
    }
  }

  function finishBattle(won) {
    if (battleState.hintTimer) clearTimeout(battleState.hintTimer);
    const icon = won ? '🏆' : '💀';
    const title = won ? 'ชนะแล้ว!' : 'แพ้แล้ว...';
    const sub = won
      ? `ยอดเยี่ยมมาก! คุณกำจัด${ENEMIES[battleState.level]?.name || 'ศัตรู'}ได้สำเร็จ`
      : `ไม่เป็นไร สู้ใหม่ได้เสมอ! HP หมดก่อน`;
    document.getElementById('battle-result-icon').textContent = icon;
    document.getElementById('battle-result-title').textContent = title;
    document.getElementById('battle-result-sub').textContent = sub;
    document.getElementById('br-correct').textContent = battleState.correct;
    document.getElementById('br-wrong').textContent = battleState.wrong;
    document.getElementById('br-exp').textContent = battleState.expGained;
    showScreen('screen-battle-result');
  }

  // Battle event listeners
  document.getElementById('btn-battle-submit').addEventListener('click', submitBattleAnswer);
  document.getElementById('battle-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBattleAnswer();
  });
  document.getElementById('btn-exit-battle').addEventListener('click', () => {
    if (battleState && battleState.hintTimer) clearTimeout(battleState.hintTimer);
    battleState = null;
    showScreen('screen-map');
    loadMap();
  });
  document.getElementById('btn-br-map').addEventListener('click', () => {
    battleState = null;
    showScreen('screen-map');
    loadMap();
  });
  document.getElementById('btn-br-again').addEventListener('click', () => {
    const level = battleState ? battleState.level : 'A1';
    startBattle(level);
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
