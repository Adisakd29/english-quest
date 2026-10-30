/*
  แคตตาล็อกของตกแต่ง — แหล่งจริงคือตาราง avatar_items (ราคาที่ใช้ตอนซื้ออ่านจาก DB เท่านั้น)
  data/avatar/catalog.json (สร้างจาก scripts/avatar/build-assets.js) ถูกนำเข้าแบบ idempotent ตอนเปิดเซิร์ฟเวอร์
  แถวที่ผู้ดูแลแก้แล้ว (admin_override) ไฟล์จะไม่ทับ
*/
const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { colorInfo } = require('../../config/avatarColors');

const FILE = path.join(__dirname, '..', '..', 'data', 'avatar', 'catalog.json');
const MODELS = path.join(__dirname, '..', '..', 'data', 'avatar', 'models.json');   // 3D asset manifest (scripts/avatar3d/optimize.mjs)
const SLOTS = ['body', 'face', 'hair', 'top', 'bottom', 'outerwear', 'shoes', 'hat', 'glasses', 'headphones', 'back', 'accessory', 'effect', 'background'];
const REQUIRED_SLOTS = ['body', 'face', 'hair'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));

function readFile() { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
let modelsCache = null;
function readModels() {
  if (!modelsCache) modelsCache = fs.existsSync(MODELS) ? JSON.parse(fs.readFileSync(MODELS, 'utf8')) : { base: null, models: [] };
  return modelsCache;
}
/** ข้อมูล 3D ของ item (เก็บใน avatar_items.model) */
const modelOf = (m) => ({ kind: m.kind || 'glb', glbUrl: m.glbUrl, thumbnailUrl: m.thumbnailUrl, asset: m.asset, fileSize: m.fileSize, version: m.version,
  compatibleBaseVersion: m.compatibleBaseVersion, attach: m.attach, triangles: m.triangles, masks: m.masks || [],
  ...(m.compat ? { compat: m.compat } : {}), ...(m.clip ? { clip: m.clip } : {}), ...(m.validation ? { validation: m.validation } : {}), active: m.active !== false });

/** นำเข้า/อัปเดตแคตตาล็อกจากไฟล์ (ใช้ client เดิมได้ — เช่นใน migration) */
async function syncCatalog(db = pool, { log = null } = {}) {
  const data = readFile();
  let n = 0;
  for (const it of data.items) {
    const front = it.parts.find((p) => p.kind === 'front') || it.parts[0];
    const r = await db.query(
      `INSERT INTO avatar_items (id, name, name_th, category, rarity, price, asset_url, thumbnail_url, parts, layer, z_index,
         is_starter, is_purchasable, is_featured, is_achievement_reward, achievement_id, event_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$4,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_th = EXCLUDED.name_th, category = EXCLUDED.category,
         rarity = EXCLUDED.rarity, price = EXCLUDED.price, asset_url = EXCLUDED.asset_url, thumbnail_url = EXCLUDED.thumbnail_url,
         parts = EXCLUDED.parts, layer = EXCLUDED.layer, z_index = EXCLUDED.z_index, is_starter = EXCLUDED.is_starter,
         is_purchasable = EXCLUDED.is_purchasable, is_featured = EXCLUDED.is_featured, is_achievement_reward = EXCLUDED.is_achievement_reward,
         achievement_id = EXCLUDED.achievement_id, event_id = EXCLUDED.event_id, sort_order = EXCLUDED.sort_order, updated_at = NOW()
       WHERE NOT avatar_items.admin_override
         AND (avatar_items.parts IS DISTINCT FROM EXCLUDED.parts OR avatar_items.price <> EXCLUDED.price OR avatar_items.name <> EXCLUDED.name
              OR avatar_items.thumbnail_url IS DISTINCT FROM EXCLUDED.thumbnail_url OR avatar_items.sort_order <> EXCLUDED.sort_order
              OR avatar_items.is_purchasable <> EXCLUDED.is_purchasable OR avatar_items.rarity <> EXCLUDED.rarity
              OR avatar_items.is_featured <> EXCLUDED.is_featured OR avatar_items.name_th IS DISTINCT FROM EXCLUDED.name_th)
       RETURNING id`,
      [it.id, it.name, it.nameTh, it.slot, it.rarity, it.price, front ? front.url : null, it.thumbnailUrl, JSON.stringify(it.parts),
        front ? front.z : 0, it.starter, it.purchasable, it.featured, Boolean(it.achievementId), it.achievementId, it.eventId, it.sortOrder]);
    n += r.rowCount;
  }
  // 3D: ใส่/ล้างข้อมูลโมเดลตาม manifest
  const man = readModels();
  const ids = new Set();
  for (const m of man.models || []) {
    ids.add(m.itemId);
    const r = await db.query('UPDATE avatar_items SET model = $2::jsonb, updated_at = NOW() WHERE id = $1 AND model IS DISTINCT FROM $2::jsonb', [m.itemId, JSON.stringify(modelOf(m))]);
    n += r.rowCount;
  }
  await db.query('UPDATE avatar_items SET model = NULL WHERE model IS NOT NULL AND NOT (id = ANY($1::text[]))', [[...ids]]);
  invalidate();
  if (log) log(`[avatar] catalog: ${data.items.length} items · 3D ${ids.size} (${n} inserted/updated)`);
  return { total: data.items.length, changed: n };
}

let cache = null;
let cacheAt = 0;
function invalidate() { cache = null; }

const toItem = (r) => ({
  id: r.id, slot: r.category, name: r.name, nameTh: r.name_th, rarity: r.rarity, price: r.price,
  parts: r.parts, thumbnailUrl: r.thumbnail_url, starter: r.is_starter, purchasable: r.is_purchasable && !r.is_achievement_reward && !r.is_starter,
  featured: r.is_featured, achievementId: r.achievement_id, eventId: r.event_id, active: r.is_active, sortOrder: r.sort_order,
  genderNeutral: r.gender_neutral, model: r.model || null,
});

/** แคตตาล็อกทั้งหมด (cache 60 วินาที) -> { list, byId } */
async function getCatalog() {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  const { rows } = await pool.query('SELECT * FROM avatar_items ORDER BY sort_order, id');
  // คอลเลกชัน/ธีม (มาจาก catalog.json — ไม่ต้องมีคอลัมน์ใน DB)
  let colOf = {}; let collections = [];
  try { const f = readFile(); colOf = Object.fromEntries(f.items.map((x) => [x.id, x.collection || null])); collections = f.collections || []; } catch (_) { /* ไฟล์หาย = ไม่มีคอลเลกชัน */ }
  // ระบบเปลี่ยนสี: Material Region จาก manifest 3D + กติกา (config/avatarColors.js)
  const regionsOf = Object.fromEntries((readModels().models || []).map((m) => [m.itemId, m.regions || {}]));
  const list = rows.map((r) => { const it = toItem(r); return { ...it, collection: colOf[r.id] || null, color: colorInfo(it, regionsOf[r.id]) }; });
  cache = { collections, list, byId: Object.fromEntries(list.map((x) => [x.id, x])), version: rows.reduce((a, r) => Math.max(a, new Date(r.updated_at).getTime()), 0) };
  cacheAt = Date.now();
  return cache;
}

module.exports = { readModels, SLOTS, REQUIRED_SLOTS, RARITIES, RARITY_RANK, syncCatalog, getCatalog, invalidate, toItem, readFile };
