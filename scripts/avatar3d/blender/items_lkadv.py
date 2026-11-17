"""
Loy Krathong River Journey 2026 (การผจญภัยล่องสายน้ำลอยกระทง · event loykrathong-adventure-2026) — ของรางวัล 3D จริง สวมได้ทุกชิ้น
  งอบใบลาน (หมวกครอบศีรษะ → มีระนาบตัดผม) · ตะกร้าสานใส่ดอกไม้ (สะพายหลัง) · เสื้อผ้าฝ้ายลายดอกบัว · สไบผ้าไหม (พาดเฉียง) · หิ่งห้อยคืนเพ็ญ (เอฟเฟกต์)
ใช้ตัวช่วยชุดเดียวกับ items_loykrathong.py (ผิวกลีบ/แผ่นผ้า _sheet · วางบนผิวเสื้อ _on_shell · หลอมรวม _organic) และแพตเทิร์นใน garments.py
"""
import math

import bmesh
from mathutils import Matrix, Vector

from eqdetail import edge_trim, fab, flat_patch, polyline, solidify
from eqlib import (G_TORSO, HEAD_C, HEAD_R, _obj_from_bm, capsule, ellipsoid, shell, tube_arc, tube_path)
from garments import shirt_body, sleeves, yoke_surface
from hair import smooth_path
from items_halloween import _organic
from items_loykrathong import _basis, _leaf, _on_shell, _sheet, _sm

V = Vector
H = ['Head']
TAU = 2 * math.pi


# =====================================================================
# งอบใบลาน (Ngob Woven Hat) · ทรงโดมกว้างลาดต่ำ สานใบลาน (สีฟาง) + แถบสานลายขัดสีเข้ม 3 วง + ขอบไม้ไผ่
#   · กระบังรองศีรษะ (โครงงอบ) แยกด้านใน ครอบศีรษะ + วงหวายรัด 2 วง + ไม้ค้ำ 4 อัน · จุกงอบด้านบน
#   ไม่มีสายรัดคาง: สายที่ลงต่ำกว่าขอบหมวกทำให้ระนาบตัดผม (fit จากจุดต่ำสุดของทรงหมวก) ผิด → ผมถูกตัดถึงคาง
# =====================================================================
NG_ZA, NG_D, NG_R = 1.10, 0.205, 0.37          # ยอดโดม · ความลึกโดม · รัศมีปีก (พิกัดต้นแบบ)
NG_BANDS = ((0.07, 0.088), (0.165, 0.185), (0.272, 0.292))
NG_CY = 0.01


def _ng_z(r):
    return NG_ZA - NG_D * (r / NG_R) ** 1.3


