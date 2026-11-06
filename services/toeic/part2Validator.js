/*
  ตรวจคุณภาพข้อ TOEIC-style Listening Part 2 (Question–Response) — คำถาม/ข้อความ 1 ประโยค + คำตอบ 3 ตัว (A–C) ถูก 1
    node services/toeic/part2Validator.js <file.json>
  ตรวจไฟล์เสียงด้วยเมื่อ checkFiles (หลัง build): ทุก variant ต้องมีไฟล์ + segments ครบ 3 ตัว
*/
const fs = require('fs');
const path = require('path');
const { TOPICS, POS } = require('./part5Validator');

const LETTERS = ['A', 'B', 'C'];
const CATEGORIES = ['wh', 'yesNo', 'choice', 'tag', 'negative', 'statement', 'request'];
const WH = ['who', 'what', 'when', 'where', 'why', 'how', 'which', 'whose'];
const DISTRACTORS = ['similarSound', 'repeatedWord', 'wrongWh', 'yesNoToWh', 'wrongTense', 'wrongPerson', 'relatedWordTrap', 'offTopic', 'illogical'];
const DIFF = ['easy', 'medium', 'hard'];
const THAI = /[฀-๿]/;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

function validateQuestion(q, { publicDir = null, checkFiles = false } = {}) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!q || typeof q !== 'object') return { status: 'reviewNeeded', errors: ['not an object'] };
  if (!CATEGORIES.includes(q.category)) e(`category "${q.category}"`);
  if (q.category === 'wh' && !WH.includes(String(q.whWord || '').toLowerCase())) e(`whWord "${q.whWord}"`);
  if (!DIFF.includes(q.difficulty)) e(`difficulty "${q.difficulty}"`);
  if (!TOPICS.includes(q.topic)) e(`topic "${q.topic}"`);
  const n = words(q.prompt).length;
  if (n < 3 || n > 22) e(`prompt ยาว ${n} คำ (3–22)`);
  if (!/[.?!]$/.test(String(q.prompt || '').trim())) e('prompt ต้องจบด้วย . ? !');
  if (!THAI.test(q.promptTH || '')) e('promptTH');
  const r = q.responses;
  if (!Array.isArray(r) || r.length !== 3) { e('responses ต้องมี 3'); return { status: 'reviewNeeded', errors }; }
  if (r.filter((x) => x && x.isCorrect === true).length !== 1) e('ต้องมีคำตอบถูก 1 ตัวพอดี');
  if (new Set(r.map((x) => String(x && x.text).toLowerCase())).size !== 3) e('responses ซ้ำ');
  r.forEach((x, i) => {
    const t = `R${i + 1}`;
    if (!x || !x.text) { e(`${t} text`); return; }
    const m = words(x.text).length;
    if (m < 1 || m > 18) e(`${t} ยาว ${m} คำ`);
    if (!/[.?!]$/.test(x.text.trim())) e(`${t} ต้องจบด้วยเครื่องหมายวรรคตอน`);
    if (!THAI.test(x.translationTH || '')) e(`${t} translationTH`);
    if (!THAI.test(x.explanationTH || '') || String(x.explanationTH).length < 10) e(`${t} explanationTH`);
    if (!x.isCorrect && !DISTRACTORS.includes(x.distractorType)) e(`${t} distractorType "${x.distractorType}"`);
  });
  if (!THAI.test(q.explanationTH || '') || String(q.explanationTH).length < 25) e('explanationTH');
  if (!THAI.test(q.tipTH || '')) e('tipTH');
  const v = q.vocabulary;
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) e('vocabulary 1–4');
  else v.forEach((x, i) => { if (!x || !x.word || !POS.includes(x.pos) || !THAI.test(x.th || '')) e(`vocabulary[${i}]`); });
  if (checkFiles) {
    const vs = Array.isArray(q.variants) ? q.variants : [];
    if (!vs.length) e('ยังไม่มี variants/เสียง');
    vs.forEach((vv) => {
      if (!vv.audio || !vv.audio.url) { e(`variant ${vv.v} ไม่มีเสียง`); return; }
      if (!Array.isArray(vv.order) || vv.order.slice().sort().join('') !== '012') e(`variant ${vv.v} order`);
      if (!vv.audio.segments || vv.audio.segments.map((sg) => sg.letter).join('') !== 'QABC') e(`variant ${vv.v} segments ต้องเป็น Q,A,B,C`);
      if (publicDir && !fs.existsSync(path.join(publicDir, vv.audio.url))) e(`ไม่พบไฟล์ ${vv.audio.url}`);
    });
  }
  return { status: errors.length ? 'reviewNeeded' : 'verified', errors };
}

function validateBank(qs, opts) {
  const seen = new Map(); const report = [];
  qs.forEach((q) => {
    const r = validateQuestion(q, opts);
    const key = String(q.prompt || '').toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) r.errors.push(`ซ้ำกับ ${seen.get(key)}`);
    seen.set(key, q.id);
    if (r.errors.length) report.push({ id: q.id, errors: r.errors });
  });
  return report;
}

module.exports = { validateQuestion, validateBank, LETTERS, CATEGORIES, DISTRACTORS };

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const qs = Array.isArray(data) ? data : data.questions;
  const rep = validateBank(qs);
  const pos = [0, 0, 0]; const cat = {};
  qs.forEach((q) => { cat[q.category] = (cat[q.category] || 0) + 1; const i = (q.responses || []).findIndex((x) => x.isCorrect); if (i >= 0) pos[i] += 1; });
  console.log(`${qs.length} questions · categories ${JSON.stringify(cat)} · correct position A/B/C ${pos.join('/')}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  process.exit(rep.length ? 1 : 0);
}
