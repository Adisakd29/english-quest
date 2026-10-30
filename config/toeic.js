/*
  TOEIC-style Practice — ค่าตั้งต้นกลาง (Listening Part 1 ตอนนี้ · โครงสร้างรองรับ Part 2–7 ภายหลัง)
  EnglishQuest เป็นสื่อฝึกอิสระ ไม่ได้รับรองหรือเกี่ยวข้องกับ ETS · TOEIC เป็นเครื่องหมายการค้าของ ETS
*/
const PARTS = [
  { part: 1, section: 'listening', id: 'p1', title: 'Part 1 — Photographs', th: 'ภาพถ่าย', ready: true,
    desc: 'ดูภาพ ฟัง 4 ประโยค และเลือกประโยคที่อธิบายภาพได้ดีที่สุด' },
  { part: 2, section: 'listening', id: 'p2', title: 'Part 2 — Question–Response', th: 'คำถาม–คำตอบ', ready: true,
    desc: 'ฟังคำถามหรือข้อความ 1 ประโยค แล้วเลือกคำตอบที่เหมาะสมที่สุดจาก 3 ตัวเลือก (ไม่มีตัวหนังสือให้อ่าน)' },
  { part: 3, section: 'listening', id: 'p3', title: 'Part 3 — Conversations', th: 'บทสนทนา', ready: true,
    desc: 'ฟังบทสนทนา 2–3 คน แล้วตอบคำถาม 3 ข้อที่แสดงบนจอ — มีข้อที่ต้องดูกราฟิกประกอบ' },
  { part: 4, section: 'listening', id: 'p4', title: 'Part 4 — Talks', th: 'การพูดสั้น ๆ', ready: true,
    desc: 'ฟังประกาศ ข้อความเสียง โฆษณา ข่าว การนำชม แล้วตอบคำถาม 3 ข้อ' },
  { part: 5, section: 'reading', id: 'p5', title: 'Part 5 — Incomplete Sentences', th: 'เติมประโยค', ready: true,
    desc: 'อ่านประโยคที่มีช่องว่าง แล้วเลือกคำที่เติมได้ถูกต้องที่สุด · ไวยากรณ์ + คำศัพท์ธุรกิจ' },
  { part: 6, section: 'reading', id: 'p6', title: 'Part 6 — Text Completion', th: 'เติมข้อความ', ready: true,
    desc: 'อ่านอีเมล ประกาศ บทความสั้น แล้วเติม 4 ช่องว่าง — คำ วลี หรือทั้งประโยค ต้องดูบริบททั้งเรื่อง' },
  { part: 7, section: 'reading', id: 'p7', title: 'Part 7 — Reading Comprehension', th: 'อ่านจับใจความ', ready: true,
    desc: 'อ่านอีเมล แชท ประกาศ ใบแจ้งหนี้ บทความ — ทั้งเอกสารเดี่ยวและหลายฉบับ แล้วตอบคำถาม' },
];

// เสียงพูด (Kokoro TTS · สร้างล่วงหน้าแล้วเก็บเป็นไฟล์ · ไม่สร้างใหม่ตอนผู้ใช้เปิดข้อ)
// สำเนียงที่โมเดลมีให้: อเมริกัน + อังกฤษ (ไม่มีแคนาดา/ออสเตรเลียในโมเดลนี้) · ความเร็ว 1.0 = ใกล้การพูดจริง
const VOICES = {
  af_heart: { accent: 'us', label: 'American English', gender: 'female', lang: 'en-us' },
  am_michael: { accent: 'us', label: 'American English', gender: 'male', lang: 'en-us' },
  af_bella: { accent: 'us', label: 'American English', gender: 'female', lang: 'en-us' },
  am_fenrir: { accent: 'us', label: 'American English', gender: 'male', lang: 'en-us' },
  bf_emma: { accent: 'uk', label: 'British English', gender: 'female', lang: 'en-gb' },
  bm_george: { accent: 'uk', label: 'British English', gender: 'male', lang: 'en-gb' },
  bf_isabella: { accent: 'uk', label: 'British English', gender: 'female', lang: 'en-gb' },
  bm_fable: { accent: 'uk', label: 'British English', gender: 'male', lang: 'en-gb' },
};
const VOICE_POOL = { us: ['af_heart', 'am_michael', 'af_bella', 'am_fenrir'], uk: ['bf_emma', 'bm_george', 'bf_isabella', 'bm_fable'] };
const ACCENTS = { us: 'American English', uk: 'British English' };

