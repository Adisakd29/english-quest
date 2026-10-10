/*
  กิจกรรมพิเศษ (Event Configuration) — แก้ช่วงเวลา/ภารกิจ/เกณฑ์/รางวัลที่นี่ที่เดียว
  เวลาทั้งหมดตัดสินด้วยเวลาเซิร์ฟเวอร์ (ไม่ใช้เวลาในเครื่องผู้เล่น)
  endsAt = ไม่รวมเวลานี้ (exclusive): '2026-11-01T00:00:00+07:00' = หมดเขต 31 ต.ค. 2569 เวลา 23:59:59 น. (Asia/Bangkok)
  ตั้งเวลาเริ่มใหม่ได้ด้วย env (เช่นเปิดทดสอบก่อนวันจริง) โดยไม่ต้องแก้โค้ด

  HALLOWEEN ADVENTURE — 4 Chapter + Final Challenge
  - แต่ละ Chapter ปลดล็อกเมื่อทำภารกิจของ Chapter ก่อนหน้าครบ · ตัวนับ "อีก N รอบ/ข้อ" นับตั้งแต่ Chapter นั้นปลดล็อก
  - ความยากมาจากทักษะ: ด่านใช้ระดับภาษาของผู้เล่น (CEFR จากการวัดระดับ) + levelOffset · มีจับเวลา · เกณฑ์ผ่านสูงขึ้นเรื่อย ๆ
    ชนิดโจทย์: halloween (คำศัพท์ธีม) · vocab (อังกฤษ->ไทย) · vocabRev (ไทย->อังกฤษ) · context (เติมคำในประโยค)
               grammar (แกรมม่า) · spell (พิมพ์สะกดคำเอง ไม่มีตัวเลือก)
  - สะสมได้หลายวัน ไม่บังคับเล่นทุกวัน ไม่บังคับชนะ Ranked · บันทึกอัตโนมัติ (คำนวณจากข้อมูลบนเซิร์ฟเวอร์)

  ประมาณเวลาที่ผู้เล่นทั่วไปใช้ (ตรวจสมดุลแล้ว):
    รอบเกม 35 รอบ × ~4 นาที ≈ 2.3 ชม. (คำตอบที่ถูก 230 ข้อ ได้มาระหว่างเล่นรอบเหล่านี้ + ด่านต่าง ๆ)
    ด่าน 15 ด่าน × ~3 นาที (+ลองใหม่บางด่าน) ≈ 1–1.5 ชม.
    รวม ≈ 3.5–4 ชม. กระจายใน 3 สัปดาห์ ≈ 10–15 นาที/วัน — เล่นรวดเดียวไม่ได้เกิน 1 ด่านละ 6 นาที
*/
const env = (k, d) => (process.env[k] && String(process.env[k]).trim() ? String(process.env[k]).trim() : d);

