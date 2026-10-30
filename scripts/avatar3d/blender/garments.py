"""
EnglishQuest Avatar — ชิ้นส่วนเสื้อผ้ามาตรฐาน (v2) ใช้ร่วมทุกชิ้น เพื่อให้ "ใส่ได้พอดีกับ Base + ขยับตามได้" เหมือนกันทุกชิ้น
  ชั้น (ระยะห่างจากผิว Base): เสื้อ 2–3 ซม. · เสื้อคลุม 4–5 ซม. · กางเกง 1.2 ซม. · รองเท้าหุ้มเท้า 0.7 ซม.
  ชายเสื้อเป็นทรงกระบอกตรง (กว้างกว่าสะโพกกางเกง) → เสื้อทับกางเกงเสมอ ไม่มีกางเกงทะลุชายเสื้อ
"""
import math

from mathutils import Matrix, Vector

from eqlib import (G_ARM_L, G_ARM_R, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, capsule, ellipsoid, flared, prism, rbox, tube_arc,
                   tube_path)
from eqdetail import (box_lo, boundary_paths, delete_where, disc, displace, edge_trim, fab, flat_patch, polyline, ring, solidify,
                      torso_point, tube_open)

RY = lambda d: Matrix.Rotation(math.radians(d), 3, 'Y')
RX = lambda d: Matrix.Rotation(math.radians(d), 3, 'X')
RZ = lambda d: Matrix.Rotation(math.radians(d), 3, 'Z')
V = Vector

# ---------------------------------------------------------------------
# ลำตัวเสื้อ
# ---------------------------------------------------------------------
# ลำตัวเสื้อทรงไหล่จริง (แทนแคปซูลโดม): ช่วงอก/เอวทรงรี · ช่วงบนเป็นแนวไหล่ลาดจากคอถึงหัวไหล่ที่ "คลุมหัวแขนเสื้อ"
# (เดิมโดมไหล่ต่ำกว่ายอดแขนเสื้อ ~7 ซม. → หัวแขนเสื้อโผล่เป็นก้อนเหลี่ยมคล้ายเกราะไหล่/ขอบฮู้ด)
# โปรไฟล์ (รัศมี, z): ด้านข้าง (แนวไหล่) และด้านหน้า/หลัง (อก/สะบัก) — มุมอื่นผสมตาม cos²
_SIDE = [(0.142, 0.47), (0.150, 0.50), (0.157, 0.528), (0.156, 0.552), (0.146, 0.571), (0.13, 0.584), (0.108, 0.592), (0.085, 0.597)]
_FRONT = [(0.108, 0.47), (0.107, 0.50), (0.103, 0.527), (0.096, 0.55), (0.086, 0.568), (0.075, 0.58), (0.064, 0.588), (0.055, 0.594)]
_NECK_Z = (0.600, 0.598)   # ระดับขอบคอ (ข้าง, หน้า/หลัง) — วงในเว้นให้ cut ตัดคอกลม/คอวี/คอกว้างได้เรียบ
def torso_shell(name, m, off, z0, flat=0.76, seg=32, neck_r=0.06):
    import bmesh as _bm
    from eqlib import _obj_from_bm
    bm = _bm.new()
    rows = []
    kf = flat / 0.76
    z = z0
    while z < 0.47 - 1e-6:   # ช่วงลำตัว: ทรงรีตรง (ชายกว้างกว่าสะโพกกางเกงเล็กน้อย)
        rs = 0.142 + off
        rows.append([(rs * math.cos(2 * math.pi * i / seg), rs * flat * math.sin(2 * math.pi * i / seg), z) for i in range(seg)])
        z += 0.022
    def ring_at(rs, zs_, rf, zf, lift):
        out = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            c2 = math.cos(a) ** 2
            out.append((rs * math.cos(a), rf * math.sin(a), zs_ * c2 + zf * (1 - c2) + lift))
        return out
    for k in range(len(_SIDE)):   # ช่วงไหล่
        (rs, zs_), (rf, zf) = _SIDE[k], _FRONT[k]
        rows.append(ring_at(rs + off, zs_, rf * kf + off * flat, zf, off * 0.85))
    # วงคอ (รัศมี neck_r + 0.6 มม. พอดีเส้น cut) แล้ววงใน 2 วง + ขั้ว (ถูกตัดทิ้งเมื่อเจาะคอ)
    for fr in (1.0 + 0.01, 0.55):
        rows.append(ring_at(neck_r * fr, _NECK_Z[0] + (1 - fr) * 0.01, neck_r * fr * flat, _NECK_Z[1] + (1 - fr) * 0.01, off * 0.85))
    vrows = [[bm.verts.new(p) for p in r] for r in rows]
    pole = bm.verts.new((0, 0, _NECK_Z[0] + 0.008 + off * 0.85))
    for ra, rb in zip(vrows, vrows[1:]):
        for i in range(seg):
            bm.faces.new((ra[i], ra[(i + 1) % seg], rb[(i + 1) % seg], rb[i]))
    for i in range(seg):
        bm.faces.new((vrows[-1][i], vrows[-1][(i + 1) % seg], pole))
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(name, bm, m, G_TORSO)

