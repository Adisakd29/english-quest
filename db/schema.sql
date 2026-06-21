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

-- ตารางบันทึกเหตุการณ์ EXP (เผื่อทำ activity log / กันโกงในอนาคต)
CREATE TABLE IF NOT EXISTS exp_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
