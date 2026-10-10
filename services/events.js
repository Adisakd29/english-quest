/*
  กิจกรรมพิเศษ (Halloween Adventure) + คลังธีม
  ความปลอดภัย:
    - ทุกการตัดสิน (เปิด/ปิดกิจกรรม · ปลดล็อก Chapter · ผ่านด่าน · รับรางวัล) ใช้เวลาเซิร์ฟเวอร์ — เปลี่ยนเวลาในเครื่องไม่มีผล
    - ความคืบหน้าคำนวณจากข้อมูลที่เซิร์ฟเวอร์บันทึกเอง (จบเกม/ส่งแบบฝึก/คำตอบที่ตรวจแล้ว/ด่านที่ตรวจแล้ว) — หน้าเว็บส่งผลเองไม่ได้
    - โจทย์และเฉลยของด่านอยู่ฝั่งเซิร์ฟเวอร์ · ส่งคำตอบได้ครั้งเดียวต่อรอบ · มีจับเวลาฝั่งเซิร์ฟเวอร์
    - รับรางวัลได้ครั้งเดียว (PRIMARY KEY + ทรานแซกชัน) · ธีมที่ได้แล้วอยู่ในบัญชีถาวร
  ความคืบหน้า "อีก N" ของแต่ละ Chapter นับตั้งแต่เวลาที่ Chapter นั้นปลดล็อก
  (เวลาปลดล็อก = เวลาที่ภารกิจสุดท้ายของ Chapter ก่อนหน้าครบ — คำนวณจากข้อมูลจริง จึงเหมือนกันทุกเครื่อง/ทุกครั้งที่เปิด)
*/
const pool = require('../config/db');
const { EVENTS, EVENT_BY_ID, PREMIUM_THEMES, FREE_THEMES, HALLOWEEN_WORDS } = require('../config/events');
const QB = require('./ranked/questionBank');
const { mulberry32, shuffle: seededShuffle, newSeed } = require('./ranked/rng');

class EventError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

let nowFn = () => Date.now();
/** ชุดทดสอบเท่านั้น: จำลองเวลาเซิร์ฟเวอร์ */
function _setNow(fn) { nowFn = fn || (() => Date.now()); }
const now = () => nowFn();
const startOf = (e) => new Date(e.startsAt).getTime();
const endOf = (e) => new Date(e.endsAt).getTime();
function statusOf(e, t = now()) {
  if (t < startOf(e)) return 'upcoming';
  if (t >= endOf(e)) return 'ended';
  return 'active';
}

let synced = null;
/** สำเนาข้อมูลกิจกรรมลงตาราง events (Event ID / Start / End) — ทำครั้งเดียวต่อการเริ่มเซิร์ฟเวอร์ */
function syncEvents() {
  if (!synced) {
    synced = (async () => {
      for (const e of EVENTS) {
        await pool.query(
          `INSERT INTO events (id, name, starts_at, ends_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updated_at = NOW()`,
          [e.id, e.name, e.startsAt, e.endsAt]);
      }
    })().catch((err) => { synced = null; throw err; });
  }
  return synced;
}
function getEvent(id) {
  const e = EVENT_BY_ID[id];
  if (!e) throw new EventError('NOT_FOUND', 'ไม่พบกิจกรรมนี้', 404);
  return e;
}

/* ---------- บันทึก "จบ 1 รอบ" จากจุดที่เซิร์ฟเวอร์รู้จริง (ไม่ทำให้ระบบเดิมช้าหรือพัง) ----------
   ref ไม่ซ้ำต่อคน = เกมเดียวกันนับได้ครั้งเดียว · stats = { correct, total } ใช้ตรวจภารกิจ "ทำคะแนนผ่านเกณฑ์" */
function recordRound(userId, ref, stats = {}) {
  if (!userId) return;
  const t = now();
  const active = EVENTS.filter((e) => statusOf(e, t) === 'active');
  if (!active.length) return;
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Math.max(0, Math.round(Number(v))) : null);
  const correct = num(stats.correct); const total = num(stats.total);
  (async () => {
    await syncEvents();
    for (const e of active) {
      await pool.query(
        `INSERT INTO event_activity (event_id, user_id, kind, ref, created_at, correct, total) VALUES ($1, $2, 'round', $3, to_timestamp($4 / 1000.0), $5, $6)
         ON CONFLICT DO NOTHING`, [e.id, userId, String(ref).slice(0, 96), t, correct, total]);
    }
  })().catch((err) => console.error('[events/recordRound]', err.message));
}