def C_lk_ngob():
    straw = fab('MAT_LK26_Ngob_Straw', '#dcc189', 'straw', 0.85, nstr=0.5)
    weave = fab('MAT_LK26_Ngob_Weave', '#8a6438', 'straw', 0.85, nstr=0.5)
    weave2 = fab('MAT_LK26_Ngob_Weave2', '#b88d55', 'straw', 0.85, nstr=0.5)
    under = fab('MAT_LK26_Ngob_Under', '#b08c58', 'straw', 0.9)
    rim = fab('MAT_LK26_Ngob_Rim', '#6e4a28', 'weave', 0.7, nstr=0.3)
    crown = fab('MAT_LK26_Ngob_Crown', '#c7a46c', 'straw', 0.9)
    C = V((0, NG_CY, 0))
    NA = 48
    # วงรัศมี: สม่ำเสมอ + ขอบ/กลางแถบสาน (กลางแถบนูนเป็นสันเปีย)
    mids = [(a + b) / 2 for a, b in NG_BANDS]
    req = [e for ab in NG_BANDS for e in ab] + mids
    uni = [0.012 + (NG_R - 0.012) * (k / 15) ** 0.95 for k in range(16)]
    rs = sorted(req + [r for r in uni if all(abs(r - q) > 0.0045 for q in req)])

    def bump(r):
        return sum(0.0028 * max(0.0, 1 - abs(r - m) / 0.007) for m in mids)

    def in_band(r0, r1):
        return any(a - 1e-6 <= r0 and r1 <= b + 1e-6 for a, b in NG_BANDS)

    def pt(r, a, dz=0.0):
        return C + V((math.cos(a) * r, math.sin(a) * r, _ng_z(r) + bump(r) + dz))
    # ผิวบน (ใบลานสาน)
    bm = bmesh.new()
    apex = bm.verts.new(C + V((0, 0, NG_ZA + 0.001)))
    rings = [[bm.verts.new(pt(r, TAU * j / NA)) for j in range(NA)] for r in rs]
    for j in range(NA):
        f = bm.faces.new((apex, rings[0][j], rings[0][(j + 1) % NA]))
        f.material_index = 0
    for i in range(len(rs) - 1):
        band = in_band(rs[i], rs[i + 1])
        for j in range(NA):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % NA], rings[i + 1][(j + 1) % NA], rings[i + 1][j]))
            # แถบสาน: สลับสองสีทีละช่อง (ลายขัดเปีย) · ช่วงอื่น = ใบลานสีฟาง
            f.material_index = (1 if j % 2 == 0 else 2) if band else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = _obj_from_bm('ngob_top', bm, straw, H, 'Head')
    for mm in (weave, weave2):
        top.data.materials.append(mm)
    if sum(p.normal.z for p in top.data.polygons) < 0:
        for p in top.data.polygons:
            p.flip()
    parts = [top]
    # ผิวล่าง (ด้านในงอบ) — ต่ำกว่าผิวบน 7 มม. หันลง
    bm = bmesh.new()
    rl = [0.012] + [NG_R * k / 9 for k in range(1, 10)]
    apex = bm.verts.new(C + V((0, 0, NG_ZA - 0.007)))
    rings = [[bm.verts.new(C + V((math.cos(TAU * j / NA) * r, math.sin(TAU * j / NA) * r, _ng_z(r) - 0.007))) for j in range(NA)] for r in rl]
    for j in range(NA):
        bm.faces.new((apex, rings[0][(j + 1) % NA], rings[0][j]))
    for i in range(len(rl) - 1):
        for j in range(NA):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % NA], rings[i][(j + 1) % NA]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    und = _obj_from_bm('ngob_under', bm, under, H, 'Head')
    if sum(p.normal.z for p in und.data.polygons) > 0:
        for p in und.data.polygons:
            p.flip()
    parts.append(und)
    # ขอบไม้ไผ่เข้าขอบ (ปิดรอยต่อบน/ล่าง)
    parts.append(tube_path('rim', [C + V((math.cos(TAU * j / NA) * NG_R, math.sin(TAU * j / NA) * NG_R, _ng_z(NG_R) - 0.0035)) for j in range(NA)],
                           0.0058, rim, H, closed=True, tseg=6, rigid='Head'))
    # จุกงอบ
    parts.append(capsule('knob', C + V((0, 0, NG_ZA - 0.006)), C + V((0, 0, NG_ZA + 0.02)), 0.017, 0.006, weave2, H, seg=12, rings=6, rigid='Head'))
    parts.append(tube_arc('knob_ring', (0, NG_CY, NG_ZA + 0.003), 0.0155, 0.0032, 0, TAU, rim, H, plane='XY', seg=16, tseg=4, rigid='Head'))
    # โครงงอบ (กระบังรองศีรษะ): ครอบศีรษะ (ทรงเดียวกับหมวกปีกกว้าง → ระนาบตัดผมเท่ากัน) + วงหวาย 2 วง + ไม้ค้ำ 4 อัน
    cc = HEAD_C + V((0, NG_CY, 0.04))
    cr = HEAD_R * V((1.1, 1.1, 0.98))
    parts.append(shell('crown', cc, cr, lambda d: d.z > 0.3, crown, H, seg=32, rings=16, rigid='Head', thick=0.01))
    for dz, tube in ((0.3, 0.0085), (0.43, 0.006)):
        k = math.sqrt(1 - dz * dz)
        z = cc.z + cr.z * dz + (0.004 if dz < 0.35 else 0.0)
        parts.append(tube_arc('crown_ring', (0, NG_CY, z), cr.x * k + 0.006, tube, 0, TAU, rim, H, plane='XY', seg=40, tseg=5, rigid='Head',
                              scale=(1, (cr.y * k + 0.006) / (cr.x * k + 0.006), 1)))
    for q in range(4):
        a = TAU * (q + 0.5) / 4
        dx, dy = math.cos(a), math.sin(a)
        r = 0.11
        u = math.sqrt(max(0.0, 1 - (r * dx / cr.x) ** 2 - (r * dy / cr.y) ** 2))
        z0 = cc.z + cr.z * u + 0.006
        parts.append(capsule('strut', V((r * dx, NG_CY + r * dy, z0)), V((r * dx, NG_CY + r * dy, _ng_z(r) - 0.008)), 0.0035, 0.0035, rim, H, seg=6, rings=4, rigid='Head'))
    return parts


# =====================================================================
# ตะกร้าสานใส่ดอกไม้ (Flower Basket Backpack) · ตะกร้าไผ่สานทรงสี่เหลี่ยมมุมมน (ลายขัด 2 สี + ร่องเส้นตอก) ขอบม้วน 2 ชั้น
#   ในตะกร้า: ดาวเรือง (ส้ม/เหลือง) · ดอกบัวตูม 2 ดอก · ใบตอง 3 ใบ · สายสะพายผ้าฝ้ายทอแบน 2 เส้น (ข้ามบ่าลงหน้าอก + สายล่างอ้อมใต้แขน)
# =====================================================================
BK_CY, BK_Z0, BK_Z1 = 0.186, 0.315, 0.485


def _bk_sec(th, z):
    """หน้าตัดตะกร้า (สี่เหลี่ยมมุมมน) ที่ระดับ z → (x, y-offset) + normal 2D"""
    t = (z - BK_Z0) / (BK_Z1 - BK_Z0)
    a, b = 0.074 + 0.014 * t, 0.054 + 0.012 * t
    c, s = math.cos(th), math.sin(th)
    p = 0.62
    x = a * math.copysign(abs(c) ** p, c)
    y = b * math.copysign(abs(s) ** p, s)
    n = V((x / (a * a), y / (b * b), 0)).normalized()
    return x, y, n


