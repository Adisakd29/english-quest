-- 051: Halloween Costume Festival 2026 — Daily Login Reward + Learning Event Quests
-- เพิ่มตาราง/ค่า CHECK เท่านั้น · ไม่แก้หรือลบข้อมูลเดิม (Inventory / Coin / EXP / Rank ไม่ถูกแตะ)

-- ช่องทางได้ของใหม่ใน Inventory เดิม (ไม่มี Inventory แยก): EVENT_LOGIN = รางวัลล็อกอินรายวัน · EVENT_QUEST = เควสต์กิจกรรม
ALTER TABLE user_inventory DROP CONSTRAINT IF EXISTS user_inventory_acquisition_type_check;
ALTER TABLE user_inventory ADD CONSTRAINT user_inventory_acquisition_type_check
  CHECK (acquisition_type IN ('purchase', 'achievement', 'event', 'starter', 'admin', 'event_login', 'event_quest'));

-- รับรางวัลล็อกอินรายวัน: วันละครั้ง (claim_date = วันที่ตามเวลาไทยจากนาฬิกาเซิร์ฟเวอร์) · Day N ได้ครั้งเดียว
--   UNIQUE ทั้งสองแบบ = กดพร้อมกันหลายเครื่อง/หลายแท็บก็รับซ้ำไม่ได้ (ฐานข้อมูลกันให้ แม้โค้ดเช็กพลาด)
CREATE TABLE IF NOT EXISTS event_login_claims (
  event_id    VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_no      SMALLINT NOT NULL CHECK (day_no BETWEEN 1 AND 31),
  claim_date  DATE NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, day_no),
  UNIQUE (event_id, user_id, claim_date)
);

-- รับรางวัลเควสต์: เควสต์ละครั้ง
CREATE TABLE IF NOT EXISTS event_quest_claims (
  event_id    VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id    VARCHAR(32) NOT NULL,
  reward      JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, quest_id)
);
