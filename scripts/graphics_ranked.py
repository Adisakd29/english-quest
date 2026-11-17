"""
Ranked Quest graphics — ใช้ภาษาภาพเดียวกับ build-graphics.py ("Flat + subtle depth")
  - animal_head(): ตัวสร้างหน้าสัตว์แบบพารามิเตอร์ (ใช้ทั้งภาพ NPC/Guardian และเงาสัตว์ในตรา)
  - BADGES: ตรา 9 League ที่ "วิวัฒนาการ" จากเรียบง่าย -> ซับซ้อน (รูปทรงต่างกันทุกขั้น ไม่พึ่งสีอย่างเดียว)
"""
INK = '#1F2340'

# ---------- หน้าสัตว์ (พิกัดอ้างอิง viewBox 0 0 64 64 · หัวอยู่กลาง 32,34) ----------
def _eyes(c='#1F2340', y=34, dx=7.5, r=2.8, shine=True):
    s = f'<circle cx="{32-dx}" cy="{y}" r="{r}" fill="{c}"/><circle cx="{32+dx}" cy="{y}" r="{r}" fill="{c}"/>'
    if shine:
        s += f'<circle cx="{32-dx+1}" cy="{y-1}" r="0.9" fill="#fff"/><circle cx="{32+dx+1}" cy="{y-1}" r="0.9" fill="#fff"/>'
    return s

