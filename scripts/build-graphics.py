#!/usr/bin/env python3
"""
สร้างกราฟิกทั้งหมดของ EnglishQuest จากชุดรูปทรงเดียวกัน (Art direction: "Flat + subtle depth")
    python3 scripts/build-graphics.py

ผลลัพธ์ (SVG sprite — โหลดครั้งเดียว แคชได้ ใช้ผ่าน <svg><use href="...#id"/></svg>):
    public/assets/illustrations/illustrations.svg   ภาพประกอบประจำหน้า + Empty/Success state
    public/assets/mascot/mascot.svg                  Fox mascot 8 อารมณ์ (character sheet)
    public/assets/avatars/avatars.svg                อวตารสัตว์ 12 แบบ (สไตล์เดียวกับ mascot)
    public/assets/badges/badges.svg                  ตราระดับ CEFR + เหรียญ Bronze/Silver/Gold/Platinum
    public/assets/backgrounds/dots.svg               ลายจุดพื้นหลัง

กติกาของสไตล์ (ห้ามหลุด):
  1. รูปทรงเรขาคณิตมุมมน ไม่มีเส้นขอบรอบวัตถุ
  2. มิติ = "เงาด้านข้าง" สีเข้มกว่า 1 ระดับ เลื่อนลง 4–6px + เงาพื้นวงรีจาง ๆ — ไม่ใช้ gradient
  3. สีจากพาเลต --il-* เท่านั้น (สลับธีมสว่าง/มืดได้ด้วย CSS) ห้ามใช้สีสุ่ม
  4. เส้น (ตา ปาก เครื่องหมาย) ปลายมน หนา 3–4px
"""
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')

# ---------- พาเลต (ค่าตั้งต้น = ธีมสว่าง; CSS override ได้ผ่าน --il-*) ----------
PAL = {
    'indigo': '#4F46E5', 'indigo-d': '#3730A3',
    'lilac': '#C7D2FE', 'lilac-d': '#A5B4FC',
    'coral': '#FF7A3D', 'coral-d': '#D9541C',
    'teal': '#14B8A6', 'teal-d': '#0E8C7E',
    'amber': '#FBBF24', 'amber-d': '#D99A0B',
    'paper': '#FFFFFF', 'paper-d': '#DDE1EE',
    'ink': '#1F2340', 'line': '#E3E6F0',
    'bg': '#EEF0FF', 'ground': 'rgba(31,35,64,0.08)',
}


def c(name):
    return f'var(--il-{name},{PAL[name]})'


def fill(name, extra=''):
    return f'style="fill:{c(name)}{";" + extra if extra else ""}"'


def stroke(name, w=3.5, extra=''):
    return (f'style="fill:none;stroke:{c(name)};stroke-width:{w};stroke-linecap:round;'
            f'stroke-linejoin:round{";" + extra if extra else ""}"')


def deep(shape, color, dy=5):
    """วาดรูปทรงพร้อม 'เงาด้านข้าง' (กติกาข้อ 2) — shape คือ string ของ element ที่ยังไม่ใส่ style"""
    return (f'<g transform="translate(0 {dy})">{shape.replace("/>", " " + fill(color + "-d") + "/>", 1)}</g>'
            f'{shape.replace("/>", " " + fill(color) + "/>", 1)}')


def ground(cx, cy, rx, ry=7):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" {fill("ground")}/>'


def blob(path='M40 120C30 60 90 22 160 26s128 36 124 98-60 96-130 92S48 176 40 120Z'):
    return f'<path d="{path}" {fill("bg")}/>'


def sparkle(x, y, s=8, color='amber'):
    """ประกาย 4 แฉก (ใช้แทนดาว emoji)"""
    return (f'<path d="M{x} {y-s}Q{x+s*0.18} {y-s*0.18} {x+s} {y}Q{x+s*0.18} {y+s*0.18} {x} {y+s}'
            f'Q{x-s*0.18} {y+s*0.18} {x-s} {y}Q{x-s*0.18} {y-s*0.18} {x} {y-s}Z" {fill(color)}/>')


def check(x, y, s=1.0, color='paper', w=4):
    return (f'<path d="M{x-8*s} {y}l{5*s} {5*s} {11*s}-{11*s}" {stroke(color, w)}/>')


def lines(x, y, w, n, gap=10, color='line', h=4):
    out = []
    for i in range(n):
        ww = w if i < n - 1 else w * 0.6
        out.append(f'<rect x="{x}" y="{y + i*gap}" width="{ww}" height="{h}" rx="{h/2}" {fill(color)}/>')
    return ''.join(out)


def text(x, y, s, size, color='paper', weight=800, anchor='middle'):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" '
            f'font-family="Plus Jakarta Sans, Noto Sans Thai, system-ui, sans-serif" {fill(color)}>{s}</text>')


def symbol(id_, vb, body, title):
    return f'<symbol id="{id_}" viewBox="{vb}"><title>{title}</title>{body}</symbol>'


def write(rel, symbols, note):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg"><!-- {note} — สร้างโดย scripts/build-graphics.py ห้ามแก้ด้วยมือ -->\n'
           + '\n'.join(symbols) + '\n</svg>\n')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f'{rel}: {len(symbols)} symbols, {len(svg.encode())} bytes')


# =====================================================================
# ILLUSTRATIONS (viewBox 320x240)
# =====================================================================
def card(x, y, w, h, rot=0, color='paper', rx=14, inner=''):
    """การ์ด (มีเงาด้านข้าง) + เนื้อหาในการ์ด หมุนไปด้วยกัน"""
    shape = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>'
    g = deep(shape, color) + inner
    return f'<g transform="rotate({rot} {x + w/2} {y + h/2})">{g}</g>' if rot else f'<g>{g}</g>'


