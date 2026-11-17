"""
Loy Krathong Festival 2026 (เทศกาลลอยกระทง 2569) — ของรางวัลกิจกรรม (โมเดล 3D จริง สวมได้ทุกชิ้น)
Login 7 วัน: ดอกลีลาวดีทัดหู · รองเท้าแตะสาน · เสื้อคอจีนผ้าฝ้ายย้อมคราม · ร่มบ่อสร้าง · ผ้าขาวม้าพาดบ่า · พวงมาลัยมะลิ
             · ชุดคืนเพ็ญเดือนสิบสอง (เสื้อผ้าไหมแขนกระบอก + โจงกระเบน + กระทงลอยรอบตัว)
เควสต์การเรียน: เข็มกลัดดอกบัว · (พื้นหลังโปรไฟล์ "สายน้ำคืนเพ็ญ" = ภาพ 2D)
รูปทรงอินทรีย์ (กลีบดอกลีลาวดี/บัว/กุหลาบ ดอกมะลิตูม ใบตองพับกลีบบัว ปมผ้า เท้า) = ผิวกลีบ/ผิวโค้งจริง หลอมด้วย voxel remesh
+ smooth (fuse — วิธีเดียวกับทรงผม v3 และฟักทองฮาโลวีน) · เสื้อผ้าใช้แพตเทิร์นจริงใน garments.py · ไม่มีเครื่องทรง/ชฎา/ชุดพระ
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

from eqdetail import delete_where, disc, edge_trim, fab, flat_patch, polyline, ring, solidify, tube_open
from eqlib import (G_ARM_L, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, STYLE, _obj_from_bm, capsule, ellipsoid, style_warp, tube_path)
from garments import ANK, HIP, KNEE, _sole_outline, mat_metal, neck_band, shirt_body, sleeves, sole, yoke_surface
from hair import HC, fuse, smooth_path, sph
from items_halloween import _organic

V = Vector
H = ['Head']
TAU = 2 * math.pi


# =====================================================================
# ตัวช่วย: ผิวกลีบ/แผ่นผ้า · หลอมรวม · ย้อมสีตามตำแหน่ง · วางบนผิวเสื้อ
# =====================================================================
def _basis(n):
    n = V(n).normalized()
    a = n.orthogonal().normalized()
    return n, a, n.cross(a).normalized()


def _sheet(name, P, nu, nv, m, bones=H, rigid='Head', thick=0.0, offset=0.0, mats=None):
    """ผิวกริดจากฟังก์ชัน P(u, v) (u, v ∈ [0,1]) — กลีบดอก/ใบ/แผ่นผ้า · ปลายแหลม (ความกว้าง 0) ถูกเชื่อมจุดอัตโนมัติ
    mats(u, v) -> index ของ material ต่อ face (ลายตาผ้า)"""
    bm = bmesh.new()
    g = [[bm.verts.new(P(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]))
            if mats:
                f.material_index = mats((i + 0.5) / nu, (j + 0.5) / nv)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, m if not isinstance(m, (list, tuple)) else m[0], bones, rigid)
    if isinstance(m, (list, tuple)):
        for mm in m[1:]:
            ob.data.materials.append(mm)
    if thick:
        solidify(ob, thick, offset=offset)
    return ob


def _ribbon(name, pts, nrm, w, h, m, bones, rigid=None, caps=True):
    """ริบบิ้น/เส้นตอกแบน (หน้าตัดสี่เหลี่ยม w×h) ตามเส้น pts โดยหน้ากว้างหันตาม nrm (normal ของผิวที่วางทับ)"""
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        nn = (nrm[i] - t * nrm[i].dot(t)).normalized()
        s = t.cross(nn).normalized()
        rings.append([bm.verts.new(p + s * (sx * w / 2) + nn * (sy * h / 2)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rings, rings[1:]):
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, m, bones, rigid)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def _organic_skin(name, objs, m, bones, voxel=0.0016, smooth=3, tris=1200):
    """หลอมรวมแบบเดียวกับ _organic แต่เป็นชิ้นที่ skin ตามผิว (เท้า) — ไม่ rigid"""
    ob = fuse(name, objs, m, voxel=voxel, smooth=smooth, target_tris=tris)
    ob['eq_bones'] = ','.join(bones)
    for k in ('eq_rigid', 'eq_hair'):
        if k in ob:
            del ob[k]
    return ob


def _relax(ob, it=6, lam=0.4):
    """เกลาผิวหลังลด polygon (decimate ทิ้งสันแหลมเป็นฟันเลื่อยบนผิวที่มีปุ่มถี่ เช่น ดอกตูม) — Laplacian เบา ๆ"""
    from eqlib import apply_mods
    sm = ob.modifiers.new('relax', 'LAPLACIANSMOOTH')
    sm.iterations = it; sm.lambda_factor = lam; sm.use_volume_preserve = False   # (รักษาปริมาตร = ขยายทั้งชิ้น → วงพวงพองออก)
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def _uniform(objs, anchor, k=None):
    """ชิ้นแข็งขนาดใหญ่ที่ยื่นข้ามช่วงคอ (ร่ม): แปลงสัดส่วนแบบสม่ำเสมอรอบจุด anchor แทนสนาม style_warp
    (สนามผสมหัว/ลำตัวที่ช่วงคอจะดัดก้านร่มให้งอ) แล้วตั้ง eq_warped ไม่ให้ skin() แปลงซ้ำ"""
    k = k or (STYLE['KX'] + STYLE['KB']) / 2
    A = V(anchor)
    Aw = style_warp(A)
    for ob in objs:
        for v in ob.data.vertices:
            v.co = Aw + (v.co - A) * k
        ob.data.update()
        ob['eq_warped'] = 1
    return objs


def _lin(h):
    return tuple(((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5))


def _sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _vnoise(p, f, seed=0):
    """value noise 3D (ลายย้อมมือ) — คืน 0..1"""
    x, y, z = p.x * f, p.y * f, p.z * f
    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = _sm(x - i), _sm(y - j), _sm(z - k)

    def h(a, b, c):
        n = (a * 374761393 + b * 668265263 + c * 2147483647 + seed * 1274126177) & 0xffffffff
        n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
        return (n ^ (n >> 16)) / 4294967295.0
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                out += w * h(i + dx, j + dy, k + dz)
    return out


_SHELL = {}
def _on_shell(x, z, back=False, off=0.0, lift=0.0045):
    """จุดบนผิวนอกของลำตัวเสื้อ (torso_shell + ความหนา 4.5 มม.) ที่ตำแหน่ง x, z ด้านหน้า/หลัง → (จุด, normal)"""
    key = round(off, 4)
    if key not in _SHELL:
        P = yoke_surface(off)
        pts = []
        for i in range(181):
            phi = -math.pi + TAU * i / 180
            for k in range(140):
                s = k * 0.004
                pts.append((phi, s, P(phi, s)[0]))
        _SHELL[key] = (P, pts)
    P, pts = _SHELL[key]
    best = None
    for phi, s, p in pts:
        if (p.y > 0) != back:
            continue
        d = (p.x - x) ** 2 + (p.z - z) ** 2
        if best is None or d < best[0]:
            best = (d, phi, s)
    _, phi, s = best
    for _ in range(3):   # เกลา (phi, s) ให้ตรงตำแหน่ง
        p, n = P(phi, s)
        dp = P(phi + 0.01, s)[0] - p
        ds = P(phi, s + 0.002)[0] - p
        ex, ez = x - p.x, z - p.z
        a11, a12, a21, a22 = dp.x / 0.01, ds.x / 0.002, dp.z / 0.01, ds.z / 0.002
        det = a11 * a22 - a12 * a21
        if abs(det) < 1e-9:
            break
        phi += (ex * a22 - a12 * ez) / det
        s = max(0.0, s + (a11 * ez - a21 * ex) / det)
    p, n = P(phi, s)
    return p + n * lift, n


# =====================================================================
# Day 1 — ดอกลีลาวดีทัดหู (Frangipani Hair Flower) · ช่อ 3 ดอก + ใบ 2 ใบ ทัดเหนือหูขวา (ไม่ครอบศีรษะ → ไม่ตัดผม)
# =====================================================================
_FRANGI = []   # (ศูนย์ดอก, normal, รัศมี) ในพิกัดต้นแบบ — ใช้ย้อมไล่สีเหลืองกลางดอก


def _frangipani(c, n, R, rot, m):
    """ดอกลีลาวดี: 5 กลีบรูปไข่กลับ ซ้อนเหลื่อมกันแบบกังหัน (ขอบหนึ่งยก อีกขอบกด) โค้งเป็นแอ่ง ปลายกลีบงอนกลับ
    · โคนกลีบรวมเป็นหลอดดอกยื่นไปด้านหลัง"""
    n, a, b = _basis(n)
    objs = []
    for k in range(5):
        th = rot + TAU * k / 5
        e = a * math.cos(th) + b * math.sin(th)
        s = n.cross(e)

        def P(u, v, e=e, s=s):
            r = 0.0028 + (R - 0.0028) * u
            t = max(0.0, (u - 0.42) / 0.58)
            w = R * 0.5 * (0.26 + 0.74 * u ** 0.6) * math.sqrt(max(0.0, 1 - t ** 2.4))
            x = (2 * v - 1) * w + 0.12 * R * (1 - u)
            z = -0.0085 * (1 - u) ** 2.2 + 0.3 * x * x / R + 0.2 * x * u - 0.004 * max(0.0, (u - 0.7) / 0.3) ** 2
            return c + e * r + s * x + n * z
        objs.append(_sheet('petal', P, 10, 6, m, thick=0.0026))
    objs.append(capsule('tube', c - n * 0.017, c - n * 0.004, 0.0042, 0.0032, m, H, seg=10, rings=6, rigid='Head'))
    return objs


def _leaf(base, d, up, L, W, m, droop=0.012, bones=H, rigid='Head', thick=0.0024, nu=12):
    """ใบรูปหอก: เส้นกลางใบพับเป็นร่อง V · โค้งตามผิวศีรษะ/ผิวที่วาง"""
    d = V(d).normalized()
    s = V(up).cross(d).normalized()
    nn = d.cross(s).normalized()

    def P(u, v):
        x = 2 * v - 1
        w = W * math.sin(math.pi * min(1.0, 0.06 + u * 0.94)) ** 0.8
        return base + d * (L * u) + s * (x * w) + nn * (0.28 * abs(x) * w - droop * u * u)
    return _sheet('leaf', P, nu, 4, m, bones=bones, rigid=rigid, thick=thick)


def C_lk_frangipani():
    m = fab('MAT_LK26_Frangipani', '#fffaf0', None, 0.55)
    lf = fab('MAT_LK26_Frangipani_Leaf', '#3d7a36', 'leather', 0.5, nstr=0.25)
    d0 = sph(-94, 22)
    up = V((0, 0, 1))
    t_up = (up - d0 * d0.dot(up)).normalized()
    fw = V((0, -1, 0))
    t_fw = fw - d0 * d0.dot(fw)
    t_fw = (t_fw - t_up * t_fw.dot(t_up)).normalized()
    spec = [((0.04, -0.07), 0.24, 0.044, 0.3), ((0.16, 0.15), 0.233, 0.038, 1.2), ((-0.13, 0.13), 0.232, 0.035, 2.1)]
    _FRANGI.clear()
    flowers, stems = [], []
    K = HC + (d0 - t_fw * 0.06).normalized() * 0.206
    for (du, df), rad, R, rot in spec:
        dr = (d0 + t_up * du + t_fw * df).normalized()
        c = HC + dr * rad
        n = (dr + (dr - d0) * 1.4 + t_fw * 0.55).normalized()
        flowers += _frangipani(c, n, R, rot, m)
        _FRANGI.append((c, n, R))
        stems.append(capsule('stem', K, c - n * 0.013, 0.0034, 0.003, lf, H, seg=8, rings=4, rigid='Head'))
    fl = _organic('flowers', flowers, m, H, 'Head', voxel=0.0011, smooth=2, tris=3600)
    green = stems + [ellipsoid('knot', K, (0.009, 0.009, 0.009), lf, H, seg=12, rings=8, rigid='Head')]
    rK = (K - HC).normalized()
    for dd, L in ((-t_fw + t_up * 0.5, 0.095), (-t_fw - t_up * 0.25, 0.085)):
        green.append(_leaf(K + rK * 0.01, dd, rK, L, 0.017, lf, droop=0.019))
    gr = _organic('leaves', green, lf, H, 'Head', voxel=0.0011, smooth=2, tris=1000)
    return [fl, gr]


def frangipani_tint(ob):
    """ไล่สีเหลืองทองกลางดอก → ขาวนวลที่ปลายกลีบ (ลีลาวดีจริง)"""
    KH = STYLE['KH']
    cs = [(style_warp(c, True), n, R * KH) for c, n, R in _FRANGI]
    y = _lin('#ffc23a')
    w = _lin('#fffaf0')
    mult = tuple(y[i] / max(1e-4, w[i]) for i in range(3))

    def fn(p):
        k = 1.0
        for c, n, R in cs:
            q = p - c
            al = q.dot(n)
            if -0.022 * KH < al < 0.012 * KH:
                rad = (q - n * al).length
                k = min(k, _sm((rad / R - 0.1) / 0.42))
        return tuple(mult[i] + (1 - mult[i]) * k for i in range(3))
    _tint_mat_exact(ob, 'MAT_LK26_Frangipani', fn)


def _tint_mat_exact(ob, name, fn):
    me = ob.data
    ca = me.color_attributes.get('AO')
    if ca is None:
        return
    vs = set()
    for p in me.polygons:
        mm = me.materials[p.material_index] if p.material_index < len(me.materials) else None
        if mm is not None and mm.name == name:
            vs.update(p.vertices)
    mw = ob.matrix_world
    for i in vs:
        r, g, b = fn(mw @ me.vertices[i].co)
        c = ca.data[i].color
        ca.data[i].color = (c[0] * r, c[1] * g, c[2] * b, 1)


# =====================================================================
# Day 2 — รองเท้าแตะสาน (Woven Sandals) · สายคาดหน้าเท้าสานขัดจริง (ตอกแบนขัดลายสอง) · พื้นรองสาน + ขอบเปียถัก · พื้นยาง
# =====================================================================
def _arch(sx, y, cl=0.0045):
    """เส้นโค้งของสายคาดหน้าเท้าที่ระดับ y: ลงจากพื้นรองด้านนอก → โค้งข้ามหลังเท้า (ผิวทรงรีของเท้า + ระยะห่าง) → ลงพื้นรองด้านใน
    คืน [(จุด, normal)] ที่ระยะทางเท่า ๆ กัน (หนาแน่นพอ) และความยาวรวม"""
    cx, cy, cz = 0.066 * sx, -0.026, 0.039
    k = math.sqrt(max(0.05, 1 - ((y - cy) / 0.07) ** 2))
    rx, rz = 0.043 * k + cl, 0.024 * k + cl
    raw = [(V((cx + rx, y, 0.013)), V((1, 0, 0)))]
    for i in range(1, 6):
        raw.append((V((cx + rx, y, 0.013 + (cz - 0.013) * i / 6)), V((1, 0, 0))))
    for i in range(41):
        a = math.pi * i / 40
        p = V((cx + rx * math.cos(a), y, cz + rz * math.sin(a)))
        nrm = V((math.cos(a) / rx, 0, math.sin(a) / rz)).normalized()
        raw.append((p, nrm))
    for i in range(1, 7):
        raw.append((V((cx - rx, y, cz - (cz - 0.013) * i / 6)), V((-1, 0, 0))))
    acc = [0.0]
    for i in range(1, len(raw)):
        acc.append(acc[-1] + (raw[i][0] - raw[i - 1][0]).length)
    return raw, acc


def _arch_at(raw, acc, s):
    s = max(0.0, min(acc[-1], s))
    i = 1
    while i < len(acc) - 1 and acc[i] < s:
        i += 1
    t = (s - acc[i - 1]) / max(1e-9, acc[i] - acc[i - 1])
    return raw[i - 1][0].lerp(raw[i][0], t), raw[i - 1][1].lerp(raw[i][1], t).normalized()


def S_lk_sandals():
    straw = fab('MAT_LK26_Sandal_Straw', '#d8b06a', 'straw', 0.8)
    dark = fab('MAT_LK26_Sandal_Weave', '#7a4a24', 'straw', 0.75)
    bed = fab('MAT_LK26_Sandal_Bed', '#e2c58c', 'straw', 0.85)
    trim = fab('MAT_LK26_Sandal_Binding', '#5a3418', 'leather', 0.55)
    rub = fab('MAT_LK26_Sandal_Sole', '#3a2a20', 'tread', 0.85)
    skin = fab('MAT_Skin_LK26Foot', '#e8b48c', None, 0.55)   # MAT_Skin* = ย้อมตามสีผิวผู้ใช้
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += sole(sx, rub, h=0.007)
        fb = sole(sx, bed, h=0.007, lip=trim)
        for o in fb:
            o.data.transform(Matrix.Translation((0, 0, 0.0065)))
        out += fb
        # เท้า (ย้อมสีผิว) — ฝ่าเท้า + นิ้วเท้า 5 นิ้ว หลอมเป็นผิวเดียว (นิ้วโป้งอยู่ด้านใน)
        parts = [ellipsoid('foot', (0.066 * sx, -0.024, 0.037), (0.042, 0.068, 0.022), skin, leg, seg=24, rings=12)]
        for k in range(5):
            x = 0.066 * sx - sx * (0.029 - k * 0.0145)
            r = 0.0105 - k * 0.0011
            parts.append(ellipsoid('toe', (x, -0.088 + k * 0.0035, 0.0215 + r * 0.6), (r * 0.9, r * 1.15, r * 0.85), skin, leg, seg=12, rings=8))
        out.append(_organic_skin('foot', parts, skin, leg, voxel=0.0018, smooth=3, tris=900))
        # สายคาดสาน: เส้นยืน 4 เส้น (สลับสีอ่อน/เข้ม) วิ่งข้ามหลังเท้า · เส้นพุ่ง (ตอกสีอ่อน) วิ่งตามแนวหน้า-หลัง สอดขัดขึ้นลง
        q = 0.0115
        y0 = -0.078
        ny = 4
        A = 0.0011
        raws = {}
        for j in range(ny):
            y = y0 + j * q
            raw, acc = _arch(sx, y)
            raws[j] = (raw, acc)
            p_ = q
            nseg = int(acc[-1] / (p_ / 2))
            pts, nrm = [], []
            for i in range(nseg + 1):
                s = acc[-1] * i / nseg
                pt, nn = _arch_at(raw, acc, s)
                pts.append(pt + nn * (A * math.sin(math.pi * s / p_) * (-1) ** j))
                nrm.append(nn)
            out.append(_ribbon('warp', pts, nrm, q * 0.9, 0.0017, dark if j % 2 else straw, leg))
        L0 = raws[0][1][-1]
        nweft = int(L0 / q)
        for i in range(nweft):
            pts, nrm = [], []
            for kk in range(10):
                y = y0 - 0.004 + (ny - 1) * q * kk / 9 + 0.008 * kk / 9
                raw, acc = _arch(sx, y)
                s = acc[-1] * (i + 0.5) / nweft
                pt, nn = _arch_at(raw, acc, s)
                pts.append(pt + nn * (-A * math.cos(math.pi * (y - y0) / q) * (-1) ** i))
                nrm.append(nn)
            out.append(_ribbon('weft', pts, nrm, q * 0.82, 0.0015, straw, leg))
        # ขอบกุ (หนัง) ทั้งสองข้างของสายคาด
        for y in (y0 - q * 0.62, y0 + (ny - 1) * q + q * 0.62):
            raw, acc = _arch(sx, y, cl=0.0048)
            pts = [_arch_at(raw, acc, acc[-1] * i / 30)[0] for i in range(31)]
            out.append(polyline('binding', pts, 0.0024, trim, leg, tseg=5))
    return out


# =====================================================================
# Day 3 — เสื้อคอจีนผ้าฝ้ายย้อมคราม (Indigo Cotton Shirt) · คอจีนตั้ง · สาบหน้า · กระดุมผ้าผูกปม (กระดุมจีน) + ห่วงผ้า
# · กระเป๋าปะล่าง 2 ใบ · ด้ายเย็บสีอ่อน · ลายย้อมมือ (ด่างจาง ๆ แบบผ้าย้อมคราม)
# =====================================================================
def _knot_button(c, n, r, m, bone):
    """กระดุมผ้าผูกปม (กระดุมจีน): เชือกผ้าพันเป็นปมกลม (ห่วง 3 วงตั้งฉากกัน) หลอมเป็นผิวเดียว เห็นร่องเชือก"""
    n, a, b = _basis(n)
    objs = []
    for ax1, ax2, ph in ((a, b, 0.0), (b, n, 0.6), (n, a, 1.2)):
        pts = [c + (ax1 * math.cos(t) + ax2 * math.sin(t)) * r * (1 + 0.12 * math.sin(3 * t + ph)) for t in [TAU * i / 18 for i in range(18)]]
        objs.append(tube_path('knot', pts, r * 0.45, m, [bone], closed=True, tseg=6, rigid=bone))
    return _organic('knot_btn', objs, m, [bone], bone, voxel=0.0006, smooth=1, tris=150)


def T_lk_indigo():
    m = fab('MAT_LK26_Indigo', '#2e4f86', 'weave', 0.88, nstr=0.5)
    cord = fab('MAT_LK26_Indigo_Cord', '#1d355f', 'weave', 0.75)
    st = fab('MAT_Stitch_LK26Indigo', '#9fb3d8', None, 0.7)
    parts = shirt_body(m, neck='crew', neck_trim=None) + sleeves(m, 'long', trim=cord)
    # คอจีน: ปกตั้งตรงสูง 2.4 ซม. เปิดหน้า · ด้ายเย็บรอบปก
    parts += neck_band(m, off=0.0, neck_r=0.06, h=0.024, lean=-0.004, gap=0.008, name='mandarin')
    P = yoke_surface(0.0)
    # สาบหน้า (แถบผ้าแบนตามผิวเสื้อกลางอก) + ตะเข็บสองข้าง
    ss = [k * 0.004 for k in range(200)]
    s_hem = max(s for s in ss if P(math.pi, s)[0].z > 0.236)
    rows = [P(math.pi, s) for s in [0.004 + (s_hem - 0.004) * i / 40 for i in range(41)]]
    bm = bmesh.new()
    vv = []
    for p, n in rows:
        side = V((1, 0, 0))
        vv.append([bm.verts.new(p + n * 0.005 + side * (k * 0.011)) for k in (-1, 0, 1)])
    for r0, r1 in zip(vv, vv[1:]):
        for k in range(2):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    pl = _obj_from_bm('placket', bm, m, G_TORSO)
    solidify(pl, 0.0022, offset=0.0)
    parts.append(pl)
    for sxx in (1, -1):
        parts.append(polyline('placket_st', [p + n * 0.0068 + V((0.0085 * sxx, 0, 0)) for p, n in rows[1:-1]], 0.0006, st, G_TORSO, tseg=3))
    # กระดุมจีน 5 เม็ด: ปมผ้า (ขวา) + ห่วงผ้าโค้งจากฝั่งซ้ายมาคล้อง
    for i in range(5):
        s = 0.03 + (s_hem - 0.075) * i / 4
        p, n = P(math.pi, s)
        bone = ['Chest'] if p.z > 0.44 else ['Spine']
        rb = 'Chest' if p.z > 0.44 else 'Spine'
        kc = p + n * 0.0115 + V((0.005, 0, 0))
        parts.append(_knot_button(kc, n, 0.0042, cord, rb))
        loop = [p + n * 0.0075 + V((-0.019, 0, 0.0034)), p + n * 0.0098 + V((-0.004, 0, 0.0052)), kc + V((0.006, 0, 0.002)),
                kc + V((0.006, 0, -0.002)), p + n * 0.0098 + V((-0.004, 0, -0.0052)), p + n * 0.0075 + V((-0.019, 0, -0.0034))]
        parts.append(polyline('frog_loop', smooth_path(loop, 1), 0.0019, cord, bone, rigid=rb, tseg=5))
    # กระเป๋าปะล่าง 2 ใบ (เสื้อม่อฮ่อม/คอจีนผ้าฝ้าย) + ตะเข็บปากกระเป๋า
    from eqdetail import outline_rect
    for sxx in (1, -1):
        p, n = _on_shell(0.072 * sxx, 0.315, lift=0.0048)
        parts.append(flat_patch('pocket', outline_rect(0.052, 0.054, 0.006), 0.0028, p, n, m, ['Spine', 'Hips'], bevel=0.3))
        parts.append(polyline('pocket_st', [p + n * 0.0036 + V((-0.021, 0, 0.019)), p + n * 0.0036 + V((0.021, 0, 0.019))], 0.0008, st, ['Spine'], tseg=3))
    # ตะเข็บข้างลำตัว + ตะเข็บไหล่
    for sxx in (1, -1):
        parts.append(polyline('side_seam', [V((0.1475 * sxx, 0.0, 0.235)), V((0.1475 * sxx, 0.0, 0.33)), V((0.1475 * sxx, 0.0, 0.44))], 0.0009, st, G_TORSO, tseg=3))
    return parts


def indigo_tint(ob):
    """ลายย้อมคราม: ด่างอ่อน-เข้มแบบย้อมมือ (noise 2 ความถี่ + เส้นจาง ๆ ตามแนวตั้ง) ±7%"""
    def fn(p):
        k = 0.9 + 0.16 * _vnoise(p, 9.0, 3) + 0.06 * _vnoise(p, 23.0, 7) - 0.03 * (0.5 + 0.5 * math.sin(p.x * 70 + 3 * _vnoise(p, 6.0, 5)))
        return (k * 0.98, k, min(1.08, k * 1.02))
    _tint_mat_exact(ob, 'MAT_LK26_Indigo', fn)


# =====================================================================
# Day 4 — ร่มบ่อสร้าง (Bo Sang Paper Umbrella) · ร่มกระดาษสาเขียนลายดอกไม้ กางพิงหลัง
#  โครงไม้ไผ่: ซี่ร่ม 24 ซี่ + ซี่ค้ำ + ด้ายถักสีรอบหัวร่ม (เอกลักษณ์บ่อสร้าง) · กระดาษจีบระหว่างซี่ ขอบเว้า · ก้าน+ด้ามไม้ · เชือกสะพาย
# =====================================================================
def K_lk_umbrella():
    paper = fab('MAT_LK26_Umbrella_Paper', '#d9442e', 'canvas', 0.75, nstr=0.25)
    bamboo = fab('MAT_LK26_Umbrella_Bamboo', '#c9a064', 'weave', 0.6, nstr=0.2)
    wood = fab('MAT_LK26_Umbrella_Wood', '#7a4a26', 'leather', 0.5, nstr=0.2)
    thr1 = fab('MAT_LK26_Umbrella_Thread', '#2fa36b', None, 0.6)
    thr2 = fab('MAT_LK26_Umbrella_Thread2', '#f2c230', None, 0.6)
    pet = fab('MAT_LK26_Umbrella_Paint', '#fff4f2', None, 0.7)
    pet2 = fab('MAT_LK26_Umbrella_Paint2', '#ffb3c1', None, 0.7)
    ctr = fab('MAT_LK26_Umbrella_PaintC', '#ffd23f', None, 0.6)
    br = fab('MAT_LK26_Umbrella_Branch', '#4a2a18', None, 0.7)
    cordm = fab('MAT_LK26_Umbrella_Cord', '#8a5a2b', 'canvas', 0.8)
    # ออกแบบในพิกัดต้นแบบ แล้วย่อแบบสม่ำเสมอ (_uniform) — ก้านพาดจากหลังเอวขึ้นไปด้านหลัง-บน หลังคาร่มอยู่หลังศีรษะ
    tilt = math.radians(36)
    base = V((-0.06, 0.128, 0.285))
    ax = V((-0.2, math.sin(tilt), math.cos(tilt))).normalized()
    Lsh = 0.8
    apex = base + ax * Lsh
    R, depth, NR = 0.3, 0.08, 24
    n, e1, e2 = _basis(ax)
    sub, nrad = 2, 11

    def canopy_pt(th, rho, sag=True):
        f = (th / (TAU / NR)) % 1.0
        sc = math.sin(math.pi * f)
        rr = rho * (1 - 0.03 * sc * (rho / R) ** 3)                 # ขอบเว้าระหว่างซี่
        h = depth * (rho / R) ** 1.55 + (0.006 * sc * (rho / R) if sag else 0.0)   # กระดาษหย่อนระหว่างซี่
        return apex - n * h + (e1 * math.cos(th) + e2 * math.sin(th)) * rr
    # หลังคาร่ม (กระดาษ) — ผิวเดียว 2 หน้า (วัสดุไม่ cull หลัง)
    bm = bmesh.new()
    na = NR * sub
    rings = [[bm.verts.new(canopy_pt(TAU * j / na, R * (0.02 + 0.98 * (i / nrad) ** 0.9))) for j in range(na)] for i in range(nrad + 1)]
    for i in range(nrad):
        for j in range(na):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % na], rings[i + 1][(j + 1) % na], rings[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    can = _obj_from_bm('canopy', bm, paper, ['Chest'], 'Chest')
    if sum(p.normal.dot(n) for p in can.data.polygons) < 0:
        for p in can.data.polygons:
            p.flip()
    parts = [can]
    # ขอบกระดาษพับ (ขอบร่ม) + หมวกหัวร่ม (ไม้) + ด้ายถักสีรอบหัวร่มด้านใน
    parts.append(tube_path('rim', [canopy_pt(TAU * j / na, R) for j in range(na)], 0.0026, paper, ['Chest'], closed=True, tseg=3, rigid='Chest'))
    top = [apex + n * 0.004, apex + n * 0.016, apex + n * 0.026]
    parts.append(capsule('finial', top[0], top[2], 0.011, 0.005, wood, ['Chest'], seg=12, rings=6, rigid='Chest'))
    for rr_, mm in ((0.042, thr1), (0.056, thr2)):
        parts.append(tube_path('thread', [canopy_pt(TAU * j / 36, rr_, sag=False) - n * 0.0035 for j in range(36)], 0.0024, mm, ['Chest'], closed=True, tseg=3, rigid='Chest'))
    # ซี่ร่ม (ใต้กระดาษ) + ซี่ค้ำจากตุ้มรั้ง
    runner = apex - n * 0.2
    for j in range(NR):
        th = TAU * j / NR
        pts = [canopy_pt(th, R * (0.03 + 0.97 * t), sag=False) - n * 0.0028 for t in [i / 6 for i in range(7)]]
        parts.append(tube_path('rib', pts, 0.0019, bamboo, ['Chest'], tseg=3, rigid='Chest'))
        parts.append(tube_path('stretcher', [runner + (e1 * math.cos(th) + e2 * math.sin(th)) * 0.012, canopy_pt(th, R * 0.42, sag=False) - n * 0.004], 0.0015, bamboo, ['Chest'], tseg=3, rigid='Chest'))
    parts.append(capsule('runner', runner - n * 0.012, runner + n * 0.012, 0.013, 0.012, bamboo, ['Chest'], seg=12, rings=4, rigid='Chest'))
    # ก้าน (ไม้ไผ่) + ด้ามจับไม้กลึง + ปลายด้าม
    parts.append(capsule('shaft', base + ax * 0.06, apex, 0.0065, 0.0058, bamboo, ['Chest'], seg=10, rings=4, rigid='Chest'))
    parts.append(capsule('handle', base - ax * 0.02, base + ax * 0.075, 0.0115, 0.0095, wood, ['Chest'], seg=12, rings=6, rigid='Chest'))
    for k in range(3):
        parts.append(ring('handle_ring', base + ax * (0.004 + k * 0.022), ax, 0.0112, 0.0018, cordm, ['Chest'], seg=12, tseg=4, rigid='Chest'))
    # ลายเขียนดอกไม้บนหลังคาร่ม (ดอกท้อ/ซากุระสีขาว-ชมพู เกสรเหลือง + กิ่งไม้) — เขียนบนผิวด้านบน
    def paint_at(th, rho, out=0.0016):
        p = canopy_pt(th, rho)
        d1 = canopy_pt(th + 0.01, rho) - p
        d2 = canopy_pt(th, rho + 0.003) - p
        nn = d1.cross(d2).normalized()
        if nn.dot(n) < 0:
            nn = -nn
        return p + nn * out, nn
    def blossom(th, rho, r, mm):
        p, nn = paint_at(th, rho)
        pts = []
        for i in range(20):
            a = TAU * i / 20
            rr = r * (0.55 + 0.45 * abs(math.cos(5 * a / 2)) ** 0.7)
            pts.append((math.cos(a) * rr, math.sin(a) * rr))
        up_ = (p - apex).normalized()
        o = [flat_patch('blossom', pts, 0.0012, p, nn, mm, ['Chest'], rigid='Chest', up=up_, bevel=0)]
        o.append(flat_patch('pollen', [(math.cos(TAU * i / 8) * r * 0.26, math.sin(TAU * i / 8) * r * 0.26) for i in range(8)], 0.0012, p + nn * 0.0012, nn, ctr, ['Chest'], rigid='Chest', up=up_, bevel=0))
        return o
    for k, (th0, branch) in enumerate(((0.6, [(0.58, 0.33), (0.68, 0.27), (0.8, 0.22), (0.92, 0.19)]), (3.6, [(0.6, 0.32), (0.7, 0.25), (0.78, 0.2)]))):
        bp = [paint_at(th0 + (u - 0.6) * 1.5, R * (r_ * 1.25 + 0.12))[0] for u, r_ in branch]
        parts.append(polyline('branch', smooth_path(bp, 1), 0.003, br, ['Chest'], rigid='Chest', tseg=3))
        for i, (u, r_) in enumerate(branch):
            th = th0 + (u - 0.6) * 1.5 + (0.1 if i % 2 else -0.09)
            r_ = r_ * 1.25 + 0.12
            parts += blossom(th, R * r_ + (0.016 if i % 2 else -0.012), 0.036 - i * 0.003, pet if (i + k) % 2 == 0 else pet2)
    parts += blossom(2.15, R * 0.8, 0.03, pet2) + blossom(5.0, R * 0.74, 0.034, pet) + blossom(1.75, R * 0.5, 0.026, pet)
    _uniform(parts, V((0.0, 0.0, 0.46)))
    # เชือกสะพาย (ผ้าฝ้ายถัก): ผูกก้านร่ม 2 จุด → ข้ามบ่าซ้าย ลงพาดอก → ลอดใต้แขนขวากลับมาที่ก้าน (พิกัดต้นแบบ แปลงสัดส่วนตามตัว)
    tie = base + ax * 0.07
    k_ = (STYLE['KX'] + STYLE['KB']) / 2
    Aw = style_warp(V((0.0, 0.0, 0.46)))
    tp = Aw + (tie - V((0, 0, 0.46))) * k_
    tie_p = V((tp.x / STYLE['KX'], tp.y / STYLE['KX'], tp.z / STYLE['KB']))   # จุดผูกบนก้านร่ม (กลับเป็นพิกัดต้นแบบ)
    strap = [tie_p, V((0.0, 0.122, 0.39)), V((0.06, 0.112, 0.5)), V((0.1, 0.07, 0.575)), V((0.108, -0.02, 0.6)), V((0.085, -0.09, 0.56)),
             V((0.02, -0.124, 0.47)), V((-0.08, -0.118, 0.37)), V((-0.135, -0.03, 0.31)), V((-0.115, 0.08, 0.29)), tie_p + V((0.0, -0.004, -0.012))]
    parts.append(polyline('strap', smooth_path(strap, 2), 0.0042, cordm, ['Chest'], rigid='Chest', tseg=5))
    parts.append(ellipsoid('tie', tie_p + V((0, -0.002, -0.006)), (0.012, 0.01, 0.014), cordm, ['Chest'], seg=10, rings=6, rigid='Chest'))
    return parts


# =====================================================================
# Day 5 — ผ้าขาวม้าพาดบ่า (Pakama Shoulder Cloth) · ผ้าตาหมากรุกพับครึ่ง พาดบ่าซ้ายเฉียงลงสะโพกขวา ผูกปม ชายผ้ามีครุย
# =====================================================================
PK_CELL = 0.0075


def _plaid(u, v):
    """ลายตาผ้าขาวม้า (ตาหมากรุกแดง-เขียว เส้นขาวคั่น) จากระยะ u (ตามยาว) v (ตามขวาง) หน่วยเมตร → index material"""
    def band(x):
        k = int(math.floor(x / PK_CELL)) % 6
        return 'r' if k < 3 else ('g' if k < 5 else 'w')
    a, b = band(u), band(v)
    if a == 'w' or b == 'w':
        return 3
    if a == b == 'r':
        return 0
    if a == b == 'g':
        return 2
    return 1


def _pakama_mats():
    return [fab('MAT_LK26_Pakama', '#c9343c', 'weave', 0.85, nstr=0.45), fab('MAT_LK26_Pakama_Mix', '#6e2a3a', 'weave', 0.85, nstr=0.45),
            fab('MAT_LK26_Pakama_Green', '#2f6b4f', 'weave', 0.85, nstr=0.45), fab('MAT_LK26_Pakama_Line', '#f1ead6', 'weave', 0.85, nstr=0.45)]


def O_lk_pakama():
    M = _pakama_mats()
    fr = fab('MAT_LK26_Pakama_Fringe', '#c9343c', None, 0.85)
    off = 0.024
    P = yoke_surface(off)

    def s_at(phi, z):
        best = None
        for k in range(150):
            s = k * 0.004
            dz = abs(P(phi, s)[0].z - z)
            if best is None or dz < best[0]:
                best = (dz, s)
        return best[1]
    ctrl = [(0.5, None, 0.026), (0.74, 0.515, None), (0.92, 0.43, None), (1.1, 0.355, None), (1.27, 0.3, None), (1.42, 0.285, None),
            (1.6, 0.29, None), (1.8, 0.33, None), (2.0, 0.4, None), (2.2, 0.49, None), (2.36, None, 0.055)]
    cp = [(math.pi * ph, s if s is not None else s_at(math.pi * ph, z)) for ph, z, s in ctrl]
    # Catmull-Rom แบบวง (ปิด) ใน (phi, s) — จุดสุดท้ายต่อกลับจุดแรก (+2π)
    loop = cp + [(cp[0][0] + TAU, cp[0][1])]
    ext = [(loop[-2][0] - TAU, loop[-2][1])] + loop + [(loop[1][0] + TAU, loop[1][1])]
    dense = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in [k / 24 for k in range(24)]:
            t2, t3 = t * t, t * t * t
            dense.append(tuple(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
    # วัดความยาว 3D แล้วสุ่มใหม่ทุก PK_CELL
    P3 = [P(ph, s)[0] for ph, s in dense]
    acc = [0.0]
    for i in range(1, len(P3)):
        acc.append(acc[-1] + (P3[i] - P3[i - 1]).length)
    Ltot = acc[-1] + (P3[0] - P3[-1]).length
    N = int(Ltot / PK_CELL)

    def ps_at(L):
        L = L % Ltot
        i = 1
        while i < len(acc) and acc[i] < L:
            i += 1
        if i >= len(acc):
            return dense[-1]
        t = (L - acc[i - 1]) / max(1e-9, acc[i] - acc[i - 1])
        return tuple(dense[i - 1][c] + (dense[i][c] - dense[i - 1][c]) * t for c in (0, 1))
    W = PK_CELL * 10
    NV = 10
    bm = bmesh.new()
    grid = []
    for i in range(N):
        L = Ltot * i / N
        ph, s = ps_at(L)
        p, nrm = P(ph, s)
        ph2, s2 = ps_at(L + 0.004)
        T = (P(ph2, s2)[0] - p).normalized()
        wv = nrm.cross(T).normalized()
        # Jacobian: เลื่อนตามขวางบนผิว (dφ, ds) ให้ทิศ = wv
        dp = (P(ph + 0.01, s)[0] - p) / 0.01
        dsv = (P(ph, s + 0.003)[0] - p) / 0.003
        a11, a12, a22 = dp.dot(dp), dp.dot(dsv), dsv.dot(dsv)
        b1, b2 = dp.dot(wv), dsv.dot(wv)
        det = a11 * a22 - a12 * a12
        dphi, dss = (b1 * a22 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det
        row = []
        for j in range(NV + 1):
            v = (j / NV - 0.5) * W
            q, qn = P(ph + dphi * v, max(0.0, s + dss * v))
            lift = 0.003 + 0.0022 * (0.5 + 0.5 * math.sin(TAU * L / 0.09 + 2.2 * j / NV)) + 0.0016 * (abs(j / NV - 0.5) * 2) ** 2
            row.append(bm.verts.new(q + qn * lift))
        grid.append(row)
    for i in range(N):
        i2 = (i + 1) % N
        for j in range(NV):
            f = bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j + 1], grid[i][j + 1]))
            f.material_index = _plaid((i + 0.5) * PK_CELL, (j + 0.5) * PK_CELL)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    band = _obj_from_bm('pakama', bm, M[0], G_TORSO)
    for mm in M[1:]:
        band.data.materials.append(mm)
    if sum(p.normal.dot(p.center - V((0, 0, p.center.z))) for p in band.data.polygons) < 0:
        for p in band.data.polygons:
            p.flip()
    solidify(band, 0.0032, offset=-1.0)
    parts = [band]
    # ขอบพับ (ม้วนขอบผ้า) ทั้งสองข้าง — บอกว่าเป็นผ้าพับครึ่งตามยาว
    parts += edge_trim('fold', band, lambda p: True, 0.0021, M[0], G_TORSO, tseg=4, min_len=0.3)
    # ปมผูกที่สะโพกขวาด้านหน้า (ผ้าบิดพันเป็นปม) + ชายผ้า 2 ชายห้อยลง + ครุย
    kph, kz = math.pi * 1.27, 0.3
    kp, kn = P(kph, s_at(kph, kz))
    kc = kp + kn * 0.019
    _, ka, kb = _basis(kn)
    blobs = []
    for t in [i / 22 for i in range(23)]:
        a = TAU * 1.25 * t
        blobs.append(kc + (ka * math.cos(a) * 0.016 + kb * math.sin(a) * 0.019) + kn * (0.005 * math.sin(a * 2)))
    knot_objs = [tube_path('knot', blobs, 0.0105, M[0], ['Hips', 'Spine'], tseg=10), ellipsoid('knot_core', kc, (0.022, 0.014, 0.019), M[0], ['Hips', 'Spine'], seg=16, rings=10)]
    knot = fuse('knot', knot_objs, M[0], voxel=0.0016, smooth=3, target_tris=700)
    knot['eq_bones'] = 'Hips,Spine'
    for k in ('eq_rigid', 'eq_hair'):
        del knot[k]
    for mm in M[1:]:
        knot.data.materials.append(mm)
    for f in knot.data.polygons:
        c = f.center
        f.material_index = _plaid(c.x * 1.3 + c.z * 0.7 + 1.0, c.z * 1.2 - c.y * 0.8 + 1.0)
    parts.append(knot)
    down = V((0, 0, -1))
    for k, (side, ln, sw) in enumerate(((-1, 0.1, 0.0), (1, 0.082, 0.2))):
        start = kc + ka * (0.008 * side) - kn * 0.002 + down * 0.012
        dirv = (down + ka * (0.18 * side) + kn * 0.12).normalized()
        sidev = kn.cross(dirv).normalized()
        TW = 0.05

        def Pt(u, v, start=start, dirv=dirv, sidev=sidev, sw=sw):
            x = (v - 0.5) * TW * (1 + 0.15 * u)
            return start + dirv * (ln * u) + sidev * x + kn * (0.006 * u * u + 0.003 * math.sin(math.pi * v) * u + sw * 0.01 * u)
        tail = _sheet('tail', Pt, 10, 6, M, bones=['Hips', 'Spine'], rigid=None, thick=0.003, offset=0.0,
                      mats=lambda u, v, ln=ln: _plaid(u * ln + 0.004, v * TW + 0.003))
        parts.append(tail)
        for i in range(7):
            v = (i + 0.5) / 7
            a = Pt(1.0, v)
            parts.append(capsule('fringe', a, a + dirv * 0.014 + kn * 0.001, 0.0012, 0.0009, fr, ['Hips', 'Spine'], seg=5, rings=3))
    return parts


# =====================================================================
# Day 6 — พวงมาลัยข้อมือดอกมะลิ (Jasmine Wrist Garland · ข้อมือซ้าย ผูกแบบ acc_bead_bracelet — skin ตามผิวแขน G_ARM_L)
#   มะลิตูมรูปหยดน้ำเรียวปลายแหลม ร้อยเป็นวงสองแถวปลายชี้ออกสลับเฉียงขึ้น/ลง (เห็นเป็นดอกตูมทีละดอก) · กุหลาบแดงดอกเล็ก 1 ดอก
#   · อุบะมะลิ 2 สาย + ริบบิ้น 1 เส้นห้อยด้านนอกข้อมือ (ห่างหลังมือ ไม่จมมือ) · วางใต้ปลายแขนเสื้อแขนยาว (ไม่ชนข้อมือเสื้อ)
# =====================================================================
WRIST_C = V((0.1865, -0.002, 0.268))
WRIST_D = V((0.148, 0, -0.989)).normalized()   # แกนปลายแขน (LowerArm.L ชี้ลง)


def _bud(base, d, L, r, m, bones, tseg=6, nl=6, calyx=None):
    """ดอกมะลิตูม: ผิวหมุนรอบแกน (lathe) โปรไฟล์หยดน้ำ — โคนเรียว พองช่วง 35% แล้วเรียวแหลมที่ปลาย + กลีบเลี้ยงเขียวเล็กที่โคน (แยกวัสดุ)"""
    d = V(d).normalized()
    n, a, b = _basis(d)
    bm = bmesh.new()
    rows = []
    for i in range(1, nl):
        t = i / nl
        rr = r * (math.sin(math.pi * min(1.0, t / 0.7) * 0.5) if t < 0.35 else (1 - ((t - 0.35) / 0.65) ** 1.6)) ** 0.8
        rr = max(rr, r * 0.22) if t < 0.35 else rr
        c = base + d * (L * t)
        rows.append([bm.verts.new(c + (a * math.cos(TAU * j / tseg) + b * math.sin(TAU * j / tseg)) * rr) for j in range(tseg)])
    bot = bm.verts.new(base)
    tip = bm.verts.new(base + d * L)
    for j in range(tseg):
        f = bm.faces.new((bot, rows[0][(j + 1) % tseg], rows[0][j]))
        f.material_index = 1 if calyx else 0          # โคนดอก = กลีบเลี้ยงสีเขียว
        bm.faces.new((tip, rows[-1][j], rows[-1][(j + 1) % tseg]))
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(tseg):
            bm.faces.new((r0[j], r0[(j + 1) % tseg], r1[(j + 1) % tseg], r1[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm('bud', bm, m, bones)
    if calyx:
        ob.data.materials.append(calyx)
    return ob


def A_lk_jasmine():
    jas = fab('MAT_LK26_Jasmine', '#fffdf4', None, 0.55)
    cal = fab('MAT_LK26_Jasmine_Calyx', '#7fb24a', None, 0.6)
    rose = fab('MAT_LK26_Jasmine_Rose', '#d1203f', None, 0.55)
    leaf = fab('MAT_LK26_Jasmine_Leaf', '#3f8a3a', None, 0.6)
    rib = fab('MAT_LK26_Jasmine_Ribbon', '#ff6fa8', None, 0.35)
    thread = fab('MAT_LK26_Jasmine_String', '#f2e6c8', None, 0.7)
    arm = G_ARM_L
    w, d = WRIST_C, WRIST_D
    nx = d.cross(V((0, 1, 0))).normalized()
    by = d.cross(nx).normalized()
    R = 0.0405                   # วงด้ายร้อย (ผิวข้อมือ ~0.034)
    parts = [ring('string', w, d, R, 0.0018, thread, arm, seg=28, tseg=4)]
    # มะลิตูม 2 แถว × 13 ดอก (แถวบนเฉียงขึ้นหาแขน · แถวล่างเฉียงลงหามือ — สลับมุมกันครึ่งช่อง)
    NB = 15
    for row, (tilt, ph) in enumerate(((-0.42, 0.0), (0.48, 0.5))):
        for k in range(NB):
            ang = TAU * (k + ph) / NB
            rad = nx * math.cos(ang) + by * math.sin(ang)
            radw = rad
            tang = d.cross(radw).normalized()
            dirw = (radw + d * tilt + tang * 0.35).normalized()   # เอนตามวงเล็กน้อย ดอกซ้อนเกล็ดกันแน่น
            base = w + radw * (R + 0.0005) + d * (0.0028 * (1 if tilt > 0 else -1))
            parts.append(_bud(base, dirw, 0.0165, 0.0047, jas, arm, tseg=5, calyx=cal))
    # กุหลาบแดงดอกเล็ก (กลีบซ้อนเวียน หลอมเป็นผิวเดียว) ด้านหน้า-นอกของข้อมือ
    fr = V((0.45, -1.0, 0.0)).normalized()
    fr = (fr - d * fr.dot(d)).normalized()
    rc = w + fr * (R + 0.0135)
    n_, a_, b_ = _basis(fr)
    petals = [ellipsoid('rbud', rc + n_ * 0.002, (0.0042, 0.0042, 0.0042), rose, ['LowerArm.L'], seg=10, rings=6, rigid='LowerArm.L')]
    for layer, (cnt, rr, L, tilt) in enumerate(((3, 0.0032, 0.0072, 0.35), (4, 0.0048, 0.0088, 0.78), (5, 0.0064, 0.0098, 1.15))):
        for q in range(cnt):
            th = TAU * q / cnt + layer * 0.7
            e = a_ * math.cos(th) + b_ * math.sin(th)
            s_ = n_.cross(e)
            dirp = (n_ * math.cos(tilt) + e * math.sin(tilt)).normalized()

            def Pp(u, v, e=e, s_=s_, dirp=dirp, rr=rr, L=L):
                x = (2 * v - 1) * L * 0.55 * math.sin(math.pi * (0.15 + 0.85 * u)) ** 0.6
                return rc + e * rr + dirp * (L * u) + s_ * x - e * (0.35 * x * x / L) + e * 0.0012 * u * u
            petals.append(_sheet('rpetal', Pp, 6, 5, rose, bones=['LowerArm.L'], rigid='LowerArm.L', thick=0.0012))
    rs = _organic('rose', petals, rose, arm, 'LowerArm.L', voxel=0.0006, smooth=2, tris=420)
    del rs['eq_rigid']
    parts.append(rs)
    lv = []
    for sxx in (1, -1):
        lv.append(_leaf(rc - n_ * 0.003 + a_ * (0.004 * sxx), a_ * sxx + d * 0.4, fr, 0.012, 0.004, leaf, droop=0.0015, bones=['LowerArm.L'], rigid='LowerArm.L', thick=0.0012, nu=5))
    lf = _organic('rose_leaf', lv, leaf, arm, 'LowerArm.L', voxel=0.0006, smooth=2, tris=100)
    del lf['eq_rigid']
    parts.append(lf)
    # อุบะ: มะลิตูมร้อยห้อย 2 สาย (ปลายเป็นดอกรักเล็ก) + ริบบิ้นชมพู 1 เส้น — ห้อยตามแนวแขนลงด้านนอกหลังมือ
    top = rc + d * 0.007 + fr * 0.002
    for sxx in (-1, 1):
        side = (a_ * sxx * 0.0055)
        p = top + side
        for k in range(3):
            q = p + d * (0.0085 * k) + fr * (0.0011 * k)
            parts.append(_bud(q, d + fr * 0.12, 0.0095, 0.003, jas, arm, tseg=6, nl=5, calyx=cal))
        parts.append(polyline('uba_thread', [top + side * 0.3, p + d * 0.026 + fr * 0.003], 0.0007, thread, arm, tseg=3))
        end = p + d * 0.0275 + fr * 0.0035
        parts.append(ellipsoid('dokrak', end, (0.004, 0.004, 0.004), rose if sxx > 0 else jas, arm, seg=8, rings=5))
    pts_r, nrm_r = [], []
    for k in range(7):
        t = k / 6
        pts_r.append(top + d * (0.034 * t) + fr * (0.003 + 0.002 * math.sin(t * 3)) + a_ * (0.0015 * math.sin(t * 4)))
        nrm_r.append(fr)
    parts.append(_ribbon('ribbon', pts_r, nrm_r, 0.0045, 0.0009, rib, arm))
    return parts


# =====================================================================
# Day 7 — ชุดคืนเพ็ญเดือนสิบสอง: เสื้อผ้าไหมแขนกระบอก + โจงกระเบน + กระทงลอยรอบตัว
# =====================================================================
def T_lk_silk():
    m = fab('MAT_LK26_Silk', '#e2bf78', 'poly', 0.38, metal=0.14, nstr=0.22)
    trim = fab('MAT_LK26_Silk_Trim', '#a87822', 'weave', 0.35, metal=0.3)
    motif = fab('MAT_LK26_Silk_Motif', '#c89a3c', None, 0.3, metal=0.45)
    btn = fab('MAT_LK26_Silk_Button', '#d6a032', None, 0.22, metal=0.85)
    parts = shirt_body(m, neck='crew', trim=trim, trim_r=0.0042, neck_trim='tube') + sleeves(m, 'long', off=-0.002, cuff=trim)
    # ลายทอยกดอก "ลูกแก้ว" (ข้าวหลามตัดเล็ก ๆ เรียงสลับ) ทั้งหน้าและหลัง — นูนบาง วาวกว่าเนื้อผ้า
    for back in (False, True):
        for r_ in range(7):
            z = 0.272 + r_ * 0.035
            off_ = 0.016 if r_ % 2 else 0.0
            for c_ in range(-4, 4):
                x = c_ * 0.032 + off_ + 0.016 - (0.0 if r_ % 2 else 0.0)
                if abs(x) > 0.118 or (not back and abs(x) < 0.012):
                    continue
                p, n = _on_shell(x, z, back=back, lift=0.0047)
                s = 0.0062
                parts.append(flat_patch('motif', [(0, s * 1.3), (s, 0), (0, -s * 1.3), (-s, 0)], 0.0009, p, n, motif, ['Chest'] if z > 0.42 else ['Spine'], bevel=0))
                parts.append(flat_patch('motif_dot', [(0, s * 0.45), (s * 0.35, 0), (0, -s * 0.45), (-s * 0.35, 0)], 0.0009, p + n * 0.0009, n, trim, ['Chest'] if z > 0.42 else ['Spine'], bevel=0))
    # เชิงลาย "กรวยเชิง" รอบชายเสื้อ (สามเหลี่ยมเรียงชี้ขึ้น)
    P = yoke_surface(0.0)
    for i in range(44):
        phi = -math.pi + TAU * (i + 0.5) / 44
        best = min(((abs(P(phi, k * 0.004)[0].z - 0.247), k * 0.004) for k in range(150)))
        p, n = P(phi, best[1])
        up_ = (P(phi, best[1] - 0.004)[0] - p).normalized()
        parts.append(flat_patch('kruay', [(-0.0075, -0.005), (0.0075, -0.005), (0.0, 0.012)], 0.001, p + n * 0.0047, n, motif, ['Hips', 'Spine'], up=up_, bevel=0))
    # แถบผ้ายกดอกเหนือเชิง (ทอง-เข้ม) รอบตัว
    from eqlib import tube_arc
    parts.append(tube_arc('band', (0, 0, 0.262), 0.1466, 0.0042, 0, TAU, trim, G_TORSO, plane='XY', seg=44, tseg=4, scale=(1, 0.76, 1)))
    # กระดุมทอง 5 เม็ด กลางอก (ผ่าหน้าสั้นแบบเสื้อแขนกระบอก) + เส้นสาบ
    rows = [P(math.pi, 0.004 + 0.012 * i) for i in range(20)]
    rows = [(p, n) for p, n in rows if p.z > 0.33]
    parts.append(polyline('placket_line', [p + n * 0.0052 for p, n in rows], 0.0012, trim, G_TORSO, tseg=4))
    for i in range(5):
        p, n = rows[min(len(rows) - 1, 1 + i * max(1, (len(rows) - 2) // 4))]
        rb = 'Chest' if p.z > 0.44 else 'Spine'
        parts.append(ellipsoid('btn', p + n * 0.0072, (0.0048, 0.0048, 0.0048), btn, [rb], seg=10, rings=6, rigid=rb))
    return parts


def B_lk_chongkraben():
    m = fab('MAT_LK26_Kraben', '#4a2c7c', 'poly', 0.35, metal=0.14, nstr=0.28)
    bd = fab('MAT_LK26_Kraben_Border', '#d2a646', 'weave', 0.35, metal=0.3)
    gold = fab('MAT_LK26_Kraben_Gold', '#f4d06a', None, 0.28, metal=0.65)
    line = fab('MAT_LK26_Kraben_Line', '#b0263d', None, 0.5)
    fit = 0.014
    rise = 0.318
    # สะโพก: ผ้าห่มรอบเอว (ทรงรีตัดเอว) — แพตเทิร์นเดียวกับ pants() แต่หลวมกว่า
    hp = ellipsoid('hips', (0, 0, 0.258), (0.128 + fit * 0.4, 0.096 + fit * 0.45, 0.086), m, G_HIPS, seg=28, rings=14)
    delete_where(hp, lambda p: p.z > rise, snap=lambda p: V((p.x, p.y, rise)))
    parts = [hp]
    parts += edge_trim('waist', hp, lambda p: p.z > rise - 0.004, 0.0085, bd, ['Hips'], tseg=8)
    solidify(hp, 0.004)
    # ขาโจง: หลวมพองช่วงต้นขา รวบแคบลงใต้เข่า · ริ้วผ้าเฉียงเวียนเข้าหาหว่างขา (ผ้าถูกดึงลอดขาไปเหน็บหลัง)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        top = V((0.06 * sx, 0, 0.29))
        h, k, a = HIP(sx), KNEE(sx), ANK(sx)
        end = k.lerp(a, 0.3)
        pts = [top, h, h.lerp(k, 0.5), k, end]
        rr = [0.06 + fit + 0.002, 0.06 + fit + 0.004, 0.058 + fit + 0.004, 0.054 + fit, 0.05 + fit - 0.004]

        def wave(i, j, ang, sx=sx):
            return 0.0032 * max(0.0, math.sin(5 * ang * sx + i * 0.42)) ** 2
        parts.append(tube_open('leg', pts, rr, m, leg, seg=20, loop=0.012, thick=0.004, wave=wave))
        d = (end - k).normalized()
        parts.append(tube_open('hem_border', [end - d * 0.024, end + d * 0.002], [rr[-1] + 0.0045, rr[-1] + 0.0045], bd, leg, seg=20, cap_start=False, loop=0.013, thick=0.0035))
        parts.append(ring('hem_line', end - d * 0.016, d, rr[-1] + 0.0062, 0.0011, line, leg, seg=24, tseg=3))
        parts.append(ring('hem_gold', end - d * 0.006, d, rr[-1] + 0.0062, 0.0011, gold, leg, seg=24, tseg=3))
    # ผิวขาโจง (ทั้งสองขาซ้อนกันกลางลำตัว) — ใช้วางจีบหน้า/หางกระเบนให้แนบผ้า
    def leg_r(z):
        return 0.06 + fit + 0.004 - (0.004 + 0.006) * _sm((0.245 - z) / 0.11)

    def surf_y(x, z, back):
        k_ = max(0.0, 1 - (x / (0.128 + fit * 0.4)) ** 2 - ((z - 0.258) / 0.086) ** 2)
        yh = (0.096 + fit * 0.45) * math.sqrt(k_)
        r = leg_r(z)
        yl = math.sqrt(max(0.0, r * r - (abs(x) - 0.062) ** 2)) if z < 0.29 else 0.0
        return max(yh, yl)
    # จีบหน้า: ผ้าที่รวบลอดหว่างขา เป็นริ้วตั้งกลางหน้าขาทั้งสอง (เห็นใต้ชายเสื้อ)
    for k_, xo in enumerate((-0.011, 0.0, 0.011)):
        fpts = []
        for i in range(10):
            t = i / 9
            z = 0.262 - 0.11 * t
            x = xo * (1 - 0.55 * t) + 0.002 * math.sin(t * 5 + k_)
            fpts.append(V((x, -(surf_y(x, z, False) + 0.0055), z)))
        parts.append(polyline('front_fold', fpts, 0.0034 - 0.0007 * abs(k_ - 1), m, G_HIPS, tseg=5))
    # หางกระเบน: ชายผ้าที่ลอดหว่างขาขึ้นไปเหน็บเอวด้านหลัง — แผ่นผ้าเรียวขึ้น ขอบเชิงทอง (ส่วนบนซ่อนใต้ชายเสื้อ)
    def Ptail(u, v):
        z = 0.15 + (0.27 - 0.15) * u
        w = 0.056 * (1 - u) + 0.03 * u
        x = (v - 0.5) * w
        y = surf_y(x, z, True) + 0.0048 + 0.0028 * math.sin(math.pi * v) * (1 - u) + 0.0012 * math.sin(v * TAU * 2 + u * 3)
        return V((x, y, z))
    parts.append(_sheet('kraben_tail', Ptail, 12, 8, m, bones=G_HIPS, rigid=None, thick=0.003, offset=0.0))
    for sv in (0.0, 1.0):
        parts.append(polyline('tail_border', [Ptail(u, sv) + V((0, 0.0018, 0)) for u in [i / 10 for i in range(11)]], 0.0026, bd, G_HIPS, tseg=4))
    parts.append(polyline('tail_hem', [Ptail(0.0, v) + V((0, 0.0018, 0.0015)) for v in [i / 8 for i in range(9)]], 0.0026, bd, G_HIPS, tseg=4))
    return parts


# ---------- กระทง (เอฟเฟกต์) ----------
def _fold_petal(c, out, up, L, W, m, bones=('Root',)):
    """กลีบบัวใบตองพับ: แผ่นสามเหลี่ยมฐานกว้าง ปลายแหลม พับครึ่งตามยาว (สันกลางนูนออก) ตั้งเอียงออก"""
    out, up = V(out).normalized(), V(up).normalized()
    s = up.cross(out).normalized()
    d = (up * 0.9 + out * 0.42).normalized()
    nn = s.cross(d).normalized()
    if nn.dot(out) < 0:
        nn = -nn

    def P(u, v):
        x = (2 * v - 1)
        w = W * (1 - u) ** 0.85 * (1 + 0.25 * math.sin(math.pi * u))
        return c + d * (L * u) + s * (x * w) + nn * ((1 - abs(x)) * w * 0.62)
    return _sheet('fold', P, 7, 4, m, bones=list(bones), rigid='Root', thick=0.0022)


def _krathong(x, y, sc, mats, rot=0.0, seed=0):
    trunk, leaf, mar, wax, flame, ripple, jas = mats
    c = V((x, y, 0.0))
    up = V((0, 0, 1))
    R = 0.046 * sc
    Hb = 0.017 * sc
    out = []
    # ฐานหยวกกล้วย (แว่นหนาขอบมน)
    bm = bmesh.new()
    seg = 18
    rows = []
    for zz, rr in ((-0.004, R * 0.92), (-0.002, R), (Hb - 0.002, R), (Hb, R * 0.93)):
        rows.append([bm.verts.new(c + V((math.cos(TAU * j / seg) * rr, math.sin(TAU * j / seg) * rr, zz))) for j in range(seg)])
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(seg):
            bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out.append(_obj_from_bm('trunk', bm, trunk, ['Root'], 'Root'))
    # กลีบบัวใบตอง 2 ชั้น (ชั้นนอกเอียงออกมาก · ชั้นในตั้งกว่า สลับตำแหน่ง) หลอมเป็นผิวใบตองผืนเดียว
    folds = []
    for tier, (cnt, rr, L, W, lean) in enumerate(((10, R * 0.97, 0.03 * sc, 0.0118 * sc, 1.0), (10, R * 0.72, 0.036 * sc, 0.0105 * sc, 0.45))):
        for k in range(cnt):
            a = rot + TAU * (k + 0.5 * tier) / cnt
            o = V((math.cos(a), math.sin(a), 0))
            folds.append(_fold_petal(c + o * rr + up * (Hb - 0.003), (o * lean + up * 0.2), up, L, W, leaf))
    out.append(_organic('folds', folds, leaf, ['Root'], 'Root', voxel=0.0012 * sc, smooth=2, tris=500))
    # ดาวเรืองกลางกระทง (ช่อกลีบฟู) + มะลิตูม 3 ดอก
    rnd = random.Random(seed)
    mc = c + up * (Hb + 0.009 * sc) + V((0.006 * sc, -0.004 * sc, 0))
    pp = []
    for i in range(26):
        zz = 1 - 2 * (i + 0.5) / 26
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        a = i * 2.39996
        dirv = V((math.cos(a) * rr, math.sin(a) * rr, zz * 0.8))
        pp.append(ellipsoid('mp', mc + dirv * 0.0105 * sc, (0.0052 * sc, 0.0052 * sc, 0.0036 * sc), mar, ['Root'], seg=8, rings=5, rigid='Root'))
    out.append(_organic('marigold', pp, mar, ['Root'], 'Root', voxel=0.0011 * sc, smooth=2, tris=150))
    jj = []
    for k in range(3):
        a = rot + 1.0 + k * 2.1
        p0 = c + up * (Hb + 0.002) + V((math.cos(a), math.sin(a), 0)) * R * 0.45
        jj.append(capsule('jbud', p0, p0 + (up + V((math.cos(a), math.sin(a), 0)) * 0.6).normalized() * 0.011 * sc, 0.0034 * sc, 0.0014 * sc, jas, ['Root'], seg=6, rings=4, rigid='Root'))
    out.append(_organic('jasmine', jj, jas, ['Root'], 'Root', voxel=0.0009 * sc, smooth=2, tris=60))
    # เทียน + เปลวไฟ (เรืองแสง)
    cp = c + up * Hb + V((-0.012 * sc, 0.008 * sc, 0))
    out.append(capsule('candle', cp, cp + up * 0.04 * sc, 0.0056 * sc, 0.0052 * sc, wax, ['Root'], seg=8, rings=4, rigid='Root'))
    fz = cp + up * (0.04 * sc + 0.0135 * sc)
    fl = ellipsoid('flame', fz, (0.0058 * sc, 0.0058 * sc, 0.0125 * sc), flame, ['Root'], seg=8, rings=6, rigid='Root')
    for v in fl.data.vertices:   # ปลายเปลวเรียวแหลม
        q = v.co - fz
        if q.z > 0:
            k = 1 - 0.65 * (q.z / (0.0125 * sc))
            v.co = fz + V((q.x * k, q.y * k, q.z * 1.25))
    out.append(fl)
    # วงน้ำกระเพื่อม 2 วง (แผ่นวงแหวนบางเรืองแสงอ่อน) รอบกระทง
    for rr, w in ((R * 1.45, 0.0034), (R * 1.9, 0.0028)):
        bm = bmesh.new()
        n = 28
        inner = [bm.verts.new(c + V((math.cos(TAU * j / n) * (rr - w), math.sin(TAU * j / n) * (rr - w), 0.0012 + 0.0008 * math.sin(3 * TAU * j / n + seed)))) for j in range(n)]
        outer = [bm.verts.new(c + V((math.cos(TAU * j / n) * (rr + w), math.sin(TAU * j / n) * (rr + w), 0.0012 + 0.0008 * math.sin(3 * TAU * j / n + seed)))) for j in range(n)]
        for j in range(n):
            bm.faces.new((inner[j], inner[(j + 1) % n], outer[(j + 1) % n], outer[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        rp = _obj_from_bm('ripple', bm, ripple, ['Root'], 'Root')
        if sum(p.normal.z for p in rp.data.polygons) < 0:
            for p in rp.data.polygons:
                p.flip()
        out.append(rp)
    return out


def E_lk_krathong():
    mats = (fab('MAT_LK26_Krathong_Trunk', '#e4e8bd', 'corduroy', 0.75, nstr=0.25),
            fab('MAT_LK26_Krathong_Leaf', '#3f8f3a', 'corduroy', 0.55, nstr=0.3),
            fab('MAT_LK26_Krathong_Marigold', '#ff9a1a', None, 0.7, emission='#2a1400'),
            fab('MAT_LK26_Krathong_Wax', '#fff3d6', None, 0.5, emission='#3a2a10'),
            fab('MAT_LK26_Krathong_Flame', '#ffd257', None, 0.3, emission='#ffb020'),
            fab('MAT_LK26_Ripple_Light', '#bfe6ff', None, 0.3, emission='#4a7fae'),
            fab('MAT_LK26_Krathong_Jasmine', '#fffdf6', None, 0.6))
    out = []
    for i, (x, y, sc, rot) in enumerate(((-0.31, -0.19, 1.3, 0.2), (0.34, -0.1, 1.12, 1.1), (0.27, 0.27, 1.0, 2.0), (-0.3, 0.24, 1.17, 0.6))):
        out += _krathong(x, y, sc, mats, rot=rot, seed=i)
    return out


# =====================================================================
# เควสต์ — เข็มกลัดดอกบัว (Lotus Brooch) บนอกซ้าย · กลีบบัวชมพู 2 ชั้น (ไล่สีปลายกลีบเข้ม) · ฝักบัวเหลือง · ฐานใบบัวทอง
# =====================================================================
_LOTUS = []


def A_lk_lotus():
    pink = fab('MAT_LK26_Lotus', '#ffc2d4', None, 0.45)
    pod = fab('MAT_LK26_Lotus_Pod', '#e8c43a', None, 0.5)
    gold = fab('MAT_LK26_Lotus_Gold', '#d9ab3e', None, 0.25, metal=0.85)
    p0, n0 = _on_shell(0.068, 0.455, lift=0.0)
    # วางบนผิวเสื้อ + เผื่อชั้นเสื้อคลุม (2.3 ซม. จากผิวเสื้อยืด)
    c = p0 + n0 * 0.026
    n = (n0 + V((0, 0, 0.22))).normalized()
    _LOTUS[:] = [(c, n)]
    n, a, b = _basis(n)
    petals = []
    for tier, (cnt, L, W, tilt, r0, ph) in enumerate(((8, 0.025, 0.0112, 1.12, 0.0058, 0.0), (8, 0.0228, 0.0098, 0.62, 0.0044, math.pi / 8), (5, 0.0172, 0.0075, 0.28, 0.0032, 0.3))):
        for k in range(cnt):
            th = ph + TAU * k / cnt
            e = a * math.cos(th) + b * math.sin(th)
            s = n.cross(e)
            d = (n * math.cos(tilt) + e * math.sin(tilt)).normalized()
            inward = d.cross(s).normalized()
            if inward.dot(e) > 0:
                inward = -inward

            def P(u, v, e=e, s=s, d=d, inward=inward, L=L, W=W, r0=r0):
                x = (2 * v - 1)
                w = W * math.sin(math.pi * (0.1 + 0.9 * u)) ** 0.75 * (1 - 0.25 * u)
                return c + e * r0 + d * (L * u) + s * (x * w) + inward * (0.42 * (x * w) ** 2 / W * 1.0 + 0.0022 * u * u - 0.0012 * u)
            petals.append(_sheet('lpetal', P, 8, 5, pink, bones=['Chest'], rigid='Chest', thick=0.0013))
    parts = [_organic('lotus', petals, pink, ['Chest'], 'Chest', voxel=0.0008, smooth=2, tris=1300)]
    # ฝักบัว: กรวยตัดยอดแบน มีเมล็ดนูนเป็นจุด (หลอมรวม)
    pc = c + n * 0.0085
    seeds = [capsule('pod', c + n * 0.0015, pc, 0.0046, 0.0066, pod, ['Chest'], seg=12, rings=6, rigid='Chest')]
    for k in range(7):
        q = pc + n * 0.0062 + ((a * math.cos(TAU * k / 6) + b * math.sin(TAU * k / 6)) * 0.0039 if k < 6 else V())
        seeds.append(ellipsoid('seed', q, (0.0015, 0.0015, 0.0015), pod, ['Chest'], seg=6, rings=4, rigid='Chest'))
    parts.append(_organic('pod', seeds, pod, ['Chest'], 'Chest', voxel=0.0006, smooth=2, tris=240))
    # ฐาน: ใบบัวทองโค้ง (ขอบหยัก) + ก้านเข็มกลัดด้านหลัง
    def Pl(u, v):
        th = TAU * v
        rr = 0.024 * u * (1 + 0.06 * math.sin(9 * th))
        return c - n * (0.004 + 0.006 * u * u) + (a * math.cos(th) + b * math.sin(th)) * rr + V((0, 0, -0.003 * u))
    pad = _sheet('pad', Pl, 4, 36, gold, bones=['Chest'], rigid='Chest', thick=0.0014)
    parts.append(pad)
    parts.append(capsule('pin', c - n * 0.008 + a * 0.016, c - n * 0.008 - a * 0.016, 0.0012, 0.0012, gold, ['Chest'], seg=6, rings=4, rigid='Chest'))
    return parts


def lotus_tint(ob):
    """กลีบบัว: โคนขาวอมชมพู → ปลายกลีบชมพูเข้ม"""
    c, n = _LOTUS[0]
    cw = style_warp(c)
    k_ = STYLE['KX']
    deep = _lin('#e8507d')
    base = _lin('#ffc2d4')
    mult = tuple(deep[i] / base[i] for i in range(3))

    def fn(p):
        t = _sm(((p - cw).length / k_ - 0.012) / 0.013)
        return tuple(1 + (mult[i] - 1) * t for i in range(3))
    _tint_mat_exact(ob, 'MAT_LK26_Lotus', fn)
