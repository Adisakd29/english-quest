/* =====================================================================
   เครื่องมือเรียนแบบไม่ใช้ AI (v1.10.0 Phase 3) — window.EQStudio
     #/write   Writing Studio: เขียนอิสระ → ตรวจไวยากรณ์ตามกฎ · ระดับคำศัพท์ CEFR · คำเชื่อม · คำซ้ำ · คำแนะนำภาษาไทย
     #/help    ผู้ช่วยค้นคำตอบ: คำถามที่พบบ่อย · หัวข้อไวยากรณ์ · คำศัพท์ (อังกฤษ↔ไทย)
   ฟรีทุกคน · ไม่มีค่าโทเค็น · ไม่เก็บข้อความ/คำถาม (เก็บแค่สถิติการตรวจงานเขียน) · ทุกข้อความผ่าน esc()
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  const loading = (el) => { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; };
  const back = `<button class="game-exit gl-back" type="button" data-st-nav="grammar">${ICON('arrow-left', 'icon icon-sm')} หลักสูตรแกรมม่า</button>`;
  const DRAFT = 'eq_studio_draft';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* โหมดส่วนตัว */ } };

  /* ============================ Writing Studio ============================ */
  let W = null;   // { home, prompt, result }
  async function openWrite() {
    setHash('#/write'); App().showScreen('screen-write');
    const el = document.getElementById('screen-write-root'); loading(el);
    let home;
    try { home = await App().api('/studio/writing'); } catch (err) { el.innerHTML = `<div class="gl-empty" role="alert"><p>${esc(err.message)}</p></div>`; return; }
    W = { home, prompt: null, result: null };
    renderWrite();
    focusTitle('st-w-title');
  }
  function promptChips(home) {
    return LEVELS.filter((l) => home.prompts[l]).map((l) => `<details class="st-pl"${l === 'A2' ? ' open' : ''}><summary>${esc(l)} · ${home.prompts[l].length} โจทย์</summary><ul>
      ${home.prompts[l].map((p) => `<li><button class="st-prompt${W.prompt && W.prompt.id === p.id ? ' is-on' : ''}" type="button" data-st-prompt="${esc(p.id)}">
        <b>${esc(p.th)}</b><span lang="en">${esc(p.en)}</span><small>อย่างน้อย ${p.min} คำ</small></button></li>`).join('')}</ul></details>`).join('');
  }
  function renderWrite() {
    const el = document.getElementById('screen-write-root');
    const h = W.home;
    const draft = lsGet(DRAFT) || '';
    el.innerHTML = `${back}
      <header class="st-hero"><p class="gl-kicker">${ICON('pencil-line', 'icon icon-sm')} ฟรี · ไม่ใช้ AI</p>
        <h1 class="page-title" id="st-w-title">Writing Studio</h1>
        <p class="gl-sub">เขียนภาษาอังกฤษอะไรก็ได้ แล้วรับคำแนะนำภาษาไทย: ข้อผิดไวยากรณ์ที่พบบ่อย · ระดับคำศัพท์ (CEFR) · คำเชื่อม · คำที่ใช้ซ้ำ</p>
        ${h.stats.checks ? `<p class="st-mystats">${ICON('chart-column', 'icon icon-sm')} ตรวจแล้ว ${h.stats.checks} ครั้ง · รวม ${h.stats.words.toLocaleString('th-TH')} คำ${h.stats.lastLevel ? ` · ระดับคำศัพท์ล่าสุด ${esc(h.stats.lastLevel)}` : ''}</p>` : ''}</header>
      <section class="gl-card st-prompts" aria-labelledby="st-p-h"><h2 class="tq-h2" id="st-p-h">${ICON('lightbulb', 'icon icon-sm')} เลือกโจทย์ (ไม่บังคับ)</h2>${promptChips(h)}</section>
      <form class="gl-card st-form" id="st-form" novalidate>
        ${W.prompt ? `<p class="st-cur">${ICON('target', 'icon icon-sm')} โจทย์: <b>${esc(W.prompt.th)}</b> — <span lang="en">${esc(W.prompt.en)}</span> <button class="tq-link" type="button" data-st-clear>ไม่ใช้โจทย์</button></p>` : ''}
        <label for="st-text" class="st-label">งานเขียนของคุณ (ภาษาอังกฤษ)</label>
        <textarea id="st-text" class="st-text" rows="9" maxlength="${h.maxLen}" spellcheck="false" lang="en" placeholder="Last weekend I went to …">${esc(draft)}</textarea>
        <div class="st-row"><span class="st-count" id="st-count" aria-live="polite"></span></div>
        <label for="st-targets" class="st-label">คำศัพท์ที่อยากฝึกใช้ (ไม่บังคับ · คั่นด้วย ,)</label>
        <input id="st-targets" class="st-input" type="text" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="delicious, journey">
        <div class="gl-actions"><button class="btn btn-primary" type="submit">${ICON('check', 'icon icon-sm')} ตรวจงานเขียน</button></div>
        <p class="st-privacy">${ICON('shield-check', 'icon icon-sm')} ตรวจในเซิร์ฟเวอร์ EnglishQuest ด้วยกฎภาษา ไม่ส่งให้ AI ภายนอก · ไม่เก็บข้อความ (เก็บแค่จำนวนคำ/ข้อผิด) · ร่างที่พิมพ์ค้างเก็บในเครื่องนี้เท่านั้น</p>
      </form>
      <div id="st-result" aria-live="polite"></div>`;
    const ta = el.querySelector('#st-text');
    const count = () => { const n = (ta.value.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length; el.querySelector('#st-count').textContent = `${n} คำ · ${ta.value.length}/${h.maxLen} ตัวอักษร`; };
    ta.addEventListener('input', () => { count(); lsSet(DRAFT, ta.value); });
    count();
    if (W.result) renderResult(W.result);
  }
  const LV_TH = { A1: 'พื้นฐาน', A2: 'ระดับต้น', B1: 'กลาง', B2: 'กลางค่อนสูง', C1: 'สูง', C2: 'สูงมาก' };
  function renderResult(r) {
    const box = document.getElementById('st-result');
    const known = r.vocab.known || 0;
    const bar = LEVELS.map((l) => { const n = r.vocab.profile[l] || 0; return n ? `<span class="st-bar-${l}" style="flex:${n}" title="${l}: ${n} คำ"><b>${l}</b></span>` : ''; }).join('');
    const sev = { error: 'is-error', tip: 'is-tip' };
    box.innerHTML = `
      <section class="gl-card st-res" aria-labelledby="st-r-h"><h2 class="tq-h2" id="st-r-h">${ICON('circle-check', 'icon icon-sm')} ผลตรวจ</h2>
        <div class="st-tiles">
          <div class="pmd-tile"><span>จำนวนคำ</span><b>${r.stats.words}</b><small>${r.stats.sentences} ประโยค · เฉลี่ย ${r.stats.avgSentenceLength} คำ/ประโยค</small></div>
          <div class="pmd-tile"><span>ข้อผิดไวยากรณ์</span><b>${r.grammar.errors}</b><small>${r.grammar.issues.length - r.grammar.errors} คำแนะนำเล็กน้อย</small></div>
          <div class="pmd-tile"><span>ระดับคำศัพท์</span><b>${esc(r.vocab.estimate || '–')}</b><small>${r.vocab.estimate ? esc(LV_TH[r.vocab.estimate]) : 'ข้อความสั้นเกินไป'}</small></div>
        </div>
        <h3 class="gl-h4">${ICON('list-checks', 'icon icon-sm')} ควรทำอะไรต่อ</h3>
        <ol class="st-tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      </section>
      ${r.grammar.issues.length ? `<section class="gl-card" aria-labelledby="st-g-h"><h2 class="tq-h2" id="st-g-h">${ICON('pencil-line', 'icon icon-sm')} ไวยากรณ์</h2>
        <ul class="st-issues">${r.grammar.issues.map((i) => `<li class="${sev[i.severity] || ''}"><span>${esc(i.msgTh)}</span>${i.suggestion ? `<small>ลองแก้เป็น: <b lang="en">${esc(i.suggestion)}</b></small>` : ''}</li>`).join('')}</ul></section>` : ''}
      <section class="gl-card" aria-labelledby="st-v-h"><h2 class="tq-h2" id="st-v-h">${ICON('book-open', 'icon icon-sm')} ระดับคำศัพท์ที่ใช้ (CEFR)</h2>
        ${known ? `<div class="st-bar" role="img" aria-label="${LEVELS.map((l) => `${l} ${r.vocab.profile[l]} คำ`).join(', ')}">${bar}</div>
          <ul class="st-lv">${LEVELS.filter((l) => r.vocab.examples[l] && r.vocab.examples[l].length).map((l) => `<li><b>${l}</b> <span lang="en">${r.vocab.examples[l].map(esc).join(', ')}</span></li>`).join('')}</ul>` : '<p>ยังไม่มีคำศัพท์ที่วัดระดับได้</p>'}
        ${r.vocab.unknownSample.length ? `<p class="gl-note">คำที่ไม่อยู่ในคลัง (มักเป็นคำระดับสูง คำเฉพาะทาง หรือสะกดผิด — ตรวจตัวสะกดอีกครั้ง): <span lang="en">${r.vocab.unknownSample.map(esc).join(', ')}</span></p>` : ''}
      </section>
      <section class="gl-card" aria-labelledby="st-l-h"><h2 class="tq-h2" id="st-l-h">${ICON('link', 'icon icon-sm')} คำเชื่อมและคำที่ใช้ซ้ำ</h2>
        <p>${r.linkers.length ? `คำเชื่อมที่ใช้: ${r.linkers.map((x) => `<span class="st-chip" lang="en">${esc(x.text)} <small>${esc(x.level)}</small></span>`).join(' ')}` : 'ยังไม่มีคำเชื่อม'}</p>
        ${r.suggestLinkers.length ? `<p class="gl-note">ลองเพิ่ม: <span lang="en">${r.suggestLinkers.map(esc).join(', ')}</span></p>` : ''}
        ${r.basic.map((b) => `<div class="st-alt"><b lang="en">${esc(b.word)}</b> ×${b.count} → <span lang="en">${b.alternatives.map(esc).join(' · ')}</span><small>${esc(b.tipTh)}</small></div>`).join('')}
        ${r.repeated.length ? `<p>ใช้ซ้ำหลายครั้ง: ${r.repeated.map((x) => `<span class="st-chip" lang="en">${esc(x.word)} ×${x.count}</span>`).join(' ')}</p>` : ''}
        ${r.targets.asked.length ? `<p>คำเป้าหมาย: ${r.targets.asked.map((w) => `<span class="st-chip ${r.targets.used.includes(w) ? 'is-ok' : 'is-miss'}" lang="en">${r.targets.used.includes(w) ? ICON('check', 'icon icon-sm') : ICON('x', 'icon icon-sm')} ${esc(w)}</span>`).join(' ')}</p>` : ''}
      </section>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(r.note)}</p>`;
  }
  async function submitWrite(form) {
    const text = form.querySelector('#st-text').value;
    if (!text.trim()) { form.querySelector('#st-text').focus(); App().toast('เขียนข้อความก่อนส่งตรวจ', 'info'); return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const targets = form.querySelector('#st-targets').value.split(',').map((x) => x.trim()).filter(Boolean);
      W.result = await App().api('/studio/writing/check', { method: 'POST', body: { text, promptId: W.prompt ? W.prompt.id : null, targets } });
      renderResult(W.result);
      document.getElementById('st-r-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { App().toast(err.message, 'error'); } finally { btn.disabled = false; }
  }

  /* ============================ ผู้ช่วยค้นคำตอบ ============================ */
  async function openHelp(q) {
    setHash('#/help'); App().showScreen('screen-help');
    const el = document.getElementById('screen-help-root');
    el.innerHTML = `${back}
      <header class="st-hero"><p class="gl-kicker">${ICON('circle-help', 'icon icon-sm')} ฟรี · ไม่ใช้ AI</p>
        <h1 class="page-title" id="st-h-title">ผู้ช่วยค้นคำตอบ</h1>
        <p class="gl-sub">ถามเรื่องไวยากรณ์หรือคำศัพท์ — ค้นจากบทเรียน 74 หัวข้อ คำถามที่พบบ่อย และคลังคำศัพท์ในแอป</p></header>
      <form class="st-search" id="st-search" role="search"><label class="sr-only" for="st-q">คำถาม</label>
        <input id="st-q" class="st-input" type="search" maxlength="120" autocomplete="off" placeholder="เช่น since กับ for ต่างกันยังไง / delicious / อร่อย">
        <button class="btn btn-primary" type="submit">${ICON('search', 'icon icon-sm')} ค้นหา</button></form>
      <div id="st-answers" aria-live="polite"></div>
      <p class="st-privacy">${ICON('shield-check', 'icon icon-sm')} ค้นจากเนื้อหาในแอปเท่านั้น ไม่ส่งคำถามให้ AI ภายนอก และไม่เก็บคำถาม</p>`;
    focusTitle('st-h-title');
    await runHelp(q || '');
    if (q) el.querySelector('#st-q').value = q;
  }
  async function runHelp(q) {
    const box = document.getElementById('st-answers'); loading(box);
    let r;
    try { r = await App().api(`/studio/help?q=${encodeURIComponent(q)}`); } catch (err) { box.innerHTML = `<div class="gl-empty" role="alert"><p>${esc(err.message)}</p></div>`; return; }
    const ex = (list) => `<div class="st-examples"><p>ลองถาม:</p>${list.map((x) => `<button class="st-chip st-ask" type="button" data-st-ask="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    if (!q) { box.innerHTML = ex(r.examples); return; }
    const topicBtn = (t) => `<button class="tq-link sp-link" type="button" data-st-topic="${esc(t.id)}">เปิดบทเรียน ${esc(t.cefr)} · ${esc(t.title)} ${ICON('chevron-right', 'icon icon-sm')}</button>`;
    box.innerHTML = `
      ${r.faq.map((f) => `<article class="gl-card st-faq"><h2 class="tq-h2">${ICON('circle-help', 'icon icon-sm')} ${esc(f.question)}</h2><p>${esc(f.answer)}</p>
        ${f.examples.length ? `<ul class="st-ex">${f.examples.map((x) => `<li lang="en">${esc(x)}</li>`).join('')}</ul>` : ''}${f.topic ? topicBtn(f.topic) : ''}</article>`).join('')}
      ${r.words.length ? `<section class="gl-card" aria-labelledby="st-wd-h"><h2 class="tq-h2" id="st-wd-h">${ICON('book-open', 'icon icon-sm')} คำศัพท์</h2><ul class="st-words">
        ${r.words.map((w) => `<li><b lang="en">${esc(w.word)}</b> <small>${esc(w.pos)} · ${esc(w.level)}${w.ipa ? ` · /${esc(w.ipa)}/` : ''}</small><span>${esc(w.thai)}</span>
          ${w.definition ? `<small lang="en">${esc(w.definition)}</small>` : ''}${w.example ? `<em lang="en">“${esc(w.example)}”</em>` : ''}${w.exampleTH ? `<small>${esc(w.exampleTH)}</small>` : ''}</li>`).join('')}</ul></section>` : ''}
      ${r.grammar.length ? `<section class="gl-card" aria-labelledby="st-gr-h"><h2 class="tq-h2" id="st-gr-h">${ICON('languages', 'icon icon-sm')} หัวข้อไวยากรณ์ที่เกี่ยวข้อง</h2><ul class="st-topics">
        ${r.grammar.map((g) => `<li><button class="st-topic" type="button" data-st-topic="${esc(g.id)}"><b>${esc(g.cefr)} · ${esc(g.title)}</b><span>${esc(g.titleTh)}</span>${g.summaryTh ? `<small>${esc(g.summaryTh)}</small>` : ''}</button></li>`).join('')}</ul></section>` : ''}
      ${!r.faq.length && !r.words.length && !r.grammar.length ? `<div class="gl-empty"><p>ยังไม่พบคำตอบสำหรับ “${esc(r.query)}”</p></div>${ex(r.examples)}` : ''}
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(r.note)}</p>`;
  }

  /* ============================ เหตุการณ์ ============================ */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-st-nav], [data-st-prompt], [data-st-clear], [data-st-ask], [data-st-topic]');
    if (!t) return;
    if (t.dataset.stNav) { App().navigateTo(t.dataset.stNav); return; }
    if (t.dataset.stPrompt) { W.prompt = Object.values(W.home.prompts).flat().find((p) => p.id === t.dataset.stPrompt) || null; renderWrite(); document.getElementById('st-text').focus(); return; }
    if (t.hasAttribute('data-st-clear')) { W.prompt = null; renderWrite(); return; }
    if (t.dataset.stAsk) { const i = document.getElementById('st-q'); if (i) i.value = t.dataset.stAsk; runHelp(t.dataset.stAsk); return; }
    if (t.dataset.stTopic) { if (window.EQGrammar && window.EQGrammar.openTopic) window.EQGrammar.openTopic(t.dataset.stTopic); else App().navigateTo('grammar'); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'st-form') { e.preventDefault(); submitWrite(e.target); }
    if (e.target.id === 'st-search') { e.preventDefault(); runHelp(e.target.querySelector('#st-q').value.trim()); }
  });

  window.EQStudio = { openWrite, openHelp, _state: () => W };
}());
