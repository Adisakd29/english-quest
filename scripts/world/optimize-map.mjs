#!/usr/bin/env node
/*
  EnglishQuest World — ขั้นที่ 2 ของแผนที่ (หลัง Blender: scripts/world/build_campus.py)
    node scripts/world/optimize-map.mjs <blender-outdir>
  - campus.glb → dedup · prune · weld · quantize · meshopt → public/assets/world/campus.<hash>.glb (ชื่อมี hash = cache ได้ถาวร)
  - campus.json → data/world/campus.json (+ glbUrl · fileSize) — ข้อมูลเดียวกันใช้ทั้งวาด/collision ฝั่ง client และตรวจตำแหน่งฝั่งเซิร์ฟเวอร์
  - ภาพตรวจ preview_*.png → docs/world/ (ถ้ามี)
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.resolve(process.argv[2] || 'world_out');
const OUT = path.join(ROOT, 'public', 'assets', 'world');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(path.join(SRC, 'campus.glb'));
await doc.transform(dedup(), prune(), weld(), quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const buf = Buffer.from(await io.writeBinary(doc));
const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^campus\.[0-9a-f]+\.glb$/.test(f)) fs.rmSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, `campus.${hash}.glb`), buf);
const map = JSON.parse(fs.readFileSync(path.join(SRC, 'campus.json'), 'utf8'));
map.glbUrl = `/assets/world/campus.${hash}.glb`;
map.fileSize = buf.length;
map.rawSize = fs.statSync(path.join(SRC, 'campus.glb')).size;
fs.mkdirSync(path.join(ROOT, 'data', 'world'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'world', 'campus.json'), JSON.stringify(map, null, 1));
const dd = path.join(ROOT, 'docs', 'world');
fs.mkdirSync(dd, { recursive: true });
for (const f of fs.readdirSync(SRC)) if (/^preview_.*\.png$/.test(f)) fs.copyFileSync(path.join(SRC, f), path.join(dd, f));
console.log(`campus.glb ${(map.rawSize / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB · ${map.triangles} tris · colliders ${map.colliders.length} · ${map.glbUrl}`);
