"""
v1.27.1 ฉากของบอสชุดที่ 2 (พื้นที่กลางลานรัศมี ~3 ม. ว่างไว้ให้บอส)
  celestial     ศาลาสวรรค์       — พื้นหินอ่อนขาวลายวงสุริยะทอง เสาแดงหลังคาทอง ก้อนเมฆรอบลาน โคมทอง
  ruins         ซากเมืองโบราณ    — พื้นทรายแผ่นหินแตก เสาหักล้ม ซุ้มประตูหิน เศียรรูปปั้นยักษ์จมทราย
  abyss         มหาสมุทรลึก       — พื้นทรายใต้ทะเล ปะการังเรืองแสง สาหร่ายสูง หินโค้ง เสากระโดงเรือจม
  flame-palace  วังเปลวไฟนิรันดร์ — พื้นหินแดงลายขนนกทอง กระถางไฟ ซุ้มโค้ง เสาทองคำ
  void-throne   บัลลังก์ความว่าง  — พื้นแก้วดำลายดาว แท่นลอยแตก บัลลังก์ยักษ์ด้านหลัง ผลึกคราม
  ascension     ยอดแห่งตำนาน      — พื้นหินอ่อนวงแหวนชมพูทอง บันไดวน เสาคริสตัล ซุ้มรัศมียักษ์ด้านหลัง
"""
import math
import random
from mathutils import Vector
import raidlib as L
from arenas import ground, ring_positions


def _col(a, b, k):
    return lambda q, n: (*L.mix(L.lin(a), L.lin(b), max(0.0, min(1.0, k(q, n)))), 0.0)


def build_celestial():
    L.reset_scene()
    def gcol(p, n):
        d = p.length; ang = math.atan2(p.y, p.x)
        c = L.mix(L.lin('#D9D2C2'), L.lin('#FFFBF0'), 0.5 + 0.4 * L.fbm(p * 0.6, 2))
        tiles = 1 - L.smooth(0.0, 0.05, min(abs(math.sin(p.x * 1.2)), abs(math.sin(p.y * 1.2))))
        c = L.mix(c, L.lin('#B8AE98'), tiles * 0.5)
        ring = max(1 - L.smooth(0.03, 0.1, abs(d - 3.4)), (1 - L.smooth(0.02, 0.08, abs(math.sin(ang * 12)) * d)) * (1 if 3.4 < d < 4.4 else 0))
        return (*L.mix(c, L.lin('#FFD978'), ring * 0.9), ring * 0.7)
    objs = [ground('Ground', 22, gcol, bump=lambda p: -0.6 * L.smooth(10, 16, p.length))]
    red = L.mat('Lacquer', '#B3261E', rough=0.4)
    gold = L.mat('RoofGold', '#FFD978', rough=0.25, metal=0.85, emission='#FFB52E', strength=0.3)
    for i, (p, rnd) in enumerate(ring_positions(10, 6.5, 7.0, 4)):
        objs.append(L.tube(f'col{i}', [p, p + Vector((0, 0, 4.2))], [0.28, 0.25], red, seg=12))
        objs.append(L.crystal(f'cap{i}', p + Vector((0, 0, 4.2)), (0, 0, 1), 0.9, 0.55, gold, sides=8))
    # หลังคาศาลาโค้งด้านหลัง
    for k, (x, y, w) in enumerate(((0, 14, 6), (-9, 11, 3.5), (9, 11, 3.5))):
        base = Vector((x, y, 0))
        objs.append(L.tube(f'hall{k}', [base, base + Vector((0, 0, 5))], [w * 0.55, w * 0.5], red, seg=8))
        for lvl in range(3):
            objs.append(L.crystal(f'roof{k}{lvl}', base + Vector((0, 0, 5 + lvl * 1.6)), (0, 0, 1), 1.6, w * (0.95 - 0.22 * lvl), gold, sides=8))
    cloud = L.mat('ArenaCloud', '#FFFFFF', rough=0.95, emission='#FFF3D6', strength=0.35)
    for i, (p, rnd) in enumerate(ring_positions(14, 9, 15, 7, skip_front=False)):
        if p.y < -6 and abs(p.x) < 5:
            continue
        c = L.rock(f'cl{i}', p + Vector((0, 0, rnd.uniform(-0.2, 2.5))), (rnd.uniform(1.6, 2.8), rnd.uniform(1.2, 2.0), rnd.uniform(0.6, 1.0)), cloud, seed=i, subdiv=3, rough=0.25)
        for pl in c.data.polygons:
            pl.use_smooth = True
        objs.append(c)
    lamp = L.mat('Lantern', '#FFE8A0', rough=0.3, emission='#FFB020', strength=5)
    for i, (p, rnd) in enumerate(ring_positions(8, 4.6, 5.2, 9)):
        objs.append(L.ellipsoid(f'lamp{i}', p + Vector((0, 0, 1.2)), (0.22, 0.22, 0.3), lamp, seg=12, rings=8))
        objs.append(L.tube(f'lpost{i}', [p, p + Vector((0, 0, 0.95))], [0.06, 0.05], red, seg=6))
    return objs


