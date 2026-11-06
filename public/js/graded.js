/* =====================================================================
   Graded Reading & Listening (v1.10.0 Phase 5) — window.EQGraded
     #/graded                     เรื่องสั้นตามระดับ A1–B2 (เลือกระดับ · อ่าน / ฟัง · ความคืบหน้า)
     #/graded/<id>/reading        อ่าน: เนื้อเรื่อง + คำศัพท์ (แตะดูคำแปล) + แปลไทยทีละย่อหน้า + ฟังอ่านตาม (ไฮไลต์ย่อหน้า) → คำถาม
     #/graded/<id>/listening      ฟัง: ไม่เห็นเนื้อเรื่องจนกว่าจะส่งคำตอบ · ปรับความเร็ว · ฟังซ้ำได้ → เฉลย + บทถอดความ + หลักฐาน
   ตรวจคำตอบที่เซิร์ฟเวอร์ (/api/graded) · ทุกข้อความผ่าน esc()
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-graded-root');
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const KIND_TH = { story: 'เรื่องสั้น', email: 'อีเมล', blog: 'บล็อก', article: 'บทความ', dialogue: 'บทสนทนา' };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* โหมดส่วนตัว */ } };
  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  const loading = (el) => { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; };
  const errorBox = (el, err) => { el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p></div>`; };
  let level = lsGet('eq_graded_level') || 'A1';
  let T = null;   // เรื่องที่เปิดอยู่
  let audio = null;

  function stopAudio() { if (audio) { audio.pause(); audio = null; } }

  /* ----------------------------- หน้ารวม ----------------------------- */
  async function openHub() {
    stopAudio(); T = null;
    setHash('#/graded'); App().showScreen('screen-graded');
    const el = root(); loading(el);
    let d;
    try { d = await App().api('/graded'); } catch (err) { errorBox(el, err); return; }
    const badge = (p, label, icon) => (p ? `<span class="gr-badge ${p.passed ? 'is-pass' : ''}">${ICON(p.passed ? 'circle-check' : icon, 'icon icon-sm')} ${label} ${p.best}/${p.total}</span>` : '');
    const lv = d.levels.find((x) => x.level === level) || d.levels[0];
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gr-nav="learn">${ICON('arrow-left', 'icon icon-sm')} เส้นทางการเรียน</button>
      <header class="tq-hero"><p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} Graded Reading &amp; Listening</p>
        <h1 class="page-title" id="gr-title">อ่าน &amp; ฟังเรื่องสั้นตามระดับ</h1>
        <p class="gl-sub">เรื่องสั้นภาษาอังกฤษ A1–B2 เขียนขึ้นใหม่สำหรับผู้เรียนไทย — อ่านพร้อมคำศัพท์และคำแปล หรือฝึกฟังแล้วตอบคำถาม · ผ่าน ${d.exp.passPercent}% ได้ ${d.exp.perText} EXP ต่อเรื่องต่อโหมด</p>
        <p class="gr-progress">${ICON('chart-column', 'icon icon-sm')} อ่านผ่าน ${d.done.reading}/${d.done.total} · ฟังผ่าน ${d.done.listening}/${d.done.total}</p></header>
      <div class="vd-seg gr-levels" role="group" aria-label="ระดับ">${LEVELS.map((l) => `<button type="button" class="vd-seg-btn${l === lv.level ? ' active' : ''}" aria-pressed="${l === lv.level}" data-gr-level="${l}">${l}</button>`).join('')}</div>
      <ul class="gr-list">${lv.texts.map((t) => `<li class="gl-card gr-card">
          <div class="gr-card-head"><b>${esc(t.title)}</b><span>${esc(t.titleTh)}</span>
            <small>${esc(KIND_TH[t.kind] || t.kind)} · ${t.words} คำ · ฟัง ~${t.minutes} นาที · ${t.questions} คำถาม</small></div>
          <div class="gr-badges">${badge(t.reading, 'อ่าน', 'book-open')}${badge(t.listening, 'ฟัง', 'headphones')}</div>
          <div class="gr-card-actions">
            <button class="btn btn-primary" type="button" data-gr-open="${esc(t.id)}" data-mode="reading">${ICON('book-open', 'icon icon-sm')} อ่าน</button>
            <button class="btn btn-secondary" type="button" data-gr-open="${esc(t.id)}" data-mode="listening">${ICON('headphones', 'icon icon-sm')} ฟัง</button>
          </div></li>`).join('')}</ul>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} เนื้อหาเขียนขึ้นใหม่ทั้งหมด (ไม่ได้คัดลอกจากหนังสือเรียน) · เสียงอ่านสร้างล่วงหน้าด้วย TTS · คำตอบตรวจที่เซิร์ฟเวอร์</p>`;
    focusTitle('gr-title');
  }

  /* ----------------------------- เนื้อเรื่อง ----------------------------- */
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** ย่อหน้า → HTML: คำศัพท์ (ครั้งแรก) เป็นปุ่มแตะดูคำแปล · บทสนทนาขึ้นบรรทัดใหม่ + ชื่อผู้พูดตัวหนา · ไฮไลต์หลักฐาน */
  function paraHtml(text, glossary, used, marks = []) {
    let h = esc(text);
    for (const m of marks) {
      const e = esc(m);
      if (e && h.includes(e)) h = h.replace(e, `\u0001${e}\u0002`);
    }
    for (const g of glossary || []) {
      if (used.has(g.word)) continue;
      const re = new RegExp(`(^|[^A-Za-z])(${reEsc(esc(g.word))})(?=[^A-Za-z]|$)`, 'i');
      if (re.test(h)) {
        used.add(g.word);
        h = h.replace(re, (all, pre, w) => `${pre}<button type="button" class="gr-gl" data-th="${esc(g.th)}" aria-label="${w}: ${esc(g.th)}">${w}</button>`);
      }
    }
    h = h.replace(/\u0001/g, '<mark class="gr-ev">').replace(/\u0002/g, '</mark>');
    return h.split('\n').map((ln) => ln.replace(/^([A-Z][A-Za-z .'-]{0,24}):\s/, '<b class="gr-sp">$1:</b> ')).join('<br>');
  }
  function textHtml(t, marks = []) {
    const used = new Set();
    return `<div class="gr-text" lang="en">${t.paragraphs.map((p, k) => `<div class="gr-p" data-k="${k}"><p>${paraHtml(p, t.glossary, used, marks)}</p>
        <p class="gr-th hidden" lang="th">${esc((t.translationTH || [])[k] || '')}</p></div>`).join('')}</div>
      ${t.glossary && t.glossary.length ? `<section class="gr-glossary" aria-labelledby="gr-gh"><h2 class="tq-h2" id="gr-gh">${ICON('book-open', 'icon icon-sm')} คำศัพท์ในเรื่อง</h2>
        <ul>${t.glossary.map((g) => `<li><b lang="en">${esc(g.word)}</b> <small>${esc(g.pos)}</small> <span>${esc(g.th)}</span></li>`).join('')}</ul></section>` : ''}`;
  }
  function audioHtml(t, listening) {
    return `<section class="gl-card gr-audio" aria-label="เสียงอ่าน">
        <button class="btn btn-primary gr-play" type="button" data-gr-play>${ICON('play', 'icon icon-sm')} <span>${listening ? 'ฟังเรื่อง' : 'ฟังอ่านตาม'}</span></button>
        <div class="gr-speed" role="group" aria-label="ความเร็ว">${[0.8, 1].map((r) => `<button type="button" class="vd-seg-btn${r === 1 ? ' active' : ''}" aria-pressed="${r === 1}" data-gr-rate="${r}">${r === 1 ? 'ปกติ' : 'ช้า'}</button>`).join('')}</div>
        <div class="gr-bar" aria-hidden="true"><span id="gr-bar-fill"></span></div>
        <small id="gr-time">0:00 / ${Math.floor(t.audio.duration / 60)}:${String(Math.round(t.audio.duration % 60)).padStart(2, '0')}</small>
      </section>`;
  }
  function questionsHtml(t) {
    return `<form class="gl-card gr-quiz" id="gr-quiz" novalidate aria-labelledby="gr-qh"><h2 class="tq-h2" id="gr-qh">${ICON('circle-help', 'icon icon-sm')} คำถาม (${t.questions.length} ข้อ)</h2>
      ${t.questions.map((q) => `<fieldset class="ta-q" data-q="${q.i}"><legend lang="en">${q.i + 1}. ${esc(q.stem)}</legend>
        ${q.options.map((o, k) => `<label class="ta-opt"><input type="radio" name="gr-q${q.i}" value="${k}"> <span lang="en">${esc(o)}</span></label>`).join('')}
        <p class="ta-why" id="gr-why-${q.i}" aria-live="polite"></p></fieldset>`).join('')}
      <div class="gl-actions"><button class="btn btn-primary" type="submit">${ICON('check', 'icon icon-sm')} ส่งคำตอบ</button></div>
      <p class="ta-result" id="gr-result" aria-live="polite"></p></form>`;
  }
  async function openText(id, mode) {
    stopAudio();
    mode = mode === 'listening' ? 'listening' : 'reading';
    setHash(`#/graded/${encodeURIComponent(id)}/${mode}`); App().showScreen('screen-graded');
    const el = root(); loading(el);
    try { T = await App().api(`/graded/${encodeURIComponent(id)}?mode=${mode}`); } catch (err) { errorBox(el, err); return; }
    const listening = mode === 'listening';
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gr-nav="graded">${ICON('arrow-left', 'icon icon-sm')} เรื่องทั้งหมด</button>
      <header class="tq-hero"><p class="gl-kicker">${ICON(listening ? 'headphones' : 'book-open', 'icon icon-sm')} ${esc(T.level)} · ${esc(KIND_TH[T.kind] || T.kind)} · ${listening ? 'ฝึกฟัง' : 'ฝึกอ่าน'}</p>
        <h1 class="page-title" id="gr-ttitle" lang="en">${esc(T.title)}</h1><p class="gl-sub">${esc(T.titleTh)}${T.best ? ` · คะแนนดีที่สุด ${T.best.best}/${T.best.total}` : ''}</p></header>
      ${audioHtml(T, listening)}
      ${listening ? `<p class="gr-listen-note">${ICON('info', 'icon icon-sm')} ฟังได้หลายรอบ เนื้อเรื่องจะแสดงหลังส่งคำตอบ · เคล็ดลับ: อ่านคำถามก่อนฟัง รอบแรกจับใจความว่าใคร ทำอะไร เกิดอะไรขึ้น รอบสองฟังหารายละเอียดที่คำถามถาม</p>`
        : `<div class="gr-tools"><button class="btn btn-secondary" type="button" data-gr-th>${ICON('languages', 'icon icon-sm')} <span>แสดงคำแปลไทย</span></button><small>แตะคำที่ขีดเส้นใต้เพื่อดูความหมาย</small></div>
           <div id="gr-body">${textHtml(T)}</div><p class="gr-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(T.tipTH)}</p>`}
      ${listening ? '<div id="gr-body"></div>' : ''}
      ${questionsHtml(T)}
      <div class="gl-actions gr-after hidden" id="gr-after">
        <button class="btn btn-primary" type="button" data-gr-open="${esc(T.id)}" data-mode="${listening ? 'reading' : 'listening'}">${ICON(listening ? 'book-open' : 'headphones', 'icon icon-sm')} ${listening ? 'อ่านเรื่องนี้' : 'ลองฝึกฟังเรื่องนี้'}</button>
        <button class="btn btn-secondary" type="button" data-gr-nav="graded">เรื่องอื่น</button></div>`;
    focusTitle('gr-ttitle');
  }

  /* ----------------------------- เสียง ----------------------------- */
  function fmt(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function togglePlay(btn) {
    if (!T) return;
    if (!audio) {
      audio = new Audio(T.audio.url);
      const rateBtn = document.querySelector('[data-gr-rate].active');
      audio.playbackRate = rateBtn ? Number(rateBtn.dataset.grRate) : 1;
      audio.addEventListener('timeupdate', () => {
        const fill = document.getElementById('gr-bar-fill'); const tm = document.getElementById('gr-time');
        if (fill) fill.style.width = `${Math.min(100, (audio.currentTime / (audio.duration || T.audio.duration)) * 100)}%`;
        if (tm) tm.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || T.audio.duration)}`;
        const seg = T.audio.segments.find((s) => audio.currentTime >= s.start && audio.currentTime <= s.end + 0.3);
        document.querySelectorAll('.gr-p').forEach((p) => p.classList.toggle('is-reading', Boolean(seg) && Number(p.dataset.k) === seg.k));
      });
      audio.addEventListener('ended', () => { setPlayLabel(false); document.querySelectorAll('.gr-p.is-reading').forEach((p) => p.classList.remove('is-reading')); });
      audio.addEventListener('error', () => { App().toast('เล่นเสียงไม่สำเร็จ ลองใหม่อีกครั้ง', 'error'); setPlayLabel(false); audio = null; });
    }
    if (audio.paused) { if (window.EQAudio) window.EQAudio.duck(true); audio.play().catch(() => {}); setPlayLabel(true); }
    else { audio.pause(); setPlayLabel(false); }
    void btn;
  }
  function setPlayLabel(playing) {
    const b = document.querySelector('[data-gr-play]'); if (!b) return;
    b.innerHTML = `${ICON(playing ? 'pause' : 'play', 'icon icon-sm')} <span>${playing ? 'หยุด' : 'ฟังต่อ'}</span>`;
    if (!playing && window.EQAudio) window.EQAudio.duck(false);
  }

  /* ----------------------------- ส่งคำตอบ ----------------------------- */
  async function submit(form) {
    const answers = T.questions.map((q) => { const x = form.querySelector(`input[name="gr-q${q.i}"]:checked`); return x ? Number(x.value) : null; });
    if (answers.some((a) => a === null)) { App().toast(`ตอบให้ครบ ${T.questions.length} ข้อก่อน`, 'info'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await App().api(`/graded/${encodeURIComponent(T.id)}/submit`, { method: 'POST', body: { mode: T.mode, answers } });
      r.results.forEach((x) => {
        form.querySelectorAll(`input[name="gr-q${x.i}"]`).forEach((inp) => {
          const lab = inp.closest('.ta-opt'); inp.disabled = true;
          lab.classList.toggle('is-right', Number(inp.value) === x.answer);
          lab.classList.toggle('is-wrong', Number(inp.value) === x.chosen && !x.correct);
        });
        const why = document.getElementById(`gr-why-${x.i}`);
        why.innerHTML = `${x.correct ? ICON('circle-check', 'icon icon-sm') : ICON('circle-x', 'icon icon-sm')} <span>${esc(x.explanationTH)}<br><small lang="en">“${esc(x.evidence)}”</small></span>`;
        why.className = `ta-why ${x.correct ? 'is-right' : 'is-wrong'}`;
      });
      btn.classList.add('hidden');
      const expTxt = r.exp > 0 ? ` · +${r.exp} EXP` : r.capped ? ' · ครบเพดาน EXP ของวันนี้แล้ว' : '';
      document.getElementById('gr-result').textContent = `ถูก ${r.score}/${r.total}${r.passed ? ' — ผ่าน' : ' — อ่านคำอธิบายแล้วลองใหม่ได้'}${expTxt}`;
      // เปิดเนื้อเรื่อง (โหมดฟัง) + ไฮไลต์หลักฐานของทุกข้อ
      const body = document.getElementById('gr-body');
      body.innerHTML = `${T.mode === 'listening' ? `<h2 class="tq-h2 gr-tr-h">${ICON('file-text', 'icon icon-sm')} บทถอดความ</h2>` : ''}${textHtml({ ...T, ...r }, r.results.map((x) => x.evidence))}${T.mode === 'listening' && r.tipTH ? `<p class="gr-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(r.tipTH)}</p>` : ''}`;
      body.querySelectorAll('.gr-th').forEach((p) => p.classList.remove('hidden'));
      document.getElementById('gr-after').classList.remove('hidden');
      if (r.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
    } catch (err) { btn.disabled = false; App().toast(err.message, 'error'); }
  }

  /* ----------------------------- เหตุการณ์ ----------------------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gr-nav], [data-gr-level], [data-gr-open], [data-gr-play], [data-gr-rate], [data-gr-th], .gr-gl');
    if (!t) return;
    if (t.dataset.grNav) { stopAudio(); App().navigateTo(t.dataset.grNav); return; }
    if (t.dataset.grLevel) { level = t.dataset.grLevel; lsSet('eq_graded_level', level); openHub(); return; }
    if (t.dataset.grOpen) { openText(t.dataset.grOpen, t.dataset.mode); return; }
    if (t.hasAttribute('data-gr-play')) { togglePlay(t); return; }
    if (t.dataset.grRate) {
      document.querySelectorAll('[data-gr-rate]').forEach((b) => { const on = b === t; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
      if (audio) audio.playbackRate = Number(t.dataset.grRate);
      return;
    }
    if (t.hasAttribute('data-gr-th')) {
      const show = document.querySelector('.gr-th.hidden') !== null;
      document.querySelectorAll('.gr-th').forEach((p) => p.classList.toggle('hidden', !show));
      t.querySelector('span').textContent = show ? 'ซ่อนคำแปล' : 'แสดงคำแปลไทย';
      return;
    }
    if (t.classList.contains('gr-gl')) {
      const open = t.nextElementSibling && t.nextElementSibling.classList.contains('gr-gl-th');
      document.querySelectorAll('.gr-gl-th').forEach((x) => x.remove());
      if (!open) t.insertAdjacentHTML('afterend', `<span class="gr-gl-th" lang="th" role="note">${esc(t.dataset.th)}</span>`);
    }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'gr-quiz') { e.preventDefault(); submit(e.target); } });
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/graded')) stopAudio(); });

  window.EQGraded = {
    open: (param) => {
      const [id, mode] = String(param || '').split('/');
      return id ? openText(decodeURIComponent(id), mode) : openHub();
    },
    _state: () => T,
  };
}());
