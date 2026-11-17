# TOEIC Full Mock Test (Patch 1.10.0)

ทำ Mock ของ Part 1–7 ต่อกันเป็นชุดเดียว แล้วสรุปเป็น **คะแนนประมาณการ** Listening / Reading

## โครงสร้าง
| Part | ใช้ Mock เดิมของ Part | ข้อ (ประมาณ) |
|---|---|---|
| 1 | Photographs | 6 |
| 2 | Question–Response | 25 |
| 3 | Conversations | 39 |
| 4 | Talks | 30 |
| 5 | Incomplete Sentences | 30 (12 นาที) |
| 6 | Text Completion | 16 (10 นาที) |
| 7 | Reading Comprehension | ~22 (1 นาที/ข้อ) |

รวมประมาณ 132 ข้อ ~70 นาที (ข้อสอบจริง 200 ข้อ 120 นาที) · พักระหว่าง Part ได้ · ทำ Part ไหนก่อนก็ได้

## Backend
- `migrations/055_toeic_full_tests.sql` — ตาราง `toeic_full_tests` (id, user_id, status active|finished|abandoned, result JSONB, started_at, finished_at) · ไม่แตะตารางเดิม
- `services/toeic/full.js`
  - `precheck` ก่อนสร้าง session (กันชุดที่ปิดแล้ว/Part ที่ทำแล้ว) → `attach` เขียน `toeic_sessions.config.fullTestId`
  - `finish` ต้องครบ 7 Part · บันทึกผล · `grantOnce('tfull:<id>', 40 EXP)` จำกัดวันละ 40
  - userId มาจาก token เท่านั้น · ดูชุดของคนอื่นไม่ได้ (404)
- Routes (`routes/toeic.js`): `GET/POST /api/toeic/full`, `GET /api/toeic/full/:id`, `POST /api/toeic/full/:id/finish`, `POST /api/toeic/full/:id/abandon`
- การตรวจคำตอบ เวลา EXP และ Coin ของแต่ละ Part ใช้กติกาเดิมของ Part นั้นทุกอย่าง

## การประมาณคะแนน
- `score = round5(5 + 490 × p)` จำกัด 5–495 (p = สัดส่วนตอบถูกใน Section)
- ช่วงคลาดเคลื่อน `± max(15, round5(1.96 × √(max(p(1−p), 0.04)/n) × 490))`
- CEFR โดยประมาณ (อิงเกณฑ์ที่ ETS เผยแพร่)
  - Listening: A1 60 · A2 110 · B1 275 · B2 400 · C1 490
  - Reading: A1 60 · A2 115 · B1 275 · B2 385 · C1 455
- **ข้อจำกัด:** เป็นสูตรเส้นตรง ไม่ใช่ตารางแปลงคะแนน (equating) ของ ETS · ข้อสอบเป็นต้นฉบับของแอป ไม่ได้ผ่านการ calibrate กับผู้สอบจริง · ใช้ดูแนวโน้มเท่านั้น

## Frontend
- `public/js/toeicfull.js`, `public/css/toeicfull.css` · route `#/toeic-full`, `#/toeic-full/<id>`
- การ์ด Full Mock ในหน้า TOEIC hub · หน้าผลแสดงคะแนน L/R ช่วง CEFR แถบราย Part และลิงก์ไป Part ที่อ่อนที่สุด
- แต่ละโมดูล Part มี `mock()` และปุ่ม "กลับไป Full Mock Test" ในหน้าผลเมื่อเป็น session ของชุด

## ทดสอบ
- Unit: `test/toeic-full.test.js`
- E2E: `test/e2e/toeicfull_e2e.py` (desktop 1280 + mobile 390) · ภาพใน `docs/screenshots/toeic-full/`
