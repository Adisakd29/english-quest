// v1.6.0: นำเข้า Pilot Dataset ของคำศัพท์ C2 (idempotent · ไม่แตะแถว A1–C1)
// รายละเอียด: scripts/c2/import.js · ย้อนกลับ: 041_c2_vocab_down.sql (ลบแถว C2 ทั้งหมด)
const { importC2 } = require('../scripts/c2/import');

async function run(client) {
  await importC2(client, { log: (m) => console.log(m) });
}

module.exports = { run };
