-- v1.17.0: แชทโลกบน Game Lobby — ต่อยอดตารางแชทโลกเดิม (ไม่สร้างระบบแชทชุดใหม่)
-- 1) การตั้งค่าแชทรายคน (ค่าเริ่มต้นแบบปลอดภัย: แสดงแชทย่อ · ไม่มีเสียง · แจ้งจำนวนข้อความใหม่ · พิมพ์เองได้)
ALTER TABLE user_world_settings ADD COLUMN IF NOT EXISTS chat_mini       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_world_settings ADD COLUMN IF NOT EXISTS chat_sound      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_world_settings ADD COLUMN IF NOT EXISTS chat_notify     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_world_settings ADD COLUMN IF NOT EXISTS chat_quick_only BOOLEAN NOT NULL DEFAULT FALSE;
-- 2) ข้อความ: รหัสฝั่งเครื่องผู้ส่ง (ส่งซ้ำตอนเน็ตหลุดไม่เกิดข้อความซ้ำ) · รหัส Quick Chat (ข้อความสำเร็จรูป)
ALTER TABLE world_chat_messages ADD COLUMN IF NOT EXISTS client_id VARCHAR(40);
ALTER TABLE world_chat_messages ADD COLUMN IF NOT EXISTS quick_id  VARCHAR(24);
CREATE UNIQUE INDEX IF NOT EXISTS uq_world_chat_client ON world_chat_messages (user_id, client_id) WHERE client_id IS NOT NULL;
