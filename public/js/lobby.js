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

  /* ---------------- เควสต์ประจำวัน (ความคืบหน้าจริงของวันนี้ · ไม่มีรางวัลแอบอ้าง) ---------------- */
  function renderQuests(qs) {
    const done = qs.filter((q) => q.done).length;
    $('hl-q-count').textContent = `${done}/${qs.length}`;
    $('hl-quests').innerHTML = qs.map((q) => {
      const pct = Math.round((Math.min(q.progress, q.goal) / Math.max(1, q.goal)) * 100);
      return `<li><button class="hl-quest${q.done ? ' is-done' : ''}" type="button" data-nav-to="${esc(q.nav)}" data-hl-quest="${esc(q.id)}">
        <span class="hl-quest-ico">${ICON(q.done ? 'circle-check' : (Q_ICON[q.id] || 'target'))}</span>
        <span class="hl-quest-text"><b>${esc(q.title)}</b><span class="hl-quest-bar" role="progressbar" aria-label="${esc(q.title)}" aria-valuemin="0" aria-valuemax="${q.goal}" aria-valuenow="${q.progress}"><span style="width:${pct}%"></span></span></span>
        <span class="hl-quest-num">${q.done ? 'สำเร็จ' : `${fmt(q.progress)}/${fmt(q.goal)}`}</span></button></li>`;
    }).join('') + '<li><p class="hl-note">นับจากกิจกรรมจริงของวันนี้ (เวลาไทย) · รีเซ็ตเที่ยงคืน</p></li>';
  }

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
    renderQuests(d.quests || []);
    renderFriends(d.friends || { total: 0, online: 0 });
    if (window.EQEventCarousel) window.EQEventCarousel.render(d.carousel || []);   // v1.17.0 Event Carousel (กิจกรรมจริง)
    if (window.EQStreak) window.EQStreak.refresh();   // v1.18.0 Learning Streak (ซิงก์จากคำตอบจริงฝั่งเซิร์ฟเวอร์)
  }
  function open() {
    if (!$('home-lobby')) return;
    mountAvatar();
    refresh();
    if (window.EQWorldChat) window.EQWorldChat.mountMini();   // v1.17.0 แชทโลกย่อบน Lobby
  }

  window.EQLobby = { open, refresh, _state: () => st };
}());
