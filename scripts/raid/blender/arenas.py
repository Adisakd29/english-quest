"""
v1.27.0 World Raid — ฉากต่อสู้แยกตามบอส (ส่วนคงที่: พื้น/ฉากหลัง/อุปกรณ์ประกอบ) · ส่วนเคลื่อนไหว (หมอก ละอองแสง ประกายไฟ หิมะ) สร้างที่ runtime
  forest      Enchanted Forest Arena — ลานหญ้ามอส วงหินโบราณมีอักขระเรืองแสง ต้นไม้ใหญ่รอบลาน เห็ดเรืองแสง
  volcano     Volcanic Fortress      — พื้นหินบะซอลต์ ธารลาวาเรืองแสง ยอดหินแหลม กำแพงป้อมพังด้านหลัง
  frost       Frozen Dragon Temple   — พื้นน้ำแข็ง เสาวิหาร + ซุ้มโค้ง ผลึกน้ำแข็งเรืองแสง กองหิมะ
  frost-xmas  ปราสาทน้ำแข็งคืนคริสต์มาส — วิหารน้ำแข็ง + ต้นคริสต์มาสไฟทอง + หอคอยปราสาทหน้าต่างไฟ + กล่องของขวัญ
  shadow-tower หอคอยเงา (v1.27.1)     — ลานหินดำวงเวทม่วง เสาโอเบลิสก์หัก หินลอย ผลึกม่วง หอคอยสูงหน้าต่างเรืองแสง
พื้นที่ต่อสู้กลางลาน (รัศมี ~3 ม.) ว่างไว้ให้บอส · ฉากอยู่รัศมี 5–16 ม.
"""
import math
import random
from mathutils import Vector
import bmesh
import raidlib as L


def ground(name, radius, fn, seg=64, rings=14, bump=None):
    """พื้นวงกลม (vertex color ตาม fn) · bump(p) = ความสูง"""
    bm = bmesh.new()
    center = bm.verts.new((0, 0, 0))
    prev = None; first = None
    rows = []
    for r in range(1, rings + 1):
        rad = radius * (r / rings) ** 1.4
        row = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            p = Vector((math.cos(a) * rad, math.sin(a) * rad, 0))
            if bump:
                p.z = bump(p)
            row.append(bm.verts.new(p))
        rows.append(row)
    for k in range(seg):
        bm.faces.new((center, rows[0][k], rows[0][(k + 1) % seg]))
    for i in range(len(rows) - 1):
        for k in range(seg):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][(k + 1) % seg], rows[i][(k + 1) % seg]))
    _ = (prev, first)
    ob = L.mesh_from_bm(name, bm, L.mat(name + 'M', '#FFFFFF', rough=0.95, vcol=True))
    L.paint(ob, fn)
    return ob


def ring_positions(n, r0, r1, seed, skip_front=True):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.15, 0.15)
        if skip_front and -2.2 < math.atan2(math.sin(a), math.cos(a)) < -0.94:   # เว้นด้านหน้ากล้อง (-Y) ให้เห็นบอสชัด
            continue
        r = rnd.uniform(r0, r1)
        out.append((Vector((math.cos(a) * r, math.sin(a) * r, 0)), rnd))
    return out


def tree(name, base, h, canopy_c, seed, trunk='#3A2618'):
    rnd = random.Random(seed)
    tm = L.mat('Trunk', '#FFFFFF', rough=0.9, vcol=True)
    lm = L.mat('Canopy', '#FFFFFF', rough=0.8, vcol=True)
    pts = [base + Vector((0, 0, 0)), base + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), h * 0.5)), base + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), h))]
    t = L.tube(name + 't', pts, [0.35 * h / 6, 0.22 * h / 6, 0.14 * h / 6], tm, seg=8)
    L.paint(t, lambda p, n: (*L.mix(L.lin(trunk), L.lin('#6B4A2E'), 0.4 + L.fbm(p * 4, 2)), 0.0))
    parts = [t]
    for k in range(4):
        c = pts[-1] + Vector((rnd.uniform(-0.9, 0.9), rnd.uniform(-0.9, 0.9), rnd.uniform(-0.6, 0.8))) * (h / 6)
        b = L.rock(name + f'c{k}', c, (1.3 * h / 6, 1.3 * h / 6, 1.0 * h / 6), lm, seed=seed * 10 + k, subdiv=2, rough=0.28)
        for pl in b.data.polygons:
            pl.use_smooth = True
        L.paint(b, lambda p, n: (*L.mix(L.lin(canopy_c[0]), L.lin(canopy_c[1]), 0.35 + 0.5 * n.z + 0.2 * L.fbm(p * 2, 2)), 0.0))
        parts.append(b)
    return parts


