"""
EnglishQuest Avatar — ทรงผม · หมวก · แว่น · หูฟัง · ของติดหลัง · เครื่องประดับ · เอฟเฟกต์ (v2)
ของบนหัว = rigid 100% กับ Head (ขยับตามหัวพอดี) · ของบนตัว = rigid กับ Chest / ยืมน้ำหนักจากผิว (สร้อย สายคล้อง)
"""
import math
import random

from mathutils import Matrix, Vector

from eqdetail import box_lo, disc, displace, fab, flat_patch, outline_rect, polyline, ring, torso_point, tube_open, delete_where, solidify
from eqlib import (G_ARM_L, G_ARM_R, HEAD_C, HEAD_R, capsule, ellipsoid, flared, head_surface, heart_pts, prism, rbox, rrect_pts,
                   shell, star_pts, tube_arc, tube_path)
from garments import RX, RY, RZ, mat_metal

V = Vector
HC = HEAD_C + V((0, 0.004, 0.012))
H = ['Head']

def face_rot(n):
    return V((0, -1, 0)).rotation_difference(n).to_matrix()

def hair_keep(s, f, b, side=0.0):
    return lambda d: d.z > s + f * max(0.0, -d.y) - b * max(0.0, d.y) + side * d.x

def lock(m, a, b, r0, r1, seg=10):
    """ปอยผม (เรียวปลาย)"""
    return capsule('lock', a, b, r0, r1, m, H, seg=seg, rings=6, rigid='Head')

def fringe(m, xs, z_top=0.965, z_end=0.875, out=0.012, r=0.022, curve=0.0):
    out_ = []
    for x in xs:
        a, _ = head_surface(x * 0.8, z_top, out=out)
        b, _ = head_surface(x + curve, z_end, out=out + 0.004)
        out_.append(lock(m, a, b, r, r * 0.45))
    return out_

# =====================================================================
# HAIR (เดิม: เพิ่มปอยผม/ชั้นผม) + ใหม่
# =====================================================================
def H_crop(c='#3b2a24'):
    m = fab('MAT_Hair_Crop', c, None, 0.55)
    parts = [shell('cap', HC, HEAD_R * 1.075, hair_keep(-0.05, 0.40, 0.28), m, H, seg=48, rings=28, rigid='Head'),
             ellipsoid('tuft', (0.02, 0.02, 0.985), (0.11, 0.1, 0.05), m, H, rigid='Head')]
    parts += fringe(m, [-0.09, -0.05, -0.01, 0.03, 0.07], z_top=0.985, z_end=0.905, r=0.02)
    return parts

def H_side(c='#1f1b24'):
    m = fab('MAT_Hair_SidePart', c, None, 0.5)
    parts = [shell('cap', HC, HEAD_R * 1.08, hair_keep(-0.06, 0.44, 0.28, side=-0.16), m, H, seg=48, rings=28, rigid='Head'),
             ellipsoid('swoop', (0.07, -0.13, 0.905), (0.12, 0.06, 0.045), m, H, rigid='Head', rot=RY(-14))]
    parts += fringe(m, [-0.04, 0.0, 0.04, 0.08, 0.12], z_top=0.99, z_end=0.9, r=0.021, curve=0.04)
    return parts

def H_bob(c='#8a4b2a'):
    m = fab('MAT_Hair_Bob', c, None, 0.55)
    keep = lambda d: d.z > (-0.55 + 0.95 * max(0.0, -d.y) ** 1.6) - 0.1 * max(0.0, d.y)
    parts = [shell('cap', HC, HEAD_R * V((1.1, 1.09, 1.08)), keep, m, H, seg=48, rings=28, rigid='Head', thick=0.014)]
    parts += fringe(m, [-0.1, -0.06, -0.02, 0.02, 0.06, 0.1], z_top=0.97, z_end=0.88, r=0.019)
    for sx in (1, -1):   # ปลายผมงุ้มเข้า
        parts.append(tube_arc('curl', (0.2 * sx, -0.02, 0.69), 0.03, 0.016, math.radians(180 if sx > 0 else 0), math.radians(360 if sx > 0 else 180), m, H, plane='XZ', seg=12, tseg=8, rigid='Head'))
    return parts

def H_pony(c='#d9a441'):
    m = fab('MAT_Hair_Ponytail', c, None, 0.5)
    band = fab('MAT_Hair_Band_Pink', '#e85d75', None, 0.6)
    parts = [shell('cap', HC, HEAD_R * 1.075, hair_keep(-0.1, 0.42, 0.32), m, H, seg=48, rings=28, rigid='Head'),
             capsule('tail', (0, 0.2, 0.9), (0, 0.27, 0.62), 0.06, 0.03, m, H, rigid='Head'),
             tube_arc('band', (0, 0.205, 0.885), 0.042, 0.012, 0, 2 * math.pi, band, H, plane='XY', seg=16, tseg=6, rigid='Head')]
    for dx in (-0.025, 0.0, 0.025):
        parts.append(lock(m, (dx, 0.23, 0.8), (dx * 1.6, 0.28, 0.63), 0.022, 0.008))
    parts += fringe(m, [-0.08, -0.04, 0.0, 0.04, 0.08], z_top=0.975, z_end=0.9, r=0.019)
    return parts

def H_long(c='#2a1c2e'):
    m = fab('MAT_Hair_Long', c, None, 0.5)
    keep = lambda d: d.z > (-0.6 + 0.95 * max(0.0, -d.y) ** 1.5)
    parts = [shell('cap', HC, HEAD_R * V((1.1, 1.09, 1.08)), keep, m, H, seg=48, rings=28, rigid='Head', thick=0.014),
             capsule('back', (0, 0.11, 0.74), (0, 0.15, 0.47), 0.19, 0.125, m, H, flat=0.42, rigid='Head')]
    # ปอยผมข้าง: แยกไว้หน้าไหล่ / หลังไหล่ — เว้นช่องที่แขนยกขึ้นผ่าน (ตรวจ ANIM_Victory: แขนจมในผม 2.9% → แก้)
    for sx in (1, -1):
        for y0, y1 in ((-0.05, -0.07), (0.075, 0.095), (0.11, 0.13)):
            parts.append(lock(m, (0.165 * sx, y0, 0.72), (0.155 * sx, y1, 0.47), 0.024, 0.01))
    parts += fringe(m, [-0.08, -0.04, 0.0, 0.04, 0.08], z_top=0.98, z_end=0.89, r=0.019)
    return parts

def H_curly(c='#3a2418'):   # ใหม่: ผมหยิกสั้น (ลอนกลมทั่วหัว)
    m = fab('MAT_Hair_Curly', c, None, 0.7)
    parts = [shell('cap', HC, HEAD_R * 1.07, hair_keep(-0.12, 0.42, 0.25), m, H, seg=40, rings=24, rigid='Head')]
    rnd = random.Random(5)
    for i in range(40):
        th = rnd.uniform(0, 2 * math.pi); ph = rnd.uniform(0.0, 1.25)
        d = V((math.cos(th) * math.sin(ph), math.sin(th) * math.sin(ph), math.cos(ph)))
        if d.y < -0.55 and d.z < 0.55:
            continue
        p = HC + V((d.x * HEAD_R.x, d.y * HEAD_R.y, d.z * HEAD_R.z)) * 1.085
        r = rnd.uniform(0.026, 0.034)
        parts.append(ellipsoid('curl', p, (r, r, r * 0.9), m, H, seg=10, rings=6, rigid='Head'))
    return parts

def H_wavy(c='#6b3e26'):    # ใหม่: ผมยาวลอนคลื่น
    m = fab('MAT_Hair_Wavy', c, None, 0.55)
    keep = lambda d: d.z > (-0.62 + 0.95 * max(0.0, -d.y) ** 1.5)
    cap = shell('cap', HC, HEAD_R * V((1.1, 1.09, 1.08)), keep, m, H, seg=48, rings=28, rigid='Head', thick=0.014)
    back = capsule('back', (0, 0.11, 0.74), (0, 0.16, 0.43), 0.2, 0.13, m, H, flat=0.42, rigid='Head')
    displace(back, lambda p: V((math.sin(p.z * 60) * 0.008, 0, 0)))
    parts = [cap, back]
    for sx in (1, -1):
        for k, y in enumerate((-0.07, -0.05, 0.08, 0.105)):   # ลอนหน้าไหล่ 2 · หลังไหล่ 2 (ช่องกลางให้แขนยกผ่าน)
            pts = [V((0.165 * sx, y, 0.74 - i * 0.04)) + V((0.012 * math.sin(i * 1.4 + k) * sx, 0, 0)) for i in range(8)]
            parts.append(tube_path('wave', pts, 0.016 - k * 0.001, m, H, tseg=8, rigid='Head'))
    parts += fringe(m, [-0.06, 0.0, 0.06], z_top=0.98, z_end=0.88, r=0.022, curve=0.03)
    return parts

