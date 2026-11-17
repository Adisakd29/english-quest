DROP TABLE IF EXISTS writing_studio_logs;
DELETE FROM schema_migrations WHERE id = '063_writing_studio.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