def build_forest():
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#2E5A2A'), L.lin('#5E8F3C'), 0.5 + L.fbm(p * 0.35, 3))
        path = 1 - L.smooth(0.6, 1.1, abs(p.x)) if p.y < 0 else 0
        c = L.mix(c, L.lin('#6A5A43'), path * 0.6)
        c = L.mix(c, L.lin('#1D3320'), L.smooth(10, 16, d))
        ring = 1 - L.smooth(0.03, 0.12, abs(d - 3.4))
        return (*L.mix(c, L.lin('#B8FF8A'), ring * 0.7), ring)
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.25 * max(0, p.length - 8) / 8 * (1 + L.fbm(p * 0.3, 2)))]
    stone = L.mat('Stone', '#FFFFFF', rough=0.9, vcol=True)
    rune = L.mat('Rune', '#B8FF8A', rough=0.4, emission='#9CFF5A', strength=4)
    for i, (p, rnd) in enumerate(ring_positions(9, 4.6, 4.9, 3)):
        h = rnd.uniform(1.4, 2.2)
        s = L.rock(f'menhir{i}', p + Vector((0, 0, h * 0.45)), (0.38, 0.3, h * 0.55), stone, seed=i, subdiv=2, rough=0.18)
        L.paint(s, lambda q, n: (*L.mix(L.lin('#4E5A50'), L.lin('#8B978B'), 0.4 + L.fbm(q * 3, 2)), 0.0) if n.z < 0.6 else (*L.lin('#4F8F3A'), 0.0))
        objs.append(s)
        d = (-p).normalized()
        g = L.ellipsoid(f'rune{i}', p + d * 0.33 + Vector((0, 0, h * 0.55)), (0.07, 0.02, 0.16), rune, seg=8, rings=6)
        objs.append(g)
    for i, (p, rnd) in enumerate(ring_positions(14, 8.5, 13.5, 9, skip_front=False)):
        if p.y < -6 and abs(p.x) < 5:
            continue
        objs += tree(f'tree{i}', p, rnd.uniform(5.5, 8.5), ('#1F4D2A', '#5FA34A'), i)
    cap = L.mat('ShroomA', '#5FE3D0', rough=0.4, emission='#4FF5D8', strength=3)
    stem = L.mat('StemA', '#E8E0C8', rough=0.8)
    for i, (p, rnd) in enumerate(ring_positions(16, 3.6, 7.5, 21, skip_front=False)):
        s = rnd.uniform(0.6, 1.4)
        objs.append(L.tube(f'st{i}', [p, p + Vector((0, 0, 0.25 * s))], [0.05 * s, 0.04 * s], stem, seg=8))
        objs.append(L.ellipsoid(f'cp{i}', p + Vector((0, 0, 0.27 * s)), (0.17 * s, 0.17 * s, 0.08 * s), cap, seg=14, rings=8))
    return objs


def build_volcano():
    L.reset_scene()
    def lava(p):
        return 1 - L.smooth(0.05, 0.3, abs(L.fbm(p * 0.22, 3)))
    def gcol(p, n):
        d = p.length
        m = lava(p) * L.smooth(3.6, 5.0, d)
        rockc = L.mix(L.lin('#16100E'), L.lin('#3E2C24'), 0.5 + L.fbm(p * 0.8, 3))
        hexes = L.cells(p * 0.9)
        rockc = L.mix(rockc, L.lin('#0B0807'), 1 - L.smooth(0.02, 0.08, hexes[1] - hexes[0]))
        c = L.mix(rockc, L.mix(L.lin('#FF4A0E'), L.lin('#FFC23A'), m), m)
        return (*c, m)
    objs = [ground('Ground', 22, gcol, seg=72, rings=16, bump=lambda p: -0.12 * lava(p) * L.smooth(3.6, 5, p.length) + 0.4 * max(0, p.length - 9) / 9)]
    rockm = L.mat('Basalt', '#FFFFFF', rough=0.95, vcol=True)
    for i, (p, rnd) in enumerate(ring_positions(13, 7, 14, 5, skip_front=False)):
        if p.y < -6 and abs(p.x) < 4:
            continue
        h = rnd.uniform(2.5, 7)
        s = L.crystal(f'spire{i}', p, (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 1), h, rnd.uniform(0.6, 1.2), rockm, sides=5)
        L.paint(s, lambda q, n: (*L.mix(L.lin('#120C0A'), L.lin('#4A3328'), 0.4 + L.fbm(q * 1.2, 2)), 0.0))
        objs.append(s)
    # กำแพงป้อมพังด้านหลัง (ฟันปลา)
    wall = L.mat('Wall', '#FFFFFF', rough=0.9, vcol=True)
    for i in range(9):
        a = math.radians(40 + i * 12.5)
        p = Vector((math.cos(a) * 15, math.sin(a) * 15, 0))
        h = 4.5 + (1.2 if i % 3 == 0 else 0) - (2.0 if i in (4, 5) else 0)
        b = L.rock(f'wall{i}', p + Vector((0, 0, h / 2)), (1.7, 0.9, h / 2), wall, seed=40 + i, subdiv=1, rough=0.08)
        L.paint(b, lambda q, n: (*L.mix(L.lin('#2A1E19'), L.lin('#5A4438'), 0.5 + L.fbm(q, 2)), 0.0))
        objs.append(b)
        if i % 2 == 0:
            objs.append(L.rock(f'merlon{i}', p + Vector((0, 0, h + 0.4)), (0.5, 0.5, 0.45), wall, seed=60 + i, subdiv=1, rough=0.05))
    glow = L.mat('Ember', '#FFB13B', rough=0.4, emission='#FF6A1A', strength=6)
    for i, (p, rnd) in enumerate(ring_positions(10, 4.2, 6.5, 77, skip_front=False)):
        objs.append(L.crystal(f'lc{i}', p, (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 1), rnd.uniform(0.4, 0.9), 0.12, glow, sides=5))
    return objs


