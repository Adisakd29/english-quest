/*
  TOEIC — แผนฝึกรายวัน (3 งานสั้น ~10–15 นาที) + streak
  - สร้างแผนครั้งเดียวต่อวัน (เวลาไทย) จากหน้าวิเคราะห์จุดอ่อน: ทบทวนข้อผิด → จุดอ่อน → กลุ่มที่ยังไม่เคยฝึก → ฝึกรวม
    เลือกให้ต่าง Part กันก่อน และมีทั้ง Listening และ Reading เมื่อทำได้
  - แต่ละงาน = Practice ปกติของ Part นั้น (body ของงานกำหนดที่เซิร์ฟเวอร์ ไม่เชื่อค่าจากหน้าเว็บ) · ผูกด้วย toeic_sessions.config.dailyTask
  - งานเสร็จเมื่อ session ของงานนั้นส่งแล้วและตอบครบทุกข้อ · งานทบทวนข้อผิดถือว่าเสร็จด้วยถ้าข้อผิดของ Part นั้นหมดแล้ว
  - ครบ 3 งาน = นับ 1 วันใน streak + โบนัส EXP ครั้งเดียวต่อวัน (ไม่มี Coin เพิ่ม · EXP/Coin ของ Practice เป็นกติกาเดิม)
*/
const pool = require('../../config/db');
const { grantOnce } = require('../../utils/exp');
const { ToeicError } = require('./part1');
const WEAK = require('./weakness');

const BONUS_EXP = 20;
const TASKS = 3;
const SIZE = { 1: 5, 2: 10, 3: 1, 4: 1, 5: 10, 6: 1, 7: 1 };
const MINUTES = { 1: 3, 2: 4, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4 };
const SIZE_TH = { 1: '5 ข้อ', 2: '10 ข้อ', 3: '1 ชุด · 3 ข้อ', 4: '1 ชุด · 3 ข้อ', 5: '10 ข้อ', 6: '1 บทความ · 4 ข้อ', 7: '1 ชุด' };
const PART_NAME = { 1: 'Part 1 · ภาพถ่าย', 2: 'Part 2 · คำถาม–คำตอบ', 3: 'Part 3 · บทสนทนา', 4: 'Part 4 · การพูดสั้น ๆ',
  5: 'Part 5 · เติมประโยค', 6: 'Part 6 · เติมข้อความ', 7: 'Part 7 · อ่านจับใจความ' };
const SECTION = (part) => (part <= 4 ? 'L' : 'R');
const FALLBACK_ORDER = [5, 2, 7, 1, 6, 3, 4];

const bkkDay = (t = Date.now()) => new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** เลือก 3 งานจากผลวิเคราะห์ (ไม่สุ่ม — ผลเดียวกันได้แผนเดียวกัน) */
function buildTasks(a) {
  const cands = [];
  const base = (part) => ({ part, partName: PART_NAME[part], size: SIZE_TH[part], minutes: MINUTES[part] });
  // 1) ทบทวนข้อที่ยังผิด (Part ที่ค้างมากที่สุด)
  [...a.parts].filter((p) => p.mistakes > 0).sort((x, y) => y.mistakes - x.mistakes || x.part - y.part).slice(0, 2).forEach((p) => {
    cands.push({ ...base(p.part), kind: 'mistakes', th: 'ทบทวนข้อที่ตอบผิด', reason: `ยังผิดค้างอยู่ ${p.mistakes} ข้อ`,
      body: { size: SIZE[p.part], source: 'mistakes' } });
  });
  // 2) จุดอ่อน (ต้องฝึก/พอใช้) เรียงตามคะแนน
  const groups = a.parts.flatMap((p) => p.groups.map((g) => ({ ...g, part: p.part })));
  const drill = (g, reason) => ({ ...base(g.part), kind: 'drill', group: g.id, th: g.th, reason,
    body: { size: SIZE[g.part], group: g.id, drill: true } });
  groups.filter((g) => (g.status === 'weak' || g.status === 'fair') && g.available)
    .sort((x, y) => x.score - y.score || y.answered - x.answered)
    .forEach((g) => cands.push(drill(g, `ถูก ${g.accuracy}% จาก ${g.answered} ข้อ`)));
  // 3) ยังไม่เคยฝึก (สลับ Part) แล้วกลุ่มที่ข้อมูลยังน้อย
  const seen = {};
  groups.filter((g) => g.status === 'untried' && g.available)
    .map((g) => { seen[g.part] = (seen[g.part] || 0) + 1; return { g, r: seen[g.part] }; })
    .sort((x, y) => x.r - y.r || x.g.part - y.g.part)
    .forEach(({ g }) => cands.push(drill(g, 'ยังไม่เคยฝึกกลุ่มนี้')));
  groups.filter((g) => g.status === 'few' && g.available).forEach((g) => cands.push(drill(g, `ข้อมูลยังน้อย (${g.answered} ข้อ)`)));
  // 4) ฝึกรวมของ Part
  FALLBACK_ORDER.forEach((part) => cands.push({ ...base(part), kind: 'practice', th: 'ฝึกรวมทุกหัวข้อ', reason: 'รักษาความคล่อง', body: { size: SIZE[part] } }));

  const key = (t) => `${t.kind}:${t.part}:${t.group || ''}`;
  const out = [];
  const take = (pred) => { for (const t of cands) { if (out.length >= TASKS) return; if (!out.some((o) => key(o) === key(t)) && pred(t)) out.push(t); } };
  take((t) => !out.some((o) => o.part === t.part));      // ต่าง Part ก่อน
  take(() => true);
  // มีทั้ง Listening และ Reading
  const secs = new Set(out.map((t) => SECTION(t.part)));
  if (secs.size === 1) {
    const other = cands.find((t) => SECTION(t.part) !== SECTION(out[0].part) && !out.some((o) => key(o) === key(t)));
    if (other) out[out.length - 1] = other;
  }
  return out.map((t, k) => ({ k, ...t }));
}

