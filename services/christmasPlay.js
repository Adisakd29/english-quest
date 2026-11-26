/*
  v1.25.1 Christmas 2026 — กิจกรรม P1: Advent Calendar · Boss "Frost Giant" · Story "The Missing Star of Snowfield"
  - โจทย์ Advent / Boss: คลังคำศัพท์ที่ตรวจแล้ว (services/endless bank — data/oxford ไม่รวมความหมายที่ติดธง/needsReview)
  - โจทย์และเฉลยเก็บฝั่งเซิร์ฟเวอร์ (xmas_runs.q) · หน้าเว็บได้แค่โจทย์ + ตัวเลือก · ตอบเร็วเกินคน/หมดเวลา ตรวจที่เซิร์ฟเวอร์
  - รางวัลครั้งเดียวต่อ ref: xmas_wins (PK) + event_token_ledger (idem_key) ใน transaction เดียวกัน
  - Story ร่างโดย AI → ผู้เล่นเห็นได้เมื่อผู้ดูแลอนุมัติครบทุกตอน (content_reviews ผูกกับ hash เนื้อหา) และเปิดสวิตช์ christmas_story
*/
const crypto = require('crypto');
const pool = require('../config/db');
const X = require('../config/christmas');
const xm = require('./christmas');
const E = require('./endless');
const { grantExp } = require('../utils/exp');

