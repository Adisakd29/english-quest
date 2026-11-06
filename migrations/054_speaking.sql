-- Speaking (ฝึกพูด/ออกเสียง) — เพิ่มตารางเท่านั้น ไม่แตะข้อมูลเดิม
-- เก็บเฉพาะ "คะแนน" ต่อประโยค/คำ — ไม่เก็บเสียง และไม่เก็บข้อความที่ระบบรู้จำเสียงได้ยิน
CREATE TABLE IF NOT EXISTS speaking_progress (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id        VARCHAR(64) NOT NULL,
  level          VARCHAR(2) NOT NULL,
  best_speak     SMALLINT,                    -- คะแนนพูดดีที่สุด 0–100 (คำนวณในเครื่องผู้ใช้)
  best_type      SMALLINT,                    -- คะแนนฟังแล้วพิมพ์ดีที่สุด 0–100 (ตรวจฝั่งเซิร์ฟเวอร์)
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_score     SMALLINT,
  first_pass_at  TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT ck_speak_scores CHECK ((best_speak IS NULL OR best_speak BETWEEN 0 AND 100) AND (best_type IS NULL OR best_type BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS idx_speaking_user_updated ON speaking_progress (user_id, updated_at DESC);
