/*
  Avatar: ของที่มี (inventory) · ชุดที่สวม · ร้านค้า · Outfit presets
  ความปลอดภัย: ทุกอย่างตรวจฝั่งเซิร์ฟเวอร์ — ผู้ใช้ต้องล็อกอิน · ต้องเป็นเจ้าของของที่สวม · ราคาอ่านจาก DB · ยอดพอ · ซื้อซ้ำไม่ได้
  การซื้อทำใน transaction เดียว (หัก Coin + บันทึก transaction + เพิ่มของ) — พังตรงไหนย้อนทั้งหมด
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const coins = require('../coins');
const { SLOTS, REQUIRED_SLOTS, getCatalog } = require('./catalog');
const { HEX, ROLES } = require('../../config/avatarColors');

class AvatarError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const col = (slot) => `${slot}_item_id`;

/** ชุดเริ่มต้นแบบคงที่ตาม user id (ทุกคนหน้าตาไม่ซ้ำกันตั้งแต่แรก · ใช้ของ starter เท่านั้น) */
function defaultOutfit(userId) {
  const h = Math.abs(Number(userId) || 0);
  const pick = (arr, salt) => arr[(h * 7 + salt * 13 + Math.floor(h / 3)) % arr.length];
  return {
    body: pick(['body_light', 'body_warm', 'body_tan', 'body_deep'], 1),
    face: pick(['face_smile', 'face_happy', 'face_cool', 'face_focused'], 2),
    hair: pick(['hair_crop', 'hair_sidepart', 'hair_bob'], 3),
    top: pick(['top_tee_blue', 'top_polo_green', 'top_hoodie_gray'], 4),
    bottom: pick(['bottom_jeans', 'bottom_skirt_pleated'], 5),
    shoes: pick(['shoes_sneaker_white', 'shoes_canvas_black'], 6),
    background: 'bg_sky',
    outerwear: null, hat: null, glasses: null, headphones: null, back: null, accessory: null, effect: null,
  };
}

/** สร้างกระเป๋า (+Coin ต้อนรับครั้งเดียว) · ของเริ่มต้น · ชุดเริ่มต้น — idempotent ทุกขั้น */
async function ensureUser(userId, db = pool) {
  await coins.ensureWallet(db, userId);
  await db.query(
    `INSERT INTO user_inventory (user_id, item_id, acquisition_type)
     SELECT $1, id, 'starter' FROM avatar_items WHERE is_starter ON CONFLICT DO NOTHING`, [userId]);
  const has = await db.query('SELECT 1 FROM user_avatar WHERE user_id = $1', [userId]);
  if (!has.rows[0]) {
    // Avatar เริ่มต้น "ปิดการแสดง" เสมอ (avatar_enabled = FALSE) — รูปโปรไฟล์ของบัญชีไม่เปลี่ยน · ไม่อ่าน/เขียนตาราง users
    const o = defaultOutfit(userId);
    await db.query(
      `INSERT INTO user_avatar (user_id, ${SLOTS.map(col).join(', ')}, display_mode, avatar_enabled)
       VALUES ($1, ${SLOTS.map((_, i) => `$${i + 2}`).join(', ')}, 'classic', FALSE) ON CONFLICT DO NOTHING`,
      [userId, ...SLOTS.map((s) => o[s] || null)]);
  }
}

/** แฮชของชุด (ใช้ตรวจว่า thumbnail ตรงกับชุดปัจจุบันหรือไม่) */
function outfitHash(outfit) {
  return crypto.createHash('sha1').update(SLOTS.map((s) => `${s}=${(outfit && outfit[s]) || ''}`).join('|')).digest('hex').slice(0, 12);
}
const thumbUrl = (userId, r) => (r && r.thumb_version > 0 && r.thumb_outfit_hash === outfitHash(rowToOutfit(r))
  ? `/api/avatar/thumb/${Number(userId)}?v=${r.thumb_version}` : null);

function rowToOutfit(r) { return Object.fromEntries(SLOTS.map((s) => [s, r ? r[col(s)] || null : null])); }

