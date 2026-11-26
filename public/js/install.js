/* =====================================================================
   PWA Smart Install (v1.24.0) — window.EQInstall
   ชวนติดตั้ง English Quest เป็นแอปบนหน้าจอโฮม ตามความสามารถจริงของแต่ละระบบ

   - Android / Chrome / Edge / Samsung Internet (มี beforeinstallprompt): เก็บ event ไว้ → ผู้ใช้กด "ติดตั้งแอป"
     → เรียกหน้าต่างติดตั้งของเบราว์เซอร์ (prompt) · บอก "ติดตั้งแล้ว" เมื่อได้ event appinstalled เท่านั้น
   - iPhone / iPad: ติดตั้งผ่าน JavaScript ไม่ได้ (ข้อจำกัดของ Apple) → แสดงขั้นตอน "เพิ่มไปยังหน้าจอโฮม" ตามเวอร์ชัน/เบราว์เซอร์
     ไม่มีปุ่มติดตั้งปลอม — ปุ่มหลักคือ "ดูวิธีเพิ่มลงหน้าจอโฮม" ซึ่งเปิดขั้นตอนจริง
   - เบราว์เซอร์ในแอป (LINE / Facebook / Instagram ฯลฯ) ติดตั้งไม่ได้ → ปุ่ม "เปิดในเบราว์เซอร์" (LINE: ?openExternalBrowser=1)
   - เบราว์เซอร์ที่ไม่มีทางติดตั้ง (เช่น Firefox บนคอม) → ไม่แสดงป๊อปอัป ไม่แสดงเมนู

   การแสดงป๊อปอัปอัตโนมัติ (ครั้งเดียวต่อการเปิดเว็บ):
   - ไม่แสดงถ้าเปิดเป็นแอปอยู่แล้ว (standalone) / เคยติดตั้งแล้ว / กด "ไว้ทีหลัง" ภายใน 7 วัน / ติดตั้งไม่ได้ในตอนนี้
   - แสดงหลังเข้าสู่ระบบแล้ว อยู่หน้าแรก ผู้ใช้เริ่มแตะ/พิมพ์แล้ว และรออีก 6 วินาที — ไม่ทับหน้าต่างอื่น ไม่แสดงในหน้าเข้าสู่ระบบ
   - หน้าเข้าสู่ระบบมีปุ่มเล็ก "ติดตั้งแอป" (ไม่บังฟอร์ม) · ตั้งค่า → การ์ด "ติดตั้งแอป"
   สถานะเก็บใน localStorage "eq_pwa" ของเครื่องนี้ (ไม่เกี่ยวกับบัญชี)
   ===================================================================== */