def H_buns(c='#1f1b24'):    # ใหม่: ผมมวยคู่ (ทรงสูง — ใช้ร่วมกับหมวกทรงครอบไม่ได้)
    m, t = fab('MAT_Hair_Buns', c, None, 0.5), fab('MAT_Hair_BunTie', '#ffcf3f', None, 0.5)
    parts = [shell('cap', HC, HEAD_R * 1.075, hair_keep(-0.1, 0.42, 0.32), m, H, seg=48, rings=28, rigid='Head')]
    for sx in (1, -1):
        p = V((0.12 * sx, 0.03, 0.99))
        parts.append(ellipsoid('bun', p, (0.062, 0.062, 0.058), m, H, seg=24, rings=14, rigid='Head'))
        parts.append(tube_arc('tie', (p.x, p.y, p.z - 0.045), 0.046, 0.009, 0, 2 * math.pi, t, H, plane='XY', seg=18, tseg=6, rigid='Head'))
        for k in range(3):   # ลายบิดของมวย
            a = 2 * math.pi * k / 3
            parts.append(tube_arc('twist', (p.x, p.y, p.z), 0.05, 0.006, a, a + 2.2, m, H, plane='XZ', seg=10, tseg=5, rigid='Head'))
    parts += fringe(m, [-0.07, -0.03, 0.01, 0.05, 0.09], z_top=0.975, z_end=0.9, r=0.019)
    return parts

def H_braid(c='#b36b2c'):   # ใหม่: ผมเปียข้างพาดบ่า
    m, t = fab('MAT_Hair_Braid', c, None, 0.55), fab('MAT_Hair_BraidTie', '#3fa36b', None, 0.6)
    parts = [shell('cap', HC, HEAD_R * 1.08, hair_keep(-0.12, 0.44, 0.3, side=0.12), m, H, seg=48, rings=28, rigid='Head')]
    start = V((-0.155, -0.055, 0.74))   # พาดหน้าไหล่ (ไม่ขวางแขนที่ยกขึ้นด้านข้าง)
    for i in range(9):   # ข้อเปีย 9 ข้อ (สลับซ้ายขวา)
        z = 0.72 - i * 0.032
        p = start + V((-0.004 * i + (0.008 if i % 2 else -0.008), -0.012 * i * 0.6, z - 0.74))
        parts.append(ellipsoid('braid', p, (0.024 - i * 0.0012, 0.02, 0.022), m, H, seg=12, rings=8, rigid='Head', rot=RY(25 if i % 2 else -25)))
    parts.append(tube_arc('braid_tie', (start.x - 0.036, start.y - 0.065, 0.43), 0.014, 0.006, 0, 2 * math.pi, t, H, plane='XY', seg=12, tseg=5, rigid='Head'))
    parts.append(lock(m, (start.x - 0.036, start.y - 0.066, 0.425), (start.x - 0.04, start.y - 0.07, 0.38), 0.016, 0.006))
    parts += fringe(m, [-0.1, -0.06, -0.02, 0.02], z_top=0.98, z_end=0.89, r=0.02, curve=-0.03)
    return parts

def H_spiky(c='#3f8bff'):   # ใหม่: ผมตั้งชี้ (ทรงสร้างสรรค์ — สูง)
    m = fab('MAT_Hair_Spiky', c, None, 0.45)
    parts = [shell('cap', HC, HEAD_R * 1.07, hair_keep(-0.05, 0.40, 0.28), m, H, seg=40, rings=24, rigid='Head')]
    rnd = random.Random(9)
    for i in range(16):
        th = 2 * math.pi * i / 16 + rnd.uniform(-0.1, 0.1); ph = 0.35 + (i % 3) * 0.22
        d = V((math.cos(th) * math.sin(ph), math.sin(th) * math.sin(ph) * 0.9, math.cos(ph)))
        a = HC + V((d.x * HEAD_R.x, d.y * HEAD_R.y, d.z * HEAD_R.z)) * 1.0
        b = a + d * rnd.uniform(0.07, 0.1)
        parts.append(capsule('spike', a, b, 0.03, 0.004, m, H, seg=10, rings=6, rigid='Head'))
    return parts

# =====================================================================
# HATS
# =====================================================================
def C_cap(main='#d93a48', trim='#b02a37', flat_brim=False, logo=None, name='Cap'):
    m, t = fab(f'MAT_{name}', main, 'canvas', 0.7), fab(f'MAT_{name}_Trim', trim, None, 0.7)
    st = fab(f'MAT_{name}_Stitch', '#fbe7e9' if not flat_brim else '#d8dbe4', None, 0.7)
    crown = shell('crown', HEAD_C + V((0, 0.01, 0.03)), HEAD_R * V((1.11, 1.1, 1.06)), lambda d: d.z > 0.18, m, H, seg=36, rings=20, rigid='Head', thick=0.012)
    parts = [crown]
    for k in range(6):   # ตะเข็บแบ่ง 6 แผง
        a = math.pi * k / 3
        pts = []
        for i in range(9):
            ph = math.radians(5 + 70 * i / 8)
            d = V((math.cos(a) * math.sin(ph), math.sin(a) * math.sin(ph), math.cos(ph)))
            pts.append(HEAD_C + V((0, 0.01, 0.03)) + V((d.x * HEAD_R.x * 1.11, d.y * HEAD_R.y * 1.1, d.z * HEAD_R.z * 1.06)) * 1.065)
        parts.append(polyline('seam', pts, 0.0016, st, H, rigid='Head', tseg=4))
    if flat_brim:   # ปีกแบน (สแนปแบ็ค) + ใต้ปีกสีตัด
        parts.append(ellipsoid('brim', (0, -0.215, 0.872), (0.13, 0.108, 0.0065), m, H, seg=32, rings=8, rigid='Head', rot=RX(-3)))
        parts.append(ellipsoid('under_brim', (0, -0.213, 0.8665), (0.125, 0.103, 0.003), t, H, seg=32, rings=6, rigid='Head', rot=RX(-3)))
    else:
        parts.append(ellipsoid('brim', (0, -0.205, 0.875), (0.13, 0.1, 0.012), m, H, seg=28, rings=10, rigid='Head', rot=RX(-8)))
        for k in range(3):
            parts.append(tube_arc('brim_st', (0, -0.205, 0.884), 0.06 + k * 0.022, 0.0013, math.radians(195), math.radians(345), st, H, plane='XY', seg=16, tseg=4, rigid='Head', scale=(1.25, 0.95, 1)))
    parts.append(ellipsoid('button', (0, 0.01, 1.005), (0.016, 0.016, 0.01), t, H, seg=10, rings=6, rigid='Head'))
    if logo:
        p, n = head_surface(0, 0.92, out=0.04)
        parts.append(flat_patch('logo', logo[0], 0.003, p + V((0, -0.006, 0)), n, fab(f'MAT_{name}_Logo', logo[1], None, 0.5), H, rigid='Head'))
    if flat_brim:   # สายปรับด้านหลัง (สแนปแบ็ค)
        parts.append(box_lo('snap_strap', (0, 0.205, 0.86), (0.07, 0.01, 0.014), t, H, bevel=0.3, rigid='Head'))
    return parts

def C_beanie():
    m, t = fab('MAT_Beanie', '#2bb0a6', 'knit', 0.95), fab('MAT_Beanie_Rib', '#1f8f86', 'rib', 0.95)
    parts = [shell('dome', HEAD_C + V((0, 0.01, 0.035)), HEAD_R * V((1.12, 1.11, 1.1)), lambda d: d.z > 0.2, m, H, seg=40, rings=22, rigid='Head', thick=0.014),
             tube_arc('cuff', (0, 0.01, 0.875), 0.226, 0.026, 0, 2 * math.pi, t, H, plane='XY', seg=40, tseg=8, rigid='Head', scale=(1, 0.93, 1))]
    pom = ellipsoid('pom', (0, 0.01, 1.02), (0.042, 0.042, 0.037), fab('MAT_Beanie_Pom', '#e8f6f4', 'fleece', 1.0), H, seg=16, rings=10, rigid='Head')
    rnd = random.Random(3)
    displace(pom, lambda p: (p - V((0, 0.01, 1.02))).normalized() * rnd.uniform(-0.003, 0.004))
    parts.append(pom)
    p, n = head_surface(0.08, 0.86, out=0.05)
    parts.append(flat_patch('label', outline_rect(0.03, 0.018, 0.003), 0.003, p, n, fab('MAT_Beanie_Label', '#f4f1ea', None, 0.7), H, rigid='Head'))
    return parts

def C_bucket():
    m, t = fab('MAT_Bucket', '#d8b98a', 'canvas', 0.9), fab('MAT_Bucket_Band', '#8f6f43', None, 0.8)
    st = fab('MAT_Bucket_Stitch', '#a8865a', None, 0.8)
    parts = [shell('dome', HEAD_C + V((0, 0.01, 0.04)), HEAD_R * V((1.1, 1.1, 1.0)), lambda d: d.z > 0.3, m, H, seg=40, rings=22, rigid='Head', thick=0.012),
             flared('brim', 0.875, 0.215, 0.835, 0.3, fab('MAT_Bucket_Brim', '#c4a170', 'canvas', 0.9), H, seg=40, flat=0.92, cy=0.01, rigid='Head'),
             tube_arc('band', (0, 0.01, 0.885), 0.218, 0.009, 0, 2 * math.pi, t, H, plane='XY', seg=40, tseg=6, rigid='Head', scale=(1, 0.92, 1))]
    for k, (z, r) in enumerate(((0.866, 0.24), (0.856, 0.262), (0.846, 0.284))):
        parts.append(tube_arc('brim_st', (0, 0.01, z + 0.006), r, 0.0012, 0, 2 * math.pi, st, H, plane='XY', seg=44, tseg=4, rigid='Head', scale=(1, 0.92, 1)))
    return parts

