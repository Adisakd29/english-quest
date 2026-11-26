/*
  v1.28.0 บอร์ดผู้สนับสนุน — จัดอันดับผู้โดเนทผ่าน ezdn.app ตามยอดรวม
  - แอปไม่ได้เชื่อมกับ ezdn โดยตรง → ผู้ดูแลนำเข้ารายการจากหน้าประวัติโดเนท (ต้องใส่เหตุผล · บันทึก Audit Log)
  - เก็บเฉพาะชื่อที่ผู้โดเนทตั้งเองบน ezdn · ยอด · เวลา · ช่องทาง — ไม่เก็บข้อความโดเนท / ชื่อบัญชีธนาคาร / ข้อมูลติดต่อ
  - ชื่อเดียวกัน (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง) รวมยอดเป็นคนเดียว · ซ่อนรายการได้ (ไม่ลบ)
  - ผู้ดูแลปิดการแสดงยอดเงินได้ (แสดงเฉพาะอันดับ + ระดับ)
*/
const pool = require('../config/db');

class SupporterError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const TIERS = [   // ตามยอดรวม (บาท)
  { id: 'gold', th: 'ทอง', min: 500 },
  { id: 'silver', th: 'เงิน', min: 100 },
  { id: 'bronze', th: 'ทองแดง', min: 0 },
];
const tierOf = (baht) => TIERS.find((t) => baht >= t.min) || TIERS[TIERS.length - 1];
const TH_MONTH = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
const MAX_LINES = 200;

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

/* เวลาไทย (UTC+7) → Date */
function bkk(y, mo, d, h = 0, mi = 0, s = 0) {
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && s <= 59)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, h - 7, mi, s));
  return Number.isNaN(dt.getTime()) ? null : dt;
}
/* รับ: 2026-11-09 09:28[:15] · 09/11/2026 09:28 · 09 พ.ย. 09:28:15 (ไม่มีปี = ปีล่าสุดที่ไม่เกินวันนี้) · ปี พ.ศ. แปลงให้ */
function parseDate(raw, now = new Date()) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) { let y = +m[1]; if (y > 2400) y -= 543; return bkk(y, +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) { let y = +m[3]; if (y > 2400) y -= 543; return bkk(y, +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
  m = /^(\d{1,2})\s*([ก-๙]{1,4}\.[ก-๙]{1,2}\.)\s*(\d{4})?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m && TH_MONTH[m[2]]) {
    let y = m[3] ? +m[3] : new Date(now.getTime() + 7 * 3600e3).getUTCFullYear();
    if (y > 2400) y -= 543;
    let dt = bkk(y, TH_MONTH[m[2]], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (dt && !m[3] && dt.getTime() > now.getTime() + 3600e3) dt = bkk(y - 1, TH_MONTH[m[2]], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return dt;
  }
  return null;
}

/* แต่ละบรรทัด: "ชื่อ ยอด" หรือ ชื่อ | ยอด | วันเวลา(ไม่บังคับ) | ช่องทาง(ไม่บังคับ) — คั่นด้วย | หรือ Tab */
function parseImport(text, now = new Date()) {
  const rows = []; const errors = [];
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_LINES) throw new SupporterError('TOO_MANY', `นำเข้าได้ครั้งละไม่เกิน ${MAX_LINES} บรรทัด`);
  lines.forEach((line, i) => {
    // v1.28.0 ใส่แค่ "ชื่อ ยอด" ได้ (ไม่มี | ) — ตัวเลขท้ายบรรทัดคือยอด · วันเวลา/ช่องทางไม่บังคับ (ไม่ใส่ = เวลาที่นำเข้า)
    const simple = /[|\t]/.test(line) ? null : /^(.*\S)\s+([\d,]+(?:\.\d+)?)\s*(?:บาท|฿)?$/.exec(line);
    const p = simple ? [simple[1], simple[2]] : line.split(/\s*[|\t]\s*/);
    const name = cleanName(p[0]);
    const amt = Number(String(p[1] || '').replace(/บาท|฿|,|\s/g, ''));
    const noDate = !String(p[2] || '').trim();
    const at = noDate ? now : parseDate(p[2], now);
    const channel = cleanName(p[3]).slice(0, 20) || null;
    if (!name) errors.push({ line: i + 1, error: 'ไม่มีชื่อ' });
    else if (!(amt > 0 && amt <= 1000000)) errors.push({ line: i + 1, error: 'ยอดเงินไม่ถูกต้อง' });
    else if (!at) errors.push({ line: i + 1, error: 'วันเวลาไม่ถูกต้อง (เช่น 09 พ.ย. 09:28:15 หรือ 2026-11-09 09:28)' });
    else if (at.getTime() > now.getTime() + 3600e3) errors.push({ line: i + 1, error: 'วันเวลาอยู่ในอนาคต' });
    else rows.push({ name, satang: Math.round(amt * 100), at, channel, noDate });
  });
  return { rows, errors };
}

async function getSettings() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'supporters'");
  let v = {}; try { v = rows[0] ? JSON.parse(rows[0].value) : {}; } catch (_) { v = {}; }
  return { showAmounts: v.showAmounts !== false };
}

/* สาธารณะ: อันดับตามยอดรวม (รายการที่ไม่ซ่อน) */
async function board({ limit = 20 } = {}) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 20));
  const st = await getSettings();
  const { rows } = await pool.query(
    `SELECT (array_agg(display_name ORDER BY donated_at DESC))[1] AS name, SUM(amount_satang)::bigint AS total, COUNT(*)::int AS n, MIN(donated_at) AS first_at
       FROM supporter_donations WHERE NOT hidden
      GROUP BY lower(regexp_replace(display_name, '\\s+', '', 'g'))
      ORDER BY total DESC, first_at ASC LIMIT $1`, [lim]);
  const cnt = await pool.query("SELECT COUNT(DISTINCT lower(regexp_replace(display_name, '\\s+', '', 'g')))::int AS n FROM supporter_donations WHERE NOT hidden");
  return {
    showAmounts: st.showAmounts,
    supporters: cnt.rows[0].n,
    tiers: TIERS.map(({ id, th, min }) => ({ id, th, min })),
    top: rows.map((r, i) => {
      const baht = Number(r.total) / 100; const t = tierOf(baht);
      return { rank: i + 1, name: r.name, tier: t.id, tierTh: t.th, times: r.n, ...(st.showAmounts ? { total: baht } : {}) };
    }),
  };
}

