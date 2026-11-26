"""
v1.27.1 World Raid — บอส 3D ชุดที่ 2 (เจ้าของขอ 25 พ.ย.: "เอาบอสไม่ซ้ำกันเลยสักเลเวล") · ปั้นด้วยโค้ดทั้งหมด ต้นฉบับ
  celestial  Celestial Dragon   — มังกรสวรรค์ตัวยาวขดกลางอากาศ เกล็ดทองขาว แผงขนคอ เขากวางทอง หนวดยาว ไข่มุกดาว ครีบดาวตามสันหลัง
  titan      Ancient Titan      — ยักษ์หินทรายโบราณ หน้ากากตาเดียว อักขระเรืองแสงฟ้าอมเขียว มอสบนบ่า แผ่นศิลาบนหลัง กระบองเสาหิน
  leviathan  Abyssal Leviathan  — อสูรทะเลโผล่จากน้ำวน คอยาวโค้ง หัวกว้างฟันแหลม ครีบหัว ครีบหลัง จุดเรืองแสงใต้ทะเล หนวดรอบตัว 4 เส้น
  phoenix    Eternal Phoenix    — นกไฟยักษ์ลอยตัว ปีกขนนกไล่สีแดง→ทอง หงอนขนนก หางยาวปลายขนรูปตา กรงเล็บ
  void       Void Emperor       — จักรพรรดิเกราะลอยตัว หมวกไร้หน้า หลุมดำกลางอก + วงแหวนพลังงาน มงกุฎหนามลอย ผ้าคลุม ดาบใหญ่ เศษบัลลังก์ลอยรอบตัว
  mythic     Mythic Ascension   — อัศวินสวรรค์ 4 ปีก เกราะขาว-ทอง รัศมีวงแหวนหลังศีรษะ หอกแสง
แต่ละตัวมีกระดูก/รูปร่างของตัวเอง + Animation 10 สถานะ (spawn · idle · prepare · attack · special · hit · stun · phase · enrage · death)
"""
import math
import random
from mathutils import Vector
import raidlib as L
from bosses import _clips, biped_clips, mage_clips


def _P(arm):
    return lambda r=None, l=None, s=None: L.pose(arm, r or {}, l or {}, s or {})


def _merge(a, b):
    out = dict(a)
    out.update(b)
    return out


def _rigid(parts, arm, ob, bone):
    L.skin(ob, arm, rigid=bone)
    parts.append(ob)
    return ob


# =====================================================================
# งูยาว (มังกรสวรรค์ / เลวีอาธาน): ท่าคลื่นตามลำตัว
# =====================================================================
def serpent_clips(arm, segs, axis_wave='Z', lift='root', float_z=0.0, tentacles=()):
    """segs = ชื่อกระดูกลำตัวจากโคน→หาง · หัว = head · ขากรรไกร = jaw · tentacles = [(t1, t2)]"""
    P = _P(arm)
    def body(phase, amp):
        r = {}
        for i, b in enumerate(segs):
            r[b] = [(axis_wave, amp * math.sin(phase + i * 0.9))]
        for j, (t1, t2) in enumerate(tentacles):
            r[t1] = [('X', 10 * math.sin(phase + j * 1.7)), ('Y', 8 * math.cos(phase + j))]
            r[t2] = [('X', 16 * math.sin(phase + j * 1.7 + 0.8))]
        return r
    def F(extra, ph=0.0, amp=4.0, loc=None, sc=None):
        base = body(ph, amp)
        for k, v in extra.items():
            base[k] = base.get(k, []) + v
        return P(base, loc or {}, sc or {})
    up = lambda z: {lift: (0, 0, float_z + z)}
    idle = [(f, F({'head': [('Z', 5 * math.sin(f / 72 * 2 * math.pi))], 'jaw': [('X', -3 * abs(math.sin(f / 36 * math.pi)))]},
                  ph=f / 72 * 2 * math.pi, amp=5, loc=up(0.08 * math.sin(f / 72 * 2 * math.pi)))) for f in (1, 18, 36, 54, 72)]
    rest = idle[0][1]
    roar = {'head': [('X', -22)], 'jaw': [('X', -35)]}
    spawn = [(1, F({'head': [('X', 30)]}, amp=0, loc=up(-4.0))), (20, F({'head': [('X', 15)]}, ph=1.0, amp=10, loc=up(-1.6))),
             (36, F(roar, ph=2.0, amp=8, loc=up(0.25))), (50, F(roar, ph=2.6, amp=6, loc=up(0.1))), (60, rest)]
    prepare = [(1, rest), (14, F({'head': [('X', -14)], 'jaw': [('X', -12)], segs[0]: [('X', -14)]}, ph=0.5, amp=6, loc={lift: (0, 0.35, float_z + 0.1)})),
               (24, F({'head': [('X', -16)], 'jaw': [('X', -16)], segs[0]: [('X', -16)]}, ph=0.7, amp=6, loc={lift: (0, 0.4, float_z + 0.1)}))]
    attack = [(1, prepare[-1][1]), (8, F({'head': [('X', 24)], 'jaw': [('X', -38)], segs[0]: [('X', 20)]}, ph=1.2, amp=3, loc={lift: (0, -0.6, float_z)})),
              (15, F({'head': [('X', 26)], 'jaw': [('X', -4)], segs[0]: [('X', 22)]}, ph=1.4, amp=3, loc={lift: (0, -0.6, float_z)})), (30, rest)]
    special = [(1, rest), (14, F(roar, ph=1.0, amp=12, loc=up(0.5))), (24, F({'head': [('X', -30)], 'jaw': [('X', -42)]}, ph=2.2, amp=14, loc=up(0.6))),
               (38, F({'head': [('X', 18)], 'jaw': [('X', -40)]}, ph=3.4, amp=10, loc={lift: (0, -0.3, float_z + 0.2)})), (48, rest)]
    hit = [(1, rest), (4, F({'head': [('X', -18), ('Z', 12)], 'jaw': [('X', -18)]}, ph=0.3, amp=8, loc={lift: (0, 0.2, float_z)})), (12, rest)]
    stun = [(f, F({'head': [('X', 28), ('Y', 14 * k)], 'jaw': [('X', -8)]}, ph=0.2 * k, amp=3, loc=up(-0.35))) for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0))]
    phase = [(1, rest), (14, F({'head': [('X', 30)]}, ph=0.0, amp=2, loc=up(-0.5))), (26, F({'head': [('X', 32)]}, ph=0.4, amp=2, loc=up(-0.55))),
             (38, F(roar, ph=2.0, amp=16, loc=up(0.6), sc={segs[0]: 1.05})), (52, F(roar, ph=2.6, amp=16, loc=up(0.6), sc={segs[0]: 1.05})), (60, rest)]
    enrage = [(f, F({'head': [('X', -10), ('Z', 10 * math.sin(f / 48 * 2 * math.pi))], 'jaw': [('X', -20 * abs(math.sin(f / 24 * math.pi)))]},
                    ph=f / 48 * 4 * math.pi, amp=11, loc=up(0.15))) for f in (1, 12, 24, 36, 48)]
    death = [(1, rest), (10, F(roar, ph=1.0, amp=14, loc=up(0.3))), (30, F({'head': [('X', 30)], 'jaw': [('X', -15)]}, ph=2.0, amp=6, loc=up(-1.0))),
             (54, F({'head': [('X', 40)], 'jaw': [('X', -20)]}, ph=2.4, amp=2, loc=up(-3.2))), (72, F({'head': [('X', 40)]}, ph=2.4, amp=0, loc=up(-4.2)))]
    return {'idle': idle, 'spawn': spawn, 'prepare': prepare, 'attack': attack, 'special': special, 'hit': hit, 'stun': stun, 'phase': phase, 'enrage': enrage, 'death': death}


