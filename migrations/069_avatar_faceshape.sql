-- v1.13.0: รูปหน้า (slot faceshape · ฟรีทุกคน) — เพิ่มคอลัมน์เดียว ค่าเริ่มต้น NULL = หน้ากลม (หน้าตาเดิมทุกคนไม่เปลี่ยน)
ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS faceshape_item_id VARCHAR(40);
