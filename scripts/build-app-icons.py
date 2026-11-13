"""
สร้างไอคอนแอป (PWA / iOS / favicon) ใหม่ให้ "ตัวสุนัขจิ้งจอกอยู่กึ่งกลาง"
  python3 scripts/build-app-icons.py
ที่มา: public/img/icon-512.png (ภาพเดิม — ตัวละครถูกวาดเยื้องขวา/บนเพราะมีหาง)
วิธี: แยกตัวละครออกจากพื้นครีม -> จัดกลางด้วยกรอบรอบตัวละคร -> วางบนพื้นครีมใหม่ (เกลี่ยขอบนุ่ม)
  - any       : ตัวละครกว้าง/สูงไม่เกิน 78% ของภาพ
  - maskable  : ไม่เกิน 60% (อยู่ใน safe zone วงกลม 80% ของ Android ทุกทรง)
  - apple     : ไม่เกิน 74% (iOS ตัดมุมโค้ง)
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')
SRC = os.path.join(ROOT, 'icon-source-512.png') if os.path.exists(os.path.join(ROOT, 'icon-source-512.png')) else os.path.join(ROOT, 'icon-512.png')
src = Image.open(SRC).convert('RGB')
a = np.asarray(src).astype(int)
border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
bg = np.median(border, axis=0)

# หน้ากากตัวละคร: ต่างจากพื้นเกินเกณฑ์ -> ปิดรู (ส่วนสีขาวบนหน้า/หาง) -> เลือกก้อนใหญ่สุด
d = np.abs(a - bg).max(axis=2)
m = d > 30
m = ndimage.binary_closing(m, iterations=6)
m = ndimage.binary_fill_holes(m)
lab, n = ndimage.label(m)
sizes = ndimage.sum(m, lab, range(1, n + 1))
m = lab == (1 + int(np.argmax(sizes)))
m = ndimage.binary_dilation(m, iterations=3)
ys, xs = np.where(m)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('character bbox', (x0, y0, x1, y1), 'bbox center', ((x0 + x1) / 2, (y0 + y1) / 2))
mask = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2.5))
# จุดกึ่งกลางที่ "ตาเห็น": ใช้หัว/ลำตัว (ครึ่งบนของตัวละคร) เป็นหลัก — หางที่ยื่นไปทางขวาไม่ดึงทั้งตัวให้เยื้องซ้าย
top = m[y0:y0 + int((y1 - y0) * 0.45)]
tys, txs = np.where(top)
head_cx = (txs.min() + txs.max()) / 2
bbox_cx = (x0 + x1) / 2
vis_cx = 0.75 * head_cx + 0.25 * bbox_cx
print('head center', head_cx, 'visual center', vis_cx)
fox = src.crop((x0, y0, x1 + 1, y1 + 1))
fmask = mask.crop((x0, y0, x1 + 1, y1 + 1))
fw, fh = fox.size

# พื้นหลัง: สีครีมเดิม + ไล่เฉดเบา ๆ (ไม่มีตัวละครเดิมติดมา)
def background(size):
    c = np.zeros((size, size, 3))
    yy, xx = np.mgrid[0:size, 0:size] / size
    vign = 1 - 0.035 * (((xx - 0.5) ** 2 + (yy - 0.5) ** 2) * 4)
    for k in range(3):
        c[..., k] = np.clip(bg[k] * vign + (255 - bg[k]) * 0.25, 0, 255)
    return Image.fromarray(c.astype('uint8'))

def render(size, ratio):
    canvas = background(1024)
    scale = ratio * 1024 / max(fw, fh)
    w, h = round(fw * scale), round(fh * scale)
    f = fox.resize((w, h), Image.LANCZOS); fm = fmask.resize((w, h), Image.LANCZOS)
    # เลื่อนให้ "จุดกลางที่ตาเห็น" อยู่กลางภาพ แต่ไม่ให้หางล้นขอบ (เว้นขอบอย่างน้อย 4%)
    off_x = round(512 - (vis_cx - x0) * scale)
    off_x = max(int(1024 * 0.04), min(1024 - w - int(1024 * 0.04), off_x))
    canvas.paste(f, (off_x, (1024 - h) // 2), fm)
    return canvas.resize((size, size), Image.LANCZOS)

out = {
    'icon-512.png': (512, 0.78), 'icon-192.png': (192, 0.78),
    'icon-512-maskable.png': (512, 0.60), 'icon-192-maskable.png': (192, 0.60),
    'apple-touch-icon.png': (180, 0.74), 'favicon-32.png': (32, 0.9), 'favicon-16.png': (16, 0.92),
}
# เก็บต้นฉบับไว้ (ครั้งแรกเท่านั้น) เผื่อสร้างใหม่
orig = os.path.join(ROOT, 'icon-source-512.png')
if not os.path.exists(orig):
    src.save(orig)
for name, (size, ratio) in out.items():
    render(size, ratio).save(os.path.join(ROOT, name), optimize=True)
    print('wrote', name)
render(48, 0.9).save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('wrote favicon.ico')

# โลโก้ในแอป (หน้าเข้าสู่ระบบ / แถบเมนู): จิ้งจอกบนวงกลมสีครีม พื้นนอกวงกลมโปร่งใส
from PIL import ImageDraw
for px in (96, 192):
    big = render(px * 4, 0.80).convert('RGBA')
    circle = Image.new('L', big.size, 0)
    ImageDraw.Draw(circle).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
    big.putalpha(circle)
    big.resize((px, px), Image.LANCZOS).save(os.path.join(ROOT, f'logo-fox-{px}.png'), optimize=True)
    print('wrote', f'logo-fox-{px}.png')
