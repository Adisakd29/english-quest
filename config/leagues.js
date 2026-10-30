/*
  Ranked Quest — Animal League config (จุดเดียวที่กำหนดแรงค์ทั้งหมด ห้าม hard-code กระจายตาม component)
  ใช้ทั้งฝั่งเซิร์ฟเวอร์ (rating / matchmaking / promotion) และส่งให้หน้าเว็บผ่าน GET /api/ranked/config

  กติกาแบรนด์:
    - ไม่ใช้ชื่อแรงค์แบบเกมทั่วไป (Bronze/Silver/Gold/...) · ไม่มี Fox (Fox = Mascot ผู้นำทาง)
    - Rank ≠ CEFR: แรงค์วัดการแข่งขัน CEFR วัดภาษา — ไม่มี field ไหนผูกสองอย่างเข้าด้วยกัน
*/

// ---------- League ----------
// name = ชื่อแรงค์ภาษาไทย (ชื่อหลักที่แสดงทุกหน้า: Lobby / แผนที่ / Leaderboard / โปรไฟล์ / Promotion / ผลการแข่ง)
// nameEn = ชื่อเดิมภาษาอังกฤษ (อ้างอิงเท่านั้น) · id ห้ามเปลี่ยน (ใช้บันทึกในฐานข้อมูล)
// region / motto / theme = ดินแดนบนแผนที่ "เส้นทางสู่แรงค์สูงสุด" · แก้ชื่อที่นี่ที่เดียว ทุกหน้าเปลี่ยนตาม
// divisions: ชื่อ Division เรียงจากต่ำไปสูง · minQr: QR ขั้นต่ำของแต่ละ Division (ตรงลำดับกัน)
// npcShare: สัดส่วนคู่แข่ง NPC ใน Ranked ต่อ Division (1 = NPC ทั้งหมด) — PvP เปิดใน Phase 2
// kFactor: ความแรงของการเปลี่ยน QR (League ต้น ๆ สูงกว่า ให้ขึ้นเร็ว)
// protection: 'full' = แพ้ไม่เสีย QR · 'division3' = ไม่เสียเฉพาะ Division III · 'none'
// questionTier: สัดส่วนชนิดคำถาม (ดู QUESTION_MIX) · guardian: Guardian ของด่านเลื่อนขั้นไป League ถัดไป
const LEAGUES = [
  {
    id: 'trail-finch', name: 'กระจิบพเนจร', nameEn: 'Trail Finch', region: 'ทุ่งดอกไม้แรกเริ่ม', motto: 'ก้าวแรกของการผจญภัย ลองผิดลองถูกได้เต็มที่', theme: 'meadow', animal: 'finch', order: 1,
    keywords: ['Begin', 'Explore', 'Learn', 'Confidence'],
    colors: { primary: '#63B3FF', secondary: '#FFF4D6', accent: '#357ABD' },
    divisions: ['III', 'II', 'I'], minQr: [0, 100, 200],
    npcShare: [1, 1, 1], kFactor: 60, protection: 'full', questionTier: 'beginner',
    guardian: 'rowan', npcs: ['milo', 'nora', 'pip'], matchmakingRange: [100, 200, 350],
  },
  {
    id: 'swift-hare', name: 'กระต่ายเหินลม', nameEn: 'Swift Hare', region: 'ทุ่งหญ้าสายลม', motto: 'ว่องไวและต่อเนื่อง เก็บชัยชนะทีละก้าว', theme: 'grassland', animal: 'hare', order: 2,
    keywords: ['Speed', 'Agility', 'Momentum'],
    colors: { primary: '#52C7A5', secondary: '#DDF8EF', accent: '#16866D' },
    divisions: ['III', 'II', 'I'], minQr: [300, 450, 600],
    npcShare: [1, 1, 1], kFactor: 50, protection: 'division3', questionTier: 'beginner',
    guardian: 'velo', npcs: ['ava', 'dash', 'eli'], matchmakingRange: [100, 200, 350],
  },
  {
    id: 'river-otter', name: 'นากสายน้ำ', nameEn: 'River Otter', region: 'ลำธารคดเคี้ยว', motto: 'ปรับตัวไหลลื่นเหมือนสายน้ำ คิดก่อนตอบ', theme: 'river', animal: 'otter', order: 3,
    keywords: ['Adapt', 'Think', 'Flow', 'Learn'],
    colors: { primary: '#3CBFCF', secondary: '#167986', accent: '#E2FBFC' },
    divisions: ['III', 'II', 'I'], minQr: [750, 930, 1110],
    npcShare: [1, 1, 1], kFactor: 45, protection: 'none', questionTier: 'beginner',
    guardian: 'orin', npcs: ['kai', 'luna', 'marin'], matchmakingRange: [100, 200, 350],
  },
  {
    id: 'crest-lynx', name: 'แมวป่ายอดผา', nameEn: 'Crest Lynx', region: 'ผาหินสีม่วง', motto: 'สายตาคม จดจ่อ แม่นยำทุกข้อ', theme: 'mountain', animal: 'lynx', order: 4,
    keywords: ['Focus', 'Precision', 'Awareness'],
    colors: { primary: '#7567E8', secondary: '#E7E3FF', accent: '#4435B5' },
    divisions: ['IV', 'III', 'II', 'I'], minQr: [1300, 1500, 1700, 1900],
    npcShare: [0.6, 0.4, 0.2, 0], kFactor: 40, protection: 'none', questionTier: 'intermediate',
    guardian: 'nyx', npcs: ['iris', 'soren'], matchmakingRange: [100, 200, 350], npcFallback: 'offer',
  },
  {
    id: 'moon-wolf', name: 'หมาป่าจันทรา', nameEn: 'Moon Wolf', region: 'ป่าสนใต้แสงจันทร์', motto: 'วางแผนเป็น สม่ำเสมอ เชื่อสัญชาตญาณ', theme: 'moonforest', animal: 'wolf', order: 5,
    keywords: ['Strategy', 'Consistency', 'Instinct'],
    colors: { primary: '#5363C7', secondary: '#E7EAFF', accent: '#293475' },
    divisions: ['IV', 'III', 'II', 'I'], minQr: [2100, 2300, 2500, 2700],
    npcShare: [0, 0, 0, 0], kFactor: 40, protection: 'none', questionTier: 'intermediate',
    guardian: 'fenriris', npcs: ['fen', 'selene'], matchmakingRange: [100, 200, 350], npcFallback: 'practice',
  },
  {
    id: 'shadow-panther', name: 'เสือดำพรางเงา', nameEn: 'Shadow Panther', region: 'พงไพรลึกลับ', motto: 'ควบคุมจังหวะ ตอบไวและแม่นอย่างผู้ชำนาญ', theme: 'shadow', animal: 'panther', order: 6,
    keywords: ['Control', 'Precision', 'Reflex', 'Mastery'],
    colors: { primary: '#392E62', secondary: '#63548A', accent: '#A999FF' },
    divisions: ['IV', 'III', 'II', 'I'], minQr: [2900, 3150, 3400, 3650],
    npcShare: [0, 0, 0, 0], kFactor: 36, protection: 'none', questionTier: 'advanced',
    guardian: 'umbra', npcs: ['nox', 'vera'], matchmakingRange: [100, 200, 350], npcFallback: 'practice',
  },
  {
    id: 'storm-falcon', name: 'เหยี่ยวพายุ', nameEn: 'Storm Falcon', region: 'ยอดเขาพายุฟ้า', motto: 'มองเห็นไกล ตัดสินใจเฉียบขาดกลางพายุ', theme: 'storm', animal: 'falcon', order: 7,
    keywords: ['Speed', 'Vision', 'Command'],
    colors: { primary: '#198EA8', secondary: '#D8E6E9', accent: '#5EE4FF' },
    divisions: ['III', 'II', 'I'], minQr: [3900, 4200, 4500],
    npcShare: [0, 0, 0], kFactor: 32, protection: 'none', questionTier: 'advanced',
    guardian: 'zephyr', npcs: [], matchmakingRange: [100, 200, 350], npcFallback: 'practice',
  },
  {
    id: 'crown-eagle', name: 'อินทรีมงกุฎ', nameEn: 'Crown Eagle', region: 'ป้อมทองเหนือเมฆ', motto: 'ระดับยอดฝีมือ ผู้นำของท้องฟ้า', theme: 'citadel', animal: 'eagle', order: 8,
    keywords: ['Leadership', 'Vision', 'Elite', 'Control'],
    colors: { primary: '#E6A93D', secondary: '#FFF6E4', accent: '#8D5F18' },
    divisions: [''], minQr: [4800],
    npcShare: [0], kFactor: 28, protection: 'none', questionTier: 'advanced',
    guardian: 'aquila', npcs: [], matchmakingRange: [100, 200, 350], npcFallback: 'practice',
    // ขึ้น Aurora Lion ต้องผ่านเงื่อนไขก่อน จึงปลดล็อก Apex Trial (ไม่ใช่ Boss อย่างเดียว)
    apexRequirements: { minQr: 5200, minMatches: 40, minWinRate: 0.55 },
  },
  {
    id: 'aurora-lion', name: 'ราชสีห์แสงเหนือ', nameEn: 'Aurora Lion', region: 'ยอดเขาแสงออโรรา', motto: 'จุดสูงสุดของ EnglishQuest — ตำนานแห่งแสงเหนือ', theme: 'aurora', animal: 'lion', order: 9,
    keywords: ['Wisdom', 'Power', 'Mastery', 'Prestige'],
    colors: { primary: '#68A9FF', secondary: '#F7F8FF', accent: '#A781FF', aurora: ['#69E0B8', '#68A9FF', '#A781FF'], base: '#20253F' },
    divisions: [''], minQr: [5200],
    npcShare: [0], kFactor: 24, protection: 'none', questionTier: 'advanced',
    guardian: null, apexChallenge: 'solari', npcs: [], matchmakingRange: [100, 200, 350], npcFallback: 'practice',
  },
];

