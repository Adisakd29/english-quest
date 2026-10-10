DROP INDEX IF EXISTS idx_ranked_matches_finished;
ALTER TABLE ranked_matches DROP COLUMN IF EXISTS end_reason;
ALTER TABLE ranked_matches DROP COLUMN IF EXISTS queue_ms;
ALTER TABLE users DROP COLUMN IF EXISTS ranked_frame;
ALTER TABLE users DROP COLUMN IF EXISTS ranked_title;
DROP TABLE IF EXISTS user_ranked_rewards;
DELETE FROM schema_migrations WHERE id = '030_ranked_seasons_rewards.sql';
