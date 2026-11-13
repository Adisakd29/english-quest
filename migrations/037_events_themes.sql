-- 037: กิจกรรมพิเศษ (Halloween 2026) + คลังธีมของผู้เล่น
-- กิจกรรม: เก็บ Event ID / เวลาเริ่ม-จบ ไว้ในตาราง (สำเนาจาก config ทุกครั้งที่เซิร์ฟเวอร์เริ่ม) เพื่อตรวจย้อนหลังได้
CREATE TABLE IF NOT EXISTS events (
  id         VARCHAR(48) PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- กิจกรรมที่ผู้เล่นทำสำเร็จ (บันทึกจากเซิร์ฟเวอร์เท่านั้น เช่น จบเกม Ranked / ส่งแบบฝึก) — ref ไม่ซ้ำกันต่อคน กันนับซ้ำ
CREATE TABLE IF NOT EXISTS event_activity (
  id         BIGSERIAL PRIMARY KEY,
  event_id   VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(32) NOT NULL,
  ref        VARCHAR(96) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_event_activity_user ON event_activity (event_id, user_id);

-- ความคืบหน้า/สำเร็จของแต่ละภารกิจ
CREATE TABLE IF NOT EXISTS event_mission_progress (
  event_id     VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id   VARCHAR(32) NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  target       INTEGER NOT NULL,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, mission_id)
);

-- Halloween Challenge: คำถาม/เฉลยอยู่ฝั่งเซิร์ฟเวอร์ · ส่งคำตอบได้ครั้งเดียวต่อรอบ
CREATE TABLE IF NOT EXISTS event_challenge_attempts (
  id          BIGSERIAL PRIMARY KEY,
  event_id    VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questions   JSONB NOT NULL,
  score       INTEGER,
  passed      BOOLEAN,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_event_challenge_user ON event_challenge_attempts (event_id, user_id, started_at);

-- การรับรางวัล: หนึ่งครั้งต่อคนต่อกิจกรรม (PRIMARY KEY กันรับซ้ำแม้กดพร้อมกันหลายเครื่อง)
CREATE TABLE IF NOT EXISTS event_reward_claims (
  event_id   VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id  VARCHAR(64) NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by INTEGER,          -- NULL = ผู้เล่นรับเอง · มีค่า = ผู้ดูแลแจกย้อนหลัง
  PRIMARY KEY (event_id, user_id)
);

-- คลังธีมของผู้เล่น (ถาวร — ไม่หายเมื่อกิจกรรมจบ)
CREATE TABLE IF NOT EXISTS user_themes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id    VARCHAR(48) NOT NULL,
  source      VARCHAR(64) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, theme_id)
);

-- ธีมที่เลือกใช้ (จำในบัญชี -> เข้าสู่ระบบเครื่องใหม่ยังใช้ธีมเดิม)
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(48);
