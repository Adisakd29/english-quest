/*
  Event Carousel — v1.17.0
  รวม "กิจกรรมจริง" ทุกแหล่งเป็นรายการเดียวสำหรับแบนเนอร์หน้าแรก (ไม่สร้างระบบกิจกรรมซ้ำ):
    1) กิจกรรมใน config/events.js (ผจญภัย / เทศกาล) — วันที่/ภารกิจ/รางวัลมาจากระบบเดิม · รับรางวัลในหน้ากิจกรรมเดิม
    2) Ranked Season ที่เปิดอยู่ (ตาราง ranked_seasons)
    3) ภารกิจประจำวัน (เป้าหมายรายวัน + Coin DAILY_GOAL ของระบบ Coin เดิม)
    4) กิจกรรมที่ผู้ดูแลสร้าง (events.source = 'admin') — เงื่อนไขนับจากข้อมูลจริงในช่วงกิจกรรม · รับรางวัลผ่าน claim() ครั้งเดียวต่อคน
  ทุกแถวอยู่ในตาราง events (คอลัมน์แสดงผลจาก migration 072) → ผู้ดูแลตั้งลำดับ/Featured/ซ่อน/แบนเนอร์ได้ทุกแหล่ง
  สถานะ: upcoming | ongoing | completed (ผู้ใช้ทำครบ/รับครบแล้ว) | expired — คิดจากเวลาเซิร์ฟเวอร์เสมอ · expired ไม่แสดงในแบนเนอร์
*/
const pool = require('../config/db');
const ev = require('./events');
const coins = require('./coins');
const { grantExp } = require('../utils/exp');
const { EVENT_BY_ID, PREMIUM_THEMES } = require('../config/events');
const { RULES, DAILY_GOAL_ANSWERS } = require('../config/coinRewards');
const C = require('../config/eventCarousel');

class CarouselError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
let nowFn = () => Date.now();
const now = () => nowFn();
/** ชุดทดสอบเท่านั้น */
function _setNow(fn) { nowFn = fn || (() => Date.now()); }

const RANKED_ID = 'ranked-season';
const DAILY_ID = 'daily-quest';
const DAY = 86400000;
const BKK = 7 * 3600000;
/** วันเริ่ม (00:00 เวลาไทย) ของเวลา t เป็น ms UTC */
const bkkDayStart = (t) => Math.floor((t + BKK) / DAY) * DAY - BKK;
const bkkDate = (t) => new Date(t + BKK).toISOString().slice(0, 10);

function statusAt(start, end, t = now()) {
  if (t < start) return 'upcoming';
  if (t >= end) return 'expired';
  return 'ongoing';
}
const artUrls = (art) => ({ desktop: `/assets/events/banners/${art}-1280.webp`, mobile: `/assets/events/banners/${art}-640.webp`, art });

/* ---------- แถวระบบที่ไม่ได้อยู่ใน config/events.js ---------- */
async function ensureRows() {
  await ev.syncEvents();
  const t = now();
  const season = (await pool.query('SELECT id, slug, name, theme, starts_at, ends_at FROM ranked_seasons WHERE is_active LIMIT 1')).rows[0];
  if (season) {
    const end = season.ends_at || new Date(new Date(season.starts_at).getTime() + 90 * DAY);
    await pool.query(
      `INSERT INTO events (id, name, starts_at, ends_at, source, event_type) VALUES ($1, $2, $3, $4, 'system', 'ranked')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updated_at = NOW()
       WHERE events.name IS DISTINCT FROM EXCLUDED.name OR events.starts_at IS DISTINCT FROM EXCLUDED.starts_at OR events.ends_at IS DISTINCT FROM EXCLUDED.ends_at`,
      [RANKED_ID, `${season.name}${season.theme ? ` · ${season.theme}` : ''}`.slice(0, 120), season.starts_at, end]);
  }
  // ภารกิจประจำวัน: ช่วงเวลาในตารางเป็นแค่ค่าอ้างอิง — สถานะคิดจาก "วันนี้ตามเวลาไทย" ทุกครั้ง
  await pool.query(
    `INSERT INTO events (id, name, starts_at, ends_at, source, event_type) VALUES ($1, 'Daily Learning Quest', $2, $3, 'system', 'daily')
     ON CONFLICT (id) DO NOTHING`, [DAILY_ID, new Date(bkkDayStart(t)), new Date(bkkDayStart(t) + 3650 * DAY)]);
  return season || null;
}