def build_ruins():
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#B08A5A'), L.lin('#E5CB98'), 0.45 + 0.4 * L.fbm(p * 0.4, 3))
        f1, f2 = L.cells(p * 0.6)
        crack = (1 - L.smooth(0.02, 0.07, f2 - f1)) * (1 - L.smooth(6, 9, d))
        c = L.mix(c, L.lin('#6E5536'), crack * 0.7)
        ring = 1 - L.smooth(0.03, 0.1, abs(d - 3.4))
        return (*L.mix(c, L.lin('#7FFFE4'), ring * 0.8), ring * 0.7)
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.35 * L.smooth(8, 16, p.length) * (1 + L.fbm(p * 0.25, 2)))]
    st = L.mat('RuinStone', '#FFFFFF', rough=0.9, vcol=True)
    sc = lambda q, n: (*L.mix(L.lin('#7A6446'), L.lin('#D6BC8E'), 0.4 + 0.4 * L.fbm(q * 1.5, 2) + 0.2 * n.z), 0.0)
    for i, (p, rnd) in enumerate(ring_positions(10, 6.5, 8.5, 31)):
        h = rnd.uniform(2.0, 5.5) * (0.5 if i % 3 == 0 else 1)
        c = L.tube(f'pil{i}', [p, p + Vector((0, 0, h))], [0.45, 0.4], st, seg=10)
        L.paint(c, lambda q, n: (*L.mix(L.lin('#8A7352'), L.lin('#E3CBA0'), 0.4 + 0.3 * abs(math.sin(math.atan2(q.y - p.y, q.x - p.x) * 6)) + 0.2 * L.fbm(q * 2, 2)), 0.0))
        objs.append(c)
        if i % 3 == 0:
            f = L.tube(f'fall{i}', [p + Vector((0.6, 0.3, 0.35)), p + Vector((2.6, 1.4, 0.35))], [0.4, 0.4], st, seg=10)
            L.paint(f, sc); objs.append(f)
        else:
            cap = L.rock(f'pcap{i}', p + Vector((0, 0, h + 0.15)), (0.65, 0.65, 0.2), st, seed=i, subdiv=1, rough=0.05)
            L.paint(cap, sc); objs.append(cap)
    # ซุ้มประตูหินด้านหลัง
    for k, x in enumerate((-4.5, 4.5)):
        b = L.rock(f'gate{k}', (x, 13, 3.5), (1.0, 1.0, 3.5), st, seed=40 + k, subdiv=1, rough=0.05)
        L.paint(b, sc); objs.append(b)
    lin = L.rock('lintel', (0, 13, 7.4), (5.8, 1.1, 0.7), st, seed=44, subdiv=1, rough=0.05)
    L.paint(lin, sc); objs.append(lin)
    # เศียรรูปปั้นยักษ์จมทราย
    head = L.rock('statue', (-9.5, 7, 0.8), (2.0, 1.8, 2.3), st, seed=46, subdiv=3, rough=0.12)
    L.paint(head, sc); objs.append(head)
    eye = L.mat('StatueEye', '#BFFFF2', rough=0.3, emission='#2EE6C0', strength=3)
    objs.append(L.ellipsoid('seye', (-8.3, 5.6, 1.6), (0.35, 0.1, 0.18), eye, seg=10, rings=6))
    for i, (p, rnd) in enumerate(ring_positions(16, 4.2, 9, 51, skip_front=False)):
        r = L.rock(f'deb{i}', p + Vector((0, 0, 0.15)), (rnd.uniform(0.2, 0.6), rnd.uniform(0.2, 0.5), rnd.uniform(0.15, 0.35)), st, seed=60 + i, subdiv=1, rough=0.25)
        L.paint(r, sc); objs.append(r)
    return objs