def shirt_body(m, off=0.0, hem=0.226, neck='crew', flat=0.76, open_front=0.0, length=None, neck_r=0.06, trim=None,
               trim_r=0.0065, vdepth=0.47, hem_trim=True, arm_holes=False, quilt=0.0, neck_trim='band', neck_h=0.011):
    """ลำตัวเสื้อ + คอเสื้อเจาะจริง + ขอบคอ/ชาย ตามรอยตัด
    neck: crew | v | wide | turtle (ไม่เจาะ ใช้ปลอกคอเต่าแยก) | open (ไม่ใส่ขอบคอ)
    open_front: ผ่าหน้า (ครึ่งความกว้างช่องเปิด) สำหรับเสื้อคลุม · length: ระดับชายเสื้อ (ถ้ายาวกว่า hem)"""
    z0 = (length if length is not None else hem) - 0.03
    sh = torso_shell('body', m, off, z0, flat, neck_r=neck_r + (0.022 if neck == 'wide' else 0.0))
    cut_z = length if length is not None else hem
    def cut(p):
        if p.z < cut_z:
            return True
        rr = math.hypot(p.x, p.y / flat)
        if neck in ('crew', 'turtle', 'open') and p.z > 0.5 and rr < neck_r:
            return True
        if neck == 'wide' and p.z > 0.5 and rr < neck_r + 0.022:
            return True
        if neck == 'v' and p.y < 0 and p.z > vdepth + 1.45 * abs(p.x) and abs(p.x) < neck_r + 0.03:
            return True
        if neck == 'v' and p.z > 0.5 and rr < neck_r:
            return True
        if open_front and p.y < -0.02 and abs(p.x) < open_front:
            return True
        if arm_holes and p.z > 0.43 and abs(p.x) > 0.098:
            return True
        return False
    def snap(p):
        # ดึงริมรอยตัดเข้าหาเส้นตัดที่ตั้งใจ (ชาย / ผ่าหน้า / คอวี / คอกลม / วงแขน)
        rr = math.hypot(p.x, p.y / flat)
        if p.z < cut_z + 0.025:
            return V((p.x, p.y, cut_z))
        if open_front and p.y < -0.02 and abs(p.x) < open_front + 0.03:
            sx = 1 if p.x >= 0 else -1
            return V((sx * open_front, p.y, p.z))
        if arm_holes and p.z > 0.42 and abs(p.x) > 0.085:
            sx = 1 if p.x >= 0 else -1
            return V((sx * 0.098, p.y, p.z))
        if neck == 'v' and p.y < 0 and p.z > vdepth - 0.01 and abs(p.x) < neck_r + 0.04:
            zv = vdepth + 1.45 * abs(p.x)
            if zv < 0.6 and rr > neck_r * 0.8:
                return V((p.x, p.y, zv))
        if p.z > 0.5 and rr < (neck_r + (0.022 if neck == 'wide' else 0.0)) + 0.03:
            k = (neck_r + (0.022 if neck == 'wide' else 0.0)) / max(rr, 1e-6)
            return V((p.x * k, p.y * k, p.z))
        return None
    delete_where(sh, cut, snap=snap)
    if quilt:
        displace(sh, lambda p: V((p.x, p.y / flat, 0)).normalized() * quilt * abs(math.sin(math.pi * (p.z - cut_z) / 0.05)))
    parts = [sh]
    tm = trim or m
    if neck in ('crew', 'wide') and neck_trim == 'band':
        # ขอบคอผ้าริบแบน (แทนท่อกลมหนารอบคอ — ต้นเหตุที่คอเสื้อดูเป็นห่วง/ขอบฮู้ด)
        parts += neck_band(tm, off, neck_r + (0.022 if neck == 'wide' else 0.0), h=neck_h, gap=open_front, flat=flat)
    elif neck not in ('turtle', 'open') and neck_trim:
        parts += edge_trim('neck', sh, lambda p: p.z > 0.48 and abs(p.x) < 0.11, trim_r * 0.75, tm, ['Chest', 'Neck'], tseg=6)
    if open_front:
        parts += edge_trim('placket', sh, lambda p: p.y < -0.02 and abs(p.x) < open_front + 0.006 and p.z > cut_z + 0.004, trim_r, tm, G_TORSO, tseg=6)
    if hem_trim:
        parts += edge_trim('hem', sh, lambda p: p.z < cut_z + 0.006, trim_r, tm, ['Hips', 'Spine'], tseg=6)
    if arm_holes:
        parts += edge_trim('arm', sh, lambda p: p.z > 0.42 and abs(p.x) > 0.09, trim_r, tm, G_TORSO, tseg=6)
    solidify(sh, 0.0045, offset=1.0)
    return parts

def turtle_neck(m, h=0.07, r=0.064):
    return [tube_open('turtle', [(0, 0, 0.52), (0, 0, 0.52 + h)], [r + 0.004, r], m, ['Chest', 'Neck'], seg=28, cap_start=False, loop=0.008, thick=0.006),
            ring('turtle_top', (0, 0, 0.52 + h), (0, 0, 1), r + 0.002, 0.008, m, ['Neck'], seg=28)]

def yoke_surface(off, flat=0.76, neck_r=0.06):
    """ผิวนอกของลำตัวเสื้อ (ตรงกับ torso_shell) แบบพารามิเตอร์: P(φ, s) -> (จุด, normal)
    φ = มุมรอบคอ (0 = กลางหลัง +y, บวก = ไปทาง +x) · s = ระยะตามผิวจากขอบคอลงไปทางไหล่/หลัง/อก"""
    kf = flat / 0.76
    rows = [(neck_r * 1.01, _NECK_Z[0] + off * 0.85, neck_r * 1.01 * flat, _NECK_Z[1] + off * 0.85)]
    for k in range(len(_SIDE) - 1, -1, -1):
        (rs, zs_), (rf, zf) = _SIDE[k], _FRONT[k]
        rows.append((rs + off, zs_ + off * 0.85, rf * kf + off * flat, zf + off * 0.85))
    z = 0.448
    while z > 0.08:
        rows.append((0.142 + off, z, (0.142 + off) * flat, z)); z -= 0.022
    cache = {}
    def line(phi):
        key = round(phi, 4)
        if key in cache:
            return cache[key]
        a = math.pi / 2 - phi
        c2 = math.cos(a) ** 2
        pts = [V((rs * math.cos(a), rf * math.sin(a), zs_ * c2 + zf * (1 - c2))) for rs, zs_, rf, zf in rows]
        acc = [0.0]
        for i in range(1, len(pts)):
            acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
        cache[key] = (pts, acc)
        return cache[key]
    def pos(phi, s):
        pts, acc = line(phi)
        s = max(0.0, min(acc[-1] - 1e-6, s))
        i = 1
        while acc[i] < s:
            i += 1
        t = (s - acc[i - 1]) / max(1e-9, acc[i] - acc[i - 1])
        return pts[i - 1].lerp(pts[i], t)
    def P(phi, s):
        p = pos(phi, s)
        da = pos(phi + 0.01, s) - pos(phi - 0.01, s)
        ds = pos(phi, s + 0.004) - pos(phi, max(0.0, s - 0.004))
        n = da.cross(ds)
        if n.length < 1e-9:
            n = V((p.x, p.y, 0.3))
        n.normalize()
        if n.dot(V((p.x, p.y / flat, (p.z - 0.42) * 0.6))) < 0:
            n = -n
        return p, n
    return P

