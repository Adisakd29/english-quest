/*
  Christmas 2026 — บริการฝั่งเซิร์ฟเวอร์ (config/christmas.js)
  - ตั้งค่า (วันเวลา · Feature Flag · ค่า Token): ค่าเริ่มต้นในโค้ด + แถวใน season_settings ที่ผู้ดูแลแก้ได้ (cache 30 วินาที · ล้างทันทีเมื่อแก้)
  - Snowflake Token: ยอดคงเหลือ (CHECK >= 0) + บัญชีแยกประเภท (UNIQUE idem_key) · ทุกการเปลี่ยนยอดอยู่ใน transaction เดียวกับสิ่งที่ได้/จ่าย
  - "วัน" = วันที่ตามเวลาไทยจากนาฬิกาเซิร์ฟเวอร์เท่านั้น
  - userId มาจาก token เท่านั้น (routes/christmas.js) · ราคา/รางวัลอ่านจากเซิร์ฟเวอร์เท่านั้น (ไม่รับตัวเลขจากหน้าเว็บ)
*/
const pool = require('../config/db');
const X = require('../config/christmas');
const { grantExp } = require('../utils/exp');

class XmasError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const TZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
const bkkDay = (t) => TZ_FMT.format(new Date(t));
const dayStart = (day) => Date.parse(`${day}T00:00:00+07:00`);
// ทดสอบบนเครื่องพัฒนาเท่านั้น: XMAS_TEST_OFFSET_DAYS=16 = เลื่อนเวลาของกิจกรรมไปข้างหน้า (ทดสอบ Advent ก่อนถึง ธ.ค. จริง) — production ไม่สนค่านี้
const testOffset = () => (process.env.NODE_ENV !== 'production' && Number(process.env.XMAS_TEST_OFFSET_DAYS) ? Number(process.env.XMAS_TEST_OFFSET_DAYS) * 86400000 : 0);
let nowFn = () => Date.now() + testOffset();
const now = () => nowFn();

/* ---------------- ตั้งค่า (DB + ค่าเริ่มต้น) ---------------- */
let cache = null; let cacheAt = 0;
function merge(row) {
  const d = X.DEFAULTS;
  const iso = (v, def) => (v ? new Date(v).toISOString() : new Date(def).toISOString());
  const flags = { ...d.flags };
  for (const k of X.FLAG_KEYS) if (row && row.flags && typeof row.flags[k] === 'boolean') flags[k] = row.flags[k];
  for (const k of X.P1_FLAGS) flags[k] = false;   // ยังไม่มีฟีเจอร์จริง → บังคับปิด (ไม่มีปุ่มหลอก)
  const tokens = { ...d.tokens };
  if (row && row.tokens) for (const k of Object.keys(tokens)) { const n = Number(row.tokens[k]); if (Number.isInteger(n) && n >= 0 && n <= 1000) tokens[k] = n; }
  return {
    enabled: row ? row.enabled !== false : true,
    startsAt: iso(row && row.starts_at, d.startsAt), endsAt: iso(row && row.ends_at, d.endsAt), claimUntil: iso(row && row.claim_until, d.claimUntil),
    flags, tokens, updatedAt: row ? row.updated_at : null,
  };
}
async function loadSettings(force = false) {
  if (!force && cache && now() - cacheAt < 30000) return cache;
  try {
    const { rows } = await pool.query("SELECT * FROM season_settings WHERE season_key = 'christmas'");
    cache = merge(rows[0]); cacheAt = now();
  } catch (e) {
    if (!cache) cache = merge(null);   // ตารางยังไม่มี (ก่อน migrate) → ค่าเริ่มต้น
  }
  return cache;
}
/** ค่าแบบ sync (config/season.js ใช้ตัดสินธีม) — ไม่มี cache = ค่าเริ่มต้น */
function settingsSync() { if (!cache || now() - cacheAt > 30000) loadSettings().catch(() => {}); return cache || merge(null); }

