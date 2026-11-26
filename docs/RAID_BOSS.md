# World Raid Boss (v1.27.0 · ปรับปรุง v1.27.1)

ผู้เล่นทั้งเซิร์ฟเวอร์ร่วมกันสู้บอส 3D ตัวเดียวกัน โดยตอบคำถามภาษาอังกฤษ

## สถาปัตยกรรม

| ส่วน | ไฟล์ | หน้าที่ |
|---|---|---|
| นิยามบอส | `config/raidBosses.js` | ตระกูล 10 ช่วงเลเวล · Phase · ดาเมจ · รางวัล · ค่าเริ่มต้นที่ผู้ดูแลปรับได้ |
| ฐานข้อมูล | `migrations/084_world_raid.sql` | instances · attempts · question_responses · damage_events · contributions · player_stats · reward_claims · user_rewards · announcements · admin_audit_logs · settings · view `raid_boss_history` |
| Game logic | `services/raid/index.js` | State Machine · ดาเมจ (Server-Authoritative) · Phase/โล่ · รางวัล · ประกาศ · กระจายสถานะ · metrics |
| คำถาม | `services/raid/questions.js` | ใช้คลังของระบบเรียนเดิม: Vocabulary · Sentence Completion · Grammar · Reading · Error Identification · Spelling Strike · Listening (v1.27.1) |
| API | `routes/raid.js` | ผู้เล่น `/api/raid/*` · ผู้ดูแล `/api/admin/raid/*` |
| หน้าเว็บ | `public/js/raid.js` · `public/css/raid.css` | ล็อบบี้ · คำถาม · คีย์บอร์ดสะกดคำ · อันดับ · ฟีด · รางวัล |
| ฉาก 3D | `public/js/raid-scene.js` · `public/vendor/eq-three-raid.min.js` | three.js r169 (ชุดแยกของ Raid · โหลดเฉพาะหน้า Raid) |
| ผู้ดูแล | `public/js/raid-admin.js` | สถานะ · ตั้งค่า · ปรับบอส · ปิดฉุกเฉิน · Damage Log · กิจกรรมผิดปกติ · Audit Log |
| โมเดล | `scripts/raid/blender/*.py` → `scripts/raid/optimize.mjs` | Blender headless → GLB → meshopt → `public/assets/raid/` + `data/raid/assets.json` |

## State Machine (เก็บในฐานข้อมูลเสมอ)

```
preparing ──(prepareSec)──▶ active ──HP 0──▶ defeated ──tick──▶ settled ──(cooldownMin)──▶ บอสเลเวลถัดไป (preparing)
                              │ Phase 1 (>70%) → 2 (>35% · โล่) → 3 (Final Stand · ท่าไม้ตายเป็นจังหวะ)
       ผู้ดูแลปิด Raid ──▶ paused ──เปิดกลับ──▶ สถานะเดิม (ข้อมูลอยู่ครบ)
```

- **tick ทุก 3 วินาที:** ทุกเครื่องเรียกได้ แต่ทำงานจริงทีละเครื่อง (`pg_try_advisory_xact_lock`)
- **บอสใหม่:** สร้างด้วย `INSERT … ON CONFLICT (level) DO NOTHING` จึงไม่เกิดซ้ำ และไม่ย้อนระดับหลังรีสตาร์ต
- **โจมตี:** ทำใน transaction เดียวกันทั้งหมด
  - ลำดับล็อก: แถวรอบโจมตี → แถวบอส (ลำดับเดียวกันทุกที่ จึงไม่เกิด deadlock)
  - แล้วจึงหัก HP / เปลี่ยน Phase / ตาย / บันทึกดาเมจ / contribution
- **ป้องกันการซ้ำ:**
  - PK `(attempt, ข้อ)` → ตอบซ้ำไม่ได้ · ส่งซ้ำได้ผลเดิม (replay)
  - UNIQUE ดาเมจต่อข้อ
  - HP ถึง 0 ได้ครั้งเดียว (row lock + `status = 'active'`)
  - รางวัลมี PK `(บอส, ผู้เล่น, ขั้น)` และ EXP/Coin/ของอยู่ใน transaction เดียวกับการรับ
- **หลายเครื่องเซิร์ฟเวอร์:** สถานะอยู่ใน PostgreSQL · กระจายเหตุการณ์ผ่าน `NOTIFY eq_raid` (ไม่ต้องใช้ Redis)
- **WebSocket:**
  - ส่ง `raid:state` (รวมเป็นชุดทุก 300ms · สูงสุด 8 hit ต่อชุด) เฉพาะคนที่เปิดหน้า Raid
  - ส่ง `raid:announce` ให้ทุกคน
