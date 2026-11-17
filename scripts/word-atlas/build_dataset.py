#!/usr/bin/env python3
"""
Word Atlas — สร้างชุดข้อมูลคลังคำ (ขั้น Normalize → Validate → Deduplicate → Merge กับ Oxford → Verify → Assign Metadata)

แหล่งข้อมูล (ตรวจสิทธิ์แล้ว — ดู docs/WORD_ATLAS_DATA.md และ THIRD_PARTY_NOTICES.md):
  * Wiktionary (ภาษาอังกฤษ) ผ่าน wiktextract / kaikki.org — CC BY-SA 4.0 (และ GFDL)
      ความหมายภาษาอังกฤษ · ตัวอย่างการใช้ (เฉพาะ usage example ไม่เอา quotation) · IPA · ไฟล์เสียง · synonym/antonym
      คำแปลไทยจากตารางคำแปล (translation tables) ของ Wiktionary
  * Wiktionary — รายการคำภาษาไทย (kaikki Thai) — CC BY-SA 4.0: ใช้ย้อนทาง "คำไทย → ความหมายอังกฤษ" เพื่อเติมคำแปลไทย
      (รับเฉพาะกรณีความหมายอังกฤษตรงกับ lemma ทั้งคำ — ความแม่นยำสูง)
  * wordfreq 3.x (Robyn Speer) — ความถี่คำ: โค้ด Apache-2.0 · ข้อมูล CC BY-SA 4.0
  * Oxford 3000/5000 + C2 bank ที่มีในโปรเจกต์อยู่แล้ว (vocab_senses) — "อ้างอิง" ด้วย public_id ไม่คัดลอกเนื้อหา

ไม่มีการเรียก AI · ไม่เดาระดับ CEFR (CEFR มาจาก Oxford เท่านั้น ที่เหลือ = Unclassified)

ใช้:
  python3 scripts/word-atlas/build_dataset.py --en en.jsonl --th th.jsonl --oxford oxford.jsonl \
      --out data/word-atlas/atlas-2026-11.jsonl.gz --lemmas 20000
  (en.jsonl = ผลจาก scripts/word-atlas/filter_kaikki.py · oxford.jsonl = export vocab_senses — ดู README ในโฟลเดอร์นี้)
"""
import argparse, gzip, hashlib, json, re, sys, unicodedata
from collections import defaultdict, Counter

import wordfreq
try:
    from pythainlp.corpus import tnc as _tnc   # ใช้จัดอันดับคำแปลไทย (คำที่ใช้บ่อยก่อน) ตอนสร้างชุดข้อมูลเท่านั้น ไม่แจกจ่ายข้อมูลความถี่
    TH_FREQ = dict(_tnc.word_freqs())
except Exception:
    TH_FREQ = {}

DATASET = 'atlas-2026-11'
WIKT = 'WIKTIONARY'
WIKT_LICENSE = 'CC BY-SA 4.0'
OXF_LICENSE = 'EnglishQuest (Oxford list reference)'

POS_MAP = {'noun': 'noun', 'verb': 'verb', 'adj': 'adjective', 'adv': 'adverb', 'prep': 'preposition', 'conj': 'conjunction',
           'pron': 'pronoun', 'det': 'determiner', 'intj': 'exclamation', 'num': 'number', 'article': 'determiner',
           'phrase': 'phrase', 'prep_phrase': 'phrase', 'adv_phrase': 'phrase', 'proverb': 'phrase', 'particle': 'particle',
           'contraction': 'contraction'}
LEARN_POS = {'noun', 'verb', 'adjective', 'adverb', 'phrase', 'phrasal verb', 'idiom', 'preposition', 'conjunction', 'exclamation'}
# ป้ายการใช้ (Wiktionary tags) → labels ของ Word Atlas
LABEL_TAGS = {'formal': 'formal', 'informal': 'informal', 'colloquial': 'informal', 'slang': 'slang', 'archaic': 'archaic',
              'obsolete': 'archaic', 'dated': 'dated', 'rare': 'rare', 'literary': 'literary', 'poetic': 'literary',
              'technical': 'technical', 'jargon': 'technical', 'humorous': 'humorous', 'idiomatic': 'idiom',
              'British': 'UK', 'UK': 'UK', 'US': 'US', 'Australia': 'AU', 'euphemistic': 'euphemism'}
