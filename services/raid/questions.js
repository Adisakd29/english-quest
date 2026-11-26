/*
  v1.27.0 World Raid — ชุดคำถามรอบโจมตี (ใช้คลังของระบบเรียนเดิมทั้งหมด · ไม่สร้างเนื้อหาใหม่)
    vocab   : ทายความหมายคำศัพท์ Oxford (คำแปลที่ตรวจแล้ว)                  — services/ranked/questionBank
    context : Sentence Completion เติมคำในประโยคตัวอย่างของคำศัพท์           — services/ranked/questionBank
    grammar : แกรมม่า A1–C1 (mc / choose)                                    — data/grammar-curriculum ผ่าน grammarBank
    reading : ข้อมีบริบท (บทสนทนา / อีเมล / ข้อความ)                          — grammarBank (passage)
    error   : Error Identification "ส่วนไหนผิด" จากข้อ error ของคลังแกรมม่า (ส่วนที่ผิดกำหนดโดยผู้เขียนเนื้อหา = เฉลย)
  ระดับคำถาม = ระดับของผู้เล่นจากผลวัดระดับ (เลือกเองไม่ได้ → เลือก A1 เพื่อฟาร์มไม่ได้)
    listening: v1.27.1 ฟังคำถามสั้น (เฉพาะช่วงคำถามของคลิป TOEIC Part 2 ต้นฉบับ · เสียง Kokoro TTS ที่สร้างไว้แล้ว) → เลือกคำตอบที่เหมาะสม
               ความยากเลือกจาก difficulty ของคลัง (easy/medium/hard) ตามระดับผู้เล่น — ไม่ได้ติดป้าย CEFR ให้ข้อฟัง (คลังไม่ได้กำหนด CEFR)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QB = require('../ranked/questionBank');
const GB = require('../ranked/grammarBank');
const GC = require('../../data/grammar-curriculum');
const { mulberry32, shuffle } = require('../ranked/rng');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
// สัดส่วนชนิดคำถามต่อ Phase (10 ข้อ) — Phase 1 สอนกลไก: คำศัพท์+แกรมม่า · Phase 2–3 เพิ่มบริบท/อ่าน/หาจุดผิด
const MIX = {
  1: { vocab: 3, grammar: 3, context: 2, error: 1, reading: 0, spell: 1, listening: 0 },
  2: { vocab: 1, grammar: 2, context: 2, error: 2, reading: 1, spell: 1, listening: 1 },
  3: { vocab: 1, grammar: 1, context: 2, error: 1, reading: 2, spell: 2, listening: 1 },
};
// เปิดตัวอักษรแรก + จำนวนช่อง ทุกระดับ — คำแปลไทยบางคำตรงกับหลายคำอังกฤษ (เช่น ทางโลก = secular/worldly) ตัวอักษรแรกช่วยให้คำตอบชัดเจน

/* ---------- v1.27.0 Spelling Strike: เห็นคำแปลไทย → สะกดคำอังกฤษด้วยคีย์บอร์ดบนจอ (เฉลยอยู่ที่เซิร์ฟเวอร์) ---------- */
function spellQuestions({ list, thai }, cefr, count, rng, exclude) {
  if (count <= 0) return [];
  const out = []; const seenThai = new Set();
  for (const w of shuffle(list.filter((x) => !exclude.has(`s:${x.id}`)), rng)) {
    if (out.length >= count) break;
    const word = QB.clean(w.word).toLowerCase();
    const th = thai.get(w.id);
    if (!/^[a-z]{3,10}$/.test(word) || !th || seenThai.has(th)) continue;
    // คำแปลเดียวกันหลายคำ (เช่น big/large) → กำกวม ไม่ใช้
    if (list.some((o) => o.id !== w.id && thai.get(o.id) === th)) continue;
    seenThai.add(th);
    out.push({ id: `s:${w.id}`, type: 'spell', cefr, prompt: th, instruction: 'สะกดคำภาษาอังกฤษจากคำแปล', choices: [], correctIndex: -1,
      answer: word, length: word.length, hint: word[0], explain: `${word} = ${th}`, ref: { wordId: w.id } });
  }
  return out;
}

