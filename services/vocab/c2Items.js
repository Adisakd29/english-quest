/*
  สร้างโจทย์ C2 จาก "sense" หนึ่งตัว — ฝั่งเซิร์ฟเวอร์เท่านั้น
  - โจทย์ทุกข้อสร้างซ้ำได้แบบ deterministic จาก (sense, ชนิด, seed) → ไม่ต้องเก็บเฉลยใน DB
    หน้าเว็บได้แค่ตัวเลือก (ไม่มีเฉลย) · ตรวจคำตอบด้วยการสร้างข้อเดิมอีกครั้งแล้วเทียบ index
  - ข้อ "เดาความหมาย" ใช้ตัวลวงจาก sense อื่นในคลัง แต่กรองตัวที่อาจถูกได้ด้วย (synonym / near-synonym /
    ความหมายไทยใกล้กัน) — กันโจทย์ที่มีคำตอบถูกได้มากกว่าหนึ่งข้อ
  - ชนิดคำถาม (facet ใช้วิเคราะห์จุดอ่อน):
      meaning   คำ → ความหมาย (ไทย)                facet meaning | sense (ความหมายขั้นสูงของคำคุ้นเคย)
      reverse   ความหมาย → คำ/วลี                  facet meaning | phrase
      context   เดาความหมายจากบริบท (Context Guessing) facet sense
      colloc    เติม collocation ให้เป็นธรรมชาติ        facet collocation
      nearsyn   เลือกคำที่ "แม่นที่สุด" ในบริบท (Precision / Near-synonym) facet precision
      register  เลือกประโยคที่เหมาะกับสถานการณ์          facet register
      connot    ความหมายแฝง (บวก/กลาง/ลบ)            facet connotation
      idiom     ใช้สำนวนในสถานการณ์ไหนเป็นธรรมชาติ        facet phrase
      form      Word Formation (รูปคำ) แบบเลือก        facet form
      formtype  Word Formation แบบพิมพ์เอง — รับคำตอบที่ถูกได้หลายแบบ (accepted[]) facet form
      mistake   เลือกประโยคที่ถูก (common mistakes)    facet usage
*/
const S = require('./c2Store');
const { sameAnswer, nearMiss } = require('../grammar/check');

const TYPES = ['meaning', 'reverse', 'context', 'colloc', 'nearsyn', 'register', 'connot', 'idiom', 'form', 'formtype', 'mistake'];
const TYPE_TH = {
  meaning: 'ความหมาย', reverse: 'เลือกคำให้ตรงความหมาย', context: 'เดาความหมายจากบริบท', colloc: 'Collocation',
  nearsyn: 'คำไหนแม่นที่สุด', register: 'ระดับภาษา (Register)', connot: 'ความหมายแฝง', idiom: 'ใช้สำนวนให้ถูกสถานการณ์',
  form: 'รูปคำ (Word Formation)', formtype: 'พิมพ์รูปคำที่ถูก', mistake: 'ประโยคไหนถูก',
};

