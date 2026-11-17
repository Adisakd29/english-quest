"""
โลโก้/ไอคอนแอปธีมลอยกระทง (v1.18.0) — จิ้งจอกตัวเดิม + คืนวันเพ็ญริมน้ำ: พระจันทร์เต็มดวง ดาว สายน้ำ
กระทงใบตอง-กลีบบัว (เทียนเล่มเล็ก) และมาลัยดอกดาวเรือง/มะลิบนหัว · ไม่มีโคมลอย/พลุ/สิ่งที่เกี่ยวกับพิธีกรรม
  python3 scripts/season-icons/build.py
ผลลัพธ์: public/img/season/loykrathong/ (ชื่อไฟล์เดียวกับไอคอนปกติใน public/img/)
ขั้นตอน: แยกจิ้งจอก (extract_fox.py) → วาดฉาก SVG + วางจิ้งจอกในเบราว์เซอร์ (Playwright) 1024px → ย่อเป็นทุกขนาดด้วย Pillow
"""
import asyncio, base64, json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'img', 'season', 'loykrathong')
TMP = tempfile.mkdtemp(prefix='lkicon-')
subprocess.run([sys.executable, os.path.join(HERE, 'extract_fox.py'), TMP], check=True)
GEO = json.load(open(os.path.join(TMP, 'fox.json')))
FOX = base64.b64encode(open(os.path.join(TMP, 'fox.png'), 'rb').read()).decode()

S = 1024
def star(cx, cy, r, k=0.3):
    import math
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2; rr = r if i % 2 == 0 else r * k
        pts.append(f'{cx + math.cos(a) * rr:.1f},{cy + math.sin(a) * rr:.1f}')
    return 'M' + 'L'.join(pts) + 'Z'

def flower(cx, cy, r, kind):
    """ดอกดาวเรือง (ส้ม-เหลือง ซ้อนกลีบ) / ดอกมะลิ (ขาว 5 กลีบ)"""
    import math
    if kind == 'marigold':
        petals = ''.join(f'<circle cx="{cx + math.cos(i * math.pi / 4) * r * .55:.1f}" cy="{cy + math.sin(i * math.pi / 4) * r * .55:.1f}" r="{r * .5:.1f}" fill="{"#FFB020" if i % 2 else "#FF8A00"}"/>' for i in range(8))
        return f'<g>{petals}<circle cx="{cx}" cy="{cy}" r="{r * .5:.1f}" fill="#FFC93A"/><circle cx="{cx}" cy="{cy}" r="{r * .22:.1f}" fill="#E06A00"/></g>'
    petals = ''.join(f'<ellipse cx="{cx + math.cos(i * 2 * math.pi / 5 - math.pi / 2) * r * .5:.1f}" cy="{cy + math.sin(i * 2 * math.pi / 5 - math.pi / 2) * r * .5:.1f}" rx="{r * .36:.1f}" ry="{r * .5:.1f}" transform="rotate({i * 72} {cx + math.cos(i * 2 * math.pi / 5 - math.pi / 2) * r * .5:.1f} {cy + math.sin(i * 2 * math.pi / 5 - math.pi / 2) * r * .5:.1f})" fill="#FFFFFF" stroke="#E7EEF7" stroke-width="{r * .06:.1f}"/>' for i in range(5))
    return f'<g>{petals}<circle cx="{cx}" cy="{cy}" r="{r * .2:.1f}" fill="#F7E58C"/></g>'

