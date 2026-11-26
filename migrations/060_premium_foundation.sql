-- v1.10.0 Phase 1: Premium Foundation — สถานะสมาชิก · ทดลองใช้ 7 วัน · บันทึกการกระทำของผู้ดูแล · โควตา AI
-- เพิ่มคอลัมน์/ตารางใหม่เท่านั้น · สมาชิกเดิมทุกคน = active (ไม่เปลี่ยนวันหมดอายุ)
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS status        VARCHAR(12) NOT NULL DEFAULT 'active';   -- trial | active | canceled
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS canceled_at   TIMESTAMPTZ;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(200);
DO $$ BEGIN
  ALTER TABLE memberships ADD CONSTRAINT memberships_status_check CHECK (status IN ('trial', 'active', 'canceled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ทดลองใช้ได้ครั้งเดียวต่อบัญชี (เก็บแยก — ซื้อแล้ว/หมดอายุแล้วก็ยังจำว่าเคยใช้)
CREATE TABLE IF NOT EXISTS membership_trials (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at     TIMESTAMPTZ NOT NULL
);

-- บันทึกการกระทำสำคัญ (ผู้ดูแล/ระบบอัตโนมัติ) — ใคร ทำอะไร กับใคร เมื่อไร
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- NULL = ระบบอัตโนมัติ
  action       VARCHAR(40) NOT NULL,
  target_user  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_ref   VARCHAR(40),
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_user, created_at DESC);

-- โควตาการใช้ AI ต่อวัน (เวลาไทย) — เตรียมไว้สำหรับ AI Speaking / Writing / Tutor (Phase 3)
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       DATE NOT NULL,
  feature   VARCHAR(20) NOT NULL,
  used      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, feature)
);
