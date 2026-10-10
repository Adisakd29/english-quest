-- ย้อนกลับ migration 002 (ใช้เฉพาะกรณีจำเป็น)
-- ปลอดภัยเพราะตารางยังว่าง (ยังไม่ได้ย้ายข้อมูลใน 1B-1)
DROP TABLE IF EXISTS word_content;
DROP TABLE IF EXISTS words;
-- ลบบันทึก migration เพื่อให้รันใหม่ได้
DELETE FROM schema_migrations WHERE id = '002_word_tables.sql';
