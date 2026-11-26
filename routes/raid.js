/*
  v1.27.0 World Raid Boss — REST (userId จาก token เท่านั้น · ดาเมจคำนวณที่เซิร์ฟเวอร์จากคำตอบเท่านั้น)
  ผู้เล่น:  GET /state · GET /poll · POST /round · POST /answer · GET /round/:id/summary · GET /leaderboard · GET /rewards · POST /rewards/claim
            GET /trophies · PUT /title · GET /announcements
  ผู้ดูแล:  /admin/* (requireAdmin · ทุกการเปลี่ยนแปลงบันทึก raid_admin_audit_logs)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const Raid = require('../services/raid');
const R = require('../config/raidBosses');

const router = express.Router();
router.use(authRequired);
// กันสแปม/บอท: คำขอทั่วไป 120/นาที · ตอบคำถาม 40/นาที (คนตอบจริงไม่ถึง) · เริ่มรอบ 10/นาที
const general = createLimiter({ limit: Number(process.env.RAID_RATE_PER_MIN) || 120, windowMs: 60 * 1000 });
const answerLimit = createLimiter({ limit: 40, windowMs: 60 * 1000 });
const roundLimit = createLimiter({ limit: 10, windowMs: 60 * 1000 });
const limited = (lim, tag) => (req, res, next) => (lim.check(`${tag}:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
router.use(limited(general, 'raid'));

const b = (req) => req.body || {};
const wrap = (tag, fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    if (err instanceof Raid.RaidError) return res.status(err.status || 400).json({ error: err.message, code: err.code, ...err.extra });
    console.error(`[raid/${tag}]`, err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

router.get('/state', wrap('state', (req) => Raid.state(req.userId)));
// Polling (WebSocket ใช้ไม่ได้) — เบา: สถานะบอส + ฟีดล่าสุด
router.get('/poll', wrap('poll', async (req) => { if (req.query.in === 'raid') Raid.markPolling(req.userId); return Raid.lightState(); }));   // in=raid: หน้า Raid ที่ใช้ Polling (นับเป็นคนอยู่ในศึก)
router.post('/round', limited(roundLimit, 'raid-round'), wrap('round', (req) => Raid.startRound(req.userId)));
router.post('/answer', limited(answerLimit, 'raid-answer'), wrap('answer', (req) => Raid.answer(req.userId, { attemptId: b(req).attemptId, index: b(req).index, choice: b(req).choice, text: b(req).text })));
router.post('/round/next', limited(answerLimit, 'raid-next'), wrap('next', (req) => Raid.nextQuestion(req.userId, String(b(req).attemptId || ''))));
router.get('/round/:id/summary', wrap('summary', (req) => Raid.roundSummary(req.userId, String(req.params.id))));
router.get('/leaderboard', wrap('leaderboard', (req) => Raid.leaderboard(req.userId, { scope: req.query.scope === 'all' ? 'all' : 'current', instanceId: req.query.instance || null, cefr: req.query.cefr || null })));
router.get('/rewards', wrap('rewards', async (req) => ({ rewards: await Raid.rewardsList(req.userId) })));
router.post('/rewards/claim', wrap('claim', (req) => Raid.claim(req.userId, b(req).instanceId)));
// v1.27.1 ชวนเพื่อนในแชทโลกมาตีบอส (ข้อความคงที่จากเซิร์ฟเวอร์ · ไม่รับข้อความจากหน้าเว็บ)
router.post('/invite', limited(roundLimit, 'raid-invite'), wrap('invite', (req) => Raid.invite(req.userId)));
router.get('/trophies', wrap('trophies', (req) => Raid.trophies(req.userId)));
router.put('/title', wrap('title', (req) => Raid.setTitle(req.userId, b(req).rewardId === undefined ? null : b(req).rewardId)));
router.get('/announcements', wrap('announcements', async () => ({ announcements: await Raid.announcements() })));

/* ======================= ผู้ดูแล ======================= */
const admin = express.Router();
admin.use(authRequired, requireAdmin);
async function audit(adminId, action, instanceId, before, after, reason) {
  await pool.query('INSERT INTO raid_admin_audit_logs (admin_id, action, instance_id, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6)',
    [adminId, action, instanceId || null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason ? String(reason).slice(0, 500) : null]);
}
const needReason = (req) => {
  const r = String(b(req).reason || '').trim();
  if (r.length < 3) throw new Raid.RaidError('NEED_REASON', 'ต้องระบุเหตุผล (บันทึกใน Audit Log)');
  return r;
};