function statusOf(s, t = now()) {
  if (!s.enabled) return 'disabled';
  if (t < Date.parse(s.startsAt)) return 'scheduled';
  if (t < Date.parse(s.endsAt)) return 'active';
  if (t < Date.parse(s.claimUntil)) return 'claim_only';
  return 'ended';
}
function need(s, flag, { allowClaimOnly = false } = {}) {
  const st = statusOf(s);
  if (st === 'disabled') throw new XmasError('EVENT_DISABLED', 'กิจกรรมคริสต์มาสปิดอยู่ชั่วคราว', 403);
  if (st === 'scheduled') throw new XmasError('EVENT_NOT_STARTED', 'กิจกรรมคริสต์มาสยังไม่เริ่ม', 403);
  if (st === 'ended') throw new XmasError('EVENT_ENDED', 'กิจกรรมคริสต์มาสจบแล้ว — ของที่ได้รับแล้วยังเป็นของคุณถาวร', 403);
  if (st === 'claim_only' && !allowClaimOnly) throw new XmasError('EVENT_ENDED', 'กิจกรรมจบแล้ว — ยังใช้ Token ในร้านได้ถึง 7 ม.ค.', 403);
  if (flag && !s.flags[flag]) throw new XmasError('FEATURE_OFF', 'ส่วนนี้ปิดอยู่ชั่วคราว', 403);
  return st;
}

