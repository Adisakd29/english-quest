/*
  Migration 020 (V4a): เชื่อมฐานคำศัพท์เดิมกับฐานใหม่ — ยังไม่สลับแอป
  1. ID สาธารณะ A1-S0001 ให้ทุก sense
  2. vocab_legacy_map: ID เดิม -> sense ใหม่ (จับไม่ได้ = unmatched, ไม่เดา)
  3. ย้ายหัวข้อ / IPA / ความหมาย WordNet ไปยัง sense ที่ชนิดคำตรงกัน (ไม่ทับข้อมูลเดิม)
  ตารางเดิมไม่ถูกแก้ไข
*/
const path = require('path');
const L = require(path.join(__dirname, '..', 'scripts', 'oxford', 'legacy'));

async function run(client) {
  const ids = await L.assignPublicIds(client);
  const map = await L.buildLegacyMap(client);
  const content = await L.copyLegacyContent(client);
  console.log(`[migrate 020] public_id ${ids} · legacy ${map.legacyEntries} รายการ -> ${map.mappings} sense · ${JSON.stringify(map.byType)}`);
  console.log(`[migrate 020] ย้ายเนื้อหา: หัวข้อ ${content.topic} · IPA ${content.ipa} · ความหมาย ${content.definition} · คำแปลที่ตรวจแล้ว ${content.legacyThai}`);
}

module.exports = { run };
