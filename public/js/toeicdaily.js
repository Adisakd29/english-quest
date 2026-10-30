/* =====================================================================
   TOEIC — แผนฝึกรายวัน + streak — window.EQToeicDaily
     การ์ดบนหน้า TOEIC Practice: 3 งานสั้น (~10–15 นาที) · ความคืบหน้า · streak + 7 วันล่าสุด
   แต่ละงาน = Practice ปกติของ Part นั้น (เริ่มผ่าน module.drill พร้อม dailyTask — เซิร์ฟเวอร์ใช้ body ของงานเอง)
   ข้อมูลจาก /api/toeic/daily ของผู้ใช้ที่ล็อกอินเท่านั้น · ทุกข้อความผ่าน esc()
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODULE = { 1: () => window.EQToeic, 2: () => window.EQToeic2, 3: () => window.EQToeic34, 4: () => window.EQToeic34, 5: () => window.EQToeic5, 6: () => window.EQToeic6, 7: () => window.EQToeic7 };
  const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const KIND_ICON = { mistakes: 'rotate-ccw', drill: 'target', practice: 'play' };
  let last = null;

  const wd = (day) => WD[new Date(`${day}T00:00:00Z`).getUTCDay()];

  function render(d) {
    const pct = Math.round((d.done / d.total) * 100);
    const task = (t) => {
      const st = t.state === 'done'
        ? `<span class="tqd-done">${ICON('circle-check', 'icon icon-sm')} เสร็จแล้ว</span>`
        : t.state === 'active'
          ? `<button class="btn btn-primary tqd-go" type="button" data-tqd-resume="${t.k}">${ICON('play', 'icon icon-sm')} ทำต่อ${t.answered != null ? ` ${t.answered}/${t.total}` : ''}</button>`
          : `<button class="btn ${d.next === t.k ? 'btn-primary' : 'btn-secondary'} tqd-go" type="button" data-tqd-start="${t.k}">${ICON('play', 'icon icon-sm')} เริ่ม</button>`;
      return `<li class="tqd-task is-${esc(t.state)}${d.next === t.k ? ' is-next' : ''}">
        <span class="tqd-ic" aria-hidden="true">${t.state === 'done' ? ICON('check', 'icon icon-sm') : ICON(KIND_ICON[t.kind] || 'play', 'icon icon-sm')}</span>
        <span class="tqd-text"><b>${esc(t.th)}</b><small>${esc(t.partName)} · ${esc(t.size)} · ~${t.minutes} นาที</small>
          <small class="tqd-why">${esc(t.note || t.reason)}</small></span>${st}</li>`;
    };
    const week = d.streak.week.map((w) => `<li class="tqd-day${w.done ? ' is-done' : ''}${w.frozen ? ' is-frozen' : ''}${w.day === d.day ? ' is-today' : ''}" title="${esc(w.day)}">
        <span class="tqd-dot" aria-hidden="true">${w.done ? ICON('check', 'icon icon-sm') : w.frozen ? ICON('shield', 'icon icon-sm') : ''}</span><small>${wd(w.day)}</small>
        <span class="sr-only">${esc(w.day)} ${w.done ? 'ทำครบ' : w.frozen ? 'ใช้ตัวช่วยรักษา Streak' : 'ยังไม่ครบ'}</span></li>`).join('');
    return `<section class="gl-card tqd${d.completed ? ' is-complete' : ''}" aria-labelledby="tqd-title">
      <div class="tqd-head">
        <div><h2 class="tq-h2" id="tqd-title">${ICON('calendar', 'icon icon-sm')} แผนฝึกวันนี้</h2>
          <p class="tqd-sub">${d.total} งาน · ~${d.minutes} นาที · ทำครบได้ +${d.bonusExp} EXP</p></div>
        <div class="tqd-streak" aria-label="ฝึกครบต่อเนื่อง ${d.streak.current} วัน">${ICON('flame', 'icon')}<b>${d.streak.current}</b><small>วันติด</small></div>
      </div>
      <div class="tqd-progress"><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><b>${d.done}/${d.total}</b></div>
      ${d.completed ? `<p class="tqd-complete" role="status">${ICON('sparkles', 'icon icon-sm')} ครบแผนวันนี้แล้ว — พรุ่งนี้มีแผนใหม่ตามผลล่าสุดของคุณ</p>` : ''}
      <ol class="tqd-tasks">${d.tasks.map(task).join('')}</ol>
      <ul class="tqd-week" aria-label="7 วันล่าสุด">${week}</ul>
      ${d.streak.best > 1 ? `<p class="tqd-best">สถิติต่อเนื่องสูงสุด ${d.streak.best} วัน</p>` : ''}
      ${d.streak.freeze ? `<p class="tqd-best">${ICON('shield', 'icon icon-sm')} Premium: ตัวช่วยรักษา Streak เดือนนี้ใช้แล้ว ${d.streak.freeze.usedThisMonth}/${d.streak.freeze.perMonth} วัน</p>` : ''}
    </section>`;
  }

  async function mount(el) {
    if (!el) return;
    let d;
    try { d = await App().api('/toeic/daily'); } catch (_) { el.innerHTML = ''; return; }   // แผนรายวันโหลดไม่ได้ ไม่บล็อกหน้า Hub
    last = d;
    if (!document.body.contains(el)) return;
    el.innerHTML = render(d);
    if (d.justCompleted) {
      if (d.justCompleted.levelInfo) App().applyLevelInfo(d.justCompleted.levelInfo, d.justCompleted.leveledUp);
      App().toast(`ครบแผนฝึกวันนี้! ${d.justCompleted.exp ? `+${d.justCompleted.exp} EXP · ` : ''}ต่อเนื่อง ${d.streak.current} วัน`, 'success');
    }
  }

  function startTask(t) {
    const m = MODULE[t.part] && MODULE[t.part]();
    if (!m || !m.drill) { App().toast('ยังเปิด Part นี้ไม่ได้', 'error'); return; }
    m.drill(t.part, { ...t.body, dailyTask: t.k });
  }
  function resumeTask(t) {
    if (!t.sessionId) { startTask(t); return; }
    location.hash = `#/toeic-p${t.part}-play/${t.sessionId}`;
  }
  async function goNext() {
    let d;
    try { d = await App().api('/toeic/daily'); } catch (err) { App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'); return; }
    last = d;
    const t = d.next == null ? null : d.tasks.find((x) => x.k === d.next);
    if (!t) { App().navigateTo('toeic'); return; }        // ครบแล้ว → Hub (การ์ดแสดงผล + toast)
    if (t.state === 'active') resumeTask(t); else startTask(t);
  }

  /** ปุ่มในหน้าผลของแต่ละ Part เมื่อเป็นงานในแผนวันนี้ */
  function resultButtons() {
    return `<button class="btn btn-primary" type="button" data-tqd-next>${ICON('chevron-right', 'icon icon-sm')} ไปงานถัดไปในแผนวันนี้</button>
      <button class="btn btn-secondary" type="button" data-tqd-back>${ICON('calendar', 'icon icon-sm')} กลับแผนวันนี้</button>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    if (t.closest('[data-tqd-back]')) { App().navigateTo('toeic'); return; }
    if (t.closest('[data-tqd-next]')) { goNext(); return; }
    let b = t.closest('[data-tqd-start]');
    if (b && last) { const x = last.tasks.find((y) => y.k === Number(b.dataset.tqdStart)); if (x) startTask(x); return; }
    b = t.closest('[data-tqd-resume]');
    if (b && last) { const x = last.tasks.find((y) => y.k === Number(b.dataset.tqdResume)); if (x) resumeTask(x); }
  });

  window.EQToeicDaily = { mount, resultButtons, _last: () => last };
})();
