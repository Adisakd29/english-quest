ALTER TABLE outfit_presets DROP COLUMN IF EXISTS thumb;
DELETE FROM schema_migrations WHERE id = '050_preset_thumbs.sql';