def build_abyss():
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#0B2233'), L.lin('#2E5A63'), 0.45 + 0.45 * L.fbm(p * 0.5, 3))
        rip = 0.5 + 0.5 * math.sin(p.x * 2.2 + 1.5 * L.fbm(p * 0.3, 2))
        c = L.mix(c, L.lin('#3F7F86'), rip * 0.25)
        ring = 1 - L.smooth(0.03, 0.12, abs(d - 3.4))
        return (*L.mix(c, L.lin('#7CF6FF'), ring * 0.7), ring * 0.6)
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.6 * L.smooth(8, 16, p.length) * (1 + L.fbm(p * 0.3, 2)))]
    rockm = L.mat('ReefRock', '#FFFFFF', rough=0.9, vcol=True)
    for i, (p, rnd) in enumerate(ring_positions(11, 8, 14, 13, skip_front=False)):
        if p.y < -6 and abs(p.x) < 5:
            continue
        r = L.rock(f'reef{i}', p + Vector((0, 0, 0.8)), (rnd.uniform(1.2, 2.4), rnd.uniform(1.0, 2.0), rnd.uniform(1.0, 3.2)), rockm, seed=i, subdiv=2, rough=0.35)
        L.paint(r, lambda q, n: (*L.mix(L.lin('#0E2A36'), L.lin('#3D6B70'), 0.4 + 0.4 * L.fbm(q, 2) + 0.2 * n.z), 0.0)); objs.append(r)
    # หินโค้งด้านหลัง
    pts = [Vector((math.cos(a) * 5.5, 14, math.sin(a) * 6.5)) for a in [i / 12 * math.pi for i in range(13)]]
    arch = L.tube('arch', pts, [1.1] * 13, rockm, seg=10)
    L.paint(arch, lambda q, n: (*L.mix(L.lin('#0E2A36'), L.lin('#4F7F80'), 0.4 + 0.4 * L.fbm(q * 0.6, 2)), 0.0)); objs.append(arch)
    coral = L.mat('Coral', '#FFFFFF', rough=0.5, vcol=True)
    for i, (p, rnd) in enumerate(ring_positions(14, 4.4, 7.5, 23, skip_front=False)):
        hue = ('#FF6FA8', '#7CF6FF', '#B7FF7A', '#FFB86B')[i % 4]
        for k in range(4):
            a = rnd.uniform(0, 6.28)
            tip = p + Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, rnd.uniform(0.6, 1.3)))
            t = L.tube(f'cor{i}{k}', L.bezier_pts(p, p + Vector((0, 0, 0.4)), tip, 5), [0.09, 0.08, 0.06, 0.05, 0.03], coral, seg=6)
            L.paint(t, lambda q, n, hue=hue: (*L.mix(L.lin('#1B3340'), L.lin(hue), L.smooth(0.0, 1.0, q.z)), 0.8 * L.smooth(0.3, 1.2, q.z)))
            objs.append(t)
    kelp = L.mat('Kelp', '#FFFFFF', rough=0.7, vcol=True)
    for i, (p, rnd) in enumerate(ring_positions(12, 7.5, 11, 41, skip_front=False)):
        h = rnd.uniform(4, 8)
        pts = [p + Vector((0.4 * math.sin(z * 0.9 + i), 0.3 * math.cos(z * 0.7), z)) for z in [h * j / 9 for j in range(10)]]
        t = L.tube(f'kelp{i}', pts, [0.12 - 0.01 * j for j in range(10)], kelp, seg=5)
        L.paint(t, lambda q, n: (*L.mix(L.lin('#123A2A'), L.lin('#3F8F5A'), L.smooth(0, 6, q.z)), 0.0)); objs.append(t)
    wood = L.mat('Wreck', '#4A3626', rough=0.9)
    objs.append(L.tube('mast', [Vector((8, 10, -0.5)), Vector((6.5, 9.5, 7.5))], [0.25, 0.18], wood, seg=8))
    objs.append(L.tube('yard', [Vector((5.2, 9.0, 5.8)), Vector((8.6, 10.2, 6.6))], [0.12, 0.1], wood, seg=6))
    return objs