# =====================================================================
# CELESTIAL DRAGON
# =====================================================================
def build_celestial():
    L.reset_scene()
    # เส้นลำตัวขดกลางอากาศ (หัวหันหน้า -Y)
    path = [Vector(p) for p in ((0, -1.05, 2.75), (0, -0.55, 2.2), (0.45, 0.0, 1.7), (0.95, 0.6, 1.55), (0.75, 1.25, 1.95), (0.0, 1.5, 2.45),
                                (-0.75, 1.2, 2.15), (-1.05, 0.55, 1.45), (-0.8, -0.05, 0.85), (-0.25, -0.35, 0.55))]
    names = ['neck', 'chest', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'tail']
    B = [('root', (0, 0, 0), (0, 0, 0.35), None)]
    par = {'neck': 'chest', 'chest': 'root', 'b3': 'chest', 'b4': 'b3', 'b5': 'b4', 'b6': 'b5', 'b7': 'b6', 'b8': 'b7', 'tail': 'b8'}
    for i, n in sorted(enumerate(names), key=lambda t: t[1] == 'neck'):
        a, b = (path[1], path[0]) if n == 'neck' else (path[i], path[i + 1])
        B.append((n, tuple(a), tuple(b), par[n]))
    B.sort(key=lambda t: 0 if t[0] in ('root', 'chest') else 1)
    head0 = path[0]
    B += [('head', tuple(head0), tuple(head0 + Vector((0, -0.62, -0.05))), 'neck'),
          ('jaw', tuple(head0 + Vector((0, -0.12, -0.12))), tuple(head0 + Vector((0, -0.6, -0.2))), 'head')]
    arm = L.armature('ARM_Boss', B)

    scale_m = L.mat('CelestScales', '#FFFFFF', rough=0.35, metal=0.35, vcol=True)
    els = []
    radii = [0.38, 0.46, 0.48, 0.47, 0.44, 0.39, 0.33, 0.26, 0.17, 0.07]
    for i in range(len(path) - 1):
        els += L.chain(path[i], path[i + 1], radii[i], radii[i + 1])
    # หัว: กะโหลก + จมูกยาว + สันคิ้ว
    h = head0
    els += [(h + Vector((0, -0.05, 0.05)), 0.34, (1.0, 1.1, 0.85)), (h + Vector((0, -0.45, -0.02)), 0.22, (0.85, 1.5, 0.6)),
            (h + Vector((0, -0.38, -0.18)), 0.17, (0.8, 1.45, 0.45)), (h + Vector((0, -0.12, 0.2)), 0.18, (1.5, 0.9, 0.45))]
    ob = L.blob('Body', els, resolution=0.05, voxel=0.034, material=scale_m)
    def scales(p):
        f1, f2 = L.cells(Vector((p.x * 11, p.y * 11, p.z * 11)))
        return L.smooth(0.0, 0.22, f2 - f1)
    L.displace(ob, lambda p, n: 0.012 * scales(p) - 0.006 + 0.006 * L.fbm(p * 3, 2))
    ob = L.decimate(ob, 0.34)
    def col(p, n):
        sc = scales(p)
        c = L.mix(L.lin('#B8862A'), L.lin('#FFE9A8'), 0.3 + 0.55 * sc + 0.2 * max(0.0, n.z))
        belly = L.smooth(-0.1, -0.7, n.z)
        c = L.mix(c, L.mix(L.lin('#FFF6DD'), L.lin('#F4D7A0'), sc), belly * 0.85)
        glow = 0.55 * L.smooth(0.75, 0.95, n.z) * (1 - sc)
        return (*L.mix(c, L.lin('#FFFBEB'), glow), glow)
    L.paint(ob, col)
    L.skin(ob, arm, bones=names + ['head', 'jaw'], falloff=0.09)
    parts = [ob]

    gold = L.mat('AntlerGold', '#FFD978', rough=0.25, metal=0.85, emission='#FFB52E', strength=0.4)
    eye = L.mat('StarEye', '#FFFFFF', rough=0.1, emission='#7FE3FF', strength=10)
    for x in (1, -1):
        _rigid(parts, arm, L.ellipsoid(f'eye{x}', h + Vector((0.17 * x, -0.32, 0.12)), (0.05, 0.075, 0.03), eye, seg=12, rings=8, rot=(0, 0, 20 * x)), 'head')
        # เขากวาง: ก้านหลัก + กิ่ง 2 กิ่ง
        b0 = h + Vector((0.14 * x, 0.02, 0.28)); mid = b0 + Vector((0.25 * x, 0.35, 0.35)); tip = b0 + Vector((0.32 * x, 0.85, 0.55))
        _rigid(parts, arm, L.horn(f'ant{x}', b0, mid, tip, 0.06, gold, n=10, seg=8), 'head')
        for k, t in enumerate((0.35, 0.65)):
            s = L.bezier_pts(b0, mid, tip, 11)[int(t * 10)]
            _rigid(parts, arm, L.horn(f'antb{x}{k}', s, s + Vector((0.15 * x, -0.05, 0.22)), s + Vector((0.18 * x, 0.05, 0.42)), 0.032, gold, n=6, seg=6), 'head')
        # หนวดยาวพลิ้ว
        w0 = h + Vector((0.1 * x, -0.62, -0.05))
        pts = [w0 + Vector((0.3 * x * t, 0.5 * t * t, -0.25 * math.sin(t * 2.6))) for t in [i / 9 * 1.6 for i in range(10)]]
        _rigid(parts, arm, L.tube(f'wh{x}', pts, [0.022 - 0.002 * i for i in range(10)], gold, seg=6), 'head')
    teeth = L.mat('CelTeeth', '#FFFDF4', rough=0.3)
    for i in range(5):
        for x in (1, -1):
            _rigid(parts, arm, L.cone(f'tooth{i}{x}', h + Vector((0.09 * x, -0.3 - i * 0.065, -0.14)), h + Vector((0.09 * x, -0.31 - i * 0.065, -0.24)), 0.016, teeth, seg=5), 'jaw')
    # แผงขนคอ (เส้นขนฟ้าขาวเรืองแสงอ่อน) + ครีบดาวตามสันหลัง
    mane = L.mat('Mane', '#FFFFFF', rough=0.6, emission='#BFE9FF', strength=0.6, vcol=True)
    rnd = random.Random(8)
    for i in range(16):
        t = i / 15
        seg_i = 0 if t < 0.5 else 1
        base = path[seg_i].lerp(path[seg_i + 1], (t * 2) % 1.0) + Vector((rnd.uniform(-0.1, 0.1), 0.05, 0.25))
        pts = L.bezier_pts(base, base + Vector((rnd.uniform(-0.3, 0.3), 0.35, 0.15)), base + Vector((rnd.uniform(-0.45, 0.45), 0.75, -0.1)), 6)
        m = L.tube(f'mane{i}', pts, [0.06, 0.055, 0.045, 0.035, 0.02, 0.006], mane, seg=6)
        L.paint(m, lambda q, n: (*L.mix(L.lin('#E9F7FF'), L.lin('#7FC8FF'), L.smooth(0, 0.6, (q - base).length)), 0.35))
        _rigid(parts, arm, m, 'neck' if seg_i == 0 else 'chest')
    star = L.mat('StarFin', '#FFF7D6', rough=0.15, emission='#FFE27A', strength=3)
    for i in range(2, len(path) - 1):
        a, b = path[i], path[i + 1]
        for k in (0.3, 0.75):
            c = a.lerp(b, k)
            d = (b - a).normalized()
            up = Vector((0, 0, 1)) - d * d.z
            _rigid(parts, arm, L.crystal(f'fin{i}{k}', c + up.normalized() * radii[i] * 0.85, up, 0.3 - 0.02 * i, 0.06, star, sides=4), names[min(i, len(names) - 1)])
    # 4 ขาเล็ก + กรงเล็บ · ไข่มุกดาวในกรงเล็บหน้า
    claw = L.mat('CelClaw', '#FFE9A8', rough=0.3, metal=0.6)
    for bn, i, side in (('chest', 2, 1), ('chest', 2, -1), ('b7', 7, 1), ('b7', 7, -1)):
        c = path[i] + Vector((0.25 * side, 0, -0.1))
        foot = c + Vector((0.25 * side, -0.25, -0.35))
        _rigid(parts, arm, L.tube(f'leg{bn}{side}', [c, c.lerp(foot, 0.5) + Vector((0.08 * side, 0, 0.08)), foot], [0.09, 0.07, 0.06], scale_m, seg=8), bn)
        for k in (-1, 0, 1):
            _rigid(parts, arm, L.cone(f'cl{bn}{side}{k}', foot + Vector((0.04 * k, -0.04, 0)), foot + Vector((0.05 * k, -0.16, -0.08)), 0.025, claw, seg=5), bn)
    pearl = L.mat('StarPearl', '#FFFFFF', rough=0.05, emission='#9BE8FF', strength=9)
    _rigid(parts, arm, L.ellipsoid('pearl', path[2] + Vector((0.5, -0.4, -0.38)), (0.15, 0.15, 0.15), pearl, seg=18, rings=10), 'chest')
    # ปลายหางขนพู่
    tail_tip = path[-1]
    for k in range(5):
        a = k / 5 * 2 * math.pi
        _rigid(parts, arm, L.tube(f'tuft{k}', L.bezier_pts(tail_tip, tail_tip + Vector((0.15 * math.cos(a), -0.2, 0.15 * math.sin(a))), tail_tip + Vector((0.3 * math.cos(a), -0.5, 0.25 * math.sin(a) - 0.1)), 5),
                                       [0.05, 0.045, 0.035, 0.02, 0.005], mane, seg=6), 'tail')
    # เมฆรองใต้ลำตัว (ผูก root)
    cloud = L.mat('Cloud', '#FFFFFF', rough=0.9, emission='#FFF3D6', strength=0.25, alpha=0.85)
    for k, (cx, cy, cz, s) in enumerate(((0.6, 0.6, 0.6, 0.55), (-0.5, 0.4, 0.35, 0.5), (0.1, 1.2, 0.9, 0.45), (-0.9, 1.0, 0.8, 0.4), (0.9, -0.2, 0.9, 0.38))):
        _rigid(parts, arm, L.rock(f'cloud{k}', (cx, cy, cz), (s * 1.4, s, s * 0.55), cloud, seed=90 + k, subdiv=3, rough=0.25), 'root')
    body_ob = L.join('CelestialDragon', parts)
    _clips(arm, serpent_clips(arm, ['chest', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'tail'], axis_wave='Z', float_z=0.0))
    return arm, body_ob


