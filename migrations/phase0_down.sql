-- ย้อนกลับการเปลี่ยนแปลง schema ของ Phase 0 (ใช้เฉพาะกรณีจำเป็นจริง ๆ)
-- หมายเหตุ: การลบคอลัมน์จะทำให้ token_version/last_exp_at หายไป
-- แต่ไม่กระทบข้อมูลผู้ใช้/EXP/ความก้าวหน้า
DROP INDEX IF EXISTS idx_users_exp;
DROP INDEX IF EXISTS idx_exp_log_user_time;
ALTER TABLE word_progress DROP COLUMN IF EXISTS last_exp_at;
ALTER TABLE users DROP COLUMN IF EXISTS token_version;
