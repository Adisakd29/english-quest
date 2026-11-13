/* =====================================================================
   Word Atlas — คลังคำศัพท์ A–Z (v1.14.0) — window.EQWordAtlas
     #/atlas                       หน้าหลัก: ค้นหา · เมนู 8 อย่าง · A–Z + ความคืบหน้า · คำประจำวัน · แนะนำ · เรียนต่อ
     #/atlas/letter/<a-z>          Learning Map ของตัวอักษร (Unit A-001 …) + รายการคำ
     #/atlas/browse/<query>        รายการคำ (ค้นหา/กรอง/เรียง · แบ่งหน้าฝั่งเซิร์ฟเวอร์)
     #/atlas/word/<L-…>            รายละเอียดคำ (ทุกความหมาย · เสียง UK/US · บันทึก · เพิ่มเข้าทบทวน)
     #/atlas/unit/<A-001>          บทเรียน Step-by-Step (เรียนต่อจากขั้นล่าสุดได้ทุกอุปกรณ์)
     #/atlas/quiz/<query>          แบบฝึก (แนะนำ / ประจำวัน / ระดับ / หมวด / ตัวอักษร / คำที่บันทึก / คำเดียว)
     #/atlas/review · /collection · /cefr · /topics
   ข้อมูลทุกชิ้นผ่าน esc() · เฉลยอยู่ที่เซิร์ฟเวอร์ (/api/word-atlas) · EXP ระบบเดียวกับทั้งแอป
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-atlas-root');
  const api = (p, o) => App().api(`/word-atlas${p}`, o);
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const POS_TH = { noun: 'คำนาม', verb: 'คำกริยา', adjective: 'คำคุณศัพท์', adverb: 'คำกริยาวิเศษณ์', preposition: 'คำบุพบท', conjunction: 'คำสันธาน', pronoun: 'คำสรรพนาม', determiner: 'คำนำหน้านาม', exclamation: 'คำอุทาน', number: 'ตัวเลข', 'phrasal verb': 'Phrasal verb', idiom: 'สำนวน', phrase: 'วลี', 'fixed expression': 'สำนวนตายตัว', collocation: 'คำปรากฏร่วม', 'modal verb': 'กริยาช่วย', 'auxiliary verb': 'กริยาช่วย', 'indefinite article': 'คำนำหน้านาม', 'definite article': 'คำนำหน้านาม' };
  const STATUS_TH = { new: 'ยังไม่เรียน', learning: 'กำลังเรียน', familiar: 'เริ่มคุ้นเคย', known: 'รู้แล้ว', mastered: 'เชี่ยวชาญ', needReview: 'ควรทบทวน', partial: 'เรียนบางความหมาย', learned: 'เรียนแล้ว' };
  const BAND_TH = { 1: 'ใช้บ่อยมาก', 2: 'ใช้บ่อย', 3: 'พบบ่อย', 4: 'พบได้ทั่วไป', 5: 'ไม่ค่อยพบ', 6: 'หายาก' };
  const SORT_TH = { alpha: 'A–Z', common: 'ใช้บ่อยที่สุด', recommended: 'แนะนำ', easy: 'ง่าย → ยาก', recent: 'เพิ่มล่าสุด', notLearned: 'ยังไม่เรียน', needReview: 'ควรทบทวน' };
  const LABEL_TH = { formal: 'ทางการ', informal: 'ไม่เป็นทางการ', slang: 'สแลง', literary: 'ภาษาวรรณกรรม', technical: 'ศัพท์เฉพาะ', archaic: 'โบราณ', dated: 'เก่า', rare: 'หายาก', humorous: 'ขำขัน', UK: 'อังกฤษ (UK)', US: 'อเมริกัน (US)', AU: 'ออสเตรเลีย', idiom: 'สำนวน', euphemism: 'คำสุภาพแทน' };
  const SOURCE_TH = { recommended: 'คำแนะนำสำหรับคุณ', daily: 'คำประจำวัน', review: 'ทบทวนคำที่ผิด/ถึงกำหนด', collection: 'คำที่บันทึกไว้', cefr: 'ตามระดับ', topic: 'ตามหมวด', letter: 'ตามตัวอักษร', lemma: 'คำนี้' };
  let H = null;           // hub cache
  let view = null;        // สถานะหน้าปัจจุบัน
  let lesson = null;      // { unit, step, quiz }
  let quiz = null;        // { s, i, fb, results, ctx }

  /* ----------------------------------------------------------- ตัวช่วย */
  function go(hash) { if (location.hash === hash) open(hash); else location.hash = hash; }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-wa-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-wa-retry]').addEventListener('click', retry);
  }
  const back = (hash, label) => `<button class="game-exit gl-back" type="button" data-wa-go="${esc(hash)}">${ICON('arrow-left', 'icon icon-sm')} ${esc(label)}</button>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const parseQs = (s) => Object.fromEntries(String(s || '').split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
  const cefrChip = (c) => (c ? `<span class="wk-chip wa-cefr">${esc(c)}</span>` : '<span class="wk-chip wa-uncl" title="ยังไม่มีข้อมูลระดับ CEFR ที่ตรวจสอบได้">Unclassified</span>');
  const posTH = (p) => POS_TH[p] || p || '';

  /* เสียง: ไฟล์คนอ่านจริง (Wikimedia Commons) ถ้ามี ไม่งั้นเสียงสังเคราะห์ในเครื่อง (สำเนียงตามปุ่ม) */
  let audioEl = null;
  function speak(text, accent) {
    try {
      if (!('speechSynthesis' in window) || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = accent === 'UK' ? 'en-GB' : accent === 'US' ? 'en-US' : 'en-US';
      const v = window.speechSynthesis.getVoices().find((x) => x.lang === u.lang);
      if (v) u.voice = v;
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    } catch (_) { /* ไม่มีเสียงก็เรียนได้ */ }
  }
  function play(url, text, accent) {
    if (audioEl) { audioEl.pause(); audioEl = null; }
    if (url && /^https:\/\/upload\.wikimedia\.org\//.test(url)) {
      audioEl = new Audio(url);
      audioEl.play().catch(() => speak(text, accent));
    } else speak(text, accent);
  }
  const sayBtn = (text, { url = '', accent = '', label = '' } = {}) => `<button class="wk-say wa-say" type="button" data-wa-say="${esc(text)}" data-wa-url="${esc(url || '')}" data-wa-accent="${esc(accent)}" aria-label="ฟังเสียง${accent ? ` ${accent}` : ''}: ${esc(label || text)}">${ICON('volume-2', 'icon icon-sm')}${accent ? `<span>${esc(accent)}</span>` : ''}</button>`;

  /* ----------------------------------------------------------- Router */
  function open(hash) {
    const h = String(hash || location.hash || '#/atlas');
    App().showScreen('screen-atlas');
    const parts = h.replace(/^#\/?atlas\/?/, '').split('/');
    const [a, b] = parts;
    if (a !== 'quiz' && a !== 'unit') quiz = null;
    if (a !== 'unit') lesson = null;
    if (!a) return openHub();
    if (a === 'letter' && LETTERS.includes(b)) return openLetter(b, parts[2] === 'words' ? 'words' : 'units');
    if (a === 'browse') return openBrowse(parseQs(b));
    if (a === 'word' && b) return openWord(b);
    if (a === 'unit' && b) return openUnit(b);
    if (a === 'quiz') return startQuiz(parseQs(b));
    if (a === 'review') return openReview();
    if (a === 'collection') return openCollection();
    if (a === 'cefr') return openCefr();
    if (a === 'topics') return openTopics();
    return openHub();
  }

  /* ----------------------------------------------------------- หน้าหลัก */
  async function openHub() {
    // หน้าหลัก = Vocabulary Quiz อย่างเดียว (ตามคำขอ 4 พ.ย.): เลือกหมวด A–Z → ทายความหมาย 5 ตัวเลือกทันที
    view = { name: 'hub' };
    const el = root(); loading(el);
    try { H = await api(''); } catch (err) { errorBox(el, err, openHub); return; }
    const letter = (L) => `<li><button class="wa-letter${L.available ? '' : ' is-empty'}" type="button" data-wa-go="#/atlas/quiz/${qs({ source: 'letter', letter: L.letter })}" ${L.available ? '' : 'disabled'} aria-label="ทายความหมายคำศัพท์หมวด ${L.letter.toUpperCase()}: เรียนแล้ว ${L.learned} จาก ${L.available} ความหมาย">
        <b>${L.letter.toUpperCase()}</b><small>${L.learned}/${L.available}</small>
        <span class="wa-lbar" aria-hidden="true"><span style="width:${pct(L.learned, L.available)}%"></span></span></button></li>`;
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-nav-to="learn">${ICON('arrow-left', 'icon icon-sm')} เส้นทางการเรียน</button>
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('target', 'icon icon-sm')} Word Atlas</p>
        <h1 class="page-title" id="wa-title">Vocabulary Quiz</h1>
        <p class="gl-sub">เลือกหมวด A–Z ที่อยากทายความหมาย แล้วเริ่มเลือกคำตอบจาก 5 ตัวเลือกได้ทันที</p></header>
      <section class="wa-sec" aria-labelledby="wa-az"><h2 class="wa-h2" id="wa-az">${ICON('arrow-down-a-z', 'icon icon-sm')} เลือกหมวด A–Z</h2>
        <ul class="wa-az wa-az-big">${H.letters.map(letter).join('')}</ul>
        <p class="wa-note">ตัวเลขใต้ตัวอักษร = ความหมายที่คุณเรียนแล้ว / ที่มีให้ทายในหมวดนั้นตอนนี้ (นับรวมคำที่เรียนจาก Oxford แล้ว)</p></section>
      <p class="tq-disclaimer">${ICON('info', 'icon icon-sm')} คำศัพท์จาก Oxford 3000/5000 และคลัง C2 ของ EnglishQuest · คำเพิ่มเติมและคำแปลจาก Wiktionary (CC BY-SA 4.0) ที่ผ่านการตรวจแล้ว</p>`;
    focusTitle('wa-title');
  }

  /* ----------------------------------------------------------- ตัวอักษร: Learning Map + รายการคำ */
  async function openLetter(letter, tab) {
    view = { name: 'letter', letter, tab };
    const el = root(); loading(el);
    let d;
    try { d = await api(`/letters/${letter}/units`); } catch (err) { errorBox(el, err, () => openLetter(letter, tab)); return; }
    const nav = `<nav class="wa-azbar" aria-label="เลือกตัวอักษร"><ul>${LETTERS.map((L) => `<li><a href="#/atlas/letter/${L}${tab === 'words' ? '/words' : ''}" class="${L === letter ? 'is-on' : ''}" ${L === letter ? 'aria-current="page"' : ''}>${L.toUpperCase()}</a></li>`).join('')}</ul></nav>`;
    const tabs = `<div class="wa-tabs" role="tablist"><a role="tab" href="#/atlas/letter/${letter}" aria-selected="${tab === 'units'}" class="${tab === 'units' ? 'is-on' : ''}">${ICON('map', 'icon icon-sm')} Learning Map</a>
      <a role="tab" href="#/atlas/letter/${letter}/words" aria-selected="${tab === 'words'}" class="${tab === 'words' ? 'is-on' : ''}">${ICON('book-open', 'icon icon-sm')} คำทั้งหมด</a></div>`;
    const unitCard = (u, k) => {
      const status = u.completed ? `${ICON('circle-check', 'icon icon-xs')} จบแล้ว${u.bestPct != null ? ` · ${u.bestPct}%` : ''}` : u.step != null ? `Step ${u.step + 1}/${u.stepsTotal}` : 'ยังไม่เริ่ม';
      return `<li><button class="wa-unit${u.completed ? ' is-done' : u.step != null ? ' is-active' : ''}" type="button" data-wa-go="#/atlas/unit/${esc(u.id)}">
        <span class="wa-unit-n">${esc(u.id)}</span>
        <span class="wa-unit-body"><b lang="en">${u.preview.map(esc).join(' · ')}${u.items > u.preview.length ? ' …' : ''}</b>
          <small>${u.items} รายการ · ${u.cefrFrom ? `${esc(u.cefrFrom)}${u.cefrTo && u.cefrTo !== u.cefrFrom ? `–${esc(u.cefrTo)}` : ''}` : 'Unclassified'} · เรียนแล้ว ${u.learned}/${u.items} · ${status}</small>
          <span class="gl-bar tq-bar wk-bar" aria-hidden="true"><span style="width:${pct(u.learned, u.items)}%"></span></span></span>
        ${ICON('chevron-right', 'icon icon-sm')}</button></li>`;
    };
    el.innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('arrow-down-a-z', 'icon icon-sm')} Letter ${letter.toUpperCase()}</p>
        <h1 class="page-title" id="wa-ltitle">ตัวอักษร ${letter.toUpperCase()}</h1>
        <p class="gl-sub">${d.units.length} Unit · เรียงจากคำที่ใช้บ่อยไปหาคำที่ซับซ้อนกว่า (ไม่ใช่เรียงตามตัวอักษร)</p></header>
      ${nav}${tabs}
      <div id="wa-letter-body">${tab === 'units'
    ? (d.units.length ? `<ol class="wa-units">${d.units.map(unitCard).join('')}</ol>` : '<p class="gl-empty">ตัวอักษรนี้ยังไม่มีคำที่ผ่านการตรวจพอจะทำเป็นบทเรียน — ดูรายการคำได้ที่แท็บ "คำทั้งหมด"</p>')
    : ''}</div>`;
    if (tab === 'words') renderList(el.querySelector('#wa-letter-body'), { letter, sort: 'alpha' }, { compact: true });
    focusTitle('wa-ltitle');
  }

  /* ----------------------------------------------------------- รายการคำ (ใช้ร่วม: Browse / ค้นหา / CEFR / Topic) */
  function filtersHtml(q, { hideLetter = false } = {}) {
    const sel = (name, label, opts) => `<label class="wa-f"><span>${label}</span><select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(q[name] || '') === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const topics = (H && H.topics) || [];
    const active = ['cefr', 'pos', 'topic', 'band', 'rel', 'learnable'].filter((k) => q[k]).length + (q.sort && q.sort !== 'alpha' ? 1 : 0);
    return `<form class="wa-filters" data-wa-filter>
      <label class="wa-f wa-fq"><span>ค้นหา (อังกฤษ/ไทย)</span><span class="wa-fq-row"><input type="search" name="q" maxlength="60" value="${esc(q.q || '')}" placeholder="เช่น abandon หรือ ละทิ้ง" />
        <button class="btn btn-primary" type="submit">${ICON('search', 'icon icon-sm')}<span class="sr-only">ค้นหา</span></button></span></label>
      <details class="wa-fmore"${active ? ' open' : ''}><summary>${ICON('funnel', 'icon icon-sm')} ตัวกรองและการเรียง${active ? ` (${active})` : ''}</summary><div class="wa-fgrid">
      ${hideLetter ? '' : sel('letter', 'ตัวอักษร', [['', 'ทั้งหมด'], ...LETTERS.map((L) => [L, L.toUpperCase()])])}
      ${sel('sort', 'เรียง', Object.entries(SORT_TH))}
      ${sel('cefr', 'ระดับ', [['', 'ทุกระดับ'], ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((c) => [c, c]), ['U', 'Unclassified']])}
      ${sel('pos', 'ชนิดคำ', [['', 'ทุกชนิด'], ...['noun', 'verb', 'adjective', 'adverb', 'phrasal verb', 'idiom', 'phrase', 'preposition', 'conjunction', 'pronoun', 'exclamation'].map((p) => [p, posTH(p)])])}
      ${sel('topic', 'หมวด', [['', 'ทุกหมวด'], ...topics.map((t) => [t.id, t.th])])}
      ${sel('band', 'ความถี่', [['', 'ทุกระดับ'], ...Object.entries(BAND_TH)])}
      ${sel('rel', 'ค้นแบบ', [['', 'ขึ้นต้นด้วย'], ['synonym', 'คำพ้องความหมาย']])}
      <label class="wa-f wa-fchk"><input type="checkbox" name="learnable" value="1"${q.learnable === '1' ? ' checked' : ''} /> <span>เฉพาะคำที่เรียนได้</span></label>
      <button class="btn btn-secondary" type="submit">${ICON('funnel', 'icon icon-sm')} ใช้ตัวกรอง</button></div></details></form>`;
  }
  const wordRow = (w) => `<li><button class="wa-row" type="button" data-wa-go="#/atlas/word/${esc(w.id)}">
      <span class="wa-row-main"><b lang="en">${esc(w.display)}</b>${w.ipaUK || w.ipaUS ? ` <span class="wa-ipa">/${esc(w.ipaUK || w.ipaUS)}/</span>` : ''}
        <small>${w.pos ? `${esc(posTH(w.pos))} · ` : ''}${w.thai ? esc(w.thai) : '<i>ยังไม่มีคำแปลไทยที่ตรวจแล้ว</i>'}</small></span>
      <span class="wa-row-meta">${cefrChip(w.cefr)}${w.frequencyBand ? `<span class="wk-chip wa-band b${w.frequencyBand}">${esc(BAND_TH[w.frequencyBand])}</span>` : ''}
        <span class="wa-st st-${esc(w.status)}">${esc(STATUS_TH[w.status] || '')}</span></span></button></li>`;

  async function renderList(box, q, { compact = false } = {}) {
    const state = { q, cursor: null, page: 1, items: [] };
    const draw = (d, append) => {
      state.items = append ? state.items.concat(d.words) : d.words;
      box.innerHTML = `${filtersHtml(q, { hideLetter: compact })}
        <p class="wa-count" role="status">${d.total != null ? `พบ ${d.total.toLocaleString()} คำ` : `แสดง ${state.items.length} คำ`} · เรียง: ${esc(SORT_TH[d.sort])}</p>
        ${state.items.length ? `<ul class="wa-list">${state.items.map(wordRow).join('')}</ul>` : '<p class="gl-empty">ไม่พบคำที่ตรงกับเงื่อนไข</p>'}
        ${d.hasMore ? `<button class="btn btn-secondary wa-more" type="button" data-wa-more>${ICON('chevron-down', 'icon icon-sm')} โหลดเพิ่ม</button>` : ''}`;
      box.querySelector('[data-wa-filter]').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target); const nq = {};
        for (const [k, v] of f.entries()) if (v) nq[k] = String(v);
        if (compact) { nq.letter = q.letter; renderList(box, nq, { compact }); } else go(`#/atlas/browse/${qs(nq)}`);
      });
      const more = box.querySelector('[data-wa-more]');
      if (more) more.addEventListener('click', async () => {
        more.disabled = true;
        try {
          const p = d.nextCursor ? { ...q, cursor: d.nextCursor } : { ...q, page: (state.page += 1) };
          const nd = await api(`/words?${qs(p)}`); draw(nd, true);
        } catch (err) { App().toast(err.message, 'error'); more.disabled = false; }
      });
    };
    loading(box);
    try { draw(await api(`/words?${qs(q)}`), false); } catch (err) { errorBox(box, err, () => renderList(box, q, { compact })); }
  }

  async function openBrowse(q) {
    view = { name: 'browse', q };
    if (!H) { try { H = await api(''); } catch (_) { /* ตัวกรองหมวดว่างได้ */ } }
    const el = root();
    const title = q.q ? `ผลการค้นหา "${q.q}"` : q.topic ? `หมวด ${((H && H.topics.find((t) => t.id === q.topic)) || { th: q.topic }).th}` : q.cefr ? `ระดับ ${q.cefr === 'U' ? 'Unclassified' : q.cefr}` : 'สำรวจคำศัพท์';
    const quizSrc = q.topic ? `source=topic&topic=${encodeURIComponent(q.topic)}` : q.cefr && q.cefr !== 'U' ? `source=cefr&cefr=${q.cefr}` : '';
    el.innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('search', 'icon icon-sm')} Browse</p><h1 class="page-title" id="wa-btitle">${esc(title)}</h1>
        ${quizSrc ? `<button class="btn btn-primary" type="button" data-wa-go="#/atlas/quiz/${esc(quizSrc)}">${ICON('target', 'icon icon-sm')} ฝึกคำชุดนี้</button>` : ''}</header>
      <div id="wa-browse-body"></div>`;
    renderList(el.querySelector('#wa-browse-body'), q);
    focusTitle('wa-btitle');
  }

  /* ----------------------------------------------------------- รายละเอียดคำ */
  async function openWord(id) {
    view = { name: 'word', id };
    const el = root(); loading(el);
    let w;
    try { w = await api(`/words/${encodeURIComponent(id)}`); } catch (err) { errorBox(el, err, () => openWord(id)); return; }
    const linkWords = (list) => list.map((x) => (w.related[String(x).toLowerCase()] ? `<a href="#/atlas/word/${esc(w.related[String(x).toLowerCase()])}" lang="en">${esc(x)}</a>` : `<span lang="en">${esc(x)}</span>`)).join(', ');
    const sense = (s, k) => `<article class="gl-card wa-sense${s.learnable ? '' : ' is-pending'}" aria-labelledby="wa-s${k}">
        <header class="wa-sense-head"><h3 id="wa-s${k}"><span class="wa-sn">${k + 1}</span> ${esc(posTH(s.pos))}${s.senseLabel ? ` <small>(${esc(s.senseLabel)})</small>` : ''}</h3>
          <span class="wa-sense-chips">${cefrChip(s.cefr)}${s.oxfordId ? '<span class="wk-chip wa-ox">Oxford</span>' : ''}${(s.labels || []).filter((l) => LABEL_TH[l]).map((l) => `<span class="wk-chip wa-lab">${esc(LABEL_TH[l])}</span>`).join('')}
            <span class="wa-st st-${esc(s.status)}">${esc(STATUS_TH[s.status] || '')}</span></span></header>
        ${s.thai.length ? `<p class="wa-thai">${esc(s.thai.join(', '))}</p>` : `<p class="wa-thai is-missing">${ICON('hourglass', 'icon icon-xs')} ยังไม่มีคำแปลไทยที่ผ่านการตรวจ — แสดงเฉพาะนิยามภาษาอังกฤษ</p>`}
        ${s.definition ? `<p class="wa-def" lang="en">${esc(s.definition)}</p>` : ''}
        ${s.examples.length ? `<ul class="wa-exs">${s.examples.map((x) => `<li><span lang="en">${esc(x.en)}</span> ${sayBtn(x.en, { label: 'ประโยคตัวอย่าง' })}${x.th ? `<small>${esc(x.th)}</small>` : ''}</li>`).join('')}</ul>` : ''}
        <dl class="wa-dl">
          ${s.synonyms.length ? `<div><dt>Synonyms</dt><dd>${linkWords(s.synonyms)}</dd></div>` : ''}
          ${s.antonyms.length ? `<div><dt>Antonyms</dt><dd>${linkWords(s.antonyms)}</dd></div>` : ''}
          ${s.collocations.length ? `<div><dt>Collocations</dt><dd lang="en">${s.collocations.map(esc).join(' · ')}</dd></div>` : ''}
          ${s.wordFamily.length ? `<div><dt>Word family</dt><dd lang="en">${s.wordFamily.map(esc).join(' · ')}</dd></div>` : ''}
          ${s.phrasalVerbs.length ? `<div><dt>Phrasal verbs</dt><dd lang="en">${s.phrasalVerbs.map(esc).join(' · ')}</dd></div>` : ''}
          ${s.commonMistakes.length ? `<div><dt>ข้อผิดพลาดที่พบบ่อย</dt><dd>${s.commonMistakes.map(esc).join(' · ')}</dd></div>` : ''}
          ${s.usageNote ? `<div><dt>Usage note</dt><dd>${esc(s.usageNote)}</dd></div>` : ''}
          ${s.register ? `<div><dt>Register</dt><dd>${esc(LABEL_TH[s.register] || s.register)}</dd></div>` : ''}
        </dl>
        <footer class="wa-sense-foot"><small>${ICON('info', 'icon icon-xs')} ที่มา: ${esc(s.definitionSource || s.source)}${s.source && /WIKTIONARY/.test(s.source) ? ' (Wiktionary · CC BY-SA 4.0)' : ''} · ${s.verification === 'reviewed' ? 'ผ่านการตรวจโดยผู้ดูแล' : s.verification === 'autoChecked' ? 'ผ่านการตรวจคุณภาพแล้ว' : 'ยังไม่ผ่านการตรวจ (ไม่ใช้ทำแบบฝึกที่ให้คะแนน)'}</small>
          ${s.learnable ? `<button class="mini-btn ghost" type="button" data-wa-review="${esc(s.id)}">${ICON('rotate-ccw', 'icon icon-xs')} Add to Review</button>` : ''}</footer>
      </article>`;
    const learnable = w.senses.filter((s) => s.learnable).length;
    el.innerHTML = `${back(`#/atlas/letter/${w.letter}/words`, `ตัวอักษร ${w.letter.toUpperCase()}`)}
      <header class="wk-hero wa-hero wa-word-hero">
        <p class="gl-kicker">${ICON('book-a', 'icon icon-sm')} ${esc(w.kind === 'phrasal' ? 'Phrasal verb' : w.kind === 'idiom' ? 'Idiom' : w.kind === 'phrase' ? 'Phrase' : 'Word')}${w.frequencyBand ? ` · ${esc(BAND_TH[w.frequencyBand])}` : ''}</p>
        <h1 class="page-title wa-word" id="wa-wtitle" lang="en">${esc(w.display)}</h1>
        <p class="wa-pron">${w.ipaUK ? `<span>UK /${esc(w.ipaUK)}/</span>` : ''}${w.ipaUS ? `<span>US /${esc(w.ipaUS)}/</span>` : ''}
          ${sayBtn(w.display, { url: (w.senses[0] || {}).audioUK, accent: 'UK' })}${sayBtn(w.display, { url: (w.senses[0] || {}).audioUS, accent: 'US' })}</p>
        <p class="wk-chips">${(w.cefrList.length ? w.cefrList : [null]).map(cefrChip).join('')}${w.posList.map((p) => `<span class="wk-chip">${esc(posTH(p))}</span>`).join('')}${(w.topics || []).slice(0, 4).map((t) => `<span class="wk-chip wa-topic">${esc(((H && H.topics.find((x) => x.id === t)) || { th: t }).th)}</span>`).join('')}</p>
        <div class="wa-actions">
          ${w.units.length ? `<button class="btn btn-primary" type="button" data-wa-go="#/atlas/unit/${esc(w.units[0])}">${ICON('book-open-check', 'icon icon-sm')} Learn</button>` : ''}
          ${learnable ? `<button class="btn btn-secondary" type="button" data-wa-go="#/atlas/quiz/${qs({ source: 'lemma', lemmaId: w.id })}">${ICON('target', 'icon icon-sm')} Practice</button>` : ''}
          <button class="btn btn-secondary" type="button" data-wa-save="${esc(w.id)}" aria-pressed="${w.inCollection}">${ICON(w.inCollection ? 'bookmark-check' : 'bookmark', 'icon icon-sm')} ${w.inCollection ? 'บันทึกแล้ว' : 'Save Word'}</button>
        </div>
        ${!learnable ? '<p class="wa-note">คำนี้ยังไม่มีความหมายที่ผ่านการตรวจสำหรับทำแบบฝึก — ดูนิยามและตัวอย่างได้ด้านล่าง</p>' : ''}
      </header>
      <section aria-label="ความหมาย ${w.senses.length} ความหมาย">${w.senses.map(sense).join('')}</section>`;
    focusTitle('wa-wtitle');
  }

  /* ----------------------------------------------------------- บทเรียน Step-by-Step */
  async function openUnit(id) {
    view = { name: 'unit', id };
    const el = root(); loading(el);
    let u;
    try { u = await api(`/units/${encodeURIComponent(id)}`); } catch (err) { errorBox(el, err, () => openUnit(id)); return; }
    lesson = { u, step: u.progress.completed ? 0 : u.progress.step, results: [] };
    renderStep();
  }
  function stepHeader() {
    const { u, step } = lesson; const st = u.steps[step];
    const prog = window.EQLesson && window.EQLesson.progress ? window.EQLesson.progress(step, u.steps.length, { label: 'Step', title: `Unit ${u.id}` })
      : `<p>Step ${step + 1} / ${u.steps.length}</p>`;
    return `${back(`#/atlas/letter/${u.letter}`, `Letter ${u.letter.toUpperCase()} · Learning Map`)}
      <div class="wa-lesson-top"><p class="gl-kicker">${ICON('book-a', 'icon icon-sm')} Unit ${esc(u.id)}</p>${prog}
        <h1 class="page-title wa-step-title" id="wa-stitle">Step ${step + 1} — ${esc(st.title)} <small>${esc(st.th)}</small></h1></div>`;
  }
  async function saveStep(k) { try { await api(`/units/${lesson.u.id}/step`, { method: 'PUT', body: { step: k } }); } catch (_) { /* ออฟไลน์ชั่วคราว: เรียนต่อได้ บันทึกรอบหน้า */ } }
  function nextBtn(label = 'ถัดไป') { return `<div class="gl-actions"><button class="btn btn-primary" type="button" data-wa-step-next>${esc(label)} ${ICON('chevron-right', 'icon icon-sm')}</button></div>`; }
  function wordCard(it, mode) {
    const audio = sayBtn(it.head, { url: it.audioUK, accent: 'UK' }) + sayBtn(it.head, { url: it.audioUS, accent: 'US' });
    if (mode === 'new') return `<li class="gl-card wa-card"><p class="wa-card-w"><b lang="en">${esc(it.head)}</b> ${audio}</p><p class="wk-chips">${cefrChip(it.cefr)}<span class="wk-chip">${esc(posTH(it.pos))}</span></p><p class="wa-thai">${esc(it.thai.join(', '))}</p></li>`;
    if (mode === 'meaning') return `<li class="gl-card wa-card"><p class="wa-card-w"><b lang="en">${esc(it.head)}</b> <span class="wk-chip">${esc(posTH(it.pos))}</span></p><p class="wa-thai">${esc(it.thai.join(', '))}</p>${it.definition ? `<p class="wa-def" lang="en">${esc(it.definition)}</p>` : ''}${it.synonyms.length ? `<p class="wa-mini"><b>ใกล้เคียง:</b> <span lang="en">${it.synonyms.slice(0, 4).map(esc).join(', ')}</span></p>` : ''}</li>`;
    if (mode === 'pron') return `<li class="gl-card wa-card wa-pron-card"><p class="wa-card-w"><b lang="en">${esc(it.head)}</b></p><p class="wa-pron">${it.ipaUK ? `<span>UK /${esc(it.ipaUK)}/</span>` : ''}${it.ipaUS ? `<span>US /${esc(it.ipaUS)}/</span>` : ''}</p><p>${audio}</p></li>`;
    return `<li class="gl-card wa-card"><p class="wa-card-w"><b lang="en">${esc(it.head)}</b> — ${esc(it.thai[0] || '')}</p>${it.examples.slice(0, 2).map((x) => `<p class="wa-ex"><span lang="en">${esc(x.en)}</span> ${sayBtn(x.en, { label: 'ประโยคตัวอย่าง' })}${x.th ? `<small>${esc(x.th)}</small>` : ''}</p>`).join('')}</li>`;
  }
  function renderStep() {
    const el = root(); const { u, step } = lesson; const st = u.steps[step];
    if (st.quiz) { startStepQuiz(); return; }
    if (st.k === 'complete') { finishUnit(); return; }
    const intro = { new: `บทเรียนนี้มี ${u.items.length} รายการ ฟังเสียงและอ่านคำแปลก่อน`, meaning: 'ความหมาย นิยาม และคำใกล้เคียง', pronunciation: 'กดฟังสำเนียง UK / US แล้วพูดตาม', examples: 'อ่านประโยคตัวอย่าง แล้วสังเกตการใช้คำในบริบทจริง' }[st.k] || '';
    const items = st.k === 'examples' ? u.items.filter((x) => x.examples.length) : u.items;
    const mode = { new: 'new', meaning: 'meaning', pronunciation: 'pron', examples: 'ex' }[st.k];
    el.innerHTML = `${stepHeader()}<p class="gl-sub">${esc(intro)}</p><ul class="wa-cards">${items.map((it) => wordCard(it, mode)).join('')}</ul>${nextBtn(u.steps[step + 1] && u.steps[step + 1].quiz ? 'เริ่มแบบฝึก' : 'ถัดไป')}`;
    focusTitle('wa-stitle');
  }
  async function startStepQuiz() {
    const el = root(); const { u, step } = lesson;
    loading(el);
    try {
      const s = await api('/sessions', { method: 'POST', body: { kind: 'unit', unitId: u.id, step } });
      quiz = { s, i: 0, fb: null, results: [], ctx: { kind: 'unit' } };
      renderQ();
    } catch (err) { errorBox(el, err, startStepQuiz); }
  }
  async function finishUnit() {
    const el = root(); loading(el);
    let r;
    try { r = await api(`/units/${lesson.u.id}/complete`, { method: 'POST', body: {} }); } catch (err) {
      if (err && /ไม่ครบ/.test(err.message || '')) { App().toast('ยังทำแบบฝึกบางขั้นไม่ครบ — พากลับไปขั้นแรกที่ยังไม่ได้ทำ', 'info'); lesson.step = lesson.u.steps.findIndex((x) => x.quiz); renderStep(); return; }
      errorBox(el, err, finishUnit); return;
    }
    if (window.EQLesson && window.EQLesson.expReward) window.EQLesson.expReward({ exp: r.gainedExp, levelInfo: r.levelInfo, leveledUp: r.leveledUp });
    const u = lesson.u;
    el.innerHTML = `${back(`#/atlas/letter/${u.letter}`, `Letter ${u.letter.toUpperCase()} · Learning Map`)}
      <header class="tq-res-hero"><p class="gl-kicker">${ICON('party-popper', 'icon icon-sm')} Lesson Complete — Unit ${esc(u.id)}</p>
        <h1 class="page-title" id="wa-ctitle">${r.pct >= 90 ? 'ยอดเยี่ยม!' : r.pct >= 60 ? 'เก่งมาก!' : 'จบบทเรียนแล้ว — ทบทวนอีกนิดจะจำได้แม่นขึ้น'}</h1>
        <div class="tq-score"><b>${r.correct}</b><span>/ ${r.total}</span></div>
        <p class="tq-score-label">ตอบถูก ${r.pct}% · เรียนแล้ว ${r.learned}/${r.items} รายการ</p>
        <p class="wa-reward">${r.gainedExp ? `${ICON('zap', 'icon icon-sm')} รางวัลจบ Unit +${r.gainedExp} EXP${r.rewards.some((x) => /perfect/.test(x.eventId)) ? ' (รวมโบนัสทำถูกทุกข้อ)' : ''}` : 'รางวัลจบ Unit นี้รับไปแล้ว — EXP จากข้อที่ทบทวนตามรอบยังได้ตามกติกาเดิม'}</p></header>
      <div class="gl-actions">
        ${u.nextUnit ? `<button class="btn btn-primary" type="button" data-wa-go="#/atlas/unit/${esc(u.nextUnit)}">Unit ถัดไป ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
        <button class="btn btn-secondary" type="button" data-wa-go="#/atlas/letter/${u.letter}">${ICON('map', 'icon icon-sm')} Learning Map</button></div>`;
    lesson = null; quiz = null;
    focusTitle('wa-ctitle');
  }

  /* ----------------------------------------------------------- แบบฝึก (ใช้ร่วม: บทเรียน / Quiz / Review) */
  async function startQuiz(q) {
    view = { name: 'quiz', q };
    const el = root(); loading(el);
    try {
      const body = { kind: q.source === 'review' ? 'review' : 'quiz', ...q };
      const s = await api('/sessions', { method: 'POST', body });
      quiz = { s, i: 0, fb: null, results: [], ctx: { kind: 'quiz', q } };
      renderQ();
    } catch (err) {
      el.innerHTML = `${back('#/atlas', 'Word Atlas')}<div class="gl-empty" role="status">${ICON('info', 'icon icon-lg')}<p>${esc(err.message || 'เริ่มแบบฝึกไม่สำเร็จ')}</p>
        <button class="btn btn-secondary" type="button" data-wa-go="#/atlas">กลับหน้า Word Atlas</button></div>`;
    }
  }
  function quizName(q) {
    if (q.source === 'letter') return `ตัวอักษร ${String(q.letter || '').toUpperCase()}`;
    if (q.source === 'cefr') return `ระดับ ${q.cefr}`;
    if (q.source === 'topic') return `หมวด${((H && H.topics.find((t) => t.id === q.topic)) || { th: ` ${q.topic}` }).th}`;
    return SOURCE_TH[q.source] || 'แบบฝึก';
  }
  const QLABEL = {
    meaning: 'คำนี้แปลว่าอะไร', idiom: 'สำนวนนี้หมายความว่าอะไร', phrasal: 'Phrasal verb นี้หมายความว่าอะไร', reverse: 'เลือกคำภาษาอังกฤษที่ตรงกับความหมาย',
    listen: 'ฟังแล้วเลือกคำที่ได้ยิน', definition: 'เดาคำจากนิยาม (Context Meaning)', fill: 'เติมคำในช่องว่าง', collocation: 'เติมคำให้เป็นวลีที่ใช้คู่กัน (Collocation)',
    synonym: 'คำใดมีความหมายใกล้เคียงที่สุด (Synonym)', antonym: 'คำใดมีความหมายตรงข้าม (Antonym)', formation: 'เลือกรูปคำที่ถูกต้อง (Word Formation)',
    spell: 'พิมพ์คำภาษาอังกฤษ (Spelling)', match: 'จับคู่คำกับความหมาย (Matching)',
  };
  function qPrompt(q) {
    const blank = (s) => esc(s).replace('_____', '<span class="wk-blank" aria-label="ช่องว่าง">_____</span>');
    if (['meaning', 'idiom', 'phrasal'].includes(q.type)) return `<p class="tv-word wa-qword"><span lang="en">${esc(q.word)}</span> ${sayBtn(q.speak || q.word)}</p>${q.ipa ? `<p class="wa-ipa">/${esc(q.ipa)}/</p>` : ''}<p class="wk-chips"><span class="wk-chip">${esc(posTH(q.pos))}</span></p>`;
    if (q.type === 'reverse') return `<p class="tv-word tv-th">${esc(q.promptTH)}</p><p class="wk-chips"><span class="wk-chip">${esc(posTH(q.pos))}</span></p>`;
    if (q.type === 'listen') return `<p class="wa-listen"><button class="btn btn-primary wa-play" type="button" data-wa-say="${esc(q.speak)}" data-wa-url="${esc(q.audio || '')}" data-wa-accent="US">${ICON('volume-2', 'icon')} ฟังอีกครั้ง</button></p>`;
    if (q.type === 'definition') return `<p class="wa-qdef" lang="en">${esc(q.definition)}</p><p class="wk-chips"><span class="wk-chip">${esc(posTH(q.pos))}</span></p>`;
    if (q.type === 'fill') return `<p class="wk-cloze" lang="en">${blank(q.sentence)}</p>${q.promptTH ? `<p class="wa-hint">คำใบ้: ${esc(q.promptTH)}</p>` : ''}`;
    if (q.type === 'collocation') return `<p class="wk-cloze" lang="en">${blank(q.collocation)}</p>${q.promptTH ? `<p class="wa-hint">คำใบ้: ${esc(q.promptTH)}</p>` : ''}`;
    if (q.type === 'synonym' || q.type === 'antonym') return `<p class="tv-word wa-qword"><span lang="en">${esc(q.word)}</span></p>${q.thai ? `<p class="wa-hint">${esc(q.thai)}</p>` : ''}`;
    if (q.type === 'formation') return `<p class="wa-qdef">รูป <b>${esc(posTH(q.targetPos))}</b> ของคำว่า <b lang="en">${esc(q.word)}</b> คือข้อใด</p>`;
    if (q.type === 'spell') return `<p class="tv-word tv-th">${esc(q.promptTH)}</p><p class="wa-hint">ขึ้นต้นด้วย "${esc(q.hint.first)}" · ${q.hint.length} ตัวอักษร ${sayBtn(q.speak)}</p>`;
    return '';
  }
  function renderQ() {
    const el = root(); const { s, i, fb } = quiz; const q = s.questions[i];
    const head = quiz.ctx.kind === 'unit' ? stepHeader() : `${back('#/atlas', 'เลือกหมวดอื่น')}
      <p class="gl-kicker">${ICON('target', 'icon icon-sm')} ทายความหมาย · ${esc(quizName(quiz.ctx.q || {}))}</p>`;
    let body;
    if (q.type === 'spell') {
      body = `<form class="wa-spell" data-wa-spell><label class="sr-only" for="wa-spell-in">พิมพ์คำตอบ</label>
        <input id="wa-spell-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" lang="en" ${fb ? 'disabled' : ''} value="${esc(fb ? fb.typed || '' : '')}" />
        ${fb ? '' : `<button class="btn btn-primary" type="submit">ตรวจคำตอบ</button>`}</form>`;
    } else if (q.type === 'match') {
      const sel = quiz.match || {};
      const L = q.left.map((x) => { const paired = sel.pairs && sel.pairs[x.key]; const st = fb ? (fb.pairs[x.key] === (sel.pairs || {})[x.key] ? ' is-right' : ' is-wrong') : sel.left === x.key ? ' is-sel' : paired ? ' is-paired' : '';
        return `<li><button class="wa-mbtn${st}" type="button" data-wa-ml="${esc(x.key)}" lang="en" ${fb ? 'disabled' : ''}>${esc(x.text)}${paired ? ` <small>→ ${esc((q.right.find((r) => r.key === paired) || {}).text || '')}</small>` : ''}</button></li>`; }).join('');
      const used = new Set(Object.values(sel.pairs || {}));
      const R = q.right.map((x) => `<li><button class="wa-mbtn${used.has(x.key) ? ' is-paired' : ''}" type="button" data-wa-mr="${esc(x.key)}" ${fb ? 'disabled' : ''}>${esc(x.text)}</button></li>`).join('');
      body = `<p class="wa-hint">แตะคำอังกฤษ แล้วแตะความหมายที่คู่กัน (แตะคำเดิมซ้ำเพื่อเปลี่ยน)</p><div class="wa-match"><ul>${L}</ul><ul>${R}</ul></div>
        ${fb ? '' : `<button class="btn btn-primary" type="button" data-wa-match-send ${Object.keys(sel.pairs || {}).length === q.left.length ? '' : 'disabled'}>ตรวจคำตอบ</button>`}`;
    } else {
      const thOpts = ['meaning', 'idiom', 'phrasal'].includes(q.type);
      body = `<ul class="wk-opts">${q.options.map((o, k) => {
        let cls = '';
        if (fb) { if (o.key === fb.correctKey) cls = ' is-right'; else if (o.key === q.selected) cls = ' is-wrong'; }
        return `<li><button class="wk-opt${cls}" type="button" data-wa-opt="${esc(o.key)}" ${fb ? 'disabled' : ''}${thOpts ? '' : ' lang="en"'}><span class="wk-opt-k">${'ABCDE'[k]}</span><span>${esc(o.text)}</span></button></li>`;
      }).join('')}</ul>`;
    }
    const w = fb && fb.words && fb.words[0];
    const expTxt = fb ? (fb.gainedExp ? `+${fb.gainedExp} EXP` : fb.noExpReason === 'cooldown' ? 'ความหมายนี้ได้ EXP ไปแล้วใน 20 ชม. — ทบทวนต่อได้ ความคืบหน้ายังนับ' : fb.noExpReason === 'repeat' ? 'ข้อนี้ไม่ได้ EXP ซ้ำ — ความคืบหน้ายังนับ' : fb.noExpReason === 'too_fast' ? 'ไม่ได้ EXP — ตอบเร็วเกินกว่าคนอ่านโจทย์ทัน · ความคืบหน้ายังนับ' : '') : '';
    el.innerHTML = `${head}
      <div class="wk-qtop"><b id="wa-qtitle">ข้อ ${i + 1} / ${s.total}</b><span class="gl-bar tq-bar" aria-hidden="true"><span style="width:${(i / s.total) * 100}%"></span></span></div>
      <section class="gl-card wk-q" aria-labelledby="wa-qtitle"><p class="wk-qlabel">${esc(QLABEL[q.type] || '')}</p>${qPrompt(q)}${body}
        ${fb ? `<div class="wk-fb ${fb.correct ? 'is-right' : 'is-wrong'}" role="status"><b>${fb.correct ? `${ICON('circle-check', 'icon icon-sm')} ถูกต้อง` : `${ICON('circle-x', 'icon icon-sm')} ยังไม่ถูก${fb.correctText ? ` — คำตอบคือ <span lang="en">${esc(fb.correctText)}</span>` : ''}`}</b>
          ${w && q.type !== 'match' ? `<p><b lang="en">${esc(w.head)}</b>${w.ipa ? ` <span class="wa-ipa">/${esc(w.ipa)}/</span>` : ''} = ${esc((w.thai || []).join(', '))} <span class="wk-chip">${esc(posTH(w.pos))}</span></p>
            ${w.example ? `<p class="wk-fb-ex" lang="en">${esc(w.example.en)} ${sayBtn(w.example.en, { label: 'ประโยคตัวอย่าง' })}</p>${w.example.th ? `<small>${esc(w.example.th)}</small>` : ''}` : ''}` : ''}
          ${expTxt ? `<p class="wa-exp">${ICON('zap', 'icon icon-xs')} ${esc(expTxt)}</p>` : ''}</div>
          <button class="btn btn-primary wk-next" type="button" data-wa-next>${i + 1 < s.total ? 'ข้อต่อไป' : quiz.ctx.kind === 'unit' ? 'ไปขั้นถัดไป' : 'ดูผล'} ${ICON('chevron-right', 'icon icon-sm')}</button>` : ''}
      </section>`;
    if (!fb && q.type === 'listen') setTimeout(() => play(q.audio, q.speak, 'US'), 250);
    focusTitle('wa-qtitle');
    if (!fb && q.type === 'spell') { const inp = el.querySelector('#wa-spell-in'); if (inp) setTimeout(() => inp.focus(), 50); }
  }
  async function sendAnswer(body, extra = {}) {
    const { s, i } = quiz;
    try {
      const r = await api(`/sessions/${s.sessionId}/answer`, { method: 'POST', body: { i, ...body } });
      Object.assign(s.questions[i], extra);
      quiz.fb = { ...r, typed: body.text };
      quiz.results.push(r.correct);
      if (window.EQLesson && window.EQLesson.expReward) window.EQLesson.expReward({ exp: r.gainedExp, levelInfo: r.levelInfo, leveledUp: r.leveledUp });
      renderQ();
      const nx = root().querySelector('[data-wa-next]'); if (nx) nx.focus();
    } catch (err) { App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ', 'error'); }
  }
  function nextQ() {
    if (quiz.i + 1 < quiz.s.total) { quiz.i += 1; quiz.fb = null; quiz.match = null; renderQ(); return; }
    if (quiz.ctx.kind === 'unit') { lesson.step += 1; saveStep(lesson.step); quiz = null; renderStep(); return; }
    const ok = quiz.results.filter(Boolean).length; const n = quiz.results.length; const q = quiz.ctx.q || {};
    root().innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="tq-res-hero"><p class="gl-kicker">${ICON('target', 'icon icon-sm')} ทายความหมาย · ${esc(quizName(q))}</p>
        <h1 class="page-title" id="wa-rtitle">${pct(ok, n) >= 80 ? 'เยี่ยมมาก!' : pct(ok, n) >= 50 ? 'ดีแล้ว ฝึกต่ออีกนิด' : 'ลองทบทวนอีกรอบ'}</h1>
        <div class="tq-score"><b>${ok}</b><span>/ ${n}</span></div><p class="tq-score-label">คำที่ตอบผิดจะกลับมาให้ทวนในรอบถัดไป</p></header>
      <div class="gl-actions"><button class="btn btn-primary" type="button" data-wa-go="#/atlas/quiz/${esc(qs(q))}">${ICON('refresh-cw', 'icon icon-sm')} ฝึกอีกชุด</button>
        <button class="btn btn-secondary" type="button" data-wa-go="#/atlas">${ICON('arrow-down-a-z', 'icon icon-sm')} เลือกหมวดอื่น</button></div>`;
    quiz = null;
    focusTitle('wa-rtitle');
  }

  /* ----------------------------------------------------------- Review / Collection / CEFR / Topics */
  async function openReview() {
    view = { name: 'review' };
    const el = root(); loading(el);
    let d;
    try { d = await api('/review'); } catch (err) { errorBox(el, err, openReview); return; }
    el.innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('rotate-ccw', 'icon icon-sm')} Review Mistakes</p><h1 class="page-title" id="wa-rvtitle">ทบทวนคำที่ผิดและถึงกำหนด</h1>
        <p class="gl-sub">ใช้ระบบทบทวนเดียวกับคำศัพท์ Oxford · ถึงกำหนด ${d.count.due} · เคยตอบผิด ${d.count.mistakes}</p>
        ${d.items.length ? `<button class="btn btn-primary" type="button" data-wa-go="#/atlas/quiz/source=review">${ICON('target', 'icon icon-sm')} เริ่มทบทวน</button>` : ''}</header>
      ${d.items.length ? `<ul class="wa-list">${d.items.map((s) => `<li><button class="wa-row" type="button" data-wa-go="#/atlas/word/${esc(s.lemmaId)}"><span class="wa-row-main"><b lang="en">${esc(s.head)}</b><small>${esc(posTH(s.pos))} · ${esc(s.thai.join(', '))}</small></span>
        <span class="wa-row-meta">${cefrChip(s.cefr)}<span class="wa-st st-${esc(s.status)}">${esc(STATUS_TH[s.status] || '')}</span><small>ถูก ${s.timesCorrect}/${s.timesSeen}</small></span></button></li>`).join('')}</ul>`
    : `<div class="gl-empty">${ICON('circle-check', 'icon icon-lg')}<p>ยังไม่มีคำค้างทบทวน — เรียน Unit ใหม่หรือทำ Quiz ได้เลย</p></div>`}`;
    focusTitle('wa-rvtitle');
  }
  async function openCollection() {
    view = { name: 'collection' };
    const el = root(); loading(el);
    let d;
    try { d = await api('/collection'); } catch (err) { errorBox(el, err, openCollection); return; }
    el.innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('bookmark', 'icon icon-sm')} My Word Collection</p><h1 class="page-title" id="wa-cotitle">คำที่บันทึกไว้ (${d.words.length})</h1>
        ${d.words.some((w) => w.learnable) ? `<button class="btn btn-primary" type="button" data-wa-go="#/atlas/quiz/source=collection">${ICON('target', 'icon icon-sm')} ฝึกคำที่บันทึกไว้</button>` : ''}</header>
      ${d.words.length ? `<ul class="wa-list">${d.words.map(wordRow).join('')}</ul>` : `<div class="gl-empty">${ICON('bookmark', 'icon icon-lg')}<p>ยังไม่มีคำที่บันทึกไว้ — กด "Save Word" ในหน้าคำศัพท์</p></div>`}`;
    focusTitle('wa-cotitle');
  }
  function openCefr() {
    view = { name: 'cefr' };
    const desc = { A1: 'เริ่มต้น', A2: 'พื้นฐาน', B1: 'ระดับกลาง', B2: 'กลางค่อนสูง', C1: 'สูง', C2: 'เชี่ยวชาญ' };
    root().innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} Learn by CEFR</p><h1 class="page-title" id="wa-cetitle">เรียนตามระดับ CEFR</h1>
        <p class="gl-sub">เลือกระดับแล้วเริ่มทายความหมาย 5 ตัวเลือกทันที · ระดับมาจาก Oxford 3000/5000 และคลัง C2 ของ EnglishQuest เท่านั้น (ไม่เดาระดับ)</p></header>
      <ul class="wa-menu wa-cefr-grid">${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((c) => `<li><button class="wa-menu-btn" type="button" data-wa-go="#/atlas/quiz/source=cefr&cefr=${c}">
        <span class="wa-cefr-big">${c}</span><span><b>${desc[c]}</b><small>ทายความหมาย 5 ตัวเลือก</small></span></button></li>`).join('')}
        <li><button class="wa-menu-btn" type="button" data-wa-go="#/atlas/browse/cefr=U&sort=common"><span class="wa-cefr-big">?</span><span><b>Unclassified</b><small>ดูรายการคำที่ยังไม่มีระดับที่ตรวจสอบได้</small></span></button></li></ul>`;
    focusTitle('wa-cetitle');
  }
  async function openTopics() {
    view = { name: 'topics' };
    const el = root(); loading(el);
    let t;
    try { t = await api('/topics'); } catch (err) { errorBox(el, err, openTopics); return; }
    el.innerHTML = `${back('#/atlas', 'Word Atlas')}
      <header class="wk-hero wa-hero"><p class="gl-kicker">${ICON('compass', 'icon icon-sm')} Learn by Topics</p><h1 class="page-title" id="wa-totitle">เรียนตามหมวด</h1>
        <p class="gl-sub">เลือกหมวดแล้วเริ่มทายความหมาย 5 ตัวเลือกทันที · คำหนึ่งอยู่ได้หลายหมวด</p></header>
      <ul class="wa-menu wa-topic-grid">${t.map((x) => `<li><button class="wa-menu-btn" type="button" data-wa-go="#/atlas/quiz/source=topic&topic=${esc(x.id)}" ${x.learnable ? '' : 'disabled'}>
        <span><b>${esc(x.th)}</b><small lang="en">${esc(x.en)}</small><small>ทายความหมาย · ${x.learnable.toLocaleString()} ความหมาย</small></span></button></li>`).join('')}</ul>`;
    focusTitle('wa-totitle');
  }

  /* ----------------------------------------------------------- Events */
  document.addEventListener('click', async (e) => {
    const t = e.target; if (!t.closest) return;
    const scr = document.getElementById('screen-atlas');
    let b = t.closest('[data-wa-open]');
    if (b) { go('#/atlas'); return; }
    if (!scr || !scr.contains(t)) return;
    b = t.closest('[data-wa-say]');
    if (b) { play(b.dataset.waUrl, b.dataset.waSay, b.dataset.waAccent); return; }
    b = t.closest('[data-wa-go]');
    if (b) { go(b.dataset.waGo); return; }
    b = t.closest('[data-wa-step-next]');
    if (b && lesson) { lesson.step += 1; saveStep(lesson.step); renderStep(); return; }
    b = t.closest('[data-wa-opt]');
    if (b && quiz && !quiz.fb) { b.disabled = true; sendAnswer({ key: b.dataset.waOpt }, { selected: b.dataset.waOpt }); return; }
    b = t.closest('[data-wa-ml]');
    if (b && quiz && !quiz.fb) { const m = quiz.match || (quiz.match = { pairs: {} }); const k = b.dataset.waMl; if (m.pairs[k]) delete m.pairs[k]; m.left = k; renderQ(); return; }
    b = t.closest('[data-wa-mr]');
    if (b && quiz && !quiz.fb && quiz.match && quiz.match.left) {
      const m = quiz.match; const r = b.dataset.waMr;
      Object.keys(m.pairs).forEach((k) => { if (m.pairs[k] === r) delete m.pairs[k]; });
      m.pairs[m.left] = r; m.left = null; renderQ(); return;
    }
    b = t.closest('[data-wa-match-send]');
    if (b && quiz && !quiz.fb) { b.disabled = true; sendAnswer({ pairs: quiz.match.pairs }); return; }
    b = t.closest('[data-wa-next]');
    if (b && quiz) { nextQ(); return; }
    b = t.closest('[data-wa-save]');
    if (b) {
      const on = b.getAttribute('aria-pressed') !== 'true'; b.disabled = true;
      try { await api(`/collection/${b.dataset.waSave}`, { method: on ? 'PUT' : 'DELETE' }); b.setAttribute('aria-pressed', String(on)); b.innerHTML = `${ICON(on ? 'bookmark-check' : 'bookmark', 'icon icon-sm')} ${on ? 'บันทึกแล้ว' : 'Save Word'}`; App().toast(on ? 'บันทึกคำแล้ว' : 'นำออกจากคำที่บันทึกแล้ว', 'success'); }
      catch (err) { App().toast(err.message, 'error'); }
      b.disabled = false; return;
    }
    b = t.closest('[data-wa-review]');
    if (b) {
      b.disabled = true;
      try { await api(`/review/${b.dataset.waReview}`, { method: 'POST', body: {} }); b.innerHTML = `${ICON('circle-check', 'icon icon-xs')} อยู่ในรายการทบทวนแล้ว`; App().toast('เพิ่มเข้ารายการทบทวนแล้ว', 'success'); }
      catch (err) { App().toast(err.message, 'error'); b.disabled = false; }
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.matches && f.matches('[data-wa-search]')) {
      e.preventDefault();
      const v = String(new FormData(f).get('q') || '').trim();
      if (v) go(`#/atlas/browse/${qs({ q: v, sort: 'alpha' })}`);
    } else if (f.matches && f.matches('[data-wa-spell]') && quiz && !quiz.fb) {
      e.preventDefault();
      const v = f.querySelector('input').value.trim();
      if (v) sendAnswer({ text: v });
    }
  });

  window.EQWordAtlas = { open, _state: () => ({ view, lesson, quiz }) };
})();
