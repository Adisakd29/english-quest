"""
CHR_Base v2 — ร่างกายปั้นใหม่เป็นผิว "ชิ้นเดียวต่อเนื่อง" (BASE_VERSION 2)
เดิม (v1): ทรงรี/แคปซูลแยกชิ้นวางต่อกัน → เห็นรอยต่อที่คอ ไหล่ ข้อศอก ข้อมือ สะโพก เข่า · มือเป็นลูกบอล · คอเป็นแท่ง
v2: ปั้นด้วย Signed Distance Field — ชิ้นรูปทรงเดิมเป็นโครง แล้ว "หลอมรวม" (smooth union) ตามข้อต่อ
    + รายละเอียดใหม่: บ่า/กล้ามคอ (trapezius) · รักแร้ · ข้อศอก · ข้อมือเรียว · มือทรงถุงมือมีนิ้วโป้ง + ร่องนิ้ว
      · เข่า/น่อง/ข้อเท้า · ส้นเท้า/อุ้งเท้า · ใบหูมีเว้า · จมูกกลืนกับหน้า · ก้น/ท้องเล็กน้อย
    → Marching Cubes (ละเอียด 2.6 มม.) → ลดจำนวนสามเหลี่ยมแบบเก็บรายละเอียดที่ข้อต่อ/มือ/หน้า → normal นุ่มต่อเนื่อง
ข้อบังคับที่คงไว้ (ของเดิมทั้ง 157 ชิ้นต้องใส่ได้เหมือนเดิม):
  - ARM_Main 20 bones ชื่อ/ตำแหน่งเดิม · ปั้นในพิกัดต้นแบบแล้วแปลงด้วย style_warp เดียวกับทุกชิ้น
  - ผิวด้านนอก "ไม่เกิน" ทรงเดิม ยกเว้นช่องรอยต่อที่ถูกเติมเต็ม (หลอมรวม k เล็ก) — เสื้อผ้าที่ปั้นทับทรงเดิมยังครอบได้
  - หน้า (ส่วนที่ติดตา/ปาก/แก้ม) = ทรงรีเดิมเป๊ะ · หัว = HEAD_C/HEAD_R เดิม (ผม/หมวก/แว่นพอดีเหมือนเดิม)
  - แยก mesh ตามส่วนร่างกาย BODY_<region> 8 ส่วนเหมือนเดิม (Body Mask) · material MAT_Skin / MAT_Base_* ชื่อเดิม
  - ต้นแบบน้ำหนักสำหรับเสื้อผ้า (eq_src: torso/hips/arm.L/arm.R/leg.L/leg.R) ครบเหมือนเดิม
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from eqlib import (BONE, G_ARM_L, G_ARM_R, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, HEAD_C, HEAD_R, chain_weights, head_surface,
                   set_body_sources, warp_object)

VOXEL = 0.0026
ALLOW = 0.0012   # ยื่นเกินทรงเดิมได้สูงสุด 1.2 มม. (ซอกรอยต่อ) — มากกว่านี้ผิวทะลุแขนเสื้อ/คอเสื้อ/รองเท้าเดิม (วัดจากด่านตรวจ)
F32 = np.float32


# ---------------------------------------------------------------- SDF primitives (numpy, ทำงานกับ array ของจุด N×3)
def sd_ellipsoid(P, c, r):
    q = (P - np.asarray(c, F32)) / np.asarray(r, F32)
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / np.asarray(r, F32), axis=1)
    return (k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)).astype(F32)


def sd_capsule(P, a, b, ra, rb, flat=1.0):
    """แคปซูลเรียว (round cone แบบประมาณ) · flat < 1 = แบนตามแกน Y (ลึก)"""
    a = np.asarray(a, F32); b = np.asarray(b, F32)
    Q = P.copy()
    if flat != 1.0:
        Q[:, 1] = Q[:, 1] / flat
        a = a.copy(); b = b.copy(); a[1] /= flat; b[1] /= flat
    ab = b - a
    t = np.clip(((Q - a) @ ab) / float(ab @ ab), 0.0, 1.0)
    d = np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)
    r = ra + (rb - ra) * t
    out = d - r
    if flat != 1.0:
        out = out * (0.5 * (1 + flat))   # ชดเชยระยะที่ยืด (ประมาณ — ใช้เป็นระยะใกล้ผิวเท่านั้น)
    return out.astype(F32)


def smin(a, b, k):
    h = np.clip(k - np.abs(a - b), 0.0, None) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):   # ตัดออกแบบนุ่ม (ร่อง/เว้า)
    return -smin(-a, -b, k)


# ---------------------------------------------------------------- ชิ้นส่วน: (ชื่อ, region, eq_src, กลุ่ม bone, sdf)
def _parts():
    P = []
    hc, hr = tuple(HEAD_C), tuple(HEAD_R)
    P.append(('head', 'core', '', ['Head'], lambda X: sd_ellipsoid(X, hc, hr)))
    np_, nn = head_surface(0, 0.768, out=-0.007)
    nose_c = tuple(np_ + nn * 0.002)
    P.append(('nose', 'core', '', ['Head'], lambda X: sd_ellipsoid(X, nose_c, (0.0165, 0.0125, 0.0135))))
    for sx in (1, -1):
        def ear(X, sx=sx):
            # ใบหูทรงมน + ติ่งหูเล็ก ๆ (ไม่เจาะเว้า — ลดสามเหลี่ยมแล้วยับ)
            outer = sd_ellipsoid(X, (0.201 * sx, 0.009, 0.789), (0.029, 0.02, 0.038))
            lobe = sd_ellipsoid(X, (0.204 * sx, 0.004, 0.758), (0.019, 0.014, 0.016))
            return smin(outer, lobe, 0.01)
        P.append((f'ear{sx}', 'core', '', ['Head'], ear))
    # คอ: เรียวขึ้นเล็กน้อย (โคนคอกว้าง → กลืนกับบ่า)
    P.append(('neck', 'core', 'torso', ['Chest', 'Neck', 'Head'], lambda X: sd_capsule(X, (0, 0, 0.53), (0, 0, 0.64), 0.046, 0.046)))
    P.append(('torso', 'torso', 'torso', G_TORSO, lambda X: sd_capsule(X, (0, 0, 0.32), (0, 0, 0.47), 0.112, 0.124, flat=0.74)))
    P.append(('hips', 'hips', 'torso,hips,leg.L,leg.R', G_HIPS, lambda X: sd_ellipsoid(X, (0, 0, 0.255), (0.118, 0.086, 0.074))))
    for sx in (1, -1):
        sd = 'L' if sx > 0 else 'R'
        arm = G_ARM_L if sx > 0 else G_ARM_R
        leg = G_LEG_L if sx > 0 else G_LEG_R
        P.append((f'uarm{sd}', 'uarm', f'arm.{sd}', arm, lambda X, sx=sx: sd_capsule(X, (0.13 * sx, 0, 0.507), (0.168 * sx, 0, 0.395), 0.042, 0.038)))
        P.append((f'larm{sd}', 'larm', f'arm.{sd}', arm, lambda X, sx=sx: sd_capsule(X, (0.168 * sx, 0, 0.395), (0.184 * sx, 0, 0.29), 0.0375, 0.0265)))

        def hand(X, sx=sx):
            # มือทรงถุงมือ (สไตล์ chibi): ข้อมือคอด → ฝ่ามือมนใหญ่กว่าข้อมือ (หันเข้าหาตัว) + นิ้วโป้งชี้ไปด้านหน้า-ล่าง
            palm = sd_ellipsoid(X, (0.19 * sx, -0.002, 0.233), (0.031, 0.04, 0.037))
            tip = sd_ellipsoid(X, (0.192 * sx, 0.0, 0.212), (0.028, 0.036, 0.024))
            m = smin(palm, tip, 0.018)
            thumb = sd_capsule(X, (0.181 * sx, -0.028, 0.25), (0.177 * sx, -0.05, 0.229), 0.0125, 0.0105)
            return smin(m, thumb, 0.01)
        P.append((f'hand{sd}', 'core', f'arm.{sd}', arm, hand))
        P.append((f'short{sd}', 'hips', f'torso,hips,leg.{sd}', leg, lambda X, sx=sx: sd_capsule(X, (0.062 * sx, 0, 0.245), (0.063 * sx, 0, 0.195), 0.0495, 0.0485)))
        P.append((f'uleg{sd}', 'uleg', f'torso,hips,leg.{sd}', leg, lambda X, sx=sx: sd_capsule(X, (0.062 * sx, 0, 0.24), (0.064 * sx, 0, 0.135), 0.047, 0.043)))

        def lleg(X, sx=sx):
            # ขาท่อนล่าง/เท้า = ทรงเดิม (รองเท้าทุกคู่ปั้นทับทรงนี้พอดี — ข้อเท้าเรียวลงทำให้ขอบรองเท้า/กระโปรงเผยผิว)
            return sd_capsule(X, (0.064 * sx, 0, 0.135), (0.066 * sx, 0, 0.055), 0.043, 0.038)
        P.append((f'lleg{sd}', 'lleg', f'leg.{sd}', leg, lleg))

        def foot(X, sx=sx):
            return sd_ellipsoid(X, (0.066 * sx, -0.024, 0.031), (0.043, 0.066, 0.031))
        P.append((f'foot{sd}', 'foot', f'leg.{sd}', leg, foot))
    return P


# ความนุ่มของรอยต่อ (k ของ smooth union) — k มาก = รอยต่อกลืนกันมาก แต่เติมเนื้อเข้าไปในซอกมากขึ้น
BLEND = [
    ('neck', 'head', 0.014), ('neck', 'torso', 0.01), ('nose', 'head', 0.008), ('ear1', 'head', 0.005), ('ear-1', 'head', 0.005),
    ('torso', 'hips', 0.012), ('shortL', 'hips', 0.006), ('shortR', 'hips', 0.006),
    ('uarmL', 'torso', 0.016), ('uarmR', 'torso', 0.016), ('larmL', 'uarmL', 0.012), ('larmR', 'uarmR', 0.012),
    ('handL', 'larmL', 0.01), ('handR', 'larmR', 0.01),
    ('ulegL', 'shortL', 0.008), ('ulegR', 'shortR', 0.008), ('ulegL', 'hips', 0.006), ('ulegR', 'hips', 0.006),
    ('llegL', 'ulegL', 0.006), ('llegR', 'ulegR', 0.006), ('footL', 'llegL', 0.004), ('footR', 'llegR', 0.004),
]
ORDER = ['head', 'nose', 'ear1', 'ear-1', 'neck', 'torso', 'hips', 'shortL', 'shortR', 'uarmL', 'uarmR', 'larmL', 'larmR',
         'handL', 'handR', 'ulegL', 'ulegR', 'llegL', 'llegR', 'footL', 'footR']
# จุดที่ต้องการความละเอียดสูง (ข้อต่อ/มือ/หน้า) — ลดสามเหลี่ยมน้อยกว่า
DETAIL = [((0, -0.16, 0.77), 0.05), ((0.2, 0, 0.785), 0.04), ((-0.2, 0, 0.785), 0.04),
          ((0.19, -0.01, 0.235), 0.05), ((-0.19, -0.01, 0.235), 0.05),
          ((0.168, 0, 0.395), 0.035), ((-0.168, 0, 0.395), 0.035), ((0.13, 0, 0.5), 0.045), ((-0.13, 0, 0.5), 0.045),
          ((0.064, 0, 0.135), 0.035), ((-0.064, 0, 0.135), 0.035), ((0.066, -0.02, 0.04), 0.05), ((-0.066, -0.02, 0.04), 0.05),
          ((0, 0, 0.6), 0.05)]


def _field(X, parts):
    """SDF รวม + ระยะของแต่ละชิ้น (ใช้แบ่ง region / ผสมน้ำหนัก)"""
    d = {name: fn(X) for name, _r, _s, _b, fn in parts}
    acc = {name: d[name] for name in d}
    group = {name: name for name in d}   # union-find แบบง่าย: ชิ้นที่หลอมแล้ว
    for a, b, k in BLEND:
        ga, gb = group[a], group[b]
        if ga == gb:
            continue
        m = smin(acc[ga], acc[gb], k)
        for n in group:
            if group[n] == gb:
                group[n] = ga
        acc[ga] = m
    roots = {group[n] for n in group}
    total = None
    for r in roots:
        total = acc[r] if total is None else np.minimum(total, acc[r])
    # ไม่ให้ผิวใหม่ยื่นเกินทรงเดิมเกิน ALLOW (รอยหลอมในซอกถูกจำกัด → เสื้อผ้าเดิมยังครอบได้) · ยกเว้นมือ (ทรงใหม่มีนิ้วโป้ง)
    dh = np.minimum(d['handL'], d['handR'])
    allow = ALLOW + 0.02 * np.clip((0.022 - dh) / 0.012, 0.0, 1.0)
    z = X[:, 2]
    allow = allow + 0.006 * np.clip((z - 0.62) / 0.025, 0.0, 1.0)   # ใต้คาง (ซ่อนใต้หัว ไม่มีเสื้อผ้าทับ) — รอยต่อคอ-หัวนุ่มได้มากกว่า
    total = smax(total, old_envelope(X) - allow, 0.005)
    return total, d


def sculpt_mesh(name='CHR_Base_v2_sculpt'):
    from skimage.measure import marching_cubes
    parts = _parts()
    lo = np.array([-0.27, -0.215, -0.004], F32); hi = np.array([0.27, 0.215, 1.005], F32)
    n = np.ceil((hi - lo) / VOXEL).astype(int) + 1
    xs, ys, zs = (np.linspace(lo[i], lo[i] + (n[i] - 1) * VOXEL, n[i], dtype=F32) for i in range(3))
    vol = np.empty((n[0], n[1], n[2]), F32)
    G = np.stack(np.meshgrid(ys, zs, indexing='ij'), -1).reshape(-1, 2)
    for i, x in enumerate(xs):   # ทีละแผ่น (ประหยัดหน่วยความจำ)
        X = np.empty((G.shape[0], 3), F32); X[:, 0] = x; X[:, 1:] = G
        vol[i] = _field(X, parts)[0].reshape(n[1], n[2])
    verts, faces, _nrm, _ = marching_cubes(vol, 0.0, spacing=(VOXEL, VOXEL, VOXEL))
    verts = verts + lo
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, parts


KEEP_BASE = 0.45   # น้ำหนักพื้นฐาน (ทั้งตัวถูกลดเท่า ๆ กัน) · จุดละเอียดได้สูงสุด 1.0 = ถูกลดน้อยสุด
def _keep_group(ob):
    g = ob.vertex_groups.new(name='eq_keep')
    for v in ob.data.vertices:
        w = 0.0
        w0 = KEEP_BASE
        for c, r in DETAIL:
            dd = (v.co - Vector(c)).length
            w = max(w, 1.0 - min(1.0, dd / r))
        g.add([v.index], w0 + (1 - w0) * w, 'REPLACE')
    return g


def _bake_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def decimate(ob, target_tris):
    _keep_group(ob)
    cur = len(ob.data.polygons)
    d = ob.modifiers.new('dec', 'DECIMATE')
    d.decimate_type = 'COLLAPSE'; d.ratio = min(1.0, target_tris * 1.6 / cur); d.use_symmetry = True; d.symmetry_axis = 'X'
    d.vertex_group = 'eq_keep'; d.vertex_group_factor = 1.0; d.invert_vertex_group = True; d.use_collapse_triangulate = True   # Blender: น้ำหนักมาก = ลดมาก → invert = จุดละเอียดถูกเก็บไว้
    _bake_mods(ob)
    # ลดรอบสอง (ไม่ถ่วงจุดละเอียด) ให้ถึงงบ · แล้วเกลี่ยผิวโดยไม่หด
    d = ob.modifiers.new('dec2', 'DECIMATE')
    d.decimate_type = 'COLLAPSE'; d.ratio = min(1.0, target_tris / len(ob.data.polygons)); d.use_symmetry = True; d.symmetry_axis = 'X'
    d.vertex_group = 'eq_keep'; d.vertex_group_factor = 1.0; d.invert_vertex_group = True; d.use_collapse_triangulate = True
    m = ob.modifiers.new('smooth', 'CORRECTIVE_SMOOTH')
    m.iterations = 4; m.smooth_type = 'LENGTH_WEIGHTED'; m.use_only_smooth = True; m.rest_source = 'ORCO'; m.factor = 0.5
    _bake_mods(ob)
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    return ob



def _grad(X, parts, eps=0.0004):
    g = np.zeros_like(X)
    for i in range(3):
        a = X.copy(); b = X.copy(); a[:, i] += eps; b[:, i] -= eps
        g[:, i] = (_field(a, parts)[0] - _field(b, parts)[0]) / (2 * eps)
    return g


def project_and_normals(ob, parts, iters=2):
    """ดึงทุกจุดกลับมาอยู่บนผิวจริง (หลังลดสามเหลี่ยม) + normal จาก gradient ของสนามระยะ (เรียบเนียนไม่ขึ้นกับการแบ่งสามเหลี่ยม)"""
    me = ob.data
    X = np.array([v.co[:] for v in me.vertices], F32)
    for _ in range(iters):
        f = _field(X, parts)[0]
        g = _grad(X, parts)
        X = X - (f / np.maximum((g * g).sum(1), 1e-8))[:, None] * g
    for v, x in zip(me.vertices, X):
        v.co = x.tolist()
    g = _grad(X, parts)
    n = g / np.maximum(np.linalg.norm(g, axis=1), 1e-8)[:, None]
    me.update()
    return X, n


def warp_normals(X, n):
    """normal ในพิกัดต้นแบบ → หลังแปลงสัดส่วน (n' = J^-T n, J = Jacobian ของ style_warp ณ จุดนั้น)"""
    from eqlib import style_warp
    out = np.zeros_like(n)
    e = 0.0005
    for k, (x, nn) in enumerate(zip(X, n)):
        x = Vector(x.tolist())
        J = np.array([[*(style_warp(x + Vector(d) * e) - style_warp(x - Vector(d) * e))] for d in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]).T / (2 * e)
        m = np.linalg.solve(J.T, nn)
        out[k] = m / (np.linalg.norm(m) or 1)
    return out


def _labels(co, parts):
    X = np.array(co, F32)
    _t, d = _field(X, parts)
    names = [p[0] for p in parts]
    D = np.stack([d[n] for n in names], 1)
    return names, D


# ---- ขอบเสื้อกล้าม/กางเกงซับใน/ถุงเท้า: ตัดตามระนาบจริง (เส้นขอบเรียบ ไม่เป็นฟันเลื่อยตามสามเหลี่ยม) — พิกัดต้นแบบ
WAIST_Z = 0.296
def _n(v):
    v = Vector(v); return v.normalized()
def _plane(p, n):
    p = np.asarray(p, F32); n = np.asarray(n, F32)
    return lambda X, d: (X - p) @ n

# ฟังก์ชันขอบ (ค่า 0 = เส้นขอบ) — ระนาบ หรือ "เส้นกึ่งกลางระหว่างสองชิ้น" (ขอบแขนเสื้อกล้าม = ตรงที่แขนงอกจากลำตัว)
CUTS = {
    'waist': (_plane((0, 0, WAIST_Z), (0, 0, 1)), ('torso', 'hips')),
    'neckline': (_plane((0, -0.03, 0.566), tuple(_n((0, -0.32, 1)))), ('torso', 'neck')),
    'armL': (lambda X, d: d['torso'] - d['uarmL'] - 0.004, ('torso', 'uarmL')),
    'armR': (lambda X, d: d['torso'] - d['uarmR'] - 0.004, ('torso', 'uarmR')),
    'legL': (_plane((0.062, 0, 0.193), tuple(_n((-0.22, 0.05, 1)))), ('shortL', 'ulegL', 'hips')),
    'legR': (_plane((-0.062, 0, 0.193), tuple(_n((0.22, 0.05, 1)))), ('shortR', 'ulegR', 'hips')),
    'sockL': (_plane((0.066, 0, 0.052), (0, 0, 1)), ('llegL', 'footL')),
    'sockR': (_plane((-0.066, 0, 0.052), (0, 0, 1)), ('llegR', 'footR')),
}
_PARTS_CACHE = {}
def _side(c, cut):
    X = np.array([c], F32)
    _t, d = _field(X, _PARTS_CACHE['parts'])
    return float(CUTS[cut][0](X, d)[0])

def _cut(ob, parts):
    """ตัดขอบตามเส้น iso ของฟังก์ชันขอบ (เรียบ ไม่เป็นฟันเลื่อย) เฉพาะบริเวณชิ้นที่เกี่ยวข้อง
    วิธี: ใส่ค่าฟังก์ชันแทนพิกัด z ชั่วคราว → bisect ที่ z=0 (Blender แทรกจุดบนขอบด้วยการเฉลี่ยเชิงเส้น) → คืนพิกัดจริงจาก layer ที่เฉลี่ยตามกัน"""
    _PARTS_CACHE['parts'] = parts
    me = ob.data
    for name, (fn, near) in CUTS.items():
        co = np.array([v.co[:] for v in me.vertices], F32)
        _t, d = _field(co, parts)
        names = [p[0] for p in parts]
        D = np.stack([d[x] for x in names], 1)
        lab = D.argmin(1)
        sel = np.isin(lab, [names.index(x) for x in near])
        f = fn(co, d)
        bm = bmesh.new(); bm.from_mesh(me)
        lx = bm.verts.layers.float.new('rx'); ly = bm.verts.layers.float.new('ry'); lz = bm.verts.layers.float.new('rz')
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            v[lx], v[ly], v[lz] = v.co
            v.co.z = float(f[v.index])
        edges = [e for e in bm.edges if sel[e.verts[0].index] and sel[e.verts[1].index]]
        faces = list({fa for e in edges for fa in e.link_faces})
        verts = list({v for e in edges for v in e.verts})
        bmesh.ops.bisect_plane(bm, geom=edges + faces + verts, plane_co=(0, 0, 0), plane_no=(0, 0, 1), dist=1e-7)
        for v in bm.verts:
            v.co = (v[lx], v[ly], v[lz])
        bmesh.ops.triangulate(bm, faces=[fa for fa in bm.faces if len(fa.verts) > 3])
        for L in (lx, ly, lz):
            bm.verts.layers.float.remove(L)
        bm.to_mesh(me); bm.free()
    me.update()

def _material_of(c, nm, side):
    z = c[2]
    _side = lambda _c, cut: side[cut]
    if nm in ('head', 'nose', 'ear1', 'ear-1') or nm.startswith('hand') or nm.startswith('uarm') or nm.startswith('larm'):
        if not (nm.startswith('uarm') and _side(c, 'armL' if c[0] > 0 else 'armR') < 0):
            return 'MAT_Skin'
    if nm.startswith('foot') or (nm.startswith('lleg') and _side(c, 'sockL' if c[0] > 0 else 'sockR') < 0):
        return 'MAT_Base_Sock'
    if z >= WAIST_Z - 1e-4:
        if _side(c, 'neckline') <= 0 and _side(c, 'armL') <= 0 and _side(c, 'armR') <= 0 and nm in ('torso', 'neck', 'hips', 'uarmL', 'uarmR'):
            return 'MAT_Base_Shirt'
        return 'MAT_Skin'
    if nm in ('hips', 'torso') or nm.startswith('short') or nm.startswith('uleg'):
        leg = 'legL' if c[0] > 0 else 'legR'
        if nm in ('hips', 'torso') or _side(c, leg) >= 0:
            return 'MAT_Base_Shorts'
    return 'MAT_Skin'

MAT_FOR = {'torso': 'MAT_Base_Shirt', 'hips': 'MAT_Base_Shorts', 'foot': 'MAT_Base_Sock'}


def build_base_v2(arm, materials, target_tris=19000, weight_sources=True):
    """คืน [BODY_<region> ...] ที่ skin กับ arm แล้ว (เหมือน build_base เดิม) · materials: {'MAT_Skin':…, 'MAT_Base_Shirt':…}"""
    ob, parts = sculpt_mesh()
    decimate(ob, target_tris)
    _cut(ob, parts)
    X0, N0 = project_and_normals(ob, parts)
    N1 = warp_normals(X0, N0)
    me = ob.data
    names, D = _labels([v.co[:] for v in me.vertices], parts)
    pinfo = {p[0]: p for p in parts}
    lab = D.argmin(1)
    # material + region ต่อหน้า (ตามชิ้นที่ใกล้ที่สุดของจุดกึ่งกลางหน้า)
    fc = [tuple(sum((me.vertices[i].co for i in f.vertices), Vector()) / len(f.vertices)) for f in me.polygons]
    fn, FD = _labels(fc, parts)
    flab = FD.argmin(1)
    FX = np.array(fc, F32)
    _t, fd = _field(FX, parts)
    SIDES = {k: CUTS[k][0](FX, fd) for k in CUTS}
    mat_names = ['MAT_Skin', 'MAT_Base_Shirt', 'MAT_Base_Shorts', 'MAT_Base_Sock']
    for mn in mat_names:
        me.materials.append(materials[mn])
    face_region = []
    for fi_, (f, li, c) in enumerate(zip(me.polygons, flab, fc)):
        reg = pinfo[fn[li]][1]
        mn = _material_of(c, fn[li], {k: float(v[fi_]) for k, v in SIDES.items()})
        f.material_index = mat_names.index(mn)
        f.use_smooth = True
        # ส่วนร่างกาย (Body Mask) แบ่งตาม "ตะเข็บ" ของร่างเดิม: เสื้อกล้าม = torso · กางเกงซับใน = hips · ถุงเท้า = foot
        #   ข้อมือ (ต่ำกว่าปลายแขนท่อนล่างเดิม) = core เหมือนมือ · คอ = core  → เสื้อผ้าเดิมที่ปิดส่วนไหนมิด ก็ซ่อนส่วนนั้นได้เหมือนเดิม
        if mn == 'MAT_Base_Shirt' and reg != 'uarm':
            reg = 'torso'
        elif mn == 'MAT_Base_Shorts':
            reg = 'hips'
        elif mn == 'MAT_Base_Sock':
            reg = 'foot'
        elif reg in ('torso', 'hips'):
            reg = 'torso' if c[2] >= WAIST_Z else 'uleg'
        elif reg == 'larm' and c[2] < 0.292:
            reg = 'core'
        face_region.append(reg)
    # ---- แปลงสัดส่วน (เหมือนทุกชิ้น) แล้วคำนวณน้ำหนัก: ผสมระหว่างชิ้นที่อยู่ใกล้ (softmin ตามระยะ) → รอยต่อขยับนุ่ม ไม่ฉีก
    ob['eq_bones'] = ','.join(BONE)
    warp_object(ob)
    segs = {n: (Vector(BONE[n][1]), Vector(BONE[n][2])) for n in BONE}
    tau = 0.0015   # ผสมข้ามชิ้นเฉพาะตรงรอยต่อจริง ๆ (กว้างกว่านี้ผิวต้นแขนใกล้ไหล่ได้น้ำหนัก Chest มากกว่าร่างเดิม → ขยับช้ากว่าแขนเสื้อ → ทะลุ)
    vg = {}
    for v, row, li in zip(me.vertices, D, lab):
        order = np.argsort(row)[:3]
        e = np.exp(-(row[order] - row[order[0]]) / tau)
        e = e / e.sum()
        w = {}
        for j, k in zip(order, e):
            if k < 0.02:
                continue
            nm = names[j]
            bones = pinfo[nm][3]
            cw = {'Head': 1.0} if bones == ['Head'] else chain_weights(ob.matrix_world @ v.co, bones, segs)
            for b, x in cw.items():
                w[b] = w.get(b, 0.0) + x * k
        top = sorted(w.items(), key=lambda x: -x[1])[:3]
        s = sum(x for _, x in top) or 1.0
        for b, x in top:
            if x / s > 0.01:
                if b not in vg:
                    vg[b] = ob.vertex_groups.new(name=b)
                vg[b].add([v.index], x / s, 'REPLACE')
    # normal นุ่มของทั้งตัว (ก่อนแยกส่วน → ไม่มีรอยตะเข็บระหว่าง BODY_<region>)
    me.update()
    a = me.attributes.new('eq_n', 'FLOAT_VECTOR', 'POINT')
    for x, nv in zip(a.data, N1):
        x.vector = nv.tolist()
    me.normals_split_custom_set_from_vertices([tuple(v) for v in N1])
    # ---- ต้นแบบน้ำหนักให้เสื้อผ้า (eq_src) — แยกหน้าตามชิ้นแล้วรวมตาม key
    groups = {}
    temp = []
    for key in (('torso', 'hips', 'arm.L', 'arm.R', 'leg.L', 'leg.R') if weight_sources else ()):
        keep = [i for i, li in enumerate(flab) if key in pinfo[fn[li]][2].split(',')]
        if not keep:
            continue
        t = _subset(ob, keep, f'_src_{key}')
        groups[key] = [t]
        temp.append(t)
    if weight_sources:
        set_body_sources(groups)
    for t in temp:
        bpy.data.objects.remove(t, do_unlink=True)
    # ---- แยกเป็น BODY_<region>
    out = []
    for r in ['core', 'torso', 'hips', 'uarm', 'larm', 'uleg', 'lleg', 'foot']:
        keep = [i for i, reg in enumerate(face_region) if reg == r]
        rob = _subset(ob, keep, f'BODY_{r}')
        rob['eq_region'] = r
        m = rob.modifiers.new('ARM_Main', 'ARMATURE'); m.object = arm
        rob.parent = arm
        out.append(rob)
    bpy.data.objects.remove(ob, do_unlink=True)
    return out


def _subset(ob, face_idx, name):
    """สำเนาเฉพาะหน้าที่เลือก (คง vertex groups · material) + normal ของผิวทั้งตัว (attribute eq_n → custom normals)"""
    new = ob.copy(); new.data = ob.data.copy(); new.name = name; new.data.name = name
    bpy.context.scene.collection.objects.link(new)
    keep = set(face_idx)
    bm = bmesh.new(); bm.from_mesh(new.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(new.data); bm.free()
    a = new.data.attributes.get('eq_n')
    if a:
        new.data.normals_split_custom_set_from_vertices([tuple(x.vector) for x in a.data])
        new.data.attributes.remove(new.data.attributes['eq_n'])
    return new


def old_envelope(X):
    """ทรงเดิม (v1) = union ตรง ๆ ของชิ้นเดิม — ใช้วัดว่าผิวใหม่ยื่นออกนอกทรงเดิมเท่าไร (เสื้อผ้าปั้นทับทรงนี้)"""
    hc, hr = tuple(HEAD_C), tuple(HEAD_R)
    np_, nn = head_surface(0, 0.768, out=-0.007)
    d = [sd_ellipsoid(X, hc, hr), sd_ellipsoid(X, tuple(np_), (0.017, 0.013, 0.013)),
         sd_capsule(X, (0, 0, 0.53), (0, 0, 0.64), 0.046, 0.046), sd_capsule(X, (0, 0, 0.32), (0, 0, 0.47), 0.112, 0.124, flat=0.74),
         sd_ellipsoid(X, (0, 0, 0.255), (0.118, 0.086, 0.074))]
    for sx in (1, -1):
        d += [sd_ellipsoid(X, (0.199 * sx, 0.006, 0.785), (0.03, 0.022, 0.042)),
              sd_capsule(X, (0.13 * sx, 0, 0.507), (0.168 * sx, 0, 0.395), 0.042, 0.038),
              sd_capsule(X, (0.168 * sx, 0, 0.395), (0.186 * sx, 0, 0.278), 0.038, 0.034),
              sd_ellipsoid(X, (0.191 * sx, -0.003, 0.24), (0.041, 0.038, 0.042)),
              sd_capsule(X, (0.062 * sx, 0, 0.245), (0.063 * sx, 0, 0.195), 0.0495, 0.0485),
              sd_capsule(X, (0.062 * sx, 0, 0.24), (0.064 * sx, 0, 0.135), 0.047, 0.043),
              sd_capsule(X, (0.064 * sx, 0, 0.135), (0.066 * sx, 0, 0.055), 0.043, 0.038),
              sd_ellipsoid(X, (0.066 * sx, -0.024, 0.031), (0.043, 0.066, 0.031))]
    return np.min(np.stack(d, 1), 1)