async function getMe(userId) {
  await ensureUser(userId);
  const [a, inv, w, u] = await Promise.all([
    pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [userId]),
    pool.query('SELECT item_id, acquisition_type, acquired_at, last_equipped_at FROM user_inventory WHERE user_id = $1', [userId]),
    coins.wallet(userId),
    pool.query('SELECT avatar, avatar_image FROM users WHERE id = $1', [userId]),   // อ่านอย่างเดียว
  ]);
  const colors = await colorsOf(userId);
  const r = a.rows[0];
  return {
    outfit: rowToOutfit(r),
    avatarEnabled: r.avatar_enabled, displayPrefChosen: Boolean(r.display_pref_at), modelVersion: r.model_version,
    avatarThumbnail: thumbUrl(userId, r), outfitHash: outfitHash(rowToOutfit(r)),
    profilePhotoUrl: u.rows[0] ? u.rows[0].avatar_image || null : null, legacyAvatar: u.rows[0] ? u.rows[0].avatar : null,
    inventory: inv.rows.map((r) => ({ itemId: r.item_id, acquisition: r.acquisition_type, acquiredAt: r.acquired_at, lastEquippedAt: r.last_equipped_at })),
    wallet: w,
    colors,   // { itemId: { primary, secondary, accent, variant } } — เฉพาะชิ้นที่ผู้ใช้เปลี่ยนสีไว้
  };
}

// ---------------------------------------------------------------------------------------------
// สีเครื่องแต่งกาย (Material Color Variants) — config/avatarColors.js
// ---------------------------------------------------------------------------------------------
const rowColor = (r) => ({ primary: r.primary_color || null, secondary: r.secondary_color || null, accent: r.accent_color || null, variant: r.material_variant || null });
/** สีที่ผู้ใช้ตั้งไว้ (ทุกชิ้น หรือเฉพาะ itemIds) */
async function colorsOf(userId, itemIds = null, db = pool) {
  const q = itemIds
    ? await db.query('SELECT * FROM user_item_colors WHERE user_id = $1 AND item_id = ANY($2::text[])', [userId, itemIds])
    : await db.query('SELECT * FROM user_item_colors WHERE user_id = $1', [userId]);
  return Object.fromEntries(q.rows.map((r) => [r.item_id, rowColor(r)]));
}
/** ตรวจค่าสีของชิ้นหนึ่ง → { primary, secondary, accent, variant } (null = สีเดิมของชิ้น) · โยน AvatarError ถ้าไม่ถูกต้อง */
function cleanColor(item, c) {
  if (!item) throw new AvatarError('NO_ITEM', 'ไม่พบของชิ้นนี้');
  const info = item.color || {};
  if (!info.colorable) throw new AvatarError('NOT_COLORABLE', `${item.nameTh || item.name} เปลี่ยนสีไม่ได้`);
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new AvatarError('BAD_COLOR', 'ข้อมูลสีไม่ถูกต้อง');
  const out = { primary: null, secondary: null, accent: null, variant: null };
  for (const role of ROLES) {
    const v = c[role];
    if (v === undefined || v === null || v === '') continue;
    if (!info.regions[role]) throw new AvatarError('BAD_REGION', `ชิ้นนี้ไม่มีส่วน ${role} ให้เปลี่ยนสี`);
    const hex = String(v).toLowerCase();
    if (!HEX.test(hex)) throw new AvatarError('BAD_COLOR', 'รหัสสีต้องเป็น #RRGGBB');
    out[role] = hex === String(info.regions[role].default).toLowerCase() ? null : hex;
  }
  const vv = c.variant;
  if (vv !== undefined && vv !== null && vv !== '') {
    if (!info.variants.includes(vv)) throw new AvatarError('BAD_VARIANT', 'เลือกเนื้อผ้านี้กับชิ้นนี้ไม่ได้');
    out.variant = vv === info.variants[0] ? null : vv;   // ตัวแรก = เนื้อผ้าเดิมของชิ้น
  }
  return out;
}
const isDefault = (c) => !c.primary && !c.secondary && !c.accent && !c.variant;
async function writeColor(db, userId, itemId, c) {
  if (isDefault(c)) { await db.query('DELETE FROM user_item_colors WHERE user_id = $1 AND item_id = $2', [userId, itemId]); return; }
  await db.query(
    `INSERT INTO user_item_colors (user_id, item_id, primary_color, secondary_color, accent_color, material_variant) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, item_id) DO UPDATE SET primary_color = EXCLUDED.primary_color, secondary_color = EXCLUDED.secondary_color,
       accent_color = EXCLUDED.accent_color, material_variant = EXCLUDED.material_variant, updated_at = NOW()`,
    [userId, itemId, c.primary, c.secondary, c.accent, c.variant]);
}
/** ตั้งสีของชิ้นที่เป็นเจ้าของ (ไม่เสีย Coin · ไม่ต้องซื้อซ้ำ) */
async function setItemColor(userId, itemId, color) {
  await ensureUser(userId);
  const { byId } = await getCatalog();
  const item = byId[String(itemId || '')];
  const c = cleanColor(item, color);
  const own = await pool.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [userId, item.id]);
  if (!own.rows[0]) throw new AvatarError('NOT_OWNED', `ยังไม่มี ${item.nameTh || item.name} — ซื้อหรือปลดล็อกก่อน`, 403);
  await writeColor(pool, userId, item.id, c);
  // ภาพย่อ Avatar ของชุดที่สวมอยู่ต้องสร้างใหม่ (สีเปลี่ยน)
  const r = (await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [userId])).rows[0];
  const equipped = r && Object.values(rowToOutfit(r)).includes(item.id);
  if (equipped) await pool.query('UPDATE user_avatar SET thumb_outfit_hash = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
  invalidateLook(userId);
  return { itemId: item.id, color: c, equipped };
}
/** สีของชิ้นในชุด (สำหรับ Preset) — ตรวจทุกค่า · ตัดชิ้นที่ไม่ได้อยู่ในชุดทิ้ง */
function cleanColors(colors, outfit, byId) {
  const out = {};
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return out;
  const inOutfit = new Set(Object.values(outfit).filter(Boolean));
  for (const [id, c] of Object.entries(colors)) {
    if (!inOutfit.has(id) || !byId[id] || !(byId[id].color || {}).colorable) continue;
    const cc = cleanColor(byId[id], c);
    if (!isDefault(cc)) out[id] = cc;
  }
  return out;
}

