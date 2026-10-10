require('dotenv').config();
const http = require('http');
const pool = require('./config/db');
const { createApp } = require('./app');
const { runMigrations } = require('./db/migrate');
const { syncAdmins } = require('./utils/adminSync');

/*
  ย้ายความก้าวหน้าที่ยังใช้ ID เดิมไป ID ใหม่ (โหมด Oxford เท่านั้น)
  กรณี: เคยตั้ง VOCAB_SOURCE=legacy ตอน migration 021 รัน (จึงข้ามไป) หรือผู้ใช้เรียนระหว่างอยู่โหมด legacy
  แล้วภายหลังสลับกลับเป็น oxford — migration ไม่รันซ้ำ จึงต้องตรวจตอนเริ่มเซิร์ฟเวอร์ (idempotent)
*/
async function migrateLeftoverProgress() {
  if (process.env.VOCAB_SOURCE === 'legacy') return;
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM word_progress WHERE word_id !~ '-S[0-9]{4}$'"
  ).catch(() => ({ rows: [{ n: 0 }] }));
  if (rows[0].n === 0) return;
  const { migrateProgress } = require('./scripts/oxford/legacy');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await migrateProgress(client);
    await client.query('COMMIT');
    console.log(`[vocab] ย้ายความก้าวหน้าที่ค้าง ${r.removedLegacy} แถว -> ${r.inserted} แถว (สำรองไว้ใน word_progress_legacy)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[vocab] ย้ายความก้าวหน้าที่ค้างไม่สำเร็จ (ข้อมูลเดิมไม่ถูกแตะ):', err.message);
  } finally {
    client.release();
  }
}
const realtime = require('./realtime');
const rooms = require('./rooms');
const rankedPvp = require('./services/ranked/pvp');
const rankedTeams = require('./services/ranked/teams');

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // ข้อผิดพลาดที่ไม่ถูกดักถือว่า process อยู่ในสภาพไม่น่าเชื่อถือแล้ว
  // ปิดอย่างเป็นระเบียบแล้วให้ Railway รีสตาร์ตให้ ดีกว่าทำงานต่อแบบพัง ๆ
  process.exit(1);
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await runMigrations(pool);
    // กำหนดสิทธิ์ผู้ดูแลจาก ADMIN_EMAILS หลัง migration (ต้องมีคอลัมน์ role ก่อน)
    await syncAdmins(pool);
    await migrateLeftoverProgress();
  } catch (err) {
    // เปลี่ยนจากพฤติกรรมเดิม: ถ้า migration ล้ม "ไม่เปิดเซิร์ฟเวอร์"
    console.error('[db] Migration failed:', err.message);
    console.error('[db] เซิร์ฟเวอร์จะไม่เปิด เพื่อป้องกันการทำงานบน schema ที่ไม่สมบูรณ์');
    process.exit(1);
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  realtime.attach(httpServer);
  rooms.init();
  await rankedPvp.init();
  rankedTeams.init();
  // แชทเพื่อน: ลบข้อความเก่ากว่า 180 วัน (ตอนเริ่มและทุกวัน)
  const chat = require('./routes/chat');
  chat.purgeOld().catch((e) => console.error('[chat/purge]', e.message));
  setInterval(() => chat.purgeOld().catch(() => {}), 24 * 60 * 60 * 1000).unref();

  // เตือน "อย่าลืมเข้ามาเล่น" (Web Push) — ตรวจทุก 5 นาที ส่งวันละไม่เกิน 1 ครั้งต่อคน
  require('./services/push').startScheduler();

  // กิจกรรม (Halloween ฯลฯ): ลงทะเบียนในตาราง events ตามค่าตั้ง (ช่วงเวลา = เวลาเซิร์ฟเวอร์)
  require('./services/events').syncEvents().catch((e) => console.error('[events/sync]', e.message));

  httpServer.listen(PORT, () => {
    console.log(`EnglishQuest server running on port ${PORT}`);
  });
}

start();
