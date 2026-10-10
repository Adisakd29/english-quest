/*
  อ่านเนื้อหาเสริมของคำ (ความหมาย, ตัวอย่าง, คำพ้อง, IPA, หัวข้อ) จากจุดเดียว
  รองรับทั้งสองแหล่ง — route ต่าง ๆ ไม่ต้องรู้ว่าตอนนี้ใช้ฐาน Oxford หรือชุดเดิม

    oxford : vocab_senses (ค้นด้วย public_id เช่น A1-S0001)
    legacy : word_content (ค้นด้วย ID เดิม เช่น A1-0001)
*/
const pool = require('../config/db');
const wordStore = require('./wordStore');

// รูปแบบ ID ที่ยอมรับ: ชุดใหม่ A1-S0001 และชุดเดิม A1-0001
const WORD_ID_RE = /^[A-C][12]-S?\d{4}$/;

/*
  ids: [id] คืน Map(id -> { ipa, definition, example, synonyms, senseCount, topic, reviewed })
*/
async function getContent(ids) {
  const clean = ids.filter((id) => WORD_ID_RE.test(id));
  const out = new Map();
  if (clean.length === 0) return out;
  await wordStore.ready();

  if (wordStore.getVocabSource() === 'oxford') {
    const { rows } = await pool.query(
      `SELECT public_id AS id, ipa, simple_definition AS definition, example_sentence AS example,
              synonyms, sense_count, topic, translation_status
         FROM vocab_senses WHERE public_id = ANY($1)`,
      [clean]
    );
    rows.forEach((r) => out.set(r.id, {
      ipa: r.ipa, definition: r.definition, example: r.example, synonyms: r.synonyms || [],
      senseCount: r.sense_count, topic: r.topic, reviewed: r.translation_status === 'reviewed',
    }));
    return out;
  }

  const { rows } = await pool.query(
    `SELECT word_id AS id, ipa, definition_en AS definition, example_en AS example,
            synonyms, sense_count, topic, status
       FROM word_content WHERE word_id = ANY($1)`,
    [clean]
  );
  rows.forEach((r) => out.set(r.id, {
    ipa: r.ipa, definition: r.definition, example: r.example, synonyms: r.synonyms || [],
    senseCount: r.sense_count, topic: r.topic, reviewed: r.status !== 'auto',
  }));
  return out;
}

// หัวข้อของคำทั้งหมด (ใช้จัด Unit ใน Learning Path) — Map(id -> topic)
async function getAllTopics() {
  await wordStore.ready();
  const sql = wordStore.getVocabSource() === 'oxford'
    ? 'SELECT public_id AS id, topic FROM vocab_senses WHERE topic IS NOT NULL AND public_id IS NOT NULL'
    : 'SELECT word_id AS id, topic FROM word_content WHERE topic IS NOT NULL';
  const { rows } = await pool.query(sql);
  return new Map(rows.map((r) => [r.id, r.topic]));
}

// คำทั้งหมดที่มีความหมายภาษาอังกฤษ (ใช้สร้างแบบทดสอบวัดระดับ)
async function getAllWithDefinition() {
  await wordStore.ready();
  const sql = wordStore.getVocabSource() === 'oxford'
    ? `SELECT public_id AS id, simple_definition AS definition, synonyms, sense_count,
              translation_status = 'reviewed' AS reviewed
         FROM vocab_senses WHERE simple_definition IS NOT NULL AND public_id IS NOT NULL`
    : `SELECT word_id AS id, definition_en AS definition, synonyms, sense_count, status <> 'auto' AS reviewed
         FROM word_content WHERE definition_en IS NOT NULL`;
  const { rows } = await pool.query(sql);
  return rows;
}

module.exports = { getContent, getAllTopics, getAllWithDefinition, WORD_ID_RE };
