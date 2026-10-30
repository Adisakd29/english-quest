/*
  ตรวจคุณภาพชุดข้อ TOEIC-style Reading Part 6 (Text Completion) — 1 บทความ = 4 ช่องว่าง [[1]]–[[4]]
    node services/toeic/part6Validator.js <file.json>
  ไม่ผ่าน = reviewNeeded (ไม่เข้าชุดฝึก)
*/
const { SKILLS: P5_SKILLS, TOPICS, POS } = require('./part5Validator');

const LETTERS = ['A', 'B', 'C', 'D'];
const SKILLS = [...P5_SKILLS, 'context', 'sentenceInsertion'];
const DOC_TYPES = ['email', 'memo', 'notice', 'letter', 'advertisement', 'article', 'instructions', 'announcement', 'webpage', 'review'];
const DIFF = ['easy', 'medium', 'hard'];
const THAI = /[฀-๿]/;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const MARK = /\[\[(\d)\]\]/g;

function validatePassage(p) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!p || typeof p !== 'object') return { status: 'reviewNeeded', errors: ['not an object'] };
  if (!DOC_TYPES.includes(p.docType)) e(`docType "${p.docType}"`);
  if (!DIFF.includes(p.difficulty)) e(`difficulty "${p.difficulty}"`);
  if (!TOPICS.includes(p.topic)) e(`topic "${p.topic}"`);
  if (!p.title || String(p.title).length > 80) e('title');
  const text = String(p.text || '');
  const marks = [...text.matchAll(MARK)].map((m) => Number(m[1]));
  if (marks.join(',') !== '1,2,3,4') e(`ต้องมี [[1]]–[[4]] เรียงครั้งละหนึ่ง (พบ ${marks.join(',') || 'ไม่มี'})`);
  if (/-{5,}/.test(text)) e('ใช้ [[n]] แทน -------');
  const n = words(text.replace(MARK, 'x')).length;
  if (n < 70 || n > 230) e(`บทความยาว ${n} คำ (ต้อง 70–230)`);
  if (!THAI.test(p.translationTH || '')) e('translationTH');
  if (!THAI.test(p.tipTH || '')) e('tipTH');
  const v = p.vocabulary;
  if (!Array.isArray(v) || v.length < 1 || v.length > 5) e('vocabulary 1–5');
  else v.forEach((x, i) => { if (!x || !x.word || !POS.includes(x.pos) || !THAI.test(x.th || '')) e(`vocabulary[${i}]`); });
  const qs = p.questions;
  if (!Array.isArray(qs) || qs.length !== 4) { e('questions ต้องมี 4 ข้อ'); return { status: 'reviewNeeded', errors }; }
  const sentenceQs = qs.filter((q) => q && q.kind === 'sentence').length;
  if (sentenceQs !== 1) e(`ต้องมีข้อเติมประโยค (kind=sentence) 1 ข้อพอดี (พบ ${sentenceQs})`);
  qs.forEach((q, i) => {
    const t = `Q${i + 1}`;
    if (!q || !['word', 'sentence'].includes(q.kind)) { e(`${t} kind`); return; }
    if (!SKILLS.includes(q.skill)) e(`${t} skill "${q.skill}"`);
    if (q.kind === 'sentence' && q.skill !== 'sentenceInsertion') e(`${t} ข้อเติมประโยคต้องใช้ skill sentenceInsertion`);
    const o = q.options;
    if (!Array.isArray(o) || o.length !== 4) { e(`${t} options ต้องมี 4`); return; }
    if (o.some((x) => typeof x !== 'string' || !x.trim() || x !== x.trim())) e(`${t} option ว่าง/มีช่องว่างหัวท้าย`);
    if (new Set(o.map((x) => String(x).toLowerCase())).size !== 4) e(`${t} options ซ้ำ`);
    if (q.kind === 'word' && o.some((x) => words(x).length > 5)) e(`${t} option คำ/วลียาวเกิน 5 คำ`);
    if (q.kind === 'sentence' && o.some((x) => words(x).length < 4 || words(x).length > 32 || !/[.?!]["”']?$/.test(x))) e(`${t} option ประโยคต้องยาว 4–32 คำและจบด้วยเครื่องหมายวรรคตอน`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e(`${t} answer 0–3`);
    if (!THAI.test(q.explanationTH || '') || String(q.explanationTH).length < 25) e(`${t} explanationTH`);
    if (!Array.isArray(q.optionNotesTH) || q.optionNotesTH.length !== 4 || q.optionNotesTH.some((x) => !THAI.test(x || '') || String(x).length < 8)) e(`${t} optionNotesTH 4 ข้อ`);
  });
  return { status: errors.length ? 'reviewNeeded' : 'verified', errors };
}

function validateBank(passages) {
  const seen = new Map(); const report = [];
  passages.forEach((p) => {
    const r = validatePassage(p);
    const key = String(p.title || '').toLowerCase() + String(p.text || '').slice(0, 60).toLowerCase();
    if (seen.has(key)) r.errors.push(`ซ้ำกับ ${seen.get(key)}`);
    seen.set(key, p.id);
    if (r.errors.length) report.push({ id: p.id, errors: r.errors });
  });
  return report;
}

module.exports = { validatePassage, validateBank, LETTERS, SKILLS, DOC_TYPES, MARK };

if (require.main === module) {
  const data = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  const ps = Array.isArray(data) ? data : data.passages;
  const rep = validateBank(ps);
  const pos = [0, 0, 0, 0]; const sk = {}; const dt = {};
  ps.forEach((p) => { dt[p.docType] = (dt[p.docType] || 0) + 1; (p.questions || []).forEach((q) => { if (pos[q.answer] !== undefined) pos[q.answer] += 1; sk[q.skill] = (sk[q.skill] || 0) + 1; }); });
  console.log(`${ps.length} passages · docTypes ${JSON.stringify(dt)} · skills ${JSON.stringify(sk)} · answers A-D ${pos.join('/')}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  process.exit(rep.length ? 1 : 0);
}
