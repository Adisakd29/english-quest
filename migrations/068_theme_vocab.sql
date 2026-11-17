-- v1.12.0: หมวดคำศัพท์ตามเทศกาล (วันฮาโลวีน · วันลอยกระทง) — เนื้อหาอยู่ใน data/theme-vocab/*.json
-- เพิ่มตารางใหม่อย่างเดียว · ไม่แตะ word_progress / EXP / Coin — เก็บความคืบหน้าแยก
CREATE TABLE IF NOT EXISTS theme_vocab_progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(12) NOT NULL,
  correct     INTEGER NOT NULL DEFAULT 0,
  wrong       INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,     -- ตอบถูกติดกัน (≥ 2 = จำได้แล้ว)
  last_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS theme_vocab_sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     VARCHAR(20) NOT NULL,
  items        JSONB NOT NULL,                -- [{ itemId, type: meaning|reverse|cloze, opts: [itemId x4], selected, correct }]
  status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  score        SMALLINT,
  total        SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_theme_vocab_sessions_user ON theme_vocab_sessions (user_id, created_at DESC);
