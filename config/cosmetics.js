/*
  v1.21.0 ของตกแต่ง: กรอบโปรไฟล์ (pframe) + กรอบแชท (cframe) — ค่ากลางที่เดียว
  - ราคา/เงื่อนไขอ่านจากไฟล์นี้ฝั่งเซิร์ฟเวอร์เท่านั้น (หน้าเว็บส่งราคาเองไม่ได้)
  - source 'shop'  = ซื้อด้วย Coin · source 'level' = ได้จากรางวัลทุก 10 เลเวลเท่านั้น (ซื้อไม่ได้)
  - เป็นของตกแต่งล้วน: ไม่เพิ่ม EXP / คะแนน / พลังใด ๆ
  - ลวดลายออกแบบเองทั้งหมด (สร้างเป็น SVG ด้วย scripts/build-frames.js · กรอบแชทเป็น CSS ใน public/css/cosmetics.css)

  ราคาเทียบกับรายได้ Coin (~300–450/สัปดาห์ ดู config/coinRewards.js):
    common 120 (~2 วัน) · rare 300 (~1 สัปดาห์) · epic 700 (~2 สัปดาห์) · legendary 1500 (~1 เดือน)
*/
const PRICE = { common: 120, rare: 300, epic: 700, legendary: 1500 };
const RARITY_TH = { common: 'ทั่วไป', rare: 'หายาก', epic: 'มหากาพย์', legendary: 'ตำนาน', level: 'รางวัลเลเวล' };