def bubble(x, y, w, h, color, tail='left'):
    tx = x + 22 if tail == 'left' else x + w - 22
    d = 1 if tail == 'left' else -1
    shape = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18"/>'
    t = f'<path d="M{tx} {y+h-2}l{-4*d} 16 {18*d} -16Z" {fill(color)}/>'
    return deep(shape, color) + t


def il_home():
    b = blob()
    b += ground(160, 212, 104)
    # หนังสือเปิด
    b += f'<path d="M58 160Q108 142 160 162V214Q108 196 58 210Z" {fill("paper-d")}/>'
    b += f'<path d="M262 160Q212 142 160 162V214Q212 196 262 210Z" {fill("paper-d")}/>'
    b += f'<path d="M58 152Q108 134 160 154V206Q108 188 58 202Z" {fill("paper")}/>'
    b += f'<path d="M262 152Q212 134 160 154V206Q212 188 262 202Z" {fill("paper")}/>'
    b += f'<path d="M160 154V206" {stroke("lilac-d", 3)}/>'
    for i in range(3):
        y = 166 + i * 10
        b += f'<path d="M76 {y}Q110 {y-10} 146 {y+2}" {stroke("line", 4)}/>'
        b += f'<path d="M174 {y+2}Q210 {y-10} 244 {y}" {stroke("line", 4)}/>'
    # บับเบิลคำพูด 2 ภาษา
    b += bubble(52, 50, 104, 52, 'indigo', 'left') + text(104, 84, 'Hello!', 22)
    b += bubble(174, 82, 98, 48, 'coral', 'right') + text(223, 113, 'สวัสดี', 19)
    # ตัวอักษรลอย
    tile_a = deep('<rect x="28" y="116" width="34" height="34" rx="9"/>', 'amber', 4) + text(45, 140, 'A', 20, 'ink')
    tile_b = deep('<rect x="258" y="40" width="34" height="34" rx="9"/>', 'teal', 4) + text(275, 63, 'b', 20)
    b += f'<g transform="rotate(-12 45 133)">{tile_a}</g><g transform="rotate(10 275 57)">{tile_b}</g>'
    b += sparkle(176, 40, 9) + sparkle(36, 74, 6, 'lilac-d') + sparkle(292, 140, 7, 'coral')
    return b


def il_placement():
    b = blob('M36 132C26 70 84 24 160 28s132 40 126 100-56 92-128 88S46 190 36 132Z')
    b += ground(118, 210, 70)
    # เส้นทางจุด ๆ พร้อมโหนดระดับ
    b += f'<path d="M40 200C90 196 96 150 150 150S214 104 250 70" {stroke("lilac-d", 4, "stroke-dasharray:2 10")}/>'
    for (x, y, col) in [(40, 200, 'teal'), (100, 176, 'indigo'), (160, 148, 'coral'), (212, 116, 'amber')]:
        b += f'<circle cx="{x}" cy="{y}" r="9" {fill(col)}/><circle cx="{x}" cy="{y}" r="3.5" {fill("paper")}/>'
    # ธง
    b += f'<rect x="250" y="34" width="5" height="44" rx="2.5" {fill("ink")}/>'
    b += f'<path d="M255 36h30l-8 10 8 10h-30Z" {fill("coral")}/>'
    # เข็มทิศ
    b += deep('<circle cx="118" cy="110" r="56"/>', 'paper', 6)
    b += f'<circle cx="118" cy="110" r="46" {stroke("lilac", 6)}/>'
    for a in range(0, 360, 45):
        b += f'<rect x="116" y="68" width="4" height="{10 if a % 90 == 0 else 6}" rx="2" transform="rotate({a} 118 110)" {fill("lilac-d")}/>'
    b += f'<path d="M118 76L130 110H106Z" {fill("coral")}/><path d="M118 144L130 110H106Z" {fill("indigo")}/>'
    b += f'<circle cx="118" cy="110" r="6" {fill("paper")}/>'
    b += sparkle(196, 196, 7, 'teal') + sparkle(56, 64, 8)
    return b


def il_vocab():
    b = blob()
    b += ground(156, 212, 96)
    b += card(76, 70, 104, 132, -14, 'lilac')
    b += card(160, 66, 104, 132, 12, 'coral')
    b += card(108, 52, 112, 146, 0, 'paper', 14, text(164, 116, 'Aa', 40, 'indigo') + lines(130, 136, 68, 3, 11))
    # กองหนังสือ
    for i, col in enumerate(['teal', 'amber', 'indigo']):
        y = 190 - i * 16
        w = 80 - i * 8
        b += deep(f'<rect x="{240 - w/2 + i*3}" y="{y}" width="{w}" height="14" rx="4"/>', col, 4)
    b += sparkle(76, 56, 8) + sparkle(282, 64, 6, 'teal')
    return b


def block(x, y, w, word, col, rot=0):
    g = deep(f'<rect x="{x}" y="{y}" width="{w}" height="40" rx="10"/>', col, 5) + text(x + w/2, y + 26, word, 16)
    return f'<g transform="rotate({rot} {x + w/2} {y + 20})">{g}</g>' if rot else g


