"""
v1.27.0 World Raid — บอส 3D (ปั้นด้วยโค้ดทั้งหมด · ต้นฉบับ ไม่ใช้โมเดลของผู้อื่น)
  forest    Forest Guardian      — ภูตต้นไม้ยักษ์: เปลือกไม้ร่องลึก มอส เขากิ่งไม้แตกแขนง อักขระเรืองแสงบนอก เห็ดเรืองแสง เถาวัลย์ห้อย
  inferno   Inferno Golem        — โกเลมหินหลอมเหลว: แผ่นหินแยกชิ้นบนแกนลาวา รอยแตกเรืองแสง หมัดหินยักษ์ เขาออบซิเดียน หัวใจลาวาที่อก
  frost     Frost Dragon         — มังกรน้ำแข็ง 4 ขา 2 ปีก: เกล็ดลาย voronoi ปีกโปร่งแสง เขาโค้ง หนามสันหลัง ผลึกน้ำแข็งบนหลัง
  frost-xmas  (ผิวเทศกาล)         — ปีกน้ำแข็งโปร่งแสงลายเกล็ดหิมะ เกล็ดเรืองแสงฟ้า ตาฟ้าเข้ม มงกุฎคริสตัล
  shadow    Shadow Archmage      — จอมเวทลอยตัว ฮู้ดใบหน้ามืด ตาม่วง เสื้อคลุมชายขาดเป็นเงา ไม้เท้ากรงเล็บ+ลูกแก้ว วงอักขระลอย (v1.27.1)
แต่ละตัวมีกระดูกของตัวเอง (รูปร่างต่างกันจริง ไม่ใช่เปลี่ยนสี) + Animation 10 สถานะ:
  spawn · idle · prepare · attack · special · hit · stun · phase · enrage · death
"""
import math
import random
from mathutils import Vector
import raidlib as L

FPS = 24


def _clips(arm, defs):
    """defs: {name: [(frame, pose)]} → actions (ชื่อคลิป = ชื่อสถานะ)"""
    for name, keys in defs.items():
        L.action(arm, name, keys)


# =====================================================================
# FOREST GUARDIAN
# =====================================================================
def build_forest():
    L.reset_scene()
    B = [
        ('root', (0, 0, 0), (0, 0, 0.35), None),
        ('hips', (0, 0, 1.05), (0, 0, 1.5), 'root'),
        ('spine', (0, 0, 1.5), (0, -0.05, 2.0), 'hips'),
        ('chest', (0, -0.05, 2.0), (0, -0.1, 2.55), 'spine'),
        ('neck', (0, -0.12, 2.55), (0, -0.2, 2.8), 'chest'),
        ('head', (0, -0.2, 2.8), (0, -0.28, 3.25), 'neck'),
    ]
    for s, x in (('L', 1), ('R', -1)):
        B += [
            (f'shoulder.{s}', (0.3 * x, -0.08, 2.4), (0.78 * x, -0.05, 2.38), 'chest'),
            (f'upper.{s}', (0.78 * x, -0.05, 2.38), (1.08 * x, -0.12, 1.78), f'shoulder.{s}'),
            (f'lower.{s}', (1.08 * x, -0.12, 1.78), (1.16 * x, -0.32, 1.2), f'upper.{s}'),
            (f'hand.{s}', (1.16 * x, -0.32, 1.2), (1.18 * x, -0.42, 0.82), f'lower.{s}'),
            (f'thigh.{s}', (0.36 * x, 0.02, 1.08), (0.44 * x, 0.0, 0.58), 'hips'),
            (f'shin.{s}', (0.44 * x, 0.0, 0.58), (0.46 * x, -0.06, 0.08), f'thigh.{s}'),
        ]
    arm = L.armature('ARM_Boss', B)

    bark = L.mat('Bark', '#FFFFFF', rough=0.85, vcol=True)
    body = []
    body += [((0, 0, 1.25), 0.62, (1.0, 0.85, 0.9)), ((0, -0.04, 1.75), 0.68, (1.08, 0.86, 0.95)), ((0, -0.08, 2.25), 0.8, (1.25, 0.9, 0.85)),
             ((0, -0.14, 2.62), 0.44, (1, 1, 1)), ((0, -0.24, 2.98), 0.5, (0.95, 1.0, 1.1)), ((0, -0.48, 2.86), 0.26, (1.2, 1, 0.8)),
             ((0, -0.5, 3.14), 0.2, (1.9, 0.9, 0.55)), ((0, 0.05, 3.28), 0.24, (1.3, 1, 0.7))]            # สันคิ้วยื่น + หัวท้าย
    for x in (1, -1):
        body += [((0.62 * x, -0.06, 2.42), 0.46, None)]                                   # ไหล่หนา
        body += L.chain((0.8 * x, -0.06, 2.36), (1.08 * x, -0.12, 1.78), 0.34, 0.28)
        body += L.chain((1.08 * x, -0.12, 1.78), (1.16 * x, -0.32, 1.22), 0.28, 0.3)
        body += [((1.18 * x, -0.4, 1.0), 0.36, (1, 1, 1.15))]                            # มือรากไม้
        body += L.chain((0.36 * x, 0.02, 1.05), (0.44 * x, 0.0, 0.58), 0.34, 0.3)
        body += L.chain((0.44 * x, 0.0, 0.58), (0.46 * x, -0.06, 0.16), 0.3, 0.34)
        body += [((0.48 * x, -0.12, 0.1), 0.36, (1.15, 1.4, 0.45))]                       # เท้าราก
    ob = L.blob('Body', body, resolution=0.06, voxel=0.04, material=bark)
    # ลายเปลือกไม้: ร่องแนวตั้ง (noise ยืดแกน Z) + ปุ่มปม
    EYES = [Vector((0.17 * x, -0.66, 3.0)) for x in (1, -1)]
    def bark_fn(p, n):
        g = L.fbm((p.x * 8, p.y * 8, p.z * 1.2), 4)
        knot = max(0.0, L.fbm((p.x * 2.2 + 9, p.y * 2.2, p.z * 2.2), 2)) ** 2
        sock = sum(max(0.0, 1 - (p - e).length / 0.15) for e in EYES)
        mouthc = max(0.0, 1 - (Vector((p.x * 0.7, p.y, p.z)) - Vector((0, -0.7, 2.8))).length / 0.13)
        return -0.06 * abs(g) ** 0.55 + 0.07 * knot - 0.09 * sock - 0.08 * mouthc
    L.displace(ob, bark_fn)
    ob = L.decimate(ob, 0.42)

    # อักขระเรืองแสงบนอก: เส้นวงกลม + เส้นแนวตั้งด้านหน้าอก (หน้ากาก alpha)
    def runes(p):
        if p.y > -0.3:
            return 0.0
        c = Vector((0, 0, 2.22))
        q = Vector((p.x, 0, p.z))
        d = abs((q - c).length - 0.26)
        d = min(d, abs(p.x) + max(0, abs(p.z - 2.22) - 0.42) if abs(p.x) < 0.04 else 9)
        for a in (0, 120, 240):
            r = math.radians(a + 90)
            e = c + Vector((math.cos(r) * 0.26, 0, math.sin(r) * 0.26))
            d = min(d, (q - e).length - 0.035)
        return 1.0 - L.smooth(0.012, 0.03, d)
    def col(p, n):
        g = L.fbm((p.x * 8, p.y * 8, p.z * 1.2), 4)
        dark, light = L.lin('#1C110A'), L.lin('#74523A')
        c = L.mix(dark, light, L.smooth(-0.35, 0.35, g) * 0.9 + 0.1)
        sock = sum(max(0.0, 1 - (p - e).length / 0.17) for e in EYES)
        c = L.mix(c, L.lin('#0B0704'), min(1, sock * 1.6))
        moss = L.smooth(0.3, 0.6, n.z + 0.5 * L.fbm((p.x * 3, p.y * 3, p.z * 3), 2)) * (1 - min(1, sock * 2))
        c = L.mix(c, L.lin('#4F8F3A'), moss * 0.95)
        glow = runes(p)
        if glow > 0:
            c = L.mix(c, L.lin('#B8FF8A'), glow)
        return (*c, glow)
    L.paint(ob, col)
    L.skin(ob, arm, falloff=0.16)
    parts = [ob]

    # ตาเรืองแสง + เบ้าตาลึก
    eye = L.mat('Eye', '#E6FF9A', rough=0.2, emission='#C6FF4A', strength=10)
    for x in (1, -1):
        e = L.ellipsoid(f'eye{x}', (0.17 * x, -0.6, 3.0), (0.075, 0.03, 0.04), eye, seg=14, rings=8, rot=(0, 0, -14 * x))
        L.skin(e, arm, rigid='head'); parts.append(e)
    glowm = L.mat('MouthGlow', '#9BE86A', rough=0.6, emission='#7CFF4A', strength=3)
    mo = L.ellipsoid('mouthglow', (0, -0.66, 2.8), (0.1, 0.03, 0.022), glowm, seg=12, rings=6)
    L.skin(mo, arm, rigid='head'); parts.append(mo)
    # เคราราก (ห้อยจากคาง)
    root_m = L.mat('RootBeard', '#FFFFFF', rough=0.85, vcol=True)
    rb = random.Random(3)
    for k in range(9):
        x0 = (k - 4) * 0.055
        a = Vector((x0, -0.62 + abs(x0) * 0.4, 2.72))
        pts = L.bezier_pts(a, a + Vector((rb.uniform(-0.05, 0.05), -0.08, -0.25)), a + Vector((rb.uniform(-0.1, 0.1), -0.02, -0.45 - rb.uniform(0, 0.2))), 7)
        t = L.tube(f'beard{k}', pts, [0.03 - 0.004 * i for i in range(7)], root_m, seg=6)
        L.paint(t, lambda p, n: (*L.mix(L.lin('#2E1D12'), L.lin('#6B4A2E'), 0.5 + L.fbm(p * 10, 2)), 0.0))
        L.skin(t, arm, rigid='head'); parts.append(t)

    # เขากิ่งไม้แตกแขนง (สุ่มแบบกำหนด seed — ได้รูปเดิมทุกครั้ง)
    wood = L.mat('Wood', '#FFFFFF', rough=0.8, vcol=True)
    rnd = random.Random(7)
    def branch(base, d, length, r, depth, out):
        tip = Vector(base) + Vector(d).normalized() * length
        mid = Vector(base).lerp(tip, 0.5) + Vector((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, 0.1)))
        t = L.horn(f'br{len(out)}', base, mid, tip, r, wood, n=6, seg=7)
        out.append(t)
        if depth > 0:
            for k in range(2):
                nd = (Vector(d) + Vector((rnd.uniform(-0.7, 0.7), rnd.uniform(-0.5, 0.5), rnd.uniform(0.2, 0.8)))).normalized()
                branch(Vector(base).lerp(tip, rnd.uniform(0.5, 0.85)), nd, length * 0.6, r * 0.55, depth - 1, out)
        return tip
    tips = []
    for x in (1, -1):
        out = []
        branch((0.22 * x, -0.2, 3.25), (0.85 * x, 0.15, 1.0), 1.0, 0.085, 2, out)
        branch((0.12 * x, -0.05, 3.3), (0.3 * x, 0.6, 0.9), 0.65, 0.05, 1, out)
        tips += out
    for t in tips:
        L.paint(t, lambda p, n: (*L.mix(L.lin('#4A3020'), L.lin('#8A6A48'), 0.5 + L.fbm(p * 9, 2)), 0.0))
        L.skin(t, arm, rigid='head')
    parts += tips
    # ใบไม้เป็นพุ่ม + ปลายเรืองแสงเล็กน้อย
    leaf = L.mat('Leaf', '#FFFFFF', rough=0.6, vcol=True)
    for i, t in enumerate(tips[::2]):
        vs = [t.matrix_world @ v.co for v in t.data.vertices]
        top = max(vs, key=lambda v: v.z)
        for j in range(3):
            off = Vector((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), rnd.uniform(-0.04, 0.08)))
            lf = L.rock(f'leaf{i}{j}', top + off, (0.12, 0.12, 0.085), leaf, seed=i * 3 + j, subdiv=2, rough=0.3)
            for pl in lf.data.polygons:
                pl.use_smooth = True
            L.paint(lf, lambda p, n: (*L.mix(L.lin('#1F5E2C'), L.lin('#A6EA62'), 0.35 + 0.55 * n.z + 0.2 * L.fbm(p * 12, 2)), 0.35 if n.z > 0.75 else 0.0))
            L.skin(lf, arm, rigid='head')
            parts.append(lf)

    # เห็ดเรืองแสงบนไหล่/หลัง
    cap = L.mat('Shroom', '#5FE3D0', rough=0.4, emission='#4FF5D8', strength=2.5)
    stem = L.mat('Stem', '#E8E0C8', rough=0.8)
    for i, (x, y, z, s) in enumerate(((0.75, 0.1, 2.75, 1), (0.55, 0.3, 2.6, 0.7), (-0.8, 0.05, 2.7, 0.85), (-0.3, 0.45, 2.2, 0.6), (0.25, 0.48, 1.7, 0.55))):
        st = L.tube(f'stem{i}', [(x, y, z - 0.05), (x, y + 0.02, z + 0.12 * s)], [0.03 * s, 0.025 * s], stem, seg=8)
        cp = L.ellipsoid(f'cap{i}', (x, y + 0.02, z + 0.14 * s), (0.11 * s, 0.11 * s, 0.05 * s), cap, seg=14, rings=8)
        b = 'chest' if z > 2.3 else 'spine'
        L.skin(st, arm, rigid=b); L.skin(cp, arm, rigid=b)
        parts += [st, cp]

    # เถาวัลย์ห้อยจากแขน
    vine = L.mat('Vine', '#3E7A32', rough=0.7)
    for x in (1, -1):
        for k in range(3):
            a = Vector((0.9 * x + 0.05 * k * x, -0.05 - 0.05 * k, 2.2 - 0.2 * k))
            pts = L.bezier_pts(a, a + Vector((0.12 * x, -0.08, -0.4)), a + Vector((0.05 * x, -0.02, -0.75 + 0.1 * k)), 7)
            v = L.tube(f'vine{x}{k}', pts, [0.022 - 0.002 * i for i in range(7)], vine, seg=6)
            L.skin(v, arm, bones=[f'upper.{"L" if x > 0 else "R"}', f'lower.{"L" if x > 0 else "R"}'])
            parts.append(v)

    body_ob = L.join('ForestGuardian', parts)
    _clips(arm, forest_clips(arm))
    return arm, body_ob


