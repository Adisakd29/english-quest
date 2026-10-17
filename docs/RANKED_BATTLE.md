# Ranked Quest — โหมด Vocab/Grammar · Battle HP (ปิดอยู่) · Disconnect/Leave Penalty · Audio

## อัปเดตล่าสุด (v1.3.0)
- **ชื่อแรงค์ภาษาไทย** (ข้อมูลกลาง `config/leagues.js` → `name` · ชื่ออังกฤษเดิมอยู่ที่ `nameEn` · id ในฐานข้อมูลไม่เปลี่ยน)
  กระจิบพเนจร · กระต่ายเหินลม · นากสายน้ำ · แมวป่ายอดผา · หมาป่าจันทรา · เสือดำพรางเงา · เหยี่ยวพายุ · อินทรีมงกุฎ · ราชสีห์แสงเหนือ
  ใช้ตรงกันทุกหน้า (Lobby / แผนที่ / Leaderboard / โปรไฟล์ / Promotion / ผลการแข่ง — ผลเก่าแสดงชื่อใหม่จาก league id) · ชื่อรางวัล Title เป็นภาษาไทย
- **แผนที่ "เส้นทางสู่แรงค์สูงสุด"** (`public/js/rankmap.js` + `public/css/rankmap.css`) แทน League Journey แบบรายการ
  - SVG วาดสด 9 ดินแดน (`region` / `motto` / `theme` ใน config) ไต่จากล่างขึ้นบน · เส้นทางคดเคี้ยว · Checkpoint ตาม Division · จุดบอส (Guardian 8 + Apex 1)
  - สถานะจากโปรไฟล์จริง: ผ่านแล้ว / กำลังแข่งขัน / พร้อมเลื่อนแรงค์ (`promotionStatus = pending`) / ล็อก (หมอก + สีจาง)
  - อวตารผู้เล่นยืนที่ขั้นปัจจุบัน (เลื่อนเข้าหาขั้นถัดไปตาม % แต้มจริง) · เส้นเรืองแสงช่วงที่ผ่านแล้ว
  - เลื่อนแรงค์: จำตำแหน่งที่เห็นครั้งก่อน (localStorage ต่อโหมด — ใช้แค่ทำ Animation) -> เดินตามเส้นไปจุดใหม่ + เปิดหมอกดินแดนใหม่ + ป๊อปอัปปลดล็อก
  - กดตรา/บอส = รายละเอียด (Side panel ≥ 900px · Bottom sheet บนมือถือ/แท็บเล็ตแนวตั้ง) · ปุ่มท้าทายบอส/แข่งเก็บแต้มเรียกระบบเดิม (เซิร์ฟเวอร์ตรวจสิทธิ์ทุกครั้ง)
  - ปุ่ม "กลับไปแรงค์ปัจจุบัน" · ซูม 3 ระดับ · จอกว้างขยายฉากสองข้าง · เปิดแล้วเลื่อนไปแรงค์ปัจจุบันอัตโนมัติ · ลดการเคลื่อนไหวได้ตามการตั้งค่าเครื่อง
- **หน้า Ranked ใหม่**: ตราใหญ่ · ชื่อไทย + Division · แต้มแรงค์ · แถบความคืบหน้า · "เป้าหมายถัดไป" (ขาดอีกกี่แต้ม / พร้อมท้าทายบอส) · สถิติ · การ์ดบอสเมื่อพร้อม · การ์ดเปิดแผนที่
  โปรไฟล์มีการ์ด "แรงค์ของฉัน" (ทั้งสองโหมด กดแล้วเปิดแผนที่)
- **นำโหมดทบทวนออกจากหน้าเว็บ**: เมนู/การ์ดหน้าแรก/หน้า/ป้ายจำนวน/ปุ่มในหน้าเรียน/แบนเนอร์ใน Ranked · ลิงก์เก่า `#/review` พาไปหน้าเรียน
  ไม่ลบข้อมูล: word_progress / ตาราง SRS / API `/progress/due` `/progress/review-session` `/ranked/matches/:id/review` ยังอยู่ครบ

