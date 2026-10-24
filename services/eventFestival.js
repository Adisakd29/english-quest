/*
  Halloween Costume Festival 2026 — Daily Login Reward + Learning Event Quests (kind 'festival' ใน config/events.js)
  ใช้โครงสร้างกิจกรรมเดิม: ตาราง events · ด่านโจทย์ฝั่งเซิร์ฟเวอร์ (services/events.js) · Inventory เดิม (user_inventory) · Coin เดิม

  ความปลอดภัย / ความถูกต้อง
    - "วัน" = วันที่ตามเวลาไทย (Asia/Bangkok) จากนาฬิกาเซิร์ฟเวอร์เท่านั้น — เวลาในเครื่องผู้เล่นไม่มีผล
    - รับรางวัลวันละครั้ง: ตรวจในทรานแซกชัน (ล็อกต่อผู้เล่น) + UNIQUE (event, user, claim_date) และ (event, user, day_no) ในฐานข้อมูล
      → กดพร้อมกันหลายเครื่อง/หลายแท็บ ได้ครั้งเดียว
    - บันทึกการรับ + เพิ่มของเข้า Inventory อยู่ในทรานแซกชันเดียวกัน (สำเร็จทั้งคู่หรือไม่เกิดเลย)
    - นับ "จำนวนวันที่รับสำเร็จ" ไม่ต้องต่อเนื่อง · ขาดได้ไม่รีเซ็ต · Day ถัดไป = จำนวนที่รับแล้ว + 1
    - ของที่ได้เป็นของถาวร (ไม่มีการลบเมื่อกิจกรรมจบ) · ช่องทางได้ = acquisition_type 'event_login' / 'event_quest'
*/
const pool = require('../config/db');
const ev = require('./events');
const coins = require('./coins');
const { EVENT_BY_ID } = require('../config/events');

