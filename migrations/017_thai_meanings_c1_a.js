/* Migration 017: นำคำแปลไทยระดับ C1 (A–L) เข้า vocab_senses (เรียก applyThai ซ้ำ — idempotent, ไม่ทับงานของคน) */
const path = require('path');
const { applyThai } = require(path.join(__dirname, '..', 'scripts', 'oxford', 'apply_thai'));

async function run(client) {
  await applyThai(client);
}

module.exports = { run };
