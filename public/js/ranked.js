/*
  Ranked Quest — หน้าเว็บ (Lobby / Match / Result / League Journey / Tutorial / คำแนะนำหน้า Home)
  กติกา:
    - เซิร์ฟเวอร์ตัดสินทุกอย่าง: หน้าเว็บส่งแค่ { questionIndex, choiceIndex } · ไม่คำนวณแต้มแรงค์ / ผลแพ้ชนะเอง
    - คู่แข่งในเกมปกติแสดงแบบเดียวกันทุกคน (ชื่อ · อวตาร · แรงค์) ไม่มีป้าย NPC/PLAYER ระหว่างเล่น (ตามที่เจ้าของระบบกำหนด)
      Guardian ของด่านเลื่อนขั้น / Apex Challenge ยังแสดงเป็นตัวละครบอสประจำด่าน
    - แยกโหมด Vocab / Grammar: แรงค์ · แต้มแรงค์ · ประวัติ · กระดานอันดับ แยกกัน (จำโหมดล่าสุดไว้ในเครื่อง)
    - ไม่มี emoji: ตรา/ตัวละครเป็น SVG (/assets/ranks, /assets/npcs, /assets/guardians) · ไอคอนเป็น Lucide
*/
(() => {
  'use strict';
  const G = window.EQG;
  const ic = G.icon;
  const esc = G.esc;
  const app = () => window.EQApp;

  let cfg = null;          // /api/ranked/config
  let me = null;           // /api/ranked/me
  let match = null;        // สถานะเกมปัจจุบัน
  let timerRaf = null;
  let clockOffset = 0;     // เวลาเซิร์ฟเวอร์ − เวลาเครื่อง (ใช้นับถอยหลังตามเวลาเซิร์ฟเวอร์)
  let answering = false;

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const leagueOf = (id) => cfg && cfg.leagues.find((l) => l.id === id);
  /** แรงค์สูง: แมตช์เลื่อนแรงค์เป็นเกม Ranked ปกติ (ไม่มีบอสประจำด่าน) — ค่ามาจากเซิร์ฟเวอร์ */
  const highRank = (id) => { const l = leagueOf(id); return Boolean(l && cfg.matchmaking && l.order >= cfg.matchmaking.highRankFromOrder); };
  /** ชื่อแรงค์ภาษาไทยจากข้อมูลกลาง (config/leagues.js) — ใช้แทนข้อความที่บันทึกไว้ในผลเก่า เพื่อให้ชื่อตรงกันทุกหน้า */
  const rankLabel = (leagueId, divisionIndex = 0) => {
    const l = leagueOf(leagueId);
    if (!l) return '';
    const d = l.divisions[divisionIndex] || '';
    return d ? `${l.name} ${d}` : l.name;
  };
  const npcOf = (id) => cfg && cfg.npcs.find((n) => n.id === id);
  const TYPE_TH = { vocabulary: 'คำศัพท์', grammar: 'แกรมม่า', context: 'บริบท', reading: 'การอ่าน' };

  /* ---------------- กราฟิก ---------------- */
  /* ตราประจำ League = ภาพที่ออกแบบแล้ว (WebP 3 ขนาด) — เลือกขนาดตามที่แสดงจริง ประหยัดแบนด์วิดท์ */
  const BADGE_SIZES = { 'rk-badge-xl': '168px', 'rk-badge-md': '72px', 'rk-badge-sm': '56px', 'rk-badge-inline': '18px',
    'rk-promo-old': '140px', 'rk-promo-new': '140px' };
  const badgeSrc = (id, n) => `/assets/ranks/${encodeURIComponent(id)}/badge-${n}.webp`;
  function badge(leagueId, cls = '') {
    const l = leagueOf(leagueId);
    const size = Object.keys(BADGE_SIZES).find((k) => cls.split(' ').includes(k));
    return `<img class="rk-badge ${esc(cls)}" src="${badgeSrc(leagueId, 192)}"
      srcset="${badgeSrc(leagueId, 96)} 96w, ${badgeSrc(leagueId, 192)} 192w, ${badgeSrc(leagueId, 384)} 384w"
      sizes="${size ? BADGE_SIZES[size] : '64px'}" alt="ตรา ${esc(l ? l.name : leagueId)}" decoding="async" ${cls.includes('xl') ? '' : 'loading="lazy"'} />`;
  }
  const isBoss = (n) => Boolean(n) && ['guardian', 'apex'].includes(n.role);
  // คู่แข่งในเกมปกติใช้อวตารชุดเดียวกับผู้เล่น (เลือกตามชื่อแบบคงที่ — คนเดิมได้อวตารเดิมเสมอ)
  const AV = ['fox', 'owl', 'cat', 'dog', 'rabbit', 'bear', 'panda', 'lion', 'tiger', 'koala', 'penguin', 'dragon'];
  const avatarOf = (n) => AV[[...String(n.id || n.name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) % AV.length];
  function portrait(npc, cls = '') {
    if (!npc) return '';
    if (npc.isNpc === false) return `<span class="rk-portrait rk-player-av ${cls}">${G.avatar(npc.avatar, npc.avatarImage)}</span>`;
    if (isBoss(npc)) {
      return `<svg class="rk-portrait ${cls}" viewBox="0 0 96 96" aria-hidden="true"><use href="/assets/guardians/guardians.svg#guardian-${esc(npc.id)}"></use></svg>`;
    }
    return `<span class="rk-portrait rk-player-av ${cls}">${G.avatar(avatarOf(npc))}</span>`;
  }
  /** ป้ายใต้ชื่อ: เฉพาะบอสประจำด่าน (Guardian / Apex) — คู่แข่งทั่วไปไม่มีป้าย */
  const npcTag = (npc) => (isBoss(npc) ? `<span class="rk-npc-tag">${esc(npc.role === 'apex' ? 'APEX CHALLENGE' : 'GUARDIAN')}</span>` : '');
  /* สีเข้มที่ใช้เป็นพื้นของตัวอักษรขาวได้ (WCAG ≥ 4.5:1) — บาง League มี accent สีอ่อน (River Otter / Storm Falcon)
     เลือกสีแรกในพาเลตที่ผ่าน ถ้าไม่มีให้ทำสีหลักให้เข้มขึ้นจนผ่าน → ไม่ต้อง hard-code ราย League */
  const lum = (hex) => {
    const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrastWhite = (hex) => 1.05 / (lum(hex) + 0.05);
  const darken = (hex, k) => `#${hex.replace('#', '').match(/../g).map((x) => Math.round(parseInt(x, 16) * k).toString(16).padStart(2, '0')).join('')}`;
  function strongColor(l) {
    const c = l.colors;
    const found = [c.accent, c.primary, c.secondary, c.base].filter(Boolean).find((x) => contrastWhite(x) >= 4.5);
    if (found) return found;
    let x = c.primary; for (let i = 0; i < 12 && contrastWhite(x) < 4.5; i += 1) x = darken(x, 0.9);
    return x;
  }
  const leagueVars = (l) => (l ? `--rk-p:${l.colors.primary};--rk-s:${l.colors.secondary};--rk-x:${strongColor(l)}` : '');

  async function ensureConfig() {
    if (!cfg) cfg = await app().api('/ranked/config');
    return cfg;
  }
  /* ---------- โหมด Ranked (Vocab / Grammar) — จำโหมดล่าสุดไว้ในเครื่อง ---------- */
  const MODE_TH = { vocab: 'คำศัพท์', grammar: 'แกรมม่า' };
  const MODE_EN = { vocab: 'Vocab', grammar: 'Grammar' };
  let rkMode = 'vocab';
  try { if (localStorage.getItem('eq_rk_mode') === 'grammar') rkMode = 'grammar'; } catch (_) { /* ใช้ค่าเริ่มต้น */ }
  function setMode(m) {
    rkMode = m === 'grammar' ? 'grammar' : 'vocab';
    try { localStorage.setItem('eq_rk_mode', rkMode); } catch (_) { /* - */ }
  }
  function modeSwitch(cls = '') {
    return `<div class="vd-seg rk-mode ${cls}" role="group" aria-label="โหมด Ranked">${['vocab', 'grammar'].map((m) => {
      const info = me && me.modes && me.modes[m];
      return `<button type="button" class="vd-seg-btn${m === rkMode ? ' active' : ''}" aria-pressed="${m === rkMode}" data-rk-mode="${m}">
        <span class="rk-mode-name">${ic(m === 'vocab' ? 'book-open' : 'type', 'icon-sm')} ${MODE_EN[m]}</span>${info ? `<small>${esc(info.label)}</small>` : ''}</button>`;
    }).join('')}</div>`;
  }

  async function loadMe() {
    await ensureConfig();
    me = await app().api(`/ranked/me?mode=${rkMode}`);
    return me;
  }

  /* ---------------- Fox Mascot (ผู้นำทาง — ไม่เป็นคู่แข่ง/แรงค์) ---------------- */
  function foxTip(state, text) {
    return `<div class="rk-fox">${G.mascot(state, 'rk-fox-art')}<p>${esc(text)}</p></div>`;
  }
  function foxLine(p) {
    if (p.promotionStatus === 'pending') return ['encouragement', 'อีกชัยชนะเดียวก็จะได้ขึ้น League ใหม่แล้ว ลุยด่านเลื่อนขั้นเลย'];
    if (p.promotionStatus === 'retry') return ['thinking', `เล่นเกมปกติอีก ${p.promotionRetryAfter} เกม แล้วกลับมาลองด่านเลื่อนขั้นใหม่ได้`];
    if (p.stats.played === 0) return ['welcome', `ยินดีต้อนรับสู่ Ranked Quest — แพ้ในแรงค์${rankLabel('trail-finch')}ไม่เสียแต้มแรงค์ ลองเล่นได้เต็มที่`];
    if (p.stats.currentStreak <= -2) return ['encouragement', 'ทบทวนข้อที่ผิดจากเกมก่อนแล้วลองใหม่ ความแม่นยำสำคัญกว่าความเร็ว'];
    return ['happy', 'ตอบให้ถูกก่อน แล้วค่อยเร็ว — ผลแพ้ชนะตัดสินจากความแม่นยำก่อนคะแนน'];
  }

  /* ================= LOBBY ================= */
  async function openLobby() {
    app().showScreen('screen-ranked');
    const box = document.getElementById('rk-lobby');
    box.innerHTML = G.skeleton('card');
    try {
      await loadMe();
      renderLobby();
      music('lobby');
      if (!me.profile.tutorialDone) openTutorial();
    } catch (err) {
      box.innerHTML = `<div class="state-error-card"><p>${esc(err.message)}</p><button class="btn btn-secondary" type="button" id="rk-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('rk-retry').addEventListener('click', openLobby);
    }
  }

  /** เป้าหมายถัดไปที่ชัดเจน: ต้องทำอะไรจึงจะเลื่อนระดับ (ข้อมูลจริงจากโปรไฟล์) */
  function nextGoal(p, l, next, pending) {
    const guardian = highRank(l.id) ? null : p.guardian;
    if (pending && !guardian) return { icon: 'flag', tone: 'ready', title: 'พร้อมเลื่อนแรงค์! แข่งแมตช์เลื่อนแรงค์', text: `ชนะเกมถัดไปเพื่อขึ้น ${next ? rankLabel(next.id, 0) : ''} · แพ้ไม่ตกขั้น` };
    if (pending) return { icon: 'flag', tone: 'ready', title: `พร้อมเลื่อนแรงค์! ท้าทาย ${guardian.name}`, text: `ชนะด่านบอสเพื่อขึ้น ${next ? rankLabel(next.id, 0) : ''} · แพ้ไม่ตกขั้น` };
    if (p.promotionStatus === 'retry') return { icon: 'clock', tone: 'wait', title: `เล่นเกมปกติอีก ${p.promotionRetryAfter} เกม`, text: 'แล้วกลับมาท้าทายด่านบอสได้อีกครั้ง' };
    if (!p.progress) return { icon: 'crown', tone: 'top', title: 'คุณอยู่แรงค์สูงสุดแล้ว', text: 'แข่งชิงอันดับในกลุ่มนี้ หรือท้า Apex Challenge' };
    const left = Math.max(0, p.progress.to - p.questRating);
    const lastDiv = p.divisionIndex === l.divisions.length - 1;
    if (lastDiv && next) return { icon: 'swords', tone: 'go', title: `อีก ${left.toLocaleString()} แต้ม ${guardian ? 'ปลดล็อกด่านบอส' : 'ปลดล็อกแมตช์เลื่อนแรงค์'}`, text: `${guardian ? `ชนะ ${guardian.name}` : 'ชนะแมตช์เลื่อนแรงค์'} แล้วขึ้น ${rankLabel(next.id, 0)}` };
    return { icon: 'target', tone: 'go', title: `อีก ${left.toLocaleString()} แต้ม ถึง ${rankLabel(l.id, p.divisionIndex + 1)}`, text: 'ชนะ 1 เกม ≈ +20 แต้ม · แม่นยำก่อนเร็ว' };
  }

  function renderLobby() {
    const p = me.profile;
    const l = leagueOf(p.league);
    const next = cfg.leagues.find((x) => x.order === l.order + 1);
    const pending = p.promotionStatus === 'pending' && Boolean(next) && Boolean(l.guardian); // แรงค์สูงสุดไม่มีด่านเลื่อนขั้น
    const [foxState, foxText] = foxLine({ ...p, promotionStatus: pending ? p.promotionStatus : (p.promotionStatus === 'pending' ? 'none' : p.promotionStatus) });
    const goal = nextGoal(p, l, next, pending);
    const pct = pending ? 100 : p.progress ? p.progress.pct : 100;
    const apex = p.league === 'aurora-lion' && !me.activeMatchId
      ? `<button class="btn btn-secondary rk-cta-sub" type="button" data-rk="apex">${ic('crown')} Apex Challenge</button>` : '';
    const cta = me.activeMatchId
      ? `<button class="btn btn-primary rk-cta" type="button" data-rk="resume">${ic('play')} เล่นเกมที่ค้างอยู่ต่อ</button>`
      : pending
        ? `<button class="btn rk-cta rk-cta-trial" type="button" data-rk="promotion">${ic('flag')} ${highRank(l.id) ? 'แข่งแมตช์เลื่อนแรงค์' : 'ท้าทายบอสเลื่อนแรงค์'}</button>
           ${highRank(l.id) ? '' : `<button class="btn btn-secondary rk-cta-sub" type="button" data-rk="ranked">${ic('swords')} แข่งเกมปกติ</button>`}`
        : `<button class="btn btn-primary rk-cta" type="button" data-rk="ranked">${ic('swords')} เริ่มการแข่งขัน</button>`;
    const npcNote = `โหมด${MODE_TH[rkMode]}: ${rkMode === 'vocab' ? 'คำแปลศัพท์ + เติมคำในบริบท' : 'แกรมม่า + บทอ่าน'} · แรงค์ของแต่ละโหมดแยกกัน`;
    const cefr = me.cefr.fromPlacement
      ? `ระดับภาษา (CEFR): <b>${esc(me.cefr.cefr)}</b> · ใช้เลือกความยากของคำถาม แยกจากแรงค์`
      : `ยังไม่ได้วัดระดับภาษา — คำถามจะเริ่มที่ A1 <button class="link-btn" type="button" data-rk="placement">วัดระดับ</button>`;
    const daysLeft = me.season.endsAt ? Math.max(0, Math.ceil((new Date(me.season.endsAt) - Date.now()) / 86400000)) : null;

    const lobby = document.getElementById('rk-lobby');
    lobby.style.cssText = leagueVars(l); // สีประจำแรงค์ใช้ได้ทั้งหน้า
    lobby.innerHTML = `
      ${modeSwitch('rk-mode-lobby')}
      <section class="rk-hero rk-hero-v2" aria-label="แรงค์ปัจจุบัน">
        <div class="rk-hero-badge${p.league === 'aurora-lion' ? ' rk-aurora-sweep' : ''}" style="--rk-badge-url:url('${badgeSrc(p.league, 384)}')">${badge(p.league, 'rk-badge-xl')}</div>
        <div class="rk-hero-info">
          <p class="rk-season">${esc(l.region)} · ${esc(me.season.name)}${daysLeft !== null ? ` · ซีซันเหลือ ${daysLeft} วัน` : ''}</p>
          <h2 class="rk-league"><span>${esc(l.name)}</span>${p.division ? ` <span class="rk-div">${esc(p.division)}</span>` : ''}${me.auroraRank ? ` <span class="rk-div">#${me.auroraRank}</span>` : ''}</h2>
          ${me.cosmetics && me.cosmetics.title ? `<p class="rk-title-chip">${ic('award', 'icon-sm')} ${esc(me.cosmetics.title.name)}</p>` : ''}
          <p class="rk-qr"><b>${p.questRating.toLocaleString()}</b> <span>แต้มแรงค์</span></p>
          <div class="rk-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="ความคืบหน้าสู่ขั้นถัดไป"><span style="width:${pct}%"></span></div>
          <div class="rk-goal rk-goal-${goal.tone}">${ic(goal.icon)}<span><b>${esc(goal.title)}</b><small>${esc(goal.text)}</small></span></div>
        </div>
        <dl class="rk-hero-stats">
          <div><dt>ชนะ</dt><dd>${p.stats.wins}</dd></div><div><dt>แพ้</dt><dd>${p.stats.losses}</dd></div>
          <div><dt>อัตราชนะ</dt><dd>${p.stats.winRate}%</dd></div><div><dt>ชนะติดสูงสุด</dt><dd>${p.stats.bestStreak}</dd></div>
        </dl>
      </section>
      ${cooldownBanner()}
      ${pending && p.guardian && !highRank(l.id) ? `<section class="rk-boss-card" aria-label="ด่านบอสเลื่อนแรงค์">
        <span class="rk-boss-pic">${portrait(npcOf(p.guardian.id), 'rk-portrait-sm')}</span>
        <span class="rk-boss-text"><small>ด่านบอสเลื่อนแรงค์ · พร้อมท้าทาย</small><b>${esc(p.guardian.name)}</b>${p.guardian.title ? `<small>${esc(p.guardian.title)}</small>` : ''}</span>
        <span class="rk-boss-to">${ic('chevron-right')}${next ? badge(next.id, 'rk-badge-sm') : ''}</span></section>` : ''}
      <div class="rk-cta-wrap">${cta}${apex}</div>
      <button class="rk-map-card" type="button" data-rk="journey">
        <span class="rk-map-art" aria-hidden="true"><svg viewBox="0 0 120 64"><defs><linearGradient id="rkmc" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#BFE6C6"/><stop offset=".5" stop-color="#46518F"/><stop offset="1" stop-color="#1C2347"/></linearGradient></defs>
          <rect width="120" height="64" rx="12" fill="url(#rkmc)"/><path d="M14 58 C 40 50, 30 36, 58 34 S 90 20, 104 8" stroke="#F6E7C6" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M14 58 C 40 50, 30 36, 58 34" stroke="#FFD66B" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="14" cy="58" r="4" fill="#2BA36B"/><circle cx="58" cy="34" r="5" fill="#FFD66B" stroke="#fff" stroke-width="2"/><circle cx="104" cy="8" r="4" fill="#A781FF"/></svg></span>
        <span class="rk-map-text"><b>เส้นทางสู่แรงค์สูงสุด</b><small>แผนที่ผจญภัย 9 ดินแดน · คุณอยู่ที่${esc(l.name)}</small></span>${ic('chevron-right')}
      </button>
      <div class="rk-quick">
        <button class="rk-quick-btn" type="button" data-rk="leaderboard">${ic('trophy', 'icon-sm')}<span>กระดานอันดับ</span></button>
        <button class="rk-quick-btn" type="button" data-rk="rewards">${ic('award', 'icon-sm')}<span>รางวัลแรงค์</span></button>
        <button class="rk-quick-btn" type="button" data-rk="howto">${ic('circle-help', 'icon-sm')}<span>วิธีเล่น</span></button>
      </div>
      <section class="rk-team" id="rk-team" aria-label="โหมดทีม 2 คน">${teamPanel()}</section>
      <p class="rk-note">${ic('info', 'icon-sm')} ${npcNote}</p>
      ${foxTip(foxState, foxText)}
      <p class="rk-cefr">${cefr}</p>
      ${app().user && app().user.role === 'admin' ? `<nav class="rk-links" aria-label="ผู้ดูแล"><button class="home-link" type="button" data-rk="analytics">${ic('chart-column')}<span>Ranked Analytics (ผู้ดูแล)</span>${ic('chevron-right')}</button></nav>` : ''}
      <section class="rk-history rk-history-compact"><h2 class="home-card-title">${ic('clock')} ประวัติล่าสุด</h2><div id="rk-history-list">${G.skeleton('list', 1)}</div></section>`;
    loadHistory();
    if (app().rtConnected) app().rtSend('ranked:party_state');
  }

  /** พัก Ranked ชั่วคราวหลังออกกลางเกมบ่อย — บอกเวลาที่เหลือชัด ๆ */
  function cooldownBanner() {
    if (!me || !me.cooldownUntil) return '';
    const until = new Date(me.cooldownUntil).getTime();
    if (until <= Date.now()) return '';
    const min = Math.ceil((until - Date.now()) / 60000);
    return `<div class="rk-cooldown" role="status">${ic('clock', 'icon-sm')}<span><b>พัก Ranked อีกประมาณ ${min} นาที</b>
      <small>ออกจากเกมกลางคันบ่อยในช่วง 24 ชั่วโมง — ระหว่างนี้ฝึกคำศัพท์หรือแกรมม่าได้ตามปกติ</small></span></div>`;
  }

  /* ---------- ประวัติการแข่ง: หน้า Ranked แสดง 3 รายการล่าสุด (การ์ดเล็ก) · ทั้งหมดอยู่หน้า "ประวัติการแข่ง" ---------- */
  const OUT_TH = { win: ['ชนะ', 'win'], loss: ['แพ้', 'loss'], draw: ['เสมอ', 'draw'] };
  function whenText(at) {
    const d = new Date(at); const now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    const hm = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return `วันนี้ ${hm}`;
    if (diff === 1) return `เมื่อวาน ${hm}`;
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
  }
  function qrText(m) {
    if (m.type === 'practice' || m.type === 'apex') return '—';
    return `${m.qrDelta > 0 ? '+' : m.qrDelta === 0 ? '±' : ''}${m.qrDelta}`;
  }
  function historyCard(m, full = false) {
    const [th, cls] = OUT_TH[m.outcome] || ['—', 'draw'];
    const lk = labelOfResult(m);
    const L = ['victory', 'defeat', 'draw'].includes(lk) ? null : LABELS[lk];   // แสดงเฉพาะกรณีพิเศษ (ยอมแพ้/หลุด ฯลฯ)
    return `<li class="rk-hc rk-hc-${cls}">
      <span class="rk-hc-out">${esc(th)}</span>
      <span class="rk-hc-main"><b>${esc(m.opponent && m.opponent.name ? m.opponent.name : 'คู่แข่ง')}</b>
        <small>${esc(whenText(m.finishedAt))}${full ? ` · ${esc(m.team ? 'ทีม' : m.type === 'apex' ? 'Apex' : 'Ranked')} · ${esc(MODE_TH[m.mode || 'vocab'])} · แม่น ${m.accuracy}%${L ? ` · ${esc(L.th)}` : ''}` : ''}</small></span>
      <span class="rk-hc-qr ${m.qrDelta > 0 ? 'up' : m.qrDelta < 0 ? 'down' : ''}"><b>${esc(qrText(m))}</b><small>แต้ม</small></span>
    </li>`;
  }
  async function loadHistory() {
    const el = document.getElementById('rk-history-list');
    if (!el) return;
    try {
      const { matches, more } = await app().api(`/ranked/history?mode=${rkMode}&limit=3`);
      el.innerHTML = matches.length
        ? `<ul class="rk-hc-list">${matches.map((m) => historyCard(m)).join('')}</ul>
           ${more || matches.length >= 3 ? `<button class="link-btn rk-hc-all" type="button" data-rk="history">ดูประวัติทั้งหมด ${ic('chevron-right', 'icon-sm')}</button>` : ''}`
        : `<p class="rk-hc-empty">ยังไม่มีประวัติการแข่งในโหมด${esc(MODE_TH[rkMode])}</p>`;
    } catch (_) { el.innerHTML = '<p class="rk-hc-empty">โหลดประวัติไม่สำเร็จ</p>'; }
  }
  /* หน้า "ประวัติการแข่ง" (ทั้งหมด · โหลดทีละ 20) — ข้อมูลเดิมในฐานข้อมูลไม่ถูกลบ */
  let histOffset = 0;
  async function openHistory() {
    app().showScreen('screen-ranked-history');
    window.scrollTo(0, 0);
    document.getElementById('rk-hist-modes').innerHTML = modeSwitch('rk-mode-hist');
    const list = document.getElementById('rk-hist-list');
    list.innerHTML = G.skeleton('list', 4);
    histOffset = 0;
    await loadMoreHistory(true);
  }
  async function loadMoreHistory(reset = false) {
    const list = document.getElementById('rk-hist-list');
    const btn = document.getElementById('rk-hist-more');
    try {
      if (!cfg) await ensureConfig();
      const d = await app().api(`/ranked/history?mode=${rkMode}&limit=20&offset=${histOffset}`);
      histOffset += d.matches.length;
      const html = d.matches.map((m) => historyCard(m, true)).join('');
      if (reset) list.innerHTML = html || `<li class="rk-hc-empty">ยังไม่มีประวัติการแข่งในโหมด${esc(MODE_TH[rkMode])}</li>`;
      else list.insertAdjacentHTML('beforeend', html);
      btn.classList.toggle('hidden', !d.more);
    } catch (err) {
      if (reset) list.innerHTML = `<li class="rk-hc-empty">${esc(err.message)}</li>`;
      app().toast(err.message, 'error');
    }
  }

  /* ================= BATTLE HP / การเชื่อมต่อ / ออกจากเกม (ใช้ร่วมกันทุกโหมด) ================= */
  const DIFF_TH = { easy: 'ง่าย', normal: 'ปกติ', hard: 'ยาก' };
  const sfx = (name) => { if (window.EQAudio) window.EQAudio.sfx(name); };
  const music = (cat, opts) => { if (window.EQAudio) window.EQAudio.music(cat, opts); };
  const B = () => (cfg && cfg.battle) || { initialHp: 100, criticalHpRatio: 0.25, reconnectGraceSeconds: 30, npcPingMs: 10000,
    penalties: { surrender: 18, disconnect: 18, beginner: {} } };
  const isCrit = (hp, max) => hp > 0 && hp < max * B().criticalHpRatio;

  /** แถบ HP (vector ล้วน ไม่ใช้ emoji หัวใจ) — fill = HP ปัจจุบัน · ghost = แถบจางที่ไล่ตามหลังเพื่อบอกว่าเพิ่งเสียไปเท่าไร */
  function hpBar(side, hp, max, label) {
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    return `<div class="rk-hp${isCrit(hp, max) ? ' is-critical' : ''}${hp === 0 ? ' is-zero' : ''}" data-hp-side="${side}" role="meter"
        aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${hp}" aria-valuetext="${hp} จาก ${max} HP">
        <span class="rk-hp-ghost" style="width:${pct}%"></span><span class="rk-hp-fill" style="width:${pct}%"></span></div>`;
  }
  /** แถบบนของหน้าเกม: คุณ / คู่แข่ง — HP เป็นข้อมูลหลัก คะแนนเป็นข้อมูลรอง (mobile-first: 2 แถวกะทัดรัด) */
  function hud({ you, opp, hp }) {
    if (!hp) {
      // ไม่มีระบบ HP: แสดงคะแนนเป็นข้อมูลหลัก (เล่นครบทุกข้อ ตัดสินด้วยความแม่นยำ -> คะแนน)
      const srow = (side, p) => `<div class="rk-hud-row rk-hud-noh rk-hud-${side}">
          <span class="rk-hud-pic">${p.pic}</span>
          <span class="rk-hud-id"><b>${esc(p.name)}</b>${p.tag || ''}${p.sub ? `<small>${p.sub.replace(/ · $/, '')}</small>` : ''}</span>
          <span class="rk-hud-bigscore"><b id="rk-score-${side === 'you' ? 'you' : 'opp'}">${p.score}</b><small>pts</small></span>
        </div>`;
      return `<header class="rk-hud" aria-label="สถานะการแข่ง">${srow('you', you)}${srow('opp', opp)}</header>`;
    }
    const row = (side, p, value) => `<div class="rk-hud-row rk-hud-${side}">
        <span class="rk-hud-pic">${p.pic}</span>
        <span class="rk-hud-id"><b>${esc(p.name)}</b>${p.tag || ''}${p.sub ? `<small>${p.sub.replace(/ · $/, '')}</small>` : ''}</span>
        <span class="rk-hp-wrap" data-hp-wrap="${side}">${hpBar(side, value, hp.max, `HP ${side === 'you' ? 'ของคุณ' : `ของ ${p.name}`}`)}</span>
        <span class="rk-hp-numcol"><b class="rk-hp-num" data-hp-num="${side}">${value}</b><small class="rk-hud-score" aria-label="Battle Score"><span id="rk-score-${side === 'you' ? 'you' : 'opp'}">${p.score}</span> pts</small></span>
      </div>`;
    return `<header class="rk-hud" aria-label="สถานะการแข่ง">${row('you', you, hp.you)}${row('opp', opp, hp.opponent)}</header>`;
  }
  /** ปรับ HP แบบ smooth (≈350ms) + ตัวเลข -12 ลอยขึ้นแล้วหายไป · reduced-motion = เปลี่ยนทันที ไม่มีตัวเลขลอย */
  function setHp(side, value, max) {
    const bar = document.querySelector(`[data-hp-side="${side}"]`);
    if (!bar) return;
    const prev = Number(bar.getAttribute('aria-valuenow'));
    const pct = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    bar.querySelector('.rk-hp-fill').style.width = pct;
    const ghost = bar.querySelector('.rk-hp-ghost');
    setTimeout(() => { ghost.style.width = pct; }, reduceMotion() ? 0 : 420);
    bar.setAttribute('aria-valuenow', value);
    bar.setAttribute('aria-valuetext', `${value} จาก ${max} HP`);
    const crit = isCrit(value, max);
    const wasCrit = bar.classList.contains('is-critical');
    bar.classList.toggle('is-critical', crit);
    bar.classList.toggle('is-zero', value === 0);
    const num = document.querySelector(`[data-hp-num="${side}"]`);
    if (num) num.textContent = value;
    if (value < prev) {
      if (!reduceMotion()) {
        const wrap = document.querySelector(`[data-hp-wrap="${side}"]`);
        const f = document.createElement('span');
        f.className = 'rk-dmg'; f.setAttribute('aria-hidden', 'true'); f.textContent = `-${prev - value}`;
        wrap.appendChild(f);
        setTimeout(() => f.remove(), 1000);
        bar.classList.remove('is-hit'); void bar.offsetWidth; bar.classList.add('is-hit');
      }
      if (side === 'you') sfx('damage');
    }
    if (side === 'you') {
      document.body.classList.toggle('rk-critical', crit);
      if (window.EQAudio) window.EQAudio.setCritical(crit);
      if (crit && !wasCrit) sfx('critical');
    }
  }
  /** ข้อความบอก HP ที่เปลี่ยน (ให้ผู้ที่ปิดเสียง / ใช้ screen reader รู้ผลครบ) */
  function hpLine(taken, oppName) {
    if (!taken) return '';
    const parts = [];
    const y = taken.you; const o = taken.opponent;
    if (o) parts.push(`${esc(oppName)} เสีย ${o} HP`);
    if (y) parts.push(`คุณเสีย ${y} HP`);
    return parts.length ? `<span class="rk-hp-line">${ic('shield', 'icon-sm')} ${parts.join(' · ')}</span>` : '';
  }
  const clearBattleFx = () => { document.body.classList.remove('rk-critical'); if (window.EQAudio) window.EQAudio.setCritical(false); };

  /* ---------- การเชื่อมต่อหลุด: RECONNECTING + นับถอยหลัง (เซิร์ฟเวอร์เป็นผู้ตัดสินจริง) ---------- */
  const conn = { ov: null, timer: null, until: 0 };
  function showReconnecting() {
    if (conn.ov) return;
    const grace = B().reconnectGraceSeconds;
    conn.until = Date.now() + grace * 1000;
    conn.ov = document.createElement('div');
    conn.ov.className = 'modal-overlay rk-reconnect';
    conn.ov.innerHTML = `<div class="modal-card rk-reconnect-card" role="alertdialog" aria-labelledby="rk-rc-title" aria-describedby="rk-rc-desc">
      <span class="rk-rc-icon">${ic('wifi-off', 'icon-lg')}</span>
      <p class="rk-rc-kicker">RECONNECTING</p>
      <h2 id="rk-rc-title">Trying to restore your match...</h2>
      <p id="rk-rc-desc" class="rk-rc-th">กำลังเชื่อมต่อกลับเข้าเกมเดิม — กลับมาทันภายในเวลา เล่นต่อได้โดยไม่เสียแต้มแรงค์</p>
      <p class="rk-rc-count" aria-live="off"><b id="rk-rc-sec">${grace}</b>s</p>
      <div class="rk-rc-bar" aria-hidden="true"><span id="rk-rc-fill"></span></div>
      <p class="rk-rc-note" id="rk-rc-note">ถ้าไม่กลับมาภายใน ${grace} วินาที เกมนี้จะนับเป็นแพ้ (Defeat by Disconnect)</p></div>`;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.appendChild(conn.ov);
    app().makeDialog(conn.ov, { label: 'กำลังเชื่อมต่อใหม่', closeButton: false,
      onClose: () => { clearInterval(conn.timer); conn.ov = null; } });   // ปิดหน้าต่างเองได้ แต่เกมยังนับเวลาฝั่งเซิร์ฟเวอร์ต่อ
    const draw = () => {
      const left = Math.max(0, Math.ceil((conn.until - Date.now()) / 1000));
      const sec = document.getElementById('rk-rc-sec'); const fill = document.getElementById('rk-rc-fill');
      if (sec) sec.textContent = left;
      if (fill) fill.style.width = `${(left / grace) * 100}%`;
      if (left === 0) {
        const note = document.getElementById('rk-rc-note');
        if (note) note.textContent = 'ยังเชื่อมต่อไม่ได้ — เมื่อกลับมาออนไลน์ ระบบจะแสดงผลของเกมนี้ให้';
      }
    };
    draw();
    conn.timer = setInterval(draw, 250);
  }
  function hideReconnecting() {
    clearInterval(conn.timer);
    if (conn.ov) { conn.ov.remove(); conn.ov = null; }
  }

  /* ---------- เกม NPC: ping ระหว่างเกม (เงียบเกินกำหนด = เซิร์ฟเวอร์เริ่มนับ grace) ---------- */
  let pingTimer = null;
  function schedulePing(ms) {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(doPing, ms);
  }
  function stopPing() { clearTimeout(pingTimer); pingTimer = null; }
  async function doPing() {
    if (!match) { stopPing(); return; }
    const id = match.matchId;
    try {
      const r = await app().api(`/ranked/matches/${id}/ping`, { method: 'POST' });
      if (!match || match.matchId !== id) return;
      if (r.status !== 'active') { endNpcFromServer(r, id); return; }
      if (conn.ov) { hideReconnecting(); resyncNpc(); }
      schedulePing(B().npcPingMs);
    } catch (err) {
      if (err.network) { showReconnecting(); schedulePing(2000); return; }
      schedulePing(B().npcPingMs);
    }
  }
  /** กลับมาแล้ว: ขอ snapshot ล่าสุดจากเซิร์ฟเวอร์ (ข้อปัจจุบัน · HP · คะแนน · เวลาที่เหลือ) */
  async function resyncNpc() {
    if (!match) return;
    const id = match.matchId;
    try {
      const s = await app().api(`/ranked/matches/${id}`);
      if (s.status !== 'active') { endNpcFromServer(s, id); return; }
      if (s.phase === 'question' || s.index !== match.index) enterMatch(s, { quiet: true });
    } catch (_) { /* ping รอบถัดไปจะลองใหม่ */ }
  }
  function endNpcFromServer(s, id) {
    stopPing(); hideReconnecting(); cancelAnimationFrame(timerRaf);
    match = null;
    if (s.result) renderResult(s.result, id);
  }
  window.addEventListener('offline', () => { if (activeGame()) showReconnecting(); });
  window.addEventListener('online', () => {
    if (match) doPing();
    // เกม PvP/ทีม: socket เดิมยังต่ออยู่ (เน็ตสะดุดสั้น ๆ) -> ขอ snapshot ล่าสุดเพื่อซิงก์ แล้วปิดหน้าต่าง
    else if ((pvp || tm) && app().rtConnected) app().rtSend(tm ? 'ranked:team_resume_request' : 'ranked:resume_request');
  });
  // WebSocket หลุด/กลับมา (เกม PvP / ทีม ใช้ WebSocket เป็นช่องทางหลัก)
  window.addEventListener('eq:rt', (e) => {
    if (!(pvp || tm)) return;
    if (!e.detail.connected) showReconnecting();
    // ต่อกลับได้แล้ว: เซิร์ฟเวอร์ส่ง ranked:resume / team_resume มาเอง -> ปิดหน้าต่างตอนได้ snapshot
  });

  /* ---------- ออกจากเกม: ยืนยันก่อนทุกครั้ง · ยืนยันแล้ว = Surrender ทันที ---------- */
  const activeGame = () => (match ? 'npc' : pvp ? 'pvp' : tm ? 'team' : null);
  function leaveEstimate() {
    const g = activeGame();
    if (g === 'npc' && match.type === 'apex') return 'Apex Challenge ไม่กระทบแต้มแรงค์ แต่เกมนี้จะนับเป็นแพ้';
    const league = g === 'npc' ? match.league : g === 'pvp' ? pvp.you.league
      : (tm.players.find((p) => p.slot === tm.yourSlot) || {}).league;
    const P = B().penalties;
    const amount = P.beginner && P.beginner[league] !== undefined ? P.beginner[league] : P.surrender;
    return `ออกตอนนี้ = แพ้ทันที และเสียประมาณ −${amount} แต้ม (มากกว่าแพ้ปกติ)${g === 'team' ? ' · เพื่อนร่วมทีมยังเล่นต่อได้' : ''}`;
  }
  function confirmLeave() {
    if (!activeGame() || document.getElementById('rk-leave-ov')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'rk-leave-ov';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // ไม่ให้วงโฟกัสกลับไปค้างที่ตัวเลือกคำตอบ
    ov.innerHTML = `<div class="modal-card rk-leave-card"><span class="rk-leave-icon">${ic('door-open', 'icon-lg')}</span>
      <h2>Leave Ranked Match?</h2>
      <p>Leaving this match counts as a defeat and you will lose Rank Points.</p>
      <p class="rk-note">${ic('info', 'icon-sm')} ${esc(leaveEstimate())}</p>
      <div class="summary-actions"><button class="btn btn-secondary" type="button" data-x="no" style="flex:1">Cancel</button>
      <button class="btn btn-danger" type="button" data-x="yes" style="flex:1">Leave Match</button></div></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'ยืนยันการออกจากเกม' });
    ov.querySelector('[data-x="no"]').focus();
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      ov.remove();
      if (b.dataset.x !== 'yes') return;
      cancelAnimationFrame(timerRaf);
      const g = activeGame();
      if (g === 'pvp') { app().rtSend('ranked:forfeit'); return; }          // เซิร์ฟเวอร์จบเกมและส่ง ranked:ended
      if (g === 'team') { app().rtSend('ranked:team_forfeit'); return; }
      try {
        const id = match.matchId;
        const r = await app().api(`/ranked/matches/${id}/forfeit`, { method: 'POST' });
        stopPing(); match = null;
        renderResult(r.result, id);
      } catch (err) { app().toast(err.message, 'error'); }
    });
  }
  const onMatchScreen = () => !document.getElementById('screen-ranked-match').classList.contains('hidden');
  // ปุ่ม Back / เมนู / ลิงก์ระหว่างเกม -> ถามก่อน (ไม่ออกจากเกมโดยไม่ตั้งใจ)
  if (window.EQApp && window.EQApp.setLeaveGuard) {
    window.EQApp.setLeaveGuard(() => {
      if (!activeGame() || !onMatchScreen()) return false;
      confirmLeave();
      return true;
    });
  }
  // ปิดแท็บ / รีเฟรชระหว่างเกม -> เบราว์เซอร์ถามยืนยัน (ถ้ายังออก มี grace 30 วิให้กลับมา)
  window.addEventListener('beforeunload', (e) => {
    if (activeGame() && onMatchScreen()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= MATCH ================= */
  async function startMatch(type, extra = {}) {
    try {
      const s = await app().api('/ranked/matches', { method: 'POST', body: { type, mode: rkMode, ...extra } });
      if (s.queue) { openQueue(s); return; }                 // League ที่มีผู้เล่นจริง -> เข้าคิว PvP
      if (s.pvp) { requestResume(); return; }
      if (s.status !== 'active') { renderResult(s.result, s.matchId); return; }
      await showIntro(s);
      enterMatch(s);
    } catch (err) {
      app().toast(err.message, 'error');
      if (err.code === 'RANKED_COOLDOWN' && me) { me.cooldownUntil = new Date(Date.now() + (err.retryAfter || 0) * 1000).toISOString(); renderLobby(); }
    }
  }

  async function resumeMatch(id) {
    try {
      const s = await app().api(`/ranked/matches/${id}`);
      if (s.pvp) { if (s.team) app().rtSend('ranked:team_resume_request'); else requestResume(); return; }
      if (s.status !== 'active') { renderResult(s.result, s.matchId); return; }
      enterMatch(s);
      app().toast('กลับเข้าเกมเดิมแล้ว', 'success');
    } catch (err) { app().toast(err.message, 'error'); }
  }

  /* หน้าโหลดเข้าเกม: รูปโปรไฟล์ทั้งสองฝั่ง + แถบโหลด แล้วเข้าเกมเอง (ไม่ต้องกดปุ่ม) */
  const LOADING_MS = 2400;
  function versusLoading({ event, routeHtml = '', you, opp, sub }) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay rk-intro';
      const side = (p) => `<div class="rk-vs-side">
        <span class="rk-frame rk-vs-pic ${p.frame ? `rk-frame-${esc(String(p.frame).split(':')[1])}` : ''}">${p.pic}</span>
        <b>${esc(p.name)}</b>${p.tag || ''}
        <small>${p.league ? `${badge(p.league, 'rk-badge-inline')} ` : ''}${esc(p.rankLabel || '')}</small></div>`;
      ov.innerHTML = `<div class="modal-card rk-intro-card rk-vs-card" style="${leagueVars(leagueOf(you.league))}">
        <p class="rk-intro-event">${esc(event)}</p>${routeHtml}
        <div class="rk-vs-row">${side(you)}<span class="rk-vs">VS</span>${side(opp)}</div>
        <p class="rk-intro-sub">${esc(sub)}</p>
        <div class="rk-load" role="progressbar" aria-label="กำลังเข้าสู่เกม" aria-valuemin="0" aria-valuemax="100"><span></span></div>
        <p class="rk-load-text">กำลังเข้าสู่เกม…</p></div>`;
      document.body.appendChild(ov);
      app().makeDialog(ov, { label: 'กำลังเข้าสู่เกม', closeButton: false });
      requestAnimationFrame(() => ov.querySelector('.rk-load span').style.width = '100%');
      setTimeout(() => { ov.remove(); resolve(); }, LOADING_MS);
    });
  }

  function showIntro(s) {
    sfx('match_found');
    const l = leagueOf(s.league);
    const next = cfg.leagues.find((x) => x.order === l.order + 1);
    const promo = s.type === 'promotion';
    const u = app().user;
    return versusLoading({
      event: promo ? 'PROMOTION TRIAL' : s.type === 'apex' ? 'APEX CHALLENGE' : 'RANKED MATCH',
      routeHtml: promo ? `<div class="rk-intro-route"><span>${badge(l.id, 'rk-badge-sm')}<small>${esc(s.leagueLabel)}</small></span>${ic('chevron-right', 'icon-lg')}
        <span>${badge(next.id, 'rk-badge-sm')}<small>${esc(`${next.name} ${next.divisions[0]}`.trim())}</small></span></div>` : '',
      you: { name: u.username, pic: G.avatar(u.avatar, u.avatarImage), league: s.league, rankLabel: s.leagueLabel,
        frame: me && me.cosmetics && me.cosmetics.frame ? me.cosmetics.frame.id : null },
      opp: isBoss(s.opponent)
        ? { name: s.opponent.title ? `${s.opponent.name} — ${s.opponent.title}` : s.opponent.name, pic: portrait(s.opponent, 'rk-portrait-lg'),
          tag: npcTag(s.opponent), league: s.opponent.league, rankLabel: '' }
        : { name: s.opponent.name, pic: portrait(s.opponent, 'rk-portrait-lg'), league: s.league, rankLabel: s.leagueLabel },
      sub: promo ? 'ชนะด่านนี้เพื่อเลื่อน League · แพ้ไม่ตกขั้น' : `${MODE_TH[s.mode || rkMode]} · ${s.total} ข้อ · ความแม่นยำสำคัญกว่าความเร็ว`,
    });
  }

  function battleMusic(type, league) {
    if (type === 'promotion') music('promotion_trial');
    else if (type === 'apex') music('apex');
    else music('battle', { league });
  }
  function enterMatch(s, { quiet = false } = {}) {
    match = { ...s, reveal: null };
    app().showScreen('screen-ranked-match');
    renderMatch();
    if (!quiet) battleMusic(s.type, s.league);
    schedulePing(B().npcPingMs);
  }

  /** แถวข้อมูลข้อ: ลำดับ · ชนิด/ระดับ/ความยาก · ปุ่มเสียง · ออกจากเกม */
  function metaRow(index, total, q) {
    return `<div class="rk-q-meta"><span>ข้อ <b>${index + 1}</b> / ${total}</span>
      <span class="rk-type rk-type-${esc(q.type)}">${esc(TYPE_TH[q.type])} · ${esc(q.cefr)}${q.difficulty ? ` · <span class="rk-diff rk-diff-${esc(q.difficulty)}">${esc(DIFF_TH[q.difficulty])}</span>` : ''}</span>
      <span class="rk-q-tools"><button class="rk-icon-btn" type="button" data-audio-menu aria-label="ตั้งค่าเสียง">${ic(window.EQAudio && window.EQAudio.isMuted() ? 'volume-x' : 'volume-2', 'icon-sm')}</button>
      <button class="link-btn rk-forfeit" type="button" id="rk-forfeit">${ic('door-open', 'icon-sm')} ออกจากเกม</button></span></div>`;
  }

  function renderMatch() {
    const s = match;
    const user = app().user;
    const q = s.question;
    const answered = s.phase === 'revealed';
    clockOffset = new Date(s.serverNow).getTime() - Date.now();
    document.getElementById('rk-match').innerHTML = `
      ${hud({
    you: { name: user.username, pic: G.avatar(user.avatar, user.avatarImage, 'rk-av'), sub: s.leagueLabel ? `${esc(s.leagueLabel)} · ` : '', score: s.scores.you },
    opp: { name: s.opponent.name, pic: portrait(s.opponent, 'rk-portrait-xs'), tag: npcTag(s.opponent),
      sub: isBoss(s.opponent) ? '' : `${esc(s.leagueLabel || '')} · `, score: s.scores.opponent },
    hp: s.hp })}
      ${metaRow(s.index, s.total, q)}
      <div class="rk-timer" aria-hidden="true"><span id="rk-timer-fill"></span></div>
      <p class="rk-opp-status" id="rk-opp-status" aria-live="polite"></p>
      ${q.passage ? `<article class="rk-passage"><h3>${esc(q.passageTitle || 'บทอ่าน')}</h3><p>${esc(q.passage).replace(/\n/g, '<br>')}</p></article>` : ''}
      <p class="rk-instruction">${esc(q.instruction || '')}</p>
      <h2 class="rk-prompt">${esc(q.prompt)}</h2>
      <div class="rk-choices" id="rk-choices">${q.choices.map((c, i) => `<button class="quiz-choice rk-choice" type="button" data-i="${i}" ${answered ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
      <div id="rk-reveal" aria-live="polite">${answered ? '<p class="rk-note">ตอบข้อนี้แล้ว</p>' : ''}</div>
      <button class="btn btn-primary btn-block ${answered ? '' : 'hidden'}" type="button" id="rk-next">${s.isLast ? 'ดูผลการแข่ง' : `ข้อถัดไป ${ic('chevron-right', 'icon-sm')}`}</button>`;
    answering = false;
    const crit0 = Boolean(s.hp) && isCrit(s.hp.you, s.hp.max);
    document.body.classList.toggle('rk-critical', crit0);
    if (window.EQAudio) window.EQAudio.setCritical(crit0);
    if (!answered) startTimer();
    G.iconize(document.getElementById('rk-match'));
  }

  function startTimer() {
    cancelAnimationFrame(timerRaf);
    const opened = new Date(match.openedAt).getTime();
    const total = match.questionMs;
    const fill = document.getElementById('rk-timer-fill');
    const oppEl = document.getElementById('rk-opp-status');
    let oppShown = false;
    const tick = () => {
      const elapsed = Date.now() + clockOffset - opened;
      const left = Math.max(0, total - elapsed);
      if (fill) { fill.style.width = `${(left / total) * 100}%`; fill.classList.toggle('warning', left < total / 3); }
      if (!oppShown && elapsed >= match.opponent.plannedResponseMs) {
        oppShown = true;
        if (oppEl) oppEl.innerHTML = `${ic('check', 'icon-sm')} ${esc(match.opponent.name)} ตอบแล้ว`;  // ไม่บอกว่าถูกหรือผิด
      }
      if (left <= 0) { submit(null); return; }
      timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function submit(choiceIndex) {
    if (answering || !match || match.phase === 'revealed') return;
    answering = true;
    cancelAnimationFrame(timerRaf);
    const btns = [...document.querySelectorAll('.rk-choice')];
    btns.forEach((b) => { b.disabled = true; });
    if (choiceIndex !== null) btns[choiceIndex].classList.add('chosen');
    try {
      const r = await app().api(`/ranked/matches/${match.matchId}/answer`, { method: 'POST', body: { questionIndex: match.index, choiceIndex } });
      match.phase = 'revealed';
      match.isLast = r.isLast;
      btns[r.correctIndex].classList.add('correct');
      if (choiceIndex !== null && !r.correct) btns[choiceIndex].classList.add('wrong');
      sfx(r.correct ? 'correct' : 'incorrect');
      document.getElementById('rk-score-you').textContent = r.scores.you;
      document.getElementById('rk-score-opp').textContent = r.scores.opponent;
      if (r.hp) { setHp('opp', r.hp.opponent, r.hp.max); setHp('you', r.hp.you, r.hp.max); }
      match.hp = r.hp;
      const title = r.timedOut ? 'หมดเวลา' : r.correct ? `ถูกต้อง +${r.points}` : 'ยังไม่ถูก';
      const opp = `${esc(match.opponent.name)} ${r.opponent.correct ? `ตอบถูก +${r.opponent.points}` : 'ตอบผิด'} (${(r.opponent.responseMs / 1000).toFixed(1)} วิ)`;
      const ko = r.ko ? `<span class="rk-ko-line">${r.hp.opponent === 0 && r.hp.you > 0 ? `HP ของ ${esc(match.opponent.name)} หมดแล้ว` : r.hp.you === 0 && r.hp.opponent > 0 ? 'HP ของคุณหมดแล้ว' : 'HP หมดทั้งสองฝั่ง — ตัดสินจากความแม่นยำ'}</span>` : '';
      document.getElementById('rk-reveal').innerHTML = G.feedback(r.correct, title,
        `${r.correct ? '' : `คำตอบที่ถูก: <b>${esc(btns[r.correctIndex].textContent)}</b><br>`}${esc(r.explain || '')}${hpLine(r.taken, match.opponent.name)}<span class="rk-opp-line">${opp}</span>${ko}`);
      G.iconize(document.getElementById('rk-reveal'));
      const next = document.getElementById('rk-next');
      if (r.isLast) next.textContent = 'ดูผลการแข่ง';
      next.classList.remove('hidden');
      next.focus({ preventScroll: true });
    } catch (err) {
      if (err.network) {                       // เน็ตหลุดตอนส่งคำตอบ -> รอเชื่อมต่อใหม่ แล้วซิงก์จากเซิร์ฟเวอร์ (ไม่เดาผลเอง)
        answering = false; btns.forEach((b) => { b.disabled = false; b.classList.remove('chosen'); });
        showReconnecting(); schedulePing(1500); startTimer();
        return;
      }
      app().toast(err.message, 'error');
      if (err.code === 'DUPLICATE_ANSWER' || err.code === 'WRONG_QUESTION' || err.code === 'MATCH_OVER') resumeMatch(match.matchId);
      else { answering = false; btns.forEach((b) => { b.disabled = false; }); startTimer(); }
    }
  }

  async function next() {
    try {
      const s = await app().api(`/ranked/matches/${match.matchId}/next`, { method: 'POST' });
      if (s.status !== 'active') { const id = match.matchId; stopPing(); match = null; renderResult(s.result, id); return; }
      match = { ...s };
      renderMatch();
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } catch (err) {
      if (err.network) { showReconnecting(); schedulePing(1500); return; }
      app().toast(err.message, 'error');
      if (err.code === 'MATCH_OVER') resumeMatch(match.matchId);
    }
  }

  /* ================= RESULT ================= */
  /* ป้ายผล 6 แบบ (ไม่ใช่แค่ชนะ/แพ้) — ใช้ทั้งหน้าผลและประวัติ */
  const LABELS = {
    victory: { en: 'VICTORY', short: 'Victory', th: 'ชนะ', mood: 'success', mark: 'ok' },
    defeat: { en: 'DEFEAT', short: 'Defeat', th: 'แพ้', mood: 'encouragement', mark: 'bad' },
    draw: { en: 'DRAW', short: 'Draw', th: 'เสมอ', mood: 'thinking', mark: 'warn' },
    victory_forfeit: { en: 'VICTORY BY FORFEIT', short: 'Victory by Forfeit', th: 'ชนะ — คู่แข่งไม่กลับมา', mood: 'success', mark: 'ok' },
    defeat_disconnect: { en: 'DEFEAT BY DISCONNECT', short: 'Defeat by Disconnect', th: 'แพ้ — หลุดการเชื่อมต่อเกินเวลา', mood: 'encouragement', mark: 'bad' },
    surrender: { en: 'SURRENDER', short: 'Surrender', th: 'ออกจากเกม (นับเป็นแพ้)', mood: 'encouragement', mark: 'bad' },
  };
  const labelOfResult = (r) => r.label || (r.outcome === 'win' ? (r.opponentForfeited ? 'victory_forfeit' : 'victory')
    : r.outcome === 'draw' ? 'draw' : r.forfeited ? 'surrender' : 'defeat');
  const DECIDED_TH = { hp: 'ครบทุกข้อ — ตัดสินจาก HP ที่เหลือ', accuracy: 'HP เท่ากัน — ตัดสินจากความแม่นยำ',
    score: 'HP และความแม่นยำเท่ากัน — ตัดสินจาก Battle Score', speed: 'HP ความแม่นยำ และคะแนนเท่ากัน — ตัดสินจากเวลาตอบเฉลี่ย' };
  const DECIDED_NOHP = { accuracy: 'ตัดสินจากความแม่นยำ', score: 'ความแม่นยำเท่ากัน — ตัดสินจากคะแนน',
    speed: 'ความแม่นยำและคะแนนเท่ากัน — ตัดสินจากเวลาตอบเฉลี่ย' };
  function reasonLine(r, oppName) {
    if (r.resultReason === 'hp_zero') {
      const who = r.hp && r.hp.opponent === 0 && r.hp.you > 0 ? `HP ของ ${oppName} หมด` : r.hp && r.hp.you === 0 && r.hp.opponent > 0 ? 'HP ของคุณหมด' : 'HP หมดทั้งสองฝั่ง';
      return r.decidedBy && r.decidedBy !== 'hp' ? `${who} — ${DECIDED_TH[r.decidedBy]}` : who;
    }
    if (r.resultReason === 'questions_complete') return (r.hp ? DECIDED_TH : DECIDED_NOHP)[r.decidedBy] || 'ครบทุกข้อ';
    if (r.resultReason === 'draw') return r.hp ? 'HP ความแม่นยำ คะแนน และเวลาเท่ากันทุกอย่าง' : 'ความแม่นยำ คะแนน และเวลาเท่ากันทุกอย่าง';
    return '';
  }
  function penaltyNote(p) {
    if (!p) return '';
    const lines = [];
    if (p.amount > 0) lines.push(`ออกจากเกมกลางคัน: −${p.amount} แต้ม`);
    if (p.counted && p.nth >= 2) lines.push(`ครั้งที่ ${p.nth} ใน 24 ชั่วโมง — บทลงโทษเพิ่มขึ้น`);
    if (p.cooldownUntil) lines.push(`พัก Ranked ถึง ${new Date(p.cooldownUntil).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`);
    if (!p.counted && p.reason === 'disconnect') lines.push('ดูเหมือนเป็นปัญหาการเชื่อมต่อ (คุณนำอยู่) — ไม่นับเป็นการทิ้งเกมซ้ำ');
    return lines.length ? `<p class="rk-note rk-penalty-note">${ic('triangle-alert', 'icon-sm')} ${lines.map(esc).join(' · ')}</p>` : '';
  }
  function resultHp(r) {
    if (!r.hp) return '';
    const row = (name, hp) => `<div class="rk-rhp"><span>${esc(name)}</span>${hpBar('r', hp, r.hp.max, `HP ของ ${name}`)}<b>${hp} HP</b></div>`;
    return `<div class="rk-result-hp" aria-label="HP ที่เหลือ">${row(r.team ? 'ทีมคุณ' : 'YOU', r.hp.you)}${row(r.opponent.name, r.hp.opponent)}</div>`;
  }

  /* EXP จากเกม Ranked: แสดงในหน้าผล + อัปเดตแถบ EXP/เลเวลด้านบน (ครั้งเดียวต่อเกม — เปิดดูผลเก่าไม่อัปเดตย้อน) */
  const expApplied = new Set();
  function expLine(r) {
    const e = r.exp;
    if (!e) return '';
    const text = e.gained > 0 ? `+${e.gained} EXP${e.capped ? ' (ครบเพดาน EXP จาก Ranked ของวันนี้แล้ว)' : ''}`
      : e.reason === 'forfeit' ? 'ออกกลางเกม — ไม่ได้ EXP' : e.capped ? 'ครบเพดาน EXP จาก Ranked ของวันนี้แล้ว — พรุ่งนี้มาเก็บต่อ' : '';
    return text ? `<p class="rk-exp-line ${e.gained > 0 ? 'up' : ''}">${ic('sparkles', 'icon-sm')} ${esc(text)}</p>` : '';
  }
  function applyExp(r, matchId) {
    const e = r.exp; const key = String(matchId || '');
    if (!e || !e.levelInfo || expApplied.has(key) || !app().applyLevelInfo) return;
    expApplied.add(key);
    app().applyLevelInfo(e.levelInfo, e.leveledUp);
  }
  function renderResult(r, matchId) {
    stopPing(); hideReconnecting(); clearBattleFx();
    app().rtSetFast(false);
    app().showScreen('screen-ranked-result');
    const promoted = r.events.includes('promoted');
    const after = leagueOf(r.rank.after.league);
    const lab = LABELS[labelOfResult(r)];
    const head = [lab.en, lab.th, lab.mood];
    if (window.EQAudio) {
      window.EQAudio.cue(r.outcome === 'win' ? 'victory' : r.outcome === 'loss' ? 'defeat' : 'draw');
      if (promoted) setTimeout(() => { sfx('promotion'); sfx('badge_unlock'); }, 900);
      else if (r.qr.delta > 0) setTimeout(() => sfx('rank_progress'), 700);
    }
    applyExp(r, matchId);
    const typeRows = Object.entries(r.byType).map(([t, v]) => `<div class="rk-type-row"><span>${esc(TYPE_TH[t])}</span>
      <span class="home-progress" aria-hidden="true"><span style="width:${v.pct}%"></span></span><b>${v.correct}/${v.total}</b></div>`).join('');
    const qrText = r.type === 'apex' ? 'Apex Challenge — ด่านเกียรติยศ ไม่กระทบแต้มแรงค์'
      : r.type === 'practice' ? 'ฝึกซ้อม — ไม่กระทบแต้มแรงค์'
      : `${r.qr.delta > 0 ? '+' : r.qr.delta === 0 ? '±' : ''}${r.qr.delta} แต้ม`;
    const progress = me && me.profile && r.type !== 'practice' ? `${r.qr.after.toLocaleString()} แต้ม · ${esc(rankLabel(r.rank.after.league, r.rank.after.divisionIndex) || r.rank.after.label)}` : '';
    document.getElementById('rk-result').innerHTML = `
      ${promoted ? `<section class="rk-promo" style="${leagueVars(after)}" aria-live="polite">
        <div class="rk-promo-badges">${badge(r.rank.before.league, 'rk-promo-old')}${badge(after.id, 'rk-promo-new')}</div>
        <p class="rk-promo-kicker">เลื่อนแรงค์สำเร็จ</p><h2 class="rk-promo-title">${esc(rankLabel(r.rank.after.league, r.rank.after.divisionIndex) || r.rank.after.label)}</h2>
        <p>แต้มแรงค์ ${r.qr.after.toLocaleString()} · ได้รับการคุ้มครอง 2 เกมแรก</p></section>` : ''}
      <section class="rk-result-head rk-${esc(r.outcome)}">
        ${G.mascot(head[2], 'mascot-md')}
        <p class="rk-result-kicker">${head[0]}</p><h2>${head[1]}</h2>
        ${resultHp(r)}
        ${reasonLine(r, r.opponent.name) ? `<p class="rk-reason">${esc(reasonLine(r, r.opponent.name))}</p>` : ''}
        <div class="rk-result-scores"><span><b>${r.scores.you}</b><small>${r.team ? 'ทีมคุณ' : 'คุณ'} · Battle Score</small></span><span class="rk-vs-sm">VS</span>
          <span><b>${r.scores.opponent}</b><small>${esc(r.opponent.name)} ${r.opponent.isNpc === false ? '' : npcTag(r.opponent)}</small></span></div>
        ${r.opponentForfeited ? `<p class="rk-note">${ic('wifi-off', 'icon-sm')} Opponent did not return — คู่แข่งออกจากเกมหรือหลุดเกินเวลา</p>` : ''}
        ${penaltyNote(r.penalty)}
        <p class="rk-qr-delta ${r.qr.delta > 0 ? 'up' : r.qr.delta < 0 ? 'down' : ''}">${esc(qrText)}</p>
        ${progress ? `<p class="rk-result-rank">${progress}</p>` : ''}
        ${expLine(r)}
        ${r.events.includes('protected') ? `<p class="rk-note">${ic('shield-check', 'icon-sm')} ได้รับการคุ้มครอง — แพ้เกมนี้ไม่เสียแต้มแรงค์</p>` : ''}
        ${r.events.includes('promotion_pending') ? `<p class="rk-note">${ic('flag', 'icon-sm')} ปลดล็อกด่านเลื่อนขั้นแล้ว</p>` : ''}
        ${r.events.includes('promotion_failed') ? `<p class="rk-note">${ic('info', 'icon-sm')} ยังไม่ตกขั้น — เล่นเกมปกติอีก 2 เกม แล้วลองด่านเลื่อนขั้นใหม่ได้</p>` : ''}
      </section>
      ${r.team ? `<section class="home-card"><h2 class="home-card-title">${ic('users')} คะแนนรายคน</h2>
        ${r.team.members.map((mm) => `<div class="rk-type-row"><span>${esc(mm.name)}</span><small>${mm.team === r.team.members.find((x) => x.name === app().user.username)?.team ? 'ทีมคุณ' : 'คู่แข่ง'}</small><b>${mm.score}</b></div>`).join('')}</section>` : ''}
      <section class="rk-result-stats" aria-label="สถิติเกมนี้">
        <div><b>${r.accuracy}%</b><span>ความแม่นยำ</span></div><div><b>${r.correct}/${r.answered ?? r.total}</b><span>ตอบถูก</span></div>
        <div><b>${r.avgResponseMs ? (r.avgResponseMs / 1000).toFixed(1) : '—'}</b><span>วินาทีเฉลี่ย</span></div>
      </section>
      <section class="home-card"><h2 class="home-card-title">${ic('chart-column')} แยกตามทักษะ</h2>${typeRows}</section>
      ${r.missed.length ? `<section class="home-card rk-missed">
        <h2 class="home-card-title">${ic('circle-x')} ข้อที่ตอบผิด (${r.missed.length})</h2>
        <button class="link-btn" type="button" id="rk-toggle-missed">${ic('eye', 'icon-sm')} ดูข้อที่ผิดทั้งหมด</button>
        <ol class="rk-missed-list hidden" id="rk-missed-list">${r.missed.map((m) => `<li><span class="rk-type rk-type-${esc(m.type)}">${esc(TYPE_TH[m.type])}</span>
          <p>${esc(m.prompt)}</p><p>${G.mark('ok')} <b>${esc(m.answer)}</b></p>${m.explain ? `<p class="rk-explain">${esc(m.explain)}</p>` : ''}</li>`).join('')}</ol>
      </section>` : ''}
      <div class="rk-result-actions">
        <button class="btn btn-primary" type="button" data-rk="${r.events.includes('promotion_pending') ? 'promotion' : 'ranked'}">
          ${r.events.includes('promotion_pending') ? `${ic('flag')} ลงด่านเลื่อนขั้น` : `${ic('swords')} หาเกมใหม่`}</button>
        <button class="btn btn-secondary" type="button" data-rk="lobby">กลับ Ranked Quest</button>
      </div>`;
    G.iconize(document.getElementById('rk-result'));
    me = null; // โปรไฟล์เปลี่ยนแล้ว — โหลดใหม่เมื่อกลับ Lobby
    window.scrollTo(0, 0);
  }

  /* ================= เส้นทางสู่แรงค์สูงสุด (แผนที่ผจญภัย — public/js/rankmap.js) ================= */
  async function openJourney() {
    app().showScreen('screen-ranked-journey');
    window.scrollTo(0, 0);
    const root = document.getElementById('rk-journey');
    const modes = document.getElementById('rk-journey-modes');
    root.innerHTML = `<div class="rkm-loading">${G.mascot('thinking', 'mascot-md')}<p>กำลังกางแผนที่…</p></div>`;
    try {
      await loadMe();                         // ข้อมูลจริงล่าสุดทุกครั้ง (แรงค์อาจเปลี่ยนหลังจบเกม)
      modes.innerHTML = modeSwitch('rk-mode-map');
      if (!window.EQRankMap) throw new Error('โหลดแผนที่ไม่สำเร็จ');
      window.EQRankMap.render(root, {
        cfg, me, user: app().user, mode: rkMode, highRank,
        badge, badgeSrc, portrait, leagueVars, strongColor, npcOf,
        loadFriends: () => app().api(`/ranked/friends?mode=${rkMode}`),
        privacy: () => app().api('/ranked/privacy'),
        setPrivacy: (hide) => app().api('/ranked/privacy', { method: 'PUT', body: { hideFromFriends: hide } }),
        onStart: (type) => { app().navigateTo('ranked'); setTimeout(() => startMatch(type), 50); },
        onResume: () => { app().navigateTo('ranked'); setTimeout(() => resumeMatch(me.activeMatchId), 50); },
      });
      music('lobby');
    } catch (err) {
      root.innerHTML = `<div class="state-error-card"><p>${esc(err.message || 'โหลดแผนที่ไม่สำเร็จ')}</p>
        <button class="btn btn-secondary" type="button" id="rk-map-retry">ลองอีกครั้ง</button></div>`;
      document.getElementById('rk-map-retry').addEventListener('click', openJourney);
    }
  }

  /* ================= TUTORIAL (4 หน้า · Fox เป็นผู้นำทาง) ================= */
  const TUTORIAL = [
    ['welcome', 'ไต่แรงค์สัตว์ทั้ง 9 ระดับ', () => `เริ่มจาก${rankLabel('trail-finch')}ไปจนถึง${rankLabel('aurora-lion')} — ดูเส้นทางทั้งหมดได้ที่แผนที่ "เส้นทางสู่แรงค์สูงสุด"`],
    ['happy', 'สองโหมด: คำศัพท์ และ แกรมม่า', () => 'แต่ละโหมดมีแรงค์ แต้มแรงค์ และกระดานอันดับของตัวเอง'],
    ['encouragement', 'ชนะเพื่อเก็บแต้มแรงค์', () => 'เล่นครบ 10 ข้อ ตัดสินจากความแม่นยำก่อน แล้วค่อยคะแนน (ตอบเร็วได้โบนัสเล็กน้อย) · เล่นจบได้ EXP ด้วย · ออกกลางเกมนับเป็นแพ้และเสียแต้มมากกว่า (เน็ตหลุดมีเวลา 30 วินาทีให้กลับมา)'],
    ['thinking', 'ด่านบอสเลื่อนแรงค์', () => `แพ้ในแรงค์${rankLabel('trail-finch')}ไม่เสียแต้ม · เก็บแต้มจนสุดแรงค์แล้วต้องชนะบอสประจำด่านจึงจะขึ้นแรงค์ถัดไป · ช่วงที่ผู้เล่นออนไลน์น้อย ระบบจับคู่กับคู่ฝึกในระดับเดียวกันเพื่อไม่ให้ต้องรอนาน`],
    ['celebration', 'แรงค์ไม่ใช่ระดับภาษา', () => 'แรงค์วัดการแข่งขัน ส่วนระดับภาษา (CEFR) วัดแยกจากแบบทดสอบวัดระดับ และใช้เลือกความยากของคำถาม'],
  ];
  function openTutorial() {
    if (document.getElementById('rk-tutorial-ov')) return;   // เปิดซ้อนไม่ได้ (Lobby โหลดซ้ำจาก hash)
    let page = 0;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'rk-tutorial-ov';
    const render = () => {
      const [mood, title, textFn] = TUTORIAL[page];
      const text = textFn();
      ov.innerHTML = `<div class="modal-card rk-tut">
        ${G.mascot(mood, 'mascot-md')}
        <p class="rk-tut-step">${page + 1} / ${TUTORIAL.length}</p>
        <h2>${esc(title)}</h2><p>${esc(text)}</p>
        <div class="rk-tut-dots" aria-hidden="true">${TUTORIAL.map((_, i) => `<span class="${i === page ? 'on' : ''}"></span>`).join('')}</div>
        <div class="summary-actions">
          <button class="btn btn-secondary" type="button" data-t="skip" style="flex:1">ข้าม</button>
          <button class="btn btn-primary" type="button" data-t="next" style="flex:1">${page === TUTORIAL.length - 1 ? 'เริ่มผจญภัย' : 'ถัดไป'}</button>
        </div></div>`;
      ov.querySelector('[data-t="next"]').focus();
    };
    const done = () => {
      ov.remove();
      app().api('/ranked/tutorial-done', { method: 'POST' }).catch(() => {});
      if (me) me.profile.tutorialDone = true;
    };
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      if (b.dataset.t === 'skip' || page === TUTORIAL.length - 1) { done(); return; }
      page += 1; render();
    });
    document.body.appendChild(ov);
    render();
    app().makeDialog(ov, { label: 'วิธีเล่น Ranked Quest', onClose: done });
  }

  /* ================= หน้า Home / หน้าเล่น ================= */
  /* คำแนะนำบนหน้า Home เดิมชวน "เพิ่มคำที่ผิดเข้าทบทวน" — โหมดทบทวนถูกนำออกแล้ว จึงไม่แสดงอะไร (คงฟังก์ชันไว้ให้โค้ดเดิมเรียกได้) */
  async function homeHint() {}

  async function playCard() {
    try {
      const d = await loadMe();
      const btn = document.getElementById('play-btn-ranked');
      if (!btn) return;
      const img = btn.querySelector('.rk-play-badge img');
      if (img) { img.src = badgeSrc(d.profile.league, 192); img.alt = `ตรา ${d.profile.leagueName}`; }
      btn.style.cssText = leagueVars(leagueOf(d.profile.league));
      document.getElementById('play-ranked-sub').textContent = d.modes
        ? `Vocab ${d.modes.vocab.label} · Grammar ${d.modes.grammar.label}${d.activeMatchId ? ' · มีเกมค้างอยู่' : ''}`
        : `${d.profile.label} · ${d.profile.questRating.toLocaleString()} แต้ม`;
    } catch (_) { /* ใช้ข้อความเริ่มต้น */ }
  }


  /* ================= PvP (Phase 2) — ขับเคลื่อนด้วยข้อความจากเซิร์ฟเวอร์ ================= */
  let queueOv = null; let queueTimer = null; let queueSince = 0;
  let pvp = null;                // สถานะเกม PvP ที่กำลังเล่น
  let graceTimer = null;

  function requestResume() {
    if (!app().rtConnected) { app().toast('กำลังเชื่อมต่อใหม่… แล้วจะกลับเข้าเกมให้อัตโนมัติ', 'info'); return; }
    app().rtSend('ranked:resume_request');
  }

  /* หน้าค้นหาคู่แข่ง: แสดงตามจริงเท่านั้น — กำลังค้นหา + Animation + ปุ่มยกเลิก (ไม่บอกประเภทคู่แข่ง ไม่แสดงว่าเจอจนกว่าเซิร์ฟเวอร์จับคู่จริง)
     passive = เซิร์ฟเวอร์บอกว่ายังอยู่ในคิว (เช่น เน็ตกลับมา) -> เปิดหน้าค้นหาโดยไม่ส่งเข้าคิวซ้ำ */
  function openQueue(info = {}, { passive = false, since = null } = {}) {
    if (!passive && !app().rtConnected) { app().toast('ยังไม่ได้เชื่อมต่อแบบเรียลไทม์ ลองใหม่อีกครั้ง', 'error'); return; }
    if (queueOv && passive) return;
    closeQueue(false);
    queueSince = since ? new Date(since).getTime() : Date.now();
    queueOv = document.createElement('div');
    queueOv.className = 'modal-overlay';
    queueOv.innerHTML = `<div class="modal-card rk-queue">
      <div class="rk-radar" aria-hidden="true"><span></span><span></span><span></span>
        <svg class="rk-radar-core" viewBox="0 0 24 24"><use href="/assets/icons/icons.svg#swords"></use></svg></div>
      <h2 role="status">กำลังค้นหาคู่แข่ง<span class="rk-dots"><i>.</i><i>.</i><i>.</i></span></h2>
      <div id="rk-queue-offer" aria-live="polite"></div>
      <button class="btn btn-secondary btn-block" type="button" data-q="cancel">ยกเลิกการค้นหา</button>
    </div>`;
    document.body.appendChild(queueOv);
    app().makeDialog(queueOv, { label: 'กำลังค้นหาคู่แข่ง', closeButton: false });
    if (!passive) app().rtSend('ranked:queue_join', { mode: rkMode });
    music('matchmaking');
    clearInterval(queueTimer);
  }
  function closeQueue(notify = true) {
    clearInterval(queueTimer);
    if (queueOv) { queueOv.remove(); queueOv = null; if (notify) { app().rtSend('ranked:queue_leave'); music('lobby'); } }
  }
  function showOffer(kind) {
    const box = document.getElementById('rk-queue-offer');
    if (!box) return;
    // เฉพาะแรงค์ระดับต้นที่เซิร์ฟเวอร์อนุญาต: ทางเลือกให้ผู้เล่นตัดสินใจเอง · แรงค์สูงไม่มีข้อเสนอนี้ (ค้นหาต่อเนื่อง)
    if (kind !== 'offer') { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="btn btn-primary btn-block" type="button" data-q="npc">${ic('swords', 'icon-sm')} เริ่มเลยกับคู่แข่งระดับใกล้เคียง</button>`;
  }

  function showPvpIntro(msg) {
    closeQueue(false);
    sfx('match_found');
    const p = (x) => ({ name: x.name, pic: G.avatar(x.avatar, x.avatarImage), league: x.league, rankLabel: x.rankLabel,
      frame: x.frame, tag: x.title ? `<small class="rk-title-sm">${esc(x.title)}</small>` : '' });
    versusLoading({ event: 'RANKED MATCH', you: p(msg.you), opp: p(msg.opponent), sub: `${msg.total} ข้อ · ระดับคำถาม ${msg.cefr}` });
  }

  function enterPvp(msg) {
    const fresh = !pvp || pvp.matchId !== msg.matchId;
    pvp = { matchId: msg.matchId, you: msg.you, opponent: msg.opponent, total: msg.total, scores: msg.scores || { you: 0, opponent: 0 },
      index: -1, question: null, answered: false, phase: 'intro', hp: msg.hp || null };
    app().rtSetFast(true);
    if (fresh) battleMusic('ranked', msg.you.league);
    app().showScreen('screen-ranked-match');
    document.getElementById('rk-match').innerHTML = `<div class="rk-waiting">${G.mascot('welcome', 'mascot-md')}<p>กำลังเริ่มเกม…</p></div>`;
  }

  function pvpQuestion(msg) {
    if (!pvp || pvp.matchId !== msg.matchId) return;
    Object.assign(pvp, { index: msg.index, total: msg.total, question: msg.question, openedAt: msg.openedAt, serverNow: msg.serverNow,
      questionMs: msg.questionMs, answered: false, phase: 'question', oppAnswered: false, hp: msg.hp || null });
    renderPvp();
  }

  function renderPvp() {
    const s = pvp; const q = s.question;
    clockOffset = new Date(s.serverNow).getTime() - Date.now();
    document.getElementById('rk-match').innerHTML = `
      ${hud({
    you: { name: s.you.name, pic: G.avatar(s.you.avatar, s.you.avatarImage, 'rk-av'), sub: `${esc(s.you.rankLabel)} · `, score: s.scores.you },
    opp: { name: s.opponent.name, pic: G.avatar(s.opponent.avatar, s.opponent.avatarImage, 'rk-av'), tag: '',
      sub: `${esc(s.opponent.rankLabel || '')} · `, score: s.scores.opponent },
    hp: s.hp })}
      <div class="rk-banner hidden" id="rk-conn-banner" role="status"></div>
      ${metaRow(s.index, s.total, q)}
      <div class="rk-timer" aria-hidden="true"><span id="rk-timer-fill"></span></div>
      <p class="rk-opp-status" id="rk-opp-status" aria-live="polite">${s.oppAnswered ? `${ic('check', 'icon-sm')} ${esc(s.opponent.name)} ตอบแล้ว` : ''}</p>
      ${q.passage ? `<article class="rk-passage"><h3>${esc(q.passageTitle || 'บทอ่าน')}</h3><p>${esc(q.passage).replace(/\n/g, '<br>')}</p></article>` : ''}
      <p class="rk-instruction">${esc(q.instruction || '')}</p>
      <h2 class="rk-prompt">${esc(q.prompt)}</h2>
      <div class="rk-choices">${q.choices.map((c, i) => `<button class="quiz-choice rk-choice rk-pvp-choice" type="button" data-i="${i}" ${s.answered || s.phase !== 'question' ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
      <div id="rk-reveal" aria-live="polite">${s.answered && s.phase === 'question' ? `<p class="rk-note">${ic('hourglass', 'icon-sm')} ส่งคำตอบแล้ว รอคู่แข่ง…</p>` : ''}</div>`;
    G.iconize(document.getElementById('rk-match'));
    document.body.classList.toggle('rk-critical', Boolean(s.hp) && isCrit(s.hp.you, s.hp.max));
    if (s.phase === 'question') pvpTimer();
    if (oppGrace) connBanner(oppGrace);
  }

  function pvpTimer() {
    cancelAnimationFrame(timerRaf);
    const opened = new Date(pvp.openedAt).getTime();
    const tick = () => {
      if (!pvp || pvp.phase !== 'question') return;
      const left = Math.max(0, pvp.questionMs - (Date.now() + clockOffset - opened));
      const fill = document.getElementById('rk-timer-fill');
      if (fill) { fill.style.width = `${(left / pvp.questionMs) * 100}%`; fill.classList.toggle('warning', left < pvp.questionMs / 3); }
      if (left <= 0) {
        // หมดเวลา: เซิร์ฟเวอร์เป็นผู้ตัดสินและจะเฉลยเอง
        document.querySelectorAll('.rk-pvp-choice').forEach((b) => { b.disabled = true; });
        const r = document.getElementById('rk-reveal');
        if (r && !pvp.answered) r.innerHTML = `<p class="rk-note">${ic('hourglass', 'icon-sm')} หมดเวลา — รอเฉลย</p>`;
        return;
      }
      timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function pvpAnswer(i) {
    if (!pvp || pvp.answered || pvp.phase !== 'question') return;
    pvp.answered = true;
    document.querySelectorAll('.rk-pvp-choice').forEach((b) => { b.disabled = true; });
    document.querySelector(`.rk-pvp-choice[data-i="${i}"]`).classList.add('chosen');
    document.getElementById('rk-reveal').innerHTML = `<p class="rk-note">${ic('hourglass', 'icon-sm')} ส่งคำตอบแล้ว รอคู่แข่ง…</p>`;
    app().rtSend('ranked:answer', { matchId: pvp.matchId, questionIndex: pvp.index, choiceIndex: i });
  }

  function pvpReveal(msg) {
    if (!pvp || pvp.matchId !== msg.matchId) return;
    pvp.phase = 'reveal';
    cancelAnimationFrame(timerRaf);
    pvp.scores = msg.scores;
    const btns = [...document.querySelectorAll('.rk-pvp-choice')];
    btns.forEach((b) => { b.disabled = true; });
    if (btns[msg.correctIndex]) btns[msg.correctIndex].classList.add('correct');
    if (msg.you.choice_index !== null && !msg.you.correct && btns[msg.you.choice_index]) btns[msg.you.choice_index].classList.add('wrong');
    sfx(msg.you.correct ? 'correct' : 'incorrect');
    document.getElementById('rk-score-you').textContent = msg.scores.you;
    document.getElementById('rk-score-opp').textContent = msg.scores.opponent;
    if (msg.hp) { setHp('opp', msg.hp.opponent, msg.hp.max); setHp('you', msg.hp.you, msg.hp.max); pvp.hp = msg.hp; }
    const o = msg.opponent;
    const oppLine = `${esc(pvp.opponent.name)} ${o.choice_index === null ? 'ไม่ได้ตอบ' : o.correct ? `ตอบถูก +${o.points}` : 'ตอบผิด'}${o.response_ms ? ` (${(o.response_ms / 1000).toFixed(1)} วิ)` : ''}`;
    const title = msg.you.choice_index === null ? 'หมดเวลา' : msg.you.correct ? `ถูกต้อง +${msg.you.points}` : 'ยังไม่ถูก';
    document.getElementById('rk-reveal').innerHTML = G.feedback(Boolean(msg.you.correct), title,
      `${msg.you.correct ? '' : `คำตอบที่ถูก: <b>${esc(btns[msg.correctIndex] ? btns[msg.correctIndex].textContent : '')}</b><br>`}${esc(msg.explain || '')}
       ${hpLine(msg.taken, pvp.opponent.name)}<span class="rk-opp-line">${oppLine}</span>
       <span class="rk-opp-line">${msg.ko ? 'HP หมดแล้ว — กำลังสรุปผล…' : msg.isLast ? 'กำลังสรุปผล…' : `ข้อถัดไปเริ่มใน ${Math.round(msg.nextInMs / 1000)} วินาที`}</span>`);
    G.iconize(document.getElementById('rk-reveal'));
  }

  /* คู่แข่งหลุด: บอกชัด ๆ พร้อมนับถอยหลัง (ไม่ปล่อยให้รอโดยไม่มีข้อมูล) */
  let oppGrace = null;
  function connBanner(msg) {
    clearInterval(graceTimer);
    if (msg.connected) {
      oppGrace = null;
      const el0 = document.getElementById('rk-conn-banner');
      if (el0) { el0.classList.add('hidden'); }
      app().toast(`${pvp ? pvp.opponent.name : 'คู่แข่ง'} กลับเข้าเกมแล้ว`, 'info');
      return;
    }
    oppGrace = { connected: false, deadline: msg.deadline || new Date(Date.now() + msg.graceMs).toISOString() };
    const until = new Date(oppGrace.deadline).getTime();
    const draw = () => {
      const el = document.getElementById('rk-conn-banner');
      if (!el) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      el.classList.remove('hidden');
      el.innerHTML = `${ic('wifi-off', 'icon-sm')}<span><b>Opponent disconnected</b> · Waiting for reconnect... <b>${left} sec</b>
        <small>${esc(pvp ? pvp.opponent.name : 'คู่แข่ง')} หลุดการเชื่อมต่อ — ถ้าไม่กลับมาภายในเวลา คุณชนะ (Victory by Forfeit)</small></span>`;
    };
    draw();
    graceTimer = setInterval(draw, 1000);
  }

  function onMessage(msg) {
    // ได้ข้อความของเกมจากเซิร์ฟเวอร์ = การเชื่อมต่อยังใช้ได้ -> ปิดหน้าต่าง RECONNECTING
    if (conn.ov && (pvp || tm) && /^ranked:(team_)?(question|reveal|resume|answered|answer_ack|opponent_answered|status|opponent_status|ended)$/.test(msg.type)) hideReconnecting();
    if (teamMessage(msg)) return;
    switch (msg.type) {
      case 'ranked:friend_rank': if (window.EQRankMap) window.EQRankMap.onFriendRank(); break;
      case 'ranked:queue':
        if (msg.status === 'left') closeQueue(false);
        else if (msg.status === 'searching' && !queueOv) { setMode(msg.mode || rkMode); openQueue({}, { passive: true, since: msg.since }); }
        break;
      case 'ranked:queue_offer': showOffer(msg.kind); break;
      case 'ranked:matched': showPvpIntro(msg); enterPvp(msg); break;
      case 'ranked:question': pvpQuestion(msg); break;
      case 'ranked:answer_ack': break;
      case 'ranked:opponent_answered':
        if (pvp && pvp.index === msg.index) {
          pvp.oppAnswered = true;
          const el = document.getElementById('rk-opp-status');
          if (el) el.innerHTML = `${ic('check', 'icon-sm')} ${esc(pvp.opponent.name)} ตอบแล้ว`; // ไม่บอกถูก/ผิด
        }
        break;
      case 'ranked:reveal': pvpReveal(msg); break;
      case 'ranked:opponent_status': connBanner(msg); break;
      case 'ranked:resume': {                  // Snapshot ล่าสุดจากเซิร์ฟเวอร์ — กลับเข้าเกมเดิม
        const wasReconnecting = Boolean(conn.ov);
        hideReconnecting();
        oppGrace = msg.opponentDisconnected ? { connected: false, deadline: msg.opponentDisconnected.deadline } : null;
        enterPvp(msg);
        if (msg.question) {
          Object.assign(pvp, { index: msg.index, question: msg.question, openedAt: msg.openedAt, serverNow: msg.serverNow,
            questionMs: msg.questionMs, answered: msg.answered, phase: msg.phase === 'reveal' ? 'reveal' : 'question', hp: msg.hp || null });
          renderPvp();
          if (msg.reveal) pvpReveal(msg.reveal);
        }
        app().toast(wasReconnecting ? 'เชื่อมต่อได้แล้ว — กลับเข้าเกมเดิม' : 'กลับเข้าเกมแล้ว', 'success');
        break;
      }
      case 'ranked:ended': {
        clearInterval(graceTimer); cancelAnimationFrame(timerRaf); oppGrace = null;
        const id = msg.matchId; pvp = null;
        renderResult(msg.result, id);
        break;
      }
      case 'ranked:error':
        app().toast(msg.message || 'เกิดข้อผิดพลาด', 'error');
        if (teamQueueOv && ['MATCH_IN_PROGRESS', 'MATCH_FAILED', 'OFFLINE', 'SERVER', 'NO_PARTY'].includes(msg.code)) closeTeamQueue(false);
        if (queueOv && ['NPC_LEAGUE', 'MATCH_IN_PROGRESS', 'MATCH_FAILED', 'SERVER'].includes(msg.code)) closeQueue(false);
        break;
      default: break;
    }
  }


  /* ================= TEAM 2v2 ================= */
  let party = null;              // { partyId, leader, members: [...] }
  let tm = null;                 // สถานะเกมทีม
  let teamQueueOv = null; let teamQueueTimer = null;

  function teamPanel() {
    const uid = app().user && app().user.id;
    if (!party || !Array.isArray(party.members) || party.members.length < 2) {
      return `<div class="rk-team-head">${ic('users')}<b>โหมดทีม 2 คน</b></div>
        <p class="rk-note">ชวนเพื่อนมาลงแรงค์เป็นทีม (ตามโหมดที่เลือกอยู่) · คะแนนทีม = คะแนนรวมของทั้งสองคน · แต้ม ของแต่ละคนเปลี่ยนตามผลทีม</p>
        <button class="btn btn-secondary btn-block" type="button" data-rk="team-invite">${ic('user-plus', 'icon-sm')} ชวนเพื่อนเข้าทีม</button>`;
    }
    const leader = party.leader === uid;
    return `<div class="rk-team-head">${ic('users')}<b>ทีมของคุณ</b><button class="link-btn" type="button" data-rk="team-leave">ออกจากทีม</button></div>
      <div class="rk-team-members">${party.members.map((m) => `<div class="rk-team-m">${G.avatar(m.avatar, m.avatarImage, 'rk-av')}
        <span><b>${esc(m.name)}${m.id === party.leader ? ' <small>(หัวหน้าทีม)</small>' : ''}</b><small>${badge(m.league, 'rk-badge-inline')} ${esc(m.rankLabel)}</small></span></div>`).join('')}</div>
      ${leader ? `<button class="btn btn-primary btn-block rk-cta" type="button" data-rk="team-find">${ic('swords')} FIND TEAM MATCH</button>`
    : '<p class="rk-note">รอหัวหน้าทีมกดหาเกม</p>'}`;
  }
  const refreshTeamPanel = () => { const el = document.getElementById('rk-team'); if (el) el.innerHTML = teamPanel(); };

  async function openInvite() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'rk-invite-ov';
    ov.innerHTML = `<div class="modal-card rk-rewards"><h2>ชวนเพื่อนเข้าทีม</h2><div id="rk-inv-body">${G.skeleton('list', 3)}</div></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'ชวนเพื่อนเข้าทีม', variant: 'sheet' });
    try {
      const { friends } = await app().api('/friends');
      const online = friends.filter((f) => f.online);
      document.getElementById('rk-inv-body').innerHTML = online.length ? `<ul class="rk-rw-list">${online.map((f) => `<li class="rk-rw">
          ${G.avatar(f.avatar, f.avatarImage, 'rk-av')}<span class="rk-rw-text"><b>${esc(f.username)}</b><small>ออนไลน์</small></span>
          <button class="mini-btn accept" type="button" data-invite="${f.id}">ชวน</button></li>`).join('')}</ul>`
        : G.emptyState({ art: 'empty-friends', title: 'ไม่มีเพื่อนที่ออนไลน์อยู่', text: 'ชวนได้เฉพาะเพื่อนที่กำลังออนไลน์', compact: true });
    } catch (err) { document.getElementById('rk-inv-body').innerHTML = `<p>${esc(err.message)}</p>`; }
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-invite]');
      if (!b) return;
      app().rtSend('ranked:party_invite', { userId: Number(b.dataset.invite) });
      b.disabled = true; b.textContent = 'ส่งแล้ว';
    });
  }

  function showInvite(msg) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rk-tut">${G.avatar(msg.from.avatar, msg.from.avatarImage, 'rk-invite-av')}
      <h2>${esc(msg.from.name)} ชวนคุณลงแรงค์แบบทีม</h2><p>${esc(msg.from.rankLabel)} · คะแนนทีม = คะแนนรวมของทั้งสองคน</p>
      <div class="summary-actions"><button class="btn btn-secondary" type="button" data-a="0" style="flex:1">ไม่ตอนนี้</button>
      <button class="btn btn-primary" type="button" data-a="1" style="flex:1">เข้าร่วมทีม</button></div></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'คำชวนเข้าทีม' });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      app().rtSend('ranked:party_respond', { partyId: msg.partyId, accept: b.dataset.a === '1' });
      ov.remove();
      if (b.dataset.a === '1') app().navigateTo('ranked');
    });
  }

  function openTeamQueue() {
    closeTeamQueue(false);
    const since = Date.now();
    teamQueueOv = document.createElement('div');
    teamQueueOv.className = 'modal-overlay';
    teamQueueOv.innerHTML = `<div class="modal-card rk-queue">
      <div class="rk-radar" aria-hidden="true"><span></span><span></span><span></span>
        <svg class="rk-radar-core" viewBox="0 0 24 24"><use href="/assets/icons/icons.svg#users"></use></svg></div>
      <h2 role="status">กำลังค้นหาทีมคู่แข่ง<span class="rk-dots"><i>.</i><i>.</i><i>.</i></span></h2>
      <div id="rk-tq-offer"></div>
      ${party && party.leader === app().user.id ? '<button class="btn btn-secondary btn-block" type="button" data-tq="cancel">ยกเลิกการค้นหา</button>' : ''}</div>`;
    document.body.appendChild(teamQueueOv);
    app().makeDialog(teamQueueOv, { label: 'กำลังหาทีม', closeButton: false });
    teamQueueTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - since) / 1000);
      const t = document.getElementById('rk-tq-time');
      if (t) t.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    }, 500);
  }
  function closeTeamQueue(notify = true) {
    clearInterval(teamQueueTimer);
    if (teamQueueOv) { teamQueueOv.remove(); teamQueueOv = null; if (notify) app().rtSend('ranked:team_queue_leave'); }
  }

  function teamLoading(msg) {
    closeTeamQueue(false);
    sfx('match_found');
    const col = (team) => msg.players.filter((p) => p.team === team).map((p) => `<div class="rk-vs-side">
      <span class="rk-frame rk-vs-pic rk-vs-pic-sm">${p.isNpc ? portrait(p, 'rk-portrait-lg') : G.avatar(p.avatar, p.avatarImage)}</span>
      <b>${esc(p.name)}</b>${p.isNpc ? npcTag(p) : ''}<small>${p.league ? badge(p.league, 'rk-badge-inline') : ''} ${esc(p.rankLabel || '')}</small></div>`).join('');
    const ov = document.createElement('div');
    ov.className = 'modal-overlay rk-intro';
    ov.innerHTML = `<div class="modal-card rk-intro-card rk-vs-card"><p class="rk-intro-event">TEAM RANKED · 2 VS 2</p>
      <div class="rk-vs-row"><div class="rk-team-col">${col(msg.yourTeam)}</div><span class="rk-vs">VS</span><div class="rk-team-col">${col(1 - msg.yourTeam)}</div></div>
      <p class="rk-intro-sub">${MODE_TH[msg.mode || rkMode]} · ${msg.total} ข้อ · คะแนนทีม = คะแนนรวมของสมาชิก</p>
      <div class="rk-load"><span></span></div><p class="rk-load-text">กำลังเข้าสู่เกม…</p></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'กำลังเข้าสู่เกมทีม', closeButton: false });
    requestAnimationFrame(() => { ov.querySelector('.rk-load span').style.width = '100%'; });
    setTimeout(() => ov.remove(), Math.max(1200, msg.startsInMs - 100));
  }

  function enterTeam(msg) {
    const fresh = !tm || tm.matchId !== msg.matchId;
    tm = { matchId: msg.matchId, players: msg.players, yourSlot: msg.yourSlot, yourTeam: msg.yourTeam, total: msg.total,
      teamScores: msg.teamScores || [0, 0], answeredSlots: new Set(), phase: 'intro', answered: false,
      teamHp: msg.teamHp || null, hpMax: msg.hpMax || B().initialHp, graces: {} };
    app().rtSetFast(true);
    const tut = document.getElementById('rk-tutorial-ov'); if (tut) tut.remove();   // เพื่อนพาเข้าเกมระหว่างเปิดคู่มืออยู่
    if (fresh) battleMusic('ranked', (msg.players.find((p) => p.slot === msg.yourSlot) || {}).league);
    app().showScreen('screen-ranked-match');
    document.getElementById('rk-match').innerHTML = `<div class="rk-waiting">${G.mascot('welcome', 'mascot-md')}<p>กำลังเริ่มเกมทีม…</p></div>`;
    commsSetup();
  }

  function renderTeam() {
    const s = tm; const q = s.question;
    clockOffset = new Date(s.serverNow).getTime() - Date.now();
    const chip = (p) => `<span class="rk-chip ${s.answeredSlots.has(p.slot) ? 'done' : ''} ${p.gone ? 'gone' : ''}" data-slot="${p.slot}">
      ${p.isNpc ? portrait(p, 'rk-portrait-xs') : G.avatar(p.avatar, p.avatarImage, 'rk-av')}<small>${esc(p.name)}</small>${s.answeredSlots.has(p.slot) ? ic('check', 'icon-sm') : ''}</span>`;
    const mine = s.players.filter((p) => p.team === s.yourTeam); const theirs = s.players.filter((p) => p.team !== s.yourTeam);
    const teamPic = (ps) => `<span class="rk-hud-duo">${ps.map((p) => (p.isNpc ? portrait(p, 'rk-portrait-xs') : G.avatar(p.avatar, p.avatarImage, 'rk-av'))).join('')}</span>`;
    document.getElementById('rk-match').innerHTML = `
      ${hud({
    you: { name: 'ทีมคุณ', pic: teamPic(mine), sub: `${mine.map((p) => esc(p.name)).join(' & ')} · `, score: s.teamScores[s.yourTeam] },
    opp: { name: 'ทีมคู่แข่ง', pic: teamPic(theirs), sub: `${theirs.map((p) => esc(p.name)).join(' & ')} · `, score: s.teamScores[1 - s.yourTeam] },
    hp: s.teamHp ? { you: s.teamHp[s.yourTeam], opponent: s.teamHp[1 - s.yourTeam], max: s.hpMax } : null })}
      <div class="rk-chips" id="rk-chips">${mine.map(chip).join('')}<span class="rk-chips-sep"></span>${theirs.map(chip).join('')}</div>
      <div class="rk-banner hidden" id="rk-conn-banner" role="status"></div>
      ${metaRow(s.index, s.total, q)}
      <div class="rk-timer" aria-hidden="true"><span id="rk-timer-fill"></span></div>
      ${q.passage ? `<article class="rk-passage"><h3>${esc(q.passageTitle || 'บทอ่าน')}</h3><p>${esc(q.passage).replace(/\n/g, '<br>')}</p></article>` : ''}
      <p class="rk-instruction">${esc(q.instruction || '')}</p><h2 class="rk-prompt">${esc(q.prompt)}</h2>
      <div class="rk-choices">${q.choices.map((c, i) => `<button class="quiz-choice rk-choice rk-team-choice" type="button" data-i="${i}" ${s.answered || s.phase !== 'question' ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
      <div id="rk-reveal" aria-live="polite">${s.answered && s.phase === 'question' ? `<p class="rk-note">${ic('hourglass', 'icon-sm')} ส่งคำตอบแล้ว รอทุกคน…</p>` : ''}</div>`;
    G.iconize(document.getElementById('rk-match'));
    document.body.classList.toggle('rk-critical', Boolean(s.teamHp) && isCrit(s.teamHp[s.yourTeam], s.hpMax));
    if (s.phase === 'question') teamTimer();
    teamGraceBanner();
  }
  /* เพื่อน/คู่แข่งในเกมทีมหลุด: นับถอยหลังของแต่ละคน */
  let teamGraceTimer = null;
  function teamGraceBanner() {
    clearInterval(teamGraceTimer);
    const draw = () => {
      const el = document.getElementById('rk-conn-banner');
      if (!el || !tm) return;
      const now = Date.now();
      const lines = Object.entries(tm.graces).map(([slot, until]) => {
        const p = tm.players.find((x) => x.slot === Number(slot));
        const left = Math.max(0, Math.ceil((until - now) / 1000));
        return `${esc(p ? p.name : '')} หลุดการเชื่อมต่อ — รอกลับมา ${left} วินาที`;
      });
      const gone = tm.players.filter((p) => p.gone).map((p) => `${esc(p.name)} ออกจากเกมแล้ว`);
      const all = [...lines, ...gone];
      el.classList.toggle('hidden', all.length === 0);
      el.innerHTML = all.length ? `${ic('wifi-off', 'icon-sm')}<span>${all.join(' · ')}</span>` : '';
    };
    draw();
    if (Object.keys(tm.graces).length) teamGraceTimer = setInterval(draw, 1000);
  }

  function teamTimer() {
    cancelAnimationFrame(timerRaf);
    const opened = new Date(tm.openedAt).getTime();
    const tick = () => {
      if (!tm || tm.phase !== 'question') return;
      const left = Math.max(0, tm.questionMs - (Date.now() + clockOffset - opened));
      const fill = document.getElementById('rk-timer-fill');
      if (fill) { fill.style.width = `${(left / tm.questionMs) * 100}%`; fill.classList.toggle('warning', left < tm.questionMs / 3); }
      if (left <= 0) { document.querySelectorAll('.rk-team-choice').forEach((b) => { b.disabled = true; }); return; }
      timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function teamAnswer(i) {
    if (!tm || tm.answered || tm.phase !== 'question') return;
    tm.answered = true;
    document.querySelectorAll('.rk-team-choice').forEach((b) => { b.disabled = true; });
    document.querySelector(`.rk-team-choice[data-i="${i}"]`).classList.add('chosen');
    document.getElementById('rk-reveal').innerHTML = `<p class="rk-note">${ic('hourglass', 'icon-sm')} ส่งคำตอบแล้ว รอทุกคน…</p>`;
    app().rtSend('ranked:team_answer', { matchId: tm.matchId, questionIndex: tm.index, choiceIndex: i });
  }

  function teamReveal(msg) {
    if (!tm || tm.matchId !== msg.matchId) return;
    tm.phase = 'reveal'; cancelAnimationFrame(timerRaf);
    tm.teamScores = msg.teamScores;
    const btns = [...document.querySelectorAll('.rk-team-choice')];
    btns.forEach((b) => { b.disabled = true; });
    const mineA = msg.answers.find((a) => a.slot === tm.yourSlot);
    if (btns[msg.correctIndex]) btns[msg.correctIndex].classList.add('correct');
    if (mineA && mineA.choice_index !== null && !mineA.correct && btns[mineA.choice_index]) btns[mineA.choice_index].classList.add('wrong');
    sfx(mineA && mineA.correct ? 'correct' : 'incorrect');
    document.getElementById('rk-score-you').textContent = msg.teamScores[tm.yourTeam];
    document.getElementById('rk-score-opp').textContent = msg.teamScores[1 - tm.yourTeam];
    if (msg.teamHp) {
      setHp('opp', msg.teamHp[1 - tm.yourTeam], msg.hpMax); setHp('you', msg.teamHp[tm.yourTeam], msg.hpMax);
      tm.teamHp = msg.teamHp;
    }
    const lines = msg.answers.map((a) => {
      const p = tm.players.find((x) => x.slot === a.slot);
      return `<span class="rk-opp-line">${p.team === tm.yourTeam ? 'ทีมคุณ' : 'คู่แข่ง'} · ${esc(p.name)}: ${a.choice_index === null ? (p.gone ? 'ออกจากเกมแล้ว' : 'ไม่ได้ตอบ') : a.correct ? `ถูก +${a.points}` : 'ผิด'}</span>`;
    }).join('');
    document.getElementById('rk-reveal').innerHTML = G.feedback(Boolean(mineA && mineA.correct), mineA && mineA.choice_index === null ? 'หมดเวลา' : mineA && mineA.correct ? `ถูกต้อง +${mineA.points}` : 'ยังไม่ถูก',
      `${mineA && mineA.correct ? '' : `คำตอบที่ถูก: <b>${esc(btns[msg.correctIndex] ? btns[msg.correctIndex].textContent : '')}</b><br>`}${esc(msg.explain || '')}${msg.teamTaken ? hpLine({ you: msg.teamTaken[tm.yourTeam], opponent: msg.teamTaken[1 - tm.yourTeam] }, 'ทีมคู่แข่ง').replace('คุณเสีย', 'ทีมคุณเสีย') : ''}${lines}
       <span class="rk-opp-line">${msg.ko ? 'HP ของทีมหมดแล้ว — กำลังสรุปผล…' : msg.isLast ? 'กำลังสรุปผล…' : `ข้อถัดไปเริ่มใน ${Math.round(msg.nextInMs / 1000)} วินาที`}</span>`);
    G.iconize(document.getElementById('rk-reveal'));
  }

  function teamMessage(msg) {
    switch (msg.type) {
      case 'ranked:party':
        party = Array.isArray(msg.members) ? msg : null;   // ไม่ได้อยู่ในทีม = ข้อความว่าง
        refreshTeamPanel();
        if (party && party.members.length >= 2) {           // เพื่อนเข้าทีมแล้ว -> ปิดหน้าต่างชวนเอง
          const inv = document.getElementById('rk-invite-ov');
          if (inv) { inv.remove(); app().toast(`${party.members.find((m) => m.id !== app().user.id).name} เข้าทีมแล้ว`, 'success'); }
        }
        return true;
      case 'ranked:party_invited': showInvite(msg); return true;
      case 'ranked:party_invite_sent': app().toast('ส่งคำชวนแล้ว', 'success'); return true;
      case 'ranked:party_declined': app().toast('เพื่อนยังไม่สะดวกเข้าทีม', 'info'); return true;
      case 'ranked:party_left': app().toast('เพื่อนออกจากทีมแล้ว', 'info'); return true;
      case 'ranked:team_queue':
        if (msg.status === 'searching') { if (!teamQueueOv) openTeamQueue(); } else closeTeamQueue(false);
        return true;
      case 'ranked:team_queue_offer': {
        const box = document.getElementById('rk-tq-offer');
        if (box && msg.kind === 'offer' && party && party.leader === app().user.id) {
          box.innerHTML = `<button class="btn btn-primary btn-block" type="button" data-tq="npc">${ic('swords', 'icon-sm')} เริ่มเลยกับทีมระดับใกล้เคียง</button>`;
        }
        return true;
      }
      case 'ranked:team_matched': teamLoading(msg); enterTeam(msg); return true;
      case 'ranked:team_question':
        if (!tm || tm.matchId !== msg.matchId) return true;
        Object.assign(tm, { index: msg.index, question: msg.question, openedAt: msg.openedAt, serverNow: msg.serverNow,
          questionMs: msg.questionMs, answered: false, phase: 'question', answeredSlots: new Set(), teamHp: msg.teamHp || null });
        renderTeam(); return true;
      case 'ranked:team_answered':
        if (tm && tm.index === msg.index) {
          tm.answeredSlots.add(msg.slot);
          const c = document.querySelector(`.rk-chip[data-slot="${msg.slot}"]`);
          if (c && !c.classList.contains('done')) { c.classList.add('done'); c.insertAdjacentHTML('beforeend', ic('check', 'icon-sm')); }
        }
        return true;
      case 'ranked:team_reveal': teamReveal(msg); return true;
      case 'ranked:team_status': {
        if (!tm) return true;
        const p = tm.players.find((x) => x.slot === msg.slot);
        if (msg.gone && p) p.gone = true;
        if (msg.connected || msg.gone) delete tm.graces[msg.slot];
        else tm.graces[msg.slot] = msg.deadline ? new Date(msg.deadline).getTime() : Date.now() + (msg.graceMs || 30000);
        if (msg.connected && p) app().toast(`${p.name} กลับเข้าเกมแล้ว`, 'info');
        if (msg.gone && p) closePeer(p.slot);
        teamGraceBanner();
        commsSetup();
        return true;
      }
      case 'ranked:team_chat': commsOnChat(msg); return true;
      case 'ranked:voice_peer': commsOnVoicePeer(msg); return true;
      case 'ranked:voice_signal': commsOnSignal(msg); return true;
      case 'ranked:team_left_match':
        commsTeardown(true);
        tm = null; cancelAnimationFrame(timerRaf); clearInterval(teamGraceTimer); clearBattleFx(); app().rtSetFast(false);
        app().toast('ออกจากเกมแล้ว (Surrender) — นับเป็นแพ้ ผลและแต้มแรงค์จะแสดงเมื่อเกมของทีมจบ', 'info'); app().navigateTo('ranked'); return true;
      case 'ranked:team_resume': {
        const wasReconnecting = Boolean(conn.ov);
        hideReconnecting();
        enterTeam(msg);
        (msg.disconnected || []).forEach((d) => { tm.graces[d.slot] = new Date(d.deadline).getTime(); });
        if (msg.question) {
          Object.assign(tm, { index: msg.index, question: msg.question, openedAt: msg.openedAt, serverNow: msg.serverNow,
            questionMs: msg.questionMs, answered: msg.answered, phase: msg.phase === 'reveal' ? 'reveal' : 'question' });
          renderTeam();
          if (msg.reveal) teamReveal(msg.reveal);
        }
        if (wasReconnecting) app().toast('เชื่อมต่อได้แล้ว — กลับเข้าเกมเดิม', 'success');
        return true;
      }
      case 'ranked:team_ended': {
        cancelAnimationFrame(timerRaf); clearInterval(teamGraceTimer); commsTeardown(true);
        const id = msg.matchId; const wasPlaying = Boolean(tm); tm = null;
        // คนที่ออกไปก่อน: ไม่เด้งหน้าผลทับสิ่งที่กำลังทำ — บอกผลสั้น ๆ แทน
        if (msg.result && (wasPlaying || onMatchScreen())) renderResult(msg.result, id);
        else if (msg.result) app().toast(`เกมทีมจบแล้ว: ${LABELS[labelOfResult(msg.result)].short} · ${msg.result.qr.delta} แต้ม`, 'info');
        return true;
      }
      default: return false;
    }
  }


  /* ================= คุยกับเพื่อนร่วมทีม (Team Ranked) =================
     - พิมพ์: ข้อความสั้น ≤ 120 ตัว + ปุ่มลัด · ส่งถึงเพื่อนร่วมทีมเท่านั้น (ทีมตรงข้ามไม่เห็น) · ไม่บันทึก
     - เสียง: WebRTC ตรงระหว่างสองเครื่อง (เซิร์ฟเวอร์ส่งต่อแค่สัญญาณเชื่อมต่อ) · เปิดไมค์เมื่อกดเองเท่านั้น
       ระหว่างคุยเพลงหรี่ลง · ปิดทุกอย่างเมื่อเกมจบ/ออกจากเกม */
  const QUICK = ['ฉันว่าตัวเลือกที่ 1', 'ฉันว่าตัวเลือกที่ 2', 'ฉันว่าตัวเลือกที่ 3', 'ฉันว่าตัวเลือกที่ 4', 'ไม่แน่ใจ ช่วยดูหน่อย', 'มั่นใจ ตอบเลย', 'สู้ ๆ!'];
  const comms = { matchId: null, open: false, unread: 0, log: [], voice: { on: false, stream: null, peers: new Map(), mutedOut: false, busy: false } };

  const mates = () => (tm ? tm.players.filter((p) => p.team === tm.yourTeam && p.slot !== tm.yourSlot) : []);
  const humanMates = () => mates().filter((p) => !p.isNpc && !p.gone);
  const canVoice = () => Boolean(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function commsSetup() {
    const box = document.getElementById('rk-comms');
    if (!box || !tm) return;
    if (comms.matchId !== tm.matchId) { commsTeardown(false); comms.matchId = tm.matchId; comms.log = []; comms.unread = 0; comms.open = false; }
    const show = humanMates().length > 0;
    box.classList.toggle('hidden', !show);
    document.body.classList.toggle('rk-has-comms', show);
    if (!show) return;
    commsRender();
    // ต่อเน็ตกลับมาระหว่างที่เปิดไมค์อยู่ -> บอกเซิร์ฟเวอร์ใหม่ (เพื่อเชื่อมต่อเสียงอีกครั้ง)
    if (comms.voice.on) app().rtSend('ranked:voice', { matchId: tm.matchId, on: true });
  }

  function commsRender() {
    const box = document.getElementById('rk-comms');
    if (!box || !tm) return;
    const v = comms.voice;
    const mate = humanMates()[0];
    const mateVoice = mate && mate.voice;
    const last = comms.log[comms.log.length - 1];
    box.classList.toggle('is-open', comms.open);
    box.innerHTML = `
      ${comms.open ? `<div class="rk-comms-panel" role="dialog" aria-label="แชททีม">
        <div class="rk-comms-log" id="rk-comms-log" aria-live="polite">${comms.log.length ? comms.log.map((m) => `<p class="rk-cm ${m.slot === tm.yourSlot ? 'mine' : ''}"><b>${esc(m.slot === tm.yourSlot ? 'คุณ' : m.name)}</b> ${esc(m.text)}</p>`).join('')
          : '<p class="rk-cm-empty">คุยกับเพื่อนร่วมทีมได้ที่นี่ — ทีมคู่แข่งไม่เห็นข้อความ</p>'}</div>
        <div class="rk-comms-quick">${QUICK.map((q, i) => `<button class="rk-qchip" type="button" data-cq="${i}">${esc(q.replace('ฉันว่าตัวเลือกที่ ', 'ข้อ '))}</button>`).join('')}</div>
        <form class="rk-comms-form" id="rk-comms-form" autocomplete="off">
          <input id="rk-comms-input" maxlength="120" placeholder="พิมพ์ถึงเพื่อนร่วมทีม…" aria-label="ข้อความถึงเพื่อนร่วมทีม">
          <button class="btn btn-primary" type="submit" aria-label="ส่ง">${ic('send', 'icon-sm')}</button>
        </form></div>` : ''}
      <div class="rk-comms-bar">
        <button class="rk-comms-btn ${v.on ? 'is-on' : ''}" type="button" data-comms="mic" ${!canVoice() || v.busy ? 'disabled' : ''}
          aria-pressed="${v.on}" aria-label="${v.on ? 'ปิดไมค์' : 'เปิดไมค์คุยกับเพื่อนร่วมทีม'}">${ic(v.on ? 'mic' : 'mic-off', 'icon-sm')}<span>${v.on ? 'ไมค์เปิด' : 'ไมค์'}</span></button>
        <button class="rk-comms-btn ${v.mutedOut ? '' : 'is-quiet'}" type="button" data-comms="spk" aria-pressed="${v.mutedOut}"
          aria-label="${v.mutedOut ? 'เปิดเสียงเพื่อน' : 'ปิดเสียงเพื่อน'}">${ic(v.mutedOut ? 'volume-x' : 'volume-2', 'icon-sm')}</button>
        <button class="rk-comms-btn rk-comms-chat ${comms.open ? 'is-on' : ''}" type="button" data-comms="chat" aria-expanded="${comms.open}" aria-label="แชททีม">
          ${ic('message-circle', 'icon-sm')}<span class="rk-comms-preview">${last && !comms.open ? `${esc(last.slot === tm.yourSlot ? 'คุณ' : last.name)}: ${esc(last.text)}` : 'แชททีม'}</span>
          ${comms.unread ? `<span class="nav-badge rk-comms-badge">${comms.unread}</span>` : ''}</button>
        <span class="rk-comms-mate ${mateVoice ? 'is-live' : ''}" title="${mate ? esc(mate.name) : ''}">${mate ? `${ic(mateVoice ? 'mic' : 'mic-off', 'icon-sm')}<small>${esc(mate.name)}</small>` : ''}</span>
      </div>`;
    const log = document.getElementById('rk-comms-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function commsSend(text) {
    const t = String(text || '').trim().slice(0, 120);
    if (!t || !tm) return;
    if (!app().rtConnected) { app().toast('ยังไม่ได้เชื่อมต่อแบบเรียลไทม์', 'error'); return; }
    app().rtSend('ranked:team_chat', { matchId: tm.matchId, text: t });
  }

  function commsOnChat(msg) {
    if (!tm || msg.matchId !== tm.matchId) return;
    comms.log.push(msg);
    if (comms.log.length > 40) comms.log.shift();
    if (!comms.open && msg.slot !== tm.yourSlot) { comms.unread += 1; sfx('click'); }
    const keep = document.activeElement && document.activeElement.id === 'rk-comms-input' ? document.getElementById('rk-comms-input').value : null;
    commsRender();
    if (keep !== null) { const inp = document.getElementById('rk-comms-input'); inp.value = keep; inp.focus(); }
  }

  /* ---- เสียง ---- */
  const iceServers = () => ((cfg && cfg.rtc && cfg.rtc.iceServers) || [{ urls: 'stun:stun.l.google.com:19302' }]);

  async function micOn() {
    const v = comms.voice;
    if (v.on || v.busy || !tm) return;
    v.busy = true; commsRender();
    try {
      v.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      v.on = true;
      if (window.EQAudio) window.EQAudio.duck(true, 'voice');
      app().rtSend('ranked:voice', { matchId: tm.matchId, on: true });
      const mate = humanMates()[0];
      app().toast(mate && mate.voice ? 'เปิดไมค์แล้ว — กำลังเชื่อมต่อเสียงกับเพื่อน' : 'เปิดไมค์แล้ว — รอเพื่อนร่วมทีมเปิดไมค์', 'info');
    } catch (err) {
      app().toast(err && err.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้ไมค์ — เปิดสิทธิ์ไมค์ในการตั้งค่าเบราว์เซอร์' : 'เปิดไมค์ไม่ได้ในอุปกรณ์นี้', 'error');
    } finally { v.busy = false; commsRender(); }
  }

  function micOff(notify = true) {
    const v = comms.voice;
    [...v.peers.keys()].forEach(closePeer);
    if (v.stream) v.stream.getTracks().forEach((t) => t.stop());
    v.stream = null;
    const was = v.on;
    v.on = false;
    if (window.EQAudio) window.EQAudio.duck(false, 'voice');
    if (was && notify && tm && app().rtConnected) app().rtSend('ranked:voice', { matchId: tm.matchId, on: false });
  }

  function closePeer(slot) {
    const p = comms.voice.peers.get(slot);
    if (!p) return;
    try { p.pc.close(); } catch (_) { /* ปิดแล้ว */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    comms.voice.peers.delete(slot);
  }

  function makePeer(slot) {
    closePeer(slot);
    const v = comms.voice;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer = { pc, audio: null, pending: [], failedNoted: false };
    v.peers.set(slot, peer);
    if (v.stream) v.stream.getTracks().forEach((t) => pc.addTrack(t, v.stream));
    pc.onicecandidate = (e) => { if (e.candidate && tm) app().rtSend('ranked:voice_signal', { matchId: tm.matchId, toSlot: slot, data: { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } }); };
    pc.ontrack = (e) => {
      if (!peer.audio) {
        peer.audio = document.createElement('audio');
        peer.audio.autoplay = true;
        peer.audio.setAttribute('playsinline', '');
        peer.audio.className = 'sr-only';
        document.body.appendChild(peer.audio);
      }
      peer.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      peer.audio.muted = v.mutedOut;
      peer.audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') app().toast('เชื่อมต่อเสียงกับเพื่อนร่วมทีมแล้ว', 'success');
      if (pc.connectionState === 'failed' && !peer.failedNoted) {
        peer.failedNoted = true;
        app().toast('เชื่อมต่อเสียงไม่ได้ (เครือข่ายนี้อาจบล็อกการคุยเสียง) — ใช้แชทพิมพ์แทนได้', 'error');
      }
    };
    return peer;
  }

  async function callPeer(slot) {
    const peer = makePeer(slot);
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      app().rtSend('ranked:voice_signal', { matchId: tm.matchId, toSlot: slot, data: { sdp: peer.pc.localDescription.toJSON ? peer.pc.localDescription.toJSON() : peer.pc.localDescription } });
    } catch (_) { closePeer(slot); }
  }

  function commsOnVoicePeer(msg) {
    if (!tm || msg.matchId !== tm.matchId) return;
    const p = tm.players.find((x) => x.slot === msg.slot);
    if (p) p.voice = Boolean(msg.on);
    if (!msg.on) closePeer(msg.slot);
    else if (comms.voice.on && tm.yourSlot < msg.slot) callPeer(msg.slot);   // ช่องเลขน้อยกว่าเป็นฝ่ายเริ่มเชื่อมต่อ (กันเริ่มชนกัน)
    commsRender();
  }

  async function commsOnSignal(msg) {
    if (!tm || msg.matchId !== tm.matchId || !comms.voice.on || !msg.data) return;
    const slot = msg.fromSlot;
    const d = msg.data;
    try {
      if (d.sdp) {
        let peer = comms.voice.peers.get(slot);
        if (d.sdp.type === 'offer') peer = makePeer(slot);
        if (!peer) return;
        await peer.pc.setRemoteDescription(d.sdp);
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
        if (d.sdp.type === 'offer') {
          const ans = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(ans);
          app().rtSend('ranked:voice_signal', { matchId: tm.matchId, toSlot: slot, data: { sdp: peer.pc.localDescription.toJSON ? peer.pc.localDescription.toJSON() : peer.pc.localDescription } });
        }
      } else if (d.candidate) {
        const peer = comms.voice.peers.get(slot);
        if (!peer) return;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(d.candidate).catch(() => {});
        else peer.pending.push(d.candidate);
      }
    } catch (_) { /* สัญญาณเสีย -> ไม่เชื่อมต่อเสียง (แชทยังใช้ได้) */ }
  }

  function commsTeardown(hide = true) {
    micOff(false);
    comms.matchId = hide ? null : comms.matchId;
    if (hide) {
      const box = document.getElementById('rk-comms');
      if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
      document.body.classList.remove('rk-has-comms');
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#rk-comms [data-comms], #rk-comms [data-cq]');
    if (!b) return;
    if (b.dataset.cq !== undefined) { commsSend(QUICK[Number(b.dataset.cq)]); return; }
    const k = b.dataset.comms;
    if (k === 'chat') {
      comms.open = !comms.open; if (comms.open) comms.unread = 0; commsRender();
      if (comms.open && window.matchMedia('(pointer: fine)').matches) { const i = document.getElementById('rk-comms-input'); if (i) i.focus(); }
    } else if (k === 'mic') {
      if (comms.voice.on) { micOff(true); commsRender(); } else micOn();
    } else if (k === 'spk') {
      comms.voice.mutedOut = !comms.voice.mutedOut;
      comms.voice.peers.forEach((p) => { if (p.audio) p.audio.muted = comms.voice.mutedOut; });
      commsRender();
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'rk-comms-form') return;
    e.preventDefault();
    const inp = document.getElementById('rk-comms-input');
    commsSend(inp.value);
    inp.value = '';
  });
  window.addEventListener('eq:screen', (e) => { if (e.detail.id !== 'screen-ranked-match' && comms.matchId && !tm) commsTeardown(true); });
  // คู่มือ Ranked เปิดค้างไว้แล้วกดไปหน้าอื่น -> ปิดคู่มือ (ไม่บันทึกว่าดูจบ จะขึ้นใหม่ครั้งหน้าที่เข้า Ranked)
  window.addEventListener('eq:screen', (e) => {
    if (e.detail.id === 'screen-ranked') return;
    const t = document.getElementById('rk-tutorial-ov'); if (t) t.remove();
  });

  /* ================= RANKED LEADERBOARD ================= */
  let lbScope = 'season';
  let lbFrom = 'ranked';   // ปุ่มกลับของ Ranked Leaderboard: มาจาก Lobby ของ Ranked หรือจากหน้า "อันดับ" ของแอป
  async function openLeaderboard() {
    app().showScreen('screen-ranked-leaderboard');
    const back = document.getElementById('rk-lb-back');
    if (back) back.innerHTML = `${ic('arrow-left', 'icon-sm')} ${lbFrom === 'app' ? 'กลับหน้าเล่น' : 'กลับ Ranked Quest'}`;
    await ensureConfig();
    loadLeaderboard();
  }
  async function loadLeaderboard() {
    const list = document.getElementById('rk-lb-list');
    document.querySelectorAll('#rk-lb-tabs .lb-tab').forEach((t) => {
      const on = t.dataset.scope === lbScope; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on));
    });
    const ms = document.getElementById('rk-lb-modes');
    if (ms) ms.innerHTML = modeSwitch();
    list.innerHTML = G.skeleton('list', 5);
    try {
      const d = await app().api(`/ranked/leaderboard?scope=${lbScope}&mode=${rkMode}`);
      document.getElementById('rk-lb-sub').textContent = {
        season: `${d.season.name} · ${d.season.theme} — เรียงตามแต้มแรงค์`, friends: 'คุณกับเพื่อน — เรียงตามแต้มแรงค์ ของซีซันนี้',
        weekly: 'แต้มแรงค์ที่ได้สุทธิในสัปดาห์นี้', global: 'แต้มแรงค์สูงสุดที่เคยทำได้ ทุกซีซัน',
      }[d.scope] + ` · โหมด${MODE_TH[rkMode]}`;
      const row = (r) => `<li class="rk-lb-row${r.isMe ? ' is-me' : ''}"${r.userId ? ` data-uid="${Number(r.userId)}"` : ''}>
        <span class="rk-lb-pos">${G.rankBadge(r.position)}</span>
        <span class="rk-frame rk-frame-sm ${r.frame ? `rk-frame-${esc(r.frame.split(':')[1])}` : ''}">${G.avatar(r.avatar, r.avatarImage, 'rk-av')}</span>
        <span class="rk-lb-main"><b>${esc(r.name)}${r.isMe ? ' (คุณ)' : ''}</b>${r.title ? `<small class="rk-title-sm">${esc(r.title)}</small>` : ''}
          <small>${badge(r.league, 'rk-badge-inline')} ${esc(r.auroraRank ? `${rankLabel('aurora-lion')} #${r.auroraRank}` : rankLabel(r.league, r.divisionIndex) || r.label)} · Win ${r.winRate}%</small></span>
        <span class="rk-lb-score"><b>${d.scope === 'weekly' ? `${r.score >= 0 ? '+' : ''}${r.score}` : Number(r.score).toLocaleString()}</b><small>แต้ม</small></span><span class="lb-friend"></span></li>`;
      list.innerHTML = d.top.length ? d.top.map(row).join('') + (d.me && !d.top.some((r) => r.isMe) ? row(d.me) : '')
        : `<li>${G.emptyState({ art: 'leaderboard', title: 'ยังไม่มีอันดับ', text: 'เล่น Ranked Quest เพื่อขึ้นกระดานอันดับ', compact: true })}</li>`;
      if (app().attachFriendButtons) app().attachFriendButtons(list);
    } catch (err) { list.innerHTML = `<li class="state-error-card"><p>${esc(err.message)}</p></li>`; }
  }


  /* ================= RANK REWARDS (Cosmetic only) ================= */
  async function openRewards() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rk-rewards"><h2>Rank Rewards</h2><div id="rk-rw-body">${G.skeleton('list', 3)}</div></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'Rank Rewards', variant: 'sheet' });
    const render = async () => {
      const d = await app().api('/ranked/rewards');
      const eqT = d.equipped.title && d.equipped.title.id; const eqF = d.equipped.frame && d.equipped.frame.id;
      const item = (r) => {
        const on = r.id === eqT || r.id === eqF;
        const vis = r.league ? badge(r.league, 'rk-badge-sm') : `<span class="rk-rw-icon">${ic(r.kind === 'apex' ? 'crown' : 'award', 'icon-lg')}</span>`;
        return `<li class="rk-rw ${r.owned ? '' : 'locked'}">${vis}
          <span class="rk-rw-text"><b>${esc(r.name)}</b><small>${{ title: 'Title', frame: 'Profile Frame', 'season-badge': 'Season Badge', nameplate: 'Name Plate', apex: 'Title · Apex' }[r.kind] || ''}${r.owned ? '' : ' · ยังล็อก'}</small></span>
          ${r.owned && r.equip ? `<button class="mini-btn ${on ? 'ghost' : 'accept'}" type="button" data-equip="${esc(r.equip)}" data-id="${on ? '' : esc(r.id)}">${on ? 'ถอด' : 'ใช้'}</button>` : (r.owned ? '' : ic('lock', 'icon-sm'))}</li>`;
      };
      document.getElementById('rk-rw-body').innerHTML = `<p class="rk-note">${ic('info', 'icon-sm')} ${esc(d.note)}</p>
        <ul class="rk-rw-list">${[...d.extras, ...d.catalog].map(item).join('')}</ul>`;
    };
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-equip]');
      if (!b) return;
      b.disabled = true;
      try {
        await app().api('/ranked/rewards/equip', { method: 'POST', body: { slot: b.dataset.equip, rewardId: b.dataset.id || null } });
        await render(); me = null;
      } catch (err) { app().toast(err.message, 'error'); b.disabled = false; }
    });
    try { await render(); } catch (err) { document.getElementById('rk-rw-body').innerHTML = `<p>${esc(err.message)}</p>`; }
  }

  /* ================= ANALYTICS (ผู้ดูแล) ================= */
  async function openAnalytics() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rk-analytics"><h2>Ranked Analytics</h2><div id="rk-an-body">${G.skeleton('card')}</div></div>`;
    document.body.appendChild(ov);
    app().makeDialog(ov, { label: 'Ranked Analytics', variant: 'sheet' });
    try {
      const d = await app().api('/ranked/admin/analytics');
      const table = (rows, cols) => (rows.length ? `<div class="rk-an-table"><table><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c[0]] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="rk-note">ยังไม่มีข้อมูล</p>');
      const o = d.overview;
      document.getElementById('rk-an-body').innerHTML = `
        <p class="rk-note">${esc(d.season.name)} · ${esc(d.season.theme)}</p>
        <section class="rk-result-stats"><div><b>${o.finished}</b><span>เกมที่จบ</span></div><div><b>${o.completionPct ?? '—'}%</b><span>Match completion</span></div>
          <div><b>${o.disconnectPct ?? '—'}%</b><span>Disconnect</span></div><div><b>${d.queue.avg_queue_ms ? (d.queue.avg_queue_ms / 1000).toFixed(1) : '—'} วิ</b><span>Queue เฉลี่ย (PvP)</span></div></section>
        <h3>อัตราชนะของผู้เล่นเมื่อเจอ NPC</h3>${table(d.npcWinRates, [['npc_id', 'NPC'], ['match_type', 'ชนิด'], ['games', 'เกม'], ['player_win_pct', 'ผู้เล่นชนะ %']])}
        <h3>Promotion Trials</h3>${table(d.promotions, [['guardian', 'Guardian'], ['trials', 'ครั้ง'], ['success_pct', 'สำเร็จ %']])}
        <h3>ความแม่นยำตามชนิดคำถาม</h3>${table(d.questionTypes, [['type', 'ชนิด'], ['answers', 'คำตอบ'], ['accuracy_pct', 'ถูก %'], ['avg_response_ms', 'ms เฉลี่ย']])}
        <h3>จำนวนผู้เล่นแต่ละ League</h3>${table(d.leagueDistribution, [['name', 'League'], ['players', 'ผู้เล่น']])}
        <h3>Battle HP</h3>${d.battle ? `<section class="rk-result-stats rk-an-battle">
          <div><b>${d.battle.avgHpRemaining ?? '—'}</b><span>HP เหลือเฉลี่ย</span></div>
          <div><b>${d.battle.avgDurationSec ? `${Math.round(d.battle.avgDurationSec / 60 * 10) / 10} นาที` : '—'}</b><span>ระยะเวลาเกมเฉลี่ย</span></div>
          <div><b>${d.battle.hpZeroPct ?? '—'}%</b><span>จบด้วย HP 0</span></div>
          <div><b>${d.battle.questionLimitPct ?? '—'}%</b><span>จบเมื่อครบข้อ</span></div>
          <div><b>${d.battle.disconnectRatePct ?? '—'}%</b><span>แพ้เพราะหลุด</span></div>
          <div><b>${d.battle.reconnectSuccessPct ?? '—'}%</b><span>หลุดแล้วกลับมาทัน</span></div>
          <div><b>${d.battle.surrenderRatePct ?? '—'}%</b><span>Surrender</span></div>
          <div><b>${d.battle.penaltyCount}</b><span>ครั้งที่โดน penalty</span></div>
          <div><b>${d.battle.criticalComebackPct ?? '—'}%</b><span>Comeback จาก HP วิกฤต</span></div></section>` : ''}
        <h3>ผลการแข่ง (result reason)</h3>${table(d.resultReasons || [], [['reason', 'เหตุ'], ['matches', 'เกม']])}
        <h3>เหตุที่เกมจบ</h3>${table(d.endReasons, [['reason', 'เหตุ'], ['matches', 'เกม']])}`;
    } catch (err) { document.getElementById('rk-an-body').innerHTML = `<p>${esc(err.message)}</p>`; }
  }

  /* ================= ผูกเหตุการณ์ (delegation) ================= */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-rk], [data-q], [data-tq], [data-scope], [data-lb-mode], [data-rk-mode], #rk-next, #rk-forfeit, #rk-toggle-missed, .rk-choice, #play-btn-ranked, #rk-back, #rk-journey-back, #rk-lb-back, [data-rk-grammar]');
    if (!t) return;
    if (t.classList.contains('btn')) sfx('click');
    if (t.classList.contains('rk-pvp-choice')) { pvpAnswer(Number(t.dataset.i)); return; }
    if (t.classList.contains('rk-team-choice')) { teamAnswer(Number(t.dataset.i)); return; }
    if (t.id === 'rk-forfeit') { confirmLeave(); return; }
    if (t.dataset.tq) { if (t.dataset.tq === 'cancel') closeTeamQueue(true); else { app().rtSend('ranked:team_queue_npc'); } return; }
    if (t.dataset.rkMode) {                // สลับโหมด Vocab / Grammar (ใน Lobby หรือกระดานอันดับ)
      if (t.dataset.rkMode === rkMode) return;
      setMode(t.dataset.rkMode);
      if (t.closest('#rk-lb-modes')) { loadLeaderboard(); return; }
      if (t.closest('#rk-journey-modes')) { openJourney(); return; }
      if (t.closest('#rk-hist-modes')) { openHistory(); return; }
      try { await loadMe(); renderLobby(); } catch (err) { app().toast(err.message, 'error'); }
      return;
    }
    if (t.id === 'rk-lb-back') { app().navigateTo(lbFrom === 'app' ? 'play' : 'ranked'); return; }
    if (t.dataset.lbMode) {                // สลับกระดาน EXP / Ranked Quest
      if (t.dataset.lbMode === 'ranked') { if (!t.classList.contains('active')) { lbFrom = 'app'; app().navigateTo('ranked-leaderboard'); } }
      else if (!t.classList.contains('active')) app().navigateTo('leaderboard');
      return;
    }
    if (t.dataset.scope && t.closest('#rk-lb-tabs')) { lbScope = t.dataset.scope; loadLeaderboard(); return; }
    if (t.dataset.q) {
      const q = t.dataset.q;
      if (q === 'keep') { document.getElementById('rk-queue-offer').innerHTML = ''; return; }
      closeQueue(true);
      if (q === 'npc') startMatch('ranked', { npcFallback: true });
      return;
    }
    if (t.id === 'play-btn-ranked') { app().navigateTo('ranked'); return; }
    if (t.id === 'rk-back') { app().navigateTo('play'); return; }
    if (t.id === 'rk-journey-back') { app().navigateTo('ranked'); return; }
    if (t.classList.contains('rk-choice')) { submit(Number(t.dataset.i)); return; }
    if (t.id === 'rk-next') { next(); return; }
    if (t.id === 'rk-toggle-missed') { document.getElementById('rk-missed-list').classList.toggle('hidden'); return; }
    if (t.hasAttribute('data-rk-grammar')) { app().openGrammarList(); return; }
    switch (t.dataset.rk) {
      case 'ranked': case 'promotion': startMatch(t.dataset.rk); break;
      case 'equip': break;
      case 'resume': resumeMatch(me.activeMatchId); break;
      case 'journey': app().navigateTo('ranked-journey'); break;
      case 'history': app().navigateTo('ranked-history'); break;
      case 'team-invite': openInvite(); break;
      case 'team-leave': app().rtSend('ranked:party_leave'); party = null; refreshTeamPanel(); break;
      case 'team-find': if (!app().rtConnected) app().toast('ยังไม่ได้เชื่อมต่อแบบเรียลไทม์', 'error'); else app().rtSend('ranked:team_queue_join', { mode: rkMode }); break;
      case 'leaderboard': lbFrom = 'ranked'; app().navigateTo('ranked-leaderboard'); break;
      case 'rewards': openRewards(); break;
      case 'analytics': openAnalytics(); break;
      case 'apex': startMatch('apex'); break;
      case 'howto': openTutorial(); break;
      case 'placement': app().openPlacement(); break;
      case 'lobby': app().navigateTo('ranked'); break;
      default: break;
    }
  });

  /* โปรไฟล์: แรงค์ของทั้งสองโหมด (ชื่อไทยจากข้อมูลกลาง) -> กดเปิดแผนที่ */
  async function profileRank() {
    const box = document.getElementById('profile-rank');
    if (!box) return;
    try {
      const d = await loadMe();
      box.innerHTML = `<h2 class="home-card-title" id="profile-rank-title">${ic('swords')} แรงค์ของฉัน</h2>
        <div class="pf-ranks">${['vocab', 'grammar'].map((m) => {
    const info = d.modes[m];
    return `<button class="pf-rank" type="button" data-pf-rank="${m}" style="${leagueVars(leagueOf(info.league))}">${badge(info.league, 'rk-badge-sm')}
            <span><small>โหมด${MODE_TH[m]}</small><b>${esc(info.label)}</b><small>${info.questRating.toLocaleString()} แต้มแรงค์</small></span></button>`;
  }).join('')}</div>`;
      box.classList.remove('hidden');
    } catch (_) { box.classList.add('hidden'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pf-rank]');
    if (!b) return;
    setMode(b.dataset.pfRank);
    app().navigateTo('ranked-journey');
  });
  window.addEventListener('eq:screen', (e) => { if (e.detail.id === 'screen-profile' && app() && app().user) profileRank(); });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#rk-hist-more')) loadMoreHistory(false);
    if (e.target.closest('#rk-hist-back')) app().navigateTo('ranked');
  });
  window.EQRanked = { openHistory, openLobby, openJourney, openLeaderboard, homeHint, playCard, onMessage };
})();
