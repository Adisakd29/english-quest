-- v1.7.0: TOEIC-style Practice — Listening Part 1 (Photographs)
-- เพิ่มตารางใหม่เท่านั้น (additive) · ไม่แตะตารางคำศัพท์/แกรมม่า/EXP/Rank เดิม
-- EXP ใช้ users.exp + exp_log + exp_awards เดิม (utils/exp.js) · ไม่มี Listening EXP แยก

-- คลังข้อ (โหลดจาก data/toeic/<part>/bank.json อัตโนมัติตอนเปิดเซิร์ฟเวอร์ · idempotent ตาม version)
-- content = ข้อเต็ม (statements, เฉลย, คำอธิบาย, เสียง) — เซิร์ฟเวอร์เท่านั้นที่อ่าน · หน้าเว็บได้เฉพาะส่วนที่ปลอดภัย
CREATE TABLE IF NOT EXISTS toeic_questions (
  id              VARCHAR(16) PRIMARY KEY,                  -- P1-0001
  part            SMALLINT NOT NULL CHECK (part BETWEEN 1 AND 7),
  type            VARCHAR(20) NOT NULL,                     -- photograph
  category        VARCHAR(20),                              -- one-person | multi-person | no-person
  difficulty      VARCHAR(8) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic           VARCHAR(20),
  quality_status  VARCHAR(16) NOT NULL DEFAULT 'draft'
                  CHECK (quality_status IN ('draft', 'autoChecked', 'reviewNeeded', 'verified', 'retired')),
  version         VARCHAR(16) NOT NULL,
  content         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_toeic_q_pool ON toeic_questions (part, quality_status, difficulty);

-- ชุดฝึก (Practice) / ชุดจำลอง (Mock) — items = [{qid, variant}] ลำดับและเสียงที่ผู้เรียนได้ (คำตอบตรวจจาก variant นี้)
CREATE TABLE IF NOT EXISTS toeic_sessions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part            SMALLINT NOT NULL,
  mode            VARCHAR(10) NOT NULL CHECK (mode IN ('practice', 'mock')),
  config          JSONB NOT NULL DEFAULT '{}',
  items           JSONB NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
  score           SMALLINT,
  total           SMALLINT NOT NULL,
  exp_awarded     INTEGER NOT NULL DEFAULT 0,
  asset_errors    SMALLINT NOT NULL DEFAULT 0,             -- จำนวนครั้งที่โหลดเสียง/ภาพไม่ได้ (ไม่หักคะแนน)
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_toeic_sessions_user ON toeic_sessions (user_id, part, mode, started_at DESC);

-- คำตอบรายข้อ = Error Notebook + Listening Analytics
CREATE TABLE IF NOT EXISTS toeic_answers (
  id              BIGSERIAL PRIMARY KEY,
  session_id      BIGINT NOT NULL REFERENCES toeic_sessions(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     VARCHAR(16) NOT NULL,
  part            SMALLINT NOT NULL,
  mode            VARCHAR(10) NOT NULL,
  variant         SMALLINT NOT NULL,
  selected        CHAR(1) NOT NULL CHECK (selected IN ('A', 'B', 'C', 'D')),
  correct_option  CHAR(1) NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  distractor_type VARCHAR(32),                              -- ประเภทตัวลวงที่เลือก (เมื่อตอบผิด)
  skill           VARCHAR(24) NOT NULL,                     -- ทักษะหลักของข้อ
  skills          TEXT[] NOT NULL DEFAULT '{}',
  category        VARCHAR(20),
  difficulty      VARCHAR(8),
  accent          VARCHAR(4),
  response_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_toeic_answers_user ON toeic_answers (user_id, part, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_toeic_answers_wrong ON toeic_answers (user_id, part, question_id) WHERE NOT is_correct;
