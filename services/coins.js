/*
  Coin Wallet — ยอดคงเหลือเชื่อถือจากเซิร์ฟเวอร์เท่านั้น (หน้าเว็บส่งจำนวน Coin มาเองไม่ได้)
  - ทุกการเข้า/ออกมี transaction (coin_transactions) พร้อม balance_after
  - รางวัลแต่ละอย่างมี source_key ไม่ซ้ำต่อผู้ใช้ (UNIQUE) -> ได้ซ้ำไม่ได้แม้ส่งพร้อมกัน
  - ล็อกแถวกระเป๋า (SELECT ... FOR UPDATE) ระหว่างเปลี่ยนยอด -> ไม่มีการแข่งกันเขียนจนยอดเพี้ยน · balance >= 0 (CHECK)
*/
const pool = require('../config/db');
const { RULES, EXP_KEY_RULES, WELCOME_COINS, WEEKLY_GOAL_DAYS } = require('../config/coinRewards');

class CoinError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const bkkDay = (t = Date.now()) => new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
const TODAY_SQL = "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')";

/** สร้างกระเป๋า + Coin ต้อนรับ (ครั้งเดียว) — ใช้ client ของ transaction ที่เรียกได้ */
async function ensureWallet(db, userId) {
  const ins = await db.query('INSERT INTO coin_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING RETURNING user_id', [userId]);
  if (ins.rows[0] && WELCOME_COINS > 0) {
    const t = await db.query(
      `INSERT INTO coin_transactions (user_id, amount, type, source_key, description, balance_after)
       VALUES ($1, $2, 'WELCOME', 'welcome', $3, $2) ON CONFLICT (user_id, source_key) DO NOTHING RETURNING id`,
      [userId, WELCOME_COINS, RULES.WELCOME.th]);
    if (t.rows[0]) await db.query('UPDATE coin_wallets SET balance = balance + $2, lifetime_earned = lifetime_earned + $2 WHERE user_id = $1', [userId, WELCOME_COINS]);
  }
}

/**
 * ให้ Coin (รางวัลจาก event ที่เซิร์ฟเวอร์ตรวจแล้วเท่านั้น)
 * @param {object} o { type (คีย์ใน RULES), key (ไม่ซ้ำต่อผู้ใช้), amount?, description?, sourceId?, dailyLimit? }
 * @returns {{granted:boolean, amount:number, balance:number|null, reason?:string}}
 */