def fold_loft(name, m_out, m_in, P, phi_max, prof, n_phi=56, n_in=5, n_out=16, bones=('Spine', 'Chest', 'Neck'), thick=0.0045,
              wrinkle=0.0, center_gap=0.0):
    """ผ้าพับรูป Λ รอบคอ (ใช้ทั้งฮู้ดพับลง · ปกเสื้อ · ปกแจ็กเก็ต): ด้านใน (m_in) ตั้งขึ้นจากตะเข็บคอถึงสันพับ แล้วด้านนอก (m_out)
    ลาดลงตามผิวเสื้อจนถึงขอบผ้า · prof(φ) -> (sa: ระยะตะเข็บ→สัน, Ha: ความสูงสัน, L: ระยะตะเข็บ→ขอบผ้า, Tp: ความพองช่วงกลาง)
    คืน (object, rim_points, edge_points)"""
    import bmesh as _bm
    from eqlib import _obj_from_bm
    bm = _bm.new()
    grid, rim, edge = [], [], []
    for i in range(n_phi + 1):
        phi = -phi_max + 2 * phi_max * i / n_phi
        sa, Ha, L, Tp = prof(phi)
        col = []
        for k in range(n_in + n_out + 1):
            if k <= n_in:
                u = k / n_in
                s_, h = sa * u, 0.0025 + (Ha - 0.0025) * (math.sin(u * math.pi / 2) ** 1.3)
            else:
                u = (k - n_in) / n_out
                s_ = sa + (L - sa) * u
                d = s_ - sa
                h = Tp + (Ha - Tp) * math.exp(-(d / max(0.012, (L - sa) * 0.35)) ** 2)
                if u > 0.55:
                    h *= math.sqrt(max(0.0, 1.0 - u ** 6)) * 0.85 + 0.15
                if wrinkle:
                    h += wrinkle * math.sin(phi * 7.0 + d * 26.0) * math.sin(math.pi * min(1.0, u * 1.2)) * (1 - abs(phi) / phi_max)
            p, n = P(phi, s_)
            col.append(bm.verts.new(p + n * max(0.003, h)))
            if k == n_in:
                rim.append(p + n * (Ha + 0.0004))
            if k == n_in + n_out:
                edge.append((p, n))
        grid.append(col)
    for i in range(n_phi):
        for k in range(n_in + n_out):
            f = bm.faces.new((grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]))
            f.material_index = 1 if k < n_in else 0
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, m_out, list(bones))
    ob.data.materials.append(m_in)
    b2 = _bm.new(); b2.from_mesh(ob.data)
    out = sum((f.normal.dot(f.calc_center_median() - V((0, 0, 0.45))) > 0) for f in b2.faces)
    if out < len(b2.faces) / 2:
        _bm.ops.reverse_faces(b2, faces=b2.faces)
    b2.to_mesh(ob.data); b2.free()
    solidify(ob, thick, offset=-1.0)
    return ob, rim, edge

