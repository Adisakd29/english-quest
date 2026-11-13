# คู่มือขึ้น production — v1.16.0 → v1.17.0 (Flashcard ดาวน์โหลด + Event Carousel + แชทโลกบน Game Lobby)

**ประเภท:** เวอร์ชันรอง (ฟีเจอร์ใหม่) · **มี migration 072, 073 (เพิ่มคอลัมน์อย่างเดียว · ไม่ลบ/แก้ข้อมูลเดิม)**
**คำขอ (6 พ.ย. 2569):** "ทำ Flashcard สวยงามภาษาอังกฤษให้ผู้ใช้สามารถโหลดไปใช้งานได้" (เลือก: PDF พิมพ์ตัดได้ + รูปบนมือถือ · ชุดคำตามระดับ CEFR / หัวข้อ)
และ "กิจกรรมต่างๆ อยากให้ขึ้นเป็นแบนเนอร์เลื่อนตลอดเวลาครับสามารถกดที่แบนเนอร์ได้"
ต่อด้วยสเปก "Game Lobby Event Carousel Redesign" และ "Global World Chat สำหรับหน้า Game Lobby" + "เอาเมนูแชทโลกในหน้าเล่นออกด้วยครับ คงไว้แพตช์เดิม" (ทั้งหมดอยู่ใน v1.17.0)

## สิ่งที่เปลี่ยน
### Flashcard ดาวน์โหลด (`#/flashcards` · ปุ่ม "Flashcard" ในหน้าเรียน)
- API ใหม่ `routes/flashcards.js` (`config/flashcards.js` = ชื่อหัวข้อไทย/อังกฤษ)
  - `GET /api/flashcards/options` ระดับ + หัวข้อที่มี ≥ 6 คำ (แคช 10 นาที)
  - `GET /api/flashcards/deck?level=&topic=&count=20|40|60&order=core|shuffle&seed=` (จำกัด 60 ใบ · 30 ครั้ง/นาที/ผู้ใช้)
  - ตัวกรองเดียวกับหน้าค้นหาคำศัพท์ (ไม่รวมคำเสริม · C2 เฉพาะที่ผ่านการตรวจอัตโนมัติ) **และตัดคำที่คำแปลถูก flag รอตรวจ / แหล่งที่มารอตรวจ ออก**
- หน้าเว็บ `public/js/flashcards.js` + `public/css/flashcards.css` — สร้างไฟล์ในเบราว์เซอร์ทั้งหมด (Canvas → JPEG/PNG · ตัวเขียน PDF 1.4 และ ZIP เขียนเอง ไม่มีไลบรารีภายนอก)
  - PDF A4: การ์ด 95×65 มม. · **พิมพ์สองหน้า** 8 ใบ/แผ่น (ด้านหลังสลับคอลัมน์ให้ตรงเมื่อพลิกขอบยาว) หรือ **หน้าเดียวแล้วพับ** 4 ใบ/แผ่น · เครื่องหมายตัด/เส้นพับ · สไตล์ "สีสัน" หรือ "ประหยัดหมึก"
  - รูปมือถือ: PNG 1080×1350 ต่อด้าน (`01-word-1-front.png`, `01-word-2-back.png`) รวมเป็น ZIP · มือถือที่รองรับ Web Share มีปุ่ม "บันทึกลงคลังรูป"
  - ภาษาไทยตัดบรรทัดด้วย `Intl.Segmenter` · ไฮไลต์คำศัพท์ในประโยคตัวอย่าง · ย่อตัวอักษรอัตโนมัติให้พอดีการ์ด
  - ขนาดไฟล์ที่วัดจริง: 20 ใบ PDF สองหน้า ≈ 1.2 MB · พับ ≈ 1.6 MB · ZIP รูปมือถือ ≈ 3.8 MB
- ไอคอนใหม่ใน sprite: download, printer, smartphone, images, hand (`scripts/build-icons.js`)

