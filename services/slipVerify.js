/*
  ตรวจสลิปอัตโนมัติผ่านผู้ให้บริการตรวจสลิปกับธนาคาร (SlipOK)
  - ตั้งค่า: SLIPOK_API_KEY + SLIPOK_BRANCH_ID (ไม่ตั้ง = ปิด → ผู้ดูแลตรวจเอง)
  - ส่งรูปสลิปไปให้ผู้ให้บริการอ่าน QR บนสลิปแล้วถามธนาคาร → ได้ยอดจริง เลขอ้างอิง เวลา ผู้รับ
  - อนุมัติอัตโนมัติเฉพาะเมื่อ "ผ่านทุกข้อ": ธนาคารยืนยันสลิป · ยอดตรงทุกสตางค์ · เวลาโอนหลังสร้างคำสั่งซื้อ · ผู้รับตรงบัญชีของเรา · เลขอ้างอิงไม่เคยใช้
  - ไม่ผ่าน / ระบบผู้ให้บริการขัดข้อง → ไม่ปฏิเสธเอง แต่ส่งเข้าคิวให้ผู้ดูแลตรวจพร้อมเหตุผล
  - ข้อมูลผู้รับจากธนาคารถูกปิดบางส่วน (เช่น xxx-xxx-8064 / ชื่อย่อ) → เทียบเลขท้ายหรือชื่อ
*/
const PROVIDER = 'slipok';
let transport = null;   // ชุดทดสอบใส่ตัวจำลองแทนการเรียก API จริง

const config = () => ({
  key: process.env.SLIPOK_API_KEY || '',
  branch: String(process.env.SLIPOK_BRANCH_ID || '').replace(/\D/g, ''),
});
const enabled = () => Boolean(transport) || Boolean(config().key && config().branch);

async function callSlipOk(buf, mime, amountBaht) {
  if (transport) return transport({ buf, mime, amount: amountBaht });
  const { key, branch } = config();
  const form = new FormData();
  form.append('files', new Blob([buf], { type: mime }), mime === 'image/png' ? 'slip.png' : 'slip.jpg');
  form.append('amount', String(amountBaht));
  const res = await fetch(`https://api.slipok.com/api/line/apikey/${branch}`, {
    method: 'POST', headers: { 'x-authorization': key }, body: form, signal: AbortSignal.timeout(15000),
  });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, body };
}

const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
/** ตัวเลขชุดท้ายที่มองเห็นในค่าที่ถูกปิดบัง เช่น "xxx-xxx-8064" → "8064" */
const visibleTail = (s) => { const m = /(\d[\d-]*)\s*$/.exec(String(s || '')); return m ? digits(m[1]) : ''; };
const PREFIX = /^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
const tokens = (s) => String(s || '').trim().replace(PREFIX, '').replace(/[.,]/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);

/** ผู้รับในสลิปตรงกับบัญชีของเราไหม: เลขท้ายพร้อมเพย์/บัญชี หรือ ชื่อ (ชื่อต้นตรง + นามสกุลขึ้นต้นตรง) */
function receiverMatches(rcv, payee) {
  if (!rcv) return false;
  const id = digits(payee.id);
  const suffix = digits(payee.accountSuffix);
  for (const v of [rcv.proxy && rcv.proxy.value, rcv.account && rcv.account.value]) {
    const tail = visibleTail(v);
    if (tail.length >= 3) {
      const local = id.startsWith('66') && id.length === 11 ? `0${id.slice(2)}` : id;
      if ((local && local.endsWith(tail)) || (suffix && (suffix.endsWith(tail) || tail.endsWith(suffix)))) return true;
    }
  }
  const mine = [payee.name, payee.nameEn].filter(Boolean).map(tokens);
  const theirs = [rcv.displayName, rcv.name].filter((x) => typeof x === 'string').map(tokens);
  return theirs.some((t) => t.length && mine.some((m) => m.length && m[0] === t[0] && (!t[1] || !m[1] || m[1].startsWith(t[1]))));
}

function slipTime(d) {
  if (d.transTimestamp && !Number.isNaN(Date.parse(d.transTimestamp))) return Date.parse(d.transTimestamp);
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(d.transDate || ''));
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(d.transTime || ''));
  if (m && t) return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${t[1]}:${t[2]}:${t[3] || '00'}+07:00`);
  return null;
}

/** ตัดสินจากผลของผู้ให้บริการ — คืน { status: passed|failed|error, note, transRef } */
function evaluate(order, resp, payee, now = Date.now()) {
  const body = resp && resp.body;
  const d = body && body.data;
  if (!resp || resp.status >= 500 || !body) return { status: 'error', note: 'ระบบตรวจสลิปไม่ตอบสนอง' };
  if (!(body.success === true && d && d.success !== false)) {
    const msg = String((body && (body.message || (d && d.message))) || 'ตรวจสอบสลิปกับธนาคารไม่ผ่าน').slice(0, 120);
    return { status: resp.status >= 400 && resp.status !== 400 ? 'error' : 'failed', note: msg };
  }
  const transRef = String(d.transRef || '').slice(0, 40);
  if (!transRef) return { status: 'failed', note: 'ไม่พบเลขอ้างอิงธุรกรรมในสลิป' };
  const paid = Math.round(Number(d.amount) * 100);
  if (paid !== order.amount_satang) {
    return { status: 'failed', note: `ยอดในสลิป ฿${(paid / 100).toFixed(2)} ไม่ตรงกับยอดที่ต้องโอน ฿${(order.amount_satang / 100).toFixed(2)}`, transRef };
  }
  const at = slipTime(d);
  if (at === null) return { status: 'failed', note: 'ไม่พบเวลาโอนในสลิป', transRef };
  if (at < Date.parse(order.created_at) - 10 * 60000) return { status: 'failed', note: 'สลิปนี้โอนก่อนสร้างคำสั่งซื้อ', transRef };
  if (at > now + 2 * 60000) return { status: 'failed', note: 'เวลาโอนในสลิปไม่ถูกต้อง', transRef };
  if (!receiverMatches(d.receiver, payee)) return { status: 'failed', note: 'ผู้รับเงินในสลิปไม่ใช่บัญชีของ EnglishQuest', transRef };
  return { status: 'passed', note: 'ธนาคารยืนยันสลิป · ยอด เวลา ผู้รับ ตรงทั้งหมด', transRef };
}

async function verify(order, slip, payee) {
  if (!enabled()) return { status: 'skipped', note: 'ยังไม่ได้เปิดตรวจสลิปอัตโนมัติ', provider: null };
  try {
    const resp = await callSlipOk(slip.buf, slip.mime, (order.amount_satang / 100).toFixed(2));
    return { ...evaluate(order, resp, payee), provider: PROVIDER };
  } catch (err) {
    return { status: 'error', note: err && err.name === 'TimeoutError' ? 'ระบบตรวจสลิปตอบช้าเกินไป' : 'เชื่อมต่อระบบตรวจสลิปไม่ได้', provider: PROVIDER };
  }
}

module.exports = { enabled, verify, _internal: { evaluate, receiverMatches, visibleTail, slipTime, setTransport: (fn) => { transport = fn; } } };
