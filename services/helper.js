/*
  ผู้ช่วยค้นคำตอบ (v1.10.0 Phase 3 — แทน "AI Tutor" แบบไม่ใช้ AI · ไม่มีค่าโทเค็น · คำถามไม่ถูกส่งออกนอกเซิร์ฟเวอร์)
  ค้นจาก: คำถามที่พบบ่อย (config/helpFaq.js) · หลักสูตรไวยากรณ์ CEFR 74 หัวข้อ · คลังคำศัพท์ (อังกฤษ→ไทย และ ไทย→อังกฤษ)
  ไม่เก็บคำถามที่ผู้ใช้พิมพ์
*/
const GC = require('../data/grammar-curriculum');
const wordStore = require('../utils/wordStore');
const { getContent } = require('../utils/vocabContent');
const { FAQ, EXAMPLE_QUESTIONS } = require('../config/helpFaq');

const THAI = /[\u0E00-\u0E7F]/;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'is', 'are', 'how', 'what', 'use', 'when', 'do', 'does', 'i', 'you', 'in', 'it']);
const strip = (s) => String(s || '').replace(/\[\[|\]\]/g, '');
const normTh = (s) => String(s || '').replace(/สมมุติ/g, 'สมมติ');   // สะกดได้สองแบบ
const headOf = (w) => String(w.headword || w.word || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim().toLowerCase();

let INDEX = null;
function grammarIndex() {
  if (INDEX) return INDEX;
  INDEX = GC.TOPICS.map((t) => {
    const c = GC.getTopic(t.id) || {};
    const concept = c.concept || {};
    const strong = [t.title, (c.compare && c.compare.title) || '', ...(c.terms || []).map((x) => x.en)].join(' \n ');
    const body = [t.titleTh, c.summaryTh || '', concept.what || '', ...(concept.when || []), ...(c.terms || []).map((x) => x.th),
      ...(c.mistakes || []).map((m) => `${m.wrong} ${m.right} ${m.whyTh}`), (c.structure && c.structure.formula) || ''].map(strip).join(' \n ');
    return { id: t.id, cefr: t.cefr, title: t.title, titleTh: t.titleTh, summaryTh: c.summaryTh || '', strong: strong.toLowerCase(), body: normTh(body.toLowerCase()), titleThLow: normTh(t.titleTh.toLowerCase()) };
  });
  return INDEX;
}
const hasWord = (hay, w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?=$|[^a-z])`).test(hay);
// คำไทยทั่วไปในคำถาม (ใช้/กับ/ต่างกันยังไง …) ไม่บอกหัวข้อ — ตัดออกก่อนค้น ไม่งั้นตรงกับทุกหัวข้อ
const TH_GENERIC = /(ต่างกัน|ยังไง|อย่างไร|ใช้|หรือ|กับ|คือ|อะไร|ไหม|มั้ย|ทำ|แบบ|มีกี่|กี่|เมื่อไร|เมื่อไหร่|ตอนไหน|ครับ|ค่ะ|คะ|ประโยค|คำ|ภาษาอังกฤษ)/g;
const thaiChunks = (q) => (q.replace(TH_GENERIC, ' ').match(/[\u0E00-\u0E7F]+/g) || []).filter((x) => x.length >= 2);

function searchFaq(q) {
  const low = ` ${q.toLowerCase()} `;
  const has = (k) => (THAI.test(k) ? low.includes(k) : hasWord(low, k.toLowerCase()));
  return FAQ.map((f) => {
    const best = Math.max(0, ...f.match.map((set) => (set.every(has) ? set.length : 0)));
    return { f, score: best };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ f }) => {
    const t = f.topic ? GC.TOPIC_BY_ID[f.topic] : null;
    return { id: f.id, question: f.q, answer: f.a, examples: f.ex, topic: t ? { id: t.id, title: t.title, titleTh: t.titleTh, cefr: t.cefr } : null };
  });
}

function searchGrammar(q) {
  const low = q.toLowerCase();
  const words = (low.match(/[a-z][a-z'-]*/g) || []).filter((w) => !STOP.has(w));
  const th = thaiChunks(q);
  if (!words.length && !th.length) return [];
  return grammarIndex().map((t) => {
    let score = 0;
    for (const w of words) {
      if (hasWord(t.strong, w)) score += 3;
      else if (hasWord(t.body, w)) score += 1;
    }
    if (words.length >= 2 && hasWord(t.strong, words.join(' '))) score += 4;   // วลีตรงทั้งก้อน เช่น present perfect
    if (words.length && hasWord(t.title.toLowerCase(), words.join(' '))) score += 6;   // ตรงชื่อหัวข้อ
    for (const c of th) {
      if (t.titleThLow.includes(c)) score += 3;
      else if (t.body.includes(c)) score += 1;
    }
    return { t, score };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 5)
    .map(({ t }) => ({ id: t.id, cefr: t.cefr, title: t.title, titleTh: t.titleTh, summaryTh: t.summaryTh }));
}

async function searchWords(q) {
  await wordStore.ready();
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const all = levels.flatMap((l) => wordStore.getLevelWords(l) || []).filter((w) => w.thai);
  let hits = [];
  const en = q.trim().toLowerCase();
  if (!THAI.test(q) && /^[a-z][a-z' -]{0,30}$/.test(en) && en.split(/\s+/).length <= 3) {
    hits = all.filter((w) => headOf(w) === en);
  } else if (THAI.test(q) && !/[a-z]/i.test(q) && q.trim().length <= 20) {
    const t = q.trim();
    const exact = all.filter((w) => w.thai.split(/[,(]/).map((x) => x.trim()).includes(t));
    const part = all.filter((w) => !exact.includes(w) && w.thai.includes(t));
    hits = [...exact, ...part];
  }
  hits = hits.slice(0, 6);
  if (!hits.length) return [];
  const c = await getContent(hits.map((w) => w.id)).catch(() => new Map());
  return hits.map((w) => {
    const x = c.get(w.id) || {};
    return { id: w.id, word: w.word, pos: w.pos || '', level: w.level, thai: w.thai, definition: x.definition || null,
      example: x.example || null, exampleTH: x.exampleTH || null, ipa: x.ipa || null };
  });
}

async function search(raw) {
  const q = normTh(String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120));
  if (q.length < 1) return { query: q, faq: [], grammar: [], words: [], examples: EXAMPLE_QUESTIONS };
  const [words] = await Promise.all([searchWords(q)]);
  const faq = searchFaq(q);
  const grammar = searchGrammar(q).filter((g) => !faq.some((f) => f.topic && f.topic.id === g.id)).slice(0, 4);
  const empty = !faq.length && !grammar.length && !words.length;
  return { query: q, faq, grammar, words, examples: empty ? EXAMPLE_QUESTIONS : [],
    note: 'ค้นจากเนื้อหาในแอป (ไม่ใช้ AI) — ถ้าไม่พบ ลองพิมพ์คำสำคัญภาษาอังกฤษ เช่น "since for" หรือคำศัพท์คำเดียว' };
}

module.exports = { search, searchFaq, searchGrammar, searchWords, EXAMPLE_QUESTIONS };
