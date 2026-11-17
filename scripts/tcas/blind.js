#!/usr/bin/env node
/*
  v1.19.0 ขั้นตรวจแบบ "ทำข้อสอบโดยไม่เห็นเฉลย" (blind solve)
  node scripts/tcas/blind.js make <set.json> <out-blind.json>         ตัดเฉลย/คำอธิบายออก ให้ผู้ตรวจทำ
  node scripts/tcas/blind.js compare <set.json> <answers.json>        เทียบคำตอบผู้ตรวจกับเฉลย
     answers.json = { "<itemId>": { "choice": 0-3, "confident": true|false, "note": "..." } }
*/
const fs = require('node:fs');
const [cmd, a, b] = process.argv.slice(2);
const set = JSON.parse(fs.readFileSync(a, 'utf8'));
if (cmd === 'make') {
  const blind = JSON.parse(JSON.stringify(set));
  delete blind.review;
  for (const s of blind.sections) for (const g of s.groups) for (const it of g.items) { delete it.answer; delete it.explanationTh; delete it.skill; }
  fs.writeFileSync(b, JSON.stringify(blind, null, 1));
  console.log(`blind -> ${b}`);
} else if (cmd === 'compare') {
  const ans = JSON.parse(fs.readFileSync(b, 'utf8'));
  let agree = 0; let total = 0; const issues = [];
  for (const s of set.sections) for (const g of s.groups) for (const it of g.items) {
    total += 1;
    const r = ans[it.id];
    if (!r) { issues.push({ id: it.id, kind: 'missing' }); continue; }
    if (r.choice === it.answer && r.confident !== false) agree += 1;
    else issues.push({ id: it.id, kind: r.choice === it.answer ? 'unsure' : 'disagree', key: 'ABCD'[it.answer], reviewer: 'ABCD'[r.choice], note: r.note || '' });
  }
  console.log(JSON.stringify({ total, agree, issues }, null, 1));
} else { console.error('cmd: make | compare'); process.exit(2); }
