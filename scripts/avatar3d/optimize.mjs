#!/usr/bin/env node
/*
  3D Avatar asset pipeline ขั้นที่ 2 (หลัง Blender export):
    node scripts/avatar3d/optimize.mjs <blender-outdir>
  - GLB: dedup · prune · weld · quantize · meshopt compression (EXT_meshopt_compression) -> public/assets/avatar3d/glb/<ASSET>.<hash>.glb
  - Thumbnail: PNG -> WebP 256px (ใช้ Pillow) -> public/assets/avatar3d/thumbs/<ASSET>.webp
  - Asset manifest: data/avatar/models.json (itemId · name · category · slot · glbUrl · thumbnailUrl · rarity · price · version · fileSize
    · compatibleBaseVersion · triangles · attach · active) — เซิร์ฟเวอร์อ่านไฟล์นี้แล้วใส่ใน avatar_items.model
  Runtime: three.js GLTFLoader + MeshoptDecoder (~20KB) — เลือก Meshopt แทน Draco เพราะ decoder เล็ก ไม่ต้องโหลด wasm แยก และรองรับ animation/skin
  เพิ่ม item ใหม่จาก Blender: export GLB ตามกฎใน EQ_Avatar_Master.blend (ARM_Main เดียวกัน) แล้วเพิ่มใน meta.json -> รันสคริปต์นี้
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.resolve(process.argv[2] || 'avatar3d_out');
const OUT = path.join(ROOT, 'public', 'assets', 'avatar3d');
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'avatar', 'catalog.json'), 'utf8')).items;
const CAT = Object.fromEntries(catalog.map((x) => [x.id, x]));

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// --merge: สร้างใหม่เฉพาะ asset ที่อยู่ใน meta.json (build บางชิ้น) แล้วรวมกับ manifest เดิม · ไม่ใส่ = สร้างใหม่ทั้งชุด
const MERGE = process.argv.includes('--merge');
const prev = MERGE ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'avatar', 'models.json'), 'utf8')) : null;
const rebuilt = new Set(['CHR_Base_01', ...meta.items.map((x) => x.asset)]);
if (MERGE) {
  for (const d of ['glb', 'thumbs']) {
    fs.mkdirSync(path.join(OUT, d), { recursive: true });
    for (const f of fs.readdirSync(path.join(OUT, d))) if (rebuilt.has(f.split('.')[0])) fs.rmSync(path.join(OUT, d, f));
  }
} else {
  fs.rmSync(path.join(OUT, 'glb'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'glb'), { recursive: true });
  fs.rmSync(path.join(OUT, 'thumbs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
}

async function optimize(asset) {
  const src = path.join(SRC, 'glb', `${asset}.glb`);
  const doc = await io.read(src);
  // keepAttributes: เก็บ UV (TEXCOORD_0) ไว้แม้ใน GLB ไม่มี texture — runtime ใส่ normal map ลายผ้าเอง (prune ปกติจะลบ UV ทิ้ง)
  // UV อยู่ใน 0..1 แล้ว (Blender ย่อ ÷64) → quantize 12 บิต (ความคลาดเคลื่อน ≤ 1.6% ของลาย 1 ช่อง ≈ 1 มม.) ไฟล์เล็กกว่า 16 บิต
  await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.SKIN] })   /* ไม่รวม material: ชื่อ material = Material Region ของระบบเปลี่ยนสี */, prune({ keepAttributes: true }), weld(), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const buf = Buffer.from(await io.writeBinary(doc));
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  const name = `${asset}.${hash}.glb`;
  fs.writeFileSync(path.join(OUT, 'glb', name), buf);
  return { url: `/assets/avatar3d/glb/${name}`, fileSize: buf.length, rawSize: fs.statSync(src).size, hash };
}
function thumb(asset) {
  const png = path.join(SRC, 'thumbs', `${asset}.png`);
  const webp = path.join(OUT, 'thumbs', `${asset}.webp`);
  execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=82,method=6)', png, webp]);
  const h = crypto.createHash('sha1').update(fs.readFileSync(webp)).digest('hex').slice(0, 8);
  return { url: `/assets/avatar3d/thumbs/${asset}.webp?v=${h}`, size: fs.statSync(webp).size };
}

