-- v1.10.0: หมวด "ภาษาอังกฤษเพื่อการทำงาน" (เฉพาะสมาชิก Premium) — เนื้อหาอยู่ใน data/premium/work/*.json
-- เพิ่มตารางใหม่อย่างเดียว · ไม่ให้ EXP/Coin (กันความได้เปรียบของผู้ที่จ่ายเงิน) — เก็บความคืบหน้าแยก
CREATE TABLE IF NOT EXISTS work_progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(12) NOT NULL,
  correct     INTEGER NOT NULL DEFAULT 0,
  wrong       INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,     -- ตอบถูกติดกัน (≥ 2 = ชำนาญ)
  last_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS work_sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic        VARCHAR(16) NOT NULL,
  items        JSONB NOT NULL,                -- [{ itemId, type: situation|cloze, perm: [4], selected, correct }]
  status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  score        SMALLINT,
  total        SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user ON work_sessions (user_id, created_at DESC);
