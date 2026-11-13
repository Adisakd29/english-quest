# EnglishQuest — รายงานสรุปการปรับปรุงครั้งใหญ่ (V1–V7)

14 commits ต่อจาก Phase 4A · `npm test` **110/110** · error ใน log 0
รายงานประกอบ: `vocab_validation.md` · `source_reconciliation.md` · `source_reconciliation_db.md` · `vocab_import_qa.md` · `thai_summary.md` · `thai_A1..C1_review.md` · `migration_report.md`

## PART 1 — คำศัพท์จาก Oxford

| # | เกณฑ์ | สถานะ | หลักฐาน |
|---|---|---|---|
| 1 | คำศัพท์มาจาก PDF ครบทุกรายการ | ✅ | 5,307 บรรทัด ยืนยัน 3 วิธี (pdfplumber, poppler, นับด้วยตาหน้า 8 = 75) |
| 2 | ไม่มีคำนอก Oxford ปนโดยไม่ระบุ | ✅ | supplemental = 0, constraint `ck_vocab_supplemental` |
| 3 | CEFR ตรงต้นฉบับ | ✅ | `validate --db`: CEFR ไม่ตรง 0 (ชุดเดิมผิด 10 — แก้แล้ว) |
| 4 | Part of Speech ตรงต้นฉบับ | ✅ | POS ไม่ตรง 0 |
| 5 | คำหลายความหมายแยก sense | ✅ | 4,965 headwords / 5,947 senses (bank money A1 / river B1) |
| 6 | คำแปลไทยตรงตามความหมาย | ✅* | 5,947/5,947 · *AI_GENERATED/unreviewed ทั้งหมด |
| 7 | คำแปลไม่แน่ใจถูก flag | ✅ | 646 (10.9%) ทุกรายการมีเหตุผล · ไม่ใช้ในแบบทดสอบจนครูตรวจ |
| 8 | ไม่มีคำซ้ำผิดพลาด | ✅ | senseId ไม่ซ้ำ · ซ้ำแยกไม่ออก 0 · March ≠ march |
| 9 | ความก้าวหน้าผู้ใช้ไม่สูญหาย | ✅ | 63 → 73 แถว (สำรอง `word_progress_legacy`) · EXP ไม่เปลี่ยน · ID เดิมจับคู่ได้ 5,322/5,322 |

## PART 2 — UI/UX

| # | เกณฑ์ | สถานะ | หลักฐาน |
|---|---|---|---|
| 10–11 | สดใส มีสีสัน ไม่ดูเด็ก | ✅ | ธีมสว่าง + Plus Jakarta Sans/Noto Sans Thai (เลิก Fredoka) |
| 12 | ตัวอักษรใหญ่ขึ้น | ✅ | body 17px มือถือ / 18px เดสก์ท็อป (วัดจากเบราว์เซอร์) |
| 13 | ใช้งานบนมือถือดี | ✅ | 8 หน้า × 6 ขนาด: ล้นจอ 0 · ปุ่ม < 40px: 0 |
| 14 | Vocabulary Card อ่านง่าย | ✅ | progressive disclosure + ความหมายอื่น + แหล่งข้อมูล |
| 15 | ค้นหา/กรองคำศัพท์ | ✅ | ค้นอังกฤษ+ไทย · ระดับ/ชนิดคำ/สถานะ/รายการ |
| 16 | ฟีเจอร์เดิมทำงานครบ | ✅ | 110 เทสต์ + e2e บนข้อมูลจริง |
| 17 | สีเป็นระบบ | ✅ | design tokens · ทุกคู่ผ่าน WCAG AA (ต่ำสุด 5.0:1) |
| 22 | ปุ่ม ≥ 44px + state | ✅ | hover/active/focus/disabled |
| 24 | ไม่มี horizontal scroll | ✅ | 0 ทั้ง 48 หน้าจอ |
| 25 | Navigation | ⚠️ | ล่าง (มือถือ) / บน (เดสก์ท็อป) ✅ — แต่ยังเป็น 5 ปุ่มเดิม ไม่ใช่ Home/Learn/Review/Battle/Profile |
| 26 | Reduced motion | ✅ | `prefers-reduced-motion` · ไม่มี Dark mode (ระบบเดิมไม่มี) |
| 27 | Accessibility | ✅ | focus ring · ✓/✗ ร่วมกับสี · label สำหรับ screen reader |

