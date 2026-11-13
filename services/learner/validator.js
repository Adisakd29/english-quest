/*
  ตรวจเนื้อหาคำศัพท์ระดับผู้เรียน (A1–C1) — data/vocab-learner/out/batch-*.json (batch 01–24 = A1–B1 · 25+ = B2–C1)
  ใช้ทั้งตอนเขียน (scripts/learner/validate.js) ตอน migration (061) และในชุดทดสอบ
  คืน { errors: [], warnings: [] } — errors = ห้ามนำไปใช้ · warnings = ให้คนตรวจดู
*/
const FUNCTION_POS = new Set(['pronoun', 'preposition', 'conjunction', 'determiner', 'exclamation', 'number',
  'modal verb', 'auxiliary verb', 'indefinite article', 'definite article', 'infinitive marker']);
const LIMITS = {
  A1: { def: 12, exMin: 5, exMax: 10 },
  A2: { def: 12, exMin: 6, exMax: 13 },
  B1: { def: 16, exMin: 7, exMax: 16 },
  B2: { def: 18, exMin: 8, exMax: 20 },   // v1.10.0 B2–C1
  C1: { def: 20, exMin: 8, exMax: 22 },
};
const THAI = /[฀-๿]/;
const words = (s) => String(s).trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** จำนวนครั้งที่ form ปรากฏเป็นคำเต็ม (ตรงตัวพิมพ์) */
function countForm(sentence, form) {
  if (!form) return 0;
  const re = new RegExp(`(^|[^A-Za-z'’-])${esc(form)}(?=$|[^A-Za-z'’-])`, 'g');
  return (String(sentence).match(re) || []).length;
}

/** คำในความหมายที่ "เฉลยตัวเอง" — มีตัวคำ/รากคำอยู่ */
function givesAway(headword, text) {
  const heads = String(headword).toLowerCase().split(/[,\s]+/).filter((h) => h.length >= 3);
  const toks = String(text).toLowerCase().split(/[^a-z]+/);
  return heads.some((h) => {
    const stem = h.length > 5 ? h.slice(0, h.length - 2) : h;
    return toks.some((t) => t === h || (stem.length >= 4 && t.startsWith(stem)));
  });
}

