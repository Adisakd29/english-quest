"""
ทรงผม Style v3 "หัวโตตัวเล็ก" — ผมปั้นเป็นมวลเรียบ (sculpted volume hair)

แนวทาง: ผมการ์ตูนเรียบสะอาด เป็น "ก้อนผมปั้น" ผิวเนียน ขอบหนา ปลายมน มีร่องผมกว้างตื้น ๆ บอกทิศทางไหล
(ไม่ใช่เส้นผมทีละช่อ และไม่ใช่ทรงกลม/กรวยมาวางต่อกัน)
  1. หมวกผม (cap): ผิวที่ "งอก" ออกจากผิวศีรษะตามสนามความหนา T(ทิศ) — หนาบนกระหม่อม บางที่ขอบ
     · ขอบไรผม/หน้าม้า = ฟังก์ชันขอบ (ตัดเป็นเส้นเรียบด้วยการ bisect ไม่เป็นขั้นบันได) · ความหนาที่ขอบ = ขอบผมหนามองเห็นได้
     · ร่องผม: ร่องกว้างตื้นวิ่งออกจาก "ขวัญ/แสก/จุดรวบผม" (flow) · ก้อนผม (lock) นูนสลับ
  2. ม่านผม (curtain): ผมที่ห้อยลงใต้ศีรษะ (บ๊อบ/ยาว/ลอน) — ผิวกริดรอบศีรษะ ห้อยตรงแล้วหลบไปด้านหลังไหล่ (ทางแขนยก)
  3. ชิ้นพิเศษ: มวย (ก้อนแป้นมีร่องเกลียว) · หางม้า (ก้อนเรียวโค้ง S มีร่อง) · ช่อผมชี้ (เปลวโค้ง ปลายมน) · เปียถักสามเส้น
  4. Sculpt pass: รวมทุกชิ้น → voxel remesh (หลอมเป็นผิวเดียว) → smooth → decimate ตามงบ (hair.fuse)
ทุกชิ้น rigid กับกระดูก Head · ปั้นในพิกัดต้นแบบ แล้วแปลงสัดส่วนด้วย eqlib.style_warp ตอน skin
"""
import math

import bmesh
from mathutils import Matrix, Vector

from eqdetail import fab
from eqlib import _obj_from_bm, apply_mods, tube_arc
from hair import HC, R0, H, braid_strands, bm_obj, fuse, smooth_path, sph, surf, sweep

V = Vector


def hair_mat(name, color, rough=0.55, nstr=0.3):
    return fab(name, color, 'hair', rough, nstr=nstr)


def _sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------------
# สนามทิศทาง (flow) รอบจุด W บนศีรษะ
# ---------------------------------------------------------------------
def frame_of(W):
    W = V(W).normalized()
    a = (V((0, 0, 1)) if abs(W.z) < 0.95 else V((0, -1, 0)))
    a = (a - W * a.dot(W)).normalized()
    b = W.cross(a).normalized()
    return W, a, b

def polar(d, fr):
    """มุมรอบแกน W (phi) และระยะเชิงมุมจาก W (theta)"""
    W, a, b = fr
    q = d - W * d.dot(W)
    return math.atan2(q.dot(b), q.dot(a)), math.acos(max(-1.0, min(1.0, d.dot(W))))

def grooves(d, fr, n, depth, sharp=6, twist=0.0, start=0.18, phase=0.0):
    """ร่องผมวิ่งออกจาก W: n ร่องรอบตัว · กว้าง ~ (1/sharp) ของช่วง · ลึก depth (เมตร) · twist = บิดเป็นก้นหอย"""
    phi, th = polar(d, fr)
    f = (0.5 + 0.5 * math.cos(n * (phi + twist * th) + phase)) ** sharp
    return -depth * f * _sm((th - start) / 0.25)

def locks(d, fr, n, amp, start=0.25, phase=0.0, twist=0.0):
    """ก้อนผมนูนสลับ (ปอยใหญ่) รอบ W"""
    phi, th = polar(d, fr)
    return amp * (0.5 + 0.5 * math.cos(n * (phi + twist * th) + phase)) * _sm((th - start) / 0.3)


