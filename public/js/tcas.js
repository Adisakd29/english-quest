/* =====================================================================
   ติวสอบ TCAS — TGAT1 การสื่อสารภาษาอังกฤษ / A-Level ภาษาอังกฤษ (v1.19.0) — window.EQTcas
     #/tcas              หน้ารวม: เลือกข้อสอบ · สอบจำลองจับเวลา · ฝึกทีละส่วน · ประวัติ
     #/tcas-play/<id>    ทำข้อสอบ (ทีละบทความ/บทสนทนา) · ผลคะแนน · ดูเฉลย
   เฉลย/คำอธิบายมาจากเซิร์ฟเวอร์หลังตอบ (ฝึก) หรือหลังส่ง (สอบจำลอง) เท่านั้น · ข้อความทุกชิ้นผ่าน esc()
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/tcas${p}`, o);
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => document.getElementById('screen-tcas-root');
  const L = 'ABCD';
  const REASONS = { wrong_key: 'เฉลยผิด', ambiguous: 'มีคำตอบถูกมากกว่า 1 ข้อ', typo: 'พิมพ์ผิด/ข้อความไม่ชัด', explanation: 'คำอธิบายไม่ถูกต้อง', other: 'อื่น ๆ' };

  let exam = 'tgat1';
  // v1.19.2 สอบจำลอง: เฉลยทันทีหลังตอบแต่ละข้อ (ค่าเริ่มต้น) · ปิด = เฉลยตอนส่งเหมือนสอบจริง
  let instantPref = true;
  try { if (localStorage.getItem('eq_tcas_instant') === '0') instantPref = false; } catch (_) { /* โหมดส่วนตัว */ }
  try { exam = localStorage.getItem('eq_tcas_exam') || 'tgat1'; } catch (_) { /* โหมดส่วนตัว */ }
  let S = null;          // session ปัจจุบัน
  let gi = 0;            // index กลุ่มที่แสดง
  let reviewing = false; // ดูเฉลยหลังส่ง
  let timer = null;
  let skew = 0;          // เวลาเครื่อง - เวลาเซิร์ฟเวอร์

  const setHash = (t) => { if (location.hash !== t) history.replaceState(null, '', t); };
  const focusEl = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); } catch (_) { return ''; } };
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  /* ---------------- v1.19.1 ฟังบทสนทนา (ตัวเสริม — ส่วน Listening & Speaking ของ A-Level) ----------------
     ข้อสอบจริง (blueprint TCAS) ส่วนนี้เป็นบทสนทนาตัวอักษร ไม่มีเสียง → แอปแสดงบทสนทนาตามปกติเป็นค่าเริ่มต้น
     ปุ่ม "ฟังบทสนทนา" = ฝึกฟัง/ออกเสียงเพิ่ม ด้วยเสียงสังเคราะห์ในเบราว์เซอร์ (ฟรี) · ผู้พูดต่างคนเสียงต่างกัน · ช่องว่าง = เสียงบี๊บ
     ผู้เรียนเลือก "ซ่อนบทสนทนา" เพื่อฝึกฟังอย่างเดียวได้ (จำค่าไว้) · ดูเฉลยหลังส่งแสดงบทสนทนาเสมอ */
  const TTS_OK = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  let listenPref = false;      // true = ซ่อนบทสนทนา ฝึกฟังอย่างเดียว (ผู้เรียนเลือกเอง)
  let listenRate = 1;          // 1 | 0.8
  let listenVoice = '';        // v1.19.2 ชื่อเสียงที่ผู้เรียนเลือก ('' = อัตโนมัติ: ผู้พูดต่างคนต่างเสียง)
  try { const p = JSON.parse(localStorage.getItem('eq_tcas_listen') || '{}'); if (p.hide === true) listenPref = true; if (p.rate === 0.8) listenRate = 0.8; if (typeof p.voice === 'string') listenVoice = p.voice.slice(0, 200); } catch (_) { /* โหมดส่วนตัว */ }
  const saveListen = () => { try { localStorage.setItem('eq_tcas_listen', JSON.stringify({ hide: listenPref, rate: listenRate, voice: listenVoice })); } catch (_) { /* โหมดส่วนตัว */ } };
  let showText = false;        // แสดงบทสนทนาในกลุ่มนี้ (รีเซ็ตเมื่อเปลี่ยนกลุ่ม)
  let play = null;             // { token, groupId }
  let beepCtx = null;
  const isListenGroup = (g) => Boolean(S && g && g.section === 'listening_speaking' && g.dialogue);
  function enVoices() {
    const v = TTS_OK ? window.speechSynthesis.getVoices().filter((x) => /^en[-_]/i.test(x.lang)) : [];
    const pref = (x) => (/^en[-_](US|GB)/i.test(x.lang) ? 0 : 1) + (x.localService ? 0 : 0.5);
    return v.sort((a, b) => pref(a) - pref(b));
  }
  function beep() {
    return new Promise((res) => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { setTimeout(res, 900); return; }
        beepCtx = beepCtx || new AC();
        const o = beepCtx.createOscillator(); const gn = beepCtx.createGain();
        o.frequency.value = 880; gn.gain.value = 0.08;
        o.connect(gn); gn.connect(beepCtx.destination);
        o.start(); o.stop(beepCtx.currentTime + 0.35);
      } catch (_) { /* ไม่มีเสียงบี๊บก็เว้นจังหวะแทน */ }
      setTimeout(res, 1100);
    });
  }
  function sayLine(text, voice, pitch, token) {
    return new Promise((res) => {
      if (!play || play.token !== token) { res(); return; }
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.rate = 0.95 * listenRate; u.pitch = pitch;
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      u.onend = fin; u.onerror = fin;
      // กันเบราว์เซอร์ไม่ส่ง onend: ประมาณเวลาอ่านจากจำนวนคำ
      setTimeout(fin, 2500 + (text.split(/\s+/).length * 600) / listenRate);
      window.speechSynthesis.speak(u);
    });
  }
  function stopAudio() {
    play = null;
    if (TTS_OK) window.speechSynthesis.cancel();
    if (window.EQAudio) window.EQAudio.duck(false);
    const b = document.querySelector('[data-tc-play]');
    if (b) { b.innerHTML = `${ICON('volume-2', 'icon icon-sm')} ฟังบทสนทนา`; b.setAttribute('aria-pressed', 'false'); }
    const st = document.getElementById('tc-listen-st'); if (st) st.textContent = '';
  }
  async function playDialogue(g, btn) {
    if (play) { stopAudio(); return; }
    const token = Date.now(); play = { token, groupId: g.id };
    btn.innerHTML = `${ICON('pause', 'icon icon-sm')} หยุด`; btn.setAttribute('aria-pressed', 'true');
    if (window.EQAudio) window.EQAudio.duck(true);
    window.speechSynthesis.cancel();
    const voices = enVoices();
    const chosen = listenVoice ? voices.find((v) => v.name === listenVoice) : null;
    const speakers = [...new Set(g.dialogue.map((l) => l.speaker))];
    // เลือกเสียงเอง: ทุกคนใช้เสียงนั้น ต่างกันที่ระดับเสียง · อัตโนมัติ: ผู้พูดต่างคนใช้เสียงต่างกัน (ถ้าเครื่องมีหลายเสียง)
    const cast = Object.fromEntries(speakers.map((sp, i) => [sp, chosen ? { voice: chosen, pitch: [1, 1.3, 0.85][i % 3] } : {
      voice: voices.length ? voices[i % Math.min(voices.length, 3)] : null,
      pitch: voices.length > 1 ? 1 : [1, 1.3, 0.85][i % 3],
    }]));
    const st = document.getElementById('tc-listen-st');
    for (let k = 0; k < g.dialogue.length; k += 1) {
      if (!play || play.token !== token) return;
      if (st) st.textContent = `กำลังเล่น ${k + 1}/${g.dialogue.length}`;
      const l = g.dialogue[k]; const c = cast[l.speaker];
      const parts = l.text.split(/(___\d+___)/);
      for (const part of parts) {
        if (!play || play.token !== token) return;
        if (/^___\d+___$/.test(part)) await beep();
        else if (part.trim()) await sayLine(part.trim(), c.voice, c.pitch, token);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    if (play && play.token === token) { stopAudio(); const s2 = document.getElementById('tc-listen-st'); if (s2) s2.textContent = 'เล่นจบแล้ว — กดฟังซ้ำได้'; }
  }
  // รายการเสียงโหลดแบบ async ในบางเบราว์เซอร์ -> เติมใหม่เมื่อ voiceschanged
  const voicesReady = () => TTS_OK && window.speechSynthesis.getVoices().length > 0;
  function voiceOptions() {
    const v = enVoices();
    const opts = [`<option value="">อัตโนมัติ (ผู้พูดต่างคนต่างเสียง)</option>`]
      .concat(v.map((x) => `<option value="${esc(x.name)}"${x.name === listenVoice ? ' selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`));
    return opts.join('');
  }
  function refreshVoices() {
    const sel = document.querySelector('[data-tc-voice]');
    if (sel) sel.innerHTML = voiceOptions();
    const w = document.getElementById('tc-voice-warn');
    if (w) w.hidden = enVoices().length > 0 || !voicesReady();
  }
  if (TTS_OK && typeof window.speechSynthesis.addEventListener === 'function') window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  function trySay() {
    stopAudio();
    const v = enVoices();
    const voice = (listenVoice && v.find((x) => x.name === listenVoice)) || v[0] || null;
    const token = Date.now(); play = { token, groupId: 'try' };
    sayLine('Hello! This is how I will read the conversation.', voice, 1, token).then(() => { if (play && play.token === token) play = null; });
  }
  function listenPanel(g) {
    const hidden = listenPref && !showText && !S.finished;
    return `<div class="tc-listen" role="group" aria-label="ฟังบทสนทนา">
      <div class="tc-listen-row">
        <button class="btn btn-primary tc-play" type="button" data-tc-play aria-pressed="false">${ICON('volume-2', 'icon icon-sm')} ฟังบทสนทนา</button>
        <button class="mini-btn ghost" type="button" data-tc-rate aria-pressed="${listenRate === 0.8}">${listenRate === 0.8 ? 'ความเร็ว: ช้า' : 'ความเร็ว: ปกติ'}</button>
        ${S.finished ? '' : `<button class="mini-btn ghost" type="button" data-tc-text aria-expanded="${!hidden}">${hidden ? 'แสดงบทสนทนา' : 'ซ่อนบทสนทนา (ฝึกฟังอย่างเดียว)'}</button>`}
      </div>
      <div class="tc-voice-row">
        <label class="tc-voice">เสียง <select data-tc-voice aria-label="เลือกเสียงอ่าน">${voiceOptions()}</select></label>
        <button class="mini-btn ghost" type="button" data-tc-trysay>${ICON('volume-2', 'icon icon-sm')} ลองฟัง</button>
      </div>
      <p class="tc-voice-warn" id="tc-voice-warn" role="note"${enVoices().length || !voicesReady() ? ' hidden' : ''}>${ICON('triangle-alert', 'icon icon-sm')} เครื่องนี้ยังไม่มีเสียงอ่านภาษาอังกฤษ — เสียงที่ได้ยินอาจไม่ชัด · ติดตั้งได้ที่ การตั้งค่าเครื่อง → ภาษา/การป้อนข้อมูล → แปลงข้อความเป็นเสียง (Android) หรือ การตั้งค่า → การช่วยการเข้าถึง → เนื้อหาที่พูด → เสียง (iPhone/iPad)</p>
      <p class="tc-listen-st" id="tc-listen-st" aria-live="polite"></p>
      <p class="tc-listen-note"${hidden ? '' : ' hidden'}>${ICON('headphones', 'icon icon-sm')} โหมดฝึกฟัง: ฟังแล้วเลือกคำตอบเติมช่องว่างที่ได้ยินเสียง "บี๊บ" (ช่องว่าง ${g.items.map((it) => it.blank).join(', ')}) · ผู้พูด: ${esc([...new Set(g.dialogue.map((l) => l.speaker))].join(', '))}</p>
      <p class="tc-listen-fine">ตัวเสริมสำหรับฝึกฟัง/ออกเสียง — ข้อสอบจริงส่วนนี้เป็นบทสนทนาให้อ่าน ไม่มีเสียง · เสียงสังเคราะห์จากอุปกรณ์ของคุณ คุณภาพขึ้นกับเครื่อง/เบราว์เซอร์</p>
    </div>`;
  }

  /* ---------------- หน้ารวม ---------------- */
  async function openHub() {
    stopTimer(); S = null;
    setHash('#/tcas'); App().showScreen('screen-tcas');
    const el = root();
    loading(el);
    let d; let h;
    try { [d, h] = await Promise.all([api(''), api('/history').catch(() => ({ sessions: [] }))]); } catch (err) { errorBox(el, err, openHub); return; }
    if (!d.exams.some((x) => x.id === exam)) exam = d.exams[0].id;
    const ex = d.exams.find((x) => x.id === exam);
    const totalItems = ex.id === 'tgat1' ? 60 : 80;
    const setCard = (s) => `
      <li class="tc-set">
        <div class="tc-set-head"><h3>${esc(s.title)}</h3><small>${s.total} ข้อ</small></div>
        ${s.levelTh ? `<p class="tc-level is-l${Number(s.level) || 1}">${ICON(s.level > 1 ? 'flame' : 'target', 'icon icon-sm')} ${esc(s.levelTh)}${s.level > 1 ? ` <small>${s.ready ? `พร้อมแล้ว — คุณสอบจำลองระดับ ${s.level - 1} ได้ ${d.levelReadyScore}+ แล้ว` : `${s.level > 2 ? 'ใกล้ระดับ C1' : 'ยากกว่าข้อสอบจริง'} · แนะนำหลังสอบจำลองระดับ ${s.level - 1} ได้ ${d.levelReadyScore}+ (ทำก่อนก็ได้)`}</small>` : ' <small>ใกล้เคียงข้อสอบจริง</small>'}</p>` : ''}
        ${s.exp ? `<p class="tc-exp">${ICON('sparkles', 'icon icon-sm')} ตอบถูกข้อละ ${s.exp.item} EXP · จบแต่ละส่วน +${s.exp.section} · สอบจำลองครั้งแรก +${s.exp.mock} · ได้ 80+ รับโบนัสเพิ่ม +${s.exp.bonus80}</p>` : ''}
        <div class="tc-mock">
          <span class="tc-mock-text"><b>${ICON('timer', 'icon icon-sm')} สอบจำลองจับเวลา</b>
            <small>${ex.minutes} นาที · คะแนนเต็ม 100 · ${s.mock.best === null ? 'ยังไม่เคยสอบ' : `คะแนนดีที่สุด <b class="tc-best">${esc(s.mock.best.toFixed(2))}</b>`}</small></span>
          <button class="btn btn-primary tc-go" type="button" data-tc-mock="${esc(s.setId)}">${ICON('play', 'icon icon-sm')} ${s.mock.activeId ? 'สอบต่อ' : 'เริ่มสอบ'}</button>
          ${s.mock.activeId ? '' : `<label class="tc-instant"><input type="checkbox" data-tc-instant ${instantPref ? 'checked' : ''}>
            <span><b>เฉลยทันทีหลังตอบแต่ละข้อ</b><small>ไม่เลือก = เฉลยตอนส่ง เหมือนสอบจริง</small></span></label>`}
        </div>
        <p class="tc-sub">ฝึกทีละส่วน (เฉลยทันที)</p>
        <ul class="tc-secs">${s.sections.map((sec) => `
          <li><button class="tc-sec" type="button" data-tc-practice="${esc(s.setId)}" data-section="${esc(sec.id)}">
            <span class="tc-sec-text"><b>${esc(sec.th)}</b><small>${sec.seen ? `ตอบถูก ${sec.correct}/${sec.total}` : `${sec.total} ข้อ`}${sec.activeId ? ' · ทำค้างอยู่' : ''}</small></span>
            <span class="gl-bar tc-bar" aria-hidden="true"><span style="width:${sec.total ? Math.round((sec.correct / sec.total) * 100) : 0}%"></span></span>
            ${ICON('chevron-right', 'icon icon-sm')}</button></li>`).join('')}</ul>
      </li>`;
    const hist = (h.sessions || []).filter((x) => x.exam === exam).slice(0, 6);
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tc-nav="path">${ICON('arrow-left', 'icon icon-sm')} เส้นทางการเรียน</button>
      <header class="tc-hero"><p class="gl-kicker">${ICON('graduation-cap', 'icon icon-sm')} ติวสอบเข้ามหาวิทยาลัย</p>
        <h1 class="page-title" id="tc-title">ติวสอบ TGAT / A-Level ภาษาอังกฤษ</h1>
        <p class="gl-sub">ข้อสอบแต่งใหม่ตามรูปแบบ TCAS70 · ฝึกทีละส่วนพร้อมเฉลยภาษาไทย หรือสอบจำลองจับเวลาแล้วดูคะแนนเต็ม 100</p></header>
      <div class="tc-tabs" role="tablist" aria-label="เลือกข้อสอบ">${d.exams.map((x) => `
        <button class="tc-tab${x.id === exam ? ' is-on' : ''}" role="tab" type="button" aria-selected="${x.id === exam}" data-tc-exam="${esc(x.id)}">${esc(x.titleTh)}</button>`).join('')}</div>
      <section class="tc-format" aria-label="รูปแบบข้อสอบ">
        <span><b>${totalItems}</b><small>ข้อ</small></span><span><b>${ex.minutes}</b><small>นาที</small></span><span><b>100</b><small>คะแนน</small></span>
        <p>${ex.sections.map((x) => `${esc(x.th)} ${x.points} คะแนน`).join(' · ')}</p>
      </section>
      ${ex.sets.length ? `<ul class="tc-sets">${ex.sets.map(setCard).join('')}</ul>` : '<p class="gl-empty">ชุดข้อสอบกำลังจะเปิดเร็ว ๆ นี้</p>'}
      ${hist.length ? `<section class="tc-hist" aria-labelledby="tc-hist-t"><h2 class="tq-h2" id="tc-hist-t">${ICON('history', 'icon icon-sm')} ล่าสุด</h2><ul>${hist.map((x) => `
        <li><button type="button" class="tc-hist-row" data-tc-open="${x.id}"><span>${x.mode === 'mock' ? 'สอบจำลอง' : 'ฝึก'} ${esc(x.setId)}${x.section ? ` · ${esc((ex.sections.find((q) => q.id === x.section) || {}).th || '')}` : ''}</span>
          <b>${x.mode === 'mock' ? `${Number(x.score).toFixed(2)}/100` : `${x.correct}/${x.total}`}</b><small>${fmtDate(x.finishedAt)}</small></button></li>`).join('')}</ul></section>` : ''}
      <p class="gl-note tc-note">${ICON('info', 'icon icon-sm')} ${esc(d.note)} · ข้อสอบตรวจด้วยระบบตรวจอัตโนมัติและผู้ตรวจ AI ที่ทำข้อสอบโดยไม่เห็นเฉลย — ถ้าเจอข้อที่ผิด กด "แจ้งข้อสอบผิด" ได้ทุกข้อ</p>`;
    focusEl('tc-title');
  }

  /* ---------------- ทำข้อสอบ ---------------- */
  async function start(body) {
    const el = root(); loading(el);
    try { S = await api('/sessions', { method: 'POST', body }); } catch (err) { App().toast(err.message, 'error'); openHub(); return; }
    gi = firstUnanswered(); reviewing = false;
    show();
  }
  async function openSession(id) {
    stopTimer(); App().showScreen('screen-tcas');
    const el = root(); loading(el);
    try { S = await api(`/sessions/${encodeURIComponent(id)}`); } catch (err) { errorBox(el, err, () => openSession(id)); return; }
    gi = S.finished ? 0 : firstUnanswered(); reviewing = false;
    show();
  }
  function firstUnanswered() {
    const i = S.groups.findIndex((g) => g.items.some((it) => S.answers[it.id] === undefined));
    return i < 0 ? 0 : i;
  }
  const allItems = () => S.groups.flatMap((g) => g.items);
  const numberOf = (id) => allItems().findIndex((it) => it.id === id) + 1;
  const answered = () => allItems().filter((it) => S.answers[it.id] !== undefined).length;

  function show() {
    setHash(`#/tcas-play/${S.id}`);
    if (S.finished && !reviewing) { renderResult(); return; }
    renderGroup();
    if (S.mode === 'mock' && !S.finished) startTimer();
  }

  function startTimer() {
    stopTimer();
    skew = Date.now() - new Date(S.serverNow).getTime();
    let warned = false;
    const tick = () => {
      const left = Math.max(0, new Date(S.deadlineAt).getTime() + skew - Date.now());
      const t = document.getElementById('tc-timer');
      if (t) {
        const m = Math.floor(left / 60000); const s = Math.floor((left % 60000) / 1000);
        t.textContent = `${m}:${String(s).padStart(2, '0')}`;
        t.classList.toggle('is-low', left < 5 * 60000);
        if (!warned && left < 5 * 60000 && left > 0) { warned = true; const sr = document.getElementById('tc-timer-sr'); if (sr) sr.textContent = 'เหลือเวลา 5 นาที'; }
      }
      if (left <= 0) { stopTimer(); App().toast('หมดเวลา — ส่งข้อสอบให้อัตโนมัติ', 'info'); submit(true); }
    };
    tick(); timer = setInterval(tick, 1000);
  }

  function blanks(s) { return esc(s).replace(/___(\d+)___/g, (_, n) => `<span class="tc-blank" aria-label="ช่องว่างที่ ${n}">(${n})</span>`); }
  function renderPassage(g) {
    const parts = [];
    if (g.title) parts.push(`<h3 class="tc-ptitle" lang="en">${esc(g.title)}</h3>`);
    if (g.dialogue) {
      parts.push(`<dl class="tc-dialogue" lang="en">${g.dialogue.map((l) => `<div class="tc-line"><dt>${esc(l.speaker)}</dt><dd>${blanks(l.text)}</dd></div>`).join('')}</dl>`);
    }
    if (g.table) {
      parts.push(`<div class="tc-table-wrap" tabindex="0" role="region" aria-label="ตารางข้อมูล"><table class="tc-table" lang="en">
        ${g.table.caption ? `<caption>${esc(g.table.caption)}</caption>` : ''}
        <thead><tr>${g.table.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${g.table.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
    }
    if (g.text) parts.push(`<div class="tc-text" lang="en">${g.text.split(/\n+/).map((p) => `<p>${blanks(p)}</p>`).join('')}</div>`);
    return parts.join('');
  }
  // v1.19.2 รูปแบบ Q-R ของ TGAT1: คำถาม + R: ____ + ตัวเลือก อยู่ในการ์ดเดียว (ไม่แยกกล่องบทสนทนา)
  const isQR = (g) => Boolean(g && g.type === 'qr' && g.dialogue && g.dialogue.length === 2 && g.dialogue[0].speaker === 'Q' && g.dialogue[1].speaker === 'R');
  const groupOf = (itemId) => S.groups.find((g) => g.items.some((x) => x.id === itemId));
  function itemHtml(it) {
    const n = numberOf(it.id);
    const qg = groupOf(it.id);
    const mine = S.answers[it.id];
    const fb = S.feedback[it.id];
    const locked = Boolean(fb) || S.finished;
    const label = it.stem ? `<span lang="en">${esc(it.stem)}</span>` : `เติมช่องว่าง (${it.blank})`;
    const opt = (o, i) => {
      const cls = ['tc-opt'];
      if (mine === i) cls.push('is-picked');
      if (fb && i === fb.answer) cls.push('is-right');
      if (fb && mine === i && i !== fb.answer) cls.push('is-wrong');
      return `<li><button class="${cls.join(' ')}" type="button" role="radio" aria-checked="${mine === i}" data-tc-ans="${esc(it.id)}" data-choice="${i}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="tc-letter" aria-hidden="true">${L[i]}</span><span class="tc-otext" lang="en">${esc(o)}</span>
        ${fb && i === fb.answer ? `${ICON('circle-check', 'icon icon-sm')}<span class="sr-only">(คำตอบที่ถูก)</span>` : ''}${fb && mine === i && i !== fb.answer ? `${ICON('circle-x', 'icon icon-sm')}<span class="sr-only">(คำตอบของคุณ ผิด)</span>` : ''}</button></li>`;
    };
    return `<fieldset class="tc-item${fb ? (fb.correct ? ' is-correct' : ' is-incorrect') : ''}" id="tci-${esc(it.id)}">
      <legend><span class="tc-num">ข้อ ${n}</span> ${isQR(qg) ? '<span class="sr-only">Q-R</span>' : label}</legend>
      ${isQR(qg) ? `<div class="tc-qr" lang="en"><p><b aria-hidden="true">Q:</b><span class="tc-qr-t"><span class="sr-only">คำถาม: </span>${esc(qg.dialogue[0].text)}</span></p><p><b aria-hidden="true">R:</b><span class="tc-qr-t"><span class="sr-only">คำตอบ: </span><span class="tc-blank tc-qr-blank">${mine !== undefined ? esc(it.options[mine]) : '<span class="sr-only">ช่องว่าง</span>&nbsp;'}</span></span></p></div>` : ''}
      <ul class="tc-opts" role="radiogroup" aria-label="ข้อ ${n}">${it.options.map(opt).join('')}</ul>
      ${S.mode === 'mock' && !S.instant && !S.finished && mine !== undefined ? `<button class="tc-clear" type="button" data-tc-clear="${esc(it.id)}">ล้างคำตอบ</button>` : ''}
      ${fb ? `<div class="tc-expl" role="status"><b>${fb.correct ? `${ICON('circle-check', 'icon icon-sm')} ถูกต้อง` : mine === undefined ? `ไม่ได้ตอบ · เฉลย ${L[fb.answer]}` : `${ICON('circle-x', 'icon icon-sm')} ยังไม่ถูก · เฉลย ${L[fb.answer]}`}</b>
        <p>${esc(fb.explanationTh)}</p><small class="tc-skill">${esc(fb.skillTh)}</small>
        <button class="tc-report-btn" type="button" data-tc-report="${esc(it.id)}">${ICON('flag', 'icon icon-sm')} แจ้งข้อสอบผิด</button></div>` : ''}
    </fieldset>`;
  }

  function renderGroup(keepAudio) {
    const el = root();
    const g = S.groups[gi];
    if (!keepAudio) { stopAudio(); showText = false; }
    const listen = TTS_OK && isListenGroup(g);
    const n = S.groups.length;
    const mock = S.mode === 'mock' && !S.finished;
    const first = numberOf(g.items[0].id); const last = numberOf(g.items[g.items.length - 1].id);
    const sec = (S.sections.find((x) => x.id === g.section) || {}).th || '';
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tc-exit>${ICON('arrow-left', 'icon icon-sm')} ${S.finished ? 'ผลสอบ' : 'ออก (บันทึกไว้)'}</button>
      <div class="tc-bar-top">
        <span class="tc-progress"><b>${esc(S.examName)}</b> · ${modeLabel()} · ตอบแล้ว ${answered()}/${S.total}</span>
        ${mock ? `<span class="tc-timer" role="timer" aria-label="เวลาที่เหลือ" id="tc-timer">--:--</span><span class="sr-only" aria-live="polite" id="tc-timer-sr"></span>` : ''}
      </div>
      <h1 class="tc-gtitle" id="tc-gtitle">${esc(sec)} · ${esc(g.typeTh)} <small>ข้อ ${first}${last > first ? `–${last}` : ''}</small></h1>
      <p class="tc-instr">${esc(g.instructionTh)}</p>
      ${isQR(g) ? `<div class="tc-single"><section class="tc-items" aria-label="คำถาม">${g.items.map(itemHtml).join('')}</section></div>` : `<div class="tc-split">
        <section class="tc-passage" id="tc-passage" aria-label="บทความ/บทสนทนา">${listen ? listenPanel(g) : ''}<div class="tc-transcript"${listen && listenPref && !showText && !S.finished ? ' hidden' : ''}>${renderPassage(g)}</div></section>
        <section class="tc-items" aria-label="คำถาม">
          ${g.items.length > 1 || (g.text && g.text.length > 600) ? `<button class="tc-topassage" type="button" data-tc-topassage>${ICON('book-open', 'icon icon-sm')} กลับไปอ่านบทความ/บทสนทนา</button>` : ''}
          ${g.items.map(itemHtml).join('')}</section>
      </div>`}
      <nav class="tc-nav" aria-label="ไปยังชุดคำถาม">
        <button class="btn btn-secondary" type="button" data-tc-go="${gi - 1}" ${gi === 0 ? 'disabled' : ''}>${ICON('chevron-left', 'icon icon-sm')} ก่อนหน้า</button>
        <span class="tc-pos">${gi + 1}/${n}</span>
        ${gi < n - 1 ? `<button class="btn btn-primary" type="button" data-tc-go="${gi + 1}">ถัดไป ${ICON('chevron-right', 'icon icon-sm')}</button>`
          : S.finished ? '<button class="btn btn-primary" type="button" data-tc-exit>กลับไปดูผล</button>'
            : `<button class="btn btn-primary" type="button" data-tc-submit>${ICON('flag', 'icon icon-sm')} ${mock ? 'ส่งข้อสอบ' : 'จบการฝึก'}</button>`}
      </nav>
      ${S.mode === 'mock' ? `<details class="tc-palette"${mock ? '' : ' open'}><summary>ข้อสอบทั้งหมด (${answered()}/${S.total} ตอบแล้ว)</summary>
        <ol class="tc-pal">${S.groups.map((gg, k) => gg.items.map((it) => {
    const f = S.feedback[it.id];
    const cls = f ? (f.correct ? 'is-right' : 'is-wrong') : S.answers[it.id] !== undefined ? 'is-done' : '';
    return `<li><button type="button" class="tc-pal-b ${cls}${k === gi ? ' is-here' : ''}" data-tc-go="${k}" aria-label="ข้อ ${numberOf(it.id)}${S.answers[it.id] !== undefined ? ' ตอบแล้ว' : ' ยังไม่ตอบ'}">${numberOf(it.id)}</button></li>`;
  }).join('')).join('')}</ol>
        ${mock ? `<button class="btn btn-primary tc-submit-all" type="button" data-tc-submit>${ICON('flag', 'icon icon-sm')} ส่งข้อสอบ</button>` : ''}</details>` : ''}`;
    focusEl('tc-gtitle');
    window.scrollTo(0, 0);
  }

  async function pick(itemId, choice) {
    if (S.finished) return;
    const fb = S.feedback[itemId];
    if (fb) return;
    const prev = S.answers[itemId];
    const deferred = S.mode === 'mock' && !S.instant;   // สอบจำลองแบบเฉลยตอนส่ง: เปลี่ยนคำตอบได้ ไม่เฉลย
    if (deferred) { S.answers[itemId] = choice; rerenderItem(itemId); }
    try {
      const r = await api(`/sessions/${S.id}/answer`, { method: 'POST', body: { itemId, choice } });
      if (!deferred) {
        S.answers[itemId] = choice;
        S.feedback[itemId] = { answer: r.answer, explanationTh: r.explanationTh, skillTh: r.skillTh, correct: r.correct };
        rerenderItem(itemId);
        if (r.gainedExp) App().toast(r.sectionDone ? `จบส่วนนี้ครบแล้ว! +${r.gainedExp} EXP` : `+${r.gainedExp} EXP`, 'success');
        else if (r.noExpReason === 'too_fast') App().toast('ไม่ได้ EXP — ตอบเร็วเกินกว่าคนอ่านโจทย์ทัน', 'info');
        if (r.levelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      }
    } catch (err) {
      if (deferred) { if (prev === undefined) delete S.answers[itemId]; else S.answers[itemId] = prev; rerenderItem(itemId); }
      App().toast(err.message, 'error');
      if (err.code === 'TIME_UP' || err.code === 'FINISHED') openSession(S.id);
    }
  }
  async function clearAnswer(itemId) {
    const prev = S.answers[itemId];
    delete S.answers[itemId]; rerenderItem(itemId);
    try { await api(`/sessions/${S.id}/answer`, { method: 'POST', body: { itemId, choice: null } }); } catch (err) { S.answers[itemId] = prev; rerenderItem(itemId); App().toast(err.message, 'error'); }
  }
  const modeLabel = () => (S.mode === 'mock' ? `สอบจำลอง${S.instant ? ' (เฉลยทันที)' : ''}` : `ฝึก ${esc(S.sectionTh || '')}`);
  function rerenderItem(itemId) {
    const old = document.getElementById(`tci-${itemId}`);
    const it = allItems().find((x) => x.id === itemId);
    if (!old || !it) return;
    const focusedChoice = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.choice : null;
    old.outerHTML = itemHtml(it);
    const p = document.querySelector('.tc-progress');
    if (p) p.innerHTML = `<b>${esc(S.examName)}</b> · ${modeLabel()} · ตอบแล้ว ${answered()}/${S.total}`;
    const sum = document.querySelector('.tc-palette summary');
    if (sum) sum.textContent = `ข้อสอบทั้งหมด (${answered()}/${S.total} ตอบแล้ว)`;
    const pb = document.querySelector(`.tc-pal-b[aria-label^="ข้อ ${numberOf(itemId)} "]`);
    const pf = S.feedback[itemId];
    if (pb && pf) { pb.classList.remove('is-done'); pb.classList.add(pf.correct ? 'is-right' : 'is-wrong'); }
    if (pb) { pb.classList.toggle('is-done', !pf && S.answers[itemId] !== undefined); pb.setAttribute('aria-label', `ข้อ ${numberOf(itemId)}${S.answers[itemId] !== undefined ? ' ตอบแล้ว' : ' ยังไม่ตอบ'}`); }
    if (focusedChoice !== null) { const b = document.querySelector(`#tci-${CSS.escape(itemId)} [data-choice="${focusedChoice}"]`); if (b) b.focus(); }
    const ex = document.querySelector(`#tci-${CSS.escape(itemId)} .tc-expl`);
    if (ex && !S.finished) ex.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  let armedSubmit = false;
  async function submit(auto = false, btn = null) {
    const left = S.total - answered();
    if (!auto && S.mode === 'mock' && !armedSubmit) {
      armedSubmit = true;
      document.querySelectorAll('[data-tc-submit]').forEach((b) => { b.innerHTML = left ? `ยังไม่ได้ตอบ ${left} ข้อ — กดอีกครั้งเพื่อส่ง` : 'กดอีกครั้งเพื่อยืนยันการส่ง'; });
      setTimeout(() => { armedSubmit = false; }, 6000);
      return;
    }
    armedSubmit = false;
    if (btn) btn.disabled = true;
    stopTimer();
    try { S = await api(`/sessions/${S.id}/finish`, { method: 'POST', body: {} }); } catch (err) { App().toast(err.message, 'error'); if (btn) btn.disabled = false; return; }
    if (S.result && S.result.gainedExp) App().toast(`+${S.result.gainedExp} EXP`, 'success');
    if (S.levelUp && S.levelUp.levelInfo) App().applyLevelInfo(S.levelUp.levelInfo, S.levelUp.leveledUp);
    reviewing = false;
    show();
  }

  function renderResult() {
    stopTimer();
    const r = S.result || {};
    const el = root();
    const mock = S.mode === 'mock';
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-tc-nav="tcas">${ICON('arrow-left', 'icon icon-sm')} ติวสอบ TGAT / A-Level</button>
      <header class="tc-result-head"><p class="gl-kicker">${ICON('flag', 'icon icon-sm')} ${esc(S.title)} · ${mock ? 'สอบจำลอง' : `ฝึก ${esc(S.sectionTh || '')}`}</p>
        <h1 class="page-title" id="tc-res-title">${mock ? `คะแนน <b class="tc-score">${Number(r.score || 0).toFixed(2)}</b><small>/100</small>` : `ตอบถูก <b class="tc-score">${r.correct || 0}</b><small>/${r.total || 0}</small>`}</h1>
        <p class="gl-sub">ถูก ${r.correct || 0} จาก ${r.total || 0} ข้อ · ตอบ ${r.answered || 0} ข้อ${r.auto ? ' · หมดเวลา ส่งอัตโนมัติ' : ''}${r.gainedExp ? ` · +${r.gainedExp} EXP` : ''}</p></header>
      ${mock ? `<section class="tc-res-secs" aria-label="คะแนนแต่ละส่วน">${(r.sections || []).map((x) => `
        <div class="tc-res-sec"><span><b>${esc(x.th)}</b><small>ถูก ${x.correct}/${x.total}</small></span>
          <span class="gl-bar tc-bar" aria-hidden="true"><span style="width:${x.total ? Math.round((x.correct / x.total) * 100) : 0}%"></span></span>
          <b>${Number(x.score).toFixed(2)}<small>/${x.points}</small></b></div>`).join('')}</section>` : ''}
      ${(r.weak || []).length ? `<section class="tc-weak" aria-labelledby="tc-weak-t"><h2 class="tq-h2" id="tc-weak-t">${ICON('target', 'icon icon-sm')} ทักษะที่ควรฝึกเพิ่ม</h2>
        <ul>${r.weak.map((w) => `<li><b>${esc(w.th)}</b> ถูก ${w.correct}/${w.total} (${w.pct}%)</li>`).join('')}</ul></section>` : ''}
      <div class="gl-actions">
        <button class="btn btn-primary" type="button" data-tc-review>${ICON('eye', 'icon icon-sm')} ดูเฉลยทีละข้อ</button>
        <button class="btn btn-secondary" type="button" data-tc-nav="tcas">${ICON('rotate-ccw', 'icon icon-sm')} กลับหน้ารวม</button>
      </div>`;
    focusEl('tc-res-title');
  }

  /* ---------------- แจ้งข้อสอบผิด ---------------- */
  function openReport(itemId) {
    const box = document.querySelector(`#tci-${CSS.escape(itemId)} .tc-expl`);
    if (!box || box.querySelector('.tc-report')) return;
    const f = document.createElement('form');
    f.className = 'tc-report';
    f.innerHTML = `<label>เหตุผล <select name="reason" required>${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label>รายละเอียด (ไม่บังคับ) <textarea name="note" maxlength="300" rows="2"></textarea></label>
      <div class="tc-report-act"><button class="btn btn-secondary" type="button" data-cancel>ยกเลิก</button><button class="btn btn-primary" type="submit">ส่ง</button></div>`;
    box.appendChild(f);
    f.querySelector('select').focus();
    f.querySelector('[data-cancel]').addEventListener('click', () => f.remove());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      try { await api('/report', { method: 'POST', body: { itemId, reason: fd.get('reason'), note: fd.get('note') } }); App().toast('ส่งรายงานแล้ว ขอบคุณที่ช่วยตรวจ', 'success'); f.remove(); } catch (err) { App().toast(err.message, 'error'); }
    });
  }

  /* ---------------- เหตุการณ์ ---------------- */
  document.addEventListener('click', (e) => {
    const scr = document.getElementById('screen-tcas');
    if (!scr || scr.classList.contains('hidden') || !scr.contains(e.target)) return;
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tcNav) { App().navigateTo(t.dataset.tcNav); return; }
    if (t.dataset.tcExam) { exam = t.dataset.tcExam; try { localStorage.setItem('eq_tcas_exam', exam); } catch (_) { /* โหมดส่วนตัว */ } openHub(); return; }
    if (t.dataset.tcMock) { start({ setId: t.dataset.tcMock, mode: 'mock', instant: instantPref }); return; }
    if (t.dataset.tcPractice) { start({ setId: t.dataset.tcPractice, mode: 'practice', section: t.dataset.section }); return; }
    if (t.dataset.tcOpen) { openSession(t.dataset.tcOpen); return; }
    if (t.dataset.tcAns && t.getAttribute('aria-disabled') !== 'true') { pick(t.dataset.tcAns, Number(t.dataset.choice)); return; }
    if (t.dataset.tcClear) { clearAnswer(t.dataset.tcClear); return; }
    if (t.dataset.tcGo !== undefined && !t.disabled) { gi = Math.max(0, Math.min(S.groups.length - 1, Number(t.dataset.tcGo))); renderGroup(); return; }
    if ('tcSubmit' in t.dataset) { if (S.mode === 'mock') submit(false, t); else submit(true, t); return; }
    if ('tcExit' in t.dataset) { if (S && S.finished) { reviewing = false; renderResult(); } else openHub(); return; }
    if ('tcReview' in t.dataset) { reviewing = true; gi = 0; renderGroup(); return; }
    if ('tcTopassage' in t.dataset) { const p = document.getElementById('tc-passage'); if (p) { p.scrollIntoView({ block: 'start', behavior: 'smooth' }); p.tabIndex = -1; p.focus({ preventScroll: true }); } return; }
    if ('tcPlay' in t.dataset) { playDialogue(S.groups[gi], t); return; }
    if ('tcTrysay' in t.dataset) { trySay(); return; }
    if ('tcRate' in t.dataset) { listenRate = listenRate === 1 ? 0.8 : 1; saveListen(); t.textContent = listenRate === 0.8 ? 'ความเร็ว: ช้า' : 'ความเร็ว: ปกติ'; t.setAttribute('aria-pressed', String(listenRate === 0.8)); return; }
    if ('tcText' in t.dataset) {
      // สลับโหมดฝึกฟังอย่างเดียว (จำค่าไว้สำหรับกลุ่มถัดไป)
      if (listenPref && !showText) { listenPref = false; } else { listenPref = true; } showText = false; saveListen();
      const tr = document.querySelector('#tc-passage .tc-transcript');
      const hide = listenPref && !showText;
      if (tr) tr.hidden = hide;
      t.textContent = hide ? 'แสดงบทสนทนา' : 'ซ่อนบทสนทนา (ฝึกฟังอย่างเดียว)'; t.setAttribute('aria-expanded', String(!hide));
      const note = document.querySelector('.tc-listen-note'); if (note) note.hidden = !hide;
      return;
    }
    if (t.dataset.tcReport) openReport(t.dataset.tcReport);
  });
  // ออกจากหน้าทำข้อสอบ -> หยุดเสียง
  window.addEventListener('hashchange', () => { if (!/^#\/tcas-play\//.test(location.hash)) stopAudio(); });
  // ลูกศรซ้าย/ขวาในกลุ่มตัวเลือก (radiogroup)
  document.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.tc-opt');
    if (!b || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const all = [...b.closest('.tc-opts').querySelectorAll('.tc-opt')];
    const i = all.indexOf(b) + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1);
    if (all[i]) { e.preventDefault(); all[i].focus(); }
  });

  // ---------- ผู้ดูแล: ข้อที่ถูกแจ้งว่าผิด · ซ่อน/คืนข้อ (สิทธิ์จริงตรวจที่เซิร์ฟเวอร์) ----------
  async function mountAdmin() {
    const box = document.getElementById('admin-tcas-root');
    if (!box) return;
    loading(box);
    let d;
    try { d = await api('/admin/reports'); } catch (err) { errorBox(box, err, mountAdmin); return; }
    const badge = document.getElementById('admin-tcas-count');
    if (badge) { badge.textContent = String(d.reports.length); badge.classList.toggle('hidden', !d.reports.length); }
    const reasonTh = (r) => esc((d.reasons && d.reasons[r]) || REASONS[r] || r);
    const sets = d.counts.map((c) => `<li><b>${esc(c.setId)}</b> ${esc(c.title)} · ${c.items} ข้อ · ${c.review && c.review.passed
      ? `ตรวจแล้ว (${esc(c.review.method || '')}${c.review.total ? ` · ตรงกัน ${c.review.agree}/${c.review.total}` : ''})` : '<span class="admin-tag warn">ยังไม่ผ่านการตรวจ</span>'}</li>`).join('');
    const reps = d.reports.map((r) => `
      <div class="admin-report tc-adm-rep" data-item="${esc(r.itemId)}">
        <div><b>${esc(r.itemId)}</b> · ${esc(r.typeTh || '')} <span class="admin-tag">${r.reports} รายงาน</span>
          ${r.hidden ? '<span class="admin-tag warn">ซ่อนอยู่</span>' : ''} ${(r.reasons || []).map((x) => `<span class="admin-tag">${reasonTh(x)}</span>`).join(' ')}</div>
        ${r.context ? `<details class="tc-adm-ctx"><summary>บทความ/บทสนทนา</summary><pre>${esc(r.context)}</pre></details>` : ''}
        <p class="tc-adm-stem">${esc(r.stem || '')}</p>
        <ol class="tc-adm-opts" type="A">${(r.options || []).map((o, i) => `<li${i === r.answer ? ' class="is-key"' : ''}>${esc(o)}${i === r.answer ? ' — <b>เฉลย</b>' : ''}</li>`).join('')}</ol>
        <p class="admin-row-src">คำอธิบาย: ${esc(r.explanationTh || '')}</p>
        ${(r.notes || []).map((n) => `<p class="admin-report-details">${esc(n)}</p>`).join('')}
        <div class="admin-report-actions">
          <button class="mini-btn" type="button" data-tc-hide="1">ซ่อนข้อนี้</button>
          <button class="mini-btn ghost" type="button" data-tc-hide="0">ข้อนี้ถูกแล้ว (ปิดรายงาน)</button>
        </div>
      </div>`).join('');
    const hid = d.hidden.map((h) => `<li><b>${esc(h.itemId)}</b>${h.note ? ` — ${esc(h.note)}` : ''} <button class="mini-btn ghost" type="button" data-tc-unhide="${esc(h.itemId)}">นำกลับมาใช้</button></li>`).join('');
    box.innerHTML = `
      <p class="admin-row-src">ชุดข้อสอบที่เปิดใช้:</p><ul class="tc-adm-sets">${sets || '<li>ไม่มี</li>'}</ul>
      <h4 class="tc-adm-h">ข้อที่ผู้เรียนแจ้งว่าผิด (ยังไม่ปิด)</h4>
      ${reps || '<p class="admin-row-src">ยังไม่มีการแจ้ง</p>'}
      <h4 class="tc-adm-h">ข้อที่ซ่อนอยู่ (ไม่ถูกนำไปใช้ในชุดใหม่)</h4>
      <ul class="tc-adm-sets">${hid || '<li>ไม่มี</li>'}</ul>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#admin-tcas-root [data-tc-hide], #admin-tcas-root [data-tc-unhide]');
    if (!b) return;
    const itemId = b.dataset.tcUnhide || b.closest('[data-item]').dataset.item;
    const hidden = b.dataset.tcHide === '1';
    b.disabled = true;
    try {
      await api('/admin/items/hide', { method: 'POST', body: { itemId, hidden, note: hidden ? 'ซ่อนจากรายงานผู้เรียน' : '' } });
      App().toast(hidden ? `ซ่อน ${itemId} แล้ว` : `${itemId} ใช้งานตามปกติ`, 'success');
      mountAdmin();
    } catch (err) { App().toast(err.message, 'error'); b.disabled = false; }
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.matches && e.target.matches('[data-tc-voice]')) { stopAudio(); listenVoice = e.target.value; saveListen(); }
    if (e.target && e.target.matches && e.target.matches('[data-tc-instant]')) {
      instantPref = e.target.checked;
      try { localStorage.setItem('eq_tcas_instant', instantPref ? '1' : '0'); } catch (_) { /* โหมดส่วนตัว */ }
      document.querySelectorAll('[data-tc-instant]').forEach((x) => { x.checked = instantPref; });
    }
  });

  window.EQTcas = {
    open: (param) => (param ? openSession(param) : openHub()),
    mountAdmin,
    _state: () => ({ S, gi }),
  };
}());
