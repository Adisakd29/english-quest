# TOEIC — แผนฝึกรายวัน + Streak (Patch 1.10.0)

การ์ด "แผนฝึกวันนี้" ด้านบนหน้า TOEIC Practice (`#/toeic`)

## แผน
- 3 งานต่อวัน (เวลาไทย UTC+7) · ~10–15 นาที · สร้างครั้งเดียวตอนเปิดครั้งแรกของวัน แล้วคงที่ทั้งวัน
- ลำดับการเลือก (จาก `services/toeic/weakness.js`):
  1. ทบทวนข้อที่ยังผิดค้าง (Part ที่ค้างมากสุด)
  2. จุดอ่อน (ต้องฝึก/พอใช้) เรียงตามคะแนน
  3. กลุ่มที่ยังไม่เคยฝึก (คละ Part) → กลุ่มที่ข้อมูลยังน้อย
  4. ฝึกรวมของ Part
- เลือกให้ต่าง Part กันก่อน และต้องมีทั้ง Listening และ Reading เมื่อทำได้
- ขนาดงาน: P1 5 ข้อ · P2 10 ข้อ · P3/P4 1 ชุด · P5 10 ข้อ · P6 1 บทความ · P7 1 ชุด

## งานเสร็จเมื่อ
- session ของงานนั้น (Practice ที่มี `config.dailyTask = 'YYYY-MM-DD:k'`) ส่งแล้ว **และตอบครบทุกข้อ**
- งานทบทวนข้อผิด: ถ้าข้อผิดของ Part นั้นหมดแล้ว (ทบทวนจากที่อื่น) ถือว่าเสร็จ

## ความปลอดภัย
- เริ่มงาน: `POST /api/toeic/pN/sessions { mode:'practice', dailyTask:k }` → เซิร์ฟเวอร์ตรวจว่าเป็นงานของวันนี้ Part ตรง และยังไม่เสร็จ แล้ว **ใช้ body ของงานที่เก็บไว้แทนค่าจากหน้าเว็บ**
- งานผิด/Part ไม่ตรง = 404 · งานเสร็จแล้ว = 409 · Mock และ Full Mock ไม่ผูกกับแผน
- userId จาก token เท่านั้น

## รางวัล / Streak
- ครบ 3 งาน → `grantOnce('tdaily:<day>', 20 EXP)` วันละครั้ง · ไม่มี Coin เพิ่ม (EXP/Coin ของ Practice เป็นกติกาเดิม)
- Streak = วันที่ทำครบติดกัน นับถึงวันนี้ (หรือเมื่อวานถ้าวันนี้ยังไม่ครบ) · แสดง 7 วันล่าสุด + สถิติสูงสุด

## ไฟล์
- `migrations/056_toeic_daily_plans.sql` (+ `_down`) — ตารางใหม่ `toeic_daily_plans` เท่านั้น
- `services/toeic/daily.js` · `routes/toeic.js` (`GET /api/toeic/daily` + hook ใน `startWith`)
- `public/js/toeicdaily.js` · `public/css/toeicdaily.css` · การ์ดใน Hub (`toeic.js`) · ปุ่มในหน้าผลของทุก Part

## ทดสอบ
- Unit: `test/toeic-daily.test.js`
- E2E: `test/e2e/toeicdaily_e2e.py` · ภาพ `docs/screenshots/toeic-daily/`
