/*
  แจ้งเตือนบนโทรศัพท์ (Web Push) — เตือน "อย่าลืมเข้ามาเล่น" วันละไม่เกิน 1 ครั้ง
    - ส่งเฉพาะคนที่กดอนุญาตเอง · ปิด/เปลี่ยนเวลาได้ในหน้าโปรไฟล์
    - วันไหนเข้าแอปแล้ว = ไม่เตือน · เตือนเฉพาะ 06:00–21:30 ตามเวลาของผู้ใช้ (ไม่ปลุกกลางคืน)
    - VAPID key: ใช้ env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) ถ้าไม่ตั้ง สร้างให้อัตโนมัติแล้วเก็บในฐานข้อมูล (คงที่ข้าม deploy)
    - ส่งไปได้เฉพาะบริการ push ของเบราว์เซอร์จริง (Google / Mozilla / Apple / Microsoft) — กันการใช้เซิร์ฟเวอร์ยิงไปที่อื่น
*/
const webpush = require('web-push');
const pool = require('../config/db');

let keys = null;
let keysPromise = null;

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch (_) { return false; }
}

async function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const fresh = webpush.generateVAPIDKeys();
  await pool.query("INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(fresh)]);
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid'");
  return JSON.parse(rows[0].value);   // ถ้ามีอยู่แล้ว (หรือเครื่องอื่นสร้างพร้อมกัน) ใช้ของเดิมเสมอ
}

async function getKeys() {
  if (keys) return keys;
  if (!keysPromise) {
    keysPromise = loadKeys().then((k) => {
      const subject = process.env.VAPID_SUBJECT || (process.env.APP_URL && /^https:/.test(process.env.APP_URL) ? process.env.APP_URL : 'mailto:noreply@englishquest.app');
      webpush.setVapidDetails(subject, k.publicKey, k.privateKey);
      keys = k;
      return k;
    }).catch((err) => { keysPromise = null; throw err; });
  }
  return keysPromise;
}

/** ส่งแจ้งเตือนถึงทุกเครื่องของผู้ใช้ — คืนจำนวนเครื่องที่ส่งสำเร็จ (เครื่องที่ยกเลิกแล้วถูกลบออกเอง) */
async function sendToUser(userId, payload, { ttl = 6 * 3600, topic = null } = {}) {
  await getKeys();
  const { rows } = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
  let ok = 0;
  for (const s of rows) {
    if (!allowedEndpoint(s.endpoint)) { await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]); continue; }
    try {
      await sendRaw({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload),
        { TTL: ttl, urgency: 'normal', ...(topic ? { topic } : {}) });
      ok += 1;
      await pool.query('UPDATE push_subscriptions SET last_success_at = NOW(), fail_count = 0 WHERE id = $1', [s.id]);
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);   // ผู้ใช้ยกเลิก/ล้างเบราว์เซอร์แล้ว
      else {
        await pool.query('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = $1', [s.id]);
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1 AND fail_count >= 6', [s.id]);
        console.error('[push] ส่งไม่สำเร็จ', code || '', err.message);
      }
    }
  }
  return ok;
}
// แยกไว้ให้ชุดทดสอบแทนที่ได้ (ไม่ยิงออกเน็ตจริง)
let sendRaw = (sub, body, opts) => webpush.sendNotification(sub, body, opts);
function _setSender(fn) { sendRaw = fn || ((sub, body, opts) => webpush.sendNotification(sub, body, opts)); }

/* ---------------- ข้อความเตือน ---------------- */
function reminderMessage({ username, due, seed }) {
  const pool_ = [
    `${username} วันนี้ยังไม่ได้เข้ามาฝึกเลย — 5 นาทีก็พอ`,
    'จิ้งจอกรออยู่! มาเก็บ EXP ของวันนี้กัน',
    'แข่งแรงค์สักตาไหม? เล่นจบได้ทั้งแต้มแรงค์และ EXP',
    'วันละนิดก็ก้าวหน้า — มาเรียนคำศัพท์ใหม่กัน',
    'ภาษาอังกฤษเก่งได้ด้วยความสม่ำเสมอ วันนี้มาต่ออีกนิดนะ',
    `${username} เพื่อน ๆ กำลังไต่อันดับกันอยู่ อย่าลืมเข้ามานะ`,
  ];
  if (due > 0) {
    return { title: 'ฝึกต่ออีกนิด', body: `มีคำศัพท์ที่เรียนไว้ ${due.toLocaleString('th-TH')} คำรอฝึกซ้ำ — ฝึกวันนี้จำได้นานขึ้น`, url: '/#/learn' };
  }
  return { title: 'EnglishQuest', body: pool_[seed % pool_.length], url: '/#/home' };
}

/** หาและส่งเตือนคนที่ถึงเวลา — "จอง" วันนี้ด้วย UPDATE ก่อนส่ง (ไม่ส่งซ้ำแม้มีหลายเครื่อง/หลาย process) */
async function runReminders() {
  const { rows } = await pool.query(
    `UPDATE users u SET last_reminded_on = (NOW() AT TIME ZONE u.timezone)::date
      WHERE u.reminder_enabled
        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
        AND (NOW() AT TIME ZONE u.timezone)::time >= u.reminder_time
        AND (NOW() AT TIME ZONE u.timezone)::time < u.reminder_time + INTERVAL '2 hours'
        AND (u.last_reminded_on IS NULL OR u.last_reminded_on < (NOW() AT TIME ZONE u.timezone)::date)
        AND (u.last_seen IS NULL OR (u.last_seen AT TIME ZONE u.timezone)::date < (NOW() AT TIME ZONE u.timezone)::date)
      RETURNING u.id, u.username`);
  let sent = 0;
  for (const u of rows) {
    try {
      const due = (await pool.query('SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1 AND srs_due_at <= NOW()', [u.id])).rows[0].n;
      const msg = reminderMessage({ username: u.username, due, seed: new Date().getDate() + u.id });
      sent += await sendToUser(u.id, { ...msg, tag: 'eq-reminder' }, { topic: 'reminder' });
    } catch (err) { console.error('[push/reminder]', err.message); }
  }
  return { users: rows.length, sent };
}

let timer = null;
function startScheduler() {
  if (timer || process.env.PUSH_REMINDERS === 'off') return;
  const every = Number(process.env.PUSH_SWEEP_MS || 5 * 60 * 1000);
  const tick = () => runReminders().catch((err) => console.error('[push/scheduler]', err.message));
  timer = setInterval(tick, every);
  timer.unref();
  setTimeout(tick, 15000).unref();
}

module.exports = { getKeys, sendToUser, runReminders, startScheduler, allowedEndpoint, reminderMessage, _setSender };
