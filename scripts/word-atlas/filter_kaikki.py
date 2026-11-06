# อ่าน kaikki English JSONL จาก stdin → เก็บเฉพาะฟิลด์ที่ใช้ (CC BY-SA 4.0 / GFDL — Wiktionary via wiktextract)
import sys, json, re
OK = re.compile(r"^[A-Za-z][A-Za-z'\- ]{0,38}$")
POS_KEEP = {'noun','verb','adj','adv','prep','conj','pron','det','intj','phrase','prep_phrase','num','particle','article','adv_phrase','proverb','contraction'}
out = sys.stdout; n = k = 0
for line in sys.stdin:
    n += 1
    try: e = json.loads(line)
    except Exception: continue
    if e.get('lang_code') != 'en': continue
    w = e.get('word') or ''
    if not OK.match(w) or len(w.split()) > 4: continue
    pos = e.get('pos')
    if pos not in POS_KEEP: continue
    senses = []
    for s in e.get('senses') or []:
        if s.get('form_of') or s.get('alt_of'): continue
        tags = s.get('tags') or []
        if 'form-of' in tags or 'alt-of' in tags or 'misspelling' in tags: continue
        gl = s.get('glosses') or []
        if not gl: continue
        ex = [x.get('text') for x in (s.get('examples') or []) if x.get('text') and x.get('type') != 'quotation' and not x.get('ref')][:3]
        senses.append({'g': gl[-1][:300], 't': tags[:8], 'ex': ex, 'syn': [x.get('word') for x in (s.get('synonyms') or []) if x.get('word')][:8],
                       'ant': [x.get('word') for x in (s.get('antonyms') or []) if x.get('word')][:6],
                       'top': [x for x in (s.get('topics') or [])][:5], 'cat': [x.get('name') for x in (s.get('categories') or []) if isinstance(x, dict) and x.get('kind') in ('topical', 'lifeform', 'place')][:6], 'id': s.get('id') or s.get('senseid')})
    if not senses: continue
    snd = []
    for x in e.get('sounds') or []:
        if x.get('ipa'): snd.append({'ipa': x['ipa'], 't': x.get('tags') or []})
        elif x.get('mp3_url') or x.get('ogg_url'): snd.append({'audio': x.get('mp3_url') or x.get('ogg_url'), 't': x.get('tags') or [], 'f': x.get('audio')})
    th = [{'w': x.get('word'), 's': x.get('sense')} for x in (e.get('translations') or []) if x.get('code') == 'th' and x.get('word')]
    rec = {'w': w, 'p': pos, 'S': senses, 'snd': snd[:12], 'th': th[:20],
           'syn': [x.get('word') for x in (e.get('synonyms') or []) if x.get('word')][:12],
           'ant': [x.get('word') for x in (e.get('antonyms') or []) if x.get('word')][:8],
           'der': [x.get('word') for x in (e.get('derived') or []) if x.get('word') and ' ' not in x.get('word','')][:15],
           'et': (e.get('etymology_number') or 0), 'cat': [x.get('name') for x in (e.get('categories') or []) if isinstance(x, dict) and x.get('kind') in ('topical', 'lifeform', 'place')][:8]}
    out.write(json.dumps(rec, ensure_ascii=False) + '\n'); k += 1
    if n % 200000 == 0: sys.stderr.write(f'{n} {k}\n'); sys.stderr.flush()
sys.stderr.write(f'DONE {n} {k}\n')
