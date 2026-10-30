"""
EnglishQuest Avatar — Detail kit (v2): ชิ้นส่วนเสื้อผ้าที่มีรายละเอียดจริง
  · ผ้า (PBR): eq_fabric บน material → runtime ใส่ normal map ลายผ้าที่สร้างแบบ procedural (ใช้ร่วมทุกชิ้น ไม่เพิ่มขนาดไฟล์)
    ลาย: weave (ผ้าฝ้าย) · twill (ยีนส์) · knit (ไหมพรม) · rib (ขอบยืด) · corduroy (ลูกฟูก) · leather (หนัง) · fleece (ผ้าสำลี)
         · tread (ยางพื้นรองเท้า) · mesh (ผ้าตาข่ายกีฬา) · straw (สาน) · quilt (บุนวม) · poly (โพลีเอสเตอร์) · nylon (ไนลอนริปสต็อป)
  · รูปทรง: ท่อเปิด (แขนเสื้อ/ขากางเกง/ข้อรองเท้า) มี edge loop ทุก ~1 ซม. + ขอบพับ (hem) · คอเสื้อเจาะจริง (คอกลม/คอวี/คอเต่า)
    · กระดุม · ซิป · กระเป๋าปะ · ตะเข็บ (topstitch) · พื้นรองเท้ามีดอกยาง · เชือกผูก · ตาไก่
  พิกัด: เมตร · Z ขึ้น · ตัวละครหันหน้า -Y · สูง 1.0 m (เหมือน eqlib)
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from eqlib import _obj_from_bm, apply_mods, mat as _mat

# ---------------------------------------------------------------------
# ผ้า / วัสดุ
# ---------------------------------------------------------------------
# pattern -> (ความหนาแน่น UV ต่อเมตร, ความแรง normal)
FABRICS = {'weave': (16, 0.35), 'twill': (15, 0.55), 'knit': (11, 0.75), 'rib': (13, 0.6), 'corduroy': (12, 0.7), 'leather': (9, 0.35),
           'fleece': (9, 0.3), 'tread': (22, 0.9), 'mesh': (18, 0.6), 'straw': (12, 0.8), 'quilt': (7, 0.5), 'canvas': (18, 0.45),
           'poly': (20, 0.3), 'nylon': (14, 0.45),   # โพลีเอสเตอร์ (ทอละเอียด) · ไนลอนริปสต็อป (ตารางเสริมแรง)
           'hair': (0, 0.55)}   # hair: UV ตามทิศไหลของผม (meridian รอบศีรษะ) ไม่ใช่ triplanar

def fab(name, color, fabric=None, rough=0.8, metal=0.0, emission=None, nstr=None):
    """material + ป้ายลายผ้า (export เป็น glTF extras → three.js material.userData.eq_fabric)"""
    m = _mat(name, color, rough, metal, emission)
    if fabric:
        m['eq_fabric'] = fabric
        # Style v3: ผิวผ้าเรียบสะอาดขึ้น (ลายผ้าจางลง 40%) — ยังเห็นเนื้อผ้าเมื่อซูม
        m['eq_nstr'] = round(float(nstr if nstr is not None else FABRICS[fabric][1]) * 0.6, 3)
    return m

UV_SCALE = 64   # เก็บ UV ย่อให้อยู่ใน 0..1 (quantize เป็น uint16 ได้ ไฟล์เล็ก) · runtime/ภาพย่อ คูณกลับด้วย repeat 64 (เลื่อน 32 รอบ = ต่อลายพอดี)

def uv_triplanar(ob):
    """UV แบบฉายจาก 3 แกน (ตามทิศหน้า) หน่วยเมตร × ความหนาแน่นของลายผ้าแต่ละ material — ไม่มี texture เฉพาะชิ้น"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    me.uv_layers.active = me.uv_layers[0]
    uv = me.uv_layers.active.data
    dens = []
    for m in me.materials:
        f = m.get('eq_fabric') if m else None
        dens.append(FABRICS[f][0] if f in FABRICS else 12)
    mw = ob.matrix_world
    from eqlib import style_warp
    hair_c = style_warp((0, 0.004, 0.807), True)   # ศูนย์ศีรษะ (HEAD_C + offset ของผม) ในพิกัดจริงหลังแปลงสัดส่วน
    for p in me.polygons:
        mat = me.materials[p.material_index] if p.material_index < len(me.materials) else None
        if mat is not None and mat.get('eq_uvmode') == 'keep':
            continue   # UV ที่เขียนตอนสร้าง (เส้นผมตามช่อเปีย/มวย) — ไม่ทับ
        if mat is not None and mat.get('eq_fabric') == 'hair':
            # ผม: u = มุมรอบศีรษะ (24 ช่องลาย/รอบ) · v = มุมก้ม-เงยจากยอดหัว → เส้นผมวิ่งจากขวัญลงล่าง (ตามทิศไหลของผม)
            uvs = []
            for li in p.loop_indices:
                q = mw @ me.vertices[me.loops[li].vertex_index].co - hair_c
                az = math.atan2(q.x, -q.y)
                el = math.acos(max(-1.0, min(1.0, q.z / max(q.length, 1e-6))))
                uvs.append([az, el])
            a0 = uvs[0][0]
            for uv_ in uvs:   # face ไม่คร่อมรอยต่อด้านหลัง
                while uv_[0] - a0 > math.pi:
                    uv_[0] -= 2 * math.pi
                while uv_[0] - a0 < -math.pi:
                    uv_[0] += 2 * math.pi
            for li, (az, el) in zip(p.loop_indices, uvs):
                uv[li].uv = (az / (2 * math.pi) * 24 / UV_SCALE + 0.5, el * 4 / UV_SCALE + 0.5)
            continue
        n = (mw.to_3x3() @ p.normal)
        ax = max(range(3), key=lambda i: abs(n[i]))
        d = dens[p.material_index] if p.material_index < len(dens) else 12
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv[li].uv = (u * d / UV_SCALE + 0.5, v * d / UV_SCALE + 0.5)

