/*
  Speaking (ฝึกพูด) — ความคืบหน้า · คะแนน · EXP
  - พูด: เบราว์เซอร์แปลงเสียงเป็นข้อความ (Web Speech API — ฟรี ไม่ใช้ AI ที่คิดเงิน) แล้วส่ง "ข้อความที่ได้ยิน" มา
      v1.10.0 Phase 3: เซิร์ฟเวอร์ให้คะแนนเอง (เดิมเชื่อคะแนนที่หน้าเว็บส่งมา) · ข้อความใช้คำนวณแล้วทิ้ง ไม่บันทึก/ไม่ log
      ยังเป็นข้อมูลจากเครื่องผู้ใช้ จึงให้รางวัลน้อย + มีเพดานเหมือนเดิม
      EXP ครั้งแรกที่ผ่าน (≥ 70) ของแต่ละประโยค/คำ 2 EXP · รวมพูด+พิมพ์ไม่เกิน 40 EXP/วัน · ไม่มี Coin
  - ฟังแล้วพิมพ์: เซิร์ฟเวอร์ตรวจคำตอบเอง (ตัวให้คะแนนเดียวกับหน้าเว็บ)
  - ไม่เก็บเสียง/ข้อความที่ได้ยิน — เก็บแค่คะแนน
*/
const pool = require('../../config/db');
const { grantOnce } = require('../../utils/exp');
const SC = require('../../public/js/speak-score');
const C = require('./content');

class SpeakError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const PASS = SC.PASS;
const EXP_PER_ITEM = 2;
const DAILY_CAP = 40;
const KIND_TH = { sentences: 'ประโยค', words: 'คำศัพท์', dialogues: 'บทสนทนา' };

async function meta() {
  const ix = await C.ready();
  const levels = C.LEVELS.map((L) => {
    const b = ix.byLevel[L];
    const n = (k) => b[k].reduce((a, id) => a + ix.sets.get(id).items.length, 0);
    return { id: L, sentences: n('sentences'), words: n('words'), dialogues: b.dialogues.length };
  });
  return { levels, pass: PASS, expPerItem: EXP_PER_ITEM, dailyCap: DAILY_CAP, kinds: KIND_TH,
    note: 'คะแนนวัด "ความชัดเจน" — ระบบรู้จำเสียงของเบราว์เซอร์ฟังออกกี่คำ ไม่ใช่การวิเคราะห์เสียงแบบครูตรวจ' };
}

async function bestMap(userId, itemIds) {
  if (!itemIds.length) return new Map();
  const { rows } = await pool.query(
    'SELECT item_id, best_speak, best_type, attempts FROM speaking_progress WHERE user_id = $1 AND item_id = ANY($2::text[])', [userId, itemIds]);
  return new Map(rows.map((r) => [r.item_id, r]));
}
const bestOf = (r) => (r ? Math.max(r.best_speak == null ? -1 : r.best_speak, r.best_type == null ? -1 : r.best_type) : -1);

async function listSets(userId, level, kind) {
  const ix = await C.ready();
  if (!C.LEVELS.includes(level)) throw new SpeakError('BAD_LEVEL', 'ระดับไม่ถูกต้อง');
  if (!KIND_TH[kind]) throw new SpeakError('BAD_KIND', 'ประเภทไม่ถูกต้อง');
  const ids = ix.byLevel[level][kind];
  const all = ids.flatMap((id) => ix.sets.get(id).items);
  const best = await bestMap(userId, all);
  const sets = ids.map((id) => {
    const s = ix.sets.get(id);
    const scores = s.items.map((i) => bestOf(best.get(i)));
    const tried = scores.filter((x) => x >= 0);
    return { id, kind: s.kind, title: s.title, titleTh: s.titleTh, count: s.items.length, speakers: s.speakers || null,
      passed: scores.filter((x) => x >= PASS).length, tried: tried.length, avg: tried.length ? Math.round(tried.reduce((a, b) => a + b, 0) / tried.length) : null };
  });
  return { level, kind, sets };
}

async function getSet(userId, setId) {
  const ix = await C.ready();
  const s = ix.sets.get(String(setId || ''));
  if (!s) throw new SpeakError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const best = await bestMap(userId, s.items);
  let ipa = new Map();
  if (s.kind === 'words') {
    try { ipa = await require('../../utils/vocabContent').getContent(s.items.map((i) => ix.items.get(i).wordId)); } catch (_) { ipa = new Map(); }
  }
  const items = s.items.map((i) => {
    const it = ix.items.get(i); const b = best.get(i);
    const c = it.wordId ? ipa.get(it.wordId) : null;
    return { id: it.id, kind: it.kind, text: it.text, th: it.th, speaker: it.speaker || null, pos: it.pos || null, ipa: c && c.ipa ? c.ipa : null,
      best: b ? bestOf(b) : null, passed: bestOf(b) >= PASS };
  });
  // ชุดถัดไป (ไว้ทำต่อเนื่อง)
  const list = ix.byLevel[s.level][s.kind === 'dialogue' ? 'dialogues' : s.kind];
  const next = list[list.indexOf(s.id) + 1] || null;
  return { id: s.id, kind: s.kind, level: s.level, title: s.title, titleTh: s.titleTh, topicTitle: s.topicTitle || null, speakers: s.speakers || null, items, next };
}

