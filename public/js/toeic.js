/* =====================================================================
   TOEIC-style Practice — window.EQToeic  (Listening Part 1: Photographs)
   หน้าจอ:
     hub        #/toeic             เมนู TOEIC Practice (Listening Part 1–4 · Reading Part 5–7 ภายหลัง)
     p1         #/toeic-p1          Part 1 Landing: Practice / Mock Test · สถิติ · Review Mistakes · คำศัพท์
     play       #/toeic-p1-play/ID  ทำข้อ (Practice หรือ Mock) — หน้าจอเต็ม ไม่มี nav ล่าง
     review     #/toeic-p1-review   Error Notebook (ข้อที่ยังตอบผิด) · ฟังซ้ำ · Transcript · คำแปล · วิเคราะห์ตัวลวง
     vocab      #/toeic-p1-vocab    Part 1 Essential Vocabulary (เชื่อมคลังคำศัพท์/SRS เดิม)
   หลักการ:
     - ข้อความ A–D / เฉลย / alt ไม่ถูกส่งมาก่อนตอบ (ตรวจคำตอบที่เซิร์ฟเวอร์)
     - เสียงหนึ่งไฟล์ต่อข้อ (lead-in + A–D) โหลดเต็มไฟล์ก่อนเล่น (fetch -> blob) -> ไม่มีเสียงขาดกลางคัน · โหลดไม่ได้ = หยุดรอ ไม่นับผิด
     - Mock: เสียงเล่นครั้งเดียว · ไม่มี transcript/คำแปล/hint/feedback ระหว่างข้อ · ไม่มี replay · ปรับเสียงได้
     - Practice: เล่น/เล่นซ้ำ · 0.9x / 1.0x · ขยายภาพ · หลังตอบเปิดคำอธิบายทั้งหมด
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C', 'D'];
  const root = (id) => document.getElementById(`${id}-root`);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* - */ } } };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* - */ } } };
  let meta = null;
  const getMeta = async () => meta || (meta = await api('/meta'));

  function setHash(path, param) { const t = `#/${path}${param ? `/${param}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p>
      <button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const back = (to, label) => `<button class="game-exit gl-back" type="button" data-tq-nav="${to}">${ICON('arrow-left', 'icon icon-sm')} ${esc(label)}</button>`;
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} วิ` : '—');
  const disclaimer = (m) => `<p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;

  /* =====================================================================
     เสียง: โหลดเต็มไฟล์ก่อนเล่น (blob) + cache เล็ก ๆ ในหน่วยความจำ (ข้อปัจจุบัน + ข้อถัดไป)
     ===================================================================== */
  const blobs = new Map();          // url -> Promise<objectURL>
  function loadAudio(url) {
    if (!blobs.has(url)) {
      const p = fetch(url, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
        .then((b) => { if (!b.size) throw new Error('empty'); return URL.createObjectURL(b); });
      p.catch(() => blobs.delete(url));
      blobs.set(url, p);
      if (blobs.size > 4) { const [k, v] = blobs.entries().next().value; blobs.delete(k); v.then((u) => URL.revokeObjectURL(u)).catch(() => {}); }
    }
    return blobs.get(url);
  }
  function loadImage(url) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(url); im.onerror = () => rej(new Error('image')); im.src = url; });
  }
  const imgUrl = (img) => (window.innerWidth <= 700 ? img.small : img.url);

  let player = null;                // HTMLAudioElement เดียว (ปลดล็อก autoplay ด้วยการแตะครั้งแรก)
  function audioEl() {
    if (!player) {
      player = new Audio();
      player.preload = 'auto';
      const v = Number(ls.get('eq_tq_vol'));
      player.volume = Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1;
    }
    return player;
  }
  function stopAudio() { if (player) { player.pause(); player.onended = null; player.ontimeupdate = null; player.onerror = null; } }
  const volumeCtl = (id) => `<label class="tq-vol" for="${id}">${ICON('volume-2', 'icon icon-sm')}<span class="sr-only">ระดับเสียง</span>
    <input type="range" id="${id}" min="0" max="100" step="5" value="${Math.round(audioEl().volume * 100)}" data-tq-vol aria-label="ระดับเสียง"></label>`;
  document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('[data-tq-vol]')) return;
    audioEl().volume = Number(e.target.value) / 100;
    ls.set('eq_tq_vol', String(audioEl().volume));
  });

  /* =====================================================================
     HUB — TOEIC Practice
     ===================================================================== */
  async function openHub() {
    App().showScreen('screen-toeic'); setHash('toeic');
    const el = root('screen-toeic');
    loading(el);
    try {
      const m = await getMeta();
      const card = (p) => `<li><button class="tq-part${p.ready ? '' : ' is-soon'}" type="button" ${p.ready ? `data-tq-nav="toeic-${p.id}"` : 'disabled aria-disabled="true"'}>
          <span class="tq-part-no">${p.part}</span>
          <span class="tq-part-text"><b>${esc(p.title)}</b><small>${esc(p.ready ? p.desc : `${p.th} · เร็ว ๆ นี้`)}</small></span>
          ${p.ready ? ICON('chevron-right', 'icon icon-sm') : `<span class="tq-soon">${ICON('lock', 'icon icon-sm')}</span>`}</button></li>`;
      el.innerHTML = `
        <header class="tq-hero">
          <p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} TOEIC-style Practice</p>
          <h1 class="page-title" id="tq-hub-title">TOEIC Practice</h1>
          <p class="gl-sub">ฝึกทำข้อสอบรูปแบบ TOEIC ด้วยโจทย์ต้นฉบับของ EnglishQuest · EXP รวมกับคำศัพท์และแกรมม่า</p>
        </header>
        <section class="tq-section" aria-labelledby="tq-l-title">
          <h2 class="tq-h2" id="tq-l-title">${ICON('headphones', 'icon icon-sm')} Listening</h2>
          <ul class="tq-parts">${m.parts.filter((p) => p.section === 'listening').map(card).join('')}</ul>
        </section>
        <section class="tq-section" aria-labelledby="tq-r-title">
          <h2 class="tq-h2" id="tq-r-title">${ICON('book-open', 'icon icon-sm')} Reading</h2>
          <ul class="tq-parts">${m.parts.filter((p) => p.section === 'reading').map(card).join('')}</ul>
        </section>
        ${disclaimer(m)}`;
      focusTitle('tq-hub-title');
    } catch (err) { errorBox(el, err, openHub); }
  }

  /* =====================================================================
     PART 1 LANDING
     ===================================================================== */
  let range = ls.get('eq_tq_range') || 'all';
  async function openPart1() {
    App().showScreen('screen-toeic'); setHash('toeic-p1');
    const el = root('screen-toeic');
    loading(el);
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/p1/summary?range=${range}`)]);
      const resume = s.activeSessions.map((a) => `<button class="tq-resume" type="button" data-tq-resume="${a.id}">
          ${ICON('play', 'icon icon-sm')} ทำ${a.mode === 'mock' ? ' Mock Test' : 'ชุดฝึก'}ต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (label, d, extra = '') => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}${extra}</span>
          <span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${d ? d.accuracy : 0}%"></span></span>
          <b>${d ? `${d.accuracy}%` : '—'}</b><small>${d ? `${d.total} ข้อ` : 'ยังไม่มีข้อมูล'}</small></li>`;
      const skillRows = s.skills.length ? s.skills.map((g) => bar(g.th, g)).join('') : '';
      el.innerHTML = `
        ${back('toeic', 'TOEIC Practice')}
        <header class="tq-hero tq-hero-p1">
          <p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} Listening · Part 1</p>
          <h1 class="page-title" id="tq-p1-title">Photographs</h1>
          <p class="gl-sub">ดูภาพ ฟัง 4 ประโยค และเลือกประโยคที่อธิบายภาพได้ดีที่สุด</p>
        </header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-tq-act="practice">
            ${ICON('graduation-cap', 'icon')}<b>Practice</b><small>เรียนวิธีทำข้อสอบ · ฟังซ้ำได้ · ดูคำอธิบาย คำแปล และวิเคราะห์ตัวลวงหลังตอบ</small></button>
          <button class="tq-mode" type="button" data-tq-act="mock">
            ${ICON('timer', 'icon')}<b>Mock Test</b><small>${m.mockSize} ข้อแบบข้อสอบจำลอง · เสียงเล่นครั้งเดียว · ไม่มีคำใบ้ · ดูผลหลังจบชุด</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.practiced}<small>/${s.bankSize}</small></b><span>Questions Practiced</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestPractice ? `${s.bestPractice.percent}%` : '—'}</b><span>Best Practice Score</span></div>
          <div class="tq-stat" role="listitem"><b class="tq-stat-text">${s.weakSkill ? esc(s.weakSkill.th.replace(/\s*\(.*\)/, '')) : '—'}</b><span>Weak Skill</span></div>
        </div>
        <div class="tq-links">
          <button class="tq-link" type="button" data-tq-nav="toeic-p1-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
            <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ข้อที่ยังตอบผิด · ฟังซ้ำ ดูเฉลยและคำอธิบาย` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button>
          <button class="tq-link" type="button" data-tq-nav="toeic-p1-vocab">${ICON('book', 'icon icon-sm')}
            <span><b>Part 1 Essential Vocabulary</b><small>คำที่พบบ่อยใน Part 1 แยกหมวด · เพิ่มเข้ารายการทบทวนได้</small></span></button>
        </div>
        <section class="gl-card tq-analytics" aria-labelledby="tq-an-title">
          <div class="tq-an-head">
            <h2 class="tq-h2" id="tq-an-title">${ICON('chart-column', 'icon icon-sm')} Listening Analytics</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">
              ${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-tq-range="${v}">${t}</button>`).join('')}
            </div>
          </div>
          ${s.answered ? `<p class="tq-an-sum">Part 1 Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ${s.bestMock ? ` · Mock สูงสุด ${s.bestMock.percent}%` : ''}</p>
          <ul class="tq-skills">${skillRows}
            ${bar('ภาพมีคน (People photos)', s.photos.people)}${bar('ภาพไม่มีคน (No-person photos)', s.photos.noPerson)}</ul>
          <p class="tq-an-sub">สำเนียง: อเมริกัน ${s.accents.us ? `${s.accents.us.accuracy}%` : '—'} · อังกฤษ ${s.accents.uk ? `${s.accents.uk.accuracy}%` : '—'}</p>
          ${s.traps.length ? `<p class="tq-an-sub">กับดักที่พลาดบ่อย: ${s.traps.map((t) => `<span class="tq-chip">${esc(t.th)} ×${t.n}</span>`).join(' ')}</p>` : ''}`
            : `<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test เพื่อดูจุดแข็ง/จุดอ่อน</p>`}
        </section>
        ${disclaimer(m)}`;
      focusTitle('tq-p1-title');
    } catch (err) { errorBox(el, err, openPart1); }
  }

  /* ---------- ตั้งค่าก่อนฝึก (ไม่ให้เยอะจนสับสน: ขั้นสูงซ่อนไว้) ---------- */
  async function practiceSetup(source = 'bank') {
    const m = await getMeta();
    const saved = (() => { try { return JSON.parse(ls.get('eq_tq_cfg') || '{}'); } catch (_) { return {}; } })();
    const cfg = { size: 10, difficulty: 'mixed', topic: 'mixed', accent: 'mixed', ...saved };
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
    const TOPIC_TH = { mixed: 'ผสม (Mixed)', people: 'มีคน (People)', objects: 'สิ่งของ (Objects)', workplace: 'ที่ทำงาน (Workplace)', transportation: 'การเดินทาง', shopping: 'ซื้อของ/ร้านอาหาร', outdoor: 'กลางแจ้ง (Outdoor)' };
    ov.innerHTML = `<div class="modal-card tq-setup" role="document">
      <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกข้อที่เคยผิด (Custom Review)' : 'ตั้งค่า Part 1 Practice'}</h2>
      ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกข้อที่ครั้งล่าสุดยังตอบผิด · ลำดับคำตอบและสำเนียงอาจต่างจากเดิม</p>' : `
      <p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['adaptive', 'Adaptive']], cfg.difficulty)}
      <p class="tq-setup-hint" id="tq-adapt-hint" ${cfg.difficulty === 'adaptive' ? '' : 'hidden'}>Adaptive: เพิ่มข้อในทักษะที่คุณพลาดบ่อย และปรับความยากตามความแม่นยำ (ต้องมีประวัติอย่างน้อย 12 ข้อ)</p>`}
      <p class="tq-setup-label">จำนวนข้อ</p>${seg('size', m.practice.sizes.map((n) => [n, `${n} ข้อ`]), cfg.size)}
      ${source === 'mistakes' ? '' : `<details class="tq-adv"><summary>ตั้งค่าเพิ่มเติม (หัวข้อ · สำเนียง)</summary>
        <label class="tq-setup-label" for="tq-topic">หัวข้อภาพ</label>
        <select id="tq-topic" class="tq-select">${m.practice.topics.map((t) => `<option value="${t}" ${t === cfg.topic ? 'selected' : ''}>${TOPIC_TH[t] || t}</option>`).join('')}</select>
        <p class="tq-setup-label">สำเนียงผู้พูด</p>${seg('accent', [['mixed', 'ผสม'], ['us', 'American'], ['uk', 'British']], cfg.accent)}
      </details>`}
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
        <button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ตั้งค่าการฝึก', variant: 'sheet' });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cfg]');
      if (b) {
        cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v;
        b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
        const h = ov.querySelector('#tq-adapt-hint'); if (h) h.hidden = cfg.difficulty !== 'adaptive';
        return;
      }
      if (e.target.closest('[data-close]')) { ov.remove(); return; }
      if (e.target.closest('[data-go]')) {
        const t = ov.querySelector('#tq-topic'); if (t) cfg.topic = t.value;
        if (source !== 'mistakes') ls.set('eq_tq_cfg', JSON.stringify(cfg));
        ov.remove();
        audioCheck('practice', () => start('practice', { ...cfg, source }));
      }
    });
  }

  /* =====================================================================
     AUDIO CHECK (ก่อน Mock ทุกครั้ง · ก่อน Practice ครั้งแรกของการเปิดแอป) — การแตะ = ปลดล็อกเสียงของเบราว์เซอร์ (iOS/Android/PWA)
     ===================================================================== */
  async function audioCheck(mode, next) {
    if (mode === 'practice' && ss.get('eq_tq_checked') === '1') { unlockAudio(); next(); return; }
    const m = await getMeta();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card tq-check" role="document">
      <div class="tq-check-icon">${ICON('headphones', 'icon icon-lg')}</div>
      <h2 class="vb-sheet-title" id="tq-check-title">Audio Check</h2>
      <p class="gl-sub">แนะนำให้ใช้หูฟัง · กดเล่นเสียงทดสอบแล้วปรับระดับเสียงให้ได้ยินชัด</p>
      <button class="btn btn-secondary tq-check-play" type="button" data-play>${ICON('play', 'icon icon-sm')} Play Test Sound</button>
      <div class="tq-eq tq-check-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      ${volumeCtl('tq-check-vol')}
      <p class="tq-check-q" id="tq-check-q" hidden>ได้ยินเสียงชัดเจนหรือไม่?</p>
      <p class="tq-check-err" role="alert" hidden></p>
      <div class="gl-actions" data-answers hidden>
        <button class="btn btn-secondary" type="button" data-retry>${ICON('refresh-cw', 'icon icon-sm')} ลองอีกครั้ง</button>
        <button class="btn btn-primary" type="button" data-ok>${ICON('check', 'icon icon-sm')} ได้ยินชัดเจน</button></div>
      <button class="tq-check-cancel" type="button" data-close>ยกเลิก</button></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'Audio Check', variant: 'center', onClose: stopAudio });
    const eq = ov.querySelector('.tq-check-eq');
    const play = async () => {
      const err = ov.querySelector('.tq-check-err'); err.hidden = true;
      try {
        const a = audioEl(); stopAudio();
        a.src = await loadAudio(m.audioCheckUrl); a.playbackRate = 1;
        await a.play();
        eq.classList.add('is-on');
        a.onended = () => { eq.classList.remove('is-on'); ov.querySelector('#tq-check-q').hidden = false; ov.querySelector('[data-answers]').hidden = false; };
      } catch (e) {
        err.hidden = false; err.textContent = 'ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่';
        ov.querySelector('[data-answers]').hidden = false;
      }
    };
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-play]') || e.target.closest('[data-retry]')) { play(); return; }
      if (e.target.closest('[data-close]')) { stopAudio(); ov.remove(); return; }
      if (e.target.closest('[data-ok]')) { stopAudio(); ss.set('eq_tq_checked', '1'); ov.remove(); next(); }
    });
  }
  function unlockAudio() {
    // เรียกจากการแตะของผู้ใช้: เล่นเสียงเงียบสั้น ๆ เพื่อให้ <audio> เดิมเล่นต่อได้โดยไม่ต้องแตะอีก (iOS Safari / PWA)
    const a = audioEl();
    try { a.muted = true; const p = a.play(); if (p && p.catch) p.catch(() => {}); a.pause(); a.muted = false; } catch (_) { a.muted = false; }
  }

  async function start(mode, cfg = {}) {
    try {
      const s = await api('/p1/sessions', { method: 'POST', body: { mode, ...cfg } });
      openPlay(s.id, s);
    } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER (Practice / Mock)
     ===================================================================== */
  let P = null;    // สถานะผู้เล่น { s, i, phase, ... }
  async function openPlay(sid, preload) {
    App().showScreen('screen-toeic-play'); setHash('toeic-p1-play', sid);
    const el = root('screen-toeic-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/p1/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openPart1(); return; }
      const first = s.items.findIndex((x) => !x.answered);
      P = { s, i: first < 0 ? s.items.length - 1 : first, mock: s.mode === 'mock', answered: s.items.filter((x) => x.answered).length };
      App().setLeaveGuard((path) => {
        if (!P || path.startsWith('toeic-p1-play')) return false;
        if (P.mock && !confirm('ออกจาก Mock Test ตอนนี้? ชุดนี้จะไม่ถูกนับคะแนน')) return true;
        stopAudio(); App().setLeaveGuard(null); P = null; return false;
      });
      if (first < 0) { finish(); return; }
      renderQuestion();
    } catch (err) { errorBox(el, err, () => openPlay(sid)); }
  }

  function renderQuestion() {
    const el = root('screen-toeic-play');
    const { s } = P;
    const it = s.items[P.i];
    P.phase = 'loading'; P.played = false; P.startAt = null; P.selected = null; P.feedback = null;
    const playedKey = `eq_tq_played_${s.id}_${it.qid}`;
    P.alreadyPlayed = P.mock && ss.get(playedKey) === '1';      // Mock: รีโหลดหน้าเพื่อฟังซ้ำไม่ได้
    el.innerHTML = `
      <div class="tq-play ${P.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-tq-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Listening · Part 1: Photographs</b><small>${P.mock ? 'Mock Test' : 'Practice'}</small></div>
          <span class="tq-qno" id="tq-qno">Question ${P.i + 1} / ${s.total}</span>
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${P.i}"><span style="width:${(P.i / s.total) * 100}%"></span></div>
        <div class="tq-stage">
          <figure class="tq-photo" id="tq-photo">
            <div class="tq-photo-frame" style="aspect-ratio:${it.image.width}/${it.image.height}">
              <img id="tq-img" alt="ภาพประกอบข้อที่ ${P.i + 1}" width="${it.image.width}" height="${it.image.height}" decoding="async">
              <div class="tq-clues" id="tq-clues" hidden></div>
              <div class="tq-photo-loading" id="tq-photo-loading"><span class="gl-spin" aria-hidden="true"></span></div>
            </div>
            ${P.mock ? '' : `<button class="tq-expand" type="button" data-tq-expand aria-label="ขยายภาพ">${ICON('search', 'icon icon-sm')} ขยายภาพ</button>`}
          </figure>
          <div class="tq-panel">
            <div class="tq-audio" id="tq-audio">
              <div class="tq-audio-row">
                <button class="btn btn-primary tq-play-btn" type="button" data-tq-play disabled>${ICON('play', 'icon icon-sm')} <span>กำลังโหลดเสียง…</span></button>
                <div class="tq-eq" id="tq-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
                <span class="tq-now" id="tq-now" aria-hidden="true"></span>
                <span class="tq-audio-tools">
                ${P.mock ? '' : `<div class="vd-seg tq-speed" role="radiogroup" aria-label="ความเร็วเสียง">${['0.9', '1'].map((r) => `<button class="vd-seg-btn${(ls.get('eq_tq_rate') || '1') === r ? ' active' : ''}" type="button" role="radio" aria-checked="${(ls.get('eq_tq_rate') || '1') === r}" data-tq-rate="${r}">${r === '1' ? '1.0' : r}x</button>`).join('')}</div>`}
                ${volumeCtl('tq-vol')}
                </span>
              </div>
              <p class="tq-status" id="tq-status" role="status" aria-live="polite"></p>
            </div>
            <p class="tq-choose" id="tq-choose-label">Choose the best answer:</p>
            <div class="tq-answers" role="group" aria-labelledby="tq-choose-label">
              ${LETTERS.map((l) => `<button class="tq-ans" type="button" data-tq-ans="${l}" disabled aria-pressed="false"><span>${l}</span></button>`).join('')}
            </div>
            <div id="tq-after"></div>
          </div>
        </div>
      </div>`;
    focusTitle('tq-qno');
    prepare(it);
  }

  async function prepare(it) {
    const mine = P;
    const status = document.getElementById('tq-status');
    try {
      const [audioUrl] = await Promise.all([loadAudio(it.audio.url), loadImage(imgUrl(it.image)).catch(() => loadImage(it.image.url))]);
      if (P !== mine || !document.getElementById('tq-img')) return;
      const img = document.getElementById('tq-img');
      img.src = imgUrl(it.image);
      document.getElementById('tq-photo-loading').remove();
      P.audioUrl = audioUrl;
      P.phase = 'ready';
      const btn = document.querySelector('[data-tq-play]');
      if (P.alreadyPlayed) {
        btn.hidden = true; status.textContent = 'เสียงของข้อนี้เล่นไปแล้ว — เลือกคำตอบได้เลย';
        enableAnswers(); P.phase = 'ended'; P.startAt = Date.now();
      } else if (P.mock && P.autoNext) {
        playAudio();           // ข้อถัดไปใน Mock: เล่นอัตโนมัติ (เสียงถูกปลดล็อกจาก Start แล้ว) — ถ้าเบราว์เซอร์ไม่ยอม จะขึ้นปุ่มให้แตะ
      } else {
        btn.disabled = false;
        btn.querySelector('span').textContent = P.mock ? 'Start Question' : 'Play Audio';
        status.textContent = P.mock ? 'แตะ Start Question เพื่อเริ่มฟัง (เสียงเล่นได้ครั้งเดียว)' : 'แตะ Play Audio เพื่อฟังประโยค A–D';
      }
      preloadNext();
    } catch (err) {
      if (P !== mine) return;
      // โหลดไม่ได้: หยุดรอ · ไม่นับว่าตอบผิด · ให้ลองใหม่
      P.phase = 'error';
      api(`/p1/sessions/${P.s.id}/asset-error`, { method: 'POST', body: {} }).catch(() => {});
      const pl = document.getElementById('tq-photo-loading');
      if (pl) pl.innerHTML = ICON('wifi-off', 'icon icon-lg tq-photo-err');
      const box = document.getElementById('tq-audio');
      box.innerHTML = `<div class="tq-neterr" role="alert">${ICON('wifi-off', 'icon')}<p><b>ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่</b><br><small>${P.mock ? 'Mock Test หยุดไว้ชั่วคราว — ไม่มีการหักคะแนนจากปัญหาการเชื่อมต่อ' : 'ไม่มีการนับว่าตอบผิด'}</small></p>
        <button class="btn btn-primary" type="button" data-tq-retry>${ICON('refresh-cw', 'icon icon-sm')} ลองใหม่</button></div>`;
    }
  }
  function preloadNext() {
    const nx = P.s.items[P.i + 1];
    if (!nx) return;
    // ข้อถัดไปเท่านั้น (ไม่โหลดล่วงหน้ามากเกินไปบนมือถือ)
    setTimeout(() => { loadAudio(nx.audio.url).catch(() => {}); loadImage(imgUrl(nx.image)).catch(() => {}); }, 400);
  }

  function enableAnswers() { document.querySelectorAll('[data-tq-ans]').forEach((b) => { b.disabled = false; }); }

  async function playAudio() {
    if (!P || !P.audioUrl) return;
    const btn = document.querySelector('[data-tq-play]');
    const status = document.getElementById('tq-status');
    const eq = document.getElementById('tq-eq');
    const now = document.getElementById('tq-now');
    const it = P.s.items[P.i];
    const a = audioEl();
    stopAudio();
    a.src = P.audioUrl;
    a.playbackRate = P.mock ? 1 : Number(ls.get('eq_tq_rate') || 1);
    try {
      await a.play();
    } catch (e) {
      // autoplay ถูกบล็อก -> ให้ผู้ใช้แตะเอง (ยังไม่นับว่าเล่นแล้ว)
      btn.hidden = false; btn.disabled = false; btn.querySelector('span').textContent = P.mock ? 'Start Question' : 'Play Audio';
      status.textContent = 'แตะปุ่มเพื่อเริ่มเสียง';
      return;
    }
    if (P.mock) { ss.set(`eq_tq_played_${P.s.id}_${it.qid}`, '1'); btn.hidden = true; }
    else { btn.disabled = true; btn.querySelector('span').textContent = 'กำลังเล่น…'; }
    P.phase = 'playing'; P.played = true;
    if (!P.startAt) P.startAt = Date.now();
    eq.classList.add('is-on');
    status.textContent = 'Listening…';
    enableAnswers();          // เลือกคำตอบระหว่างฟังได้
    a.ontimeupdate = () => {
      const seg = it.audio.segments.find((sg) => a.currentTime >= sg.start && a.currentTime <= sg.end + 0.3);
      now.textContent = seg ? `(${seg.letter})` : '';
      if (P.feedback) highlightLine(seg ? seg.letter : null);
    };
    a.onended = () => {
      eq.classList.remove('is-on'); now.textContent = ''; highlightLine(null);
      if (!P) return;
      P.phase = 'ended';
      if (P.mock) {
        status.textContent = P.selected ? 'บันทึกคำตอบแล้ว' : 'Select your answer';
        if (P.selected) nextMock();
      } else {
        btn.disabled = false; btn.querySelector('span').textContent = 'Replay';
        btn.innerHTML = `${ICON('rotate-ccw', 'icon icon-sm')} <span>Replay</span>`;
        status.textContent = P.feedback ? '' : 'Select your answer';
      }
    };
  }
  function highlightLine(letter) {
    document.querySelectorAll('.tq-line').forEach((li) => li.classList.toggle('is-now', li.dataset.letter === letter));
  }

  async function choose(letter) {
    if (!P || P.selected || P.phase === 'loading' || P.phase === 'error' || !P.played && !P.alreadyPlayed) return;
    const it = P.s.items[P.i];
    P.selected = letter;
    const btns = document.querySelectorAll('[data-tq-ans]');
    btns.forEach((b) => { b.disabled = true; const on = b.dataset.tqAns === letter; b.classList.toggle('is-chosen', on); b.setAttribute('aria-pressed', String(on)); });
    const responseMs = P.startAt ? Date.now() - P.startAt : null;
    try {
      const r = await api(`/p1/sessions/${P.s.id}/answer`, { method: 'POST', body: { qid: it.qid, selected: letter, responseMs } });
      P.answered = r.answered;
      if (P.mock) {
        document.getElementById('tq-status').textContent = P.phase === 'ended' ? 'บันทึกคำตอบแล้ว' : 'บันทึกคำตอบแล้ว · ฟังให้จบก่อนไปข้อถัดไป';
        if (P.phase === 'ended') nextMock();
      } else {
        P.feedback = r.feedback;
        showFeedback(r);
      }
    } catch (err) {
      // ส่งไม่สำเร็จ (เน็ต) — ปลดล็อกให้ส่งใหม่ ไม่นับเป็นคำตอบ
      P.selected = null;
      btns.forEach((b) => { b.disabled = false; b.classList.remove('is-chosen'); b.setAttribute('aria-pressed', 'false'); });
      if (err && /ตอบข้อนี้ไปแล้ว/.test(err.message || '')) { P.selected = letter; return; }
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }

  function nextMock() {
    if (P.nextTimer) return;
    P.nextTimer = setTimeout(() => {
      P.nextTimer = null;
      if (P.i + 1 >= P.s.total) { finish(); return; }
      P.i += 1; P.autoNext = true; renderQuestion();
    }, reduced() ? 300 : 900);
  }

  /* ---------- Feedback (Practice หลังตอบ) ---------- */
  function feedbackHtml(fb, opts = {}) {
    const lines = fb.statements.map((s) => `<li class="tq-line ${s.isCorrect ? 'is-correct' : ''} ${fb.selected === s.letter && !s.isCorrect ? 'is-wrong' : ''}" data-letter="${s.letter}">
        <span class="tq-line-l">${s.letter}</span>
        <div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(s.text)}</p><p class="tq-line-th">${esc(s.translationTH)}</p>
          <p class="tq-line-why"><span class="tq-tag ${s.isCorrect ? 'ok' : 'bad'}">${esc(s.distractorTH)}</span> ${esc(s.explanationTH)}</p></div></li>`).join('');
    const vocab = (fb.vocabulary || []).map((v) => `<li class="tq-vocab">
        <div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span><span class="tq-ipa">${esc(v.ipa)}</span>
          <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div>
        <p class="tq-vocab-th">${esc(v.th)}</p><p class="tq-vocab-ex" lang="en">${esc(v.example)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-tq-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : '<p class="tq-vocab-note">คำนี้ยังไม่อยู่ในคลังคำศัพท์หลัก</p>'}</li>`).join('');
    const ph = fb.photo || {};
    return `
      <div class="tq-result ${fb.isCorrect ? 'ok' : 'bad'}" ${opts.live ? 'role="status"' : ''}>
        ${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon')}
        <div><b>${fb.isCorrect ? 'ถูกต้อง!' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b> <span>Correct Answer: <b>${fb.correctOption}</b>${fb.selected && !fb.isCorrect ? ` · คุณเลือก ${fb.selected}` : ''}</span>
        <small>สำเนียง: ${esc(fb.speaker.label || '')} · ระดับ ${esc(fb.difficulty)}</small></div>
        ${opts.exp ? `<span class="tq-exp">+${opts.exp} EXP</span>` : ''}
      </div>
      <section class="tq-fb-sec"><h3>${ICON('message-square-text', 'icon icon-sm')} Transcript · คำแปล · วิเคราะห์ตัวเลือก</h3><ol class="tq-lines">${lines}</ol></section>
      <section class="tq-fb-sec"><h3>${ICON('lightbulb', 'icon icon-sm')} Why ${fb.correctOption}?</h3><p>${esc(fb.why)}</p>
        <p class="tq-skilltags">${fb.skills.map((s) => `<span class="tq-chip">${esc(s.th)}</span>`).join(' ')}</p></section>
      <section class="tq-fb-sec"><h3>${ICON('eye', 'icon icon-sm')} Photo Analysis</h3>
        <dl class="tq-photo-an"><dt>บุคคล</dt><dd>${esc(ph.people)}</dd><dt>สิ่งของ</dt><dd>${esc(ph.objects)}</dd><dt>การกระทำ</dt><dd>${esc(ph.actions)}</dd>
          <dt>ตำแหน่ง</dt><dd>${esc(ph.positions)}</dd><dt>ฉาก</dt><dd>${esc(ph.scene)}</dd></dl>
        ${opts.clueToggle ? `<button class="btn btn-secondary tq-clue-btn" type="button" data-tq-clues aria-pressed="false">${ICON('map-pin', 'icon icon-sm')} แสดงจุดสำคัญบนภาพ</button>` : ''}</section>
      <section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>
      <section class="tq-fb-sec tq-tip"><h3>${ICON('headphones', 'icon icon-sm')} Listening Tip</h3><p>${esc(fb.tip)}</p></section>`;
  }
  function cluesHtml(fb) {
    return (fb.clues || []).map((c) => `<span class="tq-clue tq-clue-${esc(c.kind)}" style="left:${c.box[0]}%;top:${c.box[1]}%;width:${c.box[2]}%;height:${c.box[3]}%"><em>${esc(c.label)}</em></span>`).join('');
  }

  function showFeedback(r) {
    const fb = r.feedback;
    document.querySelectorAll('[data-tq-ans]').forEach((b) => {
      const l = b.dataset.tqAns;
      b.classList.toggle('is-right', l === fb.correctOption);
      b.classList.toggle('is-wrongpick', l === fb.selected && !fb.isCorrect);
    });
    if (window.EQAudio) window.EQAudio.sfx(fb.isCorrect ? 'correct' : 'wrong');
    // หลังตอบแล้วเท่านั้น: alt เต็ม + จุดสำคัญบนภาพ
    const img = document.getElementById('tq-img'); if (img) img.alt = fb.imageAlt;
    const clues = document.getElementById('tq-clues'); if (clues) clues.innerHTML = cluesHtml(fb);
    const last = P.i + 1 >= P.s.total;
    document.getElementById('tq-after').innerHTML = `${feedbackHtml(fb, { live: true, exp: r.exp, clueToggle: true })}
      <div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-tq-next>${last ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `ข้อถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
    if (r.exp && window.EQLesson) window.EQLesson.expReward(r, document.querySelector('.tq-result'));
    document.getElementById('tq-status').textContent = '';
    requestAnimationFrame(() => document.querySelector('.tq-result').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }));
  }

  async function finish() {
    const el = root('screen-toeic-play');
    stopAudio();
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/p1/sessions/${P.s.id}/finish`, { method: 'POST', body: {} });
      const s = P.s;
      App().setLeaveGuard(null);
      P = null;
      showResult(r.result, s, r);
    } catch (err) { errorBox(el, err, finish); }
  }

  /* ---------- ผลลัพธ์ ---------- */
  function showResult(res, s, award = {}) {
    App().setLeaveGuard(null);
    App().showScreen('screen-toeic-play'); setHash('toeic-p1-play', s.id);
    const el = root('screen-toeic-play');
    const mock = res.mode === 'mock';
    const wrong = res.review.filter((x) => !x.isCorrect);
    const rows = res.skills.map((g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span>
        <span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`).join('');
    el.innerHTML = `
      <div class="tq-resultpage">
        <header class="tq-res-hero">
          <p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} TOEIC Listening Practice · Part 1</p>
          <h1 class="page-title" id="tq-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}
        </header>
        <div class="tq-stats">
          <div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div>
          <div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div>
          <div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          <div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>Avg. Response Time</span></div>
        </div>
        ${res.strongest || res.weakest ? `<p class="tq-sw">${res.strongest ? `${ICON('star', 'icon icon-sm')} Strongest: <b>${esc(res.strongest.th)}</b> (${res.strongest.accuracy}%)` : ''}
          ${res.weakest && res.weakest.group !== (res.strongest && res.strongest.group) ? ` · ${ICON('target', 'icon icon-sm')} Weakest: <b>${esc(res.weakest.th)}</b> (${res.weakest.accuracy}%)` : ''}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Listening Skill Breakdown</h2><ul class="tq-skills">${rows}</ul></section>
        <div class="gl-actions">
          <button class="btn btn-secondary" type="button" data-tq-nav="toeic-p1">${ICON('arrow-left', 'icon icon-sm')} Part 1</button>
          <button class="btn btn-primary" type="button" data-tq-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>
        </div>
        <section class="tq-review" aria-labelledby="tq-rv-title">
          <div class="tq-rv-head"><h2 class="tq-h2" id="tq-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2>
            ${wrong.length ? `<label class="tq-only-wrong"><input type="checkbox" id="tq-only-wrong"> Review Mistakes (${wrong.length})</label>` : ''}</div>
          <ol class="tq-rv-list">${res.review.map((fb) => reviewItem(fb)).join('')}</ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p>
      </div>`;
    focusTitle('tq-res-title');
    if (award.levelInfo && window.EQLesson) window.EQLesson.expReward(award, el.querySelector('.tq-score'));
  }

  function reviewItem(fb) {
    return `<li class="tq-rv ${fb.isCorrect ? 'ok' : 'bad'}" data-ok="${fb.isCorrect ? 1 : 0}">
      <details>
        <summary><span class="tq-rv-n">${fb.n ? `Q${fb.n}` : ''}</span><img src="${esc(fb.image.small)}" alt="" loading="lazy" width="96" height="64">
          <span class="tq-rv-sum">${fb.isCorrect ? `${ICON('circle-check', 'icon icon-sm')} ถูก` : `${ICON('circle-x', 'icon icon-sm')} ${fb.selected ? `เลือก ${fb.selected}` : 'ไม่ได้ตอบ'}`} · คำตอบ ${fb.correctOption}
          ${fb.distractorSelectedTH ? `<small>${esc(fb.distractorSelectedTH)}</small>` : ''}</span></summary>
        <div class="tq-rv-body">
          <div class="tq-photo-frame tq-rv-photo" style="aspect-ratio:3/2"><img src="${esc(fb.image.url)}" alt="${esc(fb.imageAlt)}" loading="lazy">
            <div class="tq-clues">${cluesHtml(fb)}</div></div>
          ${fb.audio ? `<button class="btn btn-secondary tq-rv-play" type="button" data-tq-rvplay="${esc(fb.audio.url)}">${ICON('play', 'icon icon-sm')} ฟังเสียงอีกครั้ง</button>` : ''}
          ${feedbackHtml(fb)}
        </div>
      </details></li>`;
  }

  /* =====================================================================
     REVIEW MISTAKES (Error Notebook)
     ===================================================================== */
  async function openReview() {
    App().showScreen('screen-toeic'); setHash('toeic-p1-review');
    const el = root('screen-toeic');
    loading(el);
    try {
      const { items } = await api('/p1/mistakes');
      el.innerHTML = `${back('toeic-p1', 'Part 1')}
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Error Notebook</p>
          <h1 class="page-title" id="tq-rvm-title">Review Mistakes</h1>
          <p class="gl-sub">ข้อที่ครั้งล่าสุดยังตอบผิด · ดูภาพ ฟังซ้ำ อ่าน Transcript คำแปล และวิเคราะห์ว่าพลาดเพราะกับดักแบบไหน</p></header>
        ${items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-tq-act="custom">${ICON('target', 'icon icon-sm')} ฝึกข้อที่ผิด (Custom Review)</button></div>
          <ol class="tq-rv-list">${items.map((fb) => reviewItem(fb)).join('')}</ol>`
          : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ไม่มีข้อที่ค้างผิด — เยี่ยมมาก!</p></div>`}`;
      focusTitle('tq-rvm-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* =====================================================================
     ESSENTIAL VOCABULARY
     ===================================================================== */
  async function openVocab() {
    App().showScreen('screen-toeic'); setHash('toeic-p1-vocab');
    const el = root('screen-toeic');
    loading(el);
    try {
      const v = await api('/p1/vocab');
      el.innerHTML = `${back('toeic-p1', 'Part 1')}
        <header class="tq-hero"><p class="gl-kicker">${ICON('book', 'icon icon-sm')} toeicListeningPart1</p>
          <h1 class="page-title" id="tq-voc-title">Part 1 Essential Vocabulary</h1>
          <p class="gl-sub">${v.total} คำที่พบในโจทย์ Part 1 · คำที่อยู่ในคลังคำศัพท์หลักเพิ่มเข้ารายการทบทวน (SRS) ได้ทันที</p></header>
        <nav class="tq-voc-nav" aria-label="หมวดคำศัพท์">${v.groups.map((g) => `<a href="#tq-g-${g.id}" class="tq-chip" data-tq-jump="tq-g-${g.id}">${esc(g.th)}</a>`).join('')}</nav>
        ${v.groups.map((g) => `<section class="tq-voc-group" id="tq-g-${g.id}" aria-labelledby="tq-gh-${g.id}"><h2 class="tq-h2" id="tq-gh-${g.id}">${esc(g.th)} <small>${g.words.length}</small></h2>
          <ul class="tq-vocabs">${g.words.map((w) => `<li class="tq-vocab">
            <div class="tq-vocab-head"><b lang="en">${esc(w.word)}</b><span class="tq-pos">${esc(w.pos)}</span><span class="tq-ipa">${esc(w.ipa)}</span>
              <button class="tq-icon-btn" type="button" data-tq-say="${esc(w.word)}" aria-label="ฟังเสียงคำ ${esc(w.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div>
            <p class="tq-vocab-th">${esc(w.th)}</p><p class="tq-vocab-ex" lang="en">${esc(w.example)}</p>
            ${w.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(w.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
              ${w.inReview ? `<span class="tq-inreview">${ICON('check', 'icon icon-sm')} อยู่ในรายการทบทวน</span>` : `<button class="mini-btn" type="button" data-tq-srs="${esc(w.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button>`}</div>` : ''}
            </li>`).join('')}</ul></section>`).join('')}`;
      focusTitle('tq-voc-title');
    } catch (err) { errorBox(el, err, openVocab); }
  }

  /* =====================================================================
     ขยายภาพ (Practice เท่านั้น) — pinch-zoom ได้ + ปุ่มซูม
     ===================================================================== */
  function expandImage() {
    if (!P || P.mock) return;
    const it = P.s.items[P.i];
    const ov = document.createElement('div');
    ov.className = 'modal-overlay tq-zoom-ov';
    let z = 1;
    ov.innerHTML = `<div class="tq-zoom" role="document"><div class="tq-zoom-scroll"><img src="${esc(it.image.url)}" alt="${esc(P.feedback ? P.feedback.imageAlt : `ภาพประกอบข้อที่ ${P.i + 1}`)}" style="width:100%"></div>
      <div class="tq-zoom-tools"><button class="mini-btn" type="button" data-z="-1" aria-label="ซูมออก">−</button><button class="mini-btn" type="button" data-z="1" aria-label="ซูมเข้า">+</button>
      <button class="mini-btn" type="button" data-close>${ICON('x', 'icon icon-sm')} ปิด</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ภาพขยาย', variant: 'center' });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (b) { z = Math.max(1, Math.min(3, z + Number(b.dataset.z) * 0.5)); ov.querySelector('img').style.width = `${z * 100}%`; return; }
      if (e.target.closest('[data-close]')) ov.remove();
    });
  }

  /* =====================================================================
     Events
     ===================================================================== */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const nav = t.closest('[data-tq-nav]');
    if (nav) { e.preventDefault(); App().navigateTo(nav.dataset.tqNav); return; }
    const act = t.closest('[data-tq-act]');
    if (act) {
      const a = act.dataset.tqAct;
      if (a === 'practice') practiceSetup('bank');
      else if (a === 'custom') practiceSetup('mistakes');
      else if (a === 'mock') audioCheck('mock', () => mockIntro());
      return;
    }
    const res = t.closest('[data-tq-resume]');
    if (res) { unlockAudio(); openPlay(res.dataset.tqResume); return; }
    const rg = t.closest('[data-tq-range]');
    if (rg) { range = rg.dataset.tqRange; ls.set('eq_tq_range', range); openPart1(); return; }
    if (t.closest('[data-tq-play]')) { if (P && P.mock) unlockAudio(); playAudio(); return; }
    const ans = t.closest('[data-tq-ans]');
    if (ans) { choose(ans.dataset.tqAns); return; }
    if (t.closest('[data-tq-next]')) { stopAudio(); if (P.i + 1 >= P.s.total) finish(); else { P.i += 1; P.autoNext = false; renderQuestion(); } return; }
    if (t.closest('[data-tq-retry]')) { renderQuestion(); return; }
    if (t.closest('[data-tq-expand]')) { expandImage(); return; }
    if (t.closest('[data-tq-exit]')) { App().navigateTo('toeic-p1'); return; }
    const rate = t.closest('[data-tq-rate]');
    if (rate) {
      ls.set('eq_tq_rate', rate.dataset.tqRate);
      rate.parentElement.querySelectorAll('[data-tq-rate]').forEach((b) => { const on = b === rate; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
      if (player) player.playbackRate = Number(rate.dataset.tqRate);
      return;
    }
    const cl = t.closest('[data-tq-clues]');
    if (cl) {
      const box = document.getElementById('tq-clues');
      const on = box.hidden; box.hidden = !on; cl.setAttribute('aria-pressed', String(on));
      cl.lastChild.textContent = on ? ' ซ่อนจุดสำคัญ' : ' แสดงจุดสำคัญบนภาพ';
      if (on) document.getElementById('tq-photo').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      return;
    }
    const say = t.closest('[data-tq-say]');
    if (say) { if (App().speak) App().speak(say.dataset.tqSay); return; }
    const learn = t.closest('[data-tq-learn]');
    if (learn) { if (App().openVocabCard) App().openVocabCard(learn.dataset.tqLearn); return; }
    const srs = t.closest('[data-tq-srs]');
    if (srs) {
      srs.disabled = true;
      try {
        const r = await api('/p1/vocab/review', { method: 'POST', body: { wordId: srs.dataset.tqSrs } });
        srs.outerHTML = `<span class="tq-inreview">${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มเข้ารายการทบทวนแล้ว' : 'อยู่ในรายการทบทวนแล้ว'}</span>`;
      } catch (err) { srs.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    const rvp = t.closest('[data-tq-rvplay]');
    if (rvp) {
      const a = audioEl(); stopAudio();
      try { a.src = await loadAudio(rvp.dataset.tqRvplay); a.playbackRate = 1; await a.play(); } catch (_) { App().toast('ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่', 'error'); }
      return;
    }
    const jump = t.closest('[data-tq-jump]');
    if (jump) { e.preventDefault(); const g = document.getElementById(jump.dataset.tqJump); if (g) g.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'tq-only-wrong') return;
    document.querySelectorAll('.tq-rv').forEach((li) => { li.hidden = e.target.checked && li.dataset.ok === '1'; });
  });
  // คีย์บอร์ด: 1–4 หรือ A–D เลือกคำตอบ · Space เล่นเสียง (Practice)
  document.addEventListener('keydown', (e) => {
    if (!P || !document.getElementById('tq-qno') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, .modal-overlay')) return;
    const k = e.key.toUpperCase();
    const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? ['1', '2', '3', '4'].indexOf(k) : LETTERS.indexOf(k);
    if (idx >= 0 && k.length === 1) { const b = document.querySelector(`[data-tq-ans="${LETTERS[idx]}"]`); if (b && !b.disabled) { e.preventDefault(); choose(LETTERS[idx]); } }
  });

  function mockIntro() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card tq-check" role="document">
      <div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
      <h2 class="vb-sheet-title">TOEIC Part 1 — Mock Test</h2>
      <ul class="tq-rules"><li>6 ข้อ · แต่ละข้อมีภาพ 1 ภาพ และเสียงประโยค (A)–(D)</li><li>เสียงเล่นได้ <b>ครั้งเดียว</b> · ไม่มี transcript คำแปล หรือคำใบ้</li>
        <li>เลือกคำตอบได้ระหว่างฟัง · ข้อถัดไปเริ่มเมื่อเสียงจบและเลือกคำตอบแล้ว</li><li>ถ้าเน็ตหลุด ระบบหยุดรอ ไม่หักคะแนน</li></ul>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
        <button class="btn btn-primary" type="button" data-go>${ICON('headphones', 'icon icon-sm')} Start Listening Test</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'Mock Test', variant: 'center' });
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) ov.remove();
      if (e.target.closest('[data-go]')) { unlockAudio(); ov.remove(); start('mock'); }
    });
  }

  /** เราเตอร์ของโมดูล (เรียกจาก app.js navigateTo) */
  function open(view, param) {
    if (view !== 'play') { stopAudio(); if (P && !P.mock) { App().setLeaveGuard(null); P = null; } }
    switch (view) {
      case 'p1': return openPart1();
      case 'play': return param ? openPlay(param) : openPart1();
      case 'review': return openReview();
      case 'vocab': return openVocab();
      default: return openHub();
    }
  }

  window.EQToeic = { open, openHub, openPart1, _audio: () => player /* ชุดทดสอบ E2E: ข้ามไปท้ายเสียง */ };
})();
