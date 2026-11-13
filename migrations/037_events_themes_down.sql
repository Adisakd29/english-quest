ALTER TABLE users DROP COLUMN IF EXISTS theme;
DROP TABLE IF EXISTS user_themes;
DROP TABLE IF EXISTS event_reward_claims;
DROP TABLE IF EXISTS event_challenge_attempts;
DROP TABLE IF EXISTS event_mission_progress;
DROP TABLE IF EXISTS event_activity;
DROP TABLE IF EXISTS events;
DELETE FROM schema_migrations WHERE id = '037_events_themes.sql';
