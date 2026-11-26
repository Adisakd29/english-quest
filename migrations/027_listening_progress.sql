-- ===== ความคืบหน้าโหมด "ฟัง" แยกจากโหมด "อ่าน" =====
-- word_progress เดิม = ความคืบหน้าโหมดอ่าน (+ ตารางทบทวน SRS) — ไม่แตะข้อมูลเดิม
-- listening_progress = รู้คำนี้ "จากการฟัง" แล้วหรือยัง (นับ Unit/ระดับในโหมดฟังแยกกัน)
CREATE TABLE IF NOT EXISTS listening_progress (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id       VARCHAR(16) NOT NULL,
  level         VARCHAR(2)  NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'learning',  -- 'learning' | 'known'
  times_seen    INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  last_reviewed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ever_known    BOOLEAN NOT NULL DEFAULT FALSE,
  last_exp_at   TIMESTAMPTZ,
  UNIQUE (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_listening_progress_user_level ON listening_progress (user_id, level);

-- ย้อนเก็บจากคำตอบโหมดฟังที่เคยบันทึกไว้ (answer_events.skill = 'listening')
-- เคยตอบถูกอย่างน้อยหนึ่งครั้ง = รู้แล้ว (กติกาเดียวกับโหมดอ่าน: ตอบถูก = รู้แล้ว)
INSERT INTO listening_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed, ever_known, last_exp_at)
SELECT user_id, item_id, MAX(level),
       CASE WHEN BOOL_OR(correct) THEN 'known' ELSE 'learning' END,
       COUNT(*), COUNT(*) FILTER (WHERE correct), MAX(created_at), BOOL_OR(correct), MAX(created_at)
  FROM answer_events
 WHERE skill = 'listening' AND LENGTH(item_id) <= 16 AND level IN ('A1', 'A2', 'B1', 'B2', 'C1')
 GROUP BY user_id, item_id
ON CONFLICT (user_id, word_id) DO NOTHING;
