-- ย้อน v1.25.0 (ลบเฉพาะสิ่งที่ 082 เพิ่ม · ของที่ซื้อแล้วยังอยู่ใน user_inventory / user_cosmetics)
DROP TABLE IF EXISTS xmas_purchases;
DROP TABLE IF EXISTS xmas_quest_claims;
DROP TABLE IF EXISTS xmas_checkins;
DROP TABLE IF EXISTS event_token_ledger;
DROP TABLE IF EXISTS event_token_balances;
DROP TABLE IF EXISTS season_settings_log;
DROP TABLE IF EXISTS season_settings;
-- via 'event' คงไว้ (มีแถวกรอบจากกิจกรรมอยู่ ห้ามลบของผู้ใช้)
