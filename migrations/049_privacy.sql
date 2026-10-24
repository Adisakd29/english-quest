-- v1.8.0: Privacy Settings (ต่อบัญชี) — ไม่มีแถว = ใช้ค่าเริ่มต้นแบบ Privacy-by-Default ใน config/privacy.js
-- ไม่แตะตาราง users / friendships / user_blocks เดิม (บล็อกใช้ user_blocks เดิม)
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id                  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_visibility       VARCHAR(8) NOT NULL DEFAULT 'friends',
  avatar_visibility        VARCHAR(8) NOT NULL DEFAULT 'friends',
  level_visibility         VARCHAR(8) NOT NULL DEFAULT 'friends',
  rank_visibility          VARCHAR(8) NOT NULL DEFAULT 'friends',
  achievements_visibility  VARCHAR(8) NOT NULL DEFAULT 'friends',
  stats_visibility         VARCHAR(8) NOT NULL DEFAULT 'private',
  vocab_visibility         VARCHAR(8) NOT NULL DEFAULT 'private',
  grammar_visibility       VARCHAR(8) NOT NULL DEFAULT 'private',
  toeic_visibility         VARCHAR(8) NOT NULL DEFAULT 'private',
  coins_visibility         VARCHAR(8) NOT NULL DEFAULT 'private',
  inventory_visibility     VARCHAR(8) NOT NULL DEFAULT 'private',
  friends_list_visibility  VARCHAR(8) NOT NULL DEFAULT 'private',
  allow_friend_requests    BOOLEAN NOT NULL DEFAULT TRUE,
  discoverable             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_privacy_levels CHECK (
    profile_visibility IN ('private','friends','public') AND avatar_visibility IN ('private','friends','public') AND
    level_visibility IN ('private','friends','public') AND rank_visibility IN ('private','friends','public') AND
    achievements_visibility IN ('private','friends','public') AND stats_visibility IN ('private','friends','public') AND
    vocab_visibility IN ('private','friends','public') AND grammar_visibility IN ('private','friends','public') AND
    toeic_visibility IN ('private','friends','public') AND coins_visibility IN ('private','friends','public') AND
    inventory_visibility IN ('private','friends','public') AND friends_list_visibility IN ('private','friends','public'))
);
