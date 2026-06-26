const express = require('express');
const pool = require('../config/db');
const wordsData = require('../data/words.json');
const { VERIFIED_TRANSLATIONS } = require('../data/verified_translations');

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

// บางครั้งคำแปลที่ได้มาถูกต้องอยู่แล้ว แต่มีโค้ด HTML แปลก ๆ ติดมาด้วย
// เช่น "&#10;" (รหัสขึ้นบรรทัดใหม่) ปนอยู่หน้า-หลังข้อความ ฟังก์ชันนี้
// ตัดขยะแบบนี้ออกก่อน เพื่อเก็บคำแปลที่ดีไว้ใช้ ไม่ต้องทิ้งทั้งคำตอบ
function cleanTranslationArtifacts(text) {
  return text
    .replace(/&#\d+;/g, ' ') // numeric entity เช่น &#10;
    .replace(/&[a-zA-Z]+;/g, ' ') // named entity เช่น &amp; &nbsp;
    .replace(/\s+/g, ' ')
    .trim();
}

// บริการแปลภาษาฟรีบางครั้งมี "ขยะ" หลุดมาในฐานข้อมูลแปล (เช่นข้อความ
// คอมเมนต์ภาษาอังกฤษ หรือข้อความปนภาษาอังกฤษที่ไม่ใช่คำแปลจริง) ดังนั้น
// คำแปลที่ใช้ได้ต้องเป็นภาษาไทยล้วน ๆ ไม่มีตัวอักษรอังกฤษปนอยู่เลย
// และต้องไม่มีจุด (.) เพราะคำแปลความหมายจริงไม่มีเหตุผลต้องมีจุด
// (ลักษณะแบบนี้มักเป็นตัวย่อภาษาไทยที่ขาดบริบท เช่น "ส." ซึ่งไม่ใช่คำตอบ)
const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const LATIN_LETTER_RE = /[a-zA-Z]/;
const PERIOD_RE = /\./;
function looksLikeRealThaiTranslation(text) {
  if (!text) return false;
  if (text.length > 50) return false; // คำแปลควรสั้น ไม่ใช่ทั้งประโยค/ทั้งหมายเหตุ
  if (!THAI_CHAR_RE.test(text)) return false; // ต้องมีตัวอักษรไทยอย่างน้อย 1 ตัว
  if (LATIN_LETTER_RE.test(text)) return false; // ต้องไม่มีตัวอักษรอังกฤษปนอยู่เลย
  if (PERIOD_RE.test(text)) return false; // ต้องไม่มีจุด (มักเป็นตัวย่อที่ขาดบริบท)
  return true;
}

// ตรวจสอบว่าคำแปลที่ได้มาใช้ได้จริงไหม (ทั้งรูปแบบและความเชื่อมั่น)
function isUsableTranslation(rawText, originalText, matchScore) {
  const text = cleanTranslationArtifacts((rawText || '').trim());
  if (!text) return null;
  if (text.toLowerCase() === originalText.toLowerCase()) return null; // แปลไม่ออก สะท้อนคำเดิมกลับมา
  if (!looksLikeRealThaiTranslation(text)) return null;
  const score = Number(matchScore);
  if (!Number.isNaN(score) && score < 0.85) return null; // ความเชื่อมั่นต่ำ มีโอกาสแปลผิดความหมาย
  return text;
}

async function fetchThaiTranslation(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|th`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();

    // คำตอบหลักของ MyMemory (responseData) บางครั้งเป็นคำแปลห่วย ๆ
    // (เช่นสะท้อนคำเดิมกลับมาเฉย ๆ) ทั้งที่มีคำแปลที่ดีกว่าอยู่ใน
    // matches array อยู่แล้ว เลยต้องลองคำตอบหลักก่อน แล้วถ้าใช้ไม่ได้
    // ค่อยไล่หาคำแปลที่ดีที่สุดจาก matches มาใช้แทน
    const primary = isUsableTranslation(
      data?.responseData?.translatedText,
      text,
      data?.responseData?.match
    );
    if (primary) return primary;

    if (Array.isArray(data?.matches)) {
      const sorted = [...data.matches].sort((a, b) => Number(b.match || 0) - Number(a.match || 0));
      for (const m of sorted) {
        const candidate = isUsableTranslation(m.translation, text, m.match);
        if (candidate) return candidate;
      }
    }

    throw new Error('no_usable_translation');
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
    const cacheFixes = [];

    // 1) เช็คคลังคำแปลที่ยืนยันถูกต้องแล้วก่อนเลย — คำเหล่านี้ไม่ต้องผ่าน
    //    บริการแปลภาษาฟรีอีก และจะเขียนทับคำแปลผิดที่อาจแคชไว้แล้วด้วย
    const remainingAfterVerified = [];
    for (const id of ids) {
      const wordEntry = findWordById(id);
      const cleanWord = wordEntry ? cleanForTranslation(wordEntry.word).toLowerCase() : null;
      const verified = cleanWord && VERIFIED_TRANSLATIONS[cleanWord];
      if (verified) {
        result[id] = verified;
        cacheFixes.push([id, wordEntry.word, verified]);
      } else {
        remainingAfterVerified.push(id);
      }
    }

    // 2) เช็คแคชสำหรับคำที่เหลือ (ที่ไม่ได้อยู่ในคลังคำแปลที่ยืนยันแล้ว)
    const cached = remainingAfterVerified.length
      ? await pool.query('SELECT word_id, th_text FROM translations WHERE word_id = ANY($1)', [remainingAfterVerified])
      : { rows: [] };
    for (const row of cached.rows) {
      // เผื่อมีคำแปลที่เคยแคชไว้ก่อนหน้านี้แล้วมีขยะติดมา (เช่น &#10;) —
      // ทำความสะอาดแล้วเช็คอีกครั้ง ถ้าผ่านก็ใช้ค่าที่สะอาดแล้ว และแก้ไขแคช
      // ให้ถูกต้องถาวรไปเลย ไม่ต้องทำความสะอาดซ้ำทุกครั้งที่อ่าน
      const cleaned = cleanTranslationArtifacts(row.th_text);
      if (looksLikeRealThaiTranslation(cleaned)) {
        result[row.word_id] = cleaned;
        if (cleaned !== row.th_text) cacheFixes.push([row.word_id, null, cleaned]);
      }
    }

    if (cacheFixes.length > 0) {
      await Promise.all(
        cacheFixes.map(([wordId, word, th]) =>
          word
            ? pool.query(
                `INSERT INTO translations (word_id, word, th_text) VALUES ($1, $2, $3)
                 ON CONFLICT (word_id) DO UPDATE SET th_text = EXCLUDED.th_text`,
                [wordId, word, th]
              )
            : pool.query('UPDATE translations SET th_text = $1 WHERE word_id = $2', [th, wordId])
        )
      );
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