async function ensurePlan(userId, day = bkkDay()) {
  const cur = await pool.query('SELECT * FROM toeic_daily_plans WHERE user_id = $1 AND day = $2', [userId, day]);
  if (cur.rows[0]) return cur.rows[0];
  const tasks = buildTasks(await WEAK.analyze(userId, 'all'));
  await pool.query('INSERT INTO toeic_daily_plans (user_id, day, tasks) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO NOTHING',
    [userId, day, JSON.stringify(tasks)]);
  return (await pool.query('SELECT * FROM toeic_daily_plans WHERE user_id = $1 AND day = $2', [userId, day])).rows[0];
}

async function taskStates(userId, plan, day) {
  const { rows } = await pool.query(
    `SELECT s.id, s.status, s.total, s.part, s.config->>'dailyTask' AS dt,
            (SELECT COUNT(*) FROM toeic_answers a WHERE a.session_id = s.id)::int AS answered
       FROM toeic_sessions s WHERE s.user_id = $1 AND s.mode = 'practice' AND s.config->>'dailyTask' LIKE $2
      ORDER BY s.started_at DESC`, [userId, `${day}:%`]);
  const mis = await pool.query(
    `SELECT part, COUNT(*)::int AS n FROM (
       SELECT DISTINCT ON (a.question_id) a.part, a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC, a.id DESC) t
      WHERE NOT is_correct GROUP BY part`, [userId]);
  const mistakes = Object.fromEntries(mis.rows.map((r) => [r.part, r.n]));
  return plan.tasks.map((t) => {
    const ss = rows.filter((r) => r.dt === `${day}:${t.k}`);
    const done = ss.find((r) => r.status === 'finished' && r.answered >= r.total);
    const active = ss.find((r) => r.status === 'active');
    let state = done ? 'done' : active ? 'active' : 'todo';
    let note = null;
    if (state !== 'done' && t.kind === 'mistakes' && !mistakes[t.part]) { state = 'done'; note = 'ข้อที่ผิดของ Part นี้ทบทวนครบแล้ว'; }
    const s = done || active;
    return { ...t, state, note, sessionId: s ? Number(s.id) : null, answered: active ? active.answered : null, total: active ? active.total : null };
  });
}