const needReason = (reason) => {
  const r = String(reason || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
  if (r.length < 3) throw new SupporterError('REASON', 'ต้องใส่เหตุผล');
  return r;
};
const log = (client, adminId, action, detail, reason) => client.query(
  'INSERT INTO supporter_admin_logs (admin_id, action, detail, reason) VALUES ($1, $2, $3, $4)', [adminId, action, String(detail || '').slice(0, 300), reason]);

async function adminImport(adminId, { text, reason, dryRun } = {}) {
  const why = needReason(reason);
  const { rows, errors } = parseImport(text);
  // ไม่ใส่วันเวลา = กันซ้ำด้วยเวลาไม่ได้ → แจ้งเตือนรายการที่ชื่อ+ยอดตรงกับที่มีอยู่แล้ว (อาจนำเข้าซ้ำ หรือโดเนทซ้ำจริง)
  const maybeDup = [];
  for (const r of rows.filter((x) => x.noDate)) {
    const q = await pool.query('SELECT 1 FROM supporter_donations WHERE lower(display_name) = lower($1) AND amount_satang = $2 LIMIT 1', [r.name, r.satang]);
    if (q.rowCount) maybeDup.push({ name: r.name, amount: r.satang / 100 });
  }
  if (dryRun || errors.length) return { dryRun: true, ok: rows.length, errors, maybeDup, preview: rows.slice(0, 50).map((r) => ({ name: r.name, amount: r.satang / 100, at: r.noDate ? null : r.at.toISOString(), channel: r.channel })) };
  if (!rows.length) throw new SupporterError('EMPTY', 'ไม่มีรายการให้นำเข้า');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let added = 0;
    rows.forEach((r, i) => { if (r.noDate) r.at = new Date(r.at.getTime() + i); });   // บรรทัดไม่มีวันเวลาในชุดเดียวกัน ไม่ชนกันเอง
    for (const r of rows) {
      const q = await client.query(
        `INSERT INTO supporter_donations (display_name, amount_satang, channel, donated_at, created_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`, [r.name, r.satang, r.channel, r.at, adminId]);
      added += q.rowCount;
    }
    await log(client, adminId, 'import', `นำเข้า ${added}/${rows.length} รายการ (ซ้ำ ${rows.length - added})`, why);
    await client.query('COMMIT');
    return { added, duplicates: rows.length - added };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function adminList() {
  const { rows } = await pool.query(
    `SELECT id, display_name, amount_satang, channel, donated_at, hidden FROM supporter_donations ORDER BY donated_at DESC LIMIT 500`);
  const logs = await pool.query(
    `SELECT l.action, l.detail, l.reason, l.created_at, u.username FROM supporter_admin_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 30`);
  return {
    settings: await getSettings(),
    donations: rows.map((r) => ({ id: r.id, name: r.display_name, amount: r.amount_satang / 100, channel: r.channel, at: r.donated_at, hidden: r.hidden })),
    logs: logs.rows.map((l) => ({ action: l.action, detail: l.detail, reason: l.reason, at: l.created_at, by: l.username })),
  };
}

async function adminSetHidden(adminId, id, { hidden, reason } = {}) {
  const why = needReason(reason);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('UPDATE supporter_donations SET hidden = $2 WHERE id = $1 RETURNING display_name, amount_satang', [Number(id) || 0, Boolean(hidden)]);
    if (!q.rowCount) throw new SupporterError('NOT_FOUND', 'ไม่พบรายการ', 404);
    await log(client, adminId, hidden ? 'hide' : 'unhide', `#${id} ${q.rows[0].display_name} ${q.rows[0].amount_satang / 100} บาท`, why);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function adminSettings(adminId, { showAmounts, reason } = {}) {
  const why = needReason(reason);
  const v = { showAmounts: showAmounts !== false };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ('supporters', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(v)]);
    await log(client, adminId, 'settings', `แสดงยอดเงิน: ${v.showAmounts ? 'เปิด' : 'ปิด'}`, why);
    await client.query('COMMIT');
    return v;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

module.exports = { SupporterError, board, adminImport, adminList, adminSetHidden, adminSettings, parseImport, parseDate, tierOf, TIERS };
