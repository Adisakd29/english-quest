-- v1.25.0 Christmas 2026 — Seasonal Theme Engine (ตั้งค่าผู้ดูแล) · Snowflake Token (บัญชีแยกประเภท) · เช็กอิน · เควสต์ · ร้าน
-- เพิ่มเท่านั้น — ไม่แตะ/ไม่ลบข้อมูลเดิม (EXP · Coin · inventory · แรงค์)

-- 1) ตั้งค่าฤดูกาล (ผู้ดูแลแก้ได้โดยไม่ต้อง deploy) · ไม่มีแถว = ใช้ค่าเริ่มต้นใน config/christmas.js
CREATE TABLE IF NOT EXISTS season_settings (
  season_key   VARCHAR(32) PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  claim_until  TIMESTAMPTZ,
  flags        JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
  CHECK (claim_until IS NULL OR ends_at IS NULL OR claim_until >= ends_at)
);
CREATE TABLE IF NOT EXISTS season_settings_log (
  id          BIGSERIAL PRIMARY KEY,
  season_key  VARCHAR(32) NOT NULL,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  before      JSONB,
  after       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Token ของกิจกรรม — ยอดคงเหลือ (ห้ามติดลบ) + บัญชีแยกประเภท (ทุกการเปลี่ยนยอดมีแถว · idem_key ไม่ซ้ำ = ได้/จ่ายซ้ำไม่ได้)
CREATE TABLE IF NOT EXISTS event_token_balances (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      VARCHAR(40) NOT NULL,
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  earned_total  INTEGER NOT NULL DEFAULT 0 CHECK (earned_total >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);
CREATE TABLE IF NOT EXISTS event_token_ledger (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id       VARCHAR(40) NOT NULL,
  delta          INTEGER NOT NULL CHECK (delta <> 0),
  reason         VARCHAR(24) NOT NULL,
  ref            VARCHAR(64),
  idem_key       VARCHAR(96) NOT NULL,
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id, idem_key)
);
CREATE INDEX IF NOT EXISTS event_token_ledger_user ON event_token_ledger (user_id, event_id, created_at DESC);

-- 3) เช็กอินรายวัน (วันละครั้งตามเวลาไทย) · เควสต์รายวัน · ซื้อของในร้าน (ชิ้นละครั้ง)
CREATE TABLE IF NOT EXISTS xmas_checkins (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(40) NOT NULL,
  day         DATE NOT NULL,
  tokens      INTEGER NOT NULL,
  exp         INTEGER NOT NULL DEFAULT 0,
  correct_at  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, day)
);
CREATE TABLE IF NOT EXISTS xmas_quest_claims (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(40) NOT NULL,
  day         DATE NOT NULL,
  quest_id    VARCHAR(24) NOT NULL,
  tokens      INTEGER NOT NULL,
  exp         INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, day, quest_id)
);
CREATE TABLE IF NOT EXISTS xmas_purchases (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(40) NOT NULL,
  item_id     VARCHAR(40) NOT NULL,
  price       INTEGER NOT NULL CHECK (price > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, item_id)
);

-- 4) กรอบจากกิจกรรม (ซื้อด้วย Token / ของขวัญต้อนรับ) — เพิ่มช่องทาง 'event' ให้ user_cosmetics
ALTER TABLE user_cosmetics DROP CONSTRAINT IF EXISTS user_cosmetics_via_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_via_check CHECK (via IN ('purchase', 'level', 'admin', 'event'));
