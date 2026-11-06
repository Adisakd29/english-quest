-- ย้อน 041: ลบเฉพาะสิ่งที่ 041/042 เพิ่ม (แถว C2 + progress ของ C2) แล้วคืนข้อจำกัดเดิม
-- คำเตือน: progress ของ C2 จะหายไป แต่ A1–C1 ไม่กระทบ
DROP TABLE IF EXISTS c2_sessions;
DROP TABLE IF EXISTS vocab_lessons;
DROP INDEX IF EXISTS idx_answer_events_facet;
ALTER TABLE answer_events DROP COLUMN IF EXISTS facet;

DELETE FROM word_progress WHERE level = 'C2';
DELETE FROM vocab_senses WHERE cefr = 'C2';
DELETE FROM vocab_entries e WHERE NOT EXISTS (SELECT 1 FROM vocab_senses s WHERE s.entry_id = e.id);

DROP INDEX IF EXISTS idx_vocab_senses_verification;
DROP INDEX IF EXISTS idx_vocab_senses_c2_pool;
DROP INDEX IF EXISTS uq_vocab_senses_c2_key;
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_tier;
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_verification;
ALTER TABLE vocab_senses DROP COLUMN IF EXISTS reviewed_at, DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS c2,
  DROP COLUMN IF EXISTS base_sense_id, DROP COLUMN IF EXISTS verification_issues, DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS variant, DROP COLUMN IF EXISTS tier, DROP COLUMN IF EXISTS frequency_band,
  DROP COLUMN IF EXISTS real_world_priority, DROP COLUMN IF EXISTS connotation, DROP COLUMN IF EXISTS register,
  DROP COLUMN IF EXISTS kind, DROP COLUMN IF EXISTS display_form, DROP COLUMN IF EXISTS c2_key;

ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_pos;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_pos CHECK (pos IS NULL OR pos IN (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'exclamation',
  'number', 'modal verb', 'auxiliary verb', 'indefinite article', 'definite article', 'infinitive marker'));
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_source_list;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_source_list
  CHECK (source_list IN ('OXFORD_3000', 'OXFORD_5000_ADDITIONAL', 'SUPPLEMENTAL'));
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_cefr;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_cefr CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1'));
