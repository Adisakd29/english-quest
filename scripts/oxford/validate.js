/*
  ขั้น Validate ของ pipeline: สร้างรายงานตรวจสอบคำศัพท์

    node scripts/oxford/validate.js            # เทียบต้นฉบับกับชุดข้อมูลเดิม (data/words.json)
    node scripts/oxford/validate.js --db        # เทียบต้นฉบับกับฐานข้อมูลใหม่ (vocab_senses) — ใช้หลัง V2

  ผลลัพธ์:
    reports/vocab_validation.md        สถิติต้นฉบับ + รายการที่ต้องตรวจ
    reports/source_reconciliation.md   เทียบต้นฉบับกับเป้าหมาย (หาย/ซ้ำ/เกิน/CEFR/POS ไม่ตรง)

  ออก exit code 1 ถ้าข้อมูลต้นฉบับผิดกติกาพื้นฐาน (ใช้ใน CI ได้)
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'data', 'oxford', 'source_entries.json');
const SENSES = path.join(ROOT, 'data', 'oxford', 'senses.json');
const LEGACY = path.join(ROOT, 'data', 'words.json');
const REPORTS = path.join(ROOT, 'reports');

const { parseLegacyPos } = require('./legacy'); // ใช้ร่วมกับการย้ายข้อมูล (ไม่ซ้ำโค้ด)

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const VALID_POS = new Set([
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner',
  'exclamation', 'number', 'modal verb', 'auxiliary verb', 'indefinite article',
  'definite article', 'infinitive marker',
]);
const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
const table = (head, rows) => [
  `| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');

/* ---------------- กติกาพื้นฐานของต้นฉบับ (ผิด = หยุด) ---------------- */
function integrityErrors(senses) {
  const errors = [];
  const ids = count(senses, (s) => s.senseId);
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => errors.push(`senseId ซ้ำ: ${id}`));
  senses.forEach((s) => {
    if (!s.headword) errors.push(`ไม่มี headword: ${s.sourceRef}`);
    if (!s.sourceRawEntry || !s.sourceRef) errors.push(`ไม่มีข้อมูลอ้างอิงต้นฉบับ: ${s.senseId}`);
    if (s.cefr && !LEVELS.includes(s.cefr)) errors.push(`CEFR ไม่ถูกต้อง: ${s.senseId} = ${s.cefr}`);
    if (s.pos && !VALID_POS.has(s.pos)) errors.push(`ชนิดคำไม่ถูกต้อง: ${s.senseId} = ${s.pos}`);
    // ข้อมูลที่ขาดต้องถูก flag เสมอ — ห้ามมีค่าว่างแบบเงียบ ๆ
    if ((!s.pos || !s.cefr) && !s.needsReview) errors.push(`ข้อมูลขาดแต่ไม่ถูก flag: ${s.senseId}`);
  });
  return errors;
}