## v1.2.0
- **Ranked ได้ EXP** (`config/battle.js` → `RANKED_EXP`): ชนะ 20 · เสมอ 15 · แพ้ 10 + ตอบถูกข้อละ 2 (เกมละ 10–40)
  ออกกลางเกม/หลุดไม่กลับ = 0 · เพดาน 300 EXP/วัน (เวลาไทย) · ลง `exp_log` reason `ranked_match` (นับในกระดานอันดับ EXP)
  ทุกโหมด (NPC · 1v1 · ทีม) · ผลเก็บใน `result.exp` · หน้าผลแสดง "+X EXP" และอัปเดตแถบเลเวลทันที (เลเวลอัปมีป๊อปอัป)
- **แจ้งเตือนบนโทรศัพท์** (`services/push.js`, `/api/notifications`, migration 035)
  - เปิดเองที่ โปรไฟล์ → การแจ้งเตือน (หรือการ์ดชวนในหน้าหลัก หลังเริ่มใช้งานแล้ว) · เลือกเวลา 06:00–21:30 ตามเขตเวลาของเครื่อง (ค่าเริ่ม 19:00)
  - วันละไม่เกิน 1 ครั้ง · วันที่เข้าแอปแล้วไม่เตือน · มีคำทบทวนถึงรอบ = บอกจำนวนแล้วพาไปหน้าทบทวน · ปุ่มทดสอบ
  - iPhone/iPad ต้องเพิ่มแอปลงหน้าจอโฮมก่อน (iOS 16.4+) — แอปแสดงวิธีทำ
  - VAPID key สร้างอัตโนมัติเก็บในฐานข้อมูล (หรือตั้ง env เอง) · ส่งได้เฉพาะบริการ push จริง (Google/Mozilla/Apple/Microsoft)
- **ป๊อปอัปแพตช์ล่าสุด** (`config/changelog.js`, `/api/changelog`) — เด้งครั้งเดียวต่อแพตช์ (จำที่บัญชี) · ผู้ใช้ใหม่ไม่เด้ง
  ดูย้อนหลังได้ที่ โปรไฟล์ → มีอะไรใหม่ · เพิ่มแพตช์ใหม่ = ใส่ object ใหม่ไว้บนสุดของ CHANGELOG
- **ทางเข้า Ranked เหลือที่เดียว** = เมนู "แรงค์" ด้านล่าง (เอาการ์ด Ranked Quest ออกจากหน้า "เล่น" แล้ว)
- **เพลงเริ่มเองเมื่อเปิดแอป** — ลองเริ่มทันที ถ้าเบราว์เซอร์ไม่อนุญาตจะเริ่มตอนแตะครั้งแรก (แตะครั้งเดียวพอ: นับ touchend/pointerup/click)
  กลับมาจากพื้นหลังแล้วเสียงถูกพัก -> แตะครั้งเดียวเล่นต่อ · iPhone ที่เปิดโหมดเงียบ (สวิตช์ข้างเครื่อง) เสียงจากเว็บจะไม่ดัง
- **ธีม "พาสเทล"** (`public/css/theme-cute.css`, `data-theme="cute"`) — ชมพูนม + ลายจุดพาสเทล · ปุ่มทรงเม็ดยา · ฟอนต์เดียวกับธีมอื่น (อ่านง่าย)
  เลือกได้ที่ โปรไฟล์ → การแสดงผล · ระบบมืดอัตโนมัติใช้ selector `:root:not([data-theme])` (ทำงานเฉพาะโหมด "ตามระบบ")
- **เมนูล่าง**: หน้าหลัก · เรียน · **แรงค์** (แทนเมนูทบทวน) · เล่น · โปรไฟล์ — ทบทวนย้ายไปอยู่ในหน้า "เรียน" (ปุ่มทบทวน + ป้ายจำนวนคำที่ถึงรอบ)
- **คำทักทาย** สุ่มตามช่วงเวลา (เช้า/สาย/บ่าย/เย็น/ดึก) + วันในสัปดาห์ + ทั่วไป (ไทย/อังกฤษ) — คำเดิมตลอดการเปิดแอปครั้งนั้น
- **เพิ่มเพื่อนจากกระดานอันดับ** (EXP และ Ranked): ปุ่มท้ายแถว → เพิ่มเพื่อน / ตอบรับ (ถ้าเขาขอมาก่อน) / ส่งแล้ว / แชท (ถ้าเป็นเพื่อนแล้ว)
  ใช้ `GET /api/friends/relations?ids=` (ถามทีเดียวทั้งหน้า) · คนที่บล็อกกันไม่มีปุ่ม
