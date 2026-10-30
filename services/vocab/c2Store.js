/*
  คลัง C2 ในหน่วยความจำ — อ่านจาก vocab_senses (cefr='C2') ครั้งเดียว แล้ว cache
  เฉพาะ sense ที่ผ่าน validator (autoChecked) หรือคนตรวจแล้ว (reviewed) — unverified ไม่ถูกใช้สร้างโจทย์
  ข้อมูลเดียวกับ wordStore (public_id เดียวกัน) แต่มีเนื้อหาเต็ม (c2 JSONB) สำหรับสร้างบทเรียน/แบบฝึก
*/
const pool = require('../../config/db');
const { C2_READY } = require('../../utils/wordStore');

let cache = null; let loading = null;

async function load() {
  const { rows } = await pool.query(
    `SELECT s.public_id AS id, s.id AS sense_id, s.entry_id, e.headword, s.display_form, s.pos, s.kind, s.register,
            s.connotation, s.tier, s.real_world_priority AS priority, s.frequency_band, s.variant, s.difficulty,
            s.thai_meaning, s.ipa, s.example_sentence AS example, s.example_translation AS example_th,
            s.synonyms, s.antonyms, s.collocations, s.topic, s.tags, s.c2, s.base_sense_id, s.verification_status
       FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
      WHERE s.cefr = 'C2' AND s.public_id IS NOT NULL AND s.verification_status = ANY($1)
      ORDER BY s.display_order`, [C2_READY]);
  const byId = new Map();
  for (const r of rows) {
    const c = r.c2 || {};
    byId.set(r.id, {
      id: r.id, senseId: r.sense_id, entryId: r.entry_id, headword: r.headword,
      form: r.display_form || r.headword, lemma: c.lemma || r.headword, pos: r.pos, kind: r.kind,
      register: r.register, connotation: r.connotation, tier: r.tier, priority: r.priority, variant: r.variant,
      difficulty: r.difficulty, short: r.thai_meaning, ipa: r.ipa, example: r.example, exampleTH: r.example_th,
      synonyms: r.synonyms || [], antonyms: r.antonyms || [], collocations: r.collocations || [],
      topics: c.topics || (r.topic ? [r.topic] : []), baseSenseId: r.base_sense_id, status: r.verification_status,
      meaningEN: c.meaningEN, meaningTH: c.meaningTH, usageNoteTH: c.usageNoteTH, baseLemma: c.baseLemma,
      baseMeaningTH: c.baseMeaningTH, ipaUK: c.ipaUK, ipaUS: c.ipaUS, nearSynonyms: c.nearSynonyms || [],
      wordFamily: c.wordFamily || [], commonMistakes: c.commonMistakes || [], confusedWith: c.confusedWith || [],
      context: c.context || null, literalTH: c.literalTH, naturalTH: c.naturalTH, unnaturalTH: c.unnaturalTH,
      separable: c.separable, q: c.q || {},
    });
  }
  cache = { byId, list: [...byId.values()], loadedAt: Date.now() };
  return cache;
}

async function ready() {
  if (cache) return cache;
  if (!loading) loading = load().finally(() => { loading = null; });
  return loading;
}
function reload() { cache = null; return ready(); }
const get = (id) => (cache ? cache.byId.get(id) || null : null);
const all = () => (cache ? cache.list : []);

module.exports = { ready, reload, get, all };
