/*
  v1.18.0 สร้างภาพเวกเตอร์ของ Coin ใหม่ + ตรา Streak + เปลวไฟ Streak (วาดเองทั้งหมด ไม่ใช้ภาพจากที่อื่น)
    node scripts/build-streak-coin-art.js
  ผลลัพธ์ (ใช้ผ่าน <img> — ไฟล์แยก ไม่ชน id ของ gradient ในหน้าเว็บ · แคชได้):
    public/assets/coin/coin.svg      เหรียญรายละเอียดเต็ม (≥ 32px: กระเป๋า Coin, ป๊อปอัป +Coin)
    public/assets/coin/coin-sm.svg   เหรียญแบบเรียบ อ่านชัดที่ 14–24px (ชิป/ราคา)
    public/assets/streak/flame.svg · flame-off.svg
    public/assets/streak/badge-<วัน>.svg (3/7/14/30/60/100/365)
*/
const fs = require('fs');
const path = require('path');
const { MILESTONES } = require('../config/streak');

const ROOT = path.join(__dirname, '..', 'public', 'assets');
const out = (rel, svg) => {
  const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, svg.replace(/\n\s*/g, '\n').trim() + '\n'); console.log('เขียน', rel, svg.length, 'bytes');
};

/* ---------------- เหรียญ ----------------
   ทรงเหรียญทองหนา มีขอบนูน + ร่องขอบ (reeded edge) · หน้าเหรียญมีตรา "หนังสือเปิด + ดาวนำทาง" (เรียน + เควสต์)
   ตรานูนแบบปั๊ม: เงาเข้มด้านล่าง + ไฮไลต์ด้านบน · ประกายแสงทแยงมุม */
