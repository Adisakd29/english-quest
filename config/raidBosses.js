/*
  v1.27.0 World Raid Boss — Boss Definitions (ค่ากลางที่เดียว · Configurable)
  - เพิ่มบอสใหม่ = เพิ่มรายการใน FAMILIES + ไฟล์โมเดล/ฉาก (public/assets/raid/) แล้วตั้ง ready: true — ไม่ต้องแก้ Game Logic
  - ระดับบอสเพิ่มต่อเนื่องไม่สิ้นสุด: เลือกตระกูลตามช่วงเลเวล · ถ้าตระกูลของช่วงนั้นยังไม่มีโมเดล (ready: false)
    ใช้ตระกูลล่าสุดที่พร้อม (ไม่เปลี่ยนสีโมเดลเดิมแล้วอ้างว่าเป็นบอสใหม่)
  - ค่าที่ผู้ดูแลปรับได้ระหว่างเปิดใช้งาน (เพดาน HP · ตัวคูณ · คูลดาวน์ ฯลฯ) อยู่ในตาราง raid_settings (services/raid/settings.js)
  - รางวัลเป็นของตกแต่ง/EXP/Coin เท่านั้น — ไม่มีการซื้อดาเมจหรือพลังใด ๆ (ไม่ Pay-to-Win)
*/

