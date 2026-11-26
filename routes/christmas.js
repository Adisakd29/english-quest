/*
  Christmas 2026 — /api/christmas (ผู้เล่น) · /api/admin/christmas (ผู้ดูแลเท่านั้น)
  userId มาจาก token เท่านั้น · ราคา/รางวัล/ความคืบหน้าคำนวณฝั่งเซิร์ฟเวอร์ (หน้าเว็บส่งแค่ "อยากรับ/อยากซื้ออะไร")
*/
const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const xm = require('../services/christmas');

const limiter = createLimiter({ limit: 30, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`xmas:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป ลองใหม่อีกครั้ง', code: 'RATE_LIMIT' }) : next());
function fail(res, err, where) {
  if (err instanceof xm.XmasError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(`[christmas/${where}]`, err);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
}

const me = express.Router();
me.use(authRequired);
me.get('/', async (req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await xm.state(req.userId)); } catch (e) { fail(res, e, 'state'); } });
me.post('/checkin', limited, async (req, res) => { try { res.json(await xm.checkin(req.userId)); } catch (e) { fail(res, e, 'checkin'); } });
me.post('/quests/:id/claim', limited, async (req, res) => { try { res.json(await xm.claimQuest(req.userId, String(req.params.id).slice(0, 24))); } catch (e) { fail(res, e, 'quest'); } });
me.post('/starter', limited, async (req, res) => { try { res.json(await xm.claimStarter(req.userId)); } catch (e) { fail(res, e, 'starter'); } });
me.post('/shop/:id/buy', limited, async (req, res) => { try { res.json(await xm.buy(req.userId, String(req.params.id).slice(0, 40))); } catch (e) { fail(res, e, 'buy'); } });

// v1.25.1 P1: Advent Calendar · Boss · Story (โจทย์/เฉลยฝั่งเซิร์ฟเวอร์)
const play = require('../services/christmasPlay');
const gameLimiter = createLimiter({ limit: 120, windowMs: 60 * 1000 });
const glimited = (req, res, next) => (gameLimiter.check(`xmg:${req.userId}`) ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป', code: 'RATE_LIMIT' }) : next());
me.get('/play', async (req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await play.state(req.userId)); } catch (e) { fail(res, e, 'play'); } });
me.post('/advent/:day/start', limited, async (req, res) => { try { res.json(await play.adventStart(req.userId, req.params.day)); } catch (e) { fail(res, e, 'advent-start'); } });
me.post('/advent/answer', glimited, async (req, res) => { try { res.json(await play.answer(req.userId, 'advent', req.body || {})); } catch (e) { fail(res, e, 'advent-answer'); } });
me.post('/boss/start', limited, async (req, res) => { try { res.json(await play.bossStart(req.userId)); } catch (e) { fail(res, e, 'boss-start'); } });
me.post('/boss/answer', glimited, async (req, res) => { try { res.json(await play.answer(req.userId, 'boss', req.body || {})); } catch (e) { fail(res, e, 'boss-answer'); } });
me.get('/story/:id', async (req, res) => { try { res.json(await play.storyChapter(req.userId, String(req.params.id).slice(0, 8))); } catch (e) { fail(res, e, 'story'); } });
me.post('/story/:id/submit', limited, async (req, res) => { try { res.json(await play.storySubmit(req.userId, String(req.params.id).slice(0, 8), (req.body || {}).answers)); } catch (e) { fail(res, e, 'story-submit'); } });

const admin = express.Router();
admin.use(authRequired, requireAdmin);
admin.get('/', async (_req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await xm.adminGet()); } catch (e) { fail(res, e, 'admin-get'); } });
admin.post('/story/:id/review', async (req, res) => { try { res.json(await play.adminApprove(req.userId, String(req.params.id).slice(0, 8), (req.body || {}).approve !== false)); } catch (e) { fail(res, e, 'story-review'); } });
admin.put('/', async (req, res) => { try { res.json(await xm.adminUpdate(req.userId, req.body || {})); } catch (e) { fail(res, e, 'admin-put'); } });

module.exports = { me, admin };
