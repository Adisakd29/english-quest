/*
  Learning Streak (v1.18.0)
  แหล่งข้อมูลจริง: answer_events (คำตอบที่เซิร์ฟเวอร์บันทึก) — หน้าเว็บส่งจำนวนวัน/สถานะมาเองไม่ได้
  sync(userId) ทำในคำขอเดียวแบบ transaction + ล็อกแถว user_streaks:
    1) บันทึกวันที่ทำเป้าหมายครบ (≥ GOAL ข้อ/วัน เวลาไทย) ลง streak_days
    2) ขาดวัน → ใช้ Streak Freeze ที่ซื้อไว้ก่อนวันที่ขาด (ถ้ามีพอครอบทุกวันที่ขาด) — ไม่พอ = streak ขาด และ Freeze ยังอยู่
    3) คำนวณ streak ปัจจุบัน (นับเฉพาะวัน goal · วัน freeze แค่เชื่อมไม่ให้ขาด) + best
    4) Milestone ใหม่ → ตรา + Coin + EXP (ได้ครั้งเดียวต่อระดับ ด้วย key ไม่ซ้ำของระบบเดิม)
*/
const pool = require('../config/db');
const CFG = require('../config/streak');
const coins = require('./coins');
const { grantOnce } = require('../utils/exp');

class StreakError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

let nowFn = () => Date.now();
function _setNow(fn) { nowFn = fn || (() => Date.now()); }
const DAY = 86400000;
const bkk = (t) => new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const BY_DAYS = Object.fromEntries(CFG.MILESTONES.map((m) => [m.days, m]));

/** วันที่ทำเป้าหมายครบในช่วง [from, today] (เวลาไทย) */
async function goalDays(db, userId, from, today) {
  const { rows } = await db.query(
    `SELECT to_char((created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
       FROM answer_events
      WHERE user_id = $1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Bangkok')
        AND created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')
      GROUP BY 1 HAVING COUNT(*) >= $4`, [userId, from, today, CFG.GOAL]);
  return rows.map((r) => r.d);
}

/** นับ streak จากรายการวัน (เรียงใหม่→เก่า) */
function computeCurrent(days, today) {
  const map = new Map(days.map((r) => [r.day, r.kind]));
  let cur = map.has(today) ? today : addDays(today, -1);
  if (!map.has(cur)) return { current: 0, start: null };
  let n = 0; let start = cur;
  while (map.has(cur)) { if (map.get(cur) === 'goal') n += 1; start = cur; cur = addDays(cur, -1); }
  return { current: n, start };
}

/** streak ยาวที่สุดในประวัติ (นับเฉพาะวัน goal · วัน freeze เชื่อม) */
function computeBest(days) {
  const asc = [...days].sort((a, b) => (a.day < b.day ? -1 : 1));
  let best = 0; let run = 0; let prev = null;
  for (const d of asc) {
    run = prev && addDays(prev, 1) === d.day ? run : 0;
    if (d.kind === 'goal') run += 1;
    best = Math.max(best, run); prev = d.day;
  }
  return best;
}