def biped_clips(arm, heavy=1.0):
    """คลิป 10 สถานะของบอสสองขา (forest/inferno) — แกนโลก: X+ = โน้มไปหน้า · แขนยกไปหน้า = X- · กางแขน L = Y- / R = Y+"""
    P = lambda r=None, l=None, s=None: L.pose(arm, r or {}, l or {}, s or {})
    arms = lambda fx, sy: {'upper.L': [('X', fx), ('Y', -sy)], 'upper.R': [('X', fx), ('Y', sy)]}
    rest = P({**arms(-6, 6), 'lower.L': [('X', -8)], 'lower.R': [('X', -8)]})
    idle = []
    for f, k in ((1, 0), (18, 1), (36, 0), (54, -1), (72, 0)):
        idle.append((f, P({'chest': [('X', -2.5 * abs(k))], 'head': [('Z', 4 * k), ('X', 2 * abs(k))], 'spine': [('Z', 1.5 * k)],
                           **arms(-6 - 3 * abs(k), 6 + 2 * abs(k)), 'lower.L': [('X', -8)], 'lower.R': [('X', -8)]},
                          {'hips': (0, 0, -0.02 * abs(k) * heavy)})))
    spawn = [
        (1, P({'chest': [('X', 35)], 'head': [('X', 30)], **arms(-20, 10)}, {'root': (0, 0, -3.2)})),
        (26, P({'chest': [('X', 20)], 'head': [('X', 15)], **arms(-30, 20)}, {'root': (0, 0, -0.6)})),
        (38, P({'chest': [('X', -18)], 'head': [('X', -25)], **arms(-60, 55)}, {'root': (0, 0, 0.08)})),
        (50, P({'chest': [('X', -22)], 'head': [('X', -28)], **arms(-70, 60)})),
        (60, rest),
    ]
    prepare = [(1, rest), (12, P({'chest': [('X', -12), ('Z', 14)], 'spine': [('Z', 8)], 'upper.R': [('X', -150), ('Y', 20)], 'lower.R': [('X', -30)],
                                  'upper.L': [('X', -20), ('Y', -25)], 'head': [('X', -8)]}, {'hips': (0, 0.08, -0.08)})),
               (24, P({'chest': [('X', -15), ('Z', 16)], 'spine': [('Z', 9)], 'upper.R': [('X', -160), ('Y', 22)], 'lower.R': [('X', -35)],
                       'upper.L': [('X', -22), ('Y', -28)], 'head': [('X', -10)]}, {'hips': (0, 0.1, -0.1)}))]
    attack = [(1, prepare[-1][1]),
              (7, P({'chest': [('X', 28), ('Z', -10)], 'spine': [('X', 10)], 'upper.R': [('X', -40), ('Y', 8)], 'lower.R': [('X', -10)], 'upper.L': [('X', 10), ('Y', -30)], 'head': [('X', 12)]},
                    {'root': (0, -0.35, 0), 'hips': (0, 0, -0.18)})),
              (14, P({'chest': [('X', 30), ('Z', -10)], 'spine': [('X', 12)], 'upper.R': [('X', -35)], 'upper.L': [('X', 12), ('Y', -30)], 'head': [('X', 14)]},
                     {'root': (0, -0.35, 0), 'hips': (0, 0, -0.2)})),
              (30, rest)]
    special = [(1, rest),
               (14, P({'chest': [('X', -25)], 'head': [('X', -30)], 'upper.L': [('X', -170), ('Y', -20)], 'upper.R': [('X', -170), ('Y', 20)], 'lower.L': [('X', -20)], 'lower.R': [('X', -20)]},
                      {'hips': (0, 0, 0.12)})),
               (24, P({'chest': [('X', -28)], 'head': [('X', -32)], 'upper.L': [('X', -175), ('Y', -24)], 'upper.R': [('X', -175), ('Y', 24)]}, {'hips': (0, 0, 0.15)})),
               (31, P({'chest': [('X', 40)], 'spine': [('X', 15)], 'head': [('X', 18)], 'upper.L': [('X', -30), ('Y', -10)], 'upper.R': [('X', -30), ('Y', 10)]},
                      {'hips': (0, 0, -0.35), 'root': (0, -0.2, 0)})),
               (38, P({'chest': [('X', 42)], 'spine': [('X', 16)], 'head': [('X', 20)], 'upper.L': [('X', -25)], 'upper.R': [('X', -25)]}, {'hips': (0, 0, -0.36), 'root': (0, -0.2, 0)})),
               (48, rest)]
    hit = [(1, rest), (4, P({'chest': [('X', -14), ('Z', 6)], 'head': [('X', -14)], **arms(4, 18)}, {'root': (0, 0.12, 0)})), (12, rest)]
    stun = []
    for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0)):
        stun.append((f, P({'chest': [('X', 20), ('Y', 6 * k)], 'head': [('X', 28), ('Z', 10 * k)], 'spine': [('X', 8)], **arms(-4, 2)}, {'hips': (0, 0, -0.12)})))
    phase = [(1, rest),
             (14, P({'chest': [('X', 30)], 'head': [('X', 25)], **arms(-10, 10)}, {'hips': (0, 0, -0.4)})),
             (24, P({'chest': [('X', 32)], 'head': [('X', 28)], **arms(-8, 8)}, {'hips': (0, 0, -0.42)})),
             (36, P({'chest': [('X', -30)], 'head': [('X', -35)], **arms(-80, 85), 'lower.L': [('X', -30)], 'lower.R': [('X', -30)]}, {'hips': (0, 0, 0.1)}, {'chest': 1.06})),
             (50, P({'chest': [('X', -32)], 'head': [('X', -38)], **arms(-82, 88)}, {'hips': (0, 0, 0.1)}, {'chest': 1.06})),
             (60, rest)]
    enrage = []
    for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0)):
        enrage.append((f, P({'chest': [('X', -6 - 4 * abs(k)), ('Z', 5 * k)], 'head': [('Z', 9 * k), ('X', -4)], **arms(-35 - 8 * abs(k), 35), 'lower.L': [('X', -45)], 'lower.R': [('X', -45)]},
                            {'hips': (0, 0, -0.06 - 0.04 * abs(k))})))
    death = [(1, rest),
             (10, P({'chest': [('X', -20)], 'head': [('X', -25)], **arms(10, 40)}, {'root': (0, 0.2, 0)})),
             (26, P({'chest': [('X', -8)], 'head': [('X', 10)], **arms(-10, 30)}, {'hips': (0, 0, -0.3), 'root': (0, 0.1, 0)})),
             (52, P({'root': [('X', 82)], 'chest': [('X', 10)], 'head': [('X', 20)], **arms(-60, 20)}, {'root': (0, -0.2, -0.15)})),
             (60, P({'root': [('X', 86)], 'chest': [('X', 12)], 'head': [('X', 22)], **arms(-70, 15)}, {'root': (0, -0.2, -0.22)})),
             (72, P({'root': [('X', 86)], 'chest': [('X', 12)], 'head': [('X', 22)], **arms(-70, 15)}, {'root': (0, -0.2, -0.25)}))]
    return {'idle': idle, 'spawn': spawn, 'prepare': prepare, 'attack': attack, 'special': special, 'hit': hit, 'stun': stun, 'phase': phase, 'enrage': enrage, 'death': death}


