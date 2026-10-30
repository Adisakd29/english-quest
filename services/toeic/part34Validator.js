/*
  ตรวจคุณภาพชุดข้อ TOEIC-style Listening Part 3 (Conversations) / Part 4 (Talks)
    Part 3: บทสนทนา 2–3 คน · 6–14 ช่วงพูด · 80–210 คำ · 3 คำถาม
    Part 4: ผู้พูดคนเดียว · 1–5 ย่อหน้า · 90–210 คำ · 3 คำถาม
  คำถามมีตัวเลือก 4 ข้อ (แสดงบนจอ) · ทุกข้อต้องมี evidence ยกจากบทพูด/กราฟิกตรงตัว · ข้อ intent ต้องอ้างประโยคที่มีจริง
    node services/toeic/part34Validator.js <file.json> [--audio]
*/
const fs = require('fs');
const path = require('path');
const { TOPICS, POS } = require('./part5Validator');

const LETTERS = ['A', 'B', 'C', 'D'];
const QTYPES = ['mainIdea', 'detail', 'inference', 'intent', 'graphic', 'nextAction', 'speaker', 'location', 'reason', 'suggestion'];
const TALK_TYPES = ['announcement', 'voicemail', 'advertisement', 'news', 'tour', 'meeting', 'broadcast', 'introduction', 'instructions', 'speech'];
const SPEAKER_IDS = ['M', 'W', 'M2', 'W2'];
const DIFF = ['easy', 'medium', 'hard'];
const THAI = /[฀-๿]/;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase();

