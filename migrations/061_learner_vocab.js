/*
  Migration 061 (v1.10.0 Phase 2): เนื้อหาคำศัพท์ระดับผู้เรียน A1–B1
  ความหมายภาษาอังกฤษแบบง่าย · ประโยคตัวอย่างเขียนใหม่ตรงความหมาย + คำแปลไทย · collocations · ข้อมูลสำหรับแบบฝึก (learner JSONB)
  ดู scripts/learner/apply.js · ย้อนกลับ: 061_learner_vocab_down.sql
*/
const path = require('path');
const { applyLearner } = require(path.join(__dirname, '..', 'scripts', 'learner', 'apply'));

async function run(client) {
  await applyLearner(client);
}

module.exports = { run };
