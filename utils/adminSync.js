/*
  กำหนดผู้ดูแลระบบ (admin) จากตัวแปร ADMIN_EMAILS บน Railway

    ADMIN_EMAILS=you@gmail.com,teacher@school.ac.th

  หลักการ:
    - ADMIN_EMAILS เป็นแหล่งความจริงเดียว: อีเมลในรายการ = admin, คนที่เคยเป็นแต่ถูกเอาออก = user
    - ไม่ตั้งค่า = ไม่มีใครเป็น admin (ค่าเริ่มต้นที่ปลอดภัย)
    - แตะเฉพาะค่า 'admin'/'user' — role อื่นในอนาคต (เช่น 'teacher') ไม่ถูกเขียนทับ
    - ไม่ hard-code อีเมลในโค้ด
*/

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

// sync ทั้งระบบ (เรียกตอนเซิร์ฟเวอร์บูต)
// v1.18.4 ความปลอดภัย: เลื่อนเป็น admin เฉพาะบัญชีที่ "ยืนยันอีเมลแล้ว" (อีเมลยืนยัน/Google) — กันคนสมัครด้วยอีเมลแอดมินที่ยังไม่มีเจ้าของ
//   admin เดิมที่ยังอยู่ในรายการคงสิทธิ์ไว้ (ไม่ลดสิทธิ์เจ้าของระบบที่สมัครก่อนมีกฎนี้) · ถูกเอาออกจากรายการ = user เหมือนเดิม
async function syncAdmins(pool) {
  const list = adminEmails();
  const res = await pool.query(
    `UPDATE users
        SET role = CASE WHEN LOWER(email) = ANY($1::text[]) THEN 'admin' ELSE 'user' END
      WHERE (role = 'admin' AND NOT (LOWER(email) = ANY($1::text[])))
         OR (role = 'user' AND LOWER(email) = ANY($1::text[]) AND email_verified)
      RETURNING username, role`,
    [list]
  );
  if (res.rowCount > 0) {
    console.log(`[admin] อัปเดตสิทธิ์ ${res.rowCount} บัญชี`);
  }
  console.log(`[admin] มีอีเมลผู้ดูแลที่ตั้งไว้ ${list.length} รายการ`);
  return res.rowCount;
}

// ใช้ตอนสร้างบัญชี: เป็น admin ได้เฉพาะเมื่ออีเมล "ยืนยันแล้ว" (Google) · สมัครด้วยรหัสผ่าน = user ก่อน แล้วเลื่อนเมื่อยืนยันอีเมล
function roleForEmail(email, verified = false) {
  return verified && adminEmails().includes(String(email || '').toLowerCase()) ? 'admin' : 'user';
}

/** หลังยืนยันอีเมล/เชื่อม Google: ถ้าอีเมลอยู่ในรายการแอดมิน -> เลื่อนเป็น admin */
async function promoteIfAdmin(db, userId) {
  const list = adminEmails();
  if (!list.length) return false;
  const r = await db.query(
    `UPDATE users SET role = 'admin' WHERE id = $1 AND role = 'user' AND email_verified AND LOWER(email) = ANY($2::text[]) RETURNING id`,
    [userId, list]);
  return r.rowCount > 0;
}

module.exports = { syncAdmins, roleForEmail, promoteIfAdmin, adminEmails };
