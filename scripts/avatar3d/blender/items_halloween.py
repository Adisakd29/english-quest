"""
Halloween Costume Festival 2026 — ของรางวัลกิจกรรม (โมเดล 3D จริง สวมได้ทุกชิ้น)
Login 7 วัน: Pumpkin Hat · Bat Wings · Ghost Hoodie · Witch Hat · Halloween Boots · Pumpkin Backpack · Midnight Costume Set (เสื้อคลุม + กางเกง + เข็มกลัด)
เควสต์การเรียน: Candy Corn Necklace · Bat Glasses · (พื้นหลังโปรไฟล์ = ภาพ 2D)
รูปทรงอินทรีย์ (ฟักทอง ก้าน ปีก) ปั้นจากผิวโค้ง + กลีบ + voxel remesh/smooth (เหมือนทรงผม v3) — ไม่ใช่ primitive วางต่อกัน
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

from eqdetail import box_lo, delete_where, disc, displace, fab, flat_patch, polyline, ring, solidify, torso_point, tube_open
from eqlib import (G_ARM_L, G_ARM_R, G_LEG_L, G_LEG_R, G_TORSO, HEAD_C, HEAD_R, _obj_from_bm, apply_mods, capsule, ellipsoid, prism,
                   shell, star_pts, tube_arc, tube_path)
from garments import RX, RY, RZ, fold_collar, hood, laces, mat_metal, pants, shaft, shirt_body, side_stripes, sleeves
from hair import fuse, smooth_path, sweep
from items_head import _neck_curve, straps
from items_wear import _shoe_common, lapels

V = Vector
H = ['Head']


def _organic(name, objs, m, bones, rigid, voxel=0.0022, smooth=3, tris=3000):
    """หลอมชิ้นอินทรีย์ (ฟักทอง ก้าน) เป็นผิวเดียว — ใช้ fuse ของระบบผม แล้วเปลี่ยนการผูกกระดูก"""
    ob = fuse(name, objs, m, voxel=voxel, smooth=smooth, target_tris=tris)
    ob['eq_bones'] = ','.join(bones)
    ob['eq_rigid'] = rigid
    if 'eq_hair' in ob:
        del ob['eq_hair']
    return ob


def _stem(bm, base, up, length=0.06, r=0.016, curl=0.6, twist=1.2):
    """ก้านฟักทอง: เรียว โค้ง บิดเกลียว (หน้าตัดแปดเหลี่ยมเป็นสัน)"""
    up = V(up).normalized()
    side = up.orthogonal().normalized()
    pts = []
    for i in range(14):
        t = i / 13
        pts.append(V(base) + up * (length * t) + side * (length * curl * t * t * 0.6))
    sweep(bm, smooth_path(pts, 1), r * 2, r * 1.8, w1=0.55, h1=0.55, k=8, taper=1.0, twist=twist, up_fn=lambda p: side)


def _lobed(v, c, n=10, depth=0.06, sharp=3.0):
    """ร่องกลีบฟักทอง: ดึงผิวเข้าตามแนวร่อง n ร่อง"""
    q = v - c
    a = math.atan2(q.y, q.x)
    g = (0.5 + 0.5 * math.cos(n * a)) ** sharp      # 1 = กลางกลีบ · 0 = ร่อง
    k = 1 - depth * (1 - g)
    return c + V((q.x * k, q.y * k, q.z * (1 - depth * 0.35 * (1 - g))))


# =====================================================================
# Day 1 — Pumpkin Hat (หมวกไหมพรมทรงฟักทอง หน้าแจ็กโอแลนเทิร์นยิ้ม ก้านบิด ใบ เถาม้วน)
# =====================================================================
def C_hw_pumpkin():
    m = fab('MAT_HW_Pumpkin', '#f2892a', 'knit', 0.9, nstr=0.45)
    rib = fab('MAT_HW_Pumpkin_Rib', '#d9701c', 'rib', 0.9)
    stem_m = fab('MAT_HW_Pumpkin_Stem', '#5e7d2f', 'leather', 0.8)
    face = fab('MAT_HW_Pumpkin_Face', '#3b1d0e', None, 0.6, emission='#3a1a00')
    c = HEAD_C + V((0, 0.01, 0.03))
    dome = shell('dome', c, HEAD_R * V((1.13, 1.12, 1.1)), lambda d: d.z > 0.1, m, H, seg=60, rings=24, rigid='Head', thick=0.014)
    for v in dome.data.vertices:
        v.co = _lobed(v.co, c, n=10, depth=0.07)
    parts = [dome]
    # ขอบพับไหมพรม (ซี่โครง) — ให้ดูเป็นหมวกที่สวมได้จริง
    parts.append(tube_arc('cuff', (0, 0.01, 0.84), 0.226, 0.024, 0, 2 * math.pi, rib, H, plane='XY', seg=64, tseg=10, rigid='Head', scale=(1, 0.92, 1)))
    # ก้าน + ใบ + เถา (หลอมก้านให้กลืนกับยอดหมวก)
    bm = bmesh.new()
    top = c + V((0, 0, HEAD_R.z * 1.1 - 0.008))
    _stem(bm, top - V((0, 0, 0.012)), V((0.15, 0.1, 1)), length=0.07, r=0.017, curl=0.7)
    st = _organic('stem', [_obj_from_bm('s', bm, stem_m, H, rigid='Head')], stem_m, H, 'Head', voxel=0.0016, tris=1400)
    parts.append(st)
    leaf_pts = [(0, 0.0), (0.02, 0.012), (0.032, 0.034), (0.024, 0.05), (0.006, 0.056), (-0.012, 0.046), (-0.02, 0.026), (-0.012, 0.008)]
    lf = flat_patch('leaf', leaf_pts, 0.003, top + V((0.035, 0.02, -0.004)), V((0.35, 0.1, 1)).normalized(), stem_m, H, rigid='Head', up=V((1, 0, 0)))
    parts.append(lf)
    parts.append(polyline('vein', [top + V((0.04, 0.022, 0.0)), top + V((0.06, 0.034, 0.01))], 0.0012, rib, H, rigid='Head'))
    vine = [top + V((-0.02 + 0.03 * math.cos(a) * (1 - a / 12), 0.02 + 0.03 * math.sin(a) * (1 - a / 12), -0.006 + a * 0.0015)) for a in [i * 0.4 for i in range(26)]]
    parts.append(tube_path('vine', vine, 0.0028, stem_m, H, tseg=5, rigid='Head'))
    # หน้าแจ็กโอแลนเทิร์น (ปักบนหมวกด้านหน้า เหนือหน้าผาก)
    from eqlib import head_surface
    for sx in (1, -1):
        p, n = head_surface(0.068 * sx, 0.935, out=0.036)
        parts.append(flat_patch('eye', [(-0.024, -0.013), (0.024, -0.013), (0.0, 0.021)], 0.003, p, n, face, H, rigid='Head'))
    p, n = head_surface(0.0, 0.888, out=0.038)
    mouth = [(x * 1.5, z * 1.5) for x, z in [(-0.05, 0.006), (-0.03, -0.006), (-0.018, 0.002), (-0.006, -0.01), (0.006, 0.0), (0.018, -0.01), (0.03, 0.002), (0.05, 0.006),
             (0.034, -0.018), (0.0, -0.026), (-0.034, -0.018)]]
    parts.append(flat_patch('mouth', mouth, 0.003, p, n, face, H, rigid='Head'))
    return parts


# =====================================================================
# Day 2 — Bat Wings (ปีกค้างคาว: พังผืดโค้งเว้าระหว่างนิ้ว · กระดูกปีกเรียว · ข้อกลางหลัง)
# =====================================================================
def _wing(sx, mem, bone_m):
    root = V((0.035 * sx, 0.125, 0.47))
    out = V((sx, 0.55, 0.0)).normalized()        # ปีกกางไปด้านข้าง-หลัง (ไม่ขวางแขนที่ยกด้านข้าง)
    up = V((0, 0, 1))
    def W(u, v):   # u ตามความยาวปีก (m) · v ขึ้น/ลง
        return root + out * u + up * v
    wrist = W(0.2, 0.14)
    tip_pts = [W(0.42, 0.2), W(0.4, 0.02), W(0.31, -0.11), W(0.17, -0.16)]   # ปลายนิ้ว 4 นิ้ว (บนลงล่าง)
    bm = bmesh.new()
    # พังผืด: แต่ละช่วงระหว่างนิ้ว = แผ่นโค้ง ขอบท้ายเว้า (scallop) · แบ่งตารางละเอียดเพื่อให้ดัดโค้งได้
    edges = [wrist] + tip_pts
    hub = root
    faces_pts = []
    for k in range(len(edges) - 1):
        a, b = edges[k], edges[k + 1]
        rows = 8
        grid = []
        for i in range(rows + 1):
            t = i / rows
            row = []
            for j in range(9):
                s = j / 8
                edge = a.lerp(b, s)
                if k > 0:   # ขอบท้ายเว้าเข้าหา hub
                    sag = 0.32 * math.sin(math.pi * s)
                    edge = edge.lerp(hub, sag)
                p = hub.lerp(edge, t)
                # โค้งพองเล็กน้อยไปด้านหลัง
                p = p + V((0, 0.025 * math.sin(math.pi * t) * math.sin(math.pi * s), 0))
                row.append(bm.verts.new(p))
            grid.append(row)
        for i in range(rows):
            for j in range(8):
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    ob = _obj_from_bm('membrane', bm, mem, ['Chest'], rigid='Chest')
    solidify(ob, 0.004, offset=0.0)
    parts = [ob]
    # กระดูกปีก: แขนปีก + นิ้ว (ท่อเรียว)
    parts.append(capsule('arm_bone', root, wrist, 0.009, 0.006, bone_m, ['Chest'], seg=10, rings=6, rigid='Chest'))
    for t in tip_pts:
        parts.append(capsule('finger', wrist, t, 0.0055, 0.0022, bone_m, ['Chest'], seg=8, rings=6, rigid='Chest'))
    parts.append(capsule('claw', wrist, wrist + V((0.0, 0.0, 0.03)) + out * 0.01, 0.005, 0.0015, bone_m, ['Chest'], seg=8, rings=4, rigid='Chest'))
    return parts

def K_hw_batwings():
    mem = fab('MAT_HW_BatWing', '#3a2156', 'leather', 0.55, nstr=0.25)
    bone_m = fab('MAT_HW_BatWing_Bone', '#1d1030', None, 0.45)
    pin = fab('MAT_HW_BatWing_Pin', '#ff8a3d', None, 0.4, emission='#3a1500')
    parts = []
    for sx in (1, -1):
        parts += _wing(sx, mem, bone_m)
    parts.append(ellipsoid('hub', (0, 0.128, 0.47), (0.045, 0.02, 0.036), mem, ['Chest'], seg=20, rings=12, rigid='Chest'))
    parts.append(prism('heart_pin', [(math.sin(a) ** 3 * 0.016, (13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)) * 0.0011)
                                     for a in [i * 2 * math.pi / 24 for i in range(24)]], 0.005, (0, 0.15, 0.472), pin, ['Chest'], rigid='Chest', rot=RZ(180)))
    return parts


# =====================================================================
# Day 3 — Ghost Hoodie (ฮู้ดดี้สีครีม ชายเป็นคลื่นแบบผ้าคลุมผี · หน้าผียิ้ม · ฮู้ดมีตาผี · กระเป๋าทรงผี)
# =====================================================================
def T_hw_ghost():
    m = fab('MAT_HW_Ghost', '#f6f3ff', 'fleece', 0.92)
    t = fab('MAT_HW_Ghost_Rib', '#c9b8ff', 'rib', 0.9)
    ink = fab('MAT_HW_Ghost_Ink', '#2b2440', None, 0.5)
    blush = fab('MAT_HW_Ghost_Blush', '#ffb3c7', None, 0.7)
    s = fab('MAT_HW_Ghost_String', '#9c86e8', None, 0.7)
    parts = shirt_body(m, off=0.006, neck='crew', trim=t, hem_trim=False) + sleeves(m, 'long', off=0.004, cuff=t)
    # ชายคลื่น (เหมือนชายผ้าคลุมผี) — ห่วงผ้าที่ขอบล่างเป็นลอน
    hem = tube_open('hem_wave', [(0, 0, 0.214), (0, 0, 0.258)], [0.151, 0.149], m, ['Hips', 'Spine'], seg=45, cap_start=False, flat=0.76, loop=0.011, thick=0.005)
    for v in hem.data.vertices:
        if v.co.z < 0.236:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z -= 0.014 * (0.5 + 0.5 * math.cos(9 * a))
    parts.append(hem)
    parts += hood(m, s, lining=t)
    # ตาผีบนฮู้ด (ด้านหลัง) — ฮู้ดเป็นผีตัวเล็ก
    for sx in (1, -1):
        parts.append(disc('hood_eye', (0.035 * sx, 0.17, 0.615), (0, 1, 0.25), 0.011, 0.002, ink, ['Chest', 'Neck'], rigid='Chest'))
    # หน้าผียิ้มบนอก (ตารี + ปาก "o" + แก้มชมพู)
    for sx in (1, -1):
        p, n = torso_point(0.032 * sx, 0.415, off=0.036)
        parts.append(flat_patch('ghost_eye', [(0.009 * math.cos(a), 0.014 * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]], 0.002, p, n, ink, ['Chest'], rigid='Chest', bevel=0))
        p, n = torso_point(0.058 * sx, 0.39, off=0.035)
        parts.append(flat_patch('blush', [(0.011 * math.cos(a), 0.006 * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]], 0.0015, p, n, blush, ['Chest'], rigid='Chest', bevel=0))
    p, n = torso_point(0.0, 0.385, off=0.036)
    parts.append(flat_patch('mouth', [(0.008 * math.cos(a), 0.01 * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]], 0.002, p, n, ink, ['Chest'], rigid='Chest', bevel=0))
    # กระเป๋าจิงโจ้ทรงผี (ด้านล่างเป็นคลื่น)
    p, n = torso_point(0.0, 0.3, off=0.028)
    ghost_pocket = [(-0.08, 0.03), (0.08, 0.03), (0.088, -0.022)] + [(0.088 - i * 0.022, -0.022 - 0.01 * (i % 2)) for i in range(1, 8)] + [(-0.088, -0.022)]
    parts.append(flat_patch('pocket', ghost_pocket, 0.005, p, n, m, ['Spine', 'Hips']))
    parts.append(polyline('pocket_st', [p + n * 0.006 + V((-0.07, 0, 0.024)), p + n * 0.006 + V((0.07, 0, 0.024))], 0.0014, t, ['Spine']))
    return parts


# =====================================================================
# Day 4 — Witch Hat (กรวยโค้งงอปลาย · ปีกหมวกเป็นลอน · แถบผ้า + หัวเข็มขัด · รอยปะ · ดาวห้อย)
# =====================================================================
def C_hw_witch():
    m = fab('MAT_HW_Witch', '#3b2466', 'fleece', 0.8, nstr=0.35)
    band = fab('MAT_HW_Witch_Band', '#ff8a3d', 'weave', 0.7)
    gold = mat_metal('#e3b64a')
    patch = fab('MAT_HW_Witch_Patch', '#6f4fb0', 'weave', 0.8)
    st = fab('MAT_HW_Witch_Stitch', '#ffcf7a', None, 0.7)
    star_m = fab('MAT_HW_Witch_Star', '#ffd54a', None, 0.35, emission='#5a4200')
    base_c = V((0, 0.012, 0.905))
    # ทรงกรวย: เส้นแกนโค้งไปด้านหลังแล้วหักงอปลาย · หน้าตัดกลม เรียวลง
    axis = [base_c + V((0, 0.02 * t + 0.11 * t ** 3, 0.42 * t - 0.05 * t ** 4)) for t in [i / 30 for i in range(31)]]
    bm = bmesh.new()
    rings = []
    k = 30
    for i, c in enumerate(axis):
        t = i / 30
        T = (axis[min(30, i + 1)] - axis[max(0, i - 1)]).normalized()
        S = T.cross(V((1, 0, 0))).normalized()
        U = S.cross(T).normalized()
        r = 0.205 * (1 - t) ** 1.15 + 0.004
        wob = 1 + 0.03 * math.sin(t * 11)    # ผ้านุ่ม ไม่ตรงเป๊ะ
        ring_ = [bm.verts.new(c + (U * math.cos(2 * math.pi * j / k) * 1.0 + S * math.sin(2 * math.pi * j / k) * 0.97) * r * wob) for j in range(k)]
        rings.append(ring_)
    for i in range(len(rings) - 1):
        for j in range(k):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    tip = bm.verts.new(axis[-1] + (axis[-1] - axis[-2]).normalized() * 0.006)
    for j in range(k):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % k], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cone = _obj_from_bm('cone', bm, m, H, rigid='Head')
    solidify(cone, 0.008, offset=-1.0)
    # ปีกหมวก: วงแหวนกว้าง ขอบเป็นลอนนุ่ม
    bb = bmesh.new()
    rr = []
    for i in range(5):
        t = i / 4
        r = 0.185 + 0.15 * t
        row = []
        for j in range(60):
            a = 2 * math.pi * j / 60
            z = 0.892 - 0.012 * t + 0.016 * t * t * math.sin(3 * a + 0.6) - 0.01 * t * max(0.0, -math.sin(a))   # ลอน + ปีกหน้าลู่ลง
            row.append(bb.verts.new((math.cos(a) * r, 0.012 + math.sin(a) * r * 0.97, z)))
        rr.append(row)
    for i in range(4):
        for j in range(60):
            bb.faces.new((rr[i][j], rr[i][(j + 1) % 60], rr[i + 1][(j + 1) % 60], rr[i + 1][j]))
    brim = _obj_from_bm('brim', bb, m, H, rigid='Head')
    solidify(brim, 0.008, offset=0.0)
    parts = [cone, brim]
    parts.append(tube_open('band', [base_c + V((0, 0, 0.004)), base_c + V((0, 0.002, 0.04))], [0.214, 0.197], band, H, seg=48, cap_start=False, loop=0.01, thick=0.004, rigid='Head'))
    # หัวเข็มขัดทอง (กรอบ) ด้านหน้า
    bp = base_c + V((0, -0.205, 0.022))
    for (dx, dz, sx_, sz_) in ((0, 0.016, 0.034, 0.005), (0, -0.016, 0.034, 0.005), (0.015, 0, 0.005, 0.034), (-0.015, 0, 0.005, 0.034)):
        parts.append(box_lo('buckle', bp + V((dx, 0, dz)), (sx_, 0.006, sz_), gold, H, bevel=0.3, rigid='Head'))
    # รอยปะผ้า + ตะเข็บ
    pp = axis[18] + V((0.0, -0.095, 0.0))
    nrm = V((0, -1, 0.25)).normalized()
    parts.append(flat_patch('patch', [(-0.022, -0.018), (0.024, -0.02), (0.02, 0.022), (-0.024, 0.018)], 0.003, pp, nrm, patch, H, rigid='Head'))
    for i in range(4):
        y = -0.012 + i * 0.008
        parts.append(polyline('stitch', [pp + nrm * 0.0035 + V((-0.028, 0, y)), pp + nrm * 0.0035 + V((-0.02, 0, y + 0.003))], 0.0011, st, H, rigid='Head'))
    # ดาวห้อยที่ปลาย
    tipp = axis[-1]
    parts.append(polyline('string', [tipp, tipp + V((0, 0.012, -0.03)), tipp + V((0, 0.016, -0.05))], 0.0012, gold, H, rigid='Head'))
    parts.append(prism('star', star_pts(0.016, 0.0068), 0.006, tipp + V((0, 0.017, -0.066)), star_m, H, rigid='Head', rot=RZ(90) @ RX(90)))
    return parts


# =====================================================================
# Day 5 — Halloween Boots (บูทหนังสีม่วง · ขอบบนทรงกลีบฟักทอง · เชือกส้ม · หัวเข็มขัดค้างคาว · พื้นยางส้ม)
# =====================================================================
def _bat_pts(s=1.0):
    return [(x * s, z * s) for x, z in ((0, 0.006), (0.004, 0.01), (0.006, 0.004), (0.016, 0.01), (0.024, 0.004), (0.02, -0.002),
                                         (0.014, 0.0), (0.01, -0.006), (0.005, -0.002), (0, -0.007), (-0.005, -0.002), (-0.01, -0.006),
                                         (-0.014, 0.0), (-0.02, -0.002), (-0.024, 0.004), (-0.016, 0.01), (-0.006, 0.004), (-0.004, 0.01))]

def S_hw_boots():
    up = fab('MAT_HW_Boot', '#4b2b7a', 'leather', 0.5, nstr=0.12)
    so = fab('MAT_HW_Boot_Sole', '#ff7a1a', 'tread', 0.8)
    cuff = fab('MAT_HW_Boot_Cuff', '#f2892a', 'knit', 0.9)
    lace = fab('MAT_HW_Boot_Lace', '#ff9f43', None, 0.8)
    batm = fab('MAT_HW_Boot_Bat', '#1d1030', None, 0.4)
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.026, lace_m=lace, lip=batm, tread=so, laces_n=3)
        out += shaft(sx, up, 0.062, 0.148, r0=0.054, r1=0.053)
        # ขอบบนเป็นกลีบฟักทอง (ห่วงหนา มีร่อง 8 ร่อง)
        cf = tube_open('cuff', [(0.066 * sx, 0.0, 0.138), (0.066 * sx, 0.0, 0.17)], [0.064, 0.066], cuff, leg, seg=32, cap_start=False, loop=0.009, thick=0.006)
        cc = V((0.066 * sx, 0, 0))
        for v in cf.data.vertices:
            q = V((v.co.x - cc.x, v.co.y, 0))
            a = math.atan2(q.y, q.x)
            k = 1 - 0.08 * (1 - (0.5 + 0.5 * math.cos(8 * a)) ** 2) * math.sin(math.pi * min(1.0, max(0.0, (v.co.z - 0.138) / 0.032)))
            v.co.x = cc.x + q.x * k; v.co.y = q.y * k
        out.append(cf)
        out.append(flat_patch('bat', _bat_pts(1.0), 0.004, V((0.066 * sx + 0.056 * sx, 0.0, 0.1)), V((sx, 0, 0)), batm, leg))
    return out


# =====================================================================
# Day 6 — Pumpkin Backpack (เป้ทรงฟักทองกลีบลึก · ซิปรอบ · หน้ายิ้ม · ก้านเป็นหูหิ้ว · สายสะพาย)
# =====================================================================
def K_hw_pumpkin_pack():
    m = fab('MAT_HW_PumpkinBag', '#f08a24', 'canvas', 0.7)
    face = fab('MAT_HW_PumpkinBag_Face', '#2b1608', None, 0.6, emission='#2a1200')
    stem_m = fab('MAT_HW_PumpkinBag_Stem', '#5e7d2f', 'leather', 0.75)
    strap_m = fab('MAT_HW_PumpkinBag_Strap', '#4b2b7a', 'mesh', 0.7)
    zipm = mat_metal('#c7ccd8')
    c = V((0, 0.165, 0.415))
    body = ellipsoid('body', c, (0.125, 0.085, 0.11), m, ['Chest'], seg=56, rings=28, rigid='Chest')
    for v in body.data.vertices:
        q = v.co - c
        a = math.atan2(q.x, q.z)          # กลีบรอบแกน y (ด้านหน้ากระเป๋าหันออกหลัง)
        g = (0.5 + 0.5 * math.cos(8 * a)) ** 2.5
        k = 1 - 0.07 * (1 - g)
        v.co = c + V((q.x * k, q.y * (0.94 if q.y < 0 else 1.0), q.z * k))   # ด้านที่แนบหลังแบนลง
    parts = [body, *straps(strap_m)]
    # ซิปรอบครึ่งบน
    # ซิปแนบผิวกระเป๋า (ครึ่งบน รอบกลีบ)
    yz = 0.03
    f = math.sqrt(1 - (yz / 0.085) ** 2)
    zp = [c + V((math.cos(a) * 0.125 * f * 0.975, yz, math.sin(a) * 0.11 * f * 0.975)) for a in [math.radians(12 + i * 156 / 30) for i in range(31)]]
    parts.append(polyline('zip', zp, 0.0032, zipm, ['Chest'], rigid='Chest', tseg=5))
    parts.append(box_lo('puller', zp[6] + V((0, 0.006, -0.012)), (0.008, 0.004, 0.022), zipm, ['Chest'], bevel=0.3, rigid='Chest'))
    # หน้ายิ้มฟักทอง (ด้านนอก +Y)
    n = V((0, 1, 0))
    for sx in (1, -1):
        parts.append(flat_patch('eye', [(-0.013, -0.008), (0.013, -0.008), (0.0, 0.012)], 0.003, c + V((0.038 * sx, 0.086, 0.018)), n, face, ['Chest'], rigid='Chest'))
    mouth = [(-0.045, 0.004), (-0.026, -0.006), (-0.014, 0.002), (0.0, -0.01), (0.014, 0.002), (0.026, -0.006), (0.045, 0.004), (0.03, -0.018), (0.0, -0.026), (-0.03, -0.018)]
    parts.append(flat_patch('mouth', mouth, 0.003, c + V((0, 0.087, -0.03)), n, face, ['Chest'], rigid='Chest'))
    # ก้านโค้งเป็นหูหิ้ว
    bm = bmesh.new()
    _stem(bm, c + V((0, 0.0, 0.1)), V((0.0, 0.25, 1)), length=0.06, r=0.014, curl=0.9, twist=1.0)
    parts.append(_organic('stem', [_obj_from_bm('s', bm, stem_m, ['Chest'], rigid='Chest')], stem_m, ['Chest'], 'Chest', voxel=0.0016, tris=1200))
    leaf_pts = [(0, 0.0), (0.018, 0.012), (0.028, 0.03), (0.02, 0.046), (0.004, 0.05), (-0.012, 0.04), (-0.018, 0.022), (-0.01, 0.006)]
    parts.append(flat_patch('leaf', leaf_pts, 0.003, c + V((0.03, 0.02, 0.108)), V((0.4, 0.3, 1)).normalized(), stem_m, ['Chest'], rigid='Chest', up=V((1, 0, 0))))
    return parts


# =====================================================================
# Day 7 — Midnight Halloween Costume Set: เสื้อคลุมรัตติกาล + กางเกงดาว + เข็มกลัดพระจันทร์
# =====================================================================
def O_hw_midnight():
    m = fab('MAT_HW_Midnight', '#1c2350', 'weave', 0.65, nstr=0.35)
    lining = fab('MAT_HW_Midnight_Lining', '#6b3fb8', 'weave', 0.55)
    trim = fab('MAT_HW_Midnight_Trim', '#e3b64a', None, 0.4, metal=0.5)
    star_m = fab('MAT_HW_Midnight_Star', '#ffd54a', None, 0.3, metal=0.4, emission='#3a2a00')
    parts = shirt_body(m, off=0.022, neck='open', open_front=0.03, length=0.1, hem=0.2, trim=lining, trim_r=0.006)
    parts += sleeves(m, 'long', off=0.022, cuff=lining)
    parts += fold_collar(lining, 'jacket', off=0.022) + lapels(lining, notch=False, z_top=0.5, off=0.044)
    # ผ้าคลุมไหล่สั้น (capelet): ทรงครึ่งวงกลมรอบไหล่ ชายเป็นแฉก
    cap = shell('capelet', (0, 0.0, 0.43), (0.205, 0.165, 0.2), lambda d: d.z > 0.18 and not (d.y < -0.6 and abs(d.x) < 0.25), m, ['Chest'], seg=32, rings=12, thick=0.006)
    for v in cap.data.vertices:
        if v.co.z < 0.5:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z -= 0.012 * (0.5 + 0.5 * math.cos(10 * a)) * (0.5 - v.co.z) / 0.1
    cap['eq_loose'] = True
    parts.append(cap)
    # กระดุมดาวทอง 4 เม็ด
    for i in range(4):
        z = 0.24 + i * 0.075
        p, n = torso_point(0.045, z, off=0.046)
        parts.append(prism('star_btn', star_pts(0.012, 0.005), 0.004, p, star_m, ['Spine'] if z < 0.4 else ['Chest'], rigid='Spine' if z < 0.4 else 'Chest'))
    # พระจันทร์เสี้ยวปักด้านหลัง
    p, n = torso_point(0.0, 0.42, off=0.045, back=True)
    moon = [(0.04 * math.cos(a), 0.04 * math.sin(a)) for a in [math.pi * 0.25 + i * math.pi * 1.5 / 16 for i in range(17)]]
    moon += [(0.03 * math.cos(a) + 0.014, 0.03 * math.sin(a)) for a in [math.pi * 1.75 - i * math.pi * 1.5 / 16 for i in range(17)]]
    parts.append(flat_patch('moon', moon, 0.003, p, n, star_m, ['Chest'], rigid='Chest', bevel=0))
    return parts

def B_hw_midnight():
    m = fab('MAT_HW_MidPants', '#1c2350', 'twill', 0.75)
    w = fab('MAT_HW_MidPants_Waist', '#141a3c', 'twill', 0.75)
    gold = fab('MAT_HW_MidPants_Gold', '#e3b64a', None, 0.4, metal=0.5)
    star_m = fab('MAT_HW_MidPants_Star', '#ffe27a', None, 0.35, emission='#3a2a00')
    parts = pants(m, 'long', fit=0.008, flare=0.012, waist=w, cuff=w) + side_stripes(gold, w=0.005, n=1, top_z=0.29, bot_z=0.06)
    rnd = random.Random(26)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        for i in range(5):   # ดาวเล็กกระจายบนขากางเกงด้านหน้า
            z = 0.08 + i * 0.045 + rnd.uniform(-0.01, 0.01)
            x = 0.064 * sx + rnd.uniform(-0.02, 0.02)
            r = 0.06 + 0.012
            parts.append(prism('star', star_pts(0.008, 0.0035), 0.003, (x, -r - 0.004, z), star_m, leg))
    return parts

def A_hw_moon():
    cord = fab('MAT_HW_Moon_Cord', '#2b1b4f', 'leather', 0.6)
    gold = fab('MAT_HW_Moon_Gold', '#e3b64a', None, 0.25, metal=0.85)
    gem = fab('MAT_HW_Moon_Gem', '#b388ff', None, 0.1, emission='#3a1a6a')
    pts, back = _neck_curve(drop=0.12, n=14, front=-0.14, width=0.065)
    c = pts[len(pts) // 2] + V((0, -0.004, -0.032))
    moon = [(0.026 * math.cos(a), 0.026 * math.sin(a)) for a in [math.pi * 0.3 + i * math.pi * 1.4 / 16 for i in range(17)]]
    moon += [(0.019 * math.cos(a) + 0.01, 0.019 * math.sin(a)) for a in [math.pi * 1.7 - i * math.pi * 1.4 / 16 for i in range(17)]]
    return [polyline('cord', pts, 0.0024, cord, ['Chest'], rigid='Chest', tseg=4), polyline('cord_back', back, 0.0024, cord, ['Chest'], rigid='Chest', tseg=4),
            prism('moon', moon, 0.006, c, gold, ['Chest'], rigid='Chest'),
            ellipsoid('gem', c + V((-0.006, -0.004, 0)), (0.007, 0.004, 0.007), gem, ['Chest'], seg=12, rings=8, rigid='Chest'),
            prism('star', star_pts(0.008, 0.0035), 0.004, c + V((0.018, -0.002, -0.022)), gem, ['Chest'], rigid='Chest')]


# =====================================================================
# เควสต์ — Candy Corn Necklace · Bat Glasses
# =====================================================================
def A_hw_candy():
    cord = fab('MAT_HW_Candy_Cord', '#6b3fb8', None, 0.6)
    y_ = fab('MAT_HW_Candy_Yellow', '#ffd54a', None, 0.35)
    o_ = fab('MAT_HW_Candy_Orange', '#ff8a2a', None, 0.35)
    w_ = fab('MAT_HW_Candy_White', '#fff7ea', None, 0.35)
    pts, back = _neck_curve(drop=0.11, n=24, front=-0.14, width=0.072)
    parts = [polyline('cord', pts, 0.0022, cord, ['Chest'], rigid='Chest', tseg=4), polyline('cord_back', back, 0.0022, cord, ['Chest'], rigid='Chest', tseg=4)]
    for i in (3, 6, 9, 12, 15, 18, 21):
        p = pts[i]
        d = (pts[i + 1] - pts[i - 1]).normalized()
        down = V((0, 0, -1))
        # ลูกอมสามสี: กรวยมนสามชั้น (เหลือง-ส้ม-ขาว) ห้อยจากสร้อย
        base = p + V((0, -0.006, -0.006))
        for k, (mm, h0, h1, r0, r1) in enumerate(((y_, 0.0, 0.009, 0.009, 0.0075), (o_, 0.009, 0.017, 0.0075, 0.0045), (w_, 0.017, 0.023, 0.0045, 0.0012))):
            parts.append(capsule('candy', base + down * h0, base + down * h1, r0, r1, mm, ['Chest'], seg=10, rings=4, flat=0.55, rigid='Chest'))
    return parts

def G_hw_bat():
    from eqlib import head_surface
    f = fab('MAT_HW_BatGlasses', '#2b1b4f', None, 0.35)
    l = fab('MAT_HW_BatGlasses_Lens', '#b388ff', None, 0.08, emission='#1a0a2a')
    parts = []
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.024)
        # เลนส์ทรงปีกค้างคาว (ขอบบนเป็นแฉก)
        out = [(-0.034, 0.004), (-0.026, 0.018), (-0.016, 0.01), (-0.008, 0.02), (0.0, 0.012), (0.008, 0.02), (0.016, 0.01), (0.026, 0.018), (0.034, 0.004),
               (0.028, -0.014), (0.012, -0.022), (-0.012, -0.022), (-0.028, -0.014)]
        out = [(x * sx, z) for x, z in out] if sx > 0 else [(-x, z) for x, z in reversed(out)]
        from items_head import face_rot
        parts.append(prism('lens', out, 0.006, p, l, H, rigid='Head', rot=face_rot(n)))
        parts.append(tube_path('rim', [(p.x + x, p.y - 0.004, p.z + z) for x, z in out], 0.0032, f, H, closed=True, tseg=5, rigid='Head'))
        parts.append(capsule('temple', (0.11 * sx, p.y + 0.01, 0.8), (0.2 * sx, 0.02, 0.805), 0.004, 0.004, f, H, seg=6, rings=4, rigid='Head'))
        parts.append(ellipsoid('ear', (0.1 * sx, p.y + 0.002, 0.822), (0.008, 0.004, 0.012), f, H, seg=8, rings=6, rigid='Head', rot=RY(-20 * sx)))
    p, _ = head_surface(0, 0.8, out=0.024)
    parts.append(capsule('bridge', (-0.036, p.y, 0.798), (0.036, p.y, 0.798), 0.0038, 0.0038, f, H, seg=6, rings=4, rigid='Head'))
    return parts
