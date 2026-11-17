"""แปลงภาพต้นฉบับ (JPG จากขั้นตอนสร้างภาพ) -> WebP สำหรับเว็บ 2 ขนาด
   ใช้: python3 scripts/toeic/prepare-images.py <โฟลเดอร์ต้นฉบับ>   (ไฟล์ชื่อ p01.jpg ... -> P1-0001.webp)
   - full : กว้าง 1248px (จอใหญ่/ซูมดูรายละเอียด) · q80
   - 640  : กว้าง 640px (มือถือ) · q78
   ตรวจคุณภาพขั้นต่ำ: ความกว้าง >= 1000px, ไม่มืดเกินไป (ค่าความสว่างเฉลี่ย >= 70), ไม่เบลอ (Laplacian variance >= 40)"""
import sys, os, json, re
from PIL import Image, ImageFilter, ImageStat
src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'toeic', 'p1')
os.makedirs(out, exist_ok=True)
report = {}
for f in sorted(os.listdir(src)):
    m = re.fullmatch(r'p(\d\d)\.jpg', f)
    if not m: continue
    qid = 'P1-%04d' % int(m.group(1))
    im = Image.open(os.path.join(src, f)).convert('RGB')
    gray = im.convert('L')
    bright = ImageStat.Stat(gray).mean[0]
    lap = gray.resize((624, 416)).filter(ImageFilter.FIND_EDGES)
    sharp = ImageStat.Stat(lap).var[0]
    w, h = im.size
    im.save(os.path.join(out, qid + '.webp'), 'WEBP', quality=80, method=6)
    im.resize((640, round(640 * h / w)), Image.LANCZOS).save(os.path.join(out, qid + '-640.webp'), 'WEBP', quality=78, method=6)
    report[qid] = {'width': w, 'height': h, 'brightness': round(bright, 1), 'sharpness': round(sharp, 1),
                   'ok': w >= 1000 and bright >= 70 and sharp >= 40}
json.dump(report, open(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'toeic', 'part1', 'image-qa.json'), 'w'), indent=1)
bad = [k for k, v in report.items() if not v['ok']]
print(len(report), 'images ·', 'fail:', bad or 'none')
