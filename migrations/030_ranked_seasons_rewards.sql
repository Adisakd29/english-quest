-- ===== Ranked Quest Phase 3: Season / Rewards (Cosmetic only) / Apex / Analytics =====
-- รางวัลเป็นของตกแต่งเท่านั้น — ไม่มีตารางหรือคอลัมน์ไหนกระทบคะแนน เวลา หรือความยากของคำถาม (ห้าม Pay-to-win)
CREATE TABLE IF NOT EXISTS user_ranked_rewards (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id   VARCHAR(64) NOT NULL,          -- เช่น title:moon-wolf · frame:moon-wolf · season-badge:s1:crest-lynx · nameplate:aurora:s1
  season_id   INTEGER REFERENCES ranked_seasons(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, reward_id)
);
-- ของตกแต่งที่ผู้เล่นเลือกแสดง (ต้องเป็นของที่ได้รับแล้วเท่านั้น — ตรวจฝั่งเซิร์ฟเวอร์)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ranked_title VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ranked_frame VARCHAR(64);

-- ข้อมูลสำหรับปรับสมดุล (Analytics): เวลารอคิว และเหตุที่เกมจบ
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS queue_ms INTEGER;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS end_reason VARCHAR(16);   -- completed | forfeit | disconnect | restart
CREATE INDEX IF NOT EXISTS idx_ranked_matches_finished ON ranked_matches (finished_at DESC) WHERE status = 'finished';
