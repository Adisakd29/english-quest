/* =====================================================================
   สมาชิก Premium — window.EQPremium
     #/premium   แพ็กเกจรายเดือน/รายปี · สถานะสมาชิก · ชำระด้วย PromptPay QR (ยอดเฉพาะ) · แนบสลิป · ประวัติคำสั่งซื้อ
     ผู้ดูแล:     ส่วน "สมาชิก Premium — ตรวจสลิป" ในหน้าผู้ดูแล (ดูสลิป · อนุมัติ · ปฏิเสธพร้อมเหตุผล)
   ทุกข้อความจากผู้ใช้ผ่าน esc() · รูป QR เป็น SVG ที่เซิร์ฟเวอร์สร้างเอง · รูปสลิปย่อในเบราว์เซอร์ก่อนส่ง (≤ 1 MB)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-premium-root');
  const STATUS = { pending: 'รอชำระเงิน', submitted: 'รอตรวจสลิป', approved: 'อนุมัติแล้ว', rejected: 'ไม่ผ่าน', cancelled: 'ยกเลิก', expired: 'หมดอายุ' };
  const fmtDate = (d, time = false) => { try { return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Bangkok' }); } catch (_) { return ''; } };
  const fmtTime = (d) => { try { return new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); } catch (_) { return ''; } };
  let data = null;      // overview ล่าสุด
  let order = null;     // คำสั่งซื้อที่กำลังชำระ (มี qr)
  let slip = null;      // { dataUrl, size }

  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }

  let dash = null;   // ข้อมูลแดชบอร์ด (/membership/dashboard)
  async function open() {
    setHash('#/premium'); App().showScreen('screen-premium');
    const el = root();
    loading(el);
    try {
      [data, dash] = await Promise.all([App().api('/membership'), App().api('/membership/dashboard').catch(() => null)]);
      const pend = data.orders.find((o) => o.status === 'pending');
      order = pend ? await App().api(`/membership/orders/${pend.id}`) : null;
    } catch (err) {
      el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-pm-retry>ลองใหม่</button></div>`;
      return;
    }
    slip = null;
    render();
    focusTitle('pm-title');
  }

  const STATUS_TH = { weak: 'ควรฝึก', ok: 'พอใช้', strong: 'ดี', few: 'ข้อมูลยังน้อย' };
  const TREND_TH = { up: 'ดีขึ้นจากสัปดาห์ก่อน', down: 'ลดลงจากสัปดาห์ก่อน', flat: 'ใกล้เคียงสัปดาห์ก่อน' };
  function statusCard(m) {
    if (m.state === 'active' || m.state === 'trial') {
      return `<section class="pm-status is-active" aria-label="สถานะสมาชิก">${ICON('crown', 'icon icon-lg')}
        <div><b>${m.state === 'trial' ? 'กำลังทดลองใช้ Premium' : `Premium ใช้งานอยู่ · ${esc(m.planTh)}`}</b><span>ใช้ได้ถึง ${fmtDate(m.expiresAt)} · เหลือ ${m.daysLeft} วัน</span>
        <small>${m.state === 'trial' ? 'หมดช่วงทดลองแล้วกลับเป็น Free เอง ไม่มีการเก็บเงิน · สมัครระหว่างทดลอง วันที่เหลือไม่หาย' : 'ต่ออายุได้ตลอด — วันที่เหลืออยู่จะไม่หาย (ต่อจากวันหมดอายุเดิม)'}</small></div></section>`;
    }
    if (m.state === 'past_due' || m.state === 'expired') {
      return `<section class="pm-status is-warn" aria-label="สถานะสมาชิก">${ICON('clock', 'icon icon-lg')}<div><b>${esc(m.stateTh)}</b>
        <span>หมดอายุเมื่อ ${fmtDate(m.expiresAt)} · ต่ออายุเพื่อใช้แดชบอร์ดและหมวดเฉพาะสมาชิกต่อ · ข้อมูลการเรียนของคุณยังอยู่ครบ</span></div></section>`;
    }
    if (m.state === 'canceled') return `<section class="pm-status is-warn" aria-label="สถานะสมาชิก">${ICON('circle-alert', 'icon icon-lg')}<div><b>${esc(m.stateTh)}</b><span>หากมีข้อสงสัย ติดต่อผู้ดูแล</span></div></section>`;
    return '';
  }
  const skillCard = (s, full) => `<li class="pmd-skill is-${esc(s.status)}">
      <span class="pmd-skill-ic">${ICON(s.icon, 'icon')}</span>
      <span class="pmd-skill-name"><b>${esc(s.th)}</b><small lang="en">${esc(s.en)}</small></span>
      <span class="pmd-skill-score">${s.score == null ? '<small>ข้อมูลยังน้อย</small>' : `<b>${s.score}</b><small>/100</small>`}</span>
      <span class="gl-bar tq-bar pmd-bar" aria-hidden="true"><span style="width:${s.score || 0}%"></span></span>
      <span class="pmd-skill-meta"><span class="pmd-chip is-${esc(s.status)}">${esc(STATUS_TH[s.status] || s.status)}</span>
        ${s.answered ? `${s.answered} ${s.id === 'speaking' ? 'รายการ' : s.id === 'writing' ? 'งานเขียน' : 'ข้อ'}${s.id === 'speaking' ? '' : ' · 30 วัน'}` : 'ยังไม่ได้ฝึก'}
        ${full && s.trend ? ` · ${esc(TREND_TH[s.trend])}` : ''}${s.selfReported ? ' · คะแนนฝึกจากการรู้จำเสียงของเบราว์เซอร์' : ''}</span>
      ${full && s.go ? `<button class="tq-link sp-link pmd-go" type="button" data-pm-nav="${esc(s.go)}">ฝึก${esc(s.th)} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
    </li>`;
  function dashboardHtml(dd) {
    if (!dd) return `<div class="gl-card pmd-err" role="alert">${ICON('wifi-off', 'icon icon-sm')} โหลดแดชบอร์ดไม่สำเร็จ <button class="btn btn-secondary pmd-act" type="button" data-pm-retry>ลองใหม่</button></div>`;
    const wkMax = Math.max(1, ...dd.weekly.days.map((x) => x.answered));
    const wd = (day) => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(`${day}T00:00:00Z`).getUTCDay()];
    const go = (x) => (x.action === 'due-review' ? `<button class="btn btn-primary pmd-act" type="button" data-pm-due>${ICON('rotate-ccw', 'icon icon-sm')} เริ่มทบทวน</button>`
      : x.go ? `<button class="btn btn-secondary pmd-act" type="button" data-pm-nav="${esc(x.go)}">${ICON('play', 'icon icon-sm')} ไปฝึก</button>` : '');
    return `
      <section class="pmd-overview" aria-label="ภาพรวม">
        <div class="pmd-tile"><span>EXP รวม</span><b>${dd.exp.total.toLocaleString('th-TH')}</b><small>ปริมาณกิจกรรม</small></div>
        <div class="pmd-tile"><span>EXP สัปดาห์นี้</span><b>${dd.exp.thisWeek.toLocaleString('th-TH')}</b><small>สัปดาห์ก่อน ${dd.weekly.lastWeek.exp.toLocaleString('th-TH')}</small></div>
        <div class="pmd-tile"><span>วันที่เรียน</span><b>${dd.weekly.thisWeek.activeDays}/7</b><small>ตอบ ${dd.weekly.thisWeek.answered} ข้อในสัปดาห์นี้</small></div>
      </section>
      <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span><b>EXP</b> บอกปริมาณการฝึก · <b>คะแนนทักษะ</b> มาจากความแม่นยำ 30 วัน · <b>ระดับ CEFR</b> มาจากแบบวัดระดับ/Mock เท่านั้น — ทั้งสามอย่างแยกกัน</span></p>
      ${dd.recommendations.length ? `<section class="gl-card pmd-recs" aria-labelledby="pmd-r"><h2 class="tq-h2" id="pmd-r">${ICON('target', 'icon icon-sm')} แนะนำสำหรับคุณวันนี้</h2>
        <ol>${dd.recommendations.map((r) => `<li><span><b>${esc(r.th)}</b><small>${esc(r.why)}</small></span>${go(r)}</li>`).join('')}</ol></section>` : ''}
      <section class="tq-section" aria-labelledby="pmd-s"><h2 class="tq-h2" id="pmd-s">${ICON('chart-column', 'icon icon-sm')} ทักษะ 6 ด้าน</h2>
        <ul class="pmd-skills">${dd.skills.map((s) => skillCard(s, true)).join('')}</ul>
        <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span>คะแนนปรับตามจำนวนข้อ (ตอบน้อยข้อจะไม่ได้ 100 ง่าย ๆ) · ต้องตอบอย่างน้อย ${dd.minAnswers} ข้อใน 30 วันจึงแสดงคะแนน</span></p></section>
      <section class="gl-card pmd-cefr" aria-labelledby="pmd-c"><h2 class="tq-h2" id="pmd-c">${ICON('graduation-cap', 'icon icon-sm')} ระดับ CEFR โดยประมาณ</h2>
        ${dd.cefr.length ? `<ul>${dd.cefr.map((c) => `<li><span><b>${esc(c.th)}</b><small>${fmtDate(c.at)}</small></span>
            <span class="pmd-cefr-v">${c.overall ? `<b>${esc(c.overall)}</b>` : ''}${Object.entries(c.parts).filter(([, v]) => v).map(([k, v]) => `<small>${esc({ vocab: 'คำศัพท์', grammar: 'ไวยากรณ์', listening: 'ฟัง', reading: 'อ่าน' }[k] || k)} ${esc(v)}</small>`).join('')}</span></li>`).join('')}</ul>`
          : `<p>ยังไม่มีผลประเมิน — ระดับ CEFR ไม่ได้คำนวณจาก EXP</p>`}
        <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span>เป็นการประมาณจากแบบทดสอบฝึกของแอป ไม่ใช่ผลรับรอง CEFR อย่างเป็นทางการ</span></p>
        <button class="btn btn-secondary pmd-act" type="button" data-pm-nav="placement">${ICON('target', 'icon icon-sm')} ทำแบบวัดระดับ</button></section>
      <section class="gl-card pmd-week" aria-labelledby="pmd-w"><h2 class="tq-h2" id="pmd-w">${ICON('calendar', 'icon icon-sm')} 14 วันล่าสุด</h2>
        <ol class="pmd-bars">${dd.weekly.days.map((x) => `<li title="${esc(x.day)}: ตอบ ${x.answered} ข้อ${x.answered ? ` · ถูก ${Math.round((x.correct / x.answered) * 100)}%` : ''} · EXP ${x.exp}">
          <span class="pmd-bar-col"><span style="height:${Math.round((x.answered / wkMax) * 100)}%"></span></span><small>${wd(x.day)}</small>
          <span class="sr-only">${esc(x.day)} ตอบ ${x.answered} ข้อ</span></li>`).join('')}</ol></section>
      <section class="gl-card pmd-queue" aria-labelledby="pmd-q"><h2 class="tq-h2" id="pmd-q">${ICON('rotate-ccw', 'icon icon-sm')} คิวทบทวน</h2>
        ${dd.queue.length ? `<ul>${dd.queue.map((x) => `<li><span><b>${esc(x.th)}</b><small>${esc(x.why)}</small></span>${go(x)}</li>`).join('')}</ul>` : '<p>ไม่มีอะไรค้างให้ทบทวนตอนนี้ — เรียนเรื่องใหม่ต่อได้เลย</p>'}</section>`;
  }
  // ลิงก์เนื้อหาเฉพาะสมาชิก — แสดงเสมอแม้แดชบอร์ดโหลดไม่สำเร็จ
  function memberLinksHtml() {
    return `
      <section class="tq-section" aria-labelledby="pmd-p"><h2 class="tq-h2" id="pmd-p">${ICON('crown', 'icon icon-sm')} เนื้อหาสำหรับสมาชิก</h2>
        <div class="pmd-links">
          <button class="tq-mode pm-go-work" type="button" data-pm-nav="work">${ICON('briefcase', 'icon')}<b>ภาษาอังกฤษเพื่อการทำงาน</b><small>72 วลี · 6 สถานการณ์ · แบบฝึก</small></button>
          <button class="tq-mode" type="button" data-pm-nav="toeic">${ICON('flame', 'icon')}<b>แผนฝึก TOEIC รายวัน</b><small>มีตัวช่วยรักษา Streak 2 วัน/เดือน</small></button>
        </div></section>`;
  }
  function compareHtml(d) {
    const cell = (v) => (v === true ? `<span class="pmc-yes">${ICON('check', 'icon icon-sm')}<span class="sr-only">มี</span></span>` : v === 'preview' ? '<span class="pmc-pre">ตัวอย่าง</span>' : '<span class="pmc-no" aria-label="ไม่มี">—</span>');
    return `<section class="gl-card pmc" aria-labelledby="pmc-t"><h2 class="tq-h2" id="pmc-t">${ICON('list-checks', 'icon icon-sm')} Free กับ Premium ต่างกันอย่างไร</h2>
      <table class="pmc-table"><thead><tr><th scope="col">สิ่งที่ได้</th><th scope="col">Free</th><th scope="col">Premium</th></tr></thead>
        <tbody>${d.compare.map((r) => `<tr><th scope="row">${esc(r.th)}</th><td>${cell(r.free)}</td><td>${cell(r.premium)}</td></tr>`).join('')}</tbody></table>
      <p class="pm-fair">${ICON('shield-check', 'icon icon-sm')}<span>${esc(d.notIncluded)}</span></p></section>`;
  }
  function roadmapHtml(d) {
    return `<details class="gl-card pmr"><summary>${ICON('sparkles', 'icon icon-sm')} กำลังพัฒนา (ยังไม่รวมในสิทธิ์ตอนนี้)</summary>
      <ul>${d.roadmap.map((r) => `<li>${ICON(r.icon, 'icon icon-sm')}<span>${esc(r.th)}</span></li>`).join('')}</ul>
      <p class="pmd-note">${ICON('info', 'icon icon-sm')}<span>จะเปิดให้สมาชิกเมื่อพร้อมใช้งานจริงและผ่านการทดสอบแล้วเท่านั้น — ราคาที่จ่ายตอนนี้คือสำหรับสิ่งที่อยู่ในตารางด้านบน</span></p></details>`;
  }

  function render() {
    const d = data; const m = d.membership;
    const access = m.access;
    const waiting = d.orders.filter((o) => o.status === 'submitted');
    const waitBox = waiting.length ? `<section class="pm-wait" role="status">${ICON('hourglass', 'icon')}
        <div><b>ได้รับสลิปแล้ว — รอผู้ดูแลตรวจ</b><span>${waiting.map((o) => `${esc(o.planTh)} ฿${esc(o.amount)} · ส่งเมื่อ ${fmtDate(o.submittedAt, true)}${o.verifyNote ? `<br><span class="pm-vnote">ตรวจอัตโนมัติไม่ผ่าน: ${esc(o.verifyNote)}</span>` : ''}`).join('<br>')}</span>
        <small>ปกติตรวจภายใน 24 ชั่วโมง · อนุมัติแล้วจะมีแจ้งเตือน (ถ้าเปิดการแจ้งเตือนไว้)</small></div></section>` : '';
    const plan = (p) => `<li class="pm-plan${p.id === 'yearly' ? ' is-best' : ''}">
        ${p.id === 'yearly' ? '<span class="pm-tag">คุ้มกว่า</span>' : ''}
        <h3>${esc(p.th)}</h3>
        <p class="pm-price"><b>฿${p.price.toLocaleString('th-TH')}</b><span>/ ${p.days === 365 ? 'ปี' : 'เดือน'}</span></p>
        <p class="pm-plan-note">${esc(p.note)}${p.days === 365 ? ` · เฉลี่ย ฿${p.perMonth}/เดือน` : ''}</p>
        <button class="btn ${p.id === 'yearly' ? 'btn-primary' : 'btn-secondary'} pm-buy" type="button" data-pm-buy="${esc(p.id)}" ${d.payment.ready ? '' : 'disabled aria-disabled="true"'}>
          ${access && m.state === 'active' ? 'ต่ออายุ' : 'เลือก'}${esc(p.th)}</button></li>`;
    const plans = `${!d.payment.ready ? `<p class="pm-off" role="status">${ICON('info', 'icon icon-sm')} ยังไม่เปิดรับชำระเงินในขณะนี้</p>` : ''}
      ${order ? '' : `<ul class="pm-plans" id="pm-plans">${d.plans.map(plan).join('')}</ul>`}`;
    const trialBox = !access && m.trialAvailable ? `<section class="pm-trial">${ICON('gift', 'icon icon-lg')}
        <div><b>ทดลองใช้ Premium ฟรี ${d.trialDays} วัน</b><span>ไม่ต้องจ่ายเงิน ไม่ต้องผูกบัตร · หมดแล้วกลับเป็น Free เอง · ใช้ได้ครั้งเดียวต่อบัญชี</span>
        <button class="btn btn-primary pm-trial-btn" type="button" data-pm-trial>${ICON('play', 'icon icon-sm')} เริ่มทดลองใช้ฟรี</button></div></section>` : '';
    const teaser = !access && dash ? `<section class="tq-section" aria-labelledby="pmd-s"><h2 class="tq-h2" id="pmd-s">${ICON('chart-column', 'icon icon-sm')} ทักษะ 6 ด้านของคุณ</h2>
        <ul class="pmd-skills">${dash.skills.map((s) => skillCard(s, false)).join('')}</ul>
        <div class="pmd-locked">${ICON('lock', 'icon')}<span><b>สมาชิกเห็นเพิ่ม:</b> แนวโน้มรายสัปดาห์ · กิจกรรม 14 วัน · คิวทบทวน · คำแนะนำรายวัน · ระดับ CEFR โดยประมาณ</span></div></section>` : '';
    const hist = d.orders.filter((o) => o.status !== 'pending');
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-pm-nav="profile">${ICON('arrow-left', 'icon icon-sm')} โปรไฟล์</button>
      <header class="pm-hero"><p class="gl-kicker">${ICON('crown', 'icon icon-sm')} EnglishQuest Premium</p>
        <h1 class="page-title" id="pm-title">${access ? 'แดชบอร์ดการเรียน' : 'สมาชิก Premium'}</h1>
        <p class="gl-sub">${access ? 'ภาพรวมทักษะ สิ่งที่ควรทบทวน และคำแนะนำจากผลการเรียนจริงของคุณ' : 'เรียนพื้นฐานได้ฟรีครบ · Premium เพิ่มการวิเคราะห์การเรียน เนื้อหาเฉพาะ และสนับสนุนการพัฒนา · ไม่ตัดเงินอัตโนมัติ'}</p></header>
      ${statusCard(m)}${waitBox}
      ${order ? checkout(order) : ''}
      ${access ? `${dashboardHtml(dash)}${memberLinksHtml()}
        <details class="gl-card pm-renew"><summary>${ICON('refresh-cw', 'icon icon-sm')} ต่ออายุ / เปลี่ยนแพ็กเกจ</summary>${plans}</details>`
        : `${trialBox}${compareHtml(d)}${teaser}<h2 class="tq-h2 pm-plans-h">${ICON('crown', 'icon icon-sm')} เลือกแพ็กเกจ</h2>${plans}`}
      ${access ? compareHtml(d) : ''}
      ${roadmapHtml(d)}
      ${hist.length ? `<section class="gl-card pm-hist" aria-labelledby="pm-h"><h2 class="tq-h2" id="pm-h">${ICON('history', 'icon icon-sm')} ประวัติการชำระ</h2>
        <ul>${hist.map((o) => `<li><span><b>${esc(o.planTh)} · ฿${esc(o.amount)}</b><small>${fmtDate(o.createdAt, true)}</small>
          ${o.adminNote ? `<small class="pm-note">เหตุผล: ${esc(o.adminNote)}</small>` : ''}</span>
          <span class="pm-chip is-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></li>`).join('')}</ul></section>` : ''}
      <details class="about-note pm-terms"><summary>${ICON('info', 'icon icon-sm')} เงื่อนไขและความเป็นส่วนตัว</summary>
        <p>สมาชิกไม่ต่ออายุอัตโนมัติ เมื่อครบกำหนดสิทธิ์จะหมดเอง ต่ออายุได้ทุกเมื่อโดยวันที่เหลือไม่หาย · ทดลองใช้ฟรีได้ครั้งเดียวต่อบัญชีและไม่มีการเก็บเงิน · สิทธิ์ Premium ไม่เพิ่ม EXP หรือ Coin และไม่ช่วยในการแข่งขัน ·
        รูปสลิปใช้เพื่อตรวจการชำระเงินเท่านั้น ผู้ดูแลเท่านั้นที่เปิดดูได้ และลบอัตโนมัติ ${90} วันหลังตรวจ · ข้อมูลการเรียนที่ใช้ในแดชบอร์ดเป็นของคุณเอง ไม่แสดงให้ผู้อื่น · หากโอนแล้วมีปัญหา ติดต่อผู้ดูแลผ่านช่องทางของ EnglishQuest</p></details>`;
  }

  function checkout(o) {
    const expired = Date.parse(o.expiresAt) < Date.now();
    return `<section class="gl-card pm-checkout" aria-labelledby="pm-co">
      <h2 class="tq-h2" id="pm-co">${ICON('crown', 'icon icon-sm')} ชำระ ${esc(o.planTh)}</h2>
      <ol class="pm-steps">
        <li><b>สแกน QR หรือบันทึกรูปแล้วเปิดในแอปธนาคาร</b>
          <div class="pm-qr-wrap">
            <div class="pm-qr" role="img" aria-label="QR พร้อมเพย์ ยอด ${esc(o.amount)} บาท">${o.qr ? o.qr.svg : ''}</div>
            <div class="pm-pay">
              <span class="pm-pp">PromptPay · พร้อมเพย์</span>
              <p class="pm-amount"><small>ยอดที่ต้องโอน</small><b>฿${esc(o.amount)}</b></p>
              <p class="pm-exact">${ICON('circle-alert', 'icon icon-sm')}<span>โอน<b>ให้ตรงทุกสตางค์</b> — เศษสตางค์ใช้ยืนยันว่าเป็นรายการของคุณ</span></p>
              ${o.payeeName ? `<p class="pm-payee">ชื่อบัญชีผู้รับ: <b>${esc(o.payeeName)}</b></p>` : ''}
              <p class="pm-exp">${expired ? 'คำสั่งซื้อนี้หมดเวลาแล้ว' : `ชำระภายใน ${fmtDate(o.expiresAt)} ${fmtTime(o.expiresAt)} น.`}</p>
              <button class="btn btn-secondary pm-save" type="button" data-pm-saveqr>${ICON('save', 'icon icon-sm')} บันทึกรูป QR</button>
            </div>
          </div></li>
        <li><b>แนบสลิปการโอน</b>${data && data.payment.autoVerify ? '<p class="pm-auto">ระบบตรวจสลิปกับธนาคารให้อัตโนมัติ — ถ้าถูกต้อง Premium เปิดใช้ได้ทันที</p>' : ''}
          <label class="pm-file"><input type="file" accept="image/jpeg,image/png,image/webp" data-pm-file>
            <span class="btn btn-secondary">${ICON('image', 'icon icon-sm')} เลือกรูปสลิป</span></label>
          <div class="pm-preview" data-pm-preview hidden></div>
          <label class="pm-field">เวลาที่โอน (ไม่บังคับ)<input type="text" maxlength="40" placeholder="เช่น 28 ต.ค. 14:05" data-pm-paidat autocomplete="off"></label>
          <p class="pm-err" role="alert" data-pm-err hidden></p>
          <button class="btn btn-primary pm-send" type="button" data-pm-send disabled>${ICON('check', 'icon icon-sm')} ส่งสลิปให้ตรวจ</button></li>
      </ol>
      <button class="tq-link sp-link pm-cancel" type="button" data-pm-cancel="${o.id}">ยกเลิกคำสั่งซื้อนี้ / เปลี่ยนแพ็กเกจ</button>
    </section>`;
  }

  /** ย่อรูปสลิปเป็น JPEG ด้านยาวไม่เกิน 1600px และไม่เกิน ~900 KB */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('รองรับเฉพาะรูป JPG / PNG / WEBP')); return; }
      if (file.size > 15 * 1024 * 1024) { reject(new Error('ไฟล์ใหญ่เกินไป')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.88; let out = c.toDataURL('image/jpeg', q);
        while (out.length * 0.75 > 900000 && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
        resolve({ dataUrl: out, size: Math.round(out.length * 0.75) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้')); };
      img.src = url;
    });
  }
  function showErr(msg) { const e = root().querySelector('[data-pm-err]'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } }

  function saveQr() {
    const svg = root().querySelector('.pm-qr svg');
    if (!svg || !order) return;
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 720; c.height = 860;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 60, 40, 600, 600);
      g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 44px sans-serif'; g.fillText(`฿${order.amount}`, 360, 712);
      g.font = '28px sans-serif'; g.fillText(`EnglishQuest Premium · ${order.planTh}`, 360, 762);
      if (order.payeeName) g.fillText(order.payeeName, 360, 806);
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `englishquest-premium-${order.amount}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    };
    img.src = src;
  }

  document.addEventListener('submit', (e) => {
    const f = e.target.closest && e.target.closest('[data-pma-search]');
    if (!f) return;
    e.preventDefault(); memberQ = (f.querySelector('[data-pma-q]') || {}).value || ''; mountAdmin();
  });
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest && e.target.closest('#screen-premium [data-pm-file]');
    if (!inp || !inp.files || !inp.files[0]) return;
    showErr('');
    const pv = root().querySelector('[data-pm-preview]'); const send = root().querySelector('[data-pm-send]');
    try {
      slip = await shrink(inp.files[0]);
      pv.innerHTML = `<img src="${slip.dataUrl}" alt="ตัวอย่างสลิปที่เลือก"><small>${Math.round(slip.size / 1024)} KB</small>`; pv.hidden = false;
      send.disabled = false;
    } catch (err) { slip = null; pv.hidden = true; send.disabled = true; showErr(err.message); }
  });

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    if (t.closest('#screen-premium')) {
      if (t.closest('[data-pm-retry]')) { open(); return; }
      let b = t.closest('[data-pm-nav]');
      if (b) { App().navigateTo(b.dataset.pmNav); return; }
      b = t.closest('[data-pm-buy]');
      if (b) {
        b.disabled = true;
        try { order = await App().api('/membership/orders', { method: 'POST', body: { plan: b.dataset.pmBuy } }); data = await App().api('/membership'); slip = null; render();
          const co = document.getElementById('pm-co'); if (co) co.scrollIntoView({ block: 'start' });
        } catch (err) { b.disabled = false; App().toast(err.message || 'สร้างคำสั่งซื้อไม่สำเร็จ', 'error'); }
        return;
      }
      if (t.closest('[data-pm-due]')) { App().openDueReview(); return; }
      b = t.closest('[data-pm-trial]');
      if (b) {
        b.disabled = true;
        try { await App().api('/membership/trial', { method: 'POST', body: {} }); if (App().user) App().user.premium = { active: true, trial: true, state: 'trial' };
          App().toast('เริ่มทดลองใช้ Premium แล้ว — สนุกกับการเรียนนะ', 'success'); open(); }
        catch (err) { b.disabled = false; App().toast(err.message || 'เริ่มทดลองใช้ไม่สำเร็จ', 'error'); }
        return;
      }
      if (t.closest('[data-pm-saveqr]')) { saveQr(); return; }
      b = t.closest('[data-pm-send]');
      if (b && order && slip) {
        b.disabled = true; showErr('');
        try {
          const paidAt = (root().querySelector('[data-pm-paidat]') || {}).value || '';
          const r = await App().api(`/membership/orders/${order.id}/slip`, { method: 'POST', body: { dataUrl: slip.dataUrl, paidAt } });
          if (r.status === 'approved') {
            if (App().user) App().user.premium = { active: true };   // ป้ายในโปรไฟล์อัปเดตทันที (สิทธิ์จริงตรวจที่เซิร์ฟเวอร์)
            App().toast('ชำระเงินสำเร็จ — Premium พร้อมใช้งานแล้ว ขอบคุณที่สนับสนุน!', 'success');
          } else App().toast('ส่งสลิปแล้ว รอผู้ดูแลตรวจสอบ', 'success');
          open();
        } catch (err) { b.disabled = false; showErr(err.message || 'ส่งสลิปไม่สำเร็จ'); }
        return;
      }
      b = t.closest('[data-pm-cancel]');
      if (b) {
        try { await App().api(`/membership/orders/${b.dataset.pmCancel}/cancel`, { method: 'POST', body: {} }); } catch (_) { /* หมดอายุแล้วก็กลับไปเลือกใหม่ได้ */ }
        open();
      }
      return;
    }
    if (t.closest('#admin-membership-root')) adminClick(e);
  });

  /* =========================== ผู้ดูแล =========================== */
  let adminStatus = 'submitted';
  const ADMIN_TABS = [['submitted', 'รอตรวจ'], ['pending', 'ยังไม่แนบสลิป'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ไม่ผ่าน'], ['members', 'สมาชิก'], ['audit', 'ประวัติ']];
  let memberQ = '';
  const tabsHtml = (counts = {}) => `<div class="pma-tabs" role="group" aria-label="สถานะ">${ADMIN_TABS.map(([v, l]) => `<button type="button" class="tqw-seg${adminStatus === v ? ' is-on' : ''}" aria-pressed="${adminStatus === v}" data-pma-tab="${v}">${l}${v === 'submitted' && counts.submitted ? ` (${counts.submitted})` : ''}</button>`).join('')}</div>`;
  const ACTION_TH = { trial_start: 'เริ่มทดลองใช้', order_approve: 'อนุมัติคำสั่งซื้อ', order_auto_approve: 'อนุมัติอัตโนมัติ (ตรวจสลิปผ่าน)', order_reject: 'ปฏิเสธคำสั่งซื้อ',
    order_reverify: 'ตรวจสลิปอัตโนมัติอีกครั้ง', membership_grant: 'ให้สิทธิ์ Premium', membership_revoke: 'ยกเลิกสิทธิ์ Premium',
    test_flag_on: 'ตั้งเป็นบัญชีทดสอบ (ซ่อนจากกระดานอันดับ)', test_flag_off: 'ยกเลิกบัญชีทดสอบ' };
  async function mountMembers(box) {
    let r;
    try { r = await App().api(`/admin/membership/members?q=${encodeURIComponent(memberQ)}`); } catch (err) { box.innerHTML = tabsHtml() + `<p class="page-sub">${esc(err.message)}</p>`; return; }
    box.innerHTML = `${tabsHtml()}
      <form class="pma-search" data-pma-search><input type="search" maxlength="40" placeholder="ค้นหาชื่อผู้ใช้" aria-label="ค้นหาชื่อผู้ใช้" value="${esc(memberQ)}" data-pma-q>
        <button class="btn btn-secondary" type="submit">${ICON('search', 'icon icon-sm')} ค้นหา</button></form>
      <p class="page-sub">ให้สิทธิ์ (เช่น ชดเชย/ทดแทน) หรือยกเลิกสิทธิ์ (เช่น คืนเงินแล้ว) — ต้องใส่เหตุผลทุกครั้ง และถูกบันทึกในแท็บ "ประวัติ" · ปุ่ม "บัญชีทดสอบ" ซ่อนบัญชีจากกระดานอันดับ (ค้นหาด้วยชื่อเพื่อดูผู้ใช้ทุกคน)</p>
      ${r.members.length ? `<ul class="pma-list">${r.members.map((m) => `<li class="pma-row" data-uid="${m.userId}">
        <div class="pma-main"><b>${esc(m.username)}${m.isTest ? ' <span class="pma-test">บัญชีทดสอบ</span>' : ''}</b><small>${esc(m.stateTh)}${m.expiresAt ? ` · ถึง ${fmtDate(m.expiresAt)}` : ''}${m.trialUsed ? ' · เคยทดลองใช้แล้ว' : ''}${m.cancelReason ? ` · ${esc(m.cancelReason)}` : ''}</small></div>
        <div class="pma-actions"><input type="number" min="1" max="366" value="30" aria-label="จำนวนวัน" data-pma-days class="pma-days">
          <input type="text" maxlength="200" placeholder="เหตุผล" aria-label="เหตุผล" data-pma-note>
          <button class="btn btn-primary" type="button" data-pma-grant="${m.userId}">${ICON('plus', 'icon icon-sm')} ให้สิทธิ์</button>
          ${m.access ? `<button class="btn btn-secondary" type="button" data-pma-revoke="${m.userId}">${ICON('ban', 'icon icon-sm')} ยกเลิกสิทธิ์</button>` : ''}
          <button class="btn btn-secondary" type="button" data-pma-test="${m.userId}" data-on="${m.isTest ? '0' : '1'}">${ICON('eye-off', 'icon icon-sm')} ${m.isTest ? 'ไม่ใช่บัญชีทดสอบ' : 'บัญชีทดสอบ'}</button></div></li>`).join('')}</ul>`
        : '<p class="page-sub">ไม่พบผู้ใช้</p>'}`;
  }
  async function mountAudit(box) {
    let r;
    try { r = await App().api('/admin/membership/audit?limit=60'); } catch (err) { box.innerHTML = tabsHtml() + `<p class="page-sub">${esc(err.message)}</p>`; return; }
    box.innerHTML = `${tabsHtml()}${r.logs.length ? `<ul class="pma-list">${r.logs.map((l) => `<li class="pma-row"><div class="pma-main">
        <b>${esc(ACTION_TH[l.action] || l.action)}</b><small>${fmtDate(l.at, true)} · โดย ${esc(l.actor)}${l.target ? ` · ผู้ใช้ ${esc(l.target)}` : ''}${l.ref ? ` · ${esc(l.ref)}` : ''}</small>
        ${l.details && (l.details.note || l.details.amount || l.details.days) ? `<small>${l.details.amount ? `฿${esc(l.details.amount)} ` : ''}${l.details.days ? `${esc(l.details.days)} วัน ` : ''}${l.details.note ? esc(l.details.note) : ''}</small>` : ''}</div></li>`).join('')}</ul>` : '<p class="page-sub">ยังไม่มีประวัติ</p>'}`;
  }
  async function mountAdmin() {
    const box = document.getElementById('admin-membership-root');
    if (!box) return;
    box.innerHTML = '<p class="page-sub">กำลังโหลด…</p>';
    if (adminStatus === 'members') { await mountMembers(box); return; }
    if (adminStatus === 'audit') { await mountAudit(box); return; }
    let r;
    try { r = await App().api(`/admin/membership/orders?status=${adminStatus}`); } catch (err) { box.innerHTML = `<p class="page-sub">${esc(err.message)}</p>`; return; }
    const badge = document.getElementById('admin-membership-count');
    if (badge) { const n = r.counts.submitted || 0; badge.textContent = n; badge.classList.toggle('hidden', !n); }
    const row = (o) => `<li class="pma-row" data-id="${o.id}">
        <div class="pma-main"><b class="pma-amount">฿${esc(o.amount)}</b><span>${esc(o.username)} · ${esc(o.planTh)} (${o.days} วัน)</span>
          <small>สร้าง ${fmtDate(o.createdAt, true)}${o.submittedAt ? ` · ส่งสลิป ${fmtDate(o.submittedAt, true)}` : ''}${o.paidAtNote ? ` · ผู้ใช้แจ้งเวลาโอน: ${esc(o.paidAtNote)}` : ''}</small>
          ${o.verifyStatus ? `<small class="pma-v is-${esc(o.verifyStatus)}">ตรวจอัตโนมัติ: ${esc({ passed: 'ผ่าน', failed: 'ไม่ผ่าน', error: 'ระบบขัดข้อง' }[o.verifyStatus] || o.verifyStatus)}${o.verifyNote ? ` — ${esc(o.verifyNote)}` : ''}${o.transRef ? ` · Ref ${esc(o.transRef)}` : ''}</small>` : ''}
          ${o.reviewedAt ? `<small>ตรวจโดย ${esc(o.reviewer || '-')} · ${fmtDate(o.reviewedAt, true)}${o.adminNote ? ` · ${esc(o.adminNote)}` : ''}</small>` : ''}</div>
        <div class="pma-slip" data-slip-box hidden></div>
        <div class="pma-actions">
          ${o.slipAvailable ? `<button class="btn btn-secondary" type="button" data-pma-slip="${o.id}">${ICON('image', 'icon icon-sm')} ดูสลิป</button>` : ''}
          ${r.autoVerify && o.status === 'submitted' && o.slipAvailable ? `<button class="btn btn-secondary" type="button" data-pma-reverify="${o.id}">${ICON('refresh-cw', 'icon icon-sm')} ตรวจอัตโนมัติอีกครั้ง</button>` : ''}
          ${['submitted', 'pending'].includes(o.status) ? `<button class="btn btn-primary" type="button" data-pma-approve="${o.id}">${ICON('check', 'icon icon-sm')} อนุมัติ</button>
            <input type="text" maxlength="200" placeholder="เหตุผล (ถ้าไม่ผ่าน)" aria-label="เหตุผลที่ไม่ผ่าน" data-pma-note>
            <button class="btn btn-secondary" type="button" data-pma-reject="${o.id}">${ICON('x', 'icon icon-sm')} ไม่ผ่าน</button>` : ''}
        </div></li>`;
    box.innerHTML = `${tabsHtml(r.counts)}
      <p class="page-sub">เทียบ <b>ยอดเงินรวมเศษสตางค์</b> กับรายการเงินเข้าในแอปธนาคารก่อนอนุมัติ · อนุมัติแล้วสิทธิ์ต่อจากวันหมดอายุเดิม</p>
      ${r.orders.length ? `<ul class="pma-list">${r.orders.map(row).join('')}</ul>` : '<p class="page-sub">ไม่มีรายการ</p>'}`;
  }
  async function adminClick(e) {
    const t = e.target;
    const tf = t.closest('[data-pma-test]');
    if (tf) {
      tf.disabled = true;
      try {
        await App().api(`/admin/membership/members/${tf.dataset.pmaTest}/test-flag`, { method: 'POST', body: { isTest: tf.dataset.on === '1' } });
        App().toast(tf.dataset.on === '1' ? 'ตั้งเป็นบัญชีทดสอบแล้ว — ไม่แสดงในกระดานอันดับ' : 'ยกเลิกบัญชีทดสอบแล้ว', 'success'); mountAdmin();
      } catch (err) { tf.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    let g = t.closest('[data-pma-grant]') || t.closest('[data-pma-revoke]');
    if (g) {
      const row = g.closest('.pma-row'); const note = (row.querySelector('[data-pma-note]') || {}).value || '';
      if (!note.trim()) { App().toast('ใส่เหตุผลก่อน (บันทึกในประวัติ)', 'error'); return; }
      const grant = Boolean(g.dataset.pmaGrant);
      if (!grant && !confirm('ยกเลิกสิทธิ์ Premium ของผู้ใช้นี้ทันที?')) return;
      g.disabled = true;
      try {
        await App().api(`/admin/membership/members/${grant ? g.dataset.pmaGrant : g.dataset.pmaRevoke}/${grant ? 'grant' : 'revoke'}`,
          { method: 'POST', body: { note, days: Number((row.querySelector('[data-pma-days]') || {}).value) } });
        App().toast(grant ? 'ให้สิทธิ์แล้ว' : 'ยกเลิกสิทธิ์แล้ว', 'success'); mountAdmin();
      } catch (err) { g.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    let b = t.closest('[data-pma-tab]');
    if (b) { adminStatus = b.dataset.pmaTab; mountAdmin(); return; }
    b = t.closest('[data-pma-slip]');
    if (b) {
      const box = b.closest('.pma-row').querySelector('[data-slip-box]');
      if (!box.hidden) { box.hidden = true; return; }
      try {
        const res = await fetch(`/api/admin/membership/orders/${b.dataset.pmaSlip}/slip`, { headers: { Authorization: `Bearer ${App().token}` } });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดสลิปไม่สำเร็จ');
        const url = URL.createObjectURL(await res.blob());
        box.innerHTML = `<img src="${url}" alt="สลิปการโอน">`; box.hidden = false;
      } catch (err) { App().toast(err.message, 'error'); }
      return;
    }
    b = t.closest('[data-pma-reverify]');
    if (b) {
      b.disabled = true;
      try { const x = await App().api(`/admin/membership/orders/${b.dataset.pmaReverify}/reverify`, { method: 'POST', body: {} });
        App().toast(x.status === 'approved' ? 'ตรวจผ่าน — อนุมัติอัตโนมัติแล้ว' : `ยังไม่ผ่าน: ${x.auto && x.auto.note ? x.auto.note : '-'}`, x.status === 'approved' ? 'success' : 'info'); mountAdmin();
      } catch (err) { b.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    b = t.closest('[data-pma-approve]');
    if (b) {
      const row = b.closest('.pma-row');
      if (!confirm(`อนุมัติยอด ${row.querySelector('.pma-amount').textContent}? ตรวจว่ามีเงินเข้าตรงยอดแล้ว`)) return;
      b.disabled = true;
      try { await App().api(`/admin/membership/orders/${b.dataset.pmaApprove}/approve`, { method: 'POST', body: {} }); App().toast('อนุมัติแล้ว', 'success'); mountAdmin(); } catch (err) { b.disabled = false; App().toast(err.message, 'error'); }
      return;
    }
    b = t.closest('[data-pma-reject]');
    if (b) {
      const note = (b.closest('.pma-row').querySelector('[data-pma-note]') || {}).value || '';
      if (!note.trim()) { App().toast('ใส่เหตุผลให้ผู้ใช้ทราบก่อน', 'error'); return; }
      b.disabled = true;
      try { await App().api(`/admin/membership/orders/${b.dataset.pmaReject}/reject`, { method: 'POST', body: { note } }); App().toast('บันทึกว่าไม่ผ่านแล้ว', 'success'); mountAdmin(); } catch (err) { b.disabled = false; App().toast(err.message, 'error'); }
    }
  }

  window.EQPremium = { open, mountAdmin, _state: () => ({ data, order }) };
})();
