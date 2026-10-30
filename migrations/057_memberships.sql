-- v1.9.0: สมาชิก Premium (รายเดือน / รายปี) · ชำระผ่าน PromptPay QR + แนบสลิป · ผู้ดูแลตรวจแล้วอนุมัติ
-- เพิ่มตารางใหม่อย่างเดียว · ไม่แตะ users / coins / EXP / inventory
CREATE TABLE IF NOT EXISTS memberships (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan        VARCHAR(12) NOT NULL,                 -- แผนล่าสุดที่ต่ออายุ
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membership_orders (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan           VARCHAR(12) NOT NULL,
  days           INTEGER NOT NULL,
  amount_satang  INTEGER NOT NULL CHECK (amount_satang > 0),   -- ยอดเฉพาะของคำสั่งซื้อ (ราคา + เศษสตางค์ไม่ซ้ำ) ไว้จับคู่กับยอดเงินเข้า
  status         VARCHAR(12) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'cancelled', 'expired')),
  slip_image     BYTEA,                             -- ไม่อยู่ในโฟลเดอร์ public · ผู้ดูแลเท่านั้นที่เปิดดูได้ · ลบอัตโนมัติ 90 วันหลังตรวจ
  slip_mime      VARCHAR(16),
  slip_sha256    CHAR(64),
  paid_at_note   VARCHAR(40),                       -- เวลาโอนที่ผู้ใช้กรอก (ไม่บังคับ)
  admin_note     VARCHAR(200),
  reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,              -- คำสั่งซื้อที่ยังไม่แนบสลิปหมดอายุ
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_morders_user ON membership_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_morders_status ON membership_orders (status, created_at);
-- สลิปเดียวใช้ได้ครั้งเดียว
CREATE UNIQUE INDEX IF NOT EXISTS uq_morders_slip ON membership_orders (slip_sha256) WHERE slip_sha256 IS NOT NULL;
