-- v1.10.0 Phase 3: Writing Studio — เก็บเฉพาะสถิติการตรวจ (ไม่เก็บข้อความที่ผู้ใช้เขียน)
CREATE TABLE IF NOT EXISTS writing_studio_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_id    VARCHAR(30),
  words        INTEGER NOT NULL,
  sentences    INTEGER NOT NULL,
  errors       INTEGER NOT NULL,
  vocab_level  VARCHAR(2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_writing_studio_logs_user ON writing_studio_logs (user_id, created_at DESC);
