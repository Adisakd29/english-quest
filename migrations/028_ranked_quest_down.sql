ALTER TABLE answer_events DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS rank_history;
DROP TABLE IF EXISTS ranked_answers;
DROP TABLE IF EXISTS ranked_match_players;
DROP TABLE IF EXISTS ranked_matches;
DROP TABLE IF EXISTS ranked_profiles;
DROP TABLE IF EXISTS ranked_seasons;
DELETE FROM schema_migrations WHERE id = '028_ranked_quest.sql';
