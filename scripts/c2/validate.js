/*
  C2 Vocabulary validator — ตรวจคุณภาพ data/vocab-c2/batch-*.json ก่อนนำเข้า

  ใช้ได้ 2 แบบ
    1) CLI:   node scripts/c2/validate.js [--json] [--db]      (--db = เช็คซ้ำกับ A1–C1 ในฐานข้อมูลด้วย)
    2) module: const { validateAll } = require('./validate'); validateAll(entries, { existingLemmas })

  ผลต่อ entry:  errors[] (ร้ายแรง → ห้ามเข้า production)  ·  warnings[] (ควรให้คนตรวจ แต่ไม่บล็อก)
  status: 'autoChecked' ถ้าไม่มี error · 'unverified' ถ้ามี error
  ('reviewed' ตั้งได้เฉพาะจากหน้า admin โดยคน ไม่ได้มาจาก validator)
*/
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'vocab-c2');

const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal verb', 'idiom', 'collocation', 'fixed expression', 'discourse marker'];
const KINDS = ['word', 'sense', 'collocation', 'phrasal', 'idiom', 'fixed', 'colloquial'];
const REGISTERS = ['formal', 'neutral', 'informal', 'academic', 'professional', 'literary'];
const CONNOTATIONS = ['positive', 'neutral', 'negative', 'approving', 'disapproving', 'humorous', 'critical'];
const VARIANTS = ['both', 'UK', 'US'];
const TIERS = ['core', 'extended'];
const STATUSES = ['unverified', 'autoChecked', 'reviewed'];
const TOPICS = ['society', 'education', 'technology', 'science', 'environment', 'economics', 'business', 'culture',
  'psychology', 'media', 'communication', 'law', 'workplace', 'academic', 'relationships', 'arts', 'literature',
  'current-affairs', 'argumentation', 'analysis', 'opinion', 'cause-effect', 'evaluation', 'everyday'];
const EXTENDED_TAGS = ['rare', 'literary', 'archaic', 'specialist'];
const SHORT_TH_MAX = 30;

