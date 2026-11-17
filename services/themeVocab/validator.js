/*
  ตรวจเนื้อหาหมวดคำศัพท์ตามเทศกาล (data/theme-vocab/<category>.json) ก่อนใช้งาน
  - รายการที่ผิดถูกตัดทิ้ง (ไม่ทำให้ทั้งหมวดพัง) และรายงาน errors
  - ประโยคตัวอย่างต้องมีคำศัพท์อยู่จริง (ใช้ทำโจทย์เติมคำ) · id/คำ/คำแปลห้ามซ้ำในหมวด
*/
// v1.12.2: แต่ละเทศกาลมี 2 ระดับ — พื้นฐาน (A1–B1) · ยาก (B2–C2) · festival = กลุ่มเทศกาล (สลับระดับได้ในหน้าหมวด)
const CATEGORIES = [
  { id: 'halloween', festival: 'halloween', level: 'basic', levelTH: 'พื้นฐาน', cefr: 'A1–B1', th: 'วันฮาโลวีน', en: 'Halloween', icon: 'moon', dateTH: '31 ต.ค.',
    introTH: 'ฟักทอง แม่มด ชุดแฟนซี และคำบรรยายบรรยากาศน่าขนลุก (เหมาะทุกวัย)' },
  { id: 'halloween-hard', festival: 'halloween', level: 'hard', levelTH: 'ยาก', cefr: 'B2–C2', th: 'วันฮาโลวีน', en: 'Halloween', icon: 'moon', dateTH: '31 ต.ค.',
    introTH: 'eerie · ominous · folklore · incantation — คำบรรยายบรรยากาศ ตำนาน และเวทมนตร์ระดับ B2–C2' },
  { id: 'loykrathong', festival: 'loykrathong', level: 'basic', levelTH: 'พื้นฐาน', cefr: 'A1–B1', th: 'วันลอยกระทง', en: 'Loy Krathong', icon: 'sparkles', dateTH: '24 พ.ย. 2569',
    introTH: 'กระทง แม่น้ำ พระจันทร์เต็มดวง และคำศัพท์การลอยกระทงอย่างปลอดภัยและรักษ์โลก' },
  { id: 'loykrathong-hard', festival: 'loykrathong', level: 'hard', levelTH: 'ยาก', cefr: 'B2–C1', th: 'วันลอยกระทง', en: 'Loy Krathong', icon: 'sparkles', dateTH: '24 พ.ย. 2569',
    introTH: 'heritage · illuminate · buoyant · sustainable — วัฒนธรรม แสงสี สายน้ำ และการอนุรักษ์ระดับ B2–C1' },
];
const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const POS = new Set(['noun', 'verb', 'adjective', 'phrase']);
const ID_RE = /^[a-z]{2}-\d{2}$/;   // hw/lk = พื้นฐาน · hx/lx = ยาก
const WORD_RE = /^[a-z][a-z' -]{0,30}[a-z]$/;

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** ตำแหน่งคำในประโยค (ไม่สนตัวพิมพ์ · ต้องไม่ติดตัวอักษรอื่น เช่น "candle" ไม่นับใน "candles") */
function wordRegex(word) { return new RegExp(`(?<![A-Za-z])${escRe(word)}(?![A-Za-z])`, 'i'); }

function validateFile(json, categoryId) {
  const errors = [];
  const items = [];
  if (!json || json.id !== categoryId || !Array.isArray(json.items)) return { errors: ['รูปแบบไฟล์ไม่ถูกต้อง'], items };
  const seen = { id: new Set(), word: new Set(), th: new Set() };
  json.items.forEach((it, n) => {
    const e = (m) => errors.push(`${categoryId}#${n + 1} ${it && it.id ? it.id : ''}: ${m}`);
    if (!it || typeof it !== 'object') { e('ไม่ใช่ object'); return; }
    const before = errors.length;
    if (!ID_RE.test(it.id || '')) e('id ไม่ถูกต้อง');
    if (!WORD_RE.test(it.word || '')) e('คำศัพท์ไม่ถูกต้อง');
    if (!POS.has(it.pos)) e(`ชนิดคำ "${it.pos}" ไม่รองรับ`);
    for (const k of ['th', 'example', 'exampleTH']) if (typeof it[k] !== 'string' || !it[k].trim() || it[k].length > 160) e(`${k} ว่างหรือยาวเกิน`);
    if (it.group != null && !/^[a-z]{2,12}$/.test(it.group)) e('group ไม่ถูกต้อง');
    if (it.level != null && !CEFR.has(it.level)) e('level (CEFR) ไม่ถูกต้อง');
    if (typeof it.example === 'string' && it.word && !wordRegex(it.word).test(it.example)) e('ประโยคตัวอย่างไม่มีคำศัพท์นี้');
    if (seen.id.has(it.id)) e('id ซ้ำ');
    if (seen.word.has(String(it.word).toLowerCase())) e('คำซ้ำ');
    if (seen.th.has(it.th)) e('คำแปลซ้ำ');
    if (errors.length !== before) return;
    seen.id.add(it.id); seen.word.add(it.word.toLowerCase()); seen.th.add(it.th);
    items.push({ id: it.id, word: it.word, pos: it.pos, th: it.th, group: it.group || null, level: it.level || null, example: it.example, exampleTH: it.exampleTH });
  });
  // โจทย์ 5 ตัวเลือก: แต่ละคำต้องมีตัวลวงต่างกลุ่มอย่างน้อย 4 คำ
  for (const it of items) {
    if (items.filter((o) => o.id !== it.id && (!it.group || o.group !== it.group)).length < 4) errors.push(`${it.id}: ตัวลวงไม่พอ`);
  }
  return { errors, items };
}

module.exports = { CATEGORIES, POS, validateFile, wordRegex };