SENSITIVE = {'vulgar', 'offensive', 'derogatory', 'slur', 'ethnic', 'pejorative', 'sexual', 'excretory', 'profanity'}
SKIP_SENSE = {'obsolete', 'archaic', 'nonstandard', 'misspelling', 'abbreviation', 'initialism', 'acronym', 'alt-of', 'form-of',
              'proscribed', 'rare'}
# หัวข้อ: topic/หมวดของ Wiktionary + topic ของ Oxford → หมวดของ Word Atlas (คำหนึ่งอยู่หลายหมวดได้)
TOPIC_MAP = {
    'computing': 'technology', 'computer': 'computer', 'computer-sciences': 'computer', 'computer-hardware': 'computer',
    'software': 'computer', 'internet': 'technology', 'programming': 'programming', 'software-engineering': 'programming',
    'telecommunications': 'technology', 'technology': 'technology', 'electronics': 'electronics', 'electricity': 'electronics',
    'electrical-engineering': 'electronics', 'engineering': 'engineering', 'mechanical-engineering': 'engineering',
    'civil-engineering': 'engineering', 'construction': 'engineering', 'mechanics': 'engineering',
    'medicine': 'health', 'health': 'health', 'anatomy': 'health', 'pathology': 'health', 'pharmacology': 'health',
    'dentistry': 'health', 'nursing': 'health', 'surgery': 'health', 'physiology': 'health', 'diseases': 'health',
    'law': 'law', 'legal': 'law', 'criminal-law': 'law', 'business': 'business', 'commerce': 'business',
    'marketing': 'business', 'management': 'business', 'trading': 'business', 'finance': 'finance', 'economics': 'finance',
    'banking': 'finance', 'accounting': 'finance', 'money': 'finance', 'sports': 'sports', 'football': 'sports',
    'soccer': 'sports', 'basketball': 'sports', 'tennis': 'sports', 'golf': 'sports', 'cricket': 'sports', 'baseball': 'sports',
    'athletics': 'sports', 'martial-arts': 'sports', 'games': 'sports', 'biology': 'science', 'chemistry': 'science',
    'physics': 'science', 'mathematics': 'science', 'math': 'science', 'astronomy': 'science', 'geology': 'science',
    'sciences': 'science', 'statistics': 'science', 'genetics': 'science', 'education': 'education', 'school': 'education',
    'food': 'food', 'cooking': 'food', 'culinary': 'food', 'beverages': 'food', 'drinks': 'food', 'baking': 'food',
    'family': 'family', 'kinship': 'family', 'travel': 'travel', 'transport': 'travel', 'aviation': 'travel',
    'nautical': 'travel', 'tourism': 'travel', 'railways': 'travel', 'automotive': 'travel', 'vehicles': 'travel',
    'environment': 'environment', 'ecology': 'environment', 'weather': 'environment', 'meteorology': 'environment',
    'climatology': 'environment', 'botany': 'nature', 'zoology': 'nature', 'nature': 'nature', 'animals': 'nature',
    'plants': 'nature', 'ornithology': 'nature', 'psychology': 'psychology', 'psychiatry': 'psychology',
    'arts': 'arts', 'art': 'arts', 'music': 'arts', 'painting': 'arts', 'theater': 'arts', 'film': 'arts', 'dance': 'arts',
    'photography': 'arts', 'architecture': 'arts', 'literature': 'literature', 'poetry': 'literature', 'rhetoric': 'literature',
    'grammar': 'academic', 'linguistics': 'academic', 'philosophy': 'academic', 'logic': 'academic', 'sociology': 'society',
    'politics': 'society', 'government': 'society', 'military': 'society', 'religion': 'society', 'history': 'society',
    'clothing': 'daily-life', 'household': 'daily-life', 'furniture': 'daily-life', 'cosmetics': 'daily-life',
}
OXF_TOPIC = {'food': 'food', 'business': 'business', 'nature': 'nature', 'work': 'professional', 'people': 'society',
             'places': 'travel', 'time': 'daily-life', 'feelings': 'psychology', 'thinking': 'academic',
             'current-affairs': 'society', 'argumentation': 'academic', 'health': 'health', 'education': 'education',
             'technology': 'technology', 'science': 'science', 'travel': 'travel', 'family': 'family', 'home': 'daily-life',
             'money': 'finance', 'law': 'law', 'arts': 'arts', 'sport': 'sports', 'environment': 'environment'}
