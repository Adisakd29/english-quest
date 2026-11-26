-- v1.20.0 โหมด "วาดทายศัพท์" (Draw & Guess)
-- ห้องเกม/ภาพวาดอยู่ในหน่วยความจำ (ชั่วคราว ไม่เก็บภาพ) — ตารางนี้เก็บเฉพาะ:
--   1) คำเชิญในแชทโลก: ข้อความแชทโลกชนิดพิเศษ (invite_kind = 'draw', invite_ref = รหัสห้อง) — ไม่มีข้อมูลส่วนตัว
--   2) หลักฐานรายงานภาพวาด: เส้นที่วาดตอนกดรายงาน (เก็บเพื่อผู้ดูแลตรวจเท่านั้น · ผูกกับ user_reports)
--   3) สรุปเกม (สถิติ/ประวัติของผู้เล่น — ไม่มีภาพ)
ALTER TABLE world_chat_messages ADD COLUMN IF NOT EXISTS invite_kind VARCHAR(16);
ALTER TABLE world_chat_messages ADD COLUMN IF NOT EXISTS invite_ref VARCHAR(16);

CREATE TABLE IF NOT EXISTS draw_report_evidence (
  report_id  INTEGER PRIMARY KEY REFERENCES user_reports(id) ON DELETE CASCADE,
  room_code  VARCHAR(8) NOT NULL,
  word       VARCHAR(32),
  strokes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draw_games (
  id          BIGSERIAL PRIMARY KEY,
  room_code   VARCHAR(8) NOT NULL,
  level       VARCHAR(4) NOT NULL,
  players     INTEGER NOT NULL,
  turns       INTEGER NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS draw_game_players (
  game_id   BIGINT NOT NULL REFERENCES draw_games(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score     INTEGER NOT NULL DEFAULT 0,
  place     INTEGER NOT NULL,
  guessed   INTEGER NOT NULL DEFAULT 0,
  drew      INTEGER NOT NULL DEFAULT 0,
  exp       INTEGER NOT NULL DEFAULT 0,
  words     TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_draw_game_players_user ON draw_game_players (user_id);
