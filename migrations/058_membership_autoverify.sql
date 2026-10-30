-- v1.9.0: ตรวจสลิปอัตโนมัติ (ผู้ให้บริการตรวจสลิปกับธนาคาร เช่น SlipOK) — เพิ่มคอลัมน์อย่างเดียว
ALTER TABLE membership_orders ADD COLUMN IF NOT EXISTS verify_status   VARCHAR(12);   -- passed | failed | error | skipped
ALTER TABLE membership_orders ADD COLUMN IF NOT EXISTS verify_note     VARCHAR(200);
ALTER TABLE membership_orders ADD COLUMN IF NOT EXISTS verify_provider VARCHAR(16);
ALTER TABLE membership_orders ADD COLUMN IF NOT EXISTS trans_ref       VARCHAR(40);   -- เลขอ้างอิงธุรกรรมจากธนาคาร
ALTER TABLE membership_orders ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ;
-- ธุรกรรมเดียวใช้ได้ครั้งเดียว (กันส่งรูปสลิปเดิมที่ถูกแก้/ครอปให้ hash ต่างกัน)
CREATE UNIQUE INDEX IF NOT EXISTS uq_morders_transref ON membership_orders (trans_ref) WHERE trans_ref IS NOT NULL;