# =====================================================================
# ANCIENT TITAN
# =====================================================================
def build_titan():
    L.reset_scene()
    S = 1.18   # ตัวใหญ่กว่าโกเลม
    v = lambda x, y, z: (x * S, y * S, z * S)
    B = [('root', (0, 0, 0), (0, 0, 0.35), None), ('hips', v(0, 0.05, 1.0), v(0, 0.02, 1.45), 'root'), ('spine', v(0, 0.02, 1.45), v(0, -0.02, 1.95), 'hips'),
         ('chest', v(0, -0.02, 1.95), v(0, -0.1, 2.45), 'spine'), ('neck', v(0, -0.12, 2.45), v(0, -0.18, 2.6), 'chest'), ('head', v(0, -0.18, 2.6), v(0, -0.24, 3.0), 'neck')]
    for s, x in (('L', 1), ('R', -1)):
        B += [(f'shoulder.{s}', v(0.3 * x, -0.05, 2.3), v(0.85 * x, -0.05, 2.35), 'chest'), (f'upper.{s}', v(0.85 * x, -0.05, 2.35), v(1.05 * x, -0.15, 1.6), f'shoulder.{s}'),
              (f'lower.{s}', v(1.05 * x, -0.15, 1.6), v(1.1 * x, -0.35, 0.95), f'upper.{s}'), (f'hand.{s}', v(1.1 * x, -0.35, 0.95), v(1.1 * x, -0.42, 0.65), f'lower.{s}'),
              (f'thigh.{s}', v(0.36 * x, 0.05, 1.0), v(0.42 * x, 0.02, 0.52), 'hips'), (f'shin.{s}', v(0.42 * x, 0.02, 0.52), v(0.44 * x, 0.0, 0.08), f'thigh.{s}')]
    arm = L.armature('ARM_Boss', B)
    sand = L.mat('Sandstone', '#FFFFFF', rough=0.92, vcol=True)
    els = [(v(0, 0.05, 1.1), 0.46 * S, (1.15, 0.85, 0.8)), (v(0, 0, 1.6), 0.5 * S, (1.05, 0.8, 1.0)), (v(0, -0.05, 2.15), 0.62 * S, (1.5, 0.95, 0.85)),
           (v(0, -0.2, 2.78), 0.3 * S, (0.95, 1.0, 1.1))]
    for x in (1, -1):
        els += [(v(0.85 * x, -0.05, 2.38), 0.36 * S, None)]
        els += L.chain(v(0.85 * x, -0.05, 2.35), v(1.05 * x, -0.15, 1.6), 0.33 * S, 0.29 * S)
        els += L.chain(v(1.05 * x, -0.15, 1.6), v(1.1 * x, -0.35, 0.95), 0.3 * S, 0.33 * S)
        els += [(v(1.1 * x, -0.4, 0.8), 0.3 * S, (1.0, 1.0, 1.1))]
        els += L.chain(v(0.36 * x, 0.05, 1.0), v(0.44 * x, 0.0, 0.12), 0.36 * S, 0.32 * S)
        els += [(v(0.44 * x, -0.1, 0.1), 0.26 * S, (1.1, 1.5, 0.5))]
    ob = L.blob('Body', els, resolution=0.07, voxel=0.045, material=sand)
    def strata(p):
        return 0.5 + 0.5 * math.sin(p.z * 22 + 2.5 * L.fbm(p * 1.5, 2))
    def runes(p):
        if p.y > -0.15:
            return 0.0
        d = 9.0
        for cz in (1.7 * S, 2.15 * S):
            d = min(d, abs(Vector((p.x, 0, p.z - cz)).length - 0.16 * S))
        if abs(p.x) < 0.03 and 1.3 * S < p.z < 2.5 * S:
            d = 0.0
        d = min(d, abs(abs(p.x) - 0.42 * S) + max(0.0, abs(p.z - 1.95 * S) - 0.35))
        return 1.0 - L.smooth(0.008, 0.03, d)
    L.displace(ob, lambda p, n: -0.012 * (1 - L.smooth(0.0, 0.08, abs(math.sin(p.z * 9)))) + 0.02 * L.fbm(p * 4, 3) - 0.02 * runes(p))
    ob = L.decimate(ob, 0.42)
    def col(p, n):
        c = L.mix(L.lin('#7A5F3E'), L.lin('#D9B98A'), 0.35 + 0.4 * strata(p) + 0.25 * L.fbm(p * 3, 2))
        moss = L.smooth(0.55, 0.85, n.z) * L.smooth(0.3, 0.7, L.fbm(p * 2.5, 2) + 0.5) * (1 if p.z > 1.9 * S else 0.4)
        c = L.mix(c, L.mix(L.lin('#3F6B2A'), L.lin('#7FA34A'), L.fbm(p * 8, 2) + 0.5), moss * 0.85)
        g = runes(p)
        return (*L.mix(c, L.lin('#7FFFE4'), g), g)
    L.paint(ob, col)
    L.skin(ob, arm, falloff=0.14)
    parts = [ob]
    # หน้ากากหินตาเดียว + มงกุฎหินแตก
    mask = L.mat('Mask', '#FFFFFF', rough=0.6, metal=0.1, vcol=True)
    mk = L.rock('mask', v(0, -0.42, 2.82), (0.26 * S, 0.12 * S, 0.3 * S), mask, seed=3, subdiv=2, rough=0.08)
    L.paint(mk, lambda q, n: (*L.mix(L.lin('#5E5446'), L.lin('#CDBB98'), 0.4 + 0.5 * n.z * 0.5 + 0.3 * L.fbm(q * 6, 2)), 0.0))
    _rigid(parts, arm, mk, 'head')
    eye = L.mat('TitanEye', '#E6FFF9', rough=0.1, emission='#3DF5D0', strength=12)
    _rigid(parts, arm, L.ellipsoid('eye', v(0, -0.56, 2.86), (0.1, 0.03, 0.06), eye, seg=14, rings=8), 'head')
    for k in range(5):
        a = math.radians(-60 + k * 30)
        b = Vector(v(math.sin(a) * 0.26, -0.2 + math.cos(a) * 0.05, 3.02))
        _rigid(parts, arm, L.crystal(f'crown{k}', b, (math.sin(a) * 0.3, 0.1, 1), (0.42 - abs(k - 2) * 0.08) * S, 0.07 * S, mask, sides=4), 'head')
    # แผ่นศิลาจารึกบนหลัง (โมโนลิธ) + อักขระ
    slab = L.mat('Monolith', '#FFFFFF', rough=0.85, vcol=True)
    for k, (x, h, tilt) in enumerate(((0, 1.9, 0), (0.55, 1.4, -0.25), (-0.55, 1.3, 0.25))):
        m = L.rock(f'mono{k}', v(x, 0.62, 2.35 + h * 0.18), (0.22 * S, 0.12 * S, h * 0.5 * S), slab, seed=20 + k, subdiv=1, rough=0.05)
        m.rotation_euler = (0.25, tilt, 0)
        L.paint(m, lambda q, n: (*L.mix(L.lin('#3B3328'), L.lin('#8C7A5C'), 0.4 + L.fbm(q * 3, 2)), 0.6 * (1 - L.smooth(0.0, 0.04, abs(math.sin(q.z * 14)) * 0.2 + abs(q.x - x * S) * 0.15)) if abs(q.x - x * S) < 0.07 else 0.0))
        _rigid(parts, arm, m, 'chest')
    # บ่าหิน + แขนหินชิ้นเกราะ
    for x, s in ((1, 'L'), (-1, 'R')):
        pa = L.rock(f'paul{s}', v(0.9 * x, -0.02, 2.62), (0.42 * S, 0.4 * S, 0.24 * S), slab, seed=30 + x, subdiv=2, rough=0.15)
        L.paint(pa, lambda q, n: (*L.mix(L.mix(L.lin('#6A5640'), L.lin('#C9A877'), 0.5 + 0.4 * L.fbm(q * 3, 2)), L.lin('#5E8F3C'), L.smooth(0.6, 0.9, n.z) * 0.8), 0.0))
        _rigid(parts, arm, pa, f'shoulder.{s}')
        br = L.rock(f'brace{s}', v(1.08 * x, -0.3, 1.2), (0.3 * S, 0.3 * S, 0.24 * S), slab, seed=40 + x, subdiv=1, rough=0.1)
        L.paint(br, lambda q, n: (*L.mix(L.lin('#4A3E2E'), L.lin('#A88B5E'), 0.5 + 0.4 * L.fbm(q * 3, 2)), 0.0))
        _rigid(parts, arm, br, f'lower.{s}')
    # กระบองเสาหิน (มือขวา) + วงแหวนอักขระ
    col_m = L.mat('Pillar', '#FFFFFF', rough=0.8, vcol=True)
    hx, hy, hz = v(-1.1, -0.5, 0.75)
    pil = L.tube('pillar', [Vector((hx, hy, hz - 0.5)), Vector((hx, hy - 0.05, hz + 0.6)), Vector((hx, hy - 0.1, hz + 1.7))], [0.14, 0.16, 0.2], col_m, seg=10)
    L.paint(pil, lambda q, n: (*L.mix(L.lin('#8A7352'), L.lin('#E3CBA0'), 0.4 + 0.3 * abs(math.sin(math.atan2(q.y - hy, q.x - hx) * 5)) + 0.2 * L.fbm(q * 4, 2)), 0.0))
    _rigid(parts, arm, pil, 'hand.R')
    cap = L.rock('pcap', (hx, hy - 0.1, hz + 1.85), (0.38, 0.38, 0.3), col_m, seed=55, subdiv=2, rough=0.12)
    L.paint(cap, lambda q, n: (*L.mix(L.lin('#5A4A36'), L.lin('#B89C6E'), 0.5 + 0.4 * L.fbm(q * 3, 2)), 0.0))
    _rigid(parts, arm, cap, 'hand.R')
    ringm = L.mat('TitanRune', '#BFFFF2', rough=0.3, emission='#2EE6C0', strength=3)
    pts = [Vector((hx + math.cos(a) * 0.24, hy - 0.08 + math.sin(a) * 0.24, hz + 1.35)) for a in [i / 24 * 2 * math.pi for i in range(25)]]
    _rigid(parts, arm, L.tube('pring', pts, 0.025, ringm, seg=5, cap=False), 'hand.R')
    # หินลอยรอบตัว (เศษเมืองโบราณ)
    rnd = random.Random(4)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        r = L.rock(f'float{k}', (math.cos(a) * 1.7 * S, math.sin(a) * 1.0 * S + 0.3, rnd.uniform(1.4, 2.8) * S), (0.14, 0.12, 0.1), slab, seed=60 + k, subdiv=1, rough=0.3)
        L.paint(r, lambda q, n: (*L.mix(L.lin('#5A4A36'), L.lin('#C9A877'), 0.6), 0.0))
        _rigid(parts, arm, r, 'spine')
    body_ob = L.join('AncientTitan', parts)
    _clips(arm, biped_clips(arm, heavy=1.9))
    return arm, body_ob


