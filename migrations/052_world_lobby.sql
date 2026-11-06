-- v1.9.0: EnglishQuest World (Multiplayer 3D Lobby) — เพิ่มตารางใหม่เท่านั้น · ไม่แตะข้อมูลผู้ใช้/การเรียน/Inventory เดิม
-- สถานะห้อง/ตำแหน่งผู้เล่นอยู่ในหน่วยความจำ (ข้อมูลชั่วคราว) · ตารางนี้เก็บเฉพาะการตั้งค่า ความปลอดภัย และหลักฐานการกลั่นกรอง

-- การตั้งค่าความเป็นส่วนตัวของ Lobby (ไม่มีแถว = ค่าเริ่มต้นแบบนักเรียนใน config/world.js)
CREATE TABLE IF NOT EXISTS user_world_settings (
  user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_in_lobby         BOOLEAN NOT NULL DEFAULT TRUE,
  allow_friend_invites  BOOLEAN NOT NULL DEFAULT TRUE,
  practice_invites      VARCHAR(8) NOT NULL DEFAULT 'friends',
  chat_mode             VARCHAR(8) NOT NULL DEFAULT 'phrases',
  join_my_room          VARCHAR(8) NOT NULL DEFAULT 'friends',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_world_practice CHECK (practice_invites IN ('nobody', 'friends', 'everyone')),
  CONSTRAINT ck_world_chat CHECK (chat_mode IN ('off', 'phrases', 'text')),
  CONSTRAINT ck_world_join CHECK (join_my_room IN ('nobody', 'friends'))
);

-- ปิดเสียง (Mute) ใน Lobby: ไม่เห็นข้อความ/ท่าทักทายของอีกฝ่าย (อีกฝ่ายไม่รู้ตัว) · ต่างจากบล็อก (user_blocks เดิม)
CREATE TABLE IF NOT EXISTS world_mutes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, muted_id),
  CONSTRAINT ck_world_mute_self CHECK (user_id <> muted_id)
);

-- บันทึกแชทใน Lobby (หลักฐานสำหรับรายงาน/ผู้ดูแล) — เก็บ 30 วันแล้วลบอัตโนมัติ (WORLD.chatLogDays)
CREATE TABLE IF NOT EXISTS world_chat_log (
  id         BIGSERIAL PRIMARY KEY,
  room_id    VARCHAR(16) NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       VARCHAR(8) NOT NULL,          -- local / room
  kind       VARCHAR(8) NOT NULL,          -- phrase / text
  content    VARCHAR(240) NOT NULL,
  flagged    VARCHAR(24),                  -- เหตุผลที่ตัวกรองจับ (ถ้ามี) · null = ปกติ
  delivered  INTEGER NOT NULL DEFAULT 0,   -- จำนวนผู้รับ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_world_chat_user ON world_chat_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_chat_time ON world_chat_log (created_at);

-- การจำกัดสิทธิ์ใน Lobby (ผู้ดูแลกำหนด) + การอุทธรณ์ (Appeal/Review)
CREATE TABLE IF NOT EXISTS world_restrictions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(8) NOT NULL,                 -- chat = ห้ามแชท · lobby = ห้ามเข้า Lobby
  reason        VARCHAR(300) NOT NULL,
  report_id     INTEGER REFERENCES user_reports(id) ON DELETE SET NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at     TIMESTAMPTZ,
  appeal_text   VARCHAR(500),
  appeal_at     TIMESTAMPTZ,
  appeal_status VARCHAR(10) NOT NULL DEFAULT 'none',  -- none / pending / upheld / lifted
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   VARCHAR(300),
  CONSTRAINT ck_world_restr_kind CHECK (kind IN ('chat', 'lobby')),
  CONSTRAINT ck_world_restr_appeal CHECK (appeal_status IN ('none', 'pending', 'upheld', 'lifted'))
);
CREATE INDEX IF NOT EXISTS idx_world_restr_user ON world_restrictions (user_id, ends_at);

-- รายงานผู้ใช้: ใช้ตาราง user_reports เดิม + ระบุแหล่ง (world) และบริบท (ห้อง/ข้อความที่เกี่ยวข้อง) — คอลัมน์ใหม่ nullable
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS source VARCHAR(16);
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS context JSONB;
