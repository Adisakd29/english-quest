"""
EnglishQuest World — แผนที่ "Fantasy Campus" (Phase 1–3: แผนที่เล็ก 1 แห่ง) สร้างจริงด้วย Blender (headless)
  /home/claude/bpyenv/bin/python scripts/world/build_campus.py <outdir>
ผลลัพธ์:
  <outdir>/campus.glb      ฉากทั้งหมด (แยกเป็นก้อนตามโซน → frustum culling) · สี + AO bake ลง vertex color · ไม่มี texture
  <outdir>/campus.json     ข้อมูลเดียวกับที่ใช้วาดฉาก: collider · โซน · จุดโต้ตอบ · ที่นั่ง · จุดเกิด (เซิร์ฟเวอร์ใช้ตรวจตำแหน่ง)
  <outdir>/preview_*.png   ภาพตรวจ (มุมสูง + มุมแต่ละโซน)
จากนั้น: node scripts/world/optimize-map.mjs <outdir>

พิกัด: ข้อมูล/runtime ใช้แกน three.js (x ขวา · y ขึ้น · z ลงใต้/เข้าหากล้อง) หน่วยเมตร · ตัวละครสูง ~0.97 m
  Blender: (x, -z, y) — ฟังก์ชัน W() แปลงให้ · glTF export (+Y up) แปลงกลับเป็นแกน three.js เอง
แนวทางศิลป์: Stylized Fantasy Campus สีสดใส ขอบมน — ทุกชิ้นปั้นจากรูปทรงที่ออกแบบ (lathe profile, กลีบ, โค้ง, ขอบ bevel,
  ใบไม้ปั้นหลอมด้วย voxel remesh) ไม่ใช่กล่อง/ทรงกลมวางเปล่า ๆ · แสงเงานุ่มจาก AO ที่ bake
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'avatar3d', 'blender'))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from eqlib import apply_mods, bake_ao, mat, reset_scene  # noqa: E402

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else (sys.argv[1] if len(sys.argv) > 1 else 'world_out'))
os.makedirs(OUT, exist_ok=True)
reset_scene()
V = Vector
TAU = math.pi * 2
rnd = random.Random(2026)


def W(x, y, z):
    """พิกัด three.js (x, y ขึ้น, z) → Blender"""
    return V((x, -z, y))


# =====================================================================
# ข้อมูลแผนที่ (แหล่งเดียวกับที่ใช้วาด)
# =====================================================================
MAP = {'id': 'campus', 'name': 'EnglishQuest Campus', 'version': 1, 'bounds': [-23.4, -23.4, 23.4, 23.4], 'playerRadius': 0.24,
       'colliders': [], 'zones': [], 'interact': [], 'seats': [], 'spawns': []}

def col_circle(x, z, r, tag=''):
    MAP['colliders'].append({'t': 'c', 'x': round(x, 3), 'z': round(z, 3), 'r': round(r, 3), 'tag': tag})

def col_box(x, z, hw, hd, ry=0.0, tag=''):
    """กล่องหมุนรอบแกนตั้ง ry (เรเดียน · ทิศเดียวกับ three.js rotation.y)"""
    MAP['colliders'].append({'t': 'b', 'x': round(x, 3), 'z': round(z, 3), 'hw': round(hw, 3), 'hd': round(hd, 3), 'ry': round(ry, 4), 'tag': tag})


# =====================================================================
# วัสดุ (สีสด · matte)
# =====================================================================
M = {
    'grass': mat('MAT_W_Grass', '#8fd16a', 0.95), 'grass2': mat('MAT_W_GrassDark', '#74c25c', 0.95),
    'path': mat('MAT_W_Path', '#efe2c8', 0.9), 'path2': mat('MAT_W_PathDark', '#dcc9a6', 0.9), 'curb': mat('MAT_W_Curb', '#cdb894', 0.85),
    'tileA': mat('MAT_W_TileA', '#f6ead3', 0.85), 'tileB': mat('MAT_W_TileB', '#e6cf9f', 0.85), 'tileC': mat('MAT_W_TileC', '#b9d7f0', 0.8),
    'cream': mat('MAT_W_WallCream', '#fff3dc', 0.85), 'pink': mat('MAT_W_WallPink', '#ffd6e2', 0.85), 'lav': mat('MAT_W_WallLav', '#e3d8ff', 0.85),
    'stone': mat('MAT_W_Stone', '#d9d2c3', 0.9), 'stone2': mat('MAT_W_StoneWarm', '#e8c9a0', 0.9),
    'roofB': mat('MAT_W_RoofBlue', '#4f7fe0', 0.7), 'roofB2': mat('MAT_W_RoofBlueDark', '#3d68c4', 0.7),
    'roofR': mat('MAT_W_RoofRed', '#e45b4c', 0.7), 'roofR2': mat('MAT_W_RoofRedDark', '#c4473a', 0.7),
    'roofP': mat('MAT_W_RoofPurple', '#9a6be3', 0.7), 'roofP2': mat('MAT_W_RoofPurpleDark', '#7f53c9', 0.7),
    'wood': mat('MAT_W_Wood', '#c98d5b', 0.8), 'wood2': mat('MAT_W_WoodDark', '#946140', 0.8),
    'metal': mat('MAT_W_Metal', '#3e4660', 0.45, 0.6), 'gold': mat('MAT_W_Gold', '#ffcc4d', 0.35, 0.7),
    'white': mat('MAT_W_White', '#ffffff', 0.6), 'navy': mat('MAT_W_Navy', '#2c3a78', 0.6),
    'glass': mat('MAT_W_Glass', '#a9dcff', 0.15, 0.0, emission='#2a5f86'), 'glassW': mat('MAT_W_GlassWarm', '#ffe7a8', 0.2, 0.0, emission='#ffc65a'),
    'water': mat('MAT_W_Water', '#6fcfff', 0.08, 0.0, emission='#2a7fb0'),
    'leaf': mat('MAT_W_Leaf', '#69c159', 0.9), 'leaf2': mat('MAT_W_LeafDeep', '#4aa64a', 0.9), 'leaf3': mat('MAT_W_LeafLight', '#9bd96b', 0.9),
    'blossom': mat('MAT_W_Blossom', '#ffb3cf', 0.9), 'trunk': mat('MAT_W_Trunk', '#9a6a43', 0.9),
    'red': mat('MAT_W_Red', '#ff6b5e', 0.6), 'orange': mat('MAT_W_Orange', '#ffa53d', 0.6), 'yellow': mat('MAT_W_Yellow', '#ffd84d', 0.6),
    'teal': mat('MAT_W_Teal', '#41c7b9', 0.6), 'violet': mat('MAT_W_Violet', '#b38cff', 0.6), 'sky': mat('MAT_W_Sky', '#6cb8ff', 0.6),
    'sand': mat('MAT_W_Sand', '#f2d9a2', 0.95),
    # Halloween
    'pumpkin': mat('MAT_W_Pumpkin', '#ff8a1f', 0.65), 'pumpkinD': mat('MAT_W_PumpkinDark', '#e06a10', 0.7), 'stem': mat('MAT_W_Stem', '#5e8f34', 0.8),
    'ghost': mat('MAT_W_Ghost', '#f7f6ff', 0.55, 0.0, emission='#3a3a58'), 'ink': mat('MAT_W_Ink', '#2a2140', 0.6),
    'bat': mat('MAT_W_Bat', '#3b2a5a', 0.6), 'moon': mat('MAT_W_Moon', '#ffe9a8', 0.4, 0.0, emission='#ffd36b'),
    'lanternP': mat('MAT_W_LanternPurple', '#c79bff', 0.3, 0.0, emission='#9a5cff'), 'lanternO': mat('MAT_W_LanternOrange', '#ffc06b', 0.3, 0.0, emission='#ff9a2e'),
    'hwStone': mat('MAT_W_HwStone', '#c9bfe6', 0.9), 'hwStone2': mat('MAT_W_HwStoneDark', '#a99cd6', 0.9),
    'blush': mat('MAT_W_Blush', '#ffb3c4', 0.8), 'mirror': mat('MAT_W_Mirror', '#e6e2ff', 0.05, 0.6, emission='#3d356b'),
}

OBJS = []

def obj_from_bm(name, bm, m, zone, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(m)
    ob['zone'] = zone
    OBJS.append(ob)
    return ob


def lathe(name, prof, m, zone, cx=0.0, cz=0.0, y0=0.0, seg=48, mod=None, closed=False, smooth=True):
    """หมุน profile [(r, h)] รอบแกนตั้งที่ (cx, cz) · r = 0 ที่ปลาย = ปิดเป็นขั้ว · closed = profile เป็นวงปิด (หน้าตัดกำแพงวง)
    mod(a, h) -> ตัวคูณรัศมี (กลีบฟักทอง ลอนชายผี)"""
    bm = bmesh.new()
    rings = []
    for r, h in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new(W(cx, y0 + h, cz))])
            continue
        ring = []
        for i in range(seg):
            a = TAU * i / seg
            rr = r * (mod(a, h) if mod else 1.0)
            ring.append(bm.verts.new(W(cx + math.cos(a) * rr, y0 + h, cz + math.sin(a) * rr)))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for ra, rb in pairs:
        if len(ra) == 1 and len(rb) == 1:
            continue
        if len(ra) == 1:
            for i in range(seg):
                bm.faces.new((ra[0], rb[(i + 1) % seg], rb[i]))
        elif len(rb) == 1:
            for i in range(seg):
                bm.faces.new((ra[i], ra[(i + 1) % seg], rb[0]))
        else:
            for i in range(seg):
                bm.faces.new((ra[i], ra[(i + 1) % seg], rb[(i + 1) % seg], rb[i]))
    return obj_from_bm(name, bm, m, zone, smooth)


def box(name, x, y, z, sx, sy, sz, m, zone, bevel=0.04, ry=0.0, seg=3):
    """กล่องขอบมน (bevel จริงด้วย modifier — ขอบคม-มนสวย ไม่เป็นก้อนกลม) · x,y,z = กึ่งกลาง (y = ฐานล่าง)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=V((sx, sz, sy)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=V((0, 0, sy / 2)), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=V((0, 0, 0)), matrix=Matrix.Rotation(ry, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=W(x, y, z), verts=bm.verts)
    ob = obj_from_bm(name, bm, m, zone, smooth=False)
    if bevel:
        b = ob.modifiers.new('bev', 'BEVEL'); b.width = min(bevel, sx * 0.45, sy * 0.45, sz * 0.45); b.segments = seg; b.limit_method = 'NONE'
        b.harden_normals = True   # ด้านแบนเรียบแบน ขอบ bevel โค้งนุ่ม (custom normals → glTF)
        for p in ob.data.polygons:
            p.use_smooth = True
        apply_mods(ob)
    return ob


def prism_xy(name, pts, depth, m, zone, x, y, z, ry=0.0, bevel=0.01, face='z'):
    """แผ่นรูปทรง 2D (pts = [(u, v)] · u ขวา v ขึ้น) หนา depth ตั้งหันหน้าไปทาง +z (three) แล้วหมุน ry"""
    bm = bmesh.new()
    f = [bm.verts.new(V((u, depth / 2, v))) for u, v in pts]
    b = [bm.verts.new(V((u, -depth / 2, v))) for u, v in pts]
    bm.faces.new(f[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n):
        bm.faces.new((f[i], f[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.rotate(bm, cent=V((0, 0, 0)), matrix=Matrix.Rotation(ry, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=W(x, y, z), verts=bm.verts)
    bmesh.ops.triangulate(bm, faces=[q for q in bm.faces if len(q.verts) > 4])
    ob = obj_from_bm(name, bm, m, zone, smooth=False)
    if bevel:
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bevel; bv.segments = 2; bv.limit_method = 'ANGLE'
        apply_mods(ob)
    return ob


def tube(name, pts, r, m, zone, tseg=10, closed=False, r1=None):
    """ท่อตามเส้นทาง (พิกัด three.js) · r1 = รัศมีปลาย (เรียว)"""
    P = [W(*p) for p in pts]
    n = len(P)
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = P[i - 1] if (closed or i > 0) else P[i]
        b = P[(i + 1) % n] if (closed or i < n - 1) else P[i]
        t = (b - a).normalized() if (b - a).length > 1e-9 else V((1, 0, 0))
        up = V((0, 0, 1)) if abs(t.z) < 0.95 else V((0, 1, 0))
        nn = t.cross(up).normalized(); bb = t.cross(nn).normalized()
        rr = r if r1 is None else r + (r1 - r) * i / max(1, n - 1)
        rings.append([bm.verts.new(P[i] + (nn * math.cos(TAU * j / tseg) + bb * math.sin(TAU * j / tseg)) * rr) for j in range(tseg)])
    for i in range(n if closed else n - 1):
        r0, r1_ = rings[i], rings[(i + 1) % n]
        for j in range(tseg):
            bm.faces.new((r0[j], r0[(j + 1) % tseg], r1_[(j + 1) % tseg], r1_[j]))
    if not closed:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    return obj_from_bm(name, bm, m, zone)


def blob(name, centers, m, zone, voxel=0.05, smooth=6, tris=1600):
    """ก้อนอินทรีย์ปั้นหลอม: ทรงรีหลายลูก (cx, cy, cz, rx, ry, rz) → voxel remesh → เกลาเรียบ → ลดโพลีกอน (ใบไม้ พุ่มไม้ ผี)"""
    bm = bmesh.new()
    for cx, cy, cz, rx, ry_, rz in centers:
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=20, v_segments=12, radius=1.0)
        bmesh.ops.scale(tmp, vec=V((rx, rz, ry_)), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=W(cx, cy, cz), verts=tmp.verts)
        me = bpy.data.meshes.new('t'); tmp.to_mesh(me); tmp.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    ob = obj_from_bm(name, bm, m, zone)
    rm = ob.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    sm = ob.modifiers.new('sm', 'LAPLACIANSMOOTH'); sm.iterations = smooth; sm.lambda_factor = 0.4; sm.use_volume_preserve = True
    apply_mods(ob)
    tri = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tri > tris:
        dc = ob.modifiers.new('dc', 'DECIMATE'); dc.ratio = tris / tri; apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.validate()
    ob.data.materials.clear(); ob.data.materials.append(m)
    return ob


def text3d(name, body, size, m, zone, x, y, z, ry=0.0, depth=0.03):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.extrude = depth; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.bevel_depth = depth * 0.25; cu.bevel_resolution = 1; cu.resolution_u = 4
    tob = bpy.data.objects.new(name + '_c', cu); bpy.context.scene.collection.objects.link(tob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tob.evaluated_get(dg))
    bpy.data.objects.remove(tob); bpy.data.curves.remove(cu)
    me.transform(Matrix.Translation(W(x, y, z)) @ Matrix.Rotation(ry, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.clear(); me.materials.append(m)
    ob['zone'] = zone; OBJS.append(ob)
    return ob


# =====================================================================
# พื้น · ทางเดิน · ลานกลาง
# =====================================================================
def ground():
    S = 24.6
    bm = bmesh.new()
    n = 82
    vs = [[bm.verts.new(W(-S + 2 * S * i / n, 0.0, -S + 2 * S * j / n)) for j in range(n + 1)] for i in range(n + 1)]
    for i in range(n):
        for j in range(n):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    g = obj_from_bm('Ground', bm, M['grass'], 'ground')
    # ขอบเกาะ: เนินดินโค้งรอบแผนที่ (กันมองเห็นขอบโลกตัดตรง)
    for side in range(4):
        a = side * math.pi / 2
        pts = []
    edge = lathe('GroundRim', [(34.0, -1.2), (34.6, -0.6), (34.0, -0.1), (25.2, -0.02)], M['grass2'], 'ground', seg=64)
    return g


def path_strip(name, x0, z0, x1, z1, w, zone='ground'):
    """ทางเดินหินโค้งมนเล็กน้อย พร้อมขอบ (curb) · ปลายมน"""
    L = math.hypot(x1 - x0, z1 - z0); ry = math.atan2(-(z1 - z0), x1 - x0)
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    box(name, cx, 0.0, cz, L, 0.035, w, M['path'], zone, bevel=0.015, ry=ry)
    # ลายแผ่นหิน: ก้อนหินแบนเรียงสลับ (ยกเล็กน้อย)
    k = int(L / 0.9)
    for i in range(k):
        t = (i + 0.5) / k
        for j, off in enumerate((-w * 0.25, w * 0.25)):
            sx = 0.78 if (i + j) % 2 else 0.6
            px = x0 + (x1 - x0) * t + math.cos(ry + math.pi / 2) * off * 1.0
            pz = z0 + (z1 - z0) * t - math.sin(ry + math.pi / 2) * off * 1.0
            box(f'{name}_s{i}{j}', px, 0.03, pz, sx, 0.022, w * 0.42, M['path2'] if (i + j) % 3 == 0 else M['tileA'], zone, bevel=0.03, ry=ry + rnd.uniform(-0.04, 0.04))
    for s in (-1, 1):   # ขอบทาง
        px = cx + math.cos(ry + math.pi / 2) * s * (w / 2 + 0.06)
        pz = cz - math.sin(ry + math.pi / 2) * s * (w / 2 + 0.06)
        box(f'{name}_curb{s}', px, 0.0, pz, L, 0.07, 0.14, M['curb'], zone, bevel=0.03, ry=ry)


def plaza():
    Z = 'plaza'
    # ลานกลม: วงหินสลับสี + ขอบยก
    lathe('Plaza_Base', [(0.0, 0.03), (9.2, 0.03), (9.3, 0.0)], M['tileA'], Z, seg=96)
    for i, (r0, r1) in enumerate(((3.0, 3.5), (5.0, 5.35), (7.4, 7.8))):
        lathe(f'Plaza_Ring{i}', [(r0, 0.034), (r1, 0.034), (r1, 0.04), (r0, 0.04)], M['tileB'], Z, seg=96, closed=True)
    # ลวดลายดาว 8 แฉกรอบน้ำพุ (แผ่นหินสีฟ้า)
    star = []
    for i in range(16):
        a = TAU * i / 16; r = 4.6 if i % 2 == 0 else 3.6
        star.append((math.cos(a) * r, math.sin(a) * r))
    bm = bmesh.new()
    vs = [bm.verts.new(W(x, 0.041, z)) for x, z in star]
    c = bm.verts.new(W(0, 0.041, 0))
    for i in range(16):
        bm.faces.new((c, vs[(i + 1) % 16], vs[i]))
    obj_from_bm('Plaza_Star', bm, M['tileC'], Z, smooth=False)
    lathe('Plaza_Curb', [(9.25, 0.0), (9.25, 0.08), (9.45, 0.1), (9.6, 0.06), (9.6, 0.0)], M['curb'], Z, seg=96)
    fountain()
    # ม้านั่ง 4 ตัว หันเข้าน้ำพุ (ระหว่างทางเดิน)
    for k, ang in enumerate((45, 135, 225, 315)):
        a = math.radians(ang)
        bench(f'Bench{k}', math.cos(a) * 6.3, math.sin(a) * 6.3, a, Z)
    # เสาไฟ 8 ต้น (ขอบทางเข้าลาน)
    for k, ang in enumerate((22, 68, 112, 158, 202, 248, 292, 338)):
        a = math.radians(ang)
        lamp(f'Lamp{k}', math.cos(a) * 8.75, math.sin(a) * 8.75, Z)
    # แปลงดอกไม้โค้ง 4 แปลง (ขอบลาน ระหว่างทางเดิน)
    for k, ang in enumerate((45, 135, 225, 315)):
        flower_bed(f'Bed{k}', math.radians(ang), Z)
    signpost(-2.9, 6.6, Z)


def fountain():
    Z = 'plaza'
    # อ่างใหญ่: ขอบมนหนา ลวดลายร่องรอบ
    lathe('Fountain_Basin', [(0.0, 0.05), (2.15, 0.05), (2.15, 0.42), (2.25, 0.55), (2.5, 0.56), (2.62, 0.48), (2.62, 0.08), (2.5, 0.0)],
          M['stone'], Z, seg=72, mod=lambda a, h: 1 + (0.012 * math.cos(24 * a) if h > 0.1 and h < 0.5 else 0))
    lathe('Fountain_Water', [(0.0, 0.42), (2.16, 0.42), (2.16, 0.4)], M['water'], Z, seg=64)
    # เสากลาง + อ่างกลาง + อ่างบน (profile โค้งแบบถ้วย)
    lathe('Fountain_Column', [(0.0, 0.4), (0.42, 0.4), (0.3, 0.55), (0.22, 0.75), (0.26, 0.92), (0.0, 0.95)], M['stone2'], Z, seg=40)
    lathe('Fountain_Bowl', [(0.0, 0.92), (0.3, 0.9), (0.85, 1.02), (1.08, 1.18), (1.12, 1.24), (1.02, 1.22), (0.0, 1.12)], M['stone'], Z, seg=56)
    lathe('Fountain_BowlWater', [(0.0, 1.17), (1.0, 1.17), (1.0, 1.15)], M['water'], Z, seg=48)
    lathe('Fountain_Column2', [(0.0, 1.15), (0.16, 1.15), (0.11, 1.35), (0.15, 1.6), (0.0, 1.62)], M['stone2'], Z, seg=32)
    lathe('Fountain_Bowl2', [(0.0, 1.58), (0.14, 1.58), (0.42, 1.68), (0.5, 1.78), (0.44, 1.77), (0.0, 1.7)], M['stone'], Z, seg=40)
    lathe('Fountain_Bowl2Water', [(0.0, 1.74), (0.43, 1.74), (0.43, 1.72)], M['water'], Z, seg=32)
    # ยอด: ดาวสีทอง (สัญลักษณ์ EnglishQuest)
    star = [(math.cos(math.pi / 2 + TAU * i / 10) * (0.2 if i % 2 == 0 else 0.085), math.sin(math.pi / 2 + TAU * i / 10) * (0.2 if i % 2 == 0 else 0.085)) for i in range(10)]
    prism_xy('Fountain_Star', star, 0.07, M['gold'], Z, 0, 2.0, 0, bevel=0.015)
    lathe('Fountain_StarPin', [(0.0, 1.75), (0.04, 1.75), (0.04, 1.86), (0.0, 1.88)], M['gold'], Z, seg=12)
    # สายน้ำตก: โค้งจากขอบอ่างบน → อ่างกลาง และ อ่างกลาง → อ่างใหญ่
    for i in range(8):
        a = TAU * i / 8 + 0.2
        pts = [(math.cos(a) * (0.5 + 0.18 * t), 1.78 - 0.62 * t * t, math.sin(a) * (0.5 + 0.18 * t)) for t in [k / 7 for k in range(8)]]
        tube(f'Fountain_Stream{i}', pts, 0.028, M['water'], Z, tseg=8, r1=0.018)
        a2 = a + TAU / 16
        pts2 = [(math.cos(a2) * (1.12 + 0.55 * t), 1.24 - 0.84 * t * t, math.sin(a2) * (1.12 + 0.55 * t)) for t in [k / 9 for k in range(10)]]
        tube(f'Fountain_Fall{i}', pts2, 0.034, M['water'], Z, tseg=8, r1=0.022)
    col_circle(0, 0, 2.75, 'fountain')


def bench(name, x, z, a, zone):
    """ม้านั่งไม้ขาโค้งเหล็ก (สเกลตัวละคร ~1 m: ที่นั่งสูง 0.10 m) · หันหน้าเข้าหาน้ำพุ"""
    ry = -a + math.pi / 2 + math.pi   # แกนยาวของม้านั่ง = ตั้งฉากกับรัศมี
    face = math.atan2(-x, -z)          # หันเข้าศูนย์กลาง (ทิศ three.js rotation.y)
    ux, uz = math.cos(a + math.pi / 2), math.sin(a + math.pi / 2)   # แนวยาว
    nx, nz = -math.cos(a), -math.sin(a)                             # ทิศหน้า (เข้าน้ำพุ)
    for i in range(4):   # แผ่นไม้ที่นั่ง
        off = -0.09 + i * 0.06
        box(f'{name}_seat{i}', x + nx * -off, 0.085, z + nz * -off, 1.36, 0.022, 0.05, M['wood'], zone, bevel=0.008, ry=math.atan2(-uz, ux))
    for i in range(3):   # พนักพิง
        h = 0.2 + i * 0.055
        box(f'{name}_back{i}', x - nx * 0.15, h, z - nz * 0.15, 1.36, 0.035, 0.022, M['wood'], zone, bevel=0.008, ry=math.atan2(-uz, ux))
    for s in (-1, 1):   # ขาโค้งเหล็ก (ข้าง)
        px, pz = x + ux * s * 0.6, z + uz * s * 0.6
        pts = [(px + nx * 0.12, 0.0, pz + nz * 0.12), (px + nx * 0.1, 0.06, pz + nz * 0.1), (px, 0.085, pz), (px - nx * 0.12, 0.085, pz - nz * 0.12),
               (px - nx * 0.16, 0.2, pz - nz * 0.16), (px - nx * 0.17, 0.33, pz - nz * 0.17)]
        tube(f'{name}_leg{s}', pts, 0.016, M['metal'], zone, tseg=8)
        tube(f'{name}_legb{s}', [(px - nx * 0.12, 0.0, pz - nz * 0.12), (px - nx * 0.12, 0.085, pz - nz * 0.12)], 0.015, M['metal'], zone, tseg=8)
        tube(f'{name}_arm{s}', [(px + nx * 0.1, 0.16, pz + nz * 0.1), (px - nx * 0.06, 0.17, pz - nz * 0.06), (px - nx * 0.16, 0.2, pz - nz * 0.16)], 0.014, M['metal'], zone, tseg=8)
    col_box(x - nx * 0.02, z - nz * 0.02, 0.7, 0.2, math.atan2(-uz, ux), 'bench')
    for k, s in enumerate((-0.33, 0.33)):
        MAP['seats'].append({'id': f'{name.lower()}_{k}', 'x': round(x + ux * s + nx * 0.16, 3), 'z': round(z + uz * s + nz * 0.16, 3), 'ry': round(face, 4), 'y': 0.0})


def lamp(name, x, z, zone, glass='glassW', h=2.1):
    lathe(f'{name}_base', [(0.0, 0.0), (0.16, 0.0), (0.16, 0.06), (0.1, 0.1), (0.07, 0.2), (0.0, 0.2)], M['metal'], zone, cx=x, cz=z, seg=20)
    tube(f'{name}_pole', [(x, 0.15, z), (x, h - 0.2, z)], 0.035, M['metal'], zone, tseg=12)
    # โคมทรงบ้านหลังเล็ก: ฐาน กระจก หลังคา ยอด
    lathe(f'{name}_cup', [(0.0, h - 0.24), (0.09, h - 0.22), (0.13, h - 0.17), (0.0, h - 0.17)], M['metal'], zone, cx=x, cz=z, seg=16)
    lathe(f'{name}_glass', [(0.0, h - 0.17), (0.11, h - 0.17), (0.13, h + 0.02), (0.0, h + 0.02)], M[glass], zone, cx=x, cz=z, seg=6, smooth=False)
    lathe(f'{name}_roof', [(0.0, h + 0.02), (0.18, h + 0.02), (0.16, h + 0.05), (0.06, h + 0.14), (0.0, h + 0.18)], M['metal'], zone, cx=x, cz=z, seg=6, smooth=False)
    lathe(f'{name}_tip', [(0.0, h + 0.17), (0.03, h + 0.19), (0.0, h + 0.26)], M['gold'], zone, cx=x, cz=z, seg=10)
    col_circle(x, z, 0.2, 'lamp')


def flower_bed(name, a, zone):
    """แปลงดอกไม้โค้ง (ขอบอิฐ + พุ่มไม้ปั้น + ดอกหลากสี) ระหว่างทางเดินรอบลาน"""
    r0, r1 = 9.9, 11.4
    a0, a1 = a - 0.42, a + 0.42
    bm = bmesh.new()
    n = 18
    for k in range(n):
        for rr, h in ((r0, 0.0), (r1, 0.0)):
            pass
    # ขอบแปลง: ท่อโค้งสองเส้น
    for rr in (r0, r1):
        tube(f'{name}_edge{rr}', [(math.cos(a0 + (a1 - a0) * t) * rr, 0.06, math.sin(a0 + (a1 - a0) * t) * rr) for t in [k / 16 for k in range(17)]], 0.07, M['curb'], zone, tseg=8)
    # ดิน
    soil = []
    for k in range(17):
        t = k / 16; aa = a0 + (a1 - a0) * t
        soil.append((aa, r0, r1))
    bm = bmesh.new()
    rows = [[bm.verts.new(W(math.cos(aa) * rr, 0.07, math.sin(aa) * rr)) for rr in (r0, r1)] for aa, r0_, r1_ in soil for _ in [0]]
    for k in range(16):
        bm.faces.new((rows[k][0], rows[k + 1][0], rows[k + 1][1], rows[k][1]))
    obj_from_bm(f'{name}_soil', bm, M['trunk'], zone)
    # พุ่ม
    cs = []
    for k in range(6):
        aa = a0 + (a1 - a0) * (k + 0.5) / 6; rr = (r0 + r1) / 2 + rnd.uniform(-0.15, 0.15)
        cs.append((math.cos(aa) * rr, 0.25, math.sin(aa) * rr, 0.42, 0.3, 0.42))
    blob(f'{name}_bush', cs, M['leaf2'], zone, voxel=0.045, tris=1200)
    # ดอกไม้ (กลีบ 5 กลีบ + เกสร) โผล่เหนือพุ่ม
    cols = ['red', 'yellow', 'violet', 'pink', 'white', 'orange']
    for k in range(14):
        aa = a0 + (a1 - a0) * rnd.random(); rr = rnd.uniform(r0 + 0.2, r1 - 0.2)
        fx, fz = math.cos(aa) * rr, math.sin(aa) * rr
        flower(f'{name}_f{k}', fx, rnd.uniform(0.42, 0.52), fz, M[cols[k % len(cols)]], zone)
    MAP['colliders'].append({'t': 'arc', 'r0': r0 - 0.1, 'r1': r1 + 0.1, 'a0': round(a0, 4), 'a1': round(a1, 4), 'tag': 'flowerbed'})


def flower(name, x, y, z, m, zone, s=0.07):
    pts = []
    for i in range(5):
        a = TAU * i / 5
        pts.append((x + math.cos(a) * s * 0.55, y, z + math.sin(a) * s * 0.55, s * 0.5, s * 0.22, s * 0.5))
    blob(name, pts, m, zone, voxel=0.014, smooth=2, tris=110)
    lathe(name + '_c', [(0.0, y + 0.01), (s * 0.28, y + 0.025), (0.0, y + 0.05)], M['yellow'], zone, cx=x, cz=z, seg=10)


def signpost(x, z, zone):
    lathe('Sign_post', [(0.0, 0.0), (0.09, 0.0), (0.07, 0.06), (0.06, 2.0), (0.0, 2.08)], M['wood2'], zone, cx=x, cz=z, seg=12)
    lathe('Sign_cap', [(0.0, 2.04), (0.1, 2.04), (0.0, 2.2)], M['roofB'], zone, cx=x, cz=z, seg=12)
    arrows = [('LEARNING HALL', 0.0, -1, 1.75, 'sky'), ('EVENT PLAZA', 0.0, 1, 1.5, 'orange'), ('BATTLE ARENA', -1, 0, 1.25, 'red'), ('BOUTIQUE', 1, 0, 1.0, 'violet')]
    for label, dx, dz, h, c in arrows:
        ry = math.atan2(-dz, dx)
        L = 0.95
        pts = [(-0.05, -0.1), (L - 0.12, -0.1), (L, 0.0), (L - 0.12, 0.1), (-0.05, 0.1)]
        # ป้ายชี้ทิศ: แผ่นไม้ปลายลูกศร หมุนรอบเสา (ระนาบป้ายตั้ง)
        bm = bmesh.new()
        f = [bm.verts.new(V((u, 0.02, v))) for u, v in pts]
        b = [bm.verts.new(V((u, -0.02, v))) for u, v in pts]
        bm.faces.new(f[::-1]); bm.faces.new(b)
        for i in range(len(pts)):
            bm.faces.new((f[i], f[(i + 1) % len(pts)], b[(i + 1) % len(pts)], b[i]))
        bmesh.ops.rotate(bm, cent=V((0, 0, 0)), matrix=Matrix.Rotation(ry, 3, 'Z'), verts=bm.verts)
        bmesh.ops.translate(bm, vec=W(x, h, z), verts=bm.verts)
        ob = obj_from_bm(f'Sign_{label}', bm, M[c], zone, smooth=False)
        bv = ob.modifiers.new('b', 'BEVEL'); bv.width = 0.012; bv.segments = 2; apply_mods(ob)
        # ตัวอักษรทั้งสองด้านของป้าย
        mx, mz = x + math.cos(ry) * L * 0.45, z - math.sin(ry) * L * 0.45
        for side in (1, -1):
            nx_, nz_ = -math.sin(ry) * side, -math.cos(ry) * side
            text3d(f'SignT_{label}{side}', label, 0.085, M['white'], zone, mx + nx_ * 0.024, h, mz + nz_ * 0.024, ry=ry if side > 0 else ry + math.pi, depth=0.006)
    col_circle(x, z, 0.14, 'sign')


# =====================================================================
# ต้นไม้ · พุ่มไม้ขอบแผนที่
# =====================================================================
def tree(name, x, z, kind, zone, s=1.0):
    h = rnd.uniform(1.6, 2.0) * s
    lean = (rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12))
    trunk_pts = [(x, 0.0, z), (x + lean[0] * 0.3, h * 0.35, z + lean[1] * 0.3), (x + lean[0], h * 0.75, z + lean[1]), (x + lean[0] * 1.2, h, z + lean[1] * 1.2)]
    tube(f'{name}_trunk', trunk_pts, 0.16 * s, M['trunk'], zone, tseg=10, r1=0.09 * s)
    lathe(f'{name}_root', [(0.0, 0.0), (0.32 * s, 0.0), (0.2 * s, 0.05), (0.15 * s, 0.18), (0.0, 0.2)], M['trunk'], zone, cx=x, cz=z, seg=10,
          mod=lambda a, hh: 1 + 0.35 * max(0.0, math.cos(5 * a)) * (1 - hh / 0.2))
    tx, tz = x + lean[0] * 1.2, z + lean[1] * 1.2
    if kind == 'pine':
        cs = []
        for i, (r, yy) in enumerate(((1.0, 0.0), (0.8, 0.55), (0.58, 1.05), (0.36, 1.45))):
            for k in range(6):
                a = TAU * k / 6 + i
                cs.append((tx + math.cos(a) * r * 0.55 * s, h * 0.6 + yy * s, tz + math.sin(a) * r * 0.55 * s, r * 0.6 * s, 0.32 * s, r * 0.6 * s))
        blob(f'{name}_leaf', cs, M['leaf2'], zone, voxel=0.06 * s, tris=1400)
    else:
        m = M['blossom'] if kind == 'blossom' else (M['leaf'] if kind == 'round' else M['leaf3'])
        cs = [(tx, h + 0.45 * s, tz, 0.95 * s, 0.75 * s, 0.95 * s)]
        for k in range(7):
            a = TAU * k / 7 + rnd.uniform(-0.3, 0.3)
            cs.append((tx + math.cos(a) * 0.7 * s, h + rnd.uniform(0.15, 0.6) * s, tz + math.sin(a) * 0.7 * s,
                       rnd.uniform(0.5, 0.65) * s, rnd.uniform(0.42, 0.55) * s, rnd.uniform(0.5, 0.65) * s))
        cs.append((tx, h + 1.0 * s, tz, 0.6 * s, 0.45 * s, 0.6 * s))
        blob(f'{name}_leaf', cs, m, zone, voxel=0.06 * s, tris=1500)
        if kind == 'blossom':   # กลีบดอกร่วงใต้ต้น
            for k in range(10):
                a = rnd.uniform(0, TAU); rr = rnd.uniform(0.5, 1.4) * s
                lathe(f'{name}_pet{k}', [(0.0, 0.004), (0.05, 0.004), (0.0, 0.012)], M['blossom'], zone, cx=x + math.cos(a) * rr, cz=z + math.sin(a) * rr, seg=6)
    col_circle(x, z, 0.32 * s, 'tree')


def hedge_border():
    """พุ่มไม้ปั้นรอบขอบแผนที่ (กำแพงธรรมชาติ) — เว้นมุมไว้วางต้นไม้"""
    E = 24.0
    for side in range(4):
        for seg_i in range(6):
            t0 = -20 + seg_i * 7.0
            cs = []
            for k in range(7):
                u = t0 + k * 0.95 + rnd.uniform(-0.2, 0.2)
                if side == 0: px, pz = u, -E
                elif side == 1: px, pz = E, u
                elif side == 2: px, pz = -u, E
                else: px, pz = -E, -u
                cs.append((px, 0.45, pz, 0.75, rnd.uniform(0.5, 0.65), 0.75))
            blob(f'Hedge{side}_{seg_i}', cs, M['leaf2'] if seg_i % 2 else M['leaf'], f'nature{side}', voxel=0.07, tris=900)


def nature():
    spots = [(11.5, -11.5, 'round', 'nature0'), (13.8, -8.0, 'pine', 'nature0'), (8.2, -13.4, 'blossom', 'nature0'),
             (-11.5, -11.5, 'blossom', 'nature3'), (-13.8, -8.0, 'round', 'nature3'), (-8.2, -13.4, 'pine', 'nature3'),
             (11.6, 11.0, 'round', 'nature1'), (14.0, 7.6, 'blossom', 'nature1'), (9.4, 13.0, 'pine', 'nature1'),
             (-11.6, 11.0, 'pine', 'nature2'), (-14.0, 7.6, 'round', 'nature2'), (-9.4, 13.0, 'blossom', 'nature2'),
             (20.5, -12.5, 'pine', 'nature0'), (20.5, 12.5, 'round', 'nature1'), (-20.5, 12.5, 'blossom', 'nature2'), (-20.5, -12.5, 'round', 'nature3'),
             (12.0, -21.0, 'round', 'nature0'), (-12.0, -21.0, 'pine', 'nature3'), (12.5, 21.0, 'blossom', 'nature1'), (-12.5, 21.0, 'round', 'nature2'),
             (21.6, -21.6, 'pine', 'nature0'), (21.6, 21.6, 'pine', 'nature1'), (-21.6, 21.6, 'round', 'nature2'), (-21.6, -21.6, 'blossom', 'nature3'),
             (6.5, -22.0, 'pine', 'nature0'), (-6.5, -22.0, 'round', 'nature3')]
    for i, (x, z, k, zone) in enumerate(spots):
        tree(f'Tree{i}', x, z, k, zone, s=rnd.uniform(0.9, 1.15))
    hedge_border()
    # พุ่มไม้เตี้ยกระจาย + ดอกไม้กลุ่มเล็กบนสนามหญ้า
    for i in range(18):
        a = rnd.uniform(0, TAU); r = rnd.uniform(13.5, 21.5)
        x, z = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 3.2 or abs(z) < 3.2 or (abs(x) < 7 and z > 13) or (abs(x) < 7.5 and z < -15) or (abs(z) < 6 and abs(x) > 13.5):
            continue
        zone = 'nature' + str((0 if x > 0 and z < 0 else 1 if x > 0 else 2 if z > 0 else 3))
        blob(f'Bush{i}', [(x, 0.22, z, 0.45, 0.32, 0.4), (x + 0.35, 0.18, z + 0.1, 0.32, 0.25, 0.3)], M['leaf3'], zone, voxel=0.045, tris=500)
        col_circle(x + 0.15, z + 0.05, 0.55, 'bush')


# =====================================================================
# อาคาร
# =====================================================================
def arched_window(name, x, y, z, w, h, ry, zone, glass='glass', frame='white'):
    """หน้าต่างโค้ง: กระจก + กรอบ + ซุ้มโค้ง + ขอบหน้าต่าง + ช่องแบ่ง"""
    pts = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h - w / 2)] + [(math.cos(a) * w / 2, h - w / 2 + math.sin(a) * w / 2) for a in [math.pi * k / 10 for k in range(1, 10)]] + [(-w / 2, h - w / 2)]
    prism_xy(f'{name}_g', pts, 0.03, M[glass], zone, x, y, z, ry, bevel=0.0)
    nx, nz = math.sin(ry), math.cos(ry)
    fp = [(x + math.cos(ry) * u + nx * 0.03, y + v, z - math.sin(ry) * u + nz * 0.03) for u, v in pts] + [(x + math.cos(ry) * pts[0][0] + nx * 0.03, y + pts[0][1], z - math.sin(ry) * pts[0][0] + nz * 0.03)]
    tube(f'{name}_f', fp, 0.03, M[frame], zone, tseg=6)
    tube(f'{name}_m', [(x + nx * 0.035, y, z + nz * 0.035), (x + nx * 0.035, y + h, z + nz * 0.035)], 0.014, M[frame], zone, tseg=6)
    tube(f'{name}_m2', [(x - math.cos(ry) * w / 2 + nx * 0.035, y + h * 0.5, z + math.sin(ry) * w / 2 + nz * 0.035),
                        (x + math.cos(ry) * w / 2 + nx * 0.035, y + h * 0.5, z - math.sin(ry) * w / 2 + nz * 0.035)], 0.014, M[frame], zone, tseg=6)
    box(f'{name}_sill', x + nx * 0.06, y - 0.06, z + nz * 0.06, w + 0.18, 0.06, 0.14, M[frame], zone, bevel=0.02, ry=ry)


def gable_roof(name, x, z, y, length, depth, rise, m, m2, zone, ry=0.0, overhang=0.35):
    """หลังคาจั่วกระเบื้อง: แผ่นหลังคาสองด้าน (หนา) + แถวกระเบื้องซ้อนเป็นขั้น + สันหลังคา"""
    hw = depth / 2 + overhang
    L = length + overhang * 2
    for side in (1, -1):
        rows = 7
        for r in range(rows):
            t0 = r / rows
            yy = y + rise * (1 - t0) - 0.02
            dz = side * hw * (1 - t0)
            slope = math.atan2(rise, hw)
            cx, cz = x + math.sin(ry) * dz, z + math.cos(ry) * dz
            ob = box(f'{name}_t{side}{r}', cx, yy - 0.05, cz, L, 0.07, hw / rows * 1.25, m if r % 2 else m2, zone, bevel=0.025, ry=ry)
            ob.data.transform(Matrix.Translation(W(cx, yy, cz)) @ Matrix.Rotation(-side * slope, 4, V((math.cos(ry), -math.sin(ry), 0))) @ Matrix.Translation(-W(cx, yy, cz)))
    # สัน
    ax, az = math.cos(ry) * L / 2, -math.sin(ry) * L / 2
    tube(f'{name}_ridge', [(x - ax, y + rise + 0.02, z - az), (x + ax, y + rise + 0.02, z + az)], 0.09, m2, zone, tseg=10)
    # หน้าจั่วสามเหลี่ยม (ผนัง) ทั้งสองด้าน
    return hw


def learning_hall():
    Z = 'hall'
    x, z = 0.0, -19.6
    W_, D_, H_ = 11.0, 5.6, 3.3
    box('Hall_Plinth', x, 0.0, z, W_ + 0.6, 0.32, D_ + 0.6, M['stone'], Z, bevel=0.06)
    box('Hall_Walls', x, 0.3, z, W_, H_, D_, M['cream'], Z, bevel=0.08)
    box('Hall_Band', x, 0.3 + H_ - 0.28, z, W_ + 0.12, 0.22, D_ + 0.12, M['lav'], Z, bevel=0.04)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(f'Hall_Pilaster{sx}{sz}', x + sx * W_ / 2, 0.3, z + sz * D_ / 2, 0.42, H_ + 0.05, 0.42, M['lav'], Z, bevel=0.05)
    # หลังคาจั่ว
    gable_roof('Hall_Roof', x, z, 0.3 + H_, W_, D_, 1.6, M['roofB'], M['roofB2'], Z)
    for sx in (-1, 1):   # ผนังจั่ว (สามเหลี่ยม) ด้านข้าง
        prism_xy(f'Hall_Gable{sx}', [(-D_ / 2, 0.0), (D_ / 2, 0.0), (0.0, 1.55)], 0.2, M['cream'], Z, x + sx * (W_ / 2 - 0.1), 0.3 + H_, z, ry=math.pi / 2, bevel=0.03)
    # มุขหน้า (portico): หน้าจั่วเล็ก + เสากลม 2 ต้น + ตราหนังสือ
    fz = z + D_ / 2
    box('Hall_PorchRoofBase', x, 2.65, fz + 0.75, 3.4, 0.2, 1.7, M['lav'], Z, bevel=0.05)
    prism_xy('Hall_Pediment', [(-1.85, 0.0), (1.85, 0.0), (0.0, 0.95)], 1.9, M['roofB'], Z, x, 2.82, fz + 0.75, bevel=0.04)
    prism_xy('Hall_PedimentFace', [(-1.45, 0.0), (1.45, 0.0), (0.0, 0.7)], 0.06, M['cream'], Z, x, 2.88, fz + 1.72, bevel=0.01)
    # ตราหนังสือเปิด (2 หน้า) บนหน้าจั่ว
    for s in (-1, 1):
        prism_xy(f'Hall_Book{s}', [(0.0, 0.0), (s * 0.34, 0.06), (s * 0.34, 0.34), (0.0, 0.28)], 0.04, M['white'], Z, x, 3.0, fz + 1.77, bevel=0.008)
    tube('Hall_BookSpine', [(x, 3.0, fz + 1.8), (x, 3.29, fz + 1.8)], 0.02, M['gold'], Z, tseg=6)
    for sx in (-1, 1):
        cx_ = x + sx * 1.35
        lathe(f'Hall_Col{sx}', [(0.0, 0.32), (0.2, 0.32), (0.2, 0.42), (0.15, 0.48), (0.13, 2.45), (0.17, 2.52), (0.2, 2.58), (0.2, 2.66), (0.0, 2.66)],
              M['white'], Z, cx=cx_, cz=fz + 1.45, seg=24, mod=lambda a, h: 1 + (0.06 * max(0.0, math.cos(12 * a)) if 0.5 < h < 2.4 else 0))
        col_circle(cx_, fz + 1.45, 0.24, 'column')
    # ประตูคู่ + ซุ้มโค้ง
    box('Hall_DoorFrame', x, 0.3, fz + 0.02, 1.7, 1.9, 0.14, M['wood2'], Z, bevel=0.03)
    for s in (-1, 1):
        box(f'Hall_Door{s}', x + s * 0.39, 0.32, fz + 0.08, 0.74, 1.62, 0.06, M['wood'], Z, bevel=0.02)
        for k in range(2):
            box(f'Hall_DoorPanel{s}{k}', x + s * 0.39, 0.5 + k * 0.72, fz + 0.115, 0.5, 0.56, 0.02, M['wood2'], Z, bevel=0.01)
        lathe(f'Hall_Knob{s}', [(0.0, 0.0), (0.035, 0.0), (0.0, 0.05)], M['gold'], Z, cx=x + s * 0.1, cz=fz + 0.16, y0=1.1, seg=10)
    tube('Hall_DoorArch', [(x + math.cos(a) * 0.88, 2.2 + math.sin(a) * 0.45, fz + 0.09) for a in [math.pi * k / 14 for k in range(15)]], 0.07, M['lav'], Z, tseg=8)
    # ป้ายชื่อ
    box('Hall_SignBoard', x, 2.18, fz + 0.12, 2.9, 0.42, 0.08, M['navy'], Z, bevel=0.03)
    text3d('Hall_SignText', 'LEARNING HALL', 0.24, M['gold'], Z, x, 2.39, fz + 0.18, depth=0.02)
    # หน้าต่างโค้ง
    for k, wx in enumerate((-4.2, -2.6, 2.6, 4.2)):
        arched_window(f'Hall_Win{k}', x + wx, 1.0, fz + 0.02, 0.85, 1.55, 0.0, Z)
    for sx in (-1, 1):
        for k, wz in enumerate((-1.3, 1.3)):
            arched_window(f'Hall_SWin{sx}{k}', x + sx * (W_ / 2 + 0.02), 1.0, z + wz, 0.8, 1.45, sx * math.pi / 2, Z)
    # หน้าต่างกลมบนหน้าจั่วข้าง + บันได
    for k in range(3):
        box(f'Hall_Step{k}', x, 0.0, fz + 2.35 - k * 0.32, 3.6 - k * 0.3, 0.32 - k * 0.1, 0.5, M['stone'], Z, bevel=0.03)
    # กระถางต้นไม้ข้างประตู
    for s in (-1, 1):
        px = x + s * 2.4
        lathe(f'Hall_Pot{s}', [(0.0, 0.0), (0.26, 0.0), (0.34, 0.42), (0.38, 0.46), (0.3, 0.46), (0.0, 0.4)], M['roofR'], Z, cx=px, cz=fz + 1.3, seg=24)
        blob(f'Hall_Topiary{s}', [(px, 0.85, fz + 1.3, 0.34, 0.34, 0.34), (px, 1.22, fz + 1.3, 0.24, 0.24, 0.24)], M['leaf2'], Z, voxel=0.03, tris=700)
        col_circle(px, fz + 1.3, 0.4, 'pot')
    col_box(x, z, W_ / 2 + 0.3, D_ / 2 + 0.3, 0.0, 'hall')
    MAP['zones'].append({'id': 'learning_hall', 'name': 'Learning Hall', 'th': 'อาคารเรียน', 'x': x, 'z': fz + 2.0, 'r': 6.0, 'color': '#4f7fe0'})
    MAP['interact'].append({'id': 'learning_hall', 'kind': 'learning', 'x': x, 'z': fz + 3.0, 'r': 2.0, 'label': 'Learning Hall', 'th': 'เข้าเรียน คำศัพท์ / แกรมม่า / TOEIC'})


def battle_arena():
    Z = 'arena'
    cx, cz = -19.2, 0.0
    R0, R1, H = 4.15, 4.6, 2.9
    gate = 0.36   # ช่องประตู (เรเดียน ครึ่งหนึ่ง) หันไปทางลานกลาง (+x)
    # กำแพงวงกลมเว้นช่องประตู: สร้างเป็นช่วง ๆ ของ lathe ปิด
    bm = bmesh.new()
    prof = [(R0, 0.0), (R1, 0.0), (R1, H), (R1 + 0.14, H + 0.1), (R1 + 0.14, H + 0.26), (R0 - 0.08, H + 0.26), (R0 - 0.08, H + 0.1), (R0, H)]
    n = 72
    angs = [gate + (TAU - 2 * gate) * i / n for i in range(n + 1)]
    rings = [[bm.verts.new(W(cx + math.cos(a) * r, h, cz + math.sin(a) * r)) for r, h in prof] for a in angs]
    for i in range(n):
        for j in range(len(prof)):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % len(prof)], rings[i + 1][(j + 1) % len(prof)], rings[i + 1][j]))
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    obj_from_bm('Arena_Wall', bm, M['stone2'], Z)
    # แถบหินสีแดงรอบกำแพง + ใบเสมา
    for k in range(36):
        a = gate + 0.08 + (TAU - 2 * gate - 0.16) * k / 35
        box(f'Arena_Merlon{k}', cx + math.cos(a) * (R0 + R1) / 2, H + 0.26, cz + math.sin(a) * (R0 + R1) / 2, 0.42, 0.34, 0.5, M['stone2'], Z, bevel=0.05, ry=-a)
    for k in range(10):
        a = gate + 0.3 + (TAU - 2 * gate - 0.6) * k / 9
        bx, bz = cx + math.cos(a) * (R1 + 0.05), cz + math.sin(a) * (R1 + 0.05)
        # ธงแขวนผนัง (ปลายแฉก) สลับแดง/เหลือง พร้อมดาว
        pts = [(-0.32, 0.0), (0.32, 0.0), (0.32, -1.1), (0.0, -0.86), (-0.32, -1.1)]
        prism_xy(f'Arena_Banner{k}', pts, 0.03, M['red'] if k % 2 else M['yellow'], Z, bx, H - 0.05, bz, ry=-a + math.pi / 2, bevel=0.005)
        star = [(math.cos(math.pi / 2 + TAU * i / 10) * (0.13 if i % 2 == 0 else 0.055), -0.42 + math.sin(math.pi / 2 + TAU * i / 10) * (0.13 if i % 2 == 0 else 0.055)) for i in range(10)]
        prism_xy(f'Arena_BannerStar{k}', star, 0.02, M['white'] if k % 2 else M['red'], Z, bx + math.cos(a) * 0.03, H - 0.05, bz + math.sin(a) * 0.03, ry=-a + math.pi / 2, bevel=0.0)
    # หอคอยประตู 2 ข้าง (หลังคากรวยแดง + ธงชาย)
    for s in (-1, 1):
        a = s * gate
        tx, tz = cx + math.cos(a) * (R0 + R1) / 2, cz + math.sin(a) * (R0 + R1) / 2
        lathe(f'Arena_Tower{s}', [(0.0, 0.0), (0.82, 0.0), (0.8, 3.6), (0.95, 3.72), (0.95, 3.95), (0.0, 3.95)], M['stone'], Z, cx=tx, cz=tz, seg=32,
              mod=lambda aa, h: 1 + (0.03 if (int(h * 4) % 2 == 0 and h < 3.5) else 0))
        lathe(f'Arena_TowerRoof{s}', [(0.0, 3.95), (1.12, 3.95), (1.08, 4.05), (0.6, 4.7), (0.0, 5.45)], M['roofR'], Z, cx=tx, cz=tz, seg=32,
              mod=lambda aa, h: 1 + 0.025 * math.cos(16 * aa))
        tube(f'Arena_Flagpole{s}', [(tx, 5.4, tz), (tx, 6.1, tz)], 0.025, M['metal'], Z, tseg=6)
        prism_xy(f'Arena_Pennant{s}', [(0.0, 0.0), (0.55, -0.14), (0.0, -0.28)], 0.015, M['yellow'], Z, tx, 6.08, tz, ry=0.0, bevel=0.0)
        for k in range(2):
            arched_window(f'Arena_TWin{s}{k}', tx + 0.81 * math.cos(0.0), 1.2 + k * 1.2, tz, 0.3, 0.55, math.pi / 2, Z, glass='glassW', frame='stone2')
        col_circle(tx, tz, 0.95, 'tower')
    # ซุ้มประตู (โค้งหนา) + ป้าย
    gx = cx + (R0 + R1) / 2 * math.cos(gate)
    arch_pts = [(gx + 0.1, 2.15 + math.sin(t) * 0.75, cz + math.cos(t) * 1.95) for t in [math.pi * k / 16 for k in range(17)]]
    tube('Arena_Arch', arch_pts, 0.22, M['stone'], Z, tseg=10)
    box('Arena_SignBoard', gx + 0.32, 2.62, cz, 0.1, 0.48, 2.6, M['red'], Z, bevel=0.03)
    text3d('Arena_SignText', 'BATTLE ARENA', 0.25, M['yellow'], Z, gx + 0.39, 2.86, cz, ry=math.pi / 2, depth=0.02)
    # พื้นสนามทราย + เวทีกลาง (มองเห็นผ่านประตู)
    lathe('Arena_Sand', [(0.0, 0.02), (R0, 0.02), (R0, 0.0)], M['sand'], Z, cx=cx, cz=cz, seg=64)
    lathe('Arena_Stage', [(0.0, 0.18), (1.4, 0.18), (1.5, 0.12), (1.5, 0.0)], M['stone2'], Z, cx=cx, cz=cz, seg=48)
    star = [(math.cos(math.pi / 2 + TAU * i / 10) * (0.9 if i % 2 == 0 else 0.38), math.sin(math.pi / 2 + TAU * i / 10) * (0.9 if i % 2 == 0 else 0.38)) for i in range(10)]
    bm = bmesh.new()
    vs = [bm.verts.new(W(cx + u, 0.185, cz + v)) for u, v in star]
    c = bm.verts.new(W(cx, 0.185, cz))
    for i in range(10):
        bm.faces.new((c, vs[(i + 1) % 10], vs[i]))
    obj_from_bm('Arena_StageStar', bm, M['yellow'], Z, smooth=False)
    # ไม้กั้น (ดาบไขว้ประดับหน้าประตู)
    for s in (-1, 1):
        tube(f'Arena_Sword{s}', [(gx + 0.42, 2.1 - 0.35, cz + s * 0.3), (gx + 0.42, 2.1 + 0.25, cz - s * 0.3)], 0.03, M['white'], Z, tseg=6, r1=0.012)
    col_circle(cx, cz, R1 + 0.2, 'arena')
    MAP['zones'].append({'id': 'battle_arena', 'name': 'Battle Arena', 'th': 'สนามประลอง', 'x': gx + 2.0, 'z': cz, 'r': 6.0, 'color': '#e45b4c'})
    MAP['interact'].append({'id': 'battle_arena', 'kind': 'battle', 'x': round(gx + 1.6, 3), 'z': cz, 'r': 2.0, 'label': 'Battle Arena', 'th': 'ชวนแข่ง / ห้องแข่ง / Ranked'})


def boutique():
    Z = 'boutique'
    x, z = 19.6, 0.0
    D_, W_, H_ = 5.0, 8.4, 3.0     # D = แกน x (ลึก) · W = แกน z (กว้าง) · หน้าร้านหันไป -x (ลานกลาง)
    box('Shop_Plinth', x, 0.0, z, D_ + 0.5, 0.25, W_ + 0.5, M['stone'], Z, bevel=0.05)
    box('Shop_Walls', x, 0.24, z, D_, H_, W_, M['pink'], Z, bevel=0.08)
    box('Shop_Trim', x, 0.24 + H_ - 0.2, z, D_ + 0.1, 0.2, W_ + 0.1, M['white'], Z, bevel=0.04)
    # หลังคาทรงแมนซาร์ด (ลาดชันรอบด้าน + ยอดแบน) สีม่วง + หน้าต่างใต้หลังคา
    lathe('Shop_RoofDummy', [(0.0, 0.0), (0.0, 0.0)], M['roofP'], Z)   # (ตัวกันชื่อซ้ำ — ลบทีหลัง)
    bm = bmesh.new()
    y0, y1 = 0.24 + H_, 0.24 + H_ + 1.25
    o0 = (D_ / 2 + 0.3, W_ / 2 + 0.3); o1 = (D_ / 2 - 0.55, W_ / 2 - 0.55)
    ring0 = [bm.verts.new(W(x + sx * o0[0], y0, z + sz * o0[1])) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ring1 = [bm.verts.new(W(x + sx * o1[0], y1, z + sz * o1[1])) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        bm.faces.new((ring0[i], ring0[(i + 1) % 4], ring1[(i + 1) % 4], ring1[i]))
    bm.faces.new(ring1); bm.faces.new(ring0[::-1])
    roof = obj_from_bm('Shop_Roof', bm, M['roofP'], Z, smooth=False)
    bv = roof.modifiers.new('b', 'BEVEL'); bv.width = 0.08; bv.segments = 3; apply_mods(roof)
    # แถบคิ้วหลังคา (สีเข้ม) 2 แนว รอบหลังคาแมนซาร์ด
    for k, (t, w_) in enumerate(((0.33, 0.06), (0.7, 0.05))):
        yy = y0 + 1.25 * t
        ox = o0[0] + (o1[0] - o0[0]) * t + 0.03; oz = o0[1] + (o1[1] - o0[1]) * t + 0.03
        tube(f'Shop_RoofBand{k}', [(x + sx * ox, yy, z + sz * oz) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))], w_, M['roofP2'], Z, tseg=8, closed=True)
    for k, wz in enumerate((-2.2, 0.0, 2.2)):   # หน้าต่างใต้หลังคา (dormer)
        box(f'Shop_Dormer{k}', x - D_ / 2 + 0.05, y0 + 0.2, z + wz, 0.55, 0.75, 0.9, M['white'], Z, bevel=0.06)
        arched_window(f'Shop_DormerWin{k}', x - D_ / 2 - 0.23, y0 + 0.28, z + wz, 0.55, 0.55, -math.pi / 2, Z, glass='glassW')
    fx = x - D_ / 2
    # หน้าร้าน: กระจกโชว์ใหญ่ 2 บาน + ประตูกลาง
    for s in (-1, 1):
        box(f'Shop_Window{s}', fx - 0.02, 0.55, z + s * 2.35, 0.06, 1.7, 2.6, M['glass'], Z, bevel=0.0)
        box(f'Shop_WindowFrame{s}', fx - 0.04, 0.45, z + s * 2.35, 0.08, 0.12, 2.8, M['white'], Z, bevel=0.02)
        box(f'Shop_WindowFrameT{s}', fx - 0.04, 2.25, z + s * 2.35, 0.08, 0.12, 2.8, M['white'], Z, bevel=0.02)
        for e in (-1, 1):
            box(f'Shop_WindowPost{s}{e}', fx - 0.04, 0.45, z + s * 2.35 + e * 1.35, 0.1, 1.92, 0.12, M['white'], Z, bevel=0.02)
        # หุ่นโชว์ชุด (ตัวละครสไตล์เดียวกับ avatar: หัวกลมใหญ่ ตัวเล็ก) ใส่ชุดสีสด
        mx, mz = fx + 0.6, z + s * 2.35
        lathe(f'Shop_MannBase{s}', [(0.0, 0.25), (0.3, 0.25), (0.3, 0.3), (0.05, 0.32), (0.035, 0.55), (0.0, 0.55)], M['gold'], Z, cx=mx, cz=mz, seg=20)
        blob(f'Shop_MannBody{s}', [(mx, 0.75, mz, 0.17, 0.24, 0.12), (mx, 0.95, mz, 0.2, 0.1, 0.13)], M['teal'] if s > 0 else M['violet'], Z, voxel=0.02, tris=600)
        lathe(f'Shop_MannSkirt{s}', [(0.0, 0.85), (0.16, 0.78), (0.27, 0.56), (0.0, 0.56)], M['yellow'] if s > 0 else M['sky'], Z, cx=mx, cz=mz, seg=24,
              mod=lambda a, h: 1 + 0.06 * math.cos(10 * a))
        lathe(f'Shop_MannHead{s}', [(0.0, 1.05), (0.12, 1.07), (0.2, 1.22), (0.2, 1.32), (0.12, 1.47), (0.0, 1.5)], M['white'], Z, cx=mx, cz=mz, seg=24)
        lathe(f'Shop_MannHat{s}', [(0.0, 1.42), (0.3, 1.42), (0.3, 1.45), (0.16, 1.47), (0.15, 1.6), (0.0, 1.62)], M['red'] if s > 0 else M['roofP'], Z, cx=mx, cz=mz, seg=24)
    box('Shop_Door', fx - 0.03, 0.26, z, 0.08, 1.75, 1.1, M['glass'], Z, bevel=0.0)
    box('Shop_DoorFrame', fx - 0.05, 0.24, z, 0.1, 1.95, 1.3, M['white'], Z, bevel=0.03)
    box('Shop_DoorFrameIn', fx - 0.06, 0.34, z, 0.11, 1.62, 0.95, M['glass'], Z, bevel=0.01)
    lathe('Shop_DoorHandle', [(0.0, 0.0), (0.03, 0.0), (0.03, 0.4), (0.0, 0.4)], M['gold'], Z, cx=fx - 0.13, cz=z + 0.32, y0=0.9, seg=8)
    # กันสาดลายทาง (สลับชมพู/ขาว) ปลายหยักโค้ง
    n = 12
    for k in range(n):
        zz = z - W_ / 2 + (k + 0.5) * W_ / n
        ob = box(f'Shop_Awning{k}', fx - 0.55, 2.35, zz, 1.15, 0.05, W_ / n + 0.01, M['red'] if k % 2 == 0 else M['white'], Z, bevel=0.01)
        ob.data.transform(Matrix.Translation(W(fx - 0.0, 2.6, zz)) @ Matrix.Rotation(-math.radians(22), 4, V((0, 1, 0))) @ Matrix.Translation(-W(fx - 0.0, 2.6, zz)))
        lathe(f'Shop_AwningScallop{k}', [(0.0, 0.0), (W_ / n / 2, 0.0), (W_ / n / 2, 0.04), (0.0, 0.04)], M['red'] if k % 2 == 0 else M['white'], Z, seg=16)
        sc = OBJS[-1]
        sc.data.transform(Matrix.Translation(W(fx - 1.12, 2.13, zz)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        bm2 = bmesh.new(); bm2.from_mesh(sc.data)
        bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if v.co.z > 2.13 + 0.001], context='VERTS')
        bm2.to_mesh(sc.data); bm2.free()
    # ป้ายร้าน + ไม้แขวนเสื้อ
    box('Shop_SignBoard', fx - 0.1, 2.75 + 0.05, z, 0.1, 0.5, 3.6, M['white'], Z, bevel=0.04)
    text3d('Shop_SignText', 'AVATAR BOUTIQUE', 0.26, M['roofP2'], Z, fx - 0.17, 3.05, z, ry=-math.pi / 2, depth=0.02)
    hanger = [(fx - 0.18, 3.62, z + u, ) for u in ()]
    hp = [(-0.32, 0.0), (0.0, 0.2), (0.32, 0.0), (-0.32, 0.0)]
    tube('Shop_Hanger', [(fx - 0.2, 3.46 + v, z + u) for u, v in hp], 0.025, M['gold'], Z, tseg=6)
    tube('Shop_HangerHook', [(fx - 0.2, 3.66, z), (fx - 0.2, 3.76, z), (fx - 0.2, 3.8, z + 0.06), (fx - 0.2, 3.76, z + 0.1)], 0.02, M['gold'], Z, tseg=6)
    # ราวเสื้อหน้าร้าน + เสื้อแขวน
    rx_, rz_ = fx - 1.7, z + 3.2
    for e in (-1, 1):
        tube(f'Shop_RackPost{e}', [(rx_, 0.0, rz_ + e * 0.8), (rx_, 1.15, rz_ + e * 0.8)], 0.025, M['metal'], Z, tseg=8)
    tube('Shop_RackBar', [(rx_, 1.15, rz_ - 0.8), (rx_, 1.15, rz_ + 0.8)], 0.022, M['metal'], Z, tseg=8)
    for k, c in enumerate(('teal', 'yellow', 'red', 'violet', 'sky')):
        gz = rz_ - 0.6 + k * 0.3
        pts = [(-0.12, 0.0), (0.12, 0.0), (0.14, 0.38), (0.24, 0.32), (0.27, 0.45), (0.1, 0.52), (-0.1, 0.52), (-0.27, 0.45), (-0.24, 0.32), (-0.14, 0.38)]
        prism_xy(f'Shop_Shirt{k}', pts, 0.05, M[c], Z, rx_, 0.6, gz, ry=math.pi / 2, bevel=0.012)
    col_box(rx_, rz_, 0.25, 0.95, 0.0, 'rack')
    for s in (-1, 1):   # กระถางดอกไม้
        px, pz = fx - 0.55, z + s * 1.0
        lathe(f'Shop_Pot{s}', [(0.0, 0.0), (0.2, 0.0), (0.26, 0.32), (0.29, 0.36), (0.0, 0.33)], M['white'], Z, cx=px, cz=pz, seg=20)
        blob(f'Shop_PotBush{s}', [(px, 0.5, pz, 0.26, 0.2, 0.26)], M['leaf'], Z, voxel=0.025, tris=400)
        for k in range(4):
            a = TAU * k / 4
            flower(f'Shop_PotFlower{s}{k}', px + math.cos(a) * 0.14, 0.66, pz + math.sin(a) * 0.14, M['pink'] if k % 2 else M['yellow'], Z, s=0.05)
        col_circle(px, pz, 0.3, 'pot')
    col_box(x, z, D_ / 2 + 0.25, W_ / 2 + 0.25, 0.0, 'boutique')
    MAP['zones'].append({'id': 'avatar_boutique', 'name': 'Avatar Boutique', 'th': 'ร้านแต่งตัว', 'x': fx - 2.0, 'z': z, 'r': 6.0, 'color': '#9a6be3'})
    MAP['interact'].append({'id': 'avatar_boutique', 'kind': 'boutique', 'x': round(fx - 1.4, 3), 'z': z, 'r': 2.0, 'label': 'Avatar Boutique', 'th': 'ร้านค้า / ตู้เสื้อผ้า'})


# =====================================================================
# Event Plaza — Halloween Costume Festival 2026
# =====================================================================
def pumpkin(name, x, z, r, zone, y=0.0, face=False, ry=0.0):
    h = r * 1.6
    prof = [(0.0, 0.02 * r), (r * 0.6, 0.0), (r * 0.95, h * 0.18), (r, h * 0.45), (r * 0.9, h * 0.75), (r * 0.55, h * 0.95), (r * 0.18, h), (0.0, h * 0.94)]
    ob = lathe(name, prof, M['pumpkin'], zone, cx=x, cz=z, y0=y, seg=48, mod=lambda a, hh: 1 - 0.09 * (1 - (0.5 + 0.5 * math.cos(10 * a)) ** 0.6))
    lathe(name + '_stem', [(0.0, h * 0.9), (r * 0.12, h * 0.9), (r * 0.1, h * 1.12), (r * 0.13, h * 1.18), (0.0, h * 1.2)], M['stem'], zone, cx=x + r * 0.02, cz=z, y0=y, seg=8,
          mod=lambda a, hh: 1 + 0.12 * math.cos(6 * a))
    if face:   # หน้าแจ็กโอแลนเทิร์นยิ้ม (แผ่นสีเข้มบนผิว)
        nx, nz = math.sin(ry), math.cos(ry)
        fx, fz = x + nx * r * 0.97, z + nz * r * 0.97
        tri = [(-0.12, 0.0), (0.12, 0.0), (0.0, 0.16)]
        for s in (-1, 1):
            prism_xy(f'{name}_eye{s}', [(u * r * 1.6, v * r * 1.6) for u, v in tri], 0.03 * r, M['ink'], zone, fx + math.cos(ry) * s * r * 0.33, y + h * 0.52, fz - math.sin(ry) * s * r * 0.33, ry=ry, bevel=0.0)
        mouth = [(math.cos(a) * 0.5, -0.2 + math.sin(a) * 0.25 * (0.6 if i % 2 else 1.0)) for i, a in enumerate([math.pi + math.pi * k / 10 for k in range(11)])]
        mouth = [(u * r, v * r) for u, v in [(-0.5, 0.0)] + [(math.cos(math.pi + math.pi * k / 10) * 0.55, math.sin(math.pi + math.pi * k / 10) * (0.3 if k % 2 else 0.22)) for k in range(1, 10)] + [(0.5, 0.0), (0.25, 0.06), (0.0, 0.0), (-0.25, 0.06)]]
        prism_xy(f'{name}_mouth', mouth, 0.03 * r, M['ink'], zone, fx, y + h * 0.36, fz, ry=ry, bevel=0.0)
    col_circle(x, z, r * 1.02, 'pumpkin')
    return ob


def ghost(name, x, y, z, s, zone, ry=0.0):
    """ผีน้อยใจดี: ตัวหยดน้ำ ชายเป็นลอน มือป้อม ตาโต แก้มชมพู (ลอยอยู่)"""
    def hem(a, h):
        return 1 + (0.09 * math.cos(6 * a) if h < 0.15 * s else 0.0)
    lathe(name, [(0.0, 0.06 * s), (0.36 * s, 0.0), (0.42 * s, 0.12 * s), (0.44 * s, 0.38 * s), (0.4 * s, 0.6 * s), (0.28 * s, 0.8 * s), (0.0, 0.88 * s)],
          M['ghost'], zone, cx=x, cz=z, y0=y, seg=48, mod=hem)
    nx, nz = math.sin(ry), math.cos(ry)
    for side in (-1, 1):
        ex, ez = x + nx * 0.4 * s + math.cos(ry) * side * 0.13 * s, z + nz * 0.4 * s - math.sin(ry) * side * 0.13 * s
        lathe(f'{name}_eye{side}', [(0.0, -0.06 * s), (0.055 * s, -0.03 * s), (0.055 * s, 0.03 * s), (0.0, 0.06 * s)], M['ink'], zone, cx=ex, cz=ez, y0=y + 0.55 * s, seg=16)
        bx, bz = x + nx * 0.38 * s + math.cos(ry) * side * 0.23 * s, z + nz * 0.38 * s - math.sin(ry) * side * 0.23 * s
        lathe(f'{name}_blush{side}', [(0.0, -0.02 * s), (0.05 * s, 0.0), (0.0, 0.02 * s)], M['blush'], zone, cx=bx, cz=bz, y0=y + 0.45 * s, seg=12)
        ax, az = x + math.cos(ry) * side * 0.44 * s, z - math.sin(ry) * side * 0.44 * s
        blob(f'{name}_arm{side}', [(ax, y + 0.42 * s, az, 0.11 * s, 0.07 * s, 0.09 * s), (ax + math.cos(ry) * side * 0.06 * s, y + 0.5 * s, az - math.sin(ry) * side * 0.06 * s, 0.08 * s, 0.06 * s, 0.07 * s)], M['ghost'], zone, voxel=0.02 * s, tris=300)
    mx, mz = x + nx * 0.43 * s, z + nz * 0.43 * s
    lathe(f'{name}_mouth', [(0.0, -0.035 * s), (0.04 * s, 0.0), (0.0, 0.01 * s)], M['ink'], zone, cx=mx, cz=mz, y0=y + 0.42 * s, seg=12)


def bat(name, x, y, z, s, zone, ry=0.0):
    wing = [(0.0, 0.0), (0.18, 0.1), (0.36, 0.14), (0.5, 0.06), (0.42, -0.02), (0.34, 0.03), (0.26, -0.05), (0.17, 0.0), (0.09, -0.06)]
    for side in (-1, 1):
        prism_xy(f'{name}_w{side}', [(u * side * s, v * s) for u, v in (wing if side > 0 else wing[::-1])], 0.012 * s, M['bat'], zone, x, y, z, ry=ry, bevel=0.0)
    lathe(name, [(0.0, -0.08 * s), (0.07 * s, -0.04 * s), (0.08 * s, 0.03 * s), (0.05 * s, 0.09 * s), (0.0, 0.1 * s)], M['bat'], zone, cx=x, cz=z, y0=y, seg=16)
    for side in (-1, 1):   # หู + ตา
        prism_xy(f'{name}_ear{side}', [(side * 0.02 * s, 0.08 * s), (side * 0.06 * s, 0.08 * s), (side * 0.05 * s, 0.15 * s)], 0.01 * s, M['bat'], zone, x, y, z, ry=ry, bevel=0.0)
        prism_xy(f'{name}_eye{side}', [(side * 0.02 * s + math.cos(a) * 0.014 * s, 0.03 * s + math.sin(a) * 0.014 * s) for a in [TAU * k / 8 for k in range(8)]], 0.01 * s,
                 M['yellow'], zone, x + math.sin(ry) * 0.075 * s, y, z + math.cos(ry) * 0.075 * s, ry=ry, bevel=0.0)


def lantern_string(name, p0, p1, zone, n=7, sag=0.45):
    pts = []
    for k in range(17):
        t = k / 16
        pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t))
    tube(name, pts, 0.012, M['ink'], zone, tseg=5)
    for k in range(1, n + 1):
        t = k / (n + 1)
        px, py, pz = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t
        m = M['lanternO'] if k % 2 else M['lanternP']
        lathe(f'{name}_l{k}', [(0.0, -0.2), (0.05, -0.19), (0.11, -0.12), (0.12, -0.06), (0.07, -0.02), (0.0, 0.0)], m, zone, cx=px, cz=pz, y0=py, seg=16,
              mod=lambda a, h: 1 - 0.08 * (1 - (0.5 + 0.5 * math.cos(8 * a)) ** 0.5))


