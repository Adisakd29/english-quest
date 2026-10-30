-- ย้อนกลับ 023 — ⚠️ บัญชีที่สมัครด้วย Google อย่างเดียว (ไม่มีรหัสผ่าน) จะเข้าสู่ระบบไม่ได้
-- ต้องให้ผู้ใช้กลุ่มนี้ตั้งรหัสผ่านผ่าน "ลืมรหัสผ่าน" ก่อน หรือคงตารางไว้
DROP TABLE IF EXISTS user_identities;
DELETE FROM schema_migrations WHERE id = '023_user_identities.sql';
-- ไม่คืน NOT NULL ให้ password_hash เพราะจะล้มถ้ามีบัญชี Google-only
