/*
  Game Lobby API — GET /api/lobby (v1.16.0)
  ข้อมูลหน้าแรกแบบ Game Lobby ในคำขอเดียว · userId จาก JWT เท่านั้น
  - account: Level / EXP (คำนวณจาก users.exp) · Coin (coin_wallets — อ่านอย่างเดียว ไม่สร้าง/แก้)
  - rank:    ลีก Ranked ของทั้งสองโหมด (vocab/grammar) — ใช้ฟังก์ชันเดียวกับ /api/ranked/me
  - quests:  เควสต์ประจำวันจาก "กิจกรรมจริงของวันนี้" (เวลาไทย) — ไม่มีรางวัลปลอม: แสดงเป็นเป้าหมาย/ความคืบหน้าเท่านั้น
  - events:  กิจกรรมที่กำลังจัด/กำลังจะเริ่ม (ไม่รวมที่เลิกแสดง)
  - friends: เพื่อนออนไลน์ (นับจากการเชื่อมต่อจริง)
  - chat:    ข้อความแชทโลกล่าสุด 3 ข้อความ (ผ่านตัวกรองเดียวกับหน้าแชท: ซ่อนคนที่บล็อก/ปิดเสียง)
  ไม่มีตำแหน่ง/การเดิน/ห้องใด ๆ (EnglishQuest World ถูกนำออกแล้ว)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/leveling');
const realtime = require('../realtime');
const leagues = require('../config/leagues');
const svc = require('../services/ranked/matchService');
const ev = require('../services/events');
const chat = require('../services/worldChat');
const carousel = require('../services/eventCarousel');
const { createLimiter } = require('../utils/rateLimit');
const { DAILY_GOAL_ANSWERS } = require('../config/coinRewards');

const router = express.Router();
router.use(authRequired);

const TODAY = `(date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`;
const GRAMMAR_DAILY = 5;
const RANKED_DAILY = 1;
const badgeUrl = (league) => (league ? `/assets/ranks/${encodeURIComponent(league)}/badge-96.webp` : null);

async function rankOf(userId) {
  const out = {};
  for (const m of leagues.MODE_IDS) {
    try {
      const { row } = await svc.getOrCreateProfile(userId, m);
      out[m] = { league: row.league, label: leagues.labelOf(row.league, row.division_index), questRating: row.quest_rating, badge: badgeUrl(row.league) };
    } catch (_) { out[m] = null; }
  }
  return out;
}

function bestRankLabel(rank) {
  const list = Object.values(rank || {}).filter(Boolean).sort((a, b) => (b.questRating || 0) - (a.questRating || 0));
  return list[0] ? list[0].label : null;
}

router.get('/', async (req, res) => {
  const uid = req.userId;
  try {
    const [user, wallet, today, ranked, friends, rank, chatView] = await Promise.all([
      pool.query('SELECT username, exp FROM users WHERE id = $1', [uid]),
      pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [uid]),
      pool.query(
        `SELECT COUNT(*)::int AS answers, COUNT(*) FILTER (WHERE skill = 'grammar')::int AS grammar
           FROM answer_events WHERE user_id = $1 AND created_at >= ${TODAY}`, [uid]),
      pool.query(
        `SELECT COUNT(DISTINCT m.id)::int AS n
           FROM ranked_matches m LEFT JOIN ranked_match_players p ON p.match_id = m.id
          WHERE (m.user_id = $1 OR p.user_id = $1) AND m.status = 'finished' AND m.finished_at >= ${TODAY}`, [uid]),
      pool.query(
        `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
           FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`, [uid]),
      rankOf(uid),
      chat.history(uid).catch(() => null),
    ]);
    if (!user.rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const lv = getLevelInfo(user.rows[0].exp || 0);
    const t = today.rows[0];
    const rk = ranked.rows[0].n;
    const quests = [
      { id: 'answers', title: `ตอบคำถามให้ครบ ${DAILY_GOAL_ANSWERS} ข้อ`, progress: Math.min(t.answers, DAILY_GOAL_ANSWERS), goal: DAILY_GOAL_ANSWERS, nav: 'learn' },
      { id: 'grammar', title: `ฝึก Grammar ${GRAMMAR_DAILY} ข้อ`, progress: Math.min(t.grammar, GRAMMAR_DAILY), goal: GRAMMAR_DAILY, nav: 'grammar' },
      { id: 'ranked', title: `แข่ง Ranked ${RANKED_DAILY} เกม`, progress: Math.min(rk, RANKED_DAILY), goal: RANKED_DAILY, nav: 'ranked' },
    ].map((q) => ({ ...q, done: q.progress >= q.goal }));
    const ids = friends.rows.map((r) => r.id);
    const online = ids.filter((id) => realtime.isOnline(id)).length;
    const events = ev.listEvents()
      .filter((e) => !e.retired && (e.status === 'active' || e.status === 'upcoming'))
      .map((e) => ({ id: e.id, kind: e.kind, nameTh: e.nameTh, name: e.name, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt,
        nav: e.kind === 'festival' ? 'festival' : 'event' }));   // หน้า event/festival เปิดกิจกรรมที่กำลังจัดอยู่เอง
    res.json({
      account: { username: user.rows[0].username, level: lv.level, exp: lv.exp, expIntoLevel: lv.expIntoLevel, expForNextLevel: lv.expForNextLevel, progressPercent: lv.progressPercent,
        coins: wallet.rows[0] ? wallet.rows[0].balance : 0 },
      rank,
      quests,
      events,
      carousel: await carousel.listForUser(uid, { rankLabel: bestRankLabel(rank) }).catch((e) => { console.error('[lobby/carousel]', e); return []; }),
      friends: { total: ids.length, online },
      chat: chatView ? { enabled: chatView.me.enabled, online: chatView.online,
        recent: chatView.me.enabled ? chatView.messages.slice(-3).map((m) => ({ id: m.id, username: m.user.username, body: m.body, at: m.at, mine: m.mine })) : [] } : null,
    });
  } catch (err) {
    console.error('[lobby]', err);
    res.status(500).json({ error: 'โหลดหน้า Lobby ไม่สำเร็จ' });
  }
});

/* ---------- v1.17.0 Event Carousel ---------- */
router.get('/events', async (req, res) => {
  try { res.json({ events: await carousel.listForUser(req.userId, { rankLabel: bestRankLabel(await rankOf(req.userId)) }), serverNow: new Date().toISOString(), timezone: 'Asia/Bangkok' }); } catch (err) {
    console.error('[lobby/events]', err); res.status(500).json({ error: 'โหลดกิจกรรมไม่สำเร็จ' });
  }
});
const claimLimit = createLimiter({ limit: 20, windowMs: 60 * 1000 });
router.post('/events/:id/claim', async (req, res) => {
  if (claimLimit.check(`evc:${req.userId}`)) return res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' });
  try { res.json(await carousel.claim(req.userId, req.params.id)); } catch (err) {
    if (err instanceof carousel.CarouselError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[lobby/claim]', err); return res.status(500).json({ error: 'รับรางวัลไม่สำเร็จ' });
  }
});

module.exports = router;