def il_grammar():
    b = blob('M44 126C34 64 92 28 162 30s124 40 120 98-58 92-126 90S52 180 44 126Z')
    b += ground(160, 206, 120)
    b += f'<rect x="40" y="186" width="240" height="12" rx="6" {fill("paper-d")}/>'
    b += block(44, 140, 52, 'I', 'indigo')
    b += block(102, 140, 72, 'read', 'teal')
    b += block(180, 140, 84, 'books', 'coral')
    # บล็อกที่กำลังวางเข้าประโยค
    b += block(140, 62, 112, 'every day', 'amber', -8)
    b += f'<path d="M150 112v14M196 106v14M242 100v14" {stroke("lilac-d", 3.5, "stroke-dasharray:3 7")}/>'
    b += text(270, 168, '.', 40, 'ink')
    b += sparkle(70, 80, 9, 'lilac-d') + sparkle(278, 54, 7)
    return b


def il_review():
    b = blob()
    b += ground(160, 212, 90)
    b += f'<path d="M84 120a76 76 0 0 1 140-40" {stroke("lilac", 14)}/>'
    b += f'<path d="M236 120a76 76 0 0 1-140 40" {stroke("lilac", 14)}/>'
    b += f'<path d="M214 58l18 24-30 4Z" {fill("lilac-d")}/><path d="M106 182l-18-24 30-4Z" {fill("lilac-d")}/>'
    b += card(118, 84, 92, 112, -8, 'lilac')
    b += card(116, 78, 92, 112, 0, 'paper', 14, lines(132, 104, 60, 3, 11))
    b += f'<circle cx="198" cy="172" r="20" {fill("teal")}/>' + check(197, 171, 0.9)
    b += sparkle(272, 160, 8) + sparkle(54, 72, 6, 'coral')
    return b


def shield(cx, y, col, s=1.0):
    d = (f'M{cx} {y}L{cx+44*s} {y+14*s}V{y+58*s}C{cx+44*s} {y+86*s} {cx+22*s} {y+104*s} {cx} {y+112*s}'
         f'C{cx-22*s} {y+104*s} {cx-44*s} {y+86*s} {cx-44*s} {y+58*s}V{y+14*s}Z')
    return deep(f'<path d="{d}"/>', col, 6)


def il_battle():
    b = blob('M36 130C26 66 88 26 160 28s134 42 128 102-62 90-130 86S46 186 36 130Z')
    b += ground(160, 212, 110)
    b += f'<g transform="rotate(-10 108 110)">{shield(108, 54, "indigo")}<path d="M108 82v52M90 100h36" {stroke("paper", 6)}/></g>'
    b += f'<g transform="rotate(10 212 110)">{shield(212, 54, "coral")}<circle cx="212" cy="110" r="16" {stroke("paper", 6)}/></g>'
    b += deep('<circle cx="160" cy="118" r="26"/>', 'amber', 4) + text(160, 127, 'VS', 20, 'ink')
    b += f'<path d="M160 60v-14M134 70l-8-10M186 70l8-10" {stroke("amber-d", 4)}/>'
    b += sparkle(48, 70, 8, 'teal') + sparkle(276, 64, 7)
    return b


def il_leaderboard():
    b = blob()
    b += ground(160, 210, 110)
    b += deep('<rect x="64" y="132" width="64" height="72" rx="10"/>', 'lilac') + text(96, 178, '2', 26, 'indigo')
    b += deep('<rect x="192" y="152" width="64" height="52" rx="10"/>', 'coral') + text(224, 186, '3', 24)
    b += deep('<rect x="128" y="104" width="64" height="100" rx="10"/>', 'indigo') + text(160, 160, '1', 32)
    # เหรียญบนแท่นที่ 1
    b += f'<path d="M148 58l-10 30h14l8-14M172 58l10 30h-14l-8-14" {fill("coral-d")}/>'
    b += deep('<circle cx="160" cy="64" r="22"/>', 'amber', 4)
    b += f'<circle cx="160" cy="64" r="14" {stroke("amber-d", 3.5)}/>'
    for side in (-1, 1):
        for i in range(3):
            x = 160 + side * (34 + i * 9)
            y = 74 - i * 12
            b += f'<ellipse cx="{x}" cy="{y}" rx="5" ry="9" transform="rotate({side*-30} {x} {y})" {fill("teal")}/>'
    b += sparkle(56, 92, 7) + sparkle(270, 110, 8, 'teal')
    return b


def confetti():
    out = ''
    for (x, y, r, col) in [(64, 70, 20, 'coral'), (250, 62, -30, 'teal'), (80, 170, 40, 'amber'),
                           (246, 168, -16, 'indigo'), (110, 44, 60, 'lilac-d'), (214, 40, 12, 'amber')]:
        out += f'<rect x="{x}" y="{y}" width="14" height="6" rx="3" transform="rotate({r} {x} {y})" {fill(col)}/>'
    for (x, y, col) in [(48, 120, 'indigo'), (276, 118, 'coral'), (150, 32, 'teal')]:
        out += f'<circle cx="{x}" cy="{y}" r="5" {fill(col)}/>'
    return out


def il_success():
    b = blob()
    b += ground(160, 208, 70)
    b += confetti()
    b += f'<circle cx="160" cy="116" r="66" {fill("teal", "opacity:.16")}/>'
    b += deep('<circle cx="160" cy="116" r="48"/>', 'teal', 6)
    b += check(158, 114, 2.0, 'paper', 9)
    return b