# =====================================================================
# ABYSSAL LEVIATHAN
# =====================================================================
def build_leviathan():
    L.reset_scene()
    path = [Vector(p) for p in ((0, 0.55, -0.3), (0, 0.6, 0.55), (0, 0.35, 1.35), (0, -0.05, 2.05), (0, -0.45, 2.6), (0, -0.75, 2.85))]
    segs = ['b1', 'chest', 'b3', 'neck', 'neck2']
    par = {'b1': 'root', 'chest': 'b1', 'b3': 'chest', 'neck': 'b3', 'neck2': 'neck'}
    B = [('root', (0, 0, 0), (0, 0, 0.35), None)]
    for i, n in enumerate(segs):
        B.append((n, tuple(path[i]), tuple(path[i + 1]), par[n]))
    hd = path[-1]
    B += [('head', tuple(hd), tuple(hd + Vector((0, -0.8, -0.05))), 'neck2'), ('jaw', tuple(hd + Vector((0, -0.1, -0.2))), tuple(hd + Vector((0, -0.85, -0.35))), 'head')]
    tents = []
    for j, a in enumerate((35, 145, 215, 325)):
        r = math.radians(a)
        p0 = Vector((math.cos(r) * 1.7, math.sin(r) * 1.4 + 0.4, -0.2)); p1 = p0 + Vector((math.cos(r) * 0.25, math.sin(r) * 0.2, 1.1)); p2 = p1 + Vector((-math.cos(r) * 0.3, -math.sin(r) * 0.2, 0.9))
        B += [(f't{j}a', tuple(p0), tuple(p1), 'root'), (f't{j}b', tuple(p1), tuple(p2), f't{j}a')]
        tents.append((f't{j}a', f't{j}b', p0, p1, p2))
    arm = L.armature('ARM_Boss', B)
    skin_m = L.mat('DeepScales', '#FFFFFF', rough=0.38, metal=0.15, vcol=True)
    radii = [0.62, 0.58, 0.5, 0.42, 0.36, 0.34]
    els = []
    for i in range(len(path) - 1):
        els += L.chain(path[i], path[i + 1], radii[i], radii[i + 1])
    els += [(hd + Vector((0, -0.2, 0.02)), 0.56, (1.3, 1.2, 0.75)), (hd + Vector((0, -0.66, -0.02)), 0.4, (1.2, 1.35, 0.55)), (hd + Vector((0, -0.58, -0.32)), 0.34, (1.15, 1.4, 0.42))]
    ob = L.blob('Body', els, resolution=0.06, voxel=0.038, material=skin_m)
    def scales(p):
        f1, f2 = L.cells(Vector((p.x * 8, p.y * 8, p.z * 6)))
        return L.smooth(0.0, 0.25, f2 - f1)
    SPOTS = [Vector((0.38 * x, -0.1 + 0.2 * k, 0.6 + 0.45 * k)) for x in (1, -1) for k in range(4)]
    def spots(p):
        return max(0.0, 1 - min((p - s).length for s in SPOTS) / 0.08)
    L.displace(ob, lambda p, n: 0.014 * scales(p) - 0.007 + 0.01 * L.fbm(p * 2.5, 2))
    ob = L.decimate(ob, 0.34)
    def col(p, n):
        sc = scales(p)
        c = L.mix(L.lin('#0A2A44'), L.lin('#1F6E8C'), 0.3 + 0.5 * sc + 0.2 * max(0, n.z))
        belly = L.smooth(-0.05, -0.6, n.y) * L.smooth(-0.2, 0.3, -n.z + 0.3)
        c = L.mix(c, L.lin('#9FD8D0'), belly * 0.55)
        g = max(spots(p), 0.6 * L.smooth(0.82, 0.97, n.z) * (1 - sc) * (1 if p.z < 2.4 else 0))
        return (*L.mix(c, L.lin('#7CF6FF'), g), g)
    L.paint(ob, col)
    L.skin(ob, arm, bones=segs + ['head', 'jaw'], falloff=0.12)
    parts = [ob]
    eye = L.mat('AbyssEye', '#FFFFFF', rough=0.1, emission='#46F0FF', strength=11)
    teeth = L.mat('AbyssTeeth', '#EAF6F4', rough=0.3)
    fin = L.mat('Fin', '#FFFFFF', rough=0.3, emission='#38BDF8', strength=0.6, alpha=0.8, vcol=True)
    for x in (1, -1):
        _rigid(parts, arm, L.ellipsoid(f'eye{x}', hd + Vector((0.34 * x, -0.42, 0.16)), (0.07, 0.09, 0.05), eye, seg=12, rings=8, rot=(0, 0, 25 * x)), 'head')
        for i in range(7):
            _rigid(parts, arm, L.cone(f'tu{i}{x}', hd + Vector((0.24 * x * (1 - i * 0.08), -0.35 - i * 0.07, -0.22)), hd + Vector((0.24 * x * (1 - i * 0.08), -0.36 - i * 0.07, -0.37)), 0.025, teeth, seg=5), 'head')
            _rigid(parts, arm, L.cone(f'tl{i}{x}', hd + Vector((0.22 * x * (1 - i * 0.08), -0.38 - i * 0.07, -0.42)), hd + Vector((0.22 * x * (1 - i * 0.08), -0.39 - i * 0.07, -0.3)), 0.02, teeth, seg=5), 'jaw')
        # ครีบหัว (พัดสามก้าน)
        base = hd + Vector((0.4 * x, -0.05, 0.05))
        tips = [base + Vector((0.75 * x, 0.25, 0.45)), base + Vector((0.85 * x, 0.45, 0.05)), base + Vector((0.6 * x, 0.55, -0.3))]
        rows = []
        for i in range(6):
            u = i / 5
            row = []
            for j, tp in enumerate(tips):
                row.append(base.lerp(tp, u))
            rows.append(row)
        fm = L.membrane(f'hfin{x}', rows, fin)
        L.paint(fm, lambda q, n: (*L.mix(L.lin('#0E4A6E'), L.lin('#7CF6FF'), L.smooth(0.2, 0.9, (q - base).length)), 0.35))
        _rigid(parts, arm, fm, 'head')
        for tp in tips:
            _rigid(parts, arm, L.tube(f'fr{x}{tp.z:.2f}', [base, tp], [0.03, 0.01], teeth, seg=5), 'head')
    # ครีบหลังเป็นแผ่นสามเหลี่ยมเรียงตามคอ/หลัง
    for i in range(1, len(path) - 1):
        a, b = path[i], path[i + 1]
        for k in (0.2, 0.7):
            c = a.lerp(b, k)
            d = (b - a).normalized()
            back = Vector((0, 1, 0.2)).normalized()
            p0 = c + back * radii[i] * 0.8 - d * 0.12; p1 = c + back * radii[i] * 0.8 + d * 0.12; tip = c + back * (radii[i] + 0.45) - d * 0.05
            rows = [[p0.lerp(tip, u), p1.lerp(tip, u)] for u in (0, 0.5, 1.0)]
            fm = L.membrane(f'dfin{i}{k}', rows, fin)
            L.paint(fm, lambda q, n: (*L.lin('#2BA3D6'), 0.5))
            _rigid(parts, arm, fm, segs[min(i, len(segs) - 1)])
    # หนวด 4 เส้นโผล่จากน้ำ (มีปุ่มดูดเรืองแสง)
    tm = L.mat('Tentacle', '#FFFFFF', rough=0.4, vcol=True)
    for j, (ta, tb, p0, p1, p2) in enumerate(tents):
        pts = L.bezier_pts(p0, p1, p2, 12)
        t = L.tube(f'tent{j}', pts, [0.2 - 0.016 * i for i in range(12)], tm, seg=10)
        L.paint(t, lambda q, n: (*L.mix(L.lin('#0B3550'), L.lin('#2E8FB0'), 0.4 + 0.4 * L.fbm(q * 3, 2)), 0.45 * L.smooth(0.9, 1.0, abs(math.sin(q.z * 7)))))
        L.skin(t, arm, bones=[ta, tb], falloff=0.25)
        parts.append(t)
    # น้ำวนรอบฐาน (ผูก root)
    water = L.mat('Whirl', '#FFFFFF', rough=0.1, emission='#5EEAD4', strength=0.5, alpha=0.75, vcol=True)
    for k, (r, w) in enumerate(((1.0, 0.18), (1.45, 0.12), (2.0, 0.09))):
        pts = [Vector((math.cos(a) * r, math.sin(a) * r * 0.9 + 0.45, 0.05 + 0.04 * math.sin(a * 3 + k))) for a in [i / 40 * 2 * math.pi for i in range(41)]]
        ring = L.tube(f'whirl{k}', pts, w, water, seg=6, cap=False)
        L.paint(ring, lambda q, n: (*L.mix(L.lin('#1B6E8C'), L.lin('#E6FFFB'), L.smooth(0.0, 0.8, n.z)), 0.3))
        _rigid(parts, arm, ring, 'root')
    body_ob = L.join('AbyssalLeviathan', parts)
    _clips(arm, serpent_clips(arm, ['b1', 'chest', 'b3', 'neck', 'neck2'], axis_wave='Y', float_z=0.0, tentacles=[(t[0], t[1]) for t in tents]))
    return arm, body_ob


