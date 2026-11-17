/* =====================================================================
   แดชบอร์ดการเรียน — window.EQDashboard (v1.11.0: เดิมอยู่ในสมาชิก Premium ที่ยกเลิกแล้ว → ทุกคนใช้ได้เท่ากัน)
     #/dashboard (และลิงก์เก่า #/premium)  ภาพรวม EXP · ทักษะ 6 ด้าน · ระดับ CEFR โดยประมาณ · 14 วันล่าสุด · คิวทบทวน · คำแนะนำ
     ผู้ดูแล: ส่วน "ผู้ใช้ — บัญชีทดสอบ / ประวัติ" ในหน้าผู้ดูแล (ค้นหาผู้ใช้ · ตั้ง/ยกเลิกบัญชีทดสอบ · ประวัติการกระทำ)
   ทุกข้อความจากผู้ใช้ผ่าน esc() · ข้อมูลมาจากเซิร์ฟเวอร์ (/api/dashboard · /api/admin/users)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-dashboard-root');
  const fmtDate = (d, time = false) => { try { return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Bangkok' }); } catch (_) { return ''; } };
  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }

  let dash = null;
  async function open() {
    setHash('#/dashboard'); App().showScreen('screen-dashboard');
    const el = root();
    loading(el);
    try { dash = await App().api('/dashboard'); } catch (err) {
      el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-pm-retry>ลองใหม่</button></div>`;
      return;
    }
    render();
    focusTitle('pm-title');
  }

  const STATUS_TH = { weak: 'ควรฝึก', ok: 'พอใช้', strong: 'ดี', few: 'ข้อมูลยังน้อย' };
  const TREND_TH = { up: 'ดีขึ้นจากสัปดาห์ก่อน', down: 'ลดลงจากสัปดาห์ก่อน', flat: 'ใกล้เคียงสัปดาห์ก่อน' };
  const skillCard = (s) => `<li class="pmd-skill is-${esc(s.status)}">
      <span class="pmd-skill-ic">${ICON(s.icon, 'icon')}</span>
      <span class="pmd-skill-name"><b>${esc(s.th)}</b><small lang="en">${esc(s.en)}</small></span>
      <span class="pmd-skill-score">${s.score == null ? '<small>ข้อมูลยังน้อย</small>' : `<b>${s.score}</b><small>/100</small>`}</span>
      <span class="gl-bar tq-bar pmd-bar" aria-hidden="true"><span style="width:${s.score || 0}%"></span></span>
      <span class="pmd-skill-meta"><span class="pmd-chip is-${esc(s.status)}">${esc(STATUS_TH[s.status] || s.status)}</span>
        ${s.answered ? `${s.answered} ${s.id === 'speaking' ? 'รายการ' : s.id === 'writing' ? 'งานเขียน' : 'ข้อ'}${s.id === 'speaking' ? '' : ' · 30 วัน'}` : 'ยังไม่ได้ฝึก'}
        ${s.trend ? ` · ${esc(TREND_TH[s.trend])}` : ''}${s.selfReported ? ' · คะแนนฝึกจากการรู้จำเสียงของเบราว์เซอร์' : ''}</span>
      ${s.go ? `<button class="tq-link sp-link pmd-go" type="button" data-pm-nav="${esc(s.go)}">ฝึก${esc(s.th)} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
    </li>`;
  function dashboardHtml(dd) {
    const wkMax = Math.max(1, ...dd.weekly.days.map((x) => x.answered));
    const wd = (day) => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(`${day}T00:00:00Z`).getUTCDay()];
    const go = (x) => (x.action === 'due-review' ? `<button class="btn btn-primary pmd-act" type="button" data-pm-due>${ICON('rotate-ccw', 'icon icon-sm')} เริ่มทบทวน</button>`
      : x.go ? `<button class="btn btn-secondary pmd-act" type="button" data-pm-nav="${esc(x.go)}">${ICON('play', 'icon icon-sm')} ไปฝึก</button>` : '');
    const PART_TH = { vocab: 'คำศัพท์', grammar: 'ไวยากรณ์', reading: 'การอ่าน', listening: 'การฟัง' };
    return `
      <section class="pmd-overview" aria-label="ภาพรวม">
        <div class="pmd-tile"><span>EXP รวม</span><b>${dd.exp.total.toLocaleString('th-TH')}</b><small>ปริมาณกิจกรรม</small></div>
        <div class="pmd-tile"><span>EXP สัปดาห์นี้</span><b>${dd.exp.thisWeek.toLocaleString('th-TH')}</b><small>สัปดาห์ก่อน ${dd.weekly.lastWeek.exp.toLocaleString('th-TH')}</small></div>
        <div class="pmd-tile"><span>วันที่เรียน</span><b>${dd.weekly.thisWeek.activeDays}/7</b><small>ตอบ ${dd.weekly.thisWeek.answered} ข้อในสัปดาห์นี้</small></div>
      </section>
      <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span><b>EXP</b> บอกปริมาณการฝึก · <b>คะแนนทักษะ</b> มาจากความแม่นยำ 30 วัน · <b>ระดับ CEFR</b> มาจากแบบวัดระดับ — สามอย่างนี้ไม่เหมือนกัน</span></p>
      ${dd.recommendations.length ? `<section class="gl-card pmd-recs" aria-labelledby="pmd-r"><h2 class="tq-h2" id="pmd-r">${ICON('target', 'icon icon-sm')} แนะนำสำหรับคุณวันนี้</h2>
        <ol>${dd.recommendations.map((r) => `<li><span><b>${esc(r.th)}</b><small>${esc(r.why)}</small></span>${go(r)}</li>`).join('')}</ol></section>` : ''}
      <section class="tq-section" aria-labelledby="pmd-s"><h2 class="tq-h2" id="pmd-s">${ICON('chart-column', 'icon icon-sm')} ทักษะ 6 ด้าน</h2>
        <ul class="pmd-skills">${dd.skills.map(skillCard).join('')}</ul>
        <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span>คะแนนปรับตามจำนวนข้อ (ตอบน้อยข้อจะไม่ได้ 100 ง่าย ๆ) · ต้องตอบอย่างน้อย 10 ข้อใน 30 วันจึงมีคะแนน</span></p></section>
      <section class="gl-card pmd-cefr" aria-labelledby="pmd-c"><h2 class="tq-h2" id="pmd-c">${ICON('graduation-cap', 'icon icon-sm')} ระดับ CEFR โดยประมาณ</h2>
        ${dd.cefr && dd.cefr.length ? `<ul>${dd.cefr.map((c) => `<li><span><b>${esc(c.th)}</b><small>${fmtDate(c.at)}</small></span>
            <span class="pmd-cefr-v">${c.overall ? `<b>${esc(c.overall)}</b>` : ''}${Object.entries(c.parts || {}).filter(([, v]) => v).map(([k, v]) => `<small>${esc(PART_TH[k] || k)} ${esc(v)}</small>`).join('')}</span></li>`).join('')}</ul>`
    : '<p>ยังไม่มีผลประเมิน — ระดับ CEFR ไม่ได้คำนวณจาก EXP</p>'}
        <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span>เป็นการประมาณจากแบบทดสอบฝึกของแอป ไม่ใช่ผลรับรอง CEFR อย่างเป็นทางการ</span></p>
        <button class="btn btn-secondary pmd-act" type="button" data-pm-nav="placement">${ICON('target', 'icon icon-sm')} ทำแบบวัดระดับ</button></section>
      ${dd.weekly && dd.weekly.days ? `<section class="gl-card pmd-week" aria-labelledby="pmd-w"><h2 class="tq-h2" id="pmd-w">${ICON('calendar', 'icon icon-sm')} 14 วันล่าสุด</h2>
        <ol class="pmd-bars">${dd.weekly.days.map((x) => `<li title="${esc(x.day)}: ตอบ ${x.answered} ข้อ${x.answered ? ` · ถูก ${Math.round((x.correct / x.answered) * 100)}%` : ''} · EXP ${x.exp}">
          <span class="pmd-bar-col"><span style="height:${Math.round((x.answered / wkMax) * 100)}%"></span></span><small>${wd(x.day)}</small>
          <span class="sr-only">${esc(x.day)} ตอบ ${x.answered} ข้อ</span></li>`).join('')}</ol></section>` : ''}
      <section class="gl-card pmd-queue" aria-labelledby="pmd-q"><h2 class="tq-h2" id="pmd-q">${ICON('rotate-ccw', 'icon icon-sm')} คิวทบทวน</h2>
        ${dd.queue && dd.queue.length ? `<ul>${dd.queue.map((x) => `<li><span><b>${esc(x.th)}</b><small>${esc(x.why)}</small></span>${go(x)}</li>`).join('')}</ul>` : '<p>ไม่มีอะไรค้างให้ทบทวนตอนนี้</p>'}</section>
      <section class="tq-section" aria-labelledby="pmd-p"><h2 class="tq-h2" id="pmd-p">${ICON('sparkles', 'icon icon-sm')} ฝึกต่อ</h2>
        <div class="pmd-links">
          <button class="tq-mode pm-go-work" type="button" data-pm-nav="work">${ICON('briefcase', 'icon')}<b>ภาษาอังกฤษเพื่อการทำงาน</b><small>72 วลี · 6 สถานการณ์ + แบบฝึก</small></button>
          <button class="tq-mode" type="button" data-pm-nav="toeic">${ICON('flame', 'icon')}<b>แผนฝึก TOEIC รายวัน</b><small>มีตัวช่วยรักษา Streak 2 วัน/เดือน</small></button>
        </div></section>`;
  }
  function render() {
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-pm-nav="profile">${ICON('arrow-left', 'icon icon-sm')} โปรไฟล์</button>
      <header class="pm-hero"><p class="gl-kicker">${ICON('chart-column', 'icon icon-sm')} EnglishQuest</p>
        <h1 class="page-title" id="pm-title">แดชบอร์ดการเรียน</h1>
        <p class="gl-sub">ภาพรวมทักษะ สิ่งที่ควรทบทวน และคำแนะนำจากผลการเรียนจริงของคุณ</p></header>
      ${dashboardHtml(dash)}`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    if (t.closest('#screen-dashboard')) {
      if (t.closest('[data-pm-retry]')) { open(); return; }
      const b = t.closest('[data-pm-nav]');
      if (b) { App().navigateTo(b.dataset.pmNav); return; }
      if (t.closest('[data-pm-due]')) { App().openDueReview(); return; }
      return;
    }
    if (t.closest('#admin-users-root')) adminClick(e);
  });

  /* =========================== ผู้ดูแล: ผู้ใช้ — บัญชีทดสอบ / ประวัติ =========================== */
  let adminTab = 'users';
  let userQ = '';
  const tabsHtml = () => `<div class="pma-tabs" role="group" aria-label="มุมมอง">${[['users', 'ผู้ใช้'], ['audit', 'ประวัติการกระทำ']].map(([v, l]) => `<button type="button" class="tqw-seg${adminTab === v ? ' is-on' : ''}" aria-pressed="${adminTab === v}" data-pma-tab="${v}">${l}</button>`).join('')}</div>`;
  // ชื่อการกระทำในประวัติ (รวมรายการเก่าจากระบบสมาชิกที่ยกเลิกแล้ว — ประวัติเดิมไม่ถูกลบ)
  const ACTION_TH = { test_flag_on: 'ตั้งเป็นบัญชีทดสอบ (ซ่อนจากกระดานอันดับ)', test_flag_off: 'ยกเลิกบัญชีทดสอบ',
    trial_start: 'เริ่มทดลองใช้ (ระบบสมาชิกเดิม)', order_approve: 'อนุมัติคำสั่งซื้อ (ระบบสมาชิกเดิม)', order_auto_approve: 'อนุมัติอัตโนมัติ (ระบบสมาชิกเดิม)',
    order_reject: 'ปฏิเสธคำสั่งซื้อ (ระบบสมาชิกเดิม)', order_reverify: 'ตรวจสลิปอีกครั้ง (ระบบสมาชิกเดิม)',
    membership_grant: 'ให้สิทธิ์ Premium (ระบบสมาชิกเดิม)', membership_revoke: 'ยกเลิกสิทธิ์ Premium (ระบบสมาชิกเดิม)',
    suspend: 'ระงับบัญชีชั่วคราว', unsuspend: 'ยกเลิกการระงับบัญชี', admin_view_chat: 'เปิดดูบันทึกแชทของผู้ใช้',
    admin_post: 'ผู้ดูแลแก้ข้อมูล (POST)', admin_put: 'ผู้ดูแลแก้ข้อมูล (PUT)', admin_patch: 'ผู้ดูแลแก้ข้อมูล (PATCH)', admin_delete: 'ผู้ดูแลลบข้อมูล (DELETE)' };
  const DUR_TH = { 24: '1 วัน', 72: '3 วัน', 168: '7 วัน', 720: '30 วัน' };
  async function mountUsers(box) {
    let r;
    try { r = await App().api(`/admin/users?q=${encodeURIComponent(userQ)}`); } catch (err) { box.innerHTML = tabsHtml() + `<p class="page-sub">${esc(err.message)}</p>`; return; }
    box.innerHTML = `${tabsHtml()}
      <form class="pma-search" data-pma-search><input type="search" maxlength="40" placeholder="ค้นหาชื่อผู้ใช้" aria-label="ค้นหาชื่อผู้ใช้" value="${esc(userQ)}" data-pma-q>
        <button class="btn btn-secondary" type="submit">${ICON('search', 'icon icon-sm')} ค้นหา</button></form>
      <p class="page-sub">บัญชีทดสอบไม่แสดงในกระดานอันดับ (เจ้าของยังเห็นอันดับตัวเอง) · ข้อมูลอื่นไม่เปลี่ยน · บันทึกในประวัติ</p>
      ${r.users.length ? `<ul class="pma-list">${r.users.map((u) => `<li class="pma-row" data-uid="${u.userId}">
        <div class="pma-main"><b>${esc(u.username)}${u.isTest ? ' <span class="pma-test">บัญชีทดสอบ</span>' : ''}${u.suspendedUntil ? ' <span class="pma-test pma-suspended">ถูกระงับ</span>' : ''}</b><small>สมัคร ${fmtDate(u.createdAt)}</small>
          ${u.suspendedUntil ? `<small>ระงับถึง ${fmtDate(u.suspendedUntil, true)}${u.suspendedReason ? ` · ${esc(u.suspendedReason)}` : ''}</small>` : ''}</div>
        <div class="pma-actions"><button class="btn btn-secondary" type="button" data-pma-test="${u.userId}" data-on="${u.isTest ? '0' : '1'}">${ICON('eye-off', 'icon icon-sm')} ${u.isTest ? 'ไม่ใช่บัญชีทดสอบ' : 'บัญชีทดสอบ'}</button>
          ${u.isAdmin ? '' : u.suspendedUntil
    ? `<button class="btn btn-secondary" type="button" data-pma-unsuspend="${u.userId}">ยกเลิกการระงับ</button>`
    : `<select class="pma-dur" data-pma-dur aria-label="ระยะเวลาระงับ">${Object.entries(DUR_TH).map(([h, t]) => `<option value="${h}">${t}</option>`).join('')}</select>
             <input class="pma-reason" data-pma-reason maxlength="200" placeholder="เหตุผล (ผู้ใช้จะเห็น)" aria-label="เหตุผลการระงับ">
             <button class="btn btn-danger" type="button" data-pma-suspend="${u.userId}">ระงับบัญชี</button>`}</div></li>`).join('')}</ul>`
    : '<p class="page-sub">ไม่พบผู้ใช้</p>'}`;
  }
  async function mountAudit(box) {
    let r;
    try { r = await App().api('/admin/users/audit?limit=60'); } catch (err) { box.innerHTML = tabsHtml() + `<p class="page-sub">${esc(err.message)}</p>`; return; }
    box.innerHTML = `${tabsHtml()}${r.logs.length ? `<ul class="pma-list">${r.logs.map((l) => `<li class="pma-row"><div class="pma-main">
        <b>${esc(ACTION_TH[l.action] || l.action)}</b><small>${fmtDate(l.at, true)} · โดย ${esc(l.actor)}${l.target ? ` · ผู้ใช้ ${esc(l.target)}` : ''}${l.ref ? ` · ${esc(l.ref)}` : ''}</small>
        ${l.details && l.details.note ? `<small>${esc(l.details.note)}</small>` : ''}</div></li>`).join('')}</ul>` : '<p class="page-sub">ยังไม่มีประวัติ</p>'}`;
  }
  async function mountAdmin() {
    const box = document.getElementById('admin-users-root');
    if (!box) return;
    box.innerHTML = '<p class="page-sub">กำลังโหลด…</p>';
    if (adminTab === 'audit') await mountAudit(box); else await mountUsers(box);
  }
  async function adminClick(e) {
    const t = e.target;
    const tf = t.closest('[data-pma-test]');
    if (tf) {
      tf.disabled = true;
      try {
        await App().api(`/admin/users/${tf.dataset.pmaTest}/test-flag`, { method: 'POST', body: { isTest: tf.dataset.on === '1' } });
        App().toast(tf.dataset.on === '1' ? 'ตั้งเป็นบัญชีทดสอบแล้ว — ไม่แสดงในกระดานอันดับ' : 'ยกเลิกบัญชีทดสอบแล้ว', 'success'); mountAdmin();
      } catch (err) { tf.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    // v1.18.4 ระงับ/ยกเลิกการระงับบัญชี (กด "ระงับ" 2 ครั้งเพื่อยืนยัน)
    const sp = t.closest('[data-pma-suspend]');
    if (sp) {
      if (sp.dataset.armed !== '1') { sp.dataset.armed = '1'; sp.textContent = 'กดอีกครั้งเพื่อยืนยัน'; return; }
      const row = sp.closest('.pma-row');
      sp.disabled = true;
      try {
        await App().api(`/admin/users/${sp.dataset.pmaSuspend}/suspend`, { method: 'POST',
          body: { hours: Number(row.querySelector('[data-pma-dur]').value), reason: row.querySelector('[data-pma-reason]').value } });
        App().toast('ระงับบัญชีแล้ว — ผู้ใช้ถูกออกจากระบบทันที', 'success'); mountAdmin();
      } catch (err) { sp.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    const us = t.closest('[data-pma-unsuspend]');
    if (us) {
      us.disabled = true;
      try { await App().api(`/admin/users/${us.dataset.pmaUnsuspend}/suspend`, { method: 'POST', body: { hours: 0 } }); App().toast('ยกเลิกการระงับแล้ว', 'success'); mountAdmin(); }
      catch (err) { us.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    const b = t.closest('[data-pma-tab]');
    if (b) { adminTab = b.dataset.pmaTab; mountAdmin(); }
  }
  document.addEventListener('submit', (e) => {
    const f = e.target.closest && e.target.closest('[data-pma-search]');
    if (!f) return;
    e.preventDefault();
    userQ = (f.querySelector('[data-pma-q]') || {}).value || '';
    mountAdmin();
  });

  window.EQDashboard = { open, mountAdmin };
})();
