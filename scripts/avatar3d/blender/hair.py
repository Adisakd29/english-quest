"""
EnglishQuest Avatar — ระบบทรงผม v3 (Premium Stylized)

แทนการเอา sphere/cone/capsule มาวางต่อกัน:
  1. groom: "ช่อผม" (hair clump) เดินตามผิวศีรษะจากรากผม ตามทิศไหลของผม (flow field) แล้วร่วงตามแรงโน้มถ่วง
     เมื่อพ้นด้านข้าง/ด้านหลังศีรษะ · หน้าตัดเป็นเลนส์แบน กว้างที่ราก เรียวที่ปลาย
  2. ช่อพิเศษ: เปียถักสามเส้นสลับกันจริง (parametric 3-strand braid) · มวยบิดเกลียว (ช่อผมพันเป็นขด 2 เส้นบิดกัน)
     · ผมชี้เป็นช่อโค้งเรียวหลายชั้น
  3. "Sculpt pass": รวมหนังศีรษะ (scalp mass) + ทุกช่อ แล้ว voxel remesh (หลอมช่อผมเข้ากับหนังศีรษะเป็นผิวเดียว
     ไม่มีชิ้นลอย/ทะลุกันเอง) → smooth → decimate ตามงบ polygon (= retopology อัตโนมัติ)
  4. วัสดุ: ลายเส้นผม (normal map 'hair') ตามทิศไหลของผม (UV แบบ meridian รอบศีรษะ) + roughness แบบผม
ทุกชิ้น rigid กับกระดูก Head
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from eqlib import HEAD_C, HEAD_R, _obj_from_bm, apply_mods, shell

V = Vector
HC = HEAD_C + V((0, 0.004, 0.012))
R0 = V((HEAD_R.x, HEAD_R.y, HEAD_R.z))
H = ['Head']


# ---------------------------------------------------------------------
# ศีรษะ (ellipsoid) — จุดบนผิว / normal / ทิศ
# ---------------------------------------------------------------------
def surf(d, out=0.0):
    d = V(d).normalized()
    p = HC + V((d.x * R0.x, d.y * R0.y, d.z * R0.z))
    n = V((d.x / R0.x, d.y / R0.y, d.z / R0.z)).normalized()
    return p + n * out, n

def to_dir(p):
    q = V(p) - HC
    return V((q.x / R0.x, q.y / R0.y, q.z / R0.z)).normalized()

def sph(az_deg, el_deg):
    """ทิศจากมุม: az 0 = หน้า (-Y), 90 = ซ้ายของตัวละคร (+X), 180 = หลัง · el 90 = บนสุด"""
    a, e = math.radians(az_deg), math.radians(el_deg)
    return V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


# ---------------------------------------------------------------------
# เส้นทางของช่อผม
# ---------------------------------------------------------------------
def smooth_path(pts, it=2):
    pts = [V(p) for p in pts]
    for _ in range(it):
        pts = [pts[0]] + [(pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
    return pts

def groom(root, flow, length, out0=0.004, out1=0.016, step=0.007, free_nz=-0.2, gravity=0.35, wave=None, curl_end=None,
          stop_z=None, min_y=None, max_y=None, push=None):
    """ช่อผมเดินตามผิวศีรษะ · flow(p, n, t) -> ทิศที่อยากไป · พ้นด้านล่างของศีรษะ (normal ชี้ลง) -> ร่วงตามแรงโน้มถ่วง
    wave=(amp, period) ลอนคลื่น · curl_end=(axis, ang) ม้วนปลาย · stop_z หยุดเมื่อต่ำกว่า"""
    d = V(root).normalized()
    p, n = surf(d, -0.006)
    pts = [p]
    s = 0.0
    free = False
    vel = None
    while s < length:
        t = s / length
        if not free:
            sp, n = surf(d)
            f = flow(sp, n, t)
            tan = f - n * f.dot(n)
            if tan.length < 1e-6:
                tan = V((0, 0, -1)) - n * (-n.z)
            tan.normalize()
            d = to_dir(sp + tan * step)
            sp2, n2 = surf(d)
            out = out0 + (out1 - out0) * min(1.0, t * 1.6)
            p = sp2 + n2 * out
            if n2.z < free_nz and tan.z < 0.2:
                free = True
                vel = tan
        else:
            vel = (vel + V((0, 0, -1)) * gravity).normalized()
            p = p + vel * step
            q = p - HC
            if (q.x / R0.x) ** 2 + (q.y / R0.y) ** 2 + (q.z / R0.z) ** 2 < 1.12 ** 2:
                p = surf(to_dir(p), 0.022)[0]   # ผมที่ร่วงลงไม่ทะลุแก้ม/ศีรษะ
            if push is not None:
                p = p + V(push) * step
        if wave:
            amp, per = wave
            side = V((p.x, p.y, 0)).normalized() if V((p.x, p.y, 0)).length > 1e-6 else V((1, 0, 0))
            p = p + side * amp * math.sin(2 * math.pi * s / per) * min(1.0, t * 3)
        if min_y is not None and p.y < min_y and p.z < 0.78:
            p = V((p.x, p.y + (min_y - p.y) * 0.35, p.z))
        if max_y is not None and p.y > max_y and p.z < 0.78:
            p = V((p.x, p.y + (max_y - p.y) * 0.35, p.z))
        pts.append(V(p))
        s += step
        if stop_z is not None and p.z < stop_z:
            break
    if curl_end:
        ax, ang = curl_end
        k = max(3, len(pts) // 4)
        piv = pts[-k]
        for i in range(len(pts) - k, len(pts)):
            a = ang * (i - (len(pts) - k)) / k
            pts[i] = piv + Matrix.Rotation(a, 3, ax) @ (pts[i] - piv)
    return smooth_path(pts, 2)


# ---------------------------------------------------------------------
# กวาดหน้าตัดตามเส้นทาง (ช่อผมแบน เรียวปลาย)
# ---------------------------------------------------------------------
def sweep(bm, pts, w0, h0, w1=0.15, h1=0.25, k=8, taper=1.4, up_fn=None, twist=0.0, root_cap=True, uv=False, side=None):
    """หน้าตัดเลนส์ (กว้าง w ตามแนวผิวศีรษะ · หนา h ตามแนวตั้งฉากผิว) · w1/h1 = สัดส่วนที่ปลาย
    uv=True: เขียน UV ตามเส้นช่อผม (u รอบช่อ · v ตามความยาว) → ลายเส้นผมวิ่งตามช่อ (ใช้กับเปีย/มวยที่ไม่หลอมรวม)"""
    n = len(pts)
    if n < 2:
        return
    from eqdetail import UV_SCALE
    uvl = bm.loops.layers.uv.verify() if uv else None
    vlen = []
    rings = []
    prev_side = None
    L = sum((pts[i + 1] - pts[i]).length for i in range(n - 1)) or 1e-6
    acc = 0.0
    for i, p in enumerate(pts):
        if i:
            acc += (pts[i] - pts[i - 1]).length
        t = acc / L
        T = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        up = up_fn(p) if up_fn else (p - HC).normalized()
        N = (up - T * up.dot(T)) if side is None else V(side).cross(T)   # side = ทิศความกว้างของหน้าตัดที่ต้องการ
        if N.length < 1e-5:
            N = prev_side.cross(T) if prev_side else V((0, 0, 1))
        N.normalize()
        S = T.cross(N).normalized()
        if twist:
            a = twist * t
            S, N = S * math.cos(a) + N * math.sin(a), N * math.cos(a) - S * math.sin(a)
        prev_side = S
        vlen.append(acc)
        f = (1 - t) ** (1 / taper) if t < 1 else 0.0
        w = w0 * (w1 + (1 - w1) * f)
        h = h0 * (h1 + (1 - h1) * f)
        if i == n - 1:
            rings.append([bm.verts.new(p + T * 0.002)])
            continue
        ring = []
        for j in range(k):
            a = 2 * math.pi * j / k
            c, s_ = math.cos(a), math.sin(a)
            # เลนส์: ปลายสองข้างแหลมเล็กน้อย (|cos|^0.8) — เหมือนช่อผมที่แบนตามผิวศีรษะ
            x = math.copysign(abs(c) ** 0.8, c) * w / 2
            y = s_ * h / 2
            ring.append(bm.verts.new(p + S * x + N * y))
        rings.append(ring)
    U = lambda j, i: (2.0 * j / k / UV_SCALE + 0.5, vlen[i] * 14 / UV_SCALE + 0.5)   # 2 ช่องลายรอบช่อ · 14 ช่อง/เมตร ตามยาว
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        if len(b) == 1:
            for j in range(k):
                f = bm.faces.new((a[j], a[(j + 1) % k], b[0]))
                if uvl:
                    for lp, uvv in zip(f.loops, (U(j, i), U(j + 1, i), U(j + 0.5, i + 1))):
                        lp[uvl].uv = uvv
        else:
            for j in range(k):
                f = bm.faces.new((a[j], a[(j + 1) % k], b[(j + 1) % k], b[j]))
                if uvl:
                    for lp, uvv in zip(f.loops, (U(j, i), U(j + 1, i), U(j + 1, i + 1), U(j, i + 1))):
                        lp[uvl].uv = uvv
    if root_cap:
        f = bm.faces.new(list(reversed(rings[0])))
        if uvl:
            for lp in f.loops:
                lp[uvl].uv = (0.5, 0.5)


def tube_bm(bm, pts, radii, k=10):
    """ท่อกลม (ใช้กับเปีย/มวย ที่เป็นเกลียวในตัว)"""
    sweep(bm, pts, radii[0] * 2, radii[0] * 2, w1=radii[1] / radii[0], h1=radii[1] / radii[0], k=k, taper=1.0,
          up_fn=lambda p: V((0, 0, 1)))


# ---------------------------------------------------------------------
# Sculpt pass: หลอมรวม → remesh → smooth → decimate
# ---------------------------------------------------------------------
SMOOTH_STYLE = {'voxel': 1.0, 'voxel_min': 0.0, 'extra_smooth': 0, 'lambda': 0.35}   # ปรับรวมได้ (style v3 ใช้ค่าต่อชิ้นใน hair_sculpt)


def fuse(name, objs, material, voxel=0.0026, smooth=3, target_tris=6500):
    """รวมช่อผม + หนังศีรษะเป็นผิวต่อเนื่องผืนเดียว (ไม่มีชิ้นลอย ไม่มีช่อทะลุกันเอง) แล้วลด polygon ตามงบ"""
    bm = bmesh.new()
    for ob in objs:
        if isinstance(ob, bmesh.types.BMesh):
            me = bpy.data.meshes.new('tmp'); ob.to_mesh(me); ob.free()
            bm.from_mesh(me); bpy.data.meshes.remove(me)
        else:
            bm.from_mesh(ob.data)
            bpy.data.objects.remove(ob, do_unlink=True)
    out = _obj_from_bm(name, bm, material, H, rigid='Head')
    voxel = max(voxel * SMOOTH_STYLE['voxel'], SMOOTH_STYLE['voxel_min'])
    smooth = smooth + SMOOTH_STYLE['extra_smooth']
    rm = out.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'; rm.voxel_size = voxel; rm.adaptivity = 0.0; rm.use_smooth_shade = True
    sm = out.modifiers.new('smooth', 'LAPLACIANSMOOTH')
    sm.iterations = smooth; sm.lambda_factor = SMOOTH_STYLE['lambda']; sm.use_volume_preserve = True
    apply_mods(out)
    tris = sum(len(p.vertices) - 2 for p in out.data.polygons)
    if tris > target_tris:
        dc = out.modifiers.new('dec', 'DECIMATE')
        dc.decimate_type = 'COLLAPSE'; dc.ratio = target_tris / tris; dc.use_collapse_triangulate = True
        apply_mods(out)
    for p in out.data.polygons:
        p.use_smooth = True
    out.data.validate(clean_customdata=False)   # ลบ face เสื่อม (หลัง decimate) — glTF exporter เตือน "mesh is not valid"
    out.data.materials.clear(); out.data.materials.append(material)
    out['eq_bones'] = 'Head'; out['eq_rigid'] = 'Head'; out['eq_hair'] = 1
    return out


def scalp(keep, material, grow=0.95, thick=0.016):
    """มวลผมฐาน (ใต้ช่อผม) — ด้านในจมในศีรษะ ไม่มีผิวหัวโผล่ระหว่างช่อ"""
    return shell('scalp', HC, R0 * grow, keep, material, H, seg=48, rings=30, thick=thick, rigid='Head')


def bm_obj(bm, material, name='clumps'):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # normal ชี้ออกนอกช่อผมเสมอ (แสงถูก · ตรวจ "แขนจมในผม" ถูก)
    return _obj_from_bm(name, bm, material, H, rigid='Head')


# ---------------------------------------------------------------------
# ตัวช่วย flow field
# ---------------------------------------------------------------------
def away_from(point, down=0.6, fwd=0.0):
    """ไหลออกจากจุด (ขวัญ/แสก) + ลงล่าง"""
    c = V(point)
    def f(p, n, t):
        a = p - c
        a.z = max(a.z, 0.0) * 0.3
        v = a.normalized() if a.length > 1e-6 else V((0, 0, -1))
        return (v + V((0, -fwd, -down * (0.4 + t)))).normalized()
    return f

def toward(point, pull=1.0):
    c = V(point)
    def f(p, n, t):
        return ((c - p).normalized() * pull + V((0, 0, 0.05))).normalized()
    return f

def hairline_ok(d, front=0.62, nape=-0.42, side=-0.08):
    """รากผมอยู่ในขอบเขตหนังศีรษะ (ไม่ขึ้นบนหน้า/หู)"""
    if d.y < 0 and d.z < front - 0.55 * (1 - abs(d.x)):   # หน้าผาก
        return False
    if d.z < nape and d.y > 0:
        return False
    if abs(d.x) > 0.75 and d.z < side:                       # เหนือหู
        return False
    return d.z > -0.5


def fib_dirs(n, pred, seed=0):
    """จุดกระจายสม่ำเสมอบนทรงกลม (Fibonacci) เฉพาะที่ pred(dir)"""
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    rnd = random.Random(seed)
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - z * z))
        a = ga * i + rnd.uniform(-0.15, 0.15)
        d = V((math.cos(a) * r, math.sin(a) * r, z))
        if pred(d):
            out.append(d)
    return out


# ---------------------------------------------------------------------
# เปียสามเส้น (ถักสลับจริง)
# ---------------------------------------------------------------------
def braid_strands(axis_pts, width, depth, r0, r1, cycles):
    """axis_pts = แกนเปีย · คืน 3 เส้นทาง (เส้นละ 1 ช่อ) ที่สลับซ้าย-กลาง-ขวา และบน-ล่าง (over/under) ตามสูตรเปีย 3 เส้น"""
    n = len(axis_pts)
    L = sum((axis_pts[i + 1] - axis_pts[i]).length for i in range(n - 1))
    paths = [[], [], []]
    acc = 0
    for i, c in enumerate(axis_pts):
        if i:
            acc += (axis_pts[i] - axis_pts[i - 1]).length
        t = acc / L
        T = (axis_pts[min(n - 1, i + 1)] - axis_pts[max(0, i - 1)]).normalized()
        out = V((c.x, c.y, 0)).normalized() if V((c.x, c.y, 0)).length > 1e-6 else V((0, -1, 0))
        S = (out.cross(T)).normalized()
        Nn = T.cross(S).normalized()
        sc = 1 - 0.55 * t   # เปียเรียวลง
        for k in range(3):
            ph = 2 * math.pi * cycles * t + 2 * math.pi * k / 3
            x = math.sin(ph) * width / 2 * sc
            y = math.sin(2 * ph) * depth / 2 * sc   # สองเท่าของความถี่ = ข้ามบน/ล่างสลับกัน
            paths[k].append(c + S * x + Nn * y)
    return paths


# ---------------------------------------------------------------------
# มวยบิดเกลียว
# ---------------------------------------------------------------------
def bun_coil(center, up, r_out=0.058, height=0.07, turns=2.3, strand_r=0.017, twist_turns=7, n=72):
    """ช่อผมพันเป็นขดทรงโดม (ไม่กลมสมบูรณ์) — 2 ช่อบิดเกลียวรอบกัน (เชือกผม) · คืนรายการเส้นทาง"""
    up = V(up).normalized()
    a0 = up.orthogonal().normalized()
    b0 = up.cross(a0).normalized()
    axis = []
    for i in range(n):
        t = i / (n - 1)
        ang = 2 * math.pi * turns * t
        r = r_out * (1 - 0.82 * t) * (1 + 0.08 * math.sin(3 * ang))   # ขดเล็กลงขึ้นยอด + ไม่กลมเป๊ะ
        h = height * (0.15 + 0.85 * math.sin(t * math.pi / 2))
        axis.append(V(center) + a0 * math.cos(ang) * r + b0 * math.sin(ang) * r + up * h)
    paths = [[], []]
    for i, c in enumerate(axis):
        t = i / (n - 1)
        T = (axis[min(n - 1, i + 1)] - axis[max(0, i - 1)]).normalized()
        S = T.cross(up).normalized()
        Nn = S.cross(T).normalized()
        for k in range(2):
            ph = 2 * math.pi * twist_turns * t + math.pi * k
            off = strand_r * 0.75 * (1 - 0.5 * t)
            paths[k].append(c + S * math.cos(ph) * off + Nn * math.sin(ph) * off)
    return paths
