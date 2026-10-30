/*
  Part1QuestionValidator — ตรวจคุณภาพข้อ TOEIC-style Part 1 ก่อนเผยแพร่ (ใช้ทั้งตอน build และตอน import เข้า DB)

  errors   = ห้ามเผยแพร่ (qualityStatus = draft)
  warnings = ต้องมีคนตรวจ (qualityStatus = reviewNeeded)
  ผ่านทั้งหมด + ผ่าน visual review (review.passed) = verified · ผ่านแต่ยังไม่ได้ review = autoChecked

  สิ่งที่ตรวจ (ตามสเปก):
    image exists · audio exists · 4 statements exactly · one correct answer exactly · grammar (heuristic)
    audio ↔ transcript (contentHash ของเสียงต้องตรงกับข้อความ+ลำดับ+เสียงพูด) · A–D mapping ถูกต้อง
    Thai explanation exists · difficulty exists · skill tags exist · no duplicate statements · no duplicate image/question
    no obvious ambiguous answers (heuristics ด้านล่าง) · all assets accessible
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LETTERS = ['A', 'B', 'C', 'D'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const CATEGORIES = ['one-person', 'multi-person', 'no-person'];
const SKILLS = ['action', 'object', 'person', 'location', 'position', 'preposition', 'passive', 'presentContinuous',
  'presentPerfectPassive', 'state', 'quantity', 'spatial', 'inference'];
const DISTRACTOR_TYPES = ['wrongAction', 'wrongObject', 'wrongPersonNumber', 'wrongLocation', 'wrongPreposition',
  'similarSound', 'correctNounWrongAction', 'wrongState'];
const VOCAB_GROUPS = ['actions', 'people', 'objects', 'locations', 'prepositions', 'workplace', 'transportation', 'shopping',
  'restaurant', 'construction', 'office'];
const CLUE_KINDS = ['person', 'object', 'action', 'location'];

const PLURAL_SUBJ = /^(some|several|two|three|both|they|they're|many|the (?:chairs|tables|diners|workers|customers|boxes|cooks|shelves|bicycles|boats|umbrellas|people)|(?:chairs|tables|umbrellas|suitcases|boxes|people|pedestrians))\b/i;
const SINGULAR_SUBJ = /^(a|an|one|he|she|he's|she's|the (?:mechanic|car|train|bench|lamp|sofa|bookcase|cart|ladder|laptop|plant|bicycle))\b/i;
const PEOPLE_WORDS = /\b(people|person|man|men|woman|women|worker|workers|someone|customer|customers|diners|passengers|pedestrians|he|she|they)\b/i;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const words = (s) => String(s).toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && !['a', 'an', 'the', 'is', 'are', 'some', "he's", "she's", "they're"].includes(w));
function jaccard(a, b) {
  const A = new Set(words(a)); const B = new Set(words(b));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
}

/** เสียงของ variant หนึ่ง: hash จาก (ข้อความตามลำดับ + เสียงพูด + เวอร์ชันตัวสร้าง) — ข้อความไม่เปลี่ยน = ไม่สร้างเสียงใหม่ */
function audioContentHash({ texts, voice, speed, generationVersion, leadIn }) {
  return sha1(JSON.stringify({ texts, voice, speed, generationVersion, leadIn })).slice(0, 16);
}

