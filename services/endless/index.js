/*
  v1.21.0 ทายศัพท์ไม่รู้จบ (Endless)
  - 3 หัวใจ · ตอบผิด/หมดเวลา = เสีย 1 หัวใจ · หมด 3 หัวใจ = จบเกม
  - ยากขึ้นเรื่อย ๆ ตามจำนวนข้อที่ตอบถูก: A1 → A2 → B1 → B2 → C1 (ระดับ CEFR ตามคลังคำศัพท์ — ไม่เดาเอง)
  - 2 แบบ: เห็นคำอังกฤษ เลือกความหมายไทย (en2th) · เห็นความหมายไทย เลือกคำอังกฤษ (th2en — เริ่มหลังข้อที่ 8)
  - คำถาม/ข้อถูกเก็บฝั่งเซิร์ฟเวอร์ (endless_runs.q) · หน้าเว็บได้แค่โจทย์ + ตัวเลือก จนกว่าจะตอบ
  - EXP ต่อข้อที่ถูก (ไม่มีเพดานรายวัน ตามที่เจ้าของระบบเลือก) · กันบอท: ตอบเร็วกว่า 0.6 วิหลังออกข้อ = ข้อนั้นไม่ได้ EXP
  - ข้อมูล: data/oxford/senses.json (ระดับ/ชนิดคำ) + data/oxford/thai_meanings.json — ใช้เฉพาะความหมายที่ไม่ถูกติดธงตรวจ (flagged)
    และ sense ที่ไม่ติด needsReview
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const { grantExp } = require('../../utils/exp');

class EndlessError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const CFG = {
  hearts: 3,
  answerSecs: 20,          // เวลาต่อข้อ (หน้าเว็บนับถอยหลัง) — เซิร์ฟเวอร์ให้เผื่อเครือข่ายอีก 4 วิ
  graceSecs: 4,
  minHumanMs: 600,
  idleMinutes: 15,         // ไม่เล่นเกิน 15 นาที = เกมจบเอง (นับคะแนนที่ทำได้)
  th2enFrom: 8,
  // v1.21.0 ยิ่งไปไกลตัวเลือกยิ่งเยอะ (ข้อที่ถูก 0–17 = 4 ตัวเลือก · 18–44 = 5 · 45+ = 6)
  choices: [{ from: 0, n: 4 }, { from: 18, n: 5 }, { from: 45, n: 6 }],
  // ระดับตามจำนวนข้อที่ถูก (ข้อที่ 0–7 = A1 ...)
  stages: [{ from: 0, cefr: 'A1' }, { from: 8, cefr: 'A2' }, { from: 18, cefr: 'B1' }, { from: 30, cefr: 'B2' }, { from: 45, cefr: 'C1' }],
};
const EXP_BY_CEFR = { A1: 3, A2: 4, B1: 5, B2: 6, C1: 8 };
const comboBonus = (combo) => (combo >= 20 ? 3 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0);
const CEFRS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const POS_OK = new Set(['noun', 'verb', 'adjective', 'adverb']);
const POS_TH = { noun: 'คำนาม', verb: 'คำกริยา', adjective: 'คำคุณศัพท์', adverb: 'คำกริยาวิเศษณ์' };

/* ---------------- คลังคำ ---------------- */
let BANK = null;
function bank() {
  if (BANK) return BANK;
  const senses = require('../../data/oxford/senses.json');
  const thai = require('../../data/oxford/thai_meanings.json');
  const list = [];
  for (const s of senses) {
    const m = thai[s.senseId];
    if (!m || m.flagged || s.needsReview || !POS_OK.has(s.pos) || !CEFRS.includes(s.cefr)) continue;
    const th = String(m.thai || '').trim();
    if (!th || th.length > 40 || !/^[a-z][a-z' -]*$/i.test(s.headword)) continue;
    list.push({ id: s.senseId, word: s.headword, pos: s.pos, cefr: s.cefr, th, tok: thTokens(th) });
  }
  const byKey = new Map();   // `${cefr}|${pos}` -> [...]
  const byWord = new Map();  // headword -> [...]
  for (const w of list) {
    const k = `${w.cefr}|${w.pos}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(w);
    const hw = w.word.toLowerCase();
    if (!byWord.has(hw)) byWord.set(hw, []);
    byWord.get(hw).push(w);
  }
  BANK = { list, byId: new Map(list.map((w) => [w.id, w])), byKey, byWord, byCefr: Object.fromEntries(CEFRS.map((c) => [c, list.filter((w) => w.cefr === c)])) };
  return BANK;
}
function thTokens(th) {
  return th.replace(/\([^)]*\)/g, ' ').split(/[,;/]| หรือ /).map((x) => x.trim()).filter(Boolean);
}
/** ความหมายไทยใกล้กันเกินไป (ซ้ำ/คำหนึ่งอยู่ในอีกคำ) → ใช้เป็นตัวลวงไม่ได้ */
function thClash(a, b) {
  for (const x of a.tok) for (const y of b.tok) {
    if (x === y) return true;
    if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;
  }
  return false;
}
/** คำอังกฤษนี้มีความหมายไหนที่ชนกับความหมายไทยของโจทย์ → ใช้เป็นตัวลวงแบบ th2en ไม่ได้ */
function wordClash(word, target) {
  return (bank().byWord.get(word.toLowerCase()) || []).some((s) => thClash(s, target));
}

const rnd = (n) => crypto.randomInt(n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function choicesOf(score) {
  let n = CFG.choices[0].n;
  for (const c of CFG.choices) if (score >= c.from) n = c.n;
  return n;
}
function stageOf(score) {
  let st = CFG.stages[0];
  for (const s of CFG.stages) if (score >= s.from) st = s;
  return st.cefr;
}

/** สร้างข้อใหม่ (ไม่ซ้ำคำในเกมเดียวกัน) */
function makeQuestion(score, used) {
  const B = bank();
  const usedSet = new Set(used);
  let cefr = stageOf(score);
  const idx = CEFRS.indexOf(cefr);
  if (idx > 0 && rnd(100) < 20) cefr = CEFRS[idx - 1];   // 20% ระดับก่อนหน้า — สลับจังหวะ
  const mode = score >= CFG.th2enFrom && rnd(100) < 35 ? 'th2en' : 'en2th';
  for (let tries = 0; tries < 40; tries += 1) {
    const pool0 = B.byCefr[cefr];
    const t = pool0[rnd(pool0.length)];
    if (usedSet.has(t.id) || usedSet.has(`w:${t.word.toLowerCase()}`)) continue;
    // ตัวลวง: ชนิดคำเดียวกัน ระดับเดียวกัน (ไม่พอ → ระดับใกล้เคียง)
    let cands = (B.byKey.get(`${t.cefr}|${t.pos}`) || []).slice();
    if (cands.length < 30) for (const c of CEFRS) if (c !== t.cefr) cands = cands.concat(B.byKey.get(`${c}|${t.pos}`) || []);
    shuffle(cands);
    const picked = [];
    const want = choicesOf(score) - 1;
    for (const d of cands) {
      if (picked.length >= want) break;
      if (d.word.toLowerCase() === t.word.toLowerCase() || thClash(d, t)) continue;
      if (picked.some((p) => p.word.toLowerCase() === d.word.toLowerCase() || thClash(p, d))) continue;
      if (mode === 'th2en' && wordClash(d.word, t)) continue;
      picked.push(d);
    }
    if (picked.length < want) continue;
    const opts = shuffle([t, ...picked]);
    return {
      key: crypto.randomBytes(6).toString('hex'), senseId: t.id, mode, cefr: t.cefr, pos: t.pos,
      prompt: mode === 'en2th' ? t.word : t.th,
      options: opts.map((o) => (mode === 'en2th' ? o.th : o.word)),
      optionIds: opts.map((o) => o.id),
      answer: opts.indexOf(t),
      issuedAt: Date.now(),
    };
  }
  throw new Error('endless: สร้างข้อไม่ได้');
}
/** ข้อสำหรับหน้าเว็บ — ไม่มีคำตอบ */
function publicQ(q, no) {
  return { key: q.key, no, mode: q.mode, cefr: q.cefr, pos: q.pos, posTh: POS_TH[q.pos], prompt: q.prompt, options: q.options,
    secs: CFG.answerSecs, secsLeft: Math.max(0, Math.ceil((Number(q.issuedAt) + CFG.answerSecs * 1000 - Date.now()) / 1000)),
    say: q.mode === 'en2th' ? q.prompt : null };
}
function reveal(q) {
  const w = bank().byId.get(q.senseId);
  return { word: w.word, th: w.th, pos: w.pos, posTh: POS_TH[w.pos], cefr: w.cefr };
}

/* ---------------- เกม ---------------- */
async function closeIdle(userId, db = pool) {
  await db.query(
    `UPDATE endless_runs SET status = 'over', ended_at = NOW(), q = NULL
      WHERE user_id = $1 AND status = 'active' AND last_at < NOW() - make_interval(mins => $2)`, [userId, CFG.idleMinutes]);
}
function runView(r) {
  return { id: Number(r.id), hearts: r.hearts, maxHearts: CFG.hearts, score: r.score, answered: r.answered, combo: r.combo, bestCombo: r.best_combo,
    expGained: r.exp_gained, stage: stageOf(r.score) };
}

/** เริ่มเกมใหม่ (เกมที่ค้างอยู่ = จบ นับคะแนนที่ทำได้) หรือเล่นต่อ (resume) */
async function start(userId, { resume = false } = {}) {
  await closeIdle(userId);
  const cur = (await pool.query("SELECT * FROM endless_runs WHERE user_id = $1 AND status = 'active'", [userId])).rows[0];
  if (cur && resume && cur.q) return { run: runView(cur), q: publicQ(cur.q, cur.answered + 1), resumed: true };
  if (cur) await pool.query("UPDATE endless_runs SET status = 'over', ended_at = NOW(), q = NULL WHERE id = $1", [cur.id]);
  const q = makeQuestion(0, []);
  const r = (await pool.query(
    `INSERT INTO endless_runs (user_id, hearts, q, used) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, CFG.hearts, q, [q.senseId, `w:${bank().byId.get(q.senseId).word.toLowerCase()}`]])).rows[0];
  return { run: runView(r), q: publicQ(q, 1), resumed: false };
}

