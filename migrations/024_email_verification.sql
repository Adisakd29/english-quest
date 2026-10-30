-- ===== P0-e: ยืนยันอีเมล =====
-- email_verified        ยืนยันแล้วหรือยัง (Google ที่อีเมลตรงกัน = ยืนยันแล้ว)
-- verification_required บัญชีที่สมัครตอนเปิด REQUIRE_EMAIL_VERIFICATION=true ต้องยืนยันก่อนเข้าสู่ระบบ
--                       (ผู้ใช้เดิม = FALSE -> ไม่ถูกล็อก แต่จะเห็นแถบชวนให้ยืนยัน)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE;

-- บัญชีที่เชื่อม Google และอีเมลตรงกับที่ Google ยืนยันแล้ว = ยืนยันแล้ว
UPDATE users u SET email_verified = TRUE, email_verified_at = NOW()
  FROM user_identities i
 WHERE i.user_id = u.id AND i.provider = 'google' AND i.email_verified
   AND LOWER(i.email) = LOWER(u.email) AND NOT u.email_verified;

-- เก็บเฉพาะ hash ของ token (ไม่เก็บ token จริง) · ใช้ได้ครั้งเดียว · หมดอายุ 24 ชั่วโมง
CREATE TABLE IF NOT EXISTS email_verifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications (user_id);
