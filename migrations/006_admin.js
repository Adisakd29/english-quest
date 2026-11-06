/*
  Migration 006: ระบบผู้ดูแล (Admin) + ปรับปรุงเนื้อหาคำศัพท์

  1. users.role           — 'user' | 'admin' (เผื่อ 'teacher' ในอนาคต)
  2. word_content.sense_count — จำนวนความหมายใน WordNet (คำหลายความหมาย = ควรตรวจก่อน)
  3. content_edits        — บันทึกทุกการแก้ไขของแอดมิน (ใคร/เมื่อไหร่/ก่อน/หลัง) ย้อนดูได้
  4. sync เนื้อหาใหม่จาก data/word_content.json (ปรับการเลือกความหมายคำพ้องรูปแล้ว)
     — อัปเดตเฉพาะแถว status='auto' ไม่แตะงานที่คนตรวจแล้ว
*/
const path = require('path');
const content = require(path.join(__dirname, '..', 'data', 'word_content.json'));
const seed005 = require('./005_seed_word_content');

const BATCH = 500;

async function run(client) {
  await client.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user'"
  );
  await client.query(
    'ALTER TABLE word_content ADD COLUMN IF NOT EXISTS sense_count INTEGER'
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS content_edits (
      id          BIGSERIAL PRIMARY KEY,
      word_id     VARCHAR(16) NOT NULL,
      editor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      before_data JSONB,
      after_data  JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_content_edits_word ON content_edits (word_id, created_at)'
  );

  // sync ความหมาย/ตัวอย่างที่ปรับปรุงแล้ว (ใช้ตรรกะเดียวกับ 005 — ข้ามแถว reviewed)
  await seed005.run(client);

  // เติม sense_count เฉพาะแถว auto
  const entries = Object.entries(content).filter(([, e]) => Number.isInteger(e.senses));
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const ids = chunk.map(([id]) => id);
    const counts = chunk.map(([, e]) => e.senses);
    await client.query(
      `UPDATE word_content wc SET sense_count = v.n
         FROM (SELECT UNNEST($1::varchar[]) AS id, UNNEST($2::int[]) AS n) v
        WHERE wc.word_id = v.id AND wc.status = 'auto'`,
      [ids, counts]
    );
  }
  console.log(`[migrate 006] เพิ่มระบบ admin + sense_count ${entries.length} คำ`);
}

module.exports = { run };
