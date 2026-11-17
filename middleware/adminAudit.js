/*
  v1.18.4 บันทึกการกระทำของผู้ดูแลระบบลง audit_logs อัตโนมัติ (เดิมบันทึกแค่ธงบัญชีทดสอบ)
  - ทุกคำขอที่ "แก้ข้อมูล" (POST/PUT/PATCH/DELETE) บนเส้นทางของผู้ดูแล (/admin, admin-grant) ที่สำเร็จ (status < 400)
  - การ "เปิดดูแชทของผู้ใช้" (GET /api/admin/moderation/chat)
  บันทึก: ใคร · ทำอะไร (method + path) · ผลลัพธ์ · ช่องข้อมูลที่ส่ง (ตัดค่ายาว ไม่บันทึกรหัสผ่าน/โทเคน)
  ไม่ทำให้คำขอหลักช้า/ล้ม (บันทึกหลังตอบแล้ว)
*/
const { audit } = require('../utils/audit');

const SECRET_KEY = /pass|token|secret|key|otp|code/i;
function summarize(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(body).slice(0, 20)) {
    if (SECRET_KEY.test(k)) { out[k] = '[ซ่อน]'; continue; }
    if (v === null || ['number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v;
    else out[k] = Array.isArray(v) ? `[${v.length} รายการ]` : '{…}';
  }
  return out;
}
const isAdminPath = (p) => /\/admin(\/|-|$)|admin-grant/.test(p);
const isChatView = (method, p) => method === 'GET' && /^\/api\/admin\/moderation\/chat/.test(p);

function adminAudit(req, res, next) {
  const p = (req.originalUrl || '').split('?')[0];
  const write = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (!isAdminPath(p) || !(write || isChatView(req.method, p))) return next();
  if (/^\/api\/admin\/users\/\d+\/(test-flag|suspend)$/.test(p)) return next();   // บันทึกละเอียดในบริการเองแล้ว
  res.on('finish', () => {
    if (req.userRole !== 'admin' || res.statusCode >= 400) return;
    const targetUser = Number((req.body && (req.body.userId || req.body.targetUserId)) || (req.query && req.query.userId)) || null;
    audit({
      actorId: req.userId || null,
      action: isChatView(req.method, p) ? 'admin_view_chat' : `admin_${req.method.toLowerCase()}`,
      targetUser: Number.isInteger(targetUser) && targetUser > 0 ? targetUser : null,
      targetRef: p.replace(/^\/api\//, '').slice(0, 40),
      details: { path: p.slice(0, 200), status: res.statusCode, body: write ? summarize(req.body) : null, query: isChatView(req.method, p) ? summarize(req.query) : undefined },
    });
  });
  return next();
}
module.exports = { adminAudit, _summarize: summarize };