def event_plaza():
    Z = 'event'
    cx, cz = 0.0, 18.6
    # พื้นลาน: หินสีลาเวนเดอร์ ขอบโค้ง + ลายใยแมงมุม
    pts = []
    for k in range(48):
        a = TAU * k / 48
        rx, rz = 6.6, 4.9
        e = (abs(math.cos(a)) ** 3 + abs(math.sin(a)) ** 3) ** (-1 / 3)
        pts.append((cx + math.cos(a) * rx * e, cz + math.sin(a) * rz * e))
    bm = bmesh.new()
    vs = [bm.verts.new(W(px, 0.03, pz)) for px, pz in pts]
    c = bm.verts.new(W(cx, 0.03, cz))
    for i in range(48):
        bm.faces.new((c, vs[(i + 1) % 48], vs[i]))
    obj_from_bm('Event_Floor', bm, M['hwStone'], Z, smooth=False)
    tube('Event_FloorEdge', [(px, 0.04, pz) for px, pz in pts], 0.09, M['hwStone2'], Z, tseg=8, closed=True)
    for k in range(8):   # ใยแมงมุม: เส้นรัศมี + วงโค้ง
        a = TAU * k / 8
        tube(f'Event_Web{k}', [(cx, 0.035, cz), (cx + math.cos(a) * 3.2, 0.035, cz + math.sin(a) * 2.6)], 0.022, M['hwStone2'], Z, tseg=4)
    for rr in (1.0, 2.0, 2.9):
        tube(f'Event_WebRing{rr}', [(cx + math.cos(TAU * k / 32) * rr * 1.1, 0.035, cz + math.sin(TAU * k / 32) * rr * 0.9) for k in range(32)], 0.02, M['hwStone2'], Z, tseg=4, closed=True)
    # ซุ้มทางเข้า (เสาหิน + คานโค้ง + ฟักทอง + ป้าย)
    for s in (-1, 1):
        box(f'Event_Pillar{s}', cx + s * 2.0, 0.0, 13.9, 0.55, 2.6, 0.55, M['hwStone2'], Z, bevel=0.06)
        pumpkin(f'Event_PillarPumpkin{s}', cx + s * 2.0, 13.9, 0.27, Z, y=2.6, face=True, ry=0.0)
        MAP['colliders'].pop()   # ฟักทองบนเสา ไม่ใช่สิ่งกีดขวางที่พื้น
        col_box(cx + s * 2.0, 13.9, 0.32, 0.32, 0.0, 'pillar')
    tube('Event_Arch', [(cx + math.cos(a) * 2.0, 2.45 + math.sin(a) * 0.65, 13.9) for a in [math.pi * k / 16 for k in range(17)]], 0.13, M['bat'], Z, tseg=10)
    box('Event_SignBoard', cx, 2.6, 13.75, 2.6, 0.48, 0.08, M['bat'], Z, bevel=0.03)
    text3d('Event_SignText', 'EVENT PLAZA', 0.25, M['orange'], Z, cx, 2.84, 13.69, ry=math.pi, depth=0.02)
    text3d('Event_SignText2', 'EVENT PLAZA', 0.25, M['orange'], Z, cx, 2.84, 13.81, ry=0.0, depth=0.02)
    # ฟักทองกองรอบลาน (บางลูกแกะหน้ายิ้ม)
    spots = [(-5.2, 15.6, 0.42, True), (-5.8, 16.4, 0.3, False), (-4.6, 16.3, 0.26, False), (5.3, 15.7, 0.45, True), (5.9, 16.6, 0.28, False),
             (-5.7, 21.0, 0.36, True), (5.6, 21.4, 0.33, False), (-2.6, 22.6, 0.3, True), (2.6, 22.8, 0.26, False), (-1.2, 15.0, 0.18, False), (1.3, 15.1, 0.2, False)]
    for k, (px, pz, r, f) in enumerate(spots):
        pumpkin(f'Event_Pumpkin{k}', px, pz, r, Z, face=f, ry=math.atan2(cx - px, (cz - 1.5) - pz))
    # จุดรับรางวัล Daily Login: แท่นฟักทองยักษ์ + กล่องของขวัญ + ป้าย
    px, pz = 0.0, 21.2
    lathe('Event_Podium', [(0.0, 0.0), (1.0, 0.0), (1.0, 0.18), (0.9, 0.26), (0.0, 0.26)], M['hwStone2'], Z, cx=px, cz=pz, seg=48)
    pumpkin('Event_PodiumPumpkin', px, pz, 0.62, Z, y=0.26, face=True, ry=math.pi)
    MAP['colliders'].pop()
    box('Event_Gift', px, 1.25, pz, 0.42, 0.36, 0.42, M['violet'], Z, bevel=0.03)
    box('Event_GiftRibbonA', px, 1.25, pz, 0.08, 0.37, 0.43, M['yellow'], Z, bevel=0.01)
    box('Event_GiftRibbonB', px, 1.25, pz, 0.43, 0.37, 0.08, M['yellow'], Z, bevel=0.01)
    for s in (-1, 1):
        tube(f'Event_GiftBow{s}', [(px, 1.62, pz), (px + s * 0.1, 1.72, pz - 0.04), (px + s * 0.17, 1.66, pz), (px + s * 0.1, 1.63, pz + 0.04), (px, 1.62, pz)], 0.025, M['yellow'], Z, tseg=6)
    col_circle(px, pz, 1.05, 'podium')
    # กระจกลองชุด (กรอบไม้ประดับค้างคาว)
    mx, mz = 4.3, 21.0
    ry_m = math.atan2(cx - mx, (cz - 0.5) - mz)
    ell = [(mx + math.cos(ry_m) * math.cos(a) * 0.55, 1.15 + math.sin(a) * 0.85, mz - math.sin(ry_m) * math.cos(a) * 0.55) for a in [TAU * k / 40 for k in range(40)]]
    tube('Event_MirrorFrame', ell, 0.07, M['bat'], Z, tseg=8, closed=True)
    prism_xy('Event_MirrorGlass', [(math.cos(a) * 0.5, math.sin(a) * 0.8) for a in [TAU * k / 40 for k in range(40)]], 0.02, M['mirror'], Z, mx, 1.15, mz, ry=ry_m, bevel=0.0)
    for s in (-1, 1):
        tube(f'Event_MirrorLeg{s}', [(mx + math.cos(ry_m) * s * 0.35, 0.0, mz - math.sin(ry_m) * s * 0.35), (mx + math.cos(ry_m) * s * 0.42, 0.45, mz - math.sin(ry_m) * s * 0.42)], 0.04, M['bat'], Z, tseg=6)
    bat('Event_MirrorBat', mx, 2.12, mz, 0.9, Z, ry=ry_m)
    col_circle(mx, mz, 0.6, 'mirror')
    # เสาพระจันทร์เสี้ยว (ไฟสีทองนุ่ม)
    qx, qz = -4.4, 21.2
    tube('Event_MoonPole', [(qx, 0.0, qz), (qx, 2.6, qz), (qx + 0.3, 3.0, qz)], 0.06, M['bat'], Z, tseg=8)
    crescent = [(math.cos(a) * 0.62, math.sin(a) * 0.62) for a in [-math.pi / 2 + math.pi * k / 20 for k in range(21)]] + \
               [(0.32 + math.cos(a) * 0.5 - 0.32, math.sin(a) * 0.5) for a in [math.pi / 2 - math.pi * k / 20 for k in range(21)]]
    crescent = [(u + 0.12 * (1 - abs(v) / 0.62) * 0, v) for u, v in crescent]
    prism_xy('Event_Moon', [(u - 0.15, v) for u, v in [(math.cos(a) * 0.62, math.sin(a) * 0.62) for a in [-math.pi / 2 + math.pi * k / 20 for k in range(21)]] +
                            [(0.28 + math.cos(a) * 0.48 - 0.0, math.sin(a) * 0.52) for a in [math.pi / 2 + math.pi * k / 20 for k in range(21)]]],
             0.14, M['moon'], Z, qx + 0.55, 3.25, qz, ry=math.atan2(cx - qx, (cz - 2) - qz) - math.pi / 2, bevel=0.03)
    for k in range(5):
        a = TAU * k / 5 + 0.3
        star = [(math.cos(math.pi / 2 + TAU * i / 10) * (0.09 if i % 2 == 0 else 0.04), math.sin(math.pi / 2 + TAU * i / 10) * (0.09 if i % 2 == 0 else 0.04)) for i in range(10)]
        prism_xy(f'Event_Star{k}', star, 0.03, M['moon'], Z, qx + 0.3 + math.cos(a) * 1.0, 3.2 + math.sin(a) * 0.7, qz, ry=math.atan2(cx - qx, (cz - 2) - qz) - math.pi / 2, bevel=0.0)
    col_circle(qx, qz, 0.25, 'pole')
    # ผีน้อยใจดีลอยอยู่ 2 ตัว + ค้างคาว
    ghost('Event_Ghost0', -3.0, 0.75, 19.0, 0.85, Z, ry=math.atan2(0 - -3.0, 15 - 19.0))
    col_circle(-3.0, 19.0, 0.45, 'ghost')
    ghost('Event_Ghost1', 3.2, 1.35, 18.2, 0.6, Z, ry=math.atan2(0 - 3.2, 15 - 18.2))
    col_circle(3.2, 18.2, 0.32, 'ghost')
    for k, (bx, by, bz, s) in enumerate(((-3.6, 3.4, 20.6, 1.0), (-2.6, 3.8, 21.4, 0.8), (-5.0, 2.9, 19.4, 0.9), (2.4, 3.1, 16.0, 0.85), (3.8, 2.7, 15.3, 0.75), (0.6, 3.6, 17.2, 0.7))):
        bat(f'Event_Bat{k}', bx, by, bz, s, Z, ry=rnd.uniform(-0.6, 0.6))
    # สายโคมไฟส้ม/ม่วง ระหว่างเสา (แสงฮาโลวีน)
    for s in (-1, 1):
        lamp(f'Event_Lamp{s}', s * 5.9, 18.6, Z, glass='lanternO', h=2.3)
        lantern_string(f'Event_Lights{s}', (s * 2.0, 2.45, 13.9), (s * 5.9, 2.35, 18.6), Z)
    lantern_string('Event_LightsBack', (-5.9, 2.35, 18.6), (5.9, 2.35, 18.6), Z, n=11, sag=0.6)
    # ป้ายตั้ง: Daily Login + Costume Preview
    for (lx, lz, txt, col) in ((-1.4, 20.1, 'DAILY GIFT', 'orange'), (3.0, 20.0, 'TRY COSTUMES', 'violet')):
        tube(f'Event_Stand{txt}', [(lx, 0.0, lz), (lx, 0.95, lz)], 0.03, M['bat'], Z, tseg=6)
        box(f'Event_StandBoard{txt}', lx, 0.95, lz, 0.9, 0.32, 0.05, M[col], Z, bevel=0.02)
        text3d(f'Event_StandText{txt}', txt, 0.11, M['white'], Z, lx, 1.11, lz + 0.03, depth=0.01)
        col_circle(lx, lz, 0.12, 'stand')
    MAP['zones'].append({'id': 'event_plaza', 'name': 'Event Plaza', 'th': 'ลานกิจกรรม Halloween', 'x': cx, 'z': cz, 'r': 6.0, 'color': '#ff8a1f', 'event': 'halloween-costume-2026'})
    MAP['interact'].append({'id': 'event_claim', 'kind': 'event_claim', 'x': 0.0, 'z': 19.7, 'r': 1.6, 'label': 'Daily Login Gift', 'th': 'รับรางวัลเข้าระบบรายวัน', 'event': 'halloween-costume-2026'})
    MAP['interact'].append({'id': 'event_costume', 'kind': 'event_costume', 'x': round(mx - 0.8, 3), 'z': round(mz - 1.0, 3), 'r': 1.5, 'label': 'Try Halloween Costumes', 'th': 'ลองชุดฮาโลวีน', 'event': 'halloween-costume-2026'})