/* ---------- รายการของรางวัล (ชื่อ/รูปจากแคตตาล็อกจริง) ---------- */
async function itemInfo(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return [];
  const { rows } = await pool.query('SELECT id, name, name_th, rarity, thumbnail_url FROM avatar_items WHERE id = ANY($1)', [uniq]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  return uniq.filter((id) => by[id]).map((id) => ({ id, name: by[id].name_th || by[id].name, rarity: by[id].rarity, thumb: by[id].thumbnail_url || null }));
}

const DEFAULT_DESC = {
  adventure: 'ตะลุยด่านคำศัพท์และแกรมม่าทีละบท ปลดล็อกบทใหม่ และรับรางวัลประจำบท',
  festival: 'เข้าเรียนทุกวันรับของรายวัน ทำเควสต์การเรียนครบรับรางวัลพิเศษของเทศกาล',
  ranked: 'แข่งคำศัพท์และแกรมม่ากับผู้เล่นจริง ไต่แรงค์ตลอดซีซัน — เลื่อนแรงค์ครั้งแรกได้ Coin',
  daily: `ตอบคำถามให้ครบ ${DAILY_GOAL_ANSWERS} ข้อวันนี้ รับ Coin เป้าหมายรายวัน · ทำครบ 5 วันในสัปดาห์รับโบนัสเพิ่ม`,
};

/* ---------- แปลงแถว → สไลด์ (ยังไม่รวมข้อมูลรายผู้ใช้) ---------- */
function baseOf(row, season) {
  const cfg = EVENT_BY_ID[row.id];
  const id = row.id;
  let type = row.event_type; let start; let end; let titleEn = row.name; let route = row.route; let art; let retired = false; let defaultTitle = row.name;
  if (cfg) {
    type = type || (cfg.kind === 'festival' ? 'festival' : 'adventure');
    start = new Date(cfg.startsAt).getTime(); end = new Date(cfg.endsAt).getTime();
    titleEn = cfg.name; defaultTitle = cfg.nameTh || cfg.name; retired = Boolean(cfg.retired);
    route = cfg.kind === 'festival' ? 'festival' : 'event';   // กิจกรรมระบบเปิดหน้าของมันเองเสมอ
    art = /loykrathong/.test(id) ? 'loykrathong' : /halloween/.test(id) ? 'halloween' : C.TYPES[type].art;
  } else if (id === RANKED_ID) {
    type = 'ranked'; start = new Date(row.starts_at).getTime(); end = new Date(row.ends_at).getTime(); route = 'ranked';
    defaultTitle = `Ranked ${row.name}`; titleEn = season ? season.theme || season.name : row.name; art = 'ranked';
  } else if (id === DAILY_ID) {
    type = 'daily'; start = bkkDayStart(now()); end = start + DAY; route = 'learn'; defaultTitle = 'ภารกิจเรียนประจำวัน'; titleEn = 'Daily Learning Quest'; art = 'daily';
  } else {
    type = C.TYPES[type] ? type : 'vocab';
    start = new Date(row.starts_at).getTime(); end = new Date(row.ends_at).getTime();
    route = C.ROUTES.includes(row.route) ? row.route : C.TYPES[type].route; art = C.TYPES[type].art;
  }
  const builtin = artUrls(art);
  return {
    id, source: row.source === 'admin' ? 'admin' : 'system', kind: cfg ? (cfg.kind || 'adventure') : (id === RANKED_ID ? 'ranked' : id === DAILY_ID ? 'daily' : 'admin'),
    type, typeLabel: C.TYPES[type] ? C.TYPES[type].th : type,
    title: row.title_th || defaultTitle, titleEn, description: row.description || DEFAULT_DESC[type] || '',
    start, end, retired, route,
    banner: { desktop: row.banner_desktop || builtin.desktop, mobile: row.banner_mobile || row.banner_desktop || builtin.mobile, art, fallback: builtin.desktop },
    priority: row.priority || 0, featured: Boolean(row.is_featured), visibility: row.visibility === 'hidden' ? 'hidden' : 'published',
    reward: row.reward || {}, eligibility: row.eligibility || {}, cfg,
  };
}

/* ---------- ข้อมูลรายผู้ใช้: รางวัล · ความคืบหน้า · ปุ่ม ---------- */
async function eligibilityProgress(b, userId) {
  const el = b.eligibility || {};
  const from = new Date(b.start); const to = new Date(Math.min(b.end, now()));
  if (el.type === 'correct_answers') {
    const skill = ['vocab', 'grammar'].includes(el.skill) ? el.skill : null;
    return (await pool.query(`SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND correct AND created_at >= $2 AND created_at < $3 ${skill ? 'AND skill = $4' : ''}`,
      skill ? [userId, from, to, skill] : [userId, from, to])).rows[0].n;
  }
  if (el.type === 'ranked_matches') {
    return (await pool.query(`SELECT COUNT(DISTINCT m.id)::int AS n FROM ranked_matches m LEFT JOIN ranked_match_players p ON p.match_id = m.id
      WHERE (m.user_id = $1 OR p.user_id = $1) AND m.status = 'finished' AND m.finished_at >= $2 AND m.finished_at < $3`, [userId, from, to])).rows[0].n;
  }
  if (el.type === 'daily_goals') {
    return (await pool.query("SELECT COUNT(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND type = 'DAILY_GOAL' AND created_at >= $2 AND created_at < $3",
      [userId, from, to])).rows[0].n;
  }
  return null;
}

async function personalize(b, userId, ctx) {
  const t = now();
  let status = statusAt(b.start, b.end, t);
  const out = { rewards: { coins: 0, exp: 0, items: [], badge: null, theme: null, note: null }, progress: null, cta: null, claimed: false };
  const R = out.rewards;
  if (b.kind === 'adventure' && b.cfg) {
    const chapters = (b.cfg.chapters || []).filter((c) => c.reward);
    R.coins = chapters.reduce((a, c) => a + (c.reward.coins || 0), 0);
    R.items = await itemInfo(chapters.flatMap((c) => c.reward.items || []));
    R.badge = (chapters.find((c) => c.reward.badge) || {}).reward ? chapters.find((c) => c.reward.badge).reward.badge : null;
    if (b.cfg.reward && b.cfg.reward.type === 'theme') R.theme = b.cfg.reward.name;
    const claimedN = chapters.length ? (await pool.query("SELECT COUNT(*)::int AS n FROM event_quest_claims WHERE event_id = $1 AND user_id = $2 AND quest_id LIKE 'chapter:%'", [b.id, userId])).rows[0].n
      : (await pool.query('SELECT COUNT(*)::int AS n FROM event_reward_claims WHERE event_id = $1 AND user_id = $2', [b.id, userId])).rows[0].n;
    const total = chapters.length || 1;
    out.progress = { value: claimedN, target: total, label: chapters.length ? `รับรางวัลแล้ว ${claimedN}/${total} บท` : null };
    if (status === 'ongoing' && claimedN >= total) status = 'completed';
    out.cta = status === 'upcoming' ? { kind: 'details', label: 'ดูรายละเอียด' }
      : status === 'completed' ? { kind: 'nav', label: 'ดูรางวัล', nav: b.route }
        : { kind: 'nav', label: claimedN ? 'เล่นต่อ' : 'เข้าร่วมกิจกรรม', nav: b.route };
  } else if (b.kind === 'festival' && b.cfg) {
    const login = b.cfg.login || []; const quests = b.cfg.quests || [];
    R.coins = quests.reduce((a, q) => a + ((q.reward && q.reward.coins) || 0), 0);
    R.items = await itemInfo([...login.flatMap((d) => d.items || []), ...quests.flatMap((q) => (q.reward && q.reward.items) || [])]);
    const th = quests.find((q) => q.reward && q.reward.theme);
    R.theme = th && PREMIUM_THEMES[th.reward.theme] ? `ธีม${PREMIUM_THEMES[th.reward.theme].name}` : null;
    R.badge = (quests.find((q) => q.reward && q.reward.badge) || { reward: {} }).reward.badge || null;
    const [days, today, champ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM event_login_claims WHERE event_id = $1 AND user_id = $2', [b.id, userId]),
      pool.query('SELECT 1 FROM event_login_claims WHERE event_id = $1 AND user_id = $2 AND claim_date = $3::date', [b.id, userId, bkkDate(t)]),
      pool.query("SELECT 1 FROM event_quest_claims WHERE event_id = $1 AND user_id = $2 AND quest_id = 'champion'", [b.id, userId]),
    ]);
    out.progress = { value: days.rows[0].n, target: login.length || 1, label: `ของรายวัน ${days.rows[0].n}/${login.length}` };
    if (status === 'ongoing' && champ.rows[0] && days.rows[0].n >= login.length) status = 'completed';
    out.cta = status === 'upcoming' ? { kind: 'details', label: 'ดูรายละเอียด' }
      : status === 'completed' ? { kind: 'nav', label: 'ดูรางวัล', nav: 'festival' }
        : (!today.rows[0] && days.rows[0].n < login.length) ? { kind: 'nav', label: 'รับรางวัลวันนี้', nav: 'festival' }
          : { kind: 'nav', label: 'เข้าร่วมกิจกรรม', nav: 'festival' };
  } else if (b.kind === 'ranked') {
    R.coins = RULES.RANK_PROMOTION.amount; R.note = 'ต่อการเลื่อนแรงค์ครั้งแรกแต่ละขั้น';
    if (PREMIUM_THEMES.astronomy) R.theme = `ธีม${PREMIUM_THEMES.astronomy.name} (แรงค์สูงสุด)`;
    out.progress = ctx.rankLabel ? { value: null, target: null, label: `แรงค์ของคุณ: ${ctx.rankLabel}` } : null;
    out.cta = status === 'upcoming' ? { kind: 'details', label: 'ดูรายละเอียด' } : { kind: 'nav', label: 'เริ่มแข่ง', nav: 'ranked' };
  } else if (b.kind === 'daily') {
    R.coins = RULES.DAILY_GOAL.amount; R.note = `+${RULES.WEEKLY_GOAL.amount} Coin เมื่อทำครบ 5 วันในสัปดาห์`;
    const [ans, got] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND created_at >= $2', [userId, new Date(b.start)]),
      pool.query("SELECT 1 FROM coin_transactions WHERE user_id = $1 AND source_key = $2", [userId, `goal:${bkkDate(t)}`]),
    ]);
    const n = Math.min(ans.rows[0].n, DAILY_GOAL_ANSWERS);
    out.progress = { value: n, target: DAILY_GOAL_ANSWERS, label: `วันนี้ ${n}/${DAILY_GOAL_ANSWERS} ข้อ` };
    if (got.rows[0]) { status = 'completed'; out.claimed = true; }
    out.cta = status === 'completed' ? { kind: 'nav', label: 'เรียนต่อ', nav: 'learn' } : { kind: 'nav', label: 'เริ่มภารกิจ', nav: 'learn' };
  } else {
    // กิจกรรมที่ผู้ดูแลสร้าง
    R.coins = Number(b.reward.coins) || 0; R.exp = Number(b.reward.exp) || 0;
    R.items = await itemInfo(Array.isArray(b.reward.items) ? b.reward.items : []);
    const el = b.eligibility || {}; const hasReward = (R.coins || R.exp || R.items.length) && el.type && el.type !== 'none';
    const claimed = Boolean((await pool.query('SELECT 1 FROM event_reward_claims WHERE event_id = $1 AND user_id = $2', [b.id, userId])).rows[0]);
    out.claimed = claimed;
    if (hasReward) {
      const value = status === 'upcoming' ? 0 : await eligibilityProgress(b, userId);
      const E = C.ELIGIBILITY[el.type] || {};
      const skillTh = el.skill === 'vocab' ? ' (คำศัพท์)' : el.skill === 'grammar' ? ' (แกรมม่า)' : '';
      out.progress = { value: Math.min(value, el.target), target: el.target, label: `${E.th || ''}${skillTh} ${Math.min(value, el.target)}/${el.target} ${E.unit || ''}`.trim() };
      if (claimed && status === 'ongoing') status = 'completed';
      const canClaim = status === 'ongoing' && !claimed && value >= el.target;
      out.canClaim = canClaim;
      out.cta = status === 'upcoming' ? { kind: 'details', label: 'ดูรายละเอียด' }
        : canClaim ? { kind: 'claim', label: 'รับรางวัล' }
          : status === 'completed' ? { kind: 'details', label: 'ดูรางวัล' }
            : { kind: 'nav', label: 'เริ่มชาเลนจ์', nav: b.route };
    } else {
      out.cta = status === 'upcoming' ? { kind: 'details', label: 'ดูรายละเอียด' } : { kind: 'nav', label: 'ไปที่กิจกรรม', nav: b.route };
    }
  }
  return { ...out, status };
}