def il_empty_review():
    b = blob('M40 126C32 66 92 30 162 32s124 36 120 94-58 92-126 90S48 182 40 126Z')
    b += ground(160, 206, 80)
    for i, col in enumerate(['lilac', 'lilac', 'paper']):
        b += card(104 + i*2, 120 - i*16, 112, 70, 0, col, 12)
    b += lines(124, 106, 60, 2, 12)
    b += f'<circle cx="214" cy="96" r="22" {fill("teal")}/>' + check(213, 95, 1.0)
    # พระจันทร์เสี้ยว = "สงบ ไม่มีงานค้าง"
    b += f'<path d="M86 46a22 22 0 1 0 26 30a18 18 0 1 1-26-30Z" {fill("amber")}/>'
    b += sparkle(252, 52, 7, 'lilac-d') + sparkle(64, 120, 5, 'lilac-d')
    return b


def person(cx, cy, col, r=22):
    return (deep(f'<circle cx="{cx}" cy="{cy}" r="{r}"/>', col, 4)
            + f'<circle cx="{cx}" cy="{cy - r*0.22}" r="{r*0.34}" {fill("paper")}/>'
            + f'<path d="M{cx - r*0.56} {cy + r*0.56}a{r*0.56} {r*0.46} 0 0 1 {r*1.12} 0Z" {fill("paper")}/>')


def il_empty_friends():
    b = blob()
    b += ground(160, 206, 96)
    b += f'<path d="M92 150L160 92 228 150M92 150H228" {stroke("lilac-d", 4)}/>'
    b += person(160, 92, 'indigo', 28) + person(92, 150, 'teal') + person(228, 150, 'coral')
    b += f'<circle cx="160" cy="178" r="20" {stroke("lilac-d", 3.5, "stroke-dasharray:5 6")}/>'
    b += f'<path d="M160 170v16M152 178h16" {stroke("lilac-d", 3.5)}/>'
    b += sparkle(260, 70, 8) + sparkle(60, 86, 6, 'lilac-d')
    return b


def il_empty_room():
    b = blob('M36 128C28 66 90 30 160 32s132 38 126 98-60 90-128 88S44 186 36 128Z')
    b += f'<ellipse cx="160" cy="166" rx="118" ry="36" {fill("lilac-d")}/>'
    b += f'<ellipse cx="160" cy="158" rx="118" ry="36" {fill("lilac")}/>'
    b += f'<ellipse cx="160" cy="158" rx="86" ry="22" {stroke("paper", 3, "stroke-dasharray:8 8")}/>'
    for x in (110, 210):
        b += f'<circle cx="{x}" cy="150" r="16" {stroke("indigo", 3.5, "stroke-dasharray:4 6")}/>'
    for x, col in ((46, 'coral'), (274, 'teal')):
        b += f'<rect x="{x - 2}" y="74" width="4" height="84" rx="2" {fill("ink")}/>'
        b += f'<path d="M{x + 2} 76h26l-6 9 6 9h-26Z" {fill(col)}/>'
    b += sparkle(160, 70, 9)
    return b


def il_empty_search():
    b = blob()
    b += ground(150, 208, 84)
    b += card(84, 60, 128, 140, -6, 'paper', 14, lines(104, 90, 84, 4, 14))
    b += f'<circle cx="198" cy="128" r="38" {fill("paper", "opacity:.7")}/>'
    b += f'<circle cx="198" cy="128" r="38" {stroke("indigo", 10)}/>'
    b += f'<path d="M226 158l28 28" {stroke("indigo-d", 14)}/>'
    b += f'<circle cx="186" cy="128" r="3.5" {fill("lilac-d")}/><circle cx="198" cy="128" r="3.5" {fill("lilac-d")}/><circle cx="210" cy="128" r="3.5" {fill("lilac-d")}/>'
    b += sparkle(262, 76, 7, 'coral') + sparkle(64, 166, 6)
    return b


def il_offline():
    b = blob()
    b += ground(160, 200, 80)
    b += (f'<path d="M96 168a34 34 0 0 1 8-66 48 48 0 0 1 92-8 38 38 0 0 1 28 74Z" {fill("paper-d")}/>'
          f'<path d="M96 160a34 34 0 0 1 8-66 48 48 0 0 1 92-8 38 38 0 0 1 28 74Z" {fill("paper")}/>')
    b += f'<path d="M110 60L214 184" {stroke("coral", 10)}/>'
    return b


def il_login():
    """ทางขึ้นบันได A1 → C1 (ใช้บนพื้นม่วงของหน้า Login)"""
    b = ''
    cols = ['teal', 'indigo', 'lilac', 'coral', 'amber']
    labels = ['A1', 'A2', 'B1', 'B2', 'C1']
    for i, (col, lb) in enumerate(zip(cols, labels)):
        x = 20 + i * 58
        h = 40 + i * 30
        y = 220 - h
        b += deep(f'<rect x="{x}" y="{y}" width="52" height="{h}" rx="10"/>', col, 6)
        b += text(x + 26, y + 26, lb, 15, 'ink' if col in ('lilac', 'amber') else 'paper')
    # ธงบนยอด C1
    b += f'<rect x="270" y="14" width="4" height="46" rx="2" {fill("paper")}/>'
    b += f'<path d="M274 16h28l-7 10 7 10h-28Z" {fill("coral")}/>'
    b += bubble(28, 52, 92, 46, 'paper', 'left') + text(74, 82, 'Aa', 22, 'indigo')
    b += sparkle(150, 62, 8) + sparkle(220, 34, 6, 'paper')
    return b