def C_grad():
    m, g = fab('MAT_GradCap', '#23233a', 'canvas', 0.6), fab('MAT_GradCap_Gold', '#ffd54a', None, 0.35, metal=0.4)
    parts = [shell('crown', HEAD_C + V((0, 0.01, 0.03)), HEAD_R * V((1.1, 1.1, 1.0)), lambda d: d.z > 0.42, m, H, seg=36, rings=20, rigid='Head', thick=0.012),
             prism('board', [(-0.17, -0.17), (0.17, -0.17), (0.17, 0.17), (-0.17, 0.17)], 0.014, (0, 0.0, 0.985), fab('MAT_GradCap_Board', '#2f2f4a', 'canvas', 0.6), H, rigid='Head', rot=RZ(45) @ RX(90)),
             ellipsoid('button', (0, 0.0, 0.997), (0.014, 0.014, 0.008), g, H, seg=10, rings=6, rigid='Head'),
             capsule('cord', (0.0, 0.0, 0.995), (0.16, -0.05, 0.99), 0.003, 0.003, g, H, seg=6, rings=4, rigid='Head')]
    for k in range(7):   # พู่ (เส้น ๆ)
        a = 2 * math.pi * k / 7
        parts.append(capsule('tassel', (0.16 + math.cos(a) * 0.004, -0.05 + math.sin(a) * 0.004, 0.99), (0.165 + math.cos(a) * 0.008, -0.06 + math.sin(a) * 0.008, 0.905), 0.0028, 0.0022, g, H, seg=5, rings=4, rigid='Head'))
    return parts

def C_wizard():
    m, g = fab('MAT_Wizard', '#5a3fb8', 'fleece', 0.75), fab('MAT_Wizard_Star', '#ffd54a', None, 0.4, emission='#5a4200')
    band = fab('MAT_Wizard_Band', '#ffd54a', None, 0.5)
    cone = flared('cone', 0.9, 0.2, 1.32, 0.012, m, H, seg=40, flat=1.0, cy=0.03, rigid='Head')
    cone.data.transform(Matrix.Translation((0, 0.03, 0.9)) @ Matrix.Rotation(math.radians(-10), 4, 'X') @ Matrix.Translation((0, -0.03, -0.9)))
    displace(cone, lambda p: V((0, max(0.0, p.z - 1.15) * 0.25, 0)))   # ปลายงอ
    return [cone, flared('brim', 0.9, 0.2, 0.885, 0.31, m, H, seg=40, flat=0.95, cy=0.01, rigid='Head'),
            tube_arc('band', (0, 0.012, 0.915), 0.205, 0.013, 0, 2 * math.pi, band, H, plane='XY', seg=40, tseg=6, rigid='Head', scale=(1, 0.97, 1)),
            prism('star', star_pts(0.035, 0.015), 0.006, (0, -0.16, 1.03), g, H, rigid='Head', rot=RX(-14)),
            prism('star2', star_pts(0.02, 0.009, 4), 0.005, (-0.09, -0.15, 0.95), g, H, rigid='Head', rot=RX(-6) @ RZ(20)),
            prism('star3', star_pts(0.016, 0.007, 4), 0.005, (0.1, -0.14, 0.98), g, H, rigid='Head', rot=RX(-8) @ RZ(-20))]

def C_pumpkin():
    m, s = fab('MAT_Pumpkin', '#f08a24', None, 0.65), fab('MAT_Pumpkin_Stem', '#4f7a2e', None, 0.8)
    dome = shell('dome', HEAD_C + V((0, 0.01, 0.03)), HEAD_R * V((1.14, 1.13, 1.08)), lambda d: d.z > 0.15, m, H, seg=56, rings=22, rigid='Head', thick=0.012)
    for v in dome.data.vertices:
        c = v.co - HEAD_C
        a = math.atan2(c.y, c.x)
        k = 1 + 0.045 * math.cos(8 * a) ** 2
        v.co = HEAD_C + V((c.x * k, c.y * k, c.z))
    parts = [dome, capsule('stem', (0, 0.01, 1.0), (0.015, 0.02, 1.07), 0.016, 0.01, s, H, seg=12, rings=6, rigid='Head'),
             ellipsoid('leaf', (0.045, 0.03, 1.025), (0.034, 0.016, 0.004), s, H, seg=12, rings=6, rigid='Head', rot=RY(-20))]
    parts.append(tube_arc('vine', (0.0, 0.01, 1.03), 0.03, 0.003, math.radians(200), math.radians(500), s, H, plane='XY', seg=18, tseg=4, rigid='Head'))
    return parts

def C_crown():
    import bpy
    import bmesh
    from eqlib import apply_mods
    g, gem, gem2 = fab('MAT_Crown', '#ffcf3f', None, 0.3, metal=0.6), fab('MAT_Crown_Gem', '#e8455d', None, 0.15), fab('MAT_Crown_Gem2', '#3f8bff', None, 0.15)
    bm = bmesh.new(); n = 60; r = 0.165
    lo, hi = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        spike = 0.05 * max(0.0, math.cos(5 * a)) ** 3
        lo.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r * 0.95, 0.93)))
        hi.append(bm.verts.new((math.cos(a) * r * 1.02, math.sin(a) * r * 0.97, 0.98 + spike)))
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    me = bpy.data.meshes.new('crown'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('crown', me); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(g); ob['eq_bones'] = 'Head'; ob['eq_rigid'] = 'Head'
    mod = ob.modifiers.new('s', 'SOLIDIFY'); mod.thickness = 0.008
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    parts = [ob, tube_arc('rim', (0, 0, 0.932), 0.166, 0.006, 0, 2 * math.pi, g, H, plane='XY', seg=40, tseg=6, rigid='Head', scale=(1, 0.95, 1))]
    for i in range(5):
        a = 2 * math.pi * i / 5
        parts.append(ellipsoid('tip', (math.cos(a) * r * 1.02, math.sin(a) * r * 0.97, 1.035), (0.011, 0.011, 0.011), g, H, seg=10, rings=6, rigid='Head'))
    parts.append(ellipsoid('gem', (0, -0.165, 0.955), (0.016, 0.007, 0.02), gem, H, seg=12, rings=8, rigid='Head'))
    for sx in (1, -1):
        parts.append(ellipsoid('gem2', (0.12 * sx, -0.115, 0.955), (0.011, 0.007, 0.013), gem2, H, seg=10, rings=6, rigid='Head', rot=RZ(-38 * sx)))
    return parts

def C_snapback():   # Streetwear: หมวกปีกแบน + สายสแนป + โลโก้
    return C_cap('#1f2a44', '#ff5a36', flat_brim=True, logo=(star_pts(0.024, 0.011), '#ff5a36'), name='Snapback')

def C_sunhat():     # Summer: หมวกปีกกว้างสาน + ริบบิ้นผูกโบว์
    m, rb = fab('MAT_SunHat', '#e8d29a', 'straw', 0.9), fab('MAT_SunHat_Ribbon', '#ff7a59', None, 0.7)
    parts = [shell('dome', HEAD_C + V((0, 0.01, 0.04)), HEAD_R * V((1.1, 1.1, 0.98)), lambda d: d.z > 0.3, m, H, seg=40, rings=22, rigid='Head', thick=0.01),
             flared('brim', 0.878, 0.215, 0.855, 0.38, m, H, seg=48, flat=0.95, cy=0.01, rigid='Head'),
             tube_arc('ribbon', (0, 0.01, 0.9), 0.218, 0.014, 0, 2 * math.pi, rb, H, plane='XY', seg=40, tseg=6, rigid='Head', scale=(1, 0.95, 1))]
    for sx in (1, -1):
        parts.append(ellipsoid('bow', (0.17 * sx * 0.3 + 0.17, 0.12, 0.905), (0.026, 0.008, 0.016), rb, H, seg=10, rings=6, rigid='Head', rot=RZ(30 * sx)))
    parts.append(prism('tail', [(-0.008, 0), (0.008, 0), (0.012, -0.06), (0.0, -0.05), (-0.006, -0.06)], 0.004, (0.18, 0.12, 0.89), rb, H, rigid='Head', rot=RZ(60)))
    return parts

def C_beret():      # Vintage: เบเรต์สักหลาด — ตัวหมวกแนบศีรษะ (ขอบหนังรัดรอบหัว) + ส่วนบนพองเอียงข้าง
    m = fab('MAT_Beret', '#8f1f2a', 'fleece', 0.9)
    lin = fab('MAT_Beret_Band', '#6e1620', 'rib', 0.9)
    parts = [shell('fit', HEAD_C + V((0, 0.01, 0.03)), HEAD_R * V((1.1, 1.09, 1.08)), lambda d: d.z > 0.3, m, H, seg=40, rings=18, rigid='Head', thick=0.012),
             ellipsoid('beret', (0.035, 0.0, 0.985), (0.225, 0.205, 0.058), m, H, seg=40, rings=16, rigid='Head', rot=RY(-12)),
             tube_arc('band', (0, 0.01, 0.885), 0.222, 0.011, 0, 2 * math.pi, lin, H, plane='XY', seg=40, tseg=6, rigid='Head', scale=(1, 0.93, 1)),
             capsule('stem', (0.035, 0.0, 1.035), (0.04, 0.0, 1.058), 0.006, 0.004, m, H, seg=8, rings=4, rigid='Head')]
    return parts

def C_headband():   # Sport: ผ้าคาดหัวกีฬา
    m = fab('MAT_Headband', '#1f6feb', 'rib', 0.95)
    logo = fab('MAT_Headband_Logo', '#ffffff', None, 0.6)
    parts = [tube_arc('band', (0, 0.0, 0.9), 0.212, 0.018, 0, 2 * math.pi, m, H, plane='XY', seg=44, tseg=8, rigid='Head', scale=(1, 0.92, 1))]
    p, n = head_surface(0, 0.9, out=0.035)
    parts.append(flat_patch('logo', star_pts(0.012, 0.005), 0.002, p, n, logo, H, rigid='Head'))
    return parts

# =====================================================================
# GLASSES / HEADPHONES
# =====================================================================
def glasses_frame(f, shape='round', w=0.036):
    parts = []
    for sx in (1, -1):
        p, _ = head_surface(0.074 * sx, 0.79, out=0.022)
        if shape == 'round':
            parts.append(tube_arc('rim', p, w, 0.0055, 0, 2 * math.pi, f, H, plane='XZ', seg=28, tseg=6, rigid='Head'))
        else:
            pts = [(p.x + x, p.y, p.z + z) for x, z in rrect_pts(0.068, 0.054, 0.012)]
            parts.append(tube_path('rim', pts, 0.006, f, H, closed=True, tseg=6, rigid='Head'))
        parts.append(capsule('temple', (0.11 * sx, p.y + 0.01, 0.8), (0.2 * sx, 0.02, 0.805), 0.004, 0.004, f, H, seg=6, rings=4, rigid='Head'))
        parts.append(ellipsoid('hinge', (0.11 * sx, p.y + 0.006, 0.8), (0.006, 0.006, 0.006), f, H, seg=8, rings=6, rigid='Head'))
    p, _ = head_surface(0, 0.8, out=0.022)
    parts.append(tube_arc('bridge', (0, p.y, 0.79), 0.02, 0.0045, math.radians(40), math.radians(140), f, H, plane='XZ', seg=10, tseg=6, rigid='Head'))
    return parts

def lens(f_color, alpha_dark=False, name='Lens', shape=None):
    return fab(f'MAT_{name}', f_color, None, 0.12, metal=0.3 if alpha_dark else 0.0)

def G_round():
    f = fab('MAT_Glasses_Frame', '#2b2440', None, 0.4)
    parts = glasses_frame(f)
    l = fab('MAT_Glasses_Lens', '#dff3ff', None, 0.05)
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.021)
        parts.append(ellipsoid('lens', p, (0.034, 0.002, 0.034), l, H, seg=20, rings=6, rigid='Head', rot=face_rot(n)))
    return parts