def hood(m, trim, strings=True, lining=None, off=0.006, depth=1.0, name='hood'):
    """ฮู้ด (ท่าพับลงหลัง — Hood Down) จากผืนผ้าจริง ไม่ใช่ทรงรี/ห่วงรอบคอ:
    ผ้าซับในตั้งขึ้นจากตะเข็บคอ → ขอบเปิดหน้าฮู้ด → ผ้าด้านนอกลาดลงไหล่และทอดยาวลงกลางหลังเป็นถุงฮู้ด (ยอดฮู้ดมนอยู่ล่างสุด)
    · ตะเข็บกลางฮู้ด · ขอบเปิดเย็บพับบาง 3 มม. · รอยยับตามแรงโน้มถ่วง · ปลายฮู้ดสองข้างบรรจบหน้าอกเป็นคอวีไขว้
    · เชือกฮู้ดร้อยออกจากรูตาไก่ที่ปลายขอบเปิด"""
    lin = lining or m
    P = yoke_surface(off)
    PHI = math.radians(150)
    def prof(phi):
        a = abs(phi) / PHI
        back = max(0.0, math.cos(min(math.pi / 2, abs(phi) * 0.92))) ** 1.3
        L = 0.034 + 0.235 * depth * back
        Ha = 0.028 - 0.02 * a ** 2
        Tp = 0.005 + 0.03 * back
        sa = 0.012 + 0.005 * (1 - a)
        return sa, Ha, L, Tp
    ob, rim, edge = fold_loft(name, m, lin, P, PHI, prof, n_phi=30, n_in=3, n_out=11, wrinkle=0.0024)
    parts = [ob, polyline(f'{name}_rim', rim, 0.003, lin, ['Chest', 'Neck'], tseg=5)]
    sa0, Ha0, L0, Tp0 = prof(0.0)
    seam = []
    for j in range(9):   # ตะเข็บกลางฮู้ด
        s_ = sa0 + 0.006 + (L0 - sa0 - 0.016) * j / 8
        d = s_ - sa0; u = d / (L0 - sa0)
        h = Tp0 + (Ha0 - Tp0) * math.exp(-(d / ((L0 - sa0) * 0.35)) ** 2)
        if u > 0.55:
            h *= math.sqrt(max(0.0, 1.0 - u ** 6)) * 0.85 + 0.15
        p, n = P(0.0, s_)
        seam.append(p + n * (h + 0.0012))
    parts.append(polyline(f'{name}_seam', seam, 0.0014, lin, ['Spine', 'Chest'], tseg=4))
    if strings:
        for sx in (1, -1):
            phi = sx * (PHI - math.radians(10))
            sa, Ha, L, Tp = prof(phi)
            a, n = P(phi, sa * 0.5)
            a = a + n * (Ha * 0.5)
            b, nb = torso_point(0.034 * sx, 0.41, off=off + 0.024)
            mid = a.lerp(b, 0.5) + nb * 0.006
            parts.append(polyline('string', [a, mid, b], 0.0036, trim, ['Chest'], rigid='Chest'))
            parts.append(ellipsoid('aglet', b - V((0, 0, 0.008)), (0.004, 0.004, 0.009), trim, ['Chest'], seg=8, rings=6, rigid='Chest'))
            parts.append(disc('eyelet', a + n * 0.0015, n, 0.0048, 0.0018, mat_metal(), ['Chest'], rigid='Chest'))
    return parts

COLLARS = {
    # kind: (φ สูงสุด°, ความสูงขาตั้งปก(หลัง,หน้า), ความกว้างปกพับ(หลัง), ความยาวปลายปกหน้า, ความหนาผ้า)
    'shirt': (166, (0.015, 0.012), 0.03, 0.058, 0.0035),    # เชิ้ต: มีขาตั้งปก ปลายแหลม
    'polo': (160, (0.012, 0.01), 0.027, 0.046, 0.0035),     # โปโล: ปกผ้าริบนุ่ม ปลายสั้น
    'camp': (150, (0.006, 0.004), 0.036, 0.06, 0.0035),     # ฮาวาย/เชิ้ตสงกรานต์: ปกเปิดแบนราบ ไม่มีขาตั้ง
    'jacket': (156, (0.014, 0.012), 0.029, 0.06, 0.0045),   # แจ็กเก็ต/ยีนส์/โค้ท: ปกพับแนบคอ (ด้านหลังแคบ — ไม่ดูเป็นฮู้ด)
}
def fold_collar(m, kind='shirt', off=0.0, under=None, stitch=None, name='collar'):
    """ปกเสื้อจริง: ขาตั้งปก (ด้านใน) + ปกพับ (ด้านนอก) วางบนแนวคอ/ไหล่ · ปลายปกด้านหน้าแหลมลงบนอก · ตะเข็บทับขอบปก"""
    pm, (hs_b, hs_f), wb, wtip, th = COLLARS[kind]
    PHI = math.radians(pm)
    P = yoke_surface(off)
    def prof(phi):
        a = abs(phi) / PHI
        tip = a ** 5
        sa = 0.004 + 0.002 * (1 - a)
        Ha = hs_b + (hs_f - hs_b) * a
        L = wb + (wtip - wb) * tip
        return sa, Ha, L, Ha * 0.32
    ob, rim, edge = fold_loft(name, m, under or m, P, PHI, prof, n_phi=28, n_in=3, n_out=6, bones=('Chest', 'Neck'), thick=th)
    parts = [ob]
    if stitch is not None:   # ตะเข็บทับ 3 มม. จากขอบปก
        pts = [p + n * 0.0045 for p, n in edge[2:-2]]
        parts.append(polyline(f'{name}_st', pts, 0.0008, stitch, ['Chest', 'Neck'], tseg=3))
    return parts

def neck_band(m, off=0.0, neck_r=0.06, h=0.012, lean=-0.003, gap=0.0, flat=0.76, name='neckband'):
    """ขอบคอผ้าริบ (คอกลม/คอบอมเบอร์/คอตั้ง) — แถบผ้าแบนสูง h ต่อจากขอบคอ (ไม่ใช่ท่อกลมรอบคอ)
    gap = ครึ่งความกว้างช่องผ่าหน้า (เสื้อคลุมซิป) → แถบเปิดด้านหน้า"""
    import bmesh as _bm
    from eqlib import _obj_from_bm
    z_s, z_f = _NECK_Z[0] + off * 0.85, _NECK_Z[1] + off * 0.85
    a0 = math.asin(min(0.95, gap / neck_r)) if gap else 0.0
    n = 36
    closed = not gap
    angs = [2 * math.pi * i / n for i in range(n)] if closed else \
        [(-math.pi / 2 + a0) + (2 * math.pi - 2 * a0) * i / n for i in range(n + 1)]
    bm = _bm.new()
    rows = []
    for k, (dz, dr) in enumerate(((-0.004, 0.0015), (0.0, 0.0015), (h * 0.5, lean * 0.5 + 0.0012), (h, lean + 0.0008))):
        row = []
        for a in angs:
            c2 = math.cos(a) ** 2
            r = neck_r * 1.01 + dr
            row.append(bm.verts.new((r * math.cos(a), r * flat * math.sin(a), z_s * c2 + z_f * (1 - c2) + dz)))
        rows.append(row)
    m_ = len(angs)
    for ra, rb in zip(rows, rows[1:]):
        for i in range(m_ if closed else m_ - 1):
            j = (i + 1) % m_
            bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm(name, bm, m, ['Chest', 'Neck'])
    solidify(ob, 0.0042, offset=0.0)
    rt = neck_r * 1.01 + lean + 0.0008
    top = [V((rt * math.cos(a), rt * flat * math.sin(a), z_s * math.cos(a) ** 2 + z_f * (1 - math.cos(a) ** 2) + h)) for a in angs]
    if closed:
        top.append(top[0])
    return [ob, polyline(f'{name}_edge', top, 0.0024, m, ['Chest', 'Neck'], tseg=5)]