/* ring: สีวง (ไล่เฉด) · orn: ลวดลายบนวง { t: dot|star|petal|leaf|wave|ray|gem|spark|crown, n: จำนวน, c: สี } · badge: ตัวเลขเลเวลที่ฐานกรอบ */
const PROFILE_FRAMES = [
  // ---- ร้านค้า: คอลเลกชันน่ารัก (v1.21.0 ตามคำขอ "อยากได้กรอบแบบน่ารักๆ" · "เอาแทนอันเก่า") — สไตล์สติกเกอร์พาสเทล ออกแบบเอง ไม่ใช่ตัวละครของใคร ----
  { id: 'pf_cute_cat', nameTh: 'หูแมวเหมียว', rarity: 'common', col: 'cute' },
  { id: 'pf_cute_bunny', nameTh: 'กระต่ายน้อย', rarity: 'common', col: 'cute' },
  { id: 'pf_cute_bear', nameTh: 'หมีขนนุ่ม', rarity: 'rare', col: 'cute' },
  { id: 'pf_cute_candy', nameTh: 'ลูกกวาดหวานใจ', rarity: 'rare', col: 'cute' },
  { id: 'pf_cute_cloud', nameTh: 'ปุยเมฆสายรุ้ง', rarity: 'rare', col: 'cute' },
  { id: 'pf_cute_berry', nameTh: 'สตรอว์เบอร์รี', rarity: 'rare', col: 'cute' },
  { id: 'pf_cute_heart', nameTh: 'หัวใจโบว์ชมพู', rarity: 'epic', col: 'cute' },
  { id: 'pf_cute_chick', nameTh: 'ลูกเจี๊ยบ', rarity: 'epic', col: 'cute' },
  // ---- รางวัลเลเวล (ซื้อไม่ได้) ----
  { id: 'pf_lv10', nameTh: 'ทองแดง Lv.10', level: 10, ring: ['#F0B48A', '#9A5B34'], w: 7, orn: { t: 'dot', n: 6, c: '#FFE4D2' }, badge: '10' },
  { id: 'pf_lv20', nameTh: 'เงิน Lv.20', level: 20, ring: ['#F1F5F9', '#94A3B8', '#E2E8F0'], w: 7, orn: { t: 'gem', n: 4, c: '#FFFFFF', s: '#64748B' }, badge: '20' },
  { id: 'pf_lv30', nameTh: 'ทอง Lv.30', level: 30, ring: ['#FDE68A', '#CA8A04'], w: 7, orn: { t: 'star', n: 4, c: '#FFFBEB' }, badge: '30' },
  { id: 'pf_lv40', nameTh: 'มรกต Lv.40', level: 40, ring: ['#6EE7B7', '#047857'], w: 8, orn: { t: 'gem', n: 6, c: '#D1FAE5', s: '#065F46' }, badge: '40' },
  { id: 'pf_lv50', nameTh: 'ไพลิน Lv.50', level: 50, ring: ['#93C5FD', '#1E40AF'], w: 8, orn: { t: 'leaf', n: 12, c: '#DBEAFE', s: '#1E3A8A' }, badge: '50' },
  { id: 'pf_lv60', nameTh: 'ทับทิม Lv.60', level: 60, ring: ['#FCA5A5', '#B91C1C'], w: 8, orn: { t: 'gem', n: 8, c: '#FEE2E2', s: '#7F1D1D' }, badge: '60' },
  { id: 'pf_lv70', nameTh: 'อเมทิสต์ Lv.70', level: 70, ring: ['#D8B4FE', '#7E22CE'], w: 8, orn: { t: 'spark', n: 8, c: '#FAF5FF' }, badge: '70' },
  { id: 'pf_lv80', nameTh: 'เพชร Lv.80', level: 80, ring: ['#A5F3FC', '#0E7490', '#E0F2FE'], w: 8, orn: { t: 'gem', n: 10, c: '#ECFEFF', s: '#155E75' }, badge: '80' },
  { id: 'pf_lv90', nameTh: 'นิลทอง Lv.90', level: 90, ring: ['#334155', '#0F172A'], w: 9, orn: { t: 'ray', n: 16, c: '#FCD34D', s: '#92400E' }, badge: '90' },
  { id: 'pf_lv100', nameTh: 'ตำนาน Lv.100', level: 100, ring: ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA'], w: 9, orn: { t: 'crown', n: 1, c: '#FDE047', s: '#A16207' }, badge: '100' },
];

/* กรอบแชท: สีขอบไล่เฉด + สีพื้น (โทนอ่อน) + ลายมุมขวาบน · CSS อยู่ใน public/css/cosmetics.css (สร้างจากรายการนี้ด้วย scripts/build-frames.js) */
const CHAT_FRAMES = [
  // ---- คอลเลกชันน่ารัก ----
  { id: 'cf_cute_candy', nameTh: 'ลูกกวาดหวานใจ', rarity: 'common', col: 'cute', ring: ['#F9A8D4', '#FFFFFF'], ringCss: 'repeating-linear-gradient(135deg, #F472B6 0 6px, #FFFFFF 6px 12px)', tint: '#EC4899', orn: 'heart' },
  { id: 'cf_cute_cloud', nameTh: 'ปุยเมฆฟ้าใส', rarity: 'rare', col: 'cute', ring: ['#BAE6FD', '#C4B5FD', '#FBCFE8'], tint: '#38BDF8', orn: 'cloud' },
  { id: 'cf_cute_paw', nameTh: 'อุ้งเท้าเหมียว', rarity: 'rare', col: 'cute', ring: ['#FED7AA', '#FDA4AF'], tint: '#FB923C', orn: 'paw' },
  { id: 'cf_cute_mint', nameTh: 'มิ้นต์ช็อกชิป', rarity: 'common', col: 'cute', ring: ['#A7F3D0', '#5EEAD4'], ringCss: 'radial-gradient(circle at 20% 30%, #7C4A2D 0 1.6px, transparent 2px) 0 0 / 12px 12px, linear-gradient(135deg, #A7F3D0, #5EEAD4)', tint: '#14B8A6', orn: 'scoop' },
  { id: 'cf_cute_star', nameTh: 'ดาวมะนาวฟรุ้งฟริ้ง', rarity: 'epic', col: 'cute', ring: ['#FEF08A', '#FDE047', '#C4B5FD'], tint: '#EAB308', orn: 'star' },
  { id: 'cf_cute_berry', nameTh: 'สตรอว์เบอร์รีนม', rarity: 'epic', col: 'cute', ring: ['#FECDD3', '#FB7185', '#FFFFFF'], tint: '#F43F5E', orn: 'berry' },
  // ---- รางวัลเลเวล ----
  { id: 'cf_lv20', nameTh: 'เงิน Lv.20', level: 20, ring: ['#E2E8F0', '#94A3B8'], tint: '#64748B', orn: 'gem' },
  { id: 'cf_lv40', nameTh: 'มรกต Lv.40', level: 40, ring: ['#6EE7B7', '#047857'], tint: '#059669', orn: 'leaf' },
  { id: 'cf_lv60', nameTh: 'ทับทิม Lv.60', level: 60, ring: ['#FCA5A5', '#B91C1C'], tint: '#DC2626', orn: 'gem' },
  { id: 'cf_lv80', nameTh: 'เพชร Lv.80', level: 80, ring: ['#A5F3FC', '#0E7490'], tint: '#0891B2', orn: 'spark' },
  { id: 'cf_lv100', nameTh: 'ตำนาน Lv.100', level: 100, ring: ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA'], tint: '#8B5CF6', orn: 'crown' },
];

/* รางวัลทุก 10 เลเวล — เลเวล 10–100 ได้ Coin + กรอบเฉพาะเลเวล · เกิน 100 ได้ Coin ทุก 10 เลเวล (ไม่มีกรอบเพิ่ม) */
const LEVEL_COINS = { 10: 100, 20: 150, 30: 200, 40: 250, 50: 300, 60: 350, 70: 400, 80: 450, 90: 500, 100: 600 };
const LEVEL_COINS_AFTER_100 = 600;
const LEVEL_STEP = 10;

const ALL = [
  ...PROFILE_FRAMES.map((f) => ({ ...f, kind: 'pframe' })),
  ...CHAT_FRAMES.map((f) => ({ ...f, kind: 'cframe' })),
].map((f) => ({ ...f, source: f.level ? 'level' : 'shop', price: f.level ? null : PRICE[f.rarity], rarity: f.level ? 'level' : f.rarity }));
const BY_ID = Object.fromEntries(ALL.map((f) => [f.id, f]));

/** รางวัลของเลเวล (คูณ 10 เท่านั้น) */
function rewardFor(level) {
  if (!(Number.isInteger(level) && level >= LEVEL_STEP && level % LEVEL_STEP === 0)) return null;
  const coins = LEVEL_COINS[level] || LEVEL_COINS_AFTER_100;
  const items = ALL.filter((f) => f.level === level).map((f) => f.id);
  return { level, coins, items };
}

module.exports = { PRICE, RARITY_TH, PROFILE_FRAMES, CHAT_FRAMES, ALL, BY_ID, LEVEL_STEP, LEVEL_COINS, LEVEL_COINS_AFTER_100, rewardFor };