const AUDIO = {
  generationVersion: 'kokoro-v1.0-int8/p1-v1',
  speed: 1.0,
  leadIn: 'Look at the picture.',
  dir: '/assets/toeic/p1/audio',
  checkUrl: '/assets/toeic/audio-check.mp3',
};

const PART1 = {
  mockSize: 6,                       // ชุดจำลองมาตรฐาน 6 ข้อ
  practiceSizes: [5, 10, 20],
  // EXP (บัญชี EXP เดิม · utils/exp.js) — กันฟาร์ม: ข้อเดิมได้ EXP ครั้งเดียวต่อวัน · จบชุดได้ completion จำกัดต่อวัน
  exp: {
    practiceCorrect: 3,              // ต่อข้อที่ตอบถูก (ข้อละครั้งต่อวัน)
    practiceComplete: 10,            // จบชุดฝึก (สูงสุด 5 ชุด/วัน)
    practicePerfect: 5,              // ถูกหมดทั้งชุด (≥ 5 ข้อ)
    practiceCompletePerDay: 5,
    mockComplete: 30,                // จบ Mock ครั้งแรกของวัน = เต็ม · ครั้งต่อ ๆ ไปลดลง
    mockRepeat: 10,
    mockCompletePerDay: 3,
    mockPerfect: 10,
  },
  // ขั้นต่ำก่อนเปิด Adaptive (ต้องมีข้อมูลพอ)
  adaptiveMinAnswers: 12,
  skillGroups: {
    actions: ['action', 'presentContinuous'],
    objects: ['object', 'state'],
    people: ['person', 'quantity'],
    locations: ['location'],
    prepositions: ['preposition', 'position', 'spatial'],
    passive: ['passive', 'presentPerfectPassive'],
  },
  skillGroupTh: { actions: 'การกระทำ (Actions)', objects: 'สิ่งของ/สภาพ (Objects)', people: 'บุคคล/จำนวน (People)',
    locations: 'สถานที่ (Locations)', prepositions: 'ตำแหน่ง/บุพบท (Prepositions)', passive: 'ประโยค Passive' },
  topics: ['mixed', 'people', 'objects', 'workplace', 'transportation', 'shopping', 'outdoor'],
};

// Listening Part 2 — Question–Response (เสียงล้วน · ตอบ A–C)
const PART2 = {
  practiceSizes: [10, 20, 25],
  mockSize: 25,                      // เท่า Part 2 ข้อสอบจริง
  answerGapSec: 5,                   // Mock: หลังเสียงจบ มีเวลาเลือก 5 วินาทีแล้วไปข้อถัดไปเอง (แบบข้อสอบจริง)
  exp: {
    practiceCorrect: 2, practiceComplete: 10, practicePerfect: 5, practiceCompletePerDay: 5,
    mockComplete: 30, mockRepeat: 10, mockCompletePerDay: 3, mockPerfect: 10,
  },
  categoryTh: { wh: 'คำถาม Wh-', yesNo: 'คำถาม Yes/No', choice: 'คำถามให้เลือก (A or B)', tag: 'Tag Question', negative: 'คำถามปฏิเสธ',
    statement: 'ประโยคบอกเล่า', request: 'ขอร้อง/เสนอ/ชวน' },
  distractorTh: { similarSound: 'คำเสียงคล้าย', repeatedWord: 'คำซ้ำจากคำถาม', wrongWh: 'ตอบคนละ Wh-', yesNoToWh: 'ตอบ Yes/No กับคำถาม Wh-',
    wrongTense: 'เวลา/Tense ไม่ตรง', wrongPerson: 'บุคคล/สรรพนามผิด', relatedWordTrap: 'คำที่เกี่ยวข้องแต่ไม่ตอบ', offTopic: 'ไม่เกี่ยวข้อง', illogical: 'ไม่สมเหตุสมผล' },
  topics: ['mixed', 'wh', 'yesNo', 'choice', 'tag', 'negative', 'statement', 'request'],
};

