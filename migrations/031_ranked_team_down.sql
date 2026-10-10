DROP INDEX IF EXISTS idx_ranked_matches_team_members;
ALTER TABLE ranked_match_players DROP COLUMN IF EXISTS result;
ALTER TABLE ranked_match_players DROP COLUMN IF EXISTS team;
ALTER TABLE ranked_matches DROP COLUMN IF EXISTS team_member_ids;
DELETE FROM schema_migrations WHERE id = '031_ranked_team.sql';
