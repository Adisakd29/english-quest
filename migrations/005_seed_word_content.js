/*
  Migration 005: เติมเนื้อหาคำศัพท์ (IPA, ความหมาย, ตัวอย่าง, คำพ้อง) ลงตาราง word_content
  แหล่งข้อมูล: data/word_content.json (สร้างจาก CMU + WordNet ดู THIRD_PARTY_NOTICES.md)

  ปลอดภัย:
    - idempotent: รันซ้ำได้
    - ไม่เขียนทับแถวที่มนุษย์ตรวจแล้ว (status <> 'auto') — กันงานตรวจแก้หายตอน seed ใหม่
    - ไม่แตะคอลัมน์ thai (คำแปลไทยยังมาจากระบบเดิม)
*/
const path = require('path');
const content = require(path.join(__dirname, '..', 'data', 'word_content.json'));

const BATCH = 500;

async function run(client) {
  await client.query(
    'ALTER TABLE word_content ADD COLUMN IF NOT EXISTS synonyms TEXT[]'
  );

  // เอาเฉพาะคำที่มีอยู่จริงในตาราง words (กัน foreign key error)
  const { rows } = await client.query('SELECT id FROM words');
  const existing = new Set(rows.map((r) => r.id));
  const entries = Object.entries(content).filter(([id]) => existing.has(id));

  let written = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const values = [];
    const params = [];
    chunk.forEach(([id, e], idx) => {
      const b = idx * 5;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, 'cmudict+wordnet', 'auto')`);
      params.push(id, e.ipa || null, e.definition || null, e.example || null, e.synonyms || null);
    });

    const res = await client.query(
      `INSERT INTO word_content (word_id, ipa, definition_en, example_en, synonyms, source, status)
       VALUES ${values.join(', ')}
       ON CONFLICT (word_id) DO UPDATE
         SET ipa = EXCLUDED.ipa,
             definition_en = EXCLUDED.definition_en,
             example_en = EXCLUDED.example_en,
             synonyms = EXCLUDED.synonyms,
             source = EXCLUDED.source,
             updated_at = NOW()
         WHERE word_content.status = 'auto'`,
      params
    );
    written += res.rowCount;
  }
  console.log(`[migrate 005] เติมเนื้อหาคำศัพท์ ${written} คำ`);
}

module.exports = { run };
