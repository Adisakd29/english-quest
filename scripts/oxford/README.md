# Oxford Vocabulary Pipeline

ฐานคำศัพท์ของ EnglishQuest สร้างจากเอกสาร Oxford 3000 / Oxford 5000 (Source of Truth)
สำหรับ **headword · ชนิดคำ · CEFR · คำใบ้ความหมาย · เลขคำพ้องรูป** เท่านั้น
(คำแปลไทย/นิยาม/ตัวอย่าง ไม่ได้มาจาก Oxford — ดู `translation_source` ในฐานข้อมูล)

```
PDF ─► parse_pdf.py ─► data/oxford/source_entries.json   (บรรทัดดิบ + บทบาทฟอนต์ + เลขหน้า)
    ─► normalize.py  ─► data/oxford/senses.json           (headword + lexical sense, ID คงที่)
    ─► validate.js   ─► reports/vocab_validation.md
                        reports/source_reconciliation.md
```

## รันซ้ำ

```bash
pip install pdfplumber                       # ใช้เฉพาะตอนสร้างข้อมูล (production ไม่ต้องมี Python)
npm run vocab:parse -- <oxford3000.pdf> <oxford5000.pdf>
npm run vocab:normalize
npm run vocab:validate                       # เทียบกับชุดข้อมูลเดิม
npm run vocab:validate -- --db               # เทียบกับฐานข้อมูลใหม่ (หลัง import)
```

ผลลัพธ์ **deterministic** — รันซ้ำได้ไฟล์เหมือนเดิมทุกไบต์ (ID คำนวณจากข้อมูลต้นฉบับ)

## ไฟล์ PDF

เป็นลิขสิทธิ์ของ Oxford University Press — **ไม่ commit เข้า repo**
ดาวน์โหลดได้จาก oxfordlearnersdictionaries.com (The Oxford 3000 / The Oxford 5000 by CEFR level)

## กติกา

- ห้ามเดา headword / ชนิดคำ / CEFR — ตีความไม่ชัด = `needsReview: true` + เหตุผล
- 1 บรรทัดในเอกสารอาจเป็นหลาย sense: `acid n. B2, adj. C1` → noun B2 + adjective C1
- ตัวพิมพ์ต่างกัน = คนละคำ (`March` ≠ `march`, `IT` ≠ `it`)
- เลขยกกำลังคำพ้องรูปเป็นส่วนหนึ่งของ identity (`close#1` ปิด ≠ `close#2` ใกล้)

## จุดผิดปกติในต้นฉบับที่ทราบแล้ว (5 รายการ, needsReview)

| ต้นฉบับ | การจัดการ |
|---|---|
| `seldom . C1` | ต้นฉบับไม่มีชนิดคำ → pos = null ไม่เดา |
| `specialize v. B1` | B1 ในรายการ 5000 (ปกติ B2–C1) ยืนยันจากภาพแล้ว → คงตามต้นฉบับ |
| `hatred n, C1` / `terminal n B2` | ตัวย่อขาดจุด → noun + flag |
| `worst adj.` (A2) | ชนิดคำพิมพ์ด้วยฟอนต์ตัวตรง → ตีความตามข้อความ + flag |

## สวิตช์แหล่งคำศัพท์ และการย้อนกลับ (V4)

| ตัวแปร Railway | ผล |
|---|---|
| (ไม่ตั้ง) หรือ `VOCAB_SOURCE=oxford` | ใช้ฐาน Oxford (ค่าเริ่มต้น) — ID แบบ `A1-S0001`, คำแปลจากฐานข้อมูล ไม่เรียกบริการแปลภายนอก |
| `VOCAB_SOURCE=legacy` | ใช้ชุดเดิม (ID แบบ `A1-0001`) — สำหรับย้อนกลับฉุกเฉินเท่านั้น หน้า Admin ใช้ไม่ได้ในโหมดนี้ |

**การย้ายความก้าวหน้าผู้ใช้**
- migration 021 ย้ายความก้าวหน้าจาก ID เดิมไป ID ใหม่ และสำรองแถวเดิมไว้ที่ `word_progress_legacy`
- ถ้าตั้ง `VOCAB_SOURCE=legacy` ตอน deploy จะ **ข้าม** การย้าย — และเมื่อสลับกลับเป็น oxford
  เซิร์ฟเวอร์จะย้ายแถวที่ค้างให้อัตโนมัติตอนเริ่มทำงาน (idempotent)

**ย้อนกลับเต็มรูปแบบ** (หลังย้ายความก้าวหน้าแล้ว)
1. `pg_dump` สำรองก่อน
2. รัน `migrations/021_migrate_progress_down.sql` — คืนความก้าวหน้าเดิมจาก `word_progress_legacy`
   (⚠️ สิ่งที่ผู้ใช้เรียนหลังย้ายด้วย ID ใหม่จะหาย)
3. ตั้ง `VOCAB_SOURCE=legacy` แล้ว redeploy
