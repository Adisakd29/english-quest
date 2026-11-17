/*
  ตรวจเนื้อหา English for Work (data/premium/work/<topic>.json) — ใช้ทั้งตอนโหลดเข้าระบบและ CLI
  รายการที่มี error ไม่ถูกนำไปใช้ (บันทึกเตือนใน log)
*/
const TOPICS = [
  { id: 'emails', code: 'EML', th: 'อีเมลที่ทำงาน', en: 'Workplace Emails', icon: 'mail' },
  { id: 'meetings', code: 'MTG', th: 'การประชุม', en: 'Meetings', icon: 'users' },
  { id: 'interview', code: 'INT', th: 'สัมภาษณ์งาน', en: 'Job Interviews', icon: 'briefcase' },
  { id: 'calls', code: 'CAL', th: 'โทรศัพท์และวิดีโอคอล', en: 'Phone & Video Calls', icon: 'message-circle' },
  { id: 'presentations', code: 'PRE', th: 'การนำเสนองาน', en: 'Presentations', icon: 'chart-column' },
  { id: 'clients', code: 'CLI', th: 'คุยกับลูกค้าและเพื่อนร่วมงาน', en: 'Clients & Colleagues', icon: 'hand-helping' },
];
const ITEMS_PER_TOPIC = 12;
const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const thaiOk = (s) => typeof s === 'string' && /[฀-๿]/.test(s) && !/[​-‍﻿]/.test(s) && !/(^|[\s(])[ัิ-ฺ็-๎]/.test(s);
const enSentence = (s) => typeof s === 'string' && /^[A-Z"']/.test(s.trim()) && /[.?!]["']?$/.test(s.trim());

function validateItem(it, topic, k, errors) {
  const id = `W-${topic.code}-${String(k + 1).padStart(2, '0')}`;
  const e = (m) => errors.push(`${it && it.id ? it.id : `#${k + 1}`}: ${m}`);
  if (!it || typeof it !== 'object') { e('ไม่ใช่ object'); return; }
  if (it.id !== id) e(`id ต้องเป็น ${id}`);
  if (!['B1', 'B2'].includes(it.level)) e('level ต้องเป็น B1/B2');
  if (!['formal', 'neutral', 'informal'].includes(it.register)) e('register ไม่ถูกต้อง');
  const p = String(it.phrase || '');
  if (!p || /\.\.\.|…|[()[\]/]/.test(p)) e('phrase ว่างหรือมี ... ( ) /');
  if (words(p).length < 2 || words(p).length > 10) e('phrase ต้องยาว 2–10 คำ');
  for (const f of ['th', 'noteTH', 'exampleTH']) if (!thaiOk(it[f])) e(`${f} ภาษาไทยไม่ถูกต้อง`);
  if (!enSentence(it.example)) e('example ต้องขึ้นต้นตัวใหญ่และลงท้าย . ? !');
  if (words(it.example).length > 22) e('example ยาวเกิน 22 คำ');
  if (!norm(it.example).includes(norm(p))) e('example ต้องมี phrase อยู่ตรงตัว');
  const s = it.situation || {};
  if (!thaiOk(s.promptTH) || !thaiOk(s.whyTH)) e('situation.promptTH/whyTH ภาษาไทยไม่ถูกต้อง');
  if (!Array.isArray(s.options) || s.options.length !== 4 || new Set(s.options.map(norm)).size !== 4 || s.options.some((o) => !o || typeof o !== 'string')) e('situation.options ต้องมี 4 ตัวเลือกไม่ซ้ำ');
  if (!Number.isInteger(s.answer) || s.answer < 0 || s.answer > 3) e('situation.answer ต้องเป็น 0–3');
  const c = it.cloze || {};
  if (!thaiOk(c.whyTH)) e('cloze.whyTH ภาษาไทยไม่ถูกต้อง');
  if (typeof c.sentence !== 'string' || (c.sentence.match(/___/g) || []).length !== 1) e('cloze.sentence ต้องมี ___ หนึ่งที่');
  if (!Array.isArray(c.options) || c.options.length !== 4 || new Set(c.options.map(norm)).size !== 4 || c.options.some((o) => typeof o !== 'string' || /\s/.test(o.trim()) || !o.trim())) e('cloze.options ต้องเป็นคำเดี่ยว 4 คำไม่ซ้ำ');
  if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer > 3) e('cloze.answer ต้องเป็น 0–3');
  else if (typeof c.sentence === 'string' && Array.isArray(c.options)) {
    if (c.sentence.replace('___', c.options[c.answer]) !== it.example) e('cloze: เติมคำตอบแล้วต้องได้ example เป๊ะ');
    const blankAt = words(c.sentence.split('___')[0]).length;   // ตำแหน่งคำที่เว้น
    const exWords = words(it.example).map(norm);
    const pWords = words(p).map(norm);
    const start = exWords.findIndex((_, i) => pWords.every((w, j) => (exWords[i + j] || '').replace(/[.,?!]$/, '') === w.replace(/[.,?!]$/, '')));
    if (start < 0 || blankAt < start || blankAt >= start + pWords.length) e('cloze: คำที่เว้นต้องอยู่ในส่วนของ phrase');
  }
}

function validateFile(json, topicId) {
  const errors = [];
  const topic = TOPICS.find((t) => t.id === topicId);
  if (!topic) return { errors: [`ไม่รู้จักหัวข้อ ${topicId}`], items: [] };
  if (!json || json.topic !== topicId || !Array.isArray(json.items)) return { errors: ['topic/items ไม่ถูกต้อง'], items: [] };
  if (json.items.length !== ITEMS_PER_TOPIC) errors.push(`ต้องมี ${ITEMS_PER_TOPIC} รายการ (มี ${json.items.length})`);
  const bad = new Set();
  json.items.forEach((it, k) => { const before = errors.length; validateItem(it, topic, k, errors); if (errors.length > before) bad.add(k); });
  const seen = new Map();
  json.items.forEach((it, k) => { const key = norm(it && it.phrase); if (seen.has(key)) { errors.push(`${it.id}: phrase ซ้ำกับ ${json.items[seen.get(key)].id}`); bad.add(k); } else seen.set(key, k); });
  for (const f of ['situation', 'cloze']) {
    const cnt = [0, 0, 0, 0];
    json.items.forEach((it) => { const a = it && it[f] && it[f].answer; if (Number.isInteger(a) && a >= 0 && a <= 3) cnt[a] += 1; });
    if (json.items.length === ITEMS_PER_TOPIC && (cnt.some((n) => n === 0) || cnt.some((n) => n > 4))) errors.push(`${f}.answer กระจายไม่ดี [${cnt.join(', ')}] (ต้องมีครบ 0–3 และไม่เกิน 4 ต่อตำแหน่ง)`);
  }
  return { errors, items: json.items.filter((_, k) => !bad.has(k)) };
}

module.exports = { TOPICS, ITEMS_PER_TOPIC, validateFile, norm };
