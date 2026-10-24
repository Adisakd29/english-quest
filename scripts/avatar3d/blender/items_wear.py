"""
EnglishQuest Avatar — เสื้อ · เสื้อคลุม · กางเกง/กระโปรง · รองเท้า (v2: Redesign ของเดิมทุกชิ้น + คอลเลกชันใหม่)
แต่ละฟังก์ชันคืน list ของชิ้นส่วน (bmesh objects) — join + skin + validate ใน build_avatar3d.py
itemId ของเดิมไม่เปลี่ยน (ราคา/ร้าน/inventory เดิม) · ของใหม่ใช้ itemId ใหม่
"""
import math

from mathutils import Vector

from eqdetail import box_lo, delete_where, disc, fab, flat_patch, outline_rect, polyline, ring, torso_point, tube_open, displace
from eqlib import (G_ARM_L, G_ARM_R, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, capsule, ellipsoid, heart_pts, prism, rbox, star_pts,
                   tube_arc)
from garments import (RX, RY, RZ, chest_pocket, collar_flaps, heel_tab, hood, jeans_details, laces, mat_metal, pants, placket,
                      print_on, shaft, shirt_body, side_panel, side_stripes, skirt, sleeve, sleeves, sole, tongue, turtle_neck, upper,
                      zipper)

V = Vector
ST = lambda c: fab(f'MAT_Stitch_{c[1:]}', c, None, rough=0.7)   # ด้ายเย็บ

# =====================================================================
# TOPS — ของเดิม (Redesign)
# =====================================================================
def T_tee(main='#4f7fe0', trim='#2f5cb8', name='Tee'):
    m, t = fab(f'MAT_{name}', main, 'weave', 0.85), fab(f'MAT_{name}_Rib', trim, 'rib', 0.85)
    parts = shirt_body(m, neck='crew', trim=t) + sleeves(m, 'short', trim=t)
    # ตะเข็บบ่า + ตะเข็บข้าง
    st = ST(trim)
    for sx in (1, -1):
        parts.append(polyline('side_seam', [V((0.14 * sx, 0.0, 0.235)), V((0.139 * sx, 0.0, 0.33)), V((0.137 * sx, 0.0, 0.43))], 0.0011, st, G_TORSO))
    return parts

def T_polo(main='#3fa36b', trim='#2d7a50'):
    m, t = fab('MAT_Polo', main, 'mesh', 0.8, nstr=0.35), fab('MAT_Polo_Rib', trim, 'rib', 0.8)
    btn = fab('MAT_Polo_Button', '#f3f6f4', None, 0.35)
    parts = shirt_body(m, neck='crew', trim=t) + sleeves(m, 'short', trim=t)
    parts += collar_flaps(m) + placket(m, btn, z0=0.47, z1=0.545, buttons=2, w=0.02)
    parts.append(print_on([(-0.008, -0.006), (0.008, -0.006), (0.008, 0.006), (-0.008, 0.006)], t, x=0.07, z=0.46))   # โลโก้เล็ก
    return parts