def build_flame_palace():
    L.reset_scene()
    def gcol(p, n):
        d = p.length; ang = math.atan2(p.y, p.x)
        c = L.mix(L.lin('#4A140C'), L.lin('#8C2A14'), 0.45 + 0.4 * L.fbm(p * 0.5, 3))
        feather = (1 - L.smooth(0.02, 0.07, abs(math.sin(ang * 8 + d * 0.6)) * d * 0.25)) * (1 if 3.6 < d < 8 else 0)
        ring = 1 - L.smooth(0.03, 0.1, abs(d - 3.4))
        g = max(ring, feather * 0.8)
        return (*L.mix(c, L.lin('#FFC24B'), g * 0.85), g * 0.7)
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.3 * L.smooth(10, 16, p.length))]
    goldm = L.mat('PalaceGold', '#FFD27A', rough=0.3, metal=0.9)
    redst = L.mat('RedStone', '#FFFFFF', rough=0.8, vcol=True)
    fire = L.mat('Brazier', '#FFE0A0', rough=0.3, emission='#FF7A1A', strength=7)
    for i, (p, rnd) in enumerate(ring_positions(9, 6.8, 7.2, 19)):
        objs.append(L.tube(f'gcol{i}', [p, p + Vector((0, 0, 5))], [0.32, 0.28], goldm, seg=12))
        for k in range(3):
            objs.append(L.crystal(f'fl{i}{k}', p + Vector((0.1 * (k - 1), 0, 5.05)), (0.15 * (k - 1), 0, 1), 0.7 - 0.15 * abs(k - 1), 0.14, fire, sides=5))
    for i, (p, rnd) in enumerate(ring_positions(7, 4.5, 5.0, 29)):
        bowl = L.ellipsoid(f'bowl{i}', p + Vector((0, 0, 0.9)), (0.45, 0.45, 0.2), goldm, seg=14, rings=8)
        objs += [bowl, L.tube(f'bstem{i}', [p, p + Vector((0, 0, 0.85))], [0.12, 0.08], goldm, seg=8)]
        for k in range(4):
            objs.append(L.crystal(f'bf{i}{k}', p + Vector((0.12 * math.cos(k * 1.6), 0.12 * math.sin(k * 1.6), 1.0)), (0.2 * math.cos(k * 1.6), 0.2 * math.sin(k * 1.6), 1), rnd.uniform(0.5, 0.9), 0.1, fire, sides=5))
    # ซุ้มโค้งพระราชวัง
    for k, x in enumerate((-7, 0, 7)):
        y = 14 - abs(x) * 0.3
        pts = [Vector((x + math.cos(a) * 2.4, y, 4 + math.sin(a) * 2.4)) for a in [i / 10 * math.pi for i in range(11)]]
        a = L.tube(f'parch{k}', [Vector((x + 2.4, y, 0))] + pts + [Vector((x - 2.4, y, 0))], [0.5] * 13, redst, seg=8)
        L.paint(a, lambda q, n: (*L.mix(L.lin('#5A1A0E'), L.lin('#B8452A'), 0.5 + 0.4 * L.fbm(q * 0.8, 2)), 0.0)); objs.append(a)
        objs.append(L.crystal(f'pdome{k}', Vector((x, y, 6.6)), (0, 0, 1), 2.2, 1.2, goldm, sides=10))
    return objs


