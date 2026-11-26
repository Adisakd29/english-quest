/*
  v1.27.0 World Raid Boss — บอสตัวเดียวของทั้งเซิร์ฟเวอร์ · ผู้เล่นทุกคนแชร์ HP เดียวกัน (Server-Authoritative)

  สถานะ (State Machine) อยู่ในฐานข้อมูลเสมอ (raid_boss_instances) — รีสตาร์ตเซิร์ฟเวอร์/หลายเครื่องไม่ทำให้บอสย้อนระดับหรือเกิดซ้ำ
    preparing → active → (Phase 1→2→3 · โล่ · มึน) → defeated → settled (สรุปผล/คูลดาวน์) → บอสเลเวลถัดไป (preparing)
    paused = ผู้ดูแลปิด Raid ฉุกเฉิน (ข้อมูลอยู่ครบ เปิดต่อได้)
  - เกิดบอสใหม่: INSERT … ON CONFLICT (level) DO NOTHING + advisory lock → ไม่เกิดซ้ำแม้หลายเครื่องทำพร้อมกัน
  - โจมตี: ดาเมจคำนวณที่เซิร์ฟเวอร์จากคำตอบที่ตรวจแล้วเท่านั้น (หน้าเว็บส่งตัวเลขดาเมจไม่ได้)
      ล็อกแถวรอบโจมตี → ล็อกแถวบอส (ลำดับเดียวกันทุกที่ = ไม่ deadlock) → หัก HP / เปลี่ยน Phase / ตาย ใน transaction เดียว
      HP ถึง 0 ได้ครั้งเดียว (WHERE status = 'active' ภายใต้ row lock) · ตอบข้อเดิมซ้ำไม่ได้ (PK attempt+ข้อ)
  - รางวัล: กดรับภายหลังได้ (ไม่ต้องออนไลน์ตอนบอสตาย) · PK (บอส, ผู้เล่น, ขั้น) กันรับซ้ำ · EXP/Coin/ของ อยู่ใน transaction เดียวกับการรับ
  - กระจายสถานะ: WebSocket (raid:state / raid:hit / raid:announce) รวมเป็นชุดทุก ~300ms · หลายเครื่องผ่าน PostgreSQL NOTIFY (eq_raid)
    WebSocket ใช้ไม่ได้ → หน้าเว็บ Polling GET /api/raid/state
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const realtime = require('../../realtime');
const coins = require('../coins');
const { grantExp } = require('../../utils/exp');
const { getLevelInfo } = require('../../utils/leveling');
const R = require('../../config/raidBosses');
const COS = require('../../config/cosmetics');
const SEASON = require('../../config/season');
const Q = require('./questions');
// ไฟล์โมเดล/ฉาก (บีบอัดแล้ว · ชื่อไฟล์มี hash) จาก scripts/raid/optimize.mjs
let ASSETS = {};
try { ASSETS = require('../../data/raid/assets.json'); } catch (_) { ASSETS = {}; }
const ARENA_FILE = { forest: 'arena-forest', volcano: 'arena-volcano', frost: 'arena-frost', 'frost-xmas': 'arena-frost-xmas', 'shadow-tower': 'arena-shadow-tower',
  celestial: 'arena-celestial', ruins: 'arena-ruins', abyss: 'arena-abyss', 'flame-palace': 'arena-flame-palace', 'void-throne': 'arena-void-throne', ascension: 'arena-ascension' };
function assetsOf(d) {
  const boss = ASSETS[`boss-${d.model}`]; const arena = ASSETS[ARENA_FILE[d.arena] || ''];
  return { boss: boss ? boss.url : null, arena: arena ? arena.url : null, art: `/img/raid/${d.model}.webp`, bossBytes: boss ? boss.bytes : null, arenaBytes: arena ? arena.bytes : null };
}

class RaidError extends Error { constructor(code, message, status = 400, extra = {}) { super(message); this.code = code; this.status = status; this.extra = extra; } }
const LOCK_KEY = 84084;
const INSTANCE = crypto.randomBytes(6).toString('hex');

/* ====================================================================
   ค่าตั้ง (ผู้ดูแลปรับได้) — cache สั้น ๆ
   ==================================================================== */
let settingsCache = null; let settingsAt = 0;
const NUM_KEYS = {
  hpCap: [1000, 1e9], hpFloor: [100, 1e8], hpMultiplier: [0.05, 20], targetHours: [1, 24 * 30], cooldownMin: [0, 24 * 60], prepareSec: [0, 600],
  questionsPerRound: [5, 60], levelBaseHp: [1000, 10000000], levelHpGrowth: [1, 2], levelDefenseStep: [0, 0.1], levelDefenseCap: [0, 0.6], levelHitStep: [0, 0.5], levelHitCap: [1, 5], roundsPerDay: [1, 500], playerHp: [20, 1000], bossHit1: [0, 500], bossHit2: [0, 500], bossHit3: [0, 500], healEvery: [0, 50], healAmount: [0, 500], hitExp: [0, 50], hitExpDailyCap: [0, 5000], wordLevelEvery: [1, 20], wordStretchShare: [0, 1], minAnswerMs: [0, 10000], answerLimitMs: [5000, 120000], roundTtlMin: [5, 120],
  minCorrectForReward: [1, 200], claimDays: [1, 90], rewardMultiplier: [0, 5], ultimateEverySec: [30, 3600],
};
async function getSettings(db = pool, { fresh = false } = {}) {
  if (!fresh && settingsCache && Date.now() - settingsAt < 3000) return settingsCache;
  const r = (await db.query('SELECT data FROM raid_settings WHERE id = 1')).rows[0];
  settingsCache = { ...R.DEFAULT_SETTINGS, ...((r && r.data) || {}) };
  settingsAt = Date.now();
  return settingsCache;
}
/** ตรวจค่าที่ผู้ดูแลส่งมา (ไม่รับคีย์แปลก/ชนิดผิด) */
function sanitizeSettings(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (NUM_KEYS[k]) {
      const n = Number(v); const [lo, hi] = NUM_KEYS[k];
      if (!Number.isFinite(n) || n < lo || n > hi) throw new RaidError('BAD_SETTING', `${k} ต้องอยู่ระหว่าง ${lo}–${hi}`);
      out[k] = n;
    } else if (k === 'enabled' || k === 'playerHpOn') out[k] = Boolean(v);
    else if (k === 'questionMode') { if (!['spell', 'mixed'].includes(v)) throw new RaidError('BAD_SETTING', 'questionMode = spell | mixed'); out[k] = v; }
    else if (k === 'seasonalSkin') { if (!['auto', 'off'].includes(v)) throw new RaidError('BAD_SETTING', 'seasonalSkin = auto | off'); out[k] = v; }
    else if (k === 'forcedFamily') { if (v !== null && v !== '' && !(R.BY_KEY[v] && R.BY_KEY[v].ready)) throw new RaidError('BAD_SETTING', 'ตระกูลบอสนี้ยังไม่พร้อม'); out[k] = v || null; }
    else if (k === 'nextLevel') { const n = v === null || v === '' ? null : Number(v); if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 10000)) throw new RaidError('BAD_SETTING', 'nextLevel ไม่ถูกต้อง'); out[k] = n; }
    else if (k === 'families') {
      const fam = {};
      for (const [fk, fv] of Object.entries(v || {})) {
        if (!R.BY_KEY[fk]) throw new RaidError('BAD_SETTING', `ไม่มีตระกูล ${fk}`);
        const o = {};
        if (fv.baseHp !== undefined) { const n = Number(fv.baseHp); if (!(n >= 100 && n <= 1e8)) throw new RaidError('BAD_SETTING', 'baseHp ไม่ถูกต้อง'); o.baseHp = n; }
        if (fv.defense !== undefined) { const n = Number(fv.defense); if (!(n >= 0 && n <= 0.6)) throw new RaidError('BAD_SETTING', 'defense 0–0.6'); o.defense = n; }
        fam[fk] = o;
      }
      out[k] = fam;
    } else throw new RaidError('BAD_SETTING', `ไม่รู้จักค่า ${k}`);
  }
  if (out.hpFloor !== undefined || out.hpCap !== undefined) {
    const cur = { ...R.DEFAULT_SETTINGS, ...(settingsCache || {}), ...out };
    if (cur.hpFloor > cur.hpCap) throw new RaidError('BAD_SETTING', 'hpFloor ต้องไม่เกิน hpCap');
  }
  return out;
}

/* ====================================================================
   ตระกูล / ผิวเทศกาล / มุมมองสาธารณะ
   ==================================================================== */
