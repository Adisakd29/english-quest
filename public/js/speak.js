/* =====================================================================
   Speaking — window.EQSpeak  (ฝึกพูด · ออกเสียง · ฟังแล้วพิมพ์)
   หน้าจอ:
     hub   #/speak             สรุป · ระดับ A1–C1 · ประโยค / คำศัพท์ / บทสนทนา
     play  #/speak-play/SETID  ฝึกทีละประโยค: ฟังต้นแบบ (ปกติ/ช้า) → กดไมค์พูด → คะแนนรายคำ
   หลักการ:
     - เสียงพูดไม่ถูกส่งมาที่เซิร์ฟเวอร์ EnglishQuest — ใช้ระบบรู้จำเสียงของเบราว์เซอร์ (Web Speech API)
       v1.10.0: ส่ง "ข้อความที่ได้ยิน" ให้เซิร์ฟเวอร์ให้คะแนน (ตัวให้คะแนนเดียวกัน public/js/speak-score.js) แล้วทิ้ง ไม่บันทึก
     - ก่อนใช้ไมค์ครั้งแรกแจ้งว่าเบราว์เซอร์อาจส่งเสียงไปยังผู้ให้บริการ (เช่น Google/Apple) เพื่อแปลงเป็นข้อความ
     - เบราว์เซอร์ที่ไม่รองรับ / ไม่อนุญาตไมค์ → โหมด "ฟังแล้วพิมพ์" (ตรวจคำตอบที่เซิร์ฟเวอร์)
     - EXP ครั้งแรกที่ผ่านต่อประโยค (เพดานต่อวัน) · ไม่ให้ Coin
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const api = (p, o) => App().api(`/speak${p}`, o);
  const SC = () => window.EQSpeakScore;
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = (id) => document.getElementById(`${id}-root`);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* โหมดส่วนตัว */ } } };
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const KINDS = [['sentences', 'ประโยค', 'message-square-text'], ['words', 'คำศัพท์', 'book'], ['dialogues', 'บทสนทนา', 'message-circle-more']];

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srSupported = () => Boolean(SR) && window.isSecureContext !== false;
  const ttsSupported = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  let micDenied = false;          // ไม่อนุญาตไมค์ในรอบนี้ → แนะนำโหมดพิมพ์

  function setHash(path, param) { const t = `#/${path}${param ? `/${encodeURIComponent(param)}` : ''}`; if (location.hash !== t) history.replaceState(null, '', t); }
  const focusTitle = (id) => requestAnimationFrame(() => { const h = document.getElementById(id); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } window.scrollTo(0, 0); });
  function loading(el) { el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>'; }
  function errorBox(el, err, retry) {
    el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p>
      <button class="btn btn-secondary" type="button" data-retry>ลองใหม่</button></div>`;
    el.querySelector('[data-retry]').addEventListener('click', retry);
  }

  /* =====================================================================
     เสียงต้นแบบ (Text-to-Speech) — คืน Promise เมื่ออ่านจบ (ใช้ต่อคิวบทสนทนา)
     ใช้สำเนียง/ความเร็วเดียวกับหน้าคำศัพท์ (localStorage eq_tts_pref)
     ===================================================================== */
  function ttsPref() { try { return JSON.parse(ls.get('eq_tts_pref')) || {}; } catch (_) { return {}; } }
  function pickVoice(accent) {
    const vs = (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices()) || [];
    const want = accent === 'GB' ? /^en[-_]GB/i : /^en[-_]US/i;
    return vs.find((v) => want.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  let sayToken = 0;
  function say(text, slow) {
    stopSay();
    if (!ttsSupported() || !text) return Promise.resolve(false);
    const my = ++sayToken;
    const pref = ttsPref();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(String(text).replace(/\[\[|\]\]/g, ''));
      const v = pickVoice(pref.accent);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || (pref.accent === 'GB' ? 'en-GB' : 'en-US');
      u.rate = (slow ? 0.62 : 0.92) * (pref.speed === 0.75 ? 0.85 : 1);
      let done = false;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(guard); if (window.EQAudio) window.EQAudio.duck(false); resolve(ok && my === sayToken); };
      u.onend = () => fin(true); u.onerror = () => fin(false);
      // บางเบราว์เซอร์ไม่ส่ง onend → กันค้างตามความยาวข้อความ
      const guard = setTimeout(() => fin(true), 1500 + String(text).length * (slow ? 140 : 90));
      if (window.EQAudio) window.EQAudio.duck(true);
      window.speechSynthesis.speak(u);
    });
  }
  function stopSay() { sayToken += 1; if (ttsSupported()) window.speechSynthesis.cancel(); }

  /* =====================================================================
     รู้จำเสียง (Speech-to-Text ของเบราว์เซอร์) — ไม่มีการอัดไฟล์เสียงในแอป
     ===================================================================== */
  let rec = null;
  function stopRec(abort) { if (rec) { try { if (abort) rec.abort(); else rec.stop(); } catch (_) { /* - */ } } }
  function listen(onInterim) {
    stopSay();
    return new Promise((resolve, reject) => {
      let r;
      try { r = new SR(); } catch (e) { reject(Object.assign(new Error('unsupported'), { code: 'unsupported' })); return; }
      rec = r;
      r.lang = ttsPref().accent === 'GB' ? 'en-GB' : 'en-US';
      r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
      const alts = []; let err = null; let interim = '';
      r.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const res = e.results[i];
          if (res.isFinal) { for (let a = 0; a < res.length; a += 1) alts.push(res[a].transcript); } else interim += res[0].transcript;
        }
        if (onInterim) onInterim(interim || (alts[0] || ''));
      };
      r.onerror = (e) => { err = e.error || 'error'; };
      const timer = setTimeout(() => { try { r.stop(); } catch (_) { /* - */ } }, 15000);
      r.onend = () => {
        clearTimeout(timer);
        if (rec === r) rec = null;
        if (!alts.length && interim) alts.push(interim);   // บางเครื่องจบโดยไม่มีผลสุดท้าย
        if (alts.length) resolve(alts);
        else reject(Object.assign(new Error(err || 'no-speech'), { code: err || 'no-speech' }));
      };
      try { r.start(); } catch (e) { clearTimeout(timer); rec = null; reject(Object.assign(new Error('start'), { code: 'start' })); }
    });
  }
  const MIC_ERR = {
    'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — เปิดสิทธิ์ไมค์ในการตั้งค่าเบราว์เซอร์ หรือใช้โหมด "ฟังแล้วพิมพ์"',
    'service-not-allowed': 'เบราว์เซอร์นี้ไม่อนุญาตบริการรู้จำเสียง — ใช้โหมด "ฟังแล้วพิมพ์" แทนได้',
    'no-speech': 'ไม่ได้ยินเสียงพูด — กดไมค์แล้วพูดใกล้ ๆ อีกครั้ง',
    'audio-capture': 'ไม่พบไมโครโฟนในอุปกรณ์นี้',
    network: 'ต่อระบบรู้จำเสียงไม่ได้ (ต้องใช้อินเทอร์เน็ต) — ลองอีกครั้ง หรือใช้โหมด "ฟังแล้วพิมพ์"',
    'language-not-supported': 'อุปกรณ์นี้ไม่รองรับการรู้จำเสียงภาษาอังกฤษ',
    unsupported: 'เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง',
    start: 'เริ่มไมโครโฟนไม่ได้ ลองอีกครั้ง',
  };

  /** แจ้งความเป็นส่วนตัวก่อนใช้ไมค์ครั้งแรก → true = ยอมรับ */
  function consent() {
    if (ls.get('eq_speak_consent') === '1') return Promise.resolve(true);
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal-card sp-consent">
        <h2>${ICON('mic')} ก่อนใช้ไมโครโฟน</h2>
        <ul class="sp-consent-list">
          <li>${ICON('shield-check', 'icon icon-sm')} EnglishQuest <b>ไม่ได้รับเสียงของคุณ</b> — ได้รับเฉพาะข้อความที่เบราว์เซอร์ฟังได้ เพื่อคิดคะแนน แล้วทิ้งทันที ไม่บันทึก (เก็บเฉพาะคะแนน)</li>
          <li>${ICON('info', 'icon icon-sm')} การแปลงเสียงเป็นข้อความทำโดย<b>เบราว์เซอร์ของคุณ</b> ซึ่งอาจส่งเสียงไปยังผู้ให้บริการ (เช่น Google ใน Chrome, Apple ใน Safari) ตามนโยบายของผู้ให้บริการนั้น</li>
          <li>${ICON('gauge', 'icon icon-sm')} คะแนนวัด "เครื่องฟังออกกี่คำ" ไม่ใช่การวิเคราะห์หน่วยเสียงแบบครูตรวจ</li>
        </ul>
        <div class="gl-actions">
          <button class="btn btn-primary" type="button" data-ok data-autofocus>${ICON('mic', 'icon icon-sm')} เข้าใจแล้ว เริ่มพูด</button>
          <button class="btn btn-secondary" type="button" data-type>${ICON('keyboard', 'icon icon-sm')} ใช้ฟังแล้วพิมพ์</button>
        </div></div>`;
      document.body.appendChild(ov);
      let answer = null;
      App().makeDialog(ov, { label: 'ความเป็นส่วนตัวของไมโครโฟน', onClose: () => resolve(answer) });
      ov.querySelector('[data-ok]').addEventListener('click', () => { ls.set('eq_speak_consent', '1'); answer = true; ov.remove(); });
      ov.querySelector('[data-type]').addEventListener('click', () => { answer = 'type'; ov.remove(); });
    });
  }

  /* =====================================================================
     HUB
     ===================================================================== */
  let meta = null;
  const H = { level: LEVELS.includes(ls.get('eq_speak_level')) ? ls.get('eq_speak_level') : 'A1',
    kind: KINDS.some((k) => k[0] === ls.get('eq_speak_kind')) ? ls.get('eq_speak_kind') : 'sentences' };

  async function openHub() {
    stopAll();
    App().showScreen('screen-speak');
    setHash('speak');
    const el = root('screen-speak');
    loading(el);
    let sum;
    try { [meta, sum] = await Promise.all([meta || api('/meta'), api('/summary')]); } catch (err) { errorBox(el, err, openHub); return; }
    const lv = meta.levels.find((l) => l.id === H.level) || meta.levels[0];
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-sp-nav="learn">${ICON('arrow-left', 'icon icon-sm')} เรียน</button>
      <header class="sp-hero">
        <p class="gl-kicker">${ICON('mic', 'icon icon-sm')} Speaking</p>
        <h1 class="page-title" id="sp-hub-title">ฝึกพูด · ออกเสียง</h1>
        <p class="gl-note">ฟังเสียงต้นแบบ → กดไมค์แล้วพูดตาม → ดูคำที่ชัด/ยังไม่ชัดทันที</p>
        <ul class="sp-stats" aria-label="สรุปการฝึกพูด">
          <li><b>${sum.passed.toLocaleString()}</b><small>ผ่านแล้ว</small></li>
          <li><b>${sum.avg == null ? '—' : `${sum.avg}%`}</b><small>ความชัดเจนเฉลี่ย</small></li>
          <li><b>${sum.today}</b><small>ฝึกวันนี้</small></li>
        </ul>
      </header>
      ${srSupported() ? '' : `<p class="sp-banner" role="note">${ICON('mic-off', 'icon icon-sm')} เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง (เช่น Firefox) — ฝึกด้วยโหมด <b>ฟังแล้วพิมพ์</b> ได้ หรือเปิดด้วย Chrome / Edge / Safari เพื่อฝึกพูด</p>`}
      <div class="sp-seg" role="radiogroup" aria-label="ระดับ">
        ${LEVELS.map((L) => `<button type="button" role="radio" aria-checked="${L === H.level}" class="sp-seg-btn${L === H.level ? ' is-on' : ''}" data-sp-level="${L}">${L}</button>`).join('')}
      </div>
      <div class="sp-tabs" role="tablist" aria-label="ประเภท">
        ${KINDS.map(([k, th, ic]) => `<button type="button" role="tab" aria-selected="${k === H.kind}" class="sp-tab${k === H.kind ? ' is-on' : ''}" data-sp-kind="${k}">${ICON(ic, 'icon icon-sm')} ${th}
          <small>${k === 'dialogues' ? lv.dialogues : lv[k].toLocaleString()}</small></button>`).join('')}
      </div>
      <div id="sp-sets" class="sp-sets" role="tabpanel"></div>
      <p class="sp-disclaimer">${ICON('info', 'icon icon-sm')} ${esc(meta.note)} · ผ่านที่ ${meta.pass}% · ได้ ${meta.expPerItem} EXP ครั้งแรกที่ผ่านต่อประโยค (สูงสุด ${meta.dailyCap} EXP/วัน) · ไม่บันทึกเสียง</p>`;
    focusTitle('sp-hub-title');
    loadSets();
  }

  async function loadSets() {
    const box = document.getElementById('sp-sets');
    if (!box) return;
    loading(box);
    let d;
    try { d = await api(`/sets?level=${H.level}&kind=${H.kind}`); } catch (err) { errorBox(box, err, loadSets); return; }
    if (!d.sets.length) { box.innerHTML = '<div class="gl-empty"><p>ยังไม่มีชุดฝึกในระดับนี้</p></div>'; return; }
    const pctOf = (s) => Math.round((s.passed / s.count) * 100);
    if (H.kind === 'words') {
      const cont = d.sets.find((s) => s.passed < s.count) || d.sets[0];
      box.innerHTML = `<div class="sp-words-head"><p class="gl-note">ชุดละ ${d.sets[0].count} คำ · ${d.sets.length} ชุด</p>
          <button class="btn btn-primary sp-continue" type="button" data-sp-set="${esc(cont.id)}">${ICON('play', 'icon icon-sm')} ทำต่อ · ชุด ${d.sets.indexOf(cont) + 1}</button></div>
        <ol class="sp-grid">${d.sets.map((s, i) => `<li><button type="button" class="sp-tile${s.passed >= s.count ? ' is-done' : s.tried ? ' is-part' : ''}" data-sp-set="${esc(s.id)}"
          aria-label="ชุดคำศัพท์ ${i + 1} ผ่าน ${s.passed} จาก ${s.count}" style="--p:${pctOf(s)}"><b>${i + 1}</b><small>${s.passed}/${s.count}</small></button></li>`).join('')}</ol>`;
      return;
    }
    box.innerHTML = `<ul class="sp-cards">${d.sets.map((s) => `<li><button type="button" class="sp-card" data-sp-set="${esc(s.id)}">
        <span class="sp-card-main"><b lang="en">${esc(s.title)}</b><small>${esc(s.titleTh || '')}${s.speakers ? ` · ${esc(s.speakers.join(' & '))}` : ''}</small>
          <span class="gl-bar" aria-hidden="true"><span style="width:${pctOf(s)}%"></span></span></span>
        <span class="sp-card-side"><b>${s.passed}/${s.count}</b><small>${s.avg == null ? 'ยังไม่ฝึก' : `เฉลี่ย ${s.avg}%`}</small></span>
        ${ICON('chevron-right', 'icon icon-sm')}</button></li>`).join('')}</ul>`;
  }

  /* =====================================================================
     PLAY
     ===================================================================== */
  let P = null;   // { set, idx, mode, role, results: Map(itemId → {score, words, heard}), busy, auto }

  async function openPlay(setId) {
    stopAll();
    App().showScreen('screen-speak-play');
    setHash('speak-play', setId);
    const el = root('screen-speak-play');
    loading(el);
    let set;
    try { set = await api(`/sets/${encodeURIComponent(setId)}`); } catch (err) { errorBox(el, err, () => openPlay(setId)); return; }
    const first = set.items.findIndex((i) => !i.passed);
    const savedMode = ls.get('eq_speak_mode');
    P = { set, idx: set.kind === 'dialogue' ? 0 : Math.max(0, first), mode: !srSupported() || micDenied ? 'type' : (savedMode === 'type' ? 'type' : 'speak'),
      role: set.kind === 'dialogue' ? null : 'all', results: new Map(), busy: false, ended: false };
    renderPlay();
  }

  const isMine = (it) => !P.role || P.role === 'all' || !it.speaker || it.speaker === P.role;
  const ownItems = () => P.set.items.filter(isMine);

  function renderPlay() {
    const el = root('screen-speak-play');
    if (!P) return;
    const s = P.set;
    const head = `
      <div class="sp-top">
        <button class="game-exit gl-back" type="button" data-sp-nav="speak">${ICON('arrow-left', 'icon icon-sm')} ฝึกพูด</button>
        <div class="sp-mode" role="radiogroup" aria-label="โหมดฝึก">
          <button type="button" role="radio" aria-checked="${P.mode === 'speak'}" class="sp-mode-btn${P.mode === 'speak' ? ' is-on' : ''}" data-sp-mode="speak" ${srSupported() ? '' : 'disabled aria-disabled="true" title="เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง"'}>${ICON('mic', 'icon icon-sm')} พูด</button>
          <button type="button" role="radio" aria-checked="${P.mode === 'type'}" class="sp-mode-btn${P.mode === 'type' ? ' is-on' : ''}" data-sp-mode="type">${ICON('keyboard', 'icon icon-sm')} ฟังแล้วพิมพ์</button>
        </div>
      </div>
      <header class="sp-play-head">
        <p class="gl-kicker">${esc(s.level)} · ${esc(s.kind === 'words' ? 'คำศัพท์' : s.kind === 'dialogue' ? 'บทสนทนา' : 'ประโยค')}</p>
        <h1 class="sp-title" id="sp-play-title"><span lang="en">${esc(s.title)}</span>${s.titleTh ? ` <small>${esc(s.titleTh)}</small>` : ''}</h1>
      </header>`;
    if (s.kind === 'dialogue' && !P.role) { el.innerHTML = head + roleChooser(); focusTitle('sp-play-title'); return; }
    if (P.ended) { el.innerHTML = head + summaryHtml(); focusTitle('sp-sum-title'); return; }
    el.innerHTML = head + (s.kind === 'dialogue' ? dialogueHtml() : itemHtml(s.items[P.idx]) + navHtml());
    focusTitle('sp-play-title');
    if (s.kind === 'dialogue') {
      const cur = document.getElementById('sp-cur');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
      if (!isMine(s.items[P.idx])) partnerTurn();
    }
  }

  function roleChooser() {
    const sp = P.set.speakers || [];
    return `<div class="gl-card sp-roles"><h2 class="gl-h3">${ICON('users', 'icon icon-sm')} เลือกบทบาท</h2>
      <p class="gl-note">คุณพูดบทของตัวละครที่เลือก — อีกฝ่ายเครื่องอ่านให้ฟังแล้วไปต่ออัตโนมัติ</p>
      <div class="sp-role-list">${sp.map((n) => `<button type="button" class="btn btn-primary" data-sp-role="${esc(n)}">${ICON('mic', 'icon icon-sm')} พูดเป็น <b lang="en">${esc(n)}</b></button>`).join('')}
        <button type="button" class="btn btn-secondary" data-sp-role="all">${ICON('list-checks', 'icon icon-sm')} ฝึกทุกบรรทัด</button></div>
      <ol class="sp-preview">${P.set.items.map((it) => `<li><b lang="en">${esc(it.speaker)}:</b> <span lang="en">${esc(it.text)}</span></li>`).join('')}</ol></div>`;
  }

  /** การ์ดฝึก 1 ประโยค/คำ */
  function itemHtml(it, compact) {
    const r = P.results.get(it.id);
    const typing = P.mode === 'type';
    const hideText = typing && !r;
    const best = it.best == null ? '' : `<span class="sp-best${it.passed ? ' is-pass' : ''}">${it.passed ? ICON('circle-check', 'icon icon-sm') : ''} ดีที่สุด ${it.best}%</span>`;
    return `<article class="gl-card sp-item${compact ? ' is-compact' : ''}" aria-labelledby="sp-text">
      <div class="sp-item-top">${it.speaker ? `<span class="sp-speaker" lang="en">${esc(it.speaker)}</span>` : ''}
        ${P.set.kind !== 'dialogue' ? `<span class="sp-count">${P.idx + 1} / ${P.set.items.length}</span>` : ''}${best}</div>
      ${hideText
        ? `<p class="sp-hidden" id="sp-text">${ICON('headphones', 'icon icon-sm')} ฟังแล้วพิมพ์สิ่งที่ได้ยิน <small>(${SC().displayWords(it.text).length} คำ)</small></p>`
        : `<p class="sp-text" id="sp-text" lang="en">${r ? chips(r.words) : esc(String(it.text).replace(/\[\[|\]\]/g, ''))}</p>`}
      ${it.ipa && !hideText ? `<p class="sp-ipa" lang="en">/${esc(String(it.ipa).replace(/^\/|\/$/g, ''))}/</p>` : ''}
      ${it.th ? (hideText ? `<details class="sp-th-hint"><summary>ดูคำแปล (ช่วยเดา)</summary><p>${esc(it.th)}</p></details>` : `<p class="sp-th">${esc(it.th)}</p>`) : ''}
      <div class="sp-listen">
        <button type="button" class="btn btn-secondary sp-say" data-sp-say="normal" ${ttsSupported() ? '' : 'disabled'}>${ICON('volume-2', 'icon icon-sm')} ฟังต้นแบบ</button>
        <button type="button" class="btn btn-secondary sp-say" data-sp-say="slow" ${ttsSupported() ? '' : 'disabled'}>${ICON('snail', 'icon icon-sm')} ช้า</button>
      </div>
      ${typing ? typeBox(it, r) : micBox(r)}
      <div id="sp-result" class="sp-result" aria-live="polite">${r ? resultHtml(r) : ''}</div>
    </article>`;
  }
  function micBox(r) {
    return `<div class="sp-mic-wrap">
      <button type="button" class="sp-mic" id="sp-mic" data-sp-mic aria-label="${r ? 'พูดอีกครั้ง' : 'กดแล้วพูด'}">${ICON('mic', 'icon')}</button>
      <p class="sp-status" id="sp-status">${r ? 'กดไมค์เพื่อพูดอีกครั้ง' : 'กดไมค์แล้วพูดประโยคนี้'}</p>
      <p class="sp-interim" id="sp-interim" lang="en" aria-live="polite"></p></div>`;
  }
  function typeBox(it, r) {
    return `<form class="sp-type" data-sp-type autocomplete="off">
      <label class="sr-only" for="sp-input">พิมพ์สิ่งที่ได้ยิน</label>
      <input id="sp-input" class="sp-input" type="text" lang="en" inputmode="text" autocapitalize="off" spellcheck="false" maxlength="300"
        placeholder="พิมพ์ภาษาอังกฤษที่ได้ยิน…" value="${r && r.typed ? esc(r.typed) : ''}">
      <button class="btn btn-primary" type="submit">${ICON('check', 'icon icon-sm')} ตรวจ</button></form>`;
  }
  function chips(words) {
    return words.map((w) => `<button type="button" class="sp-w is-${w.mark}" data-sp-word="${esc(w.norm || w.text)}"
      title="${w.mark === 'ok' ? 'ชัด' : w.mark === 'close' ? `ใกล้เคียง${w.heard ? ` (ได้ยิน: ${w.heard})` : ''}` : `ยังไม่ชัด${w.heard ? ` (ได้ยิน: ${w.heard})` : ''}`} · แตะเพื่อฟัง">${esc(w.text)}</button>`).join(' ');
  }
  function resultHtml(r) {
    const b = SC().band(r.score);
    const miss = r.words.filter((w) => w.mark !== 'ok');
    return `<div class="sp-score is-${b.id}"><b>${r.score}</b><span>${esc(b.th)}</span></div>
      <p class="sp-legend"><span class="sp-w is-ok">ชัด</span> <span class="sp-w is-close">ใกล้เคียง</span> <span class="sp-w is-miss">ยังไม่ชัด</span> · แตะคำเพื่อฟังเสียง</p>
      ${r.heard != null ? `<p class="sp-heard">${ICON('audio-lines', 'icon icon-sm')} ${r.typed != null ? 'คุณพิมพ์' : 'เครื่องได้ยินว่า'}: <span lang="en">“${esc(r.heard || '—')}”</span>${r.typed == null ? ' <small>(แสดงในเครื่องนี้เท่านั้น ไม่ถูกบันทึก)</small>' : ''}</p>` : ''}
      ${r.answer ? `<p class="sp-answer">เฉลย: <span lang="en">${esc(String(r.answer).replace(/\[\[|\]\]/g, ''))}</span></p>` : ''}
      ${miss.length && r.score < 100 ? `<p class="gl-note">ลองฟังคำที่ยังไม่ชัด${miss.length <= 4 ? ` (${miss.map((w) => esc(w.text)).join(', ')})` : ''} แบบช้าแล้วพูดอีกครั้ง</p>` : ''}`;
  }
  function navHtml() {
    const n = P.set.items.length;
    return `<nav class="sp-nav" aria-label="ไปประโยคอื่น">
      <button type="button" class="btn btn-secondary" data-sp-go="-1" ${P.idx === 0 ? 'disabled' : ''}>${ICON('chevron-left', 'icon icon-sm')} ก่อนหน้า</button>
      <button type="button" class="btn btn-primary" data-sp-go="1">${P.idx >= n - 1 ? `${ICON('flag', 'icon icon-sm')} สรุปผล` : `ถัดไป ${ICON('chevron-right', 'icon icon-sm')}`}</button>
    </nav>
    <ol class="sp-dots" aria-label="ความคืบหน้าในชุด">${P.set.items.map((it, i) => {
      const r = P.results.get(it.id); const sc = r ? r.score : it.best;
      const st = sc == null ? '' : sc >= SC().PASS ? ' is-pass' : ' is-try';
      return `<li><button type="button" class="sp-dot${st}${i === P.idx ? ' is-cur' : ''}" data-sp-idx="${i}" aria-label="ข้อ ${i + 1}${sc == null ? '' : ` คะแนน ${sc}`}" ${i === P.idx ? 'aria-current="step"' : ''}></button></li>`;
    }).join('')}</ol>`;
  }

  /* ---------- บทสนทนา (Role-play) ---------- */
  function dialogueHtml() {
    const items = P.set.items;
    const lines = items.slice(0, P.idx).map((it) => {
      const r = P.results.get(it.id);
      return `<li class="sp-line${isMine(it) ? ' is-me' : ''}"><b lang="en">${esc(it.speaker)}</b><span lang="en">${esc(String(it.text))}</span>
        ${r ? `<em class="sp-line-score${r.score >= SC().PASS ? ' is-pass' : ''}">${r.score}</em>` : ''}</li>`;
    }).join('');
    const cur = items[P.idx];
    const curHtml = isMine(cur)
      ? `<div id="sp-cur">${itemHtml(cur, true)}<nav class="sp-nav"><button type="button" class="btn btn-secondary" data-sp-dskip>${ICON('skip-forward', 'icon icon-sm')} ข้าม</button>
          <button type="button" class="btn btn-primary" data-sp-dnext ${P.results.has(cur.id) ? '' : 'disabled'}>${P.idx >= items.length - 1 ? `${ICON('flag', 'icon icon-sm')} จบบทสนทนา` : `ต่อไป ${ICON('chevron-right', 'icon icon-sm')}`}</button></nav></div>`
      : `<div id="sp-cur" class="sp-partner"><p class="sp-line is-partner"><b lang="en">${esc(cur.speaker)}</b><span lang="en">${esc(cur.text)}</span></p>
          ${cur.th ? `<p class="sp-th">${esc(cur.th)}</p>` : ''}
          <p class="sp-status">${ICON('volume-2', 'icon icon-sm')} อีกฝ่ายกำลังพูด…</p>
          <nav class="sp-nav"><button type="button" class="btn btn-secondary" data-sp-say="normal">${ICON('rotate-ccw', 'icon icon-sm')} ฟังอีกครั้ง</button>
          <button type="button" class="btn btn-primary" data-sp-dnext>ต่อไป ${ICON('chevron-right', 'icon icon-sm')}</button></nav></div>`;
    return `<p class="gl-note sp-role-note">คุณพูดเป็น <b lang="en">${P.role === 'all' ? 'ทุกบทบาท' : esc(P.role)}</b> · บรรทัด ${P.idx + 1}/${items.length}
        <button type="button" class="tq-link sp-link" data-sp-role-reset>${ICON('users', 'icon icon-sm')} เปลี่ยนบทบาท</button></p>
      <ol class="sp-dialog">${lines}</ol>${curHtml}`;
  }
  async function partnerTurn() {
    const it = P.set.items[P.idx]; const my = P;
    if (!ttsSupported()) return;                    // ไม่มีเสียง → ผู้ใช้กด "ต่อไป" เอง
    const ok = await say(it.text);
    if (ok && P === my && P.set.items[P.idx] === it && !P.ended) { await new Promise((r) => setTimeout(r, 450)); if (P === my && P.set.items[P.idx] === it) dialogueNext(); }
  }
  function dialogueNext() {
    stopAll(true);
    if (P.idx >= P.set.items.length - 1) { P.ended = true; } else P.idx += 1;
    renderPlay();
  }

  /* ---------- สรุปท้ายชุด ---------- */
  function summaryHtml() {
    const mine = P.set.kind === 'dialogue' ? ownItems() : P.set.items;
    const done = mine.map((it) => P.results.get(it.id)).filter(Boolean);
    const passed = done.filter((r) => r.score >= SC().PASS).length;
    const avg = done.length ? Math.round(done.reduce((a, r) => a + r.score, 0) / done.length) : null;
    const exp = done.reduce((a, r) => a + (r.exp || 0), 0);
    const weak = mine.filter((it) => { const r = P.results.get(it.id); return r && r.score < SC().PASS; });
    return `<section class="gl-card sp-summary" aria-labelledby="sp-sum-title">
      <h2 class="gl-h2" id="sp-sum-title">${ICON(passed && passed === done.length ? 'party-popper' : 'flag', 'icon')} สรุปรอบนี้</h2>
      <ul class="sp-stats"><li><b>${passed}/${mine.length}</b><small>ผ่าน (≥ ${SC().PASS}%)</small></li>
        <li><b>${avg == null ? '—' : `${avg}%`}</b><small>ความชัดเจนเฉลี่ย</small></li><li><b>+${exp}</b><small>EXP</small></li></ul>
      ${weak.length ? `<h3 class="gl-h4">ควรฝึกซ้ำ</h3><ul class="sp-weak">${weak.map((it) => `<li><span lang="en">${esc(String(it.text).replace(/\[\[|\]\]/g, ''))}</span> <em>${P.results.get(it.id).score}%</em></li>`).join('')}</ul>` : ''}
      <div class="gl-actions">
        <button type="button" class="btn btn-secondary" data-sp-again>${ICON('rotate-ccw', 'icon icon-sm')} ฝึกชุดนี้อีกครั้ง</button>
        ${P.set.next ? `<button type="button" class="btn btn-primary" data-sp-set="${esc(P.set.next)}">${ICON('skip-forward', 'icon icon-sm')} ชุดถัดไป</button>` : ''}
        <button type="button" class="btn btn-secondary" data-sp-nav="speak">${ICON('list-checks', 'icon icon-sm')} เลือกชุดอื่น</button>
      </div></section>`;
  }

  /* ---------- พูด → ให้คะแนน → บันทึก ---------- */
  async function doMic() {
    if (!P || P.busy) { if (rec) stopRec(false); return; }
    const it = P.set.items[P.idx];
    if (!srSupported()) { switchMode('type'); return; }
    const c = await consent();
    if (c === 'type') { switchMode('type'); return; }
    if (!c) return;
    const btn = document.getElementById('sp-mic'); const st = document.getElementById('sp-status'); const im = document.getElementById('sp-interim');
    if (!btn) return;
    P.busy = true;
    btn.classList.add('is-rec'); btn.setAttribute('aria-label', 'หยุดฟัง');
    st.textContent = 'กำลังฟัง… พูดได้เลย (กดอีกครั้งเพื่อจบ)';
    im.textContent = '';
    const my = P;
    let alts;
    try {
      alts = await listen((t) => { if (im.isConnected) im.textContent = t; });
    } catch (err) {
      if (P !== my) return;
      P.busy = false;
      btn.classList.remove('is-rec'); btn.setAttribute('aria-label', 'กดแล้วพูด');
      if (err.code === 'aborted') { st.textContent = 'กดไมค์แล้วพูดประโยคนี้'; return; }
      if (err.code === 'not-allowed' || err.code === 'service-not-allowed') micDenied = true;
      st.innerHTML = `<span class="sp-err" role="alert">${ICON('circle-alert', 'icon icon-sm')} ${esc(MIC_ERR[err.code] || 'ฟังไม่สำเร็จ ลองอีกครั้ง')}</span>
        ${micDenied || err.code === 'network' || err.code === 'audio-capture' ? ' <button type="button" class="tq-link sp-link" data-sp-mode="type">ใช้ฟังแล้วพิมพ์</button>' : ''}`;
      return;
    }
    if (P !== my) return;
    P.busy = false;
    const r = SC().score(it.text, alts);
    const res = { score: r.score, words: r.words, heard: r.heard };
    P.results.set(it.id, res);
    let saved = null;
    try {
      saved = await api('/attempt', { method: 'POST', body: { itemId: it.id, heard: [].concat(alts).filter((x) => typeof x === 'string').slice(0, 8).map((x) => x.slice(0, 300)) } });
      // คะแนนที่บันทึกคือของเซิร์ฟเวอร์ (ตัวให้คะแนนเดียวกัน ปกติเท่ากัน)
      if (saved && Number.isInteger(saved.score) && saved.score !== res.score) { res.score = saved.score; if (saved.words) res.words = saved.words; }
    } catch (err) { App().toast(err.message || 'บันทึกคะแนนไม่สำเร็จ', 'error'); }
    if (P !== my) return;
    afterSave(it, res, saved);
  }
  async function doType(form) {
    const it = P.set.items[P.idx];
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (P.busy) return;
    P.busy = true;
    const my = P;
    let d;
    try { d = await api('/dictation', { method: 'POST', body: { itemId: it.id, text } }); } catch (err) { P.busy = false; App().toast(err.message || 'ตรวจไม่สำเร็จ', 'error'); return; }
    if (P !== my) return;
    P.busy = false;
    const res = { score: d.score, words: d.words, heard: text, typed: text, answer: d.answer };
    P.results.set(it.id, res);
    afterSave(it, res, d);
  }
  function afterSave(it, res, saved) {
    if (saved) {
      res.exp = saved.exp || 0;
      it.best = saved.best; it.passed = saved.best >= SC().PASS;
      if (saved.levelInfo) App().applyLevelInfo(saved.levelInfo, saved.leveledUp);
      if (saved.exp) App().toast(`+${saved.exp} EXP · ฝึกพูด`, 'success');
      else if (saved.capped) App().toast('ได้ EXP ฝึกพูดครบโควตาวันนี้แล้ว — ฝึกต่อได้ คะแนนยังถูกบันทึก', 'info');
    }
    renderPlay();
    const sr = document.getElementById('sp-result');
    if (sr) sr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (P.set.kind === 'dialogue') { const nx = document.querySelector('[data-sp-dnext]'); if (nx) nx.focus({ preventScroll: true }); }
  }

  function switchMode(m) {
    if (!P) return;
    if (m === 'speak' && !srSupported()) return;
    if (m === 'speak') micDenied = false;    // ผู้ใช้เลือกกลับมาพูดเอง (เช่น เพิ่งเปิดสิทธิ์ไมค์)
    stopAll(true);
    P.mode = m; ls.set('eq_speak_mode', m);
    // เปลี่ยนโหมดแล้วเริ่มข้อปัจจุบันใหม่ (ไม่โชว์เฉลยของอีกโหมดค้าง)
    const it = P.set.items[P.idx]; if (it) P.results.delete(it.id);
    renderPlay();
    if (m === 'type') { const i = document.getElementById('sp-input'); if (i) i.focus({ preventScroll: true }); }
  }
  function go(delta) {
    stopAll(true);
    const n = P.set.items.length;
    if (delta > 0 && P.idx >= n - 1) { P.ended = true; renderPlay(); return; }
    P.idx = Math.max(0, Math.min(n - 1, P.idx + delta));
    renderPlay();
  }

  function stopAll(keepP) {
    stopSay(); stopRec(true);
    if (P) P.busy = false;
    if (!keepP) P = null;
  }

  /* ---------- เหตุการณ์ ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('.sp-screen, .sp-consent')) return;
    const q = (s) => t.closest(s);
    let b;
    if ((b = q('[data-sp-nav]'))) { e.preventDefault(); stopAll(); App().navigateTo(b.dataset.spNav); return; }
    if ((b = q('[data-sp-level]'))) { H.level = b.dataset.spLevel; ls.set('eq_speak_level', H.level); openHub(); return; }
    if ((b = q('[data-sp-kind]'))) {
      H.kind = b.dataset.spKind; ls.set('eq_speak_kind', H.kind);
      document.querySelectorAll('[data-sp-kind]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on)); });
      loadSets(); return;
    }
    if ((b = q('[data-sp-set]'))) { openPlay(b.dataset.spSet); return; }
    if (!P) return;
    if ((b = q('[data-sp-mode]'))) { if (!b.disabled) switchMode(b.dataset.spMode); return; }
    if ((b = q('[data-sp-say]'))) { const it = P.set.items[P.idx]; if (it) say(it.text, b.dataset.spSay === 'slow'); return; }
    if ((b = q('[data-sp-word]'))) { say(b.dataset.spWord, true); return; }
    if (q('[data-sp-mic]')) { if (P.busy) stopRec(false); else doMic(); return; }
    if ((b = q('[data-sp-go]'))) { go(Number(b.dataset.spGo)); return; }
    if ((b = q('[data-sp-idx]'))) { stopAll(true); P.idx = Number(b.dataset.spIdx); renderPlay(); return; }
    if ((b = q('[data-sp-role]'))) { P.role = b.dataset.spRole; P.idx = 0; P.results.clear(); P.ended = false; renderPlay(); return; }
    if (q('[data-sp-role-reset]')) { stopAll(true); P.role = null; P.idx = 0; P.results.clear(); renderPlay(); return; }
    if (q('[data-sp-dnext]')) { dialogueNext(); return; }
    if (q('[data-sp-dskip]')) { dialogueNext(); return; }
    if (q('[data-sp-again]')) { P.results.clear(); P.idx = 0; P.ended = false; if (P.set.kind === 'dialogue') P.role = null; renderPlay(); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest && e.target.closest('[data-sp-type]');
    if (!f) return;
    e.preventDefault();
    if (P) doType(f);
  });
  // ออกจากหน้าฝึก → หยุดไมค์/เสียงทันที
  window.addEventListener('eq:screen', (e) => { if (!e.detail || e.detail.id !== 'screen-speak-play') { stopSay(); stopRec(true); if (P) P.busy = false; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSay(); stopRec(true); } });

  /** เราเตอร์ของโมดูล (เรียกจาก app.js navigateTo) */
  function open(view, param) {
    if (view === 'play' && param) return openPlay(param);
    return openHub();
  }
  window.EQSpeak = { open, _state: () => P };
})();