- **Polling fallback:** WebSocket หลุด → `GET /api/raid/poll` ทุก 4 วินาที · กลับมาเชื่อมต่อ = โหลดสถานะใหม่ทั้งหมด

## ดาเมจ (เซิร์ฟเวอร์คำนวณ · หน้าเว็บส่งตัวเลขเองไม่ได้)

```
ดาเมจ = BASE[CEFR] × TYPE[ชนิดข้อ] × (1 + 0.1 × min(combo, 5)) × (Critical 1.5) × (โล่ 0.35 | มึน 1.3) × (1 − defense)
```

- **BASE:** A1 100 · A2 108 · B1 116 · B2 124 · C1 130
  - ผู้เริ่มต้นได้ 77% ของ C1 จึงยังช่วยทีมได้จริง
  - ระดับคำถามมาจากผลวัดระดับ ผู้เล่นเลือกเองไม่ได้ จึงเลือก A1 เพื่อฟาร์มไม่ได้
- **TYPE:**
  - vocab 1.0 · context 1.05 · grammar 1.05
  - error 1.1 · reading 1.2 · listening 1.2 · spell 1.3
- **Critical:** ตอบถูกภายใน 35% ของเวลา และตอบถูกติดกันมาแล้ว ≥ 2 ข้อ (กติกาตายตัว ไม่สุ่ม)
- **จับเวลาต่อข้อ:**
  - คำตอบไม่แนบข้อถัดไป
  - ข้อถัดไปเปิดด้วย `POST /api/raid/round/next` ตอนผู้เล่นกด "ข้อถัดไป" (เวลาที่อ่านคำอธิบายจึงไม่ถูกนับ)
  - เวลาเริ่มครั้งเดียวต่อข้อ (`shown_idx`) · ขอซ้ำหรือรีเฟรชไม่รีเซ็ตเวลา (กันอ่านโจทย์ก่อนแล้วรีเซ็ตเพื่อทำ Critical)
- **กันฟาร์ม/บอท:**
  - ตอบเร็วกว่า `minAnswerMs` = ไม่มีดาเมจ + ติดธง `too_fast`
  - วันละ `roundsPerDay` รอบ
  - จำกัดความถี่ API (ตอบ 40 ครั้ง/นาที)
  - คำถามไม่ซ้ำกับ 6 รอบล่าสุด

## พลังชีวิตผู้เล่น + เล่นต่อเนื่อง (v1.27.1)

- รอบเริ่มด้วย `playerHp` (100) · ตอบผิด/หมดเวลา/ติดธงตอบเร็ว → หัก `bossHit1/2/3` ตาม Phase ของบอส ณ ตอนตอบ (20/25/30) · บอสไม่ active = ไม่หัก
- ตอบถูกติดกันครบทุก `healEvery` (5) ข้อ → ฟื้น `healAmount` (10) ไม่เกินเต็ม
- พลัง 0 → `raid_attempts.status = finished`, `knocked_out = true` · ดาเมจที่ทำไปนับครบ · ไม่แตะ Coin/EXP/ไอเทม/อันดับ
- ทุกค่าอยู่ในทรานแซกชันเดียวกับดาเมจ (ล็อกแถว attempt) · ส่งซ้ำ = replay ค่าจาก `raid_question_responses.player_hit/heal`
- `playerHpOn = false` → รอบใหม่ไม่มีพลังชีวิต (คอลัมน์เป็น NULL) ทำงานแบบเดิม
- `questionsPerRound` ค่าเริ่มต้น 40 (ช่วง 5–60) = เพดานความยาวรอบ
- หน้าเว็บ: ตอบแล้วไปข้อถัดไปเอง (ถูก 1.4 วิ · ผิด 3.2 วิ) · ครบรอบโดยไม่หมดแรง → เริ่มรอบใหม่ใน 4 วิ · ปิดได้ (`localStorage eq_raid_auto = off`)

## ชวนเพื่อน + HP สด + คนในศึก (v1.27.1)

- `POST /api/raid/invite` → ข้อความแชทโลก `invite_kind = raid` · `invite_ref = R<id>` · ข้อความคงที่จากเซิร์ฟเวอร์ · 1 ครั้ง/2 นาที/คน (ในหน่วยความจำ)
- `raid:hp` (broadcastAll · ≤ 1 ครั้ง/2 วินาที) = สถานะบอสสาธารณะย่อ · หน้าเว็บรวมไว้ใน `LIVE` ของ `raid.js` แล้ววาดการ์ดหน้าแรก/หน้าเล่น/แชท
- `online` = คนที่เปิดหน้า Raid ตอนนี้ (ws sub + poll `?in=raid` ≤ 15 วิ) · เปลี่ยนเมื่อมีคนเข้า/ออก (ส่งสถานะใหม่ใน ~1 วิ ไม่ต้องรอดาเมจ)

