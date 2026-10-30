-- ย้อน 052: ลบเฉพาะตารางของ Lobby (ไม่แตะผู้ใช้/เพื่อน/บล็อก/รายงานเดิม — คอลัมน์ source/context ของรายงานเก็บไว้ได้ไม่กระทบ)
DROP TABLE IF EXISTS world_restrictions;
DROP TABLE IF EXISTS world_chat_log;
DROP TABLE IF EXISTS world_mutes;
DROP TABLE IF EXISTS user_world_settings;
DELETE FROM schema_migrations WHERE id = '052_world_lobby.sql';
