/* =====================================================================
   หมวดคำศัพท์ตามเทศกาล (v1.12.0) — window.EQThemeVocab
     #/themes            หน้ารวมหมวด (วันฮาโลวีน · วันลอยกระทง) + ความคืบหน้า
     #/themes/<id>       เรียนคำ (ฟังเสียง · คำแปล · ประโยคตัวอย่าง) แล้วฝึก 10 ข้อ
   เข้าได้จากเส้นทางการเรียน (ปุ่ม [data-tv-open]) · ตรวจคำตอบที่เซิร์ฟเวอร์ (/api/theme-vocab)
   ทุกข้อความผ่าน esc() · ไม่มี EXP/Coin · ใช้คลาสหน้าตาเดียวกับอังกฤษเพื่อการทำงาน (wk-*)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-themes-root');
  const POS_TH = { noun: 'คำนาม', verb: 'คำกริยา', adjective: 'คำคุณศัพท์', phrase: 'วลี' };
  const canSpeak = () => 'speechSynthesis' in window;
  let cat = null;     // หมวดที่เปิดอยู่
  let quiz = null;    // { s, i, fb }

  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-tv-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-tv-retry]').addEventListener('click', retry);
  }
  const say = (text) => { try { if (App().speak) App().speak(text, 0.85); } catch (_) { /* ไม่มีเสียงก็อ่านได้ */ } };
  const sayBtn = (text, label) => (canSpeak() ? `<button class="wk-say" type="button" data-tv-say="${esc(text)}" aria-label="ฟังเสียง: ${esc(label || text)}">${ICON('volume-2', 'icon icon-sm')}</button>` : '');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /* ----------------------------- หน้ารวม ----------------------------- */
  async function openHub() {
    cat = null; quiz = null;
    setHash('#/themes'); App().showScreen('screen-themes');
    const el = root(); loading(el);
    let d;
    try { d = await App().api('/theme-vocab'); } catch (err) { errorBox(el, err, openHub); return; }
    const card = (c) => `<li><button class="wk-topic tv-topic is-${esc(c.festival)}${c.level === 'hard' ? ' is-hard' : ''}" type="button" data-tv-cat="${esc(c.id)}">
        <span class="wk-topic-ic tv-ic">${ICON(c.icon, 'icon')}</span>
        <span class="wk-topic-text"><b>${esc(c.th)} <span class="tv-lv is-${esc(c.level)}">${esc(c.levelTH)} · ${esc(c.cefr)}</span></b><small><span lang="en">${esc(c.en)}</span> · ${esc(c.dateTH)} · ${c.total} คำ</small>
          <small>${esc(c.introTH)}</small>
          <span class="gl-bar tq-bar wk-bar" aria-hidden="true"><span style="width:${pct(c.mastered, c.total)}%"></span></span>
          <small>จำได้แล้ว ${c.mastered}/${c.total}${c.accuracy != null ? ` · แม่นยำ ${c.accuracy}%` : ''}</small></span>
        ${ICON('chevron-right', 'icon icon-sm')}</button></li>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tv-nav="learn">${ICON('arrow-left', 'icon icon-sm')} เส้นทางการเรียน</button>
      <header class="wk-hero"><p class="gl-kicker">${ICON('sparkles', 'icon icon-sm')} Festival Vocabulary</p>
        <h1 class="page-title" id="tv-title">คำศัพท์ตามเทศกาล</h1>
        <p class="gl-sub">คำศัพท์ประจำเทศกาล ฟังเสียง ดูประโยคตัวอย่าง แล้วฝึกครั้งละ ${d.quizSize} ข้อ · เปิดเรียนได้ตลอดปี</p></header>
      <ul class="wk-topics">${d.categories.map(card).join('')}</ul>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} เนื้อหาเขียนขึ้นใหม่สำหรับ EnglishQuest · "จำได้แล้ว" = ตอบถูกติดกัน 2 ครั้ง · หมวดนี้แยกจากเส้นทางการเรียน (ไม่นับ Unit) และไม่ให้ EXP/Coin</p>`;
    focusTitle('tv-title');
  }

  /* ----------------------------- หน้าหมวด ----------------------------- */
  async function openCategory(id) {
    quiz = null;
    setHash(`#/themes/${encodeURIComponent(id)}`); App().showScreen('screen-themes');
    const el = root(); loading(el);
    try { cat = await App().api(`/theme-vocab/categories/${encodeURIComponent(id)}`); } catch (err) { errorBox(el, err, () => openCategory(id)); return; }
    const c = cat;
    const item = (it, n) => `<li class="wk-item tv-item${it.progress && it.progress.mastered ? ' is-mastered' : ''}">
        <div class="wk-item-head"><span class="wk-n">${n + 1}</span>
          <p class="wk-phrase" lang="en">${esc(it.word)}</p>${sayBtn(it.word)}</div>
        <p class="wk-th">${esc(it.th)}</p>
        <p class="wk-chips">${it.level ? `<span class="wk-chip tv-cefr">${esc(it.level)}</span>` : ''}<span class="wk-chip">${esc(POS_TH[it.pos] || it.pos)}</span>
          ${it.progress && it.progress.mastered ? `<span class="wk-chip is-ok">${ICON('circle-check', 'icon icon-sm')} จำได้แล้ว</span>` : ''}</p>
        <div class="wk-ex"><p lang="en">${esc(it.example)} ${sayBtn(it.example, 'ประโยคตัวอย่าง')}</p><small>${esc(it.exampleTH)}</small></div></li>`;
    const startBtn = `<div class="wk-actions"><button class="btn btn-primary wk-start" type="button" data-tv-quiz="${esc(c.id)}">${ICON('play', 'icon icon-sm')} ฝึก 10 ข้อ</button></div>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tv-hub>${ICON('arrow-left', 'icon icon-sm')} คำศัพท์ตามเทศกาล</button>
      <header class="wk-hero tv-hero is-${esc(c.festival)}"><p class="gl-kicker">${ICON(c.icon, 'icon icon-sm')} <span lang="en">${esc(c.en)}</span> · ${esc(c.dateTH)}</p>
        <h1 class="page-title" id="tv-ctitle">คำศัพท์${esc(c.th)}${c.level === 'hard' ? ' <span class="tv-nowrap">· ระดับยาก</span>' : ''}</h1>
        ${(c.levels || []).length > 1 ? `<div class="tv-levels" role="group" aria-label="ระดับความยาก">${c.levels.map((l) => `<button type="button" class="tv-lvbtn${l.id === c.id ? ' is-on' : ''}" data-tv-cat="${esc(l.id)}" aria-pressed="${l.id === c.id}">${esc(l.levelTH)} <small>${esc(l.cefr)}</small></button>`).join('')}</div>` : ''}
        <p class="gl-sub">${c.total} คำ · จำได้แล้ว ${c.mastered} · กดลำโพงเพื่อฟังเสียง</p></header>
      ${startBtn}
      <ol class="wk-items tv-items">${c.items.map(item).join('')}</ol>
      ${startBtn}`;
    focusTitle('tv-ctitle');
  }

  /* ----------------------------- แบบฝึก ----------------------------- */
  async function startQuiz(id) {
    try { const s = await App().api(`/theme-vocab/categories/${encodeURIComponent(id)}/quiz`, { method: 'POST', body: {} }); quiz = { s, i: 0, fb: null }; renderQ(); }
    catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }
  function promptHtml(q) {
    if (q.type === 'meaning') {
      return `<p class="wk-qlabel">ทายความหมาย — คำนี้แปลว่าอะไร</p>
        <p class="tv-word"><span lang="en">${esc(q.prompt)}</span> ${sayBtn(q.prompt)}</p>${q.pos ? `<p class="wk-chips">${q.level ? `<span class="wk-chip tv-cefr">${esc(q.level)}</span>` : ''}<span class="wk-chip">${esc(POS_TH[q.pos] || q.pos)}</span></p>` : ''}`;
    }
    if (q.type === 'reverse') return `<p class="wk-qlabel">เลือกคำภาษาอังกฤษที่ตรงกับความหมาย</p><p class="tv-word tv-th">${esc(q.prompt)}</p>`;
    return `<p class="wk-qlabel">เติมคำให้ประโยคสมบูรณ์</p><p class="wk-cloze" lang="en">${esc(q.prompt).replace('___', '<span class="wk-blank" aria-label="ช่องว่าง">_____</span>')}</p>`;
  }
  function renderQ() {
    const { s, i, fb } = quiz; const q = s.questions[i];
    const enOpts = q.type !== 'meaning';
    const opt = (o, k) => {
      let cls = '';
      if (fb) { if (k === fb.correctChoice) cls = ' is-right'; else if (k === q.selected) cls = ' is-wrong'; }
      return `<li><button class="wk-opt${cls}" type="button" data-tv-opt="${k}" ${fb ? 'disabled' : ''}${enOpts ? ' lang="en"' : ''}><span class="wk-opt-k">${'ABCDE'[k]}</span><span>${esc(o)}</span></button></li>`;
    };
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-tv-leave>${ICON('arrow-left', 'icon icon-sm')} ${esc(cat ? `คำศัพท์${cat.th}${cat.level === 'hard' ? ' · ระดับยาก' : ''}` : 'กลับ')}</button>
      <div class="wk-qtop"><b id="tv-qtitle">ข้อ ${i + 1} / ${s.total}</b><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${(i / s.total) * 100}%"></span></span></div>
      <section class="gl-card wk-q" aria-labelledby="tv-qtitle">${promptHtml(q)}<ul class="wk-opts">${q.options.map(opt).join('')}</ul>
        ${fb ? `<div class="wk-fb ${fb.correct ? 'is-right' : 'is-wrong'}" role="status"><b>${fb.correct ? `${ICON('circle-check', 'icon icon-sm')} ถูกต้อง` : `${ICON('circle-x', 'icon icon-sm')} ยังไม่ถูก — คำตอบคือ ${'ABCDE'[fb.correctChoice]}`}</b>
          <p><b lang="en">${esc(fb.word)}</b> = ${esc(fb.th)} <span class="wk-chip">${esc(POS_TH[fb.pos] || fb.pos)}</span></p>
          <p class="wk-fb-ex" lang="en">${esc(fb.example)} ${sayBtn(fb.example, 'ประโยคตัวอย่าง')}</p><small>${esc(fb.exampleTH)}</small></div>
          <button class="btn btn-primary wk-next" type="button" data-tv-next>${i + 1 < s.total ? 'ข้อต่อไป' : 'ดูผล'} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
      </section>`;
    focusTitle('tv-qtitle');
  }
  async function choose(k) {
    const { s, i } = quiz;
    try {
      const r = await App().api(`/theme-vocab/quiz/${s.id}/answer`, { method: 'POST', body: { k: s.questions[i].k, choice: k } });
      s.questions[i].selected = k; quiz.fb = r; renderQ();
      const nx = root().querySelector('[data-tv-next]'); if (nx) nx.focus();
    } catch (err) { App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ', 'error'); }
  }
  async function showResult() {
    let r;
    try { r = await App().api(`/theme-vocab/quiz/${quiz.s.id}/finish`, { method: 'POST', body: {} }); } catch (err) { App().toast(err.message, 'error'); return; }
    const p = pct(r.score, r.total);
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-tv-back-cat>${ICON('arrow-left', 'icon icon-sm')} ${esc(cat ? `คำศัพท์${cat.th}${cat.level === 'hard' ? ' · ระดับยาก' : ''}` : 'กลับ')}</button>
      <header class="tq-res-hero"><p class="gl-kicker">${ICON('sparkles', 'icon icon-sm')} คำศัพท์ตามเทศกาล</p>
        <h1 class="page-title" id="tv-rtitle">${p >= 80 ? 'เยี่ยมมาก!' : p >= 50 ? 'ดีแล้ว ฝึกต่ออีกนิด' : 'ลองทบทวนคำศัพท์อีกรอบ'}</h1>
        <div class="tq-score"><b>${r.score}</b><span>/ ${r.total}</span></div>
        <p class="tq-score-label">จำได้แล้ว ${r.mastered}/${r.categoryTotal} คำในหมวดนี้</p></header>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-tv-back-cat>${ICON('book-open', 'icon icon-sm')} ทบทวนคำศัพท์</button>
        <button class="btn btn-primary" type="button" data-tv-quiz="${esc(r.category)}">${ICON('refresh-cw', 'icon icon-sm')} ฝึกอีกชุด</button></div>`;
    quiz = null;
    focusTitle('tv-rtitle');
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    // ทางเข้าจากเส้นทางการเรียน (นอกหน้าหมวด)
    let b = t.closest('[data-tv-open]');
    if (b) { if (b.dataset.tvOpen) openCategory(b.dataset.tvOpen); else openHub(); return; }
    if (!t.closest('#screen-themes')) return;
    b = t.closest('[data-tv-say]');
    if (b) { say(b.dataset.tvSay); return; }
    b = t.closest('[data-tv-nav]');
    if (b) { App().navigateTo(b.dataset.tvNav); return; }
    if (t.closest('[data-tv-hub]')) { openHub(); return; }
    b = t.closest('[data-tv-cat]');
    if (b) { openCategory(b.dataset.tvCat); return; }
    b = t.closest('[data-tv-quiz]');
    if (b) { b.disabled = true; startQuiz(b.dataset.tvQuiz).finally(() => { b.disabled = false; }); return; }
    b = t.closest('[data-tv-opt]');
    if (b && quiz && !quiz.fb) { choose(Number(b.dataset.tvOpt)); return; }
    if (t.closest('[data-tv-next]') && quiz) { if (quiz.i + 1 < quiz.s.total) { quiz.i += 1; quiz.fb = null; renderQ(); } else showResult(); return; }
    if (t.closest('[data-tv-leave]') || t.closest('[data-tv-back-cat]')) { if (cat) openCategory(cat.id); else openHub(); }
  });

  window.EQThemeVocab = { open: (param) => (param ? openCategory(decodeURIComponent(param)) : openHub()), _state: () => ({ cat, quiz }) };
})();