# =====================================================================
# ETERNAL PHOENIX
# =====================================================================
def phoenix_clips(arm):
    P = _P(arm)
    def flap(k, extra=None, loc=0.0, open_=1.0):
        r = {'wing.L': [('Y', -(10 + 28 * k) * open_)], 'wing.R': [('Y', (10 + 28 * k) * open_)], 'wingf.L': [('Y', -14 * k)], 'wingf.R': [('Y', 14 * k)],
             'tail1': [('X', 6 * k)], 'tail2': [('X', 10 * k)], 'leg.L': [('X', 10)], 'leg.R': [('X', 10)]}
        for kk, vv in (extra or {}).items():
            r[kk] = r.get(kk, []) + vv
        return P(r, {'root': (0, 0, loc)})
    idle = [(f, flap(math.sin(f / 24 * 2 * math.pi), {'head': [('Z', 6 * math.sin(f / 72 * 2 * math.pi))]}, loc=0.12 * math.sin(f / 24 * 2 * math.pi + 1.2))) for f in (1, 7, 13, 19, 25, 31, 37, 43, 49, 55, 61, 67, 73)]
    rest = idle[0][1]
    cry = {'neck': [('X', -20)], 'head': [('X', -25)], 'jaw': [('X', -30)]}
    spawn = [(1, flap(-1, {'neck': [('X', 40)]}, loc=4.5, open_=0.4)), (14, flap(1, {}, loc=2.4)), (26, flap(-1, {}, loc=1.0)), (38, flap(1.2, cry, loc=0.3)), (50, flap(1.1, cry, loc=0.2)), (60, rest)]
    prepare = [(1, rest), (14, flap(1.2, {'neck': [('X', -18)], 'head': [('X', -10)], 'chest': [('X', -12)]}, loc=0.5)), (24, flap(1.3, {'neck': [('X', -20)], 'head': [('X', -12)], 'chest': [('X', -14)]}, loc=0.6))]
    attack = [(1, prepare[-1][1]), (8, P({'wing.L': [('Y', 40)], 'wing.R': [('Y', -40)], 'neck': [('X', 28)], 'head': [('X', 18)], 'jaw': [('X', -30)], 'chest': [('X', 20)]}, {'root': (0, -0.7, 0.1)})),
              (15, P({'wing.L': [('Y', 35)], 'wing.R': [('Y', -35)], 'neck': [('X', 30)], 'head': [('X', 20)], 'chest': [('X', 22)]}, {'root': (0, -0.7, 0.1)})), (30, rest)]
    special = [(1, rest), (14, flap(1.6, cry, loc=0.8)), (22, flap(1.7, {'neck': [('X', -30)], 'head': [('X', -30)], 'jaw': [('X', -40)]}, loc=1.0)),
               (34, flap(-0.6, {'neck': [('X', 25)], 'head': [('X', 20)], 'jaw': [('X', -40)]}, loc=0.3)), (48, rest)]
    hit = [(1, rest), (4, flap(0.6, {'neck': [('X', -15), ('Z', 12)], 'head': [('X', -18)]}, loc=0.25)), (12, rest)]
    stun = [(f, flap(-0.5, {'neck': [('X', 30)], 'head': [('X', 25), ('Y', 12 * k)]}, loc=-0.35, open_=0.5)) for f, k in ((1, 0), (12, 1), (24, 0), (36, -1), (48, 0))]
    phase = [(1, rest), (14, flap(-0.8, {'neck': [('X', 35)]}, loc=-0.2, open_=0.6)), (26, flap(-0.9, {'neck': [('X', 38)]}, loc=-0.25, open_=0.6)),
             (38, flap(2.0, cry, loc=0.9)), (52, flap(2.1, cry, loc=1.0)), (60, rest)]
    enrage = [(f, flap(1.3 * math.sin(f / 12 * 2 * math.pi), {'head': [('Z', 10 * math.sin(f / 24 * math.pi))], 'jaw': [('X', -20 * abs(math.sin(f / 12 * math.pi)))]}, loc=0.3 + 0.15 * math.sin(f / 12 * 2 * math.pi)))
              for f in (1, 7, 13, 19, 25, 31, 37, 43, 48)]
    death = [(1, rest), (10, flap(1.8, cry, loc=0.6)), (28, flap(-0.6, {'neck': [('X', 30)]}, loc=-0.5, open_=0.6)),
             (52, P({'root': [('Y', 70)], 'wing.L': [('Y', 30)], 'wing.R': [('Y', -30)], 'neck': [('X', 40)], 'head': [('X', 25)]}, {'root': (0.3, 0, -1.3)})),
             (72, P({'root': [('Y', 80)], 'wing.L': [('Y', 35)], 'wing.R': [('Y', -35)], 'neck': [('X', 45)], 'head': [('X', 28)]}, {'root': (0.3, 0, -1.45)}))]
    return {'idle': idle, 'spawn': spawn, 'prepare': prepare, 'attack': attack, 'special': special, 'hit': hit, 'stun': stun, 'phase': phase, 'enrage': enrage, 'death': death}


