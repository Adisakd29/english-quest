# ตั้งค่าเข้าสู่ระบบด้วย Google

ใช้ **Google Identity Services** (ปุ่ม "Continue with Google" แบบป๊อปอัป) + ตรวจ ID token ฝั่งเซิร์ฟเวอร์ด้วย `google-auth-library`
ต้องใช้แค่ **Client ID** — ไม่ต้องมี Client Secret และ **ไม่ต้องตั้ง Redirect URI** (ไม่ได้ใช้ redirect flow)

## 1. สร้าง OAuth Client ID (ทำครั้งเดียว ~10 นาที)

1. เข้า https://console.cloud.google.com/ → เลือกหรือสร้างโปรเจกต์ เช่น `EnglishQuest`
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name: `EnglishQuest` · User support email: อีเมลของคุณ · Developer contact: อีเมลของคุณ
   - Scopes: ไม่ต้องเพิ่ม (ใช้แค่ `openid`, `email`, `profile` ซึ่งเป็นค่าพื้นฐาน)
   - กด **Publish app** (ถ้าค้างที่ Testing จะเข้าได้เฉพาะอีเมลที่ใส่ใน Test users)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application** · Name: `EnglishQuest Web`
   - **Authorized JavaScript origins** — เพิ่ม 3 รายการ:
     ```
     http://localhost
     http://localhost:3000
     https://english-quest.up.railway.app
     ```
     (ถ้าใช้โดเมนของตัวเองในอนาคต เพิ่ม `https://โดเมนของคุณ` ด้วย)
   - **Authorized redirect URIs: เว้นว่าง**
   - กด Create → คัดลอก **Client ID** (ลงท้ายด้วย `.apps.googleusercontent.com`)

## 2. ใส่ใน Railway

Railway → โปรเจกต์ → Service → **Variables** → New Variable

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | `xxxxxxxx.apps.googleusercontent.com` |

Railway จะ redeploy อัตโนมัติ — ปุ่ม Google จะปรากฏในหน้าเข้าสู่ระบบ
**ไม่ตั้งตัวแปรนี้ = ปุ่ม Google ถูกซ่อน ระบบเดิมทำงานปกติ**

## 3. พฤติกรรมของระบบ

| สถานการณ์ | ผล |
|---|---|
| ผู้ใช้ใหม่กด Google | สร้างบัญชีใหม่ (ไม่มีรหัสผ่าน) ชื่อผู้ใช้สร้างจากอีเมล เปลี่ยนได้ในโปรไฟล์ |
| เคยเชื่อม Google แล้ว | เข้าสู่ระบบบัญชีเดิม |
| อีเมลตรงกับบัญชีเดิมที่สมัครด้วยรหัสผ่าน | **ไม่เชื่อมอัตโนมัติ** → บอกให้เข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วกด "เชื่อมบัญชี Google" ในโปรไฟล์ |
| อีเมลที่ Google ยังไม่ยืนยัน | ปฏิเสธ |
| บัญชี Google-only พิมพ์รหัสผ่าน | แจ้งให้ใช้ปุ่ม Google หรือตั้งรหัสผ่านผ่าน "ลืมรหัสผ่าน" |
| ยกเลิกการเชื่อม | ทำได้เมื่อบัญชีมีรหัสผ่านแล้วเท่านั้น (กันเข้าบัญชีไม่ได้) |

**ทำไมไม่เชื่อมอัตโนมัติเมื่ออีเมลตรงกัน:** ระบบสมัครเดิมไม่เคยยืนยันอีเมล — ใครก็สมัครด้วยอีเมลคนอื่นไว้ก่อนได้
ถ้าเชื่อมอัตโนมัติ เจ้าของอีเมลตัวจริงที่กด Google จะเข้าไปอยู่ในบัญชีที่คนอื่นสร้าง (หรือกลับกัน)

## 4. ข้อมูลที่เก็บ

ตาราง `user_identities`: provider, Google `sub` (รหัสผู้ใช้ที่ไม่เปลี่ยน), อีเมลที่ยืนยันแล้ว, ชื่อ, URL รูป, เวลาเข้าสู่ระบบล่าสุด
**ไม่เก็บ** access token / refresh token ใด ๆ

## 5. ทดสอบหลังตั้งค่า

1. เปิดเว็บในหน้าต่างไม่ระบุตัวตน → เห็นปุ่ม "Continue with Google"
2. กด → เลือกบัญชี Google ที่ยังไม่เคยใช้ → ต้องเข้าสู่ระบบพร้อมข้อความ "สร้างบัญชีใหม่แล้ว"
3. ออกจากระบบ → กดอีกครั้ง → ต้องเข้าบัญชีเดิม (EXP/ความก้าวหน้าเดิม)
4. ถ้าเห็นข้อความ `Error 400: origin_mismatch` = ยังไม่ได้เพิ่มโดเมนใน Authorized JavaScript origins
