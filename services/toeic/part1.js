/*
  TOEIC-style Listening Part 1 — Practice / Mock Test (ตรวจคำตอบ + EXP + Error Notebook + Analytics ฝั่งเซิร์ฟเวอร์ทั้งหมด)

  ความปลอดภัย:
    - หน้าเว็บได้แค่ภาพ + ไฟล์เสียง + เวลาเริ่มของ A–D (ไม่มีข้อความ/เฉลย/alt ก่อนตอบ)
    - ตรวจคำตอบจาก (session, questionId, selected) กับ variant ที่เซิร์ฟเวอร์สุ่มให้ — หน้าเว็บบอก "ถูก" เองไม่ได้
    - ตอบข้อเดิมซ้ำไม่ได้ · EXP ให้ผ่าน utils/exp.js (grantOnce + เพดานต่อวัน) เท่านั้น
  Practice : ฟังซ้ำได้ · หลังตอบเปิด Transcript / คำแปล / เฉลย / คำอธิบาย / วิเคราะห์ภาพ / คำศัพท์ / วิเคราะห์ตัวลวง / Tip
  Mock     : 6 ข้อ · เสียงเล่นครั้งเดียว (บังคับฝั่งหน้าเว็บ) · ไม่มี feedback ระหว่างข้อ · ผลและ Review หลังจบชุด
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { grantOnce, mergeGrants } = require('../../utils/exp');
const { PART1, VOICES, ACCENTS, AUDIO, DISCLAIMER_TH, PARTS } = require('../../config/toeic');
const { LETTERS } = require('./part1Validator');

class ToeicError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const DISTRACTOR_TH = {
  wrongAction: 'การกระทำผิด (Wrong action)',
  wrongObject: 'สิ่งของผิด (Wrong object)',
  wrongPersonNumber: 'บุคคล/จำนวนผิด (Wrong person / number)',
  wrongLocation: 'สถานที่ผิด (Wrong location)',
  wrongPreposition: 'ตำแหน่ง/บุพบทผิด (Wrong position)',
  similarSound: 'คำเสียงคล้าย (Similar sound)',
  correctNounWrongAction: 'มีของในภาพ แต่การกระทำผิด (Correct noun, wrong action)',
  wrongState: 'สภาพผิด (Wrong state)',
};
const SKILL_TH = {
  action: 'การกระทำ', object: 'สิ่งของ', person: 'บุคคล', location: 'สถานที่', position: 'ท่าทาง/ตำแหน่ง',
  preposition: 'บุพบทบอกตำแหน่ง', passive: 'Passive Voice', presentContinuous: 'Present Continuous',
  presentPerfectPassive: 'Present Perfect Passive', state: 'สภาพ/สถานะ', quantity: 'จำนวน', spatial: 'ความสัมพันธ์เชิงพื้นที่',
  inference: 'อนุมานจากภาพ',
};
const groupOf = (skill) => Object.keys(PART1.skillGroups).find((g) => PART1.skillGroups[g].includes(skill)) || 'objects';
const groupsOfQ = (q) => [...new Set(q.skills.map(groupOf))];

/* ---------------- การเลือกข้อ ---------------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedPick(items, weight, n) {
  const left = items.map((x) => ({ x, w: Math.max(0.001, weight(x)) }));
  const out = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total; let i = 0;
    for (; i < left.length - 1; i += 1) { r -= left[i].w; if (r <= 0) break; }
    out.push(left.splice(i, 1)[0].x);
  }
  return out;
}
function topicMatch(q, topic) {
  switch (topic) {
    case 'people': return q.category !== 'no-person';
    case 'objects': return q.category === 'no-person';
    case 'workplace': return ['workplace', 'office', 'construction'].includes(q.topic);
    case 'transportation': return q.topic === 'transportation';
    case 'shopping': return ['shopping', 'restaurant'].includes(q.topic);
    case 'outdoor': return q.sceneType === 'outdoor';
    default: return true;
  }
}

/** ประวัติของผู้เรียน: ข้อที่เคยทำ (ล่าสุด) + ความแม่นยำต่อกลุ่มทักษะ */
async function history(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (question_id) question_id, variant, is_correct, created_at
       FROM toeic_answers WHERE user_id = $1 AND part = 1 ORDER BY question_id, created_at DESC`, [userId]);
  const last = new Map(rows.map((r) => [r.question_id, r]));
  const agg = await pool.query(
    `SELECT skills, is_correct FROM toeic_answers WHERE user_id = $1 AND part = 1 ORDER BY created_at DESC LIMIT 300`, [userId]);
  const groups = {};
  agg.rows.forEach((r) => [...new Set(r.skills.map(groupOf))].forEach((g) => {
    groups[g] = groups[g] || { n: 0, ok: 0 }; groups[g].n += 1; if (r.is_correct) groups[g].ok += 1;
  }));
  const total = agg.rows.length;
  const acc = total ? agg.rows.filter((r) => r.is_correct).length / total : null;
  return { last, groups, total, acc };
}

/** variant: สลับลำดับ/สำเนียงจากครั้งก่อน (ลดการจำว่า "รูปนี้ตอบ C") · กรองสำเนียงได้ */
function chooseVariant(q, prev, accent) {
  let vs = q.variants.filter((v) => v.audio);
  if (accent && accent !== 'mixed') { const f = vs.filter((v) => v.speakerAccent === accent); if (f.length) vs = f; }
  if (prev && vs.length > 1) { const other = vs.filter((v) => v.v !== prev.variant); if (other.length) vs = other; }
  return vs[Math.floor(Math.random() * vs.length)];
}

async function pickPractice(userId, cfg) {
  const all = (await bank.pool1()).filter((q) => q.variants.some((v) => v.audio));
  const h = await history(userId);
  let candidates = all.filter((q) => topicMatch(q, cfg.topic));
  if (cfg.source === 'mistakes') {
    candidates = all.filter((q) => h.last.has(q.id) && !h.last.get(q.id).is_correct);
    if (!candidates.length) throw new ToeicError('NO_MISTAKES', 'ยังไม่มีข้อที่ตอบผิดให้ทบทวน — เก่งมาก!', 404);
    return { items: shuffle(candidates).slice(0, cfg.size), h, adaptive: null };
  }
  let adaptive = null;
  if (cfg.difficulty === 'adaptive') {
    if (h.total >= PART1.adaptiveMinAnswers) {
      // ทักษะที่อ่อน (แม่นยำ < 70%) -> เพิ่มข้อประเภทนั้น · แม่นยำสูง -> เพิ่มความยาก
      const weak = Object.entries(h.groups).filter(([, s]) => s.n >= 3 && s.ok / s.n < 0.7).map(([g]) => g);
      const target = h.acc >= 0.85 ? 'hard' : h.acc >= 0.6 ? 'medium' : 'easy';
      adaptive = { weak, target, accuracy: Math.round(h.acc * 100) };
    } else adaptive = { weak: [], target: null, warmingUp: true, need: PART1.adaptiveMinAnswers - h.total };
  } else if (['easy', 'medium', 'hard'].includes(cfg.difficulty)) {
    const f = candidates.filter((q) => q.difficulty === cfg.difficulty);
    if (f.length >= Math.min(cfg.size, 3)) candidates = f;
  }
  const DIFF = ['easy', 'medium', 'hard'];
  const weight = (q) => {
    const seen = h.last.get(q.id);
    let w = seen ? (seen.is_correct ? 0.35 : 1.6) : 2.2;                // ข้อใหม่ก่อน · ข้อที่เคยผิดกลับมาบ่อยกว่า
    if (adaptive && adaptive.target) {
      const d = Math.abs(DIFF.indexOf(q.difficulty) - DIFF.indexOf(adaptive.target));
      w *= [2.2, 1, 0.45][d];
      if (groupsOfQ(q).some((g) => adaptive.weak.includes(g))) w *= 2.5;
    }
    return w;
  };
  return { items: weightedPick(candidates, weight, cfg.size), h, adaptive };
}

/** Mock: 6 ข้อ ผสมแบบชุดจำลองมาตรฐาน (คนเดียว/หลายคน/ไม่มีคน × ง่าย/กลาง/ยาก) — ไม่ปรับตามผู้เรียน */
async function pickMock(userId) {
  const all = (await bank.pool1()).filter((q) => q.variants.some((v) => v.audio));
  const h = await history(userId);
  const fresh = (q) => (h.last.has(q.id) ? 0.4 : 2);
  const plan = [['one-person', 'easy'], ['one-person', 'medium'], ['multi-person', 'medium'], ['multi-person', 'hard'], ['no-person', 'easy'], ['no-person', 'hard']];
  const used = new Set(); const items = [];
  for (const [cat, diff] of plan) {
    let c = all.filter((q) => !used.has(q.id) && q.category === cat && q.difficulty === diff);
    if (!c.length) c = all.filter((q) => !used.has(q.id) && q.category === cat);
    if (!c.length) c = all.filter((q) => !used.has(q.id));
    const [q] = weightedPick(c, fresh, 1);
    if (q) { used.add(q.id); items.push(q); }
  }
  // ลำดับแบบข้อสอบ: เริ่มจากภาพคน แล้วสลับ
  return { items: shuffle(items), h };
}

/* ---------------- ส่วนที่ส่งให้หน้าเว็บ ---------------- */
function publicItem(q, variant, n) {
  const a = variant.audio;
  return {
    n, qid: q.id,
    image: { url: q.imageAsset.url, small: q.imageAsset.urlSmall, width: q.imageAsset.width, height: q.imageAsset.height },
    audio: { url: a.url, duration: a.duration, segments: a.segments.map((s) => ({ letter: s.letter, start: s.start, end: s.end })) },
  };
}

/** feedback เต็ม (หลังตอบใน Practice / ตอน Review) — เรียงตามลำดับเสียงที่ผู้เรียนได้ยิน */
function feedback(q, variantNo, selected = null) {
  const v = q.variants.find((x) => x.v === variantNo) || q.variants[0];
  const statements = v.order.map((i, k) => {
    const s = q.statements[i];
    return { letter: LETTERS[k], text: s.text, translationTH: s.translationTH, isCorrect: s.isCorrect,
      distractorType: s.distractorType, distractorTH: s.distractorType ? DISTRACTOR_TH[s.distractorType] : 'ถูกต้อง (Correct)',
      explanationTH: s.explanationTH };
  });
  return {
    qid: q.id, selected, correctOption: v.correctOption, isCorrect: selected ? selected === v.correctOption : null,
    statements, why: q.explanationTH, tip: q.tipTH, photo: q.photoAnalysis, imageAlt: q.imageAlt,
    vocabulary: q.vocabulary, clues: q.imageClues, skills: q.skills.map((s) => ({ id: s, th: SKILL_TH[s] || s })),
    difficulty: q.difficulty, category: q.category,
    speaker: { accent: v.speakerAccent, label: ACCENTS[v.speakerAccent], voice: VOICES[v.speakerId] ? VOICES[v.speakerId].gender : null },
    image: { url: q.imageAsset.url, small: q.imageAsset.urlSmall },
    audio: v.audio ? { url: v.audio.url, duration: v.audio.duration, segments: v.audio.segments } : null,
  };
}

/* ---------------- Session ---------------- */
function normConfig(mode, body = {}) {
  if (mode === 'mock') return { size: PART1.mockSize };
  const size = PART1.practiceSizes.includes(Number(body.size)) ? Number(body.size) : 10;
  const difficulty = ['easy', 'medium', 'hard', 'adaptive', 'mixed'].includes(body.difficulty) ? body.difficulty : 'mixed';
  const topic = PART1.topics.includes(body.topic) ? body.topic : 'mixed';
  const accent = ['mixed', 'us', 'uk'].includes(body.accent) ? body.accent : 'mixed';
  const source = body.source === 'mistakes' ? 'mistakes' : 'bank';
  return { size, difficulty, topic, accent, source };
}

async function startSession(userId, mode, body = {}) {
  if (!['practice', 'mock'].includes(mode)) throw new ToeicError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  // ชุดที่ยังทำไม่จบของโหมดเดียวกัน -> ปิดเป็น abandoned (ไม่มีผลต่อคะแนน/EXP)
  await pool.query(`UPDATE toeic_sessions SET status = 'abandoned', finished_at = NOW()
                     WHERE user_id = $1 AND part = 1 AND mode = $2 AND status = 'active'`, [userId, mode]);
  const cfg = normConfig(mode, body);
  const picked = mode === 'mock' ? await pickMock(userId) : await pickPractice(userId, cfg);
  if (!picked.items.length) throw new ToeicError('EMPTY_POOL', 'ยังไม่มีข้อที่พร้อมใช้งาน', 503);
  const items = picked.items.map((q) => ({ qid: q.id, variant: chooseVariant(q, picked.h.last.get(q.id), cfg.accent).v }));
  const { rows } = await pool.query(
    `INSERT INTO toeic_sessions (user_id, part, mode, config, items, total) VALUES ($1, 1, $2, $3, $4, $5) RETURNING id`,
    [userId, mode, JSON.stringify({ ...cfg, adaptive: picked.adaptive || null }), JSON.stringify(items), items.length]);
  return getSession(userId, rows[0].id);
}

async function loadSession(userId, sid) {
  if (!/^\d{1,15}$/.test(String(sid))) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const { rows } = await pool.query('SELECT * FROM toeic_sessions WHERE id = $1 AND user_id = $2', [sid, userId]);
  if (!rows[0]) throw new ToeicError('NOT_FOUND', 'ไม่พบชุดฝึกนี้', 404);
  const ans = await pool.query('SELECT * FROM toeic_answers WHERE session_id = $1 ORDER BY id', [sid]);
  return { s: rows[0], answers: ans.rows };
}

async function getSession(userId, sid) {
  const { s, answers } = await loadSession(userId, sid);
  const items = [];
  for (let i = 0; i < s.items.length; i += 1) {
    const it = s.items[i];
    const q = await bank.get(it.qid);
    if (!q) continue;
    const v = q.variants.find((x) => x.v === it.variant);
    const pub = publicItem(q, v, i + 1);
    const a = answers.find((x) => x.question_id === it.qid);
    if (a) {
      pub.answered = true;
      // Practice: เห็น feedback ของข้อที่ตอบแล้ว (กลับมาเล่นต่อ) · Mock: ไม่เห็นจนจบชุด
      if (s.mode === 'practice' || s.status === 'finished') pub.feedback = feedback(q, it.variant, a.selected);
    }
    items.push(pub);
  }
  const answered = answers.length;
  return {
    id: Number(s.id), mode: s.mode, part: 1, status: s.status, total: s.total, answered,
    index: Math.min(answered, s.total - 1), config: s.config, items,
    result: s.status === 'finished' ? await buildResult(s, answers) : null,
  };
}

async function answer(userId, sid, body = {}) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้จบแล้ว', 409);
  const qid = String(body.qid || '');
  const it = s.items.find((x) => x.qid === qid);
  if (!it) throw new ToeicError('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในชุดฝึก', 400);
  const selected = String(body.selected || '').toUpperCase();
  if (!LETTERS.includes(selected)) throw new ToeicError('BAD_CHOICE', 'เลือกได้เฉพาะ A, B, C หรือ D', 400);
  if (answers.some((a) => a.question_id === qid)) throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  // Mock: ต้องตอบตามลำดับ (ไม่ข้ามไปข้อถัดไปแล้วย้อนกลับ)
  if (s.mode === 'mock' && s.items[answers.length].qid !== qid) throw new ToeicError('OUT_OF_ORDER', 'ตอบตามลำดับข้อ', 409);
  const q = await bank.get(qid);
  const v = q.variants.find((x) => x.v === it.variant);
  const isCorrect = selected === v.correctOption;
  const chosen = q.statements[v.order[LETTERS.indexOf(selected)]];
  const responseMs = Math.max(0, Math.min(10 * 60 * 1000, Math.round(Number(body.responseMs) || 0))) || null;
  const ins = await pool.query(
    `INSERT INTO toeic_answers (session_id, user_id, question_id, part, mode, variant, selected, correct_option, is_correct,
                                distractor_type, skill, skills, category, difficulty, accent, response_ms)
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (session_id, question_id) DO NOTHING RETURNING id`,
    [sid, userId, qid, s.mode, it.variant, selected, v.correctOption, isCorrect, isCorrect ? null : chosen.distractorType,
      q.skills[0], q.skills, q.category, q.difficulty, v.speakerAccent, responseMs]);
  if (!ins.rows[0]) throw new ToeicError('ALREADY_ANSWERED', 'ตอบข้อนี้ไปแล้ว', 409);
  // สถิติรวมเดิมของบัญชี (answer_events) — ทักษะ listening
  await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'listening', $2, 'P1', $3, 'toeic', $4)`,
    [userId, qid, isCorrect, groupOf(q.skills[0])]).catch(() => {});
  const out = { qid, answered: answers.length + 1, total: s.total, last: answers.length + 1 >= s.total };
  if (s.mode === 'practice') {
    let exp = { gained: 0, levelInfo: null, leveledUp: false };
    if (isCorrect) exp = await grantOnce(userId, `t1q:${qid}:${bkkDay()}`, PART1.exp.practiceCorrect, { reason: 'toeic_p1_practice' });
    Object.assign(out, { feedback: feedback(q, it.variant, selected), exp: exp.gained, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp });
  }
  return out;   // Mock: ไม่บอกถูก/ผิดระหว่างข้อ
}

