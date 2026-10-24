ALTER TABLE users DROP COLUMN IF EXISTS changelog_seen;
ALTER TABLE users DROP COLUMN IF EXISTS last_reminded_on;
ALTER TABLE users DROP COLUMN IF EXISTS timezone;
ALTER TABLE users DROP COLUMN IF EXISTS reminder_time;
ALTER TABLE users DROP COLUMN IF EXISTS reminder_enabled;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS app_settings;
DELETE FROM schema_migrations WHERE id = '035_push_changelog.sql';
