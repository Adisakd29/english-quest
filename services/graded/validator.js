/*
  ตรวจเนื้อหา Graded Reading & Listening (data/graded) — ใช้ตอนเขียน, ตอน build เสียง และในชุดทดสอบ
  node services/graded/validator.js <file.json>
*/
const fs = require('fs');

const LEVELS = { A1: { min: 80, max: 130, p: [2, 3], q: 4 }, A2: { min: 130, max: 190, p: [3, 4], q: 4 },
  B1: { min: 190, max: 270, p: [3, 5], q: 5 }, B2: { min: 260, max: 340, p: [4, 6], q: 5 } };
const KINDS = ['story', 'email', 'blog', 'article', 'dialogue'];
const TOPICS = ['daily life', 'school', 'food', 'travel', 'family', 'friends', 'work', 'health', 'nature', 'technology', 'sport', 'culture', 'shopping', 'city'];
const QTYPES = ['gist', 'detail', 'vocab', 'inference', 'sequence'];
const THAI = /[฀-๿]/;
const words = (s) => (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
const norm = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

function validateText(t) {
  const e = [];
  const L = LEVELS[t && t.level];
  if (!t || typeof t !== 'object') return ['ไม่ใช่ object'];
  if (!/^(A1|A2|B1|B2)-\d{2}$/.test(t.id || '')) e.push('id ต้องเป็นรูปแบบ A1-01');
  if (!L) { e.push('level ไม่ถูกต้อง'); return e; }
  if (!String(t.id).startsWith(t.level)) e.push('id ไม่ตรงกับ level');
  if (!KINDS.includes(t.kind)) e.push(`kind ต้องเป็น ${KINDS.join('/')}`);
  if (!TOPICS.includes(t.topic)) e.push(`topic ไม่อยู่ในรายการ (${t.topic})`);
  if (!t.title || THAI.test(t.title)) e.push('title ต้องเป็นภาษาอังกฤษ');
  if (!t.titleTh || !THAI.test(t.titleTh)) e.push('titleTh ต้องเป็นภาษาไทย');
  const paras = Array.isArray(t.paragraphs) ? t.paragraphs : [];
  if (paras.length < L.p[0] || paras.length > L.p[1]) e.push(`ต้องมี ${L.p[0]}–${L.p[1]} ย่อหน้า (มี ${paras.length})`);
  if (paras.some((p) => typeof p !== 'string' || !p.trim() || THAI.test(p))) e.push('ย่อหน้าต้องเป็นข้อความภาษาอังกฤษ');
  if (paras.some((p) => /[#*&@<>{}[\]\\|~^_=]|https?:/.test(p))) e.push('มีสัญลักษณ์ที่ TTS อ่านไม่ดี (# * & / [] ฯลฯ)');
  const n = paras.reduce((a, p) => a + words(p), 0);
  if (n < L.min || n > L.max) e.push(`ความยาว ${n} คำ (ต้อง ${L.min}–${L.max})`);
  if (!Array.isArray(t.translationTH) || t.translationTH.length !== paras.length || t.translationTH.some((x) => !THAI.test(String(x)))) e.push('translationTH ต้องมีภาษาไทยครบทุกย่อหน้า');
  const full = norm(paras.join(' '));
  if (!Array.isArray(t.glossary) || t.glossary.length < 5 || t.glossary.length > 8) e.push('glossary ต้องมี 5–8 คำ');
  else t.glossary.forEach((g) => {
    if (!g.word || !g.th || !THAI.test(g.th)) e.push(`glossary ไม่ครบ: ${g.word}`);
    else if (!full.includes(norm(g.word).replace(/^to /, '').split(' ')[0])) e.push(`glossary "${g.word}" ไม่อยู่ในเนื้อเรื่อง`);
  });
  const qs = Array.isArray(t.questions) ? t.questions : [];
  if (qs.length !== L.q) e.push(`ต้องมี ${L.q} คำถาม (มี ${qs.length})`);
  if (qs.filter((q) => q.type === 'gist').length !== 1) e.push('ต้องมีคำถาม gist 1 ข้อพอดี');
  qs.forEach((q, i) => {
    const at = `คำถาม ${i + 1}`;
    if (!QTYPES.includes(q.type)) e.push(`${at}: type ไม่ถูกต้อง`);
    if (!q.stem || THAI.test(q.stem)) e.push(`${at}: stem ต้องเป็นภาษาอังกฤษ`);
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== 'string' || !o.trim())) e.push(`${at}: ต้องมี 4 ตัวเลือก`);
    else {
      if (new Set(q.options.map(norm)).size !== 4) e.push(`${at}: ตัวเลือกซ้ำ`);
      const lim = ['A1', 'A2'].includes(t.level) ? 8 : 12;
      if (q.options.some((o) => words(o) > lim)) e.push(`${at}: ตัวเลือกยาวเกิน ${lim} คำ`);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e.push(`${at}: answer ต้องเป็น 0–3`);
    if (!q.evidence || !full.includes(norm(q.evidence))) e.push(`${at}: evidence ต้องคัดลอกจากเนื้อเรื่องตรงตัว`);
    if (q.type === 'vocab') { const m = String(q.stem).match(/"([^"]+)"/); if (!m || !full.includes(norm(m[1]))) e.push(`${at}: คำที่ถามต้องอยู่ในเนื้อเรื่อง`); }
    if (!q.explanationTH || !THAI.test(q.explanationTH)) e.push(`${at}: explanationTH ต้องเป็นภาษาไทย`);
  });
  if (!t.tipTH || !THAI.test(t.tipTH)) e.push('tipTH ต้องเป็นภาษาไทย');
  return e;
}

function validateAll(texts) {
  const report = []; const ids = new Set(); const titles = new Set();
  texts.forEach((t) => {
    const errs = validateText(t);
    if (ids.has(t.id)) errs.push('id ซ้ำ'); ids.add(t.id);
    if (titles.has(norm(t.title))) errs.push('ชื่อเรื่องซ้ำ'); titles.add(norm(t.title));
    if (errs.length) report.push({ id: t.id, errors: errs });
  });
  return report;
}

module.exports = { validateText, validateAll, LEVELS, words };

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const list = Array.isArray(data) ? data : data.texts;
  const rep = validateAll(list);
  const pos = [0, 0, 0, 0];
  list.forEach((t) => (t.questions || []).forEach((q) => { if (pos[q.answer] !== undefined) pos[q.answer] += 1; }));
  console.log(`${list.length} texts · words ${list.map((t) => `${t.id}:${(t.paragraphs || []).reduce((a, p) => a + words(p), 0)}`).join(' ')} · answers A-D ${pos.join('/')}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  if (rep.length) process.exit(1);
}
