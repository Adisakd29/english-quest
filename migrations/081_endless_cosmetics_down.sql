-- ย้อน v1.21.0 (ลบเฉพาะสิ่งที่ 081 เพิ่ม · Coin ที่ได้/ใช้ไปแล้วยังอยู่ใน coin_transactions ตามเดิม)
DROP TABLE IF EXISTS endless_runs;
DROP TABLE IF EXISTS level_reward_claims;
DROP TABLE IF EXISTS user_cosmetics;
ALTER TABLE users DROP COLUMN IF EXISTS profile_frame;
ALTER TABLE users DROP COLUMN IF EXISTS chat_frame;