const GROUP = (s) => (s.featured ? 0 : s.status === 'ongoing' && s.type !== 'daily' ? 1 : s.status === 'upcoming' ? 2 : s.type === 'daily' && s.status === 'ongoing' ? 3 : 4);
function sortSlides(list) {
  return list.sort((a, b) => GROUP(a) - GROUP(b) || b.priority - a.priority || a.start - b.start || (a.id < b.id ? -1 : 1));
}

function publicSlide(b, p) {
  const fmt = (ms) => new Date(ms).toISOString();
  return {
    id: b.id, source: b.source, type: b.type, typeLabel: b.typeLabel, title: b.title, titleEn: b.titleEn, description: b.description,
    status: p.status, startsAt: fmt(b.start), endsAt: fmt(b.end), timezone: C.TIMEZONE, featured: b.featured, priority: b.priority,
    banner: b.banner, rewards: p.rewards, progress: p.progress, cta: p.cta, claimed: p.claimed, canClaim: Boolean(p.canClaim),
  };
}

/** แบนเนอร์สำหรับผู้ใช้: ไม่รวม hidden / หมดเวลา / กิจกรรมที่เลิกแสดง */
async function listForUser(userId, ctx = {}) {
  const season = await ensureRows();
  const { rows } = await pool.query('SELECT * FROM events');
  const out = [];
  for (const row of rows) {
    if (row.id === RANKED_ID && !season) continue;
    const b = baseOf(row, season);
    if (b.visibility !== 'published' || b.retired) continue;
    if (statusAt(b.start, b.end) === 'expired') continue;
    const p = await personalize(b, userId, ctx);
    out.push({ ...publicSlide(b, p), _s: { featured: b.featured, status: p.status, type: b.type, priority: b.priority, start: b.start, id: b.id } });
  }
  return sortSlides(out.map((s) => ({ ...s, ...s._s }))).map(({ _s, start, ...s }) => ({ ...s }));
}

