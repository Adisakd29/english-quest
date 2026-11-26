"""
v1.27.0 World Raid — ไลบรารีสร้างบอส 3D ด้วยโค้ด (Blender 5 · bpy แบบ headless)
  · ปั้นรูปทรงอินทรีย์จาก Metaball → Voxel Remesh (topology สม่ำเสมอ) → Displacement ด้วย noise (ลายเปลือกไม้/หิน/เกล็ด)
  · สีผิวเป็น Vertex Color (COLOR_0 · RGBA) — ช่อง Alpha = หน้ากากเรืองแสง (runtime ใช้เป็น emissive mask)
  · กระดูก (Armature) + skin weight จากระยะถึงกระดูก (สูงสุด 3 กระดูก/จุด) · ชิ้นแข็ง (เขา/คริสตัล/เกราะ) ผูกกระดูกเดียว
  · Animation = Action ต่อสถานะ (spawn/idle/prepare/attack/special/hit/stun/phase/enrage/death) → glTF animations
  มาตรฐาน: เมตร · Blender Z-up หันหน้า -Y → glTF Y-up หันหน้า +Z
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion, noise


# ---------------------------------------------------------------- scene / material
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = 24
    return s


def lin(hexc):
    r, g, b = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))


def mat(name, color='#FFFFFF', rough=0.7, metal=0.0, emission=None, strength=1.0, alpha=1.0, vcol=False):
    """Principled BSDF · vcol=True = คูณสีด้วย Vertex Color (glTF COLOR_0)"""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*lin(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if vcol:
        a = nt.nodes.new('ShaderNodeVertexColor')
        a.layer_name = 'Col'
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*lin(emission), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:  # noqa: BLE001
            pass
    m.use_backface_culling = False
    return m


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_from_bm(name, bm, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    if material:
        ob.data.materials.append(material)
    return ob


def evaluated_copy(ob, name=None):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    new = link(bpy.data.objects.new(name or ob.name, me))
    new.matrix_world = ob.matrix_world.copy()
    bpy.data.objects.remove(ob, do_unlink=True)
    return new


# ---------------------------------------------------------------- organic sculpt (metaball)
def blob(name, elements, resolution=0.05, voxel=0.035, material=None):
    """elements: [(co, radius, scale(x,y,z)|None, stiffness)] → mesh เดียว (remesh voxel ให้ผิวสม่ำเสมอ)"""
    mb = bpy.data.metaballs.new(name + '_mb')
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = 0.6
    ob = link(bpy.data.objects.new(name + '_mbo', mb))
    for el in elements:
        co, r = el[0], el[1]
        scl = el[2] if len(el) > 2 and el[2] else None
        st = el[3] if len(el) > 3 else 2.0
        e = mb.elements.new(type='ELLIPSOID' if scl else 'BALL')
        e.co = co
        e.radius = r
        e.stiffness = st
        if scl:
            e.size_x, e.size_y, e.size_z = scl   # ขนาดรี (คูณกับ radius ภายใน metaball เอง)
    ob = evaluated_copy(ob, name)
    if voxel:
        m = ob.modifiers.new('rm', 'REMESH')
        m.mode = 'VOXEL'
        m.voxel_size = voxel
        m.use_smooth_shade = True
        ob = evaluated_copy(ob, name)
    if material:
        ob.data.materials.clear()
        ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def chain(p0, p1, r0, r1, n=None, scale=None, st=2.0):
    """ลูกบอลเรียงตามเส้น p0→p1 (แขน/ขา/หาง)"""
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    n = n or max(2, int(L / (min(r0, r1) * 0.6)) + 1)
    return [((p0.lerp(p1, i / (n - 1))), r0 + (r1 - r0) * i / (n - 1), scale, st) for i in range(n)]


def displace(ob, fn):
    """ขยับทุก vertex ตามแนว normal: fn(world_co, normal) -> ระยะ (เมตร)"""
    me = ob.data
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    mw = ob.matrix_world
    for v in me.vertices:
        p = mw @ v.co
        n = (mw.to_3x3() @ v.normal).normalized()
        v.co += v.normal * fn(p, n)
    me.update()


def decimate(ob, ratio):
    if ratio >= 1:
        return ob
    m = ob.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    mats = list(ob.data.materials)
    name = ob.name
    ob = evaluated_copy(ob, name)
    if not ob.data.materials:
        for mm in mats:
            ob.data.materials.append(mm)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def paint(ob, fn):
    """Vertex Color 'Col' (RGBA · CORNER): fn(world_co, normal) -> (r,g,b,a) linear · a = หน้ากากเรืองแสง"""
    me = ob.data
    ca = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    try:
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
    except Exception:  # noqa: BLE001
        pass
    mw = ob.matrix_world
    cache = {}
    for li, loop in enumerate(me.loops):
        vi = loop.vertex_index
        if vi not in cache:
            v = me.vertices[vi]
            cache[vi] = fn(mw @ v.co, (mw.to_3x3() @ v.normal).normalized())
        ca.data[li].color = cache[vi]
    # หน้ากากเรืองแสงแยกเป็น attribute _GLOW (ตัวส่งออก glTF ของ Blender ตัด alpha ของ COLOR_0 ทิ้ง)
    # → scripts/raid/optimize.mjs รวมกลับเป็น COLOR_0.a (VEC4) ให้ three.js ใช้เป็น emissive mask
    gl = me.attributes.get('_GLOW') or me.attributes.new('_GLOW', 'FLOAT', 'POINT')
    for vi, c in cache.items():
        gl.data[vi].value = c[3]


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fbm(p, octaves=4):
    return noise.fractal(Vector(p), 0.6, 2.0, octaves, noise_basis='PERLIN_ORIGINAL')


def cells(p):
    """voronoi: (F1, F2) ระยะถึงจุดที่ใกล้ที่สุด 2 จุด"""
    d, _pts = noise.voronoi(Vector(p), distance_metric='DISTANCE')
    return d[0], d[1]


# ---------------------------------------------------------------- hard-surface / props
def tube(name, pts, radii, material, seg=10, cap=True):
    """ท่อผ่านจุด pts (Vector/tuple) รัศมีต่อจุด radii (ไล่เรียวได้) — เขา/กิ่งไม้/กระดูกปีก"""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        a = t.cross(up).normalized()
        b = t.cross(a).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        ring = []
        for k in range(seg):
            ang = 2 * math.pi * k / seg
            ring.append(bm.verts.new(p + (a * math.cos(ang) + b * math.sin(ang)) * max(r, 0.0005)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] if isinstance(radii, (list, tuple)) else radii) * 0.6)
        for k in range(seg):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tip))
    return mesh_from_bm(name, bm, material)


def bezier_pts(p0, p1, p2, n=8):
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in [i / (n - 1) for i in range(n)]]


def horn(name, base, ctrl, tip, r0, material, n=9, seg=10):
    pts = bezier_pts(base, ctrl, tip, n)
    radii = [r0 * (1 - i / (n - 1)) ** 0.85 + 0.004 for i in range(n)]
    return tube(name, pts, radii, material, seg=seg)


def crystal(name, base, direction, length, radius, material, sides=6, tilt=0.0):
    """ผลึกหกเหลี่ยมปลายแหลม"""
    d = Vector(direction).normalized()
    bm = bmesh.new()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    a = d.cross(up).normalized(); b = d.cross(a).normalized()
    base = Vector(base)
    r0 = [bm.verts.new(base + (a * math.cos(2 * math.pi * k / sides + tilt) + b * math.sin(2 * math.pi * k / sides + tilt)) * radius) for k in range(sides)]
    top = base + d * length * 0.72
    r1 = [bm.verts.new(top + (a * math.cos(2 * math.pi * k / sides + tilt) + b * math.sin(2 * math.pi * k / sides + tilt)) * radius * 0.92) for k in range(sides)]
    tip = bm.verts.new(base + d * length)
    for k in range(sides):
        bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
        bm.faces.new((r1[k], r1[(k + 1) % sides], tip))
    bm.faces.new(list(reversed(r0)))
    ob = mesh_from_bm(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def rock(name, center, size, material, seed=0, subdiv=2, rough=0.35, flat=None):
    """ก้อนหิน: icosphere บิดด้วย noise (เหลี่ยมมุมแบบ stylized)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rnd = random.Random(seed)
    off = Vector((rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50)))
    sx, sy, sz = size if isinstance(size, (tuple, list)) else (size, size, size)
    for v in bm.verts:
        n = v.co.normalized()
        k = 1 + rough * noise.noise(n * 1.6 + off) + 0.12 * noise.noise(n * 4.0 + off)
        v.co = Vector((n.x * sx, n.y * sy, n.z * sz)) * k
        if flat is not None and v.co.z < -flat:
            v.co.z = -flat
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    ob = mesh_from_bm(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def ellipsoid(name, center, radii, material, seg=20, rings=12, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(rot[0]), 3, 'X') @ Matrix.Rotation(math.radians(rot[1]), 3, 'Y') @ Matrix.Rotation(math.radians(rot[2]), 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return mesh_from_bm(name, bm, material)


def cone(name, base, tip, r, material, seg=8):
    return tube(name, [base, Vector(base).lerp(Vector(tip), 0.5), tip], [r, r * 0.55, 0.002], material, seg=seg, cap=True)


def membrane(name, pts_loops, material):
    """แผ่นปีก: รับรายการ "แถว" ของจุด (แต่ละแถวจำนวนเท่ากัน) แล้วสานเป็นผืน (สองหน้า)"""
    bm = bmesh.new()
    rows = [[bm.verts.new(Vector(p)) for p in row] for row in pts_loops]
    for i in range(len(rows) - 1):
        for k in range(len(rows[i]) - 1):
            bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
    return mesh_from_bm(name, bm, material)


def _has_emission(m):
    try:
        b = m.node_tree.nodes.get('Principled BSDF')
        return b.inputs['Emission Strength'].default_value > 0 and sum(b.inputs['Emission Color'].default_value[:3]) > 0.01
    except Exception:  # noqa: BLE001
        return False


def join(name, parts):
    """รวมชิ้น · ชิ้นที่ไม่ได้ทาสี = สีขาว (ไม่ให้ COLOR_0 ทำให้ดำ) · alpha 1 ถ้าวัสดุเรืองแสง (หน้ากาก emissive ของ runtime)"""
    parts = [p for p in parts if p]
    for p in parts:
        if not p.data.color_attributes.get('Col'):
            a = 1.0 if (p.data.materials and _has_emission(p.data.materials[0])) else 0.0
            paint(p, lambda _c, _n, a=a: (1.0, 1.0, 1.0, a))
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


# ---------------------------------------------------------------- rig
def armature(name, bones):
    """bones: [(name, head, tail, parent|None)] → object armature (rest pose)"""
    arm = bpy.data.armatures.new(name)
    ob = link(bpy.data.objects.new(name, arm))
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn, h, t, par in bones:
        b = arm.edit_bones.new(bn)
        b.head = h
        b.tail = t
        b.roll = 0
        if par:
            b.parent = eb[par]
            b.use_connect = False
        eb[bn] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    ob['segs'] = {bn: [list(h), list(t)] for bn, h, t, _ in bones}
    return ob


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.dot(ab), 1e-9)))
    return (a + ab * t - p).length


