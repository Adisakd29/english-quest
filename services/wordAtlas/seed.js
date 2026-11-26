/*
  Word Atlas — นำชุดข้อมูลเข้า DB (ขั้น Publish ของ Import Pipeline)
    data/word-atlas/atlas-*.jsonl.gz  (สร้างโดย scripts/word-atlas/build_dataset.py)
  - idempotent: checksum ไฟล์เดิม = ข้าม · upsert ด้วย id คงที่ (ON CONFLICT DO UPDATE) · ไม่ลบแถวเดิม
    แถวที่หายจากชุดข้อมูลใหม่ → learnable = FALSE (ความคืบหน้าผู้เรียนยังอยู่)
  - ความหมายที่ชี้ Oxford: ตรวจว่า public_id มีจริงใน vocab_senses ก่อน (ไม่มี = ไม่ลิงก์ · นับในรายงาน)
  - Unit: กำหนดครั้งเดียวแล้วคงที่ — ความหมายใหม่ที่เรียนได้ต่อท้ายเป็น Unit ใหม่ของตัวอักษรนั้น (ไม่สลับ Unit เดิม)
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const readline = require('readline');
const { validateSense } = require('./validator');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'word-atlas');
const UNIT_SIZE = 12;
const CEFR_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const LOCK_KEY = 707070;

const hash12 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const lemmaId = (lemma) => `L-${hash12(lemma)}`;
const oxfordRowId = (publicId) => `WA-${hash12(`oxford|${publicId}`)}`;

function latestDataset() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const f = fs.readdirSync(DATA_DIR).filter((x) => /^atlas-[\w-]+\.jsonl\.gz$/.test(x)).sort().pop();
  return f ? path.join(DATA_DIR, f) : null;
}

async function* readRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) { if (line.trim()) yield JSON.parse(line); }
}

/** INSERT หลายแถวใน query เดียว (ทีละ chunk) */
async function bulkUpsert(client, table, cols, rows, conflict, update, casts = {}) {
  const CH = 400;
  for (let i = 0; i < rows.length; i += CH) {
    const part = rows.slice(i, i + CH);
    const params = []; const tuples = [];
    for (const r of part) {
      tuples.push(`(${cols.map((c) => { params.push(r[c]); return `$${params.length}${casts[c] || ''}`; }).join(',')})`);
    }
    await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}
      ON CONFLICT ${conflict} DO UPDATE SET ${update.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = NOW()`, params);
  }
}

/** ตัวอักษรของหมวด A–Z: ตัดวงเล็บนำหน้า เช่น "(be) on thin ice" → o */
const letterOf = (lemma) => { const m = String(lemma).replace(/^\([^)]*\)\s*/, '').match(/[a-z]/); return m ? m[0] : 'a'; };
const sortKey = (lemma) => String(lemma).replace(/^\([^)]*\)\s*/, '').replace(/[()]/g, '').trim();
const bandOf = (z) => (!z ? null : z >= 6 ? 1 : z >= 5 ? 2 : z >= 4.5 ? 3 : z >= 4 ? 4 : z >= 3 ? 5 : 6);
const registerOf = (labels) => (labels.includes('formal') ? 'formal' : labels.includes('slang') ? 'slang' : labels.includes('informal') ? 'informal' : labels.includes('literary') ? 'literary' : labels.includes('technical') ? 'technical' : null);

/**
 * @param pool  pg Pool
 * @param {{file?:string, force?:boolean, log?:Function}} o
 */
async function seed(pool, o = {}) {
  const log = o.log || (() => {});
  const file = o.file || latestDataset();
  if (!file) { log('[word-atlas] ไม่พบไฟล์ชุดข้อมูล — ข้าม'); return { skipped: true }; }
  const buf = fs.readFileSync(file);
  const checksum = crypto.createHash('sha1').update(buf).digest('hex');
  const dataset = path.basename(file).replace(/\.jsonl\.gz$/, '').slice(0, 24);
  const client = await pool.connect();
  try {
    const got = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!got.rows[0].ok) { log('[word-atlas] มีเครื่องอื่นกำลังนำเข้า — ข้าม'); return { skipped: true, locked: true }; }
    try {
      const meta = (await client.query("SELECT value FROM atlas_meta WHERE key = 'dataset'")).rows[0];
      if (!o.force && meta && meta.value.checksum === checksum) { log(`[word-atlas] ชุดข้อมูล ${dataset} นำเข้าแล้ว — ข้าม`); return { skipped: true, dataset }; }
      const t0 = Date.now();
      // Oxford ที่มีจริงในฐานข้อมูลนี้ (ตรวจลิงก์ก่อนนำเข้า)
      const ox = new Map((await client.query(
        `SELECT s.public_id, s.cefr, s.pos, s.thai_meaning FROM vocab_senses s
          WHERE s.public_id IS NOT NULL AND NOT s.is_supplemental
            AND (s.cefr <> 'C2' OR s.verification_status IN ('autoChecked', 'reviewed'))`)).rows.map((r) => [r.public_id, r]));
      const lemmas = []; const senses = []; const report = { lemmas: 0, senses: 0, oxfordLinked: 0, oxfordMissing: 0, learnable: 0 };
      for await (const r of readRows(file)) {
        const lid = lemmaId(r.lemma);
        const rowsOut = [];
        const seenDef = new Set();
        let n = 0;
        for (const s of r.senses) {
          // Deduplicate: ความหมายใหม่ที่ชนิดคำ + นิยามซ้ำกับที่มีแล้ว (มาจากคนละหัวข้อที่มาของคำ) → ข้าม
          const dk = !s.oxford && s.def ? `${s.pos}|${String(s.def).toLowerCase().replace(/\W+/g, ' ').trim()}` : null;
          if (dk && seenDef.has(dk)) { report.duplicateSensesSkipped = (report.duplicateSensesSkipped || 0) + 1; continue; }
          if (dk) seenDef.add(dk);
          n += 1;
          let id; let cefr = null; let thai = s.thai || []; let pos = s.pos || null; let learnable = Boolean(s.learnable);
          if (s.oxford) {
            const o2 = ox.get(s.oxford);
            if (!o2) { report.oxfordMissing += 1; continue; }
            id = oxfordRowId(s.oxford); cefr = o2.cefr; pos = o2.pos || pos;
            thai = o2.thai_meaning ? [o2.thai_meaning] : []; learnable = Boolean(o2.thai_meaning);
            report.oxfordLinked += 1;
          } else id = s.id;
          const labels = s.labels || [];
          const examples = (s.oxford ? s.ex_extra : s.ex) || [];
          rowsOut.push({
            id, lemma_id: lid, oxford_sense_id: s.oxford || null, sense_no: n, pos,
            definition_en: s.oxford ? (s.def_wikt || null) : (s.def || null),
            thai, examples: JSON.stringify(examples.map((en) => ({ en }))),
            synonyms: (s.oxford ? s.syn_extra : s.syn) || [], antonyms: (s.oxford ? s.ant_extra : s.ant) || [],
            phrasal_verbs: n === 1 ? (r.phrasal || []) : [], word_family: n === 1 ? (r.family || []) : [],
            topics: s.topics || [], labels, register: registerOf(labels),
            cefr, difficulty: cefr ? CEFR_ORDER[cefr] : bandOf(r.zipf),
            ipa_uk: r.ipa_uk || null, ipa_us: r.ipa_us || null, audio_uk: r.audio_uk || null, audio_us: r.audio_us || null,
            source: String(s.source || 'WIKTIONARY').slice(0, 48), license: String(s.license || 'CC BY-SA 4.0').slice(0, 48),
            source_ref: s.ref || s.oxford || null, verification_status: s.status || 'unverified', quality_flags: s.flags || [],
            learnable, dataset,
          });
          // Validator: ไม่ผ่าน = ไม่ใช้ทำแบบฝึกที่ให้คะแนน (ยังแสดงใน Browse ได้พร้อมป้าย)
          const row = rowsOut[rowsOut.length - 1];
          const v = validateSense({ ...row, lemma: r.lemma, examples: examples.map((en) => ({ en })) });
          if (v.errors.length) {
            report.validatorErrors = (report.validatorErrors || 0) + 1;
            row.quality_flags = [...new Set([...row.quality_flags, ...v.errors.map((e) => `error:${e}`)])];
            if (row.learnable) { row.learnable = false; report.blockedByValidator = (report.blockedByValidator || 0) + 1; }
          }
        }
        if (!rowsOut.length) continue;
        const learn = rowsOut.filter((x) => x.learnable);
        const cefrs = [...new Set(rowsOut.map((x) => x.cefr).filter(Boolean))].sort((a, b) => CEFR_ORDER[a] - CEFR_ORDER[b]);
        const allThai = [...new Set(rowsOut.flatMap((x) => (x.learnable || x.oxford_sense_id ? x.thai : [])))];
        const first = learn[0] || rowsOut[0];
        lemmas.push({
          id: lid, lemma: r.lemma, display: r.display || r.lemma, sort_key: sortKey(r.lemma), letter: letterOf(r.lemma), kind: r.kind || 'word',
          zipf: r.zipf || null, freq_rank: r.rank || null, freq_band: r.band || null,
          pos_list: [...new Set(rowsOut.map((x) => x.pos).filter(Boolean))], cefr_list: cefrs, cefr_min: cefrs[0] || null,
          topics: [...new Set(rowsOut.flatMap((x) => x.topics))].sort(), labels: [...new Set(rowsOut.flatMap((x) => x.labels))].sort(),
          primary_thai: (learn[0] && learn[0].thai[0]) || null, primary_pos: first.pos,
          ipa_uk: r.ipa_uk || null, ipa_us: r.ipa_us || null,
          sense_total: rowsOut.length, learnable_total: learn.length, oxford: rowsOut.some((x) => x.oxford_sense_id),
          progress_ids: learn.map((x) => x.oxford_sense_id || x.id), search_th: allThai.join(' | ') || null, dataset,
        });
        senses.push(...rowsOut);
        report.lemmas += 1; report.senses += rowsOut.length; report.learnable += learn.length;
      }
      await client.query('BEGIN');
      await bulkUpsert(client, 'atlas_lemmas',
        ['id', 'lemma', 'display', 'sort_key', 'letter', 'kind', 'zipf', 'freq_rank', 'freq_band', 'pos_list', 'cefr_list', 'cefr_min', 'topics', 'labels',
          'primary_thai', 'primary_pos', 'ipa_uk', 'ipa_us', 'sense_total', 'learnable_total', 'oxford', 'progress_ids', 'search_th', 'dataset'],
        lemmas, '(id)',
        ['display', 'sort_key', 'kind', 'zipf', 'freq_rank', 'freq_band', 'pos_list', 'cefr_list', 'cefr_min', 'topics', 'labels', 'primary_thai', 'primary_pos',
          'ipa_uk', 'ipa_us', 'sense_total', 'learnable_total', 'oxford', 'progress_ids', 'search_th', 'dataset']);
      await bulkUpsert(client, 'atlas_senses',
        ['id', 'lemma_id', 'oxford_sense_id', 'sense_no', 'pos', 'definition_en', 'thai', 'examples', 'synonyms', 'antonyms', 'phrasal_verbs',
          'word_family', 'topics', 'labels', 'register', 'cefr', 'difficulty', 'ipa_uk', 'ipa_us', 'audio_uk', 'audio_us', 'source', 'license',
          'source_ref', 'verification_status', 'quality_flags', 'learnable', 'dataset'],
        senses, '(id)',
        ['sense_no', 'pos', 'definition_en', 'thai', 'examples', 'synonyms', 'antonyms', 'phrasal_verbs', 'word_family', 'topics', 'labels', 'register',
          'cefr', 'difficulty', 'ipa_uk', 'ipa_us', 'audio_uk', 'audio_us', 'source', 'license', 'source_ref', 'verification_status', 'quality_flags',
          'learnable', 'dataset'],
        { examples: '::jsonb' });
      // แถวที่ไม่มีในชุดข้อมูลนี้แล้ว: เลิกใช้ทำแบบฝึก (ไม่ลบ — ความคืบหน้าผู้เรียนยังอยู่)
      const retired = await client.query('UPDATE atlas_senses SET learnable = FALSE, updated_at = NOW() WHERE dataset <> $1 AND learnable', [dataset]);
      report.retired = retired.rowCount;
      report.unitsCreated = await assignUnits(client);
      await client.query(`INSERT INTO atlas_meta (key, value) VALUES ('dataset', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ dataset, checksum, file: path.basename(file), report, importedAt: new Date().toISOString() })]);
      await client.query('COMMIT');
      log(`[word-atlas] นำเข้า ${dataset}: ${report.lemmas} lemmas · ${report.senses} senses (Oxford ${report.oxfordLinked}) · เรียนได้ ${report.learnable} · Unit ใหม่ ${report.unitsCreated} · ${Date.now() - t0} ms`);
      return { dataset, report };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** ความหมายที่เรียนได้แต่ยังไม่อยู่ใน Unit → ต่อท้าย Unit ใหม่ของตัวอักษรนั้น (เรียง: ใช้บ่อย → ง่าย → ลำดับความหมาย) */