- **แชทกับเพื่อน** (`/api/chat`, migration 034 `direct_messages`) — ปุ่มแชทที่แถบบน (มีป้ายข้อความใหม่) · การ์ด "แชท" ในเมนูเล่น · ปุ่มแชทในรายชื่อเพื่อน
  - เฉพาะเพื่อนที่ตอบรับแล้วและไม่ได้บล็อก · ตัวอักษรล้วน ≤ 500 ตัว (escape ทุกครั้ง ไม่แปลงลิงก์) · 30 ข้อความ/นาที · เก็บ 180 วัน
  - realtime: `chat:message`, `chat:read` ("อ่านแล้ว") · รายงาน/บล็อกได้จากเมนู ⋯ ในห้องแชท · ระหว่างแข่ง Ranked ไม่เด้งแจ้งเตือน (มีแค่ป้าย)
- **คุยกับเพื่อนร่วมทีมใน Team Ranked 2v2** (แถบล่างระหว่างเกม — แสดงเมื่อมีเพื่อนร่วมทีมเป็นคนจริง)
  - พิมพ์: ≤ 120 ตัว + ปุ่มลัด (ข้อ 1–4 · ไม่แน่ใจ · มั่นใจ · สู้ ๆ) · ถึงเพื่อนร่วมทีมเท่านั้น ทีมตรงข้ามไม่เห็น · ไม่บันทึกลงฐานข้อมูล · 8 ข้อความ/10 วิ
  - เสียง: กดปุ่มไมค์เอง (ขอสิทธิ์ไมค์ตอนกดเท่านั้น) → WebRTC ตรงระหว่างสองเครื่อง เซิร์ฟเวอร์ส่งต่อแค่สัญญาณเชื่อมต่อ ไม่ได้รับ/บันทึกเสียง
    เพลงหรี่ลงระหว่างเปิดไมค์ · ปิดเสียงเพื่อนได้ · เกมจบ/ออกจากเกม = ปิดไมค์และตัดการเชื่อมต่อทันที
  - WS: `ranked:team_chat`, `ranked:voice`, `ranked:voice_peer`, `ranked:voice_signal` · ICE servers จาก env `RTC_ICE_SERVERS` (ไม่ตั้ง = Google STUN)
  - ข้อจำกัด: บางเครือข่าย (Wi-Fi องค์กร/โรงเรียน, 4G บางเจ้า) ต่อเสียงไม่ได้ถ้าไม่มี TURN server — แชทพิมพ์ยังใช้ได้เสมอ
  - `Permissions-Policy: microphone=(self)` (ไมค์ใช้ได้เฉพาะหน้าเว็บของเราเอง) · `camera=()`
- **คู่แข่งหลากหลายขึ้น** — League ที่มีคู่ฝึก (Trail Finch – Shadow Panther) มี 11–12 คนต่อ League, 9 สไตล์
  (Speedster · Careful Thinker · Word Collector · Grammar Nerd · Bookworm · All-rounder · Quick Guesser · Steady Climber · Streaky)
  สร้างแบบกำหนด seed ใน `config/rankedNpcs.js` (id คงที่) · แต่ละเกมมี "ฟอร์มวันนี้" แกว่งเล็กน้อย (seed เดิม = ผลเดิม)
- **ไอคอนแอป** จัดตัวละครให้อยู่กลาง (`scripts/build-app-icons.py`) · maskable อยู่ใน safe zone · เพิ่ม `?v=2` ให้มือถือโหลดไอคอนใหม่
- **"Quest Rating" เปลี่ยนชื่อที่แสดงเป็น "แต้มแรงค์" (หน่วย "แต้ม")** — ในโค้ด/DB ยังชื่อ quest_rating เหมือนเดิม
- **แยกโหมด Vocab / Grammar** — แรงค์ แต้มแรงค์ ประวัติ และกระดานอันดับแยกกัน (migration 033 · `ranked_profiles.mode`)
  - Vocab = คำแปลศัพท์ + เติมคำในบริบท · Grammar = แกรมม่า + บทอ่าน (บทอ่านเริ่มที่ B1)
  - โปรไฟล์เดิมถูกคัดลอกเป็นทั้งสองโหมด (ไม่มีใครเสียแรงค์ที่ไต่มา) · PvP/ทีม จับคู่เฉพาะโหมดเดียวกัน