function validateSet(p, { publicDir = null, checkAudio = false } = {}) {
  const errors = [];
  const e = (m) => errors.push(m);
  if (!p || typeof p !== 'object') return { status: 'reviewNeeded', errors: ['not an object'] };
  const part = Number(p.part);
  if (![3, 4].includes(part)) e(`part "${p.part}"`);
  if (!DIFF.includes(p.difficulty)) e(`difficulty "${p.difficulty}"`);
  if (!TOPICS.includes(p.topic)) e(`topic "${p.topic}"`);
  if (part === 4 && !TALK_TYPES.includes(p.talkType)) e(`talkType "${p.talkType}"`);
  const sp = Array.isArray(p.speakers) ? p.speakers : [];
  if (sp.some((s) => !s || !SPEAKER_IDS.includes(s.id) || !['male', 'female'].includes(s.gender))) e('speakers id/gender');
  if (sp.some((s) => s && s.id && ((s.id[0] === 'M') !== (s.gender === 'male')))) e('speaker M* ต้องเป็น male · W* ต้องเป็น female');
  if (part === 3 && (sp.length < 2 || sp.length > 3)) e('Part 3 ต้องมีผู้พูด 2–3 คน');
  if (part === 4 && sp.length !== 1) e('Part 4 ต้องมีผู้พูด 1 คน');
  const turns = Array.isArray(p.turns) ? p.turns : [];
  const ids = new Set(sp.map((s) => s && s.id));
  if (turns.some((t) => !t || !ids.has(t.speaker) || !t.text)) e('turns: speaker ต้องอยู่ใน speakers และมี text');
  if (part === 3) {
    if (turns.length < 5 || turns.length > 14) e(`Part 3 ต้องมี 5–14 ช่วงพูด (มี ${turns.length})`);
    if (turns.some((t, i) => i && t.speaker === turns[i - 1].speaker)) e('ช่วงพูดติดกันต้องเป็นคนละคน');
    if (new Set(turns.map((t) => t.speaker)).size !== sp.length) e('ผู้พูดทุกคนต้องได้พูด');
    if (turns.some((t) => words(t.text).length > 48)) e('ช่วงพูดยาวเกิน 48 คำ');
  }
  if (part === 4 && (turns.length < 1 || turns.length > 5)) e('Part 4: 1–5 ย่อหน้า');
  const total = turns.reduce((a, t) => a + words(t && t.text).length, 0);
  if (total < (part === 3 ? 70 : 85) || total > 215) e(`ความยาวรวม ${total} คำ (Part 3: 70–215 · Part 4: 85–215)`);
  if (/[#@*_~^<>{}[\]\\]/.test(turns.map((t) => t && t.text).join(' '))) e('มีสัญลักษณ์ที่ TTS อ่านผิดได้');
  const graphicText = p.graphic ? `${p.graphic.title || ''}\n${p.graphic.table || ''}` : '';
  if (p.graphic) {
    const rows = String(p.graphic.table || '').split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l));
    if (!p.graphic.title || rows.length < 3) e('graphic ต้องมี title และตารางอย่างน้อย 3 แถว');
  }
  if (!Array.isArray(p.translationTH) || p.translationTH.length !== turns.length || p.translationTH.some((t) => !THAI.test(t || ''))) e('translationTH ต้องเป็น array ภาษาไทยเท่าจำนวน turns');
  if (!THAI.test(p.tipTH || '')) e('tipTH');
  const v = p.vocabulary;
  if (!Array.isArray(v) || v.length < 2 || v.length > 6) e('vocabulary 2–6');
  else v.forEach((x, i) => { if (!x || !x.word || !POS.includes(x.pos) || !THAI.test(x.th || '')) e(`vocabulary[${i}]`); });
  const transcript = norm(turns.map((t) => t && t.text).join(' \n '));
  const all = `${transcript} \n ${norm(graphicText)}`;
  const qs = Array.isArray(p.questions) ? p.questions : [];
  if (qs.length !== 3) e('ต้องมี 3 คำถาม');
  const gq = qs.filter((q) => q && q.type === 'graphic').length;
  if (gq && !p.graphic) e('ข้อ graphic ต้องมี graphic');
  if (p.graphic && gq !== 1) e('ชุดที่มี graphic ต้องมีข้อ graphic 1 ข้อ');
  qs.forEach((q, i) => {
    const t = `Q${i + 1}`;
    if (!q || !QTYPES.includes(q.type)) { e(`${t} type "${q && q.type}"`); return; }
    if (!q.stem || words(q.stem).length < 4 || !/[?:]$/.test(q.stem.trim())) e(`${t} stem`);
    const o = q.options;
    if (!Array.isArray(o) || o.length !== 4) { e(`${t} options 4`); return; }
    if (o.some((x) => typeof x !== 'string' || !x.trim() || x !== x.trim())) e(`${t} option ว่าง`);
    if (new Set(o.map((x) => String(x).toLowerCase())).size !== 4) e(`${t} options ซ้ำ`);
    if (o.some((x) => words(x).length > 16)) e(`${t} option ยาวเกิน 16 คำ`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e(`${t} answer`);
    const ev = [].concat(q.evidence || []);
    if (!ev.length || ev.some((x) => !x || words(x).length < 2 || !all.includes(norm(x)))) e(`${t} evidence ต้องยกมาตรงตัว (${ev.find((x) => !all.includes(norm(x))) || 'ว่าง'})`);
    if (q.type === 'intent') { const m = /["“]([^"”]+)["”]/.exec(q.stem || ''); if (!m || !transcript.includes(norm(m[1]))) e(`${t} intent ต้องอ้างประโยคในเครื่องหมายคำพูดที่มีในบทพูด`); }
    if (q.type === 'graphic' && !/graphic/i.test(q.stem)) e(`${t} ข้อ graphic ต้องมีคำว่า "Look at the graphic"`);
    if (!THAI.test(q.explanationTH || '') || String(q.explanationTH).length < 25) e(`${t} explanationTH`);
    if (!Array.isArray(q.optionNotesTH) || q.optionNotesTH.length !== 4 || q.optionNotesTH.some((x) => !THAI.test(x || '') || String(x).length < 8)) e(`${t} optionNotesTH`);
  });
  if (checkAudio) {
    const a = p.audio;
    if (!a || !a.url || !Array.isArray(a.segments) || a.segments.length !== turns.length) e('audio/segments ไม่ครบ');
    else if (publicDir && !fs.existsSync(path.join(publicDir, a.url))) e(`ไม่พบไฟล์ ${a.url}`);
  }
  return { status: errors.length ? 'reviewNeeded' : 'verified', errors };
}

function validateBank(sets, opts) {
  const seen = new Map(); const report = [];
  sets.forEach((p) => {
    const r = validateSet(p, opts);
    const key = norm((p.turns || []).slice(0, 2).map((t) => t.text).join(' ')).slice(0, 120);
    if (seen.has(key)) r.errors.push(`ซ้ำกับ ${seen.get(key)}`);
    seen.set(key, p.id);
    if (r.errors.length) report.push({ id: p.id, errors: r.errors });
  });
  return report;
}

module.exports = { validateSet, validateBank, LETTERS, QTYPES, TALK_TYPES, norm };

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const ps = Array.isArray(data) ? data : data.sets;
  const rep = validateBank(ps, { publicDir: path.join(__dirname, '..', '..', 'public'), checkAudio: process.argv.includes('--audio') });
  const pos = [0, 0, 0, 0]; const qt = {};
  ps.forEach((p) => (p.questions || []).forEach((q) => { if (pos[q.answer] !== undefined) pos[q.answer] += 1; qt[q.type] = (qt[q.type] || 0) + 1; }));
  console.log(`${ps.length} sets · types ${JSON.stringify(qt)} · answers A-D ${pos.join('/')} · graphic ${ps.filter((p) => p.graphic).length} · 3 speakers ${ps.filter((p) => (p.speakers || []).length === 3).length}`);
  rep.forEach((r) => console.log(`FAIL ${r.id}: ${r.errors.join('; ')}`));
  console.log(rep.length ? `${rep.length} failed` : 'ALL VALID');
  process.exit(rep.length ? 1 : 0);
}
