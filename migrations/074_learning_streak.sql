-- v1.18.0: Learning Streak — นับวันที่ทำเป้าหมายรายวันครบ (ตอบครบ 20 ข้อ ตามเวลาไทย) ติดต่อกัน
-- เพิ่มอย่างเดียว (CREATE TABLE / INSERT ... ON CONFLICT DO NOTHING) — ไม่แก้/ไม่ลบข้อมูลเดิม
-- 1) วันที่นับใน streak: 'goal' = ทำเป้าหมายครบจริง · 'freeze' = ใช้ Streak Freeze กันขาด (ไม่บวกจำนวนวัน แต่ไม่ทำให้ขาด)
CREATE TABLE IF NOT EXISTS streak_days (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  kind       VARCHAR(8) NOT NULL DEFAULT 'goal' CHECK (kind IN ('goal', 'freeze')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
-- 2) Streak Freeze ที่ซื้อไว้ (ถือได้สูงสุดตาม config) — used_day = วันที่ถูกใช้แทน
CREATE TABLE IF NOT EXISTS streak_freezes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price       INTEGER NOT NULL DEFAULT 0,
  used_day    DATE
);
CREATE INDEX IF NOT EXISTS idx_streak_freezes_open ON streak_freezes (user_id) WHERE used_day IS NULL;
-- 3) สรุปต่อผู้ใช้ (best = ยาวที่สุดที่เคยทำได้) + ล็อกแถวระหว่างคำนวณ
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best        INTEGER NOT NULL DEFAULT 0,
  synced_day  DATE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 4) ตรา Milestone (3/7/14/30/60/100/365 วัน) — ได้ครั้งเดียวต่อระดับ · รางวัล Coin/EXP ใช้ key ไม่ซ้ำของระบบเดิม
CREATE TABLE IF NOT EXISTS streak_milestones (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone   INTEGER NOT NULL,
  reached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen        BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, milestone)
);

-- ย้อนหลัง: วันที่เคยทำเป้าหมายครบจริง (คำตอบ ≥ 20 ข้อในวันนั้นตามเวลาไทย หรือเคยได้ Coin เป้าหมายรายวัน)
INSERT INTO streak_days (user_id, day, kind)
SELECT user_id, (created_at AT TIME ZONE 'Asia/Bangkok')::date AS d, 'goal'
  FROM answer_events
 GROUP BY user_id, (created_at AT TIME ZONE 'Asia/Bangkok')::date
HAVING COUNT(*) >= 20
ON CONFLICT DO NOTHING;
INSERT INTO streak_days (user_id, day, kind)
SELECT DISTINCT user_id, source_id::date, 'goal'
  FROM coin_transactions
 WHERE type = 'DAILY_GOAL' AND source_id ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT DO NOTHING;
-- best ย้อนหลัง (gaps-and-islands)
INSERT INTO user_streaks (user_id, best)
SELECT user_id, MAX(n) FROM (
  SELECT user_id, COUNT(*) AS n FROM (
    SELECT user_id, day, day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day))::int AS grp FROM streak_days
  ) s GROUP BY user_id, grp
) t GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;
