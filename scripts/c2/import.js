/*
  นำเข้าคลังคำศัพท์ C2 (data/vocab-c2/batch-*.json) → vocab_entries / vocab_senses เดิม

  หลักการ (ตามข้อกำหนด migration safety)
    - idempotent: รันซ้ำได้ ใช้ c2_key เป็นคีย์ · public_id ของแถวที่มีอยู่แล้ว "ไม่เปลี่ยน"
    - ไม่แตะแถว A1–C1 ใด ๆ (อ่านอย่างเดียวเพื่อหา entry เดิม)
    - dedupe: ถ้าคำ/คำฐาน (baseLemma) มีอยู่แล้ว → เพิ่ม "sense ใหม่" ใต้ entry เดิม ไม่สร้างคำซ้ำ
    - แถวที่คนตรวจแล้ว (verification_status='reviewed') ไม่ถูกเขียนทับเนื้อหา
    - ผล validator: ผ่าน → autoChecked · ไม่ผ่าน → unverified (ถูกกันออกจากแบบฝึก/บทเรียน)

  ใช้:  node scripts/c2/import.js            (ใช้ DATABASE_URL)
        require('./import').importC2(client)  (จาก migration 042)
*/
const V = require('./validate');

const POS_SHORT = { noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv', 'phrasal verb': 'phr', idiom: 'idm',
  collocation: 'col', 'fixed expression': 'fx', 'discourse marker': 'dm' };

const entryIdFor = (headword) => headword.trim().toLowerCase().replace(/\s+/g, '_');
const senseIdFor = (entryId, e) => `${entryId}|${e.pos}|c2:${e.senseTag.trim().toLowerCase().replace(/\s+/g, '_')}`;

// เนื้อหาเต็มที่ไม่มีคอลัมน์ตรง → เก็บใน c2 JSONB (ไม่ต้องแก้ schema เมื่อเพิ่มฟิลด์ในอนาคต)
function c2Payload(e) {
  return {
    lemma: e.lemma, senseTag: e.senseTag, baseLemma: e.baseLemma || null, baseMeaningTH: e.baseMeaningTH || null,
    meaningEN: e.meaningEN, meaningTH: e.meaningTH, shortMeaningTH: e.shortMeaningTH, usageNoteTH: e.usageNoteTH,
    ipaUK: e.ipaUK || null, ipaUS: e.ipaUS || null,
    nearSynonyms: e.nearSynonyms || [], wordFamily: e.wordFamily || [], commonMistakes: e.commonMistakes || [],
    confusedWith: e.confusedWith || [], topics: e.topics || [],
    context: e.context || null, literalTH: e.literalTH || null, naturalTH: e.naturalTH || null,
    unnaturalTH: e.unnaturalTH || null, separable: typeof e.separable === 'boolean' ? e.separable : null,
    q: e.q || {}, sourceType: e.sourceType, sourceReference: e.sourceReference,
  };
}