def forest_clips(arm):
    return biped_clips(arm, heavy=1.0)


# =====================================================================
# INFERNO GOLEM
# =====================================================================
def build_inferno():
    L.reset_scene()
    B = [
        ('root', (0, 0, 0), (0, 0, 0.35), None),
        ('hips', (0, 0.1, 0.95), (0, 0.05, 1.4), 'root'),
        ('spine', (0, 0.05, 1.4), (0, -0.1, 1.9), 'hips'),
        ('chest', (0, -0.1, 1.9), (0, -0.3, 2.4), 'spine'),
        ('neck', (0, -0.32, 2.35), (0, -0.45, 2.5), 'chest'),
        ('head', (0, -0.45, 2.5), (0, -0.62, 2.85), 'neck'),
    ]
    for s, x in (('L', 1), ('R', -1)):
        B += [
            (f'shoulder.{s}', (0.3 * x, -0.2, 2.25), (0.95 * x, -0.15, 2.3), 'chest'),
            (f'upper.{s}', (0.95 * x, -0.15, 2.3), (1.25 * x, -0.3, 1.45), f'shoulder.{s}'),
            (f'lower.{s}', (1.25 * x, -0.3, 1.45), (1.3 * x, -0.5, 0.7), f'upper.{s}'),
            (f'hand.{s}', (1.3 * x, -0.5, 0.7), (1.32 * x, -0.6, 0.3), f'lower.{s}'),
            (f'thigh.{s}', (0.42 * x, 0.12, 0.95), (0.5 * x, 0.1, 0.5), 'hips'),
            (f'shin.{s}', (0.5 * x, 0.1, 0.5), (0.52 * x, 0.02, 0.08), f'thigh.{s}'),
        ]
    arm = L.armature('ARM_Boss', B)

    core = L.mat('Core', '#FFFFFF', rough=0.9, vcol=True)
    body = [((0, 0.1, 1.1), 0.5, (1.1, 0.9, 0.9)), ((0, 0, 1.65), 0.58, (1.2, 0.95, 1)), ((0, -0.22, 2.15), 0.7, (1.45, 1.0, 0.85)),
            ((0, -0.5, 2.62), 0.3, (1, 1.1, 0.95))]
    for x in (1, -1):
        body += [((0.9 * x, -0.18, 2.3), 0.48, None)]
        body += L.chain((0.95 * x, -0.15, 2.3), (1.25 * x, -0.3, 1.45), 0.34, 0.3)
        body += L.chain((1.25 * x, -0.3, 1.45), (1.3 * x, -0.5, 0.75), 0.32, 0.36)
        body += L.chain((0.42 * x, 0.12, 0.95), (0.52 * x, 0.04, 0.12), 0.32, 0.3)
    ob = L.blob('Core', body, resolution=0.07, voxel=0.045, material=core)
    def lava_mask(p):
        f1, f2 = L.cells(p * 3.2)
        return 1.0 - L.smooth(0.03, 0.1, f2 - f1)
    L.displace(ob, lambda p, n: -0.04 * lava_mask(p) + 0.02 * L.fbm(p * 5, 2))
    ob = L.decimate(ob, 0.45)
    def core_col(p, n):
        m = lava_mask(p)
        rockc = L.mix(L.lin('#1E1410'), L.lin('#4A3328'), 0.5 + L.fbm(p * 4, 2))
        lava = L.mix(L.lin('#FF5A12'), L.lin('#FFD24A'), m)
        return (*L.mix(rockc, lava, m), m)
    L.paint(ob, core_col)
    L.skin(ob, arm, falloff=0.15)
    parts = [ob]

    # แผ่นหินแยกชิ้น (ผูกกระดูกแข็ง) — ขยับแยกจากแกนลาวาเห็นรอยแตกเรืองแสงระหว่างชิ้น
    stone = L.mat('Stone', '#FFFFFF', rough=0.95, vcol=True)
    rnd = random.Random(11)
    plates = [
        ('chest', (0, -0.72, 2.2), (0.42, 0.22, 0.34)), ('chest', (0.42, -0.62, 2.05), (0.3, 0.2, 0.3)), ('chest', (-0.42, -0.62, 2.05), (0.3, 0.2, 0.3)),
        ('chest', (0, 0.25, 2.25), (0.6, 0.3, 0.45)), ('spine', (0, -0.42, 1.6), (0.38, 0.2, 0.28)), ('hips', (0, -0.3, 1.1), (0.42, 0.22, 0.25)),
        ('head', (0, -0.6, 2.72), (0.3, 0.24, 0.2)),
    ]
    for x, s in ((1, 'L'), (-1, 'R')):
        plates += [(f'shoulder.{s}', (0.98 * x, -0.12, 2.52), (0.48, 0.44, 0.32)), (f'upper.{s}', (1.2 * x, -0.35, 1.85), (0.3, 0.3, 0.35)),
                   (f'lower.{s}', (1.32 * x, -0.48, 1.05), (0.34, 0.32, 0.38)), (f'hand.{s}', (1.33 * x, -0.62, 0.42), (0.48, 0.44, 0.42)),
                   (f'thigh.{s}', (0.5 * x, -0.12, 0.75), (0.3, 0.28, 0.3)), (f'shin.{s}', (0.54 * x, -0.12, 0.25), (0.34, 0.36, 0.26))]
    for i, (bone, c, sz) in enumerate(plates):
        r = L.rock(f'plate{i}', c, tuple(v * 0.9 for v in sz), stone, seed=i * 7 + 1, subdiv=1, rough=0.42)
        L.paint(r, lambda p, n: (*L.mix(L.lin('#1E1512'), L.lin('#5C463B'), 0.35 + 0.6 * L.fbm(p * 6, 2) + 0.3 * n.z), 0.0))
        L.skin(r, arm, rigid=bone)
        parts.append(r)
    # หัวใจลาวา (เรืองแสง) ในช่องอก
    heart = L.mat('Heart', '#FFB13B', rough=0.3, emission='#FF7A1A', strength=8)
    h = L.ellipsoid('heart', (0, -0.78, 2.0), (0.2, 0.12, 0.2), heart, seg=18, rings=10)
    L.skin(h, arm, rigid='chest'); parts.append(h)
    # ตา + เขาออบซิเดียน + หนามหลัง
    eye = L.mat('EyeFire', '#FFE27A', rough=0.2, emission='#FFB020', strength=9)
    obsid = L.mat('Obsidian', '#17121A', rough=0.25, metal=0.2)
    for x in (1, -1):
        e = L.ellipsoid(f'eye{x}', (0.11 * x, -0.86, 2.72), (0.07, 0.025, 0.028), eye, seg=12, rings=6, rot=(0, 0, -12 * x))
        L.skin(e, arm, rigid='head'); parts.append(e)
        hn = L.horn(f'horn{x}', (0.2 * x, -0.62, 2.85), (0.55 * x, -0.4, 3.2), (0.48 * x, -0.1, 3.45), 0.1, obsid, n=9, seg=9)
        L.skin(hn, arm, rigid='head'); parts.append(hn)
    for i in range(6):
        y = 0.3 + 0.08 * i; z = 2.5 - 0.22 * i
        sp = L.crystal(f'spike{i}', (rnd.uniform(-0.15, 0.15), y, z), (0, 0.6, 0.8), 0.55 - 0.05 * i, 0.09, obsid, sides=5)
        L.skin(sp, arm, rigid='chest' if z > 1.9 else 'spine'); parts.append(sp)
    # หนามลาวาบนไหล่
    lavac = L.mat('LavaCrystal', '#FF8A3D', rough=0.3, emission='#FF5A12', strength=4)
    for x, s in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            c = L.crystal(f'sc{x}{k}', (0.95 * x + 0.12 * (k - 1) * x, -0.1 + 0.1 * k, 2.75), (0.4 * x, 0.2 * (k - 1), 1), 0.42 - 0.08 * k, 0.07, lavac, sides=5)
            L.skin(c, arm, rigid=f'shoulder.{s}'); parts.append(c)
    body_ob = L.join('InfernoGolem', parts)
    _clips(arm, biped_clips(arm, heavy=1.6))
    return arm, body_ob


