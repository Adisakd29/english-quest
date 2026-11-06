/*
  Word Atlas — Vocabulary Validator (PART 19)
  ตรวจทุกความหมายก่อนนำเข้า (seed.js) และใช้ตรวจย้อนหลังทั้งคลัง (auditDb)
  ความหมายที่ไม่ผ่าน "ข้อผิดพลาด" (error) → learnable = FALSE (ไม่ใช้ทำแบบฝึกที่ให้คะแนน) · "คำเตือน" (warning) แค่บันทึกไว้
*/
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'exclamation',
  'number', 'modal verb', 'auxiliary verb', 'indefinite article', 'definite article', 'infinitive marker', 'phrasal verb', 'idiom',
  'phrase', 'collocation', 'fixed expression', 'discourse marker', 'particle', 'contraction']);
const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const STATUS = new Set(['reviewed', 'autoChecked', 'unverified', 'rejected']);
const SENSITIVE_LABELS = new Set(['vulgar', 'offensive', 'derogatory', 'slur', 'sexual', 'profanity']);
const TH = /[฀-๿]/;
const LATIN = /[A-Za-z]/;
const BAD = /[{}[\]<>|\\]|https?:/;
const WORD_FORM = /^[a-z(][a-z0-9'’()\-,./ ]*[a-z)?!]$|^[a-z]$/i;
const AUDIO = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[\w%./()\-,']+\.(mp3|ogg|oga|wav)$/i;

/**
 * @param {object} s  แถวความหมาย (รูปเดียวกับคอลัมน์ atlas_senses) + lemma
 * @returns {{errors:string[], warnings:string[]}}
 */
function validateSense(s) {
  const errors = []; const warnings = [];
  const lemma = String(s.lemma || '');
  if (!lemma || !WORD_FORM.test(lemma) || lemma.length > 60) errors.push('invalid_word_form');
  if (s.pos && !POS.has(s.pos)) errors.push('invalid_pos');
  if (!s.pos) warnings.push('missing_pos');
  if (!s.oxford_sense_id && !s.definition_en) errors.push('missing_meaning');
  if (s.definition_en && (BAD.test(s.definition_en) || s.definition_en.length > 300)) errors.push('invalid_definition');
  const thai = s.thai || [];
  for (const t of thai) {
    if (!TH.test(t)) errors.push('thai_not_thai');
    else if (!s.oxford_sense_id && LATIN.test(t)) errors.push('thai_has_latin');
    if (t.length > 120 || BAD.test(t)) errors.push('thai_invalid_chars');
  }
  if (new Set(thai).size !== thai.length) warnings.push('thai_duplicate');
  if (s.learnable && !thai.length) errors.push('learnable_without_thai');
  // CEFR ต้องมาจากแหล่งที่ตรวจได้ (Oxford) เท่านั้น — ความหมายใหม่ห้ามมีระดับ
  if (s.cefr && !CEFR.has(s.cefr)) errors.push('invalid_cefr');
  if (s.cefr && !s.oxford_sense_id) errors.push('cefr_without_verified_source');
  if (!s.source || !s.license) errors.push('missing_source_license');
  if (!STATUS.has(s.verification_status)) errors.push('invalid_status');
  if (s.learnable && !['reviewed', 'autoChecked'].includes(s.verification_status)) errors.push('learnable_unverified');
  if ((s.labels || []).some((l) => SENSITIVE_LABELS.has(l))) errors.push('sensitive_usage');
  for (const k of ['audio_uk', 'audio_us']) if (s[k] && !AUDIO.test(s[k])) errors.push('broken_audio_url');
  if (!s.ipa_uk && !s.ipa_us) warnings.push('missing_pronunciation');
  for (const ex of s.examples || []) {
    const en = typeof ex === 'string' ? ex : ex && ex.en;
    const words = String(en || '').split(/\s+/).filter(Boolean).length;
    if (!en || BAD.test(en) || TH.test(en) || words < 3 || words > 40) { errors.push('unnatural_example'); break; }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** ตรวจซ้ำในชุดความหมายของ lemma เดียวกัน (Duplicate Senses) */
function duplicateSenses(rows) {
  const seen = new Map(); const dups = [];
  for (const r of rows) {
    const k = `${r.pos}|${String(r.definition_en || r.oxford_sense_id || '').toLowerCase().replace(/\W+/g, ' ').trim()}`;
    if (seen.has(k)) dups.push([seen.get(k), r.id]); else seen.set(k, r.id);
  }
  return dups;
}

/** ตรวจทั้งคลังใน DB — รายงานสรุป (ใช้ในชุดทดสอบ/หน้าผู้ดูแล) */
async function auditDb(pool, { limit = 200000 } = {}) {
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
  const [dupLemma] = await q('SELECT count(*)::int AS n FROM (SELECT lower(lemma) FROM atlas_lemmas GROUP BY 1 HAVING count(*) > 1) x');
  const [dupOx] = await q('SELECT count(*)::int AS n FROM (SELECT oxford_sense_id FROM atlas_senses WHERE oxford_sense_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x');
  const [brokenOx] = await q(`SELECT count(*)::int AS n FROM atlas_senses a WHERE a.oxford_sense_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vocab_senses v WHERE v.public_id = a.oxford_sense_id)`);
  const rows = await q(`SELECT s.*, l.lemma FROM atlas_senses s JOIN atlas_lemmas l ON l.id = s.lemma_id ORDER BY s.id LIMIT $1`, [limit]);
  const counts = {}; const warn = {}; const learnableErrors = [];
  const byLemma = new Map();
  for (const r of rows) {
    const v = validateSense(r);
    v.errors.forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
    v.warnings.forEach((e) => { warn[e] = (warn[e] || 0) + 1; });
    if (r.learnable && v.errors.length) learnableErrors.push({ id: r.id, errors: v.errors });
    if (!byLemma.has(r.lemma_id)) byLemma.set(r.lemma_id, []);
    byLemma.get(r.lemma_id).push(r);
  }
  let dupSenses = 0;
  for (const list of byLemma.values()) dupSenses += duplicateSenses(list).length;
  return {
    checked: rows.length, duplicateLemmas: dupLemma.n, duplicateOxfordLinks: dupOx.n, brokenOxfordLinks: brokenOx.n,
    duplicateSenses: dupSenses, errors: counts, warnings: warn, learnableWithErrors: learnableErrors.length, sample: learnableErrors.slice(0, 20),
  };
}

module.exports = { validateSense, duplicateSenses, auditDb, POS, CEFR };
