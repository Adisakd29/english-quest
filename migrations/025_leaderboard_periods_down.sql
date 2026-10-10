DROP INDEX IF EXISTS idx_exp_log_created_user;
DELETE FROM schema_migrations WHERE id = '025_leaderboard_periods.sql';
