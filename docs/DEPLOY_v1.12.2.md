# คู่มือขึ้น production — v1.12.1 → v1.12.2 (คำศัพท์ตามเทศกาล: ระดับยาก)

**ประเภท:** แพตช์ · **ไม่มี migration** · ไม่แตะ EXP / Coin / ความคืบหน้าเดิม
**คำขอ (3 พ.ย. 2569):** "คำศัพท์เกี่ยวกับวันฮาโลวีนกับวันลอยกระทงง่ายไปอยากให้มีระดับยาก"

## สิ่งที่เพิ่ม
- เทศกาลละ 2 ระดับ: **พื้นฐาน** (เดิม 40 คำ) + **ยาก** (ใหม่ 40 คำ · ทุกคำกำกับระดับ CEFR B2/C1/C2)
  - `data/theme-vocab/halloween-hard.json` (hx-01…40) — eerie · ominous · apparition · folklore · incantation · nocturnal · masquerade …
  - `data/theme-vocab/loykrathong-hard.json` (lx-01…40) — commemorate · heritage · illuminate · buoyant · sustainable · decompose · precaution …
  - ไม่ซ้ำคำในระดับพื้นฐาน · ลอยกระทงยังไม่มีพลุ/โคมลอย/แอลกอฮอล์ (มีชุดทดสอบตรวจ)
- หน้าหมวด: ปุ่มสลับ "พื้นฐาน A1–B1 / ยาก B2–C2" · หน้ารวมแสดง 4 หมวด · ป้าย CEFR ทุกคำและในโจทย์
- แบบฝึกระดับยาก: ทายความหมาย 5 ตัวเลือก (เหมือนระดับพื้นฐาน) · ความคืบหน้าแยกตามคำ (ตารางเดิม)
- **ควรให้ครู/ผู้ดูแลอ่านทวนคำแปลและประโยค 80 คำใหม่ก่อนประกาศ** (ผู้เขียนตรวจเองแล้ว)

## ไฟล์
`data/theme-vocab/*-hard.json` · `services/themeVocab/{index,validator}.js` · `public/js/themevocab.js` · `public/css/themevocab.css` · `public/index.html` (ข้อความการ์ด) · `config/changelog.js` · `package.json` · ชุดทดสอบ

## ขั้นตอน
- [ ] deploy → `/api/health` = `1.12.2`
- [ ] หน้าเรียน → วันฮาโลวีน → แตะ "ยาก" → 40 คำ → ฝึก 10 ข้อ

## ย้อนกลับ
deploy v1.12.1 กลับได้ (ความคืบหน้าของคำระดับยากที่บันทึกไว้แล้วยังอยู่ในตาราง แต่ไม่แสดง)
