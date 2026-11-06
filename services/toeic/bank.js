/*
  คลังข้อ TOEIC-style (ตอนนี้ Part 1) — โหลด bank.json เข้า toeic_questions (idempotent ตาม version) แล้ว cache ในหน่วยความจำ
  - Production pool = qualityStatus 'verified' เท่านั้น (draft / reviewNeeded / autoChecked ไม่เข้าชุดฝึก)
  - ตรวจซ้ำด้วย Part1QuestionValidator ตอน sync (ข้อที่ไม่ผ่านจะถูกลดสถานะ ไม่ถูกเผยแพร่)
  - ผูก Key Vocabulary กับคลังคำศัพท์เดิม (vocab_senses.public_id) — ไม่สร้างคำซ้ำในคลังคำศัพท์
*/
const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { validateQuestion } = require('./part1Validator');
const P2V = require('./part2Validator');
const P34V = require('./part34Validator');
const P5V = require('./part5Validator');
const P6V = require('./part6Validator');
const P7V = require('./part7Validator');

const ROOT = path.join(__dirname, '..', '..');
const BANK_FILES = { 1: path.join(ROOT, 'data', 'toeic', 'part1', 'bank.json'),
  2: path.join(ROOT, 'data', 'toeic', 'part2', 'bank.json'),
  3: path.join(ROOT, 'data', 'toeic', 'part3', 'bank.json'),
  4: path.join(ROOT, 'data', 'toeic', 'part4', 'bank.json'), 5: path.join(ROOT, 'data', 'toeic', 'part5', 'bank.json'),
  6: path.join(ROOT, 'data', 'toeic', 'part6', 'bank.json'),
  7: path.join(ROOT, 'data', 'toeic', 'part7', 'bank.json') };
const POS_MAP = { verb: 'verb', noun: 'noun', adjective: 'adjective', adverb: 'adverb', preposition: 'preposition' };

let cache = null;          // { byId: Map, part1: [] }
let loading = null;

/** โหลดไฟล์คลังเข้า DB (เพิ่ม/อัปเดตเฉพาะข้อที่ version เปลี่ยน) */
async function syncFromFiles({ log = () => {}, db = pool } = {}) {
  let changed = 0;
  for (const [part, file] of Object.entries(BANK_FILES)) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const questions = data.questions || data.passages || data.sets || [];   // Part 6: 1 แถว = 1 บทความ (4 ช่องว่าง)
    const { rows } = await db.query('SELECT id, version, quality_status FROM toeic_questions WHERE part = $1', [Number(part)]);
    const have = new Map(rows.map((r) => [r.id, r]));
    for (const q of questions) {
      // ตรวจซ้ำตอนนำเข้า (ไฟล์อาจถูกแก้มือ) — ไม่ผ่าน = ไม่เผยแพร่
      const v = [3, 4].includes(Number(part)) ? P34V.validateSet(q, { publicDir: path.join(ROOT, 'public'), checkAudio: true }) : Number(part) === 2 ? P2V.validateQuestion(q, { publicDir: path.join(ROOT, 'public'), checkFiles: true }) : Number(part) === 7 ? P7V.validateSet(q) : Number(part) === 6 ? P6V.validatePassage(q) : Number(part) === 5 ? P5V.validateQuestion(q) : validateQuestion(q, { publicDir: path.join(ROOT, 'public'), checkFiles: true });
      const status = have.get(q.id) && have.get(q.id).quality_status === 'retired' ? 'retired' : v.status;
      const h = have.get(q.id);
      if (h && h.version === q.version && h.quality_status === status) continue;
      await db.query(
        `INSERT INTO toeic_questions (id, part, type, category, difficulty, topic, quality_status, version, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, difficulty = EXCLUDED.difficulty, topic = EXCLUDED.topic,
           quality_status = EXCLUDED.quality_status, version = EXCLUDED.version, content = EXCLUDED.content, updated_at = NOW()`,
        [q.id, Number(part), q.type, q.category, q.difficulty, q.topic, status, q.version, JSON.stringify(q)]);   // Part 5: category = grammar | vocabulary
      changed += 1;
    }
  }
  if (changed) log(`[toeic] synced ${changed} question(s)`);
  cache = null;
  return changed;
}

async function linkVocabulary(questions, db = pool) {
  const words = [...new Set(questions.flatMap((q) => (q.vocabulary || []).map((v) => v.word.toLowerCase())))];
  if (!words.length) return;
  const { rows } = await db.query(
    `SELECT e.normalized, s.public_id, s.cefr, s.pos, s.thai_meaning
       FROM vocab_entries e JOIN vocab_senses s ON s.entry_id = e.id
      WHERE e.normalized = ANY($1::text[]) AND s.public_id IS NOT NULL
      ORDER BY (s.cefr = 'C2'), s.cefr, s.display_order NULLS LAST`, [words]).catch(() => ({ rows: [] }));
  const by = new Map();
  rows.forEach((r) => { if (!by.has(r.normalized)) by.set(r.normalized, []); by.get(r.normalized).push(r); });
  questions.forEach((q) => (q.vocabulary || []).forEach((v) => {
    const cands = by.get(v.word.toLowerCase()) || [];
    const pos = POS_MAP[v.pos];
    // ความหมายต้องตรงชนิดคำ (เช่น shelf noun ไม่ผูกกับ shelf verb ระดับ C2)
    const hit = cands.find((c) => pos && c.pos === pos) || (!pos ? cands[0] : null);
    v.wordId = hit ? hit.public_id : null;
    v.level = hit ? hit.cefr : null;
  }));
}

async function load() {
  const { rows } = await pool.query("SELECT id, part, quality_status, content FROM toeic_questions WHERE quality_status <> 'retired' ORDER BY id");
  const all = rows.map((r) => ({ ...r.content, qualityStatus: r.quality_status }));
  await linkVocabulary(all);
  const byId = new Map(all.map((q) => [q.id, q]));
  return { byId, all, part1: all.filter((q) => q.part === 1 && q.qualityStatus === 'verified'), part2: all.filter((q) => q.part === 2 && q.qualityStatus === 'verified'),
    part3: all.filter((q) => q.part === 3 && q.qualityStatus === 'verified'),
    part4: all.filter((q) => q.part === 4 && q.qualityStatus === 'verified'),
    part5: all.filter((q) => q.part === 5 && q.qualityStatus === 'verified'),
    part6: all.filter((q) => q.part === 6 && q.qualityStatus === 'verified'),
    part7: all.filter((q) => q.part === 7 && q.qualityStatus === 'verified') };
}

async function ready() {
  if (cache) return cache;
  if (!loading) loading = load().then((c) => { cache = c; loading = null; return c; }).catch((e) => { loading = null; throw e; });
  return loading;
}
function invalidate() { cache = null; }

/** ข้อที่ใช้ได้ (verified) ของ part */
async function pool1() { return (await ready()).part1; }
async function pool2() { return (await ready()).part2; }
async function poolOf(part) { return (await ready())[`part${part}`] || []; }
async function pool5() { return (await ready()).part5; }
async function pool6() { return (await ready()).part6; }
async function pool7() { return (await ready()).part7; }
async function get(id) { return (await ready()).byId.get(id) || null; }

module.exports = { syncFromFiles, ready, invalidate, pool1, pool2, poolOf, pool5, pool6, pool7, get, linkVocabulary, BANK_FILES };