def G_sun():
    f, l = fab('MAT_Sunglasses_Frame', '#1d1d2b', None, 0.35), fab('MAT_Sunglasses_Lens', '#1b1d33', None, 0.12, metal=0.3)
    parts = glasses_frame(f)
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.02)
        parts.append(ellipsoid('lens', p, (0.036, 0.004, 0.03), l, H, seg=20, rings=8, rigid='Head', rot=face_rot(n)))
    return parts

def G_heart():
    f, l = fab('MAT_Heart_Frame', '#c2185b', None, 0.35), fab('MAT_Heart_Lens', '#ff5c8a', None, 0.2, emission='#3a0a1a')
    parts = []
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.024)
        parts.append(prism('lens', heart_pts(0.04), 0.008, p, l, H, rigid='Head', rot=face_rot(n)))
        parts.append(tube_path('rim', [(p.x + x, p.y - 0.004, p.z + z) for x, z in heart_pts(0.043, 24)], 0.0035, f, H, closed=True, tseg=5, rigid='Head'))
        parts.append(capsule('temple', (0.11 * sx, p.y + 0.01, 0.8), (0.2 * sx, 0.02, 0.805), 0.004, 0.004, f, H, seg=6, rings=4, rigid='Head'))
    p, _ = head_surface(0, 0.8, out=0.024)
    parts.append(capsule('bridge', (-0.03, p.y, 0.8), (0.03, p.y, 0.8), 0.004, 0.004, f, H, seg=6, rings=4, rigid='Head'))
    return parts

def G_visor():
    band = fab('MAT_Visor', '#36e2ff', None, 0.1, metal=0.2, emission='#0b5566')
    f = fab('MAT_Visor_Frame', '#2b2440', None, 0.4)
    v = shell('visor', HEAD_C, HEAD_R * V((1.12, 1.16, 1.0)), lambda d: d.y < -0.35 and -0.12 < d.z < 0.2, band, H, seg=56, rings=34, thick=0.006, rigid='Head')
    parts = [v, *[capsule('arm', (0.18 * sx, -0.11, 0.81), (0.205 * sx, 0.02, 0.81), 0.006, 0.006, f, H, seg=6, rings=4, rigid='Head') for sx in (1, -1)]]
    for k in range(3):   # เส้นสแกน
        parts.append(tube_arc('scan', (0, -0.006, 0.79 + (k - 1) * 0.016), 0.215, 0.0012, math.radians(225), math.radians(315), f, H, plane='XY', seg=16, tseg=4, rigid='Head', scale=(1.04, 0.98, 1)))
    return parts

def G_grammar():
    f, l = fab('MAT_Grammar_Frame', '#c99a10', None, 0.3, metal=0.5), fab('MAT_Grammar_Lens', '#bfe9e5', None, 0.1)
    parts = glasses_frame(f, shape='rect')
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.02)
        parts.append(prism('lens', rrect_pts(0.064, 0.05, 0.011), 0.003, p, l, H, rigid='Head', rot=face_rot(n), bevel=False))
    p, _ = head_surface(0, 0.84, out=0.03)
    parts.append(prism('spark', star_pts(0.014, 0.005, 4), 0.004, p, fab('MAT_Grammar_Star', '#ffd54a', None, 0.3, emission='#5a4200'), H, rigid='Head'))
    return parts

def G_aviator():    # Vintage: แว่นนักบิน ทรงหยดน้ำ สะพานคู่ โลหะทอง
    f, l = fab('MAT_Aviator_Frame', '#d9b45a', None, 0.25, metal=0.85), fab('MAT_Aviator_Lens', '#5a4a2a', None, 0.1, metal=0.3)
    drop = lambda s: [(math.cos(a) * 0.036 * s * (1 + 0.15 * math.sin(a)), math.sin(a) * 0.03 * s - 0.004 * (1 - math.sin(a))) for a in [2 * math.pi * i / 28 for i in range(28)]]
    parts = []
    for sx in (1, -1):
        p, n = head_surface(0.074 * sx, 0.79, out=0.022)
        parts.append(tube_path('rim', [(p.x + x * sx, p.y, p.z + z) for x, z in drop(1.02)], 0.0028, f, H, closed=True, tseg=5, rigid='Head'))
        parts.append(prism('lens', [(x * sx, z) for x, z in drop(1.0)][::sx], 0.002, p, l, H, rigid='Head', rot=face_rot(n), bevel=False))
        parts.append(capsule('temple', (0.112 * sx, p.y + 0.01, 0.805), (0.2 * sx, 0.02, 0.806), 0.0032, 0.0032, f, H, seg=6, rings=4, rigid='Head'))
    p, _ = head_surface(0, 0.8, out=0.022)
    for dz in (0.0, 0.022):
        parts.append(capsule('bridge', (-0.036, p.y, 0.8 + dz), (0.036, p.y, 0.8 + dz), 0.0024, 0.0024, f, H, seg=6, rings=4, rigid='Head'))
    return parts

