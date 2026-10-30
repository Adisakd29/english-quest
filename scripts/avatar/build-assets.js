#!/usr/bin/env node
/*
  สร้างไฟล์ Asset ของ Avatar (SVG โปร่งใส · canvas 240×320 เท่ากันทุกไฟล์) + thumbnail + data/avatar/catalog.json
    public/assets/avatar/items/<id>.svg       ชิ้นหน้า (front)
    public/assets/avatar/items/<id>-back.svg  ชิ้นหลัง (ถ้ามี)
    public/assets/avatar/thumbs/<id>.svg      ภาพย่อสำหรับร้าน/ตู้เสื้อผ้า (crop เฉพาะส่วนของชิ้นนั้น)
  ใช้: node scripts/avatar/build-assets.js   (เพิ่มชิ้นใหม่: วาดใน art.js + เพิ่มใน catalog.js แล้วรันใหม่)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./art');
require('./art_v2')(A);   // คอลเลกชันใหม่ (12 ธีม)
require('./art_hw26')(A);   // Halloween Costume Festival 2026 + ทรงผมวาดใหม่
require('./art_lk26')(A);   // Loy Krathong Festival 2026
const CATALOG = require('./catalog');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'assets', 'avatar');
const svg = (inner, vb = '0 0 240 320') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="240" height="320">${inner}</svg>`;
const strip = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

// ส่วน crop ของภาพย่อแต่ละหมวด (ระบบพิกัดเดียวกับ canvas)
const THUMB_VB = {
  body: '40 20 160 300', face: '62 66 116 82', hair: '44 14 152 200', top: '44 136 152 124', bottom: '58 222 124 92',
  shoes: '74 262 92 56', hat: '40 -4 160 120', glasses: '58 82 124 50', headphones: '42 18 156 132', back: '30 134 180 184',
  outerwear: '40 136 160 160', accessory: '48 140 144 120', effect: '0 0 240 320', background: '0 0 240 320',
};
const ACC_VB = { acc_watch: '46 206 50 50', acc_lk26_jasmine: '38 208 64 64' };
// ภาพย่อของเสื้อผ้า: วางบนหุ่นจาง ๆ เพื่อให้เห็นรูปทรงตอนสวม
const ghost = `<g opacity=".18">${A.body('#cfd3dc', '#b5bac6')}</g>`;
const ON_MANNEQUIN = new Set(['top', 'bottom', 'shoes', 'outerwear', 'hair', 'hat', 'glasses', 'headphones', 'back', 'accessory', 'face', 'effect']);

function partsOf(it) {
  const k = it.id.replace(/^(top|bottom|shoes|hat|glasses|outer|acc|back|fx)_/, '');
  const z = A.LAYER_Z;
  switch (it.slot) {
    case 'body': return [{ kind: 'front', z: z.body, svg: A.body(...A.SKINS[it.id]) }];
    case 'face': return [{ kind: 'front', z: z.face, svg: A.FACES[it.id.replace('face_', '')] }];
    case 'hair': {
      const h = A.HAIR[it.id.replace('hair_', '')];
      return [{ kind: 'front', z: z.hair, svg: h.front(h.color) }, ...(h.back ? [{ kind: 'back', z: z.hairBack, svg: h.back(h.color) }] : [])];
    }
    case 'top': return [{ kind: 'front', z: z.top, svg: A.TOPS[k]() }];
    case 'bottom': return [{ kind: 'front', z: z.bottom, svg: A.BOTTOMS[k]() }];
    case 'shoes': return [{ kind: 'front', z: z.shoes, svg: A.SHOES[k]() }];
    case 'hat': return [{ kind: 'front', z: z.hat, svg: A.HATS[k]() }];
    case 'glasses': return [{ kind: 'front', z: z.glasses, svg: A.GLASSES[k]() }];
    case 'headphones': return [{ kind: 'front', z: z.headphones, svg: A.HEADPHONES[it.id]() }];
    case 'back': { const b = A.BACKS[k]; return [{ kind: 'back', z: z.back, svg: b.back() }, { kind: 'front', z: z.backFront, svg: b.front() }]; }
    case 'outerwear': return [{ kind: 'front', z: z.outerwear, svg: A.OUTER[k]() }];
    case 'accessory': return [{ kind: 'front', z: z.accessory, svg: A.ACCESSORIES[k]() }];
    case 'effect': { const e = A.EFFECTS[k]; return [...(e.back ? [{ kind: 'back', z: z.effectBack, svg: e.back() }] : []), ...(e.front ? [{ kind: 'front', z: z.effect, svg: e.front() }] : [])]; }
    case 'background': return [{ kind: 'front', z: z.background, svg: A.BACKGROUNDS[it.id]() }];
    default: throw new Error(`unknown slot ${it.slot}`);
  }
}

function build() {
  fs.mkdirSync(path.join(OUT, 'items'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
  const ids = new Set();
  const items = CATALOG.map((it, i) => {
    if (ids.has(it.id)) throw new Error(`duplicate id ${it.id}`);
    ids.add(it.id);
    const parts = partsOf(it).map((p) => {
      const file = `${it.id}${p.kind === 'back' ? '-back' : ''}.svg`;
      const body = strip(svg(p.svg));
      fs.writeFileSync(path.join(OUT, 'items', file), body);
      return { kind: p.kind, z: p.z, url: `/assets/avatar/items/${file}?v=${crypto.createHash('sha1').update(body).digest('hex').slice(0, 8)}` };
    });
    const vb = ACC_VB[it.id] || THUMB_VB[it.slot];
    const sorted = partsOf(it).sort((a, b) => a.z - b.z);
    const thumb = strip(svg(`${ON_MANNEQUIN.has(it.slot) ? ghost : ''}${sorted.map((p) => p.svg).join('')}`, vb));
    fs.writeFileSync(path.join(OUT, 'thumbs', `${it.id}.svg`), thumb);
    return {
      id: it.id, slot: it.slot, name: it.name, nameTh: it.nameTh, rarity: it.rarity, price: it.price,
      starter: Boolean(it.starter), purchasable: it.purchasable !== false && !it.starter && !it.achievementId, featured: Boolean(it.featured),
      achievementId: it.achievementId || null, eventId: it.eventId || null, collection: it.collection || null, sortOrder: i, parts,
      thumbnailUrl: `/assets/avatar/thumbs/${it.id}.svg?v=${crypto.createHash('sha1').update(thumb).digest('hex').slice(0, 8)}`,
    };
  });
  fs.mkdirSync(path.join(ROOT, 'data', 'avatar'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'avatar', 'catalog.json'), JSON.stringify({ version: 1, layerZ: A.LAYER_Z, collections: CATALOG.COLLECTIONS || [], items }, null, 1));
  const by = (k) => items.filter((x) => x.slot === k).length;
  console.log(`items ${items.length} · starter ${items.filter((x) => x.starter).length} · shop ${items.filter((x) => x.purchasable).length} · achievement ${items.filter((x) => x.achievementId).length}`,
    Object.keys(THUMB_VB).map((k) => `${k}:${by(k)}`).join(' '));
  return items;
}

if (require.main === module) build();
module.exports = { build };
