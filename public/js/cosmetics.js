/*
  v1.21.0 กรอบโปรไฟล์ / กรอบแชท / รางวัลทุก 10 เลเวล — หน้า #/frames (แท็บ: กรอบโปรไฟล์ · กรอบแชท · รางวัลเลเวล)
  - ราคา/สถานะทั้งหมดมาจากเซิร์ฟเวอร์ (/api/cosmetics) · ทุกข้อความผ่าน esc
  - กรอบที่ใส่แล้วแสดงทุกที่ผ่าน EQAvatar (looks.pframe / looks.cframe)
  - window.EQCos: open(tab) · checkPending({ toast }) — แจ้ง "มีรางวัลเลเวลรอรับ" หลังเลเวลอัป/เข้าแอป
*/
(function () {
  'use strict';
  const App = () => window.EQApp;
  const esc = (s) => App().escapeHtml(String(s === null || s === undefined ? '' : s));
  const ICON = (n, c = 'icon') => (window.EQG && window.EQG.icon ? window.EQG.icon(n, c) : '');
  const api = (p, o) => App().api(p, o);
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const coinIco = '<img class="coin-ico" src="/assets/coin/coin-sm.svg" alt="" aria-hidden="true" width="18" height="18">';
  const TABS = [
    { id: 'pframe', th: 'กรอบโปรไฟล์', icon: 'frame' },
    { id: 'cframe', th: 'กรอบแชท', icon: 'message-square' },
    { id: 'levels', th: 'รางวัลเลเวล', icon: 'gift' },
  ];
  const S = { data: null, levels: null, tab: 'pframe', sel: { pframe: null, cframe: null }, busy: false };

  function ensureSprite() {
    if (document.getElementById('eq-frames-sprite')) return Promise.resolve();
    return fetch('/assets/frames/frames.svg').then((r) => r.text()).then((t) => {
      if (document.getElementById('eq-frames-sprite')) return;
      const box = document.createElement('div');
      box.id = 'eq-frames-sprite'; box.setAttribute('aria-hidden', 'true'); box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;'; box.innerHTML = t;
      document.body.prepend(box);
    }).catch(() => {});
  }
  const ov = (id, cls = 'cos-ov') => (id ? `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#${esc(id)}"></use></svg>` : '');
  /** รูปตัวอย่างทั่วไป (ใช้ในการ์ดของ) — ไม่ใช่รูปของใคร */
  const DUMMY = '<svg class="cos-dummy" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="var(--cos-dummy-bg)"/><circle cx="32" cy="26" r="12" fill="var(--cos-dummy-fg)"/><rect x="12" y="41" width="40" height="30" rx="15" fill="var(--cos-dummy-fg)"/></svg>';

  /* ---------------- ข้อมูล ---------------- */
  async function load() {
    const [d, lv] = await Promise.all([api('/cosmetics'), api('/cosmetics/level-rewards')]);
    S.data = d; S.levels = lv;
    for (const k of ['pframe', 'cframe']) if (!S.sel[k] || !d.items.some((x) => x.id === S.sel[k])) S.sel[k] = d.equipped[k] || null;
    setBadges(lv.claimable);
  }
  function setBadges(n) {
    document.querySelectorAll('[data-cos-badge]').forEach((b) => { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hidden', !(n > 0)); });
  }

  /* ---------------- หน้าจอ ---------------- */
  async function open(tab) {
    const root = document.getElementById('screen-frames-root');
    if (!root) return;
    if (tab && TABS.some((t) => t.id === tab)) S.tab = tab;
    if (location.hash !== '#/frames') history.replaceState(null, '', '#/frames');
    App().showScreen('screen-frames');
    root.innerHTML = '<p class="cos-loading" role="status">กำลังโหลด…</p>';
    await ensureSprite();
    try { await load(); } catch (err) {
      root.innerHTML = `<p class="cos-error" role="alert">${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-cos-retry>ลองอีกครั้ง</button>`;
      return;
    }
    render();
  }
  function itemsOf(kind) { return S.data.items.filter((x) => x.kind === kind); }
  function render() {
    const root = document.getElementById('screen-frames-root');
    if (!root || !S.data) return;
    const d = S.data;
    root.innerHTML = `
      <div class="cos-top"><button class="game-exit gl-back" type="button" data-cos-back>${ICON('arrow-left', 'icon icon-sm')} ย้อนกลับ</button>
        <span class="cos-coin" aria-label="Coin ${fmt(d.balance)}">${coinIco}<b>${fmt(d.balance)}</b></span></div>
      <header class="cos-head"><h1 class="page-title">กรอบโปรไฟล์และกรอบแชท</h1>
        <p class="page-sub">ตกแต่งรูปโปรไฟล์และฟองข้อความแชท · ทุกคนเห็นกรอบที่คุณใส่ · ไม่มีผลกับ EXP หรือคะแนน · ตอนนี้คุณเลเวล ${fmt(d.level)}</p></header>
      <nav class="cos-tabs" role="tablist" aria-label="หมวดกรอบ">${TABS.map((t) => `<button type="button" role="tab" id="cos-tab-${t.id}" aria-selected="${S.tab === t.id}" aria-controls="cos-panel" data-cos-tab="${t.id}">${ICON(t.icon, 'icon icon-sm')}<span>${t.th}</span>${t.id === 'levels' ? `<span class="nav-badge${S.levels.claimable ? '' : ' hidden'}" data-cos-badge>${S.levels.claimable}</span>` : ''}</button>`).join('')}</nav>
      <section id="cos-panel" role="tabpanel" aria-labelledby="cos-tab-${S.tab}">${S.tab === 'levels' ? levelsHtml() : shopHtml(S.tab)}</section>`;
    if (S.tab !== 'levels' && window.EQAvatar && window.EQAvatar.hydrate) window.EQAvatar.hydrate(root);
  }

  function previewHtml(kind) {
    const me = App().user || {};
    const G = window.EQG;
    const sel = S.sel[kind];
    if (kind === 'pframe') {
      return `<div class="cos-prev"><span class="cos-prev-pic">${G ? G.avatar(me.avatar, me.avatarImage || null, '', me.id) : ''}${ov(sel)}</span>
        <div class="cos-prev-txt"><b>${esc(me.username || '')}</b><small>${sel ? esc(byId(sel).nameTh) : 'ไม่ใส่กรอบ'}</small></div></div>`;
    }
    return `<div class="cos-prev cos-prev-chat">
      <div class="cos-bubble theirs"><span>Hi! Want to play Draw &amp; Guess?</span></div>
      <div class="cos-bubble mine${sel ? ' has-cf' : ''}"${sel ? ` data-cf="${esc(sel)}"` : ''}><span>Sure! Let's go!</span></div>
      <small class="cos-prev-note">${sel ? esc(byId(sel).nameTh) : 'ไม่ใส่กรอบ'} · ใช้กับแชทโลกและแชทเพื่อน</small></div>`;
  }
  const byId = (id) => S.data.items.find((x) => x.id === id) || { nameTh: id };
  function thumb(it) {
    if (it.kind === 'pframe') return `<span class="cos-thumb-pic">${DUMMY}${ov(it.id)}</span>`;
    return `<span class="cos-thumb-chat has-cf" data-cf="${esc(it.id)}"><span>Hello!</span></span>`;
  }
  function stateOf(it) {
    const eq = S.data.equipped[it.kind] === it.id;
    if (eq) return { tag: 'ใส่อยู่', cls: 'is-eq' };
    if (it.owned) return { tag: it.via === 'level' ? 'ได้จากเลเวล' : 'มีแล้ว', cls: 'is-own' };
    if (it.source === 'level') return { tag: `เลเวล ${it.level}`, cls: 'is-lock', lock: true };
    return { tag: `${coinIco}${fmt(it.price)}`, cls: 'is-price', html: true };
  }
  function shopHtml(kind) {
    const list = itemsOf(kind);
    const shop = list.filter((x) => x.source === 'shop');
    const lv = list.filter((x) => x.source === 'level');
    const card = (it) => {
      const st = stateOf(it);
      return `<button type="button" class="cos-card ${st.cls}${S.sel[kind] === it.id ? ' is-sel' : ''}" role="listitem" data-cos-pick="${esc(it.id)}" aria-pressed="${S.sel[kind] === it.id}"
        aria-label="${esc(it.nameTh)} · ${esc(it.rarityTh)} · ${esc(st.html ? `${it.price} Coin` : st.tag)}">
        ${thumb(it)}<span class="cos-name">${esc(it.nameTh)}</span>
        <span class="cos-rar r-${esc(it.rarity)}">${esc(it.rarityTh)}</span>
        <span class="cos-st">${st.lock ? ICON('lock', 'icon icon-xs') : ''}${st.html ? st.tag : esc(st.tag)}</span></button>`;
    };
    return `<div class="cos-layout">
      <aside class="cos-side">${previewHtml(kind)}${actionHtml(kind)}</aside>
      <div class="cos-main">
        <h2 class="cos-h2">${ICON('store', 'icon icon-sm')} ร้านค้า</h2>
        <div class="cos-grid" role="list">${shop.map(card).join('')}</div>
        <h2 class="cos-h2">${ICON('gift', 'icon icon-sm')} รางวัลเลเวล <small>ซื้อไม่ได้ · ได้เมื่อถึงเลเวล</small></h2>
        <div class="cos-grid" role="list">${lv.map(card).join('')}</div>
      </div></div>`;
  }
  function actionHtml(kind) {
    const id = S.sel[kind];
    const eqId = S.data.equipped[kind];
    if (!id) {
      return `<div class="cos-act">${eqId ? '' : `<p class="cos-hint">แตะกรอบเพื่อดูตัวอย่าง</p>`}
        ${eqId ? `<button class="btn btn-secondary btn-block" type="button" data-cos-equip="">${ICON('x', 'icon icon-sm')} ถอดกรอบ</button>` : ''}</div>`;
    }
    const it = byId(id);
    let btn;
    if (eqId === id) btn = `<button class="btn btn-secondary btn-block" type="button" data-cos-equip="">${ICON('x', 'icon icon-sm')} ถอดกรอบ</button>`;
    else if (it.owned) btn = `<button class="btn btn-primary btn-block" type="button" data-cos-equip="${esc(id)}">${ICON('check', 'icon icon-sm')} ใส่กรอบนี้</button>`;
    else if (it.source === 'level') {
      const ok = S.data.level >= it.level;
      btn = ok ? `<button class="btn btn-primary btn-block" type="button" data-cos-go-levels>${ICON('gift', 'icon icon-sm')} ไปรับรางวัลเลเวล ${it.level}</button>`
        : `<p class="cos-lockmsg">${ICON('lock', 'icon icon-sm')} ได้เมื่อถึงเลเวล ${fmt(it.level)} (ตอนนี้ ${fmt(S.data.level)})</p>`;
    } else {
      const enough = S.data.balance >= it.price;
      btn = `<button class="btn btn-primary btn-block" type="button" data-cos-buy="${esc(id)}"${enough ? '' : ' disabled'}>ซื้อ ${coinIco} ${fmt(it.price)}</button>
        ${enough ? '' : `<p class="cos-hint">Coin ไม่พอ (ขาดอีก ${fmt(it.price - S.data.balance)}) — ได้ Coin จากการเรียนและรางวัลเลเวล</p>`}`;
    }
    return `<div class="cos-act"><p class="cos-act-name"><b>${esc(it.nameTh)}</b> <span class="cos-rar r-${esc(it.rarity)}">${esc(it.rarityTh)}</span></p>${btn}
      ${eqId && eqId !== id ? `<button class="link-btn" type="button" data-cos-equip="">ถอดกรอบที่ใส่อยู่</button>` : ''}</div>`;
  }

  function levelsHtml() {
    const L = S.levels;
    const rows = L.rewards.map((r) => {
      const items = r.items.map((it) => `<span class="cos-lv-item" title="${esc(it.nameTh)}">${it.kind === 'pframe' ? `<span class="cos-thumb-pic sm">${DUMMY}${ov(it.id)}</span>` : `<span class="cos-thumb-chat sm has-cf" data-cf="${esc(it.id)}"><span>Hi</span></span>`}<small>${esc(it.nameTh)}</small></span>`).join('');
      const pct = r.status === 'locked' ? Math.min(99, Math.floor((L.level / r.level) * 100)) : 100;
      const act = r.status === 'claimable' ? `<button class="btn btn-primary" type="button" data-cos-claim="${r.level}">${ICON('gift', 'icon icon-sm')} รับรางวัล</button>`
        : r.status === 'claimed' ? `<span class="cos-done">${ICON('circle-check', 'icon icon-sm')} รับแล้ว</span>`
          : `<span class="cos-locked">${ICON('lock', 'icon icon-xs')} อีก ${fmt(r.level - L.level)} เลเวล</span>`;
      return `<li class="cos-lv is-${r.status}"><span class="cos-lv-num"><small>เลเวล</small><b>${r.level}</b></span>
        <div class="cos-lv-body"><span class="cos-lv-coins">${coinIco}<b>${fmt(r.coins)}</b> Coin</span>${items ? `<span class="cos-lv-items">${items}</span>` : ''}
          ${r.status === 'locked' ? `<span class="cos-lv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="ความคืบหน้าถึงเลเวล ${r.level}"><i style="width:${pct}%"></i></span>` : ''}</div>
        <div class="cos-lv-act">${act}</div></li>`;
    }).join('');
    return `<div class="cos-lv-head"><p>ทุก ๆ 10 เลเวลได้ Coin และกรอบพิเศษที่ซื้อไม่ได้ · เลเวลเกินแล้วรับย้อนหลังได้ทุกขั้น</p>
      ${L.claimable > 1 ? `<button class="btn btn-primary" type="button" data-cos-claim-all>${ICON('gift', 'icon icon-sm')} รับทั้งหมด (${L.claimable})</button>` : ''}</div>
      <ol class="cos-lvs">${rows}</ol>`;
  }

  /* ---------------- การกระทำ ---------------- */
  async function act(fn) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); } catch (err) { App().toast(err.message || 'ทำรายการไม่สำเร็จ', 'error'); } finally { S.busy = false; }
  }
  function syncCoins(balance) {
    if (balance === null || balance === undefined) return;
    document.querySelectorAll('[data-coin-balance]').forEach((n) => { n.textContent = fmt(balance); });
    if (window.EQAvatar && window.EQAvatar.checkCoins) window.EQAvatar.checkCoins();
  }
  function rewardDialog(res) {
    const ov2 = document.createElement('div');
    ov2.className = 'modal-overlay';
    const items = res.items || [];
    ov2.innerHTML = `<div class="modal-card cos-reward">
      <h2>${ICON('gift', 'icon')} ได้รับรางวัลเลเวล!</h2>
      <p class="cos-reward-coins">${coinIco} <b>+${fmt(res.coins)}</b> Coin</p>
      ${items.length ? `<div class="cos-reward-items">${items.map((it) => `<span class="cos-lv-item">${it.kind === 'pframe' ? `<span class="cos-thumb-pic">${DUMMY}${ov(it.id)}</span>` : `<span class="cos-thumb-chat has-cf" data-cf="${esc(it.id)}"><span>Hello!</span></span>`}<small>${esc(it.nameTh)}</small></span>`).join('')}</div>` : ''}
      <div class="cos-reward-btns">${items.length ? `<button class="btn btn-primary btn-block" type="button" data-rw-wear="${esc(items[0].id)}" data-rw-kind="${esc(items[0].kind)}">${ICON('check', 'icon icon-sm')} ใส่${items[0].kind === 'pframe' ? 'กรอบโปรไฟล์' : 'กรอบแชท'}เลย</button>` : ''}
      <button class="btn btn-secondary btn-block" type="button" data-rw-ok>เยี่ยม!</button></div></div>`;
    document.body.appendChild(ov2);
    App().makeDialog(ov2, { label: 'ได้รับรางวัลเลเวล', closeButton: false });
    ov2.querySelector('[data-rw-ok]').addEventListener('click', () => ov2.remove());
    const wear = ov2.querySelector('[data-rw-wear]');
    if (wear) wear.addEventListener('click', () => act(async () => { await equip(wear.dataset.rwKind, wear.dataset.rwWear); ov2.remove(); }));
  }
  async function equip(kind, itemId) {
    await api('/cosmetics/equip', { method: 'POST', body: { kind, itemId: itemId || null } });
    if (S.data) S.data.equipped[kind] = itemId || null;
    const me = App().user;
    if (me && window.EQAvatar && window.EQAvatar.refreshLook) window.EQAvatar.refreshLook(me.id);
    App().toast(itemId ? 'ใส่กรอบแล้ว — ทุกคนจะเห็นกรอบนี้' : 'ถอดกรอบแล้ว', 'success');
    render();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cos-tab],[data-cos-pick],[data-cos-buy],[data-cos-equip],[data-cos-claim],[data-cos-claim-all],[data-cos-back],[data-cos-retry],[data-cos-go-levels]');
    if (!t || !t.closest('#screen-frames')) return;
    if (t.dataset.cosTab) { S.tab = t.dataset.cosTab; render(); const b = document.getElementById(`cos-tab-${S.tab}`); if (b) b.focus(); return; }
    if (t.hasAttribute('data-cos-back')) { if (history.length > 1) history.back(); else App().navigateTo('profile'); return; }
    if (t.hasAttribute('data-cos-retry')) { open(); return; }
    if (t.hasAttribute('data-cos-go-levels')) { S.tab = 'levels'; render(); return; }
    if (t.dataset.cosPick) {
      const it = byId(t.dataset.cosPick);
      S.sel[it.kind] = S.sel[it.kind] === it.id && !it.owned ? S.data.equipped[it.kind] : it.id;
      render();
      const again = document.querySelector(`#screen-frames [data-cos-pick="${CSS.escape(it.id)}"]`); if (again) again.focus();
      return;
    }
    if (t.dataset.cosBuy !== undefined && t.dataset.cosBuy) {
      const it = byId(t.dataset.cosBuy);
      act(async () => {
        const r = await api('/cosmetics/purchase', { method: 'POST', body: { itemId: it.id } });
        S.data.balance = r.balance; it.owned = true; it.via = 'purchase';
        syncCoins(r.balance);
        App().toast(`ซื้อ "${it.nameTh}" แล้ว`, 'success');
        await equip(it.kind, it.id);
      });
      return;
    }
    if (t.dataset.cosEquip !== undefined) { act(() => equip(S.tab, t.dataset.cosEquip || null)); return; }
    if (t.dataset.cosClaim) {
      act(async () => {
        const r = await api(`/cosmetics/level-rewards/${Number(t.dataset.cosClaim)}/claim`, { method: 'POST' });
        syncCoins(r.balance);
        await load(); render(); rewardDialog(r);
      });
      return;
    }
    if (t.hasAttribute('data-cos-claim-all')) {
      act(async () => {
        const r = await api('/cosmetics/level-rewards/claim-all', { method: 'POST' });
        syncCoins(r.balance);
        await load(); render(); rewardDialog(r);
      });
    }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('#screen-frames [role="tab"]');
    if (!t || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = TABS.findIndex((x) => x.id === t.dataset.cosTab);
    S.tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    render(); const b = document.getElementById(`cos-tab-${S.tab}`); if (b) b.focus();
  });

  /** มีรางวัลเลเวลรอรับไหม → อัปเดตป้าย + (ถ้าขอ) แจ้งพร้อมปุ่ม "รับรางวัล" */
  let toastShown = 0;
  async function checkPending({ toast = false } = {}) {
    try {
      const lv = await api('/cosmetics/level-rewards');
      S.levels = lv; setBadges(lv.claimable);
      if (toast && lv.claimable > 0 && Date.now() - toastShown > 60000) {
        toastShown = Date.now();
        const first = lv.rewards.find((r) => r.status === 'claimable');
        App().toast(lv.claimable > 1 ? `มีรางวัลเลเวลรอรับ ${lv.claimable} ขั้น` : `ถึงเลเวล ${first.level} แล้ว! มีรางวัลรอรับ`, 'success',
          { action: { label: 'รับรางวัล', onClick: () => { S.tab = 'levels'; App().navigateTo('frames'); } } });
      }
      return lv.claimable;
    } catch (_) { return 0; }
  }

  window.EQCos = { open, checkPending, ensureSprite, _state: S };
}());
