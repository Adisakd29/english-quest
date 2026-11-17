/*
  Admin: จัดการของตกแต่ง Avatar (/api/admin/avatar · ผ่าน authRequired + requireAdmin ของ routes/admin.js แล้ว)
  เพิ่ม/แก้ชื่อ · ราคา · rarity · เปิด/ปิด · วางขาย · Achievement · Event · อัปโหลดภาพ (PNG/WebP/SVG · canvas 240×320 เดียวกันทุกชิ้น)
  แถวที่แก้จากหน้านี้ตั้ง admin_override = TRUE (ไฟล์ catalog.json จะไม่ทับอีก)
*/
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const CAT = require('../services/avatar/catalog');
const ACH = require('../config/achievements');
const { LAYER_Z } = require('../scripts/avatar/art');

const router = express.Router();
const SLOT_Z = {
  body: LAYER_Z.body, face: LAYER_Z.face, hair: LAYER_Z.hair, top: LAYER_Z.top, bottom: LAYER_Z.bottom, outerwear: LAYER_Z.outerwear,
  shoes: LAYER_Z.shoes, hat: LAYER_Z.hat, glasses: LAYER_Z.glasses, headphones: LAYER_Z.headphones, back: LAYER_Z.backFront,
  accessory: LAYER_Z.accessory, effect: LAYER_Z.effect, background: LAYER_Z.background,
};
const MIME = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_BYTES = 150 * 1024;
const bad = (res, msg) => res.status(400).json({ error: msg });

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, (SELECT COUNT(*)::int FROM user_inventory v WHERE v.item_id = i.id AND v.acquisition_type = 'purchase') AS sold
         FROM avatar_items i ORDER BY sort_order, id`);
    res.json({
      items: rows.map((r) => ({ ...CAT.toItem(r), sold: r.sold, adminOverride: r.admin_override })),
      slots: CAT.SLOTS, rarities: CAT.RARITIES, achievements: ACH.map((a) => ({ id: a.id, name: a.name })),
    });
  } catch (err) { console.error('[admin/avatar]', err); res.status(500).json({ error: 'โหลดรายการไม่สำเร็จ' }); }
});

/** อัปโหลดภาพ: { dataUrl } -> { url } */
router.post('/upload', async (req, res) => {
  try {
    const m = /^data:(image\/(?:png|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).dataUrl || ''));
    if (!m) return bad(res, 'รองรับเฉพาะ PNG / WebP / SVG');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_BYTES) return bad(res, 'ไฟล์ใหญ่เกิน 150KB');
    if (m[1] === 'image/svg+xml' && /<script|on\w+\s*=|javascript:|<foreignObject/i.test(buf.toString('utf8'))) return bad(res, 'SVG มีสคริปต์ — ไม่อนุญาต');
    const id = `u${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20)}`;
    await pool.query('INSERT INTO avatar_assets (id, mime, data, created_by) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [id, m[1], buf, req.userId]);
    res.json({ url: `/api/avatar/asset/${id}.${MIME[m[1]]}` });
  } catch (err) { console.error('[admin/avatar/upload]', err); res.status(500).json({ error: 'อัปโหลดไม่สำเร็จ' }); }
});

function readFields(b, { create = false } = {}) {
  const f = {};
  if (create || b.name !== undefined) { f.name = String(b.name || '').trim().slice(0, 60); if (!f.name) throw new Error('ต้องมีชื่อ'); }
  if (b.nameTh !== undefined) f.name_th = String(b.nameTh || '').trim().slice(0, 60) || null;
  if (b.price !== undefined) { f.price = parseInt(b.price, 10); if (!(f.price >= 0 && f.price <= 100000)) throw new Error('ราคา 0–100000'); }
  if (b.rarity !== undefined) { if (!CAT.RARITIES.includes(b.rarity)) throw new Error('rarity ไม่ถูกต้อง'); f.rarity = b.rarity; }
  if (b.active !== undefined) f.is_active = Boolean(b.active);
  if (b.purchasable !== undefined) f.is_purchasable = Boolean(b.purchasable);
  if (b.featured !== undefined) f.is_featured = Boolean(b.featured);
  if (b.eventId !== undefined) f.event_id = b.eventId ? String(b.eventId).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : null;
  if (b.achievementId !== undefined) {
    if (b.achievementId && !ACH.some((a) => a.id === b.achievementId)) throw new Error('ไม่พบ Achievement นี้');
    f.achievement_id = b.achievementId || null;
    f.is_achievement_reward = Boolean(b.achievementId);
  }
  if (b.assetUrl !== undefined) {
    const u = String(b.assetUrl || '');
    if (!/^\/(api\/avatar\/asset|assets\/avatar)\/[A-Za-z0-9_./?=-]+$/.test(u)) throw new Error('URL ภาพต้องมาจากการอัปโหลดในระบบ');
    f.asset_url = u;
  }
  if (b.thumbnailUrl !== undefined && b.thumbnailUrl) {
    const u = String(b.thumbnailUrl);
    if (!/^\/(api\/avatar\/asset|assets\/avatar)\/[A-Za-z0-9_./?=-]+$/.test(u)) throw new Error('URL ภาพย่อไม่ถูกต้อง');
    f.thumbnail_url = u;
  }
  return f;
}

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const id = String(b.id || '').trim();
    if (!/^[a-z0-9_]{3,40}$/.test(id)) return bad(res, 'รหัสใช้ a-z 0-9 _ (3–40 ตัว)');
    if (!CAT.SLOTS.includes(b.slot)) return bad(res, 'หมวดไม่ถูกต้อง');
    let f;
    try { f = readFields(b, { create: true }); } catch (e) { return bad(res, e.message); }
    if (!f.asset_url) return bad(res, 'ต้องอัปโหลดภาพก่อน');
    const z = SLOT_Z[b.slot];
    const parts = [{ kind: 'front', z, url: f.asset_url }];
    const max = (await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM avatar_items')).rows[0].n;
    await pool.query(
      `INSERT INTO avatar_items (id, name, name_th, category, rarity, price, asset_url, thumbnail_url, parts, layer, z_index,
         is_purchasable, is_featured, is_achievement_reward, achievement_id, event_id, is_active, sort_order, admin_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$4,$10,$11,$12,$13,$14,$15,$16,$17,TRUE)`,
      [id, f.name, f.name_th || null, b.slot, f.rarity || 'common', f.price || 0, f.asset_url, f.thumbnail_url || f.asset_url, JSON.stringify(parts), z,
        f.is_purchasable !== undefined ? f.is_purchasable : true, Boolean(f.is_featured), Boolean(f.is_achievement_reward), f.achievement_id || null,
        f.event_id || null, f.is_active !== undefined ? f.is_active : false, max]);
    CAT.invalidate();
    res.json({ ok: true, id });
  } catch (err) {
    if (err.code === '23505') return bad(res, 'รหัสนี้มีอยู่แล้ว');
    console.error('[admin/avatar/create]', err); res.status(500).json({ error: 'เพิ่มไม่สำเร็จ' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let f;
    try { f = readFields(req.body || {}); } catch (e) { return bad(res, e.message); }
    const keys = Object.keys(f);
    if (!keys.length) return bad(res, 'ไม่มีข้อมูลที่จะแก้');
    const cur = (await pool.query('SELECT category, parts FROM avatar_items WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'ไม่พบของชิ้นนี้' });
    if (f.asset_url) {   // เปลี่ยนภาพชิ้นหน้า (ชิ้นหลังเดิมคงไว้)
      const back = (cur.parts || []).filter((p) => p.kind === 'back');
      f.parts = JSON.stringify([...back, { kind: 'front', z: SLOT_Z[cur.category], url: f.asset_url }]);
    }
    const ks = Object.keys(f);
    await pool.query(
      `UPDATE avatar_items SET ${ks.map((k, i) => `${k} = $${i + 2}`).join(', ')}, admin_override = TRUE, updated_at = NOW() WHERE id = $1`,
      [req.params.id, ...ks.map((k) => f[k])]);
    CAT.invalidate();
    res.json({ ok: true });
  } catch (err) { console.error('[admin/avatar/update]', err); res.status(500).json({ error: 'บันทึกไม่สำเร็จ' }); }
});

module.exports = router;
