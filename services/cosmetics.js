/*
  v1.21.0 กรอบโปรไฟล์ / กรอบแชท + รางวัลทุก 10 เลเวล
  - รายการ/ราคา/เงื่อนไข: config/cosmetics.js (เซิร์ฟเวอร์เท่านั้น)
  - ซื้อ: หัก Coin + บันทึก coin_transactions + เพิ่ม user_cosmetics ใน transaction เดียว (ล็อกกระเป๋า กันซื้อซ้อน)
  - รางวัลเลเวล: เลเวลคำนวณจาก users.exp ฝั่งเซิร์ฟเวอร์ · รับได้ครั้งเดียวต่อเลเวล (PK + source_key 'lvl:<เลเวล>')
    ผู้ที่เลเวลเกินแล้วตอนอัปเดต รับย้อนหลังได้ทุกขั้นที่ถึงแล้ว
  - ไม่ลบ/ไม่ลดของเดิมของผู้ใช้
*/
const pool = require('../config/db');
const coins = require('./coins');
const { getLevelInfo } = require('../utils/leveling');
const C = require('../config/cosmetics');

class CosmeticError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const KIND_COL = { pframe: 'profile_frame', cframe: 'chat_frame' };

function publicItem(f) {
  return { id: f.id, kind: f.kind, nameTh: f.nameTh, rarity: f.rarity, rarityTh: C.RARITY_TH[f.rarity], source: f.source, price: f.price, level: f.level || null, col: f.col || null };
}

async function levelOf(userId, db = pool) {
  const r = (await db.query('SELECT exp FROM users WHERE id = $1', [userId])).rows[0];
  if (!r) throw new CosmeticError('NO_USER', 'ไม่พบผู้ใช้', 404);
  return getLevelInfo(Number(r.exp)).level;
}

/** แคตตาล็อก + ของที่มี + ที่ใส่อยู่ + ยอด Coin */
async function catalog(userId) {
  const [own, me, w] = await Promise.all([
    pool.query('SELECT item_id, via, acquired_at FROM user_cosmetics WHERE user_id = $1', [userId]),
    pool.query('SELECT exp, profile_frame, chat_frame FROM users WHERE id = $1', [userId]),
    coins.wallet(userId),
  ]);
  const owned = new Map(own.rows.map((r) => [r.item_id, r]));
  const u = me.rows[0] || {};
  const level = getLevelInfo(Number(u.exp || 0)).level;
  return {
    level,
    balance: w.balance,
    equipped: { pframe: u.profile_frame || null, cframe: u.chat_frame || null },
    items: C.ALL.map((f) => ({ ...publicItem(f), owned: owned.has(f.id), via: owned.has(f.id) ? owned.get(f.id).via : null })),
  };
}

