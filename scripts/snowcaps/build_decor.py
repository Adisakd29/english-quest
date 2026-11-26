"""
v1.26.0 — ของตกแต่งคริสต์มาสแบบเวกเตอร์ (ต้นฉบับ สร้างด้วยโค้ด) → public/img/snow/
  garland.svg : พวงมาลัยใบสนโค้งห้อย 2 ช่วง + ไฟสีทองอุ่น + โบว์แดงที่จุดยึด (ใบสนหลายชั้น ไล่สีเข้ม-อ่อน ไม่ใช่เส้นหยัก)
  wreath.svg  : พวงหรีดใบสน + ลูกเบอร์รี่ + โบว์ริบบิ้น
  python3 scripts/snowcaps/build_decor.py
"""
import math, os, random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img', 'snow')
os.makedirs(OUT, exist_ok=True)
GREENS = ['#0F3D26', '#145232', '#1B6A40', '#23814E', '#2E9A5E']


def needle_cluster(r, cx, cy, ang, length, n=9, shade=0):
    """กระจุกใบสน: เข็มเรียวหลายเส้นกระจายเป็นพัด"""
    out = []
    for k in range(n):
        a = ang + (k - (n - 1) / 2) * 0.22 + r.uniform(-0.08, 0.08)
        L = length * r.uniform(0.7, 1.05)
        x2, y2 = cx + math.cos(a) * L, cy + math.sin(a) * L
        w = length * 0.09
        nx, ny = -math.sin(a) * w, math.cos(a) * w
        col = GREENS[min(len(GREENS) - 1, max(0, shade + r.randint(0, 2)))]
        out.append(f'<path d="M{cx + nx:.0f} {cy + ny:.0f}Q{(cx + x2) / 2 + nx * 0.6:.0f} {(cy + y2) / 2 + ny * 0.6:.0f} {x2:.0f} {y2:.0f}Q{(cx + x2) / 2 - nx * 0.6:.0f} {(cy + y2) / 2 - ny * 0.6:.0f} {cx - nx:.0f} {cy - ny:.0f}Z" fill="{col}"/>')
    return ''.join(out)


