-- ย้อนกลับ 021: คืนความก้าวหน้าเดิมจาก word_progress_legacy
-- ⚠️ ความก้าวหน้าที่เกิดขึ้น "หลัง" ย้าย (แถว ID ใหม่) จะถูกลบ — ใช้เมื่อจำเป็นเท่านั้น และตั้ง VOCAB_SOURCE=legacy
DELETE FROM word_progress WHERE word_id ~ '-S[0-9]{4}$';
INSERT INTO word_progress (id, user_id, word_id, level, status, times_seen, times_correct, last_reviewed,
                           ever_known, last_exp_at, srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at)
SELECT id, user_id, word_id, level, status, times_seen, times_correct, last_reviewed,
       ever_known, last_exp_at, srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at
  FROM word_progress_legacy ON CONFLICT DO NOTHING;
UPDATE answer_events SET item_id = legacy_item_id, legacy_item_id = NULL WHERE legacy_item_id IS NOT NULL;
DELETE FROM schema_migrations WHERE id = '021_migrate_progress.js';
