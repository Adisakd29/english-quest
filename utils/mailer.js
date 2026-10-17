/*
  ระบบส่งอีเมล — ใช้สำหรับส่งลิงก์รีเซ็ตรหัสผ่าน

  ตั้งค่าผ่าน Environment Variables บน Railway:
    SMTP_HOST   เช่น smtp.gmail.com
    SMTP_PORT   เช่น 465 (SSL) หรือ 587 (TLS)
    SMTP_USER   อีเมลผู้ส่ง เช่น yourname@gmail.com
    SMTP_PASS   รหัสผ่านแอป (App Password) ไม่ใช่รหัสผ่านอีเมลปกติ
    MAIL_FROM   (ไม่บังคับ) ชื่อผู้ส่งที่แสดง เช่น "EnglishQuest <noreply@...>"
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

/*
  URL ของเว็บสำหรับลิงก์ในอีเมล
  ความปลอดภัย: เดิมเดาจาก header X-Forwarded-Host ซึ่งผู้ส่งคำขอกำหนดเองได้
  -> ผู้โจมตีขอรีเซ็ตรหัสของเหยื่อพร้อมโดเมนตัวเอง ลิงก์ในอีเมลจะชี้ไปโดเมนนั้น (Password Reset Poisoning)
  ตอนนี้: ใช้ APP_URL ถ้าตั้งไว้ (แนะนำใน production) ไม่งั้นใช้ Host ที่คำขอส่งมาถึงเซิร์ฟเวอร์จริงเท่านั้น
*/
function appUrl(req) {
  if (APP_URL) return APP_URL.replace(/\/+$/, '');
  const xf = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xf === 'http' || xf === 'https' ? xf : (req.protocol === 'http' ? 'http' : 'https');
  return `${proto}://${req.get('host')}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// แม่แบบอีเมลกลาง (ใช้ร่วมกันทุกอีเมลของระบบ) — escape ทุกค่าที่มาจากผู้ใช้
function emailLayout({ subtitle, name, intro, buttonText, link, note, footer }) {
  return `
<div style="font-family:'Segoe UI',Tahoma,sans-serif;background:#F6F7FB;padding:28px;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:28px 30px;border:1px solid #E3E6F0;">
    <div style="font-size:24px;font-weight:800;color:#4F46E5;margin-bottom:4px;"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#FF6F3C;vertical-align:-3px;margin-right:8px;"></span>EnglishQuest</div>
    <div style="color:#575C7A;font-size:13px;margin-bottom:22px;">${esc(subtitle)}</div>
    <p style="color:#1F2340;font-size:15px;line-height:1.7;margin:0 0 16px;">สวัสดีคุณ <b>${esc(name)}</b><br>${esc(intro)}</p>
    <div style="text-align:center;margin:26px 0;">
      <a href="${esc(link)}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:15px;">${esc(buttonText)}</a>
    </div>
    <p style="color:#575C7A;font-size:13px;line-height:1.7;margin:0 0 8px;">${esc(note)}<br>ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:</p>
    <p style="word-break:break-all;font-size:12px;color:#575C7A;margin:0 0 20px;">${esc(link)}</p>
    <hr style="border:none;border-top:1px solid #E3E6F0;margin:20px 0;">
    <p style="color:#575C7A;font-size:12px;line-height:1.6;margin:0;">${esc(footer)}</p>
  </div>
</div>`;
}

async function deliver({ to, subject, html, text, kind, link }) {
  if (!smtpConfigured) {
    // โหมดไม่มี SMTP — พิมพ์ลิงก์ลง log ให้แอดมินเอาไปส่งเองได้
    console.log('──────────────────────────────────────────────');
    console.log(`[mailer] ยังไม่ได้ตั้งค่า SMTP จึงไม่ได้ส่งอีเมลจริง — ลิงก์${kind}ของ`, to, ':');
    console.log('[mailer]', link);
    console.log('──────────────────────────────────────────────');
    return { sent: false, logged: true };
  }
  await transporter.sendMail({ from: MAIL_FROM || `EnglishQuest <${SMTP_USER}>`, to, subject, html, text });
  return { sent: true, logged: false };
}

async function sendResetEmail({ to, username, link }) {
  return deliver({
    to, link, kind: 'รีเซ็ตรหัสผ่าน',
    subject: 'ตั้งรหัสผ่านใหม่ — EnglishQuest',
    html: emailLayout({
      subtitle: 'ตั้งรหัสผ่านใหม่', name: username,
      intro: 'เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ได้เลย',
      buttonText: 'ตั้งรหัสผ่านใหม่', link, note: 'ลิงก์นี้ใช้ได้ 1 ชั่วโมง และใช้ได้เพียงครั้งเดียว',
      footer: 'ถ้าคุณไม่ได้เป็นคนขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้งานได้ตามปกติ',
    }),
    text: `สวัสดีคุณ ${username}\n\nเปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ 1 ชั่วโมง):\n${link}\n\nถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไร`,
  });
}

async function sendVerifyEmail({ to, username, link }) {
  return deliver({
    to, link, kind: 'ยืนยันอีเมล',
    subject: 'ยืนยันอีเมลของคุณ — EnglishQuest',
    html: emailLayout({
      subtitle: 'ยืนยันอีเมล', name: username,
      intro: 'ขอบคุณที่สมัครเรียนกับ EnglishQuest กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ',
      buttonText: 'ยืนยันอีเมล', link, note: 'ลิงก์นี้ใช้ได้ 24 ชั่วโมง และใช้ได้เพียงครั้งเดียว',
      footer: 'ถ้าคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร บัญชีจะไม่ถูกใช้งาน',
    }),
    text: `สวัสดีคุณ ${username}\n\nเปิดลิงก์นี้เพื่อยืนยันอีเมล (ใช้ได้ 24 ชั่วโมง):\n${link}\n\nถ้าคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร`,
  });
}

module.exports = { sendResetEmail, sendVerifyEmail, isMailEnabled, appUrl };