def _temple(objs, xmas=False):
    ice = L.mat('IcePillar', '#FFFFFF', rough=0.15, vcol=True)
    for i in range(8):
        a = math.radians(30 + i * 17)
        p = Vector((math.cos(a) * 9.5, math.sin(a) * 9.5, 0))
        pl = L.tube(f'pillar{i}', [p, p + Vector((0, 0, 3)), p + Vector((0, 0, 6.2))], [0.55, 0.5, 0.52], ice, seg=10)
        L.paint(pl, lambda q, n: (*L.mix(L.lin('#7FB8DF'), L.lin('#E2F5FF'), 0.5 + 0.5 * L.fbm(q * 1.5, 2) + 0.2 * n.z), 0.0))
        objs.append(pl)
        cap = L.rock(f'pcap{i}', p + Vector((0, 0, 6.4)), (0.8, 0.8, 0.3), ice, seed=90 + i, subdiv=1, rough=0.05)
        L.paint(cap, lambda q, n: (*L.lin('#F2FBFF'), 0.0))
        objs.append(cap)
        if i < 7:
            b = math.radians(30 + (i + 0.5) * 17)
            mid = Vector((math.cos(b) * 9.5, math.sin(b) * 9.5, 7.3))
            q2 = Vector((math.cos(math.radians(30 + (i + 1) * 17)) * 9.5, math.sin(math.radians(30 + (i + 1) * 17)) * 9.5, 6.4))
            arc = L.tube(f'arch{i}', L.bezier_pts(p + Vector((0, 0, 6.4)), mid, q2, 9), 0.28, ice, seg=8)
            L.paint(arc, lambda q, n: (*L.lin('#CFEFFF'), 0.0))
            objs.append(arc)