function famOf(key, s) {
  const f = R.BY_KEY[key] || R.FAMILIES[0];
  const o = (s && s.families && s.families[key]) || {};
  return { ...f, ...o };
}
/** ผิวเทศกาล: บันทึกถาวรตอนบอสตาย (รางวัลผูกกับผิวที่ล้มจริง) · ระหว่างสู้ = ตามเทศกาลที่เปิดอยู่ */
function skinOf(inst, s) {
  if (inst.skin) return inst.skin;
  if (!s || s.seasonalSkin === 'off') return null;
  const season = SEASON.active();
  const f = R.BY_KEY[inst.family];
  return season && f && f.skins && f.skins[season.key] ? season.key : null;
}
function displayOf(inst, s) {
  const f = famOf(inst.family, s);
  const skin = skinOf(inst, s);
  const sk = skin && f.skins ? f.skins[skin] : null;
  const evo = R.evolutionOf(inst.level || 1);   // v1.27.1 Lv11+ = ร่างวิวัฒน์ของตัวเดิม (บอกตรง ๆ)
  return {
    family: f.key, skin, element: f.element, color: f.color, glow: f.glow,
    nameEn: (sk ? sk.nameEn : f.nameEn) + (evo.stage > 1 ? ` ${evo.roman}` : ''),
    nameTh: (sk ? sk.nameTh : f.nameTh) + (evo.stage > 1 ? ` · ร่างวิวัฒน์ ${evo.roman}` : ''),
    evolution: evo.stage,
    arena: sk ? sk.arena : f.arena, arenaTh: sk ? sk.arenaTh : f.arenaTh,
    model: sk ? sk.model : f.model, fallbackArt: f.fallbackArt || f.key,
    attacks: { ...f.attacks, ...(sk ? sk.attacks : {}) }, shieldTh: f.shieldTh,
  };
}
function withAssets(d) {
  return { ...d, assets: assetsOf(d) };
}
function rewardItemsOf(inst, s) {
  const f = famOf(inst.family, s);
  const skin = skinOf(inst, s);
  const items = [...((f.rewards && f.rewards.defeat) || [])];
  if (skin && f.skins && f.skins[skin] && f.skins[skin].rewards) items.push(...(f.skins[skin].rewards.defeat || []));
  return items;
}
const iso = (d) => (d ? new Date(d).toISOString() : null);
function publicState(inst, s) {
  if (!inst) return null;
  const now = Date.now();
  const d = withAssets(displayOf(inst, s));
  const shieldUp = inst.phase >= 2 && inst.shield_goal > 0 && inst.shield_progress < inst.shield_goal;
  return {
    id: Number(inst.id), level: inst.level, status: inst.status, ...d,
    hp: Number(inst.hp), maxHp: Number(inst.max_hp), phase: inst.phase, phaseTh: R.PHASES[inst.phase - 1].nameTh, phaseEn: R.PHASES[inst.phase - 1].nameEn,
    defense: Number(inst.defense),
    shield: inst.phase >= 2 ? { goal: inst.shield_goal, progress: Math.min(inst.shield_progress, inst.shield_goal), up: shieldUp, brokenAt: iso(inst.shield_broken_at) } : null,
    stunUntil: inst.stun_until && new Date(inst.stun_until).getTime() > now ? iso(inst.stun_until) : null,
    ultimateAt: iso(inst.ultimate_at),
    totalDamage: Number(inst.total_damage), participants: inst.participants, online: presentCount(),   // v1.27.1 online = คนที่อยู่ในหน้า Raid ตอนนี้
    activeAt: iso(inst.active_at), defeatedAt: iso(inst.defeated_at), nextSpawnAt: iso(inst.next_spawn_at),
    rewardTier: R.rewardTier(inst.level), rewards: rewardItemsOf(inst, s).map((it) => ({ id: it.id, kind: it.kind, nameTh: it.nameTh })),
    v: inst.version, serverNow: new Date(now).toISOString(),
  };
}

/* ====================================================================
   บอสปัจจุบัน · คำนวณ HP · เกิดบอสใหม่
   ==================================================================== */
async function current(db = pool, { lock = false } = {}) {
  const r = await db.query(`SELECT * FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`);
  return r.rows[0] || null;
}

/**
 * HP ของบอสใหม่ = ผสม "ค่าพื้นฐานตามเลเวล" กับ "ความเร็วล้มบอสจริงของ 3 ตัวล่าสุด × เวลาเป้าหมาย"
 * - ใช้ดาเมจที่ผู้เล่นทำจริง (ไม่ใช้จำนวนบัญชีที่สมัคร) · มีเพดาน/พื้นจากผู้ดูแล + จำกัด 0.3–3 เท่าของค่าพื้นฐาน
 */
async function computeHp(level, fam, s, db = pool) {
  // v1.27.1 ค่าพื้นฐานตามเลเวล (ไม่ขึ้นกับตระกูล เพราะวนตระกูลทุกเลเวล) · ผู้ดูแลทับรายตระกูลด้วย families[key].baseHp ได้เหมือนเดิม
  const P = R.levelPower(level, s);
  const famBoost = s.families && s.families[fam.key] && s.families[fam.key].baseHp ? s.families[fam.key].baseHp / (R.BY_KEY[fam.key].baseHp || s.families[fam.key].baseHp) : 1;
  const base = Math.round(P.hpBase * famBoost * (s.hpMultiplier || 1));
  const hist = (await db.query(
    `SELECT total_damage, EXTRACT(EPOCH FROM (defeated_at - active_at)) AS secs, participants
       FROM raid_boss_instances WHERE status IN ('defeated', 'settled') AND defeated_at IS NOT NULL ORDER BY level DESC LIMIT 3`)).rows;
  let activity = null;
  if (hist.length) {
    const perHour = hist.map((h) => Number(h.total_damage) / Math.max(0.25, Number(h.secs) / 3600));
    activity = Math.round((perHour.reduce((a, b) => a + b, 0) / perHour.length) * s.targetHours * (s.levelHpGrowth || 1.12));   // v1.27.1 ตัวถัดไปแข็งกว่าตัวก่อน 1 ขั้น
  }
  let hp = activity === null ? base : Math.round(0.4 * base + 0.6 * activity);
  hp = Math.max(Math.round(base * 0.3), Math.min(Math.round(base * 3), hp));
  hp = Math.max(s.hpFloor, Math.min(s.hpCap, hp));
  return { maxHp: hp, scaling: { base, activity, history: hist.length, avgParticipants: hist.length ? Math.round(hist.reduce((a, h) => a + h.participants, 0) / hist.length) : null, targetHours: s.targetHours, cap: s.hpCap, floor: s.hpFloor } };
}

async function spawnLevel(db, level, s, reason) {
  const fam = famOf(R.familyForLevel(level, s.forcedFamily).key, s);
  const { maxHp, scaling } = await computeHp(level, fam, s, db);
  const prep = Math.max(0, s.prepareSec);
  const r = await db.query(
    `INSERT INTO raid_boss_instances (level, family, status, max_hp, hp, defense, scaling, spawned_at, active_at)
     VALUES ($1, $2, $3, $4, $4, $5, $6, NOW(), NOW() + make_interval(secs => $7))
     ON CONFLICT (level) DO NOTHING RETURNING *`,
    [level, fam.key, prep > 0 ? 'preparing' : 'active', maxHp, Math.min(0.6, Math.max(R.levelPower(level, s).defense, (s.families && s.families[fam.key] && s.families[fam.key].defense) || 0)), JSON.stringify({ ...scaling, reason }), prep]);
  return r.rows[0] || null;
}

/* ====================================================================
   Tick — ทุกเครื่องเรียกได้ แต่ทำงานจริงเครื่องเดียวต่อครั้ง (advisory lock)
   ==================================================================== */
async function tick() {
  const s = await getSettings(pool, { fresh: true });
  const client = await pool.connect();
  const events = []; let changed = null;
  try {
    await client.query('BEGIN');
    const got = (await client.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [LOCK_KEY])).rows[0].ok;
    if (!got) { await client.query('COMMIT'); return null; }
    let cur = await current(client, { lock: true });
    const now = Date.now();
    if (!s.enabled) {
      if (cur && ['active', 'preparing'].includes(cur.status)) {
        cur = (await client.query("UPDATE raid_boss_instances SET paused_from = status, status = 'paused', version = version + 1 WHERE id = $1 RETURNING *", [cur.id])).rows[0];
        changed = cur;
      }
    } else if (!cur) {
      const lv = s.nextLevel || 1;
      cur = await spawnLevel(client, lv, s, 'first');
      if (cur) { changed = cur; events.push(['spawn', cur]); }
      if (s.nextLevel) await clearNextLevel(client);
    } else if (cur.status === 'paused') {
      cur = (await client.query("UPDATE raid_boss_instances SET status = COALESCE(paused_from, 'active'), paused_from = NULL, version = version + 1 WHERE id = $1 RETURNING *", [cur.id])).rows[0];
      changed = cur;
    } else if (cur.status === 'preparing' && new Date(cur.active_at).getTime() <= now) {
      cur = (await client.query("UPDATE raid_boss_instances SET status = 'active', version = version + 1 WHERE id = $1 RETURNING *", [cur.id])).rows[0];
      changed = cur;
    } else if (cur.status === 'active' && cur.phase === 3) {
      // Ultimate Attack ของ Phase 3: เตือนล่วงหน้า (Telegraph) ตามรอบเวลา — เป็นฉากของบอส ไม่หักอะไรผู้เล่น
      const ua = cur.ultimate_at ? new Date(cur.ultimate_at).getTime() : 0;
      if (!ua || now >= ua + s.ultimateEverySec * 1000) {
        cur = (await client.query("UPDATE raid_boss_instances SET ultimate_at = NOW() + interval '10 seconds', version = version + 1 WHERE id = $1 RETURNING *", [cur.id])).rows[0];
        changed = cur;
      }
    } else if (cur.status === 'defeated') {
      cur = await settle(client, cur, s);
      changed = cur;
      events.push(['next', cur]);
    } else if (cur.status === 'settled' && cur.next_spawn_at && new Date(cur.next_spawn_at).getTime() <= now) {
      const maxLv = (await client.query('SELECT COALESCE(MAX(level), 0)::int AS m FROM raid_boss_instances')).rows[0].m;
      const lv = s.nextLevel && s.nextLevel > maxLv ? s.nextLevel : maxLv + 1;
      const n = await spawnLevel(client, lv, s, 'next');
      if (s.nextLevel) await clearNextLevel(client);
      if (n) { changed = n; events.push(['spawn', n]); }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    metrics.errors += 1;
    console.error('[raid/tick]', err.message);
    return null;
  } finally { client.release(); }
  if (changed) emitState(changed, s);
  for (const [kind, inst] of events) await announce(inst, kind, s).catch(() => {});
  return changed;
}
async function clearNextLevel(db) {
  await db.query("UPDATE raid_settings SET data = data - 'nextLevel', updated_at = NOW() WHERE id = 1");
  settingsCache = null;
}