/* ---------------- รายงานต้นฉบับ ---------------- */
function validationReport(source, senses) {
  // คำแปลไทยอยู่แยกไฟล์ (ไม่ได้มาจาก Oxford) — อ่านจากข้อมูลจริง ห้ามเขียนตัวเลขตายตัวในรายงาน
  const THAI = path.join(ROOT, 'data', 'oxford', 'thai_meanings.json');
  const thaiMap = fs.existsSync(THAI) ? JSON.parse(fs.readFileSync(THAI, 'utf8')) : {};
  const lines3 = count(source.oxford3000, (e) => e.headingLevel);
  const s3 = senses.filter((s) => s.sourceList === 'OXFORD_3000');
  const s5 = senses.filter((s) => s.sourceList === 'OXFORD_5000_ADDITIONAL');
  const byEntry = groupBy(senses, (s) => s.entryId);
  const entries = Object.entries(byEntry);
  const multiPos = entries.filter(([, v]) => new Set(v.map((s) => s.pos)).size > 1);
  const multiCefr = entries.filter(([, v]) => new Set(v.map((s) => s.cefr)).size > 1);
  const multiLine = entries.filter(([, v]) => new Set(v.map((s) => s.sourceRef)).size > 1);
  const multiSense = entries.filter(([, v]) => new Set(v.map((s) => s.senseLabel).filter(Boolean)).size > 1);
  const review = senses.filter((s) => s.needsReview);
  const caseCollide = Object.entries(groupBy(senses, (s) => s.headword.toLowerCase()))
    .filter(([, v]) => new Set(v.map((s) => s.headword)).size > 1);

  const md = [];
  md.push('# Vocabulary Validation Report', '');
  md.push(`สร้างเมื่อ: ${new Date().toISOString()}  `);
  md.push('ต้นฉบับ: The_Oxford_3000_by_CEFR_level.pdf, The_Oxford_5000.pdf (Oxford University Press)', '');
  md.push('> **บรรทัด** = 1 รายการในเอกสาร · **Sense** = ชนิดคำ × ระดับ (1 บรรทัดอาจมีหลาย sense เช่น `acid n. B2, adj. C1` = 2 sense)', '');

  md.push('## Oxford 3000', '');
  md.push(table(['ระดับ', 'บรรทัดในเอกสาร', 'Senses'], ['A1', 'A2', 'B1', 'B2'].map((l) => [
    l, lines3[l] || 0, s3.filter((s) => s.cefr === l).length,
  ])));
  md.push('', `รวม: ${source.oxford3000.length} บรรทัด · ${s3.length} senses`, '');

  md.push('## Oxford 5000 Additional', '');
  md.push(table(['ระดับ', 'Senses'], ['B1', 'B2', 'C1'].map((l) => [l, s5.filter((s) => s.cefr === l).length])));
  md.push('', `รวม: ${source.oxford5000.length} บรรทัด · ${s5.length} senses`);
  md.push('', '_B1 = 1 รายการ (`specialize v. B1`) ต้นฉบับพิมพ์ B1 จริง (ตรวจจากภาพแล้ว) คงตามต้นฉบับ + needsReview_', '');

  md.push('## สรุป', '');
  md.push(table(['รายการ', 'จำนวน'], [
    ['Total Headwords (แยกตัวพิมพ์ + เลขคำพ้องรูป)', entries.length],
    ['Total Lexical Senses', senses.length],
    ['Headwords ที่ปรากฏหลายบรรทัด', multiLine.length],
    ['Multiple-POS Words', multiPos.length],
    ['Multiple-CEFR Words', multiCefr.length],
    ['Words ที่มีคำใบ้หลายความหมาย', multiSense.length],
    ['คำพ้องรูปที่มีเลขกำกับ', new Set(senses.filter((s) => s.homograph).map((s) => s.entryId)).size],
    ['needsReview', review.length],
    ['Missing Thai Meaning', senses.filter((s) => !thaiMap[s.senseId]).length],
    ['Thai Meaning ที่ flag ให้ตรวจ', senses.filter((s) => thaiMap[s.senseId] && thaiMap[s.senseId].flagged).length],
    ['Missing POS', senses.filter((s) => !s.pos).length],
    ['Missing CEFR', senses.filter((s) => !s.cefr).length],
  ]));

  md.push('', '## needsReview (ทั้งหมด)', '');
  md.push(table(['ต้นฉบับ', 'อ้างอิง', 'ชนิดคำที่ได้', 'เหตุผล'], review.map((s) => [
    `\`${s.sourceRawEntry}\``, s.sourceRef, s.pos || '—', s.reviewReasons.join('; '),
  ])));

  md.push('', '## ตัวอย่างคำที่ระดับต่างกันตามชนิดคำ / ความหมาย', '');
  const showcase = ['bank', 'rock', 'worst', 'acid', 'light', 'like', 'spare', 'close#1', 'close#2'];
  md.push(table(['Headword', 'Senses (ชนิดคำ ระดับ คำใบ้ รายการ)'], showcase.filter((k) => byEntry[k]).map((k) => [
    k, byEntry[k].map((s) => `${s.pos} ${s.cefr}${s.senseLabel ? ` (${s.senseLabel})` : ''} [${s.sourceList === 'OXFORD_3000' ? '3000' : '5000'}]`).join(' · '),
  ])));

  md.push('', '## คำที่สะกดเหมือนกันแต่ต่างตัวพิมพ์ (ถือเป็นคนละคำ)', '');
  md.push(caseCollide.map(([, v]) => [...new Set(v.map((s) => `\`${s.headword}\``))].join(' ≠ ')).join('  \n') || '—');

  md.push('', '## รายการที่ขึ้นบรรทัดใหม่ในเอกสาร (ต่อบรรทัดแล้ว)', '');
  md.push([...source.oxford3000, ...source.oxford5000].filter((e) => e.wrapped).map((e) => `- \`${e.raw}\` (${e.sourceList} p${e.page})`).join('\n') || '—');
  return md.join('\n');
}

