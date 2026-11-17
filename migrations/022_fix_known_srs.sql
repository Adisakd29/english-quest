-- ===== ซ่อมสถานะ SRS ของคำที่ "รู้แล้ว" ก่อนมีระบบ SRS (บั๊กจาก Phase 2A) =====
-- คอลัมน์ srs_* ถูกเพิ่มทีหลังด้วยค่าเริ่มต้น srs_reps = 0 แต่ระบบถือว่า known = ตอบถูกติดกัน >= 2 ครั้ง
-- ผล: ผู้ใช้ตอบถูกคำที่รู้แล้ว -> reps = 1 -> ถูกลดสถานะเป็น learning
-- ซ่อม: ให้สถานะ SRS สอดคล้องกับสถานะ known ที่ผู้ใช้ได้มาแล้ว (ไม่ลดความก้าวหน้า)
UPDATE word_progress
   SET srs_reps = 2, srs_interval = GREATEST(srs_interval, 3)
 WHERE status = 'known' AND srs_reps < 2;