(function () {
  'use strict';
  const app = () => window.EQApp;
  const KEY = 'eq_pwa';
  const SNOOZE_DAYS = 7;
  const DAY = 24 * 60 * 60 * 1000;
  const ua = navigator.userAgent || '';

  // ---------- สภาพแวดล้อม ----------
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;   // iPad ที่รายงานตัวเป็น Mac
  const isIOS = /iP(hone|od|ad)/.test(ua) || isIPadOS;
  const isIPad = /iPad/.test(ua) || isIPadOS;
  const isAndroid = /Android/i.test(ua);
  const inApp = /(FBAN|FBAV|FB_IAB|Instagram|Line\/|LIFF|MicroMessenger|TikTok|BytedanceWebview|Twitter|KAKAOTALK|Snapchat|Pinterest)/i.test(ua);
  const isLine = /Line\//i.test(ua);
  const iosBrowser = !isIOS ? null : /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : inApp ? 'inapp' : 'safari';
  // Safari 26 ตรึงเวอร์ชัน iOS ใน UA ไว้ที่ 18_x → ดูจาก Version/26 แทน
  const safariMajor = (() => { const m = ua.match(/Version\/(\d+)/); return m ? Number(m[1]) : 0; })();
  const iosMajor = (() => { const m = ua.match(/OS (\d+)_/); return m ? Number(m[1]) : 0; })();
  const iosNewUi = iosBrowser === 'safari' && safariMajor >= 26;
  const isFirefoxAndroid = isAndroid && /Firefox\//.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);

  function standalone() {
    try {
      return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches)
        || window.navigator.standalone === true || document.referrer.startsWith('android-app://');
    } catch (_) { return false; }
  }

  // ---------- สถานะในเครื่อง ----------
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } }
  function save(patch) { const s = { ...load(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* โหมดส่วนตัว */ } return s; }
  const snoozed = () => { const s = load(); return Boolean(s.snoozeUntil && Date.now() < s.snoozeUntil); };
  const markInstalled = (how) => save({ installed: true, installedAt: Date.now(), how });

  // ---------- เหตุการณ์ติดตั้งของเบราว์เซอร์ ----------
  let deferred = null;            // beforeinstallprompt ที่เก็บไว้ (ใช้ได้ครั้งเดียว)
  let installedNow = false;       // ได้ appinstalled ในรอบนี้
  let relatedInstalled = false;   // getInstalledRelatedApps บอกว่าติดตั้งแล้ว
  let shownThisVisit = false;
  let interacted = false;
  let pendingTimer = 0;
  let waitingInstall = null;      // { resolve } ระหว่างรอ appinstalled หลังผู้ใช้กดยืนยัน

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();             // ไม่ให้แถบมินิของ Chrome เด้งเอง — เราแสดงป๊อปอัปของเราเมื่อเหมาะสม
    deferred = e;
    // เบราว์เซอร์ส่ง event นี้แปลว่า "ยังไม่ได้ติดตั้ง" ในตอนนี้ (เช่น ผู้ใช้ลบแอปไปแล้ว) → ล้างสถานะติดตั้งเดิม
    if (load().installed) save({ installed: false });
    refreshEntries();
    schedule();
  });
  window.addEventListener('appinstalled', () => {
    installedNow = true; deferred = null;
    markInstalled('appinstalled');
    if (waitingInstall) { waitingInstall.resolve(true); waitingInstall = null; }
    refreshEntries();
  });

  async function checkRelated() {
    if (!('getInstalledRelatedApps' in navigator)) return;
    try {
      const apps = await navigator.getInstalledRelatedApps();
      relatedInstalled = Array.isArray(apps) && apps.some((a) => a.platform === 'webapp');
      if (relatedInstalled) markInstalled('related');
      refreshEntries();
    } catch (_) { /* ไม่รองรับ */ }
  }

  /** ทางติดตั้งที่ใช้ได้จริงตอนนี้ */
  function mode() {
    if (standalone()) return 'standalone';
    if (installedNow || relatedInstalled) return 'installed';
    if (deferred) return 'prompt';
    if (inApp) return 'inapp';
    if (isIOS) return iosBrowser === 'safari' || iosMajor >= 16 || safariMajor >= 16 ? 'ios' : 'ios-old';
    if (isFirefoxAndroid) return 'android-menu';
    if (isAndroid && (isSamsung || /Chrome\//.test(ua))) return 'android-menu';   // ไม่มี event (ติดตั้งแล้ว/ยังไม่ครบเงื่อนไข) → บอกวิธีจากเมนู
    if (/Macintosh/.test(ua) && /Version\/(1[7-9]|[2-9]\d)/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'mac-safari';
    return 'none';
  }
  const canOffer = () => !['standalone', 'installed', 'none', 'ios-old'].includes(mode());

  // ---------- UI ----------
  const ICON = (n, c = 'icon icon-sm') => `<svg class="${c}" aria-hidden="true"><use href="/assets/icons/icons.svg#${n}"></use></svg>`;
  const SHARE_SVG = '<svg class="pi-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const DOTS_SVG = '<svg class="pi-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
  const KEBAB_SVG = '<svg class="pi-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
  const MENU_SVG = '<svg class="pi-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ADD_SVG = '<svg class="pi-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const BENEFITS = [
    ['zap', 'เปิดเร็วจากไอคอนบนหน้าจอโฮม', 'เต็มจอเหมือนแอป ไม่มีแถบเบราว์เซอร์มากวน'],
    ['bell', 'เตือนให้เรียนต่อทุกวัน', 'เปิดการแจ้งเตือนได้ในตั้งค่า (iPhone ต้องเพิ่มลงหน้าจอโฮมก่อน)'],
    ['download', 'ไม่ต้องโหลดจาก Store', 'ขนาดเล็ก อัปเดตเองอัตโนมัติ · ความคืบหน้าเดิมอยู่ครบ'],
  ];

  function stepsHtml() {
    if (mode() === 'inapp') {
      return `<ol class="pi-steps">
        <li><span class="pi-num">1</span><span>${isLine ? 'กดปุ่มด้านล่าง เพื่อเปิด English Quest ในเบราว์เซอร์ของเครื่อง' : `กด ${DOTS_SVG} หรือ ${KEBAB_SVG} มุมจอ แล้วเลือก <b>เปิดในเบราว์เซอร์</b> (${isIOS ? 'Safari' : 'Chrome'})`}</span></li>
        <li><span class="pi-num">2</span><span>ในเบราว์เซอร์ จะมีป๊อปอัปหรือเมนูให้ <b>ติดตั้งแอป</b> / <b>เพิ่มไปยังหน้าจอโฮม</b></span></li></ol>`;
    }
    if (mode() === 'android-menu') {
      const nm = isFirefoxAndroid ? 'Firefox' : isSamsung ? 'Samsung Internet' : 'Chrome';
      const menu = isSamsung ? `ปุ่มเมนู ${MENU_SVG} มุมขวาล่าง` : `ปุ่ม ${KEBAB_SVG} มุมขวาบน`;
      return `<ol class="pi-steps">
        <li><span class="pi-num">1</span><span>ใน ${nm} กด${menu}</span></li>
        <li><span class="pi-num">2</span><span>เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b> <small lang="en">(Install app / Add to Home screen)</small></span></li>
        <li><span class="pi-num">3</span><span>กด <b>ติดตั้ง</b> แล้วเปิด English Quest จากไอคอนจิ้งจอก</span></li></ol>
        <p class="pi-note">${ICON('info')} ถ้าไม่เห็นเมนูติดตั้ง อาจติดตั้งไว้แล้ว ลองหาไอคอน English Quest บนหน้าจอหลัก</p>`;
    }
    if (mode() === 'mac-safari') {
      return `<ol class="pi-steps">
        <li><span class="pi-num">1</span><span>ในแถบเมนูของ Safari เลือก <b>ไฟล์</b> <small lang="en">(File)</small></span></li>
        <li><span class="pi-num">2</span><span>เลือก <b>เพิ่มไปยัง Dock</b> <small lang="en">(Add to Dock)</small> แล้วกด <b>เพิ่ม</b></span></li></ol>`;
    }
    // iPhone / iPad
    if (iosBrowser !== 'safari') {
      const nm = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' }[iosBrowser] || 'เบราว์เซอร์นี้';
      return `<ol class="pi-steps">
        <li><span class="pi-num">1</span><span>ใน ${nm} กดปุ่ม <b>แชร์</b> ${SHARE_SVG} ${iosBrowser === 'chrome' ? 'ที่แถบที่อยู่ด้านบน' : 'ในเมนู'}</span></li>
        <li><span class="pi-num">2</span><span>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> ${ADD_SVG} <small lang="en">(Add to Home Screen)</small> — ถ้าไม่เห็น ให้เลื่อนลงหรือกด <b>แก้ไขการทำงาน</b></span></li>
        <li><span class="pi-num">3</span><span>กด <b>เพิ่ม</b> <small lang="en">(Add)</small> มุมขวาบน</span></li></ol>
        <p class="pi-note">${ICON('info')} ถ้าไม่มีเมนูนี้ ให้เปิดลิงก์นี้ใน <b>Safari</b> แล้วทำตามขั้นตอนเดียวกัน (ต้องใช้ iOS 16.4 ขึ้นไปสำหรับเบราว์เซอร์อื่น)</p>`;
    }
    if (iosNewUi) {   // Safari 26: ปุ่มแชร์อยู่ในเมนู ⋯
      return `<ol class="pi-steps">
        <li><span class="pi-num">1</span><span>กด ${DOTS_SVG} ข้างแถบที่อยู่ แล้วกด <b>แชร์</b> ${SHARE_SVG}</span></li>
        <li><span class="pi-num">2</span><span>เลื่อนลงแล้วกด <b>เพิ่มไปยังหน้าจอโฮม</b> ${ADD_SVG} <small lang="en">(Add to Home Screen)</small></span></li>
        <li><span class="pi-num">3</span><span>เปิดสวิตช์ <b>เปิดเป็นเว็บแอป</b> <small lang="en">(Open as Web App)</small> ไว้ แล้วกด <b>เพิ่ม</b> <small lang="en">(Add)</small></span></li></ol>`;
    }
    return `<ol class="pi-steps">
      <li><span class="pi-num">1</span><span>กดปุ่ม <b>แชร์</b> ${SHARE_SVG} ${isIPad ? 'ที่แถบด้านบนขวา' : 'ที่แถบด้านล่างของ Safari'} <small>(ถ้าไม่เห็น ให้แตะที่แถบที่อยู่ หรือกด ${DOTS_SVG} ก่อน)</small></span></li>
      <li><span class="pi-num">2</span><span>เลื่อนลงแล้วกด <b>เพิ่มไปยังหน้าจอโฮม</b> ${ADD_SVG} <small lang="en">(Add to Home Screen)</small></span></li>
      <li><span class="pi-num">3</span><span>กด <b>เพิ่ม</b> <small lang="en">(Add)</small> มุมขวาบน แล้วเปิดจากไอคอนจิ้งจอกบนหน้าจอโฮม</span></li></ol>`;
  }
  function lineExternalUrl() {
    const u = new URL(window.location.href);
    u.searchParams.set('openExternalBrowser', '1');
    return u.toString();
  }
  function primaryHtml() {
    const m = mode();
    if (m === 'prompt') return `<button class="btn btn-primary btn-lg pi-cta" type="button" data-pi="install" data-autofocus>${ICON('download')} ติดตั้งแอป</button>`;
    if (m === 'inapp' && isLine) return `<a class="btn btn-primary btn-lg pi-cta" href="${lineExternalUrl()}" data-pi="external" data-autofocus>${ICON('external-link')} เปิดในเบราว์เซอร์</a>`;
    return `<button class="btn btn-primary btn-lg pi-cta" type="button" data-pi="guide" data-autofocus>${ICON('smartphone')} ${m === 'mac-safari' ? 'ดูวิธีเพิ่มไปยัง Dock' : m === 'android-menu' ? 'ดูวิธีติดตั้งจากเมนู' : m === 'inapp' ? 'ดูวิธีเปิดในเบราว์เซอร์' : 'ดูวิธีเพิ่มลงหน้าจอโฮม'}</button>`;
  }

  let current = null;
  function close() { if (current) { const c = current; current = null; c.remove(); } }

  /** ป๊อปอัปชวนติดตั้ง · opts.source = 'auto' | 'login' | 'settings' | 'notify' · opts.guide = เปิดขั้นตอนทันที */
  function open(opts = {}) {
    if (!app() || !app().makeDialog) return false;
    const m = mode();
    if (m === 'standalone' || m === 'installed') { if (opts.source !== 'auto') app().toast('ติดตั้ง English Quest แล้ว — เปิดจากไอคอนจิ้งจอกบนหน้าจอโฮม', 'info'); return false; }
    if (!canOffer()) { if (opts.source !== 'auto') app().toast(m === 'ios-old' ? 'iOS เวอร์ชันนี้เก่าเกินไป — อัปเดต iOS แล้วเปิดใน Safari' : 'เบราว์เซอร์นี้ยังติดตั้งแอปไม่ได้ ลองเปิดด้วย Chrome, Edge หรือ Safari', 'info'); return false; }
    close();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay pwa-install';
    ov.innerHTML = `<div class="modal-card pi-card">
      <div class="pi-glow" aria-hidden="true"></div>
      <header class="pi-head">
        <span class="pi-logo"><img src="/brand/logo-fox-192.png" alt="" width="72" height="72" decoding="async" /></span>
        <div><p class="pi-kicker">${ICON('sparkles', 'icon icon-xs')} แอปฟรี · ติดตั้งในไม่กี่วินาที</p>
          <h2 class="pi-title" id="pi-title">ติดตั้ง <span lang="en">English Quest</span></h2>
          <p class="pi-sub">เพิ่มลงหน้าจอโฮม แล้วเรียนต่อได้ในแตะเดียว</p></div>
      </header>
      <ul class="pi-benefits">${BENEFITS.map(([ic, b, s]) => `<li><span class="pi-bic">${ICON(ic)}</span><span><b>${b}</b><small>${s}</small></span></li>`).join('')}</ul>
      <section class="pi-guide${opts.guide || m === 'inapp' && !isLine ? '' : ' hidden'}" aria-labelledby="pi-gt"><h3 class="pi-gt" id="pi-gt">${m === 'inapp' ? 'เปิดในเบราว์เซอร์ก่อน' : 'ทำตามนี้'}</h3>${stepsHtml()}</section>
      <p class="pi-status hidden" role="status" aria-live="polite"></p>
      <div class="pi-actions">${primaryHtml()}<button class="btn btn-secondary pi-later" type="button" data-pi="later">ไว้ทีหลัง</button></div>
    </div>`;
    document.body.appendChild(ov);
    current = ov;
    let decided = false;
    app().makeDialog(ov, {
      label: 'ติดตั้งแอป English Quest',
      variant: window.matchMedia('(max-width: 640px)').matches ? 'sheet' : 'center',
      onClose: () => { if (current === ov) current = null; if (!decided && opts.source === 'auto') snooze(); },
    });
    const showGuide = () => { ov.querySelector('.pi-guide').classList.remove('hidden'); ov.querySelector('.pi-card').classList.add('is-guide'); };
    if (opts.guide || (m === 'inapp' && !isLine)) showGuide();
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pi]');
      if (!b) return;
      const act = b.dataset.pi;
      if (act === 'later') { decided = true; snooze(); close(); return; }
      if (act === 'guide') {
        showGuide();
        b.remove(); ov.querySelector('.pi-later').textContent = 'เข้าใจแล้ว';
        const later = ov.querySelector('.pi-later'); later.dataset.pi = 'done'; later.focus({ preventScroll: true });
        return;
      }
      if (act === 'done') { decided = true; snooze(); close(); return; }
      if (act === 'external') { decided = true; return; }   // ลิงก์จริง (LINE เปิดเบราว์เซอร์ภายนอก)
      if (act === 'install') { decided = true; await runPrompt(ov, b); }
    });
    return true;
  }

  /** Android/Chrome/Edge: เรียกหน้าต่างติดตั้งของเบราว์เซอร์ — บอกสำเร็จเมื่อได้ appinstalled เท่านั้น */
  async function runPrompt(ov, btn) {
    const ev = deferred;
    const st = ov.querySelector('.pi-status');
    const say = (t, cls = '') => { st.className = `pi-status ${cls}`; st.innerHTML = t; };
    if (!ev) { say(`${ICON('info')} เบราว์เซอร์ยังไม่พร้อมติดตั้ง ลองใหม่อีกครั้งภายหลัง หรือใช้เมนูของเบราว์เซอร์`); return; }
    btn.disabled = true;
    deferred = null;                 // event ใช้ได้ครั้งเดียว
    let outcome = 'dismissed';
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      outcome = choice && choice.outcome;
    } catch (_) { outcome = 'error'; }
    if (outcome === 'accepted') {
      if (installedNow) { done(); return; }
      say(`<span class="spinner" aria-hidden="true"></span> กำลังติดตั้ง… รอระบบยืนยันสักครู่`, 'is-wait');
      const ok = await new Promise((resolve) => {
        waitingInstall = { resolve };
        setTimeout(() => { if (waitingInstall) { waitingInstall = null; resolve(false); } }, 20000);
      });
      if (ok) done();
      else { save({ acceptedAt: Date.now() }); say(`${ICON('info')} ยืนยันการติดตั้งแล้ว ระบบอาจใช้เวลาอีกสักครู่ — ตรวจที่หน้าจอโฮมหรือรายการแอป`, 'is-info'); btn.remove(); ov.querySelector('.pi-later').textContent = 'ปิด'; ov.querySelector('.pi-later').dataset.pi = 'done'; }
    } else {
      snooze();
      say(`${ICON('info')} ยังไม่ได้ติดตั้ง — จะชวนอีกครั้งใน ${SNOOZE_DAYS} วัน หรือติดตั้งเองได้ที่ ตั้งค่า → ติดตั้งแอป`, 'is-info');
      btn.remove(); const l = ov.querySelector('.pi-later'); l.textContent = 'ปิด'; l.dataset.pi = 'done'; l.focus({ preventScroll: true });
    }
    function done() {
      say(`${ICON('circle-check')} ติดตั้ง English Quest แล้ว — เปิดจากไอคอนจิ้งจอกบนหน้าจอโฮมได้เลย`, 'is-ok');
      btn.remove(); const l = ov.querySelector('.pi-later'); l.textContent = 'เยี่ยม!'; l.dataset.pi = 'done'; l.focus({ preventScroll: true });
      refreshEntries();
    }
  }

  function snooze() { save({ snoozeUntil: Date.now() + SNOOZE_DAYS * DAY, snoozedAt: Date.now() }); }

  // ---------- แสดงอัตโนมัติ ----------
  const loggedIn = () => Boolean(app() && app().user);
  const onHome = () => { const h = document.getElementById('screen-home'); return h && !h.classList.contains('hidden'); };
  const busy = () => document.querySelector('.modal-overlay, .ui-overlay') || document.body.classList.contains('dialog-open');
  function eligibleAuto() {
    if (shownThisVisit || snoozed() || load().installed || !canOffer()) return false;
    // มือถือ/แท็บเล็ต: ชวนทุกทางที่ใช้ได้ · คอม: เฉพาะที่ติดตั้งได้จริงในแตะเดียว (prompt)
    const touch = isIOS || isAndroid;
    return touch ? ['prompt', 'ios', 'inapp'].includes(mode()) : mode() === 'prompt';
  }
  function schedule() {
    if (pendingTimer || !eligibleAuto()) return;
    pendingTimer = window.setTimeout(tryAuto, 6000);
  }
  function tryAuto() {
    pendingTimer = 0;
    if (!eligibleAuto()) return;
    if (!interacted || !loggedIn() || !onHome() || busy() || document.hidden) return;   // รอโอกาสถัดไป (กลับมาหน้าแรก/แตะครั้งต่อไป)
    if (open({ source: 'auto' })) { shownThisVisit = true; save({ lastShownAt: Date.now() }); }
  }
  const onInteract = () => { if (!interacted) { interacted = true; schedule(); } };
  window.addEventListener('pointerdown', onInteract, { passive: true });
  window.addEventListener('keydown', onInteract);
  window.addEventListener('eq:screen', (e) => { refreshEntries(); if (e.detail && e.detail.id === 'screen-home') schedule(); });
  document.addEventListener('click', (e) => { if (interacted && !pendingTimer && onHome()) schedule(); }, { passive: true });

  // ---------- เมนู: หน้าเข้าสู่ระบบ + ตั้งค่า ----------
  function refreshEntries() {
    const m = mode();
    const offer = canOffer();
    const login = document.getElementById('pwa-login-entry');
    if (login) login.classList.toggle('hidden', !offer);
    const card = document.getElementById('pwa-settings-card');
    if (!card) return;
    if (m === 'standalone' || m === 'installed' || load().installed) {
      card.classList.remove('hidden');
      card.querySelector('.pwa-set-body').innerHTML = `<p class="pwa-set-ok">${ICON('circle-check')} ${m === 'standalone' ? 'กำลังใช้งานแบบแอปอยู่' : 'ติดตั้งในเครื่องนี้แล้ว — เปิดจากไอคอนจิ้งจอกบนหน้าจอโฮม'}</p>`;
      return;
    }
    card.classList.toggle('hidden', !offer);
    if (!offer) return;
    const s = load();
    const label = m === 'prompt' ? 'ติดตั้งแอป' : m === 'inapp' ? 'เปิดในเบราว์เซอร์เพื่อติดตั้ง' : m === 'mac-safari' ? 'วิธีเพิ่มไปยัง Dock' : 'วิธีเพิ่มลงหน้าจอโฮม';
    card.querySelector('.pwa-set-body').innerHTML = `<p class="page-sub">${m === 'prompt' ? 'ติดตั้ง English Quest ลงเครื่อง เปิดเต็มจอจากไอคอนได้ทันที' : isIOS ? 'iPhone/iPad ติดตั้งผ่านเมนู "เพิ่มไปยังหน้าจอโฮม" ของ Safari' : 'ติดตั้งผ่านเมนูของเบราว์เซอร์'}${s.snoozeUntil && Date.now() < s.snoozeUntil ? ' · ระบบจะไม่ชวนเองจนถึง ' + new Date(s.snoozeUntil).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''}</p>
      <button class="btn btn-primary btn-block" type="button" data-pi-open="settings">${ICON(m === 'prompt' ? 'download' : 'smartphone')} ${label}</button>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pi-open]');
    if (!b) return;
    e.preventDefault();
    open({ source: b.dataset.piOpen, guide: mode() !== 'prompt' && !(mode() === 'inapp' && isLine) });
  });

  // แอปเปิดแบบ standalone → จำว่าติดตั้งแล้ว (ไม่ชวนอีกในเบราว์เซอร์เครื่องเดียวกันถ้าเบราว์เซอร์แชร์ storage)
  if (standalone()) markInstalled('standalone');
  try { window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => { if (e.matches) { markInstalled('standalone'); close(); refreshEntries(); } }); } catch (_) { /* เบราว์เซอร์เก่า */ }
  const boot = () => { refreshEntries(); checkRelated(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.addEventListener('eq:ready', () => { refreshEntries(); schedule(); });

  window.EQInstall = {
    open, mode, canOffer, standalone,
    state: () => ({ mode: mode(), canOffer: canOffer(), snoozed: snoozed(), stored: load(), hasPrompt: Boolean(deferred), installedNow, relatedInstalled, isIOS, iosBrowser, iosNewUi, inApp }),
    _tryAuto: tryAuto,
  };
}());
