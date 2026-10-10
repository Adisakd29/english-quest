/*
  คลังคำศัพท์กลาง (word store)
  ใช้ร่วมกันโดย routes/progress.js, routes/words.js และ rooms.js

  ทำไมต้องมี:
    - ก่อนหน้านี้แต่ละไฟล์ require words.json ตรง ๆ (ข้อมูลผูกกับไฟล์)
    - Phase 1B ย้ายคำเข้า DB แล้ว แต่การ query DB ทุกครั้งที่ findWord ช้า
    - โมดูลนี้โหลดคำทั้งหมดจาก DB "ครั้งเดียว" เก็บใน memory แล้วให้ lookup แบบ sync
    - ถ้า DB อ่านไม่ได้/ยังว่าง จะ fallback ไป words.json อัตโนมัติ (dual-read)

  ข้อมูลคำศัพท์เป็นชุดคงที่ (ไม่เปลี่ยนระหว่างรัน) การ cache จึงปลอดภัย
  ถ้าในอนาคตมีการแก้คำผ่าน admin ค่อยเพิ่มฟังก์ชัน invalidate()
*/
const path = require('path');
const pool = require('../config/db');
const wordsJson = require(path.join(__dirname, '..', 'data', 'words.json'));

const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);

let byLevel = null;      // { A1: [ {id,word,pos,category,level}, ... ] }
let byId = null;         // Map(id -> word)
let contentCounts = null; // { A1: จำนวนคำ content, ... }
let loadedFrom = null;   // 'db' | 'json'

function indexData(levels) {
  byLevel = {};
  byId = new Map();
  contentCounts = {};
  for (const lvl of VALID_LEVELS) {
    const list = levels[lvl] || [];
    byLevel[lvl] = list;
    list.forEach((w) => byId.set(w.id, w));
    contentCounts[lvl] = list.filter((w) => CONTENT_CATEGORIES.has(w.category)).length;
  }
}

// ชนิดคำมาตรฐาน -> ตัวย่อที่แสดงบนการ์ด / category ที่ระบบเดิมใช้กรองคำเนื้อหา
const POS_ABBR = {
  noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.',
  conjunction: 'conj.', determiner: 'det.', exclamation: 'exclam.', number: 'number',
  'modal verb': 'modal v.', 'auxiliary verb': 'aux. v.', 'indefinite article': 'indefinite article',
  'definite article': 'definite article', 'infinitive marker': 'infinitive marker',
};
const POS_CATEGORY = { noun: 'noun', verb: 'verb', adjective: 'adj', adverb: 'adv' };

let vocabSource = null; // 'oxford' | 'legacy' | 'json'

/*
  แหล่งคำศัพท์ (ตั้งด้วย VOCAB_SOURCE):
    oxford (ค่าเริ่มต้น) — vocab_senses (Oxford 3000/5000, ID แบบ A1-S0001)
    legacy               — ตาราง words เดิม (ID แบบ A1-0001) ใช้ย้อนกลับฉุกเฉิน
  ทุกแหล่งส่งข้อมูลรูปแบบเดียวกัน {id, word, pos, category, level} ระบบอื่นจึงไม่ต้องแก้
*/
async function loadOxford() {
  const { rows } = await pool.query(
    `SELECT s.public_id AS id, e.headword, s.sense_label, s.pos AS pos_full, s.cefr AS level,
            s.id AS sense_id, s.thai_meaning, s.translation_status, s.translation_note
       FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
      WHERE s.public_id IS NOT NULL AND NOT s.is_supplemental
      ORDER BY s.display_order`
  );
  if (rows.length === 0) return false;
  const levels = {};
  for (const lvl of VALID_LEVELS) levels[lvl] = [];
  rows.forEach((r) => {
    // คำแปลใช้ได้ = ตรวจแล้ว หรือ ยังไม่ตรวจแต่ไม่ถูก flag (คำที่ flag ไม่ใช้ในแบบทดสอบจนกว่าจะตรวจ)
    const thaiUsable = r.thai_meaning && (r.translation_status === 'reviewed'
      || (r.translation_status === 'unreviewed' && !r.translation_note));
    const w = {
      id: r.id,
      word: r.sense_label ? `${r.headword} (${r.sense_label})` : r.headword,
      pos: POS_ABBR[r.pos_full] || '',
      category: POS_CATEGORY[r.pos_full] || (r.pos_full || 'other'),
      level: r.level,
      senseId: r.sense_id,
      headword: r.headword,
      thai: thaiUsable ? r.thai_meaning : null,
    };
    if (levels[w.level]) levels[w.level].push(w);
  });
  indexData(levels);
  return true;
}