/** สรุปผลหลังบอสตาย: สถิติผู้เล่น (ล้มบอส/ดาเมจดีที่สุด) → settled + คูลดาวน์ */
async function settle(db, inst, s) {
  await db.query(
    `INSERT INTO raid_player_stats (user_id, bosses_defeated, best_damage, best_instance_id)
       SELECT user_id, CASE WHEN correct >= $2 THEN 1 ELSE 0 END, damage, $1 FROM raid_contributions WHERE instance_id = $1
     ON CONFLICT (user_id) DO UPDATE SET
       bosses_defeated = raid_player_stats.bosses_defeated + EXCLUDED.bosses_defeated,
       best_instance_id = CASE WHEN EXCLUDED.best_damage > raid_player_stats.best_damage THEN EXCLUDED.best_instance_id ELSE raid_player_stats.best_instance_id END,
       best_damage = GREATEST(raid_player_stats.best_damage, EXCLUDED.best_damage), updated_at = NOW()`, [inst.id, s.minCorrectForReward]);
  const cnt = (await db.query('SELECT COUNT(*)::int AS n FROM raid_contributions WHERE instance_id = $1', [inst.id])).rows[0].n;
  const r = await db.query(
    `UPDATE raid_boss_instances SET status = 'settled', settled_at = NOW(), participants = $2,
        next_spawn_at = COALESCE(next_spawn_at, NOW() + make_interval(mins => $3)), version = version + 1 WHERE id = $1 RETURNING *`, [inst.id, cnt, s.cooldownMin]);
  return r.rows[0];
}

/* ====================================================================
   ระดับผู้เล่น (CEFR) — จากผลวัดระดับ · เลือกเองไม่ได้
   ==================================================================== */
async function cefrOf(userId, db = pool) {
  const { getUserCefr } = require('../ranked/matchService');
  const c = await getUserCefr(userId, db, 'vocab');
  return { cefr: c.cefr === 'C2' ? 'C1' : c.cefr, fromPlacement: c.fromPlacement };
}
const TODAY_SQL = "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')";

async function roundsToday(userId, db = pool) {
  return (await db.query(`SELECT COUNT(*)::int AS n FROM raid_attempts WHERE user_id = $1 AND started_at >= ${TODAY_SQL}`, [userId])).rows[0].n;
}

/* ====================================================================
   เริ่มรอบโจมตี
   ==================================================================== */
async function startRound(userId) {
  const s = await getSettings();
  if (!s.enabled) throw new RaidError('RAID_OFF', 'World Raid ปิดชั่วคราว (ผู้ดูแลกำลังปรับปรุง) — ความคืบหน้าทั้งหมดยังอยู่ครบ', 503);
  const inst = await current();
  if (!inst) throw new RaidError('NO_BOSS', 'กำลังเตรียมบอส ลองใหม่อีกครั้งในไม่กี่วินาที', 409);
  if (inst.status === 'preparing') throw new RaidError('PREPARING', 'บอสกำลังปรากฏตัว รออีกนิด', 409, { activeAt: iso(inst.active_at) });
  if (inst.status !== 'active') throw new RaidError('NOT_ACTIVE', inst.status === 'paused' ? 'World Raid ปิดชั่วคราว' : 'บอสถูกล้มแล้ว รอบอสตัวถัดไป', 409, { nextSpawnAt: iso(inst.next_spawn_at) });
  const used = await roundsToday(userId);
  if (used >= s.roundsPerDay) throw new RaidError('DAILY_LIMIT', `วันนี้โจมตีครบ ${s.roundsPerDay} รอบแล้ว — พรุ่งนี้มาช่วยทีมต่อได้ (กันการฟาร์ม)`, 429);
  const { cefr, fromPlacement } = await cefrOf(userId);
  const recent = await pool.query(
    `SELECT q->>'id' AS id FROM (SELECT questions FROM raid_attempts WHERE user_id = $1 ORDER BY started_at DESC LIMIT 6) a, jsonb_array_elements(a.questions) q`, [userId]);
  const exclude = new Set(recent.rows.map((r) => r.id));
  let questions;
  const mode = s.questionMode === 'mixed' ? 'mixed' : 'spell';
  // v1.27.1 ศัพท์ยากขึ้นตามเลเวลบอส: ระดับรอบ = สูงกว่าระหว่างผู้เล่น/บอส · บางส่วนต่ำกว่า 1 ระดับ (ผู้เริ่มต้นยังตีโดน) · แต่ละข้อติดระดับของตัวเอง (q.cefr)
  const plan = R.roundWordPlan(cefr, inst.level, s);
  const nTop = plan.low ? Math.round(s.questionsPerRound * plan.share) : s.questionsPerRound;
  const build = async (lvl, n, ex) => {
    if (n <= 0) return [];
    try { return await Q.buildRound({ cefr: lvl, phase: inst.phase, count: n, exclude: ex, mode }); }
    catch (_e) { return Q.buildRound({ cefr: lvl, phase: inst.phase, count: n, mode }); }
  };
  questions = await build(plan.top, nTop, exclude);
  if (plan.low) {
    const lowQs = await build(plan.low, s.questionsPerRound - nTop, new Set([...exclude, ...questions.map((q) => q.id)]));
    questions = Q.mixRound(questions, lowQs);
  }
  const id = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);   // เริ่มรอบพร้อมกันหลายแท็บ → ทีละคำขอ
    if (await roundsToday(userId, client) >= s.roundsPerDay) throw new RaidError('DAILY_LIMIT', `วันนี้โจมตีครบ ${s.roundsPerDay} รอบแล้ว`, 429);
    await client.query("UPDATE raid_attempts SET status = 'abandoned', finished_at = NOW() WHERE user_id = $1 AND status = 'open'", [userId]);
    await client.query(
      `INSERT INTO raid_attempts (id, user_id, instance_id, cefr, questions, expires_at, player_hp, player_max_hp) VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(mins => $6), $7, $7)`,
      [id, userId, inst.id, cefr, JSON.stringify(questions), s.roundTtlMin, s.playerHpOn ? s.playerHp : null]);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
  metrics.rounds += 1;
  return {
    attemptId: id, cefr, cefrFromPlacement: fromPlacement, wordPlan: { top: plan.top, low: plan.low, boss: plan.boss, user: plan.user }, total: questions.length, index: 0, question: Q.publicQuestion(questions[0], 0),
    answerLimitMs: s.answerLimitMs, roundsLeft: s.roundsPerDay - used - 1, boss: publicState(inst, s),
    player: s.playerHpOn ? { hp: s.playerHp, maxHp: s.playerHp } : null,
  };
}

/** แรงตีของบอสตาม Phase (ตอบผิด/หมดเวลา/ตอบเร็วผิดปกติ) */
function bossHitFor(s, phase, level = 1) { return Math.max(0, Math.round((Number(phase >= 3 ? s.bossHit3 : phase >= 2 ? s.bossHit2 : s.bossHit1) || 0) * R.levelPower(level, s).hitMult)); }   // v1.27.1 เลเวลสูง = ตีแรงขึ้น

/* ====================================================================
   ตอบคำถาม → ดาเมจ (หัวใจของระบบ)
   ==================================================================== */
function computeDamage({ cefr, qtype, combo, answerMs, s, inst, nowMs }) {
  const D = R.DAMAGE;
  let dmg = (R.BASE_DAMAGE[cefr] || 100) * (R.TYPE_MULT[qtype] || 1);
  dmg *= 1 + Math.min(combo, D.comboMax) * D.comboStep;
  const crit = combo >= D.critMinCombo && answerMs <= s.answerLimitMs * D.critFastShare;
  if (crit) dmg *= D.critMult;
  let kind = crit ? 'critical' : combo > 0 ? 'combo' : 'normal';
  const shieldUp = inst.phase >= 2 && inst.shield_goal > 0 && inst.shield_progress < inst.shield_goal;
  const stunned = inst.stun_until && new Date(inst.stun_until).getTime() > nowMs;
  if (shieldUp) { dmg *= D.shieldHpShare; kind = 'shield'; }
  else if (stunned) { dmg *= D.teamMult; if (!crit) kind = 'team'; }
  dmg *= 1 - Math.min(0.6, Number(inst.defense) || 0);
  return { dmg: Math.max(1, Math.round(dmg)), crit, kind, shieldUp, stunned: Boolean(stunned) };
}

async function shieldGoalFor(db, instId) {
  // ผู้เล่นที่ตอบจริงในบอสตัวนี้ช่วง 30 นาทีล่าสุด (ไม่ใช้จำนวนบัญชีทั้งหมด) × 3 ข้อ · อย่างน้อย 10 · ไม่เกิน 300
  const n = (await db.query("SELECT COUNT(DISTINCT user_id)::int AS n FROM raid_question_responses WHERE instance_id = $1 AND created_at > NOW() - interval '30 minutes'", [instId])).rows[0].n;
  return Math.max(10, Math.min(300, n * 3));
}

