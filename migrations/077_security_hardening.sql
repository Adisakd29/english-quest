-- v1.18.4 ความปลอดภัย (ตรวจทั้งระบบ): กันส่งพร้อมกันซ้ำ · บันทึกการกระทำของแอดมิน · ระงับบัญชี · คำขอเพื่อนที่ถูกปฏิเสธ
-- ไม่ลบข้อมูลเดิม (การสอบที่ค้างซ้ำซ้อนเปลี่ยนสถานะเป็น expired เท่านั้น)

-- 1) การสอบ Unit/Boss: ค้างได้ทีละ 1 ครั้งต่อ Unit (กันเปิดหลายครั้งพร้อมกันแล้วรับโบนัสผ่านครั้งแรกซ้ำ)
UPDATE assessments a SET status = 'expired'
 WHERE a.status = 'in_progress'
   AND EXISTS (SELECT 1 FROM assessments b WHERE b.user_id = a.user_id AND b.kind = a.kind AND b.ref = a.ref
                AND b.status = 'in_progress' AND (b.created_at, b.id) > (a.created_at, a.id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessments_in_progress ON assessments (user_id, kind, ref) WHERE status = 'in_progress';

-- 2) บันทึกการกระทำของแอดมิน: ใช้ตาราง audit_logs เดิม (migration 060) — ไม่สร้างใหม่

-- 3) ระงับบัญชี (แอดมิน) — ไม่ลบบัญชี/ข้อมูล · หมดเวลาแล้วใช้ได้ตามเดิม
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason VARCHAR(300);

-- 4) คำขอเป็นเพื่อนที่ถูกปฏิเสธ: ส่งซ้ำได้หลังพ้นช่วงพัก (กันสแปม)
CREATE TABLE IF NOT EXISTS friend_request_declines (
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  declined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requester_id, addressee_id)
);

-- 5) สอบวัดระดับ: นับครั้งต่อวัน (ใช้ตารางเดิม placement_attempts) — index ช่วยนับเร็ว
CREATE INDEX IF NOT EXISTS idx_placement_user_created ON placement_attempts (user_id, created_at DESC);