# =====================================================================
# FROST DRAGON
# =====================================================================
def build_frost(xmas=False):
    """มังกรน้ำแข็ง: ลำตัวหนา ขาสั้นแข็งแรง คอยาวโค้ง หัวมีจมูกยาว ปีกค้างคาว 4 นิ้วมีแผ่นปีกเต็มผืน"""
    L.reset_scene()
    B = [
        ('root', (0, 0, 0), (0, 0, 0.35), None),
        ('pelvis', (0, 0.7, 1.05), (0, 0.15, 1.18), 'root'),
        ('chest', (0, 0.15, 1.18), (0, -0.55, 1.3), 'pelvis'),
        ('neck1', (0, -0.55, 1.3), (0, -0.9, 1.75), 'chest'),
        ('neck2', (0, -0.9, 1.75), (0, -1.12, 2.2), 'neck1'),
        ('neck3', (0, -1.12, 2.2), (0, -1.28, 2.55), 'neck2'),
        ('head', (0, -1.28, 2.55), (0, -2.0, 2.52), 'neck3'),
        ('jaw', (0, -1.42, 2.4), (0, -2.0, 2.3), 'head'),
        ('tail1', (0, 0.7, 1.05), (0, 1.45, 0.92), 'pelvis'),
        ('tail2', (0, 1.45, 0.92), (0, 2.2, 0.7), 'tail1'),
        ('tail3', (0, 2.2, 0.7), (0, 2.95, 0.45), 'tail2'),
        ('tail4', (0, 2.95, 0.45), (0, 3.7, 0.3), 'tail3'),
    ]
    for s, x in (('L', 1), ('R', -1)):
        B += [
            (f'arm.{s}', (0.48 * x, -0.42, 1.08), (0.66 * x, -0.62, 0.55), 'chest'),
            (f'fore.{s}', (0.66 * x, -0.62, 0.55), (0.66 * x, -0.66, 0.12), f'arm.{s}'),
            (f'leg.{s}', (0.5 * x, 0.62, 0.98), (0.7 * x, 0.4, 0.55), 'pelvis'),
            (f'calf.{s}', (0.7 * x, 0.4, 0.55), (0.68 * x, 0.62, 0.12), f'leg.{s}'),
            (f'wing.{s}', (0.36 * x, -0.22, 1.55), (1.5 * x, 0.05, 2.45), 'chest'),
            (f'wingf.{s}', (1.5 * x, 0.05, 2.45), (2.75 * x, 0.45, 2.3), f'wing.{s}'),
        ]
    arm = L.armature('ARM_Boss', B)

    scale_c = ('#173F73', '#5FB6F0', '#DDF4FF') if not xmas else ('#16367E', '#4FB8FF', '#EAFBFF')
    skin_m = L.mat('Scales', '#FFFFFF', rough=0.42, metal=0.12, vcol=True)
    body = [((0, 0.55, 1.08), 0.6, (1.05, 1.25, 0.9)), ((0, 0.05, 1.2), 0.7, (1.1, 1.3, 0.95)), ((0, -0.45, 1.3), 0.6, (1.12, 1.1, 1.0))]
    body += L.chain((0, -0.55, 1.35), (0, -1.12, 2.2), 0.42, 0.3)
    body += L.chain((0, -1.12, 2.2), (0, -1.28, 2.55), 0.3, 0.28)
    body += [((0, -1.42, 2.6), 0.34, (1.0, 1.1, 0.85)), ((0, -1.82, 2.55), 0.22, (0.85, 1.45, 0.7)), ((0, -1.74, 2.38), 0.18, (0.8, 1.45, 0.55)),
             ((0, -1.4, 2.76), 0.18, (1.5, 0.9, 0.45))]   # สันคิ้ว
    body += L.chain((0, 0.75, 1.05), (0, 2.2, 0.7), 0.48, 0.24)
    body += L.chain((0, 2.2, 0.7), (0, 3.75, 0.3), 0.24, 0.06)
    for x in (1, -1):
        body += L.chain((0.48 * x, -0.42, 1.1), (0.66 * x, -0.62, 0.55), 0.27, 0.19)
        body += L.chain((0.66 * x, -0.62, 0.55), (0.66 * x, -0.66, 0.14), 0.18, 0.15)
        body += [((0.66 * x, -0.76, 0.08), 0.18, (1.1, 1.4, 0.5))]
        body += L.chain((0.5 * x, 0.62, 1.0), (0.7 * x, 0.4, 0.55), 0.36, 0.24)
        body += L.chain((0.7 * x, 0.4, 0.55), (0.68 * x, 0.62, 0.14), 0.2, 0.16)
        body += [((0.68 * x, 0.5, 0.08), 0.2, (1.1, 1.5, 0.5))]
    ob = L.blob('Body', body, resolution=0.05, voxel=0.032, material=skin_m)
    def scales(p):
        f1, f2 = L.cells(Vector((p.x * 10, p.y * 7, p.z * 10)))
        return L.smooth(0.0, 0.2, f2 - f1)
    EYES = [Vector((0.2 * x, -1.62, 2.7)) for x in (1, -1)]
    L.displace(ob, lambda p, n: 0.014 * scales(p) - 0.007 + 0.008 * L.fbm(p * 3, 2) - 0.05 * sum(max(0.0, 1 - (p - e).length / 0.1) for e in EYES))
    ob = L.decimate(ob, 0.32)
    def col(p, n):
        belly = L.smooth(-0.15, -0.7, n.z)
        sc = scales(p)
        c = L.mix(L.lin(scale_c[0]), L.lin(scale_c[1]), 0.25 + 0.55 * sc + 0.2 * max(0.0, n.z))
        c = L.mix(c, L.mix(L.lin('#9CC9E6'), L.lin(scale_c[2]), sc), belly * 0.9)
        ridge = L.smooth(0.65, 0.95, n.z) * (1 - L.smooth(0.05, 0.14, abs(p.x))) * (1 if p.y > -1.3 else 0)
        glow = ridge * 0.9
        if xmas:
            glow = max(glow, 0.6 * (1 - sc) * L.smooth(-0.1, 0.5, n.z))
        return (*L.mix(c, L.lin('#C6F4FF'), glow * 0.55), glow)
    L.paint(ob, col)
    L.skin(ob, arm, falloff=0.1)
    parts = [ob]

    eye = L.mat('EyeIce', '#2E6BFF' if xmas else '#8FF0FF', rough=0.1, emission='#1E4DFF' if xmas else '#5CE1FF', strength=10)
    horn_m = L.mat('Horn', '#D9ECFA', rough=0.35)
    for x in (1, -1):
        e = L.ellipsoid(f'eye{x}', (0.19 * x, -1.66, 2.69), (0.05, 0.08, 0.026), eye, seg=12, rings=8, rot=(0, 0, 22 * x))
        L.skin(e, arm, rigid='head'); parts.append(e)
        h1 = L.horn(f'hornA{x}', (0.16 * x, -1.38, 2.86), (0.34 * x, -1.05, 3.15), (0.3 * x, -0.62, 3.2), 0.075, horn_m, n=10, seg=9)
        h2 = L.horn(f'hornB{x}', (0.27 * x, -1.3, 2.72), (0.52 * x, -1.1, 2.8), (0.62 * x, -0.82, 2.72), 0.045, horn_m, n=8, seg=8)
        h3 = L.horn(f'hornC{x}', (0.2 * x, -1.75, 2.42), (0.3 * x, -1.7, 2.35), (0.36 * x, -1.6, 2.3), 0.025, horn_m, n=6, seg=6)   # หนามแก้ม
        for h in (h1, h2, h3):
            L.skin(h, arm, rigid='head'); parts.append(h)
    teeth = L.mat('Teeth', '#F4FBFF', rough=0.3)
    for i in range(6):
        for x in (1, -1):
            t = L.cone(f'tooth{i}{x}', (0.1 * x * (1 - i * 0.1), -1.65 - i * 0.07, 2.42), (0.1 * x * (1 - i * 0.1), -1.66 - i * 0.07, 2.32), 0.017, teeth, seg=5)
            L.skin(t, arm, rigid='head'); parts.append(t)
    ice = L.mat('IceCrystal', '#C8F4FF', rough=0.06, emission='#6FE3FF', strength=2.4 if not xmas else 3.8)
    spine_pts = [(-1.25, 2.62, 'neck3'), (-1.1, 2.25, 'neck2'), (-0.92, 1.9, 'neck1'), (-0.6, 1.72, 'chest'), (-0.2, 1.72, 'chest'), (0.25, 1.68, 'pelvis'),
                 (0.7, 1.5, 'pelvis'), (1.3, 1.3, 'tail1'), (1.95, 1.05, 'tail2'), (2.6, 0.78, 'tail3'), (3.25, 0.5, 'tail4')]
    for i, (y, z, bn) in enumerate(spine_pts):
        size = 0.34 if 2 < i < 7 else 0.2
        c = L.crystal(f'sp{i}', (0, y, z - 0.05), (0, 0.35, 1), size, 0.05 + size * 0.12, ice, sides=6)
        L.skin(c, arm, rigid=bn); parts.append(c)
    rnd = random.Random(5)
    for i in range(8):
        x = rnd.uniform(-0.38, 0.38); y = rnd.uniform(-0.3, 0.6)
        c = L.crystal(f'back{i}', (x, y, 1.62 - abs(x) * 0.5), (x * 1.6, rnd.uniform(-0.3, 0.3), 1), rnd.uniform(0.18, 0.34), 0.05, ice, sides=6)
        L.skin(c, arm, rigid='chest' if y < 0.15 else 'pelvis'); parts.append(c)
    # ปีก: กระดูกปีกเรียว + แผ่นปีกเป็นผืน (ระหว่างนิ้ว + ช่วงลำตัว)
    bone_m = L.mat('WingBone', '#9FC8E8', rough=0.4)
    mem = L.mat('Membrane', '#FFFFFF', rough=0.3, emission='#5CC8FF', strength=0.5 if not xmas else 1.2, alpha=0.7 if not xmas else 0.55, vcol=True)
    for x, s in ((1, 'L'), (-1, 'R')):
        sh = Vector((0.36 * x, -0.22, 1.55)); el = Vector((1.5 * x, 0.05, 2.45)); wr = Vector((2.75 * x, 0.45, 2.3))
        fingers = [Vector((3.4 * x, 1.25, 1.45)), Vector((2.95 * x, 1.75, 1.15)), Vector((2.15 * x, 1.9, 1.05)), Vector((1.3 * x, 1.55, 1.1))]
        hip = Vector((0.42 * x, 0.75, 1.15))
        parts.append(_rig(L.tube(f'wb{s}', [sh, el, wr], [0.06, 0.045, 0.03], bone_m, seg=8), arm, [f'wing.{s}', f'wingf.{s}']))
        for k, fp in enumerate(fingers):
            mid = wr.lerp(fp, 0.5) + Vector((0, 0, 0.08))
            parts.append(_rig(L.tube(f'wf{s}{k}', [wr, mid, fp], [0.028, 0.02, 0.008], bone_m, seg=6), arm, None, rigid=f'wingf.{s}'))
        def strip(a0, a1, b0, b1, n=7, m=5, sag=0.1):
            rows = []
            for i in range(m + 1):
                u = i / m
                A = a0.lerp(a1, u); Bp = b0.lerp(b1, u)
                row = []
                for j in range(n + 1):
                    t = j / n
                    p = A.lerp(Bp, t)
                    row.append(p - Vector((0, 0, sag * math.sin(t * math.pi) * u)))
                rows.append(row)
            return rows
        mems = []
        for k in range(len(fingers) - 1):   # ระหว่างนิ้ว: จากข้อมือไปปลายนิ้ว
            mems.append(L.membrane(f'mem{s}{k}', strip(wr, fingers[k], wr, fingers[k + 1], sag=0.14), mem))
        mems.append(L.membrane(f'memA{s}', strip(sh, wr, hip, fingers[-1], sag=0.18), mem))   # ช่วงแขนปีก ↔ ลำตัว
        mems.append(L.membrane(f'memB{s}', strip(wr, wr, el, fingers[0], n=4, sag=0.0), mem))
        for wm in mems:
            L.paint(wm, (lambda p, n: (*L.mix(L.lin('#5FB6F0'), L.lin('#E8FAFF'), 0.4 + 0.5 * abs(math.sin(p.y * 7 + p.x * 3)) if xmas else L.smooth(0.4, 2.8, abs(p.x)) * 0.8 + 0.1), 0.45 if xmas else 0.12)))
            L.skin(wm, arm, bones=[f'wing.{s}', f'wingf.{s}', 'chest', 'pelvis'], falloff=0.3)
            parts.append(wm)
    claw = L.mat('Claw', '#E8F6FF', rough=0.25)
    for x, s in ((1, 'L'), (-1, 'R')):
        for k in (-1, 0, 1):
            for bn, y, cx in ((f'fore.{s}', -0.92, 0.66), (f'calf.{s}', 0.3, 0.68)):
                c = L.cone(f'claw{s}{bn}{k}', (cx * x + 0.08 * k, y + 0.04, 0.08), (cx * x + 0.1 * k, y - 0.1, 0.01), 0.03, claw, seg=5)
                L.skin(c, arm, rigid=bn); parts.append(c)
    if xmas:
        gold = L.mat('CrownGold', '#FFD978', rough=0.25, metal=0.9, emission='#FFB52E', strength=0.6)
        cy, cz = -1.36, 2.9
        ring = L.tube('crownband', [Vector((math.cos(a) * 0.24, cy + math.sin(a) * 0.2, cz)) for a in [i / 16 * 2 * math.pi for i in range(17)]], 0.025, gold, seg=6, cap=False)
        L.skin(ring, arm, rigid='head'); parts.append(ring)
        cr = L.mat('CrownCrystal', '#E9FBFF', rough=0.05, emission='#9BE8FF', strength=5)
        for i in range(7):
            a = -math.pi / 2 + (i - 3) * 0.42
            base = Vector((math.cos(a) * 0.24, cy + math.sin(a) * 0.2, cz))
            c = L.crystal(f'crown{i}', base, (math.cos(a) * 0.25, math.sin(a) * 0.25, 1), 0.34 - abs(i - 3) * 0.05, 0.04, cr, sides=6)
            L.skin(c, arm, rigid='head'); parts.append(c)
    body_ob = L.join('FrostDragon' + ('Xmas' if xmas else ''), parts)
    _clips(arm, dragon_clips(arm))
    return arm, body_ob