- **ระบบ HP ปิดอยู่** (`config/battle.js` → `hpEnabled`, เปิดกลับได้ด้วย env `RANKED_HP=on`) — เล่นครบ 10 ข้อ ตัดสินด้วย ความแม่นยำ → คะแนน → เวลาเฉลี่ย → เสมอ
- **คู่แข่งในเกมปกติไม่มีป้าย NPC/PLAYER** — แสดงชื่อ อวตาร และแรงค์แบบเดียวกันทุกคน · Guardian/Apex ยังเป็นบอสประจำด่าน
  (หน้า "Ranked ทำงานอย่างไร" ยังบอกแบบรวม ๆ ว่าช่วงผู้เล่นน้อยระบบจับคู่กับคู่ฝึกในระดับเดียวกัน)


ค่าทั้งหมดอยู่ที่ `config/battle.js` (จุดเดียว) — ส่วนที่หน้าเว็บต้องใช้ส่งผ่าน `GET /api/ranked/config` → `battle`

## Battle HP
| กติกา | ค่า |
|---|---|
| HP เริ่มต้น | 100 ทุกแรงค์ ทุก NPC (แรงค์/ของตกแต่งไม่เพิ่ม HP, Damage, เวลา หรือคะแนน) |
| Damage | Easy 10 (คำศัพท์) · Normal 12 (บริบท/แกรมม่า) · Hard 15 (การอ่าน) · ข้อ TOEIC/TOEFL ยากขึ้นหนึ่งระดับ |
| ตอบถูก | ฝั่งตรงข้ามเสีย HP (+Combo: ข้อที่ 2 ติดกัน +1, ข้อที่ 3 +2, เพดาน +3) |
| ตอบผิด / หมดเวลา | ตัวเองเสีย HP (Damage พื้นฐาน) |
| ต่อข้อ | แต่ละฝั่งเสียไม่เกินหนึ่งครั้ง = max(Damage จากคำตอบถูกของคู่แข่ง, Damage จากคำตอบผิดของตัวเอง) — A ถูก B ผิด → B 100 → 88 |
| ความเร็ว | ไม่คูณ Damage — ใช้แค่ Battle Score และตัดสินเสมอ |
| จบเกม | HP 0 = แพ้ทันที · ครบทุกข้อ → HP ที่เหลือ → ความแม่นยำ → Battle Score → เวลาตอบเฉลี่ย → เสมอ |
| เกมทีม 2v2 | HP รวมทีม 100 · แต่ละคนทำ Damage × 0.5 · คนที่ออกแล้วไม่ทำ/ไม่รับ Damage · ออกทั้งทีม = แพ้ทันที |
| Critical | HP < 25% → แถบเปลี่ยนสี + pulse เบา ๆ + เพิ่ม music layer (ปิดตาม prefers-reduced-motion) |

เซิร์ฟเวอร์คำนวณทุกอย่าง (`services/ranked/battle.js`) — client ส่งได้แค่ `{ questionIndex, choiceIndex }` ฟิลด์ `damage`, `hp`, `enemyHp`, `qr`, `outcome` ที่ส่งมาถูกเพิกเฉย

## การเชื่อมต่อ / ออกจากเกม
- **Leave Match** (ยืนยันแล้ว) = Surrender ทันที · อีกฝ่าย = Victory by Forfeit
- **เน็ตหลุด** = grace 30 วินาที (หน้าจอ RECONNECTING + นับถอยหลัง · คู่แข่งเห็น "Opponent disconnected … 30 sec")
  - กลับมาทัน → ได้ Snapshot เดิม (ข้อปัจจุบัน · HP · คะแนน · เวลาที่เหลือ) ไม่เสีย QR · ไม่กลับมา → Defeat by Disconnect
  - เวลาข้อยังเดินตามนาฬิกาเซิร์ฟเวอร์ระหว่างหลุด (หลุดไปเปิดหาคำตอบไม่ได้เปรียบ)