def bulb(cx, cy, s, glow=True):
    g = f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{s * 3.2:.1f}" fill="url(#bglow)"/>' if glow else ''
    return (g + f'<rect x="{cx - s * 0.45:.1f}" y="{cy - s * 1.35:.1f}" width="{s * 0.9:.1f}" height="{s * 0.6:.1f}" rx="{s * 0.15:.1f}" fill="#8C6A2A"/>'
            f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{s * 0.7:.1f}" ry="{s:.1f}" fill="url(#bulb)"/>'
            f'<ellipse cx="{cx - s * 0.22:.1f}" cy="{cy - s * 0.35:.1f}" rx="{s * 0.18:.1f}" ry="{s * 0.3:.1f}" fill="#FFF8E0" opacity=".85"/>')


def bow(cx, cy, s):
    return (f'<path d="M{cx:.1f} {cy:.1f} C{cx - s * 1.6:.1f} {cy - s * 1.1:.1f} {cx - s * 1.9:.1f} {cy + s * 0.6:.1f} {cx:.1f} {cy:.1f}Z" fill="url(#ribbon)"/>'
            f'<path d="M{cx:.1f} {cy:.1f} C{cx + s * 1.6:.1f} {cy - s * 1.1:.1f} {cx + s * 1.9:.1f} {cy + s * 0.6:.1f} {cx:.1f} {cy:.1f}Z" fill="url(#ribbon)"/>'
            f'<path d="M{cx - s * 0.2:.1f} {cy:.1f} L{cx - s * 0.9:.1f} {cy + s * 1.9:.1f} L{cx - s * 0.45:.1f} {cy + s * 1.7:.1f} L{cx - s * 0.2:.1f} {cy + s * 2.0:.1f}Z" fill="#9E1B26"/>'
            f'<path d="M{cx + s * 0.2:.1f} {cy:.1f} L{cx + s * 0.9:.1f} {cy + s * 1.9:.1f} L{cx + s * 0.45:.1f} {cy + s * 1.7:.1f} L{cx + s * 0.2:.1f} {cy + s * 2.0:.1f}Z" fill="#B8232F"/>'
            f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{s * 0.42:.1f}" ry="{s * 0.36:.1f}" fill="#C62B38"/>')


DEFS = '''<defs>
<radialGradient id="bulb" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FFF6D0"/><stop offset=".45" stop-color="#FFC861"/><stop offset="1" stop-color="#E08A1E"/></radialGradient>
<radialGradient id="bglow"><stop offset="0" stop-color="#FFD27A" stop-opacity=".55"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient>
<linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0505C"/><stop offset="1" stop-color="#A81D2A"/></linearGradient>
<radialGradient id="berry" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FF9A9A"/><stop offset=".45" stop-color="#D42A35"/><stop offset="1" stop-color="#7A0D18"/></radialGradient>
</defs>'''


def garland():
    W, H = 1200, 120
    r = random.Random(4)
    body = []
    anchors = [0, 400, 800, 1200]
    lights = []
    for i in range(3):
        x0, x1 = anchors[i], anchors[i + 1]
        sag = 62
        pts = []
        for k in range(61):
            t = k / 60
            x = x0 + (x1 - x0) * t
            y = 14 + sag * 4 * t * (1 - t)
            pts.append((x, y))
        for layer, (shade, length, dens) in enumerate(((0, 36, 2), (1, 30, 2), (2, 22, 3))):
            for k in range(0, len(pts), dens):
                x, y = pts[k]
                tang = math.atan2(pts[min(k + 1, 60)][1] - pts[max(k - 1, 0)][1], pts[min(k + 1, 60)][0] - pts[max(k - 1, 0)][0])
                for side in (-1, 1):
                    a = tang + side * (math.pi / 2 - 0.5) + r.uniform(-0.4, 0.4) + (math.pi if side < 0 else 0) * 0
                    body.append(needle_cluster(r, x + r.uniform(-3, 3), y + r.uniform(-3, 3), a if side > 0 else a + math.pi, length * r.uniform(0.75, 1.1), n=5, shade=shade))
        for k in range(4, 60, 7):
            x, y = pts[k]
            lights.append(bulb(x + r.uniform(-4, 4), y + 10 + r.uniform(-3, 5), 5.2))
    snow = []
    for i in range(3):
        x0, x1 = anchors[i], anchors[i + 1]
        for k in range(2, 59, 3):
            t = k / 60; x = x0 + (x1 - x0) * t; y = 14 + 62 * 4 * t * (1 - t) - 9
            snow.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r.uniform(6, 11):.1f}" ry="{r.uniform(2, 3.4):.1f}" fill="#F4F8FD" opacity=".92"/>')
    bows = ''.join(bow(x, 14, 11) for x in anchors[1:-1]) + bow(14, 14, 10) + bow(W - 14, 14, 10)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{DEFS}<g>{"".join(body)}</g><g>{"".join(lights)}</g>{bows}</svg>'
    open(os.path.join(OUT, 'garland.svg'), 'w').write(svg)


def wreath():
    S = 220; c = S / 2; R = 72
    r = random.Random(9)
    parts = []
    for layer, (shade, length) in enumerate(((0, 40), (1, 34), (2, 26))):
        for k in range(64):
            a = 2 * math.pi * k / 64 + r.uniform(-0.05, 0.05)
            rr = R + r.uniform(-12, 12)
            x, y = c + math.cos(a) * rr, c + math.sin(a) * rr
            parts.append(needle_cluster(r, x, y, a + math.pi / 2 + r.uniform(-0.6, 0.6), length * r.uniform(0.7, 1.1), n=6, shade=shade))
    for k in range(9):
        a = r.uniform(0, 2 * math.pi); rr = R + r.uniform(-6, 8)
        x, y = c + math.cos(a) * rr, c + math.sin(a) * rr
        for j in range(3):
            parts.append(f'<circle cx="{x + r.uniform(-6, 6):.1f}" cy="{y + r.uniform(-6, 6):.1f}" r="5.2" fill="url(#berry)"/>')
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.3
        parts.append(bulb(c + math.cos(a) * (R + 4), c + math.sin(a) * (R + 4), 4.2))
    parts.append(bow(c, c + R + 4, 24))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">{DEFS}{"".join(parts)}</svg>'
    open(os.path.join(OUT, 'wreath.svg'), 'w').write(svg)


garland(); wreath()
for f in ('garland.svg', 'wreath.svg'):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