const TZ = 'Asia/Bangkok';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** วันที่ (YYYY-MM-DD) ตามเวลาไทยของเวลา t (ms) */
const bkkDate = (t) => dateFmt.format(new Date(t));
/** เวลาเที่ยงคืน (เวลาไทย) ของวันถัดไป — ใช้บอกผู้เล่นว่ารับครั้งต่อไปได้เมื่อไร */
function nextMidnight(t) {
  const d = bkkDate(t);
  return new Date(`${d}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000;
}

function getFestival(id) {
  const e = EVENT_BY_ID[id];
  if (!e || e.kind !== 'festival') throw new ev.EventError('NOT_FOUND', 'ไม่พบกิจกรรมนี้', 404);
  return e;
}
function ensureActive(e) {
  const status = ev.statusOf(e);
  if (status !== 'active') {
    throw new ev.EventError(status === 'ended' ? 'EVENT_ENDED' : 'EVENT_NOT_STARTED', status === 'ended' ? 'กิจกรรมนี้จบแล้ว — ของที่ได้รับแล้วยังอยู่ในตู้เสื้อผ้าของคุณ' : 'กิจกรรมยังไม่เริ่ม', 403);
  }
}
const startMs = (e) => new Date(e.startsAt).getTime();
const endMs = (e) => new Date(e.endsAt).getTime();

/* ---------- Login ---------- */
async function loginRows(e, userId, db = pool) {
  const { rows } = await db.query(
    'SELECT day_no, claim_date::text AS claim_date, items, claimed_at FROM event_login_claims WHERE event_id = $1 AND user_id = $2 ORDER BY day_no',
    [e.id, userId]);
  return rows;
}

function loginView(e, rows, t) {
  const status = ev.statusOf(e, t);
  const today = bkkDate(t);
  const claimedToday = rows.some((r) => r.claim_date === today);
  const n = rows.length;
  const canClaim = status === 'active' && !claimedToday && n < e.login.length;
  return {
    total: e.login.length, claimedDays: n, claimedToday, canClaim, today,
    nextClaimAt: status === 'active' && claimedToday && n < e.login.length && nextMidnight(t) < endMs(e) ? new Date(nextMidnight(t)).toISOString() : null,
    days: e.login.map((d) => {
      const r = rows.find((x) => x.day_no === d.day);
      let st;
      if (r) st = 'claimed';
      else if (status !== 'active') st = status === 'ended' ? 'expired' : 'upcoming';
      else if (d.day === n + 1) st = claimedToday ? 'tomorrow' : 'available';
      else st = 'upcoming';
      return { day: d.day, title: d.title, titleTh: d.titleTh, items: d.items, status: st, claimedAt: r ? r.claimed_at : null, claimDate: r ? r.claim_date : null };
    }),
  };
}

/** รับรางวัลล็อกอินของวันนี้ (วันละครั้ง) */
async function claimLogin(id, userId) {
  const e = getFestival(id);
  await ev.syncEvents();
  ensureActive(e);
  const t = ev._now();
  const today = bkkDate(t);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ล็อกต่อ (กิจกรรม, ผู้เล่น): คำขอซ้อนกันรอคิว แล้วเห็นแถวที่อีกคำขอเพิ่งบันทึก
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${e.id}:${userId}`]);
    const rows = await loginRows(e, userId, client);
    if (rows.some((r) => r.claim_date === today)) {
      throw new ev.EventError('ALREADY_CLAIMED_TODAY', 'วันนี้รับรางวัลแล้ว — กลับมารับรางวัลถัดไปพรุ่งนี้นะ', 409);
    }
    if (rows.length >= e.login.length) throw new ev.EventError('ALL_CLAIMED', 'รับรางวัลครบทุกวันแล้ว', 409);
    const reward = e.login[rows.length];
    await client.query(
      `INSERT INTO event_login_claims (event_id, user_id, day_no, claim_date, items, claimed_at)
       VALUES ($1, $2, $3, $4::date, $5, to_timestamp($6 / 1000.0))`,
      [e.id, userId, reward.day, today, JSON.stringify(reward.items), t]);
    const added = [];
    for (const itemId of reward.items) {
      const r = await client.query(
        "INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ($1, $2, 'event_login') ON CONFLICT DO NOTHING RETURNING item_id",
        [userId, itemId]);
      if (r.rowCount) added.push(itemId);
    }
    await client.query('COMMIT');
    return { claimed: true, day: reward.day, title: reward.title, titleTh: reward.titleTh, items: reward.items, added, state: await festivalState(id, userId) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new ev.EventError('ALREADY_CLAIMED_TODAY', 'วันนี้รับรางวัลแล้ว — กลับมารับรางวัลถัดไปพรุ่งนี้นะ', 409);
    throw err;
  } finally { client.release(); }
}

/* ---------- Quests ---------- */
async function questFacts(e, userId) {
  const from = new Date(startMs(e)); const to = new Date(endMs(e));
  const [stages, toeic, claims] = await Promise.all([
    pool.query(`SELECT DISTINCT stage_id FROM event_challenge_attempts
                 WHERE event_id = $1 AND user_id = $2 AND passed AND finished_at >= $3 AND finished_at < $4`, [e.id, userId, from, to]),
    pool.query('SELECT COUNT(*)::int AS n FROM toeic_answers WHERE user_id = $1 AND is_correct AND created_at >= $2 AND created_at < $3', [userId, from, to]),
    pool.query('SELECT quest_id, claimed_at FROM event_quest_claims WHERE event_id = $1 AND user_id = $2', [e.id, userId]),
  ]);
  return {
    stagesPassed: new Set(stages.rows.map((r) => r.stage_id)), toeicCorrect: toeic.rows[0].n,
    claims: Object.fromEntries(claims.rows.map((r) => [r.quest_id, r.claimed_at])),
  };
}

