-- v1.14.0: Word Atlas — คลังคำศัพท์ A–Z (เพิ่มตารางใหม่อย่างเดียว · ไม่แตะ/ไม่ลบข้อมูลเดิม)
-- หลักการ:
--   * คำ/ความหมายที่มีใน Oxford อยู่แล้ว → แถวใน atlas_senses "ชี้" ไปที่ vocab_senses.public_id (oxford_sense_id) ไม่คัดลอกเนื้อหาซ้ำ
--   * ความคืบหน้า/SRS/EXP ใช้ word_progress เดิม — คีย์ = progress_id = COALESCE(oxford_sense_id, id)
--     → เรียนคำเดียวกันผ่าน Oxford หรือ Word Atlas = ความคืบหน้าเดียวกัน ไม่นับซ้ำ
--   * ข้อมูลคลังมาจากไฟล์ data/word-atlas/*.jsonl.gz (ตัวนำเข้า services/wordAtlas/seed.js · id คงที่ ON CONFLICT UPDATE)

-- ส่วนขยายสำหรับค้นหาคำไทย/คำกลางคำ (มีใน Postgres ทั่วไป · ถ้าโฮสต์ไม่อนุญาตจะข้ามได้ ระบบยังค้นได้ช้าลง)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available: %', SQLERRM;
END $$;

-- 1 แถว = 1 lemma (ตัวพิมพ์เล็ก) — ใช้สำหรับ Browse A–Z / ค้นหา (ข้อมูลสรุปคำนวณตอนนำเข้า)
CREATE TABLE IF NOT EXISTS atlas_lemmas (
  id              VARCHAR(16) PRIMARY KEY,           -- 'L-' + hash ของ lemma (คงที่)
  lemma           TEXT NOT NULL UNIQUE,              -- ตัวพิมพ์เล็ก ใช้เป็นกุญแจค้นหา
  display         TEXT NOT NULL,                     -- ตัวสะกดสำหรับแสดง
  sort_key        TEXT NOT NULL,                     -- คีย์เรียง A–Z (ตัดวงเล็บนำหน้า เช่น "(be) on thin ice" → "on thin ice")
  letter          CHAR(1) NOT NULL,                  -- a–z
  kind            VARCHAR(16) NOT NULL DEFAULT 'word', -- word | phrase | phrasal | idiom
  zipf            REAL,                              -- ความถี่ (wordfreq, log10 ต่อพันล้านคำ + 9) · NULL = ไม่มีข้อมูล
  freq_rank       INTEGER,                           -- อันดับความถี่ในคลัง (1 = ใช้บ่อยสุด)
  freq_band       SMALLINT,                          -- 1 (ใช้บ่อยมาก) … 6 (หายาก) · NULL = ไม่มีข้อมูล
  pos_list        TEXT[] NOT NULL DEFAULT '{}',
  cefr_list       TEXT[] NOT NULL DEFAULT '{}',      -- จาก Oxford เท่านั้น (ไม่เดา) · ว่าง = Unclassified
  cefr_min        VARCHAR(2),
  topics          TEXT[] NOT NULL DEFAULT '{}',
  labels          TEXT[] NOT NULL DEFAULT '{}',      -- formal/informal/slang/archaic/rare/technical/academic …
  primary_thai    TEXT,
  primary_pos     TEXT,
  ipa_uk          TEXT,
  ipa_us          TEXT,
  sense_total     SMALLINT NOT NULL DEFAULT 0,
  learnable_total SMALLINT NOT NULL DEFAULT 0,       -- ความหมายที่ผ่านการตรวจแล้ว ใช้เรียน/ทำแบบฝึกได้
  oxford          BOOLEAN NOT NULL DEFAULT FALSE,    -- มีใน Oxford 3000/5000/C2 bank
  progress_ids    TEXT[] NOT NULL DEFAULT '{}',      -- progress_id ของความหมายที่เรียนได้ (ใช้คำนวณสถานะผู้เรียนต่อคำ)
  search_th       TEXT,                              -- คำแปลไทยทั้งหมดต่อกัน (ค้นคำไทย)
  dataset         VARCHAR(24) NOT NULL,              -- ชุดข้อมูลที่นำเข้า เช่น 'pilot-2026-11'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_prefix ON atlas_lemmas (lemma text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_letter_sort ON atlas_lemmas (letter, sort_key, lemma);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_sort ON atlas_lemmas (sort_key, lemma);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_letter_rank ON atlas_lemmas (letter, freq_rank);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_rank ON atlas_lemmas (freq_rank);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_created ON atlas_lemmas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_topics ON atlas_lemmas USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_pos ON atlas_lemmas USING GIN (pos_list);
CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_cefr ON atlas_lemmas USING GIN (cefr_list);
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_atlas_lemmas_th_trgm ON atlas_lemmas USING GIN (search_th gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'skip trigram index: %', SQLERRM;
END $$;

-- 1 แถว = 1 ความหมาย (Learning Item) — แถวที่ชี้ Oxford เก็บแค่ส่วนเสริม เนื้อหาหลักอ่านจาก vocab_senses
CREATE TABLE IF NOT EXISTS atlas_senses (
  id                  VARCHAR(16) PRIMARY KEY,       -- 'WA-' + hash ของ (lemma|pos|รหัสความหมายต้นทาง) คงที่ทุกครั้งที่นำเข้า
  lemma_id            VARCHAR(16) NOT NULL REFERENCES atlas_lemmas(id) ON DELETE RESTRICT,
  oxford_sense_id     VARCHAR(16),                   -- vocab_senses.public_id (NULL = ความหมายใหม่จาก Word Atlas)
  progress_id         VARCHAR(16) GENERATED ALWAYS AS (COALESCE(oxford_sense_id, id)) STORED,
  sense_no            SMALLINT NOT NULL DEFAULT 1,
  pos                 TEXT,
  definition_en       TEXT,
  thai                TEXT[] NOT NULL DEFAULT '{}',
  examples            JSONB NOT NULL DEFAULT '[]',   -- [{ en, th? }]
  synonyms            TEXT[] NOT NULL DEFAULT '{}',
  antonyms            TEXT[] NOT NULL DEFAULT '{}',
  collocations        TEXT[] NOT NULL DEFAULT '{}',
  phrases             TEXT[] NOT NULL DEFAULT '{}',
  phrasal_verbs       TEXT[] NOT NULL DEFAULT '{}',
  word_family         TEXT[] NOT NULL DEFAULT '{}',
  topics              TEXT[] NOT NULL DEFAULT '{}',
  labels              TEXT[] NOT NULL DEFAULT '{}',
  register            VARCHAR(16),
  usage_note          TEXT,
  cefr                VARCHAR(2),                    -- จาก Oxford เท่านั้น · NULL = Unclassified (ไม่เดา)
  difficulty          SMALLINT,                      -- 1–6 (จากความถี่ + CEFR ที่ตรวจได้)
  ipa_uk              TEXT,
  ipa_us              TEXT,
  audio_uk            TEXT,                          -- ไฟล์เสียงคนอ่านจริง (Wikimedia Commons) · ไม่มี = ใช้เสียงสังเคราะห์ในเครื่อง
  audio_us            TEXT,
  source              VARCHAR(48) NOT NULL,          -- OXFORD | WIKTIONARY | WIKTIONARY+THAI_WIKTIONARY …
  license             VARCHAR(48) NOT NULL,
  source_ref          TEXT,                          -- รหัสความหมายต้นทาง (ตรวจย้อนได้)
  verification_status VARCHAR(16) NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('reviewed', 'autoChecked', 'unverified', 'rejected')),
  quality_flags       TEXT[] NOT NULL DEFAULT '{}',
  learnable           BOOLEAN NOT NULL DEFAULT FALSE, -- เข้า Unit/แบบฝึกที่ให้คะแนนได้ (ผ่าน validator + มีคำแปลไทย)
  dataset             VARCHAR(24) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_senses_lemma ON atlas_senses (lemma_id, sense_no);
CREATE INDEX IF NOT EXISTS idx_atlas_senses_progress ON atlas_senses (progress_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_senses_oxford ON atlas_senses (oxford_sense_id) WHERE oxford_sense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_senses_learnable ON atlas_senses (learnable) WHERE learnable;

-- Unit แบบ micro-learning: กำหนดครั้งเดียวแล้วคงที่ (เพิ่มคำใหม่ = ต่อท้าย Unit ใหม่ ไม่สลับของเดิม)
CREATE TABLE IF NOT EXISTS atlas_units (
  id          VARCHAR(12) PRIMARY KEY,               -- 'A-001'
  letter      CHAR(1) NOT NULL,
  seq         INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (letter, seq)
);
CREATE TABLE IF NOT EXISTS atlas_unit_items (
  unit_id     VARCHAR(12) NOT NULL REFERENCES atlas_units(id) ON DELETE RESTRICT,
  sense_id    VARCHAR(16) NOT NULL REFERENCES atlas_senses(id) ON DELETE RESTRICT,
  ord         SMALLINT NOT NULL,
  PRIMARY KEY (unit_id, sense_id),
  UNIQUE (sense_id)
);

-- ความคืบหน้ารายผู้ใช้ (บันทึกฝั่งเซิร์ฟเวอร์ → เรียนต่อข้ามอุปกรณ์ได้)
CREATE TABLE IF NOT EXISTS atlas_unit_progress (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id       VARCHAR(12) NOT NULL REFERENCES atlas_units(id) ON DELETE CASCADE,
  step          SMALLINT NOT NULL DEFAULT 0,          -- ขั้นที่ทำถึง (index ในแผนบทเรียน)
  steps_total   SMALLINT NOT NULL DEFAULT 0,
  correct       INTEGER NOT NULL DEFAULT 0,
  answered      INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  best_pct      SMALLINT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_atlas_unit_progress_recent ON atlas_unit_progress (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS atlas_collection (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lemma_id    VARCHAR(16) NOT NULL REFERENCES atlas_lemmas(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lemma_id)
);
CREATE INDEX IF NOT EXISTS idx_atlas_collection_recent ON atlas_collection (user_id, created_at DESC);

-- รางวัลแบบครั้งเดียว (uniqueEventId) — กันรับ EXP ซ้ำจากการทำ Unit เดิม/รีเฟรช
CREATE TABLE IF NOT EXISTS atlas_reward_events (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(64) NOT NULL,                  -- เช่น 'unit:A-001:complete'
  amount      INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

-- รอบแบบฝึก: เฉลยเก็บฝั่งเซิร์ฟเวอร์ client ได้แค่รหัสตัวเลือกสุ่ม
CREATE TABLE IF NOT EXISTS atlas_sessions (
  id          UUID PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(12) NOT NULL,                  -- unit | quiz | review | daily
  unit_id     VARCHAR(12),
  step        SMALLINT,
  questions   JSONB NOT NULL,
  answers     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atlas_sessions_user ON atlas_sessions (user_id, created_at DESC);

-- เวอร์ชันชุดข้อมูลที่นำเข้าแล้ว (ตัวนำเข้าข้ามถ้า checksum เดิม)
CREATE TABLE IF NOT EXISTS atlas_meta (
  key         VARCHAR(32) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
