#!/usr/bin/env node
/*
  Grammar QA — ตรวจคลังคำถามแกรมม่าซ้ำได้ทุกเมื่อ (ใช้ในชุดทดสอบ test/grammar-qa.test.js ด้วย)
    node scripts/grammar-qa.js            -> รายงานสรุป (exit 1 ถ้ามี error)
    node scripts/grammar-qa.js --json     -> รายงานเต็มแบบ JSON
  ตรวจทั้ง
    1) คลังเดิม data/grammar.js (ข้อสอบท้ายบท + แบบฝึกในบทเรียน)
    2) หลักสูตรใหม่ data/grammar-curriculum (ถ้ามี) — ผ่าน validateCurriculum()
  สิ่งที่ตรวจ: field หาย · ตัวเลือกซ้ำ · เฉลยเกินช่วง · ข้อซ้ำ · อักขระเสีย/สระไทยลอย · a/an ไม่ตรงเสียง ·
  article ตามด้วยกริยา (เช่น "A is a good book") · ตัวเลือกที่ถูกได้มากกว่าหนึ่งข้อตามรูปแบบที่รู้จัก ·
  ตัวเลือกต่างกันแค่การย่อคำ · คำอธิบายว่าง/สั้นเกินไป
  ข้อจำกัด: ตรวจด้วยกฎ — ความถูกต้องทางภาษาเชิงลึกยังต้องมีคนตรวจ (ดู docs/GRAMMAR_QA.md)
*/
const path = require('path');

const issues = [];
/* ข้อที่คนตรวจแล้วว่าถูก (กฎอัตโนมัติเตือนผิด) — ระบุเหตุผลทุกข้อ */
const REVIEWED_OK = {
  'legacy:tenses.quiz.advanced[7]': 'by this time next year + for 10 years -> มีแค่ will have been learning ที่ถูก (will learn/am learning ไม่เข้ากับ by…for)',
};
const add = (severity, where, code, msg) => { if (REVIEWED_OK[where] && severity === 'error') severity = 'reviewed'; issues.push({ severity, where, code, msg }); };

/* ---------------- ข้อความ / ยูนิโค้ด ---------------- */
const THAI_MARK = /[ัิ-ฺ็-๎]/;
function checkText(where, field, s, { required = true } = {}) {
  if (s === undefined || s === null || String(s).trim() === '') {
    if (required) add('error', where, 'missing_field', `${field} ว่าง`);
    return;
  }
  const t = String(s);
  if (/�/.test(t)) add('error', where, 'broken_unicode', `${field} มีอักขระเสีย (U+FFFD)`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‍﻿]/.test(t)) add('error', where, 'hidden_char', `${field} มีอักขระซ่อน/ควบคุม`);
  // สระ/วรรณยุกต์ไทยลอย (ไม่มีพยัญชนะนำหน้า)
  for (let i = 0; i < t.length; i++) {
    if (THAI_MARK.test(t[i])) {
      const prev = t[i - 1] || '';
      if (!/[ก-ฮัิ-ฺ็-๎]/.test(prev)) { add('error', where, 'thai_orphan_mark', `${field} มีสระ/วรรณยุกต์ลอยที่ตำแหน่ง ${i}`); break; }
    }
  }
  if (/[่-๋]{2,}/.test(t)) add('error', where, 'thai_double_tone', `${field} มีวรรณยุกต์ซ้อน`);
  if (/\s{3,}/.test(t.replace(/\n/g, ' '))) add('warn', where, 'spacing', `${field} มีช่องว่างติดกันหลายตัว`);
}

/* ---------------- ภาษาอังกฤษ: กฎที่ตรวจได้อัตโนมัติ ---------------- */
const BLANK = /_{2,}/;
const VOWEL_SOUND_EXCEPT_A = /^(hour|honest|honou?r|heir|herb)/i;          // ตัว h ไม่ออกเสียง -> an
const CONSONANT_SOUND_VOWEL = /^(uni|use|usu|euro|eu|one|once|ufo|ukulele|uranium|utensil|unique|uniform|union|united|university|utility)/i;
function articleFits(article, nextWord) {
  const w = String(nextWord || '').replace(/^[^A-Za-z]+/, '');
  if (!w) return true;
  const vowelLetter = /^[aeiou]/i.test(w);
  const vowelSound = (vowelLetter && !CONSONANT_SOUND_VOWEL.test(w)) || VOWEL_SOUND_EXCEPT_A.test(w) || /^[AEFHILMNORSX]$/.test(w) || /^(MBA|FBI|NBA|SOS|LED|MP3|X-ray|MRI|HR)\b/.test(w);
  return article.toLowerCase() === 'an' ? vowelSound : !vowelSound;
}
const VERB_AFTER = /^(is|are|was|were|am|has|have|had|do|does|did|can|will|would|should|must|goes|go|went)\b/i;
const stripQuotes = (s) => String(s).replace(/^["“]|["”]$/g, '').replace(/^"|"$/g, '');

