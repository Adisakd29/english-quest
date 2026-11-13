-- v1.21.0 โหมด "ทายศัพท์ไม่รู้จบ" (Endless) · กรอบโปรไฟล์ / กรอบแชท · รางวัลทุก 10 เลเวล
-- เพิ่มเท่านั้น — ไม่แตะ/ไม่ลบข้อมูลเดิม (EXP · Coin · inventory · แรงค์)

-- 1) ของตกแต่ง (กรอบ) ที่ผู้ใช้มี — รายการของอยู่ใน config/cosmetics.js (ราคา/เงื่อนไขอ่านจากเซิร์ฟเวอร์เท่านั้น)
CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id      VARCHAR(40) NOT NULL,
  via          VARCHAR(12) NOT NULL CHECK (via IN ('purchase', 'level', 'admin')),
  price_paid   INTEGER NOT NULL DEFAULT 0,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- กรอบที่ใส่อยู่ (NULL = ไม่ใส่)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_frame VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_frame VARCHAR(40);

-- 2) รางวัลทุก 10 เลเวล — รับได้ครั้งเดียวต่อเลเวล (PK) · Coin ใช้ source_key 'lvl:<เลเวล>' (UNIQUE ใน coin_transactions)
CREATE TABLE IF NOT EXISTS level_reward_claims (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL CHECK (level > 0 AND level % 10 = 0),
  coins       INTEGER NOT NULL DEFAULT 0,
  items       TEXT[] NOT NULL DEFAULT '{}',
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, level)
);

-- 3) Endless — เกมละแถว · คำถามปัจจุบันเก็บฝั่งเซิร์ฟเวอร์ (คำตอบไม่เคยส่งไปหน้าเว็บก่อนตอบ)
CREATE TABLE IF NOT EXISTS endless_runs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(8) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'over')),
  hearts      SMALLINT NOT NULL DEFAULT 3,
  score       INTEGER NOT NULL DEFAULT 0,      -- จำนวนข้อที่ตอบถูก
  answered    INTEGER NOT NULL DEFAULT 0,
  combo       INTEGER NOT NULL DEFAULT 0,
  best_combo  INTEGER NOT NULL DEFAULT 0,
  exp_gained  INTEGER NOT NULL DEFAULT 0,
  q           JSONB,                           -- ข้อปัจจุบัน (senseId · ตัวเลือก · ข้อที่ถูก · เวลาออกข้อ)
  used        TEXT[] NOT NULL DEFAULT '{}',    -- senseId ที่ออกไปแล้วในเกมนี้ (ไม่ซ้ำ)
  missed      JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_endless_active ON endless_runs (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_endless_user ON endless_runs (user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_endless_week ON endless_runs (started_at, score DESC) WHERE status = 'over';
