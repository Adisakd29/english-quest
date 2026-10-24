"""
EnglishQuest 3D Avatar — Blender library (Blender 4.x/5.x · รันได้ทั้งใน Blender และ `pip install bpy`)

มาตรฐานกลาง (ทุก asset ต้องตรงกัน — ห้าม export คนละ scale):
  หน่วย        เมตร · ตัวละครสูง 1.00 m (เท้า z=0 · หัว z≈1.0)
  แกน          Blender Z-up · ตัวละครหันหน้าไป -Y · Origin/Anchor = (0,0,0) ที่พื้นกึ่งกลางเท้า
               glTF export (+Y up) -> runtime three.js: Y-up · หันหน้า +Z
  Skeleton     ARM_Main เดียวกันทุก item (ชื่อ bone ตาม BONES) · เสื้อผ้า skin กับ ARM_Main · ของติดตัว (หมวก/แว่น/หูฟัง/กระเป๋า/ผม)
               skin weight 1.0 กับ bone ของ socket (Head / Chest) -> runtime ใช้วิธี rebind แบบเดียวกันทุกชิ้น
  Sockets      SOCK_Head (Head) · SOCK_Back (Chest) · SOCK_Spine (Spine) · SOCK_Hand_L/R (Hand.L/R)
  Materials    MAT_Skin (สีผิวกำหนดตอน runtime ไม่ผูกกับเพศ/เชื้อชาติ) · MAT_<Item>_<Part>
  Naming       CHR_Base_01 · HAIR_Short_01 · TOP_Hoodie_01 · BOT_Jeans_01 · SHOE_Sneaker_01 · HAT_Cap_01
               ACC_Glasses_01 · ACC_Headphone_01 · BACK_Backpack_01 · ARM_Main · ANIM_Idle / ANIM_Wave / ...
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

BASE_VERSION = 1
# ---------- Skeleton (head, tail, parent) — เมตร · Blender space ----------
BONES_SRC = [   # พิกัด "ต้นแบบ" (modeling space) — ของทุกชิ้นปั้นในพิกัดนี้ แล้วแปลงเป็นสัดส่วนจริงด้วย style_warp()
    ('Root', (0, 0, 0), (0, 0, 0.10), None),
    ('Hips', (0, 0, 0.24), (0, 0, 0.33), 'Root'),
    ('Spine', (0, 0, 0.33), (0, 0, 0.44), 'Hips'),
    ('Chest', (0, 0, 0.44), (0, 0, 0.56), 'Spine'),
    ('Neck', (0, 0, 0.56), (0, 0, 0.61), 'Chest'),
    ('Head', (0, 0, 0.61), (0, 0, 0.99), 'Neck'),
    ('Eye.L', (0.072, -0.150, 0.790), (0.072, -0.190, 0.790), 'Head'),
    ('Eye.R', (-0.072, -0.150, 0.790), (-0.072, -0.190, 0.790), 'Head'),
    ('UpperArm.L', (0.135, 0, 0.525), (0.168, 0, 0.395), 'Chest'),
    ('LowerArm.L', (0.168, 0, 0.395), (0.186, 0, 0.275), 'UpperArm.L'),
    ('Hand.L', (0.186, 0, 0.275), (0.194, 0, 0.205), 'LowerArm.L'),
    ('UpperArm.R', (-0.135, 0, 0.525), (-0.168, 0, 0.395), 'Chest'),
    ('LowerArm.R', (-0.168, 0, 0.395), (-0.186, 0, 0.275), 'UpperArm.R'),
    ('Hand.R', (-0.186, 0, 0.275), (-0.194, 0, 0.205), 'LowerArm.R'),
    ('UpperLeg.L', (0.062, 0, 0.245), (0.064, 0, 0.135), 'Hips'),
    ('LowerLeg.L', (0.064, 0, 0.135), (0.066, 0, 0.045), 'UpperLeg.L'),
    ('Foot.L', (0.066, 0, 0.045), (0.066, -0.075, 0.020), 'LowerLeg.L'),
    ('UpperLeg.R', (-0.062, 0, 0.245), (-0.064, 0, 0.135), 'Hips'),
    ('LowerLeg.R', (-0.064, 0, 0.135), (-0.066, 0, 0.045), 'UpperLeg.R'),
    ('Foot.R', (-0.066, 0, 0.045), (-0.066, -0.075, 0.020), 'LowerLeg.R'),
]
# ---------- สัดส่วนตัวละคร (Style v3 "หัวโตตัวเล็ก") ----------
# ทุกชิ้น (ตัว/ผม/เสื้อผ้า/หมวก/ของ) ปั้นในพิกัดต้นแบบ (BONES_SRC) แล้ว "แปลงสัดส่วน" ด้วยฟังก์ชันเดียวกันก่อน skin
#   ลำตัว/แขน/ขา: ย่อ (กว้าง KX · สูง KB) · หัว + ของบนหัว: ขยายสม่ำเสมอ KH รอบคอ · ช่วงคอผสมนุ่ม (ไม่มีรอยต่อ)
#   → ของทุกชิ้นยังพอดีตัว (แปลงด้วยฟิลด์เดียวกับร่างกาย) · Item ID / slot / bone ชื่อเดิมทั้งหมด
STYLE = {'KX': 0.86, 'KB': 0.84, 'KH': 1.17, 'N': 0.60, 'Z0': 0.555, 'Z1': 0.625}
_NP = Vector((0, 0, STYLE['N']))
def _sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)
def _body_w(p):
    return Vector((p[0] * STYLE['KX'], p[1] * STYLE['KX'], p[2] * STYLE['KB']))
_NP2 = _body_w(_NP)
def _head_w(p):
    p = Vector(p)
    d = p - _NP
    if d.z >= 0:
        return _NP2 + d * STYLE['KH']
    # ส่วนของบนหัวที่ห้อยต่ำกว่าคอ (ผมยาว): ความยาวย่อตามลำตัว · ความกว้างค่อย ๆ กลับเป็นสัดส่วนลำตัว (ไม่ลอยห่างหลัง)
    k = STYLE['KX'] + (STYLE['KH'] - STYLE['KX']) * _sm((p.z - (STYLE['N'] - 0.12)) / 0.12)
    return Vector((_NP2.x + d.x * k, _NP2.y + d.y * k, _NP2.z + d.z * STYLE['KB']))
HEAD_BONES = {'Head', 'Eye.L', 'Eye.R'}
def style_warp(p, head=False):
    """พิกัดต้นแบบ → พิกัดสัดส่วนจริง · head=True: ชิ้นที่ติดหัวแบบ rigid (ทั้งชิ้นตามหัว)"""
    if head:
        return _head_w(p)
    p = Vector(p)
    t = _sm((p.z - STYLE['Z0']) / (STYLE['Z1'] - STYLE['Z0']))
    return _body_w(p).lerp(_head_w(p), t)
def _warp_bone(name, h, t):
    hd = name in HEAD_BONES
    return tuple(round(c, 5) for c in style_warp(h, hd)), tuple(round(c, 5) for c in style_warp(t, hd or name == 'Neck'))
BONES = [(n, *_warp_bone(n, h, t), par) for n, h, t, par in BONES_SRC]
BONE = {b[0]: b for b in BONES}
SOCKETS = {'SOCK_Head': 'Head', 'SOCK_Back': 'Chest', 'SOCK_Spine': 'Spine', 'SOCK_Hand_L': 'Hand.L', 'SOCK_Hand_R': 'Hand.R'}
# กลุ่ม bone ที่ใช้คำนวณ skin weight ของแต่ละส่วน (กันแขนไปดึงลำตัว ฯลฯ)
G_TORSO = ['Hips', 'Spine', 'Chest', 'Neck']
G_ARM_L = ['Chest', 'UpperArm.L', 'LowerArm.L', 'Hand.L']
G_ARM_R = ['Chest', 'UpperArm.R', 'LowerArm.R', 'Hand.R']
G_LEG_L = ['Hips', 'UpperLeg.L', 'LowerLeg.L', 'Foot.L']
G_LEG_R = ['Hips', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R']
G_HIPS = ['Hips', 'UpperLeg.L', 'UpperLeg.R']

# ---------- สัดส่วนหัว (ใช้วางหน้า/ผม/แว่นให้แนบผิว) ----------
HEAD_C = Vector((0, 0, 0.795))
HEAD_R = Vector((0.205, 0.185, 0.198))   # rx, ry(ลึก), rz
# หัวในพิกัดจริง (หลังแปลงสัดส่วน) — ใช้ตอนตรวจ (validation) เท่านั้น · การปั้นใช้ HEAD_C/HEAD_R ต้นแบบ
HEAD_C_W = style_warp(HEAD_C, True)
HEAD_R_W = HEAD_R * STYLE['KH']
def warp_object(ob):
    """แปลงสัดส่วนชิ้นงาน (ครั้งเดียว) — ชิ้นที่ติดหัวทั้งชิ้น (rigid Head/Eye หรือ skin เฉพาะ bone หัว) ใช้การขยายหัวล้วน"""
    if ob.get('eq_warped'):
        return
    names = set(ob.get('eq_bones', '').split(',')) - {''}
    rig = ob.get('eq_rigid')
    head = (rig in HEAD_BONES) or (not rig and names and names <= HEAD_BONES)
    mw = ob.matrix_world.copy(); mi = mw.inverted()
    for v in ob.data.vertices:
        v.co = mi @ style_warp(mw @ v.co, head)
    ob.data.update()
    ob['eq_warped'] = 1

def head_surface(x, z, out=0.0):
    """จุดบนผิวหน้า (ด้านหน้า -Y) ที่ x,z — คืน Vector"""
    u = (x / HEAD_R.x) ** 2 + ((z - HEAD_C.z) / HEAD_R.z) ** 2
    y = -HEAD_R.y * math.sqrt(max(0.0, 1 - u))
    n = Vector((x / HEAD_R.x ** 2, y / HEAD_R.y ** 2, (z - HEAD_C.z) / HEAD_R.z ** 2)).normalized()
    return Vector((x, y, z)) + n * out, n

# =====================================================================
# Scene / materials
# =====================================================================
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1.0
    s.render.fps = 24
    return s

def mat(name, color, rough=0.7, metal=0.0, emission=None, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    r, g, b = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    bsdf.inputs['Base Color'].default_value = (lin(r), lin(g), lin(b), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        er, eg, eb = [lin(int(emission[i:i + 2], 16) / 255) for i in (1, 3, 5)]
        bsdf.inputs['Emission Color'].default_value = (er, eg, eb, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    m.use_backface_culling = False
    return m

# =====================================================================
# Primitive builders (bmesh) — คืน object ที่มี material + กลุ่ม bone สำหรับ skin
# =====================================================================
def _obj_from_bm(name, bm, material, bones, rigid=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    ob['eq_bones'] = ','.join(bones)
    if rigid:
        ob['eq_rigid'] = rigid
    return ob

def ellipsoid(name, center, radii, material, bones, seg=24, rings=12, rigid=None, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    m = Matrix.Diagonal((radii[0], radii[1], radii[2], 1))
    if rot:
        m = rot.to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ m, verts=bm.verts)
    return _obj_from_bm(name, bm, material, bones, rigid)

def capsule(name, p0, p1, r0, r1, material, bones, seg=16, rings=10, flat=1.0, rigid=None, loop=0.012):
    """แคปซูลเรียว จาก p0 (รัศมี r0) ถึง p1 (r1) · flat < 1 = แบนตามแกนลึก
    · มี edge loop ตลอดช่วงกลางทุก ~loop เมตร (เดิมช่วงกลางเป็นหน้าเดียวยาว → พับเข่า/ศอกแล้วยุบเป็นรู)"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    half = max(2, rings // 2)
    prof = []   # (z, radius) จากล่างขึ้นบน (ไม่รวมขั้ว)
    for i in range(1, half + 1):
        a_ = -math.pi / 2 + math.pi / 2 * i / half
        prof.append((math.sin(a_) * r0, math.cos(a_) * r0))
    nm = 0 if rigid else max(0, int(L / loop) - 1)
    for i in range(1, nm + 1):
        t = i / (nm + 1)
        prof.append((L * t, r0 + (r1 - r0) * t))
    for i in range(0, half):
        a_ = math.pi / 2 * i / half
        prof.append((L + math.sin(a_) * r1, math.cos(a_) * r1))
    bm = bmesh.new()
    bot = bm.verts.new((0, 0, -r0))
    top = bm.verts.new((0, 0, L + r1))
    rings_v = []
    for z, r in prof:
        rings_v.append([bm.verts.new((math.cos(2 * math.pi * j / seg) * r, math.sin(2 * math.pi * j / seg) * r * flat, z)) for j in range(seg)])
    for j in range(seg):
        bm.faces.new((bot, rings_v[0][(j + 1) % seg], rings_v[0][j]))
        bm.faces.new((top, rings_v[-1][j], rings_v[-1][(j + 1) % seg]))
    for ra, rb in zip(rings_v, rings_v[1:]):
        for j in range(seg):
            bm.faces.new((ra[j], ra[(j + 1) % seg], rb[(j + 1) % seg], rb[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4() if L > 1e-9 else Matrix.Identity(4)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p0) @ rot, verts=bm.verts)
    return _obj_from_bm(name, bm, material, bones, rigid)

def shell(name, center, radii, keep, material, bones, seg=32, rings=20, thick=0.01, rigid=None):
    """ส่วนของทรงรีที่ keep(dir)=True (ใช้ทำผม/หมวก) + ความหนา"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    flag = {v: keep(v.co.normalized()) for v in bm.verts}
    # vertex ที่อยู่นอกแต่ติดกับ vertex ข้างใน -> ดึงขึ้นมาวางบนเส้นตัดพอดี (ขอบเรียบ ไม่เป็นขั้นบันได) · ที่เหลือข้างนอกลบทิ้ง
    edge = [v for v in bm.verts if not flag[v] and any(flag[e.other_vert(v)] for e in v.link_edges)]
    for v in edge:
        d = v.co.normalized()
        lo, hi = d.z, 1.0
        h = math.hypot(d.x, d.y) or 1e-6
        at = lambda z: Vector((d.x / h * math.sqrt(max(0.0, 1 - z * z)), d.y / h * math.sqrt(max(0.0, 1 - z * z)), z))
        for _ in range(20):
            mid = (lo + hi) / 2
            if keep(at(mid)):
                hi = mid
            else:
                lo = mid
        v.co = at(hi)
    keepset = set(edge)
    gone = [v for v in bm.verts if not flag[v] and v not in keepset]
    bmesh.ops.delete(bm, geom=gone, context='VERTS')
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*radii, 1)), verts=bm.verts)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    if thick:
        mod = ob.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = thick
        mod.offset = 1.0
        apply_mods(ob)
    return ob

def tube_arc(name, center, radius, tube, a0, a1, material, bones, plane='XZ', seg=20, tseg=8, rigid=None, scale=(1, 1, 1)):
    """ท่อโค้ง (ส่วนของ torus) — ปาก คิ้ว กรอบแว่น คาดหัวหูฟัง สายกระเป๋า"""
    bm = bmesh.new()
    rows = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        c = Vector((math.cos(a) * radius, math.sin(a) * radius, 0))
        t = Vector((-math.sin(a), math.cos(a), 0))
        n = c.normalized() if c.length else Vector((1, 0, 0))
        b = t.cross(n)
        ring = []
        for j in range(tseg):
            q = 2 * math.pi * j / tseg
            ring.append(bm.verts.new(c + (n * math.cos(q) + b * math.sin(q)) * tube))
        rows.append(ring)
    for i in range(seg):
        for j in range(tseg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % tseg], rows[i + 1][(j + 1) % tseg], rows[i + 1][j]))
    for ring in (rows[0], rows[-1]):
        bm.faces.new(ring if ring is rows[-1] else list(reversed(ring)))
    if plane == 'XZ':
        m = Matrix.Rotation(math.radians(90), 4, 'X')
    elif plane == 'YZ':
        m = Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(90), 4, 'X')
    else:
        m = Matrix.Identity(4)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*scale, 1)) @ m, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(name, bm, material, bones, rigid)

def rbox(name, center, size, material, bones, bevel=0.3, rigid=None, rot=None):
    """กล่องมุมมน (ทรงรีแบบ superellipsoid ง่าย ๆ)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        c = v.co
        s = Vector((c.x, c.y, c.z)).normalized()
        v.co = c.lerp(s * 1.25, bevel)
        v.co = Vector((max(-1, min(1, v.co.x)), max(-1, min(1, v.co.y)), max(-1, min(1, v.co.z))))
    m = Matrix.Diagonal((size[0] / 2, size[1] / 2, size[2] / 2, 1))
    if rot:
        m = rot.to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ m, verts=bm.verts)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    apply_mods(ob)
    return ob

