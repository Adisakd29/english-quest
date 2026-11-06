/* =====================================================================
   Event Carousel — v1.17.0 — window.EQEventCarousel
   แบนเนอร์กิจกรรมจริงบนหน้าแรก (ข้อมูลจาก GET /api/lobby → carousel · services/eventCarousel.js)
   - Desktop: ข้อความซ้าย · ภาพ (ตัวละคร/รางวัล) ขวา · ปุ่ม ก่อนหน้า/ถัดไป · จุด · หยุด/เล่น
   - Mobile: ภาพ 16:9 ด้านบน (ไม่ครอป) · ข้อความ/ปุ่มด้านล่าง · ปัดซ้าย–ขวา
   - เลื่อนเองทุก 6 วินาที — หยุดเมื่อ: ชี้เมาส์ · โฟกัสในแบนเนอร์ · กำลังแตะ/ลาก · แท็บไม่ได้เปิดอยู่ · ผู้ใช้กดหยุด · prefers-reduced-motion
   - ปุ่มของแต่ละกิจกรรมทำงานตามประเภทจริง (เข้ากิจกรรม / เริ่มชาเลนจ์ / รับรางวัล / ดูรายละเอียด)
   - ภาพโหลดเฉพาะสไลด์ปัจจุบัน ± 1 · ภาพเสียใช้ภาพสำรองของประเภทนั้น → ถ้ายังเสียใช้พื้นสี
   - ข้อความสำคัญทั้งหมดเป็น HTML (ภาพเป็นตกแต่ง alt="")
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const AUTO_MS = 6000;
  const STATUS = { upcoming: ['เร็ว ๆ นี้', 'Upcoming'], ongoing: ['กำลังจัด', 'Ongoing'], completed: ['สำเร็จแล้ว', 'Completed'], expired: ['หมดเวลา', 'Expired'] };
  // สีพื้นของแผงข้อความ (ตรงกับภาพแต่ละชุด)
  const TONE = {
    adventure: '#0b3b3a', loykrathong: '#0e1746', festival: '#4a1546', ranked: '#3a0d16', daily: '#1e3a8a', vocab: '#2e1065', grammar: '#083344',
    toeic: '#0c1a3d', streak: '#431407', achievement: '#2b1257', halloween: '#1e0b3a', christmas: '#052e16', newyear: '#0b1028', valentine: '#500724', school: '#134e4a',
  };
  const reduceMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dfmt = (iso, withYear) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Bangkok' });
  const tfmt = (iso) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  function dateLine(s) {
    const now = Date.now(); const st = new Date(s.startsAt).getTime(); const en = new Date(s.endsAt).getTime();
    if (s.type === 'daily') return `วันนี้ · รีเซ็ตเที่ยงคืน (เวลาไทย)`;
    const range = `${dfmt(s.startsAt)} – ${dfmt(new Date(en - 1000).toISOString(), true)}`;
    if (s.status === 'upcoming') { const d = Math.ceil((st - now) / 86400000); return `${range} · เริ่มอีก ${d} วัน (${dfmt(s.startsAt)} ${tfmt(s.startsAt)} น.)`; }
    const left = Math.ceil((en - now) / 86400000);
    return `${range} · ${left <= 1 ? `สิ้นสุดวันนี้ ${tfmt(new Date(en - 1000).toISOString())} น.` : `เหลืออีก ${left} วัน`}`;
  }
  function rewardChips(r, { full = false } = {}) {
    if (!r) return '';
    const out = [];
    if (r.coins) out.push(`<li class="evc-rw evc-rw-coin"><img class="evc-coin" src="/assets/coin/coin-sm.svg" alt="" aria-hidden="true" width="16" height="16"><b>+${Number(r.coins).toLocaleString('th-TH')}</b> Coin</li>`);
    if (r.exp) out.push(`<li class="evc-rw">${ICON('sparkles')}<b>+${Number(r.exp).toLocaleString('th-TH')}</b> EXP</li>`);
    const items = r.items || []; const show = full ? items : items.slice(0, 3);
    for (const it of show) out.push(`<li class="evc-rw evc-rw-item evc-r-${esc(it.rarity)}" title="${esc(it.name)}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" width="28" height="28" loading="lazy" decoding="async">` : ICON('shirt')}<span>${esc(it.name)}</span></li>`);
    if (!full && items.length > show.length) out.push(`<li class="evc-rw evc-rw-more">+${items.length - show.length} ชิ้น</li>`);
    if (r.badge) out.push(`<li class="evc-rw">${ICON('award')}<span>ป้าย Achievement</span></li>`);
    if (r.theme) out.push(`<li class="evc-rw">${ICON('palette')}<span>${esc(r.theme)}</span></li>`);
    return out.length ? `<ul class="evc-rewards" aria-label="รางวัล">${out.join('')}</ul>${r.note ? `<p class="evc-note">${esc(r.note)}</p>` : ''}` : '';
  }
  function progress(p) {
    if (!p || !p.label) return '';
    const pct = p.target ? Math.round((Math.min(p.value, p.target) / p.target) * 100) : null;
    return `<div class="evc-prog">${pct !== null ? `<span class="evc-prog-bar" role="progressbar" aria-label="${esc(p.label)}" aria-valuemin="0" aria-valuemax="${p.target}" aria-valuenow="${Math.min(p.value, p.target)}"><span style="width:${pct}%"></span></span>` : ''}<small>${esc(p.label)}</small></div>`;
  }

  const st = { list: [], i: 0, paused: false, userPaused: false, hover: false, focus: false, hold: 0, timer: null, key: '', drag: null, root: null };
  try { st.userPaused = localStorage.getItem('eq:evc:paused') === '1'; } catch (_) { /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */ }

  function slideHtml(s, k, n) {
    const [th, en] = STATUS[s.status] || STATUS.ongoing;
    const tone = TONE[s.banner && s.banner.art] || '#1c2033';
    return `<article class="evc-slide" role="group" aria-roledescription="slide" aria-label="${k + 1} จาก ${n}: ${esc(s.title)}" id="evc-s-${k}" data-k="${k}" style="--evc-tone:${tone}">
      <div class="evc-media" aria-hidden="true">
        <picture><source media="(min-width: 1100px)" data-srcset="${esc(s.banner.desktop)}"><img alt="" width="1280" height="720" decoding="async" data-src="${esc(s.banner.mobile)}" data-fallback="${esc(s.banner.fallback)}"></picture>
      </div>
      <div class="evc-body">
        <p class="evc-meta"><span class="evc-type">${esc(s.typeLabel)}</span><span class="evc-status is-${esc(s.status)}"><span aria-hidden="true" class="evc-dot"></span>${th}<span class="evc-en"> · ${en}</span></span>${s.featured ? `<span class="evc-feat">${ICON('star', 'icon icon-xs')} แนะนำ</span>` : ''}</p>
        <h3 class="evc-title">${esc(s.title)}</h3>
        ${s.titleEn && s.titleEn !== s.title ? `<p class="evc-title-en">${esc(s.titleEn)}</p>` : ''}
        <p class="evc-desc">${esc(s.description)}</p>
        <p class="evc-dates">${ICON('calendar-days', 'icon icon-xs')} <span>${esc(dateLine(s))}</span></p>
        ${rewardChips(s.rewards)}
        ${progress(s.progress)}
        <div class="evc-actions">
          <button class="evc-cta${s.cta && s.cta.kind === 'claim' ? ' is-claim' : ''}" type="button" data-evc-cta="${k}">${s.cta && s.cta.kind === 'claim' ? ICON('gift') : ''}${esc((s.cta && s.cta.label) || 'ดูรายละเอียด')}</button>
          ${s.cta && s.cta.kind !== 'details' ? `<button class="evc-more" type="button" data-evc-details="${k}">${ICON('info')} รายละเอียด</button>` : ''}
        </div>
      </div>
    </article>`;
  }

  function render(list) {
    const root = $('evc'); if (!root) return;
    st.root = root;
    const key = JSON.stringify(list.map((s) => [s.id, s.status, s.cta && s.cta.label, s.progress && s.progress.label, s.claimed]));
    if (key === st.key) return;
    const keepId = st.list[st.i] && st.list[st.i].id;
    st.key = key; st.list = list;
    if (!list.length) {
      root.innerHTML = `<div class="evc-empty" role="status">${ICON('calendar-days', 'icon')}<div><b>ยังไม่มีกิจกรรมในตอนนี้</b><p>กิจกรรมใหม่จะแสดงที่นี่เมื่อเริ่ม — ระหว่างนี้เรียนต่อหรือแข่ง Ranked ได้เลย</p></div></div>`;
      stopTimer(); return;
    }
    const n = list.length;
    const at = Math.max(0, list.findIndex((s) => s.id === keepId));
    root.innerHTML = `
      <div class="evc-viewport" id="evc-viewport">
        <div class="evc-track" id="evc-track">${list.map((s, k) => slideHtml(s, k, n)).join('')}</div>
        ${n > 1 ? `<button class="evc-nav evc-prev" type="button" data-evc-go="-1" aria-label="กิจกรรมก่อนหน้า">${ICON('chevron-left', 'icon')}</button>
        <button class="evc-nav evc-next" type="button" data-evc-go="1" aria-label="กิจกรรมถัดไป">${ICON('chevron-right', 'icon')}</button>` : ''}
      </div>
      ${n > 1 ? `<div class="evc-ctrl">
        <div class="evc-dots" role="group" aria-label="เลือกกิจกรรม">${list.map((s, k) => `<button class="evc-pdot" type="button" data-evc-dot="${k}" aria-label="กิจกรรม ${k + 1}: ${esc(s.title)}"><span></span></button>`).join('')}</div>
        <button class="evc-play" type="button" id="evc-play" aria-pressed="false"></button>
      </div>` : ''}
      <p class="sr-only" aria-live="polite" id="evc-live"></p>`;
    go(at, { announce: false, instant: true });
    syncPlay();
    restartTimer();
  }

  /* ---------- เลื่อน ---------- */
  function loadImgs(k) {
    const n = st.list.length;
    for (const j of [k, (k + 1) % n, (k - 1 + n) % n]) {
      const sl = $(`evc-s-${j}`); if (!sl) continue;
      const img = sl.querySelector('img[data-src]'); const src = sl.querySelector('source[data-srcset]');
      if (src) { src.srcset = src.dataset.srcset; src.removeAttribute('data-srcset'); }
      if (img) {
        img.addEventListener('error', function onErr() {
          if (img.dataset.fallback && !img.dataset.triedFallback) {   // ภาพที่ผู้ดูแลตั้งเสีย → ภาพสำรองของประเภทนั้น
            img.dataset.triedFallback = '1';
            const s2 = img.parentElement.querySelector('source'); if (s2) s2.remove();
            img.src = img.dataset.fallback;
          } else { img.removeEventListener('error', onErr); sl.classList.add('evc-noimg'); }
        });
        img.src = img.dataset.src; img.removeAttribute('data-src');
      }
    }
  }
  function go(k, { announce = true, instant = false } = {}) {
    const n = st.list.length; if (!n) return;
    st.i = ((k % n) + n) % n;
    const track = $('evc-track'); if (!track) return;
    track.style.transition = instant || reduceMotion() ? 'none' : '';
    track.style.transform = `translate3d(${-st.i * 100}%,0,0)`;
    track.querySelectorAll('.evc-slide').forEach((sl, j) => {
      const on = j === st.i;
      sl.classList.toggle('is-active', on);
      if (on) sl.removeAttribute('inert'); else sl.setAttribute('inert', '');
      sl.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    document.querySelectorAll('#evc .evc-pdot').forEach((d, j) => d.setAttribute('aria-current', j === st.i ? 'true' : 'false'));
    loadImgs(st.i);
    if (announce) { const l = $('evc-live'); if (l) l.textContent = `กิจกรรม ${st.i + 1} จาก ${n}: ${st.list[st.i].title}`; }
    const pd = document.querySelector('#evc .evc-pdot[aria-current="true"] span');
    if (pd) { pd.style.animation = 'none'; void pd.offsetWidth; pd.style.animation = ''; }
  }

  /* ---------- เลื่อนอัตโนมัติ ---------- */
  function homeVisible() { const h = $('screen-home'); return Boolean(h && !h.classList.contains('hidden')); }
  function shouldRun() { return st.list.length > 1 && !st.userPaused && !reduceMotion(); }
  function blocked() { return st.hover || st.focus || Date.now() < st.hold || document.hidden || !homeVisible() || st.drag; }
  function stopTimer() { if (st.timer) { clearTimeout(st.timer); st.timer = null; } }
  function restartTimer() {
    stopTimer();
    if (st.root) st.root.classList.toggle('is-running', shouldRun() && !blocked());
    if (!shouldRun()) return;
    // ถูกขัด (ชี้เมาส์/โฟกัส/แตะ/สลับแท็บ) → รอจนเลิกขัด แล้วนับใหม่เต็ม 6 วินาทีก่อนเลื่อน (ไม่เด้งทันทีที่ปล่อย)
    st.timer = setTimeout(function tickFn() {
      if (blocked()) { st.wasBlocked = true; if (st.root) st.root.classList.remove('is-running'); st.timer = setTimeout(tickFn, 500); return; }
      if (st.root) st.root.classList.add('is-running');
      if (st.wasBlocked) { st.wasBlocked = false; const pd = document.querySelector('#evc .evc-pdot[aria-current="true"] span'); if (pd) { pd.style.animation = 'none'; void pd.offsetWidth; pd.style.animation = ''; } st.timer = setTimeout(tickFn, AUTO_MS); return; }
      go(st.i + 1, { announce: false });
      st.timer = setTimeout(tickFn, AUTO_MS);
    }, AUTO_MS);
  }
  function syncPlay() {
    const b = $('evc-play'); if (!b) return;
    const rm = reduceMotion();
    const playing = !st.userPaused && !rm;
    b.setAttribute('aria-pressed', String(!playing));
    b.setAttribute('aria-label', playing ? 'หยุดเลื่อนอัตโนมัติ' : 'เล่นเลื่อนอัตโนมัติ');
    b.innerHTML = `${ICON(playing ? 'circle-pause' : 'circle-play', 'icon')}<span class="evc-play-t">${playing ? 'หยุด' : 'เล่น'}</span>`;
    b.disabled = rm;
    if (rm) b.title = 'ปิดการเลื่อนอัตโนมัติตามการตั้งค่า "ลดการเคลื่อนไหว" ของเครื่อง';
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) restartTimer(); });
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => { syncPlay(); restartTimer(); }); }

  /* ---------- ปุ่ม/รายละเอียด/รับรางวัล ---------- */
  async function doClaim(s, btn) {
    btn.disabled = true;
    try {
      const r = await App().api(`/lobby/events/${encodeURIComponent(s.id)}/claim`, { method: 'POST', body: {} });
      const parts = [r.coins ? `+${r.coins} Coin` : '', r.exp ? `+${r.exp} EXP` : '', r.added && r.added.length ? `ของ ${r.added.length} ชิ้น` : ''].filter(Boolean);
      App().toast(`รับรางวัลแล้ว ${parts.join(' · ')}`, 'success');
      if (r.balance != null && window.EQAvatar && window.EQAvatar.checkCoins) window.EQAvatar.checkCoins();
      if (window.EQLobby) window.EQLobby.refresh();
    } catch (err) {
      App().toast((err && err.message) || 'รับรางวัลไม่สำเร็จ', 'error'); btn.disabled = false;
    }
  }
  function details(s) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay evc-modal';
    const [th, en] = STATUS[s.status] || STATUS.ongoing;
    ov.innerHTML = `<div class="modal-card evc-dialog" style="--evc-tone:${TONE[s.banner && s.banner.art] || '#1c2033'}">
      <div class="evc-d-media"><img alt="" width="1280" height="720" src="${esc(s.banner.mobile)}"></div>
      <p class="evc-meta"><span class="evc-type">${esc(s.typeLabel)}</span><span class="evc-status is-${esc(s.status)}"><span aria-hidden="true" class="evc-dot"></span>${th} · ${en}</span></p>
      <h2 class="evc-d-title">${esc(s.title)}</h2>${s.titleEn && s.titleEn !== s.title ? `<p class="evc-title-en">${esc(s.titleEn)}</p>` : ''}
      <p class="evc-d-desc">${esc(s.description)}</p>
      <dl class="evc-d-dl">
        <div><dt>เริ่ม</dt><dd>${s.type === 'daily' ? 'ทุกวัน 00:00 น.' : `${dfmt(s.startsAt, true)} ${tfmt(s.startsAt)} น.`}</dd></div>
        <div><dt>สิ้นสุด</dt><dd>${s.type === 'daily' ? 'ทุกวัน 23:59 น.' : `${dfmt(new Date(new Date(s.endsAt).getTime() - 1000).toISOString(), true)} ${tfmt(new Date(new Date(s.endsAt).getTime() - 1000).toISOString())} น.`}</dd></div>
        <div><dt>เขตเวลา</dt><dd>เวลาประเทศไทย (Asia/Bangkok)</dd></div>
      </dl>
      ${s.rewards && (s.rewards.coins || s.rewards.exp || (s.rewards.items || []).length || s.rewards.badge || s.rewards.theme) ? `<h3 class="evc-d-h">รางวัล</h3>${rewardChips(s.rewards, { full: true })}` : ''}
      ${progress(s.progress)}
      ${s.status === 'upcoming' ? '<p class="evc-note">กิจกรรมยังไม่เริ่ม — กลับมาเข้าร่วมได้เมื่อถึงเวลาเริ่ม</p>' : ''}
      <div class="evc-d-act">${s.cta && s.cta.kind === 'claim' ? `<button class="btn btn-primary" type="button" data-evc-d-claim>${ICON('gift')} รับรางวัล</button>`
        : s.cta && s.cta.kind === 'nav' ? `<button class="btn btn-primary" type="button" data-nav-to="${esc(s.cta.nav)}">${esc(s.cta.label)}</button>` : ''}</div>
    </div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: s.title });
    ov.querySelectorAll('[data-nav-to]').forEach((b) => b.addEventListener('click', () => ov.remove()));
    const cb = ov.querySelector('[data-evc-d-claim]'); if (cb) cb.addEventListener('click', async () => { await doClaim(s, cb); ov.remove(); });
    const mi = ov.querySelector('.evc-d-media img'); if (mi) mi.addEventListener('error', () => { if (!mi.dataset.f) { mi.dataset.f = '1'; mi.src = s.banner.fallback; } else mi.parentElement.remove(); });
  }
  function act(k, btn) {
    const s = st.list[k]; if (!s) return;
    st.hold = Date.now() + 10000;
    if (!s.cta || s.cta.kind === 'details') return details(s);
    if (s.cta.kind === 'claim') return doClaim(s, btn);
    return App().navigateTo(s.cta.nav);
  }

  /* ---------- อีเวนต์ (ผูกครั้งเดียวที่ document) ---------- */
  document.addEventListener('click', (e) => {
    const root = $('evc'); if (!root || !root.contains(e.target)) return;
    if (st.suppressClick) { st.suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.evcGo) { st.hold = Date.now() + 10000; go(st.i + Number(b.dataset.evcGo)); restartTimer(); return; }
    if (b.dataset.evcDot) { st.hold = Date.now() + 10000; go(Number(b.dataset.evcDot)); restartTimer(); return; }
    if (b.id === 'evc-play') {
      st.userPaused = !st.userPaused;
      try { localStorage.setItem('eq:evc:paused', st.userPaused ? '1' : '0'); } catch (_) { /* ไม่มี storage */ }
      syncPlay(); restartTimer(); return;
    }
    if (b.dataset.evcCta) { act(Number(b.dataset.evcCta), b); return; }
    if (b.dataset.evcDetails) { st.hold = Date.now() + 10000; details(st.list[Number(b.dataset.evcDetails)]); }
  }, true);
  document.addEventListener('keydown', (e) => {
    const root = $('evc'); if (!root || !root.contains(e.target)) return;
    if (e.target.closest('.evc-dots, .evc-viewport, .evc-ctrl') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault(); go(st.i + (e.key === 'ArrowRight' ? 1 : -1)); restartTimer();
      const d = document.querySelector('#evc .evc-pdot[aria-current="true"]'); if (d && e.target.closest('.evc-dots')) d.focus();
    } else if (e.key === 'Home' && e.target.closest('.evc-dots')) { e.preventDefault(); go(0); } else if (e.key === 'End' && e.target.closest('.evc-dots')) { e.preventDefault(); go(st.list.length - 1); }
  });
  document.addEventListener('focusin', (e) => { const r = $('evc'); st.focus = Boolean(r && r.contains(e.target)); if (st.focus && st.root) st.root.classList.remove('is-running'); });
  document.addEventListener('focusout', () => { setTimeout(() => { const r = $('evc'); st.focus = Boolean(r && r.contains(document.activeElement)); }, 0); });
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const r = $('evc'); const on = Boolean(r && r.contains(e.target)); if (on !== st.hover) { st.hover = on; if (st.root) st.root.classList.toggle('is-running', !on && shouldRun()); } });

  /* ---------- ปัด (Pointer Events: นิ้ว/ปากกา/เมาส์) ---------- */
  document.addEventListener('pointerdown', (e) => {
    const vp = e.target.closest && e.target.closest('#evc-viewport'); if (!vp || st.list.length < 2 || e.button > 0) return;
    if (e.target.closest('.evc-nav')) return;
    st.drag = { x: e.clientX, y: e.clientY, dx: 0, axis: null, id: e.pointerId, w: vp.clientWidth };
    st.hold = Date.now() + 10000;
  });
  document.addEventListener('pointermove', (e) => {
    const d = st.drag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x; const dy = e.clientY - d.y;
    if (!d.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (d.axis !== 'x') return;
    d.dx = dx;
    const track = $('evc-track'); if (!track) return;
    track.style.transition = 'none';
    track.style.transform = `translate3d(calc(${-st.i * 100}% + ${dx}px),0,0)`;
  });
  function endDrag(e) {
    const d = st.drag; if (!d || (e && e.pointerId !== d.id)) return;
    st.drag = null;
    if (d.axis === 'x') {
      st.suppressClick = Math.abs(d.dx) > 10;
      setTimeout(() => { st.suppressClick = false; }, 50);
      const go1 = Math.abs(d.dx) > Math.min(80, d.w * 0.18) ? (d.dx < 0 ? 1 : -1) : 0;
      go(st.i + go1);
      restartTimer();
    }
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* =====================================================================
     ผู้ดูแล — จัดการแบนเนอร์กิจกรรม (ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์: /api/admin/event-carousel)
     ===================================================================== */
  const AD = { opts: null, list: [] };
  const toLocalInput = (iso) => { const d = new Date(new Date(iso).getTime() + 7 * 3600000); return d.toISOString().slice(0, 16); };
  const fromLocalInput = (v) => (v ? new Date(`${v}:00+07:00`).toISOString() : null);
  async function mountAdmin() {
    const box = $('admin-evc-root'); if (!box) return;
    box.innerHTML = '<p class="admin-hint">กำลังโหลด…</p>';
    try { const d = await App().api('/admin/event-carousel'); AD.opts = d.options; AD.list = d.events; } catch (err) { box.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; return; }
    const O = AD.opts;
    box.innerHTML = `
      <p class="admin-hint">ลำดับบนหน้าแรก: Featured → กำลังจัด → เร็ว ๆ นี้ → ภารกิจประจำวัน (ในกลุ่มเดียวกันเรียงตามลำดับความสำคัญ มาก→น้อย) · เวลาเป็นเวลาไทย · กิจกรรมระบบแก้ได้เฉพาะการแสดงผล</p>
      <button class="mini-btn" type="button" data-evc-new>${ICON('plus')} สร้างกิจกรรมใหม่</button>
      <div class="evc-admin-list">${AD.list.map((e) => `<div class="evc-admin-row${e.visibility === 'hidden' ? ' is-hidden' : ''}">
        <img src="${esc(e.banner.mobile)}" alt="" width="96" height="54" loading="lazy">
        <div><b>${esc(e.title)}</b> <span class="admin-tag">${esc(e.source === 'admin' ? 'แอดมิน' : 'ระบบ')}</span> <span class="admin-tag">${esc((O.types[e.type] || {}).th || e.type)}</span>
          <span class="admin-tag">${esc((STATUS[e.status] || [e.status])[0])}</span>${e.featured ? '<span class="admin-tag">Featured</span>' : ''}${e.visibility === 'hidden' ? '<span class="admin-tag">ซ่อน</span>' : ''}${e.retired ? '<span class="admin-tag">เลิกแสดง (config)</span>' : ''}
          <div class="admin-row-src">${dfmt(e.startsAt, true)} – ${dfmt(new Date(new Date(e.endsAt).getTime() - 1000).toISOString(), true)} · ลำดับ ${e.priority} · รับรางวัลแล้ว ${e.claims} คน</div></div>
        <button class="mini-btn" type="button" data-evc-edit="${esc(e.id)}">แก้ไข</button></div>`).join('')}</div>`;
  }
  function editor(e) {
    const O = AD.opts; const isNew = !e; const sys = e && e.source !== 'admin';
    const v = e || { title: '', description: '', type: 'vocab', route: 'learn', priority: 0, featured: false, visibility: 'hidden', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), reward: { coins: 0, exp: 0, items: [] }, eligibility: { type: 'none' }, bannerDesktop: '', bannerMobile: '' };
    const el = v.eligibility || { type: 'none' }; const rw = v.reward || {};
    const ov = document.createElement('div'); ov.className = 'modal-overlay';
    ov.innerHTML = `<form class="modal-card evc-admin-form" novalidate>
      <h2>${isNew ? 'สร้างกิจกรรม' : `แก้ไข: ${esc(v.title)}`}</h2>
      ${sys ? '<p class="admin-hint">กิจกรรมของระบบ — วันที่ รางวัล และปลายทางมาจากระบบกิจกรรมเดิม แก้ได้เฉพาะการแสดงผล</p>' : ''}
      <label>ชื่อกิจกรรม (ไทย)<input name="title" maxlength="${O.limits.title}" value="${esc(v.titleTh || (isNew ? '' : v.title))}" placeholder="${esc(v.title)}"></label>
      <label>คำอธิบายสั้น<textarea name="description" maxlength="${O.limits.description}" rows="2">${esc(v.description)}</textarea></label>
      <div class="evc-admin-grid">
        ${sys ? '' : `<label>ประเภท<select name="type">${Object.entries(O.types).filter(([k]) => !['adventure', 'festival'].includes(k)).map(([k, t]) => `<option value="${k}"${k === v.type ? ' selected' : ''}>${esc(t.th)}</option>`).join('')}</select></label>
        <label>ปลายทางปุ่ม<select name="route">${O.routes.map((r) => `<option${r === v.route ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>เริ่ม (เวลาไทย)<input type="datetime-local" name="startsAt" value="${toLocalInput(v.startsAt)}"></label>
        <label>สิ้นสุด (เวลาไทย)<input type="datetime-local" name="endsAt" value="${toLocalInput(v.endsAt)}"></label>`}
        <label>ลำดับความสำคัญ<input type="number" name="priority" min="-${O.limits.priority}" max="${O.limits.priority}" value="${Number(v.priority) || 0}"></label>
        <label>การเผยแพร่<select name="visibility"><option value="published"${v.visibility === 'published' ? ' selected' : ''}>เผยแพร่</option><option value="hidden"${v.visibility === 'hidden' ? ' selected' : ''}>ซ่อน</option></select></label>
        <label class="evc-chk"><input type="checkbox" name="featured"${v.featured ? ' checked' : ''}> Featured (ขึ้นก่อน)</label>
      </div>
      <fieldset><legend>แบนเนอร์</legend>
        <label>ภาพสำเร็จรูป<select name="art"><option value="">— ใช้ตามประเภท/อัปโหลด —</option>${O.arts.map((a) => `<option value="${a}">${a}</option>`).join('')}</select></label>
        <label>Desktop (URL ในระบบ)<input name="bannerDesktop" value="${esc(v.bannerDesktop || '')}" placeholder="/assets/events/banners/....webp"></label>
        <label>Mobile (URL ในระบบ)<input name="bannerMobile" value="${esc(v.bannerMobile || '')}" placeholder="เว้นว่าง = ใช้ภาพเดียวกับ Desktop"></label>
        <label>อัปโหลดภาพ (PNG/WebP ≤ 700KB · แนะนำ 1280×720)<input type="file" accept="image/png,image/webp" data-evc-upload></label>
      </fieldset>
      ${sys ? '' : `<fieldset${e && e.claims ? ' disabled' : ''}><legend>รางวัลและเงื่อนไข${e && e.claims ? ` (ล็อก — มีผู้รับแล้ว ${e.claims} คน)` : ''}</legend>
        <div class="evc-admin-grid">
          <label>เงื่อนไข<select name="elType">${Object.entries(O.eligibility).map(([k, x]) => `<option value="${k}"${k === el.type ? ' selected' : ''}>${esc(x.th)}</option>`).join('')}</select></label>
          <label>เป้าหมาย<input type="number" name="elTarget" min="1" max="${O.limits.target}" value="${el.target || 10}"></label>
          <label>ทักษะ (ตอบถูก)<select name="elSkill">${['any', 'vocab', 'grammar'].map((x) => `<option${x === el.skill ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Coin<input type="number" name="coins" min="0" max="${O.limits.coins}" value="${rw.coins || 0}"></label>
          <label>EXP<input type="number" name="exp" min="0" max="${O.limits.exp}" value="${rw.exp || 0}"></label>
          <label>ของรางวัล (id คั่นด้วย ,)<input name="items" value="${esc((rw.items || []).join(', '))}"></label>
        </div></fieldset>`}
      <p class="form-error hidden" data-evc-err></p>
      <div class="evc-d-act"><button class="btn btn-primary" type="submit">บันทึก</button></div>
    </form>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: isNew ? 'สร้างกิจกรรม' : 'แก้ไขกิจกรรม' });
    const f = ov.querySelector('form');
    f.art.addEventListener('change', () => { if (f.art.value) { f.bannerDesktop.value = `/assets/events/banners/${f.art.value}-1280.webp`; f.bannerMobile.value = `/assets/events/banners/${f.art.value}-640.webp`; } });
    ov.querySelector('[data-evc-upload]').addEventListener('change', async (ev2) => {
      const file = ev2.target.files[0]; if (!file) return;
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      try { const r = await App().api('/admin/event-carousel/upload', { method: 'POST', body: { dataUrl } }); f.bannerDesktop.value = r.url; if (!f.bannerMobile.value) f.bannerMobile.value = r.url; App().toast('อัปโหลดแล้ว', 'success'); } catch (err) { App().toast(err.message, 'error'); }
    });
    f.addEventListener('submit', async (ev2) => {
      ev2.preventDefault();
      const body = { title: f.title.value || (e && e.title) || '', description: f.description.value, priority: Number(f.priority.value), visibility: f.visibility.value, featured: f.featured.checked,
        bannerDesktop: f.bannerDesktop.value, bannerMobile: f.bannerMobile.value };
      if (!sys) {
        Object.assign(body, { type: f.type.value, route: f.route.value, startsAt: fromLocalInput(f.startsAt.value), endsAt: fromLocalInput(f.endsAt.value) });
        if (!(e && e.claims)) {
          body.eligibility = { type: f.elType.value, target: Number(f.elTarget.value), skill: f.elSkill.value };
          body.reward = { coins: Number(f.coins.value), exp: Number(f.exp.value), items: f.items.value.split(',').map((x) => x.trim()).filter(Boolean) };
        }
      }
      if (sys && !f.title.value) delete body.title;
      const err = ov.querySelector('[data-evc-err]');
      try {
        await App().api(isNew ? '/admin/event-carousel' : `/admin/event-carousel/${encodeURIComponent(e.id)}`, { method: isNew ? 'POST' : 'PUT', body });
        ov.remove(); App().toast('บันทึกแล้ว', 'success'); mountAdmin();
      } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-evc-new],[data-evc-edit]'); if (!b || !$('admin-evc-root') || !$('admin-evc-root').contains(b)) return;
    if (b.hasAttribute('data-evc-new')) editor(null); else editor(AD.list.find((x) => x.id === b.dataset.evcEdit));
  });

  window.EQEventCarousel = { render, mountAdmin, go: (k) => go(k), _state: () => ({ i: st.i, n: st.list.length, userPaused: st.userPaused, running: Boolean(st.root && st.root.classList.contains('is-running')), list: st.list, focus: st.focus, hover: st.hover, held: Date.now() < st.hold }) };
}());
