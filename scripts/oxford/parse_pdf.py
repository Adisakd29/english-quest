"""
ขั้นที่ 1 ของ pipeline: อ่านรายการคำจาก Oxford 3000 / Oxford 5000 PDF

  python3 scripts/oxford/parse_pdf.py <oxford3000.pdf> <oxford5000.pdf> [out.json]

ผลลัพธ์ data/oxford/source_entries.json = "บรรทัดในเอกสาร" แบบดิบ (ยังไม่ตีความ)
พร้อม token ที่ติดบทบาทฟอนต์ และเลขหน้า — ใช้ตรวจย้อนกลับกับต้นฉบับได้

วิธีแยกข้อมูล: ใช้ "บทบาทของฟอนต์" ไม่เดาจากข้อความ
  MyriadPro-Regular  = ตัวคำ (headword)
  MyriadPro-LightIt  = ชนิดคำ (n., v., adj., modal v. ...)
  MyriadPro-Light    = คำใบ้ความหมาย "(money)" / จุลภาค / รหัสระดับท้ายรายการ (ไฟล์ 5000)
  Utopia* >= 14pt    = หัวข้อระดับ A1/A2/B1/B2 (ไฟล์ 3000)

ปัญหาที่รองรับ (พบระหว่างพัฒนา):
  - คอลัมน์กว้างไม่เท่ากัน      -> ไม่แบ่งคอลัมน์ตามความกว้างหน้า แต่ cluster จากจุดเริ่มรายการ
  - รายการยาวขึ้นบรรทัดใหม่    -> ส่วนที่ไม่มีตัวคำ = บรรทัดต่อ ต่อท้ายรายการก่อนหน้าในคอลัมน์เดียวกัน
  - ตัวอักษรแตกจาก kerning     -> "s eminar" -> "seminar"

หมายเหตุลิขสิทธิ์: ไฟล์ PDF เป็นของ Oxford University Press ไม่ commit เข้า repo
ดาวน์โหลดได้จาก oxfordlearnersdictionaries.com (The Oxford 3000/5000 word lists)
"""
import json
import sys
import pdfplumber

LEVELS = {'A1', 'A2', 'B1', 'B2', 'C1'}
COLUMN_GAP = 18   # ช่องว่างแนวนอน (pt) ที่ถือว่าข้ามคอลัมน์
KERN_GAP = 1.5    # ห่างน้อยกว่านี้ = ตัวอักษรของคำเดียวกันที่แตกออก
COLUMN_CLUSTER = 40


def role(w):
    f = w['fontname'].split('+')[-1]
    if f.startswith('Utopia') and w['size'] >= 14:
        return 'heading'
    if w['size'] < 8.9 or w['size'] > 9.5:
        return 'other'
    return {'MyriadPro-Regular': 'word', 'MyriadPro-LightIt': 'pos',
            'MyriadPro-Light': 'hint'}.get(f, 'other')


def join_words(ws):
    out, prev = '', None
    for w in ws:
        if prev is not None and w['x0'] - prev['x1'] >= KERN_GAP:
            out += ' '
        out += w['text']
        prev = w
    return out.strip()


def parse(path, list_name):
    entries, level = [], None
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(extra_attrs=['fontname', 'size'])
            items = [w for w in words if role(w) in ('heading', 'word', 'pos', 'hint')]
            items.sort(key=lambda w: (round(w['top']), w['x0']))

            rows = []
            for w in items:
                if rows and abs(rows[-1]['top'] - w['top']) <= 3:
                    rows[-1]['ws'].append(w)
                else:
                    rows.append({'top': w['top'], 'ws': [w]})

            groups = []
            for r in rows:
                cur = None
                for w in sorted(r['ws'], key=lambda w: w['x0']):
                    rl = role(w)
                    new = (cur is None or rl == 'heading' or cur['heading']
                           or w['x0'] - cur['x1'] > COLUMN_GAP
                           or (rl == 'word' and cur['last'] in ('pos', 'hint')))
                    if new:
                        cur = {'x0': w['x0'], 'x1': w['x1'], 'top': w['top'], 'ws': [],
                               'last': None, 'heading': rl == 'heading', 'continued': False}
                        groups.append(cur)
                    cur['ws'].append(w)
                    cur['x1'] = w['x1']
                    cur['last'] = rl

            starts = sorted(set(round(g['x0']) for g in groups
                                if g['heading'] or role(g['ws'][0]) == 'word'))
            cols = []
            for x in starts:
                if cols and x - cols[-1][-1] < COLUMN_CLUSTER:
                    cols[-1].append(x)
                else:
                    cols.append([x])
            col_left = [c[0] for c in cols]

            for g in groups:
                cand = [i for i, x in enumerate(col_left) if x <= round(g['x0']) + 2]
                g['col'] = cand[-1] if cand else 0
            groups.sort(key=lambda g: (g['col'], g['top']))

            merged = []
            for g in groups:
                is_cont = not g['heading'] and role(g['ws'][0]) != 'word'
                if is_cont and merged and merged[-1]['col'] == g['col'] and not merged[-1]['heading']:
                    merged[-1]['ws'].extend(g['ws'])
                    merged[-1]['continued'] = True
                else:
                    merged.append(g)

            line_no = 0
            for g in merged:
                if g['heading']:
                    t = join_words(g['ws'])
                    if t in LEVELS:
                        level = t
                    continue
                ws = g['ws']
                word_ws = [w for w in ws if role(w) == 'word']
                rest = [w for w in ws if role(w) != 'word']
                line_no += 1
                entries.append({
                    'sourceList': list_name,
                    'headingLevel': level,
                    'page': pno,
                    'lineOnPage': line_no,
                    'raw': (join_words(word_ws) + ' ' + ' '.join(w['text'] for w in rest)).strip(),
                    'tokens': [['word', join_words(word_ws)]] + [[role(w), w['text']] for w in rest],
                    'wrapped': g['continued'],
                    'orphan': role(ws[0]) != 'word',
                })
    return entries


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    out = sys.argv[3] if len(sys.argv) > 3 else 'data/oxford/source_entries.json'
    e3 = parse(sys.argv[1], 'OXFORD_3000')
    e5 = parse(sys.argv[2], 'OXFORD_5000_ADDITIONAL')
    orphans = [e['raw'] for e in e3 + e5 if e['orphan']]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'oxford3000': e3, 'oxford5000': e5}, f, ensure_ascii=False, indent=1)
    print(f'Oxford 3000: {len(e3)} บรรทัด | Oxford 5000 additional: {len(e5)} บรรทัด')
    print(f'รายการที่ขึ้นบรรทัดใหม่ (ต่อสำเร็จ): {sum(e["wrapped"] for e in e3 + e5)}')
    if orphans:
        print(f'⚠️  บรรทัดต่อที่หาเจ้าของไม่ได้: {orphans}')
        sys.exit(2)
    print(f'บันทึก: {out}')


if __name__ == '__main__':
    main()