def animal_head(a, mono=None):
    """a: dict(base, dark, muzzle, ears, face, beak, mark, extra) · mono: สีเดียว (ใช้เป็นเงาสัตว์ในตรา)"""
    base = mono or a['base']; dark = mono or a.get('dark', base); muz = mono or a.get('muzzle', base)
    eye = a.get('eye', INK) if not mono else a.get('cut', '#000')
    ears = a.get('ears', 'round'); face = a.get('face', 'mammal')
    out = ''
    # หู / เขา / หงอน (วาดก่อนหัว)
    if ears == 'round':
        out += f'<circle cx="17" cy="21" r="7" fill="{dark}"/><circle cx="47" cy="21" r="7" fill="{dark}"/>'
    elif ears == 'pointy':
        out += f'<path d="M15 30L13 10 28 21Z" fill="{dark}"/><path d="M49 30L51 10 36 21Z" fill="{dark}"/>'
    elif ears == 'tuft':
        out += f'<path d="M15 30L14 8 28 21Z" fill="{dark}"/><path d="M49 30L50 8 36 21Z" fill="{dark}"/>'
        out += f'<path d="M14 8l-2-5M50 8l2-5" stroke="{dark}" stroke-width="2.4" stroke-linecap="round"/>'
    elif ears == 'long':
        out += f'<ellipse cx="24" cy="12" rx="4.6" ry="13" fill="{dark}"/><ellipse cx="40" cy="12" rx="4.6" ry="13" fill="{dark}"/>'
    elif ears == 'small':
        out += f'<circle cx="19" cy="23" r="4.5" fill="{dark}"/><circle cx="45" cy="23" r="4.5" fill="{dark}"/>'
    elif ears == 'antlers':
        out += (f'<path d="M22 22L16 6M18 12l-6-2M19 9l-1-6M42 22l6-16M46 12l6-2M45 9l1-6" stroke="{dark}" '
                f'stroke-width="3" stroke-linecap="round" fill="none"/>')
    elif ears == 'horns':
        out += f'<path d="M24 22C20 12 22 5 25 2C26 9 28 15 29 21Z" fill="{dark}"/><path d="M40 22C44 12 42 5 39 2C38 9 36 15 35 21Z" fill="{dark}"/>'
    elif ears == 'bat':
        out += f'<path d="M14 32L8 4 30 20Z" fill="{dark}"/><path d="M50 32L56 4 34 20Z" fill="{dark}"/>'
    elif ears == 'antennae':
        out += f'<path d="M27 20Q22 6 15 6M37 20Q42 6 49 6" stroke="{dark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    elif ears == 'crest':
        out += f'<path d="M28 16L32 2 36 16Z" fill="{dark}"/><path d="M22 18L22 6 30 15Z" fill="{dark}"/><path d="M42 18L42 6 34 15Z" fill="{dark}"/>'
    elif ears == 'mane':
        for i in range(12):
            import math
            ang = i * math.pi / 6
            x = 32 + 24 * math.cos(ang); y = 34 + 24 * math.sin(ang)
            out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{dark}"/>'
    # หัว (เงาด้านข้าง + หน้า)
    rx, ry = a.get('size', (18, 16))
    if not mono:
        out += f'<ellipse cx="32" cy="{34+2.5}" rx="{rx}" ry="{ry}" fill="{dark}"/>'
    out += f'<ellipse cx="32" cy="34" rx="{rx}" ry="{ry}" fill="{base}"/>'
    # ลวดลาย
    mark = a.get('mark')
    if mark == 'mask' and not mono:
        out += f'<path d="M15 33q8-6 17 0q9-6 17 0q-2 6-8 6q-5 0-9-3q-4 3-9 3q-6 0-8-6Z" fill="{a.get("markc", INK)}" opacity=".85"/>'
    if mark == 'stripes' and not mono:
        out += f'<path d="M32 19v6M25 21l1 5M39 21l-1 5" stroke="{a.get("markc", INK)}" stroke-width="2.2" stroke-linecap="round"/>'
    if mark == 'whitehead' and not mono:
        out += f'<ellipse cx="32" cy="31" rx="{rx-1}" ry="{ry-3}" fill="{a.get("markc", "#fff")}"/>'
    if mark == 'cap' and not mono:
        out += f'<path d="M15 30a17 15 0 0 1 34 0q-17-6-34 0Z" fill="{a.get("markc", INK)}"/>'
    if mark == 'moon' and not mono:
        out += f'<path d="M32 20l2 4-2 4-2-4Z" fill="{a.get("markc", "#fff")}"/>'
    # หน้า
    if face == 'bird':
        out += _eyes(eye, 32, 8)
        beak = mono and a.get('cut', '#000') or a.get('beak', '#FBBF24')
        hook = a.get('hook', False)
        out += (f'<path d="M28 38h8l-4 {7 if hook else 5}Z" fill="{beak}"/>' if not hook else
                f'<path d="M27 37h10q0 5-5 9q1-4-1-5Z" fill="{beak}"/>')
    elif face == 'turtle':
        out += _eyes(eye, 33, 7) + f'<path d="M28 41q4 3 8 0" stroke="{eye}" stroke-width="2" fill="none" stroke-linecap="round"/>'
    elif face == 'owl':
        if not mono:
            out += f'<circle cx="25" cy="33" r="7" fill="#fff"/><circle cx="39" cy="33" r="7" fill="#fff"/>'
        out += _eyes(eye, 33, 7, 3)
        out += f'<path d="M29 39h6l-3 5Z" fill="{mono and a.get("cut", "#000") or "#FBBF24"}"/>'
    else:  # mammal
        if a.get('snout'):
            out += f'<ellipse cx="32" cy="43" rx="{a["snout"]}" ry="7" fill="{muz}"/>'
        elif not mono and a.get('muzzle'):
            out += f'<ellipse cx="32" cy="43" rx="9" ry="6.5" fill="{muz}"/>'
        out += _eyes(eye, 34, 7.5)
        out += f'<ellipse cx="32" cy="41" rx="3" ry="2.1" fill="{eye if not mono else a.get("cut", "#000")}"/>'
        if a.get('whiskers') and not mono:
            out += '<path d="M14 42h8M14 46h8M50 42h-8M50 46h-8" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>'
    if a.get('brow') and not mono:
        out += f'<path d="M20 27l8 2M44 27l-8 2" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/>'
    return out

