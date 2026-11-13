# TOEIC-style Practice — Listening Part 1: Photographs (v1.7.0)

สื่อฝึกอิสระของ EnglishQuest — โจทย์ ภาพ และเสียงสร้างใหม่ทั้งหมด ไม่ได้คัดลอก/scrape ข้อสอบ ETS
และไม่ได้รับการรับรองจาก ETS (TOEIC® เป็นเครื่องหมายการค้าของ ETS) · คะแนนในแอป = Practice Score

## โครงสร้าง

| ส่วน | ไฟล์ |
|---|---|
| ค่าตั้งต้น (Part 1–7, เสียง, EXP, กลุ่มทักษะ, disclaimer) | `config/toeic.js` |
| Validator (`Part1QuestionValidator`) | `services/toeic/part1Validator.js` |
| คลังข้อ: sync ไฟล์ → DB, cache, ผูกคำศัพท์เดิม | `services/toeic/bank.js` |
| Practice / Mock / ตรวจคำตอบ / EXP / Analytics / Error Notebook | `services/toeic/part1.js` |
| API `/api/toeic` | `routes/toeic.js` |
| หน้าเว็บ `window.EQToeic` | `public/js/toeic.js`, `public/css/toeic.css` |
| เนื้อหาต้นฉบับ (เขียนหลังวิเคราะห์ภาพจริง) | `scripts/toeic/content/part1-pilot.js` |
| Pipeline | `scripts/toeic/prepare-images.py` → `build-part1.js` → `gen-audio.py` → `build-part1.js` |
| คลังที่ build แล้ว | `data/toeic/part1/bank.json` (+ `audio-manifest.json`, `image-qa.json`, `image-sources.json`) |
| ภาพ/เสียง | `public/assets/toeic/p1/P1-0001.webp` (+ `-640.webp`) · `public/assets/toeic/p1/audio/P1-0001-v0-<hash>.mp3` |
| Migration | `migrations/045_toeic_part1.sql` (+ `_down`) |
| ทดสอบ | `test/toeic-part1.test.js` · E2E `test/e2e/toeic_e2e.py` |

Part 2–7: เพิ่ม `data/toeic/partN/bank.json` + validator/บริการของ part นั้น และ `ready: true` ใน `PARTS`
(ตาราง `toeic_questions/sessions/answers` มีคอลัมน์ `part` อยู่แล้ว · route ใช้ prefix `/pN`)

## Content Generation Pipeline (ห้าม generate → publish ทันที)

1. **Image concept → ภาพ**: สร้างด้วย Pixa (Flux 2 Klein 9B) สำหรับ EnglishQuest โดยเฉพาะ · asset id อยู่ใน `image-sources.json`
2. **ตรวจคุณภาพภาพ**: `prepare-images.py` (ความกว้าง ≥ 1000px · ความสว่าง · ความคม) → `image-qa.json` · แปลง WebP 1248px + 640px
3. **Image Analysis**: ดูภาพจริงทีละภาพ บันทึก `photo.{people, objects, actions, positions, scene}` — เขียนจาก "สิ่งที่เห็น" ไม่ใช่จาก prompt
   (เช่น ภาพที่ prompt บอก "kneeling" แต่ภาพจริงคือ "crouching" → ประโยคใช้ working on a wheel)
4. **ประโยคถูก 1 + ตัวลวง 3** พร้อมประเภทตัวลวง เหตุผลภาษาไทย คำแปล ทักษะ คำศัพท์ จุดสำคัญบนภาพ
5. **Validator** (ด้านล่าง) · ข้อที่มีคำเตือนต้องมีผู้ตรวจยืนยัน (`REVIEW_ACK`) จึงจะ verified
6. **เสียง**: `gen-audio.py` สร้างเฉพาะงานใน `audio-jobs.json` (ข้อความ/เสียงเปลี่ยน) · cache ด้วย contentHash
7. **Review**: เปรียบเทียบประโยค A–D กับภาพทีละข้อ (`review` ใน bank.json) · ข้อที่ไม่ผ่านใส่ `REVIEW_HOLD`
8. **Publish**: เปิดเซิร์ฟเวอร์ → `bank.syncFromFiles()` นำเข้า DB (ตรวจ validator ซ้ำ) · ชุดฝึกใช้เฉพาะ `verified`

สถานะ: `draft` (มี error) · `autoChecked` (ผ่านแต่ยังไม่ review) · `reviewNeeded` (มีคำเตือนที่ยังไม่ยืนยัน/ถูก hold) · `verified` · `retired`

## Part1QuestionValidator

