/* =====================================================================
   ภาษาอังกฤษเพื่อการทำงาน (English for Work) — หมวดเฉพาะสมาชิก Premium — window.EQWork
     #/work           หน้ารวม 6 หัวข้อ (ความคืบหน้า · ตัวอย่างสำหรับผู้ที่ยังไม่เป็นสมาชิก)
     #/work/<topic>   เรียนวลี (ฟังเสียง · คำแปล · วิธีใช้ · ตัวอย่าง) แล้วทำแบบฝึก 10 ข้อ
   สิทธิ์ตรวจที่เซิร์ฟเวอร์ (/api/work) · ทุกข้อความผ่าน esc() · ไม่มี EXP/Coin
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-work-root');
  const REG = { formal: 'ทางการ', neutral: 'ทั่วไป', informal: 'เป็นกันเอง' };
  const canSpeak = () => 'speechSynthesis' in window;
  let topic = null;   // ข้อมูลหัวข้อที่เปิดอยู่
  let quiz = null;    // { s, i, fb }

  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-wk-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-wk-retry]').addEventListener('click', retry);
  }
  const say = (text) => { try { if (App().speak) App().speak(text); } catch (_) { /* ไม่มีเสียงก็อ่านได้ */ } };
  const sayBtn = (text, label) => (canSpeak() ? `<button class="wk-say" type="button" data-wk-say="${esc(text)}" aria-label="ฟังเสียง: ${esc(label || text)}">${ICON('volume-2', 'icon icon-sm')}</button>` : '');
  const lockBox = (title, text) => `<section class="wk-lock">${ICON('crown', 'icon icon-lg')}<div><b>${esc(title)}</b><p>${esc(text)}</p>
      <button class="btn btn-primary" type="button" data-wk-nav="premium">${ICON('crown', 'icon icon-sm')} ดูสมาชิก Premium</button></div></section>`;

  /* ----------------------------- หน้ารวม ----------------------------- */
  async function openHub() {
    topic = null; quiz = null;
    setHash('#/work'); App().showScreen('screen-work');
    const el = root(); loading(el);
    let d;
    try { d = await App().api('/work'); } catch (err) { errorBox(el, err, openHub); return; }
    const card = (t) => `<li><button class="wk-topic${d.access ? '' : ' is-locked'}" type="button" data-wk-topic="${esc(t.id)}">
        <span class="wk-topic-ic">${ICON(t.icon, 'icon')}</span>
        <span class="wk-topic-text"><b>${esc(t.th)}</b><small lang="en">${esc(t.en)} · ${t.total} วลี</small>
          ${d.access ? `<span class="gl-bar tq-bar wk-bar" aria-hidden="true"><span style="width:${t.total ? Math.round((t.mastered / t.total) * 100) : 0}%"></span></span>
            <small>ชำนาญ ${t.mastered}/${t.total}${t.accuracy != null ? ` · แม่นยำ ${t.accuracy}%` : ''}</small>`
            : `<small class="wk-preview">${t.preview.map((p) => `<span lang="en">“${esc(p.phrase)}”</span>`).join(' ')}</small>`}</span>
        ${d.access ? ICON('chevron-right', 'icon icon-sm') : ICON('lock', 'icon icon-sm')}</button></li>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-wk-nav="learn">${ICON('arrow-left', 'icon icon-sm')} เส้นทางการเรียน</button>
      <header class="wk-hero"><p class="gl-kicker">${ICON('crown', 'icon icon-sm')} Premium</p>
        <h1 class="page-title" id="wk-title">ภาษาอังกฤษเพื่อการทำงาน</h1>
        <p class="gl-sub">วลีที่ใช้จริงในที่ทำงาน ${d.totalItems} วลี · 6 สถานการณ์ · ฟังเสียง ดูวิธีใช้ แล้วฝึกเลือกประโยคให้ถูกสถานการณ์</p></header>
      ${d.access ? '' : lockBox('หมวดนี้สำหรับสมาชิก Premium', 'ดูตัวอย่างได้หัวข้อละ 2 วลี · เป็นสมาชิกเพื่อเปิดครบทุกวลีและแบบฝึก (บทเรียนอื่นในแอปยังฟรีเหมือนเดิม)')}
      <ul class="wk-topics">${d.topics.map(card).join('')}</ul>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} เนื้อหาเขียนขึ้นใหม่สำหรับ EnglishQuest · ความคืบหน้าเก็บเป็น "ชำนาญ" (ตอบถูกติดกัน 2 ครั้ง) · หมวดนี้ไม่ให้ EXP/Coin เพื่อความยุติธรรมกับผู้ใช้ทุกคน</p>`;
    focusTitle('wk-title');
  }

  /* ----------------------------- หน้าหัวข้อ ----------------------------- */
  async function openTopic(id) {
    quiz = null;
    setHash(`#/work/${encodeURIComponent(id)}`); App().showScreen('screen-work');
    const el = root(); loading(el);
    try { topic = await App().api(`/work/topics/${encodeURIComponent(id)}`); } catch (err) { errorBox(el, err, () => openTopic(id)); return; }
    const t = topic;
    const item = (it, n) => `<li class="wk-item${it.progress && it.progress.mastered ? ' is-mastered' : ''}">
        <div class="wk-item-head"><span class="wk-n">${n + 1}</span>
          <p class="wk-phrase" lang="en">${esc(it.phrase)}</p>${sayBtn(it.phrase)}</div>
        <p class="wk-th">${esc(it.th)}</p>
        <p class="wk-chips"><span class="wk-chip">${esc(it.level)}</span><span class="wk-chip is-${esc(it.register)}">${esc(REG[it.register] || it.register)}</span>
          ${it.progress && it.progress.mastered ? `<span class="wk-chip is-ok">${ICON('circle-check', 'icon icon-sm')} ชำนาญ</span>` : ''}</p>
        <p class="wk-note">${ICON('lightbulb', 'icon icon-sm')}<span>${esc(it.noteTH)}</span></p>
        <div class="wk-ex"><p lang="en">${esc(it.example)} ${sayBtn(it.example, 'ประโยคตัวอย่าง')}</p><small>${esc(it.exampleTH)}</small></div></li>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-wk-hub>${ICON('arrow-left', 'icon icon-sm')} ภาษาอังกฤษเพื่อการทำงาน</button>
      <header class="wk-hero"><p class="gl-kicker">${ICON(t.icon, 'icon icon-sm')} <span lang="en">${esc(t.en)}</span></p>
        <h1 class="page-title" id="wk-ttitle">${esc(t.th)}</h1>
        <p class="gl-sub">${t.total} วลี · กดลำโพงเพื่อฟังเสียง · อ่านวิธีใช้แล้วลองฝึก</p></header>
      ${t.locked ? '' : `<div class="wk-actions"><button class="btn btn-primary wk-start" type="button" data-wk-quiz="${esc(t.id)}">${ICON('play', 'icon icon-sm')} ฝึก 10 ข้อ</button></div>`}
      <ol class="wk-items">${t.items.map(item).join('')}</ol>
      ${t.locked ? lockBox(`อีก ${t.total - t.items.length} วลี + แบบฝึก สำหรับสมาชิก Premium`, 'ตัวอย่างข้างบนเปิดให้ดูฟรี · เป็นสมาชิกเพื่อเรียนครบทุกวลีและทำแบบฝึกพร้อมคำอธิบาย')
        : `<div class="wk-actions"><button class="btn btn-primary wk-start" type="button" data-wk-quiz="${esc(t.id)}">${ICON('play', 'icon icon-sm')} ฝึก 10 ข้อ</button></div>`}`;
    focusTitle('wk-ttitle');
  }

  /* ----------------------------- แบบฝึก ----------------------------- */
  async function startQuiz(id) {
    try { const s = await App().api(`/work/topics/${encodeURIComponent(id)}/quiz`, { method: 'POST', body: {} }); quiz = { s, i: 0, fb: null }; renderQ(); }
    catch (err) { if (err.status === 403) { App().toast(err.message, 'info'); App().navigateTo('premium'); } else App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }
  function renderQ() {
    const { s, i, fb } = quiz; const q = s.questions[i];
    const prompt = q.type === 'cloze'
      ? `<p class="wk-qlabel">เติมคำให้ประโยคสมบูรณ์</p><p class="wk-cloze" lang="en">${esc(q.prompt).replace('___', '<span class="wk-blank" aria-label="ช่องว่าง">_____</span>')}</p>`
      : `<p class="wk-qlabel">เลือกประโยคที่เหมาะกับสถานการณ์ที่สุด</p><p class="wk-situ">${esc(q.prompt)}</p>`;
    const opt = (o, k) => {
      let cls = '';
      if (fb) { if (k === fb.correctChoice) cls = ' is-right'; else if (k === q.selected) cls = ' is-wrong'; }
      return `<li><button class="wk-opt${cls}" type="button" data-wk-opt="${k}" ${fb ? 'disabled' : ''} lang="en"><span class="wk-opt-k">${'ABCD'[k]}</span><span>${esc(o)}</span></button></li>`;
    };
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-wk-leave>${ICON('arrow-left', 'icon icon-sm')} ${esc(topic ? topic.th : 'กลับ')}</button>
      <div class="wk-qtop"><b id="wk-qtitle">ข้อ ${i + 1} / ${s.total}</b><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${(i / s.total) * 100}%"></span></span></div>
      <section class="gl-card wk-q" aria-labelledby="wk-qtitle">${prompt}<ul class="wk-opts">${q.options.map(opt).join('')}</ul>
        ${fb ? `<div class="wk-fb ${fb.correct ? 'is-right' : 'is-wrong'}" role="status"><b>${fb.correct ? `${ICON('circle-check', 'icon icon-sm')} ถูกต้อง` : `${ICON('circle-x', 'icon icon-sm')} ยังไม่ถูก — คำตอบคือ ${'ABCD'[fb.correctChoice]}`}</b>
          <p>${esc(fb.whyTH)}</p><p class="wk-fb-ex" lang="en">${esc(fb.example)} ${sayBtn(fb.example, 'ประโยคตัวอย่าง')}</p><small>${esc(fb.exampleTH)}</small></div>
          <button class="btn btn-primary wk-next" type="button" data-wk-next>${i + 1 < s.total ? 'ข้อต่อไป' : 'ดูผล'} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
      </section>`;
    focusTitle('wk-qtitle');
  }
  async function choose(k) {
    const { s, i } = quiz;
    try {
      const r = await App().api(`/work/quiz/${s.id}/answer`, { method: 'POST', body: { k: s.questions[i].k, choice: k } });
      s.questions[i].selected = k; quiz.fb = r; renderQ();
      const nx = root().querySelector('[data-wk-next]'); if (nx) nx.focus();
    } catch (err) { App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ', 'error'); }
  }
  async function showResult() {
    let r;
    try { r = await App().api(`/work/quiz/${quiz.s.id}/finish`, { method: 'POST', body: {} }); } catch (err) { App().toast(err.message, 'error'); return; }
    const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-wk-back-topic>${ICON('arrow-left', 'icon icon-sm')} ${esc(topic ? topic.th : 'กลับ')}</button>
      <header class="tq-res-hero"><p class="gl-kicker">${ICON('crown', 'icon icon-sm')} ภาษาอังกฤษเพื่อการทำงาน</p>
        <h1 class="page-title" id="wk-rtitle">${pct >= 80 ? 'เยี่ยมมาก!' : pct >= 50 ? 'ดีแล้ว ฝึกต่ออีกนิด' : 'ลองทบทวนวลีอีกรอบ'}</h1>
        <div class="tq-score"><b>${r.score}</b><span>/ ${r.total}</span></div>
        <p class="tq-score-label">ชำนาญแล้ว ${r.mastered}/${r.topicTotal} วลีในหัวข้อนี้</p></header>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-wk-back-topic>${ICON('book-open', 'icon icon-sm')} ทบทวนวลี</button>
        <button class="btn btn-primary" type="button" data-wk-quiz="${esc(r.topic)}">${ICON('refresh-cw', 'icon icon-sm')} ฝึกอีกชุด</button></div>`;
    quiz = null;
    focusTitle('wk-rtitle');
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('#screen-work')) return;
    let b = t.closest('[data-wk-say]');
    if (b) { say(b.dataset.wkSay); return; }
    b = t.closest('[data-wk-nav]');
    if (b) { App().navigateTo(b.dataset.wkNav); return; }
    if (t.closest('[data-wk-hub]')) { openHub(); return; }
    b = t.closest('[data-wk-topic]');
    if (b) { openTopic(b.dataset.wkTopic); return; }
    b = t.closest('[data-wk-quiz]');
    if (b) { b.disabled = true; startQuiz(b.dataset.wkQuiz).finally(() => { b.disabled = false; }); return; }
    b = t.closest('[data-wk-opt]');
    if (b && quiz && !quiz.fb) { choose(Number(b.dataset.wkOpt)); return; }
    if (t.closest('[data-wk-next]') && quiz) { if (quiz.i + 1 < quiz.s.total) { quiz.i += 1; quiz.fb = null; renderQ(); } else showResult(); return; }
    if (t.closest('[data-wk-leave]') || t.closest('[data-wk-back-topic]')) { if (topic) openTopic(topic.id); else openHub(); }
  });

  window.EQWork = { open: (param) => (param ? openTopic(decodeURIComponent(param)) : openHub()), _state: () => ({ topic, quiz }) };
})();
