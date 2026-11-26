-- v1.27.1 World Raid: พลังชีวิตผู้เล่น (ตอบผิด/หมดเวลา = บอสตีกลับ · พลังหมด = จบรอบ)
-- เพิ่มคอลัมน์อย่างเดียว ไม่ลบ/แก้ข้อมูลเดิม · รอบเก่าที่ไม่มีค่า (NULL) = ไม่ใช้ระบบพลังชีวิต
ALTER TABLE raid_attempts ADD COLUMN IF NOT EXISTS player_hp INTEGER;
ALTER TABLE raid_attempts ADD COLUMN IF NOT EXISTS player_max_hp INTEGER;
ALTER TABLE raid_attempts ADD COLUMN IF NOT EXISTS knocked_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE raid_question_responses ADD COLUMN IF NOT EXISTS player_hit SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE raid_question_responses ADD COLUMN IF NOT EXISTS player_heal SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE raid_question_responses ADD COLUMN IF NOT EXISTS player_hp_after INTEGER;
