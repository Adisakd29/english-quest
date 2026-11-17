-- ===== Ranked Quest: Battle HP + Disconnect / Leave Penalty =====
-- HP อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น: hp = HP ปัจจุบันของแต่ละฝั่ง (1v1: slot · ทีม: team) · hp_min ใช้วัด comeback
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS start_hp SMALLINT NOT NULL DEFAULT 100;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS hp JSONB NOT NULL DEFAULT '[100,100]';
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS hp_min JSONB NOT NULL DEFAULT '[100,100]';
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS combo JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS final_hp_p1 SMALLINT;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS final_hp_p2 SMALLINT;
-- hp_zero | questions_complete | disconnect | surrender | timeout | draw
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS result_reason VARCHAR(24);
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS forfeit_reason VARCHAR(16);
-- การเชื่อมต่อ (เกม NPC เก็บใน DB · เกม PvP/ทีม อยู่ในหน่วยความจำและบันทึกตอนเกิดเหตุ)
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS disconnect_started_at TIMESTAMPTZ;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS reconnect_deadline TIMESTAMPTZ;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS disconnects SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS reconnects SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_ranked_matches_reconnect ON ranked_matches (reconnect_deadline) WHERE status = 'active';

-- Damage ของแต่ละคำตอบ (target = ฝั่งที่เสีย HP)
ALTER TABLE ranked_answers ADD COLUMN IF NOT EXISTS damage SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE ranked_answers ADD COLUMN IF NOT EXISTS damage_target SMALLINT;

-- ผลรายคน: HP สุดท้ายของฝั่ง · เหตุที่ออก · นับเป็นการทิ้งเกมไหม (ใช้กับ Repeated Disconnect)
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS final_hp SMALLINT;
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS forfeit_reason VARCHAR(16);
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS counted_abandon BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ranked_match_players ADD COLUMN IF NOT EXISTS qr_penalty SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_rmp_abandon ON ranked_match_players (user_id) WHERE counted_abandon;

-- พัก Ranked ชั่วคราวหลังทิ้งเกมบ่อย (ระดับผู้ใช้ ไม่ผูกซีซัน)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ranked_cooldown_until TIMESTAMPTZ;

-- ค่าเสียงของผู้เล่น (Master / Music / SFX / Mute) — จำข้ามอุปกรณ์
ALTER TABLE users ADD COLUMN IF NOT EXISTS audio_settings JSONB;

-- เกมเก่าที่จบไปก่อนมีระบบ HP: เหตุที่จบเทียบจาก end_reason เดิม
UPDATE ranked_matches SET result_reason = CASE end_reason WHEN 'forfeit' THEN 'surrender' WHEN 'disconnect' THEN 'disconnect' ELSE 'questions_complete' END
 WHERE status = 'finished' AND result_reason IS NULL;
