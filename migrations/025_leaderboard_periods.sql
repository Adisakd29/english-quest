-- ===== P1-3: Leaderboard รายสัปดาห์ / รายเดือน =====
-- รวม EXP จาก exp_log ตามช่วงเวลา -> ต้องกรองด้วย created_at ได้เร็ว
CREATE INDEX IF NOT EXISTS idx_exp_log_created_user ON exp_log (created_at, user_id);