ILLUSTRATIONS = [
    ('il-home', il_home, 'การเรียนภาษา: หนังสือเปิดกับบทสนทนาสองภาษา'),
    ('il-placement', il_placement, 'เข็มทิศและเส้นทางการเรียน'),
    ('il-vocab', il_vocab, 'การ์ดคำศัพท์และกองหนังสือ'),
    ('il-grammar', il_grammar, 'บล็อกคำที่ต่อกันเป็นประโยค'),
    ('il-review', il_review, 'การ์ดทบทวนในวงจรความจำ'),
    ('il-battle', il_battle, 'โล่สองใบประชันกัน'),
    ('il-leaderboard', il_leaderboard, 'แท่นอันดับ 1 2 3'),
    ('il-success', il_success, 'เครื่องหมายสำเร็จ'),
    ('il-empty-review', il_empty_review, 'ทบทวนครบแล้ว'),
    ('il-empty-friends', il_empty_friends, 'เครือข่ายเพื่อน'),
    ('il-empty-room', il_empty_room, 'สนามแข่งที่ยังว่าง'),
    ('il-empty-search', il_empty_search, 'แว่นขยายบนการ์ดว่าง'),
    ('il-offline', il_offline, 'ไม่มีการเชื่อมต่อ'),
    ('il-login', il_login, 'บันไดระดับ A1 ถึง C1'),
]


# =====================================================================
# MASCOT — Fox (viewBox 160x160)
# =====================================================================
INK = 'ink'


def fox_head(eyes='open', mouth='smile', brows=False, look=(0, 0)):
    h = ''
    # หู
    h += f'<path d="M50 52L44 16 74 38Z" {fill("coral")}/><path d="M110 52L116 16 86 38Z" {fill("coral")}/>'
    h += f'<path d="M53 45L50 26 66 39Z" {fill("coral-d")}/><path d="M107 45L110 26 94 39Z" {fill("coral-d")}/>'
    # หัว (เงาด้านข้าง + หน้า)
    head = 'M42 66C42 45 59 34 80 34S118 45 118 66C118 84 101 98 80 100C59 98 42 84 42 66Z'
    h += f'<path d="{head}" transform="translate(0 4)" {fill("coral-d")}/><path d="{head}" {fill("coral")}/>'
    h += f'<path d="M48 72C58 73 69 80 80 93C91 80 102 73 112 72C110 88 97 100 80 100S50 88 48 72Z" {fill("paper")}/>'
    lx, ly = look
    if eyes == 'open':
        for x in (65, 95):
            h += f'<ellipse cx="{x+lx}" cy="{66+ly}" rx="4.6" ry="5.6" {fill(INK)}/><circle cx="{x+lx+1.6}" cy="{64+ly}" r="1.6" {fill("paper")}/>'
    elif eyes == 'happy':
        h += f'<path d="M59 68Q65 60 71 68M89 68Q95 60 101 68" {stroke(INK, 4)}/>'
    elif eyes == 'confused':
        h += f'<ellipse cx="65" cy="66" rx="5.4" ry="6.4" {fill(INK)}/><circle cx="66.8" cy="64" r="1.8" {fill("paper")}/>'
        h += f'<path d="M90 67h10" {stroke(INK, 4)}/>'
    if brows:
        h += f'<path d="M58 54q7-4 13-1M89 50q7-5 13 0" {stroke("coral-d", 3.5)}/>'
    h += f'<ellipse cx="80" cy="84" rx="5.4" ry="3.8" {fill(INK)}/>'
    if mouth == 'smile':
        h += f'<path d="M73 89Q80 95 87 89" {stroke(INK, 3)}/>'
    elif mouth == 'open':
        h += f'<path d="M72 89Q80 89 88 89Q86 100 80 100Q74 100 72 89Z" {fill(INK)}/><path d="M75 96Q80 92 85 96Q83 100 80 100Q77 100 75 96Z" {fill("coral")}/>'
    elif mouth == 'flat':
        h += f'<path d="M75 91h10" {stroke(INK, 3)}/>'
    elif mouth == 'wavy':
        h += f'<path d="M71 92q4.5-4 9 0t9 0" {stroke(INK, 3)}/>'
    return h


def fox_body(arms='down'):
    b = ground(80, 152, 42, 6)
    b += f'<path d="M106 136C138 140 150 108 138 86C128 104 118 116 102 120Z" {fill("coral-d")}/>'
    b += f'<path d="M138 86C148 98 147 112 140 122C135 112 135 98 138 86Z" {fill("paper")}/>'
    body = 'M54 150C50 122 61 102 80 102S110 122 106 150Z'
    b += f'<path d="{body}" {fill("coral")}/>'
    b += f'<ellipse cx="80" cy="132" rx="15" ry="17" {fill("paper")}/>'
    if arms == 'down':
        b += f'<ellipse cx="60" cy="128" rx="7" ry="10" {fill("coral-d")}/><ellipse cx="100" cy="128" rx="7" ry="10" {fill("coral-d")}/>'
    return b


def paw(x, y):
    return f'<circle cx="{x}" cy="{y}" r="8" {fill("coral-d")}/>'


