-- v1.18.3 ความยุติธรรมของ Ranked: ตรวจการตอบเร็วเกินมนุษย์ (บอท/สคริปต์) + บันทึกการริบแต้มแรงค์ที่ได้จากการโกง
-- ไม่แก้/ลบข้อมูลเดิม · ทุกการปรับแต้มย้อนหลังเก็บค่าก่อน-หลังไว้ คืนค่าได้ (scripts/ranked/reclaim-cheat.js --revert)

-- แมตช์ที่ตรวจพบ (ต่อผู้เล่น): live = ระบบตัดสินตอนจบเกม · reclaim = พบจากการตรวจย้อนหลัง
CREATE TABLE IF NOT EXISTS ranked_integrity_flags (
  id            SERIAL PRIMARY KEY,
  match_id      BIGINT NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id     INTEGER,
  mode          VARCHAR(10) NOT NULL DEFAULT 'vocab',
  fast_correct  SMALLINT NOT NULL,          -- จำนวนข้อที่ตอบถูกเร็วกว่าเกณฑ์มนุษย์
  answered      SMALLINT NOT NULL,
  min_ms        INTEGER,
  avg_ms        INTEGER,
  outcome       VARCHAR(8),
  source        VARCHAR(10) NOT NULL DEFAULT 'live',   -- live | reclaim
  action        VARCHAR(16) NOT NULL,                  -- voided (ไม่นับแต้ม) | loss (แพ้ตามปกติ) | reclaimed (ริบย้อนหลัง)
  qr_withheld   INTEGER NOT NULL DEFAULT 0,            -- แต้มที่ไม่ได้/ถูกริบจากแมตช์นี้
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rif_user ON ranked_integrity_flags (user_id, created_at DESC);

-- บันทึกการปรับแต้มย้อนหลัง (ต่อโปรไฟล์ user+season+mode) — before/after ครบ เพื่อตรวจสอบและคืนค่า
CREATE TABLE IF NOT EXISTS ranked_qr_reclaims (
  id           SERIAL PRIMARY KEY,
  batch_id     VARCHAR(32) NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id    INTEGER NOT NULL,
  mode         VARCHAR(10) NOT NULL,
  kind         VARCHAR(12) NOT NULL,       -- cheater (ริบแต้ม) | refund (คืนแต้มให้คู่แข่งที่แพ้ผู้โกงในเกม PvP/ทีม)
  amount       INTEGER NOT NULL,           -- ติดลบ = ริบ · บวก = คืน
  match_ids    BIGINT[] NOT NULL,
  before       JSONB NOT NULL,
  after        JSONB NOT NULL,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reverted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rqr_batch ON ranked_qr_reclaims (batch_id);
CREATE INDEX IF NOT EXISTS idx_rqr_user ON ranked_qr_reclaims (user_id);