def T_hoodie(main='#8d96a8', trim='#77809a', name='Hoodie'):
    m, t = fab(f'MAT_{name}', main, 'fleece', 0.92), fab(f'MAT_{name}_Rib', trim, 'rib', 0.9)
    s = fab(f'MAT_{name}_String', '#f4f1ea', None, 0.7)
    parts = shirt_body(m, off=0.006, neck='crew', trim=t, hem_trim=False) + sleeves(m, 'long', off=0.004, cuff=t)
    parts.append(tube_open('hem_rib', [(0, 0, 0.226), (0, 0, 0.256)], [0.15, 0.149], t, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    parts += hood(m, s, lining=t)
    # กระเป๋าจิงโจ้ (ปะ + ตะเข็บ)
    p, n = torso_point(0.0, 0.31, off=0.028)
    parts.append(flat_patch('kangaroo', [(-0.075, 0.03), (0.075, 0.03), (0.09, -0.032), (-0.09, -0.032)], 0.005, p, n, m, ['Spine', 'Hips']))
    for sx in (1, -1):
        parts.append(polyline('pocket_edge', [p + n * 0.006 + V((0.074 * sx, 0, 0.028)), p + n * 0.006 + V((0.088 * sx, 0, -0.03))], 0.0016, t, ['Spine']))
    return parts

def T_stripe(main='#f7f5f0', stripe='#2d3a66'):
    m, s = fab('MAT_Stripe_White', main, 'weave', 0.85), fab('MAT_Stripe_Navy', stripe, 'weave', 0.85)
    parts = shirt_body(m, neck='crew', trim=s) + sleeves(m, 'short', trim=s)
    # ลายทางจริง: ห่วงรอบตัว (ไม่ใช่สีทาบ)
    for k in range(6):
        z = 0.262 + k * 0.042
        parts.append(tube_arc('stripe', (0, 0, z), 0.1435 if z < 0.47 else 0.14, 0.0085, 0, 2 * math.pi, s, G_TORSO, plane='XY', seg=40, tseg=4, scale=(1, 0.76, 1)))
    for sx in (1, -1):
        parts.append(ring('sleeve_band', (0.149 * sx, 0, 0.47), (0.25 * sx, 0, -0.97), 0.056, 0.006, s, G_ARM_L if sx > 0 else G_ARM_R, seg=22))
    return parts

def T_sweater(main='#e0a33a', rib='#c98a24', name='Sweater', pattern=None):
    m, t = fab(f'MAT_{name}', main, 'knit', 0.95), fab(f'MAT_{name}_Rib', rib, 'rib', 0.95)
    parts = shirt_body(m, off=0.006, neck='crew', trim=t, hem_trim=False, neck_r=0.064, trim_r=0.009) + sleeves(m, 'long', off=0.004, cuff=t)
    parts.append(tube_open('hem_rib', [(0, 0, 0.226), (0, 0, 0.262)], [0.15, 0.149], t, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    if pattern:
        parts += pattern()
    else:   # ลายถักเปีย (cable) 3 เส้นกลางอก
        for x in (-0.045, 0.0, 0.045):
            pts = []
            for i in range(17):
                z = 0.27 + i * 0.016
                pts.append(torso_point(x + 0.008 * math.sin(i * math.pi / 2), z, off=0.026)[0])
            parts.append(polyline('cable', pts, 0.0048, t, G_TORSO, tseg=5))
    return parts

def T_school(main='#f8fafc', tie='#2d3a66'):
    m, t = fab('MAT_School_Shirt', main, 'weave', 0.75), fab('MAT_School_Tie', tie, 'twill', 0.6)
    btn = fab('MAT_School_Button', '#e8ecf3', None, 0.3)
    parts = shirt_body(m, neck='crew') + sleeves(m, 'short') + collar_flaps(m, size=1.1)
    parts += placket(m, btn, z0=0.24, z1=0.5, buttons=4) + chest_pocket(m, ST('#c9d2e3'), x=0.07, z=0.42, flap=False)
    # เนคไท (ปมทรงสามเหลี่ยม + ใบไทเรียวปลายแหลม)
    p, n = torso_point(0.0, 0.535, off=0.03)
    parts.append(box_lo('knot', p, (0.026, 0.018, 0.022), t, ['Chest'], bevel=0.45, rigid='Chest'))
    blade = [(-0.012, 0.0), (0.012, 0.0), (0.022, -0.13), (0.0, -0.152), (-0.022, -0.13)]
    pt, nt = torso_point(0.0, 0.522, off=0.026)
    parts.append(flat_patch('tie', blade, 0.004, pt, nt, t, ['Chest', 'Spine'], rigid='Chest'))
    parts.append(polyline('tie_stripe', [pt + nt * 0.0045 + V((-0.016, 0, -0.06)), pt + nt * 0.0045 + V((0.016, 0, -0.045))], 0.0022, fab('MAT_School_TieStripe', '#c8323f', None, 0.6), ['Chest'], rigid='Chest'))
    return parts

def T_star():
    parts = T_tee('#23233a', '#3d3d5c', 'StarTee')
    star = fab('MAT_StarTee_Star', '#ffd54a', None, 0.45, emission='#3a2a00')
    parts.append(print_on(star_pts(0.052, 0.023), star, z=0.385, depth=0.004))
    for x, z, r in ((-0.07, 0.45, 0.012), (0.075, 0.33, 0.01), (-0.06, 0.29, 0.008)):
        parts.append(print_on(star_pts(r, r * 0.42, 4), star, x=x, z=z, depth=0.0025))
    return parts

def T_galaxy():
    parts = T_hoodie('#ffffff', '#d0559b', 'Galaxy')
    dots = fab('MAT_Galaxy_Stars', '#fff7c2', None, 0.3, emission='#fff1a0')
    import random
    rnd = random.Random(7)
    for _ in range(18):
        x = rnd.uniform(-0.11, 0.11); z = rnd.uniform(0.27, 0.52)
        parts.append(print_on(star_pts(0.006, 0.0025, 4), dots, x=x, z=z, off=0.029, depth=0.002))
    return parts

def galaxy_tint(ob):
    from eqlib import vertex_tint
    lin = lambda h: tuple(((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5))
    a, b, c = lin('#3b2b8f'), lin('#7b3fbf'), lin('#d0559b')
    def fn(p):
        t = max(0.0, min(1.0, (0.58 - p.z) / 0.36 + p.x * 0.6))
        if t < 0.55:
            k = t / 0.55
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))
        k = (t - 0.55) / 0.45
        return tuple(b[i] + (c[i] - b[i]) * k for i in range(3))
    me = ob.data
    ca = me.color_attributes.get('AO')
    mats = [m.name for m in me.materials]
    main_idx = mats.index('MAT_Galaxy') if 'MAT_Galaxy' in mats else -1
    vmat = {}
    for p in me.polygons:
        for vi in p.vertices:
            vmat.setdefault(vi, p.material_index)
    for i, d in enumerate(ca.data):
        if vmat.get(i) != main_idx:
            continue
        r, g, b_ = fn(ob.matrix_world @ me.vertices[i].co)
        cc = d.color
        d.color = (cc[0] * r, cc[1] * g, cc[2] * b_, 1)

# =====================================================================
# TOPS — คอลเลกชันใหม่
# =====================================================================
def T_oversize():   # Streetwear: เสื้อยืดโอเวอร์ไซซ์ ไหล่ตก ชายยาว + ลายกราฟิก
    m, t = fab('MAT_Oversize', '#f1ece2', 'canvas', 0.9), fab('MAT_Oversize_Rib', '#d9d2c4', 'rib', 0.9)
    ink, ink2 = fab('MAT_Oversize_Ink', '#ff5a36', None, 0.6), fab('MAT_Oversize_Ink2', '#1f2a44', None, 0.6)
    parts = shirt_body(m, off=0.008, neck='crew', trim=t, length=0.205) + sleeves(m, 'elbow', off=0.008, trim=t)
    bolt = [(-0.02, 0.05), (0.028, 0.05), (0.004, 0.006), (0.03, 0.006), (-0.026, -0.06), (-0.002, -0.012), (-0.03, -0.012)]
    parts.append(print_on([(-0.06, -0.035), (0.06, -0.035), (0.06, 0.035), (-0.06, 0.035)], ink2, z=0.39, off=0.03, depth=0.0018))
    parts.append(print_on(bolt, ink, z=0.39, off=0.032, depth=0.003))
    parts.append(print_on([(-0.07, -0.006), (0.07, -0.006), (0.07, 0.006), (-0.07, 0.006)], ink, z=0.43, off=0.03, depth=0.002, back=True))
    return parts

def T_oxford():     # Smart Casual: เชิ้ตอ็อกซ์ฟอร์ดแขนยาว ปก กระดุมหน้า กระเป๋าอก ข้อมือ
    m = fab('MAT_Oxford', '#cfe0f5', 'weave', 0.75)
    btn = fab('MAT_Oxford_Button', '#f6f7fa', None, 0.3)
    parts = shirt_body(m, neck='crew') + sleeves(m, 'long', cuff=m) + collar_flaps(m, size=1.1)
    parts += placket(m, btn, z0=0.235, z1=0.53, buttons=6) + chest_pocket(m, ST('#a9c2e3'), x=0.07, z=0.43, flap=False)
    for sx in (1, -1):   # กระดุมข้อมือ
        w = Vector((0.186 * sx, -0.045, 0.302))
        parts.append(disc('cuff_btn', w, Vector((0.2 * sx, -1, 0)), 0.005, 0.0025, btn, G_ARM_L if sx > 0 else G_ARM_R))
    return parts

def T_jersey():     # Sportwear: เสื้อกีฬา แขนแร็กแลนสีตัด คอวี เบอร์ด้านหน้า
    m, c, w = fab('MAT_Jersey', '#1f6feb', 'mesh', 0.6), fab('MAT_Jersey_Raglan', '#ffffff', 'mesh', 0.6), fab('MAT_Jersey_Num', '#ffd54a', None, 0.5)
    parts = shirt_body(m, neck='v', trim=c, vdepth=0.48) + sleeves(c, 'short', trim=m)
    digits = {'1': [(-0.006, 0.03), (0.008, 0.03), (0.008, -0.03), (-0.006, -0.03)],
              '7': [(-0.022, 0.03), (0.022, 0.03), (0.022, 0.018), (0.0, -0.03), (-0.014, -0.03), (0.006, 0.018), (-0.022, 0.018)]}
    parts.append(print_on(digits['1'], w, x=-0.024, z=0.37, off=0.022, depth=0.003))
    parts.append(print_on(digits['7'], w, x=0.018, z=0.37, off=0.022, depth=0.003))
    for sx in (1, -1):   # แถบข้างลำตัว
        pts = [torso_point(0.128 * sx, z, off=0.018)[0] for z in (0.24, 0.3, 0.36, 0.42)]
        parts.append(polyline('side_panel', pts, 0.008, c, G_TORSO, tseg=6))
    return parts

def T_turtleneck(): # Minimal: เสื้อคอเต่าไหมพรมเนื้อเรียบ
    m = fab('MAT_Turtle', '#2b2b33', 'rib', 0.9, nstr=0.35)
    parts = shirt_body(m, neck='turtle', hem_trim=True) + sleeves(m, 'long', cuff=m) + turtle_neck(m)
    return parts

def T_ringer():     # Vintage: เสื้อยืดริงเกอร์ ขอบคอ/แขนสีตัด + โลโก้วงกลมสไตล์เรโทร
    m, t = fab('MAT_Ringer', '#f3e6c8', 'weave', 0.88), fab('MAT_Ringer_Trim', '#b5452f', 'rib', 0.85)
    ink = fab('MAT_Ringer_Ink', '#b5452f', None, 0.7)
    parts = shirt_body(m, neck='crew', trim=t, trim_r=0.009) + sleeves(m, 'short', trim=t)
    for sx in (1, -1):
        parts.append(ring('sleeve_ring', (0.1535 * sx, 0, 0.452), (0.25 * sx, 0, -0.97), 0.058, 0.0075, t, G_ARM_L if sx > 0 else G_ARM_R, seg=22))
    circ = [(math.cos(2 * math.pi * i / 24) * 0.04, math.sin(2 * math.pi * i / 24) * 0.04) for i in range(24)]
    parts.append(print_on(circ, ink, z=0.39, depth=0.0022))
    parts.append(print_on(star_pts(0.022, 0.01), fab('MAT_Ringer_Ink2', '#f3e6c8', None, 0.7), z=0.39, off=0.024, depth=0.002))
    return parts

def T_tunic():      # Fantasy Adventure: ทูนิกนักผจญภัย ชายยาวบาน ร้อยเชือกคอวี เข็มขัดหนัง
    m, t = fab('MAT_Tunic', '#4f7a3a', 'weave', 0.9), fab('MAT_Tunic_Trim', '#c79a52', 'weave', 0.8)
    belt, buckle = fab('MAT_Tunic_Belt', '#6b4224', 'leather', 0.55), mat_metal('#d9b45a')
    parts = shirt_body(m, neck='v', trim=t, vdepth=0.46, length=0.17, trim_r=0.007) + sleeves(m, 'long', cuff=t)
    for i in range(3):   # เชือกร้อยคอวี
        z = 0.475 + i * 0.016
        a, _ = torso_point(-0.012 - (z - 0.46) * 0.6, z, off=0.02)
        b, _ = torso_point(0.012 + (z - 0.46) * 0.6, z + 0.008, off=0.02)
        parts.append(polyline('lacing', [a, b], 0.0018, t, ['Chest'], rigid='Chest'))
    parts.append(tube_arc('belt', (0, 0, 0.27), 0.1475, 0.012, 0, 2 * math.pi, belt, ['Hips', 'Spine'], plane='XY', seg=40, tseg=6, scale=(1, 0.77, 1)))
    p, n = torso_point(0.0, 0.27, off=0.036)
    parts.append(flat_patch('buckle', outline_rect(0.03, 0.026, 0.004), 0.004, p, n, buckle, ['Spine'], rigid='Spine'))
    parts.append(ellipsoid('pouch', (0.12, -0.06, 0.245), (0.024, 0.016, 0.026), belt, ['Hips'], seg=14, rings=8, rigid='Hips'))
    return parts

def T_techzip():    # Cyber/Techwear: เสื้อคอตั้งซิปกลาง แผงตัดต่อ เส้นสะท้อนแสง
    m, p2 = fab('MAT_TechTop', '#20232e', 'mesh', 0.55, nstr=0.3), fab('MAT_TechTop_Panel', '#353a4a', 'weave', 0.5)
    glow = fab('MAT_TechTop_Glow', '#36e2ff', None, 0.3, emission='#1aa7c4')
    parts = shirt_body(m, neck='turtle') + sleeves(m, 'long', cuff=p2) + turtle_neck(p2, h=0.05, r=0.066)
    parts += zipper(mat_metal('#9aa3b5'), glow, z0=0.3, z1=0.57, off=0.019)
    for sx in (1, -1):
        pts = [torso_point(0.09 * sx, z, off=0.02)[0] for z in (0.25, 0.32, 0.4, 0.47)]
        parts.append(polyline('glow_line', pts, 0.0026, glow, G_TORSO, tseg=5))
    return parts

def T_tank():       # Summer: เสื้อกล้าม เว้าแขน
    m, t = fab('MAT_Tank', '#ffb347', 'rib', 0.85, nstr=0.4), fab('MAT_Tank_Trim', '#f0f0ea', 'rib', 0.8)
    parts = shirt_body(m, neck='wide', trim=t, arm_holes=True)
    # เสื้อกล้ามเห็นไหล่/รักแร้: ซ่อนลำตัว Base (เป็นเสื้อยืดขาว) แล้วใส่ "ผิว" ใต้เสื้อแทน — ย้อมตามสีผิวผู้ใช้ (MAT_Skin*)
    skin = fab('MAT_Skin_TankBody', '#e8b48c', None, 0.55)
    sk = capsule('skin_torso', (0, 0, 0.32), (0, 0, 0.47), 0.112, 0.124, skin, G_TORSO, seg=32, rings=16, flat=0.74)
    delete_where(sk, lambda p: p.z < 0.36)
    parts.append(sk)
    parts.append(print_on([(math.cos(2 * math.pi * i / 20) * 0.026, math.sin(2 * math.pi * i / 20) * 0.026) for i in range(20)],
                          fab('MAT_Tank_Sun', '#fff2b0', None, 0.5), z=0.37, depth=0.0025))
    return parts

def _leaf(s=1.0):
    return [(0, 0.03 * s), (0.012 * s, 0.012 * s), (0.016 * s, -0.008 * s), (0, -0.03 * s), (-0.016 * s, -0.008 * s), (-0.012 * s, 0.012 * s)]

def _flower(r=0.014, n=5):
    pts = []
    for i in range(n * 4):
        a = 2 * math.pi * i / (n * 4)
        rr = r * (0.55 + 0.45 * abs(math.cos(n * a / 2)))
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    return pts

def T_hawaiian():   # Summer: เชิ้ตฮาวาย ปกเปิด ลายใบไม้ดอกไม้
    m = fab('MAT_Hawaii', '#1aa59a', 'weave', 0.8)
    btn = fab('MAT_Hawaii_Button', '#f6efe0', None, 0.35)
    leaf, flower = fab('MAT_Hawaii_Leaf', '#0d6b5f', None, 0.7), fab('MAT_Hawaii_Flower', '#ffcf5a', None, 0.6)
    parts = shirt_body(m, neck='v', vdepth=0.47) + sleeves(m, 'short') + collar_flaps(m, size=1.15)
    parts += placket(m, btn, z0=0.24, z1=0.46, buttons=4, w=0.018)
    import random
    rnd = random.Random(11)
    for i in range(16):
        x, z = rnd.uniform(-0.12, 0.12), rnd.uniform(0.26, 0.5)
        if abs(x) < 0.02:
            continue
        back = i % 3 == 0
        parts.append(print_on(_leaf(rnd.uniform(0.7, 1.1)) if i % 2 else _flower(), leaf if i % 2 else flower, x=x, z=z, off=0.021, depth=0.0016, back=back))
    return parts

def T_holiday():    # Seasonal: สเวตเตอร์เทศกาล ลายเกล็ดหิมะ + แถบลายถัก
    def pattern():
        w, r = fab('MAT_Holiday_Flake', '#ffffff', None, 0.8), fab('MAT_Holiday_Band', '#1f7a4a', 'knit', 0.95)
        out = [tube_arc('band', (0, 0, z), 0.149, 0.012, 0, 2 * math.pi, r, G_TORSO, plane='XY', seg=40, tseg=6, scale=(1, 0.76, 1)) for z in (0.3, 0.46)]
        for x in (-0.07, 0.0, 0.07):
            out.append(print_on(star_pts(0.022, 0.006, 6), w, x=x, z=0.38, off=0.026, depth=0.0024))
            out.append(print_on([(math.cos(2 * math.pi * i / 12) * 0.006, math.sin(2 * math.pi * i / 12) * 0.006) for i in range(12)], w, x=x, z=0.38, off=0.0285, depth=0.002))
        return out
    return T_sweater('#c8323f', '#8f1f2a', 'Holiday', pattern=pattern)

def T_songkran():   # Seasonal (สงกรานต์): เชิ้ตลายดอกไม้ไทย แขนสั้น กระดุมหน้า
    m = fab('MAT_Songkran', '#4fb3f6', 'weave', 0.8)
    btn = fab('MAT_Songkran_Button', '#ffffff', None, 0.3)
    f1, f2, lf = fab('MAT_Songkran_F1', '#ff6fa8', None, 0.6), fab('MAT_Songkran_F2', '#ffe066', None, 0.6), fab('MAT_Songkran_Leaf', '#2e9e57', None, 0.7)
    parts = shirt_body(m, neck='v', vdepth=0.48) + sleeves(m, 'short') + collar_flaps(m, size=1.05)
    parts += placket(m, btn, z0=0.24, z1=0.47, buttons=4, w=0.018)
    import random
    rnd = random.Random(23)
    for i in range(18):
        x, z = rnd.uniform(-0.12, 0.12), rnd.uniform(0.26, 0.5)
        if abs(x) < 0.022:
            continue
        mm = (f1, f2, lf)[i % 3]
        shape = _leaf(0.8) if mm is lf else _flower(0.013, 4 + i % 2)
        parts.append(print_on(shape, mm, x=x, z=z, off=0.021, depth=0.0016, back=i % 4 == 0))
    return parts

# =====================================================================
# OUTERWEAR (Redesign + ใหม่) — ทับเสื้อด้านใน (ระยะห่างมากกว่า) · ผ่าหน้า
# =====================================================================
def lapels(m, notch=True, z_top=0.54, z_bot=0.4, off=0.04):
    out = []
    for sx in (1, -1):
        a, n = torso_point(0.028 * sx, z_top, off=off)
        b, _ = torso_point(0.06 * sx, z_bot + 0.06, off=off)
        c, _ = torso_point(0.032 * sx, z_bot, off=off)
        pts = [a, b, c]
        outline = [(0.0, 0.0), (0.045 * sx, -0.03), (0.028 * sx, -0.06), (0.004 * sx, -0.14)] if notch else [(0.0, 0.0), (0.04 * sx, -0.06), (0.004 * sx, -0.14)]
        if sx < 0:
            outline = list(reversed(outline))
        out.append(flat_patch('lapel', outline, 0.005, a, n, m, ['Chest'], rigid='Chest'))
    return out

def O_jacket(main='#5f86c4', trim='#456aa6', name='Denim', long=False, stripes=None):
    fabric = {'Denim': 'twill', 'LabCoat': 'weave', 'RankJacket': 'weave'}.get(name, 'weave')
    m, t = fab(f'MAT_{name}', main, fabric, 0.8), fab(f'MAT_{name}_Trim', trim, fabric, 0.75)
    btn = mat_metal('#c9a35a') if name == 'Denim' else fab(f'MAT_{name}_Button', '#f4f4f4', None, 0.35)
    parts = shirt_body(m, off=0.022, neck='open', open_front=0.024, length=0.12 if long else None, hem=0.215, trim=t, trim_r=0.0055)
    parts += sleeves(m, 'long', off=0.02, cuff=t)
    parts += lapels(t if name == 'RankJacket' else m, notch=name != 'Denim', off=0.044)
    if name == 'Denim':
        st = ST('#d9a441')
        for sx in (1, -1):
            parts += chest_pocket(t, btn, x=0.075 * sx, z=0.44, off=0.042, w=0.045, h=0.04)
            yoke = [torso_point(x * sx, 0.5, off=0.043)[0] for x in (0.03, 0.06, 0.09, 0.12)]
            parts.append(polyline('yoke_st', yoke, 0.0012, st, ['Chest'], rigid='Chest'))
        for i in range(4):
            z = 0.26 + i * 0.07
            p, n = torso_point(0.03, z, off=0.044)
            parts.append(disc('btn', p, n, 0.0065, 0.003, btn, ['Spine'] if z < 0.4 else ['Chest'], rigid='Spine' if z < 0.4 else 'Chest'))
    if name == 'LabCoat':
        pen = fab('MAT_LabCoat_Pen', '#4f7fe0', None, 0.4)
        p, n = torso_point(0.08, 0.43, off=0.044)
        parts.append(flat_patch('pocket', outline_rect(0.045, 0.05, 0.004), 0.004, p, n, t, ['Chest'], rigid='Chest'))
        parts.append(capsule('pen', p + n * 0.006 + Vector((-0.008, 0, 0.012)), p + n * 0.006 + Vector((-0.008, 0, 0.05)), 0.004, 0.004, pen, ['Chest'], seg=8, rings=4, rigid='Chest'))
        for sx in (1, -1):
            hp, hn = torso_point(0.085 * sx, 0.24, off=0.046)
            parts.append(flat_patch('hip_pocket', outline_rect(0.055, 0.05, 0.005), 0.004, hp, hn, t, ['Hips', 'Spine']))
        badge = fab('MAT_LabCoat_Badge', '#e8455d', None, 0.5)
        bp, bn = torso_point(-0.08, 0.46, off=0.045)
        parts.append(flat_patch('badge', outline_rect(0.03, 0.018, 0.003), 0.003, bp, bn, badge, ['Chest'], rigid='Chest'))
    if stripes:
        s = fab(f'MAT_{name}_Stripe', stripes, None, 0.5)
        for sx in (1, -1):
            for k in (0, 1):
                d = Vector((0.25 * sx, 0, -0.97))
                c = Vector((0.135 * sx, 0, 0.525)) + d * (0.055 + k * 0.016)
                parts.append(ring('stripe', c, d, 0.072, 0.005, s, G_ARM_L if sx > 0 else G_ARM_R, seg=22))
        star = fab('MAT_RankJacket_Star', '#ffcf3f', None, 0.35, metal=0.5)
        parts.append(print_on(star_pts(0.022, 0.01), star, x=-0.075, z=0.44, off=0.044, depth=0.003))
    return parts

def O_blazer():     # Smart Casual: เบลเซอร์ ปกกลับ กระดุม 2 เม็ด กระเป๋าฝา ผ้าเช็ดหน้า
    m = fab('MAT_Blazer', '#2f3a56', 'twill', 0.7, nstr=0.35)
    btn = fab('MAT_Blazer_Button', '#1b2235', None, 0.3)
    sq = fab('MAT_Blazer_Square', '#e9c46a', None, 0.6)
    parts = shirt_body(m, off=0.022, neck='open', open_front=0.03, length=0.17, trim_r=0.004, hem_trim=False)
    parts += sleeves(m, 'long', off=0.02, hem=True) + lapels(m, notch=True, z_top=0.55, z_bot=0.36, off=0.045)
    for z in (0.3, 0.35):
        p, n = torso_point(0.035, z, off=0.044)
        parts.append(disc('btn', p, n, 0.0075, 0.0035, btn, ['Spine'], rigid='Spine'))
    for sx in (1, -1):
        hp, hn = torso_point(0.085 * sx, 0.23, off=0.046)
        parts.append(flat_patch('flap', outline_rect(0.06, 0.016, 0.003), 0.004, hp, hn, m, ['Hips', 'Spine']))
    p, n = torso_point(-0.08, 0.455, off=0.046)
    parts.append(flat_patch('welt', outline_rect(0.04, 0.008, 0.002), 0.003, p, n, m, ['Chest'], rigid='Chest'))
    parts.append(flat_patch('square', [(-0.014, 0), (0.014, 0), (0.008, 0.016), (0.0, 0.01), (-0.008, 0.018)], 0.004, p + n * 0.002 + Vector((0, 0, 0.004)), n, sq, ['Chest'], rigid='Chest'))
    return parts

def O_bomber():     # Streetwear: บอมเบอร์ ขอบยางยืด ซิปหน้า กระเป๋าแขน
    m, r = fab('MAT_Bomber', '#4a5a3a', 'weave', 0.5, nstr=0.25), fab('MAT_Bomber_Rib', '#d9772b', 'rib', 0.85)
    parts = shirt_body(m, off=0.026, neck='crew', open_front=0.012, hem=0.24, trim=r, trim_r=0.006, hem_trim=False, neck_r=0.066)
    parts.append(tube_open('hem_rib', [(0, 0, 0.236), (0, 0, 0.266)], [0.17, 0.169], r, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    parts.append(ring('collar_rib', (0, 0.004, 0.566), (0, 0, 1), 0.07, 0.014, r, ['Chest', 'Neck'], seg=28, flat=0.92))
    parts += sleeves(m, 'long', off=0.03, cuff=r, puff=0.006)
    parts += zipper(mat_metal('#c7ccd8'), mat_metal('#c7ccd8'), z0=0.25, z1=0.55, off=0.042)
    p = Vector((0.152, -0.06, 0.45))
    parts.append(flat_patch('sleeve_pocket', outline_rect(0.028, 0.04, 0.004), 0.004, p, Vector((0.6, -1, 0)), m, G_ARM_L))
    return parts

def O_varsity():    # School & Campus: แจ็กเก็ตวาร์ซิตี้ แขนสีตัด ตัวอักษรหน้าอก ขอบลายแถบ กระดุมแป๊ก
    m, s, r = fab('MAT_Varsity', '#7a1f2b', 'fleece', 0.9), fab('MAT_Varsity_Sleeve', '#f2ead8', 'leather', 0.5), fab('MAT_Varsity_Rib', '#7a1f2b', 'rib', 0.85)
    stripe = fab('MAT_Varsity_Stripe', '#f2ead8', None, 0.8)
    letter = fab('MAT_Varsity_Letter', '#f2c14e', 'fleece', 0.9)
    parts = shirt_body(m, off=0.026, neck='crew', open_front=0.012, hem=0.24, trim=r, trim_r=0.006, hem_trim=False, neck_r=0.066)
    parts.append(tube_open('hem_rib', [(0, 0, 0.236), (0, 0, 0.268)], [0.17, 0.169], r, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    for z in (0.246, 0.258):
        parts.append(tube_arc('hem_stripe', (0, 0, z), 0.1715, 0.0028, 0, 2 * math.pi, stripe, ['Hips', 'Spine'], plane='XY', seg=40, tseg=4, scale=(1, 0.76, 1)))
    parts.append(ring('collar_rib', (0, 0.004, 0.566), (0, 0, 1), 0.07, 0.014, r, ['Chest', 'Neck'], seg=28, flat=0.92))
    parts += sleeves(s, 'long', off=0.03, cuff=r)
    E = [(-0.024, 0.03), (0.024, 0.03), (0.024, 0.018), (-0.008, 0.018), (-0.008, 0.006), (0.018, 0.006), (0.018, -0.006), (-0.008, -0.006),
         (-0.008, -0.018), (0.024, -0.018), (0.024, -0.03), (-0.024, -0.03)]
    parts.append(print_on(E, letter, x=-0.075, z=0.42, off=0.044, depth=0.004))
    for i in range(5):
        z = 0.27 + i * 0.065
        p, n = torso_point(0.022, z, off=0.044)
        parts.append(disc('snap', p, n, 0.006, 0.003, mat_metal('#e3c47a'), ['Spine'] if z < 0.4 else ['Chest'], rigid='Spine' if z < 0.4 else 'Chest'))
    return parts

def O_cardigan():   # Vintage: คาร์ดิแกนไหมพรม คอวี กระดุม กระเป๋าปะ
    m, r = fab('MAT_Cardigan', '#c9a46a', 'knit', 0.95), fab('MAT_Cardigan_Rib', '#a8864d', 'rib', 0.95)
    btn = fab('MAT_Cardigan_Button', '#5a3b22', None, 0.4)
    parts = shirt_body(m, off=0.02, neck='open', open_front=0.03, hem=0.215, trim=r, trim_r=0.008)
    parts += sleeves(m, 'long', off=0.018, cuff=r)
    for i in range(4):
        z = 0.25 + i * 0.055
        p, n = torso_point(0.034, z, off=0.04)
        parts.append(disc('btn', p, n, 0.007, 0.003, btn, ['Spine'], rigid='Spine'))
    for sx in (1, -1):
        hp, hn = torso_point(0.085 * sx, 0.26, off=0.04)
        parts.append(flat_patch('pocket', outline_rect(0.05, 0.05, 0.006), 0.005, hp, hn, m, ['Spine', 'Hips']))
        parts.append(polyline('pocket_rib', [hp + hn * 0.006 + Vector((-0.024, 0, 0.022)), hp + hn * 0.006 + Vector((0.024, 0, 0.022))], 0.0035, r, ['Spine']))
    return parts

def O_techshell():  # Cyber/Techwear: เสื้อกันลมฮู้ด ซิปเฉียง สายรัด แถบสะท้อนแสง
    m, d = fab('MAT_TechShell', '#2a2f3d', 'weave', 0.45, nstr=0.2), fab('MAT_TechShell_Strap', '#11141c', 'mesh', 0.6)
    glow = fab('MAT_TechShell_Glow', '#c2ff3d', None, 0.3, emission='#5a7a10')
    parts = shirt_body(m, off=0.026, neck='crew', open_front=0.012, hem=0.21, trim=d, trim_r=0.006, neck_r=0.066)
    parts += sleeves(m, 'long', off=0.028, cuff=d) + hood(m, d, strings=False, lining=d)
    parts += zipper(mat_metal('#7d8699'), glow, z0=0.22, z1=0.56, off=0.042, x=0.012)
    for sx in (1, -1):   # สายรัดอก + หัวเข็มขัด
        a, _ = torso_point(-0.13 * sx, 0.5, off=0.046); b, _ = torso_point(0.13 * sx, 0.34, off=0.046)
        if sx > 0:
            parts.append(polyline('strap', [a, a.lerp(b, 0.5) + Vector((0, -0.006, 0)), b], 0.0065, d, G_TORSO, tseg=4))
    for sx in (1, -1):
        d_ = Vector((0.25 * sx, 0, -0.97))
        parts.append(ring('reflect', Vector((0.135 * sx, 0, 0.525)) + d_ * 0.1, d_, 0.074, 0.0035, glow, G_ARM_L if sx > 0 else G_ARM_R, seg=22))
    return parts

def O_puffer():     # Winter: เสื้อบุนวม (ลอนบุนวมจริง) คอตั้ง ซิป
    m, t = fab('MAT_Puffer', '#3b6ff5', 'quilt', 0.45, nstr=0.4), fab('MAT_Puffer_Trim', '#22336b', 'weave', 0.6)
    q = lambda i, j, a: 0.0055 * abs(math.sin(i * math.pi / 5.0))
    parts = shirt_body(m, off=0.03, neck='crew', open_front=0.012, hem=0.215, trim=t, trim_r=0.008, neck_r=0.07, quilt=0.007)
    parts += [p for sx in (1, -1) for p in sleeve(m, sx, 'long', off=0.034, cuff=t, wave=q)]
    parts.append(tube_open('collar', [(0, 0, 0.53), (0, 0, 0.6)], [0.082, 0.078], m, ['Chest', 'Neck'], seg=28, cap_start=False, loop=0.01, thick=0.008))
    parts.append(ring('collar_top', (0, 0, 0.6), (0, 0, 1), 0.079, 0.009, t, ['Neck'], seg=28))
    parts += zipper(mat_metal('#d8dde8'), t, z0=0.22, z1=0.6, off=0.05)
    return parts

# =====================================================================
# BOTTOMS
# =====================================================================
def B_jeans():
    m, w = fab('MAT_Jeans', '#3b5b8f', 'twill', 0.85), fab('MAT_Jeans_Waist', '#2a4470', 'twill', 0.85)
    return pants(m, 'long', waist=w) + jeans_details(ST('#d9a441'), mat_metal('#c9a35a'), back_pocket=m)

def B_skirt_pleated():
    m, b = fab('MAT_Skirt', '#2f3e66', 'twill', 0.8, nstr=0.35), fab('MAT_Skirt_Band', '#24304f', 'twill', 0.8)
    parts = skirt(m, b)
    parts.append(disc('btn', (0.06, -0.1, 0.305), (0.4, -1, 0), 0.006, 0.003, mat_metal('#c7ccd8'), ['Hips'], rigid='Hips'))
    return parts

def B_shorts_khaki():
    m, w = fab('MAT_Shorts', '#c9a46a', 'twill', 0.85, nstr=0.35), fab('MAT_Shorts_Waist', '#a8864d', 'twill', 0.85)
    return pants(m, 'short', fit=0.004, waist=w, cuff=m) + jeans_details(ST('#8f6f3a'), mat_metal('#b08a48'))

def B_cargo():
    m, w, p = fab('MAT_Cargo', '#6b7449', 'weave', 0.85), fab('MAT_Cargo_Waist', '#4e5530', 'weave', 0.85), fab('MAT_Cargo_Pocket', '#5a6239', 'weave', 0.85)
    parts = pants(m, 'long', fit=0.006, waist=w, cuff=w)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        c = Vector((0.124 * sx, 0.0, 0.17)); n = Vector((sx, 0, 0))
        parts.append(flat_patch('cargo_pocket', outline_rect(0.05, 0.05, 0.006), 0.008, c, n, p, leg, up=Vector((0, 0, 1))))
        parts.append(flat_patch('cargo_flap', outline_rect(0.054, 0.016, 0.004), 0.004, c + n * 0.008 + Vector((0, 0, 0.026)), n, w, leg))
    return parts + jeans_details(ST('#3f4428'), mat_metal('#7d8466'))

def B_skirt_plaid():
    m, b = fab('MAT_Plaid', '#b8323b', 'weave', 0.8), fab('MAT_Plaid_Band', '#7a1f27', 'weave', 0.8)
    parts = skirt(m, b, pleats=22)
    line, gold = fab('MAT_Plaid_Line', '#7a1f27', None, 0.8), fab('MAT_Plaid_Gold', '#f6d36b', None, 0.6)
    sk = parts[0]
    sk.data.materials.append(line); sk.data.materials.append(gold)
    for p in sk.data.polygons:
        c = p.center
        ang = math.atan2(c.y, c.x)
        if abs(((c.z - 0.15) % 0.034) - 0.017) < 0.005:
            p.material_index = 2
        elif int((ang + math.pi) / (math.pi / 10)) % 2 == 0:
            p.material_index = 1
    return parts

def B_chinos():     # Smart Casual: ชิโน่ทรงสลิม พับปลาย จีบหน้า
    m, w = fab('MAT_Chinos', '#c7b28a', 'twill', 0.8, nstr=0.3), fab('MAT_Chinos_Waist', '#a8936a', 'twill', 0.8)
    parts = pants(m, 'ankle', fit=-0.002, waist=w, cuff=m)
    for sx in (1, -1):   # รอยจีบหน้าขา
        parts.append(polyline('crease', [Vector((0.062 * sx, -0.059, 0.24)), Vector((0.064 * sx, -0.053, 0.135)), Vector((0.066 * sx, -0.05, 0.1))], 0.0011, ST('#a8936a'), G_LEG_L if sx > 0 else G_LEG_R))
    return parts + jeans_details(ST('#a8936a'), fab('MAT_Chinos_Btn', '#5a4a30', None, 0.4))

def B_track():      # Sportwear: กางเกงวอร์ม แถบข้าง ปลายจั๊ม
    m, s = fab('MAT_Track', '#1d2b4f', 'weave', 0.5, nstr=0.2), fab('MAT_Track_Stripe', '#ffffff', None, 0.5)
    return pants(m, 'long', fit=0.006, waist=fab('MAT_Track_Waist', '#141e38', 'rib', 0.7), cuff=fab('MAT_Track_Cuff', '#141e38', 'rib', 0.7)) + side_stripes(s, n=2)

def B_wide():       # Minimal: กางเกงขากว้างทิ้งตัว
    m = fab('MAT_Wide', '#e8e2d6', 'weave', 0.85, nstr=0.25)
    parts = pants(m, 'ankle', fit=0.004, flare=0.026, waist=m)
    for sx in (1, -1):
        parts.append(polyline('pleat', [Vector((0.05 * sx, -0.088, 0.31)), Vector((0.058 * sx, -0.09, 0.26))], 0.0012, ST('#c9c1b0'), ['Hips'], rigid='Hips'))
    return parts

def B_corduroy():   # Vintage: กางเกงลูกฟูกขาตรง
    m, w = fab('MAT_Cord', '#8a4b2a', 'corduroy', 0.95), fab('MAT_Cord_Waist', '#6e3a1f', 'corduroy', 0.95)
    return pants(m, 'long', fit=0.004, waist=w) + jeans_details(ST('#5a2e17'), mat_metal('#b08a48'), back_pocket=m)

def B_ranger():     # Fantasy: กางเกงนักผจญภัย ผ้าพันเข่า กระเป๋าคาดต้นขา
    m, wrap, belt = fab('MAT_Ranger', '#5d4b3a', 'weave', 0.9), fab('MAT_Ranger_Wrap', '#c9b38a', 'weave', 0.9), fab('MAT_Ranger_Belt', '#3a2615', 'leather', 0.55)
    parts = pants(m, 'long', fit=0.006, waist=belt)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        for k in range(4):
            parts.append(ring('wrap', (0.065 * sx, 0, 0.075 + k * 0.016), (0, 0.15 * k - 0.2, 1), 0.06, 0.0055, wrap, leg, seg=24))
    parts.append(ring('thigh_strap', (0.064, 0, 0.2), (0, 0, 1), 0.071, 0.005, belt, G_LEG_L, seg=24))
    parts.append(box_lo('thigh_pouch', (0.124, -0.02, 0.19), (0.02, 0.05, 0.05), belt, G_LEG_L, bevel=0.35))
    parts.append(disc('buckle', (0.0, -0.103, 0.318), (0, -1, 0), 0.012, 0.004, mat_metal('#d9b45a'), ['Hips'], rigid='Hips'))
    return parts

def B_techjog():    # Cyber: จ็อกเกอร์เทค กระเป๋าคาร์โกมีสายรัด ปลายจั๊ม
    m, d = fab('MAT_TechJog', '#1b1e27', 'weave', 0.6, nstr=0.25), fab('MAT_TechJog_Strap', '#3a4152', 'mesh', 0.6)
    glow = fab('MAT_TechJog_Glow', '#36e2ff', None, 0.3, emission='#1aa7c4')
    parts = pants(m, 'ankle', fit=0.006, waist=d, cuff=d)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        c = Vector((0.124 * sx, 0.0, 0.18)); n = Vector((sx, 0, 0))
        parts.append(flat_patch('pocket', outline_rect(0.05, 0.055, 0.006), 0.008, c, n, d, leg))
        parts.append(ring('strap', (0.064 * sx, 0, 0.115), (0, 0, 1), 0.06, 0.0055, d, leg, seg=24))
        parts.append(polyline('glow', [Vector((0.124 * sx + 0.009 * sx, 0.0, z)) for z in (0.21, 0.15)], 0.0018, glow, leg))
    return parts

def B_board():      # Summer: กางเกงขาสั้นชายหาด ลายใบไม้ เชือกผูกเอว
    m = fab('MAT_Board', '#ff7a59', 'weave', 0.6, nstr=0.25)
    lf = fab('MAT_Board_Leaf', '#ffd6a5', None, 0.7)
    parts = pants(m, 'knee', fit=0.01, waist=fab('MAT_Board_Waist', '#d95b3f', 'weave', 0.6))
    for sx in (1, -1):
        for k, z in enumerate((0.15, 0.2, 0.25)):
            c = Vector((0.07 * sx + 0.02 * k * sx * 0.2, -0.066, z)); n = Vector((0.2 * sx, -1, 0)).normalized()
            parts.append(flat_patch('leaf', _leaf(0.8), 0.002, c, n, lf, G_LEG_L if sx > 0 else G_LEG_R))
    s = fab('MAT_Board_String', '#ffffff', None, 0.7)
    parts.append(polyline('drawstring', [Vector((-0.01, -0.104, 0.31)), Vector((-0.018, -0.106, 0.27))], 0.0022, s, ['Hips'], rigid='Hips'))
    parts.append(polyline('drawstring', [Vector((0.01, -0.104, 0.31)), Vector((0.016, -0.106, 0.272))], 0.0022, s, ['Hips'], rigid='Hips'))
    return parts

# =====================================================================
# SHOES
# =====================================================================
def _shoe_common(sx, up_m, sole_m, sole_h=0.02, lace_m=None, eyelet=None, tongue_m=None, high=0.0, low=False, lip=None, scale=1.0,
                 tread=None, panel=None, panel_m=None, heel=None, toe=None, laces_n=4):
    parts = sole(sx, sole_m, h=sole_h, lip=lip, scale=scale, tread_m=tread)
    up, oz = upper(sx, up_m, sole_h=sole_h, low=low, w=0.104 * scale, length=0.168 * scale)
    parts += up
    if toe:
        parts.append(ellipsoid('toe_cap', (0.066 * sx, -0.088 * scale, sole_h + 0.016), (0.05 * scale, 0.036, 0.024), toe, G_LEG_L if sx > 0 else G_LEG_R, seg=20, rings=10))
    if lace_m:
        parts += tongue(sx, tongue_m or up_m, sole_h)
        parts += laces(sx, lace_m, eyelet or mat_metal(), sole_h=sole_h, n=laces_n)
    if high:
        parts += shaft(sx, up_m, sole_h + 0.04, sole_h + 0.04 + high, trim=lip or up_m)
    if panel:
        parts += side_panel(sx, panel_m or lip, sole_h, panel)
    if heel:
        parts += heel_tab(sx, heel, sole_h)
    return parts

def S_sneaker():
    up, so, ac = fab('MAT_Sneaker', '#fbfbfd', 'canvas', 0.7, nstr=0.25), fab('MAT_Sneaker_Sole', '#e6e8ef', 'tread', 0.85), fab('MAT_Sneaker_Accent', '#7aa7ff', None, 0.6)
    lace = fab('MAT_Sneaker_Lace', '#f4f4f6', None, 0.8)
    return [p for sx in (1, -1) for p in _shoe_common(sx, up, so, lace_m=lace, lip=ac, panel='swoosh', panel_m=ac, heel=ac)]

def S_canvas():
    up, so = fab('MAT_Canvas', '#2c2c3a', 'canvas', 0.85), fab('MAT_Canvas_Sole', '#f4f1ea', 'tread', 0.85)
    lace = fab('MAT_Canvas_Lace', '#f4f1ea', None, 0.8)
    stripe = fab('MAT_Canvas_Stripe', '#c8323f', None, 0.7)
    return [p for sx in (1, -1) for p in _shoe_common(sx, up, so, sole_h=0.024, lace_m=lace, lip=stripe, toe=so, laces_n=5)]

def S_boots():
    up, so, t = fab('MAT_Boot', '#8a5a33', 'leather', 0.6), fab('MAT_Boot_Sole', '#3a2615', 'tread', 0.85), fab('MAT_Boot_Trim', '#6b4224', 'leather', 0.6)
    lace = fab('MAT_Boot_Lace', '#d9b98a', None, 0.85)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.026, lace_m=lace, lip=t, tread=so, laces_n=3)
        out += shaft(sx, up, 0.062, 0.15, r0=0.054, r1=0.053, trim=t, cuff_h=0.022)
    return out

def S_hightop():
    up, so, w = fab('MAT_HighTop', '#d93a48', 'canvas', 0.7), fab('MAT_HighTop_Sole', '#f4f1ea', 'tread', 0.85), fab('MAT_HighTop_Patch', '#ffffff', None, 0.6)
    lace = fab('MAT_HighTop_Lace', '#ffffff', None, 0.8)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.024, lace_m=lace, lip=fab('MAT_HighTop_Line', '#1d2440', None, 0.6), toe=so, laces_n=4)
        out += shaft(sx, up, 0.06, 0.13, r0=0.053, r1=0.052, trim=w)
        out.append(disc('patch', (0.066 * sx + 0.054 * sx, 0.0, 0.1), (sx, 0, 0), 0.014, 0.003, w, G_LEG_L if sx > 0 else G_LEG_R))
    return out

def S_glow():
    up, glow, pink = fab('MAT_Glow', '#1d2440', 'mesh', 0.5), fab('MAT_Glow_Sole', '#36e2ff', None, 0.3, emission='#36e2ff'), fab('MAT_Glow_Stripe', '#ff5ccf', None, 0.4, emission='#a8317f')
    lace = fab('MAT_Glow_Lace', '#ff5ccf', None, 0.6, emission='#3a0a2a')
    return [p for sx in (1, -1) for p in _shoe_common(sx, up, glow, sole_h=0.024, lace_m=lace, lip=pink, panel='stripes', panel_m=pink, heel=pink)]

def S_chunky():     # Streetwear: สนีกเกอร์พื้นหนา แผงหลายชั้น
    up, so = fab('MAT_Chunky', '#eceff4', 'leather', 0.6, nstr=0.25), fab('MAT_Chunky_Sole', '#f6f1e7', 'tread', 0.8)
    p1, p2 = fab('MAT_Chunky_P1', '#9aa6bf', 'mesh', 0.6), fab('MAT_Chunky_P2', '#ff5a36', None, 0.6)
    lace = fab('MAT_Chunky_Lace', '#ffffff', None, 0.8)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.036, lace_m=lace, lip=p1, scale=1.06, panel='swoosh', panel_m=p2, heel=p2)
        out.append(ellipsoid('overlay', (0.066 * sx, -0.07, 0.052), (0.05, 0.03, 0.02), p1, G_LEG_L if sx > 0 else G_LEG_R, seg=18, rings=8))
    return out

def S_loafer():     # Smart: โลฟเฟอร์หนัง สายคาดหน้า
    up, so = fab('MAT_Loafer', '#5a3220', 'leather', 0.4), fab('MAT_Loafer_Sole', '#2b1a10', 'leather', 0.6)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.016, low=True, lip=fab('MAT_Loafer_Welt', '#3e2416', None, 0.5))
        c = Vector((0.066 * sx, -0.05, 0.058))
        out.append(flat_patch('penny', outline_rect(0.05, 0.012, 0.003), 0.004, c, Vector((0, -0.35, 1)), up, G_LEG_L if sx > 0 else G_LEG_R))
        out.append(polyline('moc_st', [Vector((0.066 * sx + 0.032 * math.cos(a), -0.075 + 0.03 * math.sin(a), 0.05)) for a in [math.pi * i / 8 for i in range(9)]], 0.0012, ST('#c9a079'), G_LEG_L if sx > 0 else G_LEG_R))
    return out

def S_runner():     # Sport: รองเท้าวิ่ง ผ้าตาข่าย พื้นโฟมหนา โลโก้ข้าง
    up, so, ac = fab('MAT_Runner', '#ff4f5e', 'mesh', 0.6), fab('MAT_Runner_Sole', '#ffffff', 'tread', 0.7), fab('MAT_Runner_Accent', '#1d2440', None, 0.5)
    lace = fab('MAT_Runner_Lace', '#ffffff', None, 0.8)
    return [p for sx in (1, -1) for p in _shoe_common(sx, up, so, sole_h=0.03, lace_m=lace, lip=ac, panel='swoosh', panel_m=ac, heel=ac)]

def S_slipon():     # Minimal: สลิปออนสีขาว ยางยืดข้าง
    up, so = fab('MAT_SlipOn', '#f4f4f0', 'canvas', 0.8), fab('MAT_SlipOn_Sole', '#e8e4da', 'tread', 0.85)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.02, low=True, lip=fab('MAT_SlipOn_Line', '#cfc8b8', None, 0.8))
        for s2 in (1, -1):
            out.append(flat_patch('gore', [(-0.006, 0.0), (0.006, 0.0), (0.0, 0.02)], 0.003, Vector((0.066 * sx + 0.026 * s2, -0.035, 0.055)), Vector((s2 * 0.5, 0, 1)), so, G_LEG_L if sx > 0 else G_LEG_R))
    return out

def S_court():      # Vintage: รองเท้าคอร์ทเรโทร แถบข้าง เจาะรู
    up, so, g = fab('MAT_Court', '#fffaf0', 'leather', 0.5, nstr=0.25), fab('MAT_Court_Sole', '#e9dcc0', 'tread', 0.85), fab('MAT_Court_Stripe', '#2e7d4f', None, 0.5)
    lace = fab('MAT_Court_Lace', '#fffaf0', None, 0.8)
    out = []
    for sx in (1, -1):
        out += _shoe_common(sx, up, so, sole_h=0.022, lace_m=lace, lip=g, panel='stripes', panel_m=g, heel=g)
        for k in range(5):
            out.append(disc('perf', (0.066 * sx + 0.012 * (k - 2) * 0.6, -0.1 + k * 0.003, 0.046), (0, -0.6, 0.8), 0.0018, 0.0012, so, G_LEG_L if sx > 0 else G_LEG_R))
    return out

def S_techboot():   # Cyber: บูทเทค สายรัดหัวเข็มขัด ไฟเรืองแสง
    up, so, strap = fab('MAT_TechBoot', '#1c1f29', 'leather', 0.45), fab('MAT_TechBoot_Sole', '#0d0f15', 'tread', 0.8), fab('MAT_TechBoot_Strap', '#3a4152', 'mesh', 0.6)
    glow = fab('MAT_TechBoot_Glow', '#36e2ff', None, 0.3, emission='#36e2ff')
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.03, lip=glow, tread=so)
        out += shaft(sx, up, 0.066, 0.15, r0=0.055, r1=0.054, trim=strap)
        for z in (0.09, 0.125):
            out.append(ring('boot_strap', (0.066 * sx, 0, z), (0, 0, 1), 0.057, 0.0055, strap, leg, seg=24))
            out.append(box_lo('boot_buckle', (0.066 * sx + 0.056 * sx, -0.01, z), (0.006, 0.014, 0.012), mat_metal('#9aa3b5'), leg, bevel=0.3))
    return out

def S_snow():       # Winter: บูทกันหิมะ ขอบขนนุ่ม พื้นดอกยาง
    up, so, fur = fab('MAT_Snow', '#7a4a2a', 'leather', 0.7), fab('MAT_Snow_Sole', '#2b1a10', 'tread', 0.85), fab('MAT_Snow_Fur', '#f3ecdf', 'fleece', 1.0)
    lace = fab('MAT_Snow_Lace', '#e8455d', None, 0.8)
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.03, lace_m=lace, lip=so, tread=so, laces_n=3, scale=1.04)
        out += shaft(sx, up, 0.07, 0.15, r0=0.056, r1=0.056)
        out.append(ring('fur', (0.066 * sx, 0, 0.152), (0, 0, 1), 0.06, 0.016, fur, leg, seg=24, tseg=8))
    return out