async function answer(userId, { attemptId, index, choice, text }) {
  const s = await getSettings();
  const t0 = Date.now();
  if (typeof attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(attemptId)) throw new RaidError('BAD_ATTEMPT', 'ไม่พบรอบโจมตีนี้', 404);
  const idx = Number(index); const ch = choice === null || choice === undefined ? null : Number(choice);
  if (!Number.isInteger(idx) || idx < 0 || idx > 50) throw new RaidError('BAD_INDEX', 'ข้อไม่ถูกต้อง');
  if (ch !== null && (!Number.isInteger(ch) || ch < 0 || ch > 5)) throw new RaidError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  const spelled = text === undefined || text === null ? null : Q.normSpell(text);
  const client = await pool.connect();
  const events = []; let instAfter = null; let hit = null; let out;
  try {
    await client.query('BEGIN');
    const a = (await client.query('SELECT * FROM raid_attempts WHERE id = $1 AND user_id = $2 FOR UPDATE', [attemptId, userId])).rows[0];
    if (!a) throw new RaidError('BAD_ATTEMPT', 'ไม่พบรอบโจมตีนี้', 404);
    // ส่งซ้ำ (เน็ตหลุดแล้วกดใหม่) → ตอบผลเดิม ไม่สร้างดาเมจซ้ำ
    if (idx < a.current) {
      const prev = (await client.query(
        `SELECT r.correct, r.flagged, r.player_hit, r.player_heal, r.player_hp_after, d.amount, d.kind FROM raid_question_responses r LEFT JOIN raid_damage_events d ON d.attempt_id = r.attempt_id AND d.qidx = r.qidx
          WHERE r.attempt_id = $1 AND r.qidx = $2`, [attemptId, idx])).rows[0];
      const q = a.questions[idx];
      await client.query('COMMIT');
      return { replay: true, correct: Boolean(prev && prev.correct), correctIndex: q.correctIndex, answerText: q.type === 'spell' ? q.answer : undefined, explain: q.explain, damage: prev && prev.amount ? Number(prev.amount) : 0, kind: prev ? prev.kind : null,
        next: null, hasNext: a.status === 'open' && a.current < a.questions.length, finished: a.status !== 'open',
        player: a.player_max_hp ? { hp: a.player_hp, maxHp: a.player_max_hp, hit: prev ? prev.player_hit : 0, heal: prev ? prev.player_heal : 0, ko: a.knocked_out } : null };
    }
    if (a.status !== 'open') throw new RaidError('ROUND_CLOSED', 'รอบนี้จบแล้ว เริ่มรอบใหม่ได้เลย', 409);
    if (idx !== a.current) throw new RaidError('WRONG_INDEX', 'ข้อไม่ตรงกับเซิร์ฟเวอร์ — โหลดใหม่', 409, { current: a.current });
    if (a.shown_idx < a.current) throw new RaidError('NOT_SHOWN', 'ยังไม่ได้เปิดข้อนี้', 409, { current: a.current });
    if (new Date(a.expires_at).getTime() < Date.now()) {
      await client.query("UPDATE raid_attempts SET status = 'expired', finished_at = NOW() WHERE id = $1", [a.id]);
      await client.query('COMMIT');
      throw new RaidError('ROUND_EXPIRED', 'รอบนี้หมดเวลาแล้ว เริ่มรอบใหม่ได้เลย', 409);
    }
    const q = a.questions[idx];
    const answerMs = Math.max(0, Date.now() - new Date(a.q_at).getTime());
    const flagged = answerMs < s.minAnswerMs ? 'too_fast' : null;
    const isSpell = q.type === 'spell';
    const slow = isSpell || q.type === 'listening';
    const limitMs = slow ? Math.round(s.answerLimitMs * 1.5) : s.answerLimitMs;   // สะกดเอง / ต้องฟังคลิปก่อน ใช้เวลามากกว่า
    const timedOut = answerMs > limitMs + 3000 || (isSpell ? !spelled : ch === null);
    const correct = !flagged && !timedOut && (isSpell ? spelled === q.answer : ch === q.correctIndex);
    const inst = (await client.query('SELECT * FROM raid_boss_instances WHERE id = $1 FOR UPDATE', [a.instance_id])).rows[0];
    const now = Date.now();
    let applied = 0; let kind = null; let crit = false; let combo = a.combo; let shieldBroke = false; let bossGone = false;
    if (correct && inst.status === 'active' && Number(inst.hp) > 0) {
      const d = computeDamage({ cefr: q.cefr || a.cefr, qtype: q.type, combo, answerMs, s: slow ? { ...s, answerLimitMs: limitMs } : s, inst, nowMs: now });
      kind = d.kind; crit = d.crit;
      applied = Math.min(d.dmg, Number(inst.hp));
      const hpAfter = Number(inst.hp) - applied;
      let phase = Math.max(inst.phase, R.phaseFor(hpAfter, Number(inst.max_hp)));
      let shieldGoal = inst.shield_goal; let shieldProg = inst.shield_progress; let stunUntil = inst.stun_until; let shieldBrokenAt = inst.shield_broken_at; let ultimateAt = inst.ultimate_at;
      if (d.shieldUp) {
        shieldProg += 1;
        if (shieldProg >= shieldGoal) { shieldBroke = true; kind = 'break'; stunUntil = new Date(now + R.DAMAGE.stunMs); shieldBrokenAt = new Date(now); }
      }
      if (phase >= 2 && inst.phase < 2) { shieldGoal = await shieldGoalFor(client, inst.id); shieldProg = 0; events.push('phase2'); }
      if (phase >= 3 && inst.phase < 3) {
        if (shieldGoal > 0 && shieldProg < shieldGoal) shieldProg = shieldGoal;   // ร่างสุดท้าย: โล่สลาย (กันค้าง)
        ultimateAt = new Date(now + 8000); events.push('phase3');
      }
      if (hpAfter <= Number(inst.max_hp) * 0.1 && Number(inst.hp) > Number(inst.max_hp) * 0.1) events.push('hp10');
      if (shieldBroke) events.push('shield_broken');
      const dead = hpAfter === 0;
      if (dead) { phase = 3; events.push('defeated'); bossGone = true; }
      instAfter = (await client.query(
        `UPDATE raid_boss_instances SET hp = $2, phase = $3, shield_goal = $4, shield_progress = $5, stun_until = $6, shield_broken_at = $7, ultimate_at = $8,
            total_damage = total_damage + $9, version = version + 1,
            status = CASE WHEN $10 THEN 'defeated' ELSE status END,
            defeated_at = CASE WHEN $10 THEN NOW() ELSE defeated_at END,
            killer_user_id = CASE WHEN $10 THEN $11::int ELSE killer_user_id END,
            skin = CASE WHEN $10 THEN $12 ELSE skin END,
            next_spawn_at = CASE WHEN $10 THEN NOW() + make_interval(mins => $13) ELSE next_spawn_at END
          WHERE id = $1 AND status = 'active' RETURNING *`,
        [inst.id, hpAfter, phase, shieldGoal, shieldProg, stunUntil, shieldBrokenAt, ultimateAt, applied, dead, userId, skinOf(inst, s), s.cooldownMin])).rows[0];
      await client.query('INSERT INTO raid_damage_events (instance_id, user_id, attempt_id, qidx, amount, kind, hp_after, phase) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [inst.id, userId, a.id, idx, applied, kind, hpAfter, phase]);
      combo += 1;
    } else {
      if (correct) bossGone = true;   // ตอบถูกแต่บอสไม่ได้อยู่ในสถานะต่อสู้แล้ว (ถูกล้ม/พัก)
      combo = 0;
    }
    if (!correct && inst.status !== 'active') bossGone = true;
    // v1.27.1 พลังชีวิตผู้เล่น (คิดที่เซิร์ฟเวอร์เท่านั้น) — บอสตีเฉพาะตอนบอสยังสู้อยู่ · ไม่หัก Coin/EXP/ไอเทม/อันดับ
    let pHit = 0; let pHeal = 0; let pHp = a.player_hp; let ko = false;
    if (a.player_max_hp) {
      if (!correct && inst.status === 'active') pHit = Math.min(pHp, bossHitFor(s, inst.phase, inst.level));
      else if (correct && s.healEvery > 0 && combo > 0 && combo % s.healEvery === 0) pHeal = Math.min(Math.max(0, a.player_max_hp - pHp), Math.round(s.healAmount || 0));
      pHp = Math.max(0, pHp - pHit + pHeal);
      ko = pHp <= 0;
    }
    await client.query(
      `INSERT INTO raid_question_responses (attempt_id, qidx, user_id, instance_id, question_id, qtype, choice, correct, answer_ms, flagged, answer_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [a.id, idx, userId, a.instance_id, String(q.id).slice(0, 80), q.type, isSpell ? null : ch, correct, Math.min(answerMs, 2e9), flagged || (timedOut ? 'timeout' : null), isSpell ? spelled : null]);
    if (a.player_max_hp) await client.query('UPDATE raid_question_responses SET player_hit = $3, player_heal = $4, player_hp_after = $5 WHERE attempt_id = $1 AND qidx = $2', [a.id, idx, pHit, pHeal, pHp]);
    const last = idx + 1 >= a.questions.length || bossGone || ko;
    const ins = (await client.query(
      `INSERT INTO raid_contributions (instance_id, user_id, damage, correct, answered, rounds, best_combo, crits, shield_hits, cefr)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9)
       ON CONFLICT (instance_id, user_id) DO UPDATE SET damage = raid_contributions.damage + EXCLUDED.damage, correct = raid_contributions.correct + EXCLUDED.correct,
         answered = raid_contributions.answered + 1, rounds = raid_contributions.rounds + EXCLUDED.rounds,
         best_combo = GREATEST(raid_contributions.best_combo, EXCLUDED.best_combo), crits = raid_contributions.crits + EXCLUDED.crits,
         shield_hits = raid_contributions.shield_hits + EXCLUDED.shield_hits, cefr = EXCLUDED.cefr, last_at = NOW()
       RETURNING (xmax = 0) AS inserted, damage, correct, answered, rounds, best_combo`,
      [a.instance_id, userId, applied, correct ? 1 : 0, last ? 1 : 0, combo, crit ? 1 : 0, kind === 'shield' || kind === 'break' ? 1 : 0, a.cefr])).rows[0];
    if (ins.inserted) {
      const pi = (await client.query('UPDATE raid_boss_instances SET participants = participants + 1, version = version + 1 WHERE id = $1 RETURNING *', [a.instance_id])).rows[0];
      instAfter = pi;
    }
    await client.query(
      `INSERT INTO raid_player_stats (user_id, total_damage, correct, answered, raids_joined) VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (user_id) DO UPDATE SET total_damage = raid_player_stats.total_damage + EXCLUDED.total_damage, correct = raid_player_stats.correct + EXCLUDED.correct,
         answered = raid_player_stats.answered + 1, raids_joined = raid_player_stats.raids_joined + EXCLUDED.raids_joined, updated_at = NOW()`,
      [userId, applied, correct ? 1 : 0, ins.inserted ? 1 : 0]);
    const upd = (await client.query(
      `UPDATE raid_attempts SET current = current + 1, q_at = NOW(), combo = $2, best_combo = GREATEST(best_combo, $2), correct = correct + $3, answered = answered + 1,
          damage = damage + $4, status = CASE WHEN $5 THEN 'finished' ELSE status END, finished_at = CASE WHEN $5 THEN NOW() ELSE finished_at END,
          player_hp = $6, knocked_out = $7
        WHERE id = $1 RETURNING *`, [a.id, combo, correct ? 1 : 0, applied, last, a.player_max_hp ? pHp : null, ko])).rows[0];
    // v1.27.1 ตีโดนได้ EXP (เจ้าของขอ 26 พ.ย.) — เฉพาะตอบถูกที่ทำดาเมจจริง (ไม่นับตอบเร็วผิดปกติ/หมดเวลา/บอสไม่ได้สู้) · ใน transaction เดียวกับดาเมจ · ส่งซ้ำไม่ได้ซ้ำ (replay คืนผลเดิม)
    let expOut = null;
    if (correct && applied > 0 && s.hitExp > 0) {
      const g = await grantExp(userId, s.hitExp, { reason: 'raid_hit', dailyCap: s.hitExpDailyCap, db: client });
      expOut = { gained: g.gained, capped: g.gained < s.hitExp, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
    }
    await client.query('COMMIT');
    if (!instAfter) instAfter = inst;
    if (applied > 0) {
      const u = (await pool.query('SELECT username, raid_title FROM users WHERE id = $1', [userId])).rows[0] || {};
      hit = { u: userId, n: u.username || '', t: u.raid_title || null, d: applied, k: kind, q: q.type, at: new Date().toISOString() };
    }
    out = {
      correct, correctIndex: q.correctIndex, answerText: isSpell ? q.answer : undefined, explain: q.explain, qtype: q.type, damage: applied, kind, crit, combo, flagged, timedOut,
      bossGone, finished: last, knockedOut: ko, exp: expOut,
      player: a.player_max_hp ? { hp: pHp, maxHp: a.player_max_hp, hit: pHit, heal: pHeal, ko } : null,
      hasNext: !last,   // ข้อถัดไปเปิดด้วย POST /round/next (เริ่มจับเวลาตอนผู้เล่นกด "ข้อถัดไป" จริง ไม่ใช่ตอนอ่านคำอธิบาย)
      next: null,
      round: { correct: upd.correct, answered: upd.answered, damage: Number(upd.damage), bestCombo: upd.best_combo, total: upd.questions.length },
      me: { damage: Number(ins.damage), correct: ins.correct, answered: ins.answered, rounds: ins.rounds },
      boss: publicState(instAfter, s),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!(err instanceof RaidError)) metrics.errors += 1;
    throw err;
  } finally { client.release(); }
  metrics.answers += 1; metrics.latency.push(Date.now() - t0); if (metrics.latency.length > 500) metrics.latency.splice(0, 250);
  if (out.flagged) metrics.flagged += 1;
  if (instAfter) emitState(instAfter, s, hit);
  for (const e of events) await announce(instAfter, e, s).catch(() => {});
  return out;
}

/** เปิดข้อถัดไป (ผู้เล่นกด "ข้อถัดไป") — เริ่มจับเวลาครั้งเดียวต่อข้อ · ขอซ้ำได้ข้อเดิม เวลาไม่รีเซ็ต */
async function nextQuestion(userId, attemptId) {
  if (typeof attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(attemptId)) throw new RaidError('BAD_ATTEMPT', 'ไม่พบรอบโจมตีนี้', 404);
  const a = (await pool.query(
    `UPDATE raid_attempts SET q_at = CASE WHEN shown_idx < current THEN NOW() ELSE q_at END, shown_idx = GREATEST(shown_idx, current)
      WHERE id = $1 AND user_id = $2 RETURNING *`, [attemptId, userId])).rows[0];
  if (!a) throw new RaidError('BAD_ATTEMPT', 'ไม่พบรอบโจมตีนี้', 404);
  if (a.status !== 'open' || a.current >= a.questions.length) throw new RaidError('ROUND_CLOSED', 'รอบนี้จบแล้ว', 409);
  return { index: a.current, total: a.questions.length, question: Q.publicQuestion(a.questions[a.current], a.current) };
}

/** สรุปรอบ (หลังตอบครบ) + คำอธิบายทุกข้อ */
async function roundSummary(userId, attemptId) {
  const a = (await pool.query('SELECT * FROM raid_attempts WHERE id = $1 AND user_id = $2', [attemptId, userId])).rows[0];
  if (!a) throw new RaidError('BAD_ATTEMPT', 'ไม่พบรอบโจมตีนี้', 404);
  const res = (await pool.query('SELECT r.qidx, r.choice, r.answer_text, r.correct, r.flagged, d.amount, d.kind FROM raid_question_responses r LEFT JOIN raid_damage_events d ON d.attempt_id = r.attempt_id AND d.qidx = r.qidx WHERE r.attempt_id = $1 ORDER BY r.qidx', [a.id])).rows;
  return {
    attemptId: a.id, status: a.status, correct: a.correct, answered: a.answered, damage: Number(a.damage), bestCombo: a.best_combo, cefr: a.cefr,
    player: a.player_max_hp ? { hp: a.player_hp, maxHp: a.player_max_hp, ko: a.knocked_out } : null,
    items: res.map((r) => { const q = a.questions[r.qidx]; return { index: r.qidx, type: q.type, prompt: q.type === 'listening' && q.transcript ? q.transcript : q.prompt, choices: q.choices, correctIndex: q.correctIndex, answerText: q.type === 'spell' ? q.answer : undefined, typed: r.answer_text || null, choice: r.choice, correct: r.correct, explain: q.explain, damage: r.amount ? Number(r.amount) : 0, kind: r.kind, flagged: r.flagged }; }),
  };
}

/** รอบที่ยังเปิดอยู่ (กลับเข้าหน้า Raid/รีเฟรช = ทำต่อจากข้อเดิม) */
async function openRound(userId) {
  const a = (await pool.query("SELECT * FROM raid_attempts WHERE user_id = $1 AND status = 'open' AND expires_at > NOW() ORDER BY started_at DESC LIMIT 1", [userId])).rows[0];
  if (!a || a.current >= a.questions.length) return null;
  // ข้อที่เปิดให้เห็นแล้ว: เวลาเดิมเดินต่อ (กันรีเฟรชเพื่อรีเซ็ตเวลา/ทำ Critical) · ข้อที่ยังไม่เปิด: เริ่มจับเวลาตอนนี้
  if (a.shown_idx < a.current) await pool.query('UPDATE raid_attempts SET q_at = NOW(), shown_idx = current WHERE id = $1 AND shown_idx < current', [a.id]);
  const s = await getSettings();
  return { attemptId: a.id, cefr: a.cefr, total: a.questions.length, index: a.current, question: Q.publicQuestion(a.questions[a.current], a.current), answerLimitMs: s.answerLimitMs,
    round: { correct: a.correct, answered: a.answered, damage: Number(a.damage), combo: a.combo },
    player: a.player_max_hp ? { hp: a.player_hp, maxHp: a.player_max_hp } : null };
}

/* ====================================================================
   สถานะสำหรับหน้า Raid
   ==================================================================== */
const statsCache = { at: 0, data: null };
async function state(userId) {
  const s = await getSettings();
  let inst = await current();
  if (!inst && s.enabled) { await tick(); inst = await current(); }
  const out = { enabled: s.enabled, boss: publicState(inst, s), config: { questionMode: s.questionMode === 'mixed' ? 'mixed' : 'spell', questionsPerRound: s.questionsPerRound, roundsPerDay: s.roundsPerDay, playerHp: s.playerHpOn ? s.playerHp : null, bossHit: s.playerHpOn ? [1, 2, 3].map((ph) => bossHitFor(s, ph, inst ? inst.level : 1)) : null, healEvery: s.healEvery, healAmount: s.healAmount, hitExp: s.hitExp, hitExpDailyCap: s.hitExpDailyCap, wordLevel: inst ? R.bossWordLevel(inst.level, s) : 'A1', wordLevelEvery: s.wordLevelEvery, answerLimitMs: s.answerLimitMs, minCorrect: s.minCorrectForReward, claimDays: s.claimDays } };
  if (!inst) return out;
  const [me, total, feed, rt] = await Promise.all([
    pool.query('SELECT damage, correct, answered, rounds, best_combo, crits FROM raid_contributions WHERE instance_id = $1 AND user_id = $2', [inst.id, userId]),
    pool.query('SELECT raids_joined, bosses_defeated, total_damage, correct, answered, best_damage FROM raid_player_stats WHERE user_id = $1', [userId]),
    recentHits(inst.id),
    roundsToday(userId),
  ]);
  const m = me.rows[0];
  let rank = null;
  if (m) rank = (await pool.query('SELECT COUNT(*)::int + 1 AS r FROM raid_contributions WHERE instance_id = $1 AND damage > $2', [inst.id, m.damage])).rows[0].r;
  out.me = m ? { damage: Number(m.damage), correct: m.correct, answered: m.answered, rounds: m.rounds, bestCombo: m.best_combo, crits: m.crits, rank,
    qualified: m.correct >= s.minCorrectForReward, accuracy: m.answered ? Math.round((m.correct / m.answered) * 100) : 0 } : null;
  const t = total.rows[0];
  out.career = t ? { raids: t.raids_joined, defeated: t.bosses_defeated, damage: Number(t.total_damage), correct: t.correct, answered: t.answered, bestDamage: Number(t.best_damage),
    accuracy: t.answered ? Math.round((t.correct / t.answered) * 100) : 0 } : null;
  out.feed = feed;
  out.roundsLeft = Math.max(0, s.roundsPerDay - rt);
  out.open = await openRound(userId);
  out.claimable = (await rewardsList(userId)).filter((r) => r.claimable.length).length;
  const title = (await pool.query('SELECT raid_title FROM users WHERE id = $1', [userId])).rows[0];
  out.title = title ? title.raid_title : null;
  return out;
}
async function recentHits(instId, limit = 12) {
  const { rows } = await pool.query(
    `SELECT d.user_id, u.username, u.raid_title, d.amount, d.kind, d.created_at FROM raid_damage_events d JOIN users u ON u.id = d.user_id
      WHERE d.instance_id = $1 ORDER BY d.id DESC LIMIT $2`, [instId, limit]);
  return rows.map((r) => ({ u: r.user_id, n: r.username, t: r.raid_title, d: Number(r.amount), k: r.kind, at: iso(r.created_at) }));
}
async function lightState() {
  const s = await getSettings();
  const inst = await current();
  return { enabled: s.enabled, boss: publicState(inst, s) };
}

/* ====================================================================
   กระดานอันดับ / สรุปทั้งเซิร์ฟเวอร์
   ==================================================================== */
const TITLE_TH = {};
function rewardName(id) {
  if (TITLE_TH[id]) return TITLE_TH[id];
  for (const f of R.FAMILIES) {
    for (const it of [...((f.rewards && f.rewards.defeat) || []), ...Object.values(f.skins || {}).flatMap((k) => (k.rewards && k.rewards.defeat) || [])]) TITLE_TH[it.id] = it.nameTh;
    TITLE_TH[`trophy:${f.key}`] = `Trophy · ${f.nameEn}`;
    TITLE_TH[`${R.REWARDS.rare.idPrefix}${f.key}`] = `${f.nameEn} Conqueror`;
  }
  return TITLE_TH[id] || id;
}
async function leaderboard(userId, { scope = 'current', instanceId = null, cefr = null } = {}) {
  const s = await getSettings();
  const lvl = cefr && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(cefr) ? cefr : null;
  if (scope === 'all') {
    const { rows } = await pool.query(
      `SELECT p.user_id, u.username, u.avatar, u.avatar_image, u.exp, u.raid_title, p.total_damage AS damage, p.correct, p.answered, p.bosses_defeated, p.raids_joined
         FROM raid_player_stats p JOIN users u ON u.id = p.user_id WHERE p.answered > 0 ORDER BY p.total_damage DESC LIMIT 20`);
    const mine = (await pool.query('SELECT total_damage FROM raid_player_stats WHERE user_id = $1', [userId])).rows[0];
    const myRank = mine ? (await pool.query('SELECT COUNT(*)::int + 1 AS r FROM raid_player_stats WHERE total_damage > $1', [mine.total_damage])).rows[0].r : null;
    return { scope, top: rows.map(lbRow), myRank, myDamage: mine ? Number(mine.total_damage) : 0 };
  }
  const inst = instanceId ? (await pool.query('SELECT * FROM raid_boss_instances WHERE id = $1', [Number(instanceId)])).rows[0] : await current();
  if (!inst) return { scope, top: [], recent: [], summary: null };
  const where = lvl ? 'AND c.cefr = $2' : '';
  const params = lvl ? [inst.id, lvl] : [inst.id];
  const [top, recent, sum] = await Promise.all([
    pool.query(`SELECT c.user_id, u.username, u.avatar, u.avatar_image, u.exp, u.raid_title, c.damage, c.correct, c.answered, c.cefr FROM raid_contributions c JOIN users u ON u.id = c.user_id
                 WHERE c.instance_id = $1 ${where} ORDER BY c.damage DESC, c.first_at LIMIT 20`, params),
    pool.query(`SELECT c.user_id, u.username, u.avatar, u.avatar_image, u.exp, u.raid_title, c.damage, c.correct, c.answered, c.cefr FROM raid_contributions c JOIN users u ON u.id = c.user_id
                 WHERE c.instance_id = $1 ORDER BY c.last_at DESC LIMIT 10`, [inst.id]),
    pool.query('SELECT COUNT(*)::int AS players, COALESCE(SUM(damage), 0)::bigint AS damage, COALESCE(SUM(correct), 0)::int AS correct, COALESCE(SUM(answered), 0)::int AS answered FROM raid_contributions WHERE instance_id = $1', [inst.id]),
  ]);
  const mine = (await pool.query('SELECT damage, correct, answered FROM raid_contributions WHERE instance_id = $1 AND user_id = $2', [inst.id, userId])).rows[0];
  const myRank = mine ? (await pool.query('SELECT COUNT(*)::int + 1 AS r FROM raid_contributions WHERE instance_id = $1 AND damage > $2', [inst.id, mine.damage])).rows[0].r : null;
  const sm = sum.rows[0];
  return {
    scope, cefr: lvl, boss: publicState(inst, s), top: top.rows.map(lbRow), recent: recent.rows.map(lbRow), myRank,
    me: mine ? { damage: Number(mine.damage), correct: mine.correct, answered: mine.answered } : null,
    summary: { players: sm.players, damage: Number(sm.damage), correct: sm.correct, answered: sm.answered, accuracy: sm.answered ? Math.round((sm.correct / sm.answered) * 100) : 0 },
  };
}
function lbRow(r) {
  return { id: r.user_id, username: r.username, avatar: r.avatar || 'fox', avatarImage: r.avatar_image || null, level: getLevelInfo(Number(r.exp) || 0).level,
    title: r.raid_title ? rewardName(r.raid_title) : null, damage: Number(r.damage), correct: r.correct, answered: r.answered,
    accuracy: r.answered ? Math.round((r.correct / r.answered) * 100) : 0, cefr: r.cefr || null, defeated: r.bosses_defeated, raids: r.raids_joined };
}

/* ====================================================================
   รางวัล
   ==================================================================== */
function tiersFor(inst, c, s, owned) {
  if (!c) return [];
  const defeated = ['defeated', 'settled'].includes(inst.status);
  const mult = (s.rewardMultiplier || 1) * R.rewardTier(inst.level);
  const out = [];
  const q = c.correct >= s.minCorrectForReward;
  if (!q) return out;
  if (defeated || inst.status === 'cancelled') out.push({ tier: 'participation', th: R.REWARDS.participation.th, exp: Math.round(R.REWARDS.participation.exp * mult), coin: Math.round(R.REWARDS.participation.coin * mult), items: [] });
  if (defeated) {
    for (const m of R.REWARDS.milestones) if (c.correct >= m.minCorrect) out.push({ tier: m.key, th: m.th, exp: Math.round(m.exp * mult), coin: Math.round(m.coin * mult), items: [] });
    out.push({ tier: 'defeat', th: R.REWARDS.defeat.th, exp: Math.round(R.REWARDS.defeat.exp * mult), coin: Math.round(R.REWARDS.defeat.coin * mult),
      items: rewardItemsOf(inst, s).map((it) => ({ id: it.id, kind: it.kind, nameTh: it.nameTh })) });
    const trophy = `trophy:${inst.family}`;
    if (!owned.has(trophy)) out.push({ tier: `first:${inst.family}`, th: R.REWARDS.firstClear.th, exp: 0, coin: 0, items: [{ id: trophy, kind: 'trophy', nameTh: rewardName(trophy) }] });
    if (c.correct >= R.REWARDS.rare.minCorrect) {
      const id = `${R.REWARDS.rare.idPrefix}${inst.family}`;
      out.push({ tier: 'rare', th: R.REWARDS.rare.th, exp: 0, coin: 0, items: [{ id, kind: 'title', nameTh: rewardName(id) }] });
    }
  }
  return out;
}
async function rewardsList(userId) {
  const s = await getSettings();
  const { rows } = await pool.query(
    `SELECT i.*, c.correct, c.damage, c.answered FROM raid_contributions c JOIN raid_boss_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1 AND i.status IN ('defeated', 'settled', 'cancelled') AND COALESCE(i.defeated_at, i.settled_at, i.spawned_at) > NOW() - make_interval(days => $2)
      ORDER BY i.level DESC LIMIT 30`, [userId, s.claimDays]);
  if (!rows.length) return [];
  const claimed = (await pool.query('SELECT instance_id, tier FROM raid_reward_claims WHERE user_id = $1 AND instance_id = ANY($2::bigint[])', [userId, rows.map((r) => r.id)])).rows;
  const cset = new Set(claimed.map((c) => `${c.instance_id}|${c.tier}`));
  const owned = new Set((await pool.query('SELECT reward_id FROM raid_user_rewards WHERE user_id = $1', [userId])).rows.map((r) => r.reward_id));
  return rows.map((r) => {
    const tiers = tiersFor(r, r, s, owned);
    return { instanceId: Number(r.id), level: r.level, ...displayOf(r, s), status: r.status, defeatedAt: iso(r.defeated_at),
      correct: r.correct, damage: Number(r.damage), tiers, claimable: tiers.filter((t) => !cset.has(`${r.id}|${t.tier}`)).map((t) => t.tier),
      expiresAt: iso(new Date(new Date(r.defeated_at || r.settled_at || r.spawned_at).getTime() + s.claimDays * 86400000)) };
  });
}
async function claim(userId, instanceId) {
  const s = await getSettings();
  const id = Number(instanceId);
  if (!Number.isInteger(id) || id <= 0) throw new RaidError('BAD_INSTANCE', 'ไม่พบบอสนี้', 404);
  const client = await pool.connect();
  const granted = []; let exp = 0; let coin = 0; let levelInfo = null;
  try {
    await client.query('BEGIN');
    const inst = (await client.query('SELECT * FROM raid_boss_instances WHERE id = $1', [id])).rows[0];
    if (!inst) throw new RaidError('BAD_INSTANCE', 'ไม่พบบอสนี้', 404);
    const c = (await client.query('SELECT * FROM raid_contributions WHERE instance_id = $1 AND user_id = $2 FOR UPDATE', [id, userId])).rows[0];
    if (!c) throw new RaidError('NOT_PARTICIPANT', 'ไม่ได้ร่วมต่อสู้กับบอสตัวนี้', 403);
    const end = new Date(inst.defeated_at || inst.settled_at || inst.spawned_at).getTime();
    if (Date.now() > end + s.claimDays * 86400000) throw new RaidError('CLAIM_EXPIRED', `เลยกำหนดรับรางวัล (${s.claimDays} วันหลังจบศึก)`, 410);
    const owned = new Set((await client.query('SELECT reward_id FROM raid_user_rewards WHERE user_id = $1', [userId])).rows.map((r) => r.reward_id));
    const tiers = tiersFor(inst, c, s, owned);
    if (!tiers.length) throw new RaidError('NOT_QUALIFIED', ['defeated', 'settled'].includes(inst.status) ? `ต้องตอบถูกอย่างน้อย ${s.minCorrectForReward} ข้อในบอสตัวนี้` : 'รับรางวัลได้หลังบอสถูกล้ม', 409);
    for (const t of tiers) {
      const ins = await client.query('INSERT INTO raid_reward_claims (instance_id, user_id, tier, payload) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING tier',
        [id, userId, t.tier, JSON.stringify({ exp: t.exp, coin: t.coin, items: t.items.map((i) => i.id) })]);
      if (!ins.rows[0]) continue;
      if (t.exp > 0) { const g = await grantExp(userId, t.exp, { reason: 'raid', db: client }); exp += g.gained; levelInfo = g.levelInfo || levelInfo; }
      if (t.coin > 0) { const g = await coins.grant(userId, { type: 'RAID', key: `raid:${id}:${t.tier}`, amount: t.coin, description: `World Raid Lv.${inst.level} · ${t.th}` }, { db: client }); if (g.granted) coin += g.amount; }
      for (const it of t.items) {
        if (it.kind === 'pframe' || it.kind === 'cframe') {
          if (!COS.BY_ID[it.id]) continue;
          await client.query("INSERT INTO user_cosmetics (user_id, item_id, via) VALUES ($1, $2, 'raid') ON CONFLICT DO NOTHING", [userId, it.id]);
        } else {
          await client.query('INSERT INTO raid_user_rewards (user_id, reward_id, instance_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, it.id, id]);
        }
      }
      granted.push(t);
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
  if (coin > 0) coins.scheduleAchievements && coins.scheduleAchievements(userId);
  return { granted, exp, coin, levelInfo };
}

async function trophies(userId) {
  const { rows } = await pool.query('SELECT reward_id, instance_id, granted_at FROM raid_user_rewards WHERE user_id = $1 ORDER BY granted_at DESC', [userId]);
  const frames = (await pool.query("SELECT item_id, acquired_at FROM user_cosmetics WHERE user_id = $1 AND via = 'raid'", [userId])).rows;
  const t = (await pool.query('SELECT raid_title FROM users WHERE id = $1', [userId])).rows[0];
  return {
    items: rows.map((r) => ({ id: r.reward_id, kind: r.reward_id.split(':')[0].replace('raid-', ''), nameTh: rewardName(r.reward_id), at: iso(r.granted_at) })),
    frames: frames.map((f) => ({ id: f.item_id, nameTh: COS.BY_ID[f.item_id] ? COS.BY_ID[f.item_id].nameTh : f.item_id, at: iso(f.acquired_at) })),
    title: t && t.raid_title ? { id: t.raid_title, nameTh: rewardName(t.raid_title) } : null,
  };
}
async function setTitle(userId, rewardId) {
  if (rewardId === null || rewardId === '') { await pool.query('UPDATE users SET raid_title = NULL WHERE id = $1', [userId]); return { title: null }; }
  const id = String(rewardId).slice(0, 64);
  if (!id.startsWith('raid-title:')) throw new RaidError('NOT_TITLE', 'ใช้ได้เฉพาะฉายา');
  const own = (await pool.query('SELECT 1 FROM raid_user_rewards WHERE user_id = $1 AND reward_id = $2', [userId, id])).rows[0];
  if (!own) throw new RaidError('NOT_OWNED', 'ยังไม่ได้รับฉายานี้', 403);
  await pool.query('UPDATE users SET raid_title = $2 WHERE id = $1', [userId, id]);
  return { title: { id, nameTh: rewardName(id) } };
}

/* ====================================================================
   v1.27.1 ชวนเพื่อนในแชทโลกมาตีบอส — ข้อความแบบฟอร์มคงที่จากเซิร์ฟเวอร์ (ไม่มีข้อความพิมพ์เอง · ไม่มีอีเมล/เบอร์/ตำแหน่ง)
   ผ่านกติกาแชทโลกทั้งหมด (ต้องเปิดแชท · ถูกปิดแชท = ส่งไม่ได้ · จำกัดอัตรา) + ชวนได้ 1 ครั้ง/2 นาที/คน
   ==================================================================== */
const INVITE_GAP_MS = 2 * 60 * 1000;
const inviteAt = new Map();
const inviteRef = (id) => `R${String(id).padStart(3, '0')}`;
async function invite(userId) {
  const s = await getSettings();
  if (!s.enabled) throw new RaidError('RAID_OFF', 'World Raid ปิดชั่วคราว', 503);
  const inst = await current();
  if (!inst || !['active', 'preparing'].includes(inst.status)) throw new RaidError('NOT_ACTIVE', 'ตอนนี้ยังไม่มีบอสให้ชวนมาตี', 409);
  const last = inviteAt.get(userId) || 0;
  const wait = INVITE_GAP_MS - (Date.now() - last);
  if (wait > 0) throw new RaidError('INVITE_WAIT', `ชวนได้อีกครั้งใน ${Math.ceil(wait / 1000)} วินาที`, 429, { retryInSec: Math.ceil(wait / 1000) });
  const fam = R.BY_KEY[inst.family] || {};
  const text = `มาช่วยกันตีบอส ${fam.nameEn || 'World Boss'} Lv.${inst.level} ใน World Raid กัน!`;
  const WC = require('../worldChat');
  let msg;
  try { msg = await WC.postInvite(userId, { kind: 'raid', ref: inviteRef(inst.id), text }); }
  catch (e) { if (e instanceof WC.ChatError) throw new RaidError(e.code || 'CHAT', e.message, e.status || 400, e.extra || {}); throw e; }
  inviteAt.set(userId, Date.now());
  return { ok: true, messageId: msg && msg.message ? Number(msg.message.id) : null, ref: inviteRef(inst.id), nextInSec: INVITE_GAP_MS / 1000 };
}

/* ====================================================================
   ประกาศ (ไม่ซ้ำ: UNIQUE ต่อบอสต่อชนิด)
   ==================================================================== */
const ANN_TH = {
  spawn: (b) => `World Boss ปรากฏตัว! ${b.nameEn} Lv.${b.level} — เข้าร่วมโจมตีได้เลย`,
  phase2: (b) => `${b.nameEn} เข้าสู่ Phase 2 (คลั่ง) — ${b.shieldTh}ปรากฏ ช่วยกันตอบเพื่อทำลายโล่`,
  shield_broken: (b) => `ทีมทำลาย${b.shieldTh}สำเร็จ! ${b.nameEn} มึนงง — ดาเมจทุกคน +30%`,
  phase3: (b) => `${b.nameEn} เข้าสู่ร่างสุดท้าย (Final Stand)!`,
  hp10: (b) => `${b.nameEn} HP เหลือต่ำกว่า 10% — อีกนิดเดียว!`,
  defeated: (b) => `World Boss ${b.nameEn} Lv.${b.level} ถูกล้มแล้ว! ผู้ร่วมต่อสู้ ${b.participants} คน — รับรางวัลได้ในหน้า Raid`,
  next: (b) => `บอสตัวถัดไปกำลังมา — ปรากฏตัวเวลา ${b.nextSpawnAt ? new Date(b.nextSpawnAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : 'เร็ว ๆ นี้'} น.`,
};
async function announce(inst, kind, s) {
  if (!inst || !ANN_TH[kind]) return null;
  s = s || await getSettings();
  const b = publicState(inst, s);
  const payload = { kind, level: inst.level, family: inst.family, text: ANN_TH[kind](b), nextSpawnAt: b.nextSpawnAt };
  const r = await pool.query('INSERT INTO raid_announcements (instance_id, kind, payload) VALUES ($1, $2, $3) ON CONFLICT (instance_id, kind) DO NOTHING RETURNING id, created_at', [inst.id, kind, JSON.stringify(payload)]);
  if (!r.rows[0]) return null;
  const msg = { id: Number(r.rows[0].id), ...payload, at: iso(r.rows[0].created_at) };
  publish('announce', msg);
  localAnnounce(msg);
  return msg;
}
async function announcements(limit = 6) {
  const { rows } = await pool.query("SELECT id, payload, created_at FROM raid_announcements WHERE created_at > NOW() - interval '1 day' ORDER BY id DESC LIMIT $1", [limit]);
  return rows.map((r) => ({ id: Number(r.id), ...r.payload, at: iso(r.created_at) }));
}

/* ====================================================================
   Realtime: subscribers ในเครื่องนี้ · รวมชุดทุก 300ms · หลายเครื่องผ่าน NOTIFY eq_raid
   ==================================================================== */
const subs = new Map();   // userId -> จำนวนแท็บที่เปิดหน้า Raid
const pending = { state: null, hits: [], timer: null };
const FLUSH_MS = 300;
function emitState(inst, s, hit = null) {
  const st = publicState(inst, s);
  publish('state', { state: st, hit });
  queueLocal(st, hit);
}
function queueLocal(st, hit) {
  if (!pending.state || (st && st.v >= pending.state.v) || (st && st.id !== pending.state.id)) pending.state = st;
  if (hit) { pending.hits.push(hit); if (pending.hits.length > 20) pending.hits.shift(); }
  if (!pending.timer) pending.timer = setTimeout(flush, FLUSH_MS);
}
/* v1.27.1 HP สดสำหรับทุกคนที่ออนไลน์ (การ์ดหน้าแรก · การ์ดชวนตีบอสในแชทโลก) — ข้อมูลบอสสาธารณะเท่านั้น · ไม่เกินทุก 2 วินาที */
const hpAll = { last: 0, timer: null, st: null };
const HP_ALL_MS = 2000;
function liveOf(st) { return st ? { id: st.id, level: st.level, status: st.status, hp: st.hp, maxHp: st.maxHp, phase: st.phase, participants: st.participants, online: st.online } : null; }
function hpAllFlush() {
  hpAll.timer = null;
  if (!hpAll.st) return;
  hpAll.last = Date.now();
  const live = liveOf(hpAll.st); hpAll.st = null;
  metrics.hpBroadcasts = (metrics.hpBroadcasts || 0) + 1;
  realtime.broadcastAll('raid:hp', { boss: live });
}
function queueHpAll(st) {
  if (!st) return;
  if (!hpAll.st || st.id !== hpAll.st.id || (st.v || 0) >= (hpAll.st.v || 0)) hpAll.st = st;
  if (hpAll.timer) return;
  hpAll.timer = setTimeout(hpAllFlush, Math.max(0, HP_ALL_MS - (Date.now() - hpAll.last)));
}
function flush() {
  pending.timer = null;
  const st = pending.state; const hits = pending.hits.splice(0, 8);
  pending.state = null; pending.hits = [];
  queueHpAll(st);
  if (!subs.size) return;
  metrics.broadcasts += 1;
  for (const uid of subs.keys()) realtime.sendToUser(uid, 'raid:state', { state: st, hits });
}
function localAnnounce(msg) {
  for (const uid of realtime.getOnlineUserIds()) realtime.sendToUser(uid, 'raid:announce', { announce: msg });
}
const bus = { client: null, ready: false, stopped: false };
async function initBus() {
  if (bus.client || bus.stopped) return;
  try {
    const c = await pool.connect();
    bus.client = c;
    c.on('notification', (n) => {
      if (n.channel !== 'eq_raid') return;
      let d; try { d = JSON.parse(n.payload); } catch (_) { return; }
      if (!d || d.o === INSTANCE) return;
      metrics.busIn += 1;
      if (d.t === 'state') queueLocal(d.p.state, d.p.hit);
      else if (d.t === 'announce') localAnnounce(d.p);
      else if (d.t === 'presence' && Array.isArray(d.p.users)) remotePresence.set(d.o, { users: d.p.users.slice(0, 5000), at: Date.now() });
    });
    c.on('error', () => { bus.ready = false; try { c.release(true); } catch (_) { /* - */ } bus.client = null; if (!bus.stopped) setTimeout(initBus, 5000).unref(); });
    await c.query('LISTEN eq_raid');
    bus.ready = true;
  } catch (err) {
    console.error('[raid/bus]', err.message);
    bus.client = null; if (!bus.stopped) setTimeout(initBus, 10000).unref();
  }
}
function publish(t, p) {
  if (!bus.ready) return;
  const body = JSON.stringify({ o: INSTANCE, t, p });
  if (body.length > 7500) return;
  metrics.busOut += 1;
  pool.query('SELECT pg_notify($1, $2)', ['eq_raid', body]).catch(() => {});
}
function onSocketMessage(socket, msg) {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('raid:')) return false;
  const uid = socket.userId;
  if (!uid) return true;
  if (msg.type === 'raid:sub' && !socket.raidSub) { socket.raidSub = true; subs.set(uid, (subs.get(uid) || 0) + 1); presenceChanged(); lightState().then((st) => realtime.sendToUser(uid, 'raid:state', { state: st.boss, hits: [] })).catch(() => {}); }
  else if (msg.type === 'raid:unsub' && socket.raidSub) { socket.raidSub = false; dropSub(uid); }
  return true;
}
function onSocketClose(uid, socket) { if (socket && socket.raidSub) { socket.raidSub = false; dropSub(uid); } }
function dropSub(uid) { const n = (subs.get(uid) || 1) - 1; if (n <= 0) subs.delete(uid); else subs.set(uid, n); presenceChanged(); }
/* v1.27.1 คนที่อยู่ในหน้า Raid ตอนนี้ = เปิดหน้า Raid ผ่าน WebSocket (raid:sub) + หน้า Raid ที่ใช้ Polling (เห็นภายใน 15 วินาทีล่าสุด) · นับคนไม่ซ้ำ
   (นับในเครื่องเซิร์ฟเวอร์นี้ · หลายเครื่อง = รวมผ่าน NOTIFY eq_raid) */
const pollSeen = new Map();   // userId -> เวลาล่าสุดที่หน้า Raid ดึงสถานะแบบ Polling
const remotePresence = new Map();   // instance อื่น -> { users: [], at }
function presentIds() {
  const now = Date.now(); const ids = new Set(subs.keys());
  for (const [u, t] of pollSeen) { if (now - t < 15000) ids.add(u); else pollSeen.delete(u); }
  for (const [k, r] of remotePresence) { if (now - r.at < 30000) r.users.forEach((u) => ids.add(u)); else remotePresence.delete(k); }
  return ids;
}
function presentCount() { return presentIds().size; }
function presentIdsLocal() { const now = Date.now(); const ids = new Set(subs.keys()); for (const [u, t] of pollSeen) if (now - t < 15000) ids.add(u); return ids; }
function markPolling(uid) { const had = pollSeen.has(uid); pollSeen.set(uid, Date.now()); if (!had) presenceChanged(); }
let presenceTimer = null;
function presenceChanged() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(async () => {
    presenceTimer = null;
    publish('presence', { users: [...presentIdsLocal()] });
    try { const s = await getSettings(); const inst = await current(); if (inst) queueLocal(publicState(inst, s), null); } catch (_) { /* - */ }
  }, 1000);
}

/* ====================================================================
   ติดตามการทำงาน (ผู้ดูแลดูได้)
   ==================================================================== */
const metrics = { since: Date.now(), answers: 0, rounds: 0, errors: 0, flagged: 0, broadcasts: 0, busIn: 0, busOut: 0, latency: [] };
function metricsView() {
  const lat = [...metrics.latency].sort((a, b) => a - b);
  const p = (x) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * x))] : null);
  const mem = process.memoryUsage();
  return { instance: INSTANCE, uptimeMin: Math.round((Date.now() - metrics.since) / 60000), answers: metrics.answers, rounds: metrics.rounds, errors: metrics.errors, flagged: metrics.flagged,
    broadcasts: metrics.broadcasts, busIn: metrics.busIn, busOut: metrics.busOut, busReady: bus.ready, subscribers: subs.size, onlineUsers: realtime.getOnlineCount(),
    answerLatencyMs: { p50: p(0.5), p95: p(0.95), max: lat.length ? lat[lat.length - 1] : null }, memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) } };
}

/* ====================================================================
   เริ่มระบบ
   ==================================================================== */
let tickTimer = null;
function init() {
  realtime.registerMessageHandler(onSocketMessage);
  realtime.registerDisconnectHandler(onSocketClose);
  initBus();
  tick().catch(() => {});
  let pres = 0;
  tickTimer = setInterval(() => {
    tick().catch(() => {});
    pres += 1; if (pres % 6 === 0 && (subs.size || pollSeen.size)) publish('presence', { users: [...presentIdsLocal()] });   // ต่ออายุให้เครื่องอื่นทุก ~18 วินาที
  }, 3000);
  tickTimer.unref();
  // รอบที่ค้าง (ปิดแท็บกลางคัน) → หมดอายุ
  setInterval(() => pool.query("UPDATE raid_attempts SET status = 'expired', finished_at = NOW() WHERE status = 'open' AND expires_at < NOW()").catch(() => {}), 60000).unref();
}
function stop() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; if (hpAll.timer) clearTimeout(hpAll.timer); hpAll.timer = null; bus.stopped = true; if (bus.client) { try { bus.client.release(true); } catch (_) { /* - */ } bus.client = null; } }

module.exports = {
  RaidError, init, stop, tick, getSettings, sanitizeSettings, current, publicState, displayOf, famOf, skinOf, computeHp, spawnLevel, settle,
  state, lightState, startRound, invite, markPolling, presentCount, answer, nextQuestion, roundSummary, openRound, leaderboard, rewardsList, claim, trophies, setTitle, announcements, announce,
  computeDamage, metricsView, rewardName, emitState, cefrOf, INSTANCE,
  _subs: subs, _metrics: metrics, _onSocket: onSocketMessage, _onClose: onSocketClose, _resetCache: () => { settingsCache = null; }, _sanitize: sanitizeSettings,
};
