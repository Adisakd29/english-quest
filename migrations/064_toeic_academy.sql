-- v1.10.0 Phase 4: TOEIC Academy — บันทึกว่าอ่านบทเรียนกลยุทธ์ Part ไหนจบแล้ว (ไม่ให้ EXP/Coin)
CREATE TABLE IF NOT EXISTS toeic_academy_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part         SMALLINT NOT NULL CHECK (part BETWEEN 1 AND 7),
  check_score  SMALLINT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, part)
);
