/*
  เชื่อมฐานคำศัพท์เดิม (words / word_content, ID แบบ A1-0001) กับฐานใหม่ (vocab_senses)

  1. assignPublicIds   ให้ ID สาธารณะ "A1-S0001" แก่ทุก sense (กำหนดครั้งเดียว ไม่เปลี่ยนอีก)
  2. buildLegacyMap    แผนที่ ID เดิม -> sense ใหม่ พร้อมประเภทการจับคู่ (ห้ามเดา: จับไม่ได้ = unmatched)
  3. copyLegacyContent ย้ายเนื้อหาเสริม (หัวข้อ, IPA, ความหมาย WordNet) ไปยัง sense ที่ชนิดคำตรงกัน

  ทุกฟังก์ชัน idempotent — รันซ้ำได้ ไม่ทับข้อมูลที่มีอยู่แล้ว
*/

const LEGACY_POS = {
  'n.': 'noun', 'v.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb', 'pron.': 'pronoun',
  'prep.': 'preposition', 'conj.': 'conjunction', 'det.': 'determiner', 'exclam.': 'exclamation',
  number: 'number', 'modal v.': 'modal verb', 'auxiliary v.': 'auxiliary verb',
  'indefinite article': 'indefinite article', 'definite article': 'definite article',
  'infinitive marker': 'infinitive marker',
};
// category ของชุดเดิม -> ชนิดคำมาตรฐาน (ใช้หาว่าเนื้อหา WordNet เดิมเป็นของชนิดคำไหน)
const LEGACY_CATEGORY = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb' };
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

