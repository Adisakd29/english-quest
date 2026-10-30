const express = require('express');
const pool = require('../config/db');
const wordStore = require('../utils/wordStore');
const { VERIFIED_TRANSLATIONS } = require('../data/verified_translations');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const {
  cleanForTranslation,
  cleanTranslationArtifacts,
  looksLikeRealThaiTranslation,
} = require('../utils/thai');

const router = express.Router();
const MAX_IDS_PER_REQUEST = 60;

function findWordById(id) {
  const level = (id || '').split('-')[0];
  return wordStore.findWord(level, id);
}

// ตรรกะตรวจ/ทำความสะอาดคำแปลย้ายไป utils/thai.js (ใช้ร่วมกับระบบข้อสอบ)
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
// จำกัดการเรียกต่อผู้ใช้ กัน quota ของบริการแปลภายนอก (ผูกกับ IP เซิร์ฟเวอร์) หมด
const translateLimiter = createLimiter({ limit: 40, windowMs: 60 * 1000 });

router.post('/', authRequired, async (req, res) => {
  try {
    if (translateLimiter.check(`u:${req.userId}`)) {
      return res.status(429).json({ error: 'เรียกแปลคำบ่อยเกินไป กรุณารอสักครู่' });
    }
    await wordStore.ready();
    const idsInput = Array.isArray(req.body?.wordIds) ? req.body.wordIds : [];
    const ids = [...new Set(idsInput)].slice(0, MAX_IDS_PER_REQUEST);

    if (ids.length === 0) {
      return res.json({ translations: {} });
    }

    // โหมด Oxford: คำแปลมาจากฐานคำศัพท์เท่านั้น — "ไม่เรียกบริการแปลภายนอก" อีกต่อไป
    // (บริการแปลฟรีเป็นต้นเหตุของคำแปลผิด เช่น shopping = "เชิญปาร์ตี้")
    // คำที่ถูก flag ไม่ส่งคำแปลกลับ -> ไม่ถูกใช้เป็นตัวเลือกในแบบทดสอบจนกว่าจะมีคนตรวจ
    await wordStore.ready();
    if (wordStore.getVocabSource() === 'oxford') {
      const out = {};
      for (const id of ids) {
        const th = wordStore.getThai(id);
        if (th) out[id] = th;
      }
      return res.json({ translations: out });
    }

    const result = {};
    const cacheFixes = [];

    // 0) คำแปลไทยที่แอดมินตรวจแล้วใน word_content มาก่อนทุกแหล่ง
    //    (คนตรวจ > คลังที่ hard-code > แคช > แปลด้วยเครื่อง)
    //    ถ้าตาราง/คอลัมน์ยังไม่พร้อม ข้ามขั้นนี้ไปเงียบ ๆ ไม่ทำให้การแปลพัง
    const reviewedIds = new Set();
    try {
      const reviewed = await pool.query(
        `SELECT word_id, thai FROM word_content
          WHERE word_id = ANY($1) AND status = 'reviewed' AND thai IS NOT NULL AND thai <> ''`,
        [ids]
      );
      for (const row of reviewed.rows) {
        result[row.word_id] = row.thai;
        reviewedIds.add(row.word_id);
      }
    } catch (err) {
      console.error('[translate/reviewed] ข้าม:', err.message);
    }

    // 1) เช็คคลังคำแปลที่ยืนยันถูกต้องแล้วก่อนเลย — คำเหล่านี้ไม่ต้องผ่าน
    //    บริการแปลภาษาฟรีอีก และจะเขียนทับคำแปลผิดที่อาจแคชไว้แล้วด้วย
    const remainingAfterVerified = [];
    for (const id of ids) {
      if (reviewedIds.has(id)) continue; // ได้คำแปลที่คนตรวจแล้ว ไม่ต้องหาต่อ
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