def build_phoenix():
    L.reset_scene()
    B = [('root', (0, 0, 0), (0, 0, 0.35), None), ('hips', (0, 0.35, 1.55), (0, 0.05, 1.75), 'root'), ('chest', (0, 0.05, 1.75), (0, -0.3, 2.15), 'hips'),
         ('neck', (0, -0.3, 2.15), (0, -0.45, 2.75), 'chest'), ('head', (0, -0.45, 2.75), (0, -0.95, 2.78), 'neck'), ('jaw', (0, -0.6, 2.68), (0, -0.98, 2.6), 'head'),
         ('tail1', (0, 0.35, 1.55), (0, 1.1, 1.1), 'hips'), ('tail2', (0, 1.1, 1.1), (0, 1.9, 0.55), 'tail1')]
    for s, x in (('L', 1), ('R', -1)):
        B += [(f'wing.{s}', (0.28 * x, -0.05, 2.0), (1.4 * x, 0.15, 2.55), 'chest'), (f'wingf.{s}', (1.4 * x, 0.15, 2.55), (2.9 * x, 0.45, 2.75), f'wing.{s}'),
              (f'leg.{s}', (0.2 * x, 0.25, 1.35), (0.25 * x, 0.1, 0.75), 'hips')]
    arm = L.armature('ARM_Boss', B)
    feather_body = L.mat('PhoenixBody', '#FFFFFF', rough=0.55, vcol=True)
    els = [((0, 0.3, 1.55), 0.42, (0.95, 1.2, 0.95)), ((0, -0.05, 1.85), 0.46, (1.0, 1.05, 1.05)), ((0, -0.25, 2.1), 0.36, None)]
    els += L.chain((0, -0.3, 2.15), (0, -0.45, 2.7), 0.24, 0.18)
    els += [((0, -0.55, 2.78), 0.22, (0.95, 1.15, 0.95))]
    ob = L.blob('Body', els, resolution=0.05, voxel=0.032, material=feather_body)
    L.displace(ob, lambda p, n: 0.012 * math.sin(p.z * 40 + p.x * 12) * 0.6 + 0.008 * L.fbm(p * 6, 2))
    ob = L.decimate(ob, 0.4)
    def col(p, n):
        t = L.smooth(1.4, 2.8, p.z)
        c = L.mix(L.lin('#C2290E'), L.lin('#FFB21E'), t * 0.7 + 0.3 * max(0, -n.y))
        g = 0.02 + 0.08 * L.smooth(-0.2, -0.8, n.y)
        return (*L.mix(c, L.lin('#FFE6A0'), 0.4 * g), g)
    L.paint(ob, col)
    L.skin(ob, arm, bones=['hips', 'chest', 'neck', 'head'], falloff=0.12)
    parts = [ob]
    beak = L.mat('Beak', '#FFE08A', rough=0.25, metal=0.6)
    _rigid(parts, arm, L.cone('beakU', (0, -0.68, 2.8), (0, -1.08, 2.7), 0.09, beak, seg=8), 'head')
    _rigid(parts, arm, L.cone('beakL', (0, -0.66, 2.7), (0, -0.98, 2.64), 0.06, beak, seg=8), 'jaw')
    eye = L.mat('PhoenixEye', '#FFFFFF', rough=0.1, emission='#FFF2B0', strength=10)
    for x in (1, -1):
        _rigid(parts, arm, L.ellipsoid(f'eye{x}', (0.13 * x, -0.66, 2.85), (0.035, 0.05, 0.025), eye, seg=10, rings=6, rot=(0, 0, 25 * x)), 'head')
    flame = L.mat('Plume', '#FFFFFF', rough=0.4, emission='#FF8A1A', strength=2.2, vcol=True)
    def feather(name, base, tipv, width, bone, ca='#D62A10', cb='#FFD45A'):
        d = (tipv - base)
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side = side.normalized() * width
        rows = []
        for i in range(6):
            u = i / 5
            w = math.sin(u * math.pi) ** 0.7 * (1 - 0.3 * u) + (0.15 if i == 0 else 0)
            c = base.lerp(tipv, u)
            rows.append([c - side * w, c, c + side * w])
        fm = L.membrane(name, rows, flame)
        L.paint(fm, lambda q, n: (*L.mix(L.lin(ca), L.lin(cb), L.smooth(0.1, 0.9, (q - base).length / max(d.length, 1e-3))), 0.12 + 0.45 * L.smooth(0.5, 1.0, (q - base).length / max(d.length, 1e-3))))
        L.skin(fm, arm, rigid=bone)
        parts.append(fm)
    # ปีก: ขนปีกหลัก (บนกระดูกปลายปีก) + ขนปีกรอง (บนกระดูกต้นปีก) ไล่เป็นพัด
    for x, s in ((1, 'L'), (-1, 'R')):
        sh = Vector((0.28 * x, -0.05, 2.0)); el = Vector((1.4 * x, 0.15, 2.55)); tip = Vector((2.9 * x, 0.45, 2.75))
        parts.append(L.tube(f'wbone{s}', [sh, el, tip], [0.09, 0.07, 0.03], feather_body, seg=8))
        L.paint(parts[-1], lambda q, n: (*L.lin('#E0461A'), 0.3))
        L.skin(parts[-1], arm, bones=[f'wing.{s}', f'wingf.{s}'])
        for k in range(9):
            u = k / 8
            base = el.lerp(tip, u)
            ang = math.radians(-20 - 70 * (1 - u))
            dirv = Vector((math.cos(ang) * x * 0.3, 0.6 + 0.4 * (1 - u), math.sin(ang))).normalized()
            feather(f'prim{s}{k}', base, base + dirv * (1.3 - 0.3 * abs(u - 0.6)), 0.16, f'wingf.{s}')
        for k in range(7):
            u = k / 6
            base = sh.lerp(el, u)
            dirv = Vector((0.1 * x, 0.55, -0.85)).normalized()
            feather(f'sec{s}{k}', base, base + dirv * (0.8 + 0.3 * u), 0.15, f'wing.{s}', ca='#B81E0E', cb='#FF9A2E')
    # หาง: ขนยาว 5 เส้น ปลายรูปตา (ดวงเรืองแสง)
    eyem = L.mat('TailEye', '#FFFFFF', rough=0.2, emission='#FFE27A', strength=6)
    for k in range(5):
        a = (k - 2) * 0.28
        base = Vector((0, 0.4, 1.5))
        mid = Vector((math.sin(a) * 0.7, 1.4, 1.0)); end = Vector((math.sin(a) * 1.3, 2.4 + 0.15 * abs(k - 2), 0.35 - 0.1 * abs(k - 2)))
        pts = L.bezier_pts(base, mid, end, 10)
        t = L.tube(f'tail{k}', pts, [0.06 - 0.004 * i for i in range(10)], flame, seg=6)
        L.paint(t, lambda q, n: (*L.mix(L.lin('#C2290E'), L.lin('#FFB21E'), L.smooth(0.5, 2.4, q.y)), 0.5))
        L.skin(t, arm, bones=['tail1', 'tail2'], falloff=0.3); parts.append(t)
        _rigid(parts, arm, L.ellipsoid(f'teye{k}', end, (0.16, 0.05, 0.2), eyem, seg=12, rings=8, rot=(0, math.degrees(a), 0)), 'tail2')
    # หงอนขนนก + กรงเล็บ
    for k in range(5):
        a = (k - 2) * 0.22
        b = Vector((math.sin(a) * 0.08, -0.5, 2.95))
        feather(f'crest{k}', b, b + Vector((math.sin(a) * 0.35, 0.45, 0.55 - 0.08 * abs(k - 2))), 0.07, 'head', ca='#FF6A1A', cb='#FFF2B0')
    talon = L.mat('Talon', '#2A1610', rough=0.3, metal=0.4)
    for x, s in ((1, 'L'), (-1, 'R')):
        _rigid(parts, arm, L.tube(f'leg{s}', [Vector((0.2 * x, 0.25, 1.35)), Vector((0.25 * x, 0.1, 0.78))], [0.06, 0.05], beak, seg=8), f'leg.{s}')
        for k in (-1, 0, 1):
            f0 = Vector((0.25 * x, 0.1, 0.76))
            _rigid(parts, arm, L.horn(f'tal{s}{k}', f0, f0 + Vector((0.08 * k, -0.15, -0.05)), f0 + Vector((0.1 * k, -0.22, -0.18)), 0.03, talon, n=5, seg=5), f'leg.{s}')
    body_ob = L.join('EternalPhoenix', parts)
    _clips(arm, phoenix_clips(arm))
    return arm, body_ob