const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));

// ---------- กติกา ----------
const RULES = {
  questionsPerMatch: 10,
  questionMs: 20000,          // 20 วินาทีต่อข้อ -> แข่งจบประมาณ 3–5 นาที
  // คะแนน: ความถูกต้องสำคัญกว่าความเร็ว (70/30) · ตอบผิด 0 — เดาเร็วไม่ได้เปรียบคนที่คิดก่อนตอบ
  pointsCorrect: 700,
  pointsSpeedMax: 300,
  lossMultiplier: 0.6,        // แพ้เสียน้อยกว่าชนะได้ (ชนะ ≈ +20 · แพ้ ≈ −10 ถึง −15 ที่ K=40)
  drawRange: [0, 2],
  demotionBuffer: 50,         // ลด Division เมื่อ QR ต่ำกว่าเกณฑ์เกินค่านี้ (กันเด้งขึ้นลงจากเกมเดียว)
  promotionProtectionMatches: 2,
  promotionRetryAfterMatches: 2, // แพ้ด่านเลื่อนขั้น -> เล่นเกมปกติครบเท่านี้ก่อนลองใหม่ (ไม่ตกขั้น)
  promotionCancelBelow: 100,  // ระหว่างรอสอบ ถ้า QR ตกต่ำกว่าเกณฑ์เกินค่านี้ -> ยกเลิกสถานะรอสอบ
  matchStaleMinutes: 30,      // เกมที่ค้างเกินนี้ถูกปิดเป็น abandoned (ไม่มีใครเสีย QR)
};

