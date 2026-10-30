#!/usr/bin/env node
/*
  Avatar Asset Audit (v1.8.0) — node scripts/avatar3d/audit.mjs [--json out.json] [--md docs/AVATAR_ASSET_AUDIT.md]
  ตรวจทุกชิ้นในแคตตาล็อก (14 หมวด) แบบอ่านไฟล์จริง ไม่เชื่อ manifest อย่างเดียว:
    2D   : ไฟล์ SVG ทุก layer + ภาพย่อ 2D มีอยู่จริง · เป็น SVG ที่ parse ได้ (มี <svg และ viewBox)
    3D   : models.json มีรายการ · ไฟล์ GLB มีอยู่จริง ขนาดตรง manifest · เปิดด้วย glTF parser ได้ (meshopt decode)
           · มี mesh + skin · joint ทุกตัวอยู่ใน ARM_Main ของ base · ไม่มี texture เกิน 1024 · มี material ทุก primitive · มี COLOR_0 (AO)
           · จำนวน triangle ตรง manifest · ภาพย่อ 3D (WebP) มีอยู่จริงและเป็น WebP
    skin/backdrop: สีผิวมีใน base.skinTones · พื้นหลังมีภาพ 2D ให้ viewer ใช้เป็นฉาก
  ผล: ready3D (ใช้ได้จริง) · only2D (ไม่มีโมเดล) · broken (asset เสีย พร้อมเหตุผล) — exit 1 ถ้ามีของเสีย
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = path.join(ROOT, 'public');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/avatar/catalog.json'), 'utf8')).items;
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/avatar/models.json'), 'utf8'));
const byItem = Object.fromEntries(man.models.map((m) => [m.itemId, m]));
const BONES = new Set(man.bones);
const file = (url) => path.join(PUB, String(url).split('?')[0]);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

async function glbCheck(url, expect = {}) {
  const errs = []; const info = {};
  const f = file(url);
  if (!fs.existsSync(f)) return { errs: [`ไม่พบไฟล์ GLB ${url}`], info };
  const size = fs.statSync(f).size; info.kb = +(size / 1024).toFixed(1);
  if (expect.fileSize && expect.fileSize !== size) errs.push(`ขนาดไฟล์ไม่ตรง manifest (${size} ≠ ${expect.fileSize})`);
  let doc;
  try { doc = await io.read(f); } catch (e) { return { errs: [...errs, `เปิด GLB ไม่ได้: ${e.message}`], info }; }
  const root = doc.getRoot();
  const meshes = root.listMeshes(); const skins = root.listSkins();
  let tris = 0; let noMat = 0; let noAO = 0; let prims = 0; let noUV = 0;
  for (const m of meshes) for (const p of m.listPrimitives()) {
    prims += 1;
    const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
    if (!p.getMaterial()) noMat += 1;
    if (!p.getAttribute('COLOR_0')) noAO += 1;
    if (!p.getAttribute('TEXCOORD_0')) noUV += 1;   // v2: UV (triplanar ตามความถี่ลายผ้า) — runtime ใช้วาง normal map ลายผ้า
    if (!p.getAttribute('JOINTS_0') || !p.getAttribute('WEIGHTS_0')) errs.push(`primitive ใน ${m.getName()} ไม่มี skin weights (ผูกกับ rig ไม่ได้)`);
  }
  info.triangles = Math.round(tris); info.meshes = meshes.length; info.materials = root.listMaterials().map((x) => x.getName());
  if (!meshes.length) errs.push('ไม่มี mesh');
  if (!skins.length) errs.push('ไม่มี skin (rig)');
  const joints = new Set(skins.flatMap((s) => s.listJoints().map((j) => j.getName())));
  const bad = [...joints].filter((j) => !BONES.has(j));
  if (bad.length) errs.push(`bone ไม่อยู่ใน ARM_Main: ${bad.join(', ')}`);
  info.joints = joints.size;
  if (noMat) errs.push(`${noMat}/${prims} primitive ไม่มี material`);
  if (noAO) errs.push(`${noAO}/${prims} primitive ไม่มี COLOR_0 (AO)`);
  if (noUV) errs.push(`${noUV}/${prims} primitive ไม่มี UV (TEXCOORD_0)`);
  for (const t of root.listTextures()) { const s = t.getSize(); if (s && Math.max(...s) > 1024) errs.push(`texture ใหญ่เกิน 1024 (${s.join('×')})`); }
  info.textures = root.listTextures().length;
  if (expect.triangles && Math.abs(expect.triangles - info.triangles) > 2) errs.push(`จำนวน triangle ไม่ตรง manifest (${info.triangles} ≠ ${expect.triangles})`);
  return { errs, info };
}
function svgCheck(url) {
  const f = file(url);
  if (!fs.existsSync(f)) return `ไม่พบไฟล์ 2D ${url}`;
  const s = fs.readFileSync(f, 'utf8');
  if (!/<svg[\s>]/.test(s) || !/viewBox=/.test(s)) return `ไฟล์ 2D ไม่ใช่ SVG ที่ถูกต้อง ${url}`;
  return null;
}
function webpCheck(url) {
  const f = file(url);
  if (!fs.existsSync(f)) return `ไม่พบภาพย่อ 3D ${url}`;
  const b = fs.readFileSync(f);
  if (b.slice(0, 4).toString('latin1') !== 'RIFF' || b.slice(8, 12).toString('latin1') !== 'WEBP') return `ภาพย่อ 3D ไม่ใช่ WebP ${url}`;
  return null;
}

const base = await glbCheck(man.base.glbUrl, { fileSize: man.base.fileSize, triangles: man.base.triangles });
const rows = [];
for (const it of catalog) {
  const r = { id: it.id, slot: it.slot, name: it.nameTh || it.name, price: it.price, rarity: it.rarity, d2: [], d3: [], kind: null, info: {} };
  for (const p of it.parts || []) { const e = svgCheck(p.url); if (e) r.d2.push(e); }
  if (!(it.parts || []).length) r.d2.push('ไม่มี layer 2D');
  if (it.thumbnailUrl) { const e = svgCheck(it.thumbnailUrl); if (e) r.d2.push(e); } else r.d2.push('ไม่มีภาพย่อ 2D');
  const m = byItem[it.id];
  if (!m) r.kind = 'none';
  else if (m.kind === 'skin') {
    r.kind = 'skin';
    if (!(man.base.skinTones || {})[it.id]) r.d3.push('ไม่มีสีผิวใน base.skinTones');
  } else if (m.kind === 'backdrop') {
    r.kind = 'backdrop';
    if (!(it.parts || []).length) r.d3.push('พื้นหลังไม่มีภาพให้ viewer ใช้');
  } else {
    r.kind = 'glb';
    if (m.slot !== it.slot) r.d3.push(`slot ไม่ตรงแคตตาล็อก (${m.slot} ≠ ${it.slot})`);
    if (m.compatibleBaseVersion !== man.base.version) r.d3.push(`ทำมาสำหรับ base v${m.compatibleBaseVersion} (ปัจจุบัน v${man.base.version})`);
    const g = await glbCheck(m.glbUrl, m); r.d3.push(...g.errs); r.info = g.info;
    const w = webpCheck(m.thumbnailUrl); if (w) r.d3.push(w);
    // v2: Asset Validation Gate (Blender: ทุกท่า × หลายเฟรม) + body mask ต้องเป็นชื่อส่วนร่างกายจริง
    const v = m.validation;
    if ((!v || !v.checked) && m.slot !== 'effect') r.d3.push('ไม่มีผลตรวจ animation');   // เอฟเฟกต์ลอยรอบตัว ไม่ผูกกับแขนขา
    else if (!v.pass && m.active !== false) r.d3.push(`ไม่ผ่าน validation แต่เปิดขาย (exposure ${v.worstExposure} · poke ${v.poke} · sink ${v.sink})`);
    const REG = ['core', 'torso', 'hips', 'uarm', 'larm', 'uleg', 'lleg', 'foot'];
    const badMask = (m.masks || []).filter((x) => !REG.includes(x));
    if (badMask.length) r.d3.push(`mask ไม่รู้จัก: ${badMask.join(',')}`);
    r.val = v && v.checked ? { exp: v.worstExposure || 0, poke: v.poke || 0, sink: v.sink || 0, limb: v.limb || 0, pass: v.pass } : null;
    r.masks = m.masks || []; r.clip = Boolean(m.clip);
  }
  r.collection = it.collection || null;
  r.status = r.kind === 'none' ? 'only2D' : (r.d3.length || r.d2.length) ? 'broken' : 'ready3D';
  rows.push(r);
}
const count = (s) => rows.filter((r) => r.status === s).length;
const sum = { items: rows.length, ready3D: count('ready3D'), only2D: count('only2D'), broken: count('broken'),
  glb: rows.filter((r) => r.kind === 'glb' && r.status === 'ready3D').length, skin: rows.filter((r) => r.kind === 'skin').length,
  backdrop: rows.filter((r) => r.kind === 'backdrop').length, baseErrors: base.errs, base: base.info };
console.log(JSON.stringify(sum));
for (const r of rows.filter((x) => x.status !== 'ready3D')) console.log(r.status, r.id, [...r.d2, ...r.d3].join(' · '));

if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ summary: sum, rows }, null, 1));
if (arg('--md')) {
  const SL = { body: 'รูปร่าง/สีผิว', face: 'ใบหน้า', hair: 'ทรงผม', top: 'เสื้อ', bottom: 'กางเกง/กระโปรง', outerwear: 'เสื้อคลุม', shoes: 'รองเท้า', hat: 'หมวก',
    glasses: 'แว่น', headphones: 'หูฟัง', back: 'กระเป๋า', accessory: 'เครื่องประดับ', effect: 'เอฟเฟกต์', background: 'พื้นหลัง' };
  const K = { glb: 'GLB', skin: 'สีผิว (material ของ base)', backdrop: 'ฉากหลัง viewer', none: '—' };
  const ST = { ready3D: 'พร้อมใช้ 3D', only2D: '2D เท่านั้น', broken: 'เสีย' };
  let md = `# Avatar Asset Audit\n\nสร้างโดย \`node scripts/avatar3d/audit.mjs --md docs/AVATAR_ASSET_AUDIT.md\` · ตรวจจากไฟล์จริง (SVG · GLB · WebP) ไม่ใช่จาก manifest อย่างเดียว\n\n`;
  md += `| สรุป | จำนวน |\n|---|---|\n| สินค้าทั้งหมด | ${sum.items} |\n| พร้อมใช้ 3D | ${sum.ready3D} (GLB ${sum.glb} · สีผิว ${sum.skin} · พื้นหลัง ${sum.backdrop}) |\n| 2D เท่านั้น | ${sum.only2D} |\n| Asset เสีย | ${sum.broken} |\n| Base CHR_Base_01 | ${base.errs.length ? `เสีย: ${base.errs.join(' · ')}` : `ผ่าน · ${base.info.triangles} tris · ${base.info.kb} KB · ${base.info.joints} joints`} |\n\n`;
  md += 'การตรวจรันไทม์ (โหลดทุกชิ้นใน viewer จริง ตรวจว่าอยู่บนตัวละคร) อยู่ใน `test/e2e/avatar_assets_e2e.py`\n\n';
  md += '**ด่านตรวจท่าทาง (Asset Validation Gate · ใน Blender):** ทุกชิ้น × 11 ท่า (Idle · Blink · Wave · RaiseArmL/R · BothArmsUp · Turn · Celebrate · Victory · Defeat · Walk) × 1–8 เฟรม · '
    + 'ผิวโผล่ = ผิวที่ชิ้นนี้ปิดอยู่ตอนยืนแล้วโผล่ระหว่างขยับ (≤ 2%) · ผิวทะลุ = ผิวอยู่นอกผิวผ้า (≤ 5%) · จมในตัว = ของติดตัวจมในร่างกาย > 4 มม. (≤ 5%) · แขนจมในชิ้น = แขน/มือเข้าไปในผม/หมวก/หูฟัง (≤ 2%) — ไม่ผ่าน = `active: false` (ไม่เปิดขายแบบ 3D)\n\n';
  for (const slot of Object.keys(SL)) {
    const list = rows.filter((r) => r.slot === slot); if (!list.length) continue;
    md += `## ${SL[slot]} (${list.length})\n| item | ชื่อ | ธีม | 2D | 3D | tris | KB | ตรวจ 11 ท่า (ผิวโผล่ / ผิวทะลุ / จมในตัว / แขนจมในชิ้น) | mask | สถานะ |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of list) md += `| \`${r.id}\` | ${r.name} | ${r.collection || ''} | ${r.d2.length ? r.d2.join('<br>') : 'ผ่าน'} | ${K[r.kind]}${r.d3.length ? `: ${r.d3.join('<br>')}` : ''} | ${r.info.triangles || ''} | ${r.info.kb || ''} | ${r.val ? `${r.val.pass ? 'ผ่าน' : 'ไม่ผ่าน'} · ${(r.val.exp * 100).toFixed(1)}% / ${(r.val.poke * 100).toFixed(1)}% / ${(r.val.sink * 100).toFixed(1)}% / ${(r.val.limb * 100).toFixed(1)}%` : (r.kind === 'glb' ? 'ไม่ต้องตรวจ (ลอยรอบตัว)' : '')} | ${(r.masks || []).join(', ')}${r.clip ? ' (ตัดผมใต้หมวก)' : ''} | ${ST[r.status]} |\n`;
    md += '\n';
  }
  fs.writeFileSync(arg('--md'), md);
}
process.exit(sum.broken || base.errs.length ? 1 : 0);