/* ---------------- เทียบต้นฉบับกับชุดข้อมูลเป้าหมาย ---------------- */
function legacyTarget() {
  const levels = JSON.parse(fs.readFileSync(LEGACY, 'utf8')).levels;
  const rows = [];
  for (const lvl of LEVELS) {
    for (const w of levels[lvl] || []) {
      const m = String(w.word).replace(/,$/, '').match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const headword = m ? m[1] : String(w.word).replace(/,$/, '');
      const label = m ? m[2] : null;
      const { pos, junk } = parseLegacyPos(w.pos);
      (pos.length ? pos : [null]).forEach((p) => rows.push({
        targetId: w.id, headword, senseLabel: label, pos: p, cefr: lvl, raw: `${w.word} ${w.pos}`, junk,
      }));
    }
  }
  return rows;
}

function reconciliationReport(senses, target, targetName) {
  // ถ้าเป้าหมายมี entryId (ฐานใหม่ มีเลขคำพ้องรูป) เทียบด้วย entryId
  // ถ้าไม่มี (ชุดเดิม ทิ้งเลขคำพ้องรูป) เทียบด้วยตัวคำ — เก็บระดับเป็นชุด
  const useEntry = target.length > 0 && target.every((x) => x.entryId);
  const who = (x) => (useEntry ? x.entryId : x.headword);
  const key = (x) => `${who(x)}␟${x.senseLabel || ''}␟${x.pos || ''}`;
  const src = groupBy(senses, key);
  const tgt = groupBy(target, key);
  const srcKeys = Object.keys(src);
  const tgtKeys = Object.keys(tgt);
  const levelsOf = (arr) => [...new Set(arr.map((x) => x.cefr))].sort().join('/');

  const missing = srcKeys.filter((k) => !tgt[k]);
  const extra = tgtKeys.filter((k) => !src[k]);
  const cefrMismatch = srcKeys.filter((k) => tgt[k] && levelsOf(src[k]) !== levelsOf(tgt[k]));
  // ซ้ำในเป้าหมาย: (รหัสเดิมต่างกัน แต่ ตัวคำ+คำใบ้+ชนิดคำ+ระดับ เหมือนกันทุกอย่าง) = แยกไม่ออก
  const tgtDup = Object.entries(groupBy(target, (x) => `${key(x)}␟${x.cefr}`))
    .filter(([, v]) => new Set(v.map((x) => x.targetId)).size > 1);
  // POS ไม่ตรง: ตัวคำ+ระดับตรงกัน แต่ชุดชนิดคำต่างกัน
  const posOf = (arr) => [...new Set(arr.map((x) => x.pos || '—'))].sort().join(', ');
  const byWordLvlSrc = groupBy(senses, (x) => `${who(x)}␟${x.senseLabel || ''}␟${x.cefr}`);
  const byWordLvlTgt = groupBy(target, (x) => `${who(x)}␟${x.senseLabel || ''}␟${x.cefr}`);
  const posMismatch = Object.keys(byWordLvlSrc)
    .filter((k) => byWordLvlTgt[k] && posOf(byWordLvlSrc[k]) !== posOf(byWordLvlTgt[k]));
  const srcDupLines = Object.entries(groupBy(senses, (s) => `${s.entryId}␟${s.senseLabel || ''}␟${s.pos}␟${s.cefr}`))
    .filter(([, v]) => v.length > 1);

  const label = (k) => { const [h, l, p] = k.split('␟'); return `${h}${l ? ` (${l})` : ''} ${p || '—'}`; };
  const md = [];
  md.push('# Source Reconciliation Report', '');
  md.push(`สร้างเมื่อ: ${new Date().toISOString()}  `);
  md.push(`เทียบ: **ต้นฉบับ Oxford (${senses.length} senses)** กับ **${targetName} (${target.length} senses)**`, '');
  md.push(useEntry
    ? '> เทียบด้วย entryId (รวมเลขคำพ้องรูป) + คำใบ้ + ชนิดคำ'
    : '> ชุดข้อมูลเดิมไม่มีเลขคำพ้องรูป (close¹/close²) จึงเทียบด้วย ตัวคำ + คำใบ้ + ชนิดคำ', '');
  md.push(table(['ตรวจ', 'จำนวน'], [
    ['Source entry ที่หายจากเป้าหมาย', missing.length],
    ['Source entry ซ้ำในต้นฉบับ', srcDupLines.length],
    ['เป้าหมายมีคำที่ไม่อยู่ใน Oxford source', extra.length],
    ['เป้าหมายมีรายการซ้ำที่แยกไม่ออก', tgtDup.length],
    ['CEFR ไม่ตรง', cefrMismatch.length],
    ['POS ไม่ตรง (ตัวคำ+ระดับเดียวกัน)', posMismatch.length],
    ['ช่องชนิดคำมีข้อความแปลกปลอม (OCR)', new Set(target.filter((x) => x.junk && x.junk.length).map((x) => x.targetId)).size],
  ]));
  const section = (title, rows, head) => {
    md.push('', `## ${title}`, '');
    md.push(rows.length ? table(head, rows) : '_ไม่มี_');
  };
  section('Source entry ที่หายจากเป้าหมาย', missing.map((k) => [label(k), levelsOf(src[k]), `\`${src[k][0].sourceRawEntry}\``]), ['Sense', 'ระดับ', 'ต้นฉบับ']);
  section('เป้าหมายมีคำที่ไม่อยู่ใน Oxford source', extra.map((k) => [label(k), levelsOf(tgt[k]), tgt[k].map((x) => x.targetId).join(', ')]), ['Sense', 'ระดับ', 'รหัสเดิม']);
  section('CEFR ไม่ตรง', cefrMismatch.map((k) => [label(k), levelsOf(tgt[k]), `**${levelsOf(src[k])}**`, `\`${src[k][0].sourceRawEntry}\``]), ['Sense', 'เป้าหมาย', 'ต้นฉบับ', 'บรรทัดต้นฉบับ']);
  section('POS ไม่ตรง', posMismatch.map((k) => [k.split('␟')[0], k.split('␟')[2], posOf(byWordLvlTgt[k]), `**${posOf(byWordLvlSrc[k])}**`]), ['ตัวคำ', 'ระดับ', 'เป้าหมาย', 'ต้นฉบับ']);
  const junkRows = Object.values(groupBy(target.filter((x) => x.junk && x.junk.length), (x) => x.targetId)).map((v) => v[0]);
  section('ข้อความแปลกปลอมในช่องชนิดคำของเป้าหมาย (คาดว่ามาจาก OCR)', junkRows.map((x) => [x.targetId, `\`${x.raw}\``, x.junk.map((j) => `\`${j}\``).join(' ')]), ['รหัสเดิม', 'ค่าเดิม', 'ส่วนที่ไม่ใช่ชนิดคำ']);
  section('เป้าหมายมีรายการซ้ำที่แยกไม่ออก', tgtDup.map(([k, v]) => [label(k), v.map((x) => x.targetId).join(', ')]), ['Sense', 'รหัสเดิม']);
  return { md: md.join('\n'), stats: { missing, extra, cefrMismatch, posMismatch, tgtDup } };
}