def _rig(ob, arm, bones, rigid=None):
    L.skin(ob, arm, bones=bones, rigid=rigid)
    return ob


def dragon_clips(arm):
    P = lambda r=None, l=None, s=None: L.pose(arm, r or {}, l or {}, s or {})
    wings = lambda up, fold=0: {'wing.L': [('Y', -up)], 'wing.R': [('Y', up)], 'wingf.L': [('Y', -fold)], 'wingf.R': [('Y', fold)]}
    rest = P({**wings(0, 0)})
    idle = []
    for f, k in ((1, 0), (18, 1), (36, 0), (54, -1), (72, 0)):
        idle.append((f, P({'neck1': [('X', 2 * k)], 'neck2': [('X', 2 * k), ('Z', 3 * k)], 'head': [('X', -3 * k), ('Z', 4 * k)], 'jaw': [('X', -2 * abs(k))],
                           'tail2': [('Z', 8 * k)], 'tail3': [('Z', 12 * k)], 'tail4': [('Z', 16 * k)], **wings(6 * abs(k), -4 * abs(k)), 'chest': [('X', -1.5 * abs(k))]},
                          {'pelvis': (0, 0, 0.03 * abs(k))})))
    roar = lambda a=1.0: {'neck1': [('X', -18 * a)], 'neck2': [('X', -15 * a)], 'head': [('X', -25 * a)], 'jaw': [('X', -30 * a)]}
    spawn = [(1, P({**wings(-60, 40), 'neck1': [('X', 40)], 'neck2': [('X', 30)], 'head': [('X', 20)]}, {'root': (0, 0, 4.5)})),
             (14, P({**wings(60, -10), 'neck1': [('X', 20)]}, {'root': (0, 0, 3.0)})),
             (26, P({**wings(-40, 30)}, {'root': (0, 0, 1.2)})),
             (36, P({**wings(55, -10), 'chest': [('X', 10)]}, {'root': (0, 0, 0.15), 'pelvis': (0, 0, -0.2)})),
             (48, P({**wings(70, -20), **roar(1.2)})),
             (60, rest)]
    prepare = [(1, rest), (14, P({**wings(35, -10), 'neck1': [('X', -25)], 'neck2': [('X', -20)], 'head': [('X', -10)], 'chest': [('X', -10)]}, {'pelvis': (0, 0.1, -0.08)})),
               (24, P({**wings(40, -12), 'neck1': [('X', -28)], 'neck2': [('X', -22)], 'head': [('X', -12)], 'chest': [('X', -12)]}, {'pelvis': (0, 0.12, -0.1)}))]
    attack = [(1, prepare[-1][1]),
              (8, P({**wings(-10, 10), 'neck1': [('X', 30)], 'neck2': [('X', 25)], 'head': [('X', 15)], 'jaw': [('X', -35)], 'chest': [('X', 15)],
                     'arm.R': [('X', -70)], 'fore.R': [('X', 20)]}, {'root': (0, -0.45, 0)})),
              (15, P({**wings(-8, 8), 'neck1': [('X', 32)], 'neck2': [('X', 26)], 'head': [('X', 18)], 'jaw': [('X', -5)], 'chest': [('X', 16)], 'arm.R': [('X', -20)]}, {'root': (0, -0.45, 0)})),
              (30, rest)]
    special = [(1, rest), (14, P({**wings(55, -15), **roar(1.0)}, {'pelvis': (0, 0.1, 0.05)})),
               (22, P({**wings(60, -18), 'neck1': [('X', 10)], 'neck2': [('X', 25)], 'head': [('X', 30)], 'jaw': [('X', -40)]}, {'pelvis': (0, 0.1, 0.05)})),
               (40, P({**wings(55, -18), 'neck1': [('X', 12), ('Z', 15)], 'neck2': [('X', 26), ('Z', 10)], 'head': [('X', 30)], 'jaw': [('X', -42)]}, {'pelvis': (0, 0.1, 0.05)})),
               (48, rest)]
    hit = [(1, rest), (4, P({**wings(25, -5), 'neck1': [('X', -15)], 'neck2': [('X', -10), ('Z', 10)], 'head': [('X', -20)], 'jaw': [('X', -20)]}, {'root': (0, 0.15, 0)})), (12, rest)]
    stun = []
    for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0)):
        stun.append((f, P({**wings(-20, 30), 'neck1': [('X', 30)], 'neck2': [('X', 20), ('Z', 10 * k)], 'head': [('X', 25), ('Y', 12 * k)], 'jaw': [('X', -10)],
                           'tail3': [('Z', 6 * k)]}, {'pelvis': (0, 0, -0.2)})))
    phase = [(1, rest), (14, P({**wings(-30, 40), 'neck1': [('X', 35)], 'neck2': [('X', 25)], 'head': [('X', 20)]}, {'pelvis': (0, 0, -0.25)})),
             (26, P({**wings(-35, 45), 'neck1': [('X', 38)]}, {'pelvis': (0, 0, -0.28)})),
             (38, P({**wings(80, -25), **roar(1.4)}, {'pelvis': (0, 0, 0.1)}, {'chest': 1.05})),
             (52, P({**wings(82, -28), **roar(1.45)}, {'pelvis': (0, 0, 0.1)}, {'chest': 1.05})),
             (60, rest)]
    enrage = []
    for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0)):
        enrage.append((f, P({**wings(30 + 25 * abs(k), -10), 'neck1': [('X', -8)], 'neck2': [('Z', 10 * k)], 'head': [('X', -10), ('Z', 10 * k)], 'jaw': [('X', -18 * abs(k))],
                             'tail2': [('Z', 18 * k)], 'tail3': [('Z', 22 * k)], 'tail4': [('Z', 26 * k)]}, {'pelvis': (0, 0, 0.05 * abs(k))})))
    death = [(1, rest), (10, P({**wings(70, -20), **roar(1.2)}, {'root': (0, 0.2, 0)})),
             (28, P({**wings(20, 10), 'neck1': [('X', 20)], 'neck2': [('X', 20)], 'head': [('X', 15)]}, {'pelvis': (0, 0, -0.5)})),
             (50, P({'root': [('Y', 80)], **wings(-30, 40), 'neck1': [('X', 40), ('Z', 25)], 'neck2': [('X', 25)], 'head': [('X', 20)], 'jaw': [('X', -12)]}, {'root': (0.3, 0, 0.15)})),
             (72, P({'root': [('Y', 84)], **wings(-35, 45), 'neck1': [('X', 45), ('Z', 28)], 'neck2': [('X', 28)], 'head': [('X', 22)], 'jaw': [('X', -15)]}, {'root': (0.3, 0, 0.12)}))]
    return {'idle': idle, 'spawn': spawn, 'prepare': prepare, 'attack': attack, 'special': special, 'hit': hit, 'stun': stun, 'phase': phase, 'enrage': enrage, 'death': death}


