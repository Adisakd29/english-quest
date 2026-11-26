# คู่มือขึ้น production — v1.13.0 → v1.14.0 (Word Atlas — คลังคำศัพท์ A–Z)

**ประเภท:** รุ่นรอง · **มี migration 1 ไฟล์ (สร้างตารางใหม่อย่างเดียว)** · ไม่ reset database · ไม่แตะ users / EXP / rank / coin / avatar / inventory / friends / leaderboard / ความคืบหน้า Oxford, Grammar, TOEIC
**คำขอ (4 พ.ย. 2569):** เมนู EnglishQuest Word Atlas (เอกสาร 30 ส่วน) · ปรับตามคำขอเพิ่ม: "เลือกหมวดหมู่แล้วเข้าไปหน้าทายความหมายโดยการเลือก 5 ตัวเลือกได้เลย"

## สิ่งที่เพิ่ม
- เมนู Word Atlas (ปุ่มใหญ่ในเส้นทางการเรียน · `#/atlas`) — ค้นหา EN/TH · A–Z · ระดับ CEFR · หัวข้อ · คำแนะนำ · คำประจำวัน · Unit · ทบทวนคำผิด · คำที่บันทึก
- **เลือกหมวด (ตัวอักษร / หัวข้อ / ระดับ / Unit) → เข้าทายความหมาย 5 ตัวเลือกทันที** (ไม่มีหน้าเนื้อหาก่อน) · 10 ข้อต่อชุด (Unit = 12) · คำที่ยังไม่เรียนขึ้นก่อน เรียงจากคำที่ใช้บ่อย
- หน้าคำ: ทุกความหมาย · คำแปลไทย · นิยาม · ตัวอย่าง · IPA + เสียง UK/US · synonym/antonym · collocation · word family · ที่มา/สัญญาอนุญาต · Save Word · Add to Review · Practice
- คลังเริ่มต้น `data/word-atlas/atlas-2026-11.jsonl.gz` (6.4 MB): 24,431 คำ · 79,069 ความหมาย · เรียน/ทำแบบฝึกได้ 8,731 ความหมาย (Oxford/C2 เดิม 6,738 + ใหม่ที่ผ่านการตรวจ 1,993) — รายละเอียด `docs/WORD_ATLAS_DATA.md`

## ความคืบหน้า / EXP
- ใช้ `word_progress` เดิม คีย์ = `progress_id` (= public_id ของ Oxford ถ้ามี) → เรียนคำเดียวกันผ่าน Oxford หรือ Word Atlas = แถวเดียวกัน ไม่นับซ้ำ · SRS/ทบทวนชุดเดียวกัน
- ตอบแต่ละข้อ = กติกาการ์ดคำศัพท์เดิม (`recordCardAnswer`: คำใหม่ 15 · ทวน 5 · ผิดครั้งแรก 3 · cooldown 20 ชม./ความหมาย · ไม่มีเพดานรายวันตั้งแต่ v1.13.0)
- จบ Unit ครั้งแรก +10 · ถูกทุกข้อ +5 (`atlas_reward_events` — uniqueEventId `unit:<id>:complete|perfect` ได้ครั้งเดียว · ตรวจที่เซิร์ฟเวอร์ว่าทำครบจริง)
- คำที่ไม่มีใน Oxford: แถว word_progress ระดับ `WA` · answer_events skill `atlas` (ไม่ปนสถิติ Oxford ตามระดับ)

## Migration
- `070_word_atlas.sql` — ตาราง `atlas_lemmas` `atlas_senses` `atlas_units` `atlas_unit_items` `atlas_unit_progress` `atlas_collection` `atlas_reward_events` `atlas_sessions` `atlas_meta` + index (prefix, trigram ภาษาไทย, GIN)
- `CREATE EXTENSION pg_trgm` อยู่ใน DO block — ถ้าโฮสต์ไม่อนุญาตจะข้าม (ค้นคำไทยยังใช้ได้ ช้าลง)
- นำเข้าคลังอัตโนมัติเบื้องหลังหลังเปิดเซิร์ฟเวอร์ (~12 วินาที · ไม่บล็อก · advisory lock กันหลายเครื่องนำเข้าพร้อมกัน · checksum เดิม = ข้าม) — ปิดได้ด้วย `WORD_ATLAS_SEED=off` แล้วรัน `node scripts/word-atlas/seed.js` เอง

## อื่น ๆ
- CSP: เพิ่ม `https://upload.wikimedia.org` ใน `media-src` (ไฟล์เสียงคนอ่านจริง) — ไม่มีไฟล์ = ใช้เสียงสังเคราะห์ในเครื่อง
- ไอคอนใหม่ 8 ตัว (sprite 149 ไอคอน) · sw precache `wordatlas.js/css`
- `THIRD_PARTY_NOTICES.md`: Wiktionary (CC BY-SA 4.0) · wordfreq · Wikimedia Commons

## ขั้นตอน
- [ ] backup DB → deploy → log ต้องมี `[word-atlas] นำเข้า atlas-2026-11: 24431 lemmas …` → `/api/health` = `1.14.0`
- [ ] เส้นทางการเรียน → Word Atlas → แตะตัวอักษร C → ทายความหมาย 5 ตัวเลือก → ตอบแล้ว EXP เพิ่ม
- [ ] ค้น "แมว" → cat · เปิดหน้าคำ → ฟังเสียง UK/US → Save Word
- [ ] คำที่เคยเรียนใน Oxford แสดงว่าเรียนแล้วใน Word Atlas
- [ ] ผู้ดูแล: `GET /api/word-atlas/admin/quality` → `learnableWithErrors: 0`, `brokenOxfordLinks: 0`

## ย้อนกลับ
deploy v1.13.0 ได้ทันที (ตารางใหม่ถูกเพิกเฉย · EXP/ความคืบหน้าที่ได้ไปแล้วยังอยู่ใน users/word_progress) · ลบตาราง: `migrations/070_word_atlas_down.sql` (ไม่แตะ word_progress)
