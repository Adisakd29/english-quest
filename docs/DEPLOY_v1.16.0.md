# คู่มือขึ้น production — v1.15.1 → v1.16.0 (นำ EnglishQuest World ออก + หน้าแรกแบบ Game Lobby)

**ประเภท:** เวอร์ชันรอง (ลบฟีเจอร์ใหญ่ + หน้าแรกใหม่) · **ไม่มี migration · ไม่ DROP ตาราง · ไม่แก้ข้อมูลผู้ใช้**
**คำขอ (6 พ.ย. 2569):** "Remove EnglishQuest World & Revise Game Lobby Design" · ตัวเลือกของเจ้าของ: "เก็บแชทโลกไว้ (แนะนำ)"

## สิ่งที่เปลี่ยน
### นำออก (EnglishQuest World)
- เซิร์ฟเวอร์: `routes/world.js` · `services/world/{index,map,settings,moderation}.js` · `config/world.js` · ห้อง Friendly ที่สร้างจาก World (`rooms.createFriendlyRoom`) · static `/assets/world`
- หน้าเว็บ: `public/js/world.js` · `public/js/world-physics.js` · `public/css/world.css` · `public/assets/world/` (แผนที่ GLB 1.7 MB) · หน้า `screen-world` · การ์ด World ในหน้าเล่น · ปุ่ม Event Plaza ในหน้าเทศกาล · ตัวจัดการ WebSocket `world:*` · `EQAvatar3D.createCharacter` (ใช้เฉพาะฉาก World)
- three.js bundle (`public/vendor/eq-three.min.js`) build ใหม่โดยตัดคลาสที่แผนที่ใช้ (Fog/AmbientLight/Ring/Sphere/Box3 …) — Avatar Viewer ยังใช้ครบ
- ทดสอบ: `test/world.test.js` · `test/e2e/world_e2e.py` · `test/load/world_load.js`
- API เดิม `/api/world/*` และ `/api/admin/world/*` → **410** `{ code: 'WORLD_REMOVED' }` (แอปเวอร์ชันเก่าที่ยังเปิดค้างได้ข้อความชัดเจน)
- ลิงก์เดิม `#/world` → พากลับหน้าหลัก + แจ้ง "EnglishQuest World ปิดให้บริการแล้ว …" (แทนที่ hash เป็น `#/home`)

### คงไว้ (ตรวจ dependency แล้ว)
- WebSocket `/ws` · presence · แชทเพื่อน · Ranked (จับคู่/ทีม/คำชวนทีม `teams.invite`) · ห้องแข่ง — ไม่ได้ใช้โค้ด World
- **แชทโลก** (v1.15) — ตัวกรอง/ปิดเสียงอัตโนมัติ/รายงานย้ายจาก `services/world/moderation.js` ไป `services/moderation/chat.js` (โค้ดเดียวกัน ค่าตั้งเดิม 30 วัน / 3 ครั้ง / 10 นาที)
- การกลั่นกรองสำหรับผู้ดูแล: `/api/admin/moderation/{reports,chat,restrictions,restrict,restrictions/:id/review}` · ผู้ใช้: `/api/moderation/me/restrictions`, `/api/moderation/restrictions/:id/appeal`
- งานลบบันทึกแชทเก่า 30 วันยังทำงาน (server.js เรียก `chatMod.purge()` ตอนเริ่มและทุก 24 ชม.)
- **ตารางที่ไม่ได้ลบ (มีข้อมูล):** `world_restrictions`, `world_chat_log`, `world_mutes`, `user_world_settings`, `world_chat_messages`, `user_reports` (source='world') และตาราง World อื่นจาก migration 052 — เก็บไว้เพื่อหลักฐานการกลั่นกรอง/ย้อนกลับ ถ้าจะลบในอนาคตต้องทำ migration แยกพร้อมสำรองข้อมูล

