# คู่มือขึ้น production — v1.24.0 → v1.25.0 (Christmas 2026 · "A Magical Christmas")

**คำขอ (24 พ.ย. 2569):** สเปก Christmas 2026 (event `christmas-2026` · เปิด 25 พ.ย. 2569 00:00 · จบ 31 ธ.ค. 23:59 · ใช้ร้าน/รับรางวัลได้ถึง 7 ม.ค. 2570 23:59 · Asia/Bangkok)
เน้น 4 เรื่อง: หิมะเป็นธรรมชาติ + หิมะเกาะเมนู · ชุด Avatar 3D ใส่ได้จริง · ทุกกิจกรรมผูกกับการเรียน · เพลงคริสต์มาสแต่งใหม่ (กดเปิดเองครั้งแรก)
**migration:** `082_christmas.sql` (เพิ่มตารางเท่านั้น + เพิ่มค่า `via='event'` ให้ `user_cosmetics`) — ไม่แตะ EXP / Coin / Inventory / Rank เดิม

## สิ่งที่ทำ (P0)
1. **Seasonal Theme Engine** — `config/season.js`: หลายฤดูกาลซ้อนช่วงกันได้ เลือกตาม `priority` (คริสต์มาส 20 > ลอยกระทง 10)
   - คริสต์มาสอ่านวันเวลา/สวิตช์จากตาราง `season_settings` (ผู้ดูแลแก้ที่ หน้าผู้ดูแล → "กิจกรรมคริสต์มาส 2026" · `GET/PUT /api/admin/christmas` เฉพาะ role admin)
   - สถานะ: scheduled · active · claim_only (หลังจบ ใช้ร้านได้) · ended · disabled · ทุกการแก้บันทึกใน `season_settings_log`
   - Feature flags: christmas_theme / snow / music / quests / checkin / rewards / shop / avatar_items (เปิด) · advent / story / boss / photobooth (**ยังไม่มีฟีเจอร์ → บังคับปิด เปิดไม่ได้ ไม่มีปุ่มหลอก**)
   - ปิดฉุกเฉินด้วยตัวแปรแวดล้อม `SEASON_DISABLE=christmas` ได้เหมือนเดิม
2. **ธีมคริสต์มาส** — `public/css/theme-christmas.css` (โทเคน `--christmas-*` ตามสเปก) · ฉากหมู่บ้าน/ต้นสนหิมะขอบล่าง · หิมะเกาะแถบบน (น้ำแข็งย้อย + ไฟประดับกะพริบช้า) / เมนูล่าง / แถบข้าง
   - หน้าเข้าสู่ระบบ: "Welcome to a Magical Christmas!" + ภาพจิ้งจอกใส่ผ้าพันคอ/หมวกซานต้าในหมู่บ้านหิมะ · ไอคอนแอป/โลโก้ช่วงเทศกาล (`public/img/season/christmas/` สร้างด้วย `scripts/season-icons/build_christmas.py`)
   - Lobby: ต้นคริสต์มาส + กล่องของขวัญหลังตัวละคร · การ์ดคริสต์มาส (นับถอยหลังวันคริสต์มาส · Token · สถานะเช็กอิน)
   - ตั้งค่า → ธีมเทศกาล: ปิดธีม/ปิดเอฟเฟกต์ได้ (แยกตามฤดูกาล — คนที่ปิดลอยกระทงไว้ยังเห็นคริสต์มาส)
3. **หิมะ** — `public/js/snow-fx.js` (`window.EQSnowFx`): 3 ระยะ + ชั้นหน้าเบลอ (เฉพาะระดับ full) · แกว่งแบบลูกตุ้ม + ลมเป็นระลอก + ผลึก 6 แฉกหมุน
   - ระดับ: full (เข้าสู่ระบบ/หน้าแรก/Hub/ร้าน/เล่น) · light (เส้นทางการเรียน/โปรไฟล์ ฯลฯ) · off (แบบฝึก/การฟัง/ติวสอบ/Ranked)
   - rAF เดียว · หยุดเมื่อแท็บซ่อน · มือถือ 30 fps · DPR จำกัด · ลดจำนวนเองเมื่อเฟรมตก · reduced-motion/ปิดเอฟเฟกต์ = ภาพนิ่ง · ไม่ใช้ backdrop-filter
4. **Snowflake Token** — `event_token_balances` (CHECK ≥ 0) + `event_token_ledger` (UNIQUE idem_key) · ทุกการเปลี่ยนยอดอยู่ใน transaction + advisory lock ต่อผู้เล่น
5. **เช็กอินรายวัน** — ต้องตอบถูก ≥ 5 ข้อในวันนั้น (นับจาก `answer_events`) → 10 Token + 15 EXP · วันละครั้ง (PK วันไทย) · ไม่บังคับต่อเนื่อง · กล่องของขวัญเปิดฝา
6. **เควสต์รายวัน** — สุ่มคงที่ 3 ข้อ/วันจาก 8 แบบ (คำศัพท์ · แกรมม่า · การฟัง · การอ่าน · ฝึก 20 ข้อ · แม่นยำ 80% · พูด · ติวสอบ) + โบนัสครบ 3 ข้อ · วัดจากข้อมูลการเรียนจริงของวันนั้น · รีเซ็ตเที่ยงคืนเวลาไทย
7. **ร้าน Token** (`config/christmas.js` SHOP) — ชุด 3D 16 ชิ้น + กรอบโปรไฟล์ "พวงหรีดคริสต์มาส" + กรอบแชท "โกโก้คืนหิมะตก" · ซื้อด้วย Coin ไม่ได้ · ได้แล้วเป็นของถาวร (`user_inventory.acquisition_type='event'`)
8. **ของขวัญต้อนรับ** — ครั้งเดียว: 30 Token + กรอบโปรไฟล์ "ใบฮอลลี่หิมะ" (ของจริงในบัญชี)
9. **ชุด Avatar 3D** — `scripts/avatar3d/blender/items_christmas.py` (Blender pipeline เดิม ผ่านด่านตรวจ 11 คลิปทุกชิ้น · ตรวจภาพหน้า/ข้าง/หลังที่สวมจริง):
   Santa Coat · Winter Scholar · Elf Tunic · Snow Prince · Snow Princess (ทรง A) · Cozy Traveler Duffle (**ฮู้ดจริง** ผ้าซับในลายสก็อต) · Reindeer Hoodie · Noel Guardian (ตำนาน)
   + หมวกซานต้า · ที่คาดผมเขากวาง · กิ๊บเกล็ดหิมะ · ผ้าพันคอ · ถุงมือ · บูทขอบขน · ไม้เท้าลูกกวาด · กางเกงวูลลายสก็อต · 2D art `scripts/avatar/art_xm26.js`