KRATHONG = '''<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="kl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DBB63"/><stop offset="1" stop-color="#2E7D32"/></linearGradient>
    <linearGradient id="kd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43A047"/><stop offset="1" stop-color="#1B5E20"/></linearGradient>
    <linearGradient id="pk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3EE"/><stop offset="1" stop-color="#FF8DB5"/></linearGradient>
    <linearGradient id="pk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4F8"/><stop offset="1" stop-color="#FFB3CD"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A3" stop-opacity=".95"/><stop offset="1" stop-color="#FFE7A3" stop-opacity="0"/></radialGradient>
    <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6C9"/><stop offset=".55" stop-color="#FFB733"/><stop offset="1" stop-color="#FF6A1A"/></linearGradient>
  </defs>
  <ellipse cx="100" cy="134" rx="96" ry="12" fill="#0A1F3D" opacity=".55"/>
  <!-- ฐานใบตอง -->
  <path d="M8 112 Q100 152 192 112 Q186 128 100 136 Q14 128 8 112Z" fill="url(#kd)"/>
  <ellipse cx="100" cy="110" rx="92" ry="22" fill="url(#kl)"/>
  <!-- กลีบใบตองพับแหลม (นมแมว) รอบขอบ -->
  <g stroke="#1B5E20" stroke-width="1.4" stroke-linejoin="round">
    <path d="M14 108 L26 80 L40 104Z" fill="url(#kd)"/><path d="M36 102 L52 70 L66 98Z" fill="url(#kl)"/>
    <path d="M134 98 L148 70 L164 102Z" fill="url(#kl)"/><path d="M160 104 L174 80 L186 108Z" fill="url(#kd)"/>
    <path d="M62 98 L78 66 L92 96Z" fill="url(#kd)"/><path d="M108 96 L122 66 L138 98Z" fill="url(#kd)"/>
  </g>
  <!-- กลีบบัว -->
  <path d="M100 30 C84 50 82 78 100 96 C118 78 116 50 100 30Z" fill="url(#pk)" stroke="#E86A98" stroke-width="1.5"/>
  <path d="M60 60 C64 82 80 96 100 98 C92 80 80 66 60 60Z" fill="url(#pk2)" stroke="#E86A98" stroke-width="1.5"/>
  <path d="M140 60 C136 82 120 96 100 98 C108 80 120 66 140 60Z" fill="url(#pk2)" stroke="#E86A98" stroke-width="1.5"/>
  <path d="M42 84 C54 98 76 104 98 102 C84 92 66 86 42 84Z" fill="url(#pk)" stroke="#E86A98" stroke-width="1.5"/>
  <path d="M158 84 C146 98 124 104 102 102 C116 92 134 86 158 84Z" fill="url(#pk)" stroke="#E86A98" stroke-width="1.5"/>
  <!-- ดอกดาวเรืองกลางกระทง + เทียน -->
  <g>CENTER_FLOWERS</g>
  <circle cx="100" cy="32" r="34" fill="url(#glow)"/>
  <rect x="95" y="34" width="10" height="44" rx="3" fill="#FFF3D6" stroke="#E8C98A" stroke-width="1.2"/>
  <path d="M100 6 C106 16 109 22 106 28 C104 32 96 32 94 28 C91 22 94 16 100 6Z" fill="url(#fl)"/>
  <path d="M100 18 C103 22 103 26 100 29 C97 26 97 22 100 18Z" fill="#FFFBEA"/>
</svg>'''
KRATHONG = KRATHONG.replace('CENTER_FLOWERS', flower(78, 86, 11, 'marigold') + flower(122, 86, 11, 'marigold') + flower(100, 90, 10, 'jasmine'))

KRATHONG_FULL = KRATHONG.replace('<svg ', '<svg width="100%" height="100%" ', 1)

