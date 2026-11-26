# คู่มือขึ้น production — v1.25.0 → v1.25.1 (Christmas 2026 P1: Advent · Boss · Story · Photo booth)

**คำขอ (24 พ.ย. 2569):** "ทำต่อให้เสร็จ" — ทำส่วน P1 ที่ 1.25.0 ล็อกไว้ให้ใช้งานได้จริง
**migration:** `083_christmas_play.sql` (เพิ่มตาราง `xmas_runs` · `xmas_wins` · `content_reviews` เท่านั้น)

## สิ่งที่ทำ
1. **Advent Calendar** (`christmas_advent` เปิด) — ประตู 1–25 ธ.ค. เปิดได้ตั้งแต่วันนั้น (ย้อนเปิดวันที่พลาดได้) · ตอบคำศัพท์ 4 ข้อ ถูก ≥ 3 → 15 Token + 10 EXP (วันที่ 7/14/21 +25 · วันที่ 25 +50) · ตกลองใหม่ได้
2. **Boss "Frost Giant"** (`christmas_boss` เปิด) — พลัง 100 · ตอบถูกโจมตี 10 (+2 ต่อคอมโบ สูงสุด +6) · 3 หัวใจ · ข้อละ 20 วินาที (เซิร์ฟเวอร์ตรวจเวลา) · ชนะวันละครั้งได้ 30 Token + 25 EXP · เล่นฝึกต่อได้ไม่ได้รางวัลเพิ่ม
3. โจทย์ Advent/Boss มาจากคลังคำศัพท์ที่ตรวจแล้ว (`data/oxford` ผ่านตัวกรองเดียวกับโหมด Endless) — ไม่มีเนื้อหาใหม่ที่ยังไม่ตรวจ · เลือกคำหมวดฤดูหนาว/เทศกาลก่อนถ้ามีในคลัง · เฉลยอยู่ฝั่งเซิร์ฟเวอร์ · ตอบเร็วกว่า 0.6 วินาทีไม่นับ
4. **Story "The Missing Star of Snowfield"** 5 ตอน (`data/christmas/story.json` — แต่งใหม่ ร่างโดย AI) — **ซ่อนจนกว่าผู้ดูแลอ่านและอนุมัติครบทุกตอน** (หน้าผู้ดูแล → กิจกรรมคริสต์มาส → ตรวจเนื้อเรื่อง) แล้วเปิดสวิตช์ `christmas_story`
   - การอนุมัติผูกกับ hash ของเนื้อหา: แก้ข้อความ/คำถามแล้วต้องอนุมัติใหม่ (ระหว่างนั้นซ่อนเอง)
   - ตอนที่ n เปิดวันที่ 25 พ.ย. + 5(n−1) และต้องผ่านตอนก่อนหน้า · ตอบ 3 ข้อ ถูก ≥ 2 → 20 Token + 20 EXP · หลังส่งแสดงเฉลยพร้อมประโยคอ้างอิง · ไม่ระบุระดับ CEFR
5. **Photo booth** (`christmas_photobooth` เปิด) — ภาพตัวละคร 3D ของผู้ใช้ + ฉาก 3 แบบ → PNG 1080×1350 · ทำในเบราว์เซอร์ ไม่อัปโหลด · ชื่อผู้ใช้ไม่ใส่ในรูปเว้นแต่ติ๊กเอง · ปุ่มแชร์ (เครื่องที่รองรับ)
6. `XMAS_TEST_OFFSET_DAYS` (เครื่องพัฒนาเท่านั้น — production ไม่อ่านค่านี้) ใช้เลื่อนเวลากิจกรรมเพื่อทดสอบ Advent ก่อนถึงเดือน ธ.ค.

## ไฟล์
ใหม่: `services/christmasPlay.js` · `data/christmas/story.json` · `migrations/083_christmas_play.sql` (+ `_down`) · `test/christmas-play.test.js` · `test/e2e/xmas_p1_e2e.py` · `docs/DEPLOY_v1.25.1.md`
แก้: `config/christmas.js` · `services/christmas.js` · `routes/christmas.js` · `public/js/christmas.js` · `public/css/christmas.css` · `config/changelog.js` · `package.json` · `package-lock.json` · `test/christmas.test.js`

## ขั้นตอน
1. deploy → `[migrate] ✓ 083_christmas_play.sql`
2. ผู้ดูแลอ่านเนื้อเรื่องทั้ง 5 ตอน (ข้อความ คำถาม เฉลย เหตุผล) → อนุมัติ → เปิด "Story" → บันทึก (ไม่อนุมัติ = ผู้เล่นไม่เห็น ระบบอื่นทำงานปกติ)
3. ตรวจบนมือถือจริง: Advent ตั้งแต่ 1 ธ.ค. · Boss · Photo booth (บันทึกรูปบน iPhone: Safari จะเปิดรูป → กดค้างบันทึก)

## ย้อนกลับ
ปิดสวิตช์ทีละฟีเจอร์ในหน้าผู้ดูแลได้ทันที · หรือ deploy v1.25.0 (ตารางใหม่ไม่กระทบ) · ลบตาราง: `083_christmas_play_down.sql`
