-- v1.9.0: เปลี่ยนสีเครื่องแต่งกาย (Material Color Variants) — เพิ่มตาราง/คอลัมน์เท่านั้น ไม่แตะข้อมูลเดิม (ของ/Coin/ชุด/Item ID เดิมครบ)
-- สีผูกกับ "ของที่เป็นเจ้าของ" (ชิ้นละ 1 แถว) → สวมชิ้นเดิมเมื่อไรก็ได้สีเดิม · Preset เก็บสำเนาสีของชิ้นในชุดนั้น
CREATE TABLE IF NOT EXISTS user_item_colors (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id          VARCHAR(40) NOT NULL REFERENCES avatar_items(id) ON UPDATE CASCADE,
  primary_color    CHAR(7) CHECK (primary_color ~ '^#[0-9a-f]{6}$'),
  secondary_color  CHAR(7) CHECK (secondary_color ~ '^#[0-9a-f]{6}$'),
  accent_color     CHAR(7) CHECK (accent_color ~ '^#[0-9a-f]{6}$'),
  material_variant VARCHAR(16),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE outfit_presets ADD COLUMN IF NOT EXISTS colors JSONB NOT NULL DEFAULT '{}'::jsonb;
-- World Free Text Chat: ผู้ดูแลปิด "พิมพ์ข้อความเอง" เฉพาะบุคคลได้ (ยังใช้ประโยคสำเร็จรูปได้) → kind 'text'
ALTER TABLE world_restrictions DROP CONSTRAINT IF EXISTS ck_world_restr_kind;
ALTER TABLE world_restrictions ADD CONSTRAINT ck_world_restr_kind CHECK (kind IN ('chat', 'lobby', 'text'));
-- Avatar Showcase: ค่าเริ่มต้น "ทุกคน" (คนที่ไม่ใช่เพื่อนกดดูจากกระดานอันดับได้) · ค่าเดิม 'friends' มาจากค่าเริ่มต้นของคอลัมน์ → ปรับเป็น 'public'
-- เจ้าของยังตั้ง "เพื่อน" หรือ "ฉันเท่านั้น" ได้เองในตั้งค่าความเป็นส่วนตัว · รูปโปรไฟล์ที่แสดงยังเป็นตามที่เจ้าของเลือก (รูปเดิม/Avatar)
ALTER TABLE user_privacy_settings ALTER COLUMN avatar_visibility SET DEFAULT 'public';
UPDATE user_privacy_settings SET avatar_visibility = 'public' WHERE avatar_visibility = 'friends';
