-- ย้อนกลับ migration 006
-- หมายเหตุ: การลบ content_edits จะทำให้ประวัติการแก้ไขหาย (เนื้อหาที่แก้แล้วยังอยู่ใน word_content)
DROP TABLE IF EXISTS content_edits;
ALTER TABLE word_content DROP COLUMN IF EXISTS sense_count;
ALTER TABLE users DROP COLUMN IF EXISTS role;
DELETE FROM schema_migrations WHERE id = '006_admin.js';