// Listening Part 3 (Conversations) / Part 4 (Talks) — ฟัง 1 ครั้ง (Mock) แล้วตอบ 3 ข้อ (ตัวเลือกแสดงบนจอ)
const PART34 = {
  practiceSizes: [1, 3, 5],          // จำนวนชุด (ชุดละ 3 ข้อ)
  mockSets: { 3: 6, 4: 5 },          // ย่อจากข้อสอบจริง (Part 3 = 13 ชุด · Part 4 = 10 ชุด)
  previewSec: 8,                     // Mock: อ่านคำถามก่อนเสียงเริ่ม
  answerSecPerQuestion: 8,           // Mock: หลังเสียงจบ 8 วินาทีต่อข้อ (แบบข้อสอบจริง)
  exp: {
    practiceCorrect: 2, practiceComplete: 10, practicePerfect: 5, practiceCompletePerDay: 5,
    mockComplete: 30, mockRepeat: 10, mockCompletePerDay: 3, mockPerfect: 10,
  },
  typeTh: { mainIdea: 'หัวข้อ/จุดประสงค์', detail: 'รายละเอียด', inference: 'อนุมาน', intent: 'เจตนาของผู้พูด', graphic: 'ดูกราฟิกประกอบ',
    nextAction: 'จะทำอะไรต่อ', speaker: 'ผู้พูดคือใคร', location: 'สถานที่', reason: 'เหตุผล', suggestion: 'ข้อเสนอแนะ/คำขอ' },
  groupOf: { mainIdea: 'gist', speaker: 'gist', location: 'gist', detail: 'detail', reason: 'detail', suggestion: 'detail', nextAction: 'detail',
    inference: 'inference', intent: 'intent', graphic: 'graphic' },
  groupTh: { gist: 'ภาพรวม (หัวข้อ/ผู้พูด/สถานที่)', detail: 'รายละเอียด/เหตุผล/สิ่งที่จะทำ', inference: 'อนุมาน', intent: 'เจตนา (ทำไมพูดแบบนี้)', graphic: 'กราฟิกประกอบ' },
  talkTypeTh: { announcement: 'ประกาศ', voicemail: 'ข้อความเสียง', advertisement: 'โฆษณา', news: 'ข่าว', tour: 'การนำชม', meeting: 'ช่วงหนึ่งของการประชุม',
    broadcast: 'รายการวิทยุ', introduction: 'การแนะนำวิทยากร', instructions: 'คำแนะนำ/วิธีทำ', speech: 'สุนทรพจน์' },
};

// Reading Part 5 — Incomplete Sentences (ข้อความล้วน ไม่มีเสียง) · ตรวจคำตอบที่เซิร์ฟเวอร์
const PART5 = {
  practiceSizes: [10, 20, 30],
  mockSize: 30,                      // เท่าจำนวนข้อ Part 5 ในข้อสอบจริง
  mockMinutes: 12,                   // เวลาแนะนำ ~20–25 วินาที/ข้อ (เหลือเวลาให้ Part 6–7)
  graceSec: 20,                      // เผื่อเน็ตช้าตอนหมดเวลา
  exp: {
    practiceCorrect: 2, practiceComplete: 10, practicePerfect: 5, practiceCompletePerDay: 5,
    mockComplete: 30, mockRepeat: 10, mockCompletePerDay: 3, mockPerfect: 10,
  },
  adaptiveMinAnswers: 15,
  skillGroups: {
    wordForm: ['wordForm'],
    verbs: ['verbTense', 'verbVoice', 'agreement', 'verbForm'],
    pronouns: ['pronoun', 'determiner'],
    comparisons: ['comparison'],
    prepositions: ['preposition'],
    connectors: ['conjunction', 'transition', 'relative'],
    vocabulary: ['vocabulary', 'collocation'],
  },
  skillGroupTh: { wordForm: 'รูปคำ (Word Form)', verbs: 'กริยา: Tense/Voice/Agreement', pronouns: 'สรรพนาม/คำบอกปริมาณ',
    comparisons: 'การเปรียบเทียบ (Comparison)', prepositions: 'บุพบท (Prepositions)', connectors: 'คำเชื่อม/Relative',
    vocabulary: 'คำศัพท์/Collocation' },
  skillTh: { wordForm: 'รูปคำ (Word Form)', verbTense: 'Tense', verbVoice: 'Active/Passive', agreement: 'Subject–Verb Agreement',
    verbForm: 'Gerund/Infinitive/Participle', pronoun: 'สรรพนาม', determiner: 'คำบอกปริมาณ/Determiner', comparison: 'การเปรียบเทียบ',
    preposition: 'บุพบท', conjunction: 'คำสันธาน', transition: 'คำเชื่อมประโยค (Transition)', relative: 'Relative Pronoun',
    vocabulary: 'ความหมายคำศัพท์', collocation: 'Collocation/สำนวน' },
  // แผน Mock 30 ข้อ (ใกล้สัดส่วนข้อสอบจริง: ไวยากรณ์ ~2/3 · คำศัพท์ ~1/3)
  mockPlan: { wordForm: 5, verbs: 5, pronouns: 3, comparisons: 2, prepositions: 3, connectors: 4, vocabulary: 8 },
  focuses: ['mixed', 'grammar', 'vocabulary', 'wordForm', 'verbs', 'pronouns', 'comparisons', 'prepositions', 'connectors'],
};

