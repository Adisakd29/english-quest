"""
v1.27.0 World Raid — สร้างบอส/ฉาก 3D (Blender headless)
  /home/claude/bpyenv/bin/python scripts/raid/blender/build_raid.py <out> [forest,inferno,frost,frost-xmas,arena:forest,...]
  → <out>/<key>.glb (ยังไม่บีบอัด) + meta.json (จำนวนสามเหลี่ยม · คลิป)
  ขั้นต่อไป: node scripts/raid/optimize.mjs <out>  (meshopt + quantize → public/assets/raid/)
"""
import json
import os
import sys
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import raidlib as L  # noqa: E402
import bosses  # noqa: E402
import arenas  # noqa: E402
import bosses2  # noqa: E402
import arenas2  # noqa: E402
bosses.BUILDERS.update(bosses2.BUILDERS)   # v1.27.1 บอสชุดที่ 2
arenas.BUILDERS.update(arenas2.BUILDERS)

out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'raid_out')
want = sys.argv[2].split(',') if len(sys.argv) > 2 else list(bosses.BUILDERS) + [f'arena:{k}' for k in arenas.BUILDERS]
os.makedirs(out, exist_ok=True)
metaf = os.path.join(out, 'meta.json')
meta = json.load(open(metaf)) if os.path.exists(metaf) else {}
for key in want:
    t = time.time()
    if key.startswith('arena:'):
        k = key.split(':', 1)[1]
        objs = [L.join('Arena', arenas.BUILDERS[k]())]   # รวมเป็นชิ้นเดียว (draw call = จำนวนวัสดุ)
        path = os.path.join(out, f'arena-{k}.glb')
        L.export_glb(path, objs, animations=False)
        tris = sum(L.tri_count(o) for o in objs if o.type == 'MESH')
        meta[f'arena-{k}'] = {'tris': tris, 'kind': 'arena'}
    else:
        arm, body = bosses.BUILDERS[key]()
        path = os.path.join(out, f'boss-{key}.glb')
        L.export_glb(path, [arm, body], animations=True)
        meta[f'boss-{key}'] = {'tris': L.tri_count(body), 'kind': 'boss', 'bones': len(arm.data.bones), 'clips': sorted(a.name for a in bpy.data.actions)}
    print(f'[raid] {key}: {meta[os.path.basename(path)[:-4]]} · {os.path.getsize(path) // 1024} KB · {time.time() - t:.1f}s', flush=True)
json.dump(meta, open(metaf, 'w'), indent=1)
