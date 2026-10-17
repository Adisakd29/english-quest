-- 038: Halloween Adventure (4 Chapter + Final Challenge) — เพิ่มคอลัมน์/ตารางเท่านั้น ไม่แก้ไขหรือลบข้อมูลเดิม
-- ผลของแต่ละรอบ (ใช้ตรวจภารกิจ "ทำคะแนนผ่านเกณฑ์") — แถวเดิมเป็น NULL = ไม่ทราบคะแนน
ALTER TABLE event_activity ADD COLUMN IF NOT EXISTS correct INTEGER;
ALTER TABLE event_activity ADD COLUMN IF NOT EXISTS total INTEGER;

-- ด่าน (Stage) ของกิจกรรม: แต่ละรอบรู้ว่าเป็นด่านไหน คะแนนแยกหมวด และเวลาที่ใช้
ALTER TABLE event_challenge_attempts ADD COLUMN IF NOT EXISTS stage_id VARCHAR(32);
ALTER TABLE event_challenge_attempts ADD COLUMN IF NOT EXISTS detail JSONB;
ALTER TABLE event_challenge_attempts ADD COLUMN IF NOT EXISTS time_ms INTEGER;
CREATE INDEX IF NOT EXISTS idx_event_attempts_stage ON event_challenge_attempts (event_id, user_id, stage_id, passed);

-- สถานะ Chapter ของผู้เล่น (บันทึกอัตโนมัติ — ใช้ดูย้อนหลังหลังกิจกรรมจบ)
CREATE TABLE IF NOT EXISTS event_chapter_progress (
  event_id     VARCHAR(48) NOT NULL REFERENCES events(id),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id   VARCHAR(16) NOT NULL,
  unlocked_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, chapter_id)
);