/* ---------------- QA Report หลัง import (อ่านจากฐานข้อมูลจริง) ---------------- */
async function importQaReport(pool) {
  const q = async (sql) => (await pool.query(sql)).rows;
  const byLevel = await q(`SELECT source_list, cefr, COUNT(*)::int AS n FROM vocab_senses
                           GROUP BY 1, 2 ORDER BY 1, 2`);
  const [tot] = await q(`SELECT (SELECT COUNT(*) FROM vocab_entries)::int AS entries,
                                COUNT(*)::int AS senses,
                                COUNT(*) FILTER (WHERE source_needs_review)::int AS flagged,
                                COUNT(*) FILTER (WHERE pos IS NULL)::int AS no_pos,
                                COUNT(*) FILTER (WHERE is_supplemental)::int AS supplemental,
                                COUNT(*) FILTER (WHERE source_raw_entry IS NULL OR source_ref IS NULL)::int AS no_ref
                           FROM vocab_senses`);
  const tr = await q(`SELECT translation_status, COUNT(*)::int AS n FROM vocab_senses GROUP BY 1 ORDER BY 1`);
  const multi = await q(`SELECT
      (SELECT COUNT(*) FROM (SELECT entry_id FROM vocab_senses GROUP BY entry_id HAVING COUNT(DISTINCT pos) > 1) a)::int AS multi_pos,
      (SELECT COUNT(*) FROM (SELECT entry_id FROM vocab_senses GROUP BY entry_id HAVING COUNT(DISTINCT cefr) > 1) b)::int AS multi_cefr,
      (SELECT COUNT(*) FROM vocab_entries WHERE homograph_no IS NOT NULL)::int AS homographs`);
  const md = ['# Vocabulary Import QA Report', '', `สร้างเมื่อ: ${new Date().toISOString()}  `,
    'แหล่ง: ตาราง vocab_entries / vocab_senses (อ่านจากฐานข้อมูลจริง)', ''];
  md.push('## จำนวนในฐานข้อมูล', '');
  md.push(table(['รายการ', 'ระดับ', 'Senses'], byLevel.map((r) => [r.source_list, r.cefr, r.n])));
  md.push('', table(['ตรวจ', 'จำนวน'], [
    ['Headwords', tot.entries], ['Lexical senses', tot.senses],
    ['Multiple-POS words', multi[0].multi_pos], ['Multiple-CEFR words', multi[0].multi_cefr],
    ['คำพ้องรูปที่มีเลขกำกับ', multi[0].homographs],
    ['source_needs_review', tot.flagged], ['ไม่มีชนิดคำ (ต้องถูก flag ทั้งหมด)', tot.no_pos],
    ['ไม่มีข้อมูลอ้างอิงต้นฉบับ', tot.no_ref],
    ['Supplemental (ไม่ใช่ Oxford)', `${tot.supplemental} — ชุดเดิมไม่มีคำนอก Oxford (ดู source_reconciliation.md)`],
  ]));
  md.push('', '## สถานะคำแปลไทย', '');
  md.push(table(['translation_status', 'จำนวน'], tr.map((r) => [r.translation_status, r.n])));
  const [src] = await q(`SELECT count(*) FILTER (WHERE translation_source ILIKE '%oxford%')::int AS oxford,
                                count(translation_note)::int AS flagged FROM vocab_senses`);
  md.push('', `คำแปลที่ flag ให้ตรวจ: ${src.flagged}  `);
  md.push(`คำแปลที่ระบุว่ามาจาก Oxford: ${src.oxford} (ต้องเป็น 0 — Oxford ไม่ได้ให้คำแปลไทย)`);
  return md.join('\n');
}