/* ---------------- Token ledger ---------------- */
/** เปลี่ยนยอด Token (บวก = ได้ · ลบ = จ่าย) ใน transaction ของผู้เรียก — idemKey ซ้ำ = ไม่ทำซ้ำ · ยอดไม่พอ = INSUFFICIENT */
async function moveTokens(client, userId, delta, reason, ref, idemKey) {
  await client.query('INSERT INTO event_token_balances (user_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, X.EVENT_ID]);
  const bal = (await client.query('SELECT balance FROM event_token_balances WHERE user_id = $1 AND event_id = $2 FOR UPDATE', [userId, X.EVENT_ID])).rows[0].balance;
  const dup = await client.query('SELECT balance_after FROM event_token_ledger WHERE user_id = $1 AND event_id = $2 AND idem_key = $3', [userId, X.EVENT_ID, idemKey]);
  if (dup.rows[0]) return { applied: false, balance: bal };
  const after = bal + delta;
  if (after < 0) throw new XmasError('INSUFFICIENT_TOKENS', `Snowflake Token ไม่พอ (มี ${bal} ต้องใช้ ${-delta})`, 409);
  await client.query(`UPDATE event_token_balances SET balance = $3, earned_total = earned_total + GREATEST($4, 0), updated_at = NOW()
    WHERE user_id = $1 AND event_id = $2`, [userId, X.EVENT_ID, after, delta]);
  await client.query(`INSERT INTO event_token_ledger (user_id, event_id, delta, reason, ref, idem_key, balance_after)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, X.EVENT_ID, delta, reason, ref ? String(ref).slice(0, 64) : null, idemKey.slice(0, 96), after]);
  return { applied: true, balance: after };
}
async function balanceOf(userId, db = pool) {
  const r = (await db.query('SELECT balance, earned_total FROM event_token_balances WHERE user_id = $1 AND event_id = $2', [userId, X.EVENT_ID])).rows[0];
  return { balance: r ? r.balance : 0, earned: r ? r.earned_total : 0 };
}

/** ทำงานใน transaction + ล็อกต่อผู้เล่น (คำขอซ้อนจากหลายแท็บรอคิวกัน) */
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
    if (e.code === '23505') throw new XmasError('ALREADY', 'รับไปแล้ว', 409);   // ชนกันพร้อมกัน → ได้ครั้งเดียว
    throw e;
  } finally { client.release(); }
}

/* ---------------- ข้อมูลการเรียน "วันนี้" ---------------- */
async function learningToday(userId, t = now(), db = pool) {
  const day = bkkDay(t); const from = new Date(dayStart(day)); const to = new Date(dayStart(day) + 86400000);
  const { rows } = await db.query(`SELECT skill, COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE correct)::int AS correct
    FROM answer_events WHERE user_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY skill`, [userId, from, to]);
  const ex = await db.query(`SELECT reason, SUM(amount)::int AS n FROM exp_log WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
    AND reason = ANY($4::text[]) GROUP BY reason`, [userId, from, to, ['speaking']]);
  const bySkill = Object.fromEntries(rows.map((r) => [r.skill, r]));
  const total = rows.reduce((a, r) => ({ answered: a.answered + r.answered, correct: a.correct + r.correct }), { answered: 0, correct: 0 });
  return { day, bySkill, total, exp: Object.fromEntries(ex.rows.map((r) => [r.reason, r.n])) };
}

/* ---------------- เควสต์รายวัน ---------------- */
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** เควสต์ของวัน (สุ่มคงที่ตามวันที่ — ทุกคนเห็นชุดเดียวกัน · หมุนทุกวัน) */
function questsFor(day) {
  const pool_ = X.QUEST_POOL.slice();
  const out = [];
  let h = hash(`xmas26:${day}`);
  while (out.length < X.DAILY_QUESTS && pool_.length) { const i = h % pool_.length; out.push(pool_.splice(i, 1)[0]); h = hash(`${h}:${day}`); }
  return out;
}
function progressOf(q, L) {
  if (q.metric === 'correct') return Math.min(q.target, q.skills.reduce((a, s) => a + ((L.bySkill[s] || {}).correct || 0), 0));
  if (q.metric === 'answered') return Math.min(q.target, L.total.answered);
  if (q.metric === 'accuracy') return L.total.answered >= q.min && L.total.correct * 100 >= q.pct * L.total.answered ? 1 : 0;
  if (q.metric === 'exp') return q.reasons.some((r) => (L.exp[r] || 0) > 0) ? 1 : 0;
  return 0;
}
function questDetail(q, L) {
  if (q.metric === 'accuracy') {
    const pct = L.total.answered ? Math.round((L.total.correct * 100) / L.total.answered) : 0;
    return `ตอบแล้ว ${L.total.answered}/${q.min} ข้อ · แม่นยำ ${pct}%`;
  }
  return null;
}

/** รายการร้าน (ชื่อ/ภาพ/ช่อง จากแคตตาล็อกจริง · ราคา Token จาก config เท่านั้น) */
async function shopList(owned, buys, s) {
  const { getCatalog } = require('./avatar/catalog');
  const COS = require('../config/cosmetics');
  const cat = await getCatalog();
  const bought = new Set(buys.map((b) => b.item_id));
  return X.SHOP.map((it) => {
    const own = owned.has(it.id) || bought.has(it.id);
    if (it.kind) {
      const f = COS.BY_ID[it.id] || {};
      return { id: it.id, kind: it.kind, nameTh: f.nameTh || it.id, name: f.nameEn || null, rarity: f.rarity || 'rare', price: it.price, owned: own };
    }
    const c = cat.byId.get ? cat.byId.get(it.id) : cat.byId[it.id];
    if (!c) return null;
    if (!s.flags.christmas_avatar_items) return null;
    return { id: it.id, kind: 'avatar', slot: c.slot, name: c.name, nameTh: c.nameTh, rarity: c.rarity, thumbnailUrl: (c.model && c.model.thumbnailUrl) || c.thumbnailUrl,   // ภาพจากโมเดล 3D จริง
      has3d: !!(c.model && c.model.active !== false), price: it.price, owned: own };
  }).filter(Boolean);
}

/* ---------------- สถานะทั้งหมด (หน้า Event Hub) ---------------- */
async function state(userId) {
  const s = await loadSettings();
  const t = now(); const st = statusOf(s, t);
  const base = { eventId: X.EVENT_ID, status: st, startsAt: s.startsAt, endsAt: s.endsAt, claimUntil: s.claimUntil, flags: s.flags, serverNow: new Date(t).toISOString() };
  if (st === 'disabled' || st === 'scheduled') return base;
  const L = await learningToday(userId, t);
  const day = L.day;
  const [bal, ck, qc, buys, starter, inv, cos] = await Promise.all([
    balanceOf(userId),
    pool.query('SELECT day::text AS day FROM xmas_checkins WHERE user_id = $1 AND event_id = $2 ORDER BY day', [userId, X.EVENT_ID]),
    pool.query('SELECT quest_id FROM xmas_quest_claims WHERE user_id = $1 AND event_id = $2 AND day = $3', [userId, X.EVENT_ID, day]),
    pool.query('SELECT item_id FROM xmas_purchases WHERE user_id = $1 AND event_id = $2', [userId, X.EVENT_ID]),
    pool.query("SELECT 1 FROM event_token_ledger WHERE user_id = $1 AND event_id = $2 AND idem_key = 'starter'", [userId, X.EVENT_ID]),
    pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1', [userId]),
    pool.query('SELECT item_id FROM user_cosmetics WHERE user_id = $1', [userId]),
  ]);
  const owned = new Set([...inv.rows.map((r) => r.item_id), ...cos.rows.map((r) => r.item_id)]);
  const claimedQ = new Set(qc.rows.map((r) => r.quest_id));
  const active = st === 'active';
  const quests = questsFor(day).map((q) => {
    const p = progressOf(q, L);
    return { id: q.id, titleTh: q.titleTh, titleEn: q.titleEn, icon: q.icon, go: q.go, target: q.target, progress: p, done: p >= q.target,
      claimed: claimedQ.has(q.id), canClaim: active && s.flags.christmas_quests && p >= q.target && !claimedQ.has(q.id), tokens: q.tokens, exp: q.exp, detail: questDetail(q, L) };
  });
  const doneN = quests.filter((q) => q.claimed).length;
  const bonus = { ...X.BONUS, target: quests.length, progress: doneN, done: doneN >= quests.length, claimed: claimedQ.has(X.BONUS.id),
    canClaim: active && s.flags.christmas_quests && doneN >= quests.length && !claimedQ.has(X.BONUS.id) };
  const checkedToday = ck.rows.some((r) => r.day === day);
  const shop = s.flags.christmas_shop ? await shopList(owned, buys.rows, s) : [];
  return {
    ...base, day, balance: bal.balance, earned: bal.earned,
    learning: { answered: L.total.answered, correct: L.total.correct },
    checkin: { enabled: s.flags.christmas_checkin, claimedToday: checkedToday, days: ck.rows.length, need: X.CHECKIN_MIN_CORRECT,
      correctToday: L.total.correct, tokens: s.tokens.checkin, exp: X.CHECKIN_EXP,
      canClaim: active && s.flags.christmas_checkin && !checkedToday && L.total.correct >= X.CHECKIN_MIN_CORRECT,
      nextResetAt: new Date(dayStart(day) + 86400000).toISOString() },
    quests: s.flags.christmas_quests ? quests : [], bonus: s.flags.christmas_quests ? bonus : null,
    starter: { enabled: s.flags.christmas_rewards, claimed: !!starter.rows[0], tokens: s.tokens.starter, frame: X.STARTER.frame,
      canClaim: (active || st === 'claim_only') && s.flags.christmas_rewards && !starter.rows[0] },
    shop,
  };
}

/* ---------------- การกระทำ ---------------- */
async function checkin(userId) {
  const s = await loadSettings();
  need(s, 'christmas_checkin');
  return tx(userId, async (c) => {
    const L = await learningToday(userId, now(), c);
    if (L.total.correct < X.CHECKIN_MIN_CORRECT) {
      throw new XmasError('LEARN_FIRST', `ตอบให้ถูกอีก ${X.CHECKIN_MIN_CORRECT - L.total.correct} ข้อวันนี้ แล้วกลับมาเปิดของขวัญนะ`, 409);
    }
    const ins = await c.query(`INSERT INTO xmas_checkins (user_id, event_id, day, tokens, exp, correct_at) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING RETURNING day`, [userId, X.EVENT_ID, L.day, s.tokens.checkin, X.CHECKIN_EXP, L.total.correct]);
    if (!ins.rows[0]) throw new XmasError('ALREADY', 'วันนี้เปิดของขวัญไปแล้ว — พรุ่งนี้มาใหม่นะ', 409);
    const tk = await moveTokens(c, userId, s.tokens.checkin, 'checkin', L.day, `checkin:${L.day}`);
    const exp = await grantExp(userId, X.CHECKIN_EXP, { reason: 'xmas_checkin', db: c });
    return { tokens: s.tokens.checkin, exp: exp.gained, balance: tk.balance, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp, day: L.day };
  });
}

async function claimQuest(userId, questId) {
  const s = await loadSettings();
  need(s, 'christmas_quests');
  const id = String(questId || '');
  return tx(userId, async (c) => {
    const L = await learningToday(userId, now(), c);
    const todays = questsFor(L.day);
    let q = todays.find((x) => x.id === id);
    if (id === X.BONUS.id) {
      const got = await c.query('SELECT quest_id FROM xmas_quest_claims WHERE user_id = $1 AND event_id = $2 AND day = $3', [userId, X.EVENT_ID, L.day]);
      const ids = new Set(got.rows.map((r) => r.quest_id));
      if (!todays.every((x) => ids.has(x.id))) throw new XmasError('NOT_DONE', 'ต้องรับรางวัลเควสต์วันนี้ให้ครบทั้ง 3 ข้อก่อน', 409);
      q = X.BONUS;
    } else {
      if (!q) throw new XmasError('NOT_TODAY', 'เควสต์นี้ไม่ใช่ของวันนี้ (เควสต์เปลี่ยนทุกเที่ยงคืนตามเวลาไทย)', 409);
      if (progressOf(q, L) < q.target) throw new XmasError('NOT_DONE', 'ยังทำเควสต์นี้ไม่ครบ — ไปฝึกต่ออีกนิดนะ', 409);
    }
    const ins = await c.query(`INSERT INTO xmas_quest_claims (user_id, event_id, day, quest_id, tokens, exp) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING RETURNING quest_id`, [userId, X.EVENT_ID, L.day, q.id, q.tokens, q.exp]);
    if (!ins.rows[0]) throw new XmasError('ALREADY', 'รับรางวัลเควสต์นี้ไปแล้ว', 409);
    const tk = await moveTokens(c, userId, q.tokens, 'quest', q.id, `quest:${L.day}:${q.id}`);
    const exp = await grantExp(userId, q.exp, { reason: 'xmas_quest', db: c });
    return { questId: q.id, tokens: q.tokens, exp: exp.gained, balance: tk.balance, levelInfo: exp.levelInfo, leveledUp: exp.leveledUp };
  });
}

async function claimStarter(userId) {
  const s = await loadSettings();
  need(s, 'christmas_rewards', { allowClaimOnly: true });
  return tx(userId, async (c) => {
    const tk = await moveTokens(c, userId, s.tokens.starter, 'starter', null, 'starter');
    if (!tk.applied) throw new XmasError('ALREADY', 'รับของขวัญต้อนรับไปแล้ว', 409);
    await c.query("INSERT INTO user_cosmetics (user_id, item_id, via) VALUES ($1, $2, 'event') ON CONFLICT DO NOTHING", [userId, X.STARTER.frame]);
    return { tokens: s.tokens.starter, frame: X.STARTER.frame, balance: tk.balance };
  });
}

async function buy(userId, itemId) {
  const s = await loadSettings();
  need(s, 'christmas_shop', { allowClaimOnly: true });
  const it = X.SHOP.find((x) => x.id === String(itemId || ''));
  if (!it) throw new XmasError('NOT_FOUND', 'ไม่พบของชิ้นนี้ในร้านคริสต์มาส', 404);
  if (!it.kind && !s.flags.christmas_avatar_items) throw new XmasError('FEATURE_OFF', 'ชุด Avatar คริสต์มาสปิดอยู่ชั่วคราว', 403);
  return tx(userId, async (c) => {
    const has = it.kind
      ? await c.query('SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND item_id = $2', [userId, it.id])
      : await c.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [userId, it.id]);
    if (has.rows[0]) throw new XmasError('OWNED', 'คุณมีชิ้นนี้แล้ว', 409);
    const ins = await c.query('INSERT INTO xmas_purchases (user_id, event_id, item_id, price) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING item_id',
      [userId, X.EVENT_ID, it.id, it.price]);
    if (!ins.rows[0]) throw new XmasError('OWNED', 'คุณมีชิ้นนี้แล้ว', 409);
    const tk = await moveTokens(c, userId, -it.price, 'shop', it.id, `shop:${it.id}`);
    if (it.kind) await c.query("INSERT INTO user_cosmetics (user_id, item_id, via, price_paid) VALUES ($1, $2, 'event', 0)", [userId, it.id]);
    else await c.query("INSERT INTO user_inventory (user_id, item_id, acquisition_type, price_paid) VALUES ($1, $2, 'event', 0)", [userId, it.id]);
    return { itemId: it.id, price: it.price, balance: tk.balance, kind: it.kind || 'avatar' };
  });
}

/* ---------------- ผู้ดูแล ---------------- */
async function adminGet() {
  const s = await loadSettings(true);
  const stats = (await pool.query(`SELECT
      (SELECT COUNT(DISTINCT user_id)::int FROM xmas_checkins WHERE event_id = $1) AS players,
      (SELECT COUNT(*)::int FROM xmas_checkins WHERE event_id = $1) AS checkins,
      (SELECT COUNT(*)::int FROM xmas_quest_claims WHERE event_id = $1) AS quest_claims,
      (SELECT COUNT(*)::int FROM xmas_purchases WHERE event_id = $1) AS purchases,
      (SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int FROM event_token_ledger WHERE event_id = $1) AS minted,
      (SELECT COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0)::int FROM event_token_ledger WHERE event_id = $1) AS spent`, [X.EVENT_ID])).rows[0];
  return { settings: s, status: statusOf(s), p1Flags: X.P1_FLAGS, reviewGated: X.REVIEW_GATED, flagKeys: X.FLAG_KEYS, stats, story: await require('./christmasPlay').adminStory() };
}
async function adminUpdate(adminId, body = {}) {
  const cur = await loadSettings(true);
  const next = { enabled: cur.enabled, startsAt: cur.startsAt, endsAt: cur.endsAt, claimUntil: cur.claimUntil, flags: { ...cur.flags }, tokens: { ...cur.tokens } };
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  for (const k of ['startsAt', 'endsAt', 'claimUntil']) {
    if (body[k] === undefined) continue;
    const v = Date.parse(body[k]);
    if (Number.isNaN(v)) throw new XmasError('BAD_DATE', `วันที่ ${k} ไม่ถูกต้อง`, 400);
    next[k] = new Date(v).toISOString();
  }
  if (!(Date.parse(next.startsAt) < Date.parse(next.endsAt))) throw new XmasError('BAD_RANGE', 'วันเริ่มต้องก่อนวันจบ', 400);
  if (Date.parse(next.claimUntil) < Date.parse(next.endsAt)) throw new XmasError('BAD_RANGE', 'วันสุดท้ายของการรับรางวัลต้องไม่ก่อนวันจบ', 400);
  if (body.flags && typeof body.flags === 'object') {
    for (const [k, v] of Object.entries(body.flags)) {
      if (!X.FLAG_KEYS.includes(k) || typeof v !== 'boolean') continue;
      if (X.P1_FLAGS.includes(k) && v) throw new XmasError('NOT_READY', `${k} ยังไม่มีฟีเจอร์จริง — เปิดไม่ได้`, 400);
      if (X.REVIEW_GATED.includes(k) && v && !(await require('./christmasPlay').storyApproved()).all) {
        throw new XmasError('NOT_REVIEWED', 'เนื้อเรื่องยังไม่ผ่านการตรวจของผู้ดูแลครบทุกตอน — อนุมัติก่อนจึงเปิดได้', 400);
      }
      next.flags[k] = v;
    }
  }
  if (body.tokens && typeof body.tokens === 'object') {
    for (const k of Object.keys(next.tokens)) {
      if (body.tokens[k] === undefined) continue;
      const n = Number(body.tokens[k]);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new XmasError('BAD_TOKENS', `ค่า Token ${k} ต้องเป็นจำนวนเต็ม 0–1000`, 400);
      next.tokens[k] = n;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO season_settings (season_key, enabled, starts_at, ends_at, claim_until, flags, tokens, updated_by, updated_at)
      VALUES ('christmas', $1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (season_key) DO UPDATE SET enabled = $1, starts_at = $2, ends_at = $3, claim_until = $4, flags = $5, tokens = $6, updated_by = $7, updated_at = NOW()`,
    [next.enabled, next.startsAt, next.endsAt, next.claimUntil, JSON.stringify(next.flags), JSON.stringify(next.tokens), adminId]);
    await client.query('INSERT INTO season_settings_log (season_key, admin_id, before, after) VALUES ($1, $2, $3, $4)',
      ['christmas', adminId, JSON.stringify(cur), JSON.stringify(next)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  cache = null;
  return adminGet();
}

module.exports = {
  XmasError, loadSettings, settingsSync, statusOf, state, checkin, claimQuest, claimStarter, buy, adminGet, adminUpdate,
  questsFor, bkkDay, moveTokens, _now: () => now(), _setNow: (fn) => { nowFn = fn || (() => Date.now() + testOffset()); cache = null; }, _clearCache: () => { cache = null; },
};
