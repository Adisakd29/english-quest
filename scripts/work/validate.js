#!/usr/bin/env node
// ตรวจไฟล์เนื้อหา English for Work: node scripts/work/validate.js [data/premium/work/<topic>.json ...]
const fs = require('fs');
const path = require('path');
const { TOPICS, validateFile } = require('../../services/work/validator');
const dir = path.join(__dirname, '..', '..', 'data', 'premium', 'work');
const files = process.argv.slice(2).length ? process.argv.slice(2) : TOPICS.map((t) => path.join(dir, `${t.id}.json`)).filter((f) => fs.existsSync(f));
let total = 0;
for (const f of files) {
  let json;
  try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { console.log(`✗ ${f}: JSON ไม่ถูกต้อง — ${err.message}`); total += 1; continue; }
  const r = validateFile(json, path.basename(f, '.json'));
  total += r.errors.length;
  console.log(`${r.errors.length ? '✗' : '✓'} ${path.basename(f)}: ${r.items.length} รายการผ่าน · ${r.errors.length} error`);
  r.errors.forEach((e) => console.log(`   - ${e}`));
}
// วลีซ้ำข้ามหัวข้อ
const { norm } = require('../../services/work/validator');
const seenAll = new Map();
for (const f of files) {
  let json; try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
  for (const it of json.items || []) {
    const k = norm(it.phrase);
    if (seenAll.has(k)) { console.log(`✗ phrase ซ้ำข้ามหัวข้อ: "${it.phrase}" (${seenAll.get(k)} / ${it.id})`); total += 1; } else seenAll.set(k, it.id);
  }
}
process.exit(total ? 1 : 0);
