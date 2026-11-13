-- ไม่มีการย้อนกลับ: เป็นการซ่อมค่าที่เสีย (การคืนค่า NaN ไม่มีประโยชน์)
DELETE FROM schema_migrations WHERE id = '018_fix_srs_nan.sql';
