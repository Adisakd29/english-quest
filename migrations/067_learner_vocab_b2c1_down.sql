-- ย้อนกลับ 067: คืนความหมาย/ตัวอย่าง/คำแปลเดิมของ B2–C1 จากตารางสำรอง (ไม่แตะ A1–B1 · คงคำแปลที่ผู้ดูแลตรวจแล้ว)
UPDATE vocab_senses v SET simple_definition = b.simple_definition, definition_source = b.definition_source,
       example_sentence = b.example_sentence, example_translation = b.example_translation,
       thai_meaning = CASE WHEN v.translation_status = 'reviewed' THEN v.thai_meaning ELSE b.thai_meaning END,
       translation_note = CASE WHEN v.translation_status = 'reviewed' THEN v.translation_note ELSE b.translation_note END,
       collocations = b.collocations, verification_status = b.verification_status, learner = NULL, updated_at = NOW()
  FROM vocab_senses_prelearner_backup b WHERE v.public_id = b.public_id AND v.cefr IN ('B2', 'C1');
DELETE FROM vocab_senses_prelearner_backup WHERE public_id LIKE 'B2-%' OR public_id LIKE 'C1-%';
DELETE FROM schema_migrations WHERE id = '067_learner_vocab_b2c1.js';
