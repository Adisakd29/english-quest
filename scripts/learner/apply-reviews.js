#!/usr/bin/env node
/*
  นำผลตรวจ (data/vocab-learner/reviews/batch-NN.json) ไปแก้ไฟล์เนื้อหา (out/batch-NN.json)
  - แก้เฉพาะฟิลด์ที่อนุญาต · คำนวณ thaiChanged ใหม่จาก currentThai ใน input
  - บันทึกประวัติไว้ที่ reviews/applied.json (id → severity/problem) ใช้ทำรายงานและตรวจย้อนหลัง
  ใช้: node scripts/learner/apply-reviews.js   (ทำซ้ำได้ — fix ที่ใช้แล้วจะได้ค่าเดิม)
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../data/vocab-learner');
const ALLOWED = new Set(['meaningEN', 'thai', 'thaiChangeReason', 'shortTH', 'example', 'form', 'exampleTH', 'collocations', 'gapOk', 'noteTH']);
const log = {};
let applied = 0; let skipped = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'reviews')).filter((x) => /^batch-\d+\.json$/.test(x)).sort()) {
  const review = JSON.parse(fs.readFileSync(path.join(ROOT, 'reviews', f), 'utf8'));
  const outPath = path.join(ROOT, 'out', f);
  const items = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'input', f), 'utf8'));
  const byId = new Map(items.map((it, i) => [it.id, i]));
  for (const iss of review.issues || []) {
    const i = byId.get(iss.id);
    if (i === undefined) { console.log(`skip ${f} ${iss.id}: ไม่พบ id`); skipped++; continue; }
    const it = items[i];
    for (const [k, v] of Object.entries(iss.fix || {})) {
      if (!ALLOWED.has(k)) { console.log(`skip field ${k} (${iss.id})`); continue; }
      it[k] = v;
    }
    const changed = (it.thai || '') !== (input[i].currentThai || '');
    it.thaiChanged = changed;
    if (!changed) it.thaiChangeReason = null;
    log[iss.id] = { batch: f, severity: iss.severity, problem: iss.problem };
    applied++;
  }
  fs.writeFileSync(outPath, JSON.stringify(items, null, 1) + '\n');
}
fs.writeFileSync(path.join(ROOT, 'reviews', 'applied.json'), JSON.stringify(log, null, 1) + '\n');
console.log(`applied ${applied} issue(s), skipped ${skipped}`);
