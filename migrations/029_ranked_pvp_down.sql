DROP INDEX IF EXISTS idx_ranked_matches_p2_created;
DROP INDEX IF EXISTS uq_ranked_matches_active_p2;
ALTER TABLE ranked_matches DROP COLUMN IF EXISTS result_p2;
ALTER TABLE ranked_matches DROP COLUMN IF EXISTS player2_id;
DELETE FROM schema_migrations WHERE id = '029_ranked_pvp.sql';
