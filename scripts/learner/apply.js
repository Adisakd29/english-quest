/*
  นำเนื้อหาคำศัพท์ระดับผู้เรียน A1–B1 (data/vocab-learner/out) เข้า vocab_senses — เรียกจาก migration 061
  - แทนความหมาย/ตัวอย่างจาก WordNet ด้วยเนื้อหาที่เขียนใหม่ (ตรวจ 3 ชั้น: validator + ผู้ตรวจอิสระ + ตรวจรอบสุดท้าย)
  - สำรองค่าเดิมไว้ใน vocab_senses_prelearner_backup ก่อนแก้ (ใช้ย้อนกลับใน _down)
  - คำแปลไทยที่ผู้ดูแล "ตรวจแล้ว" (translation_status = 'reviewed') ไม่ถูกเขียนทับ
  - ความหมาย/ประโยคตัวอย่างที่ผู้ดูแลเคยแก้เอง (มีใน content_edits) ไม่ถูกเขียนทับ — ประโยคที่คงไว้ไม่ใช้ทำแบบเติมคำ
  - ตรวจ id + headword ตรงกันก่อนแก้ทุกแถว (กัน id เลื่อน) · รายการที่ไม่ผ่าน validator ข้าม
  idempotent: รันซ้ำได้ผลเท่าเดิม
*/
const fs = require('fs');
const path = require('path');
const { validateItem } = require('../../services/learner/validator');

const ROOT = path.join(__dirname, '../../data/vocab-learner');

function loadItems() {
  const files = fs.readdirSync(path.join(ROOT, 'out')).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  const items = [];
  for (const f of files) {
    const out = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', f), 'utf8'));
    const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'input', f), 'utf8'));
    out.forEach((it, i) => items.push({ it, src: input[i] }));
  }
  return items;
}

async function applyLearner(client, { log = console.log, levels = ['A1', 'A2', 'B1'] } = {}) {
  await client.query('ALTER TABLE vocab_senses ADD COLUMN IF NOT EXISTS learner JSONB');
  await client.query(`CREATE TABLE IF NOT EXISTS vocab_senses_prelearner_backup (
    public_id VARCHAR(16) PRIMARY KEY, simple_definition TEXT, definition_source TEXT, example_sentence TEXT,
    example_translation TEXT, thai_meaning TEXT, translation_note TEXT, collocations TEXT[], verification_status TEXT,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  const { rows } = await client.query(
    `SELECT s.public_id, s.cefr, e.headword, s.pos, s.translation_status FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
      WHERE s.public_id IS NOT NULL AND s.cefr = ANY($1::text[])`, [levels]);
  const db = new Map(rows.map((r) => [r.public_id, r]));
  if (db.size === 0) { log(`[learner] ไม่มีคำศัพท์ ${levels.join('/')} ในฐาน — ข้าม`); return { updated: 0, skipped: 0 }; }

  // ความหมาย/ตัวอย่างที่ผู้ดูแลเคยแก้เอง (content_edits) — ไม่เขียนทับงานของคน (v1.10.0 · ทดสอบอัปเกรดจาก v1.9.0)
  const humanEdits = new Map();
  const hasEdits = (await client.query("SELECT to_regclass('public.content_edits') AS t")).rows[0].t;
  if (hasEdits) {
    const { rows: ed } = await client.query(
      `SELECT word_id,
              bool_or(before_data->>'simple_definition' IS DISTINCT FROM after_data->>'simple_definition') AS def,
              bool_or(before_data->>'example_sentence' IS DISTINCT FROM after_data->>'example_sentence') AS ex
         FROM content_edits GROUP BY word_id`);
    ed.forEach((r) => { if (r.def || r.ex) humanEdits.set(r.word_id, { def: r.def, ex: r.ex }); });
  }

  let updated = 0; let skipped = 0; let keptThai = 0; let keptDef = 0; let keptEx = 0;
  for (const { it, src } of loadItems()) {
    if (!levels.includes(src.cefr)) continue;   // 061 = A1–B1 · 067 = B2–C1 (ไม่แตะระดับอื่น — กันทับที่ผู้ดูแลแก้ไว้)
    const row = db.get(it.id);
    const { errors } = validateItem(it, src, 0);
    if (!row || row.headword !== it.headword || row.pos !== it.pos || errors.length) {
      skipped++;
      if (skipped <= 10) log(`[learner] ข้าม ${it.id}: ${!row ? 'ไม่พบในฐาน' : errors[0] || 'headword/pos ไม่ตรง'}`);
      continue;
    }
    await client.query(
      `INSERT INTO vocab_senses_prelearner_backup (public_id, simple_definition, definition_source, example_sentence,
         example_translation, thai_meaning, translation_note, collocations, verification_status)
       SELECT public_id, simple_definition, definition_source, example_sentence, example_translation, thai_meaning,
              translation_note, collocations, verification_status FROM vocab_senses WHERE public_id = $1
       ON CONFLICT (public_id) DO NOTHING`, [it.id]);
    const humanThai = row.translation_status === 'reviewed';
    if (humanThai) keptThai++;
    const he = humanEdits.get(it.id) || {};
    if (he.def) keptDef++;
    if (he.ex) keptEx++;
    const learner = {
      shortTH: humanThai ? null : it.shortTH,
      // คงประโยคที่ผู้ดูแลเขียนเอง → ไม่ใช้ทำแบบเติมคำ (form ของเนื้อหาใหม่อาจไม่อยู่ในประโยคนั้น)
      form: he.ex ? null : it.form, gapOk: he.ex ? false : it.gapOk, functionWord: it.functionWord,
      noteTH: it.noteTH || null, check: 'validator+blind-review+final-check', version: 1,
      ...(he.def || he.ex ? { humanKept: { definition: Boolean(he.def), example: Boolean(he.ex) } } : {}),
    };
    await client.query(
      `UPDATE vocab_senses SET simple_definition = CASE WHEN $8 THEN simple_definition ELSE $2 END,
              definition_source = CASE WHEN $8 THEN definition_source ELSE 'EQ_LEARNER' END,
              example_sentence = CASE WHEN $9 THEN example_sentence ELSE $3 END,
              example_translation = CASE WHEN $9 THEN example_translation ELSE $4 END, collocations = $5,
              thai_meaning = CASE WHEN translation_status = 'reviewed' THEN thai_meaning ELSE $6 END,
              translation_status = CASE WHEN translation_status = 'missing' THEN 'unreviewed' ELSE translation_status END,
              translation_source = COALESCE(translation_source, 'AI_GENERATED'),
              translation_note = CASE WHEN translation_status = 'reviewed' THEN translation_note ELSE NULL END,
              verification_status = COALESCE(verification_status, 'autoChecked'),
              learner = $7, updated_at = NOW()
        WHERE public_id = $1`,
      [it.id, it.meaningEN, it.example, it.exampleTH, it.collocations, it.thai, JSON.stringify(learner), Boolean(he.def), Boolean(he.ex)]);
    updated++;
  }
  log(`[learner] อัปเดต ${updated} ความหมาย · ข้าม ${skipped} · คงคำแปลที่ผู้ดูแลตรวจแล้ว ${keptThai} · คงความหมาย/ตัวอย่างที่ผู้ดูแลแก้เอง ${keptDef}/${keptEx}`);
  return { updated, skipped, keptThai, keptDef, keptEx };
}

module.exports = { applyLearner, loadItems };
