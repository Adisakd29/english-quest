/*
  EnglishQuest World — ความปลอดภัยและการกลั่นกรอง
  · บันทึกแชท (world_chat_log) เก็บ 30 วัน — เป็นหลักฐานให้ผู้ดูแลเมื่อมีรายงาน (ผู้ใช้ทั่วไปอ่านไม่ได้)
  · การจำกัดสิทธิ์ (world_restrictions): chat = ห้ามแชท · lobby = ห้ามเข้า Lobby · มีวันหมดอายุเสมอ · อุทธรณ์ได้ 1 ครั้งต่อรายการ
  · อัตโนมัติ (ชั่วคราวเท่านั้น รอผู้ดูแลตรวจ): ตัวกรองจับซ้ำ 3 ครั้ง/10 นาที → ปิดแชท 10 นาที ·
    ถูกรายงานจาก 3 คนขึ้นไปใน 1 ชม. → ปิดแชท 30 นาที
*/
const pool = require('../../config/db');
const { WORLD } = require('../../config/world');

async function activeRestrictions(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, kind, reason, ends_at, appeal_status, created_by IS NULL AS auto FROM world_restrictions
      WHERE user_id = $1 AND lifted_at IS NULL AND ends_at > NOW() ORDER BY ends_at DESC`, [userId]);
  return rows;
}

async function restrict(userId, kind, minutes, reason, { by = null, reportId = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO world_restrictions (user_id, kind, reason, report_id, ends_at, created_by)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval, $6) RETURNING id, kind, reason, ends_at`,
    [userId, kind, String(reason).slice(0, 300), reportId, String(Math.max(1, Math.round(minutes))), by]);
  return rows[0];
}

async function logChat({ roomId, userId, mode, kind, content, flagged = null, delivered = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO world_chat_log (room_id, user_id, mode, kind, content, flagged, delivered) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [roomId, userId, mode, kind, String(content).slice(0, 240), flagged, delivered]);
  return Number(rows[0].id);
}

/** ตัวกรองจับซ้ำ → ปิดแชทชั่วคราว (คืน restriction ที่สร้าง หรือ null) */
async function maybeAutoMute(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM world_chat_log WHERE user_id = $1 AND flagged IS NOT NULL AND created_at > NOW() - INTERVAL '10 minutes'`, [userId]);
  if (rows[0].n < WORLD.autoMuteFlags) return null;
  const act = await activeRestrictions(userId);
  if (act.some((r) => r.kind === 'chat')) return null;
  return restrict(userId, 'chat', WORLD.autoMuteMs / 60000, 'อัตโนมัติ: ข้อความไม่เหมาะสมซ้ำหลายครั้ง (รอผู้ดูแลตรวจ)');
}

/** รายงานจากในโลก → user_reports เดิม (source = world) + หลักฐานแชทล่าสุดของผู้ถูกรายงานในห้องนั้น */
async function report({ reporterId, reportedId, reason, details, roomId }) {
  const { rows: chat } = await pool.query(
    `SELECT id FROM world_chat_log WHERE user_id = $1 AND room_id = $2 AND created_at > NOW() - INTERVAL '30 minutes' ORDER BY id DESC LIMIT 12`,
    [reportedId, roomId]);
  const dup = await pool.query("SELECT id FROM user_reports WHERE reporter_id = $1 AND reported_id = $2 AND status = 'open'", [reporterId, reportedId]);
  let id = dup.rows[0] && dup.rows[0].id;
  if (!id) {
    const ins = await pool.query(
      `INSERT INTO user_reports (reporter_id, reported_id, reason, details, source, context) VALUES ($1, $2, $3, $4, 'world', $5) RETURNING id`,
      [reporterId, reportedId, reason, details ? String(details).trim().slice(0, 500) : null, JSON.stringify({ room: roomId, chatIds: chat.map((r) => Number(r.id)) })]);
    id = ins.rows[0].id;
  }
  // ถูกรายงานจากหลายคนพร้อมกัน → ปิดแชทชั่วคราวระหว่างรอตรวจ (ไม่ตัดสินเอง — ผู้ดูแลตัดสิน)
  const { rows: many } = await pool.query(
    `SELECT COUNT(DISTINCT reporter_id)::int AS n FROM user_reports WHERE reported_id = $1 AND source = 'world' AND created_at > NOW() - INTERVAL '1 hour'`, [reportedId]);
  let auto = null;
  if (many[0].n >= 3 && !(await activeRestrictions(reportedId)).some((r) => r.kind === 'chat')) {
    auto = await restrict(reportedId, 'chat', 30, 'อัตโนมัติ: ถูกรายงานจากผู้เล่นหลายคน (รอผู้ดูแลตรวจ)', { reportId: id });
  }
  return { id, auto };
}

async function appeal(userId, restrictionId, text) {
  const t = String(text || '').trim();
  if (t.length < 5) return { error: 'เขียนเหตุผลอย่างน้อย 5 ตัวอักษร' };
  const { rows } = await pool.query(
    `UPDATE world_restrictions SET appeal_text = $3, appeal_at = NOW(), appeal_status = 'pending'
      WHERE id = $1 AND user_id = $2 AND appeal_status = 'none' AND lifted_at IS NULL AND ends_at > NOW() RETURNING id`,
    [restrictionId, userId, t.slice(0, 500)]);
  return rows[0] ? { ok: true } : { error: 'อุทธรณ์รายการนี้ไม่ได้ (อุทธรณ์แล้ว หรือหมดอายุแล้ว)' };
}

async function review(adminId, restrictionId, decision, note) {
  if (!['upheld', 'lifted'].includes(decision)) return null;
  const { rows } = await pool.query(
    `UPDATE world_restrictions SET appeal_status = CASE WHEN appeal_status = 'none' THEN appeal_status ELSE $2 END,
        lifted_at = CASE WHEN $2 = 'lifted' THEN NOW() ELSE lifted_at END, reviewed_by = $3, reviewed_at = NOW(), review_note = $4
      WHERE id = $1 RETURNING id, user_id, kind, appeal_status, lifted_at`, [restrictionId, decision, adminId, note ? String(note).slice(0, 300) : null]);
  return rows[0] || null;
}

async function purge() {
  const r = await pool.query(`DELETE FROM world_chat_log WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(WORLD.chatLogDays)]);
  return r.rowCount;
}

module.exports = { activeRestrictions, restrict, logChat, maybeAutoMute, report, appeal, review, purge };