/* ---------- รับรางวัล (กิจกรรมที่ผู้ดูแลสร้าง) — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ · ครั้งเดียวต่อคน · บันทึกทุกรายการ ---------- */
async function claim(userId, id) {
  await ensureRows();
  const row = (await pool.query("SELECT * FROM events WHERE id = $1 AND source = 'admin'", [String(id).slice(0, 48)])).rows[0];
  if (!row) throw new CarouselError('NOT_FOUND', 'กิจกรรมนี้ไม่มีรางวัลให้รับที่นี่', 404);
  const b = baseOf(row, null);
  if (b.visibility !== 'published') throw new CarouselError('NOT_FOUND', 'ไม่พบกิจกรรมนี้', 404);
  const status = statusAt(b.start, b.end);
  if (status === 'upcoming') throw new CarouselError('EVENT_NOT_STARTED', 'กิจกรรมยังไม่เริ่ม', 403);
  if (status === 'expired') throw new CarouselError('EVENT_ENDED', 'กิจกรรมนี้หมดเวลาแล้ว รับรางวัลเพิ่มไม่ได้', 403);
  const el = b.eligibility || {};
  const reward = { coins: Number(b.reward.coins) || 0, exp: Number(b.reward.exp) || 0, items: Array.isArray(b.reward.items) ? b.reward.items : [] };
  if (!el.type || el.type === 'none' || !(reward.coins || reward.exp || reward.items.length)) throw new CarouselError('NO_REWARD', 'กิจกรรมนี้ไม่มีรางวัล', 400);
  if ((await pool.query('SELECT 1 FROM event_reward_claims WHERE event_id = $1 AND user_id = $2', [b.id, userId])).rows[0]) {
    throw new CarouselError('ALREADY_CLAIMED', 'รับรางวัลกิจกรรมนี้แล้ว', 409);
  }
  const value = await eligibilityProgress(b, userId);
  if (value < el.target) throw new CarouselError('NOT_ELIGIBLE', `ยังไม่ครบเงื่อนไข (${value}/${el.target})`, 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query("INSERT INTO event_reward_claims (event_id, user_id, reward_id) VALUES ($1, $2, 'carousel') ON CONFLICT DO NOTHING RETURNING claimed_at", [b.id, userId]);
    if (!ins.rowCount) throw new CarouselError('ALREADY_CLAIMED', 'รับรางวัลกิจกรรมนี้แล้ว', 409);
    let coin = { granted: false, amount: 0, balance: null };
    if (reward.coins > 0) {
      coin = await coins.grant(userId, { type: 'EVENT_QUEST', key: `evr:${b.id}`, amount: reward.coins, sourceId: b.id, description: `กิจกรรม: ${b.title}`.slice(0, 120) }, { db: client });
    }
    let exp = null;
    if (reward.exp > 0) exp = await grantExp(userId, reward.exp, { reason: `event:${b.id}`.slice(0, 40), db: client });
    const added = [];
    for (const itemId of reward.items) {
      const r = await client.query("INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ($1, $2, 'event_quest') ON CONFLICT DO NOTHING RETURNING item_id", [userId, itemId]);
      if (r.rowCount) added.push(itemId);
    }
    await client.query('COMMIT');
    return { claimed: true, id: b.id, coins: coin.granted ? coin.amount : 0, balance: coin.balance, exp: exp ? exp.gained : 0, levelInfo: exp ? exp.levelInfo : null, items: reward.items, added };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new CarouselError('ALREADY_CLAIMED', 'รับรางวัลกิจกรรมนี้แล้ว', 409);
    throw err;
  } finally { client.release(); }
}

