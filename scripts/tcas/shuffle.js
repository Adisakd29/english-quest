#!/usr/bin/env node
/*
  v1.28.0 สลับตำแหน่งตัวเลือก (คำตอบที่ถูกไม่เรียงเป็นแบบแผนที่เดาได้)
  ผู้เขียน AI หลายชุดวางเฉลยเป็นลำดับเดียวกัน (C A D B C B D A …) → นักเรียนที่ทำหลายชุดเดาได้
  node scripts/tcas/shuffle.js <set.json> [seed]
  - สุ่มลำดับตัวเลือกใหม่ทุกข้อ (seed คงที่ต่อชุด = ผลซ้ำได้) แล้วปรับ answer ตาม
  - ไม่แตะข้อหาจุดผิด (ตัวเลือกต้องเรียงตามประโยค) และข้อที่คำอธิบายอ้างตัวอักษรตัวเลือก (เช่น "ตัวเลือก B")
  - สุ่มซ้ำจนผ่านตัวตรวจ (กระจาย 17–33% / 13–27% · ไม่ติดกัน 4 ข้อ)
*/
const fs = require('node:fs');
const { validateSet } = require('./validate');

const FIXED = new Set(['cu_error', 'tu_error']);
const LETTER_REF = /(ตัวเลือก|ข้อ|choice|option)\s*\(?[A-E]\)?(?![a-z])/i;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function shuffleSet(set, seed) {
  const r = rng(seed);
  let skipped = 0;
  for (const sec of set.sections) for (const g of sec.groups) {
    if (FIXED.has(g.type)) continue;
    for (const it of g.items) {
      if (LETTER_REF.test(it.explanationTh || '')) { skipped += 1; continue; }
      const idx = it.options.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      it.options = idx.map((i) => it.options[i]);
      it.answer = idx.indexOf(it.answer);
    }
  }
  return skipped;
}

if (require.main === module) {
  const [file, seedArg] = process.argv.slice(2);
  const orig = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = seedArg ? Number(seedArg) : hash(orig.setId);
  for (let t = 0; t < 400; t += 1) {
    const set = JSON.parse(JSON.stringify(orig));
    const skipped = shuffleSet(set, base + t);
    const errs = validateSet(set).filter((e) => /กระจาย|ติดกัน|ยาวที่สุด/.test(e));
    if (!errs.length && !validateSet(set).length) {
      fs.writeFileSync(file, `${JSON.stringify(set, null, 2)}\n`);
      const keys = set.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((it) => 'ABCDE'[it.answer]))).join('');
      console.log(`${file}: สลับแล้ว (รอบ ${t + 1}, ข้ามข้อที่อ้างตัวอักษร ${skipped}) ${keys}`);
      process.exit(0);
    }
  }
  console.log(`${file}: สลับไม่สำเร็จใน 400 รอบ`); process.exit(1);
}
module.exports = { shuffleSet };
