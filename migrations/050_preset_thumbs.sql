-- v1.8.0: ภาพตัวอย่างของชุดที่บันทึกไว้ (Preset 1–3) — เพิ่มคอลัมน์เท่านั้น ไม่แตะข้อมูลเดิม
ALTER TABLE outfit_presets ADD COLUMN IF NOT EXISTS thumb TEXT;
