/*
  แชทโลก (World Chat) — v1.15.0
  ห้องเดียวที่ทุกคนในแอปพิมพ์คุยกันได้แบบเรียลไทม์ (WebSocket เดิม /ws · ประเภทข้อความ gchat:*)
  ความปลอดภัย (ผู้ใช้ส่วนใหญ่เป็นนักเรียน):
    · ตัวกรองเดิม utils/chatFilter: ข้อมูลติดต่อ/ลิงก์ = ไม่ส่งเลย · คำหยาบ = ปิดด้วย *
    · จำกัดอัตรา: ห่างกัน ≥ 2 วินาที · ไม่เกิน 6 ข้อความ/30 วินาที · ข้อความซ้ำเดิมภายใน 60 วินาที = ไม่ส่ง
    · ตัวกรองจับซ้ำ 3 ครั้ง/10 นาที → ปิดแชทชั่วคราว 10 นาที (world_restrictions เดิม · ผู้ดูแลตรวจต่อ)
    · ผู้ดูแลสั่งห้ามแชท (kind = chat) มีผลกับแชทโลกด้วย · Block (ทั้งสองทาง) / ปิดเสียง = ไม่เห็นข้อความกันเลย
    · รายงานจากแชทโลก → user_reports (source = world) พร้อมรหัสข้อความเป็นหลักฐาน · เจ้าของลบข้อความตัวเองได้ · ผู้ดูแลซ่อนได้
    · ส่งออกเฉพาะ: id ข้อความ · id/ชื่อผู้ใช้/รูปโปรไฟล์/เลเวล · ข้อความ · เวลา — ไม่มีอีเมล/เบอร์/ตำแหน่ง/ข้อมูลส่วนตัวอื่น
    · เก็บข้อความ 30 วันแล้วลบอัตโนมัติ
  v1.17.0 (แชทโลกบน Game Lobby):
    · Quick Chat ส่งผ่าน post() เดียวกัน (config/quickChat.js) · ตั้ง "Quick Chat เท่านั้น" ได้เอง · ผู้ดูแลจำกัดการพิมพ์ (kind = text) = ส่งได้เฉพาะ Quick Chat
    · การตั้งค่า: แสดงแชทย่อ / เสียง / แจ้งข้อความใหม่ / Quick Chat เท่านั้น / ปิดแชทโลก (user_world_settings)
    · cid (รหัสจากเครื่องผู้ส่ง) ไม่ซ้ำต่อคน → ส่งซ้ำตอนเน็ตหลุด = ได้ข้อความเดิมกลับ ไม่เกิดข้อความซ้ำ
    · history({ after }) = ข้อความที่พลาดระหว่างหลุดการเชื่อมต่อ
    · หลายเครื่องเซิร์ฟเวอร์: ส่งต่อข้อความผ่าน PostgreSQL LISTEN/NOTIFY (ช่อง eq_gchat) — ข้อความอยู่ในฐานข้อมูลเสมอ ไม่ได้อยู่แค่ในหน่วยความจำ
*/
const pool = require('../config/db');
const realtime = require('../realtime');
const chatFilter = require('../utils/chatFilter');
const { blockedSet } = require('../utils/blocks');
const { getLevelInfo } = require('../utils/leveling');
const mod = require('./moderation/chat');
const { QUICK, QUICK_BY_ID } = require('../config/quickChat');
const crypto = require('crypto');

const CFG = {
  maxLen: 200,
  page: 50,
  minIntervalMs: 2000,
  burst: { limit: 6, windowMs: 30 * 1000 },
  duplicateWindowMs: 60 * 1000,
  retentionDays: 30,
};
const ROOM = 'global';

class ChatError extends Error { constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; } }

// สถานะอัตราส่งในหน่วยความจำ (ต่อเครื่อง) — กันสแปมระดับวินาที · ระดับนาทีมี rate limiter ของ route อีกชั้น
const rate = new Map();   // userId -> { last, times[], lastText, lastAt }
function rateState(uid) { if (!rate.has(uid)) rate.set(uid, { last: 0, times: [], lastText: '', lastAt: 0 }); return rate.get(uid); }

