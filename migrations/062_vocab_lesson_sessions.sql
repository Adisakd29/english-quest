-- v1.10.0 Phase 2: บทเรียนคำศัพท์ v2 — เซิร์ฟเวอร์สร้างโจทย์และเก็บเฉลยเอง (client ได้แค่รหัสตัวเลือกแบบสุ่ม)
CREATE TABLE IF NOT EXISTS vocab_lesson_sessions (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       VARCHAR(2) NOT NULL,
  unit_id     VARCHAR(40),
  mode        VARCHAR(10) NOT NULL,                 -- learn | review | due | listen
  questions   JSONB NOT NULL,                        -- รวมเฉลย — ห้ามส่งให้ client
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,    -- index → { correct, at }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocab_lesson_sessions_user ON vocab_lesson_sessions (user_id, created_at DESC);
