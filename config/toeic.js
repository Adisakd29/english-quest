/*
  TOEIC-style Practice — ค่าตั้งต้นกลาง (Listening Part 1 ตอนนี้ · โครงสร้างรองรับ Part 2–7 ภายหลัง)
  EnglishQuest เป็นสื่อฝึกอิสระ ไม่ได้รับรองหรือเกี่ยวข้องกับ ETS · TOEIC เป็นเครื่องหมายการค้าของ ETS
*/
const PARTS = [
  { part: 1, section: 'listening', id: 'p1', title: 'Part 1 — Photographs', th: 'ภาพถ่าย', ready: true,
    desc: 'ดูภาพ ฟัง 4 ประโยค และเลือกประโยคที่อธิบายภาพได้ดีที่สุด' },
  { part: 2, section: 'listening', id: 'p2', title: 'Part 2 — Question–Response', th: 'คำถาม–คำตอบ', ready: false },
  { part: 3, section: 'listening', id: 'p3', title: 'Part 3 — Conversations', th: 'บทสนทนา', ready: false },
  { part: 4, section: 'listening', id: 'p4', title: 'Part 4 — Talks', th: 'การพูดสั้น ๆ', ready: false },
  { part: 5, section: 'reading', id: 'p5', title: 'Part 5 — Incomplete Sentences', th: 'เติมประโยค', ready: false },
  { part: 6, section: 'reading', id: 'p6', title: 'Part 6 — Text Completion', th: 'เติมข้อความ', ready: false },
  { part: 7, section: 'reading', id: 'p7', title: 'Part 7 — Reading Comprehension', th: 'อ่านจับใจความ', ready: false },
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

const DISCLAIMER_TH = 'แบบฝึก TOEIC-style ของ EnglishQuest เป็นสื่อฝึกอิสระ เนื้อหา ภาพ และเสียงสร้างขึ้นใหม่ทั้งหมด ไม่ได้คัดลอกจากข้อสอบจริง '
  + 'และไม่ได้รับการรับรองหรือเกี่ยวข้องกับ ETS · TOEIC® เป็นเครื่องหมายการค้าจดทะเบียนของ ETS · คะแนนในแอปเป็นคะแนนฝึก (Practice Score) ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ';

module.exports = { PARTS, VOICES, VOICE_POOL, ACCENTS, AUDIO, PART1, DISCLAIMER_TH };