def build_void_throne():
    L.reset_scene()
    rnd0 = random.Random(3)
    stars = [Vector((rnd0.uniform(-20, 20), rnd0.uniform(-20, 20), 0)) for _ in range(160)]
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#04030A'), L.lin('#15123A'), 0.3 + 0.4 * L.fbm(p * 0.25, 3))
        s = max(0.0, 1 - min((p - q).length for q in stars) / 0.12)
        ring = max(1 - L.smooth(0.03, 0.1, abs(d - 3.4)), 1 - L.smooth(0.02, 0.06, abs(d - 4.2)))
        g = max(s, ring * 0.9)
        return (*L.mix(c, L.lin('#A5B4FC'), g), g * 0.8)
    objs = [ground('Ground', 22, gcol, seg=72, rings=18, bump=lambda p: -1.5 * L.smooth(9, 16, p.length))]
    glass = L.mat('VoidGlass', '#FFFFFF', rough=0.15, metal=0.6, vcol=True)
    for i, (p, rnd) in enumerate(ring_positions(9, 8, 12, 15, skip_front=False)):
        if p.y < -6 and abs(p.x) < 5:
            continue
        r = L.rock(f'plat{i}', p + Vector((0, 0, rnd.uniform(1.5, 5))), (rnd.uniform(1.0, 1.8), rnd.uniform(0.8, 1.4), 0.3), glass, seed=i, subdiv=1, rough=0.15)
        L.paint(r, lambda q, n: (*L.mix(L.lin('#0B0A1A'), L.lin('#4C4F9A'), 0.3 + 0.5 * max(0, n.z)), 0.0)); objs.append(r)
    # บัลลังก์ยักษ์ด้านหลัง
    th = L.mat('Throne', '#FFFFFF', rough=0.3, metal=0.7, vcol=True)
    tc = lambda q, n: (*L.mix(L.lin('#0E0C22'), L.lin('#C9A24A'), 0.15 + 0.5 * L.smooth(0.7, 0.98, n.z)), 0.0)
    for nm, c, s in (('seat', (0, 14, 1.5), (3.0, 2.0, 1.5)), ('back', (0, 15.5, 6.5), (2.8, 0.8, 5.0)), ('armL', (3.2, 14, 2.8), (0.7, 2.0, 0.6)), ('armR', (-3.2, 14, 2.8), (0.7, 2.0, 0.6))):
        b = L.rock(nm, c, s, th, seed=len(nm), subdiv=1, rough=0.03)
        L.paint(b, tc); objs.append(b)
    cr = L.mat('IndigoCrystal', '#E0E7FF', rough=0.1, emission='#6366F1', strength=3.5)
    for k in range(7):
        a = math.radians(30 + k * 20)
        objs.append(L.crystal(f'tspike{k}', (math.cos(a) * 2.6, 15.5, 10.5 + math.sin(a) * 1.5), (math.cos(a) * 0.4, 0, 1), 2.2 - abs(k - 3) * 0.4, 0.25, cr, sides=4))
    for i, (p, rnd) in enumerate(ring_positions(10, 4.4, 6.5, 27)):
        objs.append(L.crystal(f'vc{i}', p, (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 1), rnd.uniform(0.5, 1.2), 0.12, cr, sides=4))
    return objs