def P_phones(band_c='#3a3f52', cup_c='#4d546b', glow=None, name=None, ears=None, plate=None):
    b = fab(f'MAT_Phones_Band_{name or band_c[1:]}', band_c, None, 0.5)
    c = fab(f'MAT_Phones_Cup_{name or cup_c[1:]}', cup_c, None, 0.45, emission=glow)
    pad = fab(f'MAT_Phones_Pad_{name or band_c[1:]}', '#2a2d38', 'leather', 0.6)
    parts = [tube_arc('band', (0, 0.0, 0.805), 0.236, 0.014, math.radians(8), math.radians(172), b, H, plane='XZ', seg=30, tseg=8, rigid='Head'),
             tube_arc('band_pad', (0, 0.0, 0.805), 0.224, 0.009, math.radians(55), math.radians(125), pad, H, plane='XZ', seg=14, tseg=6, rigid='Head')]
    for sx in (1, -1):
        parts.append(ellipsoid('cup', (0.236 * sx, 0.0, 0.79), (0.03, 0.055, 0.06), c, H, seg=20, rings=12, rigid='Head'))
        parts.append(tube_arc('cushion', (0.214 * sx, 0.0, 0.79), 0.048, 0.012, 0, 2 * math.pi, pad, H, plane='YZ' if False else 'XZ', seg=18, tseg=6, rigid='Head'))
        parts[-1].data.transform(Matrix.Translation((0.214 * sx, 0, 0.79)) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Translation((-0.214 * sx, 0, -0.79)))
        parts.append(capsule('slider', (0.232 * sx, 0.0, 0.85), (0.236 * sx, 0.0, 0.93), 0.006, 0.006, mat_metal(), H, seg=8, rings=4, rigid='Head'))
        if ears:
            e = fab('MAT_Phones_Ear', ears, None, 0.6)
            parts.append(prism('ear', [(-0.035, 0), (0.035, 0), (0.0, 0.07)], 0.02, (0.13 * sx, 0.0, 1.0), b, H, rigid='Head', rot=RY(-28 * sx)))
            parts.append(prism('ear_in', [(-0.018, 0), (0.018, 0), (0.0, 0.04)], 0.022, (0.13 * sx, -0.001, 1.008), e, H, rigid='Head', rot=RY(-28 * sx)))
        if plate:
            pl = fab('MAT_Phones_Plate', plate, None, 0.35, metal=0.4)
            parts.append(box_lo('plate', (0.268 * sx, 0.0, 0.79), (0.008, 0.04, 0.06), pl, H, rigid='Head'))
    return parts

def P_earmuffs():   # Winter: ที่ปิดหูขนนุ่ม
    fur, band = fab('MAT_Earmuff_Fur', '#f6c1d0', 'fleece', 1.0), fab('MAT_Earmuff_Band', '#c2185b', None, 0.4)
    parts = [tube_arc('band', (0, 0.0, 0.805), 0.232, 0.008, math.radians(10), math.radians(170), band, H, plane='XZ', seg=30, tseg=6, rigid='Head')]
    rnd = random.Random(4)
    for sx in (1, -1):
        m = ellipsoid('muff', (0.232 * sx, 0.0, 0.785), (0.04, 0.06, 0.062), fur, H, seg=24, rings=14, rigid='Head')
        displace(m, lambda p, sx=sx: (p - V((0.232 * sx, 0, 0.785))).normalized() * rnd.uniform(-0.003, 0.004))
        parts.append(m)
    return parts

# =====================================================================
# BACK
# =====================================================================
def straps(t):
    out = []
    for sx in (1, -1):
        pts = [V((0.075 * sx, 0.11, 0.5)), V((0.08 * sx, 0.04, 0.6)), V((0.085 * sx, -0.08, 0.56)), V((0.095 * sx, -0.115, 0.44)), V((0.1 * sx, -0.11, 0.36))]
        out.append(polyline('strap', pts, 0.012, t, ['Chest'], rigid='Chest', tseg=6))
    return out

def K_backpack(main='#d93a48', trim='#b02a37', name='Backpack', roll=None):
    m, t = fab(f'MAT_{name}', main, 'canvas', 0.75), fab(f'MAT_{name}_Trim', trim, 'canvas', 0.75)
    zipm = mat_metal('#c7ccd8')
    parts = [rbox('bag', (0, 0.152, 0.415), (0.2, 0.085, 0.21), m, ['Chest'], rigid='Chest'),
             rbox('flap', (0, 0.17, 0.49), (0.18, 0.06, 0.07), t, ['Chest'], rigid='Chest'),
             rbox('pocket', (0, 0.198, 0.37), (0.13, 0.03, 0.08), t, ['Chest'], rigid='Chest'), *straps(t)]
    parts.append(tube_arc('zip', (0, 0.152, 0.43), 0.1, 0.003, math.radians(10), math.radians(170), zipm, ['Chest'], plane='XZ', seg=16, tseg=4, rigid='Chest', scale=(1, 1, 1)))
    parts[-1].data.transform(Matrix.Translation((0, 0.044, 0)))
    parts.append(box_lo('puller', (0.05, 0.215, 0.405), (0.008, 0.004, 0.02), zipm, ['Chest'], bevel=0.3, rigid='Chest'))
    parts.append(polyline('handle', [V((-0.03, 0.14, 0.52)), V((0.0, 0.15, 0.545)), V((0.03, 0.14, 0.52))], 0.006, t, ['Chest'], rigid='Chest'))
    if roll:
        r = fab(f'MAT_{name}_Roll', roll, 'fleece', 0.9)
        parts.append(capsule('roll', (-0.11, 0.16, 0.555), (0.11, 0.16, 0.555), 0.035, 0.035, r, ['Chest'], seg=18, rings=8, rigid='Chest'))
        for x in (-0.06, 0.06):
            parts.append(tube_arc('roll_strap', (x, 0.16, 0.555), 0.037, 0.004, 0, 2 * math.pi, t, ['Chest'], plane='YZ' if False else 'XZ', seg=14, tseg=4, rigid='Chest'))
            parts[-1].data.transform(Matrix.Translation((x, 0.16, 0.555)) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Translation((-x, -0.16, -0.555)))
    return parts

def K_jetpack():
    s, red, cy, fl = fab('MAT_Jet_Tank', '#b9c3d6', None, 0.3, metal=0.6), fab('MAT_Jet_Body', '#d93a48', None, 0.5), fab('MAT_Jet_Light', '#36e2ff', None, 0.2, emission='#36e2ff'), fab('MAT_Jet_Flame', '#ffb13d', None, 0.3, emission='#ff8a3d')
    parts = [rbox('body', (0, 0.15, 0.42), (0.12, 0.06, 0.18), red, ['Chest'], rigid='Chest'), *straps(fab('MAT_Jet_Strap', '#5d6680', 'mesh', 0.7))]
    for sx in (1, -1):
        x = 0.085 * sx
        parts += [capsule('tank', (x, 0.17, 0.32), (x, 0.17, 0.5), 0.05, 0.05, s, ['Chest'], seg=22, rings=10, rigid='Chest'),
                  tube_arc('ring', (x, 0.17, 0.43), 0.052, 0.006, 0, 2 * math.pi, cy, ['Chest'], plane='XY', seg=20, tseg=6, rigid='Chest'),
                  tube_arc('ring2', (x, 0.17, 0.36), 0.052, 0.004, 0, 2 * math.pi, red, ['Chest'], plane='XY', seg=20, tseg=6, rigid='Chest')]
        noz = flared('nozzle', 0.29, 0.03, 0.255, 0.04, red, ['Chest'], seg=18, flat=1.0, rigid='Chest')
        noz.data.transform(Matrix.Translation((x, 0.17, 0)))
        parts += [noz, capsule('flame', (x, 0.17, 0.25), (x, 0.17, 0.16), 0.028, 0.006, fl, ['Chest'], seg=12, rings=8, rigid='Chest')]
    return parts

def K_cape():
    m, g = fab('MAT_Cape', '#4b2a9a', 'fleece', 0.7), fab('MAT_Cape_Gold', '#ffcf3f', None, 0.3, metal=0.5)
    cape = shell('cape', (0, 0.0, 0.33), (0.21, 0.19, 0.32), lambda d: d.y > 0.25 and d.z < 0.78, m, ['Chest', 'Spine', 'Hips'], seg=48, rings=32, thick=0.008)
    cape['eq_loose'] = True
    # shell() ดึงขอบรอยตัดขึ้นตามแกน z — รอยตัดแนว y ของผ้าคลุมจึงมีจุดไปกองที่ขั้วบน (กลางคอ) → ลบทิ้ง
    delete_where(cape, lambda p: p.z > 0.6 and abs(p.x) < 0.07 and p.y < 0.08)
    for v in cape.data.vertices:
        k = 1 + max(0.0, 0.42 - v.co.z) * 0.9
        v.co.x *= k
        v.co.y = v.co.y * (1 + max(0.0, 0.42 - v.co.z) * 0.6) + 0.03
        v.co.y += 0.004 * math.sin(v.co.x * 60) * max(0.0, 0.45 - v.co.z) * 4   # รอยพลิ้ว
    parts = [cape, tube_arc('collar', (0, 0.02, 0.555), 0.08, 0.016, math.radians(-20), math.radians(200), m, ['Chest'], plane='XY', seg=20, tseg=8, rigid='Chest')]
    parts.append(ellipsoid('clasp', (0, -0.092, 0.545), (0.022, 0.01, 0.022), g, ['Chest'], seg=14, rings=8, rigid='Chest'))
    parts.append(prism('c2', [(-0.008, -0.01), (0.008, -0.01), (0.008, 0.01), (-0.008, 0.01)], 0.004, (0, -0.103, 0.545), m, ['Chest'], rigid='Chest', bevel=False))
    return parts

