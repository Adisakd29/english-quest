/*
  Privacy + Public Profile (v1.8.0) — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทีละ field
  ผู้ชม = req.userId จาก token เท่านั้น · เจ้าของ = userId ใน URL (อ่านได้เฉพาะที่เจ้าของอนุญาต)
  relation: 'self' | 'friend' | 'other'  · บล็อก (ทิศใดก็ได้) = ไม่เห็นข้อมูลใด ๆ
  ข้อมูลที่ไม่ส่งเลย: email · รูป/ชื่อจาก Google · รายการ Coin · ประวัติคำตอบรายข้อ · เวลาออนไลน์ (ยกเว้นระบบเพื่อนเดิม)
*/
const pool = require('../config/db');
const { LEVELS, FIELDS, FLAGS } = require('../config/privacy');
const { getLevelInfo } = require('../utils/leveling');
const { LEAGUE_BY_ID } = require('../config/leagues');

class PrivacyError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

async function getSettings(userId, db = pool) {
  const { rows } = await db.query('SELECT * FROM user_privacy_settings WHERE user_id = $1', [userId]);
  const r = rows[0] || {};
  const out = {};
  for (const [k, f] of Object.entries(FIELDS)) out[k] = r[f.col] || f.def;
  for (const [k, f] of Object.entries(FLAGS)) out[k] = r[f.col] === undefined || r[f.col] === null ? f.def : r[f.col];
  return out;
}

/** Update Privacy Settings — เจ้าของบัญชีเท่านั้น (userId จาก token) · รับเฉพาะ field ที่รู้จัก */
async function updateSettings(userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new PrivacyError('BAD_BODY', 'ข้อมูลไม่ถูกต้อง');
  const cur = await getSettings(userId);
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (FIELDS[k]) {
      if (!LEVELS.includes(v)) throw new PrivacyError('BAD_LEVEL', `ค่า ${k} ต้องเป็น private / friends / public`);
      next[k] = v;
    } else if (FLAGS[k]) {
      if (typeof v !== 'boolean') throw new PrivacyError('BAD_FLAG', `ค่า ${k} ต้องเป็น true/false`);
      next[k] = v;
    } else throw new PrivacyError('UNKNOWN_FIELD', `ไม่รู้จักการตั้งค่า ${k}`);
  }
  const cols = [...Object.entries(FIELDS).map(([k, f]) => [f.col, next[k]]), ...Object.entries(FLAGS).map(([k, f]) => [f.col, next[k]])];
  await pool.query(
    `INSERT INTO user_privacy_settings (user_id, ${cols.map((c) => c[0]).join(', ')}, updated_at)
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c[0]} = EXCLUDED.${c[0]}`).join(', ')}, updated_at = NOW()`,
    [userId, ...cols.map((c) => c[1])]);
  return next;
}

async function relationOf(viewerId, ownerId) {
  if (viewerId === ownerId) return { relation: 'self', blockedByMe: false, blockedMe: false, friendship: null };
  const [b, f] = await Promise.all([
    pool.query('SELECT blocker_id FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [viewerId, ownerId]),
    pool.query(`SELECT id, status, requester_id FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`, [viewerId, ownerId]),
  ]);
  const fr = f.rows[0] || null;
  return {
    relation: fr && fr.status === 'accepted' ? 'friend' : 'other',
    blockedByMe: b.rows.some((r) => r.blocker_id === viewerId), blockedMe: b.rows.some((r) => r.blocker_id === ownerId),
    friendship: fr ? { id: fr.id, status: fr.status, outgoing: fr.requester_id === viewerId } : null,
  };
}
/** ผู้ชมระดับ relation เห็น field ที่ตั้งค่า level ได้ไหม */
function allowed(level, relation) {
  if (relation === 'self') return true;
  if (level === 'public') return true;
  if (level === 'friends') return relation === 'friend';
  return false;
}

// ---------- ตัวอ่านข้อมูลแต่ละ field (เรียกเฉพาะ field ที่ได้รับอนุญาต — ข้อมูลที่ไม่อนุญาตไม่ถูกอ่านเลย) ----------
const READERS = {
  level: async (u) => { const l = getLevelInfo(u.exp || 0); return { level: l.level }; },
  rank: async (u) => {
    const { rows } = await pool.query(`SELECT mode, league, division_index FROM ranked_profiles WHERE user_id = $1
      AND season_id = (SELECT MAX(season_id) FROM ranked_profiles WHERE user_id = $1)`, [u.id]);
    return rows.map((r) => { const L = LEAGUE_BY_ID[r.league]; return { mode: r.mode, league: r.league, label: L ? `${L.name} ${L.divisions[r.division_index] || ''}`.trim() : r.league }; });
  },
  achievements: async (u) => {
    const list = await require('./avatar/achievements').list(u.id);
    return { unlocked: list.filter((a) => a.unlocked).map((a) => ({ id: a.id, name: a.name, nameTh: a.nameTh, icon: a.icon })), total: list.length };
  },
  stats: async (u) => {
    const r = (await pool.query(`SELECT COUNT(*)::int AS answers, COUNT(*) FILTER (WHERE correct)::int AS correct,
        COUNT(DISTINCT (created_at AT TIME ZONE 'Asia/Bangkok')::date)::int AS days
        FROM answer_events WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`, [u.id])).rows[0];
    return { answers30d: r.answers, accuracy30d: r.answers ? Math.round((r.correct / r.answers) * 100) : null, activeDays30d: r.days };
  },
  vocab: async (u) => {
    const r = (await pool.query("SELECT COUNT(*) FILTER (WHERE status = 'known')::int AS known, COUNT(*)::int AS seen FROM word_progress WHERE user_id = $1", [u.id])).rows[0];
    return { knownWords: r.known, wordsSeen: r.seen };
  },
  grammar: async (u) => {
    const r = (await pool.query('SELECT COUNT(*) FILTER (WHERE mastered_at IS NOT NULL)::int AS mastered, COUNT(*) FILTER (WHERE completed_at IS NOT NULL OR lesson_completed_at IS NOT NULL)::int AS done FROM grammar_lessons WHERE user_id = $1', [u.id])).rows[0];
    return { masteredTopics: r.mastered, completedLessons: r.done };
  },
  toeic: async (u) => {
    const r = (await pool.query('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_correct)::int AS ok FROM toeic_answers WHERE user_id = $1', [u.id])).rows[0];
    return { answered: r.n, correct: r.ok, accuracy: r.n ? Math.round((r.ok / r.n) * 100) : null };
  },
  avatar: async (u) => {
    const AV = require('./avatar');
    const { rows } = await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [u.id]);
    const outfit = rows[0] ? Object.fromEntries(AV.SLOTS.map((s) => [s, rows[0][`${s}_item_id`]]).filter(([, v]) => v)) : AV.defaultOutfit(u.id);
    return { outfit };
  },
  coins: async (u) => ({ balance: (await require('./coins').wallet(u.id)).balance }),   // ยอดเท่านั้น (ไม่ส่งรายการ)
  inventory: async (u) => {
    const { rows } = await pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1 ORDER BY acquired_at DESC LIMIT 200', [u.id]);
    return { count: rows.length, items: rows.map((r) => r.item_id) };
  },
  friends: async (u) => {
    const { rows } = await pool.query(`SELECT x.id, x.username FROM friendships f JOIN users x ON x.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted' ORDER BY x.username LIMIT 100`, [u.id]);
    return { count: rows.length, list: rows };
  },
};