def flared(name, z0, r0, z1, r1, material, bones, seg=32, pleats=0, depth=0.0, flat=0.8, cy=0.0, rigid=None):
    """ทรงกระบอกบาน (กระโปรง) · pleats = จีบ"""
    bm = bmesh.new()
    rings = []
    for k, (z, r) in enumerate(((z0, r0), (z1, r1))):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            rr = r + (depth if (pleats and i % 2 == 0 and k == 1) else 0)
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr * flat + cy, z)))
        rings.append(ring)
    for i in range(seg):
        bm.faces.new((rings[0][i], rings[0][(i + 1) % seg], rings[1][(i + 1) % seg], rings[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    if not rigid:
        ob['eq_loose'] = 'skirt'   # กระโปรง: ยืมน้ำหนักจากสะโพก/ขาแบบผสม (ดู skin())
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.008
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    apply_mods(ob)
    return ob

def cut_below(ob, zmin, thick=0.008):
    """ตัดส่วนที่ต่ำกว่า zmin ทิ้ง (ชายเสื้อเปิด ไม่ปิดใต้เป้า) + ใส่ความหนา"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    below = lambda v: (ob.matrix_world @ v.co).z < zmin
    edge = [v for v in bm.verts if below(v) and any(not below(e.other_vert(v)) for e in v.link_edges)]
    for v in edge:   # ชายเรียบ: ยก vertex ริมขึ้นมาที่ระดับตัดพอดี
        v.co.z = zmin
    keepset = set(edge)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if below(v) and v not in keepset], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    if thick:
        mod = ob.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = thick
        mod.offset = 1.0
        apply_mods(ob)
    return ob

def prism(name, pts, depth, center, material, bones, rigid=None, rot=None, bevel=True):
    """แผ่นรูปหลายเหลี่ยม 2D (x,z) หนา depth หันหน้าไปทาง -Y (ดาว หัวใจ ป้าย) — center = จุดกึ่งกลาง"""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = Matrix.Identity(4)
    if rot:
        m = rot.to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ m, verts=bm.verts)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    ob = _obj_from_bm(name, bm, material, bones, rigid)
    for p_ in ob.data.polygons:
        p_.use_smooth = False
    if bevel:
        mod = ob.modifiers.new('bev', 'BEVEL')
        mod.width = min(0.004, depth * 0.3)
        mod.segments = 2
        apply_mods(ob)
    return ob

def star_pts(r_out, r_in, n=5, rot=90):
    out = []
    for i in range(n * 2):
        a = math.radians(rot) + math.pi * i / n
        r = r_out if i % 2 == 0 else r_in
        out.append((math.cos(a) * r, math.sin(a) * r))
    return out

def heart_pts(s, n=28):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((x * s / 17, z * s / 17))
    return out

def rrect_pts(w, h, r, n=5):
    out = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            out.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return out

def tube_path(name, pts, radius, material, bones, closed=False, tseg=8, rigid=None):
    """ท่อตามเส้นทางจุด 3D (กรอบแว่นสี่เหลี่ยม สายกระเป๋า ฯลฯ)"""
    P = [Vector(p) for p in pts]
    n = len(P)
    bm = bmesh.new()
    rings = []
    up0 = Vector((0, 0, 1))
    for i in range(n):
        a = P[i - 1] if (closed or i > 0) else P[i]
        b = P[(i + 1) % n] if (closed or i < n - 1) else P[i]
        t = (b - a).normalized() if (b - a).length > 1e-9 else Vector((1, 0, 0))
        up = up0 if abs(t.dot(up0)) < 0.95 else Vector((0, 1, 0))
        nrm = t.cross(up).normalized()
        bin_ = t.cross(nrm).normalized()
        rings.append([bm.verts.new(P[i] + (nrm * math.cos(2 * math.pi * j / tseg) + bin_ * math.sin(2 * math.pi * j / tseg)) * radius) for j in range(tseg)])
    segs = n if closed else n - 1
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(tseg):
            bm.faces.new((r0[j], r0[(j + 1) % tseg], r1[(j + 1) % tseg], r1[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(name, bm, material, bones, rigid)

def vertex_tint(ob, fn):
    """คูณสีตามตำแหน่ง (gradient) เข้ากับ AO ที่ bake แล้ว — fn(world_co) -> (r,g,b) 0..1 (linear)"""
    me = ob.data
    ca = me.color_attributes.get('AO')
    if not ca:
        ca = me.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        for d in ca.data:
            d.color = (1, 1, 1, 1)
    for i, d in enumerate(ca.data):
        r, g, b = fn(ob.matrix_world @ me.vertices[i].co)
        c = d.color
        d.color = (c[0] * r, c[1] * g, c[2] * b, 1)

def bake_ao(ob, visible=(), samples=24, lift=0.5, distance=0.07):
    """Ambient Occlusion -> vertex color 'AO' (ทำให้เสื้อผ้า/รอยพับมีมิติ โดยไม่ใช้ texture) · lift = ความสว่างต่ำสุด"""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    if s.world:
        s.world.light_settings.distance = distance
    keep = {o: o.hide_render for o in s.objects}
    for o in s.objects:
        if o.type == 'MESH':
            o.hide_render = not (o is ob or o in visible)
    me = ob.data
    ca = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    s.render.bake.target = 'VERTEX_COLORS'
    s.render.bake.margin = 0
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for d in ca.data:
        v = lift + (1 - lift) * d.color[0]
        d.color = (v, v, v, 1)
    for o, h in keep.items():
        o.hide_render = h

def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)

# =====================================================================
# Armature + skin weights
# =====================================================================
def make_armature():
    arm = bpy.data.armatures.new('ARM_Main')
    ob = bpy.data.objects.new('ARM_Main', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent in BONES:
        b = arm.edit_bones.new(name)
        b.head, b.tail = h, t
        b.roll = 0
        if parent:
            b.parent = arm.edit_bones[parent]
            b.use_connect = False
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    for sock, bone in SOCKETS.items():
        e = bpy.data.objects.new(sock, None)
        e.empty_display_size = 0.03
        bpy.context.scene.collection.objects.link(e)
        e.parent = ob
        e.parent_type = 'BONE'
        e.parent_bone = bone
        h, t = Vector(BONE[bone][1]), Vector(BONE[bone][2])
        e.matrix_world = Matrix.Translation(h + (t - h) * 0.5)
        e['eq_socket'] = bone
    for pb in ob.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ob

def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length

PARENT = {b[0]: b[3] for b in BONES}
# ความกว้างช่วงผสมน้ำหนักรอบข้อต่อ (เมตร) — แคบ = ข้อต่อพับคม ไม่เกิด "พังผืด" ใต้รักแร้ · กว้าง = ลำตัวโค้งนุ่ม
JOINT_ZONE = {'Spine': 0.05, 'Chest': 0.05, 'Neck': 0.03, 'Head': 0.03, 'UpperArm': 0.028, 'LowerArm': 0.024, 'Hand': 0.014,
              'UpperLeg': 0.03, 'LowerLeg': 0.024, 'Foot': 0.014, 'Hips': 0.04}
def _zone(b):
    return JOINT_ZONE.get(b.split('.')[0], 0.03)
def _smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)

def chain_weights(p, names, segs):
    """น้ำหนักแบบโซ่กระดูก: bone ที่ใกล้ที่สุดได้ 100% และผสมกับ bone พ่อ/ลูก "เฉพาะ" ในช่วงแคบรอบข้อต่อ (ตามแนวแกน bone)
    ต่างจากการผสมตามระยะ (1/d^4) เดิม ที่ทำให้ผิวใต้รักแร้ได้ Chest ~50% จนยืดค้างเป็นแผ่นเมื่อยกแขน"""
    d = sorted((_seg_dist(p, *segs[n]), n) for n in names)
    b = d[0][1]
    a, t = segs[b]
    axis = (t - a).normalized()
    pb = PARENT.get(b)
    if pb in names:
        s, z = (p - a).dot(axis), _zone(b)
        if s < z:
            k = _smooth((s + z) / (2 * z))
            return {b: k, pb: 1 - k}
    kids = sorted(((_seg_dist(p, *segs[c]), c) for c in names if PARENT.get(c) == b))
    if kids:
        c = kids[0][1]
        ca, ct = segs[c]
        s, z = (p - ca).dot((ct - ca).normalized()), _zone(c)
        if s > -z:
            k = _smooth((s + z) / (2 * z))
            return {c: k, b: 1 - k}
    return {b: 1.0}

# ---------- Skin weight transfer: เสื้อผ้า "ยืม" น้ำหนักจากผิวของ Base ที่อยู่ใต้มัน (Shared Skeleton + Weight Transfer) ----------
_SRC = {}          # key -> (bmesh, bvh, [ {bone: w} ต่อ vertex ])
def set_body_sources(groups):
    """groups: {key: [ชิ้น body ที่ skin แล้ว (world space)]} — เรียกครั้งเดียวหลังสร้าง Base"""
    import bmesh
    from mathutils.bvhtree import BVHTree
    _SRC.clear()
    for key, objs in groups.items():
        bm = bmesh.new(); vw = []
        for ob in objs:
            off = len(bm.verts)
            gi = {g.index: g.name for g in ob.vertex_groups}
            for v in ob.data.vertices:
                bm.verts.new(ob.matrix_world @ v.co)
                vw.append({gi[g.group]: g.weight for g in v.groups if g.weight > 0})
            bm.verts.ensure_lookup_table()
            for f in ob.data.polygons:
                bm.faces.new([bm.verts[off + i] for i in f.vertices])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.faces.ensure_lookup_table()
        _SRC[key] = (bm, BVHTree.FromBMesh(bm), vw)

def _source_key(names):
    n = set(names)
    if 'UpperArm.L' in n or 'Hand.L' in n: return 'arm.L'
    if 'UpperArm.R' in n or 'Hand.R' in n: return 'arm.R'
    if {'UpperLeg.L', 'UpperLeg.R'} <= n: return 'hips'
    if 'UpperLeg.L' in n or 'Foot.L' in n: return 'leg.L'
    if 'UpperLeg.R' in n or 'Foot.R' in n: return 'leg.R'
    if n & {'Hips', 'Spine', 'Chest', 'Neck'}: return 'torso'
    return None

def transfer_weights(p, key):
    from mathutils.interpolate import poly_3d_calc
    bm, bvh, vw = _SRC[key]
    loc, _n, idx, _d = bvh.find_nearest(p)
    f = bm.faces[idx]
    bc = poly_3d_calc([v.co for v in f.verts], loc)
    out = {}
    for v, k in zip(f.verts, bc):
        for g, w in vw[v.index].items():
            out[g] = out.get(g, 0.0) + w * k
    return out

def skin(ob, arm):
    """skin weight: rigid 100% (ของติดตัว) · เสื้อผ้าแนบตัว = transfer จากผิว Base ที่อยู่ใต้ (ขยับเหมือนผิวพอดี ไม่ทะลุ)
    · ชิ้นหลวม (กระโปรง/ผ้าคลุม eq_loose) หรือ Base เอง = น้ำหนักโซ่กระดูกผสมแคบรอบข้อต่อ · สูงสุด 3 bone ต่อ vertex"""
    warp_object(ob)
    rigid = ob.get('eq_rigid')
    names = [rigid] if rigid else ob['eq_bones'].split(',')
    groups = {}
    def grp(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        return groups[n]
    segs = {n: (Vector(BONE[n][1]), Vector(BONE[n][2])) for n in BONE}
    loose = ob.get('eq_loose')
    key = None if (rigid or ob.get('eq_body')) else ('hips' if loose == 'skirt' else (None if loose else _source_key(names)))
    if key not in _SRC:
        key = None
    for v in ob.data.vertices:
        if rigid:
            grp(rigid).add([v.index], 1.0, 'REPLACE')
            continue
        p = ob.matrix_world @ v.co
        if key:
            w = transfer_weights(p, key)
            if loose == 'skirt':
                # กระโปรง: ตามขาครึ่งหนึ่ง (ก้าวขาแล้วชายกระโปรงขยับตาม ไม่ทะลุ) + ตามสะโพกครึ่งหนึ่ง (ทรงไม่ยืดเหมือนกางเกง)
                k = 0.55
                w = {g: w.get(g, 0.0) * k + (1 - k) * (1.0 if g == 'Hips' else 0.0) for g in set(w) | {'Hips'}}
            if key == 'torso':
                # บ่าเสื้อ: ช่วงบ่า/หัวไหล่ของลำตัวเสื้อผสมน้ำหนักจากแขน (เหมือน weight paint ที่ไหล่) — ยกแขนแล้วบ่าเสื้อยกตาม ไม่ค้างเป็นติ่ง
                f = _smooth((abs(p.x) - 0.092 * STYLE['KX']) / (0.04 * STYLE['KX'])) * _smooth((p.z - 0.45 * STYLE['KB']) / (0.05 * STYLE['KB']))
                ak = 'arm.L' if p.x > 0 else 'arm.R'
                if f > 0.001 and ak in _SRC:
                    wa = transfer_weights(p, ak)
                    w = {g: w.get(g, 0.0) * (1 - f) + wa.get(g, 0.0) * f for g in set(w) | set(wa)}
        else:
            w = chain_weights(p, names, segs)
        top = sorted(w.items(), key=lambda x: -x[1])[:3]
        s = sum(x for _, x in top) or 1.0
        for n, x in top:
            if x / s > 0.01:
                grp(n).add([v.index], x / s, 'REPLACE')
    mod = ob.modifiers.new('ARM_Main', 'ARMATURE')
    mod.object = arm
    ob.parent = arm

def join(name, parts, arm, skinned=False):
    if not skinned:
        for p in parts:
            skin(p, arm)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    # รวม material ซ้ำ + ล้าง custom props ของชิ้นย่อย
    for k in ('eq_bones', 'eq_rigid'):
        if k in ob:
            del ob[k]
    return ob

def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)

# =====================================================================
# Animation (ใช้ร่วมกันได้ทุก Avatar — keyframe บน ARM_Main เท่านั้น)
# =====================================================================
def _key(arm, frame, poses):
    for bone, (rot, loc, scl) in poses.items():
        pb = arm.pose.bones[bone]
        if rot is not None:
            pb.rotation_euler = [math.radians(a) for a in rot]
            pb.keyframe_insert('rotation_euler', frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert('location', frame=frame)
        if scl is not None:
            pb.scale = scl
            pb.keyframe_insert('scale', frame=frame)

def _action(arm, name, keys, cyclic=True):
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for frame, poses in keys:
        _key(arm, frame, poses)
    # รีเซ็ตท่า
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    trk = arm.animation_data.nla_tracks.new()
    trk.name = name
    trk.strips.new(name, int(keys[0][0]), act)
    arm.animation_data.action = None
    return act

R = lambda x=0, y=0, z=0: ((x, y, z), None, None)

def make_animations(arm):
    """คลิปท่าทาง (ใช้ร่วมทุก Avatar · keyframe บน ARM_Main เท่านั้น — เสื้อผ้าทุกชิ้นใช้ skeleton เดียวกันจึงขยับตามเอง)
    แกน (ตรวจด้วย probe): แขนกาง L = -Z · R = +Z · แขน/ขาเหวี่ยงไปหน้า = -X · เข่า/ศอกพับ = +X · หัวก้ม = +X · หมุนตัว = Root Y
    มุมยกแขนจำกัด ~125° (ไม่ใช่ 150° แบบเดิม) — เดิมแขนตั้งตรงชิดหัวจนมือ/แขนทะลุหัวที่ใหญ่ของตัวละคร stylized"""
    eye = lambda s: (None, None, (1, 1, s))
    up = lambda a: {'UpperArm.L': R(z=-a), 'UpperArm.R': R(z=a)}
    fore = lambda a: {'LowerArm.L': R(z=-a), 'LowerArm.R': R(z=a)}
    rest_arms = {**up(3), **fore(0), 'Hand.L': R(), 'Hand.R': R()}
    idle = []
    for f, k in ((1, 0), (25, 1), (49, 0), (73, -1), (96, 0)):
        idle.append((f, {'Chest': R(x=-1.2 * abs(k)), 'Head': R(y=3 * k, x=-1.2 * abs(k)), 'Spine': R(y=0.8 * k),
                         'UpperArm.L': R(z=-(3 + 2 * abs(k))), 'UpperArm.R': R(z=3 + 2 * abs(k)),
                         'Eye.L': eye(1), 'Eye.R': eye(1)}))
    for f in (40, 70):   # กะพริบตา 2 ครั้งต่อรอบ
        idle += [(f, {'Eye.L': eye(1), 'Eye.R': eye(1)}), (f + 2, {'Eye.L': eye(0.12), 'Eye.R': eye(0.12)}), (f + 4, {'Eye.L': eye(1), 'Eye.R': eye(1)})]
    merged = {}
    for f, poses in idle:
        merged.setdefault(f, {}).update(poses)
    _action(arm, 'ANIM_Idle', sorted(merged.items()))
    _action(arm, 'ANIM_Blink', [(1, {'Eye.L': eye(1), 'Eye.R': eye(1)}), (4, {'Eye.L': eye(0.1), 'Eye.R': eye(0.1)}), (7, {'Eye.L': eye(1), 'Eye.R': eye(1)}),
                                (14, {'Eye.L': eye(1), 'Eye.R': eye(1)})])
    # โบกมือ (ขวา): ต้นแขน 118° + ปลายแขน 15–40° (มือแกว่งข้างหัว ไม่เข้าไปในหัว)
    wave = []
    for i, f in enumerate((1, 8, 15, 22, 29, 36, 43, 50)):
        on = 0 < i < 7
        wave.append((f, {'UpperArm.R': R(z=114 if on else 3), 'LowerArm.R': R(z=(26 if i % 2 else 6) if on else 0), 'Head': R(z=-6 if on else 0)}))   # หัวใหญ่ขึ้น (style v3): ศอกพับน้อยลง มือไม่เข้าหัว
    _action(arm, 'ANIM_Wave', wave)
    for side, sgn in (('L', -1), ('R', 1)):
        _action(arm, f'ANIM_RaiseArm{side}', [(1, {f'UpperArm.{side}': R(z=3 * sgn), f'LowerArm.{side}': R(z=0)}),
                                              (10, {f'UpperArm.{side}': R(z=120 * sgn), f'LowerArm.{side}': R(z=4 * sgn)}),
                                              (26, {f'UpperArm.{side}': R(z=120 * sgn), f'LowerArm.{side}': R(z=4 * sgn)}),
                                              (36, {f'UpperArm.{side}': R(z=3 * sgn), f'LowerArm.{side}': R(z=0)})])
    _action(arm, 'ANIM_BothArmsUp', [(1, {**up(3), **fore(0)}), (10, {**up(118), **fore(2)}), (26, {**up(118), **fore(2)}), (36, {**up(3), **fore(0)})])   # style v3: หัวใหญ่ — แขนกางกว้างขึ้น ศอกเกือบตรง
    loc = lambda z: (None, (0, z, 0), None)   # Root: แกน Y ของ bone = ขึ้นบน
    vic = [(1, {'Root': loc(0), **up(3), **fore(0), 'Head': R(x=0)}),
           (8, {'Root': loc(-0.02), **up(118), **fore(2)}),
           (14, {'Root': loc(0.07), 'Head': R(x=-10)}),
           (22, {'Root': loc(0), 'Head': R(x=0)}),
           (30, {'Root': loc(0.05)}), (38, {'Root': loc(0), **up(118), **fore(2)}),
           (48, {**up(3), **fore(0)})]
    _action(arm, 'ANIM_Victory', vic)
    cel = [(1, {'Root': loc(0), **up(3), **fore(0)}), (6, {**up(116), **fore(2), 'Root': loc(0.04)}), (12, {**up(96), **fore(12), 'Root': loc(0)}),
           (18, {**up(116), **fore(2), 'Root': loc(0.04)}), (28, {**up(3), **fore(0), 'Root': loc(0)})]
    _action(arm, 'ANIM_Celebrate', cel)
    dfe = [(1, {'Head': R(x=0, y=0), 'Chest': R(x=0), **up(3)}),
           (14, {'Head': R(x=16, y=5), 'Chest': R(x=7), **up(0)}),
           (30, {'Head': R(x=12, y=-4)}),
           (40, {'Head': R(x=-5, y=0), 'Chest': R(x=0), **up(28)}),   # ยักไหล่ยิ้ม ๆ "ไม่เป็นไร รอบหน้าเอาใหม่"
           (52, {'Head': R(x=0), **up(3)})]
    _action(arm, 'ANIM_Defeat', dfe)
    # หมุนรอบตัว 360° (เส้นตรง)
    turn = _action(arm, 'ANIM_Turn', [(1, {'Root': R(y=0)}), (61, {'Root': R(y=360)})])
    _linear(turn)
    # เดินอยู่กับที่ 1 รอบ (32 เฟรม): สะโพก เข่า ข้อเท้า ไหล่ ศอก ขยับครบ
    def walk_pose(ph):
        c = math.cos(ph)
        sL, sR = 22 * c, -22 * c                      # ขา: - = ไปหน้า
        kneeL, kneeR = max(0.0, -math.sin(ph)) * 38, max(0.0, math.sin(ph)) * 38
        return {'UpperLeg.L': R(x=-sL), 'UpperLeg.R': R(x=-sR), 'LowerLeg.L': R(x=kneeL), 'LowerLeg.R': R(x=kneeR),
                'Foot.L': R(x=-kneeL * 0.35), 'Foot.R': R(x=-kneeR * 0.35),
                'UpperArm.L': R(x=sL * 0.8, z=-6), 'UpperArm.R': R(x=sR * 0.8, z=6), 'LowerArm.L': R(x=-10), 'LowerArm.R': R(x=-10),
                'Root': loc(0.008 * abs(math.sin(ph))), 'Spine': R(y=4 * c)}
    _action(arm, 'ANIM_Walk', [(1 + i * 4, walk_pose(2 * math.pi * i / 8)) for i in range(9)])
    # วิ่ง (EnglishQuest World): ก้าวยาวขึ้น เข่าพับมากขึ้น แขนงอแกว่งแรง ตัวเอนหน้าเล็กน้อย · 1 รอบ 24 เฟรม (runtime เร่ง timeScale ตามความเร็ว)
    def run_pose(ph):
        c = math.cos(ph)
        sL, sR = 29 * c, -29 * c
        kneeL, kneeR = 14 + max(0.0, -math.sin(ph)) * 46, 14 + max(0.0, math.sin(ph)) * 46
        return {'UpperLeg.L': R(x=-sL), 'UpperLeg.R': R(x=-sR), 'LowerLeg.L': R(x=kneeL), 'LowerLeg.R': R(x=kneeR),
                'Foot.L': R(x=-kneeL * 0.3), 'Foot.R': R(x=-kneeR * 0.3),
                'UpperArm.L': R(x=sL * 0.85, z=-14), 'UpperArm.R': R(x=sR * 0.85, z=14), 'LowerArm.L': R(x=-34), 'LowerArm.R': R(x=-34),
                'Root': loc(0.018 * abs(math.sin(ph))), 'Spine': R(x=6, y=6 * c), 'Head': R(x=-4)}
    _action(arm, 'ANIM_Run', [(1 + i * 3, run_pose(2 * math.pi * i / 8)) for i in range(9)])
    # นั่ง (ม้านั่งใน World): ต้นขาไปหน้า ~82° เข่าพับ ~84° · สะโพกลดลงให้ก้นแตะที่นั่ง (สูง ~0.10 m) เท้าแตะพื้น · มือวางข้างลำตัวบนที่นั่ง (ไม่พาดผ่านเปีย/ผมด้านหน้า)
    sit = {'Root': loc(-0.058), 'UpperLeg.L': R(x=-82, z=-4), 'UpperLeg.R': R(x=-82, z=4), 'LowerLeg.L': R(x=84), 'LowerLeg.R': R(x=84),
           'Foot.L': R(x=-4), 'Foot.R': R(x=-4), 'UpperArm.L': R(x=-8, z=-14), 'UpperArm.R': R(x=-8, z=14),
           'LowerArm.L': R(x=-12), 'LowerArm.R': R(x=-12), 'Spine': R(x=0), 'Head': R(x=0)}
    _action(arm, 'ANIM_Sit', [(1, sit), (24, {**sit, 'Chest': R(x=-1.5)}), (48, {**sit, 'Chest': R(x=0)})])

def _linear(act):
    """ทำ keyframe ของ action เป็นเส้นตรง (รองรับทั้ง API เก่า fcurves และ layered actions ของ Blender 4.4+/5)"""
    curves = []
    try:
        curves = list(act.fcurves)
    except Exception:  # noqa: BLE001
        pass
    if not curves:
        try:
            for layer in act.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        curves += list(bag.fcurves)
        except Exception:  # noqa: BLE001
            pass
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'

# =====================================================================
# Export
# =====================================================================
def export_glb(path, objects, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_skins=True, export_animations=animations, export_animation_mode='NLA_TRACKS' if animations else 'ACTIONS',
        export_def_bones=False, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=True,
        export_morph=False, export_lights=False, export_cameras=False, export_vertex_color='ACTIVE',
    )


# =====================================================================
# Body Mask + Clipping validation (ยิง ray จากผิว Base ออกตามแนว normal)
# =====================================================================
def _eval_mesh(ob, dg):
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted().transposed()
    pts = [(mw @ v.co, (nm @ v.normal).normalized()) for v in me.vertices]
    # จุดกลางหน้า (face center) ด้วย — capsule ช่วงกลางแขน/ขาไม่มี vertex เลย ถ้าตรวจแค่ vertex จะพลาดผิวช่วงนั้น
    pts += [(mw @ f.center, (nm @ f.normal).normalized()) for f in me.polygons]
    ev.to_mesh_clear()
    return pts

def body_samples(regions, dg, step=1):
    """{region: [(co, normal)]} ของผิว Base ในท่าปัจจุบัน"""
    return {r.get('eq_region'): _eval_mesh(r, dg)[::step] for r in regions}

def bvh_of(objs, dg):
    import bmesh as _bm
    from mathutils.bvhtree import BVHTree
    bm = _bm.new()
    owner = []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        off = len(bm.verts)
        for v in me.vertices:
            bm.verts.new(ob.matrix_world @ v.co)
        bm.verts.ensure_lookup_table()
        for f in me.polygons:
            try:
                bm.faces.new([bm.verts[off + i] for i in f.vertices])
                owner.append(ob)
            except ValueError:
                pass
        ev.to_mesh_clear()
    bm.normal_update()   # สำคัญ: face ใหม่ใน bmesh ยังไม่มี normal (= 0,0,0) → find_nearest จะคืน normal ศูนย์
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t, owner

def covered(co, n, item_bvh, body_bvh, body_owner, region_ob, dist=0.1):
    """ผิวตรงนี้ถูกบังไหม: ยิง ray ออกตามแนว normal · โดนเสื้อผ้า หรือโดนส่วนร่างกายอื่น (ไม่ใช่ตัวเอง) ภายในระยะ"""
    o = co + n * 0.0015
    h = item_bvh.ray_cast(o, n, dist)
    if h[0] is not None:
        return 'item'
    if body_bvh is not None:
        hb = body_bvh.ray_cast(o, n, 0.05)
        if hb[0] is not None and body_owner[hb[2]] is not region_ob:
            return 'body'
    return None
