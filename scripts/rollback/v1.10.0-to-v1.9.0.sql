-- ย้อนฐานข้อมูลจาก v1.10.0 กลับไปใช้กับโค้ด v1.9.0 (ดู docs/DEPLOY_v1.10.0.md)
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/rollback/v1.10.0-to-v1.9.0.sql
-- -1 = ทำทั้งหมดในธุรกรรมเดียว (ผิดพลาดตรงไหน ย้อนทั้งหมด) · ข้อมูลผู้ใช้เดิม (บัญชี EXP Coin ของ ความคืบหน้า เพื่อน สมาชิก) ไม่ถูกลบ
-- สิ่งที่หายเมื่อย้อน: ข้อมูลของฟีเจอร์ใหม่ v1.10.0 (ความคืบหน้าเรื่องอ่าน·ฟัง · สถิติ Writing Studio · บทเรียน TOEIC Academy ·
--   รอบบทเรียนคำศัพท์ v2 · ทดลองใช้ Premium · audit_logs · ai_usage · ธงบัญชีทดสอบ) และเนื้อหาคำศัพท์ใหม่ (คืนค่าเดิมจากตารางสำรอง)
\ir ../../migrations/067_learner_vocab_b2c1_down.sql
\ir ../../migrations/066_graded_down.sql
\ir ../../migrations/065_test_accounts_down.sql
\ir ../../migrations/064_toeic_academy_down.sql
\ir ../../migrations/063_writing_studio_down.sql
\ir ../../migrations/062_vocab_lesson_sessions_down.sql
\ir ../../migrations/061_learner_vocab_down.sql
\ir ../../migrations/060_premium_foundation_down.sql
\ir ../../migrations/059_work_english_down.sql
-- ข้อสอบ TOEIC ที่เพิ่มใน v1.10.0 (Part 3 · Part 7) — v1.9.0 ไม่มีไฟล์เสียง/ข้อมูลของชุดเหล่านี้ → ซ่อน (ไม่ลบ คำตอบเดิมของผู้ใช้ยังอยู่)
-- อัปเกรดกลับเป็น v1.10.0 เมื่อไร ระบบซิงก์คลังข้อสอบตอนเริ่มเซิร์ฟเวอร์จะเปิดกลับเอง
UPDATE toeic_questions SET quality_status = 'draft', updated_at = NOW() WHERE id IN ('P3-0037', 'P3-0038', 'P3-0039', 'P3-0040', 'P3-0041', 'P3-0042', 'P3-0043', 'P3-0044', 'P3-0045', 'P3-0046', 'P3-0047', 'P3-0048', 'P3-0049', 'P3-0050', 'P3-0051', 'P3-0052', 'P3-0053', 'P3-0054', 'P3-0055', 'P3-0056', 'P3-0057', 'P3-0058', 'P3-0059', 'P3-0060', 'P7-0047', 'P7-0048', 'P7-0049', 'P7-0050', 'P7-0051', 'P7-0052', 'P7-0053', 'P7-0054', 'P7-0055', 'P7-0056', 'P7-0057', 'P7-0058', 'P7-0059', 'P7-0060', 'P7-0061', 'P7-0062', 'P7-0063', 'P7-0064', 'P7-0065', 'P7-0066', 'P7-0067', 'P7-0068', 'P7-0069', 'P7-0070');