// ด่านตรวจคุณภาพ: ชิ้นที่ไม่ผ่าน Animation/Clipping validation (ใน Blender) จะไม่ถูกเปิดเป็นสินค้า 3D (active: false → ใช้ 2D)
const ALLOW_FAIL = process.env.EQ_ALLOW_FAIL === '1';
const VAL = (meta.validation && meta.validation.items) || {};
const valOf = (asset) => {
  const v = VAL[asset];
  if (!v) return { pass: true, checked: false };
  return { pass: Boolean(v.pass), checked: true, worstExposure: v.worst, worstAt: v.worstAt, sink: v.sink || 0, poke: v.poke || 0, pokeAt: v.pokeAt || null, limb: v.limb || 0, limbAt: v.limbAt || null };
};
if (meta.validation && meta.validation.posesPass === false && !ALLOW_FAIL) throw new Error('ท่าทางไม่ผ่าน: แขนทะลุหัว/ลำตัว — ดู meta.validation.poses');
const base = await optimize('CHR_Base_01');
const baseThumb = thumb('CHR_Base_01');
const models = [];
for (const it of meta.items) {
  const c = CAT[it.itemId];
  if (!c) throw new Error(`ไม่มี ${it.itemId} ในแคตตาล็อก 2D`);
  const g = await optimize(it.asset);
  const t = thumb(it.asset);
  models.push({
    itemId: it.itemId, asset: it.asset, name: c.name, category: it.slot, slot: it.slot, rarity: c.rarity, price: c.price,
    glbUrl: g.url, thumbnailUrl: t.url, fileSize: g.fileSize, rawSize: g.rawSize, version: g.hash, compatibleBaseVersion: meta.baseVersion,
    triangles: it.triangles, attach: it.attach, bones: it.bones, masks: it.masks || [], regions: it.regions || {},
    validation: valOf(it.asset), compat: (meta.compat || {})[it.itemId] || [], ...((meta.hatClip || {})[it.itemId] ? { clip: meta.hatClip[it.itemId] } : {}), active: valOf(it.asset).pass || ALLOW_FAIL,
  });
}
if (MERGE) for (const m of prev.models) if (m.asset && !rebuilt.has(m.asset)) models.push(m);
// สีผิว (body_*) = ย้อม MAT_Skin* ตอน runtime · พื้นหลัง (bg_*) = ฉากหลังของ viewer จากภาพ 2D เดิม — รองรับ 3D โดยไม่ต้องมี GLB
for (const c of catalog.filter((x) => x.slot === 'body' || x.slot === 'background')) {
  models.push({ itemId: c.id, asset: null, name: c.name, category: c.slot, slot: c.slot, rarity: c.rarity, price: c.price,
    kind: c.slot === 'body' ? 'skin' : 'backdrop', glbUrl: null, thumbnailUrl: c.thumbnailUrl, fileSize: 0, version: '1',
    compatibleBaseVersion: meta.baseVersion, triangles: 0, attach: null, active: true });
}
const manifest = {
  version: 1, generatedAt: new Date().toISOString(), compression: 'EXT_meshopt_compression + KHR_mesh_quantization',
  units: meta.units, up: meta.up, forward: meta.forward, bones: meta.bones, sockets: meta.sockets,
  base: { asset: 'CHR_Base_01', version: meta.baseVersion, glbUrl: base.url, fileSize: base.fileSize, rawSize: base.rawSize,
    triangles: meta.base.triangles, animations: meta.base.animations, thumbnailUrl: baseThumb.url,
    skinTones: { body_light: '#f6d3b3', body_warm: '#e8b48c', body_tan: '#c98e62', body_deep: '#8d5a3b' } },
  models,
};
fs.writeFileSync(path.join(ROOT, 'data', 'avatar', 'models.json'), JSON.stringify(manifest, null, 1));
// สำเนาไฟล์ Blender (Master Template + Pilot source) ไว้ใน repo
fs.mkdirSync(path.join(ROOT, 'assets-src', 'avatar3d'), { recursive: true });
fs.rmSync(path.join(ROOT, 'assets-src', 'avatar3d', 'EQ_Avatar_Pilot.blend'), { force: true });
if (!MERGE) for (const f of ['EQ_Avatar_Master.blend', 'EQ_Avatar_Items.blend']) fs.copyFileSync(path.join(SRC, f), path.join(ROOT, 'assets-src', 'avatar3d', f));
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`base ${kb(base.rawSize)} -> ${kb(base.fileSize)} · ${meta.base.triangles} tris`);
models.filter((m) => m.asset).forEach((m) => console.log(`${m.asset.padEnd(20)} ${kb(m.rawSize).padStart(8)} -> ${kb(m.fileSize).padStart(7)} · ${String(m.triangles).padStart(5)} tris`));
const failed = models.filter((m) => m.validation && m.validation.checked && !m.validation.pass);
if (failed.length) console.log(`ไม่ผ่าน validation ${failed.length} ชิ้น${ALLOW_FAIL ? ' (EQ_ALLOW_FAIL=1 — ยังเปิดใช้)' : ' → active: false'}:`, failed.map((m) => `${m.asset}(exp ${m.validation.worstExposure}@${m.validation.worstAt} · poke ${m.validation.poke}@${m.validation.pokeAt})`).join(' '));
console.log(`total GLB ${kb(base.fileSize + models.reduce((a, m) => a + m.fileSize, 0))} (raw ${kb(base.rawSize + models.reduce((a, m) => a + (m.rawSize || 0), 0))})`);
