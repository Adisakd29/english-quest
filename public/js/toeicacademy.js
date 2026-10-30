/* =====================================================================
   TOEIC Academy + คะแนนคาดการณ์ (v1.10.0 Phase 4) — window.EQToeicAcademy
     #/toeic-academy        รายการบทเรียนกลยุทธ์ 7 Part + รูปแบบข้อสอบจริง
     #/toeic-academy/<n>    บทเรียน Part n: รูปแบบ · ชนิดคำถาม · กับดัก · ขั้นตอน · เวลา · วลี · เช็กความเข้าใจ 3 ข้อ → ไปฝึก
     mountPredict(el)       การ์ดคะแนนคาดการณ์บนหน้า TOEIC (จากคำตอบครั้งแรกของแต่ละข้อ)
   ข้อมูลจาก /api/toeic/academy · /api/toeic/predict · ทุกข้อความผ่าน esc() · ไม่ให้ EXP/Coin
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-toeicacademy-root');
  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  const loading = (el) => { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; };
  const errorBox = (el, err) => { el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p></div>`; };
  const back = (to, label) => `<button class="game-exit gl-back" type="button" data-ta-nav="${to}">${ICON('arrow-left', 'icon icon-sm')} ${esc(label)}</button>`;
  let L = null;   // บทเรียนที่เปิดอยู่

  /* ----------------------------- รายการบทเรียน ----------------------------- */
  async function openList() {
    setHash('#/toeic-academy'); App().showScreen('screen-toeicacademy');
    const el = root(); loading(el);
    let d;
    try { d = await App().api('/toeic/academy'); } catch (err) { errorBox(el, err); return; }
    const card = (l) => `<li><button class="tq-part ta-card${l.done ? ' is-done' : ''}" type="button" data-ta-part="${l.part}">
        <span class="tq-part-no">${l.part}</span>
        <span class="tq-part-text"><b>${esc(l.title)}</b><small>${esc(l.titleTh)} · ${l.format.questions} ข้อ · ${esc(l.format.minutes)} นาที</small>
          <small>${esc(l.summaryTh)}</small></span>
        ${l.done ? `<span class="ta-done">${ICON('circle-check', 'icon icon-sm')} เรียนแล้ว ${l.checkScore}/3</span>` : ICON('chevron-right', 'icon icon-sm')}</button></li>`;
    el.innerHTML = `${back('toeic', 'TOEIC')}
      <header class="tq-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} TOEIC Academy</p>
        <h1 class="page-title" id="ta-title">กลยุทธ์ทำข้อสอบทีละ Part</h1>
        <p class="gl-sub">รู้รูปแบบข้อสอบจริง ชนิดคำถาม กับดักที่เจอบ่อย และขั้นตอนทำ — แล้วไปฝึกกับโจทย์จริงของแต่ละ Part</p></header>
      <section class="gl-card ta-exam" aria-label="รูปแบบข้อสอบ"><b>${d.exam.questions} ข้อ · ${d.exam.minutes} นาที</b>
        <span>Listening ~${d.exam.listeningMinutes} นาที (Part 1–4) · Reading ${d.exam.readingMinutes} นาที (Part 5–7)</span>
        <span>เรียนแล้ว ${d.doneCount}/${d.total} บท</span></section>
      <section class="tq-section" aria-labelledby="ta-l"><h2 class="tq-h2" id="ta-l">${ICON('headphones', 'icon icon-sm')} Listening</h2>
        <ul class="tq-parts">${d.lessons.filter((l) => l.section === 'listening').map(card).join('')}</ul></section>
      <section class="tq-section" aria-labelledby="ta-r"><h2 class="tq-h2" id="ta-r">${ICON('book-open', 'icon icon-sm')} Reading</h2>
        <ul class="tq-parts">${d.lessons.filter((l) => l.section === 'reading').map(card).join('')}</ul></section>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} เนื้อหาเขียนขึ้นเองสำหรับ EnglishQuest ไม่ใช่เอกสารของ ETS · ตัวอย่างทั้งหมดเป็นของต้นฉบับ</p>`;
    focusTitle('ta-title');
  }

  /* ----------------------------- บทเรียน ----------------------------- */
  async function openLesson(part) {
    setHash(`#/toeic-academy/${part}`); App().showScreen('screen-toeicacademy');
    const el = root(); loading(el);
    try { L = await App().api(`/toeic/academy/${encodeURIComponent(part)}`); } catch (err) { errorBox(el, err); return; }
    el.innerHTML = `${back('toeic-academy', 'TOEIC Academy')}
      <header class="tq-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} ${esc(L.section === 'listening' ? 'Listening' : 'Reading')} · Part ${L.part}</p>
        <h1 class="page-title" id="ta-ltitle">${esc(L.title)}</h1><p class="gl-sub">${esc(L.titleTh)} — ${esc(L.summaryTh)}</p></header>
      <section class="gl-card ta-format" aria-labelledby="ta-f"><h2 class="tq-h2" id="ta-f">${ICON('list-checks', 'icon icon-sm')} ในข้อสอบจริง</h2>
        <p><b>${L.format.questions} ข้อ</b> · ประมาณ ${esc(L.format.minutes)} นาที</p><p>${esc(L.format.howTh)}</p></section>
      <section class="gl-card" aria-labelledby="ta-t"><h2 class="tq-h2" id="ta-t">${ICON('layers', 'icon icon-sm')} ชนิดคำถาม</h2>
        <ul class="ta-list">${L.types.map((t) => `<li><b lang="en">${esc(t.name)}</b><span>${esc(t.th)}</span>${t.example ? `<em lang="en">${esc(t.example)}</em>` : ''}</li>`).join('')}</ul></section>
      <section class="gl-card ta-traps" aria-labelledby="ta-tr"><h2 class="tq-h2" id="ta-tr">${ICON('circle-alert', 'icon icon-sm')} กับดักที่พบบ่อย</h2>
        <ul class="ta-list">${L.traps.map((t) => `<li><b lang="en">${esc(t.name)}</b><span>${esc(t.th)}</span>${t.example ? `<em>${esc(t.example)}</em>` : ''}</li>`).join('')}</ul></section>
      <section class="gl-card" aria-labelledby="ta-s"><h2 class="tq-h2" id="ta-s">${ICON('target', 'icon icon-sm')} ขั้นตอนทำทีละข้อ</h2>
        <ol class="ta-steps">${L.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p class="ta-time">${ICON('clock', 'icon icon-sm')} ${esc(L.timingTh)}</p></section>
      <section class="gl-card" aria-labelledby="ta-p"><h2 class="tq-h2" id="ta-p">${ICON('book-open', 'icon icon-sm')} คำ/วลีที่เจอบ่อย</h2>
        <ul class="ta-phrases">${L.phrases.map((p) => `<li><b lang="en">${esc(p.en)}</b><span>${esc(p.th)}</span></li>`).join('')}</ul></section>
      <form class="gl-card ta-check" id="ta-check" aria-labelledby="ta-c" novalidate><h2 class="tq-h2" id="ta-c">${ICON('circle-help', 'icon icon-sm')} เช็กความเข้าใจ (3 ข้อ)</h2>
        ${L.check.map((c, i) => `<fieldset class="ta-q"><legend>${i + 1}. ${esc(c.q)}</legend>
          ${c.options.map((o, k) => `<label class="ta-opt"><input type="radio" name="ta-q${i}" value="${k}"> <span>${esc(o)}</span></label>`).join('')}
          <p class="ta-why" id="ta-why-${i}" aria-live="polite"></p></fieldset>`).join('')}
        <div class="gl-actions"><button class="btn btn-primary" type="submit">${ICON('check', 'icon icon-sm')} ตรวจคำตอบ</button></div>
        <p class="ta-result" id="ta-result" aria-live="polite"></p></form>
      <div class="gl-actions ta-next">
        <button class="btn btn-primary" type="button" data-ta-nav="${esc(L.nav)}">${ICON('play', 'icon icon-sm')} ไปฝึก Part ${L.part}</button>
        ${L.next ? `<button class="btn btn-secondary" type="button" data-ta-part="${L.next}">บทถัดไป: Part ${L.next} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
      </div>`;
    focusTitle('ta-ltitle');
  }
  async function submitCheck(form) {
    const answers = L.check.map((_, i) => { const x = form.querySelector(`input[name="ta-q${i}"]:checked`); return x ? Number(x.value) : null; });
    if (answers.some((a) => a === null)) { App().toast('ตอบให้ครบ 3 ข้อก่อน', 'info'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await App().api(`/toeic/academy/${L.part}/check`, { method: 'POST', body: { answers } });
      r.results.forEach((x, i) => {
        form.querySelectorAll(`input[name="ta-q${i}"]`).forEach((inp) => {
          const lab = inp.closest('.ta-opt');
          lab.classList.toggle('is-right', Number(inp.value) === x.answer);
          lab.classList.toggle('is-wrong', Number(inp.value) === x.chosen && !x.correct);
        });
        const why = document.getElementById(`ta-why-${i}`);
        why.innerHTML = `${x.correct ? ICON('circle-check', 'icon icon-sm') : ICON('circle-x', 'icon icon-sm')} ${esc(x.whyTh)}`;
        why.className = `ta-why ${x.correct ? 'is-right' : 'is-wrong'}`;
      });
      document.getElementById('ta-result').textContent = `ถูก ${r.score}/${r.total} — บันทึกว่าเรียนบทนี้แล้ว${r.score < r.total ? ' (อ่านคำอธิบายแล้วลองใหม่ได้)' : ''}`;
    } catch (err) { App().toast(err.message, 'error'); } finally { btn.disabled = false; }
  }

  /* ----------------------------- คะแนนคาดการณ์ ----------------------------- */
  async function mountPredict(el) {
    if (!el) return;
    let d;
    try { d = await App().api('/toeic/predict'); } catch (_) { el.innerHTML = ''; return; }
    const sec = (s, th) => (s.ready
      ? `<div class="pmd-tile ta-score"><span>${th}</span><b>${s.score}</b><small>ช่วง ${s.low}–${s.high} · CEFR ~${esc(s.cefr)} · จาก ${s.answered} ข้อ</small></div>`
      : `<div class="pmd-tile ta-score is-wait"><span>${th}</span><b>–</b><small>ทำข้อใหม่อีก ${s.need} ข้อเพื่อเริ่มประเมิน</small></div>`);
    el.innerHTML = `<section class="gl-card ta-predict" aria-labelledby="ta-pr"><h2 class="tq-h2" id="ta-pr">${ICON('chart-column', 'icon icon-sm')} คะแนนคาดการณ์จากการฝึก</h2>
      <div class="ta-scores">${sec(d.listening, 'Listening')}${sec(d.reading, 'Reading')}
        <div class="pmd-tile ta-score"><span>รวม</span><b>${d.total ? d.total.score : '–'}</b><small>${d.total ? `ช่วง ${d.total.low}–${d.total.high} (เต็ม 990)` : 'ต้องมีทั้งสองด้าน'}</small></div></div>
      ${d.tips.length ? `<ul class="ta-tips">${d.tips.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${d.latestMock ? `<p class="gl-note">Full Mock ล่าสุด: Listening ${d.latestMock.listening ?? '–'} · Reading ${d.latestMock.reading ?? '–'}</p>` : ''}
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(d.note)}</p></section>
      <button class="tq-mode ta-academy-card" type="button" data-ta-nav="toeic-academy">${ICON('graduation-cap', 'icon')}<b>TOEIC Academy</b>
        <small>กลยุทธ์ทำข้อสอบทีละ Part: รูปแบบจริง · ชนิดคำถาม · กับดัก · ขั้นตอนทำ · การคุมเวลา</small></button>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ta-nav], [data-ta-part]');
    if (!t) return;
    if (t.dataset.taPart) { openLesson(t.dataset.taPart); return; }
    App().navigateTo(t.dataset.taNav);
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'ta-check') { e.preventDefault(); submitCheck(e.target); } });

  window.EQToeicAcademy = { open: (part) => (part ? openLesson(part) : openList()), mountPredict, _state: () => L };
}());
