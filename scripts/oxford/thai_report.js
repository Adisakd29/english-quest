/*
  สร้างไฟล์สำหรับตรวจทานคำแปลไทยรายระดับ
    node scripts/oxford/thai_report.js A2   -> reports/thai_A2_review.md
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const level = process.argv[2] || 'A1';
const thai = require(path.join(ROOT, 'data', 'oxford', 'thai_meanings.json'));
const senses = require(path.join(ROOT, 'data', 'oxford', 'senses.json')).filter((s) => s.cefr === level);
const AB = {
  noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.',
  conjunction: 'conj.', determiner: 'det.', exclamation: 'exclam.', number: 'number', 'modal verb': 'modal v.',
  'auxiliary verb': 'aux. v.', 'indefinite article': 'indef. art.', 'definite article': 'def. art.',
  'infinitive marker': 'inf. marker',
};
const word = (s) => `${s.headword}${s.homograph ? `<sup>${s.homograph}</sup>` : ''}${s.senseLabel ? ` <i>(${s.senseLabel})</i>` : ''}`;
const list = (s) => (s.sourceList === 'OXFORD_3000' ? '3000' : '5000');
const row = (s) => `| ${word(s)} | ${AB[s.pos] || '—'} | ${thai[s.senseId].thai} | ${list(s)} | ${thai[s.senseId].note || ''} |`;

const done = senses.filter((s) => thai[s.senseId]);
const flagged = done.filter((s) => thai[s.senseId].flagged);
const ok = done.filter((s) => !thai[s.senseId].flagged);

const byThai = {};
done.forEach((s) => { (byThai[thai[s.senseId].thai] = byThai[thai[s.senseId].thai] || new Set()).add(s.entryId); });
const synonyms = Object.entries(byThai).filter(([, v]) => v.size > 1);

const md = [
  `# คำแปลไทย ${level} — สำหรับตรวจทาน`, '',
  '> แหล่งที่มา: **AI_GENERATED** (ไม่ได้มาจาก Oxford) · สถานะ: **unreviewed** · ชนิดคำและระดับมาจากต้นฉบับ Oxford', '',
  `ทั้งหมด ${senses.length} sense · แปลแล้ว ${done.length} · ต้องตรวจเป็นพิเศษ (flag) ${flagged.length}`, '',
  `## ⚠️ ต้องตรวจเป็นพิเศษ (${flagged.length})`, '',
  '| คำ | ชนิด | คำแปล | รายการ | เหตุผลที่ flag |', '|---|---|---|---|---|', ...flagged.map(row), '',
  `## คำที่แปลเหมือนกัน (${synonyms.length} กลุ่ม) — แบบทดสอบต้องไม่ใช้เป็นตัวลวงของกันและกัน`, '',
  ...synonyms.map(([t, v]) => `- ${t} ← ${[...v].join(', ')}`), '',
  `## คำแปลทั้งหมด (${ok.length})`, '',
  '| คำ | ชนิด | คำแปล | รายการ | |', '|---|---|---|---|---|', ...ok.map(row),
];
const out = path.join(ROOT, 'reports', `thai_${level}_review.md`);
fs.writeFileSync(out, md.join('\n'));
console.log(`สร้าง ${path.relative(ROOT, out)} · flag ${flagged.length} · แปลเหมือนกัน ${synonyms.length} กลุ่ม`);