// ---------- การจับคู่ (Matchmaking) — ปรับได้ที่นี่ที่เดียว ----------
// ใช้ลำดับแรงค์ (order ของ League id) เท่านั้น — ไม่ใช้ชื่อภาษาไทยในการคำนวณ
// v1.7.0: allBots = ทุกแรงค์แข่งกับบอททันที (แรงค์สูงเคยต้องรอคิวผู้เล่นจริงนานมาก) — ด่านเลื่อนแรงค์ = บอส Guardian ทุกแรงค์
//   ระบบคิวผู้เล่นจริงยังอยู่ครบ เปิดกลับได้ด้วย RANKED_ALL_BOTS=off (แล้วกติกาด้านล่างจะกลับมาใช้)
const ALL_BOTS = process.env.RANKED_ALL_BOTS !== 'off';
const MATCHMAKING = {
  allBots: ALL_BOTS,
  // แรงค์ตั้งแต่ลำดับนี้ขึ้นไป = แข่งกับผู้เล่นจริงเท่านั้น (ใช้เมื่อปิด allBots) · allBots = ไม่มีแรงค์ไหนบังคับรอคิว
  highRankFromOrder: ALL_BOTS ? 99 : Number(process.env.RANKED_HIGH_RANK_FROM || 6),
  // ความห่างของแรงค์ที่จับคู่กันได้ (นับเป็นระดับแรงค์): 0 = แรงค์เดียวกัน · 1 = ต่างกันได้ 1 ระดับ · ห้าม ≥ 2 เสมอ
  maxLeagueGap: 1,
  // กติกาเข้มกว่าเฉพาะบางแรงค์ (ใช้ค่าที่น้อยที่สุดของทั้งสองฝ่าย) — เช่นตั้ง 'aurora-lion': 0 = แรงค์สูงสุดเจอกันเองเท่านั้น
  maxLeagueGapByLeague: { 'aurora-lion': 1 },
  // เน็ตหลุดระหว่างรอในคิว: เก็บที่ในคิวไว้ให้กลับมาต่อได้ภายในเวลานี้ (ระหว่างหลุดจะไม่ถูกจับคู่)
  queueReconnectGraceMs: Number(process.env.RANKED_QUEUE_GRACE_MS || 30000),
};
const orderOf = (leagueId) => (LEAGUE_BY_ID[leagueId] ? LEAGUE_BY_ID[leagueId].order : 0);
const isHighRank = (leagueId) => orderOf(leagueId) >= MATCHMAKING.highRankFromOrder;
/** สัดส่วนเกม NPC ของ Division (allBots = 1 ทุกแรงค์) */
const npcShareOf = (leagueId, division) => {
  if (MATCHMAKING.allBots) return 1;
  const l = LEAGUE_BY_ID[leagueId];
  return l ? (l.npcShare[division] ?? l.npcShare[0]) : 1;
};
/** สองแรงค์นี้จับคู่ Ranked กันได้ไหม (ตรวจฝั่งเซิร์ฟเวอร์ · เพดานตายตัว ไม่ขยายตามเวลารอ) */
function leagueGapAllowed(a, b) {
  if (!LEAGUE_BY_ID[a] || !LEAGUE_BY_ID[b]) return false;
  const o = MATCHMAKING.maxLeagueGapByLeague;
  const max = Math.min(MATCHMAKING.maxLeagueGap, o[a] ?? Infinity, o[b] ?? Infinity, 1);
  return Math.abs(orderOf(a) - orderOf(b)) <= max;
}
/** ทุกคู่ในกลุ่ม (เช่นผู้เล่น 4 คนในเกมทีม หรือสมาชิกในทีม) ห่างกันไม่เกินเพดาน */
const groupGapAllowed = (ids) => ids.every((a) => ids.every((b) => leagueGapAllowed(a, b)));