async function streakOf(userId, today) {
  const { rows } = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS d FROM toeic_daily_plans WHERE user_id = $1 AND completed_at IS NOT NULL ORDER BY day DESC LIMIT 400`, [userId]);
  const days = new Set(rows.map((r) => r.d));
  // สมาชิก Premium: ตัวช่วยรักษา Streak — วันที่พลาด 1 วัน (วันก่อนหน้าทำครบ) ไม่ทำให้ขาด · เดือนละไม่เกิน STREAK_FREEZE_PER_MONTH
  const premium = await require('../membership').isPremium(userId).catch(() => false);
  const budget = premium ? require('../../config/membership').STREAK_FREEZE_PER_MONTH : 0;
  const usedByMonth = {}; const frozen = new Set();
  let d = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  for (let guard = 0; guard < 800; guard += 1) {
    if (days.has(d)) { current += 1; d = addDays(d, -1); continue; }
    const mon = d.slice(0, 7);
    if (current > 0 && (usedByMonth[mon] || 0) < budget && days.has(addDays(d, -1))) {
      usedByMonth[mon] = (usedByMonth[mon] || 0) + 1; frozen.add(d); d = addDays(d, -1); continue;
    }
    break;
  }
  // ยาวที่สุด (นับเฉพาะวันที่ทำครบจริง) — อย่างน้อยเท่า streak ปัจจุบัน
  const sorted = [...days].sort(); let best = 0; let run = 0; let prev = null;
  sorted.forEach((x) => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
  best = Math.max(best, current);
  const week = Array.from({ length: 7 }, (_, i) => { const x = addDays(today, i - 6); return { day: x, done: days.has(x), frozen: frozen.has(x) }; });
  const thisMonth = today.slice(0, 7);
  return { current, best, week, todayDone: days.has(today), premium,
    freeze: premium ? { perMonth: budget, usedThisMonth: usedByMonth[thisMonth] || 0 } : null };
}

async function get(userId) {
  const day = bkkDay();
  let plan = await ensurePlan(userId, day);
  const tasks = await taskStates(userId, plan, day);
  const done = tasks.filter((t) => t.state === 'done').length;
  let award = null;
  if (done === tasks.length && !plan.completed_at) {
    const upd = await pool.query('UPDATE toeic_daily_plans SET completed_at = NOW() WHERE id = $1 AND completed_at IS NULL RETURNING *', [plan.id]);
    if (upd.rows[0]) {
      plan = upd.rows[0];
      const g = await grantOnce(userId, `tdaily:${day}`, BONUS_EXP, { reason: 'toeic_daily_plan', dailyCap: BONUS_EXP });
      await pool.query('UPDATE toeic_daily_plans SET exp_awarded = $2 WHERE id = $1', [plan.id, g.gained || 0]);
      award = { exp: g.gained || 0, levelInfo: g.levelInfo || null, leveledUp: Boolean(g.leveledUp) };
    }
  }
  const nextTask = tasks.find((t) => t.state === 'active') || tasks.find((t) => t.state === 'todo') || null;
  return { day, tasks, done, total: tasks.length, completed: Boolean(plan.completed_at), minutes: tasks.reduce((a, t) => a + t.minutes, 0),
    next: nextTask ? nextTask.k : null, bonusExp: BONUS_EXP, streak: await streakOf(userId, day), justCompleted: award };
}

/** ก่อนเริ่ม Practice ที่มาจากแผน: ต้องเป็นงานของวันนี้ · Part ตรง · ยังไม่เสร็จ → คืน body ของงาน (ใช้แทน body จากหน้าเว็บ) */
async function precheck(userId, part, kIn) {
  const k = Number(kIn);
  if (!Number.isInteger(k) || k < 0 || k >= TASKS) throw new ToeicError('DAILY_BAD_TASK', 'ไม่พบงานนี้ในแผนวันนี้', 404);
  const day = bkkDay();
  const plan = await ensurePlan(userId, day);
  const t = plan.tasks.find((x) => x.k === k);
  if (!t || t.part !== part) throw new ToeicError('DAILY_BAD_TASK', 'ไม่พบงานนี้ในแผนวันนี้', 404);
  const st = (await taskStates(userId, plan, day)).find((x) => x.k === k);
  if (st.state === 'done') throw new ToeicError('DAILY_DONE', 'งานนี้ในแผนวันนี้ทำเสร็จแล้ว', 409);
  return { day, task: t };
}
async function attach(userId, sid, day, k) {
  const tag = `${day}:${Number(k)}`;
  await pool.query(`UPDATE toeic_sessions SET config = config || jsonb_build_object('dailyTask', $3::text) WHERE id = $1 AND user_id = $2 AND mode = 'practice'`, [sid, userId, tag]);
  return tag;
}

module.exports = { get, precheck, attach, BONUS_EXP, _internal: { buildTasks, bkkDay, addDays, streakOf } };
