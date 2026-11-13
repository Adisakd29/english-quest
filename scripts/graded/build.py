"""
สร้างคลัง Graded Reading & Listening + ไฟล์เสียง (Kokoro TTS ล่วงหน้า — ฟรี ไม่ใช้บริการภายนอกตอนใช้งาน)
  input : data/graded/drafts/{A1,A2,B1,B2}.json  (ผ่าน services/graded/validator.js + ผู้ตรวจแบบไม่เห็นเฉลยแล้ว)
  output: public/assets/graded/audio/<id>-<hash>.mp3 · data/graded/texts.json
  - ความเร็วตามระดับ: A1 0.85 · A2 0.9 · B1 0.95 · B2 1.0 · ผู้อ่านสลับเสียง/สำเนียง (US/UK) ตามเรื่อง
  - บทสนทนา: บรรทัด "Name: text" — อ่านเฉพาะข้อความ (ไม่อ่านชื่อ) · ผู้พูดคนละเสียง
  - segments = เวลาเริ่ม/จบของแต่ละย่อหน้า (ใช้ไฮไลต์ข้อความตอนฟัง/อ่านตาม)
  - cache ท่อนเสียงใน data/graded/clip-cache (ไม่ต้อง deploy) → แก้บางย่อหน้าแล้วรันใหม่ สังเคราะห์เฉพาะส่วนที่เปลี่ยน
  ใช้: python3 scripts/graded/build.py
"""
import hashlib, json, os, re, subprocess, sys, tempfile, time
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DRAFTS = os.path.join(ROOT, 'data', 'graded', 'drafts')
CACHE = os.path.join(ROOT, 'data', 'graded', 'clip-cache')
OUTDIR = os.path.join(ROOT, 'public', 'assets', 'graded', 'audio')
GEN = 'kokoro-v1.0/graded-v1'
SR = 24000
VOICES = {'af_heart': 'en-us', 'am_michael': 'en-us', 'bf_emma': 'en-gb', 'bm_george': 'en-gb'}
NARRATORS = ['af_heart', 'bm_george', 'bf_emma', 'am_michael']
DIALOGUE_PAIRS = [('af_heart', 'am_michael'), ('bm_george', 'bf_emma')]
SPEED = {'A1': 0.85, 'A2': 0.9, 'B1': 0.95, 'B2': 1.0}
# เรื่องที่เพิ่มภายหลัง: กำหนดผู้อ่านตายตัว และไม่นับในลำดับสลับเสียง → เรื่องเดิมได้เสียงเดิม (ไม่ต้องสังเคราะห์ใหม่ทั้งคลัง)
FIXED_NARRATOR = {'A2-07': 'af_heart'}

ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
def two(n): return ONES[n] if n < 20 else TENS[n // 10] + ('-' + ONES[n % 10] if n % 10 else '')
def year(n):
    a, b = divmod(n, 100)
    if 2000 <= n < 2010: return 'two thousand' + (' ' + ONES[b] if b else '')
    return two(a) + ' ' + ('hundred' if b == 0 else ('oh ' + ONES[b] if b < 10 else two(b)))
def speech(text):
    t = re.sub(r'\b(1[89]\d\d|20\d\d)\b(?![,.]\d)', lambda m: year(int(m.group(1))), text)
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
def clip(text, voice, speed):
    h = hashlib.sha1(json.dumps([GEN, text, voice, speed]).encode()).hexdigest()[:16]
    p = os.path.join(CACHE, f'{h}.npy')
    if os.path.exists(p): return np.load(p)
    a, sr = kokoro().create(text, voice=voice, speed=speed, lang=VOICES[voice])
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

LINE = re.compile(r'^\s*([A-Z][A-Za-z .\'-]{0,24}):\s*(.+)$')
def lines_of(t, para):
    """คืน [(ข้อความที่อ่าน, เสียง)] ของย่อหน้า"""
    if t['kind'] != 'dialogue':
        return [(para, None)]
    out = []
    for ln in [x for x in para.split('\n') if x.strip()]:
        m = LINE.match(ln)
        out.append((m.group(2), m.group(1).strip()) if m else (ln, None))
    return out

def build():
    os.makedirs(OUTDIR, exist_ok=True)
    texts = []
    for lvl in ['A1', 'A2', 'B1', 'B2']:
        texts += json.load(open(os.path.join(DRAFTS, f'{lvl}.json')))
    out = []; t0 = time.time()
    rot = 0
    for idx, t in enumerate(texts):
        speed = SPEED[t['level']]
        narrator = FIXED_NARRATOR.get(t['id']) or NARRATORS[rot % len(NARRATORS)]
        pair = DIALOGUE_PAIRS[rot % len(DIALOGUE_PAIRS)]
        if t['id'] not in FIXED_NARRATOR: rot += 1
        speakers = {}
        parts = []; segs = []; cur = 0.0
        title = clip(speech(t['title'] + '.'), narrator, speed)
        parts += [title, sil(0.9)]; cur += len(title) / SR + 0.9
        for k, para in enumerate(t['paragraphs']):
            start = cur
            for j, (txt, who) in enumerate(lines_of(t, para)):
                v = narrator
                if who is not None:
                    if who not in speakers: speakers[who] = pair[len(speakers) % 2]
                    v = speakers[who]
                a = clip(speech(txt), v, speed)
                parts.append(a); cur += len(a) / SR
                parts.append(sil(0.35)); cur += 0.35
            segs.append({'k': k, 'start': round(start, 2), 'end': round(cur - 0.35, 2)})
            if k < len(t['paragraphs']) - 1: parts.append(sil(0.6)); cur += 0.6
        parts.append(sil(0.5)); audio = np.concatenate(parts)
        h = hashlib.sha1(json.dumps([GEN, t['title'], t['paragraphs'], narrator, speakers, speed]).encode()).hexdigest()[:10]
        fname = f"{t['id']}-{h}.mp3"
        if not os.path.exists(os.path.join(OUTDIR, fname)):
            for old in [f for f in os.listdir(OUTDIR) if f.startswith(t['id'] + '-')]: os.unlink(os.path.join(OUTDIR, old))
            encode(audio, os.path.join(OUTDIR, fname))
        voices = {'narrator': {'voice': narrator, 'accent': 'uk' if VOICES[narrator] == 'en-gb' else 'us'}}
        if speakers: voices['speakers'] = {s: {'voice': v, 'accent': 'uk' if VOICES[v] == 'en-gb' else 'us'} for s, v in speakers.items()}
        item = dict(t)
        item['words'] = sum(len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’-]*", p)) for p in t['paragraphs'])
        item['audio'] = {'url': f'/assets/graded/audio/{fname}', 'duration': round(len(audio) / SR, 2), 'speed': speed, 'segments': segs, 'voices': voices}
        item['version'] = hashlib.sha1(json.dumps([t, fname], sort_keys=True).encode()).hexdigest()[:12]
        out.append(item)
        print(f"[{idx + 1}/{len(texts)}] {t['id']} {item['audio']['duration']}s · {time.time() - t0:.0f}s", flush=True)
    json.dump({'generation': GEN, 'note': 'Original EnglishQuest graded texts (A1–B2). Validator + blind solve review: all questions match key. Audio: Kokoro TTS.',
               'texts': out}, open(os.path.join(ROOT, 'data', 'graded', 'texts.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', len(out))

if __name__ == '__main__':
    build()
