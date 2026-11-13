-- v1.19.2 สอบจำลองแบบ "เฉลยทันทีหลังตอบแต่ละข้อ" (ค่าเริ่มต้น) หรือ "เฉลยตอนส่ง (เหมือนสอบจริง)"
-- instant = TRUE: ตอบแล้วล็อกข้อ + เห็นถูก/ผิดและคำอธิบายทันที · คะแนนรวมยังคิดตอนส่ง
-- ชุดเดิมก่อนแพตช์นี้ = FALSE (พฤติกรรมเดิม)
ALTER TABLE tcas_sessions ADD COLUMN IF NOT EXISTS instant BOOLEAN NOT NULL DEFAULT FALSE;
