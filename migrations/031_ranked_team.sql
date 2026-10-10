-- ===== Ranked Quest: โหมดทีม 2 คน (2v2) =====
-- ผู้เล่นทั้งหมดในเกมทีม (ใช้ตรวจ "มีเกมค้าง" และประวัติ) · ทีมของแต่ละ slot · ผลมุมมองของแต่ละคน
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS team_member_ids INTEGER[];
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS team SMALLINT;
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS result JSONB;
CREATE INDEX IF NOT EXISTS idx_ranked_matches_team_members ON ranked_matches USING GIN (team_member_ids) WHERE team_member_ids IS NOT NULL;