function loadBatches(dir = DATA_DIR) {
  const files = fs.readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const out = [];
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${f}: ต้องเป็น JSON array`);
    arr.forEach((e, i) => out.push(Object.assign(e, { __file: f, __index: i })));
  }
  return out;
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const isStr = (s) => typeof s === 'string' && s.trim().length > 0;

// ---------- ตรวจข้อความ ----------
const THAI_MARK = /[ัิ-ฺ็-๎]/; // สระบน/ล่าง/วรรณยุกต์ (ต้องมีพยัญชนะนำ)
function textProblems(s) {
  const p = [];
  if (typeof s !== 'string') return p;
  if (s.includes('�')) p.push('มีอักขระเสีย (U+FFFD)');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) p.push('มี control character');
  if (/[​-‍﻿]/.test(s)) p.push('มี zero-width character');
  // สระ/วรรณยุกต์ลอย: ต้นข้อความ หรือหลังช่องว่าง/เครื่องหมาย
  if (/(^|[\s(/"'\-,.])[ัิ-ฺ็-๎]/.test(s)) p.push('สระ/วรรณยุกต์ไทยลอย (ไม่มีพยัญชนะนำ)');
  if (/[่-๋]{2,}/.test(s)) p.push('วรรณยุกต์ซ้อน');
  if (/\s{2,}/.test(s.replace(/\n/g, ' '))) p.push('ช่องว่างซ้อน');
  return p;
}
const hasThai = (s) => /[ก-ฮ]/.test(String(s || ''));

// ประโยคภาษาอังกฤษพื้นฐาน: ขึ้นต้นตัวใหญ่/ตัวเลข/เครื่องหมายคำพูด ลงท้ายด้วยเครื่องหมายจบ, ไม่มีคำซ้ำติดกัน
function sentenceProblems(s, { needBlank = false } = {}) {
  const p = [];
  if (!isStr(s)) return ['ว่าง'];
  const t = s.trim();
  const multiline = t.includes('\n'); // บทสนทนา/อีเมล: ตรวจรายบรรทัดหยาบ ๆ ไม่บังคับลงท้าย
  if (!/^(["'‘“(A-Z0-9£$€]|_{3,})/.test(t)) p.push('ไม่ขึ้นต้นด้วยตัวพิมพ์ใหญ่');
  if (!multiline && !/[.!?…]["'’”)]?$/.test(t)) p.push('ไม่ลงท้ายด้วยเครื่องหมายจบประโยค');
  const dup = t.toLowerCase().match(/\b([a-z]+) \1\b/);
  if (dup && !['that', 'had', 'very', 'bye', 'no', 'so', 'is', 'really'].includes(dup[1])) p.push(`คำซ้ำติดกัน "${dup[1]} ${dup[1]}"`);
  if (/[^\n\x20-\x7E\u00B0\u00E7\u00E9\u00A3\u20AC\u2013\u2014\u2018-\u201D\u2026]/.test(t)) p.push('มีอักขระที่ไม่ใช่ภาษาอังกฤษในประโยคอังกฤษ');
  const blanks = (t.match(/_{3,}/g) || []).length;
  if (needBlank && blanks !== 1) p.push(`ต้องมีช่องว่าง ___ 1 ช่อง (พบ ${blanks})`);
  return p;
}

// คำเป้าหมายปรากฏในประโยคตัวอย่างไหม (ยอมรับการผัน/รูปบางส่วนของสำนวน)
function stem(w) { return w.replace(/(ies|ied|ying|ing|ed|es|s|ly|y|e)$/, ''); }
function exampleShowsTarget(e) {
  const ex = norm(e.example);
  const form = norm(e.displayForm || e.lemma).replace(/\b(someone|somebody|something|sb|sth|one's|oneself|someone's|your)\b/g, ' ');
  const words = form.split(/[^a-z']+/).filter((w) => w.length > 2 && !['the', 'and', 'with', 'for', 'one', 'your'].includes(w));
  if (!words.length) return true;
  const hits = words.filter((w) => ex.includes(stem(w).slice(0, Math.max(3, stem(w).length - 1))));
  return hits.length >= Math.ceil(words.length * 0.5);
}

// ---------- ตรวจ entry เดียว ----------
function validateEntry(e) {
  const errors = []; const warnings = [];
  const E = (m) => errors.push(m); const W = (m) => warnings.push(m);

  for (const f of ['key', 'lemma', 'displayForm', 'pos', 'kind', 'senseTag', 'meaningEN', 'meaningTH', 'shortMeaningTH',
    'usageNoteTH', 'register', 'connotation', 'tier', 'example', 'exampleTH', 'sourceType', 'sourceReference']) {
    if (!isStr(e[f])) E(`ขาด ${f}`);
  }
  if (isStr(e.key) && e.key !== e.key.toLowerCase()) E('key ต้องเป็นตัวพิมพ์เล็ก');
  if (isStr(e.key) && e.key.split('|').length !== 3) E('key ต้องเป็นรูป lemma|pos|senseTag');
  if (e.pos && !POS.includes(e.pos)) E(`pos ไม่รู้จัก: ${e.pos}`);
  if (e.kind && !KINDS.includes(e.kind)) E(`kind ไม่รู้จัก: ${e.kind}`);
  if (e.register && !REGISTERS.includes(e.register)) E(`register ไม่รู้จัก: ${e.register}`);
  if (e.connotation && !CONNOTATIONS.includes(e.connotation)) E(`connotation ไม่รู้จัก: ${e.connotation}`);
  if (e.tier && !TIERS.includes(e.tier)) E(`tier ไม่รู้จัก: ${e.tier}`);
  if (e.variant != null && !VARIANTS.includes(e.variant)) E(`variant ไม่รู้จัก: ${e.variant}`);
  if (e.verificationStatus != null && !STATUSES.includes(e.verificationStatus)) E(`verificationStatus ไม่รู้จัก: ${e.verificationStatus}`);
  for (const f of ['frequencyBand', 'realWorldPriority', 'difficulty']) {
    if (!Number.isInteger(e[f]) || e[f] < 1 || e[f] > 5) E(`${f} ต้องเป็นจำนวนเต็ม 1–5`);
  }
  // CEFR: ไฟล์นี้คือ C2 ทั้งหมด — ถ้ามีฟิลด์ cefr ต้องเป็น C2
  if (e.cefr != null && e.cefr !== 'C2') E(`cefr ต้องเป็น C2 (พบ ${e.cefr})`);
  if (!isStr(e.ipaUK) && !isStr(e.ipaUS)) W('ไม่มี IPA');

  // tier ↔ priority ↔ tags
  const tags = Array.isArray(e.tags) ? e.tags : [];
  const rare = tags.some((t) => EXTENDED_TAGS.includes(t));
  if (e.tier === 'core' && e.realWorldPriority <= 2) E('tier=core แต่ realWorldPriority ≤ 2 (ต้องเป็น extended)');
  if (e.tier === 'core' && rare) E(`tier=core แต่มีแท็ก ${tags.filter((t) => EXTENDED_TAGS.includes(t)).join('/')} (ต้องเป็น extended)`);
  if (e.tier === 'extended' && e.realWorldPriority >= 4 && !rare) W('tier=extended ทั้งที่ priority ≥ 4');
  if (tags.includes('archaic') && e.realWorldPriority > 1) W('แท็ก archaic ควรมี priority = 1');

  // kind ↔ pos consistency
  if (e.kind === 'phrasal' && e.pos !== 'phrasal verb') E('kind=phrasal ต้องมี pos="phrasal verb"');
  if (e.pos === 'phrasal verb' && typeof e.separable !== 'boolean') E('phrasal verb ต้องระบุ separable true/false');
  if (e.kind === 'idiom') {
    if (!isStr(e.literalTH)) E('idiom ขาด literalTH');
    if (!isStr(e.naturalTH)) E('idiom ขาด naturalTH');
    if (!isStr(e.unnaturalTH)) E('idiom ขาด unnaturalTH');
  }
  if (e.kind === 'sense') {
    if (!isStr(e.baseLemma)) E('kind=sense ต้องมี baseLemma');
    if (!isStr(e.baseMeaningTH)) E('kind=sense ต้องมี baseMeaningTH (ใช้เป็นตัวลวง)');
    if (isStr(e.baseMeaningTH) && norm(e.baseMeaningTH) === norm(e.shortMeaningTH)) E('baseMeaningTH ซ้ำกับ shortMeaningTH');
  }

  // ภาษาไทย
  for (const f of ['meaningTH', 'shortMeaningTH', 'usageNoteTH', 'exampleTH', 'baseMeaningTH', 'literalTH', 'naturalTH', 'unnaturalTH']) {
    if (e[f] == null) continue;
    for (const p of textProblems(e[f])) E(`${f}: ${p}`);
  }
  for (const f of ['meaningTH', 'shortMeaningTH', 'exampleTH']) if (isStr(e[f]) && !hasThai(e[f])) E(`${f} ไม่มีภาษาไทย`);
  if (isStr(e.shortMeaningTH) && [...e.shortMeaningTH].length > SHORT_TH_MAX) E(`shortMeaningTH ยาวเกิน ${SHORT_TH_MAX} ตัวอักษร`);
  if (isStr(e.meaningEN) && hasThai(e.meaningEN)) E('meaningEN มีภาษาไทยปน');

  // ตัวอย่าง
  for (const p of sentenceProblems(e.example)) E(`example: ${p}`);
  if (isStr(e.example) && !exampleShowsTarget(e)) W('example อาจไม่มีคำ/สำนวนเป้าหมาย');
  for (const f of ['meaningEN', 'example', 'usageNoteTH']) for (const p of textProblems(e[f])) E(`${f}: ${p}`);

  // ความสัมพันธ์
  if (!Array.isArray(e.collocations) || e.collocations.length < 2) E('collocations ต้องมีอย่างน้อย 2');
  else {
    if (new Set(e.collocations.map(norm)).size !== e.collocations.length) E('collocations ซ้ำกัน');
    if (e.collocations.some((c) => !isStr(c) || hasThai(c))) E('collocation ว่างหรือมีภาษาไทย');
  }
  if (!Array.isArray(e.nearSynonyms) || e.nearSynonyms.length < 1) E('nearSynonyms ต้องมีอย่างน้อย 1');
  else e.nearSynonyms.forEach((n, i) => { if (!isStr(n && n.word) || !isStr(n && n.differenceTH)) E(`nearSynonyms[${i}] ขาด word/differenceTH`); });
  if (!Array.isArray(e.commonMistakes) || e.commonMistakes.length < 1) E('commonMistakes ต้องมีอย่างน้อย 1');
  else e.commonMistakes.forEach((m, i) => {
    if (!isStr(m && m.wrong) || !isStr(m && m.right) || !isStr(m && m.whyTH)) E(`commonMistakes[${i}] ขาด wrong/right/whyTH`);
    else if (norm(m.wrong) === norm(m.right)) E(`commonMistakes[${i}] wrong = right`);
  });
  for (const f of ['synonyms', 'antonyms', 'confusedWith', 'wordFamily']) if (e[f] != null && !Array.isArray(e[f])) E(`${f} ต้องเป็น array`);
  const syn = new Set((e.synonyms || []).map(norm));
  if ((e.antonyms || []).some((a) => syn.has(norm(a)))) E('คำเดียวกันอยู่ทั้ง synonyms และ antonyms');
  if (!Array.isArray(e.topics) || e.topics.length < 1 || e.topics.length > 3) E('topics ต้องมี 1–3');
  else e.topics.forEach((t) => { if (!TOPICS.includes(t)) E(`topic ไม่รู้จัก: ${t}`); });

  // Guess from Context
  if (!e.context || !isStr(e.context.text)) E('ขาด context.text');
  else {
    const n = (e.context.text.match(/\[\[[^\]]+\]\]/g) || []).length;
    if (n !== 1) E(`context ต้องมี [[เป้าหมาย]] 1 จุด (พบ ${n})`);
    if (!isStr(e.context.cluesTH)) E('context ขาด cluesTH');
    for (const p of sentenceProblems(e.context.text.replace(/\[\[|\]\]/g, ''))) E(`context: ${p}`);
    if (e.context.text.split(/[.!?]\s/).length < 2) W('context สั้น (ควร 2–3 ประโยคเพื่อให้มีเบาะแส)');
  }

  // คำถาม
  const q = e.q || {};
  const questions = [];
  if (!q.collocation) E('ขาด q.collocation');
  else {
    const c = q.collocation;
    for (const p of sentenceProblems(c.sentence, { needBlank: true })) E(`q.collocation: ${p}`);
    if (!isStr(c.answer)) E('q.collocation ขาด answer');
    if (!Array.isArray(c.distractors) || c.distractors.length !== 3) E('q.collocation ต้องมีตัวลวง 3 ตัว');
    if (!isStr(c.whyTH)) E('q.collocation ขาด whyTH (คำอธิบาย)');
    checkChoices('q.collocation', c.answer, c.distractors || [], E);
    plausibleCheck('q.collocation', e, c.answer, c.distractors || [], E, W);
    questions.push(['collocation', c.sentence]);
  }
  if (!q.nearSyn) E('ขาด q.nearSyn');
  else {
    const c = q.nearSyn; const ds = (c.distractors || []).map((d) => d && d.word);
    for (const p of sentenceProblems(c.sentence, { needBlank: true })) E(`q.nearSyn: ${p}`);
    if (!isStr(c.answer)) E('q.nearSyn ขาด answer');
    if (!Array.isArray(c.distractors) || c.distractors.length !== 3) E('q.nearSyn ต้องมีตัวลวง 3 ตัว');
    (c.distractors || []).forEach((d, i) => { if (!isStr(d && d.whyNotTH)) E(`q.nearSyn.distractors[${i}] ขาด whyNotTH`); });
    checkChoices('q.nearSyn', c.answer, ds, E);
    plausibleCheck('q.nearSyn', e, c.answer, ds, E, W);
    questions.push(['nearSyn', c.sentence]);
  }
  if (q.formation) {
    const f = q.formation;
    for (const p of sentenceProblems(f.sentence, { needBlank: true })) E(`q.formation: ${p}`);
    if (!isStr(f.root) || !isStr(f.answer)) E('q.formation ขาด root/answer');
    if (!Array.isArray(f.options) || f.options.length !== 4) E('q.formation ต้องมีตัวเลือก 4');
    else {
      if (!f.options.map(norm).includes(norm(f.answer))) E('q.formation: answer ไม่อยู่ในตัวเลือก');
      if (new Set(f.options.map(norm)).size !== f.options.length) E('q.formation: ตัวเลือกซ้ำ');
    }
    if (!Array.isArray(f.accepted) || !f.accepted.map(norm).includes(norm(f.answer))) E('q.formation: accepted ต้องมี answer');
    const extraAccepted = (f.accepted || []).filter((a) => norm(a) !== norm(f.answer) && (f.options || []).map(norm).includes(norm(a)));
    if (extraAccepted.length) E(`q.formation: ตัวเลือกอื่นถูกยอมรับด้วย (${extraAccepted.join(', ')}) → มีคำตอบถูกหลายข้อ`);
    questions.push(['formation', f.sentence]);
  }
  if (q.register) {
    const r = q.register; const ds = (r.distractors || []).map((d) => d && d.text);
    if (!isStr(r.situationTH) || !isStr(r.question) || !isStr(r.answer)) E('q.register ขาด situationTH/question/answer');
    if (!Array.isArray(r.distractors) || r.distractors.length !== 3) E('q.register ต้องมีตัวลวง 3 ตัว');
    (r.distractors || []).forEach((d, i) => { if (!isStr(d && d.whyNotTH)) E(`q.register.distractors[${i}] ขาด whyNotTH`); });
    checkChoices('q.register', r.answer, ds, E);
    questions.push(['register', r.answer]);
  }

  if (!['editorial'].includes(e.sourceType)) E(`sourceType ต้องเป็น editorial (พบ ${e.sourceType || '-'})`);

  return { errors, warnings, questions };
}

function checkChoices(label, answer, distractors, E) {
  const all = [answer, ...distractors].map(norm);
  if (all.some((x) => !x)) E(`${label}: มีตัวเลือกว่าง`);
  if (new Set(all).size !== all.length) {
    if (distractors.map(norm).includes(norm(answer))) E(`${label}: คำตอบถูกอยู่ในตัวลวงด้วย`);
    else E(`${label}: ตัวเลือกซ้ำกัน`);
  }
}

// มีคำตอบที่ "อาจถูก" หลายข้อไหม: ตัวลวงเป็น synonym ของเป้าหมาย/คำตอบ
function plausibleCheck(label, e, answer, distractors, E, W) {
  const syn = new Set([...(e.synonyms || []), e.lemma, e.displayForm].map(norm));
  const ans = norm(answer);
  // ใช้ได้เฉพาะเมื่อคำตอบคือ "ตัวเป้าหมายทั้งคำ" (ไม่ใช่ชิ้นส่วนของสำนวน เช่น bush ใน beat around the bush)
  if (syn.has(ans)) for (const d of distractors.map(norm)) {
    if (syn.has(d) && d !== ans) E(`${label}: ตัวลวง "${d}" เป็น synonym ของคำเป้าหมาย → อาจถูกได้หลายข้อ`);
  }
  // คำตอบ ≠ เป้าหมาย และไม่ใช่ synonym/รูปคำ — เตือนให้คนตรวจ
  const fam = new Set([...(e.wordFamily || []).map((w) => norm(w.form)), ...syn]);
  const whole = norm(e.displayForm || e.lemma).replace(/[^a-z' ]/g, ' ');
  const IRR = { borne: 'bear', bore: 'bear', made: 'make', drew: 'draw', drawn: 'draw', written: 'write', wrote: 'write', took: 'take', taken: 'take', gave: 'give', given: 'give', went: 'go', gone: 'go', came: 'come', held: 'hold', kept: 'keep', ran: 'run', got: 'get', put: 'put', set: 'set', cut: 'cut' };
  const pre = (w) => { w = IRR[w] || w; return w.slice(0, 4); };
  const wholeWords = whole.split(' ').filter((w) => w.length > 1);
  const inExpr = ans.split(/[^a-z']+/).some((w) => w.length > 1 && wholeWords.some((x) => pre(x) === pre(w) || x === w));
  if (!inExpr && !fam.has(ans) && ![...fam].some((f) => f && (ans.includes(f) || f.includes(ans)))) W(`${label}: answer "${answer}" ไม่ใช่คำเป้าหมาย/synonym/word family — ตรวจว่าตั้งใจ`);
}

// ---------- ตรวจทั้งชุด ----------
function validateAll(entries, { existingLemmas = null } = {}) {
  const results = new Map();
  const byKey = new Map(); const bySense = new Map(); const byQ = new Map();
  for (const e of entries) {
    const r = validateEntry(e);
    const id = e.key || `${e.__file}#${e.__index}`;
    if (byKey.has(id)) r.errors.push(`key ซ้ำกับ ${byKey.get(id)}`);
    else byKey.set(id, `${e.__file || '?'}#${e.__index}`);
    // ความหมายซ้ำ: lemma เดียวกัน + meaningTH/meaningEN เดียวกัน
    const sk = `${norm(e.lemma)}|${norm(e.meaningEN)}`;
    if (bySense.has(sk)) r.errors.push(`sense ซ้ำ (ความหมายเดียวกับ ${bySense.get(sk)})`); else bySense.set(sk, id);
    for (const [type, s] of r.questions) {
      const qk = `${type}|${norm(s)}`;
      if (byQ.has(qk)) r.errors.push(`คำถาม ${type} ซ้ำกับ ${byQ.get(qk)}`); else byQ.set(qk, id);
    }
    // ซ้ำกับ A1–C1
    if (existingLemmas) {
      const lem = norm(e.kind === 'sense' ? e.baseLemma : e.lemma);
      const ex = existingLemmas.get(lem);
      if (e.kind === 'word' && ex && ex.pos && ex.pos.has(e.pos)) {
        r.errors.push(`"${lem}" (${e.pos}) มีอยู่แล้วใน ${[...ex].join('/')} ความหมายเดียวกันซ้ำระดับ → ห้ามนำเข้าเป็นคำใหม่ (ทำเป็น kind=sense ถ้าเป็นความหมายขั้นสูงต่างกันจริง)`);
      } else if (e.kind === 'word' && ex) {
        r.warnings.push(`"${lem}" มีอยู่แล้วใน ${[...existingLemmas.get(lem)].join('/')} → นำเข้าเป็น sense ใหม่ของ entry เดิม (ตรวจว่าเป็นความหมายขั้นสูงจริง)`);
      }
      if (e.kind === 'sense' && !existingLemmas.has(lem)) r.warnings.push(`baseLemma "${lem}" ไม่มีใน A1–C1 → จะสร้าง entry ใหม่`);
    }
    delete r.questions;
    r.status = e.verificationStatus === 'reviewed' ? 'reviewed' : (r.errors.length ? 'unverified' : 'autoChecked');
    results.set(id, r);
  }
  const list = [...results.entries()].map(([key, r]) => ({ key, ...r }));
  const summary = {
    total: list.length,
    autoChecked: list.filter((r) => r.status === 'autoChecked').length,
    reviewed: list.filter((r) => r.status === 'reviewed').length,
    unverified: list.filter((r) => r.status === 'unverified').length,
    errors: list.reduce((a, r) => a + r.errors.length, 0),
    warnings: list.reduce((a, r) => a + r.warnings.length, 0),
  };
  return { results: list, byKey: results, summary };
}