async function sync(userId) {
  const t = nowFn(); const today = bkk(t);
  const client = await pool.connect();
  let fresh = [];
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO user_streaks (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const us = (await client.query(`SELECT best, to_char(synced_day, 'YYYY-MM-DD') AS synced_day FROM user_streaks WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    // 1) วันที่ทำเป้าหมายครบ (ดูย้อนจากวันที่ sync ล่าสุด −1 · ครั้งแรกดู 7 วัน · ไม่เกิน 30 วัน)
    let from = us.synced_day ? addDays(us.synced_day, -1) : addDays(today, -7);
    if (from < addDays(today, -30)) from = addDays(today, -30);
    for (const d of await goalDays(client, userId, from, today)) {
      await client.query("INSERT INTO streak_days (user_id, day, kind) VALUES ($1, $2, 'goal') ON CONFLICT (user_id, day) DO UPDATE SET kind = 'goal'", [userId, d]);
    }
    // 2) Streak Freeze: เดินย้อนจากวันนี้/เมื่อวานตามสาย streak — เจอวันที่ขาด (ช่วงละไม่เกิน MAX_FREEZES วัน ก่อนหน้ามีวันที่นับ)
    //    → ใช้ Freeze ที่ซื้อไว้ "ก่อนหรือในวันที่ขาด" ถ้ามีพอครอบทั้งช่วง · ไม่พอ = สายขาดตรงนั้น (Freeze ไม่ถูกใช้)
    //    (ครอบทั้งกรณีขาดเมื่อวาน และกรณีไม่ได้เปิดแอปในวันที่ขาดแต่กลับมาทำเป้าหมายในวันถัดมา)
    const fz = (await client.query(
      `SELECT id, to_char((acquired_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS d FROM streak_freezes
        WHERE user_id = $1 AND used_day IS NULL ORDER BY acquired_at, id FOR UPDATE`, [userId])).rows.map((r) => ({ id: r.id, d: r.d }));
    if (fz.length) {
      const have = new Set((await client.query(`SELECT to_char(day, 'YYYY-MM-DD') AS d FROM streak_days WHERE user_id = $1 AND day >= $2::date - 400`, [userId, today])).rows.map((r) => r.d));
      const avail = [...fz]; const plan = [];
      let cur = have.has(today) ? today : addDays(today, -1);
      for (let guard = 0; guard < 400 && avail.length; guard += 1) {
        if (have.has(cur)) { cur = addDays(cur, -1); continue; }
        const gap = []; let d = cur;
        while (!have.has(d) && gap.length <= CFG.MAX_FREEZES) { gap.push(d); d = addDays(d, -1); }
        if (!have.has(d) || gap.length > avail.length) break;   // ไม่มีวันที่นับอยู่ก่อนช่วงขาด หรือ Freeze ไม่พอ
        const use = [];
        for (const g of [...gap].reverse()) {   // ใช้ Freeze ที่ซื้อไว้ก่อน/ในวันที่ขาดเท่านั้น
          const k = avail.findIndex((f) => f.d <= g && !use.includes(f));
          if (k < 0) break;
          use.push(avail[k]);
        }
        if (use.length !== gap.length) break;
        [...gap].reverse().forEach((g, i) => { plan.push({ day: g, id: use[i].id }); have.add(g); });
        use.forEach((f) => avail.splice(avail.indexOf(f), 1));
        cur = d;
      }
      for (const p of plan) {
        await client.query("INSERT INTO streak_days (user_id, day, kind) VALUES ($1, $2, 'freeze') ON CONFLICT DO NOTHING", [userId, p.day]);
        await client.query('UPDATE streak_freezes SET used_day = $2 WHERE id = $1', [p.id, p.day]);
      }
    }
    // 3) streak ปัจจุบัน + best
    const days = (await client.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, kind FROM streak_days WHERE user_id = $1 ORDER BY day DESC LIMIT 1200`, [userId])).rows.map((r) => ({ day: r.day, kind: r.kind }));
    const { current, start } = computeCurrent(days, today);
    const best = Math.max(us.best, current, computeBest(days));
    await client.query('UPDATE user_streaks SET best = $2, synced_day = $3, updated_at = NOW() WHERE user_id = $1', [userId, best, today]);
    // 4) Milestone (ตามจำนวนวันของ streak ปัจจุบัน — ไม่แจกย้อนหลังจาก streak เก่าที่ขาดไปแล้ว)
    for (const m of CFG.MILESTONES) {
      if (current < m.days) break;
      const r = await client.query('INSERT INTO streak_milestones (user_id, milestone) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING milestone', [userId, m.days]);
      if (r.rows[0]) fresh.push(m.days);
    }
    await client.query('COMMIT');
    return { today, days, current, start, best, fresh };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/** มอบรางวัลของ Milestone ที่ยังไม่ได้รับ (idempotent · ซ่อมเองถ้าครั้งก่อนล้มกลางทาง) */
async function settleRewards(userId) {
  const { rows } = await pool.query(
    `SELECT sm.milestone FROM streak_milestones sm
      WHERE sm.user_id = $1 AND (
        NOT EXISTS (SELECT 1 FROM coin_transactions c WHERE c.user_id = $1 AND c.source_key = 'streak:' || sm.milestone)
        OR NOT EXISTS (SELECT 1 FROM exp_awards e WHERE e.user_id = $1 AND e.award_key = 'streak:' || sm.milestone))`, [userId]);
  const out = [];
  for (const r of rows) {
    const m = BY_DAYS[r.milestone]; if (!m) continue;
    const c = await coins.grant(userId, { type: 'STREAK_MILESTONE', key: `streak:${m.days}`, amount: m.coins, sourceId: String(m.days), description: `Streak ${m.days} วัน — ${m.nameTh}` });
    const e = await grantOnce(userId, `streak:${m.days}`, m.exp, { reason: 'streak' });
    out.push({ days: m.days, coins: c.granted ? c.amount : 0, exp: e.already ? 0 : e.gained, leveledUp: Boolean(e.leveledUp), levelInfo: e.levelInfo || null });
  }
  return out;
}

async function answersToday(userId) {
  return (await pool.query(
    `SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1
       AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`, [userId])).rows[0].n;
}

const pub = (m) => ({ days: m.days, coins: m.coins, exp: m.exp, tier: m.tier, name: m.name, nameTh: m.nameTh });

/** สถานะเต็ม (หน้า Streak + การ์ดหน้าแรก) */
async function status(userId, { settle = true } = {}) {
  const n = await answersToday(userId);
  if (n >= CFG.GOAL) await coins.checkGoals(userId, n, CFG.GOAL).catch((e) => console.error('[streak/goal]', e.message));
  const s = await sync(userId);
  const rewards = settle ? await settleRewards(userId) : [];
  const [fz, ms] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM streak_freezes WHERE user_id = $1 AND used_day IS NULL', [userId]),
    pool.query('SELECT milestone, reached_at, seen FROM streak_milestones WHERE user_id = $1', [userId]),
  ]);
  const got = Object.fromEntries(ms.rows.map((r) => [r.milestone, r]));
  const map = new Map(s.days.map((d) => [d.day, d.kind]));
  const calendar = [];
  for (let i = CFG.CALENDAR_DAYS - 1; i >= 0; i -= 1) { const d = addDays(s.today, -i); calendar.push({ day: d, kind: map.get(d) || null }); }
  const doneToday = map.get(s.today) === 'goal';
  const next = CFG.MILESTONES.find((m) => !got[m.days] && m.days > s.current) || null;
  const top = [...CFG.MILESTONES].reverse().find((m) => got[m.days]) || null;
  return {
    current: s.current, best: s.best, today: s.today, doneToday,
    atRisk: s.current > 0 && !doneToday,
    progress: { answers: Math.min(n, CFG.GOAL), goal: CFG.GOAL },
    freezes: { held: fz.rows[0].n, max: CFG.MAX_FREEZES, price: CFG.FREEZE_PRICE, usedRecently: s.days.filter((d) => d.kind === 'freeze' && d.day >= addDays(s.today, -7)).map((d) => d.day) },
    calendar,
    milestones: CFG.MILESTONES.map((m) => ({ ...pub(m), reached: Boolean(got[m.days]), reachedAt: got[m.days] ? got[m.days].reached_at : null })),
    next: next ? { ...pub(next), remaining: next.days - s.current } : null,
    badge: top ? pub(top) : null,
    celebrate: ms.rows.filter((r) => !r.seen).map((r) => r.milestone).sort((a, b) => a - b).map((d) => pub(BY_DAYS[d])).filter(Boolean),
    rewards,
  };
}

async function markSeen(userId) {
  await pool.query('UPDATE streak_milestones SET seen = TRUE WHERE user_id = $1 AND NOT seen', [userId]);
}

/** ซื้อ Streak Freeze — ราคา/จำนวนจาก config ฝั่งเซิร์ฟเวอร์เท่านั้น · ทำทั้งหมดใน transaction เดียว */
async function buyFreeze(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await coins.ensureWallet(client, userId);
    const w = (await client.query('SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    const held = (await client.query('SELECT COUNT(*)::int AS n FROM streak_freezes WHERE user_id = $1 AND used_day IS NULL', [userId])).rows[0].n;
    if (held >= CFG.MAX_FREEZES) throw new StreakError('MAX_FREEZES', `มี Streak Freeze ครบ ${CFG.MAX_FREEZES} อันแล้ว`, 409);
    const price = CFG.FREEZE_PRICE;
    if (w.balance < price) throw new StreakError('INSUFFICIENT', `Coin ไม่พอ (มี ${w.balance} · ต้องใช้ ${price})`, 402);
    const balance = (await client.query('UPDATE coin_wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance', [userId, price])).rows[0].balance;
    const f = (await client.query('INSERT INTO streak_freezes (user_id, price, acquired_at) VALUES ($1, $2, to_timestamp($3 / 1000.0)) RETURNING id', [userId, price, nowFn()])).rows[0];
    await client.query(
      `INSERT INTO coin_transactions (user_id, amount, type, source_key, source_id, description, balance_after)
       VALUES ($1, $2, 'STREAK_FREEZE', $3, $4, 'ซื้อ Streak Freeze', $5)`, [userId, -price, `frz:${f.id}`, String(f.id), balance]);
    await client.query('COMMIT');
    return { held: held + 1, max: CFG.MAX_FREEZES, price, balance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/** ตราสูงสุด (โปรไฟล์ / การ์ดผู้เล่น) + streak ปัจจุบันแบบอ่านอย่างเดียว (ไม่ sync) */
async function badgeOf(userId) {
  const [ms, us, days] = await Promise.all([
    pool.query('SELECT MAX(milestone)::int AS m FROM streak_milestones WHERE user_id = $1', [userId]),
    pool.query('SELECT best FROM user_streaks WHERE user_id = $1', [userId]),
    pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, kind FROM streak_days WHERE user_id = $1 ORDER BY day DESC LIMIT 1200`, [userId]),
  ]);
  const m = BY_DAYS[ms.rows[0].m];
  const { current } = computeCurrent(days.rows.map((r) => ({ day: r.day, kind: r.kind })), bkk(nowFn()));
  return { current, best: Math.max(us.rows[0] ? us.rows[0].best : 0, current), badge: m ? pub(m) : null };
}

module.exports = { status, sync, settleRewards, markSeen, buyFreeze, badgeOf, StreakError, _setNow, _internal: { computeCurrent, computeBest, addDays, bkk } };