- การตรวจจับ: WebSocket heartbeat ทุก 10 วิ · เกม NPC (REST) ส่ง ping ทุก 10 วิ — เงียบเกิน 15 วิ **และ** WebSocket ไม่ได้ต่ออยู่ = เริ่ม grace
  (แอปอยู่เบื้องหลังแต่ยังเชื่อมต่อ = ไม่นับว่าหลุด · ไม่ใช้ `visibilityState` ตัดสินเด็ดขาด)
- เกม NPC ค้างโดยไม่เล่นเกิน 10 นาที = timeout · เซิร์ฟเวอร์ deploy ใหม่ = เกม NPC ที่ค้างได้ grace ใหม่

## Quest Rating penalty
| กรณี | QR |
|---|---|
| แพ้ปกติ | Elo เดิม (≈ −12) · Trail Finch / Swift Hare III คุ้มครอง = 0 |
| Surrender / Disconnect / Timeout | −18 (ไม่ต่ำกว่าแพ้ปกติเสมอ) · Trail Finch −3 · Swift Hare −5 |
| ทิ้งเกมครั้งที่ 2 ใน 24 ชม. | × 1.25 |
| ครั้งที่ 3 ขึ้นไป | พัก Ranked 5 นาที (`users.ranked_cooldown_until`) |
| หลุดตอน HP นำอยู่ | แพ้ตามกติกา แต่ไม่นับเป็นการทิ้งเกมซ้ำ (น่าจะเป็นปัญหาเน็ต) · timeout ไม่นับ |

ประวัติแสดงผล 6 แบบ: Victory · Defeat · Draw · Victory by Forfeit · Defeat by Disconnect · Surrender

## ฐานข้อมูล (migration 032)
`ranked_matches`: start_hp, hp, hp_min, combo, final_hp_p1/p2, result_reason (hp_zero | questions_complete | disconnect | surrender | timeout | draw),
forfeit_reason, last_seen_at, disconnect_started_at, reconnect_deadline, disconnects, reconnects
`ranked_answers`: damage, damage_target · `ranked_match_players`: final_hp, forfeit_reason, counted_abandon, qr_penalty
`users`: ranked_cooldown_until, audio_settings

## Realtime / API
- เพิ่มใน event เดิม: `hp`, `hits`, `taken`, `ko` (`ranked:reveal`, `ranked:question`, `ranked:resume`, `ranked:team_*`)
- `ranked:opponent_status` มี `deadline` · `ranked:resume` / `team_resume` = snapshot (hp, scores, reveal, สถานะคนที่หลุด)
- `POST /api/ranked/matches/:id/ping` · `GET/PUT /api/ranked/audio-settings`
- Admin analytics → `battle`: HP เหลือเฉลี่ย, ระยะเวลาเกม, % จบด้วย HP 0 / ครบข้อ, อัตราหลุด, อัตรากลับมาทัน, Surrender, จำนวน penalty, comeback จาก HP วิกฤต

## Audio (`public/js/audio.js` → `window.EQAudio`)
- ระบบกลางเดียว: `music(category, { league })`, `sfx(name)`, `cue('victory'|'defeat'|'draw')`, `setCritical(bool)`, `openQuickMenu(anchor)`
- หมวดเพลง: lobby · matchmaking · battle (Beginner: Trail Finch–River Otter · Competitive: Crest Lynx–Moon Wolf · Elite: Shadow Panther–Crown Eagle · Apex: Aurora Lion) · promotion_trial · apex · critical layer · cues
- **ต้นฉบับทั้งหมด** สังเคราะห์สดด้วย Web Audio (ไม่มีไฟล์เสียงของผู้อื่น) — ข้อมูลลิขสิทธิ์ที่ `public/assets/audio/manifest.json`
- เพลงที่จ้างทำ/ซื้อ License: ใส่ `file` + ข้อมูล license ใน manifest → โหลดแบบ lazy และ loop ไร้รอยต่อ (ดู `public/assets/audio/LICENSES.md`)
- เริ่มหลังผู้ใช้แตะครั้งแรก · crossfade 0.9 วิ · พื้นหลัง = เบาลงแล้วพัก/เล่นต่อจากจุดเดิม · ออกจากหน้า Ranked = เพลงหยุด
- ตั้งค่า Master 70 / Music 55 / SFX 80 / Mute — ปุ่มลำโพงในเกม (Quick menu) และการ์ดในหน้าโปรไฟล์ · จำในเครื่องและในบัญชี
- เสียงไม่จำเป็นต่อการเล่น: ทุกผลมีข้อความ/ภาพ (เช่น "คุณเสีย 12 HP") · ตอบผิด = เสียงกลาง ๆ ไม่ใช่ buzzer · Critical ไม่มี alarm/เสียงหัวใจ

