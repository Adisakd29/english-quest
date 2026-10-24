/*
  EnglishQuest World — REST (/api/world) + เครื่องมือผู้ดูแล (/api/admin/world)
  การกระทำต่อผู้เล่นอื่นอ้างด้วย pid (รหัสสุ่มในห้อง) เท่านั้น — เซิร์ฟเวอร์แปลงเป็นบัญชีเอง และต้องอยู่ห้องเดียวกัน + มองเห็นกันได้
  ทุกการกระทำผ่านกติกาเดิม: Privacy (โปรไฟล์) · บล็อก (user_blocks) · คำขอเป็นเพื่อน (friends) · รายงาน (user_reports)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const { WORLD, SETTINGS, PHRASES, EMOTES } = require('../config/world');
const W = require('../services/world');
const settingsSvc = require('../services/world/settings');
const mod = require('../services/world/moderation');
const mapData = require('../services/world/map');
const PV = require('../services/privacy');
const friends = require('./friends');

const actLimiter = createLimiter({ limit: 60, windowMs: 60 * 1000 });
const reportLimiter = createLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
const wrap = (where, fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    if (err.status && err.code) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[world/${where}]`, err);
    res.status(500).json({ error: 'ทำรายการไม่สำเร็จ' });
  }
};
const fail = (res, status, code, error) => { res.status(status).json({ error, code }); };

const world = express.Router();
world.use(authRequired);

world.get('/config', wrap('config', async () => ({
  map: mapData.publicMap(), phrases: PHRASES, emotes: Object.keys(EMOTES),
  capacity: WORLD.capacity, tickHz: WORLD.tickHz, sendHz: WORLD.clientSendHz, walkSpeed: WORLD.walkSpeed, runSpeed: WORLD.runSpeed,
  interactRange: WORLD.interactRange, localChatRange: WORLD.localChatRange, seatRange: WORLD.seatRange, chatMaxLen: WORLD.chatMaxLen,
  settingsMeta: Object.fromEntries(Object.entries(SETTINGS).map(([k, f]) => [k, { th: f.th, hint: f.hint || null, type: f.type, def: f.def }])),
})));
world.get('/settings', wrap('settings', async (req) => ({ settings: await settingsSvc.view(req.userId) })));
world.put('/settings', wrap('settings-put', async (req) => {
  const s = await settingsSvc.update(req.userId, req.body || {});
  await W.onSettings(req.userId);
  return { settings: s };
}));
world.get('/rooms', wrap('rooms', async (req) => ({ rooms: W.roomsList(req.userId), capacity: WORLD.capacity })));
world.get('/friends', wrap('friends', async (req) => {
  const { rows } = await pool.query(`SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id FROM friendships
     WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`, [req.userId]);
  return { friends: W.friendsInLobby(req.userId, rows.map((r) => r.id)) };
}));
world.get('/me/restrictions', wrap('restr', async (req) => {
  const { rows } = await pool.query(`SELECT id, kind, reason, ends_at, appeal_status, appeal_text, review_note, lifted_at, created_by IS NULL AS auto
     FROM world_restrictions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days' ORDER BY created_at DESC LIMIT 20`, [req.userId]);
  return { restrictions: rows };
}));
world.post('/restrictions/:id/appeal', wrap('appeal', async (req, res) => {
  const r = await mod.appeal(req.userId, Number(req.params.id) || 0, (req.body || {}).text);
  if (r.error) return fail(res, 400, 'APPEAL_FAILED', r.error);
  return r;
}));

// ---------- การกระทำต่อผู้เล่นในห้อง (อ้างด้วย pid) ----------
function who(req, res) {
  if (actLimiter.check(`u:${req.userId}`)) { fail(res, 429, 'RATE_LIMITED', 'ทำรายการถี่เกินไป'); return null; }
  const r = W.resolvePid(req.userId, req.params.pid);
  if (!r) { fail(res, 404, 'NO_PLAYER', 'ไม่พบผู้เล่นนี้ในห้องของคุณ'); return null; }
  return r;
}
world.get('/players/:pid/profile', wrap('profile', async (req, res) => {
  const r = who(req, res); if (!r) return undefined;
  // Privacy Settings เดิมเป็นผู้ตัดสินทุก field (ไม่มี email/เบอร์/ที่อยู่ในระบบอยู่แล้ว) — ถูกบล็อก = ไม่พบ
  const p = await PV.getProfile(req.userId, r.target.userId);
  return { profile: p, pid: r.target.pid, distance: +r.distance.toFixed(1) };
}));
world.post('/players/:pid/friend', wrap('friend', async (req, res) => {
  const r = who(req, res); if (!r) return undefined;
  const out = await friends.sendFriendRequest(req.userId, { userId: r.target.userId });
  res.status(out.status).json(out.body);
  return undefined;
}));
world.post('/players/:pid/block', wrap('block', async (req, res) => {
  const r = who(req, res); if (!r) return undefined;
  const t = r.target.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, t]);
    await client.query('DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)', [req.userId, t]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  W.onBlock(req.userId, t);
  W.onFriends(req.userId, t, false);
  return { ok: true, blocked: true };
}));
world.post('/players/:pid/mute', wrap('mute', async (req, res) => {
  const r = who(req, res); if (!r) return undefined;
  const on = (req.body || {}).on !== false;
  if (on) await pool.query('INSERT INTO world_mutes (user_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, r.target.userId]);
  else await pool.query('DELETE FROM world_mutes WHERE user_id = $1 AND muted_id = $2', [req.userId, r.target.userId]);
  W.onMute(req.userId, r.target.userId, on);
  return { ok: true, muted: on };
}));
world.post('/players/:pid/report', wrap('report', async (req, res) => {
  const r = who(req, res); if (!r) return undefined;
  const { reason, details } = req.body || {};
  if (!friends.REPORT_REASONS.has(reason)) return fail(res, 400, 'BAD_REASON', 'กรุณาเลือกเหตุผล');
  if (reportLimiter.check(`u:${req.userId}`)) return fail(res, 429, 'RATE_LIMITED', 'รายงานบ่อยเกินไป ลองใหม่ภายหลัง');
  const out = await mod.report({ reporterId: req.userId, reportedId: r.target.userId, reason, details, roomId: r.viewer.room.id });
  if (out.auto) W.onRestriction(r.target.userId).catch(() => {});
  return { ok: true, message: 'ขอบคุณที่แจ้ง — ผู้ดูแลจะตรวจสอบ (แนะนำให้กดบล็อกหรือปิดเสียงไว้ก่อน)' };
}));

// ---------- ผู้ดูแล (Moderator Tools) ----------
const admin = express.Router();
admin.use(authRequired, requireAdmin);
admin.get('/metrics', wrap('a-metrics', async () => W.stats()));
admin.post('/metrics/reset', wrap('a-metrics-reset', async () => { W.resetMetrics(); return { ok: true }; }));
admin.get('/reports', wrap('a-reports', async (req) => {
  const status = ['open', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const { rows } = await pool.query(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.context, rp.username AS reporter, rd.username AS reported, rd.id AS reported_id
       FROM user_reports r JOIN users rp ON rp.id = r.reporter_id JOIN users rd ON rd.id = r.reported_id
      WHERE r.source = 'world' AND r.status = $1 ORDER BY r.created_at DESC LIMIT 100`, [status]);
  const ids = [...new Set(rows.flatMap((r) => (r.context && r.context.chatIds) || []))];
  const chat = ids.length ? (await pool.query('SELECT id, user_id, room_id, mode, kind, content, flagged, created_at FROM world_chat_log WHERE id = ANY($1)', [ids])).rows : [];
  const byId = Object.fromEntries(chat.map((c) => [Number(c.id), c]));
  return { reports: rows.map((r) => ({ ...r, evidence: ((r.context && r.context.chatIds) || []).map((i) => byId[i]).filter(Boolean) })) };
}));
admin.get('/chat', wrap('a-chat', async (req) => {
  const uid = Number(req.query.userId) || 0;
  const { rows } = await pool.query(`SELECT id, room_id, mode, kind, content, flagged, delivered, created_at FROM world_chat_log WHERE user_id = $1 ORDER BY id DESC LIMIT 200`, [uid]);
  return { chat: rows };
}));
admin.get('/restrictions', wrap('a-restr', async (req) => {
  const pending = req.query.status === 'pending';
  const { rows } = await pool.query(`SELECT w.*, u.username FROM world_restrictions w JOIN users u ON u.id = w.user_id
     WHERE ${pending ? "w.appeal_status = 'pending'" : 'w.lifted_at IS NULL AND w.ends_at > NOW()'} ORDER BY w.created_at DESC LIMIT 200`);
  return { restrictions: rows };
}));
admin.post('/restrict', wrap('a-restrict', async (req, res) => {
  const b = req.body || {};
  const uid = Number(b.userId) || 0; const minutes = Math.min(60 * 24 * 90, Math.max(5, Number(b.minutes) || 60));
  if (!['chat', 'lobby'].includes(b.kind) || !uid || !String(b.reason || '').trim()) return fail(res, 400, 'BAD_BODY', 'ระบุผู้ใช้ ชนิด และเหตุผล');
  const r = await mod.restrict(uid, b.kind, minutes, String(b.reason).trim(), { by: req.userId, reportId: Number(b.reportId) || null });
  if (b.reportId) await pool.query("UPDATE user_reports SET status = 'reviewed', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2", [req.userId, Number(b.reportId)]);
  await W.onRestriction(uid);
  return { restriction: r };
}));
admin.post('/restrictions/:id/review', wrap('a-review', async (req, res) => {
  const b = req.body || {};
  const r = await mod.review(req.userId, Number(req.params.id) || 0, b.decision, b.note);
  if (!r) return fail(res, 400, 'BAD_BODY', 'ไม่พบรายการ หรือการตัดสินไม่ถูกต้อง');
  await W.onRestriction(r.user_id);
  return { restriction: r };
}));

module.exports = { world, admin };
