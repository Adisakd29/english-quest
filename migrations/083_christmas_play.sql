-- v1.25.1 Christmas 2026 P1: Advent Calendar · Boss · Story (เกมเก็บโจทย์/เฉลยฝั่งเซิร์ฟเวอร์) + การอนุมัติเนื้อหาโดยผู้ดูแล
-- เพิ่มเท่านั้น — ไม่แตะข้อมูลเดิม
CREATE TABLE IF NOT EXISTS xmas_runs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(40) NOT NULL,
  kind        VARCHAR(10) NOT NULL CHECK (kind IN ('advent', 'boss', 'story')),
  ref         VARCHAR(16) NOT NULL,              -- advent: วันที่ 1–25 · boss: วันไทย YYYY-MM-DD · story: c1–c5
  status      VARCHAR(10) NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost', 'quit')),
  q           JSONB,                             -- ข้อปัจจุบัน (มีเฉลย — ไม่ส่งไปหน้าเว็บ) · story: ชุดเฉลยทั้งตอน
  used        TEXT[] NOT NULL DEFAULT '{}',
  answered    INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  hp          INTEGER NOT NULL DEFAULT 0,
  hearts      INTEGER NOT NULL DEFAULT 0,
  combo       INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);
-- เล่นได้ทีละเกมต่อชนิด (คำขอพร้อมกันเริ่มซ้อนไม่ได้)
CREATE UNIQUE INDEX IF NOT EXISTS xmas_runs_one_playing ON xmas_runs (user_id, event_id, kind) WHERE status = 'playing';
CREATE INDEX IF NOT EXISTS xmas_runs_user ON xmas_runs (user_id, event_id, kind, ref);

-- ผลที่ได้รางวัลแล้ว (ครั้งเดียวต่อ ref) — Token อยู่ใน event_token_ledger (idem_key เดียวกัน)
CREATE TABLE IF NOT EXISTS xmas_wins (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    VARCHAR(40) NOT NULL,
  kind        VARCHAR(10) NOT NULL,
  ref         VARCHAR(16) NOT NULL,
  tokens      INTEGER NOT NULL,
  exp         INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, kind, ref)
);

-- เนื้อหาที่ร่างโดย AI ต้องผ่านผู้ดูแลก่อนเผยแพร่ (อนุมัติผูกกับ hash ของเนื้อหา — แก้เนื้อหาแล้วต้องอนุมัติใหม่)
CREATE TABLE IF NOT EXISTS content_reviews (
  content_id   VARCHAR(48) PRIMARY KEY,
  content_hash VARCHAR(64) NOT NULL,
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         VARCHAR(200)
);
