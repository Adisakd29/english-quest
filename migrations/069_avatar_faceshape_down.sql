ALTER TABLE user_avatar DROP COLUMN IF EXISTS faceshape_item_id;
DELETE FROM schema_migrations WHERE id = '069_avatar_faceshape.sql';