/* =====================================================================
   ผู้ดูแล
   ===================================================================== */
async function adminList() {
  const season = await ensureRows();
  const { rows } = await pool.query(`SELECT e.*, (SELECT COUNT(*)::int FROM event_reward_claims c WHERE c.event_id = e.id) AS claims FROM events e`);
  const t = now();
  return sortSlides(rows.filter((r) => r.id !== RANKED_ID || season).map((row) => {
    const b = baseOf(row, season);
    return {
      id: b.id, source: b.source, kind: b.kind, type: b.type, title: b.title, titleTh: row.title_th || '', titleEn: b.titleEn, description: row.description || '',
      startsAt: new Date(b.start).toISOString(), endsAt: new Date(b.end).toISOString(), status: statusAt(b.start, b.end, t), retired: b.retired,
      priority: b.priority, featured: b.featured, visibility: b.visibility, route: b.route, banner: b.banner,
      bannerDesktop: row.banner_desktop || '', bannerMobile: row.banner_mobile || '',
      reward: row.reward || {}, eligibility: row.eligibility || {}, claims: row.claims, updatedAt: row.updated_at,
      // แก้วันที่/ปลายทาง/รางวัลได้เฉพาะกิจกรรมที่ผู้ดูแลสร้าง (กิจกรรมระบบใช้วันที่/รางวัลจากระบบเดิม)
      editable: b.source === 'admin' ? 'all' : 'display',
      _s: { featured: b.featured, status: statusAt(b.start, b.end, t), type: b.type, priority: b.priority, start: b.start, id: b.id },
    };
  }).map((s) => ({ ...s, ...s._s }))).map(({ _s, start, ...s }) => s);
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function bannerUrl(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\/assets\/events\/banners\/[a-z0-9-]+\.webp$/.test(s) || /^\/api\/avatar\/asset\/u[0-9a-f]{20}\.(png|webp)$/.test(s)) return s;
  throw new CarouselError('BAD_BANNER', 'ลิงก์แบนเนอร์ต้องเป็นภาพในระบบ (อัปโหลด หรือเลือกภาพสำเร็จรูป)');
}