# =====================================================================
# สร้างทั้งฉาก
# =====================================================================
ground()
path_strip('Path_N', 0.0, -9.4, 0.0, -16.4, 3.0)
path_strip('Path_S', 0.0, 9.4, 0.0, 14.3, 3.0)
path_strip('Path_W', -9.4, 0.0, -14.4, 0.0, 3.0)
path_strip('Path_E', 9.4, 0.0, 16.3, 0.0, 3.0)
plaza()
learning_hall()
battle_arena()
boutique()
event_plaza()
nature()
MAP['zones'].insert(0, {'id': 'central_plaza', 'name': 'Central Plaza', 'th': 'ลานกลาง', 'x': 0.0, 'z': 0.0, 'r': 9.4, 'color': '#41c7b9'})
for k in range(12):
    a = TAU * k / 12 + 0.26
    MAP['spawns'].append({'x': round(math.cos(a) * 4.3, 3), 'z': round(math.sin(a) * 4.3, 3)})
for o in list(OBJS):
    if o.name.startswith('Shop_RoofDummy'):
        OBJS.remove(o); bpy.data.objects.remove(o)

scn = bpy.context.scene
wld = bpy.data.worlds.new('WRL'); wld.use_nodes = True; scn.world = wld
print('objects', len(OBJS))