## Listening (v1.27.1)

- **ที่มา:** คลัง TOEIC Part 2 ต้นฉบับของ EnglishQuest (`data/toeic/part2/bank.json` · 150 ข้อ · ตรวจเฉลยแล้ว · เสียง Kokoro TTS ที่สร้างไว้แล้ว ไม่มีค่าใช้จ่าย)
- **รูปแบบ:** ฟังคำถามสั้น 1 ประโยค → เลือกคำตอบที่เหมาะสมจาก 3 ตัวเลือก (ตัวเลือกเป็นข้อความ)
- **ไฟล์เสียง:** ตัดเฉพาะช่วงคำถามเป็นไฟล์แยก (`scripts/raid/cut_listen.py` → `public/assets/raid/listen/` + `data/raid/listen.json` · 150 ไฟล์ · 2.9 MB)
  - ไฟล์จบท้ายคำถามเอง → ไม่ได้ยินตัวเลือก A/B/C ของ TOEIC ต่อ แม้เครื่องช้า
  - ไฟล์ไม่มีประโยคเฉลย · หน้าเว็บไม่ได้รับประโยคที่ได้ยิน (transcript) จนกว่าจะตอบ
- **จำนวน:** Phase 2 และ 3 รอบละ 1 ข้อ · Phase 1 ไม่มี (ยังสอนกลไก)
- **ความยาก:** เลือกจาก `difficulty` ของคลัง (A1–A2 = easy · B1 = easy/medium · B2 = medium/hard · C1 = hard/medium)
  - คลังนี้ไม่ได้กำหนด CEFR จึงไม่ติดป้าย CEFR ให้ข้อฟัง (หน้าเว็บแสดง "ระดับง่าย/กลาง/ยาก")
- **การเล่น:** เล่นเองทันทีหลังกด "ข้อถัดไป" · ฟังได้ 2 ครั้ง · เวลาตอบ 1.5 เท่า (เท่า Spelling) · เพลงหรี่ลง 4% ระหว่างเล่น
  - เบราว์เซอร์ไม่ให้เล่นเสียงก่อนแตะ (เช่น เปิดแอปแล้วกลับมาทำรอบค้าง) → ปุ่มแสดง "แตะเพื่อฟังคำถาม" และไม่เสียสิทธิ์ฟัง
  - iOS/Safari: ปลดล็อกเสียงระหว่างแตะ "เข้าโจมตี"/"ข้อถัดไป" (ยังไม่ได้ทดสอบบนอุปกรณ์จริง)

## HP และความยาก

- **สูตร:** HP บอสใหม่ = 40% ค่าพื้นฐานตามเลเวล (+7%/เลเวล) + 60% ของ "ดาเมจต่อชั่วโมงจริงของ 3 ตัวล่าสุด × targetHours"
- **ขอบเขต:**
  - จำกัดอยู่ระหว่าง 0.3–3 เท่าของค่าพื้นฐาน
  - และอยู่ใน `hpFloor` – `hpCap` ที่ผู้ดูแลตั้ง
  - ไม่ใช้จำนวนบัญชีที่สมัคร
- **เป้าโล่ Phase 2:** ผู้เล่นที่ตอบจริงใน 30 นาทีล่าสุด × 3 คำตอบ (10–300)
- **เตือนผู้ดูแล:** หน้าผู้ดูแลเตือนเมื่อบอสค้างเกิน 3 เท่าของเป้าเวลา

## โมเดล 3D (สร้างด้วยโค้ดใน Blender — ต้นฉบับ)

| บอส | สามเหลี่ยม | กระดูก | ไฟล์ (meshopt) | ฉาก |
|---|---|---|---|---|
| Forest Guardian (Lv 1–4) | ~17k | 18 | ~233 KB | ป่าต้องมนตร์ ~72 KB |
| Inferno Golem (Lv 5–9) | ~10k | 18 | ~197 KB | ป้อมภูเขาไฟ ~31 KB |
| Frost Dragon (Lv 10–14) | ~16k | 24 | ~261 KB | วิหารมังกรน้ำแข็ง ~33 KB |
| Frost Dragon — Christmas Blizzard | ~16k | 24 | ~271 KB | ปราสาทน้ำแข็งคืนคริสต์มาส ~91 KB |
| Shadow Archmage (Lv 15–19 · v1.27.1) | ~12k | 18 | ~207 KB | หอคอยเงา ~42 KB |