def skin(ob, arm, bones=None, rigid=None, falloff=0.18, maxw=3):
    """น้ำหนักตามระยะถึงกระดูก (exp falloff) · rigid = กระดูกเดียว 100% (ของแข็ง)"""
    segs = {k: (Vector(v[0]), Vector(v[1])) for k, v in arm['segs'].items()}
    names = bones or list(segs)
    groups = {}
    def grp(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        return groups[n]
    mw = ob.matrix_world
    for v in ob.data.vertices:
        if rigid:
            grp(rigid).add([v.index], 1.0, 'REPLACE')
            continue
        p = mw @ v.co
        ds = sorted(((_seg_dist(p, *segs[n]), n) for n in names))
        d0 = ds[0][0]
        ws = [(n, math.exp(-(d - d0) / falloff)) for d, n in ds[:maxw]]
        s = sum(w for _, w in ws)
        for n, w in ws:
            if w / s > 0.02:
                grp(n).add([v.index], w / s, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    ob.parent = arm


# ---------------------------------------------------------------- animation
def _world_rot_to_local(arm, bone, axis, deg):
    """หมุนรอบแกนโลก (ในพื้นที่ armature) → quaternion ของ pose bone (ประมาณจากท่าพักของกระดูก)"""
    rest = arm.data.bones[bone].matrix_local.to_3x3()
    q = Quaternion(Vector(axis), math.radians(deg)).to_matrix()
    return (rest.inverted() @ q @ rest).to_quaternion()


def pose(arm, rots, locs=None, scales=None):
    """rots: {bone: [(axis, deg), ...]} (แกนโลก 'X'|'Y'|'Z' หรือ vector) · locs: {bone: (x,y,z) แกนโลก} · scales: {bone: s}"""
    AX = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}
    out = {}
    for b, lst in (rots or {}).items():
        q = Quaternion()
        for ax, deg in lst:
            q = _world_rot_to_local(arm, b, AX.get(ax, ax), deg) @ q
        out.setdefault(b, {})['q'] = q
    for b, l in (locs or {}).items():
        rest = arm.data.bones[b].matrix_local.to_3x3()
        out.setdefault(b, {})['l'] = rest.inverted() @ Vector(l)
    for b, s in (scales or {}).items():
        out.setdefault(b, {})['s'] = (s, s, s) if not isinstance(s, (tuple, list)) else s
    return out


def action(arm, name, keys, loop=False):
    """keys: [(frame, pose_dict)] — ทุก key ใส่ทุกกระดูกที่ถูกใช้ (ค่าที่ไม่ระบุ = ท่าพัก) เพื่อให้คลิปสมบูรณ์ในตัว"""
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    used = set()
    for _, p in keys:
        used |= set(p)
    for f, p in keys:
        for b in used:
            pb = arm.pose.bones[b]
            d = p.get(b, {})
            pb.rotation_quaternion = d.get('q', Quaternion())
            pb.location = d.get('l', Vector())
            pb.scale = d.get('s', (1, 1, 1))
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('scale', frame=f)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    trk = arm.animation_data.nla_tracks.new()
    trk.name = name
    st = trk.strips.new(name, int(keys[0][0]), act)
    st.name = name
    arm.animation_data.action = None
    return act


def lerp_pose(a, b, t):
    out = {}
    for k in set(a) | set(b):
        da, db = a.get(k, {}), b.get(k, {})
        o = {}
        qa, qb = da.get('q', Quaternion()), db.get('q', Quaternion())
        o['q'] = qa.slerp(qb, t)
        la, lb = da.get('l', Vector()), db.get('l', Vector())
        o['l'] = la.lerp(lb, t)
        sa, sb = Vector(da.get('s', (1, 1, 1))), Vector(db.get('s', (1, 1, 1)))
        o['s'] = tuple(sa.lerp(sb, t))
        out[k] = o
    return out


# ---------------------------------------------------------------- export
def export_glb(path, objects, animations=True):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kw = dict(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_skins=True, export_animations=animations, export_texcoords=False, export_normals=True,
        export_materials='EXPORT', export_extras=False, export_morph=False, export_lights=False, export_cameras=False,
        export_attributes=True,
    )
    if animations:
        kw['export_animation_mode'] = 'NLA_TRACKS'
        kw['export_def_bones'] = False
        kw['export_force_sampling'] = True
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
