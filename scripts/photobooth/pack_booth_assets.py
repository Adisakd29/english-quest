"""
แปลงภาพ PNG จาก build_booth_assets.py → WebP สำหรับเว็บ (public/img/christmas/booth/)
  - ตัดขอบโปร่งใสของต้นไม้/ของขวัญ (ปรับพิกัดหลอดไฟ/ดาว/ฐานใน booth.json ให้ตรงภาพที่ตัด)
  - ชั้นเงา: เก็บเฉพาะบริเวณรอบฐาน (ไล่จางเป็นวงรี) — ตัดเงาที่ไม่เกี่ยวข้องจาก shadow catcher ทิ้ง
  python3 scripts/photobooth/pack_booth_assets.py <โฟลเดอร์ png>
"""
import json, math, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img', 'christmas', 'booth')
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(SRC, 'booth.json')))
out_meta = {'v': 2}


def ellipse_mask(size, cx, cy, rx, ry):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    steps = 24
    for k in range(steps, 0, -1):
        f = k / steps
        v = int(255 * (1 - f) ** 1.4)
        d.ellipse([cx - rx * f, cy - ry * f, cx + rx * f, cy + ry * f], fill=v)
    return m.filter(ImageFilter.GaussianBlur(max(2, rx * 0.04)))


for key in ('tree_a', 'tree_b', 'gifts_l', 'gifts_r'):
    m = meta[key]
    im = Image.open(os.path.join(SRC, f'{key}.png')).convert('RGBA')
    sh = Image.open(os.path.join(SRC, f'{key}_shadow.png')).convert('RGBA')
    W, H = im.size
    bx, by = m['base'][0] * W, m['base'][1] * H
    big = key.startswith('tree')
    mask = ellipse_mask((W, H), bx + W * 0.08, by - H * 0.005, W * (0.55 if big else 0.62), H * (0.07 if big else 0.16))
    a = ImageChops.multiply(sh.getchannel('A'), mask)
    sh.putalpha(a)
    # กรอบรวม (ภาพ + เงา) + ขอบเผื่อ
    box = ImageChops.lighter(im.getchannel('A'), a).point(lambda v: 255 if v > 6 else 0).getbbox()
    pad = 8
    x0, y0, x1, y1 = max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad)
    cw, ch = x1 - x0, y1 - y0
    im.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f'{key}.webp'), 'WEBP', quality=88, alpha_quality=92, method=6)
    sh.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f'{key}_shadow.webp'), 'WEBP', quality=80, alpha_quality=80, method=6)
    rp = lambda p: [round((p[0] * W - x0) / cw, 4), round((p[1] * H - y0) / ch, 4)]
    o = {'w': cw, 'h': ch, 'base': rp(m['base'])}
    if big:
        o.update(top=rp(m['top']), star=rp(m['star']), lights=[rp(p) for p in m['lights']], front=m['front'], halfWidth=round(m['halfWidth'] * W / cw, 4))
    out_meta[key] = o

v = Image.open(os.path.join(SRC, 'village.png')).convert('RGB')
v.save(os.path.join(OUT, 'village.webp'), 'WEBP', quality=84, method=6)
out_meta['village'] = {'w': v.size[0], 'h': v.size[1]}
json.dump(out_meta, open(os.path.join(OUT, 'booth.json'), 'w'), separators=(',', ':'))
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')

# v1.26.0 ภาพขนาดเล็กสำหรับ Hero Scene หน้าแรก (โหลดทุกครั้งที่เปิดหน้าแรก → ต้องเบา)
HERO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'img', 'hero')
os.makedirs(HERO, exist_ok=True)
for key, w in (('tree_a', 320), ('tree_b', 320), ('gifts_l', 260), ('gifts_r', 260)):
    im = Image.open(os.path.join(OUT, f'{key}.webp'))
    h = round(im.height * w / im.width)
    im.resize((w, h), Image.LANCZOS).save(os.path.join(HERO, f'{key}.webp'), 'WEBP', quality=82, alpha_quality=88, method=6)
    print('hero', key, w, h)
vv = Image.open(os.path.join(SRC, 'village.png')).convert('RGB').resize((720, 1280), Image.LANCZOS)
vv.save(os.path.join(HERO, 'village.webp'), 'WEBP', quality=76, method=6)
for f in sorted(os.listdir(HERO)):
    print('hero', f, os.path.getsize(os.path.join(HERO, f)) // 1024, 'KB')
