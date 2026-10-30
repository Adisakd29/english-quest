/*
  นำเข้า data/oxford/senses.json เข้าตาราง vocab_entries / vocab_senses

    node scripts/oxford/import.js          # รันเองได้ (ใช้ DATABASE_URL)
    (ถูกเรียกจาก migrations/011_vocab_v2_import.js ตอน deploy ด้วย)

  Idempotent:
    - INSERT ... ON CONFLICT (id) DO UPDATE เฉพาะ "คอลัมน์ที่มาจากต้นฉบับ"
    - ไม่แตะคำแปลไทย / นิยาม / ตัวอย่าง / สถานะการตรวจ -> import ซ้ำไม่ทับงานของคน
    - sense ที่เคยมีแต่หายไปจากต้นฉบับรอบใหม่ -> ไม่ลบ แค่รายงาน (ป้องกันความก้าวหน้าผู้ใช้หาย)
*/
const path = require('path');

const SENSES = path.join(__dirname, '..', '..', 'data', 'oxford', 'senses.json');
const BATCH = 400;

async function importOxford(client, { senses = require(SENSES), log = console.log } = {}) {
  // ---- headwords ----
  const entries = new Map();
  senses.forEach((s) => {
    if (!entries.has(s.entryId)) {
      entries.set(s.entryId, { id: s.entryId, headword: s.headword, homograph: s.homograph });
    }
  });
  const entryList = [...entries.values()];
  for (let i = 0; i < entryList.length; i += BATCH) {
    const chunk = entryList.slice(i, i + BATCH);
    await client.query(
      `INSERT INTO vocab_entries (id, headword, normalized, homograph_no)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::smallint[])
       ON CONFLICT (id) DO UPDATE
         SET headword = EXCLUDED.headword, normalized = EXCLUDED.normalized,
             homograph_no = EXCLUDED.homograph_no, updated_at = NOW()
         WHERE (vocab_entries.headword, vocab_entries.normalized, vocab_entries.homograph_no)
               IS DISTINCT FROM (EXCLUDED.headword, EXCLUDED.normalized, EXCLUDED.homograph_no)`,
      [chunk.map((e) => e.id), chunk.map((e) => e.headword),
        chunk.map((e) => e.headword.toLowerCase()), chunk.map((e) => e.homograph)]
    );
  }

  // ---- senses (เฉพาะคอลัมน์ต้นฉบับ) ----
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < senses.length; i += BATCH) {
    const chunk = senses.slice(i, i + BATCH);
    const res = await client.query(
      `INSERT INTO vocab_senses
         (id, entry_id, pos, cefr, sense_label, source, source_list, source_cefr,
          source_raw_entry, source_ref, source_needs_review, source_review_reasons, display_order)
       SELECT id, entry_id, pos, cefr, sense_label, 'OXFORD', source_list, source_cefr,
              raw, ref, flag, string_to_array(reasons, '␟'), ord
         FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
                     $7::text[], $8::text[], $9::text[], $10::boolean[], $11::text[], $12::int[])
           AS t(id, entry_id, pos, cefr, sense_label, source_list, source_cefr, raw, ref, flag, reasons, ord)
       ON CONFLICT (id) DO UPDATE SET
         entry_id = EXCLUDED.entry_id, pos = EXCLUDED.pos, cefr = EXCLUDED.cefr,
         sense_label = EXCLUDED.sense_label, source_list = EXCLUDED.source_list,
         source_cefr = EXCLUDED.source_cefr, source_raw_entry = EXCLUDED.source_raw_entry,
         source_ref = EXCLUDED.source_ref, source_needs_review = EXCLUDED.source_needs_review,
         source_review_reasons = EXCLUDED.source_review_reasons,
         display_order = EXCLUDED.display_order, updated_at = NOW()
       WHERE (vocab_senses.entry_id, vocab_senses.pos, vocab_senses.cefr, vocab_senses.sense_label,
              vocab_senses.source_list, vocab_senses.source_raw_entry, vocab_senses.source_ref,
              vocab_senses.source_needs_review, vocab_senses.display_order)
         IS DISTINCT FROM
             (EXCLUDED.entry_id, EXCLUDED.pos, EXCLUDED.cefr, EXCLUDED.sense_label,
              EXCLUDED.source_list, EXCLUDED.source_raw_entry, EXCLUDED.source_ref,
              EXCLUDED.source_needs_review, EXCLUDED.display_order)
       RETURNING (xmax = 0) AS inserted`,
      [
        chunk.map((s) => s.senseId), chunk.map((s) => s.entryId), chunk.map((s) => s.pos),
        chunk.map((s) => s.cefr), chunk.map((s) => s.senseLabel), chunk.map((s) => s.sourceList),
        chunk.map((s) => s.sourceCEFR), chunk.map((s) => s.sourceRawEntry), chunk.map((s) => s.sourceRef),
        chunk.map((s) => s.needsReview), chunk.map((s) => s.reviewReasons.join('␟')),
        chunk.map((s) => s.sourceOrder),
      ]
    );
    res.rows.forEach((r) => { if (r.inserted) inserted += 1; else updated += 1; });
  }

  // sense ในฐานข้อมูลที่ไม่อยู่ในต้นฉบับรอบนี้ (ไม่ลบ — รายงานเท่านั้น)
  const ids = senses.map((s) => s.senseId);
  const stale = await client.query(
    "SELECT id FROM vocab_senses WHERE source = 'OXFORD' AND NOT (id = ANY($1))", [ids]
  );

  // sense ใหม่ได้ ID สาธารณะ (A1-S0001) ต่อจากเลขเดิม — sense เดิมไม่ถูกเปลี่ยนเลข
  const { assignPublicIds } = require('./legacy');
  const newIds = await assignPublicIds(client);

  const summary = {
    newPublicIds: newIds,
    entries: entryList.length, senses: senses.length, inserted, updated,
    unchanged: senses.length - inserted - updated, staleNotInSource: stale.rows.map((r) => r.id),
  };
  log(`[vocab import] headwords ${summary.entries} · senses ${summary.senses} · ใหม่ ${inserted} · อัปเดต ${updated} · ไม่เปลี่ยน ${summary.unchanged}`);
  if (summary.staleNotInSource.length) {
    log(`[vocab import] ⚠️ มี ${summary.staleNotInSource.length} sense ในฐานข้อมูลที่ไม่อยู่ในต้นฉบับ (ไม่ลบ): ${summary.staleNotInSource.slice(0, 10).join(', ')}`);
  }
  return summary;
}

module.exports = { importOxford };

if (require.main === module) {
  require('dotenv').config();
  const pool = require('../../config/db');
  (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await importOxford(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[vocab import] ล้มเหลว:', err.message);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }
  })();
}
