-- v1.10.0 Phase 5: ทำเครื่องหมาย "บัญชีทดสอบ" (ผู้ดูแลตั้งได้) — ไม่แสดงในกระดานอันดับทุกแบบ · ข้อมูลอื่นไม่เปลี่ยน
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_test ON users (id) WHERE is_test;
