/*
  PromptPay QR (มาตรฐาน EMVCo / Thai QR Payment) — สร้าง payload พร้อมยอดเงิน
  - เป้าหมาย: เบอร์มือถือ 10 หลัก (0xxxxxxxxx) · เลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก · e-Wallet 15 หลัก
  - มียอด → QR แบบใช้ครั้งเดียว (Point of Initiation 12) · ไม่มียอด → QR ถาวร (11)
*/
const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;

function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i += 1) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** แปลงเบอร์/เลขบัญชีพร้อมเพย์เป็น sub-tag ของ tag 29 · ไม่ถูกต้อง = null */
function target(idIn) {
  const id = String(idIn || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(id)) return f('01', `0066${id.slice(1)}`);
  if (/^\d{13}$/.test(id)) return f('02', id);
  if (/^\d{15}$/.test(id)) return f('03', id);
  return null;
}

function payload(id, amountBaht = null) {
  const t = target(id);
  if (!t) throw new Error('PROMPTPAY_ID ไม่ถูกต้อง');
  const amount = amountBaht == null ? null : Number(amountBaht);
  if (amount !== null && !(amount > 0 && amount < 1e7)) throw new Error('ยอดเงินไม่ถูกต้อง');
  const body = f('00', '01') + f('01', amount === null ? '11' : '12')
    + f('29', f('00', 'A000000677010111') + t)
    + f('53', '764')
    + (amount === null ? '' : f('54', amount.toFixed(2)))
    + f('58', 'TH') + '6304';
  return body + crc16(body);
}

const valid = (id) => Boolean(target(id));

module.exports = { payload, crc16, valid };
