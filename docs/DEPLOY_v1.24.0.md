# คู่มือขึ้น production — v1.23.1 → v1.24.0 (PWA Smart Install Popup)

**คำขอ (23 พ.ย. 2569):** ป๊อปอัปชวนติดตั้งแอป (Android ติดตั้งจริงด้วย beforeinstallprompt · iPhone/iPad แสดงขั้นตอน Add to Home Screen) + ตรวจระบบ PWA
**migration:** ไม่มี · ไม่แตะ Login / Google Login / EXP / Rank / Learning Path / Chat / Avatar · สถานะการชวนเก็บใน localStorage `eq_pwa` ของเครื่อง (ไม่เกี่ยวกับบัญชี)

## ระบบเดิมที่ตรวจ
- มี manifest (`/manifest.webmanifest` สร้างจาก route ตามฤดูกาล) + Service Worker (network-first, ไม่แคช /api) + HSTS ใน production อยู่แล้ว
- ขาด: ชื่อ "English Quest", `id`, การตรวจว่าติดตั้งแล้ว, ป๊อปอัป/เมนูติดตั้ง, redirect http→https, การกัน no-store/private ใน SW

## สิ่งที่ทำ
1. **`public/js/install.js` (ใหม่) + `public/css/install.css`** — `window.EQInstall`
   - Android/Chrome/Edge/Samsung: เก็บ `beforeinstallprompt` (preventDefault) → กด "ติดตั้งแอป" เรียก `prompt()` → `userChoice`
     · accepted → "กำลังติดตั้ง…" จนกว่าได้ `appinstalled` จึงบอก "ติดตั้งแล้ว" (ไม่ได้ภายใน 20 วินาที → บอกว่ายืนยันแล้ว รอระบบ ไม่อ้างว่าสำเร็จ)
     · dismissed → "ยังไม่ได้ติดตั้ง" + เลื่อน 7 วัน
   - iPhone/iPad (รวม iPad ที่รายงานตัวเป็น Mac): ไม่มีปุ่มติดตั้งปลอม — ปุ่ม "ดูวิธีเพิ่มลงหน้าจอโฮม" แสดงขั้นตอนตามรุ่นจริง:
     Safari 26 (⋯ → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิด "เปิดเป็นเว็บแอป" → เพิ่ม) · Safari เดิม (แชร์ล่าง/บนขวาบน iPad) · Chrome/Edge/Firefox บน iOS (แชร์ในแถบที่อยู่ · iOS 16.4+)
   - LINE (เบราว์เซอร์ในแอป): ปุ่ม "เปิดในเบราว์เซอร์" เป็นลิงก์จริง `?openExternalBrowser=1` · Facebook/Instagram ฯลฯ: บอกวิธีเปิดในเบราว์เซอร์
   - Android ที่ไม่มี event (ติดตั้งแล้ว/ยังไม่ครบเงื่อนไข/Firefox): ไม่เด้งเอง — ตั้งค่าบอกวิธีติดตั้งจากเมนูเบราว์เซอร์ · Safari บน Mac: ไฟล์ → เพิ่มไปยัง Dock · Firefox บนคอม: ไม่แสดงอะไร (ติดตั้งไม่ได้)
   - **ไม่แสดงเมื่อ**: เปิดแบบแอป (display-mode standalone/fullscreen/minimal-ui, navigator.standalone) · เคยได้ appinstalled · `getInstalledRelatedApps` บอกติดตั้งแล้ว · กด "ไว้ทีหลัง"/ปิด ภายใน 7 วัน · ติดตั้งไม่ได้ในตอนนั้น
   - **เวลาแสดง**: หลังเข้าสู่ระบบ อยู่หน้าแรก ผู้ใช้แตะ/พิมพ์แล้ว + 6 วินาที · ไม่ทับหน้าต่างอื่น · ไม่เด้งในหน้าเข้าสู่ระบบ (มีปุ่มเล็กใต้ฟอร์มแทน) · ครั้งเดียวต่อการเปิด
   - เมนู: ปุ่ม "ติดตั้งแอป English Quest ลงหน้าจอโฮม" ใต้ฟอร์มหน้าเข้าสู่ระบบ · ตั้งค่า → การ์ด "ติดตั้งแอป" (บอก "ติดตั้งแล้ว" ถ้าติดตั้งแล้ว)
   - การแจ้งเตือนบน iPhone ("ดูวิธีเพิ่มลงหน้าจอโฮม") ใช้ขั้นตอนเดียวกัน (`notify.js`)
2. **Manifest**: name "English Quest" · short_name "EnglishQuest" · id "/" · start_url/scope "/" · display standalone · ไอคอน 192/512 any + maskable (ตรวจขนาดจริง) · `related_applications` (URL เต็มของ manifest ตามโดเมน) · `prefer_related_applications: false`
3. **Service Worker**: ไม่ผ่านแคชเมื่อคำขอมี Authorization · ไม่เก็บ response ที่ `Cache-Control: no-store/private` · /api ไม่แคชเหมือนเดิม · เพิ่มไฟล์ติดตั้ง/ธีมลอยกระทงใน app shell
4. **HTTPS**: production + `X-Forwarded-Proto: http` → GET/HEAD 301 ไป https URL เดิม · วิธีอื่น 403 · `/api/health` และคำขอภายใน (ไม่มี header) ผ่าน · ปิดได้ `FORCE_HTTPS=off` · HSTS เดิมยังอยู่
5. `index.html`: meta `mobile-web-app-capable`, `application-name`

## ไฟล์
ใหม่: `public/js/install.js` · `public/css/install.css` · `test/pwa.test.js` · `test/e2e/pwa_install_e2e.py`
แก้: `public/index.html` · `public/js/notify.js` · `public/manifest.webmanifest` · `routes/season.js` · `public/sw.js` · `utils/security.js` · `app.js` · `config/changelog.js` · `package.json` · `package-lock.json`

## ขั้นตอน
1. deploy (ไม่มี migration) · เปิดเว็บผ่าน https ตรวจ `http://english-quest.up.railway.app/` ต้องเด้งไป https
2. Android Chrome: เข้าสู่ระบบ → แตะหน้าแรก → ป๊อปอัป → ติดตั้งแอป → ยืนยัน → ไอคอนบนหน้าจอโฮม → เปิดเต็มจอ
3. iPhone Safari: เข้าสู่ระบบ → ป๊อปอัป → ดูวิธี → ทำตาม → เปิดจากไอคอน (เต็มจอ ไม่มีแถบ Safari)
4. Chrome DevTools → Application → Manifest: ไม่มีข้อผิดพลาด "Installability"

## ย้อนกลับ
deploy v1.23.1 — ไม่มี migration (ถ้าปัญหาที่ https redirect: ตั้ง `FORCE_HTTPS=off`)
