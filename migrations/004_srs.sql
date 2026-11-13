-- ===== Phase 2A: Spaced Repetition =====

-- คอลัมน์ SRS ใน word_progress (เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม)
-- คำเก่าที่ยังไม่มีค่าเหล่านี้: srs_due_at = NULL → ถือว่า "ถึงกำหนดทบทวน" ทันที
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS srs_interval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS srs_ease     REAL    NOT NULL DEFAULT 2.5;
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS srs_reps     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS srs_lapses   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS srs_due_at   TIMESTAMPTZ;

-- index สำหรับหา "คำที่ถึงกำหนดทบทวน" ของผู้ใช้ได้เร็ว
CREATE INDEX IF NOT EXISTS idx_word_progress_due ON word_progress (user_id, srs_due_at);

-- บันทึกทุกคำตอบ (ฐานข้อมูลของ My Mistakes, Mastery, Analytics ในอนาคต)
-- skill: 'vocab' | 'grammar' | 'battle' ...
CREATE TABLE IF NOT EXISTS answer_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill       VARCHAR(16) NOT NULL,
  item_id     VARCHAR(32) NOT NULL,       -- word_id หรือ grammar chapter+q ฯลฯ
  level       VARCHAR(8),
  correct     BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answer_events_user ON answer_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_events_mistakes ON answer_events (user_id, skill, correct);
