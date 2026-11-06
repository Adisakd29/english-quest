-- ย้อนกลับ migration 008 (หัวข้อที่แอดมินจัดไว้จะหายไปด้วย)
DROP INDEX IF EXISTS idx_word_content_topic;
ALTER TABLE word_content DROP COLUMN IF EXISTS topic_source;
ALTER TABLE word_content DROP COLUMN IF EXISTS topic;
DELETE FROM schema_migrations WHERE id = '008_topics.js';
