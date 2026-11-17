-- v1.9.0: TOEIC แผนฝึกรายวัน (3 งานสั้น ~10–15 นาที) + streak
-- เพิ่มตารางใหม่อย่างเดียว · session ของแต่ละงานคือ Practice เดิม (toeic_sessions.config.dailyTask = 'YYYY-MM-DD:k')
CREATE TABLE IF NOT EXISTS toeic_daily_plans (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           DATE NOT NULL,                 -- วันตามเวลาไทย (UTC+7)
  tasks         JSONB NOT NULL,                -- [{ k, kind, part, group?, body, th, partName, reason, minutes }]
  completed_at  TIMESTAMPTZ,                   -- ครบทุกงาน
  exp_awarded   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_toeic_daily_user ON toeic_daily_plans (user_id, day DESC);
