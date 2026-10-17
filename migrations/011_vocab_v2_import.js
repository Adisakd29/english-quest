/*
  Migration 011: นำเข้าฐานคำศัพท์ Oxford (idempotent) — ดู scripts/oxford/import.js
  รันใน transaction ของ migrate.js ถ้าพังจะ rollback ทั้งก้อน
*/
const path = require('path');
const { importOxford } = require(path.join(__dirname, '..', 'scripts', 'oxford', 'import'));

async function run(client) {
  await importOxford(client);
}

module.exports = { run };
