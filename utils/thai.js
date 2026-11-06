/*
  ตรรกะคำแปลไทยที่ใช้ร่วมกัน
  - routes/translate.js : แปลคำให้ flashcard (มีเรียกบริการแปลภายนอกถ้าจำเป็น)
  - routes/assessments.js : สร้างข้อสอบ (ใช้เฉพาะคำแปลที่มีอยู่แล้ว ไม่เรียกบริการภายนอก)

  ย้ายออกมาจาก routes/translate.js เพื่อไม่ให้ตรรกะตรวจคำแปลซ้ำหลายที่
*/
const { VERIFIED_TRANSLATIONS } = require('../data/verified_translations');

// ตัดส่วนวงเล็บ/ข้อความเสริมออก เช่น "second (next after the first)" -> "second"
function cleanForTranslation(word) {
  return word
    .replace(/\s*\([^)]*\)/g, '')
    .split(',')[0]
    .trim();
}

// ตัดขยะ HTML ที่บางครั้งติดมากับคำแปล เช่น "&#10;"
function cleanTranslationArtifacts(text) {
  return text
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// คำแปลที่ใช้ได้ต้องเป็นภาษาไทยล้วน สั้น ไม่มีอังกฤษปน ไม่มีจุด (มักเป็นตัวย่อขาดบริบท)
const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const LATIN_LETTER_RE = /[a-zA-Z]/;
const PERIOD_RE = /\./;
function looksLikeRealThaiTranslation(text) {
  if (!text) return false;
  if (text.length > 50) return false;
  if (!THAI_CHAR_RE.test(text)) return false;
  if (LATIN_LETTER_RE.test(text)) return false;
  if (PERIOD_RE.test(text)) return false;
  return true;
}

/*
  หาคำแปลไทยที่ "มีอยู่แล้ว" โดยไม่เรียกบริการภายนอก
  ลำดับความน่าเชื่อถือ: แอดมินตรวจแล้ว > คลังที่ยืนยันแล้ว > แคชที่ผ่านการตรวจรูปแบบ
  words: [{ id, word }]  คืน: Map(id -> คำแปลไทย)
*/
async function getKnownThai(pool, words) {
  const result = new Map();
  if (words.length === 0) return result;

  // โหมด Oxford: ใช้คำแปลจากฐานคำศัพท์ (เฉพาะที่ไม่ถูก flag)
  const wordStore = require('./wordStore');
  await wordStore.ready();
  if (wordStore.getVocabSource() === 'oxford') {
    for (const w of words) {
      const th = wordStore.getThai(w.id);
      if (th) result.set(w.id, th);
    }
    return result;
  }
  const ids = words.map((w) => w.id);

  try {
    const reviewed = await pool.query(
      `SELECT word_id, thai FROM word_content
        WHERE word_id = ANY($1) AND status = 'reviewed' AND thai IS NOT NULL AND thai <> ''`,
      [ids]
    );
    reviewed.rows.forEach((r) => result.set(r.word_id, r.thai));
  } catch (_err) { /* ยังไม่มีคอลัมน์ thai — ข้าม */ }

  for (const w of words) {
    if (result.has(w.id)) continue;
    const verified = VERIFIED_TRANSLATIONS[cleanForTranslation(w.word).toLowerCase()];
    if (verified) result.set(w.id, verified);
  }

  const remaining = ids.filter((id) => !result.has(id));
  if (remaining.length > 0) {
    const cached = await pool.query(
      'SELECT word_id, th_text FROM translations WHERE word_id = ANY($1)', [remaining]
    );
    for (const r of cached.rows) {
      const cleaned = cleanTranslationArtifacts(r.th_text || '');
      if (looksLikeRealThaiTranslation(cleaned)) result.set(r.word_id, cleaned);
    }
  }
  return result;
}

module.exports = {
  cleanForTranslation,
  cleanTranslationArtifacts,
  looksLikeRealThaiTranslation,
  getKnownThai,
};
