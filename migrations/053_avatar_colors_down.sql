ALTER TABLE outfit_presets DROP COLUMN IF EXISTS colors;
DROP TABLE IF EXISTS user_item_colors;
DELETE FROM world_restrictions WHERE kind = 'text';
ALTER TABLE world_restrictions DROP CONSTRAINT IF EXISTS ck_world_restr_kind;
ALTER TABLE world_restrictions ADD CONSTRAINT ck_world_restr_kind CHECK (kind IN ('chat', 'lobby'));
ALTER TABLE user_privacy_settings ALTER COLUMN avatar_visibility SET DEFAULT 'friends';
