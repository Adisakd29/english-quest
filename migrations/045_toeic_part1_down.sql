-- ย้อน 045: ลบเฉพาะตาราง TOEIC (EXP ที่ได้ไปแล้วยังอยู่ใน users.exp / exp_log ตามเดิม)
DROP TABLE IF EXISTS toeic_answers;
DROP TABLE IF EXISTS toeic_sessions;
DROP TABLE IF EXISTS toeic_questions;
