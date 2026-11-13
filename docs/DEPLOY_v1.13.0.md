# คู่มือขึ้น production — v1.12.2 → v1.13.0 (ปรับรูปหน้าได้ + เลิกเพดาน EXP การ์ดคำศัพท์)

**ประเภท:** รุ่นรอง · **มี migration 1 ไฟล์ (เพิ่มคอลัมน์อย่างเดียว ไม่ลบ/ไม่แก้ข้อมูลเดิม)** · ไม่ reset database · ไม่แตะ inventory/coin/EXP/rank เดิม
**คำขอ (3 พ.ย. 2569):** "อยากให้ปรับรูปทรงใบหน้าได้" (เลือกทรงสำเร็จ · ตัวละครปัจจุบันในแอป) · "ทำไมถึงยังครบเพดาน exp" → เลือก "เอาเพดานออก"

## 1. ปรับรูปหน้า (ช่องใหม่ `faceshape`)
- ของ 5 ชิ้น: `faceshape_round` (ค่าเริ่มต้น) · `faceshape_oval` · `faceshape_heart` · `faceshape_square` · `faceshape_long` — ฟรี · ของเริ่มต้น (sync ให้ผู้ใช้ทุกคนตอน deploy)
- ผู้ใช้เดิม: คอลัมน์เป็น NULL = หน้ากลม (หน้าตาเหมือนเดิมทุกประการ)
- **2D:** ภาพ body แยกตามทรง×สีผิว (`public/assets/avatar/items/body_<skin>--<shape>.svg` 20 ไฟล์ใหม่ + thumb 5 ไฟล์) · ไม่มีไฟล์เดิมเปลี่ยน
- **3D:** ไม่มี GLB ใหม่ — ดัดรูปทรงหัวช่วงใต้ตาลงไปตอนโหลด (`public/js/avatar3d.js` · `applyFaceShape`) ทั้งตัวฐาน หน้า ทรงผม แว่น หมวก หูฟัง ในพิกัด bind space เดียวกัน · normal คำนวณใหม่ (ไม่มีรอยพับ) · สลับทรงไปมาไม่สะสมความเพี้ยน · ใช้ทั้ง Wardrobe และ World
- Wardrobe: หมวด "รูปหน้า" (ไอคอน `scan-face`) ต่อจาก "รูปร่าง" · ไม่มีปุ่ม "ไม่สวม"

## 2. การ์ดคำศัพท์: ไม่มีเพดาน EXP รายวัน
- `services/vocab/record.js`: ค่าเริ่มต้นไม่มีเพดาน (เดิม 600/วัน) — ยังมี cooldown 20 ชม. ต่อคำ (กันปั๊มคำเดิม)
- เปิดเพดานกลับได้ทันทีโดยไม่ต้อง deploy โค้ด: ตั้ง env `CARD_EXP_DAILY_CAP=600` แล้วรีสตาร์ต

## Migration
- `migrations/069_avatar_faceshape.sql` — `ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS faceshape_item_id VARCHAR(40);`
- ย้อนกลับ: `migrations/069_avatar_faceshape_down.sql` (DROP COLUMN — ทำเฉพาะเมื่อแน่ใจ เพราะรูปหน้าที่ผู้ใช้เลือกไว้จะหาย)

## ไฟล์
`migrations/069_*` · `scripts/avatar/{art,catalog,build-assets}.js` · `public/assets/avatar/**` (เพิ่มเท่านั้น) · `services/avatar/catalog.js` · `public/js/avatar.js` · `public/js/avatar3d.js` · `data/avatar/models.json` · `scripts/avatar3d/optimize.mjs` · `scripts/build-icons.js` + sprite · `services/vocab/record.js` · `config/changelog.js` · `package*.json` · ชุดทดสอบ (`test/avatar-faceshape.test.js`, `test/no-premium.test.js`, `test/e2e/faceshape_e2e.py`)

## ขั้นตอน
- [ ] backup DB → deploy (migration รันอัตโนมัติ) → `/api/health` = `1.13.0`
- [ ] ตู้เสื้อผ้า → รูปหน้า → เลือก "หน้ารูปหัวใจ" → ตัวละคร 3D เปลี่ยน → บันทึก → รีโหลดแล้วยังอยู่
- [ ] เปิด World → ตัวละครแสดงรูปหน้าที่เลือก
- [ ] ฝึกการ์ดคำศัพท์เกิน 40 คำใหม่ → ยังได้ EXP (ไม่ขึ้น "ครบเพดาน")

## ย้อนกลับ
deploy v1.12.2 ได้โดยไม่ต้องย้อน migration (คอลัมน์ใหม่ถูกเพิกเฉย ตัวละครกลับเป็นหน้ากลม) · ของ faceshape ใน inventory ไม่กระทบอะไร
