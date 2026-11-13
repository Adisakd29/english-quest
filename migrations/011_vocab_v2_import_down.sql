-- ย้อนกลับ 010 + 011: ลบฐานคำศัพท์ใหม่ (ตารางเดิมไม่ถูกแตะ จึงไม่กระทบระบบที่ใช้งานอยู่)
-- ⚠️ คำแปล/เนื้อหาที่ใส่ใน vocab_senses ภายหลังจะหายด้วย — สำรองก่อนรัน
DROP TABLE IF EXISTS vocab_senses;
DROP TABLE IF EXISTS vocab_entries;
DELETE FROM schema_migrations WHERE id IN ('010_vocab_v2_schema.sql', '011_vocab_v2_import.js');
