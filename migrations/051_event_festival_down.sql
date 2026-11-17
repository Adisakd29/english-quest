-- ย้อน 051: ลบเฉพาะตารางของเทศกาล · ของที่ผู้เล่นได้ไปแล้วยังอยู่ใน user_inventory (เปลี่ยนชนิดเป็น 'event' ให้ผ่าน CHECK เดิม)
DROP TABLE IF EXISTS event_quest_claims;
DROP TABLE IF EXISTS event_login_claims;
UPDATE user_inventory SET acquisition_type = 'event' WHERE acquisition_type IN ('event_login', 'event_quest');
ALTER TABLE user_inventory DROP CONSTRAINT IF EXISTS user_inventory_acquisition_type_check;
ALTER TABLE user_inventory ADD CONSTRAINT user_inventory_acquisition_type_check
  CHECK (acquisition_type IN ('purchase', 'achievement', 'event', 'starter', 'admin'));
DELETE FROM schema_migrations WHERE id = '051_event_festival.sql';
