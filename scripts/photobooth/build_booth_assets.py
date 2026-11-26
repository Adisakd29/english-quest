"""
v1.25.3 — ชุดภาพ 3D สำหรับ Christmas Photo Booth / ฉากคริสต์มาส (ออกแบบและสร้างเองทั้งหมดด้วยโค้ด · ไม่ใช้ภาพจากแหล่งอื่น)
  - tree_a / tree_b : ต้นสน Stylized 3D — กิ่งเป็นชั้นห้อยลงตามธรรมชาติ + กระจุกใบ, หิมะเกาะกิ่ง, ลูกบอลแดง/ทอง,
                      ไฟสีทองอุ่น, ริบบิ้นพันเกลียว, กระดิ่งทอง, ดาวเรืองแสงบนยอด (พื้นโปร่งใส)
  - tree_*_shadow   : เงาของต้นไม้บนพื้น (Shadow catcher แยกชั้น → ปรับความเข้มได้ในตัวประกอบภาพ)
  - gifts_l / gifts_r : กองกล่องของขวัญ (พื้นโปร่งใส) + เงา
  - village         : ฉากหลังหมู่บ้านคริสต์มาสยามค่ำ 1080×1920 (หน้าต่างไฟอุ่น, ไฟประดับชายคา, โคมถนน, ป่าสนไกล, หมอก, ระยะชัดตื้น)
  - booth.json      : ตำแหน่งหลอดไฟ/ดาว (สัดส่วนของภาพ) สำหรับแสงกะพริบในตัวประกอบภาพ + จุดฐานต้นไม้
ใช้: <bpy-python> scripts/photobooth/build_booth_assets.py <โฟลเดอร์ผลลัพธ์ png> [tree_a tree_b gifts_l gifts_r village] (ไม่ระบุ = ทั้งหมด)
     EQ_LOW=1 → เรนเดอร์ความละเอียด/ตัวอย่างต่ำสำหรับตรวจเร็ว
แล้ว: python3 scripts/photobooth/pack_booth_assets.py <โฟลเดอร์ png> → public/img/christmas/booth/*.webp
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'booth_out')
JOBS = sys.argv[2:] or ['tree_a', 'tree_b', 'gifts_l', 'gifts_r', 'village']
LOW = os.environ.get('EQ_LOW') == '1'
os.makedirs(OUT, exist_ok=True)
META_PATH = os.path.join(OUT, 'booth.json')
META = json.load(open(META_PATH)) if os.path.exists(META_PATH) else {}


# ---------------------------------------------------------------- พื้นฐาน
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 8
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    return sc


def mesh_obj(name, verts, faces, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(); me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if mat: me.materials.append(mat)
    return ob


def add_mod(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items(): setattr(m, k, v)
    return m


def node_mat(name, build):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    sh = build(nt)
    nt.links.new(sh.outputs[0], out.inputs['Surface'])
    return m


def principled(nt, color, rough=0.5, metal=0.0, coat=0.0, emit=None, estr=0.0, sss=0.0, spec=0.5):
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Specular IOR Level'].default_value = spec
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Radius'].default_value = (0.6, 0.75, 1.0)
        p.inputs['Subsurface Scale'].default_value = 0.05
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = estr
    return p


def simple(name, color, **kw):
    return node_mat(name, lambda nt: principled(nt, color, **kw))


def bump_noise(nt, p, scale=40.0, strength=0.4, detail=6.0, coords='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs[coords], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = strength
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
    return nz


def lathe(name, prof, seg=40, mat=None, loc=(0, 0, 0)):
    """prof: [(r,z),...] จากล่างขึ้นบน → ทรงหมุนรอบแกน Z"""
    verts, faces = [], []
    n = len(prof)
    for s in range(seg):
        a = 2 * math.pi * s / seg
        for r, z in prof: verts.append((r * math.cos(a) + loc[0], r * math.sin(a) + loc[1], z + loc[2]))
    for s in range(seg):
        s2 = (s + 1) % seg
        for i in range(n - 1):
            faces.append((s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1))
    return mesh_obj(name, verts, faces, mat)


def uv_sphere(name, r, loc, mat, seg=24, ring=14, squash=1.0):
    verts, faces = [], []
    for i in range(ring + 1):
        th = math.pi * i / ring
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            verts.append((loc[0] + r * math.sin(th) * math.cos(ph), loc[1] + r * math.sin(th) * math.sin(ph), loc[2] + r * squash * math.cos(th)))
    for i in range(ring):
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    return mesh_obj(name, verts, faces, mat)


def box(name, size, loc, mat, rot_z=0.0, bevel=0.0):
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh_obj(name, v, f, mat, smooth=False)
    ob.location = loc; ob.rotation_euler = (0, 0, rot_z)
    if bevel:
        add_mod(ob, 'BEVEL', width=bevel, segments=3)
        for p in ob.data.polygons: p.use_smooth = True
        ob.data.shade_smooth() if hasattr(ob.data, 'shade_smooth') else None
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------------------------------------------------------------- วัสดุชุดต้นไม้
def mats_tree():
    def needles(nt):
        # สีใบสน: เข้มด้านใน (AO) → สว่างที่ปลายกิ่ง · ลายเข็มละเอียดด้วย bump
        p = principled(nt, (0.05, 0.2, 0.11), rough=0.62, sss=0.06, spec=0.35)
        ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.35; ao.samples = 8
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.15; ramp.color_ramp.elements[0].color = (0.006, 0.03, 0.02, 1)
        ramp.color_ramp.elements[1].position = 0.95; ramp.color_ramp.elements[1].color = (0.045, 0.19, 0.1, 1)
        e = ramp.color_ramp.elements.new(0.6); e.color = (0.02, 0.1, 0.06, 1)
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 7; nz.inputs['Detail'].default_value = 3
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.35
        nt.links.new(ao.outputs['AO'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], mix.inputs[6])
        nt.links.new(nz.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], p.inputs['Base Color'])
        # ลายเข็ม: Wave ตามแนวรัศมี + noise ความถี่สูง
        wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'RINGS'; wv.inputs['Scale'].default_value = 60; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 4
        nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
        nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 140; nz2.inputs['Detail'].default_value = 2
        nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
        add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
        nt.links.new(wv.outputs['Fac'], add.inputs[0]); nt.links.new(nz2.outputs['Fac'], add.inputs[1])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.55; bp.inputs['Distance'].default_value = 0.02
        nt.links.new(add.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
        # หิมะเกาะผิวที่หงายขึ้น (ปลายกิ่ง/กระจุกใบ) · ขอบหิมะไม่เรียบด้วย noise
        sn = principled(nt, (0.9, 0.94, 1.0), rough=0.5, sss=0.3, spec=0.6)
        geo = nt.nodes.new('ShaderNodeNewGeometry'); sz = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Normal'], sz.inputs[0])
        nz3 = nt.nodes.new('ShaderNodeTexNoise'); nz3.inputs['Scale'].default_value = 9; nz3.inputs['Detail'].default_value = 5
        nt.links.new(tc.outputs['Object'], nz3.inputs['Vector'])
        ad2 = nt.nodes.new('ShaderNodeMath'); ad2.operation = 'ADD'
        nt.links.new(sz.outputs['Z'], ad2.inputs[0])
        sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'MULTIPLY_ADD'; sub.inputs[1].default_value = 0.6; sub.inputs[2].default_value = -0.3
        nt.links.new(nz3.outputs['Fac'], sub.inputs[0]); nt.links.new(sub.outputs[0], ad2.inputs[1])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.6; mr.inputs['From Max'].default_value = 0.7
        nt.links.new(ad2.outputs[0], mr.inputs['Value'])
        nt.links.new(bp.outputs['Normal'], sn.inputs['Normal'])
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mr.outputs['Result'], mx.inputs[0]); nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(sn.outputs[0], mx.inputs[2])
        return mx

    def snow(nt):
        p = principled(nt, (0.93, 0.96, 1.0), rough=0.55, sss=0.35, spec=0.6)
        bump_noise(nt, p, scale=55, strength=0.25)
        # ประกายเกล็ดหิมะ
        tc = nt.nodes.new('ShaderNodeTexCoord')
        vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 220
        nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.06
        mr.inputs['To Min'].default_value = 0.08; mr.inputs['To Max'].default_value = 0.6
        nt.links.new(vo.outputs['Distance'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], p.inputs['Roughness'])
        return p

    def bark(nt):
        p = principled(nt, (0.16, 0.09, 0.05), rough=0.85)
        bump_noise(nt, p, scale=18, strength=0.8)
        return p

    def red_ball(nt):
        return principled(nt, (0.55, 0.02, 0.03), rough=0.12, coat=1.0, spec=0.7)

    def gold(nt):
        p = principled(nt, (1.0, 0.76, 0.36), rough=0.17, metal=1.0)
        return p

    def gold_glitter(nt):
        p = principled(nt, (1.0, 0.74, 0.36), rough=0.26, metal=1.0)
        bump_noise(nt, p, scale=400, strength=0.35, detail=1)
        return p

    def bulb(nt):
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.62, 0.26, 1); em.inputs['Strength'].default_value = 28
        return em

    def ribbon(nt):
        p = principled(nt, (0.9, 0.7, 0.36), rough=0.28, metal=0.65, spec=0.8)
        p.inputs['Anisotropic'].default_value = 0.6
        return p

    def star(nt):
        p = principled(nt, (1.0, 0.72, 0.25), rough=0.2, metal=1.0, emit=(1.0, 0.62, 0.18), estr=1.2)
        return p

    def red_bow(nt):
        p = principled(nt, (0.5, 0.02, 0.04), rough=0.35, sss=0.1)
        p.inputs['Sheen Weight'].default_value = 0.6
        return p
    return {k: node_mat(k, f) for k, f in dict(needles=needles, snow=snow, bark=bark, red=red_ball, gold=gold, glitter=gold_glitter,
                                                bulb=bulb, ribbon=ribbon, star=star, bow=red_bow).items()}


# ---------------------------------------------------------------- ต้นสน
def build_tree(seed, M):
    rnd = random.Random(seed)
    H = 3.0
    N = 9                                   # ชั้นกิ่ง
    tiers = []
    z_top = 2.78
    z_low = 0.42
    for i in range(N):
        u = i / (N - 1)                     # 0 = ล่าง
        R = 1.08 * (1 - u) ** 0.92 + 0.12
        zb = z_low + (z_top - 0.42 - z_low) * (u ** 0.95)
        h = 0.62 - 0.26 * u
        tiers.append(dict(R=R, zb=zb, zt=zb + h, k=7 + int(round((1 - u) * 6)), ph=rnd.uniform(0, 6.28), droop=0.1 + 0.08 * (1 - u)))
    tiers.append(dict(R=0.16, zb=z_top - 0.36, zt=z_top + 0.02, k=5, ph=0.3, droop=0.04))

    def lobe(t, th):
        c = math.cos(t['k'] * th + t['ph'])
        return max(0.0, c) ** 0.7

    def surf(t, rho, th, n=None):
        lb = lobe(t, th)
        nz = n.noise(th, rho) if n else 0
        r = rho * t['R'] * (0.86 + 0.2 * lb * rho ** 1.6 + 0.05 * nz)
        z = t['zt'] - (t['zt'] - t['zb']) * rho ** 1.1 - t['droop'] * (rho ** 4) * (0.6 + 0.7 * lb)
        return Vector((r * math.cos(th), r * math.sin(th), z)), lb

    class Nz:
        def __init__(s, sd):
            rr = random.Random(sd); s.a = [(rr.uniform(0, 6.28), rr.uniform(1, 9), rr.uniform(-1, 1)) for _ in range(6)]
        def noise(s, th, rho):
            return sum(w * math.sin(f * th + p + rho * 3) for p, f, w in s.a) / 3

    objs_needle, objs_snow = [], []
    SEG, RING = 120, 16
    for ti, t in enumerate(tiers):
        nz = Nz(seed * 31 + ti)
        verts, faces = [], []
        for i in range(RING + 1):
            rho = i / RING
            for j in range(SEG):
                th = 2 * math.pi * j / SEG
                p, _ = surf(t, rho, th, nz)
                verts.append(p)
        for i in range(RING):
            for j in range(SEG):
                j2 = (j + 1) % SEG
                faces.append((i * SEG + j, i * SEG + j2, (i + 1) * SEG + j2, (i + 1) * SEG + j))
        ob = mesh_obj(f'tier{ti}', verts, faces, M['needles'])
        add_mod(ob, 'SOLIDIFY', thickness=0.07, offset=-1)
        add_mod(ob, 'SUBSURF', levels=1, render_levels=1)
        objs_needle.append(ob)
        # หิมะเกาะด้านบนของชั้น: ครอบคลุมถึงรัศมีสุ่มตามมุม (ขอบไม่เรียบ) · ยกขึ้นเล็กน้อย
        sverts, sfaces, idx = [], [], {}
        lim = [0.62 + 0.3 * (0.5 + 0.5 * math.sin(3 * th + seed + ti) * math.cos(5 * th - ti)) * (0.65 + 0.35 * lobe(t, th)) for th in (2 * math.pi * j / SEG for j in range(SEG))]
        for i in range(RING + 1):
            rho = i / RING
            for j in range(SEG):
                if rho <= lim[j] + 1e-6:
                    th = 2 * math.pi * j / SEG
                    p, _ = surf(t, rho * 0.985, th, nz)
                    idx[(i, j)] = len(sverts); sverts.append(p + Vector((0, 0, 0.05 * (1 - (rho / max(lim[j], 0.01)) ** 3) + 0.03)))
        for i in range(RING):
            for j in range(SEG):
                j2 = (j + 1) % SEG
                q = [(i, j), (i, j2), (i + 1, j2), (i + 1, j)]
                if all(k in idx for k in q): sfaces.append(tuple(idx[k] for k in q))
        if sfaces:
            so = mesh_obj(f'snow{ti}', sverts, sfaces, M['snow'])
            add_mod(so, 'SOLIDIFY', thickness=0.03, offset=-1)
            add_mod(so, 'SUBSURF', levels=1, render_levels=1)
            objs_snow.append(so)
        # กระจุกปลายกิ่ง: กรวยแหลมห้อยลงตามแฉกกิ่ง → ซิลลูเอตเป็นธรรมชาติ
        n_tuft = int(t['k'] * 3.2)
        for q in range(n_tuft):
            th = (q + rnd.uniform(-0.3, 0.3)) / n_tuft * 2 * math.pi
            rho = rnd.uniform(0.78, 1.0)
            p, lb = surf(t, rho, th, nz)
            L = t['R'] * rnd.uniform(0.2, 0.32) * (0.7 + 0.5 * lb)
            rad = L * rnd.uniform(0.28, 0.4)
            out = Vector((math.cos(th), math.sin(th), -0.55 - 0.4 * rho)).normalized()
            cone = lathe(f'tuft{ti}_{q}', [(rad, 0), (rad * 0.82, L * 0.35), (rad * 0.45, L * 0.75), (0.004, L)], seg=10, mat=M['needles'])
            cone.matrix_world = Matrix.Translation(p - out * L * 0.35) @ out.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            objs_needle.append(cone)
    # ลำต้น + เนินหิมะที่โคน
    trunk = lathe('trunk', [(0.14, 0.0), (0.12, 0.2), (0.09, 0.9), (0.04, 2.6)], seg=24, mat=M['bark'])
    mound = uv_sphere('mound', 0.38, (0, 0, -0.08), M['snow'], squash=0.32)
    add_mod(mound, 'DISPLACE', strength=0.05, texture=_tex('mound_n', 2.0))
    parts = dict(needles=objs_needle, snow=objs_snow, trunk=[trunk, mound])

    def env_r(z):
        best = 0.0
        for t in tiers[:-1]:
            if not (t['zb'] - t['droop'] <= z <= t['zt']): continue
            lo, hi = 0.0, 1.0
            for _ in range(30):
                mid = (lo + hi) / 2
                zz = t['zt'] - (t['zt'] - t['zb']) * mid ** 1.1 - t['droop'] * mid ** 4
                lo, hi = (mid, hi) if zz > z else (lo, mid)
            best = max(best, lo * t['R'] * 0.92)
        return best

    deco = []
    # ลูกบอลแดง/ทอง ห้อยที่ปลายแฉกกิ่ง
    balls = []
    for ti, t in enumerate(tiers[:-1]):
        nz = Nz(seed * 31 + ti)
        n = max(2, int(t['k'] * 0.85))
        for q in range(n):
            th = (q + 0.5 + rnd.uniform(-0.15, 0.15)) / n * 2 * math.pi
            # หาแฉก: เลื่อนมุมไปยังยอดแฉกที่ใกล้ที่สุด
            th = round((th * t['k'] + t['ph']) / (2 * math.pi)) * 2 * math.pi / t['k'] - t['ph'] / t['k'] + rnd.uniform(-0.06, 0.06)
            p, _ = surf(t, rnd.uniform(0.97, 1.03) if ti else rnd.uniform(0.82, 0.88), th, nz)
            r = rnd.uniform(0.065, 0.095) * (0.8 + 0.3 * (1 - ti / N))
            p = p + Vector((math.cos(th), math.sin(th), 0)) * r * 0.9
            kind = 'red' if (q + ti) % 2 == 0 else ('glitter' if rnd.random() < 0.4 else 'gold')
            c = p + Vector((0, 0, -r - 0.05))
            deco.append(uv_sphere(f'ball{ti}_{q}', r, c, M[kind]))
            deco.append(lathe(f'cap{ti}_{q}', [(r * 0.28, 0), (r * 0.3, r * 0.22), (r * 0.12, r * 0.3)], seg=12, mat=M['gold'], loc=(c.x, c.y, c.z + r * 0.86)))
            balls.append(c)
    # ไฟประดับ: บนผิวกิ่ง กระจายสม่ำเสมอแบบเกลียว (ไม่จมในกิ่ง)
    lights = []
    NL = 130
    for q in range(NL):
        s = (q + 0.5) / NL
        z = 0.55 + (z_top - 0.3 - 0.55) * s ** 0.9
        th = s * 2 * math.pi * 7.5 + rnd.uniform(-0.25, 0.25)
        r = env_r(z) * rnd.uniform(0.96, 1.06) + 0.025
        if r < 0.05: continue
        c = Vector((r * math.cos(th), r * math.sin(th), z))
        deco.append(uv_sphere(f'bulb{q}', 0.03, c, M['bulb'], seg=10, ring=6))
        lights.append(c)
    # ริบบิ้นทองพันเกลียว
    rv, rf = [], []
    STEPS = 520
    for q in range(STEPS + 1):
        s = q / STEPS
        z = 0.62 + (z_top - 0.55 - 0.62) * s
        th = s * 2 * math.pi * 3.4 + 1.1
        r = env_r(z) * 1.05 + 0.06
        twist = 0.3 * math.sin(s * 40)
        w = 0.045
        base = Vector((r * math.cos(th), r * math.sin(th), z))
        up = Vector((0.2 * math.sin(twist) * math.cos(th), 0.2 * math.sin(twist) * math.sin(th), 1)).normalized()
        rv += [base + up * w, base - up * w]
    for q in range(STEPS):
        rf.append((2 * q, 2 * q + 1, 2 * q + 3, 2 * q + 2))
    rib = mesh_obj('ribbon', rv, rf, M['ribbon'])
    add_mod(rib, 'SOLIDIFY', thickness=0.008)
    deco.append(rib)
    # กระดิ่งทอง + โบว์แดง
    for q in range(7):
        ti = 1 + q % 6
        t = tiers[ti]
        th = rnd.uniform(0, 6.28)
        th = round((th * t['k'] + t['ph']) / (2 * math.pi) + 0.5) * 2 * math.pi / t['k'] - t['ph'] / t['k'] - math.pi / t['k']
        p, _ = surf(t, 1.0, th, Nz(seed * 31 + ti))
        c = p + Vector((math.cos(th), math.sin(th), 0)) * 0.1 + Vector((0, 0, -0.2))
        s_ = 0.12
        deco.append(lathe(f'bell{q}', [(0.001, -0.01 * s_), (s_ * 1.0, 0), (s_ * 0.95, s_ * 0.18), (s_ * 0.62, s_ * 0.5), (s_ * 0.52, s_ * 0.95), (s_ * 0.38, s_ * 1.25), (0.001, s_ * 1.32)], seg=28, mat=M['gold'], loc=c))
        deco.append(uv_sphere(f'clap{q}', s_ * 0.2, c + Vector((0, 0, -0.01)), M['gold'], seg=10, ring=6))
        for sgn in (-1, 1):
            lp = uv_sphere(f'bow{q}{sgn}', s_ * 0.38, c + Vector((sgn * s_ * 0.45 * math.sin(th), -sgn * s_ * 0.45 * math.cos(th), s_ * 1.42)), M['bow'], seg=12, ring=8, squash=0.55)
            deco.append(lp)
    # ดาวบนยอด: ดาว 5 แฉกนูน (ด้านหน้า/หลังเป็นยอดแหลม) + แกนเสียบ
    sv, sf = [], []
    cz = z_top + 0.26
    R1, R2, D = 0.27, 0.115, 0.08
    for q in range(10):
        a = math.pi / 2 + q * math.pi / 5
        r = R1 if q % 2 == 0 else R2
        sv.append(Vector((r * math.cos(a), 0, cz + r * math.sin(a))))
    sv.append(Vector((0, -D, cz))); sv.append(Vector((0, D, cz)))
    for q in range(10):
        q2 = (q + 1) % 10
        sf.append((q, q2, 10)); sf.append((q2, q, 11))
    st = mesh_obj('star', sv, sf, M['star'], smooth=False)
    add_mod(st, 'BEVEL', width=0.008, segments=2)
    rot = rnd.uniform(-0.15, 0.15)
    st.rotation_euler = (0, 0, rot)
    deco.append(st)
    deco.append(lathe('spike', [(0.03, z_top - 0.12), (0.02, z_top + 0.12), (0.005, z_top + 0.18)], seg=12, mat=M['gold']))
    parts['deco'] = deco
    # แสงอุ่นภายในกิ่ง (ทำให้ใบสนรอบหลอดไฟเรืองทอง)
    for q, c in enumerate(lights[::8]):
        L = bpy.data.lights.new(f'warm{q}', 'POINT'); L.energy = 9; L.color = (1.0, 0.66, 0.32); L.shadow_soft_size = 0.05
        o = bpy.data.objects.new(f'warm{q}', L); o.location = c * 0.9; bpy.context.scene.collection.objects.link(o)
    star_light = bpy.data.lights.new('starL', 'POINT'); star_light.energy = 30; star_light.color = (1.0, 0.8, 0.45)
    so = bpy.data.objects.new('starL', star_light); so.location = (0, -0.25, cz); bpy.context.scene.collection.objects.link(so)
    return parts, lights, Vector((0, 0, cz)), H


_tex_n = 0
def _tex(name, size):
    t = bpy.data.textures.new(name, 'CLOUDS'); t.noise_scale = size * 0.25
    return t


# ---------------------------------------------------------------- แสง/กล้อง ฉากวัตถุ (โทนเดียวกับฉากหมู่บ้าน: ฟ้ากลางคืนน้ำเงิน + แสงทองจากด้านหน้า)
def object_rig(sc, target_h, res, cam_z=1.5, dist=14.0, ortho_pad=1.08, width_ratio=None):
    w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.05, 0.08, 0.17, 1); bg.inputs['Strength'].default_value = 0.9
    def area(name, loc, energy, color, size):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.size = size
        o = bpy.data.objects.new(name, L); o.location = loc; sc.collection.objects.link(o)
        o.rotation_euler = (Vector((0, 0, target_h * 0.45)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return o
    area('key', (-4.5, -6.5, 5.0), 1400, (1.0, 0.82, 0.62), 4.0)
    area('rim', (5.0, 4.5, 4.5), 1100, (0.55, 0.7, 1.0), 3.0)
    area('fill', (3.5, -7.0, 1.2), 260, (0.7, 0.78, 1.0), 6.0)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0, -dist, cam_z + 0.35)
    co.rotation_euler = (Vector((0, 0, cam_z)) - Vector(co.location)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    cam.ortho_scale = target_h * ortho_pad * max(1, res[0] / res[1])
    cam.shift_y = 0.0
    sc.render.film_transparent = True
    return co


def shadow_catcher(sc, size=12):
    pl = mesh_obj('floor', [(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)], [(0, 1, 2, 3)], None, smooth=False)
    pl.is_shadow_catcher = True
    return pl


def render(sc, path, samples):
    sc.cycles.samples = max(8, samples // (4 if LOW else 1))
    if LOW:
        sc.render.resolution_percentage = 40
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('rendered', path, flush=True)


def project(sc, cam, pts):
    out = []
    for p in pts:
        v = world_to_camera_view(sc, cam, p)
        out.append([round(v.x, 4), round(1 - v.y, 4)])
    return out


def job_tree(name, seed, yaw):
    sc = reset()
    M = mats_tree()
    parts, lights, star, H = build_tree(seed, M)
    root = [o for o in sc.objects if o.type in ('MESH', 'LIGHT') and not o.name.startswith(('key', 'rim', 'fill'))]
    for o in root:
        o.matrix_basis = Matrix.Rotation(yaw, 4, 'Z') @ o.matrix_basis
    res = (1100, 1300)
    cam = object_rig(sc, H, res, cam_z=1.55)
    cam.data.ortho_scale = 3.6          # ด้านที่ยาวกว่า (สูง) ครอบ -0.25..3.35 ม. → ฐานอยู่ ~93% ของภาพ
    bpy.context.view_layer.update()
    Rz = Matrix.Rotation(yaw, 4, 'Z')
    floor = shadow_catcher(sc)
    floor.hide_render = True
    render(sc, os.path.join(OUT, f'{name}.png'), 160)
    # ชั้นเงา: ซ่อนต้นไม้จากกล้อง แต่ยังทอดเงา
    floor.hide_render = False
    for o in sc.objects:
        if o.type == 'MESH' and o is not floor: o.visible_camera = False
    sc.cycles.use_denoising = True
    render(sc, os.path.join(OUT, f'{name}_shadow.png'), 64)
    lt = [Rz @ p for p in lights]
    META[name] = {
        'w': res[0], 'h': res[1],
        'base': project(sc, cam, [Vector((0, 0, 0))])[0],
        'top': project(sc, cam, [Vector((0, 0, star.z + 0.3))])[0],
        'star': project(sc, cam, [Rz @ star])[0],
        'lights': project(sc, cam, lt),
        'front': [round((Rz @ p).y < 0.05, 0) and 1 or 0 for p in lights],   # 1 = หลอดหันมาทางกล้อง (มองเห็น)
        'halfWidth': round(abs(project(sc, cam, [Vector((1.2, 0, 0.5))])[0][0] - project(sc, cam, [Vector((0, 0, 0.5))])[0][0]), 4),
    }


# ---------------------------------------------------------------- กล่องของขวัญ
def job_gifts(name, seed):
    sc = reset()
    M = mats_tree()
    rnd = random.Random(seed)
    def paper(col, stripe=None, dots=None):
        def b(nt):
            p = principled(nt, col, rough=0.45, coat=0.25)
            if stripe or dots:
                tc = nt.nodes.new('ShaderNodeTexCoord')
                if stripe:
                    wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 7; wv.bands_direction = 'DIAGONAL'
                    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
                    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
                    ramp.color_ramp.elements[0].color = (*col, 1); ramp.color_ramp.elements[1].position = 0.55; ramp.color_ramp.elements[1].color = (*stripe, 1)
                    nt.links.new(wv.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
                else:
                    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 12
                    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
                    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
                    ramp.color_ramp.elements[0].color = (*dots, 1); ramp.color_ramp.elements[1].position = 0.12; ramp.color_ramp.elements[1].color = (*col, 1)
                    nt.links.new(vo.outputs['Distance'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
            return p
        return node_mat('paper', b)
    papers = [
        (paper((0.5, 0.02, 0.04), stripe=(0.75, 0.55, 0.22)), M['ribbon']),
        (paper((0.02, 0.18, 0.1), dots=(0.85, 0.7, 0.35)), M['bow']),
        (paper((0.86, 0.85, 0.8), stripe=(0.55, 0.03, 0.05)), M['bow']),
        (paper((0.78, 0.55, 0.2)), M['bow']),
        (paper((0.08, 0.12, 0.3), dots=(0.9, 0.9, 0.95)), M['ribbon']),
    ]
    specs = [((0.62, 0.55, 0.5), (0, 0.1, 0.25)), ((0.44, 0.44, 0.62), (0.62, 0.25, 0.31)), ((0.36, 0.34, 0.3), (-0.55, -0.25, 0.15)),
             ((0.3, 0.3, 0.26), (0.08, -0.12, 0.63)), ((0.28, 0.26, 0.24), (0.42, -0.42, 0.12))]
    if seed % 2: specs = [((s[0], s[1], s[2]), (-l[0], l[1], l[2])) for s, l in specs]
    for k, (size, loc) in enumerate(specs):
        pm, rm = papers[(k + seed) % len(papers)]
        rz = rnd.uniform(-0.5, 0.5)
        box(f'g{k}', size, loc, pm, rz, bevel=0.012)
        lid = (size[0] + 0.03, size[1] + 0.03, size[2] * 0.18)
        box(f'lid{k}', lid, (loc[0], loc[1], loc[2] + size[2] / 2 - lid[2] / 2 + 0.005), pm, rz, bevel=0.01)
        w = min(size[0], size[1]) * 0.14
        box(f'rx{k}', (size[0] + 0.04, w, size[2] + 0.04), loc, rm, rz, bevel=0.004)
        box(f'ry{k}', (w, size[1] + 0.04, size[2] + 0.04), loc, rm, rz, bevel=0.004)
        top = Vector((loc[0], loc[1], loc[2] + size[2] / 2 + 0.03))
        for sgn in (-1, 1):   # โบว์สองห่วง
            lp = uv_sphere(f'bw{k}{sgn}', w * 1.25, top + Vector((sgn * w * 1.1 * math.cos(rz), sgn * w * 1.1 * math.sin(rz), w * 0.5)), rm, seg=14, ring=8, squash=0.5)
            lp.scale = (1.25, 0.7, 1.0)
        uv_sphere(f'kn{k}', w * 0.5, top + Vector((0, 0, 0.02)), rm, seg=12, ring=8)
        if k in (0, 3):   # หิมะบนฝากล่อง
            s = uv_sphere(f'sn{k}', 1, top + Vector((size[0] * 0.18, 0, -0.01)), M['snow'], squash=0.18)
            s.scale = (size[0] * 0.22, size[1] * 0.18, size[2] * 0.25)
    res = (900, 620)
    cam = object_rig(sc, 1.1, res, cam_z=0.38, dist=12)
    cam.data.ortho_scale = 2.1
    bpy.context.view_layer.update()
    floor = shadow_catcher(sc); floor.hide_render = True
    render(sc, os.path.join(OUT, f'{name}.png'), 128)
    floor.hide_render = False
    for o in sc.objects:
        if o.type == 'MESH' and o is not floor: o.visible_camera = False
    render(sc, os.path.join(OUT, f'{name}_shadow.png'), 48)
    META[name] = {'w': res[0], 'h': res[1], 'base': project(sc, cam, [Vector((0, 0, 0))])[0]}


# ---------------------------------------------------------------- หมู่บ้านคริสต์มาสยามค่ำ
def job_village():
    sc = reset()
    rnd = random.Random(7)
    M = mats_tree()
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.11, 0.09, 0.2, 1)
    ramp.color_ramp.elements[1].position = 0.55; ramp.color_ramp.elements[1].color = (0.004, 0.008, 0.028, 1)
    e = ramp.color_ramp.elements.new(0.12); e.color = (0.03, 0.045, 0.12, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.7

    def mk(name, col, rough=0.8, bumpS=0):
        def b(nt):
            p = principled(nt, col, rough=rough)
            if bumpS: bump_noise(nt, p, scale=bumpS, strength=0.3)
            return p
        return node_mat(name, b)
    walls = [mk('w1', (0.55, 0.42, 0.3), bumpS=30), mk('w2', (0.32, 0.08, 0.07), bumpS=30), mk('w3', (0.2, 0.26, 0.36), bumpS=30), mk('w4', (0.6, 0.55, 0.45), bumpS=30)]
    timber = mk('timber', (0.12, 0.07, 0.04))
    win = node_mat('win', lambda nt: principled(nt, (1, 0.7, 0.35), emit=(1.0, 0.6, 0.25), estr=7.0))
    snowm = M['snow']
    ground_verts, ground_faces = [], []
    G = 60; S_ = 60.0
    for i in range(G + 1):
        for j in range(G + 1):
            x = -S_ + 2 * S_ * j / G; y = -6 + (S_ + 6) * i / G
            z = 0.12 * math.sin(x * 0.7 + y * 0.3) * min(1, max(0, (y - 3) / 6)) + 0.4 * max(0, (y - 18) / 30) * math.sin(x * 0.2)
            ground_verts.append((x, y, z))
    for i in range(G):
        for j in range(G):
            a = i * (G + 1) + j; ground_faces.append((a, a + 1, a + G + 2, a + G + 1))
    def gsnow(nt):
        p = principled(nt, (0.55, 0.62, 0.78), rough=0.45, sss=0.2, spec=0.6)
        bump_noise(nt, p, scale=3, strength=0.12)
        return p
    gr = mesh_obj('ground', ground_verts, ground_faces, node_mat('gsnow', gsnow))
    add_mod(gr, 'SUBSURF', levels=2, render_levels=2)

    def house(x, y, wdt, dep, hgt, rot, wall):
        objs = []
        body = box('h', (wdt, dep, hgt), (0, 0, hgt / 2), wall); objs.append(body)
        # หลังคาจั่วหนา หิมะคลุม
        rh = wdt * 0.55
        ov = 0.25
        v = [(-wdt / 2 - ov, -dep / 2 - ov, hgt), (wdt / 2 + ov, -dep / 2 - ov, hgt), (0, -dep / 2 - ov, hgt + rh),
             (-wdt / 2 - ov, dep / 2 + ov, hgt), (wdt / 2 + ov, dep / 2 + ov, hgt), (0, dep / 2 + ov, hgt + rh)]
        f = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (0, 2, 5, 3), (1, 4, 5, 2)]
        roof = mesh_obj('roof', v, f, snowm, smooth=False)
        add_mod(roof, 'SOLIDIFY', thickness=0.28); add_mod(roof, 'BEVEL', width=0.12, segments=4)
        objs.append(roof)
        # หน้าต่างไฟอุ่น + กรอบไม้
        nwin = max(1, int(wdt / 1.3))
        for k in range(nwin):
            wx = -wdt / 2 + wdt * (k + 0.5) / nwin
            for fl in ([hgt * 0.32, hgt * 0.72] if hgt > 3.2 else [hgt * 0.5]):
                objs.append(box('win', (0.55, 0.05, 0.72), (wx, -dep / 2 - 0.02, fl), win))
                objs.append(box('mul', (0.05, 0.07, 0.72), (wx, -dep / 2 - 0.04, fl), timber))
                objs.append(box('mul', (0.55, 0.07, 0.05), (wx, -dep / 2 - 0.04, fl), timber))
                objs.append(box('sill', (0.7, 0.18, 0.08), (wx, -dep / 2 - 0.06, fl - 0.4), snowm))
        objs.append(box('door', (0.75, 0.06, 1.4), (wdt * 0.28 if nwin > 1 else 0, -dep / 2 - 0.02, 0.7), timber))
        # ไม้คาน (half-timber)
        for k in range(3):
            objs.append(box('beam', (wdt, 0.06, 0.1), (0, -dep / 2 - 0.03, hgt * (0.05 + 0.48 * k)), timber))
        # ปล่องไฟ
        objs.append(box('chim', (0.45, 0.45, 1.2), (wdt * 0.22, dep * 0.1, hgt + rh * 0.55), walls[1]))
        objs.append(box('chs', (0.55, 0.55, 0.12), (wdt * 0.22, dep * 0.1, hgt + rh * 0.55 + 0.62), snowm, bevel=0.04))
        # ไฟประดับชายคา
        for k in range(int(wdt * 4)):
            s = k / (wdt * 4)
            px = -wdt / 2 - ov + (wdt + 2 * ov) * s
            pz = hgt - 0.05 - 0.12 * math.sin(math.pi * ((s * 5) % 1))
            col_ = [(1.0, 0.62, 0.25), (1.0, 0.25, 0.2), (0.4, 0.9, 0.5), (1.0, 0.8, 0.4)][k % 4]
            mat = node_mat('gb', lambda nt, c=col_: (lambda e: (e.inputs['Color'].__setattr__('default_value', (*c, 1)), e.inputs['Strength'].__setattr__('default_value', 30), e)[2])(nt.nodes.new('ShaderNodeEmission')))
            objs.append(uv_sphere('gb', 0.05, (px, -dep / 2 - ov - 0.03, pz), mat, seg=8, ring=5))
        # พวงหรีดเหนือประตู
        wr = lathe('wreath', [(0.2, -0.05), (0.27, 0), (0.2, 0.05), (0.13, 0)], seg=20, mat=M['needles'])
        wr.rotation_euler = (math.pi / 2, 0, 0); wr.location = (wdt * 0.28 if nwin > 1 else 0, -dep / 2 - 0.08, 1.75)
        objs.append(wr)
        for o in objs:
            o.matrix_basis = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z') @ o.matrix_basis
        L = bpy.data.lights.new('hl', 'POINT'); L.energy = 45; L.color = (1.0, 0.6, 0.28)
        lo = bpy.data.objects.new('hl', L); lo.location = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z') @ Vector((0, -dep / 2 - 1.0, hgt * 0.45)); sc.collection.objects.link(lo)

    # แถวบ้านโค้งรอบลาน (ระยะ 11–20 ม.)
    layout = [(-10.5, 11.5, 4.4, 4, 4.6, 0.4), (-5.6, 13.2, 4.6, 4, 5.6, 0.2), (-0.6, 14.4, 4.2, 4, 4.4, 0.04), (4.3, 13.8, 4.6, 4, 6.0, -0.1),
              (9.0, 12.2, 4.2, 4, 4.8, -0.3), (13.5, 9.8, 4.6, 4, 5.2, -0.55), (-14.8, 8.8, 4.4, 4, 5.0, 0.7), (17.5, 6.5, 4.2, 4, 4.2, -0.85)]
    for k, (x, y, wd, dp, hg, r) in enumerate(layout):
        house(x, y, wd, dp, hg, r, walls[k % len(walls)])

    # ป่าสนด้านหลัง (เรียบง่ายกว่าต้นหลัก — อยู่ไกลและเบลอ)
    def far_pine(x, y, h):
        parts = []
        for k in range(4):
            u = k / 4
            parts.append(lathe('fp', [(h * 0.34 * (1 - u) + 0.1, h * (0.15 + 0.2 * k)), (0.02, h * (0.45 + 0.18 * k))], seg=14, mat=M['needles']))
            parts.append(lathe('fs', [(h * 0.25 * (1 - u) + 0.06, h * (0.28 + 0.2 * k)), (0.02, h * (0.45 + 0.18 * k) + 0.03)], seg=14, mat=snowm))
        for p in parts: p.location = (x, y, 0)
    for k in range(70):
        x = rnd.uniform(-45, 45); y = rnd.uniform(24, 45)
        far_pine(x, y, rnd.uniform(4, 9))
    # ภูเขาไกล
    mv, mf = [], []
    for j in range(80):
        x = -160 + 320 * j / 79
        hgt = 18 + 10 * math.sin(x * 0.03) + 6 * math.sin(x * 0.09 + 1) + 3 * math.sin(x * 0.21)
        mv += [(x, 120, -2), (x, 120, hgt)]
    for j in range(79): mf.append((2 * j, 2 * j + 2, 2 * j + 3, 2 * j + 1))
    mtn = node_mat('mtn', lambda nt: principled(nt, (0.18, 0.22, 0.36), rough=1.0))
    mesh_obj('mtn', mv, mf, mtn)
    # โคมไฟถนน
    lamp_m = node_mat('lamp', lambda nt: principled(nt, (1, 0.8, 0.5), emit=(1.0, 0.72, 0.35), estr=25))
    iron = mk('iron', (0.03, 0.03, 0.04), rough=0.4)
    for x, y in ((-6.5, 9.5), (6.8, 9.0), (-15, 8.5), (15.5, 8.0)):
        lathe('post', [(0.07, 0), (0.05, 0.3), (0.04, 3.0), (0.06, 3.1)], seg=12, mat=iron, loc=(x, y, 0))
        box('lamp', (0.32, 0.32, 0.45), (x, y, 3.35), lamp_m)
        box('lid', (0.45, 0.45, 0.08), (x, y, 3.6), snowm, bevel=0.03)
        L = bpy.data.lights.new('ll', 'POINT'); L.energy = 420; L.color = (1.0, 0.7, 0.36); L.shadow_soft_size = 0.2
        lo = bpy.data.objects.new('ll', L); lo.location = (x, y, 3.3); sc.collection.objects.link(lo)
    # ต้นคริสต์มาสกลางลาน (ไกล) ไฟระยิบ
    far_pine(0.5, 24, 9.5)
    for k in range(60):
        s = k / 60; z = 1.2 + 7.0 * s; r = (1 - s) * 3.0 + 0.2; th = s * 40
        mat = M['bulb']
        uv_sphere('tb', 0.09, (0.5 + r * math.cos(th), 24 + r * math.sin(th) - 0.3, z), mat, seg=8, ring=5)
    # รั้วไม้มีหิมะเกาะ + ตะเกียงบนพื้นหิมะ (ระยะกลาง 7–9 ม.) ให้ลานไม่โล่งเกินไป
    wood = mk('wood', (0.2, 0.11, 0.06), bumpS=25)
    for side in (-1, 1):
        for k in range(9):
            x = side * (3.2 + k * 0.9); y = 7.2 + k * 0.25
            box('fp', (0.12, 0.12, 0.95), (x, y, 0.45), wood, bevel=0.02)
            box('fc', (0.16, 0.16, 0.06), (x, y, 0.95), snowm, bevel=0.03)
        for h in (0.35, 0.72):
            r_ = box('fr', (8.2, 0.07, 0.1), (side * (3.2 + 3.6), 7.2 + 1.0, h), wood, rot_z=side * 0.28, bevel=0.01)
    lant = node_mat('lant', lambda nt: principled(nt, (1, 0.8, 0.5), emit=(1.0, 0.66, 0.3), estr=18))
    for x, y in ((-2.4, 5.2), (2.6, 5.6), (-4.6, 6.4), (4.9, 6.8)):
        box('lb', (0.22, 0.22, 0.3), (x, y, 0.15), lant)
        box('lt', (0.3, 0.3, 0.05), (x, y, 0.33), iron if False else timber)
        L = bpy.data.lights.new('gl', 'POINT'); L.energy = 30; L.color = (1.0, 0.62, 0.3)
        lo = bpy.data.objects.new('gl', L); lo.location = (x, y - 0.25, 0.2); sc.collection.objects.link(lo)
    # แสงจันทร์/ฟ้า
    moon = bpy.data.lights.new('moon', 'SUN'); moon.energy = 0.35; moon.color = (0.55, 0.68, 1.0); moon.angle = 0.2
    mo = bpy.data.objects.new('moon', moon); mo.rotation_euler = (math.radians(55), 0, math.radians(160)); mo.visible_camera = False; mo.visible_glossy = False; sc.collection.objects.link(mo)
    fill = bpy.data.lights.new('plaza', 'AREA'); fill.energy = 260; fill.color = (1.0, 0.74, 0.45); fill.size = 8
    fo = bpy.data.objects.new('plaza', fill); fo.location = (0, -10, 4.5); fo.rotation_euler = (math.radians(70), 0, 0); sc.collection.objects.link(fo)
    # กล้อง: สูงระดับอก มองแนวราบ → เส้นขอบฟ้าอยู่กลางภาพ · ระยะชัดที่ 4 ม. (ตำแหน่งตัวละคร) → หมู่บ้านเบลอนุ่ม
    cam = bpy.data.cameras.new('cam'); cam.lens = 32; cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36
    cam.dof.use_dof = True; cam.dof.focus_distance = 4.0; cam.dof.aperture_fstop = 1.1
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0, -4, 1.3); co.rotation_euler = (math.radians(91), 0, 0)
    cam.shift_y = 0.05
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
    sc.render.film_transparent = False
    # หมอกตามระยะ (Mist pass → compositor)
    sc.view_layers[0].use_pass_mist = True
    sc.world.mist_settings.start = 10; sc.world.mist_settings.depth = 70; sc.world.mist_settings.falloff = 'QUADRATIC'
    sc.use_nodes = True
    ct = sc.node_tree; ct.nodes.clear()
    rl = ct.nodes.new('CompositorNodeRLayers'); comp = ct.nodes.new('CompositorNodeComposite')
    mix = ct.nodes.new('CompositorNodeMixRGB'); mix.inputs[2].default_value = (0.05, 0.065, 0.14, 1)
    mul = ct.nodes.new('CompositorNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.4
    ct.links.new(rl.outputs['Mist'], mul.inputs[0]); ct.links.new(mul.outputs[0], mix.inputs[0])
    ct.links.new(rl.outputs['Image'], mix.inputs[1])
    gl = ct.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.quality = 'HIGH'; gl.size = 7; gl.threshold = 0.9
    ct.links.new(mix.outputs[0], gl.inputs[0]); ct.links.new(gl.outputs[0], comp.inputs[0])
    sc.render.image_settings.color_mode = 'RGB'
    if os.environ.get('EQ_NOCOMP'): sc.use_nodes = False
    dbg = os.environ.get('EQ_DBG', '')
    for o in list(sc.objects):
        if (dbg == 'nolights' and o.type == 'LIGHT') or (dbg == 'nomesh' and o.type == 'MESH'): bpy.data.objects.remove(o)
    render(sc, os.path.join(OUT, 'village.png'), 96)
    META['village'] = {'w': 1080, 'h': 1920}


for j in JOBS:
    if j == 'tree_a': job_tree('tree_a', 11, 0.0)
    elif j == 'tree_b': job_tree('tree_b', 23, 0.9)
    elif j == 'gifts_l': job_gifts('gifts_l', 4)
    elif j == 'gifts_r': job_gifts('gifts_r', 5)
    elif j == 'village': job_village()
    json.dump(META, open(META_PATH, 'w'), indent=1)
print('done', flush=True)