def mat_metal(c='#c7ccd8'):
    return fab('MAT_Metal_Silver' if c == '#c7ccd8' else f'MAT_Metal_{c[1:]}', c, None, rough=0.3, metal=0.85)

# ---------------------------------------------------------------------
# แขนเสื้อ
# ---------------------------------------------------------------------
SH = lambda sx: V((0.135 * sx, 0, 0.525))
EL = lambda sx: V((0.168 * sx, 0, 0.395))
WR = lambda sx: V((0.186 * sx, 0, 0.29))

def sleeve(m, sx, length='short', off=0.0, cuff=None, hem=True, trim=None, puff=0.0, wave=None):
    """แขนเสื้อปลายเปิด (เริ่มในลำตัวเสื้อ ปิดโค้งด้านใน) · length: cap | short | elbow | 3q | long"""
    arm = G_ARM_L if sx > 0 else G_ARM_R
    # แขนเสื้อเริ่มในลำตัว (หัวแขนเสื้อถูกแนวไหล่ของลำตัวคลุมไว้ — ตะเข็บแขนอยู่ข้างไหล่แบบเสื้อจริง)
    r_sh, r_el, r_wr = 0.056 + off + puff, 0.051 + off, 0.047 + off
    start = V((0.112 * sx, 0, 0.47))
    yoke = V((0.124 * sx, 0, 0.5))
    r_st, r_yk = r_sh, r_sh
    sh, el, wr = SH(sx), EL(sx), WR(sx)
    if length == 'cap':
        pts, rr = [start, yoke, sh, sh.lerp(el, 0.3)], [r_st, r_yk, r_sh, r_sh - 0.002]
    elif length == 'short':
        pts, rr = [start, yoke, sh, sh.lerp(el, 0.62)], [r_st, r_yk, r_sh, (r_sh + r_el) / 2 + 0.002]
    elif length == 'elbow':
        pts, rr = [start, yoke, sh, el], [r_st, r_yk, r_sh, r_el + 0.002]
    elif length == '3q':
        pts, rr = [start, yoke, sh, el, el.lerp(wr, 0.55)], [r_st, r_yk, r_sh, r_el, (r_el + r_wr) / 2]
    else:
        pts, rr = [start, yoke, sh, el, wr], [r_st, r_yk, r_sh, r_el, r_wr]
    parts = [tube_open('sleeve', pts, rr, m, arm, seg=16, loop=0.013, thick=0.004, wave=wave)]
    end, d = pts[-1], (pts[-1] - pts[-2]).normalized()
    if cuff:
        c0 = end - d * 0.026
        parts.append(tube_open('cuff', [c0, end + d * 0.004], [rr[-1] + 0.002, rr[-1] + 0.001], cuff, arm, seg=16, cap_start=False, loop=0.012, thick=0.004))
        parts.append(ring('cuff_edge', end + d * 0.004, d, rr[-1] - 0.0005, 0.0045, cuff, arm, seg=16, tseg=5))
    elif hem:
        parts.append(ring('sleeve_hem', end, d, rr[-1] - 0.001, 0.0045, trim or m, arm, seg=16, tseg=5))
    return parts

def sleeves(m, length='short', **kw):
    return [p for sx in (1, -1) for p in sleeve(m, sx, length, **kw)]

# ---------------------------------------------------------------------
# รายละเอียดหน้าอก
# ---------------------------------------------------------------------
def placket(m, btn, z0=0.25, z1=0.52, off=0.02, w=0.022, buttons=5, x=0.0, bones=G_TORSO):
    parts = []
    pts = []
    for i in range(9):
        z = z0 + (z1 - z0) * i / 8
        p, n = torso_point(x, z, off=off)
        pts.append(p)
    parts.append(polyline('placket', pts, w * 0.5, m, bones, tseg=6))
    for sx in (1, -1):
        parts.append(polyline('placket_st', [q + V((w * 0.42 * sx, -0.0045, 0)) for q in pts], 0.0011, btn, bones, tseg=4))
    for i in range(buttons):
        z = z0 + 0.02 + (z1 - z0 - 0.04) * i / max(1, buttons - 1)
        p, n = torso_point(x, z, off=off + 0.006)
        parts.append(disc('btn', p, n, 0.0065, 0.0028, btn, ['Chest'] if z > 0.44 else ['Spine'], rigid='Chest' if z > 0.44 else 'Spine'))
    return parts

def chest_pocket(m, stitch, x=0.06, z=0.43, w=0.05, h=0.055, off=0.022, flap=True):
    p, n = torso_point(x, z, off=off)
    from eqdetail import outline_rect
    parts = [flat_patch('pocket', outline_rect(w, h, 0.006), 0.004, p, n, m, ['Chest'], rigid='Chest')]
    if flap:
        fp, fn = torso_point(x, z + h / 2 + 0.004, off=off + 0.004)
        parts.append(flat_patch('pocket_flap', [(-w / 2 - 0.003, 0.006), (w / 2 + 0.003, 0.006), (w / 2 + 0.003, -0.012), (0, -0.02), (-w / 2 - 0.003, -0.012)],
                                0.004, fp, fn, m, ['Chest'], rigid='Chest'))
        parts.append(disc('pocket_btn', fp + fn * 0.005 - V((0, 0, 0.012)), fn, 0.005, 0.003, stitch, ['Chest'], rigid='Chest'))
    else:
        parts.append(polyline('pocket_st', [p + n * 0.0045 + V((-w / 2 + 0.004, 0, h / 2 - 0.006)), p + n * 0.0045 + V((w / 2 - 0.004, 0, h / 2 - 0.006))], 0.001, stitch, ['Chest'], rigid='Chest'))
    return parts

