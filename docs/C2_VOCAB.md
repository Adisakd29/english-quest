# คำศัพท์ระดับ C2 — coverage-driven C2 vocabulary bank

> สถานะ: **Pilot Dataset 244 ความหมาย** (v1.6.0) — คลังนี้ "ขยายได้ตามความครอบคลุม" ไม่ได้อ้างว่าครบทุกคำในภาษาอังกฤษ

C2 ในระบบนี้คือ **ความแม่นยำของคำ ความหมายแฝง ระดับภาษา และการใช้จริง** ไม่ใช่คำหายาก
ผู้เรียนต้องตอบได้ว่า: ใช้ที่นี่หมายถึงอะไร · ทำไมคำนี้ไม่ใช่อีกคำ · สื่อนัยอะไร · ทางการแค่ไหน · ใช้คู่กับคำไหน · คำคุ้นเคยมีความหมายอื่นอะไร

## 1. สถาปัตยกรรม (ต่อยอดของเดิม — ไม่มี engine ที่สอง)

| ส่วน | ใช้ของเดิม | เพิ่มสำหรับ C2 |
|---|---|---|
| ข้อมูลคำ | `vocab_entries` / `vocab_senses` | แถว `cefr='C2'`, `source_list='C2_BANK'`, `public_id` `C2-S0001…` + คอลัมน์ `kind, register, connotation, tier, real_world_priority, frequency_band, variant, verification_status, verification_issues, base_sense_id, display_form, c2_key, c2 (JSONB)` |
| คลังในหน่วยความจำ | `utils/wordStore.js` | `VALID_LEVELS` มี C2 · โหลดเฉพาะ `autoChecked`/`reviewed` · ทุก sense ของ C2 ฝึกได้ (รวม idiom/phrasal) |
| Learning Path / ปลดล็อก | `utils/curriculum.js`, `routes/path.js` (`computePathState` เดิม) | หัวข้อ C2 ตามชนิดหน่วยคำ (words → senses → collocations → phrasal → idioms → expressions → extended) · Unit ละ 12 |
| ความคืบหน้า / SRS | `word_progress` + `utils/srs.js` | word_id = public_id ของ sense (mastery ต่อ sense) |
| คำตอบ / จุดอ่อน | `answer_events` | คอลัมน์ `facet` (meaning · sense · collocation · precision · register · connotation · phrase · form · usage) |
| EXP | `utils/exp.js` (`grantOnce`) | คีย์ `c2q:` `c2s:` `c2c:` `c2p:` `c2x:` `c2xp:` · ไม่มีเพดานรายวัน |
| Unit Test / Boss | `routes/assessments.js` | ใช้กับ C2 ได้ทันที (`LEVELS` มี C2) |
| ค้นหา | `routes/vocab.js` | ค้นด้วยวลี · ความหมายไทยเต็ม · collocation · synonym · กรอง `kind/tier/register/topic` |
| Ranked | `services/ranked/*` | ระดับ C2 เมื่อ placement = C1 และรู้ C2 ≥ `C2_RANKED_MIN_KNOWN` (30) · ใช้เฉพาะ Core |

ไฟล์ใหม่
- `data/vocab-c2/SCHEMA.md`, `batch-*.json` — ต้นฉบับ (เขียนเอง)
- `scripts/c2/validate.js` — validator · `scripts/c2/import.js` — นำเข้า (idempotent)
- `migrations/041_c2_vocab.sql` (+`_down`), `migrations/042_c2_vocab_seed.js`
- `services/vocab/c2Store.js` · `c2Items.js` (สร้าง/ตรวจโจทย์) · `c2Lesson.js` (บทเรียน 12 ขั้น) · `c2Practice.js` (Challenge / Context / Daily) · `c2Progress.js`
- `routes/c2.js` (`/api/c2`) · `routes/adminC2.js` (`/api/admin/c2`)
- `public/js/c2.js`, `public/css/c2.css` · ตรา C2 ใน `assets/badges/badges.svg`

## 2. ข้อมูล

แต่ละรายการ = **หนึ่งความหมาย (sense)** ของหนึ่งคำ/วลี · CEFR กำหนดต่อ sense (address = A1 n. "ที่อยู่" แต่ C2 v. "จัดการแก้ไขปัญหา")
ช่องข้อมูลครบตาม `SCHEMA.md` — meaningEN/TH, shortMeaningTH, usageNoteTH, register, connotation, realWorldPriority, tier, IPA UK/US, variant, example(+TH), collocations, synonyms, nearSynonyms(+ความต่าง), antonyms, wordFamily, commonMistakes, confusedWith, topics, context (Guess-from-Context), literal/natural/unnatural (idiom), separable (phrasal), คำถาม collocation/nearSyn/formation/register, sourceType/sourceReference, verificationStatus

