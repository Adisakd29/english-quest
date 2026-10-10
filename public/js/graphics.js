/*
  EnglishQuest — ระบบกราฟิกกลาง (ใช้ร่วมทุกหน้า ห้าม hard-code SVG/สีแยกหน้า)
  - Icon: Lucide ชุดเดียว   /assets/icons/icons.svg          (scripts/build-icons.js)
  - Illustration / Mascot / Avatar / Badge: สไตล์ "Flat + subtle depth" ชุดเดียว
                                /assets/{illustrations,mascot,avatars,badges}/*.svg  (scripts/build-graphics.py)
  ทุกฟังก์ชันคืนค่าเป็น HTML string (ใช้กับ innerHTML ได้ทันที) ค่าที่มาจากภายนอกถูก escape แล้ว
*/
(() => {
  'use strict';

  const A = '/assets';
  const SPRITE = {
    icon: `${A}/icons/icons.svg`,
    illo: `${A}/illustrations/illustrations.svg`,
    mascot: `${A}/mascot/mascot.svg`,
    avatar: `${A}/avatars/avatars.svg`,
    badge: `${A}/badges/badges.svg`,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // รายชื่อไอคอนที่มีใน sprite (ต้องตรงกับ scripts/build-icons.js) — ใช้ตรวจค่า icon ที่มาจากเซิร์ฟเวอร์
  const ICON_NAMES = new Set(('house book-open rotate-ccw gamepad-2 user-round log-out log-in trophy users users-round swords search target flame ' +
    'chevron-right chevron-left arrow-left arrow-up-right play settings shield-check languages headphones sparkles sliders-horizontal x plus ' +
    'copy camera send check circle-check circle-x circle-alert triangle-alert info lock lock-open hourglass loader-circle wifi-off refresh-cw ' +
    'flag ban user-plus user-check user-x mail mail-check volume-2 lightbulb clock timer list-checks eye pencil-line file-pen-line wrench library ' +
    'compass crown award medal star circle-help message-circle message-square-text utensils building-2 map heart-pulse zap palette smile leaf ' +
    'briefcase brain package book box type gauge link hand-helping scale arrow-left-right git-branch map-pin combine chart-column sprout trees ' +
    'mountain graduation-cap volume-x volume-1 music door-open shield wifi coffee external-link mic mic-off message-circle-more').split(' '));

  /** ไอคอน Lucide — size: sm(16) | md(20 ค่าตั้งต้น) | lg(24) | xl(32) */
  function icon(name, cls = '', label = '') {
    const n = ICON_NAMES.has(name) ? name : 'sparkles';
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
    return `<svg class="icon ${esc(cls)}" ${a11y}><use href="${SPRITE.icon}#${n}"></use></svg>`;
  }
  /** ค่า icon จากข้อมูล (เช่น topic/บทแกรมม่า) -> ชื่อไอคอนที่ใช้ได้จริง (ข้อมูลเก่าที่ยังเป็น emoji จะได้ fallback) */
  const iconName = (value, fallback = 'book') => (ICON_NAMES.has(value) ? value : fallback);

  /** ภาพประกอบ — decorative เสมอ (ข้อความข้าง ๆ เป็นตัวสื่อความหมาย) */
  function illo(name, cls = '') {
    return `<svg class="illo ${esc(cls)}" viewBox="0 0 320 240" aria-hidden="true" focusable="false"><use href="${SPRITE.illo}#il-${esc(name)}"></use></svg>`;
  }

  /** Mascot: normal | happy | thinking | celebration | encouragement | confused | success | welcome */
  const MASCOT_STATES = ['normal', 'happy', 'thinking', 'celebration', 'encouragement', 'confused', 'success', 'welcome'];
  function mascot(state = 'normal', cls = '') {
    const s = MASCOT_STATES.includes(state) ? state : 'normal';
    return `<svg class="mascot ${esc(cls)}" viewBox="0 0 160 160" aria-hidden="true" focusable="false"><use href="${SPRITE.mascot}#fox-${s}"></use></svg>`;
  }

  // ---------- อวตาร ----------
  const AVATAR_IDS = ['fox', 'owl', 'cat', 'dog', 'rabbit', 'bear', 'panda', 'lion', 'tiger', 'koala', 'penguin', 'dragon'];
  const AVATAR_NAMES = { fox: 'จิ้งจอก', owl: 'นกฮูก', cat: 'แมว', dog: 'สุนัข', rabbit: 'กระต่าย', bear: 'หมี', panda: 'แพนด้า',
    lion: 'สิงโต', tiger: 'เสือ', koala: 'โคอาล่า', penguin: 'เพนกวิน', dragon: 'มังกร' };
  /** อวตาร SVG (หรือรูปที่อัปโหลด) */
  function avatar(id, image = null, cls = '') {
    if (image) return `<img class="avatar-img ${esc(cls)}" src="${esc(image)}" alt="" loading="lazy" decoding="async" />`;
    const a = AVATAR_IDS.includes(id) ? id : 'fox';
    return `<svg class="avatar-svg ${esc(cls)}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="${SPRITE.avatar}#av-${a}"></use></svg>`;
  }

  // ---------- ตราระดับ CEFR ----------
  const LEVELS = {
    A1: { name: 'Foundation', th: 'พื้นฐาน' },
    A2: { name: 'Explorer', th: 'สำรวจ' },
    B1: { name: 'Builder', th: 'สร้าง' },
    B2: { name: 'Communicator', th: 'สื่อสาร' },
    C1: { name: 'Advanced', th: 'ขั้นสูง' },
  };
  /** ตราระดับ: รูปทรงต่างกันทุกระดับ + ตัวอักษร A1–C1 ชัดเจน · opts.named = แสดงชื่อระดับข้าง ๆ */
  function emblem(level, opts = {}) {
    const lv = LEVELS[level] ? level : 'A1';
    const size = opts.size || 'md';
    const body = `<span class="emblem emblem-${size} lv-${lv.toLowerCase()}" ${opts.named ? 'aria-hidden="true"' : `role="img" aria-label="ระดับ ${lv} ${LEVELS[lv].name}"`}>`
      + `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="${SPRITE.badge}#lv-${lv.toLowerCase()}"></use></svg>`
      + `<b>${lv}</b></span>`;
    if (!opts.named) return body;
    return `<span class="emblem-named">${body}<span class="emblem-text"><b>${lv}</b> ${LEVELS[lv].name}</span></span>`;
  }

  // ---------- เหรียญ / Achievement ----------
  const TIERS = {
    bronze: { th: 'ทองแดง' }, silver: { th: 'เงิน' }, gold: { th: 'ทอง' }, platinum: { th: 'แพลทินัม' },
  };
  /** เหรียญตามระดับ — รูปทรงต่างกัน (วงกลม/หกเหลี่ยม/โล่/อัญมณี) + ป้ายข้อความ ไม่พึ่งสีอย่างเดียว */
  function tierBadge(tier, label = '', cls = '', a11y = '') {
    const t = TIERS[tier] ? tier : 'bronze';
    const name = a11y || `เหรียญ${TIERS[t].th}${label ? ` ${label}` : ''}`;
    return `<span class="tier-badge tier-${t} ${esc(cls)}" role="img" aria-label="${esc(name)}">`
      + `<svg viewBox="0 0 48 50" aria-hidden="true" focusable="false"><use href="${SPRITE.badge}#tier-${t}"></use></svg>`
      + (label ? `<b>${esc(label)}</b>` : '') + '</span>';
  }
  /** อันดับ 1–3 = ทอง/เงิน/ทองแดง พร้อมตัวเลข · อันดับอื่น = ตัวเลขในป้ายเรียบ ๆ */
  function rankBadge(rank) {
    if (rank === null || rank === undefined) return '<span class="rank-plain" aria-label="ไม่มีอันดับ">—</span>';
    const tier = { 1: 'gold', 2: 'silver', 3: 'bronze' }[rank];
    return tier ? tierBadge(tier, String(rank), 'tier-sm', `อันดับ ${rank}`) : `<span class="rank-plain">#${esc(rank)}</span>`;
  }

  // ---------- Empty state / Feedback ----------
  /** Empty state = ภาพประกอบ + หัวข้อ + คำอธิบาย + CTA (ไม่ใช่แค่ "ไม่มีข้อมูล") */
  function emptyState({ art = 'empty-search', title = '', text = '', cta = null, compact = false } = {}) {
    return `<section class="state-empty${compact ? ' state-empty-compact' : ''}">${illo(art, 'state-empty-art')}`
      + (title ? `<h2>${esc(title)}</h2>` : '')
      + (text ? `<p>${esc(text)}</p>` : '')
      + (cta ? `<button class="btn ${cta.secondary ? 'btn-secondary' : 'btn-primary'}" type="button" ${cta.id ? `id="${esc(cta.id)}"` : ''} ${cta.attrs || ''}>${cta.icon ? icon(cta.icon) : ''}<span>${esc(cta.label)}</span></button>` : '')
      + '</section>';
  }

  /** แผงผลตอบ: ถูก = CircleCheck + พื้นเขียว · ผิด = CircleX + คำตอบที่ถูก + คำอธิบาย (bodyHtml ต้อง escape มาแล้ว) */
  function feedback(ok, title, bodyHtml = '') {
    return `<div class="feedback ${ok ? 'feedback-ok' : 'feedback-bad'}" role="status">`
      + `<span class="feedback-icon">${icon(ok ? 'circle-check' : 'circle-x', 'icon-lg')}</span>`
      + `<div class="feedback-body"><b class="feedback-title">${esc(title)}</b>${bodyHtml ? `<div class="feedback-text">${bodyHtml}</div>` : ''}</div></div>`;
  }

  /** สถานะ inline เล็ก ๆ (แทน ✓ / ✗ / ⚠ ในข้อความ) */
  function mark(kind, text = '') {
    const map = { ok: 'circle-check', bad: 'circle-x', warn: 'triangle-alert', tip: 'lightbulb', lock: 'lock', open: 'lock-open', up: 'arrow-up-right' };
    return `<span class="mark mark-${kind}">${icon(map[kind] || 'info', 'icon-sm')}${text ? `<span>${esc(text)}</span>` : ''}</span>`;
  }

  /** skeleton สำหรับโหลดข้อมูล — แบบ list / card / grid */
  function skeleton(kind = 'card', n = 3) {
    if (kind === 'list') return `<div class="skel-list" aria-busy="true" aria-label="กำลังโหลด">${'<div class="skel-item"><span class="skeleton skel-dot"></span><span class="skel-lines"><span class="skeleton skel-line"></span><span class="skeleton skel-line skel-short"></span></span></div>'.repeat(n)}</div>`;
    if (kind === 'grid') return `<div class="skel-grid" aria-busy="true" aria-label="กำลังโหลด">${'<div class="skeleton skel-tile"></div>'.repeat(n)}</div>`;
    return '<div class="skeleton skeleton-card" aria-busy="true" aria-label="กำลังโหลด"></div>';
  }

  // ---------- แปลงเครื่องหมาย emoji ในเนื้อหาบทเรียนให้เป็นไอคอน (ข้อมูลแกรมม่ามีจำนวนมาก) ----------
  const MARKS = { '✅': 'ok', '✔': 'ok', '✓': 'ok', '❌': 'bad', '✗': 'bad', '✘': 'bad', '⚠': 'warn', '💡': 'tip' };
  const MARK_RE = /(✅|✔️?|✓|❌|✗|✘|⚠️?|💡)/;
  const MARK_LABEL = { ok: 'ถูก', bad: 'ผิด', warn: 'ข้อควรระวัง', tip: 'เคล็ดลับ' };
  function iconize(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (MARK_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(MARK_RE).forEach((part) => {
        if (!part) return;
        const key = MARKS[part.replace('\uFE0F', '')];
        if (key) {
          const span = document.createElement('span');
          span.className = `mark mark-${key}`;
          span.innerHTML = icon({ ok: 'circle-check', bad: 'circle-x', warn: 'triangle-alert', tip: 'lightbulb' }[key], 'icon-sm', MARK_LABEL[key]);
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(part.replace(/^\uFE0F/, '')));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /** เติมกราฟิกให้ placeholder ใน HTML คงที่: data-icon / data-illo / data-mascot / data-emblem */
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.insertAdjacentHTML(el.dataset.iconPos === 'end' ? 'beforeend' : 'afterbegin', icon(el.dataset.icon, el.dataset.iconClass || ''));
      el.removeAttribute('data-icon');
    });
    root.querySelectorAll('[data-illo]').forEach((el) => { el.innerHTML = illo(el.dataset.illo, el.dataset.illoClass || ''); el.removeAttribute('data-illo'); });
    root.querySelectorAll('[data-mascot]').forEach((el) => { el.innerHTML = mascot(el.dataset.mascot); el.removeAttribute('data-mascot'); });
    root.querySelectorAll('[data-emblem]').forEach((el) => {
      el.outerHTML = emblem(el.dataset.emblem, { size: el.dataset.size || 'md', named: el.hasAttribute('data-named') });
    });
  }

  // ---------- แผนที่ไอคอนของข้อมูล ----------
  const TOPIC_ICON = { people: 'users-round', time: 'clock', food: 'utensils', things: 'building-2', places: 'map', body: 'heart-pulse',
    actions: 'zap', describing: 'palette', feelings: 'smile', nature: 'leaf', communication: 'message-circle', work: 'briefcase',
    thinking: 'brain', mixed: 'package' };
  const CHAPTER_ICON = { nouns: 'box', determiners: 'type', adjectives: 'palette', adverbs: 'gauge', pronouns: 'user-round',
    'wh-words': 'circle-help', 'relative-pronouns': 'link', 'helping-verbs': 'hand-helping', 'sv-agreement': 'scale', tenses: 'clock',
    'active-passive': 'arrow-left-right', participles: 'git-branch', 'gerund-infinitive': 'pencil-line', prepositions: 'map-pin',
    conjunctions: 'combine', comparisons: 'chart-column' };

  window.EQG = {
    icon, iconName, illo, mascot, avatar, AVATAR_IDS, AVATAR_NAMES, emblem, LEVELS, tierBadge, rankBadge,
    emptyState, feedback, mark, skeleton, iconize, hydrate, TOPIC_ICON, CHAPTER_ICON, esc,
  };

  // สคริปต์นี้โหลดท้าย <body> (ก่อน app.js) -> DOM พร้อมแล้ว เติมกราฟิกได้ทันที
  hydrate();

  // hover ของตัวเลือกคำตอบจะทำงานหลังผู้ใช้ "ขยับเมาส์จริง" ในกลุ่มตัวเลือกเท่านั้น (ใช้ทุกแบบฝึกในเว็บ)
  // กันกรณีตัวเลือกโผล่ใต้ตำแหน่งเมาส์/นิ้วเดิมแล้วถูกไฮไลต์เอง ซึ่งดูเหมือนเฉลยหลุด
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const group = e.target.closest && e.target.closest('.quiz-choices, .rk-choices, .practice-choices, #grammar-quiz-choices');
    if (group && !group.classList.contains('hover-armed')) {
      if (group.dataset.armX === undefined) { group.dataset.armX = e.clientX; group.dataset.armY = e.clientY; return; }
      if (Math.abs(e.clientX - group.dataset.armX) + Math.abs(e.clientY - group.dataset.armY) > 6) group.classList.add('hover-armed');
    }
  }, { passive: true });
})();
