-- ===== Ranked Quest (Animal League) — Phase 1 =====
-- ระบบห้องแข่งเดิม (rooms.js) อยู่ในหน่วยความจำและไม่มีตาราง จึงไม่มีตารางให้ reuse
-- ตารางเดิมที่ใช้ร่วม: users, answer_events (+source), word_progress (Add to Review), placement_attempts (CEFR), user_blocks

CREATE TABLE IF NOT EXISTS ranked_seasons (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(80) NOT NULL,
  theme       VARCHAR(80),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  reset_rules JSONB NOT NULL DEFAULT '{}'::jsonb   -- Soft reset ของซีซันถัดไป (config ได้)
);
-- มีซีซันที่ active ได้ครั้งละหนึ่งเท่านั้น
CREATE UNIQUE INDEX IF NOT EXISTS uq_ranked_seasons_active ON ranked_seasons (is_active) WHERE is_active;

INSERT INTO ranked_seasons (slug, name, theme, starts_at, ends_at, is_active, reset_rules)
VALUES ('s1', 'Season 1', 'The First Trail', NOW(), NOW() + INTERVAL '10 weeks', TRUE,
        '{"aurora-lion":"shadow-panther","crown-eagle":"shadow-panther","storm-falcon":"moon-wolf","shadow-panther":"moon-wolf","moon-wolf":"crest-lynx","crest-lynx":"river-otter"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS ranked_profiles (
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id             INTEGER NOT NULL REFERENCES ranked_seasons(id) ON DELETE CASCADE,
  league                VARCHAR(24) NOT NULL DEFAULT 'trail-finch',
  division_index        SMALLINT NOT NULL DEFAULT 0,       -- 0 = Division ต่ำสุดของ League (เช่น III)
  quest_rating          INTEGER NOT NULL DEFAULT 0 CHECK (quest_rating >= 0),
  wins                  INTEGER NOT NULL DEFAULT 0,
  losses                INTEGER NOT NULL DEFAULT 0,
  draws                 INTEGER NOT NULL DEFAULT 0,
  current_streak        INTEGER NOT NULL DEFAULT 0,        -- บวก = ชนะติด · ลบ = แพ้ติด
  best_streak           INTEGER NOT NULL DEFAULT 0,
  season_highest_league VARCHAR(24) NOT NULL DEFAULT 'trail-finch',
  season_highest_qr     INTEGER NOT NULL DEFAULT 0,
  promotion_status      VARCHAR(12) NOT NULL DEFAULT 'none', -- none | pending | retry
  promotion_retry_after SMALLINT NOT NULL DEFAULT 0,
  protection_matches    SMALLINT NOT NULL DEFAULT 0,
  tutorial_done         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_ranked_profiles_season_qr ON ranked_profiles (season_id, quest_rating DESC);

CREATE TABLE IF NOT EXISTS ranked_matches (
  id                 BIGSERIAL PRIMARY KEY,
  season_id          INTEGER NOT NULL REFERENCES ranked_seasons(id),
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- ผู้เริ่มเกม (เกม NPC = ผู้เล่นคนเดียว)
  match_type         VARCHAR(12) NOT NULL,                  -- ranked | promotion | practice
  status             VARCHAR(12) NOT NULL DEFAULT 'active', -- active | finished | abandoned
  opponent_kind      VARCHAR(8)  NOT NULL,                  -- npc | player
  npc_id             VARCHAR(24),
  league_at_start    VARCHAR(24) NOT NULL,
  division_at_start  SMALLINT NOT NULL,
  cefr               VARCHAR(2)  NOT NULL,
  seed               BIGINT NOT NULL,
  questions          JSONB NOT NULL,                        -- รวมเฉลย — เก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งให้ client
  npc_plan           JSONB,                                  -- แผนคำตอบ NPC (seed เดิม = ผลเดิม ตรวจย้อนได้)
  current_index      SMALLINT NOT NULL DEFAULT 0,
  question_opened_at TIMESTAMPTZ,                            -- เวลาเซิร์ฟเวอร์ที่เปิดข้อปัจจุบัน
  result             JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at        TIMESTAMPTZ
);
-- ผู้เล่นหนึ่งคนมีเกม active ได้ครั้งละหนึ่งเกม (กันเปิดหลายเกมเลือกเกมที่ง่าย)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ranked_matches_active_user ON ranked_matches (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ranked_matches_user_created ON ranked_matches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ranked_match_players (
  match_id      BIGINT NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
  slot          SMALLINT NOT NULL,                 -- 0 = ผู้เล่น · 1 = คู่แข่ง
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  npc_id        VARCHAR(24),
  score         INTEGER NOT NULL DEFAULT 0,
  correct_count SMALLINT NOT NULL DEFAULT 0,
  qr_before     INTEGER,
  qr_after      INTEGER,
  outcome       VARCHAR(8),                        -- win | loss | draw
  PRIMARY KEY (match_id, slot),
  CHECK ((user_id IS NULL) <> (npc_id IS NULL))
);

CREATE TABLE IF NOT EXISTS ranked_answers (
  match_id       BIGINT NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
  slot           SMALLINT NOT NULL,
  question_index SMALLINT NOT NULL,
  choice_index   SMALLINT,                         -- NULL = หมดเวลาไม่ได้ตอบ
  correct        BOOLEAN NOT NULL,
  points         INTEGER NOT NULL DEFAULT 0,
  response_ms    INTEGER,
  answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, slot, question_index)     -- กันส่งคำตอบซ้ำที่ระดับฐานข้อมูล
);

CREATE TABLE IF NOT EXISTS rank_history (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id      INTEGER NOT NULL REFERENCES ranked_seasons(id),
  match_id       BIGINT REFERENCES ranked_matches(id) ON DELETE SET NULL,
  event          VARCHAR(24) NOT NULL,             -- promoted | demoted | division_up | division_down | promotion_failed ...
  from_league    VARCHAR(24), from_division SMALLINT,
  to_league      VARCHAR(24), to_division SMALLINT,
  qr_after       INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rank_history_user ON rank_history (user_id, created_at DESC);

-- คำตอบจาก Ranked ส่งกลับระบบเรียน (Mastery / My Mistakes / คำแนะนำหน้า Home)
ALTER TABLE answer_events ADD COLUMN IF NOT EXISTS source VARCHAR(16);
