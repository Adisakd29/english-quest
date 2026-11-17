-- ย้อน v1.14.0 Word Atlas: ลบเฉพาะตารางของ Word Atlas (word_progress / answer_events / EXP ที่ได้ไปแล้วไม่ถูกแตะ)
DROP TABLE IF EXISTS atlas_sessions;
DROP TABLE IF EXISTS atlas_reward_events;
DROP TABLE IF EXISTS atlas_collection;
DROP TABLE IF EXISTS atlas_unit_progress;
DROP TABLE IF EXISTS atlas_unit_items;
DROP TABLE IF EXISTS atlas_units;
DROP TABLE IF EXISTS atlas_senses;
DROP TABLE IF EXISTS atlas_lemmas;
DROP TABLE IF EXISTS atlas_meta;