/**
 * กติกาความเข้ากันได้ระหว่างชิ้น — คืน [{ slot, id, reason }] ของชิ้นใน outfit ที่ขัดกับ item
 *  1) หมวก ↔ หูฟัง (กติกาเดิม — ภาพ 2D ซ้อนกันไม่ได้)
 *  2) คู่ที่ตรวจเรขาคณิตจริงใน Blender แล้วชนกัน (model.compat: ผมหนาจนก้านหูฟังจม, ผ้าคลุมทับเสื้อคลุมหนา ฯลฯ)
 */
function conflictsWith(outfit, item, byId) {
  const out = [];
  if (!item) return out;
  if (item.slot === 'hat' && outfit.headphones) out.push({ slot: 'headphones', id: outfit.headphones, reason: 'ใส่หมวกพร้อมหูฟังไม่ได้' });
  if (item.slot === 'headphones' && outfit.hat) out.push({ slot: 'hat', id: outfit.hat, reason: 'ใส่หมวกพร้อมหูฟังไม่ได้' });
  const rules = (item.model && item.model.compat) || [];
  for (const r of rules) {
    const other = byId[r.with];
    if (other && outfit[other.slot] === r.with && other.slot !== item.slot) out.push({ slot: other.slot, id: r.with, reason: r.reason });
  }
  return out;
}

