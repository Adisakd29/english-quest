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

-- รูปโปรไฟล์ที่ผู้ใช้อัปโหลดเอง (เก็บเป็น base64 data URL) ถ้าไม่ null จะใช้
-- แทน avatar ที่เป็น emoji preset ขนาดจำกัดที่ ~100KB หลังจากย่อรูปแล้ว
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_image TEXT;

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

-- ตารางความคืบหน้าบทเรียนแกรมม่า (ต่อบท ต่อโหมด)
-- mode: 'basic' | 'intermediate' | 'advanced' | 'expert' | 'toeic' | 'toefl'
CREATE TABLE IF NOT EXISTS grammar_progress (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id     VARCHAR(32) NOT NULL,
  quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_score     INTEGER NOT NULL DEFAULT 0,
  quiz_total     INTEGER NOT NULL DEFAULT 0,
  last_attempted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_grammar_progress_user ON grammar_progress (user_id);

-- เพิ่ม mode column (ค่าเริ่มต้น 'basic' — เข้ากันได้กับข้อมูลเดิม)
ALTER TABLE grammar_progress ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'basic';

-- เปลี่ยน unique constraint ให้รวม mode ด้วย
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grammar_progress_user_id_chapter_id_key') THEN
    ALTER TABLE grammar_progress DROP CONSTRAINT grammar_progress_user_id_chapter_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grammar_progress_user_chapter_mode_key') THEN
    ALTER TABLE grammar_progress ADD CONSTRAINT grammar_progress_user_chapter_mode_key UNIQUE (user_id, chapter_id, mode);
  END IF;
END $$;

-- ตารางโทเคนรีเซ็ตรหัสผ่าน
-- เก็บเฉพาะ "ค่าแฮช" ของโทเคน ไม่เก็บตัวจริง เพื่อว่าถ้าฐานข้อมูลรั่ว
-- คนที่ได้ข้อมูลไปก็ยังรีเซ็ตรหัสผ่านของผู้ใช้ไม่ได้
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets (token_hash);