/** ซื้อกรอบ — ราคาจาก config เท่านั้น · ซื้อซ้ำไม่ได้ · กรอบรางวัลเลเวลซื้อไม่ได้ */
async function purchase(userId, itemId) {
  const f = typeof itemId === 'string' ? C.BY_ID[itemId] : null;
  if (!f) throw new CosmeticError('NO_ITEM', 'ไม่พบกรอบนี้', 404);
  if (f.source !== 'shop' || !(f.price > 0)) throw new CosmeticError('LEVEL_ONLY', `กรอบนี้ได้จากรางวัลเลเวล ${f.level} เท่านั้น ซื้อไม่ได้`, 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await coins.ensureWallet(client, userId);
    const w = (await client.query('SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    const has = await client.query('SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND item_id = $2', [userId, f.id]);
    if (has.rows[0]) throw new CosmeticError('ALREADY_OWNED', 'คุณมีกรอบนี้แล้ว', 409);
    if (w.balance < f.price) throw new CosmeticError('INSUFFICIENT', `Coin ไม่พอ (มี ${w.balance} · ต้องใช้ ${f.price})`, 402);
    const balance = (await client.query('UPDATE coin_wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance', [userId, f.price])).rows[0].balance;
    await client.query(
      `INSERT INTO coin_transactions (user_id, amount, type, source_key, source_id, description, balance_after)
       VALUES ($1, $2, 'COSMETIC_PURCHASE', $3, $4, $5, $6)`,
      [userId, -f.price, `buyf:${f.id}`, f.id, `ซื้อ${f.kind === 'pframe' ? 'กรอบโปรไฟล์' : 'กรอบแชท'} ${f.nameTh}`.slice(0, 160), balance]);
    await client.query("INSERT INTO user_cosmetics (user_id, item_id, via, price_paid) VALUES ($1, $2, 'purchase', $3)", [userId, f.id, f.price]);
    await client.query('COMMIT');
    return { itemId: f.id, price: f.price, balance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new CosmeticError('ALREADY_OWNED', 'คุณมีกรอบนี้แล้ว', 409);
    throw err;
  } finally { client.release(); }
}

/** ใส่/ถอดกรอบ (itemId = null = ถอด) — ต้องเป็นของที่มีเท่านั้น */
async function equip(userId, kind, itemId) {
  const col = KIND_COL[kind];
  if (!col) throw new CosmeticError('BAD_KIND', 'ประเภทกรอบไม่ถูกต้อง');
  if (itemId !== null) {
    const f = typeof itemId === 'string' ? C.BY_ID[itemId] : null;
    if (!f || f.kind !== kind) throw new CosmeticError('NO_ITEM', 'ไม่พบกรอบนี้', 404);
    const has = await pool.query('SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND item_id = $2', [userId, f.id]);
    if (!has.rows[0]) throw new CosmeticError('NOT_OWNED', 'ยังไม่มีกรอบนี้', 403);
  }
  await pool.query(`UPDATE users SET ${col} = $1 WHERE id = $2`, [itemId, userId]);
  require('./avatar').invalidateLook(userId);
  return { kind, itemId };
}

/* ---------------- รางวัลทุก 10 เลเวล ---------------- */
async function levelRewards(userId) {
  const level = await levelOf(userId);
  const claimed = new Map((await pool.query('SELECT level, claimed_at FROM level_reward_claims WHERE user_id = $1', [userId])).rows.map((r) => [r.level, r.claimed_at]));
  const top = Math.max(100, Math.floor(level / C.LEVEL_STEP) * C.LEVEL_STEP + C.LEVEL_STEP);
  const list = [];
  for (let L = C.LEVEL_STEP; L <= top; L += C.LEVEL_STEP) {
    const r = C.rewardFor(L);
    list.push({ level: L, coins: r.coins, items: r.items.map((id) => publicItem(C.BY_ID[id])),
      status: claimed.has(L) ? 'claimed' : level >= L ? 'claimable' : 'locked', claimedAt: claimed.get(L) || null });
  }
  return { level, claimable: list.filter((x) => x.status === 'claimable').length, rewards: list };
}

/** รับรางวัลเลเวล L (ครั้งเดียว) */
async function claim(userId, levelRaw) {
  const L = Number(levelRaw);
  const r = C.rewardFor(L);
  if (!r) throw new CosmeticError('BAD_LEVEL', 'ไม่มีรางวัลของเลเวลนี้');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const level = await levelOf(userId, client);
    if (level < L) throw new CosmeticError('LOCKED', `ต้องถึงเลเวล ${L} ก่อน (ตอนนี้เลเวล ${level})`, 403);
    const ins = await client.query(
      'INSERT INTO level_reward_claims (user_id, level, coins, items) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING level',
      [userId, L, r.coins, r.items]);
    if (!ins.rows[0]) throw new CosmeticError('ALREADY_CLAIMED', `รับรางวัลเลเวล ${L} ไปแล้ว`, 409);
    const c = await coins.grant(userId, { type: 'LEVEL_REWARD', key: `lvl:${L}`, amount: r.coins, sourceId: String(L), description: `รางวัลเลเวล ${L}` }, { db: client });
    for (const id of r.items) {
      // eslint-disable-next-line no-await-in-loop
      await client.query("INSERT INTO user_cosmetics (user_id, item_id, via) VALUES ($1, $2, 'level') ON CONFLICT DO NOTHING", [userId, id]);
    }
    await client.query('COMMIT');
    coins.scheduleAchievements(userId);
    return { level: L, coins: c.granted ? c.amount : 0, balance: c.balance, items: r.items.map((id) => publicItem(C.BY_ID[id])) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new CosmeticError('ALREADY_CLAIMED', `รับรางวัลเลเวล ${L} ไปแล้ว`, 409);
    throw err;
  } finally { client.release(); }
}

/** รับทุกขั้นที่ถึงแล้ว (ย้อนหลังได้) */
async function claimAll(userId) {
  const { rewards } = await levelRewards(userId);
  const out = [];
  for (const x of rewards.filter((y) => y.status === 'claimable')) {
    try { out.push(await claim(userId, x.level)); } catch (err) { if (err.code !== 'ALREADY_CLAIMED') throw err; }   // eslint-disable-line no-await-in-loop
  }
  const balance = out.length ? out[out.length - 1].balance : (await coins.wallet(userId)).balance;
  return { claimed: out, coins: out.reduce((s, x) => s + x.coins, 0), items: out.flatMap((x) => x.items), balance };
}

module.exports = { CosmeticError, catalog, purchase, equip, levelRewards, claim, claimAll, publicItem, KIND_COL };
