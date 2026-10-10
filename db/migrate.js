/*
  ตัวรัน migration ของ EnglishQuest

  หลักการ:
    - ไฟล์ migration อยู่ใน migrations/ ตั้งชื่อ NNN_ชื่อ.sql (เรียงตามเลข)
    - ตาราง schema_migrations เก็บว่าไฟล์ไหนรันไปแล้ว
    - รันเฉพาะไฟล์ที่ยังไม่เคยรัน เรียงตามเลขลำดับ
    - แต่ละไฟล์รันใน transaction เดียว ถ้าพังจะ rollback ทั้งไฟล์ (ไม่ค้างครึ่ง ๆ)

  ปลอดภัยกับของเดิม:
    - migration 001 คือ schema.sql เดิมทั้งหมด ซึ่ง idempotent (IF NOT EXISTS)
      ดังนั้นบน DB ที่มีตารางอยู่แล้ว การรัน 001 จะไม่ทำอะไรเสียหาย
    - ถ้า DB เคยมีข้อมูล production อยู่ ตาราง schema_migrations จะถูกสร้างใหม่
      และบันทึก 001 ว่ารันแล้ว โดยไม่แตะข้อมูลเดิมเลย
*/
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    // รับไฟล์ NNN_*.sql และ NNN_*.js (ข้อมูลที่ต้องใช้ JS seed) ไม่เอาไฟล์ _down
    .filter((f) => /^\d+_.*\.(sql|js)$/.test(f) && !f.includes('_down'))
    .sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)[1], 10);
      const nb = parseInt(b.match(/^(\d+)/)[1], 10);
      return na - nb;
    });
}

// รับ pool เข้ามาเพื่อให้เทสต์ส่ง pool ของตัวเองได้
async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const appliedResult = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((r) => r.id));

    const files = listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(`[migrate] ไม่มี migration ใหม่ (รันไปแล้ว ${applied.size} ไฟล์)`);
      return { applied: [], already: applied.size };
    }

    const justApplied = [];
    for (const file of pending) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      try {
        await client.query('BEGIN');
        if (file.endsWith('.js')) {
          // migration แบบ JS: export async function run(client)
          // ใช้กับงานที่ต้องอ่านไฟล์/แปลงข้อมูล (เช่น seed จาก JSON)
          const mod = require(fullPath);
          if (typeof mod.run !== 'function') {
            throw new Error('migration .js ต้อง export ฟังก์ชัน run(client)');
          }
          await mod.run(client);
        } else {
          const sql = fs.readFileSync(fullPath, 'utf8');
          await client.query(sql);
        }
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        justApplied.push(file);
        console.log(`[migrate] ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        // หยุดทันทีเมื่อไฟล์ใดพัง ไม่รันไฟล์ถัดไป เพื่อไม่ให้ schema เพี้ยน
        throw new Error(`migration ล้มที่ไฟล์ ${file}: ${err.message}`);
      }
    }

    console.log(`[migrate] รัน migration ใหม่ ${justApplied.length} ไฟล์สำเร็จ`);
    return { applied: justApplied, already: applied.size };
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, listMigrationFiles };
