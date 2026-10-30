-- ===== Ranked Quest Phase 2: PvP =====
-- ผู้เล่นคนที่สองของเกม PvP (slot 1) · ผลการแข่งมุมมองของผู้เล่นคนที่สอง
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS result_p2 JSONB;
-- ผู้เล่นหนึ่งคนอยู่ในเกม active ได้ครั้งละเกม ไม่ว่าจะเป็นฝั่งไหน
CREATE UNIQUE INDEX IF NOT EXISTS uq_ranked_matches_active_p2 ON ranked_matches (player2_id) WHERE status = 'active' AND player2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ranked_matches_p2_created ON ranked_matches (player2_id, created_at DESC) WHERE player2_id IS NOT NULL;
