-- v1.18.3 ความยุติธรรมของ EXP: จังหวะการตอบของผู้ใช้ (กันบอทตอบเร็วเกินมนุษย์ในหมวดเรียน) + บันทึกการริบ EXP ย้อนหลัง
-- ไม่ลบข้อมูลเดิม · การริบ EXP บันทึกเป็นแถวติดลบใน exp_log (เหตุผล integrity_reclaim) และคืนค่าได้

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_answer_at TIMESTAMPTZ;

-- การริบ EXP ต่อผู้ใช้ (batch เดียวกับการริบแต้มแรงค์)
CREATE TABLE IF NOT EXISTS exp_reclaims (
  id           SERIAL PRIMARY KEY,
  batch_id     VARCHAR(32) NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,                 -- EXP ที่ริบจริง (บวก)
  detail       JSONB NOT NULL,                   -- แยกตามแหล่ง: ranked / learning
  exp_before   INTEGER NOT NULL,
  exp_after    INTEGER NOT NULL,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reverted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_exp_reclaims_batch ON exp_reclaims (batch_id);

-- รายการ EXP แต่ละก้อนที่ถูกริบแล้ว (กันริบซ้ำ) · ref เช่น ranked:<match>:<user> · log:<exp_log.id> · award:<user>:<key>
CREATE TABLE IF NOT EXISTS exp_reclaim_refs (
  ref        VARCHAR(140) PRIMARY KEY,
  batch_id   VARCHAR(32) NOT NULL,
  user_id    INTEGER NOT NULL,
  amount     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exp_reclaim_refs_batch ON exp_reclaim_refs (batch_id);
