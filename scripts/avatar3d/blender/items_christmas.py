"""
Christmas 2026 (event christmas-2026) — ชุด Avatar 3D จริง สวมได้ทุกชิ้น (ไม่ใช่ภาพตัวอย่าง)
ออกแบบเองทั้งหมด ไม่ได้ลอกจากเกม/แบรนด์ใด · โทนสีตามธีม: แดงคริสต์มาส #C63D3D · สนเขียว #1F6A4C · ทอง #E6C26A · หิมะ #F7F9FC · น้ำแข็ง #CFE8F7

ชุด 8 แบบ (ทรงต่างกันชัดเจน ไม่ใช่เปลี่ยนสีอย่างเดียว):
  1 Santa Coat            เสื้อคลุมยาวสักหลาดแดง ขอบขนขาวรอบชาย/สาบหน้า/ข้อมือ ปกขน เข็มขัดหนังหัวทอง
  2 Winter Scholar        สเวตเตอร์คอวีลายถักเปีย + ปกเชิ้ตโผล่ + ตราเกล็ดหิมะปักอก (เสื้อ)
  3 Elf Helper Tunic      ทูนิกเขียวสน ชายยาว ปกหยักแหลม กระดิ่งทอง เข็มขัดทอง (เสื้อ)
  4 Snow Prince Coat      เสื้อคลุมยาวฟ้าน้ำแข็ง กระดุมเชือกถักทอง (frogging) 4 แถว ปกขน เข็มกลัดเกล็ดหิมะ
  5 Snow Princess Coat    โค้ตทรง A บานถึงเข่า เอวคอด ผ้าคลุมไหล่ขนนุ่ม โบว์ผูกคอ ลายเกล็ดหิมะที่ชาย
  6 Cozy Traveler Duffle  ดัฟเฟิลโค้ต "มีฮู้ดจริง" (ผืนผ้าซับในลายสก็อต พับลงหลัง) กระดุมไม้ toggle + ห่วงเชือก กระเป๋าปะ
  7 Reindeer Hoodie       ฮู้ดดี้สีน้ำตาล ลายเรนเดียร์ + แถบลายแฟร์ไอส์ล (เสื้อ)
  8 Noel Guardian (ตำนาน) เสื้อคลุมยาวขาว-ทอง คอตั้ง ผ้าคลุมหลังเขียวสน ตราดาวเรืองแสง สายสะพายเฉียง
ของประกอบ: หมวกซานต้า · ที่คาดผมเขากวาง · กิ๊บเกล็ดหิมะ · ผ้าพันคอถักลายต้นสน · ถุงมือขอบขน · บูทขอบขน · ไม้เท้าลูกกวาด (สะพายหลัง)
ทุกชิ้นผ่านด่านตรวจเดียวกับของเดิม (build_avatar3d.py: 11 คลิป · ผิวโผล่ ≤ 2% · ผ้าทะลุ ≤ 5% · แขนไม่เข้าหัว)
"""
import math
import random

from mathutils import Matrix, Vector

from eqdetail import delete_where, disc, displace, edge_trim, fab, flat_patch, outline_rect, polyline, ring, torso_point, tube_open
from eqlib import (G_ARM_L, G_ARM_R, G_HIPS, G_LEG_L, G_LEG_R, G_TORSO, HEAD_C, capsule, ellipsoid, flared, head_surface, prism, shell,
                   star_pts, tube_arc)
from garments import (collar_flaps, fold_collar, hood, mat_metal, neck_band, pants, print_on, shaft, shirt_body, sleeve, sleeves)
from items_wear import _shade, _shoe_common

V = Vector
H = ['Head']
TAU = 2 * math.pi
RED, RED_D, FUR, PINE, GOLD, ICE, NIGHT = '#c63d3d', '#8e2430', '#fbf7ee', '#1f6a4c', '#e6c26a', '#cfe8f7', '#10213a'


def _fur(name='MAT_XM26_Fur'):
    return fab(name, FUR, 'fleece', 1.0)


def _gold(name='MAT_XM26_Gold'):
    return fab(name, GOLD, None, 0.32, metal=0.6)


def _flake(m, x, z, r=0.018, off=0.03, back=False):
    """เกล็ดหิมะ 6 แฉก (ดาว 6 แฉก + วงกลางเล็ก) พิมพ์บนผิวเสื้อ"""
    return [print_on(star_pts(r, r * 0.28, 6), m, x=x, z=z, off=off, depth=0.0024, back=back),
            print_on([(math.cos(TAU * i / 12) * r * 0.3, math.sin(TAU * i / 12) * r * 0.3) for i in range(12)], m, x=x, z=z, off=off + 0.0025, depth=0.002, back=back)]


def _belt(z, r, belt_m, buckle_m, off=0.036):
    out = [tube_arc('belt', (0, 0, z), r, 0.013, 0, TAU, belt_m, ['Hips', 'Spine'], plane='XY', seg=44, tseg=6, scale=(1, 0.77, 1))]
    p, n = torso_point(0.0, z, off=off)
    out.append(flat_patch('buckle', outline_rect(0.036, 0.03, 0.005), 0.005, p, n, buckle_m, ['Spine'], rigid='Spine'))
    out.append(flat_patch('buckle_in', outline_rect(0.02, 0.014, 0.003), 0.0055, p + n * 0.001, n, belt_m, ['Spine'], rigid='Spine'))
    return out


