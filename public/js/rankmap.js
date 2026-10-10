/*
  "เส้นทางสู่แรงค์สูงสุด" — แผนที่ผจญภัยของแรงค์สัตว์ 9 ระดับ (SVG วาดสด คมชัดทุกขนาดจอ)
    - ข้อมูลจริงทั้งหมดมาจากเซิร์ฟเวอร์ (/api/ranked/config + /api/ranked/me) — หน้านี้ "แสดงผล" เท่านั้น
      กดดูแรงค์ที่ล็อก/แก้ข้อมูลในหน้าเว็บ ไม่มีผลกับแรงค์หรือแต้มจริง (เซิร์ฟเวอร์ตัดสินทุกอย่าง)
    - ดินแดนเรียงจากล่างขึ้นบน (ไต่ขึ้นไปหายอดเขาแสงเหนือ) · เส้นทางคดเคี้ยวเชื่อมทุกแรงค์
      แต่ละดินแดน: ตราแรงค์ · Checkpoint ตาม Division · จุดบอสเลื่อนแรงค์ (Guardian) ก่อนเข้าแรงค์ถัดไป
    - สถานะ: ผ่านแล้ว / กำลังแข่งขัน / พร้อมเลื่อนแรงค์ / ยังไม่ปลดล็อก
    - ไม่มีอิโมจิ: ตรา = ภาพ WebP เดิม · บอส = SVG Guardian เดิม · ตัวผู้เล่น = อวตารของบัญชี
*/
(() => {
  'use strict';
  const G = window.EQG;
  const esc = G.esc;
  const ic = G.icon;
  const NS = 'http://www.w3.org/2000/svg';

  const W = 400;            // ความกว้าง viewBox (สูงตามจำนวนดินแดน)
  const BAND = 440;         // ความสูงต่อดินแดน
  const TOP_PAD = 170;      // ท้องฟ้าเหนือยอดเขา
  const BOTTOM_PAD = 130;   // ค่ายเริ่มต้น
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- สุ่มแบบกำหนด seed (ภาพเดิมทุกครั้ง) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  /* ---------- สีพื้นของแต่ละดินแดน (ไล่จากกลางวัน -> กลางคืน -> เหนือเมฆ -> แสงเหนือ ให้เป็นโลกเดียวกัน) ---------- */
  const SKY = {
    meadow: ['#E6F6DC', '#D4EFC6'], grassland: ['#DDF1C9', '#C8E8B0'], river: ['#CFEFE8', '#B5E3E3'],
    mountain: ['#D9D3F2', '#BDB4E6'], moonforest: ['#46518F', '#36407A'], shadow: ['#2E2552', '#241D44'],
    storm: ['#24485A', '#1C3A4B'], citadel: ['#F6DFA8', '#F0CF86'], aurora: ['#1C2347', '#161C3A'],
  };
  const DARK = new Set(['moonforest', 'shadow', 'storm', 'aurora']);

  /* ---------- ฉากของแต่ละดินแดน (y0 = ขอบบน, y1 = ขอบล่าง) ---------- */
  const edgeX = (r) => (r() < 0.5 ? 8 + r() * 78 : 314 + r() * 78);       // ของตกแต่งอยู่ริมแผนที่ ไม่บังเส้นทาง
  const hills = (y1, h, fill, seed, n = 3) => {
    const r = rng(seed); let d = `M0 ${y1} L0 ${y1 - h * 0.5}`;
    const step = W / n;
    for (let i = 0; i < n; i += 1) {
      const x0 = i * step; const peak = y1 - h * (0.6 + r() * 0.5);
      d += ` Q${f1(x0 + step / 2)} ${f1(peak - h * 0.3)} ${f1(x0 + step)} ${f1(y1 - h * (0.35 + r() * 0.3))}`;
    }
    return `<path d="${d} L${W} ${y1} Z" fill="${fill}"/>`;
  };
  const tree = (x, y, s, c1, c2) => `<g><rect x="${f1(x - 2.5 * s)}" y="${f1(y - 10 * s)}" width="${f1(5 * s)}" height="${f1(12 * s)}" rx="2" fill="#8A5A36"/>
    <circle cx="${f1(x)}" cy="${f1(y - 18 * s)}" r="${f1(13 * s)}" fill="${c1}"/><circle cx="${f1(x - 6 * s)}" cy="${f1(y - 22 * s)}" r="${f1(7 * s)}" fill="${c2}" opacity=".8"/></g>`;
  const pine = (x, y, s, c) => `<path d="M${f1(x)} ${f1(y - 46 * s)} L${f1(x - 15 * s)} ${f1(y - 16 * s)} L${f1(x - 7 * s)} ${f1(y - 16 * s)} L${f1(x - 19 * s)} ${f1(y)} L${f1(x + 19 * s)} ${f1(y)} L${f1(x + 7 * s)} ${f1(y - 16 * s)} L${f1(x + 15 * s)} ${f1(y - 16 * s)} Z" fill="${c}"/>`;
  const cloud = (x, y, s, c, o = 1) => `<g fill="${c}" opacity="${o}"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(30 * s)}" ry="${f1(12 * s)}"/>
    <circle cx="${f1(x - 12 * s)}" cy="${f1(y - 6 * s)}" r="${f1(12 * s)}"/><circle cx="${f1(x + 8 * s)}" cy="${f1(y - 10 * s)}" r="${f1(15 * s)}"/></g>`;
  /* ดาว: แบ่งเป็น 3 กลุ่ม แต่ละกลุ่มกะพริบพร้อมกัน (animation 3 ตัวแทนดาวละตัว — เบาเครื่องมาก) */
  const stars = (y0, y1, n, seed) => {
    const r = rng(seed); const groups = ['', '', ''];
    for (let i = 0; i < n; i += 1) {
      const x = r() * W; const y = y0 + r() * (y1 - y0); const s = 0.6 + r() * 1.4;
      groups[i % 3] += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s)}" opacity="${f1(0.45 + r() * 0.55)}"/>`;
    }
    return groups.map((g, i) => `<g class="rkm-twinkle" style="animation-delay:${i * 1.1}s" fill="#FFFFFF">${g}</g>`).join('');
  };

  const SOLO = '<!--solo-->';   // ส่วนหลังเครื่องหมายนี้ = ชิ้นเดียวในฉาก (ดวงอาทิตย์/ดวงจันทร์/ยอดเขา) ไม่สะท้อนไปด้านข้าง
  const SCENES = {
    meadow(y0, y1, r) {
      let o = cloud(330, y0 + 60, 1, '#FFFFFF', 0.9) + cloud(250, y0 + 110, 0.7, '#FFFFFF', 0.7);
      o += hills(y1, 150, '#B7E3A6', 11) + hills(y1, 90, '#9BD48D', 12, 4);
      for (let i = 0; i < 6; i += 1) o += tree(edgeX(r), y1 - 20 - r() * 150, 0.9 + r() * 0.5, '#6CC070', '#8BD48E');
      for (let i = 0; i < 26; i += 1) {
        const x = edgeX(r); const y = y1 - 8 - r() * 120;
        o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(2 + r() * 2)}" fill="${['#FF9EC4', '#FFD66B', '#FFFFFF', '#C9A7FF'][Math.floor(r() * 4)]}"/>`;
      }
      return o + SOLO + `<circle cx="66" cy="${y0 + 70}" r="52" fill="#FFE28A" opacity=".25"/><circle cx="66" cy="${y0 + 70}" r="34" fill="#FFE28A" opacity=".95"/>`;
    },
    grassland(y0, y1, r) {
      let o = cloud(80, y0 + 70, 0.9, '#FFFFFF', 0.8) + cloud(320, y0 + 140, 0.6, '#FFFFFF', 0.7);
      o += hills(y1, 200, '#CDE9B0', 21, 3) + hills(y1, 120, '#A9DA8E', 22, 4);
      for (let i = 0; i < 22; i += 1) {
        const x = edgeX(r); const y = y1 - 10 - r() * 190;
        o += `<path d="M${f1(x)} ${f1(y)} q-3 -10 -6 -12 M${f1(x)} ${f1(y)} q0 -12 1 -15 M${f1(x)} ${f1(y)} q3 -9 7 -11" stroke="#6FB65E" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      }
      for (let i = 0; i < 4; i += 1) {
        const x = 20 + r() * 360; const y = y0 + 60 + r() * (y1 - y0 - 120);
        o += `<path class="rkm-wind" style="animation-delay:${f1(r() * 3)}s" d="M${f1(x)} ${f1(y)} c20 -10 40 10 60 0 c12 -6 14 -18 4 -20" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".75"/>`;
      }
      for (let i = 0; i < 5; i += 1) { const x = 310 + i * 16; o += `<rect x="${x}" y="${y1 - 70 - i * 3}" width="4" height="22" rx="1" fill="#A97C50"/>`; }
      return o;
    },
    river(y0, y1, r) {
      const ym = y0 + (y1 - y0) * 0.62;
      let o = hills(y1, 70, '#9FD8B4', 31, 4);
      o += `<path d="M-10 ${ym - 20} C 90 ${ym - 60}, 160 ${ym + 30}, 230 ${ym - 10} S 360 ${ym - 50}, 410 ${ym - 20} L410 ${ym + 26} C 340 ${ym - 6}, 280 ${ym + 40}, 220 ${ym + 30} S 70 ${ym - 10}, -10 ${ym + 22} Z" fill="#6CC7DA"/>`;
      o += `<path class="rkm-flow" d="M10 ${ym - 6} C 90 ${ym - 36}, 160 ${ym + 26}, 230 ${ym + 4} S 350 ${ym - 26}, 400 ${ym - 4}" stroke="#E8FBFF" stroke-width="2" fill="none" stroke-dasharray="10 16" opacity=".8"/>`;
      for (let i = 0; i < 7; i += 1) o += `<ellipse cx="${f1(edgeX(r))}" cy="${f1(ym + 14 + (r() - 0.5) * 20)}" rx="${f1(5 + r() * 6)}" ry="${f1(3 + r() * 3)}" fill="#3FA75E" opacity=".9"/>`;
      for (let i = 0; i < 8; i += 1) {
        const x = edgeX(r); const y = y0 + 40 + r() * (ym - y0 - 60);
        o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(7 + r() * 8)}" ry="${f1(4 + r() * 4)}" fill="#9DB3B8"/>`;
      }
      for (let i = 0; i < 10; i += 1) {
        const x = edgeX(r); const y = y1 - 10 - r() * 60;
        o += `<path d="M${f1(x)} ${f1(y)} v-22" stroke="#4D8F5A" stroke-width="2"/><ellipse cx="${f1(x)}" cy="${f1(y - 24)}" rx="2.5" ry="6" fill="#8A5A36"/>`;
      }
      return o;
    },
    mountain(y0, y1, r) {
      let o = '';
      const peaks = [[30, 210], [120, 260], [210, 200], [300, 280], [380, 220]];
      peaks.forEach(([x, h], i) => {
        const base = y1 - 10; const top = base - h;
        o += `<path d="M${x - 90} ${base} L${x} ${top} L${x + 90} ${base} Z" fill="${i % 2 ? '#A99FD8' : '#9489CB'}" opacity=".85"/>`;
        o += `<path d="M${x - 22} ${top + 52} L${x} ${top} L${x + 22} ${top + 52} L${x + 10} ${top + 42} L${x} ${top + 56} L${x - 10} ${top + 42} Z" fill="#F4F2FF"/>`;
      });
      o += hills(y1, 70, '#8379BE', 41, 5);
      for (let i = 0; i < 9; i += 1) {
        const x = edgeX(r); const y = y1 - 20 - r() * 150; const s = 8 + r() * 10;
        o += `<path d="M${f1(x - s)} ${f1(y)} L${f1(x - s * 0.4)} ${f1(y - s)} L${f1(x + s * 0.6)} ${f1(y - s * 0.8)} L${f1(x + s)} ${f1(y)} Z" fill="#6E64A8"/>`;
      }
      return o;
    },
    moonforest(y0, y1, r) {
      let o = stars(y0, y1 - 120, 40, 51);
      o += hills(y1, 110, '#2B3466', 52, 4);
      for (let i = 0; i < 12; i += 1) o += pine(edgeX(r), y1 - 6 - r() * 130, 0.8 + r() * 0.7, r() < 0.5 ? '#1D2650' : '#253063');
      let ff = '';
      for (let i = 0; i < 10; i += 1) ff += `<circle cx="${f1(edgeX(r))}" cy="${f1(y0 + 120 + r() * (y1 - y0 - 160))}" r="2.2"/>`;
      o += `<g class="rkm-firefly" fill="#FFF3A3">${ff}</g>`;
      return o + SOLO + `<circle cx="318" cy="${y0 + 82}" r="58" fill="#F4F1D0" opacity=".12"/><circle cx="318" cy="${y0 + 82}" r="36" fill="#F4F1D0"/>
        <circle cx="306" cy="${y0 + 74}" r="7" fill="#DCD7AE"/><circle cx="328" cy="${y0 + 94}" r="5" fill="#DCD7AE"/>`;
    },
    shadow(y0, y1, r) {
      let o = stars(y0, y0 + 120, 14, 61);
      for (let i = 0; i < 4; i += 1) o += `<ellipse cx="${f1(r() * W)}" cy="${f1(y0 + 80 + r() * (y1 - y0 - 120))}" rx="${f1(90 + r() * 60)}" ry="16" fill="#8C6BFF" opacity=".08"/>`;
      for (let i = 0; i < 6; i += 1) {
        const x = edgeX(r); const h = 160 + r() * 140;
        o += `<path d="M${f1(x - 7)} ${y1} Q${f1(x - 4)} ${f1(y1 - h * 0.6)} ${f1(x)} ${f1(y1 - h)} Q${f1(x + 4)} ${f1(y1 - h * 0.6)} ${f1(x + 7)} ${y1} Z" fill="#170F2E"/>
          <ellipse cx="${f1(x)}" cy="${f1(y1 - h)}" rx="${f1(30 + r() * 16)}" ry="${f1(18 + r() * 8)}" fill="#1E1540"/>`;
        o += `<path d="M${f1(x + 10)} ${f1(y1 - h + 10)} q 6 30 -2 60" stroke="#2F6B4F" stroke-width="2" fill="none" opacity=".7"/>`;
      }
      o += hills(y1, 70, '#1A1236', 62, 5);
      let mush = '';
      for (let i = 0; i < 9; i += 1) {
        const x = edgeX(r); const y = y1 - 6 - r() * 60;
        mush += `<rect x="${f1(x - 1.5)}" y="${f1(y - 10)}" width="3" height="10" fill="#E9DDFF"/>
          <ellipse cx="${f1(x)}" cy="${f1(y - 11)}" rx="7" ry="4.5" fill="#C38BFF"/><ellipse cx="${f1(x)}" cy="${f1(y - 11)}" rx="13" ry="9" fill="#C38BFF" opacity=".18"/>`;
      }
      o += `<g class="rkm-glow">${mush}</g>`;
      for (let i = 0; i < 4; i += 1) {
        const x = edgeX(r); const y = y1 - 20 - r() * 140;
        o += `<path d="M${f1(x)} ${f1(y)} l6 -16 l6 16 l-6 6 Z" fill="#7FE7FF" opacity=".75"/><path d="M${f1(x)} ${f1(y)} l6 -16 l6 16 l-6 6 Z" fill="#7FE7FF" opacity=".2" transform="translate(${f1(x + 6)} ${f1(y - 5)}) scale(1.8) translate(${f1(-x - 6)} ${f1(-y + 5)})"/>`;
      }
      return o;
    },
    storm(y0, y1, r) {
      let o = '';
      for (let i = 0; i < 5; i += 1) o += cloud(20 + r() * 360, y0 + 30 + r() * 90, 1.2 + r() * 0.8, '#577888', 0.55);
      const jag = [[0, 160], [60, 250], [120, 170], [200, 230], [270, 150], [340, 260], [400, 170]];
      let d = `M0 ${y1}`; jag.forEach(([x, h]) => { d += ` L${x} ${y1 - h}`; }); d += ` L${W} ${y1} Z`;
      o += `<path d="${d}" fill="#163242"/>`;
      o += hills(y1, 80, '#10283A', 72, 5);
      for (let i = 0; i < 3; i += 1) {
        const x = edgeX(r); const y = y0 + 90 + r() * 80;
        o += `<polyline class="rkm-bolt" style="animation-delay:${f1(r() * 5)}s" points="${f1(x)},${f1(y)} ${f1(x - 10)},${f1(y + 26)} ${f1(x + 2)},${f1(y + 26)} ${f1(x - 8)},${f1(y + 56)}" fill="none" stroke="#FFE66D" stroke-width="3" stroke-linejoin="round"/>`;
      }
      let rain = '';
      for (let i = 0; i < 24; i += 1) {
        const x = r() * W; const y = y0 + 70 + r() * (y1 - y0 - 120);
        rain += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - 4)}" y2="${f1(y + 12)}"/>`;
      }
      o += `<g class="rkm-rain" stroke="#9FD3E6" stroke-width="1.2" opacity=".45">${rain}</g>`;
      return o;
    },
    citadel(y0, y1, r) {
      let o = '';
      for (let i = 0; i < 6; i += 1) o += `<path d="M200 ${y0 - 20} L${f1(20 + i * 72)} ${y1}" stroke="#FFF6D8" stroke-width="18" opacity=".12"/>`;
      // ป้อมทอง 2 ฝั่ง
      const tower = (x, h, w) => `<g><rect x="${x - w / 2}" y="${y1 - 90 - h}" width="${w}" height="${h}" fill="#E3B04B"/>
        <path d="M${x - w / 2 - 4} ${y1 - 90 - h} L${x} ${y1 - 120 - h} L${x + w / 2 + 4} ${y1 - 90 - h} Z" fill="#B97F22"/>
        <rect x="${x - 4}" y="${y1 - 60 - h}" width="8" height="14" rx="4" fill="#7A4E12"/>
        <path d="M${x} ${y1 - 120 - h} v-18 l14 5 l-14 5" fill="#C2337A" stroke="#7A4E12" stroke-width="1.5"/></g>`;
      o += tower(38, 120, 30) + tower(78, 80, 24) + tower(352, 130, 32) + tower(316, 86, 24);
      o += `<rect x="20" y="${y1 - 100}" width="80" height="18" fill="#D49B36"/><rect x="300" y="${y1 - 100}" width="80" height="18" fill="#D49B36"/>`;
      // พื้นเมฆ (เหนือพายุ) ปิดรอยต่อกับดินแดนพายุ
      for (let i = 0; i < 9; i += 1) o += cloud(i * 50 + r() * 10, y1 - 40 + r() * 20, 1.4 + r() * 0.5, '#FFFFFF', 0.95);
      for (let i = 0; i < 4; i += 1) o += cloud(edgeX(r), y0 + 50 + r() * 120, 0.8, '#FFF6E0', 0.85);
      return o;
    },
    aurora(y0, y1, r) {
      let o = stars(y0 - TOP_PAD + 10, y1 - 60, 70, 91);
      const ribbons = [['#69E0B8', 0], ['#68A9FF', 40], ['#A781FF', 80]];
      ribbons.forEach(([c, dy], i) => {
        // แสงฟุ้งด้วยเส้นซ้อน 2 ชั้น (ไม่ใช้ filter blur ที่กินเครื่อง)
        const d = `M-20 ${y0 + 60 + dy} C 80 ${y0 - 10 + dy}, 160 ${y0 + 140 + dy}, 260 ${y0 + 50 + dy} S 380 ${y0 + 10 + dy}, 420 ${y0 + 70 + dy}`;
        o += `<g class="rkm-aurora" style="animation-delay:${i * 1.3}s" stroke="${c}" fill="none" stroke-linecap="round">
          <path d="${d}" stroke-width="${40 - i * 6}" stroke-opacity=".12"/><path d="${d}" stroke-width="${16 - i * 3}" stroke-opacity=".3"/></g>`;
      });
      o += hills(y1, 110, '#222A55', 92, 3);
      for (let i = 0; i < 6; i += 1) {
        const x = edgeX(r); const y = y1 - 30 - r() * 140;
        o += `<path d="M${f1(x)} ${f1(y)} l7 -20 l7 20 l-7 8 Z" fill="${['#69E0B8', '#68A9FF', '#A781FF'][i % 3]}" opacity=".85"/>`;
      }
      // ยอดเขาคริสตัล (ชิ้นเดียว ไม่สะท้อน)
      return o + SOLO + `<path d="M110 ${y1 - 40} L200 ${y0 + 40} L290 ${y1 - 40} Z" fill="#2B3566"/><path d="M200 ${y0 + 40} L240 ${y0 + 150} L212 ${y0 + 130} L200 ${y0 + 170} L186 ${y0 + 128} L162 ${y0 + 146} Z" fill="#C9D6FF" opacity=".85"/>`;
    },
  };

  /* ---------- เรขาคณิตของเส้นทาง ---------- */
  function layout(leagues) {
    const total = BOTTOM_PAD + leagues.length * BAND + TOP_PAD;
    const regions = []; const wps = [];
    wps.push({ kind: 'start', x: 200, y: total - 40 });
    leagues.forEach((l, i) => {
      const y1 = total - BOTTOM_PAD - i * BAND; const y0 = y1 - BAND;
      const at = (t) => y1 - BAND * t;
      const ex = i % 2 === 0 ? 104 : 296;
      const reg = { league: l, i, y0, y1, ex };
      regions.push(reg);
      reg.emblem = { kind: 'emblem', league: l.id, x: ex, y: at(0.22) };
      wps.push(reg.emblem);
      const divs = l.divisions.length;
      reg.checks = l.divisions.map((d, k) => {
        const t = divs === 1 ? 0.56 : 0.44 + (0.30 * k) / (divs - 1);
        const x = ex + ((W - ex) - ex) * ((k + 1) / (divs + 1)) * 0.9;
        const w = { kind: 'check', league: l.id, division: k, label: d || 'สูงสุด', x, y: at(t) };
        wps.push(w);
        return w;
      });
      const bossId = l.guardian || l.apexChallenge;
      if (bossId) {
        reg.boss = { kind: 'boss', league: l.id, npc: bossId, apex: !l.guardian, x: 200, y: at(l.guardian ? 0.88 : 0.86) };
        wps.push(reg.boss);
      }
    });
    return { total, regions, wps };
  }
  /** Catmull-Rom -> Cubic Bezier (เส้นโค้งนุ่มผ่านทุกจุด) */
  function pathSegments(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
      const k = 0.2;
      segs.push(`C${f1(p1.x + (p2.x - p0.x) * k)} ${f1(p1.y + (p2.y - p0.y) * k)} ${f1(p2.x - (p3.x - p1.x) * k)} ${f1(p2.y - (p3.y - p1.y) * k)} ${f1(p2.x)} ${f1(p2.y)}`);
    }
    return segs;
  }
  function smoothPath(pts) { return `M${f1(pts[0].x)} ${f1(pts[0].y)} ${pathSegments(pts).join(' ')}`; }

  /* ---------- สถานะจากข้อมูลจริง ---------- */
  function stateOf(cfg, me) {
    const p = me.profile;
    const cur = cfg.leagues.find((l) => l.id === p.league);
    const top = cfg.leagues.reduce((m, l) => Math.max(m, l.order), 0);
    const pending = p.promotionStatus === 'pending' && Boolean(cur.guardian) && cur.order < top;
    return { p, cur, curOrder: cur.order, pending, div: p.divisionIndex };
  }
  const leagueStatus = (l, st) => (l.order < st.curOrder ? 'done' : l.order > st.curOrder ? 'locked' : (st.pending ? 'ready' : 'current'));

  /* ---------- วาดแผนที่ ---------- */
  function buildSvg(cfg, st, opts) {
    const { total, regions, wps } = layout(cfg.leagues);
    // เรียงจากดินแดนบนสุดลงล่าง: ที่ขอบดินแดน สีของดินแดนด้านบนต้องมาก่อน (ไม่งั้นสีไหลข้ามขอบ)
    const stops = [...regions].reverse().flatMap((reg) => {
      const sky = SKY[reg.league.theme] || SKY.meadow;
      return [[reg.y0 / total, sky[0]], [reg.y1 / total, sky[1]]];
    });
    const grad = `<linearGradient id="rkm-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121733"/>${stops.map(([o, c]) => `<stop offset="${o.toFixed(4)}" stop-color="${c}"/>`).join('')}<stop offset="1" stop-color="#D7EFCB"/></linearGradient>`;
    let scenes = ''; let artDefs = '';
    regions.forEach((reg) => {
      const s = leagueStatus(reg.league, st);
      const draw = SCENES[reg.league.theme] || SCENES.meadow;
      const [art, solo = ''] = draw(reg.y0, reg.y1, rng(reg.i * 97 + 13)).split(SOLO);
      // ฉากเดียวกันสะท้อนออกไปสองข้าง (จอกว้าง) -> ใช้สำเนาแบบภาพนิ่ง (ตัด animation ออก) ประหยัดแรงเครื่อง
      const still = art.replace(/ class="rkm-[a-z]+"/g, '').replace(/ style="animation-delay:[^"]*"/g, '');
      artDefs += `<g id="rkm-art-s-${reg.i}">${still}</g>`;
      scenes += `<g class="rkm-region rkm-${s}" data-region="${reg.league.id}" data-y0="${reg.y0}" data-y1="${reg.y1}">${solo}${art}
        <use class="rkm-mirror" href="#rkm-art-s-${reg.i}" transform="matrix(-1 0 0 1 0 0)"/><use class="rkm-mirror" href="#rkm-art-s-${reg.i}" transform="matrix(-1 0 0 1 ${2 * W} 0)"/></g>`;
      // ดินแดนที่ยังล็อก: หมอกทึบขึ้นแทนการใช้ filter ลดสี (filter ทั้งดินแดนกินเครื่องมาก)
      if (s === 'locked') scenes += `<rect class="rkm-fog" data-fog="${reg.league.id}" x="${-W}" y="${reg.y0}" width="${3 * W}" height="${BAND}" fill="url(#rkm-fog)"/>`;
    });
    // ค่ายเริ่มต้น + ป้ายยอดเขา
    scenes += `<g transform="translate(200 ${total - 40})"><path d="M-46 22 L0 -18 L46 22 Z" fill="#F2B45A"/><path d="M-46 22 L0 -18 L0 22 Z" fill="#E09A3A"/>
      <rect x="-1.5" y="-46" width="3" height="30" fill="#7A4E12"/><path d="M1.5 -46 l22 7 l-22 7 Z" fill="#C2337A"/></g>`;

    const pathD = smoothPath(wps);
    const strong = (l) => opts.strongColor(l);
    const label = (x, y, text, sub, fill, cls = '', anchor = 'center') => {
      // ความยาวสตริงไทยนับสระ/วรรณยุกต์ด้วย -> ใช้ตัวคูณต่ำลง · ป้ายข้างจุดบอสจำกัดกว้างไม่ให้ล้นขอบจอแคบ
      const w = Math.max(110, Math.min(anchor === 'center' ? 176 : 150, text.length * 9.5 + 28));
      const cx = anchor === 'right' ? x + w / 2 : anchor === 'left' ? x - w / 2 : x;   // right = ป้ายอยู่ทางขวาของจุด
      return `<g class="rkm-plaque ${cls}" transform="translate(${f1(cx)} ${f1(y)})">
        <rect x="${-w / 2}" y="0" width="${w}" height="${sub ? 42 : 28}" rx="14" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>
        <text x="0" y="19" text-anchor="middle" class="rkm-t-name">${esc(text)}</text>
        ${sub ? `<text x="0" y="35" text-anchor="middle" class="rkm-t-sub">${esc(sub)}</text>` : ''}</g>`;
    };

    let nodes = '';
    regions.forEach((reg) => {
      const l = reg.league; const s = leagueStatus(l, st);
      const isCur = l.order === st.curOrder;
      // Checkpoint (Division)
      reg.checks.forEach((c, k) => {
        const passed = s === 'done' || (isCur && (k < st.div || st.pending));
        const here = isCur && !st.pending && k === st.div;
        const cls = passed ? 'passed' : here ? 'here' : 'todo';
        nodes += `<g class="rkm-check rkm-check-${cls}" transform="translate(${f1(c.x)} ${f1(c.y)})" role="button" tabindex="0" data-node="${l.id}"
            aria-label="${esc(`${l.name} ${l.divisions[k] || ''}`.trim())} · เริ่ม ${l.minQr[k].toLocaleString()} แต้ม${passed ? ' · ผ่านแล้ว' : here ? ' · คุณอยู่ที่นี่' : ''}">
          ${here ? '<circle class="rkm-pulse" r="16" fill="none" stroke="#FFFFFF" stroke-width="3"/>' : ''}
          <circle r="15" fill="${passed ? strong(l) : here ? '#FFFFFF' : (DARK.has(l.theme) ? '#3A4068' : '#E9E6F2')}" stroke="${passed || here ? strong(l) : '#9CA0B8'}" stroke-width="3"/>
          ${passed ? '<path d="M-6 0 l4 4 l8 -8" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : `<text y="4.5" text-anchor="middle" class="rkm-t-div" fill="${here ? strong(l) : (DARK.has(l.theme) ? '#C9CCE6' : '#6B6F8A')}">${esc(l.divisions[k] || '★')}</text>`}
        </g>`;
      });
      // จุดบอส
      if (reg.boss) {
        const b = reg.boss; const gate = !b.apex && opts.highRank && opts.highRank(l.id);   // แรงค์สูง: แมตช์เลื่อนแรงค์ (ไม่มีบอสประจำด่าน)
        const npc = gate ? null : opts.npcOf(b.npc);
        const bs = s === 'done' ? 'beaten' : s === 'ready' ? 'ready' : isCur ? 'next' : 'locked';
        const tag = b.apex ? 'Apex' : 'บอส';
        nodes += `<g class="rkm-boss rkm-boss-${bs}" transform="translate(200 ${f1(b.y)})" role="button" tabindex="0" data-node="${l.id}" data-boss="1"
            aria-label="${esc(`${b.apex ? 'Apex Challenge' : gate ? 'แมตช์เลื่อนแรงค์' : 'ด่านบอสเลื่อนแรงค์'}${npc ? `: ${npc.name}` : ''} · ${{ beaten: 'ชนะแล้ว', ready: 'พร้อมท้าทาย', next: 'ต้องเก็บแต้มให้ถึงขั้นสูงสุดก่อน', locked: 'ยังไม่ปลดล็อก' }[bs]}`)}">
          ${bs === 'ready' ? '<circle class="rkm-ready-ring" r="44" fill="none" stroke="#FF7A3D" stroke-width="4"/>' : ''}
          <path d="M0 -40 L32 -28 L30 8 C28 26 14 36 0 44 C-14 36 -28 26 -30 8 L-32 -28 Z" fill="${bs === 'locked' ? '#5C6077' : bs === 'beaten' ? '#C9A24A' : '#8E2D2D'}" stroke="#FFFFFF" stroke-width="3"/>
          <clipPath id="rkm-bc-${l.id}"><circle r="22" cy="-2"/></clipPath>
          <circle r="23" cy="-2" fill="#1D1A2E"/>
          ${gate ? `<svg x="-14" y="-16" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFD66B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><use href="/assets/icons/icons.svg#swords"></use></svg>`
    : `<g clip-path="url(#rkm-bc-${l.id})" ${bs === 'locked' ? 'opacity=".55"' : ''}><svg x="-25" y="-27" width="50" height="50" viewBox="0 0 96 96"><use href="/assets/guardians/guardians.svg#guardian-${esc(b.npc)}"></use></svg></g>`}
          ${bs === 'beaten' ? '<g transform="translate(22 -28)"><circle r="11" fill="#2BA36B" stroke="#FFFFFF" stroke-width="2.5"/><path d="M-5 0 l3.5 3.5 l7 -7" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>' : ''}
          ${bs === 'locked' ? '<g transform="translate(22 -28)"><circle r="11" fill="#3A3E57" stroke="#FFFFFF" stroke-width="2"/><rect x="-5" y="-2" width="10" height="8" rx="1.5" fill="#FFFFFF"/><path d="M-3 -2 v-3 a3 3 0 0 1 6 0 v3" stroke="#FFFFFF" stroke-width="2" fill="none"/></g>' : ''}
          ${(() => {   // ป้ายบอสอยู่ด้านข้างฝั่งที่เส้นทางไม่ผ่าน (ไม่ทับตัวผู้เล่น/Checkpoint)
    const side = reg.i % 2 === 0 ? 'left' : 'right';
    return label(side === 'left' ? -38 : 38, -18, gate ? 'แมตช์เลื่อนแรงค์' : `${tag}: ${npc ? npc.name : ''}`, bs === 'ready' ? 'พร้อมท้าทาย!' : bs === 'beaten' ? 'ชนะแล้ว' : '',
      bs === 'ready' ? '#C2410C' : bs === 'locked' ? '#4A4E66' : '#6E2A2A', bs === 'ready' ? 'rkm-plaque-ready' : '', side);
  })()}
        </g>`;
      }
      // ตราแรงค์
      const e = reg.emblem; const big = isCur ? 58 : 50;
      nodes += `<g class="rkm-emblem rkm-emblem-${s}" transform="translate(${f1(e.x)} ${f1(e.y)})" role="button" tabindex="0" data-node="${l.id}"
          aria-label="${esc(`${l.name} · ${{ done: 'ผ่านแล้ว', current: 'แรงค์ปัจจุบัน', ready: 'พร้อมเลื่อนแรงค์', locked: 'ยังไม่ปลดล็อก' }[s]}`)}" ${isCur ? 'aria-current="step"' : ''}>
        <g class="rkm-emblem-body">
          ${isCur ? `<circle class="rkm-pulse" r="${big + 4}" fill="none" stroke="${l.colors.primary}" stroke-width="4"/><circle r="${big + 16}" fill="${l.colors.primary}" opacity=".18"/>` : ''}
          <circle r="${big}" fill="url(#rkm-disc-${l.id})" stroke="#FFFFFF" stroke-width="4"/>
          <image href="${opts.badgeSrc(l.id, 192)}" x="${-big + 4}" y="${-big + 4}" width="${(big - 4) * 2}" height="${(big - 4) * 2}" ${s === 'locked' ? 'opacity=".5"' : ''}/>
          ${s === 'locked' ? `<circle r="${big - 3}" fill="#3A3E57" opacity=".45"/>` : ''}
          ${s === 'done' ? `<g transform="translate(${big * 0.72} ${-big * 0.72})"><circle r="13" fill="#2BA36B" stroke="#FFFFFF" stroke-width="3"/><path d="M-6 0 l4 4 l8 -8" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>` : ''}
          ${s === 'locked' ? `<g transform="translate(0 2)"><circle r="17" fill="#2C3048" opacity=".85"/><rect x="-7" y="-2" width="14" height="11" rx="2" fill="#FFFFFF"/><path d="M-4.5 -2 v-4 a4.5 4.5 0 0 1 9 0 v4" stroke="#FFFFFF" stroke-width="2.5" fill="none"/></g>` : ''}
        </g>
        ${label(0, big + 8, l.name, isCur ? `${st.p.questRating.toLocaleString()} แต้ม` : l.region, s === 'locked' ? '#4A4E66' : strong(l), isCur ? 'rkm-plaque-cur' : '')}
      </g>`;
    });

    const defs = `<defs>${grad}
      <linearGradient id="rkm-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2E45" stop-opacity=".42"/><stop offset=".5" stop-color="#2A2E45" stop-opacity=".55"/><stop offset="1" stop-color="#2A2E45" stop-opacity=".42"/></linearGradient>
      <linearGradient id="rkm-glowgrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFD66B"/><stop offset=".55" stop-color="#FF9EC4"/><stop offset="1" stop-color="#8EE6FF"/></linearGradient>
${artDefs}
      ${cfg.leagues.map((l) => `<radialGradient id="rkm-disc-${l.id}"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="${l.colors.secondary && /^#/.test(l.colors.secondary) ? l.colors.secondary : '#FFFFFF'}"/><stop offset="1" stop-color="${l.colors.primary}"/></radialGradient>`).join('')}
    </defs>`;

    const svg = `<svg class="rkm-svg" xmlns="${NS}" viewBox="0 0 ${W} ${total}" role="img" aria-labelledby="rkm-svg-title">
      <title id="rkm-svg-title">แผนที่เส้นทางสู่แรงค์สูงสุด — ${cfg.leagues.length} ดินแดน ตั้งแต่${esc(cfg.leagues[0].name)}ถึง${esc(cfg.leagues[cfg.leagues.length - 1].name)}</title>
      ${defs}
      <rect x="${-W}" width="${3 * W}" height="${total}" fill="url(#rkm-sky)"/>
      ${stars(0, TOP_PAD, 26, 7)}<g class="rkm-mirror" transform="translate(${-W} 0)">${stars(0, TOP_PAD, 26, 8)}</g><g class="rkm-mirror" transform="translate(${W} 0)">${stars(0, TOP_PAD, 26, 9)}</g>
      ${scenes}
      <path d="${pathD}" fill="none" stroke="#5A4126" stroke-opacity=".35" stroke-width="26" stroke-linecap="round"/>
      <path d="${pathD}" fill="none" stroke="#F6E7C6" stroke-width="18" stroke-linecap="round"/>
      <path d="${pathD}" fill="none" stroke="#D9C49A" stroke-width="2" stroke-dasharray="2 12" stroke-linecap="round"/>
      <path id="rkm-route" d="${pathD}" fill="none" stroke="none"/>
      <path id="rkm-progress-halo" d="${pathD}" fill="none" stroke="#FFE7A3" stroke-opacity=".35" stroke-width="20" stroke-linecap="round"/>
      <path id="rkm-progress" d="${pathD}" fill="none" stroke="url(#rkm-glowgrad)" stroke-width="9" stroke-linecap="round"/>
      <path id="rkm-sparks" class="rkm-spark-flow" d="" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      ${nodes}
      <g id="rkm-friends" class="rkm-friends"></g>
      <g id="rkm-me" class="rkm-me" aria-hidden="true"></g>
      <text x="200" y="${TOP_PAD - 120}" text-anchor="middle" class="rkm-t-title">ยอดเขาแห่งตำนาน</text>
    </svg>`;
    return { svg, total, regions, wps };
  }

  /* ---------- ตำแหน่งผู้เล่นบนเส้นทาง (ความยาวตามเส้นจริง) ----------
     หาความยาวสะสมของแต่ละจุด (ตรา / Checkpoint / บอส) บนเส้นเต็มครั้งเดียว: เดินตามเส้นแล้วหาจุดที่ใกล้ที่สุดตามลำดับ */
  function waypointLengths(routeEl, wps) {
    // ความยาวสะสมถึงแต่ละจุด = ผลรวมความยาวของแต่ละช่วงโค้ง (วัดช่วงละครั้ง — เร็วกว่าการไล่หาจุดบนเส้นหลายสิบเท่า)
    const segs = pathSegments(wps);
    const tmp = document.createElementNS(NS, 'path');
    routeEl.parentNode.appendChild(tmp);
    const out = [0];
    let acc = 0;
    segs.forEach((seg, i) => {
      tmp.setAttribute('d', `M${f1(wps[i].x)} ${f1(wps[i].y)} ${seg}`);
      acc += tmp.getTotalLength();
      out.push(acc);
    });
    tmp.remove();
    return out;
  }
  function positionLen(lens, wps, st) {
    const idxOf = (pred) => wps.findIndex(pred);
    const l = st.cur;
    let i;
    if (st.pending) i = idxOf((w) => w.kind === 'boss' && w.league === l.id);
    else i = idxOf((w) => w.kind === 'check' && w.league === l.id && w.division === st.div);
    if (i < 0) i = idxOf((w) => w.kind === 'emblem' && w.league === l.id);
    const at = lens[i];
    if (st.pending) return Math.max(0, at - 92);   // ยืนรอหน้าประตูบอส (ไม่บังรูปบอส)
    if (!st.p.progress || i + 1 >= wps.length) return at;
    return at + (lens[i + 1] - at) * Math.max(0, Math.min(1, st.p.progress.pct / 100)) * 0.8;   // เลื่อนเข้าใกล้ขั้นถัดไปตามแต้มจริง
  }

  function placeMe(svgEl, routeEl, len, user, color) {
    const g = svgEl.querySelector('#rkm-me');
    const pt = routeEl.getPointAtLength(len);
    if (!g.firstChild) {
      const av = user && user.avatarImage
        ? `<clipPath id="rkm-me-clip"><circle r="19"/></clipPath><image href="${esc(user.avatarImage)}" x="-19" y="-19" width="38" height="38" clip-path="url(#rkm-me-clip)" preserveAspectRatio="xMidYMid slice"/>`
        : `<svg x="-19" y="-19" width="38" height="38" viewBox="0 0 64 64"><use href="/assets/avatars/avatars.svg#av-${esc(G.AVATAR_IDS.includes(user && user.avatar) ? user.avatar : 'fox')}"></use></svg>`;
      g.innerHTML = `<g class="rkm-me-bob"><ellipse cx="0" cy="30" rx="16" ry="5" fill="#000" opacity=".25"/>
        <circle class="rkm-pulse" r="27" fill="none" stroke="#FFD66B" stroke-width="3"/>
        <path d="M0 27 L-9 15 L9 15 Z" fill="#FFD66B"/><circle r="24" fill="#FFFFFF" stroke="#FFD66B" stroke-width="4"/>${av}</g>`;
    }
    g.setAttribute('transform', `translate(${f1(pt.x)} ${f1(pt.y - 30)})`);
    return pt;
  }
  /* เส้นเรืองแสงช่วงที่ผ่านแล้ว: เปลี่ยนแค่ dasharray ของเส้นเดิม (ไม่สร้างเส้นใหม่ทุกเฟรม)
     final = true -> วาดประกายวิ่งตามเส้น (จุดตามเส้นจริงคำนวณครั้งเดียว ไม่ใช้ mask ที่กินเครื่อง) */
  function setProgress(svgEl, len, final = true) {
    const route = svgEl.querySelector('#rkm-route');
    const total = route.getTotalLength();
    const dash = `${f1(len)} ${f1(total + 10)}`;
    svgEl.querySelector('#rkm-progress').style.strokeDasharray = dash;
    svgEl.querySelector('#rkm-progress-halo').style.strokeDasharray = dash;
    const sp = svgEl.querySelector('#rkm-sparks');
    if (!final) { sp.setAttribute('d', ''); return; }
    let d = '';
    for (let L = 0; L <= len; L += 8) { const pt = route.getPointAtLength(L); d += `${d ? 'L' : 'M'}${f1(pt.x)} ${f1(pt.y)} `; }
    sp.setAttribute('d', d);
  }

  /* ---------- รายละเอียดแรงค์ ---------- */
  function detailHtml(l, cfg, st, me, opts) {
    const s = leagueStatus(l, st);
    const next = cfg.leagues.find((x) => x.order === l.order + 1);
    const gate = Boolean(l.guardian) && opts.highRank && opts.highRank(l.id);
    const npcId = gate ? null : (l.guardian || l.apexChallenge);
    const npc = npcId ? opts.npcOf(npcId) : null;
    const chip = { done: ['ok', 'ผ่านแล้ว'], current: ['current', 'กำลังแข่งขัน'], ready: ['ready', 'พร้อมเลื่อนแรงค์'], locked: ['locked', 'ยังไม่ปลดล็อก'] }[s];
    const isCur = s === 'current' || s === 'ready';
    const divRows = l.divisions.map((d, k) => {
      const passed = s === 'done' || (isCur && (k < st.div || st.pending));
      const here = isCur && !st.pending && k === st.div;
      return `<li class="${passed ? 'is-passed' : here ? 'is-here' : ''}"><span>${esc(d ? `ขั้น ${d}` : 'ขั้นเดียว')}</span><b>${l.minQr[k].toLocaleString()}+ แต้ม</b>${passed ? G.mark('ok', 'ผ่าน') : here ? '<em>คุณอยู่ที่นี่</em>' : ''}</li>`;
    }).join('');
    const p = st.p;
    let progress = '';
    if (isCur) {
      if (st.pending) progress = `<div class="rkd-progress is-ready"><p>${ic('flag', 'icon-sm')} เก็บแต้มครบแล้ว — ${gate ? 'ชนะแมตช์เลื่อนแรงค์' : `ชนะ <b>${esc(npc ? npc.name : 'บอส')}</b>`} เพื่อขึ้น <b>${esc(next ? next.name : '')}</b></p></div>`;
      else if (p.progress) {
        const left = Math.max(0, p.progress.to - p.questRating);
        const lastDiv = st.div === l.divisions.length - 1;
        progress = `<div class="rkd-progress"><div class="rkd-qr"><b>${p.questRating.toLocaleString()}</b> แต้มแรงค์</div>
          <div class="rk-progress" role="progressbar" aria-valuemin="${p.progress.from}" aria-valuemax="${p.progress.to}" aria-valuenow="${p.questRating}" aria-label="ความคืบหน้า"><span style="width:${p.progress.pct}%"></span></div>
          <p>${lastDiv && next ? `อีก <b>${left.toLocaleString()}</b> แต้ม ปลดล็อกด่านบอสสู่ ${esc(next.name)}` : `อีก <b>${left.toLocaleString()}</b> แต้ม ถึง${esc(l.divisions[st.div + 1] ? `ขั้น ${l.divisions[st.div + 1]}` : 'ขั้นถัดไป')}`}</p></div>`;
      } else progress = `<div class="rkd-progress"><div class="rkd-qr"><b>${p.questRating.toLocaleString()}</b> แต้มแรงค์</div><p>แรงค์สูงสุดของ EnglishQuest</p></div>`;
    }
    let howto;
    if (l.apexRequirements && next) {
      const a = l.apexRequirements;
      howto = `ขึ้น <b>${esc(next.name)}</b> ต้องมีแต้ม ${a.minQr.toLocaleString()}+ · เล่นอย่างน้อย ${a.minMatches} เกม · อัตราชนะ ${Math.round(a.minWinRate * 100)}% ขึ้นไป แล้ว${gate ? 'ชนะแมตช์เลื่อนแรงค์' : `ชนะ <b>${esc(npc ? npc.name : 'บอส')}</b> ในด่านเลื่อนแรงค์`}`;
    } else if (next) {
      howto = gate
        ? `เก็บแต้มจนถึง <b>${next.minQr[0].toLocaleString()}</b> (ขั้นสูงสุดของแรงค์นี้) แล้วชนะ<b>แมตช์เลื่อนแรงค์</b>เพื่อขึ้น <b>${esc(next.name)}</b> · แพ้ไม่ตกขั้น เล่นเกมปกติอีก 2 เกมแล้วลองใหม่ได้`
        : `เก็บแต้มจนถึง <b>${next.minQr[0].toLocaleString()}</b> (ขั้นสูงสุดของแรงค์นี้) เพื่อปลดล็อกด่านบอส แล้วชนะ <b>${esc(npc ? npc.name : 'บอส')}</b> เพื่อขึ้น <b>${esc(next.name)}</b> · แพ้ด่านบอสไม่ตกขั้น เล่นเกมปกติอีก 2 เกมแล้วลองใหม่ได้`;
    } else {
      howto = `แรงค์สูงสุด — ท้า <b>Apex Challenge</b> กับ ${esc(npc ? npc.name : 'บอส')} ได้ (ไม่กระทบแต้ม) และแข่งชิงอันดับในกลุ่ม${esc(l.name)}`;
    }
    const protect = l.protection === 'full' ? 'แพ้เกมปกติไม่เสียแต้ม' : l.protection === 'division3' ? `แพ้ในขั้น ${esc(l.divisions[0])} ไม่เสียแต้ม` : '';
    let actions = '';
    if (isCur) {
      if (me.activeMatchId) actions = `<button class="btn btn-primary btn-block" type="button" data-rkm-act="resume">${ic('play')} เล่นเกมที่ค้างอยู่ต่อ</button>`;
      else if (st.pending) actions = `<button class="btn rk-cta-trial btn-block" type="button" data-rkm-act="promotion">${ic('flag')} ${gate ? 'แข่งแมตช์เลื่อนแรงค์' : `ท้าทาย ${esc(npc ? npc.name : 'บอส')}`}</button>`;
      else if (!next && l.apexChallenge) actions = `<button class="btn btn-primary btn-block" type="button" data-rkm-act="ranked">${ic('swords')} แข่งชิงอันดับ</button>
        <button class="btn btn-secondary btn-block" type="button" data-rkm-act="apex">${ic('crown')} Apex Challenge</button>`;
      else actions = `<button class="btn btn-primary btn-block" type="button" data-rkm-act="ranked">${ic('swords')} แข่งเก็บแต้ม</button>`;
    }
    return `<div class="rkd" style="${opts.leagueVars(l)}">
      <div class="rkd-head">
        <div class="rkd-badge ${s === 'locked' ? 'is-locked' : ''}">${opts.badge(l.id, 'rk-badge-md')}</div>
        <div><p class="rkd-region">${esc(l.region)}</p><h2 class="rkd-name">${esc(l.name)}</h2>
          <span class="rkd-chip rkd-chip-${chip[0]}">${esc(chip[1])}</span></div>
      </div>
      <p class="rkd-motto">${esc(l.motto)}</p>
      ${progress}
      ${actions ? `<div class="rkd-actions">${actions}</div>` : ''}
      <h3 class="rkd-h">${ic('flag', 'icon-sm')} ขั้นในแรงค์นี้</h3>
      <ul class="rkd-divs">${divRows}</ul>
      ${protect ? `<p class="rkd-note">${ic('shield-check', 'icon-sm')} ${protect}</p>` : ''}
      <h3 class="rkd-h">${ic('swords', 'icon-sm')} ${next ? 'การเลื่อนแรงค์' : 'จุดสูงสุด'}</h3>
      <p class="rkd-how">${howto}</p>
      ${npc ? `<div class="rkd-boss"><span class="rkd-boss-pic">${opts.portrait(npc, 'rk-portrait-sm')}</span>
        <span><small>${l.guardian ? 'บอสประจำด่านเลื่อนแรงค์' : 'Apex Challenge'}</small><b>${esc(npc.name)}</b>${npc.title ? `<small>${esc(npc.title)}</small>` : ''}</span>
        <em class="rkd-boss-st">${{ done: 'ชนะแล้ว', ready: 'พร้อมท้าทาย', current: 'รอปลดล็อก', locked: 'ยังไม่ปลดล็อก' }[s]}</em></div>` : ''}
      ${s === 'locked' ? `<p class="rkd-note">${ic('lock', 'icon-sm')} ไต่แรงค์ให้ถึงที่นี่เพื่อปลดล็อก — การกดดูไม่เปลี่ยนแรงค์หรือแต้มจริง</p>` : ''}
    </div>`;
  }

  /* ---------- กล้อง (เลื่อนแผนที่) ---------- */
  function centerOn(viewport, svgEl, y, smooth = true) {
    const scale = svgEl.getBoundingClientRect().height / svgEl.viewBox.baseVal.height;
    const target = y * scale - viewport.clientHeight * 0.5;
    viewport.scrollTo({ top: Math.max(0, target), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }
  function centerX(viewport, svgEl, x) {
    const vb = svgEl.viewBox.baseVal;
    const scale = svgEl.getBoundingClientRect().width / vb.width;
    viewport.scrollLeft = Math.max(0, (x - vb.x) * scale - viewport.clientWidth / 2);
  }

  /* ---------- Animation เลื่อนแรงค์ (จากข้อมูลจริง: ตำแหน่งที่เห็นครั้งก่อน -> ตำแหน่งปัจจุบัน) ---------- */
  function animateMove(svgEl, routeEl, from, to, user, color, viewport, done) {
    if (reduceMotion() || Math.abs(to - from) < 2) { placeMe(svgEl, routeEl, to, user, color); setProgress(svgEl, to); done(); return; }
    const dur = Math.min(2600, 900 + Math.abs(to - from) * 2.2);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      const len = from + (to - from) * e;
      const pt = placeMe(svgEl, routeEl, len, user, color);
      setProgress(svgEl, len, k >= 1);
      centerOn(viewport, svgEl, pt.y, false);
      if (k < 1) requestAnimationFrame(step); else { updateActiveRegions(); done(); }
    };
    requestAnimationFrame(step);
  }
  function burst(svgEl, x, y, color) {
    if (reduceMotion()) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'rkm-burst');
    g.setAttribute('transform', `translate(${x} ${y})`);
    let html = `<circle r="20" fill="none" stroke="${color}" stroke-width="6" class="rkm-burst-ring"/>`;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      html += `<circle class="rkm-burst-dot" r="4" fill="${i % 2 ? '#FFD66B' : color}" style="--dx:${f1(Math.cos(a) * 80)}px;--dy:${f1(Math.sin(a) * 80)}px"/>`;
    }
    g.innerHTML = html;
    svgEl.appendChild(g);
    setTimeout(() => g.remove(), 1400);
  }

  /* ================= เปิดหน้าแผนที่ ================= */
  const ZOOMS = [1, 1.3, 1.65];
  let state = null;

  const FILTER_KEY = 'eq_rkmap_filter';
  const readFilter = () => { try { const f = localStorage.getItem(FILTER_KEY); return ['all', 'me', 'friends'].includes(f) ? f : 'all'; } catch (_) { return 'all'; } };

  function render(root, opts) {
    const { cfg, me, user, mode } = opts;
    const st = stateOf(cfg, me);
    // เปิดซ้ำโดยข้อมูลแรงค์ไม่เปลี่ยน -> ใช้แผนที่เดิม (ไม่วาดใหม่ทั้งแผนที่) แค่อัปเดตรายละเอียด/เพื่อน/กล้อง
    const key = [mode, st.cur.id, st.div, st.pending, st.p.questRating, user && user.avatar, user && user.avatarImage].join('|');
    if (state && state.root === root && state.key === key && root.querySelector('.rkm-svg')) {
      state.opts = opts; state.st = st;
      fitViewport();
      const len = positionLen(state.lens, state.wps, st);
      const pt = state.routeEl.getPointAtLength(len);
      requestAnimationFrame(() => { centerOn(state.viewport, state.svgEl, pt.y, false); centerX(state.viewport, state.svgEl, pt.x); updateActiveRegions(); });
      showDetail(st.cur.id, false);
      refreshFriends();
      startLoops();
      return;
    }
    const { svg, regions, wps } = buildSvg(cfg, st, opts);
    const zoom = state && state.mode === mode ? state.zoom : 0;
    const filter = readFilter();
    root.innerHTML = `
      <div class="rkm-tools">
        <div class="vd-seg rkm-filter" role="radiogroup" aria-label="แสดงบนแผนที่">
          ${[['all', 'ทั้งหมด'], ['me', 'ตัวฉัน'], ['friends', 'เพื่อน']].map(([v, t]) => `<button type="button" class="vd-seg-btn${v === filter ? ' active' : ''}" role="radio" aria-checked="${v === filter}" data-rkm-filter="${v}">${t}</button>`).join('')}
        </div>
        <label class="rkm-privacy"><input type="checkbox" role="switch" id="rkm-privacy" disabled> ซ่อนแรงค์ของฉันจากเพื่อน</label>
      </div>
      <div class="rkm-layout">
        <div class="rkm-stage">
          <div class="rkm-viewport" id="rkm-viewport" tabindex="0" aria-label="แผนที่ (เลื่อนขึ้นลงเพื่อสำรวจ)">
            <div class="rkm-canvas" id="rkm-canvas">${svg}</div>
          </div>
          <div class="rkm-zoom" role="group" aria-label="ซูมแผนที่">
            <button class="rkm-ctl" type="button" data-rkm-zoom="1" aria-label="ซูมเข้า">${ic('plus', 'icon-sm')}</button>
            <button class="rkm-ctl" type="button" data-rkm-zoom="-1" aria-label="ซูมออก"><svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button>
          </div>
          <button class="rkm-home" type="button" data-rkm-home>${ic('map-pin', 'icon-sm')} กลับไปแรงค์ปัจจุบัน</button>
        </div>
        <aside class="rkm-panel" id="rkm-panel" aria-live="polite"></aside>
      </div>`;
    const viewport = root.querySelector('#rkm-viewport');
    const canvas = root.querySelector('#rkm-canvas');
    const svgEl = canvas.querySelector('svg');
    const routeEl = svgEl.querySelector('#rkm-route');
    state = { root, opts, st, regions, wps, viewport, canvas, svgEl, routeEl, mode, zoom, key, friends: [], filter };
    applyFilter(filter);
    viewport.addEventListener('scroll', onViewportScroll, { passive: true });
    loadPrivacy();

    fitViewport();
    applyZoom(zoom, false);
    const color = opts.strongColor(st.cur);
    state.lens = waypointLengths(routeEl, wps);
    const nowLen = positionLen(state.lens, wps, st);
    const nowPt = routeEl.getPointAtLength(nowLen);

    // ความก้าวหน้าที่เคยเห็นครั้งก่อน (ต่อโหมด) — ถ้าขึ้นแรงค์/ขั้นใหม่ ให้เดินจากจุดเดิมไปจุดใหม่ + ปลดล็อกดินแดน
    const seenKey = `eq_rkmap_${mode}`;
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(seenKey) || 'null'); } catch (_) { seen = null; }
    const curStep = st.curOrder * 10 + st.div + (st.pending ? 5 : 0);
    const save = () => { try { localStorage.setItem(seenKey, JSON.stringify({ step: curStep, order: st.curOrder, len: nowLen })); } catch (_) { /* ไม่เป็นไร */ } };
    const moved = seen && typeof seen.step === 'number' && seen.step < curStep && typeof seen.len === 'number';
    const myRender = (state.renderId = (render.count = (render.count || 0) + 1));
    if (moved) {
      const newRegion = seen.order < st.curOrder ? st.cur.id : null;
      // ดินแดนใหม่: เริ่มจากหมอกปิด แล้วค่อยเปิด
      if (newRegion) {
        const fog = document.createElementNS(NS, 'rect');
        const reg = regions.find((r) => r.league.id === newRegion);
        fog.setAttribute('x', String(-W)); fog.setAttribute('y', String(reg.y0)); fog.setAttribute('width', String(3 * W)); fog.setAttribute('height', String(BAND));
        fog.setAttribute('fill', 'url(#rkm-fog)'); fog.setAttribute('class', 'rkm-fog rkm-fog-lifting');
        svgEl.querySelector(`[data-region="${newRegion}"]`).after(fog);
        setTimeout(() => fog.classList.add('is-gone'), 1200);
        setTimeout(() => fog.remove(), 2600);
      }
      placeMe(svgEl, routeEl, Math.min(seen.len, nowLen), user, color);
      setProgress(svgEl, Math.min(seen.len, nowLen), false);
      centerOn(viewport, svgEl, routeEl.getPointAtLength(Math.min(seen.len, nowLen)).y, false);
      setTimeout(() => animateMove(svgEl, routeEl, Math.min(seen.len, nowLen), nowLen, user, color, viewport, () => {
        save();
        if (!state || state.renderId !== myRender || !svgEl.isConnected) return;   // เปิดหน้าใหม่ไปแล้ว
        if (newRegion) {
          const reg = regions.find((r) => r.league.id === newRegion);
          burst(svgEl, reg.emblem.x, reg.emblem.y, st.cur.colors.primary);
          celebrate(st.cur, opts);
        }
      }), 450);
    } else {
      placeMe(svgEl, routeEl, nowLen, user, color);
      setProgress(svgEl, nowLen);
      requestAnimationFrame(() => { centerOn(viewport, svgEl, nowPt.y, false); centerX(viewport, svgEl, nowPt.x); updateActiveRegions(); });
      save();
    }
    showDetail(st.cur.id, false);
    refreshFriends();
    startLoops();
  }

  /* ---------- หยุด Animation ของดินแดนที่อยู่นอกจอ (ประหยัดแบต/ไม่ร้อน) ---------- */
  let scrollRaf = 0;
  function onViewportScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateActiveRegions(); });
  }
  function updateActiveRegions() {
    if (!state || !state.svgEl.isConnected) return;
    const { viewport, svgEl } = state;
    const scale = svgEl.getBoundingClientRect().height / svgEl.viewBox.baseVal.height;
    if (!scale) return;
    const top = viewport.scrollTop / scale - 120;
    const bottom = (viewport.scrollTop + viewport.clientHeight) / scale + 120;
    svgEl.querySelectorAll('.rkm-region').forEach((g) => {
      const on = Number(g.dataset.y1) >= top && Number(g.dataset.y0) <= bottom;
      g.classList.toggle('rkm-off', !on);
    });
  }

  /* ---------- เพื่อนบนแผนที่ (ข้อมูลจริงจากเซิร์ฟเวอร์ · เคารพการตั้งค่าซ่อนแรงค์ของแต่ละคน) ---------- */
  let friendsBusy = false;
  async function refreshFriends() {
    if (!state || friendsBusy || !state.opts.loadFriends) return;
    friendsBusy = true;
    const mine = state;
    try {
      const d = await state.opts.loadFriends();
      if (state !== mine) return;
      state.friends = d.friends || [];
      renderFriends();
    } catch (_) { /* แผนที่ยังใช้ได้ แค่ไม่มีเพื่อน */ } finally { friendsBusy = false; }
  }
  const FR_R = 13;
  function friendAvatar(f, x, y, r = FR_R) {
    const clip = `rkm-fc-${f.id}-${Math.round(x)}`;
    const pic = f.avatarImage
      ? `<clipPath id="${clip}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${r - 1.5}"/></clipPath><image href="${esc(f.avatarImage)}" x="${f1(x - r)}" y="${f1(y - r)}" width="${2 * r}" height="${2 * r}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
      : `<svg x="${f1(x - r + 1.5)}" y="${f1(y - r + 1.5)}" width="${2 * r - 3}" height="${2 * r - 3}" viewBox="0 0 64 64"><use href="/assets/avatars/avatars.svg#av-${esc(G.AVATAR_IDS.includes(f.avatar) ? f.avatar : 'fox')}"></use></svg>`;
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#FFFFFF" stroke="#5B8DEF" stroke-width="2.5"/>${pic}`;
  }
  function renderFriends() {
    if (!state) return;
    const layer = state.svgEl.querySelector('#rkm-friends');
    const groups = new Map();
    state.friends.forEach((f) => {
      const k = `${f.league}|${f.divisionIndex}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    });
    let html = '';
    groups.forEach((list, k) => {
      const [league, div] = k.split('|');
      const wp = state.wps.find((w) => w.kind === 'check' && w.league === league && w.division === Number(div))
        || state.wps.find((w) => w.kind === 'emblem' && w.league === league);
      if (!wp) return;
      // กลุ่มเพื่อนอยู่ด้านข้างของ Checkpoint (ฝั่งตรงข้ามกับตัวเราที่ยืนบนเส้นทาง) — ไม่ทับกัน
      const out = wp.x < 200 ? -1 : 1;
      const x0 = wp.x + out * 36;
      const shown = list.length > 3 ? list.slice(0, 2) : list;
      const more = list.length - shown.length;
      const step = 2 * FR_R - 4;
      const names = list.map((f) => f.name).join(', ');
      let inner = '';
      shown.forEach((f, i) => { inner += friendAvatar(f, x0 + out * i * step, wp.y); });
      if (more > 0) {
        const cx = x0 + out * shown.length * step;
        inner += `<circle cx="${f1(cx)}" cy="${f1(wp.y)}" r="${FR_R}" fill="#1F2340" stroke="#FFFFFF" stroke-width="2"/><text x="${f1(cx)}" y="${f1(wp.y + 4)}" text-anchor="middle" class="rkm-t-more">+${more}</text>`;
      }
      if (list.length === 1) {
        const nm = list[0].name.length > 10 ? `${list[0].name.slice(0, 9)}…` : list[0].name;
        const w = Math.max(44, nm.length * 7 + 14);
        const lx = x0 + out * (FR_R + 4 + w / 2);
        inner += `<rect x="${f1(lx - w / 2)}" y="${f1(wp.y - 9)}" width="${f1(w)}" height="18" rx="9" fill="#1F2340" opacity=".85"/><text x="${f1(lx)}" y="${f1(wp.y + 4)}" text-anchor="middle" class="rkm-t-friend">${esc(nm)}</text>`;
      }
      html += `<g class="rkm-fgroup" role="button" tabindex="0" data-fgroup="${esc(k)}" aria-label="${esc(`เพื่อน ${list.length} คนที่แรงค์นี้: ${names}`)}">${inner}</g>`;
    });
    layer.innerHTML = html;
  }
  function showFriendGroup(k) {
    const list = state.friends.filter((f) => `${f.league}|${f.divisionIndex}` === k);
    if (!list.length) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    const l = state.opts.cfg.leagues.find((x) => x.id === list[0].league);
    ov.innerHTML = `<div class="modal-card rkm-sheet rkm-fsheet" style="${state.opts.leagueVars(l)}">
      <h2 class="vb-sheet-title">${list.length === 1 ? 'เพื่อนของคุณ' : `เพื่อน ${list.length} คน`}</h2>
      <ul class="rkm-flist">${list.map((f) => `<li>${G.avatar(f.avatar, f.avatarImage, 'rkm-flist-av')}
        <span><b>${esc(f.name)}</b><small>${esc(f.label)}</small></span>${state.opts.badge(f.league, 'rk-badge-sm')}</li>`).join('')}</ul></div>`;
    document.body.appendChild(ov);
    window.EQApp.makeDialog(ov, { label: 'เพื่อนในแรงค์นี้', variant: 'sheet' });
  }
  function applyFilter(f) {
    if (!state) return;
    state.filter = f;
    state.svgEl.classList.toggle('rkm-only-me', f === 'me');
    state.svgEl.classList.toggle('rkm-only-friends', f === 'friends');
    state.root.querySelectorAll('[data-rkm-filter]').forEach((b) => {
      const on = b.dataset.rkmFilter === f; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
    });
    try { localStorage.setItem(FILTER_KEY, f); } catch (_) { /* - */ }
  }
  async function loadPrivacy() {
    const box = state && state.root.querySelector('#rkm-privacy');
    if (!box || !state.opts.privacy) return;
    try { const d = await state.opts.privacy(); box.checked = Boolean(d.hideFromFriends); box.disabled = false; } catch (_) { /* - */ }
  }

  /* ---------- อัปเดตอัตโนมัติขณะเปิดแผนที่ + เครื่องมือวัด Frame time (นักพัฒนาเท่านั้น ไม่แสดงบนจอ) ---------- */
  let pollTimer = null;
  function startLoops() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!state || !state.root.isConnected || !state.root.offsetParent) { clearInterval(pollTimer); pollTimer = null; return; }
      if (!document.hidden) refreshFriends();
    }, 60000);
    let debug = false;
    try { debug = localStorage.getItem('eq_debug_fps') === '1'; } catch (_) { debug = false; }
    if (debug) debugFrames();
  }
  function debugFrames() {
    let last = performance.now(); let t = []; let since = last;
    const loop = (now) => {
      if (!state || !state.root.offsetParent) return;
      t.push(now - last); last = now;
      if (now - since > 5000) {
        t.sort((a, b) => a - b);
        // eslint-disable-next-line no-console
        console.log(`[rankmap] frames ${t.length} · avg ${(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1)}ms · p95 ${t[Math.floor(t.length * 0.95)].toFixed(1)}ms`);
        t = []; since = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function onFriendRank() { clearTimeout(onFriendRank.t); onFriendRank.t = setTimeout(refreshFriends, 400); }

  function celebrate(l, opts) {
    if (document.querySelector('.rkm-unlock')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rkm-unlock" style="${opts.leagueVars(l)}">
      <p class="rkm-unlock-kicker">ปลดล็อกดินแดนใหม่</p>
      <div class="rkm-unlock-badge">${opts.badge(l.id, 'rk-badge-xl')}</div>
      <h2>${esc(l.name)}</h2><p class="rkm-unlock-region">${esc(l.region)}</p>
      <p>${esc(l.motto)}</p>
      <button class="btn btn-primary btn-block" type="button" data-close>ออกสำรวจต่อ</button></div>`;
    document.body.appendChild(ov);
    window.EQApp.makeDialog(ov, { label: `ปลดล็อก ${l.name}` });
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
    if (window.EQAudio) { window.EQAudio.sfx('promotion'); setTimeout(() => window.EQAudio.sfx('badge_unlock'), 300); }
  }

  /** ความสูงของช่องแผนที่ = พื้นที่ที่เหลือบนจอ (ไม่ทับเมนูล่าง) */
  function fitViewport() {
    if (!state) return;
    const { viewport } = state;
    const nav = document.getElementById('bottom-nav');
    const navH = nav && !nav.classList.contains('hidden') && window.innerWidth < 1024 ? nav.getBoundingClientRect().height : 0;
    const top = viewport.getBoundingClientRect().top + window.scrollY;
    const h = Math.max(360, window.innerHeight - Math.min(top, 260) - navH - 16);
    viewport.style.height = `${Math.round(h)}px`;
  }
  /*
    ซูม = ความกว้างของ "แกนแผนที่" (400 หน่วย) บนจอ · จอกว้างกว่านั้น -> ขยาย viewBox ไปสองข้าง (ฉากสะท้อน) ให้เต็มพื้นที่
    จอแคบหรือซูมเข้า -> แกนแผนที่กว้างกว่าจอ เลื่อนซ้าย-ขวาได้
  */
  function applyZoom(z, keepCenter = true) {
    const { viewport, canvas, svgEl } = state;
    const vb = svgEl.viewBox.baseVal;
    const before = keepCenter && vb ? viewport.scrollTop / Math.max(1, canvas.scrollHeight) + (viewport.clientHeight / 2) / Math.max(1, canvas.scrollHeight) : null;
    state.zoom = Math.max(0, Math.min(ZOOMS.length - 1, z));
    const vw = viewport.clientWidth;
    const core = Math.min(vw, vw >= 700 ? 470 : 560) * ZOOMS[state.zoom];
    const scale = core / W;
    const ext = vw > core ? Math.min(W, (vw / scale - W) / 2) : 0;
    const total = svgEl.viewBox.baseVal.height;
    svgEl.setAttribute('viewBox', `${f1(-ext)} 0 ${f1(W + 2 * ext)} ${total}`);
    svgEl.classList.toggle('rkm-wide', ext > 1);   // ฉากสะท้อนสองข้างวาดเฉพาะจอกว้าง (มือถือไม่เสียแรงเครื่อง)
    canvas.style.width = `${Math.round((W + 2 * ext) * scale)}px`;
    state.root.querySelectorAll('[data-rkm-zoom]').forEach((b) => {
      b.disabled = (b.dataset.rkmZoom === '1' && state.zoom === ZOOMS.length - 1) || (b.dataset.rkmZoom === '-1' && state.zoom === 0);
    });
    if (keepCenter && before !== null) {
      viewport.scrollTop = before * canvas.scrollHeight - viewport.clientHeight / 2;
      viewport.scrollLeft = (canvas.scrollWidth - viewport.clientWidth) / 2;
    }
  }

  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  function showDetail(leagueId, asSheet = true) {
    if (!state) return;
    const { opts, st } = state;
    const l = opts.cfg.leagues.find((x) => x.id === leagueId);
    if (!l) return;
    const html = detailHtml(l, opts.cfg, st, opts.me, opts);
    state.root.querySelectorAll('.rkm-selected').forEach((n) => n.classList.remove('rkm-selected'));
    state.svgEl.querySelectorAll(`.rkm-emblem[data-node="${leagueId}"]`).forEach((n) => n.classList.add('rkm-selected'));
    if (wide()) {
      const panel = state.root.querySelector('#rkm-panel');
      panel.innerHTML = html;
      G.iconize && G.iconize(panel);
      return;
    }
    if (!asSheet) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-card rkm-sheet">${html}</div>`;
    document.body.appendChild(ov);
    window.EQApp.makeDialog(ov, { label: `รายละเอียด ${l.name}`, variant: 'sheet' });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rkm-act]');
      if (b) { ov.remove(); act(b.dataset.rkmAct); }
    });
  }
  function act(kind) {
    if (!state) return;
    const { opts } = state;
    if (kind === 'resume') opts.onResume();
    else opts.onStart(kind);
  }

  /* ---------- เหตุการณ์ ---------- */
  document.addEventListener('click', (e) => {
    if (!state || !state.root.isConnected) return;
    const inMap = e.target.closest('#screen-ranked-journey');
    if (!inMap) return;
    const fg = e.target.closest('[data-fgroup]');
    if (fg && state.svgEl.contains(fg)) { showFriendGroup(fg.dataset.fgroup); return; }
    const node = e.target.closest('[data-node]');
    if (node && state.svgEl.contains(node)) { showDetail(node.dataset.node, true); return; }
    const fl = e.target.closest('[data-rkm-filter]');
    if (fl) { applyFilter(fl.dataset.rkmFilter); return; }
    const z = e.target.closest('[data-rkm-zoom]');
    if (z) { applyZoom(state.zoom + Number(z.dataset.rkmZoom)); return; }
    if (e.target.closest('[data-rkm-home]')) {
      const len = positionLen(state.lens, state.wps, state.st);
      const pt = state.routeEl.getPointAtLength(len);
      centerOn(state.viewport, state.svgEl, pt.y, true);
      centerX(state.viewport, state.svgEl, pt.x);
      showDetail(state.st.cur.id, false);
      return;
    }
    const a = e.target.closest('#rkm-panel [data-rkm-act]');
    if (a) act(a.dataset.rkmAct);
  });
  document.addEventListener('change', async (e) => {
    if (!state || e.target.id !== 'rkm-privacy') return;
    const box = e.target;
    box.disabled = true;
    try {
      const d = await state.opts.setPrivacy(box.checked);
      box.checked = d.hideFromFriends;
      window.EQApp.toast(d.hideFromFriends ? 'ซ่อนแรงค์ของคุณจากเพื่อนแล้ว' : 'เพื่อนเห็นแรงค์ของคุณบนแผนที่แล้ว', 'success');
    } catch (err) { box.checked = !box.checked; window.EQApp.toast(err.message, 'error'); } finally { box.disabled = false; }
  });
  document.addEventListener('keydown', (e) => {
    if (!state || (e.key !== 'Enter' && e.key !== ' ')) return;
    const fg = e.target.closest && e.target.closest('[data-fgroup]');
    if (fg && state.svgEl.contains(fg)) { e.preventDefault(); showFriendGroup(fg.dataset.fgroup); return; }
    const node = e.target.closest && e.target.closest('[data-node]');
    if (node && state.svgEl.contains(node)) { e.preventDefault(); showDetail(node.dataset.node, true); }
  });
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (state && state.root.isConnected && state.root.offsetParent) { fitViewport(); applyZoom(state.zoom); } }, 120);
  });

  window.EQRankMap = { render, onFriendRank, _layout: layout, _stateOf: stateOf };
})();