def S_adventure():  # Fantasy: บูทหนังพับขอบ หัวเข็มขัด
    up, so, cuff = fab('MAT_AdvBoot', '#6b4224', 'leather', 0.55), fab('MAT_AdvBoot_Sole', '#3a2615', 'tread', 0.85), fab('MAT_AdvBoot_Cuff', '#8a5a33', 'leather', 0.6)
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.028, lip=so, tread=so)
        out += shaft(sx, up, 0.066, 0.165, r0=0.055, r1=0.058, trim=cuff, cuff_h=0.03)
        out.append(ring('boot_belt', (0.066 * sx, 0, 0.095), (0, 0.1, 1), 0.058, 0.005, cuff, leg, seg=24))
        out.append(box_lo('boot_buckle', (0.066 * sx + 0.058 * sx, -0.012, 0.095), (0.006, 0.016, 0.014), mat_metal('#d9b45a'), leg, bevel=0.3))
    return out

def S_sandal():     # Summer: รองเท้าแตะรัดส้น (เห็นเท้า — ซ่อนถุงเท้าของ Base แล้วใส่เท้าย้อมสีผิว)
    so, st = fab('MAT_Sandal_Sole', '#c99a5b', 'leather', 0.7), fab('MAT_Sandal_Strap', '#6b4224', 'leather', 0.5)
    skin = fab('MAT_Skin_SandalFoot', '#e8b48c', None, 0.55)   # MAT_Skin* = ย้อมตามสีผิวที่ผู้ใช้เลือก
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += sole(sx, so, h=0.014)
        out.append(ellipsoid('foot', (0.066 * sx, -0.026, 0.034), (0.043, 0.07, 0.024), skin, leg, seg=24, rings=12))
        for k in range(5):   # นิ้วเท้า
            out.append(ellipsoid('toe', (0.066 * sx + (k - 2) * 0.0155, -0.094 + abs(k - 2) * 0.004, 0.03), (0.008, 0.011, 0.009), skin, leg, seg=10, rings=6))
        for y, r in ((-0.06, 0.05), (-0.025, 0.05)):
            out.append(ring('strap', (0.066 * sx, y, 0.034), (0, 1, 0), r, 0.005, st, leg, seg=24, flat=0.62))
        out.append(ring('heel_strap', (0.066 * sx, 0.02, 0.05), (0, 0.6, 1), 0.048, 0.005, st, leg, seg=24, flat=0.8))
    return out