def collar_flaps(m, off=0.02, z=0.53, spread=20, size=1.0, bones=('Chest', 'Neck')):
    """ปกเสื้อเชิ้ต/โปโล (สองฝั่ง พับลงบนบ่า)"""
    parts = []
    for sx in (1, -1):
        p, n = torso_point(0.034 * sx, z, off=off + 0.01)
        outline = [(0.0, 0.012 * size), (0.05 * size * sx, 0.016 * size), (0.044 * size * sx, -0.022 * size), (0.008 * sx, -0.034 * size)]
        if sx < 0:
            outline = list(reversed(outline))
        nn = (n + V((0, 0, 0.9))).normalized()
        parts.append(flat_patch('collar', outline, 0.005, p, nn, m, list(bones), rigid='Chest'))
    parts.append(ring('collar_band', (0, 0.004, 0.566), (0, 0, 1), 0.06, 0.009, m, list(bones), seg=28, flat=0.92))
    return parts

def print_on(shape_pts, m, x=0.0, z=0.39, off=0.021, scale=1.0, depth=0.0025, back=False):
    """ลายสกรีนแนบอก (prism บาง ตามทิศผิวเสื้อ)"""
    p, n = torso_point(x, z, off=off, back=back)
    return flat_patch('print', [(a * scale, b * scale) for a, b in shape_pts], depth, p, n, m, ['Chest', 'Spine'], rigid='Chest' if z > 0.4 else 'Spine', bevel=0)   # ลายสกรีนแบน (ไม่ต้อง bevel — ประหยัด tris)

def zipper(m, pull, z0=0.24, z1=0.56, off=0.02, x=0.0):
    pts = [torso_point(x, z0 + (z1 - z0) * i / 10, off=off)[0] for i in range(11)]
    parts = [polyline('zip', pts, 0.0042, m, G_TORSO, tseg=4)]
    for i in range(1, 20):
        z = z0 + (z1 - z0) * i / 20
        p, n = torso_point(x, z, off=off + 0.003)
        parts.append(box_lo('tooth', p, (0.008, 0.003, 0.0035), m, ['Spine'] if z < 0.4 else ['Chest'], rigid='Spine' if z < 0.4 else 'Chest', bevel=0))
    tp, tn = torso_point(x, z1 - 0.012, off=off + 0.008)
    parts.append(flat_patch('zip_pull', [(-0.006, 0.006), (0.006, 0.006), (0.005, -0.02), (-0.005, -0.02)], 0.003, tp, tn, pull, ['Chest'], rigid='Chest'))
    return parts

# ---------------------------------------------------------------------
# กางเกง / กระโปรง
# ---------------------------------------------------------------------
HIP = lambda sx: V((0.062 * sx, 0, 0.245))
KNEE = lambda sx: V((0.064 * sx, 0, 0.135))
ANK = lambda sx: V((0.066 * sx, 0, 0.062))

def pants(m, length='long', fit=0.0, flare=0.0, waist=None, cuff=None, hem_trim=None, rise=0.318, wave=None):
    """กางเกง: สะโพก (ตัดเอว + ขอบเอวจริง) + ขาเปิดปลาย (edge loop ถี่ที่เข่า) · length: long | ankle | capri | knee | short | mini"""
    parts = []
    hp = ellipsoid('pants_hips', (0, 0, 0.258), (0.128 + fit * 0.3, 0.096 + fit * 0.3, 0.084), m, G_HIPS, seg=28, rings=14)
    delete_where(hp, lambda p: p.z > rise, snap=lambda p: V((p.x, p.y, rise)))
    parts.append(hp)
    parts += edge_trim('waist', hp, lambda p: p.z > rise - 0.004, 0.009, waist or m, ['Hips'], tseg=8)
    solidify(hp, 0.004)
    ends = {'long': 1.0, 'ankle': 0.88, 'capri': 0.6, 'knee': 0.36, 'short': 0.18, 'mini': 0.08}
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        top = V((0.06 * sx, 0, 0.29))
        h, k, a = HIP(sx), KNEE(sx), ANK(sx)
        e = ends[length]
        r_h, r_k, r_a = 0.06 + fit, 0.054 + fit + flare * 0.3, 0.05 + fit + flare
        if e > 0.6:
            t = (e - 0.6) / 0.4
            pts, rr = [top, h, k, k.lerp(a, t)], [r_h, r_h, r_k, r_k + (r_a - r_k) * t]
        else:
            t = e / 0.6
            pts, rr = [top, h, h.lerp(k, t)], [r_h, r_h, r_h + (r_k - r_h) * t]
        parts.append(tube_open('leg', pts, rr, m, leg, seg=18, loop=0.012, thick=0.004, wave=wave))
        end, d = pts[-1], (pts[-1] - pts[-2]).normalized()
        if cuff:
            parts.append(tube_open('leg_cuff', [end - d * 0.024, end + d * 0.002], [rr[-1] + 0.004, rr[-1] + 0.004], cuff, leg, seg=18, cap_start=False, loop=0.012, thick=0.004))
        else:
            parts.append(ring('leg_hem', end, d, rr[-1] - 0.001, 0.0045, hem_trim or m, leg, seg=18, tseg=5))
    return parts

