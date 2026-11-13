/*
  ตรวจคุณภาพชุดข้อ TOEIC-style Reading Part 7 (Reading Comprehension)
    single : เอกสาร 1 ฉบับ · 2–4 คำถาม
    double : เอกสาร 2 ฉบับ · 5 คำถาม (ต้องมีข้อเชื่อมข้อมูลข้ามเอกสาร ≥ 1)
    triple : เอกสาร 3 ฉบับ · 5 คำถาม (ข้ามเอกสาร ≥ 2)
  คำถามที่ไม่ใช่ insertion ต้องมี evidence = ข้อความที่ "ยกมาตรงตัว" จากเอกสาร (ไว้ไฮไลต์หลังตอบ)
    node services/toeic/part7Validator.js <file.json>
*/
const { TOPICS, POS } = require('./part5Validator');

const LETTERS = ['A', 'B', 'C', 'D'];
const FORMATS = { single: { docs: 1, q: [2, 4] }, double: { docs: 2, q: [5, 5] }, triple: { docs: 3, q: [5, 5] } };
const DOC_TYPES = ['email', 'memo', 'notice', 'letter', 'advertisement', 'article', 'instructions', 'announcement', 'webpage',
  'review', 'chat', 'form', 'invoice', 'schedule', 'survey'];
const QTYPES = ['mainIdea', 'detail', 'inference', 'vocabulary', 'notTrue', 'insertion', 'intent', 'crossReference'];
const DIFF = ['easy', 'medium', 'hard'];
const THAI = /[฀-๿]/;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase();
const INS = /\[([1-4])\]/g;

