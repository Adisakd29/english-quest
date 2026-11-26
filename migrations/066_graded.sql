-- v1.10.0 Phase 5: Graded Reading & Listening — ความคืบหน้าต่อเรื่อง/โหมด (เก็บคะแนนดีที่สุด)
CREATE TABLE IF NOT EXISTS graded_progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_id     VARCHAR(8) NOT NULL,
  mode        VARCHAR(10) NOT NULL CHECK (mode IN ('reading', 'listening')),
  best_score  SMALLINT NOT NULL,
  total       SMALLINT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, text_id, mode)
);