function seededShuffle(arr, seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const lc = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").trim();
const isPhrase = (s) => ['phrasal', 'idiom', 'fixed', 'colloquial', 'collocation'].includes(s.kind);

// ความคล้ายของข้อความไทย (bigram) — ใช้กันตัวลวงที่ความหมายใกล้เฉลยเกินไป
function bigrams(s) { const t = String(s || '').replace(/[\s/(),.]/g, ''); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
function thaiSimilar(a, b) {
  const A = bigrams(a); const B = bigrams(b);
  if (!A.size || !B.size) return false;
  let n = 0; for (const x of A) if (B.has(x)) n += 1;
  return n / Math.min(A.size, B.size) >= 0.5;
}
// สอง sense "อาจถูกแทนกันได้" → ห้ามเป็นตัวลวงของกันและกัน
function overlaps(a, b) {
  if (a.id === b.id || a.entryId === b.entryId) return true;
  const la = lc(a.lemma); const lb = lc(b.lemma);
  const relA = new Set([...a.synonyms, ...a.nearSynonyms.map((n) => n.word), ...a.confusedWith].map(lc));
  const relB = new Set([...b.synonyms, ...b.nearSynonyms.map((n) => n.word), ...b.confusedWith].map(lc));
  if (relA.has(lb) || relB.has(la)) return true;
  if (thaiSimilar(a.short, b.short)) return true;
  return false;
}

/** ตัวลวงจากคลัง: ชนิดเดียวกันก่อน (คำ/วลี, pos) แล้วค่อยขยาย — กรอง overlaps */
function poolDistractors(target, n, seed, { field = 'short' } = {}) {
  const all = S.all().filter((x) => !overlaps(target, x) && x[field]);
  const samePos = all.filter((x) => x.pos === target.pos);
  const sameGroup = all.filter((x) => isPhrase(x) === isPhrase(target) && x.pos !== target.pos);
  const rest = all.filter((x) => isPhrase(x) !== isPhrase(target));
  const out = []; const seen = new Set([lc(target[field])]);
  for (const group of [samePos, sameGroup, rest]) {
    for (const x of seededShuffle(group, `${seed}:${target.id}:${field}`)) {
      if (out.length >= n) break;
      const v = lc(x[field]);
      if (seen.has(v) || out.some((o) => thaiSimilar(o[field], x[field]))) continue;
      seen.add(v); out.push(x);
    }
  }
  return out;
}

/** ข้อแบบตัวเลือก: choices + answer (index) + คำอธิบายต่อตัวเลือก */
function mc(base, correct, wrongs, seed) {
  const opts = [{ text: correct.text, why: correct.why || null, ok: true }, ...wrongs.map((w) => ({ text: w.text, why: w.why || null, ok: false }))];
  const order = seededShuffle(opts.map((_, i) => i), `${seed}:${base.id}`);
  const choices = order.map((i) => opts[i]);
  return { ...base, choices: choices.map((c) => c.text), answer: choices.findIndex((c) => c.ok), whyNot: choices.map((c) => (c.ok ? null : c.why)) };
}

function highlight(text) { return String(text || ''); }

/** สร้างข้อหนึ่งข้อ — คืน null ถ้า sense นี้สร้างชนิดนี้ไม่ได้ */
function build(sense, type, seed = '') {
  const s = typeof sense === 'string' ? S.get(sense) : sense;
  if (!s) return null;
  const id = `${s.id}~${type}`;
  const base = { id, senseId: s.id, type, typeTh: TYPE_TH[type], form: s.form, pos: s.pos, kind: s.kind };
  const isSense = s.kind === 'sense';
  switch (type) {
    case 'meaning': {
      const n = isSense && s.baseMeaningTH ? 2 : 3;
      const ds = poolDistractors(s, n, seed).map((x) => ({ text: x.short, why: `${x.short} = ความหมายของ "${x.form}"` }));
      if (isSense && s.baseMeaningTH) ds.unshift({ text: s.baseMeaningTH, why: `นี่คือความหมายพื้นฐานของ ${s.baseLemma} — ประโยคนี้ใช้ในความหมายขั้นสูง` });
      if (ds.length < 3) return null;
      return { ...mc({ ...base, facet: isSense ? 'sense' : 'meaning',
        prompt: `"${s.form}" ในประโยคนี้หมายถึงอะไร?`, sentence: s.example },
      { text: s.short }, ds, seed), explainTH: s.meaningTH, note: s.usageNoteTH };
    }
    case 'reverse': {
      const ds = poolDistractors(s, 3, seed, { field: 'form' }).map((x) => ({ text: x.form, why: `${x.form} = ${x.short}` }));
      if (ds.length < 3) return null;
      return { ...mc({ ...base, facet: isPhrase(s) ? 'phrase' : 'meaning', prompt: `คำ/วลีใดมีความหมายว่า "${s.meaningTH}"?` },
        { text: s.form }, ds, seed), explainTH: `${s.form} = ${s.meaningTH}`, note: s.usageNoteTH };
    }
    case 'context': {
      if (!s.context || !s.context.text) return null;
      const n = isSense && s.baseMeaningTH ? 2 : 3;
      const ds = poolDistractors(s, n, `${seed}:ctx`).map((x) => ({ text: x.short, why: `${x.short} ไม่เข้ากับเบาะแสในข้อความ` }));
      if (isSense && s.baseMeaningTH) ds.unshift({ text: s.baseMeaningTH, why: `ความหมายพื้นฐานของ ${s.baseLemma} — แต่บริบทนี้ใช้ความหมายอื่น` });
      if (ds.length < 3) return null;
      return { ...mc({ ...base, facet: 'sense', prompt: 'อ่านข้อความ แล้วเดาความหมายของส่วนที่ไฮไลต์', passage: highlight(s.context.text) },
        { text: s.short }, ds, seed), explainTH: s.context.cluesTH, note: s.meaningTH };
    }
    case 'colloc': {
      const q = s.q.collocation; if (!q) return null;
      return { ...mc({ ...base, facet: 'collocation', prompt: 'เลือกคำที่ใช้คู่กันได้เป็นธรรมชาติที่สุด', sentence: q.sentence },
        { text: q.answer }, q.distractors.map((d) => ({ text: d })), seed), explainTH: q.whyTH, note: (s.collocations || []).slice(0, 4).join(' · ') };
    }
    case 'nearsyn': {
      const q = s.q.nearSyn; if (!q) return null;
      return { ...mc({ ...base, facet: 'precision', prompt: 'คำไหน "แม่นที่สุด" สำหรับบริบทนี้?', sentence: q.sentence },
        { text: q.answer }, q.distractors.map((d) => ({ text: d.word, why: d.whyNotTH })), seed),
      explainTH: (s.nearSynonyms[0] && s.nearSynonyms[0].differenceTH) || s.usageNoteTH };
    }
    case 'register': {
      const q = s.q.register; if (!q) return null;
      return { ...mc({ ...base, facet: 'register', prompt: `${q.situationTH} — ${q.question}` },
        { text: q.answer }, q.distractors.map((d) => ({ text: d.text, why: d.whyNotTH })), seed),
      explainTH: `${s.form} เป็นภาษา ${s.register}: ${s.usageNoteTH}` };
    }
    case 'connot': {
      const bucket = { positive: 'pos', approving: 'pos', negative: 'neg', disapproving: 'neg', critical: 'neg', neutral: 'neu' }[s.connotation];
      // ข้อนี้ชัดเจนเฉพาะคำที่มีน้ำเสียงบวก/ลบ — คำกลาง ๆ หรือขำขันตัดสินยาก ไม่ออกเป็นข้อสอบ
      if (!bucket || bucket === 'neu') return null;
      const L = { pos: 'เชิงบวก / ชื่นชม', neu: 'เป็นกลาง', neg: 'เชิงลบ / ติ' };
      const right = L[bucket];
      return { ...mc({ ...base, facet: 'connotation', prompt: `"${s.form}" ให้ความรู้สึกแบบไหน?`, sentence: s.example },
        { text: right }, Object.entries(L).filter(([k]) => k !== bucket).map(([, v]) => ({ text: v })), seed),
      explainTH: `${s.form} มีความหมายแฝง${right} (${s.connotation}) — ${s.usageNoteTH}` };
    }
    case 'idiom': {
      if (!s.naturalTH || !s.unnaturalTH) return null;
      const wrongs = [{ text: s.unnaturalTH, why: 'สถานการณ์นี้ใช้แล้วไม่เป็นธรรมชาติ/ผิดความหมาย' }];
      if (s.literalTH) wrongs.push({ text: `ใช้ในความหมายตรงตัว: ${s.literalTH}`, why: 'สำนวนนี้ไม่ได้ใช้ในความหมายตามตัวอักษร' });
      return { ...mc({ ...base, facet: 'phrase', prompt: `สถานการณ์ไหนใช้ "${s.form}" ได้เป็นธรรมชาติที่สุด?` },
        { text: s.naturalTH }, wrongs, seed), explainTH: `${s.form} = ${s.meaningTH}`, note: s.literalTH ? `ตามตัวอักษร: ${s.literalTH}` : null };
    }
    case 'form': {
      const q = s.q.formation; if (!q) return null;
      const wrongs = q.options.filter((o) => lc(o) !== lc(q.answer)).map((o) => ({ text: o }));
      return { ...mc({ ...base, facet: 'form', prompt: `เติมรูปที่ถูกของคำว่า "${q.root}"`, sentence: q.sentence },
        { text: q.answer }, wrongs, seed), explainTH: `ตำแหน่งนี้ต้องใช้ ${q.answer} — ตระกูลคำ: ${(s.wordFamily || []).map((w) => `${w.form} (${w.pos})`).join(', ') || q.root}` };
    }
    case 'formtype': {
      const q = s.q.formation; if (!q || !Array.isArray(q.accepted) || !q.accepted.length) return null;
      return { ...base, facet: 'form', input: true, prompt: `พิมพ์รูปที่ถูกของคำว่า "${q.root}" ลงในช่องว่าง`, sentence: q.sentence, root: q.root,
        accepted: q.accepted, expectedText: q.answer,
        explainTH: `คำตอบที่รับได้: ${q.accepted.join(' / ')} — ตระกูลคำ: ${(s.wordFamily || []).map((w) => `${w.form} (${w.pos})`).join(', ') || q.root}` };
    }
    case 'mistake': {
      const m = s.commonMistakes[0]; if (!m) return null;
      return { ...mc({ ...base, facet: 'usage', prompt: `ประโยคไหนใช้ "${s.form}" ถูกต้อง?` },
        { text: m.right }, [{ text: m.wrong, why: m.whyTH }], seed), explainTH: m.whyTH };
    }
    default: return null;
  }
}

/** มุมมองสำหรับหน้าเว็บ — ไม่มีเฉลย/คำอธิบาย */
function publicView(it) {
  if (!it) return null;
  const { answer, whyNot, explainTH, note, accepted, expectedText, ...rest } = it; // eslint-disable-line no-unused-vars
  return rest;
}

/** ตรวจคำตอบ (index) — คืน feedback พร้อมเหตุผลว่าทำไมข้อที่เลือกผิด */
function check(it, ans) {
  if (it.input) {
    const text = typeof ans === 'string' ? ans.slice(0, 80) : '';
    const correct = text.trim() !== '' && sameAnswer(text, it.accepted);
    return { correct, expected: it.expectedText, accepted: it.accepted, yours: text, near: !correct && nearMiss(text, it.accepted),
      whyNot: null, explainTH: it.explainTH, note: null, facet: it.facet, senseId: it.senseId, form: it.form };
  }
  const idx = Number.isInteger(ans) ? ans : (typeof ans === 'string' && /^\d+$/.test(ans) ? Number(ans) : -1);
  const correct = idx === it.answer;
  return {
    correct, chosen: idx, answer: it.answer, expected: it.choices[it.answer],
    yours: idx >= 0 && idx < it.choices.length ? it.choices[idx] : '',
    whyNot: !correct && idx >= 0 ? it.whyNot[idx] : null,
    explainTH: it.explainTH || null, note: it.note || null, facet: it.facet, senseId: it.senseId, form: it.form,
  };
}

const parseItemId = (itemId) => { const m = /^(C2-S\d{4,6})~([a-z]+)$/.exec(String(itemId || '')); return m && TYPES.includes(m[2]) ? { senseId: m[1], type: m[2] } : null; };

module.exports = { build, publicView, check, parseItemId, seededShuffle, overlaps, thaiSimilar, TYPES, TYPE_TH };
