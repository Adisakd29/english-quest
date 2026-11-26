-- 035: แจ้งเตือนบนโทรศัพท์ (Web Push) + ป๊อปอัปแพตช์ล่าสุด
-- ค่ากลางของแอป (เช่น VAPID key ที่สร้างอัตโนมัติเมื่อไม่ได้ตั้ง env) — ต้องคงที่ข้าม deploy ไม่งั้นการสมัครแจ้งเตือนเดิมใช้ไม่ได้
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- อุปกรณ์ที่อนุญาตแจ้งเตือน (หนึ่งคนมีได้หลายเครื่อง)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  fail_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- การตั้งค่าเตือน "อย่าลืมเข้ามาเล่น" (เวลาท้องถิ่นของผู้ใช้)
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TIME NOT NULL DEFAULT '19:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Bangkok';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminded_on DATE;

-- แพตช์โน้ตล่าสุดที่ผู้ใช้เห็นแล้ว (id ของ config/changelog.js)
ALTER TABLE users ADD COLUMN IF NOT EXISTS changelog_seen VARCHAR(32);
