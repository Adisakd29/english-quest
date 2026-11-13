/*
  การกลั่นกรองแชท (v1.16.0 — แยกออกจาก EnglishQuest World ที่ถูกนำออก)
    /api/moderation/me/restrictions · /api/moderation/restrictions/:id/appeal   (ผู้ใช้: ดูการถูกจำกัดแชท + อุทธรณ์)
    /api/admin/moderation/{reports,chat,restrictions,restrict,restrictions/:id/review}   (ผู้ดูแล)
  ใช้ตารางเดิม world_restrictions / world_chat_log / user_reports (source = 'world' = รายงานจากแชทโลก)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const mod = require('../services/moderation/chat');

const wrap = (where, fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    console.error(`[moderation/${where}]`, err);
    res.status(500).json({ error: 'ทำรายการไม่สำเร็จ' });
  }
};
const fail = (res, status, code, error) => { res.status(status).json({ error, code }); };

const me = express.Router();
me.use(authRequired);
me.get('/me/restrictions', wrap('restr', async (req) => {
  const { rows } = await pool.query(`SELECT id, kind, reason, ends_at, appeal_status, appeal_text, review_note, lifted_at, created_by IS NULL AS auto
     FROM world_restrictions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days' ORDER BY created_at DESC LIMIT 20`, [req.userId]);
  return { restrictions: rows };
}));
me.post('/restrictions/:id/appeal', wrap('appeal', async (req, res) => {
  const r = await mod.appeal(req.userId, Number(req.params.id) || 0, (req.body || {}).text);
  if (r.error) return fail(res, 400, 'APPEAL_FAILED', r.error);
  return r;
}));

const admin = express.Router();
admin.use(authRequired, requireAdmin);
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
  const { rows } = await pool.query('SELECT id, room_id, mode, kind, content, flagged, delivered, created_at FROM world_chat_log WHERE user_id = $1 ORDER BY id DESC LIMIT 200', [uid]);
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
  if (!['chat', 'text'].includes(b.kind) || !uid || !String(b.reason || '').trim()) return fail(res, 400, 'BAD_BODY', 'ระบุผู้ใช้ ชนิด (chat/text) และเหตุผล');
  const r = await mod.restrict(uid, b.kind, minutes, String(b.reason).trim(), { by: req.userId, reportId: Number(b.reportId) || null });
  if (b.reportId) await pool.query("UPDATE user_reports SET status = 'reviewed', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2", [req.userId, Number(b.reportId)]);
  return { restriction: r };
}));
admin.post('/restrictions/:id/review', wrap('a-review', async (req, res) => {
  const b = req.body || {};
  const r = await mod.review(req.userId, Number(req.params.id) || 0, b.decision, b.note);
  if (!r) return fail(res, 400, 'BAD_BODY', 'ไม่พบรายการ หรือการตัดสินไม่ถูกต้อง');
  return { restriction: r };
}));

module.exports = { me, admin };