async function loadExistingLemmas(pool) {
  const rows = (await pool.query(
    "SELECT lower(e.headword) AS w, array_agg(DISTINCT s.cefr) AS lv FROM vocab_entries e JOIN vocab_senses s ON s.entry_id = e.id WHERE s.cefr <> 'C2' GROUP BY 1")).rows;
  const posRows = (await pool.query(
    "SELECT lower(e.headword) AS w, array_agg(DISTINCT s.pos) AS p FROM vocab_entries e JOIN vocab_senses s ON s.entry_id = e.id WHERE s.cefr <> 'C2' GROUP BY 1")).rows;
  const posMap = new Map(posRows.map((r) => [norm(r.w), new Set(r.p)]));
  // Set ของระดับ + property .pos = Set ของ pos (ใช้ตรวจ "คำเดียวกัน pos เดียวกัน")
  return new Map(rows.map((r) => { const s = new Set(r.lv); s.pos = posMap.get(norm(r.w)) || new Set(); return [norm(r.w), s]; }));
}

module.exports = { validateAll, validateEntry, loadBatches, loadExistingLemmas, textProblems, sentenceProblems,
  POS, KINDS, REGISTERS, CONNOTATIONS, TOPICS, TIERS, STATUSES, DATA_DIR };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const entries = loadBatches();
    let existingLemmas = null;
    if (args.includes('--db')) {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      existingLemmas = await loadExistingLemmas(pool); await pool.end();
    }
    const out = validateAll(entries, { existingLemmas });
    if (args.includes('--json')) { console.log(JSON.stringify(out.results.filter((r) => r.errors.length || r.warnings.length), null, 2)); }
    else {
      for (const r of out.results) {
        if (!r.errors.length && !(args.includes('--warn') && r.warnings.length)) continue;
        console.log(`\n[${r.status}] ${r.key}`);
        r.errors.forEach((m) => console.log('  ✗ ' + m));
        if (args.includes('--warn')) r.warnings.forEach((m) => console.log('  ! ' + m));
      }
    }
    console.log('\nสรุป:', JSON.stringify(out.summary));
    process.exit(out.summary.unverified && args.includes('--strict') ? 1 : 0);
  })().catch((err) => { console.error(err); process.exit(2); });
}