def build_frost(xmas=False):
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        c = L.mix(L.lin('#8FC1E3'), L.lin('#E9F7FF'), 0.5 + L.fbm(p * 0.4, 3))
        f1, f2 = L.cells(p * 0.6)
        c = L.mix(c, L.lin('#4F8FC0'), (1 - L.smooth(0.02, 0.07, f2 - f1)) * 0.6)
        ring = 1 - L.smooth(0.03, 0.1, abs(d - 3.4))
        snow = L.smooth(6, 11, d)
        c = L.mix(c, L.lin('#F7FBFF'), snow)
        return (*L.mix(c, L.lin('#9BE8FF'), ring * 0.8), ring * (0.6 if not xmas else 0.9))
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.5 * L.smooth(7, 14, p.length) * (1 + L.fbm(p * 0.25, 2)))]
    _temple(objs, xmas)
    cr = L.mat('IceGlow', '#CFF6FF', rough=0.05, emission='#6FE3FF', strength=3)
    for i, (p, rnd) in enumerate(ring_positions(12, 4.0, 7.0, 13, skip_front=False)):
        for k in range(3):
            d = Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 1))
            objs.append(L.crystal(f'ic{i}{k}', p + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0)), d, rnd.uniform(0.5, 1.4), rnd.uniform(0.1, 0.2), cr, sides=6))
    if xmas:
        tm = L.mat('XTree', '#FFFFFF', rough=0.8, vcol=True)
        gold = L.mat('XLight', '#FFE08A', rough=0.3, emission='#FFC447', strength=7)
        star = L.mat('XStar', '#FFF1B0', rough=0.2, emission='#FFD54A', strength=9)
        red = L.mat('XRed', '#C8323C', rough=0.5)
        ribbon = L.mat('XRibbon', '#FFD978', rough=0.3, metal=0.6)
        for i, ang in enumerate((-28, 28, 140, 220)):
            a = math.radians(ang + 90)
            p = Vector((math.cos(a) * 6.5, math.sin(a) * 6.5, 0))
            h = 4.6 if i < 2 else 3.6
            tiers = []
            for k in range(5):
                z = 0.4 + k * h * 0.17
                r = (1.5 - k * 0.27) * h / 4.6
                c = L.crystal(f'xt{i}{k}', p + Vector((0, 0, z)), (0, 0, 1), h * 0.32, r, tm, sides=9)
                L.paint(c, lambda q, n: (*L.mix(L.lin('#123F2A'), L.lin('#2F7A4C'), 0.4 + 0.6 * max(0, n.z) + 0.2 * L.fbm(q * 3, 2)), 0.0))
                for pl in c.data.polygons:
                    pl.use_smooth = True
                tiers.append(c)
            objs += tiers
            rnd = random.Random(i)
            for k in range(26):
                t = rnd.random()
                z = 0.5 + t * h * 0.82
                r = (1.45 * (1 - t) + 0.1) * h / 4.6
                b = rnd.uniform(0, 2 * math.pi)
                objs.append(L.ellipsoid(f'xl{i}{k}', p + Vector((math.cos(b) * r, math.sin(b) * r, z)), (0.07, 0.07, 0.07), gold, seg=8, rings=5))
            objs.append(L.crystal(f'xs{i}', p + Vector((0, 0, h * 1.02)), (0, 0, 1), 0.5, 0.18, star, sides=5))
            for k in range(3):
                q = p + Vector((rnd.uniform(-1, 1), -1.2 + rnd.uniform(-0.3, 0.3), 0.2))
                bx = L.rock(f'gift{i}{k}', q, (0.25, 0.25, 0.22), red, seed=i * 5 + k, subdiv=1, rough=0.0)
                objs.append(bx)
                objs.append(L.tube(f'rib{i}{k}', [q + Vector((0, 0, -0.22)), q + Vector((0, 0, 0.26))], 0.03, ribbon, seg=6))
        # หอคอยปราสาท (ฉากหลัง) + หน้าต่างไฟ
        wallm = L.mat('Castle', '#FFFFFF', rough=0.4, vcol=True)
        win = L.mat('Window', '#FFE6A3', rough=0.4, emission='#FFB547', strength=5)
        for i, (x, y, h) in enumerate(((-7, 14, 11), (0, 16, 14), (7, 14, 10), (-12, 10, 8), (12, 10, 8))):
            p = Vector((x, y, 0))
            tw = L.tube(f'tower{i}', [p, p + Vector((0, 0, h))], [1.3, 1.1], wallm, seg=12)
            L.paint(tw, lambda q, n: (*L.mix(L.lin('#9CC4E4'), L.lin('#E6F6FF'), 0.5 + 0.4 * L.fbm(q * 0.6, 2)), 0.0))
            roof = L.crystal(f'roof{i}', p + Vector((0, 0, h)), (0, 0, 1), 3.2, 1.5, L.mat('Roof', '#2C5C9A', rough=0.5), sides=12)
            objs += [tw, roof]
            for k in range(3):
                objs.append(L.ellipsoid(f'win{i}{k}', p + Vector((0, -1.12, h * (0.35 + 0.18 * k))), (0.22, 0.05, 0.35), win, seg=8, rings=6))
    return objs


