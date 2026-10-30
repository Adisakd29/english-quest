/* =====================================================================
   เทศกาล (Festival) — ปฏิทินรางวัลล็อกอิน 7 วัน + เควสต์การเรียน
   ใช้ได้หลายเทศกาล (SKINS): Halloween Costume Festival 2026 · Loy Krathong Festival 2026 (v1.10.0)
   เปิด #/festival = เทศกาลที่กำลังจัด (ไม่มี = ที่จะเริ่มเร็วที่สุด · ไม่งั้นที่จบล่าสุด) · #/festival/<id> = ระบุเอง
   - ใช้ระบบกิจกรรมเดิม (/api/events/:id) · วัน/สิทธิ์/การรับซ้ำ ตัดสินที่เซิร์ฟเวอร์ทั้งหมด (เวลาไทย)
   - ภาพประกอบ SVG ล้วน (EQHalloweenArt: ฟักทอง ค้างคาว พระจันทร์ ดาว ผีน้อย) · ไม่ใช้อีโมจิ
   - Preview ชุดบนตัวละครจริง (3D เมื่อรองรับ / 2D) ผ่าน EQAvatar.previewItems · ไม่บันทึกจนกว่าจะกด "สวมเลย"
   ===================================================================== */
(function () {
  let ID = 'halloween-costume-2026';   // เทศกาลที่เปิดอยู่ (เลือกใน pickFestival)
  const App = () => window.EQApp;
  const NO_ART = new Proxy({}, { get: () => () => '' });   // กันกรณีภาพยังไม่พร้อม → SVG ว่างแทนการ throw
  const A = () => window.EQHalloweenArt || NO_ART;
  const AV = () => window.EQAvatar;
  const esc = (s) => App().escapeHtml(String(s == null ? '' : s));
  const ICON = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { st: null, list: null, stage: null };
  const STATUS = {
    claimed: ['รับแล้ว', 'circle-check'], available: ['รับได้วันนี้', 'gift'], tomorrow: ['รับได้พรุ่งนี้', 'clock'],
    upcoming: ['ยังไม่ถึง', 'lock'], expired: ['หมดเวลา', 'hourglass'],
  };
  const THEME_TH = { 'loykrathong-2026': 'ลอยกระทง 2569', 'halloween-2026': 'ฮาโลวีน 2026', astronomy: 'ดาราศาสตร์' };
  const themeName = (id) => THEME_TH[id] || id;
  const fmtTime = (iso) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const name = (id) => { const it = AV() && AV().itemInfo(id); return it ? (it.nameTh || it.name) : id; };
  const thumb = (id, cls = 'hf-thumb') => {
    const u = AV() && AV().itemThumb(id);
    return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async" width="96" height="96">` : `<span class="${cls} hf-thumb-ph">${ICON('shirt')}</span>`;
  };

  /* ---------- ภาพประกอบ ---------- */
  function heroArtHalloween() {
    const a = A();
    return `<svg class="hf-hero-art" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>${a.defs()}<linearGradient id="hfSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B1644"/><stop offset=".55" stop-color="#3B2466"/><stop offset="1" stop-color="#6B3FB8"/></linearGradient>
        <radialGradient id="hfGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient></defs>
      <rect width="400" height="220" fill="url(#hfSky)"/>
      <g class="hf-stars">${a.stars(26, 46, 400, 150)}</g>
      <circle cx="318" cy="56" r="70" fill="url(#hfGlow)"/>${a.moon(318, 56, 30)}
      ${a.bat(70, 46, 0.9, 'hf-bat')}${a.bat(126, 30, 0.6, 'hf-bat hf-bat2')}${a.bat(250, 70, 0.7, 'hf-bat hf-bat3')}
      <path d="M0 172 Q80 150 170 166 Q260 182 400 156 V220 H0z" fill="#2A1A4A"/><path d="M0 196 Q120 178 230 192 Q320 202 400 186 V220 H0z" fill="#1D1236"/>
      ${a.pumpkin(52, 182, 0.9)}${a.pumpkin(110, 196, 0.6, { glow: false })}${a.pumpkin(356, 186, 0.75)}
      ${a.ghost(278, 136, 0.95, 'hw-float')}${a.sparkle(204, 40, 1, '#FFB3C7', 'hw-tw')}${a.sparkle(168, 92, 0.8, '#FFD166', 'hw-tw hw-tw2')}
    </svg>`;
  }
  /* ลอยกระทง: กระทงใบตอง (กลีบซ้อน) + เทียน + ดอกดาวเรือง — วาดด้วย path (ไม่ใช่อีโมจิ) */
  function krathong(x, y, s = 1, cls = '') {
    const petals = [-3, -2, -1, 0, 1, 2, 3].map((i) => `<path d="M${i * 7} 0 Q${i * 7 - 5} -10 ${i * 6} -17 Q${i * 7 + 5} -10 ${i * 7} 0Z" fill="${i % 2 ? '#3E9B57' : '#58B86B'}" stroke="#1F5A33" stroke-width=".9"/>`).join('');
    return `<g class="lk-kt ${cls}" transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="6" rx="34" ry="5" fill="#FFD27A" opacity=".18"/>
      <path d="M-27 0 Q0 13 27 0 L22 7 Q0 15 -22 7Z" fill="#2F7D46" stroke="#1F5A33" stroke-width="1"/>
      ${petals}
      <circle cx="0" cy="-12" r="6.5" fill="#FFB020" stroke="#B86E00" stroke-width="1"/><circle cx="-4" cy="-14" r="2" fill="#FFD27A"/>
      <rect x="-1.6" y="-30" width="3.2" height="14" rx="1" fill="#FFF4D6" stroke="#C9A25A" stroke-width=".6"/>
      <path class="lk-flame" d="M0 -40 Q4 -34 0 -30 Q-4 -34 0 -40Z" fill="#FFD27A"/><circle cx="0" cy="-34" r="7" fill="#FFD27A" opacity=".25"/>
      <path d="M-10 -20 L-12 -32 M10 -20 L12 -31" stroke="#8B5A2B" stroke-width="1.2"/>
    </g>`;
  }
  function heroArtLoyKrathong() {
    const stars = [[30, 30], [72, 58], [120, 22], [160, 70], [212, 34], [250, 16], [380, 30], [366, 92], [104, 96], [16, 92]]
      .map(([x, y], i) => `<circle class="lk-tw${i % 2 ? ' lk-tw2' : ''}" cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.5}" fill="#F4F0FF"/>`).join('');
    const ripples = [[60, 176], [190, 192], [300, 172], [340, 204]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="30" ry="3" fill="none" stroke="#9FB4FF" stroke-opacity=".35"/>`).join('');
    return `<svg class="hf-hero-art lk-hero-art" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="lkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1238"/><stop offset=".6" stop-color="#1C2A6E"/><stop offset="1" stop-color="#2E3F8F"/></linearGradient>
        <linearGradient id="lkRiver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2A66"/><stop offset="1" stop-color="#0A1236"/></linearGradient>
        <radialGradient id="lkMoon" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".7" stop-color="#FFE7A6"/><stop offset="1" stop-color="#F2CF7A"/></radialGradient>
        <radialGradient id="lkGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".5"/><stop offset="1" stop-color="#FFE7A6" stop-opacity="0"/></radialGradient>
        <linearGradient id="lkPath" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7A6" stop-opacity="0"/></linearGradient></defs>
      <rect width="400" height="220" fill="url(#lkSky)"/>${stars}
      <circle cx="300" cy="62" r="78" fill="url(#lkGlow)"/><circle cx="300" cy="62" r="34" fill="url(#lkMoon)"/>
      <circle cx="288" cy="54" r="6" fill="#EBC979" opacity=".35"/><circle cx="312" cy="72" r="4" fill="#EBC979" opacity=".3"/>
      <path d="M0 132 Q60 118 120 128 Q190 140 250 126 Q320 112 400 128 V146 H0z" fill="#121B4D"/>
      <path d="M0 140 Q50 128 96 136 L110 128 L124 138 Q170 132 210 140 Q260 130 300 138 L314 130 L328 140 Q370 134 400 140 V150 H0z" fill="#0D1440"/>
      <rect y="146" width="400" height="74" fill="url(#lkRiver)"/>
      <path d="M268 146 Q300 200 332 146Z" fill="url(#lkPath)"/>${ripples}
      ${krathong(78, 172, 1.05, 'lk-bob')}${krathong(196, 190, 0.8, 'lk-bob lk-bob2')}${krathong(330, 184, 0.95, 'lk-bob lk-bob3')}${krathong(140, 160, 0.55, 'lk-bob lk-bob2')}
    </svg>`;
  }
  function miniLoyKrathong() {
    return `<svg class="ev-mini" viewBox="0 0 96 64" aria-hidden="true"><rect width="96" height="64" fill="#13205A"/><circle cx="72" cy="17" r="10" fill="#FFE7A6"/>
      <rect y="40" width="96" height="24" fill="#0B1338"/><ellipse cx="34" cy="50" rx="16" ry="2" fill="none" stroke="#9FB4FF" stroke-opacity=".4"/>${krathong(34, 50, 0.5)}</svg>`;
  }
  function miniHalloween() {
    const a = A();
    return `<svg class="ev-mini" viewBox="0 0 96 64" aria-hidden="true"><rect width="96" height="64" fill="#3B2466"/><circle cx="74" cy="16" r="9" fill="#FFE9A8"/>
      <path d="M0 50 Q30 40 60 46 T96 44 V64 H0z" fill="#1D1236"/>${a.pumpkin(26, 46, 0.5, { glow: false })}${a.bat(60, 22, 0.55)}</svg>`;
  }
  /* ข้อความ/ภาพตามเทศกาล */
  const SKINS = {
    'halloween-costume-2026': { cls: 'hf-skin-hw', title: 'Halloween Costume Festival 2026', dates: '24–31 ต.ค. 2569', hero: heroArtHalloween, mini: miniHalloween,
      sub: 'เข้าแอปแล้วรับชุดฮาโลวีน 3D วันละชิ้น · ทำเควสต์การเรียนรับของเพิ่ม', bannerTitle: 'Halloween Costume Festival', bannerSub: 'รับชุดฮาโลวีน 3D วันละชิ้น', world: true, rays: ['#FF8A3D', '#B388FF'] },
    'loykrathong-2026': { cls: 'hf-skin-lk', title: 'Loy Krathong Festival 2026', dates: '18–25 พ.ย. 2569 · วันลอยกระทง อ. 24 พ.ย.', hero: heroArtLoyKrathong, mini: miniLoyKrathong,
      sub: 'เข้าแอปรับชุดไทย 3D วันละชิ้น · อ่านและฟังเรื่องลอยกระทง ปลดล็อกธีมคืนเพ็ญ', bannerTitle: 'เทศกาลลอยกระทง 2569', bannerSub: 'รับชุดไทย 3D วันละชิ้น', world: false, rays: ['#FFD27A', '#7FA8FF'],
      note: 'ลอยกระทงอย่างรักษ์สายน้ำ — เลือกกระทงจากใบตองหรือขนมปัง ไม่ใช้โฟม · ระวังความปลอดภัยริมน้ำ' },
  };
  const SK = () => SKINS[ID] || SKINS['halloween-costume-2026'];
  function heroArt() { return SK().hero(); }
  function burst() {
    const a = A();
    return `<svg class="hf-burst" viewBox="-100 -70 200 140" aria-hidden="true">
      ${[...Array(12)].map((_, i) => `<path d="M0 0 L${Math.cos(i * Math.PI / 6) * 90} ${Math.sin(i * Math.PI / 6) * 60}" stroke="${i % 2 ? SK().rays[0] : SK().rays[1]}" stroke-width="3" stroke-linecap="round" class="hf-ray" style="--i:${i}"/>`).join('')}
      ${a.sparkle(-62, -38, 1.3, '#FFD166', 'hw-tw')}${a.sparkle(64, -30, 1.1, '#FFB3C7', 'hw-tw hw-tw2')}${a.sparkle(54, 42, 0.9, '#FFE9A8', 'hw-tw')}${ID === 'loykrathong-2026' ? krathong(-58, 48, 0.6) : a.bat(-58, 40, 0.8, 'hf-bat')}
    </svg>`;
  }

  /* ---------- หน้าเทศกาล ---------- */
  function questHtml(q, st) {
    const pct = Math.round((q.progress / q.target) * 100);
    const rw = [q.reward.coins ? `<span class="hf-rw">${ICON('coins', 'icon icon-xs')} ${q.reward.coins} Coins</span>` : '',
      ...(q.reward.items || []).map((id) => `<span class="hf-rw hf-rw-item">${thumb(id, 'hf-rw-thumb')}${esc(name(id))}</span>`),
      q.reward.theme ? `<span class="hf-rw hf-rw-theme">${ICON('palette', 'icon icon-xs')} ธีมแอป ${esc(themeName(q.reward.theme))}</span>` : '',
      q.reward.badge ? `<span class="hf-rw">${ICON('award', 'icon icon-xs')} ป้าย Achievement</span>` : ''].join('');
    let action = '';
    if (q.claimed) action = `<span class="hf-done">${ICON('circle-check', 'icon icon-sm')} รับรางวัลแล้ว</span>`;
    else if (q.canClaim) action = `<button class="btn btn-primary hf-claim-q" type="button" data-hf-qclaim="${esc(q.id)}">${ICON('gift', 'icon icon-sm')} รับรางวัล</button>`;
    else if (st.status !== 'active') action = '<span class="hf-muted">กิจกรรมจบแล้ว</span>';
    else if (q.kind === 'stage') action = `<button class="btn btn-secondary" type="button" data-hf-stage="${esc(q.stage.id)}">${ICON('play', 'icon icon-sm')} เริ่มด่าน · ${q.stage.questions} ข้อ</button>`;
    else if (q.kind === 'graded') action = `<button class="btn btn-secondary" type="button" data-hf-graded="${esc(q.graded.text)}" data-mode="${esc(q.graded.mode)}">${ICON(q.graded.mode === 'listening' ? 'headphones' : 'book-open', 'icon icon-sm')} ${q.graded.mode === 'listening' ? 'เริ่มฟังเรื่อง' : 'เริ่มอ่านเรื่อง'}</button>`;
    else if (q.kind === 'toeic') action = `<button class="btn btn-secondary" type="button" data-nav-to="toeic-p1">${ICON('headphones', 'icon icon-sm')} ไปฝึก TOEIC Part 1</button>`;
    else action = '<span class="hf-muted">ทำเควสต์อื่นให้ครบก่อน</span>';
    return `<li class="hf-quest ${q.claimed ? 'is-claimed' : q.done ? 'is-done' : ''}">
      <div class="hf-q-icon">${ICON(q.icon || 'star')}</div>
      <div class="hf-q-body"><h3 lang="en">${esc(q.title)}</h3><p class="hf-q-th">${esc(q.titleTh)}</p><p class="hf-q-desc">${esc(q.desc)}</p>
        ${q.stage && q.stage.rule ? `<p class="hf-q-rule">${ICON('target', 'icon icon-xs')} ${esc(q.stage.rule)}</p>` : ''}
        <div class="hf-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${q.progress}" aria-label="ความคืบหน้า ${esc(q.titleTh)}"><span style="transform:scaleX(${pct / 100})"></span></div>
        <p class="hf-q-count">${q.progress}/${q.target}</p>
        <div class="hf-rws">${rw}</div>
        <div class="hf-q-act">${action}</div></div></li>`;
  }

  function dayHtml(d) {
    const [label, icon] = STATUS[d.status] || STATUS.upcoming;
    const set = d.items.length > 1;
    return `<li class="hf-day st-${d.status} ${set ? 'is-set' : ''}">
      <p class="hf-day-no">วันที่ ${d.day}</p>
      <div class="hf-day-pics">${d.items.map((id) => thumb(id)).join('')}</div>
      <p class="hf-day-name" lang="en">${esc(d.title)}</p><p class="hf-day-th">${esc(d.titleTh)}</p>
      <span class="hf-chip">${ICON(icon, 'icon icon-xs')} ${label}</span>
      <button class="btn btn-secondary btn-sm hf-prev" type="button" data-hf-preview="${d.day}" aria-label="ดูตัวอย่าง วันที่ ${d.day} ${esc(d.titleTh)}">${ICON('eye', 'icon icon-xs')} ดูตัวอย่าง</button>
    </li>`;
  }

  function render(st) {
    const root = document.getElementById('hf-root');
    if (!root) return;
    root.className = SK().cls;
    const L = st.login;
    const next = L.days.find((d) => d.status === 'available' || d.status === 'tomorrow');
    let today;
    if (st.status === 'ended') today = `<p class="hf-today-msg">${ICON('hourglass', 'icon icon-sm')} กิจกรรมจบแล้ว — ของที่ได้รับทั้งหมดยังอยู่ในตู้เสื้อผ้าของคุณ</p>`;
    else if (st.status === 'upcoming') today = `<p class="hf-today-msg">${ICON('calendar', 'icon icon-sm')} เริ่ม ${esc(fmtTime(st.startsAt))}</p>`;
    else if (L.canClaim && next) {
      today = `<div class="hf-today-pics">${next.items.map((id) => thumb(id, 'hf-today-thumb')).join('')}</div>
        <div class="hf-today-text"><p class="hf-kicker">รางวัลวันนี้ · วันที่ ${next.day}</p><h2 lang="en">${esc(next.title)}</h2><p>${esc(next.titleTh)}</p>
        <button class="btn btn-primary hf-claim" type="button" data-hf-claim>${ICON('gift', 'icon icon-sm')} รับรางวัลวันนี้</button></div>`;
    } else if (L.claimedDays >= L.total) today = `<p class="hf-today-msg">${ICON('crown', 'icon icon-sm')} รับรางวัลครบทั้ง 7 วันแล้ว — สุดยอด!</p>`;
    else {
      today = `<div class="hf-today-pics">${next ? next.items.map((id) => thumb(id, 'hf-today-thumb')).join('') : ''}</div>
        <div class="hf-today-text"><p class="hf-kicker">รับรางวัลของวันนี้แล้ว</p><h2>รางวัลถัดไป: ${esc(next ? next.titleTh : '')}</h2>
        <p>${L.nextClaimAt ? `รับได้ตั้งแต่ ${esc(fmtTime(L.nextClaimAt))} (เวลาไทย)` : ''}</p></div>`;
    }
    root.innerHTML = `
      <header class="hf-hero">${heroArt()}
        <div class="hf-hero-text">
          <p class="hf-kicker">${ICON('sparkles', 'icon icon-xs')} กิจกรรมพิเศษ · ${esc(SK().dates)}</p>
          <h1 id="hf-title" lang="en">${esc(SK().title)}</h1>
          <p class="hf-sub">${esc(st.nameTh)} — ${esc(SK().sub)}</p>
          <div class="hf-meta"><span class="hf-pill">${ICON('clock', 'icon icon-xs')} ${st.status === 'active' ? `เหลือ ${st.daysLeft} วัน` : st.status === 'ended' ? 'จบแล้ว' : 'เร็ว ๆ นี้'} · หมดเขต ${esc(st.endsLabel)}</span>
            <span class="hf-pill hf-pill-strong">${ICON('gift', 'icon icon-xs')} รับแล้ว ${L.claimedDays}/${L.total} วัน</span></div>
        </div>
      </header>
      <section class="hf-today" aria-label="รางวัลวันนี้">${today}</section>
      ${SK().note ? `<p class="hf-eco">${ICON('leaf', 'icon icon-sm')} ${esc(SK().note)}</p>` : ''}
      ${SK().world ? `<button class="wd-entry hf-world" type="button" data-nav-to="world"><span class="wd-entry-art" aria-hidden="true"></span><span class="wd-entry-text"><span class="wd-entry-kicker">ไม่บังคับ · รับรางวัลที่นี่ได้เหมือนกัน</span><span class="wd-entry-title">ไป Event Plaza ใน EnglishQuest World</span><span class="wd-entry-sub">เดินชมลานฮาโลวีนกับผู้เล่นคนอื่น ลองชุดหน้ากระจก แล้วรับรางวัลที่แท่นฟักทอง</span></span></button>` : ''}
      <section class="hf-sec" aria-labelledby="hf-cal-title">
        <h2 class="hf-h2" id="hf-cal-title">${ICON('calendar', 'icon icon-sm')} ปฏิทินรางวัล 7 วัน</h2>
        <p class="hf-note">นับ "วันที่รับสำเร็จ" ไม่ต้องติดต่อกัน — ขาดวันไหนก็กลับมารับต่อได้ (ช่วงกิจกรรม 8 วัน มีรางวัล 7 วัน) · วันใหม่เริ่มเที่ยงคืนเวลาไทย</p>
        <ol class="hf-cal">${L.days.map(dayHtml).join('')}</ol>
      </section>
      <section class="hf-sec" aria-labelledby="hf-q-title">
        <h2 class="hf-h2" id="hf-q-title">${ICON('book-open', 'icon icon-sm')} ภารกิจการเรียนในเทศกาล</h2>
        <p class="hf-note">ด่านใช้ระดับภาษาจากผลวัดระดับของคุณ · แต่ละเควสต์ใช้เวลาราว 4–6 นาที</p>
        <ol class="hf-quests">${st.quests.map((q) => questHtml(q, st)).join('')}</ol>
      </section>
      <p class="hf-foot">${ICON('shield-check', 'icon icon-xs')} ชุดทุกชิ้นเป็นโมเดล 3D สวมได้จริงและเป็นของถาวร — อยู่ในตู้เสื้อผ้าต่อหลังกิจกรรมจบ · ไม่มีผลต่อ EXP / Rank / คะแนน
        <button class="link-btn" type="button" data-nav-to="wardrobe">เปิดตู้เสื้อผ้า</button></p>`;
  }

  /* ---------- โหลด / เปิด ---------- */
  /** เลือกเทศกาล: ระบุใน hash > กำลังจัด > จะเริ่มเร็วที่สุด > จบล่าสุด */
  async function pickFestival(want) {
    let list = [];
    try { list = (await App().api('/events')).events.filter((x) => x.kind === 'festival'); } catch (_) { return; }
    if (want && list.some((x) => x.id === want)) { ID = want; return; }
    const act = list.find((x) => x.status === 'active');
    const up = list.filter((x) => x.status === 'upcoming').sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
    const past = list.filter((x) => x.status === 'ended').sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt))[0];
    const pick = act || up || past;
    if (pick) ID = pick.id;
  }
  async function load() {
    await AV().loadCatalog().catch(() => {});
    S.st = await App().api(`/events/${ID}`);
    return S.st;
  }
  async function open(want) {
    const h = window.location.hash.match(/^#\/festival\/([a-z0-9-]+)/);
    const prev = ID;
    await pickFestival(want || (h && h[1]));
    if (prev !== ID) S.st = null;
    App().showScreen('screen-festival');
    const root = document.getElementById('hf-root');
    if (root && !S.st) root.innerHTML = '<div class="hf-loading"><span class="spinner" aria-hidden="true"></span> กำลังโหลดกิจกรรม…</div>';
    try { render(await load()); const h = document.getElementById('hf-title'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } catch (err) {
      if (root) root.innerHTML = `<div class="hf-error"><p>${esc(err.message || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-hf-reload>ลองใหม่</button></div>`;
    }
  }
  async function reload() { try { render(await load()); } catch (_) { /* - */ } refresh(); }

  /* ---------- Preview (ตัวละครของฉันลองสวม · ไม่บันทึก) ---------- */
  function previewModal(title, itemIds, { owned = false, subtitle = '', reward = false } = {}) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay hf-modal';
    ov.innerHTML = `<div class="modal-card hf-dialog ${SK().cls} ${reward ? 'is-reward' : ''}">
      ${reward ? burst() : ''}
      <p class="hf-kicker">${esc(subtitle)}</p><h2 class="hf-dialog-title">${esc(title)}</h2>
      <div class="hf-stage" data-hf-stage-box></div>
      <ul class="hf-dialog-items">${itemIds.map((id) => `<li>${thumb(id, 'hf-rw-thumb')}<span>${esc(name(id))}</span></li>`).join('')}</ul>
      <p class="hf-note" data-hf-notes></p>
      <div class="hf-dialog-act">
        ${owned ? `<button class="btn btn-primary" type="button" data-hf-equip>${ICON('shirt', 'icon icon-sm')} สวมเลย</button><button class="btn btn-secondary" type="button" data-nav-to="wardrobe">${ICON('backpack', 'icon icon-sm')} เปิดตู้เสื้อผ้า</button>`
    : '<p class="hf-muted">ตัวอย่างเท่านั้น — ได้รับเมื่อถึงวันของรางวัลนี้</p>'}
      </div></div>`;
    document.body.appendChild(ov);
    App().makeDialog(ov, { label: title, onClose: () => { if (S.stage) { S.stage.dispose(); S.stage = null; } } });
    const box = ov.querySelector('[data-hf-stage-box]');
    AV().previewItems(box, itemIds, { label: `ตัวอย่าง ${title}`, controls: true, anim: reward ? 'celebrate' : undefined }).then((st) => {
      S.stage = st;
      if (st.notes && st.notes.length) ov.querySelector('[data-hf-notes]').textContent = `ตอนสวมจริง: ${st.notes.join(' · ')}`;
    }).catch(() => { box.innerHTML = `<div class="hf-dialog-items">${itemIds.map((id) => thumb(id, 'hf-today-thumb')).join('')}</div>`; });
    const eq = ov.querySelector('[data-hf-equip]');
    if (eq) {
      eq.addEventListener('click', async () => {
        eq.disabled = true;
        try { await AV().equipItems(itemIds); App().toast('สวมชุดแล้ว — บันทึกในตัวละครของคุณ', 'success'); ov.remove(); App().renderHud && App().renderHud(); } catch (err) { eq.disabled = false; App().toast(err.message, 'error'); }
      });
      setTimeout(() => eq.focus({ preventScroll: true }), 50);
    }
    ov.querySelectorAll('[data-nav-to]').forEach((b) => b.addEventListener('click', () => ov.remove()));
    return ov;
  }

  /* ---------- การกด ---------- */
  async function claimToday(btn) {
    btn.disabled = true;
    try {
      const r = await App().api(`/events/${ID}/login-claim`, { method: 'POST' });
      S.st = r.state; render(r.state);
      if (window.EQAudio) { window.EQAudio.sfx('promotion'); setTimeout(() => window.EQAudio.sfx('badge_unlock'), 600); }
      previewModal(r.titleTh, r.items, { owned: true, subtitle: `ได้รับรางวัลวันที่ ${r.day} แล้ว!`, reward: true });
    } catch (err) {
      App().toast(err.message, err.code === 'ALREADY_CLAIMED_TODAY' ? 'info' : 'error');
      btn.disabled = false; reload();
    }
  }
  async function claimQuest(qid, btn) {
    btn.disabled = true;
    try {
      const r = await App().api(`/events/${ID}/quests/${encodeURIComponent(qid)}/claim`, { method: 'POST' });
      S.st = r.state; render(r.state);
      if (window.EQAudio) window.EQAudio.sfx('badge_unlock');
      const parts = [r.coins ? `+${r.coins} Coins` : '', r.badge ? 'ป้าย Achievement' : '', r.theme ? `ปลดล็อกธีม ${themeName(r.theme)} (เปลี่ยนได้ที่ โปรไฟล์ → ตั้งค่า → การแสดงผล)` : ''].filter(Boolean).join(' · ');
      if (r.theme && App().syncThemes) App().syncThemes();
      if (r.items && r.items.length) previewModal(r.items.map(name).join(' + '), r.items, { owned: true, subtitle: `รางวัลเควสต์${parts ? ` · ${parts}` : ''}`, reward: true });
      else App().toast(`รับรางวัลแล้ว ${parts}`, 'success');
      if (AV().checkCoins) AV().checkCoins();
    } catch (err) { App().toast(err.message, 'error'); btn.disabled = false; reload(); }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    const c = e.target.closest('[data-hf-claim]');
    if (c) { claimToday(c); return; }
    const q = e.target.closest('[data-hf-qclaim]');
    if (q) { claimQuest(q.dataset.hfQclaim, q); return; }
    const sb = e.target.closest('[data-hf-stage]');
    if (sb && window.EQEvent && window.EQEvent.startStage) { window.EQEvent.startStage(sb.dataset.hfStage, sb, { eventId: ID, onDone: reload }); return; }
    const pv = e.target.closest('[data-hf-preview]');
    if (pv && S.st) {
      const d = S.st.login.days.find((x) => String(x.day) === pv.dataset.hfPreview);
      if (d) previewModal(d.titleTh, d.items, { owned: d.status === 'claimed', subtitle: `วันที่ ${d.day} · ${(STATUS[d.status] || STATUS.upcoming)[0]}` });
      return;
    }
    const gb = e.target.closest('[data-hf-graded]');
    if (gb) { window.location.hash = `#/graded/${encodeURIComponent(gb.dataset.hfGraded)}/${gb.dataset.mode === 'listening' ? 'listening' : 'reading'}`; return; }
    if (e.target.closest('[data-hf-reload]')) open();
  });
  const back = document.getElementById('hf-back');
  if (back) back.addEventListener('click', () => { if (history.length > 1) history.back(); else App().navigateTo('home'); });

  /* ---------- จุดเข้า: แบนเนอร์หน้าแรก + เมนูเล่น ---------- */
  async function refresh() {
    let list;
    try { list = (await App().api('/events')).events; } catch (_) { return; }
    const ev = list.find((x) => x.kind === 'festival' && x.status === 'active');
    const anchor = document.getElementById('event-banner');
    let banner = document.getElementById('festival-banner');
    if (!banner && anchor) {
      banner = document.createElement('button');
      banner.id = 'festival-banner'; banner.type = 'button'; banner.className = 'ev-banner hf-banner hidden'; banner.dataset.navTo = 'festival';
      anchor.insertAdjacentElement('afterend', banner);
    }
    const slot = document.getElementById('play-festival-slot');
    if (!ev) { if (banner) banner.classList.add('hidden'); if (slot) slot.innerHTML = ''; return; }
    const sk = SKINS[ev.id] || SKINS['halloween-costume-2026'];
    const days = Math.max(1, Math.ceil((new Date(ev.endsAt).getTime() - new Date(ev.serverNow).getTime()) / 86400000));
    const text = `<span class="ev-banner-text"><b>${esc(sk.bannerTitle)}</b><span>${esc(sk.bannerSub)} · เหลือ ${days} วัน</span></span>${ICON('chevron-right')}`;
    const cls = `ev-banner hf-banner ${sk.cls}`;
    if (banner) { banner.className = cls; banner.innerHTML = sk.mini() + text; banner.classList.remove('hidden'); }
    if (slot) slot.innerHTML = `<button class="${cls} ev-banner-play" type="button" data-nav-to="festival">${sk.mini()}${text}</button>`;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App() && App().user) refresh(); });

  window.EQFestival = { open, refresh, _state: () => S.st };
  if (App() && App().user) refresh();
})();