# ---------- ลายผ้า (ใช้สูตรเดียวกับ runtime: public/js/avatar3d.js FABRIC) ----------
def _hash(i, j, seed):
    import numpy as np
    h = (i.astype(np.uint32) * np.uint32(374761393) + j.astype(np.uint32) * np.uint32(668265263) + np.uint32(seed)) & np.uint32(0xffffffff)
    h = ((h ^ (h >> np.uint32(13))) * np.uint32(1274126177)) & np.uint32(0xffffffff)
    h = h ^ (h >> np.uint32(16))
    return h.astype(np.float64) / 4294967296.0

def _noise(u, v, period, seed=1):
    import numpy as np
    x, y = u * period, v * period
    i, j = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - i, y - j
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    m = lambda a: np.mod(a, period)
    a, b = _hash(m(i), m(j), seed), _hash(m(i + 1), m(j), seed)
    c, d = _hash(m(i), m(j + 1), seed), _hash(m(i + 1), m(j + 1), seed)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy

def fabric_height(pattern, size=128):
    import numpy as np
    t = (np.arange(size) + 0.5) / size
    u, v = np.meshgrid(t, t)
    fr = lambda x: x - np.floor(x)
    s = np.sin
    if pattern == 'weave':
        N = 16; a, b = s(math.pi * fr(N * u)), s(math.pi * fr(N * v))
        c = np.mod(np.floor(N * u) + np.floor(N * v), 2)
        h = np.where(c > 0, 0.8 * a + 0.2 * b, 0.8 * b + 0.2 * a) + 0.12 * _noise(u, v, 32)
    elif pattern == 'canvas':
        N = 24; h = 0.5 * s(math.pi * fr(N * u)) + 0.5 * s(math.pi * fr(N * v)) + 0.15 * _noise(u, v, 32)
    elif pattern == 'twill':
        N = 16; h = 0.6 * s(math.pi * fr(N * (u + v))) + 0.25 * s(math.pi * fr(2 * N * u)) + 0.18 * _noise(u, v, 64, 3)
    elif pattern == 'knit':
        N = 12; x = fr(N * u); y = fr(N * 1.5 * v + np.abs(x - 0.5) * 0.9)
        h = 0.55 * s(math.pi * x) + 0.45 * s(math.pi * y)
    elif pattern == 'rib':
        N = 18; h = np.abs(s(math.pi * fr(N * u))) ** 0.7
    elif pattern == 'corduroy':
        N = 14; h = np.abs(s(math.pi * fr(N * u))) ** 0.5 + 0.05 * _noise(u, v, 16)
    elif pattern == 'leather':
        h = 1 - _noise(u, v, 12, 5) ** 2 + 0.35 * _noise(u, v, 32, 7)
    elif pattern == 'fleece':
        h = 0.6 * _noise(u, v, 16, 9) + 0.4 * _noise(u, v, 48, 11)
    elif pattern == 'tread':
        N = 10; h = 0.5 + 0.5 * np.cos(2 * math.pi * N * v)
    elif pattern == 'mesh':
        N = 14; dx, dy = fr(N * u) - 0.5, fr(N * v) - 0.5
        d = np.sqrt(dx * dx + dy * dy); h = np.clip((d - 0.22) / 0.14, 0, 1)
    elif pattern == 'straw':
        N = 10; a, b = s(math.pi * fr(N * u)), s(math.pi * fr(N * v))
        c = np.mod(np.floor(N * u) + np.floor(N * v * 2), 2)
        h = np.where(c > 0, a, b) + 0.2 * _noise(u, v, 40, 13)
    elif pattern == 'poly':
        h = 0.3 * s(math.pi * fr(36 * u)) + 0.3 * s(math.pi * fr(36 * v)) + 0.08 * _noise(u, v, 64, 23)
    elif pattern == 'nylon':
        h = 0.3 * s(math.pi * fr(40 * u)) + 0.3 * s(math.pi * fr(40 * v)) + np.where((fr(8 * u) < 0.07) | (fr(8 * v) < 0.07), 0.55, 0.0)
    elif pattern == 'quilt':
        N = 3; h = s(math.pi * fr(N * v)) ** 0.6
    elif pattern == 'hair':
        # เส้นผมขนานตามแนว v (ทิศไหลของผม) หนาบางไม่เท่ากัน + ช่อผมใหญ่ซ้อนอีกชั้น
        N = 12; h = 0.55 * np.abs(s(math.pi * fr(N * u + 0.35 * _noise(u, v, 8, 17)))) ** 0.5 + 0.3 * _noise(u, u * 0, 32, 19) + 0.15 * np.abs(s(math.pi * fr(3 * u)))
    else:
        h = np.zeros_like(u)
    return h