function questViews(e, f, status) {
  const base = e.quests.filter((q) => q.kind !== 'quests');
  const progressOf = (q) => {
    if (q.kind === 'stage') return f.stagesPassed.has(q.stage) ? 1 : 0;
    if (q.kind === 'toeic') return Math.min(q.target, f.toeicCorrect);
    if (q.kind === 'quests') return Math.min(q.target, base.filter((b) => progressOf(b) >= b.target).length);
    return 0;
  };
  return e.quests.map((q) => {
    const progress = progressOf(q);
    const done = progress >= q.target;
    const claimed = Boolean(f.claims[q.id]);
    const stage = q.stage ? e.stages[q.stage] : null;
    return {
      id: q.id, kind: q.kind, icon: q.icon, title: q.title, titleTh: q.titleTh, desc: q.desc, target: q.target, progress, done,
      claimed, claimedAt: f.claims[q.id] || null, canClaim: status === 'active' && done && !claimed, reward: q.reward,
      stage: stage ? { id: q.stage, name: stage.name, rule: stage.rule, questions: Object.values(stage.mix).reduce((a, b) => a + b, 0), timeLimitSec: stage.timeLimitSec } : null,
    };
  });
}

/** รับรางวัลเควสต์ (ของ + Coin + ป้าย) — ครั้งเดียวต่อเควสต์ · ทรานแซกชันเดียว */
async function claimQuest(id, userId, questId) {
  const e = getFestival(id);
  await ev.syncEvents();
  ensureActive(e);
  const q = e.quests.find((x) => x.id === questId);
  if (!q) throw new ev.EventError('NO_QUEST', 'ไม่พบเควสต์นี้', 404);
  const view = questViews(e, await questFacts(e, userId), 'active').find((x) => x.id === questId);
  if (view.claimed) throw new ev.EventError('ALREADY_CLAIMED', 'รับรางวัลเควสต์นี้แล้ว', 409);
  if (!view.done) throw new ev.EventError('QUEST_INCOMPLETE', 'ยังทำเควสต์นี้ไม่สำเร็จ', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      'INSERT INTO event_quest_claims (event_id, user_id, quest_id, reward) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING claimed_at',
      [e.id, userId, q.id, JSON.stringify(q.reward)]);
    if (!ins.rowCount) throw new ev.EventError('ALREADY_CLAIMED', 'รับรางวัลเควสต์นี้แล้ว', 409);
    const added = [];
    for (const itemId of q.reward.items || []) {
      const r = await client.query(
        "INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ($1, $2, 'event_quest') ON CONFLICT DO NOTHING RETURNING item_id", [userId, itemId]);
      if (r.rowCount) added.push(itemId);
    }
    let badge = null;
    if (q.reward.badge) {
      const b = await client.query('INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING achievement_id', [userId, q.reward.badge]);
      badge = b.rowCount ? q.reward.badge : null;
    }
    let coin = { granted: false, amount: 0 };
    if (q.reward.coins) {
      coin = await coins.grant(userId, { type: 'EVENT_QUEST', key: `evq:${e.id}:${q.id}`, amount: q.reward.coins, sourceId: `${e.id}:${q.id}`,
        description: `${e.nameTh}: ${q.titleTh}` }, { db: client });
    }
    await client.query('COMMIT');
    return { claimed: true, quest: q.id, coins: coin.granted ? coin.amount : 0, balance: coin.balance, items: q.reward.items || [], added, badge,
      state: await festivalState(id, userId) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new ev.EventError('ALREADY_CLAIMED', 'รับรางวัลเควสต์นี้แล้ว', 409);
    throw err;
  } finally { client.release(); }
}

/** สถานะเทศกาลของผู้เล่น (ปฏิทินรางวัล + เควสต์) */
async function festivalState(id, userId) {
  const e = getFestival(id);
  await ev.syncEvents();
  const t = ev._now();
  const status = ev.statusOf(e, t);
  const [rows, f] = await Promise.all([loginRows(e, userId), questFacts(e, userId)]);
  const days = Math.max(0, Math.ceil((endMs(e) - t) / (24 * 3600 * 1000)));
  return {
    id: e.id, kind: 'festival', name: e.name, nameTh: e.nameTh, status, timezone: TZ,
    startsAt: new Date(startMs(e)).toISOString(), endsAt: new Date(endMs(e)).toISOString(), endsLabel: e.endsLabel,
    serverNow: new Date(t).toISOString(), daysLeft: status === 'active' ? days : 0,
    login: loginView(e, rows, t),
    quests: questViews(e, f, status),
  };
}

module.exports = { claimLogin, claimQuest, festivalState, bkkDate, getFestival };
