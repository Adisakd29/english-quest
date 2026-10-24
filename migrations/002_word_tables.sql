-- ===== Phase 1B-1: เตรียมตารางคำศัพท์ (ยังไม่ย้ายข้อมูล) =====
-- สร้างตารางเปล่าไว้ก่อน เพื่อให้ Phase 1B-2 ค่อยย้ายข้อมูลจาก words.json เข้ามา
-- ตอนนี้โค้ดยังอ่านจาก words.json เหมือนเดิม ตารางนี้จึงยังไม่ถูกใช้
-- (สร้างไว้ล่วงหน้าเพื่อพิสูจน์ว่าระบบ migration รับไฟล์ใหม่ได้จริง และ
--  ให้ schema พร้อมสำหรับฟีเจอร์ admin/SRS ในอนาคต)

-- ข้อมูลหลักของคำ (แยกจากเนื้อหา เพื่อให้เติมเนื้อหาทีละน้อยได้)
CREATE TABLE IF NOT EXISTS words (
  id          VARCHAR(16) PRIMARY KEY,   -- เช่น 'A1-0001' (ใช้ id เดิมจาก words.json)
  word        VARCHAR(128) NOT NULL,
  pos         VARCHAR(48),               -- part of speech
  category    VARCHAR(32),               -- noun/verb/adj/adv/...
  cefr        VARCHAR(2)  NOT NULL,      -- A1..C1
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_words_cefr ON words (cefr);
CREATE INDEX IF NOT EXISTS idx_words_category ON words (category);

-- เนื้อหาเสริมของคำ (ไทย, IPA, ความหมาย, ตัวอย่าง ฯลฯ) — เติมภายหลัง
-- status: 'draft' | 'reviewed' | 'published' เพื่อคุมคุณภาพก่อนแสดงผล
CREATE TABLE IF NOT EXISTS word_content (
  word_id       VARCHAR(16) PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  thai          VARCHAR(255),
  ipa           VARCHAR(128),
  definition_en TEXT,
  example_en    TEXT,
  source        VARCHAR(64),             -- ที่มาของเนื้อหา (เครดิต/ลิขสิทธิ์)
  status        VARCHAR(16) NOT NULL DEFAULT 'draft',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_word_content_status ON word_content (status);
