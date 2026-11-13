"""แยกตัวจิ้งจอกจาก public/img/icon-source-512.png เป็น PNG โปร่งใส + ตำแหน่งหัว (ใช้วางมงกุฎดอกไม้)
   python3 scripts/season-icons/extract_fox.py <out_dir>   (วิธีเดียวกับ scripts/build-app-icons.py)"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'img')
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
src = Image.open(os.path.join(ROOT, 'icon-source-512.png')).convert('RGB')
a = np.asarray(src).astype(int)
border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
bg = np.median(border, axis=0)
m = np.abs(a - bg).max(axis=2) > 30
m = ndimage.binary_closing(m, iterations=6)
lab, n = ndimage.label(m); sizes = ndimage.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sizes)))
# รูภายในตัว: ขนสีขาว/ปลายหาง = ส่วนของจิ้งจอก · พื้นครีมที่ถูกล้อม (ช่องระหว่างตัวกับหาง) = พื้นหลัง → โปร่งใส
holes = ndimage.binary_fill_holes(m) & ~m
hl, hn = ndimage.label(holes)
dbg = np.abs(a - bg).max(axis=2)
for i in range(1, hn + 1):
    reg = hl == i
    if dbg[reg].mean() >= 8: m |= reg   # ขนขาว/ปลายหาง ต่างจากพื้นพอสมควร · ช่องพื้นครีมแทบเท่าพื้น (≈ 4)
m = ndimage.binary_erosion(m, iterations=2)   # ตัดขอบสีครีมที่ติดมา
ys, xs = np.where(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
mask = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
rgba = src.convert('RGBA'); rgba.putalpha(mask)
fox = rgba.crop((x0, y0, x1 + 1, y1 + 1))
fox.save(os.path.join(out, 'fox.png'))
top = m[y0:y0 + int((y1 - y0) * 0.45)]; tys, txs = np.where(top)
head_cx = (txs.min() + txs.max()) / 2; vis_cx = 0.75 * head_cx + 0.25 * (x0 + x1) / 2
# ขอบบนของหัว (ระหว่างหู) ทุกคอลัมน์ — เทียบกับกรอบตัวละคร 0..1
cols = {}
for x in range(int(head_cx - 90), int(head_cx + 91), 6):
    col = np.where(m[:, x])[0]
    if len(col): cols[(x - x0) / (x1 - x0)] = (col.min() - y0) / (y1 - y0)
geo = {'w': int(x1 - x0 + 1), 'h': int(y1 - y0 + 1), 'visCx': (vis_cx - x0) / (x1 - x0), 'headCx': (head_cx - x0) / (x1 - x0), 'headTop': cols}
json.dump(geo, open(os.path.join(out, 'fox.json'), 'w'))
print(json.dumps({k: v for k, v in geo.items() if k != 'headTop'}), len(cols))
