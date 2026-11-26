#!/usr/bin/env node
/*
  สร้างไฟล์ input สำหรับผู้เขียนเนื้อหาคำศัพท์ระดับผู้เรียน (data/vocab-learner/input/batch-NN.json)
    node scripts/learner/export-input.js --levels B2,C1 --start 25 --batches B2:13,C1:11
  - อ่านจากฐานข้อมูล (DATABASE_URL) · เรียงตาม public_id · แต่ละ batch มีระดับเดียว
  - ไม่เขียนทับไฟล์ที่มีอยู่แล้ว (กันลบงานที่เขียนไปแล้ว) เว้นแต่ใส่ --force
  ฟิลด์: { id, cefr, headword, pos, senseLabel, currentThai, flagNote, displayForm }
*/
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const levels = arg('levels', 'B2,C1').split(',');
let n = Number(arg('start', '25'));
const counts = Object.fromEntries(arg('batches', 'B2:13,C1:11').split(',').map((x) => x.split(':')).map(([l, c]) => [l, Number(c)]));
const force = process.argv.includes('--force');
const OUT = path.join(__dirname, '../../data/vocab-learner/input');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const lv of levels) {
    const { rows } = await c.query(
      `SELECT s.public_id AS id, s.cefr, e.headword, s.pos, s.sense_label AS "senseLabel", s.thai_meaning AS "currentThai",
              s.translation_note AS "flagNote", s.display_form AS "displayForm"
         FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
        WHERE s.cefr = $1 AND s.public_id IS NOT NULL ORDER BY s.public_id`, [lv]);
    const k = counts[lv] || Math.ceil(rows.length / 125);
    const size = Math.ceil(rows.length / k);
    for (let b = 0; b < k; b++) {
      const part = rows.slice(b * size, (b + 1) * size);
      if (!part.length) continue;
      const file = path.join(OUT, `batch-${String(n).padStart(2, '0')}.json`);
      if (fs.existsSync(file) && !force) { console.log(`มีอยู่แล้ว ข้าม ${path.basename(file)}`); n++; continue; }
      fs.writeFileSync(file, `${JSON.stringify(part, null, 1)}\n`);
      console.log(`${path.basename(file)}: ${lv} ${part.length} รายการ (${part[0].id}–${part[part.length - 1].id})`);
      n++;
    }
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
