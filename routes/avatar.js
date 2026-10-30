/*
  Avatar / Coin / Achievement API (v1.8.0)
    /api/avatar/*        ชุด · ของที่มี · ร้าน · ซื้อ · presets · หน้าตาของผู้เล่นอื่น
    /api/coins/*         ยอด · ประวัติ · รายการใหม่ (สำหรับแจ้ง "+10 Coins")
    /api/achievements/*  รายการ + ความคืบหน้า
  ไม่มี endpoint ใดให้หน้าเว็บกำหนดจำนวน Coin หรือราคาเอง · Coin ไม่มีทางเปลี่ยนเป็น EXP / Rank / คะแนน
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { createLimiter } = require('../utils/rateLimit');
const AV = require('../services/avatar');
const CAT = require('../services/avatar/catalog');
const ACH = require('../services/avatar/achievements');
const coins = require('../services/coins');
const { RULES, WELCOME_COINS } = require('../config/coinRewards');

const limiter = createLimiter({ limit: 90, windowMs: 60 * 1000 });
const limited = (req, res, next) => (limiter.check(`avatar:${req.userId}`)
  ? res.status(429).json({ error: 'ทำรายการเร็วเกินไป รอสักครู่', code: 'RATE_LIMIT' }) : next());
const wrap = (where, fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof AV.AvatarError || err instanceof coins.CoinError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(`[avatar/${where}]`, err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
};

// ---------------- /api/avatar ----------------
const avatar = express.Router();

// ไฟล์ภาพที่ผู้ดูแลอัปโหลด (โหลดผ่าน <image> จึงไม่มี header Authorization · เป็นภาพสาธารณะของแคตตาล็อก)
avatar.get('/asset/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/\.(png|webp|svg)$/, '');
  if (!/^[a-z0-9_-]{4,48}$/.test(id)) return res.status(404).end();
  try {
    const { rows } = await pool.query('SELECT mime, data FROM avatar_assets WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");   // SVG ที่อัปโหลดรันสคริปต์ไม่ได้
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(rows[0].data);
  } catch (err) { console.error('[avatar/asset]', err); return res.status(500).end(); }
});

// avatarThumbnail ของผู้ใช้ (ภาพเล็กสำหรับ Leaderboard/เพื่อน — ไม่ต้อง render 3D ทีละหลายสิบตัว)
avatar.get('/thumb/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) return res.status(404).end();
  try {
    const t = await AV.getThumbnail(id);
    if (!t) return res.status(404).end();
    res.set('Content-Type', t.thumb_mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');   // url มี ?v=<version>
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(t.thumb);
  } catch (err) { console.error('[avatar/thumb]', err); return res.status(500).end(); }
});

avatar.use(authRequired);

const SECTIONS = {
  featured: (it) => it.featured,
  clothes: (it) => ['top', 'bottom', 'outerwear'].includes(it.slot),
  hair: (it) => it.slot === 'hair', shoes: (it) => it.slot === 'shoes', hats: (it) => it.slot === 'hat',
  glasses: (it) => it.slot === 'glasses', headphones: (it) => it.slot === 'headphones',
  accessories: (it) => it.slot === 'accessory', back: (it) => it.slot === 'back',
  effects: (it) => it.slot === 'effect', backgrounds: (it) => it.slot === 'background',
};
const pub = (it) => ({
  id: it.id, slot: it.slot, name: it.name, nameTh: it.nameTh, rarity: it.rarity, price: it.price, parts: it.parts,
  thumbnailUrl: it.thumbnailUrl, starter: it.starter, purchasable: it.purchasable && it.active, featured: it.featured,
  achievementId: it.achievementId, eventId: it.eventId, active: it.active, collection: it.collection || null, color: it.color || null,
  model: it.model && it.model.active ? { kind: it.model.kind || 'glb', triangles: it.model.triangles || 0, glbUrl: it.model.glbUrl, thumbnailUrl: it.model.thumbnailUrl, fileSize: it.model.fileSize,
    version: it.model.version, compatibleBaseVersion: it.model.compatibleBaseVersion, attach: it.model.attach, masks: it.model.masks || [],
    compat: it.model.compat || null, clip: it.model.clip || null } : null,
});

// แคตตาล็อกสำหรับวาดตัวละคร (ทุกชิ้นที่อาจมีคนสวม) — ไม่มีข้อมูลผู้ใช้ · cache ได้
avatar.get('/catalog', wrap('catalog', async (req, res) => {
  const c = await CAT.getCatalog();
  res.set('Cache-Control', 'private, max-age=60');
  return { version: c.version, slots: AV.SLOTS, items: c.list.map(pub) };
}));

// 3D: Base Character + ข้อมูลกลาง (ไม่มีรายการ item ทั้งร้าน — item อยู่ใน /catalog เป็น URL เฉย ๆ โหลดจริงตอน Preview เท่านั้น)
avatar.get('/models', wrap('models', async (req, res) => {
  const m = CAT.readModels();
  res.set('Cache-Control', 'private, max-age=300');
  return { base: m.base, bones: m.bones, sockets: m.sockets, compression: m.compression };
}));

avatar.get('/me', wrap('me', async (req) => {
  ACH.evaluate(req.userId).catch((e) => console.error('[achievements]', e.message));
  return AV.getMe(req.userId);
}));

avatar.put('/outfit', limited, wrap('outfit', async (req) => {
  const b = req.body || {};
  const outfit = await AV.saveOutfit(req.userId, b.outfit);   // updateAvatar(): ชุดเท่านั้น
  require('../services/world').onOutfit(req.userId).catch(() => {});   // Lobby: คนในห้องเห็นชุดใหม่ทันที
  return { ok: true, outfit, outfitHash: AV.outfitHash(outfit) };
}));

// equipAvatarItem(): สวม/ถอดทีละช่อง
avatar.post('/equip', limited, wrap('equip', async (req) => {
  const b = req.body || {};
  const r = await AV.equipItem(req.userId, String(b.slot || ''), b.itemId ? String(b.itemId) : null);
  require('../services/world').onOutfit(req.userId).catch(() => {});
  return { ok: true, ...r, outfitHash: AV.outfitHash(r.outfit) };
}));

// เปลี่ยนสีเครื่องแต่งกาย (ชิ้นที่เป็นเจ้าของ · ฟรี · ส่ง null = กลับเป็นสีเดิม) — ตรวจ Region/รหัสสี/เนื้อผ้าฝั่งเซิร์ฟเวอร์
avatar.put('/colors/:itemId', limited, wrap('colors', async (req) => {
  const b = req.body || {};
  const r = await AV.setItemColor(req.userId, String(req.params.itemId || '').slice(0, 40),
    { primary: b.primary, secondary: b.secondary, accent: b.accent, variant: b.variant });
  if (r.equipped) require('../services/world').onOutfit(req.userId).catch(() => {});
  return { ok: true, ...r };
}));
avatar.get('/colors/palette', wrap('palette', async () => {
  const C = require('../config/avatarColors');
  return { palette: C.PALETTE, variants: Object.fromEntries(Object.entries(C.VARIANTS).map(([k, v]) => [k, { th: v.th, fabric: v.fabric, rough: v.rough }])) };
}));

// setProfileDisplayPreference(): "ใช้รูปโปรไฟล์เดิม" (false) / "ใช้ Avatar ของฉัน" (true) — ไม่แตะรูปโปรไฟล์
avatar.put('/display', limited, wrap('display', async (req) => ({ avatarEnabled: await AV.setDisplayPreference(req.userId, (req.body || {}).useAvatar) })));

// avatarThumbnail: portrait จาก 3D viewer ของตัวเอง (userId จาก token เท่านั้น)
avatar.post('/thumbnail', limited, wrap('thumbnail', async (req) => AV.saveThumbnail(req.userId, (req.body || {}).image, String((req.body || {}).outfitHash || ''))));

// ซื้อ: รับแค่ itemId — ราคาที่ส่งมาจากหน้าเว็บ (ถ้ามี) ไม่ถูกใช้เลย
avatar.post('/purchase', limited, wrap('purchase', async (req) => {
  const r = await AV.purchase(req.userId, String((req.body || {}).itemId || ''));
  return { ok: true, ...r };
}));

// ร้าน: แบ่งหน้า · บอกว่ามีแล้วหรือยัง
avatar.get('/shop', wrap('shop', async (req) => {
  const section = SECTIONS[req.query.section] ? req.query.section : 'featured';
  const col = typeof req.query.collection === 'string' ? req.query.collection.slice(0, 40) : '';
  const page = Math.max(1, Math.min(50, parseInt(req.query.page, 10) || 1));
  const size = Math.max(6, Math.min(48, parseInt(req.query.size, 10) || 24));
  await AV.ensureUser(req.userId);
  const [c, inv, w] = await Promise.all([
    CAT.getCatalog(),
    pool.query('SELECT item_id FROM user_inventory WHERE user_id = $1', [req.userId]),
    coins.wallet(req.userId),
  ]);
  const owned = new Set(inv.rows.map((r) => r.item_id));
  const known = (c.collections || []).some((x) => x.id === col);
  // เลือกคอลเลกชัน = แสดงทุกหมวดของธีมนั้น (เสื้อ/กางเกง/รองเท้า/เครื่องประดับ) · ไม่เลือก = ตามหมวด
  const all = c.list.filter((it) => it.active && !it.starter && (it.purchasable || it.achievementId) && (known ? it.collection === col : SECTIONS[section](it)));
  const items = all.slice((page - 1) * size, page * size).map((it) => ({ ...pub(it), owned: owned.has(it.id) }));
  return { section, collection: known ? col : null, collections: c.collections || [], sections: Object.keys(SECTIONS), page, size, total: all.length, more: page * size < all.length, items, balance: w.balance };
}));

avatar.get('/looks', wrap('looks', async (req) => {
  const ids = String(req.query.ids || '').split(',').slice(0, 100);
  return { looks: await AV.looks(ids) };
}));

// (การ์ดผู้เล่นเดิม /player/:id ถูกแทนด้วย /api/profile/:userId ที่ตรวจ Privacy ทีละ field)

avatar.get('/presets', wrap('presets', async (req) => ({ presets: await AV.listPresets(req.userId) })));
avatar.put('/presets/:slot', limited, wrap('preset-save', async (req) => {
  const b = req.body || {};
  return { preset: await AV.savePreset(req.userId, req.params.slot, b.name, b.outfit, b.thumb, b.colors) };
}));
avatar.post('/presets/:slot/apply', limited, wrap('preset-apply', async (req) => {
  const outfit = await AV.applyPreset(req.userId, req.params.slot);
  require('../services/world').onOutfit(req.userId).catch(() => {});
  return { outfit };
}));
avatar.delete('/presets/:slot', limited, wrap('preset-del', async (req) => { await AV.deletePreset(req.userId, req.params.slot); return { ok: true }; }));

// ---------------- /api/coins ----------------
const coinRouter = express.Router();
coinRouter.use(authRequired);
coinRouter.get('/wallet', wrap('wallet', (req) => coins.wallet(req.userId)));
// ตารางรางวัล (แสดงในหน้า "วิธีได้ Coin" / ตัวอย่างรางวัลในบทเรียน) — อ่านอย่างเดียว
coinRouter.get('/rules', wrap('rules', async () => ({
  welcome: WELCOME_COINS,
  rules: Object.entries(RULES).filter(([, r]) => r.amount > 0 && r.category !== 'event')
    .map(([type, r]) => ({ type, amount: r.amount, category: r.category, dailyLimit: r.dailyLimit || null, th: r.th })),
  achievements: require('../config/achievements').map((a) => ({ id: a.id, name: a.name, coins: a.coins, item: a.item || null })),
})));
coinRouter.get('/history', wrap('history', (req) => coins.history(req.userId, { before: req.query.before, limit: req.query.limit })));
// หน้าเว็บเรียกหลังจบกิจกรรม: ตรวจรางวัลที่ค้าง (เป้าหมาย/Achievement) แล้วคืนรายการใหม่หลัง id ที่รู้
coinRouter.get('/since', wrap('since', async (req) => {
  await ACH.evaluate(req.userId).catch((e) => console.error('[achievements]', e.message));
  const [items, w] = await Promise.all([coins.since(req.userId, req.query.after), coins.wallet(req.userId)]);
  return { items, balance: w.balance, lastTxnId: w.lastTxnId };
}));

// ---------------- /api/achievements ----------------
const achRouter = express.Router();
achRouter.use(authRequired);
achRouter.get('/', wrap('achievements', async (req) => {
  await ACH.evaluate(req.userId).catch((e) => console.error('[achievements]', e.message));
  return { achievements: await ACH.list(req.userId) };
}));
achRouter.post('/seen', wrap('achievements-seen', async (req) => { await ACH.markSeen(req.userId); return { ok: true }; }));

module.exports = { avatar, coins: coinRouter, achievements: achRouter };
