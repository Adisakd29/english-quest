"""
v1.26.0 — สันหิมะเกาะขอบเมนู (SVG ต้นฉบับ สร้างด้วยโค้ด) → public/img/snow/*.svg
  ทรงธรรมชาติ: ความหนาไม่สม่ำเสมอ (noise หลายความถี่) · ก้อนหิมะพูนเป็นช่วง · หยดย้อยบางจุด · 2 ชั้น (ชั้นหลังเงาฟ้า + ชั้นหน้าขาว)
  แสงเงา: ไล่สีบน→ล่าง · เส้นประกายด้านบน · เงาใต้สัน (filter ใน CSS)
  ความกว้างไทล์ 1200px (ซ้ำแนวนอนน้อยมากจนมองไม่เห็นรูปแบบ)
  python3 scripts/snowcaps/build_snowcaps.py
"""
import math, os, random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img', 'snow')
os.makedirs(OUT, exist_ok=True)
W = 1200


def noise(seed, n=7):
    r = random.Random(seed)
    waves = [(r.uniform(0.6, 1.0) / (k + 1) ** 0.9, (k + 1) * r.choice([1, 2, 3]), r.uniform(0, 6.28)) for k in range(n)]
    def f(x):
        u = x / W * 2 * math.pi
        return sum(a * math.sin(fr * u * 3 + ph) for a, fr, ph in waves)   # ต่อเนื่องกันที่ขอบไทล์ (คาบ = W)
    return f


def lumps(seed, count, wmin, wmax, hmin, hmax):
    r = random.Random(seed)
    xs = sorted(r.uniform(0, W) for _ in range(count))
    return [(x, r.uniform(wmin, wmax), r.uniform(hmin, hmax)) for x in xs]


def bump(x, L):
    v = 0.0
    for cx, w, h in L:
        for off in (-W, 0, W):   # วนรอบไทล์
            d = (x - cx - off) / w
            if abs(d) < 1: v = max(v, h * (1 - d * d) ** 0.55)   # ก้อนกลมมน (หมอนหิมะ)
    return v


def edge(seed, base, amp, L, step=6):
    f = noise(seed)
    return [(x, base + amp * f(x) + bump(x, L)) for x in range(0, W + 1, step)]


def smooth(pts):
    """Catmull-Rom → Bezier (ขอบนุ่ม ไม่หยักเป็นฟันเลื่อย)"""
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.2f} '
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.1f} {c1[1]:.2f} {c2[0]:.1f} {c2[1]:.2f} {p2[0]:.1f} {p2[1]:.2f} '
    return d


def drip_paths(seed, pts, n, maxlen):
    r = random.Random(seed)
    out = []
    for _ in range(n):
        i = r.randrange(4, len(pts) - 4)
        x, y = pts[i]
        L = r.uniform(maxlen * 0.35, maxlen); w = r.uniform(2.2, 4.2)
        out.append(f'M{x - w:.1f} {y - 1:.1f} Q{x - w * 0.4:.1f} {y + L * 0.5:.1f} {x:.1f} {y + L:.1f} Q{x + w * 0.4:.1f} {y + L * 0.5:.1f} {x + w:.1f} {y - 1:.1f}Z')
    return ' '.join(out)


def cap_hang(name, tone, H=26, icicles=0):
    """สันหิมะห้อยใต้แถบบน"""
    front = edge(23, 7.0, 1.0, lumps(7, 14, 34, 100, 3, 11))
    back = [(x, y + 2.2 + 0.8 * math.sin(x * 0.05)) for x, y in front]   # ด้านล่างของหิมะ (เงาฟ้าอ่อน)
    fb = smooth(back); ff = smooth(front)
    c = TONES[tone]
    ic = ''
    if icicles:
        ic = f'<path d="{drip_paths(5, front, icicles, H - 8)}" fill="url(#ic)" opacity=".9"/>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c['top']}"/><stop offset=".55" stop-color="{c['top']}"/><stop offset="1" stop-color="{c['bot']}"/></linearGradient>
<linearGradient id="ic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c['top']}"/><stop offset="1" stop-color="{c['ice']}" stop-opacity=".35"/></linearGradient></defs>
<path d="{fb} V0 H0Z" fill="{c['shade']}" opacity=".7"/>
{ic}
<path d="{ff} V0 H0Z" fill="url(#g)"/>
<path d="{ff}" fill="none" stroke="{c['rim']}" stroke-width="1.2" opacity="{c['rim_o']}"/>
<path d="M0 1.4 H{W}" stroke="{c['glint']}" stroke-width="1.2" opacity=".8"/>
</svg>'''
    open(os.path.join(OUT, f'{name}.svg'), 'w').write(svg.replace('\n', ''))


def cap_pile(name, tone, H=20):
    """หิมะกองบนขอบบนของเมนูล่าง (สูงขึ้นจากขอบ)"""
    front = [(x, H - y) for x, y in edge(41, 7.0, 0.9, lumps(17, 14, 34, 110, 2, 8))]
    back = [(x, y + 1.6) for x, y in front]
    c = TONES[tone]
    fb = smooth(back); ff = smooth(front)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c['top']}"/><stop offset="1" stop-color="{c['bot']}"/></linearGradient></defs>
<path d="{fb} V{H} H0Z" fill="{c['shade']}" opacity=".5"/>
<path d="{ff} V{H} H0Z" fill="url(#g)"/>
<path d="{ff}" fill="none" stroke="{c['glint']}" stroke-width="1.1" opacity=".9"/>
</svg>'''
    open(os.path.join(OUT, f'{name}.svg'), 'w').write(svg.replace('\n', ''))


def clump(name, tone, w=46, h=16, seed=1):
    """ก้อนหิมะเกาะมุมการ์ด/โลโก้"""
    r = random.Random(seed)
    pts = []
    for k in range(13):
        x = w * k / 12
        y = h - (h * 0.75 * math.sin(math.pi * k / 12) ** 0.7 + r.uniform(-1, 1.2))
        pts.append((x, max(1.5, min(h, y))))
    c = TONES[tone]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c['top']}"/><stop offset="1" stop-color="{c['bot']}"/></linearGradient></defs>
<path d="{smooth(pts)} L{w} {h} H0Z" fill="url(#g)"/><path d="{smooth(pts)}" fill="none" stroke="{c['glint']}" stroke-width=".9" opacity=".9"/>
</svg>'''
    open(os.path.join(OUT, f'{name}.svg'), 'w').write(svg.replace('\n', ''))


TONES = {
    # ธีมมืด/เทศกาล: หิมะขาวนวล เงาฟ้า
    'dark': dict(top='#FFFFFF', bot='#D3E2F3', shade='#C4D6EB', rim='#AFC4DE', rim_o='.6', glint='#FFFFFF', ice='#BFE3FF'),
    # ธีมสว่าง/พาสเทล: ขอบล่างเข้มขึ้นเล็กน้อยเพื่อให้เห็นบนพื้นสว่าง
    'light': dict(top='#FFFFFF', bot='#DCE6F3', shade='#BFCDE0', rim='#93A8C6', rim_o='.8', glint='#FFFFFF', ice='#A9CDEB'),
}
for t in TONES:
    cap_hang(f'cap-hang-{t}', t)
    cap_hang(f'cap-hang-ice-{t}', t, H=30, icicles=14)
    cap_pile(f'cap-pile-{t}', t)
    clump(f'clump-{t}', t, seed=3)
print(sorted(os.listdir(OUT)))
