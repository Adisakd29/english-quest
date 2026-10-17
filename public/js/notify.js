/*
  แจ้งเตือนบนโทรศัพท์ (Web Push) + ป๊อปอัปแพตช์ล่าสุด
    - ขออนุญาตแจ้งเตือนเมื่อผู้ใช้กดปุ่มเองเท่านั้น (การ์ดในหน้าโปรไฟล์ / การ์ดชวนในหน้าหลัก)
    - iPhone/iPad: ต้องเพิ่มแอปลงหน้าจอโฮมก่อน (ข้อจำกัดของ iOS) — แสดงวิธีทำแทนปุ่มที่กดไม่ได้ผล
    - แพตช์โน้ต: เด้งครั้งเดียวต่อแพตช์ (จำไว้ที่บัญชี) · เปิดดูย้อนหลังได้ที่ โปรไฟล์ -> มีอะไรใหม่
*/
(function () {
  const app = () => window.EQApp;
  const G = () => window.EQG;
  const esc = (s) => G().esc(s);
  const ic = (n, c = 'icon-sm') => G().icon(n, c);

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const needsInstall = () => isIOS && !standalone;

  let cfg = null;
  async function loadCfg(force = false) {
    if (!cfg || force) cfg = await app().api('/notifications/config');
    return cfg;
  }
  function b64ToU8(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function currentSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } };

  async function enable() {
    if (needsInstall()) { showInstallHelp(); return false; }
    if (!supported()) { app().toast('เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน', 'error'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      app().toast(perm === 'denied' ? 'ปิดการแจ้งเตือนไว้ — เปิดได้ในการตั้งค่าเบราว์เซอร์' : 'ยังไม่ได้อนุญาตการแจ้งเตือน', 'info');
      return false;
    }
    const { publicKey } = await loadCfg();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
    await app().api('/notifications/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), timezone: tz() } });
    await loadCfg(true);
    app().toast(`เปิดแจ้งเตือนแล้ว — จะเตือนราว ${cfg.reminderTime} น. ในวันที่ยังไม่ได้เข้ามาเล่น`, 'success');
    return true;
  }
  async function disable() {
    const sub = await currentSub();
    if (sub) {
      await app().api('/notifications/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    await loadCfg(true);
    app().toast('ปิดแจ้งเตือนในเครื่องนี้แล้ว', 'info');
  }

  function showInstallHelp() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card notif-help">
      <h2 class="vb-sheet-title">เปิดแจ้งเตือนบน iPhone / iPad</h2>
      <p>iOS ให้เว็บแอปแจ้งเตือนได้เมื่อเพิ่มลงหน้าจอโฮมแล้วเท่านั้น (iOS 16.4 ขึ้นไป)</p>
      <ol class="notif-steps">
        <li>เปิด EnglishQuest ใน <b>Safari</b></li>
        <li>กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ด้านล่าง</li>
        <li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b></li>
        <li>เปิดแอปจากไอคอนจิ้งจอกบนหน้าจอโฮม แล้วกด "เปิดการแจ้งเตือน" อีกครั้ง</li>
      </ol>
      <button class="btn btn-primary btn-block" type="button" data-close>เข้าใจแล้ว</button></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'วิธีเปิดแจ้งเตือนบน iPhone' });
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  }

  /* ---------------- การ์ดในหน้าโปรไฟล์ ---------------- */
  const TIMES = [];
  for (let m = 6 * 60; m <= 21 * 60 + 30; m += 30) TIMES.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

  async function renderCard() {
    const body = document.getElementById('notif-body');
    if (!body) return;
    let c; let sub = null;
    try { c = await loadCfg(true); sub = await currentSub().catch(() => null); }
    catch (err) { body.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; return; }
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const on = Boolean(sub) && perm === 'granted';
    let html;
    if (needsInstall()) {
      html = `<p class="page-sub">บน iPhone/iPad ต้องเพิ่มแอปลงหน้าจอโฮมก่อน จึงจะรับแจ้งเตือนได้</p>
        <button class="btn btn-secondary btn-block" type="button" data-nt="help">${ic('info')} ดูวิธีเพิ่มลงหน้าจอโฮม</button>`;
    } else if (!supported()) {
      html = '<p class="page-sub">เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน — ลอง Chrome, Edge, Firefox หรือ Safari (เพิ่มลงหน้าจอโฮม)</p>';
    } else if (perm === 'denied') {
      html = '<p class="page-sub">เว็บนี้ถูกปิดการแจ้งเตือนไว้ในเบราว์เซอร์ — เปิดได้ที่ ตั้งค่าเว็บไซต์ (ไอคอนแม่กุญแจข้างที่อยู่เว็บ) → การแจ้งเตือน → อนุญาต แล้วกลับมาหน้านี้</p>';
    } else if (!on) {
      html = `<p class="page-sub">ให้จิ้งจอกเตือนวันละครั้งในวันที่ยังไม่ได้เข้ามาฝึก — วันไหนเข้ามาแล้วจะไม่เตือน</p>
        <button class="btn btn-primary btn-block" type="button" data-nt="enable">${ic('mail')} เปิดการแจ้งเตือนในเครื่องนี้</button>`;
    } else {
      html = `<label class="au-row au-mute notif-row"><span class="au-label">${ic('clock')} เตือนให้เข้ามาเล่นทุกวัน</span>
          <input type="checkbox" role="switch" data-nt="toggle" ${c.reminderEnabled ? 'checked' : ''} aria-label="เตือนให้เข้ามาเล่นทุกวัน"></label>
        <label class="notif-time ${c.reminderEnabled ? '' : 'is-off'}"><span>เวลาเตือน</span>
          <select data-nt="time" ${c.reminderEnabled ? '' : 'disabled'} aria-label="เวลาเตือน">${TIMES.map((t) => `<option ${t === c.reminderTime ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <small>${esc(c.timezone)}</small></label>
        <p class="au-note">เตือนวันละไม่เกิน 1 ครั้ง · ไม่เตือนถ้าวันนั้นเข้าแอปแล้ว · เปิดอยู่ ${c.devices} เครื่อง</p>
        <div class="notif-actions">
          <button class="btn btn-secondary" type="button" data-nt="test">${ic('send')} ทดสอบ</button>
          <button class="btn btn-secondary" type="button" data-nt="disable">ปิดในเครื่องนี้</button></div>`;
    }
    body.innerHTML = html;
    G().iconize && G().iconize(body);
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-nt]');
    if (!b || b.tagName === 'SELECT' || b.type === 'checkbox') return;
    const k = b.dataset.nt;
    b.disabled = true;
    try {
      if (k === 'enable') { await enable(); renderCard(); hideNudge(); }
      else if (k === 'disable') { await disable(); renderCard(); }
      else if (k === 'help') showInstallHelp();
      else if (k === 'test') { await app().api('/notifications/test', { method: 'POST' }); app().toast('ส่งแจ้งเตือนทดสอบแล้ว — ดูที่แถบแจ้งเตือนของเครื่อง', 'success'); }
    } catch (err) { app().toast(err.message || 'ทำรายการไม่สำเร็จ', 'error'); }
    finally { b.disabled = false; }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-nt="toggle"], [data-nt="time"]');
    if (!el) return;
    const body = el.dataset.nt === 'toggle' ? { reminderEnabled: el.checked } : { reminderTime: el.value };
    try {
      await app().api('/notifications/prefs', { method: 'PUT', body });
      app().toast(el.dataset.nt === 'toggle' ? (el.checked ? 'เปิดการเตือนรายวันแล้ว' : 'ปิดการเตือนรายวันแล้ว') : `จะเตือนราว ${el.value} น.`, 'success');
      renderCard();
    } catch (err) { app().toast(err.message, 'error'); renderCard(); }
  });

  /* ---------------- การ์ดชวนเปิดแจ้งเตือนในหน้าหลัก ---------------- */
  const NUDGE_KEY = 'eq_notif_nudge';
  function hideNudge() { const n = document.getElementById('notif-nudge'); if (n) n.classList.add('hidden'); }
  async function maybeNudge() {
    const el = document.getElementById('notif-nudge');
    const u = app() && app().user;
    if (!el || !u || !(u.exp > 0)) return;                                    // ให้ลองใช้แอปก่อน ค่อยชวน
    try { const t = Number(localStorage.getItem(NUDGE_KEY) || 0); if (Date.now() - t < 14 * 864e5) return; } catch (_) { return; }
    if (!needsInstall()) {
      if (!supported() || Notification.permission !== 'default') return;
      if (await currentSub().catch(() => null)) return;
    }
    el.innerHTML = `<span class="notif-nudge-icon">${ic('mail', '')}</span>
      <span class="notif-nudge-text"><b>ไม่อยากลืมฝึกทุกวัน?</b><small>ให้จิ้งจอกส่งแจ้งเตือนไปที่โทรศัพท์ วันละครั้ง</small></span>
      <span class="notif-nudge-actions"><button class="mini-btn accept" type="button" data-nt="enable">เปิดเลย</button>
      <button class="mini-btn ghost" type="button" data-nudge-later>ไว้ทีหลัง</button></span>`;
    el.classList.remove('hidden');
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-nudge-later]')) return;
    try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch (_) { /* ไม่เป็นไร */ }
    hideNudge();
  });

  /* เปิดแอปแล้ว: เครื่องนี้อนุญาตไว้แล้ว -> ส่ง subscription ล่าสุดให้เซิร์ฟเวอร์ (เปลี่ยนบัญชี/subscription หมดอายุ) */
  let synced = false;
  async function syncSubscription() {
    if (synced || !supported() || Notification.permission !== 'granted') return;
    synced = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { publicKey } = await loadCfg();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      }
      await app().api('/notifications/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), timezone: tz() } });
    } catch (_) { /* ไม่ critical */ }
  }

  /* ---------------- แพตช์โน้ต ---------------- */
  function entryHtml(en) {
    return `<div class="cl-entry"><p class="cl-meta">v${esc(en.version)} · ${esc(new Date(en.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
      <h3 class="cl-title">${esc(en.title)}</h3>
      <ul class="cl-list">${en.items.map((it) => `<li><span class="cl-icon">${ic(it.icon, '')}</span>
        <span><b>${esc(it.title)}</b><small>${esc(it.text)}</small></span></li>`).join('')}</ul></div>`;
  }
  function showChangelog(entries, { all = false, onClose } = {}) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card cl-card">
      <p class="cl-kicker">${ic('sparkles')} ${all ? 'แพตช์โน้ต' : 'มีอะไรใหม่'}</p>
      <div class="cl-body">${(all ? entries : entries.slice(0, 1)).map(entryHtml).join('<hr class="cl-sep">')}</div>
      <button class="btn btn-primary btn-block" type="button" data-cl-ok data-autofocus>${all ? 'ปิด' : 'เยี่ยม! ไปเล่นกัน'}</button></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'แพตช์โน้ต', variant: 'center', onClose });   // ปิดวิธีไหนก็ได้ (ปุ่ม/Esc/แตะพื้นหลัง) = เห็นแล้ว
    ov.querySelector('[data-cl-ok]').addEventListener('click', () => ov.remove());
  }
  let clChecked = false;
  async function maybeChangelog(tries = 0) {
    if (clChecked) return;
    const busy = document.body.classList.contains('dialog-open') || !document.getElementById('screen-ranked-match').classList.contains('hidden');
    if (busy) { if (tries < 20) setTimeout(() => maybeChangelog(tries + 1), 3000); return; }
    clChecked = true;
    try {
      const d = await app().api('/changelog');
      if (!d.unseen || !d.entries.length) return;
      let done = false;
      showChangelog(d.entries, { onClose: () => { if (done) return; done = true; app().api('/changelog/seen', { method: 'POST' }).catch(() => {}); } });
    } catch (_) { /* ไม่ critical */ }
  }
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#btn-whats-new')) return;
    try { const d = await app().api('/changelog'); showChangelog(d.entries, { all: true }); } catch (err) { app().toast(err.message, 'error'); }
  });

  window.addEventListener('eq:screen', (e) => {
    if (!app() || !app().user) return;
    const id = e.detail.id;
    if (id === 'screen-profile') renderCard();
    if (id === 'screen-home') maybeNudge();
    syncSubscription();
    setTimeout(() => maybeChangelog(), 1200);
  });

  window.EQNotify = { enable, disable, renderCard, showChangelog };
})();