## เพลงในแอป (นอก Ranked)
- คนละชุดกับเพลง Ranked: **Morning Notebook** (`app_home` — หน้าหลัก เมนู ผลลัพธ์) และ **Quiet Study** (`app_study` — ระหว่างทำแบบฝึก/บทเรียน/สอบวัดระดับ ไม่มีกลอง)
- เปลี่ยนเพลงอัตโนมัติตามหน้า (crossfade) · เข้า Ranked = เพลง Ranked · ออกจาก Ranked = กลับเป็นเพลงในแอป
- ระหว่างอ่านออกเสียงคำศัพท์ (TTS) เพลงหรี่ลงเหลือ ~18% แล้วกลับเท่าเดิม
- ปุ่มลำโพงที่แถบบนของทุกหน้า → Quick menu (Master / Music / SFX / เพลงในแอป / Mute) · ตั้งค่า `appMusic` จำในเครื่องและในบัญชี

## กระดานอันดับ Ranked
- หน้า "อันดับ" (เมนูเล่น) มีตัวสลับ **EXP การเรียน | Ranked Quest**
- Ranked Leaderboard: Season · เพื่อน · สัปดาห์นี้ · Global — เข้าได้ทั้งจากหน้าอันดับและปุ่มลัดใต้ FIND MATCH ใน Lobby

## v1.4.0 — Matchmaking แรงค์สูง · เพื่อนบนแผนที่ · ประวัติ · กิจกรรม

### Matchmaking (`config/leagues.js → MATCHMAKING`)
- `highRankFromOrder` (env `RANKED_HIGH_RANK_FROM`, ค่าเริ่ม 6 = เสือดำพรางเงา): แรงค์ลำดับนี้ขึ้นไป **ผู้เล่นจริงเท่านั้น**
  — `POST /api/ranked/matches` (ranked/promotion) คืน `{ queue: true }` แทนการสร้างเกม NPC · คิวไม่ส่งข้อเสนอ NPC · ทีม 2v2 ไม่เติม NPC
- แมตช์เลื่อนแรงค์ของแรงค์สูง = ชนะ PvP ขณะอยู่สถานะรอเลื่อนแรงค์ (`applyOutcome({ pvp: true })`)
- ความห่างแรงค์: `leagueGapAllowed(a, b)` ใช้ลำดับของ Rank ID (ไม่ใช้ชื่อไทย) ต่างได้ไม่เกิน 1 (hard cap — รอนานก็ไม่ขยาย) · ทีมตรวจทั้ง 4 คน (`groupGapAllowed`) · ปาร์ตี้ห่างเกินเข้าคิวไม่ได้ (`RANK_GAP`)
- คิว: ค้นหาต่อจนเจอ · ยกเลิกได้ · หลุดเน็ตเก็บที่ไว้ `queueReconnectGraceMs` (env `RANKED_QUEUE_GRACE_MS`, 30 วิ) กลับมาแล้วได้ `ranked:queue { resumed: true }` · ไม่มีคิวซ้ำ/ห้องซ้ำ (ตรวจซ้ำก่อนสร้างเกม)
- UI ค้นหา: "กำลังค้นหาคู่แข่ง…" + เรดาร์ + ปุ่มยกเลิก — ไม่บอกว่าคู่เป็นผู้เล่นหรือ NPC

