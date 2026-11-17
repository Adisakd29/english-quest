/* =====================================================================
   TOEIC-style Reading Part 5 — window.EQToeic5  (Incomplete Sentences)
   หน้าจอ:
     p5      #/toeic-p5            Landing: Practice / Mock Test · สถิติ · Reading Analytics
     play    #/toeic-p5-play/ID    ทำข้อ (Practice: เฉลยทันที · Mock: 30 ข้อ จับเวลา 12 นาที เปลี่ยนคำตอบได้จนกว่าจะส่ง)
     review  #/toeic-p5-review     Error Notebook (ข้อที่ยังตอบผิด)
   ตรวจคำตอบ/เวลา/EXP ที่เซิร์ฟเวอร์ทั้งหมด (/api/toeic/p5/*) · ใช้ CSS กลางของ TOEIC (toeic.css) + toeic5.css
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic/p5${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C', 'D'];
  const BLANK = '-------';
  const root = (id) => document.getElementById(`${id}-root`);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} วิ` : '—');
  const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  /** ประโยคที่มีช่องว่าง → HTML (ช่องว่างเป็นกล่อง / เติมคำตอบเมื่อมี) */
  const sentenceHtml = (s, fill, cls = '') => esc(s).replace(BLANK, fill
    ? `<span class="t5-fill ${cls}">${esc(fill)}</span>` : '<span class="t5-blank" aria-label="ช่องว่าง">&nbsp;</span>');
  const FOCUS_TH = { mixed: 'ผสมทุกแบบ', grammar: 'ไวยากรณ์ทั้งหมด', vocabulary: 'คำศัพท์/Collocation' };
  const DIFF_TH = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  /* =====================================================================
     LANDING
     ===================================================================== */
  let range = ls.get('eq_t5_range') || 'all';
  async function openLanding() {
    stopTimer();
    setHash('toeic-p5'); App().showScreen('screen-toeic5');
    const el = root('screen-toeic5');
    loading(el);
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/summary?range=${range}`)]);
      const resume = s.activeSessions.map((a) => `<button class="tq-resume" type="button" data-t5-resume="${a.id}">
          ${ICON('play', 'icon icon-sm')} ทำ${a.mode === 'mock' ? ' Mock Test' : 'ชุดฝึก'}ต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (label, d) => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}</span>
          <span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${d ? d.accuracy : 0}%"></span></span>
          <b>${d ? `${d.accuracy}%` : '—'}</b><small>${d ? `${d.total} ข้อ` : 'ยังไม่มีข้อมูล'}</small></li>`;
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t5-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <header class="tq-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} Reading · Part 5</p>
          <h1 class="page-title" id="t5-title">Incomplete Sentences</h1>
          <p class="gl-sub">อ่านประโยคที่มีช่องว่าง แล้วเลือกคำที่เติมได้ถูกต้องที่สุด — ไวยากรณ์และคำศัพท์ในบริบทการทำงาน · ${s.bankSize} ข้อ</p>
        </header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-t5-act="practice">
            ${ICON('graduation-cap', 'icon')}<b>Practice</b><small>ตอบแล้วเห็นเฉลยทันที · คำแปล · เหตุผลของทุกตัวเลือก · เทคนิคทำข้อสอบ · คำศัพท์</small></button>
          <button class="tq-mode" type="button" data-t5-act="mock">
            ${ICON('timer', 'icon')}<b>Mock Test</b><small>${m.mockSize} ข้อ · จับเวลา ${m.mockMinutes} นาที (≈ ${Math.round((m.mockMinutes * 60) / m.mockSize)} วินาที/ข้อ) · เปลี่ยนคำตอบได้จนกว่าจะส่ง · ดูผลหลังส่ง</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.practiced}<small>/${s.bankSize}</small></b><span>Questions Practiced</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestMock ? `${s.bestMock.percent}%` : '—'}</b><span>Best Mock Score</span></div>
          <div class="tq-stat" role="listitem"><b>${secs(s.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>
        </div>
        <div class="tq-links">
          <button class="tq-link" type="button" data-t5-nav="toeic-p5-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
            <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ข้อที่ยังตอบผิด · ดูเฉลยและคำอธิบาย · ฝึกซ้ำ` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button>
        </div>
        <section class="gl-card tq-analytics" aria-labelledby="t5-an-title">
          <div class="tq-an-head">
            <h2 class="tq-h2" id="t5-an-title">${ICON('chart-column', 'icon icon-sm')} วิเคราะห์ผล Reading</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">
              ${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-t5-range="${v}">${t}</button>`).join('')}
            </div>
          </div>
          ${s.answered ? `<p class="tq-an-sum">Part 5 Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ${s.bestPractice ? ` · Practice สูงสุด ${s.bestPractice.percent}%` : ''}${s.weakSkill ? ` · ควรฝึก: <b>${esc(s.weakSkill.th)}</b>` : ''}</p>
          <ul class="tq-skills">${s.skills.map((g) => bar(g.th, g)).join('')}
            ${bar('รวมไวยากรณ์ (Grammar)', s.categories.grammar)}${bar('รวมคำศัพท์ (Vocabulary)', s.categories.vocabulary)}</ul>
          <p class="tq-an-sub">ตามระดับ: Easy ${pct(s.difficulty.easy && s.difficulty.easy.accuracy)} · Medium ${pct(s.difficulty.medium && s.difficulty.medium.accuracy)} · Hard ${pct(s.difficulty.hard && s.difficulty.hard.accuracy)}</p>`
            : '<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test เพื่อดูจุดแข็ง/จุดอ่อน</p>'}
        </section>
        <section class="gl-card t5-howto" aria-labelledby="t5-how-title">
          <h2 class="tq-h2" id="t5-how-title">${ICON('lightbulb', 'icon icon-sm')} วิธีทำ Part 5 ให้เร็ว</h2>
          <ol><li>ดูตัวเลือกก่อน — ถ้าเป็นคำตระกูลเดียวกัน (decide / decision / decisive) = ข้อรูปคำ ดูตำแหน่งช่องว่างพอ ไม่ต้องอ่านทั้งประโยค</li>
            <li>ตัวเลือกเป็นกริยาหลายรูป = หาคำบอกเวลาและประธาน · ตัวเลือกเป็นคำเชื่อม = ดูว่าตามด้วยประโยคหรือคำนาม</li>
            <li>ตัวเลือกความหมายต่างกัน = ข้อคำศัพท์ อ่านทั้งประโยคแล้วหาคำที่ไปด้วยกัน (collocation)</li>
            <li>ไม่รู้จริง ๆ ให้เดาแล้วไปต่อ — ข้อสอบจริงควรใช้ไม่เกิน ~20–25 วินาที/ข้อ</li></ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;
      focusTitle('t5-title');
    } catch (err) { errorBox(el, err, openLanding); }
  }

  function practiceSetup(source = 'bank') {
    getMeta().then((m) => {
      const saved = (() => { try { return JSON.parse(ls.get('eq_t5_cfg') || '{}'); } catch (_) { return {}; } })();
      const cfg = { size: 10, difficulty: 'mixed', focus: 'mixed', ...saved };
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
      const focusName = (f) => FOCUS_TH[f] || m.groupTh[f] || f;
      ov.innerHTML = `<div class="modal-card tq-setup" role="document">
        <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกข้อที่เคยผิด' : 'ตั้งค่า Part 5 Practice'}</h2>
        ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกข้อที่ครั้งล่าสุดยังตอบผิด · ลำดับตัวเลือกจะสลับใหม่</p>' : `
        <label class="tq-setup-label" for="t5-focus">ฝึกเรื่อง</label>
        <select id="t5-focus" class="tq-select">${m.focuses.map((f) => `<option value="${f}" ${f === cfg.focus ? 'selected' : ''}>${esc(focusName(f))}</option>`).join('')}</select>
        <p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['adaptive', 'Adaptive']], cfg.difficulty)}
        <p class="tq-setup-hint" id="t5-adapt-hint" ${cfg.difficulty === 'adaptive' ? '' : 'hidden'}>Adaptive: เพิ่มข้อในกลุ่มที่คุณพลาดบ่อย และปรับความยากตามความแม่นยำ (ต้องมีประวัติอย่างน้อย 15 ข้อ)</p>`}
        <p class="tq-setup-label">จำนวนข้อ</p>${seg('size', m.sizes.map((n) => [n, `${n} ข้อ`]), cfg.size)}
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'ตั้งค่าการฝึก Part 5', variant: 'sheet' });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cfg]');
        if (b) {
          cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v;
          b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
          const h = ov.querySelector('#t5-adapt-hint'); if (h) h.hidden = cfg.difficulty !== 'adaptive';
          return;
        }
        if (e.target.closest('[data-close]')) { ov.remove(); return; }
        if (e.target.closest('[data-go]')) {
          const f = ov.querySelector('#t5-focus'); if (f) cfg.focus = f.value;
          if (source !== 'mistakes') ls.set('eq_t5_cfg', JSON.stringify(cfg));
          ov.remove();
          start('practice', { ...cfg, source });
        }
      });
    }).catch((err) => App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'));
  }

  function mockIntro() {
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document">
        <div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">TOEIC Part 5 — Mock Test</h2>
        <ul class="tq-rules"><li>${m.mockSize} ข้อ · เวลา <b>${m.mockMinutes} นาที</b> นับตั้งแต่กดเริ่ม (ออกจากหน้าแล้วเวลายังเดิน)</li>
          <li>ข้ามข้อ ย้อนกลับ และเปลี่ยนคำตอบได้จนกว่าจะส่ง · ไม่มีเฉลยระหว่างทำ</li>
          <li>หมดเวลาแล้วระบบส่งให้อัตโนมัติ · ข้อที่ไม่ได้ตอบนับว่าผิด</li>
          <li>ได้ EXP เมื่อตอบอย่างน้อยครึ่งชุด</li></ul>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-go>${ICON('timer', 'icon icon-sm')} เริ่มจับเวลา</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Mock Test Part 5', variant: 'center' });
      ov.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) ov.remove();
        if (e.target.closest('[data-go]')) { ov.remove(); start('mock'); }
      });
    });
  }

  async function start(mode, cfg = {}) {
    try {
      const s = await api('/sessions', { method: 'POST', body: { mode, ...cfg, ...(mode === 'mock' && window.EQToeicFull ? window.EQToeicFull.ctx(5) : {}) } });
      openPlay(s.id, s);
    } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER
     ===================================================================== */
  let P = null;        // { s, i, mock, sel: {qid: letter}, startAt, clockSkew, timer }
  let timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  async function openPlay(sid, preload) {
    stopTimer();
    setHash('toeic-p5-play', sid); App().showScreen('screen-toeic5-play');
    const el = root('screen-toeic5-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openLanding(); return; }
      const sel = {}; s.items.forEach((it) => { if (it.selected) sel[it.qid] = it.selected; else if (it.feedback) sel[it.qid] = it.feedback.selected; });
      const first = s.items.findIndex((x) => !x.answered);
      P = { s, mock: s.mode === 'mock', sel, i: first < 0 ? (s.mode === 'mock' ? 0 : s.items.length - 1) : first,
        skew: s.serverNow ? Date.parse(s.serverNow) - Date.now() : 0, startAt: Date.now() };
      App().setLeaveGuard((path) => {
        if (!P || path.startsWith('toeic-p5-play')) return false;
        if (P.mock && !confirm('ออกจาก Mock Test ตอนนี้? เวลายังเดินต่อ — กลับมาทำต่อได้จากหน้า Part 5 ก่อนหมดเวลา')) return true;
        stopTimer(); App().setLeaveGuard(null); P = null; return false;
      });
      if (!P.mock && first < 0) { finish(); return; }
      render();
      if (P.mock) startTimer();
    } catch (err) { errorBox(el, err, () => openPlay(sid)); }
  }

  const remaining = () => Date.parse(P.s.deadline) - (Date.now() + P.skew);
  function startTimer() {
    stopTimer();
    const tick = () => {
      if (!P || !P.mock) { stopTimer(); return; }
      const left = remaining();
      const t = document.getElementById('t5-timer');
      if (t) {
        t.querySelector('b').textContent = mmss(left);
        t.classList.toggle('is-warn', left <= 2 * 60 * 1000);
        t.classList.toggle('is-crit', left <= 30 * 1000);
        if (left <= 60 * 1000 && !P.warned) { P.warned = true; App().toast('เหลือเวลา 1 นาที', 'info'); }
      }
      if (left <= 0) { stopTimer(); App().toast('หมดเวลา — ส่งคำตอบให้อัตโนมัติ', 'info'); finish(); }
    };
    tick();
    timer = setInterval(tick, 500);
  }

  function render() {
    const el = root('screen-toeic5-play');
    const { s } = P;
    const it = s.items[P.i];
    const fb = !P.mock && it.feedback;
    const chosen = P.sel[it.qid] || null;
    const answered = Object.keys(P.sel).length;
    P.startAt = Date.now();
    el.innerHTML = `
      <div class="tq-play t5-play ${P.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-t5-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Reading · Part 5</b><small>${P.mock ? `Mock Test · ตอบแล้ว ${answered}/${s.total}` : 'Practice'}</small></div>
          ${P.mock ? `<span class="t5-timer" id="t5-timer" role="timer" aria-label="เวลาที่เหลือ">${ICON('timer', 'icon icon-sm')} <b>--:--</b></span>` : `<span class="tq-qno" id="t5-qno">Question ${P.i + 1} / ${s.total}</span>`}
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${P.mock ? answered : P.i}"><span style="width:${((P.mock ? answered : P.i) / s.total) * 100}%"></span></div>
        <article class="gl-card t5-q" aria-labelledby="t5-qhead">
          <p class="t5-qhead" id="t5-qhead">${P.mock ? `<span id="t5-qno" tabindex="-1">ข้อ ${P.i + 1} / ${s.total}</span>` : `ข้อ ${it.n}`} <small>เลือกคำที่เติมในช่องว่างได้ถูกต้องที่สุด</small></p>
          <p class="t5-sentence" lang="en">${fb ? sentenceHtml(it.sentence, fb.answerText, 'is-ok') : sentenceHtml(it.sentence, chosen ? it.options[LETTERS.indexOf(chosen)] : null, 'is-pick')}</p>
          <div class="t5-opts" role="group" aria-label="ตัวเลือก">
            ${it.options.map((o, k) => {
              const l = LETTERS[k];
              let cls = '';
              if (fb) cls = l === fb.correctOption ? ' is-right' : l === fb.selected ? ' is-wrongpick' : '';
              else if (chosen === l) cls = ' is-chosen';
              return `<button class="t5-opt${cls}" type="button" data-t5-ans="${l}" aria-pressed="${chosen === l}" ${fb ? 'disabled' : ''}><span class="t5-l">${l}</span><span class="t5-o" lang="en">${esc(o)}</span></button>`;
            }).join('')}
          </div>
        </article>
        <div id="t5-after" aria-live="polite">${fb ? feedbackHtml(fb, { exp: it.exp }) + nextBtn() : ''}</div>
        ${P.mock ? mockNav() : ''}
      </div>`;
    focusTitle('t5-qno');
    if (P.mock) { const t = document.getElementById('t5-timer'); if (t) t.querySelector('b').textContent = mmss(remaining()); }
  }
  const nextBtn = () => {
    const last = P.i + 1 >= P.s.total;
    return `<div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-t5-next>${last ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `ข้อถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
  };
  function mockNav() {
    const { s } = P;
    const left = s.total - Object.keys(P.sel).length;
    return `<nav class="t5-mnav" aria-label="ไปข้ออื่น">
      <div class="t5-mnav-row">
        <button class="btn btn-secondary" type="button" data-t5-go="-1" ${P.i === 0 ? 'disabled' : ''}>${ICON('chevron-left', 'icon icon-sm')} ก่อนหน้า</button>
        <button class="btn btn-secondary" type="button" data-t5-go="1" ${P.i + 1 >= s.total ? 'disabled' : ''}>ถัดไป ${ICON('chevron-right', 'icon icon-sm')}</button>
      </div>
      <ol class="t5-grid">${s.items.map((it, k) => `<li><button type="button" class="t5-cell${P.sel[it.qid] ? ' is-done' : ''}${k === P.i ? ' is-cur' : ''}" data-t5-jump="${k}"
        aria-label="ข้อ ${k + 1}${P.sel[it.qid] ? ` ตอบ ${P.sel[it.qid]}` : ' ยังไม่ตอบ'}" ${k === P.i ? 'aria-current="step"' : ''}>${k + 1}</button></li>`).join('')}</ol>
      <button class="btn btn-primary t5-submit" type="button" data-t5-submit>${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}</button>
    </nav>`;
  }

  async function choose(letter) {
    if (!P) return;
    const it = P.s.items[P.i];
    if (!P.mock && (it.feedback || P.busy)) return;
    if (P.mock && P.sel[it.qid] === letter) return;
    const prev = P.sel[it.qid];
    P.sel[it.qid] = letter;
    P.busy = true;
    // ตอบสนองทันที (เลือกแล้วเห็น) — ถ้าส่งไม่สำเร็จจะย้อนกลับ
    document.querySelectorAll('[data-t5-ans]').forEach((b) => { const on = b.dataset.t5Ans === letter; b.classList.toggle('is-chosen', on); b.setAttribute('aria-pressed', String(on)); if (!P.mock) b.disabled = true; });
    const sent = document.querySelector('.t5-sentence');
    if (sent) sent.innerHTML = sentenceHtml(it.sentence, it.options[LETTERS.indexOf(letter)], 'is-pick');
    try {
      const r = await api(`/sessions/${P.s.id}/answer`, { method: 'POST', body: { qid: it.qid, selected: letter, responseMs: Date.now() - P.startAt } });
      P.busy = false;
      if (!P) return;
      it.answered = true;
      if (P.mock) {
        // อัปเดตแถบสถานะ/ตาราง โดยไม่วาดใหม่ทั้งหน้า
        const cell = document.querySelector(`[data-t5-jump="${P.i}"]`); if (cell) cell.classList.add('is-done');
        const sm = document.querySelector('.tq-top-text small'); if (sm) sm.textContent = `Mock Test · ตอบแล้ว ${Object.keys(P.sel).length}/${P.s.total}`;
        const sub = document.querySelector('[data-t5-submit]'); const left = P.s.total - Object.keys(P.sel).length;
        if (sub) sub.innerHTML = `${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}`;
        const bar = document.querySelector('.tq-progress span'); if (bar) bar.style.width = `${((P.s.total - left) / P.s.total) * 100}%`;
        if (!prev && P.i + 1 < P.s.total && !P.s.items[P.i + 1].answered) setTimeout(() => { if (P && P.mock && P.s.items[P.i] === it) { P.i += 1; render(); } }, reduced() ? 150 : 350);
      } else {
        it.feedback = r.feedback; it.exp = r.exp;
        if (window.EQAudio) window.EQAudio.sfx(r.feedback.isCorrect ? 'correct' : 'wrong');
        if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
        render();
        const res = document.querySelector('.tq-result');
        if (res) res.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      }
    } catch (err) {
      P.busy = false;
      if (!P) return;
      if (err && err.code === 'TIME_UP') { finish(); return; }
      if (prev) P.sel[it.qid] = prev; else delete P.sel[it.qid];
      render();
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }

  function confirmSubmit() {
    const left = P.s.total - Object.keys(P.sel).length;
    if (!left) { finish(); return; }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card tq-check" role="document">
      <div class="tq-check-icon">${ICON('circle-alert', 'icon icon-lg')}</div>
      <h2 class="vb-sheet-title">ยังไม่ได้ตอบ ${left} ข้อ</h2>
      <p class="gl-sub">ข้อที่ไม่ได้ตอบจะนับว่าผิด · เหลือเวลา ${mmss(remaining())}</p>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close data-autofocus>กลับไปทำต่อ</button>
        <button class="btn btn-primary" type="button" data-go>${ICON('send', 'icon icon-sm')} ส่งเลย</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ยืนยันส่งคำตอบ', variant: 'center' });
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) ov.remove();
      if (e.target.closest('[data-go]')) { ov.remove(); finish(); }
    });
  }

  async function finish() {
    if (!P || P.finishing) return;
    P.finishing = true;
    stopTimer();
    const el = root('screen-toeic5-play');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/sessions/${P.s.id}/finish`, { method: 'POST', body: {} });
      const s = P.s;
      App().setLeaveGuard(null);
      P = null;
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      showResult(r.result, s, r);
    } catch (err) { P.finishing = false; errorBox(el, err, finish); }
  }

  /* ---------- Feedback ---------- */
  function feedbackHtml(fb, opts = {}) {
    const lines = fb.options.map((o) => `<li class="tq-line ${o.isCorrect ? 'is-correct' : ''} ${fb.selected === o.letter && !o.isCorrect ? 'is-wrong' : ''}">
        <span class="tq-line-l">${o.letter}</span>
        <div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(o.text)}</p><p class="tq-line-why">${esc(o.noteTH)}</p></div></li>`).join('');
    const vocab = (fb.vocabulary || []).map((v) => `<li class="tq-vocab">
        <div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span>
          <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div>
        <p class="tq-vocab-th">${esc(v.th)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-t5-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : ''}</li>`).join('');
    return `
      <div class="tq-result ${fb.isCorrect ? 'ok' : 'bad'}" ${opts.live === false ? '' : 'role="status"'}>
        ${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon')}
        <div><b>${fb.isCorrect ? 'ถูกต้อง!' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b> <span>Correct Answer: <b>${fb.correctOption}</b> (${esc(fb.answerText)})${fb.selected && !fb.isCorrect ? ` · คุณเลือก ${fb.selected}` : ''}</span>
        <small>${esc(fb.skill.th)} · ${esc(DIFF_TH[fb.difficulty] || fb.difficulty)}</small></div>
        ${opts.exp ? `<span class="tq-exp">+${opts.exp} EXP</span>` : ''}
      </div>
      <section class="tq-fb-sec"><h3>${ICON('languages', 'icon icon-sm')} ประโยคเต็ม · คำแปล</h3>
        <p class="t5-full" lang="en">${sentenceHtml(fb.sentence, fb.answerText, 'is-ok')}</p><p class="tq-line-th">${esc(fb.translationTH)}</p></section>
      <section class="tq-fb-sec"><h3>${ICON('lightbulb', 'icon icon-sm')} Why ${fb.correctOption}?</h3><p>${esc(fb.why)}</p>
        <p class="tq-skilltags"><span class="tq-chip">${esc(fb.skill.groupTh)}</span> <span class="tq-chip">${esc(fb.skill.th)}</span></p></section>
      <section class="tq-fb-sec"><h3>${ICON('list-checks', 'icon icon-sm')} วิเคราะห์ทุกตัวเลือก</h3><ol class="tq-lines">${lines}</ol></section>
      ${vocab ? `<section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>` : ''}
      <section class="tq-fb-sec tq-tip"><h3>${ICON('target', 'icon icon-sm')} Exam Tip</h3><p>${esc(fb.tip)}</p></section>`;
  }

  /* ---------- ผลลัพธ์ ---------- */
  function showResult(res, s, award = {}) {
    stopTimer();
    App().setLeaveGuard(null);
    setHash('toeic-p5-play', s.id); App().showScreen('screen-toeic5-play');
    const el = root('screen-toeic5-play');
    const mock = res.mode === 'mock';
    const wrong = res.review.filter((x) => !x.isCorrect);
    const rows = res.skills.map((g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span>
        <span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`).join('');
    el.innerHTML = `
      <div class="tq-resultpage">
        <header class="tq-res-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} TOEIC Reading Practice · Part 5</p>
          <h1 class="page-title" id="t5-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}
        </header>
        <div class="tq-stats">
          <div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div>
          <div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          ${mock ? `<div class="tq-stat"><b>${res.unanswered}</b><span>ไม่ได้ตอบ</span></div>
            <div class="tq-stat"><b>${res.timeUsedMs != null ? mmss(res.timeUsedMs) : '—'}<small>/${mmss(res.timeLimitMs)}</small></b><span>เวลาที่ใช้</span></div>`
            : `<div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div><div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>`}
        </div>
        ${res.strongest || res.weakest ? `<p class="tq-sw">${res.strongest ? `${ICON('star', 'icon icon-sm')} Strongest: <b>${esc(res.strongest.th)}</b> (${res.strongest.accuracy}%)` : ''}
          ${res.weakest && res.weakest.group !== (res.strongest && res.strongest.group) ? ` · ${ICON('target', 'icon icon-sm')} Weakest: <b>${esc(res.weakest.th)}</b> (${res.weakest.accuracy}%)` : ''}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Grammar & Vocabulary Breakdown</h2><ul class="tq-skills">${rows}</ul></section>
        <div class="gl-actions">
          <button class="btn btn-secondary" type="button" data-t5-nav="toeic-p5">${ICON('arrow-left', 'icon icon-sm')} Part 5</button>
          ${s.config && s.config.dailyTask && window.EQToeicDaily ? window.EQToeicDaily.resultButtons(5, s.config) : s.config && s.config.drill && window.EQToeicWeak ? window.EQToeicWeak.resultButtons(5, s.config) : s.config && s.config.fullTestId ? `<button class="btn btn-primary" type="button" data-tqf-back="${s.config.fullTestId}">${ICON('list-checks', 'icon icon-sm')} กลับไป Full Mock Test</button>` : `<button class="btn btn-primary" type="button" data-t5-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>`}
        </div>
        <section class="tq-review" aria-labelledby="t5-rv-title">
          <div class="tq-rv-head"><h2 class="tq-h2" id="t5-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2>
            ${wrong.length ? `<label class="tq-only-wrong"><input type="checkbox" id="t5-only-wrong"> เฉพาะข้อที่ผิด (${wrong.length})</label>` : ''}</div>
          <ol class="tq-rv-list">${res.review.map((fb) => reviewItem(fb)).join('')}</ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p>
      </div>`;
    focusTitle('t5-res-title');
  }
  function reviewItem(fb) {
    return `<li class="tq-rv ${fb.isCorrect ? 'ok' : 'bad'}" data-ok="${fb.isCorrect ? 1 : 0}">
      <details>
        <summary><span class="tq-rv-n">${fb.n ? `Q${fb.n}` : ''}</span>
          <span class="tq-rv-sum t5-rv-sum"><span class="t5-rv-s" lang="en">${sentenceHtml(fb.sentence, null)}</span>
          <small>${fb.isCorrect ? `${ICON('circle-check', 'icon icon-sm')} ถูก` : `${ICON('circle-x', 'icon icon-sm')} ${fb.selected ? `เลือก ${fb.selected}` : 'ไม่ได้ตอบ'}`} · คำตอบ ${fb.correctOption} (${esc(fb.answerText)}) · ${esc(fb.skill.th)}</small></span></summary>
        <div class="tq-rv-body">${feedbackHtml(fb, { live: false })}</div>
      </details></li>`;
  }

  /* ---------- Error Notebook ---------- */
  async function openReview() {
    stopTimer();
    setHash('toeic-p5-review'); App().showScreen('screen-toeic5');
    const el = root('screen-toeic5');
    loading(el);
    try {
      const d = await api('/mistakes');
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t5-nav="toeic-p5">${ICON('arrow-left', 'icon icon-sm')} Part 5</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Reading · Part 5</p>
          <h1 class="page-title" id="t5-rev-title">Review Mistakes</h1>
          <p class="gl-sub">ข้อที่ครั้งล่าสุดยังตอบผิด ${d.items.length} ข้อ · ตอบถูกในภายหลังแล้วจะหลุดจากรายการเอง</p></header>
        ${d.items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-t5-act="custom">${ICON('play', 'icon icon-sm')} ฝึกข้อที่ผิดอีกครั้ง</button></div>
          <ol class="tq-rv-list">${d.items.map((fb) => reviewItem(fb)).join('')}</ol>`
          : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีข้อที่ตอบผิด</p></div>`}`;
      focusTitle('t5-rev-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-t5-nav]');
    if (b) { e.preventDefault(); App().navigateTo(b.dataset.t5Nav); return; }
    b = t.closest('[data-t5-act]');
    if (b) { const a = b.dataset.t5Act; if (a === 'practice') practiceSetup('bank'); else if (a === 'custom') practiceSetup('mistakes'); else if (a === 'mock') mockIntro(); return; }
    b = t.closest('[data-t5-resume]');
    if (b) { openPlay(b.dataset.t5Resume); return; }
    b = t.closest('[data-t5-range]');
    if (b) { range = b.dataset.t5Range; ls.set('eq_t5_range', range); openLanding(); return; }
    b = t.closest('[data-t5-srs]');
    if (b) {
      b.disabled = true;
      try { const r = await api('/vocab/review', { method: 'POST', body: { wordId: b.dataset.t5Srs } }); b.innerHTML = `${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มแล้ว' : 'อยู่ในรายการแล้ว'}`; } catch (err) { b.disabled = false; App().toast(err.message || 'เพิ่มไม่สำเร็จ', 'error'); }
      return;
    }
    if (!P) return;
    b = t.closest('[data-t5-ans]');
    if (b) { if (!b.disabled) choose(b.dataset.t5Ans); return; }
    if (t.closest('[data-t5-next]')) { if (P.i + 1 >= P.s.total) finish(); else { P.i += 1; render(); } return; }
    b = t.closest('[data-t5-go]');
    if (b) { P.i = Math.max(0, Math.min(P.s.total - 1, P.i + Number(b.dataset.t5Go))); render(); return; }
    b = t.closest('[data-t5-jump]');
    if (b) { P.i = Number(b.dataset.t5Jump); render(); return; }
    if (t.closest('[data-t5-submit]')) { confirmSubmit(); return; }
    if (t.closest('[data-t5-exit]')) { App().navigateTo('toeic-p5'); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 't5-only-wrong') return;
    document.querySelectorAll('#screen-toeic5-play .tq-rv').forEach((li) => { li.hidden = e.target.checked && li.dataset.ok === '1'; });
  });
  // คีย์บอร์ด: 1–4 หรือ A–D เลือก · Enter ข้อถัดไป (Practice) · ←/→ เปลี่ยนข้อ (Mock)
  document.addEventListener('keydown', (e) => {
    if (!P || !document.querySelector('.t5-play') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, .modal-overlay, summary')) return;
    const k = e.key.toUpperCase();
    let idx = ['1', '2', '3', '4'].indexOf(k); if (idx < 0) idx = LETTERS.indexOf(k);
    if (idx >= 0 && k.length === 1) { const btn = document.querySelector(`[data-t5-ans="${LETTERS[idx]}"]`); if (btn && !btn.disabled) { e.preventDefault(); choose(LETTERS[idx]); } return; }
    if (e.key === 'Enter' && !P.mock && document.querySelector('[data-t5-next]') && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); document.querySelector('[data-t5-next]').click(); return; }
    if (P.mock && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const n = P.i + (e.key === 'ArrowRight' ? 1 : -1);
      if (n >= 0 && n < P.s.total) { e.preventDefault(); P.i = n; render(); }
    }
  });
  // กลับมาที่แท็บ → ซิงก์เวลาใหม่ (มือถือพักแอปแล้ว interval หยุด)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P && P.mock && timer) startTimer(); });

  /** เราเตอร์ของโมดูล (เรียกจาก app.js navigateTo) */
  function open(view, param) {
    if (view !== 'play') { stopTimer(); if (P && !P.mock) { App().setLeaveGuard(null); P = null; } }
    switch (view) {
      case 'play': return param ? openPlay(param) : openLanding();
      case 'review': return openReview();
      default: return openLanding();
    }
  }
  window.EQToeic5 = { open, mock: () => mockIntro(), drill: (_p, body) => start('practice', body), _state: () => P };
})();
