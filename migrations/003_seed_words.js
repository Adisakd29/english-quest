/*
  Migration 003: ย้ายคำศัพท์จาก words.json เข้าตาราง words
  เป็น migration แบบ JS เพราะต้องอ่านไฟล์ JSON แล้วแปลงเป็นหลายแถว

  รับ client (อยู่ใน transaction ของ migrate.js อยู่แล้ว) — ถ้าพังจะ rollback ทั้งก้อน
  idempotent ด้วย ON CONFLICT ใน seedWords
*/
const path = require('path');
const { seedWords } = require(path.join(__dirname, '..', 'scripts', 'seed-words'));

async function run(client) {
  const n = await seedWords(client);
  console.log(`[migrate 003] ย้ายคำศัพท์เข้า DB ${n} คำ`);
}

module.exports = { run };
