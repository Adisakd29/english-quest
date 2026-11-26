# Deploy v1.26.0 — Game UI · Global Snow · Snow-Covered Nav · เควสต์มีรางวัลจริง

ต่อจาก v1.25.3 (ต้อง deploy v1.25.3 ก่อน หรือ deploy v1.26.0 ทับได้เลย เพราะรวมงานของ v1.25.3 ไว้แล้ว)

## สรุปการเปลี่ยนแปลง
### หน้าเว็บ
- `public/js/snow-fx.js`: หิมะตกทุกธีม
  - ตั้งค่าในเครื่อง `eq_snow` (on/off) และ `eq_snow_density` (low/medium/high)
  - หน้าแบบฝึกใช้ระดับ low
  - ตั้งค่า `data-snow` และ `data-snow-tone` บน `<html>`
- `public/css/snow-caps.css` + `public/img/snow/*.svg`: สันหิมะเกาะแถบบน เมนูล่าง แถบข้าง โลโก้ และแผง (ทุกธีม)
  - ภาพสร้างด้วย `scripts/snowcaps/build_snowcaps.py` และ `build_decor.py`
- `public/css/game-ui.css`:
  - design tokens และ z-index กลาง
  - คอมโพเนนต์เกม
  - Hero Scene (ใช้ภาพ `public/img/hero/*.webp` จาก Blender)
  - QuestCard
  - แชทย่อบนมือถือเป็นการ์ดในหน้า
  - กล่องยืนยันอีเมล
- `public/js/lobby.js`: QuestCard, แท็บ รายวัน/คริสต์มาส, ปุ่มรับรางวัล, แอนิเมชันรางวัล
- `public/js/audio.js`: ปุ่มเพลงคริสต์มาสฝังในแถบบนเมื่อจอ < 1024px
- `public/js/christmas.js`: การ์ดคริสต์มาสอยู่บนสุดคอลัมน์เควสต์ทุกขนาดจอ และไม่แสดงจำนวนเควสต์ซ้ำ
- `public/index.html`: การ์ดตั้งค่า "หิมะตก" (โปรไฟล์ → ตั้งค่า), Hero layers, แท็บเควสต์

### เซิร์ฟเวอร์
- `POST /api/lobby/quests/:id/claim` (`routes/lobby.js`)
  - ตรวจความคืบหน้าจริงฝั่งเซิร์ฟเวอร์
  - ได้ครั้งเดียวต่อเควสต์ต่อวัน (เวลาไทย) ผ่าน `exp_awards` key `dq:<วัน>:<id>` และ `coin_transactions` UNIQUE
  - จำกัด 20 ครั้ง/นาที
- `GET /api/lobby` → quests มี `state` (progress/ready/claimed), `reward`, `desc`
- `config/coinRewards.js` เพิ่ม `DAILY_QUEST` (5 Coin)
- รางวัลต่อวัน:
  - answers: +20 EXP (Coin มาจาก "เป้าหมายรายวัน" เดิม จึงไม่จ่ายซ้ำ)
  - grammar: +15 EXP +5 Coin
  - ranked: +15 EXP +5 Coin

## Migration
ไม่มี เพราะใช้ตารางเดิม `exp_awards` / `coin_transactions` / `exp_log` และ `coin_transactions.type` เป็น VARCHAR ไม่มี CHECK

## ขั้นตอน
1. Deploy ตามปกติ
2. ตรวจหลัง deploy:
   - หน้าแรกเห็นหิมะตก (ทุกธีม) และสันหิมะที่แถบบน/เมนูล่าง
   - โปรไฟล์ → ตั้งค่า → การ์ด "หิมะตก" ปิดแล้วหิมะหายทันที
   - ทำเควสต์ Grammar 5 ข้อ → หน้าแรกขึ้น "รับรางวัล" → กดแล้ว EXP/Coin เพิ่ม → กดซ้ำได้ "รับไปแล้ว"
   - มือถือ: แชทโลกย่อเป็นการ์ดใต้เควสต์, ปุ่มเพลงคริสต์มาสอยู่ในแถบบน

## ย้อนกลับ (Rollback)
- Redeploy v1.25.3 ได้ทันที เพราะไม่มี migration
- ผลของการย้อนกลับ:
  - EXP/Coin ที่ผู้ใช้รับจากเควสต์ไปแล้วยังอยู่ (ไม่ลบข้อมูลผู้ใช้)
  - แถว `coin_transactions` type `DAILY_QUEST` ยังอยู่และแสดงในประวัติ Coin ตามปกติ
  - ค่า `eq_snow` / `eq_snow_density` ใน localStorage ถูกเพิกเฉย (v1.25.3 ใช้หิมะเฉพาะคริสต์มาส)
- หากต้องการปิดเฉพาะหิมะช่วงคริสต์มาสโดยไม่ deploy: ใช้หน้าแอดมิน Christmas → ปิด "หิมะตก"
  - ระหว่างใช้ธีมคริสต์มาส จะปิดทั้งหิมะและสันหิมะ

## ข้อจำกัดที่ทราบ
- เบราว์เซอร์ทุกตัวไม่อนุญาตให้เปิดเสียงก่อนผู้ใช้แตะหน้าจอครั้งแรก
  - เพลงคริสต์มาส "อัตโนมัติ" จึงเริ่มหลังการแตะครั้งแรกที่ใดก็ได้
- ยังไม่ได้ทดสอบบน iPhone/Android จริง (ทดสอบด้วย Chromium จำลองขนาดจอและ User-Agent)