// Reading Part 6 — Text Completion (1 บทความ = 4 ช่องว่าง: คำ/วลี 3 + เติมประโยค 1)
const PART6 = {
  practiceSizes: [1, 2, 4],          // จำนวนบทความ
  mockPassages: 4,                   // = 16 ข้อ เท่าข้อสอบจริง
  mockMinutes: 10,
  graceSec: 20,
  exp: {
    practiceCorrect: 2, practiceComplete: 10, practicePerfect: 5, practiceCompletePerDay: 5,
    mockComplete: 30, mockRepeat: 10, mockCompletePerDay: 3, mockPerfect: 10,
  },
  groupTh: { grammar: 'ไวยากรณ์ในประโยค', vocabulary: 'คำศัพท์/Collocation', context: 'อ่านจากบริบททั้งเรื่อง', sentence: 'เติมประโยค (Sentence Insertion)' },
  docTypeTh: { email: 'อีเมล', memo: 'บันทึกภายใน', notice: 'ประกาศ', letter: 'จดหมาย', advertisement: 'โฆษณา', article: 'บทความ',
    instructions: 'คำแนะนำ/วิธีใช้', announcement: 'ประกาศแจ้ง', webpage: 'หน้าเว็บ', review: 'รีวิว' },
};

// Reading Part 7 — Reading Comprehension (เอกสารเดี่ยว / 2 ฉบับ / 3 ฉบับ)
const PART7 = {
  practiceSizes: [1, 3, 5],          // จำนวนชุด
  formats: ['mixed', 'single', 'multi'],
  mockPlan: { single: 4, double: 1, triple: 1 },   // ≈ 22 ข้อ (ข้อสอบจริง 54 ข้อ / 55 นาที)
  secondsPerQuestion: 60,            // เวลาแนะนำ ~1 นาที/ข้อ
  graceSec: 20,
  exp: {
    practiceCorrect: 2, practiceComplete: 10, practicePerfect: 5, practiceCompletePerDay: 5,
    mockComplete: 30, mockRepeat: 10, mockCompletePerDay: 3, mockPerfect: 10,
  },
  groupTh: { detail: 'ใจความ/รายละเอียด', inference: 'อนุมาน/เจตนาผู้เขียน', vocabulary: 'คำศัพท์ในบริบท', notTrue: 'ข้อใดไม่ได้กล่าวถึง (NOT)',
    insertion: 'แทรกประโยค', cross: 'เชื่อมข้อมูลหลายเอกสาร' },
  typeTh: { mainIdea: 'ใจความหลัก/จุดประสงค์', detail: 'รายละเอียด', inference: 'อนุมาน', vocabulary: 'คำศัพท์ในบริบท', notTrue: 'NOT/True',
    insertion: 'แทรกประโยค', intent: 'เจตนาในแชท', crossReference: 'เชื่อมข้อมูลข้ามเอกสาร' },
  formatTh: { single: 'เอกสารเดี่ยว', double: 'เอกสาร 2 ฉบับ', triple: 'เอกสาร 3 ฉบับ' },
  docTypeTh: { email: 'อีเมล', memo: 'บันทึกภายใน', notice: 'ประกาศ', letter: 'จดหมาย', advertisement: 'โฆษณา', article: 'บทความ',
    instructions: 'คำแนะนำ', announcement: 'ประกาศแจ้ง', webpage: 'หน้าเว็บ', review: 'รีวิว', chat: 'แชท', form: 'แบบฟอร์ม',
    invoice: 'ใบแจ้งหนี้', schedule: 'ตารางเวลา', survey: 'แบบสำรวจ' },
};

const DISCLAIMER_TH = 'แบบฝึก TOEIC-style ของ EnglishQuest เป็นสื่อฝึกอิสระ เนื้อหา ภาพ และเสียงสร้างขึ้นใหม่ทั้งหมด ไม่ได้คัดลอกจากข้อสอบจริง '
  + 'และไม่ได้รับการรับรองหรือเกี่ยวข้องกับ ETS · TOEIC® เป็นเครื่องหมายการค้าจดทะเบียนของ ETS · คะแนนในแอปเป็นคะแนนฝึก (Practice Score) ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ';

module.exports = { PARTS, VOICES, VOICE_POOL, ACCENTS, AUDIO, PART1, PART2, PART34, PART5, PART6, PART7, DISCLAIMER_TH };
