require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');
const pkg = require('./package.json');

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const authRoutes = require('./routes/auth');
const wordsRoutes = require('./routes/words');
const progressRoutes = require('./routes/progress');
const translateRoutes = require('./routes/translate');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/words', wordsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, version: pkg.version }));

// เสิร์ฟหน้าเว็บ (frontend) แบบ static จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler สำหรับ API ที่ไม่มีจริง
app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ endpoint นี้' }));

async function runMigrations() {
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);
  console.log('[db] Migrations applied (schema is idempotent, safe on every boot).');
}

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[db] Migration failed:', err.message);
    console.error('[db] ตรวจสอบว่าตั้งค่า DATABASE_URL ถูกต้อง และเพิ่ม PostgreSQL plugin บน Railway แล้ว');
  }

  app.listen(PORT, () => {
    console.log(`🚀 WordQuest server running on port ${PORT}`);
  });
}

start();
