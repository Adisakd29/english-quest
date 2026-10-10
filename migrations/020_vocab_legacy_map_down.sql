-- ย้อนกลับ 020: ลบแผนที่และ ID สาธารณะ (เนื้อหาที่ย้ายไปแล้วยังอยู่ใน vocab_senses — ล้างด้วยมือถ้าต้องการ)
DROP TABLE IF EXISTS vocab_legacy_map;
DROP INDEX IF EXISTS uq_vocab_senses_public_id;
ALTER TABLE vocab_senses DROP COLUMN IF EXISTS public_id;
DELETE FROM schema_migrations WHERE id = '020_vocab_legacy_map.js';
