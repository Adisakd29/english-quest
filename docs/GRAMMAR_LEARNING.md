# Learn Grammar A1–C1 (v1.5.0)

> อัปเดตใน patch เดิม: บทเรียนแบบทีละขั้น · EXP บัญชีเดียว · แก้ปุ่มซ่อนหัวข้อ · หน้าเข้าสู่ระบบ Parallax — ดูหัวข้อ "บทเรียนทีละขั้น" และ "EXP บัญชีเดียว" ด้านล่าง

Learn → Practice → Make Mistakes → Understand → Review → Master → Compete

## เนื้อหา
- `data/grammar-curriculum/index.js` — ทะเบียนหัวข้อ (74 หัวข้อ) · ชนิดแบบฝึก · ตัวตรวจหลักสูตร `validateCurriculum`
- `data/grammar-curriculum/topics/<topic>.json` — บทเรียน + แบบฝึกของแต่ละหัวข้อ
- รวม **1,276 ข้อ**: A1 329 · A2 264 · B1 227 · B2 193 · C1 263
- ชนิดข้อ: mc 190 · fill 241 · error 194 · transform 165 · order 127 · match 74 · choose 69 · dialogue 69 · context 73 · write 74

| ระดับ | หัวข้อ |
|---|---|
| A1 (19) | Subject/Object Pronouns · Verb to be · Articles · Plural Nouns · This/That · Possessive Adjectives · Possessive 's · There is/are · Have/Has · Present Simple · Adverbs of Frequency · Present Continuous · Can/Can't · Imperatives · Prepositions · Question Words · Conjunctions · Comparatives (-er) |
| A2 (15) | Past Simple · Past Continuous · will · be going to · Present Continuous (future) · Countable/Uncountable · much/many/some/any · Comparatives · Superlatives · must/have to/should · Verb + to-inf · Gerunds · Present Perfect (intro) · who/which/that · First Conditional |
| B1 (13) | Present Perfect vs Past Simple · Present Perfect Continuous · Past Perfect · Passive · Second Conditional · Reported Speech · Relative Clauses · Modals of Deduction · Gerund vs Infinitive · used to · would (past habits) · Question Tags · Phrasal Verbs |
| B2 (12) | Narrative Tenses · Advanced Passive · Causative · Third/Mixed Conditionals · Reporting Verbs · Reduced Relatives · Participle Clauses · Inversion (intro) · Modal Perfect · Wish/If only · Linking |
| C1 (15) | Advanced Inversion · Cleft · Emphasis · Advanced Conditionals · Ellipsis · Substitution · Nominalisation · Modal Meaning · Complex Passive · Advanced Relatives · Advanced Participle Clauses · Discourse · Formal/Academic · Hedging · Transformation |

### บทเรียน 6 ขั้น
Concept (คืออะไร / ใช้เมื่อไร / ใช้เพื่ออะไร / ศัพท์ EN+TH) → Structure (บอกเล่า/ปฏิเสธ/คำถาม/ตอบสั้น) →
Examples (EN + TH + ไฮไลต์ + บริบทชีวิตจริง) → Common Mistakes → Compare → Practice

### Schema ของข้อ (ย่อ)
ทุกข้อ: `id, type, difficulty (1–4), explainTh, structure?, example?`
- เลือกตอบ (`mc/choose/dialogue/context`): `choices, answer, whyNot[]` (+ `context.lines` สำหรับบทสนทนา/อีเมล/ข้อความ)
- `fill`: `question, accepted[]` · `order`: `tokens, accepted[]` · `error`: `sentence, errorPart, accepted[]`
- `transform`: `source, instruction, accepted[]` · `match`: `pairs` · `write`: `task, minSentences, expectTense, checks, forbid, sample`