# =====================================================================
# SHADOW ARCHMAGE (v1.27.1)
# =====================================================================
def build_shadow():
    """จอมเวทเงามืด: ลอยตัว (ไม่มีขา) · คลุมฮู้ดใบหน้าเป็นความมืด ตาเรืองแสงม่วง · เสื้อคลุมยาวขอบขาดเป็นเงา
    แขนเสื้อทรงระฆัง · ไม้เท้าหัวกรงเล็บกุมลูกแก้วเวท · วงอักขระลอยรอบตัว · ผลึกมืดลอยข้างไหล่ · ปกคอสูงแหลม"""
    L.reset_scene()
    B = [
        ('root', (0, 0, 0), (0, 0, 0.35), None),
        ('hips', (0, 0, 1.2), (0, 0, 1.65), 'root'),
        ('spine', (0, 0, 1.65), (0, -0.03, 2.1), 'hips'),
        ('chest', (0, -0.03, 2.1), (0, -0.06, 2.6), 'spine'),
        ('neck', (0, -0.06, 2.6), (0, -0.1, 2.8), 'chest'),
        ('head', (0, -0.1, 2.8), (0, -0.16, 3.3), 'neck'),
        ('robe.F', (0, -0.25, 1.2), (0, -0.42, 0.3), 'hips'),
        ('robe.B', (0, 0.25, 1.2), (0, 0.48, 0.3), 'hips'),
    ]
    for s, x in (('L', 1), ('R', -1)):
        B += [
            (f'shoulder.{s}', (0.22 * x, -0.05, 2.5), (0.56 * x, -0.04, 2.47), 'chest'),
            (f'upper.{s}', (0.56 * x, -0.04, 2.47), (0.76 * x, -0.14, 1.95), f'shoulder.{s}'),
            (f'lower.{s}', (0.76 * x, -0.14, 1.95), (0.84 * x, -0.38, 1.52), f'upper.{s}'),
            (f'hand.{s}', (0.84 * x, -0.38, 1.52), (0.86 * x, -0.48, 1.3), f'lower.{s}'),
            (f'robe.{s}', (0.3 * x, 0, 1.2), (0.62 * x, 0, 0.3), 'hips'),
        ]
    arm = L.armature('ARM_Boss', B)

    cloth = L.mat('Robe', '#FFFFFF', rough=0.75, vcol=True)
    body = []
    # เสื้อคลุมทรง A: อก → เอวคอด → บานลงถึงชายผ้า (ลอยเหนือพื้น ~0.25 ม.) · ลูกบอลถี่ให้ผิวเรียบไม่เป็นปล้อง
    prof = [(2.38, 0.36, 1.3), (2.2, 0.36, 1.25), (2.0, 0.33, 1.15), (1.82, 0.31, 1.1), (1.64, 0.32, 1.1), (1.46, 0.36, 1.12), (1.28, 0.41, 1.12),
            (1.1, 0.46, 1.12), (0.92, 0.52, 1.12), (0.75, 0.58, 1.12), (0.6, 0.64, 1.12), (0.46, 0.7, 1.12), (0.36, 0.74, 1.12)]
    for i, (z, r, sx) in enumerate(prof):
        body.append(((0, 0.03 * max(0, 1.6 - z), z), r, (sx, 0.95, 0.75), 2.5))
    # ผ้าคลุมไหล่กว้าง (mantle) + คอ
    body += [((0, 0.02, 2.5), 0.4, (2.1, 1.05, 0.55)), ((0, -0.06, 2.68), 0.2, None)]
    # ฮู้ดใหญ่: ครอบหัว + ยื่นไปหน้า + ปลายแหลมด้านหลังพับลง
    body += [((0, -0.08, 3.0), 0.46, (1.0, 1.08, 1.08)), ((0, -0.24, 3.14), 0.3, (1.05, 0.9, 0.85)),
             ((0, 0.22, 3.12), 0.26, (0.8, 1.1, 0.9)), ((0, 0.42, 2.98), 0.16, None), ((0, 0.52, 2.84), 0.1, None)]
    for x in (1, -1):
        body += [((0.55 * x, -0.02, 2.46), 0.26, (1.1, 1, 0.75))]                      # ไหล่
        body += L.chain((0.6 * x, -0.04, 2.42), (0.76 * x, -0.14, 1.97), 0.15, 0.16)
        body += L.chain((0.76 * x, -0.14, 1.95), (0.85 * x, -0.34, 1.5), 0.16, 0.24, n=6)   # แขนเสื้อบานปลาย (ทรงระฆัง)
        body += [((0.86 * x, -0.36, 1.46), 0.26, (1.0, 1.0, 0.6))]
    ob = L.blob('Robe', body, resolution=0.06, voxel=0.04, material=cloth)
    FACE = Vector((0, -0.5, 3.0))
    def face_d(p):
        return (Vector((p.x * 1.15, (p.y - FACE.y) * 1.6, (p.z - FACE.z) * 0.95))).length
    def robe_fn(p, n):
        fold = 0.035 * math.sin(math.atan2(p.y, p.x) * 9 + p.z * 1.5) * L.smooth(2.0, 0.6, p.z)   # จีบผ้าแนวตั้ง
        hood_in = -0.13 * L.smooth(0.0, 1.0, max(0.0, 1 - face_d(p) / 0.36)) if p.y < -0.25 and p.z > 2.7 else 0.0   # ช่องหน้าในฮู้ดลึก
        rag = -0.1 * max(0.0, L.fbm((p.x * 5, p.y * 5, 0), 2)) * L.smooth(0.55, 0.3, p.z)        # ชายผ้าขาดรุ่ย
        cuff = -0.12 * L.smooth(0.12, 0.0, abs(p.z - 1.32)) * (1 if abs(p.x) > 0.7 else 0)        # ปากแขนเสื้อเปิด
        return fold + hood_in + rag + cuff + 0.01 * L.fbm(p * 12, 2)
    L.displace(ob, robe_fn)
    ob = L.decimate(ob, 0.45)

    def runes(p):
        """อักขระเรืองแสงด้านหน้าเสื้อคลุม: เส้นแถบกลาง + วงกลม 2 วง + ขีดขวาง"""
        if p.y > -0.2:
            return 0.0
        d = 9.0
        if 0.6 < p.z < 2.25:
            d = abs(p.x) - 0.018
        for cz in (1.05, 1.75):
            d = min(d, abs(Vector((p.x, 0, p.z - cz)).length - 0.14))
        for z in (0.8, 1.4, 2.05):
            if abs(p.x) < 0.12:
                d = min(d, abs(p.z - z) - 0.012)
        return 1.0 - L.smooth(0.006, 0.022, d)
    def col(p, n):
        g = L.fbm(p * 3, 3)
        c = L.mix(L.lin('#120C24'), L.lin('#3B2A6B'), 0.45 + 0.55 * g + 0.25 * n.z)
        trim = (1 - L.smooth(0.0, 0.03, abs(p.z - 0.47) - 0.035)) * L.smooth(1.0, 0.7, p.z)      # แถบทองชายผ้า (คมขึ้น)
        trim = max(trim, (1 - L.smooth(0.0, 0.03, abs(face_d(p) - 0.44) - 0.03)) * (1 if p.y < -0.2 and p.z > 2.75 else 0))   # ขอบฮู้ดทอง
        trim = max(trim, (1 - L.smooth(0.03, 0.06, abs(abs(p.x) - 0.2))) * (1 if (p.y < -0.25 and 0.6 < p.z < 2.4) else 0))
        c = L.mix(c, L.mix(L.lin('#7A5A20'), L.lin('#E3C26A'), 0.5 + L.fbm(p * 10, 2)), trim * 0.9)
        dark = max(0.0, 1 - face_d(p) / 0.4) if p.y < -0.15 and p.z > 2.7 else 0.0
        c = L.mix(c, L.lin('#020105'), min(1.0, dark * 3.0))                                      # ใบหน้าเป็นความมืด
        glow = runes(p) * (1 - trim)
        c = L.mix(c, L.lin('#D8B4FE'), glow)
        return (*c, glow)
    L.paint(ob, col)
    L.skin(ob, arm, falloff=0.14)
    parts = [ob]

    # ตาเรืองแสงในความมืด + อักขระบนหน้าผาก
    eye = L.mat('VoidEye', '#E9D5FF', rough=0.2, emission='#B565FF', strength=6)
    for x in (1, -1):
        e = L.ellipsoid(f'eye{x}', (0.11 * x, -0.34, 3.0), (0.055, 0.02, 0.022), eye, seg=12, rings=6, rot=(0, 16 * x, -10 * x))
        L.skin(e, arm, rigid='head'); parts.append(e)
    gem = L.crystal('browgem', (0, -0.56, 3.36), (0, -0.4, 1), 0.18, 0.05, eye, sides=4)
    L.skin(gem, arm, rigid='head'); parts.append(gem)

    # มือซีด (นิ้วเรียวยาว)
    skinm = L.mat('Hand', '#FFFFFF', rough=0.6, vcol=True)
    for x, s in ((1, 'L'), (-1, 'R')):
        h = L.ellipsoid(f'hand{x}', (0.87 * x, -0.42, 1.24), (0.075, 0.065, 0.1), skinm, seg=12, rings=8)
        L.paint(h, lambda p, n: (*L.mix(L.lin('#6B5C8A'), L.lin('#B9A9D9'), 0.5 + 0.5 * n.z), 0.0))
        L.skin(h, arm, rigid=f'hand.{s}'); parts.append(h)
        for k in range(4):
            a = math.radians(-30 + k * 20)
            base = Vector((0.87 * x + math.sin(a) * 0.05 * x, -0.46, 1.18))
            f = L.horn(f'fing{x}{k}', base, base + Vector((0.02 * x, -0.06, -0.08)), base + Vector((0.03 * x, -0.03, -0.2)), 0.02, skinm, n=5, seg=5)
            L.paint(f, lambda p, n: (*L.lin('#8C7BAE'), 0.0))
            L.skin(f, arm, rigid=f'hand.{s}'); parts.append(f)

    # ปกคอสูงแหลม + บ่าเกราะ
    armor = L.mat('Armor', '#FFFFFF', rough=0.35, metal=0.7, vcol=True)
    for x in (1, -1):
        for k in range(3):
            c = L.crystal(f'collar{x}{k}', (0.2 * x + 0.06 * k * x, 0.05 + 0.04 * k, 2.6), (0.45 * x, 0.35, 1), 0.55 - 0.1 * k, 0.07, armor, sides=4)
            L.paint(c, lambda p, n: (*L.mix(L.lin('#1E1636'), L.lin('#5B4A8A'), 0.4 + 0.5 * n.z), 0.0))
            L.skin(c, arm, rigid='chest'); parts.append(c)
        pa = L.rock(f'paul{x}', (0.52 * x, -0.02, 2.6), (0.22, 0.2, 0.09), armor, seed=40 + x, subdiv=2, rough=0.08)
        for pl in pa.data.polygons:
            pl.use_smooth = True
        L.paint(pa, lambda p, n: (*L.mix(L.lin('#3B2F63'), L.lin('#D8B45A'), 0.25 + 0.65 * L.smooth(0.2, 0.9, n.z)), 0.0))
        L.skin(pa, arm, rigid=f'shoulder.{"L" if x > 0 else "R"}'); parts.append(pa)

    # ไม้เท้า (มือขวา): ด้ามบิด + กรงเล็บ + ลูกแก้วเวท + ผลึกรอบลูกแก้ว
    wood = L.mat('Staff', '#FFFFFF', rough=0.55, vcol=True)
    sx, sy = -0.88, -0.5
    pts = [Vector((sx + 0.03 * math.sin(i * 1.3), sy + 0.03 * math.cos(i * 1.3), 0.15 + i * 0.2)) for i in range(17)]
    st = L.tube('staff', pts, [0.045] * 15 + [0.05, 0.06], wood, seg=8, cap=True)
    L.paint(st, lambda p, n: (*L.mix(L.lin('#140E1F'), L.lin('#4A3A66'), 0.4 + L.fbm(p * 14, 2)), 0.0))
    L.skin(st, arm, rigid='hand.R'); parts.append(st)
    top = pts[-1]
    claws = []
    for k in range(4):
        a = math.radians(45 + 90 * k)
        d = Vector((math.cos(a), math.sin(a), 0))
        c = L.horn(f'claw{k}', top, top + d * 0.2 + Vector((0, 0, 0.18)), top + d * 0.08 + Vector((0, 0, 0.42)), 0.035, armor, n=6, seg=6)
        L.paint(c, lambda p, n: (*L.mix(L.lin('#2A1F48'), L.lin('#C9A24A'), 0.6), 0.0))
        claws.append(c)
    orbm = L.mat('Orb', '#F5EDFF', rough=0.05, emission='#A855F7', strength=9)
    orb = L.ellipsoid('orb', top + Vector((0, 0, 0.26)), (0.13, 0.13, 0.13), orbm, seg=18, rings=10)
    shard = L.mat('Shard', '#E9D5FF', rough=0.1, emission='#9333EA', strength=4)
    for k in range(3):
        a = math.radians(k * 120 + 20)
        claws.append(L.crystal(f'orbs{k}', top + Vector((math.cos(a) * 0.26, math.sin(a) * 0.26, 0.3)), (math.cos(a), math.sin(a), 1.4), 0.2, 0.035, shard, sides=4))
    for c in claws + [orb]:
        L.skin(c, arm, rigid='hand.R')
    parts += claws + [orb]

    # วงอักขระลอยรอบตัว (2 วง เอียงต่างกัน) — เรืองแสง
    ringm = L.mat('RuneRing', '#B794F6', rough=0.3, emission='#8B5CF6', strength=2.6)
    for i, (z, r, tilt) in enumerate(((1.35, 1.05, 10), (2.25, 0.85, -14))):
        t = math.radians(tilt)
        pts = []
        for k in range(49):
            a = 2 * math.pi * k / 48
            x, y = math.cos(a) * r, math.sin(a) * r
            pts.append(Vector((x, y * math.cos(t), z + y * math.sin(t))))
        ring = L.tube(f'ring{i}', pts, 0.012, ringm, seg=5, cap=False)
        L.skin(ring, arm, rigid='spine' if i == 0 else 'chest'); parts.append(ring)
        for k in range(8):                                    # อักษรเป็นขีดสั้นบนวง
            a = 2 * math.pi * (k + 0.5) / 8
            c = Vector((math.cos(a) * r, math.sin(a) * r * math.cos(t), z + math.sin(a) * r * math.sin(t)))
            g = L.crystal(f'glyph{i}{k}', c, (math.cos(a), math.sin(a), 0.2), 0.12, 0.03, ringm, sides=3)
            L.skin(g, arm, rigid='spine' if i == 0 else 'chest'); parts.append(g)

    # ผลึกมืดลอยข้างไหล่ + เส้นเงาห้อยจากชายผ้า
    void = L.mat('VoidCrystal', '#FFFFFF', rough=0.15, vcol=True)
    for x, s in ((1, 'L'), (-1, 'R')):
        for k in range(2):
            c = L.crystal(f'vc{x}{k}', (1.05 * x, 0.15 + 0.15 * k, 2.75 - 0.35 * k), (0.2 * x, 0, 1), 0.42 - 0.1 * k, 0.09, void, sides=5)
            L.paint(c, lambda p, n: (*L.mix(L.lin('#0E0A1C'), L.lin('#8B5CF6'), L.smooth(2.4, 3.1, p.z) * 0.6 + 0.25 * max(0, n.z)), 0.4 if p.z > 2.9 else 0.0))
            L.skin(c, arm, rigid=f'shoulder.{s}'); parts.append(c)
    wisp = L.mat('Wisp', '#FFFFFF', rough=0.8, vcol=True)
    rw = random.Random(5)
    for k in range(10):
        a = 2 * math.pi * k / 10 + rw.uniform(-0.15, 0.15)
        base = Vector((math.cos(a) * 0.82, math.sin(a) * 0.75, 0.42))
        pts = L.bezier_pts(base, base + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, -0.18)), base + Vector((math.cos(a) * 0.05 + rw.uniform(-0.08, 0.08), math.sin(a) * 0.05, -0.38 - rw.uniform(0, 0.12))), 6)
        w = L.tube(f'wisp{k}', pts, [0.07 - 0.012 * i for i in range(6)], wisp, seg=6)
        L.paint(w, lambda p, n: (*L.mix(L.lin('#6D28D9'), L.lin('#120C24'), L.smooth(0.05, 0.4, p.z)), 0.5 * L.smooth(0.3, 0.05, p.z)))
        bone = 'robe.F' if math.sin(a) < -0.5 else 'robe.B' if math.sin(a) > 0.5 else ('robe.L' if math.cos(a) > 0 else 'robe.R')
        L.skin(w, arm, rigid=bone); parts.append(w)

    body_ob = L.join('ShadowArchmage', parts)
    _clips(arm, mage_clips(arm))
    return arm, body_ob


