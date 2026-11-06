-- ย้อนกลับ 061: คืนความหมาย/ตัวอย่าง/คำแปลเดิมจากตารางสำรอง แล้วลบคอลัมน์ learner
UPDATE vocab_senses v SET simple_definition = b.simple_definition, definition_source = b.definition_source,
       example_sentence = b.example_sentence, example_translation = b.example_translation,
       thai_meaning = CASE WHEN v.translation_status = 'reviewed' THEN v.thai_meaning ELSE b.thai_meaning END,
       translation_note = CASE WHEN v.translation_status = 'reviewed' THEN v.translation_note ELSE b.translation_note END,
       collocations = b.collocations, verification_status = b.verification_status, updated_at = NOW()
  FROM vocab_senses_prelearner_backup b WHERE v.public_id = b.public_id;
ALTER TABLE vocab_senses DROP COLUMN IF EXISTS learner;
DROP TABLE IF EXISTS vocab_senses_prelearner_backup;
DELETE FROM schema_migrations WHERE id = '061_learner_vocab.js';
