-- ===== V7: เข้าสู่ระบบด้วย Google =====
-- เก็บเท่าที่จำเป็น: provider, provider_user_id (sub), อีเมลที่ Google ยืนยันแล้ว, ชื่อ, รูป
-- ไม่เก็บ access token / refresh token (ใช้ ID token ตรวจครั้งเดียวตอนเข้าสู่ระบบ)
CREATE TABLE IF NOT EXISTS user_identities (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         VARCHAR(16) NOT NULL,          -- 'google'
  provider_user_id VARCHAR(255) NOT NULL,         -- Google "sub" (ไม่เปลี่ยนแม้ผู้ใช้เปลี่ยนอีเมล)
  email            VARCHAR(255),
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  display_name     VARCHAR(255),
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ,
  CONSTRAINT uq_identity_provider_user UNIQUE (provider, provider_user_id),
  CONSTRAINT uq_identity_user_provider UNIQUE (user_id, provider)   -- 1 บัญชีเชื่อม Google ได้ 1 บัญชี
);
-- บัญชีที่สมัครด้วย Google อย่างเดียวไม่มีรหัสผ่าน
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
