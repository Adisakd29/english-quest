/*
  v1.21.0 ทายศัพท์ไม่รู้จบ (Endless) — หน้า #/endless
  ศูนย์รวม (สถิติ + อันดับสัปดาห์) → เกม (3 หัวใจ · 20 วิ/ข้อ · ยากขึ้นเรื่อย ๆ) → สรุป
  คำตอบที่ถูกมาจากเซิร์ฟเวอร์หลังตอบแล้วเท่านั้น · ข้อความทุกส่วนผ่าน esc
*/
(function () {
  'use strict';
  const App = () => window.EQApp;
  const esc = (s) => App().escapeHtml(String(s === null || s === undefined ? '' : s));
  const ICON = (n, c = 'icon') => (window.EQG && window.EQG.icon ? window.EQG.icon(n, c) : '');
  const api = (p, o) => App().api(p, o);
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const $ = (id) => document.getElementById(id);
  const root = () => $('screen-endless-root');
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { view: 'hub', stats: null, run: null, q: null, locked: false, timer: null, deadline: 0, last: null, summary: null, nextTimer: null, expTotal: 0 };

  function clearTimers() { clearInterval(S.timer); S.timer = null; clearTimeout(S.nextTimer); S.nextTimer = null; }
  function visible() { const s = $('screen-endless'); return s && !s.classList.contains('hidden'); }

  /* ---------------- ศูนย์รวม ---------------- */
  function setHash(h) { if (location.hash !== h) history.replaceState(null, '', h); }
  async function open() {
    clearTimers();
    S.view = 'hub';
    setHash('#/endless'); App().showScreen('screen-endless');
    root().innerHTML = '<p class="en-loading" role="status">กำลังโหลด…</p>';
    try { S.stats = await api('/endless'); } catch (err) {
      root().innerHTML = `<p class="en-error" role="alert">${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-en="hub">ลองอีกครั้ง</button>`;
      return;
    }
    renderHub();
  }
  function boardHtml(w) {
    if (!w.board.length) return '<p class="en-empty">ยังไม่มีใครเล่นสัปดาห์นี้ — เป็นคนแรกเลย!</p>';
    const me = App().user ? App().user.id : 0;
    const G = window.EQG;
    return `<ol class="en-board">${w.board.map((r) => `<li class="en-row${r.userId === me ? ' is-me' : ''}">
      <span class="en-rank r${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span>
      <span class="friend-avatar en-av${r.avatarImage ? ' has-image' : ''}">${G ? G.avatar(r.avatar, r.avatarImage, '', r.userId) : ''}</span>
      <b class="en-name" data-profile-uid="${Number(r.userId)}">${esc(r.username)}</b><span class="en-score">${fmt(r.score)} ข้อ</span></li>`).join('')}</ol>
      ${w.myRank && w.myRank > 20 ? `<p class="en-myrank">อันดับของคุณ: ${fmt(w.myRank)} (${fmt(w.myScore)} ข้อ)</p>` : ''}`;
  }
  function renderHub() {
    const st = S.stats;
    const r = st.rules;
    root().innerHTML = `
      <button class="game-exit gl-back" type="button" data-en="back">${ICON('arrow-left', 'icon icon-sm')} เล่น</button>
      <header class="page-hero en-hero"><div class="page-hero-text"><h1 class="page-title">ทายศัพท์ไม่รู้จบ</h1>
        <p class="page-sub">ตอบไปเรื่อย ๆ ยิ่งไปไกลยิ่งยาก · ผิด 3 ครั้งจบเกม · ได้ EXP ทุกข้อที่ถูก</p></div>
        <div class="page-hero-art">${window.EQG ? window.EQG.illo('endless') : ''}</div></header>
      <ul class="en-rules">
        <li>${ICON('heart', 'icon icon-sm')}<span><b>${r.hearts} หัวใจ</b>ตอบผิดหรือหมดเวลา เสีย 1 หัวใจ</span></li>
        <li>${ICON('timer', 'icon icon-sm')}<span><b>${r.secs} วินาที/ข้อ</b>เลือกคำตอบที่ถูกจากตัวเลือก</span></li>
        <li>${ICON('zap', 'icon icon-sm')}<span><b>ยากขึ้นเรื่อย ๆ</b>${r.stages.map((s) => s.cefr).join(' → ')} ตามจำนวนข้อที่ถูก</span></li>
        ${r.choices ? `<li>${ICON('list-checks', 'icon icon-sm')}<span><b>ยิ่งไกล ตัวเลือกยิ่งเยอะ</b>${r.choices.map((c) => `${c.n} ตัวเลือก`).join(' → ')} (ถูกครบ ${r.choices.slice(1).map((c) => c.from).join(' / ')} ข้อ)</span></li>` : ''}
        <li>${ICON('sparkles', 'icon icon-sm')}<span><b>EXP ${r.exp.A1}–${r.exp.C1} ต่อข้อ</b>ตามระดับคำ + โบนัสคอมโบ (ถูกติดกัน 5/10/20 ข้อ)</span></li>
      </ul>
      <div class="en-start">
        ${st.hasActive ? `<button class="btn btn-primary btn-lg" type="button" data-en="resume">${ICON('play', 'icon icon-sm')} เล่นต่อ</button>
          <button class="btn btn-secondary" type="button" data-en="start">เริ่มเกมใหม่</button>`
          : `<button class="btn btn-primary btn-lg" type="button" data-en="start">${ICON('play', 'icon icon-sm')} เริ่มเล่น</button>`}
      </div>
      <div class="en-cols">
        <section class="home-card en-me" aria-label="สถิติของคุณ"><h2 class="home-card-title">${ICON('trophy', 'icon')} สถิติของคุณ</h2>
          <dl class="en-stats"><div><dt>สถิติสูงสุด</dt><dd>${fmt(st.best)} ข้อ</dd></div><div><dt>คอมโบสูงสุด</dt><dd>${fmt(st.bestCombo)}</dd></div>
            <div><dt>เล่นแล้ว</dt><dd>${fmt(st.games)} เกม</dd></div><div><dt>EXP จากโหมดนี้</dt><dd>${fmt(st.totalExp)}</dd></div></dl></section>
        <section class="home-card en-week" aria-label="อันดับสัปดาห์นี้"><h2 class="home-card-title">${ICON('medal', 'icon')} อันดับสัปดาห์นี้</h2>
          <p class="en-week-sub">นับสถิติสูงสุดของแต่ละคน · เริ่มใหม่ทุกวันจันทร์</p>${boardHtml(st.week)}</section>
      </div>`;
    if (window.EQAvatar && window.EQAvatar.hydrate) window.EQAvatar.hydrate(root());
  }

  /* ---------------- เกม ---------------- */
  async function start(resume) {
    clearTimers();
    try {
      const r = await api('/endless/start', { method: 'POST', body: { resume: Boolean(resume) } });
      S.run = r.run; S.expTotal = r.run.expGained; S.view = 'game'; S.q = null;
      renderGame(); showQ(r.q);
    } catch (err) { App().toast(err.message || 'เริ่มเกมไม่สำเร็จ', 'error'); }
  }
  function heartsHtml(run) {
    let h = '';
    for (let i = 0; i < run.maxHearts; i += 1) h += `<span class="en-heart${i < run.hearts ? '' : ' is-lost'}">${ICON(i < run.hearts ? 'heart' : 'heart-crack', 'icon')}</span>`;
    return `<span class="en-hearts" role="img" aria-label="เหลือ ${run.hearts} จาก ${run.maxHearts} หัวใจ">${h}</span>`;
  }
  function renderGame() {
    root().innerHTML = `
      <div class="en-bar">
        <button class="game-exit" type="button" data-en="quit" aria-label="ออกจากเกม">${ICON('x', 'icon icon-sm')}</button>
        <span id="en-hearts"></span>
        <span class="en-chip en-stage" id="en-stage"></span>
        <span class="en-chip" id="en-score"></span>
        <span class="en-chip en-combo hidden" id="en-combo"></span>
      </div>
      <div class="en-timer" aria-hidden="true"><i id="en-timer-bar"></i></div>
      <p class="sr-only" id="en-live" aria-live="polite"></p>
      <section class="en-card" id="en-card"></section>
      <div class="en-opts" id="en-opts" role="group" aria-label="ตัวเลือก"></div>
      <div class="en-feedback" id="en-fb"></div>`;
    paintBar();
  }
  function paintBar() {
    const run = S.run;
    $('en-hearts').innerHTML = heartsHtml(run);
    $('en-stage').textContent = `ระดับ ${run.stage}`;
    $('en-score').innerHTML = `${ICON('circle-check', 'icon icon-xs')} ${fmt(run.score)} ข้อ`;
    const c = $('en-combo');
    c.classList.toggle('hidden', run.combo < 2);
    c.innerHTML = `${ICON('flame', 'icon icon-xs')} คอมโบ ${fmt(run.combo)}`;
  }
  function showQ(q) {
    const more = S.q && q.options.length > S.q.options.length;   // ตัวเลือกเพิ่มขึ้น (ยิ่งไกลยิ่งเยอะ)
    S.q = q; S.locked = false;
    const isEn = q.mode === 'en2th';
    $('en-card').innerHTML = `
      ${more ? `<p class="en-more" role="status">${ICON('list-checks', 'icon icon-xs')} ไปได้ไกลแล้ว! ตอนนี้มี ${q.options.length} ตัวเลือก</p>` : ''}
      <p class="en-ask">ข้อ ${fmt(q.no)} · ${isEn ? 'คำนี้แปลว่าอะไร?' : 'คำภาษาอังกฤษไหนตรงกับความหมายนี้?'}</p>
      <div class="en-prompt${isEn ? ' is-en' : ' is-th'}" ${isEn ? 'lang="en"' : 'lang="th"'}>${esc(q.prompt)}</div>
      <p class="en-pos"><span class="en-cefr">${esc(q.cefr)}</span> ${esc(q.posTh)} <span lang="en">(${esc(q.pos)})</span>
        ${q.say ? `<button class="mini-btn ghost en-say" type="button" data-en-say="${esc(q.say)}" aria-label="ฟังเสียงคำว่า ${esc(q.say)}">${ICON('volume-2', 'icon icon-sm')}</button>` : ''}</p>`;
    $('en-opts').dataset.n = String(q.options.length);
    $('en-opts').innerHTML = q.options.map((o, i) => `<button class="en-opt" type="button" data-en-choice="${i}" ${isEn ? 'lang="th"' : 'lang="en"'}><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('');
    $('en-fb').innerHTML = '';
    $('en-live').textContent = `ข้อ ${q.no}: ${q.prompt}`;
    const secs = Math.min(q.secs, q.secsLeft === undefined ? q.secs : q.secsLeft);
    if (secs <= 0) { choose(-1); return; }
    S.deadline = Date.now() + secs * 1000;
    const bar = $('en-timer-bar');
    const tick = () => {
      const left = S.deadline - Date.now();
      if (bar) { bar.style.width = `${Math.max(0, (left / (q.secs * 1000)) * 100)}%`; bar.classList.toggle('is-low', left < 5000); }
      if (left <= 0) { clearInterval(S.timer); S.timer = null; choose(-1); }
    };
    tick(); S.timer = setInterval(tick, 100);
    const first = document.querySelector('#en-opts .en-opt');
    if (first && window.matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }
  async function choose(i) {
    if (S.locked || !S.q) return;
    S.locked = true;
    clearInterval(S.timer); S.timer = null;
    const q = S.q;
    document.querySelectorAll('#en-opts .en-opt').forEach((b) => { b.disabled = true; });
    if (i >= 0) { const b = document.querySelector(`#en-opts [data-en-choice="${i}"]`); if (b) b.classList.add('is-picked'); }
    let r;
    try {
      r = await api('/endless/answer', { method: 'POST', body: { key: q.key, choice: i } });
    } catch (err) {
      if (err.status === 404 || err.status === 409) { App().toast(err.message, 'error'); open(); return; }
      S.locked = false;
      document.querySelectorAll('#en-opts .en-opt').forEach((b) => { b.disabled = false; });
      App().toast(err.message || 'ส่งคำตอบไม่สำเร็จ ลองอีกครั้ง', 'error');
      return;
    }
    S.run = r.run; S.expTotal = r.run.expGained;
    const opts = document.querySelectorAll('#en-opts .en-opt');
    opts.forEach((b, j) => { if (j === r.correctIndex) b.classList.add('is-right'); else if (j === i) b.classList.add('is-wrong'); });
    paintBar();
    if (r.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
    const rv = r.reveal;
    const line = `<span lang="en"><b>${esc(rv.word)}</b></span> <small>(${esc(rv.posTh)})</small> = <span lang="th">${esc(rv.th)}</span>`;
    if (r.correct) {
      $('en-fb').innerHTML = `<p class="en-ok">${ICON('circle-check', 'icon icon-sm')} ถูกต้อง! ${r.gained ? `<b class="en-exp">+${r.gained} EXP</b>` : r.tooFast ? '<small>ตอบเร็วเกินไป ข้อนี้ไม่ได้ EXP</small>' : ''}</p>`;
      $('en-live').textContent = `ถูกต้อง${r.gained ? ` ได้ ${r.gained} EXP` : ''}`;
      if (!reduced()) { const card = $('en-card'); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
    } else {
      $('en-fb').innerHTML = `<p class="en-bad">${ICON('heart-crack', 'icon icon-sm')} ${r.timeout ? 'หมดเวลา!' : 'ยังไม่ถูก'} — เสีย 1 หัวใจ</p><p class="en-reveal">${line}
        <button class="mini-btn ghost" type="button" data-en-say="${esc(rv.word)}" aria-label="ฟังเสียง ${esc(rv.word)}">${ICON('volume-2', 'icon icon-sm')}</button></p>
        ${r.over ? '' : `<button class="btn btn-primary en-next" type="button" data-en="next">ข้อต่อไป ${ICON('chevron-right', 'icon icon-sm')}</button>`}`;
      $('en-live').textContent = `${r.timeout ? 'หมดเวลา' : 'ผิด'} คำตอบคือ ${rv.word} แปลว่า ${rv.th} เหลือ ${r.run.hearts} หัวใจ`;
    }
    if (r.over) { S.summary = r.summary; S.nextTimer = setTimeout(() => renderOver(), 1800); return; }
    S.pendingNext = r.next;
    S.nextTimer = setTimeout(goNext, r.correct ? 800 : 3500);
    const nb = document.querySelector('#en-fb [data-en="next"]'); if (nb) nb.focus({ preventScroll: true });
  }
  function goNext() {
    clearTimeout(S.nextTimer); S.nextTimer = null;
    if (!S.pendingNext || !visible() || S.view !== 'game') return;
    const q = S.pendingNext; S.pendingNext = null; showQ(q);
  }

  /* ---------------- จบเกม ---------------- */
  function renderOver() {
    clearTimers();
    S.view = 'over';
    const s = S.summary;
    const missed = s.missed || [];
    root().innerHTML = `
      <section class="en-over" aria-labelledby="en-over-h">
        <div class="en-over-art">${window.EQG ? window.EQG.illo(s.newBest ? 'success' : 'endless') : ''}</div>
        <h1 class="page-title" id="en-over-h" tabindex="-1">${s.newBest ? 'สถิติใหม่!' : 'จบเกม'}</h1>
        <p class="en-big"><b>${fmt(s.score)}</b> ข้อ</p>
        <p class="en-sub">${s.newBest ? `ทำลายสถิติเดิม ${fmt(s.previousBest)} ข้อ` : `สถิติสูงสุดของคุณ ${fmt(Math.max(s.previousBest, s.score))} ข้อ`}</p>
        <dl class="en-stats en-over-stats"><div><dt>EXP ที่ได้</dt><dd>+${fmt(s.expGained)}</dd></div><div><dt>คอมโบสูงสุด</dt><dd>${fmt(s.bestCombo)}</dd></div>
          <div><dt>ไปถึงระดับ</dt><dd>${esc(s.stage)}</dd></div><div><dt>ตอบทั้งหมด</dt><dd>${fmt(s.answered)} ข้อ</dd></div></dl>
        ${missed.length ? `<h2 class="en-h2">คำที่พลาด</h2><ul class="en-missed">${missed.map((m) => `<li><span lang="en"><b>${esc(m.word)}</b></span> <small>${esc(m.posTh)} · ${esc(m.cefr)}</small>
            <span class="en-missed-th" lang="th">${esc(m.th)}</span>${m.timeout ? '<small class="en-to">หมดเวลา</small>' : ''}
            <button class="mini-btn ghost" type="button" data-en-say="${esc(m.word)}" aria-label="ฟังเสียง ${esc(m.word)}">${ICON('volume-2', 'icon icon-sm')}</button></li>`).join('')}</ul>
          <button class="btn btn-secondary" type="button" data-en="save">${ICON('bookmark-plus', 'icon icon-sm')} เก็บคำที่พลาดเข้าคิวทบทวน</button>` : ''}
        <div class="en-over-btns"><button class="btn btn-primary btn-lg" type="button" data-en="start">${ICON('rotate-ccw', 'icon icon-sm')} เล่นอีกครั้ง</button>
          <button class="btn btn-secondary" type="button" data-en="hub">ดูอันดับ</button></div>
      </section>`;
    const h = $('en-over-h'); if (h) h.focus({ preventScroll: true });
  }

  async function quit() {
    clearTimers();
    try {
      const r = await api('/endless/quit', { method: 'POST' });
      if (r.over && r.summary && r.summary.answered > 0) { S.summary = r.summary; renderOver(); } else open();
    } catch (_) { open(); }
  }
  function confirmQuit() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card"><h2>ออกจากเกม?</h2><p>เกมจะจบและนับคะแนนที่ทำได้ (${fmt(S.run ? S.run.score : 0)} ข้อ) · EXP ที่ได้แล้วยังอยู่ · เวลาของข้อนี้ยังเดินอยู่</p>
      <div class="en-over-btns"><button class="btn btn-secondary" type="button" data-q="stay">เล่นต่อ</button><button class="btn btn-primary" type="button" data-q="go">ออกจากเกม</button></div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: 'ออกจากเกม?', closeButton: false });
    ov.querySelector('[data-q="stay"]').addEventListener('click', () => ov.remove());
    ov.querySelector('[data-q="go"]').addEventListener('click', () => { ov.remove(); quit(); });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('#screen-endless [data-en], #screen-endless [data-en-choice], #screen-endless [data-en-say]');
    if (!t) return;
    if (t.dataset.enSay) { App().speak(t.dataset.enSay); return; }
    if (t.dataset.enChoice !== undefined) { choose(Number(t.dataset.enChoice)); return; }
    const a = t.dataset.en;
    if (a === 'start') start(false);
    else if (a === 'resume') start(true);
    else if (a === 'hub') open();
    else if (a === 'back') App().navigateTo('play');
    else if (a === 'quit') confirmQuit();
    else if (a === 'next') goNext();
    else if (a === 'save') {
      t.disabled = true;
      api(`/endless/runs/${Number(S.summary.id)}/save-missed`, { method: 'POST' })
        .then((r) => { App().toast(`เก็บ ${r.saved} คำเข้าคิวทบทวนแล้ว`, 'success'); t.innerHTML = `${ICON('check', 'icon icon-sm')} เก็บแล้ว`; })
        .catch((err) => { t.disabled = false; App().toast(err.message, 'error'); });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!visible() || S.view !== 'game' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('.modal-overlay')) return;
    if (/^[1-6]$/.test(e.key) && !S.locked && S.q && Number(e.key) <= S.q.options.length) { e.preventDefault(); choose(Number(e.key) - 1); }
    else if (e.key === 'Enter' && S.pendingNext && S.locked && document.activeElement && !document.activeElement.closest('#en-fb')) { e.preventDefault(); goNext(); }
  });
  // ออกจากหน้าระหว่างเกม: หยุดนับเวลาบนหน้าเว็บ (เกมยังค้างที่เซิร์ฟเวอร์ — กลับมากด "เล่นต่อ" ได้ · เวลาของข้อยังเดินตามจริง)
  window.addEventListener('hashchange', () => { if (!/^#\/endless/.test(location.hash)) clearTimers(); });

  window.EQEndless = { open, _state: S };
}());