/* ---------- v1.27.1 Listening: ช่วงคำถามของคลิป TOEIC Part 2 (ต้นฉบับ EnglishQuest · ตรวจเฉลยแล้ว 150/150) ---------- */
const P2_FILE = path.join(__dirname, '..', '..', 'data', 'toeic', 'part2', 'bank.json');
const P2_PUBLIC = path.join(__dirname, '..', '..', 'public');
const LISTEN_DIFF = { A1: ['easy'], A2: ['easy'], B1: ['easy', 'medium'], B2: ['medium', 'hard'], C1: ['hard', 'medium'] };
const DIFF_TH = { easy: 'ง่าย', medium: 'กลาง', hard: 'ยาก' };
const CLIPS_FILE = path.join(__dirname, '..', '..', 'data', 'raid', 'listen.json');   // ไฟล์เฉพาะช่วงคำถาม (scripts/raid/cut_listen.py)
let P2 = null;
function listenItems() {
  if (P2) return P2;
  P2 = [];
  let bank = [];
  try { bank = JSON.parse(fs.readFileSync(P2_FILE, 'utf8')).questions || []; } catch (_) { bank = []; }
  let clips = {};
  try { clips = JSON.parse(fs.readFileSync(CLIPS_FILE, 'utf8')).clips || {}; } catch (_) { clips = {}; }
  for (const q of bank) {
    if (!q || !Array.isArray(q.responses) || q.responses.length !== 3 || q.responses.filter((r) => r.isCorrect).length !== 1) continue;
    for (const v of q.variants || []) {
      const a = v.audio; const seg = a && Array.isArray(a.segments) ? a.segments.find((g) => g.letter === 'Q') : null;
      if (!seg || !(seg.end > seg.start) || !Array.isArray(v.order) || v.order.length !== 3) continue;
      const c = clips[`${q.id}:${v.v}`];
      if (!c || !fs.existsSync(path.join(P2_PUBLIC, c.url))) continue;   // ไม่มีไฟล์เสียงจริง = ไม่ใช้
      P2.push({ q, v, seg, clip: c });
    }
  }
  return P2;
}
function listeningQuestions(cefr, count, rng, exclude) {
  if (count <= 0) return [];
  const diffs = LISTEN_DIFF[cefr] || LISTEN_DIFF.B1;
  const out = []; const used = new Set();
  for (const { q, v, clip } of shuffle(listenItems().filter(({ q }) => diffs.includes(q.difficulty) && !exclude.has(`l:${q.id}`)), rng)) {
    if (out.length >= count) break;
    if (used.has(q.id)) continue;
    used.add(q.id);
    const resp = v.order.map((k) => q.responses[k]);
    const correctIndex = resp.findIndex((r) => r.isCorrect);
    const wrong = resp.map((r, i) => (r.isCorrect ? '' : r.explanationTH ? `${String.fromCharCode(65 + i)}: ${r.explanationTH}` : '')).filter(Boolean).join(' · ');
    out.push({
      id: `l:${q.id}`, type: 'listening', cefr, prompt: 'ฟังคำถาม แล้วเลือกคำตอบที่เหมาะสมที่สุด', instruction: 'Listening · ฟังได้ 2 ครั้ง',
      choices: resp.map((r) => r.text), correctIndex,
      audio: { url: clip.url, start: 0, end: clip.duration }, difficulty: q.difficulty,   // ไฟล์มีเฉพาะคำถาม (ไม่มีตัวเลือก A/B/C)
      transcript: q.prompt,
      explain: `ได้ยิน: "${q.prompt}" (${q.promptTH || ''}) · ${q.explanationTH || ''}${wrong ? ` · ${wrong}` : ''}`.trim(),
      ref: { toeicP2: q.id, v: v.v },
    });
  }
  return out;
}