async function assetError(userId, sid) {
  await pool.query('UPDATE toeic_sessions SET asset_errors = LEAST(asset_errors + 1, 999) WHERE id = $1 AND user_id = $2', [sid, userId]);
  return { ok: true };
}

/* ---------------- ผลลัพธ์ ---------------- */
function breakdown(answers, bankById) {
  const groups = {};
  answers.forEach((a) => {
    const q = bankById(a.question_id);
    const gs = q ? groupsOfQ(q) : [groupOf(a.skill)];
    gs.forEach((g) => { groups[g] = groups[g] || { group: g, th: PART1.skillGroupTh[g], total: 0, correct: 0 }; groups[g].total += 1; if (a.is_correct) groups[g].correct += 1; });
  });
  return Object.values(groups).map((g) => ({ ...g, accuracy: Math.round((g.correct / g.total) * 100) }))
    .sort((a, b) => Object.keys(PART1.skillGroups).indexOf(a.group) - Object.keys(PART1.skillGroups).indexOf(b.group));
}

async function buildResult(s, answers) {
  const c = await bank.ready();
  const byId = (id) => c.byId.get(id);
  const correct = answers.filter((a) => a.is_correct).length;
  const total = s.mode === 'mock' ? s.total : answers.length;
  const skills = breakdown(answers, byId);
  const ranked = skills.filter((g) => g.total >= 1).sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const times = answers.map((a) => a.response_ms).filter((x) => x > 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const result = {
    mode: s.mode, correct, incorrect: total - correct, total, accuracy: pct,
    avgResponseMs: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length) : null,
    skills, strongest: ranked[0] || null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    expAwarded: s.exp_awarded,
    label: 'Practice Score',
    estimate: s.mode === 'mock' ? (pct >= 84 ? 'สูง — พร้อมสำหรับข้อระดับยาก' : pct >= 50 ? 'ปานกลาง — ฝึกทักษะที่อ่อนเพิ่ม' : 'ควรฝึกพื้นฐานเพิ่ม') : null,
    disclaimer: 'Practice Score / Estimated performance ของ EnglishQuest — ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ',
  };
  result.review = s.items.map((it, i) => {
    const q = byId(it.qid); const a = answers.find((x) => x.question_id === it.qid);
    return q ? { n: i + 1, ...feedback(q, it.variant, a ? a.selected : null), responseMs: a ? a.response_ms : null } : null;
  }).filter(Boolean);
  return result;
}