// คืน { pos: [...], junk: [...] } — junk = ข้อความที่ไม่ใช่ชนิดคำ (ขยะจาก OCR เช่น "8." "Ulf.")
function parseLegacyPos(text) {
  const pos = [];
  const junk = [];
  const keys = Object.keys(LEGACY_POS).sort((a, b) => b.length - a.length);
  let t = String(text || '').replace(/\//g, ' / ').replace(/,/g, ' , ').replace(/\s+/g, ' ').trim();
  while (t.length) {
    if (/^[ ,/]/.test(t)) { t = t.slice(1); continue; }
    const k = keys.find((x) => t.startsWith(x) && (t.length === x.length || /[ ,/]/.test(t[x.length])));
    if (k) { pos.push(LEGACY_POS[k]); t = t.slice(k.length); continue; }
    const m = t.match(/^[^ ,/]+/)[0];
    if (LEGACY_POS[`${m}.`]) pos.push(LEGACY_POS[`${m}.`]); else junk.push(m);
    t = t.slice(m.length);
  }
  return { pos, junk };
}

function splitWord(raw) {
  const m = String(raw).replace(/,$/, '').match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { headword: m[1], label: m[2] } : { headword: String(raw).replace(/,$/, ''), label: null };
}

/* ---------------- 1. ID สาธารณะ ---------------- */
async function assignPublicIds(client) {
  await client.query('ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS public_id VARCHAR(16)');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_vocab_senses_public_id ON vocab_senses (public_id)');
  let assigned = 0;
  for (const lvl of LEVELS) {
    // ต่อจากเลขสูงสุดที่มีอยู่ — sense ที่มี ID แล้วไม่ถูกเปลี่ยนเลข (ความก้าวหน้าผู้ใช้ผูกอยู่)
    const { rows: [mx] } = await client.query(
      `SELECT COALESCE(MAX(SUBSTRING(public_id FROM 5)::int), 0) AS n FROM vocab_senses WHERE cefr = $1 AND public_id IS NOT NULL`,
      [lvl]
    );
    const res = await client.query(
      `WITH todo AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn
           FROM vocab_senses WHERE cefr = $1 AND public_id IS NULL)
       UPDATE vocab_senses s SET public_id = $1 || '-S' || LPAD((todo.rn + $2)::text, 4, '0')
         FROM todo WHERE s.id = todo.id`,
      [lvl, mx.n]
    );
    assigned += res.rowCount;
  }
  return assigned;
}

/* ---------------- 2. แผนที่ ID เดิม -> sense ใหม่ ---------------- */
/*
  ประเภทการจับคู่:
    exact               ตัวคำ + คำใบ้ + ระดับ ตรงกัน และอยู่ใน headword เดียว
    homograph_by_pos    ชุดเดิมทิ้งเลขคำพ้องรูป แต่แยกได้ด้วยชนิดคำ (เช่น ring A2 n. = ring1, v. = ring2)
    homograph_by_order  แยกด้วยชนิดคำไม่ได้ (used B1 adj. x2) — ใช้ลำดับ เพราะชุดเดิมเรียงตามลำดับเอกสาร
    cefr_corrected      ระดับในชุดเดิมผิด แต่ตัวคำ + ชนิดคำ มีเพียงหนึ่งเดียวในต้นฉบับ
    pos_unspecified     ต้นฉบับไม่ระบุชนิดคำ (seldom) แต่มี sense เดียวที่ตรง
    unmatched           จับคู่อย่างปลอดภัยไม่ได้ -> ไม่เดา รายงานให้คนตรวจ
*/
async function buildLegacyMap(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS vocab_legacy_map (
      legacy_word_id VARCHAR(16) NOT NULL,
      sense_id       TEXT,                     -- NULL = unmatched
      public_id      VARCHAR(16),
      match_type     VARCHAR(24) NOT NULL,
      note           TEXT,
      PRIMARY KEY (legacy_word_id, match_type, public_id)
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_vocab_legacy_map_word ON vocab_legacy_map (legacy_word_id)');
  await client.query('DELETE FROM vocab_legacy_map'); // สร้างใหม่ทั้งหมด (คำนวณจากข้อมูลคงที่ ได้ผลเหมือนเดิมทุกครั้ง)

  const { rows: legacy } = await client.query('SELECT id, word, pos, category, cefr FROM words ORDER BY id');
  const { rows: senses } = await client.query(
    `SELECT s.id, s.public_id, s.entry_id, s.pos, s.cefr, s.sense_label, e.headword
       FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id WHERE NOT s.is_supplemental`
  );
  const byWord = new Map();
  senses.forEach((s) => {
    const k = `${s.headword}␟${s.sense_label || ''}`;
    if (!byWord.has(k)) byWord.set(k, []);
    byWord.get(k).push(s);
  });

  const rows = [];
  const usedByOrder = new Map(); // สำหรับ homograph_by_order: entry ที่ใช้ไปแล้วของ (คำ, ระดับ, ชนิดคำ)
  for (const L of legacy) {
    const { headword, label } = splitWord(L.word);
    const { pos } = parseLegacyPos(L.pos);
    const all = byWord.get(`${headword}␟${label || ''}`) || [];
    const atLevel = all.filter((s) => s.cefr === L.cefr);
    const posSet = new Set(pos);
    const entriesOf = (list) => [...new Set(list.map((s) => s.entry_id))];
    const add = (list, type, note = null) => list.forEach((s) => rows.push([L.id, s.id, s.public_id, type, note]));

    let matched = false;
    // ก. ระดับตรง
    if (atLevel.length) {
      const posMatch = atLevel.filter((s) => posSet.has(s.pos));
      const pool = posMatch.length ? posMatch : (atLevel.every((s) => s.pos === null) ? atLevel : []);
      const entries = entriesOf(pool);
      if (pool.length && entries.length === 1) {
        const type = pool.every((s) => s.pos === null) ? 'pos_unspecified'
          : (entriesOf(atLevel).length > 1 ? 'homograph_by_pos' : 'exact');
        add(pool, type);
        matched = true;
      } else if (pool.length && entries.length > 1) {
        // แยกด้วยชนิดคำไม่ได้ — ใช้ลำดับเอกสาร (ชุดเดิมเรียง ID ตามลำดับในเอกสาร)
        // นับลำดับต่อ (ตัวคำ + ระดับ) ไม่ขึ้นกับชนิดคำ — tear "v., n." กับ "n." ต้องได้ tear1 แล้ว tear2
        // (เดิมแยกนับตามชุดชนิดคำ ทำให้ "tear n." ได้ tear1 ซ้ำ ทั้งที่ควรเป็น tear2 = น้ำตา)
        const key = `${headword}␟${L.cefr}`;
        const used = usedByOrder.get(key) || [];
        const ordered = entries.sort();
        const next = ordered.find((e) => !used.includes(e));
        if (next) {
          add(pool.filter((s) => s.entry_id === next), 'homograph_by_order', `ลำดับที่ ${used.length + 1} ของ ${ordered.length}`);
          usedByOrder.set(key, [...used, next]);
          matched = true;
        }
      }
    }
    // ข. ระดับในชุดเดิมผิด: ตัวคำ + ชนิดคำ ต้องมีเพียงหนึ่ง headword ในต้นฉบับ
    if (!matched && all.length) {
      const pool = all.filter((s) => posSet.has(s.pos));
      if (pool.length && entriesOf(pool).length === 1) {
        add(pool, 'cefr_corrected', `ชุดเดิม ${L.cefr} -> ต้นฉบับ ${[...new Set(pool.map((s) => s.cefr))].join('/')}`);
        matched = true;
      }
    }
    if (!matched) rows.push([L.id, null, null, 'unmatched', `${L.word} ${L.pos} ${L.cefr}`]);
  }

  for (let i = 0; i < rows.length; i += 500) {
    const c = rows.slice(i, i + 500);
    await client.query(
      `INSERT INTO vocab_legacy_map (legacy_word_id, sense_id, public_id, match_type, note)
       SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::varchar[], $4::varchar[], $5::text[])`,
      [c.map((r) => r[0]), c.map((r) => r[1]), c.map((r) => r[2] || ''), c.map((r) => r[3]), c.map((r) => r[4])]
    );
  }
  const summary = {};
  const seen = new Set();
  rows.forEach((r) => { const k = `${r[0]}␟${r[3]}`; if (!seen.has(k)) { seen.add(k); summary[r[3]] = (summary[r[3]] || 0) + 1; } });
  return { legacyEntries: legacy.length, mappings: rows.filter((r) => r[1]).length, byType: summary };
}

/* ---------------- 3. ย้ายเนื้อหาเสริมจากชุดเดิม ---------------- */
async function copyLegacyContent(client) {
  // หัวข้อ: ใช้กับทุก sense ที่จับคู่ได้ (ไม่ทับค่าที่มีอยู่)
  const topic = await client.query(`
    UPDATE vocab_senses s SET topic = wc.topic
      FROM vocab_legacy_map m JOIN word_content wc ON wc.word_id = m.legacy_word_id
     WHERE m.sense_id = s.id AND s.topic IS NULL AND wc.topic IS NOT NULL`);
  // IPA: คำออกเสียงตามตัวสะกด — ยกเว้นคำพ้องรูป (live1 /lɪv/ กับ live2 /laɪv/ ออกเสียงต่างกัน)
  const ipa = await client.query(`
    UPDATE vocab_senses s SET ipa = wc.ipa, ipa_source = 'CMU'
      FROM vocab_legacy_map m JOIN word_content wc ON wc.word_id = m.legacy_word_id
           JOIN vocab_entries e ON TRUE
     WHERE m.sense_id = s.id AND e.id = s.entry_id AND e.homograph_no IS NULL
       AND s.ipa IS NULL AND wc.ipa IS NOT NULL`);
  // ความหมาย/ตัวอย่าง (WordNet): ใช้เฉพาะ sense ที่ชนิดคำตรงกับชนิดคำที่ใช้เลือกความหมายเดิม
  const def = await client.query(`
    UPDATE vocab_senses s
       SET simple_definition = wc.definition_en, example_sentence = wc.example_en,
           synonyms = wc.synonyms, definition_source = 'WORDNET'
      FROM vocab_legacy_map m JOIN word_content wc ON wc.word_id = m.legacy_word_id
           JOIN words w ON w.id = m.legacy_word_id
     WHERE m.sense_id = s.id AND s.simple_definition IS NULL AND wc.definition_en IS NOT NULL
       AND s.pos = (CASE w.category WHEN 'noun' THEN 'noun' WHEN 'verb' THEN 'verb'
                                    WHEN 'adj' THEN 'adjective' WHEN 'adv' THEN 'adverb' END)`);
  // คำแปลไทยที่แอดมินเคยตรวจไว้ในระบบเดิม: ย้ายเฉพาะกรณีจับคู่ได้ sense เดียว (ไม่กระจายไปหลายชนิดคำ)
  const thai = await client.query(`
    UPDATE vocab_senses s SET thai_meaning = wc.thai, translation_source = 'LEGACY_REVIEWED',
           translation_status = 'unreviewed', translation_note = 'ย้ายมาจากคำแปลที่ตรวจแล้วในระบบเดิม — ตรวจซ้ำกับ sense ใหม่'
      FROM vocab_legacy_map m JOIN word_content wc ON wc.word_id = m.legacy_word_id
     WHERE m.sense_id = s.id AND wc.status = 'reviewed' AND wc.thai IS NOT NULL
       AND (SELECT count(*) FROM vocab_legacy_map m2 WHERE m2.legacy_word_id = m.legacy_word_id AND m2.sense_id IS NOT NULL) = 1
       AND (s.translation_source IS NULL OR s.translation_source = 'AI_GENERATED')`);
  return { topic: topic.rowCount, ipa: ipa.rowCount, definition: def.rowCount, legacyThai: thai.rowCount };
}

/* ---------------- 4. ย้ายความก้าวหน้าผู้ใช้ไป ID ใหม่ ---------------- */
/*
  - สำรองแถวเดิมทั้งหมดไว้ที่ word_progress_legacy ก่อน (ย้อนกลับได้)
  - รายการเดิม 1 รายการ -> หลาย sense: คัดลอกความก้าวหน้าไปทุก sense ของรายการนั้น
    (ผู้เรียนฝึกมาเป็นหน่วยเดียว)
  - ชนกัน (สอง ID เดิมชี้ sense เดียวกัน): เก็บค่าที่ก้าวหน้ากว่า ไม่มีข้อมูลหาย
  - ไม่มีแถวใดถูกลบโดยไม่มีสำเนา
*/
async function migrateProgress(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS word_progress_legacy AS
                        SELECT *, NOW() AS migrated_at FROM word_progress WHERE FALSE`);
  const backed = await client.query(
    `INSERT INTO word_progress_legacy SELECT *, NOW() FROM word_progress wp
      WHERE wp.word_id !~ '-S[0-9]{4}$'
        AND NOT EXISTS (SELECT 1 FROM word_progress_legacy b WHERE b.id = wp.id)`
  );
  const moved = await client.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, times_correct, last_reviewed,
                                ever_known, last_exp_at, srs_interval, srs_ease, srs_reps, srs_lapses, srs_due_at)
     SELECT wp.user_id, m.public_id, s.cefr, wp.status, wp.times_seen, wp.times_correct, wp.last_reviewed,
            wp.ever_known, wp.last_exp_at, wp.srs_interval, wp.srs_ease, wp.srs_reps, wp.srs_lapses, wp.srs_due_at
       FROM word_progress wp
       JOIN vocab_legacy_map m ON m.legacy_word_id = wp.word_id AND m.sense_id IS NOT NULL
       JOIN vocab_senses s ON s.id = m.sense_id
      WHERE wp.word_id !~ '-S[0-9]{4}$'
     ON CONFLICT (user_id, word_id) DO UPDATE SET
       times_seen = GREATEST(word_progress.times_seen, EXCLUDED.times_seen),
       times_correct = GREATEST(word_progress.times_correct, EXCLUDED.times_correct),
       ever_known = word_progress.ever_known OR EXCLUDED.ever_known,
       status = CASE WHEN word_progress.status = 'known' OR EXCLUDED.status = 'known' THEN 'known' ELSE word_progress.status END,
       srs_reps = GREATEST(word_progress.srs_reps, EXCLUDED.srs_reps)`
  );
  const unmapped = await client.query(
    `SELECT count(*)::int AS n FROM word_progress wp WHERE wp.word_id !~ '-S[0-9]{4}$'
        AND NOT EXISTS (SELECT 1 FROM vocab_legacy_map m WHERE m.legacy_word_id = wp.word_id AND m.sense_id IS NOT NULL)`
  );
  // แถวที่จับคู่ไม่ได้ "ไม่ลบ" — คงไว้ในตารางและรายงาน (ห้ามทำความก้าวหน้าหายเงียบ ๆ)
  const removed = await client.query(
    `DELETE FROM word_progress wp WHERE wp.word_id !~ '-S[0-9]{4}$'
        AND EXISTS (SELECT 1 FROM vocab_legacy_map m WHERE m.legacy_word_id = wp.word_id AND m.sense_id IS NOT NULL)
        AND EXISTS (SELECT 1 FROM word_progress_legacy b WHERE b.id = wp.id)`
  );

  // ประวัติคำตอบ (Mastery / My Mistakes): ชี้ไป sense ใหม่ เก็บ ID เดิมไว้ใน legacy_item_id
  await client.query('ALTER TABLE answer_events ADD COLUMN IF NOT EXISTS legacy_item_id VARCHAR(32)');
  const events = await client.query(
    `UPDATE answer_events ae SET legacy_item_id = ae.item_id, item_id = m.public_id
       FROM (SELECT DISTINCT ON (legacy_word_id) legacy_word_id, public_id
               FROM vocab_legacy_map WHERE sense_id IS NOT NULL ORDER BY legacy_word_id, public_id) m
      WHERE ae.item_id = m.legacy_word_id AND ae.skill IN ('vocab', 'listening') AND ae.legacy_item_id IS NULL`
  );
  return { backedUp: backed.rowCount, inserted: moved.rowCount, removedLegacy: removed.rowCount,
    unmappedKept: unmapped.rows[0].n, answerEvents: events.rowCount };
}

// จำนวนความหมายใน WordNet (ใช้คัดคำที่ความหมายชัดสำหรับแบบทดสอบวัดระดับ) — เฉพาะชนิดคำที่ตรงกัน
async function copySenseCount(client) {
  await client.query('ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS sense_count SMALLINT');
  const r = await client.query(`
    UPDATE vocab_senses s SET sense_count = wc.sense_count
      FROM vocab_legacy_map m JOIN word_content wc ON wc.word_id = m.legacy_word_id
           JOIN words w ON w.id = m.legacy_word_id
     WHERE m.sense_id = s.id AND s.sense_count IS NULL AND wc.sense_count IS NOT NULL
       AND s.pos = (CASE w.category WHEN 'noun' THEN 'noun' WHEN 'verb' THEN 'verb'
                                    WHEN 'adj' THEN 'adjective' WHEN 'adv' THEN 'adverb' END)`);
  return r.rowCount;
}

module.exports = { migrateProgress, copySenseCount, parseLegacyPos, splitWord, assignPublicIds, buildLegacyMap, copyLegacyContent, LEGACY_POS, LEGACY_CATEGORY };
