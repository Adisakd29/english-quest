-- ===== V2: ฐานคำศัพท์ใหม่จาก Oxford (Headword + Lexical Sense) =====
-- เพิ่มอย่างเดียว — ตารางเดิม (words, word_content, word_progress, translations) ไม่ถูกแตะ

-- Headword: 1 แถว = 1 คำ (ตัวพิมพ์ตามต้นฉบับ + เลขคำพ้องรูป)
--   "March" กับ "march" = คนละแถว, "close#1" (ปิด) กับ "close#2" (ใกล้) = คนละแถว
CREATE TABLE IF NOT EXISTS vocab_entries (
  id            TEXT PRIMARY KEY,              -- เช่น 'bank', 'close#1', 'March', 'a,_an'
  headword      TEXT NOT NULL,                 -- ตัวสะกดตามต้นฉบับ (แยกตัวพิมพ์)
  normalized    TEXT NOT NULL,                 -- ตัวเล็ก ใช้ค้นหาเท่านั้น ห้ามใช้เป็น key
  homograph_no  SMALLINT,                      -- เลขยกกำลังในต้นฉบับ (close¹ / close²)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocab_entries_word
  ON vocab_entries (headword, COALESCE(homograph_no, 0));
CREATE INDEX IF NOT EXISTS idx_vocab_entries_search
  ON vocab_entries (normalized text_pattern_ops);   -- รองรับค้นหาแบบขึ้นต้นด้วย (LIKE 'ach%')

-- Lexical Sense: 1 แถว = 1 ความหมาย (ชนิดคำ × ระดับ × คำใบ้)
CREATE TABLE IF NOT EXISTS vocab_senses (
  id                    TEXT PRIMARY KEY,      -- เช่น 'bank|noun|money' (คำนวณจากต้นฉบับ คงที่)
  entry_id              TEXT NOT NULL REFERENCES vocab_entries(id) ON DELETE RESTRICT,
  pos                   TEXT,                  -- NULL ได้เฉพาะเมื่อต้นฉบับไม่ระบุ (seldom) + flag
  cefr                  VARCHAR(2) NOT NULL,
  sense_label           TEXT,                  -- คำใบ้ในวงเล็บของต้นฉบับ เช่น 'money'

  -- ---- ข้อมูลต้นฉบับ (เขียนโดย import เท่านั้น) ----
  source                TEXT NOT NULL DEFAULT 'OXFORD',
  source_list           TEXT NOT NULL,
  source_cefr           VARCHAR(2),
  source_raw_entry      TEXT,                  -- ข้อความต้นฉบับ เช่น 'acid n. B2, adj. C1'
  source_ref            TEXT,                  -- ตำแหน่งในเอกสาร เช่น 'OXFORD_3000:p2:118'
  source_needs_review   BOOLEAN NOT NULL DEFAULT FALSE,
  source_review_reasons TEXT[] NOT NULL DEFAULT '{}',
  is_supplemental       BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = ไม่ใช่ Oxford ห้ามแสดงเป็น Oxford
  display_order         INTEGER,               -- ลำดับในต้นฉบับ (เรียงผลแบบคงที่)

  -- ---- คำแปลไทย (ไม่ได้มาจาก Oxford — แยกแหล่งที่มาชัดเจน) ----
  thai_meaning          TEXT,
  translation_source    TEXT,                  -- AI_GENERATED | HUMAN_REVIEWED | LEGACY_REVIEWED
  translation_status    TEXT NOT NULL DEFAULT 'missing',  -- missing | unreviewed | reviewed | rejected
  translation_note      TEXT,                  -- เหตุผลที่ flag เช่น 'คำพ้องรูปไม่มีคำใบ้'

  -- ---- เนื้อหาเสริม (ไม่บังคับในรอบแรก) ----
  simple_definition     TEXT,
  definition_source     TEXT,                  -- เช่น 'WORDNET' (มีสัญญาอนุญาต) | 'ORIGINAL'
  example_sentence      TEXT,
  example_translation   TEXT,
  ipa                   TEXT,
  ipa_source            TEXT,
  pronunciation_audio   TEXT,
  synonyms              TEXT[],
  antonyms              TEXT[],
  collocations          TEXT[],
  word_family           TEXT[],
  common_mistakes       TEXT,
  topic                 TEXT,
  tags                  TEXT[],
  difficulty            SMALLINT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_vocab_cefr CHECK (cefr IN ('A1','A2','B1','B2','C1')),
  CONSTRAINT ck_vocab_source_list CHECK (source_list IN ('OXFORD_3000','OXFORD_5000_ADDITIONAL','SUPPLEMENTAL')),
  CONSTRAINT ck_vocab_pos CHECK (pos IS NULL OR pos IN (
    'noun','verb','adjective','adverb','pronoun','preposition','conjunction','determiner',
    'exclamation','number','modal verb','auxiliary verb','indefinite article','definite article',
    'infinitive marker')),
  -- ชนิดคำว่างได้ก็ต่อเมื่อถูก flag เท่านั้น — กันข้อมูลขาดแบบเงียบ ๆ
  CONSTRAINT ck_vocab_pos_flagged CHECK (pos IS NOT NULL OR source_needs_review),
  CONSTRAINT ck_vocab_translation_status CHECK (translation_status IN ('missing','unreviewed','reviewed','rejected')),
  CONSTRAINT ck_vocab_translation_source CHECK (translation_source IS NULL OR translation_source IN
    ('AI_GENERATED','HUMAN_REVIEWED','LEGACY_REVIEWED')),
  -- คำที่ไม่ใช่ Oxford ต้องอยู่ในรายการ SUPPLEMENTAL เท่านั้น
  CONSTRAINT ck_vocab_supplemental CHECK ((source_list = 'SUPPLEMENTAL') = is_supplemental)
);
CREATE INDEX IF NOT EXISTS idx_vocab_senses_entry ON vocab_senses (entry_id);
CREATE INDEX IF NOT EXISTS idx_vocab_senses_cefr ON vocab_senses (cefr, display_order);
CREATE INDEX IF NOT EXISTS idx_vocab_senses_pos ON vocab_senses (pos);
CREATE INDEX IF NOT EXISTS idx_vocab_senses_list ON vocab_senses (source_list);
CREATE INDEX IF NOT EXISTS idx_vocab_senses_translation ON vocab_senses (translation_status);
