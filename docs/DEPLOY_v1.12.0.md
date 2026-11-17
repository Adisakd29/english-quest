# คู่มือขึ้น production — v1.11.0 → v1.12.0 (หมวดคำศัพท์ตามเทศกาล)

**ประเภท:** เลขรอง (ฟีเจอร์ใหม่ + migration เพิ่มตาราง) — ไม่แตะ word_progress / Unit / EXP / Coin / inventory / แรงค์
**คำขอ (2 พ.ย. 2569):** "เพิ่มหมวดหมู่คำศัพท์วันฮาโลวีนกับวันลอยกระทงเข้ามาในโหมด vocabulary"

## สิ่งที่เพิ่ม
- หน้าเรียน (เส้นทางการเรียน) มีแถบ **"หมวดคำศัพท์ตามเทศกาล"** — การ์ด วันฮาโลวีน · วันลอยกระทง
- `#/themes` หน้ารวม 2 หมวด (ความคืบหน้า "จำได้แล้ว" · ความแม่นยำ) · `#/themes/<halloween|loykrathong>` รายการคำ 40 คำ/หมวด:
  คำ · ชนิดคำ · คำแปล · ประโยคตัวอย่าง + คำแปล · ปุ่มฟังเสียง (TTS ของเครื่อง)
- แบบฝึก 10 ข้อ/ชุด 3 แบบ: ความหมาย (อังกฤษ→ไทย) · คำจากคำแปล (ไทย→อังกฤษ) · เติมคำในประโยค
  ตรวจที่เซิร์ฟเวอร์ · ไม่ส่งเฉลยก่อนตอบ · ตัวลวงไม่มาจากกลุ่มความหมายเดียวกัน (เช่น scary/spooky, foam/plastic) · คำที่ยังไม่เคยฝึก/ยังจำไม่ได้มาก่อน
- เปิดได้ตลอดปี ไม่ผูกกับช่วงกิจกรรม · **ไม่ให้ EXP/Coin** (เหมือนอังกฤษเพื่อการทำงาน) · แยกจากเส้นทางการเรียน (ไม่นับ Unit/การปลดล็อกระดับ)

## เนื้อหา
- `data/theme-vocab/halloween.json` · `data/theme-vocab/loykrathong.json` — เขียนขึ้นใหม่ (ไม่คัดลอกจากพจนานุกรม)
- ลอยกระทง: ต่อยอดจากคำศัพท์ธีมเทศกาล v1.10.0 (40 คำเดิม) · ไม่มีพลุ/โคมลอย/แอลกอฮอล์ · เน้นความปลอดภัยริมน้ำและกระทงรักษ์โลก
- ฮาโลวีน: เหมาะทุกวัย (ไม่มีเนื้อหารุนแรง)
- ตรวจด้วย `node scripts/theme-vocab/validate.js` (ประโยคต้องมีคำศัพท์จริง · ไม่มีคำ/คำแปลซ้ำ · ตัวลวงพอ) — เซิร์ฟเวอร์ตรวจซ้ำตอนโหลด รายการที่ผิดถูกตัดทิ้ง
- **ควรให้ครู/ผู้ดูแลอ่านทวนคำแปลและประโยคตัวอย่างก่อนประกาศ** (ผู้เขียนตรวจเองแล้ว แต่ยังไม่มีคนอื่นตรวจ)

## Migration
`068_theme_vocab.sql` — **เพิ่มตารางใหม่อย่างเดียว**: `theme_vocab_progress` · `theme_vocab_sessions` (ไม่แก้/ลบตารางเดิม)

## API ใหม่ (ต้องเข้าสู่ระบบ · userId จาก token)
`GET /api/theme-vocab` · `GET /api/theme-vocab/categories/:id` · `POST /api/theme-vocab/categories/:id/quiz` ·
`GET /api/theme-vocab/quiz/:sid` · `POST /api/theme-vocab/quiz/:sid/answer` · `POST /api/theme-vocab/quiz/:sid/finish`

## ไฟล์
- ใหม่: `services/themeVocab/{index,validator}.js` · `routes/themeVocab.js` · `scripts/theme-vocab/validate.js` · `data/theme-vocab/*.json` ·
  `public/js/themevocab.js` · `public/css/themevocab.css` · `migrations/068_theme_vocab{,_down}.sql` · `test/theme-vocab.test.js` · `test/e2e/themevocab_e2e.py`
- แก้: `app.js` (mount `/api/theme-vocab`) · `public/index.html` (แถบในเส้นทางการเรียน + `screen-themes`) · `public/js/app.js` (route `themes`) · `public/sw.js` · `config/changelog.js` · `package.json`

## ขั้นตอน
- [ ] สำรองฐานข้อมูล
- [ ] deploy → log `[migrate] 068_theme_vocab.sql` · `/api/health` = `1.12.0`
- [ ] หน้าเรียน → แถบ "หมวดคำศัพท์ตามเทศกาล" → วันลอยกระทง → ฝึก 10 ข้อ จนจบ

## ย้อนกลับ
deploy v1.11.0 กลับได้ทันที (ตารางใหม่ไม่ถูกใช้ ไม่กระทบ) · ถ้าต้องการลบตารางด้วย: รัน `migrations/068_theme_vocab_down.sql`