const { XmasError } = xm;
const STORY = require('../data/christmas/story.json');
const DAY = 86400000;
const now = () => xm._now();
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const chapterHash = (c) => sha({ id: c.id, title: c.title, text: c.text, questions: c.questions });
const rnd = (n) => crypto.randomInt(n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------------- คำศัพท์ฤดูหนาว/เทศกาล (เลือกเป้าหมายจากคลังถ้ามี — ไม่มีก็ใช้คำทั่วไประดับเดียวกัน) ---------------- */
const THEME = ['snow', 'winter', 'gift', 'present', 'celebrate', 'celebration', 'candle', 'star', 'tree', 'bell', 'card', 'party', 'wish', 'warm', 'cold',
  'family', 'festival', 'decorate', 'decoration', 'holiday', 'ice', 'freeze', 'cookie', 'chocolate', 'scarf', 'glove', 'coat', 'light', 'song', 'sing',
  'share', 'kind', 'thank', 'peace', 'joy', 'quiet', 'night', 'fire', 'blanket', 'wrap', 'ribbon', 'surprise', 'tradition', 'generous', 'gather'];
let themeCache = null;
function themeWords() {
  if (themeCache) return themeCache;
  const B = E.bank();
  themeCache = {};
  for (const w of B.list) if (THEME.includes(w.word.toLowerCase())) (themeCache[w.cefr] = themeCache[w.cefr] || []).push(w);
  return themeCache;
}
/** ข้อคำศัพท์: เห็นคำอังกฤษเลือกความหมายไทย (หรือกลับกันเมื่อยากขึ้น) · ไม่ซ้ำคำในเกม */
function vocabQuestion(cefr, used, { th2en = false, choices = 4 } = {}) {
  const B = E.bank();
  const usedSet = new Set(used);
  const themed = (themeWords()[cefr] || []).filter((w) => !usedSet.has(w.id));
  for (let tries = 0; tries < 60; tries += 1) {
    const pool0 = themed.length && tries < 20 ? themed : B.byCefr[cefr];
    const t = pool0[rnd(pool0.length)];
    if (usedSet.has(t.id) || usedSet.has(`w:${t.word.toLowerCase()}`)) continue;
    const cands = shuffle((B.byKey.get(`${t.cefr}|${t.pos}`) || []).slice());
    const picked = [];
    for (const d of cands) {
      if (picked.length >= choices - 1) break;
      if (d.word.toLowerCase() === t.word.toLowerCase() || E.thClash(d, t)) continue;
      if (picked.some((p) => p.word.toLowerCase() === d.word.toLowerCase() || E.thClash(p, d))) continue;
      picked.push(d);
    }
    if (picked.length < choices - 1) continue;
    const opts = shuffle([t, ...picked]);
    return { key: crypto.randomBytes(6).toString('hex'), senseId: t.id, word: t.word, th: t.th, cefr: t.cefr, mode: th2en ? 'th2en' : 'en2th',
      prompt: th2en ? t.th : t.word, options: opts.map((o) => (th2en ? o.word : o.th)), answer: opts.indexOf(t), issuedAt: now() };
  }
  throw new Error('christmas: สร้างข้อไม่ได้');
}
const publicQ = (q, no, secs) => ({ key: q.key, no, mode: q.mode, prompt: q.prompt, options: q.options, say: q.mode === 'en2th' ? q.prompt : null,
  ...(secs ? { secs, secsLeft: Math.max(0, Math.ceil((Number(q.issuedAt) + secs * 1000 - now()) / 1000)) } : {}) });
const reveal = (q) => ({ word: q.word, th: q.th });

/* ---------------- เวลา / สิทธิ์ ---------------- */
const dec1 = Date.parse('2026-12-01T00:00:00+07:00');
const adventOpenAt = (d) => dec1 + (d - 1) * DAY;
const storyOpenAt = (s, i) => Date.parse(s.startsAt) + i * X.STORY.unlockEveryDays * DAY;

async function storyApproved(db = pool) {
  const { rows } = await db.query('SELECT content_id, content_hash FROM content_reviews WHERE content_id LIKE $1', [`${STORY.id}:%`]);
  const ok = new Map(rows.map((r) => [r.content_id, r.content_hash]));
  const per = STORY.chapters.map((c) => ({ id: c.id, approved: ok.get(`${STORY.id}:${c.id}`) === chapterHash(c) }));
  return { all: per.every((p) => p.approved), per };
}
async function settings(flag) {
  const s = await xm.loadSettings();
  const st = xm.statusOf(s);
  if (st !== 'active') {
    const code = { disabled: 'EVENT_DISABLED', scheduled: 'EVENT_NOT_STARTED' }[st] || 'EVENT_ENDED';
    throw new XmasError(code, st === 'scheduled' ? 'กิจกรรมคริสต์มาสยังไม่เริ่ม' : st === 'disabled' ? 'กิจกรรมคริสต์มาสปิดอยู่ชั่วคราว' : 'กิจกรรมคริสต์มาสจบแล้ว', 403);
  }
  if (!s.flags[flag]) throw new XmasError('FEATURE_OFF', 'ส่วนนี้ปิดอยู่ชั่วคราว', 403);
  if (flag === 'christmas_story' && !(await storyApproved()).all) throw new XmasError('FEATURE_OFF', 'เนื้อเรื่องรอผู้ดูแลตรวจ', 403);
  return s;
}

/* ---------------- รางวัล ---------------- */
async function award(client, userId, kind, ref, tokens, exp) {
  const ins = await client.query(`INSERT INTO xmas_wins (user_id, event_id, kind, ref, tokens, exp) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT DO NOTHING RETURNING ref`, [userId, X.EVENT_ID, kind, ref, tokens, exp]);
  if (!ins.rows[0]) return { tokens: 0, exp: 0, already: true };
  const tk = await xm.moveTokens(client, userId, tokens, kind, ref, `${kind}:${ref}`);
  const g = await grantExp(userId, exp, { reason: `xmas_${kind}`, db: client });
  return { tokens, exp: g.gained, balance: tk.balance, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
}
async function tx(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`xmas:${userId}`]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw new XmasError('ALREADY', 'มีเกมที่กำลังเล่นอยู่แล้ว', 409);
    throw e;
  } finally { client.release(); }
}
async function wins(userId, kind) {
  const { rows } = await pool.query('SELECT ref FROM xmas_wins WHERE user_id = $1 AND event_id = $2 AND kind = $3', [userId, X.EVENT_ID, kind]);
  return new Set(rows.map((r) => r.ref));
}

