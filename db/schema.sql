-- ตารางผู้ใช้
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  exp           INTEGER      NOT NULL DEFAULT 0,
  avatar        VARCHAR(32)  NOT NULL DEFAULT 'fox',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ตารางสถานะคำศัพท์ของผู้ใช้แต่ละคน (สำหรับ flashcard / สถิติความก้าวหน้า)
CREATE TABLE IF NOT EXISTS word_progress (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id       VARCHAR(16) NOT NULL,
  level         VARCHAR(2)  NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'learning', -- 'learning' | 'known'
  times_seen    INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  last_reviewed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_word_progress_user_level ON word_progress (user_id, level);

-- ติดตามว่าคำนี้ "เคยรู้แล้ว" มาก่อนหรือไม่ (แบบติดถาวร ไม่รีเซ็ตแม้สถานะ
-- ปัจจุบันจะเปลี่ยนกลับเป็น learning) ใช้กันไม่ให้กดตอบผิด-ถูกสลับไปมาเพื่อ
-- รับโบนัส "รู้เป็นครั้งแรก" ซ้ำได้เรื่อย ๆ
ALTER TABLE word_progress ADD COLUMN IF NOT EXISTS ever_known BOOLEAN NOT NULL DEFAULT FALSE;

-- ตารางบันทึกเหตุการณ์ EXP (เผื่อทำ activity log / กันโกงในอนาคต)
CREATE TABLE IF NOT EXISTS exp_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- แคชคำแปลภาษาไทย (แปลครั้งแรกแล้วเก็บไว้ใช้ซ้ำ ทุกผู้ใช้ใช้แคชร่วมกัน
-- เพื่อลดการเรียกบริการแปลภาษาภายนอก และให้โหลดเร็วขึ้นเรื่อย ๆ เมื่อใช้งานไปนาน ๆ)
CREATE TABLE IF NOT EXISTS translations (
  word_id    VARCHAR(16) PRIMARY KEY,
  word       VARCHAR(64) NOT NULL,
  th_text    VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
