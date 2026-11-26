/* =====================================================================
   Game Lobby หน้าหลัก — v1.16.0 — window.EQLobby
   - ตัวละคร 3D ของผู้ใช้ยืนกลางล็อบบี้ (ชุดที่สวมจริง · Idle · ลากหมุนได้) ผ่าน EQAvatar.lobbyStage
     ไม่มีแผนที่ ไม่เดิน ไม่ส่ง/รับตำแหน่งกับผู้เล่นอื่น (EnglishQuest World ถูกนำออกแล้ว)
   - ข้อมูลจาก GET /api/lobby ครั้งเดียว: Level/EXP · Coin · แรงค์ · เควสต์ประจำวัน · กิจกรรม · เพื่อนออนไลน์ · แชทโลกล่าสุด
   - ข้อความจากผู้ใช้ทุกชิ้นผ่าน esc() ก่อนแสดง
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const MODE_TH = { vocab: 'คำศัพท์', grammar: 'แกรมม่า' };
  const Q_ICON = { answers: 'target', grammar: 'languages', ranked: 'swords' };
  const st = { stage: null, mounting: false, seq: 0, data: null };

  /* ---------------- ตัวละครกลางล็อบบี้ ---------------- */
  function stageAlive() {
    const A = window.EQAvatar;
    return Boolean(st.stage && A && A._stages && A._stages().includes(st.stage));
  }
  async function mountAvatar() {
    const box = $('hl-stage');
    if (!box || !window.EQAvatar || !window.EQAvatar.lobbyStage) return;
    if (stageAlive() || st.mounting) return;
    st.stage = null; st.mounting = true;
    try {
      const s = await window.EQAvatar.lobbyStage(box, {
        label: 'Avatar ของฉัน',
        onState: (state) => { const h = $('hl-hint'); if (h) h.hidden = state === 'fallback'; },
      });
      // ระหว่างรอโหลด ผู้ใช้อาจกดไปหน้าอื่นแล้ว → ปิดทิ้งทันที (ไม่ render เบื้องหลัง)
      const home = $('screen-home');
      if (home && home.classList.contains('hidden')) { s.dispose(); return; }
      st.stage = s;
      const h = $('hl-hint'); if (h) h.hidden = !s.is3D;
    } catch (_) {
      box.innerHTML = '<p class="hl-empty" role="status">โหลดตัวละครไม่สำเร็จ — ลองรีเฟรชหน้า</p>';
    } finally { st.mounting = false; }
  }

  /* ---------------- แถบสถานะ ---------------- */
  function renderAccount(a) {
    $('hl-name').textContent = a.username || '';
    $('hl-lv').textContent = String(a.level);
    $('hl-lvring').style.setProperty('--p', String(a.progressPercent || 0));
    $('hl-exp-bar').style.width = `${a.progressPercent || 0}%`;
    $('hl-exp-wrap').setAttribute('aria-valuenow', String(a.progressPercent || 0));
    $('hl-exp-text').textContent = `EXP ${fmt(a.expIntoLevel)} / ${fmt(a.expForNextLevel)} · รวม ${fmt(a.exp)}`;
    const bal = window.EQAvatar && Number.isFinite(window.EQAvatar.balance) ? window.EQAvatar.balance : a.coins;
    $('hl-coins').textContent = fmt(bal);
  }
  function renderRank(rank) {
    const modes = Object.entries(rank || {}).filter(([, r]) => r);
    const img = $('hl-rank-img');
    if (!modes.length) { $('hl-rank-label').textContent = 'เริ่มแข่งเลย'; img.hidden = true; return; }
    const [mode, best] = modes.sort((x, y) => (y[1].questRating || 0) - (x[1].questRating || 0))[0];
    $('hl-rank-mode').textContent = `แรงค์${MODE_TH[mode] || ''}`;
    $('hl-rank-label').textContent = best.label;
    $('hl-rank').setAttribute('aria-label', `แรงค์${MODE_TH[mode] || ''}: ${best.label} — เปิด Ranked`);
    if (best.badge) { img.src = best.badge; img.hidden = false; img.onerror = () => { img.hidden = true; }; } else img.hidden = true;
    $('hl-ranked-sub').textContent = modes.map(([m, r]) => `${MODE_TH[m] || m} ${r.label}`).join(' · ');
  }

  /* ---------------- เควสต์ (v1.26.0 QuestCard แบบเกม RPG) ----------------
     กลุ่ม: "รายวัน" (/api/lobby · รางวัล EXP + Coin จริง กดรับเมื่อเซิร์ฟเวอร์ตรวจว่าครบ) · "คริสต์มาส" (ช่วงเทศกาล · /api/christmas · Snowflake Token)
     ไม่มีเมนูซ้ำ: การ์ดคริสต์มาสบนหน้าแรกไม่แสดงรายการเควสต์ซ้ำ (แสดงเฉพาะที่นี่) */
  const Q_GEM = { answers: ['target', 'gem-blue'], grammar: ['languages', 'gem-violet'], ranked: ['swords', 'gem-red'] };
  const STATE_TH = { progress: 'กำลังทำ', ready: 'สำเร็จแล้ว', claimed: 'รับแล้ว' };
  const coinImg = '<img class="gq-coin" src="/assets/coin/coin-sm.svg" alt="" width="16" height="16">';
  const flakeSvg = '<svg class="gq-flake" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4 6.5l16 11M20 6.5l-16 11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  function questCard(q) {
    const [ic, gem] = q.gem || Q_GEM[q.id] || ['target', 'gem-blue'];
    const pct = Math.round((Math.min(q.progress, q.goal) / Math.max(1, q.goal)) * 100);
    const busy = st.busy && st.busy.has(q.key);
    const act = q.state === 'ready'
      ? `<button class="gq-claim" type="button" data-gq-claim="${esc(q.key)}"${busy ? ' disabled aria-busy="true"' : ''}>${ICON('gift')} รับรางวัล</button>`
      : q.state === 'claimed' ? `<span class="gq-state is-claimed">${ICON('circle-check')} รับแล้ว</span>`
        : `<button class="gq-go" type="button" data-nav-to="${esc(q.nav)}" aria-label="ไปทำเควสต์: ${esc(q.title)}">${ICON('play')}</button>`;
    const rewards = [q.reward.exp ? `<span class="gq-rw gq-rw-exp"><b>+${fmt(q.reward.exp)}</b> EXP</span>` : '',
      q.reward.coins ? `<span class="gq-rw gq-rw-coin">${coinImg}<b>+${fmt(q.reward.coins)}</b></span>` : '',
      q.reward.tokens ? `<span class="gq-rw gq-rw-tok">${flakeSvg}<b>+${fmt(q.reward.tokens)}</b></span>` : ''].join('');
    return `<li class="gq is-${q.state}" data-gq="${esc(q.key)}">
      <span class="gq-gem ${gem}" aria-hidden="true">${ICON(q.state === 'claimed' ? 'circle-check' : ic, 'icon')}</span>
      <div class="gq-body">
        <div class="gq-head"><b class="gq-title">${esc(q.title)}</b><span class="gq-state is-${q.state}">${STATE_TH[q.state]}</span></div>
        ${q.desc ? `<small class="gq-desc">${esc(q.desc)}</small>` : ''}
        <div class="gq-prog"><span class="gq-bar" role="progressbar" aria-label="ความคืบหน้า ${esc(q.title)}" aria-valuemin="0" aria-valuemax="${esc(q.goal)}" aria-valuenow="${esc(Math.min(q.progress, q.goal))}"><i style="width:${pct}%"></i></span><span class="gq-num">${fmt(Math.min(q.progress, q.goal))}/${fmt(q.goal)}</span></div>
        <div class="gq-foot"><span class="gq-rws" aria-label="รางวัล">${rewards}</span>${act}</div>
      </div></li>`;
  }
  function xmasQuests() {
    const d = st.xmas; if (!d || !(d.quests || []).length) return [];
    return d.quests.map((q) => ({ key: `xm:${q.id}`, id: q.id, title: q.titleTh, desc: q.detail || q.titleEn, progress: q.progress, goal: q.target, nav: q.go || 'christmas',
      state: q.claimed ? 'claimed' : q.canClaim ? 'ready' : 'progress', reward: { exp: q.exp, tokens: q.tokens }, gem: [q.icon || 'gift', 'gem-xmas'] }));
  }
  function renderQuests(qs) {
    st.quests = qs;
    const daily = qs.map((q) => ({ ...q, key: `dq:${q.id}`, reward: q.reward || {}, state: q.state || (q.done ? 'ready' : 'progress') }));
    const xm = xmasQuests();
    const tab = xm.length && st.qtab === 'xmas' ? 'xmas' : 'daily';
    const list = tab === 'xmas' ? xm : daily;
    const done = list.filter((q) => q.state !== 'progress').length;
    $('hl-q-count').textContent = `${done}/${list.length}`;
    const tabs = $('hl-q-tabs');
    if (tabs) {
      tabs.hidden = !xm.length;
      tabs.innerHTML = xm.length ? `<button type="button" role="tab" class="gq-tab${tab === 'daily' ? ' active' : ''}" aria-selected="${tab === 'daily'}" data-gq-tab="daily">รายวัน <small>${daily.filter((q) => q.state === 'ready').length ? '●' : ''}</small></button>
        <button type="button" role="tab" class="gq-tab gq-tab-xmas${tab === 'xmas' ? ' active' : ''}" aria-selected="${tab === 'xmas'}" data-gq-tab="xmas">${flakeSvg} คริสต์มาส <small>${xm.filter((q) => q.state === 'ready').length ? '●' : ''}</small></button>` : '';
    }
    $('hl-quests').innerHTML = list.map(questCard).join('')
      + `<li><p class="hl-note">${tab === 'xmas' ? 'เควสต์เทศกาล: รางวัลเป็น Snowflake Token · รายละเอียดที่ Christmas Hub' : 'นับจากกิจกรรมจริงของวันนี้ (เวลาไทย) · รีเซ็ตเที่ยงคืน · รับรางวัลได้วันละครั้งต่อเควสต์'}</p></li>`;
  }
  /* แอนิเมชันรับรางวัล: เหรียญ/ดาว EXP ลอยเข้าแถบสถานะ + ประกายบนการ์ด (ปิดเมื่อลดการเคลื่อนไหว) */
  function rewardBurst(card, r) {
    if (!card) return;
    card.classList.add('is-celebrate'); setTimeout(() => card.classList.remove('is-celebrate'), 1400);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !card.animate) return;
    const from = card.querySelector('.gq-claim, .gq-state') || card; const a = from.getBoundingClientRect();
    const target = (sel) => { const el = document.querySelector(sel); const b = el && el.getBoundingClientRect(); return b && b.width ? { x: b.left + 22, y: b.top + b.height / 2 } : { x: a.left, y: 20 }; };
    const spawn = (n, cls, to) => {
      for (let i = 0; i < n; i += 1) {
        const p = document.createElement('span'); p.className = `gq-fly ${cls}`; p.setAttribute('aria-hidden', 'true');
        if (cls === 'is-coin') p.innerHTML = coinImg;
        document.body.appendChild(p);
        const sx = a.left + a.width / 2; const sy = a.top + a.height / 2; const ang = Math.random() * Math.PI * 2; const rad = 30 + Math.random() * 40;
        const mx = sx + Math.cos(ang) * rad; const my = sy + Math.sin(ang) * rad - 20;
        p.animate([{ transform: `translate(${sx}px, ${sy}px) scale(.4)`, opacity: 0 }, { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${to.x}px, ${to.y}px) scale(.5)`, opacity: 0.2 }], { duration: 900 + i * 60, delay: i * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' })
          .finished.then(() => p.remove(), () => p.remove());
      }
    };
    if (r.coins || r.tokens) spawn(Math.min(10, 4 + Math.round((r.coins || r.tokens) / 3)), 'is-coin', target('.hl-coin'));
    if (r.exp) spawn(Math.min(10, 4 + Math.round(r.exp / 5)), 'is-exp', target('.hl-lvring'));
    setTimeout(() => { ['.hl-coin', '.hl-lvring'].forEach((s2) => { const el = document.querySelector(s2); if (el) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); } }); }, 950);
  }
  /** หลังเซิร์ฟเวอร์ยืนยัน: เปลี่ยนสถานะการ์ดเป็น "รับแล้ว" ทันที (ไม่รอโหลดข้อมูลหน้าแรกใหม่) */
  function markClaimed(key) {
    if (key.startsWith('dq:')) (st.quests || []).forEach((q) => { if (`dq:${q.id}` === key) { q.state = 'claimed'; q.claimed = true; } });
    else if (st.xmas && st.xmas.quests) st.xmas.quests.forEach((q) => { if (`xm:${q.id}` === key) { q.claimed = true; q.canClaim = false; } });
    st.busy.delete(key);
    renderQuests(st.quests || []);
  }
  async function claim(key) {
    st.busy = st.busy || new Set();
    if (st.busy.has(key)) return;
    st.busy.add(key); renderQuests(st.quests || []);
    const card = document.querySelector(`[data-gq="${CSS.escape(key)}"]`);
    try {
      let r;
      if (key.startsWith('xm:')) {
        r = await App().api(`/christmas/quests/${encodeURIComponent(key.slice(3))}/claim`, { method: 'POST' });
        App().toast(`รับรางวัลเควสต์แล้ว +${r.tokens} Snowflake Token${r.exp ? ` · +${r.exp} EXP` : ''}`, 'success');
      } else {
        r = await App().api(`/lobby/quests/${encodeURIComponent(key.slice(3))}/claim`, { method: 'POST' });
        if (r.already) App().toast('รับรางวัลเควสต์นี้ไปแล้ว', 'info');
        else App().toast(`รับรางวัลแล้ว +${r.exp} EXP${r.coins ? ` · +${r.coins} Coin` : ''}${r.coinsNote ? ` (${r.coinsNote})` : ''}`, 'success');
        if (Number.isFinite(r.balance) && window.EQAvatar) window.EQAvatar.balance = r.balance;
      }
      if (r.levelInfo && App().applyLevelInfo) App().applyLevelInfo(r.levelInfo, r.leveledUp);
      markClaimed(key);
      const fresh = document.querySelector(`[data-gq="${CSS.escape(key)}"]`);
      if (!r.already) rewardBurst(fresh || card, r);
    } catch (e) { App().toast((e && e.message) || 'รับรางวัลไม่สำเร็จ', 'error'); }
    st.busy.delete(key);
    setTimeout(refresh, 700);
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-gq-claim]'); if (c) { claim(c.dataset.gqClaim); return; }
    const t = e.target.closest('[data-gq-tab]'); if (t) { st.qtab = t.dataset.gqTab; renderQuests(st.quests || []); }
  });

  function renderFriends(f) {
    $('hl-friends').textContent = f.total ? `ออนไลน์ ${fmt(f.online)} จาก ${fmt(f.total)} คน` : 'ยังไม่มีเพื่อน — แตะเพื่อเพิ่ม';
  }

  /* ---------------- เปิดหน้า ---------------- */
  async function refresh() {
    const my = ++st.seq;
    let d;
    try { d = await App().api('/lobby'); } catch (err) {
      if (my !== st.seq) return;
      $('hl-quests').innerHTML = `<li><p class="hl-empty" role="status">โหลดข้อมูลล็อบบี้ไม่สำเร็จ — ${esc(err.message || 'ลองใหม่อีกครั้ง')}</p></li>`;
      return;
    }
    if (my !== st.seq) return;
    st.data = d;
    renderAccount(d.account);
    renderRank(d.rank);
    st.xmas = null;
    if (window.EQSeason && window.EQSeason.key === 'christmas') { try { st.xmas = await App().api('/christmas'); } catch (_) { st.xmas = null; } }
    if (my !== st.seq) return;
    renderQuests(d.quests || []);
    renderFriends(d.friends || { total: 0, online: 0 });
    if (window.EQEventCarousel) window.EQEventCarousel.render(d.carousel || []);   // v1.17.0 Event Carousel (กิจกรรมจริง)
    if (window.EQStreak) window.EQStreak.refresh();   // v1.18.0 Learning Streak (ซิงก์จากคำตอบจริงฝั่งเซิร์ฟเวอร์)
  }
  function open() {
    if (!$('home-lobby')) return;
    // v1.26.0 แอนิเมชันเปิดการ์ด (ครั้งแรกที่เข้าหน้าแรกในรอบนี้เท่านั้น — ไม่เล่นซ้ำทุกครั้งที่สลับหน้า)
    if (!st.intro) { st.intro = true; const h = $('home-lobby'); h.classList.add('hl-intro'); setTimeout(() => h.classList.remove('hl-intro'), 1600); }
    mountAvatar();
    refresh();
    if (window.EQWorldChat) window.EQWorldChat.mountMini();   // v1.17.0 แชทโลกย่อบน Lobby
  }

  window.EQLobby = { open, refresh, _state: () => st };
}());