def K_skateboard(): # Streetwear: สเก็ตบอร์ดสะพายหลัง (เฉียง)
    deck, grip, wheel, truck = fab('MAT_Skate_Deck', '#ff5a36', None, 0.5), fab('MAT_Skate_Grip', '#1d1d24', 'canvas', 0.9), fab('MAT_Skate_Wheel', '#f6e7a1', None, 0.5), mat_metal('#b8bfcc')
    rot = RY(-28)
    parts = [rbox('deck', (0, 0.19, 0.42), (0.16, 0.012, 0.5), deck, ['Chest'], bevel=0.45, rigid='Chest', rot=rot),
             rbox('grip', (0, 0.182, 0.42), (0.15, 0.004, 0.48), grip, ['Chest'], bevel=0.45, rigid='Chest', rot=rot)]
    for dz in (-0.17, 0.17):
        c = V((0, 0.21, 0.42)) + rot @ V((0, 0, dz))
        parts.append(box_lo('truck', c, (0.11, 0.016, 0.02), truck, ['Chest'], bevel=0.3, rigid='Chest', rot=rot))
        for sx in (1, -1):
            w = c + rot @ V((0.06 * sx, 0.012, 0))
            parts.append(ellipsoid('wheel', w, (0.014, 0.02, 0.02), wheel, ['Chest'], seg=14, rings=8, rigid='Chest', rot=rot))
    parts += straps(fab('MAT_Skate_Strap', '#2b2440', 'mesh', 0.7))
    return parts

def K_tote():       # Minimal: กระเป๋าผ้าแคนวาส สะพายไหล่ (ห้อยข้างหลัง)
    m, h = fab('MAT_Tote', '#efe6d2', 'canvas', 0.95), fab('MAT_Tote_Handle', '#c9b38a', 'canvas', 0.9)
    parts = [rbox('tote', (-0.1, 0.155, 0.32), (0.16, 0.04, 0.17), m, ['Chest'], bevel=0.15, rigid='Chest', rot=RY(8))]
    parts.append(polyline('handle', [V((-0.16, 0.15, 0.4)), V((-0.12, 0.1, 0.56)), V((-0.06, 0.0, 0.6)), V((0.0, -0.1, 0.56)), V((0.05, -0.14, 0.45))], 0.007, h, ['Chest'], rigid='Chest', tseg=5))
    parts.append(flat_patch('tote_print', star_pts(0.03, 0.013), 0.0015, V((-0.1, 0.176, 0.32)), V((0, 1, 0)), fab('MAT_Tote_Print', '#1f2a44', None, 0.7), ['Chest'], rigid='Chest'))
    return parts

def K_quiver():     # Fantasy: กระบอกลูกธนู + สายคาดอก
    leather, wood, feather = fab('MAT_Quiver', '#7a4a2a', 'leather', 0.6), fab('MAT_Quiver_Wood', '#c79a52', None, 0.7), fab('MAT_Quiver_Feather', '#e8455d', None, 0.8)
    rot = RY(22)
    base = V((0.02, 0.17, 0.42))
    parts = [capsule('quiver', base + rot @ V((0, 0, -0.14)), base + rot @ V((0, 0, 0.14)), 0.045, 0.05, leather, ['Chest'], seg=22, rings=8, rigid='Chest'),
             ring('quiver_rim', base + rot @ V((0, 0, 0.14)), rot @ V((0, 0, 1)), 0.052, 0.006, fab('MAT_Quiver_Rim', '#d9b45a', None, 0.4, metal=0.6), ['Chest'], seg=22, rigid='Chest')]
    for k, (dx, dy) in enumerate(((-0.018, 0.0), (0.0, 0.012), (0.018, -0.004), (0.006, -0.016))):
        a = base + rot @ V((dx, dy, 0.1)); b = base + rot @ V((dx, dy, 0.24))
        parts.append(capsule('arrow', a, b, 0.0035, 0.0035, wood, ['Chest'], seg=6, rings=4, rigid='Chest'))
        parts.append(prism('fletch', [(-0.008, 0), (0.008, 0), (0.0, 0.03)], 0.002, b - rot @ V((0, 0, 0.03)), feather, ['Chest'], rigid='Chest', rot=rot @ RX(90 * 0) , bevel=False))
    parts.append(polyline('strap', [V((0.13, 0.12, 0.56)), V((0.1, 0.0, 0.6)), V((0.0, -0.12, 0.52)), V((-0.1, -0.12, 0.38)), V((-0.14, 0.02, 0.3))], 0.008, leather, ['Chest'], rigid='Chest', tseg=5))
    return parts

def K_sling():      # Cyber: กระเป๋าสลิงเทค + สายคาดอกหัวล็อก
    m, s = fab('MAT_Sling', '#1b1e27', 'mesh', 0.6), fab('MAT_Sling_Strap', '#3a4152', 'mesh', 0.7)
    glow = fab('MAT_Sling_Glow', '#c2ff3d', None, 0.3, emission='#5a7a10')
    parts = [rbox('sling', (0.05, 0.155, 0.5), (0.17, 0.05, 0.09), m, ['Chest'], bevel=0.4, rigid='Chest', rot=RY(-25)),
             polyline('glow', [V((-0.02, 0.182, 0.535)), V((0.12, 0.182, 0.47))], 0.0025, glow, ['Chest'], rigid='Chest')]
    parts.append(polyline('strap', [V((0.14, 0.12, 0.46)), V((0.14, -0.04, 0.4)), V((0.04, -0.13, 0.4)), V((-0.08, -0.12, 0.52)), V((-0.12, 0.02, 0.6)), V((-0.06, 0.14, 0.56))], 0.009, s, ['Chest'], rigid='Chest', tseg=5))
    parts.append(box_lo('buckle', (0.04, -0.135, 0.4), (0.03, 0.008, 0.022), mat_metal('#9aa3b5'), ['Chest'], bevel=0.3, rigid='Chest'))
    return parts

# =====================================================================
# ACCESSORIES
# =====================================================================
def A_watch():
    b, f = fab('MAT_Watch_Band', '#3a3f52', 'leather', 0.6), fab('MAT_Watch_Face', '#e8f3ff', None, 0.2, metal=0.2)
    case = mat_metal('#c7ccd8')
    w = V((0.184, 0, 0.3)); d = V((0.15, 0, -0.99)).normalized()
    return [ring('band', w, d, 0.04, 0.008, b, G_ARM_L, seg=22, tseg=6),
            ellipsoid('case', (0.184, -0.041, 0.3), (0.018, 0.007, 0.018), case, G_ARM_L, seg=16, rings=8),
            ellipsoid('face', (0.184, -0.047, 0.3), (0.014, 0.003, 0.014), f, G_ARM_L, seg=14, rings=6),
            capsule('hand', (0.184, -0.0505, 0.3), (0.184, -0.0505, 0.31), 0.0012, 0.0012, b, G_ARM_L, seg=4, rings=4)]

def A_scarf():
    m, t = fab('MAT_Scarf', '#d93a48', 'knit', 0.95), fab('MAT_Scarf_Stripe', '#b02a37', 'knit', 0.95)
    parts = [tube_arc('wrap', (0, 0.0, 0.565), 0.072, 0.032, 0, 2 * math.pi, m, ['Chest', 'Neck'], plane='XY', seg=28, tseg=10),
             rbox('tail', (0.045, -0.13, 0.46), (0.05, 0.018, 0.15), m, ['Chest'], rigid='Chest', rot=RY(8)),
             rbox('tail2', (0.0, -0.118, 0.5), (0.05, 0.016, 0.09), m, ['Chest'], rigid='Chest', rot=RY(-14))]
    for z in (0.415, 0.43):
        parts.append(box_lo('stripe', (0.04, -0.14, z), (0.052, 0.006, 0.008), t, ['Chest'], rigid='Chest', rot=RY(8)))
    for k in range(6):   # ชายครุย
        parts.append(capsule('fringe', (0.03 + k * 0.007, -0.14, 0.386), (0.031 + k * 0.007, -0.141, 0.37), 0.0022, 0.0018, m, ['Chest'], seg=5, rings=4, rigid='Chest'))
    return parts

def A_medal():
    rb, g, s = fab('MAT_Medal_Ribbon', '#3f7fe0', 'weave', 0.7), fab('MAT_Medal_Gold', '#ffcf3f', None, 0.25, metal=0.7), fab('MAT_Medal_Star', '#fff3b0', None, 0.3)
    return [capsule('rib_l', (-0.05, -0.085, 0.565), (-0.008, -0.14, 0.43), 0.012, 0.012, rb, ['Chest'], flat=0.4, rigid='Chest'),
            capsule('rib_r', (0.05, -0.085, 0.565), (0.008, -0.14, 0.43), 0.012, 0.012, rb, ['Chest'], flat=0.4, rigid='Chest'),
            ellipsoid('disc', (0, -0.148, 0.405), (0.034, 0.008, 0.034), g, ['Chest'], seg=28, rings=8, rigid='Chest'),
            tube_arc('rim', (0, -0.154, 0.405), 0.031, 0.003, 0, 2 * math.pi, g, ['Chest'], plane='XZ', seg=24, tseg=4, rigid='Chest'),
            prism('star', star_pts(0.018, 0.008), 0.004, (0, -0.157, 0.405), s, ['Chest'], rigid='Chest')]

