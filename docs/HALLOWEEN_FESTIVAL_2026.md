# Halloween Costume Festival 2026 (24–31 ต.ค. 2569 · Asia/Bangkok)

ต่อยอดระบบกิจกรรมเดิม (ไม่มีระบบ Event ใหม่ซ้ำซ้อน):
- config: `config/events.js` → `FESTIVAL` (kind `festival`) อยู่ใน `EVENTS` เดียวกับ Halloween Adventure · ตาราง `events` เดิม (sync อัตโนมัติ)
- API: `/api/events/:id` (สถานะ) · `POST /api/events/:id/login-claim` · `POST /api/events/:id/quests/:questId/claim`
  · ด่านเควสต์ใช้ endpoint ด่านเดิม `/api/events/:id/stages/:stageId/start` + `/attempts/:id/submit` (โจทย์/เฉลย/จับเวลาฝั่งเซิร์ฟเวอร์)
- service: `services/eventFestival.js` (ปฏิทิน + เควสต์) · `services/events.js` (ด่าน · เวลาเซิร์ฟเวอร์ `_setNow` สำหรับทดสอบ)
- หน้าเว็บ: `public/js/festival.js` + `public/css/festival.css` (route `#/festival` · แบนเนอร์หน้าแรก + เมนูเล่น) · ภาพ SVG จาก `public/js/hwart.js`
- migration: `051_event_festival.sql` (เพิ่มตาราง + ค่า acquisition_type เท่านั้น · ไม่แตะข้อมูลเดิม)

## Daily Login Reward
| วัน | รางวัล | item id |
|---|---|---|
| 1 | Pumpkin Hat | `hat_hw26_pumpkin` |
| 2 | Bat Wings | `back_hw26_batwings` |
| 3 | Ghost Hoodie | `top_hw26_ghost_hoodie` |
| 4 | Witch Hat | `hat_hw26_witch` |
| 5 | Halloween Boots | `shoes_hw26_boots` |
| 6 | Pumpkin Backpack | `back_hw26_pumpkin_pack` |
| 7 | Midnight Halloween Costume Set | `outer_hw26_midnight` + `bottom_hw26_midnight` + `acc_hw26_moon` |

- **วิธีบันทึก:** `event_login_claims (event_id, user_id, day_no, claim_date, items, claimed_at)` — `claim_date` = วันที่ตามเวลาไทยจาก**นาฬิกาเซิร์ฟเวอร์** (`Intl.DateTimeFormat` timeZone Asia/Bangkok) · หน้าเว็บส่งวัน/เวลามาเองไม่ได้ (ไม่มีพารามิเตอร์รับ)
- **นับวันที่รับสำเร็จ:** Day ถัดไป = จำนวนแถวที่รับแล้ว + 1 · ไม่ต้องต่อเนื่อง · ขาดได้ไม่รีเซ็ต (ช่วงกิจกรรม 8 วัน รางวัล 7 วัน)
- **กันรับซ้ำ (3 ชั้น):**
  1. ทรานแซกชันเดียว + `pg_advisory_xact_lock(hashtext(event:user))` — คำขอพร้อมกันของผู้เล่นคนเดียวกันเข้าคิว แล้วเห็นแถวที่เพิ่งบันทึก
  2. ตรวจ "วันนี้รับแล้ว" / "ครบ 7 วันแล้ว" ในทรานแซกชัน → 409 `ALREADY_CLAIMED_TODAY` / `ALL_CLAIMED`
  3. ฐานข้อมูล: `PRIMARY KEY (event_id, user_id, day_no)` + `UNIQUE (event_id, user_id, claim_date)` — ชนกันได้ 23505 → 409
- ตรวจครบตามสเปก: ล็อกอินแล้ว (JWT) · กิจกรรม active (403 `EVENT_NOT_STARTED`/`EVENT_ENDED`) · วันที่ · การรับก่อนหน้า · สิทธิ์ · ซ้ำ
- **เชื่อม Inventory:** `INSERT INTO user_inventory (..., acquisition_type) VALUES (..., 'event_login')` ในทรานแซกชันเดียวกับการบันทึกการรับ (สำเร็จทั้งคู่หรือไม่เกิดเลย) · Inventory เดิมตารางเดียวกับร้านค้า/Achievement · ของเป็นของถาวร ไม่ถูกลบหลังจบกิจกรรม

## Learning Event Quests
| เควสต์ | เงื่อนไข (ระดับตาม CEFR จากการวัดระดับ) | รางวัล |
|---|---|---|
| Halloween Vocabulary Quest | ผ่านด่าน `hv` (คำศัพท์ธีม 4 + แปล 3 + ไทย→อังกฤษ 3 · ถูก 7/10 · 5 นาที) | 40 Coins + Candy Corn Necklace |
| Halloween Grammar Challenge | ผ่านด่าน `hg` (แกรมม่า 6 + เติมคำ 2 · ถูก 6/8 · 5 นาที) | 40 Coins + Bat Glasses |
| Halloween Listening Mini Challenge | ตอบ TOEIC Listening Part 1 ถูก 6 ข้อในช่วงกิจกรรม | 40 Coins + พื้นหลังโปรไฟล์ Moonlit Pumpkin Patch |
| Festival Champion | ทำ 3 เควสต์ครบ | 60 Coins + ป้าย Achievement `halloween_festival_2026` |

- รับรางวัลเควสต์ครั้งเดียว: `event_quest_claims` PK (event, user, quest) + Coin key `evq:<event>:<quest>` (ระบบ Coin เดิมกันซ้ำ) · ของ = `acquisition_type 'event_quest'`
- เวลาเรียนรวมสำหรับรางวัลเควสต์ทั้งหมด ≈ 15–20 นาที (รางวัลหลักไม่ต้องเรียนนาน)

## ทดสอบ
- `test/event-festival.test.js` — 12 ขั้นตามสเปกข้อ 20 (ใช้นาฬิกาเซิร์ฟเวอร์จำลอง: วันถัดไป · ขาดวัน · หลังจบ) + กดพร้อมกัน 6 ครั้งได้ครั้งเดียว + เควสต์ + ความปลอดภัย
- `test/e2e/festival_e2e.py` — เบราว์เซอร์จริง: แบนเนอร์ → รับ Day 1 → หน้าต่างรางวัล + Preview 3D → สวมเลย → Avatar 3D ใส่หมวกจริง → ตู้เสื้อผ้า → Logout/Login → รับซ้ำไม่ได้ → เปิดด่านเควสต์ · 360–1280px
