/* =====================================================================
   TOEIC — วิเคราะห์จุดอ่อน (รวม Part 1–7) — window.EQToeicWeak
     #/toeic-weak   แผนฝึกแนะนำ 3 อันดับ · กับดักที่พลาดบ่อย · กลุ่มที่ยังไม่เคยฝึก · รายละเอียดราย Part
   ปุ่ม "ฝึกจุดนี้" = Practice ปกติของ Part นั้นที่กรองเฉพาะกลุ่มทักษะ (เรียก module.drill ของแต่ละ Part)
   ข้อมูลมาจาก /api/toeic/weakness ของผู้ใช้ที่ล็อกอินเท่านั้น · ทุกข้อความผ่าน esc()
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-toeicweak-root');
  const MODULE = { 1: () => window.EQToeic, 2: () => window.EQToeic2, 3: () => window.EQToeic34, 4: () => window.EQToeic34, 5: () => window.EQToeic5, 6: () => window.EQToeic6, 7: () => window.EQToeic7 };
  const SIZE = { 1: 10, 2: 10, 3: 3, 4: 3, 5: 10, 6: 2, 7: 3 };
  const SIZE_TH = { 1: '10 ข้อ', 2: '10 ข้อ', 3: '3 ชุด · 9 ข้อ', 4: '3 ชุด · 9 ข้อ', 5: '10 ข้อ', 6: '2 บทความ · 8 ข้อ', 7: '3 ชุด' };
  const STATUS = { weak: 'ต้องฝึก', fair: 'พอใช้', strong: 'ดี', few: 'ข้อมูลยังน้อย', untried: 'ยังไม่เคยฝึก' };
  let range = 'all';
  let last = null;   // ผลล่าสุด (ใช้ตอนกดปุ่มฝึก)

  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังวิเคราะห์…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const pct = (x) => (x == null ? '–' : `${x}%`);
  const chip = (st) => `<span class="tqw-chip is-${esc(st)}">${esc(STATUS[st] || st)}</span>`;
  const drillBtn = (part, group, label, cls = 'btn btn-primary') => `<button class="${cls} tqw-go" type="button" data-tqw-drill="${part}" data-group="${esc(group)}">${ICON('target', 'icon icon-sm')} ${label}</button>`;
  const trendTh = (t) => (t === 'up' ? 'ช่วงหลังดีขึ้น' : t === 'down' ? 'ช่วงหลังพลาดมากขึ้น' : t === 'flat' ? 'ช่วงหลังใกล้เคียงเดิม' : '');

  async function open() {
    setHash('#/toeic-weak'); App().showScreen('screen-toeicweak');
    const el = root();
    loading(el);
    let d;
    try { d = await App().api(`/toeic/weakness${range === '30' ? '?range=30' : ''}`); } catch (err) { errorBox(el, err, open); return; }
    last = d;
    const seg = (v, label) => `<button type="button" class="tqw-seg${range === v ? ' is-on' : ''}" aria-pressed="${range === v}" data-tqw-range="${v}">${label}</button>`;
    const head = `
      <button class="game-exit gl-back" type="button" data-tqw-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
      <header class="tq-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} TOEIC-style Practice</p>
        <h1 class="page-title" id="tqw-title">วิเคราะห์จุดอ่อน</h1>
        <p class="gl-sub">รวมคำตอบจากทุก Part แล้วจัดกลุ่มตามทักษะ บอกว่าควรฝึกอะไรก่อน และกดฝึกเฉพาะจุดนั้นได้ทันที</p></header>
      <div class="tqw-range" role="group" aria-label="ช่วงเวลา">${seg('all', 'ทั้งหมด')}${seg('30', '30 วันล่าสุด')}</div>`;

    if (!d.answered) {
      el.innerHTML = `${head}
        <div class="gl-card tqw-empty">${ICON('chart-column', 'icon icon-lg')}
          <p><b>${range === '30' ? 'ยังไม่มีคำตอบใน 30 วันล่าสุด' : 'ยังไม่มีข้อมูลให้วิเคราะห์'}</b><br>ลองทำ Practice หรือ Mock สักชุด แล้วกลับมาดูหน้านี้อีกครั้ง — ยิ่งตอบมาก ผลยิ่งแม่น</p>
          <div class="gl-actions"><button class="btn btn-primary" type="button" data-tqw-nav="toeic-full">${ICON('list-checks', 'icon icon-sm')} Full Mock Test</button>
            <button class="btn btn-secondary" type="button" data-tqw-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} เลือก Part เอง</button></div></div>
        ${d.untried.length ? untriedBlock(d) : ''}${note()}`;
      focusTitle('tqw-title');
      return;
    }

    const sec = (label, icon, x) => `<div class="tqw-stat"><span>${ICON(icon, 'icon icon-sm')} ${label}</span><b>${pct(x.accuracy)}</b><small>${x.answered} ข้อ</small></div>`;
    const planCard = (g, i) => `
      <li class="tqw-plan-item is-${esc(g.status)}"><span class="tqw-rank" aria-hidden="true">${i + 1}</span>
        <div class="tqw-plan-body">
          <p class="tqw-plan-part">${esc(g.partName)}</p>
          <h3 class="tqw-plan-name">${esc(g.th)}</h3>
          <p class="tqw-plan-meta">${chip(g.status)} ถูก ${pct(g.accuracy)} จาก ${g.answered} ข้อ</p>
          ${g.tip ? `<p class="tqw-tip">${ICON('lightbulb', 'icon icon-sm')} ${esc(g.tip)}</p>` : ''}
          ${drillBtn(g.part, g.id, `ฝึกจุดนี้ · ${SIZE_TH[g.part]}`)}
        </div></li>`;
    const plan = d.plan.length
      ? `<section class="tq-section" aria-labelledby="tqw-plan"><h2 class="tq-h2" id="tqw-plan">${ICON('target', 'icon icon-sm')} ควรฝึกก่อน</h2>
          <ol class="tqw-plan">${d.plan.map(planCard).join('')}</ol></section>`
      : `<div class="gl-card tqw-ok">${ICON('circle-check', 'icon icon-lg')}<p><b>ยังไม่พบจุดอ่อนชัดเจน</b><br>กลุ่มที่ตอบไปแล้วอยู่ในระดับดี หรือยังตอบน้อยเกินไป (ต้องอย่างน้อย ${d.minAnswers} ข้อต่อกลุ่ม) · ลองฝึกกลุ่มที่ยังไม่เคยทำด้านล่าง</p></div>`;
    const traps = d.traps.length ? `<section class="gl-card tqw-traps" aria-labelledby="tqw-trap"><h2 class="tq-h2" id="tqw-trap">${ICON('triangle-alert', 'icon icon-sm')} ตัวเลือกหลอกที่พลาดบ่อย (Listening)</h2>
        <ul>${d.traps.map((t) => `<li><span>Part ${t.part} · ${esc(t.th)}</span><b>${t.count} ครั้ง</b></li>`).join('')}</ul></section>` : '';
    const partBlock = (p) => {
      const hasWeak = p.groups.some((g) => g.status === 'weak');
      const row = (g) => `<li class="tqw-row is-${esc(g.status)}">
          <span class="tqw-row-name">${esc(g.th)}</span>
          <span class="tqw-row-pct">${pct(g.accuracy)}</span>
          <span class="gl-bar tq-bar tqw-bar" aria-hidden="true"><span style="width:${g.accuracy || 0}%"></span></span>
          <span class="tqw-row-sub">${chip(g.status)}${g.answered ? ` ${g.answered} ข้อ` : ''}${g.trend ? ` · ${trendTh(g.trend)}` : ''}</span>
          ${g.drill ? `<button class="tqw-mini" type="button" data-tqw-drill="${p.part}" data-group="${esc(g.id)}" aria-label="ฝึก ${esc(g.th)} (${esc(p.name)})">${ICON('play', 'icon icon-sm')} ฝึก</button>` : ''}
        </li>`;
      return `<details class="gl-card tqw-part"${hasWeak ? ' open' : ''}><summary><span class="tq-part-no">${p.part}</span>
          <span class="tqw-part-title"><b>${esc(p.name)}</b><small>${p.answered ? `ถูก ${pct(p.accuracy)} · ${p.answered} ข้อ` : 'ยังไม่ได้ทำ'}${p.mistakes ? ` · ข้อที่ยังผิด ${p.mistakes}` : ''}</small></span>
          ${ICON('chevron-down', 'icon icon-sm tqw-caret')}</summary>
        <ul class="tqw-rows">${p.groups.map(row).join('')}</ul>
        ${p.mistakes ? `<button class="tq-link sp-link" type="button" data-tqw-nav="toeic-p${p.part}-review">${ICON('rotate-ccw', 'icon icon-sm')} ทบทวนข้อที่ผิด Part ${p.part}</button>` : ''}
      </details>`;
    };
    el.innerHTML = `${head}
      <div class="tqw-stats">${sec('Listening', 'headphones', d.sections.L)}${sec('Reading', 'book-open', d.sections.R)}
        <div class="tqw-stat"><span>${ICON('circle-x', 'icon icon-sm')} ข้อที่ยังผิดอยู่</span><b>${d.mistakesTotal}</b><small>คำตอบล่าสุดของข้อนั้นผิด</small></div></div>
      ${plan}${traps}${d.untried.length ? untriedBlock(d) : ''}
      <section class="tq-section" aria-labelledby="tqw-all"><h2 class="tq-h2" id="tqw-all">${ICON('chart-column', 'icon icon-sm')} รายละเอียดราย Part</h2>
        ${d.parts.map(partBlock).join('')}</section>
      ${note()}`;
    focusTitle('tqw-title');
  }

  function untriedBlock(d) {
    return `<section class="gl-card tqw-untried" aria-labelledby="tqw-new"><h2 class="tq-h2" id="tqw-new">${ICON('sparkles', 'icon icon-sm')} ยังไม่เคยฝึก${d.untriedTotal > d.untried.length ? ` (แสดง ${d.untried.length} จาก ${d.untriedTotal})` : ''}</h2>
      <ul>${d.untried.map((g) => `<li><span><small>${esc(g.partName)}</small><b>${esc(g.th)}</b></span>${drillBtn(g.part, g.id, 'ลองฝึก', 'btn btn-secondary')}</li>`).join('')}</ul></section>`;
  }
  const note = () => `<p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} วิเคราะห์จากคำตอบของคุณเองใน Practice และ Mock ที่ส่งแล้ว · กลุ่มที่ตอบน้อยกว่า 3 ข้อยังไม่ตัดสิน · ลำดับ "ควรฝึกก่อน" ใช้ความแม่นยำที่ปรับตามจำนวนข้อ (ตอบน้อยข้อจะไม่ถูกมองว่าอ่อนเกินจริง) · ชุดฝึกเป็น Practice ปกติ ได้ EXP/Coin ตามกติกาเดิม</p>`;

  function drill(part, group) {
    const m = MODULE[part] && MODULE[part]();
    if (!m || !m.drill) { App().toast('ยังเปิด Part นี้ไม่ได้', 'error'); return; }
    m.drill(part, { size: SIZE[part], group, drill: true });
  }

  /** ปุ่มในหน้าผลของแต่ละ Part เมื่อเป็นชุดฝึกจุดอ่อน */
  function resultButtons(part, config) {
    const g = String((config && config.group) || '');
    return `<button class="btn btn-primary" type="button" data-tqw-again="${Number(part)}" data-group="${esc(g)}">${ICON('refresh-cw', 'icon icon-sm')} ฝึกจุดนี้อีกชุด</button>
      <button class="btn btn-secondary" type="button" data-tqw-back>${ICON('target', 'icon icon-sm')} กลับหน้าวิเคราะห์จุดอ่อน</button>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-tqw-back]');
    if (b) { setHash('#/toeic-weak'); open(); return; }
    b = t.closest('[data-tqw-again]');
    if (b) { drill(Number(b.dataset.tqwAgain), b.dataset.group); return; }
    if (!t.closest('#screen-toeicweak')) return;
    b = t.closest('[data-tqw-range]');
    if (b) { range = b.dataset.tqwRange === '30' ? '30' : 'all'; open(); return; }
    b = t.closest('[data-tqw-drill]');
    if (b) { drill(Number(b.dataset.tqwDrill), b.dataset.group); return; }
    b = t.closest('[data-tqw-nav]');
    if (b) App().navigateTo(b.dataset.tqwNav);
  });

  window.EQToeicWeak = { open, resultButtons, drill, _last: () => last };
})();
