/*
  Flashcard ดาวน์โหลด — v1.17.0
  GET /api/flashcards/options                 ระดับ CEFR + หัวข้อ พร้อมจำนวนการ์ดที่ทำได้จริง
  GET /api/flashcards/deck?level=&topic=&count=&order=core|shuffle&seed=
      ชุดการ์ด (คำ · ชนิดคำ · IPA · ความหมายไทย · ประโยคตัวอย่าง + คำแปล)
  เนื้อหามาจากคลังคำเดียวกับที่หน้าเรียน/ค้นหาคำศัพท์แสดงอยู่แล้ว (ตัวกรองการมองเห็นชุดเดียวกัน)
  และตัดคำที่ "ถูก flag รอตรวจคำแปล" หรือ "แหล่งที่มารอตรวจ" ออก — การ์ดที่ผู้ใช้โหลดไปพิมพ์จึงไม่มีคำแปลที่ยังมีข้อสงสัย
  ไฟล์ PDF/รูปสร้างในเบราว์เซอร์ของผู้ใช้ (public/js/flashcards.js) — เซิร์ฟเวอร์ส่งแค่ข้อมูล ไม่มี AI/ค่าใช้จ่ายเพิ่ม
*/
const express = require('express');
const { createLimiter } = require('../utils/rateLimit');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const FC = require('../config/flashcards');

const router = express.Router();
router.use(authRequired);

const BASE = `FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
  WHERE NOT s.is_supplemental AND s.public_id IS NOT NULL
    AND (s.cefr <> 'C2' OR s.verification_status IN ('autoChecked', 'reviewed'))
    AND s.translation_note IS NULL AND NOT s.source_needs_review
    AND COALESCE(s.thai_meaning, '') <> '' AND COALESCE(s.example_sentence, '') <> ''`;
const TOPIC_SQL = "COALESCE(NULLIF(s.topic, ''), 'other')";

let cache = { at: 0, data: null };
async function options() {
  if (cache.data && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const { rows } = await pool.query(`SELECT s.cefr, ${TOPIC_SQL} AS topic, count(*)::int AS n ${BASE} GROUP BY 1, 2`);
  const levels = FC.LEVELS.map((id) => ({ id, count: rows.filter((r) => r.cefr === id).reduce((a, r) => a + r.n, 0) }));
  const topics = {};
  for (const r of rows) {
    if (!FC.TOPICS[r.topic] || r.n < FC.MIN_TOPIC_CARDS) continue;
    (topics[r.cefr] = topics[r.cefr] || []).push({ id: r.topic, th: FC.TOPICS[r.topic].th, en: FC.TOPICS[r.topic].en, count: r.n });
  }
  for (const k of Object.keys(topics)) topics[k].sort((a, b) => (a.id === 'other') - (b.id === 'other') || b.count - a.count);
  cache = { at: Date.now(), data: { levels, topics, counts: FC.COUNTS, max: FC.MAX_CARDS } };
  return cache.data;
}

router.get('/options', async (req, res) => {
  try { res.json(await options()); } catch (err) { console.error('[flashcards]', err); res.status(500).json({ error: 'โหลดตัวเลือก Flashcard ไม่สำเร็จ' }); }
});

const deckLimit = createLimiter({ limit: 30, windowMs: 60 * 1000 });
function deckLimiter(req, res, next) {
  if (deckLimit.check(`fc:${req.userId}`)) return res.status(429).json({ error: 'ขอชุดการ์ดถี่เกินไป — รอสักครู่แล้วลองใหม่' });
  next();
}

router.get('/deck', deckLimiter, async (req, res) => {
  const level = String(req.query.level || '').toUpperCase();
  if (!FC.LEVELS.includes(level)) return res.status(400).json({ error: 'เลือกระดับ A1–C2' });
  const topic = String(req.query.topic || 'all').toLowerCase();
  if (topic !== 'all' && !FC.TOPICS[topic]) return res.status(400).json({ error: 'ไม่พบหัวข้อนี้' });
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 40, 1), FC.MAX_CARDS);
  const order = req.query.order === 'shuffle' ? 'shuffle' : 'core';
  const seed = Math.abs(parseInt(req.query.seed, 10) || 0) % 1000003;
  try {
    const filter = [level];
    let where = ' AND s.cefr = $1';
    if (topic !== 'all') { filter.push(topic); where += ` AND ${TOPIC_SQL} = $2`; }
    const p = filter.length;
    // สุ่มแบบกำหนด seed ได้ (กดโหลดซ้ำได้ชุดเดิม) · core = เรียงตามลำดับคำพื้นฐานของคลัง
    const orderSql = order === 'shuffle' ? `md5(s.public_id || $${p + 2}::text)` : `s.display_order NULLS LAST, e.normalized, ($${p + 2}::int IS NULL)`;
    const { rows } = await pool.query(
      `SELECT s.public_id, e.headword, s.display_form, s.pos, s.ipa, s.thai_meaning, s.example_sentence, s.example_translation,
              ${TOPIC_SQL} AS topic, s.cefr
         ${BASE}${where} ORDER BY ${orderSql} LIMIT $${p + 1}`, [...filter, count, seed]);
    const total = (await pool.query(`SELECT count(*)::int AS n ${BASE}${where}`, filter)).rows[0].n;
    const t = topic === 'all' ? { th: 'ทุกหัวข้อ', en: 'All topics' } : FC.TOPICS[topic];
    res.json({
      level, topic, topicTh: t.th, topicEn: t.en, order, seed, total,
      cards: rows.map((r) => ({
        id: r.public_id, word: r.display_form || r.headword, headword: r.headword, pos: r.pos || '', ipa: r.ipa || '',
        thai: r.thai_meaning, example: r.example_sentence, exampleTh: r.example_translation || '',
        topic: r.topic, topicTh: (FC.TOPICS[r.topic] || FC.TOPICS.other).th, topicEn: (FC.TOPICS[r.topic] || FC.TOPICS.other).en, level: r.cefr,
      })),
    });
  } catch (err) {
    console.error('[flashcards]', err);
    res.status(500).json({ error: 'โหลดชุดการ์ดไม่สำเร็จ' });
  }
});

module.exports = router;
module.exports._resetCache = () => { cache = { at: 0, data: null }; };