/** แทนที่ช่องว่างด้วยคำตอบ แล้วตรวจกฎพื้นฐาน */
function checkFilled(where, question, answer) {
  if (!BLANK.test(question)) return;
  const q = stripQuotes(question.split(/\s+\(/)[0]);   // ตัดคำใบ้ภาษาไทยในวงเล็บท้ายประโยค
  const m = q.match(/(.*?)_{2,}\s*([A-Za-z'’-]+)?/);
  if (!m) return;
  const after = m[2] || '';
  const ans = String(answer).trim();
  const ansLow = ans.toLowerCase();
  if (/^(a|an)$/.test(ansLow) && after) {
    if (!articleFits(ansLow, after)) add('error', where, 'article_sound', `"${ans} ${after}" — a/an ไม่ตรงกับเสียงคำถัดไป`);
  }
  if (/^(a|an|the)$/.test(ansLow) && VERB_AFTER.test(after)) {
    add('error', where, 'article_before_verb', `"${ans} ${after} …" — article ต้องตามด้วยคำนาม ไม่ใช่กริยา`);
  }
  // คำตอบที่ไปซ้ำกับคำถัดไป เช่น "the the"
  if (after && after.toLowerCase() === ansLow.split(' ').pop()) add('warn', where, 'doubled_word', `คำซ้ำติดกันหลังเติม: "${ans} ${after}"`);
}

/* ตัวเลือกที่ถูกได้หลายข้อ (รูปแบบที่รู้จัก) */
const FUTURE_MARK = /\b(tomorrow|next (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)|tonight|this (evening|weekend|afternoon))\b/i;
const PROG = /^(am|is|are|'m|'s|'re)\s+\w+ing$/i;
const WILL = /^(will|'ll)\s+(?!\w+ing$)\w+$/i;   // will + กริยารูปฐาน (will building = ตัวลวงที่ผิดไวยากรณ์)
const GOING = /^(am|is|are)\s+going\s+to\s+\w+$/i;
const CONTRACT = [[/\bdoes not\b/g, "doesn't"], [/\bdo not\b/g, "don't"], [/\bdid not\b/g, "didn't"], [/\bis not\b/g, "isn't"], [/\bare not\b/g, "aren't"],
  [/\bwas not\b/g, "wasn't"], [/\bwere not\b/g, "weren't"], [/\bhave not\b/g, "haven't"], [/\bhas not\b/g, "hasn't"], [/\bwill not\b/g, "won't"],
  [/\bcannot\b/g, "can't"], [/\bcan not\b/g, "can't"], [/\bshould not\b/g, "shouldn't"], [/\bwould not\b/g, "wouldn't"], [/\bI am\b/g, "I'm"]];
const canon = (s) => { let t = String(s).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim(); CONTRACT.forEach(([re, v]) => { t = t.replace(re, v.toLowerCase()); }); return t; };
function checkChoices(where, question, choices, correctIndex) {
  if (!Array.isArray(choices) || choices.length < 2) { add('error', where, 'choices', 'ตัวเลือกน้อยกว่า 2'); return; }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) { add('error', where, 'correct_index', `correctIndex ${correctIndex} อยู่นอกช่วง`); return; }
  const seen = new Map();
  choices.forEach((c, i) => {
    checkText(where, `choice[${i}]`, c);
    const k = canon(c);
    if (seen.has(k)) add('error', where, 'duplicate_choice', `ตัวเลือก ${seen.get(k)} กับ ${i} เหมือนกัน (หรือต่างแค่การย่อคำ): "${c}"`);
    seen.set(k, i);
  });
  const q = String(question);
  const ans = String(choices[correctIndex]);
  // อนาคต: มีคำบอกเวลาอนาคต + ตัวเลือกมีทั้ง will และ present continuous/going to -> มักถูกได้หลายข้อ
  if (FUTURE_MARK.test(q) && BLANK.test(q)) {
    const kinds = choices.map((c) => (WILL.test(c.trim()) ? 'will' : PROG.test(c.trim()) ? 'prog' : GOING.test(c.trim()) ? 'going' : null)).filter(Boolean);
    if (new Set(kinds).size >= 2) add('error', where, 'multiple_future', `ตัวเลือกมีทั้ง ${[...new Set(kinds)].join(' / ')} กับคำบอกอนาคต — อาจถูกได้มากกว่าหนึ่งข้อ (เฉลย: ${ans})`);
  }
  // some/any ในประโยคคำถามเชิงเสนอ, much/a lot of ฯลฯ -> ให้คนตรวจ
  if (/\?\s*"?\s*$/.test(q) && choices.some((c) => /^some$/i.test(c)) && choices.some((c) => /^any$/i.test(c))) {
    add('warn', where, 'some_any_question', 'คำถามมีทั้ง some/any ในประโยคคำถาม — ตรวจว่าไม่ใช่การเสนอ/ขอ (some ก็ถูก)');
  }
  checkFilled(where, q, ans);
}

/* ---------------- 1) คลังเดิม ---------------- */
function auditLegacy() {
  const { GRAMMAR_CHAPTERS } = require(path.join(__dirname, '..', 'data', 'grammar'));
  const seenQ = new Map();
  let count = 0;
  for (const ch of GRAMMAR_CHAPTERS) {
    checkText(`legacy:${ch.id}`, 'title', ch.title);
    (ch.sections || []).forEach((s, si) => {
      checkText(`legacy:${ch.id}.sections[${si}]`, 'heading', s.heading);
      (s.examples || []).forEach((ex, ei) => { checkText(`legacy:${ch.id}.sections[${si}].examples[${ei}]`, 'en', ex.en); checkText(`legacy:${ch.id}.sections[${si}].examples[${ei}]`, 'th', ex.th, { required: false }); });
      (s.practice || []).forEach((p, pi) => {
        count += 1;
        const where = `legacy:${ch.id}.sections[${si}].practice[${pi}]`;
        checkText(where, 'prompt', p.prompt); checkText(where, 'explain', p.explain);
        checkChoices(where, p.prompt, p.choices, p.correctIndex);
      });
    });
    for (const [mode, list] of Object.entries(ch.quiz || {})) {
      list.forEach((q, qi) => {
        count += 1;
        const where = `legacy:${ch.id}.quiz.${mode}[${qi}]`;
        checkText(where, 'question', q.question); checkText(where, 'explain', q.explain);
        if (q.passage !== undefined) checkText(where, 'passage', q.passage);
        checkChoices(where, q.question, q.choices, q.correctIndex);
        if (q.explain && String(q.explain).trim().length < 8) add('warn', where, 'short_explain', 'คำอธิบายสั้นเกินไป');
        const key = `${canon(q.passage || '')}|${canon(q.question)}|${canon((q.choices || [])[q.correctIndex] || '')}`;
        if (seenQ.has(key)) add('warn', where, 'duplicate_question', `ซ้ำกับ ${seenQ.get(key)}`);
        else seenQ.set(key, where);
      });
    }
  }
  return count;
}

/* ---------------- 2) หลักสูตรใหม่ ---------------- */
function auditCurriculum() {
  let mod;
  try { mod = require(path.join(__dirname, '..', 'data', 'grammar-curriculum')); } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && String(err.message).includes('grammar-curriculum')) return 0;
    throw err;
  }
  const res = mod.validateCurriculum({ add, checkText, checkChoices, checkFilled, canon });
  return res.items;
}

function run() {
  issues.length = 0;
  const legacy = auditLegacy();
  const curriculum = auditCurriculum();
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  return { counts: { legacy, curriculum, errors: errors.length, warnings: warns.length }, issues: [...issues] };
}

module.exports = { run, canon, articleFits };

if (require.main === module) {
  const r = run();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); } else {
    console.log(`Grammar QA — คลังเดิม ${r.counts.legacy} ข้อ · หลักสูตรใหม่ ${r.counts.curriculum} ข้อ`);
    const byCode = {};
    r.issues.forEach((i) => { byCode[`${i.severity}:${i.code}`] = (byCode[`${i.severity}:${i.code}`] || 0) + 1; });
    Object.entries(byCode).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${v}`));
    r.issues.filter((i) => i.severity === 'error').slice(0, 80).forEach((i) => console.log(`  ✗ ${i.where} — ${i.msg}`));
    console.log(`errors ${r.counts.errors} · warnings ${r.counts.warnings}`);
  }
  process.exit(r.counts.errors ? 1 : 0);
}