# =====================================================================
# VOID EMPEROR
# =====================================================================
def build_void():
    L.reset_scene()
    B = [('root', (0, 0, 0), (0, 0, 0.35), None), ('hips', (0, 0, 1.25), (0, 0, 1.7), 'root'), ('spine', (0, 0, 1.7), (0, -0.03, 2.15), 'hips'),
         ('chest', (0, -0.03, 2.15), (0, -0.06, 2.65), 'spine'), ('neck', (0, -0.06, 2.65), (0, -0.1, 2.85), 'chest'), ('head', (0, -0.1, 2.85), (0, -0.16, 3.3), 'neck'),
         ('robe.F', (0, -0.25, 1.25), (0, -0.4, 0.45), 'hips'), ('robe.B', (0, 0.3, 2.4), (0, 0.7, 0.4), 'chest')]
    for s, x in (('L', 1), ('R', -1)):
        B += [(f'shoulder.{s}', (0.22 * x, -0.05, 2.55), (0.62 * x, -0.04, 2.52), 'chest'), (f'upper.{s}', (0.62 * x, -0.04, 2.52), (0.82 * x, -0.14, 1.98), f'shoulder.{s}'),
              (f'lower.{s}', (0.82 * x, -0.14, 1.98), (0.9 * x, -0.4, 1.55), f'upper.{s}'), (f'hand.{s}', (0.9 * x, -0.4, 1.55), (0.92 * x, -0.5, 1.33), f'lower.{s}'),
              (f'robe.{s}', (0.32 * x, 0, 1.25), (0.6 * x, 0, 0.45), 'hips')]
    arm = L.armature('ARM_Boss', B)
    plate = L.mat('VoidArmor', '#FFFFFF', rough=0.28, metal=0.85, vcol=True)
    els = [((0, 0, 2.25), 0.5, (1.35, 0.85, 1.0)), ((0, 0, 1.75), 0.4, (1.05, 0.8, 1.0)), ((0, 0, 1.35), 0.42, (1.15, 0.9, 0.8)),
           ((0, -0.1, 3.05), 0.3, (0.85, 1.0, 1.25)), ((0, -0.05, 2.75), 0.18, None)]
    for x in (1, -1):
        els += [((0.62 * x, -0.02, 2.55), 0.3, (1.1, 1.0, 0.85))]
        els += L.chain((0.64 * x, -0.04, 2.48), (0.82 * x, -0.14, 1.98), 0.17, 0.15)
        els += L.chain((0.82 * x, -0.14, 1.98), (0.9 * x, -0.4, 1.55), 0.15, 0.19)
        els += [((0.91 * x, -0.45, 1.42), 0.17, (1.0, 1.1, 0.9))]
    # กระโปรงเกราะแผ่นซ้อนลงไปเป็นปลายแหลมลอย
    for i, (z, r) in enumerate(((1.15, 0.5), (0.95, 0.56), (0.75, 0.6), (0.58, 0.55))):
        els.append(((0, 0.02, z), r, (1.2, 0.95, 0.5)))
    ob = L.blob('Body', els, resolution=0.055, voxel=0.036, material=plate)
    def plates(p):
        return 1 - L.smooth(0.0, 0.02, abs(math.sin(p.z * 11 + 0.4 * math.sin(p.x * 5))) * 0.12)
    CORE = Vector((0, -0.42, 2.25))
    L.displace(ob, lambda p, n: -0.02 * plates(p) - 0.2 * max(0.0, 1 - (p - CORE).length / 0.3) ** 1.5 + 0.006 * L.fbm(p * 8, 2) - 0.12 * max(0.0, 1 - (Vector((p.x * 1.2, (p.y + 0.4) * 2.0, p.z - 3.05))).length / 0.25))
    ob = L.decimate(ob, 0.42)
    def col(p, n):
        c = L.mix(L.lin('#0B0A18'), L.lin('#2E2C52'), 0.35 + 0.35 * max(0, n.z) + 0.3 * L.fbm(p * 4, 2))
        edge = plates(p)
        c = L.mix(c, L.lin('#5A60C8'), edge * 0.45)
        face = max(0.0, 1 - (Vector((p.x * 1.2, (p.y + 0.4) * 2.0, p.z - 3.05))).length / 0.26)
        c = L.mix(c, L.lin('#000000'), min(1.0, face * 3))
        trim = (1 - L.smooth(0.0, 0.03, abs(abs(p.x) - 0.32) - 0.02)) * (1 if p.y < -0.2 and 1.4 < p.z < 2.6 else 0)
        c = L.mix(c, L.lin('#C9CCF5'), trim * 0.8)
        g = edge * 0.22 + trim * 0.2
        return (*c, g)
    L.paint(ob, col)
    L.skin(ob, arm, bones=['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'shoulder.R', 'upper.L', 'upper.R', 'lower.L', 'lower.R', 'hand.L', 'hand.R', 'robe.F', 'robe.L', 'robe.R'], falloff=0.12)
    parts = [ob]
    # หลุมดำกลางอก: ทรงกลมดำสนิท + จานพลังงาน 2 วง + ตาว่างเปล่าในหมวก
    black = L.mat('Singularity', '#000000', rough=1.0)
    _rigid(parts, arm, L.ellipsoid('core', CORE + Vector((0, 0.05, 0)), (0.17, 0.17, 0.17), black, seg=18, rings=10), 'chest')
    disk = L.mat('Accretion', '#E0E7FF', rough=0.2, emission='#818CF8', strength=6)
    for k, (r, tilt) in enumerate(((0.3, 70), (0.4, 110))):
        t = math.radians(tilt)
        pts = [CORE + Vector((math.cos(a) * r, math.sin(a) * r * math.cos(t), math.sin(a) * r * math.sin(t))) for a in [i / 32 * 2 * math.pi for i in range(33)]]
        _rigid(parts, arm, L.tube(f'disk{k}', pts, 0.02, disk, seg=5, cap=False), 'chest')
    eye = L.mat('NullEye', '#FFFFFF', rough=0.1, emission='#A5B4FC', strength=9)
    for x in (1, -1):
        _rigid(parts, arm, L.ellipsoid(f'eye{x}', (0.09 * x, -0.33, 3.08), (0.05, 0.015, 0.012), eye, seg=10, rings=6, rot=(0, 0, -8 * x)), 'head')
    # มงกุฎหนามลอยเหนือหัว
    crown = L.mat('VoidCrown', '#F5F3FF', rough=0.15, emission='#6366F1', strength=3)
    for k in range(9):
        a = 2 * math.pi * k / 9
        b = Vector((math.cos(a) * 0.32, -0.1 + math.sin(a) * 0.28, 3.55))
        _rigid(parts, arm, L.crystal(f'cr{k}', b, (math.cos(a) * 0.25, math.sin(a) * 0.25, 1), 0.42 if k % 2 == 0 else 0.28, 0.045, crown, sides=4), 'head')
    pts = [Vector((math.cos(a) * 0.34, -0.1 + math.sin(a) * 0.3, 3.5)) for a in [i / 30 * 2 * math.pi for i in range(31)]]
    _rigid(parts, arm, L.tube('crownring', pts, 0.018, crown, seg=5, cap=False), 'head')
    # บ่าเกราะหนามใหญ่
    for x, s in ((1, 'L'), (-1, 'R')):
        pa = L.rock(f'paul{s}', (0.68 * x, -0.02, 2.72), (0.32, 0.3, 0.16), plate, seed=70 + x, subdiv=2, rough=0.06)
        for pl in pa.data.polygons:
            pl.use_smooth = True
        L.paint(pa, lambda q, n: (*L.mix(L.lin('#141230'), L.lin('#6D72C8'), 0.2 + 0.6 * L.smooth(0.3, 0.95, n.z)), 0.2))
        _rigid(parts, arm, pa, f'shoulder.{s}')
        for k in range(3):
            _rigid(parts, arm, L.crystal(f'pspike{s}{k}', (0.62 * x + 0.12 * k * x, 0.05 - 0.08 * k, 2.82), (0.5 * x, 0.2, 1), 0.45 - 0.1 * k, 0.05, crown, sides=4), f'shoulder.{s}')
    # ผ้าคลุมยาวด้านหลัง (ผืนเดียว ปลายขาดเป็นเศษดาว)
    cape = L.mat('Cape', '#FFFFFF', rough=0.7, vcol=True)
    rows = []
    for i in range(9):
        u = i / 8
        row = []
        for j in range(9):
            t = j / 8
            x = (t - 0.5) * (0.9 + 1.2 * u)
            row.append(Vector((x, 0.32 + 0.45 * u + 0.08 * math.sin(t * 6 + u * 3), 2.55 - 2.15 * u - (0.12 * math.sin(t * 9) * u if i == 8 else 0))))
        rows.append(row)
    cp = L.membrane('cape', rows, cape)
    L.paint(cp, lambda q, n: (*L.mix(L.lin('#2A1E5C'), L.lin('#05040C'), L.smooth(0.5, 2.4, 2.6 - q.z)), 0.35 * L.smooth(0.4, 0.9, L.fbm(q * 5, 2) + 0.5) * L.smooth(1.2, 0.4, q.z)))
    L.skin(cp, arm, bones=['robe.B', 'chest'], falloff=0.4)
    parts.append(cp)
    # ดาบใหญ่ (มือขวา) ใบดาบเป็นแก้วสีดำขอบแสง
    blade = L.mat('VoidBlade', '#FFFFFF', rough=0.1, metal=0.5, vcol=True)
    hx, hy, hz = -0.92, -0.55, 1.4
    hilt = L.tube('hilt', [Vector((hx, hy, hz - 0.3)), Vector((hx, hy, hz + 0.25))], [0.04, 0.04], plate, seg=8)
    L.paint(hilt, lambda q, n: (*L.lin('#C9CCF5'), 0.2)); _rigid(parts, arm, hilt, 'hand.R')
    guard = L.crystal('guard', (hx - 0.32, hy, hz + 0.25), (1, 0, 0.05), 0.64, 0.06, crown, sides=4)
    _rigid(parts, arm, guard, 'hand.R')
    bl = L.crystal('blade', (hx, hy, hz + 0.28), (0, -0.05, 1), 2.0, 0.13, blade, sides=4, tilt=math.pi / 4)
    L.paint(bl, lambda q, n: (*L.mix(L.lin('#07060F'), L.lin('#A5B4FC'), L.smooth(0.6, 1.0, abs(n.x) + abs(n.y))), 0.5 * L.smooth(0.6, 1.0, abs(n.x) + abs(n.y))))
    _rigid(parts, arm, bl, 'hand.R')
    # เศษบัลลังก์ลอยรอบตัว
    shard = L.mat('ThroneShard', '#FFFFFF', rough=0.35, metal=0.6, vcol=True)
    rnd = random.Random(12)
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.4
        r = L.rock(f'throne{k}', (math.cos(a) * 1.55, math.sin(a) * 1.1 + 0.3, rnd.uniform(0.6, 2.8)), (rnd.uniform(0.16, 0.26), 0.12, rnd.uniform(0.2, 0.35)), shard, seed=80 + k, subdiv=1, rough=0.05)
        L.paint(r, lambda q, n: (*L.mix(L.lin('#141230'), L.lin('#C9A24A'), 0.25 + 0.5 * L.smooth(0.4, 0.95, n.z)), 0.0))
        _rigid(parts, arm, r, 'spine')
    body_ob = L.join('VoidEmperor', parts)
    _clips(arm, mage_clips(arm))
    return arm, body_ob


# =====================================================================
# MYTHIC ASCENSION (อัศวินสวรรค์ 4 ปีก)
# =====================================================================
def build_mythic():
    L.reset_scene()
    B = [('root', (0, 0, 0), (0, 0, 0.35), None), ('hips', (0, 0.02, 1.15), (0, 0.0, 1.55), 'root'), ('spine', (0, 0.0, 1.55), (0, -0.02, 2.0), 'hips'),
         ('chest', (0, -0.02, 2.0), (0, -0.05, 2.45), 'spine'), ('neck', (0, -0.06, 2.45), (0, -0.08, 2.62), 'chest'), ('head', (0, -0.08, 2.62), (0, -0.1, 3.0), 'neck')]
    for s, x in (('L', 1), ('R', -1)):
        B += [(f'shoulder.{s}', (0.2 * x, -0.03, 2.36), (0.55 * x, -0.03, 2.36), 'chest'), (f'upper.{s}', (0.55 * x, -0.03, 2.36), (0.7 * x, -0.1, 1.85), f'shoulder.{s}'),
              (f'lower.{s}', (0.7 * x, -0.1, 1.85), (0.76 * x, -0.32, 1.45), f'upper.{s}'), (f'hand.{s}', (0.76 * x, -0.32, 1.45), (0.78 * x, -0.4, 1.25), f'lower.{s}'),
              (f'thigh.{s}', (0.22 * x, 0.02, 1.15), (0.26 * x, 0.0, 0.62), 'hips'), (f'shin.{s}', (0.26 * x, 0.0, 0.62), (0.27 * x, 0.02, 0.1), f'thigh.{s}'),
              (f'wingU.{s}', (0.18 * x, 0.25, 2.3), (1.3 * x, 0.55, 3.15), 'chest'), (f'wingD.{s}', (0.18 * x, 0.25, 1.95), (1.25 * x, 0.6, 1.3), 'chest')]
    arm = L.armature('ARM_Boss', B)
    armor = L.mat('HolyArmor', '#FFFFFF', rough=0.22, metal=0.8, vcol=True)
    els = [((0, 0, 2.15), 0.5, (1.35, 0.85, 1.05)), ((0, 0, 1.65), 0.38, (1.05, 0.8, 1.0)), ((0, 0.01, 1.25), 0.4, (1.2, 0.85, 0.8)), ((0, -0.08, 2.82), 0.25, (0.88, 0.98, 1.15))]
    for x in (1, -1):
        els += [((0.56 * x, -0.02, 2.38), 0.27, (1.1, 1.0, 0.85))]
        els += L.chain((0.56 * x, -0.03, 2.33), (0.7 * x, -0.1, 1.85), 0.17, 0.15)
        els += L.chain((0.7 * x, -0.1, 1.85), (0.76 * x, -0.32, 1.45), 0.15, 0.17)
        els += L.chain((0.22 * x, 0.02, 1.15), (0.26 * x, 0.0, 0.62), 0.22, 0.17)
        els += L.chain((0.26 * x, 0.0, 0.62), (0.27 * x, 0.02, 0.12), 0.17, 0.15)
        els += [((0.27 * x, -0.06, 0.08), 0.12, (1.0, 1.6, 0.55))]
    ob = L.blob('Body', els, resolution=0.045, voxel=0.03, material=armor)
    def seams(p):
        return 1 - L.smooth(0.0, 0.02, abs(math.sin(p.z * 13)) * 0.1 + abs(math.sin(p.x * 7)) * 0.02)
    VIS = Vector((0, -0.3, 2.85))
    L.displace(ob, lambda p, n: -0.012 * seams(p) - 0.06 * max(0.0, 1 - (Vector((p.x * 0.6, (p.y - VIS.y) * 2, (p.z - VIS.z) * 3))).length / 0.12))
    ob = L.decimate(ob, 0.45)
    def col(p, n):
        c = L.mix(L.lin('#8F86A8'), L.lin('#F4F0FA'), 0.35 + 0.5 * max(0, n.z))
        gold = seams(p)
        c = L.mix(c, L.lin('#E7B94C'), gold * 0.85)
        tab = 1.0 if (p.y < -0.25 and abs(p.x) < 0.14 and 1.7 < p.z < 2.3) else 0.0   # ตราอกสีม่วงทอง
        c = L.mix(c, L.lin('#C026D3'), tab * 0.75)
        visor = max(0.0, 1 - (Vector((p.x * 0.6, (p.y - VIS.y) * 2, (p.z - VIS.z) * 3))).length / 0.12) if p.y < -0.2 else 0.0
        c = L.mix(c, L.lin('#FAE8FF'), min(1.0, visor * 2))
        g = max(visor, gold * 0.35, tab * 0.25 * L.smooth(0.3, 0.9, abs(math.sin(p.z * 18))))
        return (*c, g)
    L.paint(ob, col)
    L.skin(ob, arm, bones=[b[0] for b in B if not b[0].startswith('wing')], falloff=0.1)
    parts = [ob]
    # รัศมีวงแหวนหลังศีรษะ + ซี่แสง
    halo = L.mat('Halo', '#FFF7E0', rough=0.1, emission='#F0ABFC', strength=6)
    hc = Vector((0, 0.32, 3.05))
    pts = [hc + Vector((math.cos(a) * 0.55, 0, math.sin(a) * 0.55)) for a in [i / 40 * 2 * math.pi for i in range(41)]]
    _rigid(parts, arm, L.tube('halo', pts, 0.03, halo, seg=6, cap=False), 'head')
    for k in range(12):
        a = 2 * math.pi * k / 12
        _rigid(parts, arm, L.crystal(f'ray{k}', hc + Vector((math.cos(a) * 0.6, 0, math.sin(a) * 0.6)), (math.cos(a), 0, math.sin(a)), 0.22 if k % 2 else 0.34, 0.03, halo, sides=4), 'head')
    # ยอดหมวก + บ่าเกราะซ้อน
    _rigid(parts, arm, L.crystal('crest', (0, -0.05, 3.05), (0, 0.4, 1), 0.45, 0.05, armor, sides=4), 'head')
    for x, s in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            pa = L.rock(f'paul{s}{k}', (0.58 * x, -0.02 + 0.03 * k, 2.55 - 0.1 * k), (0.24 - 0.03 * k, 0.22, 0.09), armor, seed=50 + k + (5 if x > 0 else 0), subdiv=2, rough=0.04)
            for pl in pa.data.polygons:
                pl.use_smooth = True
            L.paint(pa, lambda q, n: (*L.mix(L.lin('#FFFFFF'), L.lin('#E7B94C'), 0.6 * L.smooth(0.4, 0.0, n.z)), 0.1))
            _rigid(parts, arm, pa, f'shoulder.{s}')
    # 4 ปีก: ขนปีกเป็นแผ่นใบมีดแสง เรียงพัด
    blade = L.mat('WingBlade', '#FFFFFF', rough=0.2, emission='#F5D0FE', strength=1.6, alpha=0.9, vcol=True)
    for x, s in ((1, 'L'), (-1, 'R')):
        for wn, root, tipv, n_f, length in ((f'wingU.{s}', Vector((0.18 * x, 0.25, 2.3)), Vector((1.3 * x, 0.55, 3.15)), 8, 1.1), (f'wingD.{s}', Vector((0.18 * x, 0.25, 1.95)), Vector((1.25 * x, 0.6, 1.3)), 6, 0.8)):
            parts.append(L.tube(f'wb{wn}', [root, root.lerp(tipv, 0.5) + Vector((0, 0.05, 0.1)), tipv], [0.06, 0.045, 0.02], armor, seg=8))
            L.paint(parts[-1], lambda q, n: (*L.lin('#E7B94C'), 0.3)); L.skin(parts[-1], arm, rigid=wn)
            for k in range(n_f):
                u = (k + 1) / n_f
                b = root.lerp(tipv, u)
                outv = (tipv - root).normalized()
                dirv = (outv * 0.75 + Vector((0, 0.12, -0.55 if 'U' in wn else -0.25))).normalized()
                ln = length * (0.55 + 0.45 * u)
                side = dirv.cross(Vector((0, 1, 0))).normalized() * 0.13
                rows = []
                for i in range(5):
                    t = i / 4
                    c = b + dirv * ln * t
                    w = (1 - t) ** 0.6 * (0.6 + 0.4 * math.sin(t * math.pi))
                    rows.append([c - side * w, c, c + side * w])
                fm = L.membrane(f'f{wn}{k}', rows, blade)
                L.paint(fm, lambda q, n, b=b, ln=ln: (*L.mix(L.lin('#FFD978'), L.lin('#D946EF'), L.smooth(0.15, 0.9, (q - b).length / ln)), 0.3 + 0.5 * L.smooth(0.5, 1.0, (q - b).length / ln)))
                L.skin(fm, arm, rigid=wn); parts.append(fm)
    # หอกแสง (มือขวา) + โล่ (มือซ้าย)
    hx, hy, hz = -0.78, -0.45, 1.3
    shaft = L.tube('spear', [Vector((hx, hy + 0.05, hz - 1.1)), Vector((hx, hy, hz + 0.4)), Vector((hx, hy - 0.05, hz + 1.6))], [0.035, 0.035, 0.035], armor, seg=8)
    L.paint(shaft, lambda q, n: (*L.lin('#E7B94C'), 0.1)); _rigid(parts, arm, shaft, 'hand.R')
    _rigid(parts, arm, L.crystal('spearhead', (hx, hy - 0.05, hz + 1.6), (0, -0.03, 1), 0.65, 0.09, halo, sides=4, tilt=math.pi / 4), 'hand.R')
    sh = L.rock('shield', (0.86, -0.5, 1.5), (0.08, 0.36, 0.5), armor, seed=77, subdiv=2, rough=0.02)
    for pl in sh.data.polygons:
        pl.use_smooth = True
    L.paint(sh, lambda q, n: (*L.mix(L.lin('#FFFFFF'), L.lin('#E7B94C'), L.smooth(0.25, 0.35, Vector((0, q.y + 0.5, q.z - 1.5)).length)), 0.5 * (1 - L.smooth(0.05, 0.1, Vector((0, q.y + 0.5, q.z - 1.5)).length))))
    _rigid(parts, arm, sh, 'hand.L')
    body_ob = L.join('MythicAscension', parts)
    c = biped_clips(arm, heavy=0.8)
    P = _P(arm)
    def wings(k):
        return P({'wingU.L': [('Y', -18 * k), ('X', 6 * k)], 'wingU.R': [('Y', 18 * k), ('X', 6 * k)], 'wingD.L': [('Y', -12 * k)], 'wingD.R': [('Y', 12 * k)]})
    for name, keys in c.items():
        n = len(keys)
        newk = []
        for i, (f, pz) in enumerate(keys):
            k = math.sin(f / 24 * 2 * math.pi) if name in ('idle', 'enrage', 'stun') else (1.6 if name in ('special', 'phase', 'spawn') and 0 < i < n - 1 else 0.3)
            newk.append((f, _merge(pz, wings(k))))
        c[name] = newk
    # ลอยตัวเบา ๆ (อัศวินสวรรค์ไม่แตะพื้น)
    c['idle'] = [(f, _merge(pz, P({}, {'root': (0, 0, 0.18 + 0.06 * math.sin(f / 72 * 2 * math.pi))}))) if 'root' not in pz else (f, pz) for f, pz in c['idle']]
    _clips(arm, c)
    return arm, body_ob


BUILDERS = {'celestial': build_celestial, 'titan': build_titan, 'leviathan': build_leviathan, 'phoenix': build_phoenix, 'void': build_void, 'mythic': build_mythic}