async function record(userId, it, sc, mode) {
  const col = mode === 'type' ? 'best_type' : 'best_speak';
  const { rows } = await pool.query(
    `INSERT INTO speaking_progress (user_id, item_id, level, ${col}, attempts, last_score, first_pass_at)
     VALUES ($1, $2, $3, $4::smallint, 1, $4::smallint, CASE WHEN $4::int >= $5::int THEN NOW() END)
     ON CONFLICT (user_id, item_id) DO UPDATE SET ${col} = GREATEST(COALESCE(speaking_progress.${col}, 0), EXCLUDED.${col}),
       attempts = speaking_progress.attempts + 1, last_score = EXCLUDED.last_score,
       first_pass_at = COALESCE(speaking_progress.first_pass_at, EXCLUDED.first_pass_at), updated_at = NOW()
     RETURNING best_speak, best_type, attempts`, [userId, it.id, it.level, sc, PASS]);
  let reward = { gained: 0 };
  if (sc >= PASS) {
    reward = await grantOnce(userId, `${mode === 'type' ? 'spkd' : 'spk'}:${it.id}`, EXP_PER_ITEM, { reason: 'speaking', dailyCap: DAILY_CAP });
  }
  return { itemId: it.id, score: sc, best: bestOf(rows[0]), attempts: rows[0].attempts, passed: sc >= PASS,
    exp: reward.gained || 0, levelInfo: reward.levelInfo || null, leveledUp: Boolean(reward.leveledUp), capped: sc >= PASS && !reward.already && !reward.gained };
}
async function itemOf(itemId) {
  const ix = await C.ready();
  const it = ix.items.get(String(itemId || '').slice(0, 64));
  if (!it) throw new SpeakError('NOT_FOUND', 'ไม่พบประโยคนี้', 404);
  return it;
}
/** ผลการพูด: { itemId, heard: [ข้อความที่เบราว์เซอร์ได้ยิน 1–8 แบบ] } → เซิร์ฟเวอร์ให้คะแนนเอง (ไม่เก็บข้อความ) */
async function attempt(userId, body) {
  const it = await itemOf(body.itemId);
  const heard = body.heard;
  if (!Array.isArray(heard)) {
    // หน้าเว็บเวอร์ชันเก่าส่งคะแนนมาเอง — ไม่รับแล้ว
    if (body.score !== undefined) throw new SpeakError('SEND_HEARD', 'แอปมีเวอร์ชันใหม่ — รีเฟรชหน้าเว็บเพื่อฝึกพูดต่อ', 400);
    throw new SpeakError('BAD_HEARD', 'ต้องส่งข้อความที่ได้ยิน');
  }
  if (heard.length < 1 || heard.length > 8 || heard.some((h) => typeof h !== 'string' || h.length > 300)) {
    throw new SpeakError('BAD_HEARD', 'ข้อความที่ได้ยินไม่ถูกต้อง');
  }
  const r = SC.score(it.text, heard);
  const out = await record(userId, it, r.score, 'speak');
  return { ...out, words: r.words };   // ไม่ส่ง/ไม่เก็บข้อความที่ได้ยินกลับ
}
/** ฟังแล้วพิมพ์: ตรวจคำตอบฝั่งเซิร์ฟเวอร์ */
async function dictation(userId, body) {
  const it = await itemOf(body.itemId);
  if (typeof body.text !== 'string') throw new SpeakError('BAD_TEXT', 'ต้องส่งคำตอบเป็นข้อความ');
  const r = SC.score(it.text, body.text.slice(0, 400));
  const out = await record(userId, it, r.score, 'type');
  return { ...out, words: r.words, answer: it.text };
}
/** สรุปสำหรับหน้าแรก (Learning Progress) */
async function summary(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS tried, COUNT(*) FILTER (WHERE GREATEST(COALESCE(best_speak, 0), COALESCE(best_type, 0)) >= $2)::int AS passed,
            COALESCE(ROUND(AVG(GREATEST(COALESCE(best_speak, 0), COALESCE(best_type, 0))))::int, 0) AS avg,
            COUNT(*) FILTER (WHERE updated_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'))::int AS today
       FROM speaking_progress WHERE user_id = $1`, [userId, PASS]);
  const r = rows[0];
  return { tried: r.tried, passed: r.passed, avg: r.tried ? r.avg : null, today: r.today };
}

module.exports = { SpeakError, meta, listSets, getSet, attempt, dictation, summary, PASS, EXP_PER_ITEM, DAILY_CAP };
