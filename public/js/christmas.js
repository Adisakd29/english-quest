/* =====================================================================
   Christmas 2026 — "A Magical Christmas" (v1.25.0) — window.EQChristmas
   - Event Hub (#/christmas): ของขวัญต้อนรับ · เช็กอินรายวัน (ต้องเรียนก่อน) · เควสต์การเรียนรายวัน · ร้าน Snowflake Token
   - การ์ดคริสต์มาสในหน้าแรก (Lobby): นับถอยหลังวันคริสต์มาส · Token · สถานะเช็กอิน
   - หน้าเข้าสู่ระบบ: "Welcome to a Magical Christmas!" ระหว่างธีมคริสต์มาส
   ทุกตัวเลข (Token / ความคืบหน้า / ราคา) มาจากเซิร์ฟเวอร์ (/api/christmas) — หน้าเว็บไม่คำนวณรางวัลเอง
   ฟีเจอร์ P1 (Advent / Story / Boss / Photo booth) ยังไม่มี → ไม่แสดงปุ่มใด ๆ (ไม่มีปุ่มหลอก)
   ===================================================================== */
(function () {
  'use strict';
  const App = () => window.EQApp;
  const esc = (s) => (App() ? App().escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const icon = (n, cls = 'icon-sm') => (window.EQG ? window.EQG.icon(n, cls) : '');
  const root = document.documentElement;
  const isXmasSeason = () => !!(window.EQSeason && window.EQSeason.key === 'christmas');
  const CHRISTMAS_DAY = Date.parse('2026-12-25T00:00:00+07:00');
  const RARITY_TH = { common: 'ทั่วไป', uncommon: 'ไม่ธรรมดา', rare: 'หายาก', epic: 'มหากาพย์', legendary: 'ตำนาน' };
  const SLOT_TH = { top: 'เสื้อ', outerwear: 'เสื้อคลุม', hat: 'หมวก/ที่คาดผม', accessory: 'เครื่องประดับ', shoes: 'รองเท้า', back: 'สะพายหลัง', pframe: 'กรอบโปรไฟล์', cframe: 'กรอบแชท' };
  const ST = { data: null, loading: false, offset: 0, timer: null, busy: new Set(), filter: 'all' };
  const flake = '<svg class="xm-flake" viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4 10l3.4.5L6 13.6M20 10l-3.4.5L18 13.6M4 14l3.4-.5L6 10.4M20 14l-3.4-.5L18 10.4" fill="none"/></g></svg>';

  /* ---------- หน้าเข้าสู่ระบบ ---------- */
  let authOriginal = null;
  function syncAuthText() {
    const h = document.querySelector('#screen-auth .auth-message');
    if (!h) return;
    if (authOriginal === null) authOriginal = h.innerHTML;
    const want = root.dataset.skin === 'christmas';
    if (want && !h.dataset.xm) { h.textContent = 'Welcome to a Magical Christmas!'; h.dataset.xm = '1'; h.setAttribute('lang', 'en'); }
    else if (!want && h.dataset.xm) { h.innerHTML = authOriginal; delete h.dataset.xm; }
  }
  new MutationObserver(syncAuthText).observe(root, { attributes: true, attributeFilter: ['data-skin'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncAuthText, { once: true }); else syncAuthText();

  /* ---------- ข้อมูล ---------- */
  const now = () => Date.now() + ST.offset;
  async function load(force = false) {
    if (!App() || !App().user || !isXmasSeason()) return null;
    if (ST.loading) return ST.data;
    if (ST.data && !force && Date.now() - ST.data._at < 30000) return ST.data;
    ST.loading = true;
    try {
      const d = await App().api('/christmas');
      d._at = Date.now(); ST.offset = Date.parse(d.serverNow) - Date.now(); ST.data = d;
      return d;
    } catch (_) { return ST.data; } finally { ST.loading = false; }
  }
  function fmtLeft(ms) {
    if (ms <= 0) return '0 นาที';
    const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? `${d} วัน ${h} ชม.` : h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
  }
  function countdownText(d) {
    const t = now();
    if (t < CHRISTMAS_DAY) return { label: 'อีกนิดเดียวก็ถึงวันคริสต์มาส', value: fmtLeft(CHRISTMAS_DAY - t) };
    if (t < CHRISTMAS_DAY + 86400000) return { label: 'วันนี้วันคริสต์มาส', value: 'Merry Christmas!' };
    if (d && d.status === 'active') return { label: 'กิจกรรมเหลือเวลาอีก', value: fmtLeft(Date.parse(d.endsAt) - t) };
    if (d && d.status === 'claim_only') return { label: 'ใช้ Token ในร้านได้อีก', value: fmtLeft(Date.parse(d.claimUntil) - t) };
    return { label: 'กิจกรรมคริสต์มาส', value: 'จบแล้ว' };
  }
  function tick() {
    document.querySelectorAll('[data-xm-count]').forEach((el) => { const c = countdownText(ST.data); el.querySelector('b').textContent = c.value; el.querySelector('small').textContent = c.label; });
  }
  function startTick() { if (!ST.timer) ST.timer = setInterval(() => { if (document.hidden) return; tick(); }, 30000); }

  /* ---------- การ์ดในหน้าแรก (Lobby) ---------- */
  async function renderLobbyCard() {
    let box = document.getElementById('xm-lobby-card');
    // จอกว้าง (≥ 1100px): คอลัมน์ซ้ายบนสุด · มือถือ/แท็บเล็ต: บนสุดของหน้าแรก (ก่อนแถบกิจกรรม) — เห็นทันทีโดยไม่ต้องเลื่อน
    // v1.26.0 ทุกขนาดจอ: บนสุดของคอลัมน์เควสต์ (มือถือ = ถัดจากฉาก Hero · เห็นทันทีโดยไม่ต้องเลื่อนลงไปท้ายหน้า)
    const host = document.querySelector('#home-lobby .hl-left');
    if (!isXmasSeason() || !App() || !App().user || !host) { if (box) box.remove(); return; }
    const d = await load();
    if (!d || d.status === 'disabled' || d.status === 'scheduled' || d.status === 'ended') { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('section'); box.id = 'xm-lobby-card'; box.className = 'xm-lobby'; box.setAttribute('aria-labelledby', 'xm-lobby-title'); }
    if (box.parentElement !== host) host.prepend(box);
    const c = countdownText(d); const ck = d.checkin || {};
    const status = !ck.enabled ? '' : ck.claimedToday ? `${icon('check')} เปิดของขวัญวันนี้แล้ว` : ck.canClaim ? `${icon('gift')} ของขวัญวันนี้พร้อมเปิดแล้ว!` : `${icon('book-open')} ตอบถูกอีก ${Math.max(0, ck.need - ck.correctToday)} ข้อ เพื่อเปิดของขวัญวันนี้`;
    box.innerHTML = `<div class="xm-lobby-top"><h2 class="xm-lobby-title" id="xm-lobby-title">${flake} <span lang="en">A Magical Christmas</span></h2>
        <span class="xm-tok" title="Snowflake Token">${flake}<b>${esc(d.balance)}</b></span></div>
      <p class="xm-count" data-xm-count><small>${esc(c.label)}</small><b>${esc(c.value)}</b></p>
      ${status ? `<p class="xm-lobby-status${ck.canClaim ? ' is-ready' : ''}">${status}</p>` : ''}
      <button class="btn btn-primary xm-lobby-go" type="button" data-nav-to="christmas">${icon('gift')} เปิด Christmas Hub</button>`;
    startTick();
  }

  /* ---------- Event Hub ---------- */
  function hubSkeleton() { return '<div class="xm-hub"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div></div>'; }
  function questRow(q, bonus = false) {
    const pct = Math.round((Math.min(q.progress, q.target) / Math.max(1, q.target)) * 100);
    const btn = q.claimed ? `<span class="xm-q-done">${icon('check')} รับแล้ว</span>`
      : q.canClaim ? `<button class="btn btn-primary btn-sm" type="button" data-xm-claim="${esc(q.id)}">${icon('gift')} รับรางวัล</button>`
        : bonus ? '<span class="xm-q-wait">รับเควสต์ให้ครบก่อน</span>'
          : `<button class="btn btn-secondary btn-sm" type="button" data-xm-go="${esc(q.go)}">${icon('play')} ไปฝึก</button>`;
    return `<li class="xm-q${q.claimed ? ' is-claimed' : q.canClaim ? ' is-ready' : ''}">
      <span class="xm-q-ic" aria-hidden="true">${icon(q.icon || 'star')}</span>
      <div class="xm-q-body"><b>${esc(q.titleTh)}</b><small lang="en">${esc(q.titleEn)}</small>
        <span class="xm-bar" role="progressbar" aria-label="ความคืบหน้า ${esc(q.titleTh)}" aria-valuemin="0" aria-valuemax="${esc(q.target)}" aria-valuenow="${esc(Math.min(q.progress, q.target))}"><i style="width:${pct}%"></i></span>
        <small class="xm-q-meta">${q.detail ? `${esc(q.detail)} · ` : `${esc(Math.min(q.progress, q.target))}/${esc(q.target)} · `}รางวัล ${flake}${esc(q.tokens)} + ${esc(q.exp)} EXP</small></div>
      <div class="xm-q-act">${btn}</div></li>`;
  }
  function shopCard(it) {
    const busy = ST.busy.has(`buy:${it.id}`);
    const can = !it.owned && ST.data.balance >= it.price && (ST.data.status === 'active' || ST.data.status === 'claim_only');
    const art = it.kind === 'pframe'
      ? `<svg class="xm-shop-frame" viewBox="0 0 100 100" aria-hidden="true"><use href="/assets/frames/frames.svg#${esc(it.id)}"></use></svg>`
      : it.kind === 'cframe' ? `<span class="xm-shop-cf" data-cf="${esc(it.id)}" aria-hidden="true">Merry Christmas!</span>`
        : it.thumbnailUrl ? `<img src="${esc(it.thumbnailUrl)}" alt="" loading="lazy" decoding="async" width="128" height="128">` : '';
    const act = it.owned
      ? (it.kind === 'avatar' ? `<button class="btn btn-secondary btn-sm" type="button" data-xm-wear="${esc(it.id)}">${icon('shirt')} ใส่เลย</button>` : `<span class="xm-q-done">${icon('check')} มีแล้ว</span>`)
      : `<button class="btn btn-primary btn-sm" type="button" data-xm-buy="${esc(it.id)}" ${can && !busy ? '' : 'disabled'} aria-label="แลก ${esc(it.nameTh)} ด้วย ${esc(it.price)} Snowflake Token">${flake}${esc(it.price)}</button>`;
    return `<li class="xm-shop-it rar-${esc(it.rarity)}${it.owned ? ' is-owned' : ''}">
      <div class="xm-shop-art">${art}</div>
      <b>${esc(it.nameTh)}</b><small>${esc(SLOT_TH[it.kind === 'avatar' ? it.slot : it.kind] || '')} · ${esc(RARITY_TH[it.rarity] || it.rarity)}${it.kind === 'avatar' && it.has3d ? ' · 3D' : ''}</small>
      <div class="xm-shop-act">${act}</div></li>`;
  }
  function renderHub() {
    const host = document.getElementById('xm-root');
    if (!host) return;
    const d = ST.data;
    if (!d) { host.innerHTML = '<div class="empty-state"><p>โหลดกิจกรรมคริสต์มาสไม่สำเร็จ — ลองใหม่อีกครั้ง</p></div>'; return; }
    if (d.status === 'scheduled' || d.status === 'disabled' || d.status === 'ended') {
      host.innerHTML = `<div class="xm-hub"><header class="xm-hero"><h1 id="xm-title"><span lang="en">A Magical Christmas</span></h1>
        <p>${d.status === 'scheduled' ? 'กิจกรรมคริสต์มาสยังไม่เริ่ม' : d.status === 'disabled' ? 'กิจกรรมคริสต์มาสปิดอยู่ชั่วคราว' : 'กิจกรรมคริสต์มาสจบแล้ว — ของที่ได้รับเป็นของคุณถาวร'}</p></header></div>`;
      return;
    }
    const c = countdownText(d); const ck = d.checkin || {}; const st = d.starter || {};
    const items = (d.shop || []).filter((it) => ST.filter === 'all' || (ST.filter === 'outfit' ? ['top', 'outerwear'].includes(it.slot) : ST.filter === 'acc' ? it.kind === 'avatar' && !['top', 'outerwear'].includes(it.slot) : it.kind !== 'avatar'));
    host.innerHTML = `<div class="xm-hub">
      <header class="xm-hero">
        <div class="xm-hero-text"><p class="xm-kicker">${flake} Christmas 2026 · ${esc(new Date(d.startsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }))} – ${esc(new Date(Date.parse(d.endsAt) - 1).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }))}</p>
          <h1 id="xm-title" lang="en">A Magical Christmas</h1>
          <p class="xm-sub">เรียนภาษาอังกฤษทุกวัน รับ Snowflake Token แล้วแลกชุดคริสต์มาส 3D ที่ใส่ได้จริง</p></div>
        <div class="xm-hero-side">
          <p class="xm-count" data-xm-count><small>${esc(c.label)}</small><b>${esc(c.value)}</b></p>
          <p class="xm-balance"><small>Snowflake Token ของฉัน</small><b>${flake}<span id="xm-bal">${esc(d.balance)}</span></b><small>สะสมทั้งหมด ${esc(d.earned)}</small></p>
        </div>
      </header>
      ${d.status === 'claim_only' ? '<p class="xm-note">กิจกรรมจบแล้ว — ยังแลกของในร้านด้วย Token ที่เหลือได้ถึง 7 ม.ค. 2570</p>' : ''}
      <div class="xm-grid">
        ${st.enabled && !st.claimed ? `<section class="xm-card xm-starter" aria-labelledby="xm-st-title"><h2 id="xm-st-title">${icon('gift')} ของขวัญต้อนรับ</h2>
          <p>รับครั้งเดียว: ${flake}${esc(st.tokens)} Token + กรอบโปรไฟล์ "ใบฮอลลี่หิมะ"</p>
          <button class="btn btn-primary" type="button" data-xm-starter ${st.canClaim && !ST.busy.has('starter') ? '' : 'disabled'}>${icon('gift')} รับของขวัญต้อนรับ</button></section>` : ''}
        ${ck.enabled ? `<section class="xm-card xm-checkin" aria-labelledby="xm-ck-title">
          <h2 id="xm-ck-title">${icon('calendar-check')} ของขวัญประจำวัน</h2>
          <div class="xm-gift${ck.claimedToday ? ' is-open' : ck.canClaim ? ' is-ready' : ''}" aria-hidden="true"><span class="xm-gift-lid"></span><span class="xm-gift-box"></span><span class="xm-gift-glow"></span></div>
          <p>${ck.claimedToday ? `เปิดแล้ววันนี้ · พรุ่งนี้มาใหม่หลังเที่ยงคืน` : ck.canClaim ? 'เรียนครบแล้ว! เปิดกล่องรับรางวัลได้เลย' : `ตอบให้ถูก ${esc(ck.need)} ข้อวันนี้ (ตอนนี้ ${esc(ck.correctToday)}) แล้วกลับมาเปิดกล่อง`}</p>
          <p class="xm-ck-meta">รางวัล ${flake}${esc(ck.tokens)} + ${esc(ck.exp)} EXP · เปิดแล้ว ${esc(ck.days)} วัน (ไม่ต้องต่อเนื่อง ขาดได้ไม่รีเซ็ต)</p>
          ${ck.claimedToday ? '' : ck.canClaim ? `<button class="btn btn-primary" type="button" data-xm-checkin ${ST.busy.has('checkin') ? 'disabled' : ''}>${icon('gift')} เปิดของขวัญ</button>`
            : '<button class="btn btn-secondary" type="button" data-xm-go="#/learn">' + icon('book-open') + ' ไปเรียนก่อน</button>'}
        </section>` : ''}
        ${(d.quests || []).length ? `<section class="xm-card xm-quests" aria-labelledby="xm-q-title"><h2 id="xm-q-title">${icon('list-checks')} เควสต์คริสต์มาสวันนี้</h2>
          <p class="xm-card-sub">นับจากการเรียนจริงของวันนี้ (เวลาไทย) · เปลี่ยนเควสต์ทุกเที่ยงคืน</p>
          <ul class="xm-qs">${d.quests.map((q) => questRow(q)).join('')}${d.bonus ? questRow(d.bonus, true) : ''}</ul></section>` : ''}
      </div>
      ${(d.shop || []).length ? `<section class="xm-card xm-shop" aria-labelledby="xm-shop-title">
        <div class="xm-shop-head"><h2 id="xm-shop-title">${icon('shopping-bag')} ร้านคริสต์มาส</h2>
          <div class="vd-seg xm-shop-filter" role="radiogroup" aria-label="หมวดของ">${[['all', 'ทั้งหมด'], ['outfit', 'ชุด'], ['acc', 'ของประกอบ'], ['frame', 'กรอบ']].map(([k, n]) => `<button type="button" class="vd-seg-btn${ST.filter === k ? ' active' : ''}" role="radio" aria-checked="${ST.filter === k}" data-xm-filter="${k}">${n}</button>`).join('')}</div></div>
        <p class="xm-card-sub">แลกด้วย Snowflake Token เท่านั้น (ซื้อด้วย Coin ไม่ได้) · ชุดทุกชิ้นเป็นโมเดล 3D ที่ใส่ได้จริงและบันทึกในบัญชี · ได้แล้วเป็นของถาวร</p>
        <ul class="xm-shop-grid">${items.map(shopCard).join('')}</ul></section>` : ''}
    </div>`;
    startTick();
    renderP1();
  }
  async function open() {
    if (App()) { App().showScreen('screen-christmas'); App().rememberOrigin('christmas'); }
    const host = document.getElementById('xm-root');
    if (!isXmasSeason()) { if (host) host.innerHTML = '<div class="xm-hub"><header class="xm-hero"><h1 id="xm-title">กิจกรรมคริสต์มาส</h1><p>ยังไม่อยู่ในช่วงกิจกรรม</p></header></div>'; return; }
    if (host && !ST.data) host.innerHTML = hubSkeleton();
    await Promise.all([load(true), loadPlay()]);
    renderHub();
  }

  /* ---------- การกระทำ ---------- */
  function afterReward(r, label) {
    if (r.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
    App().toast(`${label} +${r.tokens} Snowflake Token${r.exp ? ` · +${r.exp} EXP` : ''}`, 'success');
  }
  async function act(key, fn) {
    if (ST.busy.has(key)) return;
    ST.busy.add(key); renderHub();
    try { await fn(); } catch (e) { App().toast((e && e.message) || 'ทำรายการไม่สำเร็จ', 'error'); }
    finally { ST.busy.delete(key); await load(true); renderHub(); renderLobbyCard(); }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-xm-claim], [data-xm-checkin], [data-xm-starter], [data-xm-buy], [data-xm-wear], [data-xm-go], [data-xm-filter], #xm-back');
    if (!t || !App()) return;
    if (t.id === 'xm-back') { App().goBackFrom('christmas'); return; }
    if (t.dataset.xmFilter) { ST.filter = t.dataset.xmFilter; renderHub(); return; }
    if (t.dataset.xmGo) { window.location.hash = t.dataset.xmGo; return; }
    if (t.hasAttribute('data-xm-checkin')) {
      act('checkin', async () => {
        const gift = document.querySelector('.xm-gift'); if (gift) gift.classList.add('is-opening');
        const r = await App().api('/christmas/checkin', { method: 'POST' });
        await new Promise((res) => setTimeout(res, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650));
        afterReward(r, 'เปิดของขวัญแล้ว!');
      });
      return;
    }
    if (t.dataset.xmClaim) { const id = t.dataset.xmClaim; act(`q:${id}`, async () => afterReward(await App().api(`/christmas/quests/${encodeURIComponent(id)}/claim`, { method: 'POST' }), 'รับรางวัลเควสต์แล้ว')); return; }
    if (t.hasAttribute('data-xm-starter')) {
      act('starter', async () => { const r = await App().api('/christmas/starter', { method: 'POST' }); App().toast(`ได้รับ ${r.tokens} Snowflake Token + กรอบโปรไฟล์ใบฮอลลี่หิมะ (ใส่ได้ที่ โปรไฟล์ → กรอบ)`, 'success'); });
      return;
    }
    if (t.dataset.xmBuy) {
      const id = t.dataset.xmBuy; const it = (ST.data.shop || []).find((x) => x.id === id);
      if (!it) return;
      act(`buy:${id}`, async () => {
        const r = await App().api(`/christmas/shop/${encodeURIComponent(id)}/buy`, { method: 'POST' });
        App().toast(`แลก "${it.nameTh}" แล้ว · เหลือ ${r.balance} Token${r.kind === 'avatar' ? ' — กด "ใส่เลย" เพื่อสวมทันที' : ''}`, 'success');
        if (window.EQAvatar && window.EQAvatar.loadCatalog) window.EQAvatar.loadCatalog(true).catch(() => {});
      });
      return;
    }
    if (t.dataset.xmWear) {
      const id = t.dataset.xmWear;
      act(`wear:${id}`, async () => {
        if (!window.EQAvatar || !window.EQAvatar.equipItems) throw new Error('ระบบ Avatar ยังโหลดไม่เสร็จ');
        await window.EQAvatar.equipItems([id]);   // บันทึกชุดในบัญชี (POST /api/avatar/equip) — เปิดเครื่องอื่น/รีเฟรชแล้วยังอยู่
        App().toast('ใส่แล้ว! ดูตัวละครได้ที่หน้าแรก', 'success');
      });
    }
  });

  window.addEventListener('eq:screen', (e) => {
    const id = e.detail && e.detail.id;
    if (id === 'screen-home') renderLobbyCard();
  });
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.getElementById('xm-lobby-card')) renderLobbyCard(); }, 300); }, { passive: true });
  window.addEventListener('eq:season', () => { ST.data = null; renderLobbyCard(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  /* =====================================================================
     v1.25.1 กิจกรรม P1: Advent Calendar · Boss "Frost Giant" · Story · Photo booth
     โจทย์/เฉลยอยู่ฝั่งเซิร์ฟเวอร์ (/api/christmas/advent|boss|story) — หน้าเว็บส่งแค่ตัวเลือกที่กด
     ===================================================================== */
  const P = { data: null, game: null, timer: null };
  async function loadPlay() {
    if (!App() || !App().user || !isXmasSeason()) return null;
    try { P.data = await App().api('/christmas/play'); } catch (_) { P.data = null; }
    return P.data;
  }
  function renderP1() {
    const hub = document.querySelector('#xm-root .xm-hub');
    if (!hub || !P.data) return;
    let box = document.getElementById('xm-p1');
    if (!box) { box = document.createElement('div'); box.id = 'xm-p1'; box.className = 'xm-p1'; const g = hub.querySelector('.xm-grid'); if (g) g.after(box); else hub.appendChild(box); }
    const d = P.data; const parts = [];
    if (d.advent) {
      parts.push(`<section class="xm-card xm-advent" aria-labelledby="xm-ad-title"><h2 id="xm-ad-title">${icon('calendar-check')} Advent Calendar</h2>
        <p class="xm-card-sub">ประตูวันละบาน 1–25 ธ.ค. · เปิดประตู = ตอบคำศัพท์ ${esc(d.advent.questions)} ข้อ ถูก ${esc(d.advent.pass)} ข้อขึ้นไป · พลาดวันไหนย้อนกลับมาเปิดได้ · เปิดแล้ว ${esc(d.advent.opened)}/${esc(d.advent.total)}</p>
        <ol class="xm-doors">${d.advent.doors.map((x) => `<li><button type="button" class="xm-door${x.opened ? ' is-open' : x.canOpen ? ' is-ready' : ''}${x.tokens > 15 ? ' is-big' : ''}" data-xm-door="${x.day}"
          ${x.canOpen ? '' : 'disabled'} aria-label="ประตูวันที่ ${x.day} ธ.ค. ${x.opened ? '— เปิดแล้ว' : x.canOpen ? `— เปิดได้ รางวัล ${x.tokens} Token` : '— ยังไม่ถึงวัน'}">
          <b>${x.day}</b>${x.opened ? icon('check') : `<small>${flake}${esc(x.tokens)}</small>`}</button></li>`).join('')}</ol></section>`);
    }
    if (d.boss) {
      parts.push(`<section class="xm-card xm-boss" aria-labelledby="xm-boss-title"><h2 id="xm-boss-title">${icon('swords')} Frost Giant</h2>
        <div class="xm-boss-art" aria-hidden="true"><span class="xm-giant"></span></div>
        <p>ยักษ์น้ำแข็งขโมยแสงไฟของเมือง! ตอบคำศัพท์ให้ถูกเพื่อโจมตี (ตอบถูกติดกัน = แรงขึ้น) · มี 3 หัวใจ · ข้อละ 20 วินาที</p>
        <p class="xm-ck-meta">ชนะวันละครั้งได้ ${flake}${esc(d.boss.tokens)} + ${esc(d.boss.exp)} EXP · ${d.boss.wonToday ? 'วันนี้ชนะแล้ว (เล่นฝึกต่อได้ ไม่ได้รางวัลเพิ่ม)' : 'วันนี้ยังไม่ชนะ'} · ชนะทั้งหมด ${esc(d.boss.wins)} ครั้ง</p>
        <button class="btn btn-primary" type="button" data-xm-boss ${d.boss.canPlay ? '' : 'disabled'}>${icon('swords')} ${d.playing.boss ? 'เริ่มใหม่' : 'สู้เลย'}</button></section>`);
    }
    if (d.story) {
      parts.push(`<section class="xm-card xm-story" aria-labelledby="xm-st2-title"><h2 id="xm-st2-title">${icon('book-open')} <span lang="en">${esc(d.story.title)}</span></h2>
        <p class="xm-card-sub">${esc(d.story.titleTh)} · อ่านแล้วตอบ 3 ข้อ ถูก ${esc(d.story.pass)} ข้อขึ้นไป = ผ่าน (${flake}${esc(d.story.tokens)} + ${esc(d.story.exp)} EXP ต่อตอน)</p>
        <ol class="xm-chapters">${d.story.chapters.map((c) => `<li><button type="button" class="xm-chap${c.done ? ' is-done' : ''}" data-xm-chap="${esc(c.id)}" ${c.canRead || c.done ? '' : 'disabled'}>
          <b>ตอนที่ ${esc(c.no)} · <span lang="en">${esc(c.title)}</span></b><small>${c.done ? 'ผ่านแล้ว' : c.canRead ? esc(c.titleTh) : c.needPrev ? 'อ่านตอนก่อนหน้าให้ผ่านก่อน' : `เปิด ${esc(new Date(c.opensAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }))}`}</small></button></li>`).join('')}</ol></section>`);
    }
    if (d.photobooth) {
      parts.push(`<section class="xm-card xm-photo" aria-labelledby="xm-ph-title"><h2 id="xm-ph-title">${icon('camera')} Photo booth</h2>
        <p>ถ่ายรูปตัวละคร 3D ของคุณกับฉากคริสต์มาส แล้วบันทึกเป็นรูปภาพ (ทำในเครื่องของคุณ ไม่อัปโหลดขึ้นเซิร์ฟเวอร์)</p>
        <button class="btn btn-primary" type="button" data-xm-photo>${icon('camera')} เปิด Photo booth</button></section>`);
    }
    box.innerHTML = parts.join('');
  }

  /* ---------- หน้าต่างเกม (Advent / Boss / Story / Photo) ---------- */
  function overlay(title, inner) {
    const keep = P.game; closeGame(); P.game = keep;   // ปิดหน้าต่างเดิม แต่คงเกมที่เพิ่งเริ่ม
    const o = document.createElement('div');
    o.className = 'xm-game'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', title);
    o.innerHTML = `<div class="xm-game-card"><button type="button" class="xm-game-x" data-xm-close aria-label="ปิด">${icon('x')}</button><div class="xm-game-body">${inner}</div></div>`;
    document.body.appendChild(o);
    P.lastFocus = document.activeElement;
    const f = o.querySelector('.xm-game-body button, .xm-game-body input'); if (f) f.focus();
    return o;
  }
  function closeGame() {
    clearInterval(P.timer); P.timer = null;
    if (P.viewer) { try { P.viewer.dispose(); } catch (_) { /* - */ } P.viewer = null; }
    if (P.photo) { cancelAnimationFrame(P.photo.raf); clearTimeout(P.photo.unfreeze); P.photo = null; }
    const o = document.querySelector('.xm-game'); if (o) o.remove();
    P.game = null;
    if (P.lastFocus && document.contains(P.lastFocus)) P.lastFocus.focus();
  }
  async function refreshAll() { await Promise.all([load(true), loadPlay()]); renderHub(); renderLobbyCard(); }
  function qHtml(g) {
    const q = g.q;
    const head = g.kind === 'boss'
      ? `<div class="xm-bossbar"><span class="xm-giant sm" aria-hidden="true"></span><div class="xm-hp" role="meter" aria-label="พลังของยักษ์น้ำแข็ง" aria-valuemin="0" aria-valuemax="${g.maxHp}" aria-valuenow="${g.hp}"><i style="width:${Math.round((g.hp / g.maxHp) * 100)}%"></i><b>${g.hp}/${g.maxHp}</b></div>
         <span class="xm-hearts" aria-label="หัวใจเหลือ ${g.hearts}">${[0, 1, 2].map((k) => `<span class="xm-heart${k < g.hearts ? '' : ' is-lost'}">${icon('heart')}</span>`).join('')}</span></div>
         ${q.secs ? `<div class="xm-timer" aria-hidden="true"><i style="animation-duration:${q.secsLeft}s"></i></div>` : ''}`
      : `<p class="xm-g-meta">ประตูวันที่ ${g.ref} ธ.ค. · ข้อ ${q.no}/${g.total} · ต้องถูก ${g.pass} ข้อ · ถูกแล้ว ${g.correct}</p>`;
    return `${head}<p class="xm-g-ask">${q.mode === 'en2th' ? 'คำนี้แปลว่าอะไร' : 'คำภาษาอังกฤษของคำนี้คือ'}</p>
      <p class="xm-g-prompt" ${q.mode === 'en2th' ? 'lang="en"' : ''}>${esc(q.prompt)}</p>
      <div class="xm-g-opts">${q.options.map((o, i) => `<button type="button" class="xm-g-opt" data-xm-ans="${i}" ${q.mode === 'th2en' ? 'lang="en"' : ''}>${esc(o)}</button>`).join('')}</div>
      <p class="xm-g-fb" role="status" aria-live="polite"></p>`;
  }
  function showQ() {
    const body = document.querySelector('.xm-game-body'); if (!body || !P.game) return;
    body.innerHTML = qHtml(P.game);
    clearInterval(P.timer);
    if (P.game.kind === 'boss' && P.game.q.secs) {
      const key = P.game.q.key; const until = Date.now() + P.game.q.secsLeft * 1000;
      P.timer = setInterval(() => { if (Date.now() > until && P.game && P.game.q.key === key && !P.game.busy) { clearInterval(P.timer); answer(-1); } }, 500);
    }
    const f = body.querySelector('.xm-g-opt'); if (f) f.focus();
  }
  async function startGame(kind, ref) {
    try {
      const r = kind === 'boss' ? await App().api('/christmas/boss/start', { method: 'POST' }) : await App().api(`/christmas/advent/${ref}/start`, { method: 'POST' });
      P.game = kind === 'boss' ? { kind, q: r.q, hp: r.hp, maxHp: r.maxHp, hearts: r.hearts } : { kind, ref, q: r.q, total: r.total, pass: r.pass, correct: 0 };
      overlay(kind === 'boss' ? 'สู้กับยักษ์น้ำแข็ง' : `ประตู Advent วันที่ ${ref}`, '');
      showQ();
    } catch (e) { App().toast(e.message || 'เริ่มไม่ได้', 'error'); }
  }
  async function answer(choice) {
    const g = P.game; if (!g || g.busy) return;
    g.busy = true; clearInterval(P.timer);
    let r;
    try { r = await App().api(`/christmas/${g.kind}/answer`, { method: 'POST', body: { key: g.q.key, choice } }); }
    catch (e) { g.busy = false; App().toast(e.message || 'ส่งคำตอบไม่สำเร็จ', 'error'); return; }
    const body = document.querySelector('.xm-game-body'); if (!body) return;
    body.querySelectorAll('.xm-g-opt').forEach((b, i) => { b.disabled = true; if (i === r.correctIndex) b.classList.add('is-right'); else if (i === choice) b.classList.add('is-wrong'); });
    const fb = body.querySelector('.xm-g-fb');
    fb.innerHTML = r.correct ? `${icon('check')} ถูกต้อง!${r.dmg ? ` โจมตี ${r.dmg}` : ''}` : `${r.timeout ? 'หมดเวลา' : r.tooFast ? 'ตอบเร็วเกินไป (ไม่นับ)' : 'ยังไม่ถูก'} — <span lang="en">${esc(r.reveal.word)}</span> = ${esc(r.reveal.th)}`;
    fb.className = `xm-g-fb ${r.correct ? 'ok' : 'no'}`;
    if (g.kind === 'boss') { g.hp = r.hp; g.hearts = r.hearts; } else g.correct = r.correctCount;
    await new Promise((res) => setTimeout(res, r.correct ? 900 : 1700));
    if (!P.game) return;
    if (r.status === 'playing') { g.q = r.next; g.busy = false; showQ(); return; }
    const won = r.status === 'won';
    const rw = r.reward && !r.reward.already ? `<p class="xm-g-reward">${flake} +${esc(r.reward.tokens)} Snowflake Token · +${esc(r.reward.exp)} EXP</p>` : (r.reward && r.reward.already ? '<p class="xm-g-meta">ได้รางวัลของวันนี้ไปแล้ว — รอบนี้เป็นการฝึก</p>' : '');
    if (r.reward && r.reward.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.reward.levelInfo, r.reward.leveledUp);
    body.innerHTML = `<div class="xm-g-end ${won ? 'is-win' : 'is-lose'}"><p class="xm-g-big">${won ? (g.kind === 'boss' ? 'ชนะยักษ์น้ำแข็งแล้ว!' : `เปิดประตูวันที่ ${esc(g.ref)} แล้ว!`) : (g.kind === 'boss' ? 'ยักษ์ยังไม่ล้ม' : 'ยังไม่ผ่าน')}</p>
      <p>ตอบถูก ${esc(r.correctCount)}/${esc(r.answered)} ข้อ</p>${rw}
      <div class="xm-g-actions">${won ? '' : `<button class="btn btn-primary" type="button" data-xm-retry="${g.kind}" data-ref="${esc(g.ref || '')}">${icon('rotate-cw')} ลองใหม่</button>`}
      <button class="btn btn-secondary" type="button" data-xm-close>ปิด</button></div></div>`;
    P.game = null;
    refreshAll();
  }

  /* ---------- Story ---------- */
  async function openChapter(id) {
    let c;
    try { c = await App().api(`/christmas/story/${encodeURIComponent(id)}`); } catch (e) { App().toast(e.message || 'เปิดไม่ได้', 'error'); return; }
    overlay(`ตอนที่ ${c.no}`, `<article class="xm-read"><p class="xm-g-meta">ตอนที่ ${esc(c.no)} · ${esc(c.titleTh)}</p><h3 lang="en">${esc(c.title)}</h3>
      <div class="xm-read-text" lang="en">${esc(c.text).split(/(?<=[.!?]["”]?)\s+/).map((x) => `<span>${x}</span>`).join(' ')}</div>
      <button type="button" class="btn btn-secondary btn-sm" data-xm-say>${icon('volume-2')} ฟังเสียงอ่าน</button>
      <form class="xm-read-q" data-xm-chapq="${esc(c.id)}">${c.questions.map((q) => `<fieldset><legend lang="en">${esc(q.no)}. ${esc(q.q)}</legend>
        ${q.options.map((o, i) => `<label class="xm-read-opt"><input type="radio" name="q${q.no}" value="${i}" required> <span lang="en">${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
        <button class="btn btn-primary" type="submit">${icon('check')} ส่งคำตอบ</button><div class="xm-read-res" role="status" aria-live="polite"></div></form></article>`);
    P.story = c;
  }
  async function submitChapter(form) {
    const c = P.story; if (!c) return;
    const answers = c.questions.map((q) => Number((form.querySelector(`input[name="q${q.no}"]:checked`) || {}).value));
    if (answers.some((a) => Number.isNaN(a))) { App().toast('ตอบให้ครบทุกข้อก่อนนะ', 'info'); return; }
    form.querySelector('button[type=submit]').disabled = true;
    let r;
    try { r = await App().api(`/christmas/story/${encodeURIComponent(c.id)}/submit`, { method: 'POST', body: { answers } }); }
    catch (e) { App().toast(e.message || 'ส่งไม่สำเร็จ', 'error'); form.querySelector('button[type=submit]').disabled = false; return; }
    r.results.forEach((x) => {
      const fs = form.querySelectorAll('fieldset')[x.no - 1];
      fs.classList.add(x.correct ? 'is-right' : 'is-wrong');
      fs.querySelectorAll('label')[x.answer].classList.add('is-answer');
      fs.insertAdjacentHTML('beforeend', `<p class="xm-why" lang="en">${esc(x.why)}</p>`);
    });
    const res = form.querySelector('.xm-read-res');
    res.innerHTML = `<p class="xm-g-big">${r.passed ? 'ผ่านแล้ว!' : 'ยังไม่ผ่าน — อ่านอีกรอบแล้วลองใหม่ได้'} (${esc(r.score)}/${esc(r.total)})</p>
      ${r.reward && !r.reward.already ? `<p class="xm-g-reward">${flake} +${esc(r.reward.tokens)} Token · +${esc(r.reward.exp)} EXP</p>` : ''}
      ${r.passed ? '' : `<button class="btn btn-secondary" type="button" data-xm-chap="${esc(c.id)}">${icon('rotate-cw')} อ่านอีกครั้ง</button>`}`;
    if (r.reward && r.reward.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.reward.levelInfo, r.reward.leveledUp);
    refreshAll();
  }

  /* ---------- Photo booth / Christmas Profile Card (v1.25.3 · ทำในเครื่อง · ไม่อัปโหลด) ----------
     ตัวประกอบภาพอยู่ใน xmas-booth.js (ชั้นภาพแยก: ฉากหมู่บ้าน, ต้นสน 3D, ไฟ, เงา, แสงสะท้อน, ตัวละคร, ของขวัญ, หิมะ, กรอบ)
     ที่นี่: UI · ตัวแสดงผล 3D (ค้างไว้ระหว่างเปิด เพื่อเปลี่ยนชุดแล้วถ่ายใหม่) · ภาพเคลื่อนไหวตัวอย่าง · บันทึก/แชร์ */
  const BOOTH_SLOTS = [['outerwear', 'เสื้อคลุม'], ['top', 'เสื้อ'], ['bottom', 'กางเกง/กระโปรง'], ['hat', 'หมวก'], ['accessory', 'เครื่องประดับ'], ['shoes', 'รองเท้า'], ['back', 'ด้านหลัง'], ['glasses', 'แว่น']];
  const BOOTH_OPTIONAL = new Set(['outerwear', 'hat', 'accessory', 'back', 'glasses']);
  const BOOTH_LAYERS = [['trees', 'ต้นคริสต์มาส'], ['lights', 'ไฟประดับและดาว'], ['gifts', 'กล่องของขวัญ'], ['snow', 'หิมะตก'], ['shadows', 'เงาและแสงสะท้อน'], ['glow', 'แสงบรรยากาศ'], ['village', 'ฉากหมู่บ้าน'], ['avatar', 'ตัวละคร'], ['frame', 'กรอบและข้อความ']];
  const BOOTH_FMT = [['post', 'โพสต์ 4:5', '1080×1350'], ['story', 'สตอรี่ 9:16', '1080×1920']];
  function boothFont() {
    // ฟอนต์หัวเรื่อง (Playfair Display · OFL) โหลดเมื่อเปิด Photo booth เท่านั้น · โหลดไม่ได้ → ใช้ serif ของเครื่อง (ภาพตัวอย่างและภาพที่บันทึกยังตรงกัน)
    if (!document.getElementById('xm-booth-font')) {
      const l = document.createElement('link'); l.id = 'xm-booth-font'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap'; document.head.appendChild(l);
    }
    const f = document.fonts && document.fonts.load ? document.fonts.load('italic 700 80px "Playfair Display"').catch(() => null) : Promise.resolve();
    return Promise.race([f, new Promise((r) => setTimeout(r, 2500))]);
  }
  function boothSlotHtml() {
    const B = P.photo;
    return BOOTH_SLOTS.filter(([sl]) => B.owned[sl] && B.owned[sl].length).map(([sl, n]) => `<button type="button" class="xm-bo-tab${B.slot === sl ? ' active' : ''}" role="tab" aria-selected="${B.slot === sl}" data-xm-bo-slot="${sl}">${n}</button>`).join('');
  }
  function boothItemsHtml() {
    const B = P.photo; const sl = B.slot; const list = B.owned[sl] || []; const cur = B.outfit[sl] || null;
    const none = BOOTH_OPTIONAL.has(sl) ? `<button type="button" class="xm-bo-item${!cur ? ' active' : ''}" role="radio" aria-checked="${!cur}" data-xm-bo-item="" data-slot="${sl}"><span class="xm-bo-none">${icon('x')}</span><span>ไม่สวม</span></button>` : '';
    return none + list.map((it) => `<button type="button" class="xm-bo-item${cur === it.id ? ' active' : ''}${it.collection === 'christmas26' ? ' is-xm' : ''}" role="radio" aria-checked="${cur === it.id}" data-xm-bo-item="${esc(it.id)}" data-slot="${sl}">
      <img src="${esc(it.thumbnailUrl || '')}" alt="" loading="lazy" width="56" height="56"><span>${esc(it.nameTh || it.name)}</span></button>`).join('');
  }
  function renderBoothPicker() {
    const o = document.querySelector('.xm-booth'); if (!o || !P.photo) return;
    const tabs = o.querySelector('.xm-bo-slots'); const items = o.querySelector('.xm-bo-items');
    if (tabs) tabs.innerHTML = boothSlotHtml();
    if (items) items.innerHTML = boothItemsHtml();
  }
  async function openPhoto() {
    const o = overlay('Photo booth', `<h3>${icon('camera')} Christmas Photo Booth</h3>
      <div class="xm-booth">
        <div class="xm-photo-stage" data-fmt="post"><canvas id="xm-photo-canvas" width="1080" height="1350" role="img" aria-label="ภาพตัวอย่างการ์ดคริสต์มาส (ภาพที่บันทึกตรงกับภาพนี้)"></canvas><p class="xm-photo-wait" role="status">กำลังเตรียมฉากและตัวละคร 3D…</p></div>
        <div class="xm-booth-side">
          <div class="vd-seg xm-photo-fmt" role="radiogroup" aria-label="ขนาดภาพ">${BOOTH_FMT.map(([k, n, d], i) => `<button type="button" class="vd-seg-btn${i === 0 ? ' active' : ''}" role="radio" aria-checked="${i === 0}" data-xm-fmt="${k}">${n} <small>${d}</small></button>`).join('')}</div>
          <section class="xm-booth-outfit" aria-labelledby="xm-bo-h"><h4 id="xm-bo-h">${icon('shirt')} ชุดในรูป <small>(เฉพาะไอเทมที่คุณมี)</small></h4>
            <div class="xm-bo-quick"><button type="button" class="btn btn-secondary" data-xm-bo-preset="current" disabled>ชุดปัจจุบัน</button><button type="button" class="btn btn-secondary" data-xm-bo-preset="xmas" disabled>${icon('snowflake')} ใส่ชุดคริสต์มาสที่มี</button></div>
            <div class="xm-bo-slots" role="tablist" aria-label="ส่วนของชุด"></div>
            <div class="xm-bo-items" role="radiogroup" aria-label="ไอเทม"></div>
            <p class="xm-bo-note">ใช้เฉพาะในรูปนี้ — ไม่เปลี่ยนชุดที่บันทึกในบัญชี</p></section>
          <details class="xm-booth-layers"><summary>${icon('layers')} ปรับองค์ประกอบในภาพ</summary><div>
            ${BOOTH_LAYERS.map(([k, n]) => `<label><input type="checkbox" data-xm-layer="${k}" checked> ${n}</label>`).join('')}</div></details>
          <label class="xm-photo-name"><input type="checkbox" id="xm-photo-name"> ใส่ชื่อผู้ใช้ของฉันในรูป (ค่าเริ่มต้นไม่ใส่ เพื่อความเป็นส่วนตัว)</label>
          <div class="xm-g-actions"><button class="btn btn-primary" type="button" data-xm-photo-save disabled>${icon('download')} บันทึกรูป</button>
            ${navigator.share ? `<button class="btn btn-secondary" type="button" data-xm-photo-share disabled>${icon('share-2')} แชร์</button>` : ''}</div>
        </div>
      </div>`);
    o.classList.add('xm-game--booth');
    const user = App().user;
    P.photo = { fmt: 'post', rev: 1, avatar: null, avatarBox: null, shot: null, outfit: {}, base: {}, owned: {}, slot: null, busy: false, t0: performance.now(), frozen: null,
      layers: Object.fromEntries(['village', 'stars', 'glow', 'shadows', 'reflect', 'trees', 'lights', 'avatar', 'gifts', 'snow', 'frame'].map((k) => [k, true])),
      showName: false, username: user ? user.username : '' };
    const B = P.photo; const wait = o.querySelector('.xm-photo-wait');
    let sceneOk = false;
    const tasks = [];
    tasks.push((async () => { try { await Promise.all([window.EQXmasBooth.load(), boothFont()]); sceneOk = true; } catch (_) { sceneOk = false; } })());
    tasks.push((async () => {
      try {
        if (!window.EQAvatar3D) throw new Error('no3d');
        const [me, cat] = await Promise.all([App().api('/avatar/me'), App().api('/avatar/catalog')]);
        const byId = Object.fromEntries((cat.items || []).map((x) => [x.id, x]));
        const own = new Set((me.inventory || []).map((x) => x.itemId));
        BOOTH_SLOTS.forEach(([sl]) => {
          B.owned[sl] = (cat.items || []).filter((x) => x.slot === sl && own.has(x.id) && x.model)
            .sort((a, b) => (b.collection === 'christmas26') - (a.collection === 'christmas26') || String(a.nameTh || a.name).localeCompare(String(b.nameTh || b.name), 'th'));
        });
        B.base = { ...(me.outfit || {}), background: null }; B.outfit = { ...B.base }; B.colors = me.colors || {};
        B.slot = (BOOTH_SLOTS.find(([sl]) => (B.owned[sl] || []).some((x) => x.collection === 'christmas26')) || BOOTH_SLOTS.find(([sl]) => (B.owned[sl] || []).length) || [null])[0];
        const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-9999px;top:0;width:512px;height:512px';
        document.body.appendChild(host);
        const v = window.EQAvatar3D.mount(host, { api: App().api, byId, outfit: B.outfit, colors: B.colors, controls: false });
        P.viewer = { v, dispose: () => { try { v.dispose(); } catch (_) { /* - */ } host.remove(); } };
        const t0 = Date.now(); while (!v.isReady() && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
        if (!v.isReady()) throw new Error('timeout');
        await boothShoot();
      } catch (_) { B.avatar = null; }
    })());
    await Promise.all(tasks);
    if (!document.contains(o)) return;
    if (!sceneOk) { wait.textContent = 'โหลดฉากคริสต์มาสไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วเปิดใหม่อีกครั้ง'; return; }
    wait.textContent = B.avatar ? '' : 'แสดงตัวละคร 3D ไม่ได้ในเครื่องนี้ — ยังบันทึกฉากคริสต์มาสได้';
    o.querySelectorAll('[data-xm-photo-save], [data-xm-photo-share]').forEach((b) => { b.disabled = false; });
    o.querySelectorAll('[data-xm-bo-preset]').forEach((b) => { b.disabled = !B.avatar; });
    const xmOwned = Object.values(B.owned).flat().some((x) => x.collection === 'christmas26');
    const xb = o.querySelector('[data-xm-bo-preset="xmas"]'); if (xb && !xmOwned) { xb.disabled = true; xb.title = 'ยังไม่มีไอเทมคริสต์มาส — แลกได้ที่ร้าน Snowflake'; }
    if (!B.avatar) o.querySelector('.xm-booth-outfit').hidden = true;
    renderBoothPicker();
    boothLoop();
  }
  /** ถ่ายตัวละครจากตัวแสดงผล 3D ที่ค้างไว้ (PNG 1200 px · ไม่มีเงาวงกลมใต้เท้า — ตัวประกอบภาพวาดเงาสัมผัสพื้นเอง) */
  async function boothShoot() {
    const B = P.photo; const v = P.viewer && P.viewer.v; if (!v) return;
    await new Promise((r) => setTimeout(r, 500));
    const url = v.snapshot(1200, 'full', 0.28, { format: 'png', ground: false });
    if (!url) throw new Error('snap');
    const img = new Image(); img.src = url; await img.decode();
    B.avatar = img; B.shot = img; B.avatarBox = window.EQXmasBooth.alphaBox(img); B.rev += 1;
  }
  async function boothWear(next) {
    const B = P.photo; if (!B || !P.viewer || B.busy) return;
    B.busy = true; const st = document.querySelector('.xm-photo-stage'); if (st) st.classList.add('is-busy');
    const wait = document.querySelector('.xm-photo-wait'); if (wait) wait.textContent = 'กำลังเปลี่ยนชุด…';
    try {
      B.outfit = next;
      await P.viewer.v.setOutfit(next, B.colors);
      await boothShoot();
      if (wait) wait.textContent = '';
    } catch (_) { if (wait) wait.textContent = 'เปลี่ยนชุดไม่สำเร็จ ลองอีกครั้ง'; }
    B.busy = false; if (st) st.classList.remove('is-busy');
    renderBoothPicker();
  }
  function boothLoop() {
    const B = P.photo; const c = document.getElementById('xm-photo-canvas'); if (!c || !B) return;
    const g = c.getContext('2d');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = 0;
    const frame = (now) => {
      if (!document.contains(c) || P.photo !== B) return;
      if (!document.hidden && now - last >= 33) {
        last = now;
        const t = B.frozen != null ? B.frozen : reduce ? 4 : (now - B.t0) / 1000;
        window.EQXmasBooth.render(g, B.fmt, B, t);
        B.lastT = t;
      }
      B.raf = requestAnimationFrame(frame);
    };
    B.raf = requestAnimationFrame(frame);
  }
  function drawPhoto() { const B = P.photo; const c = document.getElementById('xm-photo-canvas'); if (!B || !c || !window.EQXmasBooth._assets()) return; B.rev += 1; window.EQXmasBooth.render(c.getContext('2d'), B.fmt, B, B.lastT || 0); }
  /** ภาพที่บันทึก = เฟรมเดียวกับที่แสดงอยู่ (หยุดภาพไว้ที่เวลานั้น · วาดใหม่ที่ความละเอียดเต็มด้วยฟังก์ชันเดียวกัน) */
  function photoFreeze() {
    const B = P.photo; const c = document.getElementById('xm-photo-canvas');
    B.frozen = B.lastT || 0; window.EQXmasBooth.render(c.getContext('2d'), B.fmt, B, B.frozen);
    clearTimeout(B.unfreeze); B.unfreeze = setTimeout(() => { B.frozen = null; }, 2500);
  }
  function photoBlob() { photoFreeze(); return new Promise((r) => document.getElementById('xm-photo-canvas').toBlob(r, 'image/png')); }
  const photoName = () => `englishquest-christmas-2026-${P.photo && P.photo.fmt === 'story' ? '1080x1920' : '1080x1350'}.png`;

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-xm-door], [data-xm-boss], [data-xm-retry], [data-xm-ans], [data-xm-close], [data-xm-chap], [data-xm-say], [data-xm-photo], [data-xm-fmt], [data-xm-bo-slot], [data-xm-bo-item], [data-xm-bo-preset], [data-xm-photo-save], [data-xm-photo-share]');
    if (!t || !App()) {
      if (e.target.classList && e.target.classList.contains('xm-game')) closeGame();
      return;
    }
    if (t.hasAttribute('data-xm-close')) { closeGame(); return; }
    if (t.dataset.xmDoor) { startGame('advent', t.dataset.xmDoor); return; }
    if (t.hasAttribute('data-xm-boss')) { startGame('boss'); return; }
    if (t.dataset.xmRetry) { startGame(t.dataset.xmRetry, t.dataset.ref); return; }
    if (t.dataset.xmAns !== undefined) { answer(Number(t.dataset.xmAns)); return; }
    if (t.dataset.xmChap) { openChapter(t.dataset.xmChap); return; }
    if (t.hasAttribute('data-xm-say')) { const txt = document.querySelector('.xm-read-text'); if (txt && App().speak) App().speak(txt.textContent); return; }
    if (t.hasAttribute('data-xm-photo')) { openPhoto(); return; }
    if (t.dataset.xmFmt && P.photo) {
      P.photo.fmt = t.dataset.xmFmt; const F = window.EQXmasBooth.FORMATS[P.photo.fmt]; const c = document.getElementById('xm-photo-canvas');
      c.width = F.W; c.height = F.H; document.querySelector('.xm-photo-stage').dataset.fmt = P.photo.fmt;
      document.querySelectorAll('[data-xm-fmt]').forEach((b) => { const on = b === t; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
      const ios = document.querySelector('.xm-photo-ios'); if (ios) ios.remove();
      drawPhoto(); return;
    }
    if (t.dataset.xmBoSlot && P.photo) { P.photo.slot = t.dataset.xmBoSlot; renderBoothPicker(); return; }
    if (t.dataset.xmBoItem !== undefined && P.photo) {
      const sl = t.dataset.slot; const id = t.dataset.xmBoItem || null;
      if ((P.photo.outfit[sl] || null) === id) return;
      // ชุดเต็มตัวจาก outerwear ไม่ต้องถอดเสื้อ/กางเกงเดิม (ตัวแสดงผลจัดการซ่อนส่วนที่ถูกคลุม)
      boothWear({ ...P.photo.outfit, [sl]: id }); return;
    }
    if (t.dataset.xmBoPreset && P.photo) {
      if (t.dataset.xmBoPreset === 'current') { boothWear({ ...P.photo.base }); return; }
      const next = { ...P.photo.outfit };
      BOOTH_SLOTS.forEach(([sl]) => { const x = (P.photo.owned[sl] || []).find((it) => it.collection === 'christmas26'); if (x) next[sl] = x.id; });
      boothWear(next); return;
    }
    if (t.hasAttribute('data-xm-photo-save')) {
      const b = await photoBlob();
      // iPhone/iPad: Safari ไม่รองรับ <a download> สำหรับรูป → ใช้แผ่นแชร์ของระบบ (มี "บันทึกรูปภาพ") · ไม่มี → แสดงรูปให้กดค้างบันทึก
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (ios) {
        const f = new File([b], photoName(), { type: 'image/png' });
        try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
        const st = document.querySelector('.xm-photo-stage');
        const url = URL.createObjectURL(b);
        st.insertAdjacentHTML('afterend', `<div class="xm-photo-ios"><p>${icon('download')} กดค้างที่รูปด้านล่าง แล้วเลือก "บันทึกไปยังรูปภาพ"</p><img src="${url}" alt="รูปคริสต์มาสของฉัน" width="${document.getElementById('xm-photo-canvas').width}" height="${document.getElementById('xm-photo-canvas').height}"></div>`);
        return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = photoName();
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); App().toast('บันทึกรูปแล้ว', 'success'); return;
    }
    if (t.hasAttribute('data-xm-photo-share')) {
      const b = await photoBlob(); const f = new File([b], photoName(), { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Merry Christmas!' }); else App().toast('เครื่องนี้แชร์ไฟล์ไม่ได้ — กดบันทึกรูปแทน', 'info'); } catch (_) { /* ผู้ใช้ยกเลิก */ }
    }
  });
  document.addEventListener('change', (e) => {
    if (!P.photo) return;
    if (e.target.id === 'xm-photo-name') { P.photo.showName = e.target.checked; drawPhoto(); return; }
    const k = e.target.dataset && e.target.dataset.xmLayer;
    if (k) { P.photo.layers[k] = e.target.checked; if (k === 'shadows') P.photo.layers.reflect = e.target.checked; if (k === 'village') P.photo.layers.stars = e.target.checked; drawPhoto(); }
  });
  document.addEventListener('submit', (e) => { const f = e.target.closest('[data-xm-chapq]'); if (f) { e.preventDefault(); submitChapter(f); } });
  document.addEventListener('keydown', (e) => {
    const o = document.querySelector('.xm-game'); if (!o) return;
    if (e.key === 'Escape') { closeGame(); return; }
    if (e.key === 'Tab') {   // โฟกัสวนอยู่ในหน้าต่าง
      const f = [...o.querySelectorAll('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')]; if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  window.addEventListener('eq:screen', (e) => { if (e.detail && e.detail.id !== 'screen-christmas') closeGame(); });

  /* ---------- ผู้ดูแล: วันเวลา · สวิตช์ · ค่า Token (PUT /api/admin/christmas — เซิร์ฟเวอร์ตรวจสิทธิ์ผู้ดูแลจาก token) ---------- */
  const FLAG_TH = { christmas_theme: 'ธีมคริสต์มาสอัตโนมัติ', christmas_snow: 'หิมะตก', christmas_music: 'เพลงคริสต์มาส', christmas_quests: 'เควสต์รายวัน',
    christmas_checkin: 'เช็กอินรายวัน', christmas_rewards: 'ของขวัญต้อนรับ', christmas_shop: 'ร้าน Token', christmas_avatar_items: 'ชุด Avatar คริสต์มาส',
    christmas_advent: 'Advent Calendar', christmas_story: 'Story (ต้องอนุมัติเนื้อหาครบก่อน)', christmas_boss: 'Boss Frost Giant', christmas_photobooth: 'Photo booth' };
  const STATUS_TH = { scheduled: 'รอเริ่ม', active: 'กำลังจัด', claim_only: 'จบแล้ว (ใช้ร้านได้)', ended: 'จบแล้ว', disabled: 'ปิดอยู่' };
  const toLocal = (iso) => { const d = new Date(Date.parse(iso) + 7 * 3600000); return d.toISOString().slice(0, 16); };   // แสดงเวลาไทย
  const fromLocal = (v) => `${v}:00+07:00`;
  async function mountAdmin() {
    const box = document.getElementById('admin-xmas-body');
    if (!box || !App()) return;
    let d;
    try { d = await App().api('/admin/christmas'); } catch (e) { box.innerHTML = `<p class="form-error">${esc(e.message || 'โหลดไม่สำเร็จ')}</p>`; return; }
    const s = d.settings;
    box.innerHTML = `<p>สถานะตอนนี้: <b>${esc(STATUS_TH[d.status] || d.status)}</b> · ผู้เล่น ${esc(d.stats.players)} คน · เช็กอิน ${esc(d.stats.checkins)} · รับเควสต์ ${esc(d.stats.quest_claims)} · แลกของ ${esc(d.stats.purchases)} · Token ออก ${esc(d.stats.minted)} / ใช้ ${esc(d.stats.spent)}</p>
      <form id="admin-xmas-form" class="admin-xmas-form">
        <label class="fest-switch"><input type="checkbox" name="enabled" role="switch" ${s.enabled ? 'checked' : ''}><span class="fest-switch-ui" aria-hidden="true"></span><span class="fest-switch-text"><b>เปิดกิจกรรมคริสต์มาส</b><small>ปิด = ซ่อนทุกอย่างทันที (ของที่ผู้เล่นได้แล้วไม่หาย)</small></span></label>
        <div class="admin-xmas-dates">${[['startsAt', 'เริ่ม'], ['endsAt', 'จบ'], ['claimUntil', 'ใช้ร้านได้ถึง']].map(([k, n]) => `<label>${n} (เวลาไทย)<input type="datetime-local" name="${k}" value="${esc(toLocal(s[k]))}" required></label>`).join('')}</div>
        <fieldset><legend>สวิตช์ฟีเจอร์</legend>${d.flagKeys.map((k) => `<label class="admin-xmas-flag"><input type="checkbox" name="flag:${esc(k)}" ${s.flags[k] ? 'checked' : ''} ${d.p1Flags.includes(k) || ((d.reviewGated || []).includes(k) && !(d.story && d.story.all) && !s.flags[k]) ? 'disabled' : ''}> ${esc(FLAG_TH[k] || k)}</label>`).join('')}</fieldset>
        <div class="admin-xmas-dates">${Object.keys(s.tokens).map((k) => `<label>Token ${k === 'checkin' ? 'เช็กอิน/วัน' : 'ของขวัญต้อนรับ'}<input type="number" min="0" max="1000" step="1" name="tok:${esc(k)}" value="${esc(s.tokens[k])}"></label>`).join('')}</div>
        <button class="btn btn-primary" type="submit">บันทึก</button> <span class="admin-xmas-msg" role="status"></span>
      </form>
      ${d.story ? `<section class="admin-xmas-story"><h3>ตรวจเนื้อเรื่อง Story ก่อนเผยแพร่ (${d.story.chapters.filter((c) => c.approved).length}/${d.story.chapters.length} ตอนอนุมัติแล้ว)</h3>
        <p class="au-note">${esc(d.story.note)}</p>
        ${d.story.chapters.map((c) => `<details class="admin-xmas-ch"><summary><b>${esc(c.id)} · <span lang="en">${esc(c.title)}</span></b> — ${c.approved ? '✓ อนุมัติแล้ว' : 'รอตรวจ'}</summary>
          <p lang="en">${esc(c.text)}</p><ol lang="en">${c.questions.map((q) => `<li>${esc(q.q)}<br><small>${q.options.map((o, i) => (i === q.answer ? `<b>[${esc(o)}]</b>` : esc(o))).join(' · ')} — ${esc(q.why)}</small></li>`).join('')}</ol>
          <button class="btn ${c.approved ? 'btn-secondary' : 'btn-primary'} btn-sm" type="button" data-xm-review="${esc(c.id)}" data-approve="${c.approved ? '0' : '1'}">${c.approved ? 'ถอนการอนุมัติ' : 'อนุมัติตอนนี้ (ตรวจแล้ว)'}</button></details>`).join('')}</section>` : ''}`;
    box.querySelectorAll('[data-xm-review]').forEach((b) => b.addEventListener('click', async () => {
      try { await App().api(`/admin/christmas/story/${encodeURIComponent(b.dataset.xmReview)}/review`, { method: 'POST', body: { approve: b.dataset.approve === '1' } }); mountAdmin(); }
      catch (err) { App().toast(err.message || 'ไม่สำเร็จ', 'error'); }
    }));
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const msg = f.querySelector('.admin-xmas-msg');
      const body = { enabled: f.enabled.checked, startsAt: fromLocal(f.startsAt.value), endsAt: fromLocal(f.endsAt.value), claimUntil: fromLocal(f.claimUntil.value), flags: {}, tokens: {} };
      d.flagKeys.forEach((k) => { const el = f.elements[`flag:${k}`]; if (el && !el.disabled) body.flags[k] = el.checked; });
      Object.keys(s.tokens).forEach((k) => { body.tokens[k] = Number(f.elements[`tok:${k}`].value); });
      try { await App().api('/admin/christmas', { method: 'PUT', body }); msg.textContent = 'บันทึกแล้ว — ผู้เล่นเห็นผลภายใน ~2 นาที'; App().toast('บันทึกการตั้งค่าคริสต์มาสแล้ว', 'success'); mountAdmin(); }
      catch (err) { msg.textContent = err.message || 'บันทึกไม่สำเร็จ'; }
    });
  }

  window.EQChristmas = { mountAdmin, open, refresh: refreshAll, _state: () => ST.data, _play: () => P.data, _game: () => P.game, _photoHas3D: () => !!(P.photo && P.photo.shot), _booth: () => P.photo };
}());
