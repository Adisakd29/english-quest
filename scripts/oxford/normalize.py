"""
ขั้นที่ 2 ของ pipeline: แปลงบรรทัดดิบเป็น Headword + Lexical Sense

  python3 scripts/oxford/normalize.py [source_entries.json] [senses.json]

กติกา (ห้ามเดา):
  - headword / ชนิดคำ / CEFR / คำใบ้ความหมาย มาจากเอกสารเท่านั้น
  - 1 บรรทัดในเอกสารอาจกลายเป็นหลาย sense (หนึ่ง sense ต่อชนิดคำ)
      เช่น "acid n. B2, adj. C1" -> noun B2 + adjective C1
  - อะไรที่ตีความไม่ชัด -> needsReview = true พร้อมเหตุผล (ไม่เดาแทน)

ID คำนวณจากข้อมูลต้นฉบับ (deterministic) -> import ซ้ำได้ผลเหมือนเดิมทุกครั้ง
  entryId = headword ตามตัวพิมพ์จริง (+ #เลขคำพ้องรูป) เช่น "March", "march", "close#1"
  senseId = entryId | ชนิดคำ | คำใบ้  เช่น "bank|noun|money"
"""
import json
import re
import sys
import collections

POS_MAP = {
    'n.': 'noun', 'v.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb',
    'pron.': 'pronoun', 'prep.': 'preposition', 'conj.': 'conjunction',
    'det.': 'determiner', 'exclam.': 'exclamation', 'number': 'number',
    'modal v.': 'modal verb', 'auxiliary v.': 'auxiliary verb',
    'indefinite article': 'indefinite article', 'definite article': 'definite article',
    'infinitive marker': 'infinitive marker',
}
POS_KEYS = sorted(POS_MAP, key=len, reverse=True)   # จับ "modal v." ก่อน "v."
LEVEL_RE = re.compile(r'^(A1|A2|B1|B2|C1)$')


def parse_pos(text):
    """ข้อความชนิดคำ (มีจุลภาค/ทับ) -> (รายการชนิดคำมาตรฐาน, ส่วนที่ตีความไม่ได้)"""
    t = re.sub(r'\s+', ' ', text.replace('/', ' / ').replace(',', ' , ')).strip()
    out, rest, i = [], [], 0
    while i < len(t):
        if t[i] in ' ,/':
            i += 1
            continue
        for k in POS_KEYS:
            if t.startswith(k, i) and (i + len(k) == len(t) or t[i + len(k)] in ' ,/'):
                out.append(POS_MAP[k])
                i += len(k)
                break
        else:
            j = i
            while j < len(t) and t[j] not in ' ,/':
                j += 1
            rest.append(t[i:j])
            i = j
    return out, rest


def slug(text):
    return re.sub(r'\s+', '_', text.strip()) if text else ''


