-- v1.5.0 (ต่อ): บทเรียนแกรมม่าแบบทีละขั้น + รางวัล EXP ครั้งเดียวต่อคีย์
-- เพิ่มอย่างเดียว (ADD COLUMN / CREATE TABLE) — ไม่แก้/ไม่ลบข้อมูลเดิม

-- รางวัล EXP ที่ให้ได้ครั้งเดียว (จบขั้น · จบบท · Perfect · ตอบถูกครั้งแรกของข้อ) — กัน refresh / ทำซ้ำ / ส่งซ้ำพร้อมกัน
CREATE TABLE IF NOT EXISTS exp_awards (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  award_key  VARCHAR(96) NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 0,
  reason     VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, award_key)
);

-- ความคืบหน้าบทเรียนทีละขั้น (ต่อผู้ใช้ · ต่อหัวข้อ) — เรียนต่อได้ทุกอุปกรณ์
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS current_step    INTEGER NOT NULL DEFAULT 0;              -- ขั้นที่เรียนถึง (0-based)
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS run_no          INTEGER NOT NULL DEFAULT 1;              -- รอบที่เรียน (เริ่มรอบใหม่ = ชุดข้อใหม่)
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS run_steps       JSONB   NOT NULL DEFAULT '[]'::jsonb;    -- ขั้นที่ผ่านในรอบนี้
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS run_answers     JSONB   NOT NULL DEFAULT '{}'::jsonb;    -- itemId -> ถูก/ผิด (คำตอบแรกของรอบนี้)
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS completed_steps JSONB   NOT NULL DEFAULT '[]'::jsonb;    -- ขั้นที่เคยผ่าน (ทุกรอบ)
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS lesson_accuracy INTEGER;                                 -- % ความแม่นของรอบล่าสุดที่จบ
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS best_accuracy   INTEGER;
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS lesson_runs     INTEGER NOT NULL DEFAULT 0;              -- จำนวนรอบที่เรียนจบ
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS lesson_completed_at TIMESTAMPTZ;                         -- ผ่านบทเรียนแบบทีละขั้น (>= 80%)
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS mastered_at     TIMESTAMPTZ;
ALTER TABLE grammar_lessons ADD COLUMN IF NOT EXISTS last_study_at   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_glessons_recent ON grammar_lessons (user_id, last_study_at DESC);