def mage_clips(arm):
    """ใช้ท่าสองขาเป็นฐาน (แขน/ลำตัว) + ท่าลอยตัวเฉพาะของจอมเวท: ลอยขึ้นลง · ชายผ้าพลิ้ว · ร่ายเวทสองมือ"""
    c = biped_clips(arm, heavy=0.5)
    P = lambda r=None, l=None, s=None: L.pose(arm, r or {}, l or {}, s or {})
    arms = lambda fx, sy: {'upper.L': [('X', fx), ('Y', -sy)], 'upper.R': [('X', fx), ('Y', sy)]}
    robe = lambda k: {'robe.F': [('X', 6 * k)], 'robe.B': [('X', -6 * k)], 'robe.L': [('Y', 5 * k)], 'robe.R': [('Y', -5 * k)]}
    idle = []
    for f, k in ((1, 0), (18, 1), (36, 0), (54, -1), (72, 0)):
        idle.append((f, P({'chest': [('X', -2)], 'head': [('Z', 5 * k), ('X', 3)], **arms(-10 - 3 * abs(k), 10), 'lower.L': [('X', -35)], 'lower.R': [('X', -5)], **robe(k)},
                          {'root': (0, 0, 0.1 + 0.08 * math.sin(math.pi * f / 36))})))
    enrage = []
    for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0)):
        enrage.append((f, P({'chest': [('X', -14), ('Z', 6 * k)], 'head': [('X', -18), ('Z', 8 * k)],
                             'upper.L': [('X', -100), ('Y', -60)], 'lower.L': [('X', -30)], 'upper.R': [('X', -110), ('Y', 30)], **robe(1.5 * k)},
                            {'root': (0, 0, 0.3 + 0.06 * abs(k))})))
    special = [(1, c['idle'][0][1]),
               (16, P({'chest': [('X', -20)], 'head': [('X', -22)], 'upper.L': [('X', -165), ('Y', -25)], 'upper.R': [('X', -165), ('Y', 25)], **robe(2)}, {'root': (0, 0, 0.6)})),
               (26, P({'chest': [('X', -24)], 'head': [('X', -26)], 'upper.L': [('X', -170), ('Y', -30)], 'upper.R': [('X', -170), ('Y', 30)], **robe(-2)}, {'root': (0, 0, 0.7)})),
               (33, P({'chest': [('X', 30)], 'spine': [('X', 10)], 'head': [('X', 15)], **arms(-75, 30), **robe(3)}, {'root': (0, -0.25, 0.2)})),
               (40, P({'chest': [('X', 32)], 'spine': [('X', 12)], 'head': [('X', 16)], **arms(-72, 28), **robe(2)}, {'root': (0, -0.25, 0.18)})),
               (52, c['idle'][0][1])]
    c.update({'idle': idle, 'enrage': enrage, 'special': special})
    return c


BUILDERS = {'forest': build_forest, 'inferno': build_inferno, 'frost': lambda: build_frost(False), 'frost-xmas': lambda: build_frost(True), 'shadow': build_shadow}
