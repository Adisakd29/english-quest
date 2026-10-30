/*
  เนื้อหาฝึกพูด (Speaking) — สร้างจากเนื้อหาที่มีอยู่แล้วทั้งหมด (ไม่แต่งประโยคใหม่):
    ประโยค   : ตัวอย่าง (พร้อมคำแปลไทย) + ประโยคที่ถูกต้องในหัวข้อ "ข้อผิดพลาดที่พบบ่อย" ของบทแกรมม่า 74 บท (A1–C1)
    คำศัพท์  : คำ Oxford ที่มีคำแปลไทยตรวจแล้ว (เหมือนคำที่ใช้ในแบบฝึก) แบ่งชุดละ 10 คำตามระดับ
    บทสนทนา  : บทสนทนาในบทเรียนแกรมม่า (มีผู้พูด 2 คน) → Role-play
  ID คงที่ (อิงลำดับในไฟล์เนื้อหา) → ความคืบหน้าของผู้ใช้ไม่หายเมื่อรีสตาร์ต
*/
const G = require('../../data/grammar-curriculum');
const wordStore = require('../../utils/wordStore');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const WORDS_PER_SET = 10;
const clean = (s) => String(s || '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
const wc = (s) => s.split(' ').filter(Boolean).length;
/** ประโยคที่พูดตามได้: ไม่มีช่องว่างให้เติม/ตัวเลือกคั่น / /วงเล็บอธิบาย · 2–20 คำ */
const speakable = (s, max = 20) => s && !/[_/…]|\.\.\.|\(|\)|\[|\]/.test(s) && wc(s) >= 2 && wc(s) <= max;

let index = null;   // { items: Map(id -> item), sets: Map(id -> set), byLevel: { L: { sentences:[], words:[], dialogues:[] } } }
let building = null;

function buildGrammar(ix) {
  for (const { id: topicId, cefr: level, title, titleTh } of G.TOPICS) {
    let t;
    try { t = G.getTopic(topicId); } catch (_) { t = null; }
    if (!t) continue;
    const list = [];
    (t.examples || []).forEach((e, k) => { const en = clean(e.en); if (speakable(en)) list.push({ k: `e${k}`, en, th: e.th || null }); });
    (t.mistakes || []).forEach((m, k) => { const en = clean(m.right); if (speakable(en) && !list.some((x) => x.en === en)) list.push({ k: `m${k}`, en, th: null }); });
    if (list.length) {
      const set = { id: `g:${topicId}`, kind: 'sentences', level, title, titleTh, items: [] };
      for (const x of list) {
        const it = { id: `s:${topicId}:${x.k}`, kind: 'sentence', level, setId: set.id, text: x.en, th: x.th };
        ix.items.set(it.id, it); set.items.push(it.id);
      }
      ix.sets.set(set.id, set); ix.byLevel[level].sentences.push(set.id);
    }
    (t.contexts || []).forEach((c, ci) => {
      const lines = (c.lines || []).filter((l) => l.speaker && l.text);
      const speakers = [...new Set(lines.map((l) => l.speaker))];
      if (speakers.length !== 2 || lines.length < 3 || lines.length !== (c.lines || []).length) return;
      const ok = lines.map((l) => clean(l.text)).every((s) => s && !/[_]|\.\.\.|\[|\]/.test(s) && wc(s) <= 26);
      if (!ok) return;
      const set = { id: `d:${topicId}:${ci}`, kind: 'dialogue', level, title: c.title || title, titleTh, topicTitle: title, speakers, items: [] };
      lines.forEach((l, li) => {
        const it = { id: `d:${topicId}:${ci}:${li}`, kind: 'line', level, setId: set.id, speaker: l.speaker, text: clean(l.text), th: null };
        ix.items.set(it.id, it); set.items.push(it.id);
      });
      ix.sets.set(set.id, set); ix.byLevel[level].dialogues.push(set.id);
    });
  }
}
function speakableWord(w) {
  const s = String(w || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  return s && !/[/_0-9]/.test(s) && s.length <= 24 ? s : null;
}
function buildWords(ix) {
  for (const level of LEVELS) {
    const seen = new Set(); const words = [];
    for (const w of wordStore.getLevelWords(level)) {
      if (!wordStore.isPlayable(w.id)) continue;
      const text = speakableWord(w.headword || w.word);
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      words.push({ w, text });
    }
    for (let i = 0; i < words.length; i += WORDS_PER_SET) {
      const n = i / WORDS_PER_SET + 1;
      const set = { id: `w:${level}:${n}`, kind: 'words', level, title: `${level} Words ${n}`, titleTh: `คำศัพท์ ${level} ชุดที่ ${n}`, items: [] };
      for (const { w, text } of words.slice(i, i + WORDS_PER_SET)) {
        const it = { id: `w:${w.id}`, kind: 'word', level, setId: set.id, wordId: w.id, text, th: wordStore.getThai(w.id) || null, pos: w.pos || null };
        ix.items.set(it.id, it); set.items.push(it.id);
      }
      ix.sets.set(set.id, set); ix.byLevel[level].words.push(set.id);
    }
  }
}
async function ready() {
  if (index) return index;
  if (!building) {
    building = (async () => {
      await wordStore.ready();
      const ix = { items: new Map(), sets: new Map(), byLevel: Object.fromEntries(LEVELS.map((l) => [l, { sentences: [], words: [], dialogues: [] }])) };
      buildGrammar(ix);
      buildWords(ix);
      index = ix;
      return ix;
    })().catch((e) => { building = null; throw e; });
  }
  return building;
}
function reset() { index = null; building = null; }

module.exports = { ready, reset, LEVELS, speakableWord, clean, speakable };
