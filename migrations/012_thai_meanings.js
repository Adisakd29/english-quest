/*
  Migration 012: นำคำแปลไทย (AI_GENERATED, unreviewed) เข้า vocab_senses
  ระดับที่เพิ่มภายหลังให้สร้าง migration ใหม่ที่เรียก applyThai ซ้ำ (idempotent)
*/
const path = require('path');
const { applyThai } = require(path.join(__dirname, '..', 'scripts', 'oxford', 'apply_thai'));

async function run(client) {
  await applyThai(client);
}

module.exports = { run };