// ตระกูลบอสตามช่วงเลเวล (from–to รวมปลาย · to = null = ไม่สิ้นสุด)
const FAMILIES = [
  {
    key: 'forest', from: 1, to: 4, ready: true,
    nameEn: 'Forest Guardian', nameTh: 'ผู้พิทักษ์พงไพร', element: 'nature', arena: 'forest', arenaTh: 'ป่าต้องมนตร์',
    baseHp: 15000, defense: 0, hpGrowth: 1.07,
    color: '#5FD38A', glow: '#B6F36A',
    attacks: { normal: 'Root Lash', special: 'Thorn Storm', ultimate: 'Wrath of the Grove' },
    shieldTh: 'เปลือกไม้ศักดิ์สิทธิ์',
    rewards: { defeat: [{ id: 'raid-badge:forest-raider', kind: 'badge', nameTh: 'Forest Raider Badge' }] },
    model: 'forest', fallbackArt: 'forest',
  },
  {
    key: 'inferno', from: 5, to: 9, ready: true,
    nameEn: 'Inferno Golem', nameTh: 'โกเลมเพลิงนรก', element: 'fire', arena: 'volcano', arenaTh: 'ป้อมภูเขาไฟ',
    baseHp: 21000, defense: 0.05, hpGrowth: 1.07,
    color: '#FF7A3D', glow: '#FFC24B',
    attacks: { normal: 'Magma Fist', special: 'Eruption Wave', ultimate: 'Core Meltdown' },
    shieldTh: 'เกราะหินหลอมเหลว',
    rewards: { defeat: [{ id: 'pf_raid_flame', kind: 'pframe', nameTh: 'Flame Hunter Frame' }] },
    model: 'inferno', fallbackArt: 'inferno',
  },
  {
    key: 'frost', from: 10, to: 14, ready: true,
    nameEn: 'Frost Dragon', nameTh: 'มังกรน้ำแข็ง', element: 'ice', arena: 'frost', arenaTh: 'วิหารมังกรน้ำแข็ง',
    baseHp: 30000, defense: 0.08, hpGrowth: 1.07,
    color: '#7FD8FF', glow: '#CFF4FF',
    attacks: { normal: 'Frost Claw', special: 'Glacier Breath', ultimate: 'Absolute Zero' },
    shieldTh: 'กำแพงผลึกน้ำแข็ง',
    rewards: { defeat: [
      { id: 'raid-title:ice-dragon-slayer', kind: 'title', nameTh: 'Ice Dragon Slayer' },
      { id: 'pf_raid_frost', kind: 'pframe', nameTh: 'Frost Crystal Frame' },
    ] },
    model: 'frost', fallbackArt: 'frost',
    // บอสพิเศษตามเทศกาล — ผิว/ฉาก/ท่าไม้ตาย เปลี่ยนเฉพาะช่วงเทศกาล (ระบบ Raid ไม่ผูกกับคริสต์มาส)
    skins: {
      christmas: {
        nameEn: 'Frost Dragon — The Christmas Blizzard', nameTh: 'มังกรน้ำแข็ง · พายุหิมะคริสต์มาส',
        arena: 'frost-xmas', arenaTh: 'ปราสาทน้ำแข็งคืนคริสต์มาส', model: 'frost-xmas',
        attacks: { normal: 'Frost Claw', special: 'Glacier Breath', ultimate: 'Christmas Blizzard' },
        rewards: { defeat: [{ id: 'raid-badge:xmas-blizzard-26', kind: 'badge', nameTh: 'Christmas Blizzard 2026' }] },
      },
    },
  },
  // ---- v1.27.1 (เจ้าของขอ 25 พ.ย. "บอสไม่ซ้ำกันเลยสักเลเวล") ครบ 10 ตัว: โมเดล + ฉากของตัวเองทุกตัว (scripts/raid/blender/bosses2.py · arenas2.py) ----
  { key: 'shadow', from: 15, to: 19, ready: true,   // v1.27.1 โมเดล + ฉากหอคอยเงา พร้อมแล้ว
    nameEn: 'Shadow Archmage', nameTh: 'จอมเวทเงามืด', element: 'shadow', arena: 'shadow-tower', arenaTh: 'หอคอยเงา', model: 'shadow', fallbackArt: 'shadow',
    baseHp: 40000, defense: 0.1, hpGrowth: 1.07, color: '#A78BFA', glow: '#E9D5FF',
    attacks: { normal: 'Hex Bolt', special: 'Void Rift', ultimate: 'Eclipse' }, shieldTh: 'ม่านเวทมืด',
    rewards: { defeat: [{ id: 'raid-badge:shadowbreaker', kind: 'badge', nameTh: 'Shadowbreaker Badge' }] } },
  { key: 'celestial', from: 20, to: 24, ready: true, model: 'celestial', fallbackArt: 'celestial', nameEn: 'Celestial Dragon', nameTh: 'มังกรสวรรค์', element: 'light', arena: 'celestial', arenaTh: 'ศาลาสวรรค์',
    baseHp: 52000, defense: 0.12, hpGrowth: 1.06, color: '#FDE68A', glow: '#FFFBEB',
    attacks: { normal: 'Star Fang', special: 'Nova Breath', ultimate: 'Heaven Fall' }, shieldTh: 'วงแหวนดารา',
    rewards: { defeat: [{ id: 'raid-badge:celestial-champion', kind: 'badge', nameTh: 'Celestial Champion' }] } },
  { key: 'titan', from: 25, to: 29, ready: true, model: 'titan', fallbackArt: 'titan', nameEn: 'Ancient Titan', nameTh: 'ไททันโบราณ', element: 'earth', arena: 'ruins', arenaTh: 'ซากเมืองโบราณ',
    baseHp: 65000, defense: 0.14, hpGrowth: 1.06, color: '#D6B98C', glow: '#FFF1D6',
    attacks: { normal: 'Quake Slam', special: 'Monolith Rain', ultimate: 'Titanfall' }, shieldTh: 'เกราะหินศิลา', rewards: { defeat: [{ id: 'raid-badge:titan-breaker', kind: 'badge', nameTh: 'Titan Breaker Badge' }] } },
  { key: 'leviathan', from: 30, to: 34, ready: true, model: 'leviathan', fallbackArt: 'leviathan', nameEn: 'Abyssal Leviathan', nameTh: 'เลวีอาธานใต้สมุทร', element: 'water', arena: 'abyss', arenaTh: 'มหาสมุทรลึก',
    baseHp: 80000, defense: 0.15, hpGrowth: 1.05, color: '#38BDF8', glow: '#BAE6FD',
    attacks: { normal: 'Tidal Bite', special: 'Maelstrom', ultimate: 'Abyssal Surge' }, shieldTh: 'ม่านน้ำวน', rewards: { defeat: [{ id: 'raid-badge:abyss-diver', kind: 'badge', nameTh: 'Abyss Diver Badge' }] } },
  { key: 'phoenix', from: 35, to: 39, ready: true, model: 'phoenix', fallbackArt: 'phoenix', nameEn: 'Eternal Phoenix', nameTh: 'ฟีนิกซ์นิรันดร์', element: 'fire', arena: 'flame-palace', arenaTh: 'วังเปลวไฟนิรันดร์',
    baseHp: 95000, defense: 0.16, hpGrowth: 1.05, color: '#FB923C', glow: '#FFEDD5',
    attacks: { normal: 'Ember Talon', special: 'Solar Flare', ultimate: 'Rebirth Inferno' }, shieldTh: 'ปีกเพลิง', rewards: { defeat: [{ id: 'raid-badge:phoenix-flame', kind: 'badge', nameTh: 'Phoenix Flame Badge' }] } },
  { key: 'void', from: 40, to: 49, ready: true, model: 'void', fallbackArt: 'void', nameEn: 'Void Emperor', nameTh: 'จักรพรรดิแห่งความว่างเปล่า', element: 'void', arena: 'void-throne', arenaTh: 'บัลลังก์ความว่าง',
    baseHp: 115000, defense: 0.18, hpGrowth: 1.04, color: '#818CF8', glow: '#E0E7FF',
    attacks: { normal: 'Null Strike', special: 'Singularity', ultimate: 'End of Words' }, shieldTh: 'ม่านว่างเปล่า', rewards: { defeat: [{ id: 'raid-badge:void-conqueror', kind: 'badge', nameTh: 'Void Conqueror Badge' }] } },
  { key: 'mythic', from: 50, to: null, ready: true, model: 'mythic', fallbackArt: 'mythic', nameEn: 'Mythic Ascension', nameTh: 'บอสตำนาน', element: 'mythic', arena: 'ascension', arenaTh: 'ยอดแห่งตำนาน',
    baseHp: 140000, defense: 0.2, hpGrowth: 1.03, color: '#F0ABFC', glow: '#FAE8FF',
    attacks: { normal: 'Mythic Strike', special: 'Ascension', ultimate: 'Legend Ends' }, shieldTh: 'เกราะตำนาน', rewards: { defeat: [{ id: 'raid-badge:mythic-legend', kind: 'badge', nameTh: 'Mythic Legend Badge' }] } },
];
const BY_KEY = Object.fromEntries(FAMILIES.map((f) => [f.key, f]));

