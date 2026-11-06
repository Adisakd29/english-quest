/*
  ตรวจคุณภาพข้อ TOEIC-style Reading Part 5 (Incomplete Sentences) — ใช้ตอนนำเข้าคลัง (bank.js) และตอนเขียนข้อ (CLI)
    node services/toeic/part5Validator.js <file.json>   → รายงานข้อที่ไม่ผ่าน
  ข้อที่ไม่ผ่าน = สถานะ reviewNeeded (ไม่เข้าชุดฝึก)
*/
const BLANK = '-------';
const LETTERS = ['A', 'B', 'C', 'D'];
const SKILLS = ['wordForm', 'verbTense', 'verbVoice', 'agreement', 'verbForm', 'pronoun', 'determiner', 'comparison',
  'preposition', 'conjunction', 'transition', 'relative', 'vocabulary', 'collocation'];
const TOPICS = ['office', 'hr', 'marketing', 'finance', 'sales', 'travel', 'manufacturing', 'events', 'customerService',
  'technology', 'realEstate', 'health', 'dining', 'logistics'];
const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'phrase', 'pronoun'];
const DIFF = ['easy', 'medium', 'hard'];
const THAI = /[฀-๿]/;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

function validateQuestion(q) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!q || typeof q !== 'object') return { status: 'reviewNeeded', errors: ['not an object'] };
  if (!SKILLS.includes(q.skill)) e(`skill "${q.skill}"`);
  if (!DIFF.includes(q.difficulty)) e(`difficulty "${q.difficulty}"`);
  if (!TOPICS.includes(q.topic)) e(`topic "${q.topic}"`);
  const s = String(q.sentence || '');
  if (s.split(BLANK).length !== 2) e('sentence ต้องมีช่องว่าง ------- 1 ช่องพอดี');
  if (/-{8,}/.test(s)) e('ช่องว่างยาวเกิน 7 ขีด');
  const n = words(s).length;
  if (n < 8 || n > 42) e(`sentence ยาว ${n} คำ (ต้อง 8–42)`);
  if (!/[.?!]["”']?$/.test(s.trim())) e('sentence ต้องจบด้วยเครื่องหมายวรรคตอน');
  if (/\s{2,}/.test(s)) e('มีช่องว่างซ้อน');
  const o = q.options;
  if (!Array.isArray(o) || o.length !== 4) e('options ต้องมี 4 ตัว');
  else {
    if (o.some((x) => typeof x !== 'string' || !x.trim() || x !== x.trim())) e('option ว่าง/มีช่องว่างหัวท้าย');
    if (new Set(o.map((x) => String(x).toLowerCase())).size !== 4) e('options ซ้ำกัน');
    if (o.some((x) => words(x).length > 4)) e('option ยาวเกิน 4 คำ');
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e('answer ต้องเป็น 0–3');
  if (!THAI.test(q.translationTH || '')) e('translationTH ต้องเป็นภาษาไทย');
  if (!THAI.test(q.explanationTH || '') || String(q.explanationTH).length < 25) e('explanationTH สั้น/ไม่ใช่ภาษาไทย');
  if (!Array.isArray(q.optionNotesTH) || q.optionNotesTH.length !== 4 || q.optionNotesTH.some((x) => !THAI.test(x || '') || String(x).length < 8)) e('optionNotesTH ต้องมี 4 ข้อ (ภาษาไทย)');
  if (!THAI.test(q.tipTH || '')) e('tipTH');
  const v = q.vocabulary;
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) e('vocabulary 1–4 คำ');
  else v.forEach((x, i) => {
    if (!x || !x.word || !POS.includes(x.pos) || !THAI.test(x.th || '')) e(`vocabulary[${i}]`);
  });
  if (!/^P5-\d{4}$/.test(String(q.id || '')) && q.id !== undefined && !/^[A-Z0-9]+-\d+$/.test(String(q.id))) e(`id "${q.id}"`);
  return { status: errors.length ? 'reviewNeeded' : 'verified', errors };
}

/** ตรวจทั้งคลัง (รวมประโยคซ้ำ) */
function validateBank(questions) {
  const seen = new Map(); const report = [];
  questions.forEach((q) => {
    const r = validateQuestion(q);
    const key = String(q.sentence || '').toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) r.errors.push(`ประโยคซ้ำกับ ${seen.get(key)}`);
    seen.set(key, q.id);
    if (r.errors.length) report.push({ id: q.id, errors: r.errors });
  });
  return report;
}

module.exports = { validateQuestion, validateBank, BLANK, LETTERS, SKILLS, TOPICS, POS };

if (require.main === module) {
  const file = process.argv[2];
  const data = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  const qs = Array.isArray(data) ? data : data.questions;
  const rep = validateBank(qs);
  const by = {}; qs.forEach((q) => { by[q.skill] = (by[q.skill] || 0) + 1; });
  const ans = [0, 0, 0, 0]; qs.forEach((q) => { if (ans[q.answer] !== undefined) ans[q.answer] += 1; });
  console.log(`${qs.length} questions · skills ${JSON.stringify(by)} · answer positions A-D ${ans.join('/')}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  process.exit(rep.length ? 1 : 0);
}
