-- v1.19.0 ติวสอบ TCAS (TGAT1 การสื่อสารภาษาอังกฤษ / A-Level ภาษาอังกฤษ) — ข้อสอบต้นฉบับของ EnglishQuest (data/tcas)
CREATE TABLE IF NOT EXISTS tcas_sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam         VARCHAR(10) NOT NULL,            -- tgat1 | alevel
  set_id       VARCHAR(16) NOT NULL,
  mode         VARCHAR(10) NOT NULL,            -- mock (จับเวลา เฉลยตอนส่ง) | practice (ทีละส่วน เฉลยทันที)
  section      VARCHAR(24),                     -- practice: ส่วนที่ฝึก
  item_ids     TEXT[] NOT NULL,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { itemId: choice }
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at  TIMESTAMPTZ,                     -- mock เท่านั้น
  finished_at  TIMESTAMPTZ,
  correct      SMALLINT,
  total        SMALLINT,
  score        NUMERIC(5,2),                    -- คะแนนเต็ม 100 (mock)
  result       JSONB
);
CREATE INDEX IF NOT EXISTS idx_tcas_sessions_user ON tcas_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tcas_sessions_active ON tcas_sessions (user_id) WHERE finished_at IS NULL;

-- ผู้ใช้แจ้งข้อสอบผิด/กำกวม · ผู้ดูแลซ่อนข้อได้ทันที (ไม่ลบไฟล์ข้อสอบ)
CREATE TABLE IF NOT EXISTS tcas_reports (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(20) NOT NULL,
  reason      VARCHAR(24) NOT NULL,
  note        VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS tcas_item_state (
  item_id     VARCHAR(20) PRIMARY KEY,
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  note        VARCHAR(300),
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