def normalize_line(entry):
    list_name = entry['sourceList']
    headword_raw, hint_texts = '', []
    segments, pending, nonitalic = [], [], False

    for rl, text in entry['tokens']:
        if rl == 'word':
            headword_raw = text
        elif rl == 'pos':
            pending.append(text)
        elif rl == 'hint':
            hint_texts.append(text)
            for piece in re.findall(r'\([^)]*\)|[^\s(]+', text):
                bare = piece.strip(',')
                if piece.startswith('('):
                    continue
                if LEVEL_RE.match(bare):
                    segments.append((' '.join(pending), bare))
                    pending = []
                elif piece in (',', '/'):
                    pending.append(piece)
                elif parse_pos(piece)[0]:
                    pending.append(piece)
                    nonitalic = True
    if pending:
        segments.append((' '.join(pending), None))

    # เลขยกกำลังคำพ้องรูป (close1 / close2) — ไม่มีคำใน Oxford list ที่ลงท้ายด้วยตัวเลขจริง
    homograph = None
    m = re.match(r'^(.*?)(\d+)$', headword_raw)
    headword = m.group(1) if m else headword_raw
    if m:
        homograph = int(m.group(2))

    labels = re.findall(r'\(([^)]*)\)', ' '.join(hint_texts))
    sense_label = '; '.join(x.strip() for x in labels) or None

    base = []
    if not headword:
        base.append('ไม่พบตัวคำ')
    if nonitalic:
        base.append('ต้นฉบับพิมพ์ชนิดคำด้วยฟอนต์ตัวตรง (จัดหน้าไม่สม่ำเสมอ)')

    entry_id = headword + (f'#{homograph}' if homograph else '')
    source_ref = f"{list_name}:p{entry['page']}:{entry['lineOnPage']}"
    senses = []
    for pos_text, lvl in (segments or [('', None)]):
        pos_list, leftover = parse_pos(pos_text)
        reasons = list(base)
        fixed = [lo for lo in leftover if lo + '.' in POS_MAP]
        for lo in fixed:
            pos_list.append(POS_MAP[lo + '.'])
        leftover = [lo for lo in leftover if lo not in fixed]
        if fixed:
            reasons.append(f'ต้นฉบับพิมพ์ตัวย่อขาดจุด: {fixed} — ตีความตามตัวอักษร')
        if leftover:
            reasons.append(f'ชนิดคำตีความไม่ได้: {leftover}')

        if list_name == 'OXFORD_3000':
            cefr = entry['headingLevel']
        else:
            cefr = lvl
            if cefr == 'B1':
                reasons.append('ต้นฉบับระบุ B1 ในรายการ 5000 เพิ่มเติม (ปกติ B2-C1) — คงตามต้นฉบับ')
        if cefr is None:
            reasons.append('ไม่พบ CEFR')
        if not pos_list:
            reasons.append('ต้นฉบับไม่ระบุชนิดคำ — ไม่เดา')
            pos_list = [None]

        for p in pos_list:
            # ลำดับคงที่จากตำแหน่งในเอกสาร (รายการ/หน้า/บรรทัด/ลำดับชนิดคำ)
            # ไม่ใช้ลำดับในอาร์เรย์ เพราะถ้ามีรายการหายไป ลำดับของทุกคำหลังจากนั้นจะเลื่อน
            source_order = ((0 if list_name == 'OXFORD_3000' else 1) * 10_000_000
                            + entry['page'] * 10_000 + entry['lineOnPage'] * 10 + len(senses))
            senses.append({
                'sourceOrder': source_order,
                'senseId': f"{slug(entry_id)}|{p or 'unknown'}|{slug(sense_label) or '-'}",
                'entryId': slug(entry_id),
                'headword': headword,
                'homograph': homograph,
                'senseLabel': sense_label,
                'pos': p,
                'cefr': cefr,
                'source': 'OXFORD',
                'sourceList': list_name,
                'sourceCEFR': cefr,
                'sourceRawEntry': entry['raw'],
                'sourceRef': source_ref,
                'needsReview': bool(reasons),
                'reviewReasons': reasons,
            })
    return senses


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data/oxford/source_entries.json'
    out = sys.argv[2] if len(sys.argv) > 2 else 'data/oxford/senses.json'
    d = json.load(open(src, encoding='utf-8'))
    senses = []
    for e in d['oxford3000'] + d['oxford5000']:
        senses.extend(normalize_line(e))

    # senseId ต้องไม่ซ้ำ — ถ้าซ้ำแปลว่าต้นฉบับมีรายการเดียวกันสองครั้ง (รายงาน ไม่ลบเอง)
    dup = [k for k, v in collections.Counter(s['senseId'] for s in senses).items() if v > 1]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(senses, f, ensure_ascii=False, indent=1)
    print(f'Lexical senses: {len(senses)} | headwords: {len(set(s["entryId"] for s in senses))}')
    print(f'needsReview: {sum(s["needsReview"] for s in senses)} | senseId ซ้ำ: {dup}')
    print(f'บันทึก: {out}')


if __name__ == '__main__':
    main()