image exists · audio exists · 4 statements พอดี · คำตอบถูก 1 ข้อพอดี · ไวยากรณ์ (heuristic: ตัวพิมพ์ใหญ่ จุด a/an ประธาน–กริยา)
· เสียงตรง transcript (contentHash ของข้อความ+ลำดับ+เสียงพูด+เวอร์ชัน) · A–D mapping (`correctOption` ตรงกับลำดับเสียง)
· segments A–D ครบ/เรียง · คำแปล/คำอธิบายไทยครบ · difficulty · skill tags · ประเภทตัวลวง · ไม่มีประโยคซ้ำในข้อ
· คำตอบถูกไม่ซ้ำกับข้ออื่น · ภาพไม่ซ้ำ (hash) · id ไม่ซ้ำ · ไฟล์เปิดได้จริง · กรอบจุดสำคัญอยู่ในภาพ

กันคำตอบกำกวม: ตัวลวงที่คำซ้อนกับคำตอบ ≥ 75% = error · ≥ 50% = ต้องตรวจด้วยตา
· ภาพไม่มีคนห้ามตอบด้วย is/are being + V3 หรือพูดถึงคน · ภาพคนเดียวห้ามตอบด้วยประโยคหลายคน
(ตัวอย่างที่แก้แล้ว: P1-0016 ตัดตัวลวง "clearing a table" ออก เพราะภาพนิ่งแยก "วางจาน" กับ "เก็บจาน" ไม่ได้)

## เสียง (ListeningAudioService)

- Kokoro TTS (kokoro-onnx · ไฟล์โมเดลจาก GitHub releases) สร้างล่วงหน้า → MP3 mono 64 kbps · ไม่ใช้ speechSynthesis ในข้อสอบ
- 1 ข้อ = 1 ไฟล์: `Look at the picture.` → (A) → (B) → (C) → (D) · เว้น 1.6 วินาทีระหว่างตัวเลือก · เก็บเวลาเริ่ม/จบของ A–D
- 2 variants ต่อข้อ: ลำดับ A–D ต่างกัน (ตำแหน่งคำตอบย้าย) + สำเนียงต่างกัน (อเมริกัน/อังกฤษ) → ลดการจำ "ภาพนี้ตอบ C"
  ไม่สลับ A–D ฝั่งหน้าเว็บ (เสียงกับคำตอบจะไม่ตรงกัน) — เซิร์ฟเวอร์เลือก variant และตรวจคำตอบกับ variant นั้น
- ชื่อไฟล์มี contentHash → ข้อความไม่เปลี่ยน = ไม่สร้างใหม่ · cache ได้นาน
- Voice pool: American (af_heart, am_michael, af_bella, am_fenrir) · British (bf_emma, bm_george, bf_isabella, bm_fable) · speed 1.0
  (โมเดลนี้ไม่มีสำเนียงแคนาดา/ออสเตรเลีย — เพิ่มได้ใน `VOICES` เมื่อมีโมเดลที่รองรับ)

สร้างเสียงใหม่: `pip install kokoro-onnx soundfile` + ffmpeg → `node scripts/toeic/build-part1.js && KOKORO_DIR=<โฟลเดอร์โมเดล> python3 scripts/toeic/gen-audio.py && node scripts/toeic/build-part1.js`

## Practice / Mock

| | Practice | Mock |
|---|---|---|
| ข้อ | 5 / 10 / 20 · Easy/Medium/Hard/Adaptive · หัวข้อ · สำเนียง (ขั้นสูง) · Custom Review | 6 ข้อ: คนเดียว/หลายคน/ไม่มีคน × ง่าย/กลาง/ยาก (ไม่ adaptive) |
| เสียง | Play/Replay · 0.9x/1.0x · ปรับเสียง | Start Question ครั้งแรก · ข้อถัดไปเล่นอัตโนมัติ · ครั้งเดียว (รีโหลดก็ไม่เล่นซ้ำ) · ปรับเสียงได้ |
| ภาพ | ขยายภาพ/ซูม · จุดสำคัญหลังตอบ | ไม่มีขยาย |
| ระหว่างข้อ | Feedback เต็มหลังตอบ | ไม่มี feedback · ตอบตามลำดับ |
| หลังจบ | Accuracy · Correct/Incorrect · เวลาเฉลี่ย · Strongest/Weakest · Review | Practice Score x/6 · % · Estimated performance · Skill Breakdown · Review Answers / Review Mistakes |

Audio Check (เล่นเสียงทดสอบ + ปรับเสียง + "ได้ยินชัดเจน/ลองอีกครั้ง") ก่อน Mock ทุกครั้ง และก่อน Practice ครั้งแรกของการเปิดแอป
— การแตะคือการปลดล็อกเสียงของเบราว์เซอร์ (iOS Safari / Android Chrome / PWA ไม่ autoplay)

