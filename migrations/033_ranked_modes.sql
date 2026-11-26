-- ===== Ranked Quest: แยกโหมด Vocab / Grammar (แรงค์ · Quest Rating · กระดานอันดับ แยกกัน) =====
-- โปรไฟล์เดิม (เล่นแบบผสม) = โหมด vocab แล้วคัดลอกความคืบหน้าเดิมไปเป็นโหมด grammar ด้วย (ไม่มีใครเสียแรงค์ที่ไต่มา)
ALTER TABLE ranked_profiles ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'vocab';
ALTER TABLE ranked_profiles DROP CONSTRAINT IF EXISTS ranked_profiles_pkey;
ALTER TABLE ranked_profiles ADD CONSTRAINT ranked_profiles_pkey PRIMARY KEY (user_id, season_id, mode);
ALTER TABLE ranked_profiles DROP CONSTRAINT IF EXISTS ranked_profiles_mode_check;
ALTER TABLE ranked_profiles ADD CONSTRAINT ranked_profiles_mode_check CHECK (mode IN ('vocab', 'grammar'));
INSERT INTO ranked_profiles (user_id, season_id, mode, league, division_index, quest_rating, wins, losses, draws, current_streak, best_streak,
                             season_highest_league, season_highest_qr, promotion_status, promotion_retry_after, protection_matches, tutorial_done)
SELECT user_id, season_id, 'grammar', league, division_index, quest_rating, wins, losses, draws, current_streak, best_streak,
       season_highest_league, season_highest_qr, promotion_status, promotion_retry_after, protection_matches, tutorial_done
  FROM ranked_profiles WHERE mode = 'vocab'
ON CONFLICT DO NOTHING;
DROP INDEX IF EXISTS idx_ranked_profiles_season_qr;
CREATE INDEX IF NOT EXISTS idx_ranked_profiles_season_mode_qr ON ranked_profiles (season_id, mode, quest_rating DESC);

ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'vocab';
ALTER TABLE rank_history ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'vocab';