/* ---------------- สถานะ (Hub) ---------------- */
async function state(userId) {
  const s = await xm.loadSettings();
  const t = now(); const day = xm.bkkDay(t);
  const [aw, bw, sw, appr, cur] = await Promise.all([wins(userId, 'advent'), wins(userId, 'boss'), wins(userId, 'story'), storyApproved(),
    pool.query("SELECT kind, ref FROM xmas_runs WHERE user_id = $1 AND event_id = $2 AND status = 'playing'", [userId, X.EVENT_ID])]);
  const playing = Object.fromEntries(cur.rows.map((r) => [r.kind, r.ref]));
  const active = xm.statusOf(s, t) === 'active';
  const out = { day, playing };
  if (s.flags.christmas_advent) {
    out.advent = { opened: aw.size, total: X.ADVENT.days, doors: Array.from({ length: X.ADVENT.days }, (_, i) => {
      const d = i + 1;
      return { day: d, opened: aw.has(String(d)), canOpen: active && t >= adventOpenAt(d) && !aw.has(String(d)), opensAt: new Date(adventOpenAt(d)).toISOString(),
        tokens: X.ADVENT.tokens + (X.ADVENT.bonusDays[d] || 0) };
    }), questions: X.ADVENT.questions, pass: X.ADVENT.pass };
  }
  if (s.flags.christmas_boss) out.boss = { wonToday: bw.has(day), wins: bw.size, canPlay: active, hp: X.BOSS.hp, hearts: X.BOSS.hearts, tokens: X.BOSS.tokens, exp: X.BOSS.exp };
  if (s.flags.christmas_story && appr.all) {
    out.story = { title: STORY.title, titleTh: STORY.titleTh, chapters: STORY.chapters.map((c, i) => {
      const prevDone = i === 0 || sw.has(STORY.chapters[i - 1].id);
      const timeOk = t >= storyOpenAt(s, i);
      return { id: c.id, no: i + 1, title: c.title, titleTh: c.titleTh, done: sw.has(c.id), canRead: active && prevDone && timeOk,
        opensAt: new Date(storyOpenAt(s, i)).toISOString(), needPrev: !prevDone };
    }), tokens: X.STORY.tokens, exp: X.STORY.exp, pass: X.STORY.pass };
  }
  out.photobooth = !!s.flags.christmas_photobooth;
  return out;
}

/* ---------------- Advent ---------------- */
async function adventStart(userId, dayNo) {
  await settings('christmas_advent');
  const d = Number(dayNo);
  if (!Number.isInteger(d) || d < 1 || d > X.ADVENT.days) throw new XmasError('NOT_FOUND', 'ไม่มีประตูวันนี้', 404);
  if (now() < adventOpenAt(d)) throw new XmasError('NOT_YET', `ประตูวันที่ ${d} เปิดได้ตั้งแต่ ${d} ธ.ค.`, 409);
  return tx(userId, async (c) => {
    if ((await c.query("SELECT 1 FROM xmas_wins WHERE user_id = $1 AND event_id = $2 AND kind = 'advent' AND ref = $3", [userId, X.EVENT_ID, String(d)])).rows[0]) {
      throw new XmasError('ALREADY', 'เปิดประตูนี้ไปแล้ว', 409);
    }
    await c.query("UPDATE xmas_runs SET status = 'quit', ended_at = NOW(), q = NULL WHERE user_id = $1 AND event_id = $2 AND kind = 'advent' AND status = 'playing'", [userId, X.EVENT_ID]);
    const cefr = ['A1', 'A2'][d % 2];
    const q = vocabQuestion(cefr, []);
    await c.query(`INSERT INTO xmas_runs (user_id, event_id, kind, ref, q, used) VALUES ($1, $2, 'advent', $3, $4, $5)`,
      [userId, X.EVENT_ID, String(d), q, [q.senseId, `w:${q.word.toLowerCase()}`]]);
    return { day: d, total: X.ADVENT.questions, pass: X.ADVENT.pass, q: publicQ(q, 1) };
  });
}