def jeans_details(stitch, rivet, back_pocket=None):
    parts = []
    # ซิป (ตะเข็บรูปตัว J) + กระเป๋าหน้าโค้ง + กระเป๋าหลังปะ + หมุดย้ำ
    fly = [V((0.0, -0.1, 0.31)), V((0.018, -0.1, 0.3)), V((0.024, -0.098, 0.27)), V((0.012, -0.094, 0.245)), V((0.0, -0.09, 0.24))]
    parts.append(polyline('fly', fly, 0.0012, stitch, ['Hips'], rigid='Hips', tseg=4))
    for sx in (1, -1):
        cur = [V((0.05 * sx, -0.093, 0.312)), V((0.075 * sx, -0.083, 0.29)), V((0.105 * sx, -0.06, 0.28)), V((0.118 * sx, -0.045, 0.285))]
        parts.append(polyline('pocket_curve', cur, 0.0014, stitch, ['Hips'], rigid='Hips', tseg=4))
        parts.append(disc('rivet', V((0.105 * sx, -0.062, 0.284)), V((0.6 * sx, -0.8, 0)), 0.004, 0.002, rivet, ['Hips'], rigid='Hips'))
        if back_pocket:
            from eqdetail import outline_rect
            # วางบนผิวสะโพกกางเกงจริง (ทรงรีเดียวกับ pants_hips) — เดิมลอยห่างผิว ~8 มม. จึงโผล่ทะลุชายเสื้อด้านหลัง
            x_, z_ = 0.056 * sx, 0.228
            A_, B_, C_, Z_ = 0.128, 0.096, 0.084, 0.258
            k_ = max(0.05, 1 - (x_ / A_) ** 2 - ((z_ - Z_) / C_) ** 2)
            y_ = B_ * math.sqrt(k_)
            n = V((x_ / A_ ** 2, y_ / B_ ** 2, (z_ - Z_) / C_ ** 2)).normalized()
            p = V((x_, y_, z_)) + n * 0.0045
            parts.append(flat_patch('back_pocket', [(-0.03, 0.03), (0.03, 0.03), (0.03, -0.018), (0, -0.03), (-0.03, -0.018)], 0.003, p, n, back_pocket, ['Hips'], rigid='Hips'))
    for x in (-0.09, -0.04, 0.04, 0.09):   # หูเข็มขัด
        y = -math.sqrt(max(0.0, 1 - (x / 0.13) ** 2)) * 0.1
        parts.append(box_lo('loop', (x, y, 0.312), (0.009, 0.006, 0.022), stitch, ['Hips'], rigid='Hips'))
    return parts

def side_stripes(m, w=0.007, n=2, gap=0.012, top_z=0.3, bot_z=0.07):
    parts = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        for k in range(n):
            off = (k - (n - 1) / 2) * gap
            pts = []
            for i in range(14):
                z = top_z + (bot_z - top_z) * i / 13
                xx = 0.062 * sx + (0.065 - 0.062) * (0.245 - z) / 0.18 * sx
                rr = 0.064 if z > 0.135 else 0.058
                pts.append(V((xx + rr * sx, off, z)))
            parts.append(polyline('stripe', pts, w * 0.5, m, leg, tseg=5))
    return parts

def skirt(m, band, length=0.15, flare=0.19, pleats=18, depth=0.012, plaid=None, name='Skirt'):
    # เอวกระโปรงอยู่ใต้ชายเสื้อ (รัศมี < เสื้อ) — ใส่คู่กับเสื้อแล้วขอบเอวไม่ทะลุเสื้อ
    sk = flared('skirt', 0.308, 0.122, length, flare, m, G_HIPS, seg=40, pleats=pleats, depth=depth, flat=0.78)
    parts = [sk, tube_arc('band', (0, 0, 0.305), 0.124, 0.009, 0, 2 * math.pi, band, ['Hips'], plane='XY', seg=32, tseg=8, scale=(1, 0.78, 1))]
    return parts

# ---------------------------------------------------------------------
# รองเท้า
# ---------------------------------------------------------------------
def _sole_outline(sx, w_toe=0.056, w_heel=0.05, toe_y=-0.112, heel_y=0.052, n=28):
    """รูปฝ่าเท้า (ระนาบ XY) — ด้านในเว้า"""
    pts = []
    cy = (toe_y + heel_y) / 2
    L = (heel_y - toe_y) / 2
    for i in range(n):
        a = 2 * math.pi * i / n
        y = cy + math.sin(a) * L
        t = (y - toe_y) / (heel_y - toe_y)
        w = w_toe + (w_heel - w_toe) * t
        x = math.cos(a) * w * (1.0 if math.cos(a) * sx > 0 else 0.92)   # ด้านในแคบกว่าเล็กน้อย
        pts.append((0.066 * sx + x, y))
    return pts

def sole(sx, m, h=0.02, lip=None, n=28, scale=1.0, tread_m=None):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    import bmesh as _bm
    from eqlib import _obj_from_bm
    out = _sole_outline(sx, 0.056 * scale, 0.05 * scale, -0.112 - (scale - 1) * 0.02, 0.052 + (scale - 1) * 0.01, n)
    bm = _bm.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in out]
    hi = [bm.verts.new((x, y, h)) for x, y in out]
    bm.faces.new(list(reversed(lo))); bm.faces.new(hi)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm('sole', bm, m, leg)
    bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = min(0.006, h * 0.35); bv.segments = 3
    from eqlib import apply_mods
    apply_mods(ob)
    parts = [ob]
    if lip:   # เส้นคาดรอบพื้น (foxing)
        parts.append(tube_path('sole_line', [(x, y, h * 0.62) for x, y in out], 0.0022, lip, leg, closed=True, tseg=5))
    if tread_m:
        for k in range(5):
            y = -0.09 + k * 0.03
            parts.append(box_lo('lug', (0.066 * sx, y, 0.002), (0.085 * scale, 0.012, 0.006), tread_m, leg))
    return parts

