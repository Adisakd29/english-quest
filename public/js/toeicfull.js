/* =====================================================================
   TOEIC-style Full Mock Test — window.EQToeicFull
     #/toeic-full        หน้ารวม: เริ่มชุดใหม่ · ความคืบหน้า 7 Part · ประวัติ
     #/toeic-full/ID     ผลคะแนนประมาณการ Listening / Reading ของชุดที่จบแล้ว
   แต่ละ Part ใช้ Mock เดิมของ Part นั้น — หน้านี้ส่ง fullTestId ไปตอนเริ่ม (ctx) แล้วกลับมาที่นี่ผ่านปุ่มในหน้าผลของ Part
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic/full${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-toeicfull-root');
  const MODULE = { 1: () => window.EQToeic, 2: () => window.EQToeic2, 3: () => window.EQToeic34, 4: () => window.EQToeic34, 5: () => window.EQToeic5, 6: () => window.EQToeic6, 7: () => window.EQToeic7 };
  const INFO = { 1: '6 ข้อ · ~3 นาที', 2: '25 ข้อ · ~9 นาที', 3: '18 ข้อ · ~8 นาที', 4: '15 ข้อ · ~7 นาที', 5: '30 ข้อ · 12 นาที', 6: '16 ข้อ · 10 นาที', 7: '~22 ข้อ · ~22 นาที' };
  let pending = null;   // { id, part } — Part ที่กำลังจะเริ่มจากหน้านี้

  function setHash(t) { if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); } catch (_) { return ''; } };

  async function openHub() {
    pending = null;
    setHash('#/toeic-full'); App().showScreen('screen-toeicfull');
    const el = root();
    loading(el);
    let d;
    try { d = await api(''); } catch (err) { errorBox(el, err, openHub); return; }
    const a = d.active;
    const partRow = (p) => {
      const cur = a && a.nextPart === p.part;
      const st = p.state === 'done' ? `<span class="tqf-chip is-done">${ICON('circle-check', 'icon icon-sm')} ${p.correct}/${p.total}</span>`
        : p.state === 'active' ? `<span class="tqf-chip is-active">${ICON('hourglass', 'icon icon-sm')} กำลังทำ ${p.answered}/${p.total}</span>` : '<span class="tqf-chip">ยังไม่เริ่ม</span>';
      const btn = !a ? '' : p.state === 'done' ? `<button class="btn btn-secondary tqf-go" type="button" data-tqf-view="${p.nav}-play/${p.sessionId}">${ICON('eye', 'icon icon-sm')} ดูผล Part</button>`
        : p.state === 'active' ? `<button class="btn btn-primary tqf-go" type="button" data-tqf-view="${p.nav}-play/${p.sessionId}">${ICON('play', 'icon icon-sm')} ทำต่อ</button>`
        : `<button class="btn ${cur ? 'btn-primary' : 'btn-secondary'} tqf-go" type="button" data-tqf-start="${p.part}">${ICON('play', 'icon icon-sm')} เริ่ม Part ${p.part}</button>`;
      return `<li class="tqf-part${cur ? ' is-next' : ''}${p.state === 'done' ? ' is-done' : ''}"><span class="tq-part-no">${p.part}</span>
        <span class="tqf-part-text"><b lang="en">${esc(p.title)}</b><small>${esc(p.th)} · ${INFO[p.part]}</small>${st}</span>${btn}</li>`;
    };
    const parts = a ? a.parts : d.parts.map((p) => ({ ...p, state: 'todo' }));
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tqf-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
      <header class="tq-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} TOEIC-style Practice</p>
        <h1 class="page-title" id="tqf-title">Full Mock Test</h1>
        <p class="gl-sub">ทำ Mock ครบทั้ง 7 Part (Listening 1–4 + Reading 5–7 · ~132 ข้อ · ~70 นาที) แล้วดู<b>คะแนนประมาณการ</b> Listening / Reading (5–495) · ทำต่อเนื่องหรือพักระหว่าง Part ได้</p></header>
      ${a ? `<div class="tqf-progress"><div class="gl-bar tq-bar" aria-hidden="true"><span style="width:${(a.done / 7) * 100}%"></span></div><b>${a.done}/7 Part</b><small>เริ่ม ${fmtDate(a.startedAt)}</small></div>` : ''}
      <section class="tq-section" aria-labelledby="tqf-l"><h2 class="tq-h2" id="tqf-l">${ICON('headphones', 'icon icon-sm')} Listening</h2>
        <ul class="tqf-parts">${parts.filter((p) => p.section === 'listening').map(partRow).join('')}</ul></section>
      <section class="tq-section" aria-labelledby="tqf-r"><h2 class="tq-h2" id="tqf-r">${ICON('book-open', 'icon icon-sm')} Reading</h2>
        <ul class="tqf-parts">${parts.filter((p) => p.section === 'reading').map(partRow).join('')}</ul></section>
      <div class="gl-actions">
        ${!a ? `<button class="btn btn-primary" type="button" data-tqf-new>${ICON('play', 'icon icon-sm')} เริ่ม Full Mock Test</button>`
          : `${a.done === 7 ? `<button class="btn btn-primary" type="button" data-tqf-finish="${a.id}">${ICON('flag', 'icon icon-sm')} ดูคะแนนประมาณการ</button>` : ''}
             <button class="btn btn-secondary" type="button" data-tqf-abandon="${a.id}">${ICON('rotate-ccw', 'icon icon-sm')} ยกเลิกแล้วเริ่มใหม่</button>`}
      </div>
      ${a ? '<p class="gl-note tqf-note">แนะนำให้ทำตามลำดับ Part 1 → 7 · ถ้าเริ่ม Mock ของ Part เดียวกันจากหน้า Part โดยตรง ชุดที่ค้างใน Full Mock จะถูกยกเลิก (กลับมาเริ่ม Part นั้นใหม่ได้)</p>' : ''}
      ${d.history.length ? `<section class="gl-card tqf-hist" aria-labelledby="tqf-h"><h2 class="tq-h2" id="tqf-h">${ICON('history', 'icon icon-sm')} ผลที่ผ่านมา</h2>
        <ul>${d.history.map((h) => `<li><button class="tqf-hrow" type="button" data-tqf-result="${h.id}"><span>${fmtDate(h.finishedAt)}</span>
          <span>L <b>${h.listening}</b> · R <b>${h.reading}</b></span><b class="tqf-htotal">${h.total}</b>${ICON('chevron-right', 'icon icon-sm')}</button></li>`).join('')}</ul></section>` : ''}
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} คะแนนเป็นการประมาณจากข้อสอบฝึกของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ · TOEIC® เป็นเครื่องหมายการค้าของ ETS</p>`;
    focusTitle('tqf-title');
  }

  async function openResult(id, award) {
    setHash(`#/toeic-full/${id}`); App().showScreen('screen-toeicfull');
    const el = root();
    loading(el);
    let t;
    try { t = award && award.result ? award : await api(`/${id}`); } catch (err) { errorBox(el, err, () => openResult(id)); return; }
    if (!t.result) { openHub(); return; }
    const r = t.result;
    const box = (label, icon, x) => `<div class="tqf-score"><span>${ICON(icon, 'icon icon-sm')} ${label}</span><b>${x.score}</b>
      <small>ช่วงประมาณ ${x.low}–${x.high} · ถูก ${x.correct}/${x.total} (${x.accuracy}%) · CEFR ~${esc(x.cefr)}</small></div>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tqf-nav="toeic-full">${ICON('arrow-left', 'icon icon-sm')} Full Mock Test</button>
      <header class="tq-res-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} Full Mock Test · ${fmtDate(t.finishedAt)}</p>
        <h1 class="page-title" id="tqf-res-title">Estimated Score</h1>
        <div class="tq-score tqf-total"><b>${r.total}</b><span>/ 990</span></div>
        <p class="tq-score-label">ช่วงประมาณ ${r.totalLow}–${r.totalHigh} · ${r.questions} ข้อ</p>
        ${award && award.exp ? `<p class="tq-res-exp">+${award.exp} EXP · จบ Full Mock Test</p>` : ''}</header>
      <div class="tqf-scores">${box('Listening', 'headphones', r.listening)}${box('Reading', 'book-open', r.reading)}</div>
      <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} ความแม่นยำราย Part</h2>
        <ul class="tq-skills">${r.parts.map((p) => `<li class="tq-skill"><span class="tq-skill-name">Part ${p.part} · ${esc(p.th)}</span>
          <span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${p.accuracy}%"></span></span><b>${p.correct}/${p.total}</b><small>${p.accuracy}%</small></li>`).join('')}</ul></section>
      ${r.weakest ? `<p class="tq-sw">${ICON('target', 'icon icon-sm')} ควรฝึกเพิ่ม: <b>Part ${r.weakest.part} · ${esc(r.weakest.th)}</b> (${r.weakest.accuracy}%)
        <button class="tq-link sp-link" type="button" data-tqf-nav="toeic-p${r.weakest.part}">ไปฝึก Part ${r.weakest.part} ${ICON('chevron-right', 'icon icon-sm')}</button>
        <button class="tq-link sp-link" type="button" data-tqf-nav="toeic-weak">ดูจุดอ่อนรายทักษะ ${ICON('chevron-right', 'icon icon-sm')}</button></p>` : ''}
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-tqf-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <button class="btn btn-primary" type="button" data-tqf-new>${ICON('refresh-cw', 'icon icon-sm')} ทำ Full Mock Test ใหม่</button></div>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(r.note)} · ช่วงประมาณคำนวณจากจำนวนข้อ (ข้อยิ่งน้อย ช่วงยิ่งกว้าง) · CEFR เทียบจากคะแนนประมาณการตามตารางเทียบที่ ETS เผยแพร่ ใช้เป็นแนวทางเท่านั้น</p>`;
    focusTitle('tqf-res-title');
  }

  async function startPart(part) {
    let d;
    try { d = await api(''); } catch (err) { App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'); return; }
    if (!d.active) { App().toast('ยังไม่ได้เริ่ม Full Mock Test', 'error'); return; }
    const m = MODULE[part] && MODULE[part]();
    if (!m || !m.mock) { App().toast('ยังเปิด Part นี้ไม่ได้', 'error'); return; }
    pending = { id: d.active.id, part };
    m.mock(part);
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-tqf-back]');
    if (b) { setHash('#/toeic-full'); App().navigateTo('toeic-full'); return; }
    if (!t.closest('#screen-toeicfull')) return;
    b = t.closest('[data-tqf-nav]');
    if (b) { if (b.dataset.tqfNav === 'toeic-full') openHub(); else App().navigateTo(b.dataset.tqfNav); return; }
    if (t.closest('[data-tqf-new]')) {
      try { await api('', { method: 'POST', body: {} }); openHub(); } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
      return;
    }
    b = t.closest('[data-tqf-start]');
    if (b) { startPart(Number(b.dataset.tqfStart)); return; }
    b = t.closest('[data-tqf-view]');
    if (b) { location.hash = `#/${b.dataset.tqfView}`; return; }
    b = t.closest('[data-tqf-finish]');
    if (b) {
      b.disabled = true;
      try { const r = await api(`/${b.dataset.tqfFinish}/finish`, { method: 'POST', body: {} }); if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp); openResult(r.id, r); } catch (err) { b.disabled = false; App().toast(err.message || 'ดูผลไม่สำเร็จ', 'error'); }
      return;
    }
    b = t.closest('[data-tqf-abandon]');
    if (b) {
      if (!confirm('ยกเลิก Full Mock Test ชุดนี้? คะแนนของแต่ละ Part ที่ทำแล้วยังอยู่ในสถิติของ Part นั้น')) return;
      try { await api(`/${b.dataset.tqfAbandon}/abandon`, { method: 'POST', body: {} }); await api('', { method: 'POST', body: {} }); openHub(); } catch (err) { App().toast(err.message || 'ไม่สำเร็จ', 'error'); }
      return;
    }
    b = t.closest('[data-tqf-result]');
    if (b) openResult(b.dataset.tqfResult);
  });

  window.EQToeicFull = {
    open: (param) => (param ? openResult(param) : openHub()),
    /** โมดูลแต่ละ Part เรียกตอนเริ่ม Mock: ถ้าเริ่มมาจากหน้านี้ ส่ง fullTestId ไปด้วย (ใช้ครั้งเดียว) */
    ctx: (part) => { if (pending && pending.part === part) { const id = pending.id; pending = null; return { fullTestId: id }; } return {}; },
    _pending: () => pending,
  };
})();
