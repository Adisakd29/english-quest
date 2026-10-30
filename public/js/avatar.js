/* =====================================================================
   Avatar · Coin · Wardrobe · Shop · Achievements — window.EQAvatar  (v1.8.0)
   หน้าจอ:
     avatar        #/avatar         แต่งตัว (Editor): หมวด | ตัวละคร | ของที่มี · สวม/ถอด · บันทึก · รีเซ็ต · Outfit 3 ช่อง
     wardrobe      #/wardrobe       ตู้เสื้อผ้า: ของที่มีเท่านั้น · กรอง · เรียง
     shop          #/shop           ร้าน: ดูตัวอย่าง (ลองสวมชั่วคราว) · ซื้อด้วย Coin (ยืนยันก่อน · เซิร์ฟเวอร์ตรวจราคา/ยอด)
     coins         #/coins          ประวัติ Coin + วิธีได้ Coin
     achievements  #/achievements   Achievement + ความคืบหน้า + รางวัล
     stats         #/stats          สถิติการเรียนของฉัน
   ตัวละคร: Layer SVG บน canvas 240×320 เดียวกัน (ไม่มีการสร้างภาพใหม่ด้วย AI) · AvatarRenderer มีโหมด full / half / head / thumb
   Avatar Everywhere: G.avatar(id, image, cls, uid) -> <span class="eqav" data-eqav="uid"> · ตัวนี้แทนที่ด้วยตัวละครอัตโนมัติ (ดึงทีละชุด)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(p, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = (id) => document.getElementById(`screen-${id}-root`);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const toast = (m, t) => App().toast(m, t);

  const SLOTS = ['body', 'face', 'hair', 'top', 'bottom', 'outerwear', 'shoes', 'hat', 'glasses', 'headphones', 'back', 'accessory', 'effect', 'background'];
  const REQUIRED = new Set(['body', 'face', 'hair']);
  const CATS = [
    { slot: 'body', th: 'รูปร่าง', icon: 'user-round' }, { slot: 'hair', th: 'ทรงผม', icon: 'wand-sparkles' },
    { slot: 'face', th: 'ใบหน้า', icon: 'smile' }, { slot: 'top', th: 'เสื้อ', icon: 'shirt' }, { slot: 'bottom', th: 'กางเกง/กระโปรง', icon: 'layers' },
    { slot: 'outerwear', th: 'เสื้อคลุม', icon: 'shirt' }, { slot: 'shoes', th: 'รองเท้า', icon: 'footprints' }, { slot: 'hat', th: 'หมวก', icon: 'graduation-cap' },
    { slot: 'glasses', th: 'แว่น', icon: 'glasses' }, { slot: 'headphones', th: 'หูฟัง', icon: 'headphones' }, { slot: 'back', th: 'กระเป๋า', icon: 'backpack' },
    { slot: 'accessory', th: 'เครื่องประดับ', icon: 'medal' }, { slot: 'effect', th: 'เอฟเฟกต์', icon: 'sparkles' }, { slot: 'background', th: 'พื้นหลัง', icon: 'image' },
  ];
  const CAT_BY = Object.fromEntries(CATS.map((c) => [c.slot, c]));
  const RARITY = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const RARITY_TH = { common: 'ธรรมดา', uncommon: 'ไม่ธรรมดา', rare: 'หายาก', epic: 'มหากาพย์', legendary: 'ตำนาน' };
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const SHOP_SECTIONS = [
    ['featured', 'แนะนำ', 'star'], ['clothes', 'เสื้อผ้า', 'shirt'], ['hair', 'ทรงผม', 'wand-sparkles'], ['shoes', 'รองเท้า', 'footprints'],
    ['hats', 'หมวก', 'graduation-cap'], ['glasses', 'แว่น', 'glasses'], ['headphones', 'หูฟัง', 'headphones'], ['accessories', 'เครื่องประดับ', 'medal'],
    ['back', 'กระเป๋า', 'backpack'], ['effects', 'เอฟเฟกต์', 'sparkles'], ['backgrounds', 'พื้นหลัง', 'image'],
  ];
  const ACH_ICON = { flag: 'flag', shirt: 'shirt', star: 'star', book: 'book-open', pen: 'pencil-line', headphones: 'headphones', crown: 'crown', trophy: 'trophy' };

  // ---------------------------------------------------------------
  // แคตตาล็อก + ข้อมูลของฉัน
  // ---------------------------------------------------------------
  const S = { cat: null, byId: {}, me: null, lastTxn: null, balance: null, rules: null };
  let catP = null;
  function loadCatalog(force = false) {
    if (!force && catP) return catP;
    catP = api('/avatar/catalog').then((c) => {
      S.cat = c.items; S.byId = Object.fromEntries(c.items.map((x) => [x.id, x]));
      return S.cat;
    }).catch((e) => { catP = null; throw e; });
    return catP;
  }
  async function loadMe() {
    const [me] = await Promise.all([api('/avatar/me'), loadCatalog()]);
    S.me = me; setBalance(me.wallet.balance);
    if (S.lastTxn === null) S.lastTxn = me.wallet.lastTxnId;
    const uid = App().user && App().user.id;
    if (uid) setMyLook();
    return me;
  }
  /** หน้าตาของฉันใน cache (ตามการตั้งค่าของฉันเอง) -> อัปเดตทุกจุดที่แสดงรูปของฉัน */
  function setMyLook() {
    const uid = App().user && App().user.id;
    if (!uid || !S.me) return;
    looks.set(uid, { enabled: S.me.avatarEnabled, outfit: S.me.outfit, thumb: S.me.avatarThumbnail });
    refreshUid(uid);
  }
  const owned = () => new Set((S.me ? S.me.inventory : []).map((x) => x.itemId));
  const itemName = (it) => (it ? it.name : '');

  // ---------------------------------------------------------------
  // AvatarRenderer — Layer ตาม z ของแต่ละชิ้น (ระบบพิกัดเดียวกันทุกไฟล์ · ไม่จัดตำแหน่งด้วย CSS รายหน้า)
  // ---------------------------------------------------------------
  const VB = { full: '0 0 240 320', half: '20 4 200 200', head: '48 22 144 144', thumb: '48 22 144 144' };
  function partsOf(outfit) {
    const out = [];
    SLOTS.forEach((slot) => {
      const it = outfit && S.byId[outfit[slot]];
      if (it) it.parts.forEach((p) => out.push({ ...p, slot }));
    });
    return out.sort((a, b) => a.z - b.z);
  }
  /**
   * @param {object} outfit slot -> itemId
   * @param {'full'|'half'|'head'|'thumb'} mode
   * @param {{cls?:string,label?:string,noBg?:boolean,idle?:boolean}} o
   */
  function render(outfit, mode = 'full', o = {}) {
    const parts = partsOf(outfit).filter((p) => !(o.noBg && p.slot === 'background'));
    const img = (p) => `<image href="${esc(p.url)}" width="240" height="320" preserveAspectRatio="none" decoding="async"/>`;
    const a11y = o.label ? `role="img" aria-label="${esc(o.label)}"` : 'aria-hidden="true" focusable="false"';
    let inner;
    if (mode === 'full' && o.idle) {
      const bg = parts.filter((p) => p.slot === 'background');
      const fx = parts.filter((p) => p.slot === 'effect');
      const ch = parts.filter((p) => p.slot !== 'background' && p.slot !== 'effect');
      inner = `${bg.map(img).join('')}<g class="eqav-fx">${fx.filter((p) => p.kind === 'back').map(img).join('')}</g>`
        + `<g class="eqav-char">${ch.map(img).join('')}</g><g class="eqav-fx">${fx.filter((p) => p.kind !== 'back').map(img).join('')}</g>`;
    } else inner = parts.map(img).join('');
    return `<svg class="eqav-svg eqav-${mode} ${esc(o.cls || '')}" viewBox="${VB[mode] || VB.full}" ${a11y}>${inner}</svg>`;
  }

  // ---------------------------------------------------------------
  // Avatar Everywhere — แทนที่ <span class="eqav" data-eqav="uid"> ด้วยตัวละคร (หัว/ไหล่) · ดึงหน้าตาเป็นชุด · cache
  // ---------------------------------------------------------------
  // กติกาสำคัญ: แสดง Avatar แทนรูปโปรไฟล์ "เฉพาะเมื่อเจ้าของบัญชีเลือกใช้ Avatar เอง" (enabled) — ไม่งั้นรูปเดิมไม่ถูกแตะเลย
  const looks = new Map();      // uid -> { enabled, outfit, thumb }
  const legacyNodes = new WeakMap();   // element -> รูปโปรไฟล์เดิม (DOM node จริง) — สลับกลับได้ทันทีโดยไม่โหลดใหม่
  const waiting = new Set();
  let fetchTimer = null;
  function botOutfit(seed) {
    let h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const pool = (slot) => S.cat.filter((x) => x.slot === slot && !x.achievementId && x.active !== false);
    const pick = (slot, chance = 1) => { const p = pool(slot); return p.length && rnd() < chance ? p[Math.floor(rnd() * p.length)].id : null; };
    const o = { body: pick('body'), face: pick('face'), hair: pick('hair'), top: pick('top'), bottom: pick('bottom'), shoes: pick('shoes'),
      background: pick('background'), glasses: pick('glasses', 0.25), accessory: pick('accessory', 0.2) };
    if (rnd() < 0.35) o.hat = pick('hat'); else if (rnd() < 0.25) o.headphones = pick('headphones');
    return o;
  }
  function restoreLegacy(el) {
    if (!el.classList.contains('is-char')) return;
    el.classList.remove('is-char');
    const nodes = legacyNodes.get(el);
    if (nodes) el.replaceChildren(...nodes);
  }
  function apply(el, look) {
    el.dataset.eqavDone = '1';
    if (!look || !look.enabled || !S.cat) { restoreLegacy(el); return; }
    const cls = el.dataset.eqavCls || '';
    if (!el.classList.contains('is-char')) legacyNodes.set(el, [...el.childNodes]);
    // avatarThumbnail (portrait จาก 3D) ถ้ามีและตรงกับชุดปัจจุบัน · ไม่งั้นวาด 2D หัว/ไหล่ (ไม่ใช้ WebGL ใน list)
    el.innerHTML = look.thumb
      ? `<img class="avatar-img eqav-thumb-img ${esc(cls)}" src="${esc(look.thumb)}" alt="" loading="lazy" decoding="async" width="128" height="128">`
      : render(look.outfit, el.dataset.eqavMode || 'head', { cls: `avatar-svg ${cls}` });
    el.classList.add('is-char');
  }
  /** ลิงก์ไปโปรไฟล์: กดที่รูปหรือชื่อ (เพื่อน · Leaderboard · Ranked · แชท) — คีย์บอร์ดใช้ชื่อเป็นลิงก์ */
  const ROW_SEL = '.friend-row, .leaderboard-row, .rk-lb-row, .rk-vs-side, .rk-intro-side, .rk-team-m, .rkm-flist li, .chat-peer, .rk-rw-row, li[data-uid]';
  const NAME_SEL = '.friend-name, .leaderboard-username, .rk-lb-main b, b, .chat-peer-name';
  function linkify(el, uid) {
    if (el.dataset.eqavLinked || el.closest('#hud, .up-head, #profile-avatar-lg, .dp-opt, .rk-intro, #rk-match, #screen-ranked-match')) return;   // ระหว่างแข่งไม่ทำเป็นลิงก์
    el.dataset.eqavLinked = '1';
    el.dataset.profileUid = String(uid);
    const row = el.closest(ROW_SEL);
    const name = row && row.querySelector(NAME_SEL);
    if (name && !name.dataset.profileUid && !name.closest('button')) {
      name.dataset.profileUid = String(uid);
      name.classList.add('profile-link');
      name.setAttribute('role', 'link'); name.tabIndex = 0;
      name.setAttribute('aria-label', `ดูโปรไฟล์ ${name.textContent.trim()}`);
    }
  }
  function hydrate(scope = document) {
    if (!S.cat) return;
    scope.querySelectorAll('.eqav:not([data-eqav-done])').forEach((el) => {
      if (el.dataset.eqavBot) { apply(el, { enabled: true, outfit: botOutfit(el.dataset.eqavBot) }); return; }   // บอท (ไม่ใช่บัญชีผู้ใช้)
      const uid = Number(el.dataset.eqav);
      if (!(uid > 0)) { el.dataset.eqavDone = '1'; return; }
      linkify(el, uid);
      if (looks.has(uid)) apply(el, looks.get(uid)); else waiting.add(uid);
    });
    if (waiting.size && !fetchTimer) fetchTimer = setTimeout(fetchLooks, 30);
  }
  async function fetchLooks() {
    fetchTimer = null;
    const ids = [...waiting].slice(0, 100);
    ids.forEach((id) => waiting.delete(id));
    if (!ids.length) return;
    try {
      const r = await api(`/avatar/looks?ids=${ids.join(',')}`);
      ids.forEach((id) => looks.set(id, r.looks[id] || { enabled: false, outfit: {} }));
      ids.forEach(refreshUid);
    } catch (_) { /* เครือข่ายหลุด: คงอวตารเดิม */ }
    if (waiting.size) fetchTimer = setTimeout(fetchLooks, 30);
  }
  function refreshUid(uid) {
    document.querySelectorAll(`.eqav[data-eqav="${Number(uid)}"]`).forEach((el) => {
      apply(el, looks.get(Number(uid)));
    });
  }
  let obsQueued = false;
  const observer = new MutationObserver(() => {
    if (obsQueued) return;
    obsQueued = true;
    queueMicrotask(() => { obsQueued = false; hydrate(); });
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-profile-uid]');
    if (!el || e.target.closest('button:not([data-profile-uid]), a[href]')) return;
    e.preventDefault(); e.stopPropagation();
    // ปิด overlay ของ Ranked (ถ้ามี) ก่อนไปหน้าโปรไฟล์
    openPlayer(Number(el.dataset.profileUid));
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-profile-uid]')) { e.preventDefault(); openPlayer(Number(e.target.dataset.profileUid)); }
  });

  // ---------------------------------------------------------------
  // Coin: ชิปยอดคงเหลือ (หัวจอ) + แจ้ง "+10 Coins" หลังได้รางวัล
  // ---------------------------------------------------------------
  function setBalance(n) {
    if (n === null || n === undefined) return;
    S.balance = n;
    document.querySelectorAll('[data-coin-balance]').forEach((el) => { el.textContent = fmt(n); });
    const chip = document.getElementById('hud-coins');
    if (chip) { chip.classList.remove('hidden'); chip.setAttribute('aria-label', `Coin ${fmt(n)} — เปิดร้านค้า`); }
  }
  const coinChip = (n = S.balance, extra = '') => `<span class="coin-chip ${extra}">${coinIcon()}<b data-coin-balance>${fmt(n)}</b><span class="sr-only"> Coins</span></span>`;
  function coinIcon(cls = '') { return `<svg class="coin-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#FFC93C" stroke="#C98A0B" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#E7A912" stroke-width="1.6"/><path d="M12 8.6v6.8M9.8 10.4h4.4" stroke="#B57A06" stroke-width="1.6" stroke-linecap="round"/></svg>`; }
  let checkTimer = null; let checking = false;
  function checkCoins(delay = 700) {
    if (!App() || !App().user) return;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(async () => {
      if (checking) return;
      checking = true;
      try {
        if (S.lastTxn === null) { const w = await api('/coins/wallet'); S.lastTxn = w.lastTxnId; setBalance(w.balance); return; }
        const r = await api(`/coins/since?after=${S.lastTxn}`);
        S.lastTxn = Math.max(S.lastTxn, r.lastTxnId || 0);
        setBalance(r.balance);
        const gained = r.items.filter((x) => x.amount > 0);
        if (gained.length) coinPop(gained.reduce((a, x) => a + x.amount, 0), gained.map((x) => x.description).slice(0, 2).join(' · '));
        if (r.items.some((x) => x.type === 'ACHIEVEMENT')) achievementPop(r.items.filter((x) => x.type === 'ACHIEVEMENT'));
        if (gained.length && S.me) { S.me = null; }
      } catch (_) { /* ไม่สำคัญ */ } finally { checking = false; }
    }, delay);
  }
  function coinPop(amount, why) {
    const el = document.createElement('div');
    el.className = 'coin-pop';
    el.setAttribute('role', 'status');
    el.innerHTML = `${coinIcon('coin-pop-ico')}<b>+${fmt(amount)} Coins</b>${why ? `<small>${esc(why)}</small>` : ''}`;
    document.body.appendChild(el);
    const chip = document.getElementById('hud-coins');
    if (chip && !reduced()) { chip.classList.remove('is-bump'); void chip.offsetWidth; chip.classList.add('is-bump'); }
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }
  function achievementPop(items) {
    items.forEach((x, i) => setTimeout(() => toast(`${x.description} — ปลดล็อกแล้ว!`, 'success'), 900 + i * 1200));
  }

  // ---------------------------------------------------------------
  // ตัวช่วย UI
  // ---------------------------------------------------------------
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p>
      <button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const focusTitle = (el) => requestAnimationFrame(() => { const h = el.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  const topBar = (title, sub, { back = 'profile', backLabel = 'โปรไฟล์', right = '' } = {}) => `
    <div class="av-top"><button class="game-exit gl-back" type="button" data-av-nav="${back}">${ICON('arrow-left', 'icon icon-sm')} ${esc(backLabel)}</button>${right}</div>
    <h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}`;
  const rarityTag = (r) => `<span class="av-rarity r-${esc(r)}">${RARITY[r] || r}</span>`;
  // ภาพย่อของชิ้น: มีโมเดล 3D -> ภาพที่ render จากโมเดลจริง (ตรงกับที่เห็นบนตัวละคร 3D) · ไม่มี -> ภาพ 2D
  const thumb = (it) => `<img class="av-thumb-img" src="${esc(it.model && it.model.glbUrl && it.model.thumbnailUrl ? it.model.thumbnailUrl : it.thumbnailUrl)}" alt="" loading="lazy" decoding="async" width="96" height="96">`;
  function tagOf(it) {
    if (it.achievementId) return `<span class="av-tag av-tag-ach">${ICON('award', 'icon icon-xs')} Achievement Reward</span>`;
    if (it.eventId) return `<span class="av-tag av-tag-event">${ICON('calendar', 'icon icon-xs')} ธีมกิจกรรม</span>`;
    if (it.starter) return '<span class="av-tag">ฟรี</span>';
    return '';
  }
  function bindNav(el) {
    el.querySelectorAll('[data-av-nav]').forEach((b) => b.addEventListener('click', () => App().navigateTo(b.dataset.avNav)));
  }
  function setHash(path) { const t = `#/${path}`; if (location.hash !== t) history.replaceState(null, '', t); }

  /** ชิ้นในชุดที่ขัดกับ it: [{slot,id,reason}] — กติกาเดียวกับเซิร์ฟเวอร์ (services/avatar conflictsWith) */
  function conflictsOf(outfit, it) {
    const out = [];
    if (!it) return out;
    if (it.slot === 'hat' && outfit.headphones) out.push({ slot: 'headphones', id: outfit.headphones, reason: 'ใส่หมวกพร้อมหูฟังไม่ได้' });
    if (it.slot === 'headphones' && outfit.hat) out.push({ slot: 'hat', id: outfit.hat, reason: 'ใส่หมวกพร้อมหูฟังไม่ได้' });
    ((it.model && it.model.compat) || []).forEach((r) => {
      const o = S.byId[r.with];
      if (o && o.slot !== it.slot && outfit[o.slot] === r.with) out.push({ slot: o.slot, id: r.with, reason: r.reason });
    });
    return out;
  }
  /** ปรับชุดให้ถูกกติกา: สวมของใหม่ -> ถอดสิ่งที่ขัดกัน (ทรงผมเปลี่ยนเป็นทรงพื้นฐาน) · คืนข้อความแจ้งพร้อมเหตุผล */
  function equipInto(outfit, it) {
    const o = { ...outfit };
    const notes = [];
    o[it.slot] = it.id;
    conflictsOf(o, it).forEach((c) => {
      if (c.slot === 'hair') { o.hair = 'hair_crop'; notes.push(`เปลี่ยนทรงผมเป็นทรงสั้นให้ (${c.reason})`); }
      else { o[c.slot] = null; notes.push(`ถอด${itemName(S.byId[c.id])}ออกให้ (${c.reason})`); }
    });
    return { outfit: o, note: notes.join(' · ') };
  }
  const sameOutfit = (a, b) => SLOTS.every((s) => (a[s] || null) === (b[s] || null));

  // =====================================================================
  // Stage: 3D viewer (ถ้าเครื่องรองรับ) หรือ 2D — ใช้ร่วมกัน Editor / Shop Preview / Profile showcase
  // =====================================================================
  const stages = new Set();
  const viewPref = { get: () => { try { return localStorage.getItem('eq_av_view'); } catch (_) { return null; } },
    set: (v) => { try { localStorage.setItem('eq_av_view', v); } catch (_) { /* - */ } } };
  const can3D = () => Boolean(window.EQAvatar3D) && window.EQAvatar3D.tier() !== 'none';
  const want3D = () => can3D() && viewPref.get() !== '2d';
  /**
   * @param {HTMLElement} box
   * @param {object} outfit
   * @param {{label?:string, controls?:boolean, onState?:Function, force2D?:boolean, anim?:string}} o
   */
  function mountStage(box, outfit, o = {}) {
    const st = { box, outfit: { ...outfit }, colors: { ...(o.colors || {}) }, v: null, is3D: false, o };
    // เครื่องที่ไม่มี WebGL: แสดง 2D อัตโนมัติ + บอกเหตุผล (ไม่ปล่อยให้ผู้ใช้สงสัยว่าทำไมไม่มี 3D)
    const noGLMsg = () => (!can3D() && !o.force2D && o.controls !== false
      ? `<p class="a3-fail-msg" role="status">${ICON('info', 'icon icon-xs')} อุปกรณ์/เบราว์เซอร์นี้แสดง 3D ไม่ได้ — แสดง Avatar แบบ 2D แทน</p>` : '');
    const draw2D = () => { box.classList.remove('a3-host'); box.innerHTML = render(st.outfit, 'full', { idle: true, label: o.label || 'อวตาร' }) + noGLMsg(); };
    st.set = (next, colors) => {
      st.outfit = { ...next };
      if (colors !== undefined) st.colors = { ...(colors || {}) };
      if (st.v) st.v.setOutfit(st.outfit, st.colors); else draw2D();
    };
    st.setColors = (colors) => { st.colors = { ...(colors || {}) }; if (st.v && st.v.setColors) st.v.setColors(st.colors); };
    st.snapshot = (size, framing) => (st.v && st.v.isReady() ? st.v.snapshot(size, framing) : null);
    st.play = (n) => st.v && st.v.play(n);
    st.dispose = () => { if (st.v) st.v.dispose(); st.v = null; stages.delete(st); };
    st.mode = (use3D) => {
      if (st.v) { st.v.dispose(); st.v = null; }
      st.is3D = use3D && can3D();
      if (st.is3D) {
        st.v = window.EQAvatar3D.mount(box, { api, byId: S.byId, outfit: st.outfit, colors: st.colors, label: o.label || 'อวตาร 3 มิติ', controls: o.controls,
          anim: o.anim, fallbackHtml: render(st.outfit, 'full', { label: o.label || 'อวตาร' }), onState: (state, extra) => { if (o.onState) o.onState(state, extra); } });
      } else draw2D();
    };
    st.mode(!o.force2D && want3D());
    stages.add(st);
    return st;
  }
  const viewToggle = (is3D) => (can3D() ? `<div class="a3-view-toggle" role="group" aria-label="มุมมองอวตาร">
      <button type="button" data-view="3d" aria-pressed="${is3D}">3D</button><button type="button" data-view="2d" aria-pressed="${!is3D}">2D</button></div>` : '');
  function bindViewToggle(scope, st, after) {
    scope.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      const v3 = b.dataset.view === '3d';
      viewPref.set(v3 ? '3d' : '2d');
      st.mode(v3);
      scope.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === b.dataset.view)));
      if (after) after();
    }));
  }
  /** หลังบันทึกชุดจาก 3D viewer: ถ่าย portrait -> avatarThumbnail (ใช้ใน Leaderboard/เพื่อน แทนการ render 3D ทีละหลายตัว) */
  async function uploadThumb(st, hash) {
    if (!st || !st.is3D || !st.v) return;
    for (let i = 0; i < 40 && st.v && !st.v.isReady(); i++) await new Promise((r) => setTimeout(r, 150));
    const img = st.snapshot();
    if (!img) return;
    try {
      const r = await api('/avatar/thumbnail', { method: 'POST', body: { image: img, outfitHash: hash } });
      S.me.avatarThumbnail = r.url; setMyLook(); App().renderHud();
    } catch (_) { /* ไม่มี thumbnail ก็ใช้ภาพ 2D แทนได้ */ }
  }

  // ---------- การตั้งค่า "รูปโปรไฟล์ที่ใช้แสดง" (setProfileDisplayPreference) ----------
  function displayPrefHtml() {
    const u = App().user; const on = S.me.avatarEnabled;
    const photo = `<span class="dp-pic">${window.EQG.avatar(u.avatar, u.avatarImage || null)}</span>`;
    const av = `<span class="dp-pic">${S.me.avatarThumbnail && on ? `<img class="avatar-img" src="${esc(S.me.avatarThumbnail)}" alt="">` : render(S.me.outfit, 'head')}</span>`;
    return `<fieldset class="dp-box"><legend>รูปโปรไฟล์ที่ใช้แสดง</legend>
      <p class="dp-sub">เลือกว่าคนอื่นจะเห็นรูปไหนที่แถบด้านบน เพื่อน Leaderboard และ Ranked — เปลี่ยนกลับได้ทุกเมื่อ รูปเดิมไม่ถูกลบ</p>
      <label class="dp-opt"><input type="radio" name="dp-${u.id}" value="photo" ${on ? '' : 'checked'}>${photo}<span><b>ใช้รูปโปรไฟล์เดิม</b><small>${u.avatarImage ? 'รูปที่คุณอัปโหลด/จาก Google' : 'รูปสัตว์ที่คุณเลือก'}</small></span></label>
      <label class="dp-opt"><input type="radio" name="dp-${u.id}" value="avatar" ${on ? 'checked' : ''}>${av}<span><b>ใช้ Avatar ของฉัน</b><small>ตัวละครที่คุณแต่ง</small></span></label>
    </fieldset>`;
  }
  function bindDisplayPref(scope, after) {
    scope.querySelectorAll('.dp-opt input').forEach((r) => r.addEventListener('change', async () => {
      const useAvatar = r.value === 'avatar';
      try {
        await api('/avatar/display', { method: 'PUT', body: { useAvatar } });
        S.me.avatarEnabled = useAvatar; setMyLook(); App().renderHud();
        toast(useAvatar ? 'ใช้ Avatar เป็นรูปโปรไฟล์แล้ว' : 'กลับไปใช้รูปโปรไฟล์เดิมแล้ว', 'success');
        if (after) after();
      } catch (err) { toast(err.message, 'error'); scope.querySelectorAll('.dp-opt input').forEach((x) => { x.checked = (x.value === 'avatar') === S.me.avatarEnabled; }); }
    }));
  }

  // =====================================================================
  // Editor (#/avatar) — เลือกของผ่านปุ่ม/รายการ/คีย์บอร์ดได้ทั้งหมด (3D เป็นภาพตัวอย่าง ไม่ใช่ทางควบคุมทางเดียว)
  // =====================================================================
  const ED = { draft: null, saved: null, slot: 'hair', presets: [], stage: null, colDraft: {}, colSaved: {} };
  // ---------- สีเครื่องแต่งกาย (ฟรี · ไม่ต้องซื้อซ้ำ) ----------
  const ROLE_TH = { primary: 'สีหลัก', secondary: 'สีรอง', accent: 'สีเน้น' };
  const cloneCols = (c) => JSON.parse(JSON.stringify(c || {}));
  const colKey = (c) => (c ? ['primary', 'secondary', 'accent', 'variant'].map((k) => c[k] || '').join('|') : '|||');
  const colorsDirty = () => {
    const ids = new Set([...Object.keys(ED.colDraft), ...Object.keys(ED.colSaved)]);
    return [...ids].some((id) => colKey(ED.colDraft[id]) !== colKey(ED.colSaved[id]));
  };
  function colorPanel() {
    const id = ED.draft[ED.slot];
    const it = id && S.byId[id];
    const info = it && it.color;
    if (!info || !info.colorable) {
      return it && ['top', 'outerwear', 'bottom', 'shoes', 'hat', 'back', 'accessory'].includes(ED.slot)
        ? `<p class="av-col-none">${ICON('info', 'icon icon-xs')} ${esc(it.nameTh || it.name)} เปลี่ยนสีไม่ได้ (ลายหรือสีเป็นเอกลักษณ์ของชิ้นนี้)</p>` : '';
    }
    const cur = ED.colDraft[id] || {};
    const pal = (S.palette && S.palette.palette) || [];
    const vth = (S.palette && S.palette.variants) || {};
    const rows = Object.entries(info.regions).map(([role, r]) => {
      const now = cur[role] || r.default;
      const sw = (hex, label, isDef) => `<button type="button" class="av-sw${now.toLowerCase() === hex.toLowerCase() ? ' is-on' : ''}" data-col-role="${role}" data-col="${isDef ? '' : hex}"
        style="--sw:${hex}" aria-label="${esc(ROLE_TH[role])}: ${esc(label)}" aria-pressed="${now.toLowerCase() === hex.toLowerCase()}"></button>`;
      return `<div class="av-col-row" role="group" aria-label="${ROLE_TH[role]}"><span class="av-col-label"><i style="--sw:${now}"></i>${ROLE_TH[role]}</span>
        <div class="av-swatches">${sw(r.default, 'สีเดิม', true)}${pal.filter((h) => h.toLowerCase() !== r.default.toLowerCase()).map((h) => sw(h, h, false)).join('')}
        ${info.allowPicker ? `<label class="av-pick" title="เลือกสีเอง">${ICON('pipette', 'icon icon-xs')}<span class="sr-only">เลือกสีเอง (${ROLE_TH[role]})</span><input type="color" data-pick="${role}" value="${esc(now)}"></label>` : ''}</div></div>`;
    }).join('');
    const vars = info.variants.length > 1 ? `<div class="av-col-row" role="group" aria-label="เนื้อผ้า"><span class="av-col-label">เนื้อผ้า</span><div class="av-variants">
      ${info.variants.map((v, i) => { const on = (cur.variant || info.variants[0]) === v; return `<button type="button" class="chip${on ? ' active' : ''}" data-variant="${i === 0 ? '' : v}" aria-pressed="${on}">${esc((vth[v] && vth[v].th) || v)}${i === 0 ? ' (เดิม)' : ''}</button>`; }).join('')}</div></div>` : '';
    return `<div class="av-colors-box"><h3 class="av-col-title">${ICON('palette', 'icon icon-sm')} สีและเนื้อผ้า · ${esc(it.nameTh || it.name)}${info.garmentTh ? ` <small>${esc(info.garmentTh)}</small>` : ''}</h3>
      ${rows}${vars}
      <p class="av-col-note">ซิป กระดุม โลหะ และลายพิมพ์ไม่เปลี่ยนสีตาม · เปลี่ยนสีฟรี ไม่ต้องซื้อชิ้นเดิมซ้ำ</p>
      ${ED.colDraft[id] ? `<button type="button" class="mini-btn ghost" data-col-reset>${ICON('undo-2', 'icon icon-xs')} ใช้สีเดิมของชิ้นนี้</button>` : ''}</div>`;
  }
  function setColor(el, patch) {
    const id = ED.draft[ED.slot]; const it = S.byId[id]; if (!it || !it.color || !it.color.colorable) return;
    const next = { ...(ED.colDraft[id] || {}), ...patch };
    for (const role of Object.keys(it.color.regions)) if (next[role] && next[role].toLowerCase() === it.color.regions[role].default.toLowerCase()) next[role] = null;
    if (next.variant === it.color.variants[0]) next.variant = null;
    if (!next.primary && !next.secondary && !next.accent && !next.variant) delete ED.colDraft[id]; else ED.colDraft[id] = next;
    if (ED.stage) ED.stage.setColors(ED.colDraft);
    refreshColors(el);
  }
  function refreshColors(el) {
    const box = el.querySelector('#av-colors'); if (!box) return;
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    const key = f && (f.dataset.colRole ? `[data-col-role="${f.dataset.colRole}"][data-col="${f.dataset.col}"]` : f.dataset.variant !== undefined ? `[data-variant="${f.dataset.variant}"]` : null);
    box.innerHTML = colorPanel();
    if (key) { const again = box.querySelector(key); if (again) again.focus(); }
    const dirty = !sameOutfit(ED.draft, ED.saved) || colorsDirty();
    el.querySelector('#av-dirty').innerHTML = dirty ? `${ICON('info', 'icon icon-xs')} ยังไม่ได้บันทึก` : '';
    el.querySelector('#av-save').disabled = !dirty;
    el.querySelector('#av-reset').disabled = !dirty;
  }
  async function openEditor() {
    const el = root('avatar');
    App().showScreen('screen-avatar'); setHash('avatar');
    loading(el);
    try {
      await loadMe();
      const [pr, pal] = await Promise.all([api('/avatar/presets'), S.palette ? S.palette : api('/avatar/colors/palette').catch(() => null)]);
      ED.presets = pr.presets; S.palette = pal;
      ED.saved = { ...S.me.outfit }; ED.draft = { ...S.me.outfit };
      ED.colSaved = cloneCols(S.me.colors); ED.colDraft = cloneCols(S.me.colors);
      renderEditor(el); focusTitle(el);
    } catch (err) { errorBox(el, err, openEditor); }
  }
  function renderEditor(el) {
    if (ED.stage) ED.stage.dispose();
    el.innerHTML = `${topBar('แต่งตัวอวตาร', 'เลือกของที่มีเพื่อดูทันที แล้วกด "บันทึกชุด" — การบันทึกชุดไม่เปลี่ยนรูปโปรไฟล์ของคุณ · ของตกแต่งไม่มีผลต่อ EXP / Rank / คะแนน', {
      right: `<button class="coin-btn" type="button" data-av-nav="shop" aria-label="Coin ${fmt(S.balance)} — เปิดร้านค้า">${coinChip()}</button>` })}
      <div class="av-editor">
        <nav class="av-cats" aria-label="หมวดของตกแต่ง"><div class="av-cats-scroll" role="tablist" id="av-cats"></div></nav>
        <div class="av-stage-wrap">
          <div class="av-stage-head">${viewToggle(want3D())}</div>
          <div class="av-stage" id="av-stage"></div>
          <p class="a3-note" id="av-3d-note" aria-live="polite"></p>
          <p class="av-dirty" id="av-dirty" aria-live="polite"></p>
          <div class="av-actions">
            <button class="btn btn-primary" type="button" id="av-save">${ICON('save', 'icon icon-sm')} บันทึกชุด</button>
            <button class="btn btn-secondary" type="button" id="av-reset" title="ยกเลิกการแต่งที่ยังไม่บันทึก กลับเป็นชุดที่บันทึกไว้" aria-label="รีเซ็ตชุด — กลับเป็นชุดที่บันทึกไว้">${ICON('undo-2', 'icon icon-sm')} รีเซ็ตชุด</button>
          </div>
        </div>
        <section class="av-items" aria-labelledby="av-items-title">
          <h2 class="av-items-title" id="av-items-title"></h2>
          <div class="av-grid" role="list" id="av-items"></div>
          <div class="av-colors" id="av-colors" aria-live="polite"></div>
          <button class="home-link av-shop-link" type="button" data-av-nav="shop">${ICON('store')}<span>หาของเพิ่มที่ร้านค้า</span>${ICON('chevron-right')}</button>
        </section>
        <div class="av-extra">
          <h2 class="av-items-title">ชุดที่บันทึกไว้</h2>
          <div class="av-presets" role="group" aria-label="ชุดที่บันทึกไว้" id="av-presets"></div>
          <div id="av-dp">${displayPrefHtml()}</div>
        </div>
      </div>`;
    bindNav(el);
    const note = el.querySelector('#av-3d-note');
    ED.stage = mountStage(el.querySelector('#av-stage'), ED.draft, { label: 'ตัวอย่างอวตาร', colors: ED.colDraft, onState: (state, extra) => {
      note.textContent = state === 'ready' && extra && extra.missing && extra.missing.length ? `ยังไม่มีแบบ 3D: ${extra.missing.join(', ')} (เห็นในโหมด 2D และบันทึกได้ตามปกติ)` : '';
    } });
    bindViewToggle(el, ED.stage, () => { note.textContent = ''; });
    el.querySelector('#av-save').addEventListener('click', () => saveDraft(el));
    el.querySelector('#av-reset').addEventListener('click', () => { ED.draft = { ...ED.saved }; ED.colDraft = cloneCols(ED.colSaved); updateEditor(el, true); });
    const cbox = el.querySelector('#av-colors');
    cbox.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-col-role]'); const va = e.target.closest('[data-variant]'); const rs = e.target.closest('[data-col-reset]');
      if (sw) setColor(el, { [sw.dataset.colRole]: sw.dataset.col || null });
      else if (va) setColor(el, { variant: va.dataset.variant || null });
      else if (rs) { delete ED.colDraft[ED.draft[ED.slot]]; if (ED.stage) ED.stage.setColors(ED.colDraft); refreshColors(el); }
    });
    cbox.addEventListener('input', (e) => { const pk = e.target.closest('[data-pick]'); if (pk) { ED.colDraft = { ...ED.colDraft }; const id = ED.draft[ED.slot]; ED.colDraft[id] = { ...(ED.colDraft[id] || {}), [pk.dataset.pick]: pk.value }; if (ED.stage) ED.stage.setColors(ED.colDraft); } });
    cbox.addEventListener('change', (e) => { const pk = e.target.closest('[data-pick]'); if (pk) setColor(el, { [pk.dataset.pick]: pk.value.toLowerCase() }); });
    el.querySelector('#av-cats').addEventListener('click', (e) => {
      const b = e.target.closest('.av-cat'); if (!b) return;
      ED.slot = b.dataset.slot; updateEditor(el); el.querySelector(`.av-cat[data-slot="${ED.slot}"]`).focus();
    });
    el.querySelector('#av-items').addEventListener('click', (e) => {
      const b = e.target.closest('[data-equip]'); if (!b) return;
      const id = b.dataset.equip;
      if (id === '' || (ED.draft[ED.slot] === id && !REQUIRED.has(ED.slot))) ED.draft = { ...ED.draft, [ED.slot]: null };
      else { const r = equipInto(ED.draft, S.byId[id]); ED.draft = r.outfit; if (r.note) toast(r.note); }
      updateEditor(el, true);
      const again = el.querySelector(`[data-equip="${CSS.escape(id)}"]`); if (again) again.focus();
      bumpStage(el);
    });
    el.querySelector('#av-presets').addEventListener('click', (e) => {
      const use = e.target.closest('[data-preset-use]'); const save = e.target.closest('[data-preset-save]');
      if (save) { savePresetDialog(el, Number(save.dataset.presetSave)); return; }
      if (!use) return;
      const p = ED.presets.find((x) => x.slot === Number(use.dataset.presetUse));
      if (!p) return;
      const own = owned();
      ED.draft = { ...ED.draft, ...Object.fromEntries(SLOTS.map((s) => [s, p.outfit[s] && own.has(p.outfit[s]) ? p.outfit[s] : (REQUIRED.has(s) ? ED.draft[s] : null)])) };
      Object.values(ED.draft).filter(Boolean).forEach((id) => { if (p.colors && p.colors[id]) ED.colDraft[id] = { ...p.colors[id] }; else delete ED.colDraft[id]; });
      updateEditor(el, true); toast(`ใส่ชุด "${p.name}" แล้ว — กดบันทึกชุดเพื่อใช้จริง`);
    });
    bindDisplayPref(el.querySelector('#av-dp'));
    updateEditor(el);
  }
  /** อัปเดตเฉพาะส่วนที่เปลี่ยน (ไม่สร้าง 3D viewer ใหม่) */
  function updateEditor(el, outfitChanged = false) {
    const dirty = !sameOutfit(ED.draft, ED.saved) || colorsDirty();
    el.querySelector('#av-cats').innerHTML = CATS.map((c) => `<button type="button" role="tab" class="av-cat${c.slot === ED.slot ? ' active' : ''}" data-slot="${c.slot}" aria-selected="${c.slot === ED.slot}">
      ${ICON(c.icon, 'icon icon-sm')}<span>${esc(c.th)}</span>${ED.draft[c.slot] && !REQUIRED.has(c.slot) ? '<i class="av-dot" aria-label="สวมอยู่"></i>' : ''}</button>`).join('');
    el.querySelector('#av-items-title').textContent = CAT_BY[ED.slot].th;
    el.querySelector('#av-items').innerHTML = itemTiles();
    el.querySelector('#av-dirty').innerHTML = dirty ? `${ICON('info', 'icon icon-xs')} ยังไม่ได้บันทึก` : '';
    el.querySelector('#av-save').disabled = !dirty;
    el.querySelector('#av-reset').disabled = !dirty;
    el.querySelector('#av-presets').innerHTML = [1, 2, 3].map((n) => { const p = ED.presets.find((x) => x.slot === n); return `<div class="av-preset">
      <button type="button" class="av-preset-use" data-preset-use="${n}" ${p ? '' : 'disabled'} aria-label="${p ? `ใส่ชุด ${esc(p.name)}` : `ช่องที่ ${n} ว่าง`}">
        <span class="av-preset-pic">${p ? (p.thumb ? `<img src="${esc(p.thumb)}" alt="" width="96" height="96" decoding="async">` : render(p.outfit, 'full')) : ICON('plus', 'icon')}</span><small>${p ? esc(p.name) : `ช่อง ${n}`}</small></button>
      <button type="button" class="mini-btn ghost av-preset-save" data-preset-save="${n}">${ICON('save', 'icon icon-xs')} บันทึกลงช่อง</button></div>`; }).join('');
    el.querySelector('#av-colors').innerHTML = colorPanel();
    if (outfitChanged && ED.stage) ED.stage.set(ED.draft, ED.colDraft);
  }
  function itemTiles() {
    const own = owned();
    const items = S.cat.filter((it) => it.slot === ED.slot && own.has(it.id));
    const cur = ED.draft[ED.slot];
    const none = REQUIRED.has(ED.slot) ? '' : `<button type="button" role="listitem" class="av-tile av-tile-none${cur ? '' : ' is-on'}" data-equip="" aria-pressed="${!cur}">
      <span class="av-tile-pic">${ICON('ban', 'icon icon-lg')}</span><span class="av-tile-name">ไม่สวม</span></button>`;
    return none + items.map((it) => `<button type="button" role="listitem" class="av-tile${cur === it.id ? ' is-on' : ''}" data-equip="${esc(it.id)}" aria-pressed="${cur === it.id}"
        aria-label="${esc(it.name)} (${RARITY[it.rarity]})${it.model ? ' · มีแบบ 3D' : ''}${cur === it.id ? ' — สวมอยู่' : ''}">
        <span class="av-tile-pic r-${esc(it.rarity)}">${thumb(it)}${it.model ? '<span class="av-badge-3d" aria-hidden="true">3D</span>' : ''}</span><span class="av-tile-name">${esc(it.nameTh || it.name)}</span>
        ${cur === it.id ? `<span class="av-tile-on">${ICON('check', 'icon icon-xs')}</span>` : ''}</button>`).join('')
      + (items.length ? '' : '<p class="av-empty">ยังไม่มีของในหมวดนี้ — ลองดูที่ร้านค้า</p>');
  }
  function bumpStage(el) {
    const st = el.querySelector('#av-stage');
    if (!st || reduced() || (ED.stage && ED.stage.is3D)) return;
    st.classList.remove('is-equip'); void st.offsetWidth; st.classList.add('is-equip');
  }
  async function saveDraft(el) {
    const btn = el.querySelector('#av-save'); btn.disabled = true;
    try {
      // updateAvatar(): บันทึกชุดเท่านั้น — รูปโปรไฟล์และการตั้งค่าการแสดงผลไม่เปลี่ยน
      const r = await api('/avatar/outfit', { method: 'PUT', body: { outfit: ED.draft } });
      // สีที่เปลี่ยน (เฉพาะชิ้นที่ต่างจากที่บันทึกไว้) — ตรวจฝั่งเซิร์ฟเวอร์ทุกค่า
      const ids = new Set([...Object.keys(ED.colDraft), ...Object.keys(ED.colSaved)]);
      for (const id of ids) {
        if (colKey(ED.colDraft[id]) === colKey(ED.colSaved[id])) continue;
        const c = ED.colDraft[id] || {};
        await api(`/avatar/colors/${encodeURIComponent(id)}`, { method: 'PUT', body: { primary: c.primary || null, secondary: c.secondary || null, accent: c.accent || null, variant: c.variant || null } });
      }
      ED.colSaved = cloneCols(ED.colDraft); S.me.colors = cloneCols(ED.colDraft);
      ED.saved = { ...r.outfit }; ED.draft = { ...r.outfit };
      S.me.outfit = { ...r.outfit }; S.me.avatarThumbnail = null; S.me.outfitHash = r.outfitHash;
      setMyLook(); App().renderHud();
      updateEditor(el); toast('บันทึกชุดแล้ว', 'success');
      ED.stage.play('celebrate');
      uploadThumb(ED.stage, r.outfitHash).then(() => { const dp = el.querySelector('#av-dp'); if (dp) { dp.innerHTML = displayPrefHtml(); bindDisplayPref(dp); } });
    } catch (err) { btn.disabled = false; toast(err.message, 'error'); }
  }
  function savePresetDialog(el, slot) {
    const cur = ED.presets.find((x) => x.slot === slot);
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<form class="modal-card av-dialog"><h2>บันทึกชุดลงช่อง ${slot}</h2>
      <div class="av-dialog-pic">${render(ED.draft, 'half')}</div>
      <label class="field"><span>ชื่อชุด</span><input id="av-preset-name" maxlength="30" value="${esc(cur ? cur.name : `ชุดที่ ${slot}`)}" required></label>
      ${cur ? '<p class="page-sub">ช่องนี้มีชุดอยู่แล้ว — จะถูกแทนที่</p>' : ''}
      <div class="av-dialog-actions"><button class="btn btn-primary" type="submit">${ICON('save', 'icon icon-sm')} บันทึก</button>
      <button class="btn btn-secondary" type="button" data-close>ยกเลิก</button></div></form>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: `บันทึกชุดลงช่อง ${slot}` });
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
    const inp = ov.querySelector('#av-preset-name'); inp.focus(); inp.select();
    ov.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api(`/avatar/presets/${slot}`, { method: 'PUT', body: { name: inp.value, outfit: ED.draft, colors: Object.fromEntries(Object.values(ED.draft).filter((id) => id && ED.colDraft[id]).map((id) => [id, ED.colDraft[id]])), thumb: (ED.stage && ED.stage.snapshot(192, 'full')) || null } });
        ED.presets = ED.presets.filter((x) => x.slot !== slot).concat([r.preset]);
        ov.remove(); updateEditor(el); toast(`บันทึก "${r.preset.name}" แล้ว`, 'success'); checkCoins(1500);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // =====================================================================
  // Wardrobe (#/wardrobe) — ของที่มีเท่านั้น
  // =====================================================================
  const WD = { filter: 'all', sort: 'newest' };
  const WD_FILTERS = [['all', 'ทั้งหมด'], ['hair', 'ทรงผม'], ['top', 'เสื้อ'], ['bottom', 'กางเกง/กระโปรง'], ['shoes', 'รองเท้า'], ['accessory', 'เครื่องประดับ'],
    ['rare', 'Rare'], ['epic', 'Epic'], ['legendary', 'Legendary']];
  const WD_SORTS = [['newest', 'ใหม่ล่าสุด'], ['rarity', 'ความหายาก'], ['name', 'ชื่อ'], ['recent', 'ใช้ล่าสุด']];
  async function openWardrobe() {
    const el = root('wardrobe');
    App().showScreen('screen-wardrobe'); setHash('wardrobe');
    loading(el);
    try { await loadMe(); renderWardrobe(el); focusTitle(el); } catch (err) { errorBox(el, err, openWardrobe); }
  }
  function renderWardrobe(el) {
    const inv = S.me.inventory.map((x) => ({ ...x, it: S.byId[x.itemId] })).filter((x) => x.it);
    const f = WD.filter;
    let list = inv.filter(({ it }) => f === 'all' || (['rare', 'epic', 'legendary'].includes(f) ? it.rarity === f
      : f === 'accessory' ? ['accessory', 'glasses', 'headphones', 'hat', 'back', 'effect'].includes(it.slot) : f === 'top' ? ['top', 'outerwear'].includes(it.slot) : it.slot === f));
    const t = (d) => (d ? new Date(d).getTime() : 0);
    list = list.sort({
      newest: (a, b) => t(b.acquiredAt) - t(a.acquiredAt) || a.it.sortOrder - b.it.sortOrder,
      rarity: (a, b) => RANK[b.it.rarity] - RANK[a.it.rarity] || a.it.name.localeCompare(b.it.name),
      name: (a, b) => (a.it.nameTh || a.it.name).localeCompare(b.it.nameTh || b.it.name, 'th'),
      recent: (a, b) => t(b.lastEquippedAt) - t(a.lastEquippedAt) || t(b.acquiredAt) - t(a.acquiredAt),
    }[WD.sort]);
    const worn = new Set(Object.values(S.me.outfit).filter(Boolean));
    el.innerHTML = `${topBar('ตู้เสื้อผ้า', `ของที่คุณมี ${inv.length} ชิ้น — แตะเพื่อสวมหรือถอดได้ทันที`, { right: `<button class="coin-btn" type="button" data-av-nav="shop" aria-label="เปิดร้านค้า">${coinChip()}</button>` })}
      <div class="wd-head">
        <div class="wd-me">${render(S.me.outfit, 'half', { label: 'ชุดปัจจุบัน' })}</div>
        <div class="wd-controls">
          <div class="wd-filters" role="group" aria-label="กรอง">${WD_FILTERS.map(([k, th]) => `<button type="button" class="chip-btn${WD.filter === k ? ' active' : ''}" data-wd-filter="${k}" aria-pressed="${WD.filter === k}">${esc(th)}</button>`).join('')}</div>
          <label class="wd-sort">${ICON('arrow-down-up', 'icon icon-sm')}<span class="sr-only">เรียงตาม</span>
            <select id="wd-sort">${WD_SORTS.map(([k, th]) => `<option value="${k}"${WD.sort === k ? ' selected' : ''}>${esc(th)}</option>`).join('')}</select></label>
          <button class="btn btn-secondary wd-edit" type="button" data-av-nav="avatar">${ICON('wand-sparkles', 'icon icon-sm')} เปิดหน้าแต่งตัว</button>
        </div>
      </div>
      <div class="av-grid wr-grid" role="list">
        ${list.map(({ it }) => `<button type="button" role="listitem" class="av-tile${worn.has(it.id) ? ' is-on' : ''}" data-wd-item="${esc(it.id)}"
          aria-label="${esc(it.name)} (${RARITY[it.rarity]})${worn.has(it.id) ? ' — สวมอยู่' : ''}">
          <span class="av-tile-pic r-${esc(it.rarity)}">${thumb(it)}</span><span class="av-tile-name">${esc(it.nameTh || it.name)}</span>
          ${rarityTag(it.rarity)}${worn.has(it.id) ? `<span class="av-tile-on">${ICON('check', 'icon icon-xs')}</span>` : ''}</button>`).join('')
        || '<p class="av-empty">ไม่มีของตามตัวกรองนี้</p>'}
      </div>`;
    bindNav(el);
    el.querySelectorAll('[data-wd-filter]').forEach((b) => b.addEventListener('click', () => { WD.filter = b.dataset.wdFilter; renderWardrobe(el); el.querySelector(`[data-wd-filter="${WD.filter}"]`).focus(); }));
    el.querySelector('#wd-sort').addEventListener('change', (e) => { WD.sort = e.target.value; renderWardrobe(el); el.querySelector('#wd-sort').focus(); });
    el.querySelectorAll('[data-wd-item]').forEach((b) => b.addEventListener('click', () => itemSheet(S.byId[b.dataset.wdItem], () => renderWardrobe(el))));
  }
  /** รายละเอียดของที่มี: สวม / ถอด (บันทึกทันที) */
  function itemSheet(it, after) {
    const worn = S.me.outfit[it.slot] === it.id;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const preview = worn ? S.me.outfit : equipInto(S.me.outfit, it).outfit;
    ov.innerHTML = `<div class="modal-card av-dialog"><h2>${esc(it.nameTh || it.name)}</h2>
      <p class="av-dialog-sub">${esc(it.name)} · ${esc(CAT_BY[it.slot].th)} ${rarityTag(it.rarity)} ${tagOf(it)}</p>
      <div class="av-dialog-pic">${render(preview, 'full', { label: `ตัวอย่างเมื่อสวม ${it.name}` })}</div>
      <div class="av-dialog-actions">
        ${worn ? (REQUIRED.has(it.slot) ? '<p class="page-sub">สวมอยู่ (ช่องนี้ต้องมีของเสมอ)</p>' : `<button class="btn btn-secondary" type="button" data-unequip>${ICON('x', 'icon icon-sm')} ถอด</button>`)
          : `<button class="btn btn-primary" type="button" data-equip-now>${ICON('shirt', 'icon icon-sm')} สวมเลย</button>`}
        <button class="btn btn-secondary" type="button" data-close>ปิด</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: it.name, variant: 'sheet' });
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
    const save = async (outfit, msg) => {
      try {
        const r = await api('/avatar/outfit', { method: 'PUT', body: { outfit } });
        S.me.outfit = r.outfit;
        S.me.outfit = r.outfit; S.me.avatarThumbnail = null; setMyLook(); App().renderHud();
        ov.remove(); toast(msg, 'success'); if (after) after();
      } catch (err) { toast(err.message, 'error'); }
    };
    const eq = ov.querySelector('[data-equip-now]');
    if (eq) { eq.focus(); eq.addEventListener('click', () => { const r = equipInto(S.me.outfit, it); save(r.outfit, `สวม ${it.name} แล้ว${r.note ? ` · ${r.note}` : ''}`); }); }
    const un = ov.querySelector('[data-unequip]');
    if (un) un.addEventListener('click', () => save({ ...S.me.outfit, [it.slot]: null }, `ถอด ${it.name} แล้ว`));
  }

  // =====================================================================
  // Shop (#/shop)
  // =====================================================================
  const SH = { section: 'featured', collection: '', collections: [], items: [], page: 1, more: false, preview: null, total: 0, stage: null };
  async function openShop() {
    const el = root('shop');
    App().showScreen('screen-shop'); setHash('shop');
    SH.preview = null;   // เข้าใหม่ = ไม่มีของที่ลองสวมค้าง
    loading(el);
    try { await loadMe(); await loadShop(1); renderShop(el); focusTitle(el); } catch (err) { errorBox(el, err, openShop); }
  }
  async function loadShop(page) {
    const r = await api(`/avatar/shop?section=${SH.section}&page=${page}&size=24${SH.collection ? `&collection=${encodeURIComponent(SH.collection)}` : ''}`);
    SH.collections = r.collections || [];
    SH.items = page === 1 ? r.items : SH.items.concat(r.items);
    SH.page = page; SH.more = r.more; SH.total = r.total; setBalance(r.balance);
  }
  function renderShop(el) {
    if (SH.stage) SH.stage.dispose();
    el.innerHTML = `${topBar('ร้านค้า', 'ของตกแต่งเท่านั้น — เห็นหน้าตาและราคาก่อนซื้อเสมอ · ไม่มีกล่องสุ่ม · ไม่ใช้เงินจริง', {
      right: `<button class="coin-btn" type="button" data-av-nav="coins" aria-label="Coin ${fmt(S.balance)} — ดูประวัติ Coin">${coinChip()}</button>` })}
      <div class="sh-layout">
        <aside class="sh-preview" id="sh-preview" aria-label="ตัวอย่าง">
          <div class="sh-stage-head">${viewToggle(want3D())}</div>
          <div class="sh-stage" id="sh-stage"></div>
          <p class="a3-note" id="sh-3d-note" aria-live="polite"></p>
          <div id="sh-try"></div>
        </aside>
        <section class="sh-main">
          <nav class="sh-tabs" aria-label="หมวดร้านค้า"><div class="sh-tabs-scroll" id="sh-tabs"></div></nav>
          <nav class="sh-tabs sh-cols" aria-label="คอลเลกชัน (ธีมชุด)"><div class="sh-tabs-scroll" id="sh-cols"></div></nav>
          <div class="sh-grid" role="list" id="sh-grid"></div>
          <div id="sh-more"></div>
          <p class="sh-note">${ICON('info', 'icon icon-xs')} ของตกแต่งไม่มีผลต่อ EXP · Rank · คะแนน หรือความสามารถใด ๆ · Coin ได้จากการเรียนเท่านั้น <button class="link-btn" type="button" data-av-nav="coins">วิธีได้ Coin</button></p>
        </section>
      </div>`;
    bindNav(el);
    const note = el.querySelector('#sh-3d-note');
    // 3D: โหลดโมเดลจริงของ item เฉพาะตอนกด "ลองสวม" เท่านั้น (รายการในร้านใช้ภาพย่อ)
    SH.forced2D = false;
    SH.stage = mountStage(el.querySelector('#sh-stage'), shopLook(), { label: 'ตัวอย่างชุด', controls: true, onState: (state, extra) => {
      if (state === 'ready') note.textContent = extra && extra.missing && extra.missing.length ? `ยังไม่มีแบบ 3D: ${extra.missing.join(', ')}` : '';
    } });
    bindViewToggle(el, SH.stage);
    if (el.dataset.shBound) { updateShopTry(el); updateShopList(el); return; }
    el.dataset.shBound = '1';
    el.addEventListener('click', async (e) => {
      const sec = e.target.closest('[data-section]');
      const colb = e.target.closest('[data-collection]');
      if (colb) {
        SH.collection = SH.collection === colb.dataset.collection ? '' : colb.dataset.collection;
        try { await loadShop(1); updateShopList(el); const f = el.querySelector(`[data-collection="${CSS.escape(colb.dataset.collection)}"]`); if (f) f.focus(); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      if (sec) {
        SH.section = sec.dataset.section; SH.collection = '';
        try { await loadShop(1); updateShopList(el); el.querySelector(`[data-section="${SH.section}"]`).focus(); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      const more = e.target.closest('[data-more]');
      if (more) { more.disabled = true; try { await loadShop(SH.page + 1); updateShopList(el); } catch (err) { more.disabled = false; toast(err.message, 'error'); } return; }
      const pv = e.target.closest('[data-preview]');
      if (pv) {
        SH.preview = SH.items.find((x) => x.id === pv.dataset.preview);
        updateShopTry(el); updateShopList(el);
        const st = el.querySelector('.sh-preview'); if (st && window.innerWidth < 900) st.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        const c = el.querySelector('[data-cancel-preview]'); if (c) c.focus({ preventScroll: true });
        return;
      }
      const buy = e.target.closest('[data-buy]');
      if (buy) { if (!buy.disabled) confirmBuy(el, SH.items.find((x) => x.id === buy.dataset.buy)); return; }
      const eqo = e.target.closest('[data-equip-owned]');
      if (eqo) {
        const it = SH.items.find((x) => x.id === eqo.dataset.equipOwned); if (!it) return;
        eqo.disabled = true;
        try {
          const r = await api('/avatar/equip', { method: 'POST', body: { slot: it.slot, itemId: it.id } });   // equipAvatarItem
          S.me.outfit = r.outfit; S.me.avatarThumbnail = null; setMyLook(); App().renderHud();
          SH.preview = null; updateShopTry(el); updateShopList(el); toast(`สวม ${it.name} แล้ว`, 'success');
        } catch (err) { eqo.disabled = false; toast(err.message, 'error'); }
        return;
      }
      if (e.target.closest('[data-cancel-preview]')) {
        const id = SH.preview.id; SH.preview = null; updateShopTry(el); updateShopList(el);
        const b = el.querySelector(`[data-preview="${CSS.escape(id)}"]`); if (b) b.focus();
      }
    });
    updateShopTry(el); updateShopList(el);
  }
  const shopLook = () => (SH.preview ? equipInto(S.me.outfit, SH.preview).outfit : S.me.outfit);
  /** สถานะของชิ้น (แยกชัด): equipped · owned · locked · previewing · not-owned + มี/ไม่มีแบบ 3D */
  function itemState(it) {
    const equipped = S.me && Object.values(S.me.outfit).includes(it.id);
    return {
      equipped, owned: Boolean(it.owned) || equipped, locked: Boolean(it.achievementId) && !it.owned,
      previewing: Boolean(SH.preview && SH.preview.id === it.id), has3D: Boolean(it.model),
    };
  }
  const stateChips = (it) => {
    const st = itemState(it);
    return [st.previewing ? `<span class="av-state st-preview">${ICON('eye', 'icon icon-xs')} กำลังลอง</span>` : '',
      st.equipped ? `<span class="av-state st-equipped">${ICON('check', 'icon icon-xs')} สวมอยู่</span>`
        : st.owned ? `<span class="av-state st-owned">${ICON('circle-check', 'icon icon-xs')} มีแล้ว</span>`
          : st.locked ? `<span class="av-state st-locked">${ICON('lock', 'icon icon-xs')} ล็อก (Achievement)</span>` : `<span class="av-state st-notowned">ยังไม่มี</span>`,
      st.has3D ? '' : `<span class="av-state st-2d">${ICON('image', 'icon icon-xs')} 2D เท่านั้น</span>`,
      st.equipped || !S.me ? '' : conflictsOf({ ...S.me.outfit, [it.slot]: it.id }, it).map((c) => `<span class="av-state st-conflict" title="${esc(c.reason)}">${ICON('triangle-alert', 'icon icon-xs')} ${c.slot === 'hair' ? 'จะเปลี่ยนทรงผมเป็นทรงสั้น' : `จะถอด${esc(itemName(S.byId[c.id]))}`} · ${esc(c.reason)}</span>`).join('')].join('');
  };
  // Preview: ไม่บันทึกอะไรลงบัญชี (ไม่ใช่ equipped จนกว่าจะซื้อ + สวม) · ยกเลิก = กลับชุดที่สวมจริง
  function updateShopTry(el) {
    const p = SH.preview;
    el.querySelector('#sh-preview').classList.toggle('is-trying', Boolean(p));
    const note = el.querySelector('#sh-3d-note');
    // ชิ้นที่ไม่มีโมเดล 3D: เปิด Preview แบบ 2D ให้เห็นชุดจริง (ไม่แสดงว่า 3D ลองสำเร็จ)
    if (SH.stage) {
      const need2D = Boolean(p && !p.model);
      if (need2D && SH.stage.is3D) { SH.forced2D = true; SH.stage.mode(false); }
      else if (!need2D && SH.forced2D) { SH.forced2D = false; if (want3D()) SH.stage.mode(true); }
      SH.stage.set(shopLook());
      note.textContent = need2D ? 'ชุดนี้รองรับ Preview 2D เท่านั้น' : '';
      el.querySelectorAll('#sh-preview [data-view]').forEach((b) => { b.disabled = need2D; });
    }
    if (!p) { el.querySelector('#sh-try').innerHTML = '<p class="sh-hint">กด "ลองสวม" เพื่อดูของบนตัวละครของคุณก่อนซื้อ (ฟรี · ไม่บันทึกจนกว่าจะซื้อ/สวม)</p>'; return; }
    const st = itemState(p);
    const bal = S.balance || 0;
    const short = p.price - bal;
    const buyable = !st.owned && p.purchasable && !p.achievementId;
    el.querySelector('#sh-try').innerHTML = `<div class="sh-try" aria-live="polite">
        <b>กำลังทดลอง: ${esc(p.nameTh || p.name)}</b>
        <div class="sh-try-states">${stateChips(p)}</div>
        ${buyable ? `<dl class="sh-try-sum"><div><dt>ราคา</dt><dd>${coinIcon()} ${fmt(p.price)}</dd></div><div><dt>Coin ปัจจุบัน</dt><dd>${fmt(bal)}</dd></div>
          ${short > 0 ? `<div class="is-neg"><dt>ต้องการอีก</dt><dd>${fmt(short)} Coins</dd></div>` : ''}</dl>` : ''}
        <div class="sh-try-actions">${buyButton(p)}<button class="btn btn-secondary" type="button" data-cancel-preview>${ICON('undo-2', 'icon icon-sm')} ยกเลิกการลอง</button></div></div>`;
  }
  function updateShopList(el) {
    const secOn = (k) => !SH.collection && SH.section === k;
    el.querySelector('#sh-tabs').innerHTML = SHOP_SECTIONS.map(([k, th, ic]) => `<button type="button" class="chip-btn${secOn(k) ? ' active' : ''}" data-section="${k}" aria-pressed="${secOn(k)}">${ICON(ic, 'icon icon-xs')} ${esc(th)}</button>`).join('');
    el.querySelector('#sh-cols').innerHTML = SH.collections.length ? `<span class="sh-cols-label">${ICON('layers', 'icon icon-xs')} ธีม:</span>` + SH.collections.map((c) => `<button type="button" class="chip-btn${SH.collection === c.id ? ' active' : ''}" data-collection="${esc(c.id)}" aria-pressed="${SH.collection === c.id}" title="${esc(c.name)}">${esc(c.nameTh || c.name)}</button>`).join('') : '';
    el.querySelector('#sh-grid').innerHTML = SH.items.map(shopCard).join('') || '<p class="av-empty">ยังไม่มีของในหมวดนี้</p>';
    el.querySelector('#sh-more').innerHTML = SH.more ? '<button class="btn btn-secondary sh-more" type="button" data-more>โหลดเพิ่ม</button>' : '';
  }
  function buyButton(it) {
    const st = itemState(it);
    if (st.equipped) return `<span class="sh-owned">${ICON('check', 'icon icon-sm')} สวมอยู่</span>`;
    if (st.owned) return `<button class="btn btn-primary" type="button" data-equip-owned="${esc(it.id)}">${ICON('shirt', 'icon icon-sm')} สวมชิ้นนี้</button>`;
    if (it.achievementId || !it.purchasable) return `<span class="av-tag av-tag-ach">${ICON('lock', 'icon icon-xs')} ได้จาก Achievement เท่านั้น</span>`;
    const short = it.price - (S.balance || 0);
    return `<button class="btn btn-primary sh-buy" type="button" data-buy="${esc(it.id)}" ${short > 0 ? 'disabled aria-disabled="true"' : ''}>${coinIcon()} ${fmt(it.price)} ซื้อ</button>`
      + (short > 0 ? `<small class="sh-short">Coin ไม่พอ — ต้องการอีก ${fmt(short)} Coins (ยังลองสวมได้ฟรี)</small>` : '');
  }
  const colName = (id) => { const c = SH.collections.find((x) => x.id === id); return c ? (c.nameTh || c.name) : ''; };
  function shopCard(it) {
    const ach = it.achievementId;
    return `<article class="sh-card r-${esc(it.rarity)}${it.owned ? ' is-owned' : ''}${SH.preview && SH.preview.id === it.id ? ' is-preview' : ''}" role="listitem">
      <div class="sh-card-pic">${it.model ? `<img class="av-thumb-img" src="${esc(it.model.thumbnailUrl)}" alt="" loading="lazy" decoding="async" width="128" height="128"><span class="av-badge-3d" aria-hidden="true">3D</span>` : thumb(it)}</div>
      <div class="sh-card-body"><h3>${esc(it.nameTh || it.name)}</h3><p class="sh-card-en">${esc(it.name)}</p>
        <p class="sh-card-cat">${esc((CAT_BY[it.slot] || {}).th || it.slot)}${it.collection && colName(it.collection) ? ` · ธีม ${esc(colName(it.collection))}` : ''}</p>
        <div class="sh-card-tags">${rarityTag(it.rarity)}${tagOf(it)}</div>
        <div class="sh-card-states">${stateChips(it)}</div>
        <p class="sh-price">${it.owned ? `${ICON('circle-check', 'icon icon-xs')} มีแล้ว` : ach ? 'ซื้อไม่ได้' : `${coinIcon()} <b>${fmt(it.price)}</b>`}</p></div>
      <div class="sh-card-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-preview="${esc(it.id)}" aria-label="ลองสวม ${esc(it.name)}">${ICON('eye', 'icon icon-xs')} ลองสวม</button>
        ${!it.owned && !ach && it.purchasable ? `<button type="button" class="btn btn-primary btn-sm" data-buy="${esc(it.id)}" ${it.price > (S.balance || 0) ? 'disabled aria-disabled="true"' : ''} aria-label="ซื้อ ${esc(it.name)} ราคา ${it.price} Coins">ซื้อ</button>` : ''}
      </div></article>`;
  }
  function confirmBuy(el, it) {
    if (!it) return;
    const bal = S.balance || 0;
    const after = bal - it.price;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card av-dialog sh-confirm"><h2>ยืนยันการซื้อ</h2>
      <div class="sh-confirm-item"><span class="av-tile-pic r-${esc(it.rarity)}">${thumb(it)}</span>
        <div><b>${esc(it.nameTh || it.name)}</b><small>${esc(it.name)} · ${esc(CAT_BY[it.slot].th)}</small>${rarityTag(it.rarity)}</div></div>
      <dl class="sh-sum"><div><dt>ราคา</dt><dd>${coinIcon()} ${fmt(it.price)}</dd></div>
        <div><dt>Coin ตอนนี้</dt><dd>${fmt(bal)}</dd></div>
        <div class="${after < 0 ? 'is-neg' : ''}"><dt>หลังซื้อ</dt><dd>${after < 0 ? `ไม่พอ (ขาด ${fmt(-after)})` : fmt(after)}</dd></div></dl>
      <p class="page-sub">ของตกแต่งเท่านั้น ไม่มีผลต่อ EXP / Rank / คะแนน · ซื้อแล้วเป็นของคุณถาวร</p>
      <div class="av-dialog-actions">
        <button class="btn btn-primary" type="button" data-confirm ${after < 0 ? 'disabled' : ''}>${coinIcon()} ซื้อเลย</button>
        <button class="btn btn-secondary" type="button" data-close>ยกเลิก</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: `ยืนยันการซื้อ ${it.name}` });
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
    const ok = ov.querySelector('[data-confirm]');
    (after < 0 ? ov.querySelector('[data-close]') : ok).focus();
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      try {
        const r = await api('/avatar/purchase', { method: 'POST', body: { itemId: it.id } });
        setBalance(r.balance);
        S.lastTxn = null; checkCoins(10);   // ซิงก์ id รายการล่าสุด (ไม่แจ้งซ้ำ)
        it.owned = true;
        S.me.inventory.push({ itemId: it.id, acquisition: 'purchase', acquiredAt: new Date().toISOString(), lastEquippedAt: null });
        const card = ov.querySelector('.modal-card');
        card.innerHTML = `<h2 class="sh-done-title">${ICON('circle-check', 'icon')} ซื้อสำเร็จ!</h2>
          <div class="av-dialog-pic sh-done-pic">${render(equipInto(S.me.outfit, it).outfit, 'full', { idle: true, label: `ตัวอย่างเมื่อสวม ${it.name}` })}</div>
          <p class="page-sub">${esc(it.nameTh || it.name)} อยู่ในตู้เสื้อผ้าแล้ว · Coin คงเหลือ ${fmt(r.balance)}</p>
          <div class="av-dialog-actions"><button class="btn btn-primary" type="button" data-equip-now>${ICON('shirt', 'icon icon-sm')} สวมเลย</button>
          <button class="btn btn-secondary" type="button" data-close2>ภายหลัง</button></div>`;
        if (!reduced()) card.classList.add('is-celebrate');
        card.querySelector('[data-close2]').addEventListener('click', () => { ov.remove(); SH.preview = null; updateShopTry(el); updateShopList(el); });
        const eq = card.querySelector('[data-equip-now]'); eq.focus();
        eq.addEventListener('click', async () => {
          eq.disabled = true;
          try {
            const r2 = equipInto(S.me.outfit, it);
            const s = await api('/avatar/outfit', { method: 'PUT', body: { outfit: r2.outfit } });
            S.me.outfit = s.outfit;
            S.me.outfit = s.outfit; S.me.avatarThumbnail = null; setMyLook(); App().renderHud();
            ov.remove(); SH.preview = null; updateShopTry(el); updateShopList(el); toast(`สวม ${it.name} แล้ว${r2.note ? ` · ${r2.note}` : ''}`, 'success');
          } catch (err) { eq.disabled = false; toast(err.message, 'error'); }
        });
      } catch (err) {
        ok.disabled = false; toast(err.message, 'error');
        if (err.code === 'ALREADY_OWNED') { it.owned = true; ov.remove(); updateShopTry(el); updateShopList(el); }
      }
    });
  }

  // =====================================================================
  // Coins (#/coins) — ประวัติ + วิธีได้ Coin
  // =====================================================================
  const TYPE_ICON = { ITEM_PURCHASE: 'shopping-bag', ACHIEVEMENT: 'award', WELCOME: 'gift', DAILY_GOAL: 'target', WEEKLY_GOAL: 'calendar',
    DAILY_CHALLENGE: 'flame', RANK_PROMOTION: 'trophy', TOEIC_PRACTICE: 'headphones', TOEIC_MOCK: 'headphones', GRAMMAR_MASTERY: 'crown', VOCAB_MASTERY: 'crown' };
  const CH = { items: [], more: false };
  async function openCoins() {
    const el = root('coins');
    App().showScreen('screen-coins'); setHash('coins');
    loading(el);
    try {
      const [w, h, rules] = await Promise.all([api('/coins/wallet'), api('/coins/history?limit=30'), S.rules || api('/coins/rules')]);
      S.rules = rules; setBalance(w.balance); CH.items = h.items; CH.more = h.more;
      renderCoins(el, w); focusTitle(el);
    } catch (err) { errorBox(el, err, openCoins); }
  }
  function renderCoins(el, w) {
    const when = (d) => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const cat = { firstCompletion: 'ครั้งแรกเท่านั้น', mastery: 'ครั้งเดียวต่อบท', daily: 'วันละครั้ง', weekly: 'สัปดาห์ละครั้ง', review: 'มีเพดานต่อวัน' };
    el.innerHTML = `${topBar('Coin ของฉัน', 'สกุลเงินในเกม — ใช้ซื้อของตกแต่งอวตารเท่านั้น', { right: '' })}
      <div class="ch-balance">${coinIcon('coin-xl')}<div><b data-coin-balance>${fmt(w.balance)}</b><small>Coins คงเหลือ · ได้รวมทั้งหมด ${fmt(w.lifetimeEarned)}</small></div>
        <button class="btn btn-primary" type="button" data-av-nav="shop">${ICON('store', 'icon icon-sm')} ไปร้านค้า</button></div>
      <details class="ch-rules"><summary>${ICON('circle-help', 'icon icon-sm')} วิธีได้ Coin</summary>
        <ul>${S.rules.rules.map((r) => `<li><span>${esc(r.th)}</span><b>+${r.amount}</b><small>${esc(cat[r.category] || '')}${r.dailyLimit ? ` (สูงสุด ${r.dailyLimit} ครั้ง/วัน)` : ''}</small></li>`).join('')}
          <li><span>Achievement</span><b>+20–150</b><small>ครั้งเดียวต่อ Achievement · บางอันได้ของพิเศษด้วย</small></li></ul>
        <p>Coin ไม่เพิ่ม EXP / Rank / คะแนน และซื้อด้วยเงินจริงไม่ได้ · ทบทวนซ้ำได้ Coin เล็กน้อยและมีเพดานรายวัน เพื่อความยุติธรรม</p></details>
      <h2 class="av-h2">${ICON('history', 'icon icon-sm')} ประวัติ</h2>
      <ol class="ch-list">${CH.items.map((x) => `<li class="ch-row ${x.amount < 0 ? 'is-spend' : 'is-earn'}">
          <span class="ch-ico">${ICON(TYPE_ICON[x.type] || (x.amount < 0 ? 'shopping-bag' : 'sparkles'), 'icon icon-sm')}</span>
          <span class="ch-text"><b>${esc(x.description)}</b><small>${when(x.at)} · คงเหลือ ${fmt(x.balanceAfter)}</small></span>
          <span class="ch-amt">${x.amount > 0 ? '+' : '−'}${fmt(Math.abs(x.amount))}</span></li>`).join('') || '<li class="av-empty">ยังไม่มีรายการ</li>'}</ol>
      ${CH.more ? '<button class="btn btn-secondary sh-more" type="button" data-more>ดูเพิ่ม</button>' : ''}`;
    bindNav(el);
    const more = el.querySelector('[data-more]');
    if (more) more.addEventListener('click', async () => {
      more.disabled = true;
      try { const h = await api(`/coins/history?limit=30&before=${CH.items[CH.items.length - 1].id}`); CH.items = CH.items.concat(h.items); CH.more = h.more; renderCoins(el, w); } catch (err) { more.disabled = false; toast(err.message, 'error'); }
    });
  }

  // =====================================================================
  // Achievements (#/achievements)
  // =====================================================================
  async function openAchievements() {
    const el = root('achievements');
    App().showScreen('screen-achievements'); setHash('achievements');
    loading(el);
    try {
      const [r] = await Promise.all([api('/achievements'), loadCatalog()]);
      const got = r.achievements.filter((a) => a.unlocked).length;
      el.innerHTML = `${topBar('ความสำเร็จ', `ปลดล็อกแล้ว ${got} / ${r.achievements.length} · ได้จากการเรียนจริงเท่านั้น`)}
        <ul class="ac-list">${r.achievements.map((a) => {
          const it = a.reward.item && S.byId[a.reward.item];
          const pct = Math.round((a.progress / a.target) * 100);
          return `<li class="ac-card${a.unlocked ? ' is-done' : ''}${a.unlocked && !a.seen ? ' is-new' : ''}">
            <span class="ac-ico">${ICON(ACH_ICON[a.icon] || 'award', 'icon')}</span>
            <div class="ac-body"><h3>${esc(a.nameTh)} <small>${esc(a.name)}</small></h3><p>${esc(a.desc)}</p>
              <div class="ac-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${a.progress}" aria-label="${esc(a.nameTh)}"><span style="width:${pct}%"></span></div>
              <small class="ac-num">${a.unlocked ? `${ICON('circle-check', 'icon icon-xs')} ปลดล็อกแล้ว` : `${fmt(a.progress)} / ${fmt(a.target)}`}</small></div>
            <div class="ac-reward">${a.reward.coins ? `<span class="ac-coins">${coinIcon()} +${a.reward.coins}</span>` : ''}
              ${it ? `<span class="ac-item" title="${esc(it.name)}">${thumb(it)}<small>${esc(it.nameTh || it.name)}</small><span class="av-tag av-tag-ach">Achievement Reward</span></span>` : ''}</div></li>`;
        }).join('')}</ul>`;
      bindNav(el); focusTitle(el);
      if (r.achievements.some((a) => a.unlocked && !a.seen)) api('/achievements/seen', { method: 'POST' }).catch(() => {});
    } catch (err) { errorBox(el, err, openAchievements); }
  }

  // =====================================================================
  // Statistics (#/stats) · Public Profile (#/user/:id) · Privacy (#/privacy)
  // ข้อมูลทุก field มาจาก /api/profile (เซิร์ฟเวอร์ตัดส่วนที่เจ้าของไม่อนุญาตออกแล้ว — หน้าเว็บไม่ได้ "ซ่อนด้วย CSS")
  // =====================================================================
  const FIELD_TH = { avatar: 'Avatar', level: 'เลเวลบัญชี', rank: 'แรงค์', achievements: 'ความสำเร็จ', stats: 'สถิติการเรียน', vocab: 'คำศัพท์',
    grammar: 'แกรมม่า', toeic: 'TOEIC', coins: 'Coin', inventory: 'ตู้เสื้อผ้า', friends: 'รายชื่อเพื่อน' };
  function statTiles(p) {
    const f = p.fields || {};
    const t = [];
    if (f.level) t.push(['star', `LV.${f.level.level}`, 'Account Level']);
    if (f.vocab) t.push(['book-open', fmt(f.vocab.knownWords), 'คำศัพท์ที่รู้']);
    if (f.grammar) t.push(['pencil-line', fmt(f.grammar.masteredTopics), 'แกรมม่าที่เชี่ยวชาญ']);
    if (f.toeic) t.push(['headphones', f.toeic.accuracy === null ? '—' : `${f.toeic.accuracy}%`, `TOEIC (${fmt(f.toeic.answered)} ข้อ)`]);
    if (f.stats) t.push(['target', f.stats.accuracy30d === null ? '—' : `${f.stats.accuracy30d}%`, `ความแม่นยำ 30 วัน · ${f.stats.activeDays30d} วันที่เรียน`]);
    if (f.achievements) t.push(['award', `${f.achievements.unlocked.length}/${f.achievements.total}`, 'Achievements']);
    if (f.coins) t.push(['coins', fmt(f.coins.balance), 'Coin']);
    if (f.inventory) t.push(['shirt', fmt(f.inventory.count), 'ของตกแต่งที่มี']);
    return t;
  }
  const tilesHtml = (t) => `<div class="st-grid">${t.map(([ic, v, l]) => `<div class="st-tile">${ICON(ic, 'icon')}<b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  const MODE_TH = { vocab: 'คำศัพท์', grammar: 'แกรมม่า' };
  const ranksHtml = (ranks) => (ranks && ranks.length ? `<h2 class="av-h2">${ICON('trophy', 'icon icon-sm')} แรงค์ซีซันนี้</h2><ul class="pl-ranks">${ranks.map((r) => `<li>
      <img class="rk-badge" src="/assets/ranks/${encodeURIComponent(r.league)}/badge-96.webp" alt="" width="36" height="36" loading="lazy">
      <span><b>${esc(r.label)}</b><small>โหมด${esc(MODE_TH[r.mode] || r.mode)}</small></span></li>`).join('')}</ul>` : '');
  async function openStats() {
    const el = root('stats');
    App().showScreen('screen-stats'); setHash('stats');
    loading(el);
    try {
      const p = await api('/profile/me');
      el.innerHTML = `${topBar('สถิติของฉัน', 'สรุปความก้าวหน้าจากการเรียนจริง (เห็นเฉพาะคุณ — คนอื่นเห็นตามการตั้งค่าความเป็นส่วนตัว)')}
        ${tilesHtml(statTiles(p))}${ranksHtml(p.fields.rank)}
        <button class="home-link" type="button" data-av-nav="privacy">${ICON('shield-check')}<span>ตั้งค่าความเป็นส่วนตัว</span>${ICON('chevron-right')}</button>`;
      bindNav(el); focusTitle(el);
    } catch (err) { errorBox(el, err, openStats); }
  }

  function confirmDialog(title, text, ok) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card av-dialog"><h2>${esc(title)}</h2><p class="page-sub">${esc(text)}</p>
        <div class="av-dialog-actions"><button class="btn btn-primary up-danger" type="button" data-ok>${esc(ok)}</button><button class="btn btn-secondary" type="button" data-no>ยกเลิก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: title });
      let done = false;
      const fin = (v) => { if (done) return; done = true; ov.remove(); resolve(v); };
      ov.querySelector('[data-ok]').addEventListener('click', () => fin(true));
      ov.querySelector('[data-no]').addEventListener('click', () => fin(false));
      const obs = new MutationObserver(() => { if (!document.body.contains(ov)) { obs.disconnect(); fin(false); } });
      obs.observe(document.body, { childList: true });
      ov.querySelector('[data-no]').focus();
    });
  }
  /** เปิดโปรไฟล์ผู้ใช้อื่น (route #/user/:id) */
  function openPlayer(uid) {
    if (!(uid > 0)) return;
    location.hash = `#/user/${Number(uid)}`;
  }
  let userStage = null;
  async function openUser(uid) {
    const el = root('user');
    App().showScreen('screen-user');
    const want = `#/user/${uid}`; if (location.hash !== want) history.replaceState(null, '', want);
    if (userStage) { userStage.dispose(); userStage = null; }
    loading(el);
    try {
      await loadCatalog();
      const p = await api(`/profile/${uid}`);
      renderUser(el, p);
      focusTitle(el);
    } catch (err) {
      if (err.status === 404) { el.innerHTML = `${topBar('ไม่พบผู้ใช้', '', { back: 'friends', backLabel: 'เพื่อน' })}<p class="page-sub">ผู้ใช้นี้ไม่มีอยู่ หรือไม่สามารถดูได้</p>`; bindNav(el); return; }
      errorBox(el, err, () => openUser(uid));
    }
  }
  function userPic(p) {
    if (p.picture.useAvatar && p.picture.look) {
      return p.picture.look.thumb ? `<img class="avatar-img" src="${esc(p.picture.look.thumb)}" alt="">` : render(p.picture.look.outfit, 'head', { cls: 'avatar-svg' });
    }
    return window.EQG.avatar(p.picture.avatar, p.picture.avatarImage);
  }
  function renderUser(el, p) {
    const a = p.actions || {};
    const rel = p.isSelf ? 'คุณ' : p.relation === 'friend' ? 'เพื่อน' : '';
    const hiddenTxt = (p.hidden || []).map((k) => FIELD_TH[k]).filter(Boolean);
    el.innerHTML = `${topBar(p.username, '', { back: 'friends', backLabel: 'เพื่อน' })}
      <div class="up-head"><span class="up-pic">${userPic(p)}</span>
        <div><h2 class="up-name">${esc(p.username)}</h2>${rel ? `<span class="av-state st-equipped">${esc(rel)}</span>` : ''}
          ${p.fields && p.fields.level ? `<p class="profile-level">เลเวล ${p.fields.level.level}</p>` : ''}</div></div>
      ${p.isSelf ? '' : `<div class="up-actions">
        ${a.addFriend ? `<button class="btn btn-primary" type="button" data-up="add">${ICON('user-plus', 'icon icon-sm')} เพิ่มเพื่อน</button>` : ''}
        ${a.friendRequestsClosed ? `<span class="av-state">${ICON('lock', 'icon icon-xs')} ไม่รับคำขอเป็นเพื่อน</span>` : ''}
        ${a.cancelRequest ? `<button class="btn btn-secondary" type="button" data-up="cancel">${ICON('x', 'icon icon-sm')} ยกเลิกคำขอ</button>` : ''}
        ${a.acceptRequest ? `<button class="btn btn-primary" type="button" data-up="accept">${ICON('user-check', 'icon icon-sm')} ตอบรับเป็นเพื่อน</button>` : ''}
        ${a.removeFriend ? `<button class="btn btn-secondary" type="button" data-up="remove">${ICON('user-x', 'icon icon-sm')} เลิกเป็นเพื่อน</button>` : ''}
        ${a.block ? `<button class="btn btn-secondary up-danger" type="button" data-up="block">${ICON('ban', 'icon icon-sm')} บล็อก</button>` : ''}
        ${a.unblock ? `<button class="btn btn-secondary" type="button" data-up="unblock">${ICON('shield-off', 'icon icon-sm')} ปลดบล็อก</button>` : ''}
      </div>`}
      ${p.blocked ? `<div class="up-private">${ICON('ban', 'icon icon-lg')}<p>คุณบล็อกผู้ใช้นี้อยู่ — ปลดบล็อกเพื่อดูโปรไฟล์ตามที่เจ้าของอนุญาต</p></div>`
        : p.private ? `${p.fields.avatar ? `<section class="home-card up-show"><h2 class="home-card-title">${ICON('wand-sparkles', 'icon')} Avatar Showcase</h2><div class="pf-av-stage" id="up-stage">${render(p.fields.avatar.outfit, 'full', { label: `Avatar ของ ${p.username}` })}</div></section>` : ''}
          <div class="up-private">${ICON('lock', 'icon icon-lg')}<p>${p.fields.avatar ? 'ข้อมูลอื่นในโปรไฟล์เป็นส่วนตัว' : 'ผู้ใช้นี้ตั้งค่าโปรไฟล์เป็นส่วนตัว'}</p></div>`
        : `${p.fields.avatar ? `<section class="home-card up-show"><h2 class="home-card-title">${ICON('wand-sparkles', 'icon')} Avatar Showcase</h2><div class="pf-av-stage" id="up-stage">${render(p.fields.avatar.outfit, 'full', { label: `Avatar ของ ${p.username}` })}</div></section>` : ''}
          ${statTiles(p).length ? tilesHtml(statTiles(p)) : ''}
          ${ranksHtml(p.fields.rank)}
          ${p.fields.achievements ? `<h2 class="av-h2">${ICON('award', 'icon icon-sm')} Achievements</h2><ul class="pl-achs">${p.fields.achievements.unlocked.map((x) => `<li>${ICON(ACH_ICON[x.icon] || 'award', 'icon icon-sm')}<span>${esc(x.nameTh)}</span></li>`).join('') || '<li class="av-empty">ยังไม่มี</li>'}</ul>` : ''}
          ${p.fields.friends ? `<h2 class="av-h2">${ICON('users', 'icon icon-sm')} เพื่อน (${p.fields.friends.count})</h2><ul class="up-friends">${p.fields.friends.list.map((f) => `<li><button type="button" class="link-btn" data-profile-uid="${f.id}">${esc(f.username)}</button></li>`).join('')}</ul>` : ''}
          ${hiddenTxt.length && !p.isSelf ? `<p class="up-hidden">${ICON('eye-off', 'icon icon-xs')} เจ้าของซ่อนไว้: ${esc(hiddenTxt.join(' · '))}</p>` : ''}`}
      ${p.isSelf ? `<button class="home-link" type="button" data-av-nav="privacy">${ICON('shield-check')}<span>ตั้งค่าความเป็นส่วนตัว (คนอื่นเห็นอะไรบ้าง)</span>${ICON('chevron-right')}</button>` : ''}`;
    bindNav(el);
    const box = el.querySelector('#up-stage');
    if (box && want3D()) userStage = mountStage(box, p.fields.avatar.outfit, { label: `Avatar ของ ${p.username}`, colors: p.fields.avatar.colors || {} });
    el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.up;
      if (k === 'block' && !(await confirmDialog(`บล็อก ${p.username}?`, 'จะเลิกเป็นเพื่อน และอีกฝ่ายจะส่งคำขอเป็นเพื่อนหรือดูโปรไฟล์ของคุณไม่ได้ (ปลดบล็อกได้ภายหลัง)', 'บล็อก'))) return;
      b.disabled = true;
      try {
        if (k === 'add') await api('/friends/request', { method: 'POST', body: { userId: p.id } });
        else if (k === 'cancel' || k === 'remove') await api(`/friends/${a.friendshipId}`, { method: 'DELETE' });
        else if (k === 'accept') await api(`/friends/${a.friendshipId}/accept`, { method: 'POST' });
        else if (k === 'block') await api(`/friends/block/${p.id}`, { method: 'POST' });
        else if (k === 'unblock') await api(`/friends/block/${p.id}`, { method: 'DELETE' });
        toast({ add: 'ส่งคำขอเป็นเพื่อนแล้ว', cancel: 'ยกเลิกคำขอแล้ว', remove: 'เลิกเป็นเพื่อนแล้ว', accept: 'เป็นเพื่อนกันแล้ว', block: 'บล็อกแล้ว', unblock: 'ปลดบล็อกแล้ว' }[k], 'success');
        openUser(p.id);
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    }));
  }

  // ---------- Privacy Settings (#/privacy) ----------
  const LEVEL_TH = { private: 'ฉันเท่านั้น', friends: 'เพื่อน', public: 'ทุกคน' };
  async function openPrivacy() {
    const el = root('privacy');
    App().showScreen('screen-privacy'); setHash('privacy');
    loading(el);
    try {
      const d = await api('/privacy');
      const seg = (k, v) => `<div class="pv-seg" role="radiogroup" aria-label="${esc(d.fields.find((f) => f.key === k).th)}">${d.levels.map((l) => `
        <label class="pv-opt"><input type="radio" name="pv-${k}" value="${l}" ${v === l ? 'checked' : ''}><span>${LEVEL_TH[l]}</span></label>`).join('')}</div>`;
      el.innerHTML = `${topBar('ความเป็นส่วนตัว', 'เลือกว่าใครเห็นข้อมูลแต่ละอย่าง — ค่าเริ่มต้นเปิดเผยน้อยที่สุดเท่าที่จำเป็น · อีเมลและข้อมูลส่วนตัวไม่แสดงให้ใครเห็นเลย')}
        <ul class="pv-list">${d.fields.map((f) => `<li class="pv-row"><div><b>${esc(f.th)}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>${seg(f.key, d.settings[f.key])}</li>`).join('')}
          ${d.flags.map((f) => `<li class="pv-row"><label class="pv-flag"><input type="checkbox" data-flag="${f.key}" ${d.settings[f.key] ? 'checked' : ''}><span><b>${esc(f.th)}</b></span></label></li>`).join('')}</ul>
        <p class="pv-note">${ICON('info', 'icon icon-xs')} รูปที่แสดง (รูปโปรไฟล์เดิม หรือ Avatar) ตั้งได้ที่หน้าโปรไฟล์ · Leaderboard/Ranked ยังแสดงชื่อและคะแนนแข่งขันตามปกติ · ผู้ที่ถูกบล็อกจะไม่เห็นโปรไฟล์ของคุณ</p>
        <button class="home-link" type="button" data-pv-preview>${ICON('eye')}<span>ดูโปรไฟล์ของฉันแบบที่คนอื่นเห็น</span>${ICON('chevron-right')}</button>`;
      bindNav(el);
      el.querySelector('[data-pv-preview]').addEventListener('click', () => openPlayer(App().user.id));
      el.addEventListener('change', async (e) => {
        const r = e.target;
        let patch = null;
        if (r.matches('.pv-opt input')) patch = { [r.name.slice(3)]: r.value };
        else if (r.matches('[data-flag]')) patch = { [r.dataset.flag]: r.checked };
        if (!patch) return;
        try { await api('/privacy', { method: 'PUT', body: patch }); toast('บันทึกแล้ว', 'success'); } catch (err) { toast(err.message, 'error'); openPrivacy(); }
      });
      focusTitle(el);
    } catch (err) { errorBox(el, err, openPrivacy); }
  }

  // =====================================================================
  // Profile (ส่วนหัว + เมนู) — เรียกจาก openProfile ใน app.js
  // =====================================================================
  /** รูปประจำตัวของฉันตามการตั้งค่า (รูปโปรไฟล์เดิม หรือ Avatar) */
  function identityHtml() {
    const u = App().user;
    if (!S.me.avatarEnabled) return `<span class="pl-legacy">${window.EQG.avatar(u.avatar, u.avatarImage || null)}</span>`;
    return render(S.me.outfit, 'full', { idle: true, label: `Avatar ของ ${u.username}` });
  }
  let pfStage = null; let pfIO = null;
  async function renderProfile() {
    const hero = document.getElementById('profile-avatar-lg');
    const extra = document.getElementById('profile-hero-extra');
    const sc = document.getElementById('profile-showcase');
    if (!hero) return;
    try {
      await loadMe();
      const u = App().user;
      hero.innerHTML = identityHtml();
      hero.classList.toggle('is-avatar', S.me.avatarEnabled);
      hero.setAttribute('aria-label', S.me.avatarEnabled ? `รูปโปรไฟล์: Avatar ของ ${u.username}` : `รูปโปรไฟล์ของ ${u.username}`);
      if (extra) { extra.innerHTML = `<button class="coin-btn" type="button" data-av-nav="coins" aria-label="Coin ${fmt(S.balance)} — ดูประวัติ Coin">${coinChip()}</button>`; bindNav(extra); }
      if (sc) {
        if (pfStage) { pfStage.dispose(); pfStage = null; }
        if (pfIO) { pfIO.disconnect(); pfIO = null; }
        sc.innerHTML = `<h2 class="home-card-title" id="pf-showcase-title">${ICON('wand-sparkles', 'icon')} Avatar ของฉัน</h2>
          <p class="home-card-sub">${S.me.avatarEnabled ? 'ตอนนี้ใช้ Avatar เป็นรูปโปรไฟล์' : 'ตอนนี้ใช้รูปโปรไฟล์เดิม — คนอื่นยังไม่เห็น Avatar ของคุณจนกว่าคุณจะเลือก "ใช้ Avatar ของฉัน"'}</p>
          <div class="pf-showcase-body">
            <div><div class="pf-av-stage" id="pf-av-stage">${render(S.me.outfit, 'full', { label: 'Avatar ของฉัน' })}</div></div>
            <div class="pf-showcase-side">${displayPrefHtml()}</div>
          </div>`;
        sc.classList.remove('hidden');
        bindNav(sc);
        bindDisplayPref(sc, () => renderProfile());
        // 3D viewer สร้างเมื่อเลื่อนมาเห็นการ์ดเท่านั้น (ไม่กินแบต/หน่วยความจำตอนเปิดหน้า)
        const box = sc.querySelector('#pf-av-stage');
        const start = () => { if (!pfStage && document.contains(box)) pfStage = mountStage(box, S.me.outfit, { label: 'Avatar ของฉัน', anim: 'wave', colors: S.me.colors || {} }); };
        if (want3D() && 'IntersectionObserver' in window) {
          pfIO = new IntersectionObserver((en) => { if (en[0].isIntersecting) { pfIO.disconnect(); pfIO = null; start(); } }, { rootMargin: '120px' });
          pfIO.observe(box);
        }
      }
      const pr = document.getElementById('profile-progress');
      if (pr) {
        const p = await api('/profile/me');
        const ach = p.fields.achievements ? p.fields.achievements.unlocked : [];
        pr.innerHTML = `<h2 class="home-card-title">${ICON('chart-column', 'icon')} ความก้าวหน้า</h2>
          <div class="st-grid st-grid-sm">${statTiles(p).filter((x) => ['book-open', 'pencil-line', 'headphones', 'target'].includes(x[0])).map(([ic, v, l]) => `<div class="st-tile">${ICON(ic, 'icon')}<b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>
          ${ach.length ? `<div class="pf-achs"><span>${ICON('award', 'icon icon-sm')} ล่าสุด:</span>${ach.slice(-3).map((a) => `<span class="pf-ach">${esc(a.nameTh)}</span>`).join('')}</div>` : ''}`;
        pr.classList.remove('hidden');
      }
    } catch (_) { /* คงรูปเดิม */ }
  }

  // =====================================================================
  // Admin: จัดการของตกแต่ง (ใช้สิทธิ์ผู้ดูแลเดิม · /api/admin/avatar)
  // =====================================================================
  async function mountAdmin() {
    const box = document.getElementById('admin-avatar-root');
    if (!box) return;
    loading(box);
    try {
      const [d] = await Promise.all([api('/admin/avatar'), loadCatalog(true), S.me ? null : loadMe()]);
      const sel = (name, opts, v) => `<select name="${name}">${opts.map(([k, t]) => `<option value="${esc(k)}"${String(v ?? '') === String(k) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      const achOpts = [['', '— ไม่มี —'], ...d.achievements.map((a) => [a.id, a.name])];
      box.innerHTML = `<p class="gl-note">${d.items.length} ชิ้น · แก้ราคา/rarity/เปิด-ปิดได้ทันที · ภาพใหม่ต้องเป็น canvas 240×320 (โปร่งใส) ตำแหน่งเดียวกับชิ้นอื่น · PNG/WebP/SVG ไม่เกิน 150KB</p>
        <form class="adm-av-new" id="adm-av-new"><b>เพิ่มของใหม่</b>
          <div class="adm-av-row" style="grid-template-columns:120px 1fr"><div class="adm-av-prev" id="adm-av-prev">${render(S.me.outfit, 'full')}</div>
          <div style="display:grid;gap:6px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
            <label>รหัส (a-z 0-9 _)<input name="id" required pattern="[a-z0-9_]{3,40}"></label>
            <label>หมวด${sel('slot', d.slots.map((x) => [x, CAT_BY[x] ? CAT_BY[x].th : x]), 'hat')}</label>
            <label>ชื่อ (EN)<input name="name" required maxlength="60"></label><label>ชื่อไทย<input name="nameTh" maxlength="60"></label>
            <label>ราคา<input name="price" type="number" min="0" max="100000" value="100"></label>
            <label>Rarity${sel('rarity', d.rarities.map((r) => [r, RARITY[r]]), 'common')}</label>
            <label>Achievement${sel('achievementId', achOpts, '')}</label><label>Event id<input name="eventId" maxlength="40"></label>
            <label>ภาพ<input name="file" type="file" accept="image/png,image/webp,image/svg+xml" required></label>
            <button class="btn btn-primary" type="submit">เพิ่ม (ปิดไว้ก่อน)</button></div></div></form>
        <div class="adm-av-list">${d.items.map((it) => `<div class="adm-av-row"><img src="${esc(it.thumbnailUrl)}" alt="" loading="lazy">
          <form data-adm-item="${esc(it.id)}" class="${it.active ? '' : 'is-off'}">
            <label>${esc(it.id)}<input name="name" value="${esc(it.name)}" maxlength="60"></label>
            <label>ราคา<input name="price" type="number" min="0" value="${it.price}"></label>
            <label>Rarity${sel('rarity', d.rarities.map((r) => [r, RARITY[r]]), it.rarity)}</label>
            <label>Achievement${sel('achievementId', achOpts, it.achievementId || '')}</label>
            <label>Event<input name="eventId" value="${esc(it.eventId || '')}" maxlength="40"></label>
            <label><span>เปิดใช้ / ขาย / แนะนำ</span><span><input type="checkbox" name="active" ${it.active ? 'checked' : ''} aria-label="เปิดใช้">
              <input type="checkbox" name="purchasable" ${it.purchasable ? 'checked' : ''} aria-label="วางขาย">
              <input type="checkbox" name="featured" ${it.featured ? 'checked' : ''} aria-label="แนะนำ"></span></label>
            <button class="mini-btn" type="submit">บันทึก</button><small>ขายแล้ว ${it.sold}</small></form></div>`).join('')}</div>`;
      box.querySelectorAll('[data-adm-item]').forEach((f) => f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = new FormData(f);
        try {
          await api(`/admin/avatar/${encodeURIComponent(f.dataset.admItem)}`, { method: 'PUT', body: {
            name: v.get('name'), price: Number(v.get('price')), rarity: v.get('rarity'), achievementId: v.get('achievementId') || null,
            eventId: v.get('eventId') || null, active: v.get('active') === 'on', purchasable: v.get('purchasable') === 'on', featured: v.get('featured') === 'on' } });
          f.classList.toggle('is-off', v.get('active') !== 'on'); toast('บันทึกแล้ว', 'success'); loadCatalog(true).catch(() => {});
        } catch (err) { toast(err.message, 'error'); }
      }));
      const nf = box.querySelector('#adm-av-new');
      let uploaded = null;
      const preview = () => {
        if (!uploaded) return;
        const slot = nf.slot.value;
        const ref = S.cat.find((x) => x.slot === slot);
        const z = ref ? (ref.parts.find((p) => p.kind === 'front') || ref.parts[0]).z : 50;
        S.byId.__preview = { id: '__preview', slot, parts: [{ kind: 'front', z, url: uploaded }] };
        box.querySelector('#adm-av-prev').innerHTML = render({ ...S.me.outfit, [slot]: '__preview' }, 'full', { label: 'ตัวอย่าง Layer' });
      };
      nf.file.addEventListener('change', () => {
        const file = nf.file.files[0];
        if (!file) return;
        if (file.size > 150 * 1024) { toast('ไฟล์ใหญ่เกิน 150KB', 'error'); nf.file.value = ''; return; }
        const rd = new FileReader();
        rd.onload = async () => {
          try { uploaded = (await api('/admin/avatar/upload', { method: 'POST', body: { dataUrl: rd.result } })).url; preview(); } catch (err) { toast(err.message, 'error'); }
        };
        rd.readAsDataURL(file);
      });
      nf.slot.addEventListener('change', preview);
      nf.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!uploaded) { toast('อัปโหลดภาพก่อน', 'error'); return; }
        const v = new FormData(nf);
        try {
          await api('/admin/avatar', { method: 'POST', body: { id: v.get('id'), slot: v.get('slot'), name: v.get('name'), nameTh: v.get('nameTh'), price: Number(v.get('price')),
            rarity: v.get('rarity'), achievementId: v.get('achievementId') || null, eventId: v.get('eventId') || null, assetUrl: uploaded, active: false } });
          toast('เพิ่มแล้ว (ปิดไว้ — ตรวจแล้วติ๊ก "เปิดใช้")', 'success'); delete S.byId.__preview; mountAdmin();
        } catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { box.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
  }

  // ---------------------------------------------------------------
  // Router / init
  // ---------------------------------------------------------------
  function open(view, param) {
    loadCatalog().catch(() => {});
    switch (view) {
      case 'wardrobe': return openWardrobe();
      case 'shop': return openShop();
      case 'coins': return openCoins();
      case 'achievements': return openAchievements();
      case 'stats': return openStats();
      case 'privacy': return openPrivacy();
      case 'user': return openUser(Number(param));
      default: return openEditor();
    }
  }
  let started = false;
  function start() {
    if (!App() || !App().user) return;
    if (started) { hydrate(); return; }   // เรียกซ้ำได้ (app.js + ตอนสคริปต์นี้โหลด) — เริ่มครั้งเดียว
    started = true;
    loadCatalog().then(() => hydrate()).catch(() => { started = false; });
    observer.observe(document.body, { childList: true, subtree: true });
    checkCoins(1200);
    const chip = document.getElementById('hud-coins');
    if (chip && !chip.dataset.bound) { chip.dataset.bound = '1'; chip.addEventListener('click', () => App().navigateTo('shop')); }
  }
  // เปลี่ยนหน้า -> ตรวจรางวัล Coin ที่เพิ่งได้ (หลังจบบทเรียน/เกม) · ออกจากร้าน = ยกเลิกการลองสวม
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pf-public]') && App().user) openPlayer(App().user.id); });
  window.addEventListener('eq:screen', (e) => {
    const id = e.detail && e.detail.id;
    if (id !== 'screen-shop') SH.preview = null;
    // ออกจากหน้า -> ปิด 3D viewer ของหน้านั้น (คืน GPU/หน่วยความจำ · ไม่ render เบื้องหลัง)
    stages.forEach((st) => { const scr = st.box.closest('.screen'); if (!scr || scr.id !== id) st.dispose(); });
    if (App() && App().user) checkCoins(900);
  });

  // ส่วนที่ติดจอ (แถบหมวด / viewer) ต้องติด "ใต้" แถบ HUD ด้านบน (HUD เป็น sticky) — ไม่งั้นถูก HUD ทับตอนเลื่อน
  (function trackHud() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    const set = () => { const cs = getComputedStyle(hud); const pinned = cs.position === 'sticky' || cs.position === 'fixed';
      document.documentElement.style.setProperty('--eq-hud-h', `${pinned && hud.offsetParent !== null ? hud.offsetHeight : 0}px`); };
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(hud);
    window.addEventListener('resize', set);
  }());
  // ---------- ใช้จากหน้าอื่น (เช่น เทศกาลฮาโลวีน): ตัวอย่างชุด · สวมทันที · ภาพย่อ ----------
  /** แสดงตัวละครของฉัน "ลองสวม" itemIds (ไม่บันทึก) ใน box — คืน stage (มี dispose/set/play) */
  async function previewItems(box, itemIds, o = {}) {
    await loadMe();
    let outfit = { ...S.me.outfit };
    const notes = [];
    for (const id of itemIds) { const it = S.byId[id]; if (!it) continue; const r = equipInto(outfit, it); outfit = r.outfit; if (r.note) notes.push(r.note); }
    const st = mountStage(box, outfit, { label: o.label || 'ตัวอย่างชุด', controls: o.controls !== false, anim: o.anim });
    st.notes = notes;
    return st;
  }
  /** สวมของที่มีแล้ว (บันทึกจริง ผ่าน /avatar/equip — ตรวจความเป็นเจ้าของ/ชุดชนกันที่เซิร์ฟเวอร์) */
  async function equipItems(itemIds) {
    let r = null;
    for (const id of itemIds) {
      const it = S.byId[id] || (await loadCatalog(true), S.byId[id]);
      if (!it) continue;
      r = await api('/avatar/equip', { method: 'POST', body: { slot: it.slot, itemId: id } });
    }
    if (r) { S.me = S.me || {}; S.me.outfit = r.outfit; S.me.avatarThumbnail = null; setMyLook(); }
    return r;
  }
  const itemThumb = (id) => { const it = S.byId && S.byId[id]; return it ? (it.model && it.model.thumbnailUrl) || it.thumbnailUrl : null; };
  const itemInfo = (id) => (S.byId && S.byId[id]) || null;

  window.EQAvatar = { previewItems, equipItems, itemThumb, itemInfo, _stages: () => [...stages], _shop: () => ({ preview: SH.preview && SH.preview.id, forced2D: SH.forced2D }), open, start, render, hydrate, checkCoins, renderProfile, openPlayer, loadCatalog, mountAdmin, get balance() { return S.balance; } };
  // v1.10.0: แก้ race — app.js เรียก EQAvatar.start() ตอนเข้าแอป แต่ถ้า /auth/me ตอบก่อนสคริปต์นี้โหลดเสร็จ การเรียกนั้นหายไป
  // (Avatar ในรายชื่อ · ลิงก์โปรไฟล์ · ชิป Coin ไม่ทำงานทั้ง session) → เริ่มเองถ้าแอปแสดงอยู่แล้ว
  if (App() && App().user && !document.getElementById('app-shell').classList.contains('hidden')) start();
}());
