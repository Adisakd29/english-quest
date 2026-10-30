# E2E (Playwright · Python)

ต้องมีเซิร์ฟเวอร์รันอยู่ที่ `http://localhost:3100` (ฐานข้อมูลสำหรับพัฒนา) และ `pip install playwright`

| ไฟล์ | ตรวจอะไร |
|---|---|
| `collapse_e2e.py` | ปุ่ม "ซ่อนหัวข้อ / แสดงหัวข้อ" บนแผนที่แกรมม่า — Desktop · Mobile (แตะ) · Keyboard (Enter/Space) · aria-expanded/aria-controls · ไม่กระโดดหน้า · จำสถานะ · "เนื้อหาฉบับเต็ม" |
| `lesson_e2e.py [width] [topic]` | Login → Grammar Map → Open Lesson → ทีละขั้น 12 ขั้น → ได้ EXP (HUD) → จบบท → Logout → Login → ความคืบหน้ายังอยู่ → Continue Learning |
| `c2_e2e.py [width] [light\|dark]` | คำศัพท์ C2: Login → Vocabulary → C2 → เปิด Unit → ขั้นเรียน → Quick Check → ได้ EXP → ออกแล้วเรียนต่อ → Guess from Context → ตอบผิด → คำอธิบาย → คิวทบทวน → จบบท → Challenge → Logout → Login → ความคืบหน้ายังอยู่ → ค้นหา C2 → การ์ด C2 · ตรวจไม่มี scroll แนวนอนทุกหน้า (ใช้ `c2_answers.js` หาเฉลยฝั่งเซิร์ฟเวอร์ · เขียน `assessments` ใน `eq_dev` เพื่อปลดล็อก C2) |
| `login_e2e.py` | หน้าเข้าสู่ระบบ: Parallax (desktop/tablet/mobile/landscape) · ระยะขยับแต่ละชั้น · ฟอร์ม/ปุ่ม Google ไม่ถูกบัง · Register / Forgot / Email login · คีย์บอร์ด · Reduced motion · CPU ช้า 4 เท่า |

รัน: `python3 test/e2e/collapse_e2e.py` (คืน exit code 1 ถ้ามีข้อไม่ผ่าน)
| `google_tap.py` | ปุ่ม Google บนมือถือ (iPhone/Android จำลอง) และคอมพิวเตอร์: แตะ iframe ของปุ่มแล้ว callback ทำงาน (จำลอง GIS เพราะเครื่องทดสอบเข้า accounts.google.com ไม่ได้ · ต้องรันเซิร์ฟเวอร์ด้วย `GOOGLE_CLIENT_ID=...`) |

## หมายเหตุเครื่องที่ใช้รัน (v1.10.0)
- `world_e2e.py` เปิดฉาก 3D 2 หน้าพร้อมกันด้วยซอฟต์แวร์เรนเดอร์ (SwiftShader) — ต้องใช้ CPU ≥ 4 คอร์ · บนเครื่อง 2 คอร์ได้ ~2 fps ต่อหน้า การคลิกอาจหมดเวลา (ไม่ใช่บั๊กของแอป)
- อย่ารัน E2E หลายชุดพร้อมกัน หรือพร้อมชุดทดสอบ unit (`login_e2e.py` มีการวัดเฟรมเรต จะไม่ผ่านเมื่อเครื่องโหลดหนัก)
- ทดสอบอัปเกรด/ย้อนกลับฐานข้อมูล v1.9.0 ↔ v1.10.0: ดู `docs/DEPLOY_v1.10.0.md`
