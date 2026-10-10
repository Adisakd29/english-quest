-- ย้อนกลับ migration 004
DROP TABLE IF EXISTS answer_events;
DROP INDEX IF EXISTS idx_word_progress_due;
ALTER TABLE word_progress DROP COLUMN IF EXISTS srs_due_at;
ALTER TABLE word_progress DROP COLUMN IF EXISTS srs_lapses;
ALTER TABLE word_progress DROP COLUMN IF EXISTS srs_reps;
ALTER TABLE word_progress DROP COLUMN IF EXISTS srs_ease;
ALTER TABLE word_progress DROP COLUMN IF EXISTS srs_interval;
DELETE FROM schema_migrations WHERE id = '004_srs.sql';
