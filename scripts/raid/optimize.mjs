#!/usr/bin/env node
/*
  v1.27.0 World Raid — asset pipeline ขั้นที่ 2 (หลัง Blender):
    node scripts/raid/optimize.mjs <blender-outdir>
  - GLB: dedup · prune · weld · quantize · meshopt (EXT_meshopt_compression) → public/assets/raid/<key>.<hash>.glb
  - manifest: data/raid/assets.json { key: { url, bytes, tris, clips } } — หน้าเว็บโหลดเฉพาะบอส/ฉากที่ใช้อยู่ (lazy)
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.resolve(process.argv[2] || 'raid_out');
const OUT = path.join(ROOT, 'public', 'assets', 'raid');
const MAN = path.join(ROOT, 'data', 'raid', 'assets.json');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.dirname(MAN), { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : {};
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.glb'))) {
  const key = f.slice(0, -4);
  const doc = await io.read(path.join(SRC, f));
  // _GLOW (หน้ากากเรืองแสงจาก Blender) → COLOR_0.a (VEC4) · ไม่มี = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const col = prim.getAttribute('COLOR_0'); const glow = prim.getAttribute('_GLOW');
      if (!col) { if (glow) prim.setAttribute('_GLOW', null); continue; }
      const n = col.getCount(); const out = new Float32Array(n * 4); const tmp = [];
      for (let i = 0; i < n; i += 1) {
        col.getElement(i, tmp);
        out[i * 4] = tmp[0]; out[i * 4 + 1] = tmp[1]; out[i * 4 + 2] = tmp[2];
        out[i * 4 + 3] = glow ? glow.getElement(i, [])[0] : (col.getType() === 'VEC4' ? tmp[3] : 0);
      }
      const acc = doc.createAccessor().setType('VEC4').setArray(out).setBuffer(col.getBuffer());
      prim.setAttribute('COLOR_0', acc);
      if (glow) prim.setAttribute('_GLOW', null);
    }
  }
  await doc.transform(dedup(), prune(), weld(), quantize({ quantizeColor: 8, quantizeNormal: 10, quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  const buf = Buffer.from(await io.writeBinary(doc));
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  for (const old of fs.readdirSync(OUT)) if (old.startsWith(`${key}.`) && old.endsWith('.glb')) fs.rmSync(path.join(OUT, old));
  const name = `${key}.${hash}.glb`;
  fs.writeFileSync(path.join(OUT, name), buf);
  man[key] = { url: `/assets/raid/${name}`, bytes: buf.length, tris: meta[key] ? meta[key].tris : null, clips: meta[key] && meta[key].clips ? meta[key].clips : undefined };
  console.log(`${key}: ${(fs.statSync(path.join(SRC, f)).size / 1024).toFixed(0)} KB → ${(buf.length / 1024).toFixed(0)} KB`);
}
fs.writeFileSync(MAN, `${JSON.stringify(man, null, 1)}\n`);
