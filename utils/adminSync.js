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
async function syncAdmins(pool) {
  const list = adminEmails();
  const res = await pool.query(
    `UPDATE users
        SET role = CASE WHEN LOWER(email) = ANY($1::text[]) THEN 'admin' ELSE 'user' END
      WHERE role IN ('admin', 'user')
        AND role <> CASE WHEN LOWER(email) = ANY($1::text[]) THEN 'admin' ELSE 'user' END
      RETURNING username, role`,
    [list]
  );
  if (res.rowCount > 0) {
    console.log(`[admin] อัปเดตสิทธิ์ ${res.rowCount} บัญชี`);
  }
  console.log(`[admin] มีอีเมลผู้ดูแลที่ตั้งไว้ ${list.length} รายการ`);
  return res.rowCount;
}

// ใช้ตอนสมัครสมาชิก: ผู้ใช้ใหม่ที่อีเมลอยู่ในรายการเป็น admin ทันที
function roleForEmail(email) {
  return adminEmails().includes(String(email || '').toLowerCase()) ? 'admin' : 'user';
}

module.exports = { syncAdmins, roleForEmail, adminEmails };