def _neck_curve(drop=0.1, n=18, front=-0.14, width=0.07, z_top=0.56):
    pts = []
    for i in range(n + 1):
        a = math.pi * i / n          # 0..π ด้านหน้า
        x = math.cos(a) * width
        z = z_top - math.sin(a) * drop
        y = -math.sqrt(max(0.0, 1 - (x / (width + 0.06)) ** 2)) * (abs(front) * 0.9) * max(0.0, math.sin(a)) ** 0.5
        pts.append(V((x, min(y, -0.04), z)))
    back = [V((-width * 0.95, 0.02, z_top + 0.005)), V((0.0, 0.07, z_top + 0.01)), V((width * 0.95, 0.02, z_top + 0.005))]
    return [off_body(p) for p in pts], [off_body(p) for p in back]

def off_body(p, off=0.009):
    """ดันจุดของสร้อย/ผ้าผูกคอให้อยู่ "นอก" ผิว Base (โดมบ่า = capsule ลำตัวแบน 0.74 · คอ = capsule r 0.046) + ระยะเผื่อ
    — ตรวจ sink ใน Blender พบสร้อยจมในบ่า 1–1.5 ซม. ก่อนแก้"""
    p = V(p)
    # โดมบนของลำตัว: ศูนย์ (0,0,0.47) รัศมี 0.124 (แกน y แบน 0.74)
    if p.z > 0.47:
        d = V((p.x, p.y / 0.74, p.z - 0.47))
        if d.length < 0.124 + off:
            d = d.normalized() * (0.124 + off)
            p = V((d.x, d.y * 0.74, d.z + 0.47))
    # คอ
    h = math.hypot(p.x, p.y)
    if 0.52 < p.z < 0.64 and h < 0.046 + off:
        k = (0.046 + off) / max(h, 1e-6)
        p = V((p.x * k, p.y * k, p.z))
    return p

def A_chain():      # Streetwear: สร้อยโซ่
    g = fab('MAT_Chain', '#e8c35a', None, 0.2, metal=0.95)
    pts, _ = _neck_curve(drop=0.11, n=26, front=-0.14, width=0.075)
    parts = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        parts.append(ring('link', p, d.cross(V((0, 0, 1))) if i % 2 else V((0, 1, 0)), 0.0065, 0.0022, g, ['Chest'], seg=8, tseg=4, rigid='Chest'))
    parts.append(polyline('back', [off_body(q) for q in [V((-0.075, -0.04, 0.56)), V((-0.06, 0.03, 0.57)), V((0, 0.07, 0.575)), V((0.06, 0.03, 0.57)), V((0.075, -0.04, 0.56))]], 0.0024, g, ['Chest'], rigid='Chest'))
    return parts

def A_bowtie():     # Smart: โบว์ไท
    m = fab('MAT_Bowtie', '#8f1f2a', 'weave', 0.6)
    p = V((0, -0.098, 0.548))
    parts = [box_lo('knot', p, (0.016, 0.014, 0.016), m, ['Chest'], bevel=0.45, rigid='Chest')]
    for sx in (1, -1):
        parts.append(prism('wing', [(0, -0.006), (0.034 * sx, -0.018), (0.034 * sx, 0.018), (0, 0.006)][::sx], 0.012, p + V((0, 0.002, 0)), m, ['Chest'], rigid='Chest'))
    return parts

def A_sweatband():  # Sport: สายรัดข้อมือผ้าขนหนู
    m = fab('MAT_Sweatband', '#ffffff', 'fleece', 1.0)
    s = fab('MAT_Sweatband_Stripe', '#1f6feb', None, 0.6)
    w = V((0.184, 0, 0.3)); d = V((0.15, 0, -0.99)).normalized()
    return [tube_open('band', [w - d * 0.02, w + d * 0.02], [0.045, 0.045], m, G_ARM_L, seg=24, cap_start=False, loop=0.006, thick=0.008),
            ring('stripe', w, d, 0.0465, 0.003, s, G_ARM_L, seg=24, tseg=4)]

def A_lanyard():    # School: สายคล้องบัตรนักเรียน
    cord, card, clip = fab('MAT_Lanyard', '#1f6feb', 'weave', 0.7), fab('MAT_Lanyard_Card', '#ffffff', None, 0.4), mat_metal()
    pts, back = _neck_curve(drop=0.2, n=12, front=-0.135, width=0.06)
    parts = [polyline('cord', pts, 0.004, cord, ['Chest'], rigid='Chest', tseg=4), polyline('cord_back', back, 0.004, cord, ['Chest'], rigid='Chest', tseg=4)]
    c = V((0.0, -0.145, 0.33))
    parts.append(flat_patch('card', outline_rect(0.05, 0.068, 0.005), 0.003, c, V((0, -1, 0.15)), card, ['Chest', 'Spine'], rigid='Chest'))
    parts.append(flat_patch('photo', outline_rect(0.018, 0.022, 0.002), 0.001, c + V((-0.012, -0.0035, 0.01)), V((0, -1, 0.15)), fab('MAT_Lanyard_Photo', '#9fc5ff', None, 0.6), ['Chest'], rigid='Chest'))
    for k in range(3):
        parts.append(flat_patch('line', outline_rect(0.016, 0.003, 0.001), 0.001, c + V((0.012, -0.0035, 0.016 - k * 0.008)), V((0, -1, 0.15)), cord, ['Chest'], rigid='Chest'))
    parts.append(box_lo('clip', c + V((0, 0.0, 0.04)), (0.01, 0.006, 0.014), clip, ['Chest'], bevel=0.3, rigid='Chest'))
    return parts

def A_amulet():     # Fantasy: เครื่องราง (อัญมณีเรืองแสงในกรอบทอง)
    cord, gold, gem = fab('MAT_Amulet_Cord', '#3a2615', 'leather', 0.6), fab('MAT_Amulet_Gold', '#d9b45a', None, 0.25, metal=0.85), fab('MAT_Amulet_Gem', '#36e2ff', None, 0.1, emission='#1a8fa7')
    pts, back = _neck_curve(drop=0.13, n=14, front=-0.14, width=0.065)
    c = V((0, -0.152, 0.42))
    return [polyline('cord', pts, 0.0028, cord, ['Chest'], rigid='Chest', tseg=4), polyline('cord_back', back, 0.0028, cord, ['Chest'], rigid='Chest', tseg=4),
            ring('bezel', c, (0, -1, 0), 0.022, 0.005, gold, ['Chest'], seg=20, rigid='Chest'),
            ellipsoid('gem', c + V((0, -0.002, 0)), (0.018, 0.008, 0.022), gem, ['Chest'], seg=16, rings=10, rigid='Chest'),
            *[prism('prong', star_pts(0.008, 0.003, 4), 0.003, c + V((math.cos(a) * 0.024, -0.004, math.sin(a) * 0.024)), gold, ['Chest'], rigid='Chest') for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]]

def A_smartband():  # Cyber: สมาร์ตแบนด์จอเรืองแสง
    b, scr = fab('MAT_SmartBand', '#20232e', 'rib', 0.6), fab('MAT_SmartBand_Screen', '#36e2ff', None, 0.1, emission='#36e2ff')
    w = V((0.184, 0, 0.3)); d = V((0.15, 0, -0.99)).normalized()
    return [ring('band', w, d, 0.04, 0.007, b, G_ARM_L, seg=22, tseg=6),
            box_lo('screen', (0.184, -0.044, 0.3), (0.018, 0.006, 0.03), scr, G_ARM_L, bevel=0.4)]

def A_mittens():    # Winter: ถุงมือไหมพรม (ครอบมือ)
    m, r = fab('MAT_Mitten', '#d93a48', 'knit', 0.95), fab('MAT_Mitten_Rib', '#f4f1ea', 'rib', 0.95)
    parts = []
    for sx in (1, -1):
        arm = G_ARM_L if sx > 0 else G_ARM_R
        hand = V((0.192 * sx, -0.004, 0.243))
        mit = ellipsoid('mitten', hand + V((0.0, -0.003, -0.002)), (0.052, 0.05, 0.06), m, arm, seg=24, rings=14)   # ครอบมือกลม (style v3)
        delete_where(mit, lambda p: p.z > 0.286)   # ยอดโดมที่อยู่ในปลอกข้อมือ/แขน (มองไม่เห็น) — ตัดทิ้ง ไม่จมในแขน
        parts.append(mit)
        parts.append(capsule('thumb', (0.168 * sx, -0.05, 0.262), (0.16 * sx, -0.062, 0.236), 0.016, 0.015, m, arm, seg=12, rings=6))
        parts.append(tube_open('cuff', [(0.188 * sx, 0, 0.31), (0.19 * sx, 0, 0.278)], [0.044, 0.046], r, arm, seg=22, cap_start=False, loop=0.006, thick=0.006))
        parts.append(flat_patch('flake', star_pts(0.014, 0.004, 6), 0.002, hand + V((0.0, -0.053, 0.0)), V((0.1 * sx, -1, 0)), r, arm))
    return parts

def A_beads():      # Summer: กำไลลูกปัด
    cols = ['#ff7a59', '#ffd166', '#06d6a0', '#118ab2', '#ef476f']
    w = V((0.184, 0, 0.3)); d = V((0.15, 0, -0.99)).normalized()
    nx = d.cross(V((0, 1, 0))).normalized(); by = d.cross(nx).normalized()
    parts = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        p = w + (nx * math.cos(a) + by * math.sin(a)) * 0.041
        parts.append(ellipsoid('bead', p, (0.0068, 0.0068, 0.0068), fab(f'MAT_Bead_{i % 5}', cols[i % 5], None, 0.35), G_ARM_L, seg=10, rings=6))
    return parts

