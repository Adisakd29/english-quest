/*
  สมาชิก Premium (รายเดือน / รายปี) — ชำระผ่าน PromptPay QR + แนบสลิป + ผู้ดูแลอนุมัติ
  - PromptPay ส่วนตัวไม่มีระบบแจ้งเงินเข้าอัตโนมัติ → ผู้ดูแลเทียบยอดในแอปธนาคารแล้วกดอนุมัติ
  - ทุกคำสั่งซื้อมี "ยอดเฉพาะ" (ราคา + เศษสตางค์ที่ไม่ซ้ำกับคำสั่งซื้อที่ค้างอยู่) → จับคู่ยอดเงินเข้ากับคนได้แน่นอน
  - userId มาจาก token เท่านั้น · สลิปเป็นข้อมูลส่วนตัว: เก็บใน DB (ไม่อยู่ใน public) ผู้ดูแลเท่านั้นที่เปิดดูได้ · ลบหลังตรวจ 90 วัน
  - สลิปเดียวใช้ได้ครั้งเดียว (sha256) · อนุมัติซ้ำไม่ได้ · ต่ออายุ = ต่อจากวันหมดอายุเดิม (ไม่เสียวันที่เหลือ)
  - ไม่แตะ EXP / Coin / inventory
*/
const crypto = require('crypto');
const QRCode = require('qrcode');
const pool = require('../config/db');
const PP = require('../utils/promptpay');
const C = require('../config/membership');
const SV = require('./slipVerify');
const { audit } = require('../utils/audit');

class MembershipError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const payment = () => {
  const id = process.env.PROMPTPAY_ID || '';
  return { ready: PP.valid(id), id, name: String(process.env.PROMPTPAY_NAME || '').slice(0, 80) };
};
const baht = (satang) => (satang / 100).toFixed(2);

async function expireStale() {
  await pool.query(`UPDATE membership_orders SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()`);
}

function orderView(o) {
  const p = C.PLANS[o.plan] || { th: o.plan };
  return {
    id: Number(o.id), plan: o.plan, planTh: p.th, days: o.days, amount: baht(o.amount_satang), status: o.status,
    createdAt: o.created_at, expiresAt: o.expires_at, submittedAt: o.submitted_at, reviewedAt: o.reviewed_at,
    adminNote: o.status === 'rejected' ? o.admin_note : null, hasSlip: Boolean(o.slip_sha256),
    verifyStatus: o.verify_status || null, verifyNote: o.verify_status && o.verify_status !== 'passed' ? o.verify_note : null,
    autoApproved: o.status === 'approved' && o.verify_status === 'passed' && !o.reviewed_by,
  };
}