/** Get Public Profile — คืนเฉพาะ field ที่ผู้ชมมีสิทธิ์ (ที่เหลือบอกแค่ว่า "ซ่อน") */
async function getProfile(viewerId, ownerId) {
  const id = Number(ownerId);
  if (!Number.isInteger(id) || id <= 0) throw new PrivacyError('NOT_FOUND', 'ไม่พบผู้ใช้', 404);
  const u = (await pool.query('SELECT id, username, exp, avatar, avatar_image FROM users WHERE id = $1', [id])).rows[0];
  if (!u) throw new PrivacyError('NOT_FOUND', 'ไม่พบผู้ใช้', 404);
  const rel = await relationOf(viewerId, id);
  // ถูกเจ้าของบล็อก: ทำเหมือนไม่พบผู้ใช้ (ไม่เปิดเผยว่าถูกบล็อก)
  if (rel.blockedMe) throw new PrivacyError('NOT_FOUND', 'ไม่พบผู้ใช้', 404);
  const settings = await getSettings(id);
  const look = (await require('./avatar').looks([id]))[id] || { enabled: false };
  // รูปที่แสดง: ตามที่เจ้าของเลือก (รูปโปรไฟล์เดิม หรือ Avatar) — เหมือนที่เห็นใน Leaderboard อยู่แล้ว
  const picture = { avatar: u.avatar || 'fox', avatarImage: u.avatar_image || null, useAvatar: Boolean(look.enabled), look: look.enabled ? look : null };
  const base = { id: u.id, username: u.username, picture, relation: rel.relation, isSelf: rel.relation === 'self', blockedByMe: rel.blockedByMe };
  const actions = rel.relation === 'self' ? {} : {
    addFriend: !rel.blockedByMe && !rel.friendship && settings.allowFriendRequests,
    friendRequestsClosed: !rel.friendship && !settings.allowFriendRequests,
    cancelRequest: Boolean(rel.friendship && rel.friendship.status === 'pending' && rel.friendship.outgoing),
    acceptRequest: Boolean(rel.friendship && rel.friendship.status === 'pending' && !rel.friendship.outgoing),
    removeFriend: rel.relation === 'friend', block: !rel.blockedByMe, unblock: rel.blockedByMe,
    friendshipId: rel.friendship ? rel.friendship.id : null,
  };
  if (rel.blockedByMe) return { ...base, private: true, blocked: true, fields: {}, hidden: Object.keys(FIELDS).filter((k) => k !== 'profile'), actions };
  if (!allowed(settings.profile, rel.relation)) {
    return { ...base, private: true, fields: {}, hidden: Object.keys(FIELDS).filter((k) => k !== 'profile'), actions };
  }
  const fields = {}; const hidden = [];
  for (const k of Object.keys(FIELDS)) {
    if (k === 'profile') continue;
    if (allowed(settings[k], rel.relation)) fields[k] = await READERS[k](u); else hidden.push(k);
  }
  return { ...base, private: false, fields, hidden, actions, ...(rel.relation === 'self' ? { settings } : {}) };
}

module.exports = { PrivacyError, getSettings, updateSettings, relationOf, allowed, getProfile, FIELDS, FLAGS, LEVELS };
