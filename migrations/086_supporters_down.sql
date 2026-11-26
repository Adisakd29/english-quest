-- ย้อน v1.28.0 บอร์ดผู้สนับสนุน (ลบเฉพาะตารางที่เพิ่ม)
DROP TABLE IF EXISTS supporter_admin_logs;
DROP TABLE IF EXISTS supporter_donations;
DELETE FROM app_settings WHERE key = 'supporters';
