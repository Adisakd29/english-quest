/*
  Writing Studio (v1.10.0 Phase 3) — ตรวจงานเขียนอิสระ "ไม่ใช้ AI" (ไม่มีค่าโทเค็น · ข้อความไม่ถูกส่งออกนอกเซิร์ฟเวอร์)
  วิเคราะห์:
    - ไวยากรณ์ตามกฎที่พบบ่อยของผู้เรียนไทย (services/grammar/writing.js) + เหตุผลภาษาไทย
    - ระดับคำศัพท์ (CEFR) จากคลังคำ Oxford 3000/5000 ในระบบ — สัดส่วนคำแต่ละระดับ + ระดับโดยประมาณ
    - คำเชื่อม (ตามระดับ) · คำที่ใช้ซ้ำ · คำพื้นฐานที่ใช้บ่อยเกิน + คำทางเลือก · ความยาวประโยค · คำเป้าหมายที่ตั้งใจฝึก
  ความเป็นส่วนตัว: ไม่เก็บข้อความ — เก็บเฉพาะสถิติ (จำนวนคำ/ข้อผิด/ระดับ) ไว้ดูความก้าวหน้า
  ข้อจำกัด (บอกผู้ใช้ตรง ๆ): ไม่ใช่การตรวจแบบครู/AI — ตรวจได้เฉพาะรูปแบบที่ตั้งกฎไว้ · ระดับคำศัพท์ไม่ใช่ระดับงานเขียนทั้งชิ้น
*/
const pool = require('../config/db');
const wordStore = require('../utils/wordStore');
const { checkWriting, splitSentences, IRREGULAR } = require('./grammar/writing');
const { LINKERS, RICHER, PROMPTS } = require('../config/writingStudio');

const MAX_LEN = 3000;
const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const STOP = new Set(('a an the and or but so because then i you he she it we they me him her us them my your his its our their this that these those '
  + 'is am are was were be been being do does did have has had will would can could should must may might to of in on at for with from by '
  + 'about as into than not no yes very too also just there here what which who when where why how all some any each every one').split(' '));

class StudioError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }

