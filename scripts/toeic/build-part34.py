"""
สร้างคลังข้อ TOEIC-style Listening Part 3 (Conversations) / Part 4 (Talks) + ไฟล์เสียง (Kokoro TTS ล่วงหน้า)
  input : data/toeic/part{3,4}/source.json  (ผ่าน validator + ตรวจแบบไม่เห็นเฉลยแล้ว)
  output: public/assets/toeic/p{3,4}/audio/P{3,4}-xxxx-<hash>.mp3 · data/toeic/part{3,4}/bank.json
  - Part 3: ผู้พูดแต่ละคนคนละเสียง (ชาย/หญิงตาม speakers · ผู้พูดเพศเดียวกัน 2 คน = คนละสำเนียง) · เว้น 0.45 วิระหว่างช่วงพูด
  - Part 4: ผู้พูดคนเดียว · เว้น 0.7 วิระหว่างย่อหน้า · สลับสำเนียง US/UK ตามชุด
  - ข้อความที่ส่งให้ TTS ผ่านการแปลงเป็นคำพูด (เบอร์โทร 555-0148 → five five five, zero one four eight · ปี 1872 → eighteen seventy-two · % → percent)
    ข้อความที่แสดงบนจอ (transcript) คงเดิม
  - segments = เวลาเริ่ม/จบของแต่ละช่วงพูด (ใช้ไฮไลต์ transcript ตอนฟังซ้ำ)
  - cache ท่อนเสียงใน data/toeic/part34-clip-cache (ไม่ต้อง deploy) → แก้ข้อความบางช่วงแล้วรันใหม่ สังเคราะห์เฉพาะช่วงที่เปลี่ยน
  ใช้: python3 scripts/toeic/build-part34.py [3|4]
"""
import hashlib, json, os, re, subprocess, sys, tempfile, time
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.path.join(ROOT, 'data', 'toeic', 'part34-clip-cache')
GEN = 'kokoro-v1.0-int8/p34-v1'
SR = 24000
VOICES = {'af_heart': 'en-us', 'af_bella': 'en-us', 'am_michael': 'en-us', 'am_fenrir': 'en-us',
          'bf_emma': 'en-gb', 'bf_isabella': 'en-gb', 'bm_george': 'en-gb', 'bm_fable': 'en-gb'}
POOL = {('male', 'us'): ['am_michael', 'am_fenrir'], ('male', 'uk'): ['bm_george', 'bm_fable'],
        ('female', 'us'): ['af_heart', 'af_bella'], ('female', 'uk'): ['bf_emma', 'bf_isabella']}
ACC = lambda v: 'uk' if VOICES[v] == 'en-gb' else 'us'

ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
def two(n): return ONES[n] if n < 20 else TENS[n // 10] + ('-' + ONES[n % 10] if n % 10 else '')
def year(n):
    a, b = divmod(n, 100)
    if 2000 <= n < 2010: return 'two thousand' + (' ' + ONES[b] if b else '')
    return two(a) + ' ' + ('hundred' if b == 0 else ('oh ' + ONES[b] if b < 10 else two(b)))
def speech(text):
    t = re.sub(r'\b(\d{3})-(\d{4})\b', lambda m: ' '.join(ONES[int(c)] for c in m.group(1)) + ', ' + ' '.join(ONES[int(c)] for c in m.group(2)), text)
    t = re.sub(r'\b(1[89]\d\d|20\d\d)\b(?![,.]\d)', lambda m: year(int(m.group(1))), t)
    t = re.sub(r'(\d)\s*%', r'\1 percent', t)
    return t

_k = None
def kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        d = os.environ.get('KOKORO_DIR', '/home/claude/ttswork')
        _k = Kokoro(os.path.join(d, 'kokoro.onnx'), os.path.join(d, 'voices-v1.0.bin'))
    return _k
def clip(text, voice):
    h = hashlib.sha1(json.dumps([GEN, text, voice]).encode()).hexdigest()[:16]
    p = os.path.join(CACHE, f'{h}.npy')
    if os.path.exists(p): return np.load(p)
    a, sr = kokoro().create(text, voice=voice, speed=1.0, lang=VOICES[voice])
    a = a.astype(np.float32)
    nz = np.where(np.abs(a) > 0.01)[0]
    if len(nz): a = a[max(0, nz[0] - 240): nz[-1] + 480]
    os.makedirs(CACHE, exist_ok=True); np.save(p, a)
    return a
sil = lambda s: np.zeros(int(SR * s), dtype=np.float32)
def encode(audio, out):
    audio = audio * (0.89 / (float(np.max(np.abs(audio))) or 1.0))
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, audio, SR)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '64k', '-af', 'afade=t=in:d=0.02', out], check=True)
        os.unlink(t.name)

