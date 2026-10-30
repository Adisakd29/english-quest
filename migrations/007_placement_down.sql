-- ย้อนกลับ migration 007 (ผลแบบทดสอบวัดระดับจะหายไป ข้อมูลอื่นไม่กระทบ)
DROP TABLE IF EXISTS placement_attempts;
DELETE FROM schema_migrations WHERE id = '007_placement.sql';