function validateSet(p) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!p || typeof p !== 'object') return { status: 'reviewNeeded', errors: ['not an object'] };
  const F = FORMATS[p.format];
  if (!F) e(`format "${p.format}"`);
  if (!DIFF.includes(p.difficulty)) e(`difficulty "${p.difficulty}"`);
  if (!TOPICS.includes(p.topic)) e(`topic "${p.topic}"`);
  const docs = Array.isArray(p.docs) ? p.docs : [];
  if (F && docs.length !== F.docs) e(`ต้องมีเอกสาร ${F.docs} ฉบับ`);
  let total = 0;
  docs.forEach((d, i) => {
    if (!d || !DOC_TYPES.includes(d.docType)) e(`docs[${i}].docType "${d && d.docType}"`);
    if (!d || !d.title || String(d.title).length > 90) e(`docs[${i}].title`);
    const n = words(d && d.text).length; total += n;
    if (n < 35 || n > 360) e(`docs[${i}] ยาว ${n} คำ (35–360)`);
  });
  if (p.format === 'single' && (total < 70 || total > 360)) e(`single ยาวรวม ${total} คำ (70–360)`);
  if (p.format !== 'single' && total > 700) e(`ยาวรวม ${total} คำ (≤ 700)`);
  if (!Array.isArray(p.translationTH) || p.translationTH.length !== docs.length || p.translationTH.some((t) => !THAI.test(t || ''))) e('translationTH ต้องเป็น array ภาษาไทยเท่าจำนวนเอกสาร');
  if (!THAI.test(p.tipTH || '')) e('tipTH');
  const v = p.vocabulary;
  if (!Array.isArray(v) || v.length < 2 || v.length > 6) e('vocabulary 2–6');
  else v.forEach((x, i) => { if (!x || !x.word || !POS.includes(x.pos) || !THAI.test(x.th || '')) e(`vocabulary[${i}]`); });
  const qs = Array.isArray(p.questions) ? p.questions : [];
  if (F && (qs.length < F.q[0] || qs.length > F.q[1])) e(`จำนวนคำถาม ${qs.length} (ต้อง ${F.q.join('–')})`);
  const allText = norm(docs.map((d) => d && d.text).join(' \n '));
  const ins = qs.filter((q) => q && q.type === 'insertion');
  if (ins.length > 1) e('insertion ได้ไม่เกิน 1 ข้อต่อชุด');
  const markedDocs = docs.filter((d) => d && /\[[1-4]\]/.test(d.text || ''));
  if (ins.length) {
    if (markedDocs.length !== 1) e('ข้อ insertion: ต้องมีเอกสาร 1 ฉบับที่มี [1]–[4]');
    else if ([...markedDocs[0].text.matchAll(INS)].map((m) => m[1]).join('') !== '1234') e('[1]–[4] ต้องเรียงและมีครั้งละหนึ่ง');
  } else if (markedDocs.length) e('มี [n] ในเอกสารแต่ไม่มีข้อ insertion');
  const cross = qs.filter((q) => q && q.type === 'crossReference').length;
  if (p.format === 'double' && cross < 1) e('double ต้องมี crossReference ≥ 1');
  if (p.format === 'triple' && cross < 2) e('triple ต้องมี crossReference ≥ 2');
  if (p.format === 'single' && cross) e('single ใช้ crossReference ไม่ได้');
  qs.forEach((q, i) => {
    const t = `Q${i + 1}`;
    if (!q || !QTYPES.includes(q.type)) { e(`${t} type "${q && q.type}"`); return; }
    if (!q.stem || words(q.stem).length < 4) e(`${t} stem`);
    const o = q.options;
    if (!Array.isArray(o) || o.length !== 4) { e(`${t} options 4`); return; }
    if (o.some((x) => typeof x !== 'string' || !x.trim() || x !== x.trim())) e(`${t} option ว่าง`);
    if (new Set(o.map((x) => String(x).toLowerCase())).size !== 4) e(`${t} options ซ้ำ`);
    if (o.some((x) => words(x).length > 26)) e(`${t} option ยาวเกิน 26 คำ`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e(`${t} answer`);
    if (!THAI.test(q.explanationTH || '') || String(q.explanationTH).length < 25) e(`${t} explanationTH`);
    if (!Array.isArray(q.optionNotesTH) || q.optionNotesTH.length !== 4 || q.optionNotesTH.some((x) => !THAI.test(x || '') || String(x).length < 8)) e(`${t} optionNotesTH`);
    if (q.type === 'insertion') {
      if (o.join(',') !== '[1],[2],[3],[4]') e(`${t} insertion options ต้องเป็น [1],[2],[3],[4]`);
      if (!q.sentence || words(q.sentence).length < 5) e(`${t} insertion ต้องมี sentence`);
    } else {
      const ev = [].concat(q.evidence || []);
      if (!ev.length || ev.some((x) => !x || words(x).length < 2 || !allText.includes(norm(x)))) e(`${t} evidence ต้องยกมาตรงตัวจากเอกสาร (${ev.find((x) => !allText.includes(norm(x))) || 'ว่าง'})`);
    }
    if (q.type === 'vocabulary') {
      const m = /["“]([^"”]+)["”]/.exec(q.stem || '');
      if (!m || !allText.includes(norm(m[1]))) e(`${t} vocabulary: stem ต้องอ้างคำในเครื่องหมายคำพูดที่มีในเอกสาร`);
    }
  });
  return { status: errors.length ? 'reviewNeeded' : 'verified', errors };
}

function validateBank(sets) {
  const seen = new Map(); const report = [];
  sets.forEach((p) => {
    const r = validateSet(p);
    const key = norm((p.docs || []).map((d) => `${d.title}:${String(d.text || '').slice(0, 80)}`).join('|'));
    if (seen.has(key)) r.errors.push(`ซ้ำกับ ${seen.get(key)}`);
    seen.set(key, p.id);
    if (r.errors.length) report.push({ id: p.id, errors: r.errors });
  });
  return report;
}

module.exports = { validateSet, validateBank, LETTERS, FORMATS, DOC_TYPES, QTYPES, norm };

if (require.main === module) {
  const data = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  const ps = Array.isArray(data) ? data : data.sets;
  const rep = validateBank(ps);
  const pos = [0, 0, 0, 0]; const qt = {}; const fm = {}; let nq = 0;
  ps.forEach((p) => { fm[p.format] = (fm[p.format] || 0) + 1; (p.questions || []).forEach((q) => { nq += 1; if (pos[q.answer] !== undefined) pos[q.answer] += 1; qt[q.type] = (qt[q.type] || 0) + 1; }); });
  console.log(`${ps.length} sets · ${nq} questions · formats ${JSON.stringify(fm)} · types ${JSON.stringify(qt)} · answers A-D ${pos.join('/')}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  process.exit(rep.length ? 1 : 0);
}