def cast(p, idx):
    """กำหนดเสียงต่อผู้พูด: สำเนียงหลักสลับตามชุด · เพศเดียวกัน 2 คน = คนละสำเนียง"""
    base = 'us' if idx % 2 == 0 else 'uk'
    out = {}; used = set()
    for k, s in enumerate(p['speakers']):
        same = [x for x in p['speakers'][:k] if x['gender'] == s['gender']]
        acc = base if not same else ('uk' if base == 'us' else 'us')
        if p['part'] == 3 and k == 1 and not same and idx % 3 == 1: acc = 'uk' if base == 'us' else 'us'   # ผสมสำเนียงในบทสนทนาบางชุด
        pool = POOL[(s['gender'], acc)]
        v = next((x for x in pool[(idx // 2) % 2:] + pool if x not in used), pool[0])
        used.add(v); out[s['id']] = v
    return out

def build(part):
    data = os.path.join(ROOT, 'data', 'toeic', f'part{part}')
    outdir = os.path.join(ROOT, 'public', 'assets', 'toeic', f'p{part}', 'audio')
    os.makedirs(outdir, exist_ok=True)
    src = json.load(open(os.path.join(data, 'source.json')))
    bank = []; t0 = time.time()
    gap = 0.45 if part == 3 else 0.7
    for idx, p in enumerate(src):
        pid = f'P{part}-{idx + 1:04d}'
        voices = cast(p, idx)
        parts = []; segs = []; t = 0.0
        for k, turn in enumerate(p['turns']):
            a = clip(speech(turn['text']), voices[turn['speaker']])
            segs.append({'k': k, 'speaker': turn['speaker'], 'start': round(t, 2), 'end': round(t + len(a) / SR, 2)})
            parts += [a]; t += len(a) / SR
            if k < len(p['turns']) - 1: parts.append(sil(gap)); t += gap
        parts.append(sil(0.6)); audio = np.concatenate(parts)
        h = hashlib.sha1(json.dumps([GEN, [x['text'] for x in p['turns']], voices]).encode()).hexdigest()[:10]
        fname = f'{pid}-{h}.mp3'
        if not os.path.exists(os.path.join(outdir, fname)):
            for old in [f for f in os.listdir(outdir) if f.startswith(pid + '-')]: os.unlink(os.path.join(outdir, old))
            encode(audio, os.path.join(outdir, fname))
        item = {k: v for k, v in p.items() if k != 'id'}
        audio_meta = {'url': f'/assets/toeic/p{part}/audio/{fname}', 'duration': round(len(audio) / SR, 2), 'segments': segs,
                      'voices': {sid: {'voice': v, 'accent': ACC(v)} for sid, v in voices.items()}}
        entry = {'id': pid, 'draftId': p['id'], 'part': part, 'type': 'conversation' if part == 3 else 'talk',
                 'category': (f"{len(p['speakers'])}-speakers" if part == 3 else p['talkType']), **item, 'audio': audio_meta}
        entry['version'] = hashlib.sha1(json.dumps([item, fname], sort_keys=True).encode()).hexdigest()[:12]
        bank.append(entry)
        print(f'[P{part} {idx + 1}/{len(src)}] {pid} {audio_meta["duration"]}s · {time.time() - t0:.0f}s', flush=True)
    json.dump({'part': part, 'generation': GEN, 'note': f'Original EnglishQuest TOEIC-style Part {part} sets (not ETS). Blind solve review: all questions match key. Audio: Kokoro TTS.',
               'sets': bank}, open(os.path.join(data, 'bank.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', part, len(bank))

if __name__ == '__main__':
    for part in ([int(sys.argv[1])] if len(sys.argv) > 1 else [3, 4]): build(part)
