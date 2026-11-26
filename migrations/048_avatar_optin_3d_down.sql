-- ย้อน 048 (คอลัมน์ใหม่ของ Avatar เท่านั้น · ไม่แตะ users)
ALTER TABLE user_avatar DROP COLUMN IF EXISTS avatar_enabled;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS display_pref_at;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS model_version;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS thumb;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS thumb_mime;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS thumb_version;
ALTER TABLE user_avatar DROP COLUMN IF EXISTS thumb_outfit_hash;
ALTER TABLE avatar_items DROP COLUMN IF EXISTS model;
DELETE FROM schema_migrations WHERE id = '048_avatar_optin_3d.js';
