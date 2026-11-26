/* =====================================================================
   Learning Streak — v1.18.0 — window.EQStreak
   - ข้อมูลทั้งหมดจาก GET /api/streak (เซิร์ฟเวอร์นับจากคำตอบจริง) — หน้าเว็บไม่คำนวณ/ไม่เก็บจำนวนวันเอง
   - ชิปบนแถบหน้าแรก (#hl-streak) · การ์ดในคอลัมน์ซ้าย (#hl-streak-card) · หน้ารายละเอียด (dialog/bottom sheet)
   - ซื้อ Streak Freeze: POST /api/streak/freeze (ราคาจากเซิร์ฟเวอร์) · ฉลอง Milestone แล้ว POST /api/streak/seen
   - ข้อความทุกชิ้นผ่าน esc() ก่อนแสดง
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/streak${p}`, o);
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const coin = (big = false) => `<img class="coin-ico${big ? ' coin-xl' : ''}" src="/assets/coin/${big ? 'coin' : 'coin-sm'}.svg" alt="" aria-hidden="true" width="18" height="18">`;
  const flame = (on, cls = 'stk-flame') => `<img class="${cls}" src="/assets/streak/${on ? 'flame' : 'flame-off'}.svg" alt="" aria-hidden="true" width="28" height="28" decoding="async">`;
  const badgeImg = (days, cls = 'stk-badge-img') => `<img class="${cls}" src="/assets/streak/badge-${Number(days)}.svg" alt="" aria-hidden="true" width="64" height="72" decoding="async" loading="lazy">`;
  const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const dayDate = (d) => new Date(`${d}T00:00:00Z`);
  const thDay = (d) => dayDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const st = { data: null, loading: null, seq: 0, celebrating: false };

  /* ---------------- ข้อมูล ---------------- */
  async function refresh() {
    const my = ++st.seq;
    let d;
    try { d = await api(''); } catch (err) {
      if (my === st.seq && !st.data) renderError(err);
      return null;
    }
    if (my !== st.seq) return st.data;
    st.data = d;
    renderChip(); renderCard();
    const ov = document.querySelector('.stk-sheet'); if (ov) fillSheet(ov.querySelector('.stk-body'));
    if (d.rewards && d.rewards.length && window.EQAvatar && window.EQAvatar.checkCoins) window.EQAvatar.checkCoins(300);   // แจ้ง +Coin ของ Milestone
    const lv = [...(d.rewards || [])].reverse().find((r) => r.levelInfo);   // EXP จาก Milestone → อัปเดตแถบ EXP (+ เลเวลอัป ถ้ามี)
    if (lv && App().applyLevelInfo) App().applyLevelInfo(lv.levelInfo, (d.rewards || []).some((r) => r.leveledUp));
    if (d.celebrate && d.celebrate.length && !st.celebrating) celebrate(d.celebrate);
    return d;
  }
  function statusLine(d) {
    if (d.doneToday) return `${ICON('circle-check', 'icon icon-xs')} วันนี้ทำเป้าหมายครบแล้ว`;
    const left = Math.max(0, d.progress.goal - d.progress.answers);
    return d.current > 0 ? `ตอบอีก ${fmt(left)} ข้อ เพื่อรักษา Streak วันนี้` : `ตอบให้ครบ ${fmt(d.progress.goal)} ข้อวันนี้ เพื่อเริ่ม Streak`;
  }

  /* ---------------- ชิปบนแถบ ---------------- */
  function renderChip() {
    const b = $('hl-streak'); const d = st.data; if (!b || !d) return;
    b.classList.toggle('is-done', d.doneToday);
    b.classList.toggle('is-risk', d.atRisk);
    b.innerHTML = `${flame(d.doneToday || d.current > 0, 'stk-chip-flame')}<span class="stk-chip-t"><b>${fmt(d.current)}</b><small>วัน</small></span>`;
    b.setAttribute('aria-label', `Streak ${d.current} วันติดต่อกัน — ${d.doneToday ? 'วันนี้ทำครบแล้ว' : 'วันนี้ยังไม่ครบ'} · เปิดรายละเอียด`);
  }

  /* ---------------- การ์ดคอลัมน์ซ้าย ---------------- */
  function renderCard() {
    const c = $('hl-streak-card'); const d = st.data; if (!c || !d) return;
    const pct = Math.round((d.progress.answers / Math.max(1, d.progress.goal)) * 100);
    const week = d.calendar.slice(-7);
    c.innerHTML = `<button class="stk-card${d.atRisk ? ' is-risk' : ''}${d.doneToday ? ' is-done' : ''}" type="button" data-stk-open>
      <span class="stk-card-top">${flame(d.doneToday || d.current > 0)}
        <span class="stk-card-num"><b>${fmt(d.current)}</b> <span>วันติดต่อกัน</span><small>${d.best > d.current ? `ยาวที่สุด ${fmt(d.best)} วัน` : 'Learning Streak'}</small></span>
        <span class="stk-card-fz" title="Streak Freeze">${ICON('snowflake', 'icon icon-xs')} ${fmt(d.freezes.held)}/${fmt(d.freezes.max)}</span></span>
      <span class="stk-week" aria-hidden="true">${week.map((w) => `<span class="stk-wd${w.kind === 'goal' ? ' is-goal' : w.kind === 'freeze' ? ' is-freeze' : ''}${w.day === d.today ? ' is-today' : ''}"><i>${w.kind === 'freeze' ? ICON('snowflake', 'icon icon-xs') : w.kind === 'goal' ? ICON('flame', 'icon icon-xs') : ''}</i><small>${WD[dayDate(w.day).getUTCDay()]}</small></span>`).join('')}</span>
      <span class="stk-card-bar" role="progressbar" aria-label="เป้าหมายวันนี้" aria-valuemin="0" aria-valuemax="${d.progress.goal}" aria-valuenow="${d.progress.answers}"><span style="width:${pct}%"></span></span>
      <span class="stk-card-msg">${statusLine(d)}</span>
    </button>`;
  }
  function renderError(err) {
    const c = $('hl-streak-card');
    if (c) c.innerHTML = `<p class="hl-empty" role="status">โหลด Streak ไม่สำเร็จ — ${esc((err && err.message) || 'ลองใหม่อีกครั้ง')}</p>`;
  }

  /* ---------------- หน้ารายละเอียด ---------------- */
  function calendarHtml(d) {
    const first = dayDate(d.calendar[0].day).getUTCDay();
    const pad = Array.from({ length: first }, () => '<li class="stk-cal-pad" aria-hidden="true"></li>').join('');
    const cells = d.calendar.map((c) => {
      const label = c.kind === 'goal' ? 'ทำเป้าหมายครบ' : c.kind === 'freeze' ? 'ใช้ Streak Freeze' : c.day === d.today ? 'วันนี้ (ยังไม่ครบ)' : 'ไม่ได้ทำ';
      return `<li class="stk-cal-d${c.kind ? ` is-${c.kind}` : ''}${c.day === d.today ? ' is-today' : ''}" title="${esc(thDay(c.day))} — ${label}">
        <span class="sr-only">${esc(thDay(c.day))}: ${label}</span>
        <span aria-hidden="true">${c.kind === 'goal' ? ICON('flame', 'icon icon-xs') : c.kind === 'freeze' ? ICON('snowflake', 'icon icon-xs') : dayDate(c.day).getUTCDate()}</span></li>`;
    }).join('');
    return `<div class="stk-cal"><ol class="stk-cal-head" aria-hidden="true">${WD.map((w) => `<li>${w}</li>`).join('')}</ol><ol class="stk-cal-grid" aria-label="ปฏิทิน ${d.calendar.length} วันล่าสุด">${pad}${cells}</ol>
      <p class="stk-legend"><span>${ICON('flame', 'icon icon-xs')} ทำครบ</span><span>${ICON('snowflake', 'icon icon-xs')} ใช้ Freeze</span><span><i class="stk-dot"></i> ไม่ได้ทำ</span></p></div>`;
  }
  function freezeHtml(d) {
    const f = d.freezes; const bal = window.EQAvatar ? window.EQAvatar.balance : null;
    const full = f.held >= f.max; const short = bal !== null && bal !== undefined && bal < f.price;
    const slots = Array.from({ length: f.max }, (_, i) => `<span class="stk-fz-slot${i < f.held ? ' is-on' : ''}" aria-hidden="true">${ICON('snowflake', 'icon')}</span>`).join('');
    return `<section class="stk-sec stk-fz" aria-labelledby="stk-fz-t">
      <h3 id="stk-fz-t">${ICON('snowflake', 'icon icon-sm')} Streak Freeze</h3>
      <div class="stk-fz-row"><div class="stk-fz-slots">${slots}</div>
        <p><b>มี ${fmt(f.held)}/${fmt(f.max)} อัน</b><br><small>ถ้าวันไหนไม่ได้ทำเป้าหมาย ระบบจะใช้ Freeze ให้อัตโนมัติ Streak จะไม่ขาด (วันนั้นไม่นับเพิ่ม) · ใช้ได้เฉพาะวันที่ขาดหลังจากซื้อแล้ว</small></p></div>
      <button class="btn btn-primary stk-buy" type="button" data-stk-buy ${full || short ? 'disabled aria-disabled="true"' : ''}>${coin()} ${fmt(f.price)} ซื้อ Freeze</button>
      <p class="stk-note" id="stk-buy-note">${full ? `มีครบ ${fmt(f.max)} อันแล้ว` : short ? `Coin ไม่พอ (มี ${fmt(bal)})` : ''}</p>
    </section>`;
  }
  function milestonesHtml(d) {
    return `<section class="stk-sec" aria-labelledby="stk-ms-t"><h3 id="stk-ms-t">${ICON('award', 'icon icon-sm')} ตรา Streak</h3>
      <ul class="stk-ms">${d.milestones.map((m) => `<li class="stk-m${m.reached ? ' is-got' : ''}">
        ${badgeImg(m.days)}
        <div><b>${esc(m.nameTh)}</b><small>${fmt(m.days)} วัน · ${esc(m.name)}</small>
          <span class="stk-rw">${coin()} +${fmt(m.coins)} <span class="stk-xp">+${fmt(m.exp)} EXP</span></span>
          <span class="stk-ms-st">${m.reached ? `${ICON('badge-check', 'icon icon-xs')} ได้รับแล้ว ${m.reachedAt ? esc(new Date(m.reachedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })) : ''}` : `${ICON('lock', 'icon icon-xs')} อีก ${fmt(Math.max(0, m.days - d.current))} วัน`}</span></div></li>`).join('')}</ul></section>`;
  }
  function fillSheet(body) {
    const d = st.data; if (!body || !d) return;
    const hadFocus = body.contains(document.activeElement);   // ปุ่มที่โฟกัสอยู่จะถูกวาดใหม่ → ย้ายโฟกัสไว้ที่กล่อง (Esc/Tab ยังทำงาน)
    const pct = Math.round((d.progress.answers / Math.max(1, d.progress.goal)) * 100);
    body.innerHTML = `
      <header class="stk-hero${d.doneToday ? ' is-done' : ''}">
        ${flame(d.doneToday || d.current > 0, 'stk-hero-flame')}
        <div><h2 id="stk-title"><b>${fmt(d.current)}</b> วันติดต่อกัน</h2><p>${statusLine(d)}</p></div>
      </header>
      <div class="stk-today">
        <div class="stk-card-bar" role="progressbar" aria-label="เป้าหมายวันนี้" aria-valuemin="0" aria-valuemax="${d.progress.goal}" aria-valuenow="${d.progress.answers}"><span style="width:${pct}%"></span></div>
        <p><span><b>${fmt(d.progress.answers)}/${fmt(d.progress.goal)}</b> ข้อวันนี้</span> ${d.doneToday ? '' : '<button class="btn btn-secondary btn-sm" type="button" data-stk-learn>ไปเรียนต่อ</button>'}</p>
      </div>
      <dl class="stk-stats">
        <div><dt>ตอนนี้</dt><dd>${fmt(d.current)} วัน</dd></div>
        <div><dt>ยาวที่สุด</dt><dd>${fmt(d.best)} วัน</dd></div>
        <div><dt>ตราถัดไป</dt><dd>${d.next ? `อีก ${fmt(d.next.remaining)} วัน` : 'ครบทุกตรา'}</dd></div>
      </dl>
      ${calendarHtml(d)}
      ${freezeHtml(d)}
      ${milestonesHtml(d)}
      <p class="stk-rules">${ICON('info', 'icon icon-xs')} นับ 1 วันเมื่อตอบครบ ${fmt(d.progress.goal)} ข้อในวันนั้น (ตัดวันเที่ยงคืนเวลาไทย) — เกณฑ์เดียวกับเป้าหมายรายวัน · ตราแต่ละระดับได้ครั้งเดียว · Streak ไม่มีผลต่อแรงค์หรือคะแนน</p>`;
    if (hadFocus || document.activeElement === document.body) { const card = body.closest('.modal-card'); if (card) card.focus({ preventScroll: true }); }
  }
  async function open() {
    if (document.querySelector('.stk-sheet')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay stk-sheet';
    ov.innerHTML = '<div class="modal-card stk-modal" aria-labelledby="stk-title"><div class="stk-body"><div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด Streak…</div></div></div>';
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'Learning Streak', variant: window.matchMedia('(max-width: 699px)').matches ? 'sheet' : 'center' });
    if (st.data) fillSheet(ov.querySelector('.stk-body'));
    const d = await refresh();
    if (!d && !st.data) ov.querySelector('.stk-body').innerHTML = '<p class="hl-empty" role="alert">โหลด Streak ไม่สำเร็จ — ลองใหม่อีกครั้ง</p>';
  }

  async function buy(btn) {
    btn.disabled = true;
    try {
      const r = await api('/freeze', { method: 'POST', body: {} });
      if (window.EQAvatar && window.EQAvatar.checkCoins) window.EQAvatar.checkCoins(10);
      document.querySelectorAll('[data-coin-balance]').forEach((el) => { el.textContent = fmt(r.balance); });
      App().toast(`ซื้อ Streak Freeze แล้ว (มี ${r.held}/${r.max})`, 'success');
      await refresh();
    } catch (err) {
      App().toast((err && err.message) || 'ซื้อไม่สำเร็จ', 'error');
      btn.disabled = false;
    }
  }

  /* ---------------- ฉลอง Milestone ---------------- */
  function celebrate(list) {
    st.celebrating = true;
    const m = list[list.length - 1];
    const ov = document.createElement('div');
    ov.className = 'modal-overlay stk-cele';
    ov.innerHTML = `<div class="modal-card stk-cele-card">
      <div class="stk-cele-art">${badgeImg(m.days, 'stk-cele-badge')}</div>
      <h2>Streak ${fmt(m.days)} วัน!</h2>
      <p>ได้ตรา <b>${esc(m.nameTh)}</b> (${esc(m.name)})</p>
      ${list.length > 1 ? `<p class="stk-note">และตรา ${list.slice(0, -1).map((x) => `${fmt(x.days)} วัน`).join(' · ')}</p>` : ''}
      <p class="stk-rw stk-rw-lg">${coin()} +${fmt(list.reduce((a, x) => a + x.coins, 0))} Coins <span class="stk-xp">+${fmt(list.reduce((a, x) => a + x.exp, 0))} EXP</span></p>
      <button class="btn btn-primary" type="button" data-autofocus data-stk-cele-ok>เยี่ยม!</button>
    </div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: `Streak ${m.days} วัน`, onClose: () => { st.celebrating = false; api('/seen', { method: 'POST', body: {} }).catch(() => {}); if (st.data) st.data.celebrate = []; } });
  }

  /* ---------------- อีเวนต์ ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('[data-stk-open]') || t.closest('#hl-streak')) { e.preventDefault(); open(); return; }
    const b = t.closest('[data-stk-buy]'); if (b) { buy(b); return; }
    if (t.closest('[data-stk-learn]')) { const ov = t.closest('.modal-overlay'); if (ov) ov.remove(); App().navigateTo('learn'); return; }
    if (t.closest('[data-stk-cele-ok]')) { const ov = t.closest('.modal-overlay'); if (ov) ov.remove(); }
  });

  window.EQStreak = { refresh, open, _state: () => st };
}());
