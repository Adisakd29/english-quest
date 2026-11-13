/*
  v1.21.0 กรอบโปรไฟล์ / กรอบแชท / รางวัลทุก 10 เลเวล — /api/cosmetics
  userId จาก token เท่านั้น · ราคา/เงื่อนไขอยู่ฝั่งเซิร์ฟเวอร์ (หน้าเว็บส่งราคา/จำนวน Coin เองไม่ได้)
*/
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const COS = require('../services/cosmetics');

const router = express.Router();
router.use(authRequired);
const limiter = createLimiter({ limit: 60, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`cos:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (tag, fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (err) {
    if (err instanceof COS.CosmeticError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[cosmetics/${tag}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};
const b = (req) => req.body || {};

router.get('/', wrap('catalog', (req) => COS.catalog(req.userId)));
router.post('/purchase', limited, wrap('purchase', (req) => COS.purchase(req.userId, b(req).itemId)));
router.post('/equip', limited, wrap('equip', (req) => COS.equip(req.userId, b(req).kind, b(req).itemId === null || b(req).itemId === undefined ? null : b(req).itemId)));
router.get('/level-rewards', wrap('levels', (req) => COS.levelRewards(req.userId)));
router.post('/level-rewards/claim-all', limited, wrap('claim-all', (req) => COS.claimAll(req.userId)));
router.post('/level-rewards/:level/claim', limited, wrap('claim', (req) => COS.claim(req.userId, req.params.level)));

module.exports = router;
