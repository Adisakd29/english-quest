-- 039: Grammar Learning (หลักสูตร A1–C1) — เพิ่มตารางใหม่เท่านั้น ไม่แตะข้อมูลเดิม (grammar_progress / answer_events / placement_attempts ยังใช้ได้ตามเดิม)

-- ทุกคำตอบในระบบเรียนแกรมม่าใหม่ (ฐานของ Mastery / Error Notebook / Analytics / Badge)
CREATE TABLE IF NOT EXISTS grammar_attempts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(64) NOT NULL,
  topic_id    VARCHAR(48) NOT NULL,
  cefr        VARCHAR(4) NOT NULL,
  qtype       VARCHAR(16) NOT NULL,
  difficulty  SMALLINT NOT NULL DEFAULT 2,
  correct     BOOLEAN NOT NULL,
  answer      JSONB,
  source      VARCHAR(16) NOT NULL DEFAULT 'practice',   -- practice | review | placement | daily | ranked | writing
  session_id  VARCHAR(40),
  response_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gatt_user_time ON grammar_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gatt_user_topic ON grammar_attempts (user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_gatt_user_item ON grammar_attempts (user_id, item_id);

-- ทบทวนแบบเว้นระยะ (รายข้อ): stage 0..5 = 1/3/7/14/30 วัน (ปรับตามผล)
CREATE TABLE IF NOT EXISTS grammar_reviews (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(64) NOT NULL,
  topic_id    VARCHAR(48) NOT NULL,
  stage       SMALLINT NOT NULL DEFAULT 0,
  due_at      TIMESTAMPTZ NOT NULL,
  lapses      INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  mastered_at TIMESTAMPTZ,
  last_result BOOLEAN,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_grev_due ON grammar_reviews (user_id, due_at) WHERE mastered_at IS NULL;

-- ความคืบหน้าบทเรียน (อ่านขั้นไหนแล้ว · ผลแบบฝึกดีที่สุด)
CREATE TABLE IF NOT EXISTS grammar_lessons (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id     VARCHAR(48) NOT NULL,
  steps_seen   JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_score   INTEGER,
  best_total   INTEGER,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id)
);

-- แบบทดสอบวัดระดับแกรมม่า (Adaptive) — ระดับแกรมม่าแยกจาก Account Level และ Rank
CREATE TABLE IF NOT EXISTS grammar_placements (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(16) NOT NULL DEFAULT 'in_progress',
  state        JSONB NOT NULL,
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gplace_user ON grammar_placements (user_id, created_at DESC);

-- โปรไฟล์แกรมม่า: ระดับ CEFR ปัจจุบัน (จาก placement/mastery)
CREATE TABLE IF NOT EXISTS grammar_profiles (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cefr        VARCHAR(4),
  cefr_source VARCHAR(16),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily Grammar Challenge (วันละครั้ง ตามวันของประเทศไทย)
CREATE TABLE IF NOT EXISTS grammar_daily (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  items        JSONB NOT NULL,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  score        INTEGER,
  total        INTEGER NOT NULL,
  exp          INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, day)
);

-- Badge แกรมม่า (ได้จาก mastery/ผลจริงเท่านั้น)
CREATE TABLE IF NOT EXISTS grammar_badges (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  VARCHAR(40) NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- งานเขียน (Writing Practice) + ผลตรวจ
CREATE TABLE IF NOT EXISTS grammar_writings (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_id  VARCHAR(48) NOT NULL,
  text       TEXT NOT NULL,
  feedback   JSONB NOT NULL,
  passed     BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gwrite_user ON grammar_writings (user_id, created_at DESC);
