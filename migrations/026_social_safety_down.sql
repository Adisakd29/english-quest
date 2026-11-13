DROP TABLE IF EXISTS user_reports;
DROP TABLE IF EXISTS user_blocks;
DELETE FROM schema_migrations WHERE id = '026_social_safety.sql';