async function grant(userId, o, { db = null } = {}) {
  const rule = RULES[o.type];
  if (!rule) throw new Error(`unknown coin type ${o.type}`);
  const amount = Math.round(o.amount !== undefined ? o.amount : rule.amount);
  if (!(amount > 0) || !o.key) return { granted: false, amount: 0, balance: null, reason: 'zero' };
  const own = !db;
  const client = db || await pool.connect();
  try {
    if (own) await client.query('BEGIN');
    await ensureWallet(client, userId);
    const w = await client.query('SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const dup = await client.query('SELECT 1 FROM coin_transactions WHERE user_id = $1 AND source_key = $2', [userId, String(o.key).slice(0, 96)]);
    if (dup.rows[0]) { if (own) await client.query('ROLLBACK'); return { granted: false, amount: 0, balance: w.rows[0].balance, reason: 'already' }; }
    const limit = o.dailyLimit !== undefined ? o.dailyLimit : rule.dailyLimit;
    if (limit) {
      const c = await client.query(`SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = $2 AND created_at >= ${TODAY_SQL}`, [userId, o.type]);
      if (c.rows[0].n >= limit) { if (own) await client.query('ROLLBACK'); return { granted: false, amount: 0, balance: w.rows[0].balance, reason: 'daily_limit' }; }
    }
    const up = await client.query(
      'UPDATE coin_wallets SET balance = balance + $2, lifetime_earned = lifetime_earned + $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance', [userId, amount]);
    const balance = up.rows[0].balance;
    await client.query(
      `INSERT INTO coin_transactions (user_id, amount, type, source_key, source_id, description, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, amount, o.type, String(o.key).slice(0, 96), o.sourceId ? String(o.sourceId).slice(0, 64) : null, (o.description || rule.th).slice(0, 160), balance]);
    if (own) await client.query('COMMIT');
    return { granted: true, amount, balance };
  } catch (err) {
    if (own) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return { granted: false, amount: 0, balance: null, reason: 'already' };   // ชนกันพร้อมกัน -> ได้ครั้งเดียว
    throw err;
  } finally { if (own) client.release(); }
}

/** Hook จาก utils/exp.js grantOnce: key EXP ใหม่ที่ตรงกฎ -> ได้ Coin (ไม่แตะ EXP) */
async function onExpAward(userId, expKey) {
  const r = EXP_KEY_RULES.find((x) => String(expKey).startsWith(x.prefix));
  if (!r) return null;
  const key = r.key ? r.key(expKey) : `x:${expKey}`;
  const res = await grant(userId, { type: r.rule, key, sourceId: expKey });
  if (res.granted) scheduleAchievements(userId);
  return res;
}

/** เป้าหมายรายวัน/รายสัปดาห์ (เรียกจาก GET /progress/home — ตัวเลขมาจาก answer_events ฝั่งเซิร์ฟเวอร์) */
async function checkGoals(userId, answeredToday, goal) {
  if (!(answeredToday >= goal && goal > 0)) return null;
  const day = bkkDay();
  const d = await grant(userId, { type: 'DAILY_GOAL', key: `goal:${day}`, sourceId: day });
  // สัปดาห์ จันทร์–อาทิตย์ (เวลาไทย)
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const wk = monday.toISOString().slice(0, 10);
  const c = await pool.query(
    "SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = 'DAILY_GOAL' AND source_id >= $2", [userId, wk]);
  let w = null;
  if (c.rows[0].n >= WEEKLY_GOAL_DAYS) w = await grant(userId, { type: 'WEEKLY_GOAL', key: `week:${wk}`, sourceId: wk });
  return { daily: d, weekly: w };
}

async function wallet(userId) {
  await ensureWallet(pool, userId);
  const { rows } = await pool.query('SELECT balance, lifetime_earned FROM coin_wallets WHERE user_id = $1', [userId]);
  const last = await pool.query('SELECT id FROM coin_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
  return { balance: rows[0].balance, lifetimeEarned: rows[0].lifetime_earned, lastTxnId: last.rows[0] ? Number(last.rows[0].id) : 0 };
}

async function history(userId, { before = null, limit = 30 } = {}) {
  await ensureWallet(pool, userId);
  const lim = Math.max(1, Math.min(100, Number(limit) || 30));
  const params = [userId, lim + 1];
  let where = 'user_id = $1';
  if (before && /^\d+$/.test(String(before))) { params.push(before); where += ' AND id < $3'; }
  const { rows } = await pool.query(
    `SELECT id, amount, type, description, balance_after, created_at FROM coin_transactions WHERE ${where} ORDER BY id DESC LIMIT $2`, params);
  return {
    items: rows.slice(0, lim).map((r) => ({ id: Number(r.id), amount: r.amount, type: r.type, description: r.description, balanceAfter: r.balance_after, at: r.created_at })),
    more: rows.length > lim,
  };
}

/** รายการที่ได้รับหลัง txn id หนึ่ง (หน้าเว็บใช้แสดง "+10 Coins" หลังทำกิจกรรม) */
async function since(userId, afterId) {
  const { rows } = await pool.query(
    'SELECT id, amount, type, description, balance_after FROM coin_transactions WHERE user_id = $1 AND id > $2 ORDER BY id LIMIT 20', [userId, Number(afterId) || 0]);
  return rows.map((r) => ({ id: Number(r.id), amount: r.amount, type: r.type, description: r.description, balanceAfter: r.balance_after }));
}

// Achievement ตรวจแบบหน่วงเวลา (ไม่ถ่วงคำตอบของบทเรียน)
let achievementsMod = null;
const pending = new Map();
function scheduleAchievements(userId) {
  if (pending.has(userId)) return;
  pending.set(userId, setTimeout(() => {
    pending.delete(userId);
    achievementsMod = achievementsMod || require('./avatar/achievements');
    achievementsMod.evaluate(userId).catch((e) => console.error('[achievements]', e.message));
  }, 300));
}

module.exports = { CoinError, ensureWallet, grant, onExpAward, checkGoals, wallet, history, since, scheduleAchievements, bkkDay };
