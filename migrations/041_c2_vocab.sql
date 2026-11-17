-- v1.6.0: คำศัพท์ระดับ C2 — ต่อยอดตาราง vocab_entries / vocab_senses เดิม (ไม่มี engine ที่สอง)
-- เพิ่มอย่างเดียว: ขยาย CHECK ให้รับค่าใหม่ (ค่าเดิมยังผ่านทั้งหมด) · ADD COLUMN · CREATE TABLE/INDEX
-- ไม่แก้/ไม่ลบแถวเดิม ไม่เปลี่ยน id / public_id เดิม → progress A1–C1 ไม่กระทบ

-- 1) ขยายข้อจำกัดให้รับ C2 (ค่าเดิมทุกค่ายังอยู่ในรายการ)
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_cefr;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_cefr
  CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_source_list;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_source_list
  CHECK (source_list IN ('OXFORD_3000', 'OXFORD_5000_ADDITIONAL', 'SUPPLEMENTAL', 'C2_BANK'));

ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_pos;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_pos CHECK (pos IS NULL OR pos IN (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'exclamation',
  'number', 'modal verb', 'auxiliary verb', 'indefinite article', 'definite article', 'infinitive marker',
  -- หน่วยคำศัพท์หลายคำของ C2
  'phrasal verb', 'idiom', 'collocation', 'fixed expression', 'discourse marker'));

-- 2) ข้อมูลเชิงลึกต่อ "ความหมาย" (sense) — NULL สำหรับแถว A1–C1 เดิม
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS c2_key              TEXT;      -- คีย์ต้นฉบับ lemma|pos|senseTag (import แบบ idempotent)
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS display_form        TEXT;      -- รูปที่แสดง เช่น "cut someone some slack"
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS kind                TEXT;      -- word | sense | collocation | phrasal | idiom | fixed | colloquial
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS register            TEXT;
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS connotation         TEXT;
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS real_world_priority SMALLINT;  -- 1..5
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS frequency_band      SMALLINT;  -- 1..5
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS tier                TEXT;      -- core | extended
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS variant             TEXT;      -- both | UK | US
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS verification_status TEXT;      -- unverified | autoChecked | reviewed
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS verification_issues JSONB;     -- ผล validator ล่าสุด {errors:[], warnings:[]}
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS base_sense_id       TEXT;      -- sense พื้นฐานของคำเดียวกัน (สำหรับ kind=sense)
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS c2                  JSONB;     -- เนื้อหาเต็ม: context, nearSynonyms, คำถาม, idiom notes ฯลฯ
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS reviewed_by         INTEGER;
ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ;

ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_verification;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_verification
  CHECK (verification_status IS NULL OR verification_status IN ('unverified', 'autoChecked', 'reviewed'));
ALTER TABLE vocab_senses DROP CONSTRAINT IF EXISTS ck_vocab_tier;
ALTER TABLE vocab_senses ADD CONSTRAINT ck_vocab_tier CHECK (tier IS NULL OR tier IN ('core', 'extended'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_vocab_senses_c2_key ON vocab_senses (c2_key) WHERE c2_key IS NOT NULL;
-- คิวรีหลักของ C2: เลือกชุดเรียน/สุ่มโจทย์ตาม tier + priority เฉพาะที่ผ่านการตรวจ
CREATE INDEX IF NOT EXISTS idx_vocab_senses_c2_pool ON vocab_senses (tier, real_world_priority DESC)
  WHERE cefr = 'C2';
CREATE INDEX IF NOT EXISTS idx_vocab_senses_verification ON vocab_senses (verification_status)
  WHERE verification_status IS NOT NULL;

-- 3) ประเภทข้อผิด (facet) ของคำตอบ — ใช้หา weak senses / collocations / register
ALTER TABLE answer_events ADD COLUMN IF NOT EXISTS facet VARCHAR(16);
CREATE INDEX IF NOT EXISTS idx_answer_events_facet ON answer_events (user_id, skill, facet) WHERE facet IS NOT NULL;

-- 4) บทเรียน C2 ทีละขั้น (ต่อผู้ใช้ · ต่อยูนิต) — โครงเดียวกับ grammar_lessons
CREATE TABLE IF NOT EXISTS vocab_lessons (
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id             VARCHAR(48) NOT NULL,
  current_step        INTEGER NOT NULL DEFAULT 0,
  run_no              INTEGER NOT NULL DEFAULT 1,
  run_steps           JSONB   NOT NULL DEFAULT '[]'::jsonb,
  run_answers         JSONB   NOT NULL DEFAULT '{}'::jsonb,
  completed_steps     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  lesson_accuracy     INTEGER,
  best_accuracy       INTEGER,
  lesson_runs         INTEGER NOT NULL DEFAULT 0,
  lesson_completed_at TIMESTAMPTZ,
  last_study_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_vlessons_recent ON vocab_lessons (user_id, last_study_at DESC);

-- 5) รอบฝึก C2 Challenge / Guess from Context (ชุดข้อคงที่ต่อรอบ · ตอบได้ครั้งเดียวต่อข้อ)
CREATE TABLE IF NOT EXISTS c2_sessions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        VARCHAR(16) NOT NULL,                 -- mixed | context | daily
  seed        VARCHAR(48) NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [itemId]
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- itemId -> ถูก/ผิด
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_c2_sessions_user ON c2_sessions (user_id, created_at DESC);