def A_garland():    # Seasonal (สงกรานต์): พวงมาลัยดอกมะลิ + ดาวเรือง
    jas, mar, rib = fab('MAT_Garland_Jasmine', '#fffdf5', None, 0.7), fab('MAT_Garland_Marigold', '#ffb020', None, 0.7), fab('MAT_Garland_Ribbon', '#e8455d', None, 0.6)
    pts, back = _neck_curve(drop=0.18, n=22, front=-0.15, width=0.075)
    parts = []
    for i, p in enumerate(pts):
        m = mar if i % 5 == 2 else jas
        r = 0.011 if m is mar else 0.008
        parts.append(ellipsoid('flower', p + V((0, -0.006, 0)), (r, r, r), m, ['Chest'], seg=10, rings=6, rigid='Chest'))
    parts.append(polyline('back', [p + V((0, 0.0, 0)) for p in back], 0.007, jas, ['Chest'], rigid='Chest', tseg=5))
    low = pts[len(pts) // 2]
    parts.append(ellipsoid('rose', low + V((0, -0.014, -0.012)), (0.018, 0.012, 0.018), rib, ['Chest'], seg=14, rings=8, rigid='Chest'))
    for k in (-1, 1):
        parts.append(capsule('tassel', low + V((0.006 * k, -0.014, -0.028)), low + V((0.012 * k, -0.016, -0.08)), 0.004, 0.0025, rib, ['Chest'], seg=6, rings=4, rigid='Chest'))
    return parts

# =====================================================================
# EFFECTS
# =====================================================================
def E_sparkles():
    m = fab('MAT_Fx_Sparkle', '#ffd54a', None, 0.3, emission='#ffcc33')
    pts = [(-0.34, 0.86, 0.022), (0.34, 0.74, 0.026), (-0.32, 0.36, 0.018), (0.33, 0.28, 0.022), (0.26, 1.0, 0.016), (-0.26, 0.6, 0.014)]
    return [prism('sp', star_pts(r, r * 0.32, 4), 0.006, (x, -0.02, z), m, ['Root'], rigid='Root') for x, z, r in pts]

def E_books():
    out = []
    for i, (x, z, c, rz) in enumerate(((-0.34, 0.86, '#4f7fe0', -14), (0.34, 0.92, '#d93a48', 12), (0.36, 0.5, '#3fa36b', -8))):
        cov, pg = fab(f'MAT_Fx_Book_{i}', c, 'leather', 0.6), fab('MAT_Fx_Pages', '#fffaf0', None, 0.8)
        out += [rbox('cover', (x, 0.0, z), (0.11, 0.08, 0.02), cov, ['Root'], bevel=0.15, rigid='Root', rot=RY(rz) @ RX(15)),
                rbox('pages', (x, -0.002, z + 0.004), (0.1, 0.07, 0.018), pg, ['Root'], bevel=0.1, rigid='Root', rot=RY(rz) @ RX(15))]
    return out

def E_aurora():
    m = fab('MAT_Fx_Aurora', '#ffffff', None, 0.4, emission='#1c4a44')
    return [shell('aurora', (0, 0.18, 0.62), (0.42, 0.12, 0.55), lambda d: d.y > 0.2 and -0.4 < d.z < 0.75, m, ['Root'], seg=48, rings=24, thick=0.0, rigid='Root')]

def aurora_tint(ob):
    from eqlib import vertex_tint
    lin = lambda h: tuple(((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5))
    a, b, c = lin('#7fffd4'), lin('#68a9ff'), lin('#a781ff')
    def fn(p):
        t = max(0.0, min(1.0, (p.z - 0.2) / 0.9))
        if t < 0.5:
            k = t / 0.5
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))
        k = (t - 0.5) / 0.5
        return tuple(b[i] + (c[i] - b[i]) * k for i in range(3))
    vertex_tint(ob, fn)

def E_orbit():
    g, st = fab('MAT_Fx_Orbit', '#ffd54a', None, 0.3, emission='#7a5a00'), fab('MAT_Fx_OrbitStar', '#fff3b0', None, 0.3, emission='#ffd54a')
    ring_ = tube_arc('ring', (0, 0, 0.0), 0.36, 0.005, 0, 2 * math.pi, g, ['Root'], plane='XY', seg=64, tseg=6, rigid='Root')
    T = Matrix.Translation((0, 0, 0.42)) @ Matrix.Rotation(math.radians(-12), 4, 'Y') @ Matrix.Rotation(math.radians(10), 4, 'X')
    ring_.data.transform(T)
    parts = [ring_]
    for a, r in ((200, 0.024), (330, 0.02), (90, 0.018)):
        p = T @ V((math.cos(math.radians(a)) * 0.36, math.sin(math.radians(a)) * 0.36, 0))
        parts.append(prism('star', star_pts(r, r * 0.42), 0.008, p, st, ['Root'], rigid='Root'))
    return parts

def E_snow():       # Winter/Seasonal: หิมะโปรยรอบตัว
    m = fab('MAT_Fx_Snow', '#ffffff', None, 0.3, emission='#9fc5ff')
    rnd = random.Random(21)
    out = []
    for i in range(16):
        x = rnd.choice((-1, 1)) * rnd.uniform(0.25, 0.4); z = rnd.uniform(0.15, 1.1); r = rnd.uniform(0.012, 0.022)
        out.append(prism('flake', star_pts(r, r * 0.3, 6), 0.004, (x, rnd.uniform(-0.1, 0.12), z), m, ['Root'], rigid='Root', rot=RY(rnd.uniform(0, 60)), bevel=False))
    return out

def E_lanterns():   # Seasonal (ลอยกระทง/ยี่เป็ง): โคมลอยเรืองแสง
    paper, top, fire = fab('MAT_Fx_Lantern', '#ffb347', 'canvas', 0.8, emission='#a8521a'), fab('MAT_Fx_LanternTop', '#c8323f', None, 0.6), fab('MAT_Fx_Fire', '#ffe066', None, 0.3, emission='#ffcf3f')
    out = []
    for x, y, z, s in ((-0.34, 0.08, 0.95, 1.0), (0.36, 0.04, 0.78, 0.85), (-0.3, 0.12, 0.45, 0.7)):
        out.append(capsule('lantern', (x, y, z - 0.05 * s), (x, y, z + 0.05 * s), 0.05 * s, 0.045 * s, paper, ['Root'], seg=18, rings=10, rigid='Root'))
        out.append(tube_arc('lantern_top', (x, y, z + 0.06 * s), 0.035 * s, 0.006 * s, 0, 2 * math.pi, top, ['Root'], plane='XY', seg=16, tseg=5, rigid='Root'))
        out.append(ellipsoid('flame', (x, y, z - 0.07 * s), (0.012 * s, 0.012 * s, 0.018 * s), fire, ['Root'], seg=10, rings=6, rigid='Root'))
    return out

def A_pendant():    # Minimal: สร้อยเส้นเล็ก + จี้แท่งเงิน
    s = fab('MAT_Pendant', '#d8dde8', None, 0.2, metal=0.95)
    pts, back = _neck_curve(drop=0.15, n=16, front=-0.14, width=0.06)
    c = pts[len(pts) // 2]
    return [polyline('chain', pts, 0.0016, s, ['Chest'], rigid='Chest', tseg=4), polyline('chain_back', back, 0.0016, s, ['Chest'], rigid='Chest', tseg=4),
            box_lo('bar', c + V((0, -0.004, -0.02)), (0.006, 0.004, 0.034), s, ['Chest'], rigid='Chest', bevel=0.3)]

def A_neckerchief():  # Vintage: ผ้าผูกคอ (ผ้าสามเหลี่ยม + ปมข้าง)
    m = fab('MAT_Neckerchief', '#b5452f', 'weave', 0.85)
    dots = fab('MAT_Neckerchief_Dot', '#f3e6c8', None, 0.8)
    parts = [tube_arc('wrap', (0, 0.0, 0.592), 0.062, 0.014, 0, 2 * math.pi, m, ['Chest', 'Neck'], plane='XY', seg=28, tseg=8)]   # วางบนคอ (เดิมจมในโดมบ่า)
    p, n = torso_point(0.0, 0.52, off=0.03)
    parts.append(flat_patch('tri', [(-0.05, 0.03), (0.05, 0.03), (0.0, -0.05)], 0.004, p, n, m, ['Chest'], rigid='Chest'))
    for x, z in ((-0.02, 0.535), (0.02, 0.535), (0.0, 0.51), (0.0, 0.49)):
        q, qn = torso_point(x, z, off=0.035)
        parts.append(disc('dot', q, qn, 0.004, 0.0015, dots, ['Chest'], rigid='Chest'))
    parts.append(ellipsoid('knot', (0.055, -0.07, 0.56), (0.016, 0.012, 0.014), m, ['Chest'], seg=10, rings=6, rigid='Chest'))
    return parts
