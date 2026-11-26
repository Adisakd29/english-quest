-- ไม่มีการย้อนกลับ: เป็นการซ่อมให้สอดคล้อง (การคืนค่า reps=0 จะทำให้บั๊กกลับมา)
DELETE FROM schema_migrations WHERE id = '022_fix_known_srs.sql';
