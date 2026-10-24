// v1.6.0 (ขยาย): นำเข้าคลัง C2 รอบที่ 1 (batch-9 … batch-21) — ใช้ตัวนำเข้าเดิม (idempotent)
// เซิร์ฟเวอร์ที่รัน 042 ไปแล้วตอนคลังมี 244 รายการ จะได้รายการใหม่จากไฟล์นี้ · public_id เดิมไม่เปลี่ยน · แถวที่คนตรวจแล้วไม่ถูกทับ
const { importC2 } = require('../scripts/c2/import');

async function run(client) {
  await importC2(client, { log: (m) => console.log(m) });
}

module.exports = { run };
