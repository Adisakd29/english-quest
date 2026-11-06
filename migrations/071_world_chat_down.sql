-- ย้อน v1.15.0 แชทโลก
DROP TABLE IF EXISTS world_chat_messages;
ALTER TABLE user_world_settings DROP COLUMN IF EXISTS global_chat;
