/*
  รวบรวมคำแปลไทยจาก data/oxford/thai/*.txt -> data/oxford/thai_meanings.json
  พร้อมตรวจความถูกต้องก่อนนำเข้า

    node scripts/oxford/build_thai.js            # ตรวจ + สร้างไฟล์
    node scripts/oxford/build_thai.js --level A1 # รายงานความครบเฉพาะระดับ

  รูปแบบแต่ละบรรทัด (คั่นด้วย |):
    entryId|ชนิดคำย่อ|คำแปล
    entryId|ชนิดคำย่อ|คำใบ้|คำแปล               (เมื่อต้นฉบับมีคำใบ้ เช่น bank|n|money|ธนาคาร)
    ...|!หมายเหตุ                              (ช่องสุดท้ายขึ้นต้น ! = ไม่มั่นใจ ต้องให้คนตรวจ)
  บรรทัดว่าง / ขึ้นต้นด้วย # = ข้าม

  คำแปลทั้งหมดเป็น AI_GENERATED — ไม่ได้มาจาก Oxford และยังไม่ผ่านการตรวจโดยคน
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'data', 'oxford', 'thai');
const OUT = path.join(ROOT, 'data', 'oxford', 'thai_meanings.json');
const senses = require(path.join(ROOT, 'data', 'oxford', 'senses.json'));

const ABBR = {
  n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun', prep: 'preposition',
  conj: 'conjunction', det: 'determiner', excl: 'exclamation', num: 'number', modal: 'modal verb',
  aux: 'auxiliary verb', iart: 'indefinite article', dart: 'definite article', inf: 'infinitive marker',
  unknown: null,
};

const THAI_RE = /[\u0E00-\u0E7F]/;
// อนุญาตตัวอักษรอังกฤษเฉพาะในวงเล็บ (เช่นคำอธิบายไวยากรณ์ "(กริยาช่วย be)")
const LATIN_OUTSIDE_PARENS = (t) => /[A-Za-z]/.test(t.replace(/\([^)]*\)/g, ''));

function parseFile(file) {
  const rows = [];
  const errors = [];
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const parts = s.split('|').map((x) => x.trim());
    let note = null;
    if (parts.length && parts[parts.length - 1].startsWith('!')) note = parts.pop().slice(1).trim();
    let entryId; let abbr; let label = null; let thai;
    if (parts.length === 3) [entryId, abbr, thai] = parts;
    else if (parts.length === 4) [entryId, abbr, label, thai] = parts;
    else { errors.push(`${path.basename(file)}:${i + 1} รูปแบบผิด: ${s}`); return; }
    if (!(abbr in ABBR)) { errors.push(`${path.basename(file)}:${i + 1} ชนิดคำย่อไม่รู้จัก "${abbr}"`); return; }
    const pos = ABBR[abbr];
    const senseId = `${entryId}|${pos || 'unknown'}|${label ? label.replace(/\s+/g, '_') : '-'}`;
    rows.push({ senseId, thai, note, where: `${path.basename(file)}:${i + 1}` });
  });
  return { rows, errors };
}

function main() {
  const byId = new Map(senses.map((s) => [s.senseId, s]));
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort() : [];
  const out = {};
  const errors = [];
  const seen = new Map();

  for (const f of files) {
    const { rows, errors: e } = parseFile(path.join(DIR, f));
    errors.push(...e);
    for (const r of rows) {
      if (!byId.has(r.senseId)) { errors.push(`${r.where} ไม่มี sense นี้ในต้นฉบับ: ${r.senseId}`); continue; }
      if (seen.has(r.senseId)) { errors.push(`${r.where} ซ้ำกับ ${seen.get(r.senseId)}: ${r.senseId}`); continue; }
      if (!THAI_RE.test(r.thai)) { errors.push(`${r.where} คำแปลไม่มีภาษาไทย: ${r.thai}`); continue; }
      if (LATIN_OUTSIDE_PARENS(r.thai)) { errors.push(`${r.where} มีตัวอักษรอังกฤษนอกวงเล็บ: ${r.thai}`); continue; }
      if (r.thai.length > 60) { errors.push(`${r.where} คำแปลยาวเกิน 60 ตัวอักษร: ${r.thai}`); continue; }
      seen.set(r.senseId, r.where);
      out[r.senseId] = { thai: r.thai, flagged: Boolean(r.note), note: r.note };
    }
  }

  const lvlArg = process.argv.indexOf('--level');
  const levels = lvlArg > -1 ? [process.argv[lvlArg + 1]] : ['A1', 'A2', 'B1', 'B2', 'C1'];
  console.log(`ไฟล์: ${files.join(', ') || '(ไม่มี)'}`);
  for (const lvl of levels) {
    const all = senses.filter((s) => s.cefr === lvl);
    const done = all.filter((s) => out[s.senseId]);
    const flagged = done.filter((s) => out[s.senseId].flagged);
    console.log(`${lvl}: แปลแล้ว ${done.length}/${all.length} · flag ${flagged.length}`);
    if (lvlArg > -1) {
      const missing = all.filter((s) => !out[s.senseId]).map((s) => s.senseId);
      if (missing.length) console.log(`  ยังไม่แปล (${missing.length}): ${missing.slice(0, 40).join('  ')}`);
    }
  }
  if (errors.length) {
    console.error(`❌ ข้อผิดพลาด ${errors.length} รายการ:\n  ${errors.slice(0, 40).join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`✓ บันทึก ${Object.keys(out).length} คำแปล -> data/oxford/thai_meanings.json`);
}

main();