### การตรวจคำตอบ (`services/grammar/check.js`) — ฝั่งเซิร์ฟเวอร์เท่านั้น
- รับได้หลายคำตอบ (`accepted[]`) · ไม่สนตัวพิมพ์/จุดท้าย/อัญประกาศโค้ง · คำย่อ = คำเต็ม (`'s` = is/has, `'d` = had/would)
- จุลภาคไม่บังคับ ยกเว้นข้อที่ความถูกผิดอยู่ที่จุลภาค (ตรวจอัตโนมัติ)
- "เกือบถูก (สะกด)" แสดงเฉพาะข้อเติมคำ · ข้อแก้ผิดที่ส่งประโยคเดิมกลับมาจะบอกว่า "ยังไม่ได้แก้"
- Writing (`services/grammar/writing.js`): กฎข้อผิดที่พบบ่อยของผู้เรียนไทย + เงื่อนไขโจทย์ — อธิบายเหตุผลเป็นภาษาไทยทุกข้อ (ไม่ใช้ AI ภายนอก)

## ระบบ (`services/grammar/engine.js`, API `/api/gl`)
| ส่วน | กติกา |
|---|---|
| Mastery | 0.65 × ความแม่นถ่วงน้ำหนัก (ใหม่ + ยาก มีน้ำหนักมาก) + 0.35 × 5 ข้อล่าสุด · × ความมั่นใจ √(n/10) · ลดลงเมื่อไม่ฝึก > 21 วัน · เชี่ยวชาญ ≥ 80% และ ≥ 8 ครั้ง |
| ทบทวน (SRS) | 1 · 3 · 7 · 14 · 30 วัน · ผิด = ถอย 2 ขั้น ทบทวนพรุ่งนี้ · ตอบถูกก่อนถึงรอบไม่เลื่อนขั้น |
| Placement | เริ่ม A2 · ชุดละ 4 ข้อ · ถูก ≥ 3 ขึ้น · ≤ 1 ลง · ไม่เกิน 7 ชุด · ระดับ = ระดับสูงสุดที่ถูก ≥ 60% · ผล Strong / Needs Practice |
| ระดับ 3 แบบแยกกัน | Account Level (EXP) · Grammar CEFR (Placement แกรมม่า) · Rank Tier (Ranked) |
| EXP | ดูหัวข้อ "EXP บัญชีเดียว" ด้านล่าง (ไม่มีเพดานรายวัน) |
| Daily Challenge | 7 ข้อ/วัน (เวลาไทย) เน้นหัวข้อที่อ่อน · ทำได้วันละครั้ง |
| Badge | Article Apprentice · Tense Explorer · Present Perfect Master · Conditional Champion · Grammar Guardian · Perfect 10 · No Mistakes · 7-Day Streak — ทุกอันมาจากผลจริง |

ตารางใหม่ (migration `039_grammar_learning.sql`, มี `_down`): `grammar_attempts, grammar_reviews, grammar_lessons, grammar_placements,
grammar_profiles, grammar_daily, grammar_badges, grammar_writings` — เพิ่มอย่างเดียว ไม่แก้/ลบข้อมูลเดิม

## Grammar Battle (Ranked โหมดแกรมม่า)
- `services/ranked/grammarBank.js` — คำถามจากคลังหลักสูตร (ข้อเลือกตอบ) · 80% ระดับผู้เล่น 20% ระดับข้างเคียง · หัวข้อละไม่เกิน 2 ข้อ
  · League สูงได้ข้อยากมากขึ้น · ตัดข้อบริบทที่เฉลยปรากฏตรงตัวในเนื้อหา · seed เดียวกัน = ชุดเดียวกันทั้งสองฝั่ง
- ระดับที่ใช้: Grammar CEFR → ผลวัดระดับรวมเดิม → A1 · ปรับ ±1 ตาม 30 ข้อล่าสุด (≥ 85% ขึ้น · ≤ 40% ลง)
  — matchmaking PvP ใช้ระดับนี้ร่วมกับ Rating/แรงค์ (เกณฑ์ห่างไม่เกิน 1–2 ระดับเหมือนเดิม)
- หน้าก่อนเริ่ม: Grammar Battle · Estimated Level · หัวข้อในเกม · 10 Questions
- ผลลัพธ์: Score Breakdown (Accuracy · Speed · Difficulty · Streak) + หัวข้อที่ทำได้/ควรทบทวน (แตะเพื่อเปิดบทเรียน)
- ทุกคำตอบบันทึกกลับ `grammar_attempts` (source `ranked`) → Mastery / My Mistakes / Review
- คลังเดิม `data/grammar.js` (แก้แล้ว 137 ข้อ) ยังใช้ในบทเรียน 16 บทเดิม และเป็นสำรองของ Grammar Battle

