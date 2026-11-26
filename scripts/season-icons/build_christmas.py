"""
โลโก้/ไอคอนแอปธีมคริสต์มาส (v1.25.0) — จิ้งจอกตัวเดิม + หมวกซานต้า + ผ้าพันคอถักสีแดง ยืนบนเนินหิมะ
หมู่บ้านเล็กไฟอุ่น ๆ ต้นสนมีหิมะเกาะ เกล็ดหิมะ — ออกแบบเองทั้งหมด (ไม่อ้างอิงตัวละคร/แบรนด์ใด)
  python3 scripts/season-icons/build_christmas.py
ผลลัพธ์: public/img/season/christmas/ (ชื่อไฟล์เดียวกับไอคอนปกติ) — /brand/<ไฟล์> เลือกให้อัตโนมัติช่วงเทศกาล (config/season.js icons)
"""
import asyncio, base64, json, os, random, subprocess, sys, tempfile
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'img', 'season', 'christmas')
TMP = tempfile.mkdtemp(prefix='xmicon-')
subprocess.run([sys.executable, os.path.join(HERE, 'extract_fox.py'), TMP], check=True)
GEO = json.load(open(os.path.join(TMP, 'fox.json')))
FOX = base64.b64encode(open(os.path.join(TMP, 'fox.png'), 'rb').read()).decode()
S = 1024


def pine(x, y, h, snow=True):
    w = h * 0.62
    tiers = ''
    for k, (t0, t1, ww) in enumerate(((0.0, 0.42, 0.55), (0.25, 0.7, 0.78), (0.5, 1.0, 1.0))):
        ty, by = y - h + t0 * h, y - h + t1 * h
        tiers += f'<path d="M{x} {ty:.1f} L{x + w * ww / 2:.1f} {by:.1f} L{x - w * ww / 2:.1f} {by:.1f}Z" fill="#1F6A4C"/>'
        if snow:
            tiers += f'<path d="M{x} {ty:.1f} L{x + w * ww * 0.22:.1f} {ty + (by - ty) * 0.42:.1f} Q{x} {ty + (by - ty) * 0.52:.1f} {x - w * ww * 0.22:.1f} {ty + (by - ty) * 0.42:.1f}Z" fill="#F7F9FC"/>'
    return f'<rect x="{x - h * 0.04:.1f}" y="{y - h * 0.02:.1f}" width="{h * 0.08:.1f}" height="{h * 0.1:.1f}" fill="#4A2F22"/>' + tiers


def house(x, y, w):
    h = w * 0.7
    return (f'<rect x="{x}" y="{y - h:.1f}" width="{w}" height="{h:.1f}" fill="#2C4F7C"/>'
            f'<path d="M{x - w * 0.12:.1f} {y - h:.1f} L{x + w / 2:.1f} {y - h - w * 0.5:.1f} L{x + w * 1.12:.1f} {y - h:.1f}Z" fill="#F7F9FC"/>'
            f'<rect x="{x + w * 0.2:.1f}" y="{y - h * 0.7:.1f}" width="{w * 0.22:.1f}" height="{w * 0.22:.1f}" fill="#FFBF66"/>'
            f'<rect x="{x + w * 0.58:.1f}" y="{y - h * 0.7:.1f}" width="{w * 0.22:.1f}" height="{w * 0.22:.1f}" fill="#FFBF66"/>')