# ---------- รวมเป็นก้อนตามโซน (ลด draw call · frustum culling ทีละโซน) แล้ว bake AO ทีละก้อน ----------
groups = {}
for o in OBJS:
    groups.setdefault(o['zone'], []).append(o)
chunks = []
for zone, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    objs = [o for o in objs if o.data.polygons]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = f'ZONE_{zone}'; ob.data.name = ob.name
    ca = ob.data.color_attributes.get('AO')
    if ca:
        ob.data.color_attributes.active_color = ca
    chunks.append(ob)
# ---------- AO bake (แสงเงานุ่ม: ใต้หลังคา โคนต้นไม้ ซอกกำแพง) ----------
for c in chunks:
    bake_ao(c, visible=tuple(chunks), samples=16, lift=0.42 if c['zone'] in ('ground', 'plaza', 'event') else 0.5, distance=1.0)
    c.data.color_attributes.active_color = c.data.color_attributes['AO']
    print('ao', c.name)
tris = {c.name: sum(len(p.vertices) - 2 for p in c.data.polygons) for c in chunks}
print('TRIS', tris, sum(tris.values()))
MAP['triangles'] = sum(tris.values())
MAP['chunks'] = tris

bpy.ops.object.select_all(action='DESELECT')
for c in chunks:
    c.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'campus.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_texcoords=False, export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE', export_extras=False,
                          export_animations=False, export_skins=False, export_cameras=False, export_lights=False)