/* =====================================================================
   ความคืบหน้า Halloween Adventure
   ===================================================================== */
const ms = (d) => new Date(d).getTime();
async function loadFacts(e, userId, from, to) {
  const [rounds, cards, corrects, attempts] = await Promise.all([
    pool.query(`SELECT created_at, correct, total FROM event_activity
                 WHERE event_id = $1 AND user_id = $2 AND kind = 'round' AND created_at >= $3 AND created_at <= $4 ORDER BY created_at, id`,
    [e.id, userId, from, to]),
    pool.query(`SELECT created_at, correct FROM answer_events
                 WHERE user_id = $1 AND skill IN ('vocab', 'listening') AND source IS NULL AND created_at >= $2 AND created_at <= $3 ORDER BY created_at, id`,
    [userId, from, to]),
    pool.query(`SELECT created_at FROM answer_events WHERE user_id = $1 AND correct AND created_at >= $2 AND created_at <= $3 ORDER BY created_at, id`,
      [userId, from, to]),
    pool.query(`SELECT id, stage_id, score, passed, finished_at FROM event_challenge_attempts
                 WHERE event_id = $1 AND user_id = $2 AND finished_at IS NOT NULL AND finished_at >= $3 AND finished_at <= $4 ORDER BY finished_at, id`,
    [e.id, userId, from, to]),
  ]);
  return {
    rounds: rounds.rows.map((r) => ({ t: ms(r.created_at), correct: r.correct, total: r.total })),
    cards: cards.rows.map((r) => ({ t: ms(r.created_at), correct: Boolean(r.correct) })),
    corrects: corrects.rows.map((r) => ms(r.created_at)),
    attempts: attempts.rows.map((r) => ({ id: Number(r.id), stage: r.stage_id, score: r.score || 0, passed: Boolean(r.passed), t: ms(r.finished_at) })),
  };
}
/** รวมน้ำหนักตามเวลา -> ความคืบหน้า + เวลาที่ครบเป้า */
function tally(items, target) {
  const sorted = items.sort((a, b) => a.t - b.t);
  let sum = 0; let doneAt = null;
  for (const it of sorted) {
    sum += it.w;
    if (doneAt === null && sum >= target) doneAt = it.t;
  }
  return { progress: Math.min(target, sum), doneAt };
}
/** การ์ดคำศัพท์เล่นในเครื่อง: นับจากคำตอบที่บันทึกจริง ทุก vocabAnswersPerRound ข้อ = 1 รอบ (พร้อมจำนวนข้อที่ถูก) */
function cardRounds(f, since, e, after) {
  const per = e.vocabAnswersPerRound || 10;
  const cards = f.cards.filter((c) => after(c.t));
  const out = [];
  for (let i = per - 1; i < cards.length; i += per) {
    const chunk = cards.slice(i - per + 1, i + 1);
    out.push({ t: cards[i].t, w: 1, correct: chunk.filter((c) => c.correct).length, total: per });
  }
  return out;
}
function missionValue(m, f, since, e, strict = false) {
  // Chapter แรกนับตั้งแต่เริ่มกิจกรรม (รวมเวลานั้น) · Chapter ถัดไปนับ "หลัง" เวลาที่ปลดล็อก (ข้อ/รอบที่ทำให้ Chapter ก่อนครบ ไม่ถูกนับซ้ำ)
  const after = (t) => (strict ? t > since : t >= since);
  if (m.kind === 'rounds') {
    return tally([...f.rounds.filter((r) => after(r.t)).map((r) => ({ t: r.t, w: 1 })), ...cardRounds(f, since, e, after)], m.target);
  }
  if (m.kind === 'correct') {
    return tally([
      ...f.corrects.filter(after).map((t) => ({ t, w: 1 })),
      ...f.attempts.filter((a) => after(a.t) && a.score > 0).map((a) => ({ t: a.t, w: a.score })),
    ], m.target);
  }
  if (m.kind === 'goodRounds') {
    const minAcc = m.minAccuracy || 0.7; const minN = m.minAnswers || 5;
    const good = (c, n) => n >= minN && c / n >= minAcc;
    return tally([
      ...f.rounds.filter((r) => after(r.t) && good(r.correct, r.total)).map((r) => ({ t: r.t, w: 1 })),
      // การ์ดคำศัพท์/ฟัง (ปุ่ม "ไปเล่น" พาไปที่นี่): ทุก 10 ข้อ = 1 เกม ใช้ความแม่นยำของ 10 ข้อนั้น
      ...cardRounds(f, since, e, after).filter((r) => good(r.correct, r.total)),
    ], m.target);
  }
  if (m.kind === 'stages') {
    // ด่านเล่นได้หลังปลดล็อกเท่านั้น (ตรวจตอนเริ่มด่าน) — นับเวลาที่ผ่านด่านแต่ละด่านครั้งแรก
    const first = m.stages.map((sid) => f.attempts.find((a) => a.stage === sid && a.passed)).filter(Boolean);
    return tally(first.map((a) => ({ t: a.t, w: 1 })), m.target);
  }
  return { progress: 0, doneAt: null };
}