/** grammar heuristics (ไม่ใช่ตัวตรวจไวยากรณ์เต็ม — จับข้อผิดพลาดที่พบบ่อยในการเขียนโจทย์) */
function grammarIssues(text) {
  const out = [];
  if (!/^[A-Z]/.test(text)) out.push('ต้องขึ้นต้นด้วยตัวพิมพ์ใหญ่');
  if (!/\.$/.test(text)) out.push('ต้องจบด้วยจุด');
  if (/\s{2,}|\s[.,]/.test(text)) out.push('เว้นวรรคผิด');
  if (/\b(a) [aeiou]/i.test(text) && !/\b(a) (uniform|university|one|european)/i.test(text)) out.push('ใช้ a หน้าเสียงสระ (ควรเป็น an)');
  if (/\ban [bcdfgjklmnpqrstvwxyz]/i.test(text) && !/\ban (hour|honest)/i.test(text)) out.push('ใช้ an หน้าพยัญชนะ');
  const uncountable = /^some (food|water|equipment|furniture|merchandise|luggage|paper|produce|fruit|work|information|lumber|machinery)\b/i.test(text);
  if (PLURAL_SUBJ.test(text) && !uncountable && /^\S+(?:\s\S+){0,3}\s(is|has)\s/i.test(text) && !/^(both|they|two|three)\b/i.test(text)) {
    const subj = text.split(/\s(is|are|has|have)\s/)[0];
    if (!/\bof\b/i.test(subj) && /\s(is|has)\s/.test(text.slice(0, subj.length + 5))) out.push('ประธานพหูพจน์ใช้กับ is/has');
  }
  if (SINGULAR_SUBJ.test(text) && /^\S+(?:\s\S+){0,2}\s(are|have)\s/i.test(text) && !/^one of/i.test(text)) out.push('ประธานเอกพจน์ใช้กับ are/have');
  if (/\b(is|are) being \w+ing\b/i.test(text)) out.push('is being + V-ing ผิดรูป');
  return out;
}

/**
 * ตรวจหนึ่งข้อ
 * @param q   ข้อในรูปแบบ bank (ดู scripts/toeic/build-part1.js)
 * @param ctx { publicDir, checkFiles, seenStatements:Map, seenImages:Map, seenIds:Set }
 */