CAT_TOPIC = [(re.compile(p, re.I), t) for p, t in [
    (r'\bfoods?\b|\bdishes\b|\bbeverages\b|\bfruits?\b|\bvegetables\b|\bspices\b|\bmeals\b|\bdesserts\b', 'food'),
    (r'family members|\bkinship\b|\bfamily\b', 'family'), (r'\bclothing\b|\bfurniture\b|\bhousehold\b|\bkitchenware\b', 'daily-life'),
    (r'\bvehicles?\b|\bcountries\b|\bcities\b|\bplaces\b|\btransport', 'travel'), (r'\bdiseases?\b|\bmedicine\b|\banatomy\b|\bbody\b', 'health'),
    (r'\bcomputing\b|\bsoftware\b|\binternet\b', 'computer'), (r'\bsports?\b|\bball games\b', 'sports'),
    (r'\bmammals\b|\bbirds\b|\bfish\b|\binsects\b|\btrees\b|\bflowers\b|\bplants\b|\blifeforms\b|\banimals\b', 'nature'),
    (r'\bmusic\b|\bmusical instruments\b|\barts?\b', 'arts'), (r'\bweather\b|\bclimate\b', 'environment'),
    (r'\bchemistry\b|\bphysics\b|\bbiology\b|\bmathematics\b|\bastronomy\b', 'science'), (r'\blaw\b', 'law'),
    (r'\bemotions?\b|\bpsychology\b', 'psychology'), (r'\beducation\b|\bschool\b', 'education'),
    (r'\beconomics\b|\bfinance\b|\bcurrenc', 'finance'), (r'\bbusiness\b|\bjobs?\b|\boccupations\b', 'business'),
]]
PARTICLES = {'up', 'down', 'out', 'off', 'on', 'in', 'into', 'over', 'away', 'back', 'through', 'around', 'about', 'along',
             'across', 'by', 'forward', 'apart', 'aside', 'after', 'for', 'with', 'together'}

TH_RE = re.compile(r'[฀-๿]')
LATIN_RE = re.compile(r'[A-Za-z]')
WORD_RE = re.compile(r"^[a-z][a-z'\- ]*[a-z]$|^[a-z]$")
BAD_TEXT = re.compile(r'[{}\[\]<>|=_#@\\]|https?:|\.\.\.\.|\s{2,}')


def sid(prefix, *parts):
    """รหัสคงที่ (≤16 ตัว): ข้อมูลต้นทางเดิม → รหัสเดิมทุกครั้งที่สร้างใหม่ (ความคืบหน้าผู้เรียนไม่หลุด)"""
    return f"{prefix}-{hashlib.sha1('|'.join(parts).encode('utf-8')).hexdigest()[:12]}"


def nfc(s):
    return unicodedata.normalize('NFC', s or '').strip()


def zipf_of(w):
    try:
        return round(wordfreq.zipf_frequency(w, 'en'), 2)
    except Exception:
        return 0.0


def band_of(z):
    if not z: return None
    return 1 if z >= 6 else 2 if z >= 5 else 3 if z >= 4.5 else 4 if z >= 4 else 5 if z >= 3 else 6


# ---------------------------------------------------------------- validators (PART 19)
def valid_thai(t):
    """คำแปลไทย: มีอักษรไทย · ไม่มีอักษรละติน · ยาวพอดี · ไม่มีสัญลักษณ์แปลก"""
    t = nfc(t)
    if not t or not TH_RE.search(t): return None, 'thai_missing_script'
    if LATIN_RE.search(t): return None, 'thai_has_latin'
    if len(t) > 48: return None, 'thai_too_long'
    if BAD_TEXT.search(t) or any(c in t for c in '?!*'): return None, 'thai_bad_chars'
    return t, None


def valid_definition(g):
    g = nfc(g)
    if len(g) < 3: return None, 'definition_missing'
    if len(g) > 260: return None, 'definition_too_long'
    if BAD_TEXT.search(g): return None, 'definition_bad_chars'
    return g, None


