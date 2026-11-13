/* =====================================================================
   แชทโลก (Global World Chat) — window.EQWorldChat
   v1.15.0 ระบบแชทโลก · v1.17.0 ย้ายมาอยู่บน Game Lobby:
   - Mini Chat บนหน้าแรก (จอกว้าง: ใต้เควสต์ 3–5 ข้อความ · มือถือ/แท็บเล็ต: แถบเหนือเมนูล่าง 1–2 ข้อความ)
     แสดงสถานะการเชื่อมต่อ + จำนวนข้อความใหม่ · กดเพื่อเปิดแผงแชท · ซ่อนแชทย่อได้ (เหลือปุ่ม "แชท (n)")
   - Full Chat: Drawer ด้านขวา (จอกว้าง) / Bottom Sheet เต็มจอ (มือถือ) — อยู่เหนือเมนูล่าง · รองรับคีย์บอร์ดมือถือ (visualViewport)
   - ข้อความพิมพ์เอง + Quick Chat ใช้ POST /api/world-chat เดียวกัน · cid กันส่งซ้ำ · หลุดการเชื่อมต่อ → โหลดข้อความที่พลาด (?after=)
   - อ่านข้อความเก่าอยู่ → ไม่เลื่อนลงเอง แสดง "ข้อความใหม่" แทน
   - ข้อความทุกชิ้นผ่าน esc() (ไม่แปลงเป็นลิงก์/HTML) · รูปผู้ส่ง = รูปที่เจ้าของบัญชีเลือกเอง (users.avatar_image / avatar)
   - ไม่มีข้อความตัวอย่าง/ข้อมูลปลอม: ทุกอย่างมาจากเซิร์ฟเวอร์
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const G = () => window.EQG;
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const api = (p, o) => App().api(`/world-chat${p}`, o);
  const REASONS = [['spam', 'สแปม / ส่งซ้ำ ๆ'], ['harassment', 'ด่าทอ / กลั่นแกล้ง'], ['inappropriate_name', 'ชื่อไม่เหมาะสม'], ['other', 'อื่น ๆ (เช่น ขอข้อมูลส่วนตัว)']];
  const MAX_KEEP = 200;
  const st = {
    loaded: false, loading: null, messages: [], more: false, me: null, prefs: { enabled: true, mini: true, sound: false, notify: true, quickOnly: false },
    quick: [], online: 0, maxLen: 200, open: false, view: 'chat', unseen: 0, conn: 'connecting', wasDown: false, pending: [], opener: null,
  };

  const time = (at) => {
    const d = new Date(at); const n = new Date();
    return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const avatarOf = (u, cls = '') => `<span class="friend-avatar gc-av ${cls}${u.avatarImage ? ' has-image' : ''}">${G() ? G().avatar(u.avatar, u.avatarImage || null, '', u.id) : ''}</span>`;
  const myId = () => (App().user ? App().user.id : null);
  const lastId = () => st.messages.reduce((a, m) => Math.max(a, Number(m.id) || 0), 0);
  function addMessages(list) {
    let added = 0;
    for (const m of list) {
      if (!m || st.messages.some((x) => x.id === m.id)) continue;
      st.messages.push(m); added += 1;
    }
    st.messages.sort((a, b) => a.id - b.id);
    if (st.messages.length > MAX_KEEP) st.messages = st.messages.slice(-MAX_KEEP);
    return added;
  }

  /* =====================================================================
     โหลดข้อมูล
     ===================================================================== */
  async function load(force) {
    if (st.loaded && !force) return;
    if (st.loading) return st.loading;
    st.loading = (async () => {
      const d = await api('');
      st.messages = []; addMessages(d.messages);
      Object.assign(st, { more: d.more, me: d.me, prefs: d.prefs || st.prefs, quick: d.quick || [], online: d.online, maxLen: d.maxLen || 200, loaded: true });
    })().finally(() => { st.loading = null; });
    return st.loading;
  }
  async function catchUp() {
    // กลับมาเชื่อมต่อ: ดึงเฉพาะข้อความที่พลาด (ไม่ซ้ำ · ไม่โหลดทั้งหมดใหม่)
    if (!st.loaded) return;
    try {
      const d = await api(`?after=${lastId()}`);
      const before = st.messages.length;
      const fresh = (d.messages || []).filter((m) => !st.messages.some((x) => x.id === m.id));
      addMessages(fresh);
      if (typeof d.online === 'number') st.online = d.online;
      const theirs = fresh.filter((m) => !m.mine).length;
      if (theirs && !st.open) bump(theirs);
      if (st.messages.length !== before) { renderMini(); if (st.open) renderLog({ keepPosition: true, appended: true }); }
    } catch (_) { /* ลองใหม่ตอนเชื่อมต่อครั้งถัดไป */ }
  }

  /* =====================================================================
     Mini Chat บน Lobby
     ===================================================================== */
  const connLabel = () => ({ connected: 'เชื่อมต่อแล้ว', reconnecting: 'กำลังเชื่อมต่อใหม่…', connecting: 'กำลังเชื่อมต่อ…' }[st.conn] || '');
  function unreadText() { return st.unseen >= 99 ? '99+' : String(st.unseen); }
  function measureNav() {
    const n = $('bottom-nav'); const r = n && !n.classList.contains('hidden') ? n.getBoundingClientRect() : null;
    document.documentElement.style.setProperty('--eq-nav-h', `${r && r.bottom >= window.innerHeight - 2 ? Math.round(r.height) : 0}px`);
  }
  window.addEventListener('resize', measureNav);
  function renderMini() {
    const box = $('gcm'); if (!box) return;
    measureNav();
    const p = st.prefs || {};
    const showCount = p.notify !== false && st.unseen > 0;
    if (!st.loaded) { box.className = 'gcm is-loading'; box.innerHTML = `<div class="gcm-head"><span class="gcm-title">${ICON('globe')} แชทโลก</span><span class="gcm-conn">กำลังโหลด…</span></div>`; return; }
    if (p.enabled === false || p.mini === false) {
      box.className = 'gcm is-pill';
      box.innerHTML = `<button class="gcm-pill" type="button" data-gc-open aria-label="เปิดแชทโลก${showCount ? ` (ข้อความใหม่ ${unreadText()})` : ''}">${ICON('message-circle')} แชท${showCount ? ` <span class="gcm-unread">(${unreadText()})</span>` : ''}${p.enabled === false ? ' <small>· ปิดอยู่</small>' : ''}</button>`;
      return;
    }
    const lines = st.messages.slice(-5);
    box.className = `gcm${showCount ? ' has-unread' : ''}`;
    box.innerHTML = `
      <div class="gcm-head">
        <span class="gcm-title">${ICON('globe')} แชทโลก</span>
        <span class="gcm-conn is-${st.conn}" role="status"><span class="gcm-dot" aria-hidden="true"></span><span class="gcm-conn-t">${connLabel()}</span></span>
        ${showCount ? `<span class="gcm-unread-badge" aria-label="ข้อความใหม่ ${unreadText()} ข้อความ">${unreadText()}</span>` : ''}
        <button class="gcm-hide" type="button" data-gcm-hide aria-label="ซ่อนแชทย่อ (เปิดกลับได้จากปุ่มแชท)" title="ซ่อนแชทย่อ">${ICON('eye-off', 'icon icon-xs')}</button>
      </div>
      <button class="gcm-body" type="button" data-gc-open aria-label="เปิดแชทโลกเต็มจอ${showCount ? ` (ข้อความใหม่ ${unreadText()})` : ''}">
        <ol class="gcm-list" aria-hidden="true">${lines.length ? lines.map((m) => `<li class="gcm-line" data-id="${m.id}">${avatarOf(m.user, 'gcm-av')}<span class="gcm-txt"><b>${m.mine ? 'คุณ' : esc(m.user.username)}</b> ${esc(m.body)}</span></li>`).join('')
          : '<li class="gcm-empty">ยังไม่มีข้อความ — แตะเพื่อทักทายทุกคน</li>'}</ol>
        <span class="gcm-open" aria-hidden="true">${ICON('chevron-right', 'icon icon-xs')}</span>
      </button>`;
  }
  function slideInMini(id) {
    const li = document.querySelector(`#gcm .gcm-line[data-id="${id}"]`);
    if (li && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) li.classList.add('is-new');
  }
  async function mountMini() {
    renderMini();
    try { await load(); } catch (_) { /* แสดงสถานะเดิม */ }
    st.conn = App().rtConnected ? 'connected' : (st.conn === 'connected' ? 'reconnecting' : st.conn);
    renderMini();
  }
  function bump(n) {
    st.unseen = Math.min(99, st.unseen + n);
    if (st.prefs.sound && !document.hidden) beep();
  }
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') return;   // เบราว์เซอร์ยังไม่อนุญาตเสียง (ยังไม่มีการแตะ) — ไม่บังคับ
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime; g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    } catch (_) { /* ไม่มีเสียงก็ไม่เป็นไร */ }
  }

  /* =====================================================================
     Full Chat (Drawer / Bottom Sheet)
     ===================================================================== */
  function msgHtml(m) {
    const quick = m.quick ? `<span class="gc-quick-tag">${ICON('message-square-text', 'icon icon-xs')} Quick</span>` : '';
    return `<li class="gc-msg${m.mine ? ' is-mine' : ''}${m.pending ? ' is-pending' : ''}${m.failed ? ' is-failed' : ''}" data-gc-id="${esc(m.id)}">
      ${m.mine ? '' : `<button class="gc-avbtn" type="button" data-profile-uid="${Number(m.user.id)}" aria-label="ดูโปรไฟล์ ${esc(m.user.username)}">${avatarOf(m.user)}</button>`}
      <div class="gc-bubble" data-cf-uid="${Number(m.mine ? ((window.EQApp && window.EQApp.user && window.EQApp.user.id) || 0) : m.user.id)}">
        <div class="gc-meta">${m.mine ? '<b>คุณ</b>' : `<button class="gc-name" type="button" data-profile-uid="${Number(m.user.id)}">${esc(m.user.username)}</button>`}
          <span class="gc-lv">Lv.${Number(m.user.level) || 1}</span>${quick}<time datetime="${esc(m.at)}">${m.pending ? 'กำลังส่ง…' : m.failed ? 'ส่งไม่สำเร็จ' : esc(time(m.at))}</time>
          ${m.pending ? '' : m.failed ? `<button class="gc-retry" type="button" data-gc-retry-send="${esc(m.id)}">ลองอีกครั้ง</button>` : `<button class="gc-more" type="button" data-gc-menu="${m.id}" aria-label="ตัวเลือกข้อความของ ${esc(m.mine ? 'คุณ' : m.user.username)}">${ICON('ellipsis', 'icon icon-xs')}</button>`}</div>
        <p class="gc-body">${esc(m.body)}</p>
        ${m.invite && window.EQDraw ? window.EQDraw.renderInvite(m.invite) : ''}
      </div></li>`;
  }
  const nearBottom = (box) => box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  function renderLog({ keepPosition = false, appended = false } = {}) {
    const box = $('gc-log'); if (!box) return;
    const stick = !keepPosition || nearBottom(box);
    const fromBottom = box.scrollHeight - box.scrollTop;
    const all = st.messages.concat(st.pending);
    box.innerHTML = `${st.more ? '<li class="gc-older"><button class="mini-btn ghost" type="button" data-gc-older>โหลดข้อความก่อนหน้า</button></li>' : ''}
      ${all.length ? all.map(msgHtml).join('') : '<li class="gc-empty">ยังไม่มีข้อความ — ทักทายทุกคนเป็นคนแรกเลย! (ลองใช้ภาษาอังกฤษนะ)</li>'}`;
    if (stick) box.scrollTop = box.scrollHeight;
    else { box.scrollTop = box.scrollHeight - fromBottom; if (appended) { const nb = $('gc-new'); if (nb) nb.classList.remove('hidden'); } }
  }
  function composeHtml() {
    const me = st.me || {}; const p = st.prefs || {};
    if (p.enabled === false) return `<div class="gc-off">${ICON('message-circle-off')} คุณปิดแชทโลกไว้ <button class="btn btn-primary" type="button" data-gc-enable>เปิดแชทโลก</button></div>`;
    if (!me.canPost) return `<div class="gc-off" role="status">${ICON('shield-alert')} ${esc(me.message || 'ตอนนี้ยังส่งข้อความไม่ได้')}</div>`;
    const quickOnly = me.quickOnly;
    const chips = `<div class="gc-quick" role="group" aria-label="Quick Chat — ข้อความสำเร็จรูป">${st.quick.map((q) => `<button class="gc-qbtn" type="button" data-gc-quick="${esc(q.id)}">${esc(q.text)}</button>`).join('')}</div>`;
    if (quickOnly) return `${chips}<p class="gc-qonly">${ICON('message-square-text', 'icon icon-xs')} ${esc(me.quickForced ? me.message : 'Quick Chat เท่านั้น — เปลี่ยนได้ในการตั้งค่า')}</p>`;
    return `${chips}<form class="chat-compose gc-compose" id="gc-form" autocomplete="off">
      <label class="sr-only" for="gc-input">พิมพ์ข้อความถึงทุกคน</label>
      <input id="gc-input" type="text" maxlength="${st.maxLen}" placeholder="พิมพ์ข้อความถึงทุกคน…" enterkeyhint="send" autocomplete="off" />
      <button class="btn btn-primary chat-send" type="submit" aria-label="ส่ง">${ICON('send')}</button>
    </form><p class="gc-count" id="gc-count" aria-live="polite"></p>`;
  }
  function panelHtml() {
    return `<div class="gcp" role="dialog" aria-modal="true" aria-labelledby="gcp-title" tabindex="-1">
      <header class="gcp-head">
        <div class="gcp-titles"><h2 id="gcp-title">${ICON('globe')} แชทโลก</h2>
          <p class="gcp-sub"><span class="gcm-conn is-${st.conn}" id="gcp-conn"><span class="gcm-dot" aria-hidden="true"></span><span class="gcm-conn-t">${connLabel()}</span></span> · <span id="gcp-online">ออนไลน์ ${st.online} คน</span></p></div>
        <button class="gcp-icon" type="button" data-gcp-settings aria-label="ตั้งค่าแชท" aria-expanded="false">${ICON('settings')}</button>
        <button class="gcp-icon" type="button" data-gcp-close aria-label="ปิดแชท">${ICON('x')}</button>
      </header>
      <div class="gcp-main" id="gcp-main"></div>
    </div>`;
  }
  function renderChatView() {
    const main = $('gcp-main'); if (!main) return;
    st.view = 'chat';
    const sb = document.querySelector('[data-gcp-settings]'); if (sb) sb.setAttribute('aria-expanded', 'false');
    main.innerHTML = `
      <details class="gc-rules"><summary>${ICON('shield-check')} กติกาเพื่อความปลอดภัย</summary>
        <ul><li>ห้ามแชร์เบอร์โทร อีเมล ไลน์ ลิงก์ ที่อยู่ หรือโรงเรียน — ระบบจะไม่ส่งข้อความนั้น</li>
        <li>คำหยาบจะถูกปิดด้วย * · ส่งซ้ำหรือถี่เกินไปจะถูกพักชั่วคราว</li>
        <li>เจอคนไม่สุภาพ: กด ⋯ ที่ข้อความเพื่อปิดเสียง บล็อก หรือรายงาน · กดชื่อเพื่อดูโปรไฟล์</li>
        <li>ข้อความเก็บไว้ 30 วัน ผู้ดูแลตรวจได้เมื่อมีรายงาน</li></ul></details>
      <div class="gc-log-wrap"><ol class="gc-log" id="gc-log" role="log" aria-live="polite" aria-label="ข้อความแชทโลก"></ol>
        <button class="gc-new hidden" type="button" id="gc-new">${ICON('arrow-down', 'icon icon-xs')} ข้อความใหม่</button></div>
      <div class="gc-compose-wrap" id="gc-compose-wrap">${composeHtml()}</div>`;
    renderLog();
  }
  async function renderSettings() {
    const main = $('gcp-main'); if (!main) return;
    st.view = 'settings';
    const sb = document.querySelector('[data-gcp-settings]'); if (sb) sb.setAttribute('aria-expanded', 'true');
    const p = st.prefs;
    const row = (k, t, sub) => `<label class="gc-set"><span><b>${t}</b><small>${sub}</small></span><input type="checkbox" role="switch" data-gc-pref="${k}"${p[k] ? ' checked' : ''}></label>`;
    main.innerHTML = `<div class="gc-settings">
      <button class="mini-btn ghost" type="button" data-gcp-back>${ICON('arrow-left', 'icon icon-xs')} กลับไปที่แชท</button>
      <h3>ตั้งค่าแชทโลก</h3>
      ${row('enabled', 'รับข้อความแชทโลก', 'ปิดแล้วจะไม่เห็นและไม่ได้รับข้อความ (ซ่อนแชทโลก)')}
      ${row('mini', 'แสดงแชทย่อบนหน้าแรก', 'ปิดแล้วเหลือปุ่ม "แชท" ให้กดเปิด')}
      ${row('notify', 'แจ้งจำนวนข้อความใหม่', 'ตัวเลขบนแชทย่อเมื่อมีข้อความใหม่')}
      ${row('sound', 'เสียงเมื่อมีข้อความใหม่', 'เสียงสั้น ๆ ขณะอยู่หน้าแรก (ปิดไว้เป็นค่าเริ่มต้น)')}
      ${row('quickOnly', 'Quick Chat เท่านั้น', 'ส่งได้เฉพาะข้อความสำเร็จรูป — เหมาะกับผู้เรียนอายุน้อย')}
      <h3>รายชื่อที่บล็อก</h3><ul class="gc-blocked" id="gc-blocked"><li class="gc-empty">กำลังโหลด…</li></ul>
      <p class="gc-note">การตั้งค่าบันทึกไว้กับบัญชีของคุณ ใช้ได้ทุกอุปกรณ์</p></div>`;
    try {
      const { blocked } = await App().api('/friends/blocked');
      const ul = $('gc-blocked'); if (!ul) return;
      ul.innerHTML = blocked.length ? blocked.map((u) => `<li>${avatarOf(u)}<span>${esc(u.username)}</span><button class="mini-btn ghost" type="button" data-gc-unblock="${Number(u.id)}">ปลดบล็อก</button></li>`).join('')
        : '<li class="gc-empty">ยังไม่ได้บล็อกใคร</li>';
    } catch (_) { const ul = $('gc-blocked'); if (ul) ul.innerHTML = '<li class="gc-empty">โหลดรายชื่อไม่สำเร็จ</li>'; }
  }

  function fitViewport() {
    // มือถือ: ให้แผงสูงเท่าพื้นที่ที่มองเห็นจริง (คีย์บอร์ดเปิด = เล็กลง) → ช่องพิมพ์ไม่ถูกบัง
    const w = $('gcp'); if (!w) return;
    const vv = window.visualViewport;
    if (vv && window.matchMedia('(max-width: 1099px)').matches) { w.style.height = `${Math.round(vv.height)}px`; w.style.top = `${Math.round(vv.offsetTop)}px`; } else { w.style.height = ''; w.style.top = ''; }
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }

  async function open() {
    if ($('gcp')) { const inp = $('gc-input'); if (inp) inp.focus(); return; }
    st.opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'gcp-wrap'; wrap.id = 'gcp';
    wrap.innerHTML = panelHtml();
    document.body.appendChild(wrap);
    document.body.classList.add('gcp-open');
    st.open = true; st.unseen = 0; renderMini();
    requestAnimationFrame(() => wrap.classList.add('is-in'));
    fitViewport();
    const main = $('gcp-main');
    main.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลดแชทโลก…</div>';
    try {
      await load(!st.loaded);
      renderChatView();
      const inp = $('gc-input');
      if (inp && window.matchMedia('(min-width: 1100px)').matches) inp.focus(); else wrap.querySelector('.gcp').focus();
    } catch (err) {
      main.innerHTML = `<div class="gl-empty" role="alert"><p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-gc-reload>ลองใหม่</button></div>`;
    }
  }
  function close() {
    const w = $('gcp'); if (!w) return;
    st.open = false; st.unseen = 0;
    w.classList.remove('is-in');
    document.body.classList.remove('gcp-open');
    setTimeout(() => w.remove(), 220);
    renderMini();
    const back = st.opener && document.contains(st.opener) ? st.opener : document.querySelector('#gcm [data-gc-open]');
    if (back && back.focus) back.focus();
  }

  /* =====================================================================
     ส่งข้อความ (พิมพ์เอง + Quick Chat ใช้ทางเดียวกัน)
     ===================================================================== */
  const newCid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  async function send({ text, quick, cid, retry }) {
    const me = App().user || {};
    const id = cid || newCid();
    let pend = st.pending.find((p) => p.id === id);
    if (!pend) {
      pend = { id, cid: id, pending: true, mine: true, body: text || (st.quick.find((q) => q.id === quick) || {}).text || '', quick: quick || null, user: { id: me.id, username: me.username, avatar: me.avatar, avatarImage: me.avatar_image, level: 1 }, at: new Date().toISOString(), _text: text, _quick: quick };
      st.pending.push(pend);
    } else { pend.pending = true; pend.failed = false; }
    renderLog();
    try {
      const r = await api('', { method: 'POST', body: { body: text || '', quick: quick || undefined, cid: id } });
      st.pending = st.pending.filter((p) => p.id !== id);
      addMessages([r.message]);
      renderLog(); renderMini();
      const c = $('gc-count'); if (c) c.textContent = r.masked ? 'คำไม่สุภาพบางคำถูกปิดด้วย *' : '';
      return true;
    } catch (err) {
      const network = !err || !err.status || err.status >= 500;
      if (network && !retry) { pend.pending = false; pend.failed = true; renderLog(); }   // ส่งซ้ำด้วย cid เดิมได้ (เซิร์ฟเวอร์คืนข้อความเดิม ไม่ซ้ำ)
      else { st.pending = st.pending.filter((p) => p.id !== id); renderLog(); }
      App().toast((err && err.message) || 'ส่งไม่สำเร็จ', 'error');
      if (err && (err.code === 'RESTRICTED' || err.code === 'QUICK_ONLY')) { try { await load(true); } catch (_) { /* - */ } const cw = $('gc-compose-wrap'); if (cw) cw.innerHTML = composeHtml(); }
      return false;
    }
  }

  /* =====================================================================
     เมนูข้อความ: โปรไฟล์ · เพิ่มเพื่อน · ปิดเสียง · บล็อก · รายงาน · ลบ
     ===================================================================== */
  function menu(id) {
    const m = st.messages.find((x) => x.id === id); if (!m) return;
    const admin = App().user && App().user.role === 'admin';
    const opts = [];
    if (!m.mine) opts.push(['profile', 'user', `ดูโปรไฟล์ ${m.user.username}`], ['friend', 'user-plus', 'ส่งคำขอเป็นเพื่อน'], ['mute', 'volume-x', 'ปิดเสียงคนนี้ในแชทโลก'], ['block', 'ban', 'บล็อก'], ['report', 'flag', 'รายงานข้อความนี้']);
    if (m.mine || admin) opts.push(['delete', 'trash-2', m.mine ? 'ลบข้อความของฉัน' : 'ซ่อนข้อความ (ผู้ดูแล)']);
    const wrap = document.createElement('div');
    wrap.className = 'gc-sheet-wrap';
    wrap.innerHTML = `<div class="gc-sheet" role="dialog" aria-modal="true" aria-label="ตัวเลือกข้อความ">
      <p class="gc-sheet-q">“${esc(m.body.length > 80 ? `${m.body.slice(0, 80)}…` : m.body)}”</p>
      ${opts.map(([k, ic, t]) => `<button class="gc-sheet-btn${['report', 'block', 'delete'].includes(k) ? ' is-danger' : ''}" type="button" data-gc-act="${k}">${ICON(ic)} ${esc(t)}</button>`).join('')}
      <button class="gc-sheet-btn" type="button" data-gc-act="close">ยกเลิก</button></div>`;
    document.body.appendChild(wrap);
    const done = () => { wrap.remove(); const b = document.querySelector(`[data-gc-menu="${id}"]`); if (b) b.focus(); };
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap) return done();
      const b = e.target.closest('[data-gc-act]'); if (!b) return;
      const act = b.dataset.gcAct;
      if (act === 'close') return done();
      try {
        if (act === 'delete') { await api(`/${id}`, { method: 'DELETE' }); removeLocal(id); App().toast('ลบข้อความแล้ว', 'success'); }
        if (act === 'profile') { wrap.remove(); const el = document.createElement('button'); el.dataset.profileUid = String(m.user.id); el.hidden = true; document.body.appendChild(el); el.click(); el.remove(); return; }
        if (act === 'friend') { const r = await App().api('/friends/request', { method: 'POST', body: { userId: m.user.id } }); App().toast(r.message || 'ส่งคำขอเป็นเพื่อนแล้ว', 'success'); }
        if (act === 'mute') { await api(`/mute/${m.user.id}`, { method: 'PUT' }); hideUser(m.user.id); App().toast(`ปิดเสียง ${m.user.username} แล้ว — จะไม่เห็นข้อความของคนนี้`, 'success'); }
        if (act === 'block') { await App().api(`/friends/block/${m.user.id}`, { method: 'POST', body: {} }); hideUser(m.user.id); App().toast(`บล็อก ${m.user.username} แล้ว`, 'success'); }
        if (act === 'report') {
          wrap.querySelector('.gc-sheet').innerHTML = `<p class="gc-sheet-q">รายงานข้อความนี้เพราะ…</p>${REASONS.map(([v, t]) => `<button class="gc-sheet-btn" type="button" data-gc-reason="${v}">${esc(t)}</button>`).join('')}<button class="gc-sheet-btn" type="button" data-gc-act="close">ยกเลิก</button>`;
          wrap.querySelector('.gc-sheet-btn').focus();
          wrap.addEventListener('click', async (ev) => {
            const r = ev.target.closest('[data-gc-reason]'); if (!r) return;
            try { const res = await api(`/${id}/report`, { method: 'POST', body: { reason: r.dataset.gcReason } }); App().toast(res.message, 'success'); } catch (err) { App().toast(err.message, 'error'); }
            done();
          });
          return;
        }
      } catch (err) { App().toast((err && err.message) || 'ทำรายการไม่สำเร็จ', 'error'); }
      done();
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    const first = wrap.querySelector('.gc-sheet-btn'); if (first) first.focus();
  }
  function removeLocal(id) { st.messages = st.messages.filter((m) => m.id !== id); const li = document.querySelector(`#gc-log [data-gc-id="${id}"]`); if (li) li.remove(); renderMini(); }
  function hideUser(uid) { st.messages = st.messages.filter((m) => m.mine || m.user.id !== uid); renderLog({ keepPosition: true }); renderMini(); }

  async function savePref(k, v) {
    const prev = st.prefs[k];
    st.prefs = { ...st.prefs, [k]: v };
    try {
      st.prefs = await api('/settings', { method: 'PUT', body: { [k]: v } });
      if (k === 'enabled' || k === 'quickOnly') await load(true);
      renderMini();
    } catch (err) { st.prefs[k] = prev; App().toast(err.message, 'error'); const cb = document.querySelector(`[data-gc-pref="${k}"]`); if (cb) cb.checked = prev; }
  }

  /* =====================================================================
     WebSocket (gchat:msg / gchat:remove) + สถานะการเชื่อมต่อ
     ===================================================================== */
  function onMessage(msg) {
    if (msg.type === 'gchat:msg') {
      const m = { ...msg }; delete m.type;
      m.mine = Boolean(myId() && m.user && m.user.id === myId());
      if (st.messages.some((x) => x.id === m.id)) return;
      if (!st.loaded) { if (!m.mine) bump(1); renderMini(); return; }
      addMessages([m]);
      if (!m.mine && !st.open) bump(1);
      renderMini(); slideInMini(m.id);
      if (st.open && st.view === 'chat') {
        const box = $('gc-log');
        if (box) {
          const stick = nearBottom(box);
          const empty = box.querySelector('.gc-empty'); if (empty) empty.remove();
          const firstPending = box.querySelector('.gc-msg.is-pending, .gc-msg.is-failed');
          if (firstPending) firstPending.insertAdjacentHTML('beforebegin', msgHtml(m)); else box.insertAdjacentHTML('beforeend', msgHtml(m));
          if (stick) box.scrollTop = box.scrollHeight; else { const nb = $('gc-new'); if (nb) nb.classList.remove('hidden'); }
        }
      }
      document.dispatchEvent(new CustomEvent('eq:gchat-msg', { detail: m }));
    } else if (msg.type === 'gchat:remove') removeLocal(Number(msg.id));
  }
  function setConn(state) {
    st.conn = state;
    renderMini();
    const c = $('gcp-conn'); if (c) { c.className = `gcm-conn is-${state}`; c.querySelector('.gcm-conn-t').textContent = connLabel(); }
  }
  window.addEventListener('eq:rt', (e) => {
    const on = Boolean(e.detail && e.detail.connected);
    if (on) { const was = st.wasDown; st.wasDown = false; setConn('connected'); if (was) catchUp(); } else { st.wasDown = true; setConn('reconnecting'); }
  });
  window.addEventListener('offline', () => { st.wasDown = true; setConn('reconnecting'); });
  window.addEventListener('online', () => {   // เน็ตกลับมาแต่ WebSocket ไม่ได้หลุด (บางเบราว์เซอร์) → ยืนยันสถานะ + ดึงข้อความที่อาจพลาด
    setTimeout(() => { if (App().rtConnected && st.conn !== 'connected') { st.wasDown = false; setConn('connected'); catchUp(); } }, 1500);
  });

  /* =====================================================================
     อีเวนต์
     ===================================================================== */
  document.addEventListener('submit', (e) => {
    if (!e.target || e.target.id !== 'gc-form') return;
    e.preventDefault();
    const inp = $('gc-input'); const v = inp.value.replace(/\s+/g, ' ').trim();
    if (!v) { App().toast('พิมพ์ข้อความก่อนส่ง', 'info'); return; }
    if (v.length > st.maxLen) { App().toast(`ยาวได้ไม่เกิน ${st.maxLen} ตัวอักษร`, 'error'); return; }
    inp.value = ''; const c = $('gc-count'); if (c) c.textContent = '';
    send({ text: v }).then((ok) => { if (!ok && !inp.value) inp.value = v; inp.focus(); });
  });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'gc-input') { const c = $('gc-count'); const n = e.target.value.length; if (c) c.textContent = n > st.maxLen - 40 ? `${n}/${st.maxLen}` : ''; }
  });
  document.addEventListener('click', async (e) => {
    const t = e.target; if (!t.closest) return;
    if (t.closest('[data-gc-open]')) { e.preventDefault(); open(); return; }
    if (t.closest('[data-gcm-hide]')) { savePref('mini', false); App().toast('ซ่อนแชทย่อแล้ว — กดปุ่ม "แชท" เพื่อเปิด หรือเปิดกลับในการตั้งค่า', 'info'); return; }
    const panel = $('gcp'); if (!panel || !panel.contains(t)) return;
    if (t === panel) { close(); return; }
    if (t.closest('[data-gcp-close]')) { close(); return; }
    if (t.closest('[data-gcp-settings]')) { if (st.view === 'settings') renderChatView(); else renderSettings(); return; }
    if (t.closest('[data-gcp-back]')) { renderChatView(); return; }
    let b = t.closest('[data-gc-menu]'); if (b) { menu(Number(b.dataset.gcMenu)); return; }
    b = t.closest('[data-gc-quick]'); if (b) { b.disabled = true; await send({ quick: b.dataset.gcQuick }); b.disabled = false; return; }
    b = t.closest('[data-gc-retry-send]');
    if (b) { const p = st.pending.find((x) => x.id === b.dataset.gcRetrySend); if (p) send({ text: p._text, quick: p._quick, cid: p.id, retry: true }); return; }
    if (t.closest('[data-gc-reload]')) { close(); open(); return; }
    if (t.closest('#gc-new')) { const box = $('gc-log'); box.scrollTop = box.scrollHeight; t.closest('#gc-new').classList.add('hidden'); return; }
    b = t.closest('[data-gc-older]');
    if (b) {
      b.disabled = true;
      try { const d = await api(`?before=${st.messages[0] ? st.messages[0].id : ''}`); const keep = st.messages; st.messages = []; addMessages(d.messages.concat(keep)); st.more = d.more; renderLog({ keepPosition: true }); }
      catch (err) { App().toast(err.message, 'error'); b.disabled = false; }
      return;
    }
    if (t.closest('[data-gc-enable]')) { await savePref('enabled', true); renderChatView(); return; }
    b = t.closest('[data-gc-unblock]');
    if (b) { try { await App().api(`/friends/block/${Number(b.dataset.gcUnblock)}`, { method: 'DELETE' }); b.closest('li').remove(); App().toast('ปลดบล็อกแล้ว', 'success'); await load(true); } catch (err) { App().toast(err.message, 'error'); } }
  });
  document.addEventListener('change', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.gcPref;
    if (k) savePref(k, e.target.checked);
  });
  document.addEventListener('keydown', (e) => {
    const panel = $('gcp'); if (!panel || [...document.querySelectorAll('.gc-sheet-wrap, .modal-overlay')].some((x) => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden')) return;   // มีป๊อปอัปอื่นเปิดอยู่จริง → ให้ป๊อปอัปนั้นจัดการ Esc
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {   // วนโฟกัสในแผงแชท
      const f = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener('scroll', (e) => { if (e.target && e.target.id === 'gc-log' && nearBottom(e.target)) { const n = $('gc-new'); if (n) n.classList.add('hidden'); } }, true);
  // ออกจากหน้าแรก → ปิดแผงแชท (แชทแสดงเฉพาะ Lobby · ไม่รบกวนบทเรียน/TOEIC/Ranked)
  window.addEventListener('eq:screen', (e) => { if (e.detail && e.detail.id !== 'screen-home' && $('gcp')) close(); });

  window.EQWorldChat = { open, close, mountMini, onMessage, unseen: () => st.unseen, _state: () => st };
}());