// โหมด Ranked แยกกัน (แรงค์ · Quest Rating · กระดานอันดับ แยกต่อโหมด)
const MODES = {
  vocab: { id: 'vocab', name: 'Vocab', th: 'คำศัพท์', types: ['vocabulary', 'context'] },
  grammar: { id: 'grammar', name: 'Grammar', th: 'แกรมม่า', types: ['grammar', 'reading'] },
};
const MODE_IDS = Object.keys(MODES);
const modeOf = (m) => (MODES[m] ? m : 'vocab');

// สัดส่วนชนิดคำถามตามโหมดและช่วง League (ข้อไหนสร้างไม่ครบ ระบบเติมด้วยชนิดหลักของโหมด)
const QUESTION_MIX = {
  // v1.7.0: โหมดคำศัพท์ = ทายความหมายคำอย่างเดียว (ไม่มีประโยคเติมคำ — อ่านไม่ทันเวลาแข่ง)
  vocab: {
    beginner: { vocabulary: 10, context: 0 },
    intermediate: { vocabulary: 10, context: 0 },
    advanced: { vocabulary: 10, context: 0 },
  },
  grammar: {
    beginner: { grammar: 10, reading: 0 },
    intermediate: { grammar: 8, reading: 2 },
    advanced: { grammar: 7, reading: 3 },
  },
};

