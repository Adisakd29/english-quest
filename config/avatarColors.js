/*
  ระบบเปลี่ยนสีเครื่องแต่งกาย (Material Color Variants)
  - แต่ละชิ้นมี Material Region จาก Blender (scripts/avatar3d/blender/build_avatar3d.py → color_regions):
      primary / secondary / accent = ผ้าที่เปลี่ยนสีได้ เรียงตามพื้นที่ผิว
      ส่วนที่ไม่เปลี่ยนสีตามเสมอ: โลหะ ซิป กระดุม หมุด ตาไก่ ผิวหนัง ด้ายเย็บ พื้นยาง ลายพิมพ์/โลโก้ ไฟเรืองแสง
  - ผู้ใช้เลือกสีจาก Preset Palette หรือ Color Picker (เฉพาะชิ้นที่ allowPicker) และเลือกเนื้อผ้า (materialVariant) ตามชนิดเสื้อผ้า
  - บันทึกต่อ "ของที่เป็นเจ้าของ" (user_item_colors) + เก็บสำเนาใน Outfit Preset — ไม่ต้องซื้อชิ้นเดิมซ้ำหลายสี
  - ไม่มีผลต่อการเล่นใด ๆ (ไม่ใช่ Pay-to-Win) · ไม่เสีย Coin
*/

// ชนิดเครื่องแต่งกาย (Part 5) — ใช้แสดงในร้าน/ตู้เสื้อผ้า และกำหนดเนื้อผ้าที่เลือกได้
const GARMENT = {
  top_tee_blue: 'tshirt', top_tee_stripe: 'tshirt', top_tee_star: 'tshirt', top_oversize_graphic: 'tshirt', top_ringer_tee: 'tshirt', top_sport_jersey: 'tshirt',
  top_polo_green: 'polo',
  top_school_shirt: 'shirt', top_oxford_shirt: 'shirt', top_hawaiian_shirt: 'shirt', top_songkran_shirt: 'shirt', top_adventurer_tunic: 'shirt',
  top_sweater_knit: 'sweater', top_holiday_sweater: 'sweater', top_turtleneck: 'sweater', top_tech_zip: 'sweater', outer_cardigan: 'sweater',
  top_hoodie_gray: 'hoodie', top_hoodie_galaxy: 'hoodie', top_hw26_ghost_hoodie: 'hoodie',
  top_tank_summer: 'vest',
  outer_denim_jacket: 'jacket', outer_rank_jacket: 'jacket', outer_bomber: 'jacket', outer_varsity: 'jacket', outer_tech_shell: 'jacket', outer_puffer: 'jacket',
  outer_lab_coat: 'coat', outer_blazer: 'coat', outer_hw26_midnight: 'coat',
  bottom_shorts_khaki: 'shorts', bottom_board_shorts: 'shorts',
  bottom_skirt_pleated: 'skirt', bottom_skirt_plaid: 'skirt',
};
const SLOT_GARMENT = { bottom: 'pants', shoes: 'shoes', hat: 'hat', back: 'bag', accessory: 'accessory' };
const GARMENT_TH = {
  tshirt: 'เสื้อยืด', polo: 'โปโล', shirt: 'เชิ้ต', sweater: 'สเวตเตอร์', hoodie: 'ฮู้ดดี้', vest: 'เสื้อกล้าม', jacket: 'แจ็กเก็ต', coat: 'โค้ท',
  pants: 'กางเกงขายาว', shorts: 'กางเกงขาสั้น', skirt: 'กระโปรง', shoes: 'รองเท้า', hat: 'หมวก', bag: 'กระเป๋า/ของบนหลัง', accessory: 'เครื่องประดับ',
};