async function finish(userId, sid) {
  const { s, answers } = await loadSession(userId, sid);
  if (s.status === 'finished') return { result: await buildResult(s, answers), exp: 0, levelInfo: null, leveledUp: false, already: true };
  if (s.status !== 'active') throw new ToeicError('SESSION_CLOSED', 'ชุดนี้ถูกยกเลิกแล้ว', 409);
  if (s.mode === 'mock' && answers.length < s.total) throw new ToeicError('UNFINISHED', `ยังตอบไม่ครบ (${answers.length}/${s.total})`, 409);
  if (!answers.length) throw new ToeicError('EMPTY', 'ยังไม่ได้ตอบข้อใดเลย', 409);
  const upd = await pool.query(
    `UPDATE toeic_sessions SET status = 'finished', finished_at = NOW(), score = $3 WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
    [sid, userId, answers.filter((a) => a.is_correct).length]);
  if (!upd.rows[0]) return finish(userId, sid);       // จบพร้อมกันจากอีกคำขอ
  const correct = answers.filter((a) => a.is_correct).length;
  const grants = [];
  const E = PART1.exp;
  if (s.mode === 'practice') {
    if (answers.length >= Math.min(5, s.total)) {
      grants.push(await grantOnce(userId, `t1c:${sid}`, E.practiceComplete, { reason: 'toeic_p1_done', dailyCap: E.practiceComplete * E.practiceCompletePerDay }));
      if (correct === answers.length && answers.length >= 5) grants.push(await grantOnce(userId, `t1p:${sid}`, E.practicePerfect, { reason: 'toeic_p1_perfect', dailyCap: E.practicePerfect * E.practiceCompletePerDay }));
    }
  } else {
    // Mock: ครั้งแรกของวันได้เต็ม · ครั้งต่อไปน้อยลง · เกิน 3 ครั้ง/วันไม่ได้ EXP (กันฟาร์ม)
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM toeic_sessions WHERE user_id = $1 AND part = 1 AND mode = 'mock' AND status = 'finished' AND id <> $2
          AND finished_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId, sid]);
    const n = rows[0].n;
    if (n < E.mockCompletePerDay) grants.push(await grantOnce(userId, `t1m:${sid}`, n === 0 ? E.mockComplete : E.mockRepeat, { reason: 'toeic_p1_mock' }));
    if (correct === s.total) grants.push(await grantOnce(userId, `t1mp:${sid}`, E.mockPerfect, { reason: 'toeic_p1_mock_perf', dailyCap: E.mockPerfect }));
  }
  const g = grants.length ? mergeGrants(grants) : { gained: 0, levelInfo: null, leveledUp: false };
  await pool.query('UPDATE toeic_sessions SET exp_awarded = $2 WHERE id = $1', [sid, g.gained]);
  const s2 = { ...upd.rows[0], exp_awarded: g.gained };
  return { result: await buildResult(s2, answers), exp: g.gained, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
}

/* ---------------- Landing / Analytics / Error Notebook ---------------- */
const RANGE = { '7': "NOW() - INTERVAL '7 days'", '30': "NOW() - INTERVAL '30 days'", all: "'-infinity'::timestamptz" };

async function summary(userId, range = 'all') {
  const since = RANGE[range] || RANGE.all;
  const { rows } = await pool.query(
    `SELECT question_id, is_correct, skills, category, accent, distractor_type, response_ms, mode
       FROM toeic_answers WHERE user_id = $1 AND part = 1 AND created_at >= ${since}`, [userId]);
  const c = await bank.ready();
  const total = rows.length;
  const correct = rows.filter((r) => r.is_correct).length;
  const skills = breakdown(rows.map((r) => ({ ...r, skill: r.skills[0] })), (id) => c.byId.get(id));
  const cat = (pred) => { const xs = rows.filter(pred); return xs.length ? { total: xs.length, accuracy: Math.round((xs.filter((r) => r.is_correct).length / xs.length) * 100) } : null; };
  const traps = {};
  rows.filter((r) => !r.is_correct && r.distractor_type).forEach((r) => { traps[r.distractor_type] = (traps[r.distractor_type] || 0) + 1; });
  const best = await pool.query(
    `SELECT mode, MAX(score::float / NULLIF(total, 0)) AS best, COUNT(*)::int AS n FROM toeic_sessions
      WHERE user_id = $1 AND part = 1 AND status = 'finished' AND total >= 5 GROUP BY mode`, [userId]);
  const bestOf = (m) => { const r = best.rows.find((x) => x.mode === m); return r && r.best !== null ? { percent: Math.round(r.best * 100), sessions: r.n } : null; };
  const mistakes = await mistakeIds(userId);
  const active = await pool.query(`SELECT id, mode, total, (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
      FROM toeic_sessions s WHERE user_id = $1 AND part = 1 AND status = 'active' ORDER BY started_at DESC LIMIT 2`, [userId]);
  const weakest = skills.filter((g) => g.total >= 3).sort((a, b) => a.accuracy - b.accuracy)[0] || null;
  return {
    range, answered: total, practiced: new Set(rows.map((r) => r.question_id)).size, correct,
    accuracy: total ? Math.round((correct / total) * 100) : null,
    bestPractice: bestOf('practice'), bestMock: bestOf('mock'),
    weakSkill: weakest, skills,
    photos: { people: cat((r) => r.category !== 'no-person'), noPerson: cat((r) => r.category === 'no-person') },
    accents: { us: cat((r) => r.accent === 'us'), uk: cat((r) => r.accent === 'uk') },
    traps: Object.entries(traps).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, n]) => ({ type, th: DISTRACTOR_TH[type], n })),
    mistakes: mistakes.length,
    activeSessions: active.rows.map((r) => ({ id: Number(r.id), mode: r.mode, total: r.total, answered: r.answered })),
    bankSize: c.part1.length,
  };
}

/** ข้อที่ "ครั้งล่าสุด" ยังตอบผิด (ตอบถูกในภายหลัง = หลุดจากรายการ) */
async function mistakeIds(userId) {
  const { rows } = await pool.query(
    `SELECT question_id, variant, selected, created_at, distractor_type, response_ms, accent, difficulty, skill FROM (
       SELECT DISTINCT ON (question_id) * FROM toeic_answers WHERE user_id = $1 AND part = 1 ORDER BY question_id, created_at DESC) t
      WHERE NOT is_correct ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows;
}

async function mistakes(userId) {
  const c = await bank.ready();
  const rows = await mistakeIds(userId);
  return {
    items: rows.map((r) => {
      const q = c.byId.get(r.question_id);
      if (!q) return null;
      return { ...feedback(q, r.variant, r.selected), answeredAt: r.created_at, distractorSelected: r.distractor_type,
        distractorSelectedTH: DISTRACTOR_TH[r.distractor_type] || null, responseMs: r.response_ms };
    }).filter(Boolean),
  };
}

/* ---------------- Vocabulary ---------------- */
async function essentialVocab(userId) {
  const c = await bank.ready();
  const map = new Map();
  c.part1.forEach((q) => q.vocabulary.forEach((v) => {
    const k = `${v.word}|${v.pos}`;
    if (!map.has(k)) map.set(k, { ...v, questions: 0 });
    map.get(k).questions += 1;
  }));
  const items = [...map.values()];
  const ids = items.map((v) => v.wordId).filter(Boolean);
  const inReview = new Set();
  if (ids.length) {
    const { rows } = await pool.query('SELECT word_id FROM word_progress WHERE user_id = $1 AND word_id = ANY($2::text[])', [userId, ids]);
    rows.forEach((r) => inReview.add(r.word_id));
  }
  const ORDER = ['actions', 'people', 'objects', 'locations', 'prepositions', 'workplace', 'transportation', 'shopping', 'restaurant', 'construction', 'office'];
  const TH = { actions: 'การกระทำ (Actions)', people: 'บุคคล (People)', objects: 'สิ่งของ (Objects)', locations: 'สถานที่ (Locations)',
    prepositions: 'บุพบท/ตำแหน่ง (Prepositions)', workplace: 'ที่ทำงาน (Workplace)', transportation: 'การเดินทาง (Transportation)',
    shopping: 'การซื้อของ (Shopping)', restaurant: 'ร้านอาหาร (Restaurant)', construction: 'งานก่อสร้าง (Construction)', office: 'สำนักงาน (Office)' };
  return {
    tag: 'toeicListeningPart1', total: items.length,
    groups: ORDER.map((g) => ({ id: g, th: TH[g],
      words: items.filter((v) => v.group === g).sort((a, b) => a.word.localeCompare(b.word))
        .map((v) => ({ ...v, inReview: Boolean(v.wordId && inReview.has(v.wordId)) })) })).filter((g) => g.words.length),
  };
}

/** "เพิ่มเข้ารายการทบทวน" — ใช้ word_progress / SRS เดิม (เฉพาะคำที่ผูกกับคลังคำศัพท์แล้ว) */
async function addToReview(userId, wordId) {
  const c = await bank.ready();
  const known = c.part1.some((q) => q.vocabulary.some((v) => v.wordId === wordId));
  if (!known) throw new ToeicError('UNKNOWN_WORD', 'คำนี้ยังไม่อยู่ในคลังคำศัพท์', 404);
  const level = wordId.slice(0, 2);
  const { rows } = await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW())
     RETURNING (xmax = 0) AS inserted`, [userId, wordId, level]);
  return { ok: true, wordId, added: Boolean(rows[0] && rows[0].inserted) };
}

function meta() {
  return {
    parts: PARTS, disclaimer: DISCLAIMER_TH, audioCheckUrl: AUDIO.checkUrl,
    practice: { sizes: PART1.practiceSizes, topics: PART1.topics, accents: ['mixed', 'us', 'uk'], accentLabels: ACCENTS,
      difficulties: ['mixed', 'easy', 'medium', 'hard', 'adaptive'] },
    mockSize: PART1.mockSize, exp: PART1.exp,
  };
}

module.exports = {
  ToeicError, startSession, getSession, answer, finish, assetError, summary, mistakes, essentialVocab, addToReview, meta,
  _internal: { feedback, publicItem, pickMock, pickPractice, chooseVariant, groupOf, normConfig },
};
