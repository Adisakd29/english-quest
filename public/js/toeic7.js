/* =====================================================================
   TOEIC-style Reading Part 7 — window.EQToeic7  (Reading Comprehension)
   หน้าจอ:
     p7      #/toeic-p7           Landing · Practice / Mock · Analytics
     play    #/toeic-p7-play/ID   เอกสาร 1–3 ฉบับ + คำถาม (Practice: เฉลยรายข้อ + ไฮไลต์หลักฐานในเอกสาร)
     review  #/toeic-p7-review    Error Notebook
   เอกสาร: หัวอีเมล · ย่อหน้า · ตาราง (| a | b |) · แชท (ชื่อ [เวลา]: ข้อความ) · ตำแหน่งแทรกประโยค [1]–[4]
   ตรวจคำตอบ/เวลา/EXP ที่เซิร์ฟเวอร์ (/api/toeic/p7/*) · CSS: toeic.css + toeic5.css + toeic6.css + toeic7.css
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/toeic/p7${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LETTERS = ['A', 'B', 'C', 'D'];
  const root = (id) => document.getElementById(`${id}-root`);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* - */ } } };
  let meta = null;
  const getMeta = async () => meta || (meta = await api('/meta'));
  function setHash(path, param) { const t = `#/${path}${param ? `/${param}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el, text = 'กำลังโหลด…') { el.innerHTML = `<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>${esc(text)}</div>`; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);
  const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} วิ` : '—');
  const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const DOC_EN = { email: 'e-mail', memo: 'memo', notice: 'notice', letter: 'letter', advertisement: 'advertisement', article: 'article', instructions: 'instructions',
    announcement: 'announcement', webpage: 'Web page', review: 'review', chat: 'online chat discussion', form: 'form', invoice: 'invoice', schedule: 'schedule', survey: 'survey' };

  /* ---------- การแสดงเอกสาร ---------- */
  // ไฮไลต์หลักฐาน (ข้อความยกมาตรงตัว) ในบรรทัดที่ escape แล้ว — ไม่สนตัวพิมพ์/ช่องว่าง
  function marker(html, quotes) {
    let out = html;
    quotes.forEach((q) => {
      const pat = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+').replace(/&#39;|'/g, "(?:&#39;|')");
      try { out = out.replace(new RegExp(pat, 'i'), (m) => `<mark class="t7-ev">${m}</mark>`); } catch (_) { /* - */ }
    });
    return out;
  }
  function docHtml(d, opts = {}) {
    const ev = opts.evidence || [];
    const ins = opts.insertion;   // { at, sentence, done }
    const line = (s) => {
      let h = marker(esc(s), ev);
      h = h.replace(/\[([1-4])\]/g, (_, n) => (ins && ins.done && Number(n) === ins.at
        ? `<span class="t7-ins is-ok"><b>[${n}]</b> ${esc(ins.sentence)}</span>` : `<span class="t7-ins${ins && ins.done ? ' is-dim' : ''}">[${n}]</span>`));
      return h;
    };
    const blocks = String(d.text).split(/\n{2,}/);
    return blocks.map((b, bi) => {
      const ls2 = b.split('\n');
      // ตาราง: บรรทัดที่ขึ้นต้นและลงท้ายด้วย | ติดกัน ≥ 2 บรรทัด (ปนกับข้อความในย่อหน้าเดียวกันได้)
      const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
      if (ls2.filter(isRow).length >= 2) {
        const out = []; let run = []; let txt = [];
        const flushTxt = () => { if (txt.length) { out.push(`<p>${txt.map(line).join('<br>')}</p>`); txt = []; } };
        // หลักฐานที่ยกมาเป็นแถวตาราง ("a | b | c") → ไฮไลต์ทั้งแถว
        const cellsKey = (x) => String(x).toLowerCase().replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim().replace(/\s+/g, ' ')).join('|');
        const evRows = ev.filter((x) => x.includes('|')).map(cellsKey);
        const flushRun = () => {
          if (!run.length) return;
          const raw = run.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
          const rows = raw.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
          const hit = (l) => evRows.some((k) => cellsKey(l).includes(k));
          out.push(`<div class="t7-tablewrap"><table class="t7-table"><thead><tr>${rows[0].map((c) => `<th>${line(c)}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(1).map((r, ri) => `<tr${hit(raw[ri + 1]) ? ' class="t7-ev-row"' : ''}>${r.map((c) => `<td>${line(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
          run = [];
        };
        ls2.forEach((l) => { if (isRow(l)) { flushTxt(); run.push(l); } else { flushRun(); txt.push(l); } });
        flushRun(); flushTxt();
        return out.join('');
      }
      if (d.docType === 'chat' && ls2.some((l) => /^[^:\n]{2,40}\[[^\]]+\]\s*:/.test(l))) {
        return `<div class="t7-chat">${ls2.map((l) => {
          const m = /^([^:[]+?)\s*\[([^\]]+)\]\s*:\s*(.*)$/.exec(l);
          return m ? `<p class="t7-msg"><span class="t7-who">${esc(m[1])} <small>${esc(m[2])}</small></span><span class="t7-say">${line(m[3])}</span></p>` : `<p>${line(l)}</p>`;
        }).join('')}</div>`;
      }
      if (bi === 0 && /^(To|From|Date|Subject|Re|Cc|Sent|MEMO|Memo)\b[^\n]*:/m.test(b)) return `<p class="t6-head">${ls2.map(line).join('<br>')}</p>`;
      return `<p>${ls2.map(line).join('<br>')}</p>`;
    }).join('');
  }
  function docsHtml(it, getOpts) {
    const n1 = it.start; const n2 = it.start + it.questions.length - 1;
    const lead = it.docs.length === 1 ? `Questions ${n1}–${n2} refer to the following ${DOC_EN[it.docs[0].docType] || it.docs[0].docType}.`
      : `Questions ${n1}–${n2} refer to the following ${(() => { const n = it.docs.map((d) => DOC_EN[d.docType] || d.docType); return n.length === 2 ? `${n[0]} and ${n[1]}` : `${n.slice(0, -1).join(', ')}, and ${n[n.length - 1]}`; })()}.`;
    return `<p class="t7-lead" lang="en">${esc(lead)}</p>${it.docs.map((d, i) => `
      <article class="gl-card t6-doc t7-doc t7-doc-${esc(d.docType)}" aria-label="${esc(d.docTypeTh)}">
        <p class="t6-doctype">${ICON(d.docType === 'chat' ? 'message-circle' : 'mail', 'icon icon-sm')} ${it.docs.length > 1 ? `เอกสาร ${i + 1} · ` : ''}${esc(d.docTypeTh)}</p>
        <h2 class="t6-doc-title" lang="en">${esc(d.title)}</h2>
        <div class="t6-text t7-text" lang="en">${docHtml(d, getOpts(i))}</div>
      </article>`).join('')}`;
  }

  /* =====================================================================
     LANDING
     ===================================================================== */
  let range = ls.get('eq_t7_range') || 'all';
  async function openLanding() {
    stopTimer();
    setHash('toeic-p7'); App().showScreen('screen-toeic7');
    const el = root('screen-toeic7');
    loading(el);
    try {
      const [m, s] = await Promise.all([getMeta(), api(`/summary?range=${range}`)]);
      const resume = s.activeSessions.map((a) => `<button class="tq-resume" type="button" data-t7-resume="${a.id}">${ICON('play', 'icon icon-sm')} ทำ${a.mode === 'mock' ? ' Mock Test' : 'ชุดฝึก'}ต่อ (${a.answered}/${a.total})</button>`).join('');
      const bar = (label, g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g ? g.accuracy : 0}%"></span></span><b>${g ? `${g.accuracy}%` : '—'}</b><small>${g ? `${g.total} ข้อ` : 'ยังไม่มีข้อมูล'}</small></li>`;
      const mockN = Object.values(m.mockPlan).reduce((a, b) => a + b, 0);
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t7-nav="toeic">${ICON('arrow-left', 'icon icon-sm')} TOEIC Practice</button>
        <header class="tq-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} Reading · Part 7</p>
          <h1 class="page-title" id="t7-title">Reading Comprehension</h1>
          <p class="gl-sub">อ่านอีเมล แชท ประกาศ ใบแจ้งหนี้ ตารางเวลา บทความ — ทั้งเอกสารเดี่ยวและหลายฉบับที่ต้องเชื่อมข้อมูลกัน · ${s.bankSize} ชุด (${s.bankQuestions} ข้อ)</p>
        </header>
        ${resume ? `<div class="tq-resumes">${resume}</div>` : ''}
        <div class="tq-modes">
          <button class="tq-mode tq-mode-main" type="button" data-t7-act="practice">${ICON('graduation-cap', 'icon')}<b>Practice</b><small>เฉลยรายข้อทันที · ไฮไลต์ประโยคหลักฐานในเอกสาร · ครบชุดเห็นคำแปลเอกสาร เทคนิค และคำศัพท์</small></button>
          <button class="tq-mode" type="button" data-t7-act="mock">${ICON('timer', 'icon')}<b>Mock Test</b><small>${mockN} ชุด (เดี่ยว ${m.mockPlan.single} · 2 ฉบับ ${m.mockPlan.double} · 3 ฉบับ ${m.mockPlan.triple}) ≈ 22 ข้อ · 1 นาที/ข้อ · ดูผลหลังส่ง</small></button>
        </div>
        <div class="tq-stats" role="list">
          <div class="tq-stat" role="listitem"><b>${pct(s.accuracy)}</b><span>Accuracy</span></div>
          <div class="tq-stat" role="listitem"><b>${s.setsPracticed}<small>/${s.bankSize}</small></b><span>ชุดที่ฝึก</span></div>
          <div class="tq-stat" role="listitem"><b>${s.bestMock ? `${s.bestMock.percent}%` : '—'}</b><span>Best Mock Score</span></div>
          <div class="tq-stat" role="listitem"><b>${secs(s.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>
        </div>
        <div class="tq-links"><button class="tq-link" type="button" data-t7-nav="toeic-p7-review" ${s.mistakes ? '' : 'disabled'}>${ICON('rotate-ccw', 'icon icon-sm')}
          <span><b>Review Mistakes</b><small>${s.mistakes ? `${s.mistakes} ข้อที่ยังตอบผิด · ดูหลักฐานในเอกสาร` : 'ยังไม่มีข้อที่ตอบผิด'}</small></span></button></div>
        <section class="gl-card tq-analytics" aria-labelledby="t7-an-title">
          <div class="tq-an-head"><h2 class="tq-h2" id="t7-an-title">${ICON('chart-column', 'icon icon-sm')} วิเคราะห์ผล Reading</h2>
            <div class="vd-seg" role="radiogroup" aria-label="ช่วงเวลา">${[['7', '7 วัน'], ['30', '30 วัน'], ['all', 'ทั้งหมด']].map(([v, t]) => `<button class="vd-seg-btn${v === range ? ' active' : ''}" type="button" role="radio" aria-checked="${v === range}" data-t7-range="${v}">${t}</button>`).join('')}</div></div>
          ${s.answered ? `<p class="tq-an-sum">Part 7 Accuracy <b>${pct(s.accuracy)}</b> · ตอบ ${s.answered} ข้อ${s.weakSkill ? ` · ควรฝึก: <b>${esc(s.weakSkill.th)}</b>` : ''}</p>
            <ul class="tq-skills">${s.skills.map((g) => bar(g.th, g)).join('')}${bar('เอกสารเดี่ยว', s.formats.single)}${bar('เอกสารหลายฉบับ', s.formats.multi)}</ul>`
            : '<p class="tq-an-empty">ยังไม่มีข้อมูลในช่วงนี้ — เริ่มทำ Practice หรือ Mock Test</p>'}
        </section>
        <section class="gl-card t5-howto" aria-labelledby="t7-how-title">
          <h2 class="tq-h2" id="t7-how-title">${ICON('lightbulb', 'icon icon-sm')} วิธีทำ Part 7</h2>
          <ol><li>อ่านคำถามก่อนอ่านเอกสาร — รู้ว่าต้องหาข้อมูลอะไร (ชื่อ วันที่ ราคา เหตุผล)</li>
            <li>คำตอบที่ถูกมัก "พูดด้วยคำอื่น" (paraphrase) · ตัวเลือกที่ลอกคำจากเอกสารตรง ๆ มักเป็นกับดัก</li>
            <li>ข้อ NOT: ตัดตัวเลือกที่เจอในเอกสารออกทีละข้อ · ข้อแทรกประโยค: ดูคำอ้างอิง (this, these, also, however) ในประโยคที่ให้มา</li>
            <li>เอกสารหลายฉบับ: ข้อเชื่อมข้อมูลมักต้องเอาตัวเลข/ชื่อจากฉบับหนึ่งไปเทียบกับอีกฉบับ</li></ol>
        </section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(m.disclaimer)}</p>`;
      focusTitle('t7-title');
    } catch (err) { errorBox(el, err, openLanding); }
  }

  function practiceSetup(source = 'bank') {
    getMeta().then((m) => {
      const saved = (() => { try { return JSON.parse(ls.get('eq_t7_cfg') || '{}'); } catch (_) { return {}; } })();
      const cfg = { size: 3, format: 'mixed', difficulty: 'mixed', ...saved };
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      const seg = (name, opts, cur) => `<div class="vd-seg tq-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<button class="vd-seg-btn${String(v) === String(cur) ? ' active' : ''}" type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-cfg="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
      ov.innerHTML = `<div class="modal-card tq-setup" role="document">
        <h2 class="vb-sheet-title">${source === 'mistakes' ? 'ฝึกชุดที่เคยผิด' : 'ตั้งค่า Part 7 Practice'}</h2>
        ${source === 'mistakes' ? '<p class="gl-sub">ระบบเลือกชุดที่ยังมีข้อตอบผิด · ลำดับตัวเลือกสลับใหม่</p>' : `
          <p class="tq-setup-label">รูปแบบเอกสาร</p>${seg('format', [['mixed', 'ผสม'], ['single', 'เอกสารเดี่ยว'], ['multi', 'หลายฉบับ']], cfg.format)}
          <p class="tq-setup-label">ความยาก</p>${seg('difficulty', [['mixed', 'ผสม'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], cfg.difficulty)}`}
        <p class="tq-setup-label">จำนวนชุด</p>${seg('size', m.sizes.map((n) => [n, `${n} ชุด`]), cfg.size)}
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button>
          <button class="btn btn-primary" type="button" data-go>${ICON('play', 'icon icon-sm')} เริ่มฝึก</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'ตั้งค่าการฝึก Part 7', variant: 'sheet' });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cfg]');
        if (b) {
          cfg[b.dataset.cfg] = b.dataset.cfg === 'size' ? Number(b.dataset.v) : b.dataset.v;
          b.parentElement.querySelectorAll('[data-cfg]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
          return;
        }
        if (e.target.closest('[data-close]')) { ov.remove(); return; }
        if (e.target.closest('[data-go]')) { if (source !== 'mistakes') ls.set('eq_t7_cfg', JSON.stringify(cfg)); ov.remove(); start('practice', { ...cfg, source }); }
      });
    }).catch((err) => App().toast(err.message || 'โหลดไม่สำเร็จ', 'error'));
  }
  function mockIntro() {
    getMeta().then((m) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('timer', 'icon icon-lg')}</div>
        <h2 class="vb-sheet-title">TOEIC Part 7 — Mock Test</h2>
        <ul class="tq-rules"><li>เอกสารเดี่ยว ${m.mockPlan.single} ชุด + เอกสาร 2 ฉบับ ${m.mockPlan.double} ชุด + 3 ฉบับ ${m.mockPlan.triple} ชุด (≈ 22 ข้อ)</li>
          <li>เวลา <b>1 นาทีต่อข้อ</b> นับตั้งแต่กดเริ่ม · สลับชุด ย้อนกลับ เปลี่ยนคำตอบได้จนกว่าจะส่ง</li>
          <li>หมดเวลาส่งอัตโนมัติ · ไม่ได้ตอบ = ผิด · ได้ EXP เมื่อตอบอย่างน้อยครึ่งชุด</li></ul>
        <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close>ยกเลิก</button><button class="btn btn-primary" type="button" data-go>${ICON('timer', 'icon icon-sm')} เริ่มจับเวลา</button></div></div>`;
      document.body.appendChild(ov);
      App().makeDialog(ov, { label: 'Mock Test Part 7', variant: 'center' });
      ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); start('mock'); } });
    });
  }
  async function start(mode, cfg = {}) {
    try { const s = await api('/sessions', { method: 'POST', body: { mode, ...cfg, ...(mode === 'mock' && window.EQToeicFull ? window.EQToeicFull.ctx(7) : {}) } }); openPlay(s.id, s); } catch (err) { App().toast(err.message || 'เริ่มไม่สำเร็จ', 'error'); }
  }

  /* =====================================================================
     PLAYER
     ===================================================================== */
  let P = null;    // { s, i (ชุด), mock, sel: {qId: letter}, fb: {qId: feedback}, sfb: {pid: feedback} }
  let timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  async function openPlay(sid, preload) {
    stopTimer();
    setHash('toeic-p7-play', sid); App().showScreen('screen-toeic7-play');
    const el = root('screen-toeic7-play');
    loading(el, 'กำลังเตรียมข้อสอบ…');
    try {
      const s = preload && preload.items ? preload : await api(`/sessions/${sid}`);
      if (s.status === 'finished') { showResult(s.result, s); return; }
      if (s.status !== 'active') { App().toast('ชุดนี้ถูกปิดแล้ว', 'info'); openLanding(); return; }
      const sel = {}; const fb = {}; const sfb = {};
      s.items.forEach((it) => { it.questions.forEach((q) => { if (q.selected) sel[q.id] = q.selected; if (q.feedback) fb[q.id] = q.feedback; }); if (it.feedback) sfb[it.pid] = it.feedback; });
      const first = s.items.findIndex((it) => it.questions.some((q) => !sel[q.id]));
      P = { s, mock: s.mode === 'mock', sel, fb, sfb, i: first < 0 ? 0 : first, skew: s.serverNow ? Date.parse(s.serverNow) - Date.now() : 0, startAt: Date.now() };
      App().setLeaveGuard((path) => {
        if (!P || path.startsWith('toeic-p7-play')) return false;
        if (P.mock && !confirm('ออกจาก Mock Test ตอนนี้? เวลายังเดินต่อ — กลับมาทำต่อได้ก่อนหมดเวลา')) return true;
        stopTimer(); App().setLeaveGuard(null); P = null; return false;
      });
      if (!P.mock && first < 0) { finish(); return; }
      render();
      if (P.mock) startTimer();
    } catch (err) { errorBox(el, err, () => openPlay(sid)); }
  }
  const remaining = () => Date.parse(P.s.deadline) - (Date.now() + P.skew);
  function startTimer() {
    stopTimer();
    const tick = () => {
      if (!P || !P.mock) { stopTimer(); return; }
      const left = remaining();
      const t = document.getElementById('t7-timer');
      if (t) { t.querySelector('b').textContent = mmss(left); t.classList.toggle('is-warn', left <= 2 * 60000); t.classList.toggle('is-crit', left <= 30000); }
      if (left <= 60000 && !P.warned) { P.warned = true; App().toast('เหลือเวลา 1 นาที', 'info'); }
      if (left <= 0) { stopTimer(); App().toast('หมดเวลา — ส่งคำตอบให้อัตโนมัติ', 'info'); finish(); }
    };
    tick(); timer = setInterval(tick, 500);
  }
  const answeredCount = () => Object.keys(P.sel).length;

  /** ตัวเลือกการแสดงเอกสาร: หลักฐานของข้อที่เฉลยแล้ว · ข้อแทรกประโยค */
  function docOptsFor(it) {
    const ev = P.mock ? [] : it.questions.flatMap((q) => (P.fb[q.id] ? P.fb[q.id].evidence || [] : []));
    const insQ = it.questions.find((q) => q.type === 'insertion');
    const insFb = insQ && !P.mock && P.fb[insQ.id];
    return () => ({ evidence: ev, insertion: insFb ? { done: true, at: LETTERS.indexOf(insFb.correctOption) + 1, sentence: insFb.sentence } : null });
  }
  function questionHtml(it, q) {
    const fb = !P.mock && P.fb[q.id];
    const chosen = P.sel[q.id];
    const num = it.start + q.k - 1;
    return `<section class="gl-card t6-qcard t7-qcard" id="t7-q-${q.k}" aria-labelledby="t7-qh-${q.k}">
      <h3 class="t6-qh" id="t7-qh-${q.k}"><span class="t6-num">${num}</span> <span class="t7-stem" lang="en">${esc(q.stem)}</span></h3>
      ${q.sentence ? `<blockquote class="t7-sentence" lang="en">“${esc(q.sentence)}”</blockquote>` : ''}
      <div class="t5-opts is-sent" role="group" aria-label="ตัวเลือกข้อ ${num}">
        ${q.options.map((o, k) => {
          const l = LETTERS[k];
          let cls = '';
          if (fb) cls = l === fb.correctOption ? ' is-right' : l === fb.selected ? ' is-wrongpick' : '';
          else if (chosen === l) cls = ' is-chosen';
          return `<button class="t5-opt${cls}" type="button" data-t7-ans="${l}" data-t7-q="${esc(q.id)}" aria-pressed="${chosen === l}" ${fb ? 'disabled' : ''}><span class="t5-l">${l}</span><span class="t5-o" lang="en">${esc(o)}</span></button>`;
        }).join('')}
      </div>
      ${fb ? qFbHtml(fb) : ''}
    </section>`;
  }
  function qFbHtml(fb, review) {
    return `<div class="t6-bfb ${fb.isCorrect ? 'ok' : 'bad'}" ${review ? '' : 'role="status"'}>
      <p class="t6-bfb-head">${ICON(fb.isCorrect ? 'circle-check' : 'circle-x', 'icon icon-sm')} <b>${fb.isCorrect ? 'ถูกต้อง' : fb.selected ? 'ยังไม่ถูก' : 'ไม่ได้ตอบ'}</b>
        · คำตอบ ${fb.correctOption}${fb.selected && !fb.isCorrect ? ` (คุณเลือก ${fb.selected})` : ''} <span class="tq-chip">${esc(fb.skill.th)}</span>${fb.exp ? ` <span class="tq-exp">+${fb.exp} EXP</span>` : ''}</p>
      <p>${esc(fb.why)}</p>
      ${fb.evidence && fb.evidence.length ? `<div class="t7-evq">${ICON('search', 'icon icon-sm')} <span>หลักฐานในเอกสาร: ${fb.evidence.map((e) => `<q lang="en">${esc(e)}</q>`).join(' · ')}</span>
        ${review ? '' : '<button type="button" class="t6-tolink t7-toev" data-t7-toev>ดูในเอกสาร</button>'}</div>` : ''}
      <details class="t6-notes"><summary>เหตุผลของทุกตัวเลือก</summary><ol class="tq-lines">${fb.options.map((o) => `<li class="tq-line ${o.isCorrect ? 'is-correct' : ''} ${fb.selected === o.letter && !o.isCorrect ? 'is-wrong' : ''}">
        <span class="tq-line-l">${o.letter}</span><div class="tq-line-body"><p class="tq-line-en" lang="en">${esc(o.text)}</p><p class="tq-line-why">${esc(o.noteTH)}</p></div></li>`).join('')}</ol></details>
    </div>`;
  }
  function setFbHtml(it, sf) {
    const vocab = (sf.vocabulary || []).map((v) => `<li class="tq-vocab"><div class="tq-vocab-head"><b lang="en">${esc(v.word)}</b><span class="tq-pos">${esc(v.pos)}</span>
        <button class="tq-icon-btn" type="button" data-tq-say="${esc(v.word)}" aria-label="ฟังเสียงคำ ${esc(v.word)}">${ICON('volume-2', 'icon icon-sm')}</button></div><p class="tq-vocab-th">${esc(v.th)}</p>
        ${v.wordId ? `<div class="tq-vocab-act"><button class="mini-btn" type="button" data-tq-learn="${esc(v.wordId)}">${ICON('book-open', 'icon icon-sm')} เรียนคำนี้</button>
          <button class="mini-btn" type="button" data-t7-srs="${esc(v.wordId)}">${ICON('plus', 'icon icon-sm')} เพิ่มเข้ารายการทบทวน</button></div>` : ''}</li>`).join('');
    return `<section class="tq-fb-sec"><h3>${ICON('languages', 'icon icon-sm')} คำแปลเอกสาร</h3>
        ${sf.translationTH.map((t, i) => `<details class="t7-tr" ${sf.translationTH.length === 1 ? 'open' : ''}><summary>${esc(it.docs[i] ? it.docs[i].docTypeTh : '')} · ${esc(it.docs[i] ? it.docs[i].title : '')}</summary><p class="t6-trans">${esc(t).replace(/\n/g, '<br>')}</p></details>`).join('')}</section>
      <section class="tq-fb-sec tq-tip"><h3>${ICON('target', 'icon icon-sm')} Exam Tip</h3><p>${esc(sf.tip)}</p></section>
      ${vocab ? `<section class="tq-fb-sec"><h3>${ICON('book', 'icon icon-sm')} Key Vocabulary</h3><ul class="tq-vocabs">${vocab}</ul></section>` : ''}`;
  }

  function render() {
    const el = root('screen-toeic7-play');
    const { s } = P; const it = s.items[P.i];
    const done = it.questions.every((q) => P.fb[q.id]);
    P.startAt = Date.now();
    el.innerHTML = `
      <div class="tq-play t6-play t7-play ${P.mock ? 'is-mock' : 'is-practice'}">
        <div class="tq-top">
          <button class="game-exit" type="button" data-t7-exit aria-label="ออก">${ICON('x', 'icon icon-sm')}</button>
          <div class="tq-top-text"><b>TOEIC Reading · Part 7</b><small id="t7-sub">${P.mock ? `Mock Test · ตอบแล้ว ${answeredCount()}/${s.total}` : `Practice · ชุด ${P.i + 1}/${s.items.length}`}</small></div>
          ${P.mock ? `<span class="t5-timer" id="t7-timer" role="timer" aria-label="เวลาที่เหลือ">${ICON('timer', 'icon icon-sm')} <b>${mmss(remaining())}</b></span>` : `<span class="tq-qno">Set ${P.i + 1} / ${s.items.length}</span>`}
        </div>
        <div class="tq-progress" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${answeredCount()}"><span id="t7-bar" style="width:${(answeredCount() / s.total) * 100}%"></span></div>
        ${P.mock ? `<div class="t6-tabs t7-tabs" role="tablist" aria-label="ชุดเอกสาร">${s.items.map((x, k) => `<button type="button" role="tab" class="t6-tab${k === P.i ? ' is-on' : ''}" aria-selected="${k === P.i}" data-t7-tab="${k}">
          ชุด ${k + 1} <small>${x.docs.length > 1 ? `${x.docs.length} ฉบับ · ` : ''}${x.questions.filter((q) => P.sel[q.id]).length}/${x.questions.length}</small></button>`).join('')}</div>` : ''}
        <div class="t6-layout t7-layout">
          <div class="t7-docs" id="t7-docs" tabindex="-1">${docsHtml(it, docOptsFor(it))}</div>
          <div class="t6-qs" id="t7-qs">${it.questions.map((q) => questionHtml(it, q)).join('')}
            <div id="t7-sfb">${!P.mock && done && P.sfb[it.pid] ? setFbHtml(it, P.sfb[it.pid]) + nextBtn() : ''}</div></div>
        </div>
        ${P.mock ? mockNav() : ''}
      </div>`;
    focusTitle('t7-docs');
  }
  const nextBtn = () => `<div class="gl-actions tq-next"><button class="btn btn-primary" type="button" data-t7-next>${P.i + 1 >= P.s.items.length ? `${ICON('flag', 'icon icon-sm')} ดูผล` : `ชุดถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></div>`;
  function mockNav() {
    const left = P.s.total - answeredCount();
    return `<nav class="t5-mnav" aria-label="ไปข้ออื่น">
      <div class="t5-mnav-row">
        <button class="btn btn-secondary" type="button" data-t7-tab="${P.i - 1}" ${P.i === 0 ? 'disabled' : ''}>${ICON('chevron-left', 'icon icon-sm')} ชุดก่อนหน้า</button>
        <button class="btn btn-secondary" type="button" data-t7-tab="${P.i + 1}" ${P.i + 1 >= P.s.items.length ? 'disabled' : ''}>ชุดถัดไป ${ICON('chevron-right', 'icon icon-sm')}</button>
      </div>
      <ol class="t5-grid">${P.s.items.flatMap((x, pi) => x.questions.map((q) => `<li><button type="button" class="t5-cell${P.sel[q.id] ? ' is-done' : ''}${pi === P.i ? ' is-cur' : ''}" data-t7-jump="${pi}:${q.k}"
        aria-label="ข้อ ${x.start + q.k - 1}${P.sel[q.id] ? ` ตอบ ${P.sel[q.id]}` : ' ยังไม่ตอบ'}">${x.start + q.k - 1}</button></li>`)).join('')}</ol>
      <button class="btn btn-primary t5-submit" type="button" data-t7-submit>${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}</button>
    </nav>`;
  }
  function refresh(it, q) {
    const el = document.getElementById(`t7-q-${q.k}`); if (el) el.outerHTML = questionHtml(it, q);
    if (!P.mock) { const d = document.getElementById('t7-docs'); if (d) d.innerHTML = docsHtml(it, docOptsFor(it)); }
    const n = answeredCount();
    const bar = document.getElementById('t7-bar'); if (bar) bar.style.width = `${(n / P.s.total) * 100}%`;
    if (P.mock) {
      const sub = document.getElementById('t7-sub'); if (sub) sub.textContent = `Mock Test · ตอบแล้ว ${n}/${P.s.total}`;
      const cell = document.querySelector(`[data-t7-jump="${P.i}:${q.k}"]`); if (cell) cell.classList.add('is-done');
      const tab = document.querySelector(`.t6-tab[data-t7-tab="${P.i}"] small`);
      if (tab) tab.textContent = `${it.docs.length > 1 ? `${it.docs.length} ฉบับ · ` : ''}${it.questions.filter((x) => P.sel[x.id]).length}/${it.questions.length}`;
      const btn = document.querySelector('[data-t7-submit]'); const left = P.s.total - n;
      if (btn) btn.innerHTML = `${ICON('send', 'icon icon-sm')} ส่งคำตอบ${left ? ` (ยังไม่ตอบ ${left} ข้อ)` : ''}`;
    }
  }
  async function choose(qid, letter) {
    if (!P) return;
    const it = P.s.items[P.i];
    const q = it.questions.find((x) => x.id === qid);
    if (!q || (!P.mock && (P.fb[q.id] || P.busy)) || (P.mock && P.sel[q.id] === letter)) return;
    const prev = P.sel[q.id];
    P.sel[q.id] = letter; P.busy = true;
    refresh(it, q);
    if (!P.mock) document.querySelectorAll(`[data-t7-q="${q.id}"]`).forEach((x) => { x.disabled = true; });
    try {
      const r = await api(`/sessions/${P.s.id}/answer`, { method: 'POST', body: { id: q.id, selected: letter, responseMs: Date.now() - P.startAt } });
      P.busy = false; P.startAt = Date.now();
      if (!P) return;
      if (!P.mock) {
        P.fb[q.id] = { ...r.feedback, exp: r.exp };
        if (window.EQAudio) window.EQAudio.sfx(r.feedback.isCorrect ? 'correct' : 'wrong');
        if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
        refresh(it, q);
        if (r.set) { P.sfb[it.pid] = r.set; document.getElementById('t7-sfb').innerHTML = setFbHtml(it, r.set) + nextBtn(); }
        const f = document.querySelector(`#t7-q-${q.k} .t6-bfb`); if (f) f.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      }
    } catch (err) {
      P.busy = false;
      if (!P) return;
      if (err && err.code === 'TIME_UP') { finish(); return; }
      if (prev) P.sel[q.id] = prev; else delete P.sel[q.id];
      refresh(it, q);
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
    }
  }
  function confirmSubmit() {
    const left = P.s.total - answeredCount();
    if (!left) { finish(); return; }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card tq-check" role="document"><div class="tq-check-icon">${ICON('circle-alert', 'icon icon-lg')}</div>
      <h2 class="vb-sheet-title">ยังไม่ได้ตอบ ${left} ข้อ</h2><p class="gl-sub">ข้อที่ไม่ได้ตอบจะนับว่าผิด · เหลือเวลา ${mmss(remaining())}</p>
      <div class="gl-actions"><button class="btn btn-secondary" type="button" data-close data-autofocus>กลับไปทำต่อ</button><button class="btn btn-primary" type="button" data-go>${ICON('send', 'icon icon-sm')} ส่งเลย</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ยืนยันส่งคำตอบ', variant: 'center' });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ov.remove(); if (e.target.closest('[data-go]')) { ov.remove(); finish(); } });
  }
  async function finish() {
    if (!P || P.finishing) return;
    P.finishing = true; stopTimer();
    const el = root('screen-toeic7-play');
    loading(el, 'กำลังสรุปผล…');
    try {
      const r = await api(`/sessions/${P.s.id}/finish`, { method: 'POST', body: {} });
      const s = P.s; App().setLeaveGuard(null); P = null;
      if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      showResult(r.result, s, r);
    } catch (err) { P.finishing = false; errorBox(el, err, finish); }
  }

  /* ---------- ผลลัพธ์ / ทบทวน ---------- */
  function reviewSet(rs, opts = {}) {
    const wrongN = rs.questions.filter((q) => (opts.notebook ? q.wrong : !q.isCorrect)).length;
    const ev = rs.questions.flatMap((q) => q.evidence || []);
    const insQ = rs.questions.find((q) => q.type === 'insertion');
    const get = () => ({ evidence: ev, insertion: insQ ? { done: true, at: LETTERS.indexOf(insQ.correctOption) + 1, sentence: insQ.sentence } : null });
    const it = { ...rs, questions: rs.questions };
    return `<li class="tq-rv ${wrongN ? 'bad' : 'ok'}" data-ok="${wrongN ? 0 : 1}">
      <details><summary><span class="tq-rv-n">${rs.n ? `S${rs.n}` : ''}</span>
        <span class="tq-rv-sum t5-rv-sum"><span class="t5-rv-s" lang="en">${rs.docs.map((d) => esc(d.title)).join(' + ')}</span>
        <small>${esc(rs.formatTh)} · ${opts.notebook ? `ยังผิด ${wrongN} ข้อ` : `ถูก ${rs.questions.length - wrongN}/${rs.questions.length}`}</small></span></summary>
        <div class="tq-rv-body">${docsHtml(it, get)}
          ${rs.questions.map((q) => `<section class="t6-rvq"><h4 class="t6-qh"><span class="t6-num">${rs.start + q.k - 1}</span> <span class="t7-stem" lang="en">${esc(q.stem)}</span></h4>
            ${q.sentence ? `<blockquote class="t7-sentence" lang="en">“${esc(q.sentence)}”</blockquote>` : ''}${qFbHtml(q, true)}</section>`).join('')}
          ${setFbHtml(rs, rs.feedback)}</div></details></li>`;
  }
  function showResult(res, s, award = {}) {
    stopTimer(); App().setLeaveGuard(null);
    setHash('toeic-p7-play', s.id); App().showScreen('screen-toeic7-play');
    const el = root('screen-toeic7-play');
    const mock = res.mode === 'mock';
    const row = (label, g) => `<li class="tq-skill"><span class="tq-skill-name">${esc(label)}</span><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${g.accuracy}%"></span></span><b>${g.correct}/${g.total}</b><small>${g.accuracy}%</small></li>`;
    el.innerHTML = `
      <div class="tq-resultpage">
        <header class="tq-res-hero">
          <p class="gl-kicker">${ICON('book-open', 'icon icon-sm')} TOEIC Reading Practice · Part 7</p>
          <h1 class="page-title" id="t7-res-title">${mock ? 'Mock Test Result' : 'Practice Result'}</h1>
          <div class="tq-score"><b>${res.correct} / ${res.total}</b><span>${res.accuracy}%</span></div>
          <p class="tq-score-label">${esc(res.label)}${res.estimate ? ` · Estimated performance: ${esc(res.estimate)}` : ''}</p>
          ${award.exp ? `<p class="tq-res-exp">+${award.exp} EXP</p>` : res.expAwarded ? `<p class="tq-res-exp">+${res.expAwarded} EXP</p>` : ''}
        </header>
        <div class="tq-stats">
          <div class="tq-stat"><b>${res.correct}</b><span>Correct</span></div><div class="tq-stat"><b>${res.incorrect}</b><span>Incorrect</span></div>
          ${mock ? `<div class="tq-stat"><b>${res.unanswered}</b><span>ไม่ได้ตอบ</span></div><div class="tq-stat"><b>${res.timeUsedMs != null ? mmss(res.timeUsedMs) : '—'}<small>/${mmss(res.timeLimitMs)}</small></b><span>เวลาที่ใช้</span></div>`
            : `<div class="tq-stat"><b>${res.accuracy}%</b><span>Accuracy</span></div><div class="tq-stat"><b>${secs(res.avgResponseMs)}</b><span>เวลาเฉลี่ย/ข้อ</span></div>`}
        </div>
        ${res.strongest || res.weakest ? `<p class="tq-sw">${res.strongest ? `${ICON('star', 'icon icon-sm')} Strongest: <b>${esc(res.strongest.th)}</b> (${res.strongest.accuracy}%)` : ''}
          ${res.weakest && res.weakest.group !== (res.strongest && res.strongest.group) ? ` · ${ICON('target', 'icon icon-sm')} Weakest: <b>${esc(res.weakest.th)}</b> (${res.weakest.accuracy}%)` : ''}</p>` : ''}
        <section class="gl-card"><h2 class="tq-h2">${ICON('chart-column', 'icon icon-sm')} Skill Breakdown</h2><ul class="tq-skills">${res.skills.map((g) => row(g.th, g)).join('')}
          ${res.formats.single ? row('เอกสารเดี่ยว', res.formats.single) : ''}${res.formats.multi ? row('เอกสารหลายฉบับ', res.formats.multi) : ''}</ul></section>
        <div class="gl-actions">
          <button class="btn btn-secondary" type="button" data-t7-nav="toeic-p7">${ICON('arrow-left', 'icon icon-sm')} Part 7</button>
          ${s.config && s.config.dailyTask && window.EQToeicDaily ? window.EQToeicDaily.resultButtons(7, s.config) : s.config && s.config.drill && window.EQToeicWeak ? window.EQToeicWeak.resultButtons(7, s.config) : s.config && s.config.fullTestId ? `<button class="btn btn-primary" type="button" data-tqf-back="${s.config.fullTestId}">${ICON('list-checks', 'icon icon-sm')} กลับไป Full Mock Test</button>` : `<button class="btn btn-primary" type="button" data-t7-act="${mock ? 'mock' : 'practice'}">${ICON('refresh-cw', 'icon icon-sm')} ${mock ? 'ทำ Mock อีกชุด' : 'ฝึกอีกชุด'}</button>`}
        </div>
        <section class="tq-review" aria-labelledby="t7-rv-title"><div class="tq-rv-head"><h2 class="tq-h2" id="t7-rv-title">${ICON('list-checks', 'icon icon-sm')} Review Answers</h2></div>
          <ol class="tq-rv-list">${res.review.map((rs) => reviewSet(rs)).join('')}</ol></section>
        <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(res.disclaimer)}</p>
      </div>`;
    focusTitle('t7-res-title');
  }
  async function openReview() {
    stopTimer();
    setHash('toeic-p7-review'); App().showScreen('screen-toeic7');
    const el = root('screen-toeic7');
    loading(el);
    try {
      const d = await api('/mistakes');
      el.innerHTML = `
        <button class="game-exit gl-back" type="button" data-t7-nav="toeic-p7">${ICON('arrow-left', 'icon icon-sm')} Part 7</button>
        <header class="tq-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Reading · Part 7</p><h1 class="page-title" id="t7-rev-title">Review Mistakes</h1>
          <p class="gl-sub">${d.items.length} ชุดที่ยังมีข้อตอบผิด · ไฮไลต์หลักฐานในเอกสารทุกข้อ</p></header>
        ${d.items.length ? `<div class="gl-actions"><button class="btn btn-primary" type="button" data-t7-act="custom">${ICON('play', 'icon icon-sm')} ฝึกชุดที่ผิดอีกครั้ง</button></div>
          <ol class="tq-rv-list">${d.items.map((rs) => reviewSet(rs, { notebook: true })).join('')}</ol>` : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีข้อที่ตอบผิด</p></div>`}`;
      focusTitle('t7-rev-title');
    } catch (err) { errorBox(el, err, openReview); }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t.closest) return;
    let b = t.closest('[data-t7-nav]');
    if (b) { e.preventDefault(); App().navigateTo(b.dataset.t7Nav); return; }
    b = t.closest('[data-t7-act]');
    if (b) { const a = b.dataset.t7Act; if (a === 'practice') practiceSetup('bank'); else if (a === 'custom') practiceSetup('mistakes'); else if (a === 'mock') mockIntro(); return; }
    b = t.closest('[data-t7-resume]');
    if (b) { openPlay(b.dataset.t7Resume); return; }
    b = t.closest('[data-t7-range]');
    if (b) { range = b.dataset.t7Range; ls.set('eq_t7_range', range); openLanding(); return; }
    b = t.closest('[data-t7-srs]');
    if (b) {
      b.disabled = true;
      try { const r = await api('/vocab/review', { method: 'POST', body: { wordId: b.dataset.t7Srs } }); b.innerHTML = `${ICON('check', 'icon icon-sm')} ${r.added ? 'เพิ่มแล้ว' : 'อยู่ในรายการแล้ว'}`; } catch (err) { b.disabled = false; App().toast(err.message || 'เพิ่มไม่สำเร็จ', 'error'); }
      return;
    }
    if (!P) return;
    b = t.closest('[data-t7-ans]');
    if (b) { if (!b.disabled) choose(b.dataset.t7Q, b.dataset.t7Ans); return; }
    if (t.closest('[data-t7-toev]')) { const m = document.querySelector('#t7-docs mark.t7-ev, #t7-docs .t7-ev-row, #t7-docs .t7-ins.is-ok'); if (m) m.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); return; }
    if (t.closest('[data-t7-next]')) { if (P.i + 1 >= P.s.items.length) finish(); else { P.i += 1; render(); } return; }
    b = t.closest('[data-t7-tab]');
    if (b) { const n = Number(b.dataset.t7Tab); if (n >= 0 && n < P.s.items.length) { P.i = n; render(); } return; }
    b = t.closest('[data-t7-jump]');
    if (b) { const [pi, k] = b.dataset.t7Jump.split(':').map(Number); P.i = pi; render(); const q = document.getElementById(`t7-q-${k}`); if (q) q.scrollIntoView({ block: 'start' }); return; }
    if (t.closest('[data-t7-submit]')) { confirmSubmit(); return; }
    if (t.closest('[data-t7-exit]')) App().navigateTo('toeic-p7');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P && P.mock && timer) startTimer(); });

  function open(view, param) {
    if (view !== 'play') { stopTimer(); if (P && !P.mock) { App().setLeaveGuard(null); P = null; } }
    switch (view) {
      case 'play': return param ? openPlay(param) : openLanding();
      case 'review': return openReview();
      default: return openLanding();
    }
  }
  window.EQToeic7 = { open, mock: () => mockIntro(), drill: (_p, body) => start('practice', body), _state: () => P };
})();