// เนื้อผ้า (PBR): ลาย normal map + ความหยาบผิว — runtime: public/js/avatar3d.js (FABRIC_H / VARIANT)
const VARIANTS = {
  cotton: { th: 'ผ้าฝ้าย', fabric: 'weave', rough: 0.85 },
  polyester: { th: 'โพลีเอสเตอร์', fabric: 'poly', rough: 0.55 },
  pique: { th: 'ผ้าปิเก้', fabric: 'mesh', rough: 0.8 },
  denim: { th: 'ยีนส์', fabric: 'twill', rough: 0.8 },
  knit: { th: 'ไหมพรม', fabric: 'knit', rough: 0.95 },
  fleece: { th: 'ฟลีซ', fabric: 'fleece', rough: 0.95 },
  leather: { th: 'หนัง', fabric: 'leather', rough: 0.42 },
  nylon: { th: 'ไนลอน', fabric: 'nylon', rough: 0.45 },
  wool: { th: 'ขนสัตว์', fabric: 'twill', rough: 0.9 },
  corduroy: { th: 'ลูกฟูก', fabric: 'corduroy', rough: 0.9 },
  canvas: { th: 'ผ้าใบ', fabric: 'canvas', rough: 0.85 },
  mesh: { th: 'ผ้าตาข่าย', fabric: 'mesh', rough: 0.7 },
};
const GARMENT_VARIANTS = {
  tshirt: ['cotton', 'polyester'], polo: ['pique', 'cotton'], shirt: ['cotton', 'denim'], sweater: ['knit', 'fleece'], hoodie: ['fleece', 'cotton'],
  vest: ['cotton', 'polyester'], jacket: ['denim', 'leather', 'nylon'], coat: ['wool', 'cotton'], pants: ['denim', 'cotton', 'corduroy'],
  shorts: ['cotton', 'denim'], skirt: ['cotton', 'denim'], shoes: ['leather', 'canvas', 'mesh'],
};

// ชุดสีสำเร็จรูป (อ่านง่ายบนตัวละคร · ผ่านความต่างกับพื้นหลังทั้งโหมดสว่าง/มืด)
const PALETTE = [
  '#f4f4f2', '#c9ccd3', '#5b6170', '#23252d', '#d94848', '#f08a3c', '#f2c53d', '#7bbf55',
  '#2f9e6e', '#3fb4c9', '#3f78d9', '#2d3a74', '#8a5cd6', '#e46aa8', '#9a6b48', '#d9c3a0',
];

const COLOR_SLOTS = new Set(['top', 'outerwear', 'bottom', 'shoes', 'hat', 'back', 'accessory']);
const NO_COLOR = new Set(['top_hoodie_galaxy']);   // ไล่สีด้วย vertex color (ลายกาแล็กซี) — เปลี่ยนสีแล้วลายเพี้ยน
const HEX = /^#[0-9a-f]{6}$/;
const ROLES = ['primary', 'secondary', 'accent'];

// ลายผ้าเดิมของชิ้น (จาก Blender) → ชื่อเนื้อผ้า · ตัวแรกของรายการ = เนื้อผ้าเดิม ("(เดิม)" ในหน้าแต่งตัว)
const FABRIC_VARIANT = { weave: 'cotton', canvas: 'canvas', twill: 'denim', knit: 'knit', rib: 'knit', fleece: 'fleece', leather: 'leather', nylon: 'nylon',
  poly: 'polyester', mesh: 'mesh', corduroy: 'corduroy', quilt: 'nylon' };
function variantsFor(garment, fabric) {
  const list = GARMENT_VARIANTS[garment] || [];
  if (!list.length) return [];
  let own = FABRIC_VARIANT[fabric] || list[0];
  if (garment === 'polo' && own === 'mesh') own = 'pique';
  if (garment === 'coat' && own === 'denim') own = 'wool';
  return [own, ...list.filter((v) => v !== own)];
}

function garmentOf(itemId, slot) { return GARMENT[itemId] || SLOT_GARMENT[slot] || null; }

/**
 * ข้อมูลเปลี่ยนสีของ item (แนบไปกับ model ในแคตตาล็อก)
 * @param {{id:string, slot:string, achievementId?:string}} item
 * @param {object} regions จาก models.json
 */
function colorInfo(item, regions) {
  const garment = garmentOf(item.id, item.slot);
  const regs = Object.fromEntries(ROLES.filter((r) => regions && regions[r]).map((r) => [r, { material: regions[r].material, default: regions[r].default }]));
  const colorable = COLOR_SLOTS.has(item.slot) && !NO_COLOR.has(item.id) && !item.achievementId && Object.keys(regs).length > 0;
  const variants = colorable ? variantsFor(garment, regions && regions.primary && regions.primary.fabric) : [];
  return { garment, garmentTh: garment ? GARMENT_TH[garment] : null, colorable, regions: colorable ? regs : {}, variants, allowPicker: colorable };
}

module.exports = { GARMENT, GARMENT_TH, VARIANTS, GARMENT_VARIANTS, PALETTE, HEX, ROLES, COLOR_SLOTS, colorInfo, garmentOf };
