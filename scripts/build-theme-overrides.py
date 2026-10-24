"""
สร้าง public/css/theme-auto.css จาก public/css/style.css (ธีมมืดเดิม)

ธีมเดิมใช้ "ขาวโปร่งแสง" เช่น rgba(255,255,255,0.08) เป็นเส้นขอบ/พื้นบนพื้นมืด
บนธีมสว่างค่าเหล่านี้จะมองไม่เห็น สคริปต์นี้สร้างกฎทับให้เป็น "สีเข้มโปร่งแสง" เทียบเท่า
เฉพาะ border / background / box-shadow / outline (ไม่แตะสีตัวอักษร — ตัวอักษรบนพื้นสีเข้ม
เช่น การ์ด gradient ยังเป็นสีขาวตามเดิม)

  python3 scripts/build-theme-overrides.py

รันซ้ำได้ทุกครั้งที่แก้ style.css (ผลลัพธ์ deterministic)
"""
import re

SRC = 'public/css/style.css'
OUT = 'public/css/theme-auto.css'
PROPS = ('border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-color',
         'background', 'background-color', 'box-shadow', 'outline')
WHITE_RGBA = re.compile(r'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([0-9.]+)\s*\)')
INK = '31, 35, 64'  # สีตัวอักษรหลักของธีมใหม่ (#1F2340)


def convert(value):
    # ขาวโปร่งแสง a -> เข้มโปร่งแสง (คูณ 1.3 เพราะพื้นสว่างต้องการ contrast มากขึ้นเล็กน้อย, จำกัดที่ 0.18)
    return WHITE_RGBA.sub(lambda m: f'rgba({INK}, {min(0.18, round(float(m.group(1)) * 1.3, 3))})', value)


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def iter_rules(css):
    """คืน (media_prefix, selector, body) รองรับ @media หนึ่งชั้น"""
    i = 0
    n = len(css)
    while i < n:
        j = css.find('{', i)
        if j == -1:
            break
        head = css[i:j].strip()
        if head.startswith('@media') or head.startswith('@supports'):
            depth, k = 1, j + 1
            while k < n and depth:
                depth += {'{': 1, '}': -1}.get(css[k], 0)
                k += 1
            inner = css[j + 1:k - 1]
            for _, sel, body in iter_rules(inner):
                yield head, sel, body
            i = k
            continue
        k = css.find('}', j)
        if head.startswith('@'):  # @keyframes ฯลฯ ข้าม
            depth, k = 1, j + 1
            while k < n and depth:
                depth += {'{': 1, '}': -1}.get(css[k], 0)
                k += 1
            i = k
            continue
        yield None, head, css[j + 1:k]
        i = k + 1


def main():
    css = strip_comments(open(SRC, encoding='utf-8').read())
    out_plain, out_media = [], {}
    count = 0
    for media, sel, body in iter_rules(css):
        decls = []
        for d in body.split(';'):
            if ':' not in d:
                continue
            prop, val = d.split(':', 1)
            prop = prop.strip()
            if prop in PROPS and WHITE_RGBA.search(val):
                decls.append(f'  {prop}: {convert(val.strip())};')
        if decls:
            count += len(decls)
            rule = f'{sel} {{\n' + '\n'.join(decls) + '\n}'
            (out_media.setdefault(media, []) if media else out_plain).append(rule)
    parts = ['/* สร้างอัตโนมัติโดย scripts/build-theme-overrides.py — ห้ามแก้ด้วยมือ */',
             '/* แปลงเส้นขอบ/พื้นแบบขาวโปร่งแสง (ธีมมืด) เป็นเข้มโปร่งแสง (ธีมสว่าง) */', '']
    parts += out_plain
    for media, rules in out_media.items():
        parts.append(f'{media} {{\n' + '\n'.join(rules) + '\n}')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
    print(f'สร้าง {OUT}: แปลง {count} declarations จาก {len(out_plain) + sum(map(len, out_media.values()))} กฎ')


if __name__ == '__main__':
    main()
