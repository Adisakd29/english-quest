-- v1.27.0 World Raid Boss — บอสกลางของทั้งเซิร์ฟเวอร์ (สถานะอยู่ในฐานข้อมูลเสมอ ไม่อยู่ในเครื่องผู้เล่น)
-- นิยามบอส (ตระกูล/Phase/รางวัล) อยู่ใน config/raidBosses.js · ค่าที่ผู้ดูแลปรับได้อยู่ใน raid_settings
-- ไม่แตะตารางเดิม (ข้อมูลวาดทายศัพท์ draw_* คงอยู่ทั้งหมด)

CREATE TABLE IF NOT EXISTS raid_settings (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO raid_settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- บอสแต่ละตัว (1 แถว = 1 เลเวล · UNIQUE(level) กันเกิดซ้ำแม้หลายเครื่อง/รีสตาร์ต)
CREATE TABLE IF NOT EXISTS raid_boss_instances (
  id               BIGSERIAL PRIMARY KEY,
  level            INTEGER NOT NULL UNIQUE CHECK (level >= 1),
  family           VARCHAR(24) NOT NULL,
  skin             VARCHAR(24),
  status           VARCHAR(16) NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'active', 'defeated', 'settled', 'paused', 'cancelled')),
  max_hp           BIGINT NOT NULL CHECK (max_hp > 0),
  hp               BIGINT NOT NULL CHECK (hp >= 0),
  defense          NUMERIC(4,3) NOT NULL DEFAULT 0,
  phase            SMALLINT NOT NULL DEFAULT 1 CHECK (phase BETWEEN 1 AND 3),
  shield_goal      INTEGER NOT NULL DEFAULT 0,
  shield_progress  INTEGER NOT NULL DEFAULT 0,
  shield_broken_at TIMESTAMPTZ,
  stun_until       TIMESTAMPTZ,
  ultimate_at      TIMESTAMPTZ,
  total_damage     BIGINT NOT NULL DEFAULT 0,
  participants     INTEGER NOT NULL DEFAULT 0,
  scaling          JSONB NOT NULL DEFAULT '{}'::jsonb,
  killer_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paused_from      VARCHAR(16),
  spawned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  defeated_at      TIMESTAMPTZ,
  settled_at       TIMESTAMPTZ,
  next_spawn_at    TIMESTAMPTZ,
  version          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_raid_instances_status ON raid_boss_instances (status, level DESC);

-- รอบโจมตี (10 ข้อ) — เฉลยอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (questions JSONB ไม่ส่งออกทั้งก้อน)
CREATE TABLE IF NOT EXISTS raid_attempts (
  id           UUID PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  cefr         VARCHAR(4) NOT NULL,
  questions    JSONB NOT NULL,
  current      INTEGER NOT NULL DEFAULT 0,
  q_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),          -- เวลาที่เซิร์ฟเวอร์ส่งข้อปัจจุบัน (ใช้วัดเวลาตอบ)
  shown_idx    INTEGER NOT NULL DEFAULT 0,                  -- ข้อที่เปิดให้เห็นแล้ว (เริ่มจับเวลาครั้งเดียวต่อข้อ · ขอซ้ำไม่รีเซ็ตเวลา)
  combo        INTEGER NOT NULL DEFAULT 0,
  best_combo   INTEGER NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  answered     INTEGER NOT NULL DEFAULT 0,
  damage       BIGINT NOT NULL DEFAULT 0,
  status       VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished', 'abandoned', 'expired')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_raid_attempts_user ON raid_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_raid_attempts_open ON raid_attempts (user_id) WHERE status = 'open';

-- คำตอบแต่ละข้อ (PK = ตอบข้อเดิมซ้ำไม่ได้)
CREATE TABLE IF NOT EXISTS raid_question_responses (
  attempt_id   UUID NOT NULL REFERENCES raid_attempts(id) ON DELETE CASCADE,
  qidx         SMALLINT NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  question_id  VARCHAR(80) NOT NULL,
  qtype        VARCHAR(12) NOT NULL,
  choice       SMALLINT,
  answer_text  VARCHAR(24),                                 -- Spelling Strike: ตัวอักษรที่ผู้เล่นกด (a–z เท่านั้น)
  correct      BOOLEAN NOT NULL,
  answer_ms    INTEGER NOT NULL,
  flagged      VARCHAR(24),                                 -- too_fast ฯลฯ (ตรวจสอบกิจกรรมผิดปกติ)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, qidx)
);
CREATE INDEX IF NOT EXISTS idx_raid_responses_flagged ON raid_question_responses (created_at DESC) WHERE flagged IS NOT NULL;

