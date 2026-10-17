-- ย้อนกลับ migration 003 (ล้างข้อมูลคำศัพท์ที่ seed ไว้)
-- ปลอดภัย: route มี fallback ไป words.json อยู่แล้ว
TRUNCATE words CASCADE;
DELETE FROM schema_migrations WHERE id = '003_seed_words.js';
