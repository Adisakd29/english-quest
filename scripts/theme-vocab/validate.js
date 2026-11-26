#!/usr/bin/env node
/* ตรวจเนื้อหาหมวดคำศัพท์ตามเทศกาล: node scripts/theme-vocab/validate.js — exit 1 ถ้ามี error */
const fs = require('fs');
const path = require('path');
const { CATEGORIES, validateFile } = require('../../services/themeVocab/validator');

let bad = 0;
for (const c of CATEGORIES) {
  const file = path.join(__dirname, '..', '..', 'data', 'theme-vocab', `${c.id}.json`);
  const r = validateFile(JSON.parse(fs.readFileSync(file, 'utf8')), c.id);
  console.log(`${c.id}: ${r.items.length} คำ · ${r.errors.length} error`);
  r.errors.forEach((e) => console.log('  ' + e));
  bad += r.errors.length;
}
process.exit(bad ? 1 : 0);