def _lotus_bud(base, d, L, r, m_base, m_tip, bones, rigid, tseg=10, nl=8):
    """ดอกบัวตูม: ผิวหมุนรอบแกนรูปหยดน้ำ ปลายแหลม · ร่องกลีบ 5 กลีบ · ปลายกลีบชมพูเข้ม (วัสดุแยก)"""
    d = V(d).normalized()
    n, a, b = _basis(d)
    bm = bmesh.new()
    rows = []
    for i in range(1, nl):
        t = i / nl
        rr = r * math.sin(math.pi * min(1.0, t / 0.84) * 0.5 + (0.0 if t < 0.42 else 0.0)) ** 0.7 * (1 - max(0.0, (t - 0.42) / 0.58) ** 1.7)
        rr = max(rr, r * 0.18)
        c = base + d * (L * t)
        row = []
        for j in range(tseg):
            th = TAU * j / tseg
            lobe = 1 - 0.1 * abs(math.sin(2.5 * th))
            row.append(bm.verts.new(c + (a * math.cos(th) + b * math.sin(th)) * rr * lobe))
        rows.append(row)
    bot = bm.verts.new(base)
    tip = bm.verts.new(base + d * L * 1.02)
    for j in range(tseg):
        bm.faces.new((bot, rows[0][(j + 1) % tseg], rows[0][j]))
        f = bm.faces.new((tip, rows[-1][j], rows[-1][(j + 1) % tseg]))
        f.material_index = 1
    for k, (r0, r1) in enumerate(zip(rows, rows[1:])):
        for j in range(tseg):
            f = bm.faces.new((r0[j], r0[(j + 1) % tseg], r1[(j + 1) % tseg], r1[j]))
            f.material_index = 1 if (k + 1) / nl > 0.62 else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bm('lotus_bud', bm, m_base, bones, rigid)
    ob.data.materials.append(m_tip)
    return ob


def _strap_normal(p):
    return V((p.x * 0.5, p.y, max(0.0, p.z - 0.5))).normalized()


def _flat_strap(name, pts, w, h, m, bones, rigid):
    from items_loykrathong import _ribbon
    return _ribbon(name, pts, [_strap_normal(p) for p in pts], w, h, m, bones, rigid)


