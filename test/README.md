# ชุดทดสอบ EnglishQuest

## วิธีรัน
ต้องมี PostgreSQL ที่ว่างสำหรับทดสอบ (ข้อมูลจะถูกเขียนลงไป อย่าชี้ production)

```bash
# สร้าง DB ทดสอบก่อน
createdb eq_test

# รันทั้งหมด
TEST_DATABASE_URL='postgresql://user:pass@localhost:5432/eq_test' npm test
```

ถ้าไม่ตั้ง `TEST_DATABASE_URL` จะใช้ `DATABASE_URL` แทน

## phase0.test.js ครอบคลุม
- สมัคร/ล็อกอิน/รหัสผ่านขั้นต่ำ 8 ตัว
- rate limit login (429)
- logout ทุกอุปกรณ์ (เพิกถอน token เก่า)
- EXP: เซิร์ฟเวอร์ตัดสินถูก/ผิดเอง + กันปั๊ม + exploit test
- translate ต้องล็อกอิน
- security headers
- ค้นหาเพื่อน escape wildcard + เพิ่ม/ตอบรับเพื่อน
- regression: แกรมม่า 16 บท (เฉลยไม่รั่ว), ส่งข้อสอบ, คำศัพท์, leaderboard