/* ---------------- Boss ---------------- */
async function bossStart(userId) {
  await settings('christmas_boss');
  return tx(userId, async (c) => {
    await c.query("UPDATE xmas_runs SET status = 'quit', ended_at = NOW(), q = NULL WHERE user_id = $1 AND event_id = $2 AND kind = 'boss' AND status = 'playing'", [userId, X.EVENT_ID]);
    const q = vocabQuestion('A1', []);
    const day = xm.bkkDay(now());
    await c.query(`INSERT INTO xmas_runs (user_id, event_id, kind, ref, q, used, hp, hearts) VALUES ($1, $2, 'boss', $3, $4, $5, $6, $7)`,
      [userId, X.EVENT_ID, day, q, [q.senseId, `w:${q.word.toLowerCase()}`], X.BOSS.hp, X.BOSS.hearts]);
    return { hp: X.BOSS.hp, maxHp: X.BOSS.hp, hearts: X.BOSS.hearts, q: publicQ(q, 1, X.BOSS.answerSecs) };
  });
}
const bossCefr = (correct) => (correct < 3 ? 'A1' : correct < 6 ? 'A2' : 'B1');

/** ตอบข้อของ Advent / Boss (kind) */
async function answer(userId, kind, { key, choice }) {
  if (!['advent', 'boss'].includes(kind)) throw new XmasError('NOT_FOUND', 'ไม่พบเกม', 404);
  await settings(kind === 'advent' ? 'christmas_advent' : 'christmas_boss');
  const ch = Number(choice);
  if (!Number.isInteger(ch) || ch < -1 || ch > 5) throw new XmasError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  return tx(userId, async (c) => {
    const r = (await c.query("SELECT * FROM xmas_runs WHERE user_id = $1 AND event_id = $2 AND kind = $3 AND status = 'playing' FOR UPDATE", [userId, X.EVENT_ID, kind])).rows[0];
    if (!r || !r.q) throw new XmasError('NO_RUN', 'ไม่มีเกมที่กำลังเล่น เริ่มใหม่ได้เลย', 404);
    const q = r.q;
    if (String(key) !== q.key) throw new XmasError('STALE', 'ข้อนี้ตอบไปแล้ว', 409);
    if (ch >= q.options.length) throw new XmasError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
    const elapsed = now() - Number(q.issuedAt);
    const late = kind === 'boss' && elapsed > (X.BOSS.answerSecs + X.BOSS.graceSecs) * 1000;
    const tooFast = elapsed < X.BOSS.minHumanMs;   // ตอบเร็วกว่าคนอ่านทัน (บอท) = ไม่นับ
    const correct = ch === q.answer && !late && !tooFast;
    let { hp, hearts, combo } = r; const answered = r.answered + 1; const nCorrect = r.correct + (correct ? 1 : 0);
    let dmg = 0; let status = 'playing';
    if (kind === 'boss') {
      if (correct) { combo += 1; dmg = X.BOSS.hit + Math.min(X.BOSS.comboMax, (combo - 1) * X.BOSS.comboStep); hp = Math.max(0, hp - dmg); } else { combo = 0; hearts -= 1; }
      if (hp <= 0) status = 'won'; else if (hearts <= 0 || answered >= X.BOSS.maxQuestions) status = 'lost';
    } else {
      combo = correct ? combo + 1 : 0;
      if (answered >= X.ADVENT.questions) status = nCorrect >= X.ADVENT.pass ? 'won' : 'lost';
    }
    let next = null; const used = r.used.slice();
    if (status === 'playing') {
      next = kind === 'boss' ? vocabQuestion(bossCefr(nCorrect), used, { th2en: nCorrect >= 4 && rnd(100) < 40 }) : vocabQuestion(r.q.cefr, used);
      used.push(next.senseId, `w:${next.word.toLowerCase()}`);
    }
    await c.query(`UPDATE xmas_runs SET q = $2, used = $3, answered = $4, correct = $5, hp = $6, hearts = $7, combo = $8, status = $9::varchar,
      ended_at = CASE WHEN $9::varchar = 'playing' THEN NULL ELSE NOW() END WHERE id = $1`,
    [r.id, next, used, answered, nCorrect, hp, Math.max(0, hearts), combo, status]);
    let reward = null;
    if (status === 'won') {
      if (kind === 'boss') reward = await award(c, userId, 'boss', r.ref, X.BOSS.tokens, X.BOSS.exp);
      else { const d = Number(r.ref); reward = await award(c, userId, 'advent', r.ref, X.ADVENT.tokens + (X.ADVENT.bonusDays[d] || 0), X.ADVENT.exp); }
    }
    return { correct, timeout: ch === -1 || late, tooFast, correctIndex: q.answer, reveal: reveal(q), dmg, hp, maxHp: X.BOSS.hp, hearts: Math.max(0, hearts),
      combo, answered, correctCount: nCorrect, status, reward, next: next ? publicQ(next, answered + 1, kind === 'boss' ? X.BOSS.answerSecs : null) : null };
  });
}

