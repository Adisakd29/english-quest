/* =====================================================================
   C2 Vocabulary — window.EQC2  (ต่อยอดโหมดคำศัพท์เดิม · ใช้ส่วนประกอบกลาง lesson-kit)
   หน้าจอ: hub (ศูนย์ C2: ความคืบหน้า · จุดอ่อน · Challenge) · lesson (บทเรียน 12 ขั้นต่อ Unit) · practice (Challenge / Guess from Context / Daily)
   ตรวจคำตอบที่เซิร์ฟเวอร์ (/api/c2) · ข้อมูลที่ได้มาไม่มีเฉลยจนกว่าจะตอบ
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/c2${p}`, o);
  const K = window.EQLesson;
  const { esc, hl, ICON } = K;
  const sfx = (n) => { if (window.EQAudio) window.EQAudio.sfx(n); };
  const root = (id) => document.getElementById(`${id}-root`);
  const REG_TH = { formal: 'ทางการ', neutral: 'ทั่วไป', informal: 'ไม่เป็นทางการ', academic: 'วิชาการ', professional: 'งาน/อาชีพ', literary: 'วรรณกรรม' };
  const CON_TH = { positive: 'เชิงบวก', approving: 'ชื่นชม', neutral: 'กลาง', negative: 'เชิงลบ', disapproving: 'ติ', critical: 'วิจารณ์', humorous: 'ขำขัน' };
  const KIND_TH = { word: 'คำขั้นสูง', sense: 'ความหมายขั้นสูง', collocation: 'Collocation', phrasal: 'Phrasal verb', idiom: 'Idiom', fixed: 'วลีตายตัว', colloquial: 'ภาษาพูด' };
  const PICK_TH = { due: 'ถึงกำหนดทบทวน', weak: 'จุดอ่อน', learning: 'กำลังเรียน', new: 'ใหม่' };
  const MODE_TH = { mixed: 'C2 Vocabulary Challenge', context: 'Guess from Context', daily: 'Daily C2' };

  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p>
      <button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(`${id}-title`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function setHash(path, param) { const t = `#/${path}${param ? `/${param}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const tags = (s) => `<span class="c2-tags">${s.register ? `<span class="c2-tag c2-reg-${esc(s.register)}">${esc(REG_TH[s.register] || s.register)}</span>` : ''}
    ${s.connotation && s.connotation !== 'neutral' ? `<span class="c2-tag">${esc(CON_TH[s.connotation] || s.connotation)}</span>` : ''}
    ${s.kind ? `<span class="c2-tag c2-kind">${esc(KIND_TH[s.kind] || s.kind)}</span>` : ''}
    ${s.tier === 'extended' ? '<span class="c2-tag c2-ext">Extended</span>' : ''}
    ${s.variant && s.variant !== 'both' ? `<span class="c2-tag">${esc(s.variant)}</span>` : ''}</span>`;
  // ไฮไลต์คำเป้าหมายในประโยค (ไม่สนตัวพิมพ์) — ถ้าหาไม่เจอ (รูปผัน) แสดงประโยคตามเดิม
  function markTarget(sentence, form) {
    // เฉพาะตัวอักษร (ตัดวงเล็บ/เครื่องหมาย) → ตัดเป็นรากคำ → ค่อย escape (ห้าม slice หลัง escape — regex จะพัง)
    const words = String(form || '').replace(/\b(someone|something|one's|sb|sth)\b/gi, ' ').split(/[^A-Za-z']+/).filter((w) => w.length > 2);
    if (!words.length) return sentence;
    const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    let re;
    try { re = new RegExp(`\\b(${stems.join('|')})\\w*`, 'i'); } catch (_) { return sentence; }
    return re.test(sentence) ? sentence.replace(re, (m) => `[[${m}]]`) : sentence;
  }

  /* ---------- แปลงข้อ C2 → รูปแบบที่ lesson-kit วาดได้ ---------- */
  function toKit(it) {
    const base = { ...it };
    if (it.input) return { ...base, type: 'fill', question: it.sentence, prompt: it.prompt, hint: `รากคำ: ${it.root}` };
    if (it.passage) {
      return { ...base, type: 'context', prompt: null, question: it.prompt,
        context: { kind: 'message', title: 'อ่านข้อความ', lines: it.passage.split('\n').map((t) => ({ text: t })) } };
    }
    if (it.sentence) {
      const q = /_{3,}/.test(it.sentence) ? it.sentence : markTarget(it.sentence, it.form);
      return { ...base, type: 'mc', question: q, prompt: it.prompt };
    }
    return { ...base, type: 'choose', question: it.prompt, prompt: null };
  }
  function toKitFb(fb) {
    const explain = [fb.explainTH, fb.note].filter(Boolean).join(' · ');
    return { ...fb, answerIndex: fb.answer, explainTh: explain, yourMistake: fb.whyNot || null, whyNot: null };
  }

  /* =====================================================================
     HUB — ศูนย์ C2
     ===================================================================== */
  async function openHub() {
    App().showScreen('screen-c2');
    const el = root('screen-c2');
    loading(el);
    try {
      const [s, path] = await Promise.all([api('/summary'), App().api('/path')]);
      const lv = path.levels.find((l) => l.level === 'C2');
      const pct = (x) => `${x.learned}/${x.total}`;
      const weakFacet = Object.entries(s.weakByFacet || {});
      el.innerHTML = `
        <header class="c2-hero">
          ${window.EQG ? window.EQG.emblem('C2', { size: 'lg' }) : ''}
          <p class="gl-kicker">C2 · Proficiency</p>
          <h1 class="page-title" id="screen-c2-title">คำศัพท์ระดับ C2</h1>
          <p class="gl-sub">ไม่ใช่แค่ "แปลว่าอะไร" — แต่ใช้ที่นี่หมายถึงอะไร · ทำไมคำนี้ไม่ใช่อีกคำ · ทางการแค่ไหน · ใช้คู่กับคำไหน</p>
          ${s.unlocked ? '' : `<p class="c2-lock-note">${ICON('lock', 'icon icon-sm')} C2 ยังล็อก — ผ่าน 60% ของ C1 หรือเคลียร์ Boss C1 (หรือสอบวัดระดับได้ C1 เต็ม) · ระหว่างนี้เปิด Unit ในโหมดสำรวจได้</p>`}
        </header>
        <section class="c2-stats" aria-label="ความคืบหน้า C2">
          <div class="c2-stat"><b>${pct(s.core)}</b><span>Core ที่รู้แล้ว</span><i style="--p:${s.core.percent}"></i></div>
          <div class="c2-stat"><b>${pct(s.extended)}</b><span>Extended</span><i style="--p:${s.extended.percent}"></i></div>
          <div class="c2-stat"><b>${s.core.mastered + s.extended.mastered}</b><span>จำได้แม่น (≥21 วัน)</span></div>
          <div class="c2-stat"><b>${s.accuracy === null ? '—' : `${s.accuracy}%`}</b><span>ความแม่นยำ</span></div>
          <div class="c2-stat"><b>${s.due}</b><span>ถึงกำหนดทบทวน</span></div>
        </section>
        <section class="c2-modes" aria-label="โหมดฝึก C2">
          ${s.continue ? `<button class="c2-mode c2-mode-main" type="button" data-c2-unit="${esc(s.continue.unitId)}">${ICON('play', 'icon')}<b>เรียนต่อ</b><small>${esc(s.continue.unitId)} · ขั้น ${s.continue.step + 1}</small></button>` : ''}
          <button class="c2-mode" type="button" data-c2-practice="mixed" ${s.unlocked ? '' : 'disabled'}>${ICON('zap', 'icon')}<b>C2 Vocabulary Challenge</b><small>ผสม: บริบท · collocation · ความแม่นยำ · register</small></button>
          <button class="c2-mode" type="button" data-c2-practice="context" ${s.unlocked ? '' : 'disabled'}>${ICON('search', 'icon')}<b>Guess from Context</b><small>อ่านแล้วเดาความหมายจากเบาะแส</small></button>
          <button class="c2-mode" type="button" data-c2-practice="daily" ${s.unlocked ? '' : 'disabled'}>${ICON('calendar', 'icon')}<b>Daily C2</b><small>ทบทวน → จุดอ่อน → ใหม่ (ชุดเดียวทั้งวัน)</small></button>
        </section>
        ${s.weakSenses.length ? `<section class="gl-card c2-weak"><h2 class="gl-h3">${ICON('target', 'icon icon-sm')} จุดที่ควรฝึก</h2>
          <ul class="c2-weak-list">${s.weakSenses.map((w) => `<li><a href="#/words" data-c2-word="${esc(w.id)}" lang="en">${esc(w.form)}</a><span>${esc(w.short)}</span><small>ผิด ${w.wrong}</small></li>`).join('')}</ul>
          ${weakFacet.length ? `<p class="c2-facets">${weakFacet.map(([, f]) => `<span class="c2-tag">${esc(f.th)} · ${f.items.length}</span>`).join(' ')}</p>` : ''}</section>` : ''}
        <section class="c2-units" aria-labelledby="c2-units-title">
          <h2 class="gl-h3" id="c2-units-title">Units (${lv ? lv.totalUnits : 0})</h2>
          <ul class="c2-unit-list">${(lv ? lv.units : []).map((u) => `<li><button class="c2-unit ${esc(u.status)}" type="button" data-c2-unit="${esc(u.id)}" data-locked="${u.status === 'locked'}">
            <span class="c2-unit-title">${esc(u.title)}</span><span class="c2-unit-meta">${u.known}/${u.total} ความหมาย · ${u.status === 'completed' ? 'ผ่าน' : u.status === 'locked' ? 'ล็อก (สำรวจได้)' : 'เรียนได้'}</span>
            <span class="path-unit-bar"><span style="width:${u.total ? Math.round((u.known / u.total) * 100) : 0}%"></span></span></button></li>`).join('')}</ul>
        </section>
        <p class="gl-note">${esc(s.bank.note)} · ตอนนี้มี ${s.bank.total} ความหมาย</p>`;
      el.querySelectorAll('[data-c2-unit]').forEach((b) => b.addEventListener('click', () => openLesson(b.dataset.c2Unit, { explore: b.dataset.locked === 'true' })));
      el.querySelectorAll('[data-c2-practice]').forEach((b) => b.addEventListener('click', () => openPractice(b.dataset.c2Practice)));
      el.querySelectorAll('[data-c2-word]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); if (window.EQApp.openVocabCard) window.EQApp.openVocabCard(a.dataset.c2Word); }));
      focusTitle('screen-c2');
    } catch (err) { errorBox(el, err, openHub); }
  }

  /* =====================================================================
     LESSON — 12 ขั้น
     ===================================================================== */
  const LP = { unit: null, explore: false, k: 0, total: 0, data: null, idx: 0, ov: null, expRun: 0 };
  const qs = () => (LP.explore ? '?explore=1' : '');
  async function openLesson(unitId, { explore = false, k = null } = {}) {
    setHash('c2-lesson', unitId);
    App().showScreen('screen-c2-lesson');
    const el = root('screen-c2-lesson');
    loading(el);
    try {
      const ov = await api(`/lessons/${encodeURIComponent(unitId)}${explore ? '?explore=1' : ''}`);
      Object.assign(LP, { unit: unitId, explore: explore || ov.explored, ov, total: ov.total, expRun: 0 });
      if (k === null && (ov.runFinished || ov.current === 0)) { renderOverview(); return; }
      await loadStep(k === null ? Math.min(ov.current, ov.total - 1) : k);
    } catch (err) {
      if (err.code === 'UNIT_LOCKED') { openLesson(unitId, { explore: true, k }); return; }
      errorBox(el, err, () => openLesson(unitId, { explore, k }));
    }
  }
  function renderOverview() {
    const o = LP.ov; const el = root('screen-c2-lesson');
    el.innerHTML = `<div class="gl-play-top"><button class="game-exit" type="button" data-exit>${ICON('arrow-left', 'icon icon-sm')} ศูนย์ C2</button>
        <p class="gl-play-title">${esc(o.title)}</p><p class="gl-play-count">${o.known}/${o.totalSenses}</p></div>
      <article class="gl-card lk-card">
        <p class="gl-kicker">C2 · ${esc(o.subtitle || '')}${o.explored ? ' · โหมดสำรวจ' : ''}</p>
        <h1 class="lk-title" id="screen-c2-lesson-title">${esc(o.title)}</h1>
        <p class="gl-sub">${o.total} ขั้น · ผ่านเมื่อตอบถูก ≥ ${o.passPct}% ของทั้งบท${o.bestAccuracy !== null ? ` · ดีที่สุด ${o.bestAccuracy}%` : ''}</p>
        <ul class="c2-sense-chips">${o.senses.map((s) => `<li lang="en">${esc(s.form)}</li>`).join('')}</ul>
        <ol class="c2-steps">${o.steps.map((s) => `<li class="${s.done ? 'is-done' : ''}">${ICON(s.done ? 'circle-check' : (s.icon || 'book-open'), 'icon icon-sm')}<b>${esc(s.title)}</b><small>${esc(s.th)}${s.items ? ` · ${s.items} ข้อ` : ''}</small></li>`).join('')}</ol>
      </article>
      <div class="gl-play-actions lk-actions">
        ${o.runFinished ? `<button class="btn btn-primary" type="button" data-restart>${ICON('rotate-ccw', 'icon icon-sm')} เรียนรอบใหม่ (ชุดข้อใหม่)</button>`
    : `<button class="btn btn-primary" type="button" data-start>${o.current > 0 ? `เรียนต่อ ขั้น ${o.current + 1}` : 'เริ่มเรียน'} ${ICON('chevron-right', 'icon icon-sm')}</button>`}
      </div>`;
    el.querySelector('[data-exit]').addEventListener('click', openHub);
    const st = el.querySelector('[data-start]'); if (st) st.addEventListener('click', () => loadStep(Math.min(o.current, o.total - 1)));
    const rs = el.querySelector('[data-restart]');
    if (rs) rs.addEventListener('click', async () => { rs.disabled = true; try { LP.ov = await api(`/lessons/${encodeURIComponent(LP.unit)}/restart${qs()}`, { method: 'POST' }); await loadStep(0); } catch (e) { App().toast(e.message, 'error'); rs.disabled = false; } });
    focusTitle('screen-c2-lesson');
  }
  async function loadStep(k) {
    const el = root('screen-c2-lesson');
    try {
      LP.data = await api(`/lessons/${encodeURIComponent(LP.unit)}/steps/${k}${qs()}`);
      LP.k = k; LP.total = LP.data.total;
      const items = LP.data.content.items || [];
      LP.idx = items.findIndex((x) => LP.data.answered[x.id] === undefined);
      renderStep();
    } catch (err) { errorBox(el, err, () => loadStep(k)); }
  }
  function top(step) {
    return `<div class="gl-play-top">
        <button class="game-exit" type="button" data-exit aria-label="ออกจากบทเรียน (บันทึกความคืบหน้าแล้ว)">${ICON('x', 'icon icon-sm')} ออก</button>
        <p class="gl-play-title">${esc(LP.ov.title)}</p><p class="gl-play-count" aria-live="polite">Step ${LP.k + 1}/${LP.total}</p></div>
      ${K.progress(LP.k, LP.total, { title: LP.ov.title })}
      <div class="footprints lk-steps" data-fp aria-hidden="true"></div>
      <p class="lk-kicker">${ICON(step.icon || 'book-open', 'icon icon-sm')} ${esc(step.title)}<small>${esc(step.th)}</small></p>`;
  }
  const head = (s) => `<p class="c2-form" lang="en"><b>${esc(s.form)}</b>${s.ipa ? ` <span class="c2-ipa">${esc(s.ipa)}</span>` : ''}${s.ipaUS ? ` <span class="c2-ipa">US ${esc(s.ipaUS)}</span>` : ''}
    <button class="mini-btn ghost" type="button" data-say="${esc(s.form)}" aria-label="ฟังเสียง ${esc(s.form)}">${ICON('volume-2', 'icon icon-sm')}</button></p>`;
  function learnBody(step, c) {
    switch (step.kind) {
      case 'words': return `<h1 class="lk-title" id="screen-c2-lesson-title">คำ/วลีใหม่ในบทนี้</h1>
        <ul class="c2-cards">${c.cards.map((s) => `<li class="c2-card">${head(s)}<p class="c2-short">${esc(s.short)}</p>${tags(s)}</li>`).join('')}</ul>`;
      case 'meanings': return `<h1 class="lk-title" id="screen-c2-lesson-title">ความหมายและการใช้</h1>
        <ul class="c2-cards">${c.cards.map((s) => `<li class="c2-card">${head(s)}
          ${s.base ? `<p class="c2-base">${ICON('book-open', 'icon icon-sm')} ความหมายพื้นฐานของ <b lang="en">${esc(s.base.lemma)}</b>: ${esc(s.base.meaningTH)} → <b>ระดับ C2:</b></p>` : ''}
          <p class="c2-th">${esc(s.meaningTH)}</p><p class="c2-en" lang="en">${esc(s.meaningEN)}</p>
          <p class="gl-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(s.usageNoteTH)}</p>${tags(s)}</li>`).join('')}</ul>`;
      case 'usage': return `<h1 class="lk-title" id="screen-c2-lesson-title">เห็นในประโยคจริง</h1>
        <ol class="lk-examples">${c.cards.map((s) => `<li><p class="gl-example" lang="en">${hl(markTarget(s.example, s.form))}
          <button class="mini-btn ghost" type="button" data-say="${esc(s.example)}" aria-label="ฟังประโยค">${ICON('volume-2', 'icon icon-sm')}</button></p><p class="gl-th">${esc(s.exampleTH)}</p></li>`).join('')}</ol>`;
      case 'colloc': return `<h1 class="lk-title" id="screen-c2-lesson-title">ใช้คู่กับคำไหน (Collocations)</h1>
        <ul class="c2-cards">${c.cards.map((s) => `<li class="c2-card"><p class="c2-form" lang="en"><b>${esc(s.form)}</b></p>
          <ul class="c2-colls" lang="en">${s.collocations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${s.mistake ? `<p class="gl-wrong" lang="en">${ICON('circle-x', 'icon icon-sm')}<span><s>${esc(s.mistake.wrong)}</s></span></p><p class="gl-right" lang="en">${ICON('circle-check', 'icon icon-sm')}<span>${esc(s.mistake.right)}</span></p><p class="gl-why">${esc(s.mistake.whyTH)}</p>` : ''}</li>`).join('')}</ul>`;
      case 'nuance': return `<h1 class="lk-title" id="screen-c2-lesson-title">คำใกล้เคียง ต่างกันอย่างไร</h1>
        <ul class="c2-cards">${c.cards.map((s) => `<li class="c2-card"><p class="c2-form" lang="en"><b>${esc(s.form)}</b></p>${tags(s)}
          <ul class="c2-near">${s.nearSynonyms.map((n) => `<li><b lang="en">${esc(n.word)}</b> — ${esc(n.differenceTH)}</li>`).join('')}</ul>
          ${s.synonyms.length ? `<p class="c2-syn"><span>ใกล้เคียง</span> <span lang="en">${s.synonyms.map(esc).join(' · ')}</span></p>` : ''}
          ${s.antonyms.length ? `<p class="c2-syn"><span>ตรงข้าม</span> <span lang="en">${s.antonyms.map(esc).join(' · ')}</span></p>` : ''}</li>`).join('')}</ul>`;
      case 'phrases': return `<h1 class="lk-title" id="screen-c2-lesson-title">สำนวน วลี และรูปคำ</h1>
        <ul class="c2-cards">${c.cards.map((s) => `<li class="c2-card"><p class="c2-form" lang="en"><b>${esc(s.form)}</b> <span class="c2-tag c2-kind">${esc(KIND_TH[s.kind] || s.kind)}</span></p>
          ${s.literalTH ? `<p class="c2-syn"><span>ตามตัวอักษร</span> ${esc(s.literalTH)}</p>` : ''}
          ${s.naturalTH ? `<p class="gl-right">${ICON('circle-check', 'icon icon-sm')}<span>${esc(s.naturalTH)}</span></p>` : ''}
          ${s.unnaturalTH ? `<p class="gl-wrong">${ICON('circle-x', 'icon icon-sm')}<span>${esc(s.unnaturalTH)}</span></p>` : ''}
          ${s.separable !== null ? `<p class="c2-syn"><span>แยกกรรมได้ไหม</span> ${s.separable ? 'ได้ (separable)' : 'ไม่ได้ (inseparable)'}</p>` : ''}
          ${s.wordFamily.length ? `<p class="c2-syn"><span>ตระกูลคำ</span> <span lang="en">${s.wordFamily.map((w) => `${esc(w.form)} (${esc(w.pos)})`).join(' · ')}</span></p>` : ''}
          ${s.confusedWith.length ? `<p class="c2-syn"><span>อย่าสับสนกับ</span> <span lang="en">${s.confusedWith.map(esc).join(' · ')}</span></p>` : ''}</li>`).join('')}</ul>`;
      case 'review': return `<h1 class="lk-title" id="screen-c2-lesson-title">สรุปและจุดที่มักผิด</h1>
        <ul class="lk-recap">${c.rows.map((r) => `<li><span lang="en">${esc(r.form)}</span><code>${esc(r.short)}</code></li>`).join('')}</ul>
        ${c.cards.length ? `<p class="gl-sub">แตะ "ถูก" หรือ "ผิด" แล้วดูเหตุผล</p><ul class="lk-tfs">${c.cards.map(K.tfCard).join('')}</ul>` : ''}
        <p class="gl-note">ขั้นสุดท้ายคือ Mastery Check — ตอบให้ได้ ≥ 80% ของทั้งบทเพื่อผ่าน</p>`;
      default: return '';
    }
  }
  function wireCommon(el) {
    K.footprints(el.querySelector('[data-fp]'), LP.total, LP.k);
    el.querySelector('[data-exit]').addEventListener('click', () => { App().toast('บันทึกความคืบหน้าแล้ว — กลับมาเรียนต่อได้ทุกเครื่อง', 'info'); openHub(); });
    const prev = el.querySelector('[data-prev]'); if (prev) prev.addEventListener('click', () => loadStep(LP.k - 1));
    el.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => { if (window.EQApp.speak) window.EQApp.speak(b.dataset.say, 0.9); }));
  }
  function renderStep() {
    const step = LP.data.step; const c = LP.data.content;
    if (step.check) { renderCheck(); return; }
    const el = root('screen-c2-lesson');
    const last = LP.k >= LP.total - 1;
    const gated = step.kind === 'review' && (c.cards || []).length && !step.done;
    el.innerHTML = `${top(step)}<article class="gl-card lk-card c2-learn">${learnBody(step, c)}</article>
      <div class="gl-play-actions lk-actions">
        ${LP.k > 0 ? `<button class="btn btn-secondary" type="button" data-prev>${ICON('chevron-left', 'icon icon-sm')} ย้อนกลับ</button>` : ''}
        <button class="btn btn-primary" type="button" data-next data-submit ${gated ? 'disabled' : ''}>${last ? 'จบบทเรียน' : step.kind === 'review' ? 'ไป Mastery Check' : 'เข้าใจแล้ว ไปต่อ'} ${ICON('chevron-right', 'icon icon-sm')}</button></div>
      ${gated ? '<p class="gl-note lk-gate">ตอบให้ครบทุกประโยคก่อนเพื่อไปต่อ</p>' : ''}`;
    wireCommon(el);
    const next = el.querySelector('[data-next]');
    if (gated) K.wireTf(el.querySelector('.lk-card'), () => { next.disabled = false; const g = el.querySelector('.lk-gate'); if (g) g.remove(); });
    next.addEventListener('click', () => completeStep(next));
    focusTitle('screen-c2-lesson');
  }
  function renderCheck() {
    const step = LP.data.step; const items = LP.data.content.items; const answered = LP.data.answered;
    const el = root('screen-c2-lesson');
    if (LP.idx < 0) {
      const ok = items.filter((x) => answered[x.id]).length;
      el.innerHTML = `${top(step)}<article class="gl-card lk-card"><h1 class="lk-title" id="screen-c2-lesson-title">${esc(step.title)} เสร็จแล้ว</h1><p class="gl-read">ถูก ${ok} จาก ${items.length} ข้อ</p></article>
        <div class="gl-play-actions lk-actions">${LP.k > 0 ? `<button class="btn btn-secondary" type="button" data-prev>${ICON('chevron-left', 'icon icon-sm')} ย้อนกลับ</button>` : ''}
        <button class="btn btn-primary" type="button" data-next data-submit>${LP.k >= LP.total - 1 ? 'ดูผลบทเรียน' : 'ไปขั้นต่อไป'} ${ICON('chevron-right', 'icon icon-sm')}</button></div>`;
      wireCommon(el);
      el.querySelector('[data-next]').addEventListener('click', (e) => completeStep(e.currentTarget));
      focusTitle('screen-c2-lesson');
      return;
    }
    const raw = items[LP.idx]; const it = toKit(raw);
    playItem(el, top(step), it, `ข้อ ${LP.idx + 1}/${items.length}`, 'screen-c2-lesson-title',
      (ans) => api(`/lessons/${encodeURIComponent(LP.unit)}/steps/${LP.k}/answer${qs()}`, { method: 'POST', body: { itemId: raw.id, answer: ans } }),
      (fb) => {
        if (fb.counted) answered[raw.id] = fb.correct;
        if (fb.exp) LP.expRun += fb.exp;
        const nextIdx = items.findIndex((x, i) => i > LP.idx && answered[x.id] === undefined);
        return { label: nextIdx >= 0 ? 'ข้อต่อไป' : LP.k >= LP.total - 1 ? 'ดูผลบทเรียน' : 'ไปขั้นต่อไป',
          go: (btn) => { if (nextIdx >= 0) { LP.idx = nextIdx; renderCheck(); } else completeStep(btn); }, retry: () => renderCheck() };
      });
    wireCommon(el);
  }
  /** วาดข้อหนึ่งข้อ + ตรวจ + feedback (ใช้ทั้งบทเรียนและรอบ Challenge) */
  function playItem(el, header, it, counter, titleId, send, after) {
    el.innerHTML = `${header}
      <article class="gl-item lk-item c2-item" aria-labelledby="${titleId}">
        <p class="gl-item-meta"><span class="gl-type" id="${titleId}">${esc(it.typeTh)}</span>${it.pick ? `<span class="c2-tag">${esc(PICK_TH[it.pick] || it.pick)}</span>` : ''}<span class="gl-item-topic">${esc(counter)}</span></p>
        <div class="gl-item-body" data-box>${K.itemBody(it)}</div>
        <div class="gl-feedback" data-fb aria-live="polite"></div>
        <div class="gl-play-actions"><button class="btn btn-primary btn-block" type="button" data-submit disabled>ตรวจคำตอบ</button></div>
      </article>`;
    const box = el.querySelector('[data-box]'); const submit = el.querySelector('[data-submit]');
    K.wireItem(it, box, () => { submit.disabled = K.collect(it, box) === null; });
    submit.addEventListener('click', async () => {
      const ans = K.collect(it, box); if (ans === null) return;
      submit.disabled = true;
      try {
        const raw = await send(ans);
        const fb = toKitFb(raw);
        K.lock(it, box, fb, ans);
        el.querySelector('[data-fb]').innerHTML = K.feedbackHtml(it, fb);
        sfx(fb.correct ? 'correct' : 'incorrect');
        K.expReward(fb, el.querySelector('.gl-fb-head'));
        const nx = after(raw);
        const acts = el.querySelector('.gl-play-actions');
        acts.innerHTML = `${!fb.correct && nx.retry ? '<button class="btn btn-secondary" type="button" data-retry>ลองตอบใหม่ (ไม่นับคะแนน)</button>' : ''}
          <button class="btn btn-primary" type="button" data-go>${esc(nx.label)} ${ICON('chevron-right', 'icon icon-sm')}</button>`;
        const go = acts.querySelector('[data-go]'); go.addEventListener('click', () => nx.go(go));
        const rt = acts.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', nx.retry);
        go.focus({ preventScroll: true });
        el.querySelector('[data-fb]').scrollIntoView({ block: 'nearest', behavior: K.reduced() ? 'auto' : 'smooth' });
      } catch (err) { App().toast(err.message, 'error'); submit.disabled = false; }
    });
    window.scrollTo(0, 0);
  }
  async function completeStep(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await api(`/lessons/${encodeURIComponent(LP.unit)}/steps/${LP.k}/complete${qs()}`, { method: 'POST' });
      if (r.exp) LP.expRun += r.exp;
      K.expReward(r, btn);
      if (r.result) { renderResult(r.result); return; }
      await loadStep(Math.min(LP.k + 1, LP.total - 1));
    } catch (err) {
      App().toast(err.message, 'error'); if (btn) btn.disabled = false;
      if (err.code === 'INCOMPLETE') loadStep(LP.k);
    }
  }
  function renderResult(res) {
    const el = root('screen-c2-lesson');
    sfx(res.passed ? 'rank_progress' : 'click');
    el.innerHTML = `<div class="gl-summary lk-result ${res.passed ? 'is-pass' : 'is-fail'}">
      <p class="gl-kicker">${ICON(res.passed ? 'award' : 'target', 'icon icon-sm')} ${esc(LP.ov.title)}</p>
      <h1 class="page-title" id="screen-c2-lesson-title">${res.passed ? 'ผ่านบทเรียน C2 แล้ว!' : res.accuracy >= 60 ? 'เกือบแล้ว! อีกนิดเดียว' : 'ยังไม่ผ่าน — ลองอีกรอบนะ'}</h1>
      <div class="gl-score" style="--p:${res.accuracy}" role="img" aria-label="ความแม่น ${res.accuracy}%"><b>${res.accuracy}%</b><small>ถูก ${res.correct}/${res.total}</small></div>
      <ul class="gl-sum-stats"><li><span>EXP บทนี้</span><b>+${LP.expRun}</b></li><li><span>เกณฑ์ผ่าน</span><b>${res.passPct}%</b></li></ul>
      ${res.weak.length ? `<div class="gl-card c2-weak"><h2 class="gl-h3">${ICON('rotate-ccw', 'icon icon-sm')} เข้าคิวทบทวนแล้ว</h2><ul class="c2-weak-list">${res.weak.map((w) => `<li><b lang="en">${esc(w.form)}</b><span>${esc(w.short)}</span></li>`).join('')}</ul></div>` : ''}
      <div class="gl-actions">
        ${res.weak.length ? `<button class="btn btn-primary" type="button" data-practice="mixed">${ICON('zap', 'icon icon-sm')} ฝึกจุดอ่อนตอนนี้</button>` : ''}
        ${!res.passed ? `<button class="btn btn-secondary" type="button" data-again>${ICON('rotate-ccw', 'icon icon-sm')} เรียนรอบใหม่</button>` : ''}
        <button class="btn btn-secondary" type="button" data-hub>ศูนย์ C2</button>
      </div></div>`;
    const p = el.querySelector('[data-practice]'); if (p) p.addEventListener('click', () => openPractice('mixed'));
    const a = el.querySelector('[data-again]');
    if (a) a.addEventListener('click', async () => { a.disabled = true; try { LP.ov = await api(`/lessons/${encodeURIComponent(LP.unit)}/restart${qs()}`, { method: 'POST' }); LP.expRun = 0; await loadStep(0); } catch (e) { App().toast(e.message, 'error'); a.disabled = false; } });
    el.querySelector('[data-hub]').addEventListener('click', openHub);
    focusTitle('screen-c2-lesson');
  }

  /* =====================================================================
     PRACTICE — C2 Challenge / Guess from Context / Daily
     ===================================================================== */
  const PS = { sid: null, mode: 'mixed', items: [], answered: {}, idx: 0, exp: 0 };
  async function openPractice(mode = 'mixed') {
    setHash('c2-practice', mode);
    App().showScreen('screen-c2-practice');
    const el = root('screen-c2-practice');
    loading(el);
    try {
      const s = await api('/practice/start', { method: 'POST', body: { mode } });
      Object.assign(PS, { sid: s.sessionId, mode: s.mode, items: s.items, answered: { ...s.answered }, exp: 0 });
      PS.idx = PS.items.findIndex((x) => PS.answered[x.id] === undefined);
      if (PS.idx < 0) { finishPractice(); return; }
      renderPractice();
    } catch (err) { errorBox(el, err, () => openPractice(mode)); }
  }
  function practiceTop() {
    return `<div class="gl-play-top"><button class="game-exit" type="button" data-exit>${ICON('x', 'icon icon-sm')} ออก</button>
      <p class="gl-play-title">${esc(MODE_TH[PS.mode])}</p><p class="gl-play-count">${PS.idx + 1}/${PS.items.length}</p></div>
      ${K.progress(PS.idx, PS.items.length, { label: 'ข้อ', title: MODE_TH[PS.mode] })}`;
  }
  function renderPractice() {
    const el = root('screen-c2-practice');
    const raw = PS.items[PS.idx];
    playItem(el, practiceTop(), toKit(raw), `ข้อ ${PS.idx + 1}/${PS.items.length}`, 'screen-c2-practice-title',
      (ans) => api(`/practice/${PS.sid}/answer`, { method: 'POST', body: { itemId: raw.id, answer: ans } }),
      (fb) => {
        if (fb.counted) PS.answered[raw.id] = fb.correct;
        if (fb.exp) PS.exp += fb.exp;
        const nextIdx = PS.items.findIndex((x, i) => i > PS.idx && PS.answered[x.id] === undefined);
        return { label: nextIdx >= 0 ? 'ข้อต่อไป' : 'ดูผล', go: () => { if (nextIdx >= 0) { PS.idx = nextIdx; renderPractice(); } else finishPractice(); }, retry: null };
      });
    el.querySelector('[data-exit]').addEventListener('click', openHub);
  }
  async function finishPractice() {
    const el = root('screen-c2-practice');
    try {
      const r = await api(`/practice/${PS.sid}/finish`, { method: 'POST' });
      K.expReward(r, null);
      el.innerHTML = `<div class="gl-summary lk-result ${r.accuracy >= 80 ? 'is-pass' : 'is-fail'}">
        <p class="gl-kicker">${ICON('zap', 'icon icon-sm')} ${esc(MODE_TH[r.mode])}</p>
        <h1 class="page-title" id="screen-c2-practice-title">${r.accuracy === 100 ? 'Perfect!' : r.accuracy >= 80 ? 'เยี่ยมมาก' : 'ฝึกต่ออีกนิด'}</h1>
        <div class="gl-score" style="--p:${r.accuracy}" role="img" aria-label="ความแม่น ${r.accuracy}%"><b>${r.accuracy}%</b><small>ถูก ${r.correct}/${r.total}</small></div>
        <ul class="gl-sum-stats"><li><span>EXP รอบนี้</span><b>+${PS.exp + r.exp}</b></li></ul>
        ${r.wrong.length ? `<div class="gl-card c2-weak"><h2 class="gl-h3">ทบทวนข้อที่พลาด</h2><ul class="c2-weak-list">${r.wrong.map((w) => `<li><b lang="en">${esc(w.form)}</b><span>${esc(w.short)}</span><small>${esc(w.typeTh)}</small></li>`).join('')}</ul></div>` : ''}
        <div class="gl-actions"><button class="btn btn-primary" type="button" data-again>${ICON('rotate-ccw', 'icon icon-sm')} อีกรอบ</button>
          <button class="btn btn-secondary" type="button" data-hub>ศูนย์ C2</button></div></div>`;
      el.querySelector('[data-again]').addEventListener('click', () => openPractice(PS.mode === 'daily' ? 'mixed' : PS.mode));
      el.querySelector('[data-hub]').addEventListener('click', openHub);
      focusTitle('screen-c2-practice');
    } catch (err) { errorBox(el, err, finishPractice); }
  }

  /* =====================================================================
     ADMIN — C2 Content Audit (ในหน้าผู้ดูแล)
     ===================================================================== */
  const AD = { page: 1, f: { issue: '', status: '', kind: '', tier: '', q: '' } };
  const ISSUE_TH = { '': 'ทุกรายการ', errors: 'มี error', warnings: 'มีคำเตือน', ambiguous: 'โจทย์อาจกำกวม', duplicate: 'ซ้ำ', example: 'ตัวอย่าง/บริบท',
    thai: 'ภาษาไทย', 'thai-missing': 'ไม่มีความหมายไทย', collocation: 'Collocation', 'colloc-missing': 'Collocation ไม่ครบ', meta: 'Metadata (CEFR/pos/register/tier)' };
  async function mountAdmin() {
    const box = document.getElementById('admin-c2-root'); if (!box) return;
    const m = await App().api('/admin/c2/metrics');
    const unv = (m.status.unverified || 0);
    const badge = document.getElementById('admin-c2-count');
    if (badge) { badge.textContent = String(unv + (m.totals.with_warnings || 0)); badge.classList.toggle('hidden', !(unv + m.totals.with_warnings)); }
    const sel = (key, opts) => `<select class="gl-input gl-select" data-f="${key}" aria-label="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${AD.f[key] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    box.innerHTML = `<p class="gl-note">${m.totals.senses} ความหมาย · ${m.totals.entries} คำหลัก · autoChecked ${m.status.autoChecked || 0} · reviewed ${m.status.reviewed || 0} · unverified ${unv} · มีคำเตือน ${m.totals.with_warnings} · ผู้เรียน ${m.learners} คน<br>${esc(m.note)}</p>
      ${m.hardItems.length ? `<p class="gl-note">ตอบผิดบ่อย (อาจกำกวม): ${m.hardItems.slice(0, 6).map((h) => `${esc(h.display_form)} ${h.wrong_pct}%`).join(' · ')}</p>` : ''}
      <div class="admin-filters">${sel('issue', Object.entries(ISSUE_TH))}${sel('status', [['', 'ทุกสถานะ'], ['unverified', 'unverified'], ['autoChecked', 'autoChecked'], ['reviewed', 'reviewed']])}
        ${sel('kind', [['', 'ทุกชนิด'], ...Object.entries(KIND_TH)])}${sel('tier', [['', 'Core + Extended'], ['core', 'Core'], ['extended', 'Extended']])}
        <input type="search" class="gl-input" data-f="q" placeholder="ค้นหา…" maxlength="40" value="${esc(AD.f.q)}" /></div>
      <div data-list></div>`;
    box.querySelectorAll('[data-f]').forEach((x) => x.addEventListener('change', () => { AD.f[x.dataset.f] = x.value; AD.page = 1; loadAdminList(box); }));
    await loadAdminList(box);
  }
  async function loadAdminList(box) {
    const list = box.querySelector('[data-list]');
    const p = new URLSearchParams({ ...AD.f, page: String(AD.page) });
    const d = await App().api(`/admin/c2/audit?${p}`);
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    list.innerHTML = `<p class="gl-note">พบ ${d.total} รายการ · หน้า ${d.page}/${pages}</p>
      <ul class="c2-admin-list">${d.items.map((it) => `<li class="c2-card" data-id="${esc(it.id)}">
        <p class="c2-form"><b lang="en">${esc(it.form)}</b> <span class="c2-tag">${esc(it.id)}</span> <span class="c2-tag">${esc(it.status)}</span> ${tags(it)}</p>
        ${it.issues.errors.length ? `<ul class="c2-issues bad">${it.issues.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${it.issues.warnings.length ? `<ul class="c2-issues">${it.issues.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <details><summary>แก้ไข</summary><div class="c2-admin-form">
          <label>ความหมายสั้น (ตัวเลือก ≤30)<input class="gl-input" data-e="shortMeaningTH" maxlength="40" value="${esc(it.short)}"></label>
          <label>ความหมายไทย<textarea class="gl-input" data-e="meaningTH" rows="2">${esc(it.meaningTH)}</textarea></label>
          <label>หมายเหตุการใช้<textarea class="gl-input" data-e="usageNoteTH" rows="2">${esc(it.usageNoteTH)}</textarea></label>
          <label>Example<textarea class="gl-input" data-e="example" rows="2" lang="en">${esc(it.example)}</textarea></label>
          <label>คำแปลตัวอย่าง<textarea class="gl-input" data-e="exampleTH" rows="2">${esc(it.exampleTH)}</textarea></label>
          <label>Collocations (คั่นด้วย ,)<input class="gl-input" data-e="collocations" lang="en" value="${esc(it.collocations.join(', '))}"></label>
          <label>Register<select class="gl-input" data-e="register">${Object.keys(REG_TH).map((r) => `<option ${r === it.register ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label>Tier<select class="gl-input" data-e="tier">${['core', 'extended'].map((r) => `<option ${r === it.tier ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label>Priority (1–5)<input class="gl-input" type="number" min="1" max="5" data-e="realWorldPriority" value="${esc(it.priority)}"></label>
          <label>สถานะ<select class="gl-input" data-e="status">${['unverified', 'autoChecked', 'reviewed'].map((r) => `<option ${r === it.status ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <button class="btn btn-primary" type="button" data-save>บันทึก + ตรวจซ้ำ</button><p class="gl-note" data-msg aria-live="polite"></p>
        </div></details></li>`).join('')}</ul>
      <div class="admin-pager"><button class="mini-btn ghost" type="button" data-pg="-1" ${d.page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button><button class="mini-btn ghost" type="button" data-pg="1" ${d.page >= pages ? 'disabled' : ''}>ถัดไป</button></div>`;
    list.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { AD.page += Number(b.dataset.pg); loadAdminList(box); }));
    list.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('[data-id]'); const body = {};
      li.querySelectorAll('[data-e]').forEach((x) => { body[x.dataset.e] = x.dataset.e === 'realWorldPriority' ? Number(x.value) : x.value; });
      const msg = li.querySelector('[data-msg]'); b.disabled = true;
      try { await App().api(`/admin/c2/${encodeURIComponent(li.dataset.id)}`, { method: 'PATCH', body }); msg.textContent = 'บันทึกแล้ว'; loadAdminList(box); } catch (err) {
        msg.textContent = `${err.message}${err.data && err.data.errors ? `: ${err.data.errors.join(' · ')}` : ''}`; b.disabled = false;
      }
    }));
  }

  /** เปิดจาก router: open('hub') · open('lesson', unitId) · open('practice', mode) */
  function open(kind, param) {
    if (kind === 'lesson' && param) return openLesson(param);
    if (kind === 'practice') return openPractice(param || 'mixed');
    return openHub();
  }
  window.EQC2 = { open, openHub, openLesson, openPractice, mountAdmin, _toKit: toKit, _markTarget: markTarget };
}());