10. **เพลง** — `public/js/audio.js`: 3 เพลงแต่งใหม่ สังเคราะห์สด (Christmas Eve Memories · Snowfall in the Old Town · A Little Christmas Wish) + เวอร์ชันเบาสำหรับหน้าแบบฝึก
    - **ไม่เล่นเอง**: ปุ่มลอย "แตะเพื่อเปิดเพลงคริสต์มาส" · เปิด/หยุด · ระดับเสียง · เลือกเพลง · จำค่า (เครื่อง + บัญชี `xmasMusic`/`xmasTrack`) · fade · วนไร้รอยต่อ
    - หรี่เพลงอัตโนมัติเมื่อมีเสียงโจทย์ (audio/video) เล่น · หน้า TOEIC Listening ไม่มีเพลง

## ไฟล์
ใหม่: `config/christmas.js` · `services/christmas.js` · `routes/christmas.js` · `migrations/082_christmas.sql` (+ `_down`) · `public/js/snow-fx.js` · `public/js/christmas.js` · `public/css/theme-christmas.css` · `public/css/christmas.css`
· `scripts/avatar3d/blender/items_christmas.py` · `scripts/avatar/art_xm26.js` · `scripts/season-icons/build_christmas.py` · `public/img/season/christmas/*` · `public/img/christmas/login-fox.webp`
· GLB/ภาพย่อ `public/assets/avatar3d/*XM26*` · `test/christmas.test.js` · `test/e2e/xmas_e2e.py` · `test/e2e/xmas_snow_soak.py` · `docs/CHRISTMAS_2026.md`
แก้: `app.js` · `server.js` (โหลดตั้งค่าก่อนรับคำขอ) · `config/season.js` · `routes/season.js` · `routes/ranked.js` (ค่าเพลง) · `config/cosmetics.js` · `services/cosmetics.js` · `scripts/build-frames.js`
· `scripts/avatar/catalog.js` · `scripts/avatar/build-assets.js` · `scripts/avatar3d/blender/registry.py` · `scripts/avatar3d/blender/build_avatar3d.py` (QA render ตามสั่ง) · `data/avatar/models.json` · `data/avatar/catalog.json`
· `public/index.html` · `public/js/app.js` · `public/js/audio.js` · `public/js/season.js` · `public/js/avatar3d.js` (ชุดทดสอบ) · `public/sw.js` · `public/assets/frames/frames.svg` · `public/css/cosmetics-frames.css`
· `config/changelog.js` · `package.json` · `package-lock.json` · ชุดทดสอบเดิมที่ต้องปรับตามพฤติกรรมใหม่ (`test/season.test.js` · `test/avatar-optin.test.js` · `test/endless_cosmetics.test.js` · `test/ranked-battle.test.js`)

## ขั้นตอน
1. deploy → migration 082 รันอัตโนมัติ (เพิ่มตารางเท่านั้น) · ดู log `[migrate] ✓ 082_christmas.sql`
2. ก่อน 25 พ.ย. 00:00: เว็บยังเป็นธีมลอยกระทง · หน้าผู้ดูแล → "กิจกรรมคริสต์มาส 2026" สถานะ "รอเริ่ม"
3. **ทดสอบบน staging ก่อนเวลาเปิดจริง** (ทำจากที่นี่ไม่ได้): หน้าผู้ดูแล → ตั้ง "เริ่ม" เป็นเวลาก่อนหน้า → บันทึก → ภายใน ~2 นาทีเว็บเป็นธีมคริสต์มาส → ตรวจตามข้อ 4 → ตั้งกลับเป็น 25 พ.ย. 00:00
4. ตรวจด้วยมือถือจริง (iPhone Safari + Android Chrome) และคอม: หิมะลื่น · แตะปุ่มได้ทุกปุ่ม · กดเปิดเพลงแล้วมีเสียง · เช็กอินหลังเรียน 5 ข้อ · แลกของแล้วใส่ได้ · รีเฟรชแล้วชุดยังอยู่
5. ถ้าเครื่องช้า: ปิด `christmas_snow` ในหน้าผู้ดูแล (มีผลภายใน ~2 นาที ไม่ต้อง deploy)

## ย้อนกลับ
- ปิดทันทีโดยไม่ deploy: หน้าผู้ดูแล → ปิด "เปิดกิจกรรมคริสต์มาส" หรือ ตั้ง `SEASON_DISABLE=christmas`
- ย้อนโค้ด: deploy v1.24.0 (ตารางใหม่ไม่กระทบโค้ดเดิม) · ถ้าต้องลบตาราง: `migrations/082_christmas_down.sql` (ของที่ผู้เล่นแลกไปแล้วยังอยู่ใน `user_inventory` / `user_cosmetics`)