### แหล่งข้อมูลและสิทธิ์
- เนื้อหาทั้งหมด **เขียนขึ้นใหม่** (`sourceType: editorial`) โดยอ้างอิง CEFR descriptors และความรู้ทั่วไปเรื่องการใช้ภาษา — **ไม่ได้ scrape หรือคัดลอกพจนานุกรมที่มีลิขสิทธิ์**
- ใช้รายการ Oxford 3000/5000 (ที่มีอยู่แล้วในระบบ) เพียงเพื่อ **ตรวจซ้ำ** ว่าคำ/ความหมายไม่อยู่ใน A1–C1 แล้ว
- เนื้อหาเขียนโดย AI → ถือว่า `translation_source = AI_GENERATED` และยัง **ไม่ใช่ reviewed** จนกว่าคนตรวจในหน้า C2 Content Audit

### Core / Extended และ "real-world" first
- `realWorldPriority` 5–3 = **Core** (ข่าว งาน มหาวิทยาลัย บทสนทนา) · 2–1 หรือแท็ก rare/literary/archaic/specialist = **Extended**
- validator บังคับ: core ห้าม priority ≤ 2 และห้ามมีแท็กหายาก · Extended เรียนหลังสุด และไม่ออกใน Ranked

### Dedupe กับ A1–C1
- คำที่มีอยู่แล้ว + **pos เดียวกัน** → validator ไม่ยอมให้นำเข้าเป็น "คำใหม่" (เช่น `mandate` n. มีใน C1 แล้ว → เปลี่ยนเป็นความหมายกริยา "กำหนดเป็นข้อบังคับ")
- ความหมายขั้นสูงของคำคุ้นเคย (`kind: sense`) → ผูกใต้ `vocab_entries` เดิม + `base_sense_id` ชี้ sense พื้นฐาน (เช่น `C2-S0014 → A1-S0013`) — progress ของความหมายพื้นฐานไม่ปนกับ C2

## 3. Validator (`npm run c2:validate`)
ตรวจต่อรายการ: ช่องที่ต้องมี · enum (pos/kind/register/connotation/tier/variant/topic) · tier ↔ priority ↔ แท็ก · kind ↔ pos · idiom ต้องมี literal/natural/unnatural · phrasal ต้องมี separable ·
ภาษาไทย (U+FFFD, control/zero-width, สระ/วรรณยุกต์ลอย, วรรณยุกต์ซ้อน, shortMeaningTH ≤ 30) · ประโยคอังกฤษ (ตัวพิมพ์ใหญ่ เครื่องหมายจบ คำซ้ำ อักขระแปลก ช่องว่าง `___` 1 ช่อง) ·
context มี `[[เป้าหมาย]]` 1 จุด · collocations ≥ 2 ไม่ซ้ำ · คำถาม: ตัวลวง 3 ตัว · ตัวเลือกซ้ำ · คำตอบอยู่ในตัวลวง · **ตัวลวงเป็น synonym ของเป้าหมาย (อาจถูกหลายข้อ)** · ไม่มีคำอธิบาย (whyTH/whyNotTH) · formation: คำตอบอยู่ในตัวเลือก + accepted · ตัวเลือกอื่นถูก accept ด้วย ·
ทั้งชุด: key ซ้ำ · ความหมายซ้ำ · คำถามซ้ำ · ซ้ำกับ A1–C1 (`--db`)
ผล: ไม่มี error → `autoChecked` · มี error → `unverified` (**ไม่ถูกใช้ในบทเรียน/แบบฝึก/ค้นหา**) · `reviewed` ตั้งได้จากหน้า Admin เท่านั้นและต้องไม่มี error
ขณะรันจริงยังมีชั้นป้องกันที่สอง: ข้อ "เดาความหมาย" ที่ใช้ตัวลวงจากคลัง จะกรอง sense ที่เป็น synonym/near-synonym/สับสนง่าย และความหมายไทยที่คล้ายกัน (bigram ≥ 50%) ออก

## 4. ชนิดแบบฝึก (services/vocab/c2Items.js)
meaning (ในประโยค) · reverse (ความหมาย→คำ) · **context (Guess from Context)** · colloc · nearsyn (Precision) · register · connot · idiom (สถานการณ์ที่ใช้เป็นธรรมชาติ/ตามตัวอักษร) · form (เลือก) · formtype (พิมพ์ — รับคำตอบหลายแบบ) · mistake (ประโยคไหนถูก)
- โจทย์สร้างแบบ deterministic จาก (sense, ชนิด, seed) → ไม่ส่งเฉลยไปหน้าเว็บ ตรวจที่เซิร์ฟเวอร์
- feedback: เฉลย · ทำไมตัวเลือกที่เลือกผิด · คำอธิบาย/เบาะแส (ภาษาไทย)