/* ---------------- Story ---------------- */
async function storyChapter(userId, chId) {
  const s = await settings('christmas_story');
  const i = STORY.chapters.findIndex((c) => c.id === chId);
  if (i < 0) throw new XmasError('NOT_FOUND', 'ไม่พบตอนนี้', 404);
  if (now() < storyOpenAt(s, i)) throw new XmasError('NOT_YET', 'ตอนนี้ยังไม่เปิด', 409);
  const done = await wins(userId, 'story');
  if (i > 0 && !done.has(STORY.chapters[i - 1].id)) throw new XmasError('NEED_PREV', 'อ่านตอนก่อนหน้าให้ผ่านก่อน', 409);
  const c = STORY.chapters[i];
  return { id: c.id, no: i + 1, title: c.title, titleTh: c.titleTh, text: c.text, done: done.has(c.id), pass: X.STORY.pass,
    questions: c.questions.map((q, k) => ({ no: k + 1, q: q.q, options: q.options })) };   // ไม่มีเฉลยจนกว่าจะส่งคำตอบ
}
async function storySubmit(userId, chId, answers) {
  await storyChapter(userId, chId);   // ตรวจสิทธิ์/ลำดับ/เวลาเดียวกัน
  const c = STORY.chapters.find((x) => x.id === chId);
  if (!Array.isArray(answers) || answers.length !== c.questions.length || !answers.every((a) => Number.isInteger(a) && a >= 0 && a < 4)) {
    throw new XmasError('BAD_ANSWERS', 'ตอบให้ครบทุกข้อ', 400);
  }
  const results = c.questions.map((q, k) => ({ no: k + 1, correct: answers[k] === q.answer, answer: q.answer, why: q.why }));
  const score = results.filter((r) => r.correct).length;
  const passed = score >= X.STORY.pass;
  let reward = null;
  await tx(userId, async (cl) => {
    await cl.query(`INSERT INTO xmas_runs (user_id, event_id, kind, ref, status, answered, correct, ended_at) VALUES ($1, $2, 'story', $3, $4, $5, $6, NOW())`,
      [userId, X.EVENT_ID, chId, passed ? 'won' : 'lost', results.length, score]);
    if (passed) reward = await award(cl, userId, 'story', chId, X.STORY.tokens, X.STORY.exp);
  });
  return { score, total: results.length, passed, results, reward };
}

/* ---------------- ผู้ดูแล: ตรวจเนื้อหา Story ---------------- */
async function adminStory() {
  const a = await storyApproved();
  return { id: STORY.id, title: STORY.title, note: STORY.note, all: a.all,
    chapters: STORY.chapters.map((c, i) => ({ ...c, approved: a.per[i].approved })) };
}
async function adminApprove(adminId, chId, approve = true) {
  const c = STORY.chapters.find((x) => x.id === chId);
  if (!c) throw new XmasError('NOT_FOUND', 'ไม่พบตอนนี้', 404);
  const id = `${STORY.id}:${c.id}`;
  if (approve) {
    await pool.query(`INSERT INTO content_reviews (content_id, content_hash, approved_by) VALUES ($1, $2, $3)
      ON CONFLICT (content_id) DO UPDATE SET content_hash = $2, approved_by = $3, approved_at = NOW()`, [id, chapterHash(c), adminId]);
  } else await pool.query('DELETE FROM content_reviews WHERE content_id = $1', [id]);
  xm._clearCache();
  return adminStory();
}

module.exports = { state, adventStart, bossStart, answer, storyChapter, storySubmit, adminStory, adminApprove, storyApproved, vocabQuestion, chapterHash, STORY };
