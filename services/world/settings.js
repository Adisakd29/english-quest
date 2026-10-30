/*
  EnglishQuest World — การตั้งค่าความเป็นส่วนตัวของ Lobby (ต่อบัญชี) · ไม่มีแถว = ค่าเริ่มต้นแบบนักเรียน (config/world.js)
  "ให้ดูโปรไฟล์" ใช้ค่า profile ของ Privacy Settings เดิม (ไม่สร้างค่าซ้ำ)
*/
const pool = require('../../config/db');
const { SETTINGS } = require('../../config/world');
const PV = require('../privacy');

class WorldError extends Error {
  constructor(code, message, status = 400, extra = {}) { super(message); this.code = code; this.status = status; Object.assign(this, extra); }
}

async function get(userId, db = pool) {
  const { rows } = await db.query('SELECT * FROM user_world_settings WHERE user_id = $1', [userId]);
  const r = rows[0] || {};
  const out = {};
  for (const [k, f] of Object.entries(SETTINGS)) out[k] = r[f.col] === undefined || r[f.col] === null ? f.def : r[f.col];
  return out;
}

async function getMany(ids) {
  if (!ids.length) return {};
  const { rows } = await pool.query('SELECT * FROM user_world_settings WHERE user_id = ANY($1)', [ids]);
  const by = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  const out = {};
  for (const id of ids) {
    const r = by[id] || {};
    out[id] = Object.fromEntries(Object.entries(SETTINGS).map(([k, f]) => [k, r[f.col] === undefined || r[f.col] === null ? f.def : r[f.col]]));
  }
  return out;
}

/** อัปเดต (เจ้าของบัญชีเท่านั้น) · รับเฉพาะ key ที่รู้จัก · profileView → Privacy Settings เดิม (field profile) */
async function update(userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new WorldError('BAD_BODY', 'ข้อมูลไม่ถูกต้อง');
  const cur = await get(userId);
  const next = { ...cur };
  let profile = null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'profileView') {
      if (!['private', 'friends', 'public'].includes(v)) throw new WorldError('BAD_VALUE', 'ค่าการดูโปรไฟล์ไม่ถูกต้อง');
      profile = v; continue;
    }
    const f = SETTINGS[k];
    if (!f) throw new WorldError('UNKNOWN_FIELD', `ไม่รู้จักการตั้งค่า ${k}`);
    if (f.type === 'bool') { if (typeof v !== 'boolean') throw new WorldError('BAD_VALUE', `ค่า ${k} ต้องเป็น true/false`); } else if (!f.type.includes(v)) throw new WorldError('BAD_VALUE', `ค่า ${k} ไม่ถูกต้อง`);
    next[k] = v;
  }
  const cols = Object.entries(SETTINGS).map(([k, f]) => [f.col, next[k]]);
  await pool.query(
    `INSERT INTO user_world_settings (user_id, ${cols.map((c) => c[0]).join(', ')}, updated_at) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c[0]} = EXCLUDED.${c[0]}`).join(', ')}, updated_at = NOW()`,
    [userId, ...cols.map((c) => c[1])]);
  if (profile) await PV.updateSettings(userId, { profile });
  return { ...next, profileView: profile || (await PV.getSettings(userId)).profile };
}

async function view(userId) {
  return { ...(await get(userId)), profileView: (await PV.getSettings(userId)).profile };
}

module.exports = { WorldError, get, getMany, update, view };
