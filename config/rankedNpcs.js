/*
  Ranked Quest — NPC / Guardian profiles (version ในโค้ด · ปรับค่าได้ที่นี่ที่เดียว)
  - หน้าเว็บแสดงคู่แข่งในเกมปกติด้วยชื่อ/อวตาร/แรงค์ (ไม่มีป้าย NPC — ตามที่เจ้าของระบบกำหนด) · Guardian/Apex แสดงเป็นบอสประจำด่าน
  - ฝั่งเซิร์ฟเวอร์ยังเก็บ role/label ไว้ครบ (ใช้ใน Analytics ของผู้ดูแล)
  - skills = ความแม่นยำ (0–1) ต่อชนิดคำถาม "ที่ความยากระดับเดียวกับเกม" — npcEngine ปรับตามความยากของแต่ละข้อ
  - responseMs = [ต่ำสุด, สูงสุด] ของเวลาตอบโดยประมาณ (มี variance ทุกข้อ ไม่เท่ากัน)
  - rating = QR ที่ใช้คำนวณ Elo เมื่อแข่งกับ NPC ตัวนี้
  - ตัวละครทั้งหมดเป็นตัวละครต้นฉบับของ EnglishQuest (ไม่อิงดีไซน์จากเกม/ตำนานอื่น)
*/

const NPCS = [
  // ---------- Trail Finch ----------
  { id: 'milo', name: 'Milo', league: 'trail-finch', role: 'training', animal: 'chick', personality: 'Friendly Beginner',
    skills: { vocabulary: 0.55, grammar: 0.50, context: 0.50, reading: 0.45 }, responseMs: [4000, 8000],
    preferred: 'vocabulary', weakness: 'grammar', mistakePattern: 'random', rating: 120 },
  { id: 'nora', name: 'Nora', league: 'trail-finch', role: 'training', animal: 'duckling', personality: 'Careful Learner',
    skills: { vocabulary: 0.64, grammar: 0.62, context: 0.58, reading: 0.55 }, responseMs: [5000, 8000],
    preferred: 'grammar', weakness: 'reading', mistakePattern: 'near', rating: 170 },
  { id: 'pip', name: 'Pip', league: 'trail-finch', role: 'training', animal: 'sparrow', personality: 'Fast but inaccurate',
    skills: { vocabulary: 0.57, grammar: 0.52, context: 0.50, reading: 0.45 }, responseMs: [2500, 5000],
    preferred: 'vocabulary', weakness: 'context', mistakePattern: 'first', rating: 140 },
  // ---------- Swift Hare ----------
  { id: 'ava', name: 'Ava', league: 'swift-hare', role: 'league', animal: 'squirrel', personality: 'Fast Player',
    skills: { vocabulary: 0.70, grammar: 0.66, context: 0.64, reading: 0.60 }, responseMs: [2500, 5000],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 470 },
  { id: 'dash', name: 'Dash', league: 'swift-hare', role: 'league', animal: 'chipmunk', personality: 'Very Fast',
    skills: { vocabulary: 0.64, grammar: 0.60, context: 0.58, reading: 0.55 }, responseMs: [2000, 4000],
    preferred: 'vocabulary', weakness: 'grammar', mistakePattern: 'first', rating: 430 },
  { id: 'eli', name: 'Eli', league: 'swift-hare', role: 'league', animal: 'hedgehog', personality: 'Balanced Beginner',
    skills: { vocabulary: 0.71, grammar: 0.70, context: 0.69, reading: 0.66 }, responseMs: [3000, 6000],
    preferred: 'grammar', weakness: 'reading', mistakePattern: 'near', rating: 520 },
  // ---------- River Otter ----------
  { id: 'kai', name: 'Kai', league: 'river-otter', role: 'league', animal: 'kingfisher', personality: 'Vocabulary Specialist',
    skills: { vocabulary: 0.80, grammar: 0.65, context: 0.72, reading: 0.66 }, responseMs: [2500, 5000],
    preferred: 'vocabulary', weakness: 'grammar', mistakePattern: 'near', rating: 900 },
  { id: 'luna', name: 'Luna', league: 'river-otter', role: 'league', animal: 'heron', personality: 'Grammar Specialist',
    skills: { vocabulary: 0.65, grammar: 0.80, context: 0.72, reading: 0.70 }, responseMs: [2800, 5000],
    preferred: 'grammar', weakness: 'vocabulary', mistakePattern: 'near', rating: 920 },
  { id: 'marin', name: 'Marin', league: 'river-otter', role: 'league', animal: 'turtle', personality: 'Context Reader',
    skills: { vocabulary: 0.72, grammar: 0.72, context: 0.76, reading: 0.74 }, responseMs: [2600, 5000],
    preferred: 'context', weakness: 'vocabulary', mistakePattern: 'near', rating: 950 },
  // ---------- Crest Lynx ----------
  { id: 'iris', name: 'Iris', league: 'crest-lynx', role: 'league', animal: 'owl', personality: 'Reading Specialist',
    skills: { vocabulary: 0.78, grammar: 0.78, context: 0.82, reading: 0.84 }, responseMs: [2000, 4500],
    preferred: 'reading', weakness: 'grammar', mistakePattern: 'near', rating: 1550 },
  { id: 'soren', name: 'Soren', league: 'crest-lynx', role: 'league', animal: 'badger', personality: 'Grammar + Vocabulary',
    skills: { vocabulary: 0.82, grammar: 0.81, context: 0.77, reading: 0.75 }, responseMs: [2000, 4500],
    preferred: 'grammar', weakness: 'reading', mistakePattern: 'near', rating: 1650 },
  // ---------- Moon Wolf (Practice เท่านั้น) ----------
  { id: 'fen', name: 'Fen', league: 'moon-wolf', role: 'practice', animal: 'raven', personality: 'Strategic',
    skills: { vocabulary: 0.84, grammar: 0.84, context: 0.84, reading: 0.82 }, responseMs: [2500, 4000],
    preferred: 'context', weakness: 'reading', mistakePattern: 'near', rating: 2400 },
  { id: 'selene', name: 'Selene', league: 'moon-wolf', role: 'practice', animal: 'moth', personality: 'High Grammar Accuracy',
    skills: { vocabulary: 0.80, grammar: 0.90, context: 0.82, reading: 0.80 }, responseMs: [2000, 4000],
    preferred: 'grammar', weakness: 'vocabulary', mistakePattern: 'near', rating: 2450 },
  // ---------- Shadow Panther (Practice เท่านั้น) ----------
  { id: 'nox', name: 'Nox', league: 'shadow-panther', role: 'practice', animal: 'bat', personality: 'Speed',
    skills: { vocabulary: 0.88, grammar: 0.86, context: 0.86, reading: 0.84 }, responseMs: [1800, 3600],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 3200 },
  { id: 'vera', name: 'Vera', league: 'shadow-panther', role: 'practice', animal: 'civet', personality: 'Context / Reading',
    skills: { vocabulary: 0.86, grammar: 0.86, context: 0.90, reading: 0.90 }, responseMs: [1800, 3600],
    preferred: 'reading', weakness: 'vocabulary', mistakePattern: 'near', rating: 3300 },
];