/** ตรวจชุด: ของมีจริง · ใส่ถูกช่อง · เป็นเจ้าของ · ช่องจำเป็นครบ · ไม่ใส่หมวกพร้อมหูฟัง */
async function validateOutfit(userId, outfit, db = pool) {
  if (!outfit || typeof outfit !== 'object' || Array.isArray(outfit)) throw new AvatarError('BAD_OUTFIT', 'ข้อมูลชุดไม่ถูกต้อง');
  const unknown = Object.keys(outfit).filter((k) => !SLOTS.includes(k));
  if (unknown.length) throw new AvatarError('BAD_SLOT', `ไม่มีช่อง ${unknown[0]}`);
  const { byId } = await getCatalog();
  const clean = {};
  for (const s of SLOTS) {
    const v = outfit[s];
    if (v === null || v === undefined || v === '') { clean[s] = null; continue; }
    if (typeof v !== 'string') throw new AvatarError('BAD_OUTFIT', 'ข้อมูลชุดไม่ถูกต้อง');
    const it = byId[v];
    if (!it) throw new AvatarError('NO_ITEM', 'ไม่พบของชิ้นนี้');
    if (it.slot !== s) throw new AvatarError('WRONG_SLOT', `${it.name} ใส่ช่องนี้ไม่ได้`);
    clean[s] = v;
  }
  const missing = REQUIRED_SLOTS.find((s) => !clean[s]);
  if (missing) throw new AvatarError('REQUIRED_SLOT', 'ต้องมีรูปร่าง ใบหน้า และทรงผมเสมอ');
  if (clean.hat && clean.headphones) throw new AvatarError('CONFLICT', 'ใส่หมวกพร้อมหูฟังไม่ได้ — เลือกอย่างใดอย่างหนึ่ง');
  for (const s of SLOTS) {
    const c = clean[s] && conflictsWith(clean, byId[clean[s]], byId)[0];
    if (c) throw new AvatarError('CONFLICT', `${byId[clean[s]].name} ใส่คู่กับ ${byId[c.id].name} ไม่ได้ — ${c.reason}`);
  }
  const ids = Object.values(clean).filter(Boolean);
  const own = await db.query('SELECT item_id FROM user_inventory WHERE user_id = $1 AND item_id = ANY($2::text[])', [userId, ids]);
  const owned = new Set(own.rows.map((r) => r.item_id));
  const notOwned = ids.find((id) => !owned.has(id));
  if (notOwned) throw new AvatarError('NOT_OWNED', `ยังไม่มี ${byId[notOwned].name} — ซื้อหรือปลดล็อกก่อน`, 403);
  return clean;
}

