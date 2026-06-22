(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'wq_token';
  const SESSION_SIZE = 12;

  const LEVEL_META = {
    A1: { name: 'หมู่บ้านเริ่มต้น', sub: 'คำศัพท์พื้นฐานที่สุด', color: '#4f9d69' },
    A2: { name: 'ทุ่งหญ้ากว้าง', sub: 'คำศัพท์ใช้ในชีวิตประจำวัน', color: '#e0a458' },
    B1: { name: 'เทือกเขาสูง', sub: 'คำศัพท์ระดับกลาง', color: '#4d6fa8' },
    B2: { name: 'ยอดเขาสุดท้าย', sub: 'คำศัพท์ระดับสูง', color: '#7c5cbf' },
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

  document.getElementById('hud-avatar').addEventListener('click', showAvatarPicker);

  function showAvatarPicker() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const optionsHtml = AVATARS.map((a) => {
      const selected = state.user && state.user.avatar === a.id ? ' selected' : '';
      return `<button class="avatar-option${selected}" data-avatar-id="${a.id}">${a.emoji}</button>`;
    }).join('');

    overlay.innerHTML = `
      <div class="modal-card">
        <h2>เลือกอวตารของคุณ</h2>
        <p>แตะตัวที่ชอบเพื่อเปลี่ยนได้เลย</p>
        <div class="avatar-grid">${optionsHtml}</div>
        <button class="btn btn-secondary btn-block" style="margin-top:18px;" id="avatar-cancel">ปิด</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.avatar-option').forEach((btn) => {
      btn.addEventListener('click', () => selectAvatar(btn.dataset.avatarId, overlay));
    });
    overlay.querySelector('#avatar-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async function selectAvatar(avatarId, overlay) {
    try {
      const { user } = await api('/auth/avatar', { method: 'PATCH', body: { avatar: avatarId } });
      state.user.avatar = user.avatar;
      renderHud();
      overlay.remove();
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
    const levels = ['A1', 'A2', 'B1', 'B2'];
    track.innerHTML = '';

    levels.forEach((lvl, idx) => {
      const meta = LEVEL_META[lvl];
      const s = state.summary[lvl];
      const pct = s.total ? Math.round((s.known / s.total) * 100) : 0;

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
      const words = data.words;
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

      if (dedupedPool.length < 2) {
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

      popExp(result.gainedExp);
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
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
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

  boot();
})();
