"""
สร้าง public/css/theme-dark.css (โหมดมืด)
  python3 scripts/build-dark-theme.py

ใช้ได้ 2 ทาง (ประกาศ tokens ครั้งเดียว แล้วสร้างให้ทั้งสองแบบ):
  - ตามระบบ:   @media (prefers-color-scheme: dark) + :root ที่ไม่ได้ตั้ง data-theme="light"
  - เลือกเอง:  :root[data-theme="dark"]
ส่วนที่แปลงอัตโนมัติ: เส้นขอบ/พื้น "เข้มโปร่งแสง" rgba(31,35,64,a) ใน theme-auto.css / theme.css -> "ขาวโปร่งแสง"
คู่สีทั้งหมดตรวจ contrast แล้ว (WCAG AA)
"""
import re

TOKENS = """
  --color-bg: #12141F; --color-surface: #1C1F2E; --color-surface-2: #252A3D; --color-border: #33395A;
  --color-text: #E9EBF5; --color-text-muted: #A8AECB;
  --color-primary: #A5A1FF; --color-primary-dark: #C4C1FF; --color-primary-soft: #2A2B55;
  --color-secondary: #5EEAD4; --color-success: #6EE7A0; --color-success-soft: #12321F;
  --color-warning: #FCD34D; --color-warning-soft: #3A2A0E; --color-danger: #FCA5A5; --color-danger-soft: #3D1717;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4); --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.45);
  --focus-ring: 0 0 0 3px #12141F, 0 0 0 6px #A5A1FF;
  --white: #F4F5FB; --parchment-dim: #C9CDE3;
  color-scheme: dark;
"""

# ตัวอักษรเข้มบนพื้นอ่อน (ธีมสว่าง) -> ตัวอักษรอ่อนบนพื้นเข้ม — ระบุ selector ที่รู้แน่ (ไม่เดาทั้งไฟล์)
OVERRIDES = """
body { background: var(--color-bg); color: var(--color-text); }
#hud, #bottom-nav { background: rgba(28, 31, 46, 0.94); }
/* ปุ่ม/ป้ายที่ใช้สีหลักเป็นพื้น: ตัวอักษรเข้ม (สีหลักในโหมดมืดเป็นม่วงอ่อน) */
.btn-primary, .srs-good, .path-mode-btn.active, .gp-level, .vb-filter-count, .path-here, .mode-card-rec,
.vb-chip.active, .mini-btn.accept { color: #12141F; }
.btn-primary:hover { background: var(--color-primary-dark); }
/* ข้อความบนพื้นอ่อน */
.quiz-choice.correct, .admin-tag.ok, .srs-easy, .gq-feedback.ok, .online-badge, .relation-tag.tag-ready { color: #86EFAC; }
.quiz-choice.wrong, .srs-again, .gq-feedback.bad { color: #FECACA; }
.srs-hard, .vb-pending, .admin-tag.warn, .vc-note, .grammar-chapter-badge, .level-chip.active, .verify-banner,
.relation-tag.tag-off, .pl-work h3 { color: #FDE68A; }
.admin-row-flag, .path-boss.available b { color: #FDBA74; }
.gq-feedback p, .gq-feedback .gq-explain { color: var(--color-text); }
/* พื้นอ่อนที่เขียนเป็นค่าตายตัวในธีมสว่าง */
.path-unit.completed, .gp-ch.passed { background: #14251B; border-color: #1F4D32; }
.path-boss.available { background: linear-gradient(135deg, #2B1D12, #2D1424); }
.pl-recommend, .gp-next { border-color: #3F3F7A; }
.online-badge { border-color: #1F4D32; }
.skeleton { background: linear-gradient(90deg, var(--color-surface-2) 25%, #30364C 50%, var(--color-surface-2) 75%); background-size: 200% 100%; }
.toast { background: #E9EBF5; color: #12141F; }
.sys-bar { background: #E9EBF5; color: #12141F; }
.sys-bar .mini-btn.ghost { color: #12141F; border-color: rgba(18, 20, 31, 0.3); }
.sys-bar-offline { background: #FDE68A; color: #3A2A0E; }
.ui-overlay { background: rgba(0, 0, 0, 0.65); }
.form-group input, .vb-search, .gq-type-row input, .report-form textarea, select { color-scheme: dark; }
"""

DARK_ALPHA = re.compile(r'rgba\(\s*31\s*,\s*35\s*,\s*64\s*,\s*([0-9.]+)\s*\)')
PROPS = ('border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-color',
         'background', 'background-color', 'outline')


def iter_rules(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j == -1:
            break
        head = css[i:j].strip()
        if head.startswith('@'):
            depth, k = 1, j + 1
            while k < n and depth:
                depth += {'{': 1, '}': -1}.get(css[k], 0)
                k += 1
            if head.startswith('@media') and 'prefers-reduced-motion' not in head:
                for sel, body in iter_rules(css[j + 1:k - 1]):
                    yield sel, body
            i = k
            continue
        k = css.find('}', j)
        yield head, css[j + 1:k]
        i = k + 1


def converted_rules():
    out = []
    for f in ('public/css/theme-auto.css', 'public/css/theme.css'):
        for sel, body in iter_rules(open(f, encoding='utf-8').read()):
            decls = []
            for d in body.split(';'):
                if ':' not in d:
                    continue
                prop, val = (x.strip() for x in d.split(':', 1))
                if prop in PROPS and DARK_ALPHA.search(val):
                    decls.append(f'{prop}: ' + DARK_ALPHA.sub(lambda m: f'rgba(255, 255, 255, {min(0.16, float(m.group(1)))})', val))
            if decls:
                out.append((sel, '; '.join(decls)))
    return out


def scoped(rules_css, prefix):
    """นำหน้าทุก selector ด้วย prefix (เช่น :root[data-theme="dark"])"""
    res = []
    for sel, body in iter_rules(rules_css):
        sels = ', '.join(f'{prefix} {s.strip()}' if s.strip() not in ('body', ':root') else f'{prefix} {s.strip()}'.replace(f'{prefix} body', f'{prefix} body')
                         for s in sel.split(','))
        res.append(f'{sels} {{ {body.strip()} }}')
    return '\n'.join(res)


def main():
    auto = '\n'.join(f'{s} {{ {b}; }}' for s, b in converted_rules())
    body_rules = OVERRIDES + '\n' + auto
    manual = ':root[data-theme="dark"]'
    system = ':root:not([data-theme])'
    parts = [
        '/* สร้างอัตโนมัติโดย scripts/build-dark-theme.py — ห้ามแก้ด้วยมือ */',
        f'{manual} {{{TOKENS}}}',
        scoped(body_rules, manual),
        '@media (prefers-color-scheme: dark) {',
        f'{system} {{{TOKENS}}}',
        scoped(body_rules, system),
        '}',
    ]
    css = '\n'.join(parts) + '\n'
    open('public/css/theme-dark.css', 'w', encoding='utf-8').write(css)
    print(f'สร้าง public/css/theme-dark.css: {len(css)} bytes, แปลงอัตโนมัติ {auto.count("{")} กฎ')


if __name__ == '__main__':
    main()