def K_lk_basket():
    s1 = fab('MAT_LK26_Basket', '#d0a362', 'straw', 0.8, nstr=0.45)
    s2 = fab('MAT_LK26_Basket_Weave', '#a77537', 'straw', 0.8, nstr=0.45)
    inner = fab('MAT_LK26_Basket_Inner', '#7c5630', 'straw', 0.9)
    rimm = fab('MAT_LK26_Basket_Rim', '#8a5c2c', 'weave', 0.7, nstr=0.3)
    strap = fab('MAT_LK26_Basket_Strap', '#9a3b2e', 'canvas', 0.85, nstr=0.35)
    mari = fab('MAT_LK26_Basket_Marigold', '#ff8f12', None, 0.7)
    mari2 = fab('MAT_LK26_Basket_Marigold2', '#ffc21f', None, 0.7)
    lot = fab('MAT_LK26_Basket_Lotus', '#ffc4d4', None, 0.5)
    lot_tip = fab('MAT_LK26_Basket_LotusTip', '#e8507d', None, 0.5)
    leaf = fab('MAT_LK26_Basket_Leaf', '#3f8f3a', 'corduroy', 0.6, nstr=0.3)
    B = ['Chest']
    NS, NR = 28, 11
    zs = [BK_Z0 + (BK_Z1 - BK_Z0) * k / NR for k in range(NR + 1)]
    # ผนังนอก: ลายขัด 2 สี (ช่อง 2×1) + ร่องระหว่างเส้นตอกแนวนอน (แถวคี่ยุบเข้า 1.6 มม.)
    bm = bmesh.new()
    rows = []
    for k, z in enumerate(zs):
        row = []
        for i in range(NS):
            th = TAU * i / NS
            x, y, n = _bk_sec(th, z)
            g = -0.0016 if (k % 2 and 0 < k < NR) else 0.0
            row.append(bm.verts.new(V((x, BK_CY + y, z)) + n * g))
        rows.append(row)
    for k in range(NR):
        for i in range(NS):
            f = bm.faces.new((rows[k][i], rows[k][(i + 1) % NS], rows[k + 1][(i + 1) % NS], rows[k + 1][i]))
            f.material_index = 1 if ((i // 2) + k) % 2 else 0
    # ก้นตะกร้า (ยกเข้าข้างในเล็กน้อย)
    cb = bm.verts.new(V((0, BK_CY, BK_Z0 + 0.006)))
    for i in range(NS):
        f = bm.faces.new((cb, rows[0][(i + 1) % NS], rows[0][i]))
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    wall = _obj_from_bm('basket', bm, s1, B, 'Chest')
    wall.data.materials.append(s2)
    if sum(p.normal.dot(p.center - V((0, BK_CY, p.center.z))) for p in wall.data.polygons) < 0:
        for p in wall.data.polygons:
            p.flip()
    parts = [wall]
    # ผนังใน (ช่วงบน) + ชั้นใบตองรองดอกไม้ (ปิดก้นตะกร้าที่มองจากด้านบน)
    bm = bmesh.new()
    zi = [BK_Z1 - 0.05, BK_Z1]
    rr = [[bm.verts.new(V((_bk_sec(TAU * i / 20, z)[0], BK_CY + _bk_sec(TAU * i / 20, z)[1], z)) - _bk_sec(TAU * i / 20, z)[2] * 0.006) for i in range(20)] for z in zi]
    for i in range(20):
        bm.faces.new((rr[0][i], rr[1][i], rr[1][(i + 1) % 20], rr[0][(i + 1) % 20]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    iw = _obj_from_bm('basket_in', bm, inner, B, 'Chest')
    if sum(p.normal.dot(p.center - V((0, BK_CY, p.center.z))) for p in iw.data.polygons) > 0:
        for p in iw.data.polygons:
            p.flip()
    parts.append(iw)
    bm = bmesh.new()
    zf = BK_Z1 - 0.022
    ring_ = [bm.verts.new(V((_bk_sec(TAU * i / 20, zf)[0] * 0.93, BK_CY + _bk_sec(TAU * i / 20, zf)[1] * 0.93, zf))) for i in range(20)]
    cf = bm.verts.new(V((0, BK_CY, zf + 0.012)))
    for i in range(20):
        bm.faces.new((cf, ring_[i], ring_[(i + 1) % 20]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fill = _obj_from_bm('fill', bm, leaf, B, 'Chest')
    if sum(p.normal.z for p in fill.data.polygons) < 0:
        for p in fill.data.polygons:
            p.flip()
    parts.append(fill)
    # ขอบม้วน 2 ชั้น + ขอบล่าง (ตีนตะกร้า)
    for z, off, rad in ((BK_Z1 + 0.002, 0.001, 0.0062), (BK_Z1 - 0.011, 0.002, 0.0048), (BK_Z0 + 0.004, 0.002, 0.0055)):
        pts = []
        for i in range(36):
            x, y, n = _bk_sec(TAU * i / 36, z)
            pts.append(V((x, BK_CY + y, z)) + n * off)
        parts.append(tube_path('rim', pts, rad, rimm, B, closed=True, tseg=5, rigid='Chest'))
    # ห่วงหูหิ้วสาน (ด้านบน 2 ข้าง)
    for sx in (1, -1):
        x, y, n = _bk_sec(0.0 if sx > 0 else math.pi, BK_Z1)
        c = V((x, BK_CY + y, BK_Z1))
        parts.append(polyline('loop', smooth_path([c + V((0, -0.016, -0.006)), c + V((0.012 * sx, -0.012, 0.016)), c + V((0.014 * sx, 0.012, 0.016)), c + V((0, 0.016, -0.006))], 1),
                              0.0035, rimm, B, rigid='Chest', tseg=4))
    # ดาวเรือง 4 ดอก (กลีบฟูหลอมผิวเดียว)
    for k, (cx, cy, cz, r, mm) in enumerate(((-0.044, 0.2, 0.488, 0.026, mari), (0.036, 0.212, 0.49, 0.027, mari2), (0.004, 0.168, 0.482, 0.023, mari),
                                              (0.058, 0.17, 0.478, 0.02, mari), (-0.018, 0.232, 0.478, 0.021, mari2))):
        c = V((cx, cy, cz))
        pp = [ellipsoid('core', c, (r * 0.6, r * 0.6, r * 0.45), mm, B, seg=10, rings=6, rigid='Chest')]
        for i in range(30):
            zz = 1 - 1.55 * (i + 0.5) / 30
            rq = math.sqrt(max(0.0, 1 - zz * zz))
            a = i * 2.39996 + k
            dv = V((math.cos(a) * rq, math.sin(a) * rq, zz * 0.75))
            pp.append(ellipsoid('mp', c + dv * r * 0.62, (r * 0.3, r * 0.3, r * 0.2), mm, B, seg=8, rings=5, rigid='Chest'))
        parts.append(_organic('marigold', pp, mm, B, 'Chest', voxel=0.0014, smooth=2, tris=240))
    # ดอกบัวตูม 2 ดอก + ก้าน
    for base, d, L, r in ((V((-0.016, 0.214, 0.468)), V((-0.32, 0.22, 1.0)), 0.068, 0.0155), (V((0.022, 0.19, 0.47)), V((0.28, 0.12, 1.0)), 0.058, 0.0135)):
        parts.append(_lotus_bud(base, d, L, r, lot, lot_tip, B, 'Chest'))
        parts.append(capsule('lotus_stem', base - V(d).normalized() * 0.02, base + V(d).normalized() * 0.004, 0.0035, 0.0035, leaf, B, seg=6, rings=4, rigid='Chest'))
    # ใบตอง 3 ใบ โผล่ขอบตะกร้า
    for base, d, up, L, W in ((V((-0.05, 0.215, 0.47)), V((-0.7, 0.45, 0.85)), V((0, 1, 0)), 0.088, 0.02),
                               (V((0.055, 0.205, 0.47)), V((0.75, 0.35, 0.8)), V((0, 1, 0)), 0.08, 0.019),
                               (V((0.005, 0.235, 0.468)), V((0.12, 0.85, 0.75)), V((1, 0, 0)), 0.07, 0.018)):
        parts.append(_leaf(base, d, up, L, W, leaf, droop=0.02, bones=B, rigid='Chest', thick=0.0022, nu=10))
    # สายสะพาย (ผ้าฝ้ายทอแบน): ขอบตะกร้าด้านบน → ข้ามบ่า → ลงหน้าอก · สายล่าง: มุมล่างตะกร้า → อ้อมข้างลำตัว (หายใต้แขน)
    # วางตามผิวนอกของเสื้อ (yoke_surface + 4 มม.) → ไม่จมในเสื้อตรงบ่า และไม่ลอยห่างตัวมาก
    Pk = yoke_surface(0.004)
    for sx in (1, -1):
        ph = math.pi * 0.5 * sx
        top = Pk(ph, 0.016)
        on = lambda x, z, bk: _on_shell(x * sx, z, back=bk, off=0.004, lift=0.004)[0]
        pts = [V((0.052 * sx, 0.13, 0.47))] + [on(0.068 + 0.003 * k, z, True) for k, z in enumerate((0.5, 0.53, 0.556, 0.576, 0.59))]
        pts += [top[0] + top[1] * 0.004]
        pts += [on(0.078 + 0.004 * k, z, False) for k, z in enumerate((0.59, 0.576, 0.556, 0.53, 0.5, 0.465, 0.43, 0.395, 0.36))]
        parts.append(_flat_strap('strap', pts, 0.022, 0.0042, strap, B, 'Chest'))
        parts.append(flat_patch('strap_end', [(-0.011, -0.004), (0.011, -0.004), (0.011, 0.004), (-0.011, 0.004)], 0.0016,
                                pts[-1] + _strap_normal(pts[-1]) * 0.0021, _strap_normal(pts[-1]), rimm, B, rigid='Chest', bevel=0))
        low = [V((0.06 * sx, 0.14, 0.335))] + [on(x, 0.34, True) for x in (0.085, 0.105, 0.122, 0.136)]
        parts.append(_flat_strap('strap_low', low, 0.02, 0.004, strap, B, 'Chest'))
    return parts


# =====================================================================
# เสื้อผ้าฝ้ายลายดอกบัว (Lotus Print Shirt) · คอกลม แขนสั้น ผ้าฝ้ายสีครีมอมชมพู · ลายพิมพ์ดอกบัว (ชมพูเข้ม/อ่อน) ใบบัว ดอกตูม ทั้งหน้า-หลัง
#   ลายพิมพ์ = แผ่นบางวางบนผิวเสื้อจริง (_on_shell) แบบเดียวกับลายยกดอกของเสื้อผ้าไหม T_lk_silk
# =====================================================================
def _rot2(pts, ang, dx=0.0, dy=0.0, s=1.0):
    c, sn = math.cos(ang), math.sin(ang)
    return [((x * c - y * sn) * s + dx, (x * sn + y * c) * s + dy) for x, y in pts]


def _petal_pts(L, W, n=6):
    """กลีบบัว (มองด้านข้าง): โคนแคบ ป่องกลาง ปลายแหลม — ฐานที่ (0,0) ชี้ขึ้น +y"""
    right = []
    for k in range(1, n + 1):
        u = k / (n + 1)
        w = W * math.sin(math.pi * u ** 0.8) ** 0.85
        right.append((w, L * u))
    return [(0.0, 0.0)] + right + [(0.0, L)] + [(-x, y) for x, y in reversed(right)]


def _pad_pts(r, n=12):
    """ใบบัว (กลม มีรอยเว้า V)"""
    out = [(0.0, 0.0)]
    for k in range(n + 1):
        a = math.radians(-70 + 320 * k / n)
        out.append((math.cos(a) * r, math.sin(a) * r))
    return out


def _stem_pts(L, w, bend):
    left, right = [], []
    for k in range(5):
        t = k / 4
        x = bend * math.sin(math.pi * t * 0.8)
        left.append((x - w / 2, -L * t))
        right.append((x + w / 2, -L * t))
    return left + list(reversed(right))


def _lotus_print(x, z, back, kind, s, rot, mats):
    deep, light, pale, green, green2 = mats
    p, n = _on_shell(x, z, back=back, lift=0.0048)
    bones = ['Chest'] if z > 0.42 else ['Spine']
    out = []
    dep = 0.0007

    def patch(pts, m, layer):
        out.append(flat_patch('lprint', _rot2(pts, rot, s=s), dep, p + n * (layer * 0.00055), n, m, bones, bevel=0))
    if kind == 'flower':
        patch(_stem_pts(0.022, 0.0026, 0.004), green, 0)
        patch(_rot2(_pad_pts(0.0105), 0.4, 0.016, -0.017), green2, 0)
        for sg in (1, -1):
            patch(_rot2(_petal_pts(0.019, 0.0075), -sg * 1.08, 0.0, 0.0), deep, 1)
        for sg in (1, -1):
            patch(_rot2(_petal_pts(0.023, 0.0078), -sg * 0.5, 0.0, 0.0), light, 2)
        patch(_petal_pts(0.026, 0.0078), pale, 3)
        patch([(math.cos(a) * 0.009, -0.0015 + math.sin(a) * 0.0035) for a in [math.pi + math.pi * k / 8 for k in range(9)]], green, 4)
    elif kind == 'bud':
        patch(_stem_pts(0.02, 0.0024, -0.003), green, 0)
        patch(_petal_pts(0.02, 0.0062), deep, 1)
        patch(_rot2(_petal_pts(0.016, 0.0045), 0.0, 0.0, 0.002), light, 2)
    else:   # ใบบัวคู่
        patch(_pad_pts(0.0125), green2, 0)
        patch(_rot2(_pad_pts(0.0085), 2.2, -0.014, 0.008), green, 1)
    return out


def T_lk_lotus():
    m = fab('MAT_LK26_LotusTee', '#f4d5ca', 'weave', 0.88, nstr=0.35)
    trim = fab('MAT_LK26_LotusTee_Trim', '#efb3c4', 'rib', 0.85)
    mats = (fab('MAT_LK26_LotusTee_PrintDeep', '#e2587f', None, 0.8), fab('MAT_LK26_LotusTee_PrintPink', '#f490b0', None, 0.8),
            fab('MAT_LK26_LotusTee_PrintPale', '#ffc8d8', None, 0.8), fab('MAT_LK26_LotusTee_PrintLeaf', '#4f9a55', None, 0.8),
            fab('MAT_LK26_LotusTee_PrintPad', '#7bb86a', None, 0.8))
    parts = shirt_body(m, neck='crew', trim=trim) + sleeves(m, 'short', trim=trim)
    front = [(-0.072, 0.285, 'flower', 1.5, 0.1), (0.028, 0.29, 'bud', 1.45, -0.12), (0.098, 0.3, 'pad', 1.1, 0.4),
             (-0.105, 0.37, 'bud', 1.3, 0.25), (-0.022, 0.37, 'pad', 1.3, -0.3), (0.066, 0.36, 'flower', 1.5, -0.08),
             (-0.07, 0.445, 'flower', 1.45, 0.06), (0.022, 0.445, 'bud', 1.35, 0.15), (0.096, 0.45, 'pad', 1.1, 0.7),
             (-0.03, 0.505, 'pad', 1.05, 0.2), (0.055, 0.505, 'flower', 1.15, -0.1)]
    back = [(-0.068, 0.29, 'flower', 1.5, -0.1), (0.035, 0.3, 'pad', 1.35, 0.3), (0.1, 0.36, 'bud', 1.3, -0.2),
            (-0.03, 0.37, 'bud', 1.4, 0.1), (0.06, 0.38, 'flower', 1.45, 0.12), (-0.1, 0.4, 'pad', 1.1, 0.5),
            (-0.06, 0.455, 'flower', 1.4, -0.05), (0.04, 0.46, 'pad', 1.2, -0.4), (0.0, 0.515, 'bud', 1.05, 0.0)]
    for lst, bk in ((front, False), (back, True)):
        for x, z, kind, s, rot in lst:
            parts += _lotus_print(x, z, bk, kind, s * (1.15 if kind == 'flower' else 1.05), rot, mats)
    return parts


# =====================================================================
# สไบผ้าไหม (Silk Sabai Sash) · ผ้าไหมสีบานเย็นเข้ม พาดบ่าซ้ายเฉียงผ่านอก → ใต้แขนขวา/สะโพกขวา → ขึ้นหลังกลับบ่าซ้าย
#   กว้างกว่าผ้าขาวม้า (จีบรวบแคบที่บ่า บานกว้างที่อก/หลัง) · จีบผ้าตามยาว · เชิงทองทอยกดอกทั้งสองริม + ลายดอกทองประปราย
#   · ชายสไบห้อยจากบ่าซ้ายลงกลางหลังซ้าย (ขอบทอง + พู่ทอง)
# =====================================================================
SB_CELL = 0.0085


def O_lk_sabai():
    M = [fab('MAT_LK26_Sabai', '#8c1d64', 'poly', 0.36, metal=0.16, nstr=0.25), fab('MAT_LK26_Sabai_Gold', '#d9a840', 'weave', 0.32, metal=0.5, nstr=0.3),
         fab('MAT_LK26_Sabai_GoldMotif', '#f2cf72', None, 0.3, metal=0.65), fab('MAT_LK26_Sabai_Deep', '#5e1450', 'poly', 0.38, metal=0.14, nstr=0.25)]
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
    ctrl = [(0.5, None, 0.05), (0.74, 0.5, None), (0.92, 0.42, None), (1.1, 0.345, None), (1.27, 0.29, None), (1.42, 0.275, None),
            (1.6, 0.285, None), (1.8, 0.33, None), (2.0, 0.405, None), (2.2, 0.49, None), (2.36, None, 0.07)]
    cp = [(math.pi * ph, s if s is not None else s_at(math.pi * ph, z)) for ph, z, s in ctrl]
    loop = cp + [(cp[0][0] + TAU, cp[0][1])]
    ext = [(loop[-2][0] - TAU, loop[-2][1])] + loop + [(loop[1][0] + TAU, loop[1][1])]
    dense = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for t in [k / 24 for k in range(24)]:
            t2, t3 = t * t, t * t * t
            dense.append(tuple(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
    P3 = [P(ph, s)[0] for ph, s in dense]
    acc = [0.0]
    for i in range(1, len(P3)):
        acc.append(acc[-1] + (P3[i] - P3[i - 1]).length)
    Ltot = acc[-1] + (P3[0] - P3[-1]).length
    N = int(Ltot / SB_CELL)

    def ps_at(L):
        L = L % Ltot
        i = 1
        while i < len(acc) and acc[i] < L:
            i += 1
        if i >= len(acc):
            return dense[-1]
        t = (L - acc[i - 1]) / max(1e-9, acc[i] - acc[i - 1])
        return tuple(dense[i - 1][c] + (dense[i][c] - dense[i - 1][c]) * t for c in (0, 1))
    NV = 14

    def width(L):
        f = _sm(min(L, Ltot - L) / 0.13)          # รวบจีบแคบที่บ่า → บานเต็มผืน
        return 0.074 + 0.044 * f, f
    bm = bmesh.new()
    grid = []
    for i in range(N):
        L = Ltot * i / N
        W, f = width(L)
        ph, s = ps_at(L)
        p, nrm = P(ph, s)
        ph2, s2 = ps_at(L + 0.004)
        T = (P(ph2, s2)[0] - p).normalized()
        wv = nrm.cross(T).normalized()
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
            e = abs(j / NV - 0.5) * 2
            # จีบตามยาว (ที่บ่าลึกกว่า) + คลื่นผ้าทิ้งตัวเฉียง ๆ + ริมผ้าม้วนขึ้น
            pleat = (0.0026 + 0.0024 * (1 - f)) * (0.5 + 0.5 * math.sin(TAU * 2.0 * j / NV + 0.6))
            drape = 0.0016 * (0.5 + 0.5 * math.sin(TAU * L / 0.11 + 2.4 * j / NV))
            lift = 0.0032 + pleat + drape + 0.0014 * e * e
            row.append(bm.verts.new(q + qn * lift))
        grid.append(row)
    for i in range(N):
        i2 = (i + 1) % N
        for j in range(NV):
            f = bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j + 1], grid[i][j + 1]))
            jj = min(j, NV - 1 - j)
            if jj == 0:
                mi = 1                                   # เชิงทอง
            elif jj == 1:
                mi = 2 if i % 2 == 0 else 3              # ลายเชิงทองสลับเข้ม
            elif jj == 3 and i % 6 == 3:
                mi = 2                                   # ดอกทองประปราย (ใกล้เชิง)
            elif j == NV // 2 and i % 6 == 0:
                mi = 2
            else:
                mi = 0
            f.material_index = mi
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    band = _obj_from_bm('sabai', bm, M[0], G_TORSO)
    for mm in M[1:]:
        band.data.materials.append(mm)
    if sum(p.normal.dot(p.center - V((0, 0, p.center.z))) for p in band.data.polygons) < 0:
        for p in band.data.polygons:
            p.flip()
    solidify(band, 0.003, offset=-1.0)
    parts = [band]
    parts += edge_trim('gold_edge', band, lambda p: True, 0.0019, M[1], G_TORSO, tseg=4, min_len=0.3)
    # ชายสไบห้อยหลัง: จากบ่าซ้ายลงถึงระดับสะโพก — ลอยเหนือแถบสไบตรงที่ทับกัน
    band_pts = P3[::2]
    W_half = 0.059
    ph0, ph1 = math.pi * 0.2, math.pi * 0.44
    s0 = 0.04
    s1 = s_at(math.pi * 0.32, 0.27)

    def Pt(u, v):
        ph = ph0 + (ph1 - ph0) * v
        s = s0 + (s1 - s0) * u
        q, qn = P(ph, s)
        d = min((q - b).length for b in band_pts)
        w = _sm((W_half + 0.012 - d) / 0.022)
        lift = 0.0062 + 0.0092 * w + 0.0026 * (0.5 + 0.5 * math.sin(TAU * 1.5 * v + 0.4)) + 0.006 * u * u
        return q + qn * lift
    NU, NVt = 18, 8

    def tmats(u, v):
        if v < 1 / NVt or v > 1 - 1 / NVt or u > 1 - 1.5 / NU:
            return 1
        if u > 1 - 3 / NU:
            return 2 if int(v * NVt) % 2 == 0 else 3
        return 0
    tail = _sheet('sabai_tail', Pt, NU, NVt, M, bones=G_TORSO, rigid=None, thick=0.003, offset=0.0, mats=tmats)
    parts.append(tail)
    gold = M[1]
    for i in range(7):
        v = (i + 0.5) / 7
        a = Pt(1.0, v)
        b = a + V((0, 0.002, -0.018))
        parts.append(capsule('tassel', a, b, 0.0016, 0.0024, gold, G_TORSO, seg=6, rings=4))
    return parts


# =====================================================================
# หิ่งห้อยคืนเพ็ญ (Firefly Glow) · เอฟเฟกต์: หิ่งห้อย 6 ตัวบินวนรอบตัว (ก้นเรืองแสงเหลืองเขียว) + แสงเป็นทางตามวงโคจร
#   ชิ้นแข็งติด Root แบบเดียวกับ fx_lk26_krathong (ไม่มี animation แยก — แนววงโคจร/ทางแสงบอกการบินวน)
# =====================================================================
def _firefly(c, d, s, mats, seed):
    body, shield, glow, wing, _trail = mats
    d = V(d).normalized()
    up0 = V((0, 0, 1))
    side = d.cross(up0).normalized()
    up = side.cross(d).normalized()
    R = Matrix((side, d, up)).transposed()
    out = []
    out.append(ellipsoid('lantern', c - d * 0.011 * s - up * 0.001 * s, (0.0074 * s, 0.0118 * s, 0.0066 * s), glow, ['Root'], seg=10, rings=6, rigid='Root', rot=R))
    out.append(ellipsoid('elytra', c + d * 0.001 * s + up * 0.0028 * s, (0.0078 * s, 0.0112 * s, 0.0044 * s), body, ['Root'], seg=8, rings=5, rigid='Root', rot=R))
    out.append(ellipsoid('pronotum', c + d * 0.0105 * s + up * 0.0012 * s, (0.0066 * s, 0.0052 * s, 0.0042 * s), shield, ['Root'], seg=8, rings=5, rigid='Root', rot=R))
    hc = c + d * 0.0155 * s - up * 0.0006 * s
    out.append(ellipsoid('head', hc, (0.0034 * s, 0.0034 * s, 0.0032 * s), body, ['Root'], seg=6, rings=4, rigid='Root', rot=R))
    for sg in (1, -1):
        out.append(polyline('antenna', [hc + d * 0.002 * s, hc + (d * 0.008 + side * 0.004 * sg + up * 0.004) * s, hc + (d * 0.012 + side * 0.008 * sg + up * 0.009) * s],
                            0.0007 * s, body, ['Root'], rigid='Root', tseg=3))
        wd = (-d * 0.55 + side * 0.75 * sg + up * 0.45).normalized()
        wn = (up - wd * up.dot(wd)).normalized()
        outline = [(math.cos(TAU * k / 12) * 0.0048 * s, math.sin(TAU * k / 12) * 0.0105 * s) for k in range(12)]
        out.append(flat_patch('wing', outline, 0.0006 * s, c + up * 0.006 * s + wd * 0.0095 * s, wn, wing, ['Root'], rigid='Root', up=wd, bevel=0))
    return out


def E_lk_fireflies():
    mats = (fab('MAT_LK26_Firefly_Body', '#3a2a24', None, 0.5),
            fab('MAT_LK26_Firefly_Shield', '#e0643a', None, 0.5),
            fab('MAT_LK26_Firefly_Glow', '#eaff7a', None, 0.3, emission='#c8ff2e'),
            fab('MAT_LK26_Firefly_Wing', '#dfe9f2', None, 0.25, emission='#3c4a58'),
            fab('MAT_LK26_Firefly_Light', '#f4ffb0', None, 0.3, emission='#9ccf1a'))
    trail_m = mats[4]
    out = []
    # (มุม°, รัศมี, สูง, ขนาด, ไต่ระดับ) — ตัวที่สูงระดับหมวกอยู่นอกปีกหมวกกว้างที่สุด (งอบ/หมวกปีกกว้าง ~0.4 ม.)
    spec = ((232, 0.47, 0.98, 1.85, 0.22), (305, 0.36, 0.6, 1.75, 0.18), (25, 0.48, 0.8, 1.8, -0.12), (140, 0.39, 0.47, 1.65, 0.22),
            (95, 0.42, 1.12, 1.6, -0.1), (190, 0.42, 0.26, 1.65, 0.15))
    for k, (ang, r, z, s, climb) in enumerate(spec):
        a = math.radians(ang)
        c = V((math.cos(a) * r, math.sin(a) * r, z))
        d = V((-math.sin(a), math.cos(a), climb))
        out += _firefly(c, d, s, mats, k)
        # ทางแสงตามวงโคจร (จุดเรืองแสงเล็กลงเรื่อย ๆ ด้านหลัง)
        for q in range(1, 5):
            aa = a - q * 0.085
            zz = z - climb * r * q * 0.085
            rq = 0.0038 * (1 - q * 0.17) * s
            out.append(ellipsoid('trail', V((math.cos(aa) * r, math.sin(aa) * r, zz)), (rq, rq, rq), trail_m, ['Root'], seg=6, rings=4, rigid='Root'))
    return out
