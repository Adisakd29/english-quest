/*
  v1.27.0 World Raid Boss — หน้าเกม (#/raid)
  - บอสตัวเดียวของทั้งเซิร์ฟเวอร์ · HP กลางจากเซิร์ฟเวอร์เท่านั้น (หน้าเว็บไม่คำนวณ/ไม่ส่งดาเมจ)
  - อัปเดตสด: WebSocket raid:state / raid:announce · หลุด → Polling /api/raid/poll ทุก 4 วินาที · กลับมา = ขอสถานะใหม่ทั้งหมด
  - รอบโจมตี 10 ข้อ (4 ตัวเลือก) · ตอบ → เซิร์ฟเวอร์ตรวจ → ดาเมจ/คำอธิบาย → ข้อถัดไป · รีเฟรชกลางรอบ = ทำต่อจากข้อเดิม
  - ฉาก 3D: public/js/raid-scene.js (lazy) · ไม่มี WebGL / เลือกโหมด 2D → ภาพบอสนิ่ง + แอนิเมชัน CSS
  - ข้อความทุกชิ้นจากผู้เล่น (ชื่อ/ฉายา) ผ่าน esc() หรือ textContent เท่านั้น
*/
(function () {
  'use strict';
  const app = () => window.EQApp;
  const api = (p, o) => app().api(p, o);
  const esc = (x) => String(x === null || x === undefined ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, cls = '') => (window.EQG ? window.EQG.icon(n, cls) : '');
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* - */ } };
  const reducedMotion = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || lsGet('eq_fest_fx') === 'off';
  const TYPE_TH = { vocab: 'Vocabulary', context: 'Sentence Completion', grammar: 'Grammar', reading: 'Reading', error: 'Error Identification', listening: 'Listening', spell: 'Spelling Strike' };
  const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const KIND_TH = { normal: 'โจมตี', combo: 'Combo', critical: 'Critical!', shield: 'กระแทกโล่', break: 'ทำลายโล่!', team: 'Team Bonus' };
  const SKILL = { vocab: 'Word Strike', context: 'Word Strike', grammar: 'Grammar Blade', error: 'Grammar Blade', reading: 'Knowledge Burst', listening: 'Knowledge Burst', spell: 'Spelling Strike' };

  const S = {
    root: null, data: null, boss: null, scene: null, sceneP: null, mode3d: null, round: null, answering: false, last: null, pendingNext: null,
    tab: 'board', feed: [], offset: 0, tick: null, poll: null, wsSub: false, wsWas: false, open: false, lbScope: 'current', lbCefr: '', announced: new Set(),
    seenDefeat: null, ultShown: null,
  };
  const now = () => Date.now() + S.offset;

  /* ================================================================ เปิดหน้า */
  async function open() {
    const host = document.getElementById('screen-raid-root');
    if (!host) return;
    app().showScreen('screen-raid');
    S.open = true;
    if (!S.root || !host.contains(S.root)) {
      host.innerHTML = shell();
      S.root = host.querySelector('.rd');
      bind();
    }
    await refresh(true);
    startLive();
  }
  function close() {
    S.open = false;
    autoCancel();
    clipStop();
    stopLive();
    if (S.scene) S.scene.pause();
  }

  function shell() {
    return `<div class="rd" data-phase="1">
      <div class="rd-top">
        <button type="button" class="rd-exit" data-rd="exit">${ic('arrow-left', 'icon-sm')}<span>ออกจาก Raid</span></button>
        <h1 class="rd-title"><span class="rd-title-kicker">WORLD RAID BOSS</span><span class="rd-title-main" id="rd-title">—</span></h1>
        <button type="button" class="rd-gear" data-rd="settings" aria-label="ตั้งค่าเอฟเฟกต์">${ic('settings', 'icon-sm')}</button>
      </div>
      <div class="rd-main">
        <section class="rd-stage" aria-label="ฉากต่อสู้">
          <div class="rd-canvas-host" id="rd-canvas-host"></div>
          <div class="rd-fallback" id="rd-fallback" hidden><img alt="" id="rd-fallback-img"></div>
          <div class="rd-hud">
            <div class="rd-chips"><span class="rd-chip rd-chip-lv" id="rd-lv">Lv.—</span><span class="rd-chip rd-chip-phase" id="rd-phase">—</span><span class="rd-chip rd-chip-players" id="rd-players" title="ผู้เล่นที่อยู่ในศึกตอนนี้">${ic('users', 'icon-sm')} 0</span></div>
            <div class="rd-hp" role="meter" aria-label="HP ของบอส" aria-valuemin="0" id="rd-hp">
              <div class="rd-hp-ghost" id="rd-hp-ghost"></div><div class="rd-hp-fill" id="rd-hp-fill"></div>
              <i class="rd-hp-tick" style="left:35%"></i><i class="rd-hp-tick" style="left:70%"></i>
              <span class="rd-hp-text" id="rd-hp-text">—</span>
            </div>
            <div class="rd-shield" id="rd-shield" hidden><span class="rd-shield-label" id="rd-shield-label">โล่</span><div class="rd-shield-bar"><i id="rd-shield-fill"></i></div><b id="rd-shield-num"></b></div>
            <div class="rd-status" id="rd-status"></div>
          </div>
          <div class="rd-dmg-layer" id="rd-dmg" aria-hidden="true"></div>
          <div class="rd-banner" id="rd-banner" role="status" aria-live="polite" hidden></div>
          <div class="rd-victory" id="rd-victory" hidden></div>
        </section>
        <section class="rd-panel" id="rd-panel" aria-live="polite"></section>
      </div>
      <section class="rd-info">
        <div class="vd-seg rd-tabs" role="tablist" aria-label="ข้อมูล Raid">
          <button class="vd-seg-btn active" type="button" role="tab" data-rd-tab="board" aria-selected="true">อันดับ</button>
          <button class="vd-seg-btn" type="button" role="tab" data-rd-tab="feed" aria-selected="false">ฟีดสด</button>
          <button class="vd-seg-btn" type="button" role="tab" data-rd-tab="rewards" aria-selected="false">รางวัล <span class="nav-badge hidden" id="rd-claim-badge">0</span></button>
          <button class="vd-seg-btn" type="button" role="tab" data-rd-tab="help" aria-selected="false">วิธีเล่น</button>
        </div>
        <div class="rd-tabbody" id="rd-tabbody"></div>
      </section>
    </div>`;
  }

  /* ================================================================ ข้อมูล */
  async function refresh(first = false) {
    let d;
    try { d = await api('/raid/state'); } catch (e) { renderError(e.message); return; }
    S.data = d;
    if (d.boss && d.boss.serverNow) S.offset = new Date(d.boss.serverNow).getTime() - Date.now();
    S.feed = (d.feed || []).slice();
    applyBoss(d.boss, { first });
    if (d.open && !S.round) {
      S.round = { attemptId: d.open.attemptId, total: d.open.total, index: d.open.index, question: d.open.question, cefr: d.open.cefr, answerLimitMs: d.open.answerLimitMs,
        player: d.open.player || null, stats: { correct: d.open.round.correct, answered: d.open.round.answered, damage: d.open.round.damage, combo: d.open.round.combo }, startedAt: Date.now() };
    }
    renderPanel();
    renderTab();
    badge(d.claimable || 0);
  }
  function renderError(msg) {
    const p = S.root && S.root.querySelector('#rd-panel');
    if (p) p.innerHTML = `<div class="rd-card"><p class="form-error">${esc(msg || 'โหลดไม่สำเร็จ')}</p><button type="button" class="btn-primary" data-rd="retry">ลองใหม่</button></div>`;
  }

  /* ================================================================ บอส + HUD */
  function applyBoss(b, { first = false, hits = [] } = {}) {
    if (!b) return;
    const prev = S.boss;
    if (prev && b.id === prev.id && b.v < prev.v) return;   // ข้อมูลเก่ากว่า (มาช้า) — ไม่ย้อน
    S.boss = b;
    const R = S.root; if (!R) return;
    R.dataset.phase = String(b.phase);
    R.dataset.family = b.family; R.dataset.status = b.status;
    R.style.setProperty('--rd-glow', b.glow || '#fff');
    R.style.setProperty('--rd-color', b.color || '#fff');
    R.querySelector('#rd-title').textContent = b.nameEn;
    R.querySelector('#rd-lv').textContent = `Lv.${b.level}`;
    R.querySelector('#rd-phase').textContent = `Phase ${b.phase} · ${b.phaseEn}`;
    const pl = R.querySelector('#rd-players');   // v1.27.1 คนที่อยู่ในศึกตอนนี้ (ไม่ใช่ผู้ร่วมสู้สะสม)
    pl.innerHTML = `<span class="rd-live">${fmt(b.online !== undefined ? b.online : b.participants)}</span> <span class="rd-chip-t">อยู่ในศึก</span>`;
    pl.setAttribute('aria-label', `ผู้เล่นที่อยู่ในศึกตอนนี้ ${b.online !== undefined ? b.online : b.participants} คน · ร่วมสู้บอสตัวนี้ทั้งหมด ${b.participants} คน`);
    const pct = b.maxHp ? Math.max(0, (b.hp / b.maxHp) * 100) : 0;
    const fill = R.querySelector('#rd-hp-fill'); const ghost = R.querySelector('#rd-hp-ghost');
    fill.style.width = `${pct}%`;
    clearTimeout(S.ghostT); S.ghostT = setTimeout(() => { ghost.style.width = `${pct}%`; }, 450);
    if (first || !prev || prev.id !== b.id) ghost.style.width = `${pct}%`;
    R.querySelector('#rd-hp-text').textContent = `${fmt(b.hp)} / ${fmt(b.maxHp)} HP`;
    const hpEl = R.querySelector('#rd-hp'); hpEl.setAttribute('aria-valuemax', String(b.maxHp)); hpEl.setAttribute('aria-valuenow', String(b.hp));
    if (prev && prev.id === b.id && b.hp < prev.hp) { hpEl.classList.remove('is-hit'); void hpEl.offsetWidth; hpEl.classList.add('is-hit'); }
    const sh = R.querySelector('#rd-shield');
    if (b.shield && b.shield.up) {
      sh.hidden = false;
      R.querySelector('#rd-shield-label').textContent = b.shieldTh;
      R.querySelector('#rd-shield-fill').style.width = `${Math.min(100, (b.shield.progress / b.shield.goal) * 100)}%`;
      R.querySelector('#rd-shield-num').textContent = `${b.shield.progress}/${b.shield.goal}`;
    } else sh.hidden = true;
    renderStatus();
    // เหตุการณ์สำคัญ (เปลี่ยน Phase / โล่แตก / ตาย) — แสดงแบนเนอร์ครั้งเดียว
    if (prev && prev.id === b.id) {
      if (b.phase > prev.phase) banner(b.phase === 2 ? `PHASE 2 · ${b.nameEn} คลั่ง! ${b.shieldTh}ปรากฏ` : `FINAL STAND · ร่างสุดท้ายของ ${b.nameEn}`, 'phase');
      if (b.stunUntil && !prev.stunUntil) banner('ทำลายโล่สำเร็จ! บอสมึน — ดาเมจทุกคน +30%', 'break');
      if (['defeated', 'settled'].includes(b.status) && !['defeated', 'settled'].includes(prev.status)) showVictory(true);
    }
    if (first && ['defeated', 'settled'].includes(b.status)) showVictory(false);
    if (b.status === 'active' || b.status === 'preparing') { const v = R.querySelector('#rd-victory'); if (v && prev && prev.id !== b.id) v.hidden = true; }
    ensureScene(b).then(() => { if (S.scene) { S.scene.setState(b); hits.forEach((h) => S.scene.hit({ amount: h.d, kind: h.k, qtype: h.q })); } });
    if (S.mode3d === false) fallbackFx(b, prev);
  }

  function renderStatus() {
    const b = S.boss; const el = S.root && S.root.querySelector('#rd-status'); if (!b || !el) return;
    const out = [];
    const t = now();
    if (b.status === 'preparing' && b.activeAt) out.push(`<span class="rd-pill rd-pill-warn">${ic('clock', 'icon-sm')} บอสกำลังปรากฏ ${cd(new Date(b.activeAt).getTime() - t)}</span>`);
    if (b.status === 'paused') out.push(`<span class="rd-pill">${ic('pause', 'icon-sm')} ปิดชั่วคราว</span>`);
    if (b.stunUntil && new Date(b.stunUntil).getTime() > t) out.push(`<span class="rd-pill rd-pill-team">${ic('zap', 'icon-sm')} บอสมึน · Team Bonus +30% · ${cd(new Date(b.stunUntil).getTime() - t)}</span>`);
    if (b.ultimateAt) {
      const left = new Date(b.ultimateAt).getTime() - t;
      if (left > 0 && left < 12000) {
        out.push(`<span class="rd-pill rd-pill-ult">${ic('triangle-alert', 'icon-sm')} ${esc(b.attacks.ultimate)} ใน ${Math.ceil(left / 1000)} วิ</span>`);
        if (S.ultShown !== b.ultimateAt) { S.ultShown = b.ultimateAt; banner(`ระวัง! ${b.attacks.ultimate}`, 'ult'); setTimeout(() => { if (S.scene) S.scene.bossMove('special'); }, Math.max(0, left - 900)); }
      }
    }
    if (['defeated', 'settled'].includes(b.status) && b.nextSpawnAt) out.push(`<span class="rd-pill">${ic('clock', 'icon-sm')} บอสถัดไปใน ${cd(new Date(b.nextSpawnAt).getTime() - t)}</span>`);
    el.innerHTML = out.join('');
  }
  const cd = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m}:${String(s % 60).padStart(2, '0')}`; };

  function banner(text, kind = '') {
    const el = S.root && S.root.querySelector('#rd-banner'); if (!el) return;
    el.className = `rd-banner rd-banner-${kind}`; el.textContent = text; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(S.bannerT); S.bannerT = setTimeout(() => { el.hidden = true; }, 3600);
  }

  /* ================================================================ ฉาก 3D / 2D */
  function quality() { return lsGet('eq_raid_q') || 'auto'; }
  async function ensureScene(b) {
    if (S.mode3d === false) return setFallback(b);
    if (!S.sceneP) {
      const host = S.root.querySelector('#rd-canvas-host');
      if (quality() === '2d' || !webglOk()) { S.mode3d = false; return setFallback(b); }
      S.sceneP = import('/js/raid-scene.js?v=1.27.1').then((m) => m.createScene(host, { quality: quality(), reducedMotion: reducedMotion() }))
        .then((sc) => { S.scene = sc; S.mode3d = true; sc.onFrame = posDamage; return sc; })
        .catch(() => { S.mode3d = false; S.sceneP = null; setFallback(b); return null; });
    }
    const sc = await S.sceneP;
    if (!sc) return null;
    try { await sc.setBoss(b); } catch (_) { S.mode3d = false; setFallback(b); }
    return sc;
  }
  function webglOk() {
    try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; }
  }
  function setFallback(b) {
    const fb = S.root.querySelector('#rd-fallback'); const img = S.root.querySelector('#rd-fallback-img');
    fb.hidden = false;
    if (b && b.assets && img.getAttribute('src') !== b.assets.art) { img.src = b.assets.art; img.alt = `${b.nameEn} (ภาพนิ่ง)`; }
    return null;
  }
  function fallbackFx(b, prev) {
    const fb = S.root.querySelector('#rd-fallback');
    if (prev && prev.id === b.id && b.hp < prev.hp) { fb.classList.remove('is-hit'); void fb.offsetWidth; fb.classList.add('is-hit'); }
    fb.classList.toggle('is-dead', ['defeated', 'settled'].includes(b.status));
  }

  /* ตัวเลขดาเมจลอย (ตรงตำแหน่งอกบอสบนจอ) */
  const dmgQ = [];
  function damageNumber(amount, kind, mine) {
    if (!S.root || !amount) return;
    const layer = S.root.querySelector('#rd-dmg');
    if (layer.childElementCount > 14) layer.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = `rd-num rd-num-${kind || 'normal'}${mine ? ' is-mine' : ''}`;
    el.textContent = `${kind === 'critical' ? 'CRIT ' : ''}-${fmt(amount)}`;
    el.dataset.ox = String((Math.random() - 0.5) * 120); el.dataset.oy = String((Math.random() - 0.5) * 40);
    layer.appendChild(el);
    dmgQ.push(el);
    posDamage();
    setTimeout(() => { el.remove(); const i = dmgQ.indexOf(el); if (i >= 0) dmgQ.splice(i, 1); }, 1300);
  }
  function posDamage() {
    if (!dmgQ.length) return;
    let p = { x: S.root.querySelector('#rd-dmg').clientWidth / 2, y: S.root.querySelector('#rd-dmg').clientHeight * 0.42 };
    if (S.scene) { try { p = S.scene.screenPoint(); } catch (_) { /* - */ } }
    for (const el of dmgQ) { el.style.left = `${p.x + Number(el.dataset.ox)}px`; el.style.top = `${p.y + Number(el.dataset.oy)}px`; }
  }

  /* ================================================================ แผงหลัก: ล็อบบี้ / คำถาม / สรุปรอบ */
  function renderPanel() {
    const p = S.root && S.root.querySelector('#rd-panel'); if (!p) return;
    const inRound = Boolean(S.round && !S.round.summary);
    if (S.root.dataset.inround !== String(inRound)) {
      S.root.dataset.inround = String(inRound);
      // มือถือ/แท็บเล็ต: ระหว่างรอบ ฉากเล็กลง + เลื่อนให้เห็นบอสและคำถามพร้อมกัน (ไม่ต้องเลื่อนขึ้นลงหาคำตอบ)
      if (inRound) scrollToRound();
      if (S.scene) setTimeout(() => S.scene.resize(), 320);
    }
    const b = S.boss; const d = S.data || {};
    if (!d.enabled && (!b || b.status === 'paused')) { p.innerHTML = `<div class="rd-card rd-lobby"><h2>World Raid ปิดชั่วคราว</h2><p class="rd-muted">ผู้ดูแลกำลังปรับปรุงระบบ — ดาเมจและรางวัลที่สะสมไว้ยังอยู่ครบ</p></div>`; return; }
    if (S.round && S.round.summary) { p.innerHTML = summaryHtml(S.round.summary); return; }
    if (S.round) {
      p.innerHTML = questionHtml(); startQTimer();
      const q = S.round.question;
      if (q && q.type === 'listening' && !S.round.last && clip.plays === 0 && !clip.playing) clipPlay();   // เล่นทันทีหลังกด "ข้อถัดไป"/"เข้าสู่การต่อสู้"
      return;
    }
    p.innerHTML = lobbyHtml();
  }

  /** มือถือ/แท็บเล็ต: เลื่อนให้ขอบบนของฉากบอสอยู่ใต้แถบบน (เห็นบอส + คำถาม + ตัวเลือก/คีย์บอร์ดในจอเดียว) */
  function scrollToRound() {
    if (window.innerWidth >= 1024) return;
    requestAnimationFrame(() => {
      const st = S.root.querySelector('.rd-stage'); const hud = document.getElementById('hud');
      const y = st.getBoundingClientRect().top + window.scrollY - ((hud && hud.offsetHeight) || 0) - 6;
      window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  function lobbyHtml() {
    const b = S.boss; const d = S.data || {}; const me = d.me; const cfg = d.config || {};
    if (!b) return '<div class="rd-card"><p class="rd-muted">กำลังเตรียมบอส…</p></div>';
    const dead = ['defeated', 'settled'].includes(b.status);
    const need = cfg.minCorrect || 5;
    const prog = me ? Math.min(100, Math.round((me.correct / need) * 100)) : 0;
    const rewards = (b.rewards || []).map((r) => `<li>${ic(r.kind === 'pframe' ? 'frame' : r.kind === 'title' ? 'crown' : 'award', 'icon-sm')}<span>${esc(r.nameTh)}</span></li>`).join('');
    return `<div class="rd-card rd-lobby">
      <div class="rd-lobby-head"><span class="rd-kicker">${esc(b.arenaTh)}</span><h2>${esc(b.nameTh)}</h2>
        <p class="rd-muted">ผู้เล่นทั้งเซิร์ฟเวอร์สู้กับบอสตัวเดียวกัน · ตอบคำถามภาษาอังกฤษถูก = โจมตีบอสจริง</p>
        ${cfg.wordLevel ? `<p class="rd-wordlv">${ic('book-open', 'icon-sm')} บอส Lv.${fmt(b.level)} ใช้ศัพท์ระดับ <b>${esc(cfg.wordLevel)}</b> ขึ้นไป (ถ้าระดับของคุณสูงกว่า ใช้ระดับของคุณ)</p>` : ''}</div>
      ${dead ? `<div class="rd-dead">${ic('trophy')}<div><b>ล้มบอสสำเร็จแล้ว!</b><span>บอสตัวถัดไปจะปรากฏตัวเร็ว ๆ นี้ — รับรางวัลได้ที่แท็บ "รางวัล"</span></div></div>`
        : `<button type="button" class="rd-cta" data-rd="enter" ${b.status !== 'active' || !d.roundsLeft ? 'disabled' : ''}>
            ${ic('swords')}<span><b>${b.status === 'preparing' ? 'บอสกำลังปรากฏตัว…' : 'เข้าโจมตี'}</b><small>${d.roundsLeft ? (cfg.playerHp ? `พลังชีวิต ${fmt(cfg.playerHp)} · ตอบผิดโดนบอสตี · วันนี้เหลือ ${d.roundsLeft} รอบ` : `รอบละ ${cfg.questionsPerRound || 10} ข้อ · วันนี้เหลือ ${d.roundsLeft} รอบ`) : 'วันนี้โจมตีครบแล้ว — พรุ่งนี้มาใหม่'}</small></span></button>
          <button type="button" class="rd-invite" data-rd="invite" ${b.status !== 'active' ? 'disabled' : ''}>${ic('message-circle', 'icon-sm')} ชวนเพื่อนในแชทโลกมาตีด้วยกัน</button>
          <button type="button" class="rd-autotoggle" data-rd="autotoggle" aria-pressed="${autoOn()}"><span class="rd-switch" aria-hidden="true"></span> เล่นต่อเนื่องอัตโนมัติ (ไปข้อถัดไป/ชุดถัดไปเอง)</button>`}
      <div class="rd-mine">
        <div class="rd-stat"><b>${fmt(me ? me.damage : 0)}</b><span>ดาเมจของฉัน</span></div>
        <div class="rd-stat"><b>${me ? `#${me.rank}` : '—'}</b><span>อันดับ</span></div>
        <div class="rd-stat"><b>${me ? `${me.accuracy}%` : '—'}</b><span>ความแม่นยำ</span></div>
      </div>
      <div class="rd-qual"><div class="rd-qual-top"><span>เกณฑ์รับรางวัล: ตอบถูก ${need} ข้อในบอสตัวนี้</span><b>${me ? Math.min(me.correct, need) : 0}/${need}</b></div>
        <div class="rd-bar"><i style="width:${prog}%"></i></div></div>
      ${rewards ? `<div class="rd-preview"><span class="rd-kicker">รางวัลเมื่อล้มบอส (ทุกคนที่ผ่านเกณฑ์ ไม่ต้องติด Top 10)</span><ul>${rewards}<li>${ic('sparkles', 'icon-sm')}<span>EXP + Coin ตามการมีส่วนร่วม</span></li></ul></div>` : ''}
    </div>`;
  }

  async function enter() {
    if (S.answering) return;
    S.answering = true;
    try {
      const r = await api('/raid/round', { method: 'POST', body: {} });
      S.round = { attemptId: r.attemptId, total: r.total, index: r.index, question: r.question, cefr: r.cefr, answerLimitMs: r.answerLimitMs, player: r.player || null, stats: { correct: 0, answered: 0, damage: 0, combo: 0 }, startedAt: Date.now() };
      if (S.data) S.data.roundsLeft = r.roundsLeft;
      if (r.boss) applyBoss(r.boss);
      renderPanel();
    } catch (e) {
      app().toast(e.message || 'เริ่มรอบไม่สำเร็จ', 'error');
    } finally { S.answering = false; }
  }

  /* v1.27.1 พลังชีวิตผู้เล่น + ความคืบหน้า (รอบยาว = นับข้อแทนจุด) */
  function progressHtml(r, dots) {
    const p = r.player;
    const many = r.total > 12;
    const prog = many ? `<span class="rd-qcount">ข้อ ${r.index + 1}${p ? '' : ` / ${r.total}`}</span>` : `<div class="rd-dots" aria-label="ข้อ ${r.index + 1} จาก ${r.total}">${dots}</div>`;
    if (!p) return prog;
    const pct = p.maxHp ? Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100))) : 0;
    return `<div class="rd-php${pct <= 30 ? ' is-low' : ''}" id="rd-php">
      <span class="rd-php-ic" aria-hidden="true">${ic('heart', 'icon-sm')}</span>
      <span class="rd-php-bar" role="progressbar" aria-label="พลังชีวิตของฉัน" aria-valuemin="0" aria-valuemax="${p.maxHp}" aria-valuenow="${p.hp}"><i style="width:${pct}%"></i></span>
      <b class="rd-php-n">${fmt(p.hp)}<small>/${fmt(p.maxHp)}</small></b>
      ${many ? prog : ''}</div>${many ? '' : prog}`;
  }
  function questionHtml() {
    const r = S.round; const q = r.question; const done = r.last;
    if (q.type === 'spell') return spellHtml(r, q, done);
    const dots = Array.from({ length: r.total }, (_, i) => `<i class="${i < r.index ? (r.marks && r.marks[i] ? 'ok' : 'no') : i === r.index ? 'cur' : ''}"></i>`).join('');
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const choices = q.choices.map((c, i) => {
      let cls = '';
      if (done) { if (i === done.correctIndex) cls = ' is-correct'; else if (i === done.choice) cls = ' is-wrong'; }
      return `<button type="button" class="rd-choice${cls}" data-rd-choice="${i}" ${done ? 'disabled' : ''}><span class="rd-letter">${letters[i]}</span><span class="rd-ctext" lang="en">${esc(c)}</span></button>`;
    }).join('');
    const combo = r.stats.combo || 0;
    return `<div class="rd-card rd-quiz">
      <div class="rd-quiz-top">
        <span class="rd-qtype">${esc(TYPE_TH[q.type] || q.type)} · ${q.type === 'listening' ? esc(q.difficultyTh ? `ระดับ${q.difficultyTh}` : '') : esc(q.cefr)}</span>
        <span class="rd-skill">${esc(SKILL[q.type] || 'Word Strike')}</span>
        <span class="rd-combo${combo >= 2 ? ' is-hot' : ''}" title="ตอบถูกติดกัน">${ic('flame', 'icon-sm')} x${combo}</span>
      </div>
      ${progressHtml(r, dots)}
      <div class="rd-timer"><i id="rd-qtimer"></i></div>
      ${q.instruction ? `<p class="rd-instr">${esc(q.instruction)}</p>` : ''}
      ${q.passage ? `<div class="rd-passage" lang="en">${q.passageTitle ? `<b>${esc(q.passageTitle)}</b>` : ''}${esc(q.passage).replace(/\n/g, '<br>')}</div>` : ''}
      ${q.type === 'listening' ? listenHtml(r, q, done) : `<p class="rd-prompt" lang="en">${esc(q.prompt)}</p>`}
      <div class="rd-choices">${choices}</div>
      ${done ? feedbackHtml(done) : ''}
    </div>`;
  }
  /* v1.27.1 Listening: เล่นเฉพาะช่วงคำถามของคลิป (ฟังได้ 2 ครั้ง) · เพลงหรี่อัตโนมัติระหว่างเล่น (audio.js) */
  const clip = { el: null, url: '', key: '', plays: 0, end: 0, playing: false, primed: false };
  const clipKey = (r, q) => `${r.attemptId}:${q.index}`;
  function listenHtml(r, q, done) {
    if (clip.key !== clipKey(r, q)) { clipStop(); clip.key = clipKey(r, q); clip.plays = 0; }
    const left = Math.max(0, 2 - clip.plays);
    return `<div class="rd-listen">
      <button type="button" class="rd-listen-btn${clip.playing ? ' is-playing' : ''}" data-rd="listen" ${done || (!left && !clip.playing) ? 'disabled' : ''} aria-label="ฟังคำถาม">
        ${ic('headphones')}<span id="rd-listen-label">${clip.playing ? 'กำลังเล่น…' : clip.plays ? 'ฟังอีกครั้ง' : 'ฟังคำถาม'}</span></button>
      <span class="rd-listen-left" id="rd-listen-left">${done ? '' : `ฟังได้อีก ${left} ครั้ง`}</span>
    </div>
    <p class="rd-prompt rd-prompt-listen" lang="th">${esc(q.prompt)}</p>`;
  }
  function clipUi() {
    const r = S.round; if (!r || !S.root) return;
    const q = r.question; if (!q || q.type !== 'listening') return;
    const btn = S.root.querySelector('.rd-listen-btn'); const lab = S.root.querySelector('#rd-listen-label'); const left = S.root.querySelector('#rd-listen-left');
    const n = Math.max(0, 2 - clip.plays);
    if (btn) { btn.classList.toggle('is-playing', clip.playing); btn.disabled = Boolean(r.last) || (!n && !clip.playing); }
    if (lab) lab.textContent = clip.playing ? 'กำลังเล่น…' : clip.plays ? 'ฟังอีกครั้ง' : 'แตะเพื่อฟังคำถาม';
    if (left && !r.last) left.textContent = `ฟังได้อีก ${n} ครั้ง`;
  }
  function clipStop() {
    clearTimeout(clip.stopT);
    if (clip.el) { try { clip.el.pause(); } catch (_) { /* - */ } }
    clip.playing = false;
  }
  // องค์ประกอบเสียงเดียวใช้ซ้ำทุกข้อ · อยู่ใน DOM → audio.js หรี่เพลงอัตโนมัติจากเหตุการณ์ play/pause
  const SILENT = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
  function clipEl() {
    if (clip.el) return clip.el;
    const a = document.createElement('audio');
    a.preload = 'auto'; a.hidden = true; a.className = 'rd-clip';
    a.addEventListener('timeupdate', () => { if (clip.playing && a.currentTime >= clip.end) { clipStop(); clipUi(); } });
    a.addEventListener('ended', () => { if (clip.playing) { clip.playing = false; clipUi(); } });
    a.addEventListener('playing', () => {   // หยุดตรงเวลาจบคำถาม (timeupdate ห่างได้ถึง 250ms)
      clearTimeout(clip.stopT);
      if (clip.playing) clip.stopT = setTimeout(() => { if (clip.playing) { clipStop(); clipUi(); } }, Math.max(0, (clip.end - a.currentTime) * 1000));
    });
    document.body.appendChild(a);
    clip.el = a; return a;
  }
  /** iOS/Safari: ปลดล็อกเสียงระหว่างที่ผู้เล่นแตะปุ่ม (ก่อนโหลดข้อถัดไปจากเซิร์ฟเวอร์) → ข้อฟังเล่นเองได้หลังโหลดเสร็จ */
  function clipPrime() {
    if (clip.primed) return;
    const a = clipEl(); clip.primed = true;
    if (clip.url) return;
    a.muted = true; a.src = SILENT;
    const p = a.play();
    const done = () => { if (!clip.url) { a.pause(); } a.muted = false; };
    if (p && p.then) p.then(done, () => { a.muted = false; clip.primed = false; }); else done();
  }
  function clipPlay() {
    const r = S.round; const q = r && r.question;
    if (!q || q.type !== 'listening' || !q.audio || r.last || clip.playing || clip.plays >= 2) return;
    const a = clipEl();
    if (clip.url !== q.audio.url) { a.muted = false; a.src = q.audio.url; clip.url = q.audio.url; }
    clip.end = q.audio.end + 0.15; clip.plays += 1; clip.playing = true; clipUi();
    const go = () => {
      try { a.currentTime = q.audio.start; } catch (_) { /* - */ }
      const p = a.play();
      if (p && p.catch) p.catch(() => { clip.plays = Math.max(0, clip.plays - 1); clip.playing = false; clipUi(); });   // เบราว์เซอร์ไม่ให้เล่นอัตโนมัติ → ให้แตะปุ่มเอง (ไม่เสียสิทธิ์ฟัง)
    };
    if (a.readyState >= 1) go(); else { a.addEventListener('loadedmetadata', go, { once: true }); a.load(); }
  }

  /* v1.27.0 Spelling Strike: คำแปลไทย → สะกดด้วยคีย์บอร์ดบนจอ (ไม่ใช้ <input> = ไม่เปิดคีย์บอร์ดของเครื่อง) */
  function spellTyped(r, q) {
    if (r.typed === undefined || r.typedFor !== q.index) { r.typed = q.hint || ''; r.typedFor = q.index; }
    return r.typed;
  }
  function slotsHtml(r, q, done) {
    const typed = spellTyped(r, q);
    const ans = done && done.answerText ? done.answerText : null;
    return Array.from({ length: q.length }, (_, i) => {
      const ch = typed[i] || '';
      let cls = i < (q.hint ? q.hint.length : 0) ? ' is-hint' : ch ? ' is-filled' : '';
      if (ans) cls = ch === ans[i] ? ' is-right' : ' is-bad';
      if (!done && i === typed.length) cls += ' is-cursor';
      return `<span class="rd-slot${cls}">${esc(ch)}</span>`;
    }).join('');
  }
  function spellHtml(r, q, done) {
    const combo = r.stats.combo || 0;
    const dots = Array.from({ length: r.total }, (_, i) => `<i class="${i < r.index ? (r.marks && r.marks[i] ? 'ok' : 'no') : i === r.index ? 'cur' : ''}"></i>`).join('');
    const typed = spellTyped(r, q);
    const keys = KB_ROWS.map((row, ri) => `<div class="rd-kb-row">${ri === 2 ? '' : ''}${[...row].map((k) => `<button type="button" class="rd-key" data-rd-key="${k}" ${done ? 'disabled' : ''}>${k.toUpperCase()}</button>`).join('')}${ri === 2 ? `<button type="button" class="rd-key rd-key-wide" data-rd-key="back" aria-label="ลบตัวอักษร" ${done ? 'disabled' : ''}>${ic('delete', 'icon-sm')}</button>` : ''}</div>`).join('');
    return `<div class="rd-card rd-quiz rd-spell">
      <div class="rd-quiz-top">
        <span class="rd-qtype">Spelling Strike · ${esc(q.cefr)}</span>
        <span class="rd-skill">ดาเมจ ×1.3</span>
        <span class="rd-combo${combo >= 2 ? ' is-hot' : ''}" title="ตอบถูกติดกัน">${ic('flame', 'icon-sm')} x${combo}</span>
      </div>
      ${progressHtml(r, dots)}
      <div class="rd-timer"><i id="rd-qtimer"></i></div>
      <p class="rd-instr">${esc(q.instruction)} · ${q.length} ตัวอักษร${q.hint ? ` · ขึ้นต้นด้วย ${esc(q.hint.toUpperCase())}` : ''}</p>
      <p class="rd-prompt rd-prompt-th" lang="th">${esc(q.prompt)}</p>
      <div class="rd-slots" id="rd-slots" lang="en" aria-live="polite" aria-label="คำที่สะกด: ${esc(typed)}">${slotsHtml(r, q, done)}</div>
      ${done ? feedbackHtml(done) : `<div class="rd-kb" role="group" aria-label="คีย์บอร์ดบนหน้าจอ">${keys}
        <button type="button" class="rd-key rd-key-go" data-rd-key="go" ${typed.length < q.length ? 'disabled' : ''}>${ic('swords', 'icon-sm')} โจมตี</button></div>`}
    </div>`;
  }
  function spellKey(k) {
    const r = S.round; if (!r || r.last || S.answering) return;
    const q = r.question; if (q.type !== 'spell') return;
    const typed = spellTyped(r, q);
    const min = q.hint ? q.hint.length : 0;
    if (k === 'back') { if (typed.length > min) r.typed = typed.slice(0, -1); }
    else if (k === 'go') { if (typed.length === q.length) { answer(null, r.typed); return; } }
    else if (/^[a-z]$/.test(k) && typed.length < q.length) r.typed = typed + k;
    const box = S.root.querySelector('#rd-slots'); if (box) { box.innerHTML = slotsHtml(r, q, null); box.setAttribute('aria-label', `คำที่สะกด: ${r.typed}`); }
    const go = S.root.querySelector('[data-rd-key="go"]'); if (go) go.disabled = r.typed.length < q.length;
    if (window.EQAudio && k !== 'go') window.EQAudio.sfx('click');
  }

  function feedbackHtml(x) {
    const ok = x.correct;
    const msg = x.flagged === 'too_fast' ? 'ตอบเร็วเกินกว่าจะอ่านทัน — ข้อนี้ไม่นับดาเมจ' : x.timedOut ? 'หมดเวลา' : ok ? (x.damage ? `${KIND_TH[x.kind] || 'โจมตี'} · ${fmt(x.damage)} ดาเมจ` : 'ถูกต้อง (บอสไม่อยู่ในสถานะต่อสู้)') : 'ยังไม่ถูก';
    return `<div class="rd-feedback ${ok ? 'is-ok' : 'is-no'}">
      <b>${ic(ok ? 'circle-check' : 'circle-x', 'icon-sm')} ${esc(msg)}</b>
      ${x.exp && x.exp.gained > 0 ? `<p class="rd-fb-exp">${ic('star', 'icon-sm')} +${fmt(x.exp.gained)} EXP</p>` : x.exp && x.exp.capped ? `<p class="rd-fb-exp is-cap">${ic('star', 'icon-sm')} วันนี้ได้ EXP จากการตีบอสครบเพดานแล้ว — ดาเมจยังนับตามปกติ</p>` : ''}
      ${x.player && x.player.hit ? `<p class="rd-fb-hit">${ic('heart-crack', 'icon-sm')} บอสตีกลับ −${fmt(x.player.hit)} พลังชีวิต${x.player.ko ? ' — หมดแรงแล้ว' : ''}</p>` : ''}
      ${x.answerText && !ok ? `<p>คำที่ถูก: <b lang="en">${esc(x.answerText)}</b></p>` : ''}
      ${x.explain ? `<p>${esc(x.explain)}</p>` : ''}
      <button type="button" class="btn-primary rd-next" data-rd="next">${x.finished ? 'ดูสรุปรอบ' : 'ข้อถัดไป'}</button>
    </div>`;
  }

  /* v1.27.1 บอสตีกลับ (ตอบผิด/หมดเวลา): ท่าโจมตีของบอส + จอสั่นเบา ๆ + ตัวเลข −HP (ลดการเคลื่อนไหว = ไม่สั่น) */
  function bossStrike(amount, ko) {
    if (S.scene && S.scene.bossMove) S.scene.bossMove(S.boss && S.boss.phase >= 2 ? 'special' : 'attack');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = S.root.querySelector('.rd-stage') || S.root;
    if (!reduce) { card.classList.remove('is-struck'); void card.offsetWidth; card.classList.add('is-struck'); setTimeout(() => card.classList.remove('is-struck'), 600); }
    toastFx(`บอสโจมตี −${fmt(amount)} พลังชีวิต${ko ? ' · หมดแรง!' : ''}`, 'hurt');
    if (window.EQAudio) window.EQAudio.sfx('wrong');
  }
  function toastFx(text, kind) {
    const host = S.root.querySelector('.rd-stage') || S.root;
    const el = document.createElement('div'); el.className = `rd-pfx is-${kind}`; el.setAttribute('role', 'status'); el.textContent = text;
    host.appendChild(el); setTimeout(() => el.remove(), 1800);
  }

  /* v1.27.1 เล่นต่อเนื่อง: ตอบแล้วไปข้อถัดไปเอง (ถูก 1.4 วิ · ผิด 3.2 วิ ให้เห็นคำตอบที่ถูก) · ครบชุดแล้วเริ่มชุดใหม่เองใน 4 วิ
     แตะ "หยุดอ่านเฉลย" / "พัก" = ยกเลิกเฉพาะครั้งนั้น · ปิดถาวรได้ (จำไว้ในเครื่อง) · แท็บถูกซ่อน/เปิดดูเฉลย = รอ ไม่ข้ามเอง */
  const AUTO = { t: null, kind: null, until: 0 };
  const autoOn = () => { try { return localStorage.getItem('eq_raid_auto') !== 'off'; } catch (_) { return true; } };
  const setAutoOn = (on) => { try { localStorage.setItem('eq_raid_auto', on ? 'on' : 'off'); } catch (_) { /* - */ } };
  function autoCancel() { clearTimeout(AUTO.t); AUTO.t = null; AUTO.kind = null; AUTO.until = 0; const bar = S.root && S.root.querySelector('.rd-auto'); if (bar) bar.remove(); }
  function autoSchedule(kind, ms) {
    autoCancel();
    if (!autoOn() || !S.open) return;
    AUTO.kind = kind; AUTO.until = Date.now() + ms; AUTO.ms = ms; AUTO.last = { kind, ms };
    const host = S.root.querySelector(kind === 'round' ? '.rd-sum-actions' : '.rd-feedback');
    if (host) host.insertAdjacentHTML(kind === 'round' ? 'beforebegin' : 'beforeend', `<div class="rd-auto" role="status">
      <span class="rd-auto-bar" aria-hidden="true"><i style="animation-duration:${ms}ms"></i></span>
      <span class="rd-auto-t">${kind === 'round' ? 'เริ่มชุดต่อไปอัตโนมัติ' : 'ไปข้อถัดไปอัตโนมัติ'}</span>
      <button type="button" class="rd-auto-hold" data-rd="hold">${ic('pause', 'icon-sm')} ${kind === 'round' ? 'พัก' : 'หยุดอ่านเฉลย'}</button></div>`);
    const fire = () => {
      AUTO.t = null;
      if (!S.open || AUTO.kind !== kind) return;
      const rv = S.root.querySelector('.rd-review[open]');
      if (document.hidden || rv) { AUTO.t = setTimeout(fire, 800); return; }   // กำลังอ่านเฉลย/สลับแท็บ → รอ
      AUTO.kind = null;
      if (kind === 'round') { S.round = null; enter(); } else next();
    };
    AUTO.t = setTimeout(fire, ms);
  }

  let qTimer = null;
  function startQTimer() {
    cancelAnimationFrame(qTimer);
    const r = S.round; if (!r || r.last) return;
    const el = S.root.querySelector('#rd-qtimer'); if (!el) return;
    const start = r.qStart || (r.qStart = Date.now());
    const qt = r.question && r.question.type;
    const lim = (r.answerLimitMs || 30000) * (qt === 'spell' || qt === 'listening' ? 1.5 : 1);   // ตรงกับเวลาที่เซิร์ฟเวอร์ใช้
    const step = () => {
      const k = Math.max(0, 1 - (Date.now() - start) / lim);
      el.style.transform = `scaleX(${k})`;
      el.classList.toggle('is-low', k < 0.25);
      if (k > 0 && S.round === r && !r.last) qTimer = requestAnimationFrame(step);
      else if (k <= 0 && S.round === r && !r.last && !S.answering && !document.hidden) {   // v1.27.1 หมดเวลา = ส่งว่าง (เซิร์ฟเวอร์ตัดสินเอง · บอสตีกลับ)
        if (r.question && r.question.type === 'spell') answer(null, ''); else answer(null);
      }
    };
    step();
  }

  async function answer(choice, text = null) {
    const r = S.round; if (!r || r.last || S.answering) return;
    S.answering = true;
    clipStop();
    const btns = S.root.querySelectorAll('.rd-choice, .rd-key'); btns.forEach((b) => { b.disabled = true; });
    const picked = S.root.querySelector(`[data-rd-choice="${choice}"]`); if (picked) picked.classList.add('is-picked');
    try {
      const x = await api('/raid/answer', { method: 'POST', body: text !== null ? { attemptId: r.attemptId, index: r.index, text } : { attemptId: r.attemptId, index: r.index, choice } });
      r.last = { ...x, choice };
      r.marks = r.marks || []; r.marks[r.index] = x.correct;
      r.stats = { ...r.stats, correct: x.round ? x.round.correct : r.stats.correct, answered: x.round ? x.round.answered : r.stats.answered, damage: x.round ? x.round.damage : r.stats.damage, combo: x.combo || 0 };
      if (x.damage > 0) {
        damageNumber(x.damage, x.kind, true);
        if (S.scene) S.scene.hit({ amount: x.damage, kind: x.kind, qtype: x.qtype, mine: true });
        if (window.EQAudio) window.EQAudio.sfx(x.kind === 'critical' ? 'combo' : 'correct');
        pushFeed({ u: app().user && app().user.id, n: app().user ? app().user.username : 'ฉัน', d: x.damage, k: x.kind, at: new Date().toISOString() });
      } else if (window.EQAudio) window.EQAudio.sfx(x.correct ? 'correct' : 'wrong');
      if (x.exp && x.exp.gained > 0 && window.EQApp && window.EQApp.applyLevelInfo) window.EQApp.applyLevelInfo(x.exp.levelInfo, x.exp.leveledUp);   // v1.27.1 แถบ EXP/เลเวลบนหัวอัปเดตทันที
      if (x.player) {
        r.player = { hp: x.player.hp, maxHp: x.player.maxHp };
        if (x.player.hit > 0) bossStrike(x.player.hit, x.player.ko);
        else if (x.player.heal > 0) toastFx(`+${fmt(x.player.heal)} พลังชีวิต (ตอบถูกติดกัน)`, 'heal');
      }
      if (x.boss) { applyBoss(x.boss); liveSet(x.boss); }
      if (S.data && x.me) S.data.me = { ...(S.data.me || {}), ...x.me, accuracy: x.me.answered ? Math.round((x.me.correct / x.me.answered) * 100) : 0 };
      r.hasNext = Boolean(x.hasNext); r.finished = x.finished;
      renderPanel();
      const nb = S.root.querySelector('.rd-next'); if (nb) nb.focus({ preventScroll: true });
      autoSchedule('q', x.correct ? 1400 : 3200);
    } catch (e) {
      app().toast(e.message || 'ส่งคำตอบไม่สำเร็จ', 'error');
      if (e.status === 409 || /ROUND|INDEX/.test(e.code || '')) { S.round = null; await refresh(); } else btns.forEach((b) => { b.disabled = false; });
    } finally { S.answering = false; }
  }

  async function next() {
    const r = S.round; if (!r || !r.last) return;
    autoCancel();
    if (r.finished || !r.hasNext) {
      if (r.summary || r.loadingSummary) return;
      r.loadingSummary = true;
      try { r.summary = await api(`/raid/round/${encodeURIComponent(r.attemptId)}/summary`); } catch (_) { r.summary = { correct: r.stats.correct, answered: r.stats.answered, damage: r.stats.damage, bestCombo: 0, items: [] }; }
      renderPanel();
      await refreshMe();
      if (S.round === r) {
        renderPanel();
        const left = S.data ? S.data.roundsLeft : 0;
        if (left > 0 && S.boss && S.boss.status === 'active' && !(r.summary.player && r.summary.player.ko)) autoSchedule('round', 4000);   // หมดแรง = พักก่อน กด "สู้ต่อ" เอง
      }
      return;
    }
    if (S.answering) return;
    S.answering = true;
    let nq;
    try { nq = await api('/raid/round/next', { method: 'POST', body: { attemptId: r.attemptId } }); }
    catch (e) { app().toast(e.message || 'โหลดข้อถัดไปไม่สำเร็จ', 'error'); S.round = null; S.answering = false; await refresh(); return; }
    S.answering = false;
    r.index = nq.index; r.question = nq.question; r.last = null; r.hasNext = false; r.qStart = null;
    renderPanel();
    scrollToRound();
    const first = S.root.querySelector('.rd-choice'); if (first && !window.matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  function summaryHtml(s) {
    const left = S.data ? S.data.roundsLeft : 0;
    const items = (s.items || []).map((it) => `<li class="${it.correct ? 'ok' : 'no'}"><span class="rd-sum-q" lang="en">${esc(it.prompt)}</span>
      <span class="rd-sum-a">${ic(it.correct ? 'circle-check' : 'circle-x', 'icon-sm')} <span lang="en">${esc(it.type === 'spell' ? it.answerText : it.choices[it.correctIndex])}</span>${it.type === 'spell' && !it.correct && it.typed ? ` <small>(คุณสะกด: ${esc(it.typed)})</small>` : ''}${it.damage ? ` · ${fmt(it.damage)}` : ''}</span>
      ${it.explain ? `<small>${esc(it.explain)}</small>` : ''}</li>`).join('');
    return `<div class="rd-card rd-summary">
      ${s.player && s.player.ko ? `<div class="rd-ko">${ic('heart-crack')}<div><b>หมดแรง!</b><span>บอสตีจนพลังชีวิตหมด — ดาเมจที่ทำไปนับครบ ไม่เสีย Coin/EXP/ไอเทม · พักหายใจแล้วกด "สู้ต่อ" ได้เลย</span></div></div>` : ''}
      <span class="rd-kicker">สรุปรอบโจมตี</span>
      <div class="rd-mine">
        <div class="rd-stat"><b>${s.correct}/${s.answered}</b><span>ตอบถูก</span></div>
        <div class="rd-stat"><b>${fmt(s.damage)}</b><span>ดาเมจรอบนี้</span></div>
        <div class="rd-stat"><b>x${s.bestCombo || 0}</b><span>Combo สูงสุด</span></div>
      </div>
      <div class="rd-sum-actions">
        <button type="button" class="rd-cta" data-rd="again" ${!left || !S.boss || S.boss.status !== 'active' ? 'disabled' : ''}>${ic('swords')}<span><b>${s.player && s.player.ko ? 'สู้ต่อ' : 'โจมตีอีกรอบ'}</b><small>วันนี้เหลือ ${left || 0} รอบ</small></span></button>
        <button type="button" class="btn-secondary" data-rd="lobby">กลับหน้าบอส</button>
        <button type="button" class="rd-invite" data-rd="invite" ${!S.boss || S.boss.status !== 'active' ? 'disabled' : ''}>${ic('message-circle', 'icon-sm')} ชวนเพื่อนในแชทโลก</button>
      </div>
      <button type="button" class="rd-autotoggle" data-rd="autotoggle" aria-pressed="${autoOn()}"><span class="rd-switch" aria-hidden="true"></span> เล่นต่อเนื่องอัตโนมัติ (ไปข้อถัดไป/ชุดถัดไปเอง)</button>
      ${items ? `<details class="rd-review"><summary>ดูเฉลยและคำอธิบายทุกข้อ</summary><ol>${items}</ol></details>` : ''}
    </div>`;
  }
  async function refreshMe() {
    try { const d = await api('/raid/state'); S.data = { ...d, open: null }; badge(d.claimable || 0); if (S.tab !== 'feed') renderTab(); } catch (_) { /* - */ }
  }

  /* v1.27.1 (เจ้าของแจ้ง) คนที่รับรางวัลไปแล้วยังเห็นป๊อปอัป Victory + ปุ่ม "รับรางวัล" ทุกครั้งที่เปิดหน้า
     → ตรวจสถานะรางวัลของบอสตัวนี้จากเซิร์ฟเวอร์ก่อนแสดง:
       - ยังมีรางวัลให้รับ = แสดงพร้อมปุ่มรับรางวัล
       - รับครบแล้ว / ไม่เข้าเกณฑ์ = เปิดหน้าทีหลังไม่แสดงเลย · ตอนบอสล้มสด ๆ แสดงแค่ประกาศชัยชนะ + ปุ่มปิด
       - กดปิดแล้ว จำไว้ในเครื่อง (ไม่เด้งซ้ำเมื่อเปิดหน้าใหม่) */
  const VIC_KEY = 'eq_raid_victory_seen';
  const vicSeen = (id) => { try { return localStorage.getItem(VIC_KEY) === String(id); } catch (_) { return false; } };
  const vicMark = (id) => { try { localStorage.setItem(VIC_KEY, String(id)); } catch (_) { /* - */ } };
  async function showVictory(live) {
    const v = S.root.querySelector('#rd-victory'); const b = S.boss; if (!v || !b) return;
    if (S.seenDefeat === b.id && !live) return;
    S.seenDefeat = b.id;
    if (!live && vicSeen(b.id)) return;
    let rw = null;
    try { const r = await api('/raid/rewards'); rw = (r.rewards || []).find((x) => x.instanceId === Number(b.id)) || { claimable: [], tiers: [] }; } catch (_) { rw = null; }
    if (!S.root || !S.boss || S.boss.id !== b.id) return;
    const canClaim = Boolean(rw && rw.claimable && rw.claimable.length);
    const claimed = Boolean(rw && rw.tiers && rw.tiers.length && !canClaim);
    if (!live && !canClaim) return;   // เปิดหน้าทีหลัง + ไม่มีอะไรให้รับ = ไม่ต้องเด้ง
    const me = S.data && S.data.me;
    const note = canClaim ? '' : claimed ? '<p class="rd-victory-note">คุณรับรางวัลของบอสตัวนี้แล้ว</p>'
      : rw ? `<p class="rd-victory-note">ตอบถูกอย่างน้อย ${fmt((S.data && S.data.config && S.data.config.minCorrect) || 5)} ข้อในบอสตัวถัดไปเพื่อรับรางวัล</p>` : '';
    v.innerHTML = `<div class="rd-victory-card"><span class="rd-kicker">VICTORY</span><h2>ล้ม ${esc(b.nameEn)} Lv.${b.level} สำเร็จ!</h2>
      <p>ผู้ร่วมต่อสู้ ${fmt(b.participants)} คน${me ? ` · ดาเมจของคุณ ${fmt(me.damage)}` : ''}</p>${note}
      <div class="rd-victory-actions">${canClaim || !rw ? `<button type="button" class="btn-primary" data-rd="claimtab">${ic('gift', 'icon-sm')} รับรางวัล</button>` : ''}<button type="button" class="btn-secondary" data-rd="victory-close">ปิด</button></div></div>`;
    v.dataset.boss = String(b.id);
    v.hidden = false;
    if (window.EQAudio && live) window.EQAudio.cue && window.EQAudio.cue('victory');
  }
  function hideVictory() { const v = S.root && S.root.querySelector('#rd-victory'); if (!v) return; if (v.dataset.boss) vicMark(v.dataset.boss); v.hidden = true; }

  /* ================================================================ แท็บ: อันดับ / ฟีด / รางวัล / วิธีเล่น */
  async function renderTab() {
    const body = S.root && S.root.querySelector('#rd-tabbody'); if (!body) return;
    S.root.querySelectorAll('[data-rd-tab]').forEach((b) => { const on = b.dataset.rdTab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    if (S.tab === 'feed') { body.innerHTML = feedHtml(); return; }
    if (S.tab === 'help') { body.innerHTML = helpHtml(); return; }
    if (S.tab === 'rewards') {
      body.innerHTML = '<p class="rd-muted">กำลังโหลด…</p>';
      try { const [r, t] = await Promise.all([api('/raid/rewards'), api('/raid/trophies')]); if (S.tab === 'rewards') body.innerHTML = rewardsHtml(r.rewards, t); } catch (e) { body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
      return;
    }
    body.innerHTML = '<p class="rd-muted">กำลังโหลด…</p>';
    try {
      const q = `/raid/leaderboard?scope=${S.lbScope}${S.lbCefr ? `&cefr=${S.lbCefr}` : ''}`;
      const lb = await api(q);
      if (S.tab === 'board') body.innerHTML = boardHtml(lb);
    } catch (e) { body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }
  function boardHtml(lb) {
    const me = app().user ? app().user.id : null;
    const row = (r, i) => `<li class="rd-lb-row${r.id === me ? ' is-me' : ''}"><span class="rd-lb-rank">${i + 1}</span>
      <span class="rd-lb-name"><b>${esc(r.username)}</b>${r.title ? `<small class="rd-title-tag">${esc(r.title)}</small>` : ''}<small>Lv.${r.level}${r.cefr ? ` · ${esc(r.cefr)}` : ''} · ถูก ${fmt(r.correct)} (${r.accuracy}%)</small></span>
      <span class="rd-lb-dmg">${fmt(r.damage)}</span></li>`;
    const sum = lb.summary;
    return `<div class="rd-lb-ctl">
        <div class="vd-seg" role="group" aria-label="ช่วงอันดับ"><button type="button" class="vd-seg-btn${S.lbScope === 'current' ? ' active' : ''}" data-rd-scope="current">บอสตัวนี้</button><button type="button" class="vd-seg-btn${S.lbScope === 'all' ? ' active' : ''}" data-rd-scope="all">สะสมทั้งหมด</button></div>
        ${S.lbScope === 'current' ? `<div class="rd-cefr" role="group" aria-label="กรองตามระดับ">${['', 'A1', 'A2', 'B1', 'B2', 'C1'].map((c) => `<button type="button" class="${S.lbCefr === c ? 'on' : ''}" data-rd-cefr="${c}">${c || 'ทุกระดับ'}</button>`).join('')}</div>` : ''}
      </div>
      ${sum ? `<div class="rd-sum-row"><span>${ic('users', 'icon-sm')} ${fmt(sum.players)} คน</span><span>${ic('swords', 'icon-sm')} ${fmt(sum.damage)} ดาเมจ</span><span>${ic('circle-check', 'icon-sm')} ${fmt(sum.correct)} ข้อ (${sum.accuracy}%)</span></div>` : ''}
      ${lb.myRank ? `<p class="rd-myrank">อันดับของฉัน: <b>#${lb.myRank}</b>${lb.me ? ` · ${fmt(lb.me.damage)} ดาเมจ` : lb.myDamage ? ` · ${fmt(lb.myDamage)} ดาเมจ` : ''}</p>` : ''}
      <ol class="rd-lb">${(lb.top || []).map(row).join('') || '<li class="rd-muted">ยังไม่มีผู้โจมตี — เป็นคนแรกเลย!</li>'}</ol>
      ${lb.recent && lb.recent.length ? `<h3 class="rd-h3">ผู้ร่วมต่อสู้ล่าสุด</h3><ul class="rd-recent">${lb.recent.map((r) => `<li><b>${esc(r.username)}</b><span>${fmt(r.damage)}</span></li>`).join('')}</ul>` : ''}`;
  }
  function feedHtml() {
    if (!S.feed.length) return '<p class="rd-muted">ยังไม่มีความเคลื่อนไหว</p>';
    return `<ul class="rd-feed">${S.feed.slice(0, 20).map((h) => `<li class="rd-feed-${esc(h.k)}"><b>${esc(h.n)}</b>${h.t ? `<small class="rd-title-tag">${esc(h.t)}</small>` : ''}<span>${esc(KIND_TH[h.k] || 'โจมตี')}</span><em>-${fmt(h.d)}</em></li>`).join('')}</ul>`;
  }
  function pushFeed(h) { S.feed.unshift(h); if (S.feed.length > 40) S.feed.length = 40; if (S.tab === 'feed') renderTab(); }
  function rewardsHtml(list, tr) {
    const tierTxt = (t) => [t.exp ? `${t.exp} EXP` : '', t.coin ? `${t.coin} Coin` : '', ...t.items.map((i) => i.nameTh)].filter(Boolean).join(' · ');
    const rows = list.map((r) => `<li class="rd-rw">
        <div class="rd-rw-head"><b>${esc(r.nameEn)} Lv.${r.level}</b><small>ตอบถูก ${r.correct} ข้อ · ดาเมจ ${fmt(r.damage)}</small></div>
        <ul class="rd-rw-tiers">${r.tiers.map((t) => `<li class="${r.claimable.includes(t.tier) ? 'is-open' : 'is-done'}">${ic(r.claimable.includes(t.tier) ? 'gift' : 'circle-check', 'icon-sm')}<span>${esc(t.th)}</span><small>${esc(tierTxt(t))}</small></li>`).join('') || `<li class="rd-muted">ยังไม่ผ่านเกณฑ์ (ต้องตอบถูกอย่างน้อย ${(S.data && S.data.config && S.data.config.minCorrect) || 5} ข้อ)</li>`}</ul>
        ${r.claimable.length ? `<button type="button" class="btn-primary" data-rd-claim="${r.instanceId}">${ic('gift', 'icon-sm')} รับรางวัล</button><small class="rd-muted">รับได้ถึง ${new Date(r.expiresAt).toLocaleDateString('th-TH')}</small>` : ''}
      </li>`).join('');
    const titles = (tr.items || []).filter((i) => i.id.startsWith('raid-title:'));
    const items = (tr.items || []).map((i) => `<li>${ic(i.kind === 'title' ? 'crown' : i.kind === 'trophy' ? 'trophy' : 'award', 'icon-sm')}<span>${esc(i.nameTh)}</span></li>`).join('')
      + (tr.frames || []).map((f) => `<li>${ic('frame', 'icon-sm')}<span>${esc(f.nameTh)}</span></li>`).join('');
    return `${rows ? `<ul class="rd-rws">${rows}</ul>` : '<p class="rd-muted">ยังไม่มีรางวัลให้รับ — ร่วมโจมตีบอส แล้วรับรางวัลได้หลังบอสถูกล้ม (ไม่ต้องออนไลน์ตอนบอสตาย)</p>'}
      <h3 class="rd-h3">ห้องถ้วยรางวัล Raid</h3>
      ${items ? `<ul class="rd-trophies">${items}</ul>` : '<p class="rd-muted">ยังไม่มี</p>'}
      ${titles.length ? `<label class="rd-title-pick">ฉายาที่แสดงในหน้า Raid <select data-rd-title><option value="">ไม่แสดง</option>${titles.map((t) => `<option value="${esc(t.id)}" ${tr.title && tr.title.id === t.id ? 'selected' : ''}>${esc(t.nameTh)}</option>`).join('')}</select></label>` : ''}`;
  }
  function helpHtml() {
    const b = S.boss || {}; const cfg = (S.data && S.data.config) || {};
    return `<ol class="rd-help">
      <li><b>กด "เข้าโจมตี"</b> — ไม่ต้องสร้างห้องหรือรอใคร บอสตัวเดียวกันทั้งเซิร์ฟเวอร์</li>
      <li><b>${cfg.questionMode === 'mixed' ? 'โจทย์หลายแบบ' : 'พิมพ์คำอังกฤษจากความหมายไทย'}</b> — ${cfg.questionMode === 'mixed' ? 'คำศัพท์ · แกรมม่า · อ่าน · ฟัง · สะกด ระดับตามบอสและระดับของคุณ' : 'เห็นความหมายภาษาไทย → กดตัวอักษรบนคีย์บอร์ดในจอให้เป็นคำภาษาอังกฤษ (มีตัวอักษรแรกและจำนวนช่องบอก) · ระดับคำตามบอสและระดับของคุณ'}</li>
      ${cfg.playerHp ? `<li><b>พลังชีวิต ${fmt(cfg.playerHp)}</b> — ตอบถูก = ดาเมจใส่บอส · ตอบผิด/หมดเวลา = บอสตีกลับ (Phase 1/2/3: −${(cfg.bossHit || []).map(fmt).join('/−')}) · ${cfg.healEvery ? `ตอบถูกติดกันทุก ${cfg.healEvery} ข้อ ฟื้น +${fmt(cfg.healAmount)} · ` : ''}พลังหมด = จบรอบ (ไม่เสีย Coin/EXP/ไอเทม · ดาเมจนับครบ) · รอบละไม่เกิน ${cfg.questionsPerRound || 40} ข้อ</li>`
        : `<li><b>ตอบคำถาม ${cfg.questionsPerRound || 10} ข้อต่อรอบ</b> — คำถามตามระดับของคุณ (จากแบบทดสอบวัดระดับ) · ตอบถูก = ดาเมจ (เซิร์ฟเวอร์คำนวณ)</li>`}
      <li><b>Combo / Critical</b> — ตอบถูกติดกันได้ดาเมจเพิ่มสูงสุด +50% · ตอบถูกเร็ว (ภายใน 35% ของเวลา) หลังถูกติดกัน 2 ข้อ = Critical ×1.5</li>
      <li><b>Phase 2: ${esc(b.shieldTh || 'โล่')}</b> — ทุกคำตอบที่ถูกช่วยกันทำลายโล่ · โล่แตก = บอสมึน 90 วินาที ทุกคนดาเมจ +30% (Team Resonance)</li>
      <li><b>Phase 3: Final Stand</b> — บอสใช้ท่าไม้ตายเป็นระยะ · ช่วยกันจนกว่า HP จะหมด</li>
      ${cfg.wordLevel ? `<li><b>ศัพท์ยากขึ้นตามเลเวลบอส</b> — ทุก ${fmt(cfg.wordLevelEvery || 2)} เลเวล ศัพท์ขยับขึ้น 1 ระดับ (A1 → A2 → B1 → B2 → C1) · บอสตอนนี้ใช้ระดับ ${esc(cfg.wordLevel)} · ประมาณ 3 ใน 10 ข้อต่ำกว่า 1 ระดับ ให้ทุกคนยังช่วยตีได้ · ศัพท์ระดับสูงกว่าทำดาเมจมากกว่า</li>` : ''}
      ${cfg.hitExp ? `<li><b>EXP ทุกครั้งที่ตีโดน</b> — ตอบถูกแล้วทำดาเมจได้ +${fmt(cfg.hitExp)} EXP ทันที (วันละไม่เกิน ${fmt(cfg.hitExpDailyCap)} EXP · ตอบเร็วผิดปกติ/หมดเวลาไม่ได้)</li>` : ''}
      <li><b>รางวัล</b> — ตอบถูกอย่างน้อย ${cfg.minCorrect || 5} ข้อในบอสตัวนี้ = ได้รางวัลหลักเมื่อบอสถูกล้ม (ไม่ต้องติดอันดับ) · รับย้อนหลังได้ ${cfg.claimDays || 14} วัน</li>
      <li><b>ยุติธรรม</b> — วันละ ${cfg.roundsPerDay || 30} รอบ · ตอบเร็วเกินคนอ่านทันไม่นับดาเมจ · ไม่มีการซื้อดาเมจ</li>
    </ol>
    <p class="rd-muted">เอฟเฟกต์: ปรับคุณภาพได้ที่ปุ่มตั้งค่ามุมขวาบน · ระบบลดการเคลื่อนไหวของเครื่องจะลดการสั่น/อนุภาคให้อัตโนมัติ</p>`;
  }
  function badge(n) { const el = S.root && S.root.querySelector('#rd-claim-badge'); if (el) { el.textContent = String(n); el.classList.toggle('hidden', !n); } }

  async function claim(id, btn) {
    btn.disabled = true;
    try {
      const r = await api('/raid/rewards/claim', { method: 'POST', body: { instanceId: Number(id) } });
      const items = r.granted.flatMap((t) => t.items.map((i) => i.nameTh));
      app().toast(`ได้รับ ${r.exp ? `${r.exp} EXP ` : ''}${r.coin ? `${r.coin} Coin ` : ''}${items.length ? `· ${items.join(', ')}` : ''}`.trim() || 'รับรางวัลแล้ว', 'success');
      if (r.levelInfo && app().applyLevelInfo) app().applyLevelInfo(r.levelInfo);
      refreshMe(); renderTab();
    } catch (e) { app().toast(e.message, 'error'); btn.disabled = false; }
  }

  /* ================================================================ ตั้งค่าเอฟเฟกต์ */
  function settingsDialog() {
    const cur = quality();
    const opts = [['auto', 'อัตโนมัติ (แนะนำ)'], ['high', 'สูง'], ['medium', 'กลาง'], ['low', 'ต่ำ (ประหยัดแบตเตอรี่)'], ['2d', 'ภาพนิ่ง 2D (ไม่ใช้ 3D)']];
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rd-q-card"><h2 class="modal-title">คุณภาพกราฟิก World Raid</h2>
      <div class="rd-q-opts" role="radiogroup" aria-label="คุณภาพกราฟิก">${opts.map(([k, n]) => `<label><input type="radio" name="rdq" value="${k}" ${k === cur ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <p class="rd-muted">มีผลทันที · อุปกรณ์ที่ตั้ง "ลดการเคลื่อนไหว" จะไม่สั่นจอและลดอนุภาคให้เอง</p></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'คุณภาพกราฟิก World Raid' });
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.addEventListener('change', (e) => { if (e.target.name === 'rdq') { setQuality(e.target.value); ov.remove(); } });
  }
  function setQuality(v) {
    if (!['auto', 'high', 'medium', 'low', '2d'].includes(v)) return;
    lsSet('eq_raid_q', v);
    if (S.scene) { S.scene.destroy(); S.scene = null; }
    S.sceneP = null; S.mode3d = null;
    const fb = S.root.querySelector('#rd-fallback'); fb.hidden = true;
    if (S.boss) applyBoss({ ...S.boss, v: S.boss.v });
  }

  /* ================================================================ Realtime + Polling */
  function startLive() {
    stopLive();
    S.tick = setInterval(() => { renderStatus(); liveCheck(); }, 1000);
    liveCheck();
  }
  function stopLive() {
    clearInterval(S.tick); S.tick = null; clearInterval(S.poll); S.poll = null;
    if (S.wsSub && app().rtConnected) { try { app().rtSend('raid:unsub'); } catch (_) { /* - */ } }
    S.wsSub = false; S.wsWas = false;
  }
  function liveCheck() {
    if (!S.open) return;
    const on = app().rtConnected;
    if (on && (!S.wsSub || !S.wsWas)) {
      app().rtSend('raid:sub'); S.wsSub = true;
      if (S.wsWas === false && S.poll) refresh();   // กลับมาเชื่อมต่อ → ขอสถานะใหม่ทั้งหมด (State Resync)
      clearInterval(S.poll); S.poll = null;
    }
    if (!on && !S.poll) {
      S.wsSub = false;
      S.poll = setInterval(async () => {
        try { const d = await api('/raid/poll?in=raid'); if (d.boss) applyBoss(d.boss); } catch (_) { /* ลองใหม่รอบหน้า */ }
      }, 4000);
    }
    S.wsWas = on;
  }
  function onMessage(msg) {
    if (msg.type === 'raid:announce' && msg.announce) { announce(msg.announce); return; }
    if (msg.type === 'raid:hp') { liveSet(msg.boss); return; }   // v1.27.1 HP สดทุกคน (หน้าแรก · แชทโลก)
    if (msg.type === 'raid:state' && msg.state) liveSet(msg.state);
    if (msg.type !== 'raid:state' || !S.open) return;
    const meId = app().user ? app().user.id : null;
    const hits = (msg.hits || []).filter((h) => h.u !== meId);
    hits.forEach((h) => { pushFeed(h); damageNumber(h.d, h.k, false); });
    if (msg.state) applyBoss(msg.state, { hits });
  }

  /* ประกาศ (ทุกหน้า): แบนเนอร์เล็กด้านบน · ไม่ซ้ำ (id) · ชื่อผู้เล่นไม่อยู่ในข้อความประกาศ */
  function announce(a) {
    if (!a || S.announced.has(a.id)) return;
    S.announced.add(a.id);
    if (S.open && S.root) { banner(a.text, a.kind === 'defeated' ? 'win' : 'info'); return; }
    let el = document.getElementById('rd-announce');
    if (!el) {
      el = document.createElement('div'); el.id = 'rd-announce'; el.className = 'rd-announce'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-rd-go]')) { el.hidden = true; app().navigateTo('raid'); }
        else if (e.target.closest('[data-rd-x]')) el.hidden = true;
      });
    }
    el.innerHTML = `${ic('swords', 'icon-sm')}<span></span><button type="button" data-rd-go>ไปที่ Raid</button><button type="button" data-rd-x aria-label="ปิด">${ic('x', 'icon-sm')}</button>`;
    el.querySelector('span').textContent = a.text;
    el.hidden = false;
    clearTimeout(S.annT); S.annT = setTimeout(() => { el.hidden = true; }, 9000);
  }

  /* ================================================================ เหตุการณ์ */
  function bind() {
    S.root.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-rd-choice]'); if (ch) { answer(Number(ch.dataset.rdChoice)); return; }
      const key = e.target.closest('[data-rd-key]'); if (key) { spellKey(key.dataset.rdKey); return; }
      const tab = e.target.closest('[data-rd-tab]'); if (tab) { S.tab = tab.dataset.rdTab; renderTab(); return; }
      const sc = e.target.closest('[data-rd-scope]'); if (sc) { S.lbScope = sc.dataset.rdScope; renderTab(); return; }
      const cf = e.target.closest('[data-rd-cefr]'); if (cf) { S.lbCefr = cf.dataset.rdCefr; renderTab(); return; }
      const cl = e.target.closest('[data-rd-claim]'); if (cl) { claim(cl.dataset.rdClaim, cl); return; }
      const b = e.target.closest('[data-rd]'); if (!b) return;
      const k = b.dataset.rd;
      if (k === 'exit') { close(); app().navigateTo('play'); }
      else if (k === 'enter' || k === 'again') { autoCancel(); clipPrime(); S.round = null; enter(); }
      else if (k === 'next') { clipPrime(); next(); }
      else if (k === 'hold') autoCancel();
      else if (k === 'invite') sendInvite(b);
      else if (k === 'autotoggle') { setAutoOn(!autoOn()); autoCancel(); renderPanel(); }
      else if (k === 'listen') clipPlay();
      else if (k === 'lobby') { autoCancel(); S.round = null; renderPanel(); }
      else if (k === 'retry') refresh();
      else if (k === 'settings') settingsDialog();
      else if (k === 'claimtab') { hideVictory(); S.tab = 'rewards'; renderTab(); S.root.querySelector('.rd-info').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (k === 'victory-close') hideVictory();
    });
    S.root.addEventListener('change', async (e) => {
      if (e.target.matches('[data-rd-title]')) {
        try { await api('/raid/title', { method: 'PUT', body: { rewardId: e.target.value || null } }); app().toast('บันทึกฉายาแล้ว', 'success'); } catch (err) { app().toast(err.message, 'error'); }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (!S.open || !S.round || e.target.matches('input, textarea, select')) return;
      if (S.round.question && S.round.question.type === 'spell' && !S.round.last) {
        if (/^[a-zA-Z]$/.test(e.key)) { spellKey(e.key.toLowerCase()); e.preventDefault(); }
        else if (e.key === 'Backspace') { spellKey('back'); e.preventDefault(); }
        else if (e.key === 'Enter') { spellKey('go'); e.preventDefault(); }
        return;
      }
      if (/^[1-4]$/.test(e.key) && !S.round.last) answer(Number(e.key) - 1);
      else if ((e.key === 'Enter' || e.key === ' ') && S.round.last && !e.target.closest('button')) { e.preventDefault(); next(); }
    });
  }
  window.addEventListener('eq:screen', (e) => {
    if (e.detail.id !== 'screen-raid' && S.open) close();
    if (e.detail.id === 'screen-raid' && S.scene) S.scene.resume();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.open) refresh(); });

  /* การ์ด World Raid Boss: หน้า "เล่น" (play-raid-slot) + หน้าแรก (home-raid-slot · v1.27.1) — HP สด + ปุ่มเข้า
     ข้อมูลจาก /api/raid/poll เท่านั้น (สถานะบอสสาธารณะ ไม่มีข้อมูลส่วนตัวผู้เล่น) · ทุกค่าผ่าน esc/fmt */
  function playCardHtml(b, home) {
    const pct = b.maxHp ? Math.max(0, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
    const dead = ['defeated', 'settled'].includes(b.status);
    const wait = b.status === 'preparing' || b.status === 'paused';
    const sub = dead ? 'ล้มบอสแล้ว! รับรางวัล / รอบอสตัวถัดไป'
      : wait ? (b.status === 'paused' ? 'ผู้ดูแลพักการต่อสู้ชั่วคราว' : 'บอสตัวใหม่กำลังจะปรากฏ')
      : `<span class="rd-live">อยู่ในศึกตอนนี้ ${fmt(b.online || 0)} คน</span> · ร่วมสู้แล้ว ${fmt(b.participants)} คน · Phase ${fmt(b.phase)}`;
    const hp = `<span class="rd-playcard-hp"><span class="rd-bar rd-bar-hp" role="progressbar" aria-label="HP บอส" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span><small>${fmt(b.hp)} / ${fmt(b.maxHp)} HP · ${pct}%</small></span>`;
    return `<button type="button" class="rd-playcard${home ? ' is-home' : ''}" data-nav-to="raid" data-rd-card="${Number(b.id)}:${esc(b.status)}" aria-label="World Raid Boss ${esc(b.nameEn)} เลเวล ${fmt(b.level)} — ${dead ? 'ดูผล' : 'เข้าโจมตี'}" style="--rd-glow:${esc(b.glow)};--rd-color:${esc(b.color)}">
        <span class="rd-playcard-art"><img src="${esc(b.assets && b.assets.art)}" alt="" loading="lazy" onerror="this.remove()"></span>
        <span class="rd-playcard-body"><span class="rd-kicker">WORLD RAID BOSS${home ? '' : ' · ใหม่'}</span><b>${esc(b.nameEn)} <small>Lv.${fmt(b.level)}</small></b>
          ${home ? `<span class="rd-playcard-th">${esc(b.nameTh)}</span>` : ''}
          <span class="rd-playcard-sub">${sub}</span>${home ? '' : hp}</span>
        ${home ? hp : ''}
        <span class="rd-playcard-go">${ic('swords')}<span>${dead ? 'ดู' : 'เข้าโจมตี'}</span></span></button>`;
  }
  /* v1.27.1 HP บอสสด (ร่วมกันทุกจุด): /api/raid/poll ครั้งแรก → อัปเดตจาก WebSocket raid:hp (ทุกคนที่ออนไลน์) / raid:state */
  const LIVE = { boss: null, enabled: true, at: 0, loading: null };
  function liveSet(b) {
    if (!b) return;
    const full = LIVE.boss && LIVE.boss.id === b.id ? { ...LIVE.boss, ...b } : (b.nameEn ? b : null);
    if (!full) {   // บอสตัวใหม่/ยังไม่เคยโหลด → โหลดข้อมูลเต็ม (ชื่อ/ภาพ) เฉพาะเมื่อมีการ์ดแสดงอยู่ · หน่วงสุ่มกันทุกคนยิงพร้อมกัน
      const h = document.getElementById('screen-home');
      if (document.querySelector('[data-gc-raid]') || (h && !h.classList.contains('hidden'))) setTimeout(() => liveLoad(true), Math.random() * 2500);
      return;
    }
    LIVE.boss = full; LIVE.at = Date.now();
    liveRender();
  }
  function liveLoad(force = false) {
    if (!force && LIVE.boss && Date.now() - LIVE.at < 20000) return Promise.resolve(LIVE.boss);
    if (LIVE.loading) return LIVE.loading;
    LIVE.loading = api('/raid/poll').then((d) => { LIVE.enabled = d && d.enabled !== false; LIVE.boss = LIVE.enabled ? d.boss : null; LIVE.at = Date.now(); liveRender(); return LIVE.boss; })
      .catch(() => null).finally(() => { LIVE.loading = null; });
    return LIVE.loading;
  }
  /** อัปเดตการ์ดโดยไม่สร้างปุ่มใหม่ (ปุ่มเดิมอยู่ใต้นิ้วผู้ใช้ได้ตลอด — แตะระหว่าง HP อัปเดตก็ยังกดติด) */
  function patchCard(slot, b, home) {
    const card = slot.querySelector('.rd-playcard');
    if (!card || !b || card.dataset.rdCard !== `${Number(b.id)}:${b.status}`) { slot.innerHTML = b ? playCardHtml(b, home) : ''; return; }
    const tmp = document.createElement('div'); tmp.innerHTML = playCardHtml(b, home);
    ['.rd-playcard-sub', '.rd-playcard-hp'].forEach((sel) => { const a = card.querySelector(sel); const n = tmp.querySelector(sel); if (a && n && a.innerHTML !== n.innerHTML) a.innerHTML = n.innerHTML; });
  }
  function liveRender() {
    const b = LIVE.boss;
    const home = document.getElementById('home-raid-slot');
    if (home && (home.childElementCount || b)) patchCard(home, b, true);
    const play = document.getElementById('play-raid-slot');
    if (play && play.childElementCount) patchCard(play, b, false);
    document.querySelectorAll('[data-gc-raid]').forEach((el) => {
      const html = inviteInner(el.dataset.gcRaid);
      const body = el.querySelector('.gc-raid-body'); const go = el.querySelector('.gc-raid-go:not(.is-ghost)');
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const nb = tmp.querySelector('.gc-raid-body');
      if (body && go && nb && tmp.querySelector('.gc-raid-go:not(.is-ghost)')) { if (body.innerHTML !== nb.innerHTML) body.innerHTML = nb.innerHTML; }
      else el.innerHTML = html;
    });
  }
  /** การ์ดชวนตีบอสในแชทโลก (ข้อมูลบอสสาธารณะเท่านั้น · HP สด) */
  function inviteInner(ref) {
    const id = Number(String(ref || '').replace(/^R/, ''));
    const b = LIVE.boss;
    if (!b) { liveLoad(); return `<span class="gc-raid-wait">${ic('swords', 'icon-sm')} World Raid Boss · กำลังโหลด…</span>`; }
    const same = b.id === id; const live = same && ['active', 'preparing'].includes(b.status);
    if (!live) {
      return `<span class="gc-raid-done">${ic('trophy', 'icon-sm')} บอสตัวนี้จบศึกแล้ว</span>
        <button type="button" class="gc-raid-go is-ghost" data-nav-to="raid">${ic('swords', 'icon-sm')} ดูบอสตัวปัจจุบัน</button>`;
    }
    const pct = b.maxHp ? Math.max(0, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
    return `<span class="gc-raid-art"><img src="${esc(b.assets && b.assets.art)}" alt="" loading="lazy" onerror="this.remove()"></span>
      <span class="gc-raid-body"><b>${esc(b.nameEn)} <small>Lv.${fmt(b.level)}</small></b>
        <span class="rd-bar rd-bar-hp" role="progressbar" aria-label="HP บอส" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
        <small>${fmt(b.hp)} / ${fmt(b.maxHp)} HP · อยู่ในศึก ${fmt(b.online || 0)} คน</small></span>
      <button type="button" class="gc-raid-go" data-nav-to="raid">${ic('swords', 'icon-sm')} เข้าร่วม</button>`;
  }
  async function mountCard(slotId, home) {
    const slot = document.getElementById(slotId); if (!slot) return;
    const b = await liveLoad(true);
    patchCard(slot, b, home);
  }
  async function sendInvite(btn) {
    if (btn) btn.disabled = true;
    try {
      await api('/raid/invite', { method: 'POST', body: {} });
      app().toast('ส่งคำชวนในแชทโลกแล้ว — เพื่อนกดเข้าร่วมจากการ์ดในแชทได้เลย', 'success');
    } catch (e) {
      app().toast(e.message || 'ส่งคำชวนไม่สำเร็จ', 'error');
    } finally { if (btn) setTimeout(() => { btn.disabled = false; }, 3000); }
  }
  const mountPlayCard = () => mountCard('play-raid-slot', false);
  const mountHomeCard = () => mountCard('home-raid-slot', true);
  let homeTimer = null;
  const homeActive = () => { const h = document.getElementById('screen-home'); return Boolean(h && !h.classList.contains('hidden')) && !document.hidden; };
  function homeTick() {
    clearTimeout(homeTimer); homeTimer = null;
    if (!homeActive()) return;
    mountHomeCard();
    homeTimer = setTimeout(homeTick, app().rtConnected ? 60000 : 20000);   // WebSocket ส่ง HP สดอยู่แล้ว · หลุด = ดึงถี่ขึ้น   // HP สดบนหน้าแรก: ทุก 30 วินาทีเฉพาะตอนเปิดหน้าแรกอยู่
  }
  window.addEventListener('eq:screen', (e) => {
    if (e.detail.id === 'screen-play') mountPlayCard();
    if (e.detail.id === 'screen-home') setTimeout(homeTick, 0); else { clearTimeout(homeTimer); homeTimer = null; }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && homeActive()) homeTick(); });

  window.EQRaid = {
    open, close, onMessage, mountPlayCard, mountHomeCard, inviteInner, liveLoad, _live: () => LIVE,
    _state: () => ({ auto: { on: autoOn(), kind: AUTO.kind, ms: AUTO.kind ? AUTO.ms : 0, last: AUTO.last || null, msLeft: AUTO.until ? Math.max(0, AUTO.until - Date.now()) : 0 }, clip: { plays: clip.plays, playing: clip.playing, url: clip.url, t: clip.el ? clip.el.currentTime : 0 }, open: S.open, boss: S.boss, round: S.round && { index: S.round.index, total: S.round.total, attemptId: S.round.attemptId, last: Boolean(S.round.last) }, mode3d: S.mode3d,
      scene: S.scene ? S.scene.stats() : null, wsSub: S.wsSub, polling: Boolean(S.poll), feed: S.feed.length }),
  };
}());
