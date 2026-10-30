/* =====================================================================
   TOEIC-style Reading Part 6 — window.EQToeic6  (Text Completion)
   หน้าจอ:
     p6      #/toeic-p6           Landing · Practice / Mock · Analytics
     play    #/toeic-p6-play/ID   บทความ + 4 ช่องว่าง (Practice: เฉลยรายช่องทันที · Mock: 4 บทความ 16 ข้อ 10 นาที)
     review  #/toeic-p6-review    Error Notebook (บทความที่ยังมีช่องผิด)
   ตรวจคำตอบ/เวลา/EXP ที่เซิร์ฟเวอร์ (/api/toeic/p6/*) · ใช้ CSS ของ toeic.css + toeic5.css + toeic6.css
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic/p6${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C', 'D'];
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
  const DIFF_TH = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  /** ข้อความบทความ → HTML: หัวอีเมล/บันทึกเป็นบรรทัดหัว · ย่อหน้า · ช่องว่างเป็นปุ่ม (แตะแล้วไปที่ข้อ) */
  function textHtml(it, fill) {
    const parts = String(it.text).split(/\n{2,}/);
    const gap = (k) => {
      const b = it.blanks[k - 1];
      const f = fill(b);
      return `<button type="button" class="t6-gap${b.kind === 'sentence' ? ' is-sent' : ''}${f ? ` ${f.cls}` : ''}" data-t6-gap="${k}" aria-label="ช่องว่างที่ ${k}${f ? ` : ${esc(f.text)}` : ''}">`
        + `<span class="t6-gap-n">${k}</span>${f ? `<span class="t6-gap-t" lang="en">${esc(f.text)}</span>` : `<span class="t6-gap-t">${b.kind === 'sentence' ? 'เติมประโยค' : '&nbsp;'}</span>`}</button>`;
    };
    const render = (s) => esc(s).replace(/\[\[(\d)\]\]/g, (_, d) => gap(Number(d))).replace(/\n/g, '<br>');
    return parts.map((p, i) => {
      if (i === 0 && /^(To|From|Subject|Date|Re|Cc|Attn|Memo|MEMO)\b[^\n]*:/m.test(p) && !/\[\[/.test(p)) return `<p class="t6-head">${esc(p).replace(/\n/g, '<br>')}</p>`;
      return `<p>${render(p)}</p>`;
    }).join('');
  }

  /* =====================================================================
     LANDING
     ===================================================================== */
  let range = ls.get('eq_t6_range') || 'all';
  async function openLanding() {
    stopTimer();
    setHash('toeic-p6'); App().showScreen('screen-toeic6');
    const el = root('screen-toeic6');
    loading(el);
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/summary?range=${range}`)]);
      const resume = s.activeSessions.map((a) => `<button class="tq-resume" type="button" data-t6-resume="${a.id}">${ICON('play', 'icon icon-sm')} ทำ${a.mode === 'mock' ? ' Mock Test' : 'ชุดฝึก'}ต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.accuracy}%</b><small>${g.total} ข้อ</small></li>`;
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t6-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <header class="tq-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} Reading · Part 6</p>
          <h1 class="page-title" id="t6-title">Text Completion</h1>
          <p class="gl-sub">อ่านอีเมล ประกาศ จดหมาย หรือบทความสั้น แล้วเติม 4 ช่องว่าง — คำ วลี หรือทั้งประโยค · ต้องดูบริบทของทั้งเรื่อง · ${s.bankSize} บทความ (${s.bankQuestions} ข้อ)</p>
        </header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-t6-act="practice">${ICON('graduation-cap', 'icon')}<b>Practice</b><small>ตอบทีละช่องแล้วเห็นเฉลยทันที · ครบ 4 ช่องเห็นคำแปลทั้งเรื่อง เทคนิค และคำศัพท์</small></button>
          <button class="tq-mode" type="button" data-t6-act="mock">${ICON('timer', 'icon')}<b>Mock Test</b><small>${m.mockPassages} บทความ ${m.mockQuestions} ข้อ · ${m.mockMinutes} นาที · เปลี่ยนคำตอบได้จนกว่าจะส่ง · ดูผลหลังส่ง</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.passagesPracticed}<small>/${s.bankSize}</small></b><span>บทความที่ฝึก</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestMock ? `${s.bestMock.percent}%` : '—'}</b><span>Best Mock Score</span></div>
          <div class="tq-stat" role="listitem"><b>${secs(s.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>
        </div>
        <div class="tq-links">
          <button class="tq-link" type="button" data-t6-nav="toeic-p6-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
            <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ช่องที่ยังตอบผิด · อ่านบทความพร้อมเฉลย` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button>
        </div>
        <section class="gl-card tq-analytics" aria-labelledby="t6-an-title">
          <div class="tq-an-head"><h2 class="tq-h2" id="t6-an-title">${ICON('chart-column', 'icon icon-sm')} วิเคราะห์ผล Reading</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-t6-range="${v}">${t}</button>`).join('')}</div></div>
          ${s.answered ? `<p class="tq-an-sum">Part 6 Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ${s.weakSkill ? ` · ควรฝึก: <b>${esc(s.weakSkill.th)}</b>` : ''}</p><ul class="tq-skills">${s.skills.map(bar).join('')}</ul>`
            : '<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test</p>'}
        </section>
        <section class="gl-card t5-howto" aria-labelledby="t6-how-title">
          <h2 class="tq-h2" id="t6-how-title">${ICON('lightbulb', 'icon icon-sm')} วิธีทำ Part 6</h2>
          <ol><li>อ่านหัวเรื่องและประโยคแรกก่อน — รู้ว่าใครเขียนถึงใคร เรื่องอะไร เกิดขึ้นเมื่อไร</li>
            <li>ช่องที่เป็นกริยา: หาวันที่/เวลาในบทความ (ไม่ใช่แค่ในประโยคนั้น) · ช่องคำเชื่อม: ดูความสัมพันธ์กับประโยคก่อนหน้า</li>
            <li>ข้อเติมประโยค: อ่านประโยคก่อนและหลังช่องว่าง ประโยคที่ถูกต้องต้อง "ต่อเรื่อง" ได้ทั้งสองฝั่ง และไม่ขัดกับข้อมูลในบทความ</li>
            <li>ข้อสอบจริงควรใช้ราว 2–2.5 นาทีต่อบทความ</li></ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;
      focusTitle('t6-title');
    } catch (err) { errorBox(el, err, openLanding); }
  }

  function practiceSetup(source = 'bank') {
    getMeta().then((m) => {
      const saved = (() => { try { return JSON.parse(ls.get('eq_t6_cfg') || '{}'); } catch (_) { return {}; } })();
      const cfg = { size: 2, difficulty: 'mixed', ...saved };
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
      ov.innerHTML = `<div class="modal-card tq-setup" role="document">
        <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกบทความที่เคยผิด' : 'ตั้งค่า Part 6 Practice'}</h2>
        ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกบทความที่ยังมีช่องตอบผิด · ลำดับตัวเลือกสลับใหม่</p>'
          : `<p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], cfg.difficulty)}`}
        <p class="tq-setup-label">จำนวนบทความ (บทละ 4 ข้อ)</p>${seg('size', m.sizes.map((n) => [n, `${n} บทความ`]), cfg.size)}
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'ตั้งค่าการฝึก Part 6', variant: 'sheet' });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cfg]');
        if (b) {
          cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v;
          b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
          return;
        }
        if (e.target.closest('[data-close]')) { ov.remove(); return; }
        if (e.target.closest('[data-go]')) { if (source !== 'mistakes') ls.set('eq_t6_cfg', JSON.stringify(cfg)); ov.remove(); start('practice', { ...cfg, source }); }
      });
    }).catch((err) => App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'));
  }
  function mockIntro() {
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document">
        <div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">TOEIC Part 6 — Mock Test</h2>
        <ul class="tq-rules"><li>${m.mockPassages} บทความ ${m.mockQuestions} ข้อ · เวลา <b>${m.mockMinutes} นาที</b> นับตั้งแต่กดเริ่ม</li>
          <li>สลับบทความ ย้อนกลับ และเปลี่ยนคำตอบได้จนกว่าจะส่ง · ไม่มีเฉลยระหว่างทำ</li>
          <li>หมดเวลาแล้วส่งอัตโนมัติ · ข้อที่ไม่ได้ตอบนับว่าผิด · ได้ EXP เมื่อตอบอย่างน้อยครึ่งชุด</li></ul>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-go>${ICON('timer', 'icon icon-sm')} เริ่มจับเวลา</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Mock Test Part 6', variant: 'center' });
      ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); start('mock'); } });
    });
  }
  async function start(mode, cfg = {}) {
    try { const s = await api('/sessions', { method: 'POST', body: { mode, ...cfg, ...(mode === 'mock' && window.EQToeicFull ? window.EQToeicFull.ctx(6) : {}) } }); openPlay(s.id, s); } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER
     ===================================================================== */
  let P = null;    // { s, i (บทความ), mock, sel: {blankId: letter}, fb: {blankId: feedback}, pfb: {pid: feedback} }
  let timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  async function openPlay(sid, preload) {
    stopTimer();
    setHash('toeic-p6-play', sid); App().showScreen('screen-toeic6-play');
    const el = root('screen-toeic6-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openLanding(); return; }
      const sel = {}; const fb = {}; const pfb = {};
      s.items.forEach((it) => { it.blanks.forEach((b) => { if (b.selected) sel[b.id] = b.selected; if (b.feedback) fb[b.id] = b.feedback; }); if (it.feedback) pfb[it.pid] = it.feedback; });
      const first = s.items.findIndex((it) => it.blanks.some((b) => !sel[b.id]));
      P = { s, mock: s.mode === 'mock', sel, fb, pfb, i: first < 0 ? 0 : first, skew: s.serverNow ? Date.parse(s.serverNow) - Date.now() : 0, startAt: Date.now() };
      App().setLeaveGuard((path) => {
        if (!P || path.startsWith('toeic-p6-play')) return false;
        if (P.mock && !confirm('ออกจาก Mock Test ตอนนี้? เวลายังเดินต่อ — กลับมาทำต่อได้ก่อนหมดเวลา')) return true;
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
      const t = document.getElementById('t6-timer');
      if (t) { t.querySelector('b').textContent = mmss(left); t.classList.toggle('is-warn', left <= 2 * 60000); t.classList.toggle('is-crit', left <= 30000); }
      if (left <= 60000 && !P.warned) { P.warned = true; App().toast('เหลือเวลา 1 นาที', 'info'); }
      if (left <= 0) { stopTimer(); App().toast('หมดเวลา — ส่งคำตอบให้อัตโนมัติ', 'info'); finish(); }
    };
    tick(); timer = setInterval(tick, 500);
  }
  const answeredCount = () => Object.keys(P.sel).length;

  function fillFor(b) {
    const fb = !P.mock && P.fb[b.id];
    if (fb) return { text: fb.answerText, cls: fb.isCorrect ? 'is-ok' : 'is-fixed' };
    const l = P.sel[b.id];
    return l ? { text: b.options[LETTERS.indexOf(l)], cls: 'is-pick' } : null;
  }
  function questionHtml(it, b) {
    const fb = !P.mock && P.fb[b.id];
    const chosen = P.sel[b.id];
    return `<section class="gl-card t6-qcard${b.kind === 'sentence' ? ' is-sent' : ''}" id="t6-q-${b.k}" data-blank="${esc(b.id)}" aria-labelledby="t6-qh-${b.k}">
      <h3 class="t6-qh" id="t6-qh-${b.k}"><span class="t6-num">${it.n ? `${(it.n - 1) * 4 + b.k}` : b.k}</span> ช่องว่างที่ ${b.k}
        <small>${b.kind === 'sentence' ? 'เลือกประโยคที่เข้ากับบทความที่สุด' : 'เลือกคำ/วลีที่เติมได้ถูกต้อง'}</small>
        <button type="button" class="t6-tolink" data-t6-totext="${b.k}">${ICON('arrow-up-right', 'icon icon-sm')} ดูในบทความ</button></h3>
      <div class="t5-opts${b.kind === 'sentence' ? ' is-sent' : ''}" role="group" aria-label="ตัวเลือกช่องที่ ${b.k}">
        ${b.options.map((o, k) => {
          const l = LETTERS[k];
          let cls = '';
          if (fb) cls = l === fb.correctOption ? ' is-right' : l === fb.selected ? ' is-wrongpick' : '';
          else if (chosen === l) cls = ' is-chosen';
          return `<button class="t5-opt${cls}" type="button" data-t6-ans="${l}" data-t6-blank="${esc(b.id)}" aria-pressed="${chosen === l}" ${fb ? 'disabled' : ''}><span class="t5-l">${l}</span><span class="t5-o" lang="en">${esc(o)}</span></button>`;
        }).join('')}
      </div>
      ${fb ? blankFbHtml(fb) : ''}
    </section>`;
  }
  function blankFbHtml(fb, review) {
    return `<div class="t6-bfb ${fb.isCorrect ? 'ok' : 'bad'}" ${review ? '' : 'role="status"'}>
      <p class="t6-bfb-head">${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon icon-sm')} <b>${fb.isCorrect ? 'ถูกต้อง' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b>
        · คำตอบ ${fb.correctOption}${fb.selected && !fb.isCorrect ? ` (คุณเลือก ${fb.selected})` : ''} <span class="tq-chip">${esc(fb.skill.th)}</span>${fb.exp ? ` <span class="tq-exp">+${fb.exp} EXP</span>` : ''}</p>
      <p>${esc(fb.why)}</p>
      <details class="t6-notes"><summary>เหตุผลของทุกตัวเลือก</summary><ol class="tq-lines">${fb.options.map((o) => `<li class="tq-line ${o.isCorrect ? 'is-correct' : ''} ${fb.selected === o.letter && !o.isCorrect ? 'is-wrong' : ''}">
        <span class="tq-line-l">${o.letter}</span><div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(o.text)}</p><p class="tq-line-why">${esc(o.noteTH)}</p></div></li>`).join('')}</ol></details>
    </div>`;
  }
  function passageFbHtml(pf) {
    const vocab = (pf.vocabulary || []).map((v) => `<li class="tq-vocab"><div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span>
        <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div><p class="tq-vocab-th">${esc(v.th)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-t6-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : ''}</li>`).join('');
    return `<section class="tq-fb-sec"><h3>${ICON('languages', 'icon icon-sm')} คำแปลทั้งเรื่อง</h3><p class="t6-trans">${esc(pf.translationTH).replace(/\n/g, '<br>')}</p></section>
      <section class="tq-fb-sec tq-tip"><h3>${ICON('target', 'icon icon-sm')} Exam Tip</h3><p>${esc(pf.tip)}</p></section>
      ${vocab ? `<section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>` : ''}`;
  }

  function render() {
    const el = root('screen-toeic6-play');
    const { s } = P; const it = s.items[P.i];
    const done = it.blanks.every((b) => P.fb[b.id]);
    P.startAt = Date.now();
    el.innerHTML = `
      <div class="tq-play t6-play ${P.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-t6-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Reading · Part 6</b><small id="t6-sub">${P.mock ? `Mock Test · ตอบแล้ว ${answeredCount()}/${s.total}` : `Practice · บทความ ${P.i + 1}/${s.items.length}`}</small></div>
          ${P.mock ? `<span class="t5-timer" id="t6-timer" role="timer" aria-label="เวลาที่เหลือ">${ICON('timer', 'icon icon-sm')} <b>${mmss(remaining())}</b></span>` : `<span class="tq-qno">Text ${P.i + 1} / ${s.items.length}</span>`}
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${answeredCount()}"><span id="t6-bar" style="width:${(answeredCount() / s.total) * 100}%"></span></div>
        ${P.mock ? `<div class="t6-tabs" role="tablist" aria-label="บทความ">${s.items.map((x, k) => `<button type="button" role="tab" class="t6-tab${k === P.i ? ' is-on' : ''}" aria-selected="${k === P.i}" data-t6-tab="${k}">
          บทความ ${k + 1} <small>${x.blanks.filter((b) => P.sel[b.id]).length}/4</small></button>`).join('')}</div>` : ''}
        <div class="t6-layout">
          <article class="gl-card t6-doc" aria-labelledby="t6-doc-title">
            <p class="t6-doctype">${ICON('mail', 'icon icon-sm')} ${esc(it.docTypeTh)} · Questions ${(P.i) * 4 + 1}–${(P.i) * 4 + 4}</p>
            <h2 class="t6-doc-title" id="t6-doc-title" lang="en" tabindex="-1">${esc(it.title)}</h2>
            <div class="t6-text" id="t6-text" lang="en">${textHtml(it, fillFor)}</div>
          </article>
          <div class="t6-qs" id="t6-qs">${it.blanks.map((b) => questionHtml(it, b)).join('')}
            <div id="t6-pfb">${!P.mock && done && P.pfb[it.pid] ? passageFbHtml(P.pfb[it.pid]) + nextBtn() : ''}</div>
          </div>
        </div>
        ${P.mock ? mockNav() : ''}
      </div>`;
    focusTitle('t6-doc-title');
  }
  const nextBtn = () => `<div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-t6-next>${P.i + 1 >= P.s.items.length ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `บทความถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
  function mockNav() {
    const left = P.s.total - answeredCount();
    return `<nav class="t5-mnav" aria-label="ไปข้ออื่น">
      <div class="t5-mnav-row">
        <button class="btn btn-secondary" type="button" data-t6-tab="${P.i - 1}" ${P.i === 0 ? 'disabled' : ''}>${ICON('chevron-left', 'icon icon-sm')} บทความก่อนหน้า</button>
        <button class="btn btn-secondary" type="button" data-t6-tab="${P.i + 1}" ${P.i + 1 >= P.s.items.length ? 'disabled' : ''}>บทความถัดไป ${ICON('chevron-right', 'icon icon-sm')}</button>
      </div>
      <ol class="t5-grid">${P.s.items.flatMap((x, pi) => x.blanks.map((b) => `<li><button type="button" class="t5-cell${P.sel[b.id] ? ' is-done' : ''}${pi === P.i ? ' is-cur' : ''}" data-t6-jump="${pi}:${b.k}"
        aria-label="ข้อ ${pi * 4 + b.k}${P.sel[b.id] ? ` ตอบ ${P.sel[b.id]}` : ' ยังไม่ตอบ'}">${pi * 4 + b.k}</button></li>`)).join('')}</ol>
      <button class="btn btn-primary t5-submit" type="button" data-t6-submit>${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}</button>
    </nav>`;
  }
  function refreshBlank(it, b) {
    const q = document.getElementById(`t6-q-${b.k}`); if (q) q.outerHTML = questionHtml(it, b);
    const t = document.getElementById('t6-text'); if (t) t.innerHTML = textHtml(it, fillFor);
    const n = answeredCount();
    const bar = document.getElementById('t6-bar'); if (bar) bar.style.width = `${(n / P.s.total) * 100}%`;
    if (P.mock) {
      const sub = document.getElementById('t6-sub'); if (sub) sub.textContent = `Mock Test · ตอบแล้ว ${n}/${P.s.total}`;
      const cell = document.querySelector(`[data-t6-jump="${P.i}:${b.k}"]`); if (cell) cell.classList.add('is-done');
      const tab = document.querySelector(`[data-t6-tab="${P.i}"].t6-tab small`); if (tab) tab.textContent = `${it.blanks.filter((x) => P.sel[x.id]).length}/4`;
      const btn = document.querySelector('[data-t6-submit]'); const left = P.s.total - n;
      if (btn) btn.innerHTML = `${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}`;
    }
  }

  async function choose(blankId, letter) {
    if (!P) return;
    const it = P.s.items[P.i];
    const b = it.blanks.find((x) => x.id === blankId);
    if (!b || (!P.mock && (P.fb[b.id] || P.busy)) || (P.mock && P.sel[b.id] === letter)) return;
    const prev = P.sel[b.id];
    P.sel[b.id] = letter; P.busy = true;
    refreshBlank(it, b);
    if (!P.mock) document.querySelectorAll(`[data-t6-blank="${b.id}"]`).forEach((x) => { x.disabled = true; });
    try {
      const r = await api(`/sessions/${P.s.id}/answer`, { method: 'POST', body: { id: b.id, selected: letter, responseMs: Date.now() - P.startAt } });
      P.busy = false; P.startAt = Date.now();
      if (!P) return;
      if (!P.mock) {
        P.fb[b.id] = { ...r.feedback, exp: r.exp };
        if (window.EQAudio) window.EQAudio.sfx(r.feedback.isCorrect ? 'correct' : 'wrong');
        if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
        refreshBlank(it, b);
        if (r.passage) {
          P.pfb[it.pid] = r.passage;
          document.getElementById('t6-pfb').innerHTML = passageFbHtml(r.passage) + nextBtn();
        }
        const fbEl = document.querySelector(`#t6-q-${b.k} .t6-bfb`);
        if (fbEl) fbEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      }
    } catch (err) {
      P.busy = false;
      if (!P) return;
      if (err && err.code === 'TIME_UP') { finish(); return; }
      if (prev) P.sel[b.id] = prev; else delete P.sel[b.id];
      refreshBlank(it, b);
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }
  function confirmSubmit() {
    const left = P.s.total - answeredCount();
    if (!left) { finish(); return; }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('circle-alert', 'icon icon-lg')}</div>
      <h2 class="vb-sheet-title">ยังไม่ได้ตอบ ${left} ข้อ</h2><p class="gl-sub">ข้อที่ไม่ได้ตอบจะนับว่าผิด · เหลือเวลา ${mmss(remaining())}</p>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close data-autofocus>กลับไปทำต่อ</button>
        <button class="btn btn-primary" type="button" data-go>${ICON('send', 'icon icon-sm')} ส่งเลย</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ยืนยันส่งคำตอบ', variant: 'center' });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); finish(); } });
  }
  async function finish() {
    if (!P || P.finishing) return;
    P.finishing = true; stopTimer();
    const el = root('screen-toeic6-play');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/sessions/${P.s.id}/finish`, { method: 'POST', body: {} });
      const s = P.s; App().setLeaveGuard(null); P = null;
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      showResult(r.result, s, r);
    } catch (err) { P.finishing = false; errorBox(el, err, finish); }
  }

  /* ---------- ผลลัพธ์ / ทบทวน ---------- */
  function reviewPassage(rp, opts = {}) {
    const fake = { ...rp, blanks: rp.blanks.map((b) => ({ ...b, id: b.id, kind: b.kind, options: b.options.map((o) => o.text) })) };
    const fill = (b) => { const f = rp.blanks[b.k - 1]; return { text: f.answerText, cls: f.isCorrect ? 'is-ok' : 'is-fixed' }; };
    const wrong = rp.blanks.filter((b) => (opts.notebook ? b.wrong : !b.isCorrect)).length;
    return `<li class="tq-rv ${wrong ? 'bad' : 'ok'}" data-ok="${wrong ? 0 : 1}">
      <details><summary><span class="tq-rv-n">${rp.n ? `T${rp.n}` : ''}</span>
        <span class="tq-rv-sum t5-rv-sum"><span class="t5-rv-s" lang="en">${esc(rp.title)}</span>
        <small>${esc(rp.docTypeTh)} · ${opts.notebook ? `ยังผิด ${wrong} ช่อง` : `ถูก ${4 - wrong}/4`}</small></span></summary>
        <div class="tq-rv-body">
          <article class="gl-card t6-doc"><div class="t6-text" lang="en">${textHtml(fake, fill)}</div></article>
          ${rp.blanks.map((b) => `<section class="t6-rvq"><h4 class="t6-qh"><span class="t6-num">${b.k}</span> ช่องว่างที่ ${b.k}</h4>${blankFbHtml(b, true)}</section>`).join('')}
          ${passageFbHtml(rp.feedback)}
        </div></details></li>`;
  }
  function showResult(res, s, award = {}) {
    stopTimer(); App().setLeaveGuard(null);
    setHash('toeic-p6-play', s.id); App().showScreen('screen-toeic6-play');
    const el = root('screen-toeic6-play');
    const mock = res.mode === 'mock';
    const rows = res.skills.map((g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`).join('');
    el.innerHTML = `
      <div class="tq-resultpage">
        <header class="tq-res-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} TOEIC Reading Practice · Part 6</p>
          <h1 class="page-title" id="t6-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}
        </header>
        <div class="tq-stats">
          <div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div><div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          ${mock ? `<div class="tq-stat"><b>${res.unanswered}</b><span>ไม่ได้ตอบ</span></div><div class="tq-stat"><b>${res.timeUsedMs != null ? mmss(res.timeUsedMs) : '—'}<small>/${mmss(res.timeLimitMs)}</small></b><span>เวลาที่ใช้</span></div>`
            : `<div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div><div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>`}
        </div>
        ${res.strongest || res.weakest ? `<p class="tq-sw">${res.strongest ? `${ICON('star', 'icon icon-sm')} Strongest: <b>${esc(res.strongest.th)}</b> (${res.strongest.accuracy}%)` : ''}
          ${res.weakest && res.weakest.group !== (res.strongest && res.strongest.group) ? ` · ${ICON('target', 'icon icon-sm')} Weakest: <b>${esc(res.weakest.th)}</b> (${res.weakest.accuracy}%)` : ''}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Skill Breakdown</h2><ul class="tq-skills">${rows}</ul></section>
        <div class="gl-actions">
          <button class="btn btn-secondary" type="button" data-t6-nav="toeic-p6">${ICON('arrow-left', 'icon icon-sm')} Part 6</button>
          ${s.config && s.config.dailyTask && window.EQToeicDaily ? window.EQToeicDaily.resultButtons(6, s.config) : s.config && s.config.drill && window.EQToeicWeak ? window.EQToeicWeak.resultButtons(6, s.config) : s.config && s.config.fullTestId ? `<button class="btn btn-primary" type="button" data-tqf-back="${s.config.fullTestId}">${ICON('list-checks', 'icon icon-sm')} กลับไป Full Mock Test</button>` : `<button class="btn btn-primary" type="button" data-t6-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>`}
        </div>
        <section class="tq-review" aria-labelledby="t6-rv-title"><div class="tq-rv-head"><h2 class="tq-h2" id="t6-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2></div>
          <ol class="tq-rv-list">${res.review.map((rp) => reviewPassage(rp)).join('')}</ol></section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p>
      </div>`;
    focusTitle('t6-res-title');
  }
  async function openReview() {
    stopTimer();
    setHash('toeic-p6-review'); App().showScreen('screen-toeic6');
    const el = root('screen-toeic6');
    loading(el);
    try {
      const d = await api('/mistakes');
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t6-nav="toeic-p6">${ICON('arrow-left', 'icon icon-sm')} Part 6</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Reading · Part 6</p><h1 class="page-title" id="t6-rev-title">Review Mistakes</h1>
          <p class="gl-sub">${d.items.length} บทความที่ยังมีช่องตอบผิด · ตอบถูกในภายหลังแล้วช่องนั้นจะหลุดจากรายการ</p></header>
        ${d.items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-t6-act="custom">${ICON('play', 'icon icon-sm')} ฝึกบทความที่ผิดอีกครั้ง</button></div>
          <ol class="tq-rv-list">${d.items.map((rp) => reviewPassage(rp, { notebook: true })).join('')}</ol>` : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีข้อที่ตอบผิด</p></div>`}`;
      focusTitle('t6-rev-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-t6-nav]');
    if (b) { e.preventDefault(); App().navigateTo(b.dataset.t6Nav); return; }
    b = t.closest('[data-t6-act]');
    if (b) { const a = b.dataset.t6Act; if (a === 'practice') practiceSetup('bank'); else if (a === 'custom') practiceSetup('mistakes'); else if (a === 'mock') mockIntro(); return; }
    b = t.closest('[data-t6-resume]');
    if (b) { openPlay(b.dataset.t6Resume); return; }
    b = t.closest('[data-t6-range]');
    if (b) { range = b.dataset.t6Range; ls.set('eq_t6_range', range); openLanding(); return; }
    b = t.closest('[data-t6-srs]');
    if (b) {
      b.disabled = true;
      try { const r = await api('/vocab/review', { method: 'POST', body: { wordId: b.dataset.t6Srs } }); b.innerHTML = `${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มแล้ว' : 'อยู่ในรายการแล้ว'}`; } catch (err) { b.disabled = false; App().toast(err.message || 'เพิ่มไม่สำเร็จ', 'error'); }
      return;
    }
    if (!P) return;
    b = t.closest('[data-t6-ans]');
    if (b) { if (!b.disabled) choose(b.dataset.t6Blank, b.dataset.t6Ans); return; }
    b = t.closest('[data-t6-gap]');
    if (b && b.closest('#t6-text')) { const q = document.getElementById(`t6-q-${b.dataset.t6Gap}`); if (q) { q.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); const f = q.querySelector('button:not(:disabled)'); if (f) f.focus({ preventScroll: true }); } return; }
    b = t.closest('[data-t6-totext]');
    if (b) { const g = document.querySelector(`#t6-text [data-t6-gap="${b.dataset.t6Totext}"]`); if (g) { g.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); g.classList.add('is-flash'); setTimeout(() => g.classList.remove('is-flash'), 1200); } return; }
    if (t.closest('[data-t6-next]')) { if (P.i + 1 >= P.s.items.length) finish(); else { P.i += 1; render(); } return; }
    b = t.closest('[data-t6-tab]');
    if (b) { const n = Number(b.dataset.t6Tab); if (n >= 0 && n < P.s.items.length) { P.i = n; render(); } return; }
    b = t.closest('[data-t6-jump]');
    if (b) { const [pi, k] = b.dataset.t6Jump.split(':').map(Number); P.i = pi; render(); const q = document.getElementById(`t6-q-${k}`); if (q) q.scrollIntoView({ block: 'start' }); return; }
    if (t.closest('[data-t6-submit]')) { confirmSubmit(); return; }
    if (t.closest('[data-t6-exit]')) App().navigateTo('toeic-p6');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P && P.mock && timer) startTimer(); });

  function open(view, param) {
    if (view !== 'play') { stopTimer(); if (P && !P.mock) { App().setLeaveGuard(null); P = null; } }
    switch (view) {
      case 'play': return param ? openPlay(param) : openLanding();
      case 'review': return openReview();
      default: return openLanding();
    }
  }
  window.EQToeic6 = { open, mock: () => mockIntro(), drill: (_p, body) => start('practice', body), _state: () => P };
})();