## UI (`public/js/grammar.js`, `public/css/grammar.css`)
เมนูล่าง "แกรมม่า" → Learning Map (กาง/พับรายระดับ) · Review Today · Daily · My Mistakes (กรอง CEFR/หัวข้อ/ช่วงเวลา/สถานะ) ·
Progress (7/30/ทั้งหมด) · Writing · ศัพท์แกรมม่า EN+TH · ปุ่ม Grammar Battle (โทนแข่งขัน แยกจากโหมดเรียน)
- ไม่เลื่อนข้ออัตโนมัติ · ปุ่ม/ตัวเลือก ≥ 44px · โฟกัสชัด · Enter ส่งคำตอบ · บรรทัดภาษาไทย 1.7
- ทดสอบ: `test/grammar-learn.test.js` (13) · `test/grammar-qa.test.js` (3) · E2E มือถือ 320/390 + เดสก์ท็อป ธีมสว่าง/มืด

## ข้อจำกัด
- ตัวตรวจ Writing ใช้กฎ — จับข้อผิดที่พบบ่อยได้ แต่ไม่ครบทุกกรณี (บอกผู้เรียนตรง ๆ ในผลตรวจ)
- QA อัตโนมัติจับรูปแบบที่รู้จัก ความถูกต้องเชิงความหมายตรวจโดยผู้ตรวจแล้วหนึ่งรอบ (ดู `GRAMMAR_QA.md`)

## บทเรียนทีละขั้น (Step-by-Step)
`services/grammar/lesson.js` · API `/api/gl/lessons/:id` (`/steps/:k`, `/steps/:k/answer`, `/steps/:k/complete`, `/restart`), `/api/gl/continue`, `/api/gl/summary`

แผน 12 ขั้นสร้างจากเนื้อหาหลักสูตรอัตโนมัติ (ทุก 74 บท):

| Step | ชนิด | เนื้อหา |
|---|---|---|
| 1 | Concept | "เราใช้ … เมื่อไร?" + 3 จุดใช้ (รายละเอียด/ศัพท์พับเก็บได้) |
| 2 | Discover | ดูตัวอย่างที่ไฮไลต์ → เลือกรูปแบบเอง (Select Grammar Pattern) → เผยกฎ |
| 3 | Structure | สูตร + รูปแบบกลุ่มที่ 1 |
| 4 | Quick Check | 2 ข้อ (มี "ลากคำลงช่องว่าง") |
| 5 | Structure / Examples | รูปแบบกลุ่มที่ 2 (เช่น ปฏิเสธ · คำถาม) |
| 6 | Mini Practice | 2 ข้อ |
| 7 | Structure / Real Life | รูปแบบกลุ่มที่ 3 หรือบทสนทนา/อีเมล |
| 8 | Mini Practice | 3 ข้อ |
| 9 | Common Mistakes | ถูก/ผิด (True/False) แล้วเฉลยเหตุผล |
| 10 | Practice Challenge | 4 ข้อ หลายรูปแบบ (มี "แตะคำที่ผิด") |
| 11 | Lesson Review | สรุปสูตร/รูปแบบ/เปรียบเทียบ |
| 12 | Mastery Check | 4 ข้อยากที่สุด |

