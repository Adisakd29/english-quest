-- ย้อนกลับ migration 005: ลบเฉพาะเนื้อหาที่สร้างอัตโนมัติ (ไม่แตะแถวที่มนุษย์ตรวจแล้ว)
DELETE FROM word_content WHERE status = 'auto';
ALTER TABLE word_content DROP COLUMN IF EXISTS synonyms;
DELETE FROM schema_migrations WHERE id = '005_seed_word_content.js';