/*
  สถานะสมาชิก (คำนวณจากข้อมูลจริงทุกครั้ง — ไม่เชื่อค่าจากหน้าเว็บ)
    free      ยังไม่เคยเป็นสมาชิก
    trial     ทดลองใช้ (มีสิทธิ์)
    active    ชำระแล้ว ยังไม่หมดอายุ (มีสิทธิ์)
    past_due  หมดอายุไม่เกิน GRACE_DAYS วัน (ไม่มีสิทธิ์ · แจ้งเตือนต่ออายุ) — ระบบตัดเงินอัตโนมัติในอนาคตใช้สถานะนี้เมื่อตัดเงินไม่สำเร็จ
    expired   หมดอายุนานกว่านั้น
    canceled  ผู้ดูแลยกเลิกสิทธิ์ (เช่น คืนเงิน)
*/
const STATE_TH = { free: 'สมาชิกทั่วไป (Free)', trial: 'ทดลองใช้ Premium', active: 'Premium', past_due: 'Premium หมดอายุ (รอต่ออายุ)', expired: 'Premium หมดอายุแล้ว', canceled: 'Premium ถูกยกเลิก' };
async function status(userId) {
  const [mr, tr] = await Promise.all([
    pool.query('SELECT plan, started_at, expires_at, status, canceled_at FROM memberships WHERE user_id = $1', [userId]),
    pool.query('SELECT started_at, ends_at FROM membership_trials WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
  ]);
  const m = mr.rows[0];
  const trialAvailable = !tr.rows[0] && C.TRIAL_DAYS > 0;
  if (!m) return { state: 'free', stateTh: STATE_TH.free, active: false, access: false, trial: false, trialAvailable, plan: null, expiresAt: null, daysLeft: 0 };
  const left = Date.parse(m.expires_at) - Date.now();
  let state;
  if (m.status === 'canceled') state = 'canceled';
  else if (left > 0) state = m.status === 'trial' ? 'trial' : 'active';
  else state = -left <= C.GRACE_DAYS * 86400000 ? 'past_due' : 'expired';
  const access = state === 'trial' || state === 'active';
  return { state, stateTh: STATE_TH[state], active: access, access, trial: state === 'trial', trialAvailable,
    plan: m.plan, planTh: m.plan === 'trial' ? 'ทดลองใช้' : ((C.PLANS[m.plan] || {}).th || m.plan), since: m.started_at,
    expiresAt: m.expires_at, daysLeft: left > 0 ? Math.ceil(left / 86400000) : 0 };
}
async function isPremium(userId) { return (await status(userId)).access; }

/** ทดลองใช้ฟรีครั้งเดียวต่อบัญชี (ไม่ต้องจ่ายเงิน) — หมดแล้วกลับเป็น Free เอง */
async function startTrial(userId) {
  if (!(C.TRIAL_DAYS > 0)) throw new MembershipError('TRIAL_OFF', 'ไม่มีการทดลองใช้ในขณะนี้', 409);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const used = await client.query('SELECT 1 FROM membership_trials WHERE user_id = $1 FOR UPDATE', [userId]);
    if (used.rows[0]) throw new MembershipError('TRIAL_USED', 'บัญชีนี้ใช้สิทธิ์ทดลองไปแล้ว', 409);
    const cur = (await client.query('SELECT expires_at, status FROM memberships WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    if (cur && cur.status !== 'canceled' && Date.parse(cur.expires_at) > Date.now()) throw new MembershipError('ALREADY_PREMIUM', 'คุณมีสิทธิ์ Premium อยู่แล้ว', 409);
    await client.query(`INSERT INTO membership_trials (user_id, ends_at) VALUES ($1, NOW() + ($2 || ' days')::interval)`, [userId, String(C.TRIAL_DAYS)]);
    await client.query(
      `INSERT INTO memberships (user_id, plan, status, started_at, expires_at, updated_at) VALUES ($1, 'trial', 'trial', NOW(), NOW() + ($2 || ' days')::interval, NOW())
       ON CONFLICT (user_id) DO UPDATE SET plan = 'trial', status = 'trial', started_at = NOW(), expires_at = NOW() + ($2 || ' days')::interval,
         canceled_at = NULL, cancel_reason = NULL, updated_at = NOW()`, [userId, String(C.TRIAL_DAYS)]);
    await audit({ actorId: userId, action: 'trial_start', targetUser: userId, details: { days: C.TRIAL_DAYS } }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new MembershipError('TRIAL_USED', 'บัญชีนี้ใช้สิทธิ์ทดลองไปแล้ว', 409);
    throw err;
  } finally { client.release(); }
  return status(userId);
}

async function qrFor(o) {
  const pay = payment();
  if (!pay.ready) return null;
  const text = PP.payload(pay.id, o.amount_satang / 100);
  const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  return { svg, payload: text };
}

async function overview(userId) {
  await expireStale();
  const pay = payment();
  const { rows } = await pool.query(
    `SELECT id, plan, days, amount_satang, status, created_at, expires_at, submitted_at, reviewed_at, reviewed_by, admin_note, slip_sha256,
            verify_status, verify_note
       FROM membership_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [userId]);
  return {
    plans: Object.values(C.PLANS).map((p) => ({ id: p.id, th: p.th, price: p.priceBaht, days: p.days, note: p.note,
      perMonth: Math.round((p.priceBaht / p.days) * 30) })),
    benefits: C.BENEFITS, notIncluded: C.NOT_INCLUDED_TH, compare: C.COMPARE, roadmap: C.ROADMAP, trialDays: C.TRIAL_DAYS,
    ai: await require('./aiQuota').usage(userId).catch(() => null),
    membership: await status(userId),
    orders: rows.map(orderView),
    payment: { ready: pay.ready, payeeName: pay.name || null, orderTtlHours: C.ORDER_TTL_HOURS, autoVerify: SV.enabled() },
  };
}

/** สร้างคำสั่งซื้อ: ยกเลิกคำสั่งซื้อที่ยังไม่จ่ายของตัวเองก่อน · ยอดเฉพาะ (เศษสตางค์ 1–99 ไม่ซ้ำกับรายการที่ค้าง) */
async function createOrder(userId, planIn) {
  const plan = C.PLANS[planIn] && Object.prototype.hasOwnProperty.call(C.PLANS, planIn) ? C.PLANS[planIn] : null;
  if (!plan) throw new MembershipError('BAD_PLAN', 'ไม่พบแพ็กเกจนี้');
  if (!payment().ready) throw new MembershipError('PAYMENT_OFF', 'ยังไม่เปิดรับชำระเงิน', 503);
  await expireStale();
  const recent = await pool.query(`SELECT COUNT(*)::int AS n FROM membership_orders WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [userId]);
  if (recent.rows[0].n >= C.MAX_ORDERS_PER_HOUR) throw new MembershipError('RATE_LIMIT', 'สร้างคำสั่งซื้อบ่อยเกินไป ลองใหม่ในอีกสักครู่', 429);
  const waiting = await pool.query(`SELECT COUNT(*)::int AS n FROM membership_orders WHERE user_id = $1 AND status = 'submitted'`, [userId]);
  if (waiting.rows[0].n >= C.MAX_WAITING_REVIEW) throw new MembershipError('WAITING', 'มีสลิปรอตรวจอยู่แล้ว รอผู้ดูแลตรวจก่อนนะ', 409);
  await pool.query(`UPDATE membership_orders SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending'`, [userId]);
  const base = plan.priceBaht * 100;
  const used = new Set((await pool.query(
    `SELECT amount_satang FROM membership_orders WHERE status IN ('pending', 'submitted') AND amount_satang BETWEEN $1 AND $2`, [base + 1, base + 99]))
    .rows.map((r) => r.amount_satang - base));
  const free = Array.from({ length: 99 }, (_, i) => i + 1).filter((x) => !used.has(x));
  const satang = free.length ? free[crypto.randomInt(free.length)] : crypto.randomInt(1, 100);
  const { rows } = await pool.query(
    `INSERT INTO membership_orders (user_id, plan, days, amount_satang, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval) RETURNING *`,
    [userId, plan.id, plan.days, base + satang, String(C.ORDER_TTL_HOURS)]);
  return getOrder(userId, rows[0].id);
}

async function loadOwn(userId, idIn) {
  if (!/^\d{1,15}$/.test(String(idIn))) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  await expireStale();
  const { rows } = await pool.query('SELECT * FROM membership_orders WHERE id = $1 AND user_id = $2', [idIn, userId]);
  if (!rows[0]) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  return rows[0];
}
async function getOrder(userId, id) {
  const o = await loadOwn(userId, id);
  const pay = payment();
  return { ...orderView(o), qr: o.status === 'pending' ? await qrFor(o) : null, payeeName: pay.name || null };
}

/** ตรวจรูปสลิป: data URL ของ jpeg/png/webp · ขนาด · magic bytes ตรงชนิด */
function parseSlip(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m) throw new MembershipError('BAD_SLIP', 'รองรับเฉพาะรูป JPG / PNG / WEBP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 1000) throw new MembershipError('BAD_SLIP', 'รูปสลิปเล็กเกินไป');
  if (buf.length > C.SLIP_MAX_BYTES) throw new MembershipError('SLIP_TOO_BIG', 'รูปสลิปใหญ่เกินไป (ไม่เกิน 1 MB)', 413);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  const okType = (m[1] === 'image/jpeg' && isJpeg) || (m[1] === 'image/png' && isPng) || (m[1] === 'image/webp' && isWebp);
  if (!okType) throw new MembershipError('BAD_SLIP', 'ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง');
  return { mime: m[1], buf, sha: crypto.createHash('sha256').update(buf).digest('hex') };
}
const cleanNote = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

async function submitSlip(userId, id, body = {}) {
  const o = await loadOwn(userId, id);
  if (o.status !== 'pending') {
    throw new MembershipError(o.status === 'expired' ? 'ORDER_EXPIRED' : 'ORDER_CLOSED',
      o.status === 'expired' ? 'คำสั่งซื้อนี้หมดอายุแล้ว สร้างใหม่ได้เลย' : 'คำสั่งซื้อนี้แนบสลิปไม่ได้แล้ว', 409);
  }
  const slip = parseSlip(body.dataUrl);
  try {
    const { rows } = await pool.query(
      `UPDATE membership_orders SET status = 'submitted', slip_image = $3, slip_mime = $4, slip_sha256 = $5, paid_at_note = $6, submitted_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
      [o.id, userId, slip.buf, slip.mime, slip.sha, cleanNote(body.paidAt, 40) || null]);
    if (!rows[0]) throw new MembershipError('ORDER_CLOSED', 'คำสั่งซื้อนี้แนบสลิปไม่ได้แล้ว', 409);
  } catch (err) {
    if (err.code === '23505') throw new MembershipError('SLIP_USED', 'สลิปนี้เคยถูกใช้แล้ว', 409);
    throw err;
  }
  return autoCheck(o.id, slip);
}

/** ตรวจสลิปอัตโนมัติ (ถ้าเปิดไว้) → ผ่านทุกข้อ = อนุมัติทันที · ไม่ผ่าน/ขัดข้อง = อยู่ในคิวผู้ดูแลพร้อมเหตุผล (ไม่ปฏิเสธเอง) */
async function autoCheck(id, slip) {
  const o = (await pool.query('SELECT * FROM membership_orders WHERE id = $1', [id])).rows[0];
  const pay = payment();
  const v = await SV.verify(o, slip, { id: pay.id, name: pay.name, nameEn: process.env.PROMPTPAY_NAME_EN || '', accountSuffix: process.env.PAYEE_ACCOUNT_SUFFIX || '' });
  if (v.status !== 'skipped') {
    const save = (ref) => pool.query(`UPDATE membership_orders SET verify_status = $2, verify_note = $3, verify_provider = $4, trans_ref = COALESCE($5, trans_ref), verified_at = NOW() WHERE id = $1`,
      [id, v.status, cleanNote(v.note, 200), v.provider, ref]);
    try { await save(v.transRef || null); } catch (err) {
      if (err.code !== '23505') throw err;
      v.status = 'failed'; v.note = 'ธุรกรรมในสลิปนี้เคยใช้ยืนยันคำสั่งซื้ออื่นแล้ว';
      await save(null);
    }
    if (v.status === 'passed') {
      try { await approve(null, id, 'อนุมัติอัตโนมัติ: ตรวจสลิปกับธนาคารผ่าน'); } catch (err) { if (!(err instanceof MembershipError)) throw err; }
    }
  }
  const fresh = (await pool.query('SELECT * FROM membership_orders WHERE id = $1', [id])).rows[0];
  return { ...orderView(fresh), auto: { status: v.status, note: v.status === 'skipped' ? null : v.note } };
}
async function reverify(id, adminId = null) {
  if (!/^\d{1,15}$/.test(String(id))) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  if (!SV.enabled()) throw new MembershipError('AUTO_OFF', 'ยังไม่ได้เปิดตรวจสลิปอัตโนมัติ', 409);
  const o = (await pool.query('SELECT id, status, slip_image, slip_mime FROM membership_orders WHERE id = $1', [id])).rows[0];
  if (!o) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  if (o.status !== 'submitted' || !o.slip_image) throw new MembershipError('ORDER_CLOSED', 'ตรวจซ้ำได้เฉพาะรายการที่รอตรวจและมีสลิป', 409);
  const r = await autoCheck(o.id, { buf: o.slip_image, mime: o.slip_mime });
  await audit({ actorId: adminId, action: 'order_reverify', targetRef: `order:${o.id}`, details: { result: r.auto && r.auto.status } });
  return r;
}

async function cancel(userId, id) {
  const o = await loadOwn(userId, id);
  if (o.status !== 'pending') throw new MembershipError('ORDER_CLOSED', 'ยกเลิกได้เฉพาะคำสั่งซื้อที่ยังไม่แนบสลิป', 409);
  await pool.query(`UPDATE membership_orders SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [o.id, userId]);
  return { ok: true };
}

/* ------------------------- ผู้ดูแล ------------------------- */
async function adminList(statusIn = 'submitted') {
  await expireStale();
  // ลบรูปสลิปที่ตรวจแล้วเกินกำหนด (เก็บ hash ไว้กันใช้ซ้ำ)
  await pool.query(`UPDATE membership_orders SET slip_image = NULL WHERE slip_image IS NOT NULL AND reviewed_at < NOW() - ($1 || ' days')::interval`,
    [String(C.SLIP_RETENTION_DAYS)]);
  const st = ['submitted', 'pending', 'approved', 'rejected', 'all'].includes(statusIn) ? statusIn : 'submitted';
  const { rows } = await pool.query(
    `SELECT o.*, u.username, (o.slip_image IS NOT NULL) AS slip_available, r.username AS reviewer
       FROM membership_orders o JOIN users u ON u.id = o.user_id LEFT JOIN users r ON r.id = o.reviewed_by
      WHERE ($1 = 'all' AND o.status NOT IN ('cancelled', 'expired')) OR o.status = $1
      ORDER BY CASE WHEN o.status = 'submitted' THEN o.submitted_at ELSE o.created_at END ${st === 'submitted' ? 'ASC' : 'DESC'} LIMIT 100`, [st]);
  const counts = await pool.query(`SELECT status, COUNT(*)::int AS n FROM membership_orders WHERE status IN ('submitted', 'pending') GROUP BY status`);
  return {
    status: st,
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    autoVerify: SV.enabled(),
    orders: rows.map((o) => ({ ...orderView(o), userId: o.user_id, username: o.username, paidAtNote: o.paid_at_note, slipAvailable: o.slip_available,
      adminNote: o.admin_note, reviewer: o.reviewer || (o.reviewed_at ? 'ระบบอัตโนมัติ' : null), verifyNote: o.verify_note, transRef: o.trans_ref })),
  };
}
async function adminSlip(id) {
  if (!/^\d{1,15}$/.test(String(id))) throw new MembershipError('NOT_FOUND', 'ไม่พบสลิป', 404);
  const { rows } = await pool.query('SELECT slip_image, slip_mime FROM membership_orders WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].slip_image) throw new MembershipError('NOT_FOUND', 'ไม่พบสลิป (อาจถูกลบตามระยะเวลาเก็บแล้ว)', 404);
  return { mime: rows[0].slip_mime, buf: rows[0].slip_image };
}

async function notify(userId, payload) {
  try { await require('./push').sendToUser(userId, payload, { topic: 'membership' }); } catch (_) { /* แจ้งเตือนไม่สำเร็จไม่กระทบการอนุมัติ */ }
}

async function approve(adminId, id, noteIn) {
  if (!/^\d{1,15}$/.test(String(id))) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  const client = await pool.connect();
  let o; let m;
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM membership_orders WHERE id = $1 FOR UPDATE', [id]);
    o = r.rows[0];
    if (!o) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
    if (!['submitted', 'pending', 'expired'].includes(o.status)) throw new MembershipError('ORDER_CLOSED', `คำสั่งซื้อนี้${o.status === 'approved' ? 'อนุมัติไปแล้ว' : 'ปิดไปแล้ว'}`, 409);
    await client.query(`UPDATE membership_orders SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), admin_note = $3 WHERE id = $1`,
      [id, adminId, cleanNote(noteIn, 200) || null]);
    const up = await client.query(
      `INSERT INTO memberships (user_id, plan, status, started_at, expires_at, updated_at) VALUES ($1, $2, 'active', NOW(), NOW() + ($3 || ' days')::interval, NOW())
       ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = 'active', canceled_at = NULL, cancel_reason = NULL, updated_at = NOW(),
         started_at = CASE WHEN memberships.expires_at < NOW() OR memberships.status <> 'active' THEN NOW() ELSE memberships.started_at END,
         expires_at = CASE WHEN memberships.status = 'canceled' THEN NOW() ELSE GREATEST(memberships.expires_at, NOW()) END + ($3 || ' days')::interval
       RETURNING *`, [o.user_id, o.plan, String(o.days)]);
    m = up.rows[0];
    await audit({ actorId: adminId, action: adminId ? 'order_approve' : 'order_auto_approve', targetUser: o.user_id, targetRef: `order:${o.id}`,
      details: { plan: o.plan, days: o.days, amount: baht(o.amount_satang), expiresAt: m.expires_at } }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  const until = new Date(m.expires_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  notify(o.user_id, { title: 'Premium พร้อมใช้งานแล้ว', body: `ขอบคุณที่สนับสนุน EnglishQuest — ใช้ได้ถึง ${until}`, url: '/#/premium', tag: 'eq-membership' });
  return { ok: true, userId: o.user_id, expiresAt: m.expires_at };
}

async function reject(adminId, id, noteIn) {
  if (!/^\d{1,15}$/.test(String(id))) throw new MembershipError('NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้', 404);
  const note = cleanNote(noteIn, 200);
  if (!note) throw new MembershipError('NOTE_REQUIRED', 'กรุณาระบุเหตุผลให้ผู้ใช้ทราบ');
  const { rows } = await pool.query(
    `UPDATE membership_orders SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), admin_note = $3
      WHERE id = $1 AND status IN ('submitted', 'pending') RETURNING user_id`, [id, adminId, note]);
  if (!rows[0]) throw new MembershipError('ORDER_CLOSED', 'คำสั่งซื้อนี้ตรวจไปแล้วหรือไม่พบ', 409);
  await audit({ actorId: adminId, action: 'order_reject', targetUser: rows[0].user_id, targetRef: `order:${id}`, details: { note } });
  notify(rows[0].user_id, { title: 'ตรวจสลิปไม่ผ่าน', body: note, url: '/#/premium', tag: 'eq-membership' });
  return { ok: true };
}

/* ---------------- ผู้ดูแล: ค้นหาสมาชิก · ให้สิทธิ์ · ยกเลิกสิทธิ์ · ประวัติ ---------------- */
async function adminMembers(qIn = '') {
  const q = String(qIn || '').trim().slice(0, 40);
  const { escapeLike } = require('../utils/security');
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.is_test, m.plan, m.status, m.expires_at, m.canceled_at, m.cancel_reason, t.started_at AS trial_started
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id LEFT JOIN membership_trials t ON t.user_id = u.id
      WHERE ${q ? "u.username ILIKE $1 ESCAPE '\\'" : 'm.user_id IS NOT NULL'}
      ORDER BY m.updated_at DESC NULLS LAST, u.id DESC LIMIT 50`, q ? [`%${escapeLike(q)}%`] : []);
  const out = [];
  for (const r of rows) out.push({ userId: r.id, username: r.username, isTest: Boolean(r.is_test), ...(await status(r.id)), cancelReason: r.cancel_reason, trialUsed: Boolean(r.trial_started) });
  return { members: out };
}
async function grant(adminId, userIdIn, daysIn, noteIn) {
  const userId = Number(userIdIn); const days = Number(daysIn);
  if (!Number.isInteger(userId) || userId <= 0) throw new MembershipError('NOT_FOUND', 'ไม่พบผู้ใช้', 404);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new MembershipError('BAD_DAYS', 'จำนวนวันต้องเป็น 1–366');
  const note = cleanNote(noteIn, 200);
  if (!note) throw new MembershipError('NOTE_REQUIRED', 'กรุณาระบุเหตุผล (บันทึกในประวัติ)');
  const u = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!u.rows[0]) throw new MembershipError('NOT_FOUND', 'ไม่พบผู้ใช้', 404);
  const { rows } = await pool.query(
    `INSERT INTO memberships (user_id, plan, status, started_at, expires_at, updated_at) VALUES ($1, 'monthly', 'active', NOW(), NOW() + ($2 || ' days')::interval, NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'active', canceled_at = NULL, cancel_reason = NULL, updated_at = NOW(),
       expires_at = CASE WHEN memberships.status = 'canceled' THEN NOW() ELSE GREATEST(memberships.expires_at, NOW()) END + ($2 || ' days')::interval
     RETURNING expires_at`, [userId, String(days)]);
  await audit({ actorId: adminId, action: 'membership_grant', targetUser: userId, details: { days, note, expiresAt: rows[0].expires_at } });
  return status(userId);
}
async function revoke(adminId, userIdIn, noteIn) {
  const userId = Number(userIdIn);
  const note = cleanNote(noteIn, 200);
  if (!note) throw new MembershipError('NOTE_REQUIRED', 'กรุณาระบุเหตุผล (เช่น คืนเงินแล้ว)');
  const { rows } = await pool.query(
    `UPDATE memberships SET status = 'canceled', canceled_at = NOW(), cancel_reason = $2, expires_at = LEAST(expires_at, NOW()), updated_at = NOW()
      WHERE user_id = $1 AND status <> 'canceled' RETURNING user_id`, [userId, note]);
  if (!rows[0]) throw new MembershipError('NOT_ACTIVE', 'ผู้ใช้นี้ไม่มีสิทธิ์ที่ยกเลิกได้', 409);
  await audit({ actorId: adminId, action: 'membership_revoke', targetUser: userId, details: { note } });
  notify(userId, { title: 'สิทธิ์ Premium ถูกยกเลิก', body: note, url: '/#/premium', tag: 'eq-membership' });
  return status(userId);
}
/** v1.10.0 Phase 5: ทำเครื่องหมาย/ยกเลิก "บัญชีทดสอบ" — ไม่แสดงในกระดานอันดับ (ข้อมูลอื่นไม่เปลี่ยน) · บันทึก audit */
async function setTestFlag(adminId, userIdIn, isTestIn) {
  const userId = Number(userIdIn);
  if (!Number.isInteger(userId) || userId <= 0) throw new MembershipError('BAD_USER', 'รหัสผู้ใช้ไม่ถูกต้อง');
  if (typeof isTestIn !== 'boolean') throw new MembershipError('BAD_FLAG', 'ต้องระบุ isTest เป็น true/false');
  const { rows } = await pool.query('UPDATE users SET is_test = $2 WHERE id = $1 RETURNING id, username, is_test', [userId, isTestIn]);
  if (!rows[0]) throw new MembershipError('NOT_FOUND', 'ไม่พบผู้ใช้นี้', 404);
  await audit({ actorId: adminId, action: isTestIn ? 'test_flag_on' : 'test_flag_off', targetUser: userId, details: {} });
  return { userId, isTest: rows[0].is_test };
}
async function auditList(limitIn = 50) {
  const limit = Math.min(200, Math.max(1, Number(limitIn) || 50));
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.target_ref, a.details, a.created_at, au.username AS actor, tu.username AS target
       FROM audit_logs a LEFT JOIN users au ON au.id = a.actor_id LEFT JOIN users tu ON tu.id = a.target_user
      ORDER BY a.created_at DESC LIMIT $1`, [limit]);
  return { logs: rows.map((r) => ({ id: Number(r.id), action: r.action, ref: r.target_ref, details: r.details, at: r.created_at, actor: r.actor || 'ระบบอัตโนมัติ', target: r.target })) };
}

module.exports = { MembershipError, overview, status, isPremium, startTrial, createOrder, getOrder, submitSlip, cancel,
  adminList, adminSlip, approve, reject, reverify, adminMembers, grant, revoke, setTestFlag, auditList, STATE_TH, _internal: { parseSlip, payment, expireStale } };