// 3 Phase หลัก (สัดส่วน HP ที่เหลือ) — ประมวลผลที่เซิร์ฟเวอร์เท่านั้น
const PHASES = [
  { phase: 1, key: 'awakening', nameEn: 'Awakening', nameTh: 'ตื่นจากนิทรา', above: 0.70 },
  { phase: 2, key: 'enraged', nameEn: 'Enraged', nameTh: 'คลั่ง', above: 0.35 },
  { phase: 3, key: 'final', nameEn: 'Final Stand', nameTh: 'ยืนหยัดครั้งสุดท้าย', above: 0 },
];
function phaseFor(hp, maxHp) {
  if (!(maxHp > 0)) return 1;
  const r = hp / maxHp;
  return r > 0.70 ? 1 : r > 0.35 ? 2 : 3;
}

// ดาเมจพื้นฐานต่อคำตอบที่ถูกตามระดับคำถาม (ระดับคำถาม = ระดับของผู้เล่นจากผลวัดระดับ · เลือกเองไม่ได้)
// ส่วนต่างระหว่างระดับไม่มาก (A1 = 77% ของ C1) — ผู้เริ่มต้นยังช่วยทีมได้จริง แต่การตอบข้อยากคุ้มกว่าเล็กน้อย
const BASE_DAMAGE = { A1: 100, A2: 108, B1: 116, B2: 124, C1: 130, C2: 130 };
// ชนิดคำถาม: ข้อที่ใช้เวลาอ่านมากได้ดาเมจมากขึ้นเล็กน้อย
const TYPE_MULT = { vocab: 1, context: 1.05, grammar: 1.05, error: 1.1, reading: 1.2, listening: 1.2, spell: 1.3 };   // spell = Spelling Strike (สะกดเองยากกว่าเลือกตอบ)

const DAMAGE = {
  comboStep: 0.1, comboMax: 5,          // Knowledge Burst: +10% ต่อข้อที่ถูกติดกัน (สูงสุด +50%)
  critMult: 1.5, critFastShare: 0.35, critMinCombo: 2,   // Critical: ตอบถูกภายใน 35% ของเวลา และถูกติดกันมาแล้ว ≥ 2 ข้อ (ตรวจสอบได้ ไม่สุ่ม)
  shieldHpShare: 0.35,                  // ระหว่างมีโล่: ดาเมจเข้า HP แค่ 35% · ทุกคำตอบที่ถูกเติมความคืบหน้าทำลายโล่ 1
  teamMult: 1.3,                        // Team Resonance: หลังทีมทำลายโล่ ทุกคนได้ดาเมจ +30% ช่วงบอสมึน
  stunMs: 90 * 1000,
};