# ---------------------------------------------------------------------
# หมวกผม (cap)
# ---------------------------------------------------------------------
def cap(name, keep, thick, material, seg=144, rings=96, inner=0.026):
    """keep(d)->bool (ขอบผม · ต้องต่อเนื่องถึงยอดหัว) · thick(d)->ระยะผิวผมด้านนอกจากผิวศีรษะ (เมตร)
    ผิวด้านในจมในศีรษะ (inner) → ขอบผมหนาเท่ากับ thick ที่ขอบ (มองเห็นเป็นขอบผมหนาเรียบ)"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    flag = {v: keep(v.co.normalized()) for v in bm.verts}
    edge = [v for v in bm.verts if not flag[v] and any(flag[e.other_vert(v)] for e in v.link_edges)]
    for v in edge:   # ขอบเรียบ: เลื่อนจุดริมขึ้นไปบนเส้นขอบพอดี (bisect ตามเส้นเมริเดียน)
        d = v.co.normalized()
        h = math.hypot(d.x, d.y) or 1e-6
        at = lambda z: V((d.x / h * math.sqrt(max(0.0, 1 - z * z)), d.y / h * math.sqrt(max(0.0, 1 - z * z)), z))
        lo, hi = d.z, 1.0
        for _ in range(22):
            mid = (lo + hi) / 2
            if keep(at(mid)):
                hi = mid
            else:
                lo = mid
        v.co = at(hi)
    ks = set(edge)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not flag[v] and v not in ks], context='VERTS')
    for v in bm.verts:
        d = v.co.normalized()
        p, n = surf(d)
        v.co = p + n * thick(d)
    ob = _obj_from_bm(name, bm, material, H, rigid='Head')
    sd = ob.modifiers.new('solid', 'SOLIDIFY')
    sd.thickness = inner + 0.03; sd.offset = -1.0; sd.use_rim = True
    apply_mods(ob)
    return ob


def head_edge(front_z, back_z=-0.38, ear_z=-0.02, ear_w=0.62, side_drop=0.0):
    """ขอบผมมาตรฐาน: หน้าผาก/หน้าม้าที่ front_z(d) (ทิศหน้า) · ท้ายทอย back_z · ช่องหู (|x| > ear_w ต่ำกว่า ear_z)"""
    def keep(d):
        if d.y < 0:   # ครึ่งหน้า: ระดับขอบผมหน้า ผสมไปหาด้านข้าง
            k = _sm((-d.y - 0.15) / 0.55)
            zf = front_z(d) * k + (ear_z - side_drop) * (1 - k)
        else:
            k = _sm((d.y - 0.1) / 0.6)
            zf = (ear_z - side_drop) * (1 - k) + back_z * k
        if abs(d.x) > ear_w and d.y < 0.35:
            zf = max(zf, ear_z + 0.18 * _sm((abs(d.x) - ear_w) / 0.2) * (1 - _sm((d.y - 0.15) / 0.2)))
        return d.z > zf
    return keep


def bang_line(z0, scallop=0.0, n=0, lift_sides=0.25, tilt=0.0, phase=0.0):
    """ขอบหน้าม้า (ทิศ d.z ที่ขอบ) ตามมุมแนวนอน: ยกขึ้นที่ขมับ · scallop = ปลายหน้าม้าเป็นปอยมน n ปอย · tilt = เฉียง"""
    def zf(d):
        a = math.atan2(d.x, -d.y)   # 0 = กลางหน้าผาก
        z = z0 + lift_sides * (a / 1.2) ** 2 + tilt * a
        if n:
            z += scallop * (0.5 - 0.5 * math.cos(n * a + phase)) ** 1.5
        return z
    return zf


# ---------------------------------------------------------------------
# ม่านผม (ผมที่ห้อยลงใต้ศีรษะ)
# ---------------------------------------------------------------------
def curtain(name, material, az0, az1, z_top, hem, out=0.012, thick=0.02, n_az=96, n_z=48,
            wave=None, curl=0.0, gather=0.0, gather_z=(0.74, 0.6), flare=0.0, tuck=0.012, hug=0.12, bottom_y=None):
    """ผมที่ห้อยลงใต้ศีรษะ: az (องศา) 0 = หน้า · 90 = ซ้ายตัวละคร (+X) · 180 = หลัง · จาก z_top (แนบศีรษะ) ลงถึง hem(az)
    · gather = ผมด้านข้างค่อย ๆ รวบไปด้านหลังเมื่อต่ำลง (0..1) → ผมตกหลังไหล่ ไม่ขวางแขนที่ยกขึ้นด้านข้าง
    · wave=(amp, wavelength) ลอนคลื่น · curl = ปลายงุ้มเข้า · flare = ปลายบาน · tuck = ขอบซ้าย/ขวาของม่านมนเข้าหาศีรษะ
    · bottom_y = ใต้ระดับไหล่ ผมด้านหลังค่อย ๆ เข้าใกล้หลัง (ไม่ลอยห่างตัว)"""
    bm = bmesh.new()
    grid = []
    for i in range(n_az + 1):
        u_ = i / n_az
        a_param = az0 + (az1 - az0) * u_
        edge_k = min(u_, 1 - u_)   # 0 ที่ขอบม่าน
        col = []
        for j in range(n_z + 1):
            t = j / n_z
            zb = hem(a_param)
            z = z_top + (zb - z_top) * t
            g = gather * _sm((gather_z[0] - z) / (gather_z[0] - gather_z[1]))
            a = math.radians(180 + (a_param - 180) * (1 - g))
            # แนบศีรษะช่วงบน (ตามทรงรี) · ใต้แนวกลางหัว ห้อยตรง (ไม่หุบตามคาง)
            uz = (z - HC.z) / R0.z
            sx = math.sqrt(max(0.0, 1 - uz * uz)) if z > HC.z else 1.0
            o = out
            if wave:
                amp, lam = wave
                # ลอนเป็น "ปอย" แนวตั้ง ~10 ปอยรอบศีรษะ ที่ส่ายเป็นคลื่นตามความยาว (ไม่เป็นวงแหวนซ้อน)
                o += amp * math.sin(10 * a + 2 * math.pi * (z_top - z) / lam) * _sm(t / 0.3)
            o += flare * t ** 2 - curl * _sm((t - 0.72) / 0.28)
            o -= tuck * (1 - _sm(edge_k / 0.08))
            # ใบหู: ม่านนูนออกเล็กน้อยรอบหู (หูไม่ทะลุผม)
            ear = 0.014 * math.exp(-((z - 0.785) / 0.045) ** 2) * math.exp(-((abs(math.sin(a)) - 1) / 0.12) ** 2)
            rx, ry = R0.x * sx + o + ear, R0.y * sx + o
            x = math.sin(a) * rx
            y = -math.cos(a) * ry
            if bottom_y is not None and y > 0:
                k = _sm((0.66 - z) / 0.12)
                y = y + (bottom_y - y) * k * 0.6
            col.append(bm.verts.new((HC.x + x, HC.y + y, z)))
        grid.append(col)
    for i in range(n_az):
        for j in range(n_z):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    # normal ต้องชี้ออกจากศีรษะ (solidify หนาเข้าด้านใน = ผิวนอกอยู่ที่ระยะ out พอดี)
    bm.normal_update()
    score = sum(f.normal.dot((f.calc_center_median() - V((HC.x, HC.y, f.calc_center_median().z))).normalized()) for f in bm.faces)
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    ob = _obj_from_bm(name, bm, material, H, rigid='Head')
    sd = ob.modifiers.new('solid', 'SOLIDIFY')
    sd.thickness = thick; sd.offset = -1.0; sd.use_rim = True
    apply_mods(ob)
    return ob


def ear_bump(d):
    """หมวกผมที่คลุมหู: นูนออกรอบใบหู"""
    return 0.016 * math.exp(-((d.z + 0.1) / 0.18) ** 2) * math.exp(-((abs(d.x) - 1) / 0.14) ** 2)


def grooved_obj(ob, fn):
    """ดันผิวตามแนว normal ด้วย fn(world_co)->ระยะ (เมตร) — ใช้ทำร่องบนม่านผม/หางม้า"""
    me = ob.data
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    for v in me.vertices:
        v.co = v.co + v.normal * fn(v.co)
    return ob


def curtain_grooves(n=22, depth=0.004, sharp=5):
    """ร่องแนวตั้งบนม่านผม (ตามมุมรอบศีรษะ) — ลึกขึ้นเรื่อย ๆ จากบนลงล่าง"""
    def f(p):
        a = math.atan2(p.x - HC.x, -(p.y - HC.y))
        k = _sm((0.78 - p.z) / 0.1)
        return -depth * k * (0.5 + 0.5 * math.cos(n * a)) ** sharp
    return f


# ---------------------------------------------------------------------
# ชิ้นพิเศษ
# ---------------------------------------------------------------------
def knot(name, material, base, up, r=0.052, h=0.05, grooves_n=5, twist=2.2, groove=0.006):
    """มวยผม: ก้อนแป้น (ไม่กลมเป๊ะ — ยอดมนต่ำ ฐานกว้าง) ร่องผมพันเป็นก้นหอยจากโคนขึ้นยอด"""
    up = V(up).normalized()
    a0 = up.orthogonal().normalized(); b0 = up.cross(a0).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        el = math.asin(max(-1.0, min(1.0, d.z)))   # -90..90 (ล่าง → บน)
        az = math.atan2(d.y, d.x)
        t = (el / (math.pi / 2) + 1) / 2           # 0 ล่าง → 1 ยอด
        rr = r * (1.0 + 0.06 * math.sin(2 * az)) * (1 - 0.12 * t)
        g = groove * (0.5 + 0.5 * math.cos(grooves_n * az + twist * 2 * math.pi * t)) ** 4 * _sm((t - 0.12) / 0.2) * (1 - _sm((t - 0.9) / 0.1))
        rad = rr - g
        z = h * d.z if d.z > 0 else h * 0.6 * d.z
        p = V(base) + a0 * (math.cos(el) * math.cos(az) * rad) + b0 * (math.cos(el) * math.sin(az) * rad) + up * (z + h * 0.35)
        v.co = p
    return _obj_from_bm(name, bm, material, H, rigid='Head')


def lock_path(p0, dirs, length, n=18):
    """เส้นทางโค้งจาก p0 ตามรายการทิศ (ผสมทีละช่วง)"""
    pts = [V(p0)]
    for i in range(1, n):
        t = i / (n - 1)
        k = t * (len(dirs) - 1)
        a = int(min(len(dirs) - 2, k))
        d = V(dirs[a]).lerp(V(dirs[a + 1]), k - a).normalized()
        pts.append(pts[-1] + d * (length / (n - 1)))
    return smooth_path(pts, 2)


def tail(bm, P, length, w=0.075, h=0.058, sway=0.03, back=0.05, n=24, w1=0.22):
    """หางม้า: ก้อนเรียวโค้ง S (กว้างที่โคน ปลายมนเรียว) — ปั้นเป็นก้อนเดียว (ร่องผมเติมทีหลัง)"""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        pts.append(V(P) + V((sway * math.sin(t * math.pi * 1.2), back * math.sin(t * math.pi * 0.9) + 0.02, -length * t)))
    sweep(bm, smooth_path(pts, 2), w, h, w1=w1, h1=w1 + 0.08, k=20, taper=0.9,
          up_fn=lambda p: V((0, 1, 0.15)).normalized())


def finish(name, objs, material, voxel=0.003, smooth=4, tris=6500):
    """Sculpt pass: หลอม → remesh → เกลาเรียบ → ลดโพลีกอน"""
    return fuse(name, objs, material, voxel=voxel, smooth=smooth, target_tris=tris)


# =====================================================================
# ทรงผม 10 ทรง (Item ID เดิม)
# =====================================================================
CROWN = sph(180, 70)


def H_crop(c='#3b2a24'):
    """สั้นรองทรง: ทรงพอดีหัว หนาบนกระหม่อม · หน้าม้าสั้นปลายมน 4 ปอย · ร่องผมจากขวัญไปทุกทิศ"""
    m = hair_mat('MAT_Hair_Crop', c, 0.58)
    fr = frame_of(CROWN)
    keep = head_edge(bang_line(0.5, scallop=-0.05, n=4, lift_sides=0.2), back_z=-0.3, ear_z=0.02)
    th = lambda d: 0.012 + 0.012 * _sm((d.z - 0.2) / 0.7) + locks(d, fr, 9, 0.004) + grooves(d, fr, 18, 0.0035)
    return [finish('hair', [cap('cap', keep, th, m)], m, tris=5000)]


def H_side(c='#1f1b24'):
    """แสกข้าง: แนวแสกซ้าย (ร่องลึก) · ผมฝั่งขวาปัดเฉียงเป็นก้อนโค้งคลุมหน้าผาก · ข้างหลังเรียบ"""
    m = hair_mat('MAT_Hair_SidePart', c, 0.55)
    part = sph(38, 62)
    fr = frame_of(part)
    # หน้าม้าเฉียง: ฝั่งซ้าย (แสก) สูง → ฝั่งขวาลงต่ำ
    keep = head_edge(bang_line(0.42, scallop=-0.04, n=3, lift_sides=0.16, tilt=0.14), back_z=-0.32, ear_z=0.03)
    def th(d):
        phi, t_ = polar(d, fr)
        swoop = 0.012 * _sm((-d.y - 0.2) / 0.5) * _sm((0.1 - d.x) / 0.5)   # ก้อนปัดด้านหน้าขวา
        line = -0.006 * math.exp(-((d.x - part.x) / 0.05) ** 2) * _sm((d.z - 0.45) / 0.2) * _sm((0.1 - d.y) / 0.3)   # ร่องแสก
        return 0.013 + 0.013 * _sm((d.z - 0.2) / 0.7) + swoop + line + grooves(d, fr, 16, 0.0035, twist=0.6)
    return [finish('hair', [cap('cap', keep, th, m)], m, tris=5600)]


def H_bob(c='#8a4b2a'):
    """บ๊อบ: หน้าม้าตรงตัดเสมอคิ้ว · ผมข้าง/หลังห้อยตรงถึงคาง ปลายงุ้มเข้า · ร่องผมแนวตั้ง"""
    m = hair_mat('MAT_Hair_Bob', c, 0.55)
    fr = frame_of(sph(180, 84))
    keep = head_edge(bang_line(0.36, scallop=0.0, lift_sides=0.12), back_z=-0.2, ear_z=-0.2, ear_w=0.98)
    th = lambda d: 0.016 + 0.01 * _sm((d.z - 0.2) / 0.7) + ear_bump(d) + grooves(d, fr, 22, 0.003)
    top = cap('cap', keep, th, m)
    cur = curtain('bob', m, 56, 304, 0.86, lambda az: 0.672 + 0.008 * _sm((abs(az - 180) - 80) / 40), out=0.014, thick=0.022,
                  curl=0.016, gather=0.42, gather_z=(0.8, 0.68), tuck=0.016)
    grooved_obj(cur, curtain_grooves(26, 0.0035))
    return [finish('hair', [top, cur], m, tris=7000)]


def H_pony(c='#d9a441'):
    """หางม้า: ผมหวีตึงไปรวบหลังกระหม่อม (ร่องผมวิ่งเข้าจุดรวบ) · ยางรัด · หางม้าก้อนเรียวโค้ง S มีร่อง"""
    m = hair_mat('MAT_Hair_Ponytail', c, 0.52)
    band = fab('MAT_Hair_Band_Pink', '#e85d75', None, 0.6)
    P = V((0, 0.205, 0.9))
    fr = frame_of((P - HC).normalized())
    keep = head_edge(bang_line(0.5, scallop=-0.05, n=5, lift_sides=0.2), back_z=-0.36, ear_z=0.0)
    th = lambda d: 0.01 + 0.006 * _sm((d.z - 0.3) / 0.6) + grooves(d, fr, 20, 0.003, start=0.22)
    top = cap('cap', keep, th, m)
    bm = bmesh.new()
    # หางม้า 3 ปอยรวบเป็นช่อเดียว (กลาง + ซ้าย/ขวาแยกปลายเล็กน้อย) → ช่อมีร่องระหว่างปอย ปลายมน ไม่เป็นกรวยแหลม
    for dx, L, sw, w_ in ((0.0, 0.25, 0.012, 0.085), (0.026, 0.215, 0.03, 0.068), (-0.026, 0.205, -0.026, 0.068)):
        tail(bm, P + V((dx, 0.01, -0.012)), L, w=w_, h=w_ * 0.82, back=0.03, sway=sw, w1=0.36)
    # โคนหางม้าพองออก (ผมที่รวบแล้วบานก่อนเรียวลง) — ไม่เป็นกรวย
    sweep(bm, smooth_path([P + V((0, 0.008, -0.006)), P + V((0, 0.03, -0.05)), P + V((0.004, 0.038, -0.11))], 2), 0.13, 0.1,
          w1=0.6, h1=0.6, k=20, taper=1.0, up_fn=lambda p: V((0, 1, 0.15)).normalized())
    tl = bm_obj(bm, m, 'tail')
    grooved_obj(tl, lambda p: -0.004 * (0.5 + 0.5 * math.cos(9 * math.atan2(p.x, p.y - P.y - 0.04))) ** 5 * _sm((P.z - 0.03 - p.z) / 0.05))
    tb = tube_arc('band', (0, 0, 0), 0.03, 0.0085, 0, 2 * math.pi, band, H, plane='XY', seg=20, tseg=8, rigid='Head')
    tb.data.transform(Matrix.Translation(P + V((0, 0.018, -0.008))) @ V((0, 0, 1)).rotation_difference(V((0, 0.5, -0.86))).to_matrix().to_4x4())
    return [finish('hair', [top, tl], m, tris=6500), tb]


def _long_cap(m, fr, bang_z=0.38):
    keep = head_edge(bang_line(bang_z, scallop=-0.04, n=5, lift_sides=0.14), back_z=-0.2, ear_z=-0.2, ear_w=0.98)
    th = lambda d: 0.016 + 0.01 * _sm((d.z - 0.2) / 0.7) + ear_bump(d) + grooves(d, fr, 22, 0.003)
    return cap('cap', keep, th, m)


def H_long(c='#2a1c2e'):
    """ผมยาวตรง: หน้าม้าปลายมน · ผมยาวห้อยตรงลงกลางหลัง (ข้างพ้นไหล่ไปด้านหลัง ไม่ขวางแขน) · ปลายตัดเป็นลอนมน"""
    m = hair_mat('MAT_Hair_Long', c, 0.5)
    fr = frame_of(sph(180, 84))
    top = _long_cap(m, fr)
    cur = curtain('long', m, 62, 298, 0.86, lambda az: 0.48 + 0.012 * math.cos(math.radians(az - 180) * 7), out=0.016, thick=0.022,
                  gather=0.55, gather_z=(0.78, 0.6), flare=0.008, bottom_y=0.13)
    grooved_obj(cur, curtain_grooves(24, 0.004))
    return [finish('hair', [top, cur], m, tris=8000)]


def H_wavy(c='#6b3e26'):
    """ผมยาวลอนคลื่น: ลอนใหญ่นุ่มต่อเนื่องจากระดับหู · ปลายบานเล็กน้อย"""
    m = hair_mat('MAT_Hair_Wavy', c, 0.55)
    fr = frame_of(sph(180, 84))
    top = _long_cap(m, fr, bang_z=0.4)
    cur = curtain('wavy', m, 62, 298, 0.86, lambda az: 0.47 + 0.014 * math.cos(math.radians(az - 180) * 6), out=0.018, thick=0.024,
                  wave=(0.012, 0.13), gather=0.55, gather_z=(0.78, 0.6), flare=0.014, bottom_y=0.14)
    grooved_obj(cur, curtain_grooves(20, 0.004))
    return [finish('hair', [top, cur], m, tris=8000)]


def H_curly(c='#3a2418'):
    """ผมหยิก: ทรงฟูเป็นก้อนเมฆ — ก้อนลอนกลมนูนหนาแน่นทั่วศีรษะ (ปั้นเป็นผิวเดียว) ขอบเป็นลอนมน"""
    m = hair_mat('MAT_Hair_Curly', c, 0.68, nstr=0.35)
    from hair import fib_dirs
    blobs = fib_dirs(90, lambda d: d.z > -0.35, seed=59)
    keep = head_edge(bang_line(0.5, scallop=-0.06, n=7, lift_sides=0.16), back_z=-0.3, ear_z=0.0)
    def th(d):
        b = 0.0
        for q in blobs:
            x = 1 - d.dot(q)
            if x < 0.03:
                b = max(b, 0.016 * (1 - x / 0.03) ** 2)
        return 0.018 + 0.012 * _sm((d.z - 0.2) / 0.7) + b
    return [finish('hair', [cap('cap', keep, th, m, seg=160, rings=100)], m, voxel=0.0028, smooth=3, tris=8000)]


def H_buns(c='#1f1b24'):
    """มวยคู่: ผมหวีขึ้นไปรวมที่มวยสองข้าง (ร่องผมวิ่งเข้าหามวย) · มวยเป็นก้อนแป้นร่องก้นหอย · ยางรัดโคนมวย"""
    m = hair_mat('MAT_Hair_Buns', c, 0.5)
    tie = fab('MAT_Hair_BunTie', '#ffcf3f', None, 0.5)
    dirs = [sph(60 * sx, 56) for sx in (1, -1)]
    frs = [frame_of(d) for d in dirs]
    keep = head_edge(bang_line(0.47, scallop=-0.05, n=5, lift_sides=0.2), back_z=-0.36, ear_z=0.0)
    def th(d):
        fr = frs[0] if d.x >= 0 else frs[1]
        return 0.011 + 0.006 * _sm((d.z - 0.3) / 0.6) + grooves(d, fr, 16, 0.003, start=0.15)
    parts = [cap('cap', keep, th, m)]
    extra = []
    for sx, d in zip((1, -1), dirs):
        b, n = surf(d)
        up = (n * 0.6 + V((0, 0, 1)) * 0.4).normalized()
        parts.append(knot('bun', m, b + up * 0.004, up, r=0.07, h=0.066, twist=1.6 * sx, groove=0.01, grooves_n=6))
        tb = tube_arc('tie', (0, 0, 0), 0.058, 0.008, 0, 2 * math.pi, tie, H, plane='XY', seg=32, tseg=8, rigid='Head')
        tb.data.transform(Matrix.Translation(b + up * 0.016) @ V((0, 0, 1)).rotation_difference(up).to_matrix().to_4x4())
        extra.append(tb)
    return [finish('hair', parts, m, voxel=0.0026, smooth=3, tris=6000)] + extra


def H_braid(c='#b36b2c'):
    """เปียข้าง: ผมหวีไปรวมใต้หูขวา (ร่องผมวิ่งเข้าจุดรวบ) · หน้าม้าปัดข้าง · เปียถักสามเส้นสลับจริงพาดหน้าไหล่ · ยางรัด · ปลายพู่"""
    m = hair_mat('MAT_Hair_Braid', c, 0.55)
    tie = fab('MAT_Hair_BraidTie', '#3fa36b', None, 0.6)
    G = V((-0.168, -0.035, 0.705))
    fr = frame_of((G - HC).normalized())
    keep = head_edge(bang_line(0.44, scallop=-0.04, n=3, lift_sides=0.16, tilt=-0.12), back_z=-0.34, ear_z=0.02)
    def th(d):
        sweep_ = 0.008 * _sm((-d.y - 0.2) / 0.5) * _sm((d.x + 0.1) / 0.5)
        return 0.011 + 0.008 * _sm((d.z - 0.3) / 0.6) + sweep_ + grooves(d, fr, 18, 0.003, start=0.1)
    top = cap('cap', keep, th, m)
    # โคนรวบ: ก้อนผมที่รวบใต้หู (เชื่อมผมกับเปีย)
    bm = bmesh.new()
    sweep(bm, smooth_path([G + V((0.02, 0.015, 0.03)), G + V((0.0, -0.006, 0.0)), G + V((-0.006, -0.03, -0.05))], 2), 0.05, 0.042,
          w1=0.75, h1=0.75, k=16, taper=1.0, up_fn=lambda p: V((-1, 0, 0)))
    gather = bm_obj(bm, m, 'gather')
    axis = smooth_path([G + V((-0.006, -0.024, -0.04)), V((-0.176, -0.08, 0.62)), V((-0.178, -0.096, 0.56)), V((-0.172, -0.104, 0.5)),
                        V((-0.164, -0.106, 0.445))], 1)
    dense = []
    for i in range(len(axis) - 1):
        for k in range(12):
            dense.append(axis[i].lerp(axis[i + 1], k / 12))
    dense.append(axis[-1])
    dense = smooth_path(dense, 3)
    plait = hair_mat('MAT_Hair_Braid_Plait', c, 0.55, nstr=0.45)
    plait['eq_uvmode'] = 'keep'
    bb = bmesh.new()
    for path in braid_strands(dense, width=0.046, depth=0.03, r0=0.02, r1=0.012, cycles=4.5):
        sweep(bb, path, 0.032, 0.024, w1=0.62, h1=0.62, k=14, taper=1.0, up_fn=lambda p: V((p.x, p.y, 0)).normalized(), uv=True)
    end = dense[-1]
    T = (dense[-1] - dense[-4]).normalized()
    tuft = bmesh.new()   # ปลายพู่หลังยางรัด: ก้อนเรียวมน
    sweep(tuft, smooth_path([end - T * 0.004, end + T * 0.02, end + T * 0.045], 1), 0.03, 0.026, w1=0.25, h1=0.3, k=14, taper=0.8,
          up_fn=lambda p: V((-1, 0, 0)))
    tb = tube_arc('tie', (0, 0, 0), 0.0135, 0.0055, 0, 2 * math.pi, tie, H, plane='XY', seg=16, tseg=6, rigid='Head')
    tb.data.transform(Matrix.Translation(end + T * 0.002) @ V((0, 0, 1)).rotation_difference(T).to_matrix().to_4x4())
    return [finish('hair', [top, gather, bm_obj(tuft, m, 'tuft')], m, tris=5600), bm_obj(bb, plait, 'plait'), tb]


def H_spiky(c='#3f8bff'):
    """ผมชี้: ก้อนผมทรงเปลวไฟโค้งขึ้นแล้วเอนไปหลัง ปลายมน (ไม่แหลมเป็นหนาม) ซ้อน 3 แถว · ฐานกลืนกับหมวกผม"""
    m = hair_mat('MAT_Hair_Spiky', c, 0.5)
    fr = frame_of(CROWN)
    keep = head_edge(bang_line(0.5, scallop=-0.06, n=4, lift_sides=0.2), back_z=-0.3, ear_z=0.02)
    th = lambda d: 0.012 + 0.01 * _sm((d.z - 0.2) / 0.7) + grooves(d, fr, 14, 0.003)
    objs = [cap('cap', keep, th, m)]
    bm = bmesh.new()
    rows = [(50, (-48, 0, 48), 0.125, 0.11), (66, (-115, -60, 60, 115), 0.135, 0.115), (80, (-160, -95, -30, 30, 95, 160), 0.125, 0.115),
            (36, (-140, 140, 180), 0.1, 0.115)]
    for el, azs, L, w in rows:
        for az in azs:
            d = sph(az, el)
            p0, n = surf(d, -0.022)
            s = math.sin(math.radians(az))
            back = V((s * 0.5, 0.9, 0.0)).normalized()
            pts = lock_path(p0, [n, (n * 0.6 + V((0, 0, 1)) * 0.5 + back * 0.2), (V((0, 0, 0.5)) + back).normalized()], L)
            lat = V((math.cos(math.radians(az)), math.sin(math.radians(az)), 0))   # ความกว้างตามแนวรอบศีรษะ (มองจากหน้าเห็นเต็มเปลว)
            sweep(bm, pts, w, w * 0.48, w1=0.24, h1=0.34, k=16, taper=0.8, side=lat)
    objs.append(bm_obj(bm, m, 'locks'))
    return [finish('hair', objs, m, voxel=0.0034, smooth=6, tris=6500)]