/* ---------- ด่าน (Stage) ---------- */
// mix = จำนวนข้อแต่ละชนิด · pass = ต้องถูกอย่างน้อย · sectionMin = ขั้นต่ำต่อชนิด (ด่านผสมทักษะ) · timeLimitSec = เวลาทั้งด่าน
const STAGES = {
  // Chapter 2 — ระดับปานกลาง (ระดับภาษาของผู้เล่น)
  'c2-1': { chapter: 'c2', name: 'ทุ่งฟักทองกระซิบ', level: 'medium', levelOffset: 0, mix: { halloween: 3, vocab: 3, vocabRev: 2 }, pass: 6, timeLimitSec: 240 },
  'c2-2': { chapter: 'c2', name: 'สะพานรากไม้', level: 'medium', levelOffset: 0, mix: { vocab: 3, vocabRev: 2, context: 3 }, pass: 6, timeLimitSec: 240 },
  'c2-3': { chapter: 'c2', name: 'ต้นไม้ตะเกียง', level: 'medium', levelOffset: 0, mix: { context: 3, grammar: 3, halloween: 2 }, pass: 6, timeLimitSec: 240 },
  // Chapter 3 — ระดับยาก (สูงกว่าระดับผู้เล่น 1 ขั้น)
  'c3-1': { chapter: 'c3', name: 'ห้องโถงกระจกเงา', level: 'hard', levelOffset: 1, mix: { vocab: 4, vocabRev: 3, context: 3 }, pass: 8, timeLimitSec: 300 },
  'c3-2': { chapter: 'c3', name: 'ห้องสมุดร้าง', level: 'hard', levelOffset: 1, mix: { grammar: 5, context: 3, spell: 2 }, pass: 8, timeLimitSec: 300 },
  'c3-3': { chapter: 'c3', name: 'ห้องใต้หลังคา', level: 'hard', levelOffset: 1, mix: { vocabRev: 4, spell: 3, grammar: 3 }, pass: 8, timeLimitSec: 300 },
  // ด่านความแม่นยำ: ห้ามผิดแม้แต่ข้อเดียว ภายใน 2 นาที (เงื่อนไขต่างจากด่านทั่วไป)
  'c3-p': { chapter: 'c3', name: 'นาฬิกาเที่ยงคืน', level: 'precision', levelOffset: 0, mix: { vocab: 3, context: 3, grammar: 2 }, pass: 8, timeLimitSec: 120,
    rule: 'ถูกครบทุกข้อภายใน 2 นาที' },
  // Chapter 4 — ภารกิจพิเศษระดับยาก
  'c4-1': { chapter: 'c4', name: 'ประตูสุสานเงิน', level: 'special', levelOffset: 1, mix: { vocab: 4, context: 3, spell: 3 }, pass: 8, timeLimitSec: 300 },
  'c4-2': { chapter: 'c4', name: 'เถาวัลย์เรืองแสง', level: 'special', levelOffset: 1, mix: { grammar: 5, vocabRev: 3, spell: 2 }, pass: 8, timeLimitSec: 300 },
  'c4-3': { chapter: 'c4', name: 'หอคอยดวงดาว', level: 'special', levelOffset: 1, mix: { context: 4, grammar: 3, vocabRev: 3 }, pass: 8, timeLimitSec: 270 },
  'c4-4': { chapter: 'c4', name: 'บ่อน้ำพระจันทร์', level: 'special', levelOffset: 1, mix: { spell: 4, vocab: 3, context: 3 }, pass: 8, timeLimitSec: 300 },
  // ด่านผสมทักษะ: ต้องผ่านขั้นต่ำทุกหมวด (คำศัพท์ + แกรมม่า + สะกดคำ)
  'c4-m': { chapter: 'c4', name: 'วงเวทผสานพลัง', level: 'combo', levelOffset: 1, mix: { vocab: 4, grammar: 4, spell: 4 }, pass: 9, sectionMin: 3, timeLimitSec: 360,
    rule: 'ถูกรวม 9/12 และได้อย่างน้อย 3 ข้อในทุกหมวด' },
  // Final Challenge — 3 ช่วง ยากขึ้นเรื่อย ๆ ต้องผ่านตามลำดับ
  'f-1': { chapter: 'final', name: 'ประตูปราสาท', level: 'final', levelOffset: 1, mix: { vocab: 4, vocabRev: 3, halloween: 3 }, pass: 8, timeLimitSec: 240 },
  'f-2': { chapter: 'final', name: 'ห้องโถงเวทมนตร์', level: 'final', levelOffset: 1, mix: { grammar: 5, context: 5 }, pass: 9, timeLimitSec: 270 },
  'f-3': { chapter: 'final', name: 'บัลลังก์ราชาฟักทอง', level: 'final', levelOffset: 2, mix: { vocab: 3, context: 3, grammar: 3, spell: 3 }, pass: 10, sectionMin: 2, timeLimitSec: 330,
    rule: 'ถูก 10/12 และทุกหมวดอย่างน้อย 2 ข้อ' },
};

