-- v1.9.0: TOEIC-style Full Mock Test (Listening Part 1–4 + Reading Part 5–7)
-- เพิ่มตารางใหม่อย่างเดียว · แต่ละ Part ใช้ Mock เดิม (toeic_sessions.config.fullTestId ชี้มาที่ตารางนี้)
CREATE TABLE IF NOT EXISTS toeic_full_tests (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
  result       JSONB,                 -- คะแนนประมาณการ Listening/Reading + รายละเอียดราย Part (ตอนจบ)
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_toeic_full_user ON toeic_full_tests (user_id, started_at DESC);
