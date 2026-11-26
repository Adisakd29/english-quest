/*
  Migration 008: หัวข้อคำศัพท์สำหรับ Learning Path
  - word_content.topic        : หัวข้อ (people, food, time, ...) ดู utils/curriculum.js
  - word_content.topic_source : 'auto' = จัดอัตโนมัติ | 'manual' = แอดมินแก้แล้ว (seed จะไม่เขียนทับ)
  - sync ความหมายที่ปรับปรุงแล้ว (ตัวย่อ CD/ID, ผัก/ผลไม้, คำสะกดแบบอังกฤษ) — เฉพาะแถว auto
*/
const path = require('path');
const content = require(path.join(__dirname, '..', 'data', 'word_content.json'));
const seed005 = require('./005_seed_word_content');

const BATCH = 500;

async function run(client) {
  await client.query('ALTER TABLE word_content ADD COLUMN IF NOT EXISTS topic VARCHAR(24)');
  await client.query(
    "ALTER TABLE word_content ADD COLUMN IF NOT EXISTS topic_source VARCHAR(8) NOT NULL DEFAULT 'auto'"
  );
  await client.query('CREATE INDEX IF NOT EXISTS idx_word_content_topic ON word_content (topic)');

  await seed005.run(client);

  const entries = Object.entries(content).filter(([, e]) => e.topic);
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    await client.query(
      `UPDATE word_content wc SET topic = v.topic
         FROM (SELECT UNNEST($1::varchar[]) AS id, UNNEST($2::varchar[]) AS topic) v
        WHERE wc.word_id = v.id AND wc.topic_source = 'auto'`,
      [chunk.map(([id]) => id), chunk.map(([, e]) => e.topic)]
    );
  }
  console.log(`[migrate 008] จัดหัวข้อคำศัพท์ ${entries.length} คำ`);
}

module.exports = { run };