/** updateAvatar(): บันทึกชุด Avatar เท่านั้น — ไม่แตะรูปโปรไฟล์ และไม่เปลี่ยนการตั้งค่าการแสดงผล */
async function saveOutfit(userId, outfit) {
  await ensureUser(userId);
  const clean = await validateOutfit(userId, outfit);
  await pool.query(
    `UPDATE user_avatar SET ${SLOTS.map((s, i) => `${col(s)} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE user_id = $1`,
    [userId, ...SLOTS.map((s) => clean[s])]);
  await pool.query('UPDATE user_inventory SET last_equipped_at = NOW() WHERE user_id = $1 AND item_id = ANY($2::text[])',
    [userId, Object.values(clean).filter(Boolean)]);
  invalidateLook(userId);
  return clean;
}

/** equipAvatarItem(): สวม/ถอดทีละช่อง (ถอดของที่ขัดกันให้อัตโนมัติ: หมวก ↔ หูฟัง) */
async function equipItem(userId, slot, itemId) {
  if (!SLOTS.includes(slot)) throw new AvatarError('BAD_SLOT', 'ช่องไม่ถูกต้อง');
  await ensureUser(userId);
  const cur = rowToOutfit((await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [userId])).rows[0]);
  const next = { ...cur, [slot]: itemId || null };
  const removed = [];
  if (itemId) {
    const { byId } = await getCatalog();
    for (const c of conflictsWith(next, byId[itemId], byId)) {
      if (REQUIRED_SLOTS.includes(c.slot)) {
        // ช่องจำเป็น (ทรงผม) ถอดไม่ได้ -> เปลี่ยนเป็นทรงพื้นฐานที่เข้ากันได้ ถ้าไม่มีก็ปฏิเสธพร้อมเหตุผล
        const fb = c.slot === 'hair' ? 'hair_crop' : null;
        if (!fb || conflictsWith({ ...next, [c.slot]: fb }, byId[itemId], byId).length) throw new AvatarError('CONFLICT', `${byId[itemId].name} ใส่คู่กับ ${byId[c.id].name} ไม่ได้ — ${c.reason}`);
        removed.push(c.id); next[c.slot] = fb;
      } else { removed.push(c.id); next[c.slot] = null; }
    }
  }
  const outfit = await saveOutfit(userId, next);
  return { outfit, removed };
}

/** setProfileDisplayPreference(): เจ้าของบัญชีเลือกเองว่าจะให้คนอื่นเห็น "รูปโปรไฟล์เดิม" หรือ "Avatar" — ไม่แตะรูปโปรไฟล์ */
async function setDisplayPreference(userId, useAvatar) {
  if (typeof useAvatar !== 'boolean') throw new AvatarError('BAD_PREF', 'ค่าไม่ถูกต้อง');
  await ensureUser(userId);
  await pool.query(
    "UPDATE user_avatar SET avatar_enabled = $2, display_mode = $3, display_pref_at = NOW(), updated_at = NOW() WHERE user_id = $1",
    [userId, useAvatar, useAvatar ? 'character' : 'classic']);
  invalidateLook(userId);
  return useAvatar;
}

const THUMB_MAX = 80 * 1024;
const MAGIC = { 'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 };
/** บันทึก avatarThumbnail (portrait ที่หน้าเว็บ render จาก 3D viewer) ของตัวเองเท่านั้น */
async function saveThumbnail(userId, dataUrl, hash) {
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new AvatarError('BAD_IMAGE', 'รองรับ WebP / PNG / JPEG');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > THUMB_MAX) throw new AvatarError('TOO_BIG', 'ภาพใหญ่เกินไป', 413);
  if (!MAGIC[m[1]](buf)) throw new AvatarError('BAD_IMAGE', 'ไฟล์ภาพไม่ถูกต้อง');
  await ensureUser(userId);
  const r = await pool.query('SELECT * FROM user_avatar WHERE user_id = $1', [userId]);
  const cur = outfitHash(rowToOutfit(r.rows[0]));
  if (hash !== cur) throw new AvatarError('STALE', 'ชุดเปลี่ยนไปแล้ว — บันทึกชุดก่อน', 409);
  const up = await pool.query(
    `UPDATE user_avatar SET thumb = $2, thumb_mime = $3, thumb_version = thumb_version + 1, thumb_outfit_hash = $4 WHERE user_id = $1
     RETURNING thumb_version`, [userId, buf, m[1], cur]);
  invalidateLook(userId);
  return { url: `/api/avatar/thumb/${Number(userId)}?v=${up.rows[0].thumb_version}` };
}
async function getThumbnail(userId) {
  // เปิดเผยเฉพาะเมื่อเจ้าของเลือกใช้ Avatar เป็นรูปโปรไฟล์ (รูปนี้คือรูปประจำตัวสาธารณะของเขา) — ไม่งั้นเดา URL ก็ไม่ได้ภาพ
  const { rows } = await pool.query('SELECT thumb, thumb_mime FROM user_avatar WHERE user_id = $1 AND thumb IS NOT NULL AND avatar_enabled', [userId]);
  return rows[0] || null;
}

// test hook: จำลองความผิดพลาดหลังหัก Coin (ตรวจว่า rollback ครบ)
let failAfterDebit = false;
function _setFailAfterDebit(v) { failAfterDebit = Boolean(v); }

/** ซื้อของ — ราคาอ่านจาก DB · ยอดต้องพอ · ซื้อซ้ำไม่ได้ · ทำทั้งหมดใน transaction เดียว */
async function purchase(userId, itemId) {
  if (typeof itemId !== 'string' || !/^[a-z0-9_]{2,40}$/.test(itemId)) throw new AvatarError('NO_ITEM', 'ไม่พบของชิ้นนี้', 404);
  await ensureUser(userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ล็อกกระเป๋าก่อน: คำขอซื้อพร้อมกันของผู้ใช้คนเดียวจะทำต่อกันทีละคำขอ
    const w = (await client.query('SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    const item = (await client.query('SELECT * FROM avatar_items WHERE id = $1', [itemId])).rows[0];
    if (!item || !item.is_active) throw new AvatarError('NO_ITEM', 'ไม่พบของชิ้นนี้ในร้าน', 404);
    if (item.is_achievement_reward) throw new AvatarError('ACHIEVEMENT_ONLY', 'ของชิ้นนี้ได้จาก Achievement เท่านั้น ซื้อไม่ได้', 403);
    if (!item.is_purchasable || item.is_starter) throw new AvatarError('NOT_FOR_SALE', 'ของชิ้นนี้ไม่ได้วางขาย', 403);
    const owned = await client.query('SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    if (owned.rows[0]) throw new AvatarError('ALREADY_OWNED', 'คุณมีของชิ้นนี้แล้ว', 409);
    const price = item.price;   // ราคาจริงจาก DB เท่านั้น
    if (w.balance < price) throw new AvatarError('INSUFFICIENT', `Coin ไม่พอ (มี ${w.balance} · ต้องใช้ ${price})`, 402);
    const balance = (await client.query(
      'UPDATE coin_wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance', [userId, price])).rows[0].balance;
    await client.query(
      `INSERT INTO coin_transactions (user_id, amount, type, source_key, source_id, description, balance_after)
       VALUES ($1, $2, 'ITEM_PURCHASE', $3, $4, $5, $6)`,
      [userId, -price, `buy:${itemId}`, itemId, `ซื้อ ${item.name}`.slice(0, 160), balance]);
    if (failAfterDebit) throw new Error('simulated failure after debit');
    await client.query(
      "INSERT INTO user_inventory (user_id, item_id, acquisition_type, price_paid) VALUES ($1, $2, 'purchase', $3)", [userId, itemId, price]);
    await client.query('COMMIT');
    return { itemId, price, balance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') throw new AvatarError('ALREADY_OWNED', 'คุณมีของชิ้นนี้แล้ว', 409);
    throw err;
  } finally { client.release(); }
}

/** มอบของ (Achievement / Event / Admin) — ครั้งเดียว */
async function grantItem(userId, itemId, acquisition, db = pool) {
  const r = await db.query(
    'INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING item_id',
    [userId, itemId, acquisition]);
  return r.rowCount > 0;
}

// ---- หน้าตาของผู้ใช้หลายคน (Leaderboard / เพื่อน / Ranked) — cache สั้น ๆ ----
const lookCache = new Map();
function invalidateLook(userId) { lookCache.delete(Number(userId)); }

async function looks(ids) {
  const want = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
  const out = {};
  const miss = [];
  const now = Date.now();
  for (const id of want) {
    const c = lookCache.get(id);
    if (c && now - c.at < 60000) out[id] = c.look; else miss.push(id);
  }
  if (miss.length) {
    const { rows } = await pool.query(
      `SELECT u.id, ua.* FROM users u LEFT JOIN user_avatar ua ON ua.user_id = u.id WHERE u.id = ANY($1::int[])`, [miss]);
    for (const r of rows) {
      // enabled = เจ้าของบัญชีเลือก "ใช้ Avatar" เอง · ไม่เลือก/ยังไม่มี Avatar -> แสดงรูปโปรไฟล์เดิม
      const look = r.user_id
        ? { enabled: r.avatar_enabled === true, outfit: Object.fromEntries(Object.entries(rowToOutfit(r)).filter(([, v]) => v)), thumb: thumbUrl(r.user_id, r), colors: {} }
        : { enabled: false, outfit: null, thumb: null, colors: {} };
      // ไม่ได้เลือกใช้ Avatar เป็นรูปโปรไฟล์ -> ไม่ส่งชุดออกไป (ดูชุดได้ใน Avatar Showcase ตาม Privacy เท่านั้น)
      if (!look.enabled) { look.outfit = null; look.thumb = null; } else look.colors = await colorsOf(r.id, Object.values(look.outfit));
      out[r.id] = look;
      lookCache.set(r.id, { at: now, look });
    }
    if (lookCache.size > 5000) lookCache.clear();
  }
  return out;
}

// ---- Outfit presets (3 ช่อง) ----
async function listPresets(userId) {
  const { rows } = await pool.query('SELECT slot, name, outfit, colors, thumb, updated_at FROM outfit_presets WHERE user_id = $1 ORDER BY slot', [userId]);
  return rows.map((r) => ({ slot: r.slot, name: r.name, outfit: r.outfit, colors: r.colors || {}, thumb: r.thumb || null, updatedAt: r.updated_at }));
}
/** ภาพตัวอย่างของ Preset (data URL จาก viewer 3D ของเจ้าของ) — ตรวจชนิด/ขนาด/ลายเซ็นไฟล์ · ไม่มีหรือไม่ถูกต้อง = null (ใช้ภาพ 2D แทน) */
function cleanPresetThumb(dataUrl) {
  const m = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > THUMB_MAX || !MAGIC[m[1]](buf)) return null;
  return `data:${m[1]};base64,${buf.toString('base64')}`;
}
async function savePreset(userId, slot, name, outfit, thumb, colors) {
  const n = Number(slot);
  if (![1, 2, 3].includes(n)) throw new AvatarError('BAD_SLOT', 'ช่องบันทึกมี 1–3');
  await ensureUser(userId);
  const clean = await validateOutfit(userId, outfit);
  const { byId } = await getCatalog();
  // สีของ Preset: ใช้ค่าที่ส่งมา (ถ้ามี) ไม่งั้นใช้สีปัจจุบันของชิ้นในชุด
  const cols = cleanColors(colors !== undefined ? colors : await colorsOf(userId, Object.values(clean).filter(Boolean)), clean, byId);
  const nm = String(name || `ชุดที่ ${n}`).replace(/[<>]/g, '').trim().slice(0, 30) || `ชุดที่ ${n}`;
  await pool.query(
    `INSERT INTO outfit_presets (user_id, slot, name, outfit, colors, thumb) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, slot) DO UPDATE SET name = EXCLUDED.name, outfit = EXCLUDED.outfit, colors = EXCLUDED.colors, thumb = EXCLUDED.thumb, updated_at = NOW()`,
    [userId, n, nm, JSON.stringify(clean), JSON.stringify(cols), cleanPresetThumb(thumb)]);
  coins.scheduleAchievements(userId);
  return { slot: n, name: nm, outfit: clean, colors: cols, thumb: cleanPresetThumb(thumb) };
}
async function applyPreset(userId, slot) {
  const { rows } = await pool.query('SELECT outfit, colors FROM outfit_presets WHERE user_id = $1 AND slot = $2', [userId, Number(slot)]);
  if (!rows[0]) throw new AvatarError('NO_PRESET', 'ช่องนี้ยังไม่ได้บันทึกชุด', 404);
  const outfit = await saveOutfit(userId, rows[0].outfit);   // ตรวจความเป็นเจ้าของอีกครั้ง
  // สีของ Preset → ตั้งให้ชิ้นในชุด (ชิ้นที่ Preset ไม่ได้เปลี่ยนสี = กลับเป็นสีเดิม) ให้ได้ชุดเหมือนตอนบันทึก
  const { byId } = await getCatalog();
  let cols = {};
  try { cols = cleanColors(rows[0].colors || {}, outfit, byId); } catch (_) { cols = {}; }
  for (const id of Object.values(outfit).filter(Boolean)) {
    if (!(byId[id] && byId[id].color && byId[id].color.colorable)) continue;
    await writeColor(pool, userId, id, cols[id] || { primary: null, secondary: null, accent: null, variant: null });
  }
  invalidateLook(userId);
  return outfit;
}
async function deletePreset(userId, slot) {
  await pool.query('DELETE FROM outfit_presets WHERE user_id = $1 AND slot = $2', [userId, Number(slot)]);
}

module.exports = {
  colorsOf, setItemColor, cleanColor,
  AvatarError, SLOTS, conflictsWith, defaultOutfit, ensureUser, getMe, validateOutfit, saveOutfit, equipItem, setDisplayPreference, saveThumbnail, getThumbnail,
  outfitHash, purchase, grantItem,
  looks, invalidateLook, listPresets, savePreset, applyPreset, deletePreset, _setFailAfterDebit,
};
