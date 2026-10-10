-- ===== Phase 3C: Unit Test + Boss Challenge =====
-- kind: 'unit' (ref = รหัส Unit เช่น A1-food-1) | 'boss' (ref = ระดับ เช่น A1)
-- questions เก็บข้อสอบพร้อมเฉลยไว้ฝั่งเซิร์ฟเวอร์เท่านั้น
CREATE TABLE IF NOT EXISTS assessments (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(8)  NOT NULL,
  ref           VARCHAR(40) NOT NULL,
  questions     JSONB       NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'in_progress',
  passed        BOOLEAN,
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments (user_id, kind, ref);