/* ---------- Error Identification: แยกประโยคเป็น 4 ส่วน (1 ส่วน = errorPart ของผู้เขียน) ---------- */
let ERR = null;
function errorItems() {
  if (ERR) return ERR;
  ERR = Object.fromEntries(LEVELS.map((l) => [l, []]));
  for (const it of GC.allItems()) {
    if (it.type !== 'error' || !ERR[it.cefr] || !it.sentence || !it.errorPart) continue;
    const s = String(it.sentence); const e = String(it.errorPart);
    const at = s.indexOf(e);
    if (at < 0 || s.indexOf(e, at + 1) >= 0) continue;   // ต้องเจอส่วนที่ผิดตรงตัวครั้งเดียว (ไม่กำกวม)
    const before = s.slice(0, at).trim().split(/\s+/).filter(Boolean);
    const after = s.slice(at + e.length).trim().split(/\s+/).filter(Boolean);
    const strip = (w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
    const chunks = (words) => {   // คำละ 1–2 คำ เป็นตัวลวง
      const out = []; for (let i = 0; i < words.length; i += 2) { const c = words.slice(i, i + 2).map(strip).filter(Boolean).join(' '); if (c && c.toLowerCase() !== strip(e).toLowerCase()) out.push(c); }
      return out;
    };
    const decoys = [...chunks(before), ...chunks(after)].filter((c, k, a) => a.indexOf(c) === k);
    if (decoys.length < 3) continue;
    ERR[it.cefr].push({ it, decoys });
  }
  return ERR;
}
function errorQuestions(cefr, count, rng, exclude) {
  const L = LEVELS.includes(cefr) ? cefr : 'C1';
  const list = shuffle(errorItems()[L].filter(({ it }) => !exclude.has(`ge:${it.id}`)), rng);
  return list.slice(0, count).map(({ it, decoys }) => {
    const ans = String(it.errorPart).replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
    const choices = shuffle([ans, ...shuffle(decoys, rng).slice(0, 3)], rng);
    return {
      id: `ge:${it.id}`, type: 'error', cefr: it.cefr, prompt: it.sentence, instruction: 'ส่วนไหนของประโยคที่ผิด',
      choices, correctIndex: choices.indexOf(ans),
      explain: `${it.explainTh || ''}${Array.isArray(it.accepted) && it.accepted[0] ? ` · ที่ถูก: ${it.accepted[0]}` : ''}`.trim(),
      ref: { glItem: it.id, topicId: it.topic }, difficultyAdj: 0,
    };
  });
}

/**
 * สร้างคำถาม 1 รอบ
 * @returns {Promise<Array>} คำถามพร้อมเฉลย (เก็บฝั่งเซิร์ฟเวอร์)
 */
/** v1.27.1 รวมข้อสองระดับ: กระจายข้อง่ายกว่าแทรกตลอดรอบ (ไม่กองท้าย) · คงลำดับข้อยากเดิม */
function mixRound(top, low) {
  if (!low.length) return top;
  const total = top.length + low.length;
  const at = new Set(low.map((_, k) => Math.min(total - 1, Math.floor(((k + 0.5) * total) / low.length))));
  const out = []; let li = 0; let ti = 0;
  for (let i = 0; i < total; i += 1) out.push((at.has(i) && li < low.length) || ti >= top.length ? low[li++] : top[ti++]);
  return out;
}

async function buildRound({ cefr, phase = 1, count = 10, exclude = new Set(), seed = null, mode = 'mixed' }) {
  const rng = mulberry32(seed === null ? crypto.randomInt(1, 2 ** 31 - 1) : seed);
  const level = LEVELS.includes(cefr) ? cefr : (cefr === 'C2' ? 'C1' : 'A1');
  // v1.27.1 mode 'spell' (เจ้าของขอ) = ทุกข้อเห็นความหมายไทย → พิมพ์คำอังกฤษ · 'mixed' = สัดส่วนเดิมตาม Phase
  const want = mode === 'spell' ? { vocab: 0, grammar: 0, context: 0, error: 0, reading: 0, spell: count, listening: 0 } : { ...(MIX[phase] || MIX[1]) };
  const scale = mode === 'spell' ? 1 : count / 10;
  Object.keys(want).forEach((k) => { want[k] = Math.round(want[k] * scale); });
  const out = [];
  const words = await QB.levelWords(level);
  out.push(...QB.vocabQuestions(words, level, want.vocab, rng, exclude).map((q) => ({ ...q, type: 'vocab' })));
  out.push(...(await QB.contextQuestions(words, level, want.context, rng, exclude)));
  const gram = GB.curriculumQuestions({ level, count: want.grammar + want.reading, passage: want.reading, rng, exclude });
  out.push(...gram);
  out.push(...errorQuestions(level, want.error, rng, exclude));
  out.push(...spellQuestions(words, level, want.spell || 0, rng, exclude));
  out.push(...listeningQuestions(level, want.listening || 0, rng, exclude));
  // โหมดสะกด: คำที่ไม่ซ้ำรอบล่าสุดไม่พอ → ยอมใช้คำที่เคยเจอแล้ว (ยังเป็นข้อสะกดทั้งหมด)
  if (mode === 'spell' && out.length < count) out.push(...spellQuestions(words, level, count - out.length, rng, new Set(out.map((q) => q.id))));
  // ข้อไม่พอ (คลังบางระดับเล็ก) → เติมด้วยคำศัพท์/แกรมม่า ระดับเดียวกัน
  if (out.length < count) out.push(...QB.vocabQuestions(words, level, count - out.length, rng, new Set(out.map((q) => q.id))).map((q) => ({ ...q, type: 'vocab' })));
  if (out.length < count) out.push(...GB.curriculumQuestions({ level, count: count - out.length, passage: 0, rng, exclude: new Set(out.map((q) => q.id)) }));
  const seen = new Set();
  const qs = shuffle(out.filter((q) => {
    if (seen.has(q.id)) return false;
    if (q.type === 'spell') { if (!q.answer) return false; seen.add(q.id); return true; }
    if (!Array.isArray(q.choices) || q.choices.length < 2 || !(q.correctIndex >= 0) || q.correctIndex >= q.choices.length) return false;
    seen.add(q.id); return true;
  }), rng).slice(0, count);
  // Phase 1 สอนกลไก: ข้อแรกเป็นคำศัพท์เสมอ (ง่ายสุด)
  if (phase === 1) { const v = qs.findIndex((q) => q.type === 'vocab'); if (v > 0) qs.unshift(qs.splice(v, 1)[0]); }
  if (qs.length < count) throw Object.assign(new Error('not_enough_questions'), { code: 'NO_QUESTIONS' });
  return qs.map((q) => ({
    id: q.id, type: q.type, cefr: q.cefr || level, prompt: q.prompt, instruction: q.instruction || '', passage: q.passage || null, passageTitle: q.passageTitle || null,
    choices: q.choices, correctIndex: q.correctIndex, explain: q.explain || '', ref: q.ref || null,
    ...(q.type === 'spell' ? { answer: q.answer, length: q.length, hint: q.hint } : {}),
    ...(q.type === 'listening' ? { audio: q.audio, difficulty: q.difficulty, transcript: q.transcript } : {}),
  }));
}

/** ส่วนที่ส่งให้ผู้เล่น (ไม่มีเฉลย/คำอธิบาย) */
function publicQuestion(q, index) {
  const out = { index, type: q.type, cefr: q.cefr, prompt: q.prompt, instruction: q.instruction, passage: q.passage, passageTitle: q.passageTitle, choices: q.choices };
  if (q.type === 'spell') { out.length = q.length; out.hint = q.hint || null; }   // ไม่ส่งคำตอบ
  if (q.type === 'listening') { out.audio = q.audio; out.difficulty = q.difficulty; out.difficultyTh = DIFF_TH[q.difficulty] || ''; }   // ไม่ส่ง transcript (เฉลยอยู่ใน explain หลังตอบ)
  return out;
}

const TYPE_TH = { vocab: 'Vocabulary', context: 'Sentence Completion', grammar: 'Grammar', reading: 'Reading', error: 'Error Identification', listening: 'Listening', spell: 'Spelling Strike' };
const normSpell = (x) => String(x || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20);

module.exports = { mixRound, buildRound, publicQuestion, errorQuestions, spellQuestions, listeningQuestions, _listenItems: listenItems, normSpell, MIX, TYPE_TH, _errorItems: errorItems };
