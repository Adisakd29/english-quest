/* =====================================================================
   TOEIC-style Listening Part 2 — window.EQToeic2  (Question–Response)
   หน้าจอ:
     p2      #/toeic-p2           Landing · Practice / Mock · Listening Analytics
     play    #/toeic-p2-play/ID   ฟังคำถาม + คำตอบ (A)(B)(C) แล้วเลือก — ไม่มีตัวหนังสือระหว่างฟัง
     review  #/toeic-p2-review    Error Notebook
   เสียง: โหลดเต็มไฟล์ก่อนเล่น (fetch → blob) · โหลดไม่ได้ = หยุดรอ ไม่นับผิด
   Mock: 25 ข้อ เล่นต่อเนื่อง · เสียงเล่นครั้งเดียว · หลังเสียงจบมีเวลา 5 วินาที แล้วไปข้อถัดไปเอง (ไม่ตอบ = ผิด)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic/p2${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C'];
  const root = (id) => document.getElementById(`${id}-root`);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* - */ } } };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* - */ } } };
  let meta = null;
  const getMeta = async () => meta || (meta = await api('/meta'));
  function setHash(path, param) { const t = `#/${path}${param ? `/${param}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} วิ` : '—');

  /* ---------- เสียง ---------- */
  const blobs = new Map();
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
  let player = null;
  function audioEl() {
    if (!player) { player = new Audio(); player.preload = 'auto'; const v = Number(ls.get('eq_tq_vol')); player.volume = Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1; }
    return player;
  }
  function stopAudio() { if (player) { player.pause(); player.onended = null; player.ontimeupdate = null; } }
  function unlockAudio() { const a = audioEl(); try { a.muted = true; const p = a.play(); if (p && p.catch) p.catch(() => {}); a.pause(); a.muted = false; } catch (_) { a.muted = false; } }

  function audioCheck(next) {
    if (ss.get('eq_tq_checked') === '1') { unlockAudio(); next(); return; }
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('headphones', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">Audio Check</h2><p class="gl-sub">แนะนำให้ใช้หูฟัง · กดเล่นเสียงทดสอบแล้วปรับระดับเสียงให้ได้ยินชัด</p>
        <button class="btn btn-secondary tq-check-play" type="button" data-play>${ICON('play', 'icon icon-sm')} Play Test Sound</button>
        <p class="tq-check-err" role="alert" hidden></p>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-ok>${ICON('check', 'icon icon-sm')} ได้ยินชัดเจน</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Audio Check', variant: 'center', onClose: stopAudio });
      ov.addEventListener('click', async (e) => {
        if (e.target.closest('[data-play]')) {
          try { const a = audioEl(); stopAudio(); a.src = await loadAudio(m.audioCheckUrl); a.playbackRate = 1; await a.play(); } catch (_) { const er = ov.querySelector('.tq-check-err'); er.hidden = false; er.textContent = 'ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่'; }
          return;
        }
        if (e.target.closest('[data-close]')) { stopAudio(); ov.remove(); return; }
        if (e.target.closest('[data-ok]')) { stopAudio(); ss.set('eq_tq_checked', '1'); ov.remove(); next(); }
      });
    });
  }

  /* =====================================================================
     LANDING
     ===================================================================== */
  let range = ls.get('eq_t2_range') || 'all';
  async function openLanding() {
    stopAll();
    setHash('toeic-p2'); App().showScreen('screen-toeic2');
    const el = root('screen-toeic2');
    loading(el);
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/summary?range=${range}`)]);
      const resume = s.activeSessions.filter((a) => a.mode === 'practice').map((a) => `<button class="tq-resume" type="button" data-t2-resume="${a.id}">${ICON('play', 'icon icon-sm')} ทำชุดฝึกต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (label, g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g ? g.accuracy : 0}%"></span></span><b>${g ? `${g.accuracy}%` : '—'}</b><small>${g ? `${g.total} ข้อ` : 'ยังไม่มีข้อมูล'}</small></li>`;
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t2-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <header class="tq-hero">
          <p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} Listening · Part 2</p>
          <h1 class="page-title" id="t2-title">Question–Response</h1>
          <p class="gl-sub">ฟังคำถามหรือข้อความ 1 ประโยค แล้วเลือกคำตอบที่เหมาะสมที่สุดจาก (A) (B) (C) — ไม่มีตัวหนังสือให้อ่าน · ${s.bankSize} ข้อ เสียงอเมริกัน/อังกฤษ</p>
        </header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-t2-act="practice">${ICON('graduation-cap', 'icon')}<b>Practice</b><small>ฟังซ้ำได้ · 0.9x/1.0x · หลังตอบเห็นบทพูด คำแปล และกับดักของแต่ละตัวเลือก</small></button>
          <button class="tq-mode" type="button" data-t2-act="mock">${ICON('timer', 'icon')}<b>Mock Test</b><small>${m.mockSize} ข้อต่อเนื่องแบบข้อสอบจริง · เสียงเล่นครั้งเดียว · มีเวลาเลือก ${m.answerGapSec} วินาทีหลังเสียงจบ</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.practiced}<small>/${s.bankSize}</small></b><span>Questions Practiced</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestMock ? `${s.bestMock.percent}%` : '—'}</b><span>Best Mock Score</span></div>
          <div class="tq-stat" role="listitem"><b class="tq-stat-text">${s.weakSkill ? esc(s.weakSkill.th) : '—'}</b><span>Weak Skill</span></div>
        </div>
        <div class="tq-links"><button class="tq-link" type="button" data-t2-nav="toeic-p2-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
          <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ข้อที่ยังตอบผิด · ฟังซ้ำพร้อมบทพูด` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button></div>
        <section class="gl-card tq-analytics" aria-labelledby="t2-an-title">
          <div class="tq-an-head"><h2 class="tq-h2" id="t2-an-title">${ICON('chart-column', 'icon icon-sm')} วิเคราะห์ผล Listening</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-t2-range="${v}">${t}</button>`).join('')}</div></div>
          ${s.answered ? `<p class="tq-an-sum">Part 2 Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ${s.bestPractice ? ` · Practice สูงสุด ${s.bestPractice.percent}%` : ''}</p>
            <ul class="tq-skills">${s.skills.map((g) => bar(g.th, g)).join('')}</ul>
            <p class="tq-an-sub">ผู้ตอบสำเนียง: อเมริกัน ${s.accents.us ? `${s.accents.us.accuracy}%` : '—'} · อังกฤษ ${s.accents.uk ? `${s.accents.uk.accuracy}%` : '—'}</p>
            ${s.traps.length ? `<p class="tq-an-sub">กับดักที่พลาดบ่อย: ${s.traps.map((t) => `<span class="tq-chip">${esc(t.th)} ×${t.n}</span>`).join(' ')}</p>` : ''}`
            : '<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test</p>'}
        </section>
        <section class="gl-card t5-howto" aria-labelledby="t2-how-title">
          <h2 class="tq-h2" id="t2-how-title">${ICON('lightbulb', 'icon icon-sm')} วิธีทำ Part 2</h2>
          <ol><li>ฟัง <b>คำแรก</b> ของคำถามให้แม่น (Who / When / Where / Why / How …) — ตัดคำตอบที่ตอบคนละเรื่องได้ทันที</li>
            <li>คำถาม Wh- ตอบด้วย Yes/No ไม่ได้</li>
            <li>ระวังคำตอบที่ "ซ้ำคำ" หรือ "เสียงคล้าย" คำในคำถาม — มักเป็นกับดัก</li>
            <li>คำตอบที่ถูกมักอ้อม เช่น "I haven't checked yet." / "Ask Ms. Lee." — ถามตัวเองว่าเป็นการตอบสนองที่สมเหตุสมผลหรือไม่</li></ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;
      focusTitle('t2-title');
    } catch (err) { errorBox(el, err, openLanding); }
  }

  function practiceSetup(source = 'bank') {
    getMeta().then((m) => {
      const saved = (() => { try { return JSON.parse(ls.get('eq_t2_cfg') || '{}'); } catch (_) { return {}; } })();
      const cfg = { size: 10, difficulty: 'mixed', focus: 'mixed', ...saved };
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
      ov.innerHTML = `<div class="modal-card tq-setup" role="document">
        <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกข้อที่เคยผิด' : 'ตั้งค่า Part 2 Practice'}</h2>
        ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกข้อที่ครั้งล่าสุดยังตอบผิด · ลำดับคำตอบในเสียงอาจต่างจากเดิม</p>' : `
          <label class="tq-setup-label" for="t2-focus">ประเภทคำถาม</label>
          <select id="t2-focus" class="tq-select">${m.focuses.map((f) => `<option value="${f}" ${f === cfg.focus ? 'selected' : ''}>${esc(f === 'mixed' ? 'ผสมทุกแบบ' : m.categoryTh[f])}</option>`).join('')}</select>
          <p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], cfg.difficulty)}`}
        <p class="tq-setup-label">จำนวนข้อ</p>${seg('size', m.sizes.map((n) => [n, `${n} ข้อ`]), cfg.size)}
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button><button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'ตั้งค่าการฝึก Part 2', variant: 'sheet' });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cfg]');
        if (b) { cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v; b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); }); return; }
        if (e.target.closest('[data-close]')) { ov.remove(); return; }
        if (e.target.closest('[data-go]')) {
          const f = ov.querySelector('#t2-focus'); if (f) cfg.focus = f.value;
          if (source !== 'mistakes') ls.set('eq_t2_cfg', JSON.stringify(cfg));
          ov.remove(); audioCheck(() => start('practice', { ...cfg, source }));
        }
      });
    }).catch((err) => App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'));
  }
  function mockIntro() {
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">TOEIC Part 2 — Mock Test</h2>
        <ul class="tq-rules"><li>${m.mockSize} ข้อต่อเนื่อง · แต่ละข้อฟังคำถาม 1 ประโยค และคำตอบ (A)–(C)</li>
          <li>เสียงเล่น <b>ครั้งเดียว</b> · ไม่มีบทพูดหรือคำใบ้ · เลือกคำตอบได้ระหว่างฟัง</li>
          <li>หลังเสียงจบมีเวลา ${m.answerGapSec} วินาที แล้วไปข้อถัดไปเอง · ไม่ตอบ = ผิด · ออกกลางคันแล้วกลับมาทำต่อจะเริ่มที่ข้อถัดไป</li></ul>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button><button class="btn btn-primary" type="button" data-go>${ICON('headphones', 'icon icon-sm')} Start Listening Test</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Mock Test Part 2', variant: 'center' });
      ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); audioCheck(() => { unlockAudio(); start('mock'); }); } });
    });
  }
  async function start(mode, cfg = {}) {
    try { const s = await api('/sessions', { method: 'POST', body: { mode, ...cfg, ...(mode === 'mock' && window.EQToeicFull ? window.EQToeicFull.ctx(2) : {}) } }); openPlay(s.id, s); } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER
     ===================================================================== */
  let P = null;
  let gapTimer = null;
  function stopAll() { stopAudio(); if (gapTimer) { clearInterval(gapTimer); gapTimer = null; } }

  async function openPlay(sid, preload) {
    stopAll();
    setHash('toeic-p2-play', sid); App().showScreen('screen-toeic2-play');
    const el = root('screen-toeic2-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openLanding(); return; }
      const mock = s.mode === 'mock';
      const first = mock ? Math.min(s.total, s.passed || 0) : s.items.findIndex((x) => !x.answered);
      P = { s, mock, i: first < 0 ? s.total : first, auto: false };
      App().setLeaveGuard((path) => {
        if (!P || path.startsWith('toeic-p2-play')) return false;
        if (P.mock && !confirm('ออกจาก Mock Test ตอนนี้? กลับมาทำต่อได้ แต่จะเริ่มที่ข้อถัดไป')) return true;
        if (P.mock) api(`/sessions/${P.s.id}/advance`, { method: 'POST', body: { passed: P.i + 1 } }).catch(() => {});
        stopAll(); App().setLeaveGuard(null); P = null; return false;
      });
      if (P.i >= s.total) { finish(); return; }
      renderQuestion();
    } catch (err) { errorBox(el, err, () => openPlay(sid)); }
  }

  function renderQuestion() {
    stopAll();
    const el = root('screen-toeic2-play');
    const { s } = P; const it = s.items[P.i];
    Object.assign(P, { phase: 'loading', played: false, selected: null, feedback: it.feedback || null, startAt: null });
    el.innerHTML = `
      <div class="tq-play t2-play ${P.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-t2-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Listening · Part 2: Question–Response</b><small>${P.mock ? 'Mock Test' : 'Practice'}</small></div>
          <span class="tq-qno" id="t2-qno">Question ${P.i + 1} / ${s.total}</span>
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${P.i}"><span style="width:${(P.i / s.total) * 100}%"></span></div>
        <section class="gl-card t2-stage">
          <p class="t2-instr">Listen to the question or statement and the three responses. Select the best response.</p>
          <div class="tq-audio" id="t2-audio">
            <div class="tq-audio-row">
              <button class="btn btn-primary tq-play-btn" type="button" data-t2-play disabled>${ICON('play', 'icon icon-sm')} <span>กำลังโหลดเสียง…</span></button>
              <div class="tq-eq" id="t2-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
              <span class="t2-now" id="t2-now" aria-hidden="true"></span>
              ${P.mock ? '' : `<span class="tq-audio-tools"><div class="vd-seg tq-speed" role="radiogroup" aria-label="ความเร็วเสียง">${['0.9', '1'].map((r) => `<button class="vd-seg-btn${(ls.get('eq_tq_rate') || '1') === r ? ' active' : ''}" type="button" role="radio" aria-checked="${(ls.get('eq_tq_rate') || '1') === r}" data-t2-rate="${r}">${r === '1' ? '1.0' : r}x</button>`).join('')}</div></span>`}
            </div>
            <p class="tq-status" id="t2-status" role="status" aria-live="polite"></p>
            ${P.mock ? '<div class="t2-gap" id="t2-gap" hidden><span></span></div>' : ''}
          </div>
          <p class="tq-choose" id="t2-choose">Mark your answer:</p>
          <div class="tq-answers t2-answers" role="group" aria-labelledby="t2-choose">
            ${LETTERS.map((l) => `<button class="tq-ans" type="button" data-t2-ans="${l}" disabled aria-pressed="false"><span>${l}</span></button>`).join('')}
          </div>
        </section>
        <div id="t2-after"></div>
      </div>`;
    focusTitle('t2-qno');
    prepare(it);
  }
  async function prepare(it) {
    const mine = P;
    const status = document.getElementById('t2-status');
    try {
      const url = await loadAudio(it.audio.url);
      if (P !== mine || !document.getElementById('t2-audio')) return;
      P.audioUrl = url; P.phase = 'ready';
      const btn = document.querySelector('[data-t2-play]');
      if (P.feedback) { showFeedback({ feedback: P.feedback }, true); btn.disabled = false; btn.querySelector('span').textContent = 'Replay'; P.played = true; }
      else if (P.mock && P.auto) playAudio();
      else { btn.disabled = false; btn.querySelector('span').textContent = P.mock ? 'Start Question' : 'Play Audio'; status.textContent = P.mock ? 'แตะ Start Question เพื่อเริ่มฟัง (เสียงเล่นได้ครั้งเดียว)' : 'แตะ Play Audio เพื่อฟังคำถามและคำตอบ (A)–(C)'; }
      const nx = P.s.items[P.i + 1]; if (nx) setTimeout(() => loadAudio(nx.audio.url).catch(() => {}), 400);
    } catch (err) {
      if (P !== mine) return;
      P.phase = 'error';
      document.getElementById('t2-audio').innerHTML = `<div class="tq-neterr" role="alert">${ICON('wifi-off', 'icon')}<p><b>ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่</b><br><small>${P.mock ? 'Mock Test หยุดไว้ชั่วคราว — ไม่หักคะแนนจากปัญหาการเชื่อมต่อ' : 'ไม่มีการนับว่าตอบผิด'}</small></p>
        <button class="btn btn-primary" type="button" data-t2-retry>${ICON('refresh-cw', 'icon icon-sm')} ลองใหม่</button></div>`;
    }
  }
  const enableAnswers = () => document.querySelectorAll('[data-t2-ans]').forEach((b) => { if (!P.feedback && !P.selected) b.disabled = false; });

  async function playAudio() {
    if (!P || !P.audioUrl) return;
    const it = P.s.items[P.i];
    const btn = document.querySelector('[data-t2-play]'); const status = document.getElementById('t2-status');
    const eq = document.getElementById('t2-eq'); const now = document.getElementById('t2-now');
    const a = audioEl(); stopAudio();
    a.src = P.audioUrl; a.playbackRate = P.mock ? 1 : Number(ls.get('eq_tq_rate') || 1);
    try { await a.play(); } catch (e) {
      btn.hidden = false; btn.disabled = false; btn.querySelector('span').textContent = P.mock ? 'Start Question' : 'Play Audio'; status.textContent = 'แตะปุ่มเพื่อเริ่มเสียง'; return;
    }
    const mine = P;
    if (P.mock) btn.hidden = true; else { btn.disabled = true; btn.querySelector('span').textContent = 'กำลังเล่น…'; }
    P.phase = 'playing'; P.played = true; if (!P.startAt) P.startAt = Date.now();
    eq.classList.add('is-on'); status.textContent = 'Listening…';
    enableAnswers();
    a.ontimeupdate = () => {
      const seg = it.audio.segments.find((sg) => a.currentTime >= sg.start && a.currentTime <= sg.end + 0.3);
      now.textContent = seg ? (seg.letter === 'Q' ? 'Question' : `(${seg.letter})`) : '';
      if (P && P.feedback) document.querySelectorAll('.t2-line').forEach((li) => li.classList.toggle('is-now', Boolean(seg) && li.dataset.letter === seg.letter));
    };
    a.onended = () => {
      eq.classList.remove('is-on'); now.textContent = '';
      document.querySelectorAll('.t2-line').forEach((li) => li.classList.remove('is-now'));
      if (P !== mine) return;
      P.phase = 'ended';
      if (P.mock) answerGap();
      else { btn.disabled = false; btn.innerHTML = `${ICON('rotate-ccw', 'icon icon-sm')} <span>Replay</span>`; status.textContent = P.feedback ? '' : 'Select your answer'; }
    };
  }
  /** Mock: เวลาเลือกคำตอบหลังเสียงจบ แล้วไปข้อถัดไป */
  function answerGap() {
    const gap = document.getElementById('t2-gap'); const status = document.getElementById('t2-status');
    const total = (P.s.config && P.s.config.answerGapSec) || 5;
    if (P.selected) { status.textContent = 'บันทึกคำตอบแล้ว'; setTimeout(() => nextMock(), reduced() ? 300 : 900); return; }
    let left = total; const mine = P;
    gap.hidden = false; gap.querySelector('span').textContent = `เลือกคำตอบ · ${left}`;
    gap.style.setProperty('--p', '100%');
    status.textContent = 'Select your answer';
    gapTimer = setInterval(() => {
      if (P !== mine) { clearInterval(gapTimer); gapTimer = null; return; }
      left -= 1;
      gap.querySelector('span').textContent = left > 0 ? `เลือกคำตอบ · ${left}` : 'ไปข้อถัดไป';
      gap.style.setProperty('--p', `${(left / total) * 100}%`);
      if (left <= 0 || P.selected) { clearInterval(gapTimer); gapTimer = null; nextMock(); }
    }, 1000);
  }
  function nextMock() {
    if (!P || P.leaving) return;
    P.leaving = true;
    const next = P.i + 1;
    api(`/sessions/${P.s.id}/advance`, { method: 'POST', body: { passed: next } }).catch(() => {});
    setTimeout(() => {
      if (!P) return;
      P.leaving = false;
      if (next >= P.s.total) { finish(); return; }
      P.i = next; P.auto = true; renderQuestion();
    }, 150);
  }

  async function choose(letter) {
    if (!P || P.selected || P.feedback || !P.played) return;
    const it = P.s.items[P.i];
    P.selected = letter;
    const btns = document.querySelectorAll('[data-t2-ans]');
    btns.forEach((b) => { b.disabled = true; const on = b.dataset.t2Ans === letter; b.classList.toggle('is-chosen', on); b.setAttribute('aria-pressed', String(on)); });
    try {
      const r = await api(`/sessions/${P.s.id}/answer`, { method: 'POST', body: { qid: it.qid, selected: letter, responseMs: P.startAt ? Date.now() - P.startAt : null } });
      if (!P) return;
      it.answered = true;
      if (P.mock) { document.getElementById('t2-status').textContent = P.phase === 'ended' ? 'บันทึกคำตอบแล้ว' : 'บันทึกคำตอบแล้ว · ฟังให้จบก่อนไปข้อถัดไป'; }
      else { it.feedback = r.feedback; P.feedback = r.feedback; showFeedback(r); if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp); }
    } catch (err) {
      if (!P) return;
      P.selected = null;
      btns.forEach((b) => { b.disabled = false; b.classList.remove('is-chosen'); b.setAttribute('aria-pressed', 'false'); });
      if (err && (err.code === 'ALREADY_ANSWERED' || err.code === 'PASSED')) { P.selected = letter; return; }
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }

  function feedbackHtml(fb, opts = {}) {
    const lines = [`<li class="tq-line t2-line t2-q" data-letter="Q"><span class="tq-line-l">${ICON('message-circle', 'icon icon-sm')}</span>
        <div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(fb.prompt)}</p><p class="tq-line-th">${esc(fb.promptTH)}</p>
        <p class="tq-line-why"><span class="tq-tag ok">${esc(fb.category.th)}${fb.category.wh ? ` · ${esc(fb.category.wh)}` : ''}</span> ผู้พูด: ${esc(fb.speakers.prompt)}</p></div></li>`]
      .concat(fb.responses.map((r) => `<li class="tq-line t2-line ${r.isCorrect ? 'is-correct' : ''} ${fb.selected === r.letter && !r.isCorrect ? 'is-wrong' : ''}" data-letter="${r.letter}">
        <span class="tq-line-l">${r.letter}</span><div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(r.text)}</p><p class="tq-line-th">${esc(r.translationTH)}</p>
        <p class="tq-line-why"><span class="tq-tag ${r.isCorrect ? 'ok' : 'bad'}">${esc(r.distractorTH)}</span> ${esc(r.explanationTH)}</p></div></li>`)).join('');
    const vocab = (fb.vocabulary || []).map((v) => `<li class="tq-vocab"><div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span>
        <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div><p class="tq-vocab-th">${esc(v.th)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-t2-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : ''}</li>`).join('');
    return `<div class="tq-result ${fb.isCorrect ? 'ok' : 'bad'}" ${opts.live ? 'role="status"' : ''}>${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon')}
        <div><b>${fb.isCorrect ? 'ถูกต้อง!' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b> <span>Correct Answer: <b>${fb.correctOption}</b>${fb.selected && !fb.isCorrect ? ` · คุณเลือก ${fb.selected}` : ''}</span>
        <small>ผู้ตอบ: ${esc(fb.speakers.response)} · ระดับ ${esc(fb.difficulty)}</small></div>${opts.exp ? `<span class="tq-exp">+${opts.exp} EXP</span>` : ''}</div>
      <section class="tq-fb-sec"><h3>${ICON('message-square-text', 'icon icon-sm')} Transcript · คำแปล · วิเคราะห์ตัวเลือก</h3><ol class="tq-lines">${lines}</ol></section>
      <section class="tq-fb-sec"><h3>${ICON('lightbulb', 'icon icon-sm')} Why ${fb.correctOption}?</h3><p>${esc(fb.why)}</p></section>
      ${vocab ? `<section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>` : ''}
      <section class="tq-fb-sec tq-tip"><h3>${ICON('headphones', 'icon icon-sm')} Listening Tip</h3><p>${esc(fb.tip)}</p></section>`;
  }
  function showFeedback(r, silent) {
    const fb = r.feedback;
    document.querySelectorAll('[data-t2-ans]').forEach((b) => {
      const l = b.dataset.t2Ans; b.disabled = true;
      b.classList.toggle('is-right', l === fb.correctOption); b.classList.toggle('is-wrongpick', l === fb.selected && !fb.isCorrect);
    });
    if (!silent && window.EQAudio) window.EQAudio.sfx(fb.isCorrect ? 'correct' : 'wrong');
    const last = P.i + 1 >= P.s.total;
    document.getElementById('t2-after').innerHTML = `${feedbackHtml(fb, { live: !silent, exp: r.exp })}
      <div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-t2-next>${last ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `ข้อถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
    document.getElementById('t2-status').textContent = '';
    if (!silent) requestAnimationFrame(() => { const x = document.querySelector('.tq-result'); if (x) x.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); });
  }

  async function finish() {
    if (!P || P.finishing) return;
    P.finishing = true; stopAll();
    const el = root('screen-toeic2-play');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/sessions/${P.s.id}/finish`, { method: 'POST', body: {} });
      const s = P.s; App().setLeaveGuard(null); P = null;
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      showResult(r.result, s, r);
    } catch (err) { P.finishing = false; errorBox(el, err, finish); }
  }
  function reviewItem(fb) {
    return `<li class="tq-rv ${fb.isCorrect ? 'ok' : 'bad'}" data-ok="${fb.isCorrect ? 1 : 0}"><details>
      <summary><span class="tq-rv-n">${fb.n ? `Q${fb.n}` : ''}</span><span class="tq-rv-sum t5-rv-sum"><span class="t5-rv-s" lang="en">${esc(fb.prompt)}</span>
        <small>${fb.isCorrect ? `${ICON('circle-check', 'icon icon-sm')} ถูก` : `${ICON('circle-x', 'icon icon-sm')} ${fb.selected ? `เลือก ${fb.selected}` : 'ไม่ได้ตอบ'}`} · คำตอบ ${fb.correctOption} · ${esc(fb.category.th)}
        ${fb.distractorSelectedTH ? ` · ${esc(fb.distractorSelectedTH)}` : ''}</small></span></summary>
      <div class="tq-rv-body"><button class="btn btn-secondary tq-rv-play" type="button" data-t2-rvplay="${esc(fb.audio.url)}">${ICON('play', 'icon icon-sm')} ฟังเสียงอีกครั้ง</button>${feedbackHtml(fb)}</div></details></li>`;
  }
  function showResult(res, s, award = {}) {
    stopAll(); App().setLeaveGuard(null);
    setHash('toeic-p2-play', s.id); App().showScreen('screen-toeic2-play');
    const el = root('screen-toeic2-play');
    const mock = res.mode === 'mock';
    const rows = res.skills.map((g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`).join('');
    el.innerHTML = `<div class="tq-resultpage">
        <header class="tq-res-hero"><p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} TOEIC Listening Practice · Part 2</p>
          <h1 class="page-title" id="t2-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}</header>
        <div class="tq-stats"><div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div><div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          ${mock ? `<div class="tq-stat"><b>${res.unanswered}</b><span>ไม่ได้ตอบ</span></div>` : `<div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div>`}
          <div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>Avg. Response Time</span></div></div>
        ${res.traps.length ? `<p class="tq-sw">${ICON('target', 'icon icon-sm')} กับดักที่พลาด: ${res.traps.map((t) => `<span class="tq-chip">${esc(t.th)} ×${t.n}</span>`).join(' ')}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Question Type Breakdown</h2><ul class="tq-skills">${rows}</ul></section>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-t2-nav="toeic-p2">${ICON('arrow-left', 'icon icon-sm')} Part 2</button>
          ${s.config && s.config.dailyTask && window.EQToeicDaily ? window.EQToeicDaily.resultButtons(2, s.config) : s.config && s.config.drill && window.EQToeicWeak ? window.EQToeicWeak.resultButtons(2, s.config) : s.config && s.config.fullTestId ? `<button class="btn btn-primary" type="button" data-tqf-back="${s.config.fullTestId}">${ICON('list-checks', 'icon icon-sm')} กลับไป Full Mock Test</button>` : `<button class="btn btn-primary" type="button" data-t2-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>`}</div>
        <section class="tq-review" aria-labelledby="t2-rv-title"><div class="tq-rv-head"><h2 class="tq-h2" id="t2-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2></div>
          <ol class="tq-rv-list">${res.review.map(reviewItem).join('')}</ol></section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p></div>`;
    focusTitle('t2-res-title');
  }
  async function openReview() {
    stopAll();
    setHash('toeic-p2-review'); App().showScreen('screen-toeic2');
    const el = root('screen-toeic2');
    loading(el);
    try {
      const d = await api('/mistakes');
      el.innerHTML = `<button class="game-exit gl-back" type="button" data-t2-nav="toeic-p2">${ICON('arrow-left', 'icon icon-sm')} Part 2</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Listening · Part 2</p><h1 class="page-title" id="t2-rev-title">Review Mistakes</h1>
          <p class="gl-sub">${d.items.length} ข้อที่ครั้งล่าสุดยังตอบผิด · ฟังซ้ำพร้อมบทพูดและคำแปล</p></header>
        ${d.items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-t2-act="custom">${ICON('play', 'icon icon-sm')} ฝึกข้อที่ผิดอีกครั้ง</button></div>
          <ol class="tq-rv-list">${d.items.map(reviewItem).join('')}</ol>` : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีข้อที่ตอบผิด</p></div>`}`;
      focusTitle('t2-rev-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-t2-nav]');
    if (b) { e.preventDefault(); App().navigateTo(b.dataset.t2Nav); return; }
    b = t.closest('[data-t2-act]');
    if (b) { const a = b.dataset.t2Act; if (a === 'practice') practiceSetup('bank'); else if (a === 'custom') practiceSetup('mistakes'); else if (a === 'mock') mockIntro(); return; }
    b = t.closest('[data-t2-resume]');
    if (b) { unlockAudio(); openPlay(b.dataset.t2Resume); return; }
    b = t.closest('[data-t2-range]');
    if (b) { range = b.dataset.t2Range; ls.set('eq_t2_range', range); openLanding(); return; }
    b = t.closest('[data-t2-rvplay]');
    if (b) { try { const a = audioEl(); stopAudio(); a.src = await loadAudio(b.dataset.t2Rvplay); a.playbackRate = 1; await a.play(); } catch (_) { App().toast('เล่นเสียงไม่สำเร็จ', 'error'); } return; }
    b = t.closest('[data-t2-srs]');
    if (b) {
      b.disabled = true;
      try { const r = await api('/vocab/review', { method: 'POST', body: { wordId: b.dataset.t2Srs } }); b.innerHTML = `${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มแล้ว' : 'อยู่ในรายการแล้ว'}`; } catch (err) { b.disabled = false; App().toast(err.message || 'เพิ่มไม่สำเร็จ', 'error'); }
      return;
    }
    if (!P) return;
    if (t.closest('[data-t2-play]')) { if (P.mock) unlockAudio(); playAudio(); return; }
    b = t.closest('[data-t2-ans]');
    if (b) { if (!b.disabled) choose(b.dataset.t2Ans); return; }
    if (t.closest('[data-t2-next]')) { stopAll(); if (P.i + 1 >= P.s.total) finish(); else { P.i += 1; P.auto = false; renderQuestion(); } return; }
    if (t.closest('[data-t2-retry]')) { renderQuestion(); return; }
    b = t.closest('[data-t2-rate]');
    if (b) { ls.set('eq_tq_rate', b.dataset.t2Rate); b.parentElement.querySelectorAll('[data-t2-rate]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); }); if (player) player.playbackRate = Number(b.dataset.t2Rate); return; }
    if (t.closest('[data-t2-exit]')) App().navigateTo('toeic-p2');
  });
  document.addEventListener('keydown', (e) => {
    if (!P || !document.querySelector('.t2-play') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, .modal-overlay')) return;
    const k = e.key.toUpperCase();
    let idx = ['1', '2', '3'].indexOf(k); if (idx < 0) idx = LETTERS.indexOf(k);
    if (idx >= 0 && k.length === 1) { const btn = document.querySelector(`[data-t2-ans="${LETTERS[idx]}"]`); if (btn && !btn.disabled) { e.preventDefault(); choose(LETTERS[idx]); } }
  });
  window.addEventListener('eq:screen', (e) => { if (!e.detail || e.detail.id !== 'screen-toeic2-play') stopAll(); });

  function open(view, param) {
    if (view !== 'play') { stopAll(); if (P && !P.mock) { App().setLeaveGuard(null); P = null; } }
    switch (view) {
      case 'play': return param ? openPlay(param) : openLanding();
      case 'review': return openReview();
      default: return openLanding();
    }
  }
  window.EQToeic2 = { open, mock: () => mockIntro(), drill: (_p, body) => audioCheck(() => start('practice', body)), _state: () => P, _audio: () => player };
})();
