DROP INDEX IF EXISTS idx_placement_user_created;
DROP TABLE IF EXISTS friend_request_declines;
ALTER TABLE users DROP COLUMN IF EXISTS suspended_reason;
ALTER TABLE users DROP COLUMN IF EXISTS suspended_until;
DROP INDEX IF EXISTS uq_assessments_in_progress;
