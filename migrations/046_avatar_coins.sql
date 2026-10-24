-- v1.8.0: User Avatar + Coin + Wardrobe + Avatar Shop
-- เพิ่มตารางใหม่เท่านั้น (additive) · ไม่แตะ users.exp / Rank / Progress / คำศัพท์ / แกรมม่า / TOEIC / เพื่อน / Leaderboard เดิม
-- Coin แยกจาก EXP โดยสิ้นเชิง (ไม่มีคอลัมน์หรือ trigger ใดเชื่อมกัน)

-- แคตตาล็อกของตกแต่ง (นำเข้าจาก data/avatar/catalog.json ตอนเปิดเซิร์ฟเวอร์ · ผู้ดูแลแก้ไขได้ -> admin_override กันไฟล์ทับ)
CREATE TABLE IF NOT EXISTS avatar_items (
  id                  VARCHAR(40) PRIMARY KEY,
  name                VARCHAR(60) NOT NULL,
  name_th             VARCHAR(60),
  category            VARCHAR(16) NOT NULL,              -- slot: body face hair top bottom outerwear shoes hat glasses headphones back accessory effect background
  rarity              VARCHAR(10) NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  price               INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  asset_url           TEXT,                              -- ชิ้นหน้า
  thumbnail_url       TEXT,
  parts               JSONB NOT NULL DEFAULT '[]',       -- [{kind:'front'|'back', z, url}] — layer + zIndex ต่อชิ้น
  layer               VARCHAR(16) NOT NULL,
  z_index             INTEGER NOT NULL DEFAULT 0,
  gender_neutral      BOOLEAN NOT NULL DEFAULT TRUE,
  is_starter          BOOLEAN NOT NULL DEFAULT FALSE,
  is_purchasable      BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  is_achievement_reward BOOLEAN NOT NULL DEFAULT FALSE,
  achievement_id      VARCHAR(40),
  event_id            VARCHAR(40),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  admin_override      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avatar_items_shop ON avatar_items (is_active, is_purchasable, category, sort_order);

-- ไฟล์ภาพที่ผู้ดูแลอัปโหลด (เก็บใน DB เพื่อไม่หายตอน redeploy)
CREATE TABLE IF NOT EXISTS avatar_assets (
  id          VARCHAR(48) PRIMARY KEY,
  mime        VARCHAR(32) NOT NULL,
  data        BYTEA NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- กระเป๋า Coin (ยอดติดลบไม่ได้)
CREATE TABLE IF NOT EXISTS coin_wallets (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ทุกการเข้า/ออกของ Coin · source_key ไม่ซ้ำต่อผู้ใช้ = รางวัลเดิมได้ซ้ำไม่ได้
CREATE TABLE IF NOT EXISTS coin_transactions (
  id             BIGSERIAL PRIMARY KEY,                -- transactionId
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,                     -- + ได้ / - ใช้
  type           VARCHAR(24) NOT NULL,
  source_key     VARCHAR(96) NOT NULL,
  source_id      VARCHAR(64),
  description    VARCHAR(160),
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_coin_txn_user ON coin_transactions (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_coin_txn_type_day ON coin_transactions (user_id, type, created_at);

-- ของที่เป็นเจ้าของ (ชิ้นละครั้ง)
CREATE TABLE IF NOT EXISTS user_inventory (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id           VARCHAR(40) NOT NULL REFERENCES avatar_items(id) ON UPDATE CASCADE,
  acquisition_type  VARCHAR(12) NOT NULL CHECK (acquisition_type IN ('purchase', 'achievement', 'event', 'starter', 'admin')),
  price_paid        INTEGER NOT NULL DEFAULT 0,
  acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_equipped_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, item_id)
);

-- ชุดที่สวมอยู่ (ช่องละชิ้น · NULL = ไม่สวม)
CREATE TABLE IF NOT EXISTS user_avatar (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  body_item_id         VARCHAR(40),
  face_item_id         VARCHAR(40),
  hair_item_id         VARCHAR(40),
  top_item_id          VARCHAR(40),
  bottom_item_id       VARCHAR(40),
  outerwear_item_id    VARCHAR(40),
  shoes_item_id        VARCHAR(40),
  hat_item_id          VARCHAR(40),
  glasses_item_id      VARCHAR(40),
  headphones_item_id   VARCHAR(40),
  back_item_id         VARCHAR(40),
  accessory_item_id    VARCHAR(40),
  effect_item_id       VARCHAR(40),
  background_item_id   VARCHAR(40),
  display_mode         VARCHAR(10) NOT NULL DEFAULT 'character' CHECK (display_mode IN ('character', 'classic')),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ชุดที่บันทึกไว้ (3 ช่อง)
CREATE TABLE IF NOT EXISTS outfit_presets (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  name        VARCHAR(30) NOT NULL,
  outfit      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slot)
);

-- Achievement ที่ปลดล็อกแล้ว (ครั้งเดียว)
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  VARCHAR(40) NOT NULL,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen            BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, achievement_id)
);
