DROP TABLE IF EXISTS work_sessions;
DROP TABLE IF EXISTS work_progress;
DELETE FROM schema_migrations WHERE id = '059_work_english.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
