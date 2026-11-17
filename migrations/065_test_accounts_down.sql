DROP INDEX IF EXISTS idx_users_is_test; ALTER TABLE users DROP COLUMN IF EXISTS is_test;
DELETE FROM schema_migrations WHERE id = '065_test_accounts.sql';   -- ให้อัปเกรดซ้ำได้หลังย้อนกลับ