# ---------- สเปกตัวละคร (สีธรรมชาติของสัตว์ · พื้นหลังใช้สีประจำ League) ----------
A = {
  'chick':     dict(base='#FCD34D', dark='#E0A814', face='bird', ears='crest', beak='#F97316', size=(18, 17)),
  'duckling':  dict(base='#FDE68A', dark='#E7C14A', face='bird', ears='none', beak='#FB923C', size=(18, 17)),
  'sparrow':   dict(base='#C08457', dark='#8F5A32', face='bird', ears='none', mark='cap', markc='#7A4B27', beak='#F59E0B'),
  'squirrel':  dict(base='#9C7A5B', dark='#6E5038', ears='tuft', muzzle='#E9D8C4'),  # โทนน้ำตาลเทา — ไม่ให้คล้าย Fox Mascot
  'chipmunk':  dict(base='#C9925C', dark='#9A6837', ears='small', mark='stripes', markc='#5B3A1E', muzzle='#F3DDBF'),
  'hedgehog':  dict(base='#E9D2B0', dark='#7A5C45', ears='mane', muzzle='#F8EAD6', size=(15, 14)),
  'kingfisher':dict(base='#1D8FD6', dark='#0F6AA6', face='bird', ears='crest', mark='whitehead', markc='#FDBA74', beak='#1F2340'),
  'heron':     dict(base='#CBD5E1', dark='#94A3B8', face='bird', ears='crest', beak='#F59E0B', mark='cap', markc='#334155'),
  'turtle':    dict(base='#6FBF73', dark='#3E8E46', face='turtle', ears='none', size=(16, 15)),
  'owl':       dict(base='#8B6BE0', dark='#6A4CC0', face='owl', ears='tuft', size=(18, 18)),
  'badger':    dict(base='#E5E7EB', dark='#374151', ears='small', mark='stripes', markc='#1F2937', muzzle='#F9FAFB'),
  'raven':     dict(base='#3B4166', dark='#252A47', face='bird', ears='none', beak='#111827', hook=True, eye='#FDE68A'),
  'moth':      dict(base='#D9CDF6', dark='#A996E0', face='mammal', ears='antennae', muzzle='#EFE9FF'),
  'bat':       dict(base='#4B4470', dark='#2E2952', ears='bat', muzzle='#7A72A8', eye='#FDE68A'),
  'civet':     dict(base='#9CA3AF', dark='#4B5563', ears='pointy', mark='mask', markc='#1F2937', muzzle='#E5E7EB'),
  # Guardians
  'stag':      dict(base='#C68B59', dark='#8A5A33', ears='antlers', snout=8, muzzle='#EBD3B8', brow=True),
  'gazelle':   dict(base='#E2B072', dark='#A9763A', ears='horns', snout=7, muzzle='#FBEBD3', brow=True),
  'beaver':    dict(base='#9A6A43', dark='#6B4426', ears='small', muzzle='#D9B48F', brow=True, whiskers=True),
  'snow-lynx': dict(base='#E8ECF4', dark='#9AA6BF', ears='tuft', muzzle='#FFFFFF', brow=True, eye='#3B4166'),
  'great-wolf':dict(base='#7C88B8', dark='#4E5A8C', ears='pointy', snout=9, muzzle='#DDE3F5', brow=True, mark='moon', markc='#E7EAFF'),
  'panther':   dict(base='#3A3360', dark='#231E40', ears='round', muzzle='#5C5490', brow=True, eye='#C4B5FD'),
  'falcon':    dict(base='#7C93A8', dark='#4E6478', face='bird', ears='none', mark='mask', markc='#1F2937', beak='#FBBF24', hook=True, brow=True),
  'great-eagle':dict(base='#7A4E22', dark='#4F3010', face='bird', ears='none', mark='whitehead', markc='#FFFFFF', beak='#F2B233', hook=True, brow=True),
  'aurora-lion':dict(base='#F3C77A', dark='#A781FF', ears='mane', muzzle='#FFF1D6', brow=True, size=(17, 15)),
}

def portrait(animal, bg, ring=None, guardian=False):
    """ภาพตัวละคร 96x96: พื้นวงกลมสี League + หัวสัตว์ (Guardian มีวงแหวนกรอบ)"""
    head = animal_head(A[animal])
    s = f'<circle cx="48" cy="48" r="46" fill="{bg}"/>'
    if guardian:
        s += f'<circle cx="48" cy="48" r="43" fill="none" stroke="{ring}" stroke-width="4"/>'
        s += f'<circle cx="48" cy="48" r="37" fill="none" stroke="{ring}" stroke-width="1.5" stroke-dasharray="2 5"/>'
    s += f'<g transform="translate(16 14)">{head}</g>'
    return s

