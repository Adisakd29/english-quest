# คู่มือขึ้น production — v1.10.4 → v1.11.0 (ยกเลิกสมาชิก Premium)

**ประเภท:** เลขรอง (เอาระบบหนึ่งออกทั้งระบบ) — **ไม่มี migration · ไม่ลบตาราง/ข้อมูล** · ไม่แตะ EXP / Coin / inventory / แรงค์
**ตัดสินใจโดยเจ้าของโปรเจกต์ (2 พ.ย. 2569):** เอาสมาชิก Premium ออก · ฟีเจอร์เดิมของ Premium เปิดให้ทุกคน · ยังไม่มีผู้จ่ายเงินจริง (ไม่ต้องคืนเงิน)

## สิ่งที่เปลี่ยน
| เดิม (Premium) | v1.11.0 |
|---|---|
| หน้า `#/premium`: แพ็กเกจ ฿39/฿299 · ทดลองใช้ 7 วัน · ชำระพร้อมเพย์ + แนบสลิป · ตรวจสลิปอัตโนมัติ (SlipOK) | ไม่มีแล้ว — `#/premium` (ลิงก์เก่า) พาไป `#/dashboard` |
| แดชบอร์ดการเรียน: ผู้ใช้ทั่วไปเห็นแค่คะแนน 6 ทักษะ · สมาชิกเห็นครบ | **ทุกคนเห็นครบ** · `GET /api/dashboard` · ลิงก์ในโปรไฟล์ "แดชบอร์ดการเรียน" |
| ภาษาอังกฤษเพื่อการทำงาน: ผู้ใช้ทั่วไปเห็นตัวอย่าง 2 วลี/หัวข้อ | **ทุกคนครบ 72 วลี + แบบฝึก** |
| ตัวช่วยรักษา Streak แผนฝึก TOEIC: เฉพาะสมาชิก | **ทุกคน** เดือนละ 2 ครั้ง |
| ป้าย Premium (โปรไฟล์ · กระดานอันดับ) · `premium` ใน `/api/auth/me` | ไม่มีแล้ว |
| โควตา AI: free 0 / trial 3 / premium 20 ต่อวัน (AI ปิดอยู่แล้ว) | ระดับเดียว = 0 สำหรับทุกคน (ยังไม่ใช้ AI ที่คิดค่าโทเค็น) |
| ผู้ดูแล "สมาชิก Premium — ตรวจสลิป" (คำสั่งซื้อ · ดูสลิป · อนุมัติ/ปฏิเสธ · ให้/ยกเลิกสิทธิ์ · บัญชีทดสอบ · ประวัติ) | ผู้ดูแล **"ผู้ใช้ — บัญชีทดสอบ / ประวัติการกระทำ"** (`/api/admin/users`) — เก็บเฉพาะธงบัญชีทดสอบ (กันบัญชีทดสอบขึ้นกระดานอันดับ) + ประวัติ (รวมรายการเก่าของระบบสมาชิก) |

### Endpoint ที่ไม่มีแล้ว (ตอบ 404)
`/api/membership` · `/api/membership/trial` · `/api/membership/orders*` · `/api/membership/dashboard` (ย้ายเป็น `/api/dashboard`) · `/api/admin/membership/*` (ธงบัญชีทดสอบย้ายเป็น `/api/admin/users/:id/test-flag`)

### ไฟล์
- ลบ: `routes/membership.js` · `services/membership.js` · `services/slipVerify.js` · `utils/promptpay.js` · `config/membership.js` · `public/js/premium.js` · `public/css/premium.css` · ชุดทดสอบ membership/premium (แทนด้วย `test/no-premium.test.js` · `test/e2e/dashboard_e2e.py`)
- ใหม่: `services/adminUsers.js` · `routes/adminUsers.js` · `public/js/dashboard.js` · `public/css/dashboard.css`
- แก้: `app.js` · `routes/auth.js` · `routes/leaderboard.js` · `routes/work.js` · `services/work/index.js` · `services/toeic/daily.js` · `services/aiQuota.js` · `config/ai.js` · `public/index.html` · `public/sw.js` · `public/js/{app,work,toeicdaily}.js` · `.env.example` · `package.json` (ถอดแพ็กเกจ `qrcode` ที่ใช้ทำ QR พร้อมเพย์)

### ข้อมูลในฐานข้อมูล
ตาราง `memberships` · `membership_orders` (รวมรูปสลิปที่ยังไม่ครบ 90 วัน) · `membership_trials` · `ai_usage` · `audit_logs` **ยังอยู่ครบ ไม่มีการลบ** — แอปไม่อ่าน/เขียนตารางสมาชิกแล้ว
ถ้าต้องการลบรูปสลิปที่ค้าง (ข้อมูลส่วนตัว) ทำเองได้หลังสำรองข้อมูล: `UPDATE membership_orders SET slip_image = NULL WHERE slip_image IS NOT NULL;` (ไม่จำเป็นต่อการทำงานของแอป)

## ขั้นตอน
- [ ] สำรองฐานข้อมูล
- [ ] deploy → `/api/health` = `1.11.0` · log `[migrate] ไม่มี migration ใหม่`
- [ ] (ไม่บังคับ) ลบตัวแปรใน Railway ที่ไม่ใช้แล้ว: `PROMPTPAY_ID` `PROMPTPAY_NAME` `PROMPTPAY_NAME_EN` `PAYEE_ACCOUNT_SUFFIX` `SLIPOK_API_KEY` `SLIPOK_BRANCH_ID` `PREMIUM_TRIAL_DAYS` — แอปไม่อ่านแล้ว (ถ้ายังตั้งไว้ก็ไม่มีผล) · ควรยกเลิก/หมุน SlipOK API key ที่ผู้ให้บริการด้วย
- [ ] โปรไฟล์ → "แดชบอร์ดการเรียน" เปิดได้ครบ · หน้าเรียน → อังกฤษเพื่อการทำงาน เปิดได้ครบ
- [ ] ผู้ดูแล → "ผู้ใช้ — บัญชีทดสอบ" ค้นหา/ตั้งบัญชีทดสอบได้

## ย้อนกลับ
deploy v1.10.4 กลับได้ทันที — ไม่มีการเปลี่ยน schema/ข้อมูล ระบบสมาชิกเดิมจะกลับมาทำงานกับข้อมูลเดิม (ต้องตั้ง env PromptPay/SlipOK กลับถ้าจะเปิดรับชำระ)