admin.get('/', wrap('admin', async () => {
  const s = await Raid.getSettings(pool, { fresh: true });
  const inst = await Raid.current();
  const [hist, players, flagged, logs] = await Promise.all([
    pool.query(`SELECT id, level, family, status, max_hp, total_damage, participants, active_at, defeated_at,
                       EXTRACT(EPOCH FROM (COALESCE(defeated_at, NOW()) - active_at))::int AS secs FROM raid_boss_instances ORDER BY level DESC LIMIT 10`),
    pool.query(`SELECT COUNT(DISTINCT user_id)::int AS d1, COUNT(*)::int AS answers FROM raid_question_responses WHERE created_at > NOW() - interval '1 day'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM raid_question_responses WHERE flagged = 'too_fast' AND created_at > NOW() - interval '1 day'`),
    pool.query('SELECT l.*, u.username FROM raid_admin_audit_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 20'),
  ]);
  const done = hist.rows.filter((h) => h.defeated_at);
  const stuckHours = inst && inst.status === 'active' ? (Date.now() - new Date(inst.active_at).getTime()) / 3600000 : 0;
  return {
    settings: s, defaults: R.DEFAULT_SETTINGS, boss: Raid.publicState(inst, s), scaling: inst ? inst.scaling : null,
    families: R.FAMILIES.map((f) => ({ key: f.key, nameEn: f.nameEn, from: f.from, to: f.to, ready: f.ready, baseHp: f.baseHp, defense: f.defense, skins: Object.keys(f.skins || {}) })),
    history: hist.rows.map((h) => ({ ...h, max_hp: Number(h.max_hp), total_damage: Number(h.total_damage) })),
    stats: { players24h: players.rows[0].d1, answers24h: players.rows[0].answers, tooFast24h: flagged.rows[0].n,
      avgKillHours: done.length ? Math.round((done.reduce((a, h) => a + h.secs, 0) / done.length / 3600) * 10) / 10 : null, defeated: done.length },
    warnings: stuckHours > s.targetHours * 3 ? [`บอสค้างมา ${Math.round(stuckHours)} ชม. (เกิน 3 เท่าของเป้า ${s.targetHours} ชม.) — พิจารณาลด HP หรือ hpMultiplier`] : [],
    metrics: Raid.metricsView(), audit: logs.rows,
  };
}));

admin.put('/settings', wrap('admin-settings', async (req) => {
  const reason = needReason(req);
  const patch = Raid.sanitizeSettings(b(req).patch || {});
  const before = await Raid.getSettings(pool, { fresh: true });
  await pool.query("UPDATE raid_settings SET data = data || $1::jsonb, updated_at = NOW(), updated_by = $2 WHERE id = 1", [JSON.stringify(patch), req.userId]);
  Raid._resetCache();
  await audit(req.userId, 'settings', null, Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), patch, reason);
  await Raid.tick();
  return { ok: true, settings: await Raid.getSettings(pool, { fresh: true }) };
}));