async function loadLegacy() {
  const { rows } = await pool.query('SELECT id, word, pos, category, cefr AS level FROM words ORDER BY id');
  if (rows.length === 0) return false;
  const levels = {};
  for (const lvl of VALID_LEVELS) levels[lvl] = [];
  rows.forEach((r) => { if (levels[r.level]) levels[r.level].push(r); });
  indexData(levels);
  return true;
}

async function load() {
  const wantLegacy = process.env.VOCAB_SOURCE === 'legacy';
  try {
    if (!wantLegacy && await loadOxford()) {
      loadedFrom = 'db'; vocabSource = 'oxford';
      console.log(`[wordStore] โหลดคำศัพท์ Oxford ${byId.size} sense`);
      return;
    }
    if (await loadLegacy()) {
      loadedFrom = 'db'; vocabSource = 'legacy';
      console.log(`[wordStore] โหลดคำศัพท์ชุดเดิม ${byId.size} คำ${wantLegacy ? ' (VOCAB_SOURCE=legacy)' : ' (ฐาน Oxford ยังไม่พร้อม)'}`);
      return;
    }
  } catch (err) {
    console.error('[wordStore] อ่าน DB ไม่ได้ ใช้ fallback JSON:', err.message);
  }
  indexData(wordsJson.levels);
  loadedFrom = 'json'; vocabSource = 'json';
  console.log(`[wordStore] โหลดคำศัพท์จาก JSON (fallback) ${byId.size} คำ`);
}

// ให้แน่ใจว่าโหลดแล้วก่อนใช้ (เรียกครั้งแรกจะโหลด ครั้งถัดไปคืนทันที)
let loadingPromise = null;
async function ready() {
  if (byId) return;
  if (!loadingPromise) loadingPromise = load();
  await loadingPromise;
}

// ---- lookup แบบ sync (ต้อง ready() ก่อน) ----
function findWord(level, wordId) {
  if (!byLevel) return null;
  // ค้นใน level ที่ระบุก่อน (เร็วกว่า) แล้วค่อย fallback หาใน byId
  const w = byId.get(wordId);
  if (w && (!level || w.level === level)) return w;
  return null;
}

function getLevelWords(level) {
  return (byLevel && byLevel[level]) || [];
}

function getContentCount(level) {
  return (contentCounts && contentCounts[level]) || 0;
}

// คำที่ "ฝึกได้จริง" ในแบบฝึก/Learning Path: คำเนื้อหาที่มีคำแปลไทยใช้ได้
// (โหมด Oxford: คำที่คำแปลถูก flag ว่ารอตรวจ ไม่ถูกใช้เป็นโจทย์ -> ต้องไม่นับในยอดความคืบหน้า
//  ไม่งั้น Unit/ระดับไม่มีวันถึง 100% และ Unit ที่เหลือแต่คำรอตรวจจะเริ่มฝึกไม่ได้)
function isPlayableWord(w) {
  return Boolean(w && CONTENT_CATEGORIES.has(w.category) && (vocabSource !== 'oxford' || w.thai));
}
function isPlayable(wordId) {
  return isPlayableWord(byId && byId.get(wordId));
}
function getPlayableCount(level) {
  return getLevelWords(level).filter(isPlayableWord).length;
}

function isContentWord(wordId) {
  const w = byId && byId.get(wordId);
  return Boolean(w && CONTENT_CATEGORIES.has(w.category));
}

function getSource() { return loadedFrom; }
function getVocabSource() { return vocabSource; }

// คำแปลไทยที่ใช้ในแบบทดสอบได้ (เฉพาะโหมด Oxford; คำที่ถูก flag คืน null)
function getThai(wordId) {
  const w = byId && byId.get(wordId);
  return (w && w.thai) || null;
}

// โหลดใหม่ (ใช้หลังแอดมินแก้คำแปล/ตอนเทสต์)
function reload() { byId = null; loadingPromise = null; return ready(); }

module.exports = {
  ready,
  reload,
  getVocabSource,
  getThai,
  findWord,
  getLevelWords,
  getContentCount,
  getPlayableCount,
  isPlayable,
  isContentWord,
  getSource,
  CONTENT_CATEGORIES,
  VALID_LEVELS,
};
