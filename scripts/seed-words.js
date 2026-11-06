/*
  ย้ายข้อมูลคำศัพท์จาก data/words.json เข้าตาราง words
  รันได้ทั้งแบบ standalone (node scripts/seed-words.js) และถูกเรียกจาก migration 003

  ปลอดภัย:
    - ใช้ ON CONFLICT DO UPDATE → รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ (idempotent)
    - ไม่ลบข้อมูลเดิม ไม่แตะตารางอื่น
    - ย้ายเป็นชุด (batch) เพื่อไม่ให้ query เดียวใหญ่เกินไป
*/
const path = require('path');
const wordsData = require(path.join(__dirname, '..', 'data', 'words.json'));

const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const BATCH = 500;

async function seedWords(pool) {
  let total = 0;

  for (const level of VALID_LEVELS) {
    const list = wordsData.levels[level] || [];

    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);

      // สร้าง parameterized insert หลายแถวในครั้งเดียว
      const values = [];
      const params = [];
      chunk.forEach((w, idx) => {
        const base = idx * 5;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        params.push(w.id, w.word, w.pos || null, w.category || null, w.level);
      });

      await pool.query(
        `INSERT INTO words (id, word, pos, category, cefr)
         VALUES ${values.join(', ')}
         ON CONFLICT (id) DO UPDATE
           SET word = EXCLUDED.word,
               pos = EXCLUDED.pos,
               category = EXCLUDED.category,
               cefr = EXCLUDED.cefr`,
        params
      );
      total += chunk.length;
    }
  }

  return total;
}

module.exports = { seedWords };

// รันตรงจาก command line ได้
if (require.main === module) {
  require('dotenv').config();
  const pool = require(path.join(__dirname, '..', 'config', 'db'));
  seedWords(pool)
    .then((n) => {
      console.log(`[seed-words] ย้ายคำศัพท์สำเร็จ ${n} คำ`);
      return pool.end();
    })
    .catch((err) => {
      console.error('[seed-words] ล้มเหลว:', err.message);
      process.exit(1);
    });
}
