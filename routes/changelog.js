/*
  แพตช์โน้ต — /api/changelog
    GET  /      { latestId, unseen, entries } — unseen = ควรเด้งป๊อปอัปไหม
    POST /seen  จำว่าเห็นแพตช์ล่าสุดแล้ว (ไม่เด้งอีกในทุกเครื่อง)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { CHANGELOG, LATEST_ID } = require('../config/changelog');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  try {
    const u = (await pool.query('SELECT changelog_seen, created_at FROM users WHERE id = $1', [req.userId])).rows[0];
    let unseen = u.changelog_seen !== LATEST_ID;
    // ผู้ใช้ใหม่: ทุกอย่างใหม่อยู่แล้ว -> จำว่าเห็นแล้วเงียบ ๆ (ไม่เด้งทับการเริ่มต้นใช้งาน)
    if (unseen && !u.changelog_seen && Date.now() - new Date(u.created_at).getTime() < 24 * 3600 * 1000) {
      await pool.query('UPDATE users SET changelog_seen = $1 WHERE id = $2', [LATEST_ID, req.userId]);
      unseen = false;
    }
    res.json({ latestId: LATEST_ID, unseen, entries: CHANGELOG.slice(0, 5) });
  } catch (err) {
    console.error('[changelog]', err);
    res.status(500).json({ error: 'โหลดแพตช์โน้ตไม่สำเร็จ' });
  }
});

router.post('/seen', async (req, res) => {
  try {
    await pool.query('UPDATE users SET changelog_seen = $1 WHERE id = $2', [LATEST_ID, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[changelog/seen]', err);
    res.status(500).json({ error: 'error' });
  }
});

module.exports = router;
