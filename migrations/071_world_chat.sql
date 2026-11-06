-- v1.15.0: แชทโลก (World Chat) — ห้องแชทเดียวที่ทุกคนในแอปพิมพ์คุยกันได้ (เพิ่มอย่างเดียว · ไม่แตะแชทเพื่อน/Lobby เดิม)
-- ความปลอดภัย: ตัวกรองคำหยาบ/ข้อมูลติดต่อเดิม (utils/chatFilter) · จำกัดอัตรา · Block/ปิดเสียง/รายงาน · ผู้ดูแลซ่อนข้อความ/ห้ามแชท
-- ข้อมูลที่ส่งออก: รหัสผู้ใช้ ชื่อผู้ใช้ รูปโปรไฟล์ เลเวล ข้อความ เวลา เท่านั้น (ไม่มีอีเมล/เบอร์/ตำแหน่ง)
CREATE TABLE IF NOT EXISTS world_chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        VARCHAR(300) NOT NULL,
  flagged     VARCHAR(24),                       -- ตัวกรองจับอะไร (เช่น profanity) · null = ปกติ
  hidden_at   TIMESTAMPTZ,                       -- ถูกซ่อน (เจ้าของลบเอง / ผู้ดูแลซ่อน) — เก็บไว้เป็นหลักฐานจนครบอายุ
  hidden_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_world_chat_messages_time ON world_chat_messages (id DESC) WHERE hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_world_chat_messages_user ON world_chat_messages (user_id, created_at DESC);

-- ปิด/เปิดการรับแชทโลกรายคน (ไม่มีแถว = เปิด)
ALTER TABLE user_world_settings ADD COLUMN IF NOT EXISTS global_chat BOOLEAN NOT NULL DEFAULT TRUE;