def fabric_normal_rgba(pattern, size=128, strength=1.0):
    import numpy as np
    h = fabric_height(pattern, size)
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * size / 16.0 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * size / 16.0 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones_like(h)[..., None]], -1)
    return rgba

def attach_fabric_preview():
    """(หลัง export) ต่อ normal map ลายผ้าใน Blender เพื่อให้ภาพย่อ/QA render เหมือน runtime"""
    imgs = {}
    for m in bpy.data.materials:
        f = m.get('eq_fabric') if m else None
        if not f or not m.use_nodes:
            continue
        if f not in imgs:
            rgba = fabric_normal_rgba(f)
            im = bpy.data.images.new(f'FAB_{f}', 128, 128, alpha=True, float_buffer=False)
            im.colorspace_settings.name = 'Non-Color'
            im.pixels.foreach_set(rgba.astype('float32').ravel())
            imgs[f] = im
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        if not bsdf or bsdf.inputs['Normal'].is_linked:
            continue
        uvn = nt.nodes.new('ShaderNodeUVMap')
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = imgs[f]; tex.interpolation = 'Linear'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = float(m.get('eq_nstr', 0.5))
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (UV_SCALE, UV_SCALE, 1.0)
        nt.links.new(uvn.outputs['UV'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

# ---------------------------------------------------------------------
# รูปทรง
# ---------------------------------------------------------------------
def _frame(t):
    up = Vector((0, 0, 1)) if abs(t.dot(Vector((0, 0, 1)))) < 0.95 else Vector((0, 1, 0))
    n = t.cross(up).normalized()
    b = t.cross(n).normalized()
    return n, b

def tube_open(name, pts, radii, material, bones, seg=20, flat=1.0, cap_start=True, cap_end=False, loop=0.01, thick=0.0045, rigid=None,
              wave=None):
    """ท่อตามเส้นทาง (ปลายเปิด) — แขนเสื้อ ขากางเกง ข้อรองเท้า · edge loop ถี่ตามความยาว (พับศอก/เข่าแล้วไม่ยุบ)
    · cap_start = ปิดโค้งด้านต้น (ซ่อนในลำตัว) · thick = ความหนาผ้า (ขอบปลายดูเป็นผ้าจริง ไม่ใช่แผ่นบาง)
    · wave(i_ring, j, angle) -> ระยะเพิ่ม (จีบ/รอยยับ)"""
    P = [Vector(p) for p in pts]
    # สุ่มจุดย่อยตามความยาว
    S, R = [], []
    for k in range(len(P) - 1):
        a, b = P[k], P[k + 1]
        n = max(1, int((b - a).length / loop))
        for i in range(n):
            t = i / n
            S.append(a.lerp(b, t)); R.append(radii[k] + (radii[k + 1] - radii[k]) * t)
    S.append(P[-1]); R.append(radii[-1])
    bm = bmesh.new()
    rings = []
    for i, c in enumerate(S):
        a = S[max(0, i - 1)]; b = S[min(len(S) - 1, i + 1)]
        t = (b - a).normalized()
        nx, by = _frame(t)
        ring = []
        for j in range(seg):
            ang = 2 * math.pi * j / seg
            r = R[i] + (wave(i, j, ang) if wave else 0.0)
            ring.append(bm.verts.new(c + nx * math.cos(ang) * r + by * math.sin(ang) * r * flat))
        rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        for j in range(seg):
            bm.faces.new((ra[j], ra[(j + 1) % seg], rb[(j + 1) % seg], rb[j]))
    if cap_start:
        t0 = (S[1] - S[0]).normalized()
        nx, by = _frame(t0)
        prev = rings[0]
        for k in range(1, 4):
            a = math.pi / 2 * k / 4
            cc = S[0] - t0 * math.sin(a) * R[0]
            rr = math.cos(a) * R[0]
            ring = [bm.verts.new(cc + nx * math.cos(2 * math.pi * j / seg) * rr + by * math.sin(2 * math.pi * j / seg) * rr * flat) for j in range(seg)]
            for j in range(seg):
                bm.faces.new((ring[j], ring[(j + 1) % seg], prev[(j + 1) % seg], prev[j]))
            prev = ring
        pole = bm.verts.new(S[0] - t0 * R[0])
        for j in range(seg):
            bm.faces.new((pole, prev[(j + 1) % seg], prev[j]))
    if cap_end:
        c = bm.verts.new(S[-1])
        for j in range(seg):
            bm.faces.new((c, rings[-1][j], rings[-1][(j + 1) % seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    if thick:
        mod = ob.modifiers.new('solid', 'SOLIDIFY'); mod.thickness = thick; mod.offset = -1.0
        apply_mods(ob)
    return ob

def ring(name, center, axis, radius, tube, material, bones, seg=24, tseg=6, flat=1.0, rigid=None):
    """ห่วง/ขอบพับ ตั้งฉากกับแกน axis (ขอบแขนเสื้อ ขากางเกง ปลอกคอ)"""
    c, ax = Vector(center), Vector(axis).normalized()
    nx, by = _frame(ax)
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = nx * math.cos(a) + by * math.sin(a) * flat
        p = c + d * radius
        rr = []
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            rr.append(bm.verts.new(p + d.normalized() * math.cos(b) * tube + ax * math.sin(b) * tube))
        rings.append(rr)
    for i in range(seg):
        r0, r1 = rings[i], rings[(i + 1) % seg]
        for j in range(tseg):
            bm.faces.new((r0[j], r0[(j + 1) % tseg], r1[(j + 1) % tseg], r1[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(name, bm, material, bones, rigid)

def delete_where(ob, pred, thick=None, snap=None):
    """ลบ vertex ที่ pred(world_co) เป็นจริง (เจาะคอเสื้อ เว้าแขน ผ่าหน้า) แล้วใส่ความหนาให้ขอบ
    snap(world_co) -> world_co ใหม่ ของ vertex ริมรอยตัด: ดึงขอบให้อยู่บนเส้นตัดจริง (ขอบเรียบ ไม่หยักตามกริด ไม่กว้างเกิน)"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    mw = ob.matrix_world
    inv = mw.inverted()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if pred(mw @ v.co)], context='VERTS')
    if snap:
        rim = {v for e in bm.edges if e.is_boundary for v in e.verts}
        for v in rim:
            q = snap(mw @ v.co)
            if q is not None:
                v.co = inv @ q
    bm.to_mesh(ob.data); bm.free()
    if thick:
        mod = ob.modifiers.new('solid', 'SOLIDIFY'); mod.thickness = thick; mod.offset = 1.0
        apply_mods(ob)
    return ob

def flat_patch(name, outline, depth, center, normal, material, bones, rigid=None, up=Vector((0, 0, 1)), bevel=0.25):
    """แผ่นแบน (กระเป๋าปะ ป้าย ลายสกรีน) วางบนผิวตามทิศ normal · outline = [(x,y)] ในระนาบแผ่น (x = ขวา, y = บน)"""
    n = Vector(normal).normalized()
    x = up.cross(n).normalized() if abs(up.dot(n)) < 0.98 else Vector((1, 0, 0))
    y = n.cross(x).normalized()
    bm = bmesh.new()
    top = [bm.verts.new(Vector(center) + x * px + y * py + n * depth) for px, py in outline]
    bot = [bm.verts.new(Vector(center) + x * px + y * py) for px, py in outline]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    k = len(outline)
    for i in range(k):
        bm.faces.new((bot[i], bot[(i + 1) % k], top[(i + 1) % k], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    for p in ob.data.polygons:
        p.use_smooth = False
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = depth * bevel; bv.segments = 2; bv.limit_method = 'ANGLE'
        apply_mods(ob)
    return ob

def disc(name, center, normal, r, depth, material, bones, seg=14, rigid=None, holes=False):
    """กระดุม/หมุด/ตาไก่ (ทรงกระบอกแบนมุมมน)"""
    pts = [(math.cos(2 * math.pi * i / seg) * r, math.sin(2 * math.pi * i / seg) * r) for i in range(seg)]
    ob = flat_patch(name, pts, depth, center, normal, material, bones, rigid=rigid, bevel=0.4)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob

def polyline(name, pts, radius, material, bones, rigid=None, tseg=5):
    """เส้นตะเข็บ/เชือก/สาย (ท่อเล็กตามเส้น)"""
    from eqlib import tube_path
    return tube_path(name, pts, radius, material, bones, closed=False, tseg=tseg, rigid=rigid)

# ---------------------------------------------------------------------
# พื้นผิวลำตัว (วางของบนอก/หลังให้แนบผิวเสื้อ)
# ---------------------------------------------------------------------
TORSO_RX = lambda z: 0.112 + (0.124 - 0.112) * max(0.0, min(1.0, (z - 0.32) / 0.15))

def torso_point(x, z, off=0.02, back=False, flat=0.76):
    """จุดบนผิวเสื้อ (ด้านหน้า/หลัง) ที่ x,z — คืน (จุด, normal)"""
    rx = TORSO_RX(z) + off
    xx = max(-rx * 0.98, min(rx * 0.98, x))
    yy = math.sqrt(max(0.0, 1 - (xx / rx) ** 2)) * rx * flat
    y = yy if back else -yy
    n = Vector((xx / rx ** 2, y / (rx * flat) ** 2, 0)).normalized()
    return Vector((xx, y, z)), n

def outline_rect(w, h, r=0.004, n=4):
    from eqlib import rrect_pts
    return rrect_pts(w, h, r, n)

# ---------------------------------------------------------------------
# ขอบ/ตะเข็บตามรอยตัดจริง (คอเสื้อ คอวี สาบหน้าเสื้อแจ็กเก็ต ชายเสื้อ) — วางท่อตาม boundary ของ mesh จึงพอดีทุกทรง
# ---------------------------------------------------------------------
def boundary_paths(ob, pred):
    """เส้นขอบเปิดของ mesh (ก่อนใส่ความหนา) ที่ทุกจุดผ่าน pred(world_co) → [(points, closed)]"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    mw = ob.matrix_world
    adj = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts
            if pred(mw @ a.co) and pred(mw @ b.co):
                adj.setdefault(a.index, []).append(b.index)
                adj.setdefault(b.index, []).append(a.index)
    co = {v.index: mw @ v.co for v in bm.verts}
    bm.free()
    # แยกเป็นกลุ่มที่ต่อกัน แล้วเดินจากปลายเส้น (ถ้าเป็นเส้นเปิด) หรือจุดใดก็ได้ (ถ้าเป็นวง)
    seen, out = set(), []
    for s0 in list(adj):
        if s0 in seen:
            continue
        comp, stack = set(), [s0]
        while stack:
            x = stack.pop()
            if x in comp:
                continue
            comp.add(x); stack += adj[x]
        ends = [v for v in comp if len(adj[v]) == 1]
        cur = ends[0] if ends else s0
        path, prev = [cur], None
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in path]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            path.append(cur)
        seen |= comp
        if len(path) >= 3:
            out.append(([co[i] for i in path], not ends))
    return out

def edge_trim(name, ob, pred, radius, material, bones, out=0.0, rigid=None, tseg=6, min_len=0.02):
    """ท่อขอบ (ปลอกคอ ขอบคอวี สาบเสื้อ) ตามรอยตัดของ ob ที่ผ่าน pred — คืน list ของ object"""
    from eqlib import tube_path
    res = []
    for k, (pts, closed) in enumerate(boundary_paths(ob, pred)):
        L = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
        if L < min_len:
            continue
        if out:
            c = sum(pts, Vector()) / len(pts)
            pts = [p + (p - c).normalized() * out for p in pts]
        res.append(tube_path(f'{name}{k}', pts, radius, material, bones, closed=closed, tseg=tseg, rigid=rigid))
    return res

def solidify(ob, thick, offset=1.0):
    mod = ob.modifiers.new('solid', 'SOLIDIFY'); mod.thickness = thick; mod.offset = offset
    apply_mods(ob)
    return ob

def displace(ob, fn):
    """เลื่อน vertex ตามฟังก์ชัน fn(co) -> Vector (รอยบุนวม รอยยับ ลอนผม)"""
    mw = ob.matrix_world
    inv = mw.inverted()
    for v in ob.data.vertices:
        w = mw @ v.co
        v.co = inv @ (w + fn(w))
    return ob

def box_lo(name, center, size, material, bones, rigid=None, rot=None, bevel=0.25):
    """กล่องเล็ก low-poly (ฟันซิป หูเข็มขัด หัวเข็มขัด ปุ่มยาง) — ~44 tris แทน rbox ที่ subdivide (~770 tris)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Diagonal((size[0], size[1], size[2], 1))
    if rot:
        m = rot.to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ m, verts=bm.verts)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    for p in ob.data.polygons:
        p.use_smooth = False
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = min(size) * bevel; bv.segments = 1
        apply_mods(ob)
    return ob
