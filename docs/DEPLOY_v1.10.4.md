# คู่มือขึ้น production — v1.10.3 → v1.10.4 (แพตช์)

**ประเภท:** แพตช์หน้าเว็บ/ภาพ — ไม่มี migration · ไม่มี env ใหม่ · ไม่แตะข้อมูลผู้ใช้ · ไม่เปลี่ยน item ID

| เรื่อง | ไฟล์ |
|---|---|
| เอฟเฟกต์ที่ขยับได้ (หิ่งห้อยบินวน + แสงกะพริบ · กระทงลอยหมุนช้า ๆ) — แปลง SkinnedMesh ของเอฟเฟกต์เป็น Mesh ใต้ pivot ที่ติดกระดูกเดิม (ท่าหยุดนิ่งตรงตำแหน่งเดิม ตรวจด้วย `_fx().restErr` = 0) · ปิดเมื่อ `prefers-reduced-motion` · เอฟเฟกต์อื่นนิ่งเหมือนเดิม | `public/js/avatar3d.js` (`FX_MOTION`, `motionize`, `stepFx`) |
| สร้อยลูกปัด/มาลัยมะลิ 2D ย้ายไปข้อมือซ้าย (ตรงกับ 3D) | `scripts/avatar/art_v2.js` · `scripts/avatar/art_lk26.js` → `public/assets/avatar/items/acc_bead_bracelet.svg`, `acc_lk26_jasmine.svg` · `data/avatar/catalog.json` (hash ของ 2 ชิ้นนี้เท่านั้น) |
| การทดสอบ World: จำกัดเวลาขั้นปิดหน้า (กันค้างทั้งชุด) | `test/e2e/world_e2e.py` |
| แพตช์โน้ต/เวอร์ชัน | `config/changelog.js` · `package.json` |

## ขั้นตอน
- [ ] deploy → `/api/health` = `1.10.4`
- [ ] ตู้เสื้อผ้า: สวม "หิ่งห้อยคืนเพ็ญ" (ถ้ามี) หรือดูตัวอย่างจากหน้าตะลุยด่าน → หิ่งห้อยบินวนรอบตัว

## ย้อนกลับ
deploy v1.10.3 กลับได้ทันที (ไม่มีการแก้ฐานข้อมูล)