const star4 = (cx, cy, r, k = 0.34) => {
  const p = []; for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i - Math.PI / 2; const rr = i % 2 ? r * k : r;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  } return `M${p.join('L')}Z`;
};
const BOOK = 'M17.6 35.2c4.6-1.9 9.5-1.6 14.4 1.3 4.9-2.9 9.8-3.2 14.4-1.3v8.9c-4.6-1.7-9.5-1.3-14.4 1.5-4.9-2.8-9.8-3.2-14.4-1.5z';
const BOOK_SPINE = 'M32 36.5v8.6';
function coin({ detailed }) {
  const reeds = detailed ? Array.from({ length: 48 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 48; const x1 = 32 + Math.cos(a) * 27.2; const y1 = 31 + Math.sin(a) * 27.2;
    const x2 = 32 + Math.cos(a) * 29.2; const y2 = 31 + Math.sin(a) * 29.2;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join('') : '';
  const emblem = detailed
    ? `<g transform="translate(0 -4.2)">
        <g fill="#9A5B05" opacity=".55" transform="translate(0 1.1)"><path d="${star4(32, 23.2, 9)}"/><path d="${BOOK}"/></g>
        <path d="${star4(32, 23.2, 9)}" fill="url(#em)"/>
        <path d="${star4(32, 23.2, 9)}" fill="none" stroke="#FFF6CF" stroke-width=".7" stroke-linejoin="round" opacity=".9" clip-path="url(#top)"/>
        <path d="${BOOK}" fill="url(#em)"/>
        <path d="${BOOK}" fill="none" stroke="#FFF6CF" stroke-width=".7" stroke-linejoin="round" opacity=".85" clip-path="url(#top)"/>
        <path d="${BOOK_SPINE}" stroke="#A86506" stroke-width="1.3" stroke-linecap="round"/>
      </g>`
    : `<g fill="#9A5B05" opacity=".5" transform="translate(0 1.4)"><path d="${star4(32, 31, 15.5, 0.36)}"/></g>
       <path d="${star4(32, 31, 15.5, 0.36)}" fill="url(#em)"/>
       <path d="${star4(32, 31, 15.5, 0.36)}" fill="none" stroke="#FFF6CF" stroke-width="1.1" stroke-linejoin="round" clip-path="url(#top)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A6"/><stop offset=".42" stop-color="#F7C443"/><stop offset="1" stop-color="#C47F0C"/></linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8710A"/><stop offset="1" stop-color="#7A4304"/></linearGradient>
    <radialGradient id="face" cx=".4" cy=".32" r=".78"><stop offset="0" stop-color="#FFE57A"/><stop offset=".55" stop-color="#F8C437"/><stop offset="1" stop-color="#E39B14"/></radialGradient>
    <linearGradient id="em" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD24D"/><stop offset="1" stop-color="#D88B0B"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="top"><rect x="0" y="0" width="64" height="30"/></clipPath>
    <clipPath id="faceclip"><circle cx="32" cy="31" r="22.6"/></clipPath>
  </defs>
  <ellipse cx="32" cy="34.2" rx="29.6" ry="29.4" fill="url(#edge)"/>
  <circle cx="32" cy="31" r="29.6" fill="url(#rim)"/>
  ${detailed ? `<path d="${reeds}" stroke="#D99A1C" stroke-width=".9" opacity=".75"/>` : ''}
  <circle cx="32" cy="31" r="${detailed ? 24.6 : 24.4}" fill="#B9760B"/>
  <circle cx="32" cy="31.9" r="${detailed ? 23.4 : 23.3}" fill="#FFF0B0" opacity=".9"/>
  <circle cx="32" cy="31" r="${detailed ? 22.6 : 22.6}" fill="url(#face)"/>
  ${emblem}
  <g clip-path="url(#faceclip)"><path d="M6 22 L30 2 L40 6 L12 34Z" fill="url(#shine)" opacity="${detailed ? '.42' : '.5'}"/></g>
  <path d="M10.5 22.5a23 23 0 0 1 17-17.6" fill="none" stroke="#FFFBE6" stroke-width="${detailed ? 1.6 : 2.2}" stroke-linecap="round" opacity=".9"/>
  ${detailed ? `<path d="${star4(50.5, 12.5, 4.6, 0.22)}" fill="#fff" opacity=".95"/>` : ''}
</svg>`;
}
out('coin/coin.svg', coin({ detailed: true }));
out('coin/coin-sm.svg', coin({ detailed: false }));

/* ---------------- เปลวไฟ Streak ---------------- */
const FLAME = 'M32 4c2.2 8.6 10.4 13.1 14.9 20.8 4.6 7.9 4.2 17.4-1.4 24.2C41.6 53.9 36.9 58 32 58s-9.6-4.1-13.5-9c-5.6-6.8-6-16-1.6-23.6 1.6-2.8 3.6-4.9 5.6-6.9.2 4.2 1.6 7.8 4.4 9.6-.6-8.9 1.9-15.6 5.1-24.1z';
const INNER = 'M32 27.5c1.4 4.8 6.2 7.4 8.1 11.8 2.3 5.4-.3 11.6-5.4 13.9-1.7.8-3.6.8-5.4 0-5.1-2.3-7.6-8.5-5.3-13.9.7-1.6 1.7-2.8 2.8-3.9.4 2.1 1.4 3.9 3 4.7-.7-4.6.7-8.2 2.2-12.6z';
function flame(on) {
  const g = on ? ['#FFD34D', '#FF8A1F', '#E8380F'] : ['#D7DCE3', '#AAB2BE', '#7E8896'];
  const c = on ? ['#FFF6C9', '#FFC93A'] : ['#F4F6F8', '#C9CFD8'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".5" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>
  </defs>
  <path d="${FLAME}" fill="url(#f)"/>
  <path d="${INNER}" fill="url(#c)"/>
  <path d="M22.6 30.2c-2.6 4.4-3.2 9.6-1.5 14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="${on ? '.55' : '.45'}"/>
</svg>`;
}
out('streak/flame.svg', flame(true));
out('streak/flame-off.svg', flame(false));

/* ---------------- ตรา Milestone ----------------
   โล่หกเหลี่ยมมุมมน + วงแหวนด้านใน + เปลวไฟสีครีม + ริบบิ้นจำนวนวัน · สีตามระดับ */
const TIERS = {
  ember:    { a: '#FFB259', b: '#E85A1A', d: '#A63A0C', ring: '#FFE1B8', ribbon: '#B8410E', core: '#FFD34D' },
  bronze:   { a: '#EDB385', b: '#B36A33', d: '#7A431B', ring: '#F8DCC2', ribbon: '#8A4C1F', core: '#FFB86B' },
  silver:   { a: '#F3F6FA', b: '#A3AEC0', d: '#6B778B', ring: '#FFFFFF', ribbon: '#5D6A80', core: '#8FD3FF' },
  gold:     { a: '#FFE58A', b: '#E3A214', d: '#9C6406', ring: '#FFF4C7', ribbon: '#A86A06', core: '#FF8A1F' },
  sapphire: { a: '#8CC8FF', b: '#2563EB', d: '#1E3A8A', ring: '#D6ECFF', ribbon: '#1E40AF', core: '#7DF0FF' },
  amethyst: { a: '#D7B8FF', b: '#7C3AED', d: '#4C1D95', ring: '#EFE3FF', ribbon: '#5B21B6', core: '#FF9BE8' },
  legend:   { a: '#FF8A7A', b: '#C81E5B', d: '#6B0F3A', ring: '#FFE58A', ribbon: '#8A1144', core: '#FFE066' },
};
const HEX = 'M32 3.5c1.4 0 2.8.4 4 1.1l18.5 10.7c2.5 1.4 4 4.1 4 6.9v21.4c0 2.9-1.5 5.5-4 6.9L36 61.2c-2.5 1.4-5.5 1.4-8 0L9.5 50.5c-2.5-1.4-4-4.1-4-6.9V22.2c0-2.9 1.5-5.5 4-6.9L28 4.6c1.2-.7 2.6-1.1 4-1.1z';
function badge(m) {
  const t = TIERS[m.tier];
  const legend = m.tier === 'legend';
  const label = String(m.days);
  const fs2 = label.length >= 3 ? 9.6 : 11;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" width="64" height="72">
  <title>Streak ${m.days} วัน</title>
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>
    <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="${t.ring}"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    ${legend ? '<linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4B0"/><stop offset=".5" stop-color="#F5B82E"/><stop offset="1" stop-color="#FFF4B0"/></linearGradient>' : ''}
  </defs>
  <path d="${HEX}" fill="${t.d}" transform="translate(0 3)"/>
  <path d="${HEX}" fill="url(#b)"/>
  <path d="${HEX}" fill="none" stroke="${legend ? 'url(#gr)' : t.ring}" stroke-width="${legend ? 2.6 : 1.6}" transform="translate(32 32.5) scale(.86) translate(-32 -32.5)" opacity="${legend ? 1 : 0.75}"/>
  <circle cx="32" cy="29" r="17" fill="url(#glow)"/>
  <g transform="translate(32 29) scale(.46) translate(-32 -31)">
    <path d="${FLAME}" fill="${t.d}" opacity=".35" transform="translate(0 3)"/>
    <path d="${FLAME}" fill="url(#fl)"/>
    <path d="${INNER}" fill="${t.core}"/>
  </g>
  <path d="M9 50.5h46l-3.2 5.2 3.2 5.2H9l3.2-5.2z" fill="${t.d}" transform="translate(0 1.6)"/>
  <path d="M9 50.5h46l-3.2 5.2 3.2 5.2H9l3.2-5.2z" fill="${t.ribbon}"/>
  <path d="M9 50.5h46" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>
  <text x="32" y="59.1" text-anchor="middle" font-family="'Plus Jakarta Sans','Segoe UI',Roboto,Arial,sans-serif" font-weight="800" font-size="${fs2}" fill="#fff" letter-spacing=".2">${label}</text>
  ${legend ? `<path d="${star4(52, 10, 4, 0.25)}" fill="#FFF4B0"/><path d="${star4(11, 16, 2.8, 0.25)}" fill="#FFF4B0" opacity=".9"/>` : ''}
</svg>`;
}
for (const m of MILESTONES) out(`streak/badge-${m.days}.svg`, badge(m));