// ค่าเริ่มต้นที่ผู้ดูแลปรับได้ (ทับด้วย raid_settings.data)
const DEFAULT_SETTINGS = {
  enabled: true,
  hpCap: 2000000, hpFloor: 5000, hpMultiplier: 1,
  targetHours: 36,                      // เป้าเวลาที่ควรใช้ล้มบอส 1 ตัว (ใช้กับสถิติย้อนหลังจริง)
  cooldownMin: 10, prepareSec: 20,
  questionMode: 'spell',               // v1.27.1 (เจ้าของขอ 25 พ.ย.) spell = ทุกข้อพิมพ์คำอังกฤษจากความหมายไทย · mixed = ผสมทุกแบบ (เดิม)
  questionsPerRound: 40, roundsPerDay: 30,  // v1.27.1 รอบยาวได้จนพลังชีวิตหมด (สูงสุด 40 ข้อ/รอบ)
  playerHpOn: true,                     // v1.27.1 พลังชีวิตผู้เล่น: ตอบผิด/หมดเวลา = บอสตีกลับ · หมด = จบรอบ (ไม่เสีย Coin/EXP/ไอเทม/อันดับ)
  playerHp: 100, bossHit1: 20, bossHit2: 25, bossHit3: 30,   // แรงตีของบอสตาม Phase
  healEvery: 5, healAmount: 10,
  // v1.27.1 EXP ต่อการตีโดน (ตอบถูก + ทำดาเมจจริง) — เข้า EXP บัญชีกลาง (exp_log reason raid_hit) · มีเพดานต่อวันตามเวลาไทย กันฟาร์ม
  hitExp: 3, hitExpDailyCap: 150,
  // v1.27.1 ศัพท์ยากขึ้นตามเลเวลบอส (เจ้าของขอ 26 พ.ย.): ทุก wordLevelEvery เลเวล ศัพท์ขยับขึ้น 1 ระดับ CEFR (A1 → A2 → B1 → B2 → C1)
  //   ระดับรอบ = สูงกว่าระหว่าง "ระดับของผู้เล่น" กับ "ระดับของบอส" · wordStretchShare = สัดส่วนข้อระดับบอส (ที่เหลือต่ำกว่า 1 ระดับ ให้ผู้เริ่มต้นยังตีโดนได้)
  wordLevelEvery: 2, wordStretchShare: 0.7,
  // v1.27.1 บอสเก่งขึ้นทุกเลเวล: HP พื้นฐาน ×1.12/เลเวล · เกราะ +2%/เลเวล (สูงสุด 35%) · แรงตีผู้เล่น +5%/เลเวล (สูงสุด ×2)
  levelBaseHp: 20000, levelHpGrowth: 1.12, levelDefenseStep: 0.02, levelDefenseCap: 0.35, levelHitStep: 0.05, levelHitCap: 2,         // ตอบถูกติดกันทุก 5 ข้อ ฟื้นพลัง +10 (0 = ปิด)
  minAnswerMs: 1200, answerLimitMs: 30000, roundTtlMin: 20,
  minCorrectForReward: 5, claimDays: 14, rewardMultiplier: 1,
  seasonalSkin: 'auto',                 // auto = ใช้ผิวเทศกาลเมื่อเทศกาลเปิด · off = ไม่ใช้
  ultimateEverySec: 180,
  forcedFamily: null,
  families: {},                         // ทับค่าต่อตระกูล เช่น { forest: { baseHp: 12000 } }
};

// รางวัล (ไม่ต้องติด Top 10 — ทุกคนที่ผ่านเกณฑ์ได้รางวัลหลัก)
const REWARDS = {
  participation: { minCorrect: null, exp: 40, coin: 15, th: 'ร่วมต่อสู้' },            // minCorrect = settings.minCorrectForReward
  milestones: [
    { key: 'm20', minCorrect: 20, exp: 60, coin: 25, th: 'ตอบถูก 20 ข้อ' },
    { key: 'm50', minCorrect: 50, exp: 100, coin: 40, th: 'ตอบถูก 50 ข้อ' },
  ],
  defeat: { exp: 80, coin: 40, th: 'ร่วมล้มบอส' },                                        // + ของตกแต่งของตระกูล
  firstClear: { th: 'ล้มบอสตระกูลนี้ครั้งแรก' },                                           // ถ้วยรางวัล trophy:<family>
  rare: { minCorrect: 50, th: 'ผู้พิชิตแห่งศึก', idPrefix: 'raid-title:conqueror-' },        // ฉายาหายาก: ตอบถูก ≥ 50 ข้อในบอสที่ถูกล้ม
};

