-- ย้อนกลับ v1.27.0 World Raid Boss (ลบข้อมูล Raid ทั้งหมด — ใช้เมื่อจำเป็นจริงเท่านั้น · ไม่แตะตารางอื่น)
DROP VIEW IF EXISTS raid_boss_history;
DROP TABLE IF EXISTS raid_admin_audit_logs;
DROP TABLE IF EXISTS raid_announcements;
DROP TABLE IF EXISTS raid_user_rewards;
DROP TABLE IF EXISTS raid_reward_claims;
DROP TABLE IF EXISTS raid_player_stats;
DROP TABLE IF EXISTS raid_contributions;
DROP TABLE IF EXISTS raid_damage_events;
DROP TABLE IF EXISTS raid_question_responses;
DROP TABLE IF EXISTS raid_attempts;
DROP TABLE IF EXISTS raid_boss_instances;
DROP TABLE IF EXISTS raid_settings;
ALTER TABLE users DROP COLUMN IF EXISTS raid_title;
-- คืน constraint เดิม (แถว via = 'raid' ต้องย้ายเป็น 'event' ก่อน — ไม่ลบกรอบของผู้เล่น)
UPDATE user_cosmetics SET via = 'event' WHERE via = 'raid';
ALTER TABLE user_cosmetics DROP CONSTRAINT IF EXISTS user_cosmetics_via_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_via_check CHECK (via IN ('purchase', 'level', 'admin', 'event'));