def forms_of(lemma):
    """รูปคำที่ยอมให้ปรากฏในประโยคตัวอย่าง (ผันรูปปกติ)"""
    w = lemma.split()[0] if ' ' in lemma else lemma
    base = {w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing', w + 'er', w + 'est', w + 'ly'}
    if w.endswith('e'): base |= {w[:-1] + 'ing', w[:-1] + 'ed'}
    if w.endswith('y'): base |= {w[:-1] + 'ies', w[:-1] + 'ied', w[:-1] + 'ier', w[:-1] + 'iest'}
    if len(w) > 2 and w[-1] not in 'aeiouwxy' and w[-2] in 'aeiou': base |= {w + w[-1] + 'ed', w + w[-1] + 'ing', w + w[-1] + 'er'}
    return base


def valid_example(ex, lemma):
    """ประโยคตัวอย่าง: 4–24 คำ · มีคำนั้น (หรือรูปผัน) · ไม่มี markup · ขึ้นต้นตัวใหญ่/ตัวเลข/เครื่องหมายคำพูด"""
    e = nfc(ex).replace('’', "'").replace('“', '"').replace('”', '"')
    words = e.split()
    if not (4 <= len(words) <= 24): return None, 'example_length'
    if BAD_TEXT.search(e) or not re.match(r'^[A-Z0-9"\']', e): return None, 'example_format'
    if TH_RE.search(e): return None, 'example_script'
    toks = set(re.findall(r"[a-z']+", e.lower()))
    if ' ' in lemma:
        if lemma.split()[0] not in e.lower() and not (forms_of(lemma) & toks): return None, 'example_missing_word'
    elif not (forms_of(lemma) & toks): return None, 'example_missing_word'
    if not re.search(r'[.!?"\']$', e): e += '.'
    return e, None


def rank_thai(cands):
    """เรียงคำแปลไทยตามความถี่ในคลังภาษาไทย (คำที่คนใช้จริงก่อน) · ตัดคำโบราณ/หายากถ้ามีคำที่ใช้บ่อยกว่า"""
    c = list(dict.fromkeys(cands))
    if not TH_FREQ: return c
    f = lambda t: TH_FREQ.get(t, 0) if ' ' not in t else min(TH_FREQ.get(x, 0) for x in t.split())
    c.sort(key=lambda t: -f(t))
    if c and f(c[0]) >= 100: c = [t for t in c if f(t) >= 20 or (len(t) > 4 and f(t) > 0)]
    return c


def content_words(s):
    stop = {'a', 'an', 'the', 'of', 'to', 'or', 'and', 'in', 'on', 'for', 'with', 'by', 'from', 'as', 'at', 'be', 'is', 'that',
            'which', 'one', 'something', 'someone', 'somebody', 'etc', 'used', 'any', 'its', 'it', 'this', 'into', 'not'}
    return {w for w in re.findall(r'[a-z]+', (s or '').lower()) if w not in stop and len(w) > 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--en', required=True); ap.add_argument('--th', required=True); ap.add_argument('--oxford', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--lemmas', type=int, default=20000)
    ap.add_argument('--report', default=None); ap.add_argument('--pilot', type=int, default=2000)
    ap.add_argument('--emit-review', default=None); ap.add_argument('--review-dir', default=None)
    a = ap.parse_args()
    rep = Counter()

    # ---- Oxford (อ้างอิง) ----
    oxford = defaultdict(list)   # lemma -> [sense]
    for line in open(a.oxford, encoding='utf-8'):
        s = json.loads(line)
        head = (s.get('display_form') or s['headword'] or '').strip()
        head = re.sub(r'#\d+$', '', head)
        variants = [v.strip().lower() for v in head.split(',') if v.strip()]
        if not variants: continue
        oxford[variants[0]].append(s)
        rep['oxford_senses'] += 1
    rep['oxford_lemmas'] = len(oxford)

    # ---- Thai Wiktionary (คำไทย → ความหมายอังกฤษ) ----
    th_rev = defaultdict(list)   # (english lemma, pos) -> [thai]
    for line in open(a.th, encoding='utf-8'):
        try: e = json.loads(line)
        except Exception: continue
        tw = nfc(e.get('word'))
        pos = POS_MAP.get(e.get('pos'))
        if not tw or not pos or ' ' in tw or len(tw) > 20: continue
        for s in e.get('senses') or []:
            tags = set(s.get('tags') or [])
            if tags & (SENSITIVE | {'obsolete', 'archaic', 'form-of', 'alt-of', 'slang', 'dialectal', 'Northern', 'Southern', 'Isan'}): continue
            for g in (s.get('glosses') or [])[-1:]:
                for part in re.split(r'[;,]\s*', g):
                    p = part.strip().lower()
                    p = re.sub(r'^to ', '', p) if pos == 'verb' else re.sub(r'^(a|an|the) ', '', p)
                    if WORD_RE.match(p) and len(p.split()) <= 3:
                        th_rev[(p, pos)].append(tw)
    rep['thai_reverse_pairs'] = sum(len(v) for v in th_rev.values())

    # ---- Wiktionary English: รวมทุก entry ของ lemma เดียวกัน ----
    entries = defaultdict(list)
    for line in open(a.en, encoding='utf-8'):
        try: e = json.loads(line)
        except Exception: continue
        w = e['w']
        if w != w.lower() and w.lower() not in oxford: continue     # ชื่อเฉพาะ/ตัวย่อตัวใหญ่ ข้าม (เว้นแต่อยู่ใน Oxford)
        entries[w.lower()].append(e)
    rep['wiktionary_lemmas_raw'] = len(entries)

    # ---- เลือก lemma: ความถี่สูงสุด N คำ + Oxford ทุกคำ + phrasal verb/idiom ที่มีคำแปลไทย ----
    top = []
    seen = set()
    for w in wordfreq.top_n_list('en', 200000):
        if w in entries and WORD_RE.match(w) and w not in seen:
            seen.add(w); top.append(w)
        if len(top) >= a.lemmas: break
    chosen = set(top) | set(oxford)
    multi = [w for w in entries if ' ' in w and w not in chosen]
    for w in multi:
        es = entries[w]
        toks = w.split()
        is_phrasal = any(e['p'] == 'verb' for e in es) and len(toks) in (2, 3) and toks[1] in PARTICLES and toks[0] in chosen
        is_idiom = any(e['p'] in ('phrase', 'prep_phrase', 'adv_phrase') for e in es) and len(toks) <= 5
        has_th = any(e['th'] for e in es)
        z = zipf_of(w)
        if (is_phrasal and (has_th or z >= 3.0)) or (is_idiom and has_th and z >= 2.5):
            chosen.add(w)
    rep['lemmas_chosen'] = len(chosen)

    out_rows = []
    for lemma in sorted(chosen):
        es = entries.get(lemma, [])
        oxs = oxford.get(lemma, [])
        z = zipf_of(lemma)
        toks = lemma.split()
        kind = 'word'
        if len(toks) > 1:
            kind = 'phrasal' if any(e['p'] == 'verb' for e in es) and toks[1] in PARTICLES else 'idiom' if any(e['p'] in ('phrase', 'prep_phrase', 'adv_phrase') for e in es) else 'phrase'
        ipa_uk = ipa_us = audio_uk = audio_us = None
        for e in es:
            for s in e.get('snd') or []:
                t = set(s.get('t') or [])
                if s.get('ipa'):
                    ipa = s['ipa'].strip('/[] ')
                    if not ipa_uk and (t & {'Received-Pronunciation', 'UK', 'British'}): ipa_uk = ipa
                    if not ipa_us and (t & {'General-American', 'US', 'American'}): ipa_us = ipa
                    if not t and not ipa_uk: ipa_uk = ipa
                elif s.get('audio'):
                    if not audio_uk and (t & {'UK', 'Received-Pronunciation', 'British', 'England'}): audio_uk = s['audio']
                    if not audio_us and (t & {'US', 'General-American', 'American'}): audio_us = s['audio']
        senses = []
        lemma_flags = Counter()
        all_th = []
        # (1) Oxford: แถวอ้างอิง — เนื้อหาหลักอยู่ที่ vocab_senses (ไม่คัดลอก)
        ox_pos = set()
        for s in oxs:
            ox_pos.add(s.get('pos'))
            senses.append({'id': None, 'oxford': s['public_id'], 'pos': s.get('pos'), 'cefr': s.get('cefr'),
                           'thai': [s['thai_meaning']] if s.get('thai_meaning') else [],
                           'topics': [OXF_TOPIC[s['topic']]] if s.get('topic') in OXF_TOPIC else [],
                           'source': 'OXFORD', 'license': OXF_LICENSE, 'status': 'autoChecked', 'learnable': bool(s.get('thai_meaning')),
                           'ex_extra': [], 'syn_extra': [], 'ant_extra': []})
            if s.get('thai_meaning'): all_th.append(s['thai_meaning'])
        # (2) Wiktionary senses
        merged_first = set()
        per_pos = Counter()
        for e in es:
            pos = POS_MAP.get(e['p'])
            if not pos: continue
            if kind == 'phrasal' and pos == 'verb': pos = 'phrasal verb'
            if kind == 'idiom' and pos == 'phrase': pos = 'idiom'
            # คำแปลไทยของ entry นี้: [(thai, sense gloss)]
            trans = []
            for t in e.get('th') or []:
                tv, err = valid_thai(t.get('w'))
                if err: rep['thai_rejected_' + err] += 1; continue
                trans.append((tv, t.get('s') or ''))
            used_trans = set()
            for k, s in enumerate(e['S']):
                tags = set(s.get('t') or [])
                if tags & SENSITIVE:
                    rep['senses_sensitive_dropped'] += 1; lemma_flags['sensitive'] += 1; continue
                if tags & SKIP_SENSE:
                    rep['senses_archaic_rare_skipped'] += 1; continue
                gloss, err = valid_definition(s.get('g'))
                if err: rep['definition_rejected_' + err] += 1; continue
                labels = sorted({LABEL_TAGS[x] for x in tags if x in LABEL_TAGS})
                topics = sorted({TOPIC_MAP[x] for x in (s.get('top') or []) if x in TOPIC_MAP} |
                                {t for c in (s.get('cat') or []) + (e.get('cat') or []) for rx, t in CAT_TOPIC if rx.search(c)})
                exs = []
                for x in s.get('ex') or []:
                    ev, err = valid_example(x, lemma)
                    if err: rep['example_rejected_' + err] += 1
                    elif ev not in exs: exs.append(ev)
                syn = [x for x in (s.get('syn') or []) if WORD_RE.match(x.lower()) and x.lower() != lemma][:6]
                ant = [x for x in (s.get('ant') or []) if WORD_RE.match(x.lower()) and x.lower() != lemma][:4]
                # Deduplicate กับ Oxford: ความหมายแรกของชนิดคำที่ Oxford มีแล้ว = ความหมายเดียวกัน → รวมส่วนเสริมเข้าแถว Oxford
                if pos in ox_pos and pos not in merged_first:
                    merged_first.add(pos)
                    tgt = next(x for x in senses if x['oxford'] and x['pos'] == pos)
                    tgt['ex_extra'] += exs[:2]; tgt['syn_extra'] += syn; tgt['ant_extra'] += ant
                    tgt['topics'] = sorted(set(tgt['topics']) | set(topics))
                    tgt['def_wikt'] = gloss
                    rep['duplicates_merged_with_oxford'] += 1
                    continue
                per_pos[pos] += 1
                if per_pos[pos] > (2 if oxs else 5): rep['senses_over_limit_skipped'] += 1; continue
                # คำแปลไทย: จับคู่ความหมายด้วยคำสำคัญที่ซ้อนกัน (sense gloss ของตารางคำแปล ↔ gloss ของความหมาย)
                th = []
                cw = content_words(gloss)
                best = None
                for i, (tv, tsense) in enumerate(trans):
                    if i in used_trans: continue
                    sc = len(cw & content_words(tsense)) / (len(content_words(tsense)) or 1) if tsense else 0
                    if sc >= 0.5 and (best is None or sc > best[0]): best = (sc, i)
                if best:
                    th = [trans[best[1]][0]] + [tv for i, (tv, ts) in enumerate(trans) if ts == trans[best[1]][1] and i != best[1]][:2]
                    for i, (tv, ts) in enumerate(trans):
                        if ts == trans[best[1]][1]: used_trans.add(i)
                    src = 'WIKTIONARY'
                elif k == 0 and len([x for x in trans if not x[1]]) and not any(x['pos'] == pos and x['thai'] for x in senses if not x['oxford']):
                    th = [tv for tv, ts in trans if not ts][:3]; src = 'WIKTIONARY'
                else:
                    src = 'WIKTIONARY'
                # ย้อนทางจากพจนานุกรมไทย: เฉพาะคำที่ไม่มีใน Oxford และเฉพาะความหมายแรกของชนิดคำนั้น (ความหมายหลัก)
                if not th and not oxs and per_pos[pos] == 1 and k == 0 and pos in ('noun', 'verb', 'adjective', 'adverb'):
                    rev = th_rev.get((lemma, pos), [])
                    if rev:
                        th = [x for x, _ in Counter(rev).most_common(6)]; src = 'WIKTIONARY+THAI_WIKTIONARY'
                        rep['thai_from_reverse_dictionary'] += 1
                th = rank_thai(th)[:3]
                # ตัวเลือกคำแปลทั้งหมดที่มีหลักฐานจาก Wiktionary (ใช้ในขั้นตรวจทาน — ผู้ตรวจเลือกได้เฉพาะจากชุดนี้)
                cand = rank_thai(th + [tv for tv, _ in trans] + (th_rev.get((lemma, pos), []) if pos in ('noun', 'verb', 'adjective', 'adverb') else []))[:8]
                flags = []
                if not th: flags.append('missing_thai')
                if not exs: flags.append('missing_example')
                if not (ipa_uk or ipa_us): flags.append('missing_pronunciation')
                if set(labels) & {'archaic', 'dated', 'rare'}: flags.append('low_priority_usage')
                learnable = bool(th) and pos in LEARN_POS and not (set(labels) & {'slang', 'archaic', 'dated', 'rare', 'euphemism'}) and (z >= 2.0 or kind != 'word')
                status = 'autoChecked' if learnable else 'unverified'
                sense_ref = s.get('id') or f'{lemma}|{pos}|{k}|{gloss[:40]}'
                senses.append({'id': sid('WA', lemma, pos, sense_ref), 'oxford': None, 'pos': pos, 'def': gloss, 'thai': th, 'cand': cand,
                               'k': per_pos[pos],
                               'ex': exs[:3], 'syn': syn, 'ant': ant, 'topics': topics, 'labels': labels,
                               'source': src, 'license': WIKT_LICENSE, 'ref': sense_ref, 'status': status,
                               'flags': flags, 'learnable': learnable})
        if not senses:
            rep['lemmas_without_valid_sense'] += 1; continue
        if lemma_flags['sensitive'] and not any(x for x in senses):
            continue
        # Oxford rows: ส่วนเสริมที่ไม่ซ้ำ
        for x in senses:
            if x['oxford']:
                x['ex_extra'] = list(dict.fromkeys(x['ex_extra']))[:2]
                x['syn_extra'] = list(dict.fromkeys(x['syn_extra']))[:6]
                x['ant_extra'] = list(dict.fromkeys(x['ant_extra']))[:4]
        # word family / phrasal verbs ของ lemma
        der = []
        for e in es:
            for d in e.get('der') or []:
                dl = d.lower()
                if dl != lemma and dl in chosen and dl[:4] == lemma[:4] and ' ' not in dl and dl not in der: der.append(dl)
        pv = sorted(w for w in chosen if ' ' in w and w.split()[0] == lemma and len(w.split()) == 2 and w.split()[1] in PARTICLES)[:12]
        # Unique sense ids (กันชนกัน)
        ids = Counter(x['id'] for x in senses if x['id'])
        for x in senses:
            if x['id'] and ids[x['id']] > 1:
                rep['duplicate_sense_ids_fixed'] += 1
                x['id'] = sid('WA', lemma, x['pos'], x['ref'], str(senses.index(x)))
        out_rows.append({'lemma': lemma, 'display': (oxs[0].get('display_form') or oxs[0]['headword']) if oxs and ',' not in oxs[0]['headword'] else lemma,
                         'kind': kind, 'zipf': z or None, 'band': band_of(z), 'ipa_uk': ipa_uk, 'ipa_us': ipa_us,
                         'audio_uk': audio_uk, 'audio_us': audio_us, 'family': der[:10], 'phrasal': pv, 'senses': senses, '_ox': bool(oxs)})
    # ---- ขั้นตรวจทานคำแปล (Verify Thai Translations) ----
    #  * --emit-review: เขียนรายการที่ต้องตรวจ (ความหมายใหม่ + ตัวเลือกคำแปลที่มีหลักฐาน) แล้วจบ
    #  * --review-dir: อ่านผลตรวจ (data/word-atlas/review/*.jsonl) → รับเฉพาะคำแปลที่อยู่ในชุดตัวเลือกเดิม (ไม่รับคำที่ผู้ตรวจแต่งเอง)
    #  คำแปลที่ยังไม่ผ่านการตรวจ "ไม่แสดง" (แสดงเฉพาะนิยามอังกฤษ) และไม่ใช้ทำแบบฝึก
    def review_candidate(r, s):
        return (not s['oxford'] and s['pos'] in LEARN_POS and s['cand'] and (r['zipf'] or 0) >= 2.5
                and s['k'] <= (2 if r.get('_ox') else 3) and not re.search(r'spelling of|alternative form|obsolete form|plural of', s['def'], re.I) and not (set(s['labels']) & {'slang', 'archaic', 'dated', 'rare', 'euphemism'}))
    if a.emit_review:
        items = [{'id': s['id'], 'lemma': r['lemma'], 'pos': s['pos'], 'zipf': r['zipf'], 'def': s['def'], 'ex': (s.get('ex') or [None])[0],
                  'cand': s['cand']} for r in out_rows for s in r['senses'] if review_candidate(r, s)]
        items.sort(key=lambda x: (-(x['zipf'] or 0), x['lemma']))
        with open(a.emit_review, 'w', encoding='utf-8') as f:
            for it in items: f.write(json.dumps(it, ensure_ascii=False) + '\n')
        print('review items:', len(items)); return
    verdicts = {}
    if a.review_dir:
        import glob, os
        for fn in sorted(glob.glob(os.path.join(a.review_dir, '*.jsonl'))):
            for line in open(fn, encoding='utf-8'):
                line = line.strip()
                if not line: continue
                v = json.loads(line); verdicts[v['id']] = v
    rep['review_verdicts_loaded'] = len(verdicts)
    accepted = []
    for r in out_rows:
        for s in r['senses']:
            if s['oxford']: continue
            v = verdicts.get(s['id'])
            s['learnable'] = False
            if v and v.get('verdict') in ('ok', 'fix'):
                pick = [t for t in (v.get('thai') or []) if t in s['cand']]
                if pick and review_candidate(r, s):
                    s['thai'] = pick[:3]; s['status'] = 'autoChecked'; s['source'] += '+REVIEW'
                    s['flags'] = [f for f in s['flags'] if f != 'missing_thai']
                    accepted.append((r['zipf'] or 0, r['lemma'], s)); continue
                rep['review_pick_outside_candidates'] += 1
            if v and v.get('verdict') == 'reject': rep['review_rejected'] += 1; s['flags'].append('review_rejected:' + str(v.get('reason') or '')[:40])
            # ยังไม่ผ่านการตรวจ → ไม่แสดงคำแปลไทย (กันคำแปลผิดหลุดถึงผู้เรียน)
            if s['thai']: s['flags'].append('thai_pending_review')
            s['thai'] = []; s['status'] = 'unverified'
    accepted.sort(key=lambda x: (-x[0], x[1]))
    for i, (_, _, s) in enumerate(accepted):
        if i < a.pilot: s['learnable'] = True
        else: s['flags'].append('phase2_pending')   # คำแปลผ่านการตรวจแล้ว แต่ยังไม่เปิดเป็นแบบฝึก (รอ Phase ถัดไป)
    rep['review_accepted'] = len(accepted)
    rep['pilot_new_learnable'] = min(len(accepted), a.pilot)
    for r in out_rows:
        for s in r['senses']:
            s.pop('cand', None); s.pop('k', None)
        r.pop('_ox', None)
    # อันดับความถี่ภายในคลัง
    for r, row in enumerate(sorted(out_rows, key=lambda x: (-(x['zipf'] or 0), x['lemma'])), start=1):
        row['rank'] = r
    with gzip.open(a.out, 'wt', encoding='utf-8') as f:
        for row in out_rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    # สรุป
    rep['lemmas_out'] = len(out_rows)
    rep['senses_out'] = sum(len(r['senses']) for r in out_rows)
    rep['senses_oxford_linked'] = sum(1 for r in out_rows for s in r['senses'] if s['oxford'])
    rep['senses_new'] = sum(1 for r in out_rows for s in r['senses'] if not s['oxford'])
    rep['senses_new_learnable'] = sum(1 for r in out_rows for s in r['senses'] if not s['oxford'] and s['learnable'])
    rep['senses_new_with_thai'] = sum(1 for r in out_rows for s in r['senses'] if not s['oxford'] and s['thai'])
    rep['senses_new_with_example'] = sum(1 for r in out_rows for s in r['senses'] if not s['oxford'] and s.get('ex'))
    rep['lemmas_with_audio'] = sum(1 for r in out_rows if r['audio_uk'] or r['audio_us'])
    rep['lemmas_with_ipa'] = sum(1 for r in out_rows if r['ipa_uk'] or r['ipa_us'])
    rep['phrases'] = sum(1 for r in out_rows if r['kind'] != 'word')
    rep['learnable_total'] = sum(1 for r in out_rows for s in r['senses'] if s['learnable'])
    print(json.dumps(dict(sorted(rep.items())), indent=1, ensure_ascii=False))
    if a.report: json.dump(dict(sorted(rep.items())), open(a.report, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