function validateQuestion(q, ctx = {}) {
  const errors = []; const warnings = [];
  const E = (m) => errors.push(m); const W = (m) => warnings.push(m);
  if (!/^P1-\d{4}$/.test(q.id || '')) E('id ไม่ถูกรูปแบบ P1-0000');
  if (ctx.seenIds) { if (ctx.seenIds.has(q.id)) E(`id ซ้ำ ${q.id}`); ctx.seenIds.add(q.id); }
  if (q.part !== 1 || q.type !== 'photograph') E('part/type ต้องเป็น 1/photograph');
  if (!DIFFICULTIES.includes(q.difficulty)) E('difficulty ไม่ถูกต้อง');
  if (!CATEGORIES.includes(q.category)) E('category ไม่ถูกต้อง');
  if (!Array.isArray(q.skills) || !q.skills.length) E('ไม่มี skill tags');
  (q.skills || []).forEach((s) => { if (!SKILLS.includes(s)) E(`skill ไม่รู้จัก: ${s}`); });
  if (!q.imageAsset) E('ไม่มี imageAsset');
  if (!q.imageAlt || q.imageAlt.length < 20) E('imageAlt สั้นเกินไป (ต้องใช้กับ accessibility/review)');

  // ---- statements ----
  const st = q.statements || [];
  if (st.length !== 4) E(`ต้องมี 4 statements พอดี (มี ${st.length})`);
  const correct = st.filter((s) => s.isCorrect);
  if (correct.length !== 1) E(`ต้องมีคำตอบถูก 1 ข้อพอดี (มี ${correct.length})`);
  const texts = st.map((s) => s.text);
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) E('มี statement ซ้ำกันในข้อ');
  st.forEach((s, i) => {
    const tag = `statement #${i + 1}`;
    if (!s.text) E(`${tag}: ไม่มีข้อความ`);
    grammarIssues(s.text || '').forEach((g) => E(`${tag} "${s.text}": ${g}`));
    if (!s.translationTH) E(`${tag}: ไม่มีคำแปลไทย`);
    if (!s.explanationTH || s.explanationTH.length < 10) E(`${tag}: ไม่มีคำอธิบายภาษาไทย`);
    if (!s.isCorrect && !DISTRACTOR_TYPES.includes(s.distractorType)) E(`${tag}: ตัวลวงต้องมี distractorType ที่ถูกต้อง`);
    if (s.isCorrect && s.distractorType) E(`${tag}: ข้อถูกต้องไม่มี distractorType`);
    if ((s.text || '').split(/\s+/).length > 14) W(`${tag}: ประโยคยาวเกิน 14 คำ (Part 1 ควรสั้น)`);
    // คำตอบที่ถูกซ้ำกับคำตอบที่ถูกของอีกข้อ = เสี่ยงเป็นข้อซ้ำ (ตัวลวงใช้วลีเดียวกันได้ เป็นเรื่องปกติของ Part 1)
    if (ctx.seenStatements && s.isCorrect) {
      const k = (s.text || '').toLowerCase();
      if (ctx.seenStatements.has(k) && ctx.seenStatements.get(k) !== q.id) W(`${tag}: คำตอบซ้ำกับคำตอบของข้อ ${ctx.seenStatements.get(k)}`);
      else ctx.seenStatements.set(k, q.id);
    }
  });

  // ---- ambiguity heuristics (กันคำตอบถูก 2 ข้อ) ----
  const c = correct[0];
  if (c) {
    st.filter((s) => !s.isCorrect).forEach((s) => {
      const j = jaccard(s.text, c.text);
      if (j >= 0.75) E(`ตัวลวง "${s.text}" ใกล้เคียงคำตอบเกินไป (overlap ${j.toFixed(2)}) — เสี่ยงถูก 2 ข้อ`);
      else if (j >= 0.5) W(`ตัวลวง "${s.text}" คล้ายคำตอบ (overlap ${j.toFixed(2)}) — ตรวจด้วยตาอีกครั้ง`);
    });
    if (q.category === 'no-person') {
      if (/\b(is|are) being\b/i.test(c.text)) E('ภาพไม่มีคน แต่คำตอบใช้ is/are being + V3 (ต้องมีคนกำลังทำ)');
      if (PEOPLE_WORDS.test(c.text)) E('ภาพไม่มีคน แต่คำตอบพูดถึงคน');
    }
    if (q.category === 'one-person' && /^(some people|they|two|both|several)\b/i.test(c.text)) E('ภาพคนเดียว แต่คำตอบพูดถึงหลายคน');
  }

  // ---- photo analysis / explanation ----
  const ph = q.photoAnalysis || {};
  ['people', 'objects', 'actions', 'positions', 'scene'].forEach((k) => { if (!ph[k]) E(`photoAnalysis.${k} ว่าง`); });
  if (!q.explanationTH) E('ไม่มีคำอธิบาย Why');
  if (!q.tipTH) W('ไม่มี Listening Tip');
  (q.vocabulary || []).forEach((v, i) => {
    if (!v.word || !v.th || !v.pos || !v.ipa || !v.example) E(`vocab #${i + 1} ข้อมูลไม่ครบ`);
    if (!VOCAB_GROUPS.includes(v.group)) E(`vocab #${i + 1} group ไม่รู้จัก: ${v.group}`);
  });
  if (!(q.vocabulary || []).length) W('ไม่มี Key Vocabulary');
  (q.imageClues || []).forEach((cl, i) => {
    const [x, y, w, h] = cl.box || [];
    if (![x, y, w, h].every((n) => typeof n === 'number' && n >= 0 && n <= 100) || x + w > 100.5 || y + h > 100.5) E(`clue #${i + 1} กรอบอยู่นอกภาพ`);
    if (!CLUE_KINDS.includes(cl.kind)) E(`clue #${i + 1} kind ไม่ถูกต้อง`);
  });

  // ---- variants: A–D mapping + audio ----
  const vs = q.variants || [];
  if (!vs.length) E('ไม่มี audio variant');
  vs.forEach((v, vi) => {
    const tag = `variant v${vi}`;
    const ord = v.order || [];
    if (ord.length !== 4 || [...ord].sort().join() !== '0,1,2,3') E(`${tag}: order ต้องเป็น permutation ของ 0..3`);
    const ci = st.findIndex((s) => s.isCorrect);
    if (LETTERS[ord.indexOf(ci)] !== v.correctOption) E(`${tag}: correctOption (${v.correctOption}) ไม่ตรงกับลำดับเสียง`);
    const a = v.audio;
    if (!a) { E(`${tag}: ยังไม่มีไฟล์เสียง`); return; }
    const expect = audioContentHash({ texts: ord.map((i) => (st[i] ? st[i].text : null)), voice: a.voice, speed: a.speed, generationVersion: a.generationVersion, leadIn: a.leadIn });
    if (a.contentHash !== expect) E(`${tag}: เสียงไม่ตรงกับ transcript ปัจจุบัน (contentHash ไม่ตรง) — ต้องสร้างเสียงใหม่`);
    if (!(a.duration > 4 && a.duration < 40)) E(`${tag}: ความยาวเสียงผิดปกติ (${a.duration}s)`);
    if (!Array.isArray(a.segments) || a.segments.map((s) => s.letter).join('') !== 'ABCD') E(`${tag}: segments A–D ไม่ครบ/ไม่เรียง`);
    else {
      a.segments.forEach((s, i) => { if (!(s.end > s.start) || (i && s.start < a.segments[i - 1].end)) E(`${tag}: เวลา segment ${s.letter} ผิด`); });
      // ความยาวเสียงต่อคำต้องสมเหตุสมผล (จับเสียงที่ขาด/วนซ้ำ/อ่านผิดยาวผิดปกติ) — ตัด "A." + ช่วงเว้นออกก่อน
      a.segments.forEach((s, i) => {
        const text = st[ord[i]] && st[ord[i]].text;
        if (!text) return;
        const perWord = (s.end - s.start - 0.55) / text.split(/\s+/).length;
        if (perWord < 0.15 || perWord > 1.0) W(`${tag}: ความเร็วเสียงตัวเลือก ${s.letter} ผิดปกติ (${perWord.toFixed(2)} วิ/คำ) — ฟังตรวจอีกครั้ง`);
      });
    }
    if (ctx.checkFiles && ctx.publicDir) {
      const f = path.join(ctx.publicDir, a.url.replace(/^\//, ''));
      if (!fs.existsSync(f) || fs.statSync(f).size < 2000) E(`${tag}: ไม่พบไฟล์เสียง ${a.url}`);
    }
  });

  if (ctx.checkFiles && ctx.publicDir && q.imageAsset) {
    ['url', 'urlSmall'].forEach((k) => {
      const f = path.join(ctx.publicDir, String(q.imageAsset[k] || '').replace(/^\//, ''));
      if (!q.imageAsset[k] || !fs.existsSync(f) || fs.statSync(f).size < 5000) E(`ไม่พบไฟล์ภาพ ${q.imageAsset[k]}`);
      else if (k === 'url' && ctx.seenImages) {
        const h = sha1(fs.readFileSync(f));
        if (ctx.seenImages.has(h)) E(`ภาพซ้ำกับข้อ ${ctx.seenImages.get(h)}`); else ctx.seenImages.set(h, q.id);
      }
    });
    if (q.imageAsset.qa && q.imageAsset.qa.ok === false) E('ภาพไม่ผ่านเกณฑ์คุณภาพ (ความละเอียด/ความสว่าง/ความคม)');
  }

  // คำเตือนที่ผู้ตรวจดูภาพแล้วยืนยันว่าไม่กำกวม (review.acknowledged = คำสำคัญในข้อความเตือน) ไม่ขวางการ verify
  const ack = (q.review && q.review.acknowledged) || [];
  const acknowledged = warnings.filter((w) => ack.some((a) => w.includes(a)));
  const open = warnings.filter((w) => !acknowledged.includes(w));
  let status = 'autoChecked';
  if (errors.length) status = 'draft';
  else if (open.length || (q.review && q.review.passed === false)) status = 'reviewNeeded';
  else if (q.review && q.review.passed === true) status = 'verified';
  return { id: q.id, errors, warnings: open, acknowledged, status };
}

function validateBank(questions, opts = {}) {
  const ctx = { ...opts, seenStatements: new Map(), seenImages: new Map(), seenIds: new Set() };
  return questions.map((q) => validateQuestion(q, ctx));
}

module.exports = {
  validateQuestion, validateBank, audioContentHash, grammarIssues, jaccard,
  LETTERS, SKILLS, DISTRACTOR_TYPES, VOCAB_GROUPS, DIFFICULTIES, CATEGORIES,
};
