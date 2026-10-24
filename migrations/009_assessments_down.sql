-- ย้อนกลับ migration 009 (ประวัติการสอบ Unit/Boss จะหาย — ความก้าวหน้าคำศัพท์ไม่กระทบ)
DROP TABLE IF EXISTS assessments;
DELETE FROM schema_migrations WHERE id = '009_assessments.sql';