function validateItem(it, src, idx) {
  const errors = [];
  const warnings = [];
  const at = `#${idx} ${src ? src.id : (it && it.id)}`;
  const e = (m) => errors.push(`${at}: ${m}`);
  const w = (m) => warnings.push(`${at}: ${m}`);
  if (!it || typeof it !== 'object') { e('ไม่ใช่ object'); return { errors, warnings }; }
  if (src) {
    if (it.id !== src.id) e(`id ไม่ตรงกับ input (${it.id})`);
    if (it.headword !== src.headword) e('headword ไม่ตรงกับ input');
    if (it.pos !== src.pos) e('pos ไม่ตรงกับ input');
  }
  const lv = LIMITS[(src && src.cefr) || String(it.id || '').slice(0, 2)] || LIMITS.B1;
  const str = (k, req = true) => {
    if (it[k] == null || it[k] === '') { if (req) e(`ไม่มี ${k}`); return false; }
    if (typeof it[k] !== 'string') { e(`${k} ต้องเป็นข้อความ`); return false; }
    return true;
  };
  const isFn = FUNCTION_POS.has(it.pos);

  if (str('meaningEN')) {
    const n = words(it.meaningEN).length;
    if (n > lv.def) e(`meaningEN ยาว ${n} คำ (เกิน ${lv.def})`);
    if (n < 2) e('meaningEN สั้นเกินไป');
    if (THAI.test(it.meaningEN)) e('meaningEN มีภาษาไทย');
    if (!isFn && givesAway(it.headword, it.meaningEN)) e('meaningEN มีตัวคำ/รากคำอยู่ (เฉลยตัวเอง)');
  }
  if (str('thai')) {
    if (!THAI.test(it.thai)) e('thai ไม่มีอักษรไทย');
    if (it.thai.length > 120) e('thai ยาวเกิน 120 ตัวอักษร');
  }
  if (str('shortTH')) {
    if (!THAI.test(it.shortTH)) e('shortTH ไม่มีอักษรไทย');
    if ([...it.shortTH].length > 30) e(`shortTH ยาว ${[...it.shortTH].length} ตัวอักษร (เกิน 30)`);
  }
  if (typeof it.thaiChanged !== 'boolean') e('thaiChanged ต้องเป็น true/false');
  else if (src) {
    const changed = (it.thai || '') !== (src.currentThai || '');
    if (changed !== it.thaiChanged) e(`thaiChanged=${it.thaiChanged} แต่ thai ${changed ? 'ต่างจาก' : 'เหมือน'} currentThai`);
    if (it.thaiChanged && !(typeof it.thaiChangeReason === 'string' && THAI.test(it.thaiChangeReason))) e('เปลี่ยน thai แล้วต้องมี thaiChangeReason (ภาษาไทย)');
  }
  if (str('example')) {
    const n = words(it.example).length;
    if (n < lv.exMin || n > lv.exMax) e(`example ยาว ${n} คำ (ต้อง ${lv.exMin}–${lv.exMax})`);
    if (!/^[A-Z"'‘“0-9]/.test(it.example)) e('example ต้องขึ้นต้นด้วยตัวใหญ่');
    if (!/[.?!]["'’”]?$/.test(it.example)) e('example ต้องลงท้ายด้วย . ? หรือ !');
    if (THAI.test(it.example)) e('example มีภาษาไทย');
    if (/ {2}|\s[,.?!]/.test(it.example)) w('example มีช่องว่างแปลก');
  }
  if (str('form') && it.example) {
    const c = countForm(it.example, it.form);
    if (c !== 1) e(`form "${it.form}" ปรากฏใน example ${c} ครั้ง (ต้อง 1)`);
    const h = String(it.headword).toLowerCase().split(/[,\s]+/)[0];
    const f = it.form.toLowerCase();
    if (!isFn && h.length >= 2 && f[0] !== h[0] && !['be', 'go', 'is'].includes(h)) w(`form "${it.form}" ดูไม่ใช่รูปของ "${it.headword}" (กริยาผิดรูป? ตรวจด้วยตา)`);
  }
  if (str('exampleTH')) {
    if (!THAI.test(it.exampleTH)) e('exampleTH ไม่มีอักษรไทย');
    const latin = (it.exampleTH.match(/[A-Za-z]/g) || []).length;
    if (latin > it.exampleTH.length * 0.3) w('exampleTH มีอักษรอังกฤษมาก');
  }
  if (!Array.isArray(it.collocations) || it.collocations.length < 2 || it.collocations.length > 3) e('collocations ต้องมี 2–3 รายการ');
  else {
    it.collocations.forEach((c) => {
      if (typeof c !== 'string' || !c.trim()) e('collocation ว่าง');
      else if (THAI.test(c)) e(`collocation มีภาษาไทย: ${c}`);
      else if (c.trim().split(/\s+/).length < 2) w(`collocation คำเดียว: ${c}`);
    });
    if (new Set(it.collocations.map((c) => String(c).toLowerCase())).size !== it.collocations.length) e('collocations ซ้ำกัน');
  }
  if (typeof it.functionWord !== 'boolean') e('functionWord ต้องเป็น true/false');
  else if (it.functionWord !== isFn) e(`functionWord=${it.functionWord} ไม่ตรงกับ pos "${it.pos}"`);
  if (typeof it.gapOk !== 'boolean') e('gapOk ต้องเป็น true/false');
  if (it.noteTH != null) {
    if (typeof it.noteTH !== 'string' || !THAI.test(it.noteTH)) e('noteTH ต้องเป็นข้อความไทยหรือ null');
    else if ([...it.noteTH].length > 100) e('noteTH ยาวเกิน 100 ตัวอักษร');
  }
  return { errors, warnings };
}

/** ตรวจทั้งไฟล์ (เทียบ input ถ้ามี) + ตัวอย่างซ้ำภายใน/ข้ามไฟล์ (seen: Map ตัวอย่าง → id) */
function validateBatch(items, input, seen = new Map()) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) return { errors: ['ไฟล์ต้องเป็น JSON array'], warnings };
  if (input && items.length !== input.length) errors.push(`จำนวนรายการ ${items.length} ≠ input ${input.length}`);
  items.forEach((it, i) => {
    const r = validateItem(it, input ? input[i] : null, i);
    errors.push(...r.errors); warnings.push(...r.warnings);
    if (it && typeof it.example === 'string') {
      const key = it.example.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (seen.has(key) && seen.get(key) !== it.id) errors.push(`#${i} ${it.id}: example ซ้ำกับ ${seen.get(key)}`);
      else seen.set(key, it.id);
    }
  });
  return { errors, warnings };
}

module.exports = { validateItem, validateBatch, countForm, givesAway, FUNCTION_POS, LIMITS };
