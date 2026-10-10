/*
  Migration 021 (V4b): ย้ายความก้าวหน้าผู้ใช้จาก ID เดิม (A1-0001) ไป ID ใหม่ (A1-S0001)
  - สำรองไว้ที่ word_progress_legacy ก่อนเสมอ
  - ข้ามทั้งหมดถ้าตั้ง VOCAB_SOURCE=legacy (ไม่งั้นโหมดย้อนกลับจะเห็นความก้าวหน้าหาย)
*/
const path = require('path');
const L = require(path.join(__dirname, '..', 'scripts', 'oxford', 'legacy'));

async function run(client) {
  const sc = await L.copySenseCount(client);
  if (process.env.VOCAB_SOURCE === 'legacy') {
    console.log('[migrate 021] VOCAB_SOURCE=legacy — ข้ามการย้ายความก้าวหน้า (จะย้ายเมื่อสลับเป็น oxford)');
    return;
  }
  const r = await L.migrateProgress(client);
  console.log(`[migrate 021] sense_count ${sc} · สำรอง ${r.backedUp} · ย้าย ${r.inserted} แถวใหม่ · ลบแถวเดิมที่ย้ายแล้ว ${r.removedLegacy} · จับคู่ไม่ได้ (คงไว้) ${r.unmappedKept} · ประวัติคำตอบ ${r.answerEvents}`);
}

module.exports = { run };