// ปรับบอสที่กำลังต่อสู้ (ทุกครั้งมี Audit Log + เหตุผล) · ล็อกแถวบอสเหมือนการโจมตี → ไม่ชนกับดาเมจที่เข้ามาพร้อมกัน
admin.post('/boss', wrap('admin-boss', async (req) => {
  const reason = needReason(req);
  const { action } = b(req); const value = b(req).value;
  const s = await Raid.getSettings(pool, { fresh: true });
  const client = await pool.connect();
  let after;
  try {
    await client.query('BEGIN');
    const inst = await Raid.current(client, { lock: true });
    if (!inst) throw new Raid.RaidError('NO_BOSS', 'ยังไม่มีบอส', 404);
    const before = { hp: Number(inst.hp), max_hp: Number(inst.max_hp), family: inst.family, status: inst.status, shield_goal: inst.shield_goal, phase: inst.phase };
    if (action === 'set_hp' || action === 'set_max_hp') {
      if (!['active', 'preparing', 'paused'].includes(inst.status)) throw new Raid.RaidError('BAD_STATE', 'ปรับได้เฉพาะบอสที่ยังไม่ถูกล้ม');
      const n = Math.round(Number(value));
      if (!(n >= 1 && n <= s.hpCap)) throw new Raid.RaidError('BAD_VALUE', `ค่าต้องอยู่ระหว่าง 1–${s.hpCap} (เพดาน HP)`);
      const maxHp = action === 'set_max_hp' ? n : Number(inst.max_hp);
      const hp = action === 'set_hp' ? Math.min(n, maxHp) : Math.min(Number(inst.hp), n);
      // Phase ไม่ย้อนกลับ (ผู้เล่นเห็นร่างที่ปลดล็อกแล้ว)
      const phase = Math.max(inst.phase, require('../config/raidBosses').phaseFor(hp, maxHp));
      after = (await client.query('UPDATE raid_boss_instances SET hp = $2, max_hp = $3, phase = $4, version = version + 1 WHERE id = $1 RETURNING *', [inst.id, hp, maxHp, phase])).rows[0];
    } else if (action === 'set_family') {
      const f = R.BY_KEY[value];
      if (!f || !f.ready) throw new Raid.RaidError('BAD_VALUE', 'ตระกูลบอสนี้ยังไม่พร้อม (ไม่มีโมเดล)');
      if (!['active', 'preparing', 'paused'].includes(inst.status)) throw new Raid.RaidError('BAD_STATE', 'เปลี่ยนได้เฉพาะบอสที่ยังไม่ถูกล้ม');
      after = (await client.query('UPDATE raid_boss_instances SET family = $2, version = version + 1 WHERE id = $1 RETURNING *', [inst.id, f.key])).rows[0];
    } else if (action === 'shield_goal') {
      const n = Math.round(Number(value));
      if (!(n >= 1 && n <= 1000)) throw new Raid.RaidError('BAD_VALUE', 'เป้าทำลายโล่ 1–1000 คำตอบ');
      after = (await client.query('UPDATE raid_boss_instances SET shield_goal = $2, version = version + 1 WHERE id = $1 RETURNING *', [inst.id, n])).rows[0];
    } else if (action === 'spawn_now') {
      if (inst.status !== 'settled') throw new Raid.RaidError('BAD_STATE', 'เรียกบอสถัดไปได้เมื่อบอสตัวนี้สรุปผลแล้วเท่านั้น');
      after = (await client.query('UPDATE raid_boss_instances SET next_spawn_at = NOW(), version = version + 1 WHERE id = $1 RETURNING *', [inst.id])).rows[0];
    } else throw new Raid.RaidError('BAD_ACTION', 'ไม่รู้จักคำสั่ง');
    await client.query('INSERT INTO raid_admin_audit_logs (admin_id, action, instance_id, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.userId, action, inst.id, JSON.stringify(before), JSON.stringify({ hp: Number(after.hp), max_hp: Number(after.max_hp), family: after.family, shield_goal: after.shield_goal, phase: after.phase }), reason]);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
  Raid.emitState(after, s);
  if (action === 'spawn_now') await Raid.tick();
  return { ok: true, boss: Raid.publicState(after, s) };
}));

admin.get('/contributions', wrap('admin-contrib', async (req) => {
  const inst = req.query.instance ? Number(req.query.instance) : (await Raid.current() || {}).id;
  const { rows } = await pool.query(
    `SELECT c.*, u.username FROM raid_contributions c JOIN users u ON u.id = c.user_id WHERE c.instance_id = $1 ORDER BY c.damage DESC LIMIT 200`, [inst || 0]);
  return { instanceId: inst || null, rows: rows.map((r) => ({ ...r, damage: Number(r.damage) })) };
}));
admin.get('/damage-log', wrap('admin-damage', async (req) => {
  const inst = req.query.instance ? Number(req.query.instance) : (await Raid.current() || {}).id;
  const uid = req.query.user ? Number(req.query.user) : null;
  const { rows } = await pool.query(
    `SELECT d.id, d.user_id, u.username, d.amount, d.kind, d.hp_after, d.phase, d.created_at, r.answer_ms, r.qtype FROM raid_damage_events d
       JOIN users u ON u.id = d.user_id LEFT JOIN raid_question_responses r ON r.attempt_id = d.attempt_id AND r.qidx = d.qidx
      WHERE d.instance_id = $1 ${uid ? 'AND d.user_id = $2' : ''} ORDER BY d.id DESC LIMIT 200`, uid ? [inst || 0, uid] : [inst || 0]);
  return { instanceId: inst || null, rows: rows.map((r) => ({ ...r, hp_after: Number(r.hp_after) })) };
}));
// กิจกรรมผิดปกติ: ตอบเร็วเกินคนอ่านทัน · ความแม่นยำสูงมากพร้อมเวลาตอบเร็วผิดปกติ (7 วัน)
admin.get('/suspicious', wrap('admin-suspicious', async () => {
  const { rows } = await pool.query(
    `SELECT r.user_id, u.username, COUNT(*)::int AS answers, SUM(CASE WHEN r.correct THEN 1 ELSE 0 END)::int AS correct,
            SUM(CASE WHEN r.flagged = 'too_fast' THEN 1 ELSE 0 END)::int AS too_fast,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.answer_ms)::int AS median_ms
       FROM raid_question_responses r JOIN users u ON u.id = r.user_id
      WHERE r.created_at > NOW() - interval '7 days' GROUP BY r.user_id, u.username
     HAVING SUM(CASE WHEN r.flagged = 'too_fast' THEN 1 ELSE 0 END) >= 3
         OR (COUNT(*) >= 40 AND PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.answer_ms) < 2500 AND SUM(CASE WHEN r.correct THEN 1 ELSE 0 END)::float / COUNT(*) > 0.95)
      ORDER BY too_fast DESC, answers DESC LIMIT 100`);
  return { rows };
}));

module.exports = { router, admin };