async function assignUnits(client) {
  const { rows } = await client.query(
    `SELECT s.id, l.letter FROM atlas_senses s JOIN atlas_lemmas l ON l.id = s.lemma_id
      WHERE s.learnable AND NOT EXISTS (SELECT 1 FROM atlas_unit_items u WHERE u.sense_id = s.id)
      ORDER BY l.letter, l.freq_rank NULLS LAST, COALESCE(s.difficulty, 9), l.lemma, s.sense_no`);
  const byLetter = new Map();
  rows.forEach((r) => { if (!byLetter.has(r.letter)) byLetter.set(r.letter, []); byLetter.get(r.letter).push(r.id); });
  let created = 0;
  for (const [letter, ids] of byLetter) {
    const last = (await client.query('SELECT COALESCE(MAX(seq), 0)::int AS n FROM atlas_units WHERE letter = $1', [letter])).rows[0].n;
    for (let i = 0, seq = last + 1; i < ids.length; i += UNIT_SIZE, seq += 1) {
      const unitId = `${letter.toUpperCase()}-${String(seq).padStart(3, '0')}`;
      await client.query('INSERT INTO atlas_units (id, letter, seq) VALUES ($1, $2, $3)', [unitId, letter, seq]);
      const part = ids.slice(i, i + UNIT_SIZE);
      await client.query(`INSERT INTO atlas_unit_items (unit_id, sense_id, ord)
        SELECT $1, x.id, x.ord FROM unnest($2::text[]) WITH ORDINALITY AS x(id, ord)`, [unitId, part]);
      created += 1;
    }
  }
  return created;
}

module.exports = { seed, latestDataset, lemmaId, oxfordRowId, letterOf, UNIT_SIZE };
