/*
  ระบบส่งอีเมล — ใช้สำหรับส่งลิงก์รีเซ็ตรหัสผ่าน

  ตั้งค่าผ่าน Environment Variables บน Railway:
    SMTP_HOST   เช่น smtp.gmail.com
    SMTP_PORT   เช่น 465 (SSL) หรือ 587 (TLS)
    SMTP_USER   อีเมลผู้ส่ง เช่น yourname@gmail.com
    SMTP_PASS   รหัสผ่านแอป (App Password) ไม่ใช่รหัสผ่านอีเมลปกติ
    MAIL_FROM   (ไม่บังคับ) ชื่อผู้ส่งที่แสดง เช่น "WordQuest <noreply@...>"
    APP_URL     (ไม่บังคับ) URL ของเว็บ เช่น https://english-quest.up.railway.app

  ถ้ายังไม่ได้ตั้งค่า SMTP ระบบจะไม่ส่งอีเมลจริง แต่จะพิมพ์ลิงก์รีเซ็ต
  ออกทาง log ของเซิร์ฟเวอร์แทน (ดูได้ใน Railway → Deployments → View Logs)
  เพื่อให้ทดสอบได้โดยไม่ต้องตั้งค่าอะไรเลย
*/

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_err) {
  // ยังไม่ได้ติดตั้ง nodemailer — จะทำงานในโหมด log อย่างเดียว
}

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL,
} = process.env;

const smtpConfigured = Boolean(nodemailer && SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (smtpConfigured) {
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL, ส่วน 587 ใช้ STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function isMailEnabled() {
  return smtpConfigured;
}

function appUrl(req) {
  if (APP_URL) return APP_URL.replace(/\/+$/, '');
  // เดาจาก request ถ้าไม่ได้ตั้งค่าไว้
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function resetEmailHtml(username, link) {
  return `
<div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f4f1ea;padding:28px;">
  <div style="max-width:520px;margin:0 auto;background:#fffaf2;border-radius:14px;
              padding:28px 30px;border:1px solid #e6dcc8;">
    <div style="font-size:26px;font-weight:800;color:#c96a2a;margin-bottom:4px;">
      🦊 WordQuest
    </div>
    <div style="color:#6a6189;font-size:13px;margin-bottom:22px;">
      ตั้งรหัสผ่านใหม่
    </div>

    <p style="color:#2b2440;font-size:15px;line-height:1.7;margin:0 0 16px;">
      สวัสดีคุณ <b>${username}</b><br>
      เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ
      กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ได้เลย
    </p>

    <div style="text-align:center;margin:26px 0;">
      <a href="${link}"
         style="display:inline-block;background:#e07b3c;color:#fff;text-decoration:none;
                padding:13px 30px;border-radius:10px;font-weight:700;font-size:15px;">
        ตั้งรหัสผ่านใหม่
      </a>
    </div>

    <p style="color:#6a6189;font-size:13px;line-height:1.7;margin:0 0 8px;">
      ลิงก์นี้ใช้ได้ <b>1 ชั่วโมง</b> และใช้ได้เพียงครั้งเดียว<br>
      ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:
    </p>
    <p style="word-break:break-all;font-size:12px;color:#8a7fb0;margin:0 0 20px;">
      ${link}
    </p>

    <hr style="border:none;border-top:1px solid #e6dcc8;margin:20px 0;">
    <p style="color:#8a7fb0;font-size:12px;line-height:1.6;margin:0;">
      ถ้าคุณไม่ได้เป็นคนขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไรครับ
      รหัสผ่านเดิมของคุณจะยังใช้งานได้ตามปกติ
    </p>
  </div>
</div>`;
}

async function sendResetEmail({ to, username, link }) {
  if (!smtpConfigured) {
    // โหมดไม่มี SMTP — พิมพ์ลิงก์ลง log ให้แอดมินเอาไปส่งเองได้
    console.log('──────────────────────────────────────────────');
    console.log('[mailer] ยังไม่ได้ตั้งค่า SMTP จึงไม่ได้ส่งอีเมลจริง');
    console.log('[mailer] ลิงก์รีเซ็ตรหัสผ่านของ', to, ':');
    console.log('[mailer]', link);
    console.log('──────────────────────────────────────────────');
    return { sent: false, logged: true };
  }

  await transporter.sendMail({
    from: MAIL_FROM || `WordQuest <${SMTP_USER}>`,
    to,
    subject: 'ตั้งรหัสผ่านใหม่ — WordQuest',
    html: resetEmailHtml(username, link),
    text: `สวัสดีคุณ ${username}\n\nเปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ 1 ชั่วโมง):\n${link}\n\nถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไรครับ`,
  });
  return { sent: true, logged: false };
}

module.exports = { sendResetEmail, isMailEnabled, appUrl };
