/* =====================================================================
   TOEIC-style Listening Part 3 (Conversations) / Part 4 (Talks) — window.EQToeic34  (โค้ดชุดเดียว · part = 3 | 4)
   หน้าจอ:
     #/toeic-p3 · #/toeic-p4                 Landing · Practice / Mock · Analytics
     #/toeic-p3-play/ID · #/toeic-p4-play/ID  ฟังบทสนทนา/การพูด แล้วตอบ 3 ข้อ (คำถาม ตัวเลือก กราฟิกแสดงบนจอ)
     #/toeic-p3-review · #/toeic-p4-review   Error Notebook
   Practice: ฟังซ้ำได้ · เฉลยรายข้อ · ครบ 3 ข้อเห็นบทพูด + คำแปลรายช่วง + ไฮไลต์หลักฐาน + ไฮไลต์ช่วงที่กำลังเล่น
   Mock: อ่านคำถามล่วงหน้า 8 วิ → เสียงเล่นครั้งเดียว → 8 วิ/ข้อ → ชุดถัดไปเอง · ย้อนชุดที่ผ่านแล้วไม่ได้
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C', 'D'];
  const root = (id) => document.getElementById(`${id}-root`);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* - */ } } };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* - */ } } };
  let part = 3;
  const api = (p, o) => App().api(`/toeic/p${part}${p}`, o);
  const metas = {};
  const getMeta = async () => metas[part] || (metas[part] = await api('/meta'));
  const NAME = { 3: { title: 'Conversations', kicker: 'Listening · Part 3', short: 'Part 3: Conversations', unit: 'บทสนทนา' },
    4: { title: 'Talks', kicker: 'Listening · Part 4', short: 'Part 4: Talks', unit: 'การพูด' } };
  function setHash(path, param) { const t = `#/${path}${param ? `/${param}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} วิ` : '—');

  /* ---------- เสียง ---------- */
  const blobs = new Map();
  function loadAudio(url) {
    if (!blobs.has(url)) {
      const p = fetch(url, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
        .then((b) => { if (!b.size) throw new Error('empty'); return URL.createObjectURL(b); });
      p.catch(() => blobs.delete(url));
      blobs.set(url, p);
      if (blobs.size > 3) { const [k, v] = blobs.entries().next().value; blobs.delete(k); v.then((u) => URL.revokeObjectURL(u)).catch(() => {}); }
    }
    return blobs.get(url);
  }
  let player = null;
  function audioEl() { if (!player) { player = new Audio(); player.preload = 'auto'; const v = Number(ls.get('eq_tq_vol')); player.volume = Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1; } return player; }
  function stopAudio() { if (player) { player.pause(); player.onended = null; player.ontimeupdate = null; } }
  function unlockAudio() { const a = audioEl(); try { a.muted = true; const p = a.play(); if (p && p.catch) p.catch(() => {}); a.pause(); a.muted = false; } catch (_) { a.muted = false; } }
  let tick = null;
  function stopAll() { stopAudio(); if (tick) { clearInterval(tick); tick = null; } }

  function audioCheck(next) {
    if (ss.get('eq_tq_checked') === '1') { unlockAudio(); next(); return; }
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('headphones', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">Audio Check</h2><p class="gl-sub">แนะนำให้ใช้หูฟัง · กดเล่นเสียงทดสอบแล้วปรับระดับเสียงให้ได้ยินชัด</p>
        <button class="btn btn-secondary tq-check-play" type="button" data-play>${ICON('play', 'icon icon-sm')} Play Test Sound</button>
        <p class="tq-check-err" role="alert" hidden></p>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-ok>${ICON('check', 'icon icon-sm')} ได้ยินชัดเจน</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Audio Check', variant: 'center', onClose: stopAudio });
      ov.addEventListener('click', async (e) => {
        if (e.target.closest('[data-play]')) { try { const a = audioEl(); stopAudio(); a.src = await loadAudio(m.audioCheckUrl); a.playbackRate = 1; await a.play(); } catch (_) { const er = ov.querySelector('.tq-check-err'); er.hidden = false; er.textContent = 'ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่'; } return; }
        if (e.target.closest('[data-close]')) { stopAudio(); ov.remove(); return; }
        if (e.target.closest('[data-ok]')) { stopAudio(); ss.set('eq_tq_checked', '1'); ov.remove(); next(); }
      });
    });
  }

  /** ตารางกราฟิก (| a | b |) */
  function graphicHtml(g) {
    if (!g) return '';
    const rows = String(g.table).split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
      .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    return `<figure class="gl-card t34-graphic"><figcaption>${ICON('chart-column', 'icon icon-sm')} <b lang="en">${esc(g.title)}</b></figcaption>
      <div class="t7-tablewrap"><table class="t7-table" lang="en"><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></figure>`;
  }
  function marker(html, quotes) {
    let out = html;
    quotes.forEach((q) => {
      const pat = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      try { out = out.replace(new RegExp(pat, 'i'), (m) => `<mark class="t7-ev">${m}</mark>`); } catch (_) { /* - */ }
    });
    return out;
  }

  /* =====================================================================
     LANDING
     ===================================================================== */
  async function openLanding() {
    stopAll();
    setHash(`toeic-p${part}`); App().showScreen('screen-toeic34');
    const el = root('screen-toeic34');
    loading(el);
    const range = ls.get(`eq_t${part}_range`) || 'all';
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/summary?range=${range}`)]);
      const N = NAME[part];
      const resume = s.activeSessions.map((a) => `<button class="tq-resume" type="button" data-t34-resume="${a.id}">${ICON('play', 'icon icon-sm')} ทำ${a.mode === 'mock' ? ' Mock Test' : 'ชุดฝึก'}ต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (label, g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g ? g.accuracy : 0}%"></span></span><b>${g ? `${g.accuracy}%` : '—'}</b><small>${g ? `${g.total} ข้อ` : 'ยังไม่มีข้อมูล'}</small></li>`;
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t34-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} ${N.kicker}</p>
          <h1 class="page-title" id="t34-title">${N.title}</h1>
          <p class="gl-sub">${part === 3 ? 'ฟังบทสนทนาในที่ทำงาน 2–3 คน แล้วตอบคำถาม 3 ข้อ' : 'ฟังประกาศ ข้อความเสียง โฆษณา ข่าว การนำชม แล้วตอบคำถาม 3 ข้อ'} — คำถามและตัวเลือกแสดงบนจอ อ่านล่วงหน้าได้ · ${s.bankSize} ชุด (${s.bankQuestions} ข้อ) · มีกราฟิกประกอบ ${m.graphicSets} ชุด${part === 3 ? ` · บทสนทนา 3 คน ${m.threeSpeakerSets} ชุด` : ''}</p></header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-t34-act="practice">${ICON('graduation-cap', 'icon')}<b>Practice</b><small>ฟังซ้ำได้ · 0.9x/1.0x · เฉลยรายข้อ · ครบชุดเห็นบทพูด คำแปล และไฮไลต์ประโยคที่เป็นคำตอบ</small></button>
          <button class="tq-mode" type="button" data-t34-act="mock">${ICON('timer', 'icon')}<b>Mock Test</b><small>${m.mockSets} ชุด (${m.mockSets * 3} ข้อ) ต่อเนื่อง · อ่านคำถามล่วงหน้า ${m.previewSec} วิ · เสียงเล่นครั้งเดียว · ${m.answerSecPerQuestion} วิ/ข้อหลังเสียงจบ</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.setsPracticed}<small>/${s.bankSize}</small></b><span>ชุดที่ฝึก</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestMock ? `${s.bestMock.percent}%` : '—'}</b><span>Best Mock Score</span></div>
          <div class="tq-stat" role="listitem"><b class="tq-stat-text">${s.weakSkill ? esc(s.weakSkill.th.replace(/\s*\(.*\)/, '')) : '—'}</b><span>Weak Skill</span></div>
        </div>
        <div class="tq-links"><button class="tq-link" type="button" data-t34-nav="toeic-p${part}-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
          <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ข้อที่ยังตอบผิด · ฟังซ้ำพร้อมบทพูด` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button></div>
        <section class="gl-card tq-analytics" aria-labelledby="t34-an-title">
          <div class="tq-an-head"><h2 class="tq-h2" id="t34-an-title">${ICON('chart-column', 'icon icon-sm')} วิเคราะห์ผล Listening</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-t34-range="${v}">${t}</button>`).join('')}</div></div>
          ${s.answered ? `<p class="tq-an-sum">Part ${part} Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ</p><ul class="tq-skills">${s.skills.map((g) => bar(g.th, g)).join('')}</ul>
            <p class="tq-an-sub">สำเนียง: อเมริกัน ${s.accents.us ? `${s.accents.us.accuracy}%` : '—'} · อังกฤษ ${s.accents.uk ? `${s.accents.uk.accuracy}%` : '—'}</p>`
            : '<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test</p>'}
        </section>
        <section class="gl-card t5-howto" aria-labelledby="t34-how-title"><h2 class="tq-h2" id="t34-how-title">${ICON('lightbulb', 'icon icon-sm')} วิธีทำ Part ${part}</h2>
          <ol><li><b>อ่านคำถามก่อนเสียงเริ่ม</b> — รู้ว่าต้องฟังหาอะไร (ใคร ที่ไหน ทำไม จะทำอะไรต่อ)</li>
            <li>คำตอบมักมาตามลำดับ: ข้อแรกอยู่ช่วงต้น ข้อสุดท้ายอยู่ช่วงท้าย</li>
            <li>คำตอบที่ถูกมักเป็น "คำพูดอื่นที่ความหมายเดียวกัน" — ตัวเลือกที่มีคำเดียวกับที่ได้ยินเป๊ะ ๆ อาจเป็นกับดัก</li>
            <li>${part === 3 ? 'ถาม "the man / the woman" → ฟังเฉพาะสิ่งที่คนนั้นพูด' : 'ฟังประโยคแรกให้ดี — มักบอกว่าเป็นการพูดแบบไหน ใครพูดกับใคร'} · ข้อกราฟิก: ดูตารางก่อน แล้วฟังหาข้อมูลที่ "ไม่อยู่ในคำตอบ"</li></ol></section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;
      focusTitle('t34-title');
    } catch (err) { errorBox(el, err, openLanding); }
  }

  function practiceSetup(source = 'bank') {
    getMeta().then((m) => {
      const saved = (() => { try { return JSON.parse(ls.get(`eq_t${part}_cfg`) || '{}'); } catch (_) { return {}; } })();
      const cfg = { size: 3, difficulty: 'mixed', focus: 'mixed', ...saved };
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
      const focuses = [['mixed', 'ผสมทุกแบบ'], ['graphic', 'มีกราฟิกประกอบ'], ...(part === 3 ? [['three', 'บทสนทนา 3 คน']] : Object.entries(m.talkTypeTh || {}))];
      ov.innerHTML = `<div class="modal-card tq-setup" role="document">
        <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกชุดที่เคยผิด' : `ตั้งค่า Part ${part} Practice`}</h2>
        ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกชุดที่ยังมีข้อตอบผิด · ลำดับตัวเลือกสลับใหม่</p>' : `
          <label class="tq-setup-label" for="t34-focus">ประเภท</label>
          <select id="t34-focus" class="tq-select">${focuses.map(([v, t]) => `<option value="${v}" ${v === cfg.focus ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], cfg.difficulty)}`}
        <p class="tq-setup-label">จำนวนชุด (ชุดละ 3 ข้อ)</p>${seg('size', m.sizes.map((n) => [n, `${n} ชุด`]), cfg.size)}
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button><button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: `ตั้งค่าการฝึก Part ${part}`, variant: 'sheet' });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cfg]');
        if (b) { cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v; b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); }); return; }
        if (e.target.closest('[data-close]')) { ov.remove(); return; }
        if (e.target.closest('[data-go]')) {
          const f = ov.querySelector('#t34-focus'); if (f) cfg.focus = f.value;
          if (source !== 'mistakes') ls.set(`eq_t${part}_cfg`, JSON.stringify(cfg));
          ov.remove(); audioCheck(() => start('practice', { ...cfg, source }));
        }
      });
    }).catch((err) => App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'));
  }
  function mockIntro() {
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">TOEIC Part ${part} — Mock Test</h2>
        <ul class="tq-rules"><li>${m.mockSets} ${NAME[part].unit} (${m.mockSets * 3} ข้อ) ต่อเนื่อง · ข้อสอบจริงมี ${part === 3 ? '13' : '10'} ชุด</li>
          <li>แต่ละชุด: อ่านคำถาม ${m.previewSec} วินาที → เสียงเล่น <b>ครั้งเดียว</b> → มีเวลา ${m.answerSecPerQuestion} วินาทีต่อข้อ แล้วไปชุดถัดไปเอง</li>
          <li>ตอบระหว่างฟังได้ · เปลี่ยนคำตอบได้จนกว่าจะไปชุดถัดไป · ไม่ตอบ = ผิด · ออกกลางคันแล้วกลับมาจะเริ่มที่ชุดถัดไป</li></ul>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button><button class="btn btn-primary" type="button" data-go>${ICON('headphones', 'icon icon-sm')} Start Listening Test</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: `Mock Test Part ${part}`, variant: 'center' });
      ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); audioCheck(() => { unlockAudio(); start('mock'); }); } });
    });
  }
  async function start(mode, cfg = {}) {
    try { const s = await api('/sessions', { method: 'POST', body: { mode, ...cfg, ...(mode === 'mock' && window.EQToeicFull ? window.EQToeicFull.ctx(part) : {}) } }); openPlay(s.id, s); } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER
     ===================================================================== */
  let S = null;   // { s, i, mock, sel, fb, sfb, phase, played, auto }
  async function openPlay(sid, preload) {
    stopAll();
    setHash(`toeic-p${part}-play`, sid); App().showScreen('screen-toeic34-play');
    const el = root('screen-toeic34-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openLanding(); return; }
      const sel = {}; const fb = {}; const sfb = {};
      s.items.forEach((it) => { it.questions.forEach((q) => { if (q.selected) sel[q.id] = q.selected; if (q.feedback) fb[q.id] = q.feedback; }); if (it.feedback) sfb[it.pid] = it.feedback; });
      const mock = s.mode === 'mock';
      const first = mock ? Math.min(s.items.length, s.passed || 0) : s.items.findIndex((it) => it.questions.some((q) => !sel[q.id]));
      S = { s, mock, sel, fb, sfb, i: first < 0 ? s.items.length : first, auto: false };
      App().setLeaveGuard((path) => {
        if (!S || path.startsWith(`toeic-p${part}-play`)) return false;
        if (S.mock && !confirm('ออกจาก Mock Test ตอนนี้? กลับมาทำต่อได้ แต่จะเริ่มที่ชุดถัดไป')) return true;
        if (S.mock) api(`/sessions/${S.s.id}/advance`, { method: 'POST', body: { passed: S.i + 1 } }).catch(() => {});
        stopAll(); App().setLeaveGuard(null); S = null; return false;
      });
      if (S.i >= s.items.length) { finish(); return; }
      renderSet();
    } catch (err) { errorBox(el, err, () => openPlay(sid)); }
  }

  function questionHtml(it, q) {
    const fb = !S.mock && S.fb[q.id];
    const chosen = S.sel[q.id];
    return `<section class="gl-card t6-qcard t34-q" id="t34-q-${q.k}">
      <h3 class="t6-qh"><span class="t6-num">${it.start + q.k - 1}</span> <span class="t7-stem" lang="en">${esc(q.stem)}</span></h3>
      <div class="t5-opts is-sent" role="group" aria-label="ตัวเลือกข้อ ${it.start + q.k - 1}">
        ${q.options.map((o, k) => {
          const l = LETTERS[k]; let cls = '';
          if (fb) cls = l === fb.correctOption ? ' is-right' : l === fb.selected ? ' is-wrongpick' : '';
          else if (chosen === l) cls = ' is-chosen';
          return `<button class="t5-opt${cls}" type="button" data-t34-ans="${l}" data-t34-q="${esc(q.id)}" aria-pressed="${chosen === l}" ${fb || !S.played ? 'disabled' : ''}><span class="t5-l">${l}</span><span class="t5-o" lang="en">${esc(o)}</span></button>`;
        }).join('')}
      </div>${fb ? qFbHtml(fb) : ''}</section>`;
  }
  function qFbHtml(fb, review) {
    return `<div class="t6-bfb ${fb.isCorrect ? 'ok' : 'bad'}" ${review ? '' : 'role="status"'}>
      <p class="t6-bfb-head">${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon icon-sm')} <b>${fb.isCorrect ? 'ถูกต้อง' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b>
        · คำตอบ ${fb.correctOption}${fb.selected && !fb.isCorrect ? ` (คุณเลือก ${fb.selected})` : ''} <span class="tq-chip">${esc(fb.skill.th)}</span>${fb.exp ? ` <span class="tq-exp">+${fb.exp} EXP</span>` : ''}</p>
      <p>${esc(fb.why)}</p>
      ${fb.evidence.some((e) => !e.includes('|')) ? `<div class="t7-evq">${ICON('audio-lines', 'icon icon-sm')} <span>ได้ยินว่า: ${fb.evidence.filter((e) => !e.includes('|')).map((e) => `<q lang="en">${esc(e)}</q>`).join(' · ')}</span></div>` : ''}
      ${fb.evidence.some((e) => e.includes('|')) ? `<div class="t7-evq">${ICON('chart-column', 'icon icon-sm')} <span>ในกราฟิก: ${fb.evidence.filter((e) => e.includes('|')).map((e) => `<b lang="en">${esc(e.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()).join(' · '))}</b>`).join(' / ')}</span></div>` : ''}
      <details class="t6-notes"><summary>เหตุผลของทุกตัวเลือก</summary><ol class="tq-lines">${fb.options.map((o) => `<li class="tq-line ${o.isCorrect ? 'is-correct' : ''} ${fb.selected === o.letter && !o.isCorrect ? 'is-wrong' : ''}">
        <span class="tq-line-l">${o.letter}</span><div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(o.text)}</p><p class="tq-line-why">${esc(o.noteTH)}</p></div></li>`).join('')}</ol></details></div>`;
  }
  function transcriptHtml(sf, evidence) {
    return `<section class="tq-fb-sec"><h3>${ICON('message-square-text', 'icon icon-sm')} Transcript · คำแปล</h3>
      <ol class="t34-tr" lang="en">${sf.transcript.map((t) => `<li class="t34-turn${part === 4 ? ' is-talk' : ''}" data-seg="${t.k}">
        ${t.label ? `<span class="t34-who t34-${esc(t.speaker)}">${esc(t.label)}${sf.accents[t.speaker] ? ` <small>${esc(sf.accents[t.speaker].replace(' English', ''))}</small>` : ''}</span>` : ''}
        <p class="t34-en">${marker(esc(t.text), evidence)}</p><p class="t34-th" lang="th">${esc(t.th)}</p></li>`).join('')}</ol></section>`;
  }
  function setFbHtml(it, sf) {
    const ev = it.questions.flatMap((q) => (S && S.fb[q.id] ? S.fb[q.id].evidence : q.feedback ? q.feedback.evidence : q.evidence || []));
    const vocab = (sf.vocabulary || []).map((v) => `<li class="tq-vocab"><div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span>
        <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div><p class="tq-vocab-th">${esc(v.th)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-t34-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : ''}</li>`).join('');
    return `${transcriptHtml(sf, ev)}<section class="tq-fb-sec tq-tip"><h3>${ICON('headphones', 'icon icon-sm')} Listening Tip</h3><p>${esc(sf.tip)}</p></section>
      ${vocab ? `<section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>` : ''}`;
  }

  function renderSet() {
    stopAll();
    const el = root('screen-toeic34-play');
    const { s } = S; const it = s.items[S.i];
    const done = it.questions.every((q) => S.fb[q.id]);
    Object.assign(S, { phase: 'loading', played: !S.mock && it.questions.some((q) => S.sel[q.id]), startAt: null });
    el.innerHTML = `
      <div class="tq-play t34-play ${S.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-t34-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Listening · ${NAME[part].short}</b><small>${S.mock ? 'Mock Test' : 'Practice'}${it.talkTypeTh ? ` · ${esc(it.talkTypeTh)}` : it.speakers === 3 ? ' · 3 คน' : ''}</small></div>
          <span class="tq-qno" id="t34-qno">Questions ${it.start}–${it.start + 2}</span>
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.items.length}" aria-valuenow="${S.i}"><span style="width:${(S.i / s.items.length) * 100}%"></span></div>
        <section class="gl-card t2-stage">
          <p class="t2-instr" lang="en">Questions ${it.start}–${it.start + 2} refer to the following ${part === 3 ? `conversation${it.speakers === 3 ? ' with three speakers' : ''}` : (it.talkType === 'voicemail' ? 'telephone message' : it.talkType === 'advertisement' ? 'advertisement' : it.talkType === 'meeting' ? 'excerpt from a meeting' : it.talkType === 'tour' ? 'tour information' : it.talkType === 'broadcast' || it.talkType === 'news' ? 'broadcast' : it.talkType === 'introduction' ? 'introduction' : it.talkType === 'instructions' ? 'instructions' : it.talkType === 'speech' ? 'speech' : 'announcement')}${it.graphic ? ' and graphic' : ''}.</p>
          <div class="tq-audio" id="t34-audio">
            <div class="tq-audio-row">
              <button class="btn btn-primary tq-play-btn" type="button" data-t34-play disabled>${ICON('play', 'icon icon-sm')} <span>กำลังโหลดเสียง…</span></button>
              <div class="tq-eq" id="t34-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
              <span class="t2-now" id="t34-time" aria-hidden="true"></span>
              ${S.mock ? '' : `<span class="tq-audio-tools"><div class="vd-seg tq-speed" role="radiogroup" aria-label="ความเร็วเสียง">${['0.9', '1'].map((r) => `<button class="vd-seg-btn${(ls.get('eq_tq_rate') || '1') === r ? ' active' : ''}" type="button" role="radio" aria-checked="${(ls.get('eq_tq_rate') || '1') === r}" data-t34-rate="${r}">${r === '1' ? '1.0' : r}x</button>`).join('')}</div></span>`}
            </div>
            <p class="tq-status" id="t34-status" role="status" aria-live="polite"></p>
            ${S.mock ? '<div class="t2-gap" id="t34-gap" hidden><span></span></div>' : ''}
          </div>
        </section>
        ${graphicHtml(it.graphic)}
        <div class="t6-qs" id="t34-qs">${it.questions.map((q) => questionHtml(it, q)).join('')}</div>
        <div id="t34-sfb">${!S.mock && done && S.sfb[it.pid] ? setFbHtml(it, S.sfb[it.pid]) + nextBtn() : ''}</div>
        ${S.mock ? '<div class="gl-actions" id="t34-skip" hidden><button class="btn btn-primary" type="button" data-t34-skip>ชุดถัดไป ' + ICON('chevron-right', 'icon icon-sm') + '</button></div>' : ''}
      </div>`;
    focusTitle('t34-qno');
    prepare(it);
  }
  const nextBtn = () => `<div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-t34-next>${S.i + 1 >= S.s.items.length ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `ชุดถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
  async function prepare(it) {
    const mine = S;
    const status = document.getElementById('t34-status');
    try {
      const url = await loadAudio(it.audio.url);
      if (S !== mine || !document.getElementById('t34-audio')) return;
      S.audioUrl = url; S.phase = 'ready';
      const btn = document.querySelector('[data-t34-play]');
      if (S.mock) {
        if (S.auto) preview(); else { btn.disabled = false; btn.querySelector('span').textContent = 'Start'; status.textContent = 'แตะ Start — มีเวลาอ่านคำถามก่อนเสียงเริ่ม (เสียงเล่นได้ครั้งเดียว)'; }
      } else {
        btn.disabled = false; btn.querySelector('span').textContent = S.played ? 'Replay' : 'Play Audio';
        status.textContent = S.played ? '' : 'อ่านคำถามด้านล่างก่อน แล้วแตะ Play Audio';
      }
      const nx = S.s.items[S.i + 1]; if (nx) setTimeout(() => loadAudio(nx.audio.url).catch(() => {}), 600);
    } catch (err) {
      if (S !== mine) return;
      S.phase = 'error';
      document.getElementById('t34-audio').innerHTML = `<div class="tq-neterr" role="alert">${ICON('wifi-off', 'icon')}<p><b>ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่</b><br><small>${S.mock ? 'Mock Test หยุดไว้ชั่วคราว — ไม่หักคะแนนจากปัญหาการเชื่อมต่อ' : 'ไม่มีการนับว่าตอบผิด'}</small></p>
        <button class="btn btn-primary" type="button" data-t34-retry>${ICON('refresh-cw', 'icon icon-sm')} ลองใหม่</button></div>`;
    }
  }
  function countdown(sec, label, done) {
    const gap = document.getElementById('t34-gap'); const mine = S;
    let left = sec;
    gap.hidden = false; gap.querySelector('span').textContent = `${label} · ${left}`; gap.style.setProperty('--p', '100%');
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      if (S !== mine) { clearInterval(tick); tick = null; return; }
      left -= 1;
      gap.querySelector('span').textContent = left > 0 ? `${label} · ${left}` : '…';
      gap.style.setProperty('--p', `${(left / sec) * 100}%`);
      if (left <= 0) { clearInterval(tick); tick = null; done(); }
    }, 1000);
  }
  function preview() {
    const btn = document.querySelector('[data-t34-play]'); btn.hidden = true;
    document.getElementById('t34-status').textContent = 'อ่านคำถามและตัวเลือก — เสียงจะเริ่มเอง';
    S.phase = 'preview';
    countdown((S.s.config && S.s.config.previewSec) || 8, 'อ่านคำถาม', () => { document.getElementById('t34-gap').hidden = true; playAudio(); });
  }
  async function playAudio() {
    if (!S || !S.audioUrl) return;
    const it = S.s.items[S.i];
    const btn = document.querySelector('[data-t34-play]'); const status = document.getElementById('t34-status');
    const eq = document.getElementById('t34-eq'); const tm = document.getElementById('t34-time');
    const a = audioEl(); stopAudio();
    a.src = S.audioUrl; a.playbackRate = S.mock ? 1 : Number(ls.get('eq_tq_rate') || 1);
    try { await a.play(); } catch (e) { btn.hidden = false; btn.disabled = false; btn.querySelector('span').textContent = S.mock ? 'Start' : 'Play Audio'; status.textContent = 'แตะปุ่มเพื่อเริ่มเสียง'; return; }
    const mine = S;
    if (S.mock) btn.hidden = true; else { btn.disabled = true; btn.querySelector('span').textContent = 'กำลังเล่น…'; }
    S.phase = 'playing'; if (!S.played) { S.played = true; S.startAt = Date.now(); document.querySelectorAll('[data-t34-ans]').forEach((b) => { if (!S.fb[b.dataset.t34Q]) b.disabled = false; }); }
    eq.classList.add('is-on'); status.textContent = 'Listening…';
    a.ontimeupdate = () => {
      const d = a.duration || it.audio.duration; tm.textContent = `${Math.floor(a.currentTime)}/${Math.round(d)}s`;
      const sf = S && S.sfb[it.pid];
      if (sf) { const seg = sf.transcript.find((t) => a.currentTime >= t.start && a.currentTime <= t.end + 0.3); document.querySelectorAll('.t34-turn').forEach((li) => li.classList.toggle('is-now', Boolean(seg) && Number(li.dataset.seg) === seg.k)); }
    };
    a.onended = () => {
      eq.classList.remove('is-on'); tm.textContent = '';
      document.querySelectorAll('.t34-turn').forEach((li) => li.classList.remove('is-now'));
      if (S !== mine) return;
      S.phase = 'ended';
      if (S.mock) answerWindow();
      else { btn.disabled = false; btn.innerHTML = `${ICON('rotate-ccw', 'icon icon-sm')} <span>Replay</span>`; status.textContent = ''; }
    };
  }
  function answerWindow() {
    const it = S.s.items[S.i];
    document.getElementById('t34-status').textContent = 'เลือกคำตอบให้ครบ 3 ข้อ';
    document.getElementById('t34-skip').hidden = !it.questions.every((q) => S.sel[q.id]);
    countdown(((S.s.config && S.s.config.answerSecPerQuestion) || 8) * 3, 'เวลาตอบ', nextMock);
  }
  function nextMock() {
    if (!S || S.leaving) return;
    S.leaving = true; stopAll();
    const next = S.i + 1;
    api(`/sessions/${S.s.id}/advance`, { method: 'POST', body: { passed: next } }).catch(() => {});
    setTimeout(() => { if (!S) return; S.leaving = false; if (next >= S.s.items.length) { finish(); return; } S.i = next; S.auto = true; renderSet(); }, 150);
  }
  async function choose(qid, letter) {
    if (!S || !S.played) return;
    const it = S.s.items[S.i];
    const q = it.questions.find((x) => x.id === qid);
    if (!q || (!S.mock && (S.fb[q.id] || S.busy)) || (S.mock && S.sel[q.id] === letter)) return;
    const prev = S.sel[q.id];
    S.sel[q.id] = letter; S.busy = true;
    const box = document.getElementById(`t34-q-${q.k}`);
    box.querySelectorAll('[data-t34-ans]').forEach((b) => { const on = b.dataset.t34Ans === letter; b.classList.toggle('is-chosen', on); b.setAttribute('aria-pressed', String(on)); if (!S.mock) b.disabled = true; });
    try {
      const r = await api(`/sessions/${S.s.id}/answer`, { method: 'POST', body: { id: q.id, selected: letter, responseMs: S.startAt ? Date.now() - S.startAt : null } });
      S.busy = false;
      if (!S) return;
      if (S.mock) { const sk = document.getElementById('t34-skip'); if (sk && S.phase === 'ended') sk.hidden = !it.questions.every((x) => S.sel[x.id]); return; }
      S.fb[q.id] = { ...r.feedback, exp: r.exp };
      if (window.EQAudio) window.EQAudio.sfx(r.feedback.isCorrect ? 'correct' : 'wrong');
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      box.outerHTML = questionHtml(it, q);
      if (r.set) { S.sfb[it.pid] = r.set; document.getElementById('t34-sfb').innerHTML = setFbHtml(it, r.set) + nextBtn(); }
      const f = document.querySelector(`#t34-q-${q.k} .t6-bfb`); if (f) f.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
    } catch (err) {
      S.busy = false;
      if (!S) return;
      if (prev) S.sel[q.id] = prev; else delete S.sel[q.id];
      box.outerHTML = questionHtml(it, q);
      if (err && err.code === 'PASSED') return;
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }
  async function finish() {
    if (!S || S.finishing) return;
    S.finishing = true; stopAll();
    const el = root('screen-toeic34-play');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/sessions/${S.s.id}/finish`, { method: 'POST', body: {} });
      const s = S.s; App().setLeaveGuard(null); S = null;
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      showResult(r.result, s, r);
    } catch (err) { S.finishing = false; errorBox(el, err, finish); }
  }

  /* ---------- ผลลัพธ์ / ทบทวน ---------- */
  function reviewSet(rs, opts = {}) {
    const wrongN = rs.questions.filter((q) => (opts.notebook ? q.wrong : !q.isCorrect)).length;
    const ev = rs.questions.flatMap((q) => q.evidence || []);
    return `<li class="tq-rv ${wrongN ? 'bad' : 'ok'}" data-ok="${wrongN ? 0 : 1}"><details>
      <summary><span class="tq-rv-n">${rs.n ? `S${rs.n}` : ''}</span><span class="tq-rv-sum t5-rv-sum"><span class="t5-rv-s" lang="en">${esc(rs.questions[0].stem)}</span>
        <small>${esc(rs.talkTypeTh || (rs.speakers === 3 ? 'บทสนทนา 3 คน' : 'บทสนทนา'))} · ${opts.notebook ? `ยังผิด ${wrongN} ข้อ` : `ถูก ${3 - wrongN}/3`}</small></span></summary>
      <div class="tq-rv-body"><button class="btn btn-secondary tq-rv-play" type="button" data-t34-rvplay="${esc(rs.audio.url)}">${ICON('play', 'icon icon-sm')} ฟังเสียงอีกครั้ง</button>
        ${graphicHtml(rs.graphic)}
        ${rs.questions.map((q) => `<section class="t6-rvq"><h4 class="t6-qh"><span class="t6-num">${rs.start + q.k - 1}</span> <span class="t7-stem" lang="en">${esc(q.stem)}</span></h4>${qFbHtml(q, true)}</section>`).join('')}
        ${transcriptHtml(rs.feedback, ev)}<section class="tq-fb-sec tq-tip"><h3>${ICON('headphones', 'icon icon-sm')} Listening Tip</h3><p>${esc(rs.feedback.tip)}</p></section></div></details></li>`;
  }
  function showResult(res, s, award = {}) {
    stopAll(); App().setLeaveGuard(null);
    setHash(`toeic-p${part}-play`, s.id); App().showScreen('screen-toeic34-play');
    const el = root('screen-toeic34-play');
    const mock = res.mode === 'mock';
    const rows = res.skills.map((g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(g.th)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`).join('');
    el.innerHTML = `<div class="tq-resultpage">
        <header class="tq-res-hero"><p class="gl-kicker">${ICON('headphones', 'icon icon-sm')} TOEIC Listening Practice · Part ${part}</p>
          <h1 class="page-title" id="t34-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}</header>
        <div class="tq-stats"><div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div><div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          ${mock ? `<div class="tq-stat"><b>${res.unanswered}</b><span>ไม่ได้ตอบ</span></div>` : `<div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div>`}
          <div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>Avg. Response Time</span></div></div>
        ${res.strongest || res.weakest ? `<p class="tq-sw">${res.strongest ? `${ICON('star', 'icon icon-sm')} Strongest: <b>${esc(res.strongest.th)}</b> (${res.strongest.accuracy}%)` : ''}
          ${res.weakest && res.weakest.group !== (res.strongest && res.strongest.group) ? ` · ${ICON('target', 'icon icon-sm')} Weakest: <b>${esc(res.weakest.th)}</b> (${res.weakest.accuracy}%)` : ''}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Question Type Breakdown</h2><ul class="tq-skills">${rows}</ul></section>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-t34-nav="toeic-p${part}">${ICON('arrow-left', 'icon icon-sm')} Part ${part}</button>
          ${s.config && s.config.dailyTask && window.EQToeicDaily ? window.EQToeicDaily.resultButtons(part, s.config) : s.config && s.config.drill && window.EQToeicWeak ? window.EQToeicWeak.resultButtons(part, s.config) : s.config && s.config.fullTestId ? `<button class="btn btn-primary" type="button" data-tqf-back="${s.config.fullTestId}">${ICON('list-checks', 'icon icon-sm')} กลับไป Full Mock Test</button>` : `<button class="btn btn-primary" type="button" data-t34-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>`}</div>
        <section class="tq-review" aria-labelledby="t34-rv-title"><div class="tq-rv-head"><h2 class="tq-h2" id="t34-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2></div>
          <ol class="tq-rv-list">${res.review.map((rs) => reviewSet(rs)).join('')}</ol></section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p></div>`;
    focusTitle('t34-res-title');
  }
  async function openReview() {
    stopAll();
    setHash(`toeic-p${part}-review`); App().showScreen('screen-toeic34');
    const el = root('screen-toeic34');
    loading(el);
    try {
      const d = await api('/mistakes');
      el.innerHTML = `<button class="game-exit gl-back" type="button" data-t34-nav="toeic-p${part}">${ICON('arrow-left', 'icon icon-sm')} Part ${part}</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} ${NAME[part].kicker}</p><h1 class="page-title" id="t34-rev-title">Review Mistakes</h1>
          <p class="gl-sub">${d.items.length} ชุดที่ยังมีข้อตอบผิด · ฟังซ้ำพร้อมบทพูดและไฮไลต์ประโยคที่เป็นคำตอบ</p></header>
        ${d.items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-t34-act="custom">${ICON('play', 'icon icon-sm')} ฝึกชุดที่ผิดอีกครั้ง</button></div>
          <ol class="tq-rv-list">${d.items.map((rs) => reviewSet(rs, { notebook: true })).join('')}</ol>` : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีข้อที่ตอบผิด</p></div>`}`;
      focusTitle('t34-rev-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-t34-nav]');
    if (b) { e.preventDefault(); App().navigateTo(b.dataset.t34Nav); return; }
    b = t.closest('[data-t34-act]');
    if (b) { const a = b.dataset.t34Act; if (a === 'practice') practiceSetup('bank'); else if (a === 'custom') practiceSetup('mistakes'); else if (a === 'mock') mockIntro(); return; }
    b = t.closest('[data-t34-resume]');
    if (b) { unlockAudio(); openPlay(b.dataset.t34Resume); return; }
    b = t.closest('[data-t34-range]');
    if (b) { ls.set(`eq_t${part}_range`, b.dataset.t34Range); openLanding(); return; }
    b = t.closest('[data-t34-rvplay]');
    if (b) { try { const a = audioEl(); stopAudio(); a.src = await loadAudio(b.dataset.t34Rvplay); a.playbackRate = 1; await a.play(); } catch (_) { App().toast('เล่นเสียงไม่สำเร็จ', 'error'); } return; }
    b = t.closest('[data-t34-srs]');
    if (b) {
      b.disabled = true;
      try { const r = await api('/vocab/review', { method: 'POST', body: { wordId: b.dataset.t34Srs } }); b.innerHTML = `${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มแล้ว' : 'อยู่ในรายการแล้ว'}`; } catch (err) { b.disabled = false; App().toast(err.message || 'เพิ่มไม่สำเร็จ', 'error'); }
      return;
    }
    if (!S) return;
    if (t.closest('[data-t34-play]')) { unlockAudio(); if (S.mock) preview(); else playAudio(); return; }
    b = t.closest('[data-t34-ans]');
    if (b) { if (!b.disabled) choose(b.dataset.t34Q, b.dataset.t34Ans); return; }
    if (t.closest('[data-t34-next]')) { stopAll(); if (S.i + 1 >= S.s.items.length) finish(); else { S.i += 1; S.auto = false; renderSet(); } return; }
    if (t.closest('[data-t34-skip]')) { nextMock(); return; }
    if (t.closest('[data-t34-retry]')) { renderSet(); return; }
    b = t.closest('[data-t34-rate]');
    if (b) { ls.set('eq_tq_rate', b.dataset.t34Rate); b.parentElement.querySelectorAll('[data-t34-rate]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); }); if (player) player.playbackRate = Number(b.dataset.t34Rate); return; }
    if (t.closest('[data-t34-exit]')) App().navigateTo(`toeic-p${part}`);
  });
  window.addEventListener('eq:screen', (e) => { if (!e.detail || e.detail.id !== 'screen-toeic34-play') stopAll(); });

  /** เราเตอร์ (เรียกจาก app.js): open(3|4, view, param) */
  function open(p, view, param) {
    if (S && S.s && S.s.part !== p) { stopAll(); App().setLeaveGuard(null); S = null; }
    part = p === 4 ? 4 : 3;
    if (view !== 'play') { stopAll(); if (S && !S.mock) { App().setLeaveGuard(null); S = null; } }
    switch (view) {
      case 'play': return param ? openPlay(param) : openLanding();
      case 'review': return openReview();
      default: return openLanding();
    }
  }
  window.EQToeic34 = { open, mock: (p) => { part = p === 4 ? 4 : 3; mockIntro(); }, drill: (p, body) => { part = p === 4 ? 4 : 3; audioCheck(() => start('practice', body)); }, _state: () => S, _audio: () => player };
})();