async function validateAdminFields(b, { create, current }) {
  const f = {};
  if (create || b.title !== undefined) { f.title_th = clean(b.title, C.LIMITS.title); if (!f.title_th) throw new CarouselError('BAD_TITLE', 'ต้องมีชื่อกิจกรรม'); }
  if (b.description !== undefined) f.description = clean(b.description, C.LIMITS.description) || null;
  if (b.priority !== undefined) {
    const p = Number(b.priority);
    if (!Number.isInteger(p) || Math.abs(p) > C.LIMITS.priority) throw new CarouselError('BAD_PRIORITY', `ลำดับความสำคัญต้องเป็นจำนวนเต็ม −${C.LIMITS.priority} ถึง ${C.LIMITS.priority}`);
    f.priority = p;
  }
  if (b.featured !== undefined) f.is_featured = Boolean(b.featured);
  if (b.visibility !== undefined) { if (!['published', 'hidden'].includes(b.visibility)) throw new CarouselError('BAD_VIS', 'สถานะการเผยแพร่ไม่ถูกต้อง'); f.visibility = b.visibility; }
  if (b.bannerDesktop !== undefined) f.banner_desktop = bannerUrl(b.bannerDesktop);
  if (b.bannerMobile !== undefined) f.banner_mobile = bannerUrl(b.bannerMobile);
  const isAdminRow = create || (current && current.source === 'admin');
  const sys = ['type', 'startsAt', 'endsAt', 'route', 'reward', 'eligibility'].filter((k) => b[k] !== undefined);
  if (!isAdminRow) {
    if (sys.length) throw new CarouselError('SYSTEM_FIELDS', 'กิจกรรมของระบบแก้ได้เฉพาะการแสดงผล (ชื่อ คำอธิบาย แบนเนอร์ ลำดับ Featured การเผยแพร่) — วันที่และรางวัลมาจากระบบกิจกรรมเดิม', 400);
    return f;
  }
  if (create || b.type !== undefined) { if (!C.TYPES[b.type] || ['adventure', 'festival'].includes(b.type)) throw new CarouselError('BAD_TYPE', 'ประเภทกิจกรรมไม่ถูกต้อง'); f.event_type = b.type; }
  if (create || b.route !== undefined) { if (!C.ROUTES.includes(b.route)) throw new CarouselError('BAD_ROUTE', 'ปลายทางไม่ถูกต้อง'); f.route = b.route; }
  const start = b.startsAt !== undefined ? new Date(b.startsAt) : current ? new Date(current.starts_at) : null;
  const end = b.endsAt !== undefined ? new Date(b.endsAt) : current ? new Date(current.ends_at) : null;
  if (create || b.startsAt !== undefined || b.endsAt !== undefined) {
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new CarouselError('BAD_DATES', 'วันที่เริ่ม/สิ้นสุดไม่ถูกต้อง');
    if (end <= start) throw new CarouselError('BAD_DATES', 'วันสิ้นสุดต้องหลังวันเริ่ม');
    if (end - start > 400 * DAY) throw new CarouselError('BAD_DATES', 'กิจกรรมยาวได้ไม่เกิน 400 วัน');
    f.starts_at = start; f.ends_at = end;
  }
  const claims = current ? (await pool.query('SELECT COUNT(*)::int AS n FROM event_reward_claims WHERE event_id = $1', [current.id])).rows[0].n : 0;
  if ((b.reward !== undefined || b.eligibility !== undefined) && claims > 0) {
    throw new CarouselError('LOCKED', `มีผู้รับรางวัลแล้ว ${claims} คน — แก้รางวัล/เงื่อนไขไม่ได้ (สร้างกิจกรรมใหม่แทน)`, 409);
  }
  if (create || b.reward !== undefined) {
    const r = b.reward || {};
    const coinsN = Number(r.coins || 0); const expN = Number(r.exp || 0);
    if (!Number.isInteger(coinsN) || coinsN < 0 || coinsN > C.LIMITS.coins) throw new CarouselError('BAD_REWARD', `Coin 0–${C.LIMITS.coins}`);
    if (!Number.isInteger(expN) || expN < 0 || expN > C.LIMITS.exp) throw new CarouselError('BAD_REWARD', `EXP 0–${C.LIMITS.exp}`);
    const items = [...new Set((Array.isArray(r.items) ? r.items : []).map((x) => String(x).trim()).filter(Boolean))];
    if (items.length > C.LIMITS.items) throw new CarouselError('BAD_REWARD', `ของรางวัลได้ไม่เกิน ${C.LIMITS.items} ชิ้น`);
    if (items.length) {
      const ok = (await pool.query('SELECT id FROM avatar_items WHERE id = ANY($1) AND is_active', [items])).rows.map((x) => x.id);
      const miss = items.filter((x) => !ok.includes(x));
      if (miss.length) throw new CarouselError('BAD_REWARD', `ไม่พบของในแคตตาล็อก: ${miss.join(', ')}`);
    }
    f.reward = JSON.stringify({ coins: coinsN, exp: expN, items });
  }
  if (create || b.eligibility !== undefined) {
    const e = b.eligibility || { type: 'none' };
    if (!C.ELIGIBILITY[e.type]) throw new CarouselError('BAD_RULE', 'เงื่อนไขไม่ถูกต้อง');
    const out = { type: e.type };
    if (e.type !== 'none') {
      const target = Number(e.target);
      if (!Number.isInteger(target) || target < 1 || target > C.LIMITS.target) throw new CarouselError('BAD_RULE', `เป้าหมาย 1–${C.LIMITS.target}`);
      out.target = target;
      if (e.type === 'correct_answers') out.skill = C.ELIGIBILITY.correct_answers.skills.includes(e.skill) ? e.skill : 'any';
    }
    f.eligibility = JSON.stringify(out);
  }
  return f;
}

async function adminCreate(body, adminId) {
  const f = await validateAdminFields(body || {}, { create: true });
  const id = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cols = ['id', 'name', 'source', 'created_by', ...Object.keys(f)];
  const vals = [id, f.title_th, 'admin', adminId, ...Object.values(f)];
  await pool.query(`INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
  return (await adminList()).find((x) => x.id === id);
}

async function adminUpdate(id, body) {
  await ensureRows();
  const current = (await pool.query('SELECT * FROM events WHERE id = $1', [String(id).slice(0, 48)])).rows[0];
  if (!current) throw new CarouselError('NOT_FOUND', 'ไม่พบกิจกรรม', 404);
  const f = await validateAdminFields(body || {}, { create: false, current });
  if (current.source === 'admin' && f.title_th) f.name = f.title_th;
  const keys = Object.keys(f);
  if (keys.length) {
    await pool.query(`UPDATE events SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [current.id, ...Object.values(f)]);
  }
  return (await adminList()).find((x) => x.id === current.id);
}

module.exports = { listForUser, claim, adminList, adminCreate, adminUpdate, statusAt, CarouselError, _setNow, RANKED_ID, DAILY_ID };