def scene(ratio, moon=True, krathong=True, crown=True, detail=True, fox_y=0.47):
    scale = ratio * S / max(GEO['w'], GEO['h'])
    fw, fh = GEO['w'] * scale, GEO['h'] * scale
    fx = S / 2 - GEO['visCx'] * fw
    fx = max(S * 0.04, min(S - fw - S * 0.04, fx))
    fy = S * fox_y - fh / 2
    # มาลัยดอกไม้บนหัว: ตามขอบบนของหัวระหว่างหู
    pts = sorted((float(k), v) for k, v in GEO['headTop'].items() if 0.25 <= float(k) <= 0.52)
    fl = ''
    if crown:
        for i, (u, v) in enumerate(pts[::2]):
            cx = fx + u * fw; cy = fy + (v - 0.012) * fh
            fl += flower(round(cx, 1), round(cy, 1), round(fw * (0.036 if i % 2 == 0 else 0.03), 1), 'marigold' if i % 2 == 0 else 'jasmine')
        # ใบไม้เล็ก ๆ ปลายมาลัย
    kw = fw * 0.56; kh = kw * 0.75
    kx = fx + fw * 0.52 - kw / 2; ky = fy + fh * 0.98 - kh * 0.78
    stars = ''.join(f'<path d="{star(x * S, y * S, r * S)}" fill="#FFF6D8" opacity="{o}"/>' for x, y, r, o in
                    [(.80, .14, .018, .95), (.90, .30, .011, .8), (.12, .52, .010, .7), (.68, .08, .009, .75), (.92, .58, .008, .6), (.44, .06, .007, .6)]) if detail else ''
    ripples = ''.join(f'<ellipse cx="{S * cx}" cy="{S * cy}" rx="{S * rx}" ry="{S * ry}" fill="none" stroke="#9FD3FF" stroke-opacity="{o}" stroke-width="{S * .004}"/>' for cx, cy, rx, ry, o in
                      [(.56, .925, .30, .028, .45), (.30, .965, .22, .02, .3), (.80, .975, .16, .016, .3)]) if detail else ''
    moon_svg = f'''<circle cx="{S * .24}" cy="{S * .22}" r="{S * .22}" fill="url(#mglow)"/>
      <circle cx="{S * .24}" cy="{S * .22}" r="{S * .125}" fill="url(#moon)"/>
      <circle cx="{S * .205}" cy="{S * .19}" r="{S * .024}" fill="#F3DC9A" opacity=".55"/><circle cx="{S * .27}" cy="{S * .255}" r="{S * .016}" fill="#F3DC9A" opacity=".5"/>
      ''' + ''.join(f'<rect x="{S * (.24 - w / 2):.1f}" y="{S * y:.1f}" width="{S * w:.1f}" height="{S * .007:.1f}" rx="{S * .0035:.1f}" fill="#FFE9A8" opacity="{o}"/>' for y, w, o in [(.815, .13, .55), (.835, .1, .45), (.857, .075, .38), (.88, .055, .3), (.905, .035, .22)]) if moon else ''
    kr_html = (f'<div style="left:{kx:.1f}px;top:{ky:.1f}px;width:{kw:.1f}px;height:{kh:.1f}px">' + KRATHONG_FULL + '</div>') if krathong else ''
    return f'''<!doctype html><html><head><style>html,body{{margin:0;background:transparent}}#c{{position:relative;width:{S}px;height:{S}px;overflow:hidden}}
      #c>*{{position:absolute}}</style></head><body><div id="c">
      <svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="left:0;top:0">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2366"/><stop offset=".62" stop-color="#2B3F8F"/><stop offset=".78" stop-color="#3A5BA8"/><stop offset=".80" stop-color="#173B6B"/><stop offset="1" stop-color="#0D2748"/></linearGradient>
          <radialGradient id="moon" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFFBEA"/><stop offset="1" stop-color="#FFE59A"/></radialGradient>
          <radialGradient id="mglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF1B8" stop-opacity=".55"/><stop offset="1" stop-color="#FFF1B8" stop-opacity="0"/></radialGradient>
          <linearGradient id="refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></linearGradient>
          <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7FA8FF" stop-opacity=".35"/><stop offset="1" stop-color="#7FA8FF" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="{S}" height="{S}" fill="url(#sky)"/>
        {stars}{moon_svg}
        <ellipse cx="{S / 2}" cy="{fy + fh * .5}" rx="{fw * .62}" ry="{fh * .6}" fill="url(#halo)"/>
        <ellipse cx="{fx + fw * .45}" cy="{fy + fh * .985}" rx="{fw * .46}" ry="{fh * .05}" fill="#081A33" opacity=".5"/>
        {ripples}
      </svg>
      <img src="data:image/png;base64,{FOX}" style="left:{fx:.1f}px;top:{fy:.1f}px;width:{fw:.1f}px;height:{fh:.1f}px">
      <svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="left:0;top:0">{fl}</svg>
      {kr_html}
      </div></body></html>'''

async def main():
    os.makedirs(OUT, exist_ok=True)
    variants = {   # ชื่อ: (สัดส่วนตัวละคร, ตัวเลือก)
        'any': (0.70, {}), 'mask': (0.54, {}), 'apple': (0.66, {}),
        'logo': (0.82, {'fox_y': 0.5}), 'fav': (0.88, {'krathong': False, 'crown': True, 'detail': False, 'fox_y': 0.5}),
    }
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
    for px in (96, 192):   # โลโก้ในแอป: วงกลม พื้นนอกวงกลมโปร่งใส (แบบเดียวกับ logo-fox-*.png)
        big = imgs['logo'].copy()
        circle = Image.new('L', big.size, 0); ImageDraw.Draw(circle).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
        big.putalpha(circle); big.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f'logo-fox-{px}.png'), optimize=True); print('wrote', f'logo-fox-{px}.png')

asyncio.run(main())