โหลดไฟล์: เสียงโหลดเต็มไฟล์ก่อนเล่น (fetch → blob) · preload ภาพ+เสียงของข้อถัดไปเท่านั้น · โหลดไม่ได้ = แสดง
"ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่" หยุดรอ ไม่ส่งคำตอบ (ไม่หักคะแนน) · บันทึก `asset_errors`
Service Worker: `/assets/toeic/*` cache-first ใน `eq-toeic-media` จำกัด 60 ไฟล์ (ไม่แคชคลังเสียงทั้งหมด)

Adaptive (Practice เท่านั้น · ต้องมีประวัติ ≥ 12 ข้อ): กลุ่มทักษะแม่นยำ < 70% ได้น้ำหนัก ×2.5 · ความยากเป้าหมายตามความแม่นยำ
(≥ 85% hard · ≥ 60% medium · ต่ำกว่า easy) · ข้อใหม่ก่อน · ข้อที่เคยผิดกลับมาบ่อยกว่าข้อที่ทำถูกแล้ว

## ความปลอดภัย

- ก่อนตอบ: หน้าเว็บได้แค่ภาพ เสียง และเวลา A–D (ไม่มี statement / เฉลย / alt) · ตรวจคำตอบจาก (session, questionId, selected) ฝั่งเซิร์ฟเวอร์
- ตอบซ้ำไม่ได้ (UNIQUE) · Mock ตอบตามลำดับ · จบ Mock ก่อนครบไม่ได้ · ชุดของคนอื่นเข้าไม่ได้ · rate limit
- alt text เต็มเปิดหลังตอบ (Practice) / ใน Review เท่านั้น — ระหว่างทำข้อใช้ alt ทั่วไป ("ภาพประกอบข้อที่ n")

## EXP (บัญชีเดียวกับคำศัพท์/แกรมม่า — `utils/exp.js`)

| เหตุการณ์ | EXP | กันฟาร์ม |
|---|---|---|
| Practice ตอบถูก | 3 | ข้อเดิมได้ครั้งเดียวต่อวัน (`t1q:<qid>:<วัน>`) |
| จบชุด Practice (≥ 5 ข้อหรือครบชุด) | 10 | ≤ 5 ชุด/วัน · ชุดละครั้ง |
| Practice ถูกหมด (≥ 5 ข้อ) | 5 | ≤ 5 ครั้ง/วัน |
| จบ Mock | 30 (ครั้งแรกของวัน) · 10 (ครั้งที่ 2–3) | > 3 ครั้ง/วัน = 0 · ชุดละครั้ง |
| Mock ถูกหมด | 10 | 1 ครั้ง/วัน |
| Mock ระหว่างข้อ | 0 | — |

## Analytics / Error Notebook

`toeic_answers`: questionId · skill/skills · ตัวลวงที่เลือก · เฉลย · เวลาตอบ · สำเนียง · ระดับ · หมวดภาพ · วันที่ (+ `answer_events` skill = listening)
- Summary (`/p1/summary?range=7|30|all`): Accuracy · ข้อที่ฝึก · Best Practice/Mock · Weak Skill · ทักษะรายกลุ่ม (Actions · Objects · People · Locations · Prepositions · Passive) · ภาพมีคน/ไม่มีคน · สำเนียง · กับดักที่พลาดบ่อย
- Error Notebook (`/p1/mistakes`): ข้อที่ "ครั้งล่าสุด" ยังผิด (ตอบถูกภายหลัง = หลุดรายการ) · Custom Review = ชุดฝึกจากรายการนี้

## คำศัพท์

Key Vocabulary ผูกกับคลังเดิมด้วย `vocab_entries.normalized` + ชนิดคำ → `vocab_senses.public_id` (ไม่สร้างคำซ้ำในคลัง)
· "เรียนคำนี้" = เปิดการ์ดคำเดิม · "เพิ่มเข้ารายการทบทวน" = `word_progress` (SRS เดิม) · หน้า Part 1 Essential Vocabulary (tag `toeicListeningPart1`) แบ่ง 11 หมวด

## API (`/api/toeic` · ต้องล็อกอิน)

`GET /meta` · `GET /p1/summary` · `POST /p1/sessions {mode, size, difficulty, topic, accent, source}` · `GET /p1/sessions/:id`
· `POST /p1/sessions/:id/answer {qid, selected, responseMs}` · `POST /p1/sessions/:id/finish` · `POST /p1/sessions/:id/asset-error`
· `GET /p1/mistakes` · `GET /p1/vocab` · `POST /p1/vocab/review {wordId}`
