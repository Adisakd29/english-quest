-- v1.28.0 บอร์ดผู้สนับสนุน (โดเนทผ่าน ezdn.app) — ตารางใหม่อย่างเดียว ไม่แตะข้อมูลเดิม
-- ผู้ดูแลบันทึกจากหน้ารายการโดเนท (แอปไม่ได้เชื่อมกับ ezdn โดยตรง) · ไม่เก็บข้อความโดเนท/ข้อมูลธนาคาร
CREATE TABLE IF NOT EXISTS supporter_donations (
  id            SERIAL PRIMARY KEY,
  display_name  VARCHAR(40) NOT NULL,                 -- ชื่อที่ผู้โดเนทตั้งเองบน ezdn (แสดงบนบอร์ด)
  amount_satang INTEGER NOT NULL CHECK (amount_satang > 0 AND amount_satang <= 100000000),
  channel       VARCHAR(20),                          -- พร้อมเพย์ / ทรูมันนี่ ฯลฯ (ไม่แสดงบนบอร์ด)
  donated_at    TIMESTAMPTZ NOT NULL,
  hidden        BOOLEAN NOT NULL DEFAULT FALSE,       -- ผู้ดูแลซ่อน (เช่น เจ้าตัวขอไม่แสดงชื่อ) — ไม่ลบ
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- กันนำเข้ารายการเดิมซ้ำ (ชื่อ + ยอด + เวลาเดียวกัน)
CREATE UNIQUE INDEX IF NOT EXISTS uq_supporter_donation ON supporter_donations (lower(display_name), amount_satang, donated_at);

CREATE TABLE IF NOT EXISTS supporter_admin_logs (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(20) NOT NULL,                   -- import | hide | unhide | settings
  detail      VARCHAR(300),
  reason      VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
