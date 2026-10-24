/* =====================================================================
   Learn Grammar (A1–C1) — window.EQGrammar
   Learn → Practice → Make mistakes → Understand → Review → Master → Compete
   หน้าจอ: hub (Learning Map) · topic (บทเรียน 6 ขั้น) · practice (ผู้เล่นแบบฝึก 10 รูปแบบ) · placement · mistakes · progress · writing
   ตรวจคำตอบที่เซิร์ฟเวอร์ (/api/gl) · ไม่เลื่อนข้อเอง (ผู้เรียนกด "ข้อต่อไป" เอง)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/gl${p}`, o);
  const esc = (s) => App().escapeHtml(String(s == null ? '' : s));
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  // ส่วนประกอบกลาง (public/js/lesson-kit.js) — ใช้ร่วมกับโหมดคำศัพท์
  const K = window.EQLesson;
  const { hl, blank } = K;
  const sfx = (n) => { if (window.EQAudio) window.EQAudio.sfx(n); };
  const LEVEL_COLOR = { A1: 'a1', A2: 'a2', B1: 'b1', B2: 'b2', C1: 'c1' };
  const STATUS_TH = { new: 'ยังไม่เริ่ม', learning: 'กำลังเรียน', weak: 'ควรฝึกเพิ่ม', mastered: 'เชี่ยวชาญ' };
  const STEP_TH = ['Concept', 'Structure', 'Examples', 'Common Mistakes', 'Compare', 'Practice'];
  const STEP_SUB = ['คืออะไร ใช้เมื่อไร', 'โครงสร้าง', 'ตัวอย่าง', 'จุดที่มักผิด', 'เปรียบเทียบ', 'แบบฝึก'];
  const S = { hub: null, topic: null, lesson: null, step: 0, sess: null, placement: null, mistakes: { filters: {} }, progressRange: '7' };

  const root = (id) => document.getElementById(`${id}-root`);
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p>
      <button class="btn btn-secondary" type="button" data-gl-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-gl-retry]').addEventListener('click', retry);
  }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(`${id}-title`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function setHashParam(path, param) {
    const target = `#/${path}${param ? `/${param}` : ''}`;
    if (location.hash !== target) history.replaceState(null, '', target);
  }

  /* =====================================================================
     HUB — Grammar Learning Map
     ===================================================================== */
  async function openHub() {
    App().showScreen('screen-gl');
    const el = root('screen-gl');
    if (!S.hub) loading(el);
    try { S.hub = await api('/hub'); renderHub(S.hub); } catch (err) { errorBox(el, err, openHub); }
    focusTitle('screen-gl');
  }
  const STATE_META = {
    locked: { th: 'ล็อก', icon: 'lock' }, available: { th: 'เริ่มเรียนได้', icon: 'play' },
    in_progress: { th: 'กำลังเรียน', icon: 'clock' }, completed: { th: 'ผ่านแล้ว', icon: 'circle-check' }, mastered: { th: 'เชี่ยวชาญ', icon: 'crown' },
  };
  /** การ์ด "เรียนต่อ" — กลับไปขั้นเดิมของบทล่าสุดได้ทันที (ข้อมูลจากเซิร์ฟเวอร์ ใช้ได้ทุกเครื่อง) */
  function continueCard(c) {
    if (!c) return '';
    return `<button class="gl-continue lv-${LEVEL_COLOR[c.cefr]}" type="button" data-gl-lesson="${esc(c.topicId)}">
      <span class="gl-mastery gl-continue-ring" style="--p:${c.percent}" aria-hidden="true">${c.percent}%</span>
      <span class="gl-continue-text"><small>Continue Learning · ${esc(c.cefr)}</small><b lang="en">${esc(c.title)}</b><span>Step ${c.step} of ${c.total} · ${esc(c.titleTh)}</span></span>
      <span class="gl-continue-go">เรียนต่อ ${ICON('chevron-right', 'icon icon-sm')}</span></button>`;
  }
  function topicButton(t, i) {
    const ls = t.lesson || { state: 'available', step: 0, total: 12 };
    const m = STATE_META[ls.state] || STATE_META.available;
    const sub = ls.state === 'in_progress' && ls.step > 0 && !ls.runFinished ? `Step ${Math.min(ls.step + 1, ls.total)}/${ls.total}` : m.th;
    return `<li><button class="gl-topic is-${ls.state}" type="button" data-gl-topic="${esc(t.id)}" ${ls.state === 'locked' ? 'data-locked="1"' : ''} ${t.available ? '' : 'disabled'}
        aria-label="${esc(`บทที่ ${i + 1} ${t.title} — ${t.titleTh} · ${sub}${t.mastery !== null ? ` · mastery ${t.mastery}%` : ''}`)}">
        <span class="gl-topic-no" aria-hidden="true">${ls.state === 'locked' || ls.state === 'completed' || ls.state === 'mastered' ? ICON(m.icon, 'icon icon-sm') : i + 1}</span>
        <span class="gl-topic-text"><b lang="en">${esc(t.title)}</b><small>${esc(t.titleTh)}</small></span>
        <span class="gl-topic-state">${ls.state === 'in_progress' ? `<span class="gl-mastery" style="--p:${ls.percent}">${ls.percent}%</span>` : t.mastery !== null && ls.state !== 'locked' ? `<span class="gl-mastery" style="--p:${t.mastery}">${t.mastery}%</span>` : ''}<small>${esc(sub)}</small></span>
      </button></li>`;
  }
  function renderHub(h) {
    const el = root('screen-gl');
    const lvl = h.level;
    const srcTh = h.levelSource === 'placement' ? 'จากแบบทดสอบวัดระดับแกรมม่า' : h.levelSource === 'placement-legacy' ? 'จากแบบทดสอบวัดระดับรวม (ส่วนแกรมม่า)' : 'ยังไม่ได้วัดระดับ';
    const recs = (h.recommendations || []).map((r) => `<li><button class="gl-rec" type="button" data-gl-act="${esc(r.action.to)}" ${r.action.topicId ? `data-topic="${esc(r.action.topicId)}"` : ''}>
        <span class="gl-rec-icon">${ICON({ placement: 'compass', review: 'refresh-cw', mistakes: 'circle-alert', drop: 'chart-column', next: 'play' }[r.kind] || 'sparkles')}</span>
        <span class="gl-rec-text"><b>${esc(r.titleTh)}</b><small>${esc(r.textTh)}</small></span>${ICON('chevron-right')}</button></li>`).join('');
    const defaultOpen = lvl || (h.levels.find((L) => L.completed < L.total) || h.levels[0]).id;
    const levels = h.levels.map((L) => {
      const pct = Math.round((L.completed / L.total) * 100);
      const cx = K.collapsible({
        id: `gl-lvt-${L.id}`, key: `gl-lv-${L.id}`, open: L.id === defaultOpen, labels: ['ซ่อนหัวข้อ', 'แสดงหัวข้อ'],
        extra: `${L.total} บท`, btnClass: 'gl-level-toggle', content: `<ol class="gl-topics">${L.topics.map(topicButton).join('')}</ol>`,
      });
      return `<section class="gl-level lv-${LEVEL_COLOR[L.id]} ${lvl === L.id ? 'is-current' : ''} ${cx.open ? 'is-open' : ''}" data-cx-section aria-labelledby="gl-lv-${L.id}">
        <header class="gl-level-head">
          <span class="gl-cefr">${L.id}</span>
          <div><h2 id="gl-lv-${L.id}">${esc(L.title)} <small>${esc(L.titleTh)}</small></h2><p>${esc(L.desc)}</p></div>
          <div class="gl-level-prog" aria-label="ผ่าน ${L.completed} จาก ${L.total} บท · เชี่ยวชาญ ${L.mastered} บท"><b>${L.completed}/${L.total}</b><span class="gl-bar"><span style="width:${pct}%"></span></span></div>
          ${cx.button}
        </header>
        ${cx.panel}
      </section>`;
    }).join('');
    el.innerHTML = `
      <header class="gl-hero">
        <div class="gl-hero-text">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} Learn Grammar</p>
          <h1 class="page-title" id="screen-gl-title">แกรมม่า A1–C1</h1>
          <p class="gl-sub">เรียนทีละขั้น → ลองทำ → รู้ผลทันที → ไปต่อ</p>
        </div>
        <div class="gl-levelcard">
          <span class="gl-levelcard-label">Grammar Level</span>
          <b class="gl-levelcard-val">${esc(lvl || '—')}</b>
          <small>${esc(srcTh)}${h.estimatedLevel && lvl && h.estimatedLevel !== lvl ? ` · ความคืบหน้าล่าสุดประเมินได้ ${esc(h.estimatedLevel)}` : ''}</small>
          <button class="btn ${lvl ? 'btn-secondary' : 'btn-primary'}" type="button" data-gl-act="placement">${ICON('compass', 'icon icon-sm')} ${h.placementTaken ? 'วัดระดับใหม่' : 'วัดระดับแกรมม่า'}</button>
          <small class="gl-note">ระดับแกรมม่าแยกจากเลเวลบัญชี — แต่ EXP ที่ได้จากแกรมม่าเข้าเลเวลบัญชีเดียวกับคำศัพท์และ Ranked</small>
        </div>
      </header>
      ${continueCard(h.continue)}
      <div class="gl-tiles">
        <button class="gl-tile ${h.reviewDue ? 'is-hot' : ''}" type="button" data-gl-act="review">${ICON('refresh-cw')}<b>Review Today</b><span>${h.reviewDue ? `${h.reviewDue} ข้อถึงรอบทบทวน` : 'ไม่มีข้อค้างทบทวน'}</span></button>
        <button class="gl-tile ${h.daily.done ? 'is-done' : ''}" type="button" data-gl-act="daily">${ICON('target')}<b>Daily Challenge</b><span>${h.daily.done ? `วันนี้ทำแล้ว ${h.daily.score}/${h.daily.total}` : '7 ข้อ เน้นหัวข้อที่อ่อน'}${h.daily.streak ? ` · ต่อเนื่อง ${h.daily.streak} วัน` : ''}</span></button>
        <button class="gl-tile" type="button" data-gl-act="mistakes">${ICON('circle-alert')}<b>My Mistakes</b><span>ข้อที่เคยพลาด แยกตามหัวข้อ</span></button>
        <button class="gl-tile" type="button" data-gl-act="progress">${ICON('chart-column')}<b>Progress</b><span>Mastery · Badge ${h.badges}/${h.badgesTotal}</span></button>
        <button class="gl-tile" type="button" data-gl-act="writing">${ICON('pencil-line')}<b>Writing</b><span>เขียนเองแล้วรับคำอธิบาย</span></button>
      </div>
      ${recs ? `<section class="gl-section" aria-labelledby="gl-rec-title"><h2 class="gl-h2" id="gl-rec-title">${ICON('sparkles', 'icon icon-sm')} Recommended for you</h2><ul class="gl-recs">${recs}</ul></section>` : ''}
      <section class="gl-section" aria-labelledby="gl-map-title">
        <h2 class="gl-h2" id="gl-map-title">${ICON('map', 'icon icon-sm')} Grammar Learning Map</h2>
        <div class="gl-legend" aria-hidden="true">${Object.entries(STATE_META).map(([k, m]) => `<span class="lg-${k}">${ICON(m.icon, 'icon icon-sm')} ${m.th}</span>`).join('')}</div>
        <div class="gl-map">${levels}</div>
      </section>
      <section class="gl-section gl-more">
        <button class="home-link" type="button" data-gl-act="terms">${ICON('library')}<span>ศัพท์แกรมม่า (English + ไทย)</span>${ICON('chevron-right')}</button>
        <button class="home-link" type="button" data-nav-to="grammar-classic">${ICON('book')}<span>บทเรียนแกรมม่าชุดเดิม 16 บท · ข้อสอบ TOEIC/TOEFL</span>${ICON('chevron-right')}</button>
        <button class="gl-battle" type="button" data-gl-act="battle">
          <span class="gl-battle-icon">${ICON('swords', 'icon icon-lg')}</span>
          <span><b>Grammar Battle</b><small>โหมดแข่งขัน (Ranked) — นำสิ่งที่เรียนไปแข่ง คำถามตามระดับแกรมม่าของคุณ</small></span>${ICON('chevron-right')}
        </button>
      </section>`;
  }
  function lockedNotice(id) {
    const all = (S.hub ? S.hub.levels : []).flatMap((L) => L.topics);
    const i = all.findIndex((t) => t.id === id);
    const prev = i > 0 ? all[i - 1] : null;
    App().toast(prev && prev.lesson && prev.lesson.state !== 'locked'
      ? `บทนี้ยังล็อก — เรียน "${prev.title}" ให้ผ่าน (≥ 80%) ก่อน หรือวัดระดับแกรมม่าเพื่อปลดล็อก`
      : 'บทนี้ยังล็อก — เรียนบทก่อนหน้าให้ผ่าน หรือวัดระดับแกรมม่าเพื่อปลดล็อก', 'info');
  }

  /* =====================================================================
     TOPIC — ภาพรวมบทเรียน (12 ขั้น) · เนื้อหาฉบับเต็มอยู่ในส่วนพับได้
     ===================================================================== */
  const KIND_ICON_STEP = { concept: 'lightbulb', discover: 'search', structure: 'box', examples: 'book-open', context: 'message-circle', mistakes: 'circle-alert', review: 'list-checks', check: 'target' };
  async function openTopic(id) {
    App().showScreen('screen-gl-topic');
    setHashParam('grammar-topic', id);
    const el = root('screen-gl-topic');
    if (!S.lesson || S.lesson.topicId !== id) loading(el);
    try {
      const [ov, ref] = await Promise.all([api(`/lessons/${encodeURIComponent(id)}`), api(`/topics/${encodeURIComponent(id)}`)]);
      S.lesson = ov; S.topic = ref;
      renderOverview();
    } catch (err) { errorBox(el, err, () => openTopic(id)); }
    focusTitle('screen-gl-topic');
  }
  function renderOverview() {
    const ov = S.lesson; const t = S.topic; const el = root('screen-gl-topic');
    const m = STATE_META[ov.state] || STATE_META.available;
    const done = ov.runFinished;
    const primary = done ? 'เรียนรอบใหม่ (ชุดข้อใหม่)' : ov.current === 0 ? 'เริ่มเรียน Step 1' : `เรียนต่อ Step ${ov.current + 1}`;
    const steps = ov.steps.map((s) => {
      const st = s.done ? 'done' : s.k === ov.current && !done ? 'current' : s.k > ov.current ? 'todo' : 'open';
      return `<li><button class="gl-stepitem is-${st}" type="button" data-gl-goto="${s.k}" ${s.k > ov.current ? 'disabled' : ''}
          aria-label="${esc(`Step ${s.k + 1}: ${s.title} — ${s.th}${s.done ? ' (ผ่านแล้ว)' : st === 'current' ? ' (ขั้นปัจจุบัน)' : ''}`)}">
          <span class="gl-stepitem-ico" aria-hidden="true">${s.done ? ICON('check', 'icon icon-sm') : st === 'todo' ? ICON('lock', 'icon icon-sm') : ICON(s.icon || KIND_ICON_STEP[s.kind], 'icon icon-sm')}</span>
          <span class="gl-stepitem-text"><b>Step ${s.k + 1} · ${esc(s.title)}</b><small>${esc(s.th)}${s.items ? ` · ${s.items} ข้อ` : ''}</small></span>
          ${s.kind === 'check' ? `<span class="gl-stepitem-tag">${ICON('pencil-line', 'icon icon-sm')}</span>` : ''}</button></li>`;
    }).join('');
    const ref = K.collapsible({
      id: 'gl-ref', key: 'gl-ref', open: false, labels: ['ซ่อนเนื้อหาฉบับเต็ม', 'ดูเนื้อหาฉบับเต็ม'], btnClass: 'gl-ref-toggle',
      content: [0, 1, 2, 3, ...(t.compare && t.compare.rows && t.compare.rows.length ? [4] : [])].map((k) => `<section class="gl-ref-sec"><h2 class="gl-h3">${esc(STEP_TH[k])} <small>${esc(STEP_SUB[k])}</small></h2>${stepHtml(t, k)}</section>`).join(''),
    });
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gl-act="hub">${ICON('arrow-left', 'icon icon-sm')} แกรมม่า</button>
      <header class="gl-topic-head lv-${LEVEL_COLOR[t.cefr]}">
        <span class="gl-cefr">${esc(t.cefr)}</span>
        <div><h1 class="page-title" id="screen-gl-topic-title" lang="en">${esc(t.title)}</h1><p class="gl-sub">${esc(t.titleTh)} · ${esc(t.summaryTh || '')}</p></div>
        ${ov.mastery !== null ? `<span class="gl-mastery gl-mastery-lg" style="--p:${ov.mastery}" aria-label="mastery ${ov.mastery}%">${ov.mastery}%</span>` : ''}
      </header>
      <section class="gl-card gl-lesson-card">
        <p class="gl-state is-${ov.state}">${ICON(m.icon, 'icon icon-sm')} ${m.th}${ov.bestAccuracy !== null ? ` · ดีที่สุด ${ov.bestAccuracy}%` : ''}</p>
        ${K.progress(Math.min(ov.current, ov.total), ov.total, { title: t.title })}
        ${done ? `<p class="gl-note">รอบล่าสุด: ความแม่น ${ov.lastAccuracy}% ${ov.lastAccuracy >= ov.passPct ? '— ผ่านบทเรียน' : `— ต้องได้ ${ov.passPct}% ขึ้นไปจึงจะผ่าน`}</p>` : ''}
        ${ov.state === 'locked' ? `<p class="gl-tip">${ICON('lock', 'icon icon-sm')} บทนี้ยังล็อกบนแผนที่ (เรียนบทก่อนหน้าให้ผ่านก่อน) — แต่เปิดเรียนจากลิงก์นี้ได้</p>` : ''}
        <div class="gl-actions"><button class="btn btn-primary" type="button" data-gl-act="${done ? 'lesson-restart' : 'lesson'}" data-topic="${esc(t.id)}">${ICON('play', 'icon icon-sm')} ${primary}</button></div>
        <p class="gl-note">เรียนทีละขั้นสั้น ๆ (ประมาณ 30 วินาที – 2 นาที) · ผ่านบทเมื่อตอบถูก ≥ ${ov.passPct}% · บันทึกอัตโนมัติ เรียนต่อเครื่องไหนก็ได้</p>
      </section>
      <section class="gl-section" aria-labelledby="gl-steps-title">
        <h2 class="gl-h2" id="gl-steps-title">${ICON('list-checks', 'icon icon-sm')} ขั้นตอนบทเรียน</h2>
        <ol class="gl-steplist">${steps}</ol>
      </section>
      <section class="gl-section gl-ref" data-cx-section>
        ${ref.button}${ref.panel}
      </section>
      <section class="gl-card gl-practice-card">
        <h2 class="gl-h3">${ICON('pencil-line', 'icon icon-sm')} ฝึกเพิ่ม (นอกบทเรียน)</h2>
        <p class="gl-note">แบบฝึก ${t.practiceCount} ข้อ · ${t.practiceTypes.length} รูปแบบ · ข้อที่พลาดกลับมาให้ทบทวนตามรอบ 1 · 3 · 7 · 14 · 30 วัน</p>
        <div class="gl-actions">
          <button class="btn btn-secondary" type="button" data-gl-act="practice" data-topic="${esc(t.id)}">ฝึก 10 ข้อ</button>
          <button class="btn btn-secondary" type="button" data-gl-act="practice-all" data-topic="${esc(t.id)}">ฝึกครบทุกข้อ (${t.practiceCount})</button>
        </div></section>
      <nav class="gl-topic-pager" aria-label="หัวข้ออื่น">
        ${t.prev ? `<button class="link-btn" type="button" data-gl-topic="${esc(t.prev.id)}">${ICON('chevron-left', 'icon icon-sm')} ${esc(t.prev.title)}</button>` : '<span></span>'}
        ${t.next ? `<button class="link-btn" type="button" data-gl-topic="${esc(t.next.id)}">${esc(t.next.title)} ${ICON('chevron-right', 'icon icon-sm')}</button>` : '<span></span>'}
      </nav>`;
  }

  /* =====================================================================
     LESSON PLAYER — ทีละขั้น: Learn → Quick Check → Learn → Practice → … → Challenge → Review → Mastery Check
     ===================================================================== */
  const LP = { topicId: null, k: 0, data: null, idx: 0, total: 0, title: '', expRun: 0 };
  async function openLesson(topicId, k = null) {
    App().showScreen('screen-gl-lesson');
    setHashParam('grammar-lesson', topicId);
    const el = root('screen-gl-lesson');
    loading(el);
    try {
      const [ov, ref] = await Promise.all([api(`/lessons/${encodeURIComponent(topicId)}`),
        S.topic && S.topic.id === topicId ? Promise.resolve(S.topic) : api(`/topics/${encodeURIComponent(topicId)}`)]);
      S.topic = ref;
      if (ov.runFinished && k === null) { openTopic(topicId); return; }   // จบรอบแล้ว -> ภาพรวม (เลือกเรียนรอบใหม่เอง)
      Object.assign(LP, { topicId, total: ov.total, title: ov.title, ov, expRun: 0 });
      await loadStep(k === null ? Math.min(ov.current, ov.total - 1) : k);
    } catch (err) { errorBox(el, err, () => openLesson(topicId, k)); }
  }
  async function loadStep(k) {
    const el = root('screen-gl-lesson');
    try {
      LP.data = await api(`/lessons/${encodeURIComponent(LP.topicId)}/steps/${k}`);
      LP.k = k; LP.total = LP.data.total;
      const items = (LP.data.content.items || []);
      LP.idx = items.findIndex((x) => LP.data.answered[x.id] === undefined);
      renderStep();
    } catch (err) { errorBox(el, err, () => loadStep(k)); }
  }
  function lessonTop(step) {
    const d = LP.data;
    return `<div class="gl-play-top">
        <button class="game-exit" type="button" data-lk-exit aria-label="ออกจากบทเรียน (บันทึกความคืบหน้าแล้ว)">${ICON('x', 'icon icon-sm')} ออก</button>
        <p class="gl-play-title" lang="en">${esc(d.title)}</p>
        <p class="gl-play-count" aria-live="polite">Step ${LP.k + 1}/${LP.total}</p>
      </div>
      ${K.progress(LP.k, LP.total, { title: d.title })}
      <div class="footprints lk-steps" data-lk-fp aria-hidden="true"></div>
      <p class="lk-kicker">${ICON(step.icon || KIND_ICON_STEP[step.kind], 'icon icon-sm')} ${esc(step.title)}<small>${esc(step.th)}</small></p>`;
  }
  function learnBody(step, c) {
    switch (step.kind) {
      case 'concept': return `<h1 class="lk-title" id="screen-gl-lesson-title">${esc(c.question)}</h1>
        <p class="gl-read">${esc(c.what)}</p>
        <ul class="lk-points">${c.when.map((w) => `<li>${hl(w)}</li>`).join('')}</ul>
        ${(() => { const more = K.collapsible({ id: 'lk-why', key: 'lk-why', open: false, labels: ['ซ่อนรายละเอียด', 'ทำไมต้องรู้ + ศัพท์แกรมม่า'], btnClass: 'lk-more-btn',
    content: `<p class="gl-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(c.why)}</p>${c.terms && c.terms.length ? `<ul class="lk-terms">${c.terms.map((x) => `<li><b lang="en">${esc(x.en)}</b><span>${esc(x.th)}</span></li>`).join('')}</ul>` : ''}` });
    return `<div class="lk-more">${more.button}${more.panel}</div>`; })()}`;
      case 'discover': return `<h1 class="lk-title" id="screen-gl-lesson-title">สังเกตแล้วลองหากฎเอง</h1>
        <p class="gl-sub">${esc(c.intro)}</p>
        <ol class="lk-examples">${c.examples.map((e) => `<li><p class="gl-example" lang="en">${hl(e.en)}</p><p class="gl-th">${esc(e.th)}</p></li>`).join('')}</ol>
        ${K.patternHtml(c)}`;
      case 'structure': return `<h1 class="lk-title" id="screen-gl-lesson-title">โครงสร้าง${c.formula ? '' : ` · ${esc(step.th)}`}</h1>
        ${c.formula ? `<div class="gl-card gl-formula-card"><p class="gl-formula-label">Formula</p><p class="gl-formula" lang="en">${hl(c.formula)}</p></div>` : ''}
        <div class="lk-rows">${c.rows.map((r) => `<section class="lk-row"><h2 class="gl-h4">${esc(r.label)}</h2>${r.formula ? `<p class="gl-formula-sm" lang="en">${hl(r.formula)}</p>` : ''}<p class="gl-example" lang="en">${hl(r.example)}</p></section>`).join('')}</div>
        ${c.notes.length ? `<ul class="lk-points lk-notes">${c.notes.map((n) => `<li>${hl(n)}</li>`).join('')}</ul>` : ''}`;
      case 'examples': return `<h1 class="lk-title" id="screen-gl-lesson-title">ตัวอย่างเพิ่มเติม</h1>
        <ol class="lk-examples">${c.examples.map((e) => `<li><p class="gl-example" lang="en">${hl(e.en)}</p><p class="gl-th">${esc(e.th)}</p></li>`).join('')}</ol>`;
      case 'context': return `<h1 class="lk-title" id="screen-gl-lesson-title">ในชีวิตจริง</h1>
        ${c.contexts.map(K.contextHtml).join('')}
        ${c.examples.length ? `<ol class="lk-examples">${c.examples.map((e) => `<li><p class="gl-example" lang="en">${hl(e.en)}</p><p class="gl-th">${esc(e.th)}</p></li>`).join('')}</ol>` : ''}`;
      case 'mistakes': return `<h1 class="lk-title" id="screen-gl-lesson-title">ประโยคไหนถูก ประโยคไหนผิด?</h1>
        <p class="gl-sub">แตะ "ถูก" หรือ "ผิด" แล้วดูเหตุผล — นี่คือจุดที่คนไทยพลาดบ่อย</p>
        <ul class="lk-tfs">${c.cards.map(K.tfCard).join('')}</ul>`;
      case 'review': return `<h1 class="lk-title" id="screen-gl-lesson-title">สรุปบทเรียน</h1>
        <p class="gl-sub">${esc(c.summaryTh || '')}</p>
        <div class="gl-card gl-formula-card"><p class="gl-formula-label">Formula</p><p class="gl-formula" lang="en">${hl(c.formula)}</p></div>
        <ul class="lk-recap">${c.rows.map((r) => `<li><span>${esc(r.label)}</span><code lang="en">${esc(String(r.formula || '').replace(/\[\[|\]\]/g, ''))}</code></li>`).join('')}</ul>
        ${c.notes.length ? `<ul class="lk-points lk-notes">${c.notes.map((n) => `<li>${hl(n)}</li>`).join('')}</ul>` : ''}
        ${c.compare ? `<div class="gl-table-wrap"><table class="gl-compare"><caption lang="en">${esc(c.compare.title)}</caption><tbody>${c.compare.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${hl(r.a)}</td><td>${hl(r.b)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <p class="gl-note">ขั้นสุดท้ายคือ Mastery Check — ตอบให้ได้ ≥ 80% ของทั้งบทเพื่อผ่าน</p>`;
      default: return '';
    }
  }
  function renderStep() {
    const step = LP.data.step; const c = LP.data.content;
    const el = root('screen-gl-lesson');
    if (step.kind === 'check') { renderCheck(); return; }
    const last = LP.k >= LP.total - 1;
    const gated = step.kind === 'discover' || step.kind === 'mistakes';
    el.innerHTML = `${lessonTop(step)}
      <article class="gl-card lk-card lk-${step.kind}">${learnBody(step, c)}</article>
      <div class="gl-play-actions lk-actions">
        ${LP.k > 0 ? `<button class="btn btn-secondary" type="button" data-lk-prev>${ICON('chevron-left', 'icon icon-sm')} ย้อนกลับ</button>` : ''}
        <button class="btn btn-primary" type="button" data-lk-next data-submit ${gated && !step.done ? 'disabled' : ''}>${last ? 'จบบทเรียน' : step.kind === 'review' ? 'ไป Mastery Check' : 'เข้าใจแล้ว ไปต่อ'} ${ICON('chevron-right', 'icon icon-sm')}</button>
      </div>
      ${gated && !step.done ? `<p class="gl-note lk-gate">${step.kind === 'discover' ? 'เลือกคำตอบก่อนเพื่อไปต่อ' : 'ตอบให้ครบทุกประโยคก่อนเพื่อไปต่อ'}</p>` : ''}`;
    wireLessonCommon(el);
    const next = el.querySelector('[data-lk-next]');
    const unlock = () => { next.disabled = false; const g = el.querySelector('.lk-gate'); if (g) g.remove(); };
    if (step.kind === 'discover') K.wirePattern(el.querySelector('.lk-card'), c, unlock);
    if (step.kind === 'mistakes') K.wireTf(el.querySelector('.lk-card'), unlock);
    next.addEventListener('click', () => completeStep(next));
    focusTitle('screen-gl-lesson');
  }
  function wireLessonCommon(el) {
    K.footprints(el.querySelector('[data-lk-fp]'), LP.total, LP.k);
    el.querySelector('[data-lk-exit]').addEventListener('click', () => { App().toast('บันทึกความคืบหน้าแล้ว — กลับมาเรียนต่อได้ทุกเครื่อง', 'info'); openTopic(LP.topicId); });
    const prev = el.querySelector('[data-lk-prev]');
    if (prev) prev.addEventListener('click', () => loadStep(LP.k - 1));
  }
  /** ขั้นแบบฝึก: ทีละข้อ · ตอบแล้วรู้ผลทันที · ข้อที่ตอบแล้ว (refresh/เปลี่ยนเครื่อง) ข้ามไปข้อถัดไปเอง */
  function renderCheck() {
    const step = LP.data.step; const items = LP.data.content.items;
    const el = root('screen-gl-lesson');
    const answered = LP.data.answered;
    if (LP.idx < 0) {        // ทำครบแล้ว
      const ok = items.filter((x) => answered[x.id]).length;
      el.innerHTML = `${lessonTop(step)}
        <article class="gl-card lk-card"><h1 class="lk-title" id="screen-gl-lesson-title">${esc(step.title)} เสร็จแล้ว</h1>
          <p class="gl-read">ถูก ${ok} จาก ${items.length} ข้อ</p></article>
        <div class="gl-play-actions lk-actions">
          ${LP.k > 0 ? `<button class="btn btn-secondary" type="button" data-lk-prev>${ICON('chevron-left', 'icon icon-sm')} ย้อนกลับ</button>` : ''}
          <button class="btn btn-primary" type="button" data-lk-next data-submit>${LP.k >= LP.total - 1 ? 'ดูผลบทเรียน' : 'ไปขั้นต่อไป'} ${ICON('chevron-right', 'icon icon-sm')}</button></div>`;
      wireLessonCommon(el);
      el.querySelector('[data-lk-next]').addEventListener('click', (e) => completeStep(e.currentTarget));
      focusTitle('screen-gl-lesson');
      return;
    }
    const it = items[LP.idx];
    el.innerHTML = `${lessonTop(step)}
      <article class="gl-item lk-item" aria-labelledby="screen-gl-lesson-title">
        <p class="gl-item-meta"><span class="gl-type" id="screen-gl-lesson-title">${esc(it.typeTh)}</span><span class="gl-item-topic">ข้อ ${LP.idx + 1}/${items.length}</span></p>
        <div class="gl-item-body" data-box>${K.itemBody(it)}</div>
        <div class="gl-feedback" data-fb aria-live="polite"></div>
        <div class="gl-play-actions"><button class="btn btn-primary btn-block" type="button" data-submit disabled>ตรวจคำตอบ</button></div>
      </article>`;
    wireLessonCommon(el);
    const box = el.querySelector('[data-box]'); const submit = el.querySelector('[data-submit]');
    const started = Date.now();
    K.wireItem(it, box, () => { submit.disabled = K.collect(it, box) === null; });
    submit.addEventListener('click', async () => {
      const ans = K.collect(it, box); if (ans === null) return;
      submit.disabled = true;
      try {
        const fb = await api(`/lessons/${encodeURIComponent(LP.topicId)}/steps/${LP.k}/answer`, { method: 'POST', body: { itemId: it.id, answer: ans, ms: Date.now() - started } });
        if (fb.counted) answered[it.id] = fb.correct;
        K.lock(it, box, fb, ans);
        el.querySelector('[data-fb]').innerHTML = K.feedbackHtml(it, fb);
        sfx(fb.correct ? 'correct' : 'incorrect');
        if (fb.exp) { LP.expRun += fb.exp; }
        K.expReward(fb, el.querySelector('.gl-fb-head'));
        const nextIdx = items.findIndex((x, i) => i > LP.idx && answered[x.id] === undefined);
        const acts = el.querySelector('.gl-play-actions');
        acts.innerHTML = `${!fb.correct ? '<button class="btn btn-secondary" type="button" data-retry>ลองตอบใหม่ (ไม่นับคะแนน)</button>' : ''}
          <button class="btn btn-primary" type="button" data-lk-go>${nextIdx >= 0 ? 'ข้อต่อไป' : LP.k >= LP.total - 1 ? 'ดูผลบทเรียน' : 'ไปขั้นต่อไป'} ${ICON('chevron-right', 'icon icon-sm')}</button>`;
        const go = acts.querySelector('[data-lk-go]');
        go.addEventListener('click', () => { if (nextIdx >= 0) { LP.idx = nextIdx; renderCheck(); } else completeStep(go); });
        const rt = acts.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', () => renderCheck());
        go.focus({ preventScroll: true });
        el.querySelector('[data-fb]').scrollIntoView({ block: 'nearest', behavior: K.reduced() ? 'auto' : 'smooth' });
      } catch (err) { App().toast(err.message, 'error'); submit.disabled = false; }
    });
    window.scrollTo(0, 0);
  }
  async function completeStep(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await api(`/lessons/${encodeURIComponent(LP.topicId)}/steps/${LP.k}/complete`, { method: 'POST' });
      if (r.exp) LP.expRun += r.exp;
      K.expReward(r, btn);
      S.hub = null;
      if (r.result) { renderLessonResult(r.result); return; }
      await loadStep(Math.min(LP.k + 1, LP.total - 1));
    } catch (err) {
      App().toast(err.message, 'error'); if (btn) btn.disabled = false;
      if (err.code === 'INCOMPLETE') loadStep(LP.k);
    }
  }
  function renderLessonResult(res) {
    const el = root('screen-gl-lesson');
    const all = S.topic && S.topic.id === LP.topicId ? S.topic : null;
    const next = all && all.next ? all.next : null;
    sfx(res.passed ? 'rank_progress' : 'click');
    el.innerHTML = `<div class="gl-summary lk-result ${res.passed ? 'is-pass' : 'is-fail'}">
      <p class="gl-kicker">${ICON(res.passed ? 'award' : 'target', 'icon icon-sm')} ${esc(LP.title)}</p>
      <h1 class="page-title" id="screen-gl-lesson-title">${res.passed ? 'ผ่านบทเรียนแล้ว!' : res.accuracy >= 60 ? 'เกือบแล้ว! อีกนิดเดียว' : 'ยังไม่ผ่าน — ลองอีกรอบนะ'}</h1>
      <div class="gl-score" style="--p:${res.accuracy}" role="img" aria-label="ความแม่น ${res.accuracy}%"><b>${res.accuracy}%</b><small>ถูก ${res.correct}/${res.total}</small></div>
      <ul class="gl-sum-stats">
        <li><span>EXP บทนี้</span><b>+${LP.expRun}</b></li>
        <li><span>เกณฑ์ผ่าน</span><b>${res.passPct}%</b></li>
        ${res.mastery !== null ? `<li><span>Mastery</span><b>${res.mastery}%</b></li>` : ''}
      </ul>
      <p class="gl-note">${res.passed ? (res.accuracy === 100 ? 'Perfect Lesson! ได้โบนัส EXP · ' : '') + 'ทบทวนหัวข้อนี้ใน Review Today อีกครั้งเพื่อปลดล็อกสถานะ "เชี่ยวชาญ" (mastery ≥ 85%)' : `ต้องตอบถูก ≥ ${res.passPct}% ของทั้งบท — ลองรอบใหม่ได้เลย (ชุดข้อใหม่)`}</p>
      ${(res.newBadges || []).length ? `<div class="gl-badges-new"><h2 class="gl-h3">${ICON('award', 'icon icon-sm')} ได้ Badge ใหม่</h2>${res.newBadges.map((b) => `<p class="gl-badge-row">${ICON(b.icon || 'award')}<b>${esc(b.title)}</b><small>${esc(b.descTh)}</small></p>`).join('')}</div>` : ''}
      <div class="gl-actions">
        ${res.passed && next ? `<button class="btn btn-primary" type="button" data-gl-topic="${esc(next.id)}">บทถัดไป: ${esc(next.title)} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
        ${!res.passed ? `<button class="btn btn-primary" type="button" data-gl-act="lesson-restart" data-topic="${esc(LP.topicId)}">${ICON('rotate-ccw', 'icon icon-sm')} เรียนรอบใหม่</button>` : ''}
        <button class="btn btn-secondary" type="button" data-gl-act="topic" data-topic="${esc(LP.topicId)}">ภาพรวมบทเรียน</button>
        <button class="btn btn-secondary" type="button" data-gl-act="hub">กลับแผนที่</button>
      </div></div>`;
    S.lesson = null;
    focusTitle('screen-gl-lesson');
  }

  function termsHtml(terms) {
    return `<ul class="gl-terms">${(terms || []).map((x) => `<li><b lang="en">${esc(x.en)}</b><span>${esc(x.th)}</span></li>`).join('')}</ul>`;
  }
  const contextHtml = (cx) => K.contextHtml(cx);
  function stepHtml(t, k) {
    switch (k) {
      case 0: return `
        <section class="gl-card"><h2 class="gl-h3">${ICON('lightbulb', 'icon icon-sm')} คืออะไร</h2><p class="gl-read">${esc(t.concept.what)}</p></section>
        <section class="gl-card"><h2 class="gl-h3">${ICON('clock', 'icon icon-sm')} ใช้เมื่อไร</h2><ul class="gl-list">${[].concat(t.concept.when).map((x) => `<li>${hl(x)}</li>`).join('')}</ul></section>
        <section class="gl-card"><h2 class="gl-h3">${ICON('target', 'icon icon-sm')} ใช้เพื่ออะไร</h2><p class="gl-read">${esc(t.concept.why)}</p></section>
        <section class="gl-card"><h2 class="gl-h3">${ICON('languages', 'icon icon-sm')} ศัพท์แกรมม่า</h2>${termsHtml(t.terms)}</section>`;
      case 1: return `
        <section class="gl-card gl-formula-card"><p class="gl-formula-label">Formula</p><p class="gl-formula" lang="en">${hl(t.structure.formula)}</p></section>
        <div class="gl-struct">${t.structure.rows.map((r) => `<section class="gl-card gl-struct-row"><h3 class="gl-h4">${esc(r.label)}</h3>
          ${r.formula ? `<p class="gl-formula-sm" lang="en">${hl(r.formula)}</p>` : ''}<p class="gl-example" lang="en">${hl(r.example)}</p></section>`).join('')}</div>
        ${(t.structure.notes || []).length ? `<section class="gl-card"><h2 class="gl-h3">${ICON('info', 'icon icon-sm')} จำให้ขึ้นใจ</h2><ul class="gl-list">${t.structure.notes.map((n) => `<li>${hl(n)}</li>`).join('')}</ul></section>` : ''}`;
      case 2: return `
        <ol class="gl-examples">${t.examples.map((e) => `<li><p class="gl-example" lang="en">${hl(e.en)}</p><p class="gl-th">${esc(e.th)}</p></li>`).join('')}</ol>
        <h2 class="gl-h3 gl-mt">${ICON('message-circle', 'icon icon-sm')} ในชีวิตจริง</h2>
        ${(t.contexts || []).map(contextHtml).join('')}`;
      case 3: return `<ul class="gl-mistakes">${t.mistakes.map((m) => `<li class="gl-card">
          <p class="gl-wrong" lang="en">${ICON('circle-x', 'icon icon-sm')}<span><s>${esc(m.wrong)}</s></span></p>
          <p class="gl-right" lang="en">${ICON('circle-check', 'icon icon-sm')}<span>${esc(m.right)}</span></p>
          <p class="gl-why">${esc(m.whyTh)}</p></li>`).join('')}</ul>`;
      case 4: {
        const c = t.compare;
        const [a, b] = String(c.title || '').split(/\s+vs\.?\s+/i);
        return `<section class="gl-card"><h2 class="gl-h3" lang="en">${esc(c.title)}</h2>
          <div class="gl-table-wrap"><table class="gl-compare"><thead><tr><th scope="col"></th><th scope="col" lang="en">${esc(a || 'A')}</th><th scope="col" lang="en">${esc(b || 'B')}</th></tr></thead>
          <tbody>${c.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${hl(r.a)}</td><td>${hl(r.b)}</td></tr>`).join('')}</tbody></table></div>
          ${c.tipTh ? `<p class="gl-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(c.tipTh)}</p>` : ''}
          ${(c.with || []).length ? `<div class="gl-related">${c.with.map((w) => `<button class="mini-btn" type="button" data-gl-topic="${esc(w.id)}">${ICON('book-open', 'icon icon-sm')} ${esc(w.title)}</button>`).join('')}</div>` : ''}</section>`;
      }
      default: {
        const st = t.stats; const l = t.lesson;
        return `<section class="gl-card gl-practice-card">
          <h2 class="gl-h3">${ICON('pencil-line', 'icon icon-sm')} แบบฝึก ${t.practiceCount} ข้อ · ${t.practiceTypes.length} รูปแบบ</h2>
          <ul class="gl-types">${t.practiceTypes.map((x) => `<li>${esc(x.th)}</li>`).join('')}</ul>
          <p class="gl-note">ตอบแล้วเห็นเหตุผลทันที · ข้อที่พลาดจะกลับมาให้ทบทวนตามรอบ (1 · 3 · 7 · 14 · 30 วัน)</p>
          ${st ? `<p class="gl-statline">Mastery <b>${st.mastery}%</b> · ตอบแล้ว ${st.attempts} ครั้ง · ถูก ${st.correct}${l && l.best !== null ? ` · ชุดล่าสุดดีที่สุด ${l.best}/${l.total}` : ''}</p>` : ''}
          <div class="gl-actions">
            <button class="btn btn-primary" type="button" data-gl-act="practice" data-topic="${esc(t.id)}">${ICON('play', 'icon icon-sm')} เริ่มฝึก (10 ข้อ)</button>
            <button class="btn btn-secondary" type="button" data-gl-act="practice-all" data-topic="${esc(t.id)}">ฝึกครบทุกข้อ (${t.practiceCount})</button>
          </div></section>`;
      }
    }
  }

  /* =====================================================================
     PRACTICE PLAYER — ใช้ร่วมกัน: บทเรียน / ทบทวน / Daily / Placement
     ===================================================================== */
  function playSession(sess, { kind, title, back = 'hub', backParam = null }) {
    S.sess = { ...sess, kind, title, back, backParam, idx: 0, results: {}, started: Date.now() };
    App().showScreen(kind === 'placement' ? 'screen-gl-placement' : 'screen-gl-practice');
    App().setLeaveGuard(null);
    renderItem();
  }
  const { itemBody, collect, wireItem, feedbackHtml } = K;
  function renderItem() {
    const ss = S.sess; const it = ss.items[ss.idx];
    const isPlacement = ss.kind === 'placement';
    const el = isPlacement ? root('screen-gl-placement') : root('screen-gl-practice');
    const n = ss.items.length;
    const dots = isPlacement ? '' : `<div class="gl-dots" aria-hidden="true">${ss.items.map((x, k) => `<span class="${ss.results[x.id] === true ? 'ok' : ss.results[x.id] === false ? 'bad' : ''} ${k === ss.idx ? 'now' : ''}"></span>`).join('')}</div>`;
    el.innerHTML = `
      <div class="gl-play-top">
        <button class="game-exit" type="button" data-gl-quit>${ICON('x', 'icon icon-sm')} ${isPlacement ? 'หยุดชั่วคราว' : 'ออก'}</button>
        <p class="gl-play-title">${esc(ss.title)}</p>
        <p class="gl-play-count" aria-live="polite">${isPlacement ? `ข้อ ${ss.progress.index}` : `ข้อ ${ss.idx + 1}/${n}`}</p>
      </div>
      ${dots}
      <article class="gl-item" aria-labelledby="gl-item-type">
        <p class="gl-item-meta"><span class="gl-type" id="gl-item-type">${esc(it.typeTh)}</span>
          ${isPlacement ? '' : `<span class="gl-cefr-sm lv-${LEVEL_COLOR[it.cefr]}">${esc(it.cefr)}</span><span class="gl-item-topic" lang="en">${esc(it.topicTitle)}</span>`}</p>
        <div class="gl-item-body" data-box>${itemBody(it)}</div>
        <div class="gl-feedback" data-fb aria-live="polite"></div>
        <div class="gl-play-actions">
          <button class="btn btn-primary btn-block" type="button" id="gl-submit" data-submit disabled>${isPlacement ? 'ยืนยันคำตอบ' : 'ตรวจคำตอบ'}</button>
        </div>
      </article>`;
    const box = el.querySelector('[data-box]'); const submit = el.querySelector('#gl-submit');
    const ready = () => { submit.disabled = collect(it, box) === null; };
    wireItem(it, box, ready);
    submit.addEventListener('click', () => submitItem(it, box, el));
    el.querySelector('[data-gl-quit]').addEventListener('click', quitSession);
    window.scrollTo(0, 0);
  }
  async function submitItem(it, box, el) {
    const ss = S.sess; const ans = collect(it, box);
    if (ans === null) return;
    const btn = el.querySelector('#gl-submit'); btn.disabled = true;
    const ms = Date.now() - (ss.itemStart || ss.started);
    if (ss.kind === 'placement') {
      try {
        const r = await api(`/placement/${ss.placementId}/answer`, { method: 'POST', body: { itemId: it.id, answer: ans } });
        if (r.done) { showPlacementResult(r.result); return; }
        ss.items = [r.item]; ss.idx = 0; ss.progress = r.progress; renderItem();
      } catch (err) { App().toast(err.message, 'error'); btn.disabled = false; }
      return;
    }
    try {
      const fb = await api(`/sessions/${ss.sessionId}/answer`, { method: 'POST', body: { itemId: it.id, answer: ans, ms } });
      if (ss.results[it.id] === undefined) ss.results[it.id] = fb.correct;
      K.lock(it, box, fb, ans);
      el.querySelector('[data-fb]').innerHTML = feedbackHtml(it, fb);
      sfx(fb.correct ? 'correct' : 'incorrect');
      const last = ss.idx >= ss.items.length - 1;
      const acts = el.querySelector('.gl-play-actions');
      acts.innerHTML = `${!fb.correct ? '<button class="btn btn-secondary" type="button" data-retry>ลองตอบใหม่ (ไม่นับคะแนน)</button>' : ''}
        <button class="btn btn-primary" type="button" data-next>${last ? 'ดูสรุปผล' : 'ข้อต่อไป'} ${ICON('chevron-right', 'icon icon-sm')}</button>`;
      acts.querySelector('[data-next]').addEventListener('click', () => { if (last) finishSession(); else { ss.idx += 1; ss.itemStart = Date.now(); renderItem(); } });
      const rt = acts.querySelector('[data-retry]');
      if (rt) rt.addEventListener('click', () => renderItem());
      acts.querySelector('[data-next]').focus({ preventScroll: true });
      el.querySelector('[data-fb]').scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (err) {
      App().toast(err.message, 'error'); btn.disabled = false;
      if (err.code === 'SESSION_EXPIRED') quitSession();
    }
  }
  async function finishSession() {
    const ss = S.sess;
    const el = root('screen-gl-practice');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = ss.kind === 'daily' ? await api('/daily/finish', { method: 'POST', body: { sessionId: ss.sessionId } }) : await api(`/sessions/${ss.sessionId}/finish`, { method: 'POST' });
      const total = r.total; const correct = r.correct; const pct = total ? Math.round((correct / total) * 100) : 0;
      K.expReward(r);   // EXP เข้าบัญชีเดียวกัน -> HUD/เลเวลอัปเดตทันที
      if (window.EQAudio) window.EQAudio.sfx(pct >= 80 ? 'rank_progress' : 'click');
      el.innerHTML = `<div class="gl-summary">
        <h1 class="page-title" id="screen-gl-practice-title">${ss.kind === 'daily' ? 'Daily Challenge เสร็จแล้ว' : ss.kind === 'review' ? 'ทบทวนเสร็จแล้ว' : 'จบแบบฝึก'}</h1>
        <div class="gl-score" style="--p:${pct}" role="img" aria-label="ถูก ${correct} จาก ${total} ข้อ"><b>${correct}/${total}</b><small>${pct}%</small></div>
        <ul class="gl-sum-stats">
          <li><span>EXP</span><b>+${r.exp || 0}</b></li>
          ${r.streak !== undefined ? `<li><span>ต่อเนื่อง</span><b>${r.streak} วัน</b></li>` : ''}
          <li><span>ตอบแล้ว</span><b>${r.answered !== undefined ? r.answered : total} ข้อ</b></li>
        </ul>
        ${(r.topics || []).length ? `<h2 class="gl-h3">Mastery หลังฝึก</h2><ul class="gl-sum-topics">${r.topics.map((t) => `<li><span lang="en">${esc(t.title)}</span><span class="gl-bar"><span style="width:${t.mastery || 0}%"></span></span><b>${t.mastery !== undefined && t.mastery !== null ? `${t.mastery}%` : '—'}</b></li>`).join('')}</ul>` : ''}
        ${(r.newBadges || []).length ? `<div class="gl-badges-new"><h2 class="gl-h3">${ICON('award', 'icon icon-sm')} ได้ Badge ใหม่</h2>${r.newBadges.map((b) => `<p class="gl-badge-row">${ICON(b.icon || 'award')}<b>${esc(b.title)}</b><small>${esc(b.descTh)}</small></p>`).join('')}</div>` : ''}
        <div class="gl-actions">
          ${correct < total ? '<button class="btn btn-secondary" type="button" data-gl-act="mistakes">ดูข้อที่พลาด</button>' : ''}
          ${ss.kind === 'practice' ? `<button class="btn btn-secondary" type="button" data-gl-act="practice" data-topic="${esc(ss.backParam)}">ฝึกอีกชุด</button>` : ''}
          <button class="btn btn-primary" type="button" data-gl-act="${ss.back}" ${ss.backParam ? `data-topic="${esc(ss.backParam)}"` : ''}>${ss.back === 'topic' ? 'กลับบทเรียน' : 'กลับหน้าแกรมม่า'}</button>
        </div></div>`;
      S.hub = null;
      focusTitle('screen-gl-practice');
    } catch (err) {
      App().toast(err.message, 'error');
      if (err.code === 'INCOMPLETE') { ss.idx = ss.items.findIndex((x) => ss.results[x.id] === undefined); if (ss.idx < 0) ss.idx = 0; renderItem(); } else openHub();
    }
  }
  function quitSession() {
    const ss = S.sess;
    if (ss && ss.kind !== 'placement' && Object.keys(ss.results).length && Object.keys(ss.results).length < ss.items.length) {
      App().toast('บันทึกคำตอบที่ทำแล้ว — ข้อที่พลาดจะกลับมาให้ทบทวน', 'info');
    }
    if (ss && ss.back === 'topic' && ss.backParam) openTopic(ss.backParam, null); else openHub();
  }
  async function startPractice(topicId, all = false) {
    try {
      const s = await api(`/topics/${encodeURIComponent(topicId)}/practice`, { method: 'POST', body: { all } });
      const t = S.topic && S.topic.id === topicId ? S.topic : null;
      playSession(s, { kind: 'practice', title: t ? t.title : 'แบบฝึก', back: 'topic', backParam: topicId });
    } catch (err) { App().toast(err.message, 'error'); }
  }
  async function startReview(body = {}) {
    try { const s = await api('/review/start', { method: 'POST', body }); playSession(s, { kind: 'review', title: 'Review Today', back: body.itemIds ? 'mistakes' : 'hub' }); } catch (err) { App().toast(err.message, err.code === 'NOTHING_DUE' ? 'success' : 'error'); }
  }
  async function startDaily() {
    try {
      const d = await api('/daily');
      if (d.completed) { App().toast(`วันนี้ทำ Daily Challenge แล้ว (${d.score}/${d.total}) · ต่อเนื่อง ${d.streak} วัน — กลับมาพรุ่งนี้นะ`, 'success'); return; }
      playSession(d, { kind: 'daily', title: 'Daily Grammar Challenge', back: 'hub' });
    } catch (err) { App().toast(err.message, 'error'); }
  }

  /* =====================================================================
     PLACEMENT — Adaptive
     ===================================================================== */
  function openPlacement() {
    App().showScreen('screen-gl-placement');
    const el = root('screen-gl-placement');
    el.innerHTML = `<div class="gl-intro">
      <button class="game-exit gl-back" type="button" data-gl-act="hub">${ICON('arrow-left', 'icon icon-sm')} แกรมม่า</button>
      <h1 class="page-title" id="screen-gl-placement-title">วัดระดับแกรมม่า</h1>
      <p class="gl-read">แบบทดสอบปรับความยากตามคำตอบ: เริ่มที่ระดับ A2 · ตอบถูกหลายข้อ = ยากขึ้น · ตอบผิดหลายข้อ = ง่ายลง ใช้เวลาประมาณ 10 นาที (ไม่เกิน 28 ข้อ)</p>
      <ul class="gl-list"><li>ระหว่างทำจะยังไม่บอกว่าถูกหรือผิด — ตอบตามที่รู้จริงเพื่อให้ผลแม่นยำ</li><li>ผลที่ได้คือ "ระดับแกรมม่า (CEFR)" ซึ่งแยกจากเลเวลบัญชี (EXP) และแรงค์ในเกม</li><li>วัดใหม่ได้ทุกเมื่อ</li></ul>
      <button class="btn btn-primary btn-block" type="button" data-gl-placement-go>${ICON('play', 'icon icon-sm')} เริ่มวัดระดับ</button></div>`;
    el.querySelector('[data-gl-placement-go]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        const s = await api('/placement/start', { method: 'POST' });
        S.sess = { kind: 'placement', placementId: s.id, items: [s.item], idx: 0, progress: s.progress, title: 'วัดระดับแกรมม่า', results: {}, started: Date.now() };
        renderItem();
      } catch (err) { App().toast(err.message, 'error'); e.currentTarget.disabled = false; }
    });
    focusTitle('screen-gl-placement');
  }
  function showPlacementResult(r) {
    const el = root('screen-gl-placement');
    const tl = (arr) => arr.map((t) => `<li><button class="gl-chip-btn" type="button" data-gl-topic="${esc(t.id)}"><span class="gl-cefr-sm lv-${LEVEL_COLOR[t.cefr]}">${esc(t.cefr)}</span> <span lang="en">${esc(t.title)}</span></button></li>`).join('');
    el.innerHTML = `<div class="gl-summary">
      <p class="gl-kicker">ผลวัดระดับ</p>
      <h1 class="page-title" id="screen-gl-placement-title">Grammar Level: <span class="gl-level-big lv-${LEVEL_COLOR[r.level]}">${esc(r.level)}</span></h1>
      <ul class="gl-perlevel">${r.perLevel.map((p) => `<li><span class="gl-cefr-sm lv-${LEVEL_COLOR[p.level]}">${p.level}</span> ถูก ${p.right}/${p.total}</li>`).join('')}</ul>
      ${r.strong.length ? `<h2 class="gl-h3">${ICON('circle-check', 'icon icon-sm')} Strong</h2><ul class="gl-chips">${tl(r.strong)}</ul>` : ''}
      ${r.needsPractice.length ? `<h2 class="gl-h3">${ICON('target', 'icon icon-sm')} Needs Practice</h2><ul class="gl-chips">${tl(r.needsPractice)}</ul>` : ''}
      <p class="gl-note">${esc(r.note)}</p>
      <div class="gl-actions"><button class="btn btn-primary" type="button" data-gl-act="hub">ไปที่ Learning Map</button></div></div>`;
    S.hub = null;
    if (window.EQAudio) window.EQAudio.sfx('badge_unlock');
    focusTitle('screen-gl-placement');
  }

  /* =====================================================================
     MY GRAMMAR MISTAKES
     ===================================================================== */
  async function openMistakes() {
    App().showScreen('screen-gl-mistakes');
    const el = root('screen-gl-mistakes');
    const f = S.mistakes.filters;
    if (!el.querySelector('.gl-filters')) loading(el);
    const qs = new URLSearchParams();
    if (f.cefr) qs.set('cefr', f.cefr); if (f.topic) qs.set('topic', f.topic); if (f.status) qs.set('status', f.status);
    if (f.days) qs.set('from', new Date(Date.now() - f.days * 86400000).toISOString());
    try { const r = await api(`/mistakes?${qs}`); renderMistakes(r); } catch (err) { errorBox(el, err, openMistakes); }
    focusTitle('screen-gl-mistakes');
  }
  function renderMistakes(r) {
    const el = root('screen-gl-mistakes'); const f = S.mistakes.filters;
    const topicOpts = (S.mistakes.allTopics = S.mistakes.allTopics && !f.topic ? S.mistakes.allTopics : (f.topic ? S.mistakes.allTopics : r.topics)) || r.topics;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gl-act="hub">${ICON('arrow-left', 'icon icon-sm')} แกรมม่า</button>
      <h1 class="page-title" id="screen-gl-mistakes-title">My Grammar Mistakes</h1>
      <p class="gl-sub">ข้อที่เคยพลาด — อ่านเหตุผล แล้วลองใหม่จนเชี่ยวชาญ</p>
      <div class="gl-filters" role="group" aria-label="ตัวกรอง">
        <label>CEFR <select class="gl-input gl-select" data-f="cefr"><option value="">ทั้งหมด</option>${['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => `<option ${f.cefr === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>หัวข้อ <select class="gl-input gl-select" data-f="topic"><option value="">ทั้งหมด</option>${(topicOpts || []).map((t) => `<option value="${esc(t.topicId)}" ${f.topic === t.topicId ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></label>
        <label>ช่วงเวลา <select class="gl-input gl-select" data-f="days"><option value="">ทั้งหมด</option><option value="7" ${f.days === 7 ? 'selected' : ''}>7 วัน</option><option value="30" ${f.days === 30 ? 'selected' : ''}>30 วัน</option></select></label>
        <label>สถานะ <select class="gl-input gl-select" data-f="status"><option value="">ทั้งหมด</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>ยังไม่เชี่ยวชาญ</option><option value="mastered" ${f.status === 'mastered' ? 'selected' : ''}>เชี่ยวชาญแล้ว</option></select></label>
      </div>
      ${r.topics.length ? `<ul class="gl-mtopics">${r.topics.map((t) => `<li><span class="gl-cefr-sm lv-${LEVEL_COLOR[t.cefr]}">${t.cefr}</span><b lang="en">${esc(t.title)}</b><span>${t.mistakes} ครั้ง</span></li>`).join('')}</ul>` : ''}
      ${r.items.length ? `<ul class="gl-mlist">${r.items.map((m) => `<li class="gl-card gl-mitem ${m.mastered ? 'is-mastered' : ''}">
          <p class="gl-item-meta"><span class="gl-cefr-sm lv-${LEVEL_COLOR[m.cefr]}">${m.cefr}</span><span class="gl-item-topic" lang="en">${esc(m.topicTitle)}</span><span class="gl-type">${esc(m.typeTh)}</span>
            <span class="gl-m-count">พลาด ${m.wrongCount} ครั้ง · ${new Date(m.lastWrong).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>${m.mastered ? `<span class="gl-m-ok">${ICON('circle-check', 'icon icon-sm')} เชี่ยวชาญแล้ว</span>` : ''}</p>
          ${m.context ? contextHtml(m.context) : ''}
          <p class="gl-q" lang="en">${blank(m.question)}</p>
          <p class="gl-fb-row bad"><span>คำตอบของคุณ</span><b lang="en">${esc(m.yours || '—')}</b></p>
          <p class="gl-fb-row ok"><span>คำตอบที่ถูก</span><b lang="en">${esc(m.correct)}</b></p>
          ${m.whyNot ? `<p class="gl-fb-mine"><b>ทำไมคำตอบนี้ผิด:</b> ${esc(m.whyNot)}</p>` : ''}
          <p class="gl-fb-explain">${esc(m.explainTh)}</p>
          ${m.structure ? `<p class="gl-fb-struct"><span>โครงสร้าง</span><code lang="en">${esc(m.structure)}</code></p>` : ''}
          <div class="gl-actions"><button class="btn btn-secondary" type="button" data-gl-try="${esc(m.itemId)}">${ICON('rotate-ccw', 'icon icon-sm')} Try again</button>
            <button class="btn btn-secondary" type="button" data-gl-topic="${esc(m.topicId)}">${ICON('book-open', 'icon icon-sm')} Master this topic</button></div>
        </li>`).join('')}</ul>${r.more ? '<p class="gl-note">แสดง 40 ข้อล่าสุด — ใช้ตัวกรองเพื่อดูข้ออื่น</p>' : ''}`
    : `<div class="gl-empty">${ICON('sparkles', 'icon icon-lg')}<p>${Object.values(f).some(Boolean) ? 'ไม่มีข้อที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อที่พลาด — เริ่มฝึกจาก Learning Map ได้เลย'}</p></div>`}`;
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => {
      const k = s.dataset.f; S.mistakes.filters[k] = k === 'days' ? (Number(s.value) || null) : (s.value || null);
      if (k !== 'topic' && !S.mistakes.filters.topic) S.mistakes.allTopics = null;
      openMistakes();
    }));
  }

  /* =====================================================================
     GRAMMAR PROGRESS
     ===================================================================== */
  async function openProgress() {
    App().showScreen('screen-gl-progress');
    const el = root('screen-gl-progress');
    loading(el);
    try { renderProgress(await api(`/progress?range=${S.progressRange}`)); } catch (err) { errorBox(el, err, openProgress); }
    focusTitle('screen-gl-progress');
  }
  function chartSvg(series) {
    const W = 640; const H = 180; const pad = 28; const n = series.length;
    const maxA = Math.max(5, ...series.map((s) => s.answered));
    const bw = Math.max(3, Math.min(26, (W - pad * 2) / n - 4));
    const x = (i) => pad + (i + 0.5) * ((W - pad * 2) / n);
    const bars = series.map((s, i) => { const h = (s.answered / maxA) * (H - 50); return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(H - 24 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="gl-ch-bar"><title>${esc(s.label)}: ${s.answered} ข้อ</title></rect>`; }).join('');
    const pts = series.map((s, i) => (s.accuracy === null ? null : [x(i), H - 24 - (s.accuracy / 100) * (H - 50)])).filter(Boolean);
    const line = pts.length > 1 ? `<polyline class="gl-ch-line" points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>` : '';
    const dots = pts.map((p) => `<circle class="gl-ch-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2"/>`).join('');
    const step = Math.ceil(n / 8);
    const labels = series.map((s, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="gl-ch-label">${esc(s.label)}</text>` : '')).join('');
    return `<svg class="gl-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟจำนวนข้อที่ตอบ (แท่ง) และความแม่นยำ (เส้น)">
      <line x1="${pad}" x2="${W - pad}" y1="${H - 24}" y2="${H - 24}" class="gl-ch-axis"/>${bars}${line}${dots}${labels}</svg>`;
  }
  function renderProgress(p) {
    const el = root('screen-gl-progress');
    const tile = (label, val, sub = '') => `<li class="gl-stat"><span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</li>`;
    const topicRow = (t) => `<li><button class="gl-trow" type="button" data-gl-topic="${esc(t.id)}"><span class="gl-cefr-sm lv-${LEVEL_COLOR[t.cefr]}">${t.cefr}</span><span lang="en">${esc(t.title)}</span><span class="gl-bar"><span style="width:${t.mastery}%"></span></span><b>${t.mastery}%</b></button></li>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gl-act="hub">${ICON('arrow-left', 'icon icon-sm')} แกรมม่า</button>
      <h1 class="page-title" id="screen-gl-progress-title">Grammar Progress</h1>
      <ul class="gl-stats">
        ${tile('Grammar Level', esc(p.level || '—'), p.estimatedLevel && p.estimatedLevel !== p.level ? `ความคืบหน้า: ${esc(p.estimatedLevel)}` : '')}
        ${tile('Overall Mastery', `${p.overallMastery}%`)}
        ${tile('Accuracy', p.accuracy === null ? '—' : `${p.accuracy}%`)}
        ${tile('Questions Answered', p.answered)}
        ${tile('Study Streak', `${p.streak} วัน`)}
        ${tile('Review Due', p.reviewDue, p.reviewDue ? '<button class="link-btn" type="button" data-gl-act="review">ทบทวนเลย</button>' : '')}
      </ul>
      <section class="gl-card"><div class="gl-chart-head"><h2 class="gl-h3">${ICON('chart-column', 'icon icon-sm')} กิจกรรม</h2>
        <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, l]) => `<button type="button" role="radio" class="vd-seg-btn ${p.range === v ? 'active' : ''}" aria-checked="${p.range === v}" data-range="${v}">${l}</button>`).join('')}</div></div>
        ${p.series.some((s) => s.answered) ? chartSvg(p.series) : '<p class="gl-note">ยังไม่มีข้อมูลในช่วงนี้</p>'}
        <p class="gl-chart-legend"><span class="lg-bar"></span> ข้อที่ตอบ <span class="lg-line"></span> ความแม่นยำ (%)</p></section>
      <div class="gl-two">
        <section class="gl-card"><h2 class="gl-h3">${ICON('crown', 'icon icon-sm')} Topics Mastered (${p.mastered.length})</h2>${p.mastered.length ? `<ul class="gl-tlist">${p.mastered.map(topicRow).join('')}</ul>` : '<p class="gl-note">ฝึกหัวข้อเดียวกันจนแม่นและสม่ำเสมอ (mastery ≥ 80% และตอบ ≥ 8 ครั้ง)</p>'}</section>
        <section class="gl-card"><h2 class="gl-h3">${ICON('target', 'icon icon-sm')} Topics to Improve</h2>${p.improve.length ? `<ul class="gl-tlist">${p.improve.map(topicRow).join('')}</ul>` : '<p class="gl-note">ยังไม่มีข้อมูล</p>'}</section>
      </div>
      <section class="gl-card"><h2 class="gl-h3">${ICON('award', 'icon icon-sm')} Badges</h2>
        <ul class="gl-badges">${p.badges.map((b) => `<li class="${b.earned ? 'is-earned' : ''}"><span class="gl-badge-ico">${ICON(b.earned ? b.icon : 'lock')}</span><b>${esc(b.title)}</b><small>${esc(b.descTh)}</small></li>`).join('')}</ul></section>`;
    el.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { S.progressRange = b.dataset.range; openProgress(); }));
  }

  /* ---------- ศัพท์แกรมม่า ---------- */
  async function openTerms() {
    let terms;
    try { terms = (await api('/terms')).terms; } catch (err) { App().toast(err.message, 'error'); return; }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card gl-terms-card" aria-labelledby="gl-terms-title"><h2 id="gl-terms-title">ศัพท์แกรมม่า</h2>
      <input class="gl-input" type="search" placeholder="ค้นหา เช่น gerund, กริยา" aria-label="ค้นหาศัพท์แกรมม่า" data-autofocus>
      <ul class="gl-terms gl-terms-all">${terms.map((t) => `<li data-q="${esc(`${t.en} ${t.th}`.toLowerCase())}"><b lang="en">${esc(t.en)}</b><span>${esc(t.th)}</span><small class="gl-cefr-sm lv-${LEVEL_COLOR[t.cefr]}">${t.cefr}</small></li>`).join('')}</ul></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { variant: 'sheet', label: 'ศัพท์แกรมม่า' });
    ov.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); ov.querySelectorAll('[data-q]').forEach((li) => { li.hidden = q && !li.dataset.q.includes(q); }); });
  }

  /* =====================================================================
     WRITING PRACTICE — เขียนเอง → ได้คำอธิบายว่าผิดเพราะอะไร
     ===================================================================== */
  const WS = { data: null, level: null, prompt: null, draft: {} };
  async function openWriting() {
    App().showScreen('screen-gl-writing');
    const el = root('screen-gl-writing');
    loading(el);
    try {
      WS.data = await api('/writing');
      if (!WS.level) WS.level = WS.data.level || 'A2';
      renderWritingList();
    } catch (err) { errorBox(el, err, openWriting); }
    focusTitle('screen-gl-writing');
  }
  function renderWritingList() {
    const el = root('screen-gl-writing'); const d = WS.data;
    const list = d.prompts.filter((p) => p.cefr === WS.level);
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-gl-act="hub">${ICON('arrow-left', 'icon icon-sm')} แกรมม่า</button>
      <h1 class="page-title" id="screen-gl-writing-title">Writing Practice</h1>
      <p class="gl-sub">เลือกโจทย์ เขียนเป็นภาษาอังกฤษ แล้วรับคำอธิบายว่าถูก/ผิดเพราะอะไร · เขียนแล้ว ${d.written} ครั้ง · ผ่าน ${d.passed} โจทย์</p>
      <div class="gl-wlevels" role="radiogroup" aria-label="ระดับ">${['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => `<button type="button" role="radio" aria-checked="${l === WS.level}" class="lv-${LEVEL_COLOR[l]} ${l === WS.level ? 'is-on' : ''}" data-wl="${l}">${l}</button>`).join('')}</div>
      <ul class="gl-wprompts">${list.map((p) => `<li><button class="gl-wprompt" type="button" data-wp="${esc(p.id)}">
        <span class="gl-cefr-sm lv-${LEVEL_COLOR[p.cefr]}">${p.cefr}</span>
        <span><b lang="en">${esc(p.topicTitle)}</b><small>${esc(p.task.length > 110 ? `${p.task.slice(0, 108)}…` : p.task)}</small></span>
        ${p.passed ? `<span class="gl-m-ok">${ICON('circle-check', 'icon icon-sm')}<span class="sr-only">ผ่านแล้ว</span></span>` : ICON('chevron-right')}</button></li>`).join('')}</ul>
      <section class="gl-section" aria-labelledby="gl-wh-title"><h2 class="gl-h3" id="gl-wh-title">${ICON('clock', 'icon icon-sm')} งานเขียนล่าสุด</h2><div data-whist><p class="gl-note">กำลังโหลด…</p></div></section>`;
    el.querySelectorAll('[data-wl]').forEach((b) => b.addEventListener('click', () => { WS.level = b.dataset.wl; renderWritingList(); }));
    el.querySelectorAll('[data-wp]').forEach((b) => b.addEventListener('click', () => renderWritingTask(d.prompts.find((p) => p.id === b.dataset.wp))));
    api('/writing/history').then((h) => {
      const box = el.querySelector('[data-whist]'); if (!box) return;
      box.innerHTML = h.items.length ? `<ul class="gl-whist">${h.items.slice(0, 8).map((x) => `<li><p class="gl-item-meta"><span class="gl-cefr-sm lv-${LEVEL_COLOR[x.cefr] || 'a1'}">${esc(x.cefr || '')}</span><span class="gl-item-topic" lang="en">${esc(x.topicTitle)}</span>
        ${x.passed ? `<span class="gl-m-ok">${ICON('circle-check', 'icon icon-sm')} ผ่าน</span>` : `<span class="gl-m-count">ข้อผิด ${x.errors} จุด</span>`}</p><p lang="en">${esc(x.text)}</p></li>`).join('')}</ul>` : '<p class="gl-note">ยังไม่มีงานเขียน</p>';
    }).catch(() => { const box = el.querySelector('[data-whist]'); if (box) box.innerHTML = '<p class="gl-note">โหลดประวัติไม่สำเร็จ</p>'; });
  }
  function renderWritingTask(p) {
    if (!p) return;
    WS.prompt = p;
    const el = root('screen-gl-writing');
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-wback>${ICON('arrow-left', 'icon icon-sm')} โจทย์ทั้งหมด</button>
      <article class="gl-item">
        <p class="gl-item-meta"><span class="gl-type">เขียนเอง</span><span class="gl-cefr-sm lv-${LEVEL_COLOR[p.cefr]}">${p.cefr}</span><span class="gl-item-topic" lang="en">${esc(p.topicTitle)}</span></p>
        <h1 class="gl-q" id="screen-gl-writing-title">${esc(p.task)}</h1>
        <label class="gl-label" for="gl-w-text">เขียนเป็นภาษาอังกฤษ${p.minSentences > 1 ? ` (อย่างน้อย ${p.minSentences} ประโยค)` : ''}</label>
        <textarea class="gl-input gl-textarea" id="gl-w-text" rows="6" maxlength="1500" spellcheck="false" lang="en" autocapitalize="sentences">${esc(WS.draft[p.id] || '')}</textarea>
        <p class="gl-counter" data-counter aria-live="polite">0 คำ · 0 ประโยค</p>
        <div class="gl-feedback" data-fb aria-live="polite"></div>
        <div class="gl-play-actions">
          <button class="btn btn-secondary" type="button" data-gl-topic="${esc(p.topicId)}">${ICON('book-open', 'icon icon-sm')} ทบทวนบทเรียน</button>
          <button class="btn btn-primary" type="button" data-wcheck disabled>${ICON('sparkles', 'icon icon-sm')} ตรวจและอธิบาย</button>
        </div>
      </article>`;
    const ta = el.querySelector('#gl-w-text'); const btn = el.querySelector('[data-wcheck]'); const ctr = el.querySelector('[data-counter]');
    const upd = () => { const v = ta.value.trim(); WS.draft[p.id] = ta.value; btn.disabled = !v; const w = v ? v.split(/\s+/).length : 0; const s = v ? v.split(/[.!?]+/).filter((x) => x.trim()).length : 0; ctr.textContent = `${w} คำ · ${s} ประโยค`; };
    ta.addEventListener('input', upd); upd();
    el.querySelector('[data-wback]').addEventListener('click', openWriting);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const r = await api('/writing/check', { method: 'POST', body: { promptId: p.id, text: ta.value } });
        el.querySelector('[data-fb]').innerHTML = writingFeedbackHtml(r);
        sfx(r.passed ? 'correct' : 'incorrect');
        K.expReward(r, btn);
        el.querySelector('[data-fb]').scrollIntoView({ block: 'nearest' });
      } catch (err) { App().toast(err.message, 'error'); }
      btn.disabled = false;
    });
    if (!window.matchMedia('(pointer: coarse)').matches) ta.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function writingFeedbackHtml(r) {
    const errs = r.issues.filter((i) => i.severity === 'error'); const tips = r.issues.filter((i) => i.severity !== 'error');
    return `<div class="gl-fb ${r.passed ? 'ok' : 'bad'}" role="status">
      <p class="gl-fb-head">${ICON(r.passed ? 'circle-check' : 'circle-x', 'icon')} <b>${r.passed ? 'โครงสร้างถูกต้องตามที่ตรวจ' : `พบจุดที่ต้องแก้ ${errs.length} จุด`}</b></p>
      ${errs.length ? `<ul class="gl-fb-issues">${errs.map((i) => `<li>${esc(i.msgTh)}${i.suggestion ? ` <span class="gl-sugg">→ <span lang="en">${esc(i.suggestion)}</span></span>` : ''}</li>`).join('')}</ul>` : ''}
      ${(r.strengths || []).length ? `<ul class="gl-fb-tips">${r.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${tips.length ? `<p class="gl-h4">ข้อแนะนำเพิ่มเติม</p><ul class="gl-fb-tips">${tips.map((i) => `<li>${esc(i.msgTh)}</li>`).join('')}</ul>` : ''}
      ${r.explainTh ? `<p class="gl-fb-explain">${esc(r.explainTh)}</p>` : ''}
      ${r.structure ? `<p class="gl-fb-struct"><span>โครงสร้าง</span><code lang="en">${esc(r.structure)}</code></p>` : ''}
      ${(r.mistakes || []).length ? `<details class="gl-fb-whynot"><summary>จุดที่มักผิดในหัวข้อนี้</summary><ul>${r.mistakes.map((m) => `<li><s lang="en">${esc(m.wrong)}</s> → <b lang="en">${esc(m.right)}</b><br>${esc(m.whyTh)}</li>`).join('')}</ul></details>` : ''}
      ${r.sample ? `<p class="gl-fb-row"><span>ตัวอย่างคำตอบ</span><b lang="en">${esc(r.sample)}</b></p>` : ''}
      <p class="gl-note">${esc(r.note)}</p></div>`;
  }

  /* =====================================================================
     การนำทาง
     ===================================================================== */
  const VIEW_SCREEN = { hub: 'screen-gl', topic: 'screen-gl-topic', lesson: 'screen-gl-lesson', practice: 'screen-gl-practice', placement: 'screen-gl-placement', mistakes: 'screen-gl-mistakes', progress: 'screen-gl-progress', writing: 'screen-gl-writing' };
  function open(view = 'hub', param = null) {
    // showScreen() เปลี่ยน hash -> เกิด hashchange ตามมา (async) -> กลับเข้ามาที่นี่อีกครั้ง: ถ้าหน้านั้นเปิดอยู่แล้วไม่ต้องโหลดซ้ำ
    const scr = document.getElementById(VIEW_SCREEN[view] || 'screen-gl');
    if (scr && !scr.classList.contains('hidden') && (view !== 'topic' || (S.topic && S.topic.id === param)) && (view !== 'lesson' || LP.topicId === param)) return;
    switch (view) {
      case 'topic': if (param) openTopic(param); else openHub(); break;
      case 'lesson': if (param) openLesson(param); else openHub(); break;
      case 'placement': openPlacement(); break;
      case 'mistakes': openMistakes(); break;
      case 'progress': openProgress(); break;
      case 'writing': openWriting(); break;
      case 'practice': openHub(); break;   // ผู้เล่นแบบฝึกเปิดจากบทเรียนเท่านั้น
      default: openHub();
    }
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.gl-screen, .gl-terms-card')) return;
    // ปุ่มพับ/กาง (ซ่อนหัวข้อ / แสดงหัวข้อ) จัดการใน lesson-kit.js — ไม่วาดหน้าใหม่
    const go = e.target.closest('[data-gl-goto]');
    if (go && !go.disabled) { openLesson(S.lesson.topicId, Number(go.dataset.glGoto)); return; }
    const ls = e.target.closest('[data-gl-lesson]');
    if (ls) { openLesson(ls.dataset.glLesson); return; }
    const tp = e.target.closest('[data-gl-topic]');
    if (tp && !tp.disabled) { if (tp.dataset.locked) lockedNotice(tp.dataset.glTopic); else openTopic(tp.dataset.glTopic); return; }
    const tr = e.target.closest('[data-gl-try]');
    if (tr) { startReview({ itemIds: [tr.dataset.glTry] }); return; }
    const a = e.target.closest('[data-gl-act]');
    if (!a) return;
    const act = a.dataset.glAct; const topic = a.dataset.topic;
    if (act === 'hub') openHub();
    else if (act === 'topic') openTopic(topic);
    else if (act === 'lesson') openLesson(topic);
    else if (act === 'lesson-restart') { api(`/lessons/${encodeURIComponent(topic)}/restart`, { method: 'POST' }).then(() => openLesson(topic, 0)).catch((err) => App().toast(err.message, 'error')); }
    else if (act === 'practice') startPractice(topic, false);
    else if (act === 'practice-all') startPractice(topic, true);
    else if (act === 'placement') App().navigateTo('grammar-placement');
    else if (act === 'review') startReview({});
    else if (act === 'daily') startDaily();
    else if (act === 'mistakes') App().navigateTo('grammar-mistakes');
    else if (act === 'progress') App().navigateTo('grammar-progress');
    else if (act === 'writing') App().navigateTo('grammar-writing');
    else if (act === 'terms') openTerms();
    else if (act === 'battle') { if (window.EQRanked && window.EQRanked.setMode) window.EQRanked.setMode('grammar'); App().navigateTo('ranked'); }
  });

  window.EQGrammar = { open, openTopic, openLesson, openHub, contextHtml, feedbackHtml, itemBody, collect, wireItem, hl, blank };
})();