def upper(sx, m, sole_h=0.02, high=0.0, opening=0.046, h=0.062, w=0.104, length=0.168, toe_round=0.45, low=False):
    """หน้ารองเท้า (หุ้มเท้า Base · เจาะช่องข้อเท้าจริง) · high = ความสูงข้อ (หุ้มข้อ/บูท)"""
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx
    up = rbox('upper', (x, -0.028, sole_h + h / 2 - 0.004), (w, length, h), m, leg, bevel=toe_round)
    oz = sole_h + h * (0.5 if low else 0.62)
    def snap(p):   # ขอบช่องข้อเท้าเป็นวงรีเรียบ
        dx, dy = (p.x - x) / opening, (p.y - 0.006) / (opening * 1.25)
        r = math.hypot(dx, dy)
        if p.z <= oz + 0.004:
            # ขอบที่ตัดผ่านผนังข้าง/ส้น (แถว vertex ต่ำกว่าเส้นตัด) → ยกขึ้นมาอยู่บนเส้นตัดพอดี (ไม่หยักเป็นฟันเลื่อย)
            return V((p.x, p.y, oz)) if p.z > oz - 0.02 else None
        if 0.6 < r < 1.45:
            return V((x + dx / r * opening, 0.006 + dy / r * opening * 1.25, p.z))
        return None
    delete_where(up, lambda p: p.z > oz and ((p.x - x) ** 2 / opening ** 2 + (p.y - 0.006) ** 2 / (opening * 1.25) ** 2) < 1, snap=snap)
    parts_trim = edge_trim('collar', up, lambda p: p.z > oz - 0.02, 0.006, m, leg, tseg=6)
    parts = [up] + parts_trim
    return parts, oz

def laces(sx, m, eyelet, sole_h=0.02, n=4, y0=-0.07, y1=-0.022, z0=None, z1=None, width=0.03):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx
    z0 = z0 if z0 is not None else sole_h + 0.042
    z1 = z1 if z1 is not None else sole_h + 0.056
    parts = []
    for i in range(n):
        t = i / max(1, n - 1)
        y, z = y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
        a, b = V((x - width / 2, y, z)), V((x + width / 2, y, z))
        parts.append(polyline('lace', [a, (a + b) / 2 + V((0, 0, 0.003)), b], 0.0024, m, leg, tseg=5))
        for e in (a, b):
            parts.append(disc('eyelet', e + V((0, 0, -0.001)), V((0, -0.3, 1)), 0.0042, 0.0015, eyelet, leg))
    # โบว์
    top = V((x, y1 + 0.004, z1 + 0.004))
    for sgn in (1, -1):
        parts.append(tube_arc('bow', (top.x + 0.01 * sgn, top.y, top.z + 0.004), 0.009, 0.0022, 0, 2 * math.pi, m, leg, plane='XZ', seg=10, tseg=4))
    return parts

def tongue(sx, m, sole_h=0.02, z=None):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx
    z = z if z is not None else sole_h + 0.06
    return [box_lo('tongue', (x, -0.018, z), (0.034, 0.03, 0.012), m, leg, rot=RX(-30), bevel=0.35)]

def shaft(sx, m, z0, z1, r0=0.053, r1=0.051, trim=None, cuff_h=0.0):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx
    parts = [tube_open('shaft', [(x, 0.002, z0), (x, 0.0, z1)], [r0, r1], m, leg, seg=18, cap_start=False, loop=0.012, thick=0.004)]
    if trim:
        parts.append(ring('shaft_top', (x, 0.0, z1), (0, 0, 1), r1 + 0.001, 0.006 if not cuff_h else 0.009, trim, leg, seg=18, tseg=5))
    if cuff_h:
        parts.append(tube_open('shaft_cuff', [(x, 0.0, z1 - cuff_h), (x, 0.0, z1)], [r1 + 0.008, r1 + 0.009], trim, leg, seg=18, cap_start=False, loop=0.012, thick=0.004))
    return parts

def side_panel(sx, m, sole_h=0.02, shape='swoosh'):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx + 0.053 * sx
    if shape == 'swoosh':
        pts = [(-0.035, -0.004), (0.02, 0.016), (0.04, 0.02), (0.005, 0.006), (-0.03, -0.012)]
    elif shape == 'stripes':
        pts = [(-0.02, -0.012), (0.0, 0.016), (0.008, 0.016), (-0.012, -0.012)]
    else:
        pts = [(-0.03, -0.01), (0.03, -0.01), (0.03, 0.01), (-0.03, 0.01)]
    out = []
    n = V((sx, 0, 0))
    up = V((0, 0, 1))
    c = V((x, -0.03, sole_h + 0.026))
    if shape == 'stripes':
        for k in range(3):
            out.append(flat_patch('panel', pts, 0.0025, c + V((0, -0.014 * k + 0.014, 0)), n, m, leg, up=up))
    else:
        out.append(flat_patch('panel', [(q[1] * sx * 0 + q[0], q[1]) for q in pts], 0.0025, c, n, m, leg, up=up))
    return out

def heel_tab(sx, m, sole_h=0.02):
    leg = G_LEG_L if sx > 0 else G_LEG_R
    x = 0.066 * sx
    return [flat_patch('heel_tab', [(-0.012, 0.0), (0.012, 0.0), (0.009, 0.03), (-0.009, 0.03)], 0.004, V((x, 0.058, sole_h + 0.03)), V((0, 1, 0)), m, leg)]
