-- ย้อนกลับ 012: ล้างเฉพาะคำแปล AI ที่ยังไม่ผ่านการตรวจ (คำแปลที่คนตรวจแล้วไม่ถูกแตะ)
UPDATE vocab_senses
   SET thai_meaning = NULL, translation_source = NULL, translation_status = 'missing', translation_note = NULL
 WHERE translation_source = 'AI_GENERATED' AND translation_status = 'unreviewed';
DELETE FROM schema_migrations WHERE id = '012_thai_meanings.js';