/* ---------- Chapter และภารกิจ ---------- */
// kind: rounds (จบเกม) · correct (ตอบถูก) · goodRounds (จบเกมด้วยความแม่นยำตามเกณฑ์) · stages (ผ่านด่านที่กำหนด)
const CHAPTERS = [
  {
    id: 'c1', no: 1, title: 'คืนแห่งการเริ่มต้น', place: 'หมู่บ้านฟักทอง', art: 'village',
    missions: [
      { id: 'c1.rounds', kind: 'rounds', target: 5, icon: 'play', title: 'เล่นเกมให้จบ 5 รอบ' },
      { id: 'c1.correct', kind: 'correct', target: 30, icon: 'circle-check', title: 'ตอบถูกสะสม 30 ข้อ' },
      { id: 'c1.good', kind: 'goodRounds', target: 3, minAccuracy: 0.7, minAnswers: 5, icon: 'target',
        title: 'ทำคะแนนผ่านเกณฑ์ 3 เกม', desc: 'แม่น 70% ขึ้นไป — นับทั้งการ์ดคำศัพท์ (ทุก 10 ข้อ = 1 เกม), แบบฝึกแกรมม่า, แบบทดสอบ, Ranked และห้องแข่ง' },
    ],
  },
  {
    id: 'c2', no: 2, title: 'ปริศนาแห่งฟักทอง', place: 'ป่าฟักทองลึกลับ', art: 'forest',
    missions: [
      { id: 'c2.rounds', kind: 'rounds', target: 8, icon: 'play', title: 'เล่นเกมให้จบอีก 8 รอบ' },
      { id: 'c2.correct', kind: 'correct', target: 50, icon: 'circle-check', title: 'ตอบถูกสะสมอีก 50 ข้อ' },
      { id: 'c2.stages', kind: 'stages', stages: ['c2-1', 'c2-2', 'c2-3'], target: 3, icon: 'sparkles', title: 'Halloween Challenge ระดับปานกลาง 3 ด่าน' },
    ],
  },
  {
    id: 'c3', no: 3, title: 'คฤหาสน์ผีลึกลับ', place: 'คฤหาสน์ผี', art: 'mansion',
    missions: [
      { id: 'c3.rounds', kind: 'rounds', target: 10, icon: 'play', title: 'เล่นเกมให้จบอีก 10 รอบ' },
      { id: 'c3.correct', kind: 'correct', target: 70, icon: 'circle-check', title: 'ตอบถูกสะสมอีก 70 ข้อ' },
      { id: 'c3.stages', kind: 'stages', stages: ['c3-1', 'c3-2', 'c3-3'], target: 3, icon: 'sparkles', title: 'Halloween Challenge ระดับยาก 3 ด่าน' },
      { id: 'c3.precision', kind: 'stages', stages: ['c3-p'], target: 1, icon: 'timer', title: 'ด่านความแม่นยำ: นาฬิกาเที่ยงคืน', desc: 'ตอบถูกครบทุกข้อภายใน 2 นาที' },
    ],
  },
  {
    id: 'c4', no: 4, title: 'ความลับแห่งคืนฮาโลวีน', place: 'สุสานเวทมนตร์', art: 'graveyard',
    missions: [
      { id: 'c4.rounds', kind: 'rounds', target: 12, icon: 'play', title: 'เล่นเกมให้จบอีก 12 รอบ' },
      { id: 'c4.correct', kind: 'correct', target: 80, icon: 'circle-check', title: 'ตอบถูกสะสมอีก 80 ข้อ' },
      { id: 'c4.stages', kind: 'stages', stages: ['c4-1', 'c4-2', 'c4-3', 'c4-4'], target: 4, icon: 'zap', title: 'ภารกิจพิเศษระดับยาก 4 ด่าน' },
      { id: 'c4.combo', kind: 'stages', stages: ['c4-m'], target: 1, icon: 'combine', title: 'วงเวทผสานพลัง', desc: 'คำศัพท์ + แกรมม่า + สะกดคำ ต้องผ่านทุกหมวด' },
    ],
  },
  {
    id: 'final', no: 5, title: 'ปราสาทราชาฟักทอง', place: 'ปราสาทราชาฟักทอง', art: 'castle', final: true,
    missions: [
      { id: 'final.stages', kind: 'stages', stages: ['f-1', 'f-2', 'f-3'], target: 3, icon: 'crown', title: 'Final Challenge 3 ช่วง', desc: 'ผ่านทุกช่วงตามลำดับ ยากขึ้นเรื่อย ๆ' },
    ],
  },
];