/* ---------------- main ---------------- */
async function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const senses = JSON.parse(fs.readFileSync(SENSES, 'utf8'));

  const errors = integrityErrors(senses);
  if (errors.length) {
    console.error('❌ ต้นฉบับผิดกติกาพื้นฐาน:\n  ' + errors.slice(0, 30).join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'vocab_validation.md'), validationReport(source, senses));

  let target;
  let targetName;
  if (process.argv.includes('--db')) {
    require('dotenv').config();
    const pool = require('../../config/db');
    const { rows } = await pool.query(
      'SELECT s.id AS "targetId", e.id AS "entryId", e.headword, s.sense_label AS "senseLabel", s.pos, s.cefr FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id WHERE NOT s.is_supplemental'
    );
    target = rows;
    targetName = 'ฐานข้อมูลใหม่ (vocab_senses)';
    fs.writeFileSync(path.join(REPORTS, 'vocab_import_qa.md'), await importQaReport(pool));
    await pool.end();
  } else {
    target = legacyTarget();
    targetName = 'ชุดข้อมูลเดิม (data/words.json)';
  }
  const rec = reconciliationReport(senses, target, targetName);
  // แยกไฟล์: เทียบกับชุดเดิม / เทียบกับฐานใหม่ — ไม่ทับกัน
  const outName = process.argv.includes('--db') ? 'source_reconciliation_db.md' : 'source_reconciliation.md';
  fs.writeFileSync(path.join(REPORTS, outName), rec.md);

  console.log(`✓ กติกาพื้นฐานผ่าน (${senses.length} senses)`);
  console.log(`เทียบกับ ${targetName}: หาย ${rec.stats.missing.length} · เกิน ${rec.stats.extra.length} · CEFR ไม่ตรง ${rec.stats.cefrMismatch.length} · POS ไม่ตรง ${rec.stats.posMismatch.length} · ซ้ำแยกไม่ออก ${rec.stats.tgtDup.length}`);
  console.log(`รายงาน: reports/vocab_validation.md, reports/${outName}${process.argv.includes('--db') ? ', reports/vocab_import_qa.md' : ''}`);
  // ใช้ใน CI: เทียบกับฐานใหม่ต้องไม่มีความต่างเลย
  if (process.argv.includes('--db')) {
    const bad = rec.stats.missing.length + rec.stats.extra.length + rec.stats.cefrMismatch.length
      + rec.stats.posMismatch.length + rec.stats.tgtDup.length;
    if (bad > 0) { console.error(`❌ ฐานข้อมูลไม่ตรงกับต้นฉบับ ${bad} รายการ`); process.exitCode = 1; }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