# =====================================================================
# 1) Santa Coat — outerwear
# =====================================================================
def O_xm_santa():
    m = fab('MAT_XM26_Santa', RED, 'fleece', 0.85)
    fur, belt, gold = _fur(), fab('MAT_XM26_Santa_Belt', '#2a1a14', 'leather', 0.5), _gold()
    parts = shirt_body(m, off=0.026, neck='open', open_front=0.022, length=0.12, hem=0.215, trim=fur, trim_r=0.013)
    parts += sleeves(m, 'long', off=0.022, cuff=fur)
    parts += fold_collar(fur, 'jacket', off=0.024)
    parts += _belt(0.285, 0.184, belt, gold, off=0.056)
    for z in (0.38, 0.45):   # กระดุมทองเหนือเข็มขัด
        p, n = torso_point(0.034, z, off=0.05)
        parts.append(disc('btn', p, n, 0.0075, 0.003, gold, ['Chest'], rigid='Chest'))
    return parts


# =====================================================================
# 2) Winter Scholar — top
# =====================================================================
def T_xm_scholar():
    m, rib = fab('MAT_XM26_Scholar', '#ece2cc', 'knit', 0.95), fab('MAT_XM26_Scholar_Rib', PINE, 'rib', 0.95)
    shirt = fab('MAT_XM26_Scholar_Shirt', '#fbfaf6', 'weave', 0.75)
    crest = fab('MAT_XM26_Scholar_Crest', NIGHT, 'weave', 0.7)
    parts = shirt_body(m, off=0.006, neck='v', trim=rib, vdepth=0.45, trim_r=0.007, hem_trim=False)
    parts += sleeves(m, 'long', off=0.004, cuff=rib)
    parts.append(tube_open('hem_rib', [(0, 0, 0.226), (0, 0, 0.262)], [0.15, 0.149], rib, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    parts.append(tube_arc('hem_stripe', (0, 0, 0.268), 0.1505, 0.0045, 0, TAU, fab('MAT_XM26_Scholar_Stripe', RED, 'rib', 0.9), ['Hips', 'Spine'], plane='XY', seg=40, tseg=5, scale=(1, 0.76, 1)))
    parts += collar_flaps(shirt, off=0.012, z=0.53, spread=24, size=0.9)   # ปกเชิ้ตโผล่จากคอวี
    for x in (-0.05, 0.05):   # ลายถักเปียข้างอก
        pts = [torso_point(x + 0.007 * math.sin(i * math.pi / 2), 0.27 + i * 0.012, off=0.026)[0] for i in range(14)]
        parts.append(polyline('cable', pts, 0.0045, fab('MAT_XM26_Scholar_Cable', '#d8cbb0', 'knit', 0.95), G_TORSO, tseg=5))
    # ตราปักอกซ้าย: โล่ + เกล็ดหิมะทอง
    p, n = torso_point(-0.075, 0.43, off=0.03)
    parts.append(flat_patch('crest', [(-0.018, 0.02), (0.018, 0.02), (0.018, -0.004), (0.0, -0.022), (-0.018, -0.004)], 0.003, p, n, crest, ['Chest'], rigid='Chest'))
    parts.append(flat_patch('crest_flake', star_pts(0.012, 0.0035, 6), 0.0035, p + n * 0.0015, n, _gold(), ['Chest'], rigid='Chest'))
    return parts


# =====================================================================
# 3) Elf Helper Tunic — top
# =====================================================================
def T_xm_elf():
    m, t = fab('MAT_XM26_Elf', '#2f8a5b', 'weave', 0.9), fab('MAT_XM26_Elf_Trim', RED, 'fleece', 0.9)
    belt, gold = fab('MAT_XM26_Elf_Belt', '#3a2418', 'leather', 0.5), _gold()
    parts = shirt_body(m, off=0.008, neck='crew', trim=t, length=0.17, trim_r=0.008, neck_r=0.064)
    parts += sleeves(m, 'long', off=0.006, cuff=t)
    # ปกหยักแหลม 9 แฉก (สีแดง) วางรอบคอด้านหน้า + กระดิ่งทองที่ปลายแฉกกลาง
    for i in range(9):
        x = -0.088 + i * 0.022
        z = 0.5 - 0.022 * (1 - (x / 0.09) ** 2)
        p, n = torso_point(x, z, off=0.034)
        parts.append(flat_patch('elf_collar', [(-0.013, 0.012), (0.013, 0.012), (0.0, -0.026)], 0.003, p, n, t, ['Chest'], rigid='Chest'))
        if i in (2, 4, 6):
            parts.append(ellipsoid('bell', p + n * 0.006 + V((0, 0, -0.03)), (0.0075, 0.0075, 0.0075), gold, ['Chest'], seg=10, rings=6, rigid='Chest'))
    # ชายหยัก: สามเหลี่ยมเย็บต่อรอบชายด้านหน้า
    for i in range(7):
        x = -0.105 + i * 0.035
        p, n = torso_point(x, 0.185, off=0.024)
        parts.append(flat_patch('elf_hem', [(-0.017, 0.012), (0.017, 0.012), (0.0, -0.024)], 0.003, p, n, t, ['Hips', 'Spine']))
    parts += _belt(0.29, 0.152, belt, gold, off=0.03)
    return parts


# =====================================================================
# 4) Snow Prince Coat — outerwear
# =====================================================================
def O_xm_prince():
    m = fab('MAT_XM26_Prince', '#9ccbe8', 'twill', 0.75)
    trim, fur, gold = fab('MAT_XM26_Prince_Trim', '#2c4f7c', 'twill', 0.7), _fur('MAT_XM26_Prince_Fur'), _gold('MAT_XM26_Prince_Gold')
    parts = shirt_body(m, off=0.024, neck='open', open_front=0.02, length=0.13, hem=0.215, trim=trim, trim_r=0.0065)
    parts += sleeves(m, 'long', off=0.02, cuff=trim)
    parts += fold_collar(fur, 'jacket', off=0.024)
    for i in range(4):   # frogging: เชือกถักทองขวางอก + ห่วงปลาย + กระดุมเม็ดยาว
        z = 0.31 + i * 0.055
        w = 0.06 - i * 0.004
        for sx in (1, -1):
            a, _ = torso_point(0.024 * sx, z, off=0.046)
            b, _ = torso_point(w * sx, z + 0.006, off=0.046)
            c, _ = torso_point((w + 0.012) * sx, z - 0.004, off=0.046)
            parts.append(polyline('frog', [a, b, c], 0.0024, gold, ['Chest'] if z > 0.4 else ['Spine'], rigid='Chest' if z > 0.4 else 'Spine'))
        p, n = torso_point(0.0, z, off=0.05)
        parts.append(capsule('toggle', p + V((-0.012, 0, 0)), p + V((0.012, 0, 0)), 0.0042, 0.0042, gold, ['Chest'] if z > 0.4 else ['Spine'], seg=8, rings=4, rigid='Chest' if z > 0.4 else 'Spine'))
    for sx in (1, -1):   # แถบทองรอบข้อมือ
        d = V((0.25 * sx, 0, -0.97))
        parts.append(ring('cuff_gold', V((0.135 * sx, 0, 0.525)) + d * 0.255, d, 0.075, 0.0032, gold, G_ARM_L if sx > 0 else G_ARM_R, seg=22))
    p, n = torso_point(-0.08, 0.47, off=0.048)
    parts.append(flat_patch('brooch', star_pts(0.016, 0.005, 6), 0.004, p, n, fab('MAT_XM26_Prince_Ice', '#e8f6ff', None, 0.15, emission='#6aa8d8'), ['Chest'], rigid='Chest'))
    return parts


# =====================================================================
# 5) Snow Princess Coat — outerwear (ทรง A บานถึงเข่า)
# =====================================================================
def O_xm_princess():
    m = fab('MAT_XM26_Princess', '#d3e9f7', 'twill', 0.8)
    fur, ribbon = _fur('MAT_XM26_Princess_Fur'), fab('MAT_XM26_Princess_Ribbon', '#4f8fc8', 'poly', 0.35)
    flake = fab('MAT_XM26_Princess_Flake', '#ffffff', None, 0.35)
    # โค้ตยาวปิดหน้า แล้ว "บานออก" ต่ำกว่าเอว (ทรง A) ด้วยการดันผิวผ้าออกตามรัศมี — ผืนเดียวกับลำตัว ไม่มีรอยต่อ/ช่องโหว่
    FL, ZW = 0.05, 0.3
    def flare_k(z):
        return FL * max(0.0, (ZW - z) / (ZW - 0.12)) ** 1.3
    parts = shirt_body(m, off=0.02, neck='crew', length=0.12, trim=ribbon, trim_r=0.006, neck_r=0.07, hem_trim=False)
    body = parts[0]
    def push(q):
        if q.z >= ZW:
            return V((0, 0, 0))
        d = V((q.x, q.y / 0.76, 0)).normalized()
        k = flare_k(q.z)
        return V((d.x * k, d.y * 0.76 * k, 0))
    displace(body, push)
    parts += edge_trim('princess_hem', body, lambda q: q.z < 0.126, 0.012, fur, ['Hips', 'Spine'], tseg=6)
    parts += sleeves(m, 'long', off=0.018, cuff=fur)
    parts.append(tube_arc('waist', (0, 0, 0.305), 0.176, 0.009, 0, TAU, ribbon, ['Hips', 'Spine'], plane='XY', seg=44, tseg=6, scale=(1, 0.77, 1)))
    parts += fold_collar(fur, 'jacket', off=0.03, name='capelet')
    p, n = torso_point(0.0, 0.5, off=0.046)
    for sx in (1, -1):
        parts.append(flat_patch('bow', [(0, 0), (0.026 * sx, 0.014), (0.026 * sx, -0.014)], 0.004, p, n, ribbon, ['Chest'], rigid='Chest'))
        parts.append(flat_patch('bow_tail', [(0.003 * sx, 0), (0.01 * sx, -0.045), (0.018 * sx, -0.04)], 0.003, p + n * 0.001, n, ribbon, ['Chest'], rigid='Chest'))
    parts.append(ellipsoid('bow_knot', p + n * 0.004, (0.007, 0.005, 0.007), ribbon, ['Chest'], seg=8, rings=4, rigid='Chest'))
    for k, x in enumerate((-0.09, 0.0, 0.09)):   # เกล็ดหิมะเรียงรอบชายด้านหน้า (วางบนผิวที่บานแล้ว) · 3 ดวง (งบ polygon ≤ 12k)
        z = 0.175 + 0.014 * (k % 2)
        q, qn = torso_point(x, z, off=0.026)
        q = q + V((qn.x, qn.y, 0)).normalized() * flare_k(z) * 0.95
        parts.append(flat_patch('skirt_flake', star_pts(0.017, 0.005, 6), 0.0025, q, qn, flake, ['Hips', 'Spine']))
    return parts


# =====================================================================
# 6) Cozy Traveler Duffle (ฮู้ดจริง) — outerwear
# =====================================================================
def O_xm_traveler():
    m = fab('MAT_XM26_Duffle', '#b0763f', 'fleece', 0.92)
    lining = fab('MAT_XM26_Duffle_Tartan', '#a8333a', 'weave', 0.85)
    rope, wood = fab('MAT_XM26_Duffle_Rope', '#efe4cc', 'weave', 0.8), fab('MAT_XM26_Duffle_Wood', '#5a3a22', None, 0.55)
    parts = shirt_body(m, off=0.028, neck='crew', open_front=0.012, length=0.16, hem=0.215, trim=fab('MAT_XM26_Duffle_Trim', _shade('#b0763f', 0.82), 'fleece', 0.92), trim_r=0.007, neck_r=0.07, neck_trim=None)
    parts += sleeves(m, 'long', off=0.028, cuff=fab('MAT_XM26_Duffle_Cuff', _shade('#b0763f', 0.82), 'fleece', 0.92))
    # ฮู้ดจริง: ผ้าซับในลายสก็อตตั้งขึ้นจากตะเข็บคอ ขอบเปิดหน้า แล้วพับลงหลังเป็นถุงฮู้ด (ไม่มีเชือก — ดัฟเฟิลแท้)
    parts += hood(m, lining, strings=False, lining=lining, off=0.03, depth=0.9, rise=0.032, puff=0.02, front=0.012)
    for i in range(3):   # กระดุมไม้ toggle + ห่วงเชือก
        z = 0.33 + i * 0.075
        bones, rig = (['Chest'], 'Chest') if z > 0.4 else (['Spine'], 'Spine')
        p, n = torso_point(0.032, z, off=0.056)
        parts.append(capsule('toggle', p + V((-0.004, -0.001, 0.012)), p + V((0.004, -0.001, -0.012)), 0.0058, 0.0058, wood, bones, seg=8, rings=4, rigid=rig))
        a, _ = torso_point(-0.03, z + 0.004, off=0.054)
        b, _ = torso_point(0.04, z + 0.004, off=0.056)
        parts.append(polyline('rope', [a, a.lerp(b, 0.5) + V((0, -0.004, 0.003)), b], 0.0022, rope, bones, rigid=rig))
        q, qn = torso_point(-0.034, z + 0.004, off=0.055)
        parts.append(flat_patch('rope_tab', outline_rect(0.016, 0.014, 0.003), 0.003, q, qn, fab('MAT_XM26_Duffle_Leather', '#3a2618', 'leather', 0.5), bones, rigid=rig))
    for sx in (1, -1):   # กระเป๋าปะ
        hp, hn = torso_point(0.09 * sx, 0.23, off=0.05)
        parts.append(flat_patch('patch_pocket', outline_rect(0.058, 0.06, 0.006), 0.005, hp, hn, fab('MAT_XM26_Duffle_Pocket', _shade('#b0763f', 0.92), 'fleece', 0.92), ['Hips', 'Spine']))
    return parts


# =====================================================================
# 7) Reindeer Hoodie — top
# =====================================================================
def T_xm_reindeer():
    from garments import hood as _hood
    main, trim = '#7a4f33', '#5e3a24'
    m, t = fab('MAT_XM26_Reindeer', main, 'fleece', 0.92), fab('MAT_XM26_Reindeer_Rib', trim, 'rib', 0.9)
    cream, red = fab('MAT_XM26_Reindeer_Cream', '#f3e6cf', 'knit', 0.95), fab('MAT_XM26_Reindeer_Nose', '#d8343c', None, 0.35)
    s = fab('MAT_XM26_Reindeer_String', '#f3e6cf', None, 0.7)
    parts = shirt_body(m, off=0.004, hem=0.236, neck='crew', trim=t, hem_trim=False) + sleeves(m, 'long', off=0.004, cuff=t)
    parts.append(tube_open('hem_rib', [(0, 0, 0.234), (0, 0, 0.262)], [0.1475, 0.1465], t, ['Hips', 'Spine'], seg=40, cap_start=False, flat=0.76, loop=0.008, thick=0.005))
    parts += _hood(m, s, lining=cream, depth=0.62, rise=0.03, puff=0.016, string_z=0.37, string_r=0.0045, front=0.012, string_off=0.012)
    # แถบแฟร์ไอส์ลครีมรอบอก + จุดลายถัก
    parts.append(tube_arc('fairisle', (0, 0, 0.47), 0.15, 0.011, 0, TAU, cream, G_TORSO, plane='XY', seg=36, tseg=5, scale=(1, 0.76, 1)))
    for x in (-0.09, -0.054, -0.018, 0.018, 0.054, 0.09):   # จุดลายถักสีแดงบนแถบ (ด้านหน้า · พิมพ์บนผิว — เบากว่าทรงกลม)
        parts.append(print_on([(math.cos(TAU * k / 8) * 0.0045, math.sin(TAU * k / 8) * 0.0045) for k in range(8)], red, x=x, z=0.47, off=0.028, depth=0.002))
    # หน้าเรนเดียร์ (หัวครีม + จมูกแดง + เขากวางเส้น) กลางอก
    p, n = torso_point(0.0, 0.395, off=0.03)
    parts.append(flat_patch('deer_face', [(math.cos(TAU * i / 20) * 0.03, math.sin(TAU * i / 20) * 0.036 - 0.004) for i in range(20)], 0.003, p, n, cream, ['Chest', 'Spine']))
    parts.append(ellipsoid('deer_nose', p + n * 0.006 + V((0, 0, -0.022)), (0.009, 0.006, 0.008), red, ['Chest', 'Spine'], seg=8, rings=4))
    for sx in (1, -1):
        base = p + n * 0.004 + V((0.02 * sx, 0, 0.026))
        pts = [base, base + V((0.012 * sx, 0, 0.022)), base + V((0.02 * sx, 0, 0.04))]
        parts.append(polyline('antler', pts, 0.0035, cream, ['Chest']))
        parts.append(polyline('antler_tine', [pts[1], pts[1] + V((-0.006 * sx, 0, 0.016))], 0.003, cream, ['Chest']))
    # กระเป๋าหน้าท้องแบบแผ่นผ้าปะ (เบากว่ากระเป๋าจิงโจ้ 3 มิติ — งบ polygon ≤ 12k) + ขอบผ้าริบ
    pp, pn = torso_point(0.0, 0.29, off=0.016)
    parts.append(flat_patch('pocket', [(-0.075, -0.035), (0.075, -0.035), (0.055, 0.035), (-0.055, 0.035)], 0.004, pp, pn, fab('MAT_XM26_Reindeer_Pocket', _shade(main, 0.9), 'fleece', 0.92), ['Hips', 'Spine']))
    return parts


# =====================================================================
# 8) Noel Guardian (Legendary) — outerwear
# =====================================================================
def O_xm_noel():
    m = fab('MAT_XM26_Noel', '#f6f3ea', 'twill', 0.7)
    gold, pine = _gold('MAT_XM26_Noel_Gold'), fab('MAT_XM26_Noel_Pine', PINE, 'fleece', 0.8)
    star = fab('MAT_XM26_Noel_Star', '#ffe7a3', None, 0.25, metal=0.3, emission='#8a6a10')
    parts = shirt_body(m, off=0.026, neck='open', open_front=0.02, length=0.11, hem=0.215, trim=gold, trim_r=0.0075)
    parts += sleeves(m, 'long', off=0.022, cuff=gold)
    parts += neck_band(gold, off=0.028, neck_r=0.072, h=0.034, lean=0.004, gap=0.02, name='high_collar')
    # สายสะพายเฉียงสีเขียวสน
    a, _ = torso_point(0.11, 0.52, off=0.05)
    mid, _ = torso_point(0.0, 0.4, off=0.054)
    b, _ = torso_point(-0.12, 0.27, off=0.05)
    parts.append(polyline('sash', [a, mid, b], 0.012, pine, G_TORSO, tseg=6))
    p, n = torso_point(-0.07, 0.45, off=0.054)
    parts.append(flat_patch('emblem', star_pts(0.026, 0.011, 8), 0.005, p, n, star, ['Chest'], rigid='Chest'))
    parts.append(flat_patch('emblem_ring', [(math.cos(TAU * i / 24) * 0.03, math.sin(TAU * i / 24) * 0.03) for i in range(24)], 0.003, p - n * 0.0015, n, gold, ['Chest'], rigid='Chest'))
    # ผ้าคลุมหลังสีเขียวสน (ผืนเดียวจากไหล่ลงถึงน่อง) — แบบเดียวกับผ้าคลุม K_cape ที่ผ่านด่านแล้ว
    cape = shell('noel_cape', (0, 0.0, 0.38), (0.225, 0.205, 0.28), lambda d: d.y > 0.32 and d.z < 0.78, pine, ['Chest', 'Spine', 'Hips'], seg=48, rings=32, thick=0.008)
    cape['eq_loose'] = True
    delete_where(cape, lambda q: q.z > 0.6 and abs(q.x) < 0.07 and q.y < 0.08)
    for v in cape.data.vertices:
        k = 1 + max(0.0, 0.42 - v.co.z) * 0.55
        v.co.x *= k
        v.co.y = v.co.y * (1 + max(0.0, 0.42 - v.co.z) * 0.6) + 0.035
        v.co.y += 0.004 * math.sin(v.co.x * 60) * max(0.0, 0.45 - v.co.z) * 4
    parts.append(cape)
    for sx in (1, -1):   # หมุดทองยึดผ้าคลุมที่ไหล่
        parts.append(ellipsoid('cape_pin', (0.1 * sx, -0.03, 0.535), (0.013, 0.008, 0.013), gold, ['Chest'], seg=12, rings=6, rigid='Chest'))
    return parts


# =====================================================================
# 9) Tartan Wool Trousers — bottom (กางเกงขายาวผ้าวูลลายสก็อตแดง-เขียว เส้นทอง · ใส่คู่ได้ทุกชุดคริสต์มาส)
# =====================================================================
def B_xm_tartan():
    m = fab('MAT_XM26_Tartan', '#a8333a', 'twill', 0.85)
    w = fab('MAT_XM26_Tartan_Waist', '#3a2418', 'leather', 0.55)
    green, gold = fab('MAT_XM26_Tartan_Green', '#1f5a40', 'twill', 0.85), fab('MAT_XM26_Tartan_Gold', '#e6c26a', None, 0.6)
    parts = pants(m, 'long', fit=0.004, waist=w, cuff=fab('MAT_XM26_Tartan_Cuff', '#7a1f27', 'twill', 0.85))
    for ob in parts:
        if not ob.data.materials or ob.data.materials[0] != m:
            continue
        ob.data.materials.append(green); ob.data.materials.append(gold)
        for p in ob.data.polygons:   # ลายสก็อต: แถบนอนตามความสูง + แถบตั้งตามมุมรอบขา + เส้นทองบาง
            c = p.center
            lx = c.x - (0.066 if c.x > 0 else -0.066)
            ang = math.atan2(c.y, lx)
            hz = ((c.z - 0.05) % 0.05)
            if abs(hz - 0.025) < 0.0035:
                p.material_index = 2
            elif hz < 0.016 or int((ang + math.pi) / (math.pi / 6)) % 3 == 0:
                p.material_index = 1
    return parts


# =====================================================================
# ของประกอบ
# =====================================================================
def C_xm_santa():
    """หมวกซานต้า: ตัวหมวกครอบศีรษะ (มีระนาบตัดผม) + กรวยปลายพับตกไปด้านข้าง-หลัง + ขอบขนหนา + ปอมปอม"""
    m, fur = fab('MAT_XM26_SantaHat', RED, 'fleece', 0.85), _fur('MAT_XM26_SantaHat_Fur')
    dome = shell('dome', HEAD_C + V((0, 0.01, 0.035)), V((0.205, 0.185, 0.198)) * V((1.12, 1.11, 1.1)), lambda d: d.z > 0.2, m, H, seg=40, rings=22, rigid='Head', thick=0.014)
    cone = flared('cone', 0.99, 0.15, 1.24, 0.014, m, H, seg=36, flat=0.95, cy=0.012, rigid='Head')
    bend = lambda q: (lambda t: V((2.1 * t * t, 0.7 * t * t, -1.9 * t * t)))(max(0.0, q.z - 1.0))
    displace(cone, bend)
    tip = V((0, 0.012, 1.24)) + bend(V((0, 0, 1.24)))
    pom = ellipsoid('pom', tip + V((0.004, 0.0, -0.01)), (0.04, 0.04, 0.036), fur, H, seg=16, rings=10, rigid='Head')
    rnd = random.Random(25)
    displace(pom, lambda q: (q - tip).normalized() * rnd.uniform(-0.003, 0.004))
    band = tube_arc('fur_band', (0, 0.01, 0.875), 0.228, 0.03, 0, TAU, fur, H, plane='XY', seg=44, tseg=10, rigid='Head', scale=(1, 0.93, 1))
    displace(band, lambda q: V((0, 0, 0.0025 * math.sin(q.x * 90) * math.cos(q.y * 70))))
    return [dome, cone, band, pom]


def C_xm_antlers():
    """ที่คาดผมเขากวาง: ก้านคาดบาง (ไม่ครอบศีรษะ → ไม่ตัดผม) + เขากวางแตกกิ่ง + หูกวางนุ่ม + กระดิ่งเล็ก"""
    band = fab('MAT_XM26_Antler_Band', RED_D, 'fleece', 0.7)
    horn, ear, inner = fab('MAT_XM26_Antler', '#8a5a35', None, 0.65), fab('MAT_XM26_Antler_Ear', '#a8754d', 'fleece', 0.9), fab('MAT_XM26_Antler_EarIn', '#f2c9b5', 'fleece', 0.9)
    parts = [tube_arc('band', (0, 0.0, 0.805), 0.232, 0.009, math.radians(18), math.radians(162), band, H, plane='XZ', seg=30, tseg=8, rigid='Head')]
    for sx in (1, -1):
        base = V((0.1 * sx, 0.0, 1.005))
        main = [base, base + V((0.03 * sx, 0, 0.05)), base + V((0.045 * sx, 0.0, 0.1)), base + V((0.04 * sx, 0.0, 0.14))]
        parts.append(polyline('antler', main, 0.0085, horn, H, rigid='Head', tseg=7))
        for k, (dx, dz) in ((1, (-0.025, 0.04)), (2, (0.03, 0.035))):
            tine = [main[k], main[k] + V((dx * sx, 0, dz * 0.6)), main[k] + V((dx * sx * 1.3, 0, dz))]
            parts.append(polyline('tine', tine, 0.006, horn, H, rigid='Head', tseg=6))
        for q in (main[-1], main[1] + V((-0.025 * 1.3 * sx, 0, 0.04)), main[2] + V((0.039 * sx, 0, 0.035))):
            parts.append(ellipsoid('tip', q, (0.007, 0.007, 0.007), horn, H, seg=8, rings=5, rigid='Head'))
        e = ellipsoid('deer_ear', (0.17 * sx, 0.01, 0.97), (0.035, 0.012, 0.022), ear, H, seg=14, rings=8, rigid='Head', rot=Matrix.Rotation(math.radians(-30 * sx), 3, 'Y'))
        parts.append(e)
        parts.append(ellipsoid('deer_ear_in', (0.17 * sx, 0.0, 0.97), (0.024, 0.006, 0.013), inner, H, seg=12, rings=6, rigid='Head', rot=Matrix.Rotation(math.radians(-30 * sx), 3, 'Y')))
    parts.append(ellipsoid('jingle', (0.12, -0.012, 0.99), (0.011, 0.011, 0.011), _gold('MAT_XM26_Antler_Bell'), H, seg=10, rings=6, rigid='Head'))
    return parts


def C_xm_snowclip():
    """กิ๊บเกล็ดหิมะติดผมด้านข้าง (ไม่ครอบศีรษะ) — เกล็ดน้ำแข็งเรืองแสงอ่อน + กิ๊บเงิน"""
    ice = fab('MAT_XM26_Clip_Ice', '#9fd4f5', None, 0.12, emission='#3d86c0')
    silver = mat_metal('#dfe6ef')
    p, n = head_surface(0.15, 0.94, out=0.04)
    parts = [flat_patch('snowflake', star_pts(0.05, 0.013, 6), 0.009, p, n, ice, H, rigid='Head'),
             flat_patch('snowflake_core', [(math.cos(TAU * i / 12) * 0.01, math.sin(TAU * i / 12) * 0.01) for i in range(12)], 0.008, p + n * 0.001, n, silver, H, rigid='Head')]
    for i in range(6):   # กิ่งเล็กของแฉก
        a = TAU * i / 6 + math.pi / 2
        c = p + n * 0.004
        t1 = V((math.cos(a), 0, math.sin(a)))
        parts.append(ellipsoid('flake_gem', c + t1 * 0.036 + V((0, -0.002, 0)), (0.0055, 0.0055, 0.0055), ice, H, seg=8, rings=4, rigid='Head'))
    q, qn = head_surface(0.12, 0.9, out=0.03)
    parts.append(capsule('clip', q, q + V((0.03, 0.006, 0.03)), 0.0035, 0.0035, silver, H, seg=8, rings=4, rigid='Head'))
    return parts


def A_xm_scarf():
    """ผ้าพันคอถักสีเขียวสน ลายต้นสนครีม + แถบแดง ชายยาวสองชาย"""
    from eqdetail import box_lo
    from eqlib import rbox
    from garments import RY
    m, cream, red = fab('MAT_XM26_Scarf', PINE, 'knit', 0.95), fab('MAT_XM26_Scarf_Cream', '#f3ead6', 'knit', 0.95), fab('MAT_XM26_Scarf_Red', RED, 'knit', 0.95)
    parts = [tube_arc('wrap', (0, 0.0, 0.565), 0.074, 0.034, 0, TAU, m, ['Chest', 'Neck'], plane='XY', seg=28, tseg=10),
             rbox('tail', (0.045, -0.132, 0.45), (0.054, 0.018, 0.17), m, ['Chest'], rigid='Chest', rot=RY(8)),
             rbox('tail2', (-0.01, -0.12, 0.49), (0.054, 0.016, 0.1), m, ['Chest'], rigid='Chest', rot=RY(-14))]
    for z in (0.39, 0.405):
        parts.append(box_lo('stripe', (0.034, -0.142, z), (0.056, 0.006, 0.007), red, ['Chest'], rigid='Chest', rot=RY(8)))
    # ลายต้นสนครีม (สามเหลี่ยมซ้อน) บนชายผ้า
    parts.append(prism('tree', [(-0.016, 0), (0.016, 0), (0, 0.026)], 0.003, (0.042, -0.142, 0.44), cream, ['Chest'], rigid='Chest', rot=Matrix.Rotation(math.radians(90), 3, 'X') @ Matrix.Rotation(math.radians(-8), 3, 'Y')))
    parts.append(prism('tree2', [(-0.012, 0), (0.012, 0), (0, 0.02)], 0.003, (0.043, -0.142, 0.458), cream, ['Chest'], rigid='Chest', rot=Matrix.Rotation(math.radians(90), 3, 'X') @ Matrix.Rotation(math.radians(-8), 3, 'Y')))
    for k in range(6):   # ชายครุย
        parts.append(capsule('fringe', (0.026 + k * 0.007, -0.142, 0.366), (0.025 + k * 0.007, -0.143, 0.348), 0.0022, 0.0018, cream, ['Chest'], seg=5, rings=4, rigid='Chest'))
    return parts


def A_xm_gloves():
    """ถุงมือไหมพรมสีแดง ขอบขนขาว + ลายต้นสนบนหลังมือ"""
    m, fur, pine = fab('MAT_XM26_Glove', RED, 'knit', 0.95), _fur('MAT_XM26_Glove_Fur'), fab('MAT_XM26_Glove_Pine', PINE, 'knit', 0.9)
    parts = []
    for sx in (1, -1):
        arm = G_ARM_L if sx > 0 else G_ARM_R
        hand = V((0.192 * sx, -0.004, 0.243))
        mit = ellipsoid('mitten', hand + V((0.0, -0.003, -0.002)), (0.052, 0.05, 0.06), m, arm, seg=24, rings=14)
        delete_where(mit, lambda p: p.z > 0.286)
        parts.append(mit)
        parts.append(capsule('thumb', (0.168 * sx, -0.05, 0.262), (0.16 * sx, -0.062, 0.236), 0.016, 0.015, m, arm, seg=12, rings=6))
        parts.append(tube_open('cuff', [(0.188 * sx, 0, 0.312), (0.19 * sx, 0, 0.278)], [0.048, 0.05], fur, arm, seg=22, cap_start=False, loop=0.006, thick=0.008))
        parts.append(flat_patch('pine', [(-0.013, -0.012), (0.013, -0.012), (0.0, 0.018)], 0.002, hand + V((0.0, -0.053, 0.0)), V((0.1 * sx, -1, 0)), pine, arm))
    return parts


def S_xm_boots():
    """บูทหนังสีน้ำตาลเข้ม ขอบขนพับ หัวเข็มขัดทอง พื้นดอกยาง"""
    up, so = fab('MAT_XM26_Boot', '#4a2a1f', 'leather', 0.5), fab('MAT_XM26_Boot_Sole', '#24140e', 'tread', 0.85)
    fur, gold = _fur('MAT_XM26_Boot_Fur'), _gold('MAT_XM26_Boot_Gold')
    out = []
    for sx in (1, -1):
        leg = G_LEG_L if sx > 0 else G_LEG_R
        out += _shoe_common(sx, up, so, sole_h=0.022, lip=so)
        out += shaft(sx, up, 0.066, 0.14, r0=0.055, r1=0.056)
        out.append(ring('fur', (0.066 * sx, 0, 0.142), (0, 0, 1), 0.06, 0.017, fur, leg, seg=22, tseg=8))
        out.append(ring('strap', (0.066 * sx, 0.001, 0.1), (0, 0, 1), 0.0565, 0.005, fab('MAT_XM26_Boot_Strap', '#2a1810', 'leather', 0.5), leg, seg=22, tseg=5))
        out.append(flat_patch('buckle', outline_rect(0.016, 0.014, 0.003), 0.004, V((0.066 * sx + 0.045 * sx, -0.03, 0.1)), V((0.8 * sx, -0.6, 0)).normalized(), gold, leg))
    return out


def K_xm_candycane():
    """ไม้เท้าลูกกวาด สะพายเฉียงหลัง: ลายเกลียวแดง-ขาว (ปล้องสลับสีเอียง) + หัวงอ + โบว์เขียวสน"""
    from eqlib import tube_path
    red, white, pine = fab('MAT_XM26_Cane_Red', RED, None, 0.3), fab('MAT_XM26_Cane_White', '#fffdf7', None, 0.3), fab('MAT_XM26_Cane_Bow', PINE, 'poly', 0.4)
    B = ['Chest', 'Spine']
    a, b = V((-0.12, 0.15, 0.2)), V((0.1, 0.15, 0.56))
    d = (b - a).normalized()
    parts = []
    N = 16
    for i in range(N):
        p0, p1 = a.lerp(b, i / N), a.lerp(b, (i + 1) / N)
        parts.append(capsule('cane_seg', p0, p1, 0.011, 0.011, red if i % 2 == 0 else white, B, seg=12, rings=3, rigid='Chest', loop=0.0))
    # หัวงอ (ครึ่งวงกลม) ต่อจากปลายบน
    side = V((1, 0, 0)).cross(d).normalized() if abs(d.x) < 0.9 else V((0, 0, 1))
    perp = d.cross(V((0, 1, 0))).normalized()
    hook = []
    for k in range(13):
        t = math.pi * k / 12
        hook.append(b + d * (math.sin(t) * 0.045) + perp * ((1 - math.cos(t)) * 0.045))
    parts.append(tube_path('hook', hook[:7], 0.011, red, B, rigid='Chest', tseg=10))
    parts.append(tube_path('hook2', hook[6:], 0.011, white, B, rigid='Chest', tseg=10))
    m = a.lerp(b, 0.72)
    for sx in (1, -1):
        parts.append(ellipsoid('bow_loop', m + perp * (0.022 * sx) + V((0, 0.012, 0)), (0.02, 0.008, 0.013), pine, B, seg=12, rings=6, rigid='Chest'))
    parts.append(ellipsoid('bow_knot', m + V((0, 0.014, 0)), (0.009, 0.008, 0.009), pine, B, seg=10, rings=6, rigid='Chest'))
    # สายสะพาย (ผ่านอก) — ให้ไม้เท้ามีที่ยึดบนตัวจริง
    s1, _ = torso_point(-0.12, 0.52, off=0.03)
    s2, _ = torso_point(0.0, 0.4, off=0.034)
    s3, _ = torso_point(0.13, 0.28, off=0.03)
    parts.append(polyline('strap', [s1, s2, s3], 0.0055, fab('MAT_XM26_Cane_Strap', '#6b3f22', 'leather', 0.5), G_TORSO, tseg=5))
    return parts