/** ตระกูลของเลเวล (ใช้ตระกูลที่ ready ล่าสุดถ้าช่วงนั้นยังไม่มีโมเดล) */
/* v1.27.1 (เจ้าของขอ 25 พ.ย.) แต่ละเลเวลเป็นบอสคนละตัว: วนตระกูลที่มีโมเดลพร้อม (ready) ตามลำดับทุกเลเวล
   Lv1 Forest → Lv2 Inferno → Lv3 Frost → Lv4 Shadow → Lv5 Forest (แข็งแกร่งขึ้น) … · เพิ่มโมเดลใหม่ (ready: true) = เข้าวงอัตโนมัติ
   ความแข็งแกร่ง (HP · เกราะ · แรงตี) คิดจากเลเวล ไม่ขึ้นกับตระกูล → เลเวลสูงขึ้น = เก่งขึ้นเสมอ */
function familyForLevel(level, forced = null) {
  if (forced && BY_KEY[forced] && BY_KEY[forced].ready) return BY_KEY[forced];
  const ready = FAMILIES.filter((f) => f.ready);
  if (!ready.length) return FAMILIES[0];
  return ready[(Math.max(1, Math.floor(level)) - 1) % ready.length];
}
/** v1.27.1 รอบวิวัฒน์: Lv1–10 = บอส 10 ตัวไม่ซ้ำ · Lv11+ วนกลับตัวแรกเป็น "ร่างวิวัฒน์" (บอกชัดว่าเป็นร่างวิวัฒน์ของตัวเดิม ไม่อ้างว่าเป็นบอสใหม่) */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function evolutionOf(level) {
  const n = FAMILIES.filter((f) => f.ready).length || 1;
  const e = Math.floor((Math.max(1, Math.floor(level)) - 1) / n) + 1;
  return { stage: e, roman: ROMAN[e] || String(e) };
}
/** v1.27.1 ระดับศัพท์ของบอสตามเลเวล (ใช้ระดับ CEFR จริงของคลังศัพท์ ไม่ได้เดา) */
const WORD_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
function bossWordLevel(level, s = DEFAULT_SETTINGS) {
  const every = Math.max(1, Math.floor(s.wordLevelEvery || 2));
  return WORD_LEVELS[Math.min(WORD_LEVELS.length - 1, Math.floor((Math.max(1, Math.floor(level)) - 1) / every))];
}
/** ระดับศัพท์ของรอบ: { top, low, share } — top = สูงกว่าระหว่างผู้เล่น/บอส · low = ต่ำกว่า top 1 ระดับ (ไม่ต่ำกว่าระดับผู้เล่น) */
function roundWordPlan(userCefr, level, s = DEFAULT_SETTINGS) {
  const u = Math.max(0, WORD_LEVELS.indexOf(userCefr === 'C2' ? 'C1' : userCefr));
  const b = WORD_LEVELS.indexOf(bossWordLevel(level, s));
  if (b <= u) return { top: WORD_LEVELS[u], low: null, share: 1, boss: WORD_LEVELS[b], user: WORD_LEVELS[u] };
  const lowIdx = Math.max(u, b - 1);
  return { top: WORD_LEVELS[b], low: lowIdx < b ? WORD_LEVELS[lowIdx] : null, share: Math.min(1, Math.max(0, s.wordStretchShare ?? 0.7)), boss: WORD_LEVELS[b], user: WORD_LEVELS[u] };
}
/** ความแข็งแกร่งตามเลเวล (ผู้ดูแลปรับได้ใน settings) */
function levelPower(level, s = DEFAULT_SETTINGS) {
  const L = Math.max(1, Math.floor(level)) - 1;
  return {
    hpBase: Math.round((s.levelBaseHp || 20000) * Math.pow(s.levelHpGrowth || 1.12, L)),
    defense: Math.min(s.levelDefenseCap ?? 0.35, (s.levelDefenseStep ?? 0.02) * L),
    hitMult: Math.min(s.levelHitCap || 2, 1 + (s.levelHitStep ?? 0.05) * L),
  };
}

/** ระดับรางวัลของเลเวล (เพิ่มทุก 5 เลเวล สูงสุด ×3) */
function rewardTier(level) { return Math.min(3, 1 + Math.floor((Math.max(1, level) - 1) / 5) * 0.25); }

module.exports = { FAMILIES, BY_KEY, PHASES, phaseFor, BASE_DAMAGE, TYPE_MULT, DAMAGE, DEFAULT_SETTINGS, REWARDS, familyForLevel, levelPower, evolutionOf, bossWordLevel, roundWordPlan, rewardTier };