### เพื่อนบนแผนที่
- `GET /api/ranked/friends?mode=` เพื่อนที่ตอบรับแล้ว ไม่บล็อก ไม่ซ่อนแรงค์ · `GET/PUT /api/ranked/privacy { hideFromFriends }` (migration 036)
- แรงค์เพื่อนเปลี่ยน -> `ranked:friend_rank` (realtime) แผนที่โหลดใหม่ · เพื่อนแรงค์เดียวกันรวมเป็นกลุ่ม "+N" แตะดูรายชื่อ · ตัวกรอง ทั้งหมด/ฉัน/เพื่อน

### ประวัติ
- `GET /api/ranked/history?limit=&offset=` -> `{ matches, more, offset }` · Lobby แสดง 3 รายการ · หน้า `#/ranked-history` โหลดทีละ 20 · อ่านอย่างเดียว ไม่ลบข้อมูล

### กิจกรรม Halloween Adventure (`config/events.js`, `services/events.js`, migration 037–038)
- 4 Chapter + Final Challenge (หมู่บ้านฟักทอง → ป่าฟักทองลึกลับ → คฤหาสน์ผี → สุสานเวทมนตร์ → ปราสาทราชาฟักทอง) — จำนวนภารกิจ/เกณฑ์/เวลา/ชนิดโจทย์ ปรับได้ใน `CHAPTERS` และ `STAGES`
- Chapter ถัดไปปลดล็อกเมื่อภารกิจของ Chapter ก่อนครบ · ตัวนับ "อีก N รอบ/ข้อ" นับหลังเวลาปลดล็อก (คำนวณจากเวลาจริงของข้อมูล — ทุกเครื่องเห็นเหมือนกัน)
- ภารกิจ: `rounds` (จบเกม: Ranked NPC/PvP/ทีม, ห้องแข่ง, แกรมม่า, แบบทดสอบ, การ์ด 10 ข้อ) · `correct` (คำตอบที่ตรวจแล้วใน `answer_events` + ข้อที่ถูกในด่าน) · `goodRounds` (ความแม่นยำ ≥ 70%, ≥ 5 ข้อ) · `stages` (ผ่านด่านตามลำดับ)
- ด่าน: โจทย์จากคลังเดียวกับระบบเรียน (คำศัพท์/ไทย→อังกฤษ/เติมคำ/แกรมม่า/สะกดคำพิมพ์เอง/คำศัพท์ฮาโลวีน) ระดับ = CEFR ผู้เล่น + levelOffset · เฉลยเก็บที่เซิร์ฟเวอร์ · จับเวลาฝั่งเซิร์ฟเวอร์ · ส่งครั้งเดียว · ด่านความแม่นยำ (ห้ามผิด) · ด่านผสมทักษะ (ขั้นต่ำทุกหมวด) · เล่นค้างแล้วกลับมาเล่นต่อได้
- ตาราง: `events`, `event_activity` (+correct/total), `event_mission_progress`, `event_chapter_progress`, `event_challenge_attempts` (+stage_id/detail/time_ms), `event_reward_claims` (PK event+user), `user_themes`, `users.theme`
- เวลา: `EVENT_HALLOWEEN_2026_START` (ค่าเริ่ม 10 ต.ค. 2569) · สิ้นสุด 31 ต.ค. 2569 23:59:59 (เวลาไทย) · ตัดสินด้วยเวลาเซิร์ฟเวอร์เท่านั้น
- API: `GET /api/events` · `GET /api/events/:id` · `POST /:id/stages/:stageId/start` · `GET /:id/attempts/current` · `POST /:id/attempts/:attemptId/submit` · `POST /:id/claim` · `POST /:id/admin-grant` (แอดมิน) · `GET /api/themes` · `PUT /api/themes/current`
- หน้าเว็บ: `public/js/event.js` (แผนที่ผจญภัย) · `public/js/hwart.js` (ภาพ SVG ร่วม) · ธีม: `public/css/theme-halloween.css` + `public/js/halloween-fx.js` (ชั้นตกแต่งใต้เนื้อหา · โหมดเบาอัตโนมัติ `data-fx="lite"` · รองรับลดการเคลื่อนไหว)
- อัปเดตไฟล์โดยไม่เปลี่ยนเลขเวอร์ชันเกม: Service Worker ใหม่ทำงานเงียบ ๆ (ไม่แสดงแถบ "เวอร์ชันใหม่") — แถบจะแสดงเฉพาะเมื่อ `package.json` version เปลี่ยน
