/*
  v1.20.0 วาดทายศัพท์ (Draw & Guess) — หน้าเว็บ
  #/draw               หน้ารวม: สร้างห้อง / เข้าด้วยรหัส / กลับเข้าห้องเดิม
  #/draw-room/<CODE>   ห้อง: รอผู้เล่น → เลือกคำ → วาด/ทาย → เฉลย → สรุปผล
  - ระหว่างเกมใช้ WebSocket (EQApp.rtSend · ข้อความ draw:*) · สร้าง/เข้า/ชวน/รายงาน ใช้ REST /api/draw
  - พิกัดเส้นมาตรฐาน 1000×750 (ทุกจอวาดตรงกัน) · กระดานสีขาวเสมอ (อ่านง่ายทุกธีม) · ยางลบ = วาดด้วยสีพื้น
  - ข้อความทุกชิ้นผ่าน esc() · ไม่มีข้อมูลส่วนตัวนอกจากชื่อผู้ใช้/รูปโปรไฟล์/เลเวล
*/
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/draw${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-draw-root');
  const setHash = (t) => { if (location.hash !== t) history.replaceState(null, '', t); };
  const W = 1000; const H = 750;
  const BG = '#ffffff';
  const PHASE_TH = { lobby: 'รอผู้เล่น', choosing: 'กำลังเลือกคำ', drawing: 'กำลังวาด', reveal: 'เฉลย', ended: 'จบเกม', starting: 'กำลังเริ่ม' };

  let HUB = null;            // ข้อมูลหน้ารวม (ระดับ/ตัวเลือก)
  let R = null;              // snapshot ห้องปัจจุบัน
  let chat = [];             // ข้อความในห้อง
  let tool = { c: 0, w: 1, e: false };
  let clockTimer = null; let skew = 0;
  let pendingSeg = null; let segTimer = null; let strokeId = 0; let drawingNow = false;
  const lastPt = new Map();  // strokeId -> [x,y] (ต่อเส้นข้ามชิ้น)
  let ctx = null; let canvas = null;
  let expGained = 0;
  let lastExpCapToast = 0;
  const inviteCache = new Map();   // code -> peek (การ์ดคำเชิญในแชทโลก)

  const me = () => (R ? R.me : null);
  const isHost = () => Boolean(R && R.hostId === R.me);
  const isDrawer = () => Boolean(R && R.turn && R.turn.drawerId === R.me);
  const playerName = (id) => { const p = R && R.players.find((x) => x.id === id); return p ? p.username : 'ผู้เล่น'; };
  const send = (type, payload = {}) => App().rtSend(type, payload);

  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  // รูปโปรไฟล์แบบเดียวกับแชทโลก (EQG.avatar — แสดงรูปที่อัปโหลดเฉพาะเมื่อเจ้าของเลือกเอง ตามระบบเดิม)
  function avatar(p, cls = 'dg-av') {
    const G = window.EQG;
    if (G && G.avatar) return `<span class="friend-avatar ${cls}${p.avatarImage ? ' has-image' : ''}" aria-hidden="true">${G.avatar(p.avatar || 'fox', p.avatarImage || null, '', p.id)}</span>`;
    return `<span class="${cls} dg-av-letter" aria-hidden="true">${esc((p.username || '?').slice(0, 1).toUpperCase())}</span>`;
  }

  /* =========================================================== หน้ารวม */
  async function openHub() {
    stopClock();
    setHash('#/draw'); App().showScreen('screen-draw');
    const el = root(); loading(el);
    try { HUB = await api('/'); } catch (err) { errorBox(el, err, openHub); return; }
    const pref = (() => { try { return JSON.parse(localStorage.getItem('eq_draw_pref') || '{}'); } catch (_) { return {}; } })();
    const lv = HUB.levels.some((l) => l.id === pref.level) ? pref.level : 'A1';
    const rounds = HUB.rounds.includes(pref.rounds) ? pref.rounds : 2;
    const secs = HUB.drawSecs.includes(pref.drawSecs) ? pref.drawSecs : 80;
    el.innerHTML = `
      <header class="dg-hero">
        <p class="gl-kicker">${ICON('paintbrush', 'icon icon-sm')} เกมกับเพื่อน</p>
        <h1 class="page-title" id="dg-title">วาดทายศัพท์</h1>
        <p class="gl-sub">ผลัดกันวาดคำศัพท์ภาษาอังกฤษ คนอื่นพิมพ์ทายเป็นภาษาอังกฤษ ยิ่งทายถูกเร็วยิ่งได้คะแนนมาก · เล่นได้ 2–${HUB.maxPlayers} คน</p>
      </header>
      ${HUB.current ? `<div class="dg-current"><span>${ICON('door-open', 'icon icon-sm')} คุณอยู่ในห้อง <b>${esc(HUB.current.code)}</b> (${HUB.current.players}/${HUB.current.max} คน)</span>
        <button class="btn btn-primary" type="button" data-dg-open="${esc(HUB.current.code)}">กลับเข้าห้อง</button></div>` : ''}
      <section class="dg-card dg-rooms-card" aria-labelledby="dg-rooms-h">
        <div class="dg-rooms-head"><h2 id="dg-rooms-h">${ICON('door-open', 'icon icon-sm')} ห้องที่เปิดอยู่</h2>
          <button class="dg-iconbtn" type="button" data-dg-rooms-refresh aria-label="โหลดรายการห้องใหม่">${ICON('refresh-cw', 'icon icon-sm')}</button></div>
        <div id="dg-rooms" aria-live="polite"><p class="dg-muted">กำลังโหลดรายการห้อง…</p></div>
      </section>
      <section class="dg-card" aria-labelledby="dg-new-h">
        <h2 id="dg-new-h">${ICON('plus', 'icon icon-sm')} สร้างห้องใหม่</h2>
        <form id="dg-create" class="dg-form">
          <fieldset class="dg-field"><legend>ระดับคำศัพท์</legend>
            <div class="vd-seg dg-seg" role="radiogroup">${HUB.levels.map((l) => `<label class="dg-chip"><input type="radio" name="level" value="${esc(l.id)}" ${l.id === lv ? 'checked' : ''}><span>${esc(l.th)}</span></label>`).join('')}</div>
          </fieldset>
          <div class="dg-row2">
            <label class="dg-field">จำนวนรอบ (ทุกคนได้วาดรอบละครั้ง)
              <select name="rounds">${HUB.rounds.map((n) => `<option value="${n}" ${n === rounds ? 'selected' : ''}>${n} รอบ</option>`).join('')}</select></label>
            <label class="dg-field">เวลาวาดต่อตา
              <select name="drawSecs">${HUB.drawSecs.map((n) => `<option value="${n}" ${n === secs ? 'selected' : ''}>${n} วินาที</option>`).join('')}</select></label>
          </div>
          <label class="dg-check"><input type="checkbox" name="public" ${pref.public === false ? '' : 'checked'}><span><b>แสดงในรายการห้อง</b><small>คนอื่นเห็นห้องนี้และกดเข้าร่วมได้เลยโดยไม่ต้องใช้รหัส · ไม่เลือก = เข้าได้เฉพาะคนที่มีรหัสหรือคำเชิญ</small></span></label>
          <button class="btn btn-primary dg-big" type="submit">${ICON('paintbrush', 'icon icon-sm')} สร้างห้อง</button>
        </form>
      </section>
      <section class="dg-card" aria-labelledby="dg-join-h">
        <h2 id="dg-join-h">${ICON('door-open', 'icon icon-sm')} เข้าห้องด้วยรหัส</h2>
        <form id="dg-join" class="dg-join">
          <label class="sr-only" for="dg-code">รหัสห้อง</label>
          <input id="dg-code" name="code" inputmode="latin" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="เช่น K7MQ2" required>
          <button class="btn btn-secondary" type="submit">เข้าห้อง</button>
        </form>
        <p class="dg-muted">หรือกด "เข้าร่วม" จากการ์ดคำเชิญในแชทโลก</p>
      </section>
      <section class="dg-card dg-rules" aria-labelledby="dg-rules-h">
        <h2 id="dg-rules-h">${ICON('info', 'icon icon-sm')} กติกา</h2>
        <ul>
          <li>คนวาดเลือก 1 ใน 3 คำ แล้ววาดให้คนอื่นทาย <b>ห้ามเขียนตัวอักษรหรือตัวเลขของคำ</b></li>
          <li>พิมพ์คำตอบเป็นภาษาอังกฤษ ระหว่างทางจะเปิดตัวใบ้ทีละตัวอักษร</li>
          <li>ทายถูกได้ EXP · คนวาดได้ EXP ตามจำนวนคนที่ทายถูก · จบเกมได้โบนัส (รวมไม่เกิน ${HUB.expCap} EXP ต่อวัน)</li>
          <li>จบแต่ละตาจะเฉลยคำ คำแปล และประโยคตัวอย่าง · จบเกมเก็บคำทั้งหมดเข้าคิวทบทวนได้</li>
          <li>เจอภาพหรือข้อความไม่เหมาะสม กดชื่อผู้เล่นแล้วเลือก "รายงาน" ได้ทันที</li>
        </ul>
      </section>`;
    el.querySelector('#dg-create').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { level: f.get('level'), rounds: Number(f.get('rounds')), drawSecs: Number(f.get('drawSecs')), public: f.get('public') === 'on' };
      try { localStorage.setItem('eq_draw_pref', JSON.stringify(body)); } catch (_) { /* โหมดส่วนตัว */ }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try { enterRoom(await api('/rooms', { method: 'POST', body })); } catch (err) { App().toast(err.message, 'error'); btn.disabled = false; }
    });
    el.querySelector('#dg-join').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = String(new FormData(e.target).get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code) joinCode(code);
    });
    loadRooms(); startRoomsPoll();
    requestAnimationFrame(() => { const h = document.getElementById('dg-title'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } });
  }

  /* ---------- v1.21.0 รายการห้องที่เปิดอยู่ (กดเข้าร่วมได้เลย ไม่ต้องใส่รหัส) ---------- */
  let roomsTimer = null; let roomsBusy = false;
  const onHub = () => { const sc = document.getElementById('screen-draw'); return Boolean(sc && !sc.classList.contains('hidden') && document.getElementById('dg-rooms')); };
  function stopRoomsPoll() { clearInterval(roomsTimer); roomsTimer = null; }
  function startRoomsPoll() {
    stopRoomsPoll();
    roomsTimer = setInterval(() => { if (!onHub()) { stopRoomsPoll(); return; } if (!document.hidden) loadRooms(); }, 5000);
  }
  async function loadRooms() {
    const box = document.getElementById('dg-rooms');
    if (!box || roomsBusy) return;
    roomsBusy = true;
    try {
      const r = await api('/rooms');
      if (!onHub()) return;
      box.innerHTML = roomsHtml(r.rooms);
      if (window.EQAvatar && window.EQAvatar.hydrate) window.EQAvatar.hydrate(box);
    } catch (err) {
      if (!box.querySelector('.dg-room')) box.innerHTML = `<p class="dg-muted">${esc(err.message || 'โหลดรายการห้องไม่สำเร็จ')}</p>`;
    } finally { roomsBusy = false; }
  }
  function roomsHtml(list) {
    if (!list.length) return `<p class="dg-empty-rooms">${ICON('paintbrush', 'icon icon-sm')} ยังไม่มีห้องที่เปิดอยู่ — สร้างห้องแล้วชวนเพื่อนได้เลย</p>`;
    return `<ul class="dg-rooms" role="list">${list.map((r) => {
      const h = r.host || {};
      const full = r.players >= r.max;
      const dots = Array.from({ length: r.max }, (_, i) => `<i class="${i < r.players ? 'on' : ''}"></i>`).join('');
      return `<li class="dg-room${r.mine ? ' is-mine' : ''}">
        ${avatar({ id: h.id, username: h.username, avatar: h.avatar, avatarImage: h.avatarImage }, 'dg-room-av')}
        <div class="dg-room-main">
          <p class="dg-room-title"><b>ห้องของ ${esc(h.username || '—')}</b> <small>Lv.${Number(h.level) || 1}</small></p>
          <p class="dg-room-meta"><span class="dg-room-lv">${esc(r.levelTh)}</span><span>${r.rounds} รอบ · ${r.drawSecs} วิ</span>
            <span class="dg-room-st is-${esc(r.status)}">${r.status === 'waiting' ? 'รอผู้เล่น' : 'กำลังเล่น · เข้าระหว่างเกมได้'}</span></p>
          <p class="dg-room-count"><span class="dg-room-dots" aria-hidden="true">${dots}</span><b>${r.players}/${r.max} คน</b></p>
        </div>
        <button class="btn ${r.mine ? 'btn-secondary' : 'btn-primary'} dg-room-join" type="button" data-dg-room-join="${esc(r.code)}" ${full ? 'disabled' : ''}
          aria-label="${r.mine ? 'กลับเข้าห้อง' : 'เข้าร่วมห้อง'}ของ ${esc(h.username || '')} (${r.players}/${r.max} คน)">${r.mine ? 'กลับเข้าห้อง' : 'เข้าร่วม'}</button>
      </li>`;
    }).join('')}</ul>`;
  }
  document.addEventListener('click', (e) => {
    const j = e.target.closest('[data-dg-room-join]');
    if (j) { j.disabled = true; stopRoomsPoll(); joinCode(j.dataset.dgRoomJoin).finally(() => { j.disabled = false; if (onHub()) startRoomsPoll(); }); return; }
    if (e.target.closest('[data-dg-rooms-refresh]')) loadRooms();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && onHub()) loadRooms(); });

  async function joinCode(code) {
    try { enterRoom(await api(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: {} })); } catch (err) { App().toast(err.message, 'error'); }
  }
  async function openRoom(code) {
    App().showScreen('screen-draw');
    const el = root(); loading(el);
    try { enterRoom(await api(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: {} })); } catch (err) {
      el.innerHTML = `<div class="gl-empty" role="alert">${ICON('door-open', 'icon icon-lg')}<p>${esc(err.message)}</p><button class="btn btn-primary" type="button" data-dg-hub>ไปหน้าวาดทายศัพท์</button></div>`;
    }
  }
  function enterRoom(snap) {
    const fresh = !R || R.code !== snap.code;
    if (fresh) { chat = []; expGained = 0; }
    R = snap;
    setHash(`#/draw-room/${R.code}`); App().showScreen('screen-draw');
    renderRoom();
  }

  /* =========================================================== ห้อง */
  function roomTop() {
    const t = R.turn;
    const right = R.phase === 'lobby' ? `${R.players.length}/${R.settings.maxPlayers} คน`
      : t ? `รอบ ${Math.min(t.round, t.rounds)}/${t.rounds}` : '';
    return `<div class="dg-top">
      <button class="game-exit dg-exit" type="button" data-dg-leave>${ICON('log-out', 'icon icon-sm')} ออก</button>
      <span class="dg-code">ห้อง <b>${esc(R.code)}</b> <button class="dg-iconbtn" type="button" data-dg-copy aria-label="คัดลอกรหัสห้อง">${ICON('copy', 'icon icon-sm')}</button></span>
      <span class="dg-meta">${esc(R.settings.levelTh)} · ${esc(right)}</span>
    </div>`;
  }
  function playersHtml() {
    const sorted = R.phase === 'lobby' ? R.players : R.players.slice().sort((a, b) => b.score - a.score);
    return `<ol class="dg-players" aria-label="ผู้เล่น">${sorted.map((p) => `
      <li class="dg-player${p.id === R.me ? ' is-me' : ''}${p.connected ? '' : ' is-off'}${p.guessed ? ' is-guessed' : ''}${p.drawing ? ' is-drawing' : ''}">
        <button class="dg-pbtn" type="button" data-dg-player="${p.id}" aria-label="${esc(p.username)}${p.id === R.me ? ' (คุณ)' : ''} ${p.score} คะแนน${p.drawing ? ' กำลังวาด' : ''}${p.guessed ? ' ทายถูกแล้ว' : ''}${p.connected ? '' : ' หลุดการเชื่อมต่อ'}">
          ${avatar(p)}
          <span class="dg-pname">${esc(p.username)}${p.id === R.me ? ' <small>(คุณ)</small>' : ''}${p.host ? ` <span class="dg-host" title="เจ้าของห้อง">${ICON('crown', 'icon icon-xs')}</span>` : ''}</span>
          <span class="dg-pscore">${R.phase === 'lobby' ? `Lv.${Number(p.level) || 1}` : `${p.score}`}</span>
          ${p.drawing ? `<span class="dg-pbadge is-draw">${ICON('paintbrush', 'icon icon-xs')}</span>` : p.guessed ? `<span class="dg-pbadge is-ok">${ICON('check', 'icon icon-xs')}</span>` : ''}
        </button></li>`).join('')}</ol>`;
  }
  function chatHtml() {
    return `<section class="dg-chat" aria-label="คำทายและแชท">
      <ol class="dg-log" id="dg-log" aria-live="polite">${chat.map(chatLine).join('')}</ol>
      <form class="dg-guess" id="dg-guess" autocomplete="off">
        <label class="sr-only" for="dg-guess-in">${isDrawer() && R.phase === 'drawing' ? 'แชท' : 'พิมพ์คำทาย'}</label>
        <input id="dg-guess-in" maxlength="60" enterkeyhint="send" autocapitalize="off" spellcheck="false"
          placeholder="${R.phase === 'drawing' ? (isDrawer() ? 'คุณเป็นคนวาด — แชทได้ แต่ห้ามบอกคำ' : 'พิมพ์คำตอบเป็นภาษาอังกฤษ…') : 'พิมพ์ข้อความ…'}">
        <button class="btn btn-primary" type="submit" aria-label="ส่ง">${ICON('send', 'icon icon-sm')}</button>
      </form></section>`;
  }
  function chatLine(m) {
    if (m.sys) return `<li class="dg-line is-sys">${esc(m.text)}</li>`;
    if (m.ok) return `<li class="dg-line is-ok">${ICON('circle-check', 'icon icon-xs')} <b>${esc(m.username)}</b> ทายถูกแล้ว! +${Number(m.pts) || 0}</li>`;
    if (m.close) return `<li class="dg-line is-close">${ICON('lightbulb', 'icon icon-xs')} ${esc(m.text)}</li>`;
    return `<li class="dg-line${m.guessedChannel ? ' is-gch' : ''}"><b>${esc(m.from.username)}</b> ${esc(m.text)}</li>`;
  }
  function pushChat(m) {
    chat.push(m); if (chat.length > 120) chat = chat.slice(-120);
    const box = document.getElementById('dg-log');
    if (box) { const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60; box.insertAdjacentHTML('beforeend', chatLine(m)); while (box.children.length > 120) box.firstElementChild.remove(); if (stick) box.scrollTop = box.scrollHeight; }
  }

  function wordBar() {
    const t = R.turn;
    if (!t) return '';
    if (R.phase === 'choosing') return `<p class="dg-word is-wait">${isDrawer() ? 'เลือกคำที่จะวาด' : `${esc(playerName(t.drawerId))} กำลังเลือกคำ…`}</p>`;
    if (R.phase === 'drawing') {
      const shown = t.word ? t.word : (t.mask || '');
      return `<p class="dg-word" aria-label="${t.word ? `คำ: ${esc(t.word)}` : `คำ ${t.length} ตัวอักษร`}"><span class="dg-letters" id="dg-mask" lang="en">${shown.split('').map((c) => `<span>${c === '_' ? '&nbsp;' : esc(c)}</span>`).join('')}</span>
        <small>${t.length} ตัว${isDrawer() && t.th ? ` · ${esc(t.th)}` : ''}</small></p>`;
    }
    return '';
  }

  function renderRoom() {
    stopClock();
    const el = root();
    if (!R) return;
    if (R.phase === 'lobby') { el.innerHTML = `${roomTop()}${lobbyHtml()}`; bindRoom(); return; }
    if (R.phase === 'ended') { el.innerHTML = `${roomTop()}${resultHtml()}`; bindRoom(); return; }
    const t = R.turn || {};
    el.innerHTML = `${roomTop()}
      <div class="dg-game${isDrawer() ? ' is-drawer' : ''}">
        <div class="dg-stage">
          <div class="dg-bar"><span class="dg-timer" id="dg-timer" role="timer" aria-live="off">--</span>${wordBar()}
            <span class="dg-phase">${R.phase === 'drawing' ? `${esc(playerName(t.drawerId))} วาด` : esc(PHASE_TH[R.phase] || '')}</span></div>
          <div class="dg-board-wrap">
            <canvas class="dg-board" id="dg-board" width="${W}" height="${H}" aria-label="${isDrawer() ? 'กระดานวาด — ลากนิ้วหรือเมาส์เพื่อวาด' : `ภาพที่ ${esc(playerName(t.drawerId))} กำลังวาด`}" role="img"></canvas>
            ${overlayHtml()}
          </div>
          ${isDrawer() && R.phase === 'drawing' ? toolsHtml() : ''}
        </div>
        <aside class="dg-side">${playersHtml()}${chatHtml()}</aside>
      </div>`;
    bindRoom();
    setupCanvas();
    startClock();
  }

  function overlayHtml() {
    const t = R.turn || {};
    if (R.phase === 'choosing' && isDrawer() && t.choices) {
      return `<div class="dg-overlay" role="dialog" aria-labelledby="dg-choose-h"><h2 id="dg-choose-h">เลือกคำที่จะวาด</h2>
        <div class="dg-choices">${t.choices.map((c, i) => `<button class="dg-choice" type="button" data-dg-choose="${i}"><b lang="en">${esc(c.word)}</b><small>${esc(c.th)} · ${esc(c.level)}</small></button>`).join('')}</div>
        <p class="dg-muted">วาดภาพเท่านั้น ห้ามเขียนตัวอักษร</p></div>`;
    }
    if (R.phase === 'choosing') return `<div class="dg-overlay is-soft"><p>${ICON('hourglass', 'icon icon-sm')} ${esc(playerName(t.drawerId))} กำลังเลือกคำ…</p></div>`;
    if (R.phase === 'reveal' && t.reveal) {
      const v = t.reveal;
      const who = v.guessed.length ? `${v.guessed.length} คนทายถูก` : 'ไม่มีใครทายถูก';
      return `<div class="dg-overlay is-reveal" role="status"><p class="dg-muted">คำคือ</p>
        <h2 class="dg-reveal-w" lang="en">${esc(v.word)} <button class="dg-iconbtn" type="button" data-dg-say="${esc(v.word)}" aria-label="ฟังเสียง ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></h2>
        <p class="dg-reveal-th">${esc(v.th)} <small>${esc(v.level)}${v.pos ? ` · ${esc(v.pos)}` : ''}</small></p>
        ${v.example ? `<p class="dg-reveal-ex" lang="en">${esc(v.example)}</p><p class="dg-reveal-exth">${esc(v.exampleTh)}</p>` : ''}
        <p class="dg-muted">${esc(who)}${v.why === 'drawer_left' ? ' · คนวาดออกจากห้อง' : ''}</p></div>`;
    }
    return '';
  }
  function toolsHtml() {
    return `<div class="dg-tools" role="toolbar" aria-label="เครื่องมือวาด">
      <div class="dg-colors">${R.palette.colors.map((c, i) => `<button class="dg-color${!tool.e && tool.c === i ? ' is-on' : ''}" type="button" data-dg-color="${i}" style="--dg-c:${c}" aria-label="สี ${i + 1}" aria-pressed="${!tool.e && tool.c === i}"></button>`).join('')}</div>
      <div class="dg-sizes">${R.palette.sizes.map((s, i) => `<button class="dg-size${tool.w === i ? ' is-on' : ''}" type="button" data-dg-size="${i}" aria-label="ขนาด ${['เล็ก', 'กลาง', 'ใหญ่'][i]}" aria-pressed="${tool.w === i}"><span style="--dg-s:${Math.max(4, s)}px"></span></button>`).join('')}</div>
      <button class="dg-tool${tool.e ? ' is-on' : ''}" type="button" data-dg-eraser aria-pressed="${tool.e}">${ICON('eraser', 'icon icon-sm')}<span>ยางลบ</span></button>
      <button class="dg-tool" type="button" data-dg-undo>${ICON('undo-2', 'icon icon-sm')}<span>ย้อน</span></button>
      <button class="dg-tool" type="button" data-dg-clear>${ICON('trash-2', 'icon icon-sm')}<span>ล้าง</span></button>
    </div>`;
  }

  function lobbyHtml() {
    const s = R.settings;
    const canStart = R.players.filter((p) => p.connected).length >= 2;
    return `<div class="dg-lobby">
      <section class="dg-card">
        <h2>${ICON('users', 'icon icon-sm')} ผู้เล่น (${R.players.length}/${s.maxPlayers})</h2>
        ${playersHtml()}
        <div class="dg-invite">
          <button class="btn btn-secondary" type="button" data-dg-invite-world>${ICON('globe', 'icon icon-sm')} ชวนในแชทโลก</button>
          <button class="btn btn-secondary" type="button" data-dg-invite-friends>${ICON('user-plus', 'icon icon-sm')} ชวนเพื่อน</button>
          <button class="btn btn-secondary" type="button" data-dg-copy>${ICON('copy', 'icon icon-sm')} คัดลอกรหัส ${esc(R.code)}</button>
        </div>
        <div id="dg-friends" class="dg-friends" hidden></div>
      </section>
      <section class="dg-card">
        <h2>${ICON('sliders-horizontal', 'icon icon-sm')} ตั้งค่าห้อง</h2>
        ${isHost() ? `<form id="dg-settings" class="dg-form">
          <label class="dg-field">ระดับคำศัพท์ <select name="level">${(HUB ? HUB.levels : [{ id: s.level, th: s.levelTh }]).map((l) => `<option value="${esc(l.id)}" ${l.id === s.level ? 'selected' : ''}>${esc(l.th)}</option>`).join('')}</select></label>
          <div class="dg-row2">
            <label class="dg-field">รอบ <select name="rounds">${[1, 2, 3].map((n) => `<option value="${n}" ${n === s.rounds ? 'selected' : ''}>${n} รอบ</option>`).join('')}</select></label>
            <label class="dg-field">เวลาวาด <select name="drawSecs">${[60, 80, 100].map((n) => `<option value="${n}" ${n === s.drawSecs ? 'selected' : ''}>${n} วินาที</option>`).join('')}</select></label>
          </div>
          <label class="dg-check"><input type="checkbox" name="public" ${s.isPublic === false ? '' : 'checked'}><span><b>แสดงในรายการห้อง</b><small>คนอื่นกดเข้าร่วมได้เลยโดยไม่ต้องใช้รหัส</small></span></label></form>`
        : `<p>${esc(s.levelTh)} · ${s.rounds} รอบ · วาดตาละ ${s.drawSecs} วินาที · ${s.isPublic === false ? 'ห้องส่วนตัว (เข้าด้วยรหัส/คำเชิญ)' : 'แสดงในรายการห้อง'}</p><p class="dg-muted">เจ้าของห้องเป็นคนตั้งค่าและเริ่มเกม</p>`}
        ${isHost() ? `<button class="btn btn-primary dg-big" type="button" data-dg-start ${canStart ? '' : 'disabled'}>${ICON('play', 'icon icon-sm')} เริ่มเกม</button>
          ${canStart ? '' : '<p class="dg-muted">ต้องมีผู้เล่นออนไลน์อย่างน้อย 2 คน — ชวนเพื่อนหรือชวนในแชทโลกได้เลย</p>'}` : `<p class="dg-wait">${ICON('hourglass', 'icon icon-sm')} รอเจ้าของห้องเริ่มเกม…</p>`}
      </section>
      ${chatHtml()}
    </div>`;
  }

  function resultHtml() {
    const r = R.result || { players: [], words: [] };
    const mine = r.players.find((p) => p.id === R.me);
    return `<div class="dg-result">
      <section class="dg-card dg-podium-card"><h2 id="dg-res-h">${ICON('trophy', 'icon icon-sm')} สรุปผล${r.why === 'not_enough' ? ' (ผู้เล่นไม่พอ เกมจบก่อนกำหนด)' : ''}</h2>
        <ol class="dg-rank">${r.players.map((p) => `<li class="dg-rank-row${p.id === R.me ? ' is-me' : ''} is-p${p.place}"><span class="dg-place">${p.place}</span>${avatar(p)}<b>${esc(p.username)}</b><span>${p.score} คะแนน</span></li>`).join('')}</ol>
        ${mine ? `<p class="dg-exp">${ICON('sparkles', 'icon icon-sm')} เกมนี้คุณได้ ${expGained} EXP</p>` : ''}
      </section>
      <section class="dg-card"><h2>${ICON('book-open', 'icon icon-sm')} คำที่เจอในเกม (${r.words.length})</h2>
        <ul class="dg-words">${r.words.map((w) => `<li><button class="dg-iconbtn" type="button" data-dg-say="${esc(w.word)}" aria-label="ฟังเสียง ${esc(w.word)}">${ICON('volume-2', 'icon icon-xs')}</button><b lang="en">${esc(w.word)}</b> <span>${esc(w.th)}</span> <small>${esc(w.level)}</small></li>`).join('')}</ul>
        ${r.words.length ? `<button class="btn btn-secondary" type="button" data-dg-save>${ICON('bookmark-plus', 'icon icon-sm')} เก็บคำทั้งหมดเข้าคิวทบทวน</button>` : ''}
      </section>
      <div class="dg-actions">
        ${isHost() ? `<button class="btn btn-primary" type="button" data-dg-rematch>${ICON('rotate-ccw', 'icon icon-sm')} เล่นอีกรอบ</button>` : '<p class="dg-muted">รอเจ้าของห้องกด "เล่นอีกรอบ" หรือออกจากห้องได้</p>'}
        <button class="btn btn-secondary" type="button" data-dg-leave>ออกจากห้อง</button>
      </div>
    </div>`;
  }

  function bindRoom() {
    const f = document.getElementById('dg-guess');
    if (f) {
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = document.getElementById('dg-guess-in');
        const text = inp.value.trim();
        if (!text) return;
        if (send('draw:guess', { text })) inp.value = '';
      });
    }
    const box = document.getElementById('dg-log'); if (box) box.scrollTop = box.scrollHeight;
    const st = document.getElementById('dg-settings');
    if (st) st.addEventListener('change', () => { const d = new FormData(st); send('draw:settings', { level: d.get('level'), rounds: Number(d.get('rounds')), drawSecs: Number(d.get('drawSecs')), public: d.get('public') === 'on' }); });
    if (R.phase === 'drawing' && !isDrawer()) { const inp = document.getElementById('dg-guess-in'); if (inp && window.matchMedia('(min-width: 1024px)').matches) inp.focus({ preventScroll: true }); }
  }

  /* =========================================================== เวลา */
  function startClock() {
    stopClock();
    const tick = () => {
      const el = document.getElementById('dg-timer');
      if (!el || !R || !R.turn) return;
      const left = Math.max(0, Math.ceil((R.turn.endsAt - (Date.now() + skew)) / 1000));
      el.textContent = String(left);
      el.classList.toggle('is-low', R.phase === 'drawing' && left <= 10);
    };
    tick(); clockTimer = setInterval(tick, 250);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  /* =========================================================== กระดาน */
  function setupCanvas() {
    canvas = document.getElementById('dg-board');
    if (!canvas) { ctx = null; return; }
    ctx = canvas.getContext('2d');
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    redraw();
    if (isDrawer() && R.phase === 'drawing') {
      canvas.classList.add('is-active');
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', up);
    }
  }
  function redraw() {
    if (!ctx) return;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    lastPt.clear();
    for (const s of (R && R.strokes) || []) paint(s);
  }
  function paint(s) {
    if (!ctx || !s || !s.p || !s.p.length) return;
    ctx.strokeStyle = s.e ? BG : R.palette.colors[s.c] || '#111827';
    ctx.lineWidth = (R.palette.sizes[s.w] || 9) * (s.e ? 2.2 : 1);
    ctx.beginPath();
    const prev = lastPt.get(s.id);
    const [x0, y0] = prev || s.p[0];
    ctx.moveTo(x0, y0);
    if (!prev && s.p.length === 1) ctx.lineTo(x0 + 0.01, y0);
    for (const [x, y] of s.p) ctx.lineTo(x, y);
    ctx.stroke();
    lastPt.set(s.id, s.p[s.p.length - 1]);
  }
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.round(Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W))), Math.round(Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H)))];
  }
  function down(e) {
    if (!isDrawer() || R.phase !== 'drawing') return;
    e.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    drawingNow = true;
    strokeId += 1;
    pendingSeg = { id: strokeId, c: tool.c, w: tool.w, e: tool.e, p: [pt(e)] };
    local(pendingSeg, true);
    scheduleFlush();
  }
  function move(e) {
    if (!drawingNow || !pendingSeg) return;
    e.preventDefault();
    const p = pt(e);
    const lp = pendingSeg.p[pendingSeg.p.length - 1] || lastPt.get(pendingSeg.id);
    if (lp && Math.abs(lp[0] - p[0]) + Math.abs(lp[1] - p[1]) < 3) return;
    local({ ...pendingSeg, p: [p] });
    pendingSeg.p.push(p);
    if (pendingSeg.p.length >= 48) flush();
  }
  function up() { if (!drawingNow) return; drawingNow = false; flush(); }
  function local(seg, first) {
    if (first) { lastPt.delete(seg.id); }
    paint(seg);
  }
  function scheduleFlush() { clearTimeout(segTimer); segTimer = setTimeout(() => { flush(); if (drawingNow) scheduleFlush(); }, 45); }
  function flush() {
    if (!pendingSeg || !pendingSeg.p.length) return;
    const seg = { id: pendingSeg.id, c: pendingSeg.c, w: pendingSeg.w, e: pendingSeg.e, p: pendingSeg.p.slice(0, 64) };
    R.strokes.push(seg);
    send('draw:stroke', { s: seg });
    const last = pendingSeg.p[pendingSeg.p.length - 1];
    pendingSeg = drawingNow ? { ...pendingSeg, p: [] } : null;
    if (pendingSeg) lastPt.set(pendingSeg.id, last);
  }

  /* =========================================================== เมนูผู้เล่น (รายงาน / เตะ) */
  function playerMenu(id) {
    const p = R.players.find((x) => x.id === id);
    if (!p || id === R.me) return;
    const old = document.getElementById('dg-menu'); if (old) old.remove();
    const reasons = (HUB && HUB.reportReasons) || { drawing: 'ภาพวาดไม่เหมาะสม', letters: 'เขียนตัวอักษร/บอกคำตอบ', chat: 'ข้อความไม่เหมาะสม', other: 'อื่น ๆ' };
    const d = document.createElement('div');
    d.id = 'dg-menu'; d.className = 'dg-sheet'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'dg-menu-h');
    d.innerHTML = `<div class="dg-sheet-box"><h2 id="dg-menu-h">${avatar(p)} ${esc(p.username)}</h2>
      <form id="dg-report"><fieldset><legend>รายงานผู้เล่นนี้</legend>
        ${Object.entries(reasons).map(([k, v], i) => `<label class="dg-radio"><input type="radio" name="reason" value="${esc(k)}" ${i === 0 ? 'checked' : ''}> ${esc(v)}</label>`).join('')}
        <label class="dg-field">รายละเอียด (ไม่บังคับ)<textarea name="note" maxlength="200" rows="2"></textarea></label></fieldset>
        <p class="dg-muted">${p.drawing ? 'ระบบจะเก็บภาพที่กำลังวาดตอนนี้ไว้ให้ผู้ดูแลตรวจ' : 'ผู้ดูแลจะตรวจสอบรายงาน'}</p>
        <div class="dg-sheet-act"><button class="btn btn-primary" type="submit">${ICON('flag', 'icon icon-sm')} ส่งรายงาน</button>
        ${isHost() ? `<button class="btn btn-secondary dg-danger" type="button" data-dg-kick="${p.id}">${ICON('user-x', 'icon icon-sm')} เชิญออกจากห้อง</button>` : ''}
        <button class="btn btn-secondary" type="button" data-dg-close>ปิด</button></div></form></div>`;
    document.body.appendChild(d);
    d.querySelector('textarea').focus({ preventScroll: true });
    const close = () => d.remove();
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-dg-close]')) close(); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    d.querySelector('#dg-report').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { const r = await api('/report', { method: 'POST', body: { userId: id, reason: fd.get('reason'), note: fd.get('note') } }); App().toast(r.duplicate ? 'รายงานผู้เล่นนี้ไปแล้ว' : 'ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแล', 'success'); close(); } catch (err) { App().toast(err.message, 'error'); }
    });
    const k = d.querySelector('[data-dg-kick]');
    if (k) k.addEventListener('click', () => { send('draw:kick', { userId: id }); close(); });
  }

  async function friendsPicker() {
    const box = document.getElementById('dg-friends');
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<p class="dg-muted">กำลังโหลดรายชื่อเพื่อน…</p>';
    try {
      const { friends } = await App().api('/friends');
      const on = (friends || []).filter((f) => f.online && !R.players.some((p) => p.id === f.id));
      box.innerHTML = on.length ? `<ul>${on.map((f) => `<li>${avatar(f)} <b>${esc(f.username)}</b> <button class="mini-btn" type="button" data-dg-invite-friend="${Number(f.id)}">ชวน</button></li>`).join('')}</ul>`
        : '<p class="dg-muted">ไม่มีเพื่อนที่ออนไลน์อยู่ตอนนี้ — ลองชวนในแชทโลก</p>';
    } catch (err) { box.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
  }

  /* =========================================================== คลิก */
  document.addEventListener('click', async (e) => {
    const scr = document.getElementById('screen-draw');
    const t = e.target.closest('button');
    if (!t) return;
    // การ์ดคำเชิญในแชทโลก (อยู่นอกหน้าจอเกม)
    if (t.dataset.dgJoinInvite) { e.preventDefault(); if (window.EQWorldChat) window.EQWorldChat.close(); joinCode(t.dataset.dgJoinInvite); return; }
    if (!scr || scr.classList.contains('hidden') || !scr.contains(t)) return;
    if (t.dataset.dgOpen) { joinCode(t.dataset.dgOpen); return; }
    if ('dgHub' in t.dataset) { openHub(); return; }
    if ('dgLeave' in t.dataset) {
      if (R && R.phase !== 'lobby' && R.phase !== 'ended' && !t.dataset.sure) { t.dataset.sure = '1'; t.innerHTML = `${ICON('log-out', 'icon icon-sm')} กดอีกครั้งเพื่อออก`; setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.innerHTML = `${ICON('log-out', 'icon icon-sm')} ออก`; } }, 3000); return; }
      try { await api('/leave', { method: 'POST', body: {} }); } catch (_) { /* ออกฝั่งหน้าเว็บต่อ */ }
      R = null; chat = []; openHub(); return;
    }
    if ('dgCopy' in t.dataset) { try { await navigator.clipboard.writeText(R.code); App().toast(`คัดลอกรหัสห้อง ${R.code} แล้ว`, 'success'); } catch (_) { App().toast(`รหัสห้อง: ${R.code}`, 'info'); } return; }
    if ('dgInviteWorld' in t.dataset) {
      t.disabled = true;
      try { await api('/invite/world', { method: 'POST', body: {} }); App().toast('ส่งคำเชิญในแชทโลกแล้ว', 'success'); } catch (err) { App().toast(err.message, 'error'); }
      setTimeout(() => { if (t.isConnected) t.disabled = false; }, 4000);
      return;
    }
    if ('dgInviteFriends' in t.dataset) { friendsPicker(); return; }
    if (t.dataset.dgInviteFriend) {
      t.disabled = true;
      try { await api('/invite/friend', { method: 'POST', body: { userId: Number(t.dataset.dgInviteFriend) } }); t.textContent = 'ชวนแล้ว'; } catch (err) { App().toast(err.message, 'error'); t.disabled = false; }
      return;
    }
    if ('dgStart' in t.dataset) { send('draw:start'); return; }
    if (t.dataset.dgChoose) { send('draw:choose', { index: Number(t.dataset.dgChoose) }); return; }
    if (t.dataset.dgColor) { tool = { ...tool, c: Number(t.dataset.dgColor), e: false }; refreshTools(); return; }
    if (t.dataset.dgSize) { tool = { ...tool, w: Number(t.dataset.dgSize) }; refreshTools(); return; }
    if ('dgEraser' in t.dataset) { tool = { ...tool, e: !tool.e }; refreshTools(); return; }
    if ('dgUndo' in t.dataset) { const last = R.strokes.length ? R.strokes[R.strokes.length - 1].id : null; if (last !== null) { R.strokes = R.strokes.filter((s) => s.id !== last); redraw(); send('draw:undo'); } return; }
    if ('dgClear' in t.dataset) { R.strokes = []; redraw(); send('draw:clear'); return; }
    if (t.dataset.dgPlayer) { playerMenu(Number(t.dataset.dgPlayer)); return; }
    if (t.dataset.dgSay) { App().speak(t.dataset.dgSay); return; }
    if ('dgRematch' in t.dataset) { send('draw:rematch'); return; }
    if ('dgSave' in t.dataset) {
      t.disabled = true;
      try { const r = await api('/save-words', { method: 'POST', body: {} }); t.innerHTML = `${ICON('bookmark-check', 'icon icon-sm')} เก็บแล้ว ${r.saved} คำ`; } catch (err) { App().toast(err.message, 'error'); t.disabled = false; }
    }
  });
  function refreshTools() {
    const box = document.querySelector('.dg-tools');
    if (box) box.outerHTML = toolsHtml();
  }

  /* =========================================================== WebSocket */
  function onMessage(msg) {
    if (msg.type === 'draw:invite_state') { inviteCache.set(msg.code, msg); updateInviteCards(msg.code); return; }
    if (msg.type === 'draw:invited') {
      App().toast(`${msg.from.username} ชวนเล่นวาดทายศัพท์ (${msg.levelTh})`, 'info', { action: { label: 'เข้าร่วม', onClick: () => joinCode(msg.code) } });
      return;
    }
    if (!R && msg.type !== 'draw:state') return;
    switch (msg.type) {
      case 'draw:state': {
        if (msg.serverNow !== undefined) skew = 0;
        if (msg.turn && msg.turn.serverNow) skew = msg.turn.serverNow - Date.now();
        const was = R ? R.phase : null; const wasTurn = R && R.turn ? R.turn.turnNo : null;
        const onScreen = !document.getElementById('screen-draw').classList.contains('hidden');
        R = msg; delete R.type;
        if (!onScreen) return;
        // สถานะเต็มมาเฉพาะตอนเปลี่ยนช่วง (เลือกคำ/วาด/เฉลย/จบ) หรือกลับเข้าห้อง -> วาดหน้าใหม่ทั้งหมด
        renderRoom();
        if (R.phase === 'reveal' && R.turn && R.turn.reveal && (was !== 'reveal' || wasTurn !== R.turn.turnNo)) pushChat({ sys: true, text: `คำคือ "${R.turn.reveal.word}" (${R.turn.reveal.th})` });
        break;
      }
      case 'draw:players': R.players = msg.players; R.hostId = msg.hostId; refreshPlayers(); break;
      case 'draw:stroke': if (R.phase === 'drawing') { R.strokes.push(msg.s); paint(msg.s); } break;
      case 'draw:undo': R.strokes = R.strokes.filter((s) => s.id !== msg.id); redraw(); break;
      case 'draw:clear': R.strokes = []; redraw(); break;
      case 'draw:hint': if (R.turn) { R.turn.mask = msg.mask; const m = document.getElementById('dg-mask'); if (m) m.innerHTML = msg.mask.split('').map((c) => `<span>${c === '_' ? '&nbsp;' : esc(c)}</span>`).join(''); } break;
      case 'draw:word': if (R.turn) { R.turn.word = msg.word; const bar = document.querySelector('.dg-word'); if (bar) bar.outerHTML = wordBar(); } break;
      case 'draw:guessed': pushChat({ ok: true, username: msg.username, pts: msg.pts }); if (msg.userId === R.me) { const inp = document.getElementById('dg-guess-in'); if (inp) inp.placeholder = 'ทายถูกแล้ว! แชทได้เฉพาะกับคนที่ทายถูก'; } break;
      case 'draw:close': pushChat({ close: true, text: msg.text }); break;
      case 'draw:chat': pushChat(msg); break;
      case 'draw:exp':
        if (msg.gained) { expGained += msg.gained; if (msg.levelInfo) App().applyLevelInfo(msg.levelInfo, msg.leveledUp); }
        else if (msg.capped && Date.now() - lastExpCapToast > 60000) { lastExpCapToast = Date.now(); App().toast('วันนี้ได้ EXP จากโหมดนี้ครบเพดานแล้ว — เล่นต่อได้ตามปกติ', 'info'); }
        break;
      case 'draw:kicked': App().toast('คุณถูกเชิญออกจากห้อง', 'info'); R = null; openHub(); break;
      case 'draw:closed': if (R && msg.code === R.code) { App().toast(msg.why === 'idle' ? 'ห้องปิดเพราะไม่มีการเล่นนาน' : 'ห้องปิดแล้ว', 'info'); R = null; if (!document.getElementById('screen-draw').classList.contains('hidden')) openHub(); } break;
      case 'draw:error': App().toast(msg.message || 'เกิดข้อผิดพลาด', 'error'); break;
      default: break;
    }
  }
  function refreshPlayers() {
    document.querySelectorAll('.dg-players').forEach((ol) => { ol.outerHTML = playersHtml(); });
    const st = document.querySelector('[data-dg-start]');
    if (st) st.disabled = R.players.filter((p) => p.connected).length < 2;
  }
  // เชื่อมต่อใหม่ (เน็ตหลุด) -> ขอสถานะห้องล่าสุด
  window.addEventListener('eq:rt', (e) => { if (e.detail && e.detail.connected && R) setTimeout(() => send('draw:sync', { code: R.code }), 300); });

  /* =========================================================== การ์ดคำเชิญในแชทโลก */
  const STATUS_TH = { waiting: 'รอผู้เล่น', playing: 'กำลังเล่น เข้าร่วมได้', full: 'ห้องเต็ม', ended: 'จบเกมแล้ว', closed: 'ห้องปิดแล้ว' };
  function inviteCard(inv) {
    const p = inviteCache.get(inv.code);
    const open = p ? p.open : true;
    const status = p ? (p.mine ? 'คุณอยู่ในห้องนี้' : STATUS_TH[p.status] || '') : 'กำลังตรวจสถานะห้อง…';
    return `<div class="dg-invcard${open ? '' : ' is-closed'}" data-dg-inv="${esc(inv.code)}">
      <span class="dg-invcard-ic">${ICON('paintbrush', 'icon icon-sm')}</span>
      <span class="dg-invcard-t"><b>วาดทายศัพท์</b><small>${p && p.levelTh ? `${esc(p.levelTh)} · ` : ''}${p && p.players !== undefined ? `${p.players}/${p.max} คน · ` : ''}${esc(status)}</small></span>
      ${open ? `<button class="btn btn-primary dg-invcard-b" type="button" data-dg-join-invite="${esc(inv.code)}">${p && p.mine ? 'เปิดห้อง' : 'เข้าร่วม'}</button>` : ''}
    </div>`;
  }
  function updateInviteCards(code) {
    document.querySelectorAll(`[data-dg-inv="${CSS.escape(code)}"]`).forEach((el) => { el.outerHTML = inviteCard({ code }); });
  }
  const peeking = new Set();
  async function peekInvite(code) {
    if (peeking.has(code) || inviteCache.has(code)) return;
    peeking.add(code);
    try { inviteCache.set(code, await api(`/rooms/${encodeURIComponent(code)}/peek`)); updateInviteCards(code); } catch (_) { /* แสดงสถานะเดิม */ } finally { peeking.delete(code); }
  }
  // แชทโลกเรียกเมื่อวาดข้อความที่เป็นคำเชิญ
  function renderInvite(inv) { if (!inv || inv.kind !== 'draw') return ''; setTimeout(() => peekInvite(inv.code), 0); return inviteCard(inv); }

  window.EQDraw = {
    open: (param) => (param ? openRoom(String(param).toUpperCase()) : (R ? openRoom(R.code) : openHub())),
    onMessage, renderInvite, joinCode,
    _state: () => ({ R, chat, tool }),
  };
})();