def scene(ratio, detail=True, fox_y=0.5, hat=True, scarf=True):
    scale = ratio * S / max(GEO['w'], GEO['h'])
    fw, fh = GEO['w'] * scale, GEO['h'] * scale
    fx = S / 2 - GEO['visCx'] * fw
    fx = max(S * 0.04, min(S - fw - S * 0.04, fx))
    fy = S * fox_y - fh / 2
    rnd = random.Random(25)
    flakes = ''.join(f'<circle cx="{rnd.uniform(0, S):.1f}" cy="{rnd.uniform(0, S * 0.78):.1f}" r="{rnd.uniform(3, 9):.1f}" fill="#FFFFFF" opacity="{rnd.uniform(0.35, 0.9):.2f}"/>' for _ in range(46)) if detail else ''
    village = (house(S * 0.06, S * 0.79, S * 0.12) + house(S * 0.8, S * 0.8, S * 0.13) + pine(S * 0.22, S * 0.82, S * 0.2) + pine(S * 0.74, S * 0.81, S * 0.17)
               + pine(S * 0.93, S * 0.83, S * 0.22)) if detail else ''
    # หมวกซานต้า: ขอบขนอยู่บนหัวระหว่างหู · กรวยแดงพับปลายไปทางขวา · ปอมปอม
    hx0, hx1 = fx + fw * 0.2, fx + fw * 0.56
    hy = fy + fh * 0.1
    hat_svg = (f'<path d="M{hx0:.1f} {hy:.1f} Q{(hx0 + hx1) / 2:.1f} {hy - fh * 0.34:.1f} {hx1 + fw * 0.2:.1f} {hy - fh * 0.12:.1f} '
               f'Q{hx1 + fw * 0.05:.1f} {hy - fh * 0.1:.1f} {hx1:.1f} {hy:.1f}Z" fill="#C63D3D" stroke="#8E2430" stroke-width="{S * 0.006:.1f}"/>'
               f'<circle cx="{hx1 + fw * 0.21:.1f}" cy="{hy - fh * 0.1:.1f}" r="{fw * 0.06:.1f}" fill="#FBF7EE" stroke="#CFE8F7" stroke-width="{S * 0.004:.1f}"/>'
               f'<rect x="{hx0 - fw * 0.03:.1f}" y="{hy - fh * 0.035:.1f}" width="{hx1 - hx0 + fw * 0.06:.1f}" height="{fh * 0.075:.1f}" rx="{fh * 0.037:.1f}" fill="#FBF7EE" stroke="#CFE8F7" stroke-width="{S * 0.004:.1f}"/>') if hat else ''
    sy = fy + fh * 0.585
    scarf_svg = (f'<path d="M{fx + fw * 0.13:.1f} {sy - fh * 0.03:.1f} Q{fx + fw * 0.38:.1f} {sy + fh * 0.06:.1f} {fx + fw * 0.63:.1f} {sy - fh * 0.03:.1f} '
                 f'L{fx + fw * 0.64:.1f} {sy + fh * 0.04:.1f} Q{fx + fw * 0.38:.1f} {sy + fh * 0.14:.1f} {fx + fw * 0.12:.1f} {sy + fh * 0.04:.1f}Z" fill="#C63D3D" stroke="#8E2430" stroke-width="{S * 0.005:.1f}"/>'
                 f'<path d="M{fx + fw * 0.46:.1f} {sy + fh * 0.07:.1f} L{fx + fw * 0.56:.1f} {sy + fh * 0.06:.1f} L{fx + fw * 0.58:.1f} {sy + fh * 0.27:.1f} L{fx + fw * 0.47:.1f} {sy + fh * 0.28:.1f}Z" fill="#C63D3D" stroke="#8E2430" stroke-width="{S * 0.005:.1f}"/>'
                 + ''.join(f'<rect x="{fx + fw * 0.465:.1f}" y="{sy + fh * (0.14 + k * 0.05):.1f}" width="{fw * 0.105:.1f}" height="{fh * 0.018:.1f}" fill="#FBF7EE"/>' for k in range(2))) if scarf else ''
    return f'''<!doctype html><html><head><style>html,body{{margin:0;background:transparent}}#c{{position:relative;width:{S}px;height:{S}px;overflow:hidden}}#c>*{{position:absolute}}</style></head>
      <body><div id="c"><svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="left:0;top:0">
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10213A"/><stop offset=".7" stop-color="#1F3F6B"/><stop offset="1" stop-color="#2C4F7C"/></linearGradient>
          <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFBF66" stop-opacity=".35"/><stop offset="1" stop-color="#FFBF66" stop-opacity="0"/></radialGradient></defs>
        <rect width="{S}" height="{S}" fill="url(#sky)"/>
        <path d="M{S * 0.5} {S * 0.06} l{S * 0.012} {S * 0.03} {S * 0.032} {S * 0.004} -{S * 0.024} {S * 0.022} {S * 0.008} {S * 0.032} -{S * 0.028} -{S * 0.017} -{S * 0.028} {S * 0.017} {S * 0.008} -{S * 0.032} -{S * 0.024} -{S * 0.022} {S * 0.032} -{S * 0.004}z" fill="#E6C26A" opacity="{0.95 if detail else 0}"/>
        {flakes}{village}
        <ellipse cx="{S / 2}" cy="{fy + fh * .5}" rx="{fw * .62}" ry="{fh * .6}" fill="url(#halo)"/>
        <path d="M0 {S * 0.84} Q{S * 0.25} {S * 0.78} {S * 0.5} {S * 0.83} T{S} {S * 0.82} V{S} H0Z" fill="#F7F9FC"/>
        <path d="M0 {S * 0.9} Q{S * 0.3} {S * 0.86} {S * 0.6} {S * 0.9} T{S} {S * 0.89} V{S} H0Z" fill="#CFE8F7" opacity=".7"/>
      </svg>
      <img src="data:image/png;base64,{FOX}" style="left:{fx:.1f}px;top:{fy:.1f}px;width:{fw:.1f}px;height:{fh:.1f}px">
      <svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="left:0;top:0">{scarf_svg}{hat_svg}</svg></div></body></html>'''