const GUARDIANS = [
  { id: 'rowan', name: 'Rowan', title: 'Trail Keeper', league: 'trail-finch', animal: 'stag', role: 'guardian',
    skills: { vocabulary: 0.70, grammar: 0.66, context: 0.66, reading: 0.62 }, responseMs: [3500, 7000],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 300 },
  { id: 'velo', name: 'Velo', title: 'The Swift Guardian', league: 'swift-hare', animal: 'gazelle', role: 'guardian',
    skills: { vocabulary: 0.76, grammar: 0.73, context: 0.72, reading: 0.70 }, responseMs: [2500, 4500],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 750 },
  { id: 'orin', name: 'Orin', title: 'River Sage', league: 'river-otter', animal: 'beaver', role: 'guardian',
    skills: { vocabulary: 0.79, grammar: 0.78, context: 0.78, reading: 0.77 }, responseMs: [2400, 4600],
    preferred: 'context', weakness: 'vocabulary', mistakePattern: 'near', rating: 1300 },
  { id: 'nyx', name: 'Nyx', title: 'Crest Sentinel', league: 'crest-lynx', animal: 'snow-lynx', role: 'guardian',
    skills: { vocabulary: 0.84, grammar: 0.83, context: 0.83, reading: 0.82 }, responseMs: [2000, 4200],
    preferred: 'reading', weakness: 'grammar', mistakePattern: 'near', rating: 2100 },
  { id: 'fenriris', name: 'Fenriris', title: 'Moon Guardian', league: 'moon-wolf', animal: 'great-wolf', role: 'guardian',
    skills: { vocabulary: 0.87, grammar: 0.86, context: 0.86, reading: 0.85 }, responseMs: [2000, 3800],
    preferred: 'context', weakness: 'reading', mistakePattern: 'near', rating: 2900 },
  { id: 'umbra', name: 'Umbra', title: 'Shadow Warden', league: 'shadow-panther', animal: 'panther', role: 'guardian',
    skills: { vocabulary: 0.90, grammar: 0.89, context: 0.89, reading: 0.88 }, responseMs: [1800, 3400],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 3900 },
  { id: 'zephyr', name: 'Zephyr', title: 'Storm Herald', league: 'storm-falcon', animal: 'falcon', role: 'guardian',
    skills: { vocabulary: 0.91, grammar: 0.91, context: 0.91, reading: 0.90 }, responseMs: [1800, 3200],
    preferred: 'vocabulary', weakness: 'reading', mistakePattern: 'near', rating: 4800 },
  { id: 'aquila', name: 'Aquila', title: 'Crown Arbiter', league: 'crown-eagle', animal: 'great-eagle', role: 'guardian',
    skills: { vocabulary: 0.93, grammar: 0.93, context: 0.93, reading: 0.92 }, responseMs: [1600, 3000],
    preferred: 'context', weakness: 'reading', mistakePattern: 'near', rating: 5200 },
  { id: 'solari', name: 'Solari', title: 'Keeper of the Aurora', league: 'aurora-lion', animal: 'aurora-lion', role: 'apex',
    skills: { vocabulary: 0.95, grammar: 0.95, context: 0.95, reading: 0.94 }, responseMs: [1600, 3000],
    preferred: 'reading', weakness: 'vocabulary', mistakePattern: 'near', rating: 5600 },
];