def build_ascension():
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#E9E2EE'), L.lin('#FFFFFF'), 0.5 + 0.4 * L.fbm(p * 0.5, 2))
        vein = 1 - L.smooth(0.0, 0.06, abs(L.fbm(p * 0.35, 3)))
        c = L.mix(c, L.lin('#C9B8D9'), vein * 0.4)
        rings = max(1 - L.smooth(0.03, 0.1, abs(d - 3.4)), 1 - L.smooth(0.02, 0.06, abs(d - 4.5)), 1 - L.smooth(0.02, 0.05, abs(d - 5.4)))
        gold = 1 - L.smooth(0.02, 0.06, abs(d - 4.0))
        c = L.mix(c, L.lin('#E7B94C'), gold * 0.9)
        return (*L.mix(c, L.lin('#F0ABFC'), rings * 0.85), rings * 0.7)
    objs = [ground('Ground', 22, gcol, bump=lambda p: -0.8 * L.smooth(9, 16, p.length))]
    marble = L.mat('Marble', '#FFFFFF', rough=0.35, vcol=True)
    mc = lambda q, n: (*L.mix(L.lin('#D6CCE0'), L.lin('#FFFFFF'), 0.5 + 0.4 * L.fbm(q * 0.8, 2)), 0.0)
    cr = L.mat('PinkCrystal', '#FAE8FF', rough=0.08, emission='#E879F9', strength=3)
    for i, (p, rnd) in enumerate(ring_positions(8, 6.8, 7.2, 37)):
        c = L.tube(f'mcol{i}', [p, p + Vector((0, 0, 4.6))], [0.3, 0.26], marble, seg=12)
        L.paint(c, mc); objs.append(c)
        objs.append(L.crystal(f'mcr{i}', p + Vector((0, 0, 4.6)), (0, 0, 1), 1.1, 0.22, cr, sides=6))
    # บันไดวงขึ้นไปด้านหลัง
    for k in range(7):
        r = L.rock(f'step{k}', (0, 10 + k * 1.1, 0.3 + k * 0.55), (4.5 - k * 0.3, 0.6, 0.3), marble, seed=k, subdiv=1, rough=0.02)
        L.paint(r, mc); objs.append(r)
    # ซุ้มรัศมียักษ์
    halo = L.mat('GiantHalo', '#FFF7E0', rough=0.1, emission='#F0ABFC', strength=4)
    hc = Vector((0, 17, 8))
    pts = [hc + Vector((math.cos(a) * 5.5, 0, math.sin(a) * 5.5)) for a in [i / 48 * 2 * math.pi for i in range(49)]]
    objs.append(L.tube('ghalo', pts, 0.28, halo, seg=8, cap=False))
    for k in range(16):
        a = 2 * math.pi * k / 16
        objs.append(L.crystal(f'gray{k}', hc + Vector((math.cos(a) * 5.9, 0, math.sin(a) * 5.9)), (math.cos(a), 0, math.sin(a)), 1.6 if k % 2 else 2.4, 0.18, halo, sides=4))
    cloud = L.mat('AscCloud', '#FFFFFF', rough=0.95, emission='#FCE7F3', strength=0.3)
    for i, (p, rnd) in enumerate(ring_positions(12, 10, 15, 47, skip_front=False)):
        if p.y < -6 and abs(p.x) < 5:
            continue
        c = L.rock(f'acl{i}', p + Vector((0, 0, rnd.uniform(-1.0, 1.0))), (rnd.uniform(1.6, 2.6), rnd.uniform(1.2, 2.0), rnd.uniform(0.5, 0.9)), cloud, seed=70 + i, subdiv=3, rough=0.25)
        for pl in c.data.polygons:
            pl.use_smooth = True
        objs.append(c)
    return objs


BUILDERS = {'celestial': build_celestial, 'ruins': build_ruins, 'abyss': build_abyss, 'flame-palace': build_flame_palace, 'void-throne': build_void_throne, 'ascension': build_ascension}
