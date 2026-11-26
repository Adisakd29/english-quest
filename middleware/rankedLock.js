/*
  v1.18.4 ระหว่างอยู่ในเกม Ranked ปิดการค้น/เปิดความหมายคำศัพท์ในแอปชั่วคราว (กันสคริปต์ค้นคำตอบจากแอปเอง)
  ใช้กับ /api/vocab, /api/words, /api/word-atlas/words, /api/translate, /api/theme-vocab, /api/flashcards · เกมจบแล้วใช้ได้ตามปกติ · ฐานข้อมูลมีปัญหา = ปล่อยผ่าน (ไม่ทำให้แอปใช้ไม่ได้)
*/
async function blockDuringRanked(req, res, next) {
  try {
    if (!req.userId) return next();
    const { activeMatchId } = require('../services/ranked/matchService');
    if (await activeMatchId(req.userId)) {
      return res.status(423).json({ error: 'ปิดการค้นหาคำศัพท์ชั่วคราวระหว่างแข่ง Ranked — จบเกมแล้วใช้ได้ตามปกติ', code: 'RANKED_IN_PROGRESS' });
    }
    return next();
  } catch (_) { return next(); }
}
module.exports = { blockDuringRanked };