async function importC2(client, { entries = null, log = () => {} } = {}) {
  entries = entries || V.loadBatches();
  const existingLemmas = await V.loadExistingLemmas(client);
  const report = V.validateAll(entries, { existingLemmas });

  // entry เดิมทั้งหมด (headword → id ที่ homograph ต่ำสุด)
  const entRows = (await client.query(
    'SELECT id, lower(headword) AS h FROM vocab_entries ORDER BY lower(headword), COALESCE(homograph_no, 0)')).rows;
  const entryByHead = new Map();
  for (const r of entRows) if (!entryByHead.has(r.h)) entryByHead.set(r.h, r.id);
  const entryIds = new Set(entRows.map((r) => r.id));

  // sense พื้นฐาน (ระดับต่ำสุด A1–C1) ของแต่ละ entry → base_sense_id
  const baseRows = (await client.query(
    `SELECT DISTINCT ON (entry_id) entry_id, public_id FROM vocab_senses
      WHERE cefr <> 'C2' AND public_id IS NOT NULL ORDER BY entry_id, cefr, display_order`)).rows;
  const baseSense = new Map(baseRows.map((r) => [r.entry_id, r.public_id]));

  const existing = new Map((await client.query(
    "SELECT c2_key, id, public_id, verification_status FROM vocab_senses WHERE c2_key IS NOT NULL")).rows
    .map((r) => [r.c2_key, r]));
  let nextNo = Number((await client.query(
    "SELECT COALESCE(MAX(substring(public_id from 5)::int), 0) AS n FROM vocab_senses WHERE public_id ~ '^C2-S[0-9]+$'")).rows[0].n);

  const stats = { inserted: 0, updated: 0, keptReviewed: 0, newEntries: 0, attachedToExisting: 0, autoChecked: 0, unverified: 0 };
  // core ก่อน แล้วเรียงตาม priority (สำคัญในชีวิตจริงก่อน) → display_order
  const ordered = entries.map((e, i) => ({ e, i })).sort((a, b) =>
    (a.e.tier === 'core' ? 0 : 1) - (b.e.tier === 'core' ? 0 : 1)
    || b.e.realWorldPriority - a.e.realWorldPriority || a.i - b.i);

  let order = 0;
  for (const { e } of ordered) {
    order += 1;
    const res = report.byKey.get(e.key);
    const head = (e.kind === 'sense' ? e.baseLemma : e.lemma).trim();
    const prev = existing.get(e.key);
    if (prev && prev.verification_status === 'reviewed') { stats.keptReviewed += 1; continue; }

    // หา/สร้าง entry
    let entryId = entryByHead.get(head.toLowerCase());
    if (entryId) stats.attachedToExisting += 1;
    else {
      entryId = entryIdFor(head);
      let n = 2; while (entryIds.has(entryId)) entryId = `${entryIdFor(head)}#c2${n++}`;
      await client.query(
        `INSERT INTO vocab_entries (id, headword, normalized, homograph_no) VALUES ($1, $2, $3, NULL)
         ON CONFLICT DO NOTHING`, [entryId, head, head.toLowerCase()]);
      // อาจชนกับ unique (headword, homograph) ถ้าตัวพิมพ์ต่าง → ใช้แถวที่มีอยู่
      const got = (await client.query('SELECT id FROM vocab_entries WHERE headword = $1 ORDER BY COALESCE(homograph_no,0) LIMIT 1', [head])).rows[0];
      entryId = got.id;
      entryIds.add(entryId); entryByHead.set(head.toLowerCase(), entryId); stats.newEntries += 1;
    }

    const status = res.status;
    stats[status === 'autoChecked' ? 'autoChecked' : 'unverified'] += 1;
    const publicId = prev ? prev.public_id : `C2-S${String(++nextNo).padStart(4, '0')}`;
    const vals = {
      id: prev ? prev.id : senseIdFor(entryId, e),
      entry_id: entryId, pos: e.pos, cefr: 'C2', sense_label: null,
      source: 'EDITORIAL', source_list: 'C2_BANK', source_cefr: 'C2', source_ref: e.sourceReference,
      display_order: 900000 + order,
      thai_meaning: e.shortMeaningTH, translation_source: 'AI_GENERATED', translation_status: 'unreviewed',
      simple_definition: e.meaningEN, definition_source: 'EDITORIAL',
      example_sentence: e.example, example_translation: e.exampleTH,
      // คอลัมน์ ipa ของฐานเดิมไม่มี /…/ (หน้าเว็บใส่เอง) — ตัดออกให้รูปแบบเดียวกัน · รูปเต็มยังอยู่ใน c2.ipaUK/ipaUS
      ipa: (e.ipaUK || e.ipaUS) ? (e.ipaUK || e.ipaUS).trim().replace(/^\/+|\/+$/g, '') : null, ipa_source: (e.ipaUK || e.ipaUS) ? 'EDITORIAL' : null,
      synonyms: e.synonyms || [], antonyms: e.antonyms || [], collocations: e.collocations || [],
      word_family: (e.wordFamily || []).map((w) => `${w.form} (${w.pos})`),
      common_mistakes: (e.commonMistakes || []).map((m) => `✗ ${m.wrong} → ✓ ${m.right} — ${m.whyTH}`).join('\n'),
      topic: (e.topics || [])[0] || null, tags: [...new Set([...(e.tags || []), ...(e.topics || []), e.kind])],
      difficulty: e.difficulty, public_id: publicId,
      c2_key: e.key, display_form: e.displayForm, kind: e.kind, register: e.register, connotation: e.connotation,
      real_world_priority: e.realWorldPriority, frequency_band: e.frequencyBand, tier: e.tier,
      variant: e.variant || 'both', verification_status: status,
      verification_issues: JSON.stringify({ errors: res.errors, warnings: res.warnings }),
      base_sense_id: baseSense.get(entryId) || null, c2: JSON.stringify(c2Payload(e)),
    };
    const cols = Object.keys(vals);
    const params = cols.map((c) => vals[c]);
    if (prev) {
      const upd = cols.filter((c) => !['id', 'public_id', 'c2_key'].includes(c));
      await client.query(
        `UPDATE vocab_senses SET ${upd.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE c2_key = $${upd.length + 1}`,
        [...upd.map((c) => vals[c]), e.key]);
      stats.updated += 1;
    } else {
      await client.query(
        `INSERT INTO vocab_senses (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, params);
      stats.inserted += 1;
    }
  }
  // sense_count ของ entry ที่ได้ sense เพิ่ม (ใช้แสดง "มี N ความหมาย")
  await client.query(
    `UPDATE vocab_senses s SET sense_count = c.n FROM (
       SELECT entry_id, COUNT(*)::smallint AS n FROM vocab_senses GROUP BY entry_id) c
      WHERE s.entry_id = c.entry_id AND s.entry_id IN (SELECT entry_id FROM vocab_senses WHERE cefr = 'C2')
        AND s.sense_count IS DISTINCT FROM c.n`);
  log(`[c2-import] ${JSON.stringify(stats)}`);
  return { stats, summary: report.summary };
}

module.exports = { importC2, POS_SHORT };

if (require.main === module) {
  (async () => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await importC2(client, { log: console.log });
      await client.query('COMMIT');
      console.log('validator:', JSON.stringify(r.summary));
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); await pool.end(); }
  })().catch((err) => { console.error(err); process.exit(1); });
}
