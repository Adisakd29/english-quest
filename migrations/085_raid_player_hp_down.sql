-- ย้อน v1.27.1 พลังชีวิตผู้เล่น (ลบเฉพาะคอลัมน์ที่เพิ่ม · ดาเมจ/อันดับ/รางวัลไม่กระทบ)
ALTER TABLE raid_question_responses DROP COLUMN IF EXISTS player_hp_after;
ALTER TABLE raid_question_responses DROP COLUMN IF EXISTS player_heal;
ALTER TABLE raid_question_responses DROP COLUMN IF EXISTS player_hit;
ALTER TABLE raid_attempts DROP COLUMN IF EXISTS knocked_out;
ALTER TABLE raid_attempts DROP COLUMN IF EXISTS player_max_hp;
ALTER TABLE raid_attempts DROP COLUMN IF EXISTS player_hp;