### Event Carousel (หน้าแรก) — กิจกรรมจริงจากฐานข้อมูล
- **ไม่สร้างระบบกิจกรรมซ้ำ:** ขยายตาราง `events` เดิม (migration `072_event_carousel.sql`: source, title_th, description, event_type, banner_desktop/mobile, priority, is_featured, visibility, route, reward, eligibility, created_by, created_at)
- แหล่งข้อมูล (`services/eventCarousel.js`):
  1. กิจกรรมใน `config/events.js` (ผจญภัย/เทศกาล) — วันที่ ภารกิจ รางวัล และการรับรางวัลใช้ระบบเดิม (ปุ่มพาไปหน้า event / festival)
  2. Ranked Season ที่เปิดอยู่ (`ranked_seasons`) · 3. ภารกิจประจำวัน (เป้าหมายรายวัน + Coin DAILY_GOAL เดิม)
  4. กิจกรรมที่ผู้ดูแลสร้าง — เงื่อนไขนับจากข้อมูลจริงในช่วงกิจกรรม (ตอบถูก / แข่ง Ranked จบ / ทำเป้าหมายรายวัน) · รางวัล Coin ≤ 500 · EXP ≤ 500 · ของ ≤ 3 ชิ้น
- สถานะ upcoming / ongoing / completed / expired จากเวลาเซิร์ฟเวอร์ (วันที่แสดงเป็นเวลาไทย) · expired และ retired ไม่แสดง · Halloween 2026 ไม่แสดงแล้ว
- ลำดับ: Featured → กำลังจัด → เร็ว ๆ นี้ → ภารกิจประจำวัน (ในกลุ่มเรียงตาม priority มาก→น้อย แล้ววันเริ่ม) — คงที่ ไม่สุ่ม
- รับรางวัล `POST /api/lobby/events/:id/claim` — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ · ครั้งเดียวต่อคน (`event_reward_claims` PK) · Coin (`coin_transactions` key `evr:<id>`) / EXP (`exp_log`) / ของ (`user_inventory`) ใน transaction เดียว · มีคนรับแล้วแก้รางวัล/เงื่อนไขไม่ได้
- ผู้ดูแล: หน้า "ผู้ดูแล → แบนเนอร์กิจกรรม" (`/api/admin/event-carousel`, requireAdmin) สร้าง/แก้/อัปโหลดแบนเนอร์ (PNG/WebP ≤ 700KB ตรวจ signature)/priority/Featured/วันที่/รางวัล/ปลายทาง/เผยแพร่-ซ่อน · ไม่มีการลบ (ใช้ซ่อน)
- ภาพแบนเนอร์ 15 ชุด `public/assets/events/banners/<art>-{640,1280}.webp` (12–58KB) สร้างด้วย `scripts/event-banners/render.js` — ตัวละคร 3D ของ EnglishQuest + ฉากแสงแฟนตาซีวาดเอง + สัญลักษณ์การเรียน/รางวัล (ไม่มีข้อความสำคัญในภาพ)
- หน้าเว็บ `public/js/eventcarousel.js` + `css/eventcarousel.css`: ก่อนหน้า/ถัดไป · จุด · ปัด · คีย์บอร์ด · เลื่อนเอง 6 วิ (หยุดเมื่อชี้เมาส์/โฟกัส/แตะ/สลับแท็บ/กดหยุด/ลดการเคลื่อนไหว) · โหลดภาพเฉพาะสไลด์ปัจจุบัน ± 1 · ภาพเสีย → ภาพสำรอง → พื้นสี · ไม่มีกิจกรรม → Empty State
- `routes/lobby.js`: `/api/lobby` มี `carousel` · `GET /api/lobby/events`