async function computeAdventure(e, userId) {
  const t = now();
  const from = new Date(startOf(e));
  const to = new Date(Math.min(t, endOf(e) - 1));   // รวมวินาทีปัจจุบัน · ไม่รวมเวลาปิด
  const f = await loadFacts(e, userId, from, to);
  const chapters = [];
  let unlockAt = startOf(e);
  for (const ch of e.chapters) {
    const unlocked = unlockAt !== null;
    const missions = ch.missions.map((m) => {
      const v = unlocked ? missionValue(m, f, unlockAt, e, ch !== e.chapters[0]) : { progress: 0, doneAt: null };
      return { ...m, progress: v.progress, done: v.doneAt !== null, doneAt: v.doneAt };
    });
    const complete = unlocked && missions.every((m) => m.done);
    const completedAt = complete ? Math.max(...missions.map((m) => m.doneAt)) : null;
    chapters.push({ ...ch, unlocked, unlockedAt: unlocked ? unlockAt : null, complete, completedAt, missions });
    unlockAt = complete ? completedAt : null;
  }
  return { chapters, facts: f, complete: chapters.every((c) => c.complete) };
}

/** สถานะของแต่ละด่าน (ผ่านแล้ว · เล่นได้ไหม · เพราะอะไร) */
function stageViews(e, adv, status) {
  const passedSet = new Set(adv.facts.attempts.filter((a) => a.passed).map((a) => a.stage));
  const best = {}; const tries = {};
  adv.facts.attempts.forEach((a) => {
    if (!a.stage) return;
    best[a.stage] = Math.max(best[a.stage] || 0, a.score); tries[a.stage] = (tries[a.stage] || 0) + 1;
  });
  const out = {};
  for (const ch of adv.chapters) {
    for (const m of ch.missions) {
      if (m.kind !== 'stages') continue;
      m.stages.forEach((sid, i) => {
        const s = e.stages[sid];
        const prev = i > 0 ? m.stages[i - 1] : null;
        let lockedReason = null;
        if (status !== 'active') lockedReason = status === 'ended' ? 'กิจกรรมจบแล้ว' : 'กิจกรรมยังไม่เริ่ม';
        else if (!ch.unlocked) lockedReason = 'ปลดล็อกเมื่อทำ Chapter ก่อนหน้าครบ';
        else if (prev && !passedSet.has(prev)) lockedReason = `ผ่านด่าน "${e.stages[prev].name}" ก่อน`;
        const count = Object.values(s.mix).reduce((a, b) => a + b, 0);
        out[sid] = {
          id: sid, chapter: ch.id, mission: m.id, name: s.name, level: s.level, rule: s.rule || null,
          questions: count, pass: s.pass, sectionMin: s.sectionMin || null, timeLimitSec: s.timeLimitSec,
          kinds: Object.keys(s.mix), passed: passedSet.has(sid), best: best[sid] || 0, attempts: tries[sid] || 0,
          available: !lockedReason, lockedReason,
        };
      });
    }
  }
  return out;
}

