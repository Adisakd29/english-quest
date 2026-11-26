DROP INDEX IF EXISTS uq_world_chat_client;
ALTER TABLE world_chat_messages DROP COLUMN IF EXISTS client_id, DROP COLUMN IF EXISTS quick_id;
ALTER TABLE user_world_settings DROP COLUMN IF EXISTS chat_mini, DROP COLUMN IF EXISTS chat_sound, DROP COLUMN IF EXISTS chat_notify, DROP COLUMN IF EXISTS chat_quick_only;