const EVENTS = [
  {
    id: 'halloween-2026',
    name: 'HALLOWEEN NIGHT 2026',
    nameTh: 'การผจญภัยคืนฮาโลวีน',
    startsAt: env('EVENT_HALLOWEEN_2026_START', '2026-10-10T00:00:00+07:00'),
    endsAt: env('EVENT_HALLOWEEN_2026_END', '2026-11-01T00:00:00+07:00'),
    endsLabel: '31 ตุลาคม 2569 เวลา 23:59:59 น.',
    chapters: CHAPTERS,
    stages: STAGES,
    // การ์ดคำศัพท์ 10 ข้อนับเป็น 1 รอบ (การ์ดเล่นในเครื่อง เซิร์ฟเวอร์จึงนับจากคำตอบที่บันทึกจริง)
    vocabAnswersPerRound: 10,
    stageRules: { expiresMinutes: 15, graceSec: 8, dailyAttempts: 60 },
    reward: { type: 'theme', themeId: 'halloween-2026', name: 'Halloween Theme 2026' },
  },
];

// ธีมพิเศษที่ต้องปลดล็อก (ธีมทั่วไป system/light/dark/cute ใช้ได้ทุกคน)
const PREMIUM_THEMES = {
  'halloween-2026': { id: 'halloween-2026', css: 'halloween', name: 'ฮาโลวีน 2026', source: 'halloween-2026' },
};
const FREE_THEMES = ['system', 'light', 'dark', 'cute'];

// คำศัพท์ธีมฮาโลวีน (เหมาะทุกวัย)
const HALLOWEEN_WORDS = [
  ['pumpkin', 'ฟักทอง'], ['ghost', 'ผี'], ['bat', 'ค้างคาว'], ['moon', 'ดวงจันทร์'], ['castle', 'ปราสาท'],
  ['witch', 'แม่มด'], ['costume', 'ชุดแต่งกาย'], ['candle', 'เทียน'], ['spider', 'แมงมุม'], ['owl', 'นกฮูก'],
  ['candy', 'ลูกอม'], ['night', 'กลางคืน'], ['star', 'ดาว'], ['mask', 'หน้ากาก'], ['broom', 'ไม้กวาด'],
  ['dark', 'มืด'], ['magic', 'เวทมนตร์'], ['skeleton', 'โครงกระดูก'], ['lantern', 'โคมไฟ'], ['cat', 'แมว'],
  ['cauldron', 'หม้อต้มยา'], ['potion', 'ยาวิเศษ'], ['spell', 'คาถา'], ['wizard', 'พ่อมด'], ['fog', 'หมอก'],
  ['haunted', 'ผีสิง'], ['grave', 'หลุมศพ'], ['web', 'ใยแมงมุม'], ['scary', 'น่ากลัว'], ['shadow', 'เงา'],
  ['crown', 'มงกุฎ'], ['king', 'กษัตริย์'], ['forest', 'ป่า'], ['tower', 'หอคอย'], ['secret', 'ความลับ'],
  ['treat', 'ขนม'], ['trick', 'กลอุบาย'], ['scream', 'กรีดร้อง'], ['midnight', 'เที่ยงคืน'], ['wand', 'ไม้กายสิทธิ์'],
];

const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
module.exports = { EVENTS, EVENT_BY_ID, PREMIUM_THEMES, FREE_THEMES, HALLOWEEN_WORDS, CHAPTERS, STAGES };