- **Animation 10 คลิป:** spawn · idle · prepare · attack · special · hit · stun · phase · enrage · death
- **ตระกูลที่ยังไม่มีโมเดล:** Lv 20+ (Celestial Dragon ขึ้นไป) ตั้งเป็น `ready: false`
  - ระบบใช้ตระกูลล่าสุดที่พร้อม (Shadow Archmage) ไปก่อน แทนการเปลี่ยนสีโมเดลเดิมแล้วเรียกว่าบอสใหม่

### ขอบเขตคุณภาพ (ตามจริง)

โมเดลปั้นด้วยโค้ดจาก metaball + noise และทาสีด้วย vertex color ไม่มี texture map วาดมือ ผลที่ได้:
- ดีกว่าภาพนิ่งหรือรูปทรง CSS
- ยังไม่ถึงระดับงานปั้นมือของศิลปิน 3D ในเกม RPG เชิงพาณิชย์

### สเปกสำหรับจ้างศิลปิน / ซื้อ asset (เปลี่ยนไฟล์ได้โดยไม่แก้ระบบ)

- **รูปแบบ:** GLB (glTF 2.0) 1 ไฟล์ต่อบอส · Y-up · หันหน้า +Z · หน่วยเมตร · สูง 3–4 m · origin ที่พื้นใต้ลำตัว
- **งบประมาณ:**
  - ≤ 25k สามเหลี่ยม · ≤ 40 กระดูก · skin ≤ 4 influence
  - texture ≤ 2× 1024² (BaseColor + ORM/Emissive) เป็น KTX2 หรือ WebP
- **Animation:** ชื่อคลิปตรงตามนี้ 10 คลิป `spawn idle prepare attack special hit stun phase enrage death`
  - idle / enrage / stun ต้องวนต่อเนื่องได้
- **กระดูกที่ต้องมี:** ชื่อมีคำว่า `chest` (ตำแหน่งแรงกระแทก/ตัวเลขดาเมจ) และ `head`
- **สิทธิ์ใช้งาน:** ต้องเป็นงานต้นฉบับหรือมีสัญญาอนุญาตใช้เชิงพาณิชย์ (เก็บหลักฐานไว้ใน `THIRD_PARTY_NOTICES.md`)
- **นำเข้า:**
  1. วางไฟล์ใน `<out>/boss-<key>.glb`
  2. รัน `node scripts/raid/optimize.mjs <out>`
  3. ตั้ง `ready: true` ใน `config/raidBosses.js`

## สร้างโมเดลใหม่

```
/home/claude/bpyenv/bin/python scripts/raid/blender/build_raid.py <out>            # บอส + ฉากทั้งหมด (~1 นาที)
node scripts/raid/optimize.mjs <out>                                               # meshopt → public/assets/raid · data/raid/assets.json
```

ภาพ 2D สำรอง (`public/img/raid/*.webp`) เรนเดอร์จากโมเดลจริงด้วย three.js

## ชนิดโจทย์ (v1.27.1)
- `questionMode = 'spell'` (ค่าเริ่มต้น): ทุกข้อเป็น Spelling Strike — เห็นความหมายไทย → สะกดคำอังกฤษด้วยคีย์บอร์ดบนจอ
- `questionMode = 'mixed'`: สัดส่วนตาม Phase (`MIX` ใน `services/raid/questions.js`)
- คำที่ใช้: Oxford ระดับของผู้เล่น · 3–10 ตัวอักษร a–z · มีคำแปลไทย · คำแปลไม่ซ้ำกับคำอื่นในระดับเดียวกัน · ไม่ซ้ำกับ 6 รอบล่าสุดของผู้เล่น (ถ้าไม่พอจึงยอมซ้ำ)

## บอส 10 ตัว (v1.27.1)
| Lv | key | ชื่อ | ฉาก |
|---|---|---|---|
| 1 | forest | Forest Guardian | forest |
| 2 | inferno | Inferno Golem | volcano |
| 3 | frost | Frost Dragon | frost |
| 4 | shadow | Shadow Archmage | shadow-tower |
| 5 | celestial | Celestial Dragon | celestial |
| 6 | titan | Ancient Titan | ruins |
| 7 | leviathan | Abyssal Leviathan | abyss |
| 8 | phoenix | Eternal Phoenix | flame-palace |
| 9 | void | Void Emperor | void-throne |
| 10 | mythic | Mythic Ascension | ascension |

Lv11+ วนซ้ำเป็นร่างวิวัฒน์ (II, III, …) · ความแข็งแกร่งคิดจากเลเวล (`levelPower`) · เพิ่มบอสใหม่ (ready: true) = เข้าวงอัตโนมัติและเลื่อนรอบวิวัฒน์ออกไป