def build_shadow():
    """หอคอยเงา (v1.27.1): ลานหินดำวงเวทเรืองแสงม่วง · เสาโอเบลิสก์หัก · หินลอย · ผลึกม่วง · หอคอยสูงด้านหลังหน้าต่างเรืองแสง"""
    L.reset_scene()
    def gcol(p, n):
        d = p.length
        f1, f2 = L.cells(p * 0.7)
        tile = 1 - L.smooth(0.02, 0.06, f2 - f1)                               # รอยต่อแผ่นหิน
        c = L.mix(L.lin('#17121F'), L.lin('#3A3150'), 0.45 + 0.5 * L.fbm(p * 0.5, 3))
        c = L.mix(c, L.lin('#0A0710'), tile * 0.7)
        ring = max(1 - L.smooth(0.03, 0.09, abs(d - 3.4)), 1 - L.smooth(0.02, 0.06, abs(d - 2.6)))
        ang = math.atan2(p.y, p.x)
        spokes = (1 - L.smooth(0.02, 0.07, abs(math.sin(ang * 4)) * d)) * (1 if 2.6 < d < 3.4 else 0)   # ซี่วงเวทระหว่างสองวง
        g = max(ring, spokes)
        return (*L.mix(c, L.lin('#C4A5FF'), g * 0.85), g * 0.8)
    objs = [ground('Ground', 22, gcol, bump=lambda p: 0.7 * L.smooth(8, 15, p.length) * (1 + L.fbm(p * 0.3, 2)))]
    stone = L.mat('DarkStone', '#FFFFFF', rough=0.85, vcol=True)
    def stone_col(q, n):
        return (*L.mix(L.lin('#1A1424'), L.lin('#4A4060'), 0.4 + 0.5 * L.fbm(q * 1.2, 2) + 0.2 * n.z), 0.0)
    rune = L.mat('ObeliskRune', '#E9D5FF', rough=0.3, emission='#A78BFA', strength=4)
    # เสาโอเบลิสก์ (บางต้นหักครึ่ง) เรียงรอบลาน
    for i, (p, rnd) in enumerate(ring_positions(9, 7.0, 8.5, 21)):
        h = rnd.uniform(2.6, 5.2) * (0.55 if i % 3 == 1 else 1)
        ob = L.crystal(f'obel{i}', p, (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 1), h, 0.45, stone, sides=4, tilt=rnd.uniform(0, 1))
        L.paint(ob, stone_col); objs.append(ob)
        objs.append(L.ellipsoid(f'orune{i}', p + Vector((0, 0, h * 0.42)) - p.normalized() * 0.34, (0.09, 0.04, 0.2), rune, seg=8, rings=6))
        if i % 3 == 1:   # ชิ้นที่หักนอนที่พื้น
            objs.append(L.rock(f'broke{i}', p + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.25)), (0.7, 0.35, 0.3), stone, seed=i, subdiv=1, rough=0.2))
            L.paint(objs[-1], stone_col)
    # หินลอย (ฉากกลาง)
    for i, (p, rnd) in enumerate(ring_positions(7, 9.5, 12.5, 33)):
        r = L.rock(f'float{i}', p + Vector((0, 0, rnd.uniform(3.0, 6.0))), (rnd.uniform(0.5, 1.0), rnd.uniform(0.5, 1.0), rnd.uniform(0.3, 0.6)), stone, seed=50 + i, subdiv=2, rough=0.4)
        L.paint(r, lambda q, n: (*L.mix(L.lin('#120E1A'), L.lin('#5B4A8A'), 0.3 + 0.4 * max(0, n.z) + 0.3 * L.fbm(q, 2)), 0.0)); objs.append(r)
    # ผลึกม่วงเรืองแสงรอบวง
    cr = L.mat('VoidGlow', '#E9D5FF', rough=0.1, emission='#8B5CF6', strength=3)
    for i, (p, rnd) in enumerate(ring_positions(10, 4.4, 6.5, 17)):
        for k in range(2):
            d = Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 1))
            objs.append(L.crystal(f'vc{i}{k}', p + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0)), d, rnd.uniform(0.4, 1.1), rnd.uniform(0.08, 0.16), cr, sides=5))
    # หอคอยเงาด้านหลัง + หอเล็กสองข้าง · หน้าต่างเรืองแสง
    win = L.mat('TowerWindow', '#F3E8FF', rough=0.4, emission='#C084FC', strength=5)
    roof = L.mat('TowerRoof', '#241A3D', rough=0.5)
    for i, (x, y, h, r) in enumerate(((0, 17, 18, 2.2), (-8, 14, 10, 1.3), (8, 14, 11, 1.3))):
        p = Vector((x, y, 0))
        tw = L.tube(f'tower{i}', [p, p + Vector((0, 0, h * 0.6)), p + Vector((0, 0, h))], [r, r * 0.88, r * 0.8], stone, seg=10)
        L.paint(tw, stone_col)
        objs += [tw, L.crystal(f'troof{i}', p + Vector((0, 0, h)), (0, 0, 1), r * 2.6, r * 1.05, roof, sides=10)]
        for k in range(4 if i == 0 else 2):
            objs.append(L.ellipsoid(f'tw{i}{k}', p + Vector((0, -r * 0.92, h * (0.3 + 0.17 * k))), (0.22, 0.06, 0.42), win, seg=8, rings=6))
    return objs


BUILDERS = {'forest': build_forest, 'volcano': build_volcano, 'frost': lambda: build_frost(False), 'frost-xmas': lambda: build_frost(True), 'shadow-tower': build_shadow}