## PART 3 — Google Login

| # | เกณฑ์ | สถานะ | หลักฐาน |
|---|---|---|---|
| 28 | ปุ่ม Continue with Google | ✅ | หน้าเข้าสู่ระบบ/สมัคร · ซ่อนเมื่อไม่ตั้งค่า |
| 29 | ไม่เขียน OAuth เอง | ✅ | Google Identity Services + google-auth-library 11.1.0 |
| 30 | ทุกกรณีทดสอบ | ✅ | 8 เทสต์: ใหม่ · เดิม · อีเมลซ้ำไม่เชื่อมอัตโนมัติ · ยกเลิก/ปลอม/ไม่ยืนยัน · เชื่อม/ยึดไม่ได้ · ไม่มีรหัสผ่าน · logout-all · ไม่ได้ตั้งค่า |

## บั๊กที่พบและแก้ระหว่างทาง (นอกเหนือขอบเขตงานเดิม)

| บั๊ก | ผลกระทบ | พบจาก |
|---|---|---|
| ช่วงทบทวน SRS ไม่มีเพดาน | ตอบถูกคำเดิมครั้งที่ 17 → 500 | error ที่ซ่อนใน log ของเทสต์ |
| คำที่รู้ก่อนมี SRS ถูกลดสถานะเมื่อตอบถูก | **คำที่รู้แล้วทั้งหมดของผู้ใช้จริง 48 แถว** | e2e บนข้อมูลจริง |
| XSS ใน leaderboard | สคริปต์ในชื่อผู้ใช้ทำงานบนเครื่องผู้ชมทุกคน | ทดสอบในเบราว์เซอร์ (พิสูจน์กับโค้ดเดิมแล้ว) |
| บัญชีไม่มีรหัสผ่าน + ล็อกอิน → 500 | — (ป้องกันก่อนเปิด Google) | อ่านโค้ด |
| เทสต์ exploit ผ่านด้วยเหตุผลผิด | ปิดบังบั๊ก SRS มาตั้งแต่ Phase 0 | ตรวจสถานะคำขอทุกครั้ง |
| คำแปล "shopping = เชิญปาร์ตี้" | ผู้เรียนจำผิด | เลิกใช้ MyMemory |

## ข้อจำกัดที่ยังเหลือ

1. คำแปลไทยทั้ง 5,947 sense เป็น AI_GENERATED — ควรให้ครูตรวจผ่านหน้า Admin (เริ่มจาก flag ของ A1: 75 คำ)
2. หน้า Battle ระหว่างเล่น / บทเรียนแกรมม่าด้านใน / Admin ได้ธีมใหม่แต่ยังไม่ได้ตรวจด้วยตาทีละหน้า
3. เมนูยังเป็น 5 ปุ่มเดิม · ไม่มี Dark mode
4. ภาพหน้าจอในแซนด์บ็อกซ์ใช้ฟอนต์สำรอง และทดสอบปุ่ม Google จริงไม่ได้ (บล็อก accounts.google.com) — ต้องทดสอบหลัง deploy ตาม `docs/GOOGLE_LOGIN_SETUP.md` ข้อ 5

## ขั้นตอน Deploy

1. **`pg_dump` สำรองฐานข้อมูล production ก่อน** (มี migration 010–023 รวม 14 ตัว)
2. Push ขึ้น GitHub → Railway deploy อัตโนมัติ (migration รันเองตอนเริ่ม ~20 วินาที)
3. ตรวจ log: `[migrate] ✓ 023` และ `[wordStore] โหลดคำศัพท์ Oxford 5947 sense`
4. ทดสอบ: เข้าสู่ระบบ → ฝึก flashcard 1 รอบ → ค้นหาคำ "bank" → เปิดหน้า Admin (ถ้าตั้ง `ADMIN_EMAILS`)
5. (ไม่บังคับ) ตั้ง `GOOGLE_CLIENT_ID` ตาม `docs/GOOGLE_LOGIN_SETUP.md`

**ย้อนกลับฉุกเฉิน:** ตั้ง `VOCAB_SOURCE=legacy` (รายละเอียดใน `scripts/oxford/README.md`) · ธีม: ลบ 2 บรรทัด `theme*.css` ใน `index.html`