def B_snow():       # Winter: กางเกงกันหิมะ บุนวม แผ่นเสริมเข่า สายเอี๊ยม
    m, pad, st = fab('MAT_SnowPants', '#2f3e66', 'quilt', 0.55, nstr=0.35), fab('MAT_SnowPants_Pad', '#22305a', 'leather', 0.5), fab('MAT_SnowPants_Strap', '#e8455d', None, 0.6)
    q = lambda i, j, a: 0.003 * abs(math.sin(i * math.pi / 4.0))
    parts = pants(m, 'long', fit=0.012, waist=pad, cuff=pad, wave=q)
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        parts.append(flat_patch('knee_pad', outline_rect(0.05, 0.05, 0.012), 0.005, Vector((0.064 * sx, -0.068, 0.14)), Vector((0, -1, 0.1)), pad, leg))
    return parts

def B_fisherman():  # Seasonal (สงกรานต์): กางเกงเลไทย ขากว้าง ผ้ามัดเอว
    m, k = fab('MAT_Fisherman', '#3a5ab8', 'weave', 0.8), fab('MAT_Fisherman_Tie', '#2a4290', 'weave', 0.8)
    parts = pants(m, 'ankle', fit=0.012, flare=0.03, waist=k)
    parts.append(ellipsoid('knot', (0.03, -0.1, 0.31), (0.022, 0.012, 0.018), k, ['Hips'], seg=12, rings=8, rigid='Hips'))
    parts.append(capsule('tail', (0.035, -0.105, 0.3), (0.045, -0.11, 0.24), 0.012, 0.006, k, ['Hips'], seg=8, rings=4, rigid='Hips'))
    return parts

def S_holiday():    # Seasonal: บูทเทศกาลสักหลาดแดง ขอบขนขาว พู่
    up, so, fur = fab('MAT_HolidayBoot', '#c8323f', 'fleece', 0.9), fab('MAT_HolidayBoot_Sole', '#5a1f22', 'tread', 0.85), fab('MAT_HolidayBoot_Fur', '#fbf7ee', 'fleece', 1.0)
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.022, lip=so)
        out += shaft(sx, up, 0.066, 0.14, r0=0.055, r1=0.056)
        out.append(ring('fur', (0.066 * sx, 0, 0.142), (0, 0, 1), 0.06, 0.016, fur, leg, seg=20, tseg=8))
        out.append(ellipsoid('pom', (0.066 * sx + 0.05 * sx, -0.03, 0.15), (0.016, 0.016, 0.016), fur, leg, seg=12, rings=8))
    return out