-- บันทึกดาเมจ (1 คำตอบที่ถูก = 1 แถว · UNIQUE กันดาเมจซ้ำ)
CREATE TABLE IF NOT EXISTS raid_damage_events (
  id           BIGSERIAL PRIMARY KEY,
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id   UUID NOT NULL,
  qidx         SMALLINT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount >= 0),
  kind         VARCHAR(12) NOT NULL,                        -- normal | combo | critical | shield | team | break
  hp_after     BIGINT NOT NULL,
  phase        SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, qidx)
);
CREATE INDEX IF NOT EXISTS idx_raid_damage_instance ON raid_damage_events (instance_id, id DESC);

-- การมีส่วนร่วมต่อบอส
CREATE TABLE IF NOT EXISTS raid_contributions (
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  damage       BIGINT NOT NULL DEFAULT 0,
  correct      INTEGER NOT NULL DEFAULT 0,
  answered     INTEGER NOT NULL DEFAULT 0,
  rounds       INTEGER NOT NULL DEFAULT 0,
  best_combo   INTEGER NOT NULL DEFAULT 0,
  crits        INTEGER NOT NULL DEFAULT 0,
  shield_hits  INTEGER NOT NULL DEFAULT 0,
  cefr         VARCHAR(4),
  first_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (instance_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_contrib_rank ON raid_contributions (instance_id, damage DESC);
CREATE INDEX IF NOT EXISTS idx_raid_contrib_user ON raid_contributions (user_id);

-- สถิติรวมของผู้เล่น (ไม่ลบเมื่อบอส/เทศกาลเปลี่ยน)
CREATE TABLE IF NOT EXISTS raid_player_stats (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_damage     BIGINT NOT NULL DEFAULT 0,
  correct          INTEGER NOT NULL DEFAULT 0,
  answered         INTEGER NOT NULL DEFAULT 0,
  raids_joined     INTEGER NOT NULL DEFAULT 0,
  bosses_defeated  INTEGER NOT NULL DEFAULT 0,
  best_damage      BIGINT NOT NULL DEFAULT 0,
  best_instance_id BIGINT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- การรับรางวัล (PK = รับซ้ำไม่ได้แม้กดพร้อมกันหลายเครื่อง)
CREATE TABLE IF NOT EXISTS raid_reward_claims (
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier         VARCHAR(24) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (instance_id, user_id, tier)
);

-- ของรางวัลถาวร (ฉายา / เหรียญตรา / ถ้วยรางวัล) — กรอบโปรไฟล์ใช้ user_cosmetics เดิม
CREATE TABLE IF NOT EXISTS raid_user_rewards (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id    VARCHAR(64) NOT NULL,
  instance_id  BIGINT REFERENCES raid_boss_instances(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, reward_id)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS raid_title VARCHAR(64);
-- กรอบโปรไฟล์จาก Raid ใช้ user_cosmetics เดิม (via = 'raid')
ALTER TABLE user_cosmetics DROP CONSTRAINT IF EXISTS user_cosmetics_via_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_via_check CHECK (via IN ('purchase', 'level', 'admin', 'event', 'raid'));

-- ประกาศ (UNIQUE ต่อบอสต่อชนิด = ไม่ส่งซ้ำจนแชตเต็ม)
CREATE TABLE IF NOT EXISTS raid_announcements (
  id           BIGSERIAL PRIMARY KEY,
  instance_id  BIGINT NOT NULL REFERENCES raid_boss_instances(id) ON DELETE CASCADE,
  kind         VARCHAR(24) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instance_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_raid_announce_recent ON raid_announcements (id DESC);

CREATE TABLE IF NOT EXISTS raid_admin_audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(32) NOT NULL,
  instance_id  BIGINT,
  before       JSONB,
  after        JSONB,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ประวัติบอส (มุมมองอ่านอย่างเดียว)
CREATE OR REPLACE VIEW raid_boss_history AS
  SELECT id, level, family, skin, status, max_hp, total_damage, participants, killer_user_id, spawned_at, active_at, defeated_at, settled_at
    FROM raid_boss_instances WHERE status IN ('defeated', 'settled', 'cancelled');