json.dump(MAP, open(os.path.join(OUT, 'campus.json'), 'w'), indent=1)
print('colliders', len(MAP['colliders']), 'seats', len(MAP['seats']), 'interact', len(MAP['interact']))

# ---------- ภาพตรวจ ----------
if not os.environ.get('EQ_NO_PREVIEW'):
    # ต่อ AO เข้า base color ให้ภาพตรวจเหมือน runtime
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree; bsdf = nt.nodes.get('Principled BSDF')
        if not bsdf or bsdf.inputs['Base Color'].is_linked:
            continue
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'AO'
        mx_ = nt.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'; mx_.blend_type = 'MULTIPLY'; mx_.inputs[0].default_value = 1.0
        mx_.inputs[6].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(at.outputs['Color'], mx_.inputs[7]); nt.links.new(mx_.outputs[2], bsdf.inputs['Base Color'])
    wld.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.86, 1.0, 1)
    wld.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.angle = math.radians(8)
    so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(50), 0, math.radians(-35)); scn.collection.objects.link(so)
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); scn.collection.objects.link(co); scn.camera = co
    scn.render.engine = 'CYCLES'; scn.cycles.samples = 32; scn.cycles.use_denoising = True
    scn.view_settings.view_transform = 'Standard'
    scn.render.image_settings.file_format = 'PNG'

    def shot(fn, pos, tgt, lens=28, res=(960, 600)):
        scn.render.resolution_x, scn.render.resolution_y = res
        cam.lens = lens
        co.location = W(*pos)
        co.rotation_euler = (W(*tgt) - W(*pos)).to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(OUT, fn)
        bpy.ops.render.render(write_still=True)
    shot('preview_overview.png', (0, 30, 34), (0, 0, 1), lens=24, res=(1280, 800))
    shot('preview_plaza.png', (5, 3.2, 11), (0, 0.8, 0))
    shot('preview_hall.png', (3, 2.6, -8), (0, 2.0, -18))
    shot('preview_arena.png', (-8, 3.0, 5), (-18, 2.0, 0))
    shot('preview_boutique.png', (9, 2.6, -5), (18, 1.6, 0))
    shot('preview_event.png', (2, 3.0, 10), (0, 1.0, 19))
print('DONE')
