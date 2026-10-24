/*
  นำคำแปลไทยจาก data/oxford/thai_meanings.json เข้าตาราง vocab_senses

    node scripts/oxford/apply_thai.js   (หรือถูกเรียกจาก migration)

  กติกา:
    - translation_source = 'AI_GENERATED', translation_status = 'unreviewed'
      (ไม่ได้มาจาก Oxford และยังไม่มีคนตรวจ — ห้ามระบุว่า reviewed)
    - คำที่ไม่มั่นใจ: translation_note = เหตุผล (ใช้กันออกจากแบบทดสอบจนกว่าจะตรวจ)
    - เขียนทับได้เฉพาะแถวที่ยังไม่มีคำแปล หรือเป็น AI_GENERATED ที่ยังไม่ถูกตรวจ
      -> คำแปลที่คนตรวจ/แก้แล้ว (reviewed, rejected, HUMAN_REVIEWED, LEGACY_REVIEWED) ไม่ถูกแตะ
    - idempotent: รันซ้ำแล้วแถวที่ค่าเหมือนเดิมไม่ถูกเขียนใหม่
*/
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'oxford', 'thai_meanings.json');
const BATCH = 500;

async function applyThai(client, { meanings = require(FILE), log = console.log } = {}) {
  const entries = Object.entries(meanings);
  let written = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const res = await client.query(
      `UPDATE vocab_senses s
          SET thai_meaning = v.thai,
              translation_source = 'AI_GENERATED',
              translation_status = 'unreviewed',
              translation_note = v.note,
              updated_at = NOW()
         FROM UNNEST($1::text[], $2::text[], $3::text[]) AS v(id, thai, note)
        WHERE s.id = v.id
          AND (s.translation_status = 'missing'
               OR (s.translation_source = 'AI_GENERATED' AND s.translation_status = 'unreviewed'))
          AND (s.thai_meaning, s.translation_note) IS DISTINCT FROM (v.thai, v.note)`,
      [chunk.map(([id]) => id), chunk.map(([, m]) => m.thai), chunk.map(([, m]) => m.note || null)]
    );
    written += res.rowCount;
  }
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE id = ANY($1) AND translation_source IS DISTINCT FROM 'AI_GENERATED')::int AS protected
       FROM vocab_senses`, [entries.map(([id]) => id)]
  );
  log(`[thai] คำแปลในไฟล์ ${entries.length} · เขียน ${written} · ข้าม (คนตรวจแล้ว) ${rows[0].protected}`);
  return { total: entries.length, written, protected: rows[0].protected };
}

module.exports = { applyThai };

if (require.main === module) {
  require('dotenv').config();
  const pool = require('../../config/db');
  (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyThai(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[thai] ล้มเหลว:', err.message);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }
  })();
}