// ป้ายที่ต้องแสดงคู่กับ NPC เสมอ (ห้ามแสดง NPC เหมือนผู้เล่นจริง)
const ROLE_LABEL = {
  training: 'TRAINING NPC', league: 'LEAGUE NPC', practice: 'PRACTICE NPC', guardian: 'PROMOTION GUARDIAN', apex: 'APEX CHALLENGE',
};

/* ---------- คู่แข่งเพิ่มเติม (สร้างแบบกำหนด seed — id/ค่าคงที่ทุกครั้งที่เปิดเซิร์ฟเวอร์ เกมเก่ายังอ้างถึงได้) ----------
   แต่ละ League มีคู่แข่งหลายสไตล์: เร็วแต่พลาดบ่อย · รอบคอบ · ถนัดคำศัพท์ · ถนัดแกรมม่า · ถนัดบทอ่าน · สมดุล · ฟอร์มไม่นิ่ง ฯลฯ
   ความเก่งยังอยู่ในกรอบของ League (ไม่ทำให้ League ต้น ๆ ยากเกินไป) */
const NAME_POOL = [
  'Ploy', 'Bank', 'Mint', 'Fah', 'Tonkla', 'Nam', 'Beam', 'Pang', 'Ice', 'Earth', 'Film', 'Pim', 'Tee', 'Joy', 'Aom', 'Gun',
  'Kaew', 'View', 'Benz', 'Fern', 'Arm', 'Nat', 'Prim', 'Sun', 'Toey', 'Boss', 'Kla', 'Nook', 'Jane', 'Pete', 'Muk', 'Oat',
  'Leo', 'Mia', 'Hana', 'Yuki', 'Arjun', 'Sofia', 'Diego', 'Amara', 'Noah', 'Lina', 'Omar', 'Chloe', 'Ken', 'Zara', 'Ivy', 'Theo',
  'Nadia', 'Ravi', 'Elena', 'Jun', 'Minho', 'Aiko', 'Lucas', 'Maya', 'Sami', 'Rina', 'Felix', 'Anya', 'Tariq', 'Wen', 'Mateo', 'Isla',
];
const ARCHETYPES = [
  { key: 'speed', personality: 'Speedster', d: { vocabulary: -0.04, grammar: -0.05, context: -0.05, reading: -0.06 }, t: 0.65, mistake: 'first' },
  { key: 'careful', personality: 'Careful Thinker', d: { vocabulary: 0.03, grammar: 0.03, context: 0.03, reading: 0.03 }, t: 1.25, mistake: 'near' },
  { key: 'vocab', personality: 'Word Collector', d: { vocabulary: 0.08, grammar: -0.07, context: 0.03, reading: -0.04 }, t: 0.95, mistake: 'near', pref: 'vocabulary', weak: 'grammar' },
  { key: 'grammar', personality: 'Grammar Nerd', d: { vocabulary: -0.06, grammar: 0.08, context: -0.02, reading: 0.03 }, t: 1.05, mistake: 'near', pref: 'grammar', weak: 'vocabulary' },
  { key: 'reader', personality: 'Bookworm', d: { vocabulary: -0.03, grammar: -0.02, context: 0.06, reading: 0.08 }, t: 1.15, mistake: 'near', pref: 'reading', weak: 'vocabulary' },
  { key: 'balanced', personality: 'All-rounder', d: { vocabulary: 0, grammar: 0, context: 0, reading: 0 }, t: 1, mistake: 'near' },
  { key: 'guesser', personality: 'Quick Guesser', d: { vocabulary: -0.08, grammar: -0.08, context: -0.08, reading: -0.09 }, t: 0.55, mistake: 'random' },
  { key: 'steady', personality: 'Steady Climber', d: { vocabulary: 0.01, grammar: 0.01, context: 0.01, reading: 0.01 }, t: 1.05, mistake: 'near', form: 0.02 },
  { key: 'streaky', personality: 'Streaky', d: { vocabulary: 0.02, grammar: -0.01, context: 0, reading: -0.02 }, t: 0.9, mistake: 'random', form: 0.09 },
];
// ค่าพื้นฐานของแต่ละ League: ความแม่นยำเฉลี่ย · เวลาตอบ · ช่วง rating
const LEAGUE_BASE = {
  'trail-finch': { acc: 0.56, ms: [4000, 8000], rating: [60, 280] },
  'swift-hare': { acc: 0.66, ms: [2800, 5600], rating: [320, 720] },
  'river-otter': { acc: 0.73, ms: [2600, 5200], rating: [780, 1260] },
  'crest-lynx': { acc: 0.80, ms: [2200, 4600], rating: [1320, 2060] },
  'moon-wolf': { acc: 0.84, ms: [2100, 4100], rating: [2120, 2860] },
  'shadow-panther': { acc: 0.87, ms: [1900, 3700], rating: [2920, 3860] },
};
const EXTRA_PER_LEAGUE = 9;
function seeded(seed) {   // mulberry32 (ไม่ require rng.js เพื่อให้ config ไม่ขึ้นกับ services)
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const clampSkill = (x) => Math.round(Math.max(0.3, Math.min(0.96, x)) * 100) / 100;
const usedNames = new Set(NPCS.map((n) => n.name));
const GENERATED = [];
{
  const rng = seeded(20261007);
  const pool = NAME_POOL.filter((n) => !usedNames.has(n));
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0;
  for (const [league, base] of Object.entries(LEAGUE_BASE)) {
    for (let i = 0; i < EXTRA_PER_LEAGUE; i += 1) {
      const arch = ARCHETYPES[i % ARCHETYPES.length];
      const name = pool[k % pool.length]; k += 1;
      const jitter = () => (rng() - 0.5) * 0.04;
      const skills = Object.fromEntries(['vocabulary', 'grammar', 'context', 'reading']
        .map((t) => [t, clampSkill(base.acc + (t === 'reading' ? -0.03 : 0) + arch.d[t] + jitter())]));
      const lo = Math.round(base.ms[0] * arch.t * (0.9 + rng() * 0.2) / 100) * 100;
      const hi = Math.max(lo + 1200, Math.round(base.ms[1] * arch.t * (0.9 + rng() * 0.2) / 100) * 100);
      const [rLo, rHi] = base.rating;
      GENERATED.push({
        id: `${league.split('-')[0]}-${name.toLowerCase()}`, name, league,
        role: league === 'trail-finch' ? 'training' : ['moon-wolf', 'shadow-panther'].includes(league) ? 'practice' : 'league',
        animal: 'player', personality: arch.personality, skills, responseMs: [lo, Math.min(hi, 15000)],
        preferred: arch.pref || ['vocabulary', 'grammar', 'context'][i % 3], weakness: arch.weak || ['reading', 'context', 'grammar'][i % 3],
        mistakePattern: arch.mistake, form: arch.form ?? 0.04,
        // rating สัมพันธ์กับความเก่ง (Elo ยุติธรรม): แม่นกว่าค่าเฉลี่ย League = rating สูงกว่า
        rating: Math.round(rLo + (rHi - rLo) * Math.max(0, Math.min(1, 0.5 + (Object.values(skills).reduce((a, b) => a + b, 0) / 4 - base.acc) * 6))),
      });
    }
  }
}
NPCS.push(...GENERATED);
// เพิ่มเข้า League ให้ระบบจับคู่สุ่มเลือกได้ (config/leagues.js ไม่ต้องรู้รายชื่อ)
{
  const { LEAGUE_BY_ID } = require('./leagues');
  for (const n of GENERATED) if (LEAGUE_BY_ID[n.league] && !LEAGUE_BY_ID[n.league].npcs.includes(n.id)) LEAGUE_BY_ID[n.league].npcs.push(n.id);
}

const ALL = [...NPCS, ...GUARDIANS];
const BY_ID = Object.fromEntries(ALL.map((n) => [n.id, n]));

/** ข้อมูลที่ส่งให้หน้าเว็บได้ (ไม่มีค่าความเก่งภายใน) */
function publicNpc(npc) {
  if (!npc) return null;
  return {
    id: npc.id, name: npc.name, title: npc.title || null, league: npc.league, animal: npc.animal,
    role: npc.role, label: ROLE_LABEL[npc.role], personality: npc.personality || null, isNpc: true,
  };
}

module.exports = { NPCS, GUARDIANS, BY_ID, ROLE_LABEL, publicNpc };