def arm(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" {stroke("coral-d", 11)}/>' + paw(x2, y2)


def mascot(state):
    if state == 'normal':
        return fox_body() + fox_head()
    if state == 'happy':
        return fox_body() + fox_head('happy', 'open')
    if state == 'thinking':
        return (fox_body('none') + f'<ellipse cx="60" cy="128" rx="7" ry="10" {fill("coral-d")}/>'
                + fox_head('open', 'flat', True, (2, -3)) + arm(100, 124, 92, 104)
                + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" {fill("lilac-d")}/>' for x, y, r in ((124, 40, 4), (134, 28, 5.5), (146, 14, 7))))
    if state == 'celebration':
        return (fox_body('none') + arm(62, 116, 42, 92) + arm(98, 116, 118, 92)
                + fox_head('happy', 'open')
                + ''.join(f'<rect x="{x}" y="{y}" width="10" height="5" rx="2.5" transform="rotate({r} {x} {y})" {fill(col)}/>'
                          for x, y, r, col in ((26, 60, 30, 'amber'), (132, 54, -24, 'teal'), (22, 108, -40, 'indigo'), (140, 112, 20, 'amber')))
                + sparkle(36, 30, 6) + sparkle(128, 22, 5, 'teal'))
    if state == 'encouragement':
        return (fox_body('none') + f'<ellipse cx="60" cy="128" rx="7" ry="10" {fill("coral-d")}/>'
                + arm(98, 120, 116, 98) + fox_head('open', 'smile', True)
                + f'<path d="M126 84l6-6M130 96h8M122 76l2-8" {stroke("amber", 3.5)}/>')
    if state == 'confused':
        return (fox_body() + f'<g transform="rotate(-8 80 70)">{fox_head("confused", "wavy")}</g>'
                + f'<path d="M124 30q0-10 10-10t10 9q0 6-8 9v6" {stroke("amber-d", 4)}/><circle cx="136" cy="52" r="2.6" {fill("amber-d")}/>')
    if state == 'success':
        return (fox_body('none') + fox_head('happy', 'smile')
                + f'<circle cx="80" cy="128" r="17" {fill("teal-d")}/><circle cx="80" cy="126" r="17" {fill("teal")}/>'
                + check(79, 125, 0.95, 'paper', 4)
                + paw(64, 128) + paw(96, 128))
    if state == 'welcome':
        return (fox_body('none') + f'<ellipse cx="60" cy="128" rx="7" ry="10" {fill("coral-d")}/>'
                + arm(100, 118, 120, 86) + fox_head('open', 'open')
                + f'<path d="M130 74q6 6 4 14M136 66q10 10 6 24" {stroke("lilac-d", 3)}/>')
    raise ValueError(state)


MASCOT_STATES = [('normal', 'ปกติ'), ('happy', 'ดีใจ'), ('thinking', 'กำลังคิด'), ('celebration', 'ฉลอง'),
                 ('encouragement', 'ให้กำลังใจ'), ('confused', 'งง'), ('success', 'สำเร็จ'), ('welcome', 'ต้อนรับ')]


# =====================================================================
# AVATARS (viewBox 64x64) — สไตล์เดียวกับ mascot: หัวกลม + เงาด้านข้าง
# =====================================================================
def eyes(y=36, dx=7, col='#1F2340'):
    return f'<circle cx="{32-dx}" cy="{y}" r="2.6" fill="{col}"/><circle cx="{32+dx}" cy="{y}" r="2.6" fill="{col}"/>'


def head(col, dark, rx=18, ry=16, cy=36):
    return (f'<ellipse cx="32" cy="{cy+2.5}" rx="{rx}" ry="{ry}" fill="{dark}"/>'
            f'<ellipse cx="32" cy="{cy}" rx="{rx}" ry="{ry}" fill="{col}"/>')


def nose(y=42, col='#1F2340'):
    return f'<ellipse cx="32" cy="{y}" rx="2.8" ry="2" fill="{col}"/>'


def av(bg, body):
    return f'<circle cx="32" cy="32" r="32" fill="{bg}"/>{body}'


AVATARS = {
    'fox': av('#FFE6D9', '<path d="M17 30L14 12 28 22Z" fill="#FF7A3D"/><path d="M47 30L50 12 36 22Z" fill="#FF7A3D"/>'
              + head('#FF7A3D', '#D9541C') + '<path d="M16 40c6 0 11 4 16 10 5-6 10-10 16-10-1 7-7 12-16 12s-15-5-16-12Z" fill="#fff"/>'
              + eyes(35) + nose(43)),
    'owl': av('#E6E3FA', '<path d="M17 24l3-10 8 8Z" fill="#7C5CD6"/><path d="M47 24l-3-10-8 8Z" fill="#7C5CD6"/>'
              + head('#8B6BE0', '#6A4CC0', 18, 18, 36)
              + '<circle cx="25" cy="34" r="7" fill="#fff"/><circle cx="39" cy="34" r="7" fill="#fff"/>' + eyes(34)
              + '<path d="M29 41h6l-3 5Z" fill="#FBBF24"/>'),
    'cat': av('#E7E9F3', '<path d="M16 30l2-16 11 9Z" fill="#9AA0BF"/><path d="M48 30l-2-16-11 9Z" fill="#9AA0BF"/>'
              '<path d="M19 26l1-8 5 5Z" fill="#F4B6C2"/><path d="M45 26l-1-8-5 5Z" fill="#F4B6C2"/>'
              + head('#9AA0BF', '#7A809F') + eyes() + '<path d="M30 41h4l-2 2.5Z" fill="#E7778C"/>'
              + '<path d="M14 41h9M14 45h9M50 41h-9M50 45h-9" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'),
    'dog': av('#FBEBD9', head('#D9A066', '#B88148') + '<ellipse cx="14.5" cy="36" rx="5.5" ry="11" fill="#9C6A3A"/><ellipse cx="49.5" cy="36" rx="5.5" ry="11" fill="#9C6A3A"/>'
              + '<ellipse cx="32" cy="44" rx="9" ry="7" fill="#F3DDBF"/>' + eyes(34) + nose(42)),
    'rabbit': av('#F1EEF8', '<ellipse cx="24" cy="15" rx="5" ry="13" fill="#E3E1EE"/><ellipse cx="40" cy="15" rx="5" ry="13" fill="#E3E1EE"/>'
                 '<ellipse cx="24" cy="15" rx="2.4" ry="9" fill="#F4B6C2"/><ellipse cx="40" cy="15" rx="2.4" ry="9" fill="#F4B6C2"/>'
                 + head('#FFFFFF', '#D5D3E3') + eyes() + '<ellipse cx="32" cy="42" rx="2.4" ry="1.8" fill="#E7778C"/>'),
    'bear': av('#F3E6DA', '<circle cx="17" cy="24" r="7" fill="#A0704A"/><circle cx="47" cy="24" r="7" fill="#A0704A"/>'
               + head('#A0704A', '#7F5434') + '<ellipse cx="32" cy="43" rx="9" ry="7" fill="#D7B28E"/>' + eyes(34) + nose(41)),
    'panda': av('#E9EEF5', '<circle cx="17" cy="24" r="7" fill="#1F2340"/><circle cx="47" cy="24" r="7" fill="#1F2340"/>'
                + head('#FFFFFF', '#D5D8E3') + '<ellipse cx="24.5" cy="36" rx="5" ry="6" fill="#1F2340" transform="rotate(-20 24.5 36)"/>'
                '<ellipse cx="39.5" cy="36" rx="5" ry="6" fill="#1F2340" transform="rotate(20 39.5 36)"/>' + eyes(36, 7, '#fff') + nose(44)),
    'lion': av('#FDF0D2', '<circle cx="32" cy="36" r="25" fill="#D9541C"/>' + head('#FBBF24', '#D99A0B', 17, 15)
               + '<ellipse cx="32" cy="44" rx="8" ry="6" fill="#FDE7A8"/>' + eyes(34) + nose(42)),
    'tiger': av('#FFE7D2', '<circle cx="17" cy="24" r="6" fill="#F08A24"/><circle cx="47" cy="24" r="6" fill="#F08A24"/>'
                + head('#F08A24', '#C96C10') + '<path d="M32 21v6M25 23l1 5M39 23l-1 5" stroke="#1F2340" stroke-width="2.4" stroke-linecap="round"/>'
                '<path d="M14 34h5M14 39h4M50 34h-5M50 39h-4" stroke="#1F2340" stroke-width="2.4" stroke-linecap="round"/>'
                '<ellipse cx="32" cy="44" rx="9" ry="6.5" fill="#fff"/>' + eyes(34) + nose(42)),
    'koala': av('#E6ECF2', '<circle cx="15" cy="28" r="9" fill="#8E97AE"/><circle cx="49" cy="28" r="9" fill="#8E97AE"/>'
                '<circle cx="15" cy="28" r="5" fill="#E8EBF2"/><circle cx="49" cy="28" r="5" fill="#E8EBF2"/>'
                + head('#A3ABC0', '#828BA3') + eyes(34, 8) + '<ellipse cx="32" cy="41" rx="4.5" ry="6" fill="#1F2340"/>'),
    'penguin': av('#DFF3F6', head('#1F2340', '#0F1226', 18, 17) + '<path d="M18 38c0-8 6-12 14-6 8-6 14-2 14 6 0 8-6 13-14 13s-14-5-14-13Z" fill="#fff"/>'
                  + eyes(36) + '<path d="M28 42h8l-4 5Z" fill="#FBBF24"/>'),
    'dragon': av('#DDF5EF', '<path d="M20 24l-2-12 8 8Z" fill="#FBBF24"/><path d="M44 24l2-12-8 8Z" fill="#FBBF24"/>'
                 '<path d="M28 20l4-6 4 6Z" fill="#0E8C7E"/>' + head('#14B8A6', '#0E8C7E')
                 + '<ellipse cx="32" cy="44" rx="10" ry="7" fill="#7FE0D2"/>' + eyes(34)
                 + '<circle cx="29" cy="43" r="1.3" fill="#0E8C7E"/><circle cx="35" cy="43" r="1.3" fill="#0E8C7E"/>'),
}

# =====================================================================
# BADGES (viewBox 48x48) — รูปทรงต่างกันทุกระดับ (ไม่ใช้สีอย่างเดียวแยกประเภท)
# สีระดับ CEFR มาจาก CSS: --lv / --lv-d บนองค์ประกอบที่ใช้
# =====================================================================
def lv(shape):
    return (f'<g transform="translate(0 3)" style="fill:var(--lv-d,#3730A3)">{shape}</g>'
            f'<g style="fill:var(--lv,#4F46E5)">{shape}</g>')


BADGES = {
    # A1 Foundation — สี่เหลี่ยมมุมมน (ฐานราก)
    'lv-a1': lv('<rect x="5" y="4" width="38" height="38" rx="10"/>'),
    # A2 Explorer — วงกลมมีขีดเข็มทิศ
    'lv-a2': lv('<circle cx="24" cy="23" r="20"/>') + ''.join(
        f'<rect x="23" y="4.5" width="2" height="4" rx="1" transform="rotate({a} 24 23)" fill="#fff" opacity=".55"/>' for a in range(0, 360, 45)),
    # B1 Builder — หกเหลี่ยม (บล็อกก่อสร้าง)
    'lv-b1': lv('<path d="M24 3l18.5 10.5v20L24 44 5.5 33.5v-20Z" stroke-linejoin="round"/>'),
    # B2 Communicator — บับเบิลคำพูด
    'lv-b2': lv('<path d="M8 4h32a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H22l-9 8v-8H8a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z"/>'),
    # C1 Advanced — ดาว 8 แฉก
    'lv-c1': lv('<path d="M24 2l5.6 7.5 9.3-1.4-1.4 9.3L45 23l-7.5 5.6 1.4 9.3-9.3-1.4L24 44l-5.6-7.5-9.3 1.4 1.4-9.3L3 23l7.5-5.6-1.4-9.3 9.3 1.4Z"/>'),
}


def ribbon(c1, c2):
    return f'<path d="M15 30L9 46l7-3 4 6 5-15Z" fill="{c2}"/><path d="M33 30l6 16-7-3-4 6-5-15Z" fill="{c2}"/>'


TIERS = {
    # Bronze — เหรียญกลม
    'tier-bronze': ('#C07A45', '#8F4F27', ribbon('#C07A45', '#8F4F27') + '<circle cx="24" cy="23.5" r="16" fill="#8F4F27"/><circle cx="24" cy="21" r="16" fill="#C07A45"/><circle cx="24" cy="21" r="11" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>'),
    # Silver — เหรียญหกเหลี่ยม
    'tier-silver': ('#A3ABBE', '#6E778C', ribbon('#A3ABBE', '#6E778C') + '<path d="M24 5.5l15 8.5v17L24 39.5 9 31V14Z" fill="#6E778C" transform="translate(0 2.5)"/><path d="M24 5.5l15 8.5v17L24 39.5 9 31V14Z" fill="#A3ABBE"/><path d="M24 11l10 5.8v11.5L24 34l-10-5.7V16.8Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>'),
    # Gold — โล่
    'tier-gold': ('#E8A317', '#B07A0A', ribbon('#E8A317', '#B07A0A') + '<path d="M24 4l16 6v12c0 9-7 15-16 19-9-4-16-10-16-19V10Z" fill="#B07A0A" transform="translate(0 2.5)"/><path d="M24 4l16 6v12c0 9-7 15-16 19-9-4-16-10-16-19V10Z" fill="#E8A317"/><path d="M24 10l10 4v8c0 6-4 10-10 13-6-3-10-7-10-13v-8Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>'),
    # Platinum — อัญมณีเหลี่ยมเพชร
    'tier-platinum': ('#7C8BEA', '#4C58B5', ribbon('#7C8BEA', '#4C58B5') + '<path d="M13 6h22l8 11-19 23L5 17Z" fill="#4C58B5" transform="translate(0 2.5)"/><path d="M13 6h22l8 11-19 23L5 17Z" fill="#7C8BEA"/><path d="M5 17h38M17 6l7 34 7-34M13 6l4 11M35 6l-4 11" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round"/>'),
}


def main():
    write('illustrations/illustrations.svg',
          [symbol(i, '0 0 320 240', fn(), t) for i, fn, t in ILLUSTRATIONS], 'EnglishQuest illustrations')
    write('mascot/mascot.svg',
          [symbol(f'fox-{s}', '0 0 160 160', mascot(s), f'Fox mascot — {t}') for s, t in MASCOT_STATES], 'EnglishQuest fox mascot')
    write('avatars/avatars.svg',
          [symbol(f'av-{k}', '0 0 64 64', v, k) for k, v in AVATARS.items()], 'EnglishQuest avatars')
    write('badges/badges.svg',
          [symbol(k, '0 0 48 48', v, k) for k, v in BADGES.items()]
          + [symbol(k, '0 0 48 50', v[2], k) for k, v in TIERS.items()], 'EnglishQuest level emblems + tier badges')
    dots = ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
            '<circle cx="2" cy="2" r="1.2" fill="#4F46E5" fill-opacity=".14"/></svg>\n')
    os.makedirs(os.path.join(ROOT, 'backgrounds'), exist_ok=True)
    with open(os.path.join(ROOT, 'backgrounds', 'dots.svg'), 'w') as f:
        f.write(dots)
    print('backgrounds/dots.svg')


def build_ranked():
    """ตรา 9 League + ภาพ NPC / Guardian — สี/รายชื่ออ่านจาก config (แหล่งเดียวกับเซิร์ฟเวอร์)"""
    import json, subprocess, sys
    sys.path.insert(0, os.path.dirname(__file__))
    import graphics_ranked as gr
    root = os.path.join(os.path.dirname(__file__), '..')
    data = json.loads(subprocess.check_output(['node', '-e',
        "const l=require('./config/leagues');const n=require('./config/rankedNpcs');"
        "console.log(JSON.stringify({leagues:l.LEAGUES,npcs:n.NPCS,guardians:n.GUARDIANS}))"], cwd=root))
    by_id = {l['id']: l for l in data['leagues']}
    # ตรา League ใช้ภาพที่ออกแบบแล้ว (public/assets/ranks/<league>/badge-{96,192,384}.webp) — ไม่สร้างจากสคริปต์นี้
    chars = []
    for n in data['npcs']:
        lg = by_id[n['league']]
        chars.append(symbol(f"npc-{n['id']}", '0 0 96 96', gr.portrait(n['animal'], lg['colors']['secondary'] if lg['order'] != 3 else '#E2FBFC'), n['name']))
    write('npcs/npcs.svg', chars, 'Ranked Quest — Training / League NPC portraits')
    guards = []
    for g in data['guardians']:
        lg = by_id[g['league']]
        bg = lg['colors']['secondary'] if lg['order'] not in (3, 6, 9) else {3: '#E2FBFC', 6: '#E7E3FF', 9: '#2A3157'}[lg['order']]
        guards.append(symbol(f"guardian-{g['id']}", '0 0 96 96', gr.portrait(g['animal'], bg, lg['colors']['primary'] if lg['order'] != 9 else '#A781FF', True), g['name']))
    write('guardians/guardians.svg', guards, 'Ranked Quest — Promotion Guardians')


if __name__ == '__main__':
    main()
    build_ranked()
