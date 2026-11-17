DROP TABLE IF EXISTS theme_vocab_sessions;
DROP TABLE IF EXISTS theme_vocab_progress;
DELETE FROM schema_migrations WHERE id = '068_theme_vocab.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
