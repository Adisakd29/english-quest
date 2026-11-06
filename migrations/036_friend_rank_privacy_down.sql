ALTER TABLE users DROP COLUMN IF EXISTS rank_hidden_from_friends;
DELETE FROM schema_migrations WHERE id = '036_friend_rank_privacy.sql';