/** บันทึกความคืบหน้าลงฐานข้อมูล (ระหว่างกิจกรรม) — ดูย้อนหลังได้/ข้ามเครื่องได้ */
async function persist(e, userId, adv) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const ch of adv.chapters) {
      await client.query(
        `INSERT INTO event_chapter_progress (event_id, user_id, chapter_id, unlocked_at, completed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (event_id, user_id, chapter_id) DO UPDATE SET unlocked_at = COALESCE(event_chapter_progress.unlocked_at, EXCLUDED.unlocked_at),
           completed_at = COALESCE(event_chapter_progress.completed_at, EXCLUDED.completed_at), updated_at = NOW()`,
        [e.id, userId, ch.id, ch.unlockedAt ? new Date(ch.unlockedAt) : null, ch.completedAt ? new Date(ch.completedAt) : null]);
      for (const m of ch.missions) {
        await client.query(
          `INSERT INTO event_mission_progress (event_id, user_id, mission_id, progress, target, completed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (event_id, user_id, mission_id) DO UPDATE SET progress = EXCLUDED.progress, target = EXCLUDED.target,
             completed_at = COALESCE(event_mission_progress.completed_at, EXCLUDED.completed_at), updated_at = NOW()`,
          [e.id, userId, m.id, m.progress, m.target, m.doneAt ? new Date(m.doneAt) : null]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[events/persist]', err.message);
  } finally { client.release(); }
}

/** สถานะกิจกรรมของผู้เล่น */
async function eventState(id, userId) {
  const e = getEvent(id);
  await syncEvents();
  const status = statusOf(e);
  const adv = await computeAdventure(e, userId);
  if (status === 'active') await persist(e, userId, adv);
  const stages = stageViews(e, adv, status);
  const claim = (await pool.query('SELECT claimed_at, granted_by FROM event_reward_claims WHERE event_id = $1 AND user_id = $2', [e.id, userId])).rows[0] || null;
  const owned = e.reward.type === 'theme'
    ? Boolean((await pool.query('SELECT 1 FROM user_themes WHERE user_id = $1 AND theme_id = $2', [userId, e.reward.themeId])).rows[0]) : false;
  const allMissions = adv.chapters.flatMap((c) => c.missions);
  const current = adv.chapters.find((c) => c.unlocked && !c.complete) || null;
  return {
    id: e.id, name: e.name, nameTh: e.nameTh, status, startsAt: new Date(startOf(e)).toISOString(), endsAt: new Date(endOf(e)).toISOString(),
    endsLabel: e.endsLabel, serverNow: new Date(now()).toISOString(),
    chapters: adv.chapters.map((c) => ({
      id: c.id, no: c.no, title: c.title, place: c.place, art: c.art, final: Boolean(c.final),
      unlocked: c.unlocked, complete: c.complete,
      unlockedAt: c.unlockedAt ? new Date(c.unlockedAt).toISOString() : null, completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
      missions: c.missions.map((m) => ({
        id: m.id, kind: m.kind, icon: m.icon, title: m.title, desc: m.desc || null, target: m.target, progress: m.progress, done: m.done,
        stages: m.stages || null,
      })),
    })),
    stages,
    currentChapter: current ? current.id : (adv.complete ? 'done' : null),
    summary: { missionsDone: allMissions.filter((m) => m.done).length, missions: allMissions.length, chaptersDone: adv.chapters.filter((c) => c.complete).length, chapters: adv.chapters.length },
    complete: adv.complete,
    reward: { ...e.reward, owned }, claimed: Boolean(claim), claimedAt: claim ? claim.claimed_at : null,
    canClaim: status === 'active' && adv.complete && !claim,
  };
}

function listEvents() {
  const t = now();
  return EVENTS.map((e) => ({ id: e.id, name: e.name, nameTh: e.nameTh, status: statusOf(e, t),
    startsAt: new Date(startOf(e)).toISOString(), endsAt: new Date(endOf(e)).toISOString(), serverNow: new Date(t).toISOString() }));
}

/** รับรางวัล: เฉพาะช่วงกิจกรรม · ผ่านครบ 4 Chapter + Final (คำนวณใหม่ฝั่งเซิร์ฟเวอร์) · ครั้งเดียวต่อคน */
async function claimReward(id, userId) {
  const e = getEvent(id);
  await syncEvents();
  const status = statusOf(e);
  if (status !== 'active') throw new EventError(status === 'ended' ? 'EVENT_ENDED' : 'EVENT_NOT_STARTED', status === 'ended' ? 'กิจกรรมนี้หมดเวลาแล้ว' : 'กิจกรรมยังไม่เริ่ม', 403);
  const already = (await pool.query('SELECT 1 FROM event_reward_claims WHERE event_id = $1 AND user_id = $2', [e.id, userId])).rows[0];
  if (!already) {
    const adv = await computeAdventure(e, userId);
    if (!adv.complete) throw new EventError('MISSIONS_INCOMPLETE', 'ยังผ่านการผจญภัยไม่ครบ', 403);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      'INSERT INTO event_reward_claims (event_id, user_id, reward_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING claimed_at',
      [e.id, userId, e.reward.themeId || e.reward.type]);
    if (e.reward.type === 'theme') {
      await client.query('INSERT INTO user_themes (user_id, theme_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, e.reward.themeId, `event:${e.id}`]);
    }
    await client.query('COMMIT');
    return { claimed: true, alreadyClaimed: ins.rowCount === 0, reward: e.reward };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/** ผู้ดูแลแจกย้อนหลัง (กรณีพิเศษ) — บันทึกว่าใครแจก */
async function adminGrant(id, userId, adminId) {
  const e = getEvent(id);
  await syncEvents();
  const u = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!u.rows[0]) throw new EventError('NO_USER', 'ไม่พบผู้ใช้', 404);
  await pool.query('INSERT INTO event_reward_claims (event_id, user_id, reward_id, granted_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [e.id, userId, e.reward.themeId || e.reward.type, adminId]);
  if (e.reward.type === 'theme') {
    await pool.query('INSERT INTO user_themes (user_id, theme_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, e.reward.themeId, `admin:${adminId}`]);
  }
  return { ok: true };
}

/* =====================================================================
   ด่าน (Stage) — สร้างโจทย์จากคลังเดียวกับระบบเรียน · เฉลยเก็บที่เซิร์ฟเวอร์
   ===================================================================== */
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const shiftLevel = (cefr, d) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(cefr)) + d))];
const SECTION = { halloween: 'vocab', vocab: 'vocab', vocabRev: 'vocab', context: 'context', grammar: 'grammar', spell: 'spell' };
const SECTION_TH = { vocab: 'คำศัพท์', context: 'เติมคำ', grammar: 'แกรมม่า', spell: 'สะกดคำ' };
const normSpell = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[’']/g, "'").replace(/[.!?,]+$/g, '').replace(/\s+/g, ' ').trim();

async function userCefr(userId) {
  const { rows } = await pool.query(
    `SELECT result->>'overall' AS overall FROM placement_attempts
      WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`, [userId]);
  const v = rows[0] && rows[0].overall;
  return LEVELS.includes(v) ? v : 'A1';
}

function halloweenQuestions(count, rng, used) {
  const out = [];
  for (const [en, th] of seededShuffle(HALLOWEEN_WORDS, rng)) {
    if (out.length >= count) break;
    if (used.has(`h:${en}`)) continue;
    used.add(`h:${en}`);
    const toThai = rng() < 0.5;
    const wrong = seededShuffle(HALLOWEEN_WORDS.filter(([x]) => x !== en), rng).slice(0, 3).map(([x, y]) => (toThai ? y : x));
    const answer = toThai ? th : en;
    const choices = seededShuffle([answer, ...wrong], rng);
    out.push({ kind: 'halloween', prompt: toThai ? en : th, promptLang: toThai ? 'en' : 'th', choicesLang: toThai ? 'th' : 'en',
      instruction: toThai ? 'คำนี้แปลว่าอะไร' : 'ภาษาอังกฤษของคำนี้คือ', choices, correctIndex: choices.indexOf(answer), explain: `${en} = ${th}` });
  }
  return out;
}
function vocabRevQuestions(words, count, rng, used) {
  const { list, thai } = words;
  const out = [];
  for (const w of seededShuffle(list, rng)) {
    if (out.length >= count) break;
    const head = QB.clean(w.word);
    if (used.has(`v:${w.id}`) || !head || head.includes(' ')) continue;
    const decoys = [];
    const seen = new Set([head.toLowerCase()]);
    for (const d of seededShuffle(list.filter((x) => x.category === w.category), rng)) {
      const h = QB.clean(d.word);
      if (!h || h.includes(' ') || seen.has(h.toLowerCase()) || thai.get(d.id) === thai.get(w.id)) continue;
      seen.add(h.toLowerCase()); decoys.push(h);
      if (decoys.length === 3) break;
    }
    if (decoys.length < 3) continue;
    used.add(`v:${w.id}`); used.add(`s:${w.id}`);
    const choices = seededShuffle([head, ...decoys], rng);
    out.push({ kind: 'vocabRev', prompt: thai.get(w.id), promptLang: 'th', choicesLang: 'en', instruction: 'คำภาษาอังกฤษของความหมายนี้คือ',
      choices, correctIndex: choices.indexOf(head), explain: `${head} = ${thai.get(w.id)}` });
  }
  return out;
}
function spellQuestions(words, count, rng, used) {
  const { list, thai } = words;
  const out = [];
  for (const w of seededShuffle(list, rng)) {
    if (out.length >= count) break;
    const head = QB.clean(w.word);
    if (used.has(`s:${w.id}`) || !/^[a-zA-Z]{4,10}$/.test(head)) continue;
    used.add(`s:${w.id}`);
    out.push({ kind: 'spell', prompt: thai.get(w.id), promptLang: 'th', instruction: 'พิมพ์คำภาษาอังกฤษให้ถูกต้อง',
      hint: { first: head[0].toLowerCase(), length: head.length, pos: w.pos || null }, answer: head.toLowerCase(), explain: `${head} = ${thai.get(w.id)}` });
  }
  return out;
}
/** คำที่ใช้แล้วในด่านนี้ไม่ซ้ำในโจทย์ชนิดอื่น (คำเดียวกันไม่โผล่ทั้งแปลไทยและเติมคำ) */
function markUsed(qs, used, exclude) {
  qs.forEach((q) => { const wid = q.ref && q.ref.wordId; if (wid) { used.add(`v:${wid}`); used.add(`s:${wid}`); exclude.add(`v:${wid}`); exclude.add(`c:${wid}`); } });
  return qs;
}
const fromQB = (kind) => (q) => ({ kind, prompt: q.prompt, promptLang: 'en', choicesLang: kind === 'vocab' ? 'th' : 'en', instruction: q.instruction,
  passage: q.passage || null, choices: q.choices, correctIndex: q.correctIndex, explain: q.explain || '' });

async function buildStageQuestions(stage, cefr, seed) {
  const rng = mulberry32(seed);
  const lv = shiftLevel(cefr, stage.levelOffset || 0);
  const words = await QB.levelWords(lv);
  const spellWords = stage.mix.spell ? await QB.levelWords(shiftLevel(lv, -1)) : null;   // สะกดเองยากกว่าเลือก -> ใช้คำต่ำลง 1 ระดับ
  const used = new Set();
  const exclude = new Set();
  const sections = [];
  for (const [kind, count] of Object.entries(stage.mix)) {
    let qs = [];
    if (kind === 'halloween') qs = halloweenQuestions(count, rng, used);
    else if (kind === 'vocab') qs = markUsed(QB.vocabQuestions(words, lv, count, rng, exclude), used, exclude).map(fromQB('vocab'));
    else if (kind === 'vocabRev') qs = vocabRevQuestions(words, count, rng, used);
    else if (kind === 'context') qs = markUsed(await QB.contextQuestions(words, lv, count, rng, exclude), used, exclude).map(fromQB('context'));
    else if (kind === 'grammar') qs = QB.grammarQuestions(lv, count, rng, exclude, false).map(fromQB('grammar'));
    else if (kind === 'spell') qs = spellQuestions(spellWords, count, rng, used);
    // คลังไม่พอ (เช่น ระดับนี้ไม่มีประโยคตัวอย่าง) -> เติมด้วยโจทย์คำศัพท์ระดับเดียวกัน (หมวดเดิม เพื่อเกณฑ์หมวดยังใช้ได้)
    if (qs.length < count) {
      const extra = kind === 'spell' || kind === 'grammar' || kind === 'context'
        ? vocabRevQuestions(words, count - qs.length, rng, used) : halloweenQuestions(count - qs.length, rng, used);
      qs = qs.concat(extra);
    }
    qs.slice(0, count).forEach((q) => sections.push({ ...q, section: SECTION[kind] }));
  }
  // สลับลำดับแต่ให้หมวดเดียวกันไม่ติดกันยาว ๆ
  return seededShuffle(sections, rng).map((q, i) => ({ ...q, index: i }));
}
const publicQ = (q) => ({
  index: q.index, kind: q.kind, section: q.section, sectionTh: SECTION_TH[q.section], instruction: q.instruction, prompt: q.prompt,
  promptLang: q.promptLang || 'en', choicesLang: q.choicesLang || 'en', passage: q.passage || null,
  choices: q.kind === 'spell' ? null : q.choices, hint: q.hint || null,
});
function stageMeta(e, sid) {
  const s = e.stages[sid];
  return { id: sid, name: s.name, level: s.level, rule: s.rule || null, pass: s.pass, sectionMin: s.sectionMin || null, timeLimitSec: s.timeLimitSec,
    questions: Object.values(s.mix).reduce((a, b) => a + b, 0) };
}
function attemptView(e, row) {
  const elapsedMs = Math.max(0, now() - ms(row.started_at));
  return {
    attemptId: Number(row.id), stage: stageMeta(e, row.stage_id), questions: row.questions.map(publicQ),
    startedAt: new Date(row.started_at).toISOString(), serverNow: new Date(now()).toISOString(), elapsedMs,
    remainingMs: Math.max(0, e.stages[row.stage_id].timeLimitSec * 1000 - elapsedMs),
  };
}
const openAttemptSql = `SELECT * FROM event_challenge_attempts
  WHERE event_id = $1 AND user_id = $2 AND finished_at IS NULL AND stage_id IS NOT NULL ORDER BY id DESC LIMIT 1`;
function isLive(e, row) {
  const s = e.stages[row.stage_id];
  if (!s) return false;
  const age = now() - ms(row.started_at);
  return age <= Math.min(e.stageRules.expiresMinutes * 60000, (s.timeLimitSec + e.stageRules.graceSec) * 1000);
}

async function startStage(id, userId, stageId) {
  const e = getEvent(id);
  await syncEvents();
  const status = statusOf(e);
  if (status !== 'active') throw new EventError(status === 'ended' ? 'EVENT_ENDED' : 'EVENT_NOT_STARTED', status === 'ended' ? 'กิจกรรมนี้หมดเวลาแล้ว' : 'กิจกรรมยังไม่เริ่ม', 403);
  const stage = e.stages[stageId];
  if (!stage) throw new EventError('NO_STAGE', 'ไม่พบด่านนี้', 404);
  const adv = await computeAdventure(e, userId);
  const view = stageViews(e, adv, status)[stageId];
  if (!view || !view.available) throw new EventError('STAGE_LOCKED', (view && view.lockedReason) || 'ด่านนี้ยังไม่ปลดล็อก', 403);
  // กำลังเล่นด่านเดียวกันค้างอยู่ -> เล่นต่อ (โจทย์เดิม เวลาเดินต่อจากเดิม) · ด่านอื่นที่ค้าง -> ปิดเป็นไม่ผ่าน
  const open = (await pool.query(openAttemptSql, [e.id, userId])).rows[0];
  if (open && open.stage_id === stageId && isLive(e, open)) return { ...attemptView(e, open), resumed: true };
  if (open) {
    await pool.query(`UPDATE event_challenge_attempts SET finished_at = to_timestamp($1 / 1000.0), passed = FALSE, score = COALESCE(score, 0),
                       detail = '{"abandoned": true}'::jsonb WHERE id = $2 AND finished_at IS NULL`, [now(), open.id]);
  }
  const today = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM event_challenge_attempts WHERE event_id = $1 AND user_id = $2 AND started_at > to_timestamp($3 / 1000.0) - INTERVAL '1 day'`,
    [e.id, userId, now()])).rows[0].n;
  if (today >= e.stageRules.dailyAttempts) throw new EventError('TOO_MANY', 'เล่นด่านครบจำนวนครั้งของวันนี้แล้ว พักก่อนแล้วกลับมาพรุ่งนี้นะ', 429);
  const questions = await buildStageQuestions(stage, await userCefr(userId), newSeed());
  const { rows } = await pool.query(
    `INSERT INTO event_challenge_attempts (event_id, user_id, questions, started_at, stage_id) VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5) RETURNING *`,
    [e.id, userId, JSON.stringify(questions), now(), stageId]);
  return { ...attemptView(e, rows[0]), resumed: false };
}

/** ด่านที่เล่นค้างไว้ (ออกจากเกม/เปลี่ยนเครื่องแล้วกลับมาเล่นต่อ) */
async function currentAttempt(id, userId) {
  const e = getEvent(id);
  const open = (await pool.query(openAttemptSql, [e.id, userId])).rows[0];
  if (!open || statusOf(e) !== 'active' || !isLive(e, open)) return { attempt: null };
  return { attempt: attemptView(e, open) };
}

async function submitStage(id, userId, attemptId, answers) {
  const e = getEvent(id);
  if (statusOf(e) !== 'active') throw new EventError('EVENT_ENDED', 'กิจกรรมนี้หมดเวลาแล้ว', 403);
  if (!Array.isArray(answers) || answers.length > 40) throw new EventError('BAD_ANSWERS', 'คำตอบไม่ถูกต้อง');
  const client = await pool.connect();
  let out;
  try {
    await client.query('BEGIN');
    const r = (await client.query(
      'SELECT * FROM event_challenge_attempts WHERE id = $1 AND event_id = $2 AND user_id = $3 FOR UPDATE', [attemptId, e.id, userId])).rows[0];
    if (!r || !r.stage_id) throw new EventError('NOT_FOUND', 'ไม่พบรอบนี้', 404);
    if (r.finished_at) throw new EventError('ALREADY_SUBMITTED', 'ส่งคำตอบรอบนี้ไปแล้ว', 409);
    const stage = e.stages[r.stage_id];
    const elapsed = now() - ms(r.started_at);
    if (elapsed > e.stageRules.expiresMinutes * 60000) throw new EventError('EXPIRED', 'รอบนี้หมดอายุแล้ว เริ่มใหม่ได้เลย', 410);
    const timeUp = elapsed > (stage.timeLimitSec + e.stageRules.graceSec) * 1000;
    const results = r.questions.map((q, i) => {
      const a = answers[i];
      const correct = q.kind === 'spell'
        ? typeof a === 'string' && normSpell(a) === q.answer
        : Number.isInteger(a) && a === q.correctIndex;
      return {
        correct, section: q.section, prompt: q.prompt,
        yours: q.kind === 'spell' ? (typeof a === 'string' ? a.slice(0, 40) : '') : (Number.isInteger(a) && q.choices[a] !== undefined ? q.choices[a] : ''),
        answer: q.kind === 'spell' ? q.answer : q.choices[q.correctIndex], correctIndex: q.kind === 'spell' ? null : q.correctIndex, explain: q.explain || '',
      };
    });
    const score = results.filter((x) => x.correct).length;
    const bySection = {};
    results.forEach((x) => { const s = (bySection[x.section] = bySection[x.section] || { correct: 0, total: 0, label: SECTION_TH[x.section] }); s.total += 1; if (x.correct) s.correct += 1; });
    const sectionOk = !stage.sectionMin || Object.values(bySection).every((s) => s.correct >= Math.min(stage.sectionMin, s.total));
    const passed = !timeUp && score >= stage.pass && sectionOk;
    const reason = timeUp ? 'time_up' : score < stage.pass ? 'score' : !sectionOk ? 'section' : null;
    await client.query(
      'UPDATE event_challenge_attempts SET score = $1, passed = $2, finished_at = to_timestamp($3 / 1000.0), detail = $4, time_ms = $5 WHERE id = $6',
      [score, passed, now(), JSON.stringify({ bySection, reason }), Math.round(elapsed), r.id]);
    await client.query('COMMIT');
    out = { stage: stageMeta(e, r.stage_id), score, total: results.length, passed, reason, timeMs: Math.round(elapsed), bySection, results };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  // หลังส่ง: สถานะการผจญภัยล่าสุด (ปลดล็อก Chapter/Final ใหม่ไหม)
  const st = await eventState(id, userId);
  return { ...out, adventureComplete: st.complete, canClaim: st.canClaim, chapters: st.chapters.map((c) => ({ id: c.id, unlocked: c.unlocked, complete: c.complete })) };
}

/* ---------- คลังธีม ---------- */
async function themesOf(userId) {
  const u = (await pool.query('SELECT theme FROM users WHERE id = $1', [userId])).rows[0] || {};
  const { rows } = await pool.query('SELECT theme_id, acquired_at FROM user_themes WHERE user_id = $1 ORDER BY acquired_at', [userId]);
  const owned = rows.map((r) => r.theme_id).filter((t) => PREMIUM_THEMES[t]);
  const current = u.theme && (FREE_THEMES.includes(u.theme) || owned.includes(u.theme)) ? u.theme : null;
  return {
    current, owned,
    premium: Object.values(PREMIUM_THEMES).map((t) => ({ id: t.id, css: t.css, name: t.name, owned: owned.includes(t.id) })),
  };
}
async function setTheme(userId, theme) {
  const t = String(theme || '');
  if (!FREE_THEMES.includes(t)) {
    if (!PREMIUM_THEMES[t]) throw new EventError('BAD_THEME', 'ไม่มีธีมนี้');
    const own = (await pool.query('SELECT 1 FROM user_themes WHERE user_id = $1 AND theme_id = $2', [userId, t])).rows[0];
    if (!own) throw new EventError('THEME_LOCKED', 'ยังไม่ได้ปลดล็อกธีมนี้', 403);
  }
  await pool.query('UPDATE users SET theme = $1 WHERE id = $2', [t, userId]);
  return themesOf(userId);
}

module.exports = {
  EventError, statusOf, syncEvents, recordRound, computeAdventure, eventState, listEvents, claimReward, adminGrant,
  startStage, currentAttempt, submitStage, buildStageQuestions, themesOf, setTheme, _setNow,
};
