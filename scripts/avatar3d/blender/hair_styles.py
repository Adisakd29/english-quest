"""
ทรงผมทั้งหมด (v3) — สร้างจากช่อผมจริงด้วย hair.py แล้วหลอมเป็นผิวเดียว (ดูหัวไฟล์ hair.py)
แต่ละฟังก์ชันคืน [ผม (fused), ...ของประกอบ (ยางรัด/กิ๊บ)]
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector

from eqdetail import fab
from eqlib import tube_arc
from hair import (HC, R0, H, braid_strands, bun_coil, bm_obj, fib_dirs, fuse, groom, hairline_ok, scalp, smooth_path, sph,
                  surf, sweep, to_dir)

V = Vector


def hair_mat(name, color, rough=0.5, nstr=0.3):
    return fab(name, color, 'hair', rough, nstr=nstr)

def keep_fn(front=0.42, back=0.3, side=0.0, s=-0.08):
    """ขอบหนังศีรษะ: หน้าผากสูง front · ท้ายทอยต่ำ back"""
    return lambda d: d.z > s + front * max(0.0, -d.y) - back * max(0.0, d.y) + side * d.x


def _walk_to(root, target, out0=0.01, out1=0.017, step=0.007, max_len=0.5, stop=0.03, zmin=None):
    """เดินตามผิวศีรษะไปหาเป้า (จุดรวบผม) — หยุดเมื่อใกล้เป้า"""
    d = V(root).normalized()
    p, n = surf(d, -0.006)
    pts = [p]
    s = 0.0
    tgt = V(target)
    while s < max_len:
        sp, n = surf(d)
        f = tgt - sp
        if f.length < stop:
            break
        tan = (f - n * f.dot(n))
        if zmin is not None and sp.z < zmin + 0.02 and f.length > 0.07 and tan.z < 0:
            tan.z = abs(tan.z) * 0.2   # ไม่มุดลงใต้กะโหลก (ท้ายทอย) — เดินอ้อมด้านข้างแทน
        if tan.length < 1e-6:
            break
        tan.normalize()
        d = to_dir(sp + tan * step)
        sp2, n2 = surf(d)
        t = min(1.0, s / 0.12)
        pts.append(sp2 + n2 * (out0 + (out1 - out0) * t))
        s += step
    pts.append(tgt.lerp(pts[-1], 0.3))
    return smooth_path(pts, 2)


def _fringe(bm, rnd, xs, z_end=0.875, sweep_x=0.0, w=0.034, h=0.012):
    """หน้าม้า: ช่อจากแนวไรผมด้านบนไหลลงหน้าผาก ปลายเรียว (เหนือคิ้ว)"""
    for x in xs:
        root = sph(math.degrees(math.asin(max(-0.9, min(0.9, x / 0.2)))) * 0.8, 52 + rnd.uniform(-4, 4))
        def flow(p, n, t, x=x):
            return V((sweep_x * (0.4 + t), -0.55, -1.0)).normalized()
        pts = groom(root, flow, 0.16, out0=0.006, out1=0.012, step=0.006)
        pts = [p for p in pts if p.z > z_end - 0.004 or p.y > -0.1] or pts[:3]
        sweep(bm, pts, w * rnd.uniform(0.85, 1.15), h, w1=0.12, h1=0.3, k=8)


# =====================================================================
# Twin Buns — ผมดึงขึ้นจากทุกทิศเข้าหามวยสองข้าง · มวยเป็นช่อผมบิดเกลียวพันขด · ยางรัด
# =====================================================================
def H_buns(c='#1f1b24'):
    m = hair_mat('MAT_Hair_Buns', c, 0.46)
    tie = fab('MAT_Hair_BunTie', '#ffcf3f', None, 0.5)
    rnd = random.Random(21)
    keep = keep_fn(0.40, 0.34)
    bases = [surf(sph(60 * sx, 58), 0.004)[0] for sx in (1, -1)]
    bm = bmesh.new()
    bb = bmesh.new()   # มวย: ช่อบิดเกลียว (ไม่หลอมรวม ให้เห็นเกลียว) · UV ตามช่อ
    roots = fib_dirs(420, lambda d: keep(d) and hairline_ok(d), seed=3)
    for d in roots[::3]:
        tgt = bases[0] if d.x >= 0 else bases[1]
        pts = _walk_to(d, tgt)
        if len(pts) > 3:
            sweep(bm, pts, rnd.uniform(0.032, 0.044), rnd.uniform(0.011, 0.015), w1=0.55, h1=0.6, k=8, taper=2.0)
    _fringe(bm, rnd, [-0.07, -0.035, 0.0, 0.035, 0.07], z_end=0.885)
    parts = []
    for sx, b in zip((1, -1), bases):
        up = (to_dir(b) * 0.55 + V((0, 0, 1)) * 0.45).normalized()
        up = V((up.x * R0.x, up.y * R0.y, up.z * R0.z)).normalized()
        for path in bun_coil(b - up * 0.012, up, r_out=0.056, height=0.078, turns=2.4, strand_r=0.019, twist_turns=6.5):
            sweep(bb, path, 0.034, 0.03, w1=0.4, h1=0.4, k=8, taper=3.0, up_fn=lambda p, up=up: up, uv=True)
        # ยางรัดโคนมวย (วางตามแกนมวย)
        tb = tube_arc('tie', (0, 0, 0), 0.05, 0.0075, 0, 2 * math.pi, tie, H, plane='XY', seg=24, tseg=6, rigid='Head')
        rot = V((0, 0, 1)).rotation_difference(up).to_matrix().to_4x4()
        tb.data.transform(Matrix.Translation(b + up * 0.004) @ rot)
        parts.append(tb)
    hair = fuse('hair', [scalp(keep, m, thick=0.009), bm_obj(bm, m)], m, target_tris=4200)
    # มวย: ช่อบิดเกลียวหลอมเป็นก้อนเดียว (style v3 เรียบ) — ยังเห็นร่องเกลียวนุ่ม ๆ ไม่เป็นเส้นเชือก
    bun = fuse('buns', [bm_obj(bb, m, 'buns')], m, voxel=0.0024, smooth=2, target_tris=2400)
    return [hair, bun] + parts


# =====================================================================
# Side Braid — ผมกวาดไปรวมข้างขวา (ใต้หู) → เปียถักสามเส้นพาดหน้าไหล่ → ยางรัด → ปลายผมบาน
# =====================================================================
def H_braid(c='#b36b2c'):
    m = hair_mat('MAT_Hair_Braid', c, 0.5)
    tie = fab('MAT_Hair_BraidTie', '#3fa36b', None, 0.6)
    rnd = random.Random(7)
    keep = keep_fn(0.42, 0.34)
    G = V((-0.168, -0.035, 0.705))           # จุดรวบผม (ใต้หูขวา ค่อนไปด้านหน้า)
    W = V((-0.1, 0.165, 0.735))              # ผมด้านหลัง/ซ้าย กวาดผ่านท้ายทอยฝั่งขวาก่อน (ไม่มุดใต้กะโหลก)
    bm = bmesh.new()
    roots = fib_dirs(420, lambda d: keep(d) and hairline_ok(d), seed=5)
    for d in roots[::2]:
        if d.x > -0.15 and d.y > 0.05:
            a = _walk_to(d, W, out0=0.008, out1=0.013, stop=0.03)
            b = _walk_to(to_dir(a[-1]), G, out0=0.013, out1=0.013, stop=0.035)
            pts = smooth_path(a[:-1] + b[1:], 3)
        else:
            pts = _walk_to(d, G, out0=0.008, out1=0.013, stop=0.035)
        if len(pts) > 3:
            sweep(bm, pts, rnd.uniform(0.036, 0.046), rnd.uniform(0.011, 0.014), w1=0.5, h1=0.6, k=8, taper=2.2)
    # หน้าม้าปัดข้าง (จากแสกซ้าย กวาดไปทางขวา)
    for i, x in enumerate((0.07, 0.035, 0.0, -0.035)):
        root = sph(math.degrees(math.asin(x / 0.2)) + 8, 60 - i * 2)
        def flow(p, n, t):
            return V((-1.0, -0.35, -0.55 - t)).normalized()
        pts = groom(root, flow, 0.2 + i * 0.02, out0=0.006, out1=0.014, step=0.006)
        sweep(bm, pts, 0.04, 0.013, w1=0.15, h1=0.3, k=8)
    # แกนเปีย: พาดหน้าไหล่ขวา (เว้นทางแขนที่ยกด้านข้าง)
    axis = smooth_path([G, V((-0.178, -0.06, 0.64)), V((-0.184, -0.078, 0.57)), V((-0.18, -0.088, 0.5)), V((-0.172, -0.092, 0.44))], 1)
    dense = []
    for i in range(len(axis) - 1):
        for k in range(12):
            dense.append(axis[i].lerp(axis[i + 1], k / 12))
    dense.append(axis[-1])
    dense = smooth_path(dense, 3)
    # เปีย: 3 ช่อถักสลับ (ไม่หลอมรวม เพื่อให้เห็นลายถักชัด) · UV ตามช่อ → เส้นผมวิ่งตามแต่ละช่อ
    plait = hair_mat('MAT_Hair_Braid_Plait', c, 0.5, nstr=0.7)
    plait['eq_uvmode'] = 'keep'
    bb = bmesh.new()
    for path in braid_strands(dense, width=0.046, depth=0.03, r0=0.02, r1=0.012, cycles=5.0):
        sweep(bb, path, 0.03, 0.021, w1=0.62, h1=0.62, k=12, taper=1.0, up_fn=lambda p: V((p.x, p.y, 0)).normalized(), uv=True)
    end = dense[-1]
    T = (dense[-1] - dense[-4]).normalized()
    # ปลายผมหลังยางรัด: ช่อเล็กบานออกแล้วเรียวแหลม
    for k in range(6):
        a = 2 * math.pi * k / 6
        side = T.orthogonal().normalized()
        off = Matrix.Rotation(a, 3, T) @ side
        pts = [end + T * (0.004 * i) + off * (0.004 + 0.0035 * i) * (1 - i / 14) for i in range(14)]
        sweep(bb, smooth_path(pts, 1), 0.016, 0.012, w1=0.15, h1=0.25, k=6, uv=True)
    tb = tube_arc('tie', (0, 0, 0), 0.0135, 0.0055, 0, 2 * math.pi, tie, H, plane='XY', seg=16, tseg=6, rigid='Head')
    tb.data.transform(Matrix.Translation(end + T * 0.003) @ V((0, 0, 1)).rotation_difference(T).to_matrix().to_4x4())
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, target_tris=6000)
    return [hair, bm_obj(bb, plait, 'plait'), tb]


# =====================================================================
# Spiky — ช่อผมตั้งโค้งเรียวปลาย 3 ชั้น (หน้า→หลัง) หนาบางต่างกัน ต่อจากหนังศีรษะเนียน
# =====================================================================
def _lock_path(root, lean, length, bend, n=16, lift=0.0):
    """ช่อผมก้อนใหญ่: ออกจากหนังศีรษะ (แนบผิวช่วงแรก) แล้วโค้งไปทาง lean · lift = ยกออกจากผิว"""
    p0, nrm = surf(root, -0.004)
    lean = V(lean).normalized()
    tan0 = (lean - nrm * lean.dot(nrm)).normalized()
    pts = [p0]
    for i in range(1, n):
        t = i / (n - 1)
        dirn = (tan0 * (1 - t) + lean * t * bend + nrm * (lift * (1 - t) + 0.15)).normalized()
        pts.append(pts[-1] + dirn * (length / (n - 1)))
    return smooth_path(pts, 2)

def H_spiky(c='#3f8bff'):
    """ผมชี้สไตล์การ์ตูน: ช่อผมก้อนใหญ่แบน (กว้าง 6–9 ซม.) ซ้อน 3 ชั้น โค้งขึ้น-ไปหลัง เรียวแหลม ฐานกลืนกับหนังศีรษะ"""
    m = hair_mat('MAT_Hair_Spiky', c, 0.42)
    rnd = random.Random(9)
    keep = keep_fn(0.40, 0.28)
    bm = bmesh.new()
    # ชั้นล่าง (ข้าง/หลัง): ช่อแหลมชี้ลง-ไปหลัง แนบหัว
    for az in range(100, 270, 24):
        if 150 < az < 210:
            continue
        for el in (-8, 14):
            d = sph(az + rnd.uniform(-6, 6), el + rnd.uniform(-4, 4))
            back = V((math.sin(math.radians(az)) * 0.4, 0.8, -0.9))
            pts = _lock_path(d, back, rnd.uniform(0.07, 0.095), bend=0.6, lift=0.1)
            sweep(bm, pts, rnd.uniform(0.06, 0.075), rnd.uniform(0.022, 0.028), w1=0.1, h1=0.2, k=10, taper=1.1)
    for az in (150, 180, 210):   # ท้ายทอย
        d = sph(az, 5)
        pts = _lock_path(d, V((0, 0.5, -1)), 0.08, bend=0.6, lift=0.1)
        sweep(bm, pts, 0.07, 0.026, w1=0.1, h1=0.2, k=10, taper=1.1)
    # ชั้นกลาง + บน: ช่อตั้งโค้งขึ้นแล้วชี้ไปด้านหลัง (ยิ่งหน้ายิ่งสูง)
    for el in (38, 56, 72):
        for az in range(-150, 151, 30 if el < 60 else 45):
            d = sph(az + rnd.uniform(-8, 8), el + rnd.uniform(-4, 4))
            side = math.sin(math.radians(az))
            lean = V((side * 0.7, 0.9, 0.35 + 0.25 * (el > 50)))
            pts = _lock_path(d, lean, rnd.uniform(0.09, 0.12) + 0.02 * max(0.0, -d.y), bend=0.75, lift=0.55)
            w = rnd.uniform(0.062, 0.085)
            sweep(bm, pts, w, w * rnd.uniform(0.34, 0.42), w1=0.08, h1=0.18, k=10, taper=1.0)
    # หน้าม้าแหลม 4 ช่อ ชี้ลงเฉียงข้าง (เหนือคิ้ว ไม่ปิดตา)
    for x, sw in ((-0.075, -0.6), (-0.028, -0.25), (0.02, 0.25), (0.068, 0.6)):
        d = sph(math.degrees(math.asin(x / 0.2)), 52)
        pts = _lock_path(d, V((sw, -0.55, -1)), 0.075, bend=0.55, lift=0.15)
        sweep(bm, pts, 0.06, 0.022, w1=0.08, h1=0.2, k=10, taper=1.0)
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, voxel=0.0026, target_tris=7000)
    return [hair]


# =====================================================================
# ทรงอื่น ๆ (เดิม 7 ทรง ออกแบบใหม่ด้วยช่อผม)
# =====================================================================
def _cover(bm, rnd, roots, flow_of, length_of, w=(0.04, 0.05), h=(0.012, 0.015), w1=0.32, **kw):
    for d in roots:
        pts = groom(d, flow_of(d), length_of(d), **kw)
        sweep(bm, pts, rnd.uniform(*w), rnd.uniform(*h), w1=w1, h1=0.45, k=8, taper=1.8)

def _straight_bangs(bm, rnd, xs, z_end=0.878, w=0.04):
    for x in xs:
        d = sph(math.degrees(math.asin(max(-0.95, min(0.95, x / 0.2)))), 62 + rnd.uniform(-3, 3))
        pts = groom(d, lambda p, n, t: V((0, -0.5, -1)).normalized(), 0.2, out0=0.008, out1=0.014, step=0.006, stop_z=z_end)
        sweep(bm, pts, w * rnd.uniform(0.9, 1.1), 0.013, w1=0.25, h1=0.4, k=8, taper=1.2)

CROWN = sph(180, 68)

def H_crop(c='#3b2a24'):
    """สั้นรองทรง: ช่อสั้นไหลออกจากขวัญ (หน้า→ปัดลงหน้าผาก · ข้าง/หลัง→ลง แนบหัว) ปลายมน"""
    m = hair_mat('MAT_Hair_Crop', c, 0.5)
    rnd = random.Random(31)
    keep = keep_fn(0.40, 0.28)
    bm = bmesh.new()
    roots = fib_dirs(360, lambda d: keep(d) and hairline_ok(d), seed=31)[::2]
    cw = surf(CROWN)[0]
    _cover(bm, rnd, roots, lambda d: away_from_pt(cw, 0.35), lambda d: rnd.uniform(0.075, 0.095) + 0.02 * max(0.0, -d.y),
           w=(0.05, 0.06), h=(0.009, 0.011), w1=0.35, out0=0.007, out1=0.01, step=0.006, stop_z=0.75)
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, smooth=4, target_tris=6500)
    return [hair]

def away_from_pt(c, down):
    c = V(c)
    def f(p, n, t):
        a = p - c
        return (a.normalized() + V((0, 0, -down))).normalized()
    return f

def H_side(c='#1f1b24'):
    """แสกข้าง: แสกซ้าย · ผมสองฝั่งไหลออกจากแนวแสก · ช่อปัดเฉียงคลุมหน้าผากไปทางขวา"""
    m = hair_mat('MAT_Hair_SidePart', c, 0.48)
    rnd = random.Random(37)
    keep = keep_fn(0.42, 0.28)
    bm = bmesh.new()
    part_x = 0.075
    def flow_of(d):
        def f(p, n, t):
            side = 1.0 if p.x > part_x else -1.0
            return V((side * 0.8, 0.25 if p.y > 0 else -0.1, -0.7 - t)).normalized()
        return f
    roots = fib_dirs(380, lambda d: keep(d) and hairline_ok(d), seed=37)[::2]
    roots = [d for d in roots if not (d.y < -0.2 and d.z > 0.45)]   # หน้าผากใช้ช่อปัดแทน
    _cover(bm, rnd, roots, flow_of, lambda d: rnd.uniform(0.08, 0.11), out0=0.008, out1=0.014, step=0.006, stop_z=0.74)
    for i in range(7):   # ช่อปัด
        d = sph(math.degrees(math.asin(part_x / 0.2)) - 4 + i * 1.5, 70 - i * 3.5)
        pts = groom(d, lambda p, n, t: V((-1.0, -0.4, -0.35 - 0.7 * t)).normalized(), 0.15 + i * 0.012, out0=0.01, out1=0.02, step=0.006,
                    stop_z=0.86)
        sweep(bm, pts, 0.05, 0.016, w1=0.15, h1=0.3, k=8, taper=1.3)
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, target_tris=6500)
    return [hair]

def H_bob(c='#8a4b2a'):
    """บ๊อบ: ผมตรงยาวระดับคาง ปลายงุ้มเข้า · หน้าม้าตรง"""
    m = hair_mat('MAT_Hair_Bob', c, 0.5)
    rnd = random.Random(41)
    keep = keep_fn(0.44, 0.3)
    bm = bmesh.new()
    cw = surf(sph(180, 80))[0]
    roots = fib_dirs(420, lambda d: keep(d) and hairline_ok(d) and not (d.y < -0.35 and d.z > 0.3), seed=41)[::2]
    _underlayer(bm, rnd, keep, 0.665, seed=42)
    for d in roots:
        inward = V((-d.x, -d.y * 0.3, 0)).normalized() if abs(d.x) + abs(d.y) > 0.05 else V((0, 0, 1))
        ax = V((0, 0, 1)).cross(inward).normalized() if inward.length > 0 else V((1, 0, 0))
        pts = groom(d, away_from_pt(cw, 0.9), 0.26, out0=0.009, out1=0.016, step=0.007, stop_z=0.665,
                    curl_end=(ax, -0.9) if ax.length > 0 else None, min_y=-0.06)
        sweep(bm, pts, rnd.uniform(0.046, 0.058), rnd.uniform(0.013, 0.017), w1=0.45, h1=0.55, k=8, taper=1.8)
    _straight_bangs(bm, rnd, [-0.1, -0.065, -0.03, 0.005, 0.04, 0.075, 0.105])
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, target_tris=7000)
    return [hair]

def H_pony(c='#d9a441'):
    """หางม้า: ผมรวบเรียบไปด้านหลัง → ยางรัด → หางม้าช่อใหญ่ห้อยโค้ง ปลายเรียว"""
    m = hair_mat('MAT_Hair_Ponytail', c, 0.46)
    band = fab('MAT_Hair_Band_Pink', '#e85d75', None, 0.6)
    rnd = random.Random(43)
    keep = keep_fn(0.42, 0.34)
    P = V((0, 0.205, 0.9))
    bm = bmesh.new()
    roots = fib_dirs(560, lambda d: keep(d) and hairline_ok(d), seed=43)[::2]
    for d in roots:
        pts = _walk_to(d, P, out0=0.007, out1=0.011, stop=0.03)
        if len(pts) > 3:
            sweep(bm, pts, rnd.uniform(0.046, 0.056), rnd.uniform(0.011, 0.013), w1=0.55, h1=0.6, k=8, taper=2.0)
    _straight_bangs(bm, rnd, [-0.06, -0.02, 0.02, 0.06], z_end=0.9, w=0.036)
    for k in range(22):   # หางม้า: ช่อห้อยโค้ง S (มัดใหญ่ แน่น)
        a = 2 * math.pi * k / 22
        off = V((math.cos(a) * 0.028, math.sin(a) * 0.02, 0)) * (0.55 if k % 2 else 1.0)
        pts = [P + off + V((0, 0.02, 0))]
        L = rnd.uniform(0.26, 0.31)
        for i in range(1, 22):
            t = i / 21
            pts.append(P + off * (1 + 1.3 * math.sin(t * math.pi * 0.8)) + V((0.006 * math.sin(t * 5 + k), 0.04 + 0.035 * math.sin(t * math.pi * 0.9), -L * t)))
        sweep(bm, smooth_path(pts, 2), 0.046, 0.03, w1=0.12, h1=0.2, k=8, taper=1.2, up_fn=lambda p: V((p.x, p.y - P.y, 0)).normalized() if abs(p.x) + abs(p.y - P.y) > 1e-4 else V((0, 1, 0)))
    tb = tube_arc('band', (0, 0, 0), 0.03, 0.0085, 0, 2 * math.pi, band, H, plane='XY', seg=18, tseg=6, rigid='Head')
    tb.data.transform(Matrix.Translation(P + V((0, 0.018, -0.005))) @ V((0, 0, 1)).rotation_difference(V((0, 0.55, -0.83))).to_matrix().to_4x4())
    hair = fuse('hair', [scalp(keep, m, thick=0.012), bm_obj(bm, m)], m, target_tris=7500)
    return [hair, tb]

def _underlayer(bm, rnd, keep, stop_z, seed=0, wave=None):
    """ชั้นผมด้านใน (ช่อกว้าง แนบหัว) ใต้ชั้นนอก — ปิดช่องว่างระหว่างช่อผมที่ห้อยลง ไม่เห็นคอ/ฉากหลังลอดผม"""
    cw = surf(sph(180, 82))[0]
    for d in fib_dirs(200, lambda d: keep(d) and hairline_ok(d) and d.z < 0.45 and d.y > -0.25, seed=seed):
        pts = groom(d, away_from_pt(cw, 1.0), 0.5, out0=0.003, out1=0.006, step=0.008, stop_z=stop_z + 0.02, wave=wave, min_y=0.07 if d.y > -0.05 else None)
        sweep(bm, pts, 0.075, 0.02, w1=0.6, h1=0.6, k=8, taper=2.0)

def _long(m, rnd, keep, stop_z, wave=None, seed=47, bangs=True):
    bm = bmesh.new()
    _underlayer(bm, rnd, keep, stop_z, seed=seed + 1, wave=wave)
    cw = surf(sph(180, 82))[0]
    roots = fib_dirs(460, lambda d: keep(d) and hairline_ok(d) and not (d.y < -0.35 and d.z > 0.3), seed=seed)[::2]
    for d in roots:
        front = d.y < -0.32 and abs(d.x) > 0.45          # ปอยหน้าไหล่ (ผมข้างหน้า)
        pts = groom(d, away_from_pt(cw, 0.9), 0.5, out0=0.009, out1=0.016, step=0.008, stop_z=stop_z + rnd.uniform(-0.02, 0.02),
                    wave=wave, max_y=-0.055 if front else None, min_y=None if front else 0.085)
        sweep(bm, pts, rnd.uniform(0.046, 0.058), rnd.uniform(0.013, 0.017), w1=0.25, h1=0.35, k=8, taper=1.6)
    if bangs:
        _straight_bangs(bm, rnd, [-0.09, -0.055, -0.02, 0.015, 0.05, 0.085])
    return bm

def H_long(c='#2a1c2e'):
    """ผมยาวตรง: ร่วงลงหลังไหล่ (เว้นช่องที่แขนยกผ่าน) · ปอยหน้าไหล่สองข้าง · หน้าม้า"""
    m = hair_mat('MAT_Hair_Long', c, 0.45)
    rnd = random.Random(47)
    keep = keep_fn(0.44, 0.32)
    bm = _long(m, rnd, keep, 0.47)
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, target_tris=8000)
    return [hair]

def H_wavy(c='#6b3e26'):
    """ผมยาวลอนคลื่น: ช่อผมเป็นลอนต่อเนื่องตั้งแต่ระดับหู"""
    m = hair_mat('MAT_Hair_Wavy', c, 0.5)
    rnd = random.Random(53)
    keep = keep_fn(0.44, 0.32)
    bm = _long(m, rnd, keep, 0.45, wave=(0.009, 0.075), seed=53)
    hair = fuse('hair', [scalp(keep, m), bm_obj(bm, m)], m, target_tris=8000)
    return [hair]

def H_curly(c='#3a2418'):
    """ผมหยิก: ลอนก้อนกลม (ขดสั้นอ้วน 1–1.3 รอบ) ซ้อนกันหนาแน่นจนเป็นทรงฟู หลอมเป็นผิวเดียว + ลายเส้นผม"""
    m = hair_mat('MAT_Hair_Curly', c, 0.62, nstr=0.45)
    rnd = random.Random(59)
    keep = keep_fn(0.40, 0.25)
    bm = bmesh.new()
    roots = fib_dirs(150, lambda d: keep(d) and hairline_ok(d), seed=59)
    for d in roots:
        p0, n = surf(d, 0.012)
        down = (V((0, 0, -1)) - n * (-n.z))
        down = down.normalized() if down.length > 1e-3 else n.orthogonal().normalized()
        axis = (n * 0.8 + down * 0.2).normalized()
        u = axis.orthogonal().normalized(); v_ = axis.cross(u)
        L = rnd.uniform(0.022, 0.03); r = rnd.uniform(0.011, 0.014); turns = rnd.uniform(1.0, 1.3); ph = rnd.uniform(0, 6.28)
        pts = []
        for i in range(18):
            t = i / 17
            a = ph + 2 * math.pi * turns * t
            pts.append(p0 + axis * (L * t) + (u * math.cos(a) + v_ * math.sin(a)) * r)
        sweep(bm, pts, 0.03, 0.026, w1=0.6, h1=0.6, k=8, taper=1.0, up_fn=lambda p, axis=axis: axis)
    hair = fuse('hair', [scalp(keep, m, grow=1.0, thick=0.022), bm_obj(bm, m)], m, voxel=0.0026, smooth=4, target_tris=8000)
    return [hair]
