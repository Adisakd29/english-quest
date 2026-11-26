# คู่มือขึ้น production — v1.25.1 → v1.25.2 (เซสชัน httpOnly cookie · ปุ่มเพลงไม่บังแชท · Photo booth บน iPhone)

**คำขอ (24 พ.ย. 2569):** "ทำต่อที่ยังไม่เสร็จ" — งานค้างจากรายงาน 1.25.1 ที่ทำได้จากฝั่งโค้ด
**migration:** ไม่มี

## สิ่งที่ทำ
1. **token เข้าสู่ระบบไม่อยู่ใน localStorage แล้ว** (`utils/sessionCookie.js`)
   - สมัคร / เข้าสู่ระบบ / Google / ยืนยันอีเมล / รีเซ็ตรหัส / ออกทุกเครื่อง → เซิร์ฟเวอร์ตั้ง cookie `eq_session` (HttpOnly · SameSite=Strict · Secure ใน production · Path=/api · 30 วัน)
   - JavaScript ในหน้าเว็บอ่าน token ไม่ได้ → ถ้ามีช่องโหว่ XSS ขโมย token ไม่ได้
   - **กัน CSRF**: SameSite=Strict + ทุกคำขอที่ใช้ cookie ต้องมี header `X-EQ-CSRF: 1` (ไม่มี = 403) — หน้าเว็บใส่ให้ทุกคำขอผ่าน `api()`
   - `Authorization: Bearer` ยังใช้ได้เหมือนเดิม (ชุดทดสอบ/สคริปต์) · cookie ชื่ออื่นไม่รับ (เหมือนเดิม)
   - **ผู้ใช้ที่เข้าสู่ระบบอยู่แล้วไม่ต้องเข้าใหม่**: เปิดแอปรุ่นนี้ครั้งแรก → `POST /api/auth/session` (Bearer เดิม) → ได้ cookie → ลบ token ออกจาก localStorage
   - ออกจากระบบ → `POST /api/auth/logout` ลบ cookie · ออกทุกเครื่องยังเพิกถอน cookie เก่าด้วย token_version เหมือนเดิม · ออฟไลน์ไม่ทำให้หลุดจากระบบ
   - ในเครื่องเก็บแค่ธง `eq_has_session` (ไม่ใช่ความลับ) เพื่อรู้ว่าควรถามเซิร์ฟเวอร์ตอนเปิดแอป
2. **ปุ่มเพลงคริสต์มาส (มือถือ)** ยกตัวหลบแถบแชทโลกย่อ/ปุ่มอื่นที่ทับ · ถ้ายกไม่พ้นจะหลบชั่วคราว (ปรับเพลงได้ที่ปุ่มลำโพงแถบบนเสมอ)
3. **Photo booth บน iPhone/iPad**: กดบันทึกรูป → เมนูแชร์ของระบบ (มี "บันทึกรูปภาพ") · ไม่มีเมนูแชร์ → แสดงรูปให้กดค้างบันทึก

## ไฟล์
ใหม่: `utils/sessionCookie.js` · `test/session-cookie.test.js` · `test/e2e/v1252_e2e.py` · `docs/DEPLOY_v1.25.2.md`
แก้: `middleware/auth.js` · `routes/auth.js` · `public/js/app.js` · `public/js/audio.js` · `public/js/christmas.js` · `public/css/christmas.css` · `config/changelog.js` · `package.json` · `package-lock.json`
· ชุดทดสอบ E2E ที่เคย "ออกจากระบบ" ด้วยการลบ token จาก localStorage → เปลี่ยนเป็นเรียกออกจากระบบจริง (`login_e2e.py` · `avatar_e2e.py` · `avatar_responsive.py`)

## ขั้นตอน
1. deploy (ไม่มี migration) — **ต้องเปิดผ่าน https** (cookie Secure ใน production)
2. มือถือที่เข้าสู่ระบบอยู่แล้ว: เปิดแอป → ยังเข้าสู่ระบบอยู่ · DevTools → Application → Local Storage ไม่มี `wq_token` · Cookies มี `eq_session` (HttpOnly ✓)
3. ออกจากระบบ → รีเฟรช → หน้าเข้าสู่ระบบ · เข้าสู่ระบบใหม่ด้วยรหัส/Google ได้
4. แอปที่ติดตั้งบนหน้าจอโฮม (PWA) บน iPhone: เข้าสู่ระบบแล้วปิดแอปเปิดใหม่ → ต้องยังเข้าสู่ระบบอยู่ (**ยังไม่ได้ทดสอบบนเครื่องจริง** — ถ้าหลุด แจ้งได้)

## ย้อนกลับ
deploy v1.25.1 — ผู้ใช้ที่ย้ายเป็น cookie แล้วจะต้องเข้าสู่ระบบใหม่หนึ่งครั้ง (รุ่นเก่าอ่าน cookie ไม่ได้) · ไม่มีข้อมูลหาย
