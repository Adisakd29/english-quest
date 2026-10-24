/* =====================================================================
   Lesson Kit — ส่วนประกอบกลางที่ใช้ร่วมกันระหว่าง Vocabulary และ Grammar (window.EQLesson)
   - LessonProgress   : แถบ "Step x / N" + จุดความคืบหน้า (จุดแบบเดียวกับรอยเท้าในโหมดคำศัพท์)
   - ExpReward        : +EXP ลอยขึ้นเบา ๆ + อัปเดตแถบ EXP/เลเวลบัญชีทันที (EXP ระบบเดียว)
   - Collapsible      : ส่วนพับ/กางที่เข้าถึงได้ (aria-expanded/controls, Enter/Space, inert ตอนปิด, จำสถานะ)
   - ExerciseRenderer : วาด/เก็บคำตอบ/ผูกเหตุการณ์ของแบบฝึกทุกชนิด + feedback
     mc · choose · dialogue · context · fill · order · error · transform · match · write
     + drag (ลากคำลงช่องว่าง) · detect (แตะคำที่ผิด) · tf (ถูก/ผิด) · pattern (เลือกรูปแบบไวยากรณ์)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const esc = (s) => (App() ? App().escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const hl = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, '<mark class="gl-hl">$1</mark>');
  const blank = (s) => hl(s).replace(/_{2,}/g, '<span class="gl-blank" aria-label="ช่องว่าง">&nbsp;</span>');
  const sfx = (n) => { if (window.EQAudio) window.EQAudio.sfx(n); };
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KIND_ICON = { dialogue: 'message-circle', conversation: 'message-circle', email: 'mail', message: 'message-square-text', story: 'book', announcement: 'flag', school: 'graduation-cap', travel: 'map-pin', work: 'briefcase', social: 'users' };

  /* ---------------- LessonProgress ---------------- */
  /** จุดความคืบหน้า (ใช้ทั้งรอบคำศัพท์และขั้นบทเรียนแกรมม่า) */
  function footprints(wrap, total, index, results = null) {
    wrap.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const fp = document.createElement('div');
      fp.className = 'footprint';
      if (i < index) fp.classList.add('done');
      if (i === index) fp.classList.add('current');
      if (results && results[i] === false) fp.classList.add('missed');
      wrap.appendChild(fp);
    }
  }
  /** แถบ "Step 4 / 12" + เปอร์เซ็นต์ (แสดงตลอดว่ากำลังเรียนถึงไหน) */
  function progress(current, total, { label = 'Step', title = '' } = {}) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    return `<div class="lk-progress" role="group" aria-label="${esc(`${title ? `${title} · ` : ''}${label} ${Math.min(current + 1, total)} จาก ${total}`)}">
      <div class="lk-progress-top"><span><b>${label} ${Math.min(current + 1, total)}</b> / ${total}</span><span class="lk-progress-pct">${pct}%</span></div>
      <div class="lk-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div></div>`;
  }

  /* ---------------- ExpReward ---------------- */
  function floatExp(amount, anchor = null) {
    if (!amount) return;
    const hud = document.getElementById('hud-exp-wrap');
    const target = anchor && anchor.getBoundingClientRect ? anchor : hud;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'exp-pop';
    el.textContent = `+${amount} EXP`;
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${Math.max(8, rect.top)}px`;
    el.style.fontSize = '0.85rem';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
    if (hud) { hud.classList.remove('exp-bump'); void hud.offsetWidth; hud.classList.add('exp-bump'); }
  }
  /** ผล EXP จากเซิร์ฟเวอร์ { exp|gained, levelInfo, leveledUp } -> ลอย +EXP + อัปเดต HUD (แหล่ง EXP เดียวของบัญชี) */
  function expReward(res, anchor = null) {
    if (!res) return;
    const n = res.exp !== undefined ? res.exp : res.gained;
    if (n > 0) floatExp(n, anchor);
    const live = document.getElementById('lk-live');
    if (live && n > 0) live.textContent = `ได้รับ ${n} EXP`;
    if (res.levelInfo && App() && App().applyLevelInfo) App().applyLevelInfo(res.levelInfo, res.leveledUp);
  }

  /* ---------------- Collapsible ---------------- */
  const CX_KEY = 'eq_cx';
  const cxStore = (() => {
    let mem = {};
    try { mem = JSON.parse(sessionStorage.getItem(CX_KEY) || localStorage.getItem(CX_KEY) || '{}') || {}; } catch (_) { mem = {}; }
    const save = () => { const v = JSON.stringify(mem); try { sessionStorage.setItem(CX_KEY, v); } catch (_) { /* - */ } try { localStorage.setItem(CX_KEY, v); } catch (_) { /* - */ } };
    return { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = Boolean(v); save(); } };
  })();
  /**
   * ส่วนพับ/กาง: ปุ่มจริง (Enter/Space ได้ในตัว) + aria-expanded/aria-controls · ตอนปิดใช้ inert (ไม่ถูกโฟกัส/ไม่ถูกอ่าน)
   * ใช้ grid-template-rows 0fr↔1fr (ความสูงจริงของเนื้อหา) จึงไม่กระตุก/ไม่ต้องเดา max-height
   */
  function collapsible({ id, key = id, open = true, labels = ['ซ่อนหัวข้อ', 'แสดงหัวข้อ'], extra = '', content = '', btnClass = '' }) {
    const isOpen = cxStore.get(key, open);
    return {
      open: isOpen,
      button: `<button type="button" class="lk-cx-btn ${btnClass}" data-cx-toggle="${esc(id)}" data-cx-key="${esc(key)}" data-cx-labels="${esc(labels.join('|'))}"
        aria-expanded="${isOpen}" aria-controls="${esc(id)}"><span class="lk-cx-label">${esc(isOpen ? labels[0] : labels[1])}</span>${extra ? `<small>${esc(extra)}</small>` : ''}${ICON('chevron-down', 'icon icon-sm lk-cx-chev')}</button>`,
      panel: `<div class="lk-cx" id="${esc(id)}" data-open="${isOpen}" ${isOpen ? '' : 'inert'}><div class="lk-cx-inner">${content}</div></div>`,
    };
  }
  function setOpen(btn, open) {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    const labels = (btn.dataset.cxLabels || 'ซ่อน|แสดง').split('|');
    btn.setAttribute('aria-expanded', String(open));
    const lab = btn.querySelector('.lk-cx-label'); if (lab) lab.textContent = open ? labels[0] : labels[1];
    panel.dataset.open = String(open);
    if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
    const sec = btn.closest('[data-cx-section]'); if (sec) sec.classList.toggle('is-open', open);
    cxStore.set(btn.dataset.cxKey || panel.id, open);
  }
  // คลิกเดียว (delegation) — ปุ่มพับ/กางไม่สั่งวาดหน้าใหม่ทั้งหน้า จึงไม่เสียตำแหน่งเลื่อน/โฟกัส
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-cx-toggle]');
    if (!btn) return;
    e.preventDefault();
    setOpen(btn, btn.getAttribute('aria-expanded') !== 'true');
  });

  /* ---------------- Exercise Renderer ---------------- */
  function contextHtml(cx) {
    const icon = KIND_ICON[cx.kind] || 'message-circle';
    if (cx.kind === 'dialogue' || cx.kind === 'conversation' || cx.lines.some((l) => l.speaker)) {
      return `<figure class="gl-ctx gl-ctx-chat">${cx.title ? `<figcaption>${ICON(icon, 'icon icon-sm')} ${esc(cx.title)}</figcaption>` : ''}
        ${cx.lines.map((l, i) => `<p class="gl-bubble ${i % 2 ? 'r' : 'l'}" lang="en">${l.speaker ? `<b>${esc(l.speaker)}</b>` : ''}<span>${blank(l.text)}</span></p>`).join('')}</figure>`;
    }
    return `<figure class="gl-ctx gl-ctx-doc gl-ctx-${esc(cx.kind)}"><figcaption>${ICON(icon, 'icon icon-sm')} ${esc(cx.title || cx.kind)}</figcaption>
      ${cx.lines.map((l) => `<p lang="en">${blank(l.text)}</p>`).join('')}</figure>`;
  }
  const choicesHtml = (list) => `<div class="gl-choices" role="radiogroup" aria-label="ตัวเลือก">${list.map((c, k) => `<button type="button" role="radio" aria-checked="false" class="gl-choice" data-k="${k}" lang="en"><span class="gl-choice-key">${'ABCD'[k] || k + 1}</span><span>${blank(c)}</span></button>`).join('')}</div>`;

  function itemBody(it) {
    const prompt = it.prompt ? `<p class="gl-q-prompt">${esc(it.prompt)}</p>` : '';
    if (it.mode === 'drag') {
      const parts = hl(it.question).split(/_{2,}/);
      return `<p class="gl-q-prompt">ลากคำ (หรือแตะ) ไปวางในช่องว่าง</p>
        <p class="gl-q lk-drag-q" lang="en">${parts[0]}<span class="lk-drop" data-drop tabindex="-1" aria-label="ช่องว่าง — ยังไม่ได้วางคำ" aria-live="polite"></span>${parts.slice(1).join(' ___ ')}</p>
        <div class="lk-chips" data-chips aria-label="คำให้เลือก">${it.choices.map((c, k) => `<button type="button" class="lk-chip" data-k="${k}" lang="en">${esc(c)}</button>`).join('')}</div>`;
    }
    if (it.mode === 'detect') {
      return `<p class="gl-q-prompt">ประโยคนี้มีคำที่ผิด — แตะคำที่ผิด</p>
        <p class="gl-q lk-detect" lang="en" role="group" aria-label="คำในประโยค">${it.tokens.map((w, k) => `<button type="button" class="lk-tok" data-tok="${k}" aria-pressed="false">${esc(w)}</button>`).join(' ')}</p>`;
    }
    switch (it.type) {
      case 'mc': return `${prompt}<p class="gl-q" lang="en">${blank(it.question)}</p>${choicesHtml(it.choices)}`;
      case 'choose': return `${prompt}<p class="gl-q">${esc(it.question)}</p>${choicesHtml(it.choices)}`;
      case 'dialogue': return `${prompt}${contextHtml(it.context)}${it.question ? `<p class="gl-q">${esc(it.question)}</p>` : ''}${choicesHtml(it.choices)}`;
      case 'context': return `${prompt}${contextHtml(it.context)}<p class="gl-q" lang="en">${esc(it.question)}</p>${choicesHtml(it.choices)}`;
      case 'fill': {
        const parts = esc(it.question).replace(/\[\[(.+?)\]\]/g, '<mark class="gl-hl">$1</mark>').split(/_{2,}/);
        return `${prompt}<p class="gl-q gl-fill" lang="en">${parts[0]}<input class="gl-input gl-inline" type="text" data-ans autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="คำที่เติมในช่องว่าง" size="12">${parts.slice(1).join(' ___ ')}</p>
          ${it.hint ? `<p class="gl-hint">${ICON('lightbulb', 'icon icon-sm')} ${esc(it.hint)}</p>` : ''}`;
      }
      case 'order': return `${prompt || '<p class="gl-q-prompt">เรียงคำให้เป็นประโยคที่ถูกต้อง (แตะคำเพื่อวาง แตะอีกครั้งเพื่อเอาออก)</p>'}
        <div class="gl-order-line" data-line aria-label="ประโยคที่เรียง" aria-live="polite"><span class="gl-order-ph">แตะคำด้านล่าง</span></div>
        <div class="gl-order-bank" data-bank>${it.tokens.map((w, k) => `<button type="button" class="gl-token" data-tok="${k}" lang="en">${esc(w)}</button>`).join('')}</div>
        <button class="link-btn" type="button" data-order-reset>${ICON('rotate-ccw', 'icon icon-sm')} เริ่มเรียงใหม่</button>`;
      case 'error': return `${prompt || '<p class="gl-q-prompt">ประโยคนี้มีที่ผิด 1 จุด — แก้ให้ถูกแล้วพิมพ์ประโยคที่ถูกทั้งประโยค</p>'}
        <p class="gl-q gl-err-sentence" lang="en">${esc(it.sentence)}</p>
        <label class="gl-label" for="gl-ans-text">ประโยคที่แก้แล้ว</label>
        <textarea class="gl-input gl-textarea" id="gl-ans-text" data-ans rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" lang="en">${esc(it.sentence)}</textarea>`;
      case 'transform': return `${prompt}<p class="gl-q" lang="en">${esc(it.source)}</p><p class="gl-instruction">${ICON('pencil-line', 'icon icon-sm')} ${esc(it.instruction)}</p>
        <label class="gl-label" for="gl-ans-text">คำตอบ</label>
        <textarea class="gl-input gl-textarea" id="gl-ans-text" data-ans rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" lang="en"></textarea>`;
      case 'match': return `${prompt || '<p class="gl-q-prompt">จับคู่ให้ถูกต้อง</p>'}<ul class="gl-match">${it.left.map((l, i) => `<li>
        <label for="gl-m-${i}" lang="en">${esc(l)}</label>
        <select class="gl-input gl-select" id="gl-m-${i}" data-m="${i}"><option value="">— เลือก —</option>${it.right.map((r) => `<option value="${r.key}">${esc(r.text)}</option>`).join('')}</select></li>`).join('')}</ul>`;
      case 'write': return `${prompt}<p class="gl-q">${esc(it.task)}</p>
        <label class="gl-label" for="gl-ans-text">เขียนเป็นภาษาอังกฤษ${it.minSentences > 1 ? ` (อย่างน้อย ${it.minSentences} ประโยค)` : ''}</label>
        <textarea class="gl-input gl-textarea" id="gl-ans-text" data-ans rows="5" spellcheck="false" lang="en" autocapitalize="sentences"></textarea>
        <p class="gl-counter" data-counter aria-live="polite">0 คำ · 0 ประโยค</p>`;
      default: return '';
    }
  }
  function collect(it, box) {
    if (it.mode === 'drag') { const c = box.querySelector('[data-drop] .lk-chip'); return c ? Number(c.dataset.k) : null; }
    if (it.mode === 'detect') { const t = box.querySelector('.lk-tok[aria-pressed="true"]'); return t ? Number(t.dataset.tok) : null; }
    switch (it.type) {
      case 'mc': case 'choose': case 'dialogue': case 'context': {
        const b = box.querySelector('.gl-choice.is-sel'); return b ? Number(b.dataset.k) : null;
      }
      case 'fill': case 'error': case 'transform': case 'write': {
        const v = box.querySelector('[data-ans]').value.trim(); return v ? v : null;
      }
      case 'order': {
        if (box.querySelector('[data-bank] .gl-token')) return null;
        return [...box.querySelectorAll('[data-line] .gl-token')].map((b) => b.textContent);
      }
      case 'match': {
        const v = [...box.querySelectorAll('[data-m]')].map((s) => s.value);
        return v.every((x) => x !== '') ? v.map(Number) : null;
      }
      default: return null;
    }
  }
  /** ลากคำลงช่อง: แตะ/Enter = วาง · ลากด้วยนิ้ว/เมาส์ (pointer events + transform) · แตะคำในช่อง = เอาออก */
  function wireDrag(box, onReady) {
    const drop = box.querySelector('[data-drop]'); const bank = box.querySelector('[data-chips]');
    const place = (chip) => {
      if (box.dataset.locked) return;
      const cur = drop.querySelector('.lk-chip');
      if (cur && cur !== chip) bank.insertBefore(cur, [...bank.children].find((c) => Number(c.dataset.k) > Number(cur.dataset.k)) || null);
      if (chip.parentElement === drop) { bank.insertBefore(chip, [...bank.children].find((c) => Number(c.dataset.k) > Number(chip.dataset.k)) || null); }
      else drop.appendChild(chip);
      const now = drop.querySelector('.lk-chip');
      drop.classList.toggle('is-filled', Boolean(now));
      drop.setAttribute('aria-label', now ? `ช่องว่าง — วางคำ ${now.textContent}` : 'ช่องว่าง — ยังไม่ได้วางคำ');
      sfx('click'); onReady();
    };
    let drag = null;
    box.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.lk-chip');
      if (!chip || box.dataset.locked || e.button > 0) return;
      drag = { chip, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) { drag.moved = true; drag.chip.classList.add('is-drag'); try { drag.chip.setPointerCapture(e.pointerId); } catch (_) { /* - */ } }
      drag.chip.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      const r = drop.getBoundingClientRect();
      drop.classList.toggle('is-over', e.clientX > r.left - 12 && e.clientX < r.right + 12 && e.clientY > r.top - 16 && e.clientY < r.bottom + 16);
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag; drag = null;
      d.chip.classList.remove('is-drag'); d.chip.style.transform = '';
      const over = drop.classList.contains('is-over'); drop.classList.remove('is-over');
      if (d.moved) { d.chip.dataset.dragged = '1'; if (over && d.chip.parentElement !== drop) place(d.chip); }
    };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.lk-chip');
      if (!chip) return;
      if (chip.dataset.dragged) { delete chip.dataset.dragged; return; }   // จบการลากแล้ว ไม่ต้องนับเป็นแตะ
      place(chip);
    });
  }
  function wireItem(it, box, onReady) {
    if (it.mode === 'drag') { wireDrag(box, onReady); return; }
    if (it.mode === 'detect') {
      box.querySelectorAll('.lk-tok').forEach((b) => b.addEventListener('click', () => {
        if (box.dataset.locked) return;
        box.querySelectorAll('.lk-tok').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        sfx('click'); onReady();
      }));
      return;
    }
    box.querySelectorAll('.gl-choice').forEach((b) => b.addEventListener('click', () => {
      if (box.dataset.locked) return;
      box.querySelectorAll('.gl-choice').forEach((x) => { x.classList.toggle('is-sel', x === b); x.setAttribute('aria-checked', String(x === b)); });
      sfx('click'); onReady();
    }));
    const ans = box.querySelector('[data-ans]');
    if (ans) {
      ans.addEventListener('input', () => {
        onReady();
        const c = box.querySelector('[data-counter]');
        if (c) { const v = ans.value.trim(); const w = v ? v.split(/\s+/).length : 0; const s = v ? v.split(/[.!?]+/).filter((x) => x.trim()).length : 0; c.textContent = `${w} คำ · ${s} ประโยค`; }
        if (ans.classList.contains('gl-inline')) ans.size = Math.max(8, Math.min(28, ans.value.length + 2));
      });
      ans.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (ans.tagName === 'INPUT' || (!e.shiftKey && it.type !== 'write'))) { e.preventDefault(); const sub = document.querySelector('.screen:not(.hidden) [data-submit]'); if (sub && !sub.disabled) sub.click(); }
      });
      if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => { ans.focus({ preventScroll: true }); if (it.type === 'error') ans.setSelectionRange(ans.value.length, ans.value.length); }, 40);
    }
    if (it.type === 'order') {
      const line = box.querySelector('[data-line]'); const bank = box.querySelector('[data-bank]');
      const sync = () => { const ph = line.querySelector('.gl-order-ph'); if (ph) ph.hidden = Boolean(line.querySelector('.gl-token')); onReady(); };
      box.addEventListener('click', (e) => {
        const t = e.target.closest('.gl-token');
        if (!t || box.dataset.locked) return;
        (t.parentElement === bank ? line : bank).appendChild(t); sfx('click'); sync();
      });
      box.querySelector('[data-order-reset]').addEventListener('click', () => { [...line.querySelectorAll('.gl-token')].sort((a, b) => a.dataset.tok - b.dataset.tok).forEach((t) => bank.appendChild(t)); sync(); });
    }
    box.querySelectorAll('[data-m]').forEach((s) => s.addEventListener('change', onReady));
  }
  /** ล็อกข้อหลังตอบ + ทำเครื่องหมายถูก/ผิด + เติมคำตอบที่ถูกลงช่องว่าง (Interactive Example) */
  function lock(it, box, fb, ans) {
    box.dataset.locked = '1';
    box.querySelectorAll('input, textarea, select').forEach((x) => { x.readOnly = true; if (x.tagName === 'SELECT') x.disabled = true; });
    if (fb.answerIndex !== undefined) {
      box.querySelectorAll('.gl-choice, .lk-chip').forEach((b) => {
        const k = Number(b.dataset.k);
        b.classList.toggle('is-right', k === fb.answerIndex);
        b.classList.toggle('is-wrong', k === ans && !fb.correct);
        b.disabled = true;
      });
      // ประโยคเติมคำตอบที่ถูกให้อัตโนมัติ (เห็นประโยคสมบูรณ์ทันที)
      const right = it.choices ? it.choices[fb.answerIndex] : null;
      const slot = box.querySelector('.gl-q .gl-blank, .gl-bubble .gl-blank, .gl-ctx-doc .gl-blank');
      if (right && slot && ['mc', 'dialogue', 'context'].includes(it.type) && it.mode !== 'drag') {
        const m = document.createElement('mark'); m.className = 'lk-fillin'; m.textContent = right; slot.replaceWith(m);
      }
      const drop = box.querySelector('[data-drop]');
      if (drop && right) { drop.innerHTML = `<mark class="lk-fillin">${esc(right)}</mark>`; drop.classList.add('is-filled'); }
    }
    if (it.mode === 'detect') {
      box.querySelectorAll('.lk-tok').forEach((b) => {
        b.disabled = true;
        const w = b.textContent.toLowerCase().replace(/[^a-z']/g, '');
        const err = String(fb.expected || '').toLowerCase().split(/\s+/).map((x) => x.replace(/[^a-z']/g, ''));
        b.classList.toggle('is-right', err.includes(w));
        b.classList.toggle('is-wrong', Number(b.dataset.tok) === ans && !fb.correct);
      });
    }
  }
  function feedbackHtml(it, fb) {
    const alt = (fb.accepted || []).filter((a) => a !== fb.expected);
    let html = `<div class="gl-fb ${fb.correct ? 'ok' : 'bad'}" role="status">
      <p class="gl-fb-head">${ICON(fb.correct ? 'circle-check' : 'circle-x', 'icon')} <b>${fb.correct ? 'ถูกต้อง!' : (fb.partial ? `จับคู่ถูก ${Math.round(fb.partial * (it.left || []).length)} จาก ${(it.left || []).length}` : 'ยังไม่ถูก')}</b>${fb.exp ? `<span class="lk-fb-exp">+${fb.exp} EXP</span>` : ''}</p>`;
    if (fb.unchanged) html += `<p class="gl-fb-near">${ICON('info', 'icon icon-sm')} ยังไม่ได้แก้ประโยค — หาคำที่ผิด 1 จุดแล้วแก้ในช่องคำตอบ</p>`;
    if (fb.near) html += `<p class="gl-fb-near">${ICON('info', 'icon icon-sm')} เกือบถูกแล้ว — ตรวจตัวสะกดอีกครั้ง</p>`;
    if (fb.mode === 'detect') {
      html += `<p class="gl-fb-row"><span>คำที่ผิด</span><b lang="en">${esc(fb.expected)}</b></p><p class="gl-fb-row ok"><span>ประโยคที่ถูก</span><b lang="en">${esc(fb.corrected)}</b></p>`;
    } else if (!fb.correct && it.type !== 'write') {
      html += `<p class="gl-fb-row"><span>คำตอบของคุณ</span><b lang="en">${esc(fb.yours || '—')}</b></p>
        <p class="gl-fb-row"><span>คำตอบที่ถูก</span><b lang="en">${esc(fb.expected)}</b></p>`;
    } else if (fb.correct && alt.length) {
      html += `<p class="gl-fb-alt">ตอบแบบนี้ก็ถูก: <span lang="en">${alt.map(esc).join(' · ')}</span></p>`;
    }
    if (fb.yourMistake) html += `<p class="gl-fb-mine"><b>ทำไมคำตอบนี้ผิด:</b> ${esc(fb.yourMistake)}</p>`;
    if (fb.errorPart && !fb.correct && fb.mode !== 'detect') html += `<p class="gl-fb-row"><span>จุดที่ผิด</span><b lang="en">${esc(fb.errorPart)}</b></p>`;
    html += `<p class="gl-fb-explain">${esc(fb.explainTh)}</p>`;
    if (fb.structure) html += `<p class="gl-fb-struct"><span>โครงสร้าง</span><code lang="en">${esc(fb.structure)}</code></p>`;
    if (fb.example) html += `<p class="gl-fb-ex" lang="en">${hl(fb.example)}</p>`;
    if (fb.writing) {
      const errs = fb.writing.issues.filter((i) => i.severity === 'error'); const tips = fb.writing.issues.filter((i) => i.severity !== 'error');
      html += errs.length ? `<ul class="gl-fb-issues">${errs.map((i) => `<li>${esc(i.msgTh)}${i.suggestion ? ` <span class="gl-sugg">→ <span lang="en">${esc(i.suggestion)}</span></span>` : ''}</li>`).join('')}</ul>` : `<p class="gl-fb-good">${ICON('sparkles', 'icon icon-sm')} ไม่พบข้อผิดตามกฎที่ตรวจ — โครงสร้างถูกต้อง</p>`;
      if (tips.length) html += `<ul class="gl-fb-tips">${tips.map((i) => `<li>${esc(i.msgTh)}</li>`).join('')}</ul>`;
      html += `<p class="gl-fb-row"><span>ตัวอย่างคำตอบ</span><b lang="en">${esc(fb.sample)}</b></p><p class="gl-note">${esc(fb.writing.note)}</p>`;
    }
    if (fb.whyNot && fb.whyNot.length) {
      html += `<details class="gl-fb-whynot" ${fb.correct ? '' : 'open'}><summary>ทำไมข้ออื่นผิด?</summary><ul>${fb.whyNot.map((w) => `<li><b lang="en">${esc(w.choice)}</b> — ${esc(w.why)}</li>`).join('')}</ul></details>`;
    }
    if (fb.pairs && !fb.correct) html += `<ul class="gl-fb-pairs">${fb.pairs.map((p) => `<li lang="en">${esc(p[0])} → <b>${esc(p[1])}</b></li>`).join('')}</ul>`;
    return `${html}</div>`;
  }

  /* ---------------- Learn interactions (ไม่ใช่ข้อสอบ — ตอบแล้วเฉลยทันที) ---------------- */
  /** True / False: ประโยคนี้ถูกหรือผิด -> เฉลย + เหตุผล */
  function tfCard(c, i) {
    return `<li class="lk-tf" data-tf="${i}" data-ok="${c.isCorrect}">
      <p class="lk-tf-q" lang="en">${esc(c.sentence)}</p>
      <div class="lk-tf-btns" role="group" aria-label="ประโยคนี้ถูกหรือผิด"><button type="button" class="lk-tf-btn" data-tf-ans="true">${ICON('circle-check', 'icon icon-sm')} ถูก</button>
      <button type="button" class="lk-tf-btn" data-tf-ans="false">${ICON('circle-x', 'icon icon-sm')} ผิด</button></div>
      <div class="lk-tf-reveal" aria-live="polite" hidden>
        <p class="lk-tf-verdict"></p>
        <p class="gl-wrong" lang="en">${ICON('circle-x', 'icon icon-sm')}<span><s>${esc(c.wrong)}</s></span></p>
        <p class="gl-right" lang="en">${ICON('circle-check', 'icon icon-sm')}<span>${esc(c.right)}</span></p>
        <p class="gl-why">${esc(c.whyTh)}</p></div></li>`;
  }
  function wireTf(root, onAll) {
    root.querySelectorAll('[data-tf]').forEach((card) => card.querySelectorAll('[data-tf-ans]').forEach((b) => b.addEventListener('click', () => {
      if (card.dataset.done) return;
      card.dataset.done = '1';
      const ok = (b.dataset.tfAns === 'true') === (card.dataset.ok === 'true');
      card.classList.add(ok ? 'is-ok' : 'is-bad');
      b.classList.add('is-picked');
      card.querySelectorAll('[data-tf-ans]').forEach((x) => { x.disabled = true; });
      const rv = card.querySelector('.lk-tf-reveal'); rv.hidden = false;
      rv.querySelector('.lk-tf-verdict').textContent = `${ok ? 'ใช่เลย' : 'ยังไม่ใช่'} — ประโยคนี้${card.dataset.ok === 'true' ? 'ถูก' : 'ผิด'}`;
      sfx(ok ? 'correct' : 'incorrect');
      if (root.querySelectorAll('[data-tf]:not([data-done])').length === 0 && onAll) onAll();
    })));
  }
  /** Select Grammar Pattern (Discovery): เลือกรูปแบบก่อน แล้วเผยกฎ */
  function patternHtml(c) {
    return `<p class="lk-ask">${esc(c.prompt)}</p>
      <div class="gl-choices lk-pattern" role="radiogroup" aria-label="รูปแบบไวยากรณ์">${c.choices.map((f, k) => `<button type="button" role="radio" aria-checked="false" class="gl-choice" data-pat="${k}" lang="en"><span class="gl-choice-key">${'ABC'[k]}</span><span><code>${esc(f)}</code></span></button>`).join('')}</div>
      <div class="lk-reveal" data-reveal hidden aria-live="polite"><p class="lk-reveal-head"></p><p class="gl-formula" lang="en">${hl(c.reveal.formula)}</p>${c.reveal.tip ? `<p class="gl-tip">${ICON('lightbulb', 'icon icon-sm')} ${hl(c.reveal.tip)}</p>` : ''}</div>`;
  }
  function wirePattern(root, c, onDone) {
    root.querySelectorAll('[data-pat]').forEach((b) => b.addEventListener('click', () => {
      if (root.dataset.patDone) return;
      root.dataset.patDone = '1';
      const k = Number(b.dataset.pat); const ok = k === c.answer;
      root.querySelectorAll('[data-pat]').forEach((x) => { x.disabled = true; x.setAttribute('aria-checked', String(x === b)); x.classList.toggle('is-right', Number(x.dataset.pat) === c.answer); x.classList.toggle('is-wrong', x === b && !ok); });
      const rv = root.querySelector('[data-reveal]'); rv.hidden = false;
      rv.querySelector('.lk-reveal-head').textContent = ok ? 'เยี่ยม! คุณค้นพบกฎเองแล้ว' : 'ใกล้แล้ว — รูปแบบที่ถูกคือ';
      sfx(ok ? 'correct' : 'incorrect');
      if (onDone) onDone(ok);
    }));
  }

  window.EQLesson = {
    esc, hl, blank, ICON, reduced,
    footprints, progress, floatExp, expReward, collapsible, setCollapsed: setOpen, cxStore,
    contextHtml, itemBody, collect, wireItem, lock, feedbackHtml, tfCard, wireTf, patternHtml, wirePattern,
  };
})();
