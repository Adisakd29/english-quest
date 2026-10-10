-- ===== แชทระหว่างเพื่อน (ข้อความส่วนตัว) =====
-- ส่งได้เฉพาะเพื่อนที่ตอบรับแล้วและไม่ได้บล็อกกัน (ตรวจที่ API) · เก็บข้อความ 180 วัน (ลบอัตโนมัติตอนเริ่มเซิร์ฟเวอร์/ทุกวัน)
CREATE TABLE IF NOT EXISTS direct_messages (
  id           BIGSERIAL PRIMARY KEY,
  sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         VARCHAR(500) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at      TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);
-- บทสนทนาของคู่หนึ่ง (เรียงตามเวลา) · ข้อความที่ยังไม่อ่านของผู้รับ
CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), id DESC);
CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages (recipient_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages (created_at);
