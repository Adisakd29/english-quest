DROP TABLE IF EXISTS ai_usage;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS membership_trials;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_status_check;
ALTER TABLE memberships DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS canceled_at, DROP COLUMN IF EXISTS cancel_reason;
DELETE FROM schema_migrations WHERE id = '060_premium_foundation.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