/** ตอบข้อ · choice = 0–3 หรือ -1 (หมดเวลา) */
async function answer(userId, { key, choice }) {
  const ch = Number(choice);
  if (!Number.isInteger(ch) || ch < -1 || ch > 5) throw new EndlessError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  const client = await pool.connect();
  let out; let leveled = null;
  try {
    await client.query('BEGIN');
    await closeIdle(userId, client);
    const r = (await client.query("SELECT * FROM endless_runs WHERE user_id = $1 AND status = 'active' FOR UPDATE", [userId])).rows[0];
    if (!r || !r.q) throw new EndlessError('NO_RUN', 'ไม่มีเกมที่กำลังเล่น เริ่มเกมใหม่ได้เลย', 404);
    const q = r.q;
    if (String(key) !== q.key) throw new EndlessError('STALE', 'ข้อนี้ตอบไปแล้ว', 409);
    const elapsed = Date.now() - Number(q.issuedAt);
    const late = elapsed > (CFG.answerSecs + CFG.graceSecs) * 1000;
    if (ch >= q.options.length) throw new EndlessError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
    const correct = ch === q.answer && !late;
    const tooFast = correct && elapsed < CFG.minHumanMs;
    let { hearts, score, combo } = r;
    let bestCombo = r.best_combo; let gained = 0;
    const missed = r.missed || [];
    if (correct) {
      score += 1; combo += 1; bestCombo = Math.max(bestCombo, combo);
      if (!tooFast) gained = EXP_BY_CEFR[q.cefr] + comboBonus(combo);
    } else {
      hearts -= 1; combo = 0;
      missed.push({ senseId: q.senseId, ...reveal(q), timeout: ch === -1 || late });
    }
    const over = hearts <= 0;
    let next = null;
    const used = r.used.slice();
    if (!over) {
      next = makeQuestion(score, used);
      used.push(next.senseId, `w:${bank().byId.get(next.senseId).word.toLowerCase()}`);
    }
    if (gained > 0) {
      const g = await grantExp(userId, gained, { reason: 'endless', db: client });
      gained = g.gained; if (g.leveledUp || g.levelInfo) leveled = g;
    }
    const upd = (await client.query(
      `UPDATE endless_runs SET hearts = $2, score = $3, answered = answered + 1, combo = $4, best_combo = $5, exp_gained = exp_gained + $6,
              q = $7, used = $8, missed = $9, last_at = NOW(), status = $10::varchar, ended_at = CASE WHEN $10::varchar = 'over' THEN NOW() ELSE NULL END
        WHERE id = $1 RETURNING *`,
      [r.id, Math.max(0, hearts), score, combo, bestCombo, gained, next, used.slice(-400), JSON.stringify(missed.slice(-20)), over ? 'over' : 'active'])).rows[0];
    await client.query('COMMIT');
    out = { correct, timeout: ch === -1 || late, tooFast, correctIndex: q.answer, reveal: reveal(q), gained, run: runView(upd),
      next: next ? publicQ(next, upd.answered + 1) : null, over };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  if (leveled) { out.levelInfo = leveled.levelInfo; out.leveledUp = leveled.leveledUp; }
  if (out.over) out.summary = await summary(userId, out.run.id);
  return out;
}

/** ยอมแพ้/ออกกลางเกม → จบเกม (คะแนนที่ทำได้ยังนับ) */
async function quit(userId) {
  const r = (await pool.query(
    "UPDATE endless_runs SET status = 'over', ended_at = NOW(), q = NULL WHERE user_id = $1 AND status = 'active' RETURNING id", [userId])).rows[0];
  if (!r) return { over: false };
  return { over: true, summary: await summary(userId, Number(r.id)) };
}

const WEEK_START = "(date_trunc('week', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')";

async function summary(userId, runId) {
  const r = (await pool.query('SELECT * FROM endless_runs WHERE id = $1 AND user_id = $2', [runId, userId])).rows[0];
  if (!r) throw new EndlessError('NO_RUN', 'ไม่พบเกมนี้', 404);
  const best = (await pool.query("SELECT COALESCE(MAX(score), 0)::int AS b FROM endless_runs WHERE user_id = $1 AND status = 'over' AND id <> $2", [userId, runId])).rows[0].b;
  return { ...runView(r), missed: (r.missed || []).map((m) => ({ senseId: m.senseId, word: m.word, th: m.th, pos: m.pos, posTh: m.posTh, cefr: m.cefr, timeout: Boolean(m.timeout) })),
    previousBest: best, newBest: r.score > best && r.score > 0 };
}

/** สถิติของฉัน + อันดับสัปดาห์นี้ (เวลาไทย เริ่มวันจันทร์) — ส่งเฉพาะ id · ชื่อผู้ใช้ · รูปโปรไฟล์ · คะแนน */
async function stats(userId) {
  await closeIdle(userId);
  const [me, board, mine, active] = await Promise.all([
    pool.query(`SELECT COALESCE(MAX(score), 0)::int AS best, COUNT(*)::int AS games, COALESCE(SUM(exp_gained), 0)::int AS exp,
                       COALESCE(MAX(best_combo), 0)::int AS best_combo FROM endless_runs WHERE user_id = $1 AND status = 'over'`, [userId]),
    pool.query(`SELECT u.id, u.username, u.avatar, u.avatar_image, b.score FROM (
                  SELECT user_id, MAX(score) AS score FROM endless_runs WHERE status = 'over' AND score > 0 AND started_at >= ${WEEK_START} GROUP BY user_id
                ) b JOIN users u ON u.id = b.user_id ORDER BY b.score DESC, u.id ASC LIMIT 20`),
    pool.query(`SELECT MAX(score)::int AS s FROM endless_runs WHERE user_id = $1 AND status = 'over' AND started_at >= ${WEEK_START}`, [userId]),
    pool.query("SELECT id FROM endless_runs WHERE user_id = $1 AND status = 'active' AND q IS NOT NULL", [userId]),
  ]);
  const weekScore = mine.rows[0].s || 0;
  let myRank = null;
  if (weekScore > 0) {
    myRank = (await pool.query(
      `SELECT COUNT(*)::int + 1 AS r FROM (SELECT user_id, MAX(score) AS s FROM endless_runs WHERE status = 'over' AND started_at >= ${WEEK_START} GROUP BY user_id) x
        WHERE x.s > $1 OR (x.s = $1 AND x.user_id < $2)`, [weekScore, userId])).rows[0].r;
  }
  return {
    best: me.rows[0].best, games: me.rows[0].games, totalExp: me.rows[0].exp, bestCombo: me.rows[0].best_combo,
    week: { myScore: weekScore, myRank, board: board.rows.map((x, i) => ({ rank: i + 1, userId: x.id, username: x.username, avatar: x.avatar, avatarImage: x.avatar_image || null, score: x.score })) },
    hasActive: Boolean(active.rows[0]),
    rules: { hearts: CFG.hearts, secs: CFG.answerSecs, exp: EXP_BY_CEFR, stages: CFG.stages, th2enFrom: CFG.th2enFrom, choices: CFG.choices },
  };
}

/** เก็บคำที่ตอบผิดในเกมล่าสุดเข้าคิวทบทวน (word_progress ถึงกำหนดทันที · ไม่ให้ EXP) */
async function saveMissed(userId, runId) {
  const r = (await pool.query("SELECT missed FROM endless_runs WHERE id = $1 AND user_id = $2 AND status = 'over'", [Number(runId) || 0, userId])).rows[0];
  if (!r) throw new EndlessError('NO_RUN', 'ไม่พบเกมนี้', 404);
  const ids = [...new Set((r.missed || []).map((m) => m.senseId).filter(Boolean))].slice(0, 20);
  if (!ids.length) return { saved: 0 };
  const { rows } = await pool.query('SELECT id, public_id, cefr FROM vocab_senses WHERE id = ANY($1::text[]) AND public_id IS NOT NULL', [ids]);
  for (const v of rows) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO word_progress (user_id, word_id, level, status, times_seen, srs_due_at) VALUES ($1, $2, $3, 'learning', 0, NOW())
       ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = LEAST(word_progress.srs_due_at, NOW())`, [userId, v.public_id, v.cefr]);
  }
  return { saved: rows.length };
}

module.exports = { EndlessError, CFG, EXP_BY_CEFR, comboBonus, bank, makeQuestion, start, answer, quit, stats, summary, saveMissed, stageOf, choicesOf, thClash };