- ชุดข้อกำหนดด้วย seed (ผู้ใช้ + บท + รอบ) → refresh/เปลี่ยนเครื่องได้ชุดเดิม · "เรียนรอบใหม่" = ชุดข้อใหม่
- ข้ามขั้นไม่ได้ (403) · ขั้นแบบฝึกต้องตอบครบก่อน (400) · คำตอบแรกของแต่ละข้อเท่านั้นที่นับ (atomic)
- สถานะบนแผนที่: **Locked** (บทก่อนยังไม่ผ่าน) · **Available** · **In Progress** · **Completed** (ความแม่นของรอบ ≥ 80%) · **Mastered** (ผ่าน + mastery ≥ 85% + ตอบถูกในรอบทบทวน/Daily หลังผ่าน)
- ปลดล็อก: ระดับ ≤ ระดับแกรมม่าของผู้เรียนเปิดทั้งหมด · นอกนั้นทีละบท · บทแรกของระดับถัดไปเปิดเมื่อระดับก่อนผ่าน ≥ 60%
- ข้อมูลเพิ่มใน `grammar_lessons` (migration `040_grammar_steps_exp.sql`): current_step · run_no · run_steps · run_answers · completed_steps · lesson_accuracy · best_accuracy · lesson_runs · lesson_completed_at · mastered_at · last_study_at

## EXP บัญชีเดียว
- `utils/exp.js`: `grantExp` (รองรับเพดานต่อวันถ้าต้องการ — ปัจจุบันไม่ใช้) · `grantOnce` (ครั้งเดียวต่อคีย์ ด้วยตาราง `exp_awards` — กันส่งซ้ำพร้อมกัน) — ทุกแหล่งเพิ่ม `users.exp` + `exp_log` ตัวเดียวกับคำศัพท์/Ranked
- บทเรียน: จบขั้น +5 (`gls:<บท>:<ขั้น>`) · ตอบถูกครั้งแรกของข้อ +8 (A1–A2) / +10 (B1–B2) / +12 (C1) (`glq:<ข้อ>`) · จบบท +30 (`glc:<บท>`) · Perfect +15 (`glp:<บท>`)
- ฝึกอิสระ/ทบทวน: ข้อละ +8 ได้วันละครั้งต่อข้อ (`glx:<ข้อ>:<วัน>`) · ถูกครบ +15 วันละครั้งต่อหัวข้อ · Daily +25 (+15 Perfect) · Writing +15 ครั้งแรกที่ผ่านแต่ละโจทย์
- **ไม่มีเพดาน EXP รายวัน** ทั้งแกรมม่าและ Ranked (Ranked เปิดเพดานได้ด้วย env `RANKED_EXP_DAILY_CAP`) — กันปั๊มด้วย "ครั้งเดียวต่อคีย์" แทน
- ทุกผลตอบกลับมี `levelInfo` → หน้าเว็บอัปเดตแถบ EXP/เลเวลทันที + "+N EXP" ลอยเบา ๆ (`EQLesson.expReward`)

## ส่วนประกอบกลาง (`public/js/lesson-kit.js`, `public/css/lesson-kit.css`)
ใช้ร่วม Vocabulary + Grammar: `footprints` (จุดความคืบหน้า — โหมดคำศัพท์ใช้ตัวนี้แล้ว) · `progress` (Step x/N + %) · `floatExp`/`expReward` (โหมดคำศัพท์ใช้ `floatExp` แล้ว) ·
`collapsible` · ExerciseRenderer (`itemBody`/`collect`/`wireItem`/`lock`/`feedbackHtml`) ครอบคลุม mc · choose · dialogue · context · fill · order · error · transform · match · write + ใหม่: drag · detect · tf · pattern

## ปุ่ม "ซ่อนหัวข้อ" (แก้แล้ว)
สาเหตุจริง: state สลับถูกแล้ว (`hidden` ถูกใส่) แต่ CSS `.gl-topics { display: grid }` ชนะ `[hidden]` ของเบราว์เซอร์ เนื้อหาจึงไม่หาย
และการกดสั่งวาดหน้าแผนที่ใหม่ทั้งหน้า (เสียโฟกัส/ตำแหน่ง) · ป้ายปุ่มไม่สลับเป็น "แสดงหัวข้อ"
แก้: Collapsible กลาง (ปุ่มจริง · aria-expanded/aria-controls · ปิดแล้ว inert + visibility:hidden · grid-template-rows 0fr↔1fr ไม่กระโดด ·
ไม่วาดหน้าใหม่ · จำสถานะใน session/เครื่อง) + กฎ `.gl-screen [hidden] { display:none !important }` (แก้กรณีเดียวกันในช่องค้นหาศัพท์และตัวเรียงคำ)