// ---------- ความยากของคำถามตามแรงค์ (v1.7.0) ----------
// ยิ่งแรงค์สูง คำถามยิ่งยาก — ทั้งคำศัพท์และแกรมม่า (ใช้ order ของ League · แก้ที่นี่ที่เดียว)
//   floor   : ระดับ CEFR ขั้นต่ำของคำถามในแรงค์นี้ (ระดับจริง = ค่าที่สูงกว่าระหว่างระดับของผู้เล่นกับ floor)
//   stretch : สัดส่วนข้อที่ "สูงกว่า" ระดับนั้นอีก 1 ระดับ (คำศัพท์สูงสุด C2 · แกรมม่าสูงสุด C1)
//   hard    : แกรมม่า — โอกาสเลือกข้อยาก (difficulty ≥ 3) เพิ่มขึ้น 0..1
// ระดับภาษาของผู้เล่น (CEFR) ยังเป็นตัวตั้งต้น — แรงค์เพิ่มความยาก "ทับ" ขึ้นไป ไม่ทำให้ง่ายลง
const RANK_DIFFICULTY = {
  1: { floor: { vocab: null, grammar: null }, stretch: 0, hard: 0 },
  2: { floor: { vocab: null, grammar: null }, stretch: 0.1, hard: 0.1 },
  3: { floor: { vocab: 'A2', grammar: 'A2' }, stretch: 0.2, hard: 0.2 },
  4: { floor: { vocab: 'B1', grammar: 'A2' }, stretch: 0.25, hard: 0.35 },
  5: { floor: { vocab: 'B1', grammar: 'B1' }, stretch: 0.3, hard: 0.5 },
  6: { floor: { vocab: 'B2', grammar: 'B1' }, stretch: 0.4, hard: 0.6 },
  7: { floor: { vocab: 'B2', grammar: 'B2' }, stretch: 0.5, hard: 0.75 },
  8: { floor: { vocab: 'C1', grammar: 'B2' }, stretch: 0.6, hard: 0.9 },
  9: { floor: { vocab: 'C1', grammar: 'C1' }, stretch: 0.7, hard: 1 },
};
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const MAX_CEFR = { vocab: 'C2', grammar: 'C1' };
/**
 * แผนความยากของเกม: { level, upLevel, stretch, hard, label }
 * level = ระดับหลักของคำถาม (ไม่ต่ำกว่า floor ของแรงค์) · upLevel = ระดับของข้อท้าทาย (null = ไม่มีระดับที่สูงกว่า)
 */
