#!/usr/bin/env node
/* นำเข้าชุดข้อมูล Word Atlas ด้วยมือ: node scripts/word-atlas/seed.js [ไฟล์.jsonl.gz] [--force] */
require('dotenv').config();
const pool = require('../../config/db');
const { runMigrations } = require('../../db/migrate');
const { seed } = require('../../services/wordAtlas/seed');
(async () => {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  await runMigrations(pool);
  const r = await seed(pool, { file, force: process.argv.includes('--force'), log: console.log });
  console.log(JSON.stringify(r, null, 1));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