# ---------- ตรา 9 League (viewBox 0 0 120 120) ----------
def _sil(animal, color, cut, scale=0.9, dy=0):
    a = dict(A_SIL[animal]); a['cut'] = cut
    return f'<g transform="translate({60-32*scale} {58-34*scale+dy}) scale({scale})">{animal_head(a, mono=color)}</g>'

A_SIL = {
  'finch':   dict(face='bird', ears='crest', size=(17, 16)),
  'hare':    dict(ears='long'),
  'otter':   dict(ears='small', snout=8, whiskers=False),
  'lynx':    dict(ears='tuft'),
  'wolf':    dict(ears='pointy', snout=11, size=(17, 17)),
  'panther': dict(ears='round'),
  'falcon':  dict(face='bird', ears='none', hook=True),
  'eagle':   dict(face='bird', ears='none', hook=True),
  'lion':    dict(ears='mane', size=(16, 14)),
}

def deep_path(d, c, cd, dy=4):
    return f'<path d="{d}" fill="{cd}" transform="translate(0 {dy})"/><path d="{d}" fill="{c}"/>'

def badge(lg):
    c = lg['colors']; P, S, X = c['primary'], c['secondary'], c['accent']
    i = lg['order']
    if i == 1:   # Trail Finch: โล่กลมเล็ก เรียบที่สุด + เส้นทางเริ่มเดินทาง
        return (f'<circle cx="60" cy="63" r="34" fill="{X}"/><circle cx="60" cy="60" r="34" fill="{P}"/>'
                f'<circle cx="60" cy="60" r="27" fill="none" stroke="{S}" stroke-width="2.5" opacity=".7"/>'
                f'<path d="M30 86q15-9 30-4t30-6" stroke="{S}" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round" fill="none"/>'
                + _sil('finch', S, P, 0.72))
    if i == 2:   # Swift Hare: โล่ยาวขึ้น + เส้นความเร็ว
        d = 'M60 14C82 18 90 30 90 52C90 80 75 97 60 106C45 97 30 80 30 52C30 30 38 18 60 14Z'
        return (deep_path(d, P, X) + f'<path d="{d}" fill="none" stroke="{S}" stroke-width="2.5" transform="translate(60 60) scale(.84) translate(-60 -60)"/>'
                f'<path d="M14 50h12M10 60h14M14 70h10" stroke="{X}" stroke-width="4" stroke-linecap="round"/>'
                + _sil('hare', S, P, 0.72, 4))
    if i == 3:   # River Otter: หกเหลี่ยมมน + ลายคลื่น
        d = 'M60 10L100 33V83L60 106L20 83V33Z'
        return (f'<path d="{d}" fill="{S}" stroke="{S}" stroke-width="10" stroke-linejoin="round" transform="translate(0 4)"/>'
                f'<path d="{d}" fill="{P}" stroke="{P}" stroke-width="10" stroke-linejoin="round"/>'
                f'<path d="M30 80q7-6 15 0t15 0 15 0 15 0M34 90q6-5 13 0t13 0 13 0 13 0" stroke="{X}" stroke-width="3" fill="none" stroke-linecap="round"/>'
                + _sil('otter', X, P, 0.74, -6))
    if i == 4:   # Crest Lynx: โล่แหลม + crest เรขาคณิตด้านบน
        d = 'M60 16L94 28V60C94 84 79 100 60 110C41 100 26 84 26 60V28Z'
        return (f'<path d="M60 2L68 14 60 22 52 14Z" fill="{X}"/>' + deep_path(d, P, X)
                + f'<path d="M60 26L84 35V60C84 78 74 90 60 98C46 90 36 78 36 60V35Z" fill="none" stroke="{S}" stroke-width="2"/>'
                + _sil('lynx', S, P, 0.72, 2))
    if i == 5:   # Moon Wolf: กว้างขึ้น + Moon Arc + crest สามแฉก
        d = 'M60 18L100 30V60C100 88 82 104 60 112C38 104 20 88 20 60V30Z'
        return (f'<path d="M86 6a22 22 0 1 0 18 34a17 17 0 1 1-18-34Z" fill="{S}" stroke="{X}" stroke-width="2.5"/>'
                f'<path d="M44 16l4-10 4 10ZM56 14l4-12 4 12ZM68 16l4-10 4 10Z" fill="{X}"/>'
                + deep_path(d, P, X) + _sil('wolf', S, P, 0.74, 2))
    if i == 6:   # Shadow Panther: เหลี่ยมคม + facet + ขอบสว่าง (ไม่ดำล้วน เห็นบนพื้นมืด)
        d = 'M60 8L102 22L96 72L60 112L24 72L18 22Z'
        return (deep_path(d, P, '#1A1530') + f'<path d="{d}" fill="none" stroke="{X}" stroke-width="3" stroke-linejoin="round"/>'
                f'<path d="M60 8V30M18 22L38 34M102 22L82 34M24 72L42 64M96 72L78 64" stroke="{S}" stroke-width="2"/>'
                + _sil('panther', X, P, 0.7, 2))
    if i == 7:   # Storm Falcon: ปีกสองข้าง + สายฟ้า
        wing = 'M44 40C30 30 14 30 4 36C14 40 18 46 20 52C12 52 8 56 6 60C16 60 24 64 30 70C24 72 22 76 22 80C32 76 40 74 46 70Z'
        d = 'M60 16L86 26V58C86 82 74 98 60 106C46 98 34 82 34 58V26Z'
        return (f'<path d="{wing}" fill="{X}"/><path d="{wing}" fill="{X}" transform="translate(120 0) scale(-1 1)"/>'
                + deep_path(d, P, '#0E5E70') + f'<path d="M66 70l-8 12 6 0-4 12 12-16h-6l4-8Z" fill="{X}"/>'
                + _sil('falcon', S, P, 0.62, -6))
    if i == 8:   # Crown Eagle: ปีกเต็ม + มงกุฎแบบ abstract
        wing = 'M42 36C26 22 8 22 0 30C8 34 10 40 10 44C2 46 0 52 0 56C10 54 18 58 22 62C14 66 12 72 14 78C24 72 34 70 44 68Z'
        d = 'M60 22L88 32V62C88 86 75 100 60 108C45 100 32 86 32 62V32Z'
        return (f'<path d="{wing}" fill="{X}"/><path d="{wing}" fill="{X}" transform="translate(120 0) scale(-1 1)"/>'
                f'<path d="M44 20L48 4 56 14 60 0 64 14 72 4 76 20Z" fill="{P}" stroke="{X}" stroke-width="2" stroke-linejoin="round"/>'
                + deep_path(d, P, X) + f'<path d="M60 32L80 39V62C80 80 71 91 60 97C49 91 40 80 40 62V39Z" fill="none" stroke="{S}" stroke-width="2"/>'
                + _sil('eagle', S, P, 0.62, 2))
    # Aurora Lion: ตราสูงสุด — halo + แผงคอเรขาคณิต + aurora gradient แบบนุ่ม
    import math
    g = c.get('aurora', ['#69E0B8', '#68A9FF', '#A781FF'])
    rays = ''.join(
        f'<path d="M60 60L{60+50*math.cos(a-0.16):.1f} {60+50*math.sin(a-0.16):.1f}L{60+56*math.cos(a):.1f} {60+56*math.sin(a):.1f}L{60+50*math.cos(a+0.16):.1f} {60+50*math.sin(a+0.16):.1f}Z" fill="url(#aurora-rays)"/>'
        for a in [k * math.pi / 8 for k in range(16)])
    return (f'<defs><linearGradient id="aurora-rays" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{g[0]}"/><stop offset=".5" stop-color="{g[1]}"/><stop offset="1" stop-color="{g[2]}"/></linearGradient></defs>'
            + rays + f'<circle cx="60" cy="60" r="40" fill="{c.get("base", "#20253F")}"/>'
            f'<circle cx="60" cy="60" r="40" fill="none" stroke="url(#aurora-rays)" stroke-width="4"/>'
            f'<circle cx="60" cy="60" r="33" fill="none" stroke="{S}" stroke-width="1.2" opacity=".6"/>'
            + _sil('lion', S, c.get('base', '#20253F'), 0.66, 2))