async def main():
    os.makedirs(OUT, exist_ok=True)
    variants = {'any': (0.66, {}), 'mask': (0.5, {}), 'apple': (0.62, {}), 'logo': (0.74, {'fox_y': 0.54}),
                'fav': (0.8, {'detail': False, 'fox_y': 0.56}), 'hero': (0.6, {'fox_y': 0.56})}
    imgs = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': S, 'height': S})
        for k, (r, o) in variants.items():
            await pg.set_content(scene(r, **o)); await pg.wait_for_timeout(300)
            path = os.path.join(TMP, f'{k}.png'); await pg.locator('#c').screenshot(path=path, omit_background=True)
            imgs[k] = Image.open(path).convert('RGBA')
        await b.close()
    def save(img, size, name):
        img.resize((size, size), Image.LANCZOS).convert('RGB').save(os.path.join(OUT, name), optimize=True); print('wrote', name)
    save(imgs['any'], 512, 'icon-512.png'); save(imgs['any'], 192, 'icon-192.png')
    save(imgs['mask'], 512, 'icon-512-maskable.png'); save(imgs['mask'], 192, 'icon-192-maskable.png')
    save(imgs['apple'], 180, 'apple-touch-icon.png')
    save(imgs['fav'], 32, 'favicon-32.png'); save(imgs['fav'], 16, 'favicon-16.png')
    imgs['fav'].convert('RGB').resize((48, 48), Image.LANCZOS).save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)]); print('wrote favicon.ico')
    imgs['any'].convert('RGB').resize((1024, 1024)).save(os.path.join(OUT, 'icon-source-1024.png'), optimize=True)
    for px in (96, 192):
        big = imgs['logo'].copy()
        circle = Image.new('L', big.size, 0); ImageDraw.Draw(circle).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
        big.putalpha(circle); big.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f'logo-fox-{px}.png'), optimize=True); print('wrote', f'logo-fox-{px}.png')
    # ภาพประกอบหน้าเข้าสู่ระบบ (จิ้งจอกใส่ผ้าพันคอในหมู่บ้านหิมะ) — WebP เล็ก
    hero = imgs['hero'].resize((640, 640), Image.LANCZOS)
    os.makedirs(os.path.join(HERE, '..', '..', 'public', 'img', 'christmas'), exist_ok=True)
    hero.save(os.path.join(HERE, '..', '..', 'public', 'img', 'christmas', 'login-fox.webp'), 'WEBP', quality=82); print('wrote login-fox.webp')

asyncio.run(main())