### เพิ่ม (Game Lobby หน้าแรก)
- `GET /api/lobby` (`routes/lobby.js`): Level/EXP จาก `users.exp` · Coin จาก `coin_wallets` (อ่านอย่างเดียว) · แรงค์ทั้ง 2 โหมด + ไฟล์ตรา · เควสต์ประจำวัน 3 ข้อจากกิจกรรมจริงวันนี้ (ตอบ 20 ข้อ / Grammar 5 ข้อ / Ranked 1 เกม — **ไม่มีรางวัล** แสดงเป็นเป้าหมายเท่านั้น) · กิจกรรม active/upcoming · เพื่อนออนไลน์ · แชทโลก 3 ข้อความล่าสุด (กรองคนที่บล็อก/ปิดเสียงเหมือนหน้าแชท)
- `public/js/lobby.js` + `public/css/lobby.css` + `EQAvatar.lobbyStage()` — ตัวละคร 3D ชุดที่สวมจริง ท่า Idle ลากหมุนได้ (ไม่มีการเดิน/ตำแหน่ง) · ปุ่ม "เปลี่ยนชุด" (ตู้เสื้อผ้า) / "แต่งตัวละคร" · ฉากหลังเป็น CSS ล้วน (ไม่โหลดรูปเพิ่ม)
- แผงซ้าย: เควสต์ + กิจกรรม (แบนเนอร์เดิมของ event.js/festival.js ย้ายมาอยู่ในแผงนี้) · แผงขวา: เรียนต่อ (ปุ่มเดิม) · Ranked Battle · Avatar Shop · เพื่อน · แถบล่าง: แชทโลก (ตัวเลขข้อความใหม่)
- การ์ดเดิมของหน้าแรก (เป้าหมายวันนี้ / ทักษะ / ความแม่นยำ …) ยังอยู่ใต้ Lobby
- แถบเมนูล่างกลับเป็น 6 ปุ่ม: หน้าหลัก · เรียน · แกรมม่า · แรงค์ · เล่น · โปรไฟล์ · หน้าเรียนมีปุ่ม Grammar เพิ่ม (คู่กับ ค้นหาคำศัพท์ / TOEIC / Vocabulary Quiz A–Z)
- จอ: 390 = คอลัมน์เดียว (ตัวละคร → เรียนต่อ/แข่ง → เควสต์/กิจกรรม → แชท) · 820 = ตัวละครเต็มแถว + 2 คอลัมน์ · ≥1100 = ซ้าย | ตัวละคร | ขวา

## ขั้นตอน
1. สำรองฐานข้อมูล (ตามปกติ) — แม้ไม่มี migration
2. deploy โค้ด → รีสตาร์ต (ไม่ต้องรัน migrate เพิ่ม · ตัว migrate ที่รันตอนเริ่มจะไม่พบไฟล์ใหม่)
3. Service Worker เปลี่ยน BUILD hash อัตโนมัติ → ผู้ใช้ได้ไฟล์ใหม่ · แคช GLB แผนที่เก่าในตู้ `eq-avatar3d` จะถูกดันออกตามขีดจำกัดเอง

## ตรวจหลัง deploy
- [ ] `/api/health` = `1.16.0` · `GET /api/world/config` = 410
- [ ] เข้าแอป → หน้าแรกเห็นตัวละคร 3D ในชุดของตัวเอง ลากหมุนได้ · Coin/เลเวล/แรงค์ตรงกับก่อนอัปเดต
- [ ] แถบเมนูล่าง 6 ปุ่ม · ไม่มีคำว่า EnglishQuest World ในเมนู/หน้าเล่น/หน้าเทศกาล
- [ ] เปิด `https://<โดเมน>/#/world` → กลับหน้าหลัก + ข้อความแจ้ง
- [ ] Ranked จับคู่ได้ · แชทโลกส่ง/รับได้ · ผู้ดูแลเปิด `/api/admin/moderation/reports` ได้

## ย้อนกลับ
- deploy v1.15.1 กลับได้ทันที (ไม่มีการเปลี่ยน schema/ข้อมูล · ตาราง World ยังอยู่ครบ)

## ผลทดสอบก่อนปล่อย
- `node --test` ทั้งชุด (concurrency 1): ดูรายงานส่งมอบ
- `test/lobby.test.js` (ใหม่ 8 ข้อ) · `test/e2e/lobby_e2e.py` 390/820/1280 · `test/e2e/worldchat_e2e.py` (ปรับตามแถบเมนู 6 ปุ่ม)
