DROP TABLE IF EXISTS event_chapter_progress;
DROP INDEX IF EXISTS idx_event_attempts_stage;
ALTER TABLE event_challenge_attempts DROP COLUMN IF EXISTS time_ms;
ALTER TABLE event_challenge_attempts DROP COLUMN IF EXISTS detail;
ALTER TABLE event_challenge_attempts DROP COLUMN IF EXISTS stage_id;
ALTER TABLE event_activity DROP COLUMN IF EXISTS total;
ALTER TABLE event_activity DROP COLUMN IF EXISTS correct;