/** ข้อมูลสาธารณะของผู้ส่ง — ระบุฟิลด์ทีละตัว (ไม่ส่งแถว users ทั้งแถว) */
function publicUser(r) {
  return { id: r.user_id, username: r.username, avatar: r.avatar || 'fox', avatarImage: r.avatar_image || null, level: getLevelInfo(r.exp || 0).level };
}
function view(r, me) {
  return { id: Number(r.id), user: publicUser(r), body: r.body, at: r.created_at, mine: r.user_id === me, quick: r.quick_id || null };
}

async function settingsOf(userId) {
  const { rows } = await pool.query('SELECT global_chat, chat_mini, chat_sound, chat_notify, chat_quick_only FROM user_world_settings WHERE user_id = $1', [userId]);
  const r = rows[0] || {};
  return { enabled: r.global_chat !== false, mini: r.chat_mini !== false, sound: r.chat_sound === true, notify: r.chat_notify !== false, quickOnly: r.chat_quick_only === true };
}
async function mutedSet(userId) {
  const { rows } = await pool.query('SELECT muted_id FROM world_mutes WHERE user_id = $1', [userId]);
  return new Set(rows.map((r) => r.muted_id));
}

/** ส่งได้ไหม (คืนเหตุผลถ้าไม่ได้) */
async function canPost(userId) {
  const act = await mod.activeRestrictions(userId);
  const when = (x) => new Date(x.ends_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const r = act.find((x) => x.kind === 'chat');
  if (r) return { ok: false, reason: 'restricted', until: r.ends_at, message: `ถูกปิดการแชทชั่วคราวถึง ${when(r)}` };
  const t = act.find((x) => x.kind === 'text');   // จำกัดการพิมพ์ → ยังส่ง Quick Chat ได้
  if (t) return { ok: true, quickOnly: true, until: t.ends_at, message: `ผู้ดูแลจำกัดการพิมพ์ถึง ${when(t)} — ส่งได้เฉพาะ Quick Chat` };
  return { ok: true };
}

/** ประวัติล่าสุด (ซ่อนคนที่บล็อก/ปิดเสียง) · before = รหัสข้อความ (โหลดเก่ากว่า) */
async function history(userId, { before, after } = {}) {
  const [blocked, muted, s, post] = await Promise.all([blockedSet(userId), mutedSet(userId), settingsOf(userId), canPost(userId)]);
  const hide = [...new Set([...blocked, ...muted])];
  const b = Number(before);
  const a = Number(after);
  if (Number.isInteger(a) && a > 0) {
    // ข้อความที่พลาดระหว่างหลุดการเชื่อมต่อ (ใหม่กว่า a) — สูงสุด 100 ข้อความ
    const { rows } = await pool.query(
      `SELECT m.id, m.user_id, m.body, m.quick_id, m.created_at, u.username, u.avatar, u.avatar_image, u.exp
         FROM world_chat_messages m JOIN users u ON u.id = m.user_id
        WHERE m.hidden_at IS NULL AND m.id > $1::bigint AND NOT (m.user_id = ANY($2::int[]))
        ORDER BY m.id ASC LIMIT 100`, [a, hide]);
    return { messages: rows.map((r) => view(r, userId)), after: a, online: realtime.getOnlineCount() };
  }
  const { rows } = await pool.query(
    `SELECT m.id, m.user_id, m.body, m.quick_id, m.created_at, u.username, u.avatar, u.avatar_image, u.exp
       FROM world_chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.hidden_at IS NULL AND m.created_at > NOW() - ($4 || ' days')::interval AND $1::int > 0
        AND NOT (m.user_id = ANY($2::int[])) AND ($3::bigint IS NULL OR m.id < $3::bigint)
      ORDER BY m.id DESC LIMIT ${CFG.page + 1}`,
    [userId, hide, Number.isInteger(b) && b > 0 ? b : null, String(CFG.retentionDays)]);
  const more = rows.length > CFG.page;
  return {
    messages: rows.slice(0, CFG.page).reverse().map((r) => view(r, userId)), more,
    me: { enabled: s.enabled, canPost: post.ok, reason: post.reason || null, until: post.until || null, message: post.message || null,
      quickOnly: Boolean(s.quickOnly || post.quickOnly), quickForced: Boolean(post.quickOnly) },
    prefs: s, quick: QUICK, online: realtime.getOnlineCount(), maxLen: CFG.maxLen,
  };
}

/** ส่งข้อความ */
async function byClient(userId, cid) {
  const r = (await pool.query(
    `SELECT m.id, m.user_id, m.body, m.quick_id, m.created_at, u.username, u.avatar, u.avatar_image, u.exp
       FROM world_chat_messages m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1 AND m.client_id = $2`, [userId, cid])).rows[0];
  return r ? view(r, userId) : null;
}

async function post(userId, raw, { cid, quick } = {}) {
  cid = typeof cid === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(cid) ? cid : null;
  if (cid) { const prev = await byClient(userId, cid); if (prev) return { message: prev, cid, masked: false, delivered: 0, duplicate: true }; }
  const q = quick ? QUICK_BY_ID[String(quick)] : null;
  if (quick && !q) throw new ChatError(400, 'ไม่พบข้อความสำเร็จรูปนี้', 'BAD_QUICK');
  if (!q && typeof raw !== 'string') throw new ChatError(400, 'ข้อความไม่ถูกต้อง', 'BAD_INPUT');
  const s = await settingsOf(userId);
  if (!s.enabled) throw new ChatError(403, 'เปิดแชทโลกก่อนจึงจะส่งข้อความได้', 'DISABLED');
  const p = await canPost(userId);
  if (!p.ok) throw new ChatError(403, p.message, 'RESTRICTED', { until: p.until });
  if (!q && (s.quickOnly || p.quickOnly)) throw new ChatError(403, p.quickOnly ? p.message : 'ตั้งค่าไว้เป็น "Quick Chat เท่านั้น" — เลือกข้อความสำเร็จรูปด้านล่าง หรือปิดตัวเลือกนี้ในการตั้งค่า', 'QUICK_ONLY');
  if (q) return postQuick(userId, q, cid);
  const text0 = raw.replace(/\s+/g, ' ').trim();
  if (!text0) throw new ChatError(400, 'พิมพ์ข้อความก่อนส่ง', 'EMPTY');
  if (text0.length > CFG.maxLen) throw new ChatError(400, `ยาวได้ไม่เกิน ${CFG.maxLen} ตัวอักษร`, 'TOO_LONG');
  const T = Date.now(); const st = rateState(userId);
  if (T - st.last < CFG.minIntervalMs) throw new ChatError(429, 'ส่งเร็วเกินไป รอสักครู่', 'RATE');
  st.times = st.times.filter((x) => T - x < CFG.burst.windowMs);
  if (st.times.length >= CFG.burst.limit) throw new ChatError(429, 'ส่งข้อความถี่เกินไป พักสักครู่นะ', 'RATE');
  const f = chatFilter.filter(text0);
  if (f.block) {
    // ข้อมูลติดต่อ/ลิงก์: ไม่ส่งต่อ แต่บันทึกเป็นหลักฐาน (นับรวมการปิดแชทอัตโนมัติ)
    await mod.logChat({ roomId: ROOM, userId, mode: 'global', kind: 'text', content: text0, flagged: f.flags[0] || 'blocked' });
    st.last = T; st.times.push(T);
    const auto = await mod.maybeAutoMute(userId);
    throw new ChatError(400, f.flags.includes('contact') ? 'ส่งไม่ได้: ห้ามแชร์ลิงก์ เบอร์โทร อีเมล หรือช่องทางติดต่อส่วนตัวในแชทโลก เพื่อความปลอดภัย' : 'ส่งข้อความนี้ไม่ได้', 'FILTERED', { auto: Boolean(auto) });
  }
  if (f.text === st.lastText && T - st.lastAt < CFG.duplicateWindowMs) throw new ChatError(429, 'ส่งข้อความซ้ำเดิม', 'DUPLICATE');
  st.last = T; st.times.push(T); st.lastText = f.text; st.lastAt = T;
  const flagged = f.flags.find((x) => x === 'profanity' || x === 'spam') || null;
  const out = await store(userId, f.text, { flagged, cid, quickId: null });
  if (out.duplicate) return out;
  await mod.logChat({ roomId: ROOM, userId, mode: 'global', kind: 'text', content: f.text, flagged });
  if (flagged) await mod.maybeAutoMute(userId);
  return { ...out, masked: flagged === 'profanity' };
}

/** Quick Chat: ข้อความคงที่ (ไม่ต้องผ่านตัวกรอง) แต่จำกัดอัตราเหมือนข้อความพิมพ์เอง */
async function postQuick(userId, q, cid) {
  const T = Date.now(); const st = rateState(userId);
  if (T - st.last < CFG.minIntervalMs) throw new ChatError(429, 'ส่งเร็วเกินไป รอสักครู่', 'RATE');
  st.times = st.times.filter((x) => T - x < CFG.burst.windowMs);
  if (st.times.length >= CFG.burst.limit) throw new ChatError(429, 'ส่งข้อความถี่เกินไป พักสักครู่นะ', 'RATE');
  if (q.text === st.lastText && T - st.lastAt < CFG.duplicateWindowMs) throw new ChatError(429, 'ส่งข้อความซ้ำเดิม', 'DUPLICATE');
  st.last = T; st.times.push(T); st.lastText = q.text; st.lastAt = T;
  const out = await store(userId, q.text, { flagged: null, cid, quickId: q.id });
  if (!out.duplicate) await mod.logChat({ roomId: ROOM, userId, mode: 'global', kind: 'phrase', content: q.text });
  return { ...out, masked: false };
}

/** บันทึก + ส่งต่อ (cid ซ้ำพร้อมกัน → คืนข้อความเดิม) */
async function store(userId, text, { flagged, cid, quickId }) {
  let ins;
  try {
    ins = await pool.query('INSERT INTO world_chat_messages (user_id, body, flagged, client_id, quick_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
      [userId, text, flagged, cid, quickId]);
  } catch (err) {
    if (err.code === '23505' && cid) { const prev = await byClient(userId, cid); if (prev) return { message: prev, cid, delivered: 0, duplicate: true }; }
    throw err;
  }
  const u = (await pool.query('SELECT id AS user_id, username, avatar, avatar_image, exp FROM users WHERE id = $1', [userId])).rows[0];
  const msg = { id: Number(ins.rows[0].id), user: publicUser(u), body: text, at: ins.rows[0].created_at, quick: quickId };
  const delivered = await fanout(userId, 'gchat:msg', msg);
  return { message: { ...msg, mine: true }, cid: cid || null, delivered };
}

/* ---------- กระจายข้อความ: เครื่องนี้ส่งตรง + แจ้งเครื่องอื่นผ่าน PostgreSQL NOTIFY ---------- */
const INSTANCE = crypto.randomBytes(6).toString('hex');
const bus = { client: null, ready: false, stopped: false };
async function initBus() {
  if (bus.client || bus.stopped) return;
  try {
    const c = await pool.connect();
    bus.client = c;
    c.on('notification', (n) => {
      if (n.channel !== 'eq_gchat') return;
      let d; try { d = JSON.parse(n.payload); } catch (_) { return; }
      if (!d || d.o === INSTANCE) return;
      if (d.t === 'gchat:msg') localFanout(d.s, d.t, d.p).catch(() => {});
      else if (d.t === 'gchat:remove') realtime.getOnlineUserIds().forEach((uid) => realtime.sendToUser(uid, 'gchat:remove', d.p));
    });
    c.on('error', () => { bus.ready = false; try { c.release(true); } catch (_) { /* - */ } bus.client = null; if (!bus.stopped) setTimeout(initBus, 5000).unref(); });
    await c.query('LISTEN eq_gchat');
    bus.ready = true;
  } catch (err) {
    console.error('[world-chat/bus]', err.message);
    bus.client = null; if (!bus.stopped) setTimeout(initBus, 10000).unref();
  }
}
function stopBus() { bus.stopped = true; if (bus.client) { try { bus.client.release(true); } catch (_) { /* - */ } bus.client = null; } }
function publish(type, senderId, payload) {
  if (!bus.ready) return;
  const body = JSON.stringify({ o: INSTANCE, t: type, s: senderId, p: payload });
  if (body.length > 7500) return;
  pool.query('SELECT pg_notify($1, $2)', ['eq_gchat', body]).catch(() => {});
}
async function fanout(senderId, type, payload) {
  publish(type, senderId, payload);
  return localFanout(senderId, type, payload);
}

/** ส่งให้ทุกคนที่ออนไลน์ (ในเครื่องนี้) — ยกเว้นคนที่บล็อกกัน/ปิดเสียงผู้ส่ง/ปิดแชทโลก */
async function localFanout(senderId, type, payload) {
  const online = realtime.getOnlineUserIds().filter((id) => id !== senderId);
  if (!online.length) return 0;
  const { rows } = await pool.query(
    `SELECT u.id FROM unnest($1::int[]) AS u(id)
      WHERE NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id))
        AND NOT EXISTS (SELECT 1 FROM world_mutes w WHERE w.user_id = u.id AND w.muted_id = $2)
        AND NOT EXISTS (SELECT 1 FROM user_world_settings s WHERE s.user_id = u.id AND s.global_chat = FALSE)`, [online, senderId]);
  rows.forEach((r) => realtime.sendToUser(r.id, type, payload));
  return rows.length;
}

/** ลบ/ซ่อนข้อความ: เจ้าของ หรือ ผู้ดูแล */
async function remove(userId, role, messageId) {
  const id = Number(messageId);
  if (!Number.isInteger(id) || id <= 0) throw new ChatError(400, 'รหัสข้อความไม่ถูกต้อง');
  const { rows } = await pool.query(
    `UPDATE world_chat_messages SET hidden_at = NOW(), hidden_by = $2
      WHERE id = $1 AND hidden_at IS NULL AND (user_id = $2 OR $3) RETURNING id`, [id, userId, role === 'admin']);
  if (!rows[0]) throw new ChatError(404, 'ไม่พบข้อความ หรือไม่มีสิทธิ์ลบ');
  realtime.getOnlineUserIds().forEach((uid) => realtime.sendToUser(uid, 'gchat:remove', { id }));
  publish('gchat:remove', userId, { id });
  return { ok: true, id };
}

/** รายงานผู้ส่งจากข้อความในแชทโลก (ใช้ระบบรายงานเดิม · แนบรหัสข้อความเป็นหลักฐาน) */
async function report(userId, messageId, reason, details) {
  const id = Number(messageId);
  const m = (await pool.query('SELECT id, user_id FROM world_chat_messages WHERE id = $1', [id])).rows[0];
  if (!m) throw new ChatError(404, 'ไม่พบข้อความ');
  if (m.user_id === userId) throw new ChatError(400, 'รายงานข้อความของตัวเองไม่ได้');
  const r = await mod.report({ reporterId: userId, reportedId: m.user_id, reason, details: `[แชทโลก #${id}] ${details || ''}`.trim(), roomId: ROOM });
  return { ok: true, reportId: r.id, message: 'ขอบคุณที่แจ้ง — ผู้ดูแลจะตรวจสอบ' };
}

async function setEnabled(userId, enabled) {
  await pool.query(`INSERT INTO user_world_settings (user_id, global_chat) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET global_chat = EXCLUDED.global_chat, updated_at = NOW()`, [userId, Boolean(enabled)]);
  return { enabled: Boolean(enabled) };
}

/** ตั้งค่าแชทหลายข้อพร้อมกัน (ส่งมาเฉพาะข้อที่เปลี่ยน) */
const PREF_COL = { enabled: 'global_chat', mini: 'chat_mini', sound: 'chat_sound', notify: 'chat_notify', quickOnly: 'chat_quick_only' };
async function setSettings(userId, body = {}) {
  const keys = Object.keys(PREF_COL).filter((k) => typeof body[k] === 'boolean');
  if (!keys.length) throw new ChatError(400, 'ไม่มีการตั้งค่าที่จะบันทึก');
  const cols = keys.map((k) => PREF_COL[k]);
  await pool.query(`INSERT INTO user_world_settings (user_id, ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = NOW()`, [userId, ...keys.map((k) => body[k])]);
  return settingsOf(userId);
}

async function setMute(userId, targetId, on) {
  const t = Number(targetId);
  if (!Number.isInteger(t) || t <= 0 || t === userId) throw new ChatError(400, 'ผู้ใช้ไม่ถูกต้อง');
  if (on) await pool.query('INSERT INTO world_mutes (user_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, t]);
  else await pool.query('DELETE FROM world_mutes WHERE user_id = $1 AND muted_id = $2', [userId, t]);
  return { ok: true, muted: Boolean(on) };
}

async function purge() {
  const r = await pool.query(`DELETE FROM world_chat_messages WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(CFG.retentionDays)]);
  return r.rowCount;
}

module.exports = { history, post, remove, report, setEnabled, setSettings, settingsOf, setMute, purge, canPost, initBus, stopBus, CFG, ChatError, _rate: rate, _bus: bus, QUICK };