/* ---------------- คลังระดับคำ (สร้างครั้งเดียวจาก wordStore) ---------------- */
let LEX = null;
function lexicon() {
  if (LEX) return LEX;
  const m = new Map();
  for (const lvl of ORDER) {
    for (const w of wordStore.getLevelWords(lvl) || []) {
      const head = String(w.headword || w.word || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim().toLowerCase();
      if (!/^[a-z][a-z'-]*$/.test(head)) continue;            // คำเดี่ยวเท่านั้น
      const cur = m.get(head);
      const content = wordStore.CONTENT_CATEGORIES.has(w.category);
      if (!cur || ORDER.indexOf(lvl) < ORDER.indexOf(cur.level)) m.set(head, { level: lvl, content: content || (cur && cur.content) });
      else if (content) cur.content = true;
    }
  }
  const past = new Map();
  for (const [base, forms] of Object.entries(IRREGULAR)) forms.forEach((f) => past.set(f, base));
  LEX = { m, past };
  return LEX;
}
function resetLexicon() { LEX = null; }

/** รูปฐานของคำ (เดาจากการผันแบบปกติ) → { head, level, content } หรือ null */
function lookup(tok) {
  const { m, past } = lexicon();
  const t = tok.toLowerCase().replace(/^'+|'+$/g, '').replace(/'s$/, '');
  const cands = [t];
  if (past.has(t)) cands.push(past.get(t));
  if (/ies$/.test(t)) cands.push(t.replace(/ies$/, 'y'));
  if (/es$/.test(t)) cands.push(t.replace(/es$/, ''));
  if (/s$/.test(t)) cands.push(t.replace(/s$/, ''));
  if (/ied$/.test(t)) cands.push(t.replace(/ied$/, 'y'));
  if (/ed$/.test(t)) cands.push(t.replace(/ed$/, ''), t.replace(/d$/, ''), t.replace(/(\w)\1ed$/, '$1'));
  if (/ing$/.test(t)) cands.push(t.replace(/ing$/, ''), t.replace(/ing$/, 'e'), t.replace(/(\w)\1ing$/, '$1'));
  if (/er$/.test(t)) cands.push(t.replace(/er$/, ''), t.replace(/r$/, ''), t.replace(/ier$/, 'y'), t.replace(/(\w)\1er$/, '$1'));
  if (/est$/.test(t)) cands.push(t.replace(/est$/, ''), t.replace(/st$/, ''), t.replace(/iest$/, 'y'), t.replace(/(\w)\1est$/, '$1'));
  for (const c of cands) { const e = m.get(c); if (e) return { head: c, ...e }; }
  return null;
}

const tokensOf = (text) => (String(text).toLowerCase().replace(/[’`]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || []);
const countPhrase = (low, p) => (low.match(new RegExp(`(^|[^a-z])${p.replace(/ /g, '\\s+')}(?=$|[^a-z])`, 'g')) || []).length;

/** วิเคราะห์ข้อความ (ฟังก์ชันล้วน ไม่แตะ DB) */
function analyze(text, { targets = [] } = {}) {
  text = String(text == null ? '' : text).replace(/\r/g, '').trim();
  const grammar = checkWriting(text, {});
  const sentences = splitSentences(text);
  // กฎเพิ่มสำหรับงานเขียนอิสระ: มีคำบอกเวลาในอดีต แต่กริยาหลังประธานเป็นปัจจุบัน (Last weekend I go …) — ผิดบ่อยมากของผู้เรียนไทย
  const PAST_MARK = /\b(yesterday|last (night|week|weekend|month|year|summer|winter|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d+ (days?|weeks?|months?|years?) ago|ago)\b/i;
  const BASE_VERB = /\b(i|you|we|they|he|she|my \w+)\s+(go|goes|eat|eats|play|plays|visit|visits|buy|buys|see|sees|have|has|take|takes|watch|watches|make|makes|come|comes|meet|meets|stay|stays|travel|travels|walk|walks|swim|swims|get|gets)\b/i;
  sentences.forEach((sen, si) => {
    const m = sen.match(BASE_VERB);
    if (PAST_MARK.test(sen) && m && !/\b(will|going to|usually|always|every)\b/i.test(sen)) {
      grammar.issues.push({ type: 'tense', severity: 'error', excerpt: m[0],
        msgTh: `${sentences.length > 1 ? `ประโยคที่ ${si + 1}: ` : ''}"${m[0]}" — ประโยคนี้มีคำบอกเวลาในอดีต (${sen.match(PAST_MARK)[0]}) จึงต้องใช้กริยาช่องที่ 2 เช่น went, ate, played`, suggestion: null });
    }
  });
  // เรียง: ข้อผิดก่อนคำแนะนำ แล้วตามลำดับประโยค
  const sentNo = (i) => Number((String(i.msgTh).match(/^ประโยคที่ (\d+)/) || [0, 0])[1]);
  grammar.issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1) || sentNo(a) - sentNo(b));
  const toks = tokensOf(text);
  // ชื่อเฉพาะ (ตัวพิมพ์ใหญ่กลางประโยค เช่น Chiang Mai) ไม่นับเป็นคำนอกคลัง
  const names = new Set();
  sentences.forEach((sen) => { (sen.match(/(?<=\s)[A-Z][a-z]+/g) || []).forEach((w) => names.add(w.toLowerCase())); });
  const low = ` ${text.toLowerCase().replace(/[’`]/g, "'")} `;

  // ระดับคำศัพท์ (เฉพาะคำเนื้อหา — คำไวยากรณ์ทั่วไปเป็น A1 เกือบทั้งหมด จะทำให้สัดส่วนเพี้ยน)
  const profile = Object.fromEntries(ORDER.map((l) => [l, 0]));
  const examples = Object.fromEntries(ORDER.map((l) => [l, new Set()]));
  let unknown = 0; const unknownWords = new Set();
  const contentCount = new Map();
  for (const t of toks) {
    if (STOP.has(t)) continue;
    const e = lookup(t);
    if (!e) { if (t.length > 2 && !names.has(t)) { unknown += 1; unknownWords.add(t); } continue; }
    if (!e.content) continue;
    profile[e.level] += 1;
    if (examples[e.level].size < 8) examples[e.level].add(e.head);
    contentCount.set(e.head, (contentCount.get(e.head) || 0) + 1);
  }
  const known = ORDER.reduce((a, l) => a + profile[l], 0);
  // ระดับคำศัพท์โดยประมาณ: ระดับสูงสุดที่คำระดับนั้นขึ้นไปมีอย่างน้อย 10% (และอย่างน้อย 2 คำ)
  let estimate = known ? 'A1' : null;
  for (const l of ORDER) {
    const atOrAbove = ORDER.slice(ORDER.indexOf(l)).reduce((a, x) => a + profile[x], 0);
    if (known && atOrAbove >= 2 && atOrAbove / known >= 0.1) estimate = l;
  }

  // คำเชื่อม
  const linkers = [];
  for (const [lvl, list] of Object.entries(LINKERS)) {
    for (const p of list) { const n = countPhrase(low, p); if (n) linkers.push({ text: p, level: lvl, count: n }); }
  }
  const linkerLevels = new Set(linkers.map((x) => x.level));
  const nextLinkers = sentences.length >= 3 && ![...linkerLevels].some((l) => ['B1', 'B2', 'C1'].includes(l)) ? LINKERS.B1.slice(0, 5) : [];

  // คำซ้ำ (คำเนื้อหาที่ใช้ ≥ 3 ครั้ง) และคำพื้นฐานที่ใช้บ่อยเกิน
  const repeated = [...contentCount.entries()].filter(([w, n]) => n >= 3 && !RICHER[w]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, count]) => ({ word, count }));
  const basic = Object.entries(RICHER).map(([w, r]) => ({ word: w, count: countPhrase(low, w), ...r }))
    .filter((x) => x.count >= (x.word === 'very' ? 3 : 2)).sort((a, b) => b.count - a.count).slice(0, 5)
    .map((x) => ({ word: x.word, count: x.count, alternatives: x.alts, tipTh: x.tipTh }));

  // ประโยค
  const lens = sentences.map((s) => tokensOf(s).length);
  const avg = lens.length ? Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10 : 0;
  const longOnes = sentences.filter((s, i) => lens[i] > 30).map((s) => s.slice(0, 80));
  const shortRun = lens.length >= 4 && lens.filter((n) => n <= 6).length / lens.length >= 0.7;

  // คำเป้าหมาย
  const tgt = [...new Set((Array.isArray(targets) ? targets : []).map((x) => String(x).toLowerCase().trim()).filter((x) => /^[a-z][a-z' -]{0,30}$/.test(x)))].slice(0, 10);
  const used = tgt.filter((w) => countPhrase(low, w) > 0 || toks.some((t) => { const e = lookup(t); return e && e.head === w; }));

  // คำแนะนำสรุป (ภาษาไทย · เรียงตามความสำคัญ)
  const tips = [];
  const errs = grammar.issues.filter((i) => i.severity === 'error').length;
  if (errs) tips.push(`แก้ข้อผิดไวยากรณ์ ${errs} จุดก่อน — ดูคำอธิบายแต่ละจุดด้านล่าง`);
  if (shortRun) tips.push('ประโยคส่วนใหญ่สั้นมาก — ลองเชื่อมประโยคด้วย because / but / when / although');
  if (longOnes.length) tips.push(`มีประโยคยาวเกิน 30 คำ ${longOnes.length} ประโยค — แบ่งเป็น 2 ประโยคจะอ่านง่ายขึ้น`);
  if (nextLinkers.length) tips.push(`ลองใช้คำเชื่อมระดับ B1 เช่น ${nextLinkers.slice(0, 3).join(', ')}`);
  if (basic.length) tips.push(`ใช้คำพื้นฐานซ้ำ (${basic.map((b) => b.word).join(', ')}) — ดูคำทางเลือกด้านล่าง`);
  if (repeated.length) tips.push(`คำที่ใช้ซ้ำหลายครั้ง: ${repeated.map((r) => r.word).join(', ')} — ลองใช้คำอื่นหรือสรรพนามแทน`);
  if (tgt.length && used.length < tgt.length) tips.push(`ยังไม่ได้ใช้คำเป้าหมาย: ${tgt.filter((w) => !used.includes(w)).join(', ')}`);
  if (!tips.length && sentences.length) tips.push('ไม่พบจุดที่ต้องแก้ตามกฎที่ตรวจได้ — ลองเพิ่มรายละเอียด/ตัวอย่าง หรือใช้คำศัพท์ระดับสูงขึ้น');

  return {
    stats: { words: toks.length, sentences: sentences.length, avgSentenceLength: avg, longSentences: longOnes },
    grammar: { issues: grammar.issues, errors: errs, note: grammar.note },
    vocab: { profile, known, unknown, estimate, examples: Object.fromEntries(ORDER.map((l) => [l, [...examples[l]]])), unknownSample: [...unknownWords].slice(0, 8) },
    linkers, suggestLinkers: nextLinkers, repeated, basic,
    targets: { asked: tgt, used, missing: tgt.filter((w) => !used.includes(w)) },
    tips,
    note: 'ตรวจด้วยกฎภาษาและคลังคำในระบบ (ไม่ใช้ AI) — ช่วยชี้จุดที่พบบ่อย แต่ไม่ใช่การตรวจแบบครูทุกประเด็น · ระดับคำศัพท์ = ระดับของคำที่ใช้ ไม่ใช่ระดับงานเขียนทั้งชิ้น',
  };
}

async function check(userId, body = {}) {
  await wordStore.ready();
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new StudioError(400, 'เขียนข้อความก่อนส่งตรวจ', 'EMPTY');
  if (text.length > MAX_LEN) throw new StudioError(400, `ยาวเกินไป (ไม่เกิน ${MAX_LEN} ตัวอักษร)`, 'TOO_LONG');
  const promptId = typeof body.promptId === 'string' && /^[a-z0-9-]{3,30}$/.test(body.promptId) ? body.promptId : null;
  const r = analyze(text, { targets: body.targets });
  const prompt = promptId ? Object.values(PROMPTS).flat().find((p) => p.id === promptId) : null;
  if (prompt && r.stats.words < prompt.min) r.tips.unshift(`โจทย์นี้ควรเขียนอย่างน้อย ${prompt.min} คำ (ตอนนี้ ${r.stats.words} คำ)`);
  // เก็บเฉพาะสถิติ (ไม่เก็บข้อความ)
  await pool.query(
    `INSERT INTO writing_studio_logs (user_id, prompt_id, words, sentences, errors, vocab_level) VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, promptId, r.stats.words, r.stats.sentences, r.grammar.errors, r.vocab.estimate]);
  return r;
}

async function home(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(words), 0)::int AS words,
            (SELECT vocab_level FROM writing_studio_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1) AS last_level
       FROM writing_studio_logs WHERE user_id = $1`, [userId]);
  const recent = (await pool.query(
    'SELECT words, errors, vocab_level, created_at FROM writing_studio_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8', [userId])).rows;
  return { prompts: PROMPTS, maxLen: MAX_LEN, stats: { checks: rows[0].n, words: rows[0].words, lastLevel: rows[0].last_level }, recent };
}

module.exports = { analyze, check, home, lookup, resetLexicon, StudioError, MAX_LEN };
