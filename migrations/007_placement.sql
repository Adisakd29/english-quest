-- ===== Phase 3A: แบบทดสอบวัดระดับ (Placement Test) =====
-- questions เก็บข้อสอบ "พร้อมเฉลย" ไว้ฝั่งเซิร์ฟเวอร์เท่านั้น — ไม่เคยส่งเฉลยไปหาผู้เล่นก่อนส่งคำตอบ
-- result เก็บผลประเมิน (Estimated CEFR Level) หลังส่ง
CREATE TABLE IF NOT EXISTS placement_attempts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questions     JSONB   NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_placement_user ON placement_attempts (user_id, created_at DESC);
