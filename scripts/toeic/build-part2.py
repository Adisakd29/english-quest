"""
สร้างคลังข้อ TOEIC-style Listening Part 2 (Question–Response) + ไฟล์เสียง (Kokoro TTS ล่วงหน้า)
  input : data/toeic/part2/source.json   (เนื้อหาที่ผ่านการตรวจแล้ว · ไม่มีเสียง)
  output: public/assets/toeic/p2/audio/P2-xxxx-v{0,1}-<hash>.mp3 · data/toeic/part2/bank.json · data/toeic/part2/clip-cache/
  - สังเคราะห์ทีละท่อน (คำถาม / ตัวอักษร / คำตอบ) ครั้งเดียว แล้วประกอบเป็น 2 variant (ลำดับคำตอบต่างกัน) → ไม่ต้องสังเคราะห์ซ้ำ
  - ผู้ถามและผู้ตอบเป็นคนละเสียง (ต่างเพศ · สลับสำเนียง US/UK ตามข้อ)
  - cache ด้วย hash(ข้อความ+เสียง+ความเร็ว+เวอร์ชัน) → ข้อความไม่เปลี่ยน = ไม่สร้างใหม่ · หยุดกลางทางแล้วรันต่อได้
  ใช้: KOKORO_DIR=/home/claude/ttswork python3 scripts/toeic/build-part2.py
"""
import hashlib, json, os, subprocess, sys, tempfile, time
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data', 'toeic', 'part2')
OUTDIR = os.path.join(ROOT, 'public', 'assets', 'toeic', 'p2', 'audio')
URLDIR = '/assets/toeic/p2/audio'
CACHE = os.path.join(DATA, 'clip-cache')
GEN = 'kokoro-v1.0-int8/p2-v1'
SR = 24000
SPEED = 1.0
VOICES = {  # ตรงกับ config/toeic.js
  'af_heart': ('us', 'female', 'en-us'), 'am_michael': ('us', 'male', 'en-us'), 'af_bella': ('us', 'female', 'en-us'), 'am_fenrir': ('us', 'male', 'en-us'),
  'bf_emma': ('uk', 'female', 'en-gb'), 'bm_george': ('uk', 'male', 'en-gb'), 'bf_isabella': ('uk', 'female', 'en-gb'), 'bm_fable': ('uk', 'male', 'en-gb'),
}
PAIRS = [('am_michael', 'bf_emma'), ('bf_isabella', 'am_fenrir'), ('af_heart', 'bm_george'), ('bm_fable', 'af_bella'),
         ('am_fenrir', 'af_heart'), ('bf_emma', 'bm_fable'), ('af_bella', 'am_michael'), ('bm_george', 'bf_isabella')]
ORDERS = [[0, 1, 2], [2, 0, 1]]       # v1 หมุนตำแหน่งคำตอบ
P_AFTER_PROMPT, P_AFTER_LETTER, P_BETWEEN, TAIL = 1.0, 0.25, 1.3, 0.6

_k = None
def kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        d = os.environ.get('KOKORO_DIR', '/home/claude/ttswork')
        _k = Kokoro(os.path.join(d, 'kokoro.onnx'), os.path.join(d, 'voices-v1.0.bin'))
    return _k

def clip(text, voice):
    h = hashlib.sha1(json.dumps([GEN, text, voice, SPEED]).encode()).hexdigest()[:16]
    p = os.path.join(CACHE, f'{h}.npy')
    if os.path.exists(p):
        return np.load(p)
    a, sr = kokoro().create(text, voice=voice, speed=SPEED, lang=VOICES[voice][2])
    assert sr == SR
    a = a.astype(np.float32)
    # ตัดเงียบหัวท้าย (ให้ช่วงเว้นสม่ำเสมอ)
    nz = np.where(np.abs(a) > 0.01)[0]
    if len(nz): a = a[max(0, nz[0] - 240): nz[-1] + 480]
    os.makedirs(CACHE, exist_ok=True)
    np.save(p, a)
    return a

sil = lambda s: np.zeros(int(SR * s), dtype=np.float32)

def encode(audio, out):
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * (0.89 / peak)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, audio, SR)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '64k', '-af', 'afade=t=in:d=0.02', out], check=True)
        os.unlink(t.name)
    return os.path.getsize(out)

def main():
    src = json.load(open(os.path.join(DATA, 'source.json')))
    os.makedirs(OUTDIR, exist_ok=True)
    bank = []
    t0 = time.time()
    for idx, q in enumerate(src):
        pid = f'P2-{idx + 1:04d}'
        pv, rv = PAIRS[idx % len(PAIRS)]
        prompt = clip(q['prompt'], pv)
        letters = [clip(f'{L}.', rv) for L in 'ABC']
        resp = [clip(r['text'], rv) for r in q['responses']]
        variants = []
        for vi, order in enumerate(ORDERS):
            parts = [prompt, sil(P_AFTER_PROMPT)]
            t = sum(len(p) for p in parts) / SR
            segs = [{'letter': 'Q', 'start': 0, 'end': round(len(prompt) / SR, 2)}]
            for k, i in enumerate(order):
                start = t
                c = [letters[k], sil(P_AFTER_LETTER), resp[i]]
                d = sum(len(x) for x in c) / SR
                parts += c; t += d
                segs.append({'letter': 'ABC'[k], 'start': round(start, 2), 'end': round(t, 2)})
                g = P_BETWEEN if k < 2 else TAIL
                parts.append(sil(g)); t += g
            audio = np.concatenate(parts)
            h = hashlib.sha1(json.dumps([GEN, q['prompt'], [q['responses'][i]['text'] for i in order], pv, rv]).encode()).hexdigest()[:10]
            fname = f'{pid}-v{vi}-{h}.mp3'
            out = os.path.join(OUTDIR, fname)
            if not os.path.exists(out):
                for old in [f for f in os.listdir(OUTDIR) if f.startswith(f'{pid}-v{vi}-')]: os.unlink(os.path.join(OUTDIR, old))
                encode(audio, out)
            correct = 'ABC'[order.index(next(j for j, r in enumerate(q['responses']) if r['isCorrect']))]
            variants.append({'v': vi, 'order': order, 'correctOption': correct,
                             'speakers': {'prompt': {'voice': pv, 'accent': VOICES[pv][0], 'gender': VOICES[pv][1]},
                                          'response': {'voice': rv, 'accent': VOICES[rv][0], 'gender': VOICES[rv][1]}},
                             'audio': {'url': f'{URLDIR}/{fname}', 'duration': round(len(audio) / SR, 2), 'segments': segs, 'bytes': os.path.getsize(out)}})
        item = {k: v for k, v in q.items() if k != 'id'}
        bank.append({'id': pid, 'draftId': q['id'], 'part': 2, 'type': 'question-response', **item, 'variants': variants,
                     'version': hashlib.sha1(json.dumps([item, [v['audio']['url'] for v in variants]], sort_keys=True).encode()).hexdigest()[:12]})
        print(f'[{idx + 1}/{len(src)}] {pid} {variants[0]["audio"]["duration"]}s · {time.time() - t0:.0f}s', flush=True)
    json.dump({'part': 2, 'generation': GEN, 'note': 'Original EnglishQuest TOEIC-style items (not ETS). Writers x6 + blind solve review x2: 150/150 match key. Audio: Kokoro TTS.',
               'questions': bank}, open(os.path.join(DATA, 'bank.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', len(bank))

if __name__ == '__main__':
    main()
