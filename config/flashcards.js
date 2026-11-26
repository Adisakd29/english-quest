/*
  Flashcard ดาวน์โหลด (v1.17.0) — ค่าตั้งและชื่อหัวข้อภาษาไทย
  หัวข้อ (topic) มาจากคอลัมน์ vocab_senses.topic ของคลังคำในแอป — ชื่อไทยด้านล่างเป็นป้ายแสดงผลเท่านั้น
*/
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const TOPICS = {
  describing: { th: 'คำบรรยายลักษณะ', en: 'Describing' },
  actions: { th: 'การกระทำ', en: 'Actions' },
  communication: { th: 'การสื่อสาร', en: 'Communication' },
  people: { th: 'ผู้คน', en: 'People' },
  things: { th: 'สิ่งของ', en: 'Things' },
  thinking: { th: 'ความคิด', en: 'Thinking' },
  work: { th: 'การงาน', en: 'Work' },
  feelings: { th: 'ความรู้สึก', en: 'Feelings' },
  nature: { th: 'ธรรมชาติ', en: 'Nature' },
  places: { th: 'สถานที่', en: 'Places' },
  time: { th: 'เวลา', en: 'Time' },
  body: { th: 'ร่างกาย', en: 'Body' },
  food: { th: 'อาหาร', en: 'Food' },
  'current-affairs': { th: 'ข่าวและเหตุการณ์', en: 'Current affairs' },
  business: { th: 'ธุรกิจ', en: 'Business' },
  workplace: { th: 'ที่ทำงาน', en: 'Workplace' },
  everyday: { th: 'ชีวิตประจำวัน', en: 'Everyday' },
  law: { th: 'กฎหมาย', en: 'Law' },
  society: { th: 'สังคม', en: 'Society' },
  economics: { th: 'เศรษฐกิจ', en: 'Economics' },
  media: { th: 'สื่อ', en: 'Media' },
  argumentation: { th: 'การโต้แย้ง', en: 'Argumentation' },
  psychology: { th: 'จิตวิทยา', en: 'Psychology' },
  relationships: { th: 'ความสัมพันธ์', en: 'Relationships' },
  evaluation: { th: 'การประเมิน', en: 'Evaluation' },
  academic: { th: 'วิชาการ', en: 'Academic' },
  analysis: { th: 'การวิเคราะห์', en: 'Analysis' },
  science: { th: 'วิทยาศาสตร์', en: 'Science' },
  'cause-effect': { th: 'เหตุและผล', en: 'Cause & effect' },
  culture: { th: 'วัฒนธรรม', en: 'Culture' },
  arts: { th: 'ศิลปะ', en: 'Arts' },
  education: { th: 'การศึกษา', en: 'Education' },
  opinion: { th: 'ความคิดเห็น', en: 'Opinion' },
  technology: { th: 'เทคโนโลยี', en: 'Technology' },
  literature: { th: 'วรรณกรรม', en: 'Literature' },
  environment: { th: 'สิ่งแวดล้อม', en: 'Environment' },
  other: { th: 'คำทั่วไปอื่น ๆ', en: 'General' },
};

module.exports = {
  LEVELS,
  TOPICS,
  MIN_TOPIC_CARDS: 6,        // หัวข้อที่มีคำน้อยกว่านี้ในระดับนั้น ไม่แสดงเป็นตัวเลือก (ยังอยู่ใน "ทุกหัวข้อ")
  COUNTS: [20, 40, 60],      // จำนวนการ์ดต่อชุดที่เลือกได้
  MAX_CARDS: 60,
};