### บทเรียน 12 ขั้น
New Words → Meanings → In Context → **Quick Check** → Collocations → **Practice** → Synonym Nuance → **Practice** → Idioms & Phrases → **Context Challenge** → Review (ถูก/ผิด) → **Mastery Check**
ผ่าน ≥ 80% · ตอบผิดในรอบ → sense นั้นยังไม่ "known" และเข้าคิวทบทวน · เรียนต่อได้ทุกเครื่อง (`vocab_lessons`)

### โหมดฝึก
`C2 Vocabulary Challenge` (ผสม) · `Guess from Context` · `Daily C2` (ชุดเดียวทั้งวัน) — เลือกข้อ: ถึงกำหนด SRS → จุดอ่อน 30 วัน → ใหม่ (Core, priority สูงก่อน)

### EXP (บัญชีเดียว · ไม่มีเพดานรายวัน · กันปั๊มด้วยคีย์ครั้งเดียว)
บทเรียน: จบขั้น +5 · ตอบถูกครั้งแรกของข้อ +12 · จบบท +40 · Perfect +20 · Challenge: ถูกครั้งแรกของข้อในวันนั้น +8 · รอบ perfect +15/วัน/โหมด

## 5. ปลดล็อก
กฎเดิมของ Learning Path: ผ่าน 60% ของ Unit ใน C1 หรือเคลียร์ Boss C1 · **placement**: ได้ C1 ทั้งภาพรวม/คำศัพท์ และตอบคำศัพท์ C1 ถูกทุกข้อ → เปิด C2 · โหมดสำรวจเปิดเรียนได้ก่อนแต่ Unit Test/Boss ยังต้องตามลำดับ

## 6. Admin — C2 Content Audit (หน้าผู้ดูแล)
กรอง: มี error / คำเตือน / อาจกำกวม / ซ้ำ / ตัวอย่าง-บริบท / ภาษาไทย / ไม่มีความหมายไทย / collocation ไม่ครบ / metadata · สถานะ · ชนิด · tier · ค้นหา · แบ่งหน้า
แก้ไข → ตรวจซ้ำด้วย validator → ตั้ง `reviewed` (ต้องไม่มี error) หรือ `unverified` (ถอดออกทันที) · บันทึกประวัติใน `content_edits`
`GET /api/admin/c2/metrics`: จำนวนตามสถานะ/ชนิด/tier/register · ข้อที่ผู้เรียนตอบผิดบ่อย (อาจกำกวม) · จำนวนผู้เรียน

## 7. Performance
- ข้อมูล C2 อยู่ในหน่วยความจำเซิร์ฟเวอร์ (โหลดครั้งเดียว ~ไม่กี่ร้อยแถว) · หน้าเว็บโหลดทีละขั้น/ทีละหน้า ไม่โหลดคลังทั้งหมด
- ค้นหา/Audit กรองและแบ่งหน้าฝั่งเซิร์ฟเวอร์ (30/หน้า)
- ดัชนีที่เพิ่ม (ตาม query จริง): `uq_vocab_senses_c2_key` (import) · `idx_vocab_senses_c2_pool (tier, priority) WHERE cefr='C2'` · `idx_vocab_senses_verification` · `idx_answer_events_facet` · `idx_vlessons_recent` · `idx_c2_sessions_user`
- ไม่เพิ่ม index ให้ lemma/topic/difficulty เพราะ query ใช้ `normalized` (มีดัชนีเดิม) และคลังเล็ก — ทบทวนอีกครั้งเมื่อคลังเกินหลักพัน

## 8. ขยายคลัง
1. เขียน `data/vocab-c2/batch-N.json` ตาม `SCHEMA.md` (`verificationStatus: "unverified"`)
2. `DATABASE_URL=... npm run c2:validate -- --db` แก้จน error = 0
3. `DATABASE_URL=... npm run c2:import` (idempotent · public_id เดิมไม่เปลี่ยน · แถว reviewed ไม่ถูกทับ)
4. ตรวจในหน้า C2 Content Audit แล้วตั้ง reviewed
ข้อควรระวัง: public_id รูปแบบ `C2-S####` รองรับ 9,999 รายการ — ถ้าจะเกิน ต้องปรับ regex ใน `server.js` (`migrateLeftoverProgress`) ที่ถือว่า ID ที่ไม่ใช่ `-S[0-9]{4}$` เป็น ID เก่า

## 9. ยังไม่ได้ทำ
- คนตรวจทานเนื้อหา (ทั้งหมดยังเป็น autoChecked ไม่ใช่ reviewed) · เสียงอ่านจริง (ใช้ TTS ของเครื่อง)
- โหมดฟัง (Listening) ของ C2 · C2 ในกิจกรรม Event · C2 ใน Placement Test (ยังสูงสุด C1 แล้วใช้เกณฑ์ C1 เต็มแทน)
- ตรวจ "ประโยคไม่เป็นธรรมชาติ" และ "collocation ผิด" ด้วยคลังข้อความจริง (corpus) — ตอนนี้ validator ใช้กฎเชิงรูปแบบ + ตัวลวงต้องมีเหตุผลกำกับ
