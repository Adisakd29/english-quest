const express = require('express');
const pool = require('../config/db');
const wordsData = require('../data/words.json');

const router = express.Router();
const MAX_IDS_PER_REQUEST = 60;

function findWordById(id) {
  const level = (id || '').split('-')[0];
  const list = wordsData.levels[level] || [];
  return list.find((w) => w.id === id);
}

// ตัดส่วนวงเล็บ/ข้อความเสริมออกก่อนส่งไปแปล เช่น
// "second (next after the first)" -> "second", "light (from the sun/a lamp)" -> "light"
function cleanForTranslation(word) {
  return word
    .replace(/\s*\([^)]*\)/g, '')
    .split(',')[0]
    .trim();
}

// บริการแปลภาษาฟรีบางครั้งมี "ขยะ" หลุดมาในฐานข้อมูลแปล (เช่นข้อความ
// คอมเมนต์ภาษาอังกฤษ หรือข้อความปนภาษาอังกฤษที่ไม่ใช่คำแปลจริง) ดังนั้น
// คำแปลที่ใช้ได้ต้องเป็นภาษาไทยล้วน ๆ ไม่มีตัวอักษรอังกฤษปนอยู่เลย
const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const LATIN_LETTER_RE = /[a-zA-Z]/;
function looksLikeRealThaiTranslation(text) {
  if (!text) return false;
  if (text.length > 50) return false; // คำแปลควรสั้น ไม่ใช่ทั้งประโยค/ทั้งหมายเหตุ
  if (!THAI_CHAR_RE.test(text)) return false; // ต้องมีตัวอักษรไทยอย่างน้อย 1 ตัว
  if (LATIN_LETTER_RE.test(text)) return false; // ต้องไม่มีตัวอักษรอังกฤษปนอยู่เลย
  return true;
}

async function fetchThaiTranslation(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|th`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();
    const translated = ((data && data.responseData && data.responseData.translatedText) || '').trim();
    if (!translated) throw new Error('empty_translation');
    if (translated.toLowerCase() === text.toLowerCase()) throw new Error('untranslated_echo');
    if (!looksLikeRealThaiTranslation(translated)) throw new Error('not_real_thai_translation');
    return translated;
  } finally {
    clearTimeout(timeout);
  }
}

// POST /api/translate  { wordIds: ['A1-0001', ...] }
// คืนค่าคำแปลไทยเท่าที่หาได้ (คำที่แปลไม่ได้จะถูกข้ามไปเงียบ ๆ ไม่ทำให้ request ทั้งหมดล้มเหลว)
router.post('/', async (req, res) => {
  try {
    const idsInput = Array.isArray(req.body?.wordIds) ? req.body.wordIds : [];
    const ids = [...new Set(idsInput)].slice(0, MAX_IDS_PER_REQUEST);

    if (ids.length === 0) {
      return res.json({ translations: {} });
    }

    const result = {};

    const cached = await pool.query(
      'SELECT word_id, th_text FROM translations WHERE word_id = ANY($1)',
      [ids]
    );
    for (const row of cached.rows) {
      // เผื่อมีคำแปลขยะที่เคยแคชไว้ก่อนหน้านี้ (จากตอนยังไม่มีตัวกรอง) —
      // ถ้าไม่ผ่านตัวกรองตอนนี้ ให้ถือว่ายังไม่มีแคช จะลองแปลใหม่ด้านล่าง
      if (looksLikeRealThaiTranslation(row.th_text)) {
        result[row.word_id] = row.th_text;
      }
    }

    const missingIds = ids.filter((id) => !result[id]);

    const fetched = await Promise.allSettled(
      missingIds.map(async (id) => {
        const wordEntry = findWordById(id);
        if (!wordEntry) return null;
        const clean = cleanForTranslation(wordEntry.word);
        if (!clean) return null;
        const th = await fetchThaiTranslation(clean);
        return { id, word: wordEntry.word, th };
      })
    );

    const toInsert = [];
    for (const outcome of fetched) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        const { id, word, th } = outcome.value;
        result[id] = th;
        toInsert.push([id, word, th]);
      }
    }

    if (toInsert.length > 0) {
      const values = [];
      const params = [];
      toInsert.forEach(([id, word, th], i) => {
        const base = i * 3;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(id, word, th);
      });
      await pool.query(
        `INSERT INTO translations (word_id, word, th_text) VALUES ${values.join(', ')}
         ON CONFLICT (word_id) DO UPDATE SET th_text = EXCLUDED.th_text`,
        params
      );
    }

    res.json({ translations: result });
  } catch (err) {
    console.error('[translate]', err);
    res.status(500).json({ error: 'แปลคำศัพท์ไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
