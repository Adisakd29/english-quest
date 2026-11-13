#!/usr/bin/env node
/*
  ตรวจไฟล์เนื้อหาคำศัพท์ระดับผู้เรียน
    node scripts/learner/validate.js data/vocab-learner/out/batch-01.json   (ไฟล์เดียว — เทียบ input/batch-01.json)
    node scripts/learner/validate.js                                         (ทุกไฟล์ใน out/ + ตัวอย่างซ้ำข้ามไฟล์)
*/
const fs = require('fs');
const path = require('path');
const { validateBatch } = require('../../services/learner/validator');

const ROOT = path.join(__dirname, '../../data/vocab-learner');
const files = process.argv[2] ? [path.resolve(process.argv[2])]
  : fs.readdirSync(path.join(ROOT, 'out')).filter((f) => /^batch-\d+\.json$/.test(f)).sort().map((f) => path.join(ROOT, 'out', f));

// ตัวอย่างจากไฟล์อื่นใน out/ (กันซ้ำข้ามไฟล์)
const seen = new Map();
const others = fs.existsSync(path.join(ROOT, 'out')) ? fs.readdirSync(path.join(ROOT, 'out')).filter((f) => /^batch-\d+\.json$/.test(f)) : [];
if (process.argv[2]) {
  for (const f of others) {
    const p = path.join(ROOT, 'out', f);
    if (path.resolve(p) === files[0]) continue;
    try { JSON.parse(fs.readFileSync(p, 'utf8')).forEach((it) => it && it.example && seen.set(it.example.toLowerCase().replace(/[^a-z ]/g, '').trim(), it.id)); } catch { /* ไฟล์อื่นยังเขียนไม่เสร็จ */ }
  }
}

let bad = 0; let warnCount = 0;
for (const f of files) {
  let items;
  try { items = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { console.log(`${path.basename(f)}: JSON ไม่ถูกต้อง — ${err.message}`); bad++; continue; }
  const inPath = path.join(ROOT, 'input', path.basename(f));
  const input = fs.existsSync(inPath) ? JSON.parse(fs.readFileSync(inPath, 'utf8')) : null;
  const { errors, warnings } = validateBatch(items, input, seen);
  warnCount += warnings.length;
  if (errors.length) { bad++; console.log(`✗ ${path.basename(f)}: ${errors.length} errors`); errors.slice(0, 80).forEach((x) => console.log('  ERROR ' + x)); }
  warnings.slice(0, 40).forEach((x) => console.log('  warn  ' + x));
}
if (bad) { console.log(`\nFAIL (${bad} file(s) with errors)`); process.exit(1); }
console.log(`OK (${files.length} file(s), ${warnCount} warning(s))`);
