/*
  Migration 067 (v1.10.0): เนื้อหาคำศัพท์ระดับผู้เรียน B2–C1 (2,972 ความหมาย · data/vocab-learner/out/batch-25..48)
  แบบเดียวกับ 061 (A1–B1): ความหมายภาษาอังกฤษแบบง่าย · ประโยคตัวอย่างใหม่ตรงความหมาย + คำแปลไทย · collocations · learner JSONB
  - ไม่แตะ A1–B1 (กันทับสิ่งที่ผู้ดูแลแก้ไว้หลัง 061) · สำรองค่าเดิมลง vocab_senses_prelearner_backup ก่อนแก้
  - คำแปลไทยที่ผู้ดูแลตรวจแล้ว (translation_status = 'reviewed') ไม่ถูกเขียนทับ · idempotent
  ย้อนกลับ: 067_learner_vocab_b2c1_down.sql
*/
const path = require('path');
const { applyLearner } = require(path.join(__dirname, '..', 'scripts', 'learner', 'apply'));

async function run(client) {
  await applyLearner(client, { levels: ['B2', 'C1'] });
}

module.exports = { run };
