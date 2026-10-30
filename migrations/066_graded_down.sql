DROP TABLE IF EXISTS graded_progress;
DELETE FROM schema_migrations WHERE id = '066_graded.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