function rankDifficulty(leagueId, playerCefr, mode = 'vocab') {
  const m = mode === 'grammar' ? 'grammar' : 'vocab';
  const d = RANK_DIFFICULTY[orderOf(leagueId)] || RANK_DIFFICULTY[1];
  const cap = CEFR_ORDER.indexOf(MAX_CEFR[m]);
  const base = Math.min(cap, Math.max(0, CEFR_ORDER.indexOf(playerCefr)));
  const floor = d.floor[m] ? CEFR_ORDER.indexOf(d.floor[m]) : -1;
  const li = Math.min(cap, Math.max(base, floor));
  const up = li < cap ? CEFR_ORDER[li + 1] : null;
  return { level: CEFR_ORDER[li], upLevel: up, stretch: d.stretch, hard: d.hard, label: difficultyLabel(leagueId, m), raisedBy: Math.max(0, li - base) };
}
/** ข้อความสั้นสำหรับหน้าแรงค์ เช่น "ขั้นต่ำ B2 · ข้อท้าทาย 40%" */
function difficultyLabel(leagueId, mode = 'vocab') {
  const d = RANK_DIFFICULTY[orderOf(leagueId)] || RANK_DIFFICULTY[1];
  const f = d.floor[mode === 'grammar' ? 'grammar' : 'vocab'];
  const parts = [f ? `คำถามขั้นต่ำ ${f}` : 'คำถามตามระดับของคุณ'];
  if (d.stretch) parts.push(`ข้อท้าทาย ${Math.round(d.stretch * 100)}%`);
  return parts.join(' · ');
}

// ---------- ตัวช่วย ----------

/** ลำดับขั้นทั้งหมด (26 ขั้น) เรียงจากต่ำไปสูง */
const STEPS = LEAGUES.flatMap((l) => l.divisions.map((d, i) => ({
  league: l.id, divisionIndex: i, division: d, minQr: l.minQr[i],
  label: d ? `${l.name} ${d}` : l.name,
})));

function stepIndex(league, divisionIndex) {
  return STEPS.findIndex((s) => s.league === league && s.divisionIndex === divisionIndex);
}

/** ขั้นที่ QR นี้ "ควร" อยู่ (ไม่สนการรอสอบเลื่อนขั้น — ใช้คู่กับกติกาใน rating.js) */
function stepForQr(qr) {
  let found = STEPS[0];
  for (const s of STEPS) if (qr >= s.minQr) found = s;
  return found;
}

function nextLeague(leagueId) {
  const l = LEAGUE_BY_ID[leagueId];
  return l ? LEAGUES.find((x) => x.order === l.order + 1) || null : null;
}

function labelOf(league, divisionIndex) {
  const s = STEPS[stepIndex(league, divisionIndex)];
  return s ? s.label : league;
}

/** config สำหรับหน้าเว็บ (ไม่มีค่าภายในที่ไม่จำเป็น) */
function publicConfig() {
  return {
    leagues: LEAGUES.map((l) => ({
      id: l.id, name: l.name, nameEn: l.nameEn, region: l.region, motto: l.motto, theme: l.theme, animal: l.animal, order: l.order, keywords: l.keywords, colors: l.colors,
      divisions: l.divisions, minQr: l.minQr, guardian: l.guardian, apexChallenge: l.apexChallenge || null,
      pvp: !MATCHMAKING.allBots && l.npcShare.some((x) => x < 1), apexRequirements: l.apexRequirements || null, protection: l.protection,
    })),
    rules: { questionsPerMatch: RULES.questionsPerMatch, questionMs: RULES.questionMs },
    matchmaking: { allBots: MATCHMAKING.allBots, highRankFromOrder: MATCHMAKING.highRankFromOrder, maxLeagueGap: MATCHMAKING.maxLeagueGap },
    modes: Object.values(MODES),
    rankDifficulty: Object.fromEntries(LEAGUES.map((l) => [l.id, { vocab: difficultyLabel(l.id, 'vocab'), grammar: difficultyLabel(l.id, 'grammar'), floor: RANK_DIFFICULTY[l.order].floor, stretch: RANK_DIFFICULTY[l.order].stretch }])),
  };
}

module.exports = {
  LEAGUES, LEAGUE_BY_ID, RULES, MATCHMAKING, orderOf, isHighRank, npcShareOf, leagueGapAllowed, groupGapAllowed, QUESTION_MIX, RANK_DIFFICULTY, rankDifficulty, difficultyLabel, MODES, MODE_IDS, modeOf, STEPS, stepIndex, stepForQr, nextLeague, labelOf, publicConfig,
};