### แชทโลกบน Game Lobby (ต่อยอดแชทโลก v1.15 — ไม่สร้างระบบแชทใหม่)
- Migration `073_global_chat_lobby.sql`: `user_world_settings` + chat_mini / chat_sound / chat_notify / chat_quick_only · `world_chat_messages` + client_id (unique ต่อคน) / quick_id
- Mini Chat (`#gcm`): จอกว้างอยู่ใต้เควสต์ (3–5 ข้อความ) · มือถือ/แท็บเล็ตเป็นแถบเหนือเมนูล่าง (1–2 ข้อความ) · สถานะเชื่อมต่อ · จำนวนข้อความใหม่ (ไม่นับของตัวเอง) · ซ่อนได้ (เหลือปุ่ม "แชท (n)")
- Full Chat: Drawer ขวา (≥ 1024px) / Bottom Sheet เต็มจอ (มือถือ · ปรับตาม visualViewport เมื่อคีย์บอร์ดเปิด) · ตั้งค่า · Quick Chat · รายชื่อที่บล็อก · เมนูข้อความ (โปรไฟล์/เพิ่มเพื่อน/ปิดเสียง/บล็อก/รายงาน/ลบ) · "ข้อความใหม่" เมื่ออ่านข้อความเก่าอยู่
- Quick Chat ใช้ `POST /api/world-chat { quick }` เดียวกับข้อความพิมพ์ (`config/quickChat.js`) · ตั้ง "Quick Chat เท่านั้น" ได้เอง · ผู้ดูแลจำกัดการพิมพ์ (restriction kind `text`) = ส่งได้เฉพาะ Quick Chat · kind `chat` = ส่งไม่ได้
- เชื่อมต่อใหม่: `GET /api/world-chat?after=<id>` ดึงเฉพาะข้อความที่พลาด · `cid` กันส่งซ้ำ (ส่งซ้ำได้ข้อความเดิม)
- หลายเครื่องเซิร์ฟเวอร์: ส่งต่อผ่าน PostgreSQL `LISTEN/NOTIFY` ช่อง `eq_gchat` (`worldChat.initBus()` ใน server.js · ใช้การเชื่อมต่อฐานข้อมูลค้าง 1 ช่อง) — ข้อความอยู่ในฐานข้อมูลเสมอ
- แชทแสดงเฉพาะหน้าแรก · ออกจากหน้าแรกแผงแชทปิดเอง · ลิงก์เดิม `#/world-chat` → หน้าแรก + เปิดแผงแชท
- **เอาการ์ดแชทโลกในหน้าเล่นออก** และไม่มีหน้า `screen-gchat` แยกแล้ว

## ขั้นตอน
1. สำรองฐานข้อมูล → deploy โค้ด → รีสตาร์ต (migration 072, 073 รันอัตโนมัติตอนเริ่ม · เพิ่มคอลัมน์อย่างเดียว)
   - ถ้าใช้ connection pooler แบบ transaction (เช่น PgBouncer transaction mode) `LISTEN` จะไม่ทำงาน — แชทยังส่งในเครื่องเดียวกันได้ปกติ แต่ข้ามเครื่องต้องต่อฐานข้อมูลตรง
2. Service Worker เปลี่ยน BUILD hash อัตโนมัติ (มี `flashcards.js/.css` ในรายการ precache)

## ตรวจหลัง deploy
- [ ] `/api/health` = `1.17.0`
- [ ] หน้าเรียน → Flashcard → A1 · อาหาร → ดาวน์โหลด PDF → เปิดดูใน Adobe/Chrome ภาษาไทยถูกต้อง · พิมพ์ทดลอง 1 แผ่นสองหน้าดูว่าหน้า-หลังตรงกัน
- [ ] บน iPhone/Android: "รูปสำหรับมือถือ (ZIP)" โหลดได้ · ปุ่ม "บันทึกลงคลังรูป" (ถ้ามี) เปิด Share sheet
- [ ] หน้าแรก: แบนเนอร์กิจกรรมแสดงกิจกรรมจริง (ตะลุยด่านลอยกระทง · เทศกาลลอยกระทง (เร็ว ๆ นี้) · Ranked Season · ภารกิจประจำวัน) ปุ่มพาไปถูกหน้า
- [ ] ผู้ดูแล → แบนเนอร์กิจกรรม: เปลี่ยน priority แล้วลำดับบนหน้าแรกเปลี่ยน
- [ ] เปิดสองเครื่อง: พิมพ์แชทโลกเครื่องหนึ่ง อีกเครื่องเห็นในแชทย่อทันที · หน้าเล่นไม่มีการ์ดแชทโลก

## ย้อนกลับ
- deploy v1.16.0 กลับได้ (คอลัมน์ใหม่จาก 072/073 ไม่กระทบโค้ดเดิม) · ถ้าต้องการถอดคอลัมน์ใช้ `migrations/072_event_carousel_down.sql` / `073_global_chat_lobby_down.sql` (ดูหมายเหตุในไฟล์ก่อน)
